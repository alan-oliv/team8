---
name: run
description: Use when a task list exists and the user asks to implement it, work through it, start on it, or run it — or when a session has settled on several pieces of work and the user asks to delegate them, hand them to teammates, or split them up as a team
---

# Run

## Overview

Turn work the session has already identified into tasks on the shared list, then
hand each one to a teammate that owns it from unread to open PR.

**Core principle: the lead delegates the work AND the paperwork.** A teammate that
does not claim its own task, invoke its own skills, and open its own PR is a pair
of hands, not an owner — and the lead becomes the bottleneck it was trying to avoid.

## The Pipeline

1. **Name the work.** List the items from session context. Show the list.
2. **Settle the branch shape and the terminal deliverable — once, before
   dispatching.** Both are yours to decide, not the user's to be asked. See below.
3. **`TaskCreate` one task per item**, before any teammate exists.
   **REQUIRED SUB-SKILL:** `team8:tasks` — what each
   task has to carry, and the model each one is worth.
   If `team8:plan` already landed them, skip this step and its branch cut.
4. **Take the mode from the task list's closing notes** — solo, subagents,
   teammates or workflow, per `team8:tasks` Mode. If no mode was stated, derive
   it now from the same table and say it in one line. Then, for teammates,
   take the waves from the closing: teammates alive at any moment are the
   tracks in the current wave, never all the tracks.
5. **Dispatch** in that mode: see Modes below. Teammates use the contract
   below; set the owner of each track's *first* task with `TaskUpdate` **before**
   the `Agent` call that spawns its teammate — an owner set afterwards arrives as
   a fresh assignment, and the teammate re-reads work it is already doing. It
   claims the rest of its track itself.
6. **Teammates only: verify the roster before they get deep.** Every teammate you dispatched has
   to appear in `~/.claude/teams/<team>/config.json`:
   `jq -r '.members[].name' ~/.claude/teams/<team>/config.json`. A name missing
   there is not a teammate, whatever the spawn result said — respawn it. Do this
   immediately; a wrong roster is cheap to fix in the first minute and expensive
   once six agents have edited files.
7. **Stay free.** Answer questions, relay results, and run the track review
   below as each track lands. Never fix a finding yourself. **While any track is
   live, do no multi-step investigation yourself** — a report waits as long as
   your longest turn. Dispatch a subagent for it, or do it before dispatching.
8. **Run the full suite, then close the run log.** Run it yourself once every
   track is clear — the executors only ran the tests covering their own files.
   Then, when the PR is up, fill the Run section of `docs/team8/runs/<batch>.md`
   (opened by `team8:plan`; create it from that skill's template if this batch
   skipped `plan`) and commit it on the branch.

## Step 2a: Derive the Branch Shape — Don't Ask

The task graph already answers this. Read it off the blockers, state your decision
in one line, and move on. Asking the user to pick a branching strategy pushes a
question at them that only you have the dependency graph to answer.

| What the graph says | Branch shape |
|---|---|
| Any two tracks run at the same time | **One shared branch, one PR for the batch.** The only option |
| Every task is blocked by the previous one — one track, one teammate | One branch per task, stacked, a PR each, IF you want reviewable slices |
| Sequential tasks inside a track, parallel tracks beside it | Still one shared branch. The concurrency decides it |

**Why concurrency forecloses the choice:** teammates share one checkout, so they
share HEAD. Two teammates cannot sit on two branches — a `git checkout -b` moves
everyone. Per-task PRs need per-task branches, and per-task branches need no
concurrency, so the moment two tracks overlap the stacked-branch option is gone.
Do not discover this by trying it.

**Cut the branch yourself before dispatching**, and tell every teammate it is
already checked out and not to run `git checkout -b`. Sequential tasks in one track
land as successive commits on it; parallel tracks stay apart by file ownership, not
by branch.

**One PR, opened by whoever finishes first.** Every dispatch prompt says: open a PR
against `main` if none exists for the branch yet and report its URL, otherwise your
push lands in the existing one — just report that. Without that sentence, either
everyone tries to open a PR or nobody does.

## Step 2b: Decide the Terminal Deliverable — Don't Ask Either

Opening a PR is outward-facing, so an agent will correctly refuse it by default and
end at "committed on your branch." That default is right for a lone agent, and it is
also the single most common way this workflow ends up half-finished.

Running `team8:run` is the standing authorisation. **Default: the batch ends in an
open PR.** State it as a decision in the same line as the branch shape, then
dispatch:

> 5 tasks, 4 teammates, one shared branch `handoff-v4`. First one green opens the
> PR against `main`; the rest push into it.

How many PRs is yours to decide too, and the origin of the work decides it:

| Where the work came from | PRs |
|---|---|
| One batch tackled together — a plan, a handoff drop, a review's findings | One PR for the batch |
| Separate tickets, separate identifications, separate asks | A PR each — but only if step 2a left you a single track; concurrency forecloses per-task branches |

Whatever you decide is the answer **for the whole batch**, and every dispatch prompt
must state it explicitly. Do not decide per teammate, and do not leave it unstated
and let each teammate choose — that is how three branches land and two sit unpushed.

**Ask the user only what changes what gets built.** A question whose every answer
leads to the same dispatch is a round trip you spent for nothing. Worth asking: two
readings of the work that produce different code; a destructive step outside the
task list; a missing value you cannot derive. Not worth asking: whether to push,
how to branch, how many PRs, whether to start.

### Red Flags — you are about to waste the user's turn

- "…ok, or would you rather they stop at commits and you open it?"
- "Which way now — adjust, or start the work?" *after* the user already said run it
- Any question you could answer by reading the task graph or the git state
- Presenting a recommended option and then asking whether to take it

**All of these mean: take the recommended option and dispatch.**

## Modes

The mode came from the task graph (`team8:tasks` Mode). Each mode ends the
same way: the terminal deliverable from step 2b, the run log filled at close.

**solo.** The lead does the work itself, task by task in dependency order,
TDD, one commit per task staging paths by name. Mark each task `in_progress`
and `completed` as you go. No dispatch, no roster.

**subagents.** One track, nothing parallel. For each task in dependency order:
record BASE (`git rev-parse HEAD`), dispatch one fresh subagent (`Agent`,
`subagent_type: "team8:executor"`, `model` from the task's metadata — never omit
it) with the seven-part contract below minus part 1 and part 7's `TaskUpdate`
sentences, since subagents have no task tools — tell it so in the prompt,
because its definition says to claim its own tasks: you claim the task with
`TaskUpdate` on its behalf and close it from the reported output, `verified`
metadata included, the one case where that is right. It commits and reports.
Then the Track Review below on `BASE..HEAD`, findings back to the same subagent
by resuming it, three rounds. Never dispatch two implementers at once in this mode. The
lead opens the PR when the last task is clear.

**teammates.** A peak of two or more. Dispatch by wave, from the closing's
wave lines: every track in wave 1 now, one teammate each; each later wave
when the tasks it waits on close, fresh teammates. A teammate whose track is
clear stops. **N per wave = the tracks in that wave**, not the number of
tasks and not the number of tracks overall:

| Situation | Teammates |
|---|---|
| Two tasks edit the same file | One teammate, both tasks, in order |
| A task depends on another's output | Same teammate, sequentially, or a later wave |
| A task nothing else touches | Its own teammate, dispatched now |
| A task that is small and easy | Still a teammate in this mode. Never keep it for yourself |

**workflow.** Same-shape fan-out or a fixed pipeline. The mode came from the
table and the user approved the table, and this skill's instruction is the
opt-in the Workflow tool requires — do not ask "run these as a workflow?".
Load the `workflow-authoring` skill and write the script: one `agent()` per
task with its model, `pipeline` over the dependency edges, a review stage per
task with the Track Review rubric, results to files. The console shows a
workflow in its own mode; agents in it never join the roster.

### Teammates share one checkout

**Never pass `isolation: "worktree"` when spawning a teammate.** It routes the
`Agent` call down the ordinary-subagent path, and what comes back is not a
teammate at all: it never enters `members[]`, gets no `TaskGet`/`TaskUpdate`, has
no mailbox, and never appears in the console. Nothing errors. You find out when a
"teammate" messages you saying it cannot read the task list.

There is no per-teammate worktree to reach for. Isolation comes from **disjoint
file ownership**, and the dispatch prompt is where you create it:

- Name the files each teammate owns, and name the ones it must not touch.
- Each commits its own paths **by pathspec**: `git commit -m "…" -- <its paths>`
  — the message first, since everything after `--` is read as a path.
  Never `git add -A` or `git add .`, and never a bare `git commit` — the index is
  shared, so either one ships a neighbour's half-finished edit.
- One shared branch for the batch, unless step 2a derived otherwise. They share a
  checkout, so they share HEAD: a teammate running `git checkout -b` moves
  everyone. Create the branch yourself before dispatching.
- A test failure in a file a teammate does not own means a neighbour was
  mid-edit. Re-run once, then report it — never fix another teammate's file.
- A commit can fail on an index lock. Wait, retry.

### After a resume

`/resume` drops in-process teammates, but the task list under
`~/.claude/tasks/<team>/` persists. The list is the state; the roster is not. On
resume, `TaskList` first. A task still `in_progress` whose owner is not in
`jq -r '.members[].name' ~/.claude/teams/<team>/config.json` is orphaned:
`TaskUpdate` it back to `pending`, set its `owner` to the name you are about to
use, then respawn a fresh teammate under that name with the same dispatch
contract. Never message the dead name — nothing is listening.

## Track Review

An executor that self-verifies and pushes has had nobody read its diff. Each
track gets one fresh reviewer when it lands, the same shape as the plan
reviewer, and the executor stays alive until its track is clear.

1. **When a teammate reports its last task completed and pushed**, write its
   diff to a file — the branch's changes to the files it owns, from the base
   you recorded before dispatching:
   `git diff <base>..HEAD -- <its files> > <scratchpad>/review-<track>.diff`.
   Never hand a reviewer the diff inline.
2. **Dispatch a reviewer** (`subagent_type: "team8:reviewer"`, whose definition
   carries no Edit or Write, so read-only is enforced), model sized like the
   track's biggest task (sonnet for standard, opus for judgment), with: the diff path,
   the task descriptions (`TaskGet` each, paste them), the plan sections those
   tasks name, and the global constraints. Two verdicts, both required: does
   the diff do what the tasks say, nothing more and nothing less; and is it
   well built — tests that assert something, no duplication of a block that
   exists, no scope beyond the tasks. Findings labelled Blocking or Minor,
   each with file, line and the fix. Do not tell it what not to flag.
3. **Blocking findings go to the executor** by `SendMessage`, verbatim. It
   fixes, re-runs the covering tests, pushes, and reports. Then a scoped
   re-review: the diff since the last review, the findings list, verdict per
   finding ADDRESSED or NOT ADDRESSED, plus new breakage in the fix only.
   Three rounds per track. After three, rule on each open finding yourself and
   record the ruling in the run log. Minor findings go straight to the run log.
4. **Clear the track.** Tell the executor its track is clear and it can stop.
   Note the rounds in the run log.

## The Dispatch Contract

Spawn every executor as `subagent_type: "team8:executor"` and every reviewer as
`subagent_type: "team8:reviewer"`. A definition's `tools` list applies to a
teammate and its body is appended to the teammate's prompt, so the reviewer's
read-only is enforced rather than requested, and the standing rules — skills,
committing by pathspec, no `git checkout -b`, the final answer is the report, the
`verified` metadata — already reach the executor. A prompt may say "as your
definition says" for those instead of repeating them in full.

Every dispatch prompt has these seven parts, in this order. Parts 1, 2, 4, 5 and
6 carry what only this dispatch knows — write those out in full. Parts 1, 3 and
6 are the ones that get dropped.

1. **The tasks.** The track's task ids in dependency order, and: "Call `TaskGet`
   on each before you start it. Claim it with `TaskUpdate` (`owner` = your name,
   `status` = `in_progress`) — the first now, each later one once the previous
   closes." You set the owner of the first task only, and before the spawn.
2. **The goal.** The done state in one sentence — not a list of steps.
3. **Skills.** "Check your available skills before you start and use what fits.
   If the shape of the work is unsettled, `superpowers:brainstorming` first. If you
   are writing a plan, `superpowers:writing-plans`. If you are writing code,
   `superpowers:test-driven-development`. Before you claim done,
   `superpowers:verification-before-completion`."
4. **Scope.** Files you own, files that are off limits, who else is live where.
5. **Verification.** The exact commands, and paste the output. Only the tests
   covering the files it owns — never the whole suite, which costs a track its
   first report.
6. **The terminal deliverable.** The decisions from steps 2a and 2b, stated in full.
   Name the branch and say it is already checked out — never "branch off `main`",
   which invites the `git checkout -b` that moves everyone. For the PR case:
   "Commit on `<branch>` by pathspec — `git commit -m '…' -- <your paths>`, with
   the message first because everything after `--` is read as a path. Never a
   bare `git commit`, which ships whatever a neighbour staged. Then
   push. If no PR against `main` exists for this branch yet, open one and report
   its URL; if one already exists, your push lands in it and you just report
   that."
   For the commit case: "Commit on `<branch>` the same way. Do not push."
   Add: "No AI attribution or 'generated with' footer in the commit or the PR body."
7. **Close out.** "Before each task closes, `TaskUpdate` its `metadata` with
   `verified: "<command> → <result>"` — the part 5 commands and their one-line
   outcome. A `TaskCompleted` hook refuses a completion without it. Then
   `TaskUpdate` the task to `completed`. Your final answer IS the report — what
   you did, the verification output, and anything you deliberately left alone.
   Your idle notification carries it to the lead, so do not also send it by
   `SendMessage`. Then go idle: idle is how you stay available — never poll the
   task list waiting. The lead's
   message with review findings wakes you; fix, re-run the covering tests, push,
   and answer again. Stop only when the lead says the track is clear."

## The Run Log at Close

The Run section of `docs/team8/runs/<batch>.md` takes one line per executor
(name, model, effort, track), the review rounds per track and their residuals,
the PR URL, and what it actually cost. The console has the cost; its stream's
first frame is the full state:

```bash
curl -sN -m 3 http://127.0.0.1:4823/stream | sed -n '/^data: /{s/^data: //p;q;}' \
  | jq '{total: .totalCostUsd, agents: [.agents[] | {name, model, costUsd}]}'
```

Write the total and the per-agent figures with `≈$`, put the plan's estimate
beside them in one line, and end with what went wrong and what to change next
time, one line each, or "nothing". Commit the log on the branch; it belongs in
the PR next to the plan it describes.

## Common Mistakes

| Mistake | Fix |
|---|---|
| "Pushing is the user's call, so I'll stop at a commit" | Running `run` authorised it. Step 2b decided it. Carry that into part 6 |
| Asking whether to open the PR, or how to branch | Both are step 2a/2b decisions. Ask only what changes what gets built |
| Asking the user to choose a branching strategy | Step 2a derives it from the blockers. Only you have the graph |
| Per-task branches or PRs while tracks run in parallel | One checkout, one HEAD. Concurrency already foreclosed it |
| Keeping the small task for yourself | Delegate it. A busy lead can't review or unblock |
| Calling `TaskUpdate` on a teammate's behalf | Part 1 makes claiming theirs. Yours is the first task's owner, set before the spawn and nothing after it |
| One teammate per task, mechanically | Count tracks. Two teammates in one file is a merge conflict |
| Dispatching before `TaskCreate` | The list is how the work stays visible when a teammate dies |
| Bare `git commit` in a shared checkout | It ships whatever a neighbour staged. Commit by pathspec |
| `isolation: "worktree"` to keep parallel writers apart | It silently spawns a subagent, not a teammate. Isolate by file ownership |
| A prompt with no part 3 | Teammates default to improvising. Name the skills |
| Executor stops the moment its tasks are `completed` | Part 7 keeps it alive for the track review. Nobody else can fix its findings |
| Reviewer handed the diff inline | It sits in your context for the session. Diff to a file, path in the prompt |
| Treating a teammate's failure notice as the end of its track | A message wakes a teammate waiting on a retry — send one. Dead a second time, respawn it per After a resume |
| Run log filled from memory a day later | The console's numbers are for this session. Fill it at close |

## Red Flags

- A dispatch prompt that never says how the work ends
- Two live teammates whose scopes name the same file
- You are editing files instead of reviewing them
- You are mid-investigation while a track is live — reports are queued behind your turn
- A finished teammate whose task is still `pending`
- A "teammate" that cannot call `TaskGet` — it is a subagent; check `members[]`
- More agents in your spawn log than names in `members[]`
