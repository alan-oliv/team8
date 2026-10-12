// The band's and team pane's rules, kept free of Claude Code imports so vitest
// and the repo's typecheck can load them; team8.tsx is the module around them.
// No relative imports either: Claude Code wants `./x.ts`, which tsc refuses.

export type Task = { id: string; subject: string; status: string; owner?: string; blockedBy: readonly string[] };
export type RosterAgent = { id: string; name?: string; teammateId?: string; status: string };
export type Activity = { text: string; at: number };
export type MemberState = 'working' | 'idle' | 'blocked' | 'failed';
export type Member = {
  id: string;
  name: string;
  state: MemberState;
  taskId?: string;
  needs?: string;
  activity: string;
  at?: number;
};

const ENDED = new Set(['completed', 'killed']);

export function members(roster: readonly RosterAgent[], tasks: readonly Task[], activity: ReadonlyMap<string, Activity>): Member[] {
  const out: Member[] = [];
  for (const a of roster) {
    if (!a.teammateId || !a.name || ENDED.has(a.status)) continue;
    const name = a.name;
    const own = tasks.filter((t) => t.owner === name);
    const claimed = own.find((t) => t.status === 'in_progress');
    const next = own.find((t) => t.status === 'pending');
    const blocked = own.find((t) => t.status === 'pending' && t.blockedBy.length > 0);
    let state: MemberState = a.status === 'failed' ? 'failed' : a.status === 'idle' ? 'idle' : 'working';
    // The console's rule (src/server/project.ts): working, nothing claimed, and
    // a task of its own still waiting on another.
    const needs = state === 'working' && !claimed ? blocked?.blockedBy[0] : undefined;
    if (needs) state = 'blocked';
    const last = activity.get(a.id);
    out.push({
      id: a.id,
      name,
      state,
      taskId: (claimed ?? (needs ? blocked : next))?.id,
      needs,
      activity: needs ? `needs #${needs}` : (last?.text ?? state),
      at: last?.at,
    });
  }
  return out;
}

export function bandDetail(m: Member): string {
  if (m.state === 'working') return m.taskId ? `#${m.taskId}` : 'working';
  return m.needs ? `needs #${m.needs}` : m.state;
}

export type TaskCounts = { completed: number; claimed: number; blocked: number; total: number };

export function taskCounts(tasks: readonly Task[]): TaskCounts {
  let completed = 0;
  let claimed = 0;
  let blocked = 0;
  for (const t of tasks) {
    if (t.status === 'completed') completed += 1;
    else if (t.status === 'in_progress') claimed += 1;
    else if (t.status === 'pending' && t.blockedBy.length > 0) blocked += 1;
  }
  return { completed, claimed, blocked, total: tasks.length };
}

export type TaskRow = { id: string; subject: string; state: 'claimed' | 'blocked'; right: string };

// TaskList's blockedBy holds only open blockers, so a non-empty one means blocked.
export function claimedAndBlocked(tasks: readonly Task[]): TaskRow[] {
  const claimed = tasks
    .filter((t) => t.status === 'in_progress')
    .map((t): TaskRow => ({ id: t.id, subject: t.subject, state: 'claimed', right: t.owner ?? '' }));
  const blocked = tasks
    .filter((t) => t.status === 'pending' && t.blockedBy.length > 0)
    .map((t): TaskRow => ({ id: t.id, subject: t.subject, state: 'blocked', right: `needs #${t.blockedBy[0]}` }));
  return [...claimed, ...blocked];
}

// Cumulative ends, so rounding never leaves the bar a cell short or long.
export function barCells(c: TaskCounts, width: number): { completed: number; claimed: number; blocked: number; rest: number } {
  if (c.total === 0) return { completed: 0, claimed: 0, blocked: 0, rest: width };
  const end = (n: number) => Math.round((n / c.total) * width);
  const completed = end(c.completed);
  const claimed = end(c.completed + c.claimed);
  const blocked = end(c.completed + c.claimed + c.blocked);
  return { completed, claimed: claimed - completed, blocked: blocked - claimed, rest: width - blocked };
}

export type Health = { ok?: boolean; watching?: { kind?: string; id?: string; name?: string }; tabs?: number };
export type ConsoleLink = { href: string; label: string; watching?: number };

const CONSOLE = '127.0.0.1:4823';

export function consoleLink(health: Health | undefined, sessionId: string, team: string | undefined): ConsoleLink | undefined {
  if (!health?.ok || !sessionId) return undefined;
  const link = { href: `http://${CONSOLE}/s/${sessionId}`, label: `${CONSOLE}/s/${sessionId.slice(0, 8)}` };
  const w = health.watching;
  // /health's tabs are whatever the console is watching, often another session.
  const ours = (w?.kind === 'session' && w.id === sessionId) || (w?.kind === 'team' && team !== undefined && w.name === team);
  return ours ? { ...link, watching: health.tabs ?? 0 } : link;
}

export function teamOf(roster: readonly RosterAgent[]): string | undefined {
  const id = roster.find((a) => a.teammateId)?.teammateId;
  return id?.slice(id.indexOf('@') + 1);
}

export function ago(at: number | undefined, now: number): string {
  if (at === undefined) return '';
  const s = Math.floor(Math.max(0, now - at) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

const INPUT_KEYS = ['command', 'file_path', 'path', 'pattern', 'query', 'url'] as const;

export function activityLine(tool: string, input: Readonly<Record<string, unknown>>): string {
  for (const key of INPUT_KEYS) {
    const v = input[key];
    if (typeof v === 'string' && v.trim()) return `${tool} ${v.trim().split('\n')[0]}`;
  }
  return tool;
}
