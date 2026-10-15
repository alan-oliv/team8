# Session picker, live only — design

The console's session picker (`TeamSelect`) lists only sessions whose Claude process is running,
scoped by a folder menu with no `all` entry, rendered from the SSE frame instead of a fetch on
every open. A past session is reached by resuming it from the terminal, which makes it live and
therefore listed. Brainstormed 2026-10-15 against the measurements below, on a machine with 263
sessions in 22 folders and 2 GB of transcripts.

## Decisions

- **Alive = process alive.** A row exists iff `sessions/<pid>.json` names a pid that answers and
  is not a `bg-spare`. Busy and parked-at-prompt both count. Ended sessions, finished teams and
  the `IDLE_GRACE_MS` window produce no rows.
- **Folder menu, no `all`.** The menu lists only folders that hold a live session, each with its
  live count. Default scope is the folder of the session on screen; a pick is remembered for the
  browser and ignored when that folder has no live row.
- **The frame carries the list.** The 3 s follower, which already walks the disk and threw the
  result away, computes the rows; `TeamState.sessions` carries them; the picker never fetches.
  `GET /api/teams` is removed.
- **One switch path, in place.** Every row switches through `POST /api/select-session/<id>` and
  `history.pushState('/s/<id>')`. The full page reload for session rows, and the splash-skip that
  hid it, go. `POST /api/teams/:name/select` stays for the launcher's `/?team=<name>` announce
  (`App.tsx`), which carries a team name, not a session id; nothing in the picker calls it.
- **A switch re-parses nothing it has parsed before.** The tail watcher's per-file byte offsets
  are kept per target across ingest rebuilds; the store already keeps the events.
- **Removed with no replacement:** the ✕ hide / ↺ unhide / show-hidden feature and
  `useHiddenSessions`; the collapsed idle · ended · hidden group; the text search box (⌘K and the
  arrow keys stay); the `all` scope; `TeamsResponse`, `FolderSummary`, `ALL_FOLDERS`, `inFolder`.
- **Kept:** "stop watching" and `LeftSession` (they are about the session on screen, not the
  list); the kind pill, branch, diffstat and agent count on a row; `⌘⏎` opening `/s/<id>` in a
  new tab.

## Measurements (2026-10-15, team8 1.0.55, this machine)

- Picker open, warm: 180–800 ms per ⌘K, every time, with a "reading teams…" flash. Cold: ~1 s
  and RSS 113 → 490 MB (`transcriptMeta` reads whole transcripts on first sight; largest is
  169 MB).
- Follower tick: ~180 ms of disk work plus a `ps` and a `git diff` spawn per live folder, every
  3 s, per console, result discarded.
- Switch (`POST /api/select-session`): 1.5–1.9 s. CPU profile: the sweep's walk, stat and JSON
  dispatch total 87 ms; `parseLine` + `slice` + `drain` are ~1.5 s per switch — the fresh ingest
  re-parses the target transcript and its subagents from byte 0, including on a return to a
  session already parsed. `transcriptMeta` first reads: 233 ms.
- Boot: 2.2 s. Fine.

## Server

### `listLive(teamsRoot, sessionsRoot, projectsRoot, current): SessionRow[]`

Replaces `listTeamSummaries`, `listAllFolders`, `listFolders`, `sessionIdsIn`,
`folderSessionIds`, `folderPathOf` and the ended-state paths of `sessionRows`.

1. `readSessions()` as today: live set (pid answers, not a spare), busy set, names, cwds.
2. `walkTeams()` keeps its return shape — `followRealTeam`'s `targetOf`, `autoTeam` and
   `teamOfSession` read it — but does the cheap work first and the expensive work only for
   survivors: read every `teams/<name>/config.json`, decide `leadAlive` from the live set and the
   teammate sidecars (`teamsOfLiveSessions`), and drop any team whose lead is not live and whose
   lead cwd is not a live session's cwd **before** `lastActivityOf`, `workflowOf`,
   `subagentCountOf`, `transcriptMeta` and `branchOf`. The cwd exception keeps the `/branch`
   re-key case that `adoptByCwd` exists for; `IDLE_GRACE_MS` survives only as `adoptByCwd`'s
   bound and never produces a row.
3. Every live session not covered by a team row becomes a session row: today's `sessionRows`
   without the `done`/`recent` branches. `sdk-cli` entrypoints are still skipped.
4. `transcriptMeta`'s first read of a file is capped to its last 256 KB (title, branch, cwds) plus
   the 64 KB head `forkParentOf` already reads (`entrypoint`); later reads stay incremental from
   the remembered offset. A title or branch written earlier than the last 256 KB and never
   rewritten is not found; the row falls back to the sidecar name or the session id.

### Row shape

`TeamSummary` becomes `SessionRow` in `src/shared/domain.ts`:

```ts
export interface SessionRow {
  id: string;            // session uuid — what POST /api/select-session/<id> and /s/<id> take
  team?: string;         // teams/<dir> when this session drives a team
  title: string;         // sidecar name, else transcript title, else `session-<8>`
  members: number;       // 1 for a bare session
  folder: string;        // absolute path the transcript last recorded working in, else the sidecar's cwd
  branch?: string;
  busy: boolean;         // sidecar status !== 'idle'
  current: boolean;      // the row for the session on screen
  mode?: DecidedMode;
  workflow?: { runId: string; name?: string; live: boolean };
  subagents?: number;
  diffstat?: { added: number; removed: number };
}
```

Gone from the row: `state`, `live`, `leadAlive`, `lastActivityAt`, `createdAt`, `sessionOnly`,
`goal`, `name`. `walkTeams` keeps an internal `TeamSummary`-like record for the follower; it is no
longer exported to the client.

### Transport

- `followRealTeam` calls `listLive` instead of `walkTeams` + `listTeamSummaries`, keeps the rows
  in a `let sessions: SessionRow[]`, and calls `hub.publish()` when their JSON changed.
- `publish()` adds `sessions` to `TeamState`.
- `GET /api/teams` and the `listTeams` dep are removed from `http.ts`. `POST /api/select-session/<id>`
  is the picker's one switch route; it already resolves a session to the team it drives
  (`teamOfSession` over the fork chain). `TEAM_SELECT_ROUTE` and `selectTeam` stay for the
  launcher announce only; `LeftSession`/`NoSessions`' `onSwitchTo` takes a session id and uses
  `select-session` too.

### Switch

- `AppendOnlyWatcher` gains `states(): Map<string, TailState>`; `watchAppendOnly(root, onLines,
  seed?)` starts from `seed` when given.
- `IngestConfig` gains `tails?: Map<string, TailState>`; `FileIngest.close()` returns the
  watcher's states.
- The server keeps `tailsByTarget: Map<string, Map<string, TailState>>`. `retarget` and
  `retargetSession` store the closing ingest's states under the target it served and seed the
  new ingest with the map saved for the target it opens. The store's `logs/<target>.jsonl`
  already holds the events, so a return to a session pumps only bytes appended since.
- First visit to a session still parses it; the row's `switching…` mark covers that.

## Client

### Data

`TeamSelect` takes `sessions: SessionRow[]` as a prop (from `state.sessions`) and loses its
fetch effect, `teams`/`loading`/`unreadable`/`folders` state and the `TeamsResponse` import.
`App.tsx`'s two `/api/teams` fetches (`elsewhere` for `LeftSession`/`NoSessions`; the
auto-resume target) read `state.sessions`. `useHiddenSessions`, `WatchState.hidden`,
`hideSession`, `unhideSession`, `showHidden` and the ✕/↺ buttons are deleted.

### Folder chip

Folders = distinct `row.folder` over the rows, each with its count, sorted by count desc then
name. Scope default = the current row's folder (every folder when there is no current row). A
pick is stored under the existing `console.folder` key as a bare path; `readStoredFolders`' legacy
array/`*` parsing goes; a stored path with no live row is ignored. The chip reads `name · ~/path`.

### Rows

Sorted busy first, then title (`localeCompare`, base sensitivity), then id. Anatomy as today
minus the hidden controls; the state cell reads `working` or `at prompt`. Header: `N live`.
Footer: `⏎ open`, `⌘⏎ new tab`, and `N live across M folders`.

### Switch

`select(row)`: if `row.current`, resume watching (today's rule) and close. Otherwise
`setMark('switching')`, `POST /api/select-session/<id>`; on 200 `history.pushState(null, '',
'/s/<id>')`; the panel closes when a frame lands whose `leadSessionId` or `teamName` is the row's
(today's `current`-landed effect). 404 → `gone`, other → `failed`, as today.
`window.location.assign`, `skipNextSplash` and `splashSkipped` are removed; the splash plays
once per app load. `store.sessionRoute` stays mount-only: a fresh tab still lands via the URL,
and `writeUrlState` already rewrites `/s/<lead>` from each frame.

### Empty states

`NoSessions` becomes "nothing live on this machine" with one line — *resume a session from your
terminal and it appears here* — and loses `notShownCount`/`onShowHidden`. `LeftSession` keeps
`elsewhere`, fed from the frame. A session that dies on screen stays on screen (the frame still
carries it); its row leaves the list and the trigger keeps naming it.

## Error handling

- The picker makes no request, so `unreadable` and "could not read teams" go. Before the first
  frame the existing connecting state shows.
- `listLive` drops a row, never the listing, on an unparseable sidecar, a pid that won't answer,
  or a transcript gone mid-read. `diffstatOf` keeps its 2 s timeout.
- A `POST /api/select-session` 404 (session died between frame and click) marks the row `gone`;
  the next frame removes it.
- A seeded tail state the file disagrees with (inode, birthtime or size below offset) already
  restarts from 0 in `drain`; a stale seed costs a re-parse, never a wrong view.
- A `history.pushState` that throws is ignored; the server-side switch has landed.

## Testing

`vitest run` and `tsc --noEmit` gate every task.

- `src/server/index.test.ts`: the `listTeamSummaries`, `the folder menu on a listing` and
  `listFolders` describes are replaced by a `listLive` describe on the same tmp `~/.claude`
  fixtures: live session → row; dead pid → none; `bg-spare` pid → none; live session driving a
  team → one team row; `/branch` re-keyed team adopted by its live cwd; `sdk-cli` skipped;
  `folder` is the transcript's last cwd; a `custom-title` inside the last 256 KB is found; a
  >256 KB file is read only from its tail on first sight. `walkTeams`' adoption tests stay.
- `src/server/watch/tail.test.ts`: a watcher seeded with another's states reads only appended
  bytes; a seed the file disagrees with restarts from 0.
- `index.wiring.test.ts`, `http.test.ts`, `http.security.test.ts`: drop the `GET /api/teams`
  cases (the `/api/teams/:name/select` ones stay); add "the frame carries `sessions`", "a second switch to the
  same session pumps nothing" (pump count via the testkit), and `/api/select-session/<id>` still
  refusing a non-uuid.
- `src/web/chrome/TeamSelect.test.tsx`: rewritten against the `sessions` prop — folder
  derivation and counts, default scope, stored scope ignored without a live row, busy-first
  order, keyboard nav, the one switch path, `⌘⏎`. Hidden/collapsed/search/`all`/loading cases
  deleted. `state-fixture.ts`'s `sampleTeams()` becomes `sampleSessions()`.
- `App.test.tsx`, `NoSessions.test.tsx`, `LeftSession.test.tsx`: `elsewhere` and auto-resume read
  the frame; `useHiddenSessions.test.ts` goes with its hook; `session-trace.e2e.test.tsx` stops
  stubbing `/api/teams`.
- Manual, last task: on the running console, ⌘K shows live rows only and no flash; switch
  between two sessions twice; the return is < 300 ms server-side (`curl -w %{time_total}`); a
  `bg-spare` session is not listed.

## Out of scope

- Pre-parsing sessions before their first visit.
- A persistent on-disk index of transcripts (session-deck's model); live-only needs none.
- The zombie console observed during measurement (a 1.0.52 server still ticking after losing its
  port) — a lifecycle fix, separate batch.
