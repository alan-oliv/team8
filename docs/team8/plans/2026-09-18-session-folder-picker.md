# Session / Folder Picker Fixes Implementation Plan

> **For agentic workers:** this plan is executed by teammates that `team8:run` dispatches from the shared task list. Read your own task section. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The session picker lists every session exactly once, under one folder, with the metadata read from the files that session actually wrote; the row on screen is always in the list and marked; a reload lands where the operator was.

**Architecture:** Nothing new. Six PR-sized steps over `src/server/index.ts` (the listing), `src/web/chrome/TeamSelect.tsx` (the picker), `src/web/App.tsx` (auto-resume) and `src/web/state/useTeamState.ts` (the URL). Each step deletes more than it adds: one helper is reused (`sessionProjectDir`), one reader is extended (`transcriptMeta`), and `folderScope`, `cwdInTranscript`, the picker's `scope`/`neededAll` state and the dual-URL fetch go away.

**Tech Stack:** TypeScript, Node 22 `fs`, React 19, Vitest + Testing Library.

**Origin:** GitHub issue #5 ("sessions dropdown shows sessions from other folders"). Investigated 2026-09-18 against the real `~/.claude` (461 transcripts, 12 project dirs, 31 team dirs) and two synthetic `claudeHome` trees driven through the real server. Every issue below was reproduced, not inferred.

## How to read this

- **Part 1** is what is on disk and what Claude Code actually writes — every bug is a disagreement between two of those sources.
- **Part 2** is the eleven issues with root cause and evidence.
- **Part 3** is the product decisions the work depends on, with a default for each.
- **Part 4** is the plan: six tasks, ordered, with the test that gates each.
- **Part 5** is what was looked at and deliberately left alone.

Run per task: `cd /Users/alanoliveira/code/team8 && npx vitest run src/server/index.test.ts src/web/chrome/TeamSelect.test.tsx && npx tsc --noEmit`.

---

## Part 1 — What is on disk

| File | Carries | Gotcha |
|---|---|---|
| `~/.claude/projects/<slug>/<sid>.jsonl` | one session's transcript; `slug = cwd.replace(/[^a-zA-Z0-9]/g, '-')`, fixed when the transcript is created | **every record carries the live `cwd`**, which moves when the session `cd`s. 57 of 461 transcripts changed cwd mid-session; the `~/code` dir alone holds records from 28 distinct cwds (49 of its 93 sessions moved). One real dir (a worktree) has a slug whose *first* cwd record is a different path — its own path first appears 1.5 MB into a 3 MB file. The slug cannot be reversed: `/`, `.`, `_`, `-` all map to `-`. |
| `~/.claude/projects/<slug>/<sid>/subagents/…` | subagent transcripts and teammate `.meta.json` sidecars | written beside the transcript, i.e. under the same slug |
| `~/.claude/sessions/<pid>.json` | live-process sidecar: `sessionId`, `cwd`, `name`, `status` | `cwd` is the **start** cwd, never updated (pid 94005 bounced through 15 directory changes; sidecar still says `~/code`). Survives a crash. |
| `~/.claude/teams/session-<8>/config.json` | `leadSessionId`, `members[].cwd` | `members[].cwd` is the cwd at join; `leadSessionId` goes stale when a team is re-keyed |

The code has **four** notions of "a session's folder" — (a) the project slug (`folderSessionIds`), (b) the sidecar cwd (`sessions.cwds`), (c) `members[].cwd`, (d) `folderPathOf` = the first `cwd` record in the first three transcripts *by readdir order*. They agree only for a session that never moved.

---

## Part 2 — Issues

Line numbers are `src/server/index.ts` unless a file is named. Severity is roughly descending.

### #1 Duplicate folder identity → duplicated rows, doubled counts

- **Symptom.** `listFolders` returns `/Users/alanoliveira/code` (name `code`) **twice**; the `*` listing returns 276 rows for 191 unique sessions — every `~/code` session appears twice (170 rows tagged `code`). Folder menu: duplicate React keys (`key={f.path}` TeamSelect.tsx:970), doubled `runningByFolder` and footer counts, "N folders" over-counts. Session list: duplicate `key={team.name}` (:444).
- **Root cause.** `folderPathOf` (:845-854 → `cwdInTranscript` :856-882) names a folder by the first `cwd` record found in the first 64 KiB of one of its first three transcripts. The worktree dir's transcript opens with 25 records saying `/Users/alanoliveira/code`, so two dirs emit one path; `listAllFolders` (:950) then scopes both by `f.path`, which `folderSessionIds` (:831) re-slugs to the **same** dir.
- **Evidence.** Real run of `listFolders` + `listAllFolders`; synthetic `-S-gamma` whose first record says `/S/alpha` → `alpha` listed twice, its 3 rows → 6.

### #2 Sessions unreachable from any folder

- **Symptom.** The worktree session `84dcffd4` is in **no** listing, `*` or scoped. A dir whose first three transcripts have no `cwd` in their first 64 KiB is dropped from `listFolders` (`if (!cwd) continue;` :906); asking `GET /api/teams?folder=<that path>` then **silently** answers with the console's own cwd (`folderScope` :957-965 falls back).
- **Root cause.** Same as #1: no folder path maps back to the dir's slug, so nothing enumerates it. `folderScope` is dead code from the client's point of view — no shipped caller sends `?folder=<path>` (TeamSelect.tsx:245 and App.tsx:222 send only `*` or nothing) — carrying a live fallback.
- **Evidence.** Real: `84dcffd4` absent from the 276 rows. Synthetic: `gamma` and `delta` sessions absent; `?folder=/S/gamma` → `folder: '/S/alpha'`.

### #3 Folder = where the session *started*, not where it *works* (the reporter's #5)

- **Symptom.** A session started in `~/code/grimoire` that `cd`'d into `arco` lists under grimoire forever. 49 `~/code` sessions worked in branded-web / healcode.com / shield and only ever list under `code`; `c9d5e954` lists under `code`, never under `healcode.com`. No nesting: `~/code` is the parent of every other folder, but matching is exact, so "cwd under that folder" is not implemented.
- **Root cause.** Scoping (:830-832, :1000-1013) and tagging (:953) key on the project slug, fixed at session start. Rows carry a basename, so the client (TeamSelect.tsx:362-363) has nothing to prefix-match.
- **Evidence.** 15-transition cwd history of `c9d5e954`; scoped listing of `~/code/healcode.com` does not contain it.

### #4 Sidecar cwd used to *locate files* → wrong dir when it differs from the slug

- **Symptom.** A row loses its subagent count, branch, workflow run, title/mode, and teammate `.meta.json` links; `lastActivityAt` falls to `now`.
- **Root cause.** Five sites rebuild `<projectsRoot>/<slug(cwd)>/<sid>` from a cwd that is **not** what named the directory — the sidecar start cwd (`sessions.cwds`) or `members[].cwd`: `subagentCountOf` :495, `workflowOf` :514, `teamsOfLiveSessions` :647, `sessionRows` :748, `walkTeams` :1144. Every miss is swallowed by a `try/catch`. The one helper that resolves by where the files actually are, `sessionProjectDir` (:685; hint slug first, then scan), is used only by `selectSession` (:1535) and `workflowScript` (:1591).
- **Evidence.** Synthetic L2: live session, files under `-S-alpha`, sidecar `cwd=/S/beta` → `subagents=None` (expected 1), `branch=None` (expected `feat/live`), `lastActivityAgo=0s`.

### #5 Stale sidecar makes a dead session "idle · active" forever

- **Symptom.** A session whose process died hours ago shows `idle`, `live: true`, counts as "active" in the folder menu, and is an auto-resume candidate.
- **Root cause.** `readSessions` (:244-251) records `cwds`/`names` for every sidecar, dead pid or not. With a stale sidecar whose cwd ≠ slug, both stats at :754-761 miss and `lastActivityAt = now` (:762) → `recent` → `idle`/`live`. The fabricated timestamp only matters because `dir` was the wrong directory (#4).
- **Evidence.** Synthetic L3: 3 h-old transcript, dead pid, sidecar `cwd=/S/beta` → `state=idle live=True lastActivityAgo=0s`.

### #6 Picker's default scope hides the session on screen (the "random sessions" half of #5)

- **Symptom.** Wall shows session X from folder B; the chip says folder A; X is not in the list; the cursor lands on row 0.
- **Root cause.** With nothing picked the panel fetches `/api/teams` scoped to the console's `--cwd` (TeamSelect.tsx:245), and `listTeamSummaries` deliberately drops the current team when its driver is in another folder (:1001-1013; pinned by index.test.ts:909). Meanwhile App's auto-resume (App.tsx:207-243) fetches `*` on every bare page load and selects the first `live`/`idle` row **machine-wide**, ignoring both the console cwd and the stored folder pick. Contradicts `bucketOf`'s own rule "the picker must not hide what the wall is showing" (TeamSelect.tsx:125-131).
- **Evidence.** Synthetic: `POST /api/select-session/b1` (beta) then `GET /api/teams` (scope alpha) → `b1` absent, `current=''`.

### #7 `current` cannot match a session reached via `/s/:id` when a team dir exists

- **Symptom.** No ✓ on any row; if the team row is idle/done it folds into the collapsed group, so the on-screen session vanishes from the main list. The header floor (`leadFacts`) goes blank for that session.
- **Root cause.** `current` is computed against the team-directory name only: `walkTeams` :1160 `current: name === current`, `sessionRows` :783 `current: false`, and callers pass `currentTeam` alone (:1573-1583, :1626), which `retargetSession` sets to `''` (:1512). After `/s/<uuid>` the frame carries `teamName: ''`, `leadSessionId: <uuid>`; App passes `current = <uuid>`; the only row for that session is the **team** row `session-<8>` (the `sessionOnly` row is suppressed by `covered`, :1029-1034); `team.name === current` never matches (TeamSelect.tsx:136, :255, :324, :434). The flag is also computed **before** `adoptByCwd` (:1196-1245) re-keys the driver, so a cwd-adopted re-keyed team is never current.
- **Evidence.** Code reading plus synthetic run: after `select-session L1`, `/api/teams` returns `current: ''` and a `session-t1` row with `current: false` whose lead is L1. This very console (`session-bd5c4f98`, a 1-member config) is in that shape.

### #8 Selection is not durable across reload

- **Symptom.** From `/s/<old>`, switching to a team row and reloading jumps back to `<old>`. From `/`, a reload goes through auto-resume (#6) and may land on a third session.
- **Root cause.** Two URL schemes carry the selection unevenly: a team-row `select()` POSTs `/api/teams/<name>/select` and leaves the URL alone (TeamSelect.tsx:341-347); `writeUrlState` keeps `window.location.pathname` (useTeamState.ts:164) and writes `?team=<name>`, which `isAnnouncedTeam` (:174-177) deliberately ignores on reload; a session row navigates to `/s/<id>` (TeamSelect.tsx:338). On reload, App.tsx:196-205 re-POSTs `/api/select-session/<pathname id>`, and `selectSession` (:1520-1544) always retargets as session-only, so `/s/<lead>` cannot stand in for the team that lead drives.
- **Evidence.** Code reading; `writeUrlState` verified to preserve the pathname.

### #9 Basename matching merges distinct folders

- **Symptom.** Two folders with the same basename show each other's sessions and pool their counts.
- **Root cause.** Rows carry `folder: folders[i].name` (:953) — a basename — so the client can only compare names: `inScope` TeamSelect.tsx:362-363 `t.folder === p || t.folder === folderBase(p)`; `runningByFolder` :414-417 keyed by name, read by `f.name` :960.
- **Evidence.** Synthetic `/S/x/proj` and `/S/y/proj` both tagged `proj`.

### #10 `sessionIdsIn` is not "newest first"

- **Symptom.** Which transcript `folderPathOf` reads is filesystem-dependent, so #1/#2 differ across machines.
- **Root cause.** The doc at :801 and :885 promises "newest first"; the body (:814-828) returns raw `readdir` order and nothing sorts. The spill-dir count in `FolderSummary.sessions` is *not* a bug — :809-812 says a session counts by either form, matching what `sessionProjectDir` :704-708 selects — but `domain.ts:457` (`<sessionId>.jsonl` files) says otherwise.
- **Evidence.** Code reading.

### #11 Scoped-out team leaves its stale lead as a bare row (low; arguably correct)

- **Symptom.** A re-keyed team's original lead transcript lists as an ended `session-…` row in the folder it started in — probably the reporter's "three ended solo sessions I can't confirm".
- **Root cause.** `covered` (:1030-1034) is built from the **post-scope** `teams`, on purpose (comment :1028-1029): a team spliced out at :1010-1013 leaves its `config.leadSessionId` uncovered, and `sessionRows` lists `<staleId>.jsonl` where it sits.
- **Evidence.** Probe against the real function: original folder → `[{ staleId, sessionOnly: true, state: 'done' }]`, live folder → `['session-rekeyed']`.

### Checked, not bugs

- The folder pick **is** persisted (`console.folder`, commit 23d83bd). The issue's "not persisting" note is outdated; the symptom comes from #6 and #8.
- `sdk-cli` (`claude -p`) sessions are filtered by design: shield 303 transcripts → 74 rows.
- The `*` listing costs 552 ms cold / 94 ms warm on 461 transcripts; `transcriptMeta`'s offset cache means later listings read only appended bytes.
- The byte-marker readers (`"type":"custom-title"`, `"gitBranch":"`) require compact JSON. Claude Code writes compact JSON (459/461 transcripts carry the unspaced `"cwd":"` marker; the two others are cwd-less).

---

## Part 3 — Product decisions

Each has a default; the plan below follows the defaults. Confirm before the task that depends on it.

| # | Decision | Default | Why | Blocks |
|---|---|---|---|---|
| D1 | A project dir where **no** transcript ever records its own cwd: drop it (today) or list it under its raw slug? | Drop | Path identity is the smaller diff; with the whole-file, all-transcripts scan of Task 1 the miss is near-theoretical (real Claude Code always writes a cwd record; the repro was synthetic). Revisit if a real machine shows one. | Task 1 |
| D2 | Picker default scope when the operator has never picked a folder | The folder of the session on screen | The only default under which the on-screen row is always listed and the chip agrees with the wall. Alternatives: the console `--cwd` (today; needs the server to inject the current row), or every folder. | Task 5a |
| D3 | `/s/<leadSessionId>` becomes the one shareable/reload URL for **both** teams and bare sessions; a reload re-selects | Yes | Drops the no-yank rule for reloads (a reload of a second tab yanks the first — `/s/` already does this today). A same-session reload is a no-op via the widened guard; `?team=` stays the launcher's announce only. | Task 5b |
| D4 | What "folder" means: where the session **last** worked (transcript's last cwd, prefix-matched so `~/code` includes `~/code/*`) vs where it **started** (today, exact) | Last cwd + prefix | The reporter asked for it and 49/93 `~/code` sessions otherwise sit under `code` forever. It is the one task that changes semantics rather than fixing a bug: the menu's per-folder `sessions` count (start dirs) will disagree with the rows shown under it. | Task 6 |
| D5 | Stale lead row of a re-keyed team (#11) | Keep it | Per-folder completeness (:801-813). If operators find the duplicate confusing, the two-token alternative is `walk.teams` at :1031-1032 and the pinning assertion flips to `[]`. | Task 4 |
| D6 | Branch/diffstat tree when the sidecar cwd ≠ the listed folder | Keep reading the sidecar cwd's tree | The process really runs there. | — |

---

## Part 4 — Implementation plan

### Global constraints

- No new dependencies; no new abstractions for one use; reuse `sessionProjectDir`, `transcriptMeta`, `lastRecordField`/`lastBranch` shapes.
- Fix the root cause where all callers route through, never one call site.
- Every non-trivial change names one existing-file Vitest test that fails before and passes after. Existing tests whose assertions encode the old behaviour are named and changed, not deleted silently.
- Match the surrounding style: comments say *why*, docblocks are rewritten when they become false.
- Commits: plain-sentence subjects like the repo's history, no AI attribution.

### Dependency graph

```
Task 1 (folder identity)  ──┐
Task 2 (file location)      ├──► Task 5a (picker scope)  ──► Task 6 (folder = last cwd)
Task 3 (current flag)     ──┤
                            └──► Task 5b (durable URL)
Task 4 (pin #11)            any time
```

Tasks 1, 2, 3, 4 are independent and can run in parallel (2 and 3 both touch the `sessionRows` signature — trivial rebase). 5a and 5b run in parallel after 1 and 3. Task 6 is gated on D4 and lands after 1 and 5a.

### File structure

| File | Change | Responsibility |
|---|---|---|
| `src/server/index.ts` | Modify | `transcriptMeta` gains `cwd`; `folderPathOf` reads through it; `cwdInTranscript`, `folderScope` deleted; `sessionProjectDir` resolves every session dir; `current` computed once after adoption; `selectSession` resolves a team by its lead |
| `src/shared/domain.ts` | Modify (docs, one helper) | `TeamSummary.folder` becomes a path; `inFolder` (Task 6) |
| `src/web/chrome/TeamSelect.tsx` | Modify | path-keyed scope, `current` from the row, always fetch `*`, default scope = on-screen folder |
| `src/web/App.tsx` | Modify | auto-resume and `elsewhere` read `t.current`; auto-resume applies the stored scope |
| `src/web/state/useTeamState.ts` | Modify | `writeUrlState` writes `/s/<lead>` |
| `src/server/index.test.ts`, `src/server/index.wiring.test.ts`, `src/web/chrome/TeamSelect.test.tsx`, `src/web/App.test.tsx`, `src/web/state/useTeamState.test.tsx` | Modify | gates named per task |

---

### Task 1: Folder identity by self-slugging path — #1, #2, #9, #10

**Effort:** M. **Depends on:** nothing. **Unblocks:** 5a, 6.

**Root cause fixed.** A folder's path is read from a record that may name another folder. Once the only cwd `folderPathOf` accepts is one whose slug **equals the dir name**, the path→slug round trip at :950 → :1000 → :831 is lossless by construction: one dir, one folder, no duplicates, and the worktree dir enumerates its own ids.

**Why not key everything on the slug instead?** It was the first draft. It fixes the same bugs at a much larger diff (new `slug` field on `FolderSummary` and rows, `shared.slug` plumbing, a `sessionRows` parameter, a localStorage migration, fixture churn in both test files) and its only extra win is D1's near-theoretical case. Path identity also keeps `TeamState.folder` (the per-folder theme key, `project.ts:655` → `useSettings.ts:177`) and `TeamSummary.folder` the same kind of value.

- [x] **Step 1.1 — `transcriptMeta` learns the transcript's own cwd.** `TranscriptFacts` (:276-282) gains `cwd?: string`. Add `lastCwdFiledUnder(buf: Buffer, slug: string): string | undefined` beside `lastBranch` (:315-323): the `lastRecordField` (:285-299) `lastIndexOf` loop over the marker `"cwd":"`, closing-quote slice like `lastBranch`, returning the **first value walking backwards whose `.replace(/[^a-zA-Z0-9]/g, '-') === slug`**. In `transcriptMeta` (:371-375) add `facts.cwd = lastCwdFiledUnder(whole, path.basename(path.dirname(file))) ?? facts.cwd;` and return `cwd: facts.cwd`. Comment the layout assumption: `file` is `<projectsRoot>/<slug>/<id>.jsonl` (true at :765, :1141-1147 and the new `folderPathOf`). The value is cached with the existing offset, so a transcript is whole-read once and then only for appended bytes.
- [x] **Step 1.2 — `folderPathOf` reads through it.** Body (:845-854) becomes `for (const id of sessionIds) { const { cwd } = await transcriptMeta(path.join(dir, `${id}.jsonl`)); if (cwd) return cwd; }` — drop `.slice(0, 3)`: the loop returns on the first hit, so a normal dir still costs one read, and a dir of empty transcripts costs a stat per id (the `*` listing whole-reads every transcript anyway, same cache). Rewrite the docblock (:834-844): the slug cannot be reversed, so the transcript is asked for a cwd that slugs back to this dir, found anywhere in the file (the real worktree transcript's first such record is at byte 1.5 MB). Delete `cwdInTranscript` (:856-882).
- [x] **Step 1.3 — rows carry the folder's path.** :953 `folder: folders[i].path`. `domain.ts:395` doc: `folder` is the folder's absolute **path**, only on a listing across every folder; add one line noting `TeamState.folder` (`project.ts:655`) is also a path.
- [x] **Step 1.4 — client keys on the path.** `TeamSelect.tsx:362-363` `inScope` → `!picked?.length || (!!t.folder && picked.includes(t.folder))`; :960 `runningByFolder.get(f.path)`; :640 pill → `folders.find((f) => f.path === team.folder)?.name ?? folderBase(team.folder)`. `folderBase` stays for the pill fallback. `picked` already holds paths (:34-52, :978-984), so no localStorage migration; test :1207 ('reads a folder path stored before the key held JSON') passes unchanged.
- [x] **Step 1.5 — delete `folderScope`.** Remove :957-965 and its export; `listTeams` (:1573-1582) becomes `folder === ALL_FOLDERS ? listAllFolders(...) : listTeamSummaries(teamsRoot, sessionsRoot, currentTeam, projectsRoot, cli.cwd)`. `http.ts:289` unchanged: an unknown `?folder=` lands on the console's own scope exactly as the fallback did, so no shipped behaviour changes.
- [x] **Step 1.6 — docs.** :800-802 drop "newest first" from `sessionIdsIn`; `domain.ts:457` `sessions` → "sessions under its project dir, by either form (`<id>.jsonl` or `<id>/`) — the same rule `sessionProjectDir` selects by". Rewrite the `listFolders` docblock (:884-892) and the `folderPathOf` comment to say identity no longer depends on record order or readdir order.
- [x] **Step 1.7 — tests.**
  - NEW `index.test.ts` › 'the folder menu on a listing' (:1146) › **'lists a moved session under its own project dir, once, not under the folder its first records name'** — dir A = slug(`/Users/dev/code/octo`) with ID(1) recording cwd octo; dir W = slug(`/Users/dev/code/octo/.claude/worktrees/w`) with ID(2) whose first record says `/Users/dev/code/octo` and a later record says the worktree path. Assert `listFolders` → two folders with distinct paths, W's path = the worktree path, `sessions: 1` each; `listAllFolders().teams.map((t) => [t.name, t.folder]).sort()` → `[[ID(1), octo], [ID(2), worktree]]`, each once. **Fails today** (both report octo; ID(1) twice, ID(2) never). This is the gate.
  - NEW `TeamSelect.test.tsx` (multi-select block after :1149) › **'keeps two folders with the same basename apart'** — folders `/Users/dev/code/octo` and `/Users/dev/work/octo`, one live row in each (`folder` = that path); open the menu: both `octo` rows read `1 active` (today `2 active`, pooled); click the first: `titles()` is that row only.
  - NEW `index.wiring.test.ts` (beside 'lists every team in this folder' :507) — `GET /api/teams?folder=/etc` (and `../../etc`) returns the same `folder` and rows as bare `/api/teams`. Keeps the property the deleted `folderScope` tests asserted: a browser-named path never reaches `<cwd>/.git/HEAD` or `git diff`.
  - CHANGED `index.test.ts:1180` — rows' `folder` are paths, not names. :1215 and :1224 unchanged (behaviour unchanged).
  - CHANGED `TeamSelect.test.tsx` fixtures only — `folder` values at :27, :1023, :1053, :1090, :1135-1143 become the matching paths; text assertions ('octo'/'hatch' pills, menu strings at :1012-1014, :1101-1102) pass via the name lookup.
  - DELETED `index.test.ts:1254-1287` describe `folderScope` and its import at :12.

**Risks.** `listFolders` whole-reads one transcript per dir on the first bare `/api/teams` instead of a 64 KiB head — the `*` listing already pays this via `sessionRows` → `transcriptMeta`, same cache. Slug collision (`/a/b-c` vs `/a/b/c` share a dir): whichever matching cwd is found last is displayed; identity is the dir so nothing is lost or duplicated. D1's case stays dropped.

---

### Task 2: Session files resolved from where the transcript is — #4, #5

**Effort:** M. **Depends on:** nothing. Parallel with Task 1 (disjoint functions; Task 1's slug check needs `<root>/<slug>/<id>.jsonl`, which `${dir}.jsonl` preserves).

**Root cause fixed.** Five sites rebuild a session's directory from a cwd that did not name it. `sessionProjectDir` already resolves by id (hint slug first, then a scan) and is used by `selectSession`. Resolve once per row, hand the **directory** to the helpers, delete the five slug expressions.

- [x] **Step 2.1 — helpers take the resolved dir.** `subagentCountOf` (:487-505) → `(sessionDir: string | null): Promise<number>`; `if (!sessionDir) return 0; readdir(path.join(sessionDir, 'subagents'))`. `workflowOf` (:507-550) → `(sessionDir: string | null, now: number)`; `if (!sessionDir) return undefined`; `runsDir`/`snapshot` built from `sessionDir`. Same null-guard shape they have today, minus the slug join.
- [x] **Step 2.2 — `sessionRows`.** Replace :747-748 with `const cwd = sessions.cwds.get(sessionId) ?? folderCwd;` (kept **only** for `diffstatOf`/`branchOf`/`diffstats` keying at :775, :788, :794 — D6) and `const dir = await sessionProjectDir(projectsRoot, sessionId, folderCwd || sessions.cwds.get(sessionId)); if (!dir) continue;`. A scoped listing passes the folder whose slug the id came from, so the hint hits in two stats and never scans; a null means nothing on disk, which `selectSession` already rejects as `missing`. Call `subagentCountOf(dir)`, `workflowOf(dir, now)`; :765 `transcriptMeta(`${dir}.jsonl`)` unchanged.
- [x] **Step 2.3 — `walkTeams`.** Resolve once — `const leadDir = projectsRoot && leadSession ? await sessionProjectDir(projectsRoot, leadSession, sessions.cwds.get(leadSession) ?? lead?.cwd) : null;` — keep the `leadSession` truthiness guard (`sessionProjectDir` with `''` returns the slug dir itself). Replace :1125-1130 with `workflowOf(leadDir, now)` / `subagentCountOf(leadDir)` and :1139-1148 with `leadDir ? await transcriptMeta(`${leadDir}.jsonl`) : {}`.
- [x] **Step 2.4 — `teamsOfLiveSessions`.** Replace :645-647 with `const dir = await sessionProjectDir(projectsRoot, sessionId, sessions.cwds.get(sessionId)); if (!dir) continue;` and read `path.join(dir, 'subagents')`.
- [x] **Step 2.5 — docs.** `SessionFacts.cwds` (:211): a resolution hint for `sessionProjectDir` and the tree to diffstat, not where the files are. `walkTeams` comment (:1122-1124) likewise. `readSessions` (:244-251) is **unchanged**, deliberately: after this a dead sidecar's cwd is only a stat-validated hint and its `name` is the crashed session's real name, which the transcript does not always carry.
- [x] **Step 2.6 — #5 is zero code.** After 2.2, `dir` is either the directory the id was enumerated from or one `sessionProjectDir` verified, so the `.jsonl` stat at :756 hits for every session that has a transcript and the `now` fallback at :762 is reachable only for a `<sid>/` with neither transcript nor `subagents/` — no fact or fixture describes that shape. The :760-761 comment ("enumerated from this directory a moment ago") becomes true rather than stale. Note for later readers: `sessionProjectDir` returns `dir` when `dir` is a directory **or** `${dir}.jsonl` is a file (:704-708) — never "simplify" :754-764 to a single `stat(dir)`.
- [x] **Step 2.7 — tests** (`index.test.ts`).
  - NEW › 'sessions with no team of their own' › **'reads a session's files from where its transcript is, not from the sidecar cwd'** — sidecar `{ pid: process.pid, sessionId: SOLO, cwd: '/Users/someone/code/elsewhere', name: 'moved' }` written as :384-387 does; `<slug(CWD)>/SOLO.jsonl` = `{type:'user', cwd: CWD, gitBranch:'hand-voices'}` and two `agent-*.jsonl` under `<slug(CWD)>/SOLO/subagents`; `listTeamSummaries(teams(), sessions(), '', projects, CWD)` → `row.subagents === 2`, `row.branch === 'hand-voices'`. **Fails today** (both undefined). This is the gate.
  - NEW › listTeamSummaries › **'finds a re-keyed team's lead, and counts its subagents, from where its transcript is when the sidecar names another folder'** — the :375 fixture with the sidecar cwd changed to `/Users/someone/code/elsewhere`, while the teammate `.meta.json`, one `agent-*.jsonl` and `<sid>.jsonl` sit under `slug('/Users/someone/code/proj')/<sid>`; unscoped call → `leadAlive === true`, `state === 'live'`, `subagents === 1`. Covers `teamsOfLiveSessions` (scan fallback) and `walkTeams`.
  - NEW › 'sessions with no team of their own' › **'calls a session done when its transcript is old, though a stale sidecar names another folder'** — transcript `utimes`'d to `IDLE_GRACE_MS * 3` ago; sidecar `{ pid: 2 ** 22 - 1, sessionId: SOLO, cwd: '/Users/someone/code/elsewhere', status: 'idle' }` (the dead pid :638 already uses) → `state === 'done'`, `live === false`, `lastActivityAt < Date.now() - IDLE_GRACE_MS`. **Fails today** (idle / live / ≈ now); green after 2.2 — #5's regression test.
  - EXISTING, unchanged, must keep passing (hint-hit path): :316, :375, :540, :562, :745, :1016.

**Risks.** Every ended re-keyed team whose lead id has no files pays `readdir(projects)` + 2 stats per slug on every 3 s `followRealTeam` tick (:40, :1631) — today one silent failed readdir. Bounded (12 slugs here); the named upgrade path is a `Map<sessionId, string|null>` memo on `TeamWalk`, in `walkTeams` only. An unscoped listing (tests only) no longer lists a live session with zero files on disk.

---

### Task 3: The `current` flag is the on-screen identity — #7

**Effort:** M. **Depends on:** nothing. Parallel with 1 and 2. **Unblocks:** 5a, 5b.

**Root cause fixed.** `current` is computed once, on the server, **after adoption**, against every identity a session can carry — directory name, config's (possibly stale) lead id, the live driver — and every consumer reads the flag instead of comparing names.

- [x] **Step 3.1 — server.** Delete `current: name === current` (:1160). After `const adopted = adoptByCwd(...)` (:1177) add `for (const t of teams) t.current = current !== '' && (t.name === current || t.leadSessionId === current || leadSessions.get(t.name) === current);` — the `current !== ''` guard matters: at boot with neither `--team` nor `--session`, `''` would otherwise match every lead-less team (:1109 coerces a missing `leadSessionId` to `''`). `sessionRows` gains `current: string`, row `current: sessionId === current`. Callers :1575, :1579, :1634 pass `currentTeam || currentSession`; `followRealTeam` :1646 `const mine = teams.find((t) => t.current)`.
- [x] **Step 3.2 — docs.** `domain.ts:390` `current`: the row for the session on screen — matched by team directory, config lead id, or live driver. `domain.ts:467` `TeamsResponse.current`: `''` until resolved; a team name in team mode, the session id in session mode.
- [x] **Step 3.3 — client.** `TeamSelect.tsx` `bucketOf` (:134-139): drop the `current` param, `if (team.current) return 'shown'`; callers :253, :365. :255 cursor `findIndex((t) => t.current)`. `select` (:322-348) takes the row: `select(team: TeamSummary)`, no-op branch on `team.current`; callers :448, :728. `renderRow` :434 `const isCurrent = team.current`. The `current` **prop** stays only for `triggerName` (:811) and the mark-close effect (:285). `App.tsx:157` `filter((t) => !t.current)`; :228 `if (!target || target.current) return;`.
- [x] **Step 3.4 — tests.**
  - NEW `index.test.ts` (after 'counts members and marks the current team' :497) › **'marks a team row current when the session on screen is its lead, not its directory'** — `writeConfig('session-aaaa1111', { leadSessionId: 'aaaa1111-x' })`; `listTeamSummaries(teams(), sessions(), 'aaaa1111-x')` → `teams[0].current === true`. **Fails today.** This is the gate.
  - NEW `index.test.ts` › 'sessions with no team of their own' › **'marks a bare session row current when it is the one on screen'** — `liveSessionWithSubagents(SOLO, 1)`; call with `SOLO` as current → the row has `current: true`.
  - NEW `TeamSelect.test.tsx` › **'marks, and keeps in the main list, the row the server says is on screen even when its name is not the id on the frame'** — rows: [0] `current: false`, [1] `{ ...sampleTeams()[1], current: true, state: 'done' }`; `renderSelect({ current: '<uuid>' })` → `team-option-session-b5129c7b` is in the main list with `aria-selected="true"` and a ✓ mark. **Fails today** (no ✓; the done row folds).
  - CHANGED `index.test.ts:733` 'lists a team whose lead session id is empty' — add `expect(only.current).toBe(false)` (guards the `''` case).
  - CHANGED `index.test.ts:865` 'scopes a re-keyed team…' — add an assertion that `current = staleSessionId` marks `session-rekeyed` current (the id a `/s/<frame lead>` URL carries for a re-keyed team).
  - CHANGED `index.test.ts:410` 'finds the lead through the directory they share' — call with the live session id as `current`; assert the adopted row is current.
  - EXISTING unchanged: `TeamSelect.test.tsx` :221, :315, :569, :774 (fixtures already set `current: true` on the on-screen row).

**Risks.** `TeamsResponse.current` now carries a uuid in session mode; the client never reads it. `followRealTeam` stays scoped to `cli.cwd`, so the header floor (`leadFacts`) stays blank for a cross-folder current when the statusline hook is not installed — deferred (Part 5).

---

### Task 4: Pin the stale-lead row — #11

**Effort:** S. **Depends on:** D5 (default: keep). Any time.

**Decision.** Keep the behaviour. The rationale is the scoped listing's completeness contract (:801-813): every transcript a folder holds lists there, and once `teams/<name>/` is reaped the stale row is the **only** trace in the original folder. (The team row in the other folder ingests the same stale transcript — `retarget(team, config.leadSessionId)` at :1486 and :1658 — so the row is redundant while the team dir exists, not a unique route. Widening `covered` to `walk.teams` would hide the row only while `config.json` exists and bring it back after reaping — a row that appears and disappears with reaping is harder to reason about than a stable one.)

- [x] **Step 4.1 — extend the existing test, don't add one.** `index.test.ts:865-907`: after the `writeFile` of `${staleSessionId}.jsonl` at :880 add `const old = (Date.now() - IDLE_GRACE_MS * 2) / 1000; await fs.utimes(path.join(staleSlug, `${staleSessionId}.jsonl`), old, old);` (pattern :675-676; `IDLE_GRACE_MS` already imported at :18). Replace :902-906 with `expect(scopedToOriginal.teams).toEqual([expect.objectContaining({ name: staleSessionId, sessionOnly: true, live: false, state: 'done' })]);` and `expect(scopedToLive.teams.map((t) => t.name)).toEqual(['session-rekeyed']);`. Rename the `it` to end '…and lists the stale lead as its own ended row where it ran'. ~8 lines. Passes today; **fails** if `covered` is ever built from `walk.teams` or `sessionRows` starts skipping ended sessions.

**If D5 flips to "hide the duplicate":** the code fix is `walk.teams.map(...)` / `walk.teams.flatMap(...)` at :1031-1032 (two tokens) and the assertion above becomes `toEqual([])`. No existing test breaks (checked :587, :865).

**Note.** Within `IDLE_GRACE_MS` of the re-key the stale row is `live: true, state: 'idle'` in the `*` view (fresh mtime), so for ten minutes it counts as running for its folder and is an auto-resume candidate. Cosmetic and time-boxed.

---

### Task 5a: Picker fetches `*` and scopes to the on-screen folder — #6

**Effort:** M. **Depends on:** Task 1 (path-valued `folder`), Task 3 (reliable `t.current`), D2. Parallel with 5b.

**Root cause fixed.** The server no longer decides the picker's row set. The picker always fetches `*` (~94 ms warm; already what any pick and App's auto-resume use) and narrows client-side; with nothing picked the scope is **the folder of the current row**, so the on-screen row is in scope by construction and the chip names its folder. Deletes the `scope`/`neededAll` state and the dual-URL branch. App's auto-resume applies the same scope, so a bare load stays inside the operator's folder.

- [x] **Step 5a.1 — one predicate.** Export `scopedRows(teams: TeamSummary[], picked: string[] | null)` from `TeamSelect.tsx`: `picked` non-empty → `picked.includes(t.folder)` (Task 1's `inScope` body); `picked === []` → all; `picked === null` → rows whose `folder` equals `teams.find((t) => t.current)?.folder`, or all when no current row is listed. Export `readStoredFolders`.
- [x] **Step 5a.2 — picker.** :245 fetch always `/api/teams?folder=${ALL_FOLDERS}`; effect deps :269 → `[open]`. Delete `neededAll` (:227, :277, :866) and `scope` (:221, :250, :390, :966). `listed = scopedRows(teams ?? [], picked)` (:364). Chip (:389-408): `here = teams.find((t) => t.current)?.folder`; `everyFolder = picked ? picked.length === 0 : !here`; `one = picked ? (…) : here ?? ''`; name/sub via `folders.find((f) => f.path === one)`. Menu :966 `isHere` compares `f.path === one` when nothing is picked.
- [x] **Step 5a.3 — App auto-resume.** :226 `const rows = scopedRows(payload.teams, readStoredFolders()); const target = rows.find(live) ?? rows.find(idle);`. The `elsewhere` fetch (:150) stays on bare `/api/teams`.
- [x] **Step 5a.4 — tests.**
  - NEW `TeamSelect.test.tsx` › **'defaults the scope to the folder of the session on screen, so the wall and the chip agree'** — `servePayload({ ...FOLDERED, teams: [octo row current:false, hatch row live current:true, zulu row] })`; `renderSelect()` → fetch called with `/api/teams?folder=*`, `titles()` equals `['session-b5129c7b']`, chip contains `hatch`. **Fails today** (fetches `/api/teams`, three titles, chip `all`). This is the gate.
  - NEW `App.test.tsx` (after 'falls back to the most recently idle session' :347) › **'lands a bare open inside the folder of the session on screen, not on a livelier session elsewhere'** — `*` payload: octo `done current:true`, hatch `live current:false` (`session-c1a2b3c4`), octo `idle` (`session-d4e5f6a7`) → POST `/api/teams/session-d4e5f6a7/select`, no POST for c1a2b3c4.
  - CHANGED `TeamSelect.test.tsx:1074` → 'names the folder of the session on screen while nothing is picked': fetch `?folder=*`, chip contains `octo`.
  - CHANGED `TeamSelect.test.tsx:1089` 'names the all scope…' — seed `localStorage['console.folder'] = '[]'` so it keeps asserting the all-scope rendering (under the new default only the current row's folder would list).
  - CHANGED `TeamSelect.test.tsx` `toHaveBeenCalledWith('/api/teams')` at :100, :320, :1221 → `'/api/teams?folder=*'`; exact `path === '/api/teams'` mocks at :164, :193, :248, :283, :676, :722 → `path.startsWith('/api/teams') && !path.includes('/select')` (the `servePayload` pattern at :1117).
  - UNCHANGED: `TeamSelect.test.tsx:1276` (passes as is — rows carry a folder, so the chip stays `▾`); `App.test.tsx` :309-470 (rows carry no `folder` → every folder); :957.

**Risks.** If the on-screen session appears in no listing the default degrades to every folder rather than hiding anything. Server-side scoped `/api/teams` stays for App's `elsewhere` and `followRealTeam`.

---

### Task 5b: `/s/<lead>` is the one durable URL — #8

**Effort:** M. **Depends on:** Task 3, D3. Parallel with 5a.

**Root cause fixed.** One URL scheme. After any select lands — team row via POST, session row via navigation — the frame rewrites the URL to `/s/<leadSessionId>?view=…`, and a reload POSTs `/api/select-session/<lead>`, which now resolves to the **team** that lead drives when there is one. A same-session reload is a no-op.

- [x] **Step 5b.1 — client.** `useTeamState.ts` `writeUrlState` (:153-165) gains `lead: string | null`; `const pathname = lead ? `/s/${lead}` : window.location.pathname;` with the query untouched (so `?team=` bookkeeping and the announce test hold). Effect :337-339 passes `state?.leadSessionId ?? null`, added to deps. `store.sessionRoute` is read once at mount, so the `replaceState` never re-fires the mount POST.
- [x] **Step 5b.2 — server.** `selectSession` (:1520-1544): no-op guard `sessionId === currentSession || (currentTeam !== '' && sessionId === publish().leadSessionId)` — compare against the frame's id (the one the URL actually carries: `project.ts:653` → :1344), not the server's `leadSessionId` variable, which `onLeadSession` (:1399-1401) re-points to the adopted driver. After the `dir` check: `const team = (await walkTeams(teamsRoot, sessionsRoot, sessionId, projectsRoot)).teams.find((t) => t.current); team ? await retarget(team.name, team.leadSessionId || sessionId) : await retargetSession(sessionId);` — `walkTeams`, not `listTeamSummaries`: no diffstat spawns, no `sessionRows` pass. Task 3's post-adoption flag makes this correct for the stale config id and for cwd-adopted teams. Update `retargetSession`'s docblock (:1497-1505): a session that drives a team dir is opened **as** that team.
- [x] **Step 5b.3 — tests.**
  - NEW `useTeamState.test.tsx` (beside 'writes the team the server says is on screen' :228) › **'writes the session on screen into the path, so a reload re-selects it'** — `replaceState('/')`, emit `sampleTeamState()` → `pathname === `/s/${leadSessionId}``, `search === '?view=wall&team=session-98b0b4a7'`. **Fails today.**
  - NEW `index.wiring.test.ts` (after 'retargets at a session that never formed a team' :300) › **'resolves select-session on a team's lead to that team, so a reload of /s/<lead> lands on the roster'** — boot, `selectTeam(TEAM_B)`, then `selectSession(LEAD_SESSION)` → 200 `{ ok, changed: true }`, `snapshot.teamName === TEAM`, roster contains AGENT; a second `selectSession(LEAD_SESSION)` → `changed: false`. **Fails today** (teamName `''`). This is the gate.
  - UNCHANGED: `index.wiring.test.ts:300` (SOLO_SESSION drives no team dir → teamName `''`); `useTeamState.test.tsx:219`; `App.test.tsx:1151`, :420.

**Risks.** Every reload POSTs select-session, which is server-global: reloading a second tab yanks the first (D3). A team whose `config.leadSessionId` is `''` keeps the old pathname and still falls through to auto-resume. Opening `/s/<id>` for a session that drives a **done** team dir now shows the roster (and the idle reaper watches that dir, `lifecycle.ts:161-166`) rather than the bare stream — the same as clicking that team row today. The pre-snapshot solo-shell flash (`App.tsx:76`) sits under the splash; a hand-trimmed `/s/<id>` with no query falls back to wall at `App.tsx:88` — deferred.

---

### Task 6: Folder = where the session last worked, prefix-matched — #3

**Effort:** M. **Depends on:** D4 (confirm first — this changes semantics), Task 1, Task 5a.

**What changes.** Every row's `folder` becomes the transcript's **last** `cwd` record (fallback: the folder it was enumerated from), and folders match by path prefix, so picking `~/code` shows everything working under `~/code/*` and picking `arco` shows sessions working in arco whichever folder they started in. A session that never moved lists exactly where it does today. Marginal cost is one backward marker walk over a buffer `transcriptMeta` already holds — no new I/O.

- [x] **Step 6.1 — `lastCwd`.** Extend Task 1's backward walk in `transcriptMeta` to also record the **first marker seen** (= the last cwd written) before continuing to the one that slugs to the dir; return both (`cwd` for identity, `lastCwd` for tagging).
- [x] **Step 6.2 — tag sites, no fallback.** `sessionRows` push (~:788): `...(transcript.lastCwd ? { folder: transcript.lastCwd } : {})`. `walkTeams` push (~:1161): `...(leadTranscript.lastCwd ? { folder: leadTranscript.lastCwd } : {})`. **No `?? cwd` / `?? leadCwd` fallback**: the sidecar cwd and `members[].cwd` are exactly the started-in / stale-lead values this task exists to stop trusting (a fallback re-introduces the misattribution `index.test.ts:865` pins, and under a stale sidecar would file a row under a folder that never enumerates it). `listAllFolders` :953 spreads the enumeration folder as the **default**: `one.teams.map((t) => ({ folder: folders[i].path, ...t }))`.
- [x] **Step 6.3 — `inFolder`.** `domain.ts` beside `ALL_FOLDERS`: `export const inFolder = (dir: string | undefined, folder: string): boolean => dir === folder || dir?.startsWith(`${folder}/`) === true;`. `TeamSummary.folder` doc: absolute path of the directory the session last wrote from, else the one it was listed under.
- [x] **Step 6.4 — client.** `scopedRows`: picked non-empty → `picked.some((p) => inFolder(t.folder, p))`; the nothing-picked default becomes the nearest menu folder that is an ancestor of the current row's folder: `folders.filter((f) => inFolder(here, f.path)).sort((a, b) => b.path.length - a.path.length)[0]?.path`. Delete the `runningByFolder` Map (:414-418); menu row count → `(teams ?? []).filter((t) => t.live && inFolder(t.folder, f.path)).length` (so `code` counts arco's live sessions too, matching what picking it shows); `totalRunning = (teams ?? []).filter((t) => t.live && t.folder).length`. Row pill (:635-640): show `folderBase(team.folder)` only when `team.folder !== <the scope>` — a row that moved says where. Add on `listAllFolders`: `// ponytail: the menu (listFolders) is still keyed on start dirs, so a folder that is only ever a cd target has no row of its own — its sessions list under the nearest ancestor; build the menu from row folders if that bites`.
- [x] **Step 6.5 — tests.**
  - NEW `index.test.ts` › 'the folder menu on a listing' › **'lists a session under the folder it last worked in, not the one it started in'** — transcript under slug(`/Users/dev/code`) with records `cwd: /Users/dev/code` then `cwd: /Users/dev/code/arco`; `listAllFolders(...)` → the row's `folder` is `/Users/dev/code/arco`. **Fails before.** This is the gate.
  - NEW `index.test.ts` › **'keeps a session whose sidecar names another folder under the folder that holds its transcript'** — transcript `{type:'user', cwd:'/S/alpha'}` under slug(`/S/alpha`), sidecar `{ pid: process.pid, sessionId: ID, cwd: '/S/beta' }` → `listAllFolders().teams` has the row with `folder === '/S/alpha'`. Fails with any `?? cwd` fallback; the guard for Step 6.2.
  - CHANGED `index.test.ts:865` — give `members[].cwd = original`; assert `listAllFolders(...).teams` contains `session-rekeyed` with `folder === liveCwd`. Fails with a `?? leadCwd` fallback.
  - NEW `TeamSelect.test.tsx` › **'picking a parent folder lists the sessions working anywhere under it'** — folders `/Users/dev/code` and `/Users/dev/code/arco`, one live row `folder: '/Users/dev/code/arco'`; click `code` → the session is in `titles()`, its pill reads `arco`, the `code` menu row reads `1 active`.
  - EXISTING fixtures already carry paths after Task 1; counts and pill texts keep their expected strings.

**Risks.** A row moves between folders when its session `cd`s, so the menu's per-folder `sessions` count (start dirs) can disagree with the rows shown under it — accepted, documented. A folder that is only ever a cd target has no menu row (ponytail note above). `lastCwd` shares `lastBranch`'s ceiling: a path containing `"` or `\` comes back JSON-escaped, and a nested `"cwd":"` key after the top-level one would win — 0 of 461 transcripts on this machine have either. The footer's "across N folders" counts distinct working directories, so it can read 3 where the menu has 2 — cosmetic.

**Not done here (dissolved by 5a).** The first draft rewired the bare `/api/teams` through `listAllFolders` with a prefix `scope`. With 5a the picker never sends a bare `/api/teams`, so the bare listing stays `listTeamSummaries(cli.cwd)` for App's `elsewhere` overlay on started-in semantics, and no browser-named path reaches the server.

---

## Part 5 — Out of scope / deferred

- `TeamWalk` memo `Map<sessionId, string|null>` for the 3 s follower scan on ended re-keyed teams — add when a listing profile shows it, in `walkTeams` only.
- `followRealTeam`'s `mine` for a cross-folder current: the header floor stays blank when the statusline hook is not installed (:1626-1646). Fix is to resolve `mine` off an unscoped walk; not needed while the hook is installed.
- `toDiscovered.projectSlug` (:125) — a dead slug-from-config derivation with no production reader; left.
- `workflowScript` passing `leadSessionId ?? ''` to `sessionProjectDir` (:1591-1594) — `''` resolves to the slug dir itself; pre-existing, untouched.
- `hidden.has(state.teamName)` (`App.tsx:131`) and `LeftSession.tsx` :41, :93 — still name-keyed and blank for `/s/` sessions; same identity split as #7, separate change.
- Pre-snapshot solo-shell flash and `trace` default on a hand-trimmed `/s/<id>` (`App.tsx:76`, `useTeamState.ts:241`).
- Unifying session-only rows onto POST `/api/select-session` (delete the `window.location.assign` branch, `TeamSelect.tsx:331-340`) — changes routing tests :242/:271 for no durability gain once 5b lands.
- `...adopted` in `covered` (:1033) — provably redundant (`adoptByCwd` also sets `leadSessions` for the same team); tidy-up needing its own test.
- Two ✓ rows in the `*` listing when a re-keyed team is viewed by its stale config id (its team row and #11's stale-lead row are both current) — cosmetic.
- Server-side single-folder `?folder=<path>` fetch — deleted with `folderScope`; re-add as `known.find((f) => f.path === folder)` in `listTeams` only if a caller appears.
- Menu rows for folders that are only ever cd targets, and a per-folder listing cache for App's `elsewhere` fetch (ponytail note at :935) — after Task 6, if it bites.
