---
name: tasks
description: Use when breaking work into tasks — a feature, a migration, a review's findings, a plan — or when the user asks to make a task list, break something down, split work up, or turn analysis into tasks. Also when work is about to be handed to teammates or subagents.
---

# Tasks

## Overview

A task list is a delegation contract, not a to-do list. Each task gets picked up by an agent with **none of this conversation's context**, possibly in parallel with its siblings, possibly on a different model. That needs three things: a description that stands alone, dependencies that are real, and a model sized to the task.

**This skill also decides how the list runs.** Solo, subagents, teammates or workflow is read off the finished graph here — and, between subagents and teammates, asked of the user with the recommendation first — stated as the first line of the closing message, and executed by `team8:run` as stated. Nothing upstream knows it — a plan is the same plan in any mode — and `run` does not re-decide it. Until this line exists, the mode is unknown, and the console shows no mode badge for the session.

## When to Use

Breaking work down, planning it, or turning finished analysis into tasks — especially when it will be split across teammates or subagents.

**Not for:** a single task, or work you'll finish in the next two tool calls.

**Handing these to teammates?** `team8:run` covers
how many teammates, the dispatch contract, and settling the terminal deliverable.
The `model` set here goes on each dispatch's `Agent` call, and the `effort` picks the
executor definition it spawns: `team8:executor-low`, `team8:executor`,
`team8:executor-high` or `team8:executor-xhigh`.

## No plan first? Check each item

This applies when the items are tickets from ADO, Jira or Linear, a pasted list,
or the user's own list, and `team8:plan` hasn't run on them this session. Check
every item before it becomes a task. It's ready when its ticket and a few greps
of the repo answer all four:

1. **Outcome:** what's observably true once its PR merges. "Investigate X" doesn't name one.
2. **Place:** the files or flow it changes.
3. **Proof:** the test, command or check that shows it's done.
4. **No open call:** no product or design decision and no choice between approaches left open. A bug needs a confirmed cause.

Show the verdict before the first `TaskCreate`:

| Item | Ready | Missing |
|---|---|---|
| AB#1234 Hide the class price for members | yes | — |
| AB#1240 Investigate gift card add errors | no | outcome, cause |

A ready item becomes tasks as written, and its descriptions carry what the
greps found. An item that isn't ready goes through `team8:plan` by itself, one
item at a time, before the closing. It gets its own classification and its own
approval, and a bug with no confirmed cause goes to `team8:reproduce` first.
Its tasks join this list, then control comes back here. The batch gets one
closing and one `team8:run`. If an item's plan ends as a spike, it has an
answer instead of tasks; say so in the notes.

Tasks that `team8:plan` itself hands over skip this check.

## The contract: four fields, every task

Every `TaskCreate` carries all four. A task missing the fourth is not finished.

1. **`subject`** — imperative, names the outcome. "Ingest the patch from the session transcript", not "Transcript work".
2. **`description`** — executable by someone who never read this conversation: exact values, exact paths, and the *why* behind any constraint that looks arbitrary. Never "as we discussed".
3. **`blockedBy`** — set afterwards via `TaskUpdate`. Real dependencies only.
4. **`metadata`** — `{ complexity, model, effort, why }`. This is the field that gets skipped. It is required.

```json
{"subject": "Add the diff payload to the shared domain model",
 "description": "TranscriptLine in src/shared/domain.ts is { id, marker, text, ts }…",
 "metadata": {"complexity": "judgment", "model": "opus", "effort": "high",
              "why": "shape is a contract three later tasks consume"}}
```

A hook enforces both ends of this on the tool call itself: a `TaskCreate`
that carries any of `complexity`, `model`, `effort` or `why` must carry all
four, and a teammate's `TaskUpdate` to `completed` must carry
`metadata.verified` in that same call.

## Sizing: read the description you just wrote

The verbs in your own description are the evidence. No separate analysis pass.

| The description says… | Complexity | Model | Effort |
|---|---|---|---|
| "add field X to type Y", "rename", "move", "delete the dead branch" — outcome stated exactly, a typecheck or existing test proves it | mechanical | `haiku` | `low` |
| "build it the way `src/…/Foo.tsx` does", "wire the route", "cover it in `x.test.ts`" — outcome stated, one layer, precedent in the repo to copy | standard | `sonnet` | `medium` |
| "decide", "choose", "design", "figure out whether" — or it defines a contract other tasks consume, or correctness is a judgment call (UX, visual, API shape) | judgment | `opus` | `high` |

Names are tiers — cheapest capable, mid, top. Substitute current names as models change.

**Escalate to `xhigh`/`max`** only when a task is *both* judgment-level *and* expensive to unwind: a shared data model, a public interface, a migration, anything touching auth or user data.

**Size by decisions required, not lines changed.** A 400-line mechanical port is `haiku`. A 12-line change to a type every module imports is `opus`.

**If you can't size it, it's too big.** Split until each piece lands in one row.

## Dependencies: what earns a blocker

`blockedBy` means *cannot start*, not *would rather do second*.

- **Real:** the blocker produces a type, field, route, file, or decision the blocked task reads.
- **Not real:** "feels like it comes first", "same area of the code", "that's my working order".
- **Verification is blocked by everything that can break it**, not just the last piece.
- **A decision task blocks whatever the decision changes.** Model an open question as its own task rather than burying it in an implementation task.
- **Leave parallel work unblocked.** Every needless blocker is serialized time.

## Owners, in teammates mode

Claude Code 2.1.296 has an in-process teammate claim the first pending,
unowned, unblocked task by itself, whatever track it belongs to: once at
spawn, before it reads its prompt and without telling the model, and again
whenever it goes idle. It never takes a task that has an owner.

The mode is settled after the tasks exist: read off the graph and, between
subagents and teammates, asked (Mode, below). Once it comes out as teammates,
set the owners before the checks and the closing; in any other mode, don't.

- **Name each track's teammate** when you draw the tracks: short, lowercase,
  from what the track builds (`gate`, `skills`, `prices`). `team8:run` spawns
  it under exactly that name.
- **Make it the `owner` of every task in its track** right after creating the
  tasks, in the same `TaskUpdate` that adds `blockedBy` where there is one.

## Before the closing: three checks

Tracks run in parallel in one checkout, so three mistakes break a run wherever
the tasks came from — a plan, a Jira or Linear list, or the user. Check all
three on the finished list, before writing the closing. Every fix touches the
task list only, never a plan.

1. **No file belongs to two tracks.** List each task's owned files by track.
   A file under two tracks: move both tasks into one track, in order, so one
   teammate does them one after the other, and correct the track line in
   their descriptions with `TaskUpdate`.
2. **Every consumer waits on its producer.** A task that reads a type, field,
   route, file or decision another task produces has that task in its
   `blockedBy`. Missing: `TaskUpdate` with `addBlockedBy`.
3. **Teammates mode: every task has an owner** — its track's teammate.
   Missing: `TaskUpdate` with `owner`.

Say the result in the notes: `checks: tracks disjoint · blockers complete · owners set`,
or what was fixed.

## After creating: the mode, the table, the notes, the ask

The closing message has four parts, in this order. Part 4 is an action, not a question: the list runs in the same turn it is shown.

1. **The mode** — the first line, on its own, as Mode below settled it (read off the graph, asked where it was subagents or teammates), and for teammates it says how many run at once: `mode: teammates — 4 tracks in 3 waves, peak 2 at once`. Then the waves, one line each, before the table. A closing without this has not decided anything, and `run` will have to.

2. **The table** — dependency, model and estimate columns, so the user can override before anything runs, and a total row:

| # | Task | Blocked by | Model | Est. |
|---|---|---|---|---|
| 3 | Ingest the patch from the session transcript | 2 | sonnet · medium | ≈\$1.15 |
| | **Total** | | | **≈\$9.40** |

3. **The notes** — which tasks are startable now, and any sizing you were unsure about.

4. **The handoff** — invoke `team8:run` in the stated mode, in the same turn, with no question first — the one question this skill asks, subagents or teammates, came before the closing. The user adjusts by interrupting: **adjust models** re-sizes a task's model or effort, **adjust tasks** adds, removes, merges, re-scopes, re-wires or changes the mode; either edits the list with `TaskUpdate`, re-prices the table, and re-invokes `run`. A closing that ends the turn with the table and no dispatch is the failure this part exists to prevent.

## Mode: read it off the graph, then ask

The task list decides how it runs, not the plan and not habit. Four modes,
matching the console's: solo, subagents, teammates, workflow. Read the
recommendation off the tracks and the task shapes; where it lands between
subagents and teammates, ask the user with the recommendation first (The ask,
below); state the result with its reason in the closing. `team8:run` executes
whichever was chosen.

The four modes are Claude Code's own ways of running work in parallel
(https://code.claude.com/docs/en/agents), and they differ on seven things.
This is the knowledge the mode is read against:

| | solo | subagents | teammates | workflow |
|---|---|---|---|---|
| What it is | The lead does it | Delegated workers inside one session: each does a task in its own context and returns a summary | Multiple coordinated sessions with a shared task list and inter-agent messaging, managed by a lead | A script that runs many subagents and cross-checks their results |
| Who coordinates the work | The lead | The lead delegates and collects results inside one conversation | The lead plans, assigns and supervises a group of workers | The script holds the plan instead of the lead's turn-by-turn judgment |
| Do the workers talk to each other | — | No. Each reports back to the lead | Yes. Teammates message each other and share the task list | No. The script passes results between stages |
| Where they edit | The lead's checkout | A worktree each, on a branch each | One shared checkout, each owning its files | Per agent, as the script spawns it |
| Where intermediate results live | The lead's context | The lead's context | A shared task list | Script variables |
| Scale | A couple of tool calls | A few delegated tasks per turn | A handful of long-running peers | Dozens to hundreds of agents per run |
| Interruption | — | Restarts the turn | Teammates keep running | Resumable in the same session |

A track is a group of tasks whose files no other group touches. Count them
first, then read the work against the table — above all, do the workers
need to talk to each other:

| The work is | Mode | Why, per the table |
|---|---|---|
| At most two tasks, every one of them **mechanical** (Sizing above) — work the lead finishes in the next few tool calls | **solo** | Nothing is worth repeating and nothing is worth a worker. Spawning costs more than the work; the lead does it, TDD, one commit |
| A batch of separate tickets — two to seven tasks, related or not, none big enough to split into tracks of its own — or a single **standard** or **judgment** task, or any graph with a peak of 1 | **subagents** | Each ticket is a side job a worker does in its own context, in a worktree of its own on its own branch, and hands back as a PR; the lead reviews each and decides what runs next. They all start at once and never coordinate: no task needs a sibling's result mid-flight, so nobody needs a mailbox, a shared branch or file ownership |
| One new module or feature split into two or more tracks that build at once — pieces that share types, routes, a branch and a track review | **teammates** | The lead splits the project into pieces, assigns them and keeps the workers in sync through the shared task list and messaging. Parallel writers in one checkout need file ownership, a shared branch and a track review. Every task carries its teammate as owner from creation (Owners, above), and the teammate claims each in turn. Size against 3–5 teammates and 5–6 tasks each — fewer tasks per teammate and coordination costs more than the parallelism buys |
| Five or more tasks of the same shape — the same job over many inputs, a review per PR, a fan-out with a verify step — with no decision between them | **workflow** | The orchestration itself is the repeatable thing: the script decides what runs next, results live in its variables, and it scales to dozens or hundreds of agents where a lead would improvise the same dispatch by hand. This skill's instruction is the opt-in the Workflow tool requires: state it, do not ask the user to choose it |

A single standard task is subagents, not solo: one file of real work is
still work the lead should review rather than write. Solo is for the rename,
the flag, the field — the rows Sizing calls mechanical. Ties break upward:
subagents before teammates, unless the tasks are pieces of one feature that
genuinely build at once. Separate tickets that happen to be startable together
are still subagents: parallel is not the same as coordinated. Teammates before
workflow whenever a task needs judgment between steps. A batch that mixes
shapes takes the mode of its hardest part.

### The ask: subagents or teammates

Solo and workflow are read off the graph and stated. Between subagents and
teammates the choice is the user's — their session, their cost, their
attention — and this skill asks it, once, after the tasks exist and before
the owners and the three checks. `AskUserQuestion`, header `Mode`, exactly
two options, the recommended one first and labelled `(Recommended)`, each
described in one line of what it means for this list:

- `teammates` — "One feature in N tracks that build at once: N peers on a shared branch, each owning its files, messaging each other, a track review per track."
- `subagents` — "A worker per ticket, all at once, each in a worktree of its own on its own branch: a PR each, every result back in my context to review; nobody coordinates with anybody."

The answer is the mode, whatever the graph said. Teammates: set the owners
(above) before the checks. Subagents: leave every owner empty; the waves still
say which tracks start at once, each in its own worktree. This is the one
question this skill asks; the closing still ends in the handoff, not a
question.

**Tracks are not parallelism.** A track is who owns which files — in subagents
mode, which worktree; a wave is who is running at the same time. Wave 1 is every
track whose first task has no blocker. Wave N+1 is every track whose first task
is unblocked once wave N closes. The peak is the largest wave, and it is the
number of agents the user is paying for at once, in either mode. Four tracks
that run 1, then 2, then 1 is a peak of 2, and the closing says so.

Write the mode as the first line of the closing, then the waves:

```
mode: teammates — 4 tracks in 3 waves, peak 2 at once
wave 1: A (tasks 1, 2)
wave 2: B (3) ∥ C (4, 5, 6) — after task 1
wave 3: D (7) — after 4, 5, 6
```

Subagents the same way: `mode: subagents — 5 tickets in 5 tracks, one wave, 5 at once`.

A peak of 1 is not teammates. Every track running after the previous one is
one serial line of work, and the mode is subagents whatever the file
ownership looks like.

## Estimating: complexity × model × effort, at list price

The estimate is a token budget per complexity, priced at the model's list
rate, scaled by effort. It answers "is this batch a coffee or a dinner", not
an invoice; the console's usage view shows what it actually cost.

**Base, at `medium` effort:**

| Complexity | haiku | sonnet | opus |
|---|---|---|---|
| mechanical | ≈\$0.02 | ≈\$0.35 | ≈\$0.60 |
| standard | ≈\$0.06 | ≈\$1.15 | ≈\$1.75 |
| judgment | ≈\$0.11 | ≈\$2.10 | ≈\$3.05 |

**Effort factor:**

| low | medium | high | xhigh | max |
|---|---|---|---|---|
| ×0.7 | ×1 | ×1.3 | ×1.7 | ×2.2 |

Estimate = base cell × effort factor. Effort buys thinking, and thinking is
output, the expensive class; it also buys more tool calls per task, which is
why the factor climbs faster than the output share alone. Sum for the total.
Always draw the figures with `≈$`: they are list price, not a bill.

The sizing table's defaults price as: mechanical · haiku · low ≈\$0.01,
standard · sonnet · medium ≈\$1.15, judgment · opus · high ≈\$3.95. An
escalated judgment task, opus · xhigh, is ≈\$5.20.

Behind the cells, one teammate working one task, most of its context served
from cache: mechanical ≈ 15 turns at 40k context (0.6M cache-read, 8k output,
60k written or uncached); standard ≈ 40 turns at 70k (2.8M, 25k, 140k);
judgment ≈ 60 turns at 100k (6M, 40k, 210k). Priced at `catalog.json` rates
as of 2026-10 (haiku 0.10/0.50, sonnet 2/10, opus 4/20 USD per million
in/out; cache reads 0.01, 0.20 and 0.20; written tokens at the 5-minute
cache-write rate, 0.125, 2.50 and 5; haiku at its rate for prompts up to
100K tokens, and a haiku turn whose context is past 100K tokens bills at 5× these rates).

**Calibrate from the console, not from this table.** After a batch, the usage
view's cost per task is the real number for this repo. When it disagrees with
a cell by more than half, change the cell; when every cell at one effort is off
in the same direction, change the factor instead.

## Common mistakes

| Mistake | Fix |
|---|---|
| A ticket turned into a task without the readiness check | Check it against the four questions first. Any "no" means it goes through `team8:plan` by itself. |
| One model for the whole list | Model is per-task. A list of nine usually spans two or three tiers. |
| Mode left implicit, or left to `run` | It is part 1 of the closing. Read it off the tracks, ask where it is subagents or teammates, and say it with its reason. |
| Teammates by habit for a one-track list | One track is subagents. Count the tracks before naming the mode. |
| Teammates for a batch of separate tickets | Tickets that never need each other's results are subagents, however many could start at once. Teammates is one feature split into pieces that build together. |
| Choosing subagents or teammates without the ask | The choice is the user's. Recommend one, label it `(Recommended)`, ask, then set owners if the answer is teammates. |
| "4 tracks" read as 4 teammates | Tracks own files; waves run. Say the peak, and list the waves. |
| Chaining every task 1→2→3→4 | Per blocker, ask: what output does the blocked task read? No answer, no blocker. |
| Sizing by diff size | Size by decisions. Bulk is cheap; a small ambiguous change is not. |
| Descriptions pointing at the conversation | The executing agent can't see it. Inline the values. |
| A decision buried in an implementation task | Split it: one judgment task, one mechanical task. |
| Splitting so fine tasks only make sense together | If a description can't stand alone, merge it back. |
