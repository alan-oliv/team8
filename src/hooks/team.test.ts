import { describe, expect, it } from 'vitest';
import { bandDetail, consoleLink, members, taskCounts, type RosterAgent, type Task } from '../../plugin/hooks/team';

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

describe('members', () => {
  it('maps each roster status to a state', () => {
    const roster = ['running', 'pending', 'waiting', 'idle', 'failed'].map((s, i) => mate(`m${i}`, s));
    expect(members(roster, []).map((m) => m.state)).toEqual(['working', 'working', 'working', 'idle', 'failed']);
  });

  it('leaves out ended agents and agents that are not teammates', () => {
    const roster = [mate('done', 'completed'), mate('gone', 'killed'), { id: 'a1234', status: 'running' }, mate('live', 'running')];
    expect(members(roster, []).map((m) => m.name)).toEqual(['live']);
  });

  it('calls a working teammate with nothing claimed and a still-blocked task blocked', () => {
    const [m] = members([mate('Tom', 'running')], [task('9', 'pending', 'Tom', ['4'])]);
    expect(m).toMatchObject({ state: 'blocked', taskId: '9', needs: '4' });
  });

  it('keeps a teammate working while it has a claimed task beside a blocked one', () => {
    const tasks = [task('9', 'pending', 'Vito', ['4']), task('5', 'in_progress', 'Vito')];
    expect(members([mate('Vito', 'running')], tasks)[0]).toMatchObject({ state: 'working', taskId: '5' });
  });

  it('shows the in-progress task before a pending one and ignores completed ones', () => {
    const tasks = [task('1', 'completed', 'Ana'), task('2', 'pending', 'Ana'), task('3', 'in_progress', 'Ana')];
    expect(members([mate('Ana', 'idle')], tasks)[0].taskId).toBe('3');
  });
});

describe('bandDetail', () => {
  it('names the task of a working teammate and the state of any other', () => {
    const list = members(
      [mate('W', 'running'), mate('I', 'idle'), mate('B', 'running'), mate('F', 'failed'), mate('N', 'running')],
      [task('4', 'in_progress', 'W'), task('9', 'pending', 'B', ['3'])],
    );
    expect(list.map(bandDetail)).toEqual(['#4', 'idle', 'needs #3', 'failed', 'working']);
  });
});

describe('taskCounts', () => {
  it('counts completed and total', () => {
    const tasks = [task('1', 'completed', 'A'), task('2', 'in_progress', 'A'), task('3', 'pending', 'B', ['2']), task('4', 'pending')];
    expect(taskCounts(tasks)).toEqual({ completed: 1, total: 4 });
  });
});

describe('consoleLink', () => {
  const id = 'abcd1234-0000-0000-0000-000000000000';

  it('links this session while the console is up', () => {
    expect(consoleLink({ ok: true }, id)).toEqual({ href: `http://127.0.0.1:4823/s/${id}`, label: '127.0.0.1:4823/s/abcd1234' });
  });

  it('gives nothing when the console is down or the session is unknown', () => {
    expect(consoleLink(undefined, id)).toBeUndefined();
    expect(consoleLink({ ok: false }, id)).toBeUndefined();
    expect(consoleLink({ ok: true }, '')).toBeUndefined();
  });
});
