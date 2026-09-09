# Handoff: Agent Teams web console (terminal wall)

## Overview
A browser UI for Claude Code **agent teams** (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`): one session acts as the team lead, teammates run in their own context windows, and they coordinate through a shared task list and per-agent mailboxes. The console gives the operator what the in-terminal agent panel can't: every teammate's transcript visible at once, per-agent context usage, and a single place for the things that need a human (plan approvals, permission prompts, failures).

The console has **two modes, chosen by what triggered the run** — an agent team, or a dynamic workflow. They are not two views of one thing; see *Workflow mode* below for what the second one removes and why.

### Team mode
Seven views behind one switcher in the status bar (turn 4 in the HTML, `#4a` — build this one; other turns are explorations and studies):
- **wall** — teammate columns side by side, lead pinned left. The default.
- **usage** — spend and tokens for the session: see *Screen 6*.
- **overview** — what the team is doing and where it stands: a generated brief, task/state summary, one row per agent. See *Screen 8*.
- **comms** — inter-agent conversation as a chat, with two kinds of room: an **everyone** room pinned at the top (the whole team's traffic in one group chat — the default) and the per-pair inbox threads below it under a `PAIRS` heading. See below.
- **tasks** — the shared task list, nothing else. Messages belong to comms.
- **rail** — teammate list on the left, one full transcript on the right (for reading one agent closely).
- **grid** — fixed 3x2 panes, tmux-style.

The chrome never moves between views: status bar on top, needs-you strip and agent panel at the bottom, only the body swaps. Selecting an agent in any view (overview tile, rail row, grid pane, panel chip) sets the focused teammate that `rail` shows. Persist the current view and the focused agent in the URL.

Each teammate carries a **12x12 pixel-art portrait** keyed to its role (24px rendered, 2px pixels): lead in a crown, security in a hard hat, perf in headphones, tests in a cap, architect in a hat and glasses, repro with messy hair. Skin tones vary across the team; hats and shirts come from the accent ramp, and a failed teammate's shirt uses the failure rose. In the prototype each portrait is one element whose box-shadow carries every pixel on a fixed 2px grid — reimplement however suits the codebase (sprite sheet or inline SVG is fine), but keep the 12x12 grid and the palette. To show a portrait smaller than 24px, scale the whole sprite with a transform; shrinking the pixel element without changing the offset step leaves sub-pixel gaps and the face renders as stripes.

Earlier reference views, still in the file:
- **Team wall** (`3a`) — lead pinned left, teammate columns scrolling horizontally, a "needs you" strip, and an agent-panel footer.
- **Coordination view** (`3b`) — the shared task list: states, owners, dependencies, progress.

## About the design files
The files in this bundle are **design references created in HTML** — prototypes of the intended look and behaviour, not production code to lift. The task is to **recreate these designs in the target codebase's environment** (React, Vue, Svelte, whatever the app uses) with its existing patterns and component library. If no environment exists yet, pick the appropriate framework and build there. The prototype's data is fabricated: wire the real fields listed under *State* below.

## Fidelity
**High-fidelity.** Exact colours, type sizes, spacing, and copy are specified below and present in the HTML. Recreate the layout closely. All values come from the Nocturne design system tokens (`_ds/.../styles.css`); use the codebase's equivalents where they exist, otherwise the tokens as given.

---

## Standing rules

Four rules that came out of building this console. They are cheaper to follow than to rediscover.

**1. Every control names the runtime call it makes.** Before specifying a control, write the one line saying what it invokes. Three controls in earlier versions of this spec had no call behind them — `respawn` on a failed row, `open in editor` in the diff toolbar, and `Send now` on the in-flight badge — and all three were removed. A control that changes only its own highlight is worse than an absent one: it teaches the operator a capability that does not exist, and the cost lands at the moment they most need to trust the screen.

**2. No role borrows a semantic token.** The palette rule is not "no hex literals" — a palette can pass the literal test and still be wrong. `--warn` and `--fail` mean *this wants your attention* and *this failed*; a JSON number is neither. Borrowing them means retuning the amber for contrast against `--warn-tint` silently retints every number in every payload, drawn on `--term`, a different ground. `--json-number` and `--json-null` are their own per-theme variables. The token is **`--json-boolean`**, not `--json-bool`.

**3. Anything in the chrome needs a source that survives an optional install.** The session name and branch reached the frame only through the `statusline` hook, which fires only if the console owns the `statusLine` key — and the installer refuses to take it when the operator already has one. So on any machine with an existing status line the header showed a directory id and the branch never appeared. Both now fall back to disk (`sessions/*.json`, `.git/HEAD`); hook values win, disk is the floor. A chrome field with a single optional source will be blank for most operators and nobody will report it.

**4. Prose the reference build contradicts costs a builder a full investigation.** Two rules in earlier versions of this spec — click-to-focus widening a column, and collapsing idle rows after 30s — existed in prose only; the prototype never did either, and one of them was self-defeating (it empties the wall exactly when the team is idle, taking the only composer off screen at the moment the operator wants to wake someone). Both are struck. If the prototype does not do it, do not write it.

### One marker rule worth knowing

The marker set is `❯` prompt, `⏺` tool call, `⎿` result/aside, `✓` success, `✗` failure, `+` diffstat, `!` finding, `▲` waiting, `○` queued/idle, `✉` delivered teammate message.

**`✉` draws authorship, not shape.** `❯` is what the operator typed — it reaches the projection as bare content with no envelope. `✉` is what another agent sent. A protocol frame keeps the marker that says what it wants from the operator (`○` idle notification, `▲` plan approval request) and gains a sender chip.

Two consequences:

- **A delivery is many rows, not one.** A batched delivery can carry six frames from three different teammates in one record, because a lead's queued mail all drains at one turn boundary. No single sender chip can be correct on that row, so **each frame takes a row of its own** and the surrounding prose keeps its own rows.
- **The spawn prompt is attributed too.** It is genuinely a message from whoever spawned the agent, wrapped in the same envelope as any other, so the first row of a teammate column reads `✉ [team-lead] <the brief>` rather than `❯ <the brief>`. The operator's own messages to the lead are untouched. Three candidate discriminators that would let the spawn prompt keep `❯` were tried and all fail: bareness (the corpus has byte-identical bare frames meaning opposite things), absence of `color=` on the spawn frame (an undocumented artifact that breaks the day spawn frames gain a colour), and position (not knowable client-side, since the feed holds only a window). The trade is one glyph against naming who briefed each agent.

## Screen 1 — Team wall (`3a`)

**Purpose:** monitor and steer a running team. The operator reads several transcripts in parallel, spots a teammate burning context or stuck, and answers approvals without leaving the view.

**Frame:** 1180 × 800 (design size), shown inside browser chrome in the mock; in the real app it fills the viewport.

**Layout — four rows, vertical flex:**

1. **Status bar** — **exactly one line, 40px tall.** `padding: 9px 14px`, `background: var(--color-bg)`, `border-bottom: 1px solid var(--color-neutral-900)`, `font-size: 12.5px`, `gap: 10px`, `flex-wrap: nowrap`. Every child is `flex: none; white-space: nowrap` except one `flex: 1` spacer — a shrinkable text span here wraps and doubles the bar's height, which is the single most common way to break this layout. If the metrics don't fit, drop them right-to-left (diffstat first, then combine elapsed and spend into one chip, then shed the token figure); never wrap, never let them bleed past the frame. Adding a switcher pill costs ~65px — re-measure the bar every time you add one.
   - `TEAM` wordmark: `var(--color-accent)`, 11px, weight 700, `letter-spacing: .14em`
   - **session dropdown** — the trigger shows the session name (`session-8f2a1c`, session-derived) with a caret; the goal appears next to it in `var(--color-neutral-600)` 10.5px, ellipsised, where the bar has room. 1px `var(--color-neutral-800)` border, `var(--radius-sm)`, hover border `var(--color-accent-700)` on `var(--color-accent-900)`. The menu is 432px wide, `var(--color-bg)`, 1px `var(--color-neutral-800)`, `var(--radius-md)`, `box-shadow: 0 18px 40px rgba(0,0,0,.6)`, header **`TEAMS ON THIS MACHINE · N`** — teams, not sessions, and the count is of teams; each row = state glyph (`●` live / `○` idle / `✓` ended) · team name · branch · goal · agent count · state text, with `✓` on the current one. Picking a team switches the console; the others keep running. `⌘K` searches.
   - `experimental` pill: 1px `var(--color-accent-700)` border, `var(--color-accent-300)` text, 10px, `border-radius: var(--radius-sm)`, `padding: 1px 6px`
   - branch (`var(--color-accent-400)`), PR + diffstat (`var(--color-neutral-600)`)
   - right side: `tasks 3/11`, `6 context windows`, total tokens, an ASCII aggregate meter (`var(--color-accent-500)`, `letter-spacing: -.5px`), elapsed, spend
1b. **Config popover** — a `⚙` at the bar's right edge opens appearance settings: accent scheme (four hue-rotated ramps applied as `--color-accent*` overrides on the console root — never per component), line density, fade-older-output, agent portraits, motion, JSON line numbers. Reset link in its header; footer notes the settings are per machine. Every control must actually change the render — a decorative settings panel is worse than none.

2. **The wall** — `flex: 1`, `display: flex`, `overflow-x: auto`, `overflow-y: hidden`, `gap: 1px`, `background: var(--color-neutral-900)` (the gap reads as a 1px rule between columns). One column per agent, `flex: none`, default `width: 366px`.
   - **The lead column is `position: sticky; left: 0; z-index: 2`** with `box-shadow: 1px 0 0 var(--color-neutral-800), 8px 0 18px rgba(0,0,0,.5)` so it stays visible while teammates scroll. Put sticky on the column element itself, not on a `:first-child` stylesheet rule — a per-column width override otherwise wins and unpins it.
   - **Columns are resizable.** A 7px hit strip sits on each column's right edge (`position: absolute; right: -3px; height: 100%; cursor: col-resize; z-index: 4`) with a 1px line inside that is transparent at rest and `var(--color-accent-500)` while dragging. Drag adjusts that column only, clamped **232–720px**; double-click resets to 366. Width is per-column state, keyed by agent name, and persists across view switches.
   
   Column internals:
   - **Header** (`background: #161826`, `padding: 9px 12px 8px`, bottom hairline, `gap: 5px` column):
     - line 1: status glyph (colour per status, 11px) · agent name (13px, weight 500, `var(--color-text)`) · agent-type badge (`security-reviewer`, `team-lead`, …; 9.5px, 1px `var(--color-neutral-800)` border, `var(--color-neutral-500)`) · model, right-aligned (10.5px, `var(--color-neutral-700)`)
     - line 2: status label in the status colour · role/assignment (`var(--color-neutral-600)`, 11px, ellipsised) · elapsed, right
     - line 3: **context meter** — 16-cell ASCII bar (`█` filled / `░` empty, `var(--color-accent-600)`, 11.5px, `letter-spacing: -.5px`) · percent · `!` warning glyph (`#d99e5c`) past the threshold · `96.2k / 200k` · spend, right
   - **Transcript** — `flex: 1`, `padding: 9px 12px`, `gap: 1px`, **its own Y scroll**: `overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain`, holding the agent's full history back to its session preamble. Lines are bottom-anchored via `margin-top: auto` on the first child — **not** `justify-content: flex-end`, which makes a flex column unscrollable upward. Bottom-anchoring applies to streams only (transcript panes, mailbox); the task list and the rail's agent roster are top-aligned. On new output, auto-scroll to the bottom only when the user is already within 64px of it; if they've scrolled up to read, leave the position alone. Scrollbar is themed and always visible on a scrollable pane so the affordance reads: 9px wide, track `rgba(233,233,237,.035)`, thumb `var(--color-neutral-800)` with a 2px transparent border (`background-clip: content-box`), `var(--color-accent-700)` on pane hover; `scrollbar-width: thin`. Every pane in every view scrolls independently this way — wall columns, overview tiles, grid panes, the rail transcript, the rail's agent list, the task list, and the mailbox — but only the streams bottom-anchor.
   - **Line spacing and fade.** Lines sit 6px apart (7px in the rail, 4–5px in the condensed views) — tight leading makes a live stream unreadable. Each line carries its own opacity so the current command reads as current: newest 1, previous 0.72, recent history 0.5, older 0.38, and the whole ladder × 0.72 on an agent that is not working. Line text is `var(--color-neutral-300)`; the fade does the ranking, not a dim base colour. Each line: a 9px-wide marker column (`var(--color-accent-600)`, 11px) + text (`var(--color-neutral-500)`, 11.5px, `white-space: nowrap`, ellipsised). Markers: `❯` prompt, `⏺` tool call, `⎿` result/aside, `✓` success, `✗` failure, `+` diffstat, `!` finding, `▲` waiting, `○` queued/idle.
   - **Expandable rows.** A row whose output runs long collapses to one ellipsised line with a `▸` caret at its right edge; clicking opens the output as an **inset drawer** in the stream — `var(--color-bg)` ground, 1px `var(--color-neutral-900)` edge, `var(--radius-md)`, `var(--shadow-sm)`, caret flips to `▾`, divider under the header, body indented 16px past the glyph gutter, `copy` and `collapse` actions. Drawer bodies are **exempt from the stream's opacity fade**.
   - **JSON payload rows** get the same drawer with a formatted body instead of prose: pretty-printed at two-space indent on the terminal ground (`#12141f`, 1px `var(--color-neutral-900)`, `var(--radius-sm)`), a right-aligned line-number gutter in `var(--color-neutral-800)`, one span per token coloured from the JSON palette below, and `copy json` / `raw` actions. The pane is capped at `max-height: 210px` and **scrolls on its own without bottom-anchoring** — a JSON body reads top-down, so it must not carry the streams' `margin-top: auto` rule. The drawer header shows `N keys · N lines · N B`; derive all three from the payload, never hard-code them (they sit next to a line-number gutter that will contradict a stale figure).
   - **Current tool** — one line, top hairline, `var(--color-neutral-700)`, 10.5px, ellipsised.
   - **Message composer** — top hairline, `background: #161826`, `padding: 8px 12px`: `❯` (`var(--color-accent-600)`) + placeholder `message <name>` + `⌘⏎` hint. This is the direct-message channel to that teammate (equivalent to selecting the row and pressing Enter in the terminal).
3. **Needs-you strip** — top hairline, `background: #161826`, `padding: 9px 14px`. Label `NEEDS YOU · 2` in `#d99e5c`, 10.5px, `letter-spacing: .12em`. Then one card per item:
   - *plan approval*: 1px `#6b4f2c` border, `border-radius: var(--radius-sm)`, `padding: 6px 10px`; agent + reason, then `approve` (accent-outline) and `reject with feedback` (neutral outline) buttons, 10.5px.
   - *failure*: neutral-outlined card; agent, error text (`529 overloaded_error`), `respawn` button.
4. **Agent panel footer** — `padding: 8px 14px`, 10.5px. Label `PANEL`, then one chip per agent (status glyph + name + context percent, 1px `var(--color-neutral-900)` border, hover border `var(--color-accent-700)`), a dashed `1 idle agent` chip for collapsed idle rows, and the key legend `↑↓ select · ⏎ open · esc interrupt · x stop · ⌃T tasks`.

**Statuses** (glyph / label / colour):
- working — `●` / `working` / `var(--color-accent-400)`
- idle — `○` / `idle` / `var(--color-neutral-600)`
- plan approval pending — `▲` / `plan approval` / `#d99e5c`
- failed — `✗` / `failed` / `#c98d8d`
- blocked — `⊘` / `blocked` / `var(--color-neutral-600)`

## The comms view

**Purpose:** make agent-to-agent communication legible. In the wall it is invisible — a `SendMessage` call scrolls past in one column and its effect appears in another. This view shows the conversation itself.

**Left, thread list** (`width: 296px`). Header `THREADS` + unread count. The first row is the **everyone** room — a `⌗` glyph, "every message, one room", its own unread pill — separated from the pair rows by a hairline and a `PAIRS` label. Selecting it shows the whole team's traffic as one group chat with `to <agent>` / `to everyone` under each run, so the recipient is still legible in the merged stream. Each row is a **pair of inboxes**, not a channel: both agents' 12×12 portraits overlapped 14px apart, the pair name (`perf ⇄ security`), the topic beneath it, a state glyph (`●` live / `◆` unread, `#d99e5c` / `·` settled) and an unread pill (`var(--color-accent-600)` on `#161826` text). Selected row: `var(--color-accent-900)` with `box-shadow: inset 2px 0 0 var(--color-accent-500)`. Footer states the model: "a thread is two inboxes · the lead does not relay". Top-aligned, own scroll.

**Right, thread pane.** Header: pair name, topic, the task ids the exchange concerns, and a `show in wall` action that jumps to both agents' columns. Body is a two-sided chat, bottom-anchored with its own scroll:

- One bubble per message, `max-width: 64%` (one constant, consumed by both the pair thread and the everyone room so they cannot drift), with the sender's portrait at 22px on the bubble's outer edge. The first participant's messages sit left on `var(--color-bg)` with a `var(--color-neutral-900)` edge; the other's sit right on `var(--color-accent-900)` with a `var(--color-accent-700)` edge. Sender name in `var(--color-accent-400)` 10.5px + timestamp in `var(--color-neutral-800)`; body `var(--color-neutral-300)` 11.5px, `line-height: 1.6`, `text-wrap: pretty`.
- **Delivery state under each bubble** — this is the load-bearing part. A message lands in the recipient's inbox and is only read at that agent's next turn boundary, so show `read at turn 9` in `var(--color-neutral-700)` versus `delivered · unread 34s` in `#d99e5c`. Without it the chat implies instant delivery, which is wrong.
- A **composing indicator** (sender name + "composing a reply" + three pulsing 3px dots) when an agent's current turn contains an unsent `SendMessage`.
- **Composer**: the operator can join the thread — both agents see the message. Footer note: "a message wakes an idle recipient".

Source: `~/.claude/teams/{team}/inboxes/{agent}.json`. Group messages into threads by unordered participant pair, and keep the merged everyone stream as its own room. Every room must render its own messages — a header derived from the selected room over a hard-coded body is a visible contradiction. Room-dependent chrome (member count, composer hint) follows the room too. Per message: `ts`, `from`, `to`, `text`, `state` (`unread | read`), `readAtTurn`.

## Messaging: one composer, @ to address

Detail in `MESSAGING.md`. What the design fixes:

- **Only the lead's column has a composer.** Every other column is marked `read-only`. A message to any agent enters the run through the lead, so a composer under a teammate's transcript implies a channel that does not exist.
- **`@` opens the picker, Slack-style** — nothing is shown until the character is typed. Targets are the live teammates plus the lead itself. No "arrives as …" annotation on the chip; the single composer already makes the routing obvious.
- **Pending messages are a readout, not a control.** A teammate reads its inbox at its next turn boundary, so queued messages show as a `2 in flight` badge in that column's header. **Nothing can force a turn boundary** — a message is a write into the recipient's inbox and it sits there until that agent reaches its own next boundary. A non-zero badge on a busy agent is not a backlog; it is the normal state of a message in flight. So there is no `Send now`. **Clicking the badge opens that agent's messages in comms** — a count with no way to read what it counts is half a readout — and claims nothing about delivery. The title attribute says *written to this inbox · read at its next turn boundary*.
- **`all messages`** (not "everyone") is the merged room at the top of the comms thread list, above `PAIRS`. There are no group messages in the engine — the room is a view over every inbox, and each run still shows `to <agent>`.

## Movie themes

Ten movie themes rename the team's agents and, with film palette on, retint the console. **The database is `movie-themes.json` in this folder** — read it rather than transcribing names from here; it carries the role→character mapping, spare characters, and the implementation rules under `rules`. There is no screen for the database.

**One control, not two.** An earlier revision of this spec described a separate `movie theme` picker above `theme`. There isn't one: films are **entries in the `theme` dropdown**, under a `FILM · names, portraits and palette` group after `SYSTEM`. Two lists that both change the console's appearance is one list; the merge is deliberate.

- The closed row shows the current value — `System default · Nocturne`, or `Inception · Limbo grey` / `Inception · names only` when a film is picked — with a 34px three-band swatch of ground, accent and text.
- A **film palette** toggle appears only while a film is selected. Off, the film renames agents and tints portraits while the ground stays on the system theme; on, ground and accent come from the film too.
- A film carries **one accent ramp**, so the four-swatch accent row is replaced by that film's own — never four invented variants of somebody's grade.
- The note under the dropdown states the current reach: `Agents keep their real names.` with no film, `Names and portrait colours only; the ground stays on Nocturne.` with film palette off, and the full sentence with it on.

Rules that must survive implementation (also in the JSON):

- Casting is **by role slot**, never hashed — the same role in the same film is always the same character.
- The **agent-type badge stays** beside the character name; a theme must never replace the type.
- **`@` matches either name**, and the picker shows the real slot name beside the character.
- **Overflow keeps real names** — draw from `spare` if you need more, never invent characters.
- One `asChar()` mapping feeds every view (wall, overview, rail, grid, panel, task owners, comms rooms, bubbles, mention picker).
- The in-world **team name** is a chip on the session-picker trigger only. **Measure the status bar in the longest team-name state** — it bleeds rather than wraps.
- **Never rename a state, verb or metric.** Those are readouts.
- Character names are protected IP — personal or internal use only.

## Sub-agents mode: two views, and what separates them

`stream` and `trace` are **the same events under two orderings**, and the mock now actually switches between them — an earlier revision drew only `trace` while both pills highlighted, which taught the operator a view that did not exist. (Standing rule 1, broken in the reference build: **every control names the runtime call it makes.** A pill that changes only its own highlight is worse than an absent one.) The footer's duplicate `view` row was static decoration for the same reason; it now drives the same state as the header switcher, so either works.

- **stream** — the parent's own transcript, one column, time order. A subagent appears as a **single collapsed `⏺ Task(...)` row** carrying what it *returned*, not what it did, expanding into the same drawer as any other tool call. Six concurrent subagents interleave here as six rows among thirty; that is the problem trace exists to solve.
- **trace** — the same events regrouped **by producer**: a gantt over the parent turn plus one lane per subagent, with each one's own context window and the summary line the parent actually received. The 44:1 ratio at the top (six context windows compressed to six summary lines) is the reason the view exists.

Neither view gets a stop control for one subagent: `esc` interrupts the parent turn and every subagent under it. A subagent is never in `members[]`, has no inbox, and cannot be addressed — so it gets a lane, never a column with a composer.

## Screen 3 — Workflow mode (`6a`)

**Trigger, not a toggle.** A dynamic workflow is a different engine: a JS script orchestrating ephemeral subagents with no shared state. **A workflow subagent never enters `members[]`**, so a workflow is not a team and must not be drawn as one. What this mode *removes* is the design: **no roster, no inboxes, no task list, no composer, no per-agent context meter.** The only controls are `skip agent` and `stop run` — the operator opts in at launch and is notified at the end.

Same chrome shell (status bar, config gear, one-line rule) with `RUN` in place of `TEAM`, the workflow name and `runId` in the picker slot, and the task id, run totals and elapsed on the right. Four views: **run · agents · script · journal**.

### The constraint that shapes every one of them

**A run's snapshot is written once, at termination.** Every field except one comes from that file, so before it exists there is nothing to read. `journal.jsonl` is created at run start and appended per event, and it is **the only live source**: agent ids, `started` lines, result texts.

The consequence is not a detail, it is the shape of the mode: **a live run and a finished run are two different screens.**

| | live run | finished run |
| --- | --- | --- |
| source | `journal.jsonl` only | run snapshot + journal |
| what exists | which agents started, in what order, what they returned | phases, labels, states, tokens, durations, tool calls, attempts |
| **run view draws** | a flat agent list in dispatch order | phase groups, and the item grid where labels cooperate |
| totals | count of started / returned | `totalTokens`, `totalToolCalls`, `durationMs` |

Do not draw a phase grid for a live run and leave it empty until the end. Draw the flat list, and say what it is.

### run

**Grouped by phase, listing agents.** A phase header carries its title and a detail line under a **2-line clamp, never ellipsised** (the header row is `flex: none` above a scrolling body). Phase counts are state-aware — `9 returned` / `3 running` / `queued` — never a meaningless `0 running`.

**No barrier tag.** An earlier version of this spec put a `parallel` / `pipeline` label on each phase header. It corresponds to nothing: a phase is `{title, detail}`, and a barrier belongs to an individual `parallel()` or `pipeline()` call, of which one phase can hold several of both. If the distinction is wanted it must come from the embedded script text, never from run state.

**Concurrency is recoverable where the barrier tag is not.** Agents dispatched by one `parallel()` share a **byte-identical `queuedAt`**, and the cluster size is that call's arity. The implication runs one way only: a cluster of ≥ 2 proves a parallel dispatch, a cluster of 1 proves nothing — a run killed before its `parallel()` fanned out shows a max cluster of 1. So read `queuedAt` clustering as evidence of concurrency and **never as evidence of its absence**, and label it as what it is ("dispatched together"), not as the call that produced it.

**The item grid is opt-in, not the default.** The runtime has no work-item concept. Labels follow `<verb>:<key>` by convention, and a grid built by splitting on `:` **will be right most of the time and wrong visibly** — a phase that uses a different key namespace leaves rows with empty cells and cells with no row, and some labels carry no separator at all. Offer the grid where the corpus cooperates; group by phase otherwise.

**Cell and row states** — five, mapped to the runtime rather than to a tidier set:

| drawn | runtime |
| --- | --- |
| `✓` returned | `state: "done"` without `cached` |
| `⤿` replayed from cache | `state: "done"` with `cached: true` |
| `●` running | `state: "progress"`, or `"start"` with `startedAt` set |
| `·` queued for a slot | `state: "start"` with `startedAt` absent |
| `∅` returned null | `state: "error"` with `skipped: true`, **or** any agent that returned null |

**`error` and `blocked` need their own presentation.** Folding them into `∅` loses the difference between *the operator skipped it* and *it threw* — the first is a decision, the second is a failure, and only one of them wants attention.

**The identity column** is sized from the measured longest label **in your own corpus**; do not copy a constant from this document. The number does not travel — a corpus of filenames measured 190px, a corpus of `verb:key` labels measured 151px — and `label` is **optional**: when a script passes none the runtime defaults it to the prompt's first 60 characters, roughly 432px at this font, which no column width can hold. So pair the fixed width with an overflow rule: **the 2-line clamp specified for header prose applies to the identity column too.**

**Sidebar:** concurrency slots with the `min(16, CPUs − 2)` note, the 1000-agent lifetime cap, run totals, `log()` narration, and a panel stating you are not in the loop.

**No budget meter.** `budget {total, spent, remaining}` is not on disk anywhere. The runtime hands the script a *session-level* budget established at launch and never persists it, and `totalTokens` is **not the same quantity** — it counts this run's agents, while the budget counts the whole session's turn spend since the run began. Drawing one as the other under-reports, which is wrong in the direction that matters. Show `totalTokens` / `totalToolCalls` / `durationMs` as what they are, and have the panel say why there is no percentage.

### agents

The ephemeral roster: id, phase, prompt preview, model, `isolation`, state, tokens, tool calls, duration, attempt. **Nothing is addressable by name** — one prompt, one return, no inbox — and the footer says so.

**No `schema` column.** `agents[].schema` exists in script text only and reaches no file. If the forced-output contract needs showing, it belongs in the script view beside the call, not as a roster column that would be blank for every real run.

### script

**The resume model drawn per `agent()` call, not per source line.** One row per call in execution order, tinted cached or re-run.

Per-line tinting is not implementable and the reason is worth keeping: an agent record carries `index`, `label`, `phaseIndex`, `model`, `state`, timings, `tokens`, `toolCalls` and previews — and **no call site**. No line, no offset, no column. The source is persisted in full and the agents are persisted in full, and nothing joins the two. A script that calls `agent()` in a loop or a `map` defeats the guess outright: one line spawns N agents. (This is a different failure from the barrier tag — there the shape does not exist; here the shape exists and the **join** does not.)

Per-call is also the unit the runtime's own resume contract keys on: it replays **the longest unchanged prefix of `agent()` calls**, and the first edited or new call and everything after it runs live. The legend counts the same array it draws, so the design's actual requirement — that the number and the drawing cannot disagree — survives the change of unit intact. A cache hit found *after* the prefix is reported **separately** rather than folded in, so an impossible shape stays visible instead of being silently rounded away.

**The source pane degrades honestly.** Show the script source when the run carries it; otherwise name `scriptPath` and say why it is absent — source is roughly two thirds of a run's bytes, so the ingest strips it, and fetching on demand needs a server route that does not exist. Name the path rather than drawing an empty pane.

Sidebar carries the determinism note: `Date.now()`, `Math.random()` and argless `new Date()` throw inside a workflow, because two runs of one script have to be comparable.

### journal

`journal.jsonl` — each agent's actual return value, `null` included, footed with "a cached result is not automatically a non-empty one". This is also the live feed the run view reads before a snapshot exists, so it is the one view that is fully populated from the first second of a run.

### State per run

`name`, `description`, `runId`, `scriptPath`, task id, `totalTokens`, `totalToolCalls`, `durationMs`, `phases[] {title, detail}`, `agents[] {index, label, phaseIndex, phaseTitle, model, state, queuedAt, startedAt, durationMs, attempt, tokens, toolCalls, promptPreview, resultPreview, lastToolName}`, journal entries.

Removed from an earlier version of this spec because they are **not observable**: `budget {total, spent, remaining}`, `phases[].kind`, `agents[].schema`, `items[]`. Three of those four are not merely missing from disk — they are not concepts the runtime has.

## Screen 4 — Leaving a running session (`7a`, `7b`)

**Two verbs, never merged.**

- **`stop watching`** is a view-local dismissal. The team keeps running; the console stops following it. It happens **instantly, with no grace period** — legitimate precisely because nothing is being asserted about the team. Dismissal is a view preference, so it is scoped to **this browser only** (another tab still follows it) and never written to `~/.claude`.
- **`end session`** is destructive: the lead cannot be stopped on its own, so every teammate stops with it, contexts are discarded and claimed tasks return to the queue. It waits for the processes to actually go.

An empty state that says *ended* about a live session is the same lie the stop glyph and the in-flight badge already refuse to tell. So: **the dismissed session stays in the picker marked `running · not watching`, never `done`.** Do not mark it done to force it out of the list — that makes the picker assert a state the console cannot verify.

**Identity is rendered one way, everywhere.** The picker leads with the **goal**, carries the kind pill, and puts the session id in the secondary line — so the empty state, the session card and the elsewhere rows do the same, in the same order. An id where the picker shows a goal makes the same session look like two different things, and the operator has to translate between them. When either changes, change both.

**The screen (`7a`):** chrome stays, body empties. The picker in the bar goes **dashed** and reads `no session selected`, so paging back into a running or finished session is one click — the picker's whole purpose. Centred in a 560px column:

- a **24×17 pixel sprite** of an unwatched terminal (lit prompt, dim output lines, on a stand) at 144px with a soft `--color-accent-900` radial glow behind it, in a flex row beside the copy — same 2px pixel language, palette and `avatars` toggle as the role portraits;
- the heading `You stopped watching <session>.` at 16px, then one paragraph making clear nothing was interrupted;
- a card for the session you left, **still ticking**: state dot, name, goal, time away, agents working, tasks done, spend accrued while away, and `watch again` (accent outline) / `end it for real` (warn outline);
- `ELSEWHERE ON THIS MACHINE` — the other sessions, each one click away.

Footer states two facts for the operator: **the server stays up to serve this screen**, and the dismissal is **this browser only**.

This screen needs **no lifecycle change** — an earlier version of this spec claimed one, wrongly. The idle reaper reads only the filesystem: it walks the teams root and keeps the process alive while any team has two or more members. `stop watching` is view-local and writes nothing to `~/.claude`, so the team's `config.json` is untouched, the reaper still sees a live team, and the server still serves. Do not touch the reaper or the hooks' relaunch logic — the ten-minute grace and the `SessionEnd` fast path are load-bearing, and "stays up" read as a mandate is one step from a process that never dies.

`7b` is the pair of confirmations, shown side by side so the copy difference is the design.

## Screen 5 — No team at all

**A sibling of Screen 4, not a mode of it.** Screen 4 is *you stopped watching `<session>`*: one team, deliberately left, still ticking, with `watch again` and `end it for real`. Every part of it needs a team to point at.

This screen is the other empty body: **there is no team to show**, because every session on the machine is a lead on its own. There is nothing to tick, nothing to watch again, nothing to end.

It **states the cause rather than the absence** — *"A session on its own is not a team — Claude Code writes one for every window you open"* — because a blank console with no explanation reads as a failure, and this one is a resting state. Centred on both axes: pinned to the top it read as something that had not finished loading. The copy is load-bearing; do not shorten it to "No teams".

Where lead-only sessions are hidden, the count and `show them` appear here as well as in the picker.

## The third verb — hiding a picker row

Screen 4 insists two verbs never merge. There is a third, and the distinction has to hold across all three:

| verb | scope | the row afterwards |
| --- | --- | --- |
| `stop watching` | view-local, instant | **stays**, marked `running · not watching` |
| `✕` hide | view-local, instant | **gone from the picker** |
| `end session` | destructive, waits for the processes | ends, and every teammate with it |

Operators need the third because stale rows accumulate and neither of the other two removes one — `stop watching` deliberately *keeps* the row, since paging back in is the picker's whole purpose.

`✕` follows the `stop watching` rule exactly: browser-local, `config.json` untouched, another browser still lists it, nothing written to `~/.claude`. The console's only write into the engine is an inbox entry, and a picker row is not something it may delete.

**The way back is the part that needs care.** Hiding the last row would otherwise be a one-way door — empty picker, empty body, no control anywhere to undo it. So the hidden count and `show them` appear in **both** the picker and the empty screen whenever anything is hidden.

## Screen 2 — Coordination view (`3b`)

**Purpose:** answer "who claimed what, what's blocked, and who told whom" — the state the wall's transcripts don't surface.

**Frame:** 1180 × 660. Same status bar (subtitle `coordination`, `tasks 3/11 · 3 blocked`).

**Body:** two panes, `display: flex`.
- **Left, shared task list** (fills the frame). Column header row (10.5px, `var(--color-neutral-700)`, `letter-spacing: .12em`): `TASK` 44px · `DESCRIPTION` flex · `STATE` 92px · `OWNER` 80px · `DEPENDS ON` 88px. Rows: 11.5px, `padding: 7px 16px`, `border-bottom: 1px solid #1b1d2b`, hover `background: #161826`. Task ids `T-01`…, state cell = glyph + label in the state colour (`pending`, `in progress`, `completed`, `plan approval`, `failed`, `blocked`), owner = agent name or `unassigned`, dependencies as ids. Footer line: `~/.claude/tasks/session-8f2a1c/` and the note "claiming is file-locked · completing a task unblocks its dependents".

**There is no mailbox pane in this view, and there must never be one.** Messages live in comms — `all messages` for the merged feed, a pair thread for one conversation. A mailbox column here duplicates comms, halves the width the task list needs for its progress column, and puts the same data in two places that then drift.

---

## Screen 6 — Usage & cost dashboard

**Full spec in `USAGE-DASHBOARD.md`. Built as the `usage` view in both console modes** (last pill in the status-bar switcher, `#4a` and `#6a`); the full-size study behind it is the usage panel set inside the canvas (rev 5 folded the separate `Octo Usage Dashboard.dc.html` in). Both modes get one, chosen by the same trigger that chooses the console mode: a team session dashboard (spend stacked by agent, spend by model, token composition, context pressure, a per-agent ledger, coordination overhead, and a team-vs-serial estimate) and a workflow run dashboard (phase Gantt, concurrency against the 16 cap, actual-vs-projected burn, a per-agent scatter, and relaunch economics).

Three things from that doc that will otherwise be got wrong:

- **Neither engine reports dollars.** Every currency figure is derived client-side from token counts at API list price — `cost = (in·rIn + out·rOut + cacheWrite·rIn·1.25 + cacheRead·rIn·0.1) / 1e6` — and the page labels the basis. Read rates from config; a hard-coded rate card is worse than none.
- **Cache reads are most of the traffic** (~78% in the fixture), so every token readout splits in / out / cache-write / cache-read within a glance of itself. A single "tokens" number teaches the wrong model of the bill.
- **No warn or fail colour on the page.** Money is not a failure state; pressure is ramp position and prose. Estimates and projections are captioned as such — the serial-session comparison and the burn projection are the two numbers a reader would otherwise take as measured.

## Screen 7 — Subagents: `trace`, the Task row, fan-out (`8a`, `8b`, `8c`)

**Not a mode.** A subagent is spawned mid-turn by the model's own decision, never in `members[]`, never addressable, and returns exactly once. Do not build a roster, an inbox, a composer or a per-subagent stop for it — nothing in the engine backs any of them. Its records are sidechain entries in the parent's own `.jsonl` plus an `agent-*.jsonl` and `.meta.json` sidecar, which is where per-subagent tokens, tool calls and duration come from.

**`trace` — one new view, in solo sessions.** Same chrome shell, added to the status-bar switcher (`stream · trace`) — two pills, as `saViews` builds them. Usage is not a pill here: the trace header strip already carries tokens-in-subagents, tokens-shown-to-parent and spend.
- Header strip: `SUBAGENTS`, `MAX DEPTH`, `TOKENS IN SUBAGENTS`, `SHOWN TO PARENT`, `SPEND`, with the ratio between the middle two called out in prose.
- Lanes on a shared time axis (ticks every 60s). Parent turn is the top lane, tinted `var(--color-accent-900)` with an `accent-600` bar. Each subagent is one lane; **indent 24px per depth level**, arbitrary depth, with a `└` connector. Bar height and opacity step down with depth (8px/.72, 6px/.45, 4px/.3) so nesting reads without colour coding.
- Row columns: 340px call cell (name, type badge, model, live state) · flexible lane · 66px right-aligned tokens.
- Selected-row detail panel below the lanes: name, type, `model · duration · N tool calls · N subagents`, a 16-cell context bar with its own `x / 200k` and the note that the window is discarded on return, then the returned summary under `⎿` and a caption giving words returned against tokens spent. Actions: `open transcript`, `agent-*.jsonl`.

**The Task row — inline, in every transcript.** Collapsed: `⏺ Task(name)` + type badge + right-aligned `tokens · duration` + `▸`. Expanded: the drawer from Screen 5b, unchanged container. Order inside: subagent header line → its transcript at **opacity .62** with a 1px `neutral-900` left rule → `⎿` result at full opacity → footer (`no reply channel — a subagent returns once and is gone`, `trace`, `collapse`). Nested Task rows inside the drawer carry a `<type> · depth N` badge and expand identically. Long chains truncate as `⋯ N more calls`.

**Fan-out.** One `⏺ Task ×N` dispatch line, then a chip strip inside a left rule: state dot (pulsing accent while running, `accent-600` when returned), name, type badge, tokens, elapsed or `returned`. Results appear below the strip as `⎿` lines prefixed with the subagent name in `neutral-500`. A dimmed line states how many are still running and that the turn cannot continue until all return. Never lay siblings out as columns.

**Status bar gains `N subagents · <tokens>`** in both modes. Usage dashboard gains spend attributed per Task call.

**Interrupt.** `esc` ends the parent turn and every subagent under it. That is the only call available; state it in the footer rather than offering a stop per chip.

## Screen 8 — Overview (`2b`, and the `overview` pill in `4a`)

**Purpose:** answer "what is the team doing, and where does it stand?" in one screen without reading transcripts. Replaces the earlier "compressed wall". Nothing here is invented by the console except the brief, and the brief says who wrote it.

**Layout.** Body is a vertical flex column, `gap: 10px`, `padding: 12px 14px 14px`, ground `var(--term)`, scrolling as one pane. Three regions, top to bottom: a row of two panels (BRIEF flex 1 · WHERE IT STANDS 300px fixed, `gap: 10px`), then the agent table. Every panel: `1px solid var(--color-neutral-900)` border, `var(--radius-sm)`, `var(--color-bg)` fill. All text JetBrains Mono.

### BRIEF (left panel)
- Header (`padding: 9px 14px`, 1px bottom rule neutral-900): kicker `BRIEF` 10px neutral-700 tracking .12em; meta line 10px neutral-600, ellipsised — `{model} · last 5 min of {n} transcripts + {m} tasks · {age} ago`; right-aligned button `↻ regenerate` (outlined, 1px neutral-800, 10px, neutral-500 → hover neutral-900 fill / accent-300 text; label becomes `writing…` while pending). Tooltip names the call: `POST /api/sessions/:id/brief — re-reads the last 5 minutes of every transcript and the task list`.
- Body (`padding: 12px 14px 13px`, `gap: 9px`): three paragraphs, each a row of a 78px kicker column (NOW · WAITING · NEXT, 9.5px neutral-600 tracking .1em) and text 11.5px neutral-200, line-height 1.6, `text-wrap: pretty`.
- Footer (`padding: 7px 14px`, 1px top rule, 9.5px neutral-600): left "a reading of the transcripts, not a record — every claim in it can be found in an agent's wall"; right `{in} in · {out} out · $ per run · re-runs on task-state change`.
- **Generation.** `POST /api/sessions/:id/brief` runs a small model over the last 5 minutes of every member transcript plus the current `TaskList`, prompted to write exactly three paragraphs: NOW (what is being worked on and what has been found), WAITING (what waits on the operator, who is idle, who failed), NEXT (what unblocks what, whose move it is). Re-run automatically on every task-state change; on demand via the button. Always show the age; never show a brief older than the newest task change without it. Cache the last result per session so the view opens instantly.

### WHERE IT STANDS (right panel, 300px)
- Header: kicker `WHERE IT STANDS`, session elapsed right.
- Task bar: label row (`tasks` · `{done}/{total}`, 10.5px), then a 6px segmented bar on `var(--term)`: completed accent-500 · in progress accent-300 · blocked `var(--warn)`, widths proportional.
- State counts, one line each (10.5px; glyph 10px wide in the state colour, label neutral-400, value right-aligned in the state colour): `●` working accent-400 · `○` idle neutral-500 · `▲` waiting on you warn · `✗` failed fail · `!` findings accent-300. Values are counts derived from member state and `!` lines — e.g. `4 agents`, `1 plan approval`, `1 turn · not respawned`, `3 · 2 high`.
- NEXT UNBLOCK (under a 1px top rule): kicker 9.5px, then one sentence 10.5px neutral-300 derived from `TaskList`: the open unclaimed task, and the `blockedBy` chain that waits on it.

### Agent rows (table)
Header row 9px neutral-700 tracking .07em, `padding: 8px 12px`. Columns, `gap: 10px`: AGENT 176px · TRYING TO 290px · NOW 230px · LAST REPORTED flex 1 · CONTEXT 96px right-aligned. One row per `members[]` entry, `padding: 9px 12px`, 1px bottom rule, hover neutral-900, focused agent tinted accent-900. Row click sets the focused agent and switches to `wall`.
- **AGENT** — 24px portrait; state dot + name (12px, weight 500, text); state label (9.5px, state colour); `{type} · {model}` 9.5px neutral-600.
- **TRYING TO** — task id chip (9.5px, 1px neutral-800 border, radius 8px; text neutral-500, warn when the agent is waiting on a plan, fail when its turn failed) + task subject 11px neutral-300 ellipsised; below, the runtime's own `activeForm` from the agent's last `TaskUpdate` (10.5px neutral-500, wraps). Source: `TaskList` where `owner == name`. Idle agents read `—` and "Nothing claimed — idle since T-xx closed".
- **NOW** — current tool call, one line 10.5px neutral-300 ellipsised; below, `for {duration}` while live, otherwise `since it reported` / `until you decide` / `respawn to continue` by state (9.5px neutral-600).
- **LAST REPORTED** — kind prefix (`→ lead` accent-400 for a `SendMessage` summary naming its recipient, `said` neutral-600 for a transcript line) + the summary text 10.5px neutral-300 ellipsised; below, age (9.5px neutral-600). Source: newest entry across the agent's outgoing inbox writes and its `!` finding lines.
- **CONTEXT** — `{used}k/{limit}k` 10px neutral-500; 96×4px meter accent-600 on `var(--term)`; `{elapsed} · {spend}` 9.5px neutral-600.

Footer of the frame (10px neutral-600): `click a row → open it in the wall` · `↻ regenerate the brief` · `⌘1 wall`; right side repeats the needs-you count in warn.

**State.** Per session: `brief {model, generatedAt, inputs {transcripts, tasks, windowMin}, paragraphs [{head, text}], usage {in, out, costUsd}, pending}`; everything else is derived from the existing store (members, TaskList, inboxes, transcripts) — do not add a second copy.

## Interactions & behaviour

- **Horizontal scroll** is the primary navigation on the wall; the lead column is sticky. Provide `h`/`l` (or arrow) column jumps. **Focus must not change a column's width** — width is the drag grip's property, persisted per agent, and focus arrives by five paths (arrows, `h`/`l`, a wall click, `?agent=`, clicking through from comms/overview/rail), so a focus-driven width would resize every column a keyboard scan passed and fight the width the operator dragged. Focus already reads three ways: the accent inset, the tint, and `aria-current`.
- **Click a column** → focus it; the composer takes keystrokes for that teammate. `⌘⏎` sends. Sending a message wakes an idle teammate (and makes one that's waiting on an API retry retry immediately).
- **Esc** interrupts the focused teammate's current turn; **x** stops it. Both are per-agent, not global.
- **⌃T** toggles the task list (in `3a` it should open as a drawer; `3b` is the full view).
- **Idle rows**: an idle teammate stays addressable, and its row **stays**. Do not collapse or hide idle rows on a timer — the wall is where a finished run is read back, and the single composer lives in the lead's column, so emptying the wall when the team goes idle removes the only send control at the moment it is wanted. **Dim instead:** a dormant agent draws at 0.55 opacity, and an idle teammate draws at the same strength as a departed one — it has returned its result and cannot be reached. Departed agents are kept and ordered last.
- **The agent panel** collapses its surplus: beyond three idle agents, the extras become a single `N idle agents` chip that expands on click. This is a **panel** behaviour, not a wall behaviour.
- **Plan approvals** arrive from teammates in plan mode. `approve` releases them to implement; `reject with feedback` returns them to plan mode with the operator's note, and they resubmit.
- **Permission prompts** from teammates are answered in the lead's session — route them into the same needs-you strip, never into the teammate column.
- **Failures**: when a teammate's turn ends on an API error, mark the row failed, show the error text, and offer respawn. Do not auto-retry silently.
- **Context warning**: past the threshold (default 75%) show the `!` glyph in `#d99e5c`. The **"compaction in ~Nk tokens" note takes its own header row**, under the context line, rendered only when it fires — it cannot sit beside the meter, which was measured: a 366px column leaves ~31px spare on that line and the note needs 158px, so it would be invisible at the default width and ellipsised to `co…` at the 232px minimum. In a grid pane the meter is a fragment laid out by the pane's own row and cannot make a line, so there the note stays on the row as the one item allowed to yield, clipping to nothing rather than wrapping. **Two stages of one warning:** `!` means the threshold is behind you; the note means it is about to fire, and starts halfway from the threshold to the trigger.
- **Live counters** tick once per second: tokens, context percent, elapsed, spend, and appended transcript lines. Transcripts append chronologically — newest last, bottom-anchored.
- **Hover** on any interactive element tints from the accent ramp; keyboard focus is `outline: 2px solid var(--color-accent); outline-offset: 2px`. No browser defaults.

## Shared state across views

Within a mode, the views are one component reading one store, not several screens. Anything set anywhere applies everywhere: the picked session (and the branch, diffstat, task counts and agent roster that follow from it), the focused agent, per-column widths, and the context-warning threshold. When adding a control, put it in the shared chrome — never per-view.

## State

Per team: `teamName` (session-derived, `session-` + first 8 of session id), branch, PR/diffstat, elapsed, total spend, aggregate tokens, task counts.

Per agent: `name`, `agentType` (built-in or subagent definition; the lead is always `team-lead`), `model` (fixed at spawn), `status` (`working | idle | plan_pending | failed | blocked`), `role` (spawn prompt summary), `currentTool`, `contextTokens` / `contextLimit`, `elapsed`, `cost`, `transcript[] {marker, text}`, `unread`.

Per task: `id`, `description`, `state` (`pending | in_progress | completed` + UI-only `plan_pending | failed | blocked`), `owner`, `dependsOn[]`.

Per message: `ts`, `from`, `to`, `text`.

Per team (for the dropdown): `name`, `goal`, `branch`, `diffstat`, `agentCount`, `activity` ("4 working", "all idle", "ended 41m ago"), `state` (`live | idle | done`), `hidden`, `repo` (the working directory the session was created in).

**Brand.** The product is **team8**. The mark is *team8 · figure* — a 12×12 pixel 8 of eight nodes (rows: `............ / ...TT.LL.... / ...TT.LL.... / .TT.....TT.. / .TT.....TT.. / ...TT.TT.... / ...TT.TT.... / .TT.....TT.. / .TT.....TT.. / ...TT.TT.... / ...TT.TT.... / ............`; L = lead, accent-300; T = teammates, accent-500). Drawn as inline SVG, 20px, alone at the left of the status bar — no wordmark text. "octo" does not appear anywhere.

**View names are the pill names.** `wall · overview · comms · tasks · rail · grid · usage` — the switcher labels are the vocabulary; the design studies (3a wall, 2b overview, 3b tasks, 1a rail, 1b grid) are named after them. There is no fan-out view.

**The session dropdown is folder-scoped, not machine-scoped.** A session is created in a working directory and never leaves it, so the menu title names a folder and the list is only that folder's sessions:

- Header reads `SESSIONS ON` followed by a **clickable folder chip** — folder name in the accent, path (`~/code/octo`) beside it, caret — with the in-folder session count on the right of the header row.
- The chip opens a **second, narrower menu** (288px, offset under the chip) listing every project directory the daemon has seen sessions in, each with its own session count. Picking one filters the session list and closes the folder menu. Opening the session dropdown closes the folder menu; only one is ever open.
- **Default scope is the current session's folder** — `state.repo` falls back to the repo of the selected session, so opening the picker never scopes away from what is on screen.
- Footer states the scope: *"N of M sessions are in this folder · switch folders to see the rest"*. Nothing cross-folder is listed; switching folder is an explicit act.
- Every other picker rule still holds inside the scope — goal first, kind pill, id in the secondary line, the `members.length >= 2` filter, hidden rows and the three verbs.

**A session is not a team.** Claude Code writes a `teams/<session>/config.json` for **every session it starts**, holding just that session's own lead — so enumerating `~/.claude/teams/` returns one row per open window, not one row per team. Filter to `members.length >= 2`, the same bar the launcher uses, or the picker will show four teams on a machine with three windows and no teammates. A lead-only session is dropped **even when it is the one on screen** (the "keep the current row" rule exists so the picker cannot contradict the wall, and in this case there is no wall — the body is the no-team empty state). They can be revealed, and revealed they are **inert**: dimmed, `aria-disabled`, reading `no team · not selectable`, skipped by the keyboard cursor, excluded from the count.

**`live` means "a process is running", not "something is happening".** The console has no word for that difference yet; do not write copy that implies the stronger reading.

Sources: team config `~/.claude/teams/{team}/config.json` (members, agent ids, types — read-only, rewritten by Claude Code), task list `~/.claude/tasks/{team}/`, inboxes `~/.claude/teams/{team}/inboxes/{agent}.json` (read by the **comms** view only). Treat all three as observed state; never hand-edit the config.

## Design tokens

From Nocturne (`_ds/nocturne-.../styles.css` in this bundle):
- Ground `--color-bg` `#161826`; the terminal ground is one step darker: `#12141f`; page behind the mocks `#0d0e17`; row hairline `#1b1d2b`
- Text `--color-text` `#e9e9ed`; muted `--color-neutral-400` `#b2b6ca`, `-500` `#9397ab`, `-600` `#75798c`, `-700` `#595d6c`, `-800` `#3f424d`, `-900` `#292b31`
- Accent `--color-accent` `#9184d9`; ramp `-300` `#d2cefd`, `-400` `#b5abfc`, `-500` `#968ae0`, `-600` `#796cbf`, `-700` `#5d5294`, `-900` `#2b2741`
- **Declare the theme once at `:root`** — accents, neutrals, `--term`, `--warn`, `--warn-edge`, `--warn-tint`, `--fail` and the four `--json-*` — never per component or per frame, and apply it on mount, not only on update. An unresolved custom property invalidates the entire declaration it appears in, so a missing `--warn` does not fall back to a default colour: it deletes the `border` it was part of. Scoping per frame makes every new frame a latent instance of that bug; applying only on update leaves the whole set unset until something re-renders.
- **JSON token palette** — a second deliberate extension, for syntax colouring inside an expanded JSON payload only: keys `#b5abfc` (`--color-accent-400`), strings `#9ec9a8`, numbers `#d99e5c`, booleans `#7fb4d9`, `null` `#c98d8d`, punctuation and indent guides `var(--color-neutral-600)`/`-800`. Nocturne is a mono palette, so the two new hues (`#9ec9a8`, `#7fb4d9`) are held at the accent's chroma level and never appear outside a JSON body. **If the target codebase already ships a syntax theme, use it instead** — this set exists only so an untokenised console has one.
- Semantic — a **deliberate extension** to Nocturne, which is a mono palette with no warn/fail role: attention `#d99e5c` (border `#6b4f2c`), failure `#c98d8d`. Both are low-chroma and share the accent's chroma level so they read as part of the system; use them **only** for status (plan approval pending, failed teammate, context past threshold), never decoratively. If the target codebase already has warn/error tokens, use those instead.
- Two grounds are not tokenised: the terminal ground `#12141f` (one step darker than `--color-bg`, so the terminal reads as inset) and the table row hairline `#1b1d2b`. Everything else comes from the tokens.
- Radii `--radius-sm` 4px, `--radius-md` 8px; spacing scale `--space-1..8` (2.8 / 5.6 / 8.4 / 11.2 / 16.8 / 22.4px)
- Elevation `--shadow-sm/md/lg`; card in the mocks: `0 0 0 1px #3f424d, 0 16px 40px rgba(0,0,0,.65)`
- Type: **JetBrains Mono** 10–13px for everything inside the terminal (11.5px transcript, 12.5px status bar, 13px agent name); **Inter** for the surrounding doc chrome only. Never below 10px.

## Assets
None. No icons, no images — every glyph is a Unicode character in the monospace font. The `browser-window.jsx` chrome in the bundle is mock framing only; do not ship it.

## Files
- `Octo Agent Console - Canvas.dc.html` — **the one design file.** Every study, in three columns: sub-agents, teammates, workflow. Build turn 4 (`#4a`, team mode), turn 6 (`#6a`, workflow mode), turn 7 (`#7a`, `#7b`) and turn 8 (`#8a`, `#8b`, `#8c`, sub-agents). Other turns are earlier explorations kept for reference.
  **Serve the folder to open it** (`cd design && python3 -m http.server 8000`) — it fetches its runtime at load time and `file://` blocks `fetch`, so double-clicking draws the page without its browser frames.
- `support.js`, `browser-window.jsx` — runtime + mock browser chrome for the prototype.
- `_ds/nocturne-.../styles.css`, `_ds_bundle.js`, `readme.md` — the design system: tokens and component guidance.

Open the HTML file in a browser to see the live-ticking prototype.


### Run view (workflow mode) — the rule set, from 9a/9b

Supersedes the 6a item-grid. Render only what is on disk:

1. **Phases → dispatch groups → agents.** Phase block: glyph, title, detail, right-aligned state tally. Groups are agents with the same dispatch timestamp, headed `N dispatched together · hh:mm:ss` (`dispatched alone` for one). Never tag a phase with a barrier kind.
2. **Agent row:** state glyph · label · id · (trail) · state word. Long groups: show the first 5, then `+ n more, all returned`. Phase with no groups: `nothing dispatched yet`.
3. **Item trail (opt-in).** Only when the run's labels resolve to one item set across phases: after the id, one glyph per earlier phase with that item's state there; tooltip `Phase: state`. Header note states which case applies.
4. **Bar right side:** context · tool calls · elapsed, in text colour. Rail LIVE block repeats them large. No budget anywhere.
5. **AGENTS:** `n of cap lifetime cap`, segmented bar as a fraction of the cap, one row per state (returned, running, cached, null, failed) with count; zero rows dimmed.
6. **CONCURRENCY:** the formula only, plus why the slot count is absent.
7. **NARRATION:** timestamped lines; warnings tinted.
8. **No controls.** No skip/stop, no "background". Footer sentence only.
9. **Two pickers:** session picker, then run picker (script name + runId).
10. **Finished run.** When the run has returned, a *Returned* block sits above the phases: `returned hh:mm:ss · elapsed`, summary line, the opening of the return value, a "full return in the journal" line, `copy return` and `open in journal`. All phases fold to their headers (click to reopen). Bar shows `✓ returned hh:mm:ss`, counters freeze, rail LIVE relabels FINAL, footer says nothing more will arrive and how to resume.
11. **Phase headers are clickable** in every state; running runs open by default, finished runs closed.
12. **Output view.** Second tab in the switcher (after run). Finished: header `✓ return value · returned hh:mm:ss · n words · n sources`, `copy`, `save .md`, then title, summary, sections, SOURCES list. Running: *no output yet* + one explanatory sentence + elapsed and agent count. The Returned block's primary verb, `open output`, switches to it.
