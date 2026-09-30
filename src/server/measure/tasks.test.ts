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

  it("gathers a respawned teammate's completion by its bare name", () => {
    const lead = trace('team-lead', 'lead', {
      sends: [{ at: 1_000_000, from: 'team-lead', to: 'rows', text: 'Your track is clear. Thanks.' }],
    });
    const rows = trace('rows', 'executor', {
      taskEvents: [{ at: 100_000, by: 'rows', taskId: '7', status: 'completed' }],
    });
    const rows2 = trace('rows#2', 'executor', {
      taskEvents: [{ at: 400_000, by: 'rows#2', taskId: '8', status: 'completed' }],
    });
    expect(reviewTails([lead, rows, rows2])).toEqual([{ executor: 'rows', lastCompletedAt: 400_000, clearedAt: 1_000_000, tailMs: 600_000 }]);
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

  it('drops the stretch when a reused task id was re-created after it began, still blocked by something new', () => {
    const lead = trace('team-lead', 'lead', {
      taskEvents: [
        { at: 0, by: 'team-lead', taskId: '13', status: 'pending' },
        { at: 0, by: 'team-lead', taskId: '21', status: 'pending' },
        { at: 1, by: 'team-lead', taskId: '21', addBlockedBy: ['13'] },
        { at: 50, by: 'team-lead', taskId: '13', status: 'completed' },
        // Batch 2: #21 is reused for a new, unrelated piece of work.
        { at: 6_000, by: 'team-lead', taskId: '21', status: 'pending' },
        { at: 6_001, by: 'team-lead', taskId: '21', addBlockedBy: ['30'] },
      ],
    });
    const sidebar = trace('sidebar', 'executor', {
      taskEvents: [
        { at: 100, by: 'sidebar', taskId: '21', status: 'in_progress' }, // batch 1's #21
        { at: 200, by: 'sidebar', taskId: '21', status: 'completed' },
        { at: 6_200, by: 'sidebar', taskId: '21', status: 'in_progress' }, // batch 2's #21
      ],
    });
    const attributions = new Map<string, Attribution>([
      ['sidebar', {
        byOwner: {},
        segments: [
          { startAt: 0, endAt: 1_000, owner: 'model' },
          { startAt: 1_000, endAt: 5_000, owner: 'idle' }, // starts before batch 2 re-creates #21
          { startAt: 5_000, endAt: 6_200, owner: 'model' },
        ],
      }],
    ]);
    expect(idleWithWork([lead, sidebar], attributions)).toEqual([]);
  });
});
