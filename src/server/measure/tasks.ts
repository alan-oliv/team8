import { bare } from './lag';
import type { Attribution, Segment } from './sweep';
import type { AgentTrace } from './trace';

export interface TrackTail { executor: string; lastCompletedAt: number; clearedAt: number; tailMs: number }
export interface IdleWithWork { executor: string; taskId: string; idleFrom: number; idleTo: number; claimedAt: number; ms: number }

// team8:run tells an executor "your track is clear" when its review is done.
const TRACK_CLEAR = /track is clear|track's clear/i;

export function reviewTails(traces: AgentTrace[]): TrackTail[] {
  const tails: TrackTail[] = [];
  for (const lead of traces.filter((t) => t.role === 'lead')) {
    for (const send of lead.sends) {
      if (!TRACK_CLEAR.test(send.text)) continue;
      const executor = bare(send.to);
      // A respawn's completions live in its own #2, #3, ... trace too.
      const completed = traces
        .filter((t) => bare(t.name) === executor)
        .flatMap((t) => t.taskEvents)
        .filter((e) => e.status === 'completed' && e.at <= send.at)
        .map((e) => e.at);
      if (!completed.length) continue;
      const lastCompletedAt = Math.max(...completed);
      tails.push({ executor, lastCompletedAt, clearedAt: send.at, tailMs: send.at - lastCompletedAt });
    }
  }
  return tails;
}

// Idle time an executor spent with a task it later claimed already created and
// unblocked. Each idle stretch counts once, however many claims follow it.
export function idleWithWork(traces: AgentTrace[], attributions: Map<string, Attribution>): IdleWithWork[] {
  const createdAt = new Map<string, number>();
  const blockers = new Map<string, string[]>();
  const completedAt = new Map<string, number>();
  for (const e of traces.flatMap((t) => t.taskEvents).sort((a, b) => a.at - b.at)) {
    if (e.status === 'pending' && !createdAt.has(e.taskId)) createdAt.set(e.taskId, e.at);
    if (e.addBlockedBy) blockers.set(e.taskId, [...(blockers.get(e.taskId) ?? []), ...e.addBlockedBy]);
    if (e.status === 'completed' && !completedAt.has(e.taskId)) completedAt.set(e.taskId, e.at);
  }
  const readyAt = (taskId: string, t: number) =>
    (createdAt.get(taskId) ?? Infinity) <= t && (blockers.get(taskId) ?? []).every((b) => (completedAt.get(b) ?? Infinity) <= t);

  const out: IdleWithWork[] = [];
  for (const trace of traces.filter((t) => t.role === 'executor')) {
    const idle = (attributions.get(trace.name)?.segments ?? []).filter((s) => s.owner === 'idle');
    const counted = new Set<Segment>();
    for (const claim of trace.taskEvents.filter((e) => e.status === 'in_progress')) {
      const before = idle.filter((s) => s.endAt <= claim.at).pop();
      if (!before || counted.has(before) || !readyAt(claim.taskId, before.startAt)) continue;
      counted.add(before);
      out.push({ executor: trace.name, taskId: claim.taskId, idleFrom: before.startAt, idleTo: before.endAt, claimedAt: claim.at, ms: before.endAt - before.startAt });
    }
  }
  return out;
}
