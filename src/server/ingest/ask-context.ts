import { promises as fs } from 'node:fs';
import { parseLine, type TranscriptRecord } from '../../shared/transcript';

// The call was just written, so it sits in the last few records; a big tool
// result before it is the only thing that could push it further back.
const TAIL_BYTES = 256 * 1024;

type Block = { type?: string; text?: unknown; name?: unknown; id?: unknown; tool_use_id?: unknown };

const blocksOf = (rec: TranscriptRecord): Block[] =>
  rec.type === 'assistant' && Array.isArray(rec.message?.content) ? (rec.message.content as Block[]) : [];

function lastParagraph(text: string): string {
  const paragraphs = text.trim().split(/\n\s*\n/);
  return paragraphs[paragraphs.length - 1].trim();
}

/**
 * Claude's own words just before its latest AskUserQuestion call: the last
 * paragraph of the nearest assistant text block in the same step. Undefined
 * when there is no call, or no text between the call and the step's start.
 */
export function askContext(lines: string[]): string | undefined {
  const recs = lines.map(parseLine).filter((r): r is TranscriptRecord => r !== null);

  // The hook can fire before the current call is flushed to the transcript; the
  // latest call in the tail is then an answered one, whose text is stale.
  const answered = new Set<unknown>();
  for (const rec of recs) {
    const content = rec.type === 'user' ? rec.message?.content : undefined;
    if (Array.isArray(content)) for (const b of content as Block[]) if (b?.type === 'tool_result') answered.add(b.tool_use_id);
  }

  let at = -1;
  let blockAt = -1;
  for (let i = recs.length - 1; i >= 0 && at < 0; i--) {
    const blocks = blocksOf(recs[i]);
    for (let k = blocks.length - 1; k >= 0; k--) {
      if (blocks[k]?.type === 'tool_use' && blocks[k].name === 'AskUserQuestion' && !answered.has(blocks[k].id)) {
        at = i;
        blockAt = k;
        break;
      }
    }
  }
  if (at < 0) return undefined;

  for (let i = at; i >= 0; i--) {
    if (recs[i].type === 'user') return undefined;
    const blocks = blocksOf(recs[i]);
    for (let k = (i === at ? blockAt : blocks.length) - 1; k >= 0; k--) {
      const b = blocks[k];
      if (b?.type === 'text' && typeof b.text === 'string' && b.text.trim()) return lastParagraph(b.text);
    }
  }
  return undefined;
}

/** The file's last `maxBytes`, split into lines; a line cut by the window's start is dropped. */
export async function readTailLines(file: string, maxBytes = TAIL_BYTES): Promise<string[]> {
  const fh = await fs.open(file, 'r');
  try {
    const { size } = await fh.stat();
    const start = Math.max(0, size - maxBytes);
    const buf = Buffer.alloc(size - start);
    await fh.read(buf, 0, buf.length, start);
    const lines = buf.toString('utf8').split('\n');
    return start > 0 ? lines.slice(1) : lines;
  } finally {
    await fh.close();
  }
}

/** askContext over a transcript file's tail. Never throws: a missing context only drops a line. */
export async function readAskContext(file: string | undefined): Promise<string | undefined> {
  if (!file) return undefined;
  try {
    return askContext(await readTailLines(file));
  } catch {
    return undefined;
  }
}
