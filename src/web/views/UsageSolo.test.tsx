// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { Subagent, TeamState } from '../../shared/domain';
import { FIXTURE_NOW, sampleTeamState } from '../test/state-fixture';
import { formatCost, formatTokens } from '../format';
import { rateOf } from '../../shared/cost';
import { subagentSpendUsd } from './usage-team';
import { UsageSolo, cheaperEstimate } from './UsageSolo';

afterEach(cleanup);

function call(over: Partial<Subagent>): Subagent {
  return {
    toolUseId: 'toolu_1',
    name: 'scout',
    agent: 'lead',
    parent: 'lead',
    depth: 1,
    spawnIndex: 0,
    siblingGroup: 'rec-1',
    state: 'returned',
    queuedAt: FIXTURE_NOW - 120_000,
    startedAt: FIXTURE_NOW - 119_000,
    returnedAt: FIXTURE_NOW - 20_000,
    durationMs: 99_000,
    children: [],
    ...over,
  };
}

// One parent, two calls, one of them nesting a third: the shape study 8 draws.
function soloState(): TeamState {
  const base = sampleTeamState();
  const lead = base.agents[0];
  const grep = call({
    toolUseId: 'toolu_grep', name: 'grep-callsites', parent: 'toolu_plan', depth: 2, agentType: 'Explore',
    model: 'claude-haiku-4-5', tokens: 6_300, costUsd: 0.02, toolCalls: 6, returnedSummary: '34 sites, 4 of them read expires_at directly',
    tokenSplit: { in: 1_000, out: 300, cacheWrite: 5_000, cacheWrite1h: 0, cacheRead: 40_000 },
  });
  const plan = call({
    toolUseId: 'toolu_plan', name: 'migrate-plan', agentType: 'Plan', model: 'claude-opus-5', tokens: 28_700, costUsd: 2.4,
    toolCalls: 41, returnedSummary: 'Two-phase migration: add nullable columns and backfill behind a flag.', children: [grep],
    tokenSplit: { in: 4_000, out: 2_700, cacheWrite: 22_000, cacheWrite1h: 0, cacheRead: 300_000 },
  });
  const tests = call({
    toolUseId: 'toolu_tests', name: 'write-tests', spawnIndex: 1, state: 'running', agentType: 'general-purpose',
    model: 'claude-sonnet-4-5', tokens: 6_200, costUsd: 0.3, toolCalls: 9, returnedAt: undefined, durationMs: undefined,
  });
  return {
    ...base,
    agents: [lead],
    totalCostUsd: lead.costUsd + 2.4 + 0.02 + 0.3,
    subagents: { [lead.name]: [plan, tests] },
  };
}

function renderSolo(state = soloState()) {
  const onOpenCall = vi.fn();
  render(<UsageSolo state={state} now={FIXTURE_NOW} onOpenCall={onOpenCall} />);
  return { state, onOpenCall };
}

describe('UsageSolo — tiles', () => {
  it('draws five tiles and reads session spend off the status bar’s own total', () => {
    const { state } = renderSolo();
    expect(screen.getAllByTestId('usage-tile')).toHaveLength(5);
    expect(screen.getByTestId('usage-solo-spend-value').textContent).toBe(formatCost(state.totalCostUsd));
  });

  it('puts the subagents’ spend and tokens against the whole', () => {
    renderSolo();
    expect(screen.getByTestId('usage-solo-sub-value').textContent).toBe(formatCost(2.72));
    expect(screen.getByTestId('usage-solo-sub-note').textContent).toBe(`${Math.round((2.72 / (1.31 + 2.72)) * 100)}% of the spend · ${formatTokens(41_200)} tokens`);
  });

  it('estimates what reached the parent from the returned summaries, four characters a token', () => {
    renderSolo();
    const shown = Math.ceil('34 sites, 4 of them read expires_at directly'.length / 4)
      + Math.ceil('Two-phase migration: add nullable columns and backfill behind a flag.'.length / 4);
    expect(screen.getByTestId('usage-solo-shown-value').textContent).toBe(formatTokens(shown));
    expect(screen.getByTestId('usage-solo-shown-note').textContent).toBe(`${Math.round(41_200 / shown)}:1 against what the subagents spent`);
  });

  it('reads the parent’s context against its own window', () => {
    const { state } = renderSolo();
    const lead = state.agents[0];
    expect(screen.getByTestId('usage-solo-context-value').textContent).toBe(formatTokens(lead.contextTokens));
    expect(screen.getByTestId('usage-solo-context-note').textContent).toContain(`of ${formatTokens(lead.contextLimit)}`);
  });
});

describe('UsageSolo — where the tokens go', () => {
  it('draws one window per call after the parent, with the four classes where a split is recorded', () => {
    renderSolo();
    const rows = screen.getAllByTestId('usage-solo-window');
    expect(rows.map((r) => r.firstElementChild?.textContent)).toEqual(['team-lead', 'migrate-plan', 'grep-callsites', 'write-tests']);
    expect(within(rows[0]).getAllByTestId('usage-solo-segment')).toHaveLength(4);
    expect(within(rows[1]).getAllByTestId('usage-solo-segment').map((s) => s.getAttribute('data-segment'))).toEqual(['cacheRead', 'cacheWrite', 'in', 'out']);
    // A call from before the digest recorded its split draws an empty bar, not a guess.
    expect(within(rows[3]).queryAllByTestId('usage-solo-segment')).toHaveLength(0);
  });
});

describe('UsageSolo — per-call ledger', () => {
  it('lists the parent turn, then every call depth-first with its depth, and totals what they cost', () => {
    const { state } = renderSolo();
    expect(screen.getByTestId('usage-solo-parent').textContent).toContain('parent turn');
    const rows = screen.getAllByTestId('usage-solo-call');
    expect(rows.map((r) => r.textContent?.includes('grep-callsites') ? 2 : 1)).toEqual([1, 2, 1]);
    expect(rows[1].textContent).toContain('Explore');
    const calls = [2.4, 0.02, 0.3];
    rows.forEach((row, i) => expect(within(row).getByTestId('usage-solo-call-cost').textContent).toBe(formatCost(calls[i])));
    expect(screen.getByTestId('usage-solo-foot-cost').textContent).toBe(formatCost(state.totalCostUsd));
  });

  it('shows a running call’s time so far and a returned call’s duration', () => {
    renderSolo();
    const rows = screen.getAllByTestId('usage-solo-call');
    expect(rows[0].textContent).toContain('1m 39s');
    expect(rows[2].textContent).toContain('1m 59s');
  });

  it('opens the call a row names in the trace', () => {
    const { onOpenCall } = renderSolo();
    fireEvent.click(screen.getAllByTestId('usage-solo-call')[1]);
    expect(onOpenCall).toHaveBeenCalledWith('toolu_grep');
  });

  it('captions the ledger when a call is priced by derivation rather than its own digest', () => {
    const state = soloState();
    const [plan, tests] = state.subagents![state.agents[0].name];
    state.subagents = { [state.agents[0].name]: [plan, { ...tests, costUsd: undefined }] };
    renderSolo(state);
    expect(screen.getByTestId('usage-solo-ledger-caption').textContent).toContain('derived at the cache-read rate');
    expect(within(screen.getAllByTestId('usage-solo-call')[2]).getByTestId('usage-solo-call-cost').textContent)
      .toBe(formatCost(subagentSpendUsd({ tokens: 6_200, model: 'claude-sonnet-4-5' })));
  });

  it('has only the parent row, no lever and says so on a session that has dispatched nothing', () => {
    const state = soloState();
    delete state.subagents;
    renderSolo(state);
    expect(screen.queryAllByTestId('usage-solo-call')).toHaveLength(0);
    expect(screen.getByTestId('usage-solo-ledger-caption').textContent).toBe('no Task call yet');
    expect(screen.queryByTestId('usage-solo-lever')).toBeNull();
  });
});

describe('UsageSolo — the lever', () => {
  it('names the dearest call, what it returned, and what the same call costs on the cheapest card', () => {
    renderSolo();
    const text = screen.getByTestId('usage-solo-lever').textContent ?? '';
    expect(text).toContain(`migrate-plan is the lever: ${formatTokens(28_700)} tokens on claude-opus-5 to return 10 words.`);
    const cheaper = cheaperEstimate(2.4, 'claude-opus-5')!;
    expect(text).toContain(`The same Plan call on ${cheaper.model} would cost about ${formatCost(cheaper.costUsd)} instead of ${formatCost(2.4)}`);
  });

  it('scales the bill by the ratio of input rates, and has nothing cheaper to offer the cheapest model', () => {
    const cheaper = cheaperEstimate(2.4, 'claude-opus-5')!;
    expect(cheaper.costUsd).toBeCloseTo((2.4 * rateOf(cheaper.model).input) / rateOf('claude-opus-5').input, 12);
    expect(cheaperEstimate(0.02, cheaper.model)).toBeUndefined();
  });
});
