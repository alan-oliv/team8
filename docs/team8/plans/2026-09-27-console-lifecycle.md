# Console lifecycle Implementation Plan

> **For agentic workers:** this plan is executed by teammates that `team8:run` dispatches from the shared task list. Read your own task section. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/team8:console` opens on the session it was run from and open tabs follow; there is only ever one console, it never stops on its own, it comes back on what it was showing, it says which build it is, and a newer build replaces an older one.

**Architecture:** The server keeps a `watching` value (session, team or auto) in place of `pinned`; the follower moves what is shown toward it every 3 s, resolving a session's team through `/branch` ancestors and re-keys on direct evidence only. The server records its watch in `~/.claude/team8/console.json`, so the shell scripts (sharing one sourced helper) can restart, upgrade or reopen it on the same target. The frame carries `watching` and `build`, so tabs rewrite their address and the header shows the build.

**Tech Stack:** TypeScript on Node 22 (server, bundled by esbuild), React 19 + Vite (web), vitest, POSIX `sh` hook scripts.

**Spec:** `docs/team8/specs/2026-09-27-console-lifecycle-design.md`

## Global Constraints

- Node 22+; no new npm dependencies.
- Hook scripts are POSIX `sh` (no bash-isms) and depend only on `curl` and `node`.
- `console-restart.sh` exits 0 and writes nothing to stdout or stderr, on every path.
- `console-hint.sh` and `console-launch.sh` print only `{}` or `{"systemMessage": ...}` and exit 0.
- Port: `${OCTO_PORT:-4823}`. Claude home: `${CLAUDE_CONFIG_DIR:-$HOME/.claude}`.
- `Watching` is exactly `{ kind: 'session'; id: string } | { kind: 'team'; name: string } | { kind: 'auto' }`.
- `/health` answers `{ ok: true, team, agents, version, build, sha?, watching, tabs }`, with `build` one of `'installed' | 'dev'`.
- The record lives at `<claude home>/team8/console.json` and holds `{ pid, port, version, watching }`.
- The Claude Code version floor is `2.1.231`.
- Do not commit `plugin/dist`: the bump workflow builds it, and CI stops checking it in Task 9.
- Comments say why, never what; tests are named by the behaviour they verify; pure logic is tested without mocks.
- Commit messages carry no AI attribution.

## File structure

| File | Track | Responsibility |
|---|---|---|
| `src/server/watch.ts` (new) | A | Pure rules: the team a session drives, what `auto` shows |
| `src/server/build-info.ts` (new) | A | This server's version, build kind, sha; the installed version; release comparison |
| `src/server/console-record.ts` (new) | A | Writing `console.json` atomically |
| `src/server/index.ts` | A | `forkChainOf`, discovery, the watch, follower, select routes, frame, boot |
| `src/server/http.ts` | A | `/health` fields |
| `src/server/lifecycle.ts` | A | Drop the idle reaper and `hasLiveTeam` |
| `src/server/ingest/hooks.ts` | A | Drop the SessionEnd shutdown |
| `src/shared/domain.ts` | A | `Watching`, `BuildInfo`, `TeamState.watching`, `TeamState.build` |
| `plugin/bin/console-lib.sh` (new) | B | Shared shell helpers: is it up, a `/health` field, release compare, recorded flags, start |
| `plugin/bin/console-restart.sh` | B | Restart a crashed console on its recorded watch |
| `plugin/bin/console-launch.sh` | B | Workflow passes `--session` only; health via the helper |
| `plugin/bin/console-hint.sh` | B | Replace an older console on session start |
| `plugin/bin/console-open.sh` (new) | B | What `/team8:console` runs |
| `plugin/commands/console.md` | B | Runs `console-open.sh`, reports its URL |
| `plugin/hooks/hooks.json` | B | Description text only |
| `fixtures/fake-console/server.cjs` (new) | B | A stand-in console the script tests start and inspect |
| `src/web/state/useTeamState.ts` | C | Tab address follows `watching` |
| `src/web/chrome/Bar.tsx`, `StatusBar.tsx`, `src/web/views/Workflow.tsx`, `src/web/App.tsx` | C | Build chip |
| `.github/workflows/ci.yml`, `.gitattributes` (new) | D | Stop gating `plugin/dist` |
| `src/server/setup.ts`, `plugin/commands/setup.md`, `README.md` | D | Version floor; README lifecycle text |

---

### Task 1: Watch rules — a session's team and what auto shows

**Files:**
- Create: `src/server/watch.ts`
- Create: `src/server/watch.test.ts`
- Modify: `src/shared/domain.ts` (add `Watching`)
- Modify: `src/server/index.ts` (`forkChainOf`, `discoverTeam`, `walkTeams`' `current`, delete `teamDrivenBy`)
- Test: `src/server/index.test.ts`

**Interfaces:**
- Consumes: `TeamSummary` (`src/shared/domain.ts`), `TeamWalk.drivers`, `sessionProjectDir` (`src/server/index.ts`).
- Produces:
  - `export type Watching = { kind: 'session'; id: string } | { kind: 'team'; name: string } | { kind: 'auto' }` in `src/shared/domain.ts`.
  - `export function teamOfSession(teams: readonly TeamSummary[], drivers: ReadonlyMap<string, string>, chain: readonly string[]): TeamSummary | undefined` in `src/server/watch.ts`.
  - `export function autoTeam(teams: readonly TeamSummary[]): TeamSummary | undefined` in `src/server/watch.ts`.
  - `export async function forkChainOf(projectsRoot: string | undefined, sessionId: string): Promise<string[]>` in `src/server/index.ts`.

Background: `index.ts` today has `teamDrivenBy(walk, sessionId)` (direct evidence, no `/branch` ancestors) and a discovery branch that sorts live teams inline. Both become the two pure rules below, and `forkChainOf` supplies the ancestors the launcher already walks in shell (`plugin/bin/console-launch.sh`, `forkedFrom`).

- [ ] **Step 1: Write the failing tests for the pure rules**

Create `src/server/watch.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { TeamSummary } from '../shared/domain';
import { autoTeam, teamOfSession } from './watch';

function team(name: string, over: Partial<TeamSummary> = {}): TeamSummary {
  return {
    name,
    members: 2,
    createdAt: 0,
    leadSessionId: '',
    leadAlive: false,
    lastActivityAt: 0,
    live: false,
    current: false,
    state: 'done',
    ...over,
  };
}

describe('teamOfSession', () => {
  it('finds the team whose config names the session as its lead', () => {
    const mine = team('session-mine', { leadSessionId: 'S' });
    expect(teamOfSession([team('other', { leadSessionId: 'X' }), mine], new Map(), ['S'])).toBe(mine);
  });

  it('finds a re-keyed team through the teammate sidecar that names it', () => {
    const rekeyed = team('rekeyed', { leadSessionId: 'fresh-id-nobody-has' });
    expect(teamOfSession([rekeyed], new Map([['rekeyed', 'S']]), ['S'])).toBe(rekeyed);
  });

  it("finds a /branch'd session's team through its ancestor", () => {
    const parents = team('parents', { leadSessionId: 'PARENT' });
    expect(teamOfSession([parents], new Map(), ['CHILD', 'PARENT'])).toBe(parents);
  });

  it('prefers the re-keyed team over the lead-only directory it replaced', () => {
    const leadOnly = team('session-s', { leadSessionId: 'S', members: 1 });
    const rekeyed = team('rekeyed', { leadSessionId: 'fresh', members: 3 });
    expect(teamOfSession([leadOnly, rekeyed], new Map([['rekeyed', 'S']]), ['S'])).toBe(rekeyed);
  });

  it('finds nothing without direct evidence, even for a team in the same folder', () => {
    expect(teamOfSession([team('neighbour', { leadSessionId: 'N' })], new Map([['neighbour', 'N']]), ['S'])).toBeUndefined();
  });
});

describe('autoTeam', () => {
  it('picks a live team with teammates over a newer lead-only one', () => {
    const real = team('real', { live: true, members: 3, createdAt: 1 });
    expect(autoTeam([team('solo', { live: true, members: 1, createdAt: 2 }), real])).toBe(real);
  });

  it('prefers a team whose lead is running, then the newest', () => {
    const running = team('running', { live: true, leadAlive: true, createdAt: 1 });
    const newer = team('newer', { live: true, createdAt: 2 });
    const newest = team('newest', { live: true, createdAt: 3 });
    expect(autoTeam([newer, running, newest])).toBe(running);
    expect(autoTeam([newer, newest])).toBe(newest);
  });

  it('falls back to a live lead-only team, and to nothing when none is live', () => {
    const solo = team('solo', { live: true, members: 1 });
    expect(autoTeam([team('dead', { members: 7 }), solo])).toBe(solo);
    expect(autoTeam([team('dead', { members: 7 })])).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/server/watch.test.ts`
Expected: FAIL — `Failed to resolve import "./watch"`.

- [ ] **Step 3: Add `Watching` and write the rules**

In `src/shared/domain.ts`, directly above `export interface TeamState`, add:

```ts
/**
 * What the operator asked the console to show. A session is followed to
 * whatever team it drives; a team is held even after it ends; auto shows the
 * newest live team.
 */
export type Watching = { kind: 'session'; id: string } | { kind: 'team'; name: string } | { kind: 'auto' };
```

Create `src/server/watch.ts`:

```ts
import type { TeamSummary } from '../shared/domain';

/**
 * The team a session drives, on direct evidence only: config.leadSessionId, or
 * the session a teammate sidecar ties the team to (`drivers`), matching the
 * session or any `/branch` ancestor in `chain`. Never the folder-based
 * adoption, which once handed a session a neighbour's finished team. A re-keyed
 * team and the lead-only directory it replaced can both match; the one with
 * teammates is the real one.
 */
export function teamOfSession(
  teams: readonly TeamSummary[],
  drivers: ReadonlyMap<string, string>,
  chain: readonly string[],
): TeamSummary | undefined {
  const ids = new Set(chain);
  return teams
    .filter((t) => ids.has(t.leadSessionId) || ids.has(drivers.get(t.name) ?? ''))
    .sort((a, b) => b.members - a.members)[0];
}

/**
 * What `auto` shows. Claude Code leaves team directories behind, so only a
 * live team counts; a lead-only roster is not a real team and is a fallback.
 */
export function autoTeam(teams: readonly TeamSummary[]): TeamSummary | undefined {
  const live = teams.filter((t) => t.live);
  const real = live.filter((t) => t.members >= 2);
  return [...(real.length > 0 ? real : live)].sort(
    (a, b) => Number(b.leadAlive) - Number(a.leadAlive) || b.createdAt - a.createdAt,
  )[0];
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/server/watch.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Write the failing tests for `forkChainOf` and a branched `--session`**

In `src/server/index.test.ts`, add `forkChainOf` to the import from `./index`, then add at the end of the file:

```ts
describe('forkChainOf', () => {
  async function transcript(id: string, first: unknown) {
    const slug = path.join(dir, 'projects', '-repo');
    await fs.mkdir(slug, { recursive: true });
    await fs.writeFile(path.join(slug, `${id}.jsonl`), `${JSON.stringify(first)}\n`);
  }

  it("walks a /branch'd session back through its ancestors", async () => {
    await transcript('child', { forkedFrom: { sessionId: 'parent' } });
    await transcript('parent', { forkedFrom: { sessionId: 'root' } });
    await transcript('root', { type: 'user' });

    expect(await forkChainOf(path.join(dir, 'projects'), 'child')).toEqual(['child', 'parent', 'root']);
  });

  it('stops at a cycle instead of looping', async () => {
    await transcript('a', { forkedFrom: { sessionId: 'b' } });
    await transcript('b', { forkedFrom: { sessionId: 'a' } });

    expect(await forkChainOf(path.join(dir, 'projects'), 'a')).toEqual(['a', 'b']);
  });

  it('is just the session when there is no projects root to read', async () => {
    expect(await forkChainOf(undefined, 'solo')).toEqual(['solo']);
  });
});
```

Inside `describe('discoverTeam', ...)`, after the test `'--session with no team of its own finds none, so the console opens the session itself'`, add:

```ts
  it("--session on a /branch'd lead opens the team its ancestor leads", async () => {
    await writeTeam('session-parent', { createdAt: 1000, leadSessionId: 'parent-session', memberCount: 3 });
    const slug = path.join(dir, 'projects', '-repo');
    await fs.mkdir(slug, { recursive: true });
    await fs.writeFile(
      path.join(slug, 'child-session.jsonl'),
      `${JSON.stringify({ forkedFrom: { sessionId: 'parent-session' } })}\n`,
    );

    const found = await discoverTeam(teams(), sessions(), undefined, {
      session: 'child-session',
      projectsRoot: path.join(dir, 'projects'),
    });
    expect(found?.teamName).toBe('session-parent');
  });
```

- [ ] **Step 6: Run them to see them fail**

Run: `npx vitest run src/server/index.test.ts -t "forkChainOf|branch'd lead"`
Expected: FAIL — `forkChainOf` is not exported, and the branched `--session` finds no team.

- [ ] **Step 7: Add `forkChainOf`, and use the rules in discovery and the picker**

In `src/server/index.ts`:

1. Add the import: `import { autoTeam, teamOfSession } from './watch';`
2. Directly below `export async function sessionProjectDir(...) { ... }`, add:

```ts
/** The `forkedFrom` header Claude Code writes as a `/branch`'d transcript's first record. */
async function forkParentOf(transcript: string): Promise<string | undefined> {
  let head: string;
  try {
    const fh = await fs.open(transcript, 'r');
    try {
      const buf = Buffer.alloc(65536);
      const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
      head = buf.subarray(0, bytesRead).toString('utf8');
    } finally {
      await fh.close();
    }
  } catch {
    return undefined;
  }
  try {
    const first = JSON.parse(head.split('\n', 1)[0]) as { forkedFrom?: { sessionId?: unknown } };
    const parent = first.forkedFrom?.sessionId;
    return typeof parent === 'string' && parent !== '' ? parent : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The session, then each `/branch` ancestor. `/branch` gives the fork a new id
 * but never touches config.json, so a forked lead's team is keyed on an
 * ancestor. Capped at 20 hops, like the launcher's walk.
 */
export async function forkChainOf(projectsRoot: string | undefined, sessionId: string): Promise<string[]> {
  const chain = [sessionId];
  if (!projectsRoot) return chain;
  while (chain.length <= 20) {
    const dir = await sessionProjectDir(projectsRoot, chain[chain.length - 1]);
    const parent = dir ? await forkParentOf(`${dir}.jsonl`) : undefined;
    if (!parent || chain.includes(parent)) break;
    chain.push(parent);
  }
  return chain;
}
```

3. In `discoverTeam`, replace the block from `const walk = await walkTeams(` through the closing `}` of its `else` branch with:

```ts
  const walk = await walkTeams(teamsRoot, sessionsRoot, '', opts.projectsRoot);
  // A named session is shown as itself unless it drives a team — any other
  // team on the machine is somebody else's work.
  const best = opts.session
    ? teamOfSession(walk.teams, walk.drivers, await forkChainOf(opts.projectsRoot, opts.session))
    : autoTeam(walk.teams);
```

4. Delete the function `teamDrivenBy` and its doc comment. Replace its two remaining call sites, in `selectSession` and `followRealTeam`, with `teamOfSession(walk.teams, walk.drivers, [sessionId])` and `teamOfSession(walk.teams, walk.drivers, [currentSession])` respectively. In `selectSession` the walk is inline today; bind it first: `const walk = await walkTeams(teamsRoot, sessionsRoot, sessionId, projectsRoot);`. Task 2 rewrites both functions; this step only keeps them compiling.
5. In `walkTeams`, the loop that sets `t.current`: change `leadSessions.get(t.name) === current` to `drivers.get(t.name) === current`, so a team the folder guess handed to a session is never marked as on screen.

- [ ] **Step 8: Run the server tests**

Run: `npx tsc --noEmit && npx vitest run src/server/watch.test.ts src/server/index.test.ts src/server/index.wiring.test.ts`
Expected: typecheck clean; all pass except, in `index.wiring.test.ts`, `leaves nothing of the team it left behind, then or 400ms later`, which already fails on `main` and is fixed in Task 2.

- [ ] **Step 9: Commit**

```bash
git add src/server/watch.ts src/server/watch.test.ts src/shared/domain.ts src/server/index.ts src/server/index.test.ts
git commit -m "Resolve a session's team through its /branch ancestors, on direct evidence only"
```

### Task 2: The console follows its watch

**Files:**
- Modify: `src/server/index.ts` (`main()`: `watching` replaces `pinned`; `targetOf`, `shows`, `moveTo`; `selectSession`, `selectTeam`, `followRealTeam`; frame `watching`)
- Modify: `src/shared/domain.ts` (`TeamState.watching`)
- Test: `src/server/index.wiring.test.ts`

**Interfaces:**
- Consumes: `Watching`, `teamOfSession`, `autoTeam`, `forkChainOf` (Task 1).
- Produces:
  - `TeamState.watching?: Watching` on every published frame.
  - Inside `main()`: `let watching: Watching` and `const watch = (next: Watching): void` — the only way the watch changes. Task 4 adds the record write inside `watch`.

Background: in `main()`, `currentTeam` and `currentSession` record what is **shown** (the ingest's `onTeam` updates `currentTeam` on its own) and stay. `pinned` goes: `watching` says what the operator asked for, and the follower moves what is shown toward it. This task also fixes study item F3: `followRealTeam` writes `leadFacts` before its generation check, so a tick that started before a switch paints the old team's branch onto the new one. The wiring test for it only failed on the author's machine, because `fixtures/config-4-members.json` sets team A's cwd to `/Users/alanoliv/code/team8` and `branchOf` reads that checkout's real `.git/HEAD`.

- [ ] **Step 1: Make the F3 test fail on every machine**

In `src/server/index.wiring.test.ts`, inside `layout()`, directly after the `fs.copyFile(... 'config-4-members.json' ...)` call, add:

```ts
  // Team A's lead sits in a folder of its own with a known branch, not in
  // whichever checkout runs the tests: branchOf() reads <cwd>/.git/HEAD, so the
  // fixture's cwd made team A's branch that of the machine running the suite.
  const repoA = path.join(dir, 'repo-a');
  await fs.mkdir(path.join(repoA, '.git'), { recursive: true });
  await fs.writeFile(path.join(repoA, '.git', 'HEAD'), 'ref: refs/heads/fixture-branch-a\n');
  const configA = path.join(dir, 'teams', TEAM, 'config.json');
  const parsedA = JSON.parse(await fs.readFile(configA, 'utf8')) as { members: { cwd?: string }[] };
  for (const member of parsedA.members) member.cwd = repoA;
  await fs.writeFile(configA, JSON.stringify(parsedA));
```

- [ ] **Step 2: Write the failing wiring tests for the watch**

In `src/server/index.wiring.test.ts`, inside `describe('which team a console boots onto', ...)`, add after the existing helpers (`emptyHome`, `leftover`, `teamOf`, `waitForTeam`):

```ts
  async function waitForTeamNamed(url: string, name: string, deadlineMs: number): Promise<string> {
    const until = Date.now() + deadlineMs;
    let team = await teamOf(url);
    while (team !== name && Date.now() < until) {
      await new Promise((r) => setTimeout(r, 100));
      team = await teamOf(url);
    }
    return team;
  }

  async function liveSession(dir: string, sessionId: string) {
    await fs.writeFile(path.join(dir, 'projects', SLUG, `${sessionId}.jsonl`), '');
    await fs.writeFile(
      path.join(dir, 'sessions', `${process.pid}.json`),
      JSON.stringify({ sessionId, pid: process.pid, cwd: process.cwd() }),
    );
  }
```

and these tests at the end of the same `describe`:

```ts
  it('a watched session follows its lead-only team to the re-keyed one', async () => {
    const dir = await emptyHome();
    await fs.mkdir(path.join(dir, 'projects', SLUG), { recursive: true });
    await liveSession(dir, SOLO_SESSION);
    await fs.mkdir(path.join(dir, 'teams', 'session-8f2a1c00'), { recursive: true });
    await fs.writeFile(
      path.join(dir, 'teams', 'session-8f2a1c00', 'config.json'),
      JSON.stringify({ name: 'session-8f2a1c00', leadSessionId: SOLO_SESSION, members: [{ agentId: 'team-lead', name: 'team-lead' }] }),
    );
    const url = await boot(dir, ['--session', SOLO_SESSION], null);
    expect(await teamOf(url)).toBe('session-8f2a1c00');

    // The re-key: Claude Code writes a new directory under a fresh lead id and
    // only the first teammate's sidecar still names the session driving it.
    await fs.rm(path.join(dir, 'teams', 'session-8f2a1c00'), { recursive: true });
    await writeTeamConfig(dir, 'session-ffff0000', 'fresh-id-nobody-has', 'probe-rk');
    const subagents = path.join(dir, 'projects', SLUG, SOLO_SESSION, 'subagents');
    await fs.mkdir(subagents, { recursive: true });
    await fs.writeFile(
      path.join(subagents, 'agent-aprobe-rk-0123456789abcdef.meta.json'),
      JSON.stringify({
        agentType: 'probe-rk',
        description: 'the first teammate',
        name: 'probe-rk',
        spawnDepth: 0,
        model: 'claude-opus-5',
        taskKind: 'in_process_teammate',
        teamName: 'session-ffff0000',
        color: 'green',
      } satisfies Sidecar),
    );

    expect(await waitForTeamNamed(url, 'session-ffff0000', FOLLOW_INTERVAL_MS * 3)).toBe('session-ffff0000');
  }, 20_000);

  it("a watched session that is a /branch of a lead shows that lead's team, marked current in the picker", async () => {
    const dir = await emptyHome();
    await writeTeamConfig(dir, 'session-aaaa1111', 'ancestor-session', 'probe-anc');
    await fs.mkdir(path.join(dir, 'projects', SLUG), { recursive: true });
    await fs.writeFile(
      path.join(dir, 'projects', SLUG, `${SOLO_SESSION}.jsonl`),
      `${JSON.stringify({ forkedFrom: { sessionId: 'ancestor-session' } })}\n`,
    );

    const url = await boot(dir, ['--session', SOLO_SESSION], null);

    expect(await teamOf(url)).toBe('session-aaaa1111');
    const listing = (await (await fetch(`${url}/api/teams?folder=*`)).json()) as TeamsResponse;
    expect(listing.teams.filter((t) => t.current).map((t) => t.name)).toEqual(['session-aaaa1111']);
  }, 20_000);

  it('selecting the session already on screen changes nothing but the watch', async () => {
    home = await layout();
    const url = await boot(home);

    const res = (await (await selectSession(url, LEAD_SESSION)).json()) as { changed?: boolean };

    expect(res.changed).toBe(false);
    expect((await snapshot(url)).watching).toEqual({ kind: 'session', id: LEAD_SESSION });
  }, 20_000);

  it('selecting another session switches the running console without a restart', async () => {
    home = await layout();
    const url = await boot(home);
    const running = child;

    const res = (await (await selectSession(url, LEAD_SESSION_B)).json()) as { changed?: boolean };

    expect(res.changed).toBe(true);
    expect(await teamOf(url)).toBe(TEAM_B);
    expect(running?.exitCode).toBeNull();
  }, 20_000);

  it('a console held on a team stays there when a newer team appears', async () => {
    home = await layout();
    const url = await boot(home);
    await writeTeamConfig(home, 'session-newer999', 'newer-session', 'probe-new');

    await new Promise((r) => setTimeout(r, FOLLOW_INTERVAL_MS + 1000));

    expect(await teamOf(url)).toBe(TEAM);
  }, 20_000);
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run src/server/index.wiring.test.ts`
Expected: FAIL — `leaves nothing of the team it left behind, then or 400ms later` (branch `fixture-branch-a`, not undefined); the re-keyed test stays on `session-8f2a1c00`; the `/branch` test reports team `''`; `selecting the session already on screen` finds `watching` undefined. `selecting another session…` and `a console held on a team…` already pass: they guard behaviour this task must keep.

- [ ] **Step 4: Put `watching` on the frame type**

In `src/shared/domain.ts`, inside `interface TeamState`, directly below `switching?: boolean;`, add:

```ts
  /** What the console was asked to show; a tab rewrites its address from a session watch. */
  watching?: Watching;
```

- [ ] **Step 5: Replace `pinned` with the watch in `main()`**

All in `src/server/index.ts`, inside `main()`.

1. Import `type Watching` from `'../shared/domain'` (add it to the existing domain import) and `autoTeam, teamOfSession` are already imported from `./watch` by Task 1.
2. Directly below `let switching = false;` (above `const publish`, which the boot sweep already calls), add:

```ts
  // What the operator asked to see. currentTeam/currentSession below record what
  // is SHOWN; the follower moves that toward this. --session wins over --team: an
  // older launcher passed both, and its team came from that same session.
  let watching: Watching = cli.session
    ? { kind: 'session', id: cli.session }
    : cli.team
      ? { kind: 'team', name: cli.team }
      : { kind: 'auto' };
  const watch = (next: Watching): void => {
    watching = next;
  };
```

3. In `publish`, add `watching,` directly below `switching,`.
4. Delete the comment block and the line `let pinned = cli.session !== undefined;`.
5. In `selectTeam`, replace both `pinned = true;` lines with `watch({ kind: 'team', name: team });`. Delete the comment `// The operator has chosen; the follower stops correcting from here on.`
6. Directly above `const selectSession`, add:

```ts
  type Target = { team: string; lead: string } | { session: string };

  /** Where the watch says the console should be; undefined means stay put. */
  const targetOf = async (walk: TeamWalk): Promise<Target | undefined> => {
    if (watching.kind === 'team') return undefined;
    if (watching.kind === 'session') {
      const id = watching.id;
      const team = teamOfSession(walk.teams, walk.drivers, await forkChainOf(projectsRoot, id));
      return team ? { team: team.name, lead: team.leadSessionId || id } : { session: id };
    }
    if (walk.teams.some((t) => t.name === currentTeam && t.members >= 2 && t.live)) return undefined;
    const team = autoTeam(walk.teams);
    return team ? { team: team.name, lead: team.leadSessionId } : undefined;
  };

  const shows = (target: Target): boolean =>
    'team' in target ? target.team === currentTeam : currentTeam === '' && target.session === currentSession;

  const moveTo = (target: Target): Promise<void> =>
    'team' in target ? retarget(target.team, target.lead) : retargetSession(target.session);
```

7. Replace the whole `const selectSession = async (sessionId: string): Promise<SelectTeamOutcome> => { ... };` with:

```ts
  const selectSession = async (sessionId: string): Promise<SelectTeamOutcome> => {
    if (switching) {
      return {
        ok: false,
        reason: 'busy',
        message: `a team switch is already running — retry ${sessionId}`,
      };
    }
    switching = true;
    try {
      const walk = await walkTeams(teamsRoot, sessionsRoot, sessionId, projectsRoot);
      const team = teamOfSession(walk.teams, walk.drivers, await forkChainOf(projectsRoot, sessionId));
      if (!team && !(await sessionProjectDir(projectsRoot, sessionId, walk.sessions.cwds.get(sessionId)))) {
        return { ok: false, reason: 'missing', message: `no session ${sessionId}` };
      }
      watch({ kind: 'session', id: sessionId });
      const target: Target = team ? { team: team.name, lead: team.leadSessionId || sessionId } : { session: sessionId };
      // Rebuilding what is already on screen would blank it for a whole sweep.
      if (shows(target)) return { ok: true, changed: false };
      await moveTo(target);
      return { ok: true, changed: true };
    } finally {
      switching = false;
      hub.publish();
    }
  };
```

8. In `followRealTeam`, replace everything from `const mine = teams.find((t) => t.current);` to the end of the function's `try { ... } finally { ... }` with:

```ts
    const mine = teams.find((t) => t.current);
    const facts = mine
      ? { sessionName: mine.goal, branch: mine.branch, mode: mine.mode }
      : await leadFactsOf(currentTeam ? leadSessionId : currentSession);
    // A switch that landed while the reads above awaited has set its own facts;
    // these are the previous target's.
    if (gen !== generation) return;
    leadFacts = facts;

    const target = await targetOf(walk);
    if (gen !== generation || !target || shows(target)) return;
    switching = true;
    try {
      logInfo(`following ${'team' in target ? target.team : target.session}`);
      await moveTo(target);
    } catch (err) {
      logError('follow', err);
    } finally {
      switching = false;
      hub.publish();
    }
```

Keep the long comment above `const mine` that explains why the listing's facts are cached.

- [ ] **Step 6: Run the wiring tests to see them pass**

Run: `npx tsc --noEmit && npx vitest run src/server/index.wiring.test.ts`
Expected: typecheck clean; every test passes, including `leaves nothing of the team it left behind, then or 400ms later`. If another test asserted team A's old cwd-derived branch, update its expectation to `fixture-branch-a` and say so in your report.

- [ ] **Step 7: Run the whole server suite**

Run: `npx vitest run src/server`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/server/index.ts src/shared/domain.ts src/server/index.wiring.test.ts
git commit -m "Follow a watch: a session is followed to its team, a picked team is held, auto shows the newest live one"
```

### Task 3: Build identity on /health and the frame

**Files:**
- Create: `src/server/build-info.ts`
- Create: `src/server/build-info.test.ts`
- Modify: `src/shared/domain.ts` (add `BuildInfo`, `TeamState.build`)
- Modify: `src/server/index.ts` (read at boot, refresh `installed` in the follower, stamp the frame)
- Modify: `src/server/http.ts` (`/health`)
- Test: `src/server/http.test.ts`

**Interfaces:**
- Consumes: `TeamState.watching` (Task 2); `StreamHub.clients` (`src/server/stream.ts`).
- Produces:
  - `export interface BuildInfo { version: string; kind: 'installed' | 'dev'; sha?: string; installed?: string; stale: boolean }` in `src/shared/domain.ts`.
  - `TeamState.build?: BuildInfo`.
  - `export function isOlderBuild(running: string, candidate: string): boolean`, `export function pluginRootOf(entry: string): string`, `export async function installedVersion(claudeHome: string): Promise<string | undefined>`, `export async function readBuildInfo(entry: string, claudeHome: string): Promise<BuildInfo>` in `src/server/build-info.ts`.
  - `/health` JSON: `{ ok: true, team, agents, version, build, sha?, watching, tabs }`.

Background: nothing on screen says which build is serving, and "I don't see it" came up in 8 sessions where the tab was an older build. The bundle runs from `<plugin root>/dist/server/index.js`; an installed plugin's root is under `<claude home>/plugins/cache/`, a working copy runs `<repo>/src/server/index.ts` (plugin root `<repo>/plugin`). `installed_plugins.json` lists installs per `name@marketplace` key, e.g. `"team8@grimoire": [{ "version": "1.0.43", ... }]`.

- [ ] **Step 1: Write the failing tests for build identity**

Create `src/server/build-info.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installedVersion, isOlderBuild, pluginRootOf, readBuildInfo, withInstalled } from './build-info';

let home: string;

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'build-info-'));
});

afterEach(async () => {
  await fs.rm(home, { recursive: true, force: true });
});

async function writeJson(file: string, value: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value));
}

describe('isOlderBuild', () => {
  it('compares releases numerically, not as text', () => {
    expect(isOlderBuild('1.0.9', '1.0.10')).toBe(true);
    expect(isOlderBuild('1.0.10', '1.0.9')).toBe(false);
    expect(isOlderBuild('1.2.0', '2.0.0')).toBe(true);
  });

  it('is false for the same release', () => {
    expect(isOlderBuild('1.0.43', '1.0.43')).toBe(false);
  });
});

describe('pluginRootOf', () => {
  it('finds the plugin root above the bundled server', () => {
    expect(pluginRootOf('/p/cache/team8/1.0.43/dist/server/index.js')).toBe('/p/cache/team8/1.0.43');
  });

  it("finds a working copy's plugin folder from the source entry", () => {
    expect(pluginRootOf('/code/team8/src/server/index.ts')).toBe('/code/team8/plugin');
  });
});

describe('installedVersion', () => {
  it('is the newest team8 install under any marketplace', async () => {
    await writeJson(path.join(home, 'plugins', 'installed_plugins.json'), {
      plugins: {
        'team8@team8': [{ version: '1.0.41' }],
        'team8@grimoire': [{ version: '1.0.43' }],
        'other@grimoire': [{ version: '9.9.9' }],
      },
    });

    expect(await installedVersion(home)).toBe('1.0.43');
  });

  it('is undefined when nothing lists team8', async () => {
    expect(await installedVersion(home)).toBeUndefined();
  });
});

describe('readBuildInfo', () => {
  it('reads an installed build and marks it stale when a newer one is installed', async () => {
    const root = path.join(home, 'plugins', 'cache', 'grimoire', 'team8', '1.0.42');
    await writeJson(path.join(root, '.claude-plugin', 'plugin.json'), { version: '1.0.42' });
    await writeJson(path.join(home, 'plugins', 'installed_plugins.json'), {
      plugins: { 'team8@grimoire': [{ version: '1.0.43' }] },
    });

    expect(await readBuildInfo(path.join(root, 'dist', 'server', 'index.js'), home)).toEqual({
      version: '1.0.42',
      kind: 'installed',
      installed: '1.0.43',
      stale: true,
    });
  });

  it('reads a working copy as dev with its commit, and never stale', async () => {
    const repo = path.join(home, 'repo');
    await writeJson(path.join(repo, 'plugin', '.claude-plugin', 'plugin.json'), { version: '1.0.44' });
    await fs.mkdir(path.join(repo, '.git', 'refs', 'heads'), { recursive: true });
    await fs.writeFile(path.join(repo, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    await fs.writeFile(path.join(repo, '.git', 'refs', 'heads', 'main'), '0123456789abcdef0123456789abcdef01234567\n');
    await writeJson(path.join(home, 'plugins', 'installed_plugins.json'), {
      plugins: { 'team8@grimoire': [{ version: '1.0.99' }] },
    });

    const info = await readBuildInfo(path.join(repo, 'src', 'server', 'index.ts'), home);

    expect(info).toMatchObject({ version: '1.0.44', kind: 'dev', sha: '0123456', stale: false });
  });
});

describe('withInstalled', () => {
  it('clears stale once the installed version catches up', () => {
    const stale = { version: '1.0.42', kind: 'installed' as const, installed: '1.0.43', stale: true };
    expect(withInstalled(stale, '1.0.42')).toEqual({ version: '1.0.42', kind: 'installed', installed: '1.0.42', stale: false });
  });
});
```

In `src/server/http.test.ts`, add before `describe('POST /api/shutdown', ...)`:

```ts
describe('GET /health', () => {
  it('reports the build, the watch and how many tabs are open', async () => {
    const { server, url } = await boot(false);
    try {
      state = {
        ...state,
        build: { version: '1.0.44', kind: 'installed', stale: false },
        watching: { kind: 'session', id: 'abc-123' },
      };

      expect(await (await fetch(`${url}/health`)).json()).toEqual({
        ok: true,
        team: state.teamName,
        agents: 0,
        version: '1.0.44',
        build: 'installed',
        watching: { kind: 'session', id: 'abc-123' },
        tabs: 0,
      });
    } finally {
      await shutdown(server);
    }
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/server/build-info.test.ts src/server/http.test.ts -t "isOlderBuild|pluginRootOf|installedVersion|readBuildInfo|withInstalled|GET /health"`
Expected: FAIL — `./build-info` does not resolve; `/health` lacks the new fields.

- [ ] **Step 3: Add `BuildInfo` to the frame type**

In `src/shared/domain.ts`, directly above `export interface TeamState`, add:

```ts
/** Which build is serving, for the header chip and `/health`. */
export interface BuildInfo {
  version: string;
  /** `dev` is a server run from a working copy rather than the plugin cache. */
  kind: 'installed' | 'dev';
  /** A working copy's commit. */
  sha?: string;
  /** The newest team8 version installed_plugins.json lists. */
  installed?: string;
  /** An installed build older than the installed version. */
  stale: boolean;
}
```

and inside `interface TeamState`, directly below the `watching?: Watching;` line from Task 2:

```ts
  build?: BuildInfo;
```

- [ ] **Step 4: Write `src/server/build-info.ts`**

```ts
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { BuildInfo } from '../shared/domain';
import { readJsonSafe } from './watch/jsonfile';

/** True when release `running` is older than `candidate`, comparing major.minor.patch as numbers. */
export function isOlderBuild(running: string, candidate: string): boolean {
  const a = running.split('.').map(Number);
  const b = candidate.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
  }
  return false;
}

/**
 * The plugin root a server entry belongs to: the bundle sits at
 * <root>/dist/server/index.js, and a working copy runs <repo>/src/server/index.ts
 * with its plugin at <repo>/plugin.
 */
export function pluginRootOf(entry: string): string {
  const up = path.resolve(path.dirname(entry), '..');
  return path.basename(up) === 'dist' ? path.dirname(up) : path.resolve(up, '..', 'plugin');
}

/** The newest team8 version installed_plugins.json lists, under any marketplace. */
export async function installedVersion(claudeHome: string): Promise<string | undefined> {
  const doc = await readJsonSafe<{ plugins?: Record<string, unknown> }>(
    path.join(claudeHome, 'plugins', 'installed_plugins.json'),
  );
  let newest: string | undefined;
  for (const [key, installs] of Object.entries(doc?.plugins ?? {})) {
    if (!key.startsWith('team8@') || !Array.isArray(installs)) continue;
    for (const install of installs as { version?: unknown }[]) {
      const v = install?.version;
      if (typeof v === 'string' && (newest === undefined || isOlderBuild(newest, v))) newest = v;
    }
  }
  return newest;
}

/** HEAD's commit, short, read from the files so no git process is spawned. */
async function shaOf(repo: string): Promise<string | undefined> {
  try {
    const head = (await fs.readFile(path.join(repo, '.git', 'HEAD'), 'utf8')).trim();
    const ref = /^ref: (.+)$/.exec(head)?.[1];
    const sha = ref ? (await fs.readFile(path.join(repo, '.git', ref), 'utf8')).trim() : head;
    return /^[0-9a-f]{7,}$/.test(sha) ? sha.slice(0, 7) : undefined;
  } catch {
    return undefined;
  }
}

/** An installed build is stale once a newer version is installed; a dev build never is. */
export function withInstalled(info: BuildInfo, installed: string | undefined): BuildInfo {
  return {
    ...info,
    installed,
    stale: info.kind === 'installed' && installed !== undefined && isOlderBuild(info.version, installed),
  };
}

export async function readBuildInfo(entry: string, claudeHome: string): Promise<BuildInfo> {
  const root = pluginRootOf(entry);
  const manifest = await readJsonSafe<{ version?: unknown }>(path.join(root, '.claude-plugin', 'plugin.json'));
  const version = typeof manifest?.version === 'string' ? manifest.version : '0.0.0';
  const kind = root.startsWith(path.join(claudeHome, 'plugins', 'cache') + path.sep) ? 'installed' : 'dev';
  const sha = kind === 'dev' ? await shaOf(path.dirname(root)) : undefined;
  return withInstalled({ version, kind, ...(sha ? { sha } : {}), stale: false }, await installedVersion(claudeHome));
}
```


- [ ] **Step 5: Serve it on `/health` and the frame**

In `src/server/http.ts`, replace the `/health` branch with:

```ts
        if (method === 'GET' && route === '/health') {
          const s = deps.state();
          json(res, 200, {
            ok: true,
            team: s.teamName,
            agents: s.agents.length,
            version: s.build?.version,
            build: s.build?.kind,
            sha: s.build?.sha,
            watching: s.watching,
            tabs: deps.stream.clients,
          });
          return;
        }
```

In `src/server/index.ts`:

1. Add imports: `import { fileURLToPath } from 'node:url';` and `import { installedVersion, readBuildInfo, withInstalled } from './build-info';`.
2. Directly above `let watching: Watching` (Task 2), add:

```ts
  let build = await readBuildInfo(fileURLToPath(import.meta.url), cli.claudeHome);
```

3. In `publish`, add `build,` directly below `watching,`.
4. In `followRealTeam`, directly after the `listTeamSummaries(...)` call, add:

```ts
    // `claude plugin update` can land a newer build while this one serves.
    build = withInstalled(build, await installedVersion(cli.claudeHome));
```

- [ ] **Step 6: Run them to see them pass**

Run: `npx tsc --noEmit && npx vitest run src/server/build-info.test.ts src/server/http.test.ts src/server/index.wiring.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/build-info.ts src/server/build-info.test.ts src/shared/domain.ts src/server/http.ts src/server/http.test.ts src/server/index.ts
git commit -m "Report the serving build, the watch and the open tabs on /health and the frame"
```

### Task 4: Console record, no self-shutdown, boot failure exits

**Files:**
- Create: `src/server/console-record.ts`
- Create: `src/server/console-record.test.ts`
- Modify: `src/server/index.ts` (write the record in `watch` and at boot; drop the reaper; `main().catch`)
- Modify: `src/server/lifecycle.ts` (delete `startIdleReaper`, `hasLiveTeam`, `teamConfigExists`)
- Modify: `src/server/lifecycle.test.ts` (delete their tests)
- Modify: `src/server/ingest/hooks.ts` (delete the SessionEnd shutdown and the `onShutdown` dep)
- Modify: `src/server/ingest/hooks.test.ts`
- Test: `src/server/index.wiring.test.ts`

**Interfaces:**
- Consumes: `watch` (Task 2), `BuildInfo.version` (Task 3).
- Produces:
  - `export interface ConsoleRecord { pid: number; port: number; version: string; watching: Watching }`, `export function recordPathFor(dbPath: string): string`, `export async function writeConsoleRecord(file: string, record: ConsoleRecord): Promise<void>` in `src/server/console-record.ts`.
  - The file `<claude home>/team8/console.json`, rewritten at boot and on every watch change.

Background: the user decided the console never shuts itself down. Today it exits 10 minutes after no team looks live (`startIdleReaper` in `lifecycle.ts`), and when its lead's session ends (the SessionEnd branch in `ingest/hooks.ts`). Both go. In their place the server records what it watches, so `console-restart.sh` (Task 5) can bring a crashed console back on the same target. Separately, the server now holds the port before it reads `~/.claude`, so a throw during that read (e.g. `openStore` failing) leaves the port answering 503 forever unless the process exits.

- [ ] **Step 1: Write the failing tests**

Create `src/server/console-record.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { recordPathFor, writeConsoleRecord } from './console-record';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'record-'));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('console record', () => {
  it('sits beside the store, where the scripts read it', () => {
    expect(recordPathFor('/home/me/.claude/team8/events.db')).toBe('/home/me/.claude/team8/console.json');
  });

  it('replaces the whole record and leaves no temporary file behind', async () => {
    const file = path.join(dir, 'team8', 'console.json');
    await writeConsoleRecord(file, { pid: 1, port: 4823, version: '1.0.44', watching: { kind: 'auto' } });
    await writeConsoleRecord(file, { pid: 1, port: 4823, version: '1.0.44', watching: { kind: 'team', name: 't' } });

    expect(JSON.parse(await fs.readFile(file, 'utf8')).watching).toEqual({ kind: 'team', name: 't' });
    expect(await fs.readdir(path.dirname(file))).toEqual(['console.json']);
  });
});
```

In `src/server/ingest/hooks.test.ts`, add `vi` to the vitest import, then replace the whole `describe('SessionEnd', () => { ... });` block with:

```ts
describe('SessionEnd', () => {
  it("never shuts the console down, not even for the lead's own session", async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    try {
      const withLead = createHookHandlers({ store, permits, leadSessionId: () => 'lead-session-id' });
      await withLead.hook({ hook_event_name: 'SessionEnd', session_id: 'lead-session-id' });
      await new Promise((r) => setTimeout(r, 400));

      expect(exit).not.toHaveBeenCalled();
      expect(of(store.replay(), 'hook')).toHaveLength(1);
    } finally {
      exit.mockRestore();
    }
  });
});
```

In the test `'is not dropped for a SessionEnd, so a foreign session end still reaches the SessionEnd branch'` just above it, delete the `ended` array, the `onShutdown: () => ended.push('shutdown'),` option and the `expect(ended).toEqual([]);` line; keep the hook-count assertion.

In `src/server/index.wiring.test.ts`, inside `describe('which team a console boots onto', ...)`, add:

```ts
  async function readRecord(dir: string): Promise<{ port: number; watching: unknown }> {
    const file = path.join(dir, 'team8', 'console.json');
    const until = Date.now() + 2000;
    for (;;) {
      try {
        return JSON.parse(await fs.readFile(file, 'utf8')) as { port: number; watching: unknown };
      } catch (err) {
        if (Date.now() > until) throw err;
        await new Promise((r) => setTimeout(r, 50));
      }
    }
  }

  it('records what it watches, and rewrites the record when the watch moves', async () => {
    home = await layout();
    const url = await boot(home);

    expect(await readRecord(home)).toMatchObject({ port: Number(new URL(url).port), watching: { kind: 'team', name: TEAM } });

    await selectSession(url, LEAD_SESSION_B);
    expect((await readRecord(home)).watching).toEqual({ kind: 'session', id: LEAD_SESSION_B });
  }, 20_000);

  it('a console that fails while starting exits instead of holding the port', async () => {
    const dir = await emptyHome();
    // A file where the store's directory belongs, so opening the store throws.
    await fs.writeFile(path.join(dir, 'team8'), 'not a directory');

    const code = await new Promise<number | null>((resolve) => {
      spawn(process.execPath, [TSX, ENTRY, '--claude-home', dir, '--port', '0'], { stdio: 'ignore' }).on('exit', resolve);
    });

    expect(code).toBe(1);
  }, 20_000);
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/server/console-record.test.ts src/server/ingest/hooks.test.ts src/server/index.wiring.test.ts -t "console record|SessionEnd|records what it watches|fails while starting"`
Expected: FAIL — `./console-record` does not resolve; `process.exit` is called for the lead's SessionEnd; no `console.json`; the failing boot times out at 20 s instead of exiting.

- [ ] **Step 3: Write `src/server/console-record.ts`**

```ts
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Watching } from '../shared/domain';

export interface ConsoleRecord {
  pid: number;
  port: number;
  version: string;
  watching: Watching;
}

/** Beside the store, under <claude home>/team8/. */
export function recordPathFor(dbPath: string): string {
  return path.join(path.dirname(dbPath), 'console.json');
}

let seq = 0;

/** Written whole and then renamed, so a script never reads half a record. */
export async function writeConsoleRecord(file: string, record: ConsoleRecord): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  // One temp name per write: two watch changes in a row must not share a file.
  const tmp = `${file}.${process.pid}.${++seq}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(record));
  await fs.rename(tmp, file);
}
```

- [ ] **Step 4: Record the watch, and stop shutting down**

In `src/server/index.ts`:

1. Add the import `import { recordPathFor, writeConsoleRecord } from './console-record';`.
2. Replace `const watch = (next: Watching): void => { watching = next; };` (Task 2) with:

```ts
  const record = recordPathFor(cli.dbPath);
  const watch = (next: Watching): void => {
    watching = next;
    // What console-restart.sh and console-hint.sh reopen after a crash or an upgrade.
    void writeConsoleRecord(record, { pid: process.pid, port, version: build.version, watching }).catch((err: unknown) =>
      logError('console record', err),
    );
  };
  watch(watching);
```

3. Delete `let reaper: { stop(): void } | null = null;`, the `reaper?.stop();` line in `stop`, and the whole `reaper = startIdleReaper({ ... });` statement. Remove `startIdleReaper` from the `./lifecycle` import.
4. In the `createHookHandlers({ ... })` call, delete `onShutdown: stop,`. Keep the `onShutdown: stop,` passed to the HTTP handler — `/api/shutdown` still stops the console, and Tasks 6 and 7 rely on it.
5. Replace the doc comment above `export const IDLE_GRACE_MS` with:

```ts
/**
 * How recently a team's files must have moved for it to read as live, in the
 * picker and for the `auto` watch.
 */
```

6. Replace the entry point at the bottom of the file:

```ts
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  // The port is held from the first second, so a throw while reading
  // ~/.claude would otherwise leave it answering 503 with nothing behind it,
  // and no hook would ever restart it.
  main(process.argv.slice(2)).catch((err: unknown) => {
    logError('boot failed', err);
    process.exit(1);
  });
}
```

In `src/server/lifecycle.ts`, delete `hasLiveTeam`, `teamConfigExists` and `startIdleReaper` with their doc comments, and any import only they used. In `src/server/lifecycle.test.ts`, delete `describe('hasLiveTeam', ...)` and `describe('startIdleReaper', ...)`, and remove both names from the `./lifecycle` import.

In `src/server/ingest/hooks.ts`, delete the `onShutdown?: () => void;` member and its comment from the deps interface, the `const shutdown = ...` block, and the whole `if (event === 'SessionEnd') { ... }` block with its comment. Remove `logInfo` from the imports if nothing else uses it.

- [ ] **Step 5: Run them to see them pass**

Run: `npx tsc --noEmit && npx vitest run src/server`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/console-record.ts src/server/console-record.test.ts src/server/index.ts src/server/lifecycle.ts src/server/lifecycle.test.ts src/server/ingest/hooks.ts src/server/ingest/hooks.test.ts src/server/index.wiring.test.ts
git commit -m "Record what the console watches; never shut down on our own; exit if startup fails"
```

### Task 5: Shared script helpers and restart after a crash

**Files:**
- Create: `plugin/bin/console-lib.sh`
- Create: `fixtures/fake-console/server.cjs`
- Create: `src/server/console-scripts.test.ts`
- Modify: `plugin/bin/console-restart.sh`
- Modify: `plugin/bin/console-launch.sh`
- Modify: `plugin/hooks/hooks.json` (description only)
- Test: `src/server/launcher.test.ts`

**Interfaces:**
- Consumes: `console.json` `{ pid, port, version, watching }` (Task 4); `/health` answering 503 while starting (already in `main()`).
- Produces (all in `plugin/bin/console-lib.sh`, sourced as `. "$(dirname "$0")/console-lib.sh"` after `PORT`, `CLAUDE_DIR` and `ROOT` are set):
  - `console_up` — exit 0 when anything answers `/health`, 503 included.
  - `health_field <name>` — prints one field of a 200 `/health`, or nothing.
  - `is_older <a> <b>` — exit 0 when release `a` is older than `b`.
  - `recorded_flags` — prints `--session <id>`, `--team <name>`, or nothing.
  - `start_console [flags...]` — starts `$ROOT/dist/server/index.js --port $PORT [flags...]` detached.
  - `stop_console` — kills every `dist/server/index.js --port $PORT` process and waits until nothing answers.
- `fixtures/fake-console/server.cjs`: a stand-in console the script tests start and inspect.
- `src/server/console-scripts.test.ts` helpers Tasks 6 and 7 reuse: `fake(opts)`, `startRunning()`, `script(name, args?, stdin?)`, `starts()`, `posts()`, `waitFor(pred, ms)`.

Background: three scripts start the console today, each with its own copy of the port, health and spawn lines. `console-restart.sh` restarts only "if a team is still live", counting leftover team directories, and `curl -sf` treats a console that is still starting (503) as absent, so every hook during startup spawned another. The helpers are sourced from **the script's own directory**, never from `$ROOT`: tests and the launcher point `$ROOT` at plugin roots that hold only `dist/`.

- [ ] **Step 1: Add the stand-in console**

Create `fixtures/fake-console/server.cjs`:

```js
// A stand-in console for the script tests, copied to <root>/dist/server/index.js.
// It answers /health from <root>/fake.json and appends every start's arguments
// and every POST path to <root>/starts.log and <root>/posts.log.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const argv = process.argv.slice(2);
fs.appendFileSync(path.join(root, 'starts.log'), `${argv.join(' ')}\n`);
const port = Number(argv[argv.indexOf('--port') + 1]);
const config = JSON.parse(fs.readFileSync(path.join(root, 'fake.json'), 'utf8'));

http
  .createServer((req, res) => {
    if (req.method === 'POST') {
      fs.appendFileSync(path.join(root, 'posts.log'), `${req.url}\n`);
      res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
      if (req.url === '/api/shutdown') setTimeout(() => process.exit(0), 20);
      return;
    }
    const status = config.status ?? 200;
    const body = status === 200 ? { ok: true, team: '', agents: 0, tabs: 0, ...config.health } : {};
    res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  })
  .listen(port, '127.0.0.1');
```

- [ ] **Step 2: Write the failing script tests**

Create `src/server/console-scripts.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFile, spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../../plugin/bin/', import.meta.url));
const FAKE = fileURLToPath(new URL('../../fixtures/fake-console/server.cjs', import.meta.url));

let claudeDir = '';
let root = '';
let port = 0;

async function freePort(): Promise<number> {
  const srv = net.createServer();
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const { port: p } = srv.address() as net.AddressInfo;
  await new Promise((r) => srv.close(r));
  return p;
}

beforeEach(async () => {
  claudeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scripts-home-'));
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'scripts-root-'));
  await fs.mkdir(path.join(root, 'dist', 'server'), { recursive: true });
  await fs.copyFile(FAKE, path.join(root, 'dist', 'server', 'index.js'));
  port = await freePort();
  await fake({});
});

afterEach(async () => {
  await new Promise((r) => execFile('pkill', ['-f', `dist/server/index.js --port ${port}`], r));
  await fs.rm(claudeDir, { recursive: true, force: true });
  await fs.rm(root, { recursive: true, force: true });
});

/** What the stand-in reports, and the version the scripts' own plugin root carries. */
async function fake(opts: { status?: number; health?: Record<string, unknown>; plugin?: string }) {
  await fs.writeFile(path.join(root, 'fake.json'), JSON.stringify({ status: opts.status, health: opts.health ?? {} }));
  await fs.mkdir(path.join(root, '.claude-plugin'), { recursive: true });
  await fs.writeFile(path.join(root, '.claude-plugin', 'plugin.json'), JSON.stringify({ version: opts.plugin ?? '1.0.44' }));
}

async function record(watching: unknown) {
  await fs.mkdir(path.join(claudeDir, 'team8'), { recursive: true });
  await fs.writeFile(
    path.join(claudeDir, 'team8', 'console.json'),
    JSON.stringify({ pid: 1, port, version: '1.0.44', watching }),
  );
}

function script(
  name: string,
  args: string[] = [],
  stdin = '',
  env: Record<string, string> = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = execFile(
      path.join(BIN, name),
      args,
      {
        env: {
          ...process.env,
          CLAUDE_CONFIG_DIR: claudeDir,
          OCTO_PORT: String(port),
          OCTO_ROOT: root,
          CLAUDE_PLUGIN_ROOT: root,
          ...env,
        },
      },
      (err, stdout, stderr) => resolve({ code: (err as { code?: number } | null)?.code ?? 0, stdout, stderr }),
    );
    child.stdin!.end(stdin);
  });
}

/** Starts the stand-in the way a real console runs, and waits until it answers. */
async function startRunning(): Promise<void> {
  spawn(process.execPath, [path.join(root, 'dist', 'server', 'index.js'), '--port', String(port)], {
    detached: true,
    stdio: 'ignore',
  }).unref();
  await waitFor(async () => (await fetch(`http://127.0.0.1:${port}/health`).catch(() => null)) !== null, 3000);
}

async function lines(file: string): Promise<string[]> {
  try {
    return (await fs.readFile(path.join(root, file), 'utf8')).split('\n').filter(Boolean);
  } catch {
    return [];
  }
}
const starts = () => lines('starts.log');
const posts = () => lines('posts.log');

async function waitFor(pred: () => Promise<boolean>, ms: number): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await pred()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return pred();
}

describe('console-restart.sh', () => {
  it('brings a console that died back on the watch it recorded, silently', async () => {
    await record({ kind: 'session', id: 'session-one' });

    const run = await script('console-restart.sh');

    expect(run).toEqual({ code: 0, stdout: '', stderr: '' });
    expect(await waitFor(async () => (await starts()).includes(`--port ${port} --session session-one`), 3000)).toBe(true);
  });

  it('restores a held team the same way', async () => {
    await record({ kind: 'team', name: 'session-abc' });

    await script('console-restart.sh');

    expect(await waitFor(async () => (await starts()).includes(`--port ${port} --team session-abc`), 3000)).toBe(true);
  });

  it('leaves a console that is still starting alone', async () => {
    await fake({ status: 503 });
    await record({ kind: 'auto' });
    await startRunning();

    const run = await script('console-restart.sh');
    await new Promise((r) => setTimeout(r, 500));

    expect(run).toEqual({ code: 0, stdout: '', stderr: '' });
    expect(await starts()).toHaveLength(1);
  });

  it('never starts a console that has never run on this machine', async () => {
    const run = await script('console-restart.sh');
    await new Promise((r) => setTimeout(r, 500));

    expect(run).toEqual({ code: 0, stdout: '', stderr: '' });
    expect(await starts()).toEqual([]);
  });
});
```

In `src/server/launcher.test.ts`:

1. Add `import net from 'node:net';` and give `launch` an env override:

```ts
function launch(payload: unknown, env: Record<string, string> = {}): Promise<Run> {
```

with `...env` spread last into the `env` object it passes to `execFile`.

2. Replace the test `"links a /branch'd lead's workflow to the team its ancestor leads"` with:

```ts
  it("links a /branch'd lead's workflow to its own session, which the console follows to the ancestor's team", async () => {
    const teamDir = path.join(claudeDir, 'teams', 'session-ancestor');
    await fs.mkdir(teamDir, { recursive: true });
    await fs.writeFile(
      path.join(teamDir, 'config.json'),
      JSON.stringify({ name: 'session-ancestor', leadSessionId: 'ancestor-session', members: [{ agentId: 'team-lead' }] }),
    );
    const projectDir = path.join(claudeDir, 'projects', process.cwd().replace(/[^a-zA-Z0-9]/g, '-'));
    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(
      path.join(projectDir, `${SESSION}.jsonl`),
      `${JSON.stringify({ forkedFrom: { sessionId: 'ancestor-session' } })}\n`,
    );

    const run = await launch({ hook_event_name: 'PostToolUse', session_id: SESSION, tool_name: 'Workflow' });

    expect(run.stdout).toContain(`/s/${SESSION}`);
    expect(run.stdout).not.toContain('?team=');
  });

  it('starts a workflow console on its session alone', async () => {
    const root = path.join(claudeDir, 'fake-root');
    await fs.mkdir(path.join(root, 'dist', 'server'), { recursive: true });
    const argsFile = path.join(claudeDir, 'server-args.json');
    await fs.writeFile(
      path.join(root, 'dist', 'server', 'index.js'),
      `require('node:fs').writeFileSync(${JSON.stringify(argsFile)}, JSON.stringify(process.argv.slice(2)));\n`,
    );
    const srv = net.createServer();
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    const port = String((srv.address() as net.AddressInfo).port);
    await new Promise((r) => srv.close(r));

    await launch(
      { hook_event_name: 'PostToolUse', session_id: SESSION, tool_name: 'Workflow' },
      { OCTO_NO_SPAWN: '', OCTO_ROOT: root, OCTO_PORT: port },
    );

    const until = Date.now() + 3000;
    while (Date.now() < until && !(await fs.stat(argsFile).catch(() => null))) await new Promise((r) => setTimeout(r, 50));
    expect(JSON.parse(await fs.readFile(argsFile, 'utf8'))).toEqual(['--port', port, '--session', SESSION]);
  });
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run src/server/console-scripts.test.ts src/server/launcher.test.ts`
Expected: FAIL — the restart script ignores `console.json` (it checks for live teams) and starts nothing; the workflow announce still links `?team=session-ancestor`; the workflow start passes `--team`.

- [ ] **Step 4: Write `plugin/bin/console-lib.sh`**

```sh
# Shared by the console scripts. POSIX sh, sourced after PORT, CLAUDE_DIR and
# ROOT are set:
#   . "$(dirname "$0")/console-lib.sh"
# From the script's own directory, never $ROOT: tests and the launcher point
# $ROOT at plugin roots that hold only dist/.

HEALTH="http://127.0.0.1:$PORT/health"
RECORD="$CLAUDE_DIR/team8/console.json"

# Anything answering counts, a 503 included: a console still reading ~/.claude
# is up, and starting another would only race it for the port.
console_up() {
  code=$(curl -s -o /dev/null -m 1 -w '%{http_code}' "$HEALTH" 2>/dev/null)
  [ -n "$code" ] && [ "$code" != 000 ]
}

# One field of a ready console's /health, or nothing.
health_field() {
  curl -sf -m 1 "$HEALTH" 2>/dev/null | node -e '
    let s = "";
    process.stdin.on("data", (d) => (s += d)).on("end", () => {
      try {
        const v = JSON.parse(s)[process.argv[1]];
        if (v !== undefined && v !== null) process.stdout.write(String(v));
      } catch {}
    });' "$1" 2>/dev/null
}

# Exit 0 when release $1 is older than release $2.
is_older() {
  node -e '
    const p = (v) => v.split(".").map(Number);
    const [a, b] = [p(process.argv[1]), p(process.argv[2])];
    for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) process.exit((a[i] || 0) < (b[i] || 0) ? 0 : 1);
    process.exit(1);' "$1" "$2" 2>/dev/null
}

# The flags that reopen what the last console watched: --session <id>,
# --team <name>, or nothing.
recorded_flags() {
  [ -f "$RECORD" ] || return 0
  node -e '
    try {
      const w = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).watching;
      if (w && w.kind === "session") process.stdout.write("--session " + w.id);
      else if (w && w.kind === "team") process.stdout.write("--team " + w.name);
    } catch {}' "$RECORD" 2>/dev/null
}

# Detached, so it outlives the hook or command that started it. Falls back to
# tsx so a fresh checkout works without a build.
start_console() {
  if [ -f "$ROOT/dist/server/index.js" ]; then
    nohup node "$ROOT/dist/server/index.js" --port "$PORT" "$@" >>"$CLAUDE_DIR/team8.log" 2>&1 &
  else
    nohup npx --prefix "$ROOT/.." tsx "$ROOT/../src/server/index.ts" --port "$PORT" "$@" >>"$CLAUDE_DIR/team8.log" 2>&1 &
  fi
}

# Every console on this port, the one answering and any stragglers, then wait
# until nothing answers. Matched on the port, not the plugin path, so a
# working-copy build is stopped too.
stop_console() {
  pkill -f "dist/server/index.js --port $PORT( |\$)" 2>/dev/null
  i=0
  while [ "$i" -lt 30 ] && console_up; do
    sleep 0.1
    i=$((i + 1))
  done
}
```

- [ ] **Step 5: Rewrite `plugin/bin/console-restart.sh`**

Replace everything after the header comment (from `set -u` to the end) with:

```sh
set -u

PORT="${OCTO_PORT:-4823}"
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
# Never the cwd: the hook inherits the Claude session's cwd — the user's
# project, not this checkout.
ROOT="${OCTO_ROOT:-${CLAUDE_PLUGIN_ROOT:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}}"
. "$(dirname "$0")/console-lib.sh"

console_up && exit 0

# The console never stops on its own, so nothing answering means it crashed or
# was killed. Without a record it has never run here: only a team spawn, a
# workflow or /team8:console starts it the first time.
[ -f "$RECORD" ] || exit 0

# A burst of tool calls puts every hook on this line at the same instant, so the
# spawn sits behind an atomic mkdir. A lock left behind by a killed hook would
# block every later restart, so one older than a minute is cleared rather than
# trusted.
lock="$CLAUDE_DIR/team8/restarting"
mkdir -p "$CLAUDE_DIR/team8" 2>/dev/null
[ -n "$(find "$lock" -maxdepth 0 -mmin +1 2>/dev/null)" ] && rmdir "$lock" 2>/dev/null
mkdir "$lock" 2>/dev/null || exit 0

# Word-split on purpose: recorded_flags prints one flag and one id.
# shellcheck disable=SC2046
start_console $(recorded_flags)

# Hold the lock until it answers so a burst collapses into one spawn; the
# console holds its port within its first second.
i=0
while [ "$i" -lt 15 ]; do
  console_up && break
  sleep 0.1
  i=$((i + 1))
done
rmdir "$lock" 2>/dev/null
exit 0
```

Keep the header comment's CONTRACT paragraph; delete its sentences about teams being live.

- [ ] **Step 6: Point `plugin/bin/console-launch.sh` at the helpers**

1. Replace the line `HEALTH="http://127.0.0.1:$PORT/health"` with `. "$(dirname "$0")/console-lib.sh"`.
2. Replace the block that starts `if ! curl -sf -m 1 "$HEALTH" >/dev/null 2>&1; then` and ends at its matching `fi` with:

```sh
if ! console_up; then
  if [ "${OCTO_NO_SPAWN:-}" != "1" ]; then
    # A workflow names its session and nothing else: the server follows the
    # session to whatever team it drives, /branch ancestors included.
    if [ "$workflow" = 1 ]; then
      start_console --session "$session"
    elif [ -n "$team" ]; then
      start_console --team "$team"
    else
      start_console
    fi
    i=0
    while [ "$i" -lt 15 ]; do
      console_up && break
      sleep 0.1
      i=$((i + 1))
    done
  fi
fi
```

3. In the announce at the end, test the workflow first so a workflow always links its session:

```sh
if [ "$workflow" = 1 ]; then
  printf '{"systemMessage":"Workflow console → http://127.0.0.1:%s/s/%s"}\n' "$PORT" "$session"
elif [ -n "$team" ]; then
  printf '{"systemMessage":"team8 → http://127.0.0.1:%s/?team=%s"}\n' "$PORT" "$team"
else
  printf '{"systemMessage":"team8 → http://127.0.0.1:%s/"}\n' "$PORT"
fi
```

- [ ] **Step 7: Update the hooks description**

In `plugin/hooks/hooks.json`, in the top-level `"description"` string, replace `which brings the console back when a team is still live and stays silent either way` with `which brings a crashed console back on what it last watched and stays silent either way`, and replace `SessionStart also runs console-hint.sh, a pure systemMessage nudge toward /team8:console — it never starts the server itself, so a session that never spawns a team or workflow still learns the console exists without one running idle.` with `SessionStart also runs console-hint.sh, which replaces a console running an older build than the session loaded and otherwise only nudges toward /team8:console.` Keep the `—` escapes the file already uses.

- [ ] **Step 8: Run them to see them pass**

Run: `npx vitest run src/server/console-scripts.test.ts src/server/launcher.test.ts src/server/lifecycle.test.ts src/server/setup.test.ts`
Expected: PASS. `lifecycle.test.ts` holds the launcher's older tests and must stay green untouched.

- [ ] **Step 9: Commit**

```bash
git add plugin/bin/console-lib.sh plugin/bin/console-restart.sh plugin/bin/console-launch.sh plugin/hooks/hooks.json fixtures/fake-console/server.cjs src/server/console-scripts.test.ts src/server/launcher.test.ts
git commit -m "Share the console script helpers; restart a crashed console on its recorded watch"
```

### Task 6: Replace an older console on session start

**Files:**
- Modify: `plugin/bin/console-hint.sh`
- Test: `src/server/console-scripts.test.ts`

**Interfaces:**
- Consumes: `console_up`, `health_field`, `is_older`, `recorded_flags`, `start_console`, `stop_console` (Task 5); `/health` `version` and `build` (Task 3).
- Produces: nothing other tasks read.

Background: the user chose automatic replacement — when a session starts with a newer build than the console on the port, the console is replaced, keeping what it showed. Never a downgrade, never a `dev` console, never a console still starting (503: it cannot say its build yet). A console from before `/health` carried a version is older by definition. SessionStart's hook timeout is 5 s, so the script never waits for the new console to finish starting.

- [ ] **Step 1: Write the failing tests**

In `src/server/console-scripts.test.ts`, add:

```ts
describe('console-hint.sh', () => {
  const systemMessage = (stdout: string) => (JSON.parse(stdout) as { systemMessage: string }).systemMessage;

  it('replaces a console running an older build, on the watch it recorded', async () => {
    await fake({ health: { version: '1.0.43', build: 'installed' }, plugin: '1.0.44' });
    await record({ kind: 'session', id: 'session-one' });
    await startRunning();

    const run = await script('console-hint.sh', [], '{}');

    expect(run.code).toBe(0);
    expect(systemMessage(run.stdout)).toContain('1.0.44');
    expect(await waitFor(async () => (await starts())[1] === `--port ${port} --session session-one`, 3000)).toBe(true);
  });

  it('replaces a console from before builds reported themselves', async () => {
    await fake({ health: {}, plugin: '1.0.44' });
    await record({ kind: 'auto' });
    await startRunning();

    await script('console-hint.sh', [], '{}');

    expect(await waitFor(async () => (await starts()).length === 2, 3000)).toBe(true);
  });

  it('leaves a console of the same or a newer build alone', async () => {
    for (const version of ['1.0.44', '1.0.45']) {
      await fake({ health: { version, build: 'installed' }, plugin: '1.0.44' });
      await startRunning();

      const run = await script('console-hint.sh', [], '{}');

      expect(systemMessage(run.stdout)).toContain('/team8:console');
      await new Promise((r) => setTimeout(r, 300));
      expect(await starts()).toHaveLength(1);
      await new Promise((r) => execFile('pkill', ['-f', `dist/server/index.js --port ${port}`], r));
      await fs.rm(path.join(root, 'starts.log'), { force: true });
      await waitFor(async () => (await fetch(`http://127.0.0.1:${port}/health`).catch(() => null)) === null, 3000);
    }
  });

  it('never replaces a dev console, or one still starting', async () => {
    await fake({ health: { version: '1.0.1', build: 'dev' }, plugin: '1.0.44' });
    await startRunning();
    await script('console-hint.sh', [], '{}');
    await new Promise((r) => setTimeout(r, 300));
    expect(await starts()).toHaveLength(1);
  });

  it('leaves a console that is still starting alone', async () => {
    await fake({ status: 503, plugin: '1.0.44' });
    await startRunning();
    await script('console-hint.sh', [], '{}');
    await new Promise((r) => setTimeout(r, 300));
    expect(await starts()).toHaveLength(1);
  });

  it('never starts a console that is not running', async () => {
    const run = await script('console-hint.sh', [], '{}');
    await new Promise((r) => setTimeout(r, 300));

    expect(run.code).toBe(0);
    expect(systemMessage(run.stdout)).toContain('/team8:console');
    expect(await starts()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/server/console-scripts.test.ts -t "console-hint.sh"`
Expected: FAIL — the two replacement tests find only one start; the others pass already.

- [ ] **Step 3: Rewrite `plugin/bin/console-hint.sh`**

Replace the whole file with:

```sh
#!/bin/sh
# SessionStart: replace a console running an older build than the one this
# session loaded, so an update reaches the screen without a manual restart.
# Never a downgrade, never a dev console, never one still starting, and never
# a console that is not running at all. Otherwise a nudge toward
# /team8:console. Output is one systemMessage line; always exits 0.
set -u

PORT="${OCTO_PORT:-4823}"
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
ROOT="${OCTO_ROOT:-${CLAUDE_PLUGIN_ROOT:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}}"
. "$(dirname "$0")/console-lib.sh"
cat >/dev/null 2>&1

mine=$(node -e 'try { process.stdout.write(String(require(process.argv[1]).version || "")) } catch {}' \
  "$ROOT/.claude-plugin/plugin.json" 2>/dev/null)

# `ok` only comes from a console that has finished starting and can name its build.
if [ -n "$mine" ] && [ -n "$(health_field ok)" ]; then
  running=$(health_field version)
  build=$(health_field build)
  # A console from before builds reported themselves carries no version: older.
  if [ "$build" != dev ] && { [ -z "$running" ] || is_older "$running" "$mine"; }; then
    stop_console
    # Word-split on purpose: recorded_flags prints one flag and one id.
    # shellcheck disable=SC2046
    start_console $(recorded_flags)
    printf '{"systemMessage":"team8 console updated to %s"}\n' "$mine"
    exit 0
  fi
fi

echo '{"systemMessage":"team8 console available - run /team8:console to open it"}'
exit 0
```

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/server/console-scripts.test.ts src/server/setup.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/console-hint.sh src/server/console-scripts.test.ts
git commit -m "Replace an older console when a session starts with a newer build"
```

### Task 7: /team8:console opens on the calling session

**Files:**
- Create: `plugin/bin/console-open.sh`
- Modify: `plugin/commands/console.md`
- Test: `src/server/console-scripts.test.ts`

**Interfaces:**
- Consumes: the Task 5 helpers; `/health` `version`, `build`, `tabs` (Task 3); `POST /api/select-session/<id>` switching without a restart (Task 2).
- Produces: `console-open.sh <session-id>` prints `http://127.0.0.1:<port>/s/<session-id>` on its last line and exits 0, or explains on stderr and exits 1.

Background: today `/team8:console` kills whatever is on the port and starts a server with no session, and a hook usually restarts one first, so the console lands on a guessed team. The new command never restarts a console that is already current: it asks it to switch (`POST /api/select-session/<id>`), and every open tab follows because tabs rewrite their address from the frame (Task 8). It opens a tab only when `/health` reports `tabs: 0`. `OCTO_OPEN` overrides the opener, for tests.

- [ ] **Step 1: Write the failing tests**

In `src/server/console-scripts.test.ts`, add:

```ts
describe('console-open.sh', () => {
  const opener = async () => {
    const file = path.join(root, 'open.sh');
    await fs.writeFile(file, `#!/bin/sh\necho "$1" >> ${JSON.stringify(path.join(root, 'opened.log'))}\n`, { mode: 0o755 });
    return { OCTO_OPEN: file };
  };
  const url = (id: string) => `http://127.0.0.1:${port}/s/${id}`;
  const lastLine = (s: string) => s.trim().split('\n').at(-1);

  it('switches a running console of the same build to this session, without a restart', async () => {
    await fake({ health: { version: '1.0.44', build: 'installed', tabs: 1 }, plugin: '1.0.44' });
    await startRunning();

    const run = await script('console-open.sh', ['session-two'], '', await opener());

    expect(run.code).toBe(0);
    expect(lastLine(run.stdout)).toBe(url('session-two'));
    expect(await posts()).toContain('/api/select-session/session-two');
    expect(await starts()).toHaveLength(1);
    expect(await lines('opened.log')).toEqual([]);
  });

  it('replaces an older console with this build, started on this session', async () => {
    await fake({ health: { version: '1.0.43', build: 'installed', tabs: 1 }, plugin: '1.0.44' });
    await startRunning();

    const run = await script('console-open.sh', ['session-two'], '', await opener());

    expect(run.code).toBe(0);
    expect((await starts())[1]).toBe(`--port ${port} --session session-two`);
  });

  it('starts one on this session when none runs, and opens a tab when none is open', async () => {
    const run = await script('console-open.sh', ['session-two'], '', await opener());

    expect(run.code).toBe(0);
    expect(await starts()).toEqual([`--port ${port} --session session-two`]);
    expect(await lines('opened.log')).toEqual([url('session-two')]);
  });

  it('never replaces a dev console, only switches it', async () => {
    await fake({ health: { version: '1.0.1', build: 'dev', tabs: 1 }, plugin: '1.0.44' });
    await startRunning();

    await script('console-open.sh', ['session-two'], '', await opener());

    expect(await starts()).toHaveLength(1);
    expect(await posts()).toContain('/api/select-session/session-two');
  });

  it('refuses a session id that was never substituted', async () => {
    const run = await script('console-open.sh', ['${CLAUDE_SESSION_ID}']);

    expect(run.code).toBe(1);
    expect(run.stderr).toContain('not substituted');
    expect(await starts()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/server/console-scripts.test.ts -t "console-open.sh"`
Expected: FAIL — `plugin/bin/console-open.sh` does not exist.

- [ ] **Step 3: Write `plugin/bin/console-open.sh`**

```sh
#!/bin/sh
# What /team8:console runs:  console-open.sh <session-id>
# A ready console of the same or a newer build is switched to the session, and
# every open tab follows it. A missing console, or an older one, is replaced by
# this session's build, started on the session. With no tab open, one is
# opened. The last line printed is the session's URL.
set -u

SESSION="${1:-}"
PORT="${OCTO_PORT:-4823}"
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
ROOT="${OCTO_ROOT:-${CLAUDE_PLUGIN_ROOT:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}}"
. "$(dirname "$0")/console-lib.sh"

case "$SESSION" in
  '' | *'${'*)
    echo "no session id: \${CLAUDE_SESSION_ID} was not substituted" >&2
    exit 1
    ;;
esac

mine=$(node -e 'try { process.stdout.write(String(require(process.argv[1]).version || "")) } catch {}' \
  "$ROOT/.claude-plugin/plugin.json" 2>/dev/null)

# A console still starting cannot name its build yet; give it the time it needs.
wait_ready() {
  i=0
  while [ "$i" -lt 30 ] && console_up && [ -z "$(health_field ok)" ]; do
    sleep 1
    i=$((i + 1))
  done
}

if console_up; then
  wait_ready
  running=$(health_field version)
  build=$(health_field build)
  # A console from before builds reported themselves carries no version: older.
  if [ "$build" != dev ] && { [ -z "$running" ] || is_older "$running" "$mine"; }; then
    stop_console
  fi
fi

if ! console_up; then
  start_console --session "$SESSION"
  # The port is held within the console's first second.
  i=0
  while [ "$i" -lt 30 ] && ! console_up; do
    sleep 0.1
    i=$((i + 1))
  done
fi
wait_ready

if [ -z "$(health_field ok)" ]; then
  echo "the console did not come up; last lines of $CLAUDE_DIR/team8.log:" >&2
  tail -n 5 "$CLAUDE_DIR/team8.log" >&2 2>/dev/null
  exit 1
fi

# Answers once the switch has landed; a no-op when it is already here.
curl -s -m 10 -X POST -H 'content-type: application/json' -d '{}' \
  "http://127.0.0.1:$PORT/api/select-session/$SESSION" >/dev/null 2>&1

URL="http://127.0.0.1:$PORT/s/$SESSION"
if [ "$(health_field tabs)" = 0 ]; then
  if [ -n "${OCTO_OPEN:-}" ]; then
    "$OCTO_OPEN" "$URL"
  elif command -v open >/dev/null 2>&1; then
    open "$URL"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1
  fi
fi
echo "$URL"
```

Then `chmod +x plugin/bin/console-open.sh`.

- [ ] **Step 4: Rewrite `plugin/commands/console.md`**

Replace the whole file with:

````markdown
---
description: Open the team8 console on this session, starting or upgrading it only when needed
allowed-tools: ["Bash"]
---

# team8

Run this, then report its last line as the console URL in one line. Do not read
source files.

```bash
"${CLAUDE_PLUGIN_ROOT}/bin/console-open.sh" "${CLAUDE_SESSION_ID}"
```

It opens the console on the session running this command:

- a console already running the same or a newer build switches to this session,
  and every open tab follows it;
- a missing console, or one running an older build, is replaced by this
  session's build, started on this session;
- with no tab open, it opens one in the browser.

If `${CLAUDE_PLUGIN_ROOT}` or `${CLAUDE_SESSION_ID}` came through
unsubstituted, say so rather than guessing a path or an id. If the script exits
non-zero, show its stderr and stop.

Report:

> Console on this session: <URL>

The console never shuts itself down. It stays on this session until you pick
something else in its picker or run `/team8:console` from another session.
````

- [ ] **Step 5: Run them to see them pass**

Run: `npx vitest run src/server/console-scripts.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/console-open.sh plugin/commands/console.md src/server/console-scripts.test.ts
git commit -m "/team8:console opens on the calling session, switching a current console instead of restarting it"
```

### Task 8: Tabs follow the watched session, and the build chip

**Files:**
- Modify: `src/web/state/useTeamState.ts`
- Modify: `src/web/chrome/Bar.tsx`
- Modify: `src/web/chrome/StatusBar.tsx`
- Modify: `src/web/views/Workflow.tsx`
- Modify: `src/web/App.tsx`
- Test: `src/web/state/useTeamState.test.tsx`, `src/web/chrome/Bar.test.tsx`

**Interfaces:**
- Consumes: `TeamState.watching` (Task 2), `TeamState.build` and `BuildInfo` (Task 3).
- Produces: `BarProps.build?: BuildInfo`; `WorkflowProps.build?: BuildInfo`; `export function BuildChip({ build }: { build: BuildInfo })` in `src/web/chrome/Bar.tsx`.

Background: `useTeamState` already rewrites the tab's address from each frame (`writeUrlState(view, agent, team, run, lead)` with `lead = state.leadSessionId`), so a tab follows whatever the server shows. Two gaps: a re-keyed team's `leadSessionId` is a fresh id no session carries, so `/s/<lead>` reloads into nothing; and the header never says which build serves.

- [ ] **Step 1: Write the failing tests**

In `src/web/state/useTeamState.test.tsx`, add after the test `'writes the session on screen into the path, so a reload re-selects it'`:

```ts
it('writes the watched session into the path, not a re-keyed lead id no session carries', () => {
  renderHook(() => useTeamState());
  act(() =>
    MockEventSource.last().emit('snapshot', {
      ...sampleTeamState(),
      leadSessionId: 'fresh-id-nobody-has',
      watching: { kind: 'session', id: 'the-session' },
    }),
  );
  expect(window.location.pathname).toBe('/s/the-session');
});

it('follows the server to another session, so a reload lands where the console now is', () => {
  renderHook(() => useTeamState());
  act(() => MockEventSource.last().emit('snapshot', { ...sampleTeamState(), watching: { kind: 'session', id: 'session-a' } }));
  act(() => MockEventSource.last().emit('state', { ...sampleTeamState(), watching: { kind: 'session', id: 'session-b' } }));
  expect(window.location.pathname).toBe('/s/session-b');
});
```

In `src/web/chrome/Bar.test.tsx`, change the vitest import to `import { expect, it } from 'vitest';` plus `import { render, screen } from '@testing-library/react';`, add `BuildChip` to the `./Bar` import, and append:

```tsx
it('shows the installed version, and flags it once a newer one is installed', () => {
  const { rerender } = render(<BuildChip build={{ version: '1.0.44', kind: 'installed', stale: false }} />);
  expect(screen.getByTestId('bar-build').textContent).toBe('1.0.44');
  expect(screen.getByTestId('bar-build').getAttribute('data-stale')).toBe('false');

  rerender(<BuildChip build={{ version: '1.0.44', kind: 'installed', installed: '1.0.45', stale: true }} />);
  expect(screen.getByTestId('bar-build').getAttribute('data-stale')).toBe('true');
  expect(screen.getByTestId('bar-build').getAttribute('title')).toContain('1.0.45');
});

it("shows a working copy's commit", () => {
  render(<BuildChip build={{ version: '1.0.44', kind: 'dev', sha: 'abc1234', stale: false }} />);
  expect(screen.getByTestId('bar-build').textContent).toBe('dev · abc1234');
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/web/state/useTeamState.test.tsx src/web/chrome/Bar.test.tsx`
Expected: FAIL — the path is `/s/fresh-id-nobody-has`; `BuildChip` is not exported.

- [ ] **Step 3: Write the path from the watch**

In `src/web/state/useTeamState.ts`, replace `const lead = state?.leadSessionId ?? null;` with:

```ts
  // A watched session is what a reload must land back on: a re-keyed team's
  // lead id belongs to no session, so /s/<lead> would open nothing.
  const lead = (state?.watching?.kind === 'session' ? state.watching.id : state?.leadSessionId) ?? null;
```

- [ ] **Step 4: Add the chip**

In `src/web/chrome/Bar.tsx`, import `type BuildInfo` from `'../../shared/domain'`, and add above `export interface BarProps`:

```tsx
/** Which build serves. Amber once a newer one is installed, which the next new session switches to. */
export function BuildChip({ build }: { build: BuildInfo }) {
  const label = build.kind === 'dev' ? `dev · ${build.sha ?? '?'}` : build.version;
  return (
    <span
      data-testid="bar-build"
      data-stale={build.stale}
      title={
        build.stale
          ? `${build.installed} is installed; the next new session or /team8:console switches to it`
          : `team8 ${label}`
      }
      style={{ ...METRIC, fontSize: 11, color: build.stale ? 'var(--warn)' : 'var(--color-neutral-600)' }}
    >
      {label}
    </span>
  );
}
```

In `BarProps`, add below `appearance: SettingsStore;`:

```ts
  /** Which build serves; chrome like the config menu, so never shed. */
  build?: BuildInfo;
```

Add `build` to the destructured props of `Bar`, and render `{build && <BuildChip build={build} />}` directly above `<ConfigMenu`.

In `src/web/chrome/StatusBar.tsx`, pass `build={state.build}` to `<Bar`. In `src/web/views/Workflow.tsx`, add `build?: BuildInfo;` to `WorkflowProps` (import the type from `'../../shared/domain'`), destructure it, and pass `build={build}` to `<Bar`. In `src/web/App.tsx`, pass `build={state.build}` to `<Workflow`.

- [ ] **Step 5: Run the web tests**

Run: `npx tsc --noEmit && npx vitest run src/web`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/web/state/useTeamState.ts src/web/state/useTeamState.test.tsx src/web/chrome/Bar.tsx src/web/chrome/Bar.test.tsx src/web/chrome/StatusBar.tsx src/web/views/Workflow.tsx src/web/App.tsx
git commit -m "Tabs follow the watched session; the header shows the serving build"
```

### Task 9: CI stops gating plugin/dist

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `.gitattributes`
- Modify: `README.md` (Development section)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing other tasks read.

Background: 29 of the last 30 CI failures were the dist check, and a red CI on `main` skips the version bump. `.github/workflows/bump-version.yml` already runs `npm run build` and commits `plugin/dist` with the new version, so the check guards nothing. The user decided: remove it.

- [ ] **Step 1: Confirm the check is there**

Run: `grep -c "Check plugin/dist is committed" .github/workflows/ci.yml`
Expected: `1`.

- [ ] **Step 2: Remove the check, keep the build**

In `.github/workflows/ci.yml`, delete the whole step that begins `- name: Check plugin/dist is committed and up to date` (its `run: |` block included). Keep `- run: npm run build` as the step before it, now a compile check.

Create `.gitattributes`:

```
# Built by the version-bump workflow; collapsed in diffs.
plugin/dist/** linguist-generated=true -diff
```

- [ ] **Step 3: Say so in the README**

In `README.md`, in the Development section, replace the paragraph that begins `` `plugin/dist` is committed on purpose`` with:

```markdown
`plugin/dist` is committed on purpose: the plugin ships as files and nothing
builds on the user's machine. You don't commit it yourself: every green push to
`main` rebuilds it and commits it with the patch version bump. A local
`npm run build` leaves it modified; discard that with `git checkout -- plugin/dist`.
```

- [ ] **Step 4: Verify**

Run: `grep -c "plugin/dist is stale" .github/workflows/ci.yml; node -e "const s=require('fs').readFileSync('.github/workflows/ci.yml','utf8'); if(!/npm run build/.test(s)) process.exit(1)" && echo build-kept`
Expected: `0`, then `build-kept`.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml .gitattributes README.md
git commit -m "Stop gating CI on a committed plugin/dist; the bump workflow builds it"
```

### Task 10: Claude Code version floor, and the README says how the console lives

**Files:**
- Modify: `src/server/setup.ts` (`checkClaudeVersion`)
- Modify: `src/server/setup.test.ts`
- Modify: `plugin/commands/setup.md`
- Modify: `README.md` (Install, Updating, How it works)

**Interfaces:**
- Consumes: `isOlderBuild(running, candidate)` from `src/server/build-info.ts` (Task 3).
- Produces: `checkClaudeVersion(raw)` returns `ok: true` for any version at or above `PINNED_CLAUDE_VERSION`.

Background: the version check warns on every Claude Code version but exactly 2.1.231 — 151 warnings in the author's log, no matches. It becomes a floor. The README also still describes the old lifecycle (restart only while a team is live, update means run `/team8:console`).

- [ ] **Step 1: Write the failing tests**

In `src/server/setup.test.ts`, replace the three tests inside `describe('checkClaudeVersion', ...)` with:

```ts
  it('accepts the floor and anything newer', () => {
    expect(PINNED_CLAUDE_VERSION).toBe('2.1.231');
    for (const v of ['2.1.231', '2.1.283', '2.2.0']) {
      expect(checkClaudeVersion(`${v} (Claude Code)`)).toEqual({
        ok: true,
        message: `claude ${v} is at or above 2.1.231`,
      });
    }
  });

  it('warns below the floor', () => {
    expect(checkClaudeVersion('2.1.200 (Claude Code)')).toEqual({
      ok: false,
      message: 'claude 2.1.200 is older than 2.1.231; the control plane writes internal protocols and may be wrong',
    });
  });

  it('warns when the version cannot be read', () => {
    expect(checkClaudeVersion(null)).toEqual({
      ok: false,
      message: 'could not read `claude --version`; the console needs 2.1.231 or newer',
    });
    expect(checkClaudeVersion('command not found').ok).toBe(false);
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/server/setup.test.ts -t checkClaudeVersion`
Expected: FAIL — 2.1.283 is rejected; messages differ.

- [ ] **Step 3: Make it a floor**

In `src/server/setup.ts`, add `import { isOlderBuild } from './build-info';` and replace the body of `checkClaudeVersion` after the `version` line with:

```ts
  if (!version) {
    return {
      ok: false,
      message: `could not read \`claude --version\`; the console needs ${PINNED_CLAUDE_VERSION} or newer`,
    };
  }
  if (!isOlderBuild(version, PINNED_CLAUDE_VERSION)) {
    return { ok: true, message: `claude ${version} is at or above ${PINNED_CLAUDE_VERSION}` };
  }
  return {
    ok: false,
    message: `claude ${version} is older than ${PINNED_CLAUDE_VERSION}; the control plane writes internal protocols and may be wrong`,
  };
```

- [ ] **Step 4: Update the docs**

In `plugin/commands/setup.md`: on the `claude --version` line, change the comment to `# console needs 2.1.231 or newer`; change `If \`claude --version\` is not the pinned one, say so and carry on` to `If \`claude --version\` is older than 2.1.231, say so and carry on`.

In `README.md`:

1. Install: replace `The console is built against Claude Code \`2.1.231\`: agent teams are experimental, and the files team8 reads can change shape between releases. On any other version it still runs, but warns at startup.` with `The console needs Claude Code \`2.1.231\` or newer: agent teams are experimental, and the files team8 reads can change shape between releases. On an older version it still runs, but warns at startup.`
2. Replace the sentence beginning `Check it any time with \`/team8:console\`` through `\`http://127.0.0.1:4823\`.` with: `Open it any time with \`/team8:console\` (\`/console\` also works, same as \`/team8:setup\` above): it opens the console on the session you run it from, starting or upgrading it only when needed, and every open tab follows. The URL is \`http://127.0.0.1:4823/s/<session id>\`.`
3. Updating: replace the paragraph beginning `Then run \`/team8:console\`. The server is detached` with: `The next session you start replaces a console running an older build, on whatever it was showing, and \`/team8:console\` does the same from the session you are in. Replacing it loses nothing: the console rebuilds its screen from its own log. The header shows which build serves, amber when a newer one is installed.`
4. How it works: replace `It only brings the console back if a team is still live, so a stopped console never blocks or slows a session.` with `The console never shuts itself down, so if it crashed or was killed, the next hook brings it back on whatever it was showing. One that has never run on this machine is left alone until a team, a workflow or \`/team8:console\` starts it.`

- [ ] **Step 5: Run the tests**

Run: `npx tsc --noEmit && npx vitest run src/server/setup.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/setup.ts src/server/setup.test.ts plugin/commands/setup.md README.md
git commit -m "Treat 2.1.231 as a floor, not a pin; describe the console's lifecycle in the README"
```

### Task 11: End-to-end check on the real ~/.claude

**Files:**
- Modify: `docs/team8/runs/2026-09-27-console-lifecycle.md` (a "Checked by hand" note under Run)

**Interfaces:**
- Consumes: everything above, built.
- Produces: nothing.

Background: the unit, wiring and script tests run against temp homes. This task runs the built working copy against the real `~/.claude`, on port **4834** so it never races the installed console on 4823 or the hooks that post to it. It builds a `dev` console, which is never replaced automatically, so it stops it at the end. The record at `~/.claude/team8/console.json` is shared by every port; the installed 1.0.43 build never reads it, so removing it at the end leaves nothing behind.

- [ ] **Step 1: Build, and pick two live sessions**

```bash
npm run build
for f in ~/.claude/sessions/*.json; do p=$(basename "$f" .json); kill -0 "$p" 2>/dev/null && node -p "require('$f').sessionId"; done
```

Expected: at least two session ids. Call the first `A` and the second `B`. With only one, stop and report: switching needs two.

- [ ] **Step 2: Open on A with nothing running — it starts, and opens a tab**

```bash
export OCTO_PORT=4834 OCTO_ROOT="$PWD/plugin" CLAUDE_PLUGIN_ROOT="$PWD/plugin"
printf '#!/bin/sh\necho "$1" >> /tmp/team8-e2e-opened\n' > /tmp/team8-e2e-open && chmod +x /tmp/team8-e2e-open
OCTO_OPEN=/tmp/team8-e2e-open plugin/bin/console-open.sh "$A"
curl -s http://127.0.0.1:4834/health; echo; cat /tmp/team8-e2e-opened
```

Expected: last line `http://127.0.0.1:4834/s/<A>`; `/health` shows `"build":"dev"` and `"watching":{"kind":"session","id":"<A>"}`; the opened log holds that URL.

- [ ] **Step 3: An open tab follows a switch to B, with no restart**

Save as `/tmp/team8-e2e-tab.mjs` and run it with `node /tmp/team8-e2e-tab.mjs "$A" "$B"` from the repo root (Playwright is a devDependency):

```js
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';

const [a, b] = process.argv.slice(2);
const pidOnPort = () => execFileSync('lsof', ['-t', '-iTCP:4834', '-sTCP:LISTEN']).toString().trim();
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:4834/s/${a}`);
await page.waitForTimeout(2000);
const before = pidOnPort();
execFileSync('plugin/bin/console-open.sh', [b], { stdio: 'inherit' });
await page.waitForURL(new RegExp(`/s/${b}`), { timeout: 15000 });
console.log(JSON.stringify({ url: page.url(), samePid: before === pidOnPort() }));
await browser.close();
```

Expected: `url` ends in `/s/<B>` and `samePid` is `true`. If Chromium is missing, run `npx playwright install chromium` once.

- [ ] **Step 4: Killed, it comes back on what it watched**

```bash
pkill -f "dist/server/index.js --port 4834"
plugin/bin/console-restart.sh
for i in $(seq 1 30); do curl -sf http://127.0.0.1:4834/health && break; sleep 1; done; echo
```

Expected: `/health` answers with `"watching":{"kind":"session","id":"<B>"}`.

- [ ] **Step 5: Clean up**

```bash
pkill -f "dist/server/index.js --port 4834"
rm -f ~/.claude/team8/console.json /tmp/team8-e2e-open /tmp/team8-e2e-opened /tmp/team8-e2e-tab.mjs
git checkout -- plugin/dist
git status --short
```

Expected: nothing on 4834, and `git status` clean apart from the run log edit below.

- [ ] **Step 6: Record it**

Under `## Run` in `docs/team8/runs/2026-09-27-console-lifecycle.md`, add one line: `- checked by hand (port 4834, real ~/.claude): start + tab opened <yes|no> · tab followed switch without restart <yes|no> · restart restored watch <yes|no>`, filled from Steps 2 to 4. An older build being replaced, and a newer or dev one being left alone, are covered by `console-scripts.test.ts` rather than here.

```bash
git add docs/team8/runs/2026-09-27-console-lifecycle.md
git commit -m "Record the by-hand console check"
```
