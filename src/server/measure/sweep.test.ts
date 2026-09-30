import { describe, expect, it } from 'vitest';
import { attribute } from './sweep';
import type { AgentTrace } from './trace';

const trace = (over: Partial<AgentTrace> = {}): AgentTrace => ({
  name: 'rows',
  role: 'executor',
  firstAt: 0,
  lastAt: 60_000,
  calls: [
    { id: 'm1', model: 'claude-opus-5-5', requestedAt: 0, firstAt: 2_000, lastAt: 3_000, outputTokens: 50, toolIds: ['t1'] },
    { id: 'm2', model: 'claude-opus-5-5', requestedAt: 13_000, firstAt: 14_000, lastAt: 15_000, outputTokens: 5, stopReason: 'end_turn', toolIds: [] },
  ],
  tools: [{ id: 't1', name: 'Bash', category: 'tests', command: 'npx vitest run', startAt: 3_000, endAt: 13_000, unfinished: false }],
  incoming: [],
  sends: [],
  taskEvents: [],
  costUsd: 0,
  ...over,
});

describe('attribute', () => {
  it('gives each second to the model, the running tool, or idle once the turn ended', () => {
    const a = attribute(trace(), []);
    expect(a.byOwner).toEqual({ model: 5_000, tests: 10_000, idle: 45_000 });
    expect(a.segments.map((s) => [s.owner, s.startAt, s.endAt])).toEqual([
      ['model', 0, 3_000],
      ['tests', 3_000, 13_000],
      ['model', 13_000, 15_000],
      ['idle', 15_000, 60_000],
    ]);
  });

  it('takes the time the Mac slept out of everything else', () => {
    expect(attribute(trace(), [{ startAt: 20_000, endAt: 30_000 }]).byOwner).toEqual({ model: 5_000, tests: 10_000, idle: 35_000, asleep: 10_000 });
  });

  it('counts only the window when one is given', () => {
    expect(attribute(trace(), [], { startAt: 10_000, endAt: 20_000 }).byOwner).toEqual({ tests: 3_000, model: 2_000, idle: 5_000 });
  });

  it('lets the model own time a tool also covers, and the earliest-started tool own an overlap', () => {
    const t = trace({
      lastAt: 10_000,
      calls: [{ id: 'm1', model: 'x', requestedAt: 0, firstAt: 1_000, lastAt: 2_000, outputTokens: 1, toolIds: ['a', 'b'] }],
      tools: [
        { id: 'a', name: 'Bash', category: 'build', startAt: 1_000, endAt: 10_000, unfinished: false },
        { id: 'b', name: 'Bash', category: 'tests', startAt: 2_000, endAt: 6_000, unfinished: false },
      ],
    });
    expect(attribute(t, []).byOwner).toEqual({ model: 2_000, build: 8_000 });
  });

  it('calls a silence after a call that asked for a tool a gap, not idle', () => {
    const t = trace({
      lastAt: 5_000,
      calls: [{ id: 'm1', model: 'x', requestedAt: 0, firstAt: 1_000, lastAt: 2_000, outputTokens: 1, toolIds: ['a'] }],
      tools: [{ id: 'a', name: 'Bash', category: 'other', startAt: 2_000, endAt: 2_000, unfinished: true }],
    });
    expect(attribute(t, []).byOwner).toEqual({ model: 2_000, gap: 3_000 });
  });

  it('breaks a tie between tools that start together by the shorter span, regardless of array order', () => {
    const calls = [{ id: 'm1', model: 'x', requestedAt: 0, firstAt: 1_000, lastAt: 1_000, outputTokens: 1, toolIds: ['a', 'b'] }];
    const forward = attribute(
      trace({
        lastAt: 5_000,
        calls,
        tools: [
          { id: 'a', name: 'Bash', category: 'build', startAt: 1_000, endAt: 5_000, unfinished: false },
          { id: 'b', name: 'Bash', category: 'tests', startAt: 1_000, endAt: 2_000, unfinished: false },
        ],
      }),
      [],
    );
    const reversed = attribute(
      trace({
        lastAt: 5_000,
        calls,
        tools: [
          { id: 'b', name: 'Bash', category: 'tests', startAt: 1_000, endAt: 2_000, unfinished: false },
          { id: 'a', name: 'Bash', category: 'build', startAt: 1_000, endAt: 5_000, unfinished: false },
        ],
      }),
      [],
    );
    expect(forward.byOwner).toEqual({ model: 1_000, tests: 1_000, build: 3_000 });
    expect(reversed.byOwner).toEqual({ model: 1_000, tests: 1_000, build: 3_000 });
  });

  it('drops a call with lastAt before requestedAt so it cannot pollute bounds or end a turn', () => {
    const t = trace({
      lastAt: 10_000,
      calls: [{ id: 'm1', model: 'x', requestedAt: 5_000, firstAt: 3_000, lastAt: 3_000, outputTokens: 1, toolIds: ['t1'] }],
      tools: [],
    });
    expect(attribute(t, []).byOwner).toEqual({ idle: 10_000 });
  });
});
