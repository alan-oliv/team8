#!/bin/sh
# SessionStart nudge: point new sessions at /team8:console without starting
# anything. Unlike console-launch.sh this never spawns the server — a bare
# session that never uses a team or workflow should still learn the console
# exists, but starting it eagerly would leave a server running when nothing
# is there to watch.
set -u
cat >/dev/null 2>&1
echo '{"systemMessage":"team8 console available - run /team8:console to open it"}'
exit 0
