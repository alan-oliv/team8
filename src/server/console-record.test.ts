import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { recordPathFor, writeConsoleRecord } from './console-record';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'record-'));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('console record', () => {
  it('sits beside the store, where the scripts read it', () => {
    expect(recordPathFor('/home/me/.claude/team8/events.db')).toBe('/home/me/.claude/team8/console.json');
  });

  it('replaces the whole record and leaves no temporary file behind', async () => {
    const file = path.join(dir, 'team8', 'console.json');
    await writeConsoleRecord(file, { pid: 1, port: 4823, version: '1.0.44', watching: { kind: 'auto' } });
    await writeConsoleRecord(file, { pid: 1, port: 4823, version: '1.0.44', watching: { kind: 'team', name: 't' } });

    expect(JSON.parse(await fs.readFile(file, 'utf8')).watching).toEqual({ kind: 'team', name: 't' });
    expect(await fs.readdir(path.dirname(file))).toEqual(['console.json']);
  });
});
