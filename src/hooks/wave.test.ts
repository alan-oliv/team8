import { describe, expect, it } from 'vitest';
import { noticeText, unblockedIdle, type ListedTask } from '../../plugin/hooks/wave';

const task = (over: Partial<ListedTask> = {}): ListedTask => ({
  id: '7', subject: 'Probe B', status: 'pending', owner: 'ghost', blockedBy: [], ...over,
});
const none = new Set<string>();

describe('unblockedIdle', () => {
  it('reports an owner missing from the roster as not running', () => {
    expect(unblockedIdle([task()], [], none)).toEqual([
      { id: '7', subject: 'Probe B', owner: 'ghost', why: 'not running' },
    ]);
  });

  it('reports a killed owner as not running', () => {
    expect(unblockedIdle([task()], [{ name: 'ghost', status: 'killed' }], none)[0]?.why).toBe('not running');
  });

  it('reports an idle owner as idle', () => {
    expect(unblockedIdle([task()], [{ name: 'ghost', status: 'idle' }], none)[0]?.why).toBe('idle');
  });

  it('skips an owner that is running, starting or waiting', () => {
    for (const status of ['running', 'pending', 'waiting']) {
      expect(unblockedIdle([task()], [{ name: 'ghost', status }], none)).toEqual([]);
    }
  });

  it('skips a respawned name while any agent holding it runs', () => {
    const roster = [{ name: 'ghost', status: 'killed' }, { name: 'ghost', status: 'running' }];
    expect(unblockedIdle([task()], roster, none)).toEqual([]);
  });

  it('skips a task that is still blocked', () => {
    expect(unblockedIdle([task({ blockedBy: ['6'] })], [], none)).toEqual([]);
  });

  it("skips the lead's own task", () => {
    expect(unblockedIdle([task({ owner: 'team-lead' })], [], none)).toEqual([]);
  });

  it('skips an unowned task', () => {
    expect(unblockedIdle([task({ owner: undefined })], [], none)).toEqual([]);
  });

  it('skips a task that is not pending', () => {
    for (const status of ['in_progress', 'completed']) {
      expect(unblockedIdle([task({ status })], [], none)).toEqual([]);
    }
  });

  it('skips a task already reported', () => {
    expect(unblockedIdle([task()], [], new Set(['7']))).toEqual([]);
  });
});

describe('noticeText', () => {
  it('names the completed task and each unblocked one', () => {
    expect(
      noticeText('6', [
        { id: '7', subject: 'Probe B', owner: 'ghost', why: 'not running' },
        { id: '9', subject: 'Docs', owner: 'docs', why: 'idle' },
      ]),
    ).toBe(
      'team8: #6 completed. Unblocked with nobody on it: #7 "Probe B" (owner ghost, not running); #9 "Docs" (owner docs, idle). Dispatch per team8:run.',
    );
  });
});
