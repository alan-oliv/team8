#!/bin/sh
# SessionStart: replace a console running an older build than the one this
# session loaded, so an update reaches the screen without a manual restart.
# Never a downgrade, never a dev console, never one still starting, and never
# a console that is not running at all. Otherwise a nudge toward
# /team8:console. Output is one systemMessage line; always exits 0.
set -u

PORT="${OCTO_PORT:-4823}"
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
ROOT="${OCTO_ROOT:-${CLAUDE_PLUGIN_ROOT:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}}"
. "$(dirname "$0")/console-lib.sh"
cat >/dev/null 2>&1

mine=$(plugin_version)

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
    printf '{"systemMessage":"team8 console updated to %s"}\n' "$mine"
    exit 0
  fi
fi

echo '{"systemMessage":"team8 console available - run /team8:console to open it"}'
exit 0
