# Test checklist

One scenario per console mode. Every scenario goes through `team8:plan`, and
the plugin picks the mode itself: `team8:tasks` reads it off the task graph
and `team8:run` executes it. Each prompt describes work shaped to land on one
mode, so every run tests two things: that the plugin chose the expected mode,
and that the console shows it.

A different mode than expected is a finding. Compare the closing's first line
and the run log's `mode:` line against the mode table in
`plugin/skills/tasks/SKILL.md`.

## Before you start

- [ ] `/team8:setup` done and Claude Code restarted
- [ ] `/team8:console` run, `http://127.0.0.1:4823` open
- [ ] Each scenario in a fresh session in `~/code/team8`

Each scenario cuts a branch and commits to it, and scenarios 2 to 4 spend real
money on implementers and reviews. Delete the branches afterwards.

The plan tab only appears when the lead writes a file under
`docs/team8/plans/`, and `team8:plan` only writes one on its architectural
path. That is why scenarios 2 to 4 ask for a spec and a plan.

## 1. Solo

```
/team8:plan Make the SessionStart hint in plugin/bin/console-hint.sh include the console URL, http://127.0.0.1:4823.
```

- [ ] Closing says `mode: solo`: one task, one file
- [ ] The lead does the work itself, no roster
- [ ] No plan tab
- [ ] Console offers `stream` and `overview` only
- [ ] `overview` shows a brief of this one session

## 2. Subagents

```
/team8:plan The plan tab disappears if the console restarts after the lead's writes age out of the log (see the ponytail comment in src/server/plan.ts). Make the plan path survive a restart. Write a spec and a plan.
```

- [ ] Closing says `mode: subagents`: one serial track, peak 1
- [ ] `plan` appears as the second tab once the skeleton is written, every row unwritten
- [ ] Plan rows fill in one per Edit, matching the `Plan ▓▓░░ n/N` lines in the terminal
- [ ] Opening a plan row shows that task's section of the file
- [ ] After "start the work", `trace` appears with one lane per implementer and reviewer
- [ ] Never two implementers at the same time in `trace`
- [ ] Run log in `docs/team8/runs/` records the mode and its reason

## 3. Teammates

```
/team8:plan Three independent fixes. Write a spec and a plan:
1. The plan tab rows can be moved with the arrow keys (src/web/views/Plan.tsx).
2. GET /api/plan-task returns 400, not 404, when n isn't a number (src/server/http.ts).
3. The README's teammate-mode table lists the plan tab.
```

- [ ] Closing says `mode: teammates` with a peak of 2 or more: the file sets don't overlap
- [ ] Plan tab fills in while planning
- [ ] `wall`: one column per teammate, lead on the left
- [ ] `tasks`: each task with its owner, blockers and state
- [ ] `comms`: the `everyone` room, and teammates' reports to the lead
- [ ] `overview`: the brief (NOW, WAITING, NEXT), one row per agent
- [ ] `rail`: arrow keys move between agents
- [ ] `grid`: one pane per agent, up to 6
- [ ] `usage`: spend by model, cache-hit ratio, cost per task
- [ ] `NEEDS YOU`: a permission card when a teammate runs tests or git, allowed from the console
- [ ] Message a teammate from the composer, and it arrives
- [ ] Stop a teammate with ⏻, and the confirm prompt appears
- [ ] Run log records the mode and its reason

## 4. Workflow

```
/team8:plan Give each workflow view (WorkflowRun, WorkflowOutput, WorkflowAgents, WorkflowScript, WorkflowJournal, WorkflowUsage) a test for the empty-run state. Same test shape in each *.test.tsx. Write a spec and a plan.
```

- [ ] Closing recommends `workflow`: six same-shape tasks, no judgment between them
- [ ] Plan tab fills in while planning
- [ ] `team8:run` asks "run these 6 as a workflow?"; answer "yes, use a workflow"
- [ ] Console switches to the workflow screen and the plan tab goes away
- [ ] `run`: agents grouped by phase
- [ ] `output`: the workflow's return value
- [ ] `agents`: the ephemeral roster
- [ ] `script`: the persisted script
- [ ] `journal`: each agent's return value, `null` included
- [ ] `usage`: token occupancy against what it billed
- [ ] Run log records the mode and its reason

## Known gaps

- `NEEDS YOU` only ever shows permission cards. The `plan` and `failure` card
  kinds are defined and drawn, but nothing emits them
  (`src/server/ingest/hooks.ts` is the only emitter), so no scenario can raise
  them. A teammate hitting an API error shows as `failed` on the agent, not as
  a card.
- `trace` nests by call depth only when a subagent spawns its own subagent,
  which none of these scenarios do.
