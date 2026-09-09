> **Stale — read the canvas, the README and the CHANGELOG instead.** This file
> still names `Octo Session Console.dc.html` and `Octo Usage Dashboard.dc.html`,
> both removed at rev 5 and replaced by `Octo Agent Console - Canvas.dc.html`;
> it says "five body views" when team mode has seven, workflow five and a solo
> session two; and it points at `design/agent-teams-console/README.md`, a path
> that does not exist. The build order below is still broadly right. Where this
> file disagrees with the canvas, the README or the CHANGELOG, it loses to all
> three.

If you have already built this console, start with the **"Reconciled with the console at 0.6.5"** entry at the top of `CHANGELOG.md` — this revision is mostly corrections to the spec, not new features, and several previously specified things are now explicitly *not* to be built.

Read `design/agent-teams-console/README.md` and `MESSAGING.md` (the engine's real delivery rules — messaging cannot be built honestly without it), and open `Octo Session Console.dc.html` (same folder) in a browser — together they are the spec for a web console for Claude Code agent teams. Build the **turn-4 view** (`#4a` in the HTML): one console, five body views behind a switcher. Turns 1–3 are earlier explorations kept for reference; do not build them.

Recreate the design in this codebase's own stack and component patterns. The HTML is a design reference, not code to lift, and its data is fabricated — wire the real sources named in the README (`~/.claude/teams/`, `~/.claude/tasks/`).

Work in this order, and treat each step as done only when it holds at 1180px and at a narrow viewport:

1. **Shell first.** Status bar, needs-you strip, agent panel. These never move between views; only the body swaps. The status bar is exactly one 40px line — every child `flex: none; white-space: nowrap` with a single `flex: 1` spacer. Under-constrain one text span and it wraps to 58px; that is the most common way to break this layout.
2. **One store, five views.** wall · overview · tasks · rail · grid all read the same state: picked session, focused agent, per-column widths, context-warning threshold. Selecting an agent in any view sets the focused agent the rail shows. Persist view + focused agent in the URL. Never add per-view state.
3. **Session dropdown** in the status bar. Switching sessions swaps the roster, branch, diffstat and task counts everywhere at once; the other sessions keep running.
4. **The wall.** Horizontal scroll, one column per agent, lead column `position: sticky; left: 0` — put sticky on the column element, not a `:first-child` rule, or per-column width overrides unpin it. Columns drag-resizable from a 7px right-edge strip, clamped 232–720px, double-click resets to 366.
5. **Per-panel Y scroll.** Every transcript pane, the rail's agent list, the task list and the mailbox each scroll independently, holding full history. Bottom-anchor with `margin-top: auto` on the first child, not `justify-content: flex-end` — the latter makes a flex column unscrollable upward. Auto-scroll to newest only when the user is already within 64px of the bottom. Themed scrollbar per the README, visible on scrollable panes so the affordance reads.
6. **Expandable rows.** Long output collapses to one line with a `▸` caret; clicking opens it as an inset drawer on the lighter ground with its own edge, a divider under the header, and copy/collapse actions. The drawer's body is exempt from the stream's opacity fade.
7. **Line rhythm.** Lines sit ~10px apart, and each carries its own opacity (newest solid, history fading to 0.38, the whole ladder dimmer on a non-working agent). Tight leading and a flat text colour make a live stream unreadable — this is load-bearing, not polish.
8. **Agent portraits.** 12×12 pixel-art faces, one per role, 24px rendered. Sprite sheet or inline SVG is fine; keep the grid and the palette.
9. **Overview view.** Not the wall shrunk. Build the derived parts first (WHERE IT STANDS, agent rows — all from the existing store), then the BRIEF panel on `POST /api/sessions/:id/brief`. Spec is *Screen 8* in the README. Trap: the brief is generated text — always render its model, inputs and age beside it, and re-run it on task-state change, or it drifts from the rows under it.

Three things beyond the team console, all specified in `CHANGELOG.md`:

- **Workflow mode** (`#6a`) — dynamic workflows get their own console mode, selected by the trigger, not a seventh view. Views: run · agents · script · journal. No roster, no inboxes, no task list, no composer, because a workflow subagent never enters `members[]`.
- **Leaving a running session** (`#7a`, `#7b`) — `stop watching` (view-local, instant, claims nothing) is a different verb from `end session` (destructive, waits for the processes). The dismissed session stays in the picker as `running · not watching`, never `done`; the server stays up to serve the empty screen; the dismissal is scoped to this browser.

- **Usage & cost view** (`usage`, spec in `USAGE-DASHBOARD.md`) — the last pill in the status-bar switcher in **both** modes: seven views in team mode, five in workflow mode. It is a view, not a page: same chrome, same store, no toggle (the console already knows which mode it is in). `Octo Usage Dashboard.dc.html` is the full-size study behind it — read it for the stacked-area spend chart, donut, scatter and phase Gantt that the 1180px view condenses. Build the cost function before any panel: no dollar figure exists in either engine, so every one on the page is derived from token counts at API list price, and all of them must come from one function over one set of token records or the panels will disagree with each other. Cache reads are ~78% of the traffic, so a bare "tokens" total is a wrong readout, not a terse one.

Colours, type sizes, spacing and copy are specified in the README — follow them, mapping to this codebase's tokens where equivalents exist. Read `CHANGELOG.md` in the same folder if you have already built an earlier version of this console; it lists what changed and why, so you can patch rather than rebuild.

Ask me before inventing screens, states or copy the README doesn't cover.
