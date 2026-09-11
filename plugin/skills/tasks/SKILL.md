---
name: tasks
description: Use when breaking work into tasks — a feature, a migration, a review's findings, a plan — or when the user asks to make a task list, break something down, split work up, or turn analysis into tasks. Also when work is about to be handed to teammates or subagents.
---

# Tasks

## Overview

A task list is a delegation contract, not a to-do list. Each task gets picked up by an agent with **none of this conversation's context**, possibly in parallel with its siblings, possibly on a different model. That needs three things: a description that stands alone, dependencies that are real, and a model sized to the task.

**This skill also decides how the list runs.** Solo, subagents, teammates or workflow is read off the finished graph here, stated as the first line of the closing message, and executed by `team8:run` as stated. Nothing upstream knows it — a plan is the same plan in any mode — and `run` does not re-decide it. Until this line exists, the mode is unknown, and the console shows no mode badge for the session.

## When to Use

Breaking work down, planning it, or turning finished analysis into tasks — especially when it will be split across teammates or subagents.

**Not for:** a single task, or work you'll finish in the next two tool calls.

**Handing these to teammates?** `team8:run` covers
how many teammates, the dispatch contract, and settling the terminal deliverable.
The `model` and `effort` set here are what each dispatch passes to its agent.

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

## After creating: the mode, the table, the notes, the ask

The closing message has four parts, in this order. A message that stops after part 3 leaves the contract unsigned — part 4 is what turns the list into a decision.

1. **The mode** — the first line, on its own, derived from the graph per Mode below, and for teammates it says how many run at once: `mode: teammates — 4 tracks in 3 waves, peak 2 at once`. Then the waves, one line each, before the table. A closing without this has not decided anything, and `run` will have to.

2. **The table** — dependency, model and estimate columns, so the user can override before anything runs, and a total row:

| # | Task | Blocked by | Model | Est. |
|---|---|---|---|---|
| 3 | Ingest the patch from the session transcript | 2 | sonnet · medium | ≈$1.15 |
| | **Total** | | | **≈$9.40** |

3. **The notes** — which tasks are startable now, and any sizing you were unsure about.

4. **The ask** — end with one direct question: which way now? The options are exactly these three:
   - **adjust models** — re-size any task's model or effort
   - **adjust tasks** — add, remove, merge, re-scope, re-wire dependencies, or change the mode
   - **start the work** — hand the list to `team8:run` in the stated mode

   Ask it with `AskUserQuestion` where the harness provides that tool (one question, multiSelect on — edits and then starting is a normal combination); otherwise as a plain-text question. Do not invoke `run` until the user picks it.

## Mode: read it off the graph

The task list decides how it runs, not the plan and not habit. Four modes,
matching the console's: solo, subagents, teammates, workflow. Derive it from
the tracks and the task shapes, state it with its reason in the notes, and let
the user override it in the ask. `team8:run` executes whichever was chosen.

A track is a group of tasks whose files no other group touches. Count them
first.

| The graph says | Mode | Why |
|---|---|---|
| One task, or two you would finish in the next few tool calls | **solo** | Spawning costs more than the work. The lead does it, TDD, one commit |
| A peak of 1 — one track, or several that never share a wave — and at least one task is judgment or needs the lead's answers mid-way | **subagents** | Nothing runs in parallel and nobody needs a mailbox. A fresh subagent per task, the lead reviews each diff, keeps control and its own context |
| Two or more tracks in the same wave — a peak of 2 or more | **teammates** | Parallel writers in one checkout need file ownership, a shared branch, messaging and a track review. That is what a team is |
| Five or more tasks of the same shape — same mechanical edit across files, a review per PR, a fan-out with a verify step — with no judgment call between them | **workflow** | Deterministic fan-out and pipeline beat a lead improvising the same dispatch nine times. Needs the user's opt-in in their own words; recommend it, do not assume it |

Ties break upward: solo before subagents, subagents before teammates, unless
the graph has two tracks that genuinely run at once. Teammates before
workflow whenever a task needs judgment between steps. A batch that mixes
shapes takes the mode of its hardest part.

**Tracks are not parallelism.** A track is who owns which files; a wave is
who is running at the same time. Wave 1 is every track whose first task has
no blocker. Wave N+1 is every track whose first task is unblocked once wave N
closes. The peak is the largest wave, and it is the number of teammates the
user is paying for at once. Four tracks that run 1, then 2, then 1 is a peak
of 2, and the closing says so.

Write the mode as the first line of the closing, then the waves:

```
mode: teammates — 4 tracks in 3 waves, peak 2 at once
wave 1: A (tasks 1, 2)
wave 2: B (3) ∥ C (4, 5, 6) — after task 1
wave 3: D (7) — after 4, 5, 6
```

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
| mechanical | ≈$0.20 | ≈$0.35 | ≈$0.85 |
| standard | ≈$0.60 | ≈$1.15 | ≈$2.90 |
| judgment | ≈$1.05 | ≈$2.10 | ≈$5.30 |

**Effort factor:**

| low | medium | high | xhigh | max |
|---|---|---|---|---|
| ×0.7 | ×1 | ×1.3 | ×1.7 | ×2.2 |

Estimate = base cell × effort factor. Effort buys thinking, and thinking is
output, the expensive class; it also buys more tool calls per task, which is
why the factor climbs faster than the output share alone. Sum for the total.
Always draw the figures with `≈$`: they are list price, not a bill.

The sizing table's defaults price as: mechanical · haiku · low ≈$0.15,
standard · sonnet · medium ≈$1.15, judgment · opus · high ≈$6.90. An
escalated judgment task, opus · xhigh, is ≈$9.00.

Behind the cells, one teammate working one task, most of its context served
from cache: mechanical ≈ 15 turns at 40k context (0.6M cache-read, 8k output,
60k written or uncached); standard ≈ 40 turns at 70k (2.8M, 25k, 140k);
judgment ≈ 60 turns at 100k (6M, 40k, 210k). Priced at `catalog.json` rates
as of 2026-09 (haiku 1/5, sonnet 2/10, opus 5/25 USD per million in/out;
cache read a tenth of input).

**Calibrate from the console, not from this table.** After a batch, the usage
view's cost per task is the real number for this repo. When it disagrees with
a cell by more than half, change the cell; when every cell at one effort is off
in the same direction, change the factor instead.

## Common mistakes

| Mistake | Fix |
|---|---|
| One model for the whole list | Model is per-task. A list of nine usually spans two or three tiers. |
| Mode left implicit, or left to `run` | It is part 1 of the closing. Read it off the tracks and say it with its reason. |
| Teammates by habit for a one-track list | One track is subagents. Count the tracks before naming the mode. |
| "4 tracks" read as 4 teammates | Tracks own files; waves run. Say the peak, and list the waves. |
| Chaining every task 1→2→3→4 | Per blocker, ask: what output does the blocked task read? No answer, no blocker. |
| Sizing by diff size | Size by decisions. Bulk is cheap; a small ambiguous change is not. |
| Descriptions pointing at the conversation | The executing agent can't see it. Inline the values. |
| A decision buried in an implementation task | Split it: one judgment task, one mechanical task. |
| Splitting so fine tasks only make sense together | If a description can't stand alone, merge it back. |
