import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { askContext, readAskContext, readTailLines } from './ask-context';

const ts = '2026-10-17T10:00:00.000Z';
const assistant = (uuid: string, content: unknown[]) =>
  JSON.stringify({ type: 'assistant', uuid, timestamp: ts, message: { role: 'assistant', content } });
const user = (uuid: string, content: unknown) =>
  JSON.stringify({ type: 'user', uuid, timestamp: ts, message: { role: 'user', content } });
const text = (t: string) => ({ type: 'text', text: t });
const ask = { type: 'tool_use', id: 'tu1', name: 'AskUserQuestion', input: { questions: [] } };

describe('askContext', () => {
  it('takes the text block just before the call in the same record', () => {
    expect(askContext([assistant('a1', [text('Two choices change the markup.'), ask])])).toBe(
      'Two choices change the markup.',
    );
  });

  it('takes the text from an earlier assistant record of the same step', () => {
    const lines = [
      user('u1', 'build the board toggle'),
      assistant('a1', [text('Pia finished the toggle.\n\nThat decides where she writes it, so I would rather ask.')]),
      assistant('a2', [ask]),
    ];
    expect(askContext(lines)).toBe('That decides where she writes it, so I would rather ask.');
  });

  it('stops at a user record rather than borrow text from an earlier step', () => {
    const lines = [
      assistant('a1', [text('Reading the config first.')]),
      user('u2', [{ type: 'tool_result', tool_use_id: 't0', content: 'ok' }]),
      assistant('a2', [ask]),
    ];
    expect(askContext(lines)).toBeUndefined();
  });

  it('answers for the latest call when there were several', () => {
    const lines = [
      assistant('a1', [text('First question.'), ask]),
      user('u1', [{ type: 'tool_result', tool_use_id: 'tu1', content: 'answered' }]),
      assistant('a2', [text('Second question.'), { ...ask, id: 'tu2' }]),
    ];
    expect(askContext(lines)).toBe('Second question.');
  });

  it('ignores a call that already has its result, since the current call may not be flushed yet', () => {
    const lines = [
      assistant('a1', [text('Old question.'), ask]),
      user('u1', [{ type: 'tool_result', tool_use_id: 'tu1', content: 'answered' }]),
    ];
    expect(askContext(lines)).toBeUndefined();
  });

  it('is undefined with no AskUserQuestion call, and skips lines that do not parse', () => {
    expect(askContext([assistant('a1', [text('hello')]), '{"truncated', ''])).toBeUndefined();
  });
});

describe('readTailLines and readAskContext', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ask-context-'));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('drops the partial first line when it reads only the tail', async () => {
    const file = path.join(dir, 't.jsonl');
    // 21 bytes; the last 12 start inside the a-run, so that line is cut and dropped.
    await fs.writeFile(file, 'aaaaaaaaaa\nbbbb\ncccc\n');
    expect(await readTailLines(file, 12)).toEqual(['bbbb', 'cccc', '']);
    expect(await readTailLines(file)).toEqual(['aaaaaaaaaa', 'bbbb', 'cccc', '']);
  });

  it('reads the context from a transcript file, and is undefined for a missing one', async () => {
    const file = path.join(dir, 'lead.jsonl');
    await fs.writeFile(file, `${assistant('a1', [text('Which jobs block the release?'), ask])}\n`);
    expect(await readAskContext(file)).toBe('Which jobs block the release?');
    expect(await readAskContext(path.join(dir, 'missing.jsonl'))).toBeUndefined();
    expect(await readAskContext(undefined)).toBeUndefined();
  });
});
