import { promises as fs } from 'node:fs';
import { parseLine, type TranscriptRecord } from '../../shared/transcript';

// The call was just written, so it sits in the last few records; a big tool
// result before it is the only thing that could push it further back.
const TAIL_BYTES = 256 * 1024;

// Claude Code writes the call's record together with the text that came before
// it in the same response, and the PermissionRequest hook fires before that
// write: how long to wait for them, and how often to look.
export const ASK_FLUSH_WAIT_MS = 2000;
const ASK_FLUSH_POLL_MS = 100;

type Block = { type?: string; text?: unknown; name?: unknown; id?: unknown; tool_use_id?: unknown };

const blocksOf = (rec: TranscriptRecord): Block[] =>
  rec.type === 'assistant' && Array.isArray(rec.message?.content) ? (rec.message.content as Block[]) : [];

const parseRecs = (lines: string[]): TranscriptRecord[] =>
  lines.map(parseLine).filter((r): r is TranscriptRecord => r !== null);

/** The latest AskUserQuestion call with no result yet, as its record and block index. */
function pendingAsk(recs: TranscriptRecord[]): { at: number; blockAt: number } | undefined {
  const answered = new Set<unknown>();
  for (const rec of recs) {
    const content = rec.type === 'user' ? rec.message?.content : undefined;
    if (Array.isArray(content)) for (const b of content as Block[]) if (b?.type === 'tool_result') answered.add(b.tool_use_id);
  }
  for (let i = recs.length - 1; i >= 0; i--) {
    const blocks = blocksOf(recs[i]);
    for (let k = blocks.length - 1; k >= 0; k--) {
      if (blocks[k]?.type === 'tool_use' && blocks[k].name === 'AskUserQuestion' && !answered.has(blocks[k].id)) {
        return { at: i, blockAt: k };
      }
    }
  }
  return undefined;
}

/**
 * Claude's own words just before its latest AskUserQuestion call: the nearest
 * assistant text block in the same step, whole. With no unanswered call in the
 * tail the step is the one the tail ends in. Undefined when there is no text
 * between the call, or the tail's end, and the step's start.
 */
function contextOf(recs: TranscriptRecord[]): string | undefined {
  if (recs.length === 0) return undefined;
  const call = pendingAsk(recs);
  const at = call?.at ?? recs.length - 1;
  const blockAt = call?.blockAt ?? blocksOf(recs[at]).length;

  for (let i = at; i >= 0; i--) {
    if (recs[i].type === 'user') return undefined;
    const blocks = blocksOf(recs[i]);
    for (let k = (i === at ? blockAt : blocks.length) - 1; k >= 0; k--) {
      const b = blocks[k];
      if (b?.type === 'text' && typeof b.text === 'string' && b.text.trim()) return b.text.trim();
    }
  }
  return undefined;
}

export function askContext(lines: string[]): string | undefined {
  return contextOf(parseRecs(lines));
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

/**
 * askContext over a transcript file's tail, once the call itself has landed
 * there or `waitMs` has passed. Never throws: a missing context only drops a line.
 */
export async function readAskContext(
  file: string | undefined,
  waitMs = ASK_FLUSH_WAIT_MS,
  everyMs = ASK_FLUSH_POLL_MS,
): Promise<string | undefined> {
  if (!file) return undefined;
  try {
    const until = Date.now() + waitMs;
    for (;;) {
      const recs = parseRecs(await readTailLines(file));
      if (pendingAsk(recs) || Date.now() >= until) return contextOf(recs);
      await new Promise((r) => setTimeout(r, everyMs));
    }
  } catch {
    return undefined;
  }
}
