import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findSession, loadTraces } from './load';

const at = (s: number) => new Date(Date.UTC(2026, 8, 30, 8, 0, s)).toISOString();
const rec = (uuid: string, s: number, o: object) => JSON.stringify({ uuid, timestamp: at(s), ...o });
const ask = (uuid: string, s: number) => rec(uuid, s, { type: 'user', message: { role: 'user', content: 'go' } });
const call = (uuid: string, s: number, id: string) => rec(uuid, s, { type: 'assistant', message: { id, model: 'claude-opus-5-5', content: [] } });

describe('findSession', () => {
  it("finds the lead and its subagents, with roles from the lead's Agent calls", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'measure-'));
    const project = path.join(home, 'projects', '-Users-x-code');
    const sub = path.join(project, 'sid1', 'subagents');
    await mkdir(sub, { recursive: true });
    await writeFile(
      path.join(project, 'sid1.jsonl'),
      JSON.stringify({
        type: 'assistant',
        timestamp: '2026-09-30T08:00:00Z',
        message: { id: 'm1', model: 'claude-opus-5-5', content: [{ type: 'tool_use', id: 't1', name: 'Agent', input: { name: 'rows', subagent_type: 'team8:executor', prompt: 'p' } }] },
      }) + '\n',
    );
    await writeFile(path.join(sub, 'agent-arows-0123456789abcdef.jsonl'), '');
    await writeFile(path.join(sub, 'agent-arows-0123456789abcdef.meta.json'), JSON.stringify({ name: 'rows', agentType: 'rows' }));
    await writeFile(path.join(sub, 'agent-a5f82aabd3b445aaa.jsonl'), '');

    const files = await findSession(home, 'sid1');
    expect(files?.lead).toBe(path.join(project, 'sid1.jsonl'));
    expect(files?.agents.map((a) => [a.name, a.role])).toEqual([
      ['agent-a5f82aabd3b445aaa', 'other'],
      ['rows', 'executor'],
    ]);
    expect((await loadTraces(files!)).map((t) => [t.name, t.role])).toEqual([
      ['team-lead', 'lead'],
      ['agent-a5f82aabd3b445aaa', 'other'],
      ['rows', 'executor'],
    ]);
    expect(await findSession(home, 'missing')).toBeNull();
  });

  it("takes an unnamed subagent's role from its meta.json agentType", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'measure-'));
    const project = path.join(home, 'projects', '-Users-x-code');
    const sub = path.join(project, 'sid1', 'subagents');
    await mkdir(sub, { recursive: true });
    await writeFile(path.join(project, 'sid1.jsonl'), '');
    await writeFile(path.join(sub, 'agent-a0f1e2d3c4b5a6978.jsonl'), '');
    await writeFile(path.join(sub, 'agent-a0f1e2d3c4b5a6978.meta.json'), JSON.stringify({ agentType: 'team8:reviewer' }));

    const files = await findSession(home, 'sid1');
    expect(files?.agents.map((a) => [a.name, a.role])).toEqual([['agent-a0f1e2d3c4b5a6978', 'reviewer']]);
  });

  it('numbers a respawn after the agent it replaced, whatever the file names', async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'measure-'));
    const project = path.join(home, 'projects', '-Users-x-code');
    const sub = path.join(project, 'sid1', 'subagents');
    await mkdir(sub, { recursive: true });
    await writeFile(path.join(project, 'sid1.jsonl'), '');
    await writeFile(path.join(sub, 'agent-arows-0000000000000000.jsonl'), ask('r2', 3600));
    await writeFile(path.join(sub, 'agent-arows-ffffffffffffffff.jsonl'), ask('r1', 0));

    const files = await findSession(home, 'sid1');
    expect(files?.agents.map((a) => [a.name, path.basename(a.path)])).toEqual([
      ['rows', 'agent-arows-ffffffffffffffff.jsonl'],
      ['rows#2', 'agent-arows-0000000000000000.jsonl'],
    ]);
  });
});

describe('loadTraces', () => {
  it("counts a resumed session's copied history only in its parent", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'measure-'));
    const project = path.join(home, 'projects', '-Users-x-code');
    await mkdir(project, { recursive: true });
    // Like a real parent, it keeps an attachment its child's copy left out.
    await writeFile(path.join(project, 'parent.jsonl'), [ask('u1', 0), call('u2', 5, 'm1'), rec('u3', 6, { type: 'attachment' }), call('u4', 7, 'm2')].join('\n'));
    await writeFile(
      path.join(project, 'child.jsonl'),
      [JSON.stringify({ type: 'custom-title' }), ask('u1', 0), call('u2', 5, 'm1'), call('u4', 7, 'm2'), ask('u5', 100), call('u6', 102, 'm3')].join('\n'),
    );

    const [child] = await loadTraces((await findSession(home, 'child'))!);
    expect(child.calls.map((c) => c.id)).toEqual(['m3']);
    expect(child.firstAt).toBe(Date.parse(at(100)));
    const [parent] = await loadTraces((await findSession(home, 'parent'))!);
    expect(parent.calls.map((c) => c.id)).toEqual(['m1', 'm2']);
  });
});
