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
