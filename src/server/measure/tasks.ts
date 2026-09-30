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

interface Generation { createdAt: number; blockers: string[]; completedAt?: number }

// The latest generation whose pending event was at or before t. A taskId's
// generations are pushed in creation order as events are processed in time order.
function currentGeneration(gens: Generation[] | undefined, t: number): Generation | undefined {
  let found: Generation | undefined;
  for (const g of gens ?? []) {
    if (g.createdAt > t) break;
    found = g;
  }
  return found;
}

// Idle time an executor spent with a task it later claimed already created and
// unblocked. Each idle stretch counts once, however many claims follow it.
export function idleWithWork(traces: AgentTrace[], attributions: Map<string, Attribution>): IdleWithWork[] {
  // team8 reuses a task id across batches, each its own full create -> work ->
  // complete cycle. A flat map would answer a later batch's readiness question
  // with an earlier batch's blockers or completion time, so every id keeps its
  // own ordered list of generations instead.
  const generations = new Map<string, Generation[]>();
  for (const e of traces.flatMap((t) => t.taskEvents).sort((a, b) => a.at - b.at)) {
    if (e.status === 'pending') {
      const gens = generations.get(e.taskId) ?? [];
      gens.push({ createdAt: e.at, blockers: [] });
      generations.set(e.taskId, gens);
    }
    if (e.addBlockedBy) currentGeneration(generations.get(e.taskId), e.at)?.blockers.push(...e.addBlockedBy);
    if (e.status === 'completed') {
      const gen = currentGeneration(generations.get(e.taskId), e.at);
      if (gen && gen.completedAt === undefined) gen.completedAt = e.at;
    }
  }
  // Ready at t only if the generation waiting at t is still the one claimed: a task
  // re-created after the idle stretch began wasn't the one that was ready during it.
  const readyAt = (taskId: string, t: number, claimedAt: number): boolean => {
    const gen = currentGeneration(generations.get(taskId), t);
    if (!gen || gen !== currentGeneration(generations.get(taskId), claimedAt)) return false;
    return gen.blockers.every((b) => {
      const blockerGen = currentGeneration(generations.get(b), t);
      return blockerGen?.completedAt !== undefined && blockerGen.completedAt <= t;
    });
  };

  const out: IdleWithWork[] = [];
  for (const trace of traces.filter((t) => t.role === 'executor')) {
    const idle = (attributions.get(trace.name)?.segments ?? []).filter((s) => s.owner === 'idle');
    const counted = new Set<Segment>();
    for (const claim of trace.taskEvents.filter((e) => e.status === 'in_progress')) {
      const before = idle.filter((s) => s.endAt <= claim.at).pop();
      if (!before || counted.has(before) || !readyAt(claim.taskId, before.startAt, claim.at)) continue;
      counted.add(before);
      out.push({ executor: trace.name, taskId: claim.taskId, idleFrom: before.startAt, idleTo: before.endAt, claimedAt: claim.at, ms: before.endAt - before.startAt });
    }
  }
  return out;
}
