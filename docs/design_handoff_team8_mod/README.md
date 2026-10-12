# Handoff: team8 Claude Code mod (team pane + band)

## Overview
Two pieces of team8 drawn inside Claude Code itself, as a **mod** in the existing `team8@grimoire` plugin. Together they answer "do I need to go to the console right now, and where is it?" without leaving the terminal.

- **Band** (`12b`): one line above the prompt, always on, at any width. It shows the team, what needs you, the task count and the console address.
- **Team pane** (`12a`): a pane opened by `/team8`, or from a band hotkey. It has two tabs, `team` and `tasks`, plus a field that sends a prompt to the lead.

The band is how you get into the pane. Build both. The band can ship first on its own.

Mods API reference: https://code.claude.com/docs/en/plugins/mods/overview. The drawing guide is at `/docs/en/plugins/mods/interface`. Requires Claude Code v2.1.287 or later.

## About the design files
`team8 Mod - Canvas.dc.html` is a **design reference made in HTML**. It's a picture of a terminal, not code to ship. Build the real thing as a mod: a `hooks/register.js` (or `.ts`/`.tsx`) that returns element trees from `ui.render` hooks using `Box`, `Text`, `Button`, `Link` and `Input` from `$.ui.resolve(e)`. Open the file over http (`python3 -m http.server 8000` in this folder). Click `1: team` and `2: tasks` in the 12a pane to switch tabs.

## Fidelity
**High-fidelity for structure, copy, glyphs, order and behaviour. Not for pixels.** The terminal lays out in character cells, so the mock's px sizes and fonts don't carry over. Wherever this README gives a width, it's in **columns**. Colours are given as roles. Map them to Claude Code theme keys, or to the team8 Nocturne hex values below if the terminal supports truecolor.

## Data the mod needs
Read the **same sources the console's ingest already reads** (see `ENGINE.md` / `MESSAGING.md` in the repo docs). Don't add a second data path.
- **Team:** members, each with name, role, state (`working · plan · idle · blocked · failed`), current task id, a one-line activity (last tool call, or a state line) and the time since their last activity.
- **Tasks:** id, description, state (`blocked · ready · claimed · completed`), owner and dependencies. The counts are completed / claimed / blocked / total.
- **Needs you:** **only** items in the lead's inbox that wait on the operator: plan-approval requests and questions addressed to the lead. **Not permission prompts.** A mod can't see or change the permission prompt, so don't promise them here.
- **Console address:** take it from wherever the plugin already discovers the console (the same check behind the "team8 console available" startup line). Show the session's deep link (`localhost:8000/s/{sessionId}`) and the current watcher count. If no console is running, hide the address and its watcher count entirely. Never show a dead link.

Keep these in module-level variables or `$.state`. Refresh on the plugin's existing file-watch or ingest event, and call `$.ui.invalidate('ui.render')` when anything changes. Don't poll faster than 1 s.

## Screen 1: the band (`12b`)
**Render site:** `ui.render` filtered on `{ component: 'AbovePrompt' }`. The band is shared with other mods, so put `await next(e)` among your children to keep what they draw.

**Shown when:** the session is a team session (lead or teammate). For solo sessions return `next(e)` and draw nothing.

**Layout:** one row, `Box({ flexDirection: 'row', columnGap: 3 })`. It wraps to a second line only if the terminal is too narrow. Left to right:
1. `team8`, bold, text colour.
2. One item per teammate, in team order: `{digit}: {glyph} {name} {detail}`.
   - The digit is the button's hotkey (`1`–`9`). It's a plain `Button`, and the band accepts digit hotkeys without focus. The digit and colon are dim.
   - The glyph and detail depend on state:
     - working: `●` accent, then the task id dim (`T-04`)
     - plan approval / question waiting: `!` warn, then `plan waiting` / `question` in warn
     - idle: `○` dim, then `idle` dim
     - blocked: `✕` fail, then `needs T-04` dim
     - failed: `✕` fail, then `failed` in fail
3. `tasks {completed}/{total}`, dim.
4. Spacer, then the console `Link` (`href` the deep link, label `localhost:8000/s/7f3a`), accent and underlined where the terminal supports it.

**Behaviour:**
- **Digit press:** opens the team pane focused on that teammate's row (`$.ui.open({ id: 'team8', title: 'team8', focus: true })`). This counts as user-initiated, so the pane shows at any width.
- **New needs-you item:** call `$.ui.toast("{name}'s plan for {task} is waiting · {digit} to open")` once, when the item first arrives (not on every redraw). That teammate's band item stays warn until the item is answered.
- **More than 9 teammates:** show 1–8, then `+{n}` as a plain button that opens the pane.
- **Replaces `← 3 agents`.** If that footer hint is reachable through `SessionMode` / `PromptHint`, leave it alone. The band already carries the information.

## Screen 2: the team pane (`12a`)
**Opened by:** the `/team8` command (`$.command.register({ name: 'team8', immediate: true })`, so it works mid-turn), or a band digit. **Never opened by the mod on its own.** A self-opened pane waits for 144 columns, and this one has no reason to interrupt.

**Placement:** Claude Code decides it. In a wide fullscreen terminal the pane is a sidebar right of the transcript; otherwise it's a framed region above the prompt. Ask for `columns: 46` (sidebar) and `rows: 16` (above the prompt). Pass `closeOnEscape: true` and `holdToasts: false`.

**Render site:** `ui.render` filtered on `{ component: 'Pane' }`, with `e.requestId === 'team8'`.

**Layout:** one column, top to bottom:
1. **Header row:** `team8` (bold), then the session name dim (`improvements2`), spacer, then `esc close` dim.
2. **Console row:** `console` dim, then the `Link` to the deep link, then `· {n} watching` dim. Hidden when no console is running.
3. **Tabs:** two plain buttons, `1: team` and `2: tasks`, `columnGap: 3`. The open tab is text colour; the other is `dimColor: true`.
4. **Tab body** (below).
5. A spacer that fills the rest of the height.
6. **Lead field,** pinned to the bottom with a rule above it: `Input({ key: 'lead', label: 'Lead', placeholder: '@Vito take T-09 after T-04', submitLabel: 'send', value: '' })`. `onSubmit` calls `$.prompt.submit(value)` into the **lead's** session. `@name` routing stays the lead's job; the mod doesn't route. Ignore empty lines.

**`team` tab:**
- **`NEEDS YOU · {n}`:** a small-caps-style label in warn, with one row per item. Hide the whole section when n = 0.
  - Each row is `!` in warn, the name (8 columns), what's waiting (ellipsised, e.g. `plan for T-07 is waiting`, `asked a question in T-11`) and a plain button `{letter}: open`.
  - Letters are assigned per row in order: `o`, `p`, `q`…
  - Pressing one opens that teammate in the console: `$.os.open(deepLink + '?agent=' + name)`, or the API's equivalent for opening a URL.
- **`TEAM · {n}`:** a dim label, with one row per member: glyph (state colours as in the band), name (8 columns, text colour), task id (6 columns, dim), activity (ellipsised, mid-grey), then time since last activity, right-aligned and dim (`now`, `3m`, `12m`). Example rows:
  - `● Vito  T-04  Edit src/web/chrome/TeamSelect.tsx  now`
  - `! Pia   T-07  waiting on plan approval            3m`
  - `○ Ana   T-11  idle after a question               6m`
  - `✕ Tom   T-09  blocked, needs T-04                12m`
- **Focus:** a band digit opens the pane with that teammate's row focused (`autoFocus` on that row's button).

**`tasks` tab:**
- **Summary line:** `{completed} of {total} completed`, text colour, then ` · {claimed} claimed · {blocked} blocked`, dim.
- **Bar:** a one-row `Raster`, full pane width. Its cells are split by count: completed in accent, claimed in light accent, blocked in warn, the rest in the darkest neutral. On Desktop (`e.surface !== 'terminal'`) skip the bar; the summary line is enough.
- **`CLAIMED AND BLOCKED`:** a dim label, with one row per claimed task, then per blocked task. Each row: glyph (`●` claimed in accent, `!` plan-waiting in warn, `✕` blocked in fail), id (6 columns, dim), description (ellipsised), then the owner right-aligned and dim. A blocked task shows `needs T-04` in place of the owner.
- Ready and completed tasks are **not listed** here; the console's tasks view has them.

**Keys** (Claude Code owns Tab, the arrows, Enter and Esc and they can't be rebound):
- `1` / `2` switch tabs.
- Letter hotkeys open needs-you rows.
- Tab moves between controls; Enter presses or submits; Esc returns focus to the prompt and closes the pane.
- While the Lead field has focus, every printable key goes to the field. That's expected.

## State
- **`$.state`** (survives module reload, reset by `/clear` · `/resume` · `/branch`): `tab: 'team' | 'tasks'`, `focusAgent: string | null`.
- **Module variables:** the latest team, tasks, inbox and console snapshot, rebuilt from the ingest source.
- **`$.store`:** nothing yet. If the operator should keep their last tab across sessions, store `tab`, and reload it in `session.start` and in `classic.SessionStart` with `source` = `clear` / `resume` / `fork`.
- **Toasted-already set:** the ids of needs-you items already toasted. Keep it in a module variable; one toast per item per session.

## Design tokens (Nocturne, team8 default theme)
- **Ground:** `--color-bg` `#161826`. Terminal ground: `#12141f`.
- **Text:** `#e9e9ed`.
- **Neutrals** (light → dark): `#e2e3ea` `#c8cad6` `#b2b6ca` `#9397ab` `#75798c` `#595d6c` `#3f424d` `#292b31`. The mock uses n-400 for activity text, n-500/600 for dim, and n-800 for rules.
- **Accent** `#9184d9`, with steps 200 `#d2cefd` (light accent), 300 `#b5abfc` (links, running), 500 `#796cbf` (completed bar).
- **Warn:** `#d99e5c`. **Fail:** `#c98d8d`.
- **Glyphs:** `●` working · `!` waiting on you · `○` idle · `✕` blocked or failed · `⏎` submit.

In the terminal, use these as truecolor where available. Otherwise map them to the theme keys: text, dim (secondary), accent (suggestion/permission), warning and error.

## Out of scope / don't build
- Stop or pause controls, approving plans from the pane, or answering permission prompts. None of these has a mod call that is honest about what it does.
- Auto-opening the pane.
- Ready or completed task lists in the pane.

## Files
- `team8 Mod - Canvas.dc.html`: the reference (`#12a` pane, `#12b` band). Below the two mocks there's a note listing the platform limits.
- `support.js`, `_ds/…/styles.css`, `_ds/…/_ds_bundle.js`: needed only to open the reference in a browser.
