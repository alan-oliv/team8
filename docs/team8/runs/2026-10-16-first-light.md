# Run log — first light and v3 portraits

spec: docs/team8/specs/2026-10-16-first-light-design.md
plan: docs/team8/plans/2026-10-16-first-light.md
branch: empty-state
pr: https://github.com/alan-oliv/team8/pull/47

## Brainstorm
- path: architectural
- spec rounds with the user: 1 (two decisions taken in dialogue before the spec: first light ends at the lead's first transcript line; v3 everywhere at 32px)

## Plan
- plan: written by the lead · self-review fixes: 3 (spec path in the header; `letterSpacing` round-trip value; a hedged jsdom note replaced with the verified fact)
- tasks: 9 (+ Close the run) · tracks: 6 (grids, themes, turn, portrait, light, chrome) · waves: 4 · peak: 3 at once · mode: teammates — three tracks start together with no shared files
- estimate: ≈$13.85 (per task in the plan's table; lead and track reviewers not included)

## Run
- executors: grids · sonnet · medium · track grids · wave 1 (tasks 1, 2) · themes · sonnet · medium · track themes · waves 1 and 4 (3, 8) · chrome · sonnet · high · track chrome · waves 1 and 4 (5, 9) · turn · sonnet · medium · track turn · wave 2 (4) · portrait · sonnet · high · track portrait · wave 3 (6) · light · opus · high · track light · wave 3 (7) · peak 3 at once (wave 1); 4 alive at most, counting an idle themes/chrome waiting on their second task
- base 090722b · first dispatch 04:15Z · last track clear 04:27Z (12 min end to end) · 13 commits
- track reviews: grids 1/3 (0 blocking, 5 minor) · turn 1/3 (0 blocking, 3 minor) · portrait 1/3 (0 blocking, 4 minor) · light 1/3 (0 blocking, 4 minor; every handoff value verified) · chrome 2/3 (round 1: one finding the lead promoted to blocking — first light ignored `dismissed`, so LeftSession showed under a dimmed chrome with the strip note; round 2 ADDRESSED in e0cc209) · themes 2/3 (round 1: 0 blocking, 4 minor sent back as they cited a rule task 8 deleted; round 2 all ADDRESSED in 7675ae3) · residuals: 16 minor, all test-strictness or comments: a size ≤ 0 passes `gridSvgV3`'s guard; no regression guard for the empty-role fix in `characterGrid`; hair factor 0.45 and the 10/11 and 28/29 row boundaries not pinned by a head-turn test; `turnFrame` doc comment restates the code; a stale comment in Comms.test:148; Portrait.test duplicates provider nesting; FirstLight.test does not assert the resume path, the reduced-motion "?" or the timer count, resets stubs inside test bodies, and covers a third of the layout values
- plan deviations, all ruled by the lead: `characterGrid` `&&` → ternary for TS2322 on an empty role name (30903cb); App.test helper renamed `firstLightState` (name clash) and the two pre-existing bare-session tests given one transcript line, since an empty transcript is now first light; `legal` note reworded (plan said leave it) because it still described the recolour looks
- lead's own checks at close: `npm test` 108 files / 2273 tests green · `npm run typecheck` clean · `npm run build` ok, `plugin/dist` restored
- actual: executors ≈$3.21 · reviewers ≈$1.24 · lead ≈$28.36 (this session's whole transcript, which also carried the console self-stop work and the brainstorm) · per agent: grids ≈$0.41, themes ≈$0.84, chrome ≈$0.82, turn ≈$0.24, portrait ≈$0.33, light ≈$0.57, review-grids ≈$0.16, review-turn ≈$0.11, review-portrait ≈$0.13, review-light ≈$0.43, review-chrome ≈$0.16, review-themes ≈$0.25
- estimate vs actual: table ≈$13.85 vs executors ≈$3.21, 4.3× high — the plan carried every task's code verbatim, so each task was a copy-and-verify; the opus judgment task came in at ≈$0.57 against a ≈$3.95 cell
- measure: message lag median 0.0 min, max 1.6 (lead → chrome); review tails 2.2–3.2 min per track; idle with work waiting: none over the floor; no sleep
- went wrong: one plan test helper collided with an existing name in App.test.tsx; two pre-existing tests encoded the old "empty roster of one is the stream" rule and needed a line of transcript; the `legal` note was out of scope in the plan but stale after task 8
- change next time: grep the target test file for helper names before writing a plan's test code; when a plan changes a visible rule, list the existing tests that encode the old rule in the task; when a task retires a concept, say "and every sentence that describes it" rather than naming files
