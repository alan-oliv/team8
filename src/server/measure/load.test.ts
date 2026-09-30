import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findSession, loadTraces } from './load';

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
    await writeFile(path.join(sub, 'agent-arows-0123456789abcdef.meta.json'), JSON.stringify({ name: 'rows' }));
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
});
