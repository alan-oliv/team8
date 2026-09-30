# team8 measure Implementation Plan

> **For agentic workers:** this plan is executed by teammates that `team8:run` dispatches from the shared task list. Read your own task section. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `measure` command that reads a Claude Code session's transcripts and reports where a team8 batch's time went, so every speed PR can be measured the same way.

**Architecture:**
- Pure functions in `src/server/measure/` turn each agent's JSONL transcript into a trace: its model calls, its tool spans, the messages it received, the messages it sent, and its task events.
- From the traces they derive four things:
  - time attribution, with each second given to one owner: asleep, model, the earliest-started tool, or idle;
  - message lag;
  - review tails;
  - idle time while work was waiting.
- A `measure` subcommand of the console server prints the result as markdown or JSON, and `/team8:measure` wraps it.
- The algorithms are ported from the delay-log prototype in `~/code/meetnotes-scratch/lead/delay-scripts/`: `analyze.py` and `delivery.py`.

**Tech Stack:** TypeScript on Node 22. esbuild bundles it into `plugin/dist/server/index.js`, but only in CI. Tests use Vitest.

**Spec:** `docs/team8/specs/2026-09-30-team8-speed-design.md`, section 0.

## Global Constraints

- **Workspace.** Work in the worktree `~/code/team8-speed` on the branch `measure`, which is already checked out. Never touch the main checkout `~/code/team8`: it holds the user's staged work.
- **Build output.** Never commit `plugin/dist/`. The bump workflow builds it after merge.
- **Dependencies.** Add none.
- **Purity.** Only `load.ts` and `cli.ts` touch the filesystem or run `pmset`. Every other module is a pure function of its arguments.
- **Fixtures.** Tests build their transcripts inline as JSONL strings. Never commit a real transcript: they hold private work.
- **Time.** All times are epoch milliseconds. The markdown report shows minutes to one decimal place and local clock times as `HH:MM`. JSON keeps milliseconds.
- **Reuse.** Use the existing helpers rather than copies:
  - `parseLine` from `src/shared/transcript.ts`;
  - `usageRecordsOf` and `totalCost` from `src/shared/usage.ts`;
  - `parseTeammateFrames` from `src/shared/mailbox.ts`.
- **Commits.** Plain imperative sentences, matching the repo's history (e.g. "Fill in-progress board cards to the executor's reported progress"). No AI attribution.

## File Structure

| File | Responsibility |
|---|---|
| `src/server/measure/classify.ts` | `Category` and `classifyTool`: which kind of work a tool call is |
| `src/server/measure/trace.ts` | `readTrace`: one transcript → `AgentTrace` (calls, tools, incoming, sends, task events, cost) |
| `src/server/measure/load.ts` | `findSession`, `loadTraces`: locate a session's lead and subagent transcripts and name each agent's role |
| `src/server/measure/sleep.ts` | `parsePmsetLog`: macOS sleep intervals from `pmset -g log` |
| `src/server/measure/sweep.ts` | `attribute`: one owner per second for an agent |
| `src/server/measure/lag.ts` | `messageLags`, `summarizeLags`: sent → seen for every SendMessage |
| `src/server/measure/tasks.ts` | `reviewTails`, `idleWithWork`: track clear minus last completion; idle time with an unblocked task waiting |
| `src/server/measure/report.ts` | `buildReport`, `renderMarkdown` |
| `src/server/measure/cli.ts` | `runMeasure`: files and `pmset` in, report out |
| `src/server/index.ts` | `parseArgs` and `main` learn `measure` |
| `plugin/commands/measure.md` | `/team8:measure` |
| `plugin/skills/run/SKILL.md` | the Run Log at Close uses `measure` |
| `.claude/commands/bench.md` | dev-only scenario runner scaffold (not shipped) |

Tests sit next to each module as `*.test.ts`, following the repo's convention.

---

### Task 1: Traces

**Files:**
- Create: `src/server/measure/classify.ts`, `src/server/measure/classify.test.ts`
- Create: `src/server/measure/trace.ts`, `src/server/measure/trace.test.ts`
- Create: `src/server/measure/load.ts`, `src/server/measure/load.test.ts`

**Interfaces:**
- Consumes: `parseLine` (`src/shared/transcript.ts`), `usageRecordsOf` and `totalCost` (`src/shared/usage.ts`), `parseTeammateFrames` (`src/shared/mailbox.ts`)
- Produces:
  - `type Category = 'expensive check' | 'build' | 'app launch' | 'tests' | 'typecheck' | 'sleep/poll' | 'git/gh' | 'files' | 'task tools' | 'messaging' | 'subagent' | 'other'`
  - `classifyTool(name: string, input: unknown): Category`
  - `interface ModelCall { id: string; model: string; effort?: string; requestedAt: number; firstAt: number; lastAt: number; outputTokens: number; stopReason?: string; toolIds: string[] }`
  - `interface ToolSpan { id: string; name: string; category: Category; command?: string; startAt: number; endAt: number; unfinished: boolean }`
  - `type IncomingKind = 'message' | 'idle' | 'task-notification' | 'user'`
  - `interface Incoming { at: number; kind: IncomingKind; from?: string; text: string }`
  - `interface Send { at: number; from: string; to: string; text: string }`
  - `interface TaskEvent { at: number; by: string; taskId: string; status?: string; owner?: string; addBlockedBy?: string[] }`
  - `type Role = 'lead' | 'executor' | 'reviewer' | 'other'`
  - `interface AgentTrace { name: string; role: Role; firstAt: number; lastAt: number; calls: ModelCall[]; tools: ToolSpan[]; incoming: Incoming[]; sends: Send[]; taskEvents: TaskEvent[]; costUsd: number }`
  - `readTrace(name: string, role: Role, lines: string[]): AgentTrace`
  - `interface SessionFiles { sessionId: string; lead: string; agents: Array<{ name: string; role: Role; path: string }> }`
  - `findSession(claudeHome: string, sessionId: string): Promise<SessionFiles | null>`
  - `loadTraces(files: SessionFiles): Promise<AgentTrace[]>` — the lead's trace is named `team-lead`

- [ ] **Step 1: Write the failing classifier test** in `src/server/measure/classify.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { classifyTool } from './classify';

describe('classifyTool', () => {
  it('names a Bash command by its most expensive step', () => {
    expect(classifyTool('Bash', { command: 'npm run typecheck && npm run package > log 2>&1' })).toBe('expensive check');
    expect(classifyTool('Bash', { command: 'cd ~/app && npx electron-vite build --outDir /tmp/out' })).toBe('build');
    expect(classifyTool('Bash', { command: 'npx vitest run src/a.ts && npx tsc --noEmit' })).toBe('tests');
    expect(classifyTool('Bash', { command: 'npm run typecheck' })).toBe('typecheck');
    expect(classifyTool('Bash', { command: 'osascript -e \'quit app "x"\'' })).toBe('app launch');
  });

  it('gives waits, git and plain file commands their own kinds', () => {
    expect(classifyTool('Bash', { command: 'sleep 5; date' })).toBe('sleep/poll');
    expect(classifyTool('Bash', { command: 'until [ -f done ]; do sleep 2; done' })).toBe('sleep/poll');
    expect(classifyTool('Bash', { command: 'ALANIZED=1 gh pr create --title x' })).toBe('git/gh');
    expect(classifyTool('Bash', { command: 'cd repo && git log --oneline -3' })).toBe('git/gh');
    expect(classifyTool('Bash', { command: 'grep -n foo src/a.ts' })).toBe('files');
    expect(classifyTool('Bash', { command: 'python3 analyze.py' })).toBe('other');
  });

  it('maps the other tools by name', () => {
    expect(classifyTool('Read', { file_path: '/a' })).toBe('files');
    expect(classifyTool('TaskUpdate', {})).toBe('task tools');
    expect(classifyTool('SendMessage', {})).toBe('messaging');
    expect(classifyTool('Agent', {})).toBe('subagent');
    expect(classifyTool('WebFetch', {})).toBe('other');
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/server/measure/classify.test.ts`
Expected: FAIL, "Failed to resolve import ./classify".

- [ ] **Step 3: Write `src/server/measure/classify.ts`**

```ts
export type Category =
  | 'expensive check'
  | 'build'
  | 'app launch'
  | 'tests'
  | 'typecheck'
  | 'sleep/poll'
  | 'git/gh'
  | 'files'
  | 'task tools'
  | 'messaging'
  | 'subagent'
  | 'other';

// First match wins, so a command chaining several steps lands on its most expensive one.
const BASH_RULES: Array<[Category, RegExp]> = [
  ['expensive check', /npm run package|electron-builder|codesign|lsregister|hdiutil|notarytool|xcodebuild\s+(archive|-exportArchive)|docker build|pkgbuild|productbuild/],
  ['build', /electron-vite build|vite build|esbuild|webpack|npm run build\b|cargo build|go build|tsc -b\b|xcodebuild\b/],
  ['app launch', /remote-debugging|screencapture|osascript|open -[an]\b|\.app\/Contents\/MacOS\/|playwright|puppeteer|npx electron\b/],
  ['tests', /vitest|\bjest\b|pytest|mocha|npm (run )?test\b|go test|cargo test/],
  ['typecheck', /typecheck|tsc --noEmit|\bmypy\b|pyright/],
  ['sleep/poll', /(^|[;&|(\s])sleep \d|\buntil\b.*\bsleep\b|\bwhile\b.*\bsleep\b/],
  ['git/gh', /^\s*(cd [^;&]+(&&|;)\s*)?(\w+=\S+\s+)*(git|gh)\b/],
  ['files', /^\s*(cd [^;&]+(&&|;)\s*)?(cat|sed|grep|rg|find|ls|head|tail|wc|awk|jq|diff|stat|du|tree|sort|uniq|cut|echo|printf)\b/],
];

const TOOL_CATEGORY: Record<string, Category> = {
  Read: 'files', Edit: 'files', Write: 'files', MultiEdit: 'files', NotebookEdit: 'files', Grep: 'files', Glob: 'files',
  TaskGet: 'task tools', TaskUpdate: 'task tools', TaskList: 'task tools', TaskCreate: 'task tools', TodoWrite: 'task tools',
  SendMessage: 'messaging',
  Monitor: 'sleep/poll', BashOutput: 'sleep/poll', TaskOutput: 'sleep/poll', KillShell: 'sleep/poll', TaskStop: 'sleep/poll',
  Agent: 'subagent', Task: 'subagent',
};

export function classifyTool(name: string, input: unknown): Category {
  if (name !== 'Bash') return TOOL_CATEGORY[name] ?? 'other';
  const command = (input as { command?: unknown } | null)?.command;
  if (typeof command !== 'string') return 'other';
  for (const [category, rule] of BASH_RULES) if (rule.test(command)) return category;
  return 'other';
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `npx vitest run src/server/measure/classify.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the failing trace test** in `src/server/measure/trace.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { readTrace } from './trace';

const T0 = Date.UTC(2026, 8, 30, 8, 0, 0);
const at = (s: number) => new Date(T0 + s * 1000).toISOString();
const user = (s: number, content: unknown) => JSON.stringify({ type: 'user', timestamp: at(s), message: { role: 'user', content } });
const asst = (s: number, id: string, content: unknown[], o: { stop?: string; out?: number; effort?: string } = {}) =>
  JSON.stringify({
    type: 'assistant',
    timestamp: at(s),
    effort: o.effort,
    message: {
      id,
      model: 'claude-opus-5-5',
      role: 'assistant',
      content,
      stop_reason: o.stop ?? null,
      usage: { input_tokens: 10, output_tokens: o.out ?? 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    },
  });

describe('readTrace', () => {
  it('times each model call from its request and each tool from use to result', () => {
    const t = readTrace('rows', 'executor', [
      user(0, 'go'),
      asst(2, 'm1', [{ type: 'text', text: 'running tests' }], { effort: 'max' }),
      asst(3, 'm1', [{ type: 'tool_use', id: 'tu1', name: 'Bash', input: { command: 'npx vitest run a.ts' } }], { out: 50, effort: 'max' }),
      user(13, [{ type: 'tool_result', tool_use_id: 'tu1', content: 'ok' }]),
      asst(15, 'm2', [{ type: 'text', text: 'done' }], { stop: 'end_turn' }),
    ]);
    expect(t.calls.map((c) => [c.id, c.requestedAt - T0, c.lastAt - T0, c.outputTokens, c.effort])).toEqual([
      ['m1', 0, 3000, 50, 'max'],
      ['m2', 13000, 15000, 5, undefined],
    ]);
    expect(t.calls[1].stopReason).toBe('end_turn');
    expect(t.tools).toEqual([
      { id: 'tu1', name: 'Bash', category: 'tests', command: 'npx vitest run a.ts', startAt: T0 + 3000, endAt: T0 + 13000, unfinished: false },
    ]);
    expect([t.firstAt - T0, t.lastAt - T0]).toEqual([0, 15000]);
    expect(t.costUsd).toBeGreaterThan(0);
  });

  it('collects incoming messages, sends and task events', () => {
    const t = readTrace('rows', 'executor', [
      user(0, '<teammate-message teammate_id="team-lead" summary="fix">\nFix the header, please.\n</teammate-message>'),
      asst(5, 'm1', [
        { type: 'tool_use', id: 'tc', name: 'TaskCreate', input: { subject: 'x', description: 'y' } },
        { type: 'tool_use', id: 'tu', name: 'TaskUpdate', input: { taskId: '7', status: 'in_progress', owner: 'rows' } },
        { type: 'tool_use', id: 'sm', name: 'SendMessage', input: { to: 'team-lead', message: 'Header fixed.' } },
      ]),
      user(6, [
        { type: 'tool_result', tool_use_id: 'tc', content: 'Task #9 created successfully: x' },
        { type: 'tool_result', tool_use_id: 'tu', content: 'Updated task #7 status' },
        { type: 'tool_result', tool_use_id: 'sm', content: '{"success":true}' },
      ]),
      user(9, '<teammate-message teammate_id="voices" color="purple">\n{"type":"idle_notification","from":"voices"}\n</teammate-message>'),
    ]);
    expect(t.incoming).toMatchObject([
      { at: T0, kind: 'message', from: 'team-lead' },
      { at: T0 + 9000, kind: 'idle', from: 'voices' },
    ]);
    expect(t.incoming[0].text).toContain('Fix the header, please.');
    expect(t.sends).toEqual([{ at: T0 + 5000, from: 'rows', to: 'team-lead', text: 'Header fixed.' }]);
    expect(t.taskEvents).toEqual([
      { at: T0 + 5000, by: 'rows', taskId: '7', status: 'in_progress', owner: 'rows', addBlockedBy: undefined },
      { at: T0 + 6000, by: 'rows', taskId: '9', status: 'pending' },
    ]);
  });

  it('files a poll on a background command under what it waits for', () => {
    const t = readTrace('rows', 'executor', [
      user(0, 'go'),
      asst(1, 'm1', [{ type: 'tool_use', id: 'pk', name: 'Bash', input: { command: 'npm run package', run_in_background: true } }]),
      user(2, [{ type: 'tool_result', tool_use_id: 'pk', content: 'Command running in background with ID: bx1. Output is being written to: /tmp/tasks/bx1.output' }]),
      asst(3, 'm2', [{ type: 'tool_use', id: 'po', name: 'Bash', input: { command: 'until grep -q exit /tmp/tasks/bx1.output; do sleep 5; done' } }]),
      user(200, [{ type: 'tool_result', tool_use_id: 'po', content: '' }]),
    ]);
    expect(t.tools.find((x) => x.id === 'po')?.category).toBe('expensive check');
  });
});
```

- [ ] **Step 6: Run it and see it fail**

Run: `npx vitest run src/server/measure/trace.test.ts`
Expected: FAIL, "Failed to resolve import ./trace".

- [ ] **Step 7: Write `src/server/measure/trace.ts`**

```ts
import { parseTeammateFrames } from '../../shared/mailbox';
import { parseLine, type TranscriptRecord } from '../../shared/transcript';
import { totalCost, usageRecordsOf } from '../../shared/usage';
import { classifyTool, type Category } from './classify';

export interface ModelCall {
  id: string;
  model: string;
  effort?: string; // the record's top-level `effort`, e.g. 'max'
  requestedAt: number; // the later of the last user line and the previous call's last line
  firstAt: number;
  lastAt: number;
  outputTokens: number;
  stopReason?: string;
  toolIds: string[];
}
export interface ToolSpan { id: string; name: string; category: Category; command?: string; startAt: number; endAt: number; unfinished: boolean }
export type IncomingKind = 'message' | 'idle' | 'task-notification' | 'user';
export interface Incoming { at: number; kind: IncomingKind; from?: string; text: string }
export interface Send { at: number; from: string; to: string; text: string }
export interface TaskEvent { at: number; by: string; taskId: string; status?: string; owner?: string; addBlockedBy?: string[] }
export type Role = 'lead' | 'executor' | 'reviewer' | 'other';
export interface AgentTrace {
  name: string;
  role: Role;
  firstAt: number;
  lastAt: number;
  calls: ModelCall[];
  tools: ToolSpan[];
  incoming: Incoming[];
  sends: Send[];
  taskEvents: TaskEvent[];
  costUsd: number;
}

type Rec = TranscriptRecord & { effort?: string; requestId?: string; isMeta?: boolean };
interface Block { type?: string; id?: string; name?: string; input?: unknown; tool_use_id?: string; content?: unknown; text?: string }

const BACKGROUND_ID = /running in background with ID: (\w+)/;
const BACKGROUND_POLL = /tasks\/(\w+)\.output/;
const CREATED_TASK = /Task #(\d+) created/;
const NOT_A_MESSAGE = /^<(system-reminder|local-command|command-)/;

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return (content as Block[])
    .map((b) => (b?.type === 'text' ? b.text ?? '' : b?.type === 'tool_result' ? textOf(b.content) : ''))
    .join('\n');
}

export function readTrace(name: string, role: Role, lines: string[]): AgentTrace {
  const records = lines.map(parseLine).filter((r): r is Rec => r !== null);
  const trace: AgentTrace = { name, role, firstAt: Infinity, lastAt: -Infinity, calls: [], tools: [], incoming: [], sends: [], taskEvents: [], costUsd: 0 };
  const callsById = new Map<string, ModelCall>();
  const tools = new Map<string, ToolSpan>();
  const background = new Map<string, Category>(); // background command id -> the category of what it runs
  const creates = new Set<string>(); // TaskCreate tool ids whose result carries the new task's number
  let lastUserAt = -Infinity;

  records.forEach((r, i) => {
    const at = r.timestamp ? Date.parse(r.timestamp) : NaN;
    if (Number.isNaN(at)) return;
    trace.firstAt = Math.min(trace.firstAt, at);
    trace.lastAt = Math.max(trace.lastAt, at);

    if (r.type === 'assistant') {
      const m = (r.message ?? {}) as NonNullable<Rec['message']> & { stop_reason?: string | null };
      if (m.model === '<synthetic>') return;
      const id = m.id ?? r.requestId ?? `line:${i}`;
      let call = callsById.get(id);
      if (!call) {
        const previous = trace.calls[trace.calls.length - 1];
        const requestedAt = Math.max(lastUserAt, previous?.lastAt ?? -Infinity);
        call = { id, model: m.model ?? 'unknown', effort: r.effort, requestedAt: Number.isFinite(requestedAt) ? requestedAt : at, firstAt: at, lastAt: at, outputTokens: 0, toolIds: [] };
        callsById.set(id, call);
        trace.calls.push(call);
      }
      call.lastAt = Math.max(call.lastAt, at);
      call.outputTokens = Math.max(call.outputTokens, m.usage?.output_tokens ?? 0);
      if (m.stop_reason) call.stopReason = m.stop_reason;
      for (const b of (Array.isArray(m.content) ? m.content : []) as Block[]) {
        if (b?.type !== 'tool_use' || !b.id || !b.name) continue;
        const input = (b.input ?? {}) as Record<string, unknown>;
        const command = str(input.command);
        const polled = command ? BACKGROUND_POLL.exec(command)?.[1] : undefined;
        const category = (polled && background.get(polled)) || classifyTool(b.name, input);
        tools.set(b.id, { id: b.id, name: b.name, category, command, startAt: at, endAt: at, unfinished: true });
        call.toolIds.push(b.id);
        if (b.name === 'SendMessage' && typeof input.to === 'string') {
          trace.sends.push({ at, from: name, to: input.to, text: typeof input.message === 'string' ? input.message : JSON.stringify(input.message ?? '') });
        }
        if (b.name === 'TaskUpdate' && input.taskId != null) {
          trace.taskEvents.push({
            at,
            by: name,
            taskId: String(input.taskId),
            status: str(input.status),
            owner: str(input.owner),
            addBlockedBy: Array.isArray(input.addBlockedBy) ? input.addBlockedBy.map(String) : undefined,
          });
        }
        if (b.name === 'TaskCreate') creates.add(b.id);
      }
      return;
    }

    if (r.type !== 'user') return;
    lastUserAt = at;
    const content = r.message?.content;
    const results = (Array.isArray(content) ? (content as Block[]) : []).filter((b) => b?.type === 'tool_result');
    for (const b of results) {
      const span = b.tool_use_id ? tools.get(b.tool_use_id) : undefined;
      if (!span || !span.unfinished) continue;
      span.endAt = at;
      span.unfinished = false;
      const output = textOf(b.content);
      const backgroundId = BACKGROUND_ID.exec(output)?.[1];
      if (backgroundId) background.set(backgroundId, span.category);
      if (creates.delete(span.id)) {
        const taskId = CREATED_TASK.exec(output)?.[1];
        if (taskId) trace.taskEvents.push({ at, by: name, taskId, status: 'pending' });
      }
    }
    if (results.length || r.isMeta) return;
    const text = textOf(content);
    if (!text.trim() || NOT_A_MESSAGE.test(text.trim())) return;
    const frames = parseTeammateFrames(text, at, name);
    if (frames.length) {
      for (const f of frames) trace.incoming.push({ at, kind: f.protocol?.type === 'idle_notification' ? 'idle' : 'message', from: f.from, text: f.text });
    } else {
      trace.incoming.push({ at, kind: text.includes('<task-notification') ? 'task-notification' : 'user', text });
    }
  });

  trace.tools = [...tools.values()];
  trace.costUsd = totalCost(usageRecordsOf(records));
  if (!Number.isFinite(trace.firstAt)) trace.firstAt = trace.lastAt = 0;
  return trace;
}
```

- [ ] **Step 8: Run it and see it pass**

Run: `npx vitest run src/server/measure/trace.test.ts`
Expected: PASS, 3 tests. If `parseTeammateFrames` returns the body with surrounding whitespace, `toContain` still holds. Don't loosen any other assertion.

- [ ] **Step 9: Write the failing loader test** in `src/server/measure/load.test.ts`

```ts
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findSession, loadTraces } from './load';

describe('findSession', () => {
  it("finds the lead and its subagents, with roles from the lead's Agent calls", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'measure-'));
    const project = path.join(home, 'projects', '-Users-x-code');
    const sub = path.join(project, 'sid1', 'subagents');
    await mkdir(sub, { recursive: true });
    await writeFile(
      path.join(project, 'sid1.jsonl'),
      JSON.stringify({
        type: 'assistant',
        timestamp: '2026-09-30T08:00:00Z',
        message: { id: 'm1', model: 'claude-opus-5-5', content: [{ type: 'tool_use', id: 't1', name: 'Agent', input: { name: 'rows', subagent_type: 'team8:executor', prompt: 'p' } }] },
      }) + '\n',
    );
    await writeFile(path.join(sub, 'agent-arows-0123456789abcdef.jsonl'), '');
    await writeFile(path.join(sub, 'agent-arows-0123456789abcdef.meta.json'), JSON.stringify({ name: 'rows' }));
    await writeFile(path.join(sub, 'agent-a5f82aabd3b445aaa.jsonl'), '');

    const files = await findSession(home, 'sid1');
    expect(files?.lead).toBe(path.join(project, 'sid1.jsonl'));
    expect(files?.agents.map((a) => [a.name, a.role])).toEqual([
      ['agent-a5f82aabd3b445aaa', 'other'],
      ['rows', 'executor'],
    ]);
    expect((await loadTraces(files!)).map((t) => [t.name, t.role])).toEqual([
      ['team-lead', 'lead'],
      ['agent-a5f82aabd3b445aaa', 'other'],
      ['rows', 'executor'],
    ]);
    expect(await findSession(home, 'missing')).toBeNull();
  });
});
```

- [ ] **Step 10: Run it and see it fail**

Run: `npx vitest run src/server/measure/load.test.ts`
Expected: FAIL, "Failed to resolve import ./load".

- [ ] **Step 11: Write `src/server/measure/load.ts`**

```ts
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parseLine } from '../../shared/transcript';
import { readTrace, type AgentTrace, type Role } from './trace';

export interface SessionFiles { sessionId: string; lead: string; agents: Array<{ name: string; role: Role; path: string }> }

const SUBAGENT_FILE = /^agent-a(.+)-[0-9a-f]{16}\.jsonl$/;

// A teammate's meta.json keeps only its name; the lead's Agent call is the one
// record of which definition it was spawned from.
function rolesFromLead(lines: string[]): Map<string, Role> {
  const roles = new Map<string, Role>();
  for (const line of lines) {
    const r = parseLine(line);
    const content = r?.type === 'assistant' ? r.message?.content : undefined;
    if (!Array.isArray(content)) continue;
    for (const b of content as Array<{ type?: string; name?: string; input?: { name?: unknown; subagent_type?: unknown } }>) {
      if (b?.type !== 'tool_use' || b.name !== 'Agent' || typeof b.input?.name !== 'string') continue;
      const type = typeof b.input.subagent_type === 'string' ? b.input.subagent_type : '';
      roles.set(b.input.name, /executor/.test(type) ? 'executor' : /reviewer/.test(type) ? 'reviewer' : 'other');
    }
  }
  return roles;
}

async function readLines(file: string): Promise<string[]> {
  return (await fs.readFile(file, 'utf8')).split('\n');
}

export async function findSession(claudeHome: string, sessionId: string): Promise<SessionFiles | null> {
  const projects = path.join(claudeHome, 'projects');
  let dirs: string[];
  try {
    dirs = await fs.readdir(projects);
  } catch {
    return null;
  }
  for (const dir of dirs) {
    const lead = path.join(projects, dir, `${sessionId}.jsonl`);
    try {
      await fs.access(lead);
    } catch {
      continue;
    }
    const roles = rolesFromLead(await readLines(lead));
    const subdir = path.join(projects, dir, sessionId, 'subagents');
    let files: string[] = [];
    try {
      files = (await fs.readdir(subdir)).filter((f) => f.endsWith('.jsonl')).sort();
    } catch {
      // A session that never spawned anything has no subagents folder.
    }
    const seen = new Map<string, number>();
    const agents: SessionFiles['agents'] = [];
    for (const file of files) {
      let name = SUBAGENT_FILE.exec(file)?.[1] ?? file.replace(/\.jsonl$/, '');
      try {
        const meta = JSON.parse(await fs.readFile(path.join(subdir, file.replace(/\.jsonl$/, '.meta.json')), 'utf8')) as { name?: unknown };
        if (typeof meta.name === 'string') name = meta.name;
      } catch {
        // No meta.json: keep the name from the file.
      }
      const role = roles.get(name) ?? 'other';
      const n = (seen.get(name) ?? 0) + 1;
      seen.set(name, n);
      agents.push({ name: n > 1 ? `${name}#${n}` : name, role, path: path.join(subdir, file) }); // a respawn under the same name
    }
    return { sessionId, lead, agents };
  }
  return null;
}

export async function loadTraces(files: SessionFiles): Promise<AgentTrace[]> {
  const traces = [readTrace('team-lead', 'lead', await readLines(files.lead))];
  for (const a of files.agents) traces.push(readTrace(a.name, a.role, await readLines(a.path)));
  return traces;
}
```

Note: `agent-a5f82aabd3b445aaa.jsonl` has no name segment, so `SUBAGENT_FILE` misses it and the name is the file stem. The test expects exactly that.

- [ ] **Step 12: Run the three tests and the typecheck**

Run: `npx vitest run src/server/measure/ && npm run typecheck`
Expected: PASS, 7 tests; the typecheck exits 0.

- [ ] **Step 13: Commit**

```bash
git add src/server/measure/classify.ts src/server/measure/classify.test.ts src/server/measure/trace.ts src/server/measure/trace.test.ts src/server/measure/load.ts src/server/measure/load.test.ts
git commit -m "Read a session's transcripts into per-agent traces for measure" -- src/server/measure/classify.ts src/server/measure/classify.test.ts src/server/measure/trace.ts src/server/measure/trace.test.ts src/server/measure/load.ts src/server/measure/load.test.ts
```

### Task 2: Time attribution

**Files:**
- Create: `src/server/measure/sleep.ts`, `src/server/measure/sleep.test.ts`
- Create: `src/server/measure/sweep.ts`, `src/server/measure/sweep.test.ts`

**Interfaces:**
- Consumes: `AgentTrace`, `ModelCall`, `ToolSpan`, `Category` from Task 1
- Produces:
  - `interface Interval { startAt: number; endAt: number }`
  - `parsePmsetLog(text: string): Interval[]`
  - `type Owner = Category | 'model' | 'asleep' | 'idle' | 'gap'`
  - `interface Segment { startAt: number; endAt: number; owner: Owner }`
  - `interface Attribution { byOwner: Partial<Record<Owner, number>>; segments: Segment[] }`
  - `attribute(trace: AgentTrace, sleeps: Interval[], window?: Interval): Attribution`

- [ ] **Step 1: Write the failing pmset test** in `src/server/measure/sleep.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { parsePmsetLog } from './sleep';

const LOG = [
  '2026-09-29 04:50:16 -0300 Assertions          \tPID 91634(caffeinate) ClientDied PreventUserIdleSystemSleep "caffeinate command-line tool" 00:03:59',
  "2026-09-29 04:56:59 -0300 Sleep               \tEntering Sleep state due to 'Clamshell Sleep':TCPKeepAlive=active Using Batt (Charge:89%) 990 secs",
  '2026-09-29 05:13:16 -0300 DarkWake            \tDarkWake from Deep Idle [CDNP] : due to SMC.OutboxNotEmpty/ Using Batt (Charge:89%) 16 secs',
  '2026-09-29 05:13:20 -0300 Wake Requests       \t[*process=mDNSResponder request=Maintenance deltaSecs=7199]',
  "2026-09-29 05:13:32 -0300 Sleep               \tEntering Sleep state due to 'Sleep Service Back to Sleep':TCPKeepAlive=active Using Batt (Charge:89%) 1 secs",
  '2026-09-29 11:03:59 -0300 Wake                \tWake from Deep Idle [CDNVA] : due to UserActivity Clamshell/ Using BATT (Charge:88%)',
].join('\n');

describe('parsePmsetLog', () => {
  it('pairs each sleep with the next wake or dark wake and skips every other line', () => {
    expect(parsePmsetLog(LOG)).toEqual([
      { startAt: Date.parse('2026-09-29T04:56:59-03:00'), endAt: Date.parse('2026-09-29T05:13:16-03:00') },
      { startAt: Date.parse('2026-09-29T05:13:32-03:00'), endAt: Date.parse('2026-09-29T11:03:59-03:00') },
    ]);
  });

  it('returns nothing for a log without sleeps', () => {
    expect(parsePmsetLog('')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/server/measure/sleep.test.ts`
Expected: FAIL, "Failed to resolve import ./sleep".

- [ ] **Step 3: Write `src/server/measure/sleep.ts`**

```ts
export interface Interval { startAt: number; endAt: number }

// The description is part of the match: "Wake Requests" and "Assertions" lines
// share the date prefix but are not sleeps or wakes. A dark wake counts as awake:
// agents run during those maintenance wakes.
const EVENT = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2}) (?:Sleep\s+Entering Sleep|(?:Dark)?Wake\s+(?:Dark)?Wake from)/;

export function parsePmsetLog(text: string): Interval[] {
  const out: Interval[] = [];
  let asleepAt: number | undefined;
  for (const line of text.split('\n')) {
    const m = EVENT.exec(line);
    if (!m) continue;
    const at = Date.parse(`${m[1]}T${m[2]}${m[3]}:${m[4]}`);
    if (line.includes('Entering Sleep')) asleepAt ??= at;
    else if (asleepAt !== undefined) {
      out.push({ startAt: asleepAt, endAt: at });
      asleepAt = undefined;
    }
  }
  return out;
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `npx vitest run src/server/measure/sleep.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Write the failing sweep test** in `src/server/measure/sweep.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { attribute } from './sweep';
import type { AgentTrace } from './trace';

const trace = (over: Partial<AgentTrace> = {}): AgentTrace => ({
  name: 'rows',
  role: 'executor',
  firstAt: 0,
  lastAt: 60_000,
  calls: [
    { id: 'm1', model: 'claude-opus-5-5', requestedAt: 0, firstAt: 2_000, lastAt: 3_000, outputTokens: 50, toolIds: ['t1'] },
    { id: 'm2', model: 'claude-opus-5-5', requestedAt: 13_000, firstAt: 14_000, lastAt: 15_000, outputTokens: 5, stopReason: 'end_turn', toolIds: [] },
  ],
  tools: [{ id: 't1', name: 'Bash', category: 'tests', command: 'npx vitest run', startAt: 3_000, endAt: 13_000, unfinished: false }],
  incoming: [],
  sends: [],
  taskEvents: [],
  costUsd: 0,
  ...over,
});

describe('attribute', () => {
  it('gives each second to the model, the running tool, or idle once the turn ended', () => {
    const a = attribute(trace(), []);
    expect(a.byOwner).toEqual({ model: 5_000, tests: 10_000, idle: 45_000 });
    expect(a.segments.map((s) => [s.owner, s.startAt, s.endAt])).toEqual([
      ['model', 0, 3_000],
      ['tests', 3_000, 13_000],
      ['model', 13_000, 15_000],
      ['idle', 15_000, 60_000],
    ]);
  });

  it('takes the time the Mac slept out of everything else', () => {
    expect(attribute(trace(), [{ startAt: 20_000, endAt: 30_000 }]).byOwner).toEqual({ model: 5_000, tests: 10_000, idle: 35_000, asleep: 10_000 });
  });

  it('counts only the window when one is given', () => {
    expect(attribute(trace(), [], { startAt: 10_000, endAt: 20_000 }).byOwner).toEqual({ tests: 3_000, model: 2_000, idle: 5_000 });
  });

  it('lets the model own time a tool also covers, and the earliest-started tool own an overlap', () => {
    const t = trace({
      lastAt: 10_000,
      calls: [{ id: 'm1', model: 'x', requestedAt: 0, firstAt: 1_000, lastAt: 2_000, outputTokens: 1, toolIds: ['a', 'b'] }],
      tools: [
        { id: 'a', name: 'Bash', category: 'build', startAt: 1_000, endAt: 10_000, unfinished: false },
        { id: 'b', name: 'Bash', category: 'tests', startAt: 2_000, endAt: 6_000, unfinished: false },
      ],
    });
    expect(attribute(t, []).byOwner).toEqual({ model: 2_000, build: 8_000 });
  });

  it('calls a silence after a call that asked for a tool a gap, not idle', () => {
    const t = trace({
      lastAt: 5_000,
      calls: [{ id: 'm1', model: 'x', requestedAt: 0, firstAt: 1_000, lastAt: 2_000, outputTokens: 1, toolIds: ['a'] }],
      tools: [{ id: 'a', name: 'Bash', category: 'other', startAt: 2_000, endAt: 2_000, unfinished: true }],
    });
    expect(attribute(t, []).byOwner).toEqual({ model: 2_000, gap: 3_000 });
  });
});
```

- [ ] **Step 6: Run it and see it fail**

Run: `npx vitest run src/server/measure/sweep.test.ts`
Expected: FAIL, "Failed to resolve import ./sweep".

- [ ] **Step 7: Write `src/server/measure/sweep.ts`**

```ts
import type { Category } from './classify';
import type { Interval } from './sleep';
import type { AgentTrace, ModelCall } from './trace';

export type Owner = Category | 'model' | 'asleep' | 'idle' | 'gap';
export interface Segment { startAt: number; endAt: number; owner: Owner }
export interface Attribution { byOwner: Partial<Record<Owner, number>>; segments: Segment[] }

interface Span { startAt: number; endAt: number; owner: Owner }

function lastEndedBy(callsByEnd: ModelCall[], t: number): ModelCall | undefined {
  let found: ModelCall | undefined;
  for (const c of callsByEnd) {
    if (c.lastAt > t) break;
    found = c;
  }
  return found;
}

// Each moment goes to one owner, in this order: asleep, model, the earliest-started
// running tool, then idle (the last call ended its turn) or gap (it was waiting on a tool).
// ponytail: O(bounds × spans); a sorted sweep with an active set if a session ever takes seconds.
export function attribute(trace: AgentTrace, sleeps: Interval[], window?: Interval): Attribution {
  const from = Math.max(trace.firstAt, window?.startAt ?? -Infinity);
  const to = Math.min(trace.lastAt, window?.endAt ?? Infinity);
  const spans: Span[] = [
    ...sleeps.map((s) => ({ startAt: s.startAt, endAt: s.endAt, owner: 'asleep' as const })),
    ...trace.calls.map((c) => ({ startAt: c.requestedAt, endAt: c.lastAt, owner: 'model' as const })),
    ...trace.tools.filter((t) => t.endAt > t.startAt).map((t) => ({ startAt: t.startAt, endAt: t.endAt, owner: t.category })),
  ].filter((s) => s.endAt > from && s.startAt < to);
  const bounds = [...new Set([from, to, ...spans.flatMap((s) => [s.startAt, s.endAt])])]
    .filter((b) => b >= from && b <= to)
    .sort((a, b) => a - b);
  const callsByEnd = [...trace.calls].sort((a, b) => a.lastAt - b.lastAt);

  const byOwner: Attribution['byOwner'] = {};
  const segments: Segment[] = [];
  for (let k = 0; k + 1 < bounds.length; k++) {
    const s = bounds[k];
    const e = bounds[k + 1];
    const live = spans.filter((x) => x.startAt <= s && x.endAt > s);
    let owner: Owner;
    if (live.some((x) => x.owner === 'asleep')) owner = 'asleep';
    else if (live.some((x) => x.owner === 'model')) owner = 'model';
    else if (live.length) owner = live.reduce((a, b) => (b.startAt < a.startAt ? b : a)).owner;
    else {
      const last = lastEndedBy(callsByEnd, s);
      owner = !last || last.stopReason === 'end_turn' || last.toolIds.length === 0 ? 'idle' : 'gap';
    }
    byOwner[owner] = (byOwner[owner] ?? 0) + (e - s);
    const previous = segments[segments.length - 1];
    if (previous && previous.owner === owner && previous.endAt === s) previous.endAt = e;
    else segments.push({ startAt: s, endAt: e, owner });
  }
  return { byOwner, segments };
}
```

- [ ] **Step 8: Run both tests and the typecheck**

Run: `npx vitest run src/server/measure/sleep.test.ts src/server/measure/sweep.test.ts && npm run typecheck`
Expected: PASS, 7 tests; the typecheck exits 0.

- [ ] **Step 9: Commit**

```bash
git add src/server/measure/sleep.ts src/server/measure/sleep.test.ts src/server/measure/sweep.ts src/server/measure/sweep.test.ts
git commit -m "Attribute each agent's time to the model, its tools, idle or sleep" -- src/server/measure/sleep.ts src/server/measure/sleep.test.ts src/server/measure/sweep.ts src/server/measure/sweep.test.ts
```

### Task 3: Messages and tasks

**Files:**
- Create: `src/server/measure/lag.ts`, `src/server/measure/lag.test.ts`
- Create: `src/server/measure/tasks.ts`, `src/server/measure/tasks.test.ts`

**Interfaces:**
- Consumes: `AgentTrace`, `Send`, `Incoming`, `TaskEvent` from Task 1; `Attribution`, `Segment` from Task 2
- Produces:
  - `interface Lag { from: string; to: string; sentAt: number; seenAt?: number; lagMs?: number; text: string }`
  - `messageLags(traces: AgentTrace[]): Lag[]`
  - `interface LagSummary { sent: number; delivered: number; medianMs: number; p90Ms: number; maxMs: number; over5Min: number }`
  - `summarizeLags(lags: Lag[]): LagSummary`
  - `interface TrackTail { executor: string; lastCompletedAt: number; clearedAt: number; tailMs: number }`
  - `reviewTails(traces: AgentTrace[]): TrackTail[]`
  - `interface IdleWithWork { executor: string; taskId: string; idleFrom: number; idleTo: number; claimedAt: number; ms: number }`
  - `idleWithWork(traces: AgentTrace[], attributions: Map<string, Attribution>): IdleWithWork[]`
  - `percentile(sorted: number[], p: number): number` (from `lag.ts`; `report.ts` reuses it)

- [ ] **Step 1: Write the failing lag test** in `src/server/measure/lag.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { messageLags, summarizeLags } from './lag';
import type { AgentTrace } from './trace';

const trace = (name: string, over: Partial<AgentTrace> = {}): AgentTrace => ({
  name, role: 'executor', firstAt: 0, lastAt: 0, calls: [], tools: [], incoming: [], sends: [], taskEvents: [], costUsd: 0, ...over,
});

describe('messageLags', () => {
  it("matches each message to its first delivery in the recipient's transcript", () => {
    const lead = trace('team-lead', {
      role: 'lead',
      sends: [
        { at: 0, from: 'team-lead', to: 'rows', text: 'Fix the header, please.' },
        { at: 10_000, from: 'team-lead', to: 'rows', text: 'Never mind.' },
      ],
      incoming: [{ at: 5_500, kind: 'message', from: 'rows', text: 'On it' }],
    });
    const rows = trace('rows', {
      sends: [{ at: 5_000, from: 'rows', to: 'lead', text: 'On it' }],
      incoming: [{ at: 240_000, kind: 'message', from: 'team-lead', text: '\nFix the header, please.\n' }],
    });
    expect(messageLags([lead, rows])).toEqual([
      { from: 'team-lead', to: 'rows', sentAt: 0, seenAt: 240_000, lagMs: 240_000, text: 'Fix the header, please.' },
      { from: 'team-lead', to: 'rows', sentAt: 10_000, seenAt: undefined, lagMs: undefined, text: 'Never mind.' },
      { from: 'rows', to: 'team-lead', sentAt: 5_000, seenAt: 5_500, lagMs: 500, text: 'On it' },
    ]);
  });
});

describe('summarizeLags', () => {
  it('summarizes the delivered lags and counts the ones over five minutes', () => {
    const lags = [60_000, 240_000, 400_000, 1_380_000].map((lagMs, i) => ({ from: 'a', to: 'b', sentAt: i, seenAt: i + lagMs, lagMs, text: '' }));
    expect(summarizeLags([...lags, { from: 'a', to: 'b', sentAt: 9, text: '' }])).toEqual({
      sent: 5, delivered: 4, medianMs: 400_000, p90Ms: 1_380_000, maxMs: 1_380_000, over5Min: 2,
    });
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/server/measure/lag.test.ts`
Expected: FAIL, "Failed to resolve import ./lag".

- [ ] **Step 3: Write `src/server/measure/lag.ts`**

```ts
import type { AgentTrace } from './trace';

export interface Lag { from: string; to: string; sentAt: number; seenAt?: number; lagMs?: number; text: string }
export interface LagSummary { sent: number; delivered: number; medianMs: number; p90Ms: number; maxMs: number; over5Min: number }

const LEAD_ALIASES = new Set(['team-lead', 'lead', 'main']);

// Delivery rewraps the text, so a sent copy and a seen copy are compared on their
// first 40 word characters, as the delay log matched them.
const key = (text: string) => text.replace(/\W+/g, '').slice(0, 40);

// Nearest-rank on a sorted array; the median of an even count is the upper middle.
export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

export function messageLags(traces: AgentTrace[]): Lag[] {
  const byName = new Map(traces.map((t) => [t.name, t]));
  const lags: Lag[] = [];
  for (const t of traces) {
    for (const send of t.sends) {
      const to = LEAD_ALIASES.has(send.to) ? 'team-lead' : send.to;
      const want = key(send.text);
      // Transcripts are written by different processes; 2 s of slack keeps a same-second delivery.
      const seen = byName.get(to)?.incoming.find((m) => m.from === send.from && m.at >= send.at - 2_000 && key(m.text) === want);
      lags.push({ from: send.from, to, sentAt: send.at, seenAt: seen?.at, lagMs: seen ? Math.max(0, seen.at - send.at) : undefined, text: send.text });
    }
  }
  return lags;
}

export function summarizeLags(lags: Lag[]): LagSummary {
  const ms = lags.flatMap((l) => (l.lagMs === undefined ? [] : [l.lagMs])).sort((a, b) => a - b);
  return {
    sent: lags.length,
    delivered: ms.length,
    medianMs: percentile(ms, 0.5),
    p90Ms: percentile(ms, 0.9),
    maxMs: ms[ms.length - 1] ?? 0,
    over5Min: ms.filter((m) => m > 300_000).length,
  };
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `npx vitest run src/server/measure/lag.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Write the failing tasks test** in `src/server/measure/tasks.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import type { Attribution } from './sweep';
import { idleWithWork, reviewTails } from './tasks';
import type { AgentTrace, Role } from './trace';

const trace = (name: string, role: Role, over: Partial<AgentTrace> = {}): AgentTrace => ({
  name, role, firstAt: 0, lastAt: 0, calls: [], tools: [], incoming: [], sends: [], taskEvents: [], costUsd: 0, ...over,
});

describe('reviewTails', () => {
  it("runs from the executor's last completed task to the lead's track clear", () => {
    const lead = trace('team-lead', 'lead', {
      sends: [
        { at: 1_000, from: 'team-lead', to: 'rows', text: 'Start with #7.' },
        { at: 1_000_000, from: 'team-lead', to: 'rows', text: 'Your track is clear. Thanks.' },
      ],
    });
    const rows = trace('rows', 'executor', {
      taskEvents: [
        { at: 100_000, by: 'rows', taskId: '7', status: 'completed' },
        { at: 400_000, by: 'rows', taskId: '8', status: 'completed' },
      ],
    });
    expect(reviewTails([lead, rows])).toEqual([{ executor: 'rows', lastCompletedAt: 400_000, clearedAt: 1_000_000, tailMs: 600_000 }]);
  });
});

describe('idleWithWork', () => {
  it('counts the idle stretch before a claim when the claimed task was already ready, once', () => {
    const lead = trace('team-lead', 'lead', {
      taskEvents: [
        { at: 0, by: 'team-lead', taskId: '20', status: 'pending' },
        { at: 0, by: 'team-lead', taskId: '21', status: 'pending' },
        { at: 0, by: 'team-lead', taskId: '22', status: 'pending' },
        { at: 1, by: 'team-lead', taskId: '22', addBlockedBy: ['99'] },
      ],
    });
    const sidebar = trace('sidebar', 'executor', {
      taskEvents: [
        { at: 1_000, by: 'sidebar', taskId: '20', status: 'in_progress' },
        { at: 60_000, by: 'sidebar', taskId: '20', status: 'completed' },
        { at: 6_200_000, by: 'sidebar', taskId: '21', status: 'in_progress' },
        { at: 6_300_000, by: 'sidebar', taskId: '22', status: 'in_progress' },
      ],
    });
    const attributions = new Map<string, Attribution>([
      ['sidebar', {
        byOwner: {},
        segments: [
          { startAt: 0, endAt: 61_000, owner: 'model' },
          { startAt: 61_000, endAt: 6_180_000, owner: 'idle' },
          { startAt: 6_180_000, endAt: 6_400_000, owner: 'model' },
        ],
      }],
    ]);
    expect(idleWithWork([lead, sidebar], attributions)).toEqual([
      { executor: 'sidebar', taskId: '21', idleFrom: 61_000, idleTo: 6_180_000, claimedAt: 6_200_000, ms: 6_119_000 },
    ]);
  });
});
```

The first claim (#20) has no idle stretch before it. #22 shares #21's stretch, and its blocker #99 never completes, so neither adds a row.

- [ ] **Step 6: Run it and see it fail**

Run: `npx vitest run src/server/measure/tasks.test.ts`
Expected: FAIL, "Failed to resolve import ./tasks".

- [ ] **Step 7: Write `src/server/measure/tasks.ts`**

```ts
import type { Attribution, Segment } from './sweep';
import type { AgentTrace } from './trace';

export interface TrackTail { executor: string; lastCompletedAt: number; clearedAt: number; tailMs: number }
export interface IdleWithWork { executor: string; taskId: string; idleFrom: number; idleTo: number; claimedAt: number; ms: number }

// team8:run tells an executor "your track is clear" when its review is done.
const TRACK_CLEAR = /track is clear|track's clear/i;

export function reviewTails(traces: AgentTrace[]): TrackTail[] {
  const byName = new Map(traces.map((t) => [t.name, t]));
  const tails: TrackTail[] = [];
  for (const lead of traces.filter((t) => t.role === 'lead')) {
    for (const send of lead.sends) {
      if (!TRACK_CLEAR.test(send.text)) continue;
      const completed = (byName.get(send.to)?.taskEvents ?? []).filter((e) => e.status === 'completed' && e.at <= send.at).map((e) => e.at);
      if (!completed.length) continue;
      const lastCompletedAt = Math.max(...completed);
      tails.push({ executor: send.to, lastCompletedAt, clearedAt: send.at, tailMs: send.at - lastCompletedAt });
    }
  }
  return tails;
}

// Idle time an executor spent with a task it later claimed already created and
// unblocked. Each idle stretch counts once, however many claims follow it.
export function idleWithWork(traces: AgentTrace[], attributions: Map<string, Attribution>): IdleWithWork[] {
  const createdAt = new Map<string, number>();
  const blockers = new Map<string, string[]>();
  const completedAt = new Map<string, number>();
  for (const e of traces.flatMap((t) => t.taskEvents).sort((a, b) => a.at - b.at)) {
    if (e.status === 'pending' && !createdAt.has(e.taskId)) createdAt.set(e.taskId, e.at);
    if (e.addBlockedBy) blockers.set(e.taskId, [...(blockers.get(e.taskId) ?? []), ...e.addBlockedBy]);
    if (e.status === 'completed' && !completedAt.has(e.taskId)) completedAt.set(e.taskId, e.at);
  }
  const readyAt = (taskId: string, t: number) =>
    (createdAt.get(taskId) ?? Infinity) <= t && (blockers.get(taskId) ?? []).every((b) => (completedAt.get(b) ?? Infinity) <= t);

  const out: IdleWithWork[] = [];
  for (const trace of traces.filter((t) => t.role === 'executor')) {
    const idle = (attributions.get(trace.name)?.segments ?? []).filter((s) => s.owner === 'idle');
    const counted = new Set<Segment>();
    for (const claim of trace.taskEvents.filter((e) => e.status === 'in_progress')) {
      const before = idle.filter((s) => s.endAt <= claim.at).pop();
      if (!before || counted.has(before) || !readyAt(claim.taskId, before.startAt)) continue;
      counted.add(before);
      out.push({ executor: trace.name, taskId: claim.taskId, idleFrom: before.startAt, idleTo: before.endAt, claimedAt: claim.at, ms: before.endAt - before.startAt });
    }
  }
  return out;
}
```

- [ ] **Step 8: Run both tests and the typecheck**

Run: `npx vitest run src/server/measure/lag.test.ts src/server/measure/tasks.test.ts && npm run typecheck`
Expected: PASS, 4 tests; the typecheck exits 0.

- [ ] **Step 9: Commit**

```bash
git add src/server/measure/lag.ts src/server/measure/lag.test.ts src/server/measure/tasks.ts src/server/measure/tasks.test.ts
git commit -m "Measure message lag, review tails and idle time with work waiting" -- src/server/measure/lag.ts src/server/measure/lag.test.ts src/server/measure/tasks.ts src/server/measure/tasks.test.ts
```

### Task 4: Report, CLI and commands

**Files:**
- Create: `src/server/measure/report.ts`, `src/server/measure/report.test.ts`
- Create: `src/server/measure/cli.ts`, `src/server/measure/cli.test.ts`
- Modify: `src/server/index.ts` (`Cli`, `parseArgs`, `main`), `src/server/index.test.ts` (the `parseArgs` block)
- Create: `plugin/commands/measure.md`
- Modify: `plugin/skills/run/SKILL.md` (the Run Log at Close section)
- Create: `.claude/commands/bench.md`

**Interfaces:**
- Consumes: everything Tasks 1–3 produce
- Produces:
  - `interface AgentRow { name: string; role: Role; firstAt: number; lastAt: number; wallMs: number; byOwner: Attribution['byOwner']; calls: number; costUsd: number }`
  - `interface EffortRow { model: string; effort: string; calls: number; medianMs: number; p90Ms: number; meanMs: number; meanOutputTokens: number }`
  - `interface MeasureReport { sessionId: string; since?: number; agents: AgentRow[]; efforts: EffortRow[]; lags: LagSummary; slowestLags: Lag[]; tails: TrackTail[]; idleWithWork: IdleWithWork[]; asleepMs: number }`
  - `buildReport(sessionId: string, traces: AgentTrace[], sleeps: Interval[], since?: number): MeasureReport`
  - `renderMarkdown(report: MeasureReport): string`
  - `runMeasure(opts: { claudeHome: string; sessionId: string; json: boolean; since?: string }, out: (text: string) => void): Promise<number>`
  - `Cli.command` gains `'measure'`; `Cli` gains `json: boolean` and `since?: string`

- [ ] **Step 1: Write the failing report test** in `src/server/measure/report.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { buildReport, renderMarkdown } from './report';
import type { AgentTrace } from './trace';

const lead: AgentTrace = {
  name: 'team-lead', role: 'lead', firstAt: 0, lastAt: 1_000_000,
  calls: [{ id: 'l1', model: 'claude-opus-5-5', effort: 'max', requestedAt: 0, firstAt: 5_000, lastAt: 10_000, outputTokens: 100, stopReason: 'end_turn', toolIds: [] }],
  tools: [], incoming: [],
  sends: [{ at: 20_000, from: 'team-lead', to: 'rows', text: 'Your track is clear.' }],
  taskEvents: [{ at: 0, by: 'team-lead', taskId: '7', status: 'pending' }],
  costUsd: 1.5,
};
const rows: AgentTrace = {
  name: 'rows', role: 'executor', firstAt: 1_000, lastAt: 30_000,
  calls: [
    { id: 'r1', model: 'claude-sonnet-5', effort: 'medium', requestedAt: 1_000, firstAt: 2_000, lastAt: 3_000, outputTokens: 50, toolIds: ['t'] },
    { id: 'r2', model: 'claude-sonnet-5', effort: 'medium', requestedAt: 13_000, firstAt: 14_000, lastAt: 15_000, outputTokens: 10, stopReason: 'end_turn', toolIds: [] },
  ],
  tools: [{ id: 't', name: 'Bash', category: 'tests', command: 'npx vitest run', startAt: 3_000, endAt: 13_000, unfinished: false }],
  incoming: [{ at: 25_000, kind: 'message', from: 'team-lead', text: 'Your track is clear.' }],
  sends: [],
  taskEvents: [
    { at: 2_000, by: 'rows', taskId: '7', status: 'in_progress' },
    { at: 14_000, by: 'rows', taskId: '7', status: 'completed' },
  ],
  costUsd: 0.25,
};

describe('buildReport', () => {
  it('puts every measure of the session in one report', () => {
    const r = buildReport('sid', [lead, rows], []);
    expect(r.agents.find((a) => a.name === 'rows')).toMatchObject({ role: 'executor', wallMs: 29_000, calls: 2, costUsd: 0.25, byOwner: { model: 4_000, tests: 10_000, idle: 15_000 } });
    expect(r.efforts).toEqual([
      { model: 'claude-sonnet-5', effort: 'medium', calls: 2, medianMs: 2_000, p90Ms: 2_000, meanMs: 2_000, meanOutputTokens: 30 },
      { model: 'claude-opus-5-5', effort: 'max', calls: 1, medianMs: 10_000, p90Ms: 10_000, meanMs: 10_000, meanOutputTokens: 100 },
    ]);
    expect(r.lags).toEqual({ sent: 1, delivered: 1, medianMs: 5_000, p90Ms: 5_000, maxMs: 5_000, over5Min: 0 });
    expect(r.tails).toEqual([{ executor: 'rows', lastCompletedAt: 14_000, clearedAt: 20_000, tailMs: 6_000 }]);
    expect(r.idleWithWork).toEqual([]);
    expect(r.asleepMs).toBe(0);
  });

  it('leaves calls that overlap a sleep out of the per-call times, and counts the sleep', () => {
    const r = buildReport('sid', [lead, rows], [{ startAt: 500, endAt: 1_500 }]);
    expect(r.efforts.find((e) => e.effort === 'medium')?.calls).toBe(1);
    expect(r.asleepMs).toBe(1_000);
  });

  it('measures only from --since on', () => {
    const r = buildReport('sid', [lead, rows], [], 12_000);
    expect(r.agents.find((a) => a.name === 'rows')).toMatchObject({ wallMs: 18_000, calls: 1 });
    expect(r.efforts.map((e) => [e.effort, e.calls])).toEqual([['medium', 1]]);
  });
});

describe('renderMarkdown', () => {
  it('shows each section with its rows', () => {
    const md = renderMarkdown(buildReport('sid', [lead, rows], []));
    for (const heading of ['## Agents', '## Model time per call', '## Message lag', '## Review tails', '## Idle with work waiting']) expect(md).toContain(heading);
    expect(md).toContain('| rows | executor | 0.5 | 0.1 | tests 0.2 | 0.3 | 0.0 | 2 | $0.25 |');
    expect(md).toContain('1 of 1 messages delivered.');
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/server/measure/report.test.ts`
Expected: FAIL, "Failed to resolve import ./report".

- [ ] **Step 3: Write `src/server/measure/report.ts`**

```ts
import { messageLags, percentile, summarizeLags, type Lag, type LagSummary } from './lag';
import type { Interval } from './sleep';
import { attribute, type Attribution } from './sweep';
import { idleWithWork, reviewTails, type IdleWithWork, type TrackTail } from './tasks';
import type { AgentTrace, Role } from './trace';

export interface AgentRow { name: string; role: Role; firstAt: number; lastAt: number; wallMs: number; byOwner: Attribution['byOwner']; calls: number; costUsd: number }
export interface EffortRow { model: string; effort: string; calls: number; medianMs: number; p90Ms: number; meanMs: number; meanOutputTokens: number }
export interface MeasureReport {
  sessionId: string;
  since?: number;
  agents: AgentRow[];
  efforts: EffortRow[];
  lags: LagSummary;
  slowestLags: Lag[];
  tails: TrackTail[];
  idleWithWork: IdleWithWork[];
  asleepMs: number;
}

const overlaps = (a: Interval, b: Interval) => a.startAt < b.endAt && b.startAt < a.endAt;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function buildReport(sessionId: string, traces: AgentTrace[], sleeps: Interval[], since?: number): MeasureReport {
  const from = since ?? -Infinity;
  const window = since === undefined ? undefined : { startAt: since, endAt: Infinity };
  const live = traces.filter((t) => t.lastAt >= from);
  const attributions = new Map(live.map((t) => [t.name, attribute(t, sleeps, window)]));

  const agents = live.map((t) => {
    const firstAt = Math.max(t.firstAt, from);
    return {
      name: t.name,
      role: t.role,
      firstAt,
      lastAt: t.lastAt,
      wallMs: t.lastAt - firstAt,
      byOwner: attributions.get(t.name)!.byOwner,
      calls: t.calls.filter((c) => c.requestedAt >= from).length,
      costUsd: t.costUsd, // the whole transcript: usage isn't kept per call
    };
  });

  const groups = new Map<string, { model: string; effort: string; ms: number[]; out: number[] }>();
  for (const c of live.flatMap((t) => t.calls)) {
    if (c.requestedAt < from || sleeps.some((s) => overlaps(s, { startAt: c.requestedAt, endAt: c.lastAt }))) continue;
    const effort = c.effort ?? 'unknown';
    const group = groups.get(`${c.model}|${effort}`) ?? { model: c.model, effort, ms: [], out: [] };
    group.ms.push(c.lastAt - c.requestedAt);
    group.out.push(c.outputTokens);
    groups.set(`${c.model}|${effort}`, group);
  }
  const efforts = [...groups.values()]
    .map((g) => {
      const ms = [...g.ms].sort((a, b) => a - b);
      return { model: g.model, effort: g.effort, calls: ms.length, medianMs: percentile(ms, 0.5), p90Ms: percentile(ms, 0.9), meanMs: mean(ms), meanOutputTokens: mean(g.out) };
    })
    .sort((a, b) => b.calls - a.calls);

  const lags = messageLags(live).filter((l) => l.sentAt >= from);
  const span = { startAt: Math.min(...agents.map((a) => a.firstAt)), endAt: Math.max(...agents.map((a) => a.lastAt)) };
  return {
    sessionId,
    since,
    agents,
    efforts,
    lags: summarizeLags(lags),
    slowestLags: lags.filter((l) => l.lagMs !== undefined).sort((a, b) => b.lagMs! - a.lagMs!).slice(0, 5),
    tails: reviewTails(live).filter((t) => t.clearedAt >= from),
    idleWithWork: idleWithWork(live, attributions).filter((x) => x.claimedAt >= from),
    asleepMs: sleeps.reduce((sum, s) => sum + Math.max(0, Math.min(s.endAt, span.endAt) - Math.max(s.startAt, span.startAt)), 0),
  };
}

const min = (ms: number) => (ms / 60_000).toFixed(1);
const sec = (ms: number) => (ms / 1_000).toFixed(1);
const clock = (t: number) => new Date(t).toTimeString().slice(0, 5);
const NOT_TOOLS = new Set(['model', 'idle', 'gap', 'asleep']);

export function renderMarkdown(r: MeasureReport): string {
  const out = [`# team8 measure: session ${r.sessionId}`, ''];
  if (r.since !== undefined) out.push(`Since ${new Date(r.since).toISOString()}.`, '');

  out.push(
    '## Agents',
    '',
    "Minutes. Each moment has one owner: asleep, model, a tool category, idle (the turn had ended) or gap. Cost covers each agent's whole transcript.",
    '',
    '| Agent | Role | Wall | Model | Top tools | Idle | Asleep | Calls | Cost |',
    '|---|---|---|---|---|---|---|---|---|',
  );
  for (const a of r.agents) {
    const tools = Object.entries(a.byOwner)
      .filter(([owner]) => !NOT_TOOLS.has(owner))
      .sort((x, y) => (y[1] ?? 0) - (x[1] ?? 0))
      .slice(0, 3)
      .map(([owner, ms]) => `${owner} ${min(ms ?? 0)}`)
      .join(', ');
    out.push(`| ${a.name} | ${a.role} | ${min(a.wallMs)} | ${min(a.byOwner.model ?? 0)} | ${tools || '-'} | ${min(a.byOwner.idle ?? 0)} | ${min(a.byOwner.asleep ?? 0)} | ${a.calls} | $${a.costUsd.toFixed(2)} |`);
  }

  out.push('', '## Model time per call', '', '| Model | Effort | Calls | Median s | p90 s | Mean s | Mean output tokens |', '|---|---|---|---|---|---|---|');
  for (const e of r.efforts) out.push(`| ${e.model} | ${e.effort} | ${e.calls} | ${sec(e.medianMs)} | ${sec(e.p90Ms)} | ${sec(e.meanMs)} | ${Math.round(e.meanOutputTokens)} |`);

  const l = r.lags;
  out.push('', '## Message lag', '', `${l.delivered} of ${l.sent} messages delivered. Median ${min(l.medianMs)} min, p90 ${min(l.p90Ms)}, max ${min(l.maxMs)}; ${l.over5Min} over 5 min.`);
  if (r.slowestLags.length) {
    out.push('', '| From | To | Sent | Seen | Minutes |', '|---|---|---|---|---|');
    for (const x of r.slowestLags) out.push(`| ${x.from} | ${x.to} | ${clock(x.sentAt)} | ${clock(x.seenAt!)} | ${min(x.lagMs!)} |`);
  }

  out.push('', '## Review tails', '');
  if (r.tails.length) {
    out.push('| Executor | Last task done | Track clear | Minutes |', '|---|---|---|---|');
    for (const t of r.tails) out.push(`| ${t.executor} | ${clock(t.lastCompletedAt)} | ${clock(t.clearedAt)} | ${min(t.tailMs)} |`);
  } else out.push('None.');

  out.push('', '## Idle with work waiting', '');
  if (r.idleWithWork.length) {
    out.push('| Executor | Task | Idle from | Claimed | Minutes |', '|---|---|---|---|---|');
    for (const x of r.idleWithWork) out.push(`| ${x.executor} | #${x.taskId} | ${clock(x.idleFrom)} | ${clock(x.claimedAt)} | ${min(x.ms)} |`);
  } else out.push('None.');

  out.push('', `Mac asleep: ${min(r.asleepMs)} min.`);
  return out.join('\n');
}
```

Check the expected markdown row against the fixture: rows' wall is 29 s (0.5 min), model 4 s (0.1), tests 10 s (0.2), idle 15 s (0.3), asleep 0.0, 2 calls, $0.25. If the arithmetic in Step 1 disagrees with the code, fix the code. The test values are hand-computed from the fixture.

- [ ] **Step 4: Run it and see it pass**

Run: `npx vitest run src/server/measure/report.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write `src/server/measure/cli.ts` and its test** `src/server/measure/cli.test.ts`

```ts
// src/server/measure/cli.ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { findSession, loadTraces } from './load';
import { buildReport, renderMarkdown } from './report';
import { parsePmsetLog, type Interval } from './sleep';

async function macSleeps(): Promise<Interval[]> {
  if (process.platform !== 'darwin') return [];
  try {
    const { stdout } = await promisify(execFile)('pmset', ['-g', 'log'], { maxBuffer: 64 * 1024 * 1024 });
    return parsePmsetLog(stdout);
  } catch {
    return []; // No power log: report without sleep rather than fail.
  }
}

export async function runMeasure(
  opts: { claudeHome: string; sessionId: string; json: boolean; since?: string },
  out: (text: string) => void,
): Promise<number> {
  const since = opts.since === undefined ? undefined : Date.parse(opts.since);
  if (since !== undefined && Number.isNaN(since)) {
    out(`--since needs an ISO time, got "${opts.since}"`);
    return 1;
  }
  const files = await findSession(opts.claudeHome, opts.sessionId);
  if (!files) {
    out(`No transcript for session ${opts.sessionId} under ${opts.claudeHome}/projects`);
    return 1;
  }
  const report = buildReport(opts.sessionId, await loadTraces(files), await macSleeps(), since);
  out(opts.json ? JSON.stringify(report, null, 2) : renderMarkdown(report));
  return 0;
}
```

```ts
// src/server/measure/cli.test.ts
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runMeasure } from './cli';

describe('runMeasure', () => {
  it('fails with a message for an unknown session or a bad --since', async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'measure-cli-'));
    const said: string[] = [];
    expect(await runMeasure({ claudeHome: home, sessionId: 'nope', json: false }, (t) => said.push(t))).toBe(1);
    expect(await runMeasure({ claudeHome: home, sessionId: 'nope', json: false, since: 'yesterday' }, (t) => said.push(t))).toBe(1);
    expect(said).toEqual([`No transcript for session nope under ${home}/projects`, '--since needs an ISO time, got "yesterday"']);
  });
});
```

Run: `npx vitest run src/server/measure/cli.test.ts`
Expected: PASS, 1 test.

- [ ] **Step 6: Teach `src/server/index.ts` the `measure` command**

1. In `interface Cli`, widen the command and add two fields:

```ts
  command: 'run' | 'setup' | 'uninstall' | 'measure';
  /** measure: print JSON instead of markdown. */
  json: boolean;
  /** measure: only count from this ISO time on. */
  since?: string;
```

2. In `parseArgs`:
   - declare `let json = false;` and `let since: string | undefined;` next to the other `let`s;
   - change the first branch of the loop, and add these branches after the `--session` ones:

```ts
    if (arg === 'setup' || arg === 'uninstall' || arg === 'measure') command = arg;
```

```ts
    else if (arg === '--json') json = true;
    else if (arg === '--since') since = argv[++i];
    else if (arg.startsWith('--since=')) since = arg.slice('--since='.length);
    else if (command === 'measure' && !arg.startsWith('-')) session = arg; // measure <session-id>; the last one wins
```

   - add `json, since,` to the returned object.

3. In `main`, first thing after `const cli = parseArgs(argv);`:

```ts
  if (cli.command === 'measure') {
    if (!cli.session) {
      console.error('usage: measure <session-id> [--since <ISO time>] [--json]');
      return 1;
    }
    return runMeasure({ claudeHome: cli.claudeHome, sessionId: cli.session, json: cli.json, since: cli.since }, (text) => console.log(text));
  }
```

and import it at the top: `import { runMeasure } from './measure/cli';`.

4. In `src/server/index.test.ts`, inside `describe('parseArgs', …)`, add:

```ts
  it('reads measure with its session id, --json and --since', () => {
    const cli = parseArgs(['measure', 'sid1', '--json', '--since', '2026-09-30T08:00:00Z']);
    expect([cli.command, cli.session, cli.json, cli.since]).toEqual(['measure', 'sid1', true, '2026-09-30T08:00:00Z']);
    expect(parseArgs([]).json).toBe(false);
  });
```

If an existing `parseArgs` test compares the whole `Cli` object with `toEqual`, add `json: false` to its expected value; `since` is left out when undefined.

Run: `npx vitest run src/server/index.test.ts && npm run typecheck`
Expected: PASS; the typecheck exits 0.

- [ ] **Step 7: Add `plugin/commands/measure.md`**

````markdown
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
````

- [ ] **Step 8: Point the run log close in `plugin/skills/run/SKILL.md` at `measure`**

In "The Run Log at Close", replace the sentence that begins "The console has the cost" and the `curl … /stream … | jq …` block that follows it with:

````markdown
`measure` has the numbers: each agent's cost, its model and tool minutes, model seconds per call by effort, message lag, review tails and idle time with work waiting. Run it from the batch's first dispatch on:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/server/index.js" measure "${CLAUDE_SESSION_ID}" --since <ISO time of the first dispatch>
```

Put the message-lag median, the review tails and any idle-with-work rows in the Run section beside the costs.
````

Leave the rest of the section as it is: the `≈$` rule, the estimate beside the actual cost, and "what went wrong".

- [ ] **Step 9: Add the dev-only `.claude/commands/bench.md`**

```markdown
---
description: Run a team8 speed scenario and print its number (dev only; not shipped with the plugin)
argument-hint: "<scenario>"
---

# bench

Targeted before-and-after tests for the speed PRs in `docs/team8/specs/2026-09-30-team8-speed-design.md`.

- Before: run the scenario in a session on the released plugin.
- After: run it in a session started with `claude --plugin-dir <worktree>/plugin` on the PR's branch.
- Numbers come from `npx tsx src/server/index.ts measure <session-id> --since <scenario start> --json`, run from this repo.
- Record the scenario, the plugin version or the branch and commit, and the number, in the PR description and the batch's run log.

## Scenarios

None yet. Each speed PR adds its own here as a `### <name>` section: the setup, the exact prompt, what to read, and the pass mark.

If `$ARGUMENTS` names no scenario below, list the scenarios and stop.
```

- [ ] **Step 10: Check it against the delay log** (by hand; not a CI test)

Run: `npx tsx src/server/index.ts measure d4dc7fd4-0ce1-4474-8a7b-04551c0db710 > /tmp/measure-d4dc7fd4.md; npx tsx src/server/index.ts measure d4dc7fd4-0ce1-4474-8a7b-04551c0db710 --json > /tmp/measure-d4dc7fd4.json`

Compare with `~/code/meetnotes/docs/team8/runs/2026-09-29-implementation-delay-log.md`, section 3:
- **Model minutes, within 10%:** player 53, voices 50, waves 40, splash 23.
- **Why the margin:** the delay log counted from dispatch to track clear, and `measure` counts each whole transcript.
- **Message lags, within 1 min:** match every row of `~/code/meetnotes-scratch/lead/delay-scripts/delivery.csv` whose sender or recipient is one of d4dc7fd4's agents against `measure`'s lags, by from, to and sent time.
- **Idle with work waiting, within 10%:** run `npx tsx src/server/index.ts measure 6f91f486-731d-43da-afad-b4976e14a7a2` too. That is the earlier session where the `sidebar` teammate waited for "continue". Its idle-with-work row should be about 102 min, from 19:22 to 21:04 local.

Put a table of these comparisons in your report. If a number falls outside its margin, find out whether it's a bug or a difference in definition, and say which. Never tune the code to hit a number.

- [ ] **Step 11: Run the measure tests and the typecheck, then commit**

Run: `npx vitest run src/server/measure/ src/server/index.test.ts && npm run typecheck`
Expected: all pass; the typecheck exits 0.

```bash
git add src/server/measure/report.ts src/server/measure/report.test.ts src/server/measure/cli.ts src/server/measure/cli.test.ts plugin/commands/measure.md .claude/commands/bench.md
git commit -m "Add the measure command and use it for the run log's numbers" -- src/server/measure/report.ts src/server/measure/report.test.ts src/server/measure/cli.ts src/server/measure/cli.test.ts src/server/index.ts src/server/index.test.ts plugin/commands/measure.md plugin/skills/run/SKILL.md .claude/commands/bench.md
```
