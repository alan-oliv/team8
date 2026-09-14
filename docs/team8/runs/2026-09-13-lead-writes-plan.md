# Run log — the lead writes the plan

spec: docs/team8/specs/2026-09-13-lead-writes-plan-design.md
plan: docs/team8/plans/2026-09-13-lead-writes-plan.md
branch: lead-writes-plan
pr: https://github.com/alan-oliv/team8/pull/17

## Brainstorm
- path: architectural
- origin: systematic debugging of the planner and reviewer teammates (arco minor-391, theword): silence while they talked peer to peer, planners building the code they planned
- spec rounds with the user: 5 (where the plan is found, the folder for a session with no team, solo planning, the plan tab's layouts, the Jira and Linear entry point)

## Plan
- plan: written by the lead, a task at a time with a progress line, by hand ahead of the skill change · self-review fixes: 3 (two missing test files in Tasks 4 and 5, a StatusBar prop that wasn't needed, a test count) · the parse check found one more: task headings inside fenced code counted as tasks, fixed in Task 3
- tasks: 6 · tracks: 4 · waves: 3 · peak: 3 at once · mode: teammates — A (1, 2) ∥ B (3, 4) from the start, C (5) after task 3, D (6) after 4 and 5
- estimate: ≈$4.90 (#1 sonnet ≈$1.15 · #2 haiku ≈$0.15 · #3 sonnet ≈$1.15 · #4 sonnet ≈$1.15 · #5 sonnet ≈$1.15 · #6 haiku ≈$0.15)

## Run
- timing: the plan took ≈12 min from the approved spec (21:01) to its commit (21:13), plus 3 min for the fenced-code fix; 391's planner and reviewer took 54. The run took ≈10 min from the run log (21:55) to the last rebuild (22:05), reviews and one fix round included
- executors:
  - skills · sonnet · medium · track A (tasks 1, 2) · wave 1
  - server · sonnet · medium · track B (tasks 3, 4) · wave 1
  - web · sonnet · medium · track C (task 5) · wave 2, after task 3
  - build · haiku · low · track D (task 6, rebuilt twice) · wave 3
  - peak 3 at once
- track reviews:
  - A: 1/3 rounds, clean, no findings
  - B: 1/3 rounds, clean, 3 Minor
  - C: 1/3 rounds, clean. One Minor sent back anyway because it's an accessibility basic: the plan-row button had no `aria-expanded`; fixed in 54b6692 with assertions for both states, checked by the lead
  - D: checked by the lead instead of a reviewer: both commits touch only plugin/dist, and a rebuild at aa47f43 reproduces it byte for byte
  - residuals: 0 Blocking
- minor findings, deferred:
  - B: src/server/index.ts, the `?? team.agents[0]` fallback is unreachable, since every roster has an `isLead` agent
  - B: src/server/plan.ts, `known` in createPlanReader grows one entry per session for the life of the server
  - B: src/server/plan.ts, planPathOf adds a pass over the stored events on every publish (up to 4 Hz), with no comment on what that costs
  - C: src/web/views/Plan.test.tsx, no test for switching rows before the first fetch resolves, or for a failed fetch; the code guards both
- actual: ≈$14.13 · executors ≈$4.00 (skills ≈$1.12, server ≈$1.66, web ≈$1.05, build ≈$0.17) · reviewers ≈$1.94 (three reviews ≈$1.38, two helper subagents the reviewers spawned ≈$0.56) · lead ≈$8.19, counted from the batch start. Priced from the transcripts at catalog.json rates, because the console followed another session the whole run
- estimate vs actual: executors ≈$4.00 against ≈$4.90. Every standard · sonnet · medium task landed under its ≈$1.15 cell (server ≈$0.83 a task, web ≈$1.05), and the haiku rebuild matched its ≈$0.15 cell. The estimate never counts the lead or the reviewers, ≈$10.13 here
- went wrong / change next time:
  - the lead cost twice the executors again: this session carried the whole day, from the debugging through the spec and the plan. Start `/team8:plan` in a fresh session
  - every teammate got its task_assignment notices twice even though the teammates claimed their own tasks, so the last log's cause (the lead setting owners) was wrong. The harness echoes a claim back
  - the console followed another session the whole run, so run's cost snippet could not price this batch, the second time in a row. The snippet should not assume the console follows the batch
  - running the tab's own parse rules over the plan before dispatch caught task headings inside fenced code being counted as tasks. Worth keeping: check that a plan reads as the console reads it before creating the tasks
