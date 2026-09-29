---
description: Open the team8 console on this session, starting or upgrading it only when needed
allowed-tools: ["Bash"]
---

# team8

Run this, then report its last line as the console URL in one line. Do not read
source files.

```bash
"${CLAUDE_PLUGIN_ROOT}/bin/console-open.sh" "${CLAUDE_SESSION_ID}"
```

It opens the console on the session running this command:

- a console already running the same or a newer build switches to this session,
  and every open tab follows it;
- a missing console, or one running an older build, is replaced by this
  session's build, started on this session;
- with no tab open, it opens one in the browser.

If `${CLAUDE_PLUGIN_ROOT}` or `${CLAUDE_SESSION_ID}` came through
unsubstituted, say so rather than guessing a path or an id. If the script exits
non-zero, show its stderr and stop.

Report:

> Console on this session: <URL>

The console never shuts itself down. It stays on this session until you pick
something else in its picker or run `/team8:console` from another session.
