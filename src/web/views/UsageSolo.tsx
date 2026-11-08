import type { CSSProperties } from 'react';
import type { Agent, Subagent, TeamState } from '../../shared/domain';
import { RATES, rateOf } from '../../shared/cost';
import { flattenSubagents } from '../../shared/subagents';
import { formatCost, formatElapsed, formatPct, formatTokens } from '../format';
import { estimatedTokens } from './Trace';
import {
  PANEL, PANEL_CAPTION, PANEL_HEAD, PANEL_TITLE, PROSE, SEGMENT_COLOR, TABLE_PANEL, Tile, cell,
} from './UsageTeam';
import { SEGMENT_ORDER, billedTokens, cacheHitRatio, cacheReadRatio, splitOf, subagentSpendUsd } from './usage-team';
import type { TokenSplit } from '../../shared/cost';

const EM_DASH = '—';

// Canvas study 8's `150 110 84 64 44 62 52 72 62 1fr`, type and model widened
// for the agent types and canonical ids this console prints; cost takes the rest.
const COL = {
  call: cell('150px', 'left'),
  type: cell('150px', 'left'),
  model: cell('120px', 'left'),
  state: cell('64px', 'left'),
  depth: cell('44px'),
  time: cell('62px'),
  tools: cell('44px'),
  tokens: cell('72px'),
  shown: cell('64px'),
  cost: { ...cell('auto'), flex: 1, minWidth: '64px' },
};

const ROW: CSSProperties = { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px' };
const HEAD_ROW: CSSProperties = {
  ...ROW,
  padding: '7px 12px',
  background: 'var(--term)',
  color: 'var(--color-neutral-700)',
  fontSize: '9.5px',
  letterSpacing: '.06em',
  textTransform: 'uppercase',
};

/** The digest's basis — input, output and cache writes — so one column has one meaning. */
function sentTokens(split: TokenSplit): number {
  return split.in + split.out + split.cacheWrite;
}

function callTime(s: Subagent, now: number): string {
  if (s.durationMs !== undefined) return formatElapsed(s.durationMs);
  return s.startedAt !== undefined ? formatElapsed(now - s.startedAt) : EM_DASH;
}

function wordsOf(text: string | undefined): number {
  return text ? text.trim().split(/\s+/).length : 0;
}

/**
 * What the same call would have cost on the cheapest model in the catalog.
 * List prices scale together across tiers, so the ratio of input rates is the
 * ratio of the bills whatever the call's mix of classes. Undefined when the call
 * already ran on that model.
 */
export function cheaperEstimate(costUsd: number, model: string): { model: string; costUsd: number } | undefined {
  const rate = rateOf(model);
  const cheapest = RATES().filter((r) => !r.approximate).sort((a, b) => a.input - b.input)[0];
  if (!cheapest || rate.input <= cheapest.input) return undefined;
  return { model: cheapest.model, costUsd: (costUsd * cheapest.input) / rate.input };
}

function Segments({ split }: { split: TokenSplit | undefined }) {
  const total = split ? billedTokens(split) : 0;
  return (
    <span style={{ flex: 1, minWidth: 0, height: '16px', borderRadius: '3px', overflow: 'hidden', display: 'flex', background: 'var(--term)' }}>
      {split && total > 0 && SEGMENT_ORDER.map((key) => (
        <span
          key={key}
          data-testid="usage-solo-segment"
          data-segment={key}
          style={{ width: `${(split[key] / total) * 100}%`, height: '100%', background: SEGMENT_COLOR[key] }}
        />
      ))}
    </span>
  );
}

function Window({ name, lead, split, tokens, cost }: {
  name: string; lead?: boolean; split: TokenSplit | undefined; tokens: number | undefined; cost: number;
}) {
  return (
    <div data-testid="usage-solo-window" style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px' }}>
      <span style={{ ...cell('110px'), color: lead ? 'var(--color-text)' : 'var(--color-neutral-400)' }}>{name}</span>
      <Segments split={split} />
      <span style={{ ...cell('72px'), color: 'var(--color-neutral-500)' }}>{tokens === undefined ? EM_DASH : formatTokens(tokens)}</span>
      <span style={{ ...cell('64px'), color: 'var(--color-text)' }}>{formatCost(cost)}</span>
    </div>
  );
}

export interface UsageSoloProps {
  state: TeamState;
  now: number;
  /** A ledger row opens that call in the trace. */
  onOpenCall(toolUseId: string): void;
}

/**
 * Sub-agents mode's body of the usage view (canvas study 8): the team ledger
 * adapted to one parent and its Task calls. Rows are calls, not members, and
 * the lever is what each call returned against what it spent, since only the
 * `⎿` summary ever reaches the parent's context. The session-spend tile is the
 * status bar's own `totalCostUsd`; every other dollar is `agent.costUsd` or a
 * call's digest through `subagentSpendUsd`, the figures the trace draws.
 */
export function UsageSolo({ state, now, onOpenCall }: UsageSoloProps) {
  const lead: Agent | undefined = state.agents.find((a) => a.isLead) ?? state.agents[0];
  if (!lead) return null;
  const calls = flattenSubagents(Object.values(state.subagents ?? {}).flat());
  const split = splitOf(lead);
  const hit = split ? cacheHitRatio(split) : undefined;
  const leadTokens = split ? sentTokens(split) : undefined;

  const subTokens = calls.reduce((n, s) => n + (s.tokens ?? 0), 0);
  const subSpend = calls.reduce((n, s) => n + subagentSpendUsd(s), 0);
  const shown = calls.reduce((n, s) => n + estimatedTokens(s.returnedSummary), 0);
  const measured = calls.every((s) => s.costUsd !== undefined);
  const tools = calls.reduce((n, s) => n + (s.toolCalls ?? 0), 0);
  const total = lead.costUsd + subSpend;
  // The turn, as the bar's `working · 4m 08s` reads it, not the session.
  const leadTime = formatElapsed(now - (lead.turnStartedAt ?? lead.startedAt));

  const lever = calls.filter((s) => s.tokens !== undefined).sort((a, b) => subagentSpendUsd(b) - subagentSpendUsd(a))[0];
  const leverCost = lever ? subagentSpendUsd(lever) : 0;
  const cheaper = lever ? cheaperEstimate(leverCost, lever.model ?? lead.model) : undefined;

  return (
    <div
      data-testid="usage-solo"
      className="tscroll"
      style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '12px', padding: '14px 16px' }}
    >
      <div style={{ display: 'flex', gap: '12px', flex: 'none' }}>
        <Tile
          testId="usage-solo-spend"
          label="session spend"
          value={formatCost(state.totalCostUsd)}
          note="parent turn plus every Task call, at list price"
        />
        <Tile
          testId="usage-solo-sub"
          label="in subagents"
          value={formatCost(subSpend)}
          valueColor="var(--color-accent-300)"
          note={`${state.totalCostUsd > 0 ? formatPct(subSpend / state.totalCostUsd) : EM_DASH} of the spend · ${formatTokens(subTokens)} tokens`}
        />
        <Tile
          testId="usage-solo-context"
          label="parent context"
          value={formatTokens(lead.contextTokens)}
          note={`${lead.contextLimit > 0 ? formatPct(lead.contextTokens / lead.contextLimit) : EM_DASH} of ${formatTokens(lead.contextLimit)} · subagent work never enters it`}
        />
        <Tile
          testId="usage-solo-shown"
          label="shown to parent"
          value={formatTokens(shown)}
          valueColor="var(--color-accent-300)"
          note={`${shown > 0 ? `${Math.round(subTokens / shown)}:1` : EM_DASH} against what the subagents spent`}
        />
        <Tile
          testId="usage-solo-cache"
          label="cache hit"
          value={hit === undefined ? EM_DASH : formatPct(hit)}
          note={`cache reads bill at ${cacheReadRatio(lead.model)} input`}
        />
      </div>

      <div data-testid="usage-solo-composition" style={PANEL}>
        <div style={PANEL_HEAD}>
          <span style={PANEL_TITLE}>Where the tokens go</span>
          <span style={PANEL_CAPTION}>cache read · cache write · input · output</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
          <Window name={lead.name} lead split={split} tokens={leadTokens} cost={lead.costUsd} />
          {calls.map((s) => (
            <Window key={s.toolUseId} name={s.name} split={s.tokenSplit} tokens={s.tokens} cost={subagentSpendUsd(s)} />
          ))}
        </div>
        <div style={PROSE}>
          Each bar is one context window: the parent’s and one per Task call. A subagent that re-reads what its parent already has pays full input price for it — the cache is per window, not per session.
        </div>
      </div>

      <div data-testid="usage-solo-ledger" style={TABLE_PANEL}>
        <div style={{ ...PANEL_HEAD, padding: '13px 16px 11px', borderBottom: '1px solid var(--color-neutral-900)' }}>
          <span style={PANEL_TITLE}>Per-call ledger</span>
          <span data-testid="usage-solo-ledger-caption" style={PANEL_CAPTION}>
            {calls.length === 0
              ? 'no Task call yet'
              : measured
                ? 'click a row to open that call in trace'
                : 'click a row to open that call in trace · unpriced calls derived at the cache-read rate'}
          </span>
        </div>
        <div style={HEAD_ROW}>
          <span style={COL.call}>call</span>
          <span style={COL.type}>type</span>
          <span style={COL.model}>model</span>
          <span style={COL.state}>state</span>
          <span style={COL.depth}>depth</span>
          <span style={COL.time}>time</span>
          <span style={COL.tools}>tools</span>
          <span style={COL.tokens}>tokens</span>
          <span style={COL.shown}>to parent</span>
          <span style={COL.cost}>cost</span>
        </div>
        <div data-testid="usage-solo-parent" style={{ ...ROW, borderTop: '1px solid var(--color-neutral-900)', fontSize: '11.5px' }}>
          <span style={{ ...COL.call, display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-text)' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', flex: 'none', background: 'var(--color-accent-400)' }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{lead.name}</span>
          </span>
          <span style={{ ...COL.type, color: 'var(--color-neutral-500)' }}>parent turn</span>
          <span style={{ ...COL.model, color: 'var(--color-neutral-500)' }}>{lead.model}</span>
          <span style={{ ...COL.state, color: lead.status === 'working' ? 'var(--color-accent-300)' : 'var(--color-neutral-500)' }}>{lead.status}</span>
          <span style={{ ...COL.depth, color: 'var(--color-neutral-500)' }}>{EM_DASH}</span>
          <span style={{ ...COL.time, color: 'var(--color-neutral-500)' }}>{leadTime}</span>
          <span style={{ ...COL.tools, color: 'var(--color-neutral-500)' }}>{EM_DASH}</span>
          <span style={{ ...COL.tokens, color: 'var(--color-neutral-500)' }}>{leadTokens === undefined ? EM_DASH : formatTokens(leadTokens)}</span>
          <span style={{ ...COL.shown, color: 'var(--color-accent-500)' }}>{EM_DASH}</span>
          <span style={{ ...COL.cost, fontWeight: 500, color: 'var(--color-text)' }}>{formatCost(lead.costUsd)}</span>
        </div>
        {calls.map((s) => {
          const live = s.state === 'running';
          const returned = estimatedTokens(s.returnedSummary);
          return (
            <div
              key={s.toolUseId}
              data-testid="usage-solo-call"
              role="button"
              tabIndex={0}
              onClick={() => onOpenCall(s.toolUseId)}
              onKeyDown={(e) => { if (e.key === 'Enter') onOpenCall(s.toolUseId); }}
              style={{ ...ROW, borderTop: '1px solid var(--color-neutral-900)', cursor: 'pointer', fontSize: '11.5px' }}
            >
              <span style={{ ...COL.call, display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-text)', paddingLeft: `${s.depth * 10}px` }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', flex: 'none', background: live ? 'var(--color-accent-300)' : 'var(--color-neutral-600)' }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
              </span>
              <span style={{ ...COL.type, color: 'var(--color-neutral-500)' }}>{s.agentType ?? EM_DASH}</span>
              <span style={{ ...COL.model, color: 'var(--color-neutral-500)' }}>{s.model ?? EM_DASH}</span>
              <span style={{ ...COL.state, color: live ? 'var(--color-accent-300)' : 'var(--color-neutral-500)' }}>{s.state}</span>
              <span style={{ ...COL.depth, color: 'var(--color-neutral-500)' }}>{s.depth}</span>
              <span style={{ ...COL.time, color: 'var(--color-neutral-500)' }}>{callTime(s, now)}</span>
              <span style={{ ...COL.tools, color: 'var(--color-neutral-500)' }}>{s.toolCalls ?? EM_DASH}</span>
              <span style={{ ...COL.tokens, color: 'var(--color-neutral-500)' }}>{s.tokens === undefined ? EM_DASH : formatTokens(s.tokens)}</span>
              <span style={{ ...COL.shown, color: 'var(--color-accent-500)' }}>{returned > 0 ? formatTokens(returned) : EM_DASH}</span>
              <span data-testid="usage-solo-call-cost" style={{ ...COL.cost, fontWeight: 500, color: 'var(--color-text)' }}>
                {s.tokens === undefined ? EM_DASH : formatCost(subagentSpendUsd(s))}
              </span>
            </div>
          );
        })}
        <div style={{ ...ROW, padding: '9px 12px', background: 'var(--term)', borderTop: '1px solid var(--color-neutral-900)', fontSize: '11px' }}>
          <span style={{ ...COL.call, width: '256px', color: 'var(--color-neutral-600)' }}>{`1 parent · ${calls.length} Task call${calls.length === 1 ? '' : 's'}`}</span>
          <span style={COL.model} />
          <span style={COL.state} />
          <span style={COL.depth} />
          <span style={{ ...COL.time, color: 'var(--color-neutral-500)' }}>{leadTime}</span>
          <span style={{ ...COL.tools, color: 'var(--color-neutral-500)' }}>{tools}</span>
          <span style={{ ...COL.tokens, color: 'var(--color-neutral-500)' }}>{leadTokens === undefined ? EM_DASH : formatTokens(leadTokens + subTokens)}</span>
          <span style={{ ...COL.shown, color: 'var(--color-accent-500)' }}>{formatTokens(shown)}</span>
          <span data-testid="usage-solo-foot-cost" style={{ ...COL.cost, fontWeight: 500, color: 'var(--color-text)' }}>{formatCost(total)}</span>
        </div>
      </div>

      {lever && (
        <div data-testid="usage-solo-lever" style={{ ...PANEL, flexDirection: 'row', gap: '12px', alignItems: 'baseline' }}>
          <span style={{ color: 'var(--color-accent-400)', fontSize: '11px', flex: 'none' }}>●</span>
          <span style={{ fontSize: '11px', lineHeight: 1.55, color: 'var(--color-neutral-400)', textWrap: 'pretty' }}>
            {`${lever.name} is the lever: ${formatTokens(lever.tokens ?? 0)} tokens on ${lever.model ?? lead.model} to return ${wordsOf(lever.returnedSummary)} word${wordsOf(lever.returnedSummary) === 1 ? '' : 's'}`}
            {cheaper
              ? `. The same ${lever.agentType ?? 'Task'} call on ${cheaper.model} would cost about ${formatCost(cheaper.costUsd)} instead of ${formatCost(leverCost)} — the parent reads the same summary either way.`
              : ` for ${formatCost(leverCost)}.`}
          </span>
        </div>
      )}
    </div>
  );
}
