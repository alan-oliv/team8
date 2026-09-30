---
description: Run a team8 speed scenario and print its number (dev only; not shipped with the plugin)
argument-hint: "<scenario>"
---

# bench

Targeted before-and-after tests for the speed PRs in `docs/team8/specs/2026-09-30-team8-speed-design.md`.

- Before: run the scenario in a session on the released plugin.
- After: run it in a session started with `claude --plugin-dir <worktree>/plugin` on the PR's branch.
- Numbers come from `npx tsx src/server/index.ts measure <session-id> --since <scenario start> --json`, run from this repo.
- Record the scenario, the plugin version or the branch and commit, and the number, in the PR description and the batch's run log.

## Scenarios

### effort

Checks that each agent definition's `effort` overrides the lead's `/effort max`.

- Before: in a clone on `main` before PR 1, run the "before" prompt. After: on the PR 1 branch, run the "after" prompt with `--plugin-dir <worktree>/plugin` (plus whatever Step 1 of the effort plan found was needed so the branch's plugin wins).
- Command shape: `claude -p --effort max --allowedTools "Agent,Bash" --output-format json "<prompt>"`, which prints the `session_id`.
- Before prompt: "Use the Agent tool twice, one after the other, never in parallel. Each time use model sonnet and the prompt: Run `true` with Bash, then reply ok. The subagent types, in order: team8:executor, team8:reviewer. Then reply done."
- After prompt: the same, with these seven spawns in order: team8:executor-low (model haiku), team8:executor-low, team8:executor, team8:executor-high, team8:executor-xhigh, team8:reviewer, team8:reviewer-light. All use model sonnet except the first.
- Read: `npx tsx src/server/index.ts measure <session_id> --json`, then each subagent's recorded `effort` (the efforts rows by model; or `jq -r 'select(.type=="assistant") | .effort' <its transcript> | sort | uniq -c`).
- Pass: before, both subagents record `max`. After, they record low (haiku), low, medium, high, xhigh, high, medium in that order, and the haiku one runs without an error.

If `$ARGUMENTS` names no scenario below, list the scenarios and stop.
