import type { Agent, AgentStatus, MailMessage } from '../../shared/domain';
import { messageTopic } from '../../shared/threads';

/** What a lane's bar says about an agent over one stretch of the session clock. */
export type LanePhase = 'working' | 'idle' | 'waiting' | 'failed';

/** Epoch ms. `to` is `now` on a segment that is still running. */
export interface LaneSegment { phase: LanePhase; from: number; to: number }

export type LaneMark =
  | { kind: 'spawn'; at: number; name: string }
  | { kind: 'msg' | 'peer'; at: number; to: string; topic: string }
  | { kind: 'fail'; at: number; text: string }
  | { kind: 'departed'; at: number };

// `blocked` is an agent still working on a task whose dependency is open, and a
// departed agent's lane simply ends: neither is a phase of its own.
const PHASE_OF: Record<AgentStatus, LanePhase | null> = {
  working: 'working',
  blocked: 'working',
  idle: 'idle',
  plan_pending: 'waiting',
  asking: 'waiting',
  failed: 'failed',
  departed: null,
};

/**
 * The agent's state over time, off the server's fold of the whole log. The
 * last segment takes the current `status`, which is derived from more than the
 * timeline (stale silence, api errors, blocked tasks).
 */
export function laneSegments(agent: Agent, now: number): LaneSegment[] {
  const changes = agent.timeline ?? [];
  const start = Math.min(agent.startedAt || now, changes[0]?.ts ?? now);
  const segments: LaneSegment[] = [{ phase: 'working', from: start, to: now }];
  let current = segments[0];
  for (const c of changes) {
    if (c.phase === current.phase) continue;
    current.to = c.ts;
    current = { phase: c.phase, from: c.ts, to: now };
    segments.push(current);
  }

  const target = PHASE_OF[agent.status];
  // The transcript is a suffix of the log, so its last line is the last thing the agent did.
  const lastAt = Math.max(changes[changes.length - 1]?.ts ?? start, agent.transcript[agent.transcript.length - 1]?.ts ?? start);
  if (target === null) current.to = Math.max(current.from, lastAt);
  else if (target !== current.phase) {
    if (lastAt > current.from) {
      current.to = lastAt;
      segments.push({ phase: target, from: lastAt, to: now });
    } else current.phase = target;
  }
  return segments;
}

/** The events the other views only report as text, on the lane that caused them. */
export function laneMarks(agent: Agent, agents: Agent[], mail: MailMessage[], segments: LaneSegment[]): LaneMark[] {
  const lead = agents.find((a) => a.isLead);
  const marks: LaneMark[] = [];
  if (agent.isLead) {
    for (const a of agents) if (!a.isLead && a.startedAt > 0) marks.push({ kind: 'spawn', at: a.startedAt, name: a.name });
  }
  for (const m of mail) {
    if (m.from !== agent.name) continue;
    marks.push({ kind: lead && m.to === lead.name ? 'msg' : 'peer', at: m.ts, to: m.to, topic: messageTopic(m) });
  }
  // shortcut: only the capped transcript window carries tool errors, so older ones are not drawn; upgrade when the fold marks them
  for (const line of agent.transcript) {
    if (line.marker === '✗' && line.sender === undefined) marks.push({ kind: 'fail', at: line.ts, text: line.text });
  }
  if (agent.status === 'departed') marks.push({ kind: 'departed', at: segments[segments.length - 1].to });
  return marks.sort((a, b) => a.at - b.at);
}
