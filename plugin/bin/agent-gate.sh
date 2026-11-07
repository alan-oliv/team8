#!/bin/sh
# PreToolUse gate on Agent. The isolation flag follows the mode (team8:run,
# Modes): in subagents mode every named team8 spawn carries
# isolation "worktree", in teammates mode none does, and with agent teams on
# the flag alone decides which one a named spawn becomes, with no error either
# way. The session's first named team8 spawn fixes the mode in
# $CLAUDE_CONFIG_DIR/team8/agent-mode-<session_id>; a later one whose flag
# disagrees is refused with the fix. A spawn with no name, or whose
# subagent_type is not team8's, is not team8's and passes untouched.
#
# CONTRACT: exit 2 blocks the call and returns stderr to the model as the
# reason, exit 0 allows it. A broken gate must never block work, so anything
# short of a clean read falls through to exit 0.
set -u

payload=$(cat 2>/dev/null) || exit 0
[ -n "$payload" ] || exit 0

command -v jq >/dev/null 2>&1 || exit 0

# "<session_id>|<name>|<mode>" for a named team8 spawn, nothing otherwise.
fields=$(printf '%s' "$payload" | jq -r '
  (.tool_input // {}) as $in
  | if .tool_name == "Agent"
      and (($in.name // "") | tostring) != ""
      and (($in.subagent_type // "") | tostring | startswith("team8:"))
    then "\(.session_id // "")|\($in.name)|\(if $in.isolation == "worktree" then "subagents" else "teammates" end)"
    else empty end
' 2>/dev/null) || exit 0
[ -n "$fields" ] || exit 0

session=${fields%%|*}
rest=${fields#*|}
name=${rest%%|*}
want=${rest#*|}
case $session in ''|*[!A-Za-z0-9_-]*) exit 0 ;; esac

dir="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/team8"
file="$dir/agent-mode-$session"
have=''
[ -f "$file" ] && have=$(cat "$file" 2>/dev/null)
case $have in subagents|teammates) ;; *) have='' ;; esac

if [ -z "$have" ]; then
  mkdir -p "$dir" 2>/dev/null && printf '%s\n' "$want" > "$file" 2>/dev/null
  exit 0
fi
[ "$have" = "$want" ] && exit 0

if [ "$have" = subagents ]; then
  echo "Agent \"$name\": this session runs team8 in subagents mode (its first named team8 spawn carried isolation \"worktree\"), so every named team8 spawn carries isolation: \"worktree\", reviewers included; without it this one would become a teammate. Add the flag and send the call again." >&2
else
  echo "Agent \"$name\": this session runs team8 in teammates mode (its first named team8 spawn carried no isolation), so no named team8 spawn carries isolation: \"worktree\"; with it this one would become a subagent outside the team. Drop the flag and send the call again." >&2
fi
exit 2
