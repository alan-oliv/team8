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

None yet. Each speed PR adds its own here as a `### <name>` section: the setup, the exact prompt, what to read, and the pass mark.

If `$ARGUMENTS` names no scenario below, list the scenarios and stop.
