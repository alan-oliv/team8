# team8 mod: the band — design

One line of team8 drawn inside Claude Code, first above the prompt, as part of the plugin's
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
- **First above the prompt.** Claude Code nests the plugins' `AbovePrompt` hooks in an order no
  plugin chooses. The team8 band draws itself before `next(e)`, and the operator's own
  `session-cards` mod (`~/code/claude-mods`) draws `next(e)` before its cards, where it used to
  drop it. Whichever of the two is outermost, the team8 line comes first.
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
  tree of the plugins beneath it. `session-cards` returned only its own tree, so whenever it sat
  outside team8 the team8 band was dropped. That is why the operator saw no band.
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
- **Otherwise** it draws one `Box` column: the line first, then `await next(e)`, so every other
  mod's band stays below it.
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

## 5. session-cards (`~/code/claude-mods`)

- In `session-cards/hooks/register.tsx`, the `AbovePrompt` hook awaits `next(e)` and draws it
  first, above its own tree. When it has nothing of its own to draw, it still returns `next(e)`.
- The change goes on a branch of `claude-mods`, with a version bump following that repo's
  convention and a PR against its `main`.

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
- **`session-cards`:** its own tests pass, plus one new test that a tree from beneath is drawn
  above the cards.
- **The repo:** `npm test` and `npm run typecheck` pass, and `claude plugin validate plugin`
  passes.
- **The live check (by the operator):** the team8 line shows first, above `session-cards`, in
  this session.

## Out of scope

The team pane, `/team8`, per-teammate items, digit hotkeys, NEEDS YOU, cost, and per-task
progress %.
