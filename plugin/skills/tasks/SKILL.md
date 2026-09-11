---
name: tasks
description: Use when breaking work into tasks — a feature, a migration, a review's findings, a plan — or when the user asks to make a task list, break something down, split work up, or turn analysis into tasks. Also when work is about to be handed to teammates or subagents.
---

# Tasks

## Overview

A task list is a delegation contract, not a to-do list. Each task gets picked up by an agent with **none of this conversation's context**, possibly in parallel with its siblings, possibly on a different model. That needs three things: a description that stands alone, dependencies that are real, and a model sized to the task.

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

## After creating: the table, the notes, the ask

The closing message has three parts, in this order. A message that stops after part 2 leaves the contract unsigned — part 3 is what turns the list into a decision.

1. **The table** — dependency, model and estimate columns, so the user can override before anything runs, and a total row:

| # | Task | Blocked by | Model | Est. |
|---|---|---|---|---|
| 3 | Ingest the patch from the session transcript | 2 | sonnet · medium | ≈$1.15 |
| | **Total** | | | **≈$9.40** |

2. **The notes** — which tasks are startable now, and any sizing you were unsure about.

3. **The ask** — end with one direct question: which way now? The options are exactly these three:
   - **adjust models** — re-size any task's model or effort
   - **adjust tasks** — add, remove, merge, re-scope, or re-wire dependencies
   - **start the work** — hand the list to `team8:run`

   Ask it with `AskUserQuestion` where the harness provides that tool (one question, multiSelect on — edits and then starting is a normal combination); otherwise as a plain-text question. Do not invoke `run` until the user picks it.

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
| Chaining every task 1→2→3→4 | Per blocker, ask: what output does the blocked task read? No answer, no blocker. |
| Sizing by diff size | Size by decisions. Bulk is cheap; a small ambiguous change is not. |
| Descriptions pointing at the conversation | The executing agent can't see it. Inline the values. |
| A decision buried in an implementation task | Split it: one judgment task, one mechanical task. |
| Splitting so fine tasks only make sense together | If a description can't stand alone, merge it back. |
