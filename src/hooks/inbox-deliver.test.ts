import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { InboxEntry } from '../shared/mailbox';
import { deliver, metaCandidates } from './inbox-deliver';

const ID = 'arows-0123456789abcdef';
const msg = (text: string, over: Partial<InboxEntry> = {}): InboxEntry => ({
  from: 'team-lead', text, summary: 'note', timestamp: '2026-09-30T20:00:00.000Z', msgV: 1, msg_id: text.slice(0, 8), type: 'message', read: false, ...over,
});

async function setup(meta: object, entries: InboxEntry[] | null) {
  const home = await mkdtemp(path.join(os.tmpdir(), 'inbox-deliver-'));
  const project = path.join(home, 'projects', 'proj');
  await mkdir(path.join(project, 'sid', 'subagents'), { recursive: true });
  await writeFile(path.join(project, 'sid.jsonl'), '');
  await writeFile(path.join(project, 'sid', 'subagents', `agent-${ID}.meta.json`), JSON.stringify(meta));
  const inbox = path.join(home, 'teams', 't1', 'inboxes', 'rows.json');
  if (entries) {
    await mkdir(path.dirname(inbox), { recursive: true });
    await writeFile(inbox, JSON.stringify(entries));
  }
  return { teams: path.join(home, 'teams'), inbox, input: { agent_id: ID, session_id: 'sid', transcript_path: path.join(project, 'sid.jsonl') } };
}
const readInbox = async (f: string) => JSON.parse(await readFile(f, 'utf8')) as InboxEntry[];
const outputOf = (out: string | null) => (JSON.parse(out!) as { hookSpecificOutput: { hookEventName: string; additionalContext: string } }).hookSpecificOutput;

describe('metaCandidates', () => {
  it("looks beside a subagent's own transcript, then under the lead's session folder", () => {
    expect(metaCandidates({ agent_id: ID, session_id: 'sid', transcript_path: `/p/proj/sid/subagents/agent-${ID}.jsonl` })[0]).toBe(`/p/proj/sid/subagents/agent-${ID}.meta.json`);
    expect(metaCandidates({ agent_id: ID, session_id: 'sid', transcript_path: '/p/proj/lead.jsonl' })).toEqual([
      `/p/proj/lead/subagents/agent-${ID}.meta.json`,
      `/p/proj/sid/subagents/agent-${ID}.meta.json`,
    ]);
    expect(metaCandidates({ session_id: 'sid', transcript_path: '/p/proj/lead.jsonl' })).toEqual([]);
  });
});

describe('deliver', () => {
  it('hands over unread plain messages, marks them read, and leaves protocol frames and read ones alone', async () => {
    const shutdown = msg(JSON.stringify({ type: 'shutdown_request', request_id: 'r1' }));
    const { teams, inbox, input } = await setup({ name: 'rows', teamName: 't1' }, [msg('Fix the header, please.'), shutdown, msg('Old news.', { read: true })]);
    const out = outputOf(await deliver(input, teams));
    expect(out.hookEventName).toBe('PostToolUse');
    expect(out.additionalContext).toContain('<teammate-message teammate_id="team-lead" summary="note">\nFix the header, please.\n</teammate-message>');
    expect(out.additionalContext).not.toContain('shutdown_request');
    expect(out.additionalContext).not.toContain('Old news.');
    expect((await readInbox(inbox)).map((e) => e.read)).toEqual([true, false, true]);
  });

  it('returns nothing and leaves the inbox alone when nothing is unread', async () => {
    const { teams, inbox, input } = await setup({ name: 'rows', teamName: 't1' }, [msg('Old news.', { read: true })]);
    const before = await readFile(inbox, 'utf8');
    expect(await deliver(input, teams)).toBeNull();
    expect(await readFile(inbox, 'utf8')).toBe(before);
  });

  it('does nothing for a plain subagent, whose meta names no team, or when the inbox does not exist', async () => {
    expect(await deliver((await setup({ name: 'x' }, null)).input, '/nonexistent')).toBeNull();
    const { teams, input } = await setup({ name: 'rows', teamName: 't1' }, null);
    expect(await deliver(input, teams)).toBeNull();
  });

  it('leaves messages past the context cap for the end of the turn, and says so', async () => {
    const big = 'x'.repeat(6_000);
    const { teams, inbox, input } = await setup({ name: 'rows', teamName: 't1' }, [msg(`A${big}`), msg(`B${big}`)]);
    const out = outputOf(await deliver(input, teams));
    expect(out.additionalContext).toContain(`A${big}`);
    expect(out.additionalContext).not.toContain(`B${big}`);
    expect(out.additionalContext).toContain('1 more message will arrive when your turn ends.');
    expect((await readInbox(inbox)).map((e) => e.read)).toEqual([true, false]);
  });
});
