# Run log — team8 measure (speed PR 0)

spec: docs/team8/specs/2026-09-30-team8-speed-design.md (section 0)
plan: docs/team8/plans/2026-09-30-team8-measure.md
branch: measure
pr: https://github.com/alan-oliv/team8/pull/35

## Brainstorm
- path: architectural. Six PRs from the 2026-09-29 delay log; this is PR 0, the ruler the other five are measured with
- spec rounds with the user: 2. The six-PR split and targeted tests were approved first; the written spec was approved after an explanation round
- spike: message delivery to a busy teammate. A probe sent at 05:08:14 stayed unread through 15 tool calls and arrived at 05:12:17, at turn end. It shapes PR 2, not this one

## Plan
- plan: written by the lead · self-review fixes: 3
  - Task 4 was missing cli.test.ts from its file list;
  - the acceptance moved from session totals to per-agent numbers across two sessions, because the delay log's totals mix d4dc7fd4 and 6f91f486;
  - the spec's three-way idle split and loose idle-with-work definition were aligned with what the plan builds
- tasks: 4 (#9 traces, #10 attribution, #11 lag, tails and idle-with-work, #12 report, CLI and commands) · tracks: 1 · waves: 4 · peak: 1 at once · mode: subagents, a chain where each task imports the types the one before it produces
- checks: tracks disjoint · blockers complete
- estimate: ≈$13.35 (#9 opus · high ≈$6.90, #10–#12 sonnet · medium ≈$2.15 each), at list price. Every agent will actually run at the session's max effort until PR 1 lands, so expect about 2–4× this

## Run
- executors, one at a time (subagents mode), all at the session's max effort because PR 1 isn't in yet:
  - executor-9 · opus · #9
  - executor-10 · sonnet · #10
  - executor-11 · sonnet · #11
  - executor-12 · sonnet · #12
- track reviews:
  - #9: 2 rounds with an opus reviewer. 1 Blocking (a resumed session counted its parent's copied history) and 2 Minors, then 1 comment Minor
  - #10: 1 round with a sonnet reviewer. 0 Blocking; 2 Minors fixed (tool-start ties, inverted calls), lead-checked
  - #11: 2 rounds with a sonnet reviewer. 1 Blocking (task ids reused across batches) and 2 Minors
  - #12: 1 round with a sonnet reviewer. 1 Blocking (the CLI always exited 0) and 1 Minor, lead-checked
- residuals, 3 Minors, not fixed:
  - a command that mentions a background job's output file is filed under that job's kind, even without a poll loop;
  - an addBlockedBy recorded before its task exists is dropped (it never occurs in real data);
  - a plain subagent resumed with SendMessage isn't counted in message lag
- acceptance on the 2026-09-29 sessions:
  - model minutes: player 53.2/53, voices 49.7/50, splash 23.5/23, waves 33.1 + 7.2 in 6f91f486 = 40.3/40;
  - 22 of 22 lead message lags match;
  - sidebar #21 idle with work waiting 101.7/102;
  - full suite: 100 files, 2279 passed
- actual, from `measure --since` the plan commit:
  - executors ≈$21.86 (9 ≈$11.30, 10 ≈$1.72, 11 ≈$4.17, 12 ≈$4.67);
  - reviewers ≈$15.88 (9 ≈$10.61, 10 ≈$1.12, 11 ≈$2.87, 12 ≈$1.28);
  - total ≈$37.74 plus the lead's share, since measure reports the lead's cost for its whole session
- estimate vs actual: ≈$37.74 against ≈$13.35, 2.8×. Every subagent ran at max: Opus a median 9.2 s a call (p90 39.6), Sonnet 6.1 s (p90 57.0). That is PR 1's baseline
- wall time: 147 min from the plan commit to the PR. Executors took 49, 20, 41 and 29 min, reviewers 41, 10, 38 and 11, all run one at a time
- went wrong / change next time:
  - the reviews' real-data probes caught four gaps in the plan's own code (resumed sessions, reused task ids, tool-start ties, the exit code); keep asking reviewers to run the code on real transcripts
  - the first opus review took 22 min at max
  - one test I specified couldn't fail on the old code; ask for the failing case first
