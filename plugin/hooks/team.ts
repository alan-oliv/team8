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

export function decidedMode(messages: readonly { toolUses?: readonly { input?: unknown }[] }[]): Mode | undefined {
  let found: Mode | undefined;
  for (const message of messages) for (const use of message.toolUses ?? []) found = modeIn(use.input) ?? found;
  return found;
}

export type Progress = { completed: number; total: number; pct: number };

export function progress(tasks: readonly Task[]): Progress {
  const completed = tasks.filter((t) => t.status === 'completed').length;
  return { completed, total: tasks.length, pct: tasks.length ? Math.round((100 * completed) / tasks.length) : 0 };
}

export type Health = { ok?: boolean };
export type ConsoleLink = { href: string; label: string };

const CONSOLE = '127.0.0.1:4823';

export function consoleLink(health: Health | undefined, sessionId: string): ConsoleLink | undefined {
  if (!health?.ok || !sessionId) return undefined;
  return { href: `http://${CONSOLE}/s/${sessionId}`, label: `${CONSOLE}/s/${sessionId.slice(0, 8)}` };
}
