// The band's rules, kept free of Claude Code imports so vitest and the repo's
// typecheck can load them; team8.tsx is the module around them.
// No relative imports either: Claude Code wants `./x.ts`, which tsc refuses.

export type Task = { id: string; status: string };
export type Mode = 'solo' | 'subagents' | 'teammates' | 'workflow';

const RUN_LOG = 'docs/team8/runs/';
// The console's rule (src/server/index.ts, lastDecidedMode): the dash after the
// word tells a filled run log from the template's `mode: solo | subagents …`.
const DECIDED = /mode: (solo|subagents|teammates|workflow) —/g;

// Only a Write or Edit of a run log counts, so a plan or a spec that quotes a
// mode line, or names the run-log folder, decides nothing.
export function modeIn(input: unknown): Mode | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const { file_path, content, new_string } = input as Record<string, unknown>;
  if (typeof file_path !== 'string' || !file_path.includes(RUN_LOG)) return undefined;
  const text = typeof content === 'string' ? content : typeof new_string === 'string' ? new_string : '';
  let found: Mode | undefined;
  for (const m of text.matchAll(DECIDED)) found = m[1] as Mode;
  return found;
}

export type Phase = 'spec' | 'planning';
export type Stage = { phase?: Phase; mode?: Mode };

// A Skill call's `skill`, a typed `/team8:plan`, or the `<command-name>` the
// transcript keeps for it; a prompt that only mentions a skill starts nothing.
const SKILL = /(?:^\/?|<command-name>\/)team8:(plan|tasks|run)\b/;
const PLANS = 'docs/team8/plans/';

export function skillIn(input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const { skill, text } = input as Record<string, unknown>;
  const said = typeof skill === 'string' ? skill : typeof text === 'string' ? text : '';
  return SKILL.exec(said)?.[1];
}

// team8:plan opens a new batch at the spec; the plan file, or a straight
// team8:tasks or team8:run, is planning; the run log's mode outranks both.
export function stageAfter(stage: Stage, input: unknown): Stage {
  const skill = skillIn(input);
  if (skill === 'plan') return { phase: 'spec' };
  const { file_path } = (input ?? {}) as Record<string, unknown>;
  if (skill || (typeof file_path === 'string' && file_path.includes(PLANS))) return { ...stage, phase: 'planning' };
  const mode = modeIn(input);
  return mode ? { ...stage, mode } : stage;
}

export function stageOf(messages: readonly { role?: string; text?: string; toolUses?: readonly { input?: unknown }[] }[]): Stage {
  let stage: Stage = {};
  for (const message of messages) {
    if (message.role === 'user') stage = stageAfter(stage, { text: message.text });
    for (const use of message.toolUses ?? []) stage = stageAfter(stage, use.input);
  }
  return stage;
}

export type Progress = { completed: number; total: number };

export function progress(tasks: readonly Task[]): Progress {
  return { completed: tasks.filter((t) => t.status === 'completed').length, total: tasks.length };
}

export const isDone = (p: Progress) => p.total > 0 && p.completed === p.total;

const CELLS = 20;

export function bar(p: Progress): { filled: string; empty: string } {
  const n = p.total ? Math.floor((CELLS * p.completed) / p.total) : 0;
  return { filled: '▰'.repeat(n), empty: '▱'.repeat(CELLS - n) };
}

export function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor(s / 60) % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (h) return `${h}h${pad(m)}m`;
  if (m) return `${m}m${pad(s % 60)}s`;
  return `${s}s`;
}

export type Health = { ok?: boolean };
export type ConsoleLink = { href: string; label: string };

const CONSOLE = '127.0.0.1:4823';

export function consoleLink(health: Health | undefined, sessionId: string): ConsoleLink | undefined {
  if (!health?.ok || !sessionId) return undefined;
  return { href: `http://${CONSOLE}/s/${sessionId}`, label: `${CONSOLE}/s/${sessionId.slice(0, 8)}` };
}
