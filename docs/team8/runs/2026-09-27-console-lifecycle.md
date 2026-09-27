# Run log — console-lifecycle

spec: docs/team8/specs/2026-09-27-console-lifecycle-design.md
plan: docs/team8/plans/2026-09-27-console-lifecycle.md
branch: console-lifecycle
pr: https://github.com/alan-oliv/team8/pull/32

## Brainstorm
- path: architectural (sub-project 1 of 5 from the 2026-09-27 improvement study)
- spec rounds with the user: 1 split question, 4 clarifying questions (CI dist, old builds, shutdown, approach), 4 design sections (section 1 restated once as behaviour), 1 spec review
- starting point: 9e23869, the in-flight session-binding fix after two review workflows (9 findings addressed, 3 folded into this spec)

## Plan
- plan: written by the lead · self-review fixes: 4 (fixture filename, Task 2 expected failures, stray Task 3 note, spec's watch wording)
- tasks: 11 · tracks: 4 (A server 1-4, B scripts 5-7+11, C web 8, D CI/docs 9-10) · waves: 3 · peak: 2 at once · mode: teammates — two tracks run at once (A with D, then C with B)
- estimate: ≈$23.15 executors (2 opus·high ≈$6.90, 8 sonnet·medium ≈$1.15, 1 haiku·low ≈$0.15); reviews and lead not included

## Run
- executors: exec-a · opus · high · track A (tasks 1-4) · wave 1
- executors: exec-d · sonnet · medium · track D (tasks 9-10) · wave 1
- executors: exec-c · sonnet · medium · track C (task 8) · wave 2
- executors: exec-b · sonnet · medium · track B (tasks 5-7, 11) · wave 2 · peak 3 at once (B, C, D's task 10)
- track reviews: A 2/3 (follower raced a select; record writes unordered — both fixed) · B 2/3 (record shared across ports, found from the by-hand check's `auto` restart; run log hid it — both fixed) · C 2/3 (redundant StatusBar prop, fixed) · D 1/3 (no findings)
- residuals (minor, not fixed): an installed build under a symlinked ~/.claude reports `dev` and is never auto-upgraded; stale reaper/SessionEnd comments in src/server/ingest/files.ts:85 and files.test.ts:1528; spec/plan still name `console.json` (now `console-<port>.json`)
- full suite at close: 91 files, 2240 tests passed
- actual: not measured — the console (installed 1.0.43) reports only the lead, ≈$6.56; teammate and reviewer spend is in their transcripts (study item D1 is the fix)
- estimate vs actual: ≈$23.15 executors estimated; actual unknown for the reason above
- went wrong: the by-hand check found a real defect and first reported it as passing; the reviewer caught it — keep the "investigate anomalies" line in by-hand review prompts
- went wrong: the plan's /branch wiring test could never pass as written (no folder listing for a non-UUID ancestor); executor rewrote the setup
- change next time: cost per agent needs a transcript-based command (sub-project 4)
- checked by hand (port 4834, real ~/.claude): start + tab opened yes · tab followed switch without restart yes · restart restored watch: first attempt came back `auto` — the record was `<claude home>/team8/console.json`, one file shared by every port, so the 4823 console's own boot/writes clobbered 4834's watch; fixed by keying the record filename on port (`console-<port>.json`); re-ran with the fix built and the restart correctly restored `watching` to the switched-to session
