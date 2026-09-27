# Console lifecycle — design

Sub-project 1 of 5 from the 2026-09-27 improvement study: the console you see is
the build you shipped, showing the session you asked for. Covers study items E1,
E2, E3, E4, E5 and F3, plus the in-flight session-binding fix.

## Problem

- `/team8:console` binds the console to whatever the server guesses, not the
  session it was run from. Claude Code leaves team directories behind, so the
  guess was routinely a team whose lead exited days earlier.
- The server listens only after reading `~/.claude` (about 16 s on a busy
  machine). Every hook in that window finds nothing listening and spawns another
  server; the losers stay alive, write into the same team log and turn its
  compaction off.
- An upgrade leaves the old build serving on 4823, and nothing on screen says
  which build is running. "I don't see it" came up in 8 sessions.
- CI fails on a stale committed `plugin/dist` (29 of the last 30 failures), and a
  red CI on `main` skips the version bump.
- The Claude Code version check warns on every version but exactly 2.1.231.
- One wiring test reads the author's real checkout and fails only on that machine.

## Decisions

- `/team8:console` always opens on the session it was run from, and open tabs
  follow.
- The console never shuts itself down.
- A newer installed build replaces an older running console automatically; it
  never downgrades.
- CI stops checking `plugin/dist`; the bump workflow stays the only place that
  builds and commits it.

## 1. What the console shows

### Behaviour

When `/team8:console` runs in session S:

1. If the console on 4823 runs the same or a newer build than the one S loaded,
   it switches to S. No restart.
2. If nothing is listening, or it runs an older build, it is replaced by the
   build S loaded, started on S.
3. Every open tab switches to S and its address becomes `/s/S`, so a reload
   stays on S.
4. If no tab is open, the command opens one at `/s/S`.
5. The console then stays on S: if S forms a team, is re-keyed, or is a
   `/branch` of a team lead, it shows that team. It moves only when the operator
   picks something in the picker or runs `/team8:console` from another session.

### The watch

`src/server/index.ts` keeps one value in place of `pinned`, `currentTeam` and
`currentSession`:

```ts
type Watching = { kind: 'session'; id: string } | { kind: 'team'; name: string } | { kind: 'auto' };
```

| Set by | Value |
|---|---|
| `--session <id>` | session |
| `--team <name>` | team |
| neither flag | auto |
| `selectTeam` (picker click) | team |
| `selectSession` (`/s/<id>`, `/team8:console`) | session |

What is **shown** is derived from the watch:

- **session** — the team the session drives (below), else the bare session.
- **team** — that team, even after it ends.
- **auto** — the newest live team with 2+ members, else the newest live
  lead-only team, else nothing. Live means its lead is running or its files
  moved within `IDLE_GRACE_MS`. The boot sweep adopts no pre-existing team
  (`adoptExistingTeams: false`).

The follower (every `FOLLOW_INTERVAL_MS`) recomputes what should be shown and
retargets when it differs from what is shown. `selectSession` sets the watch and
retargets at once; when the resolved target is already shown it returns
`changed: false` without rebuilding.

### The team a session drives

A pure function over the walk:

```ts
function teamOfSession(walk: TeamWalk, chain: string[]): TeamSummary | undefined
```

`chain` is the session followed by its `/branch` ancestors, read from the
`forkedFrom.sessionId` header on each transcript's first line (at most 20 hops,
as the launcher does). A team matches when its `config.leadSessionId`, or its
direct driver (`walk.drivers`: a teammate sidecar's `teamName`, else
`config.leadSessionId`), is any id in the chain. Several matches: most members
wins, which picks a re-keyed team over its lead-only predecessor. `adoptByCwd` is
never consulted.

The picker's `current` flag is computed from what is shown, so a row marked
current is always the one on screen, and clicking any other row switches.

### Tabs follow

- The frame carries `watchedSession?: string` when the watch is a session.
- `writeUrlState` writes `/s/<watchedSession>` when present, else the existing
  `/s/<lead>`. A re-keyed team's frame lead is a fresh id no session carries, so
  the session id is what makes a reload land back on it.
- A tab announces its `/s/` route only on page load (unchanged), so a tab that
  reconnects never pulls the console back to its old session.

### Entry points

- `plugin/commands/console.md`: health check; same-or-newer build →
  `POST /api/select-session/${CLAUDE_SESSION_ID}`; otherwise stop and start with
  `--session ${CLAUDE_SESSION_ID}`, polling health until ready. When `/health`
  reports `tabs: 0`, open `/s/${CLAUDE_SESSION_ID}` with `open` (macOS) or
  `xdg-open` (Linux). Always print the `/s/` URL.
- `plugin/bin/console-launch.sh`: a Workflow passes `--session` only; a teammate
  spawn keeps passing `--team` from its evidence chain. The folder guess
  (`find_team_by_cwd`) is never used for a workflow.

## 2. Starting, stopping and coming back

- **Port first.** `main()` listens with `createBootingServer()` (503 `{}`) before
  discovery, `openStore` and the boot sweep, then swaps in the real handler. A
  second console exits 1 on `EADDRINUSE` before touching any log.
- **Boot failure exits.** Everything between `listen` and the handler swap runs
  in a `try`; a throw logs and exits 1 instead of leaving the port answering 503.
- **Never stops on its own.** Remove `startIdleReaper` and the SessionEnd
  shutdown in `src/server/ingest/hooks.ts`. The console stops only when
  `/team8:console` or an upgrade replaces it, or the machine restarts. An ended
  session stays on screen.
- **Record of the watch.** The server writes `~/.claude/team8/console.json`
  `{ pid, port, version, watching }` at boot and on every watch change (write to
  a temp file, then rename).
- **Restart after a crash.** `plugin/bin/console-restart.sh`:
  - any HTTP answer from `/health`, including 503, means up — exit;
  - no `console.json` — the console has never run here — exit;
  - otherwise start with the flags `console.json` records (`--session` or
    `--team`), under the existing lock.
- `hasLiveTeam` goes with the reaper and the restart gate if nothing else uses it.

## 3. Build identity and upgrades

- **Identity.** At boot the server reads its version from
  `<plugin root>/.claude-plugin/plugin.json`. A server run from a working copy
  (not under the plugin cache) reports `build: 'dev'` and its git sha. `/health`
  gains `version`, `build`, `sha?`, `watching` and `tabs` (stream clients).
- **Chip.** `src/web/chrome/Bar.tsx` shows `1.0.44` or `dev · <sha>`. It turns
  amber when `~/.claude/plugins/installed_plugins.json` lists a newer team8
  version than the one running (the frame carries `build` and `installed`).
- **Compare.** A pure `isOlderBuild(running, candidate)`: numeric
  `major.minor.patch`; `dev` is never older. Shell callers use it through a
  `node` one-liner.
- **Upgrade on session start.** `plugin/bin/console-hint.sh` (SessionStart):
  when the running console is older than `${CLAUDE_PLUGIN_ROOT}`'s version, it
  posts `/api/shutdown` and starts the new build in the background with the
  flags in `console.json`. It never waits and never downgrades.
- **CI.** Delete the "Check plugin/dist is committed" step in
  `.github/workflows/ci.yml`; `npm run build` stays as a compile check. Add
  `.gitattributes` with `plugin/dist/** linguist-generated=true -diff`. Update the
  README's contributor note. The author's "run dist before commit" memory note is
  deleted at close.
- **Version floor.** `checkClaudeVersion` in `src/server/setup.ts` passes any
  version at or above `2.1.231` and warns only below it.

## 4. Testing

Every test below is written to fail before its change.

- **Pure, no mocks:** `teamOfSession` (direct evidence, `/branch` ancestors,
  re-key picks most members, adoption ignored); `isOlderBuild` (older, newer,
  same, dev); the version floor.
- **Wiring** (`src/server/index.wiring.test.ts`, a real server on a temp home):
  a watched session follows a lead-only re-key and a `/branch`; the picker's
  `current` row is what is shown; select-session on the running console switches
  without a restart; a second console exits without touching the log; a boot
  failure exits; after a kill, `console-restart.sh` brings it back on the recorded
  watch.
- **Scripts:** `console-restart.sh` treats a 503 as up and restores the recorded
  flags; `console-hint.sh` replaces only an older build.
- **Web:** a frame whose `watchedSession` changes rewrites the tab's address to
  `/s/<id>`.
- **F3:** assign `leadFacts` in `followRealTeam` only after the generation check;
  point the wiring fixture's team at a temp directory with its own `.git/HEAD`.
- The 8 tests already written for the in-flight fix are kept.
- **By hand, at the end,** with the built console on the real `~/.claude`:
  `/team8:console` here switches an open tab from another session without a
  restart; with no tab open it opens one; killing the console brings it back on
  this session; a fake older version is replaced and a newer one is not.

## Out of scope

The study's other sub-projects: console UI (A, B), batch orchestration (C), cost
(D) and team8 development tooling (F1, F2, F4, E6). Per-session streams, where
two tabs watch two sessions at once, stay deferred.
