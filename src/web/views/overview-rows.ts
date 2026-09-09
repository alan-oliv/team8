import type { Agent, MailMessage, NeedsYouItem, Task } from '../../shared/domain';
import { messageTopic } from '../../shared/threads';

export interface BarSegment { key: 'completed' | 'in progress' | 'blocked'; pct: number; color: string }

export interface TaskBar { done: number; total: number; segments: BarSegment[] }

const BLOCKED_STATES = new Set(['blocked', 'plan_pending', 'failed']);

export function taskBar(tasks: Task[]): TaskBar {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.state === 'completed').length;
  const blocked = tasks.filter((t) => BLOCKED_STATES.has(t.state)).length;
  const inProgress = tasks.filter((t) => t.state === 'in_progress').length;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
  return {
    done: completed,
    total,
    segments: [
      { key: 'completed', pct: pct(completed), color: 'var(--color-accent-500)' },
      { key: 'in progress', pct: pct(inProgress), color: 'var(--color-accent-300)' },
      { key: 'blocked', pct: pct(blocked), color: 'var(--warn)' },
    ],
  };
}

export interface CountRow { glyph: string; label: string; value: string; color: string }

const agents = (n: number) => `${n} agent${n === 1 ? '' : 's'}`;

/**
 * `findings` counts `!` transcript lines, the console's only record of an agent
 * reporting something it found. There is no severity anywhere in the data, so
 * the row is a count and nothing more.
 */
export function stateCounts(
  roster: Agent[],
  needsYou: NeedsYouItem[],
  findings: number,
): CountRow[] {
  const by = (status: Agent['status']) => roster.filter((a) => a.status === status).length;
  const reasons = new Set(needsYou.map((n) => n.reason));
  const waiting = needsYou.length === 0
    ? '0'
    : reasons.size === 1
      ? `${needsYou.length} ${[...reasons][0]}`
      : `${needsYou.length} cards`;
  const failed = by('failed');
  return [
    { glyph: '●', label: 'working', value: agents(by('working')), color: 'var(--color-accent-400)' },
    { glyph: '○', label: 'idle', value: agents(by('idle') + by('departed')), color: 'var(--color-neutral-500)' },
    { glyph: '▲', label: 'waiting on you', value: waiting, color: 'var(--warn)' },
    {
      glyph: '✗',
      label: 'failed',
      value: failed === 0 ? '0' : `${failed} turn${failed === 1 ? '' : 's'} · not respawned`,
      color: 'var(--fail)',
    },
    { glyph: '!', label: 'findings', value: String(findings), color: 'var(--color-accent-300)' },
  ];
}

export function findingCount(roster: Agent[]): number {
  return roster.reduce((n, a) => n + a.transcript.filter((l) => l.marker === '!').length, 0);
}

const isOpen = (t: Task) => t.state !== 'completed';

/**
 * One sentence off the task list: which open task nobody has claimed and is
 * free to start, and what is queued behind it.
 */
export function nextUnblock(tasks: Task[]): string {
  const open = tasks.filter(isOpen);
  if (open.length === 0) {
    return tasks.length === 0 ? 'no tasks yet — nothing is queued.' : 'every task is completed.';
  }
  const ready = open.find(
    (t) => !t.owner && (t.openBlockedBy ?? t.blockedBy).filter(Boolean).length === 0,
  );
  if (!ready) {
    const stuck = open.find((t) => !t.owner);
    return stuck
      ? `${stuck.id} is unclaimed but still blocked by ${(stuck.openBlockedBy ?? stuck.blockedBy).join(', ')}.`
      : 'every open task is claimed — nothing is waiting to be picked up.';
  }
  const waiting = tasks.filter((t) => isOpen(t) && t.blockedBy.includes(ready.id)).map((t) => t.id);
  const tail = waiting.length === 0
    ? 'nothing waits on it.'
    : `${waiting.length} task${waiting.length === 1 ? '' : 's'} wait${waiting.length === 1 ? 's' : ''} on it (${waiting.join(', ')}).`;
  return `${ready.id} — ${ready.subject} — is unclaimed and ready; ${tail}`;
}

export interface LastReported {
  /** `→ lead` for a message, `said` for a transcript line. */
  kind: string;
  toLead: boolean;
  text: string;
  ts: number;
}

export interface Row {
  agent: Agent;
  task?: Task;
  activeForm?: string;
  /** Shown instead of a task when the agent has claimed nothing. */
  idleNote: string;
  now: string;
  /** Null means "draw the live duration"; otherwise this static note. */
  nowNote: string | null;
  last?: LastReported;
}

const NOW_NOTE: Partial<Record<Agent['status'], string>> = {
  idle: 'since it reported',
  departed: 'since it reported',
  plan_pending: 'until you decide',
  failed: 'respawn to continue',
  blocked: 'until it is unblocked',
};

function lastReported(agent: Agent, mail: MailMessage[]): LastReported | undefined {
  const sent = mail.filter((m) => m.from === agent.name);
  const newestMail = sent.reduce<MailMessage | undefined>(
    (best, m) => (!best || m.ts > best.ts ? m : best),
    undefined,
  );
  // Findings only, not the newest line of any kind. A `⏺` tool line is the
  // agent acting, not reporting, and its text is often a raw JSON envelope —
  // the column would read `{"type":"tool_reference"…}` where the operator
  // expects a sentence.
  const findings = agent.transcript.filter((l) => l.marker === '!');
  const line = findings[findings.length - 1];
  if (newestMail && (!line || newestMail.ts >= line.ts)) {
    return {
      kind: `→ ${newestMail.to}`,
      toLead: true,
      text: messageTopic(newestMail),
      ts: newestMail.ts,
    };
  }
  if (!line) return undefined;
  return { kind: 'said', toLead: false, text: line.text, ts: line.ts };
}

export function overviewRow(agent: Agent, tasks: Task[], mail: MailMessage[]): Row {
  const owned = tasks.filter((t) => t.owner === agent.name);
  const task = owned.find(isOpen);
  const closed = owned.filter((t) => !isOpen(t));
  const lastClosed = closed[closed.length - 1];
  return {
    agent,
    task,
    activeForm: task?.activeForm,
    idleNote: lastClosed ? `Nothing claimed — idle since ${lastClosed.id} closed` : 'Nothing claimed',
    now: agent.currentTool || (agent.status === 'working' ? 'thinking' : '—'),
    nowNote: agent.status === 'working' ? null : (NOW_NOTE[agent.status] ?? 'since it reported'),
    last: lastReported(agent, mail),
  };
}
