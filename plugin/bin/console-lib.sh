# Shared by the console scripts. POSIX sh, sourced after PORT, CLAUDE_DIR and
# ROOT are set:
#   . "$(dirname "$0")/console-lib.sh"
# From the script's own directory, never $ROOT: tests and the launcher point
# $ROOT at plugin roots that hold only dist/.

HEALTH="http://127.0.0.1:$PORT/health"
# Keyed by port: every console under this claude home shares the directory,
# and an unkeyed record would have one console's restart land on another
# console's watch.
RECORD="$CLAUDE_DIR/team8/console-$PORT.json"

# Anything answering counts, a 503 included: a console still reading ~/.claude
# is up, and starting another would only race it for the port.
console_up() {
  code=$(curl -s -o /dev/null -m 1 -w '%{http_code}' "$HEALTH" 2>/dev/null)
  [ -n "$code" ] && [ "$code" != 000 ]
}

# One field of a ready console's /health, or nothing.
health_field() {
  curl -sf -m 1 "$HEALTH" 2>/dev/null | node -e '
    let s = "";
    process.stdin.on("data", (d) => (s += d)).on("end", () => {
      try {
        const v = JSON.parse(s)[process.argv[1]];
        if (v !== undefined && v !== null) process.stdout.write(String(v));
      } catch {}
    });' "$1" 2>/dev/null
}

# This build's own version, from $ROOT/.claude-plugin/plugin.json.
plugin_version() {
  node -e 'try { process.stdout.write(String(require(process.argv[1]).version || "")) } catch {}' \
    "$ROOT/.claude-plugin/plugin.json" 2>/dev/null
}

# Exit 0 when release $1 is older than release $2.
is_older() {
  node -e '
    const p = (v) => v.split(".").map(Number);
    const [a, b] = [p(process.argv[1]), p(process.argv[2])];
    for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) process.exit((a[i] || 0) < (b[i] || 0) ? 0 : 1);
    process.exit(1);' "$1" "$2" 2>/dev/null
}

# The flags that reopen what the last console watched: --session <id>,
# --team <name>, or nothing.
recorded_flags() {
  [ -f "$RECORD" ] || return 0
  node -e '
    try {
      const w = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).watching;
      if (w && w.kind === "session") process.stdout.write("--session " + w.id);
      else if (w && w.kind === "team") process.stdout.write("--team " + w.name);
    } catch {}' "$RECORD" 2>/dev/null
}

# Detached, so it outlives the hook or command that started it. Falls back to
# tsx so a fresh checkout works without a build.
start_console() {
  if [ -f "$ROOT/dist/server/index.js" ]; then
    nohup node "$ROOT/dist/server/index.js" --port "$PORT" "$@" >>"$CLAUDE_DIR/team8.log" 2>&1 &
  else
    nohup npx --prefix "$ROOT/.." tsx "$ROOT/../src/server/index.ts" --port "$PORT" "$@" >>"$CLAUDE_DIR/team8.log" 2>&1 &
  fi
}

# Every console on this port, the one answering and any stragglers, then wait
# until nothing answers. Matched on the port, not the plugin path, so a
# working-copy build is stopped too.
stop_console() {
  pkill -f "dist/server/index.js --port $PORT( |\$)" 2>/dev/null
  i=0
  while [ "$i" -lt 30 ] && console_up; do
    sleep 0.1
    i=$((i + 1))
  done
}
