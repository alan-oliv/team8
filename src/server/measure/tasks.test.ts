import { describe, expect, it } from 'vitest';
import type { Attribution } from './sweep';
import { idleWithWork, reviewTails } from './tasks';
import type { AgentTrace, Role } from './trace';

const trace = (name: string, role: Role, over: Partial<AgentTrace> = {}): AgentTrace => ({
  name, role, firstAt: 0, lastAt: 0, calls: [], tools: [], incoming: [], sends: [], taskEvents: [], costUsd: 0, ...over,
});

describe('reviewTails', () => {
  it("runs from the executor's last completed task to the lead's track clear", () => {
    const lead = trace('team-lead', 'lead', {
      sends: [
        { at: 1_000, from: 'team-lead', to: 'rows', text: 'Start with #7.' },
        { at: 1_000_000, from: 'team-lead', to: 'rows', text: 'Your track is clear. Thanks.' },
      ],
    });
    const rows = trace('rows', 'executor', {
      taskEvents: [
        { at: 100_000, by: 'rows', taskId: '7', status: 'completed' },
        { at: 400_000, by: 'rows', taskId: '8', status: 'completed' },
      ],
    });
    expect(reviewTails([lead, rows])).toEqual([{ executor: 'rows', lastCompletedAt: 400_000, clearedAt: 1_000_000, tailMs: 600_000 }]);
  });
});

describe('idleWithWork', () => {
  it('counts the idle stretch before a claim when the claimed task was already ready, once', () => {
    const lead = trace('team-lead', 'lead', {
      taskEvents: [
        { at: 0, by: 'team-lead', taskId: '20', status: 'pending' },
        { at: 0, by: 'team-lead', taskId: '21', status: 'pending' },
        { at: 0, by: 'team-lead', taskId: '22', status: 'pending' },
        { at: 1, by: 'team-lead', taskId: '22', addBlockedBy: ['99'] },
      ],
    });
    const sidebar = trace('sidebar', 'executor', {
      taskEvents: [
        { at: 1_000, by: 'sidebar', taskId: '20', status: 'in_progress' },
        { at: 60_000, by: 'sidebar', taskId: '20', status: 'completed' },
        { at: 6_200_000, by: 'sidebar', taskId: '21', status: 'in_progress' },
        { at: 6_300_000, by: 'sidebar', taskId: '22', status: 'in_progress' },
      ],
    });
    const attributions = new Map<string, Attribution>([
      ['sidebar', {
        byOwner: {},
        segments: [
          { startAt: 0, endAt: 61_000, owner: 'model' },
          { startAt: 61_000, endAt: 6_180_000, owner: 'idle' },
          { startAt: 6_180_000, endAt: 6_400_000, owner: 'model' },
        ],
      }],
    ]);
    expect(idleWithWork([lead, sidebar], attributions)).toEqual([
      { executor: 'sidebar', taskId: '21', idleFrom: 61_000, idleTo: 6_180_000, claimedAt: 6_200_000, ms: 6_119_000 },
    ]);
  });
});
