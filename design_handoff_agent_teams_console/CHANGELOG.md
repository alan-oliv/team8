# Changelog

Read this if you already built an earlier version of this console — it lists what changed, so you can patch rather than rebuild. Newest first.

## Overview is an overview now (2b, and the 4a `overview` pill)

The old overview was the wall shrunk to fit. The new one answers the question the wall cannot: *what is the team doing, and where does it stand?*

- **Brief** — three short paragraphs (NOW · WAITING · NEXT) written by a small model from the last five minutes of every transcript plus the task list. The header names the model, its inputs and when it last ran; `↻ regenerate` is `POST /api/sessions/:id/brief` (tooltip says so). It re-runs on every task-state change. Footer: token in/out, cost per run, and the disclaimer that it is a reading, not a record — every claim can be found in an agent's wall. Never render a brief older than the newest task change without the age showing.
- **Where it stands** — the segmented task bar (completed · in progress · blocked), state counts (working · idle · waiting on you · failed · findings), and NEXT UNBLOCK: which open task is unclaimed and what chain waits on what. All derived from `TaskList` and member state.
- **Agent rows** — one per member: portrait, name, state, type · model; TRYING TO = the task it owns (`TaskList.owner`) with its subject and the runtime's own `activeForm` from its last `TaskUpdate`; NOW = current tool and how long; LAST REPORTED = the most recent `SendMessage` summary (arrow shows the recipient) or transcript line, with age; CONTEXT meter, elapsed and spend. Click a row → wall, focused on that agent.
- Nothing on this screen is invented by the console except the brief, and the brief says who wrote it.

## Teammates column in pill order

The teammates column now reads top to bottom as the 4a switcher reads left to right: **4a** (the switcher) first, then one turn holding the views in pill order — **3a wall · 2b overview · 3b tasks · 1a rail · 1b grid** — then 5 (drawer), 7 (leaving a session), and 1c (the early ASCII fan-out study) last. `comms` and `usage` have no standalone study; they are reached through 4a. Ids are unchanged so every existing link holds.

## Turn 2 dropped — 2a repeated the wall

2a (column wall) was the same screen as 3a. Turn 2 is gone; **2b overview** moved under turn 3 next to wall and tasks, keeping its id so the 4a `overview` pill still links to it. Teammates column: 5 studies.

## Logo and name: team8

The console's wordmark is now the **team8 · figure** mark (logo study 4b): a pixel 8 built from eight nodes on a 12×12 grid, two stacked rings sharing the middle pair; the lead pixel pair is `--color-accent-300`, the teammates `--color-accent-500`. It sits alone at the left of every status bar, 20px, with no wordmark beside it (`title="team8"` for the tooltip). Every "OCTO" / "octo" reference is gone: repo folders are `team8`, `team8-cli`, `team8-docs`; the branch fixture is `feat/team8-runtime`; the launch line reads `claude --team8 5 …`.

Build note: draw the mark as inline SVG from the 12×12 grid (`M{x} {y}h1v1h-1z` per pixel, `shape-rendering: crispEdges`), never as a raster — it is also the favicon at 16 and the app icon at 512.

## Study names follow the 4a switcher

The 4a pills were already right: `wall · overview · comms · tasks · rail · grid · usage`. The study captions used other words for the same screens, so they now lead with the pill name: 3a **wall**, 2b **overview**, 3b **tasks**, 1a **rail**, 1b **grid**. Nothing in the console changed — keys, labels and bar geometry are as before.

**8c (fan-out) removed** — it never corresponded to a real view. 8a (trace) and 8b (Task row) are the sub-agent studies.

## Output view — where the return value is read

The run view showed only the opening of a finished run's return. `output` is now a view in the switcher (run · **output** · agents · script · journal · usage) on every workflow card.

- **Finished:** sticky header `✓ return value · returned hh:mm:ss · words · sources` with `copy` and `save .md`; then the return rendered as a document — title, summary line, sections, and a SOURCES list with the count and a "+ n more" line. The Returned block's verb is now `open output`.
- **Running:** an empty state — *no output yet* — with one sentence saying a workflow returns once, at completion, plus the current elapsed and agent count. No placeholder progress.

## Finished run — the result lands on top (9c)

Nothing in the run view showed what a run produced once it ended. A run reports only at completion, and the one artefact it produces is the script's return value, so 9c puts that first.

- **Returned block** above the phase list, shown only when the run has returned: `✓ Returned · returned 14:21:08 · 19m 02s`, a one-line summary, the opening paragraphs of the return, a *full return … in the journal* line, and two verbs — `copy return` (clipboard) and `open in journal` (switches to the journal view, where the final entry is the run's return).
- **Phases fold to headers** when the run is finished (glyph, title, detail, tally, caret); click a header to reopen. Running runs still open by default. Fold state is per phase, per run.
- **Bar** gains `✓ returned 14:21:08`; context/tool/elapsed figures stop ticking. Rail **LIVE → FINAL** with the note *what the run spent, frozen at return*. Footer becomes *the run has returned — its result is above and nothing more will arrive. re-invoke with this run id to resume from cache.*

## Run view rebuilt from what a run records (turn 9 — 9a, 9b)

The old 6a run view was drawn from a fixture whose items happened to flow through every phase, and it invented four figures the data never carries (budget %, slot count, barrier chip, "background"). Turn 9 starts over from the data model. 6a stays on the canvas as history; **9a/9b supersede it for the run view**.

- **Phase list, not item grid.** Each phase is a block: state glyph, title, one-line detail, and a right-aligned tally of agent states (`2 running · 1 returned`). Inside, agents are grouped under a rule labelled with the one grouping fact always recoverable — `6 dispatched together · 14:02:40` (agents sharing an exact dispatch timestamp). No `parallel`/`pipeline` chip anywhere: a barrier belongs to a call, not a phase. Large groups list a few rows and fold the rest into `+ 11 more, all returned`.
- **Shared items fold into the same list (9b).** When every phase's labels resolve to one item set, each row gains a trail of glyphs — that item's state in each earlier phase (`⤿ ✓`), hover for phase name. The header note flips from *no item grid — labels do not resolve…* to *7 work items shared across every phase*. Same screen either way.
- **Live figures carry the weight.** Status bar right side: `4.7M ctx · 533 tools · 14m 06s`, full text colour. Rail top block LIVE repeats them at 19px with a one-line caveat: *the run's own spend · a run has no budget to measure it against*. No budget row, no bar, no em-dash.
- **AGENTS block** = `36 of 1000 lifetime cap` with a thin segmented bar (returned+cached / running / null+failed as a fraction of the cap) and one row per state with its count; zero-count states dim rather than disappear.
- **CONCURRENCY** shows only the formula `min(16, CPUs − 2) agents at once` and why the slot count is absent.
- **NARRATION** is timestamped log lines; warnings in the warn colour.
- **No skip / stop buttons; no "background" word.** Footer is a sentence: *you are not in the loop — a workflow opts in at launch and reports when it lands. nothing here steers it.*
- **Two pickers** in the bar: the session picker (workflow chip + goal) and a run picker (`deep-research  wf_0b341df2-45e ▾`).

Regression to watch: the finished-phase tally sums hidden agents as returned — a running agent is never hidden, so this is safe, but keep it that way when wiring real data.

## Session picker is folder-scoped (rev 6)

The dropdown is no longer "sessions on this machine". A session is created in a working directory and never leaves it, so the picker is scoped to a folder.

- **Title is a folder picker.** The menu header reads `SESSIONS ON` + a clickable folder chip showing the folder name and its path (`octo · ~/code/octo`), with the count of sessions in that folder on the right. Clicking the chip opens a second, narrower menu listing every folder the daemon has seen sessions in, each with its own session count; picking one filters the list and closes the folder menu.
- **The list filters by repository.** Only sessions whose working directory matches the selected folder are listed. `SESSIONS[8]` is the repo slug; `REPOS` maps slug → folder name → path.
- **Default scope.** Until the operator points the picker elsewhere, the folder shown is the one the *current* session lives in (`state.repo` falls back to `sessions[si].repo`), so opening the menu never scopes away from what you are watching.
- **Footer note** now states the scope: "N of M sessions are in this folder · switch folders to see the rest". Opening the session dropdown closes the folder menu, so only one is ever open.

Runtime: the folder list is the daemon's known project directories; the session list is that directory's sessions only. Nothing cross-folder is shown — switching folder is an explicit act.

## Subagents — the trace view, the Task row, the fan-out bracket (rev 5)

Turn 8 in the HTML (`8a`, `8b`, `8c`). Subagents get **no third mode**: they are never in `members[]`, cannot be addressed, have no inbox and return exactly once, so a roster, a composer and per-agent stop would all be UI with nothing behind them. What they do get is one new view and one new transcript row.

- **`trace` (`8a`) — the new view, in solo sessions.** The parent turn as the top lane, subagent lifelines under it on a shared time axis, indent = spawn depth (arbitrary; the reference shows depth 3). Per row: name, agent type badge, model, bar, tokens. Header strip carries subagent count, max depth, tokens spent inside subagents, tokens actually shown to the parent, and spend — the 44:1 ratio between the last two is the reason the view exists. Selecting a row opens a detail panel: the subagent's own 16-cell context bar, tool-call count, duration, its `agent-*.jsonl` sidecar, and the returned summary under `⎿`.
- **The Task row (`8b`).** Collapses to one line like any tool call (`⏺ Task(migrate-plan) [Plan] · 28.7k · 3m 12s ▸`) and expands into the **same drawer as `5b`** — no new container. Inside: the subagent's own header line (model, context cells, tokens, calls, duration), then its transcript at **0.62 opacity** against the parent's, to say *nested chain* rather than *another agent's pane*. A nested Task row inside the drawer expands the same way, any depth. The `⎿` result stays at full strength: it is the only thing the parent ever read.
- **Fan-out (`8c`).** N Task calls in one turn are **siblings, not columns** — one `⏺ Task ×3 dispatched in parallel` line above a strip of state chips (dot, name, type, tokens, elapsed/returned). No wall: a column you must watch is the wrong affordance for something you cannot talk to. Returned results land under the strip as `⎿` lines attributed by name; the pending count says the turn cannot continue until all of them return.
- **Cost surfacing.** Status bar gains `N subagents · <tokens>` beside the view switcher. A subagent can burn 40k tokens behind a one-line summary and nothing in the old design said so.
- **One control, stated not offered.** `esc` interrupts the parent turn and takes every subagent under it. There is no per-subagent stop, so no chip carries one; the footer says this in prose instead.
- **No portraits.** Type glyph and badge only — a portrait would imply membership.

## One theme picker, and portraits that carry accessories (rev 4b)

Three changes on top of rev 4, two of them fixes to it.

- **One dropdown called `theme`.** The system palettes are prefixed ‘System default’ (`System default · Nocturne`, `… · Organic`, and so on) and sit above the films under a `SYSTEM` header; the films sit under `FILM · names, portraits and palette`. Picking a film sets its cast’s names, portraits and colours together, which is what the two separate pickers were pretending were independent. A system row means real agent names. The last system theme picked is remembered, so a film’s `film palette` switch has somewhere to fall back to; that switch now only appears while a film is selected.
- **Accents follow the theme.** A system theme still offers its four accent schemes. A film carries one accent ramp — its own — so the four-swatch row is replaced by that single swatch and its name. Four invented variants of somebody’s grade would be four wrong answers.
- **Accessories, because colour alone is not recognition.** Each role slot can list features drawn over the role silhouette on the same 12x12 grid: `bald`, `shades`, `specs`, `visor`, `fedora`, `pointyhat`, `wildhair`, `goatee`, `beard`, `longhair`. Applied in list order (`['bald','fedora']` puts the hat on the scalp, not under it) and painted in the character’s own look colours, so an accessory never carries a colour of its own. The Matrix crew wear lenses; the chemist is bald under a pork pie hat with a goatee and glasses; the wizard has a pointed hat and a beard to row 8. Still not likenesses — hats, hair and lenses, no facial features.
- **Fixed: near-black garments vanished on near-black grounds.** Pulp Fiction’s lead read as a floating face — garment at 1.06:1 against the pane, hair at 1.01:1, outline at 1.29:1. The look data keeps the film’s real colours; the console now lifts garment, hair, outline, skin and lens pixels against the active palette’s ground at render time, hue preserved and lightness moved, garment lifted hardest because it carries the shape. Lenses are lifted too: a black lens on a black ground is a hole, not a pair of sunglasses.
- **Fixed: `warn` collided with the accent on the three gold palettes.** Inception, LOTR and The Godfather drew attention in amber next to a gold accent — 1.12:1 against the accent base. All three shift warn to a lighter rose-orange, a different hue from their accent and a different lightness from their fail. The rule in `movie-themes.json` now names both pairs, not just fail.

## Film palettes and character looks (rev 4)

A movie theme now carries a colour scheme and per-character portrait colours. `movie-themes.json` is version 2 and stays canonical; the console mirrors it.

- **A palette per film, read from the film’s own grade** — the light the story is shot in, never artwork or a logo. Inception cold steel against the warm of the kick; Stranger Things dark teal with the Upside Down bleeding red; Star Wars black space where the only light that matters is a blade; The Matrix phosphor green because you are inside the screen; The Godfather business conducted after dark under a desk lamp; Reservoir Dogs black, white, and one colour that is not either; Breaking Bad the show’s own desert yellow-green.
- **The palette overrides ground, text and the accent ramp; the neutral ramp is inherited** from a base theme each palette names (`neutralsFrom`: cool films take Nocturne’s blue-greys, hot and monochrome ones Slate’s zero-hue steps). Guessing neutrals per film is how a console ends up with unreadable hairlines.
- **`warn` and `fail` are declared per palette, never derived.** A film whose accent IS red cannot also draw failure in red — Reservoir Dogs and Pulp Fiction both shift `fail` to a rose that survives beside the accent.
- **The old rule “a theme sets names only” is now a switch, not a law.** `film palette` sits under the movie-theme picker, defaults on, and turned off returns a theme to names and portrait colours only. The theme row shows a `film palette · <name>` chip while the film is driving, and the accent-scheme swatches say “overridden by the film” rather than silently doing nothing.
- **Character looks: five colours over the unchanged role silhouette** — skin, skin shade, garment, garment shade, hair (`s|S|a|b|h`), keyed by role slot exactly like names. That is what a 12x12 grid can honestly say about who is wearing it: a coat colour, a hat colour, hair. No facial features, no likenesses. An agent beyond the theme’s slots keeps the default role portrait.
- **The movie-theme menu shows each film’s three-band swatch** (ground, accent, text), so the scheme is visible before committing — same pattern as the theme picker.
- Legal note widened: a film’s visual identity is IP too. These are hand-picked colours in the spirit of a grade and recolours of a generic sprite; personal or internal use only.

## Usage view brought up to the full study (rev 3c)

The in-console `usage` views now carry **every panel from the standalone study**, drawn at console scale in the console's own type and tokens. Nothing is condensed out any more, so `USAGE-DASHBOARD.md` describes both.

- **Team mode:** five tiles · cumulative spend stacked by agent (SVG areas, HTML axis labels, dashed spawn markers) · spend-by-model donut with `$/Mtok` · rate card with derived cache-write and cache-read columns and the 5-minute TTL footnote · where-the-tokens-go composition bars · context-window pressure with the compaction note · full per-agent ledger (type, model, status, context meter, tokens, cache hit, msgs, tasks, cost; click to focus in the wall) · coordination overhead · was-the-team-worth-it.
- **Workflow mode:** Large-workflow banner · five tiles · phase Gantt with real start/end offsets, click to scope the agent table · concurrency to *now* with the cap line · burn vs projection with the 1.5M warning line · per-agent scatter with status filter chips (null returns drawn hollow) · agent table for the selected phase · relaunch economics · runtime caps.
- **Context vs billed tokens are now distinct.** The wall meters the context window; billed tokens are the turns that re-read it, so the ledger shows both and the composition footnote says which is which. Earlier the usage view reused the context figure as the token total.
- **Money ladders use whole-dollar steps.** A quarter-of-max ladder on a \$4.55 total rounded to \$0, \$1, \$2, \$4, \$5 — visibly uneven. The step is chosen from the range (0.5 / 1 / 2 / max÷5) and the ticks are drawn from it.
- **The per-phase agent table is a decomposition of its phase, not a second fixture.** It first generated each row's tokens and duration from an unrelated RNG, so a 1-agent phase reading `34k · 22s · $0.07` sat above a row reading `207k · 80s · $0.41` — one agent carrying 6x its phase's whole token count, in 4x its span. Rows now split `phase.tok` by seeded weights and take cost from the same `usdCost()` call, and a row's wall time is a fraction of the phase span (concurrent fan-out), never longer than it. Queued phases keep their em-dashes.
- Charts stay SVG geometry with HTML labels, no `<svg><text>`, and every figure still comes from the one `usdCost()` / `splitTok()` pair.

## Usage view wired into the console (rev 3b)

The dashboard is now a **view in the console**, not a separate page: `usage` is the last pill in the status-bar switcher in both modes (team `#4a` → seven views; workflow `#6a` → five). Same chrome, same store, same fonts and tokens as the other views.

- **Team mode `usage`:** five tiles (spend, tokens, cache hit, context windows, cost per task) · per-agent table with a four-class token bar (cache read / cache write / input / output), cache hit, `$/Mtok` and cost, **click a row to focus that agent in the wall** · right rail: by-model spend with the live rate beside each, spend per 2 min, and the three notes that actually move the number (teammate cache TTL, lead compaction as a team-wide cost, rates from config).
- **Workflow mode `usage`:** five tiles (run cost, tokens, agents, peak concurrency, cache read share) · per-phase table (pending phases show em-dashes, never zeros) · right rail: burn vs projection, concurrency, and the relaunch rule. Footer carries the runtime caps.
- **One cost function for both**, on the class: `usdCost(model, split)` over `RATES()`, with `splitTok()` producing the four classes. Every figure in both views comes from it, so no two panels can disagree — and the team view's total reconciles with the status bar's spend because it reuses the same per-agent `cost`/`crate` fixture the wall already ticks.
- The standalone `Octo Usage Dashboard.dc.html` stays in the bundle as the **full-size study** (stacked-area spend, donut, scatter, phase Gantt) — the reference for anything the 1180px in-console version condenses.

## Usage & cost dashboard added (rev 3)

New design, new doc: `Octo Usage Dashboard.dc.html` + `USAGE-DASHBOARD.md`. Nothing in the console changes; this is additive. Summary in *Screen 6* of `README.md`.

- **Two modes in one design**, on the same trigger as the console's own modes — team session and workflow run — with no shared panels between them. Toggle top right.
- **The cost model is the spec's centre of gravity.** Neither engine reports dollars, so the dashboard derives all of them: `cost = (in·rIn + out·rOut + cacheWrite·rIn·1.25 + cacheRead·rIn·0.1) / 1e6`, rates read from config, basis labelled on the page and in the footer. Cache writes bill at 1.25× input and reads at 0.1×, which is the whole reason the shown total is not ~2.6× larger.
- **Cache reads are ~78% of tokens in the fixture**, so no token figure appears without its in / out / cache-write / cache-read split within a glance. A teammate's cache TTL is 5 minutes by default (`subagentPromptCacheTtl: 1h` extends it and bills writes higher) — the most useful fact on the page, carried in the rate-card footnote.
- **Compaction on the lead is a team-wide cost**, not a lead-local one: it rewrites the cached prefix and costs a full cache write across the team. Stated under the context-pressure panel, next to the meter the wall already draws.
- **Relaunch economics get their own panel** because they change operator behaviour: a relaunch replays in start order, so a mid-fan-out failure reruns every agent started after it — finished ones included — and editing the script invalidates everything after the first changed prompt.
- **Estimates are captioned as estimates.** The team-vs-serial comparison and the burn projection are the two figures a reader would take as measured; both say what they are, and the footer repeats it.
- **No warn or fail colour on the page.** Money is not a failure state, so cost pressure is ramp position and prose; even the Large-workflow banner is accent. Series colour is the accent ramp in order, never a categorical palette.
- **Charts are SVG geometry with HTML labels** — every scale, tick and annotation is a positioned `div` over the SVG, which holds only `path`/`line`/`circle`. `<svg><text>` did not survive the tooling's render path and could not be edited in place. Two traps found while building: the burn axis must round its max up to the next 0.5M or the ticks read as noise (`4.20M`), and the Large-workflow badge needs `flex: none; white-space: nowrap` or it is the first thing a narrow viewport crushes.
- **Pending work draws em-dashes, never zeros.** A pending phase's tokens and cost are unknown, and a zero reads as measured. Same rule as the live-vs-finished run split in *Screen 3*: projection panels are live-run-only.

**Open:** whether this ships as a view inside each console mode (the recommendation — the toggle then becomes redundant) or as its own route. Placement note at the top of `USAGE-DASHBOARD.md`.

## Reconciled with the console at 0.6.5 — corrections, not new design

Read against `IMPLEMENTED.md` and `CONSOLE-NOTES.md` from the console repo. Everything below is this spec being **wrong** and now fixed; nothing here asks for new work. Section numbers refer to `CONSOLE-NOTES.md`.

**Doc bugs in this bundle, corrected**

- Bubble `max-width` was **78%** in the README and **64%** in the CHANGELOG. 64% wins, and the README now says so — one constant, consumed by both the pair thread and the everyone room. (§2)
- The `N idle agents` chip was documented under *Idle rows*, which read as a wall behaviour. It is a **panel** behaviour, and it has moved. (§4)
- **Struck:** click-to-focus widening a column, and collapsing idle rows after 30s. Neither existed in the prototype, and the second is self-defeating — it empties the wall exactly when the team is idle, taking the only composer off screen at the moment the operator wants to wake someone. Replaced with the rule the console built: **dim, don't hide** (0.55 opacity; an idle teammate reads at the same strength as a departed one). (§5)
- Screen 4's footer claimed a **lifecycle change**. It needed none: the idle reaper reads only the filesystem and keeps the process alive while any team has two or more members, and `stop watching` writes nothing to `~/.claude`. The claim is gone, with a warning not to touch the reaper — the ten-minute grace and the `SessionEnd` fast path are load-bearing. (§8)
- `Send now` on the in-flight badge is **dropped**. Nothing can force a turn boundary. The badge is a readout, and **clicking it opens that agent's messages in comms** — a count with no way to read what it counts is half a readout. (§1, §16)
- The identity column's **190px constant is gone**, replaced by the rule that produced it: measure your own corpus. The number does not travel — filenames measured 190px, `verb:key` labels measured 151px — and `label` is optional, defaulting to the prompt's first 60 characters (~432px), which no width holds. The 2-line clamp is now stated to cover the identity column. (§11)
- The script view's two tints are **per `agent()` call, not per source line.** No agent record carries a call site, and one line in a loop spawns N agents. Per-call is what the resume contract keys on anyway. (§10)
- The picker header is **`TEAMS ON THIS MACHINE`**, and the enumeration rule now says what it actually returns: Claude Code writes a team directory per *session*, so `~/.claude/teams/` lists **windows**. Filter to `members.length >= 2`. Lead-only rows are droppable, revealable, and inert when revealed. (§12)
- Palette rule restated: **no role borrows a semantic token** — the literal test passes on a palette that is still wrong. `--json-number` and `--json-null` are their own per-theme variables, and the token is **`--json-boolean`**. (§7)
- The compaction note has a **place**: its own header row under the context line, rendered only when it fires. Measured — it cannot sit beside the meter, which leaves ~31px spare on a 366px column against the note's 158px. (§3)

**Added to the spec because the console built them and this bundle never drew them**

- **Screen 5 — no team at all.** A sibling of Screen 4, not a mode of it: Screen 4 needs a team to point at, and this screen exists because there isn't one. States the cause, not the absence. (§13)
- **A third verb.** `✕` hides a picker row — browser-local like `stop watching`, but the row goes. The way back (`show them`, and the hidden count) appears in both the picker and the empty screen, or hiding the last row is a one-way door. (§14)
- **Four standing rules**, in their own section: every control names its runtime call; no role borrows a semantic token; anything in the chrome needs a source that survives an optional install; prose the reference build contradicts costs a builder an investigation.
- **The `✉` marker rule.** It draws *authorship*, not shape — so a batched delivery becomes one row per frame (six frames from three teammates in one record is real), and the spawn prompt is attributed: `✉ [team-lead] <brief>` rather than `❯ <brief>`. Three candidate discriminators that would preserve `❯` were tried and all fail. (§6)

**Workflow mode, rewritten at length** — see *Screen 3* in the README, which now leads with the constraint that shapes the whole mode: **a live run and a finished run are two different screens**, because the run snapshot is written once at termination and `journal.jsonl` is the only live source. Also in that rewrite: no barrier tag (it corresponds to nothing), `queuedAt` clustering as one-way evidence of concurrency, the item grid as opt-in rather than default, `error` and `blocked` given their own presentation, no budget meter, and no `schema` column. (§9, §10, §11)

**Known broken, carried so it is not rediscovered:** a lead on a one-agent team reads `working` forever — the staleness rule measures the agent against itself, so it can never fire, and the obvious fix marks every fixture-backed agent `departed`. Until it is solved, **`live` in a picker row means "a process is running", not "something is happening"**, and this vocabulary has no word for the difference. (§17)

## Task progress bar (tasks view)

A progress strip above the task list: percentage, `3 of 11 done`, a legend, and a **7px bar segmented by state** — completed (`--color-accent-500`), in progress (`--color-accent-300`), blocked (`--warn`, which folds in plan-approval and failed), pending (`--color-neutral-800`).

- Segmented by **state**, not by an estimate. Task completion is countable, so a bar is honest here; a **per-task percentage is not** — an agent does not report how far through a task it is. Do not add per-row bars.
- `blocked` groups blocked + plan approval + failed so the four segments always sum to the task count; the legend numbers are the segment widths' source, so they cannot disagree with the drawing.
- **Per task: a four-cell stepper, not a percentage.** A per-task percentage would be invented — an agent never reports how far through a task it is. What *is* observable is the ladder every task actually climbs: **created → unblocked → claimed → completed**, so each row draws 4 cells filled to its real step (blocked 1, pending 2, in progress 3, completed 4), tinted by state (accent, `--warn` for blocked, `--fail` for failed). The title attribute names the four steps and adds `N of M dependencies done` where the task has any. `STATE` widened 92 → 118px, taken back from `DEPENDS ON` (88 → 76px); `DESCRIPTION` is flex and absorbs the rest.
- Present in both the 4a tasks view and the 3b coordination view.

## Movie themes (data-driven, no screen)

Renamed from "cast packs". **`movie-themes.json` is the canonical database** — ten themes, their role→character mapping, spare characters, and the rules that must survive implementation. There is deliberately **no UI for the database**, and **no separate picker**: films are entries in the one `theme` dropdown, under a `FILM · names, portraits and palette` group after `SYSTEM` — two lists that both change the console's appearance is one list. A `film palette` toggle appears only while a film is selected; off, the film renames agents and tints portraits and the ground stays on the system theme.

- **The exported HTML painted white.** The dark ground was on `body` only. Body-background propagates to the page canvas *when `html` has none* — but the canvas is 3804px wide against a ~900px viewport, so scrolled-past regions and the area beyond `body`'s box fell through to the UA default. `html` now carries the same ground plus `color-scheme: dark`, and both get `min-height: 100%`. **Put the page ground on `html`, not just `body`, for anything that scrolls past the viewport in either axis.**
- **`stream` and `trace` are now genuinely two views.** The pills highlighted but the frame always drew `trace`; both are branches now, and the footer's duplicate `view` row drives the same state instead of being static. Spec in the README under *Sub-agents mode*. This is Standing rule 1 failing inside the reference build itself — worth noting because the rule was written from an earlier instance of exactly this.
- **Three-column canvas** — sub-agents / teammates / workflow, each 1268px with a header band carrying a count chip and one sentence on what that engine is. Anchors: `#sub-agents`, `#teammates`, `#workflow`.
  Two build traps, both worth knowing. **(a)** A `nowrap` flex row establishes a max-content width, and a `flex: none` parent with no `max-width` adopts it — so the option labels sized their wrapper to the longest single line (1772px against a 1180px card) and, once columns sat side by side, ran 500–780px into the next column's content. Invisible in a single stack because nothing was to the right of it. Fix at the constraint: `max-width: 100%; min-width: 0` on the option, `flex-wrap: wrap` on the label. **(b)** When assembling a file in a script, apply stylesheet edits to the **reassembled** string — slicing `head` before the edits and rebuilding as `head + body + tail` silently discards every one of them, and the markup then references classes that do not exist.
- **`:root` is the single, complete authority for the theme.** Not just the semantic half — accents and neutrals too — written by the logic class onto `document.documentElement`, and **every per-frame var block is deleted**: 5 of them, ~870 chars each, gone. A frame added later is themed without being touched.
  Three things this closed, all one bug wearing different clothes: (a) per-frame declaration meant a card without a block resolved `--warn` / `--fail` to nothing, and **an unresolved var invalidates the whole declaration it appears in** — so the outline disappeared rather than merely losing its colour, and a status fill went transparent rather than grey; (b) two earlier passes fixed this per site and both missed the section that had **no** block, because an audit that enumerates existing blocks cannot see a missing one; (c) the writer was called only from `componentDidUpdate`, so tokens were unset until the first tick and — since the `paused` prop early-returns before `setState` — **never set at all while paused.** `applyTheme()` is now the first statement of the real `componentDidMount`. There was also a `componentDidMount2`, which React never calls; if you find yourself numbering a lifecycle method, the code is telling you it is dead.
- **The build's token is `--json-boolean`**, matching the docs; `--json-bool` is gone. (Standing rule 4 works in both directions — the prose was right and the build was the thing to change.)
- **The gear is in every mode** — team, subagent trace, workflow, and the no-team screen. It existed only in team mode; workflow mode had none, the no-team screen had a dead glyph, and the subagent trace was not on the theme at all (a literal terminal ground, so a theme switch left it dark while everything else changed — the gear would have been a control that visibly did nothing there). All three now mount the same control against the same store, so a theme or toggle set in one mode holds in the others — which is what the panel footer already claimed ("saved per machine, not per session"). The workflow bar needed 35px for it; the run picker's `min-width` gave them up (430 → 360). **Re-measure any bar you add the gear to** — these bars bleed rather than wrap, and the gear is the last child, so it is the first thing to go off-frame.
- **Both pickers are dropdowns.** `movie theme` and `theme` are closed rows showing the current value (the theme row carries a 34px three-band swatch of its ground, accent and text), each opening an absolutely-positioned menu. This is what keeps the config panel a fixed height regardless of how many themes exist — an eleven-row list and a six-tile swatch grid inline had grown the panel to 859px inside a 716px console, clipping the toggle group and the reset-scope footer out of reach. Panel is now 600px, 80px inside the frame, and the menus cannot grow it.
- **Do not cap the panel with `max-height: calc(100% - …)`.** Its positioned wrapper has no height, so the percentage resolves against 0 and collapses the panel to 1px. If a cap is ever needed, size it in px against the console body.

Ten themes: Inception, Stranger Things, The Lord of the Rings, Star Wars, Back to the Future, Pulp Fiction, The Godfather, Reservoir Dogs, The Matrix, Breaking Bad. (Seven Samurai and The Grand Budapest Hotel were dropped.)

Rules are carried in the JSON itself under `rules`, so they travel with the data rather than living only here: casting is by role slot and never hashed; the agent-type badge stays beside the character name; `@` matches either name; overflow keeps real names; one `asChar()` mapping feeds every view; the in-world team name is decoration on the session-picker trigger only; a theme sets names only, so any theme runs on any colour scheme.

## Leaving a running session (turn 7, `#7a` and `#7b`)

Answers the four questions raised against `IDLE_GRACE_MS` / `TeamSelect.tsx` / the `nothing live to show` exit path.

- **Two verbs, never merged.** `stop watching` is a view-local dismissal: the team keeps running, the console stops following it, and it happens **instantly with no grace period** — legitimate precisely because nothing is being asserted about the team. `end session` is the destructive one, keeps the lead's existing copy ("the lead cannot be stopped on its own — every teammate is stopped with it"), and waits for the processes to actually go. An empty state that says *ended* about a live session is the same lie the stop glyph and the in-flight badge already refuse to tell.
- **The dismissed session stays in the picker**, marked `running · not watching` — **not** `done`. So `TeamSelect`'s "keep the current row visible" rule does not need relaxing for the *done* case; it needs a not-watching state that is still selectable. Marking it done to force it out of the list would make the picker assert a state the console cannot verify.
- **There is a screen now.** Chrome stays (status bar, config gear), the body empties. The picker in the bar goes dashed and reads `no session selected`, so paging back into a running or finished session is one click — the picker's whole purpose. The body carries a card for the session you left, still ticking (agents working, tasks done, spend accrued while away, time away), with `watch again` and `end it for real`, then the other sessions on the machine.
- **The server stays up** to serve this screen. Stated in the footer, because it is a lifecycle change from the current `nothing live to show — exiting` path, and the hooks' relaunch logic changes with it.
- **Scope is this browser only.** Also stated in the footer: another tab still follows the session. A dismissal is a view preference, not team state, so it does not belong in `~/.claude`.
- Empty state art is a **24×17 pixel sprite** — an unwatched terminal with a lit prompt — in the same 2px language, palette and `avatars` toggle as the role portraits, laid beside the copy in a flex row with a soft accent glow behind it.

## Dynamic workflows: a second console mode (turn 6, `#6a`)

A workflow subagent never enters `members[]`, so a workflow is not a team and does not get a seventh view on the team console — it gets its own mode, chosen by the trigger. What that removes is the point: **no roster, no inboxes, no task list, no composer, no per-agent context meter.** Four views:

- **run** — phases as columns, work items as rows. Each phase is tagged `parallel` (barrier) or `pipeline` (no barrier), because that distinction sets wall-clock, and a pipeline row visibly runs ahead of its neighbours. Cell states: `✓` returned, `●` running, `⤿` replayed from cache, `∅` **returned null** (skipped or dead after retries — a state, not an error), `·` waiting. Sidebar: concurrency slots with the `min(16, CPUs − 2)` note, the 1000-agent lifetime cap, budget, `log()` narration, and a panel stating the human opted in at launch and is notified at the end — only `skip agent` and `stop run` are controls.
- **agents** — the ephemeral roster: prompt, forced `schema`, model, `isolation: worktree`, state, tokens. Nothing addressable by name.
- **script** — the persisted script with the resume model drawn on it. **Every line carries one of two tints** — cached prefix vs re-run — and the legend counts them from the data, so the number and the drawing cannot disagree. Plus the determinism note (`Date.now()`, `Math.random()` and argless `new Date()` throw).
- **journal** — `journal.jsonl`, each agent's actual return value including `null`.

Two layout rules learned here: a fixed-width identity column must be sized from the **measured** longest label (`WORK ITEM` is 190px because `spec/middleware.spec.ts` needs 152px of text plus 28px of padding — an estimate was wrong twice), and explanatory prose in a header cell should **wrap under a 2-line clamp** rather than ellipsise, since the header row is `flex: none` above a scrolling body.

Also fixed in this pass: no 9.5px text at `--color-neutral-700` (2.69–2.80:1). That register is `--color-neutral-600` at 10px everywhere in the console.

## Diff viewer, revised against the build (answers to DIFF-VIEWER-NOTES)

The design now matches what the runtime can actually do. Point by point:

- **No hex literals left in the diff.** `#7fb98d` measured 1.87:1 on Organic and 1.95:1 on Frost. The add sign and the header stat both resolve through `var(--json-string)` now, and the **whole JSON palette is defined per theme** (`--json-string`, `--json-number`, `--json-bool`, `--json-null`) rather than as six literals — the same rule the palette already claimed but did not follow. The translucent row tints were correct and are unchanged.
- **`open in editor`, `⌘⏎` and the unified/split toggle are gone.** No server route reaches an editor and there is no split layout; a control that does not change the render is worse than none. The toolbar is rebalanced around it: hunk count, snippet-relative note and the truncation warning on the left, `copy patch` on the right.
- **Truncation is drawn.** Cap is 300 lines across all hunks (a lockfile arrives as hundreds of small ones, not one big one) and 200 chars per line. The toolbar carries an amber `N of M changed lines shown` chip, and the footer says the copied patch will not apply. `+N −M` in the header counts the whole patch, so it can legitimately exceed the rows below it.
- **`ts` is epoch ms**, formatted at the render site. **`commit` is optional and usually absent** — the header meta line is `agent · time` and only appends ` · sha` when one exists. Drawn for the absent case, since that is the common one.
- **Line numbers are snippet-relative**, starting at 1, and the hunk header is synthesised (`@@ -1,10 +1,24 @@`) with no function context. The tool input has no absolute file position; the old header implied both.
- **Gutter numbers moved to `--color-neutral-500`.** `-700` measured 1.53–2.35:1 against its own gutter — that was a real problem, not restraint. Answer to open question 2.
- **The console root is `position: relative`** and the modal sets a keyboard-suspend flag, with the footer stating it. Without the first the modal sizes against the viewport; without the second `esc` interrupts the focused agent while the patch is open.
- **The one-line/nowrap rule now covers every fixed-height chrome row**, not just the status bar — the modal toolbar and footer had neither `flex: none` nor `white-space: nowrap`.

## Received messages carry attribution
Answer to open question 1. A delivered teammate message renders with a **sender chip** — the envelope's `teammate_id` on an accent-900 pill before the body, with a `✉` marker in the glyph column. Stripping the envelope was right; dropping the attribution with it was not. Indentation in a message body is preserved: teammates indent snippets far more often than they fence them.

## Tasks view: MODEL column, corrected blocked rule
- **MODEL, 60px, between STATE and OWNER**, out of DESCRIPTION's flex. `metadata.model` is a tier name (`opus`) and is **not** `agent.model`, a canonical id (`claude-haiku-4-5`) — never draw them as the same field. Absent reads `—` (DEPENDS ON's convention), not `unassigned`, which would imply a pending action.
- **blocked = pending AND at least one dependency still open.** Derived, not stored: a completed dependency no longer blocks, and a task's own status outranks the derived flag. The footer already stated the intent.
- `agent.model` now shows in Rail and Overview as well as Wall and Grid. Comms is deliberately excluded — it is a view about messages, not agent status.

## One composer, @-routing, and the ingestion queue
Reworked against `MESSAGING.md` (now in this bundle — read it before touching messaging).

- **One composer, in the lead's column.** Every other column is read-only. A send is N direct inbox writes with no relay, so a composer per column implied a channel that does not exist.
- **@-routing, Slack-style.** At rest the composer is just a prompt and a hint: `message the lead · @ to reach a teammate`. No chip, no picker, no target control on screen — with no `@` the message goes to the lead, which is the common case. Typing `@` opens the teammate list above the composer and filters as you type; the header shows the live filter (`@pe`), the first row is the `⏎` default, and each row carries the agent's state (`idle · a message wakes it`, `failed · still reachable`). Picking one resolves the mention into a chip at the left of the input and the picker closes. Departed agents are absent from the list.
- The **arrives-as** stamping (`console` to the lead, `team-lead` to a teammate) is no longer shown. It is real but it is the engine's business, and putting it on every target made the composer read like documentation.
- **Enter sends** · ⇧⏎ newline. The hint reads `⏎` — naming the one key that used to do nothing was most of the old trap.
- **"everyone" → "all messages"** ("every inbox, merged"). There is no group inbox; the room folds the N copies of one send back into a line but still shows each line's real recipient.
- **Ingestion queue** surfaces as a per-agent badge in the column header — `2 in flight` in the warn colour, meaning written to that inbox but not yet pulled into a context window. Clicking it drains now (forces a turn boundary). Zero-count agents show nothing.

## Whole themes, not just accents
The config panel's first section swaps the entire theme; the accent swatches then pick among four accents belonging to that theme.

- Six themes, shown as a two-column grid of tiles that preview themselves (ground / accent / text stripes): **Nocturne** (dark blue-grey), **Organic** (light paper and clay), **Ember** (warm carbon), **Frost** (light cool grey), **Slate** (dark, zero hue — good for screenshots), **Phosphor** (near-black CRT glow). Each carries a terminal ground, a surface, text, a full neutral ramp, semantic warn/fail values and four accent ramps of its own.
- The neutral ramp is ordered **by use, not by lightness**: 900 is the quietest fill/hairline and 200 the strongest text. On a light theme those values run dark-to-light in the opposite direction, so the same markup reads correctly either way — this is what makes a light theme possible without touching a single component.
- Every colour inside the console now resolves through a variable on the console root: `--term` (terminal ground), `--color-bg`, `--color-text`, the neutral ramp, the accent ramp, plus `--warn`, `--warn-edge`, `--warn-tint`, `--fail` and `--on-accent` (text on an accent fill). No hard-coded hex survives in the console body. If you add a colour, add it as a theme variable or the light theme breaks silently.
- Theme rows preview themselves with a three-stripe swatch (ground / accent / text) so the choice is visible before it is applied.

## Config panel
A `⚙` at the far right of the status bar opens a 302px popover (`var(--color-bg)`, 1px `var(--color-neutral-800)`, `var(--radius-md)`, right-aligned under the button) with five live tweaks, all persisted per machine rather than per session:

- **accent scheme** — four 20px swatches (blurple, teal, amber, rose), each a full 7-step ramp at Nocturne's chroma level with the hue rotated. Applied by overriding `--color-accent*` custom properties on the console root, so every consumer follows without touching component code. The ground never changes.
- **line density** — compact / default / roomy (5 / 10 / 16px transcript line gap).
- **fade older output** — turns the per-line opacity ladder on or off.
- **agent portraits** — hides the 8-bit faces.
- **motion** — kills the cursor blink and the typing dots (accessibility, and a calmer wall).
- **JSON line numbers** — hides the gutter in expanded payloads.

The button costs ~30px of a status bar that was already full: the session id came out of the collapsed trigger in that frame and the goal's max-width dropped to 146px. Anything added to this bar has to be paid for.

## Messages live in comms only
The mailbox pane came out of the tasks view (and out of the 3b coordination frame); the task list now fills the frame in both. **This is a standing rule, not a one-off edit: the tasks view never carries a mailbox.** Messages belong to comms, which has a room for the merged feed and a thread per pair. A mailbox column beside the task list duplicates comms, takes the width the task list needs for its progress column, and leaves the same data in two places to drift. Comms gained an **everyone** room, pinned above the pair threads and selected by default, that carries the whole team's traffic as one group chat — so the merged feed the tasks pane used to hold has a proper home.

- Group-chat bubble language throughout: sender runs collapse, tail and avatar on the last bubble of a run, name label only when the speaker changes, `max-width: 64%`, operator's own messages right-aligned on the accent.
- Each pair thread carries its own messages. An earlier pass derived the header from the selected pair while the body stayed hard-coded to one exchange — header and bubbles then disagreed on screen.
- Member count and composer hint are room-aware (`6 members` / `2 inboxes`, "message the team — everyone sees it" / "join as the operator — both agents see it").

## Comms view — inter-agent chat
A sixth view. Agent-to-agent messaging was invisible in the wall: a `SendMessage` scrolled past in one column and its effect surfaced in another. The comms view shows the conversation directly — a thread list of inbox pairs on the left, a two-sided chat on the right.

- Each thread is **two inboxes**, not a channel; teammates message each other directly and the lead does not relay.
- Every bubble carries a **delivery state** (`read at turn 9` / `delivered · unread 34s`). A message sits in the recipient's inbox until its next turn boundary; a chat without this reads as instant delivery, which is wrong.
- Composing indicator, operator composer that joins the thread, and a `show in wall` jump to both agents' columns.
- **Regression this caused:** the sixth switcher pill (~65px) pushed the status bar past 1180px, bleeding the spend figure off-frame. The diffstat came out of that bar (it is in the session dropdown rows anyway) and elapsed + spend merged into one chip. Re-measure the bar whenever you add a pill.

## JSON payloads open formatted
A row carrying a JSON response (`{"success":true,…}`) collapses to one line like any other long row, but its drawer renders the payload pretty-printed and syntax-coloured rather than as prose.

- Two-space indent, right-aligned line-number gutter, one span per token from the JSON palette (keys accent-400, strings `#9ec9a8`, numbers `#d99e5c`, booleans `#7fb4d9`, `null` `#c98d8d`, punctuation neutral). Defer to the codebase's own syntax theme if it has one.
- Body sits on the terminal ground inside the lighter drawer, capped at 210px with **its own scroll that does not bottom-anchor** — JSON reads top-down.
- Header badge (`N keys · N lines · N B`) is derived from the payload. A hard-coded count sitting beside a live line-number gutter visibly contradicts it.
- `copy json` / `raw` actions in the footer.

## Expandable output rows
A stream row whose output runs long collapses to one ellipsised line with a `▸` caret at its right edge. Clicking it opens the output as an **inset drawer** inside the stream (turn 5, `#5b` in the HTML):

- The drawer sits on `var(--color-bg)` — one step lighter than the terminal ground — with a 1px `var(--color-neutral-900)` edge, `var(--radius-md)`, `var(--shadow-sm)`, `padding: 10px 12px 11px`, `margin: 4px 0`. Lighter ground plus an edge is what separates it from the stream; do not use a background tint alone.
- Header row inside the drawer keeps the row's glyph and text, caret flips to `▾`. A 1px `var(--color-neutral-900)` divider sits under it, then the body indented 16px so it aligns past the glyph gutter.
- Body paragraphs are `var(--color-neutral-300)`, `line-height: 1.65`, `gap: 11px`, `text-wrap: pretty` — and **exempt from the stream's opacity fade**: an open row's content always reads at full strength regardless of its age.
- Footer row: line count on the left, `copy` (neutral outline) and `collapse` (accent outline) on the right.
- Collapsed rows around it keep the normal fade ladder. Two alternatives were explored and dropped: a gutter-rule treatment that promoted the open row in place, and a side detail pane for very long output.

## Line spacing and per-line opacity
Transcripts were unreadable at 1px line gaps and a flat text colour.

- Gaps: 10px in wall columns, 11px in the rail, 7–8px in the condensed views, 18px between mailbox entries; task rows at 12px vertical padding.
- Each line carries its own opacity so the current command reads as current: newest 1, previous 0.72, recent 0.5, older 0.38, whole ladder × 0.72 on an agent that is not working.
- Line text moved up to `var(--color-neutral-300)` so the fade does the ranking rather than a dim base colour; glyph markers unified on `var(--color-accent-500)`.

## Per-panel vertical scroll
Every pane is its own scroll region, not a clipped tail. Transcripts hold the agent's full history back to its session preamble (`loaded CLAUDE.md`, `claimed my task`, …); the rail's agent list, the task list and the mailbox scroll too.

- Bottom-anchoring moved from `justify-content: flex-end` to `margin-top: auto` on the first child. `flex-end` in a flex column cannot be scrolled upward — the earlier build looked bottom-pinned but was unscrollable.
- **Scope that rule to streams only.** Bottom-anchoring belongs to the transcript panes and the mailbox; the task list and the rail's agent roster read top-down and must stay top-aligned. Applying it to every scroll pane put 90–170px of dead space above the first row and pushed later rows below the fold.
- Auto-scroll to newest fires only when the user is already within 64px of the bottom; scrolled-up panes stay put while output keeps arriving.
- Scrollbars are themed and visible on scrollable panes (9px, `rgba(233,233,237,.035)` track, `var(--color-neutral-800)` thumb with a 2px transparent border via `background-clip: content-box`, `var(--color-accent-700)` on pane hover). The affordance has to read — a pane that scrolls invisibly is a pane nobody scrolls.
- `overscroll-behavior: contain` on each pane so a pane hitting its end doesn't scroll the page.

## Resizable wall columns
Columns are `flex: none` at a default 366px with per-column widths in state, keyed by agent name and persisted across view switches.

- 7px hit strip on each column's right edge (`position: absolute; right: -3px; z-index: 4; cursor: col-resize`) containing a 1px line: transparent at rest, `var(--color-accent-500)` while dragging.
- Drag clamps 232–720px; double-click resets to 366.
- **Regression this caused:** the lead column's sticky pin came from a `.wall > div:first-child` stylesheet rule, which the per-column inline width override then beat, unpinning it. Sticky, `z-index` and the shadow edge now live on the column element itself. If you implement resizing, verify the pin still holds afterwards.

## Session dropdown
The session name in the status bar became a picker over the sessions on the machine.

- Menu: 432px, header `SESSIONS ON THIS MACHINE · N`, one row per session — state glyph (`●` live / `○` idle / `✓` ended) · name · branch · goal · agent count · activity text — with `✓` on the current one. `⌘K` searches.
- Branch, diffstat, roster and task counts are now **derived from the picked session**, not hard-coded. Switching updates every view; the other sessions keep running.
- The picker is in the shared chrome, so it appears in all five views by construction. That is the general rule now: a control added anywhere is added everywhere.

## One console, five views
The four separate frames (team wall, coordination, agent rail, tmux grid) were consolidated into one component with a view switcher in the status bar: **wall · overview · tasks · rail · grid**.

- Chrome is constant; only the body swaps. Selecting an agent in any view (overview tile, rail row, grid pane, panel chip) sets the focused agent the rail shows.
- The switcher is a flat pill with an inset 1px border, not a tab with an underline — a stacked label + underline is taller than the text row and pushed the bar to two lines.

## Status bar: one line, always
The bar overflowed 1180px by ~15px, so shrinkable text spans wrapped and it silently doubled in height.

- Every child is `flex: none; white-space: nowrap`; one `flex: 1` spacer. Gap tightened 14px → 10px.
- Labels shortened (`6 context windows` → `6 ctx`, `tasks 3/11` → `3/11 tasks`).
- In the 4a bar the goal echo, the `experimental` pill and one separator were dropped to make room for branch + diffstat. When space runs out, drop metrics right-to-left; never wrap.

## Agent portraits
Each teammate has a 12×12 pixel-art **face** keyed to its role, rendered at 24px (2px pixels): lead in a crown, security in a hard hat, perf in headphones, tests in a cap, architect in a hat and glasses, repro with messy hair. Skin tones vary across the team; hats and shirts come from the accent ramp, and a failed teammate's shirt uses the failure rose. An earlier pass used role *symbols* (shield, bolt, check) — those are gone.

## Rebuilt on the real agent-teams model
The first version modelled a generic orchestrator with numbered "arms". It now follows Claude Code agent teams: a fixed **team lead** plus named teammates with agent types (`security-reviewer`, `test-runner`, `architect`, `general-purpose`), each in its own context window; a **shared task list** with owners and dependencies; **direct mailboxes** between teammates (the lead does not relay); `idle` and `failed` as first-class states; **plan approvals** and teammate **permission prompts** routed to the operator, never into the teammate's own column.
