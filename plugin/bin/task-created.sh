#!/bin/sh
# TaskCreated gate: refuse a task that doesn't carry the four metadata keys
# team8:tasks asks every task to have (complexity, model, effort, why) —
# "the field that gets skipped" when a prose reminder is all there is.
#
# CONTRACT: exit 2 to block (Claude Code deletes the task and returns stderr
# as the tool error), exit 0 to allow. A broken gate must never block work,
# so anything short of a clean read of a well-formed task file falls through
# to exit 0 rather than guessing.
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

missing=$(jq -r '
  (.metadata // {}) as $m
  | ["complexity", "model", "effort", "why"]
  | map(select(($m[.] // "") == ""))
  | join(", ")
' "$task_file" 2>/dev/null) || exit 0

[ -n "$missing" ] || exit 0

echo "task #$task_id: metadata is missing $missing — add them (team8:tasks) before creating this task" >&2
exit 2
