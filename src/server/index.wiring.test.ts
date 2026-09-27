import { describe, it, expect, afterEach } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { agentNameFrom } from './ingest/hooks';
import { agentOfTranscript, TAIL_POLL_MS } from './ingest/files';
import { FOLLOW_INTERVAL_MS } from './index';
import type { TeamState, TeamsResponse } from '../shared/domain';
import type { Sidecar } from '../shared/roster';

const FIXTURES = path.resolve(process.cwd(), 'fixtures');
const ENTRY = fileURLToPath(new URL('./index.ts', import.meta.url));
const TSX = fileURLToPath(new URL('../../node_modules/.bin/tsx', import.meta.url));

const TEAM = 'session-98b0b4a7';
const LEAD_SESSION = '98b0b4a7-3206-455b-aaf6-a5a81ad1e283';
// Matches folderSessionIds' own transform (index.ts) of the spawned server's
// cwd, which `boot()` inherits from this process — not a fixed string, or the
// folder-scoping in `listTeamSummaries` drops every fixture team but the one
// on screen anywhere this repo is not checked out at the author's own path.
const SLUG = process.cwd().replace(/[^a-zA-Z0-9]/g, '-');
const AGENT = 'probe-alpha';
const SPAWN_ID = `a${AGENT}-84fd551b27de6433`;

// The second team the selector switches to. Its teammate name appears in no
// other team's roster, so "nothing of A survives" is decidable by name alone.
const TEAM_B = 'session-b5129c7b';
const LEAD_SESSION_B = 'b5129c7b-1f0a-4a2e-9b3c-6d5e4f3a2b1c';
const AGENT_B = 'probe-delta';
const SPAWN_ID_B = `a${AGENT_B}-babf58016882bc72`;
// A third, so two racing selects can name different teams.
const TEAM_C = 'session-cccc3333';
const LEAD_SESSION_C = 'cccc3333-2b1a-4c3d-8e7f-1a2b3c4d5e6f';
const B_LINE = "team B's own line";
// A session that never formed a team: no teams/<name> of its own, only a
// project directory. Its id is deliberately unlike a team directory name.
const SOLO_SESSION = '8f2a1c00-9d4e-4f1b-8a77-0c2e6b5d4a31';
const SOLO_LINE = 'the solo session speaking';
const SOLO_TITLE = 'the solo session, by name';

/**
 * How long after the hook the drained line is allowed to take. It has to stay
 * well under TAIL_POLL_MS, because the poll would deliver the same line on its
 * own and a deadline anywhere near it would pass with the drain unwired —
 * which is exactly the regression this file exists to catch. Measured: 6ms
 * with the drain, 247ms (the next poll tick) without it.
 */
const HOOK_DEADLINE_MS = 120;

let child: ChildProcess | null = null;
let home = '';

afterEach(async () => {
  if (child) {
    child.kill('SIGTERM');
    await new Promise((r) => child!.on('exit', r));
    child = null;
  }
  if (home) await fs.rm(home, { recursive: true, force: true });
  home = '';
});

/**
 * A ~/.claude the server can boot against, with one teammate whose transcript
 * is a SYMLINK to a file outside the watched tree. Appending to the target
 * produces no fs.watch event inside `projects/`, and `walk()` collects only
 * `isFile()` entries so the 5s sweep never lists it either — which leaves the
 * 250ms tail poll and the hook's drain as the only two ways a new line can
 * reach the state, and time as the only thing that tells them apart.
 */
async function layout(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wiring-'));
  const subagents = path.join(dir, 'projects', SLUG, LEAD_SESSION, 'subagents');
  await fs.mkdir(subagents, { recursive: true });
  await fs.mkdir(path.join(dir, 'teams', TEAM), { recursive: true });
  await fs.mkdir(path.join(dir, 'tasks'), { recursive: true });
  await fs.mkdir(path.join(dir, 'sessions'), { recursive: true });
  await fs.mkdir(path.join(dir, 'outside'), { recursive: true });

  await fs.copyFile(
    path.join(FIXTURES, 'config-4-members.json'),
    path.join(dir, 'teams', TEAM, 'config.json'),
  );
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

  const sidecars = JSON.parse(
    await fs.readFile(path.join(FIXTURES, 'meta-sidecars.json'), 'utf8'),
  ) as Sidecar[];
  await fs.writeFile(
    path.join(subagents, `agent-${SPAWN_ID}.meta.json`),
    JSON.stringify(sidecars.find((s) => s.name === AGENT)),
  );

  const transcript = path.join(dir, 'outside', 'transcript.jsonl');
  await fs.writeFile(transcript, '');
  await fs.symlink(transcript, path.join(subagents, `agent-${SPAWN_ID}.jsonl`));

  // Teams B and C are ORDINARY files: the symlink above exists to defeat the
  // sweep's walk and the watcher, which is exactly the machinery a switch has
  // to exercise.
  await writeTeamConfig(dir, TEAM_B, LEAD_SESSION_B, AGENT_B);
  await writeTeamConfig(dir, TEAM_C, LEAD_SESSION_C, 'probe-echo');

  // All three teams run in ONE working copy, which is what the picker is now
  // scoped to. C spawns nothing, so its transcript is the only thing that puts
  // it in the folder — exactly as it would be on disk.
  await fs.writeFile(path.join(dir, 'projects', SLUG, `${LEAD_SESSION_C}.jsonl`), '');

  const subagentsB = path.join(dir, 'projects', SLUG, LEAD_SESSION_B, 'subagents');
  await fs.mkdir(subagentsB, { recursive: true });
  await fs.writeFile(
    path.join(subagentsB, `agent-${SPAWN_ID_B}.meta.json`),
    JSON.stringify({
      agentType: AGENT_B,
      description: 'the second team',
      name: AGENT_B,
      spawnDepth: 0,
      model: 'claude-opus-5',
      taskKind: 'in_process_teammate',
      teamName: TEAM_B,
      color: 'green',
    } satisfies Sidecar),
  );
  await fs.writeFile(
    path.join(subagentsB, `agent-${SPAWN_ID_B}.jsonl`),
    assistantLine('33333333-3333-3333-3333-333333333333', B_LINE),
  );
  return dir;
}


async function writeTeamConfig(dir: string, team: string, leadSessionId: string, teammate: string) {
  await fs.mkdir(path.join(dir, 'teams', team), { recursive: true });
  await fs.writeFile(
    path.join(dir, 'teams', team, 'config.json'),
    JSON.stringify({
      name: team,
      createdAt: 1787798107581,
      leadAgentId: `team-lead@${team}`,
      leadSessionId,
      members: [
        { agentId: `team-lead@${team}`, name: 'team-lead', joinedAt: 1, tmuxPaneId: 'in-process', subscriptions: [] },
        { agentId: `${teammate}@${team}`, name: teammate, joinedAt: 2, tmuxPaneId: 'in-process', subscriptions: [] },
      ],
    }),
  );
}

async function boot(claudeHome: string, extra: string[] = [], team: string | null = TEAM): Promise<string> {
  const args = [TSX, ENTRY, '--claude-home', claudeHome, ...(team ? ['--team', team] : []), '--port', '0', ...extra];
  const proc = spawn(process.execPath, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child = proc;

  let out = '';
  let err = '';
  proc.stdout!.setEncoding('utf8');
  proc.stderr!.setEncoding('utf8');
  proc.stderr!.on('data', (d: string) => (err += d));

  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server never announced a port\n${out}\n${err}`)), 10_000);
    proc.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited with ${code}\n${out}\n${err}`));
    });
    proc.stdout!.on('data', (d: string) => {
      out += d;
      const m = /http:\/\/127\.0\.0\.1:(\d+)/.exec(out);
      if (m) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${m[1]}`);
      }
    });
  });
}

// /stream opens with a `snapshot` frame built from the store as it stands, so
// one connection per read gives the projected state with no coalescing delay.
async function snapshot(url: string): Promise<TeamState> {
  const abort = new AbortController();
  const res = await fetch(`${url}/stream`, { signal: abort.signal });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    while (!buf.includes('\n\n')) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
    }
  } finally {
    abort.abort();
  }
  const start = buf.indexOf('data: ') + 'data: '.length;
  return JSON.parse(buf.slice(start, buf.indexOf('\n\n', start))) as TeamState;
}

function transcriptOf(state: TeamState, agent: string): string[] {
  return (state.agents.find((a) => a.name === agent)?.transcript ?? []).map((l) => l.text);
}

async function waitForLine(url: string, agent: string, text: string, deadlineAt: number): Promise<boolean> {
  for (;;) {
    if (transcriptOf(await snapshot(url), agent).includes(text)) return true;
    if (Date.now() >= deadlineAt) return false;
    await new Promise((r) => setTimeout(r, 5));
  }
}

function assistantLine(uuid: string, text: string): string {
  return `${JSON.stringify({
    type: 'assistant',
    uuid,
    timestamp: new Date().toISOString(),
    message: { role: 'assistant', content: [{ type: 'text', text }] },
  })}\n`;
}

function postHook(url: string, body: unknown): Promise<Response> {
  return fetch(`${url}/hook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function selectSession(url: string, sessionId: string): Promise<Response> {
  return fetch(`${url}/api/select-session/${sessionId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
}

function selectTeam(url: string, team: string): Promise<Response> {
  return fetch(`${url}/api/teams/${team}/select`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
}

// A statusline row exists only because a hook posted it: no file under the temp
// ~/.claude can re-derive it, so `branch` is the one field that proves whose LOG
// the console is reading rather than whose files it just swept.
function postBranch(url: string, branch: string): Promise<Response> {
  return fetch(`${url}/statusline`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ agent_id: `team-lead@${TEAM}`, gitBranch: branch }),
  });
}

function names(state: TeamState): string[] {
  return state.agents.map((a) => a.name).sort();
}

describe('push -> pull wiring', () => {
  it(
    "a hook drains that agent's transcript immediately, without waiting for the tail poll",
    async () => {
      // Guards the whole test: if the poll ever gets fast enough to deliver
      // inside the deadline, this passes with the drain unwired and proves
      // nothing.
      expect(HOOK_DEADLINE_MS * 2).toBeLessThan(TAIL_POLL_MS);

      home = await layout();
      const url = await boot(home);
      const transcript = path.join(home, 'outside', 'transcript.jsonl');

      // The pull channel on its own, and a phase lock: observing this line
      // means a poll tick just fired, so the next one is a full TAIL_POLL_MS
      // away and cannot rescue the assertion below.
      await fs.appendFile(transcript, assistantLine('11111111-1111-1111-1111-111111111111', 'polled line'));
      expect(await waitForLine(url, AGENT, 'polled line', Date.now() + 4000)).toBe(true);

      await fs.appendFile(transcript, assistantLine('22222222-2222-2222-2222-222222222222', 'drained line'));
      const startedAt = Date.now();
      // A qualified `agent_id`, so the hook has to translate it to the bare
      // name the file ingest keys transcripts under before the drain can find
      // anything. Nothing else in the suite crosses those two name spaces.
      const res = await postHook(url, {
        hook_event_name: 'PostToolUse',
        agent_id: `${AGENT}@${TEAM}`,
        tool_name: 'Bash',
      });
      expect(res.status).toBe(200);

      const drained = await waitForLine(url, AGENT, 'drained line', startedAt + HOOK_DEADLINE_MS);
      expect(
        drained,
        `the hook did not drain ${AGENT}'s transcript within ${HOOK_DEADLINE_MS}ms — ` +
          'onAgentActivity is optional on HookDeps, so an unwired drain typechecks',
      ).toBe(true);
    },
    20_000,
  );

  it(
    'retargets at a session that never formed a team, dropping the team it was showing',
    async () => {
      home = await layout();
      // A session with no config.json anywhere: a transcript beside a subagents
      // directory under its own project dir — Claude Code's own layout — and
      // nothing in teams/.
      const solo = path.join(home, 'projects', SLUG, SOLO_SESSION);
      await fs.mkdir(path.join(solo, 'subagents'), { recursive: true });
      await fs.writeFile(
        `${solo}.jsonl`,
        assistantLine('44444444-4444-4444-4444-444444444444', SOLO_LINE) +
          `${JSON.stringify({ type: 'custom-title', customTitle: SOLO_TITLE, sessionId: SOLO_SESSION })}\n`,
      );

      const url = await boot(home);
      expect((await snapshot(url)).teamName).toBe(TEAM);

      const res = await selectSession(url, SOLO_SESSION);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, session: SOLO_SESSION, changed: true });

      const after = await snapshot(url);
      // No team to name, and — the point of the store re-point — nothing of the
      // team it was showing left in the log it now reads.
      expect(after.teamName).toBe('');
      expect(names(after)).not.toContain(AGENT);
      // Named right away, off its own transcript: this server was not started
      // in the session's folder, so the follower's scoped listing has no row
      // for it and the header used to fall back to the id.
      expect(after.sessionName).toBe(SOLO_TITLE);

      // Selecting it again is a no-op, not a second rebuild.
      expect(await (await selectSession(url, SOLO_SESSION)).json()).toEqual({
        ok: true,
        session: SOLO_SESSION,
        changed: false,
      });
      // A session with nothing on disk behind it is a 404, not a blank console.
      expect((await selectSession(url, 'deadbeef-0000-0000-0000-000000000000')).status).toBe(404);
      expect((await snapshot(url)).teamName).toBe('');
    },
    20_000,
  );

  it(
    "resolves select-session on a team's lead to that team, so a reload of /s/<lead> lands on the roster",
    async () => {
      home = await layout();
      const url = await boot(home);
      expect((await selectTeam(url, TEAM_B)).status).toBe(200);
      expect((await snapshot(url)).teamName).toBe(TEAM_B);

      const res = await selectSession(url, LEAD_SESSION);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, session: LEAD_SESSION, changed: true });

      const after = await snapshot(url);
      expect(after.teamName).toBe(TEAM);
      expect(names(after)).toContain(AGENT);

      // The same reload again finds its team already on screen.
      expect(await (await selectSession(url, LEAD_SESSION)).json()).toEqual({
        ok: true,
        session: LEAD_SESSION,
        changed: false,
      });
    },
    20_000,
  );

  it(
    'switches the console to another team at runtime, roster and transcript',
    async () => {
      home = await layout();
      const url = await boot(home);
      expect((await snapshot(url)).teamName).toBe(TEAM);

      const res = await selectTeam(url, TEAM_B);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, team: TEAM_B, changed: true });

      // The select awaits the new ingest's own sweep, so the state is finished
      // by the time it answers — no FSEvents delivery on the critical path.
      const after = await snapshot(url);
      expect(after.teamName).toBe(TEAM_B);
      expect(names(after)).toEqual(['team-lead', AGENT_B].sort());
      expect(transcriptOf(after, AGENT_B)).toContain(B_LINE);
    },
    20_000,
  );

  it(
    'leaves nothing of the team it left behind, then or 400ms later',
    async () => {
      home = await layout();
      const url = await boot(home);
      // Only a hook can produce this row, so no sweep of the new team can
      // re-derive it — it is present exactly while team A's log is the one
      // being read.
      expect((await postBranch(url, 'branch-of-team-a')).status).toBe(200);
      expect((await snapshot(url)).branch).toBe('branch-of-team-a');
      expect(names(await snapshot(url))).toContain(AGENT);

      expect((await selectTeam(url, TEAM_B)).status).toBe(200);

      const after = await snapshot(url);
      expect(names(after)).toEqual(['team-lead', AGENT_B].sort());
      expect(after.branch).toBeUndefined();

      // The retired ingest's sweep only tests `closed` between files and its
      // debounced watcher callbacks never test it at all, so a stale roster
      // append lands AFTER close() — measured inside 300ms. Without the
      // generation fence this second read flips teamName back to team A.
      await new Promise((r) => setTimeout(r, 400));
      const settled = await snapshot(url);
      expect(settled.teamName).toBe(TEAM_B);
      expect(names(settled)).toEqual(['team-lead', AGENT_B].sort());
      expect(settled.branch).toBeUndefined();
    },
    20_000,
  );

  it(
    "keeps the team it left behind readable — switching back restores its history",
    async () => {
      home = await layout();
      const url = await boot(home);
      expect((await postBranch(url, 'branch-of-team-a')).status).toBe(200);

      expect((await selectTeam(url, TEAM_B)).status).toBe(200);
      expect((await snapshot(url)).branch).toBeUndefined();

      const back = await selectTeam(url, TEAM);
      expect(back.status).toBe(200);
      expect(await back.json()).toEqual({ ok: true, team: TEAM, changed: true });

      const after = await snapshot(url);
      expect(after.teamName).toBe(TEAM);
      expect(names(after)).toContain(AGENT);
      // Nothing on disk can produce this: the round trip proves the store was
      // re-pointed rather than reopened or discarded.
      expect(after.branch).toBe('branch-of-team-a');
    },
    20_000,
  );

  it(
    'treats re-selecting the current team as a no-op, with no empty-roster blink',
    async () => {
      home = await layout();
      const url = await boot(home);
      const before = names(await snapshot(url));

      const res = await selectTeam(url, TEAM);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, team: TEAM, changed: false });

      // A rebuilt ingest starts with lastConfig = null, so a needless rebuild
      // is VISIBLE: teamName '' and zero agents until its sweep lands.
      const deadline = Date.now() + 400;
      while (Date.now() < deadline) {
        const state = await snapshot(url);
        expect(state.teamName).toBe(TEAM);
        expect(names(state)).toEqual(before);
      }
    },
    20_000,
  );

  it(
    '404s a team that is not there and one whose config cannot be read',
    async () => {
      home = await layout();
      const url = await boot(home);

      const missing = await selectTeam(url, 'session-nope0001');
      expect(missing.status).toBe(404);
      expect((await missing.json()).error).toBe('not found');

      await fs.mkdir(path.join(home, 'teams', 'session-torn0002'), { recursive: true });
      await fs.writeFile(path.join(home, 'teams', 'session-torn0002', 'config.json'), '{ not json');
      const torn = await selectTeam(url, 'session-torn0002');
      expect(torn.status).toBe(404);
      expect((await torn.json()).message).toContain('config.json');

      // Neither attempt tore anything down.
      expect((await snapshot(url)).teamName).toBe(TEAM);
    },
    20_000,
  );

  it(
    'lets exactly one of two racing selects win, and lands coherently on it',
    async () => {
      home = await layout();
      const url = await boot(home);

      const [b, c] = await Promise.all([selectTeam(url, TEAM_B), selectTeam(url, TEAM_C)]);
      expect([b.status, c.status].sort()).toEqual([200, 409]);
      const loser = b.status === 409 ? b : c;
      expect((await loser.json()).error).toBe('switch in progress');

      const winner = b.status === 200 ? TEAM_B : TEAM_C;
      const after = await snapshot(url);
      expect(after.teamName).toBe(winner);
      expect(names(after)).toEqual(['team-lead', winner === TEAM_B ? AGENT_B : 'probe-echo'].sort());
    },
    20_000,
  );

  it(
    'switches in --read-only, which still writes nothing into ~/.claude',
    async () => {
      home = await layout();
      const url = await boot(home, ['--read-only']);
      expect((await snapshot(url)).readOnly).toBe(true);

      const res = await selectTeam(url, TEAM_B);
      expect(res.status).toBe(200);
      const after = await snapshot(url);
      expect(after.teamName).toBe(TEAM_B);
      expect(after.readOnly).toBe(true);

      // Every other control route is still refused, and no inbox was written.
      const message = await fetch(`${url}/api/agents/${AGENT_B}/message`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'hi' }),
      });
      expect(message.status).toBe(409);
      for (const team of [TEAM, TEAM_B]) {
        await expect(fs.stat(path.join(home, 'teams', team, 'inboxes'))).rejects.toThrow();
      }
    },
    20_000,
  );

  it(
    'lists every team in this folder, and moves the current flag on a switch',
    async () => {
      home = await layout();
      const url = await boot(home);

      const listed = (await (await fetch(`${url}/api/teams`)).json()) as TeamsResponse;
      expect(listed.current).toBe(TEAM);
      expect(listed.teams.map((t) => t.name).sort()).toEqual([TEAM, TEAM_B, TEAM_C].sort());
      const byName = new Map(listed.teams.map((t) => [t.name, t]));
      expect(byName.get(TEAM)!.members).toBe(4);
      expect(byName.get(TEAM_B)!.members).toBe(2);
      expect(byName.get(TEAM)!.current).toBe(true);
      // The current team sorts first so the dropdown opens on it.
      expect(listed.teams[0].name).toBe(TEAM);

      expect((await selectTeam(url, TEAM_B)).status).toBe(200);
      const again = (await (await fetch(`${url}/api/teams`)).json()) as TeamsResponse;
      expect(again.current).toBe(TEAM_B);
      expect(again.teams.filter((t) => t.current).map((t) => t.name)).toEqual([TEAM_B]);
    },
    20_000,
  );

  // The scope reaches `<cwd>/.git/HEAD` and spawns `git diff` there, so a path
  // the browser names must never become one: anything but `*` is answered for
  // the console's own folder.
  it(
    'answers a folder the browser names with the console\'s own listing, never reading the named path',
    async () => {
      home = await layout();
      const url = await boot(home);

      const bare = (await (await fetch(`${url}/api/teams`)).json()) as TeamsResponse;
      for (const hostile of ['/etc', '../../etc']) {
        const named = (await (
          await fetch(`${url}/api/teams?folder=${encodeURIComponent(hostile)}`)
        ).json()) as TeamsResponse;
        expect(named.folder).toBe(bare.folder);
        expect(named.teams.map((t) => t.name).sort()).toEqual(bare.teams.map((t) => t.name).sort());
      }
    },
    20_000,
  );

  it('resolves the same teammate name from a hook agent_id as from its transcript file', () => {
    // The two name spaces meet at `transcriptPaths`, which the ingest keys
    // from the sidecar and the drain looks up by the hook's name. Nothing
    // else makes them agree.
    const file = `/c/projects/${SLUG}/${LEAD_SESSION}/subagents/agent-${SPAWN_ID}.jsonl`;
    expect(agentOfTranscript(file, LEAD_SESSION, 'team-lead')).toBe(AGENT);
    expect(agentNameFrom(SPAWN_ID)).toBe(AGENT);
    expect(agentNameFrom(`${AGENT}@${TEAM}`)).toBe(AGENT);
  });
});

// The frame has to say WHICH shell to draw, or the browser has to guess from
// the shape of the payload — which is how a team with zero agents and a team
// that is really a workflow become indistinguishable.
describe('workflow mode on the wire', () => {
  async function addRun(claudeHome: string, runId: string): Promise<void> {
    const runDir = path.join(claudeHome, 'projects', SLUG, LEAD_SESSION, 'workflows');
    await fs.mkdir(runDir, { recursive: true });
    const raw = JSON.parse(await fs.readFile(path.join(FIXTURES, 'workflow-run.json'), 'utf8'));
    await fs.writeFile(path.join(runDir, `${runId}.json`), JSON.stringify({ ...raw, runId }));
  }

  /** A session that ran workflows and never formed a team. */
  async function homeWithRun(runId: string): Promise<string> {
    const claudeHome = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-wf-'));
    home = claudeHome;
    for (const d of ['teams', 'tasks', 'sessions']) {
      await fs.mkdir(path.join(claudeHome, d), { recursive: true });
    }
    await addRun(claudeHome, runId);
    return claudeHome;
  }

  // A session that never formed a team has no config.json to resolve, so
  // `--session` is the only thing that can tell the console whose runs these
  // are. Without it the scope check fails closed and workflow mode is
  // unreachable — which is what the launcher passes when it sees a Workflow.
  it('publishes the run and says the mode is workflow when there is no team', async () => {
    const url = await boot(await homeWithRun('wf_d36b25c0-f96'), [
      '--session',
      LEAD_SESSION,
    ]);

    const state = await (async () => {
      for (;;) {
        const s = await snapshot(url);
        if ((s.workflows?.length ?? 0) > 0) return s;
        await new Promise((r) => setTimeout(r, 25));
      }
    })();

    expect(state.mode).toBe('workflow');
    expect(state.workflows?.[0].runId).toBe('wf_d36b25c0-f96');
    expect(state.workflows?.[0].agents).toHaveLength(4);
  }, 20_000);

  it('stays in team mode once a roster exists, still carrying the run', async () => {
    const claudeHome = await layout();
    home = claudeHome;
    await addRun(claudeHome, 'wf_d36b25c0-f96');
    const url = await boot(claudeHome);

    const state = await (async () => {
      for (;;) {
        const s = await snapshot(url);
        if (s.agents.length > 0 && (s.workflows?.length ?? 0) > 0) return s;
        await new Promise((r) => setTimeout(r, 25));
      }
    })();

    expect(state.mode).toBe('team');
    expect(state.workflows).toHaveLength(1);
  }, 20_000);
});

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

describe('which team a console boots onto', () => {
  async function emptyHome(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-boot-'));
    home = dir;
    for (const d of ['teams', 'tasks', 'sessions', 'projects']) await fs.mkdir(path.join(dir, d), { recursive: true });
    return dir;
  }

  async function leftover(dir: string, team: string, leadSessionId: string) {
    await writeTeamConfig(dir, team, leadSessionId, 'probe-old');
    const old = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await fs.utimes(path.join(dir, 'teams', team, 'config.json'), old, old);
  }

  async function teamOf(url: string): Promise<string> {
    return ((await (await fetch(`${url}/health`)).json()) as { team: string }).team;
  }

  async function waitForTeam(url: string, deadlineMs: number): Promise<string> {
    const until = Date.now() + deadlineMs;
    let team = await teamOf(url);
    while (team === '' && Date.now() < until) {
      await new Promise((r) => setTimeout(r, 100));
      team = await teamOf(url);
    }
    return team;
  }

  async function waitForTeamNamed(url: string, name: string, deadlineMs: number): Promise<string> {
    const until = Date.now() + deadlineMs;
    let team = await teamOf(url);
    while (team !== name && Date.now() < until) {
      await new Promise((r) => setTimeout(r, 100));
      team = await teamOf(url);
    }
    return team;
  }

  /** Polls until the record names `watching`, so an earlier record on disk cannot pass for it. */
  async function readRecord(dir: string, watching: unknown): Promise<{ port: number; watching: unknown }> {
    const file = path.join(dir, 'team8', 'console.json');
    const until = Date.now() + 2000;
    for (;;) {
      try {
        const rec = JSON.parse(await fs.readFile(file, 'utf8')) as { port: number; watching: unknown };
        if (JSON.stringify(rec.watching) === JSON.stringify(watching) || Date.now() > until) return rec;
      } catch (err) {
        if (Date.now() > until) throw err;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  async function liveSession(dir: string, sessionId: string) {
    await fs.writeFile(path.join(dir, 'projects', SLUG, `${sessionId}.jsonl`), '');
    await fs.writeFile(
      path.join(dir, 'sessions', `${process.pid}.json`),
      JSON.stringify({ sessionId, pid: process.pid, cwd: process.cwd() }),
    );
  }

  it('a bare boot over leftover teams shows none of them, then or after the follower looks', async () => {
    const dir = await emptyHome();
    await leftover(dir, 'aaa-oldest', 'gone-session-1');
    await leftover(dir, 'session-zzz-newest', 'gone-session-2');

    const url = await boot(dir, [], null);

    expect(await teamOf(url)).toBe('');
    expect(await waitForTeam(url, FOLLOW_INTERVAL_MS + 1000)).toBe('');
  }, 20_000);

  it('a console started on a session shows the team that session forms later', async () => {
    const dir = await emptyHome();
    const url = await boot(dir, ['--session', SOLO_SESSION], null);
    expect(await teamOf(url)).toBe('');

    await writeTeamConfig(dir, 'session-8f2a1c00', SOLO_SESSION, 'probe-new');

    expect(await waitForTeam(url, FOLLOW_INTERVAL_MS * 3)).toBe('session-8f2a1c00');
  }, 20_000);

  it('a second console on a taken port exits without touching the team log', async () => {
    home = await layout();
    const url = await boot(home);
    const log = path.join(home, 'team8', 'logs', `${TEAM}.jsonl`);
    const before = await fs.readFile(log, 'utf8');

    const code = await new Promise<number | null>((resolve) => {
      const args = [TSX, ENTRY, '--claude-home', home, '--team', TEAM, '--port', new URL(url).port];
      spawn(process.execPath, args, { stdio: 'ignore' }).on('exit', resolve);
    });

    expect(code).toBe(1);
    expect(await fs.readFile(log, 'utf8')).toBe(before);
    await expect(fs.stat(`${log}.owner`)).resolves.toBeTruthy();
  }, 20_000);

  it('opening /s/<session> for the re-keyed team already on screen changes nothing', async () => {
    const dir = await emptyHome();
    // Re-keyed: config.leadSessionId is a fresh id no session carries, and only
    // the teammate's sidecar ties the team to the session driving it.
    await writeTeamConfig(dir, 'rekeyed-team', 'fresh-id-nobody-has', 'probe-rk');
    const subagents = path.join(dir, 'projects', SLUG, SOLO_SESSION, 'subagents');
    await fs.mkdir(subagents, { recursive: true });
    await fs.writeFile(
      path.join(subagents, 'agent-aprobe-rk-0123456789abcdef.meta.json'),
      JSON.stringify({
        agentType: 'probe-rk',
        description: 'a re-keyed teammate',
        name: 'probe-rk',
        spawnDepth: 0,
        model: 'claude-opus-5',
        taskKind: 'in_process_teammate',
        teamName: 'rekeyed-team',
        color: 'green',
      } satisfies Sidecar),
    );
    await fs.writeFile(path.join(dir, 'projects', SLUG, `${SOLO_SESSION}.jsonl`), '');
    await fs.writeFile(
      path.join(dir, 'sessions', `${process.pid}.json`),
      JSON.stringify({ sessionId: SOLO_SESSION, pid: process.pid, cwd: process.cwd() }),
    );

    const url = await boot(dir, ['--session', SOLO_SESSION], null);
    expect(await teamOf(url)).toBe('rekeyed-team');

    const res = (await (await selectSession(url, SOLO_SESSION)).json()) as { changed?: boolean };
    expect(res.changed).toBe(false);
  }, 20_000);

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
    const ANCESTOR = 'a1b2c3d4-0000-4000-8000-000000000001';
    await writeTeamConfig(dir, 'session-aaaa1111', ANCESTOR, 'probe-anc');
    await fs.mkdir(path.join(dir, 'projects', SLUG), { recursive: true });
    await fs.writeFile(
      path.join(dir, 'projects', SLUG, `${SOLO_SESSION}.jsonl`),
      `${JSON.stringify({ forkedFrom: { sessionId: ANCESTOR } })}\n`,
    );
    // The parent's transcript sits beside the fork's, which is what puts its
    // team in this folder's picker.
    await fs.writeFile(path.join(dir, 'projects', SLUG, `${ANCESTOR}.jsonl`), '');

    const url = await boot(dir, ['--session', SOLO_SESSION], null);

    expect(await teamOf(url)).toBe('session-aaaa1111');
    const listing = (await (await fetch(`${url}/api/teams`)).json()) as TeamsResponse;
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

  it('records what it watches, and rewrites the record when the watch moves', async () => {
    home = await layout();
    const url = await boot(home);

    const held = { kind: 'team', name: TEAM };
    expect(await readRecord(home, held)).toMatchObject({ port: Number(new URL(url).port), watching: held });

    await selectSession(url, LEAD_SESSION_B);
    const followed = { kind: 'session', id: LEAD_SESSION_B };
    expect((await readRecord(home, followed)).watching).toEqual(followed);
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
});
