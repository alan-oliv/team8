#!/bin/sh
# TaskCompleted gate: refuse a completion until metadata.verified is on the
# task file — "task status can lag" its covering tests otherwise.
#
# CONTRACT: exit 2 to block (stderr goes back to the model as the tool
# error), exit 0 to allow. A broken gate must never block work, so anything
# short of a clean read of a well-formed task file falls through to exit 0.
set -u

payload=$(cat 2>/dev/null) || exit 0
[ -n "$payload" ] || exit 0

command -v jq >/dev/null 2>&1 || exit 0

task_id=$(printf '%s' "$payload" | jq -r '.task_id // empty' 2>/dev/null)
session=$(printf '%s' "$payload" | jq -r '.session_id // empty' 2>/dev/null)
[ -n "$task_id" ] && [ -n "$session" ] || exit 0

CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
short=$(printf '%s' "$session" | cut -c1-8)
task_file="$CLAUDE_DIR/tasks/session-$short/$task_id.json"
[ -f "$task_file" ] || exit 0

verified=$(jq -r '.metadata.verified // empty' "$task_file" 2>/dev/null) || exit 0
[ -n "$verified" ] || {
  echo "task #$task_id: record the verification first — TaskUpdate metadata {verified: \"<command> → <result>\"} — then complete" >&2
  exit 2
}

exit 0
