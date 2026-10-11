# team8 fixes — design

Fixes that need no mod, from `docs/team8/melhorias-agent-teams.md`: the follow-ups to its eight
improvements and the "Mods (Claude Code 2.1.296)" section's findings, checked against the repo, the
run logs and the 2.1.296 binary, plus two probes run on 2026-10-11. Mods get their own spec.

## Probes (2026-10-11, Claude Code 2.1.296)

- **`Agent` `effort` does not reach a teammate.** A `team8:executor` spawned by name with
  `effort: "high"` printed `CLAUDE_EFFORT=medium` (its agent file); a named general-purpose teammate
  spawned with `effort: "low"` printed `max` (the session's). The binary's named-spawn branch never
  reads the call's `effort`. The executor variants stay.
- **No mid-turn delivery.** A message sent right after spawning a teammate that ran five
  `sleep 15` calls stayed unread through all five (67 s), as in `delivery`'s 09-30 spike.
- **Auto-claim, read from the binary.** An in-process teammate claims the first pending, unowned,
  unblocked task at spawn — owner set to itself, status `in_progress`, before its first prompt and
  without telling the model — and again when idle ("Complete all open tasks. Start with task #N").
  `run` sets only each track's first owner, right before that track's spawn, so a new executor can
  come up owning another track's task.

## Order and branches

- One branch, `fixes`, cut from `main` in `~/code/team8`. `plugin/dist` is never committed.
- Section 3 lands first and alone: it is a merge, and a merge in a shared checkout must not meet a
  neighbour's staged files. Sections 1 and 4 then share one track (`hooks.json`, `setup.ts`, the bin
  scripts, `console-scripts.test.ts`); sections 2 and 5 share the other (the skills and agent files),
  which also writes section 1's lines in `executor.md` and `run`.

## 1. One task gate

### Problem
`task-created.sh` and `task-completed.sh` read `~/.claude/tasks/session-<first 8 of session_id>/<id>.json`.
When that is the wrong list they misfire: about 30 blocked stops on 09-29
(`meetnotes/docs/team8/runs/2026-09-29-implementation-delay-log.md:160`). When it is the right list
they gate every task in it, team8's or not: on 10-08 the created gate rejected a session's tasks
#1–#6 for missing all four keys (prompt-fiction). Completing also takes two `TaskUpdate` calls.

### Decision
- `plugin/bin/task-gate.sh` on PreToolUse, matcher `TaskCreate|TaskUpdate`, reads only the call's
  input. It replaces both scripts and their `TaskCreated`/`TaskCompleted` entries.
  - **`TaskCreate`:** if `metadata` holds any of `complexity`, `model`, `effort`, `why`, all four
    must be non-empty. A task with none of them is not team8's and passes.
  - **`TaskUpdate` to `completed` with an `agent_id`:** `metadata.verified` must be non-empty in the
    same call. The lead's own completions carry no `agent_id` and pass.
  - Denies with exit 2 and a one-line reason on stderr that says what to add. No payload, no `jq`
    or unparseable input exits 0, as today.
- `executor.md` ("Before marking a task completed") and `run`'s dispatch part 7 say one call:
  `TaskUpdate` with `status: "completed"` and `metadata.verified` together.
- `src/server/setup.ts`'s hook block and `setup.test.ts` register the new script; the
  console-entry check still recognises the two old names so an older install is cleaned up.
- The `hooks.json` description names the gate.

### Acceptance
`console-scripts.test.ts` pipes payloads through `task-gate.sh`: a `TaskCreate` with no metadata
passes; with some of the four keys it is denied and the reason names the missing ones; with all four
it passes; a teammate's `TaskUpdate` to `completed` without `verified` is denied and with it passes;
the lead's passes; any other `TaskUpdate` passes; garbage input passes.

## 2. Owners on every task, and "Close the run"

### Problem
Auto-claim (Probes) takes any unowned task, at spawn and when idle. Separately, the harness clears a
list whose tasks are all completed; when that happens while reviews are open, round-2 and round-3
`verified` updates fail on tasks that no longer exist (four losses recorded).

### Decision
- **`team8:tasks`, teammates mode:** name each track's teammate when the tracks are drawn, and set it
  as `owner` of every task in its track right after creating them, in the same `TaskUpdate` that adds
  blockers where there is one. The closing checks add "every task has an owner".
- **"Close the run":** `team8:tasks` adds one last task in teammates mode, owned by `team-lead`,
  blocked by every other task, with no team8 metadata. The list then never ends up all-completed
  before the close. The closing table shows it as the lead's, with no model or estimate.
- **`team8:run`:** spawns each teammate under the name its tasks already carry. Step 5 and dispatch
  part 1 drop "set the owner of the first task, before the spawn". Step 8 completes "Close the run"
  after the run log is committed. After a resume, a respawn still takes the old owner's name.

### Acceptance
The skill texts say all of the above; nothing to run. The next teammates batch's run log notes
whether any task was claimed by a teammate outside its track.

## 3. Messages reach busy teammates: merge `delivery`

### Problem
A lead message to a busy teammate waits for its turn to end (Probes): 24 of 44 over 5 min late on
09-29, October maxima of 9.4 and 21.2 min. Branch `delivery` (51cae23, unmerged) already fixes it: a
PostToolUse hook hands a teammate its unread messages after each tool call and marks them read.

### Decision
- Merge `delivery` into `fixes` (`git merge --no-ff delivery`). Resolve `hooks.json` and `setup.ts`
  against main, keeping main's progress reminder (PR #37) beside the new PostToolUse entry. Run the
  full test suite, the typecheck and `npm run build` (not committed).
- Fill the Run section of `delivery`'s run log with one line pointing at this batch's run log.
- Moving the delivery into the console's existing PostToolUse answer (no node spawn per call, but
  nothing while the console is down) waits until a measurement shows the spawn costs anything.

### Acceptance
Tests, typecheck and build pass on `fixes`. After the batch, in a session started with
`claude --plugin-dir ~/code/team8/plugin`, the five-sleep probe shows the message after the next
tool call instead of at turn end; this needs a fresh interactive session and is the user's check.

## 4. Resume hint

### Problem
`/resume` drops in-process teammates; `run`'s "After a resume" covers it, but nothing tells the lead
it happened. `console-hint.sh` runs on every SessionStart and throws the payload away.

### Decision
- `console-hint.sh` reads the payload. When `source` is `resume` and
  `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/teams/session-<first 8 of session_id>/config.json` exists, its
  output adds `hookSpecificOutput.additionalContext`: "team8: this session was resumed and its
  in-process teammates are gone. Before messaging any of them, run TaskList, set each in_progress
  task whose owner is gone back to pending, and respawn its track per team8:run, After a resume."
- 2.1.296 names a team after its lead's session, so the check is one file test, not
  `console-launch.sh`'s team resolution. The existing `systemMessage` lines stay. Without `jq`, no hint.

### Acceptance
`console-scripts.test.ts`: resume with the team's `config.json` present carries the context; resume
without it, and `startup` with it, do not; the `systemMessage` cases still pass.

## 5. Prose fixes

- **Report size.** The idle notification cuts a final answer at 4,000 characters (16,000 per drain),
  and 7 of the 9 recorded "send the rest" round trips went to reviewers. `executor.md`,
  `reviewer.md`, and `run`'s part 7 and review request: keep the final answer under about 3,500
  characters, Blocking findings first; anything longer goes in a file under the reports directory the
  dispatch names (`<scratchpad>/reports/`), and the answer ends with its path. `run` names that
  directory in every dispatch and review request.
- **Unblock message.** `executor.md`: on completing a task whose `TaskGet` showed a non-empty
  `blocks`, `SendMessage` the lead "#N completed; unblocks #M". It wakes an idle lead to dispatch the
  next wave; it is not the report.
- **Never `git stash`.** Two stash incidents in September, one of which wiped a teammate's work.
  `executor.md` git discipline, `reviewer.md`'s list of state-changing commands, and `run`'s
  shared-checkout rules. No PreToolUse git guard: it would run on every subagent's Bash call on the
  machine, and there has been no stash incident since the pathspec rule landed.
- **Effort wording.** `src/server/agent-variants.ts:5` and `run/SKILL.md:229` say the Agent tool has
  no `effort` parameter. It has one; it does not reach a teammate (Probes). The 09-30 speed spec is a
  record and stays as written.
- **`setup.md` step 3.** Line 25 lists `subagentPromptCacheTtl: "1h"`; step 3 is headed "Write only
  these two keys" and omits it. Step 3 writes three keys, the TTL only when absent.
- **Variants.** `executor.md` and `reviewer.md` change, so `npm run agents` regenerates
  `executor-low/high/xhigh` and `reviewer-light`, and the drift test passes.

## Out of scope

Mods (own spec); the git guard hook; dropping `reviewer-light` (needs a probe that the parameter
beats a subagent's `effort:` frontmatter); a status line; `autoCompactWindow` (applies at each new
prompt, per the binary; belongs with the cost work); speed PRs 3–4 (`2026-09-30-team8-speed-design.md`).
