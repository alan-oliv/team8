// The band's rules, kept free of Claude Code imports so vitest and the repo's
// typecheck can load them; team8.tsx is the module around them.
// No relative imports either: Claude Code wants `./x.ts`, which tsc refuses.

export type Task = { id: string; subject: string; status: string; owner?: string; blockedBy: readonly string[] };
export type RosterAgent = { id: string; name?: string; teammateId?: string; status: string };
export type MemberState = 'working' | 'idle' | 'blocked' | 'failed';
export type Member = { id: string; name: string; state: MemberState; taskId?: string; needs?: string };

const ENDED = new Set(['completed', 'killed']);

export function members(roster: readonly RosterAgent[], tasks: readonly Task[]): Member[] {
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
    out.push({ id: a.id, name, state, taskId: (claimed ?? (needs ? blocked : next))?.id, needs });
  }
  return out;
}

export function bandDetail(m: Member): string {
  if (m.state === 'working') return m.taskId ? `#${m.taskId}` : 'working';
  return m.needs ? `needs #${m.needs}` : m.state;
}

export type TaskCounts = { completed: number; total: number };

export function taskCounts(tasks: readonly Task[]): TaskCounts {
  return { completed: tasks.filter((t) => t.status === 'completed').length, total: tasks.length };
}

export type Health = { ok?: boolean };
export type ConsoleLink = { href: string; label: string };

const CONSOLE = '127.0.0.1:4823';

export function consoleLink(health: Health | undefined, sessionId: string): ConsoleLink | undefined {
  if (!health?.ok || !sessionId) return undefined;
  return { href: `http://${CONSOLE}/s/${sessionId}`, label: `${CONSOLE}/s/${sessionId.slice(0, 8)}` };
}
