# team8 mod: the band — design

One line of team8 drawn inside Claude Code, last above the prompt (under every other band), as part of the plugin's
hooks module:

```
team8 is running a subagents session · total progress 3/5 (60%) · see details here 127.0.0.1:4823/s/89a6888f
```

It answers "is a team8 run going, how far along is it, and where are the details?" without
leaving the terminal. Source: the design handoff in `docs/design_handoff_team8_mod/`, cut down in
three rounds with the operator (see Decisions).

## Decisions

- **One line, no controls.** The handoff's per-teammate band and team pane were built in this
  batch and then removed on the operator's call:
  - the pane docks as a side panel only under `/tui fullscreen`;
  - a row of teammates showed nothing in subagents mode, the mode recent batches ran in, and
    didn't say what mattered.

  The band now says the run's mode, its total progress and where the console is. It has no
  Buttons and no digit hotkeys, so a digit typed into an empty prompt is never taken over.
- **Last above the prompt, under the cards.** Claude Code nests the plugins' `AbovePrompt` hooks
  in an order no plugin chooses. The operator wants the line under `session-cards`' cards (their
  own mod, `~/code/claude-mods`), and does not want that mod changed for team8. So the team8 band
  draws itself after `next(e)`. team8's module loads before `session-cards` and wraps it, so
  `next(e)` hands up the cards and the line comes last, right above the prompt. `session-cards`
  answers without `next(e)`, so if the order ever flipped it would hide the line. (An earlier
  round drew it first; the operator moved it under the cards at the live check.)
- **The mode is the console's.** It's the one `team8:tasks` decided: the last
  `mode: <solo|subagents|teammates|workflow> —` line the lead wrote into `docs/team8/runs/`.
  The console reads it from the lead's transcript (`src/server/index.ts`, `lastDecidedMode`).
- **Progress counts tasks.** `TaskGet` returns no metadata, so the executors' per-task progress %
  isn't readable from the module.
- **The address is always there.** While the console is down, the band says how to start it.
- **No NEEDS YOU, no cost.** team8 never produces plan approvals or operator questions, and
  `session-cards` already shows the session's cost and limits.

## Probes (2026-10-11 and 12, Claude Code 2.1.296)

A throwaway `t8ui` mod and a live-check copy `t8live` in this session's dev-mods folder.

- **Band.** A `ui.render` hook on `AbovePrompt` draws a tree, and `await next(e)` returns the
  tree of the plugins beneath it. `session-cards` returns only its own tree, so whenever it sits
  outside team8 the team8 band is dropped. That is why the operator saw no band from the
  `t8live` copy, which loads after `session-cards`. The installed plugin, and the repo's plugin
  under `--plugin-dir`, load before it: the debug log names the chain `team8@…,
  session-cards@claude-mods` (2026-10-12).
- **Engine node.** With no other plugin drawing, `next(e)` hands up core's own drawing,
  `{ type: 'engine', ref }`. The engine refuses a whole band tree that puts it under a Box with
  `width`, `height`, `minWidth`, `minHeight`, `position`, `display`, `overflow` or an offset, and
  draws its own instead.
- **Pane (removed).** `$.ui.open` placed it `inline` on the default renderer and docked it only
  under `/tui fullscreen`. The mods interface doc says so in one line.
- **Reads.** `$.agent.list()`, `TaskList` from a `$.clock.every` timer and
  `GET 127.0.0.1:4823/health` all work from the module.
- **The task list can vanish.** Claude Code clears it once every task is completed, and a
  session's team folder disappeared mid-session once.

## 1. Structure

- **`plugin/hooks/team8.tsx`** is the one `modules` entry. It calls the wave notifier's
  `register` from `./wave-notify.ts`, unchanged, and adds the band.
- **`plugin/hooks/team.ts`**, with no Claude Code imports, holds the rules as pure functions.
  vitest covers it from `src/hooks/team.test.ts`.
- The snapshot is module variables; nothing goes in `$.state` or `$.store`.

## 2. Data

- **Mode:**
  - At `session.start`, `decidedMode` runs over `$.session.messages()`. That's the newest 4,096
    entries, each `{ role, text, toolUses }`.
  - It scans every tool use whose input, as JSON, contains `docs/team8/runs/`. The last match of
    `mode: (solo|subagents|teammates|workflow) —` across them wins.
  - A `tool.call` hook applies the same match to each of the lead's calls as it happens.
- **Tasks:** `TaskList`. Progress is completed and total, and the percentage is
  `round(100 × completed ÷ total)`.
- **Console:** `GET http://127.0.0.1:4823/health`.
  - When `ok`, the link is `http://127.0.0.1:4823/s/<session id>`, labelled
    `127.0.0.1:4823/s/<first 8 of the id>`.
  - Any other answer or a failure gives no link.
- **Refresh:**
  - after each tool call and each `turn.complete`, at most once a second, plus every 5 s from one
    `$.clock.every`;
  - each refresh reads the session id (`/clear` changes it without a `session.start`),
    `TaskList` and `/health`;
  - `$.ui.invalidate('ui.render')` runs only when the snapshot changed.

## 3. Band

A `ui.render` hook on `{ component: 'AbovePrompt' }`.

- **Passes through** (returns `next(e)`) when any of these holds:
  - `e.props.hasSurvey`;
  - no mode has been decided;
  - the task list is empty.
- **Otherwise** it draws one `Box` column: `await next(e)` first, then the line, so every other
  mod's band stays above it.
- **The line** is one `Box` row that wraps only when the terminal is too narrow:
  1. `team8` in bold;
  2. ` is running a {mode} session · ` in dim;
  3. `total progress {completed}/{total} ({pct}%)`;
  4. ` · see details here ` in dim, then the console `Link` (`Link` takes no colour).

  While the console is down, item 4 is ` · console off, /team8:console starts it` in dim.

## 4. Failure

- Every hook body runs in `try`/`catch` and falls back to `next(e)` or to doing nothing.
- The `tool.call` hook also carries `.catch(($, e, next) => next(e))`.
- A refused tree costs only that site: Claude Code draws its own there.
- The wave notifier is unchanged.

## 5. session-cards (`~/code/claude-mods`): unchanged

- An earlier round changed `session-cards` to draw `next(e)` under its cards (claude-mods PR #4).
  It was dropped on 2026-10-12: the band is team8's, and the operator does not want their own mod
  changed for it. It also hid the cards in every session, since it put core's engine node under
  the cards' `width` Box.
- team8's band does not need it: its module loads before `session-cards` (Probes).

## Acceptance

- **`src/hooks/team.test.ts` (vitest):**
  - `decidedMode` finds the last mode line among run-log tool uses and ignores others: the skill
    text quoting `mode: solo | subagents …`, a run-log write with no mode line, and a mode line
    outside `docs/team8/runs/`;
  - `progress` gives `3/5 (60%)` and handles an empty list;
  - the console link with the console up and down.
- **`plugin/hooks/team8.test.ts` (`claude plugin test plugin`):**
  - with a decided mode and tasks, the line mounts on `terminal` and `desktop` and reads
    `team8 is running a subagents session · total progress 1/2 (50%) · see details here …`;
  - it passes through with no mode, and with no tasks;
  - with the console down it shows the off text.
  - the line still draws when the tree beneath is core's own engine node.
- **The repo:** `npm test` and `npm run typecheck` pass, and `claude plugin validate plugin`
  passes.
- **The live check (by the operator):** the team8 line shows under `session-cards`' cards, right
  above the prompt, in this session.

## Out of scope

The team pane, `/team8`, per-teammate items, digit hotkeys, NEEDS YOU, cost, and per-task
progress %.
