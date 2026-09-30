import { describe, expect, it } from 'vitest';
import { messageLags, summarizeLags } from './lag';
import type { AgentTrace } from './trace';

const trace = (name: string, over: Partial<AgentTrace> = {}): AgentTrace => ({
  name, role: 'executor', firstAt: 0, lastAt: 0, calls: [], tools: [], incoming: [], sends: [], taskEvents: [], costUsd: 0, ...over,
});

describe('messageLags', () => {
  it("matches each message to its first delivery in the recipient's transcript", () => {
    const lead = trace('team-lead', {
      role: 'lead',
      sends: [
        { at: 0, from: 'team-lead', to: 'rows', text: 'Fix the header, please.' },
        { at: 10_000, from: 'team-lead', to: 'rows', text: 'Never mind.' },
      ],
      incoming: [{ at: 5_500, kind: 'message', from: 'rows', text: 'On it' }],
    });
    const rows = trace('rows', {
      sends: [{ at: 5_000, from: 'rows', to: 'lead', text: 'On it' }],
      incoming: [{ at: 240_000, kind: 'message', from: 'team-lead', text: '\nFix the header, please.\n' }],
    });
    expect(messageLags([lead, rows])).toEqual([
      { from: 'team-lead', to: 'rows', sentAt: 0, seenAt: 240_000, lagMs: 240_000, text: 'Fix the header, please.' },
      { from: 'team-lead', to: 'rows', sentAt: 10_000, seenAt: undefined, lagMs: undefined, text: 'Never mind.' },
      { from: 'rows', to: 'team-lead', sentAt: 5_000, seenAt: 5_500, lagMs: 500, text: 'On it' },
    ]);
  });

  it("matches a message delivered in a respawned teammate's trace", () => {
    const lead = trace('team-lead', {
      role: 'lead',
      sends: [{ at: 0, from: 'team-lead', to: 'rows', text: 'Pick up #9.' }],
    });
    const rows = trace('rows');
    const rows2 = trace('rows#2', {
      incoming: [{ at: 30_000, kind: 'message', from: 'team-lead', text: 'Pick up #9.' }],
    });
    expect(messageLags([lead, rows, rows2])).toEqual([
      { from: 'team-lead', to: 'rows', sentAt: 0, seenAt: 30_000, lagMs: 30_000, text: 'Pick up #9.' },
    ]);
  });

  it('matches a send from a respawned sender against the bare name in a delivered frame', () => {
    const rows2 = trace('rows#2', {
      sends: [{ at: 0, from: 'rows#2', to: 'team-lead', text: 'Done with #9.' }],
    });
    const lead = trace('team-lead', {
      role: 'lead',
      incoming: [{ at: 20_000, kind: 'message', from: 'rows', text: 'Done with #9.' }],
    });
    expect(messageLags([rows2, lead])).toEqual([
      { from: 'rows', to: 'team-lead', sentAt: 0, seenAt: 20_000, lagMs: 20_000, text: 'Done with #9.' },
    ]);
  });

  it('pairs two identical sends with their own delivery, earliest with earliest', () => {
    const lead = trace('team-lead', {
      role: 'lead',
      sends: [
        { at: 0, from: 'team-lead', to: 'rows', text: 'Ping.' },
        { at: 1_000, from: 'team-lead', to: 'rows', text: 'Ping.' },
      ],
    });
    const rows = trace('rows', {
      incoming: [
        { at: 5_000, kind: 'message', from: 'team-lead', text: 'Ping.' },
        { at: 6_000, kind: 'message', from: 'team-lead', text: 'Ping.' },
      ],
    });
    expect(messageLags([lead, rows])).toEqual([
      { from: 'team-lead', to: 'rows', sentAt: 0, seenAt: 5_000, lagMs: 5_000, text: 'Ping.' },
      { from: 'team-lead', to: 'rows', sentAt: 1_000, seenAt: 6_000, lagMs: 5_000, text: 'Ping.' },
    ]);
  });
});

describe('summarizeLags', () => {
  it('summarizes the delivered lags and counts the ones over five minutes', () => {
    const lags = [60_000, 240_000, 400_000, 1_380_000].map((lagMs, i) => ({ from: 'a', to: 'b', sentAt: i, seenAt: i + lagMs, lagMs, text: '' }));
    expect(summarizeLags([...lags, { from: 'a', to: 'b', sentAt: 9, text: '' }])).toEqual({
      sent: 5, delivered: 4, medianMs: 400_000, p90Ms: 1_380_000, maxMs: 1_380_000, over5Min: 2,
    });
  });
});
