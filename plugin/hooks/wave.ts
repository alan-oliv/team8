// The wave notifier's rule, kept free of Claude Code imports so vitest and
// the repo's typecheck can load it; wave-notify.ts is the module around it.

export type ListedTask = { id: string; subject: string; status: string; owner?: string; blockedBy: readonly string[] };
export type RosterEntry = { name?: string; status: string };
export type Unblocked = { id: string; subject: string; owner: string; why: 'idle' | 'not running' };

const BUSY = new Set(['pending', 'running', 'waiting']);

// TaskList's blockedBy holds only open blockers, so an empty one means unblocked.
// A respawn leaves the old agent in the roster under the same name, so every
// holder of the name counts.
export function unblockedIdle(
  tasks: readonly ListedTask[],
  roster: readonly RosterEntry[],
  notified: ReadonlySet<string>,
): Unblocked[] {
  const found: Unblocked[] = [];
  for (const t of tasks) {
    if (t.status !== 'pending' || t.blockedBy.length > 0 || !t.owner || t.owner === 'team-lead') continue;
    if (notified.has(t.id)) continue;
    const statuses = roster.filter((a) => a.name === t.owner).map((a) => a.status);
    if (statuses.some((s) => BUSY.has(s))) continue;
    found.push({ id: t.id, subject: t.subject, owner: t.owner, why: statuses.includes('idle') ? 'idle' : 'not running' });
  }
  return found;
}

export function noticeText(completedId: string, unblocked: readonly Unblocked[]): string {
  const items = unblocked.map((u) => `#${u.id} "${u.subject}" (owner ${u.owner}, ${u.why})`).join('; ');
  return `team8: #${completedId} completed. Unblocked with nobody on it: ${items}. Dispatch per team8:run.`;
}
