import type { Store, StoredEvent } from '../store';
import type { TaskPayload, TaskRemovedPayload } from '../project';
import { holdMsFor, type HeldPermit, type Permits } from '../control/permits';
import { logError } from '../log';
import { readAskContext } from './ask-context';
import type { AskQuestion } from '../../shared/domain';

export const DEFAULT_PERMISSION_TIMEOUT_MS = 600_000;
const SUBAGENT_ID = /^a(.+)-[0-9a-f]{16}$/;
// Executors left alone report progress only when they finish, so the card's
// fill sits at 0% for the whole task; one whose task hasn't moved this long is
// reminded after its next tool call, and at most this often.
export const PROGRESS_STALL_MS = 120_000;

export interface HookResponse {
  status: number;
  body: unknown;
}

export interface HookDeps {
  store: Store;
  permits: Permits;
  permissionTimeoutMs?: number;
  leadName?: string;
  readOnly?: boolean;
  /**
   * The lead's session id, read late: the console can start before any team
   * exists, so the ingest may only learn it once config.json lands.
   */
  leadSessionId?: () => string | undefined;
  /**
   * Read that agent's transcript now. A hook proves the agent just did
   * something, and the transcript is the one thing hooks never carry — so this
   * turns the push channel into a trigger for the pull one, instead of leaving
   * the line to an fs.watch event macOS drops under load.
   */
  onAgentActivity?: (agent: string) => void;
  /** A session ended, by its id. The console decides whether anything is left to watch. */
  onSessionEnd?: (sessionId: string) => void;
  /** The frame changed with no store append: a hold for a session this console is not showing came or went. */
  publish?: () => void;
}

export interface HookHandlers {
  hook(body: unknown, signal?: AbortSignal): Promise<HookResponse>;
  statusline(body: unknown): Promise<HookResponse>;
  substatus(body: unknown): Promise<HookResponse>;
}

type Bag = Record<string, unknown>;

const bagOf = (v: unknown): Bag => (v !== null && typeof v === 'object' ? (v as Bag) : {});
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

export function agentNameFrom(raw: unknown, leadName = 'team-lead'): string {
  const id = str(raw);
  if (!id) return leadName;
  const at = id.indexOf('@');
  if (at > 0) return id.slice(0, at);
  const m = SUBAGENT_ID.exec(id);
  return m ? m[1] : id;
}

// The statusline rate-limit and context-window shapes are not pinned by the
// contract, so both readers below are tolerant: a bare number, or an object
// carrying any of the observed key spellings.
function pctOf(raw: unknown): number | undefined {
  const n = num(raw);
  if (n !== undefined) return n;
  const b = bagOf(raw);
  return num(b.used_pct) ?? num(b.utilization) ?? num(b.percent);
}

function resetOf(raw: unknown): string | undefined {
  const b = bagOf(raw);
  return str(b.resets_at) ?? str(b.reset_at) ?? str(b.resetsAt);
}

export function stalledTask(events: StoredEvent[], agent: string, now: number): TaskPayload | undefined {
  const tasks = new Map<string, { task: TaskPayload; since: number }>();
  for (const ev of events) {
    if (ev.kind === 'task-removed') tasks.delete((ev.payload as TaskRemovedPayload).id);
    if (ev.kind !== 'task') continue;
    const task = ev.payload as TaskPayload;
    const prev = tasks.get(task.id);
    const moved =
      !prev || prev.task.status !== task.status || prev.task.metadata?.progress !== task.metadata?.progress;
    tasks.set(task.id, { task, since: moved ? ev.ts : prev.since });
  }
  for (const { task, since } of tasks.values()) {
    if (task.owner === agent && task.status === 'in_progress' && now - since >= PROGRESS_STALL_MS) return task;
  }
  return undefined;
}

export function createHookHandlers(deps: HookDeps): HookHandlers {
  const { store, permits } = deps;
  const leadName = deps.leadName ?? 'team-lead';
  const remindedAt = new Map<string, number>();
  // A foreign hold carries the lead's name too, so only its own session's
  // hooks — which reach here once that session is the lead — may settle it.
  const ownsHold = (p: HeldPermit, agent: string, sid: string | undefined) =>
    p.agent === agent && (p.session === undefined || p.session === sid);
  const touched = (agent: string) => {
    try {
      deps.onAgentActivity?.(agent);
    } catch (err) {
      logError('drain on hook', err); // never throw into the turn
    }
  };
  /**
   * Holds a PermissionRequest until the operator decides or the hold expires.
   * `session` names a session the console is not showing: the card then rides
   * on the permit rather than this session's log, and index.ts surfaces it
   * once that session is on screen.
   */
  const holdPermission = async (
    b: Bag,
    agent: string,
    toolName: string | undefined,
    signal: AbortSignal | undefined,
    session?: string,
  ): Promise<HookResponse> => {
    // Holding in read-only mode is the worst of both worlds: the card
    // renders with its buttons disabled, /api/permits 409s, and nobody can
    // resolve it, so the agent stalls for the full auto-deny window.
    // Answering with no decision hands the prompt back to Claude Code.
    if (deps.readOnly) return { status: 200, body: {} };

    const timeoutMs = num(b.timeout) ?? deps.permissionTimeoutMs ?? DEFAULT_PERMISSION_TIMEOUT_MS;
    const questions =
      toolName === 'AskUserQuestion' && Array.isArray(bagOf(b.tool_input).questions)
        ? (bagOf(b.tool_input).questions as AskQuestion[])
        : undefined;
    // Only a question with a transcript awaits here, so every other hold
    // still lands its card before hook() first yields.
    const transcriptPath = str(b.transcript_path);
    const context = questions && transcriptPath ? await readAskContext(transcriptPath) : undefined;
    const card = {
      kind: 'permission' as const,
      agent,
      reason: 'permission',
      detail: questions
        ? `AskUserQuestion — ${questions.length} question(s) for you`
        : `${toolName ?? 'unknown'} — awaiting your decision`,
      expiresAt: Date.now() + holdMsFor(timeoutMs),
      ...(questions ? { questions } : {}),
      ...(context ? { context } : {}),
    };
    const held = permits.hold(agent, toolName ?? 'unknown', b.tool_input, timeoutMs, session ? { session, card } : undefined);
    if (session) deps.publish?.();
    else store.append('needsyou', { id: held.id, ...card }, agent);

    // The hook's curl being killed (interrupt, a terminal-side answer, a
    // dying session) closes the request while the hold is still up.
    const onGone = () => permits.withdraw(held.id);
    signal?.addEventListener('abort', onGone, { once: true });
    if (signal?.aborted) onGone();
    const decided = await held.promise;
    signal?.removeEventListener('abort', onGone);
    if (session) deps.publish?.();
    else store.append('needsyou-resolved', { id: held.id }, agent);
    if (decided.decision === 'withdrawn') return { status: 200, body: {} };
    return {
      status: 200,
      body: {
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          decision:
            decided.decision === 'allow'
              ? { behavior: 'allow', ...(decided.updatedInput ? { updatedInput: decided.updatedInput } : {}) }
              : { behavior: 'deny', message: decided.reason ?? '' },
        },
      },
    };
  };

  return {
    async hook(body, signal) {
      // A thrown error or a hang here is a 10-minute stall of the agent's turn,
      // so every path returns 200 and nothing escapes this try.
      try {
        const b = bagOf(body);
        const event = str(b.hook_event_name) ?? '';
        const sid = str(b.session_id);
        const lead = deps.leadSessionId?.();
        // Hooks are user-scope, so every Claude Code session on the machine posts
        // here. A hook with no agent_id is either the lead's or a foreign
        // session's own lead-shaped hooks — only the former belongs to this
        // console. Teammates always carry an agent_id (see agentNameFrom below).
        const foreign = !str(b.agent_id) && !!lead && !!sid && sid !== lead;
        const agent = agentNameFrom(b.agent_id, leadName);
        const toolName = str(b.tool_name);
        // The band in plugin/hooks/team8.tsx calls TaskList every 5s from the lead's process,
        // so these are not the lead working and would fill the hook retention in minutes.
        if (toolName === 'TaskList' && !str(b.agent_id)) return { status: 200, body: {} };
        // A foreign session's permission request is the one hook the console
        // answers for a session it is not showing: held and tagged with that
        // session, and kept off this session's log, so its card surfaces when
        // the operator switches there (see publish in index.ts).
        if (foreign && event === 'PermissionRequest') return holdPermission(b, agent, toolName, signal, sid);
        if (foreign && event !== 'SessionEnd') return { status: 200, body: {} };
        const text = str(b.message) ?? str(b.prompt);
        store.append('hook', { event, agent, toolName, text }, agent);
        if (event === 'SessionEnd' && sid) deps.onSessionEnd?.(sid);
        // Before the hold below, which can await the operator for ten minutes:
        // the transcript explaining why the agent is asking has to be on
        // screen while they decide.
        touched(agent);

        // A held PermissionRequest only clears when the console's own
        // buttons call permits.resolve(). If the operator answers Claude
        // Code's native terminal prompt instead — sitting right at the lead's
        // keyboard rather than the web UI — the tool still runs and this
        // PostToolUse fires, but our hold never hears about it and sits stuck
        // until the auto-deny timer. Treat "the tool already completed" as
        // resolution regardless of how it got answered.
        if (event === 'PostToolUse') {
          for (const permit of permits.list()) {
            if (ownsHold(permit, agent, sid) && permit.toolName === toolName) permits.resolve(permit.id, 'allow');
          }
          const now = Date.now();
          const stalled =
            str(b.agent_id) && !deps.readOnly && now - (remindedAt.get(agent) ?? -Infinity) >= PROGRESS_STALL_MS
              ? stalledTask(store.replay(), agent, now)
              : undefined;
          if (stalled) {
            remindedAt.set(agent, now);
            const progress = stalled.metadata?.progress ?? 0;
            return {
              status: 200,
              body: {
                hookSpecificOutput: {
                  hookEventName: 'PostToolUse',
                  additionalContext: `team8: Task ${stalled.id} has been at ${progress}% for over two minutes. If a step of your plan has landed since, TaskUpdate its metadata.progress to round(100 × steps done ÷ steps); otherwise carry on.`,
                },
              },
            };
          }
        }

        // A new prompt, or the session ending, means no call of this agent is
        // still waiting — it was answered in the terminal, interrupted, or its
        // process is gone — so its holds must not sit until the auto-deny.
        // The foreign-session filter above lets every SessionEnd through, and a
        // foreign one resolves to the lead's name, so it only counts here when
        // it is the lead's own session (or no lead is known yet).
        const sessionOver = event === 'SessionEnd' && (str(b.agent_id) !== undefined || !lead || sid === lead);
        if (event === 'UserPromptSubmit' || sessionOver) {
          for (const permit of permits.list()) if (ownsHold(permit, agent, sid)) permits.withdraw(permit.id);
        }

        if (event !== 'PermissionRequest') return { status: 200, body: {} };
        return holdPermission(b, agent, toolName, signal);
      } catch (err) {
        logError('hook', err);
        return { status: 200, body: {} };
      }
    },

    async statusline(body) {
      try {
        const b = bagOf(body);
        const cost = bagOf(b.cost);
        const window = bagOf(b.context_window);
        const limits = bagOf(b.rate_limits);
        const agent = agentNameFrom(b.agent_id, leadName);
        store.append(
          'statusline',
          {
            totalCostUsd: num(cost.total_cost_usd),
            contextTokens: num(window.used_tokens) ?? num(window.input_tokens),
            contextWindow: num(window.max_tokens) ?? num(window.context_window_size),
            branch: str(b.gitBranch) ?? str(b.branch),
            fiveHourPct: pctOf(limits.five_hour),
            sevenDayPct: pctOf(limits.seven_day),
            resetsAt: resetOf(limits.five_hour),
          },
          agent,
        );
        touched(agent);
      } catch (err) {
        logError('statusline hook', err); // never throw into the turn
      }
      return { status: 200, body: {} };
    },

    async substatus(body) {
      try {
        const b = bagOf(body);
        const tasks = Array.isArray(b.tasks) ? b.tasks : [];
        for (const raw of tasks) {
          const t = bagOf(raw);
          // SCOPE RULE: agent teams only. subagentStatusLine reports a row for
          // EVERY subagent, including Agent-tool subagents and workflow
          // fan-outs. Only in_process_teammate rows are team members — a row
          // with no `type` at all is dropped, not treated as a teammate.
          if (str(t.type) !== 'in_process_teammate') continue;
          const agent = agentNameFrom(t.agentId ?? t.agent_id ?? t.name, leadName);
          store.append(
            'substatus',
            {
              agent,
              tokenCount: num(t.tokenCount),
              contextWindowSize: num(t.contextWindowSize),
              status: str(t.status),
              model: str(t.model),
            },
            agent,
          );
          // The only push signal that names teammates on a contract this repo
          // has verified; /hook's agent_id for teammates is not.
          touched(agent);
        }
      } catch (err) {
        logError('substatus hook', err); // never throw into the turn
      }
      return { status: 200, body: {} };
    },
  };
}
