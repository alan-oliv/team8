import type { Category } from './classify';
import type { Interval } from './sleep';
import type { AgentTrace, ModelCall } from './trace';

export type Owner = Category | 'model' | 'asleep' | 'idle' | 'gap';
export interface Segment { startAt: number; endAt: number; owner: Owner }
export interface Attribution { byOwner: Partial<Record<Owner, number>>; segments: Segment[] }

interface Span { startAt: number; endAt: number; owner: Owner }

function lastEndedBy(callsByEnd: ModelCall[], t: number): ModelCall | undefined {
  let found: ModelCall | undefined;
  for (const c of callsByEnd) {
    if (c.lastAt > t) break;
    found = c;
  }
  return found;
}

// Each moment goes to one owner, in this order: asleep, model, the earliest-started
// running tool, then idle (the last call ended its turn) or gap (it was waiting on a tool).
// ponytail: O(bounds × spans); a sorted sweep with an active set if a session ever takes seconds.
export function attribute(trace: AgentTrace, sleeps: Interval[], window?: Interval): Attribution {
  const from = Math.max(trace.firstAt, window?.startAt ?? -Infinity);
  const to = Math.min(trace.lastAt, window?.endAt ?? Infinity);
  // Out-of-order transcript lines can invert a call (lastAt before requestedAt); it was never
  // live, so drop it here rather than let it fake a bound or count as "the last one that ended".
  const calls = trace.calls.filter((c) => c.lastAt >= c.requestedAt);
  const spans: Span[] = [
    ...sleeps.map((s) => ({ startAt: s.startAt, endAt: s.endAt, owner: 'asleep' as const })),
    ...calls.map((c) => ({ startAt: c.requestedAt, endAt: c.lastAt, owner: 'model' as const })),
    ...trace.tools.filter((t) => t.endAt > t.startAt).map((t) => ({ startAt: t.startAt, endAt: t.endAt, owner: t.category })),
  ].filter((s) => s.endAt > from && s.startAt < to);
  const bounds = [...new Set([from, to, ...spans.flatMap((s) => [s.startAt, s.endAt])])]
    .filter((b) => b >= from && b <= to)
    .sort((a, b) => a - b);
  const callsByEnd = [...calls].sort((a, b) => a.lastAt - b.lastAt);

  const byOwner: Attribution['byOwner'] = {};
  const segments: Segment[] = [];
  for (let k = 0; k + 1 < bounds.length; k++) {
    const s = bounds[k];
    const e = bounds[k + 1];
    const live = spans.filter((x) => x.startAt <= s && x.endAt > s);
    let owner: Owner;
    if (live.some((x) => x.owner === 'asleep')) owner = 'asleep';
    else if (live.some((x) => x.owner === 'model')) owner = 'model';
    else if (live.length) owner = live.reduce((a, b) => (b.startAt < a.startAt || (b.startAt === a.startAt && b.endAt < a.endAt) ? b : a)).owner;
    else {
      const last = lastEndedBy(callsByEnd, s);
      owner = !last || last.stopReason === 'end_turn' || last.toolIds.length === 0 ? 'idle' : 'gap';
    }
    byOwner[owner] = (byOwner[owner] ?? 0) + (e - s);
    const previous = segments[segments.length - 1];
    if (previous && previous.owner === owner && previous.endAt === s) previous.endAt = e;
    else segments.push({ startAt: s, endAt: e, owner });
  }
  return { byOwner, segments };
}
