# Run log — card-progress

spec: none (bounded, design approved in chat)
plan: none
branch: card-progress
pr: https://github.com/alan-oliv/team8/pull/33

## Brainstorm
- path: bounded
- spec rounds with the user: 5 (plan-step counting rejected; self-reported progress accepted as "planned work done, assuming nothing breaks")

## Plan
- plan: none · tasks from the user via team8:tasks
- tasks: 2 · tracks: 2 · waves: 2 · peak: 1 at once · mode: subagents — task 2 reads the field task 1 adds, so nothing runs in parallel
- estimate: ≈$1.30 (haiku·low ≈$0.15, sonnet·medium ≈$1.15)

## Run
- executors: executor-1 · haiku · low · track A · wave 1 (43k tokens, 38s) · executor-2 · sonnet · medium · track B · wave 2 (68k tokens, 48s) · peak 1 at once
- track reviews: A 0/3 (11-line diff, read by the lead, no reviewer) · B 1/3, clean · residuals: 1 minor (no-progress test doesn't assert the background stayed `var(--color-bg)`)
- actual: unknown · the console on :4823 was watching another team (meetnotes), so no per-session cost; reviewer 24k tokens
- estimate vs actual: ≈$1.30 estimated; token counts suggest well under that
- went wrong / change next time: the TaskCompleted hook rejects `verified` metadata and `status: completed` in one TaskUpdate call; the metadata has to go first, in its own call
- went wrong / change next time: `index.wiring.test.ts` "leaves nothing of the team it left behind" fails in any regular checkout, main included (`branchOf` reads the real `.git/HEAD`); pre-existing, flagged in the PR
