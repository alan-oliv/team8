import { describe, expect, it } from 'vitest';
import { buildReport, renderMarkdown } from './report';
import type { MeasureReport } from './report';
import type { AgentTrace } from './trace';

const lead: AgentTrace = {
  name: 'team-lead', role: 'lead', firstAt: 0, lastAt: 1_000_000,
  calls: [{ id: 'l1', model: 'claude-opus-5-5', effort: 'max', requestedAt: 0, firstAt: 5_000, lastAt: 10_000, outputTokens: 100, stopReason: 'end_turn', toolIds: [] }],
  tools: [], incoming: [],
  sends: [{ at: 20_000, from: 'team-lead', to: 'rows', text: 'Your track is clear.' }],
  taskEvents: [{ at: 0, by: 'team-lead', taskId: '7', status: 'pending' }],
  costUsd: 1.5,
};
const rows: AgentTrace = {
  name: 'rows', role: 'executor', firstAt: 1_000, lastAt: 30_000,
  calls: [
    { id: 'r1', model: 'claude-sonnet-5', effort: 'medium', requestedAt: 1_000, firstAt: 2_000, lastAt: 3_000, outputTokens: 50, toolIds: ['t'] },
    { id: 'r2', model: 'claude-sonnet-5', effort: 'medium', requestedAt: 13_000, firstAt: 14_000, lastAt: 15_000, outputTokens: 10, stopReason: 'end_turn', toolIds: [] },
  ],
  tools: [{ id: 't', name: 'Bash', category: 'tests', command: 'npx vitest run', startAt: 3_000, endAt: 13_000, unfinished: false }],
  incoming: [{ at: 25_000, kind: 'message', from: 'team-lead', text: 'Your track is clear.' }],
  sends: [],
  taskEvents: [
    { at: 2_000, by: 'rows', taskId: '7', status: 'in_progress' },
    { at: 14_000, by: 'rows', taskId: '7', status: 'completed' },
  ],
  costUsd: 0.25,
};

describe('buildReport', () => {
  it('puts every measure of the session in one report', () => {
    const r = buildReport('sid', [lead, rows], []);
    expect(r.agents.find((a) => a.name === 'rows')).toMatchObject({ role: 'executor', wallMs: 29_000, calls: 2, costUsd: 0.25, byOwner: { model: 4_000, tests: 10_000, idle: 15_000 } });
    expect(r.efforts).toEqual([
      { model: 'claude-sonnet-5', effort: 'medium', calls: 2, medianMs: 2_000, p90Ms: 2_000, meanMs: 2_000, meanOutputTokens: 30 },
      { model: 'claude-opus-5-5', effort: 'max', calls: 1, medianMs: 10_000, p90Ms: 10_000, meanMs: 10_000, meanOutputTokens: 100 },
    ]);
    expect(r.lags).toEqual({ sent: 1, delivered: 1, medianMs: 5_000, p90Ms: 5_000, maxMs: 5_000, over5Min: 0 });
    expect(r.tails).toEqual([{ executor: 'rows', lastCompletedAt: 14_000, clearedAt: 20_000, tailMs: 6_000 }]);
    expect(r.idleWithWork).toEqual([]);
    expect(r.asleepMs).toBe(0);
  });

  it('leaves calls that overlap a sleep out of the per-call times, and counts the sleep', () => {
    const r = buildReport('sid', [lead, rows], [{ startAt: 500, endAt: 1_500 }]);
    expect(r.efforts.find((e) => e.effort === 'medium')?.calls).toBe(1);
    expect(r.asleepMs).toBe(1_000);
  });

  it('measures only from --since on', () => {
    const r = buildReport('sid', [lead, rows], [], 12_000);
    expect(r.agents.find((a) => a.name === 'rows')).toMatchObject({ wallMs: 18_000, calls: 1 });
    expect(r.efforts.map((e) => [e.effort, e.calls])).toEqual([['medium', 1]]);
  });

  it('leaves a call whose lastAt is before its requestedAt out of the per-call effort stats', () => {
    // Out-of-order transcript lines can produce this; attribute() already drops
    // it from the time sweep, so the effort stats must drop it too.
    const backwards: AgentTrace = {
      ...rows,
      calls: [...rows.calls, { id: 'bad', model: 'claude-sonnet-5', effort: 'medium', requestedAt: 20_000, firstAt: 20_000, lastAt: 5_000, outputTokens: 999, toolIds: [] }],
    };
    const r = buildReport('sid', [lead, backwards], []);
    expect(r.efforts.find((e) => e.effort === 'medium')?.calls).toBe(2);
  });
});

describe('renderMarkdown', () => {
  it('shows each section with its rows', () => {
    const md = renderMarkdown(buildReport('sid', [lead, rows], []));
    for (const heading of ['## Agents', '## Model time per call', '## Message lag', '## Review tails', '## Idle with work waiting']) expect(md).toContain(heading);
    expect(md).toContain('| rows | executor | 0.5 | 0.1 | tests 0.2 | 0.3 | 0.0 | 2 | $0.25 |');
    expect(md).toContain('1 of 1 messages delivered.');
  });

  it('keeps a sub-minute idle-with-work row out of the table but counts it in the shorter-stretches line', () => {
    const report: MeasureReport = {
      sessionId: 'sid',
      agents: [],
      efforts: [],
      lags: { sent: 0, delivered: 0, medianMs: 0, p90Ms: 0, maxMs: 0, over5Min: 0 },
      slowestLags: [],
      tails: [],
      idleWithWork: [
        { executor: 'sidebar', taskId: '21', idleFrom: 0, idleTo: 6_119_000, claimedAt: 6_200_000, ms: 6_119_000 },
        { executor: 'sidebar', taskId: '30', idleFrom: 7_000_000, idleTo: 7_030_000, claimedAt: 7_040_000, ms: 30_000 },
      ],
      asleepMs: 0,
    };
    const md = renderMarkdown(report);
    expect(md).toContain('#21');
    expect(md).not.toContain('#30');
    expect(md).toContain('and 1 shorter stretches (total 0.5 min)');
  });
});
