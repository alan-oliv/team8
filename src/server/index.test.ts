import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  parseArgs,
  discoverTeam,
  forkChainOf,
  fencedSink,
  listLive,
  sessionProjectDir,
  workflowScriptOf,
  transcriptMeta,
  walkTeams,
  DEFAULT_PORT,
  TAIL_WINDOW,
} from './index';
import type { EventKind, StoredEvent, Store } from './store';

const FIXTURES = path.resolve(process.cwd(), 'fixtures');

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cli-'));
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(dir, { recursive: true, force: true });
});

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

describe('parseArgs', () => {
  it('binds DEFAULT_PORT to 4823, matching the vite proxy and lifecycle probe', () => {
    expect(DEFAULT_PORT).toBe(4823);
  });

  it('defaults to running the console on 4823', () => {
    vi.stubEnv('CLAUDE_CONFIG_DIR', '');
    const cli = parseArgs([]);
    expect(cli.command).toBe('run');
    expect(cli.port).toBe(DEFAULT_PORT);
    expect(DEFAULT_PORT).toBe(4823);
    expect(cli.readOnly).toBe(false);
    expect(cli.confirm).toBe(false);
    expect(cli.claudeHome.endsWith(path.join('.claude'))).toBe(true);
  });

  it('reads the setup command with an explicit port and confirmation', () => {
    const cli = parseArgs(['setup', '--port', '4400', '--yes']);
    expect(cli.command).toBe('setup');
    expect(cli.port).toBe(4400);
    expect(cli.confirm).toBe(true);
  });

  it('reads uninstall and --read-only', () => {
    expect(parseArgs(['uninstall']).command).toBe('uninstall');
    expect(parseArgs(['--read-only']).readOnly).toBe(true);
    expect(parseArgs(['--read-only']).command).toBe('run');
  });

  it('follows CLAUDE_CONFIG_DIR, which the launcher already resolves the team through', () => {
    vi.stubEnv('CLAUDE_CONFIG_DIR', '/tmp/elsewhere-claude');
    expect(parseArgs([]).claudeHome).toBe('/tmp/elsewhere-claude');
    // An explicit flag still wins.
    expect(parseArgs(['--claude-home', '/tmp/flag']).claudeHome).toBe('/tmp/flag');
  });

  it('accepts --port=NNNN and an overridden claude home', () => {
    const cli = parseArgs(['--port=4500', '--claude-home', '/tmp/fake-claude']);
    expect(cli.port).toBe(4500);
    expect(cli.claudeHome).toBe('/tmp/fake-claude');
    expect(cli.settingsPath).toBe('/tmp/fake-claude/settings.json');
    expect(cli.dbPath).toBe('/tmp/fake-claude/team8/events.db');
  });

  it('reads --team, so the launcher can tell the server which team it announced', () => {
    expect(parseArgs([]).team).toBeUndefined();
    expect(parseArgs(['--team', 'session-98b0b4a7']).team).toBe('session-98b0b4a7');
    expect(parseArgs(['--team=session-98b0b4a7']).team).toBe('session-98b0b4a7');
  });

  it('reads measure with its session id, --json and --since', () => {
    const cli = parseArgs(['measure', 'sid1', '--json', '--since', '2026-09-30T08:00:00Z']);
    expect([cli.command, cli.session, cli.json, cli.since]).toEqual(['measure', 'sid1', true, '2026-09-30T08:00:00Z']);
    expect(parseArgs([]).json).toBe(false);
  });
});

describe('discoverTeam', () => {
  const teams = () => path.join(dir, 'teams');
  const sessions = () => path.join(dir, 'sessions');

  function membersOf(count: number) {
    return Array.from({ length: count }, (_, i) => ({
      agentId: i === 0 ? 'team-lead' : `agent-${i}`,
      name: i === 0 ? 'team-lead' : `agent-${i}`,
    }));
  }

  async function writeTeam(
    name: string,
    opts: { createdAt: number; leadSessionId: string; memberCount: number },
  ) {
    const teamDir = path.join(teams(), name);
    await fs.mkdir(teamDir, { recursive: true });
    await fs.writeFile(
      path.join(teamDir, 'config.json'),
      JSON.stringify({
        name,
        createdAt: opts.createdAt,
        leadAgentId: 'team-lead',
        leadSessionId: opts.leadSessionId,
        members: membersOf(opts.memberCount),
      }),
    );
  }

  async function writeSession(sessionId: string, pid: number) {
    await fs.mkdir(sessions(), { recursive: true });
    await fs.writeFile(path.join(sessions(), `${sessionId}.json`), JSON.stringify({ sessionId, pid }));
  }

  it('returns null when no team directory exists', async () => {
    await fs.mkdir(teams(), { recursive: true });
    expect(await discoverTeam(teams(), sessions())).toBeNull();
  });

  it('picks the newest team by createdAt and derives the project slug', async () => {
    await fs.mkdir(path.join(teams(), 'session-98b0b4a7'), { recursive: true });
    await fs.mkdir(path.join(teams(), 'session-older11'), { recursive: true });
    await fs.copyFile(
      path.join(FIXTURES, 'config-4-members.json'),
      path.join(teams(), 'session-98b0b4a7', 'config.json'),
    );
    await fs.writeFile(
      path.join(teams(), 'session-older11', 'config.json'),
      JSON.stringify({
        name: 'session-older11',
        createdAt: 1,
        leadAgentId: 'team-lead@session-older11',
        leadSessionId: 'older',
        members: [],
      }),
    );

    const found = (await discoverTeam(teams(), sessions()))!;
    expect(found.teamName).toBe('session-98b0b4a7');
    expect(found.leadSessionId).toBe('98b0b4a7-3206-455b-aaf6-a5a81ad1e283');
    expect(found.projectSlug).toBe('-Users-alanoliv-code-team8');
  });

  it('prefers a >=2-member team over a newer lead-only one — a lead-only team is not a team', async () => {
    await writeTeam('session-newer-lead-only', {
      createdAt: 2000,
      leadSessionId: 'lead-only-session',
      memberCount: 1,
    });
    await writeTeam('session-older-real', {
      createdAt: 1000,
      leadSessionId: 'real-session',
      memberCount: 2,
    });

    const found = (await discoverTeam(teams(), sessions()))!;
    expect(found.teamName).toBe('session-older-real');
  });

  it('when both teams have >=2 members, the one whose lead session is live wins', async () => {
    await writeTeam('session-newer-untracked', {
      createdAt: 2000,
      leadSessionId: 'no-session-file',
      memberCount: 2,
    });
    await writeTeam('session-older-live', {
      createdAt: 1000,
      leadSessionId: 'live-session',
      memberCount: 2,
    });
    await writeSession('live-session', process.pid);
    // 'no-session-file' has no matching file under sessions/, so it cannot be live.

    const found = (await discoverTeam(teams(), sessions()))!;
    expect(found.teamName).toBe('session-older-live');
  });

  it('a team whose leadSessionId names a dead pid loses to one that is live', async () => {
    await writeTeam('session-newer-dead', {
      createdAt: 2000,
      leadSessionId: 'dead-session',
      memberCount: 2,
    });
    await writeTeam('session-older-live', {
      createdAt: 1000,
      leadSessionId: 'live-session',
      memberCount: 2,
    });
    await writeSession('dead-session', 999999); // not a running pid
    await writeSession('live-session', process.pid);

    const found = (await discoverTeam(teams(), sessions()))!;
    expect(found.teamName).toBe('session-older-live');
  });

  it('--team overrides discovery entirely, even when it names an older or lead-only team', async () => {
    await writeTeam('session-newer-real', {
      createdAt: 2000,
      leadSessionId: 'real-session',
      memberCount: 2,
    });
    await writeTeam('session-older-lead-only', {
      createdAt: 1000,
      leadSessionId: 'lead-only-session',
      memberCount: 1,
    });

    const found = (await discoverTeam(teams(), sessions(), 'session-older-lead-only'))!;
    expect(found.teamName).toBe('session-older-lead-only');
  });

  it('an explicit --team with no config.json yet reports unknown rather than a different team', async () => {
    // PreToolUse can announce a team before the spawn that creates its
    // directory. Falling back to whatever else exists would latch the server
    // onto the wrong team and never let go once the real config.json lands.
    await writeTeam('session-existing', {
      createdAt: 2000,
      leadSessionId: 'existing-session',
      memberCount: 2,
    });

    expect(await discoverTeam(teams(), sessions(), 'session-not-yet-created')).toBeNull();
  });

  it('finds a team directory reached through a symlink', async () => {
    const real = path.join(dir, 'real-team-location');
    await fs.mkdir(real, { recursive: true });
    await fs.copyFile(
      path.join(FIXTURES, 'config-4-members.json'),
      path.join(real, 'config.json'),
    );
    await fs.mkdir(teams(), { recursive: true });
    await fs.symlink(real, path.join(teams(), 'session-98b0b4a7'), 'dir');

    const found = (await discoverTeam(teams(), sessions()))!;
    expect(found.teamName).toBe('session-98b0b4a7');
  });

  it('falls back to the newest team when none has >=2 members, as today', async () => {
    await writeTeam('session-newer-lead-only', {
      createdAt: 2000,
      leadSessionId: 'newer-session',
      memberCount: 1,
    });
    await writeTeam('session-older-lead-only', {
      createdAt: 1000,
      leadSessionId: 'older-session',
      memberCount: 1,
    });

    const found = (await discoverTeam(teams(), sessions()))!;
    expect(found.teamName).toBe('session-newer-lead-only');
  });

  async function age(name: string) {
    const old = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await fs.utimes(path.join(teams(), name, 'config.json'), old, old);
  }

  it('ignores a team whose lead is gone and whose files stopped moving', async () => {
    // Claude Code leaves team directories behind; a console restarted days
    // later latched onto the newest of them and showed a dead team.
    await writeTeam('session-long-dead', { createdAt: 2000, leadSessionId: 'dead-session', memberCount: 7 });
    await age('session-long-dead');

    expect(await discoverTeam(teams(), sessions())).toBeNull();
  });

  it("reads liveness from Claude Code's pid-named session files", async () => {
    await writeTeam('session-running', { createdAt: 1000, leadSessionId: 'running-session', memberCount: 2 });
    await writeTeam('session-newer-dead', { createdAt: 2000, leadSessionId: 'dead-session', memberCount: 2 });
    await age('session-running');
    await age('session-newer-dead');
    await fs.mkdir(sessions(), { recursive: true });
    await fs.writeFile(
      path.join(sessions(), `${process.pid}.json`),
      JSON.stringify({ sessionId: 'running-session', pid: process.pid }),
    );

    expect((await discoverTeam(teams(), sessions()))?.teamName).toBe('session-running');
  });

  it('--session opens the team that session leads, never a newer one elsewhere', async () => {
    await writeTeam('session-mine', { createdAt: 1000, leadSessionId: 'my-session', memberCount: 2 });
    await writeTeam('session-other', { createdAt: 2000, leadSessionId: 'other-session', memberCount: 5 });
    await writeSession('other-session', process.pid);

    const found = await discoverTeam(teams(), sessions(), undefined, { session: 'my-session' });
    expect(found?.teamName).toBe('session-mine');
  });

  it("--session never inherits a finished neighbour's team from the folder they share", async () => {
    const teamDir = path.join(teams(), 'session-aaaa1111');
    await fs.mkdir(teamDir, { recursive: true });
    await fs.writeFile(
      path.join(teamDir, 'config.json'),
      JSON.stringify({
        name: 'session-aaaa1111',
        createdAt: 1000,
        leadAgentId: 'team-lead',
        leadSessionId: 'exited-session',
        members: [
          { agentId: 'team-lead', name: 'team-lead', cwd: '/repo' },
          { agentId: 'agent-1', name: 'agent-1', cwd: '/repo' },
        ],
      }),
    );
    await fs.mkdir(sessions(), { recursive: true });
    await fs.writeFile(
      path.join(sessions(), `${process.pid}.json`),
      JSON.stringify({ sessionId: 'workflow-session', pid: process.pid, cwd: '/repo' }),
    );

    expect(await discoverTeam(teams(), sessions(), undefined, { session: 'workflow-session' })).toBeNull();
  });

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

  it('--session with no team of its own finds none, so the console opens the session itself', async () => {
    await writeTeam('session-other', { createdAt: 2000, leadSessionId: 'other-session', memberCount: 5 });
    await writeSession('other-session', process.pid);

    expect(await discoverTeam(teams(), sessions(), undefined, { session: 'workflow-session' })).toBeNull();
  });
});

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

describe('walkTeams', () => {
  const APP = '/Users/x/code/app';
  const LIVE = 'aaaaaaaa-0000-4000-8000-000000000001';
  const DEAD = 'bbbbbbbb-0000-4000-8000-000000000002';
  const roots = () => [path.join(dir, 'teams'), path.join(dir, 'sessions'), path.join(dir, 'projects')] as const;

  it('keeps a team whose lead process is running, and drops one whose lead is gone', async () => {
    await writeTeamDir(dir, 'session-aaaaaaaa', { leadSessionId: LIVE, members: 3, cwd: APP });
    await writeTeamDir(dir, 'session-bbbbbbbb', { leadSessionId: DEAD, members: 2, cwd: '/Users/x/code/other' });
    const old = (Date.now() - 86_400_000) / 1000;
    await fs.utimes(path.join(dir, 'teams', 'session-bbbbbbbb', 'config.json'), old, old);
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

describe('listLive', () => {
  const APP = '/Users/x/code/app';
  const LIB = '/Users/x/code/lib';
  const A = 'aaaaaaaa-0000-4000-8000-000000000001';
  const B = 'bbbbbbbb-0000-4000-8000-000000000002';
  const roots = () => [path.join(dir, 'teams'), path.join(dir, 'sessions'), path.join(dir, 'projects')] as const;
  const user = (extra: object = {}) => ({ type: 'user', entrypoint: 'cli', gitBranch: 'main', message: 'hi', ...extra });

  it('lists a session that drives its own team once, even with a fresh lead-only directory in its folder', async () => {
    // A resume from the terminal leaves a lead-only team directory behind,
    // keyed to an id that never ran, in the folder the live session works in.
    await writeTeamDir(dir, 'session-aaaaaaaa', { leadSessionId: A, members: 1, cwd: APP });
    await writeTeamDir(dir, 'session-bbbbbbbb', { leadSessionId: B, members: 1, cwd: APP });
    await writeSidecar(dir, process.pid, A, { status: 'busy', cwd: APP, name: 'forensics' });
    await writeTranscript(dir, APP, A, [user()]);
    const [teams, sessions, projects] = roots();

    const { rows, walk } = await listLive(teams, sessions, projects, A);
    expect(rows.map((r) => r.id)).toEqual([A]);
    expect(walk.adopted.has(A)).toBe(false);
  });

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
    const [teams, sessions, projects] = roots();
    expect((await listLive(teams, sessions, projects, '')).rows[0].subagents).toBeUndefined();

    const sub = path.join(dir, 'projects', APP.replace(/[^a-zA-Z0-9]/g, '-'), A, 'subagents');
    await fs.mkdir(sub, { recursive: true });
    await fs.writeFile(path.join(sub, 'agent-a1111222233334444.jsonl'), '');
    expect((await listLive(teams, sessions, projects, '')).rows[0].subagents).toBe(1);
  });

  // A live run leaves only its journal and has no name yet; the snapshot,
  // written at termination, ends it and names it.
  it('carries the session’s workflow run, live until its snapshot lands', async () => {
    await writeSidecar(dir, process.pid, A, { cwd: APP });
    await writeTranscript(dir, APP, A, [user()]);
    const sessionDir = path.join(dir, 'projects', APP.replace(/[^a-zA-Z0-9]/g, '-'), A);
    const runDir = path.join(sessionDir, 'subagents', 'workflows', 'wf_abc123');
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(path.join(runDir, 'journal.jsonl'), '{"type":"started","agentId":"a1"}\n');
    const [teams, sessions, projects] = roots();
    expect((await listLive(teams, sessions, projects, '')).rows[0].workflow).toEqual({ runId: 'wf_abc123', live: true });

    await fs.mkdir(path.join(sessionDir, 'workflows'), { recursive: true });
    await fs.writeFile(
      path.join(sessionDir, 'workflows', 'wf_abc123.json'),
      JSON.stringify({ runId: 'wf_abc123', workflowName: 'team8-plan' }),
    );
    expect((await listLive(teams, sessions, projects, '')).rows[0].workflow).toEqual({
      runId: 'wf_abc123',
      name: 'team8-plan',
      live: false,
    });
  });

  it('lists nothing on a machine with no sessions directory', async () => {
    const [teams, sessions, projects] = roots();
    expect((await listLive(teams, sessions, projects, '')).rows).toEqual([]);
  });
});

describe('fencedSink', () => {
  function recorder(): { live: Store; kinds: string[]; teams: string[] } {
    const kinds: string[] = [];
    const teams: string[] = [];
    const live: Store = {
      append(kind: EventKind, payload: unknown, agent?: string): StoredEvent {
        kinds.push(kind);
        return { seq: kinds.length, ts: 0, kind, agent, payload };
      },
      replay: () => [],
      setTeam: (name: string) => void teams.push(name),
      close: () => {},
    };
    return { live, kinds, teams };
  }

  it('drops what a retired ingest writes after the switch has moved past it', () => {
    const { live, kinds, teams } = recorder();
    let generation = 0;
    const boot = fencedSink(live, 0, () => generation);
    boot.append('roster', {});
    expect(kinds).toEqual(['roster']);

    // The switch revokes the licence BEFORE ingest.close(), so a sweep already
    // awaiting a file and a debounce that has already fired are both inert.
    generation = 1;
    const next = fencedSink(live, 1, () => generation);

    boot.append('roster', {});
    boot.append('mail', {});
    expect(kinds).toEqual(['roster']);

    next.append('task', {});
    expect(kinds).toEqual(['roster', 'task']);
  });

  it("refuses a retired ingest's setTeam, which would yank the console back unannounced", () => {
    const { live, teams } = recorder();
    let generation = 0;
    const boot = fencedSink(live, 0, () => generation);
    generation = 1;
    const next = fencedSink(live, 1, () => generation);

    // main() wires onTeam to store.setTeam, so this is the dangerous one: the
    // operator is on team B and the store silently goes back to team A.
    boot.setTeam('session-98b0b4a7');
    expect(teams).toEqual([]);

    next.setTeam('session-b5129c7b');
    expect(teams).toEqual(['session-b5129c7b']);
  });
});

describe('--session', () => {
  it('carries the session a console was pointed at', () => {
    expect(parseArgs(['--session', 'abc-123']).session).toBe('abc-123');
    expect(parseArgs(['--session=abc-123']).session).toBe('abc-123');
  });

  it('is absent when nothing named one', () => {
    expect(parseArgs([]).session).toBeUndefined();
  });
});

describe('sessionProjectDir', () => {
  const SESSION = '8f2a1c00-3206-455b-aaf6-a5a81ad1e283';

  async function makeSession(slug: string): Promise<string> {
    const target = path.join(dir, 'projects', slug, SESSION);
    await fs.mkdir(path.join(target, 'subagents'), { recursive: true });
    return target;
  }

  it('resolves the directory from the cwd the session record carries', async () => {
    const target = await makeSession('-Users-alanoliv-code-team8');
    expect(await sessionProjectDir(path.join(dir, 'projects'), SESSION, '/Users/alanoliv/code/team8'))
      .toBe(target);
  });

  // The whole point of the fallback: a session that never formed a team is
  // exactly the one whose sessions/<id>.json is most likely missing.
  it('finds it by scanning when there is no session record to name a cwd', async () => {
    const target = await makeSession('-Users-alanoliv-code-other');
    expect(await sessionProjectDir(path.join(dir, 'projects'), SESSION)).toBe(target);
  });

  // A bare solo window — no subagents, no spilled tool results — has only its
  // transcript beside the slug, never a directory. Requiring the directory made
  // `/api/select-session` 404 for exactly the sessions the route serves.
  it('accepts a session that has only its transcript file, with no directory yet', async () => {
    const slug = '-Users-alanoliv-code-team8';
    await fs.mkdir(path.join(dir, 'projects', slug), { recursive: true });
    await fs.writeFile(path.join(dir, 'projects', slug, `${SESSION}.jsonl`), '{}\n');
    expect(await sessionProjectDir(path.join(dir, 'projects'), SESSION)).toBe(
      path.join(dir, 'projects', slug, SESSION),
    );
  });

  it('is null for a session with nothing on disk, and for no projects root at all', async () => {
    await makeSession('-Users-alanoliv-code-team8');
    expect(await sessionProjectDir(path.join(dir, 'projects'), 'not-a-session')).toBeNull();
    expect(await sessionProjectDir(path.join(dir, 'nowhere'), SESSION)).toBeNull();
  });

  // A stale cwd must not shadow the real directory — the session moved, the
  // transcript did not.
  it('falls back to the scan when the recorded cwd points nowhere', async () => {
    const target = await makeSession('-Users-alanoliv-code-other');
    expect(await sessionProjectDir(path.join(dir, 'projects'), SESSION, '/gone')).toBe(target);
  });
});

// The picker's header chip and its folder menu both come off the listing, so a
// scoped response has to carry the scope and the folders beside the rows.
describe('workflowScriptOf', () => {
  const RUN = 'wf_3c49ecab-c51';
  const known = new Set([RUN]);
  const sessionDir = () => path.join(dir, 'session');

  const writeAsExecuted = (body: string) =>
    fs.mkdir(path.join(sessionDir(), 'workflows', 'scripts'), { recursive: true }).then(() =>
      fs.writeFile(path.join(sessionDir(), 'workflows', 'scripts', `deep-research-${RUN}.js`), body),
    );

  const writeSnapshot = (script: string) =>
    fs.mkdir(path.join(sessionDir(), 'workflows'), { recursive: true }).then(() =>
      fs.writeFile(
        path.join(sessionDir(), 'workflows', `${RUN}.json`),
        JSON.stringify({ runId: RUN, workflowName: 'deep-research', script }),
      ),
    );

  it('prefers the copy as executed, which exists from the moment a run starts', async () => {
    await writeAsExecuted('// as executed');
    await writeSnapshot('// from the snapshot');
    const found = await workflowScriptOf(sessionDir(), RUN, known);
    expect(found?.source).toBe('as-executed');
    expect(found?.script).toBe('// as executed');
  });

  it('falls back to the snapshot once a run has terminated without leaving a copy', async () => {
    await writeSnapshot('// from the snapshot');
    const found = await workflowScriptOf(sessionDir(), RUN, known);
    expect(found?.source).toBe('snapshot');
    expect(found?.script).toBe('// from the snapshot');
  });

  it('finds nothing when the run left neither', async () => {
    await fs.mkdir(path.join(sessionDir(), 'workflows'), { recursive: true });
    expect(await workflowScriptOf(sessionDir(), RUN, known)).toBeNull();
  });

  // `runId` arrives from the browser and is about to name a file. The set of
  // runs already ingested from disk is the gate: anything outside it is
  // rejected before a path is built, so no request can steer the read.
  it('refuses a runId the server has never ingested, rather than resolving it', async () => {
    await writeAsExecuted('// as executed');
    await writeSnapshot('// from the snapshot');
    for (const hostile of [
      '../../etc/passwd',
      '..%2f..%2fetc%2fpasswd',
      '/etc/passwd',
      'wf_someone-elses-run',
      `${RUN}/../../../../etc/passwd`,
    ]) {
      expect(await workflowScriptOf(sessionDir(), hostile, known)).toBeNull();
    }
  });

  // The traversal gate must not be the only one: a run that IS known still
  // reads a real directory entry rather than an interpolated path.
  it('resolves inside the session it was handed, never above it', async () => {
    await writeAsExecuted('// as executed');
    const found = await workflowScriptOf(sessionDir(), RUN, known);
    expect(found?.path.startsWith(path.join(sessionDir(), 'workflows'))).toBe(true);
  });
});

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
