# Usage & cost dashboard

Spec for `Octo Usage Dashboard.dc.html`. One design, **two modes** chosen by the same trigger that chooses the console's mode: a running agent team, or a dynamic workflow run. Toggle at the top right (`Team session` / `Workflow run`); nothing else on the page is shared between them.

**Fidelity: high.** Every colour, size and copy string below is in the HTML.

## Where it lives

**Built as one more view inside each console mode** — `usage`, last pill in the status-bar switcher in both team mode (`#4a`) and workflow mode (`#6a`) of `Octo Session Console.dc.html`. It reads the same store as the other views and shares the chrome; nothing about the status bar, needs-you strip or panel changes when it is selected. The standalone `Octo Usage Dashboard.dc.html` is the **full-size study** — more panels, more chart detail, drawn at 1272px on the doc ground — and stays the reference for anything the in-console version condenses.

The in-console version carries **the full panel set below** — stacked-area spend, donut, rate card, composition, context pressure, ledger, coordination and the worth-it estimate in team mode; banner, tiles, phase Gantt, concurrency, burn-vs-projection, scatter, agent table and relaunch economics in workflow mode. It is drawn in the console's monospace at 1180px, so the panels are tighter than the study and the body scrolls; nothing is left out. Sizes below are the study's; scale them, don't drop them.

**Context is not the token total.** The wall meters an agent's context window; billed tokens are the turns that re-read that window, so they are a multiple of it. Show both, and never label one as the other.

Originally intended as — a seventh in team mode's switcher, a fifth in workflow mode's — reading the same store as the others (picked session, focused agent). The prototype draws it standalone at 1272px on the doc ground so the charts could be sized honestly; inside the console it fills the body under the existing status bar, and the mode toggle drawn here is redundant (the console already knows which mode it is in). The mode toggle exists only in the standalone study; inside the console the mode is already known, so there is no toggle.

Scoping is by row click: a team ledger row sets the focused agent, a workflow phase row sets which phase the agent table lists. There is no separate filter chrome.

## The cost model — read this before drawing any number

Neither engine reports dollars. **Every currency figure on this page is derived client-side** from token counts at API list price, and the page says so (`API list price` beside the toggle, and the footer). Four token classes bill differently:

| class | price |
| --- | --- |
| input | model input rate |
| output | model output rate |
| cache **write** | input rate × **1.25** |
| cache **read** | input rate × **0.1** |

```
cost = (in·rIn + out·rOut + cacheWrite·rIn·1.25 + cacheRead·rIn·0.1) / 1e6
```

Rate card in the prototype (`$`/Mtok, in / out): Opus 15 / 75, Sonnet 3 / 15, Haiku 1 / 5. **Read the live rates from config, never hard-code them** — the rate card panel exists so the operator can see which numbers produced the totals, and a stale card is worse than no card. Hide it with the `showRateCard` prop where the target app already publishes rates elsewhere.

Three rules that follow:

1. **Cache reads dominate and must be visible.** In the team fixture they are ~78% of all tokens, which is the difference between the shown total and roughly 2.6× it. A dashboard that draws one "tokens" number teaches the operator the wrong mental model of their bill. Every token readout on this page splits in / out / cache-write / cache-read somewhere within one glance of itself.
2. **A teammate's cache TTL is 5 minutes by default**, separate from the main conversation's bucket, so a teammate idle longer than that pays the write again on its next turn. `subagentPromptCacheTtl: 1h` extends it and bills writes higher. This is the single most useful thing the dashboard can explain, and it sits in the rate-card footnote.
3. **Never mix derived dollars with plan consumption.** On a subscription the same usage meters against plan limits, not a bill. Either label the basis (as here) or draw plan percentage instead — never both in one figure.

Sources: per-agent `tokens` from the team's session files; per-agent `tokens`, `toolCalls`, timings and `cached` from the workflow run snapshot, with `journal.jsonl` the only live source (see *Screen 3* in `README.md` — a live run and a finished run remain two different screens, and that applies here: **projection panels are live-run-only, and the phase Gantt's pending rows must not be drawn as measured**).

## Frame and shared shell

- Page: `width: 1272px`, `padding: 26px 28px 40px`, `display: flex; flex-direction: column; gap: 16px`, ground `#0f111b` (the doc ground, one step below `--color-bg`).
- Header row: title `Usage & cost` (Inter 500, 19px, `--color-text`) over a mono subtitle in `--color-neutral-600` carrying session/run identity. Right: the mode toggle (2px-padded pill group, 1px `--color-neutral-900` border, radius 7px, on `--color-bg`; active tab `--color-accent-900` ground with `--color-accent-300` text) then `API list price` in `--color-neutral-700`.
- **Panel:** `background: var(--color-bg)`, `1px solid var(--color-neutral-900)`, `border-radius: var(--radius-md)`, `padding: 14px 16px`. Title Inter 500 12.5px `--color-text`; the right-hand caption mono 10.5px `--color-neutral-600`. **Both are `white-space: nowrap`** — a wrapping panel title changes the panel's height and desynchronises the two columns of a row.
- **Tile:** same shell, `padding: 12px 14px 13px`, `gap: 7px`: label mono 9.5px uppercase `letter-spacing: .09em` `--color-neutral-600`; value **mono 500 23px**; note Inter 11px `--color-neutral-500`. Five tiles per row, `flex: 1`.
- Two-column rows are **780px + flex**, never 50/50 — the wide chart needs the pixels and the narrow panel is a list.
- **Charts are SVG geometry with HTML labels.** Every axis scale, tick and annotation is an absolutely-positioned `div` over a `position: relative` wrapper, not `<svg><text>`: SVG text does not survive the design tooling's rendering path, and it is not editable in place. The SVG holds only `<path>`, `<line>`, `<circle>`. Keep this split in the rebuild if the app has the same constraint; otherwise a chart library is fine, provided the scales stay drawn.
- Series colour is **the accent ramp in order**, never a categorical palette: `--color-accent-300` `#d2cefd` → `-400` `#b5abfc` → `-500` `#968ae0` → `-600` `#796cbf` → `-700` `#5d5294`. Grid lines `--color-neutral-900`; chart grounds `#12141f`; tick labels mono 9.5px `--color-neutral-600`.
- **No warn/fail colour anywhere on this page.** Money is not a failure state. Cost pressure is expressed by ramp position and by prose, and the one genuinely alarming state (the Large-workflow banner) uses the accent, not amber.

## Team mode

**Purpose:** answer *what is this team costing me, where is it going, and was the parallelism worth it* without leaving the console.

**Tiles:** session cost (+ per-hour burn at current rate) · tokens (+ in / out / cache-read split) · cache hit rate (+ dollars avoided) · agents (+ working/idle and the last spawn) · cost per task (+ tasks closed). Cost per task is the only tile that divides by a countable — do not add cost per message or per line.

1. **Cumulative spend, stacked by agent** (746×176 + labels). One filled area per agent, stacked, drawn back-to-front so the lead reads on top; `$` ladder in five steps to 1.08× the total; dashed `--color-neutral-600` verticals at spawn and review events with the label at the top. A teammate's area is flat at zero before its spawn minute — **the staircase of spawns is the point of the chart**, so never distribute a teammate's spend across the whole session.
2. **Spend by model** — donut, `r: 40`, `stroke-width: 14`, track `--color-surface`, segments rotated `-90`, one ramp step per model. Legend rows carry cost, share, agent count and **`$/Mtok`** — the last one is why the panel exists: it shows Opus costing 5× Sonnet per token at a glance.
3. **Rate card** — the table above, plus derived cache-write and cache-read columns (read column in `--color-accent-500`) and the TTL footnote. `showRateCard` hides it.
4. **Where the tokens go** — one 16px stacked bar per agent on `#12141f`, radius 3, segments in fixed order cache-read → cache-write → input → output (ramp `-700`, `-500`, `-400`, `-300`), with the agent name right-aligned at 74px, total tokens and cost trailing. Footnote states the cache-read share and the TTL consequence.
5. **Context window pressure** — one 6px bar per agent against 200k, coloured by band (>140k `-300`, >100k `-500`, else `-700`). Footnote: the lead holds every teammate summary, and **compaction there rewrites the cached prefix and costs a full cache write across the team** — the cost consequence of the context meter the wall already draws.
6. **Per-agent ledger** — the numeric table, columns `132 132 96 84 108 92 76 64 84 1fr`: agent (status dot in its series colour) · type · model · status · context (inline 5px meter + figure) · tokens · cache hit · msgs · tasks · cost. Header mono 9.5px `--color-neutral-700` on `#12141f`; rows mono 11.5px, hairline `#1d1f2b`; selected row `#1c1e2c`. Footer row totals tokens, cache hit, msgs, tasks and cost on the same ground. **Click a row to scope** the panels above.
7. **Coordination overhead** — messages per 2 minutes as 17 bars (78px tall, the live pair in `-400`, history `-600`), then three figures: messages delivered, spend attributable to re-reading inboxes, agent time idle. This is the panel that justifies or damns the team, and it must be labelled as attribution, not measurement.
8. **Was the team worth it** — three bars: this team's actual cost, an estimate of the same task list run serially, and the ratio as *cost of parallelism*. **Explicitly captioned `estimate`**, and the third row's note says what the premium buys (wall-clock time and independent review, not fewer tokens). Do not present the serial figure as a measurement; it cannot be one.

## Workflow mode

**Purpose:** the run's economics while it is still cheap to stop.

**Large-workflow banner** (top, only when it fires): accent badge `LARGE WORKFLOW` (`flex: none; white-space: nowrap` — it is the first thing a narrow viewport crushes) on `#1b1a2c` with a `--color-accent-700` border, text `--color-accent-300`. Fires past `agentWarnThreshold` scheduled agents (default 25) **or** 1.5M projected tokens. Copy states it is advisory and does not pause the run, and names where to stop it.

**Tiles:** run cost so far (+ projected at completion) · tokens (+ projection, and the note that the session model applies to every agent) · agents `started/planned` (+ done/running/failed/stopped) · peak concurrency (+ time spent at the cap) · prefix cache saved (+ how many siblings shared one prefix).

1. **Phases** — a Gantt of `{title, agents, start, end, status}`: name column 212px (status dot, running one pulsing 1.6s), a 22px track on `#12141f` with the phase bar positioned by percentage (done `-700`, running `-600`, pending `--color-surface`), then agent count / tokens / elapsed / cost right-aligned at 104 / 78 / 56 / 62px. **A pending phase shows `N agents queued` and em-dashes for tokens and cost** — never a zero, which reads as measured. Row click sets the agent table below. Footnote carries the two economic facts: the cache-read share (matching siblings share one prefix, so a fan-out phase spends almost nothing on its own prompt) and that the pending phases run on Opus, which is why projected cost climbs faster than projected tokens.
2. **Concurrency** — area + line to *now* only, y-axis to 18 with a dashed `--color-accent-500` line and `cap 16` label at the runtime cap. Footnote explains the notch at each fan-out edge: the runtime holds matching siblings up to 5s so the first one's prefix lands in cache before the rest start. **Draw nothing past now** — no projected concurrency.
3. **Token burn vs projection** — projection as a dashed `--color-neutral-600` line over `--color-surface` fill for the full span; actual as a solid `--color-accent-300` line over `#2b2741` up to a dashed `now` rule; the 1.5M warning line in `--color-accent-700`. **Y ladder rounds up to the next 0.5M** so the five ticks are round numbers (0 / 1.00M / … / 4.00M); scaling to 1.06× the projection gives ticks like `4.20M` and reads as noise. Footnote states which direction actual is tracking and why.
4. **Every agent in the run** — scatter, y tokens, x wall time, **radius by cost** (3–7px). Status is encoded by fill: done `-600`, running `-300`, stopped `--color-neutral-800`, **failed as a hollow ring** (`#161826` fill, `#e4e7f5` stroke) so a failure is findable without a second hue. Filter chips above (`all` / `done` / `running` / `failed` / `stopped`, each with its count; active chip `#2b2741` on a `-700` border) filter the points. Footnote names the outliers and what they were.
5. **Relaunch economics** — three bars answering *what does rerunning cost after a mid-fan-out failure*: tokens returned from saved results, tokens rerun from scratch, and the retry's dollar cost. The load-bearing sentence: a relaunch replays **in start order**, so the failed agent and **every agent started after it** run again — including ones that had already finished — and editing the script before relaunch invalidates everything after the first changed prompt. This panel is the reason an operator stops a run early rather than letting it fail late.
6. **Agents in "<phase>"** — table for the selected phase, columns `56 1fr 96 92 76 104 88 76`: index · task/label · model · status · time · tokens · cache hit · cost. Caption says `showing 8 of N` when truncated. Same table styling as the team ledger. Pending phases show em-dashes throughout, not zeros.

## Footer

Two columns of 10.5px `--color-neutral-700` prose, always present:

- The documented runtime caps as caps: **16 concurrent agents** (fewer on fewer CPUs), **4,096 items** per `parallel()` or `pipeline()` call, **1,000 agents** per run — and that the Large-workflow warning is advisory.
- That dollar figures are API list price derived from the token counts on the page, that subscription plans meter the same usage against plan limits instead, and that single-session comparisons are estimates.

Neither column is decoration. Both exist because a number on a dashboard is read as authoritative, and two of these numbers are not.

## Props (tweaks)

| prop | type | default | effect |
| --- | --- | --- | --- |
| `mode` | `'team' | 'workflow'` | `team` | which mode the page opens in (the toggle overrides at runtime) |
| `showRateCard` | boolean | `true` | hides the rate-card panel where the app publishes rates elsewhere |
| `agentWarnThreshold` | int 5–100 step 5 | `25` | scheduled-agent count that fires the Large-workflow banner |

## State

Derived, not stored — the dashboard owns no source of truth. Per agent (team): `name`, `agentType`, `model`, `status`, `contextTokens`, `spawnedAt`, `messages`, `tasksClosed`, `tokens {in, out, cacheWrite, cacheRead}`. Per phase (workflow): `title`, `agentCount`, `doneCount`, `startMs`, `endMs`, `status`, `model`, `tokens {…}`. Per agent (workflow): `index`, `label`, `model`, `state`, `cached`, `durationMs`, `tokens {…}`. Rates from config. UI state: mode, selected agent, selected phase, scatter filter — persist mode and selection in the URL like the other views.

Everything else on the page is computed: totals, hit rates, per-hour burn, cost per task, projections, the serial-session estimate. **Compute from one function and one fixture** so no two panels can disagree — in the prototype every dollar on the page comes from the same `cost()` call over the same token records, which is why the tiles, the ledger footer, the donut and the stacked chart all reconcile.
