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
