import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * The directory that ships as the plugin — `bin/`, `commands/`, `hooks/`,
 * `dist/`. Resolved from THIS MODULE rather than `process.cwd()`, because the
 * launcher starts the server without cd'ing and the cwd is the user's project.
 *
 * It has to answer from two places whose relative depth differs: `src/server/`
 * when a clone runs the source through tsx, and `plugin/dist/server/` when the
 * bundle runs. No single relative path is right for both, so try each and take
 * the one that is actually on disk.
 */
function resolvePluginDir(): string {
  const candidates = ['../../plugin/', '../../'];
  for (const rel of candidates) {
    const dir = fileURLToPath(new URL(rel, import.meta.url));
    if (existsSync(path.join(dir, 'bin', 'console-launch.sh'))) return dir;
  }
  return fileURLToPath(new URL('../../', import.meta.url));
}

export const PLUGIN_DIR = resolvePluginDir();

/** Absolute path to the PostToolUse(Agent) launcher, used by hookBlock(). */
export const LAUNCH_SCRIPT = path.join(PLUGIN_DIR, 'bin', 'console-launch.sh');

/** Absolute path to the restarter every observation hook falls back to. */
export const RESTART_SCRIPT = path.join(PLUGIN_DIR, 'bin', 'console-restart.sh');

/** Absolute path to the SessionStart nudge toward /team8:console, used by hookBlock(). */
export const HINT_SCRIPT = path.join(PLUGIN_DIR, 'bin', 'console-hint.sh');

/**
 * The CLI derives the team name from the lead session id. Verified rule:
 * teamName = "session-" + sessionId.slice(0, 8).
 */
export function teamNameFromSessionId(sessionId: string): string {
  if (!sessionId || sessionId.length < 8) return '';
  return `session-${sessionId.slice(0, 8)}`;
}

/**
 * A pid file can outlive the process it names (crash, kill -9), so a recorded
 * pid is only evidence once the OS agrees it is still running.
 */
export function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means the process exists but we may not signal it — still alive.
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * Claude Code keeps a pool of pre-warmed processes, and a finished background
 * session's process is RECYCLED into it, where it lingers for hours as
 * `claude bg-spare …`. Its session record is never updated, so a pid check
 * alone still calls that session live: the dropdown kept offering a
 * conversation that ended four hours earlier, marked `1 agent live`, on a
 * machine with one terminal open.
 *
 * Parsed apart from the `ps` call so the rule is testable without a spare.
 */
export function sparePidsFrom(psOutput: string): Set<number> {
  const spares = new Set<number>();
  for (const line of psOutput.split('\n')) {
    const m = /^\s*(\d+)\s+(.*)$/.exec(line);
    if (m && m[2].includes('bg-spare')) spares.add(Number(m[1]));
  }
  return spares;
}

/**
 * One `ps` for every pid at once — a listing runs on each poll, so this must
 * not be a subprocess per session. An unreadable `ps` yields no spares, which
 * keeps the old behaviour rather than hiding every session.
 */
export async function recycledSpares(pids: number[]): Promise<Set<number>> {
  const wanted = pids.filter((p) => Number.isInteger(p) && p > 0);
  if (wanted.length === 0) return new Set();
  try {
    const { stdout } = await execFileAsync('ps', ['-p', wanted.join(','), '-o', 'pid=,command=']);
    return sparePidsFrom(stdout);
  } catch {
    return new Set();
  }
}
