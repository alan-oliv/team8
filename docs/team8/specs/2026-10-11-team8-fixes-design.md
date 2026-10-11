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
  neighbour's staged files. Then three tracks: sections 1, 4 and 6's server half (`hooks.json`,
  `setup.ts`, `lifecycle.ts`, the bin scripts, `plugin/settings.json` and their tests); sections 2, 5
  and 6's `setup.md` (the skills, agent and command files, including section 1's lines in
  `executor.md` and `run`); section 7 (`src/shared/catalog.*`).

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

## 4. `console-hint.sh`: a resume hint, no startup nudge

### Problem
- `/resume` drops in-process teammates; `run`'s "After a resume" covers it, but nothing tells the
  lead it happened. `console-hint.sh` runs on every SessionStart and throws the payload away.
- Every session on the machine starts with "team8 console available - run /team8:console to open
  it", team8 run or not.

### Decision
- Drop the nudge. `console-hint.sh` prints nothing unless it replaced an older console ("team8
  console updated to …", unchanged) or the resume hint below applies. The comments that describe it
  as a nudge follow: the script's header, the `hooks.json` description, `src/server/lifecycle.ts:36`,
  `src/server/setup.ts:172` and `src/server/setup.test.ts:61`.
- `console-hint.sh` reads the payload. When `source` is `resume` and
  `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/teams/session-<first 8 of session_id>/config.json` exists, its
  output adds `hookSpecificOutput.additionalContext`: "team8: this session was resumed and its
  in-process teammates are gone. Before messaging any of them, run TaskList, set each in_progress
  task whose owner is gone back to pending, and respawn its track per team8:run, After a resume."
- 2.1.296 names a team after its lead's session, so the check is one file test, not
  `console-launch.sh`'s team resolution. Without `jq`, no hint.

### Acceptance
`console-scripts.test.ts`: a start that replaces nothing prints nothing (the "leaves a console of the
same or a newer build alone" case stops expecting the nudge); the upgrade cases still print their
`systemMessage`; resume with the team's `config.json` present carries the context; resume without
it, and `startup` with it, do not.

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
- **Variants.** `executor.md` and `reviewer.md` change, so `npm run agents` regenerates
  `executor-low/high/xhigh` and `reviewer-light`, and the drift test passes.

## 6. Setup: no cache TTL, the status line from the plugin

### Problem
- `/team8:setup` runs once per machine, so nothing added to it later reaches an existing install,
  and what it writes into `~/.claude/settings.json` applies to every session.
- `subagentPromptCacheTtl: "1h"` is one of those. It reaches in-process teammates (their cache writes
  went from 5-minute to 1-hour on 10-07, when setup added it), but also every subagent, workflow agent
  and helper request on the machine. Over 262 team8 teammates from 09-10 to 10-11 it nets −$7.49 on
  $762.50 of spend at list prices, and the sign flips with the price table. It pays only for opus
  executors with large contexts that wait 5–60 minutes between review rounds (speakers-playback,
  +$16); sonnet executors and reviewers lose. A plugin cannot ship it: a plugin's own `settings.json`
  accepts only `agent` and `subagentStatusLine`, and an agent file's `experimental.cacheTtl` is
  dropped for in-process teammates.
- `subagentStatusLine` is the other key a plugin's `settings.json` accepts, as the lowest-precedence
  layer, so it can ship with the plugin and reach every install on update.

### Decision
- **No TTL.** `setup.md` drops it (the line 25 bullet and anything in step 3). `src/server/setup.ts`
  stops adding it and stops reporting it; uninstall still removes a `"1h"` it finds, since earlier
  setups wrote one. A machine that has the key removes it by hand.
- **Status line from the plugin.** `plugin/settings.json` carries the console's `subagentStatusLine`,
  the same command `setup.md` writes today (the `curl` to `127.0.0.1:4823/substatus` ending in
  `printf ''`). `setup.md` stops writing it, so step 3 writes only `env`; a user's own
  `subagentStatusLine` still wins, as today. `setup.ts` keeps its status-line handling, which serves
  its `--port` installs.

### Acceptance
`setup.test.ts`: the written block carries no TTL and uninstall still removes `"1h"`.
`claude plugin validate plugin` accepts `plugin/settings.json`. The user's check, in a fresh session
started with `claude --plugin-dir ~/code/team8/plugin` and no user-level `subagentStatusLine`: the
console's per-agent current-tool line updates for teammates.

## 7. Prices for the current models

### Problem
`src/shared/catalog.json` stops at Claude Code 2.1.231: no `claude-opus-5-5`, `claude-fable-5-1`,
`claude-sonnet-5-5` or `claude-haiku-5-5`. `claude-opus-5-5` is priced as `claude-opus-5` ($5 input
and $0.50 cache reads instead of $4 and $0.20), so the console and `measure` put opus-5-5 agents at
about 1.9× list: player on 09-29 was logged at $80.21, $42.72 at list.

### Decision
- Add the four models from the claude-api skill's `shared/models.md` (2.1.296 bundle), all 1M
  context: opus-5-5 $4 / $20, cache reads $0.20; fable-5-1 $10 / $50, reads $0.25; sonnet-5-5
  $2 / $10, reads $0.20; haiku-5-5 $0.10 / $0.50 for a prompt up to 100K tokens and $0.50 / $2.50
  above, reads 0.1× the input rate. Cache writes are 1.25× (5 minutes) and 2× (1 hour) the input
  rate.
- `catalog.ts` prices haiku-5-5 by prompt length, the one model with two rate cards.
- `aliases` follow what 2.1.296 resolves `opus`, `sonnet` and `haiku` to, read from recent spawns'
  `resolvedModel` or transcript model ids; `version` becomes 2.1.296 and `fallbackModel` the current
  Opus. Past run logs stay as written.

### Acceptance
`catalog.test.ts`: each new id prices a request to the cent, haiku-5-5 on both sides of 100K, and
each alias resolves to the id 2.1.296 uses.

## Out of scope

Mods (own spec); the git guard hook; dropping `reviewer-light` (needs a probe that the parameter
beats a subagent's `effort:` frontmatter); a status line showing each teammate's task;
`autoCompactWindow` (applies at each new prompt, per the binary; belongs with the cost work); speed
PRs 3–4 (`2026-09-30-team8-speed-design.md`).
