# Run log — team8 band and team pane

spec: docs/team8/specs/2026-10-11-team8-mod-band-pane-design.md
plan: docs/team8/plans/2026-10-11-team8-mod-band-pane.md
branch: team8-mod
pr: https://github.com/alan-oliv/team8/pull/41 · session-cards: https://github.com/alan-oliv/claude-mods/pull/4

## Brainstorm
- path: architectural, from the design handoff in `docs/design_handoff_team8_mod/`, with a probe spike before the design
- spec rounds with the user: 3
  - round 1: two design parts approved, then the written spec;
  - round 2, after the first live check: band only, pane removed;
  - round 3, after the second live check: the one-line band.
- decisions in round 1:
  - teammates only, subagents left out;
  - data from Claude Code, not the console's files;
  - NEEDS YOU dropped, since team8 never produces plan approvals or operator questions;
  - fullscreen offered as team8's default by `/team8:setup`, since only that layout docks a pane;
  - the pane opens by itself when the lead invokes `team8:run`.
- decisions in round 2: the pane, `/team8`, the open on `team8:run`, the Lead field and the fullscreen step came out, because the pane docks only under `/tui fullscreen`. A band digit opened the console on that teammate.
- decisions in round 3: one line, `team8 is running a {mode} session · total progress {done}/{total} ({pct}%) · see details here {console}`.
  - It shows in any mode and has no controls.
  - It is drawn before `next(e)`, and session-cards draws `next(e)` first, so the line sits first above the prompt.
- spike, 2026-10-11 on Claude Code 2.1.296, with a throwaway `t8ui` mod in the session's dev-mods folder:
  - `/team8` registered beside the plugin's `/team8:*` commands.
  - The band drew digit Buttons and kept `next(e)`'s tree.
  - A digit opened the pane: inline on the main screen (`placement: 'inline'`, 136 columns), docked under `/tui fullscreen`.
  - Tabs and an `open` Button worked.
  - `$.fs`, `TaskList` from a timer and `/health` all read fine.
  - The session's team folder vanished mid-session and `TaskList` went empty.
  - Mod deleted afterwards.

## Plan
- plan: written by the lead · self-review fixes: 2 (the spec's console Link drawn "in accent", though `Link` takes no colour; the close section added to the plan)
- tasks: 3 planned (#3–#5), then 3 more after the live check, each on the operator's call:
  - plan Task 4, band only (#1 of a cleared list);
  - Task 5, the one-line band (#3);
  - Task 6, session-cards in `~/code/claude-mods` (#4).
- tracks: 1, then 2 in separate repos · waves: 1 · peak: 1 at once · mode: subagents — every track is one serial line of small tasks, and #4's few minutes in another repo don't pay for a second teammate
- checks: tracks disjoint · blockers complete (#4 after #3)
- estimate: ≈$2.25 for the first three (#3 ≈$0.25 · #4 ≈$1.75 · #5 ≈$0.25), then ≈$1.40 for Tasks 5–6 (≈$1.15 · ≈$0.25). Task 4 was not priced. Lead and reviewers are not included. Both mechanical tasks were priced on sonnet · low, not haiku: haiku ran ≈$0.5 per verbatim task in the mods batch

## Run
- executors, all subagents, one at a time:

  | Task | What | Model · effort |
  |---|---|---|
  | Task 1 (#3) | team rules | sonnet · low (`team8:executor-low`) |
  | Task 2 (#4) | band and pane | opus · medium (`team8:executor`) |
  | Task 3 (#5) | setup's fullscreen step | sonnet · low |
  | Task 4 (#1) | band only | sonnet · medium |
  | Task 5 (#3) | one-line band | sonnet · medium |
  | Task 6 (#4) | session-cards, in claude-mods | sonnet · low |

  peak 1 at once
- deviations:
  - Task 2's test stubs answer the kit with `{ value }`. They stub `session.start`, and the beneath `ui.render` returns `{ type: 'Box' }`. The Lead field draws only where the surface has an `Input`; mobile has none.
  - Task 4's `process.run` answer uses `ProcessRunResult`'s real fields.
  - Task 5's desktop test checks the console label as text, because the desktop surface draws only https and localhost links, not `127.0.0.1`.
  - Task 6's test is `.tsx`, and its existing `cards.test.ts` helper now answers the `ui.render` beneath.
- track reviews:
  - Task 1: 1/3 rounds, no Blocking.
  - Task 2: 2/3 rounds. Round 1 had no Blocking. The lead promoted three Minors to must-fix: the stale session id after `/clear`, hook bodies outside try/catch, and a second 5 s timer on a repeat `session.start`. The toast test was added in round 2. Round 2 left everything addressed.
  - Task 3: 1/3 rounds, no Blocking.
  - Task 4: review stopped by the operator before it reported. Its code was replaced by Task 5's.
  - Task 5: 2/3 rounds. The lead promoted the mode surviving `/clear` to must-fix, and round 2 addressed it.
  - Task 6: 1/3 rounds, no Blocking.
  - residuals: 0
- Minor findings, logged here:
  - Task 1: rules since replaced by Task 5.
  - Task 2: the module-level `ticking` flag shared across test runs, and a timer that keeps the first `$`. Both are moot now: Task 5 keeps the flag, and the timer closure is unchanged.
  - Task 3: the setup step since reverted.
  - Task 5:
    - the mode is set from a Write or Edit before the call runs, so a blocked write still decides it;
    - the 1 s refresh after a `TaskUpdate` may read the list before the update lands, and the 5 s timer corrects it;
    - no survey test, and the console-down test runs on terminal only.
  - Task 6:
    - `beneath.test.tsx` copies about 20 lines of `mountBand` from `cards.test.ts`, and has a doubled blank line;
    - session-cards' `marginTop={2}` now sits between the team8 line and its branch row (a visual call for the operator).
- full suite at close: 105 files and 2,385 tests passed · `tsc --noEmit` clean · `claude plugin validate plugin` passed, listing `tool.call{tool=TaskUpdate}, session.start, tool.call, turn.complete, ui.render{component=AbovePrompt}` · `claude plugin test plugin` 7 pass · session-cards: `claude plugin test` 10 pass, `validate` passed
- live checks, with a dev-mods copy `t8live` and a haiku teammate `check-band` running `sleep 20`:
  - **1st, band and pane:** worked. The pane docked only under `/tui fullscreen`, which led to round 2.
  - **2nd, band only:** the band never showed. session-cards returned only its own tree and dropped `next(e)`, so a band beneath it was lost. That led to round 3 and Task 6.
  - **3rd, the one-line band first above the cards:** left to the operator at the PR.
- actual:
  - executors ≈$3.63: Task 1 ≈$0.21, Task 2 ≈$1.99 (two rounds), Task 3 ≈$0.21, Task 4 ≈$0.38, Task 5 ≈$0.46 (two rounds), Task 6 ≈$0.38
  - reviewers ≈$0.82 · live-check teammates ≈$0.03
  - lead ≈$39.51, for its whole transcript from the handoff read on
- estimate vs actual: executors ≈$3.63 against ≈$3.65 priced. Task 2's opus · medium ran ≈$1.99 against ≈$1.75. The sonnet · low cells (≈$0.25) held at ≈$0.21.
- message lag: none (subagents) · review tails: none · idle with work waiting: none
- went wrong / change next time:
  - Two of the three designs were built before anyone saw them in the operator's real setup: the default renderer, not fullscreen, and session-cards in the band. Next time, run the spike's probe in the operator's own layout and next to their other mods before the spec.
  - A mod that returns its own tree without `next(e)` hides every band beneath it, and nothing reports it. The probe should list the other plugins hooking `AbovePrompt` and read their hooks.
  - Claude Code clears a task list once every task in it is completed. That lost the checklist tasks once and dropped the live-check teammate with it. Keep a "Close the run" task open in subagents mode too.
  - When the lead claims tasks as `team-lead`, each claim echoes back as a `task_assignment` notice, again. It's harmless.
  - The PR hook matched `gh pr create` inside a plan heredoc. Write plan text with the Edit tool.
