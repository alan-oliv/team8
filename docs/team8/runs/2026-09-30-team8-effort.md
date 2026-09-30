# Run log — team8 effort per role (speed PR 1)

spec: docs/team8/specs/2026-09-30-team8-speed-design.md (section 1)
plan: docs/team8/plans/2026-09-30-team8-effort.md
branch: effort
pr: https://github.com/alan-oliv/team8/pull/36

## Brainstorm
- path: architectural (PR 1 of the six-PR speed program; the spec was approved on 2026-09-30)
- spec rounds with the user: 0 for this PR. It is built as the approved spec's section 1 has it
- baseline, from PR 0's own batch measured with `measure`: every subagent ran at the session's max effort, with Opus a median 9.2 s a call (p90 39.6) and Sonnet 6.1 s (p90 57.0). The delay log had Opus at max at 13.8 s mean against 7.1 s at medium

## Plan
- plan: written by the lead · self-review fixes: 1 (Task 1's verify step ran the whole suite; executors run only their covering tests)
- tasks: 2 (#1 definitions, generator and dispatch text; #2 the bench scenario, run before and after) · tracks: 1 · waves: 2 · peak: 1 at once · mode: subagents, since #2 measures what #1 builds
- checks: tracks disjoint · blockers complete
- estimate: ≈$4.30 (two sonnet · medium tasks at ≈$2.15). The executors themselves still run from the installed team8:executor, which sets no effort, so they inherit this session's max; expect about 2–3×

## Run
- executors, one at a time (subagents mode):
  - executor-1 · sonnet · #1
  - executor-2 · sonnet · #2
  - both recorded medium effort: this session had moved to xhigh by the time this batch ran, and its Sonnet subagents record medium under it
- track reviews:
  - #1: 1 round with a sonnet reviewer, 0 findings
  - #2: lead-checked, one bench.md file; 2 text fixes (the setup note, and the pass mark for haiku)
- residuals: none
- bench effort, headless at --effort max:
  - before, executor and reviewer record max;
  - after, executor-low/executor/executor-high/executor-xhigh/reviewer/reviewer-light record low/medium/high/xhigh/high/medium;
  - haiku records no effort and runs fine;
  - --plugin-dir alone loads the branch's plugin over the installed team8
- full suite: 101 files, 2285 passed; typecheck clean
- actual, from `measure --since` the plan commit: executors ≈$1.10 (executor-1 ≈$0.47, executor-2 ≈$0.63), reviewer ≈$0.26, total ≈$1.36
- estimate vs actual: ≈$1.36 against ≈$4.30. Sonnet at medium took a median 3.0 s a call (p90 7.6), against 6.1 s (p90 57.0) at max in PR 0's batch
- wall time: #1 1.2 min, its review 1.3 min, #2 8.4 min including the two headless runs
- went wrong / change next time:
  - #2 sent an after-prompt that wasn't the plan's verbatim text; it still spawned the right seven, so it wasn't rerun
  - one headless run was wasted, a before-prompt against the branch plugin
