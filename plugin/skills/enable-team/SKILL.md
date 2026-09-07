---
name: enable-team
description: Use when the user wants to enable or disable Claude Code agent teams and the shared task-list tools together — e.g. "/team8:enable-team true", "/team8:enable-team false", "turn on agent teams", "disable teammates and todo tools".
---

# Toggle Agent Teams + Task Tools

Sets `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` (agent teams) and
`CLAUDE_CODE_ENABLE_TODO_TOOLS` (TaskCreate/TaskList/TaskUpdate/TaskGet on newer
models) together in the `env` block of `~/.claude/settings.json`.

For a full console install — these two vars plus `subagentStatusLine` — use
`/setup` instead. This skill is just the fast toggle.

## Argument

`$ARGUMENTS` is the desired state:

- `true`, `enabled`, `enable`, `on`, `1` → VALUE="1"
- `false`, `disabled`, `disable`, `off`, `0` → VALUE="0"
- Missing or anything else → show the current values (`jq '.env' ~/.claude/settings.json`) and ask which state they want.

## Steps

1. If `~/.claude/settings.json` is missing or fails `jq -e .`, STOP and report — never create or overwrite it from this skill.
2. Apply both vars atomically:
   ```bash
   tmp=$(mktemp) && jq --arg v "$VALUE" \
     '.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = $v | .env.CLAUDE_CODE_ENABLE_TODO_TOOLS = $v' \
     ~/.claude/settings.json > "$tmp" && mv "$tmp" ~/.claude/settings.json
   ```
3. Verify both keys show the new value:
   ```bash
   jq -e '.env | {CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS, CLAUDE_CODE_ENABLE_TODO_TOOLS}' ~/.claude/settings.json
   ```
4. Report the new state and remind: agent-teams changes apply to the next subagent spawn, but the Task tools only load at session start — restart Claude Code for full effect.

## Notes

- Disable writes `"0"` rather than deleting the keys: an explicit `"0"` in user settings overrides a shell `export`, deletion doesn't.
- Only touch these two keys — preserve everything else in the file.
