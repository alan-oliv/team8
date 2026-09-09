import { execFile } from 'node:child_process';
import { BRIEF_WINDOW_MIN, briefHasMaterial, briefPrompt, briefSignature, parseBrief } from '../shared/brief';
import type { Agent, Brief, Task } from '../shared/domain';
import { logError } from './log';

/**
 * A tier name, not a model id: this is the one call the console makes on its
 * own behalf, and the cheapest tier is the whole reason it is affordable to
 * re-run on every task-state change.
 */
export const BRIEF_MODEL = 'haiku';
const TIMEOUT_MS = 90_000;

/**
 * The shortest gap between two automatic runs. The signature below moves
 * whenever an agent changes state, which on a busy team is often; measured, a
 * run costs ~$0.005 warm, so an unbounded trigger is a real bill. Sixty seconds
 * keeps the panel current enough to trust and the spend bounded.
 *
 * The operator's own request is never subject to it.
 */
export const MIN_GAP_MS = 60_000;

export interface BriefInput { agents: Agent[]; tasks: Task[] }

export interface BriefRun {
  text: string;
  model: string;
  in: number;
  out: number;
  costUsd: number;
}

/**
 * The console has no API client and no key of its own: it runs inside a Claude
 * Code installation, so `claude -p` is the model access it already has, under
 * whatever auth the operator is already using. `--tools ''` keeps it a single
 * completion over the material it was handed: a brief that could go and read
 * the repo would make claims that are not in any agent's wall, which is the one
 * promise the panel's own footer makes.
 */
async function runClaude(prompt: string): Promise<BriefRun> {
  const stdout = await new Promise<string>((resolve, reject) => {
    const child = execFile(
      'claude',
      ['-p', prompt, '--model', BRIEF_MODEL, '--tools', '', '--output-format', 'json'],
      {
        timeout: TIMEOUT_MS,
        maxBuffer: 4 * 1024 * 1024,
        // Measured: extended thinking spends ~445 tokens and 4.4s of API time
        // deliberating over three paragraphs, for no gain in the text. Off, the
        // call drops from 6.8s to 2.4s and from $0.015 to $0.005 warm.
        env: { ...process.env, MAX_THINKING_TOKENS: '0' },
      },
      (err, out) => (err ? reject(err) : resolve(out)),
    );
    // `claude -p` waits 3 seconds for a prompt on stdin before giving up on it.
    // execFile opens the pipe and never closes it, so every brief would pay
    // that wait; closing it says there is nothing coming.
    child.stdin?.end();
  });
  const raw = JSON.parse(stdout) as {
    result?: unknown;
    is_error?: unknown;
    total_cost_usd?: unknown;
    usage?: {
      input_tokens?: unknown;
      output_tokens?: unknown;
      cache_creation_input_tokens?: unknown;
      cache_read_input_tokens?: unknown;
    };
    modelUsage?: Record<string, unknown>;
  };
  const text = typeof raw.result === 'string' ? raw.result : '';
  if (raw.is_error === true || text === '') throw new Error('claude -p returned no text');
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    text,
    model: Object.keys(raw.modelUsage ?? {})[0] ?? BRIEF_MODEL,
    // Every class of input token, not the bare `input_tokens`: the CLI's own
    // system prompt arrives as cache traffic, so a run that read 44k reports 10
    // on that field alone — a wrong readout rather than a terse one.
    in: num(raw.usage?.input_tokens)
      + num(raw.usage?.cache_creation_input_tokens)
      + num(raw.usage?.cache_read_input_tokens),
    out: num(raw.usage?.output_tokens),
    costUsd: num(raw.total_cost_usd),
  };
}

export interface Briefs {
  current(): Brief | undefined;
  generate(input: BriefInput): Promise<Brief>;
  /**
   * Called from the publish boundary on every frame. Fires a re-run when the
   * state the brief describes has moved under a brief that already exists and
   * somebody is watching — a brief nobody opened is never generated, and one
   * nobody is looking at is never refreshed. Rate-limited to {@link MIN_GAP_MS}.
   */
  observe(input: BriefInput, watched: boolean): void;
}

export function createBriefs(deps: {
  publish: () => void;
  run?: (prompt: string) => Promise<BriefRun>;
  now?: () => number;
  /** Overrides {@link MIN_GAP_MS}; 0 disables the floor (tests). */
  minGapMs?: number;
}): Briefs {
  const run = deps.run ?? runClaude;
  const now = deps.now ?? Date.now;
  const minGapMs = deps.minGapMs ?? MIN_GAP_MS;
  let brief: Brief | undefined;
  let inFlight: Promise<Brief> | null = null;
  let lastRunAt = 0;

  const generate = (input: BriefInput): Promise<Brief> => {
    if (inFlight) return inFlight;
    const signature = briefSignature(input.agents, input.tasks);
    const started = now();
    lastRunAt = started;
    // Keep the previous paragraphs on screen while the new ones are written —
    // the header's age and the `writing…` label already say it is being redone.
    brief = {
      model: brief?.model ?? BRIEF_MODEL,
      generatedAt: brief?.generatedAt ?? started,
      inputs: { transcripts: input.agents.length, tasks: input.tasks.length, windowMin: BRIEF_WINDOW_MIN },
      paragraphs: brief?.paragraphs ?? [],
      usage: brief?.usage ?? { in: 0, out: 0, costUsd: 0 },
      pending: true,
      signature: brief?.signature ?? signature,
    };
    deps.publish();

    inFlight = (async () => {
      try {
        const out = await run(briefPrompt(input.agents, input.tasks, started));
        brief = {
          model: out.model,
          generatedAt: now(),
          inputs: { transcripts: input.agents.length, tasks: input.tasks.length, windowMin: BRIEF_WINDOW_MIN },
          paragraphs: parseBrief(out.text),
          usage: { in: out.in, out: out.out, costUsd: out.costUsd },
          pending: false,
          signature,
        };
      } catch (err) {
        logError('brief', err);
        brief = {
          ...(brief as Brief),
          pending: false,
          // The signature rides along in the spread, so it stays the one the
          // paragraphs on screen were written against — a failed run read
          // nothing and must not claim the task list it was asked about.
          error: (err as Error).message,
        };
      } finally {
        inFlight = null;
        deps.publish();
      }
      return brief as Brief;
    })();
    return inFlight;
  };

  return {
    current: () => brief,
    generate,
    observe(input, watched) {
      // A console nobody has open never generates one — that is what bounds the
      // spend. But an OPEN console writes its first brief itself: there is no
      // regenerate control any more, so waiting to be asked would leave the
      // panel permanently empty.
      if (!watched) return;
      if (!brief) {
        if (briefHasMaterial(input.agents, input.tasks, now())) void generate(input);
        return;
      }
      if (brief.pending) return;
      if (brief.signature === briefSignature(input.agents, input.tasks)) return;
      // Below the floor the panel still SAYS it is behind — `briefIsStale` reads
      // the same signature — so a suppressed run is visible, not silent.
      if (now() - lastRunAt < minGapMs) return;
      void generate(input);
    },
  };
}
