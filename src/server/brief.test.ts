import { describe, expect, it, vi } from 'vitest';
import { createBriefs, type BriefRun } from './brief';
import type { Agent, Task } from '../shared/domain';

const NOW = 1_700_000_000_000;

const agents: Agent[] = [{
  name: 'alpha', agentId: 'alpha@t', isLead: true, agentType: 'team-lead', model: 'claude-opus-5',
  role: '', status: 'working', contextTokens: 0, contextLimit: 1_000_000, compactAt: 900_000,
  costUsd: 0, startedAt: NOW, transcript: [], unread: 0,
}];

function task(over: Partial<Task> = {}): Task {
  return { id: 'T-1', subject: 's', description: 'd', state: 'pending', blocks: [], blockedBy: [], ...over };
}

const answer: BriefRun = {
  text: 'NOW: alpha is editing.\nWAITING: nobody.\nNEXT: T-1.',
  model: 'claude-haiku-4-5',
  in: 900,
  out: 120,
  costUsd: 0.0021,
};

describe('createBriefs', () => {
  it('writes its first brief for an open console, unasked', async () => {
    const run = vi.fn(async () => answer);
    const briefs = createBriefs({ publish: vi.fn(), run, minGapMs: 0 });
    briefs.observe({ agents, tasks: [task()] }, true);
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
  });

  it('writes nothing for a console nobody has open — that is what bounds the spend', () => {
    const run = vi.fn(async () => answer);
    const briefs = createBriefs({ publish: vi.fn(), run, minGapMs: 0 });
    briefs.observe({ agents, tasks: [task()] }, false);
    expect(run).not.toHaveBeenCalled();
    expect(briefs.current()).toBeUndefined();
  });

  it('writes nothing for a session with no roster yet', () => {
    const run = vi.fn(async () => answer);
    const briefs = createBriefs({ publish: vi.fn(), run, minGapMs: 0 });
    briefs.observe({ agents: [], tasks: [] }, true);
    expect(run).not.toHaveBeenCalled();
  });

  // Handed nothing, the model answered by asking the reader to supply the
  // transcripts, and the parser rendered that request as the NOW paragraph.
  it('writes nothing for a session with no tasks and a silent window', () => {
    const run = vi.fn(async () => answer);
    const silent = [{ ...agents[0], transcript: [{ id: 'l', marker: '⏺' as const, text: 'old', ts: NOW - 3_600_000 }] }];
    const briefs = createBriefs({ publish: vi.fn(), run, now: () => NOW, minGapMs: 0 });
    briefs.observe({ agents: silent, tasks: [] }, true);
    expect(run).not.toHaveBeenCalled();
  });

  it('records the model, inputs and usage the panel has to show', async () => {
    const briefs = createBriefs({ publish: vi.fn(), run: async () => answer, now: () => NOW, minGapMs: 0 });
    const out = await briefs.generate({ agents, tasks: [task(), task({ id: 'T-2' })] });
    expect(out.model).toBe('claude-haiku-4-5');
    expect(out.inputs).toEqual({ transcripts: 1, tasks: 2, windowMin: 5 });
    expect(out.usage).toEqual({ in: 900, out: 120, costUsd: 0.0021 });
    expect(out.generatedAt).toBe(NOW);
    expect(out.pending).toBe(false);
    expect(out.paragraphs.map((p) => p.text)).toEqual(['alpha is editing.', 'nobody.', 'T-1.']);
  });

  it('marks the brief pending while the model is writing', async () => {
    let release = (_: BriefRun) => {};
    const briefs = createBriefs({
      publish: vi.fn(),
      run: () => new Promise<BriefRun>((resolve) => { release = resolve; }),
      minGapMs: 0,
    });
    const done = briefs.generate({ agents, tasks: [task()] });
    expect(briefs.current()?.pending).toBe(true);
    release(answer);
    await done;
    expect(briefs.current()?.pending).toBe(false);
  });

  it('collapses a second request onto the run already in flight', async () => {
    const run = vi.fn(async () => answer);
    const briefs = createBriefs({ publish: vi.fn(), run, minGapMs: 0 });
    const input = { agents, tasks: [task()] };
    await Promise.all([briefs.generate(input), briefs.generate(input)]);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('re-runs when an agent changes state, not only when a task does', async () => {
    const run = vi.fn(async () => answer);
    const briefs = createBriefs({ publish: vi.fn(), run, minGapMs: 0 });
    await briefs.generate({ agents, tasks: [task()] });
    briefs.observe({ agents: [{ ...agents[0], status: 'idle' }], tasks: [task()] }, true);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('holds automatic re-runs to the floor interval', async () => {
    let clock = NOW;
    const run = vi.fn(async () => answer);
    const briefs = createBriefs({ publish: vi.fn(), run, now: () => clock, minGapMs: 60_000 });
    await briefs.generate({ agents, tasks: [task()] });

    clock += 30_000;
    briefs.observe({ agents, tasks: [task({ state: 'completed' })] }, true);
    expect(run).toHaveBeenCalledTimes(1);

    clock += 31_000;
    briefs.observe({ agents, tasks: [task({ state: 'completed' })] }, true);
    expect(run).toHaveBeenCalledTimes(2);
  });

  // The operator asking is never rate-limited: the floor exists to bound
  // automatic spend, not to refuse a click.
  it('never applies the floor to an explicit request', async () => {
    let clock = NOW;
    const run = vi.fn(async () => answer);
    const briefs = createBriefs({ publish: vi.fn(), run, now: () => clock, minGapMs: 60_000 });
    await briefs.generate({ agents, tasks: [task()] });
    clock += 1000;
    await briefs.generate({ agents, tasks: [task({ state: 'completed' })] });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('re-runs on a task-state change, and only on a change', async () => {
    const run = vi.fn(async () => answer);
    const briefs = createBriefs({ publish: vi.fn(), run, minGapMs: 0 });
    await briefs.generate({ agents, tasks: [task()] });
    expect(run).toHaveBeenCalledTimes(1);

    briefs.observe({ agents, tasks: [task({ subject: 'reworded' })] }, true);
    expect(run).toHaveBeenCalledTimes(1);

    briefs.observe({ agents, tasks: [task({ state: 'completed' })] }, true);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('does not re-run for a console nobody has open', async () => {
    const run = vi.fn(async () => answer);
    const briefs = createBriefs({ publish: vi.fn(), run, minGapMs: 0 });
    await briefs.generate({ agents, tasks: [task()] });
    briefs.observe({ agents, tasks: [task({ state: 'completed' })] }, false);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('keeps the last reading and names the failure when a run dies', async () => {
    let fail = false;
    const briefs = createBriefs({
      publish: vi.fn(),
      run: async () => {
        if (fail) throw new Error('claude: command not found');
        return answer;
      },
      minGapMs: 0,
    });
    await briefs.generate({ agents, tasks: [task()] });
    fail = true;
    const out = await briefs.generate({ agents, tasks: [task({ state: 'completed' })] });
    expect(out.error).toBe('claude: command not found');
    expect(out.pending).toBe(false);
    expect(out.paragraphs.map((p) => p.text)).toEqual(['alpha is editing.', 'nobody.', 'T-1.']);
  });

  it('leaves a failed run re-runnable, against the reading that is still on screen', async () => {
    let fail = false;
    const run = vi.fn(async () => {
      if (fail) throw new Error('nope');
      return answer;
    });
    const briefs = createBriefs({ publish: vi.fn(), run, minGapMs: 0 });
    await briefs.generate({ agents, tasks: [task()] });
    fail = true;
    // The failed re-run must not claim the new task list as what it read, or
    // the brief on screen would read as current against a list it never saw.
    await briefs.generate({ agents, tasks: [task({ state: 'in_progress' })] });
    fail = false;
    briefs.observe({ agents, tasks: [task({ state: 'completed' })] }, true);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('publishes when the run starts and again when it lands', async () => {
    const publish = vi.fn();
    const briefs = createBriefs({ publish, run: async () => answer, minGapMs: 0 });
    await briefs.generate({ agents, tasks: [task()] });
    expect(publish).toHaveBeenCalledTimes(2);
  });
});
