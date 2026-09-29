import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LAUNCHER = fileURLToPath(new URL('../../plugin/bin/console-launch.sh', import.meta.url));
const SESSION = '98b0b4a7-3206-455b-aaf6-a5a81ad1e283';

let claudeDir = '';

beforeEach(async () => {
  claudeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'launcher-'));
});

afterEach(async () => {
  await fs.rm(claudeDir, { recursive: true, force: true });
});

interface Run {
  code: number;
  stdout: string;
}

/**
 * OCTO_NO_SPAWN keeps the launcher from starting a real server, so what is
 * under test is only its GATE — which payloads it wakes for.
 */
function launch(payload: unknown, env: Record<string, string> = {}): Promise<Run> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      LAUNCHER,
      {
        env: {
          ...process.env,
          CLAUDE_CONFIG_DIR: claudeDir,
          OCTO_NO_SPAWN: '1',
          OCTO_ROOT: path.dirname(path.dirname(LAUNCHER)),
          ...env,
        },
      },
      (err, stdout) => {
        // A non-zero exit is itself a failure of the contract, so it is
        // reported as the assertion below rather than thrown here.
        const code = (err as { code?: number } | null)?.code ?? 0;
        if (err && typeof code !== 'number') reject(err);
        else resolve({ code, stdout });
      },
    );
    child.stdin!.end(JSON.stringify(payload));
  });
}

describe('console-launch.sh', () => {
  // The whole contract, and the reason this file exists: PreToolUse BLOCKS the
  // tool call, so any exit but 0 stops a teammate — or a workflow — spawning.
  it('always exits 0 and never emits a permission decision', async () => {
    const runs = await Promise.all([
      launch({ hook_event_name: 'PreToolUse', session_id: SESSION, tool_name: 'Workflow' }),
      launch({ hook_event_name: 'PostToolUse', session_id: SESSION, tool_name: 'Workflow' }),
      launch({ hook_event_name: 'PreToolUse', session_id: SESSION, tool_name: 'Bash' }),
      launch({ hook_event_name: 'Stop', session_id: SESSION }),
      launch({}),
    ]);

    for (const run of runs) {
      expect(run.code).toBe(0);
      expect(run.stdout).not.toContain('permissionDecision');
    }
  });

  it('wakes for a Workflow, which the Agent-tool gates could never admit', async () => {
    const run = await launch({
      hook_event_name: 'PostToolUse',
      session_id: SESSION,
      tool_name: 'Workflow',
      tool_response: 'Workflow launched in background.\nRun ID: wf_d36b25c0-f96\n',
    });

    expect(run.stdout).toContain('systemMessage');
    expect(run.stdout).toContain('127.0.0.1');
  });

  it('links a workflow to the session that ran it, not to a team guessed from the folder', async () => {
    // A team rooted in the same folder belongs to some other session.
    const teamDir = path.join(claudeDir, 'teams', 'session-neighbour');
    await fs.mkdir(teamDir, { recursive: true });
    await fs.writeFile(
      path.join(teamDir, 'config.json'),
      JSON.stringify({
        name: 'session-neighbour',
        leadSessionId: 'neighbour-session',
        members: [
          { agentId: 'team-lead', cwd: process.cwd() },
          { agentId: 'agent-1', cwd: process.cwd() },
        ],
      }),
    );

    const run = await launch({ hook_event_name: 'PostToolUse', session_id: SESSION, tool_name: 'Workflow' });

    expect(run.stdout).toContain(`/s/${SESSION}`);
    expect(run.stdout).not.toContain('session-neighbour');
  });

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

  it('stays asleep for an ordinary subagent, which carries no name', async () => {
    const run = await launch({
      hook_event_name: 'PreToolUse',
      session_id: SESSION,
      tool_name: 'Agent',
      tool_input: { prompt: 'go and look at something' },
    });

    expect(run.stdout.trim()).toBe('{}');
  });

  it('announces a workflow session only once', async () => {
    const payload = {
      hook_event_name: 'PostToolUse',
      session_id: SESSION,
      tool_name: 'Workflow',
    };
    const first = await launch(payload);
    const second = await launch(payload);

    expect(first.stdout).toContain('systemMessage');
    expect(second.stdout.trim()).toBe('{}');
  });
});
