# team8 band and team pane Implementation Plan

> **For agentic workers:** this plan is executed by teammates that `team8:run` dispatches from the shared task list. Read your own task section. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw the team inside Claude Code: a band above the prompt listing each teammate and the task count, and a team pane (`/team8`, a band digit, or the lead's `team8:run`) with a team tab, a tasks tab and a field that prompts the lead.

**Architecture:** `plugin/hooks/team.ts` holds the rules as pure functions with no Claude Code imports, tested by vitest from `src/hooks/`. `plugin/hooks/team8.tsx` becomes the plugin's one hooks-module entry: it calls the wave notifier's `register` unchanged, keeps a snapshot (roster, `TaskList`, the console's `/health`, each teammate's last tool call) in module variables, and draws the band and the pane from it. `/team8:setup` gains an opt-in step for Claude Code's fullscreen layout, the only one that docks a pane as a side panel.

**Tech Stack:** Claude Code 2.1.296 mods (hooks module in TSX, `ui.render` on `AbovePrompt` and `Pane`), TypeScript, vitest, `claude plugin test`, `claude plugin validate`.

**Spec:** `docs/team8/specs/2026-10-11-team8-mod-band-pane-design.md`

## Global Constraints

- Claude Code 2.1.296. The mods API's types are the file the `plugin-authoring` skill names when it loads (`…/plugin-authoring/types/claude-code.d.ts`); grep it for a name rather than guessing a shape.
- Every function in a module file that takes `$` is a top-level `function` declaration (the validator refuses a `$` passed to anything else).
- Teammates only: `$.agent.list()` entries with a `teammateId`, minus `completed` and `killed`. No subagents.
- No NEEDS YOU section, no letter hotkeys, no plan approvals, no permission prompts, no stop or pause controls.
- Task ids are drawn `#4`. The console address is `http://127.0.0.1:4823/s/<session id>`, labelled `127.0.0.1:4823/s/<first 8 of the id>`.
- Colours: accent `#9184d9`, fail `#c98d8d`, warn `#d99e5c`; bar completed `#796cbf`, claimed `#d2cefd`, rest `#292b31`; dim is `dimColor`.
- Glyphs: `●` working, `○` idle, `✕` blocked or failed.
- Pane: `$.ui.open({ id: 'team8', title: 'team8', focus: true, closeOnEscape: true, rows: 16, columns: 46 })` for the person's opens; the `team8:run` open leaves out `focus`.
- Nothing in `$.state` or `$.store`; module variables only.
- `plugin/dist` is never committed. The module ships as source; Claude Code compiles it.
- Commit by pathspec, message first: `git commit -m "…" -- <paths>`. No AI attribution in commits.

## File structure

| File | Task | Responsibility |
|---|---|---|
| `plugin/hooks/team.ts` (create) | 1 | Pure rules: member rows and states, band detail, task counts, claimed and blocked rows, bar widths, console link, `ago`, activity line, team name |
| `src/hooks/team.test.ts` (create) | 1 | vitest for `team.ts` |
| `plugin/hooks/team8.tsx` (create) | 2 | The hooks-module entry: notifier, snapshot and refresh, `/team8`, auto-open on `team8:run`, band, pane |
| `plugin/hooks/hooks.json` (modify) | 2 | `modules` → `["./team8.tsx"]`; one sentence in `description` |
| `plugin/hooks/team8.test.ts` (create) | 2 | `claude plugin test`: band and pane mount on terminal and desktop; digit, Lead submit and `team8:run` behaviour |
| `plugin/commands/setup.md` (modify) | 3 | The opt-in `"tui": "fullscreen"` step |

`plugin/hooks/wave.ts` and `plugin/hooks/wave-notify.ts` are not changed.

---

### Task 1: The band's and pane's rules

**Files:**
- Create: `plugin/hooks/team.ts`
- Test: `src/hooks/team.test.ts`

**Interfaces:**
- Consumes: nothing. `team.ts` imports no file at all: Claude Code's module loader wants `./x.ts` specifiers, which the repo's `tsc` refuses without `allowImportingTsExtensions`.
- Produces, all exported from `plugin/hooks/team.ts`:
  - `type Task = { id: string; subject: string; status: string; owner?: string; blockedBy: readonly string[] }` (the shape of `TaskList`'s entries, as `wave.ts`'s `ListedTask`)
  - `type RosterAgent = { id: string; name?: string; teammateId?: string; status: string }`
  - `type Activity = { text: string; at: number }`
  - `type MemberState = 'working' | 'idle' | 'blocked' | 'failed'`
  - `type Member = { id: string; name: string; state: MemberState; taskId?: string; needs?: string; activity: string; at?: number }`
  - `members(roster: readonly RosterAgent[], tasks: readonly Task[], activity: ReadonlyMap<string, Activity>): Member[]`
  - `bandDetail(m: Member): string`
  - `type TaskCounts = { completed: number; claimed: number; blocked: number; total: number }`
  - `taskCounts(tasks: readonly Task[]): TaskCounts`
  - `type TaskRow = { id: string; subject: string; state: 'claimed' | 'blocked'; right: string }`
  - `claimedAndBlocked(tasks: readonly Task[]): TaskRow[]`
  - `barCells(c: TaskCounts, width: number): { completed: number; claimed: number; blocked: number; rest: number }`
  - `type Health = { ok?: boolean; watching?: { kind?: string; id?: string; name?: string }; tabs?: number }`
  - `type ConsoleLink = { href: string; label: string; watching?: number }`
  - `consoleLink(health: Health | undefined, sessionId: string, team: string | undefined): ConsoleLink | undefined`
  - `teamOf(roster: readonly RosterAgent[]): string | undefined`
  - `ago(at: number | undefined, now: number): string`
  - `activityLine(tool: string, input: Readonly<Record<string, unknown>>): string`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/team.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  activityLine,
  ago,
  bandDetail,
  barCells,
  claimedAndBlocked,
  consoleLink,
  members,
  taskCounts,
  teamOf,
  type Activity,
  type RosterAgent,
  type Task,
} from '../../plugin/hooks/team';

const mate = (name: string, status: string): RosterAgent => ({
  id: `a${name}-0000000000000001`,
  name,
  teammateId: `${name}@session-abcd1234`,
  status,
});
const task = (id: string, status: string, owner?: string, blockedBy: string[] = []): Task => ({
  id,
  subject: `Task ${id}`,
  status,
  owner,
  blockedBy,
});
const none = new Map<string, Activity>();

describe('members', () => {
  it('maps each roster status to a state', () => {
    const roster = ['running', 'pending', 'waiting', 'idle', 'failed'].map((s, i) => mate(`m${i}`, s));
    expect(members(roster, [], none).map((m) => m.state)).toEqual(['working', 'working', 'working', 'idle', 'failed']);
  });

  it('leaves out ended agents and agents that are not teammates', () => {
    const roster = [mate('done', 'completed'), mate('gone', 'killed'), { id: 'a1234', status: 'running' }, mate('live', 'running')];
    expect(members(roster, [], none).map((m) => m.name)).toEqual(['live']);
  });

  it('calls a working teammate with nothing claimed and a still-blocked task blocked', () => {
    const [m] = members([mate('Tom', 'running')], [task('9', 'pending', 'Tom', ['4'])], none);
    expect(m).toMatchObject({ state: 'blocked', taskId: '9', needs: '4', activity: 'needs #4' });
  });

  it('keeps a teammate working while it has a claimed task beside a blocked one', () => {
    const tasks = [task('9', 'pending', 'Vito', ['4']), task('5', 'in_progress', 'Vito')];
    expect(members([mate('Vito', 'running')], tasks, none)[0]).toMatchObject({ state: 'working', taskId: '5' });
  });

  it('shows the in-progress task before a pending one and ignores completed ones', () => {
    const tasks = [task('1', 'completed', 'Ana'), task('2', 'pending', 'Ana'), task('3', 'in_progress', 'Ana')];
    expect(members([mate('Ana', 'idle')], tasks, none)[0].taskId).toBe('3');
  });

  it('uses the last tool call as the activity, else the state word', () => {
    const activity = new Map([['aAna-0000000000000001', { text: 'Edit a.ts', at: 5 }]]);
    const [ana, bo] = members([mate('Ana', 'running'), mate('Bo', 'idle')], [], activity);
    expect(ana).toMatchObject({ activity: 'Edit a.ts', at: 5 });
    expect(bo).toMatchObject({ activity: 'idle', at: undefined });
  });
});

describe('bandDetail', () => {
  it('names the task of a working teammate and the state of any other', () => {
    const list = members(
      [mate('W', 'running'), mate('I', 'idle'), mate('B', 'running'), mate('F', 'failed'), mate('N', 'running')],
      [task('4', 'in_progress', 'W'), task('9', 'pending', 'B', ['3'])],
      none,
    );
    expect(list.map(bandDetail)).toEqual(['#4', 'idle', 'needs #3', 'failed', 'working']);
  });
});

describe('taskCounts and claimedAndBlocked', () => {
  const tasks = [task('1', 'completed', 'A'), task('2', 'in_progress', 'A'), task('3', 'pending', 'B', ['2']), task('4', 'pending')];

  it('counts completed, claimed, blocked and total', () => {
    expect(taskCounts(tasks)).toEqual({ completed: 1, claimed: 1, blocked: 1, total: 4 });
  });

  it('lists claimed tasks with their owner, then blocked ones with their first blocker', () => {
    expect(claimedAndBlocked(tasks)).toEqual([
      { id: '2', subject: 'Task 2', state: 'claimed', right: 'A' },
      { id: '3', subject: 'Task 3', state: 'blocked', right: 'needs #2' },
    ]);
  });
});

describe('barCells', () => {
  it('splits the width by count and always fills it exactly', () => {
    expect(barCells({ completed: 1, claimed: 1, blocked: 1, total: 4 }, 8)).toEqual({ completed: 2, claimed: 2, blocked: 2, rest: 2 });
    const c = barCells({ completed: 1, claimed: 1, blocked: 1, total: 3 }, 2);
    expect(c.completed + c.claimed + c.blocked + c.rest).toBe(2);
  });

  it('is all rest with no tasks', () => {
    expect(barCells({ completed: 0, claimed: 0, blocked: 0, total: 0 }, 5)).toEqual({ completed: 0, claimed: 0, blocked: 0, rest: 5 });
  });
});

describe('consoleLink', () => {
  const id = 'abcd1234-0000-0000-0000-000000000000';
  const link = { href: `http://127.0.0.1:4823/s/${id}`, label: '127.0.0.1:4823/s/abcd1234' };

  it('counts watchers only when the console watches this session or its team', () => {
    expect(consoleLink({ ok: true, watching: { kind: 'session', id }, tabs: 2 }, id, undefined)).toEqual({ ...link, watching: 2 });
    expect(consoleLink({ ok: true, watching: { kind: 'team', name: 'session-abcd1234' }, tabs: 1 }, id, 'session-abcd1234')).toEqual({ ...link, watching: 1 });
    expect(consoleLink({ ok: true, watching: { kind: 'team', name: 'session-other' }, tabs: 3 }, id, 'session-abcd1234')).toEqual(link);
  });

  it('gives nothing when the console is down or the session is unknown', () => {
    expect(consoleLink(undefined, id, undefined)).toBeUndefined();
    expect(consoleLink({ ok: false }, id, undefined)).toBeUndefined();
    expect(consoleLink({ ok: true }, '', undefined)).toBeUndefined();
  });
});

describe('teamOf', () => {
  it('reads the team from the first teammate id', () => {
    expect(teamOf([{ id: 'x', status: 'running' }, mate('Vito', 'running')])).toBe('session-abcd1234');
    expect(teamOf([])).toBeUndefined();
  });
});

describe('ago', () => {
  it('says now under a minute, then minutes, then hours', () => {
    expect(ago(1_000, 1_000)).toBe('now');
    expect(ago(0, 59_000)).toBe('now');
    expect(ago(0, 3 * 60_000)).toBe('3m');
    expect(ago(0, 2 * 3_600_000)).toBe('2h');
    expect(ago(undefined, 5)).toBe('');
  });
});

describe('activityLine', () => {
  it('names the tool and the first line of its first known argument', () => {
    expect(activityLine('Bash', { command: 'npm test\nmore', description: 'x' })).toBe('Bash npm test');
    expect(activityLine('Edit', { file_path: 'src/a.ts', old_string: 'x' })).toBe('Edit src/a.ts');
    expect(activityLine('TaskList', { tool: 'TaskList' })).toBe('TaskList');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/hooks/team.test.ts`
Expected: FAIL, `Failed to resolve import "../../plugin/hooks/team"`.

- [ ] **Step 3: Write the rules**

Create `plugin/hooks/team.ts`:

```ts
// The band's and team pane's rules, kept free of Claude Code imports so vitest
// and the repo's typecheck can load them; team8.tsx is the module around them.
// No relative imports either: Claude Code wants `./x.ts`, which tsc refuses.

export type Task = { id: string; subject: string; status: string; owner?: string; blockedBy: readonly string[] };
export type RosterAgent = { id: string; name?: string; teammateId?: string; status: string };
export type Activity = { text: string; at: number };
export type MemberState = 'working' | 'idle' | 'blocked' | 'failed';
export type Member = {
  id: string;
  name: string;
  state: MemberState;
  taskId?: string;
  needs?: string;
  activity: string;
  at?: number;
};

const ENDED = new Set(['completed', 'killed']);

export function members(roster: readonly RosterAgent[], tasks: readonly Task[], activity: ReadonlyMap<string, Activity>): Member[] {
  const out: Member[] = [];
  for (const a of roster) {
    if (!a.teammateId || !a.name || ENDED.has(a.status)) continue;
    const name = a.name;
    const own = tasks.filter((t) => t.owner === name);
    const claimed = own.find((t) => t.status === 'in_progress');
    const next = own.find((t) => t.status === 'pending');
    const blocked = own.find((t) => t.status === 'pending' && t.blockedBy.length > 0);
    let state: MemberState = a.status === 'failed' ? 'failed' : a.status === 'idle' ? 'idle' : 'working';
    // The console's rule (src/server/project.ts): working, nothing claimed, and
    // a task of its own still waiting on another.
    const needs = state === 'working' && !claimed ? blocked?.blockedBy[0] : undefined;
    if (needs) state = 'blocked';
    const last = activity.get(a.id);
    out.push({
      id: a.id,
      name,
      state,
      taskId: (claimed ?? (needs ? blocked : next))?.id,
      needs,
      activity: needs ? `needs #${needs}` : (last?.text ?? state),
      at: last?.at,
    });
  }
  return out;
}

export function bandDetail(m: Member): string {
  if (m.state === 'working') return m.taskId ? `#${m.taskId}` : 'working';
  return m.needs ? `needs #${m.needs}` : m.state;
}

export type TaskCounts = { completed: number; claimed: number; blocked: number; total: number };

export function taskCounts(tasks: readonly Task[]): TaskCounts {
  let completed = 0;
  let claimed = 0;
  let blocked = 0;
  for (const t of tasks) {
    if (t.status === 'completed') completed += 1;
    else if (t.status === 'in_progress') claimed += 1;
    else if (t.status === 'pending' && t.blockedBy.length > 0) blocked += 1;
  }
  return { completed, claimed, blocked, total: tasks.length };
}

export type TaskRow = { id: string; subject: string; state: 'claimed' | 'blocked'; right: string };

// TaskList's blockedBy holds only open blockers, so a non-empty one means blocked.
export function claimedAndBlocked(tasks: readonly Task[]): TaskRow[] {
  const claimed = tasks
    .filter((t) => t.status === 'in_progress')
    .map((t): TaskRow => ({ id: t.id, subject: t.subject, state: 'claimed', right: t.owner ?? '' }));
  const blocked = tasks
    .filter((t) => t.status === 'pending' && t.blockedBy.length > 0)
    .map((t): TaskRow => ({ id: t.id, subject: t.subject, state: 'blocked', right: `needs #${t.blockedBy[0]}` }));
  return [...claimed, ...blocked];
}

// Cumulative ends, so rounding never leaves the bar a cell short or long.
export function barCells(c: TaskCounts, width: number): { completed: number; claimed: number; blocked: number; rest: number } {
  if (c.total === 0) return { completed: 0, claimed: 0, blocked: 0, rest: width };
  const end = (n: number) => Math.round((n / c.total) * width);
  const completed = end(c.completed);
  const claimed = end(c.completed + c.claimed);
  const blocked = end(c.completed + c.claimed + c.blocked);
  return { completed, claimed: claimed - completed, blocked: blocked - claimed, rest: width - blocked };
}

export type Health = { ok?: boolean; watching?: { kind?: string; id?: string; name?: string }; tabs?: number };
export type ConsoleLink = { href: string; label: string; watching?: number };

const CONSOLE = '127.0.0.1:4823';

export function consoleLink(health: Health | undefined, sessionId: string, team: string | undefined): ConsoleLink | undefined {
  if (!health?.ok || !sessionId) return undefined;
  const link = { href: `http://${CONSOLE}/s/${sessionId}`, label: `${CONSOLE}/s/${sessionId.slice(0, 8)}` };
  const w = health.watching;
  // /health's tabs are whatever the console is watching, often another session.
  const ours = (w?.kind === 'session' && w.id === sessionId) || (w?.kind === 'team' && team !== undefined && w.name === team);
  return ours ? { ...link, watching: health.tabs ?? 0 } : link;
}

export function teamOf(roster: readonly RosterAgent[]): string | undefined {
  const id = roster.find((a) => a.teammateId)?.teammateId;
  return id?.slice(id.indexOf('@') + 1);
}

export function ago(at: number | undefined, now: number): string {
  if (at === undefined) return '';
  const s = Math.floor(Math.max(0, now - at) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

const INPUT_KEYS = ['command', 'file_path', 'path', 'pattern', 'query', 'url'] as const;

export function activityLine(tool: string, input: Readonly<Record<string, unknown>>): string {
  for (const key of INPUT_KEYS) {
    const v = input[key];
    if (typeof v === 'string' && v.trim()) return `${tool} ${v.trim().split('\n')[0]}`;
  }
  return tool;
}
```

- [ ] **Step 4: Run the test and the typecheck**

Run: `npx vitest run src/hooks/team.test.ts && npm run typecheck`
Expected: every test in `team.test.ts` passes; `tsc --noEmit` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add plugin/hooks/team.ts src/hooks/team.test.ts
git commit -m "Add the team rules the band and pane draw from" -- plugin/hooks/team.ts src/hooks/team.test.ts
```

### Task 2: The hooks module: band, pane, `/team8`, auto-open

**Files:**
- Create: `plugin/hooks/team8.tsx`
- Modify: `plugin/hooks/hooks.json` (`modules` and `description`)
- Test: `plugin/hooks/team8.test.ts`

**Interfaces:**
- Consumes: everything Task 1 produces, from `./team.ts`; `register` from `./wave-notify.ts` (a `Register`, unchanged); `ListedTask` from `./wave.ts`.
- Produces: `export const register: Register` from `plugin/hooks/team8.tsx`, the plugin's only `modules` entry. The pane id `team8`; the command `/team8`.

Load the `plugin-authoring` skill first: it names this build's types file, and `claude plugin test` and `validate` are how this task is checked. Where the kit or the engine refuses a shape below, grep that types file for the name (`export type MountTarget`, `'session.start'`, `ToolCallResult`) and fix the call, keeping what each test asserts.

- [ ] **Step 1: Write the failing plugin test**

Create `plugin/hooks/team8.test.ts`. It runs under `claude plugin test plugin`, never vitest (vitest reads only `src/`). The `on` a test gets answers beneath the plugin, so it stands in for the engine on every call the module makes on `$`:

```ts
import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const SESSION = 'abcd1234-0000-0000-0000-000000000000'
const ROSTER = [
  { id: 'aVito-0000000000000001', teammateId: 'Vito@session-abcd1234', name: 'Vito', description: 'track A', type: 'team8:executor', status: 'running' },
  { id: 'aAna-0000000000000002', teammateId: 'Ana@session-abcd1234', name: 'Ana', description: 'track B', type: 'team8:executor', status: 'idle' },
]
const TASKS = [
  { id: '4', subject: 'Build the band', status: 'in_progress', owner: 'Vito', blockedBy: [] },
  { id: '5', subject: 'Build the pane', status: 'pending', owner: 'Ana', blockedBy: ['4'] },
]
const BAND = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 9 }, view: {} }
const PANE = { title: 'team8', isFocused: true, bodyColumns: 46, placement: 'dock', scroll: { offset: 0, bodyRows: 16 }, view: {} }

type Seen = { opened: Record<string, unknown>[]; prompts: string[] }

function stub(on: On, roster: readonly unknown[] = ROSTER): Seen {
  const seen: Seen = { opened: [], prompts: [] }
  // The kit's bottom hook throws on anything left unanswered: the module's
  // timers and the engine's own drawing beneath the band are answered here.
  mock.clock(on)
  on('ui.render', () => undefined)
  on('session.id', () => SESSION)
  on('agent.list', () => roster)
  on('command.register', e => ({ command: e.name }))
  on('tool.call', { tool: 'TaskList' }, () => ({ result: { tasks: TASKS } }))
  on('http.fetch', () => ({
    status: 200,
    ok: true,
    headers: {},
    text: JSON.stringify({ ok: true, watching: { kind: 'session', id: SESSION }, tabs: 2 }),
  }))
  on('ui.open', e => {
    seen.opened.push({ ...e })
    return { isPlaced: true }
  })
  on('prompt.submit', e => {
    seen.prompts.push(e.text)
    return {}
  })
  return seen
}

const START = { cwd: '/tmp', surface: 'terminal', isInteractive: true } as const

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the band draws a button per teammate and a digit opens the pane, on ${surface}`, async ($, on) => {
    const seen = stub(on)
    await $.session.start(START)
    const band = await $.ui.mount({ plugin: 'team8', surface, component: 'AbovePrompt', props: BAND })
    expect(await band.findAll({ type: 'Button' })).toHaveLength(2)
    expect(await band.find({ type: 'Text', text: /tasks 0\/2/ })).toBeTruthy()
    await band.press({ key: 'agent-Ana' })
    expect(seen.opened).toEqual([expect.objectContaining({ id: 'team8', focus: true })])
  })

  test(`the pane draws both tabs and sends a non-blank Lead line, on ${surface}`, async ($, on) => {
    const seen = stub(on)
    await $.session.start(START)
    const pane = await $.ui.mount({ plugin: 'team8', surface, component: 'Pane', requestId: 'team8', props: PANE })
    expect(await pane.find({ type: 'Text', text: /TEAM · 2/ })).toBeTruthy()
    await pane.press({ key: 'tab-tasks' })
    expect(await pane.find({ type: 'Text', text: /0 of 2 completed/ })).toBeTruthy()
    await pane.input({ key: 'lead', text: '   ' })
    await pane.input({ key: 'lead', text: '@Vito take #5 after #4' })
    expect(seen.prompts).toEqual(['@Vito take #5 after #4'])
  })
}

test('the band draws nothing of its own with no teammates', async ($, on) => {
  stub(on, [])
  await $.session.start(START)
  const band = await $.ui.mount({ plugin: 'team8', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await band.findAll({ type: 'Button' })).toHaveLength(0)
})

test('the lead invoking team8:run opens the pane without taking the keyboard', async ($, on) => {
  const seen = stub(on)
  on('tool.call', { tool: 'Skill' }, () => ({ result: {} }))
  await $.session.start(START)
  await $.tool.call({ tool: 'Skill', skill: 'team8:run' })
  expect(seen.opened).toEqual([expect.objectContaining({ id: 'team8' })])
  expect(seen.opened[0]).not.toHaveProperty('focus')
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `claude plugin test plugin`
Expected: FAIL. `hooks.json` still loads `wave-notify.ts` alone, so no band Button, no `/team8` and no pane are drawn.

- [ ] **Step 3: Write the module**

Create `plugin/hooks/team8.tsx`:

```tsx
import type { EngineInterface, Register } from 'claude-code'
import { register as registerWave } from './wave-notify.ts'
import {
  activityLine,
  ago,
  bandDetail,
  barCells,
  claimedAndBlocked,
  consoleLink,
  members,
  taskCounts,
  teamOf,
  type Activity,
  type Health,
  type Member,
  type RosterAgent,
  type Task,
} from './team.ts'

const PANE = 'team8'
const ACCENT = '#9184d9'
const FAIL = '#c98d8d'
const WARN = '#d99e5c'
const GLYPH = { working: '●', idle: '○', blocked: '✕', failed: '✕' } as const

// ponytail: module memory, so a reload starts from an empty snapshot and a
// teammate's last tool call returns only with its next one; $.state if that matters.
const activity = new Map<string, Activity>()
let sessionId = ''
let roster: RosterAgent[] = []
let tasks: Task[] = []
let health: Health | undefined
let drawn = ''
let refreshing = false
let tab: 'team' | 'tasks' = 'team'
let focusName: string | undefined

function glyphColor(m: Member): string | undefined {
  return m.state === 'working' ? ACCENT : m.state === 'idle' ? undefined : FAIL
}

async function refresh($: EngineInterface) {
  try {
    roster = await $.agent.list()
  } catch {}
  try {
    const list = await $.tool.call({ tool: 'TaskList' })
    tasks = (list.result as { tasks?: Task[] } | undefined)?.tasks ?? []
  } catch {}
  try {
    const r = await $.http.fetch('http://127.0.0.1:4823/health')
    health = r.ok ? (JSON.parse(r.text) as Health) : undefined
  } catch {
    health = undefined
  }
  // The minute is in the key so an age like 3m redraws as it changes.
  const key = JSON.stringify([roster, tasks, health, [...activity], Math.floor(Date.now() / 60_000)])
  if (key !== drawn) {
    drawn = key
    $.ui.invalidate('ui.render')
  }
}

// At most once a second, trailing, so a burst of tool calls costs one read.
function refreshSoon($: EngineInterface) {
  if (refreshing) return
  refreshing = true
  $.clock.after(1000, () => {
    refreshing = false
    void refresh($)
  })
}

async function openPane($: EngineInterface, name?: string) {
  focusName = name
  try {
    await $.ui.open({ id: PANE, title: 'team8', focus: true, closeOnEscape: true, rows: 16, columns: 46 })
  } catch {}
  $.ui.invalidate('ui.render')
}

// Unasked, so Claude Code places it only from 144 columns (110 once opened by
// hand this session); below that it waits, and the toast says how to open it.
async function openForRun($: EngineInterface) {
  try {
    const opened = await $.ui.open({ id: PANE, title: 'team8', closeOnEscape: true, rows: 16, columns: 46 })
    if (!opened.isPlaced) $.ui.toast('team8: /team8 opens the team pane')
  } catch {}
}

async function openAgent($: EngineInterface, name: string) {
  const link = consoleLink(health, sessionId, teamOf(roster))
  if (!link) return
  try {
    await $.process.run(['open', `${link.href}?agent=${encodeURIComponent(name)}`], { timeoutMs: 5000 })
  } catch {}
}

function setTab($: EngineInterface, next: 'team' | 'tasks') {
  tab = next
  $.ui.invalidate('ui.render')
}

function submitLead($: EngineInterface, value: string) {
  if (!value.trim()) return
  void $.prompt.submit({ text: value })
}

export const register: Register = (on, options) => {
  registerWave(on, options)

  on('session.start', async ($, e, next) => {
    try {
      sessionId = await $.session.id()
      await $.command.register({ name: 'team8', description: 'Open the team8 pane: teammates and tasks', immediate: true })
      await refresh($)
      $.clock.every(5000, () => void refresh($))
    } catch {}
    return next(e)
  })

  on('command.run', { command: 'team8' }, async $ => {
    await openPane($)
    return { text: 'opened the team8 pane' }
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId) {
      activity.set(e.agentId, { text: activityLine(e.tool, e as unknown as Record<string, unknown>), at: Date.now() })
      refreshSoon($)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    const r = await next(e)
    if ((e as { skill?: string }).skill === 'team8:run') await openForRun($)
    return r
  }).catch(($, e, next) => next(e))

  // The person's own /team8:run, where Claude Code raises a skill as a command.
  on('command.run', { command: 'team8:run' }, async ($, e, next) => {
    await openForRun($)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    refreshSoon($)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const rest = await next(e)
    try {
      const list = members(roster, tasks, activity)
      if (e.props.hasSurvey || list.length === 0) return rest
      const { Box, Text, Button, Link } = $.ui.resolve(e)
      const counts = taskCounts(tasks)
      const link = consoleLink(health, sessionId, teamOf(roster))
      const shown = list.length > 9 ? list.slice(0, 8) : list
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" columnGap={3} flexWrap="wrap">
            <Text bold>team8</Text>
            {shown.map((m, i) => (
              <Button key={`agent-${m.name}`} hotkey={String(i + 1)} plain onPress={() => void openPane($, m.name)}>
                <Text color={glyphColor(m)} dimColor={m.state === 'idle'}>{GLYPH[m.state]}</Text>
                {` ${m.name} `}
                <Text color={m.state === 'failed' ? FAIL : undefined} dimColor={m.state !== 'failed'}>{bandDetail(m)}</Text>
              </Button>
            ))}
            {shown.length < list.length && (
              <Button key="more" plain onPress={() => void openPane($)}>{`+${list.length - shown.length}`}</Button>
            )}
            <Text dimColor>{`tasks ${counts.completed}/${counts.total}`}</Text>
            <Box flexGrow={1} />
            {link && <Link href={link.href} label={link.label} />}
          </Box>
          {rest}
        </Box>
      )
    } catch {
      return rest
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    try {
      const { Box, Text, Button, Link, Input } = $.ui.resolve(e)
      const list = members(roster, tasks, activity)
      const counts = taskCounts(tasks)
      const rows = claimedAndBlocked(tasks)
      const link = consoleLink(health, sessionId, teamOf(roster))
      const width = Math.max(10, e.props.bodyColumns)
      const bar = barCells(counts, width)
      const now = Date.now()
      return (
        <Box flexDirection="column" flexGrow={1}>
          <Box flexDirection="row" columnGap={2}>
            <Text bold>team8</Text>
            {e.props.placement === 'inline' && <Text dimColor>/tui fullscreen for a side panel</Text>}
            <Box flexGrow={1} />
            <Text dimColor>esc close</Text>
          </Box>
          {link && (
            <Box flexDirection="row" columnGap={1}>
              <Text dimColor>console</Text>
              <Link href={link.href} label={link.label} />
              {link.watching !== undefined && <Text dimColor>{`· ${link.watching} watching`}</Text>}
            </Box>
          )}
          <Box flexDirection="row" columnGap={3}>
            <Button key="tab-team" hotkey="1" plain dimColor={tab !== 'team'} onPress={() => setTab($, 'team')}>team</Button>
            <Button key="tab-tasks" hotkey="2" plain dimColor={tab !== 'tasks'} onPress={() => setTab($, 'tasks')}>tasks</Button>
          </Box>
          {tab === 'team' ? (
            <Box flexDirection="column">
              <Text dimColor>{`TEAM · ${list.length}`}</Text>
              {list.length === 0 && <Text dimColor>no teammates in this session</Text>}
              {list.map(m => (
                <Box key={`row-${m.name}`} flexDirection="row" columnGap={1}>
                  <Button key={`member-${m.name}`} plain autoFocus={m.name === focusName ? true : undefined} onPress={() => void openAgent($, m.name)}>
                    <Text color={glyphColor(m)} dimColor={m.state === 'idle'}>{GLYPH[m.state]}</Text>
                    {` ${m.name.slice(0, 8).padEnd(8)}`}
                  </Button>
                  <Text dimColor>{(m.taskId ? `#${m.taskId}` : '').padEnd(6)}</Text>
                  <Box flexGrow={1}>
                    <Text wrap="truncate-end">{m.activity}</Text>
                  </Box>
                  <Text dimColor>{ago(m.at, now)}</Text>
                </Box>
              ))}
            </Box>
          ) : (
            <Box flexDirection="column">
              <Text>
                {`${counts.completed} of ${counts.total} completed`}
                <Text dimColor>{` · ${counts.claimed} claimed · ${counts.blocked} blocked`}</Text>
              </Text>
              {e.surface === 'terminal' && (
                <Text>
                  <Text color="#796cbf">{'█'.repeat(bar.completed)}</Text>
                  <Text color="#d2cefd">{'█'.repeat(bar.claimed)}</Text>
                  <Text color={WARN}>{'█'.repeat(bar.blocked)}</Text>
                  <Text color="#292b31">{'█'.repeat(bar.rest)}</Text>
                </Text>
              )}
              <Text dimColor>CLAIMED AND BLOCKED</Text>
              {rows.map(r => (
                <Box key={`task-${r.id}`} flexDirection="row" columnGap={1}>
                  <Text color={r.state === 'claimed' ? ACCENT : FAIL}>{r.state === 'claimed' ? '●' : '✕'}</Text>
                  <Text dimColor>{`#${r.id}`.padEnd(6)}</Text>
                  <Box flexGrow={1}>
                    <Text wrap="truncate-end">{r.subject}</Text>
                  </Box>
                  <Text dimColor>{r.right}</Text>
                </Box>
              ))}
            </Box>
          )}
          <Box flexGrow={1} />
          <Text dimColor>{'─'.repeat(width)}</Text>
          <Input key="lead" label="Lead" placeholder="@Vito take #9 after #4" submitLabel="send" value="" onSubmit={value => submitLead($, value)} />
        </Box>
      )
    } catch {
      return next(e)
    }
  })
}
```

- [ ] **Step 4: Point `hooks.json` at the new entry**

In `plugin/hooks/hooks.json`, replace

```json
  "modules": ["./wave-notify.ts"],
```

with

```json
  "modules": ["./team8.tsx"],
```

and in its `description`, replace `The hooks module, wave-notify.ts, watches` with `The hooks module's wave notifier, wave-notify.ts, watches`, then append after `It never changes a call.` (inside the same string):

```
 The module's entry, team8.tsx, registers that notifier and draws the team inside Claude Code: a band above the prompt naming each teammate with a digit hotkey and the task count, and a team pane that /team8, a band digit or the lead's team8:run opens, with a team tab, a tasks tab and a field that prompts the lead. It reads the roster, TaskList and the console's /health, never the files the console ingests.
```

Check it still parses: `node -e 'JSON.parse(require("fs").readFileSync("plugin/hooks/hooks.json","utf8"))'`.

- [ ] **Step 5: Validate and run the plugin test**

Run: `claude plugin validate plugin && claude plugin test plugin`
Expected: validation passes and lists `./team8.tsx` hooks: `session.start`, `command.run{command=team8}`, `tool.call` (with `.catch`), `tool.call{tool=Skill}` (with `.catch`), `command.run{command=team8:run}` (with `.catch`), `turn.complete`, `ui.render{component=AbovePrompt}`, `ui.render{component=Pane, requestId=team8}`, beside the notifier's `tool.call{tool=TaskUpdate}`. Every test in `team8.test.ts` passes.

- [ ] **Step 6: Run the repo's tests that read the plugin**

Run: `npx vitest run src/hooks src/server/setup.test.ts && npm run typecheck`
Expected: PASS (the hooks.json test reads only `.hooks`); `tsc --noEmit` prints nothing.

- [ ] **Step 7: Commit**

```bash
git add plugin/hooks/team8.tsx plugin/hooks/team8.test.ts
git commit -m "Draw the team in Claude Code: a band above the prompt and a team pane" -- plugin/hooks/team8.tsx plugin/hooks/team8.test.ts plugin/hooks/hooks.json
```

### Task 3: Offer the fullscreen layout in `/team8:setup`

**Files:**
- Modify: `plugin/commands/setup.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing other tasks read.

Claude Code docks a pane beside the transcript only in its fullscreen layout, from 110 columns; on the main screen every pane sits inline above the prompt, and no mod call changes that. `~/.claude/settings.json`'s `"tui"` picks the layout (`/tui fullscreen` writes `"fullscreen"`). This step offers it, opt-in, beside the command's other opt-in change.

- [ ] **Step 1: Say what the command now also offers**

In `plugin/commands/setup.md`, replace

```
else, and nothing that is already there, bar one opt-in removal: a stale
`subagentPromptCacheTtl`, if the operator says yes.
```

with

```
else, and nothing that is already there, bar two opt-in changes: removing a stale
`subagentPromptCacheTtl`, and setting `"tui": "fullscreen"`, each only if the
operator says yes.
```

- [ ] **Step 2: Note the layout in step 1**

In `## 1. Read what is there now`, after the bullet that starts `- Is \`subagentPromptCacheTtl\` \`"1h"\`?` and ends `Offer to remove it.`, add:

```
- Is `tui` anything but `"fullscreen"`, or missing? team8's team pane docks
  beside the transcript as a side panel only in Claude Code's fullscreen
  layout; on the main screen it sits above the prompt. Offer to set it. It
  changes every session's layout, not just team8's, from the next session on.
```

- [ ] **Step 3: List it at the step 2 stop**

In `## 2. Say what you will change, then wait`, replace

```
`subagentPromptCacheTtl` (\"1h\")" beside them. Then STOP and wait for a yes.
```

with

```
`subagentPromptCacheTtl` (\"1h\")" beside them, and if it found `tui` not
`"fullscreen"`, list "set `\"tui\": \"fullscreen\"` (every session's layout,
from the next one)" too. Then STOP and wait for a yes; the operator may take
some of these and not others.
```

- [ ] **Step 4: Write it in step 3**

In `## 3. Write \`env\`, drop a stale TTL`, after the paragraph

```
If the operator agreed at the step 2 stop, delete `subagentPromptCacheTtl` when its
value is `"1h"`, and only that value.
```

add

```

If the operator agreed to the layout, set the top-level `"tui": "fullscreen"`,
the same as running `/tui fullscreen`. Record what `tui` was before, or that it
was missing, for the report. Leave `tui` alone otherwise.
```

- [ ] **Step 5: Report and undo**

In `## 5. Report`, replace

```
load at startup, so they need a restart.
```

with

```
load at startup, so they need a restart. If `tui` changed, say the side panel
starts with the next session and what `tui` was before.
```

In `## Removing it`, replace

```
Put the two `env` vars back to whatever they were before. Drop a
```

with

```
Put the two `env` vars back to whatever they were before, and `tui` too if this
command set it. Drop a
```

- [ ] **Step 6: Check the text and the tests that read the plugin's texts**

Run: `grep -n 'tui' plugin/commands/setup.md && npx vitest run src/server/plugin-texts.test.ts src/server/setup.test.ts`
Expected: the grep shows the six new mentions (intro, step 1, step 2, step 3, report, removing); both test files pass.

- [ ] **Step 7: Commit**

```bash
git commit -m "Offer Claude Code's fullscreen layout in team8:setup, for the team pane's side panel" -- plugin/commands/setup.md
```

---

## At the close (the lead)

- Full suite: `npm test` and `npm run typecheck`; `claude plugin validate plugin`; `claude plugin test plugin`.
- Live check: copy `plugin/hooks/team.ts`, `team8.tsx`, `wave.ts` and `wave-notify.ts` into this session's dev-mods folder under a plugin of another name (with `.claude-plugin/plugin.json` and `hooks/hooks.json` naming `./team8.tsx`), spawn a haiku teammate owning one throwaway task that runs a few `sleep 2` Bash calls, and confirm by the operator's eye: the band shows its row with `#<task>` and a digit; the digit opens the pane with its row and live activity; the tasks tab counts it; `/team8` opens the pane; invoking `team8:run` opens it unfocused. Once in fullscreen, once on the main screen. Then stop the teammate, delete the task and the copy.

---

### Task 4: Remove the pane, keep only the band

Revised after the live check, on the operator's call: the pane docks as a side panel only under `/tui fullscreen`, so the batch ships the band alone. Everything that existed for the pane goes: the `Pane` render, `/team8`, the open on `team8:run`, the Lead field, the teammates' activity line, and `/team8:setup`'s fullscreen step. A band digit now opens the console on that teammate, when the console is up.

**Files:**
- Modify: `plugin/hooks/team.ts`, `src/hooks/team.test.ts`
- Modify: `plugin/hooks/team8.tsx`, `plugin/hooks/team8.test.ts`
- Modify: `plugin/hooks/hooks.json` (the `description` sentence about `team8.tsx` only)
- Restore: `plugin/commands/setup.md` to its state before the fullscreen step (`git checkout c536eb5 -- plugin/commands/setup.md`)

**Interfaces:**
- Consumes: nothing new.
- Produces, from `plugin/hooks/team.ts`: `Task`, `RosterAgent`, `MemberState`, `Member = { id; name; state; taskId?; needs? }`, `members(roster, tasks): Member[]`, `bandDetail(m): string`, `TaskCounts = { completed; total }`, `taskCounts(tasks): TaskCounts`, `Health = { ok?: boolean }`, `ConsoleLink = { href; label }`, `consoleLink(health, sessionId): ConsoleLink | undefined`. Removed: `Activity`, `TaskRow`, `claimedAndBlocked`, `barCells`, `teamOf`, `ago`, `activityLine`, `members`' third parameter, `Member.activity`/`at`, `ConsoleLink.watching`.

- [ ] **Step 1: Rewrite the rules' test**

Replace `src/hooks/team.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { bandDetail, consoleLink, members, taskCounts, type RosterAgent, type Task } from '../../plugin/hooks/team';

const mate = (name: string, status: string): RosterAgent => ({
  id: `a${name}-0000000000000001`,
  name,
  teammateId: `${name}@session-abcd1234`,
  status,
});
const task = (id: string, status: string, owner?: string, blockedBy: string[] = []): Task => ({
  id,
  subject: `Task ${id}`,
  status,
  owner,
  blockedBy,
});

describe('members', () => {
  it('maps each roster status to a state', () => {
    const roster = ['running', 'pending', 'waiting', 'idle', 'failed'].map((s, i) => mate(`m${i}`, s));
    expect(members(roster, []).map((m) => m.state)).toEqual(['working', 'working', 'working', 'idle', 'failed']);
  });

  it('leaves out ended agents and agents that are not teammates', () => {
    const roster = [mate('done', 'completed'), mate('gone', 'killed'), { id: 'a1234', status: 'running' }, mate('live', 'running')];
    expect(members(roster, []).map((m) => m.name)).toEqual(['live']);
  });

  it('calls a working teammate with nothing claimed and a still-blocked task blocked', () => {
    const [m] = members([mate('Tom', 'running')], [task('9', 'pending', 'Tom', ['4'])]);
    expect(m).toMatchObject({ state: 'blocked', taskId: '9', needs: '4' });
  });

  it('keeps a teammate working while it has a claimed task beside a blocked one', () => {
    const tasks = [task('9', 'pending', 'Vito', ['4']), task('5', 'in_progress', 'Vito')];
    expect(members([mate('Vito', 'running')], tasks)[0]).toMatchObject({ state: 'working', taskId: '5' });
  });

  it('shows the in-progress task before a pending one and ignores completed ones', () => {
    const tasks = [task('1', 'completed', 'Ana'), task('2', 'pending', 'Ana'), task('3', 'in_progress', 'Ana')];
    expect(members([mate('Ana', 'idle')], tasks)[0].taskId).toBe('3');
  });
});

describe('bandDetail', () => {
  it('names the task of a working teammate and the state of any other', () => {
    const list = members(
      [mate('W', 'running'), mate('I', 'idle'), mate('B', 'running'), mate('F', 'failed'), mate('N', 'running')],
      [task('4', 'in_progress', 'W'), task('9', 'pending', 'B', ['3'])],
    );
    expect(list.map(bandDetail)).toEqual(['#4', 'idle', 'needs #3', 'failed', 'working']);
  });
});

describe('taskCounts', () => {
  it('counts completed and total', () => {
    const tasks = [task('1', 'completed', 'A'), task('2', 'in_progress', 'A'), task('3', 'pending', 'B', ['2']), task('4', 'pending')];
    expect(taskCounts(tasks)).toEqual({ completed: 1, total: 4 });
  });
});

describe('consoleLink', () => {
  const id = 'abcd1234-0000-0000-0000-000000000000';

  it('links this session while the console is up', () => {
    expect(consoleLink({ ok: true }, id)).toEqual({ href: `http://127.0.0.1:4823/s/${id}`, label: '127.0.0.1:4823/s/abcd1234' });
  });

  it('gives nothing when the console is down or the session is unknown', () => {
    expect(consoleLink(undefined, id)).toBeUndefined();
    expect(consoleLink({ ok: false }, id)).toBeUndefined();
    expect(consoleLink({ ok: true }, '')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Trim the rules**

Replace `plugin/hooks/team.ts` with:

```ts
// The band's rules, kept free of Claude Code imports so vitest and the repo's
// typecheck can load them; team8.tsx is the module around them.
// No relative imports either: Claude Code wants `./x.ts`, which tsc refuses.

export type Task = { id: string; subject: string; status: string; owner?: string; blockedBy: readonly string[] };
export type RosterAgent = { id: string; name?: string; teammateId?: string; status: string };
export type MemberState = 'working' | 'idle' | 'blocked' | 'failed';
export type Member = { id: string; name: string; state: MemberState; taskId?: string; needs?: string };

const ENDED = new Set(['completed', 'killed']);

export function members(roster: readonly RosterAgent[], tasks: readonly Task[]): Member[] {
  const out: Member[] = [];
  for (const a of roster) {
    if (!a.teammateId || !a.name || ENDED.has(a.status)) continue;
    const name = a.name;
    const own = tasks.filter((t) => t.owner === name);
    const claimed = own.find((t) => t.status === 'in_progress');
    const next = own.find((t) => t.status === 'pending');
    const blocked = own.find((t) => t.status === 'pending' && t.blockedBy.length > 0);
    let state: MemberState = a.status === 'failed' ? 'failed' : a.status === 'idle' ? 'idle' : 'working';
    // The console's rule (src/server/project.ts): working, nothing claimed, and
    // a task of its own still waiting on another.
    const needs = state === 'working' && !claimed ? blocked?.blockedBy[0] : undefined;
    if (needs) state = 'blocked';
    out.push({ id: a.id, name, state, taskId: (claimed ?? (needs ? blocked : next))?.id, needs });
  }
  return out;
}

export function bandDetail(m: Member): string {
  if (m.state === 'working') return m.taskId ? `#${m.taskId}` : 'working';
  return m.needs ? `needs #${m.needs}` : m.state;
}

export type TaskCounts = { completed: number; total: number };

export function taskCounts(tasks: readonly Task[]): TaskCounts {
  return { completed: tasks.filter((t) => t.status === 'completed').length, total: tasks.length };
}

export type Health = { ok?: boolean };
export type ConsoleLink = { href: string; label: string };

const CONSOLE = '127.0.0.1:4823';

export function consoleLink(health: Health | undefined, sessionId: string): ConsoleLink | undefined {
  if (!health?.ok || !sessionId) return undefined;
  return { href: `http://${CONSOLE}/s/${sessionId}`, label: `${CONSOLE}/s/${sessionId.slice(0, 8)}` };
}
```

Run: `npx vitest run src/hooks/team.test.ts && npm run typecheck`
Expected: PASS; `tsc --noEmit` prints nothing.

- [ ] **Step 3: Rewrite the plugin test for the band alone**

Replace `plugin/hooks/team8.test.ts` with the following. Keep the stub answers the kit already proved in this file (`{ value: … }` for method calls, `session.start` and `ui.render` answered); if `process.run`'s input or answer has another shape in the types, fix the stub and keep what each test asserts.

```ts
import type { AgentInfo, On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const SESSION = 'abcd1234-0000-0000-0000-000000000000'
const ROSTER: AgentInfo[] = [
  { id: 'aVito-0000000000000001', teammateId: 'Vito@session-abcd1234', name: 'Vito', description: 'track A', type: 'team8:executor', status: 'running' },
  { id: 'aAna-0000000000000002', teammateId: 'Ana@session-abcd1234', name: 'Ana', description: 'track B', type: 'team8:executor', status: 'idle' },
]
const TASKS = [
  { id: '4', subject: 'Build the band', status: 'in_progress', owner: 'Vito', blockedBy: [] },
  { id: '5', subject: 'Open the console', status: 'pending', owner: 'Ana', blockedBy: ['4'] },
]
const BAND = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 9 }, view: {} }
const START = { cwd: '/tmp', surface: 'terminal', isInteractive: true } as const

// Answers beneath the module for each call it makes on $, and records the
// commands it runs. The kit's bottom hook throws on anything left unanswered.
function stub(on: On, roster: AgentInfo[] = ROSTER, consoleUp = true): unknown[] {
  const runs: unknown[] = []
  mock.clock(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.render', () => ({ type: 'Box' }))
  on('session.id', () => ({ value: SESSION }))
  on('agent.list', () => ({ value: roster }))
  on('tool.call', { tool: 'TaskList' }, () => ({ result: { tasks: TASKS } }))
  on('http.fetch', () => ({
    value: consoleUp
      ? { status: 200, ok: true, headers: {}, text: JSON.stringify({ ok: true }) }
      : { status: 503, ok: false, headers: {}, text: '{}' },
  }))
  on('process.run', (_, e) => {
    runs.push(e.argv)
    return { value: { code: 0, stdout: '', stderr: '' } }
  })
  return runs
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the band draws a button per teammate and the task count, on ${surface}`, async ($, on) => {
    stub(on)
    await $.session.start(START)
    const band = await $.ui.mount({ plugin: 'team8', surface, component: 'AbovePrompt', props: BAND })
    expect(await band.findAll({ type: 'Button' })).toHaveLength(2)
    expect(await band.find({ type: 'Text', text: /tasks 0\/2/ })).toBeTruthy()
  })
}

test('a digit opens the console on that teammate', async ($, on) => {
  const runs = stub(on)
  await $.session.start(START)
  const band = await $.ui.mount({ plugin: 'team8', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  await band.press({ key: 'agent-Ana' })
  expect(runs).toEqual([['open', `http://127.0.0.1:4823/s/${SESSION}?agent=Ana`]])
})

test('a digit does nothing while the console is down', async ($, on) => {
  const runs = stub(on, ROSTER, false)
  await $.session.start(START)
  const band = await $.ui.mount({ plugin: 'team8', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  await band.press({ key: 'agent-Ana' })
  expect(runs).toEqual([])
})

test('the band draws nothing of its own with no teammates', async ($, on) => {
  stub(on, [])
  await $.session.start(START)
  const band = await $.ui.mount({ plugin: 'team8', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await band.findAll({ type: 'Button' })).toHaveLength(0)
})
```

Run: `claude plugin test plugin`
Expected: FAIL. The band's digits still open the pane, so `runs` stays empty.

- [ ] **Step 4: Cut the module down to the band**

Replace `plugin/hooks/team8.tsx` with:

```tsx
import type { EngineInterface, Register } from 'claude-code'
import { register as registerWave } from './wave-notify.ts'
import { bandDetail, consoleLink, members, taskCounts, type Health, type Member, type RosterAgent, type Task } from './team.ts'

const ACCENT = '#9184d9'
const FAIL = '#c98d8d'
const GLYPH = { working: '●', idle: '○', blocked: '✕', failed: '✕' } as const

// ponytail: module memory, so a reload draws nothing until its first refresh,
// at most 5 s later; $.state if that ever shows.
let sessionId = ''
let roster: RosterAgent[] = []
let tasks: Task[] = []
let health: Health | undefined
let drawn = ''
let refreshing = false
let ticking = false

function glyphColor(m: Member): string | undefined {
  return m.state === 'working' ? ACCENT : m.state === 'idle' ? undefined : FAIL
}

async function refresh($: EngineInterface) {
  // /clear keeps the process under a new session id and fires no session.start.
  try {
    sessionId = await $.session.id()
  } catch {}
  try {
    roster = await $.agent.list()
  } catch {}
  try {
    const list = await $.tool.call({ tool: 'TaskList' })
    tasks = (list.result as { tasks?: Task[] } | undefined)?.tasks ?? []
  } catch {}
  try {
    const r = await $.http.fetch('http://127.0.0.1:4823/health')
    health = r.ok ? (JSON.parse(r.text) as Health) : undefined
  } catch {
    health = undefined
  }
  const key = JSON.stringify([sessionId, roster, tasks, health])
  if (key !== drawn) {
    drawn = key
    try {
      $.ui.invalidate('ui.render')
    } catch {}
  }
}

// At most once a second, trailing, so a burst of tool calls costs one read.
function refreshSoon($: EngineInterface) {
  if (refreshing) return
  try {
    $.clock.after(1000, () => {
      refreshing = false
      void refresh($)
    })
    refreshing = true
  } catch {}
}

async function openInConsole($: EngineInterface, name?: string) {
  const link = consoleLink(health, sessionId)
  if (!link) return
  const url = name ? `${link.href}?agent=${encodeURIComponent(name)}` : link.href
  try {
    await $.process.run(['open', url], { timeoutMs: 5000 })
  } catch {}
}

export const register: Register = (on, options) => {
  registerWave(on, options)

  on('session.start', async ($, e, next) => {
    try {
      // session.start can fire again in the same module; one timer is enough.
      if (!ticking) {
        $.clock.every(5000, () => void refresh($))
        ticking = true
      }
    } catch {}
    await refresh($)
    return next(e)
  })

  // A teammate's task and status changes ride on its tool calls and turn ends.
  on('tool.call', async ($, e, next) => {
    if (e.agentId) refreshSoon($)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    try {
      refreshSoon($)
    } catch {}
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const rest = await next(e)
    try {
      const list = members(roster, tasks)
      if (e.props.hasSurvey || list.length === 0) return rest
      const { Box, Text, Button, Link } = $.ui.resolve(e)
      const counts = taskCounts(tasks)
      const link = consoleLink(health, sessionId)
      const shown = list.length > 9 ? list.slice(0, 8) : list
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" columnGap={3} flexWrap="wrap">
            <Text bold>team8</Text>
            {shown.map((m, i) => (
              <Button key={`agent-${m.name}`} hotkey={String(i + 1)} plain onPress={() => void openInConsole($, m.name)}>
                <Text color={glyphColor(m)} dimColor={m.state === 'idle'}>{GLYPH[m.state]}</Text>
                {` ${m.name} `}
                <Text color={m.state === 'failed' ? FAIL : undefined} dimColor={m.state !== 'failed'}>{bandDetail(m)}</Text>
              </Button>
            ))}
            {shown.length < list.length && (
              <Button key="more" plain onPress={() => void openInConsole($)}>{`+${list.length - shown.length}`}</Button>
            )}
            <Text dimColor>{`tasks ${counts.completed}/${counts.total}`}</Text>
            <Box flexGrow={1} />
            {link && <Link href={link.href} label={link.label} />}
          </Box>
          {rest}
        </Box>
      )
    } catch {
      return rest
    }
  })
}
```

- [ ] **Step 5: Correct `hooks.json`'s sentence and restore `setup.md`**

In `plugin/hooks/hooks.json`'s `description`, replace the sentence that starts ` The module's entry, team8.tsx, registers that notifier and draws the team inside Claude Code:` and ends `never the files the console ingests.` with:

```
 The module's entry, team8.tsx, registers that notifier and draws a band above the prompt: each teammate with a digit hotkey, its state and task, the task count and the console link; a digit opens the console on that teammate. It reads the roster, TaskList and the console's /health, never the files the console ingests.
```

Check it parses: `node -e 'JSON.parse(require("fs").readFileSync("plugin/hooks/hooks.json","utf8"))'`.

Restore `setup.md`: `git checkout c536eb5 -- plugin/commands/setup.md` (the fullscreen step existed only for the pane).

- [ ] **Step 6: Run everything that covers these files**

Run: `claude plugin validate plugin && claude plugin test plugin && npx vitest run src/hooks src/server/setup.test.ts src/server/plugin-texts.test.ts && npm run typecheck && ! grep -n 'tui' plugin/commands/setup.md`
Expected: validation passes and lists `./team8.tsx` hooks `tool.call{tool=TaskUpdate}, session.start, tool.call, turn.complete, ui.render{component=AbovePrompt}`, with no `command.run`, `Skill` or `Pane` hook; 5 plugin tests pass; vitest passes; `tsc` prints nothing; `setup.md` has no `tui`.

- [ ] **Step 7: Commit**

```bash
git commit -m "Keep only the band: drop the team pane, /team8, the team8:run open and the fullscreen setup step" -- plugin/hooks/team.ts src/hooks/team.test.ts plugin/hooks/team8.tsx plugin/hooks/team8.test.ts plugin/hooks/hooks.json plugin/commands/setup.md
```
