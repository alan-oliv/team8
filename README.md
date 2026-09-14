<h1 align="center">Team<img src="src/web/images/favicon.svg" height="28" alt="8" /></h1>

<p align="center">A live browser console for Claude Code, one screen for any session:
solo, running subagents, coordinating a team of teammates, or driving a workflow.</p>

## The problem

Running more than one Claude Code session at a time means tabbing between
terminals: one window per teammate, another for the workflow, another for
whatever you started solo. Coordinating a team that way is worse than running
one agent alone: nothing tells you who's burning context, who's blocked, or
what's waiting on you, until you go look. Team8 is the cockpit for a team's
actual state, in one screen.

<img src="docs/demo.gif" alt="team8 demo" />

It starts itself the moment Claude spawns a team or a workflow, nothing to run
by hand. From there, the switcher in the header lists every other session on the
machine too, solo ones included, so you can hop to any of them without leaving
the browser.

## Native Claude Code, on one screen

None of this is new capability. Agent teams, subagents, workflows and the shared
task list are all native to Claude Code. Team8 just gives what's already
happening a shared screen.

Every teammate keeps its own conversation and transcript, team8 just puts them
side by side. Every task carries a model tier (`opus`, `sonnet` or `haiku`) and
an effort sized to the work by whoever created it, plus real `blockedBy`
dependencies, so finishing one task unblocks whatever was waiting on it. The
lead, meaning you, can message any teammate directly, ask it to wrap up or
stop, or answer a permission prompt, without switching back to a terminal.

## Three modes, one screen

What's running decides the mode. A bare session is subagents mode, two or more
teammates make it a team, and a `Workflow` call gets its own mode with no
roster at all.

### Subagents mode

Any single Claude Code session, no team required. This is the mode for solo
work, or a session driving ordinary subagents (`Explore`, parallel search
agents, and the like).

<table>
<tr>
<td rowspan="2" width="360"><img src="docs/subagents.png" width="360" alt="Subagents mode, trace view"></td>
<td><code>stream</code></td>
<td>that session's own live transcript</td>
</tr>
<tr>
<td><code>trace</code></td>
<td>a timeline of every subagent it dispatched: model, elapsed, tokens, cost, nested by call depth (shown once it has spawned at least one)</td>
</tr>
</table>

### Teammate mode

An agent team, two or more members.

<table>
<tr>
<td rowspan="3" width="360"><img src="docs/teammates.png" width="360" alt="Teammate mode, wall view"></td>
<td><code>wall</code></td>
<td>one transcript column per teammate, lead pinned on the left</td>
</tr>
<tr>
<td><code>overview</code></td>
<td>a generated brief, where the work stands, and one row per agent: the task it claimed, what it's doing now, what it last reported</td>
</tr>
<tr>
<td><code>comms</code></td>
<td>an <code>everyone</code> room carrying the whole team's traffic, with per-pair inbox threads below it</td>
</tr>
<tr>
<td></td>
<td><code>tasks</code></td>
<td>the shared task list, model, dependencies, state</td>
</tr>
<tr>
<td></td>
<td><code>rail</code></td>
<td>a keyboard-navigable agent list with one big transcript</td>
</tr>
<tr>
<td></td>
<td><code>grid</code></td>
<td>six panes at once, for a wide monitor</td>
</tr>
<tr>
<td></td>
<td><code>usage</code></td>
<td>spend by model, cache-hit ratio, cost per task and per hour</td>
</tr>
</table>

Across the bottom, `NEEDS YOU` collects everything blocked on a human.

### Workflow mode

A `Workflow` tool run. Its agents never join a team roster, so this mode has
no comms and no composer, just the run.

<table>
<tr>
<td rowspan="3" width="360"><img src="docs/workflow.png" width="360" alt="Workflow mode, run view"></td>
<td><code>run</code></td>
<td>agents grouped by phase</td>
</tr>
<tr>
<td><code>agents</code></td>
<td>the ephemeral roster</td>
</tr>
<tr>
<td><code>script</code></td>
<td>the persisted script, with the resume model drawn on it</td>
</tr>
<tr>
<td></td>
<td><code>journal</code></td>
<td>each agent's actual return value, <code>null</code> included</td>
</tr>
<tr>
<td></td>
<td><code>usage</code></td>
<td>the run's token occupancy against what it actually billed</td>
</tr>
</table>

## Install

Three steps on a new machine, then restart:

```bash
claude plugin marketplace add alan-oliv/team8
claude plugin install team8@team8
# then, inside Claude Code:
/team8:setup
```

`/team8:setup` is namespaced to the plugin on purpose, the bare `/setup` works
too until some other plugin also ships one. Same reasoning as `/team8:console`
below.

Needs Node 22+ and `curl`, which you already have if Claude Code runs, on
macOS or Linux. The console is built against Claude Code `2.1.231`: agent
teams are experimental, and the files team8 reads can change shape between
releases. On any other version it still runs, but warns at startup.

`/team8:setup` writes the things a plugin manifest has nowhere to put: an
`env` var that turns on agent teams (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`),
one that turns on the task list (`CLAUDE_CODE_ENABLE_TODO_TOOLS`), one list
shared by the whole team, each entry claimed and closed by whichever teammate
picks it up, and a `subagentStatusLine` that shows each teammate's current
tool in its header. It merges into your existing `settings.json` without
touching anything already there, backs the file up next to itself first, and
shows you exactly what it's about to write before it writes anything.

Restart Claude Code afterwards: `env` is read once at session start.

Check it any time with `/team8:console` (`/console` also works, same as
`/team8:setup` above): it restarts the console on the installed build and
prints its URL, `http://127.0.0.1:4823`.

## Updating

```bash
claude plugin update team8@team8
```

Then run `/team8:console`. The server is detached and outlives the session
that started it, so after an update the old build keeps serving until
something restarts it. Restarting loses nothing: the console rebuilds its
screen from its own log.

## How it works

The plugin registers hooks on ten Claude Code events (tool calls, permission
requests, prompts, stops, session start and end, compaction). Each one POSTs
the event to the console on `127.0.0.1:4823`, the same port on every
machine. Beyond that, the console reads what Claude Code already writes to
disk under `~/.claude` (or `$CLAUDE_CONFIG_DIR`): team configs, transcripts,
inboxes and the task list.

A hook that finds no console running exits 0 and gets out of the way. It only
brings the console back if a team is still live, so a stopped console never
blocks or slows a session.

The server binds to localhost only and rejects requests from other origins,
so a web page open in your browser can't drive it. It makes one outbound
call of its own: the overview brief, which runs `claude -p` on `haiku`
through your existing Claude Code login, at most once a minute (about
$0.005 a run).

## Skills

Four skills fire on their own, when the work calls for them.

`team8:plan` takes an idea to an approved spec with you, then writes the plan
in the same session, a task at a time, with a progress line after each and a
`plan` tab in the console that fills in as it goes. What comes back to you is
the task table and a file path, and nothing runs until you say so.

`team8:tasks` sets the contract a task needs before it's handed off: a
description that stands alone, real `blockedBy` dependencies, and a
`model`/`effort` sized to the work.

`team8:run` turns settled work into tasks and teammates: how many teammates,
the dispatch contract, and the branch shape the dependency graph implies.

`team8:multiple-code-reviews` reviews a batch of pull requests with one
teammate per PR, then posts the reviews as yours once you've read them.

A fifth is a plain toggle. Claude doesn't reach for it on its own, you call it
by name: `/team8:enable-team true` or `/team8:enable-team false` flips the
same two `env` vars `/team8:setup` writes.

Don't want Claude reaching for one of these on its own? Turn it off per skill,
no plugin changes needed, in `~/.claude/settings.json` (or the project's
`.claude/settings.json`):

```json
{ "skillOverrides": { "team8:tasks": "off" } }
```

`off` hides it entirely, `user-invocable-only` keeps it reachable by name
(`/team8:tasks`) but out of Claude's own judgement.

## Uninstall

```bash
# inside Claude Code, while the plugin is still installed:
/team8:enable-team false
# then:
claude plugin uninstall team8@team8
```

That turns agent teams and the task list back off and removes the hooks. The
`subagentStatusLine` that setup added stays in `settings.json` until you
delete it. Setup's backup sits next to the file as
`settings.json.before-console-<timestamp>`.

## Development

```bash
npm install
npm run dev        # server on :4823 with watch, plus the Vite dev server
npm test
npm run typecheck
npm run build      # rebuilds plugin/dist
```

`plugin/dist` is committed on purpose: the plugin ships as files and nothing
builds on the user's machine. Run `npm run build` and commit the result with
any source change. CI fails if `plugin/dist` is stale, and bumps the plugin's
patch version on every green push to `main`.
