import { describe, expect, it } from 'vitest';
import { bar, consoleLink, elapsed, isDone, modeIn, progress, skillIn, stageOf, type Task } from '../../plugin/hooks/team';

const runLog = (content: string) => ({ file_path: '/repo/docs/team8/runs/2026-10-12-x.md', content });

describe('modeIn', () => {
  it('reads the mode the lead wrote into a run log, by Write or by Edit', () => {
    expect(modeIn(runLog('- tasks: 3 · mode: subagents — one track'))).toBe('subagents');
    expect(modeIn({ file_path: '/r/docs/team8/runs/a.md', old_string: 'x', new_string: '- mode: workflow — fan-out' })).toBe('workflow');
  });

  it('takes the last mode line in one write', () => {
    expect(modeIn(runLog('mode: solo — first\nmode: teammates — second'))).toBe('teammates');
  });

  it('ignores the template, other files, logs with no mode and non-objects', () => {
    expect(modeIn(runLog('- tasks: <n> · mode: solo | subagents | teammates | workflow — <reason>'))).toBeUndefined();
    expect(modeIn({ file_path: '/r/docs/team8/plans/p.md', content: 'mode: teammates — x' })).toBeUndefined();
    expect(modeIn(runLog('## Brainstorm'))).toBeUndefined();
    expect(modeIn('mode: solo — x')).toBeUndefined();
    expect(modeIn(undefined)).toBeUndefined();
  });
});

describe('skillIn', () => {
  it('reads a Skill call, a typed slash command and the transcript\'s command-name', () => {
    expect(skillIn({ skill: 'team8:plan' })).toBe('plan');
    expect(skillIn({ text: '/team8:tasks from LIN-12' })).toBe('tasks');
    expect(skillIn({ text: '<command-message>run</command-message>\n<command-name>/team8:run</command-name>' })).toBe('run');
  });

  it('ignores a prompt that only mentions a skill, and other skills', () => {
    expect(skillIn({ text: 'why did team8:plan skip the spec?' })).toBeUndefined();
    expect(skillIn({ skill: 'superpowers:brainstorming' })).toBeUndefined();
    expect(skillIn({ text: '/team8:console' })).toBeUndefined();
    expect(skillIn(undefined)).toBeUndefined();
  });
});

describe('stageOf', () => {
  const plan = { role: 'assistant', toolUses: [{ input: { skill: 'team8:plan' } }] };
  const planFile = { role: 'assistant', toolUses: [{ input: { file_path: '/r/docs/team8/plans/p.md', content: '# Plan' } }] };

  it('walks spec, planning and the decided mode', () => {
    expect(stageOf([plan])).toEqual({ phase: 'spec' });
    expect(stageOf([plan, planFile])).toEqual({ phase: 'planning' });
    expect(stageOf([plan, planFile, { role: 'assistant', toolUses: [{ input: runLog('mode: teammates — x') }] }])).toEqual({ phase: 'planning', mode: 'teammates' });
  });

  it('reads a typed /team8:plan from a user message', () => {
    expect(stageOf([{ role: 'user', text: '<command-name>/team8:plan</command-name>' }])).toEqual({ phase: 'spec' });
  });

  it('starts over at the next team8:plan, forgetting the last batch\'s mode', () => {
    const decided = { role: 'assistant', toolUses: [{ input: runLog('mode: solo — first') }] };
    expect(stageOf([decided, plan])).toEqual({ phase: 'spec' });
  });

  it('is empty before team8 runs', () => {
    expect(stageOf([])).toEqual({});
    expect(stageOf([{ role: 'user', text: 'hi' }, { role: 'assistant', toolUses: [{ input: { command: 'ls' } }] }])).toEqual({});
  });
});

describe('progress', () => {
  const task = (id: string, status: string): Task => ({ id, status });

  it('counts completed tasks against the total', () => {
    const tasks = [task('1', 'completed'), task('2', 'completed'), task('3', 'completed'), task('4', 'in_progress'), task('5', 'pending')];
    expect(progress(tasks)).toEqual({ completed: 3, total: 5 });
    expect(isDone(progress(tasks))).toBe(false);
  });

  it('is done only with tasks, all completed', () => {
    expect(isDone(progress([task('1', 'completed')]))).toBe(true);
    expect(isDone(progress([]))).toBe(false);
  });
});

describe('bar', () => {
  it('fills twenty cells by the share completed, rounding down', () => {
    expect(bar({ completed: 49, total: 101 })).toEqual({ filled: '▰'.repeat(9), empty: '▱'.repeat(11) });
    expect(bar({ completed: 0, total: 0 })).toEqual({ filled: '', empty: '▱'.repeat(20) });
    expect(bar({ completed: 3, total: 3 })).toEqual({ filled: '▰'.repeat(20), empty: '' });
  });
});

describe('elapsed', () => {
  it('reads seconds, then minutes and seconds, then hours and minutes', () => {
    expect(elapsed(42_000)).toBe('42s');
    expect(elapsed(402_000)).toBe('6m42s');
    expect(elapsed(65_000)).toBe('1m05s');
    expect(elapsed(3_900_000)).toBe('1h05m');
    expect(elapsed(-5)).toBe('0s');
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
