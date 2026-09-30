---
description: Measure where a team8 batch's time went — model, tools, idle, message lag, review tails
allowed-tools: ["Bash"]
argument-hint: "[session-id] [--since <ISO time>] [--json]"
---

# team8 measure

Run this and show its output as it is. A session id in the arguments measures that session instead of this one.

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/server/index.js" measure "${CLAUDE_SESSION_ID}" $ARGUMENTS
```
