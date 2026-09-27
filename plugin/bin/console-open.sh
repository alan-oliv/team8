#!/bin/sh
# What /team8:console runs:  console-open.sh <session-id>
# A ready console of the same or a newer build is switched to the session, and
# every open tab follows it. A missing console, or an older one, is replaced by
# this session's build, started on the session. With no tab open, one is
# opened. The last line printed is the session's URL.
set -u

SESSION="${1:-}"
PORT="${OCTO_PORT:-4823}"
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
ROOT="${OCTO_ROOT:-${CLAUDE_PLUGIN_ROOT:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}}"
. "$(dirname "$0")/console-lib.sh"

case "$SESSION" in
  '' | *'${'*)
    echo "no session id: \${CLAUDE_SESSION_ID} was not substituted" >&2
    exit 1
    ;;
esac

mine=$(plugin_version)

# A console still starting cannot name its build yet; give it the time it needs.
wait_ready() {
  i=0
  while [ "$i" -lt 30 ] && console_up && [ -z "$(health_field ok)" ]; do
    sleep 1
    i=$((i + 1))
  done
}

if console_up; then
  wait_ready
  running=$(health_field version)
  build=$(health_field build)
  # A console from before builds reported themselves carries no version: older.
  if [ "$build" != dev ] && { [ -z "$running" ] || is_older "$running" "$mine"; }; then
    stop_console
  fi
fi

if ! console_up; then
  start_console --session "$SESSION"
  # The port is held within the console's first second.
  i=0
  while [ "$i" -lt 30 ] && ! console_up; do
    sleep 0.1
    i=$((i + 1))
  done
fi
wait_ready

if [ -z "$(health_field ok)" ]; then
  echo "the console did not come up; last lines of $CLAUDE_DIR/team8.log:" >&2
  tail -n 5 "$CLAUDE_DIR/team8.log" >&2 2>/dev/null
  exit 1
fi

# Answers once the switch has landed; a no-op when it is already here.
curl -s -m 10 -X POST -H 'content-type: application/json' -d '{}' \
  "http://127.0.0.1:$PORT/api/select-session/$SESSION" >/dev/null 2>&1

URL="http://127.0.0.1:$PORT/s/$SESSION"
if [ "$(health_field tabs)" = 0 ]; then
  if [ -n "${OCTO_OPEN:-}" ]; then
    "$OCTO_OPEN" "$URL"
  elif command -v open >/dev/null 2>&1; then
    open "$URL"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1
  fi
fi
echo "$URL"
