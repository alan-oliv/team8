import { describe, expect, it } from 'vitest';
import { BRIEF_PROMPT_CAP, briefHasMaterial, briefIsStale, briefPrompt, briefSignature, parseBrief, taskSignature } from './brief';
import type { Agent, Brief, Task } from './domain';

const NOW = 1_700_000_000_000;

function agent(name: string, lines: Array<[number, string]>): Agent {
  return {
    name,
    agentId: `${name}@t`,
    isLead: name === 'lead',
    agentType: 'general-purpose',
    model: 'claude-opus-5',
    role: '',
    status: 'working',
    contextTokens: 0,
    contextLimit: 1_000_000,
    compactAt: 900_000,
    costUsd: 0,
    startedAt: NOW - 60_000,
    transcript: lines.map(([ts, text], i) => ({ id: `${name}-${i}`, marker: '⏺' as const, text, ts })),
    unread: 0,
  };
}

function task(over: Partial<Task> = {}): Task {
  return { id: 'T-1', subject: 's', description: 'd', state: 'pending', blocks: [], blockedBy: [], ...over };
}

describe('briefPrompt', () => {
  it('keeps only transcript lines inside the window', () => {
    const a = agent('alpha', [
      [NOW - 10 * 60_000, 'ancient line'],
      [NOW - 60_000, 'recent line'],
    ]);
    const prompt = briefPrompt([a], [], NOW);
    expect(prompt).toContain('recent line');
    expect(prompt).not.toContain('ancient line');
  });

  it('says so when an agent has been silent through the whole window', () => {
    const prompt = briefPrompt([agent('alpha', [[NOW - 3_600_000, 'old']])], [], NOW);
    expect(prompt).toContain('(nothing in the window)');
  });

  it('carries every task with its state, owner and open blockers', () => {
    const prompt = briefPrompt([], [task({ id: 'T-9', owner: 'alpha', state: 'in_progress', blockedBy: ['T-3'] })], NOW);
    expect(prompt).toContain('- T-9 [in_progress] owner alpha · blocked by T-3 — s');
  });

  it('caps the prompt and keeps the whole task list when transcripts overflow', () => {
    const long = agent('alpha', Array.from({ length: 4000 }, (_, i) => [NOW - 1000, `line ${i} ${'x'.repeat(40)}`] as [number, string]));
    const tasks = [task({ id: 'T-77', subject: 'the last task' })];
    const prompt = briefPrompt([long], tasks, NOW);
    expect(prompt.length).toBeLessThanOrEqual(BRIEF_PROMPT_CAP + 1);
    expect(prompt).toContain('T-77');
  });
});

describe('parseBrief', () => {
  it('splits the three labelled paragraphs', () => {
    const out = parseBrief('NOW: alpha is editing.\nWAITING: bravo needs a plan approved.\nNEXT: T-3 unblocks T-4.');
    expect(out).toEqual([
      { head: 'NOW', text: 'alpha is editing.' },
      { head: 'WAITING', text: 'bravo needs a plan approved.' },
      { head: 'NEXT', text: 'T-3 unblocks T-4.' },
    ]);
  });

  it('tolerates markdown decoration around the labels', () => {
    const out = parseBrief('**NOW** — alpha is editing.\n\n### WAITING:\nnobody.\n\n*NEXT*: T-3.');
    expect(out.map((p) => p.text)).toEqual(['alpha is editing.', 'nobody.', 'T-3.']);
  });

  it('leaves a missing paragraph empty rather than borrowing the next one', () => {
    const out = parseBrief('NOW: alpha is editing.\nNEXT: T-3.');
    expect(out[1]).toEqual({ head: 'WAITING', text: '' });
    expect(out[2].text).toBe('T-3.');
  });

  it('puts an unlabelled answer in NOW rather than dropping it', () => {
    const out = parseBrief('the team is halfway through the migration.');
    expect(out[0].text).toBe('the team is halfway through the migration.');
    expect(out[1].text).toBe('');
  });
});

describe('taskSignature', () => {
  it('moves on a state change and holds on a subject edit', () => {
    const base = [task({ id: 'T-1' }), task({ id: 'T-2', owner: 'alpha' })];
    expect(taskSignature(base)).toBe(taskSignature([{ ...base[0], subject: 'reworded' }, base[1]]));
    expect(taskSignature(base)).not.toBe(taskSignature([{ ...base[0], state: 'completed' }, base[1]]));
    expect(taskSignature(base)).not.toBe(taskSignature([base[0], { ...base[1], owner: 'bravo' }]));
  });

  it('ignores the order tasks arrive in', () => {
    const a = task({ id: 'T-1' });
    const b = task({ id: 'T-2' });
    expect(taskSignature([a, b])).toBe(taskSignature([b, a]));
  });
});

describe('briefSignature', () => {
  const a = agent('alpha', []);

  it('moves when an agent changes state, not only when a task does', () => {
    const base = briefSignature([a], [task()]);
    expect(briefSignature([{ ...a, status: 'idle' }], [task()])).not.toBe(base);
    expect(briefSignature([a], [task({ state: 'completed' })])).not.toBe(base);
  });

  it('moves when an agent reports a finding', () => {
    const found = { ...a, transcript: [{ id: 'f', marker: '!' as const, text: 'bug', ts: NOW }] };
    expect(briefSignature([found], [])).not.toBe(briefSignature([a], []));
  });

  // Gating on the tool would re-run the brief every few seconds for a figure the
  // three paragraphs never mention.
  it('does not move on a tool call', () => {
    expect(briefSignature([{ ...a, currentTool: 'Edit(x.ts)' }], []))
      .toBe(briefSignature([{ ...a, currentTool: 'Bash(ls)' }], []));
  });
});

describe('briefIsStale', () => {
  const a = agent('alpha', []);
  const brief = { signature: briefSignature([a], [task()]) } as Brief;

  it('is false with no brief at all', () => {
    expect(briefIsStale(undefined, [a], [task()])).toBe(false);
  });

  it('is true once the team has moved under it', () => {
    expect(briefIsStale(brief, [a], [task()])).toBe(false);
    expect(briefIsStale(brief, [a], [task({ state: 'completed' })])).toBe(true);
    expect(briefIsStale(brief, [{ ...a, status: 'idle' }], [task()])).toBe(true);
  });
});

describe('briefHasMaterial', () => {
  it('is false for a session with no tasks and a silent window', () => {
    expect(briefHasMaterial([agent('alpha', [[NOW - 3_600_000, 'old']])], [], NOW)).toBe(false);
  });

  it('is true once there is a task, or a line inside the window', () => {
    expect(briefHasMaterial([], [task()], NOW)).toBe(true);
    expect(briefHasMaterial([agent('alpha', [[NOW - 1000, 'fresh']])], [], NOW)).toBe(true);
  });
});
