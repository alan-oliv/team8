import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Watching } from '../shared/domain';

export interface ConsoleRecord {
  pid: number;
  port: number;
  version: string;
  watching: Watching;
}

/** Beside the store, under <claude home>/team8/. */
export function recordPathFor(dbPath: string): string {
  return path.join(path.dirname(dbPath), 'console.json');
}

let seq = 0;

/** Written whole and then renamed, so a script never reads half a record. */
export async function writeConsoleRecord(file: string, record: ConsoleRecord): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  // One temp name per write: two watch changes in a row must not share a file.
  const tmp = `${file}.${process.pid}.${++seq}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(record));
  await fs.rename(tmp, file);
}
