# Run log — splash animation

spec: none (bounded path; design approved in chat)
plan: docs/team8/plans/2026-09-18-splash-animation.md
branch: splash-animation
pr: https://github.com/alan-oliv/team8/pull/22

## Brainstorm
- path: bounded
- spec rounds with the user: 1

## Plan
- plan: written by the lead · self-review fixes: 2
- tasks: 3 · tracks: 1 · waves: 3 · peak: 1 at once · mode: subagents — one track, every task standard, each consumes the previous one's output
- estimate: ≈$3.45 (per task in the plan's table)

## Run
- executors: splash-1 · sonnet · medium · track A · wave 1; splash-2 · sonnet · medium · track A · wave 2; splash-3 · sonnet · medium · track A · wave 3 · peak 1 at once
- track reviews: A 2/3 rounds (task 1: 1 round, clean; task 2: 1 round, two minor notes: no StrictMode render in the tests, no early-unmount cancel assertion; task 3: 2 rounds, one Blocking: the splash remounted and restarted when the first snapshot swapped the shell, fixed by giving all three returns the same fragment shape with the splash as the second child, plus a regression test) · residuals: 0
- actual: ≈$21.25 · per agent: team-lead ≈$17.37, splash-1 ≈$0.66, review-1 ≈$0.31, splash-2 ≈$0.53, review-2 ≈$0.46, splash-3 ≈$1.04, review-3 ≈$0.88
- estimate vs actual: executors ≈$2.23 against ≈$3.45 estimated; reviewers ≈$1.65 and the lead ≈$17.37 were not in the estimate
- went wrong / change next time: the plan's Task 3 mounted the splash inside three differently shaped shells, so it remounted on the first snapshot; a plan that mounts something across branches should put it at a stable sibling slot, and its test should cross the branch swap
- went wrong / change next time: executors 1 and 2 were left idle after their reviews cleared; send "track clear, stop" right after each review, not at the end
