# Test checklist

One small project per mode, each in its own repo. Every scenario starts with
`/team8:plan` and a request written the way a user would ask, with no hint about
modes, specs or plans. The plugin decides all of that: `team8:plan` picks the
path, `team8:tasks` reads the mode off the task graph, and `team8:run` executes
it. So every run tests two things: that the plugin chose the expected mode, and
that the console shows it.

A different mode than expected is a finding. Compare the closing's first line
and the run log's `mode:` line against the mode table in
`plugin/skills/tasks/SKILL.md`.

## Before you start

- [ ] `/team8:setup` done and Claude Code restarted
- [ ] `/team8:console` run, so the console serves the installed build, and `http://127.0.0.1:4823` open
- [ ] Each lab is its own git repo with a first commit, and each scenario runs in a fresh session inside it

Each scenario cuts a branch and commits to it, and scenarios 2 to 4 spend real
money on implementers and reviews. Reset a lab to its first commit to run it
again.

The plan tab only appears when the lead writes a file under
`docs/team8/plans/`, and `team8:plan` only writes one when it judges the work
architectural. The prompts don't ask for one, so note whether each scenario got
a plan file: that is the plugin's call, and part of what is being tested.

Keep for the report: the closing message (mode line, waves, task table), the
run log from the lab's `docs/team8/runs/`, and which tabs appeared or stayed
empty.

## 1. Solo: `solo-lab`

**Seed:** `price.js` exporting `formatPrice(n)`, which returns `String(n)`, so
`formatPrice(1234.5)` is `"1234.5"`, and `price.test.js` with one passing test
for the current behavior.

```
/team8:plan Prices on the page show up like "1234.5". They should look like "$1,234.50": a dollar sign, commas for thousands and always two decimals.
```

- [ ] No spec or plan file: small work goes straight to tasks
- [ ] Closing says `mode: solo`: one task, one file
- [ ] The approval question shows as a `NEEDS YOU` card, answerable from the console
- [ ] The lead fixes it itself, test first, one commit, no roster
- [ ] Console offers `stream` and `overview` only
- [ ] `overview` shows a brief of this one session

## 2. Subagents: `kv-lab`

**Seed:** `store.js` with an in-memory `get`, `set` and `delete`, and
`store.test.js` covering them.

```
/team8:plan Right now the store loses everything when the process restarts. I need it saved to disk and loaded back on startup, and it shouldn't corrupt the file if the machine dies in the middle of a write.
```

- [ ] Closing says `mode: subagents`: one decision (file format, atomic write) and then save, load and a crash test, all in `store.js`, so one serial track with a peak of 1
- [ ] Whether it wrote a spec and plan. If it did: `plan` appears as the second tab once the skeleton is written, rows fill in one per Edit, matching the `Plan ▓▓░░ n/N` lines in the terminal, and opening a row shows that task's section
- [ ] After "start the work", `trace` appears with one lane per implementer and reviewer
- [ ] Never two implementers at the same time in `trace`
- [ ] Run log records the mode and its reason

## 3. Workflow: `pdf-lab`

**Seed:** a script that generates invoice PDFs in `invoices/` in 4 different
layouts (table, letter, receipt, two columns), each with an invoice number,
date, vendor and total, plus one blank PDF on purpose. Start with 20 and go up
to 100 once the run works. The layouts differ so the job needs a model, not
`pdftotext` and a regex.

```
/team8:plan I have about 100 invoices as PDFs in invoices/, and they come from different vendors so they all look different. For each one I need the invoice number, date, vendor and total pulled out into a JSON file, and then one CSV with everything so I can open it in a spreadsheet.
```

- [ ] Tasks are batches (about 10 PDFs each), not one task per PDF. 100 tasks is a bug in `team8:tasks`
- [ ] Closing recommends `workflow`: same-shape batches, no judgment between them
- [ ] `team8:run` asks whether to run it as a workflow; answer "yes, use a workflow"
- [ ] If it wrote a plan, the plan tab fills in while planning and goes away once the workflow starts
- [ ] `run`: agents grouped by phase, extract and verify
- [ ] `output`: the workflow's return value, laid out as sections
- [ ] `agents`: the ephemeral roster
- [ ] `journal`: each agent's return value, `null` for the blank PDF
- [ ] `usage`: token occupancy against what it billed
- [ ] Ask it to resume the workflow with only the verify step changed: `script` shows the extract agents served from cache
- [ ] Run log records the mode and its reason

## 4. Teammates: `todo-lab`

**Seed:** an empty repo with a README.

```
/team8:plan I want a simple todo app I can run locally: a small Node API that saves to a file, a React page to add, check off and delete todos, and a command-line client for when I'm in the terminal. It should come with a test that goes through the whole thing end to end.
```

- [ ] Closing says `mode: teammates` with a peak of 2 or more: the API contract first, then API, web and CLI at once in files that don't overlap, the end-to-end test last
- [ ] Whether it wrote a spec and plan. If it did, the plan tab fills in while planning
- [ ] `wall`: one column per teammate, lead on the left
- [ ] `tasks`: each task with its owner, blockers and state, and the waves unblocking in order
- [ ] `comms`: the `everyone` room, and teammates' reports to the lead
- [ ] `overview`: the brief (NOW, WAITING, NEXT), one row per agent
- [ ] `rail`: arrow keys move between agents
- [ ] `grid`: one pane per agent, up to 6
- [ ] `usage`: spend by model, cache-hit ratio, cost per task
- [ ] `NEEDS YOU`: a permission card when a teammate runs `npm install` or tests, allowed from the console
- [ ] Message a teammate from the composer, and it arrives
- [ ] Stop a teammate with ⏻, and the confirm prompt appears
- [ ] Run log records the mode and its reason

## Across scenarios

- [ ] Run two labs at once: the session switcher lists both, and you can move between them

## Known gaps

- `NEEDS YOU` only ever shows permission cards. The `plan` and `failure` card
  kinds are defined and drawn, but nothing emits them
  (`src/server/ingest/hooks.ts` is the only emitter), so no scenario can raise
  them. A teammate hitting an API error shows as `failed` on the agent, not as
  a card.
- `trace` nests by call depth only when a subagent spawns its own subagent,
  which none of these scenarios do.
- A full `grid` needs 5 teammates; `todo-lab` usually gets about 4.
