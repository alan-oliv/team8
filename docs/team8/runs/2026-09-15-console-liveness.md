# Run log — console liveness

spec: none — systematic debugging in the session (why the picker and header said "active" for sessions that were not)
plan: none · tasks from the user via team8:tasks
branch: console-liveness
pr: https://github.com/alan-oliv/team8/pull/18

## Brainstorm
- path: bounded
- origin: two user reports read against the code and the machine — the picker called three parked sessions live because their pids answered, and the header said "working · 1h 56m" for a session dead two hours, because every session's hooks were being attributed to the shown lead. Three more asks arrived during the run: the ⏺ gutter marker drawing as a boxed `?`, cards opening by themselves, and a bare URL landing on a stale session
- spec rounds with the user: 0

## Plan
- plan: none · tasks written straight from the diagnosis, two at the start and three as the user asked
- tasks: 5 · tracks: 5 · waves: 3 · peak: 3 at once · mode: teammates — disjoint files, two tracks from the start, the rest as they arrived; D waited on C because both edit TranscriptFeed.tsx
- estimate: ≈$4.85 (#1 sonnet·medium ≈$1.15 · #2 sonnet·medium ≈$1.15 · #3 sonnet·medium ≈$1.15 · #4 sonnet·low ≈$0.25 · #5 sonnet·medium ≈$1.15)

## Run
- executors:
  - track-a · sonnet · medium · track A (task 1, hook ingest) · wave 1
  - track-b · sonnet · medium · track B (task 2, sidecar busy/idle) · wave 1
  - track-c · sonnet · medium · track C (task 3, marker glyph) · wave 1
  - track-d · sonnet · low · track D (task 4, click-only cards) · wave 2, after task 3
  - track-e · sonnet · medium · track E (task 5, bare URL) · wave 3
  - peak 3 at once
- track reviews:
  - A: 2/3 rounds · round 1: 2 Blocking (duplicated `sid`/`lead`; the guard swallowed a foreign SessionEnd) + 1 Minor (`str(b.agent_id)`), all fixed in e63ff8e · round 2: clean
  - B: 1/3 rounds, clean, no findings
  - C: 1/3 rounds, clean, no findings. The executor could not reproduce and refused to guess; the lead root-caused it on the user's machine: U+23FA lives in no default macOS text font (only STIX Two Math, the emoji font and .LastResort, whose glyph is the boxed `?`), so it only ever drew through an unstable per-glyph fallback. Fix draws it as ● in the gutter, contract untouched
  - D: checked by the lead instead of a reviewer: a clean `git revert` of b7aafc0, proven by re-applying that commit's patch on top (`git apply --check`), no dangling references
  - E: 3/3 rounds · round 1: 2 Blocking (the listing fetch's continuation had no live/cleanup guard, so a slow GET could clobber a manual or announced switch; no test for it) + 1 Minor (direct POST instead of the /s/ route, left as is) · round 2: guard fixed, test exercised unmount, which never happens in this app · round 3: test rewritten against a same-instance switch and mutation-checked by the executor (fails with the guard removed); the lead ruled it clear
  - residuals: 0 Blocking
- actual: ≈$33.04 · executors ≈$9.49 (track-a ≈$1.11, track-b ≈$1.01, track-c ≈$2.67, track-d ≈$0.35, track-e ≈$4.35) · reviewers ≈$1.64 (review-a ≈$0.43, review-b ≈$0.20, review-c ≈$0.19, review-e ≈$0.82) · lead ≈$21.94, counted from the batch start. From the console's frame at close
- estimate vs actual: executors ≈$9.49 against ≈$4.85. A and B landed under their ≈$1.15 cell; C ran to ≈$2.67 because half of it was a dead-end bisect before the lead's diagnosis arrived; D at ≈$0.35 was a revert; E ran to ≈$4.35 over three review rounds, most of it the test. The estimate never counts the lead or the reviewers, ≈$23.58 here
- went wrong / change next time:
  - `/team8:console` while five sessions are live: every hook that finds the port down runs console-restart.sh, so seven installed-build servers spawned in twenty seconds, all contending on the team log, and none reached `listen`. Recovered only by culling the extras while one started. console-restart.sh needs a lock or a "someone is already starting" check
  - `/team8:console` always starts the INSTALLED build, so it silently put the old bundle back twice while the user was checking fixes that only existed on the branch. Say which build is serving in the restart report
  - task 3 shipped as "bisect for the breaking commit" when there was none; a symptom on one machine wants the environment checked first (which fonts, which browser) before git history
