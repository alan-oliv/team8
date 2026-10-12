# team8 mod: the band — design

One piece of team8 drawn inside Claude Code as part of the plugin's hooks module: a **band**
above the prompt naming each teammate, its state and task, the task count and the console link.
It answers "do I need the console right now, and where is it?" without leaving the terminal.
Source: the design handoff in `docs/design_handoff_team8_mod/` (README and
`team8 Mod - Canvas.dc.html`), changed where the probes or the repo disagreed with it (see
Decisions).

## Decisions

- **The band only; the team pane was built and removed.** The handoff's pane shipped first in
  this batch, then came out after the live check on the operator's call: Claude Code docks a pane
  beside the transcript only in its fullscreen layout (`/tui fullscreen`), from 110 columns, and
  places it inline above the prompt on the default renderer, which no mod call changes. With the
  pane went `/team8`, the open on `team8:run`, the Lead field, the teammates' activity line and
  `/team8:setup`'s fullscreen step.
- **A band digit opens the console on that teammate**
  (`127.0.0.1:4823/s/<session id>?agent=<name>`) while the console is up, and does nothing
  otherwise.
- **Teammates only.** The band lists in-process teammates. In subagents mode there are none, so
  the band stays empty.
- **Data from Claude Code, not the console's files.** The roster and `TaskList` are the sources;
  the console is read only for its address. The handoff asked for the console's ingest sources,
  but re-reading them in the module would re-implement team discovery, re-keying and transcript
  parsing, and the probes saw a session's team folder disappear mid-session.
- **No NEEDS YOU.** team8 never spawns teammates in plan mode, and the lead answers teammates
  itself, so the handoff's section would always be empty; a failed teammate still shows as
  `✕ failed`.
- **Task ids are team8's `#4`,** not the mock's `T-04`. The console address is
  `127.0.0.1:4823/s/<session id>`, not the mock's `localhost:8000/s/7f3a`.

## Probes (2026-10-11, Claude Code 2.1.296)

A throwaway mod, `t8ui`, in this session's dev-mods folder, deleted afterwards; then the live
check with a dev-mods copy, `t8live`.

- **Band.** A `ui.render` hook on `AbovePrompt` drew a row of plain Buttons with digit hotkeys,
  and `await next(e)` returned a tree to keep below it. A bare digit presses a band Button only
  while the composer is empty; otherwise the band needs focus (ctrl+x tab).
- **Pane (since removed).** `$.ui.open` placed it `inline` on the default renderer
  (`viewport.isFullscreen: false`, 136 columns) and docked it on the right under
  `/tui fullscreen`. The mods interface doc says so in one line ("a sidebar beside the transcript
  in a wide fullscreen terminal, or a framed region above the prompt otherwise").
- **Reads.** `$.agent.list()`, a `$.tool.call({ tool: 'TaskList' })` from a `$.clock.every` timer,
  and `$.http.fetch('http://127.0.0.1:4823/health')` all worked.
- **The team can vanish.** Mid-session, `~/.claude/teams/session-89a6888f/` disappeared and
  `TaskList` returned nothing; Claude Code also clears a task list once every task in it is
  completed, and the live-check teammate dropped out of the roster with it.

## 1. Structure

- **`plugin/hooks/team8.tsx`** is the one `modules` entry (`hooks.json` takes one). It calls the
  wave notifier's `register` from `./wave-notify.ts`, unchanged, and adds the hooks below.
- **`plugin/hooks/team.ts`**, no Claude Code imports, as `wave.ts` is: the band's rules as pure
  functions over plain values. vitest covers it from `src/hooks/team.test.ts`.
- The snapshot is module variables. A reload rebuilds it; nothing goes in `$.state` or `$.store`.

## 2. Data

- **Teammates:** `$.agent.list()` entries that have a `teammateId` and a `name`, in roster order,
  without the `completed` and `killed` ones. A session with none draws no band.
- **State** per teammate: `running`, `pending`, `waiting` → working; `idle` → idle; `failed` →
  failed. A working teammate that owns no `in_progress` task but owns a `pending` one with open
  blockers is **blocked** (the console's rule, `src/server/project.ts`).
- **Task id** per teammate: its `in_progress` task; else, when blocked, the blocked task; else its
  first `pending` one.
- **Tasks:** `TaskList`, counted as completed and total.
- **Console:** `GET http://127.0.0.1:4823/health`; `ok` gives the link
  `http://127.0.0.1:4823/s/<session id>`, labelled `127.0.0.1:4823/s/<first 8 of the id>`. Any
  other answer or a failure: no link, and digits do nothing.
- **Refresh:** after a teammate's tool call and after any `turn.complete`, at most once a second;
  and every 5 s from one `$.clock.every`. It reads the session id (`/clear` changes it without a
  `session.start`), the roster, `TaskList` and `/health`, and calls `$.ui.invalidate('ui.render')`
  only when the snapshot changed.

## 3. Band

A `ui.render` hook on `{ component: 'AbovePrompt' }`.

- `e.props.hasSurvey`, or no teammates: return `next(e)`.
- Otherwise one row, `Box` `flexDirection: 'row'`, `columnGap: 3`, wrapping only when too narrow,
  with `await next(e)` below it so other mods' band stays:
  ```
  team8   1: ● Vito #4   2: ○ Ana idle   3: ✕ Tom needs #3   4: ✕ Pia failed   tasks 9/29        127.0.0.1:4823/s/89a6888f
  ```
  1. `team8`, bold.
  2. One plain `Button` per teammate, `hotkey` its digit: `{glyph} {name} {detail}`.
     - working: `●` in accent, the task id dim (or `working` with no task)
     - idle: `○` dim, `idle` dim
     - blocked: `✕` in fail, `needs #3` dim (its task's first open blocker)
     - failed: `✕` in fail, `failed` in fail
  3. `tasks {completed}/{total}`, dim.
  4. A spacer, then the console `Link` when the console is up (`Link` takes no colour).
- More than 9 teammates: 1–8, then a plain Button `+{n}` that opens the console on the session.
- A digit (composer empty, or the band focused) runs `$.process.run(['open', '<link>?agent=<name>'])`
  while the console is up (macOS `open`).
- Colours (truecolor hex, Nocturne): accent `#9184d9`, fail `#c98d8d`; dim is `dimColor`.

## 4. Failure

Every hook body runs in `try`/`catch` and falls back to `next(e)` or to doing nothing; the
`tool.call` hook also carries `.catch(($, e, next) => next(e))`, as the notifier's does. A refused
tree costs only that site: Claude Code draws its own, and the band is empty. The wave notifier's
hooks are unchanged.

## Acceptance

- `src/hooks/team.test.ts` (vitest): each roster status gives its state; a working teammate with
  only a blocked task is blocked; `completed`, `killed` and teammate-less entries are left out;
  task id picks `in_progress` before `pending`; the band detail per state; the counts; the link,
  and none when `/health` is not ok.
- `plugin/hooks/team8.test.ts` (`claude plugin test plugin`; vitest reads only `src/`): with a
  mocked roster and task list the band mounts on `terminal` and `desktop` and its tree validates;
  a digit runs `open` on the teammate's console link, and nothing while the console is down; no
  teammates, no band.
- `npm test` and `npm run typecheck` pass; `claude plugin validate plugin` passes and lists the
  band's hooks beside the notifier's.
- The lead's live check at the close: a dev-mods copy under another plugin name and a haiku
  teammate owning a task; the operator confirms the band row by eye and that a digit opens the
  console on that teammate. Then stop the teammate, delete the task and the copy.

## Out of scope

The team pane, `/team8`, a Lead field, NEEDS YOU, plan approvals and permission prompts; stop,
pause or approve controls; subagents in the band.
