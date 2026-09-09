import { describe, expect, it } from 'vitest';
import type { Agent, MailMessage, NeedsYouItem, Task, TranscriptLine } from '../../shared/domain';
import { findingCount, nextUnblock, overviewRow, stateCounts, taskBar } from './overview-rows';

const NOW = 1_700_000_000_000;

function agent(over: Partial<Agent> & { name: string }): Agent {
  return {
    agentId: `${over.name}@t`, isLead: false, agentType: 'general-purpose', model: 'claude-opus-5',
    role: '', status: 'working', contextTokens: 0, contextLimit: 1_000_000, compactAt: 900_000,
    costUsd: 0, startedAt: NOW - 60_000, transcript: [], unread: 0, ...over,
  };
}

function task(over: Partial<Task> = {}): Task {
  return { id: 'T-1', subject: 'do the thing', description: '', state: 'pending', blocks: [], blockedBy: [], ...over };
}

function line(over: Partial<TranscriptLine> = {}): TranscriptLine {
  return { id: 'l', marker: '⏺', text: 'ran a tool', ts: NOW, ...over };
}

function mail(over: Partial<MailMessage> = {}): MailMessage {
  return { msgId: 'm', from: 'alpha', to: 'lead', text: 'the long body', ts: NOW, tsIsDelivery: false, read: true, ...over };
}

describe('taskBar', () => {
  it('splits the bar by state, in proportion', () => {
    const bar = taskBar([
      task({ id: 'a', state: 'completed' }),
      task({ id: 'b', state: 'completed' }),
      task({ id: 'c', state: 'in_progress' }),
      task({ id: 'd', state: 'blocked' }),
    ]);
    expect(bar).toMatchObject({ done: 2, total: 4 });
    expect(bar.segments.map((s) => s.pct)).toEqual([50, 25, 25]);
  });

  it('counts a plan approval and a failed turn as blocked, not as progress', () => {
    const bar = taskBar([task({ id: 'a', state: 'plan_pending' }), task({ id: 'b', state: 'failed' })]);
    expect(bar.segments.find((s) => s.key === 'blocked')?.pct).toBe(100);
  });

  it('draws nothing rather than dividing by zero on an empty list', () => {
    expect(taskBar([]).segments.every((s) => s.pct === 0)).toBe(true);
  });
});

describe('stateCounts', () => {
  const roster = [
    agent({ name: 'a', status: 'working' }),
    agent({ name: 'b', status: 'working' }),
    agent({ name: 'c', status: 'idle' }),
    agent({ name: 'd', status: 'departed' }),
    agent({ name: 'e', status: 'failed' }),
  ];

  it('reads member state, counting a departed agent as idle', () => {
    const rows = stateCounts(roster, [], 0);
    expect(rows.map((r) => r.value)).toEqual(['2 agents', '2 agents', '0', '1 turn · not respawned', '0']);
  });

  it('names the reason when every card waiting on you is the same kind', () => {
    const cards: NeedsYouItem[] = [
      { id: '1', kind: 'plan', agent: 'a', reason: 'plan approval', detail: '' },
    ];
    expect(stateCounts(roster, cards, 0)[2].value).toBe('1 plan approval');
  });

  it('falls back to a count when the cards are of mixed kinds', () => {
    const cards: NeedsYouItem[] = [
      { id: '1', kind: 'plan', agent: 'a', reason: 'plan approval', detail: '' },
      { id: '2', kind: 'permission', agent: 'b', reason: 'permission', detail: '' },
    ];
    expect(stateCounts(roster, cards, 0)[2].value).toBe('2 cards');
  });
});

describe('findingCount', () => {
  it('counts the ! lines and nothing else — there is no severity in the data', () => {
    const roster = [
      agent({ name: 'a', transcript: [line({ marker: '!' }), line({ marker: '⏺' })] }),
      agent({ name: 'b', transcript: [line({ marker: '!' })] }),
    ];
    expect(findingCount(roster)).toBe(2);
  });
});

describe('nextUnblock', () => {
  it('names the unclaimed ready task and what queues behind it', () => {
    const out = nextUnblock([
      task({ id: 'T-1', subject: 'land the schema' }),
      task({ id: 'T-2', blockedBy: ['T-1'] }),
      task({ id: 'T-3', blockedBy: ['T-1'] }),
    ]);
    expect(out).toBe('T-1 — land the schema — is unclaimed and ready; 2 tasks wait on it (T-2, T-3).');
  });

  it('says nothing waits on it when the chain is empty', () => {
    expect(nextUnblock([task({ id: 'T-1', subject: 's' })])).toContain('nothing waits on it.');
  });

  it('skips a completed task when looking for the next one to claim', () => {
    const out = nextUnblock([task({ id: 'T-1', state: 'completed' }), task({ id: 'T-2', subject: 'next up' })]);
    expect(out).toContain('T-2');
  });

  it('reports the blocker when the only unclaimed task is not ready', () => {
    const out = nextUnblock([
      task({ id: 'T-1', owner: 'alpha', state: 'in_progress' }),
      task({ id: 'T-2', blockedBy: ['T-1'], openBlockedBy: ['T-1'] }),
    ]);
    expect(out).toBe('T-2 is unclaimed but still blocked by T-1.');
  });

  it('says so when everything open is already claimed', () => {
    expect(nextUnblock([task({ owner: 'alpha', state: 'in_progress' })]))
      .toBe('every open task is claimed — nothing is waiting to be picked up.');
  });

  it('separates an empty list from a finished one', () => {
    expect(nextUnblock([])).toBe('no tasks yet — nothing is queued.');
    expect(nextUnblock([task({ state: 'completed' })])).toBe('every task is completed.');
  });
});

describe('overviewRow', () => {
  it('takes TRYING TO from the task the agent owns, with the runtime activeForm', () => {
    const row = overviewRow(
      agent({ name: 'alpha' }),
      [task({ id: 'T-4', owner: 'alpha', state: 'in_progress', activeForm: 'Rewriting the loader' })],
      [],
    );
    expect(row.task?.id).toBe('T-4');
    expect(row.activeForm).toBe('Rewriting the loader');
  });

  it('names the task it last closed when it is holding nothing', () => {
    const row = overviewRow(
      agent({ name: 'alpha', status: 'idle' }),
      [task({ id: 'T-2', owner: 'alpha', state: 'completed' })],
      [],
    );
    expect(row.task).toBeUndefined();
    expect(row.idleNote).toBe('Nothing claimed — idle since T-2 closed');
  });

  it('draws the live duration only while the agent is working', () => {
    expect(overviewRow(agent({ name: 'a', status: 'working' }), [], []).nowNote).toBeNull();
    expect(overviewRow(agent({ name: 'a', status: 'plan_pending' }), [], []).nowNote).toBe('until you decide');
    expect(overviewRow(agent({ name: 'a', status: 'failed' }), [], []).nowNote).toBe('respawn to continue');
  });

  it('prefers a message over an older transcript line, and names the recipient', () => {
    const row = overviewRow(
      agent({ name: 'alpha', transcript: [line({ ts: NOW - 5000, text: 'ran a tool' })] }),
      [],
      [mail({ from: 'alpha', to: 'lead', summary: 'claimed T-1', ts: NOW })],
    );
    expect(row.last).toMatchObject({ kind: '→ lead', toLead: true, text: 'claimed T-1' });
  });

  it('prefers a finding over a plain line, and over an older message', () => {
    const row = overviewRow(
      agent({
        name: 'alpha',
        transcript: [line({ id: '1', marker: '!', text: 'auth bypass in the loader', ts: NOW }), line({ id: '2', ts: NOW + 1 })],
      }),
      [],
      [mail({ from: 'alpha', ts: NOW - 9000 })],
    );
    expect(row.last).toMatchObject({ kind: 'said', toLead: false, text: 'auth bypass in the loader' });
  });

  it('does not report a tool line — acting is not reporting', () => {
    const row = overviewRow(
      agent({
        name: 'alpha',
        transcript: [line({ marker: '⏺', text: '{"type":"tool_reference","tool_name":"TaskStop"}' })],
      }),
      [],
      [],
    );
    expect(row.last).toBeUndefined();
  });

  it('names a protocol frame instead of printing its JSON envelope', () => {
    const row = overviewRow(
      agent({ name: 'alpha' }),
      [],
      [mail({
        from: 'alpha',
        to: 'team-lead',
        text: '{"type":"idle_notification","from":"alpha","timestamp":"2026-09-05T15:28:56.311Z"}',
        protocol: { type: 'idle_notification', data: {} },
      })],
    );
    expect(row.last?.text).toBe('idle notification');
  });

  it('ignores another agent’s outgoing mail', () => {
    const row = overviewRow(agent({ name: 'alpha' }), [], [mail({ from: 'bravo', to: 'lead' })]);
    expect(row.last).toBeUndefined();
  });
});
