# Run log — session picker, live only

spec: docs/team8/specs/2026-10-15-session-picker-live-only-design.md
plan: docs/team8/plans/2026-10-15-session-picker-live-only.md
branch: session-picker-live-only
pr: <url, at close>

## Brainstorm
- path: architectural
- spec rounds with the user: 1 (three clarifying questions, one approach pick, three design sections, spec approved as written)

## Plan
- plan: written by the lead · self-review fixes: 8 (a shadowed `sessions` name in the server wiring, a dead-lead-team regression in `walkTeams` caught against the wiring tests, a wrong auto-resume expectation, a grep that would have flagged `IngestConfig.sessionOnly`, four test/wording fixes)
- tasks: 10 · tracks: 2 · waves: 3 · peak: 2 at once · mode: teammates — two tracks (server, picker) run in the same wave after the domain task
- estimate: ≈$24.60 (per task in the plan's table)

## Run
- executors: <name> · <model> · <effort> · track <X> · wave <n>, one line each · peak <n> at once
- track reviews: <X> <n>/3 rounds, one entry each · residuals: <n>
- actual: ≈$<total> · per agent: <name> ≈$<n>, one entry each
- estimate vs actual: <one line>
- went wrong / change next time: <one line each, or "nothing">
- manual check: against the branch build (sha f23dbdd) on :4899, read-only, over the real projects/sessions/teams/tasks with a scratch team8 store — the :4823 console is the installed 1.0.55 build watching the lead's session, so measuring it would test the old code and moving it would move the lead's view. `GET /api/teams` 404; the frame carried 3 rows, every one with `busy` and `folder`, the session on screen `current`. Switches B,A,B,A,B: 1.575s (first visit) · 0.491s · 0.318s · 0.382s · 0.325s; six more returns 0.312–0.390s. Returns are 4–5× faster than the first visit and the old 1.5–1.9s, but miss the < 0.3s target by 10–30%: the frame build is ~2ms and a 1.2 MB log returns as fast as a 6.8 MB one, so the rest is per-switch fixed cost (select's `walkTeams` over 119 teams, the sweep's walk of projects/), not re-parsing. Browser half (⌘K no flash, no `all`, no reload) pending, lead's.
