# team8 speed — design

Six PRs from the 2026-09-29 implementation delay log (meetnotes session d4dc7fd4, 851 track-minutes over 10 tracks).
PR 0 is the ruler; PRs 1–5 each fix one cause of slow batches and prove it with a targeted test run before and after.

## Baseline (from the delay log)

| Cause | Today |
|---|---|
| Model time, with every agent at the session's `/effort max` | 27% of track time; Opus 13.8 s a call at max against 7.1 s at medium |
| Lead messages reaching a busy teammate | 24 of 44 over 5 min late; median 23 min, max 75 |
| Re-reviews | 9–12 min each at max; review tail 29 of 128 min in the speakers batch; 64 track-min idle waiting on reviews |
| Expensive checks | 19 package runs at 3.5–4 min, 120 track-min, 24% of executor active time (43% of player's) |
| Idle with work left | 102 min in one case: a teammate waited for "continue" after its first task |

## Measurement protocol

- **Ruler.** `team8 measure` (PR 0) reads a session's transcripts and prints every number in the table above. The next real batch after each merge is measured with it and compared with the baseline.
- **Targeted test per PR.** Each PR adds a scenario to `.claude/commands/bench.md` in this repo, a dev-only command that is not shipped in the plugin. A scenario isolates one mechanism with a fixed prompt and prints one number.
- **Before and after.** "Before" runs in a session on the released plugin. "After" runs in a session started with `claude --plugin-dir <worktree>/plugin` on the PR branch.
- **Where results go.** Both numbers go in the PR description and the batch's run log.
- **Where each scenario runs.**
  - Scenarios that need subagents only (PRs 1, 3 and 4) run headless with `claude -p`.
  - Scenarios that need teammates (PRs 2 and 5) need an interactive session, because `claude -p` never forms a team.

## Order and branches

0 → 1 → 2 → 5 → 4 → 3, one PR at a time. PR 3 uses PR 1's reviewer variant.
Each branch is cut from `origin/main` once the previous PR merges, or stacked on the previous branch while its merge is pending.
Work happens in the worktree `~/code/team8-speed`; the main checkout `~/code/team8` is left alone.
`plugin/dist` is never committed by a PR: the bump workflow builds it.

## 0. `team8 measure`

### Problem
The delay log came from one-off Python scripts (566 lines, kept at `~/code/meetnotes-scratch/lead/delay-scripts/`). Nothing in team8 can say how long a batch took or where the time went, so no fix can be measured.

### Behaviour
- **Invocation.** `/team8:measure [session-id]` (default: this session) runs `node "${CLAUDE_PLUGIN_ROOT}/dist/server/index.js" measure <session-id>` and prints a markdown report. `--json` prints the same numbers for scenarios. `--since <iso>` limits it to a batch.
- **Per agent** (lead, executors, reviewers):
  - wall time: first line to last line, or to its "track clear";
  - active time, model time and tool time by category;
  - idle time, split into waiting on a review, on the lead, or on nothing;
  - cost.
- **Model seconds per call,** by model × effort: median, p90, mean and mean output tokens. The effort is read from each assistant line's recorded `effort`.
- **Message lag.** For each lead → teammate message: sent (the lead's `SendMessage` result) → seen (its first appearance in the teammate's transcript).
- **Review tail** per track: the executor's last report → the lead's "track is clear".
- **Idle with work left.** Minutes a teammate was idle while a task it owns, or the next task in its track, was not completed.
- **Tool categories.** They come from the Bash text:
  - tests, typecheck, build;
  - expensive check: packaging, installers, codesign, `docker build`, xcodebuild archive;
  - app launch, git/gh, and sleep or poll.
  - A poll loop counts as what it waits on. Anything else is "other".
- **Sleep.** Gaps where the Mac slept, from `pmset -g log`, are excluded from model and tool time and reported on their own line.
- **Run log.** `team8:run`'s close step uses `measure` for the Run section's actual numbers instead of the console snapshot alone.

### Structure
- `src/server/measure/` holds pure functions over parsed transcript rows: segments, calls, lag, tails, categories. Vitest tests run on trimmed fixture transcripts.
- A `measure` subcommand in `src/server/index.ts`, next to `setup` and `uninstall`. It is bundled into the existing `plugin/dist/server/index.js`, with no new build entry.
- `plugin/commands/measure.md`.
- The dev-only `.claude/commands/bench.md` scaffold. It lists scenarios, and each PR adds one.

### Acceptance
This is checked by hand on the author's machine, because that session's transcripts hold private work and can't be committed as a fixture. Run on session d4dc7fd4, it reproduces the delay log's headline numbers within 5%:
- 851 track-minutes and 228 model-minutes;
- the per-call medians;
- message lag median 23 min;
- 102 idle-with-work minutes;
- 120 expensive-check minutes.

## 1. Effort per role

### Problem
Teammates and reviewers inherit the lead session's effort. The Agent tool has no effort parameter, and the agent definitions set none. A task's `effort` metadata therefore never reaches its executor, and a lead at `/effort max` runs every agent at max.

### Decision
Agent definitions carry `effort:`. Per the Claude Code docs, a definition's effort overrides the session's.
- **Executors:** `team8:executor-low`, `team8:executor` (medium, the existing name), `team8:executor-high` and `team8:executor-xhigh`. The body is identical in all four and only the frontmatter differs.
- **Guarding the copies:** a vitest test fails if any variant's body drifts from `executor.md`, and a small script regenerates the variants.
- **Reviewers:** `team8:reviewer` at `effort: high`, for first rounds, and `team8:reviewer-light` at `effort: medium`, for re-reviews in PR 3.
- **Dispatch:** `team8:run` picks `subagent_type` from the task's effort metadata:
  - `low` → `team8:executor-low`;
  - `medium` → `team8:executor`;
  - `high` → `team8:executor-high`;
  - `xhigh` and `max` → `team8:executor-xhigh`.
- **Estimates:** `team8:tasks` says a task's effort is now what its executor runs at, so the estimate table holds.

### Targeted test: `bench effort`
- **Setup:** headless, with the session's effort set to max, spawn one subagent of each executor and reviewer variant with the prompt "run `true` and reply ok". The task's first step confirms how a `claude -p` session's effort is set, and that its transcript records it as `max`.
- **Measure:** read each transcript's recorded `effort`.
- **Result:** before, every one reads max; after, each reads its variant's level.
- **Next batch:** Opus seconds per call against 13.8 s.

## 2. Messages reach busy teammates

### Problem
- **Messages wait for the turn to end.** A message to an in-process teammate waits in `~/.claude/teams/<team>/inboxes/<name>.json` as an entry with `read: false` until the teammate's turn ends. The docs say messages arrive "between tool calls". The spike on 2026-09-30 showed otherwise:
  - a probe was sent 5 s into a teammate's turn;
  - it was still unread after 8 tool calls and over 3 min of the teammate working;
  - it arrived only at the end of the turn.
- **Turns are long.** Player's first turn ran 74 min and voices' 66. Lead messages arrived a median 23 min late, up to 75. That caused crossed messages and rework:
  - a border was built after the "tint instead" change had been sent;
  - two package runs went into dist/ with the warning unread.

### Decision
- **Deliver on the next tool call.** When a teammate finishes a tool call, a PostToolUse hook reads that teammate's inbox. It returns the unread entries as `hookSpecificOutput.additionalContext`, e.g. "Message from team-lead, sent 05:08:14: …". The teammate sees them on its next step, not at the end of its turn.
- **Who the hook applies to.** The hook input carries `agent_id` = `a<name>-<16 hex>` for teammates, which the console already parses. The hook exits at once for the lead, which has no `agent_id`, and for plain subagents, which have no inbox.
- **No duplicates.** Delivered entries are marked read under the same lock the mailbox writer takes (`proper-lockfile`, as in `src/server/control/mailbox.ts`), so the turn-end delivery doesn't repeat them. The plan's first task checks that Claude Code skips `read: true` entries. If it doesn't, the hook removes delivered entries instead, which matches the `[]` left in delivered inboxes.
- **What isn't delivered early.** Protocol entries (shutdown, plan approval, permission frames) wait for turn end as today. A message over the 10,000-character cap on injected context is left unread, with a one-line notice that it will arrive at turn end.
- **Where it runs.** A standalone Node script, `plugin/bin/inbox-deliver.mjs`, registered as a second PostToolUse hook. It works whether or not the console is running. It needs no console change: the console already shows inbox reads.

### Targeted test: `bench delivery` (interactive)
- **Setup:** the spike, fixed: a teammate makes 15 short tool calls, and a message goes out 5 s in.
- **Measure:** the tool calls and seconds until the teammate sees it.
- **Result:** before, it arrives only after the whole turn; after, on the next tool call, under 10 s.
- **Next batch:** the message lag median against 23 min.

## 3. Lighter re-reviews

### Problem
Every re-review is a fresh full reviewer at the session's effort: 9–12 min for small fix diffs. Executors idled 64 track-minutes waiting on reviews. First rounds found 6 of the 7 Blocking bugs, and re-reviews found one.

### Decision
- **Round 1:** unchanged: `team8:reviewer` (high) on the track's whole diff.
- **Rounds 2–3:** `team8:reviewer-light` (medium) on the fix diff only, given the findings list, with verdicts per finding plus breakage in the fix.
- **Small fixes:** a fix diff of 20 changed lines or fewer that adds no file and no new branch of logic is checked by the lead against the findings, with no reviewer. The run log records it as "lead-checked".
- **Where the rule lives:** the Track Review section of `team8:run` and the reviewer definitions.

### Targeted test: `bench rereview`
- **Setup:** replay voices' round-2 fix diff (meetnotes d198f11, 330 lines) with its findings list through `team8:reviewer` at max and through `team8:reviewer-light`.
- **Measure:** wall time and verdicts.
- **Pass:** the same six ADDRESSED verdicts, and no Blocking finding lost.
- **Next batch:** the review tail per track.

## 4. Right-sized checks

### Problem
- **Repeated packaging:** executors packaged the app after every review round, 19 runs at 3.5–4 min. That was 24% of executor active time.
- **A check that couldn't work:** the plan prescribed recording a podcast played through the speakers, which could never work, and cost 21 min.

### Decision
`writing-plans.md`, `team8:tasks`, `team8:run` part 5 and `executor.md` all say the same four things:
- **Each round's check** is the fastest one that proves the change: the covering tests, the typecheck, or an unpackaged build.
- **The expensive end-to-end check** runs once per track, after the track's last fix. It runs again only when a finding is about it.
- **A check goes into a plan only if the planner has seen it run.** Otherwise it becomes a spike or is marked unproven.
- **A check never touches the user's real data or devices,** such as speakers or the microphone.

### Targeted test: `bench checks`
- **Setup:** headless, run `team8:plan`'s plan-writing step and `team8:tasks` on a fixed small fixture spec: an Electron-style app with one UI task and one packaging-sensitive task.
- **Measure:** count the expensive checks prescribed per track.
- **Result:** before, one per task per round is expected; after, one per track.
- **Next batch:** expensive-check minutes per track.

## 5. No idle with work left

### Problem
The dispatch contract says to start each later task "once the previous closes" and to go idle after reporting. A teammate read that as waiting for the lead and sat idle for 102 min with its next task open.

### Decision
- **The contract.** `executor.md` and `team8:run` parts 1 and 7 say:
  - after completing a task, write a one-paragraph report and claim the next task in your track straight away;
  - go idle only when every task in your track is completed;
  - the final answer at that point is the full report.
- **The console.** It marks a teammate that has been idle for over 5 minutes while its track has a task not yet completed: "idle with work left", with the minutes. The flag is computed from the task list and the idle notifications it already ingests.

### Targeted test: `bench idle`
- **Setup:** interactive. One teammate owns a two-task track of trivial tasks, and the lead doesn't reply.
- **Measure:** the gap from task 1 completed to task 2 in progress.
- **Result:** before, no claim within 5 min, which is where the test stops; after, under 1 min.
- **Next batch:** idle-with-work minutes.
