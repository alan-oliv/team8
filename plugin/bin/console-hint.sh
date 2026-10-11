#!/bin/sh
# SessionStart: replace a console running an older build than the one this
# session loaded, so an update reaches the screen without a manual restart.
# Never a downgrade, never a dev console, never one still starting, and never
# a console that is not running at all. On a resumed session that led a team,
# also tell the lead its in-process teammates are gone. Otherwise silent:
# every session on the machine runs this. Always exits 0.
set -u

PORT="${OCTO_PORT:-4823}"
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
ROOT="${OCTO_ROOT:-${CLAUDE_PLUGIN_ROOT:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}}"
. "$(dirname "$0")/console-lib.sh"
payload=$(cat 2>/dev/null) || payload=''

# /resume drops in-process teammates. Claude Code 2.1.296 names a team after
# its lead's session, so one file test says whether this session led one.
hint=''
if [ -n "$payload" ] && command -v jq >/dev/null 2>&1; then
  start_source=$(printf '%s' "$payload" | jq -r '.source // empty' 2>/dev/null)
  short_id=$(printf '%s' "$payload" | jq -r '.session_id // empty' 2>/dev/null | cut -c1-8)
  if [ "$start_source" = resume ] && [ -n "$short_id" ] &&
    [ -f "$CLAUDE_DIR/teams/session-$short_id/config.json" ]; then
    hint='team8: this session was resumed and its in-process teammates are gone. Before messaging any of them, run TaskList, set each in_progress task whose owner is gone back to pending, and respawn its track per team8:run, After a resume.'
  fi
fi

mine=$(plugin_version)
notice=''

# `ok` only comes from a console that has finished starting and can name its build.
if [ -n "$mine" ] && [ -n "$(health_field ok)" ]; then
  running=$(health_field version)
  build=$(health_field build)
  # A console from before builds reported themselves carries no version: older.
  if [ "$build" != dev ] && { [ -z "$running" ] || is_older "$running" "$mine"; }; then
    stop_console
    # Word-split on purpose: recorded_flags prints one flag and one id.
    # shellcheck disable=SC2046
    start_console $(recorded_flags)
    notice="team8 console updated to $mine"
  fi
fi

if [ -n "$hint" ]; then
  jq -cn --arg notice "$notice" --arg hint "$hint" \
    '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $hint}}
     + (if $notice == "" then {} else {systemMessage: $notice} end)'
elif [ -n "$notice" ]; then
  printf '{"systemMessage":"%s"}\n' "$notice"
fi
exit 0
