import { describe, expect, it } from 'vitest';
import { consoleLink, decidedMode, modeIn, progress, type Task } from '../../plugin/hooks/team';

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

describe('decidedMode', () => {
  it('takes the last decided mode across the messages', () => {
    const messages = [
      { role: 'assistant', toolUses: [{ input: runLog('mode: solo — first') }] },
      { role: 'user' },
      { role: 'assistant', toolUses: [{ input: { command: 'ls' } }, { input: runLog('mode: teammates — later') }] },
    ];
    expect(decidedMode(messages)).toBe('teammates');
    expect(decidedMode([])).toBeUndefined();
  });
});

describe('progress', () => {
  const task = (id: string, status: string): Task => ({ id, status });

  it('counts completed tasks against the total, with the percentage', () => {
    const tasks = [task('1', 'completed'), task('2', 'completed'), task('3', 'completed'), task('4', 'in_progress'), task('5', 'pending')];
    expect(progress(tasks)).toEqual({ completed: 3, total: 5, pct: 60 });
  });

  it('is zero with no tasks', () => {
    expect(progress([])).toEqual({ completed: 0, total: 0, pct: 0 });
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
