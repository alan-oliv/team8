#!/bin/sh
# Bring the console back after an observation hook found nothing listening.
#
# CONTRACT: always exit 0, and never write to stdout or stderr. This runs from
# a hook on every event the console misses, and Claude Code renders anything a
# hook writes to stderr as a "<hook name> hook error" notice — the very notice
# routing observation through curl exists to remove. Printing here would put
# the connection refusal back on the operator's screen once per tool call.
#
# The caller invokes this on ANY failed POST, not only a refused connection, so
# every gate below has to hold for a server that is merely slow as well as one
# that is gone.
set -u

PORT="${OCTO_PORT:-4823}"
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
# Never the cwd: the hook inherits the Claude session's cwd — the user's
# project, not this checkout.
ROOT="${OCTO_ROOT:-${CLAUDE_PLUGIN_ROOT:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}}"
. "$(dirname "$0")/console-lib.sh"

console_up && exit 0

# The console never stops on its own, so nothing answering means it crashed or
# was killed. Without a record it has never run here: only a team spawn, a
# workflow or /team8:console starts it the first time.
[ -f "$RECORD" ] || exit 0

# A burst of tool calls puts every hook on this line at the same instant, so the
# spawn sits behind an atomic mkdir. A lock left behind by a killed hook would
# block every later restart, so one older than a minute is cleared rather than
# trusted.
lock="$CLAUDE_DIR/team8/restarting"
mkdir -p "$CLAUDE_DIR/team8" 2>/dev/null
[ -n "$(find "$lock" -maxdepth 0 -mmin +1 2>/dev/null)" ] && rmdir "$lock" 2>/dev/null
mkdir "$lock" 2>/dev/null || exit 0

# Word-split on purpose: recorded_flags prints one flag and one id.
# shellcheck disable=SC2046
start_console $(recorded_flags)

# Hold the lock until it answers so a burst collapses into one spawn; the
# console holds its port within its first second.
i=0
while [ "$i" -lt 15 ]; do
  console_up && break
  sleep 0.1
  i=$((i + 1))
done
rmdir "$lock" 2>/dev/null
exit 0
