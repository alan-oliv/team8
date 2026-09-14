import { readFileSync, statSync } from 'node:fs';
import type { PlanProgress, PlanTask } from '../shared/domain';
import type { TranscriptPayload } from './project';
import type { StoredEvent } from './store';

const PLAN_PATH = /\/docs\/team8\/plans\/[^/]+\.md$/;
const TASK_HEADING = /^### Task (\d+): (.+)$/;
const STEP = /^- \[[ x]\] \*\*Step/;
const FENCE = /^\s*(`{3,}|~{3,})/;

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

/**
 * Per line, whether it sits inside a fenced code block. A plan that quotes
 * another plan — this repo's plans about the plan skill do — must not grow
 * tasks from its examples. A fence closes only on a bare run of the same
 * character at least as long, so ```` can wrap ```.
 */
function fencedLines(lines: string[]): boolean[] {
  let open: string | null = null;
  return lines.map((line) => {
    const fence = FENCE.exec(line)?.[1];
    if (open === null) {
      if (!fence) return false;
      open = fence;
      return true;
    }
    if (fence && fence[0] === open[0] && fence.length >= open.length && line.trim() === fence) open = null;
    return true;
  });
}

export function parsePlan(text: string): PlanTask[] {
  const lines = text.split('\n');
  const fenced = fencedLines(lines);
  const tasks: PlanTask[] = [];
  lines.forEach((line, i) => {
    if (fenced[i]) return;
    const heading = TASK_HEADING.exec(line);
    if (heading) tasks.push({ n: Number(heading[1]), title: heading[2].trim(), written: false });
    else if (tasks.length > 0 && STEP.test(line)) tasks[tasks.length - 1].written = true;
  });
  return tasks;
}

export function sectionOf(text: string, n: number): string | undefined {
  const lines = text.split('\n');
  const fenced = fencedLines(lines);
  const headingAt = (i: number) => (fenced[i] ? null : TASK_HEADING.exec(lines[i]));
  const start = lines.findIndex((_, i) => headingAt(i)?.[1] === String(n));
  if (start === -1) return undefined;
  const next = lines.findIndex((_, i) => i > start && headingAt(i) !== null);
  return lines.slice(start, next === -1 ? lines.length : next).join('\n').trimEnd();
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
