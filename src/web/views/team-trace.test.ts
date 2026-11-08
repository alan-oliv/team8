import { describe, expect, it } from 'vitest';
import type { Agent, TranscriptLine } from '../../shared/domain';
import { laneMarks, laneSegments } from './team-trace';

const T0 = 1_700_000_000_000;
const NOW = T0 + 600_000;

function agent(over: Partial<Agent>): Agent {
  return {
    name: 'probe-alpha', agentId: 'a', isLead: false, agentType: 'general-purpose', model: 'sonnet', role: 'probe',
    status: 'working', contextTokens: 1000, contextLimit: 200_000, compactAt: 160_000, costUsd: 0.1, startedAt: T0, transcript: [], unread: 0,
    ...over,
  };
}
const line = (ts: number, marker: TranscriptLine['marker'] = '⏺'): TranscriptLine =>
  ({ id: `${marker}${ts}`, marker, text: `${marker} at ${ts}`, ts });

describe('laneSegments', () => {
  it('cuts the bar at every change in the timeline', () => {
    const alpha = agent({ timeline: [
      { ts: T0, phase: 'working' }, { ts: T0 + 120_000, phase: 'idle' }, { ts: T0 + 240_000, phase: 'working' },
    ] });
    expect(laneSegments(alpha, NOW)).toEqual([
      { phase: 'working', from: T0, to: T0 + 120_000 },
      { phase: 'idle', from: T0 + 120_000, to: T0 + 240_000 },
      { phase: 'working', from: T0 + 240_000, to: NOW },
    ]);
  });

  it('lets the current status have the last word', () => {
    // Asking since the card: the timeline already says so.
    const asking = agent({ status: 'asking', timeline: [{ ts: T0, phase: 'working' }, { ts: T0 + 300_000, phase: 'waiting' }] });
    expect(laneSegments(asking, NOW)).toEqual([
      { phase: 'working', from: T0, to: T0 + 300_000 },
      { phase: 'waiting', from: T0 + 300_000, to: NOW },
    ]);
    // Idle by stale silence, which the timeline never records: the stretch since the last line is relabelled.
    const idle = agent({ status: 'idle', transcript: [line(T0 + 60_000)] });
    expect(laneSegments(idle, NOW)).toEqual([
      { phase: 'working', from: T0, to: T0 + 60_000 },
      { phase: 'idle', from: T0 + 60_000, to: NOW },
    ]);
  });

  it('ends a departed lane at its last line and marks the departure there', () => {
    const gone = agent({ status: 'departed', transcript: [line(T0 + 60_000), line(T0 + 90_000)] });
    const segments = laneSegments(gone, NOW);
    expect(segments).toEqual([{ phase: 'working', from: T0, to: T0 + 90_000 }]);
    expect(laneMarks(gone, [gone], [], segments)).toEqual([{ kind: 'departed', at: T0 + 90_000 }]);
  });
});

describe('laneMarks', () => {
  const lead = agent({ name: 'team-lead', isLead: true, marks: [
    { ts: T0 + 10_000, kind: 'tool_error', text: 'grep: no match' },
    { ts: T0 + 30_000, kind: 'claimed', text: 'T-1 · land the schema' },
    { ts: T0 + 60_000, kind: 'closed', text: 'T-1 · land the schema' },
  ] });
  const alpha = agent({ startedAt: T0 + 20_000 });
  const bravo = agent({ name: 'probe-bravo', startedAt: T0 + 40_000 });
  const mail = [
    { msgId: 'm1', from: 'probe-alpha', to: 'probe-bravo', text: 'schema is up', ts: T0 + 100_000, tsIsDelivery: false, read: true },
    { msgId: 'm2', from: 'probe-alpha', to: 'team-lead', text: 'long body', summary: 'done with T-1', ts: T0 + 50_000, tsIsDelivery: false, read: true },
  ];

  it('puts a spawn on the lead per teammate, draws its own marks, and sorts by time', () => {
    expect(laneMarks(lead, [lead, alpha, bravo], mail, laneSegments(lead, NOW))).toEqual([
      { kind: 'fail', at: T0 + 10_000, text: 'grep: no match' },
      { kind: 'spawn', at: T0 + 20_000, name: 'probe-alpha' },
      { kind: 'claim', at: T0 + 30_000, text: 'T-1 · land the schema' },
      { kind: 'spawn', at: T0 + 40_000, name: 'probe-bravo' },
      { kind: 'close', at: T0 + 60_000, text: 'T-1 · land the schema' },
    ]);
  });

  it('tells a message to the lead from one to a peer, topic from the summary when there is one', () => {
    expect(laneMarks(alpha, [lead, alpha, bravo], mail, laneSegments(alpha, NOW))).toEqual([
      { kind: 'msg', at: T0 + 50_000, to: 'team-lead', topic: 'done with T-1' },
      { kind: 'peer', at: T0 + 100_000, to: 'probe-bravo', topic: 'schema is up' },
    ]);
  });
});
