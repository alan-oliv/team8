import { describe, expect, it } from 'vitest';
import {
  activityLine,
  ago,
  bandDetail,
  barCells,
  claimedAndBlocked,
  consoleLink,
  members,
  taskCounts,
  teamOf,
  type Activity,
  type RosterAgent,
  type Task,
} from '../../plugin/hooks/team';

const mate = (name: string, status: string): RosterAgent => ({
  id: `a${name}-0000000000000001`,
  name,
  teammateId: `${name}@session-abcd1234`,
  status,
});
const task = (id: string, status: string, owner?: string, blockedBy: string[] = []): Task => ({
  id,
  subject: `Task ${id}`,
  status,
  owner,
  blockedBy,
});
const none = new Map<string, Activity>();

describe('members', () => {
  it('maps each roster status to a state', () => {
    const roster = ['running', 'pending', 'waiting', 'idle', 'failed'].map((s, i) => mate(`m${i}`, s));
    expect(members(roster, [], none).map((m) => m.state)).toEqual(['working', 'working', 'working', 'idle', 'failed']);
  });

  it('leaves out ended agents and agents that are not teammates', () => {
    const roster = [mate('done', 'completed'), mate('gone', 'killed'), { id: 'a1234', status: 'running' }, mate('live', 'running')];
    expect(members(roster, [], none).map((m) => m.name)).toEqual(['live']);
  });

  it('calls a working teammate with nothing claimed and a still-blocked task blocked', () => {
    const [m] = members([mate('Tom', 'running')], [task('9', 'pending', 'Tom', ['4'])], none);
    expect(m).toMatchObject({ state: 'blocked', taskId: '9', needs: '4', activity: 'needs #4' });
  });

  it('keeps a teammate working while it has a claimed task beside a blocked one', () => {
    const tasks = [task('9', 'pending', 'Vito', ['4']), task('5', 'in_progress', 'Vito')];
    expect(members([mate('Vito', 'running')], tasks, none)[0]).toMatchObject({ state: 'working', taskId: '5' });
  });

  it('shows the in-progress task before a pending one and ignores completed ones', () => {
    const tasks = [task('1', 'completed', 'Ana'), task('2', 'pending', 'Ana'), task('3', 'in_progress', 'Ana')];
    expect(members([mate('Ana', 'idle')], tasks, none)[0].taskId).toBe('3');
  });

  it('uses the last tool call as the activity, else the state word', () => {
    const activity = new Map([['aAna-0000000000000001', { text: 'Edit a.ts', at: 5 }]]);
    const [ana, bo] = members([mate('Ana', 'running'), mate('Bo', 'idle')], [], activity);
    expect(ana).toMatchObject({ activity: 'Edit a.ts', at: 5 });
    expect(bo).toMatchObject({ activity: 'idle', at: undefined });
  });
});

describe('bandDetail', () => {
  it('names the task of a working teammate and the state of any other', () => {
    const list = members(
      [mate('W', 'running'), mate('I', 'idle'), mate('B', 'running'), mate('F', 'failed'), mate('N', 'running')],
      [task('4', 'in_progress', 'W'), task('9', 'pending', 'B', ['3'])],
      none,
    );
    expect(list.map(bandDetail)).toEqual(['#4', 'idle', 'needs #3', 'failed', 'working']);
  });
});

describe('taskCounts and claimedAndBlocked', () => {
  const tasks = [task('1', 'completed', 'A'), task('2', 'in_progress', 'A'), task('3', 'pending', 'B', ['2']), task('4', 'pending')];

  it('counts completed, claimed, blocked and total', () => {
    expect(taskCounts(tasks)).toEqual({ completed: 1, claimed: 1, blocked: 1, total: 4 });
  });

  it('lists claimed tasks with their owner, then blocked ones with their first blocker', () => {
    expect(claimedAndBlocked(tasks)).toEqual([
      { id: '2', subject: 'Task 2', state: 'claimed', right: 'A' },
      { id: '3', subject: 'Task 3', state: 'blocked', right: 'needs #2' },
    ]);
  });
});

describe('barCells', () => {
  it('splits the width by count and always fills it exactly', () => {
    expect(barCells({ completed: 1, claimed: 1, blocked: 1, total: 4 }, 8)).toEqual({ completed: 2, claimed: 2, blocked: 2, rest: 2 });
    const c = barCells({ completed: 1, claimed: 1, blocked: 1, total: 3 }, 2);
    expect(c.completed + c.claimed + c.blocked + c.rest).toBe(2);
  });

  it('is all rest with no tasks', () => {
    expect(barCells({ completed: 0, claimed: 0, blocked: 0, total: 0 }, 5)).toEqual({ completed: 0, claimed: 0, blocked: 0, rest: 5 });
  });
});

describe('consoleLink', () => {
  const id = 'abcd1234-0000-0000-0000-000000000000';
  const link = { href: `http://127.0.0.1:4823/s/${id}`, label: '127.0.0.1:4823/s/abcd1234' };

  it('counts watchers only when the console watches this session or its team', () => {
    expect(consoleLink({ ok: true, watching: { kind: 'session', id }, tabs: 2 }, id, undefined)).toEqual({ ...link, watching: 2 });
    expect(consoleLink({ ok: true, watching: { kind: 'team', name: 'session-abcd1234' }, tabs: 1 }, id, 'session-abcd1234')).toEqual({ ...link, watching: 1 });
    expect(consoleLink({ ok: true, watching: { kind: 'team', name: 'session-other' }, tabs: 3 }, id, 'session-abcd1234')).toEqual(link);
  });

  it('gives nothing when the console is down or the session is unknown', () => {
    expect(consoleLink(undefined, id, undefined)).toBeUndefined();
    expect(consoleLink({ ok: false }, id, undefined)).toBeUndefined();
    expect(consoleLink({ ok: true }, '', undefined)).toBeUndefined();
  });
});

describe('teamOf', () => {
  it('reads the team from the first teammate id', () => {
    expect(teamOf([{ id: 'x', status: 'running' }, mate('Vito', 'running')])).toBe('session-abcd1234');
    expect(teamOf([])).toBeUndefined();
  });
});

describe('ago', () => {
  it('says now under a minute, then minutes, then hours', () => {
    expect(ago(1_000, 1_000)).toBe('now');
    expect(ago(0, 59_000)).toBe('now');
    expect(ago(0, 3 * 60_000)).toBe('3m');
    expect(ago(0, 2 * 3_600_000)).toBe('2h');
    expect(ago(undefined, 5)).toBe('');
  });
});

describe('activityLine', () => {
  it('names the tool and the first line of its first known argument', () => {
    expect(activityLine('Bash', { command: 'npm test\nmore', description: 'x' })).toBe('Bash npm test');
    expect(activityLine('Edit', { file_path: 'src/a.ts', old_string: 'x' })).toBe('Edit src/a.ts');
    expect(activityLine('TaskList', { tool: 'TaskList' })).toBe('TaskList');
  });
});
