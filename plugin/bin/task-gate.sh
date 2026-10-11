#!/bin/sh
# PreToolUse gate on TaskCreate and TaskUpdate. It reads only the call's own
# input, never a task file, so it cannot read the wrong list and it leaves
# other sessions' task lists alone:
# - a TaskCreate carrying any of team8's four metadata keys must carry all
#   four; one carrying none of them is not team8's (a todo list, a checklist);
# - a teammate's TaskUpdate to completed must carry metadata.verified in that
#   same call; the lead's own completions carry no agent_id and pass.
#
# CONTRACT: exit 2 blocks the call and returns stderr to the model as the
# reason, exit 0 allows it. A broken gate must never block work, so anything
# short of a clean read falls through to exit 0.
set -u

payload=$(cat 2>/dev/null) || exit 0
[ -n "$payload" ] || exit 0

command -v jq >/dev/null 2>&1 || exit 0

reason=$(printf '%s' "$payload" | jq -r '
  (.tool_input // {}) as $in
  | ($in.metadata // {}) as $m
  | if .tool_name == "TaskCreate" then
      ["complexity", "model", "effort", "why"] as $keys
      | [$keys[] | select((($m[.] // "") | tostring) == "")] as $missing
      | if ($missing | length) > 0 and ($missing | length) < ($keys | length)
        then "TaskCreate: metadata is missing \($missing | join(", ")) — a team8 task carries complexity, model, effort and why (team8:tasks)"
        else empty end
    elif .tool_name == "TaskUpdate" and $in.status == "completed"
      and (.agent_id // "") != ""
      and ((($m.verified // "") | tostring) == "") then
      "task #\($in.taskId): put metadata.verified \"<command> → <result>\" in the same TaskUpdate that sets status completed"
    else empty end
' 2>/dev/null) || exit 0

[ -n "$reason" ] || exit 0
echo "$reason" >&2
exit 2
