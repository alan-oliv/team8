import { readFileSync, statSync } from 'node:fs';
import type { PlanProgress } from '../shared/domain';
import type { TranscriptPayload } from './project';
import type { StoredEvent } from './store';
import { parsePlan, sectionOf } from '../../plugin/hooks/team';

export { parsePlan, sectionOf };

const PLAN_PATH = /\/docs\/team8\/plans\/[^/]+\.md$/;
type ToolUse = { type?: string; name?: string; input?: { file_path?: unknown } };

/** The plan is whichever file the lead itself wrote, never a folder guess. */
export function planPathOf(events: StoredEvent[], lead: string): string | undefined {
  let found: string | undefined;
  for (const ev of events) {
    if (ev.kind !== 'transcript') continue;
    const payload = ev.payload as TranscriptPayload;
    if (payload.agent !== lead) continue;
    for (const rec of payload.records) {
      const content = rec.message?.content;
      if (!Array.isArray(content)) continue;
      for (const block of content as ToolUse[]) {
        if (block.type !== 'tool_use' || (block.name !== 'Write' && block.name !== 'Edit')) continue;
        const file = block.input?.file_path;
        if (typeof file === 'string' && PLAN_PATH.test(file)) found = file;
      }
    }
  }
  return found;
}

export interface PlanReader {
  read(events: StoredEvent[], lead: string, session: string): PlanProgress | undefined;
  task(n: number): string | undefined;
}

function textOf(file: string): string | undefined {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

export function createPlanReader(): PlanReader {
  // The store keeps 1,000 transcript records per agent, so the writes that
  // named the plan age out of a long session; the path outlives them here.
  // ponytail: in memory only, so a restart after they aged out loses the tab;
  // persist it per session if a tab that old ever matters.
  const known = new Map<string, string>();
  let last: PlanProgress | undefined;

  return {
    read(events, lead, session) {
      const seen = planPathOf(events, lead);
      if (seen) known.set(session, seen);
      const file = known.get(session);
      if (!file) return (last = undefined);
      let mtime: number;
      try {
        mtime = statSync(file).mtimeMs;
      } catch {
        return (last = undefined);
      }
      if (last?.path === file && last.mtime === mtime) return last;
      const text = textOf(file);
      if (text === undefined) return (last = undefined);
      return (last = { path: file, mtime, tasks: parsePlan(text) });
    },
    task(n) {
      if (!last) return undefined;
      const text = textOf(last.path);
      return text === undefined ? undefined : sectionOf(text, n);
    },
  };
}
