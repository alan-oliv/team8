# The lead writes the plan, and the console shows it being written

## Why

The two runs that used the planner and reviewer teammates (arco `minor-391`,
theword) were both cut short by the user. In 391 the lead received nothing for
13 minutes and then 6 minutes while the teammates talked peer to peer, and the
planner's first message to the lead came 42 minutes after it was spawned.
Planning took 54 minutes and about $34, against about $16 to run the result.
The planners also built and ran the code they were planning (12 Swift files,
a scratch backend with 19 tests) before sending the plan for review.

Superpowers 6.3.0, which `writing-plans.md` is copied from, removed its own
subagent plan review in v5.0.6: it doubled planning time with no measurable
quality gain across 5 versions × 5 trials, and an inline self-review caught
3-5 real bugs per run in about 30 seconds.

## Decision

Planning moves into the lead's session, as superpowers does it. team8 keeps
what superpowers lacks: tracks, the task list, the approval table with its cost
estimate, and parallel execution in `team8:run`. The console gets a plan tab
that shows the plan being written, with a progress bar.

Planning is solo: the lead works alone, with no teammates or subagents, until
it presents the task table. The run's mode (solo, subagents, teammates or
workflow) is then recommended from the task list by `team8:tasks` Mode, as
today, and the user can override it.

## Part 1: the plan skill

Phase 1 (brainstorm) and Phase 3 (approve) keep their shape. Phase 2 changes:

1. Cut the batch branch and open the run log, as today.
2. The lead reads `writing-plans.md` and writes the plan itself:
   - **Skeleton, one Write:** header, Global Constraints, file structure, and
     every task's `### Task N: <title>` heading with its `Files` and
     `Interfaces` blocks. No steps.
   - **One Edit per task, in order,** adding that task's steps. After each,
     one line to the user: `Plan ▓▓▓░░░░ 3/7 · Task 3: <title>`, one cell per
     task.
3. Self-review inline: superpowers' three checks (spec coverage, placeholder
   scan, type consistency), fixed in place.
4. Tracks and `TaskCreate` at the end, as today, then two more checks before
   the approval table, because tasks run in parallel in one checkout. Both
   fixes touch the task list only, never the plan:
   - two tracks own the same file → put both tasks in one track, in order;
   - a task consumes another task's output without blocking on it → add the
     blocker with `TaskUpdate addBlockedBy`.

New rule, stated in both `SKILL.md` and `writing-plans.md`: **code in the plan
is written, not run.** No builds, prototypes or scratch code. If a step rests
on something unproven, the lead asks the user; settling it is a spike in
Phase 1, not work in Phase 2.

Removed: the planner and reviewer dispatches, the checkpoints, the relay rules,
the reviewer's nine checks, and "Ask both teammates to stop" in Phase 3.

Files:
- `plugin/skills/plan/SKILL.md`: description, overview, the Phase 1 → 2
  transition (checklist step, dot graph, closing line), Phase 2 rewritten as
  above, Phase 3 step 1 removed, the run log template's `planner:` and
  checkpoint lines, and Common Mistakes (the "Lead writes the plan itself" row
  reversed; planner and reviewer rows removed; rows added for writing the whole
  plan in one Write and for running plan code).
- `plugin/skills/plan/writing-plans.md`: "Checkpoints With the Reviewer"
  becomes "Writing in Pieces" (skeleton, then one Edit per task, the progress
  line); the parallel checks and their fixes go at the end of "Create the
  Tasks". The text copied from superpowers stays as it is.
- `README.md`: the `team8:plan` paragraph.

Run log template, Plan section:
- `planner: opus · high · reviewer: opus · high` becomes
  `plan: written by the lead · self-review fixes: <n>`.
- The checkpoint line is dropped.

Not changed: `team8:run`, `team8:tasks`.

## Part 2: the console plan tab

**Finding the plan (server).** The plan is the file the lead itself wrote: at
the publish boundary (`src/server/index.ts`, where `mode` and `workflows` are
layered on), take the newest `file_path` among the lead's own `Write` and
`Edit` calls in the stored transcript events that matches
`/docs/team8/plans/[^/]+\.md$`, and read that file. The path is absolute, so no
folder lookup is needed, and a plan written by another session in the same
folder is never picked up. The store keeps 1,000 transcript records per agent
(`src/server/store.ts`), so the path is remembered per lead session once seen,
and the tab survives those records aging out. `publish` is synchronous, so the
read uses sync fs calls and re-reads the file only when its mtime changes.

Known shortcut: a server restart after the plan's writes have aged out of the
store loses the tab. By then the plan has long been approved. Marked in code
with a `ponytail:` comment.

**Reading it.** A task is a line matching `^### Task (\d+): (.+)$`. Its section
runs to the next such heading or the end of the file. It is *written* when its
section has a line matching `^- \[[ x]\] \*\*Step`. Text before the first task
is ignored.

**On the wire.** `TeamState.plan?: PlanProgress`, where
`PlanProgress = { path: string; mtime: number; tasks: Array<{ n: number; title: string; written: boolean }> }`.
It is absent when the lead has written no plan. Section text is not in the
frame; one task's section comes from `GET /api/plan-task?n=<n>`, built like
`/api/line` in `src/server/http.ts`: 400 without `n`, 404 when there's no plan
or no such task.

**The tab (web).** `plan` joins the view switcher of the solo and team layouts
whenever `state.plan` exists, and not the workflow layout: workflow mode starts
only after approval, when every task is written. `src/web/views/Plan.tsx`:
- a strip in the Tasks progress strip's style: `PLAN`, the percentage, `3 of 7
  tasks written`, the plan's path, and a one-segment bar;
- one row per task: `N`, the title, `outlined` or `written`;
- clicking a row fetches its section and shows it below the row as monospace
  text; clicking again closes it; an open section is fetched again when
  `mtime` changes, so a task you opened while outlined fills in as it's
  written;
- a plan with no task headings yet shows the strip at `0 of 0` and no rows.

## Testing

- **Plan reader** (unit): headings and titles; written versus outlined,
  including `[x]`; text before the first task ignored; no headings.
- **Finding the plan** (unit): the path comes from the lead's newest `Write`
  or `Edit` under `docs/team8/plans/`; another agent's writes and other paths
  are ignored; the path is still known after those records are dropped; no
  such call means no `plan`.
- **Endpoint**: a task's section; 400 without `n`; 404 for an unknown task and
  for no plan.
- **`Plan.tsx`**: the percentage and count; each row's state; a click opens
  and closes the section; an open section is fetched again when `mtime`
  changes.
- **`App.tsx`**: `plan` is offered in the solo and team layouts only when
  `state.plan` exists, and never in the workflow layout.
- `npm test` and the typecheck pass; `plugin/dist` rebuilt.
- **The skill**, in one fresh-session `/team8:plan` on a small change:
  - a progress line after every task;
  - the console bar counts up as tasks are written;
  - no code written outside the plan file;
  - no teammate or subagent spawned before the task table;
  - planning takes a fraction of 391's 54 minutes.
