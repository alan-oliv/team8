import type { AgentTrace } from './trace';

export interface Lag { from: string; to: string; sentAt: number; seenAt?: number; lagMs?: number; text: string }
export interface LagSummary { sent: number; delivered: number; medianMs: number; p90Ms: number; maxMs: number; over5Min: number }

const LEAD_ALIASES = new Set(['team-lead', 'lead', 'main']);

// A respawned teammate's trace is named `name#2`, `name#3`, ...; SendMessage `to`
// and delivered frames always carry the bare name, so comparisons strip the suffix.
export const bare = (n: string) => n.replace(/#\d+$/, '');

// Delivery rewraps the text, so a sent copy and a seen copy are compared on their
// first 40 word characters, as the delay log matched them.
const key = (text: string) => text.replace(/\W+/g, '').slice(0, 40);

// Nearest-rank on a sorted array; the median of an even count is the upper middle.
export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

export function messageLags(traces: AgentTrace[]): Lag[] {
  const lags: Lag[] = [];
  for (const t of traces) {
    for (const send of t.sends) {
      const to = LEAD_ALIASES.has(send.to) ? 'team-lead' : send.to;
      const from = bare(send.from);
      const want = key(send.text);
      // A respawn's incoming messages live in its own #2, #3, ... trace, not just byName.get(to).
      let seen: { at: number } | undefined;
      for (const candidate of traces) {
        if (bare(candidate.name) !== to) continue;
        // Transcripts are written by different processes; 2 s of slack keeps a same-second delivery.
        const match = candidate.incoming.find((m) => m.from === from && m.at >= send.at - 2_000 && key(m.text) === want);
        if (match && (!seen || match.at < seen.at)) seen = match;
      }
      lags.push({ from, to, sentAt: send.at, seenAt: seen?.at, lagMs: seen ? Math.max(0, seen.at - send.at) : undefined, text: send.text });
    }
  }
  return lags;
}

export function summarizeLags(lags: Lag[]): LagSummary {
  const ms = lags.flatMap((l) => (l.lagMs === undefined ? [] : [l.lagMs])).sort((a, b) => a - b);
  return {
    sent: lags.length,
    delivered: ms.length,
    medianMs: percentile(ms, 0.5),
    p90Ms: percentile(ms, 0.9),
    maxMs: ms[ms.length - 1] ?? 0,
    over5Min: ms.filter((m) => m > 300_000).length,
  };
}
