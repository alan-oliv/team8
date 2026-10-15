# Session Picker, Live Only — Implementation Plan

> **For agentic workers:** this plan is executed by teammates that `team8:run` dispatches from the shared task list. Read your own task section. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The console's session picker lists only sessions whose Claude process is running, scoped by a folder menu with no `all` entry, rendered from the SSE frame instead of a fetch per open, switching in place, with a switch that never re-parses a transcript it has already parsed.

**Architecture:** The server's 3 s follower (`followRealTeam`) computes a `SessionRow[]` with a new `listLive()` and `publish()` puts it on `TeamState.sessions`; the client's `TeamSelect` renders that prop and switches every row through `POST /api/select-session/<id>` + `history.pushState`. The tail watcher's per-file byte offsets are handed from a closing ingest to the next one opened for the same target, so returning to a session pumps only appended bytes. `GET /api/teams`, the hidden-sessions feature, the idle/ended group, the search box and the `all` scope are deleted.

**Tech Stack:** TypeScript, Node 22 (`node:fs/promises`), React 18, vitest (+ jsdom and `@testing-library/react` for `src/web`), `tsc --noEmit`. No new dependencies.

**Spec:** `docs/team8/specs/2026-10-15-session-picker-live-only-design.md`

## Global Constraints

- Gate for every task: `npx vitest run` and `npx tsc --noEmit` both clean, run from `/Users/alanoliv/code/team8`.
- Alive = `sessions/<pid>.json` names a pid that answers `process.kill(pid, 0)` (or EPERM) and is not a `bg-spare` (`recycledSpares`). Busy and idle-at-prompt both count. No `IDLE_GRACE_MS` rows.
- `transcriptMeta` first read: last 256 KB (`TAIL_WINDOW = 256 * 1024`) plus the 64 KB head; later reads incremental from the remembered offset.
- One picker switch route: `POST /api/select-session/<id>`. `POST /api/teams/:name/select` stays for the launcher announce only. `GET /api/teams` is removed.
- Folder scope key in `localStorage`: `console.folder`, holding a bare absolute path.
- Row order: busy first, then title (`localeCompare`, `{ sensitivity: 'base' }`), then id.
- Commits: author voice, no AI attribution lines. Commit after every task, by path (`git add <files>`), never `git add -A`.
- Do not touch files outside your task's `Files` block; another teammate owns them.

---

## File Structure

**Track A — server (teammate `server`):**
- `src/shared/domain.ts` — `SessionRow` (new), `TeamState.sessions` (new). Old listing types stay until Task 10.
- `src/server/watch/tail.ts` + `tail.test.ts` — seedable watcher, `states()`.
- `src/server/ingest/files.ts` — `IngestConfig.tails`, `close()` returns states.
- `src/server/index.ts` + `index.test.ts` — `transcriptMeta` tail window, `walkTeams` cheap-first, `listLive`, follower, `publish`, tails per target, old listing functions deleted.
- `src/server/http.ts` + `http.test.ts`, `index.wiring.test.ts`, `session-trace.e2e.test.tsx` — `GET /api/teams` and `listTeams` removed.

**Track B — client (teammate `picker`):**
- `src/web/chrome/TeamSelect.tsx` + `TeamSelect.test.tsx` — rendered from `sessions` prop.
- `src/web/chrome/StatusBar.tsx`, `src/web/views/Workflow.tsx` — pass `sessions`.
- `src/web/test/state-fixture.ts` — `sampleSessions()`.
- `src/web/App.tsx` + `App.test.tsx`, `src/web/views/NoSessions.tsx` + test, `src/web/views/LeftSession.tsx` + test, `src/web/state/useWatch.ts`, `src/web/chrome/Splash.tsx` — frame-fed empty states, hidden sessions gone, splash-skip gone.
- Deleted: `src/web/state/useHiddenSessions.ts`, `src/web/state/useHiddenSessions.test.ts`.

Track B's first task waits on Task 1 (the types). Task 10 (track A) waits on both tracks.

---

### Task 1: `SessionRow` and `TeamState.sessions` in the domain

**Files:**
- Modify: `src/shared/domain.ts:345-400` (`TeamState`), `:408-488` (`TeamSummary` doc comment), after `:515` (new `SessionRow`)

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export interface SessionRow {
    id: string; team?: string; title: string; members: number; folder: string;
    branch?: string; busy: boolean; current: boolean; mode?: DecidedMode;
    workflow?: { runId: string; name?: string; live: boolean };
    subagents?: number; diffstat?: { added: number; removed: number };
  }
  // on TeamState:
  sessions?: SessionRow[];
  ```
  `TeamSummary`, `FolderSummary`, `ALL_FOLDERS`, `inFolder`, `TeamsResponse` are **not** removed here (Task 10 does), so both tracks keep typechecking while they migrate.

- [ ] **Step 1: Add `SessionRow` after `TeamsResponse`** (`src/shared/domain.ts`, after line 515)

```ts
/**
 * One picker row — a session whose Claude process is running right now. Built
 * by the server's `listLive` on every follower tick and carried on
 * `TeamState.sessions`, so the picker never fetches. There is no "ended" row:
 * a past session is reached by resuming it from the terminal, which makes it
 * live and therefore listed.
 */
export interface SessionRow {
  /** The session uuid — what `POST /api/select-session/<id>` and `/s/<id>` take. */
  id: string;
  /** `teams/<dir>` when this session drives a team; absent on a bare session. */
  team?: string;
  /** The sidecar name (`/branch` writes it), else the transcript's title, else `session-<8>`. */
  title: string;
  /** 1 for a bare session. */
  members: number;
  /** The absolute path the transcript last recorded working in, else the sidecar's cwd. */
  folder: string;
  branch?: string;
  /** Sidecar `status !== 'idle'` — mid-turn. */
  busy: boolean;
  /** The row for the session on screen. */
  current: boolean;
  /** See {@link TeamSummary.mode}. */
  mode?: DecidedMode;
  workflow?: { runId: string; name?: string; live: boolean };
  /** Absent, never zero. */
  subagents?: number;
  /** Uncommitted work in the tree, against HEAD. Absent on a clean tree. */
  diffstat?: { added: number; removed: number };
}
```

- [ ] **Step 2: Add `sessions` to `TeamState`** (`src/shared/domain.ts`, after the `decidedMode?: DecidedMode;` line at ~399)

```ts
  /**
   * Every live session on the machine, for the picker. Stamped on at the
   * publish boundary from the follower's last `listLive`; absent only on a
   * frame built before the first tick.
   */
  sessions?: SessionRow[];
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (additive change; nothing consumes the new fields yet).

- [ ] **Step 4: Run the suite once to prove nothing moved**

Run: `npx vitest run src/shared`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/domain.ts
git commit -m "Add SessionRow and TeamState.sessions"
```

### Task 2: Tail watcher — seedable, and exports its states

**Files:**
- Modify: `src/server/watch/tail.ts:96-173`
- Test: `src/server/watch/tail.test.ts`

**Interfaces:**
- Consumes: `TailState`, `drain` (existing, same file).
- Produces:
  ```ts
  export function watchAppendOnly(root: string, onLines: (...) => void, seed?: ReadonlyMap<string, TailState>): AppendOnlyWatcher;
  // on AppendOnlyWatcher:
  states(): Map<string, TailState>;   // a copy of the per-file states at the time of the call
  ```

- [ ] **Step 1: Write the failing tests** (`src/server/watch/tail.test.ts`, new `describe` at the end of the file; the file already has `dir`, `waitFor`, `watchAppendOnly`, `fs`, `path` in scope)

```ts
describe('watchAppendOnly seeded with another watcher’s states', () => {
  it('reads only the bytes appended after the seed', async () => {
    const file = path.join(dir, 'a.jsonl');
    await fs.writeFile(file, '{"i":1}\n{"i":2}\n');
    const first = watchAppendOnly(dir, () => {});
    await first.pump(file);
    const seed = first.states();
    first.close();
    expect(seed.get(file)?.offset).toBe(16);

    await fs.appendFile(file, '{"i":3}\n');
    const seen: { lines: string[]; fromStart: boolean }[] = [];
    const second = watchAppendOnly(dir, (_f, lines, fromStart) => seen.push({ lines, fromStart }), seed);
    try {
      await second.pump(file);
      expect(seen).toEqual([{ lines: ['{"i":3}'], fromStart: false }]);
    } finally {
      second.close();
    }
  });

  it('starts over when the file disagrees with its seed', async () => {
    const file = path.join(dir, 'a.jsonl');
    await fs.writeFile(file, '{"i":1}\n{"i":2}\n');
    const first = watchAppendOnly(dir, () => {});
    await first.pump(file);
    const seed = first.states();
    first.close();

    // Truncated below the seeded offset: a rewrite, not an append.
    await fs.writeFile(file, '{"i":9}\n');
    const seen: { lines: string[]; fromStart: boolean }[] = [];
    const second = watchAppendOnly(dir, (_f, lines, fromStart) => seen.push({ lines, fromStart }), seed);
    try {
      await second.pump(file);
      expect(seen).toEqual([{ lines: ['{"i":9}'], fromStart: true }]);
    } finally {
      second.close();
    }
  });

  it('hands out a copy, so a later pump does not move the caller’s map', async () => {
    const file = path.join(dir, 'a.jsonl');
    await fs.writeFile(file, '{"i":1}\n');
    const w = watchAppendOnly(dir, () => {});
    try {
      await w.pump(file);
      const snap = w.states();
      await fs.appendFile(file, '{"i":2}\n');
      await w.pump(file);
      expect(snap.get(file)?.offset).toBe(8);
      expect(w.states().get(file)?.offset).toBe(16);
    } finally {
      w.close();
    }
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/server/watch/tail.test.ts -t seeded`
Expected: FAIL — `first.states is not a function`.

- [ ] **Step 3: Implement** (`src/server/watch/tail.ts`)

Interface (replace the `AppendOnlyWatcher` block's `close(): void;` tail):

```ts
  forget(file: string): Promise<void>;
  /**
   * Every file's tail state, copied. A closing ingest hands this to the one
   * that replaces it for the same target, so a switch back to a session pumps
   * only what was appended since — the store already holds the events.
   */
  states(): Map<string, TailState>;
  close(): void;
}
```

Signature and body:

```ts
export function watchAppendOnly(
  root: string,
  onLines: (path: string, lines: string[], fromStart: boolean, mtimeMs?: number) => void,
  seed?: ReadonlyMap<string, TailState>,
): AppendOnlyWatcher {
  const states = new Map<string, TailState>(seed ?? []);
  // … queues, queued, closed, pump, watcher, forget unchanged …
  return {
    pump,
    forget,
    states: () => new Map(states),
    close() {
      closed = true;
      watcher.close();
    },
  };
}
```

`drain` already restarts from 0 when `st.ino !== state.inode || st.size < state.offset || st.birthtimeMs !== state.birthtimeMs`, which is what makes the second test pass with no further code.

- [ ] **Step 4: Run the file's tests**

Run: `npx vitest run src/server/watch/tail.test.ts`
Expected: PASS, 21 tests (18 + 3).

- [ ] **Step 5: Commit**

```bash
git add src/server/watch/tail.ts src/server/watch/tail.test.ts
git commit -m "Let an append-only watcher start from another's tail states"
```

### Task 3: Ingest — accepts tails, hands them back on close

**Files:**
- Modify: `src/server/ingest/files.ts:69-83` (`IngestConfig`), `:106-114` (`FileIngest`), `:1070` (`watchAppendOnly(paths.projects, …)`), `:1287-1296` (`close`)

**Interfaces:**
- Consumes: Task 2's `seed` parameter and `states()`.
- Produces:
  ```ts
  // IngestConfig
  tails?: ReadonlyMap<string, TailState>;
  // FileIngest
  close(): Map<string, TailState>;
  ```
  `TailState` re-exported from `files.ts` (`export type { TailState } from '../watch/tail'`) so `index.ts` imports one module.

- [ ] **Step 1: Write the failing test** (`src/server/ingest/files.test.ts`, a new top-level `describe` at the end; `store`, `paths`, `layout()`, `LEAD`, `fs`, `path` are already in scope — see the `pending buffer` describe near line 192 for the shape)

```ts
describe('tail states across ingests', () => {
  it('hands its tail states out on close and starts from them when given back', async () => {
    await layout();
    const projectDir = path.join(paths.projects, '-Users-dev-code-app');
    await fs.mkdir(projectDir, { recursive: true });
    const transcript = path.join(projectDir, `${LEAD}.jsonl`);
    const line = (text: string) =>
      `${JSON.stringify({ type: 'user', sessionId: LEAD, cwd: '/Users/dev/code/app', timestamp: '2026-10-15T09:00:00.000Z', message: { role: 'user', content: text } })}\n`;
    await fs.writeFile(transcript, line('one'));

    const first = startFileIngest(store, { paths, leadSessionId: LEAD, sessionOnly: true, sweepIntervalMs: 0, tailPollMs: 0 });
    await first.sweep();
    const tails = first.close();
    const after = (await fs.stat(transcript)).size;
    expect(tails.get(transcript)?.offset).toBe(after);

    await fs.appendFile(transcript, line('two'));
    const second = startFileIngest(store, { paths, leadSessionId: LEAD, sessionOnly: true, sweepIntervalMs: 0, tailPollMs: 0, tails });
    await second.sweep();
    const again = second.close();
    expect(again.get(transcript)?.offset).toBe((await fs.stat(transcript)).size);
    // The seed was honoured: the second ingest never read from byte 0.
    expect(again.get(transcript)?.inode).toBe(tails.get(transcript)?.inode);
    expect((again.get(transcript)?.offset ?? 0) - (tails.get(transcript)?.offset ?? 0)).toBe(Buffer.byteLength(line('two')));
  });

  it('returns an empty map when it never read a transcript', async () => {
    await layout();
    const ingest = startFileIngest(store, { paths, sweepIntervalMs: 0, tailPollMs: 0 });
    await ingest.sweep();
    expect(ingest.close().size).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/server/ingest/files.test.ts -t "tail states"`
Expected: FAIL — `tails.get is not a function` (`close()` returns `undefined`), and a type error on `tails` in `IngestConfig`.

- [ ] **Step 3: Implement** (`src/server/ingest/files.ts`)

Add to `IngestConfig` (after `adoptExistingTeams?: boolean;`):

```ts
  /**
   * Tail states a previous ingest for this same target handed out on close.
   * The store already holds that target's events; seeding the watcher is what
   * stops a switch back to a session from re-parsing its transcript from byte 0.
   */
  tails?: ReadonlyMap<string, TailState>;
```

Add near the top of the file, with the other imports:

```ts
import { watchAppendOnly, type TailState } from '../watch/tail';
export type { TailState };
```

(`watchAppendOnly` is already imported; add the type to that import rather than a second line.)

Change `FileIngest`:

```ts
  /** Stops the timers and watchers and hands back every tail state, for the next ingest of this target. */
  close(): Map<string, TailState>;
```

At line ~1070, pass the seed:

```ts
  const transcripts = watchAppendOnly(paths.projects, (file, lines, fromStart, mtimeMs) => {
    // … unchanged body …
  }, config.tails);
```

At the end (`return { sweep, drainAgent, close() { … } }`):

```ts
    close() {
      closed = true;
      if (timer) clearInterval(timer);
      if (poll) clearInterval(poll);
      // Taken before the watchers close: `transcripts` is one of them.
      const tails = transcripts.states();
      for (const w of watchers) w.close();
      return tails;
    },
```

- [ ] **Step 4: Typecheck and run the ingest suite**

Run: `npx tsc --noEmit && npx vitest run src/server/ingest/files.test.ts`
Expected: both clean. Every existing `ingest.close()` call site ignores the return value, so nothing else changes.

- [ ] **Step 5: Commit**

```bash
git add src/server/ingest/files.ts src/server/ingest/files.test.ts
git commit -m "Hand tail states from a closing ingest to the next one for the same target"
```

### Task 4: `transcriptMeta` reads a tail window on first sight

**Files:**
- Modify: `src/server/index.ts:356-408` (`transcriptMeta`), `:282-289` (`firstEntrypoint` stays; called on the head buffer)
- Test: `src/server/index.test.ts` (new `describe('transcriptMeta')`)

**Interfaces:**
- Consumes: nothing new.
- Produces: `export const TAIL_WINDOW = 256 * 1024; export const HEAD_WINDOW = 64 * 1024;` and `transcriptMeta` exported (currently module-private) with its existing return type `{ title?, branch?, entrypoint?, mode?, cwd?, lastCwd? }`.

- [ ] **Step 1: Write the failing tests** (`src/server/index.test.ts`, a new `describe('transcriptMeta')` after the `discoverTeam` describe; add `transcriptMeta, TAIL_WINDOW` to the `./index` import at the top)

```ts
describe('transcriptMeta', () => {
  const rec = (o: object) => `${JSON.stringify({ cwd: '/Users/x/code/app', ...o })}\n`;
  // 300 bytes of filler per record, so the window boundary lands mid-file.
  const pad = 'x'.repeat(300);

  it('reads only the tail of a large transcript on first sight, and finds a title in it', async () => {
    const file = path.join(dir, 'big.jsonl');
    let body = rec({ type: 'user', entrypoint: 'cli', message: 'first' });
    body += rec({ type: 'custom-title', customTitle: 'early-name' });
    while (Buffer.byteLength(body) < TAIL_WINDOW * 2) body += rec({ type: 'assistant', pad });
    body += rec({ type: 'custom-title', customTitle: 'late-name', gitBranch: 'feat/x' });
    await fs.writeFile(file, body);

    const meta = await transcriptMeta(file);
    expect(meta.title).toBe('late-name');
    expect(meta.branch).toBe('feat/x');
    expect(meta.entrypoint).toBe('cli');
    // `cwd` wants a record whose cwd slugs to the file's parent dir; a tmp dir
    // is no slug, so only `lastCwd` carries the path here.
    expect(meta.lastCwd).toBe('/Users/x/code/app');
  });

  it('does not see a title that only ever appeared before the tail window', async () => {
    const file = path.join(dir, 'big.jsonl');
    let body = rec({ type: 'custom-title', customTitle: 'early-name' });
    while (Buffer.byteLength(body) < TAIL_WINDOW * 2) body += rec({ type: 'assistant', pad });
    await fs.writeFile(file, body);
    expect((await transcriptMeta(file)).title).toBeUndefined();
  });

  it('reads a small transcript whole', async () => {
    const file = path.join(dir, 'small.jsonl');
    await fs.writeFile(file, rec({ type: 'custom-title', customTitle: 'tiny', entrypoint: 'cli' }));
    const meta = await transcriptMeta(file);
    expect(meta.title).toBe('tiny');
    expect(meta.entrypoint).toBe('cli');
  });

  it('reads only what was appended on a second call', async () => {
    const file = path.join(dir, 'grow.jsonl');
    await fs.writeFile(file, rec({ type: 'custom-title', customTitle: 'one' }));
    expect((await transcriptMeta(file)).title).toBe('one');
    await fs.appendFile(file, rec({ type: 'custom-title', customTitle: 'two' }));
    expect((await transcriptMeta(file)).title).toBe('two');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/server/index.test.ts -t transcriptMeta`
Expected: FAIL — `transcriptMeta`/`TAIL_WINDOW` are not exported.

- [ ] **Step 3: Implement** (`src/server/index.ts:356-408`)

Replace the `// ponytail: a transcript's first read loads it whole …` comment and the function with:

```ts
/** First read of a transcript: this much from the end, plus HEAD_WINDOW from the start. */
export const TAIL_WINDOW = 256 * 1024;
/** `entrypoint` sits on the first record, so the head is read once, separately. */
export const HEAD_WINDOW = 64 * 1024;

export async function transcriptMeta(
  file: string,
): Promise<{
  title?: string;
  branch?: string;
  entrypoint?: string;
  mode?: DecidedMode;
  cwd?: string;
  lastCwd?: string;
}> {
  let size: number;
  try {
    size = (await fs.stat(file)).size;
  } catch {
    return {};
  }
  const known = transcriptFacts.get(file);
  const first = !known || known.offset > size;
  // A first read of a big file starts TAIL_WINDOW from the end, at the next
  // record boundary; a title or branch written earlier and never rewritten is
  // not seen, and the row falls back to the sidecar name or the session id.
  let offset = first ? Math.max(0, size - TAIL_WINDOW) : known.offset;
  const facts: TranscriptFacts = first ? {} : { ...known.facts };
  if (size > offset) {
    const handle = await fs.open(file, 'r');
    try {
      if (first && offset > 0) {
        // Written on the first record, so only a read from the top can see it.
        const head = Buffer.alloc(Math.min(HEAD_WINDOW, size));
        await handle.read(head, 0, head.length, 0);
        facts.entrypoint = firstEntrypoint(head);
      }
      let read = Buffer.alloc(size - offset);
      await handle.read(read, 0, read.length, offset);
      if (first && offset > 0) {
        // Skip the partial record the window landed inside.
        const cut = read.indexOf(0x0a) + 1;
        offset += cut;
        read = read.subarray(cut);
      }
      // Whole lines only: a record being written right now is read next time.
      const whole = read.subarray(0, read.lastIndexOf(0x0a) + 1);
      facts.customTitle = lastRecordField(whole, 'custom-title', 'customTitle') ?? facts.customTitle;
      facts.aiTitle = lastRecordField(whole, 'ai-title', 'aiTitle') ?? facts.aiTitle;
      const foundBranch = lastBranch(whole);
      facts.branch = foundBranch === null ? undefined : (foundBranch ?? facts.branch);
      facts.mode = lastDecidedMode(whole) ?? facts.mode;
      const cwds = lastCwds(whole, path.basename(path.dirname(file)));
      facts.cwd = cwds.filedUnder ?? facts.cwd;
      facts.lastCwd = cwds.last ?? facts.lastCwd;
      if (first && offset === 0) facts.entrypoint = firstEntrypoint(whole);
      transcriptFacts.set(file, { offset: offset + whole.length, facts });
    } finally {
      await handle.close();
    }
  }
  return {
    title: facts.customTitle ?? facts.aiTitle,
    branch: facts.branch,
    entrypoint: facts.entrypoint,
    mode: facts.mode,
    cwd: facts.cwd,
    lastCwd: facts.lastCwd,
  };
}
```

- [ ] **Step 4: Run the file**

Run: `npx vitest run src/server/index.test.ts`
Expected: PASS — the four new tests and everything already there (the existing listing tests still call the old functions, untouched by this task).

- [ ] **Step 5: Commit**

```bash
git add src/server/index.ts src/server/index.test.ts
git commit -m "Read a transcript's tail window on first sight instead of the whole file"
```

### Task 5: `walkTeams` decides liveness first and drops dead leads before the expensive reads

**Files:**
- Modify: `src/server/index.ts:1083-1203` (`walkTeams`), `:1220-1270` (`adoptByCwd` — unchanged logic, called with the same arguments)
- Test: `src/server/index.test.ts:92-350` (`discoverTeam` describe — stays green), `:303`, `:501`, `:579` (adoption tests — stay green)

**Interfaces:**
- Consumes: `readSessions`, `teamsOfLiveSessions`, `lastActivityOf`, `workflowOf`, `subagentCountOf`, `transcriptMeta`, `branchOf` (all existing).
- Produces: `walkTeams` is exported and keeps its signature and `TeamWalk` return type. A team whose lead is live (directly, or adopted through a live session in its folder) is read in full as today, with `state` `'live'` (busy) or `'idle'` (alive at prompt) and `live === leadAlive === true`. Every other team is a **cheap record** — config.json facts only, `leadAlive: false`, `live: false`, `state: 'done'`, no inbox, transcript or tree read — kept so `teamOfSession` still matches a `/branch` ancestor's team and `discoverTeam` keeps working; `autoTeam` (filters on `live`) and Task 6's `listLive` (filters on `leadAlive`) skip it. Also produces the module-level test helpers below, which Task 6 reuses.

- [ ] **Step 1: Add shared fixture helpers to `src/server/index.test.ts`** (module level, right after the `afterEach` at line 33; `fs`, `path`, `dir` are in scope; `spawn` joins the existing `node:child_process` import at line 2)

```ts
/** A pid that answered once and never will again. */
async function deadPid(): Promise<number> {
  const child = spawn('true', [], { stdio: 'ignore' });
  await new Promise<void>((resolve) => child.once('exit', () => resolve()));
  return child.pid!;
}

/** `teams/<name>/config.json`, with every member in `cwd`. */
async function writeTeamDir(
  root: string,
  name: string,
  opts: { leadSessionId: string; members: number; cwd: string; createdAt?: number },
): Promise<void> {
  const teamDir = path.join(root, 'teams', name);
  await fs.mkdir(teamDir, { recursive: true });
  await fs.writeFile(
    path.join(teamDir, 'config.json'),
    JSON.stringify({
      name,
      createdAt: opts.createdAt ?? 1,
      leadAgentId: 'team-lead',
      leadSessionId: opts.leadSessionId,
      members: Array.from({ length: opts.members }, (_, i) => ({
        agentId: i === 0 ? 'team-lead' : `agent-${i}`,
        name: i === 0 ? 'team-lead' : `agent-${i}`,
        cwd: opts.cwd,
      })),
    }),
  );
}

/** `sessions/<pid>.json` — the file is named for the pid and carries the session id inside. */
async function writeSidecar(
  root: string,
  pid: number,
  sessionId: string,
  opts: { status?: 'busy' | 'idle'; cwd?: string; name?: string } = {},
): Promise<void> {
  await fs.mkdir(path.join(root, 'sessions'), { recursive: true });
  await fs.writeFile(path.join(root, 'sessions', `${pid}.json`), JSON.stringify({ pid, sessionId, ...opts }));
}

/** `projects/<slug(cwd)>/<sessionId>.jsonl` with one record per entry. */
async function writeTranscript(root: string, cwd: string, sessionId: string, records: object[]): Promise<string> {
  const projectDir = path.join(root, 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
  await fs.mkdir(projectDir, { recursive: true });
  const file = path.join(projectDir, `${sessionId}.jsonl`);
  await fs.writeFile(file, records.map((r) => `${JSON.stringify({ sessionId, cwd, ...r })}\n`).join(''));
  return file;
}
```

- [ ] **Step 2: Write the failing tests** (`src/server/index.test.ts`, a new `describe('walkTeams')` after the `transcriptMeta` describe from Task 4; add `walkTeams` to the `./index` import)

```ts
describe('walkTeams', () => {
  const APP = '/Users/x/code/app';
  const LIVE = 'aaaaaaaa-0000-4000-8000-000000000001';
  const DEAD = 'bbbbbbbb-0000-4000-8000-000000000002';
  const roots = () => [path.join(dir, 'teams'), path.join(dir, 'sessions'), path.join(dir, 'projects')] as const;

  it('keeps a team whose lead process is running, and drops one whose lead is gone', async () => {
    await writeTeamDir(dir, 'session-aaaaaaaa', { leadSessionId: LIVE, members: 3, cwd: APP });
    await writeTeamDir(dir, 'session-bbbbbbbb', { leadSessionId: DEAD, members: 2, cwd: '/Users/x/code/other' });
    await writeSidecar(dir, process.pid, LIVE, { status: 'busy', cwd: APP });
    await writeSidecar(dir, await deadPid(), DEAD, { status: 'busy', cwd: '/Users/x/code/other' });
    await writeTranscript(dir, APP, LIVE, [{ type: 'user', entrypoint: 'cli', gitBranch: 'main', message: 'hi' }]);
    const [teams, sessions, projects] = roots();

    const walk = await walkTeams(teams, sessions, '', projects);
    const byName = new Map(walk.teams.map((t) => [t.name, t]));
    expect(byName.get('session-aaaaaaaa')).toMatchObject({ leadAlive: true, live: true, state: 'live', members: 3, branch: 'main' });
    // Still in the walk — a `/branch` ancestor's team must stay matchable —
    // but from config.json alone: no branch, no goal, not live.
    expect(byName.get('session-bbbbbbbb')).toMatchObject({ leadAlive: false, live: false, state: 'done', members: 2 });
    expect(byName.get('session-bbbbbbbb')?.branch).toBeUndefined();
  });

  it('calls a team idle, not done, when its lead is parked at the prompt', async () => {
    await writeTeamDir(dir, 'session-aaaaaaaa', { leadSessionId: LIVE, members: 2, cwd: APP });
    await writeSidecar(dir, process.pid, LIVE, { status: 'idle', cwd: APP });
    const [teams, sessions, projects] = roots();
    const walk = await walkTeams(teams, sessions, '', projects);
    expect(walk.teams[0]?.state).toBe('idle');
    expect(walk.teams[0]?.live).toBe(true);
  });

  it('adopts a re-keyed team through the live session in its folder, and drops a leftover one', async () => {
    // Re-keyed: config.leadSessionId names a session that no longer exists, but a
    // live session runs in the same folder and the team moved recently.
    await writeTeamDir(dir, 'session-bbbbbbbb', { leadSessionId: DEAD, members: 2, cwd: APP });
    // Leftover: same folder, but nothing has touched it for a day.
    await writeTeamDir(dir, 'session-cccccccc', { leadSessionId: 'cccccccc-0000-4000-8000-000000000003', members: 2, cwd: APP });
    const old = (Date.now() - 86_400_000) / 1000;
    await fs.utimes(path.join(dir, 'teams', 'session-cccccccc', 'config.json'), old, old);
    await writeSidecar(dir, process.pid, LIVE, { status: 'busy', cwd: APP, name: 'the live one' });
    const [teams, sessions, projects] = roots();

    const walk = await walkTeams(teams, sessions, '', projects);
    const byName = new Map(walk.teams.map((t) => [t.name, t]));
    expect(byName.get('session-bbbbbbbb')).toMatchObject({ leadAlive: true, live: true, goal: 'the live one' });
    expect(byName.get('session-cccccccc')).toMatchObject({ leadAlive: false, live: false });
    expect(walk.leadSessions.get('session-bbbbbbbb')).toBe(LIVE);
    expect(walk.adopted.has(LIVE)).toBe(true);
  });

  it('returns no teams when there is no teams directory', async () => {
    const [teams, sessions, projects] = roots();
    await writeSidecar(dir, process.pid, LIVE, { status: 'busy', cwd: APP });
    const walk = await walkTeams(teams, sessions, '', projects);
    expect(walk.teams).toEqual([]);
    expect(walk.sessions.live.has(LIVE)).toBe(true);
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run src/server/index.test.ts -t walkTeams`
Expected: FAIL — `walkTeams` is not exported; once exported, the first test fails because `session-bbbbbbbb` is still listed as `done`.

- [ ] **Step 4: Implement** (`src/server/index.ts:1083-1203`) — replace the function with:

```ts
export async function walkTeams(
  teamsRoot: string,
  sessionsRoot: string,
  current: string,
  projectsRoot?: string,
): Promise<TeamWalk> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(teamsRoot);
  } catch {
    // No teams directory at all is the config-less machine, not an empty
    // picker: the session rows are the only thing it has to offer.
  }

  const sessions = await readSessions(sessionsRoot);
  // team -> the REAL session driving it, which is also the only place its name
  // ("team8", whatever `/rename` last wrote) can be read from.
  const liveTeams = projectsRoot
    ? await teamsOfLiveSessions(projectsRoot, sessions)
    : new Map<string, string>();
  // The folders live sessions started in: the one piece of folder evidence
  // adoptByCwd accepts, and the only reason to read further into a team whose
  // config names a dead lead.
  const liveCwds = new Set(
    [...sessions.live].map((id) => sessions.cwds.get(id)).filter((c): c is string => Boolean(c)),
  );
  const now = Date.now();
  const teams: TeamSummary[] = [];
  const leadCwds = new Map<string, string>();
  const leadSessions = new Map<string, string>();
  const needsDiffstat = new Map<string, string>();
  for (const name of entries) {
    const teamDir = path.join(teamsRoot, name);
    let configMtimeMs: number;
    try {
      const st = await fs.stat(path.join(teamDir, 'config.json'));
      if (!st.isFile()) continue;
      configMtimeMs = st.mtimeMs;
    } catch {
      continue;
    }
    const config = await readJsonSafe<TeamConfig>(path.join(teamDir, 'config.json'));
    if (!config || typeof config.name !== 'string' || !Array.isArray(config.members)) continue;

    const leadSessionId = typeof config.leadSessionId === 'string' ? config.leadSessionId : '';
    const leadSession = liveTeams.get(name) ?? leadSessionId;
    const leadAlive = liveTeams.has(name) || (leadSessionId !== '' && sessions.live.has(leadSessionId));
    const lead = config.members.find((m) => m.agentId === config.leadAgentId) ?? config.members[0];
    const leadCwd = lead?.cwd ?? '';
    // Decided on config.json alone. A team with no live lead and no live
    // session in its folder is recorded from its config and nothing else —
    // enough for `teamOfSession` to still match a `/branch` ancestor's team,
    // and for `autoTeam` and the picker to skip it — before its inboxes, its
    // lead's transcript or its tree are read. That was most of the walk's
    // time on a machine with a hundred finished teams.
    if (!leadAlive && !liveCwds.has(leadCwd)) {
      leadSessions.set(name, leadSession);
      teams.push({
        name,
        members: config.members.length,
        createdAt: typeof config.createdAt === 'number' ? config.createdAt : 0,
        leadSessionId,
        leadAlive: false,
        lastActivityAt: configMtimeMs,
        live: false,
        current: false,
        state: 'done',
      });
      continue;
    }

    const lastActivityAt = await lastActivityOf(teamDir, configMtimeMs);
    leadCwds.set(name, leadCwd);
    leadSessions.set(name, leadSession);
    const leadDir =
      projectsRoot && leadSession
        ? await sessionProjectDir(projectsRoot, leadSession, sessions.cwds.get(leadSession) ?? lead?.cwd)
        : null;
    const workflow = await workflowOf(leadDir, now);
    const subagents = await subagentCountOf(leadDir);
    // A folder candidate adoption passes over below keeps `done`; adoptByCwd
    // rewrites the one it takes.
    const state: TeamSummary['state'] = !leadAlive ? 'done' : sessions.busy.has(leadSession) ? 'live' : 'idle';
    needsDiffstat.set(name, leadCwd);
    const leadTranscript = leadDir ? await transcriptMeta(`${leadDir}.jsonl`) : {};
    teams.push({
      name,
      members: config.members.length,
      createdAt: typeof config.createdAt === 'number' ? config.createdAt : 0,
      leadSessionId,
      leadAlive,
      lastActivityAt,
      live: leadAlive,
      current: false,
      branch: leadTranscript.branch ?? (await branchOf(lead?.cwd)),
      goal: sessions.names.get(leadSession) ?? leadTranscript.title,
      state,
      ...(leadTranscript.lastCwd ? { folder: leadTranscript.lastCwd } : {}),
      ...(leadTranscript.mode ? { mode: leadTranscript.mode } : {}),
      ...(workflow ? { workflow } : {}),
      ...(subagents > 0 ? { subagents } : {}),
    });
  }

  const drivers = new Map(leadSessions);
  const adopted = adoptByCwd(teams, leadCwds, leadSessions, sessions, now);
  for (const t of teams) {
    t.current =
      current !== '' &&
      (t.name === current || t.leadSessionId === current || drivers.get(t.name) === current);
  }
  return { sessions, now, teams, leadSessions, drivers, needsDiffstat, adopted };
}
```

`adoptByCwd` is unchanged. In it, `best.state = 'live'` stays — a row's `busy` flag is read from `sessions.busy` in Task 6, not from `state`.

- [ ] **Step 5: Run the whole server suite**

Run: `npx vitest run src/server/index.test.ts`
Expected: the four `walkTeams` tests PASS; the `discoverTeam` and adoption tests (lines 92–350, 303, 501, 579) still PASS. The old `listTeamSummaries`/`listFolders` describes may now fail on rows they expected as `done` — that is expected and Task 6 replaces them; do **not** patch them here. If anything in `discoverTeam` fails, fix `walkTeams`, not the test.

- [ ] **Step 6: Commit**

```bash
git add src/server/index.ts src/server/index.test.ts
git commit -m "Decide a team's liveness from config.json before reading anything else"
```

### Task 6: `listLive` — one row per live session; the old listing functions go

**Files:**
- Modify: `src/server/index.ts:782-853` (`sessionRows` → trimmed), `:855-1069` (`sessionIdsIn`, `folderSessionIds`, `folderPathOf`, `listFolders`, `listAllFolders`, `listTeamSummaries` → deleted; `listLive` added)
- Test: `src/server/index.test.ts:352-1510` (`listTeamSummaries`, `the folder menu on a listing`, `listFolders` describes → replaced by `describe('listLive')`)

**Interfaces:**
- Consumes: Task 5's `walkTeams`, Task 4's `transcriptMeta`, Task 1's `SessionRow`.
- Produces:
  ```ts
  export async function listLive(
    teamsRoot: string, sessionsRoot: string, projectsRoot: string, current: string,
  ): Promise<{ rows: SessionRow[]; walk: TeamWalk }>;
  export function toSessionRow(
    team: TeamSummary, driver: string,
    facts: { busy: boolean; folder: string; diffstat?: SessionRow['diffstat'] },
  ): SessionRow;
  ```
  `rows` order is unspecified (the client sorts). `walk` is returned so the follower keeps using `targetOf`/`autoTeam` on the same read.

- [ ] **Step 1: Write the failing tests** (`src/server/index.test.ts` — **delete** the `describe('listTeamSummaries', …)` block at lines 352–1346, `describe('the folder menu on a listing', …)` at 1348–1450 and `describe('listFolders', …)` at 1451–1510, and remove `listFolders`, `listAllFolders`, `listTeamSummaries`, `ALL_FOLDERS` from the imports; add `listLive`. Add this describe where `listTeamSummaries`' was; it uses Task 5's helpers)

```ts
describe('listLive', () => {
  const APP = '/Users/x/code/app';
  const LIB = '/Users/x/code/lib';
  const A = 'aaaaaaaa-0000-4000-8000-000000000001';
  const B = 'bbbbbbbb-0000-4000-8000-000000000002';
  const roots = () => [path.join(dir, 'teams'), path.join(dir, 'sessions'), path.join(dir, 'projects')] as const;
  const user = (extra: object = {}) => ({ type: 'user', entrypoint: 'cli', gitBranch: 'main', message: 'hi', ...extra });

  it('lists a live session with its name, folder, branch and busy flag, and nothing for a dead one', async () => {
    await writeSidecar(dir, process.pid, A, { status: 'busy', cwd: APP, name: 'fixing the picker' });
    await writeSidecar(dir, await deadPid(), B, { status: 'busy', cwd: LIB });
    await writeTranscript(dir, APP, A, [user()]);
    await writeTranscript(dir, LIB, B, [user()]);
    const [teams, sessions, projects] = roots();

    const { rows } = await listLive(teams, sessions, projects, A);
    expect(rows).toEqual([
      expect.objectContaining({ id: A, title: 'fixing the picker', folder: APP, branch: 'main', busy: true, current: true, members: 1 }),
    ]);
    expect(rows[0].team).toBeUndefined();
  });

  it('files a session under the folder its transcript last worked in, not the one it started in', async () => {
    await writeSidecar(dir, process.pid, A, { status: 'idle', cwd: APP });
    await writeTranscript(dir, APP, A, [user(), { type: 'user', cwd: LIB, message: 'moved' }]);
    const [teams, sessions, projects] = roots();
    const { rows } = await listLive(teams, sessions, projects, '');
    expect(rows[0]).toMatchObject({ folder: LIB, busy: false, current: false });
  });

  it('falls back to the transcript title, then the short id, when the session was never named', async () => {
    await writeSidecar(dir, process.pid, A, { cwd: APP });
    await writeTranscript(dir, APP, A, [user(), { type: 'ai-title', aiTitle: 'Picker rewrite' }]);
    const [teams, sessions, projects] = roots();
    expect((await listLive(teams, sessions, projects, '')).rows[0].title).toBe('Picker rewrite');

    await writeTranscript(dir, APP, A, [user()]);
    expect((await listLive(teams, sessions, projects, '')).rows[0].title).toBe('session-aaaaaaaa');
  });

  it('gives a session that drives a team one team row, never a bare row beside it', async () => {
    await writeTeamDir(dir, 'session-aaaaaaaa', { leadSessionId: A, members: 3, cwd: APP });
    await writeSidecar(dir, process.pid, A, { status: 'busy', cwd: APP, name: 'the lead' });
    await writeTranscript(dir, APP, A, [user()]);
    const [teams, sessions, projects] = roots();

    const { rows } = await listLive(teams, sessions, projects, 'session-aaaaaaaa');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: A, team: 'session-aaaaaaaa', title: 'the lead', members: 3, folder: APP, busy: true, current: true });
  });

  it('skips a headless `claude -p` session', async () => {
    await writeSidecar(dir, process.pid, A, { cwd: APP });
    await writeTranscript(dir, APP, A, [user({ entrypoint: 'sdk-cli' })]);
    const [teams, sessions, projects] = roots();
    expect((await listLive(teams, sessions, projects, '')).rows).toEqual([]);
  });

  it('counts subagent transcripts onto the row, absent when none', async () => {
    await writeSidecar(dir, process.pid, A, { cwd: APP });
    await writeTranscript(dir, APP, A, [user()]);
    const sub = path.join(dir, 'projects', APP.replace(/[^a-zA-Z0-9]/g, '-'), A, 'subagents');
    await fs.mkdir(sub, { recursive: true });
    await fs.writeFile(path.join(sub, 'agent-a1111222233334444.jsonl'), '');
    const [teams, sessions, projects] = roots();
    expect((await listLive(teams, sessions, projects, '')).rows[0].subagents).toBe(1);
  });

  it('lists nothing on a machine with no sessions directory', async () => {
    const [teams, sessions, projects] = roots();
    expect((await listLive(teams, sessions, projects, '')).rows).toEqual([]);
  });
});
```

Any test from the deleted describes that covered `workflowOf` (`writeJournal`/`writeSnapshot` helpers) is re-homed into this describe as one case: a live session with `subagents/workflows/<runId>/journal.jsonl` lists `workflow: { runId, live: true }`; with `workflows/<runId>.json` beside it, `live: false` and `name` from the snapshot's `workflowName`. Copy those two helpers (lines 391–407 and the `writeSnapshot` just below 430) up to module level with the Task 5 helpers.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/server/index.test.ts -t listLive`
Expected: FAIL — `listLive` is not exported.

- [ ] **Step 3: Implement** (`src/server/index.ts`)

Delete `sessionRows` (782–853), `sessionIdsIn`, `folderSessionIds`, `folderPathOf`, `listFolders`, `listAllFolders`, `listTeamSummaries` (855–1069), and the `ALL_FOLDERS`, `FolderSummary`, `TeamsResponse` names from the `../shared/domain` import; add `SessionRow`. In their place:

```ts
/** A team's row, named by the session actually driving it. */
export function toSessionRow(
  team: TeamSummary,
  driver: string,
  facts: { busy: boolean; folder: string; diffstat?: SessionRow['diffstat'] },
): SessionRow {
  return {
    id: driver || team.leadSessionId,
    team: team.name,
    title: team.goal ?? team.name,
    members: team.members,
    folder: facts.folder,
    busy: facts.busy,
    current: team.current,
    ...(team.branch ? { branch: team.branch } : {}),
    ...(team.mode ? { mode: team.mode } : {}),
    ...(team.workflow ? { workflow: team.workflow } : {}),
    ...(team.subagents ? { subagents: team.subagents } : {}),
    ...(facts.diffstat ? { diffstat: facts.diffstat } : {}),
  };
}

/**
 * The picker's rows: one per session whose process is running, right now.
 * Computed by the follower every tick and carried on the frame, so the cost
 * here is paid continuously — which is why it is O(live sessions) and nothing
 * on disk is enumerated. A past session is reached by resuming it from the
 * terminal, which makes it live and therefore listed.
 */
export async function listLive(
  teamsRoot: string,
  sessionsRoot: string,
  projectsRoot: string,
  current: string,
): Promise<{ rows: SessionRow[]; walk: TeamWalk }> {
  const walk = await walkTeams(teamsRoot, sessionsRoot, current, projectsRoot);
  const { sessions, now, leadSessions, adopted } = walk;
  // One git invocation per DIRECTORY, not per row.
  const diffstats = new Map<string, SessionRow['diffstat']>();
  const diffstatOfCached = async (folder: string) => {
    if (!diffstats.has(folder)) diffstats.set(folder, await diffstatOf(folder));
    return diffstats.get(folder);
  };
  const rows: SessionRow[] = [];

  for (const team of walk.teams) {
    // Cheap records (Task 5) are for discovery, not for the picker.
    if (!team.leadAlive) continue;
    const driver = leadSessions.get(team.name) ?? team.leadSessionId;
    const folder = team.folder ?? sessions.cwds.get(driver) ?? walk.needsDiffstat.get(team.name) ?? '';
    rows.push(
      toSessionRow(team, driver, {
        busy: sessions.busy.has(driver),
        folder,
        diffstat: folder ? await diffstatOfCached(folder) : undefined,
      }),
    );
  }

  // A session represented by a team row must not also appear as a bare one.
  const covered = new Set([
    ...walk.teams.map((t) => t.leadSessionId),
    ...walk.teams.flatMap((t) => leadSessions.get(t.name) ?? []),
    ...adopted,
  ]);
  for (const sessionId of sessions.live) {
    if (covered.has(sessionId)) continue;
    const cwd = sessions.cwds.get(sessionId);
    const dir = await sessionProjectDir(projectsRoot, sessionId, cwd);
    if (!dir) continue;
    const transcript = await transcriptMeta(`${dir}.jsonl`);
    // `claude -p` and SDK runs (the console's own briefs, headless reviewers)
    // are not sessions anyone switches to; /resume leaves them out too.
    if (transcript.entrypoint === 'sdk-cli') continue;
    const folder = transcript.lastCwd ?? cwd;
    if (!folder) continue;
    const workflow = await workflowOf(dir, now);
    const subagents = await subagentCountOf(dir);
    const diffstat = await diffstatOfCached(folder);
    const branch = transcript.branch ?? (await branchOf(folder));
    rows.push({
      id: sessionId,
      title: sessions.names.get(sessionId) ?? transcript.title ?? `session-${sessionId.slice(0, 8)}`,
      members: 1,
      folder,
      busy: sessions.busy.has(sessionId),
      current: sessionId === current,
      ...(branch ? { branch } : {}),
      ...(transcript.mode ? { mode: transcript.mode } : {}),
      ...(workflow ? { workflow } : {}),
      ...(subagents > 0 ? { subagents } : {}),
      ...(diffstat ? { diffstat } : {}),
    });
  }
  return { rows, walk };
}
```

`walkTeams` already sets `current` on team rows by directory name, config lead id or driver, so `toSessionRow` copies it. `IDLE_GRACE_MS` stays exported (`workflowOf` and `adoptByCwd` use it).

- [ ] **Step 4: Typecheck and run the server suite**

Run: `npx tsc --noEmit && npx vitest run src/server/index.test.ts`
Expected: `tsc` names `index.ts`'s own `listTeams` wiring at ~1675 (it still calls the deleted `listAllFolders`/`listTeamSummaries`). Replace that dep **temporarily** with `listTeams: undefined` so the file compiles — Task 7 removes the dep for good — and re-run. Then both clean; the `listLive`, `walkTeams`, `transcriptMeta`, `discoverTeam` describes all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/index.ts src/server/index.test.ts
git commit -m "List live sessions only; drop the per-folder transcript enumeration"
```

### Task 7: Wire the server — follower fills the frame, tails travel per target, `/api/teams` gone

**Files:**
- Modify: `src/server/index.ts:1393-1425` (`publish`), `:1450-1479` (`startIngest`), `:1510-1531` (`retarget`), `:1585-1600` (`retargetSession`), `:1675-1678` (`listTeams` dep → removed), `:1716-1771` (`followRealTeam`)
- Modify: `src/server/http.ts:110-120` (`listTeams` dep), `:294-300` (`GET /api/teams` branch)
- Test: `src/server/http.test.ts:51`, `:112`, `:588-605`, `:766`; `src/server/index.wiring.test.ts:556-590`, `:899`; `src/server/session-trace.e2e.test.tsx:10`, `:220`

**Interfaces:**
- Consumes: Task 6's `listLive`, Task 3's `tails`/`close()`, Task 1's `TeamState.sessions`.
- Produces: every SSE frame carries `sessions: SessionRow[]`; `GET /api/teams` → 404; `POST /api/select-session/<id>` unchanged in contract; a second switch to a target pumps zero transcript bytes.

- [ ] **Step 1: Rewrite the listing tests in `src/server/index.wiring.test.ts`**

Change the import at line 10 to `import type { SessionRow, TeamState } from '../shared/domain';`. Add after `snapshot()` (~line 200):

```ts
/** The frame's rows, once the follower's first tick has put them there. */
async function sessionsOf(url: string, timeoutMs = FOLLOW_INTERVAL_MS * 3): Promise<SessionRow[]> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const s = await snapshot(url);
    if (s.sessions) return s.sessions;
    if (Date.now() > deadline) throw new Error('the frame never carried sessions');
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** Two live sidecars: this process and its parent are the two pids that are certainly running. */
async function writeLiveSidecars(home: string, cwd: string): Promise<void> {
  await fs.mkdir(path.join(home, 'sessions'), { recursive: true });
  await fs.writeFile(path.join(home, 'sessions', `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: LEAD_SESSION, status: 'busy', cwd }));
  await fs.writeFile(path.join(home, 'sessions', `${process.ppid}.json`), JSON.stringify({ pid: process.ppid, sessionId: LEAD_SESSION_B, status: 'idle', cwd }));
}
```

Replace the test `lists every team in this folder, and moves the current flag on a switch` (lines 556–575) with:

```ts
  it(
    'carries the live rows on the frame, and moves the current flag on a switch',
    async () => {
      home = await layout();
      await writeLiveSidecars(home, process.cwd());
      const url = await boot(home);

      const rows = await sessionsOf(url);
      // TEAM_C has no running lead, so it is not a row — the picker is live sessions only.
      expect(rows.map((r) => r.team).sort()).toEqual([TEAM, TEAM_B].sort());
      const byTeam = new Map(rows.map((r) => [r.team, r]));
      expect(byTeam.get(TEAM)).toMatchObject({ id: LEAD_SESSION, members: 4, busy: true, current: true });
      expect(byTeam.get(TEAM_B)).toMatchObject({ id: LEAD_SESSION_B, members: 2, busy: false, current: false });

      expect((await selectTeam(url, TEAM_B)).status).toBe(200);
      const moved = await (async () => {
        const deadline = Date.now() + FOLLOW_INTERVAL_MS * 3;
        for (;;) {
          const again = await sessionsOf(url);
          if (again.find((r) => r.current)?.team === TEAM_B) return again;
          if (Date.now() > deadline) throw new Error('current never moved');
          await new Promise((r) => setTimeout(r, 100));
        }
      })();
      expect(moved.filter((r) => r.current).map((r) => r.team)).toEqual([TEAM_B]);
    },
    20_000,
  );

  it(
    'switching back to a session re-reads none of its transcript',
    async () => {
      home = await layout();
      await writeLiveSidecars(home, process.cwd());
      const url = await boot(home);
      await sessionsOf(url);
      const log = path.join(home, 'team8', 'logs', `${TEAM}.jsonl`);
      const transcriptEvents = async () =>
        ((await fs.readFile(log, 'utf8')).match(/"kind":"transcript"/g) ?? []).length;
      const before = await transcriptEvents();
      expect(before).toBeGreaterThan(0);

      expect((await selectTeam(url, TEAM_B)).status).toBe(200);
      expect((await selectTeam(url, TEAM)).status).toBe(200);
      await new Promise((r) => setTimeout(r, TAIL_POLL_MS + 200));
      // The return seeded the new ingest with the old one's tail states, so
      // nothing was appended to a log that already held every line.
      expect(await transcriptEvents()).toBe(before);
    },
    20_000,
  );
```

If `before` is 0 on this fixture, the fixture has no transcript under `TEAM`: write one record to `projects/<SLUG>/<LEAD_SESSION>/subagents/agent-<SPAWN_ID>.jsonl` (the path the existing `agentOfTranscript` test names) before `boot`, in the shape the `hooks` tests use for that agent.

Delete the test `answers a folder the browser names with the console's own listing, never reading the named path` (lines 578–590) — there is no folder parameter any more. Replace lines 899–900 (`const listing = …; expect(listing.teams…)`) with:

```ts
    // Nothing in this fixture is running, so the picker has no rows; the team
    // shows on the frame's own fields, which `teamOf` above already checked.
    expect(await sessionsOf(url)).toEqual([]);
```

- [ ] **Step 2: Rewrite `src/server/http.test.ts`**

Remove `TeamsResponse` from the import at line 22; delete `let listed: TeamsResponse;` (line 51) and every assignment to it, `listFolderCalls`, and the `listTeams` dep (lines 112–115). Delete the tests `lists the teams the console can switch to` and `hands the requested folder to the listing` (lines 585–607). In `still lists and still switches — a switch changes what is watched, not ~/.claude` (line 763), delete the three `list` lines (766–768) and rename it `still switches — a switch changes what is watched, not ~/.claude`. Add, in the `the team selector` describe:

```ts
  it('no longer serves a listing — the frame carries it', async () => {
    const { server, url } = await boot(false);
    try {
      expect((await fetch(`${url}/api/teams`)).status).toBe(404);
    } finally {
      await shutdown(server);
    }
  });
```

- [ ] **Step 3: Rewrite the e2e's first step** (`src/server/session-trace.e2e.test.tsx`)

Line 10: `import type { SessionRow, TeamState } from '../shared/domain';`. In `soloHome()`, make the session live: write `sessions/<process.pid>.json` as `{ pid: process.pid, sessionId: SESSION, status: 'busy', cwd: <the cwd soloHome slugs the transcript under> }` if it does not already. Replace lines 219–224 with:

```ts
  // 1. discoverable: the frame's rows offer it, as a bare session.
  const row = await until('the session to appear on the frame', async () =>
    (await snapshot(url)).sessions?.find((r: SessionRow) => r.id === SESSION),
  );
  expect(row.team).toBeUndefined();
  expect(row.subagents).toBe(2);
```

- [ ] **Step 4: Run the three suites to see them fail**

Run: `npx vitest run src/server/index.wiring.test.ts src/server/http.test.ts src/server/session-trace.e2e.test.tsx`
Expected: FAIL — no `sessions` on the frame, `/api/teams` still 200.

- [ ] **Step 5: Implement the server** (`src/server/index.ts`)

Imports: add `SessionRow` to the `../shared/domain` import; add `type TailState` to the `./ingest/files` import.

After `let currentSession = …` (line ~1448):

```ts
  // The picker's rows, as of the follower's last tick, and their JSON so a
  // tick that changed nothing publishes nothing. Not `sessions`: several
  // closures below bind that name to `readSessions()`.
  let liveRows: SessionRow[] | undefined;
  let liveRowsJson = '';
  // Tail states per target, handed from the ingest that served a target to
  // the next one opened for it: the store keeps the events, this keeps the
  // offsets, and a switch back then pumps only what was appended since.
  const tailsByTarget = new Map<string, Map<string, TailState>>();
```

`startIngest` takes the seed:

```ts
  const startIngest = (gen: number, team: string | undefined, lead: string | undefined, tails?: Map<string, TailState>) =>
    startFileIngest(fencedSink(live, gen, () => generation), {
      paths: { /* unchanged */ },
      teamName: team,
      leadSessionId: lead,
      sessionOnly: team === undefined && lead !== undefined,
      adoptExistingTeams: false,
      tails,
      onTeam: (info) => { /* unchanged */ },
      onLeadSession: (id) => { /* unchanged */ },
    });
```

In `retarget`, replace `ingest.close();` and `ingest = startIngest(gen, team, lead);` with:

```ts
    tailsByTarget.set(currentTeam || currentSession, ingest.close());
    …
    ingest = startIngest(gen, team, lead, tailsByTarget.get(team));
```

In `retargetSession`, the same with the session id as the key on both sides:

```ts
    tailsByTarget.set(currentTeam || currentSession, ingest.close());
    …
    ingest = startIngest(gen, undefined, sessionId, tailsByTarget.get(sessionId));
```

In `publish()`, add after `decidedMode: leadFacts.mode,`:

```ts
      ...(liveRows ? { sessions: liveRows } : {}),
```

Delete the `listTeams:` dep from the `createHttpHandler({ … })` call (and the temporary `listTeams: undefined` Task 6 left). In `followRealTeam`, replace from `const walk = await walkTeams(…)` through `leadFacts = facts;` with:

```ts
    const { rows, walk } = await listLive(teamsRoot, sessionsRoot, projectsRoot, currentTeam || currentSession);
    // `claude plugin update` can land a newer build while this one serves.
    build = withInstalled(build, await installedVersion(cli.claudeHome));

    // The listing resolved these off disk for every live row, so the current
    // one's cost nothing; a session picked from another folder is a row too
    // now, so the transcript fallback is only for a target that is not live.
    const mine = rows.find((r) => r.current);
    const facts = mine
      ? { sessionName: mine.title, branch: mine.branch, mode: mine.mode }
      : await leadFactsOf(currentTeam ? leadSessionId : currentSession);
    if (gen !== generation) return;
    leadFacts = facts;
    const json = JSON.stringify(rows);
    if (json !== liveRowsJson) {
      liveRows = rows;
      liveRowsJson = json;
      hub.publish();
    }
```

`projectsRoot` is the `path.join(cli.claudeHome, 'projects')` already in scope for the old `listTeams` wiring. `targetOf(walk)` below is unchanged.

In `src/server/http.ts`: remove `TeamsResponse` from line 9's import, the `listTeams?` dep and its doc comment (lines 114–119), and the `GET /api/teams` branch (lines 294–300) — a `GET /api/teams` now falls through to the existing `/api/` 404.

- [ ] **Step 6: Typecheck and run the three suites, then everything server-side**

Run: `npx tsc --noEmit && npx vitest run src/server`
Expected: clean. `http.security.test.ts` (lines 301–309 use `/api/teams/:name/select`, which stays) is untouched.

- [ ] **Step 7: Commit**

```bash
git add src/server/index.ts src/server/http.ts src/server/index.wiring.test.ts src/server/http.test.ts src/server/session-trace.e2e.test.tsx
git commit -m "Carry the live sessions on the frame and keep tail states across switches"
```

### Task 8: `TeamSelect` renders the frame

**Files:**
- Modify: `src/web/chrome/TeamSelect.tsx` (whole file), `src/web/chrome/StatusBar.tsx:174-182`, `src/web/views/Workflow.tsx:99-107`
- Modify: `src/web/test/state-fixture.ts:170-205` (`sampleTeams` → `sampleSessions`, and `sampleTeamState().sessions`)
- Test: `src/web/chrome/TeamSelect.test.tsx` (rewritten)

**Interfaces:**
- Consumes: Task 1's `SessionRow`, `TeamState.sessions`.
- Produces:
  ```ts
  export interface TeamSelectProps {
    current: string; sessionName?: string; mode?: string; open: boolean;
    onOpenChange(open: boolean): void; now: number; switching?: boolean;
    sessions: SessionRow[];                      // new, from state.sessions ?? []
  }
  export function foldersOf(rows: SessionRow[]): { path: string; name: string; live: number }[];
  export function scopeOf(rows: SessionRow[], stored: string | null): string | null; // the folder in scope, null = every row
  export function readStoredFolder(): string | null;
  export function byRow(a: SessionRow, b: SessionRow): number;   // busy first, title, id
  ```
  `scopedRows`, `readStoredFolders`, `KIND_STYLE`, `kindOf`, `byDisplayName` exports: `KIND_STYLE`/`kindOf` kept (StatusBar's badge reads them; `kindOf` now takes a `SessionRow`); the other three removed with their callers in this task and Task 9.

- [ ] **Step 1: Replace the fixture** (`src/web/test/state-fixture.ts:170-205`) — delete `sampleTeams` and its doc comment; add:

```ts
/**
 * `TeamState.sessions` for a machine with three live sessions: the fixture
 * team (current), a bare idle session in the same folder, and a busy one in
 * another — the shapes the picker is designed against.
 */
export function sampleSessions(): SessionRow[] {
  return [
    {
      id: config.leadSessionId,
      team: config.name,
      title: 'agents-team-console-design',
      members: config.members.length,
      folder: '/Users/dev/code/octo',
      branch: 'fix/engine-latency-and-frame-size',
      busy: true,
      current: true,
    },
    {
      id: 'b5129c7b-a009-4de3-9a42-4664d1214f39',
      title: 'session-b5129c7b',
      members: 1,
      folder: '/Users/dev/code/octo',
      branch: 'main',
      busy: false,
      current: false,
    },
    {
      id: 'c1a2b3c4-0000-4000-8000-000000000003',
      title: 'hatch api',
      members: 1,
      folder: '/Users/dev/code/hatch',
      busy: true,
      current: false,
      subagents: 2,
    },
  ];
}
```

Import `SessionRow` instead of `TeamSummary` at the top, and in `sampleTeamState()` add `sessions: sampleSessions(),` to the returned object.

- [ ] **Step 2: Write the new tests** — replace `src/web/chrome/TeamSelect.test.tsx` whole. Keep lines 1–14 (environment, imports, `afterEach(cleanup)`), change the fixture import to `sampleSessions`, drop the `TeamSummary` type import for `SessionRow`, and continue:

```ts
const SESSIONS = sampleSessions();
const B5 = 'b5129c7b-a009-4de3-9a42-4664d1214f39';
const C1 = 'c1a2b3c4-0000-4000-8000-000000000003';
const SELECT = (id: string) => [
  `/api/select-session/${id}`,
  { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
];

let fetchMock: ReturnType<typeof vi.fn>;
let pushState: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchMock = vi.fn(() => Promise.resolve(new Response('{}', { status: 200 })));
  vi.stubGlobal('fetch', fetchMock);
  pushState = vi.spyOn(window.history, 'pushState');
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

function renderSelect(props: Partial<TeamSelectProps> = {}, watch: Partial<WatchState> = {}) {
  const onOpenChange = vi.fn();
  const all: TeamSelectProps = {
    current: 'session-98b0b4a7', open: true, onOpenChange, now: FIXTURE_NOW, sessions: SESSIONS, ...props,
  };
  const watchValue: WatchState = { dismissed: false, requestStopWatching: vi.fn(), watchAgain: vi.fn(), ...watch };
  function Harness({ extra }: { extra: Partial<TeamSelectProps> }) {
    return (
      <WatchContext.Provider value={watchValue}>
        <TeamSelect {...all} {...extra} />
      </WatchContext.Provider>
    );
  }
  const view = render(<Harness extra={{}} />);
  const rerender = (next: Partial<TeamSelectProps> = {}) => view.rerender(<Harness extra={next} />);
  return { onOpenChange, rerender, watch: watchValue };
}

it('never fetches: the rows come from the frame', () => {
  renderSelect();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(screen.getAllByRole('option')).toHaveLength(2); // the two rows in the current row's folder
});

it('scopes to the folder of the session on screen by default, and names it on the chip', () => {
  renderSelect();
  expect(screen.getByTestId('folder-chip')).toHaveTextContent('octo');
  const titles = screen.getAllByTestId('team-title').map((el) => el.textContent);
  expect(titles).toEqual(['agents-team-console-design', 'session-b5129c7b']);
});

it('sorts busy rows first, then by title', () => {
  const rows = [
    { ...SESSIONS[1], title: 'alpha', busy: false },
    { ...SESSIONS[0], title: 'zulu', busy: true, current: false },
    { ...SESSIONS[2], folder: '/Users/dev/code/octo', title: 'bravo', busy: true },
  ];
  renderSelect({ sessions: rows, current: '' });
  expect(screen.getAllByTestId('team-title').map((el) => el.textContent)).toEqual(['bravo', 'zulu', 'alpha']);
});

it('lists only folders with a live session, with their counts, and no `all`', () => {
  renderSelect();
  fireEvent.click(screen.getByTestId('folder-chip'));
  const menu = screen.getByTestId('folder-menu');
  const options = within(menu).getAllByRole('option').map((el) => el.textContent);
  expect(options).toHaveLength(2);
  expect(options[0]).toContain('octo');
  expect(options[0]).toContain('2 live');
  expect(options[1]).toContain('hatch');
  expect(options[1]).toContain('1 live');
  expect(within(menu).queryByText('all')).toBeNull();
});

it('switches folder on a pick, remembers it, and ignores a remembered folder with nothing live', () => {
  const first = renderSelect();
  fireEvent.click(screen.getByTestId('folder-chip'));
  fireEvent.click(within(screen.getByTestId('folder-menu')).getAllByRole('option')[1]);
  expect(screen.getAllByTestId('team-title').map((el) => el.textContent)).toEqual(['hatch api']);
  expect(localStorage.getItem('console.folder')).toBe('/Users/dev/code/hatch');
  cleanup();

  // Nothing lives in hatch any more: the default scope applies.
  renderSelect({ sessions: SESSIONS.filter((r) => r.folder !== '/Users/dev/code/hatch') });
  expect(screen.getByTestId('folder-chip')).toHaveTextContent('octo');
});

it('switches any row through select-session and rewrites the URL on 200', async () => {
  renderSelect();
  fireEvent.click(screen.getByText('session-b5129c7b'));
  expect(fetchMock).toHaveBeenCalledWith(...SELECT(B5));
  expect(screen.getByTestId('team-mark')).toHaveTextContent('switching…');
  await vi.waitFor(() => expect(pushState).toHaveBeenCalledWith(null, '', `/s/${B5}`));
});

it('closes once the frame names the target: the session id for a bare row, the directory for a team', () => {
  const { onOpenChange, rerender } = renderSelect();
  fireEvent.click(screen.getByText('session-b5129c7b'));
  expect(onOpenChange).not.toHaveBeenCalled();
  rerender({ current: B5 });
  expect(onOpenChange).toHaveBeenCalledWith(false);

  cleanup();
  const team = renderSelect({
    current: B5,
    sessions: [{ ...SESSIONS[0], current: false }, { ...SESSIONS[1], current: true }],
  });
  fireEvent.click(screen.getByText('agents-team-console-design'));
  expect(team.onOpenChange).not.toHaveBeenCalled();
  team.rerender({ current: 'session-98b0b4a7' });
  expect(team.onOpenChange).toHaveBeenCalledWith(false);
});

it('marks a row gone on 404 and failed on any other error, and does not touch the URL', async () => {
  fetchMock.mockImplementationOnce(() => Promise.resolve(new Response('{}', { status: 404 })));
  renderSelect();
  fireEvent.click(screen.getByText('session-b5129c7b'));
  expect(await screen.findByText('gone')).toBeTruthy();
  expect(pushState).not.toHaveBeenCalled();
});

it('re-selecting the current session resumes watching and closes', () => {
  const watchAgain = vi.fn();
  const { onOpenChange } = renderSelect({}, { dismissed: true, watchAgain });
  fireEvent.click(screen.getByText('agents-team-console-design'));
  expect(watchAgain).toHaveBeenCalled();
  expect(onOpenChange).toHaveBeenCalledWith(false);
  expect(fetchMock).not.toHaveBeenCalled();
});

it('walks the rows with the arrow keys, opens on Enter and a new tab on ⌘Enter', () => {
  const open = vi.spyOn(window, 'open').mockImplementation(() => null);
  renderSelect();
  const list = screen.getByTestId('team-list');
  fireEvent.keyDown(list, { key: 'ArrowDown' });
  fireEvent.keyDown(list, { key: 'Enter', metaKey: true });
  expect(open).toHaveBeenCalledWith(`/s/${B5}`, '_blank');
  fireEvent.keyDown(list, { key: 'Enter' });
  expect(fetchMock).toHaveBeenCalledWith(...SELECT(B5));
});

it('reads working / at prompt / N subagents in the state cell, with a live glyph for busy rows', () => {
  renderSelect({ sessions: SESSIONS.map((r) => ({ ...r, folder: '/Users/dev/code/octo' })) });
  const metas = screen.getAllByTestId('team-meta').map((el) => el.textContent);
  expect(metas[0]).toContain('working');
  expect(metas.some((m) => m?.includes('at prompt'))).toBe(true);
  expect(metas.some((m) => m?.includes('2 subagents'))).toBe(true);
});

it('says what to do when nothing is live anywhere', () => {
  renderSelect({ sessions: [], current: '' });
  expect(screen.getByText(/resume a session from your terminal/)).toBeTruthy();
  expect(screen.getByTestId('session-count')).toHaveTextContent('0 live');
});

it('⌘K opens the picker and, when it is open, focuses the list', () => {
  const { onOpenChange } = renderSelect({ open: false });
  fireEvent.keyDown(window, { key: 'k', metaKey: true });
  expect(onOpenChange).toHaveBeenCalledWith(true);
});

it('shows the footer’s live-across-folders line for the scope', () => {
  renderSelect();
  expect(screen.getByTestId('folder-note')).toHaveTextContent('2 live across 1 folder');
});
```

Export `TeamSelectProps` from `TeamSelect.tsx` (it already is). Any assertion above on a `data-testid` names one that exists today (`folder-chip`, `folder-menu`, `team-title`, `team-mark`, `team-meta`, `team-list`, `session-count`, `folder-note`); keep those ids.

- [ ] **Step 3: Run to see them fail**

Run: `npx vitest run src/web/chrome/TeamSelect.test.tsx`
Expected: FAIL — `sessions` is not a prop; the component still fetches.

- [ ] **Step 4: Rewrite the component** (`src/web/chrome/TeamSelect.tsx`)

Delete: the `TeamsResponse`/`FolderSummary`/`ALL_FOLDERS`/`inFolder` imports, `readStoredFolders`, `storeFolders`, `homeFolder`, `scopedRows`, `isRunning`, `STATE_GLYPH`/`STATE_COLOR`, `stateText`, `Bucket`/`bucketOf`, `rowId`, `displayName`, `byDisplayName`, `byActivity`, `matchesQuery`, the `useEffect` that fetches on open, the `teams`/`loading`/`unreadable`/`query`/`folders`/`hiddenOpen` state and the `search` ref, and `skipNextSplash`'s import. Keep `TRIGGER_WIDTH`, `PANEL_WIDTH`, `FOLDER_MENU_WIDTH`, `FOLDER_MENU_LEFT`, `FOLDER_KEY`, `folderBase`, `KIND_STYLE`, `Mark`/`MARK_TEXT`/`MARK_COLOR`, `SESSION_UUID`, `triggerName`, `agentCount`.

Data layer (module level):

```ts
import type { SessionRow } from '../../shared/domain';

/** The folder a pick stored — a bare absolute path, else nothing. */
export function readStoredFolder(): string | null {
  try {
    const raw = window.localStorage.getItem(FOLDER_KEY);
    return raw && raw.startsWith('/') ? raw : null;
  } catch {
    return null;
  }
}

function storeFolder(folder: string): void {
  try {
    window.localStorage.setItem(FOLDER_KEY, folder);
  } catch {
    // A full or disabled store costs the operator the preference on the next open.
  }
}

/** Every folder with a live session in it, most rows first, then by name. */
export function foldersOf(rows: readonly SessionRow[]): { path: string; name: string; live: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.folder, (counts.get(r.folder) ?? 0) + 1);
  return [...counts]
    .map(([path, live]) => ({ path, name: folderBase(path), live }))
    .sort((a, b) => b.live - a.live || a.name.localeCompare(b.name));
}

/**
 * The folder in scope: the stored pick while something lives there, else the
 * folder of the row on screen — the one default under which that row is
 * always listed — else every row.
 */
export function scopeOf(rows: readonly SessionRow[], stored: string | null): string | null {
  if (stored && rows.some((r) => r.folder === stored)) return stored;
  return rows.find((r) => r.current)?.folder ?? null;
}

/** Busy first, then title, then id — the list's one order. */
export function byRow(a: SessionRow, b: SessionRow): number {
  return (
    Number(b.busy) - Number(a.busy) ||
    a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/** What KIND a row is, by the same bar the console classifies on. */
export function kindOf(row: SessionRow): string {
  if (row.mode) return row.mode;
  if (row.members >= 2) return 'teammates';
  if (row.workflow) return 'workflow';
  return row.subagents ? 'subagents' : 'solo';
}

type Mark =
  | { kind: 'switching'; id: string; team?: string }
  | { kind: 'failed'; id: string }
  | { kind: 'gone'; id: string };
```

Props and state:

```ts
export interface TeamSelectProps {
  current: string;
  sessionName?: string;
  mode?: string;
  open: boolean;
  onOpenChange(open: boolean): void;
  now: number;
  switching?: boolean;
  /** `state.sessions ?? []` — every live session, from the frame. */
  sessions: SessionRow[];
}

export function TeamSelect({ current, sessionName, mode, open, onOpenChange, now, switching, sessions }: TeamSelectProps) {
  const watch = useWatch();
  const [cursor, setCursor] = useState(0);
  const [mark, setMark] = useState<Mark | null>(null);
  const [picked, setPicked] = useState(readStoredFolder);
  const [foldersOpen, setFoldersOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const wrapper = useRef<HTMLDivElement>(null);

  const folders = foldersOf(sessions);
  const scope = scopeOf(sessions, picked);
  const rows = sessions.filter((r) => scope === null || r.folder === scope).sort(byRow);
  const cursorRow = rows[Math.min(cursor, rows.length - 1)];

  // The cursor lands on the row on screen each time the panel opens.
  useEffect(() => {
    if (open) {
      setCursor(Math.max(0, rows.findIndex((r) => r.current)));
      list.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close() {
    setMark(null);
    setFoldersOpen(false);
    onOpenChange(false);
    trigger.current?.focus();
  }

  // The 200 is an ack, not a repaint: the switch has landed when the frame
  // names the target — its session id for a bare session, its directory for
  // a team.
  useEffect(() => {
    if (mark?.kind === 'switching' && (current === mark.id || (mark.team !== undefined && current === mark.team))) close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, mark]);

  function select(row: SessionRow) {
    if (mark?.kind === 'switching') return;
    if (row.current) {
      // Reselecting the session you dismissed is how you resume watching it.
      if (watch.dismissed) watch.watchAgain();
      close();
      return;
    }
    setMark({ kind: 'switching', id: row.id, ...(row.team ? { team: row.team } : {}) });
    postJson(`/api/select-session/${encodeURIComponent(row.id)}`)
      .then((res) => {
        if (!res.ok) {
          setMark({ kind: res.status === 404 ? 'gone' : 'failed', id: row.id });
          return;
        }
        // The path is the one durable selection (useTeamState.writeUrlState);
        // a reload lands back here. No page load: the frame is already moving.
        try {
          window.history.pushState(null, '', `/s/${encodeURIComponent(row.id)}`);
        } catch {
          // The switch has landed server-side regardless.
        }
      })
      .catch(() => setMark({ kind: 'failed', id: row.id }));
  }

  function onListKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(rows.length - 1, c + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === 'Enter' && e.metaKey) {
      e.preventDefault();
      if (cursorRow) window.open(`/s/${encodeURIComponent(cursorRow.id)}`, '_blank');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (cursorRow) select(cursorRow);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }
```

The `switching`-closes effect, the pointerdown-outside effect and the global ⌘K effect stay as they are, except ⌘K's `search.current?.focus()` becomes `list.current?.focus()`.

Render — the trigger `<button>` block is unchanged. In the panel:
- Row 1 keeps the folder chip and the `⌘K` kbd; **delete the `<input data-testid="team-search">`**. The chip reads `folderBase(scope)` · `shortPath(scope)` when there is a scope, and `every folder` · `no session on screen` when `scope === null`. The folder menu maps `folders` only — no `ALL_FOLDERS` row — each option rendering `f.name`, `shortPath(f.path)`, and `` `${f.live} live` ``; `isHere = f.path === scope`; a click does `setPicked(f.path); storeFolder(f.path); setFoldersOpen(false); setCursor(0);`.
- Row 2 label reads `LIVE SESSIONS`; `data-testid="session-count"` reads `` `${rows.length} live` `` (warn colour at 0).
- The list maps `rows.map((row) => renderRow(row))`. The empty text: `sessions.length === 0 ? 'Nothing live on this machine. Resume a session from your terminal and it appears here.' : 'Nothing live in this folder.'`. **Delete** the `show-hidden-rows` button and the `hiddenRows` map.
- `renderRow(row)`: `key`/`id` use `row.id`; the glyph is `row.busy ? '●' : '○'` in accent-400 / neutral-600; the kind pill as today via `kindOf(row)` (shown when `row.mode || kindOf(row) !== 'solo'`); the title is `row.title`; the mark compares `mark?.id === row.id`; **delete** the `row-hide`/`row-unhide` buttons; keep `row-stop-watching`. The meta line: the id (`` row.team ?? `session-${row.id.slice(0, 8)}` `` under `data-testid="team-id"`, shown when it differs from the title), the run name, the folder when `row.folder !== scope`, the branch, the diffstat, the agent count, and the state cell:

```tsx
            {notWatching
              ? 'running · not watching'
              : run
                ? run.live
                  ? 'running'
                  : 'ended'
                : row.members < 2 && row.subagents
                  ? `${row.subagents} subagent${row.subagents === 1 ? '' : 's'}`
                  : row.busy
                    ? 'working'
                    : 'at prompt'}
```

- The footer keeps `⏎ open` and `⌘⏎ new tab`; `data-testid="folder-note"` reads `` `${rows.length} live across ${scope ? 1 : folders.length} folder${(scope ? 1 : folders.length) === 1 ? '' : 's'}` ``.

- [ ] **Step 5: Thread the prop through both mounts**

`src/web/chrome/StatusBar.tsx:174-182`: add `sessions={state.sessions ?? []}` to `<TeamSelect …/>`.
`src/web/views/Workflow.tsx`: add `sessions: SessionRow[]` to `WorkflowProps` (import the type), destructure it in the signature at line 66, and add `sessions={sessions}` to its `<TeamSelect …/>` at line 99. In `src/web/App.tsx:375-389` pass `sessions={state.sessions ?? []}` to `<Workflow …/>`.

- [ ] **Step 6: Run the client tests that touch the picker and typecheck**

Run: `npx tsc --noEmit && npx vitest run src/web/chrome src/web/views/Workflow.test.tsx src/web/film-theme.test.tsx`
Expected: `tsc` still names `App.tsx` (it imports `scopedRows`/`readStoredFolders`, gone) and `NoSessions`/`LeftSession` (they still type `TeamSummary`, which exists) — `App.tsx` is Task 9's; leave it. Everything under `src/web/chrome` PASS.

- [ ] **Step 7: Commit**

```bash
git add src/web/chrome/TeamSelect.tsx src/web/chrome/TeamSelect.test.tsx src/web/chrome/StatusBar.tsx src/web/views/Workflow.tsx src/web/test/state-fixture.ts
git commit -m "Render the session picker from the frame; live rows only, one switch path"
```

If `App.tsx` must compile for `vitest` to run this file's tests, do the two-line import fix in `App.tsx` (drop `scopedRows, readStoredFolders` from the import at line ~20) and include `src/web/App.tsx` in the commit; Task 9 owns the rest of that file and starts after this one in the same track.

### Task 9: App, empty states, hidden sessions and splash-skip

**Files:**
- Modify: `src/web/App.tsx:4`, `:9`, `:16`, `:40-42`, `:117-166`, `:173-184`, `:217-244`, `:423-442`
- Modify: `src/web/views/NoSessions.tsx` (whole), `src/web/views/LeftSession.tsx:2`, `:28`, `:152-180`
- Modify: `src/web/state/useWatch.ts` (drop `hidden`, `hideSession`, `unhideSession`, `showHidden`)
- Modify: `src/web/chrome/Splash.tsx:14-34` (drop `SKIP_KEY`, `skipNextSplash`, `splashSkipped`)
- Delete: `src/web/state/useHiddenSessions.ts`, `src/web/state/useHiddenSessions.test.ts`
- Test: `src/web/App.test.tsx:240-500`, `src/web/views/NoSessions.test.tsx`, `src/web/views/LeftSession.test.tsx`

**Interfaces:**
- Consumes: Task 8's `TeamSelectProps.sessions`, `byRow`, `scopeOf`, `readStoredFolder`; Task 1's `SessionRow`.
- Produces:
  ```ts
  export interface NoSessionsProps { others: SessionRow[]; onSwitchTo(id: string): void }
  // LeftSessionProps.elsewhere: SessionRow[]; onSwitchTo(id: string)
  // WatchState = { dismissed, requestStopWatching, watchAgain }
  ```
  `NoSessions` renders when the frame carries `sessions`, it is empty, and the frame has no agents either — nothing live, nothing on screen.

- [ ] **Step 1: Write the failing tests**

`src/web/views/NoSessions.test.tsx` — replace its contents with:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { sampleSessions } from '../test/state-fixture';
import { NoSessions } from './NoSessions';

afterEach(cleanup);

it('tells the operator how a session gets back into the picker', () => {
  render(<NoSessions others={[]} onSwitchTo={vi.fn()} />);
  expect(screen.getByText('Nothing live on this machine.')).toBeTruthy();
  expect(screen.getByText(/resume a session from your terminal/i)).toBeTruthy();
  expect(screen.queryByTestId('no-sessions-other')).toBeNull();
});

it('offers the live sessions elsewhere, switching by session id', () => {
  const onSwitchTo = vi.fn();
  render(<NoSessions others={sampleSessions().filter((r) => !r.current)} onSwitchTo={onSwitchTo} />);
  const rows = screen.getAllByTestId('no-sessions-other');
  expect(rows).toHaveLength(2);
  fireEvent.click(rows[0]);
  expect(onSwitchTo).toHaveBeenCalledWith('b5129c7b-a009-4de3-9a42-4664d1214f39');
});
```

`src/web/views/LeftSession.test.tsx` — wherever it builds `elsewhere` from `sampleTeams()`, build it from `sampleSessions().filter((r) => !r.current)` and assert `onSwitchTo` is called with the row's `id` (`'b5129c7b-a009-4de3-9a42-4664d1214f39'`) rather than its name.

`src/web/App.test.tsx` — the tests from line 240 to ~500 stub `fetch` for `/api/teams` and assert `/api/teams/<name>/select` POSTs. Rewrite each as follows (the `MockEventSource` snapshot harness stays):
- `elsewhere`/dismissed cases: no fetch stub needed; emit `sampleTeamState()` (which now carries `sessions`) and assert the dismissed screen lists the two non-current rows.
- The auto-resume cases (`lands a bare open …` at 381, and its siblings at 300–480): the target is chosen from the snapshot's `sessions`, so emit a snapshot whose `sessions` has the wanted shape and assert `fetchMock` was called with `` `/api/select-session/${id}` `` and the POST options — never `/api/teams…`. The case "stays inside the folder of the session on screen" becomes: the current row **idle** in `octo`, a busy row in `hatch`, and another busy row (`B5`, `busy: true`) in `octo` → the POST targets `B5`, not the `hatch` one. A sibling case: the current row busy in `octo` and everything else idle → no POST at all, since the row on screen is already the most active.
- Lines 460 and 469 (`expect(fetchMock.mock.calls.some(... '/api/teams?folder=*')).toBe(false)`) become `expect(fetchMock).not.toHaveBeenCalled()`.
- The announce case at 278 (`/api/teams/session-b5129c7b/select`) stays — the launcher announce still uses that route.
- Add one case:

```tsx
it('shows the nothing-live screen when the frame has no sessions and no agents', () => {
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', { ...sampleTeamState(), agents: [], sessions: [] }));
  expect(screen.getByTestId('no-sessions')).toBeTruthy();
});
```

Delete `src/web/state/useHiddenSessions.test.ts`.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/web/views/NoSessions.test.tsx src/web/views/LeftSession.test.tsx src/web/App.test.tsx`
Expected: FAIL — `others` is not a prop; App still fetches `/api/teams`.

- [ ] **Step 3: `NoSessions`** (`src/web/views/NoSessions.tsx`) — replace the props, the copy and the `notShownCount` block:

```tsx
export interface NoSessionsProps {
  /** Live sessions elsewhere on the machine, one click away. Empty: nothing is live anywhere. */
  others: SessionRow[];
  onSwitchTo(id: string): void;
}

export function NoSessions({ others, onSwitchTo }: NoSessionsProps) {
```

`<h1>` reads `Nothing live on this machine.`; the `<p>` reads:

```
The picker lists sessions whose Claude process is running. Resume a session
from your terminal — session-deck, or `claude --resume` — and it appears
here within a few seconds. Nothing was stopped and nothing was deleted.
```

Delete the `notShownCount > 0 && (…)` block and `DOT`/`DOT_COLOR`. The `others.length > 0` block keeps its `ELSEWHERE ON THIS MACHINE` label and maps `others`: `key={r.id}`, `onClick={() => onSwitchTo(r.id)}`, glyph `r.busy ? '●' : '○'` (accent-400 / neutral-600), title `r.title`, and `` `${r.members} agent${r.members === 1 ? '' : 's'}` ``. Import `SessionRow` instead of `TeamSummary`.

- [ ] **Step 4: `LeftSession`** (`src/web/views/LeftSession.tsx:2`, `:28`, `:152-180`)

Type `elsewhere: SessionRow[]`, `onSwitchTo(id: string)`. In the map: `key={s.id}`, `onClick={() => onSwitchTo(s.id)}`, dot from `s.busy` as above, title `s.title`.

- [ ] **Step 5: `useWatch`** (`src/web/state/useWatch.ts`) — `WatchState` becomes `{ dismissed; requestStopWatching(); watchAgain() }`; the default context value drops the four hidden members. Delete `src/web/state/useHiddenSessions.ts`.

- [ ] **Step 6: `Splash`** (`src/web/chrome/Splash.tsx:14-34`) — delete `SKIP_KEY`, `skipNextSplash` and `splashSkipped`. The splash plays once per app load; there is no in-app page load left to skip it for.

- [ ] **Step 7: `App.tsx`**

- Line 4: `import type { Agent, SessionRow } from '../shared/domain';`. Line 9: `import { Splash, prefersReducedMotion } from './chrome/Splash';`. Line 16: delete the `useHiddenSessions` import. The `TeamSelect` import keeps only what is still used (`byRow`, `scopeOf`, `readStoredFolder`).
- Line 42: `const [splashDone, setSplashDone] = useState(false);`
- Lines 117 and 125–166: delete `elsewhere` state, `useHiddenSessions`, `currentHidden`, `bodyEmpty`, `switchable`, `notShownCount` and the `/api/teams` effect. In their place:

```ts
  // What the picker would let you switch to, straight off the frame.
  const elsewhere = useMemo(
    () => (state?.sessions ?? []).filter((r) => !r.current).sort(byRow),
    [state?.sessions],
  );
  // Nothing live, nothing on screen: the frame has rows and none, and no roster.
  const nothingLive = state !== null && state.sessions !== undefined && state.sessions.length === 0 && state.agents.length === 0;
```

- Lines 173–184: `watchState = useMemo(() => ({ dismissed, requestStopWatching: () => setPendingDismiss(true), watchAgain }), [dismissed, watchAgain])`.
- Lines 217–244 (auto-resume): replace the effect body with:

```ts
  const autoResumed = useRef(false);
  useEffect(() => {
    if (autoResumed.current || store.announcedTeam || store.sessionRoute || !state?.sessions) return;
    autoResumed.current = true;
    // Most recently active, inside the operator's folder — the same scope the
    // picker opens on — so a bare open stays where the operator works.
    const scope = scopeOf(state.sessions, readStoredFolder());
    const rows = state.sessions.filter((r) => scope === null || r.folder === scope).sort(byRow);
    const target = rows[0];
    if (!target || target.current) return;
    void postJson(`/api/select-session/${encodeURIComponent(target.id)}`);
  }, [state, store.announcedTeam, store.sessionRoute]);
```

- Lines 423–442: 

```tsx
        {nothingLive ? (
          <NoSessions
            others={elsewhere}
            onSwitchTo={(id) => void postJson(`/api/select-session/${encodeURIComponent(id)}`)}
          />
        ) : dismissed ? (
          <LeftSession
            state={state}
            now={now}
            awaySince={awaySince}
            elsewhere={elsewhere}
            onWatchAgain={watchState.watchAgain}
            onEndForReal={endForReal}
            onSwitchTo={(id) => void postJson(`/api/select-session/${encodeURIComponent(id)}`)}
          />
        ) : (
```

The launcher-announce effect at 186–195 (`/api/teams/<target>/select`) is unchanged.

- [ ] **Step 8: Typecheck and run the web suite**

Run: `npx tsc --noEmit && npx vitest run src/web`
Expected: both clean.

- [ ] **Step 9: Commit**

```bash
git add src/web/App.tsx src/web/App.test.tsx src/web/views/NoSessions.tsx src/web/views/NoSessions.test.tsx src/web/views/LeftSession.tsx src/web/views/LeftSession.test.tsx src/web/state/useWatch.ts src/web/chrome/Splash.tsx
git rm src/web/state/useHiddenSessions.ts src/web/state/useHiddenSessions.test.ts
git commit -m "Feed the empty states from the frame; drop hidden sessions and the splash skip"
```

### Task 10: Delete the old listing types and run the whole gate

**Files:**
- Modify: `src/shared/domain.ts:489-515` (`FolderSummary`, `ALL_FOLDERS`, `inFolder`, `TeamsResponse` → deleted), `:408-488` (`TeamSummary` doc comment says server-internal)
- Modify: whatever `tsc` names after the deletion (expected: nothing — Tasks 7–9 removed every consumer)

**Interfaces:**
- Consumes: Tasks 7 and 9 complete.
- Produces: a green `npx vitest run` and `npx tsc --noEmit` on the branch, and the manual-check notes below in the run log.

- [ ] **Step 1: Delete the four old listing exports** (`src/shared/domain.ts:489-515`)

Remove `FolderSummary`, `ALL_FOLDERS`, `inFolder` and `TeamsResponse` entirely. Replace the `TeamSummary` doc comment's first paragraph (above line 408) with:

```ts
/**
 * The server's own record of a team while it walks `teams/` — what
 * `walkTeams`, `autoTeam` and `teamOfSession` read. Never sent to the client:
 * the picker's row is {@link SessionRow}.
 */
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. If it names a file, that file still imports one of the four names — delete the import (Tasks 7–9 removed every use; only an import line can be left). Do not re-add a type.

- [ ] **Step 3: Grep for leftovers**

Run: `grep -rn "ALL_FOLDERS\|TeamsResponse\|FolderSummary\|inFolder\|useHiddenSessions\|skipNextSplash\|splashSkipped\|/api/teams\b\|listTeamSummaries\|listAllFolders\|listFolders\|scopedRows\|readStoredFolders\|sampleTeams" src --include=*.ts --include=*.tsx`
Expected: only `src/server/http.ts`'s `TEAM_SELECT_ROUTE` (`/api/teams/:name/select`, kept for the launcher announce), its tests and `App.tsx`'s announce effect, and `src/web/components/TranscriptFeed.test.tsx:436` (a fixture string). Anything else is a leftover: remove it. (`sessionOnly` is deliberately not in the list: `IngestConfig.sessionOnly` stays.)

- [ ] **Step 4: Run the full gate**

Run: `npx vitest run && npx tsc --noEmit`
Expected: both clean, every suite.

- [ ] **Step 5: Manual check on the running console, and write the numbers into the run log** (`docs/team8/runs/2026-10-15-session-picker-live-only.md`, under `## Run`, as a `- manual check:` line)

```bash
# the console the plugin runs for the current session
lsof -nP -iTCP:4823 -sTCP:LISTEN
# 1. the listing is gone
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4823/api/teams          # 404
# 2. the frame carries the rows
curl -sN http://127.0.0.1:4823/stream | head -c 20000 | grep -o '"sessions":\[[^]]*\]' | head -c 600
# 3. a switch, and a switch back, server-side
A=<uuid of one live session>; B=<uuid of another>
for t in $B $A $B; do curl -s -o /dev/null -w "switch ${t:0:8}: %{time_total}s\n" -H 'content-type: application/json' -d '{}' -X POST http://127.0.0.1:4823/api/select-session/$t; done
```
Expected: `404`; a `sessions` array whose rows all have `busy` and `folder`; the third switch (a return) under 0.3 s. Then in the browser: ⌘K opens with no "reading teams…" flash, rows are live sessions only, the folder chip has no `all`, picking a row does not reload the page (the splash does not play, the URL becomes `/s/<id>`). Note the three switch timings in the run log.

- [ ] **Step 6: Commit**

```bash
git add src/shared/domain.ts docs/team8/runs/2026-10-15-session-picker-live-only.md
git commit -m "Remove the old picker listing types"
```
