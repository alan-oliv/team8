# The Lead Writes the Plan Implementation Plan

> **For agentic workers:** this plan is executed by teammates that `team8:run` dispatches from the shared task list. Read your own task section. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The lead writes the plan in its own session, one task at a time with a progress line, and the console shows it being written in a `plan` tab with a progress bar.

**Architecture:** Skill text moves Phase 2 of `team8:plan` from planner and reviewer teammates into the lead; `team8:tasks` gains two parallel-safety checks both entry points share. On the console, a pure reader (`src/server/plan.ts`) finds the plan from the lead's own `Write`/`Edit` calls, the publish boundary stamps `TeamState.plan` on every frame, `GET /api/plan-task` serves one task's section, and a new `Plan` view draws the bar and the task rows.

**Tech Stack:** TypeScript, Node 22 `fs` (sync), React 19, Vitest + Testing Library.

**Spec:** `docs/team8/specs/2026-09-13-lead-writes-plan-design.md`

## Global Constraints

- No new dependencies.
- Code in a plan is written, not run: no builds, prototypes or scratch code while planning (skill rule).
- Progress line, one cell per task: `Plan ▓▓▓░░░░ 3/7 · Task 3: <title>`.
- Plan path pattern: `/docs/team8/plans/[^/]+\.md$`, matched against the absolute `file_path` of the lead's own `Write` and `Edit` calls.
- Task heading: `^### Task (\d+): (.+)$`. A task is written when its section has a line matching `^- \[[ x]\] \*\*Step`. Text before the first task, and every line inside a fenced code block, is ignored.
- `PlanProgress = { path: string; mtime: number; tasks: Array<{ n: number; title: string; written: boolean }> }`, on `TeamState.plan?`, absent when the lead has written no plan.
- Endpoint: `GET /api/plan-task?n=<n>` → `200 { n, text }`; `400` without a numeric `n`; `404` when there is no plan or no such task.
- The `plan` tab joins the solo and team switchers only while `state.plan` exists; never the workflow layout.
- Run log Plan section: `plan: written by the lead · self-review fixes: <n>`; a batch with no plan writes `plan: none · tasks from <Jira | Linear | the user> via team8:tasks`.
- Commits: plain-sentence subjects like the repo's history, stage paths by name, no AI attribution or "generated with" footer.

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `plugin/skills/plan/SKILL.md` | Modify | Phase 2 by the lead; planner and reviewer removed |
| `plugin/skills/plan/writing-plans.md` | Modify | "Writing in Pieces" replaces the reviewer checkpoints |
| `README.md` | Modify | The `team8:plan` paragraph |
| `plugin/skills/tasks/SKILL.md` | Modify | Two checks before the closing |
| `src/shared/domain.ts` | Modify | `PlanProgress`, `TeamState.plan`, `'plan'` in `ViewId` |
| `src/server/plan.ts` | Create | Find, read and parse the plan; one task's section |
| `src/server/plan.test.ts` | Create | Unit tests for `plan.ts` |
| `src/server/index.ts` | Modify | Stamp `plan` at publish; wire `planTask` |
| `src/server/http.ts` | Modify | `GET /api/plan-task` |
| `src/server/http.test.ts` | Modify | Endpoint tests |
| `src/server/index.wiring.test.ts` | Modify | The plan on a real server's frame |
| `src/web/views/Plan.tsx` | Create | The plan tab |
| `src/web/views/Plan.test.tsx` | Create | Tests for the tab |
| `src/web/views/Tasks.tsx` | Modify | Export `STRIP` and `BAR` for reuse |
| `src/web/state/useTeamState.ts` | Modify | `'plan'` a valid URL view; `withPlan` helper |
| `src/web/chrome/StatusBar.tsx` | Modify | Offers `plan` while `state.plan` exists |
| `src/web/chrome/StatusBar.test.tsx` | Modify | Tab tests |
| `src/web/App.tsx` | Modify | Render the tab; fall back when there is no plan |
| `src/web/App.test.tsx` | Modify | The tab, and the URL fallback |
| `plugin/dist/**` | Rebuild | `npm run build` |

Tracks: A owns the skill and README files (Tasks 1, 2). B owns `src/shared/domain.ts` and `src/server/**` (Tasks 3, 4). C owns the `src/web/**` files above (Task 5). D owns `plugin/dist/**` (Task 6).

---

### Task 1: The lead writes the plan in the plan skill

**Files:**
- Modify: `plugin/skills/plan/SKILL.md`
- Modify: `plugin/skills/plan/writing-plans.md`
- Modify: `README.md:168-171`

**Interfaces:**
- Consumes: nothing.
- Produces: the Phase 2 text other skills point at; the run log template's `plan:` line, which `team8:run` copies when it creates a log itself.

- [ ] **Step 1: Rewrite the description and the overview in `plugin/skills/plan/SKILL.md`**

In the frontmatter, replace the `description:` line with:

```markdown
description: Use when a feature, subsystem or multi-step change needs a design and an implementation plan before anyone writes code — "plan this", "let's design X", "plan it with the team", "plan and then run it". Brainstorms the design with the user into a spec, then the lead writes the plan in the same session a task at a time, the tasks land on the shared list, and the user approves before team8:run executes.
```

Replace the four overview lines starting `Three phases. Phases 1 and the plan-writing half of 2` with:

```markdown
Three phases. Phase 1 and the plan-writing half of 2 are superpowers'
brainstorming and writing-plans, verbatim. team8 begins where the plan
becomes tasks: tracks and a task list, a run log, and the user's approval
before anything runs.
```

Replace list item 2 (`2. **Plan** — a planner teammate writes the plan…`) with:

```markdown
2. **Plan** — the lead writes the plan from this skill's `writing-plans.md` in the same session, skeleton first and then one task at a time, and creates the tasks through `team8:tasks`.
```

Replace the paragraph starting `**Core principle: the lead's context is for the user, not for the plan.**` (four lines, ending `lead as a task table and a file path.`) with:

```markdown
**Core principle: the plan is written where the user can see it.** The lead
that brainstormed with the user writes the plan in the same session, a task
at a time, with a progress line after each. A separate planner starts without
the conversation, and every question it has becomes a relay round the user
waits on.
```

- [ ] **Step 2: Point Phase 1's exit at the lead**

Replace checklist item `9. **Transition to Phase 2** — dispatch planner and reviewer` with:

```markdown
9. **Transition to Phase 2** — the lead writes the plan
```

In the dot graph, replace both occurrences of `"Phase 2: dispatch planner + reviewer"` (the node declaration and the `"User reviews spec?"` edge) with `"Phase 2: the lead writes the plan"`.

Replace the line `- Go to Phase 2. Do NOT invoke any other skill; the planner teammate writes the plan.` with:

```markdown
- Go to Phase 2. Do NOT invoke any other skill; the lead writes the plan with this skill's `writing-plans.md`.
```

- [ ] **Step 3: Replace Phase 2**

Replace everything from the line `## Phase 2: Plan` up to, not including, the line `## Phase 3: Approve` with:

```markdown
## Phase 2: Plan

The lead writes the plan in this session. Planning is solo: nothing is
spawned — no teammate, no subagent — until the user approves the task table
in Phase 3.

**Before writing:** cut the batch branch — `git checkout -b <topic>` — so
the plan and the tasks land on it and `team8:run` finds it checked out. Open
the run log from the template below, fill the Brainstorm section, and commit
it on the branch.

Read this skill's `writing-plans.md` top to bottom, then write the plan
exactly as it says:

1. **Skeleton, one Write:** header, Global Constraints, file structure, and
   every task's `### Task N: <title>` heading with its `Files` and
   `Interfaces` blocks. No steps yet. Tell the user
   `Plan ░░░░░░░ 0/7 · skeleton written`, one cell per task.
2. **One Edit per task, in order,** adding that task's steps. After each, one
   line to the user: `Plan ▓▓▓░░░░ 3/7 · Task 3: <title>`. The console's plan
   tab counts the same thing from the file.
3. **Self-review inline:** writing-plans' three checks, fixed in place. No
   subagent.
4. **Tasks through `team8:tasks`,** as writing-plans' "Create the Tasks" says,
   including the two checks `team8:tasks` runs before its closing.

**Code in the plan is written, not run.** No builds, prototypes or scratch
code while planning. If a step rests on something unproven, ask the user;
settling it is a spike in Phase 1, not work in Phase 2.

```

- [ ] **Step 4: Drop the teammates from Phase 3**

In `## Phase 3: Approve`, delete item 1 (`1. **Ask both teammates to stop.** …`, two lines) and renumber the rest 1–4. Replace the new item 1 (`**Fill the Plan section of the run log** — agents, checkpoint findings, …`, three lines) with:

```markdown
1. **Fill the Plan section of the run log** — self-review fixes, task and
   track counts, the estimate total — and **commit the plan and the log** on
   the batch branch, so every executor can read them.
```

- [ ] **Step 5: Update the run log template and Common Mistakes**

In the run log template's `## Plan` block, replace these two lines:

```markdown
- planner: opus · high · reviewer: opus · high
- checkpoint 1: <n> findings · checkpoint 2: <n>/3 rounds · residuals: <n> (<one line each>)
```

with:

```markdown
- plan: written by the lead · self-review fixes: <n> (a batch that skipped this skill: `plan: none · tasks from <Jira | Linear | the user> via team8:tasks`)
```

Replace the whole `## Common mistakes` table (header row included) with:

```markdown
| Mistake | Fix |
|---|---|
| Dispatching a planner or reviewer teammate | The lead writes the plan in this session. A separate planner starts without the conversation, and every question becomes a relay round the user waits on |
| The whole plan in one Write | Skeleton first, then one Edit per task, so the user and the console see it fill in |
| Building or running the plan's code "to be sure" | Code in the plan is written, not run. Unproven means ask the user; it's a Phase 1 spike |
| A review subagent on the plan | Self-review inline. Superpowers measured subagent plan review: twice the time, same quality |
| Writing the plan before the user approved the spec | The hard gate is the approval, not the spec's length |
| Invoking `run` because the plan looks done | Only the user approves the run |
| Plan sections that say "similar to Task N" | Repeat the code. Implementers read one section, out of order |
| Tracks decided in `run` | They are decided when the tasks are created, with file ownership. `run` counts them |
| Run log left for "after" | After is when the numbers are gone. Fill each section in the phase that has them |
```

- [ ] **Step 6: Replace the reviewer checkpoints in `plugin/skills/plan/writing-plans.md`**

Replace the whole `## Checkpoints With the Reviewer` section (its heading through the paragraph ending `Three rounds at most; after that the lead rules.`) with:

```markdown
## Writing in Pieces

Everything above is how the plan is written. This is where team8 deviates:
the plan is written where the user can watch it, and it ends as tasks on the
shared list, not as an execution choice.

**Skeleton first, in one Write.** The header, Global Constraints, the file
structure, and every task's `### Task N: <title>` heading with its `Files`
and `Interfaces` blocks, with no steps yet. Tell the user
`Plan ░░░░░░░ 0/7 · skeleton written`, one cell per task.

**Then one Edit per task, in order,** adding that task's steps. After each,
one line to the user: `Plan ▓▓▓░░░░ 3/7 · Task 3: <title>`. The console
counts written tasks from the file — a task is written once its section has a
`- [ ] **Step` line — so keep the heading and the checkbox shape exactly as
the template above has them.

**Code in the plan is written, not run.** No builds, prototypes or scratch
code. If a step rests on something unproven, stop and ask the user.

The self-review runs after the last task; the tasks come after it.
```

At the end of `## Create the Tasks`, after the paragraph ending `A task missing `metadata` is not created.`, add:

```markdown

Then run the two checks `team8:tasks` runs before its closing: no file owned
by two tracks, and every consumer blocked on its producer.
```

- [ ] **Step 7: Update the README**

In `README.md`, replace the paragraph starting `` `team8:plan` takes an idea to an approved spec with you, then a planner `` (four lines) with:

```markdown
`team8:plan` takes an idea to an approved spec with you, then writes the plan
in the same session, a task at a time, with a progress line after each and a
`plan` tab in the console that fills in as it goes. What comes back to you is
the task table and a file path, and nothing runs until you say so.
```

- [ ] **Step 8: Check nothing still names the planner or its checkpoints**

Run: `grep -n -i "planner\|Checkpoint 1\|Checkpoint 2\|reviewer teammate\|both teammates" plugin/skills/plan/SKILL.md plugin/skills/plan/writing-plans.md README.md`
Expected: only the Common Mistakes row `Dispatching a planner or reviewer teammate` and the core-principle sentence `A separate planner starts without…` match.

- [ ] **Step 9: Commit**

```bash
git add plugin/skills/plan/SKILL.md plugin/skills/plan/writing-plans.md README.md
git commit -m "Have the lead write the plan a task at a time, with no planner or reviewer teammates"
```

### Task 2: Two parallel checks in team8:tasks

**Files:**
- Modify: `plugin/skills/tasks/SKILL.md`

**Interfaces:**
- Consumes: nothing.
- Produces: the checks `plan/SKILL.md` Phase 2 step 4 refers to as "the two checks `team8:tasks` runs before its closing".

- [ ] **Step 1: Add the checks section**

In `plugin/skills/tasks/SKILL.md`, insert this section immediately before the heading `## After creating: the mode, the table, the notes, the ask`:

```markdown
## Before the closing: two checks

Tracks run in parallel in one checkout, so two mistakes break a run wherever
the tasks came from — a plan, a Jira or Linear list, or the user. Check both
on the finished list, before writing the closing. Both fixes touch the task
list only, never a plan.

1. **No file belongs to two tracks.** List each task's owned files by track.
   A file under two tracks: move both tasks into one track, in order, so one
   teammate does them one after the other, and correct the track line in
   their descriptions with `TaskUpdate`.
2. **Every consumer waits on its producer.** A task that reads a type, field,
   route, file or decision another task produces has that task in its
   `blockedBy`. Missing: `TaskUpdate` with `addBlockedBy`.

Say the result in the notes: `checks: tracks disjoint · blockers complete`,
or what was fixed.

```

- [ ] **Step 2: Check it landed once, before the closing**

Run: `grep -n "^## Before the closing: two checks\|^## After creating" plugin/skills/tasks/SKILL.md`
Expected: two lines, `## Before the closing: two checks` first.

- [ ] **Step 3: Commit**

```bash
git add plugin/skills/tasks/SKILL.md
git commit -m "Check that tracks own disjoint files and consumers wait on producers before the task table"
```

### Task 3: The plan reader

**Files:**
- Modify: `src/shared/domain.ts`
- Create: `src/server/plan.ts`
- Create: `src/server/plan.test.ts`

**Interfaces:**
- Consumes: `StoredEvent` (`src/server/store.ts`), `TranscriptPayload` (`src/server/project.ts`).
- Produces:
  - `src/shared/domain.ts`: `export interface PlanProgress { path: string; mtime: number; tasks: PlanTask[] }`, `export interface PlanTask { n: number; title: string; written: boolean }`, `TeamState.plan?: PlanProgress`, and `'plan'` in `ViewId`.
  - `src/server/plan.ts`: `planPathOf(events: StoredEvent[], lead: string): string | undefined`, `parsePlan(text: string): PlanTask[]`, `sectionOf(text: string, n: number): string | undefined`, `createPlanReader(): PlanReader` where `PlanReader = { read(events: StoredEvent[], lead: string, session: string): PlanProgress | undefined; task(n: number): string | undefined }`.

- [ ] **Step 1: Add the types to `src/shared/domain.ts`**

Change the `ViewId` line (line 7) to:

```ts
export type ViewId = 'wall' | 'overview' | 'comms' | 'tasks' | 'rail' | 'grid' | 'usage' | 'trace' | 'plan';
```

Insert immediately before `export interface TeamState {`:

```ts
export interface PlanTask {
  n: number;
  title: string;
  /** Its section has a `- [ ] **Step` line; until then the task is only outlined. */
  written: boolean;
}

/**
 * The plan the lead is writing, as the plan tab draws it. Section text stays
 * off the frame — a plan runs about 60 KB — and comes from `GET /api/plan-task`.
 */
export interface PlanProgress {
  path: string;
  mtime: number;
  tasks: PlanTask[];
}

```

In `TeamState`, after the `brief?: Brief;` field, add:

```ts
  /** Absent until the lead writes a file under `docs/team8/plans/`. */
  plan?: PlanProgress;
```

- [ ] **Step 2: Write the failing tests**

Create `src/server/plan.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { StoredEvent } from './store';
import { createPlanReader, parsePlan, planPathOf, sectionOf } from './plan';

const PLAN = `# Thing Implementation Plan

- [ ] **Step 0: a stray checkbox before any task**

### Task 1: Add the type

**Files:**
- Modify: \`src/a.ts\`

- [ ] **Step 1: Write the failing test**

### Task 2: Serve it

**Files:**
- Create: \`src/b.ts\`

### Task 3: Draw it

- [x] **Step 1: Done already**
`;

// A plan quoting another plan's template: four backticks around three.
const QUOTED =
  '### Task 1: Real\n\n````markdown\n### Task 9: Quoted\n\n```ts\nconst x = 1;\n```\n\n- [ ] **Step 1: A quoted step**\n````\n';

function toolCall(agent: string, name: string, filePath: string, seq: number): StoredEvent {
  return {
    seq,
    ts: 0,
    kind: 'transcript',
    agent,
    payload: {
      agent,
      records: [
        {
          type: 'assistant',
          uuid: `rec-${seq}`,
          message: {
            role: 'assistant',
            content: [{ type: 'tool_use', id: `toolu_${seq}`, name, input: { file_path: filePath } }],
          },
        },
      ],
    },
  };
}

describe('parsePlan', () => {
  it('reads each task heading and whether its steps are written', () => {
    expect(parsePlan(PLAN)).toEqual([
      { n: 1, title: 'Add the type', written: true },
      { n: 2, title: 'Serve it', written: false },
      { n: 3, title: 'Draw it', written: true },
    ]);
  });

  it('has no tasks before the first heading', () => {
    expect(parsePlan('# Just a header\n\n- [ ] **Step 1: stray**\n')).toEqual([]);
  });

  it('ignores headings and steps quoted in fenced code', () => {
    expect(parsePlan(QUOTED)).toEqual([{ n: 1, title: 'Real', written: false }]);
  });
});

describe('sectionOf', () => {
  it('returns one task from its heading to the next', () => {
    const section = sectionOf(PLAN, 2)!;
    expect(section.startsWith('### Task 2: Serve it')).toBe(true);
    expect(section).toContain('src/b.ts');
    expect(section).not.toContain('Task 3');
  });

  it('runs the last task to the end of the file', () => {
    expect(sectionOf(PLAN, 3)).toBe('### Task 3: Draw it\n\n- [x] **Step 1: Done already**');
  });

  it('knows no task that is not there', () => {
    expect(sectionOf(PLAN, 9)).toBeUndefined();
  });

  it('keeps a quoted heading inside the section that quotes it', () => {
    expect(sectionOf(QUOTED, 1)).toBe(QUOTED.trimEnd());
    expect(sectionOf(QUOTED, 9)).toBeUndefined();
  });
});

describe('planPathOf', () => {
  it('takes the newest plan file the lead wrote or edited', () => {
    const events = [
      toolCall('team-lead', 'Write', '/r/docs/team8/plans/a.md', 1),
      toolCall('team-lead', 'Edit', '/r/src/x.ts', 2),
      toolCall('team-lead', 'Edit', '/r/docs/team8/plans/b.md', 3),
    ];
    expect(planPathOf(events, 'team-lead')).toBe('/r/docs/team8/plans/b.md');
  });

  it('ignores other agents, reads, specs and nested folders', () => {
    const events = [
      toolCall('planner', 'Write', '/r/docs/team8/plans/theirs.md', 1),
      toolCall('team-lead', 'Read', '/r/docs/team8/plans/read.md', 2),
      toolCall('team-lead', 'Write', '/r/docs/team8/specs/s-design.md', 3),
      toolCall('team-lead', 'Write', '/r/docs/team8/plans/old/x.md', 4),
    ];
    expect(planPathOf(events, 'team-lead')).toBeUndefined();
  });
});

describe('createPlanReader', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'plan-'));
    mkdirSync(path.join(dir, 'docs', 'team8', 'plans'), { recursive: true });
    file = path.join(dir, 'docs', 'team8', 'plans', '2026-09-13-thing.md');
    writeFileSync(file, PLAN);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('reads the progress of the plan the lead wrote', () => {
    const reader = createPlanReader();
    const plan = reader.read([toolCall('team-lead', 'Write', file, 1)], 'team-lead', 's1');
    expect(plan).toEqual({ path: file, mtime: statSync(file).mtimeMs, tasks: parsePlan(PLAN) });
  });

  it('keeps the path after the records that named it are gone', () => {
    const reader = createPlanReader();
    reader.read([toolCall('team-lead', 'Write', file, 1)], 'team-lead', 's1');
    expect(reader.read([], 'team-lead', 's1')?.path).toBe(file);
  });

  it('does not hand one session another session\'s plan', () => {
    const reader = createPlanReader();
    reader.read([toolCall('team-lead', 'Write', file, 1)], 'team-lead', 's1');
    expect(reader.read([], 'team-lead', 's2')).toBeUndefined();
  });

  it('re-reads the file when it changes', () => {
    const reader = createPlanReader();
    const events = [toolCall('team-lead', 'Write', file, 1)];
    reader.read(events, 'team-lead', 's1');
    writeFileSync(file, PLAN.replace('- Create: `src/b.ts`', '- Create: `src/b.ts`\n\n- [ ] **Step 1: Serve**'));
    const later = new Date(Date.now() + 5_000);
    utimesSync(file, later, later);
    const plan = reader.read(events, 'team-lead', 's1')!;
    expect(plan.tasks[1].written).toBe(true);
    expect(plan.mtime).toBe(statSync(file).mtimeMs);
  });

  it('serves one task\'s section of the plan it last read', () => {
    const reader = createPlanReader();
    expect(reader.task(1)).toBeUndefined();
    reader.read([toolCall('team-lead', 'Write', file, 1)], 'team-lead', 's1');
    expect(reader.task(2)).toBe(sectionOf(PLAN, 2));
    expect(reader.task(9)).toBeUndefined();
  });

  it('has no plan once the file is gone', () => {
    const reader = createPlanReader();
    const events = [toolCall('team-lead', 'Write', file, 1)];
    reader.read(events, 'team-lead', 's1');
    rmSync(file);
    expect(reader.read(events, 'team-lead', 's1')).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run src/server/plan.test.ts`
Expected: FAIL — `Failed to resolve import "./plan"`.

- [ ] **Step 4: Write `src/server/plan.ts`**

```ts
import { readFileSync, statSync } from 'node:fs';
import type { PlanProgress, PlanTask } from '../shared/domain';
import type { TranscriptPayload } from './project';
import type { StoredEvent } from './store';

const PLAN_PATH = /\/docs\/team8\/plans\/[^/]+\.md$/;
const TASK_HEADING = /^### Task (\d+): (.+)$/;
const STEP = /^- \[[ x]\] \*\*Step/;
const FENCE = /^\s*(`{3,}|~{3,})/;

type ToolUse = { type?: string; name?: string; input?: { file_path?: unknown } };

/** The plan is whichever file the lead itself wrote, never a folder guess. */
export function planPathOf(events: StoredEvent[], lead: string): string | undefined {
  let found: string | undefined;
  for (const ev of events) {
    if (ev.kind !== 'transcript') continue;
    const payload = ev.payload as TranscriptPayload;
    if (payload.agent !== lead) continue;
    for (const rec of payload.records) {
      const content = rec.message?.content;
      if (!Array.isArray(content)) continue;
      for (const block of content as ToolUse[]) {
        if (block.type !== 'tool_use' || (block.name !== 'Write' && block.name !== 'Edit')) continue;
        const file = block.input?.file_path;
        if (typeof file === 'string' && PLAN_PATH.test(file)) found = file;
      }
    }
  }
  return found;
}

/**
 * Per line, whether it sits inside a fenced code block. A plan that quotes
 * another plan — this repo's plans about the plan skill do — must not grow
 * tasks from its examples. A fence closes only on a bare run of the same
 * character at least as long, so ```` can wrap ```.
 */
function fencedLines(lines: string[]): boolean[] {
  let open: string | null = null;
  return lines.map((line) => {
    const fence = FENCE.exec(line)?.[1];
    if (open === null) {
      if (!fence) return false;
      open = fence;
      return true;
    }
    if (fence && fence[0] === open[0] && fence.length >= open.length && line.trim() === fence) open = null;
    return true;
  });
}

export function parsePlan(text: string): PlanTask[] {
  const lines = text.split('\n');
  const fenced = fencedLines(lines);
  const tasks: PlanTask[] = [];
  lines.forEach((line, i) => {
    if (fenced[i]) return;
    const heading = TASK_HEADING.exec(line);
    if (heading) tasks.push({ n: Number(heading[1]), title: heading[2].trim(), written: false });
    else if (tasks.length > 0 && STEP.test(line)) tasks[tasks.length - 1].written = true;
  });
  return tasks;
}

export function sectionOf(text: string, n: number): string | undefined {
  const lines = text.split('\n');
  const fenced = fencedLines(lines);
  const headingAt = (i: number) => (fenced[i] ? null : TASK_HEADING.exec(lines[i]));
  const start = lines.findIndex((_, i) => headingAt(i)?.[1] === String(n));
  if (start === -1) return undefined;
  const next = lines.findIndex((_, i) => i > start && headingAt(i) !== null);
  return lines.slice(start, next === -1 ? lines.length : next).join('\n').trimEnd();
}

export interface PlanReader {
  read(events: StoredEvent[], lead: string, session: string): PlanProgress | undefined;
  task(n: number): string | undefined;
}

function textOf(file: string): string | undefined {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

export function createPlanReader(): PlanReader {
  // The store keeps 1,000 transcript records per agent, so the writes that
  // named the plan age out of a long session; the path outlives them here.
  // ponytail: in memory only, so a restart after they aged out loses the tab;
  // persist it per session if a tab that old ever matters.
  const known = new Map<string, string>();
  let last: PlanProgress | undefined;

  return {
    read(events, lead, session) {
      const seen = planPathOf(events, lead);
      if (seen) known.set(session, seen);
      const file = known.get(session);
      if (!file) return (last = undefined);
      let mtime: number;
      try {
        mtime = statSync(file).mtimeMs;
      } catch {
        return (last = undefined);
      }
      if (last?.path === file && last.mtime === mtime) return last;
      const text = textOf(file);
      if (text === undefined) return (last = undefined);
      return (last = { path: file, mtime, tasks: parsePlan(text) });
    },
    task(n) {
      if (!last) return undefined;
      const text = textOf(last.path);
      return text === undefined ? undefined : sectionOf(text, n);
    },
  };
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run src/server/plan.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: exit 0, no output. (`'plan'` in `ViewId` breaks nothing: no `Record<ViewId, …>` exists.)

- [ ] **Step 7: Commit**

```bash
git add src/shared/domain.ts src/server/plan.ts src/server/plan.test.ts
git commit -m "Read the plan the lead is writing: its tasks, which are written, and one task's section"
```

### Task 4: The plan on the frame and GET /api/plan-task

**Files:**
- Modify: `src/server/index.ts`
- Modify: `src/server/http.ts`
- Modify: `src/server/http.test.ts`
- Modify: `src/server/index.wiring.test.ts`

**Interfaces:**
- Consumes: `createPlanReader`, `PlanReader` (Task 3); `PlanProgress` (Task 3).
- Produces: `TeamState.plan` on every published frame; `HttpDeps.planTask?: (n: number) => string | undefined`; `GET /api/plan-task?n=<n>` → `{ n: number; text: string }`.

- [ ] **Step 1: Write the failing endpoint tests**

In `src/server/http.test.ts`, add after `let briefCalls: string[];`:

```ts
/** What `/api/plan-task` can resolve, keyed by task number. A miss is no plan or no such task. */
let planTasks: Record<number, string>;
```

In `boot()`, after `workflowScripts = {};`, add:

```ts
  planTasks = {};
```

In the deps passed to `createHttpServer` in `boot()`, after the `lineText:` line, add:

```ts
    planTask: (n: number) => planTasks[n],
```

Insert immediately before `describe('GET /api/line', () => {`:

```ts
describe('GET /api/plan-task', () => {
  let server: Server;
  let url: string;

  beforeEach(async () => {
    ({ server, url } = await boot(false));
  });
  afterEach(() => shutdown(server));

  it('serves one task\'s section of the plan', async () => {
    planTasks[2] = '### Task 2: Serve it\n\n- [ ] **Step 1: Serve**';
    const res = await fetch(`${url}/api/plan-task?n=2`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ n: 2, text: planTasks[2] });
  });

  it('requires a task number', async () => {
    expect((await fetch(`${url}/api/plan-task`)).status).toBe(400);
    expect((await fetch(`${url}/api/plan-task?n=two`)).status).toBe(400);
  });

  it('404s when there is no plan or no such task', async () => {
    expect((await fetch(`${url}/api/plan-task?n=9`)).status).toBe(404);
  });
});

```

- [ ] **Step 2: Write the failing wiring test**

At the end of `src/server/index.wiring.test.ts`, add:

```ts
describe('the plan on the wire', () => {
  it('publishes the plan a session without a team is writing, and serves one task of it', async () => {
    home = await layout();
    const planFile = path.join(home, 'repo', 'docs', 'team8', 'plans', '2026-09-13-thing.md');
    await fs.mkdir(path.dirname(planFile), { recursive: true });
    await fs.writeFile(
      planFile,
      '# Thing\n\n### Task 1: Add the type\n\n- [ ] **Step 1: Test it**\n\n### Task 2: Serve it\n',
    );
    // A session with no config.json, as in the retarget test above: the lead
    // planning alone is exactly this shape.
    const solo = path.join(home, 'projects', SLUG, SOLO_SESSION);
    await fs.mkdir(path.join(solo, 'subagents'), { recursive: true });
    await fs.writeFile(
      path.join(solo, `${SOLO_SESSION}.jsonl`),
      `${JSON.stringify({
        type: 'assistant',
        uuid: '55555555-5555-5555-5555-555555555555',
        timestamp: new Date().toISOString(),
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'toolu_plan1', name: 'Write', input: { file_path: planFile, content: '' } }],
        },
      })}\n`,
    );

    const url = await boot(home);
    expect((await selectSession(url, SOLO_SESSION)).status).toBe(200);

    let state = await snapshot(url);
    const deadline = Date.now() + 5_000;
    while (!state.plan && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 25));
      state = await snapshot(url);
    }

    expect(state.plan?.path).toBe(planFile);
    expect(state.plan?.tasks).toEqual([
      { n: 1, title: 'Add the type', written: true },
      { n: 2, title: 'Serve it', written: false },
    ]);
    const res = await fetch(`${url}/api/plan-task?n=1`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { text: string }).text.startsWith('### Task 1: Add the type')).toBe(true);
  }, 20_000);
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run src/server/http.test.ts -t "plan-task" && npx vitest run src/server/index.wiring.test.ts -t "plan on the wire"`
Expected: FAIL — the endpoint test gets a non-200 for `?n=2` (no route yet), and the wiring test finds `state.plan` undefined after 5 s.

- [ ] **Step 4: Add the route to `src/server/http.ts`**

In `HttpDeps`, after the `lineText?:` line, add:

```ts
  /** One task's section of the plan the lead is writing, for a plan-tab row opened by hand. */
  planTask?: (n: number) => string | undefined;
```

Right after the `/api/line` block (the `if` that ends with `json(res, 200, { id, text });` and `return;`), add:

```ts

        // Kept off the frame for the same reason as /api/line: a plan runs
        // about 60 KB, and a section is opened by hand, one row at a time.
        if (method === 'GET' && route === '/api/plan-task' && deps.planTask) {
          const n = Number(url.searchParams.get('n'));
          if (!Number.isInteger(n) || n < 1) {
            json(res, 400, { error: 'bad request', message: 'n must be a task number' });
            return;
          }
          const text = deps.planTask(n);
          if (text === undefined) {
            json(res, 404, { error: 'not found', message: 'no plan, or no such task in it' });
            return;
          }
          json(res, 200, { n, text });
          return;
        }
```

- [ ] **Step 5: Stamp the plan at publish in `src/server/index.ts`**

With the other `./` imports at the top, add:

```ts
import { createPlanReader } from './plan';
```

After `const briefs = createBriefs({ publish: () => hub.publish() });`, add:

```ts
  const plans = createPlanReader();
```

In `publish`, after `const workflows = foldWorkflows(events);`, add:

```ts
    const lead = (team.agents.find((a) => a.isLead) ?? team.agents[0])?.name;
```

In the object `publish` returns, after `brief: briefs.current(),`, add:

```ts
      // Keyed on the server's own lead session, not team.leadSessionId: a
      // session with no team config projects that as '' for every session.
      plan: lead ? plans.read(events, lead, leadSessionId ?? '') : undefined,
```

In the `createHttpServer` deps, after the `lineText:` line, add:

```ts
    planTask: (n: number) => plans.task(n),
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run src/server/http.test.ts src/server/index.wiring.test.ts src/server/plan.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: exit 0, no output.

- [ ] **Step 8: Commit**

```bash
git add src/server/http.ts src/server/http.test.ts src/server/index.ts src/server/index.wiring.test.ts
git commit -m "Put the plan the lead is writing on every frame and serve one task of it at /api/plan-task"
```

### Task 5: The plan tab

**Files:**
- Create: `src/web/views/Plan.tsx`
- Create: `src/web/views/Plan.test.tsx`
- Modify: `src/web/views/Tasks.tsx`
- Modify: `src/web/state/useTeamState.ts`
- Modify: `src/web/chrome/StatusBar.tsx`
- Modify: `src/web/chrome/StatusBar.test.tsx`
- Modify: `src/web/App.tsx`
- Modify: `src/web/App.test.tsx`

**Interfaces:**
- Consumes: `PlanProgress`, `PlanTask`, `'plan'` in `ViewId` (Task 3); `GET /api/plan-task?n=<n>` → `{ n, text }` (Task 4, over HTTP only; the tests stub `fetch`).
- Produces: `export function Plan({ plan }: { plan: PlanProgress })`; `export function withPlan(views: readonly ViewId[], hasPlan: boolean): readonly ViewId[]`; `StatusBar` offers `plan` from its existing `state` prop, with no new prop.

- [ ] **Step 1: Export the strip styles from `src/web/views/Tasks.tsx`**

Change `const STRIP: CSSProperties = {` to `export const STRIP: CSSProperties = {`, and `const BAR: CSSProperties = {` to `export const BAR: CSSProperties = {`. Nothing else in the file changes.

- [ ] **Step 2: Write the failing tab tests**

Create `src/web/views/Plan.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PlanProgress } from '../../shared/domain';
import { Plan } from './Plan';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const PLAN: PlanProgress = {
  path: '/Users/me/code/app/docs/team8/plans/2026-09-13-thing.md',
  mtime: 1000,
  tasks: [
    { n: 1, title: 'Add the type', written: true },
    { n: 2, title: 'Serve it', written: false },
    { n: 3, title: 'Draw it', written: false },
  ],
};

function stubSection(text: string) {
  const fetchMock = vi.fn((_path: string) =>
    Promise.resolve(new Response(JSON.stringify({ n: 2, text }), { status: 200 })),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

it('shows how much of the plan is written', () => {
  render(<Plan plan={PLAN} />);
  expect(screen.getByTestId('plan-pct').textContent).toBe('33%');
  expect(screen.getByTestId('plan-count').textContent).toBe('1 of 3 tasks written');
  expect(screen.getByTestId('plan-bar').style.width).toBe(`${(1 / 3) * 100}%`);
  expect(screen.getByTestId('plan-path').textContent).toBe('docs/team8/plans/2026-09-13-thing.md');
});

it('marks each task written or outlined', () => {
  render(<Plan plan={PLAN} />);
  expect(screen.getAllByTestId('plan-state').map((s) => s.textContent)).toEqual([
    'written',
    'outlined',
    'outlined',
  ]);
});

it('draws a plan with no task headings yet as 0 of 0 and no rows', () => {
  render(<Plan plan={{ ...PLAN, tasks: [] }} />);
  expect(screen.getByTestId('plan-count').textContent).toBe('0 of 0 tasks written');
  expect(screen.queryAllByTestId('plan-row')).toHaveLength(0);
});

it('opens a task\'s section on click and closes it on a second click', async () => {
  const fetchMock = stubSection('### Task 2: Serve it\n\n**Files:**');
  render(<Plan plan={PLAN} />);
  fireEvent.click(screen.getAllByTestId('plan-row')[1]);
  await waitFor(() =>
    expect(screen.getByTestId('plan-section').textContent).toBe('### Task 2: Serve it\n\n**Files:**'),
  );
  expect(fetchMock).toHaveBeenCalledWith('/api/plan-task?n=2');
  fireEvent.click(screen.getAllByTestId('plan-row')[1]);
  expect(screen.queryByTestId('plan-section')).toBeNull();
});

it('fetches an open section again when the plan file changes', async () => {
  const fetchMock = stubSection('### Task 2: Serve it');
  const { rerender } = render(<Plan plan={PLAN} />);
  fireEvent.click(screen.getAllByTestId('plan-row')[1]);
  await waitFor(() => expect(screen.getByTestId('plan-section').textContent).toBe('### Task 2: Serve it'));
  rerender(<Plan plan={{ ...PLAN, mtime: 2000 }} />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
});
```

In `src/web/chrome/StatusBar.test.tsx`, add after the test `exposes the switcher as a tablist with the seven views`:

```tsx
function tabsWithPlan(solo: boolean): (string | null)[] {
  render(
    <StatusBar
      state={{ ...sampleTeamState(), plan: { path: '/r/docs/team8/plans/p.md', mtime: 1, tasks: [] } }}
      view="wall"
      onViewChange={vi.fn()}
      now={FIXTURE_NOW}
      teamsOpen={false}
      onTeamsOpenChange={vi.fn()}
      onSelectRun={vi.fn()}
      appearance={APPEARANCE}
      solo={solo}
    />,
  );
  return within(screen.getByRole('tablist')).getAllByRole('tab').map((t) => t.textContent);
}

it('offers plan second, in the team and the solo switcher, while there is a plan', () => {
  expect(tabsWithPlan(false)).toEqual(['wall', 'plan', 'overview', 'comms', 'tasks', 'rail', 'grid', 'usage']);
  cleanup();
  expect(tabsWithPlan(true)).toEqual(['stream', 'plan', 'overview']);
});
```

In `src/web/App.test.tsx`, add at the end of the file:

```tsx
const PLAN_ON_FRAME = {
  path: '/r/docs/team8/plans/p.md',
  mtime: 1,
  tasks: [{ n: 1, title: 'Add the type', written: false }],
};

it('opens the plan tab while the lead is writing a plan', () => {
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', { ...sampleTeamState(), plan: PLAN_ON_FRAME }));
  fireEvent.click(screen.getByRole('tab', { name: 'plan' }));
  expect(screen.getByTestId('plan')).toBeTruthy();
});

it('opens straight onto the plan from the URL when there is one', () => {
  window.history.replaceState(null, '', '/?view=plan');
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', { ...sampleTeamState(), plan: PLAN_ON_FRAME }));
  expect(screen.getByTestId('plan')).toBeTruthy();
});

it('falls back to the wall when the URL asks for a plan the session does not have', () => {
  window.history.replaceState(null, '', '/?view=plan');
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', sampleTeamState()));
  expect(screen.getByTestId('wall')).toBeTruthy();
  expect(screen.queryByTestId('plan')).toBeNull();
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run src/web/views/Plan.test.tsx src/web/chrome/StatusBar.test.tsx src/web/App.test.tsx`
Expected: FAIL — `Failed to resolve import "./Plan"`, and the StatusBar and App tests find no `plan` tab.

- [ ] **Step 4: Offer `plan` as a view in `src/web/state/useTeamState.ts`**

Change `const URL_VIEW_IDS: readonly ViewId[] = [...VIEW_IDS, 'trace'];` to:

```ts
const URL_VIEW_IDS: readonly ViewId[] = [...VIEW_IDS, 'trace', 'plan'];
```

After the `soloViews` function, add:

```ts
/** `plan` rides second, after the stream or wall, while the lead has a plan on the frame. */
export function withPlan(views: readonly ViewId[], hasPlan: boolean): readonly ViewId[] {
  return hasPlan ? [views[0], 'plan', ...views.slice(1)] : views;
}
```

- [ ] **Step 5: Put the tab in `src/web/chrome/StatusBar.tsx`**

Change `import { soloViews, VIEW_IDS } from '../state/useTeamState';` to:

```ts
import { soloViews, VIEW_IDS, withPlan } from '../state/useTeamState';
```

Change `views={solo ? soloViews(hasSubagents) : VIEW_IDS}` to:

```tsx
      views={withPlan(solo ? soloViews(hasSubagents) : VIEW_IDS, state.plan !== undefined)}
```

- [ ] **Step 6: Render the tab in `src/web/App.tsx`**

With the other `./views/` imports, add:

```ts
import { Plan } from './views/Plan';
```

Change `const view = store.view === 'trace' && !offersTrace ? 'wall' : store.view;` to:

```ts
  const view =
    (store.view === 'trace' && !offersTrace) || (store.view === 'plan' && !state?.plan) ? 'wall' : store.view;
```

After `{view === 'tasks' && <Tasks tasks={state.tasks} teamName={state.teamName} />}`, add:

```tsx
        {view === 'plan' && state.plan && <Plan plan={state.plan} />}
```

- [ ] **Step 7: Write `src/web/views/Plan.tsx`**

```tsx
import { useEffect, useState, type CSSProperties } from 'react';
import type { PlanProgress } from '../../shared/domain';
import { BAR, STRIP } from './Tasks';

const PLANS_DIR = 'docs/team8/plans/';

const ROW: CSSProperties = {
  display: 'flex',
  gap: '10px',
  alignItems: 'baseline',
  width: '100%',
  padding: '12px 16px',
  border: 'none',
  borderBottom: '1px solid var(--color-neutral-900)',
  background: 'transparent',
  font: 'inherit',
  fontSize: '11.5px',
  textAlign: 'left',
  cursor: 'pointer',
};

const SECTION: CSSProperties = {
  margin: 0,
  padding: '10px 16px 14px 70px',
  borderBottom: '1px solid var(--color-neutral-900)',
  color: 'var(--color-neutral-400)',
  fontSize: '11px',
  whiteSpace: 'pre-wrap',
};

/**
 * One task's section, fetched when its row opens and again whenever the file
 * changes — a row opened while outlined fills in as the lead writes it.
 */
function useSection(n: number | null, mtime: number): string | null {
  const [got, setGot] = useState<{ n: number; text: string | null } | null>(null);

  useEffect(() => {
    if (n === null) return;
    let current = true;
    void (async () => {
      let text: string | null = null;
      try {
        const res = await fetch(`/api/plan-task?n=${n}`);
        if (res.ok) text = ((await res.json()) as { text: string }).text;
      } catch {
        // The console went away; the next frame's mtime retries.
      }
      if (current) setGot({ n, text });
    })();
    return () => {
      current = false;
    };
  }, [n, mtime]);

  return got && got.n === n ? got.text : null;
}

export function Plan({ plan }: { plan: PlanProgress }) {
  const [open, setOpen] = useState<number | null>(null);
  const section = useSection(open, plan.mtime);
  const total = plan.tasks.length;
  const written = plan.tasks.filter((t) => t.written).length;
  const share = total === 0 ? 0 : written / total;
  const at = plan.path.indexOf(PLANS_DIR);

  return (
    <div data-testid="plan" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={STRIP}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
          <span style={{ color: 'var(--color-neutral-600)', fontSize: '10px', letterSpacing: '.12em', flex: 'none' }}>
            PLAN
          </span>
          <span data-testid="plan-pct" style={{ color: 'var(--color-text)', fontSize: '12px', flex: 'none' }}>
            {`${Math.round(share * 100)}%`}
          </span>
          <span
            data-testid="plan-count"
            style={{ color: 'var(--color-neutral-600)', fontSize: '10.5px', flex: 'none', whiteSpace: 'nowrap' }}
          >
            {`${written} of ${total} tasks written`}
          </span>
          <span style={{ flex: 1, minWidth: '8px' }} />
          <span
            data-testid="plan-path"
            style={{
              color: 'var(--color-neutral-600)',
              fontSize: '10px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {at === -1 ? plan.path : plan.path.slice(at)}
          </span>
        </div>
        <div style={BAR}>
          <span data-testid="plan-bar" style={{ width: `${share * 100}%`, background: 'var(--color-accent-500)' }} />
        </div>
      </div>

      <div className="tscroll" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {plan.tasks.map((task) => (
          <div key={task.n}>
            <button
              type="button"
              data-testid="plan-row"
              style={ROW}
              onClick={() => setOpen((o) => (o === task.n ? null : task.n))}
            >
              <span style={{ width: '44px', color: 'var(--color-neutral-600)' }}>{task.n}</span>
              <span
                style={{
                  flex: 1,
                  color: 'var(--color-neutral-300)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {task.title}
              </span>
              <span
                data-testid="plan-state"
                style={{ width: '76px', color: task.written ? 'var(--color-accent-300)' : 'var(--color-neutral-600)' }}
              >
                {task.written ? 'written' : 'outlined'}
              </span>
            </button>
            {open === task.n && (
              <pre data-testid="plan-section" style={SECTION}>
                {section ?? ''}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Run the tests to see them pass**

Run: `npx vitest run src/web/views/Plan.test.tsx src/web/chrome/StatusBar.test.tsx src/web/App.test.tsx src/web/views/Tasks.test.tsx`
Expected: PASS.

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`
Expected: exit 0, no output.

- [ ] **Step 10: Commit**

```bash
git add src/web/views/Plan.tsx src/web/views/Plan.test.tsx src/web/views/Tasks.tsx src/web/state/useTeamState.ts src/web/chrome/StatusBar.tsx src/web/chrome/StatusBar.test.tsx src/web/App.tsx src/web/App.test.tsx
git commit -m "Add a plan tab that shows the plan filling in, with a bar and a row per task"
```

### Task 6: Rebuild the bundle and run everything

**Files:**
- Rebuild: `plugin/dist/**`

**Interfaces:**
- Consumes: Tasks 4 and 5 committed.
- Produces: `plugin/dist` matching the source; a green `npm test` and `npm run typecheck`.

- [ ] **Step 1: Rebuild**

Run: `npm run build`
Expected: vite and esbuild both finish without errors.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0, no output.

- [ ] **Step 3: Run the whole suite**

Run: `npm test`
Expected: every test file passes, including `src/server/plan.test.ts` and `src/web/views/Plan.test.tsx`.

- [ ] **Step 4: Check the rebuild touched only the bundle**

Run: `git status --short`
Expected: only paths under `plugin/dist/`.

- [ ] **Step 5: Commit**

```bash
git add plugin/dist
git commit -m "Rebuild plugin/dist for the plan tab"
```

---

## After the batch

Not tasks: both need the user, after the PR is merged and the plugin reinstalled.

- **The skill:** one fresh-session `/team8:plan` on a small change. Check that a progress line follows every task, the console's plan tab counts up as tasks are written, no code is written outside the plan file, nothing is spawned before the task table, and planning takes a fraction of 391's 54 minutes.
- **The direct path:** one `team8:tasks` run on a short Jira or Linear list. Check that the two checks run before the closing and no plan tab appears.
