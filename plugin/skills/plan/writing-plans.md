# Writing Plans

## Overview

Write comprehensive implementation plans assuming the engineer has zero context for our codebase and questionable taste. Document everything they need to know: which files to touch for each task, code, testing, docs they might need to check, how to test it. Give them the whole plan as bite-sized tasks. DRY. YAGNI. TDD. Frequent commits.

Assume they are a skilled developer, but know almost nothing about our toolset or problem domain. Assume they don't know good test design very well.

**Announce at start:** "I'm using team8:plan's writing-plans to create the implementation plan."

**Context:** The batch branch is already checked out by the lead. Do not create branches or worktrees.

**Save plans to:** `docs/team8/plans/YYYY-MM-DD-<feature-name>.md`
- (User preferences for plan location override this default)

## Scope Check

If the spec covers multiple independent subsystems, it should have been broken into sub-project specs during brainstorming. If it wasn't, suggest breaking this into separate plans — one per subsystem. Each plan should produce working, testable software on its own.

## File Structure

Before defining tasks, map out which files will be created or modified and what each one is responsible for. This is where decomposition decisions get locked in.

- Design units with clear boundaries and well-defined interfaces. Each file should have one clear responsibility.
- You reason best about code you can hold in context at once, and your edits are more reliable when files are focused. Prefer smaller, focused files over large ones that do too much.
- Files that change together should live together. Split by responsibility, not by technical layer.
- In existing codebases, follow established patterns. If the codebase uses large files, don't unilaterally restructure - but if a file you're modifying has grown unwieldy, including a split in the plan is reasonable.

This structure informs the task decomposition. Each task should produce self-contained changes that make sense independently.

## Task Right-Sizing

A task is the smallest unit that carries its own test cycle and is worth a
fresh reviewer's gate. When drawing task boundaries: fold setup,
configuration, scaffolding, and documentation steps into the task whose
deliverable needs them; split only where a reviewer could meaningfully
reject one task while approving its neighbor. Each task ends with an
independently testable deliverable.

## Bite-Sized Task Granularity

**Each step is one action (2-5 minutes):**
- "Write the failing test" - step
- "Run it to make sure it fails" - step
- "Implement the minimal code to make the test pass" - step
- "Run the tests and make sure they pass" - step
- "Commit" - step

## Plan Document Header

**Every plan MUST start with this header:**

```markdown
# [Feature Name] Implementation Plan

> **For agentic workers:** this plan is executed by teammates that `team8:run` dispatches from the shared task list. Read your own task section. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

**Spec:** [path to the spec/design doc this plan implements — the plan
argues from the spec, so the spec travels with it; executors read both]

## Global Constraints

[The spec's project-wide requirements — version floors, dependency limits,
naming and copy rules, platform requirements — one line each, with exact
values copied verbatim from the spec. Every task's requirements implicitly
include this section.]

---
```

## Task Structure

````markdown
### Task N: [Component Name]

**Files:**
- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py:123-145`
- Test: `tests/exact/path/to/test.py`

**Interfaces:**
- Consumes: [what this task uses from earlier tasks — exact signatures]
- Produces: [what later tasks rely on — exact function names, parameter
  and return types. A task's implementer sees only their own task; this
  block is how they learn the names and types neighboring tasks use.]

- [ ] **Step 1: Write the failing test**

```python
def test_specific_behavior():
    result = function(input)
    assert result == expected
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/path/test.py::test_name -v`
Expected: FAIL with "function not defined"

- [ ] **Step 3: Write minimal implementation**

```python
def function(input):
    return expected
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/path/test.py::test_name -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/path/test.py src/path/file.py
git commit -m "feat: add specific feature"
```
````

## No Placeholders

Every step must contain the actual content an engineer needs. These are **plan failures** — never write them:
- "TBD", "TODO", "implement later", "fill in details"
- "Add appropriate error handling" / "add validation" / "handle edge cases"
- "Write tests for the above" (without actual test code)
- "Similar to Task N" (repeat the code — the engineer may be reading tasks out of order)
- Steps that describe what to do without showing how (code blocks required for code steps)
- References to types, functions, or methods not defined in any task

## Self-Review

After writing the complete plan, look at the spec with fresh eyes and check the plan against it. This is a checklist you run yourself — not a subagent dispatch.

**1. Spec coverage:** Skim each section/requirement in the spec. Can you point to a task that implements it? List any gaps.

**2. Placeholder scan:** Search your plan for red flags — any of the patterns from the "No Placeholders" section above. Fix them.

**3. Type consistency:** Do the types, method signatures, and property names you used in later tasks match what you defined in earlier tasks? A function called `clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug.

If you find issues, fix them inline. No need to re-review — just fix and move on. If you find a spec requirement with no task, add the task.

## Checkpoints With the Reviewer

Everything above is how the plan is written. This is where team8 deviates:
the plan is reviewed by a teammate as it takes shape, and it ends as tasks on
the shared list, not as an execution choice.

**Checkpoint 1 — skeleton.** Save the plan as soon as the header, Global
Constraints, the file structure, and every task's `Files` and `Interfaces`
blocks exist, with no steps yet. Message **reviewer**: the plan path and the
spec path. Keep writing the steps while reviewer reads; fold its findings in
as they arrive.

**Checkpoint 2 — full plan.** When every step is written, the self-review is
done, and the tasks exist (below), message reviewer the task count. Reviewer
sends findings labelled Blocking or Minor. Fix every Blocking one in both the
plan and the task list, take or leave the Minor ones, append one line to the
bottom of the plan — `Round N: <what changed, what was left and why>` — and
message reviewer again. Three rounds at most; after that the lead rules.

## Create the Tasks

The plan file carries the detail. The shared task list carries the delegation
contract. Both are yours, written in the same pass, and they match one to one.

**Tracks first.** `team8:run` hands each track to one teammate, and teammates
run in parallel in one shared checkout, so isolation comes from file
ownership and nothing else. Group the plan's tasks into tracks before
creating them:

- A file belongs to exactly one track. Two tasks that edit the same file are
  in the same track, in order. No exceptions for "just one line".
- A task that reads another task's output (a type, a route, a field, a
  decision) is either later in the same track, or in a track that starts
  after the producer's track finishes. Say which, with `blockedBy`.
- Fewest tracks that keep files disjoint. A three-track list with one shared
  file is a merge conflict; a one-track list is fine.
- Verification tasks belong to the track that can break them.

Invoke `team8:tasks` — its contract applies to every task. One `TaskCreate` per
plan task, same order, same subject. The description stands alone; it never
points at a conversation. It carries:

- the goal in one sentence
- the plan path and the task number: "Read `docs/team8/plans/<file>.md`, Task N,
  first — it is your requirements, with the exact values to use verbatim"
- the track, the files this task owns, and the files it must not touch
- the interfaces it consumes and produces, copied from the task section

```json
{"subject": "Add the diff payload to the shared domain model",
 "description": "Goal: TranscriptLine carries an optional diff so later tasks can render it.\nRead docs/team8/plans/2026-09-11-diff-viewer.md, Task 1, first — it is your requirements, with the exact values to use verbatim.\nTrack A. You own src/shared/domain.ts and src/shared/domain.test.ts. Do not touch src/web/.\nProduces: `DiffPayload = { path: string; hunks: Hunk[] }`, exported from src/shared/domain.ts. Consumes: nothing.",
 "metadata": {"complexity": "judgment", "model": "opus", "effort": "high",
              "why": "shape is a contract two later tasks consume"}}
```

Then `TaskUpdate` each task's `blockedBy` — real dependencies only, the blocked
task reads something the blocker produces — and its `metadata`
`{ complexity, model, effort, why }`, sized by decisions required, not lines
changed. A task missing `metadata` is not created.
