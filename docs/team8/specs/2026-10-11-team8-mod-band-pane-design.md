# team8 mod: band and team pane — design

Two pieces of team8 drawn inside Claude Code as part of the plugin's hooks module: a **band**
above the prompt and a **team pane**. Together they answer "do I need the console right now, and
where is it?" without leaving the terminal. Source: the design handoff in
`docs/design_handoff_team8_mod/` (README and `team8 Mod - Canvas.dc.html`), changed where the
probes or the repo disagreed with it (see Decisions).

## Decisions

- **Teammates only.** The band and the pane list in-process teammates. In subagents mode there are
  none, so the band stays empty and the pane shows the task tab's numbers.
- **Data from Claude Code, not the console's files.** The roster, `TaskList` and teammates' tagged
  tool calls are the sources; the console is read only for its address. The handoff asked for the
  console's ingest sources, but re-reading them in the module would re-implement team discovery,
  re-keying and transcript parsing, and the probes saw a session's team folder disappear
  mid-session.
- **No NEEDS YOU.** The handoff's section lists plan approvals and questions to the lead. team8
  never spawns teammates in plan mode, and the lead answers teammates itself, so the section would
  always be empty. Dropped with its letter hotkeys and toast; a failed teammate still shows as
  `✕ failed`. Add it when team8 uses plan mode.
- **Fullscreen is team8's default.** Claude Code docks a pane beside the transcript only in its
  fullscreen layout from 110 columns; on the main screen it places every pane inline above the
  prompt, and no mod call changes that. `/team8:setup` offers to set `"tui": "fullscreen"`; a
  session that isn't fullscreen still gets the pane inline.
- **The pane opens by itself when the lead invokes `team8:run`,** once per invocation, without
  taking the keyboard. Otherwise only `/team8` or a band digit opens it.
- **Task ids are team8's `#4`,** not the mock's `T-04`. The console address is
  `127.0.0.1:4823/s/<session id>`, not the mock's `localhost:8000/s/7f3a`.

## Probes (2026-10-11, Claude Code 2.1.296)

A throwaway mod, `t8ui`, in this session's dev-mods folder, deleted afterwards.

- **Command.** `$.command.register({ name: 'team8', immediate: true })` registered `/team8` beside
  the installed plugin's `/team8:*` commands without a clash.
- **Band.** A `ui.render` hook on `AbovePrompt` drew a row of plain Buttons with digit hotkeys, and
  `await next(e)` returned a tree to keep below it. A bare digit presses a band Button only while
  the composer is empty; otherwise the band needs focus (ctrl+x tab).
- **Pane.** A digit press opened `$.ui.open({ id, focus: true, closeOnEscape: true, rows: 16,
  columns: 46 })` with `isPlaced: true`. On the main screen (Warp, `"tui": "default"`) it was
  `placement: 'inline'`, `viewport.isFullscreen: false` at 136 columns; under `/tui fullscreen` it
  docked on the right. Tabs as plain Buttons with hotkeys `1` and `2` switched; a Button pressing
  `$.process.run(['open', url])` opened the browser; `/team8` reopened it.
- **Reads.** `$.fs.list` and `$.fs.read` under `~/.claude` (via `$.env.get('HOME')`), a
  `$.tool.call({ tool: 'TaskList' })` from a `$.clock.every` timer, and
  `$.http.fetch('http://127.0.0.1:4823/health')` all worked. `/health` answered
  `{ ok, team, agents, version, build, watching: { kind, name | id }, tabs }`; `tabs` counts the
  tabs of whatever the console is watching, which was another session.
- **The team can vanish.** Mid-session, `~/.claude/teams/session-89a6888f/` disappeared; its task
  files stayed on disk and `TaskList` returned nothing from then on.
- Not reached live: the Lead field's submit. `$.prompt.submit` itself is proven by the wave
  notifier; the plugin test below covers the field's handler.

## 1. Structure

- **`plugin/hooks/team8.tsx`** becomes the one `modules` entry (`hooks.json` takes one). It calls
  the wave notifier's `register` from `./wave-notify.ts`, unchanged, and adds the hooks below.
  `hooks.json`'s `modules` becomes `["./team8.tsx"]`, and its description gains a sentence for
  the band and the pane.
- **`plugin/hooks/team.ts`**, no Claude Code imports, as `wave.ts` is: the rules below as pure
  functions over plain values. vitest covers it from `src/hooks/team.test.ts`.
- Snapshot, activity, the open tab and the focused row are module variables. A reload rebuilds
  them; nothing goes in `$.state` or `$.store`.

## 2. Data

- **Teammates:** `$.agent.list()` entries that have a `teammateId`, in roster order, without the
  `completed` and `killed` ones. A session with none draws no band.
- **State** per teammate:

  | Roster status | State |
  |---|---|
  | `running`, `pending`, `waiting` | working |
  | `idle` | idle |
  | `failed` | failed |

  A working teammate that owns no `in_progress` task but owns a `pending` one with open blockers
  is **blocked** (the console's rule, `src/server/project.ts`).
- **Task id** per teammate: its `in_progress` task, else its first `pending` one, else none.
- **Activity:** a `tool.call` hook records each call that carries `e.agentId`: the tool and its
  first non-empty `command`, `file_path`, `path`, `pattern`, `query` or `url`, as
  `Edit plugin/hooks/team.ts`, and the time. Before any call, the state word stands in. The time
  gives `now` (under a minute), `3m`, `2h`.
- **Tasks:** `TaskList`. completed; claimed = `in_progress`; blocked = `pending` with a non-empty
  `blockedBy` (it holds open blockers only); total.
- **Console:** `GET http://127.0.0.1:4823/health`. `ok` gives the link
  `http://127.0.0.1:4823/s/<session id>`, labelled `127.0.0.1:4823/s/<first 8 of the id>`.
  `· n watching` shows only when `watching` is this session (`kind: 'session'` with this id, or
  `kind: 'team'` with this session's team, the part of a `teammateId` after `@`). Any other
  answer or a failure: no link and no count.
- **Refresh:** after a teammate's tool call and after any `turn.complete`, at most once a second;
  and every 5 s from a `$.clock.every`. It reads the roster, `TaskList` and `/health`, rebuilds the
  snapshot, and calls `$.ui.invalidate('ui.render')` only when the snapshot changed. A failed read
  keeps that part of the last snapshot.

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
     - working: `●` in accent, the task id dim
     - idle: `○` dim, `idle` dim
     - blocked: `✕` in fail, `needs #3` dim (its task's first open blocker)
     - failed: `✕` in fail, `failed` in fail
  3. `tasks {completed}/{total}`, dim.
  4. A spacer, then the console `Link` when the console is up (`Link` takes no colour; Claude
     Code draws links in its own style).
- More than 9 teammates: 1–8, then a plain Button `+{n}` that opens the pane.
- A digit (composer empty, or the band focused) opens the pane focused, on that teammate's row.
- Colours (truecolor hex, Nocturne): accent `#9184d9`, fail `#c98d8d`, text default; dim is
  `dimColor`.

## 4. Team pane

- **Opened by** `/team8` (`$.command.register({ name: 'team8', description, immediate: true })`
  in `session.start`, answered by a `command.run` hook), a band digit, or the lead's `team8:run`
  (below). The person's opens call
  `$.ui.open({ id: 'team8', title: 'team8', focus: true, closeOnEscape: true, rows: 16, columns: 46 })`.
- **On `team8:run`:** a `tool.call` hook on `Skill` whose `skill` is `team8:run`, and a
  `command.run` hook on `team8:run` that returns `next(e)` (the person's `/team8:run`), each open
  the pane without `focus`. That open is unasked, so Claude Code draws it from 144 columns (110
  once the person has opened it this session); when the result has `isPlaced: false`, one toast:
  `team8: /team8 opens the team pane`. An open pane is left as it is, and nothing reopens it until
  the next `team8:run`.
- **Placement** is Claude Code's: docked right in fullscreen from 110 columns, else inline above
  the prompt. While `e.props.placement` is `inline`, the header carries a dim
  `/tui fullscreen for a side panel`.
- **Layout,** one column, a `ui.render` hook on `{ component: 'Pane', requestId: 'team8' }`:
  1. Header: `team8` bold, a spacer, `esc close` dim.
  2. Console row: `console` dim, the `Link`, `· n watching` dim. Hidden when the console is down.
  3. Tabs: plain Buttons `1: team` and `2: tasks`, `columnGap: 3`; the open one in text colour,
     the other `dimColor`.
  4. The tab body.
  5. A spacer, a dim rule, then the Lead field.
- **`team` tab:** `TEAM · {n}` dim, then one Button per teammate: glyph (as in the band), name
  (8 columns), task id (6 columns, dim), activity (truncated at the end), time right-aligned and
  dim. With no teammates, one dim line: `no teammates in this session`.
  - Enter on a row, with the console up, runs `$.process.run(['open', '<link>?agent=<name>'])`
    (macOS `open`; elsewhere the Link is the way in).
  - The row of the teammate whose digit opened the pane has `autoFocus`.
- **`tasks` tab:**
  - `{completed} of {total} completed`, then ` · {claimed} claimed · {blocked} blocked` dim.
  - On the terminal (`e.surface === 'terminal'`), a one-row bar of `█` across the body columns,
    split by count: completed `#796cbf`, claimed `#d2cefd`, blocked `#d99e5c`, the rest `#292b31`.
    Coloured `Text`, not the handoff's `Raster`. No bar on other surfaces.
  - `CLAIMED AND BLOCKED` dim, then a row per claimed task and per blocked task: `●` accent or
    `✕` fail, the id (6 columns, dim), the subject (truncated), and right-aligned dim the owner,
    or `needs #4` for a blocked one. Ready and completed tasks are not listed.
- **Lead field:** `Input({ key: 'lead', label: 'Lead', placeholder: '@Vito take #9 after #4',
  submitLabel: 'send', value: '' })`. `onSubmit` with a non-blank value fires
  `void $.prompt.submit({ text: value })` into this session's lead; `@name` routing stays the
  lead's job.
- **Keys:** `1` and `2` switch tabs while the pane has focus; Tab, Enter and Esc are Claude Code's;
  while the field has focus every printable key goes to it.

## 5. Fullscreen setup

`plugin/commands/setup.md` gains one opt-in step: when `tui` in `~/.claude/settings.json` is not
`"fullscreen"`, ask the operator whether to make it so, saying that it changes every session's
layout and applies from the next session (`/tui fullscreen` does the same by hand). On yes, merge
`"tui": "fullscreen"`; on no, leave the file alone.

## 6. Failure

Every hook body runs in `try`/`catch` and falls back to `next(e)` or to doing nothing; the hooks
at gating sites (`tool.call`, `command.run` on `team8:run`) also carry
`.catch(($, e, next) => next(e))`, as the notifier's does. A refused
tree costs only that site: Claude Code draws its own, and the band is empty. The wave notifier's
hooks are unchanged.

## Acceptance

- `src/hooks/team.test.ts` (vitest): each roster status gives its state; a working teammate with
  only a blocked task is blocked; `completed`, `killed` and teammate-less entries are left out;
  task id picks `in_progress` before `pending`; the counts; the claimed and blocked rows, with
  `needs #N`; the link with and without the watching count, and none when `/health` is not ok;
  `ago` at 0 s, 59 s, 3 m and 2 h; the activity line for Bash, Edit and a tool with no known field.
- `plugin/hooks/team8.test.ts` (`claude plugin test plugin`; vitest reads only `src/`): with a
  mocked roster and task list, the band and the pane mount on `terminal` and `desktop` and their
  trees validate; a digit press opens `team8`; a Lead submit calls `$.prompt.submit` and a blank
  one doesn't; a `Skill` call for `team8:run` opens the pane.
- `npm test` and `npm run typecheck` pass; `claude plugin validate plugin` passes and lists the
  band, pane, command and `Skill` hooks beside the notifier's.
- The lead's live check at the close: a dev-mods copy under another plugin name, a haiku teammate
  owning a task; the band shows its row with activity, its digit opens the pane, and the operator
  confirms both by eye, in fullscreen and on the main screen. Then stop the teammate, delete the
  task and the copy.

## Out of scope

NEEDS YOU, plan approvals and permission prompts; stop, pause or approve controls; subagents in
the band; ready and completed task lists in the pane; keeping the tab across sessions.
