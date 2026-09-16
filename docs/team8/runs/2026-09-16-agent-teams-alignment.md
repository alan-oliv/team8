# Run log — agent-teams alignment

spec: docs/team8/melhorias-agent-teams.md (the improvements read off the Claude Code agent-teams doc, with the day's measurements)
plan: none · tasks from the user via team8:tasks
branch: agent-teams-alignment
pr: <filled at close>

## Brainstorm
- path: bounded
- origin: the user asked what team8 should change given https://code.claude.com/docs/en/agent-teams; eight points, ranked by payoff, one of them (TeammateIdle) dropped after reading the hook payloads — an idle teammate already wakes on a message, and blocking idle would loop it
- spec rounds with the user: 1

## Plan
- plan: none · tasks written from the doc: hooks, cache TTL and force-flag warning, the run and tasks skills, two agent definitions
- tasks: 4 · tracks: 3 · waves: 1 · peak: 3 at once · mode: teammates — disjoint files, all three from the start; A's two tasks share setup.ts so one teammate ran them in order
- estimate: ≈$10.35 (#6 sonnet·medium ≈$1.15 · #7 sonnet·medium ≈$1.15 · #8 opus·high ≈$6.90 · #9 sonnet·medium ≈$1.15)

## Run
- executors:
  - hooks · sonnet · medium · track A (tasks 6, 7) · wave 1
  - skills · opus · high · track B (task 8) · wave 1
  - agents · sonnet · medium · track C (task 9) · wave 1
  - peak 3 at once
- track reviews:
  - A: task 6 1/3 rounds, clean, 2 Minor dismissed (the "deletes the task" comment is what the hooks reference says; the two scripts' shared dozen lines have no helper file to live in) · task 7 1/3 rounds, clean, 1 Minor deferred
  - B: 3/3 rounds · round 1: 3 Blocking + 5 Minor from the reviewer, plus 2 Blocking from the lead (owner set after the spawn re-delivers the task as an assignment, seen twice; commit by pathspec after a bare commit swept a neighbour's staged files) · round 2: all addressed, 1 new Blocking (a pathspec commit cannot see untracked files: `git add` new files by name first) + 2 Minor · round 3: clean, the lead ruled it accepted; the executor reproduced both git failures in a scratch repo before fixing
  - C: 1/3 rounds · 2 Blocking (unquoted second colon in both YAML descriptions; Claude Code's loader tolerated it, PyYAML did not) + 1 Minor, all fixed and proven by a strict parse; two follow-up lines for the commit rule
  - residuals: 0 Blocking
- minor findings, deferred:
  - A: src/server/setup.ts, `SettingsBackup.subagentPromptCacheTtl` is typed required while a pre-upgrade backup file on disk lacks it; the read site guards it at runtime
- actual: ≈$28.30 for this batch (session frame ≈$61.34 minus the earlier batch's ≈$33.04) · executors ≈$10.14 (hooks ≈$3.47, skills ≈$5.29, agents ≈$1.38) · reviewers ≈$2.24 (review-skills ≈$1.22, review-hooks ≈$0.83, review-agents ≈$0.19) · lead ≈$15.91. From the console's frame at close
- estimate vs actual: executors ≈$10.14 against ≈$10.35. hooks ran two tasks for ≈$3.47 against ≈$2.30; skills ≈$5.29 under its ≈$6.90 cell across three rounds; agents ≈$1.38 against ≈$1.15. The estimate never counts the lead or the reviewers, ≈$18.15 here
- went wrong / change next time:
  - the lead dictated a git command (`git commit -- <paths> -m`) without running it; two rounds of review were spent on it. Any command that goes into a skill gets run once before it is written down
  - the lead read a superseded commit twice while a teammate's next commit had already landed; check HEAD, not the hash in the notes
  - the task list pruned itself the moment every task reached completed, before the reviews were done, so round-3 `verified` metadata had nowhere to go. Reviews should either finish before the last completion or the run log is the record, as here
  - the first commit of one teammate swept another's staged files: the pathspec rule now in the skill and the executor definition
- terminal deliverable: open PR against main, plugin bumped to 1.0.29, dist rebuilt; not merged — the user tests the branch first
