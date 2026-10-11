# Run log — team8 message delivery to busy teammates (speed PR 2)

spec: docs/team8/specs/2026-09-30-team8-speed-design.md (section 2)
plan: docs/team8/plans/2026-09-30-team8-delivery.md
branch: delivery
pr: <at close>

## Brainstorm
- path: architectural (PR 2 of the six-PR speed program; the spec was approved on 2026-09-30)
- spikes, both 2026-09-30:
  - a probe sent 5 s into a teammate's turn stayed unread through all 15 of its tool calls, and arrived 4 min 3 s later at turn end;
  - of two entries written into a busy teammate's inbox, one `read: true` and one `read: false`, only the unread one arrived at turn end, and the inbox was then pruned
- spec updated from the spikes: the inbox is found through the teammate's meta.json `teamName` (after a resume the team's leadSessionId no longer matches); the hook is a bundled TypeScript entry, not a bin script
- baseline: the delay log's message lag, median 23 min and max 75

## Plan
- plan: written by the lead · self-review fixes: 0
- tasks: 3 (#3 the hook; #4 measure reads early deliveries; #5 the bench scenario, run before and after)
- tracks: 2 (A: src/hooks, package.json, hooks.json, then .claude/bench; B: measure's trace.ts) · waves: 2 (A #3 ∥ B #4, then A #5) · peak: 2 at once
- mode: teammates, since #3 and #4 touch disjoint files and start together
- checks: tracks disjoint · blockers complete (#5 after #3 and #4)
- estimate: ≈$5.10 (#3 sonnet · medium ≈$2.15, #4 haiku · low ≈$0.15, #5 sonnet · high ≈$2.80)

## Run
- executors: <at close>
- track reviews: <at close>
- actual: <at close>
- estimate vs actual: <at close>
- went wrong / change next time: <at close>
