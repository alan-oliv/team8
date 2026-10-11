import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import lockfile from 'proper-lockfile';
import { atomicWrite } from '../server/control/mailbox';
import { parseInboxEntry, type InboxEntry } from '../shared/mailbox';

export interface HookInput { agent_id?: string; session_id?: string; transcript_path?: string }

// Claude Code caps injected context at 10,000 characters; what doesn't fit arrives at turn end as before.
const CAP = 9_000;

// A teammate's meta.json (name, teamName) sits beside its transcript:
// <project>/<session>/subagents/agent-<agent_id>.meta.json. The team's own leadSessionId
// can't lead there: after a resume the lead's session id is not the team's.
export function metaCandidates(input: HookInput): string[] {
  const { agent_id: id, session_id: sid, transcript_path: transcript } = input;
  if (!id || !transcript) return [];
  const file = `agent-${id}.meta.json`;
  const dir = path.dirname(transcript);
  return [
    ...(path.basename(dir) === 'subagents' ? [path.join(dir, file)] : []),
    path.join(dir, path.basename(transcript, '.jsonl'), 'subagents', file),
    ...(sid && sid !== path.basename(transcript, '.jsonl') ? [path.join(dir, sid, 'subagents', file)] : []),
  ];
}

export function inboxFor(input: HookInput, teamsRoot: string): { inbox: string; name: string } | null {
  for (const candidate of metaCandidates(input)) {
    if (!existsSync(candidate)) continue;
    const meta = JSON.parse(readFileSync(candidate, 'utf8')) as { name?: unknown; teamName?: unknown };
    if (typeof meta.name !== 'string' || typeof meta.teamName !== 'string') return null; // a plain subagent: no team, no inbox
    return { inbox: path.join(teamsRoot, meta.teamName, 'inboxes', `${meta.name}.json`), name: meta.name };
  }
  return null;
}

export function frame(e: InboxEntry): string {
  const summary = e.summary ? ` summary="${e.summary.replace(/"/g, "'")}"` : '';
  return `<teammate-message teammate_id="${e.from}"${summary}>\n${e.text}\n</teammate-message>`;
}

// Unread plain messages, oldest first, that fit under the cap. Protocol frames wait for turn end.
export function takeDeliverable(entries: InboxEntry[], to: string): { take: number[]; left: number } {
  const take: number[] = [];
  let size = 0;
  let left = 0;
  entries.forEach((e, i) => {
    if (e.read || parseInboxEntry(e, to).protocol) return;
    const n = frame(e).length;
    if (size + n > CAP) {
      left++;
      return;
    }
    size += n;
    take.push(i);
  });
  return { take, left };
}

export function contextFor(delivered: InboxEntry[], left: number): string {
  const lines = ['Messages that reached you mid-turn (team8 delivered them early; they will not repeat at the end of your turn):', ...delivered.map(frame)];
  if (left) lines.push(`${left} more message${left === 1 ? '' : 's'} will arrive when your turn ends.`);
  return lines.join('\n');
}

export async function deliver(input: HookInput, teamsRoot: string): Promise<string | null> {
  const target = inboxFor(input, teamsRoot);
  if (!target || !existsSync(target.inbox)) return null;
  // The same lock the console's mailbox writer and Claude Code take on an inbox.
  const release = await lockfile.lock(target.inbox, {
    lockfilePath: `${target.inbox}.lock`,
    realpath: false,
    retries: { retries: 20, minTimeout: 10, maxTimeout: 200 },
  });
  try {
    const entries = JSON.parse(readFileSync(target.inbox, 'utf8')) as InboxEntry[];
    if (!Array.isArray(entries)) return null;
    const { take, left } = takeDeliverable(entries, target.name);
    if (!take.length) return null;
    for (const i of take) entries[i] = { ...entries[i], read: true };
    await atomicWrite(target.inbox, JSON.stringify(entries, null, 2));
    return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: contextFor(take.map((i) => entries[i]), left) } });
  } finally {
    await release();
  }
}

// The PostToolUse hook: hook JSON on stdin, hook output on stdout, silence on anything else.
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  let raw = '';
  process.stdin.on('data', (chunk) => (raw += chunk));
  process.stdin.on('end', () => {
    const teamsRoot = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'teams');
    Promise.resolve()
      .then(() => deliver(JSON.parse(raw || '{}') as HookInput, teamsRoot))
      .then((out) => { if (out) process.stdout.write(out); }, () => {})
      .finally(() => process.exit(0));
  });
}
