---
description: Restart the team8 on the installed build and print its URL
allowed-tools: ["Bash"]
---

# team8

Always replace the running server, then report the URL in one or two lines. Do
not read source files.

**Why it always restarts rather than reporting a healthy server as fine:** the
server is detached and outlives the session that started it, so `claude plugin
update` leaves the OLD build serving on 4823 indefinitely. A health check cannot
tell the two apart — it answers `ok` either way — so a console that looks fine is
routinely a release behind, missing exactly the feature you updated for. Killing
first is what makes `/console` mean "serving the build I have installed".

Restarting is cheap: the console rebuilds its whole screen from its own
append-only log, so transcripts, tasks, mail, permission cards and the status
line all come back.

## 1. Stop whatever is on 4823

```bash
pkill -f "dist/server/index.js --port 4823" 2>/dev/null
sleep 1
curl -sf -m 2 http://127.0.0.1:4823/health && echo "STILL UP" || echo "port clear"
pgrep -af "dist/server/index.js" || echo "no console processes left"
```

Match on the PORT, not on the plugin path. A server started from a working copy
lives at `<repo>/plugin/dist/server/index.js`, which does not contain
`team8` — an earlier version of this command matched the path and
so killed only the installed build, leaving every locally-built server running.
Four of them accumulated that way, and whichever held the port answered
`/health` happily, so nothing looked wrong while the console served an old
build.

If `STILL UP` is printed, something else holds the port. Say so and stop rather
than starting a second server against it. If `pgrep` still lists processes after
the health check fails, they are orphans holding no port — say how many.

## 2. Start the installed build on this session

```bash
nohup node "${CLAUDE_PLUGIN_ROOT}/dist/server/index.js" --port 4823 --session "${CLAUDE_SESSION_ID}" \
  >>"${CLAUDE_CONFIG_DIR:-$HOME/.claude}/team8.log" 2>&1 &
for i in $(seq 1 30); do curl -sf -m 2 http://127.0.0.1:4823/health && break; sleep 1; done
```

The loop is not impatience: the server holds the port from its first second
but answers 503 until it has read `~/.claude`, which takes a while on a machine
with many transcripts.

`--session` points the console at the session running this command, or at the
team that session leads. Without it the server guesses, and Claude Code leaves
old team directories behind, so the guess was routinely a team whose session
had exited days earlier.

If `${CLAUDE_PLUGIN_ROOT}` or `${CLAUDE_SESSION_ID}` came through unsubstituted,
say so rather than guessing — the plugin is not installed the way this command
expects.

On success:

> Console restarted: http://127.0.0.1:4823/s/${CLAUDE_SESSION_ID}

Always give that `/s/` URL, never a `?team=` one. Any other session's hook can
restart the console in the second after step 1, and then this start exits
because the port is taken; opening the `/s/` URL still switches the console to
this session. If the health check fails, print the last few lines of
`${CLAUDE_CONFIG_DIR:-$HOME/.claude}/team8.log` and stop.

**Say this too when the health response names no team:** a server with no team to watch reaps
itself after its idle grace window, roughly ten minutes, so an unused console
will not be there later. That is the server's own lifecycle, not a crash — run
the command again, or just spawn a team and it starts itself.

**One caveat worth stating when you report:** `${CLAUDE_PLUGIN_ROOT}` resolves to
the build this *session* loaded at startup. If the plugin was updated after the
session began, this still starts the older one — restart Claude Code to pick up
the new build.
