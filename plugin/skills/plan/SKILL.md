---
name: plan
description: Use when a feature, subsystem or multi-step change needs a design and an implementation plan before anyone writes code — "plan this", "let's design X", "plan it with the team", "plan and then run it". Brainstorms the design with the user into a spec, then a planner teammate writes the plan while a reviewer teammate checks it as it takes shape, the tasks land on the shared list, and the user approves before team8:run executes.
---

# Plan

## Overview

Three phases. Phases 1 and the plan-writing half of 2 are superpowers'
brainstorming and writing-plans, verbatim. team8 begins where the plan
becomes tasks: a reviewer teammate on the plan, tracks and a task list, a
run log, and the user's approval before anything runs.

1. **Brainstorm** — the lead turns the idea into an approved spec, in dialogue with the user.
2. **Plan** — a planner teammate writes the plan from this skill's `writing-plans.md` and creates the tasks; a reviewer teammate checks the skeleton, then the full plan; they iterate between themselves.
3. **Approve** — the lead shows the task table and asks: adjust, or run. Nothing runs before the user says so.

**Core principle: the lead's context is for the user, not for the plan.** A plan
that executes across context-free teammates is the largest document in the flow.
It is written by a teammate, reviewed by a different teammate, and reaches the
lead as a task table and a file path.

**Every batch leaves a run log** at `docs/team8/runs/YYYY-MM-DD-<topic>.md`:
who ran, on what model, how many rounds, what it was estimated at, what it
cost. It is how a past session gets debugged. See The run log below.

## Phase 1: Brainstorm

Help turn ideas into fully formed designs and specs through natural collaborative dialogue.

Start by classifying how much process the request needs, then work
through your path: understand the context, refine the idea, present a
design, and get your human partner's approval.

<HARD-GATE>
Do NOT invoke any implementation skill, write any code, scaffold any
project, or take any implementation action until you have told your
human partner what you intend and they have approved it. This applies
to EVERY task on EVERY path below — the ceremony scales with the task;
the approval gate never does.
</HARD-GATE>

### Three Paths

Before your first question, classify the request and say the
classification out loud — "this looks bounded, so I'll present a short
design here rather than write a spec" — so your human partner can
override it:

- **Spike** — a feasibility question ("can we...", "is it possible...",
  "quick and dirty is fine") whose output is an answer, not code you
  keep. Present the question and what you'll try in 2-3 sentences, get
  a nod, then find out as cheaply as correctness allows. No design
  doc, no spec file. Report findings as a recommendation; anything you
  built stays labeled throwaway.
- **Bounded** — a well-scoped change to code that already exists in
  this repo: a new flag, a small endpoint, a one-file fix.
  Understanding the kind of app is not enough — bounded means the flow
  you are changing is already here to read. If there is no existing
  flow to change, the task is not bounded. Ask the clarifying
  questions that matter, present a short design IN CHAT (a few
  sentences to a few short paragraphs), and STOP. Implementation
  starts only after your human partner says yes to that design — a
  bounded task's approval is as hard a gate as an architectural
  one. No spec file, no implementation plan document.
- **Architectural** — new projects, new subsystems, changes that
  restructure how components fit together or alter interfaces others
  depend on. Follow the full process: questions, approaches, sectioned
  design, written spec, then Phase 2.

When in doubt between two paths, take the heavier one. The ratchet is
one-way: hidden complexity discovered mid-task upgrades the path —
stop, say so, and step up. Nothing downgrades mid-task.

### Anti-Pattern: "Too Simple To Need Approval"

Every path ends with your human partner approving your intent before
implementation. A todo list, a single-function utility, a config
change — the design may be two sentences in chat, but you MUST present
it and get approval. "Simple" tasks are where unexamined assumptions
cause the most wasted work. What scales with simplicity is the
artifact, never the approval.

### Red Flags

| Thought | Reality |
|---------|---------|
| "This is too simple to need a design" | Simple means a short design, not no design. Two sentences in chat, then approval. |
| "I'll call it bounded and skip the spec" | Reaching for a label to skip work IS the doubt — take the heavier path. |
| "It's bounded and the design is obvious — I'll start while they read it" | The gate is the approval, not the design's length. Present, then stop until you hear yes. |
| "I understand this kind of app, so it's bounded" | Bounded measures the repo, not your familiarity. A new project has no existing flow — it is architectural. |
| "The spike works, so I'll keep the code" | A spike's output is an answer. Keeping the code is a new request — classify it. |
| "It grew, but I'm almost done — no need to re-classify" | Hidden complexity upgrades the path mid-task. Stop and say so. |
| "They approved the spike, so the follow-up change is approved too" | Each task gets its own classification and its own approval. |

### Checklist

Classify first, announce the path, then create a task for each item on
your path and complete them in order.

**Spike:**
1. **Explore project context** — enough to frame the probe
2. **Present question + probe plan** — 2-3 sentences
3. **Get approval** — a nod is enough
4. **Investigate** — as cheaply as correctness allows
5. **Report findings** — a recommendation; label anything built as throwaway

**Bounded:**
1. **Explore project context** — check files, docs, recent commits
2. **Ask clarifying questions** — one at a time, the ones that matter
3. **Present short design in chat** — approach, files touched, testing
4. **Get approval** — STOP and wait for an explicit yes; presenting the design and starting in the same breath is skipping the gate
5. **Implement** — hand the work to `team8:tasks`, then `team8:run`; no plan document

**Architectural:**
1. **Explore project context** — check files, docs, recent commits
2. **Offer the visual companion just-in-time** — NOT upfront. The first time a question would genuinely be clearer shown than described, offer it then (its own message); on approval its browser tab opens for you. If no visual question ever arises, never offer it. See the Visual Companion section below.
3. **Ask clarifying questions** — one at a time, understand purpose/constraints/success criteria
4. **Propose 2-3 approaches** — with trade-offs and your recommendation
5. **Present design** — in sections scaled to their complexity, get user approval after each section
6. **Write design doc** — save to `docs/team8/specs/YYYY-MM-DD-<topic>-design.md` and commit
7. **Spec self-review** — quick inline check for placeholders, contradictions, ambiguity, scope (see below)
8. **User reviews written spec** — ask user to review the spec file before proceeding
9. **Transition to Phase 2** — dispatch planner and reviewer

### Process Flow

```dot
digraph brainstorming {
    "Classify: spike / bounded / architectural" [shape=diamond];
    "Present question + probe (2-3 sentences)" [shape=box];
    "Ask clarifying questions (bounded)" [shape=box];
    "Present short design in chat" [shape=box];
    "Human approves?" [shape=diamond];
    "Investigate; report recommendation" [shape=doublecircle];
    "team8:tasks, then team8:run (no plan doc)" [shape=doublecircle];
    "Explore project context" [shape=box];
    "Ask clarifying questions" [shape=box];
    "Propose 2-3 approaches" [shape=box];
    "Present design sections" [shape=box];
    "User approves design?" [shape=diamond];
    "Write design doc" [shape=box];
    "Spec self-review\n(fix inline)" [shape=box];
    "User reviews spec?" [shape=diamond];
    "Phase 2: dispatch planner + reviewer" [shape=doublecircle];
    "Hidden complexity? Upgrade path" [shape=box];

    "Classify: spike / bounded / architectural" -> "Present question + probe (2-3 sentences)" [label="spike"];
    "Classify: spike / bounded / architectural" -> "Ask clarifying questions (bounded)" [label="bounded"];
    "Classify: spike / bounded / architectural" -> "Explore project context" [label="architectural"];
    "Present question + probe (2-3 sentences)" -> "Human approves?";
    "Ask clarifying questions (bounded)" -> "Present short design in chat";
    "Present short design in chat" -> "Human approves?";
    "Human approves?" -> "Investigate; report recommendation" [label="spike: yes"];
    "Human approves?" -> "team8:tasks, then team8:run (no plan doc)" [label="bounded: yes"];
    "Hidden complexity? Upgrade path" -> "Classify: spike / bounded / architectural";
    "Explore project context" -> "Ask clarifying questions";
    "Ask clarifying questions" -> "Propose 2-3 approaches";
    "Propose 2-3 approaches" -> "Present design sections";
    "Present design sections" -> "User approves design?";
    "User approves design?" -> "Present design sections" [label="no, revise"];
    "User approves design?" -> "Write design doc" [label="yes"];
    "Write design doc" -> "Spec self-review\n(fix inline)";
    "Spec self-review\n(fix inline)" -> "User reviews spec?";
    "User reviews spec?" -> "Write design doc" [label="changes requested"];
    "User reviews spec?" -> "Phase 2: dispatch planner + reviewer" [label="approved"];
}
```

**Terminal states are path-bound.** Architectural: the ONLY thing that
follows brainstorming is Phase 2 — never frontend-design, mcp-builder, or
any other implementation skill. Bounded: after approval, the work goes to
`team8:tasks` and then `team8:run`; no plan document. Spike: the terminal
state is a reported recommendation.

### The Process

The subsections below serve the bounded and architectural paths (a
spike stops at "present the probe, get a nod"). Sections from
**Exploring approaches** onward are architectural-path depth — for
bounded work, context plus a few questions plus a short in-chat design
is the whole process.

**Understanding the idea:**

- Check out the current project state first (files, docs, recent commits)
- Before asking detailed questions, assess scope: if the request describes multiple independent subsystems (e.g., "build a platform with chat, file storage, billing, and analytics"), flag this immediately. Don't spend questions refining details of a project that needs to be decomposed first.
- If the project is too large for a single spec, help the user decompose into sub-projects: what are the independent pieces, how do they relate, what order should they be built? Then brainstorm the first sub-project through the normal design flow. Each sub-project gets its own spec → plan → implementation cycle.
- For appropriately-scoped projects, ask questions one at a time to refine the idea
- Prefer multiple choice questions when possible, but open-ended is fine too
- Only one question per message - if a topic needs more exploration, break it into multiple questions
- Focus on understanding: purpose, constraints, success criteria

**Exploring approaches:**

- Propose 2-3 different approaches with trade-offs
- Present options conversationally with your recommendation and reasoning
- Lead with your recommended option and explain why
- YAGNI ruthlessly - remove unnecessary features from every approach and design

**Presenting the design:**

- Once you believe you understand what you're building, present the design
- Scale each section to its complexity: a few sentences if straightforward, up to 200-300 words if nuanced
- Ask after each section whether it looks right so far
- Cover: architecture, components, data flow, error handling, testing
- Be ready to go back and clarify if something doesn't make sense

**Design for isolation and clarity:**

- Break the system into smaller units that each have one clear purpose, communicate through well-defined interfaces, and can be understood and tested independently
- For each unit, you should be able to answer: what does it do, how do you use it, and what does it depend on?
- Can someone understand what a unit does without reading its internals? Can you change the internals without breaking consumers? If not, the boundaries need work.
- Smaller, well-bounded units are also easier for you to work with - you reason better about code you can hold in context at once, and your edits are more reliable when files are focused. When a file grows large, that's often a signal that it's doing too much.

**Working in existing codebases:**

- Explore the current structure before proposing changes. Follow existing patterns.
- Where existing code has problems that affect the work (e.g., a file that's grown too large, unclear boundaries, tangled responsibilities), include targeted improvements as part of the design - the way a good developer improves code they're working in.
- Don't propose unrelated refactoring. Stay focused on what serves the current goal.

### After the Design (architectural path)

**Documentation:**

- Write the validated design (spec) to `docs/team8/specs/YYYY-MM-DD-<topic>-design.md`
  - (User preferences for spec location override this default)
- Use elements-of-style:writing-clearly-and-concisely skill if available
- Commit the design document to git

**Spec Self-Review:**
After writing the spec document, look at it with fresh eyes:

1. **Placeholder scan:** Any "TBD", "TODO", incomplete sections, or vague requirements? Fix them.
2. **Internal consistency:** Do any sections contradict each other? Does the architecture match the feature descriptions?
3. **Scope check:** Is this focused enough for a single implementation plan, or does it need decomposition?
4. **Ambiguity check:** Could any requirement be interpreted two different ways? If so, pick one and make it explicit.

Fix any issues inline. No need to re-review — just fix and move on.

**User Review Gate:**
After the spec review loop passes, ask the user to review the written spec before proceeding:

> "Spec written and committed to `<path>`. Please review it and let me know if you want to make any changes before we start writing out the implementation plan."

Wait for the user's response. If they request changes, make them and re-run the spec review loop. Only proceed once the user approves.

**Implementation:**

- Go to Phase 2. Do NOT invoke any other skill; the planner teammate writes the plan.

### Visual Companion

A browser-based companion for showing mockups, diagrams, and visual options during brainstorming. Available as a tool — not a mode. Accepting the companion means it's available for questions that benefit from visual treatment; it does NOT mean every question goes through the browser.

**Offering the companion (just-in-time):** Do NOT offer it upfront. Wait until a question would genuinely be clearer shown than told — a real mockup / layout / diagram question, not merely a UI *topic*. The first time that happens, offer it then, as its own message:
> "This next part might be easier if I show you — I can put together mockups, diagrams, and comparisons in a browser tab as we go. It's still new and can be token-intensive. Want me to? I'll open it for you."

**This offer MUST be its own message.** Only the offer — no clarifying question, summary, or other content. Wait for the user's response. If they accept, start the server with `--open` so their browser opens to the first screen automatically. If they decline, continue text-only and don't offer again unless they raise it.

**Per-question decision:** Even after the user accepts, decide FOR EACH QUESTION whether to use the browser or the terminal. The test: **would the user understand this better by seeing it than reading it?**

- **Use the browser** for content that IS visual — mockups, wireframes, layout comparisons, architecture diagrams, side-by-side visual designs
- **Use the terminal** for content that is text — requirements questions, conceptual choices, tradeoff lists, A/B/C/D text options, scope decisions

A question about a UI topic is not automatically a visual question. "What does personality mean in this context?" is a conceptual question — use the terminal. "Which wizard layout works better?" is a visual question — use the browser.

If they agree to the companion, read the detailed guide before proceeding:
this skill's `visual-companion.md` (beside this file; its `scripts/` sit next to it)

## Phase 2: Plan

**Before dispatching:** cut the batch branch — `git checkout -b <topic>` — so
the plan and the tasks land on it and `team8:run` finds it checked out. Open
the run log from the template below, fill the Brainstorm section, and commit
it on the branch.

Spawn both teammates in one message. Never pass `isolation: "worktree"` — it
spawns a subagent, not a teammate, and a subagent has no task tools and no
mailbox. Verify both names in `~/.claude/teams/<team>/config.json` right after:
`jq -r '.members[].name' ~/.claude/teams/<team>/config.json`.

Both run on the top tier at high effort. The plan is the contract every
downstream task consumes, and the review is what everything downstream builds
on. This is not the place to save a model tier.

Both dispatches name this skill's `writing-plans.md` by absolute path. Resolve
it from this skill's directory before composing the prompts.

### The planner's dispatch

> You are **planner**. Read `<absolute path to writing-plans.md>` first, top to
> bottom — it is how the plan gets written, and it ends with the two
> checkpoints with reviewer and how the tasks get created. Then read
> `<spec path>` — it is the authority; the plan argues from it. Write the plan
> exactly as that file says. Save the skeleton and message **reviewer**
> (checkpoint 1); finish the steps, run the self-review, create the tasks, and
> message reviewer again with the task count (checkpoint 2). Do not implement
> anything. Do not spawn subagents. Do not commit. Files you own: the plan
> file only. The branch `<branch>` is already checked out; do not run
> `git checkout -b`.

### The reviewer's dispatch

> You are **reviewer**. Read `<absolute path to writing-plans.md>` first — it
> is the format and the rules the plan has to meet. You are read-only: touch no
> file. Do not spawn subagents. Do not implement.
>
> **Checkpoint 1 — the skeleton.** When **planner** messages you a plan path,
> read the spec and the plan. Run checks 1 and 3 below on what is there, and
> check the file structure against the code: open the files the plan names
> and confirm the paths, the line ranges and the patterns it says it copies.
> Message planner the findings now; a wrong decomposition is cheap to fix
> before the task steps exist and expensive after.
>
> **Checkpoint 2 — the full plan.** When planner messages the task count,
> read the plan again and the task list (`TaskList`, then `TaskGet` on each).
> Run every check, and write the result of each even when clean:
>
> 1. **Spec coverage.** Every requirement in the spec → the task that implements
>    it. A requirement with no task is Blocking.
> 2. **Placeholders.** Every pattern in the No Placeholders section. Each is
>    Blocking.
> 3. **Interface consistency.** A table: every pair of tasks where one consumes
>    what the other produces — the two tasks, the produced name and type, the
>    consumed name and type, match or mismatch. A mismatch is Blocking.
> 4. **Tracks.** A table: every pair of tasks that touch the same file — same
>    track or different tracks, read from the task descriptions. Different
>    tracks sharing a file is Blocking: they will run in parallel in one
>    checkout. A task whose description names no track is Blocking.
> 5. **Blockers.** Every `blockedBy` names something the blocked task reads. Every
>    consumes/produces pair from check 3 has a blocker. A blocker with no read is
>    Minor; a missing blocker is Blocking.
> 6. **Sizing.** Model matches the description's verbs per `team8:tasks`:
>    mechanical → haiku, standard → sonnet, judgment → opus. A judgment task on
>    haiku is Blocking; the rest is Minor.
> 7. **Standalone descriptions.** No task description points at a conversation.
>    Every one names its plan section, its track and its owned files. Missing is
>    Blocking.
> 8. **One to one.** Task count and subjects match the plan.
> 9. **Right-sizing.** A task a reviewer could not reject on its own, or a step
>    that is more than one action, is Minor.
>
> Message planner the findings, each labelled Blocking or Minor with the task
> number and the fix. Re-check after each revision, scoped to the findings and
> the changelog line. Three rounds maximum after checkpoint 2. When no Blocking
> finding remains, or after round three, message the lead: `APPROVED` or
> `RESIDUALS`, the plan path, the task count, the tracks, and any open finding
> with both sides in one line each.

### While they run

Stay free. Relay one line per checkpoint and per round to the user. If planner
asks a question only the spec's author can answer, answer it from the spec or
ask the user — never guess on their behalf. If the reviewer reports
`RESIDUALS`, rule on each open finding yourself: apply it via planner, or
state why the plan stands. Do not edit the plan in the lead session.

## Phase 3: Approve

<HARD-GATE>
Nothing executes until the user has read the task table and said start. An
approved plan is not an approved run.
</HARD-GATE>

1. **Ask both teammates to stop.** The plan file is the memory. Executors are
   fresh teammates that `team8:run` dispatches.
2. **Fill the Plan section of the run log** — agents, checkpoint findings,
   rounds, residuals, task and track counts, the estimate total — and
   **commit the plan and the log** on the batch branch, so every executor can
   read them.
3. **Close with the `team8:tasks` ending**: the plan path, the table (task,
   blocked by, model, estimate) with its total, the notes (the mode and its
   reason per `team8:tasks` Mode, tracks, what starts now, sizing you were
   unsure about, any residual ruling), and the one ask —
   adjust models, adjust tasks, or start the work. `AskUserQuestion` where
   available, multiSelect on. Adjusting a model re-prices its row; show the
   new total.
4. **Adjust** edits the task list and, where it changes the plan, the plan
   file. Show the table again and ask again.
5. On **start the work**, invoke `team8:run` in the stated mode. The tasks and
   the branch exist; `run` skips its own task creation and branch cut.

## The run log

One file per batch, `docs/team8/runs/YYYY-MM-DD-<topic>.md`, on the batch
branch, so it lands with the PR and a past batch can be read back next to
its spec, its plan and its diff. Phase 2 opens it, Phase 3 fills the Plan
section, `team8:run` fills the Run section at close. Numbers are the ones
you have at the time; a line you cannot fill yet stays as its placeholder
until the phase that can.

```markdown
# Run log — <topic>

spec: docs/team8/specs/<file>.md
plan: docs/team8/plans/<file>.md
branch: <branch>
pr: <url, at close>

## Brainstorm
- path: spike | bounded | architectural
- spec rounds with the user: <n>

## Plan
- planner: opus · high · reviewer: opus · high
- checkpoint 1: <n> findings · checkpoint 2: <n>/3 rounds · residuals: <n> (<one line each>)
- tasks: <n> · tracks: <n> · mode: solo | subagents | teammates | workflow — <reason>
- estimate: ≈$<total> (per task in the plan's table)

## Run
- executors: <name> · <model> · <effort> · track <X>, one line each
- track reviews: <X> <n>/3 rounds, one entry each · residuals: <n>
- actual: ≈$<total> · per agent: <name> ≈$<n>, one entry each
- estimate vs actual: <one line>
- went wrong / change next time: <one line each, or "nothing">
```

## Common mistakes

| Mistake | Fix |
|---|---|
| Lead writes the plan itself "to save a spawn" | The plan is the biggest document in the flow. It goes to planner |
| Planner and reviewer as subagents | Subagents cannot message each other; every round would pass through the lead. Teammates |
| Dispatching planner before the user approved the spec | The hard gate is the approval, not the spec's length |
| Invoking `run` because the reviewer said APPROVED | The reviewer approves the plan. Only the user approves the run |
| Planner writes all task steps before reviewer sees the skeleton | Checkpoint 1 exists so decomposition errors cost minutes, not the whole plan |
| Reviewer told what not to flag | Let it flag; rule on it in the residuals |
| Plan sections that say "similar to Task N" | Repeat the code. Implementers read one section, out of order |
| Tracks decided in `run` | They are decided when the tasks are created, with file ownership. `run` counts them |
| Planner keeps running as "plan owner" during execution | The plan file answers executor questions. Stop both teammates before `run` |
| Dispatch prompts say "read writing-plans.md" without a path | A teammate cannot find this skill's directory. Absolute path |
| Run log left for "after" | After is when the numbers are gone. Fill each section in the phase that has them |
