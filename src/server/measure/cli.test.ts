import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runMeasure } from './cli';

describe('runMeasure', () => {
  it('fails with a message for an unknown session or a bad --since', async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'measure-cli-'));
    const said: string[] = [];
    expect(await runMeasure({ claudeHome: home, sessionId: 'nope', json: false }, (t) => said.push(t))).toBe(1);
    expect(await runMeasure({ claudeHome: home, sessionId: 'nope', json: false, since: 'yesterday' }, (t) => said.push(t))).toBe(1);
    expect(said).toEqual([`No transcript for session nope under ${home}/projects`, '--since needs an ISO time, got "yesterday"']);
  });
});
