import { messageLags, percentile, summarizeLags, type Lag, type LagSummary } from './lag';
import type { Interval } from './sleep';
import { attribute, type Attribution } from './sweep';
import { idleWithWork, reviewTails, type IdleWithWork, type TrackTail } from './tasks';
import type { AgentTrace, Role } from './trace';

export interface AgentRow { name: string; role: Role; firstAt: number; lastAt: number; wallMs: number; byOwner: Attribution['byOwner']; calls: number; costUsd: number }
export interface EffortRow { model: string; effort: string; calls: number; medianMs: number; p90Ms: number; meanMs: number; meanOutputTokens: number }
export interface MeasureReport {
  sessionId: string;
  since?: number;
  agents: AgentRow[];
  efforts: EffortRow[];
  lags: LagSummary;
  slowestLags: Lag[];
  tails: TrackTail[];
  idleWithWork: IdleWithWork[];
  asleepMs: number;
}

const overlaps = (a: Interval, b: Interval) => a.startAt < b.endAt && b.startAt < a.endAt;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function buildReport(sessionId: string, traces: AgentTrace[], sleeps: Interval[], since?: number): MeasureReport {
  const from = since ?? -Infinity;
  const window = since === undefined ? undefined : { startAt: since, endAt: Infinity };
  const live = traces.filter((t) => t.lastAt >= from);
  const attributions = new Map(live.map((t) => [t.name, attribute(t, sleeps, window)]));

  const agents = live.map((t) => {
    const firstAt = Math.max(t.firstAt, from);
    return {
      name: t.name,
      role: t.role,
      firstAt,
      lastAt: t.lastAt,
      wallMs: t.lastAt - firstAt,
      byOwner: attributions.get(t.name)!.byOwner,
      calls: t.calls.filter((c) => c.requestedAt >= from).length,
      costUsd: t.costUsd, // the whole transcript: usage isn't kept per call
    };
  });

  const groups = new Map<string, { model: string; effort: string; ms: number[]; out: number[] }>();
  for (const c of live.flatMap((t) => t.calls)) {
    // Out-of-order transcript lines can invert a call (lastAt before requestedAt);
    // attribute() already drops it from the time sweep, so it's dropped here too.
    if (c.requestedAt < from || c.lastAt < c.requestedAt || sleeps.some((s) => overlaps(s, { startAt: c.requestedAt, endAt: c.lastAt }))) continue;
    const effort = c.effort ?? 'unknown';
    const group = groups.get(`${c.model}|${effort}`) ?? { model: c.model, effort, ms: [], out: [] };
    group.ms.push(c.lastAt - c.requestedAt);
    group.out.push(c.outputTokens);
    groups.set(`${c.model}|${effort}`, group);
  }
  const efforts = [...groups.values()]
    .map((g) => {
      const ms = [...g.ms].sort((a, b) => a - b);
      return { model: g.model, effort: g.effort, calls: ms.length, medianMs: percentile(ms, 0.5), p90Ms: percentile(ms, 0.9), meanMs: mean(ms), meanOutputTokens: mean(g.out) };
    })
    .sort((a, b) => b.calls - a.calls);

  const lags = messageLags(live).filter((l) => l.sentAt >= from);
  const span = { startAt: Math.min(...agents.map((a) => a.firstAt)), endAt: Math.max(...agents.map((a) => a.lastAt)) };
  return {
    sessionId,
    since,
    agents,
    efforts,
    lags: summarizeLags(lags),
    slowestLags: lags.filter((l) => l.lagMs !== undefined).sort((a, b) => b.lagMs! - a.lagMs!).slice(0, 5),
    tails: reviewTails(live).filter((t) => t.clearedAt >= from),
    idleWithWork: idleWithWork(live, attributions).filter((x) => x.claimedAt >= from),
    asleepMs: sleeps.reduce((sum, s) => sum + Math.max(0, Math.min(s.endAt, span.endAt) - Math.max(s.startAt, span.startAt)), 0),
  };
}

const min = (ms: number) => (ms / 60_000).toFixed(1);
const sec = (ms: number) => (ms / 1_000).toFixed(1);
const clock = (t: number) => new Date(t).toTimeString().slice(0, 5);
const NOT_TOOLS = new Set(['model', 'idle', 'gap', 'asleep']);
const IDLE_ROW_MIN_MS = 60_000;

export function renderMarkdown(r: MeasureReport): string {
  const out = [`# team8 measure: session ${r.sessionId}`, ''];
  if (r.since !== undefined) out.push(`Since ${new Date(r.since).toISOString()}.`, '');

  out.push(
    '## Agents',
    '',
    "Minutes. Each moment has one owner: asleep, model, a tool category, idle (the turn had ended) or gap. Cost covers each agent's whole transcript.",
    '',
    '| Agent | Role | Wall | Model | Top tools | Idle | Asleep | Calls | Cost |',
    '|---|---|---|---|---|---|---|---|---|',
  );
  for (const a of r.agents) {
    const tools = Object.entries(a.byOwner)
      .filter(([owner]) => !NOT_TOOLS.has(owner))
      .sort((x, y) => (y[1] ?? 0) - (x[1] ?? 0))
      .slice(0, 3)
      .map(([owner, ms]) => `${owner} ${min(ms ?? 0)}`)
      .join(', ');
    out.push(`| ${a.name} | ${a.role} | ${min(a.wallMs)} | ${min(a.byOwner.model ?? 0)} | ${tools || '-'} | ${min(a.byOwner.idle ?? 0)} | ${min(a.byOwner.asleep ?? 0)} | ${a.calls} | $${a.costUsd.toFixed(2)} |`);
  }

  out.push('', '## Model time per call', '', '| Model | Effort | Calls | Median s | p90 s | Mean s | Mean output tokens |', '|---|---|---|---|---|---|---|');
  for (const e of r.efforts) out.push(`| ${e.model} | ${e.effort} | ${e.calls} | ${sec(e.medianMs)} | ${sec(e.p90Ms)} | ${sec(e.meanMs)} | ${Math.round(e.meanOutputTokens)} |`);

  const l = r.lags;
  out.push('', '## Message lag', '', `${l.delivered} of ${l.sent} messages delivered. Median ${min(l.medianMs)} min, p90 ${min(l.p90Ms)}, max ${min(l.maxMs)}; ${l.over5Min} over 5 min.`);
  if (r.slowestLags.length) {
    out.push('', '| From | To | Sent | Seen | Minutes |', '|---|---|---|---|---|');
    for (const x of r.slowestLags) out.push(`| ${x.from} | ${x.to} | ${clock(x.sentAt)} | ${clock(x.seenAt!)} | ${min(x.lagMs!)} |`);
  }

  out.push('', '## Review tails', '');
  if (r.tails.length) {
    out.push('| Executor | Last task done | Track clear | Minutes |', '|---|---|---|---|');
    for (const t of r.tails) out.push(`| ${t.executor} | ${clock(t.lastCompletedAt)} | ${clock(t.clearedAt)} | ${min(t.tailMs)} |`);
  } else out.push('None.');

  out.push('', '## Idle with work waiting', '');
  // Most rows are sub-minute; showing each one would swamp the table, so only
  // the >=60s rows get a line, and the rest are folded into one summary line.
  const long = r.idleWithWork.filter((x) => x.ms >= IDLE_ROW_MIN_MS);
  const short = r.idleWithWork.filter((x) => x.ms < IDLE_ROW_MIN_MS);
  if (long.length) {
    out.push('| Executor | Task | Idle from | Claimed | Minutes |', '|---|---|---|---|---|');
    for (const x of long) out.push(`| ${x.executor} | #${x.taskId} | ${clock(x.idleFrom)} | ${clock(x.claimedAt)} | ${min(x.ms)} |`);
  }
  if (short.length) out.push(`and ${short.length} shorter stretches (total ${min(short.reduce((sum, x) => sum + x.ms, 0))} min).`);
  if (!long.length && !short.length) out.push('None.');

  out.push('', `Mac asleep: ${min(r.asleepMs)} min.`);
  return out.join('\n');
}
