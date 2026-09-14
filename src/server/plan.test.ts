import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { StoredEvent } from './store';
import { createPlanReader, parsePlan, planPathOf, sectionOf } from './plan';

const PLAN = `# Thing Implementation Plan

- [ ] **Step 0: a stray checkbox before any task**

### Task 1: Add the type

**Files:**
- Modify: \`src/a.ts\`

- [ ] **Step 1: Write the failing test**

### Task 2: Serve it

**Files:**
- Create: \`src/b.ts\`

### Task 3: Draw it

- [x] **Step 1: Done already**
`;

// A plan quoting another plan's template: four backticks around three.
const QUOTED =
  '### Task 1: Real\n\n````markdown\n### Task 9: Quoted\n\n```ts\nconst x = 1;\n```\n\n- [ ] **Step 1: A quoted step**\n````\n';

function toolCall(agent: string, name: string, filePath: string, seq: number): StoredEvent {
  return {
    seq,
    ts: 0,
    kind: 'transcript',
    agent,
    payload: {
      agent,
      records: [
        {
          type: 'assistant',
          uuid: `rec-${seq}`,
          message: {
            role: 'assistant',
            content: [{ type: 'tool_use', id: `toolu_${seq}`, name, input: { file_path: filePath } }],
          },
        },
      ],
    },
  };
}

describe('parsePlan', () => {
  it('reads each task heading and whether its steps are written', () => {
    expect(parsePlan(PLAN)).toEqual([
      { n: 1, title: 'Add the type', written: true },
      { n: 2, title: 'Serve it', written: false },
      { n: 3, title: 'Draw it', written: true },
    ]);
  });

  it('has no tasks before the first heading', () => {
    expect(parsePlan('# Just a header\n\n- [ ] **Step 1: stray**\n')).toEqual([]);
  });

  it('ignores headings and steps quoted in fenced code', () => {
    expect(parsePlan(QUOTED)).toEqual([{ n: 1, title: 'Real', written: false }]);
  });
});

describe('sectionOf', () => {
  it('returns one task from its heading to the next', () => {
    const section = sectionOf(PLAN, 2)!;
    expect(section.startsWith('### Task 2: Serve it')).toBe(true);
    expect(section).toContain('src/b.ts');
    expect(section).not.toContain('Task 3');
  });

  it('runs the last task to the end of the file', () => {
    expect(sectionOf(PLAN, 3)).toBe('### Task 3: Draw it\n\n- [x] **Step 1: Done already**');
  });

  it('knows no task that is not there', () => {
    expect(sectionOf(PLAN, 9)).toBeUndefined();
  });

  it('keeps a quoted heading inside the section that quotes it', () => {
    expect(sectionOf(QUOTED, 1)).toBe(QUOTED.trimEnd());
    expect(sectionOf(QUOTED, 9)).toBeUndefined();
  });
});

describe('planPathOf', () => {
  it('takes the newest plan file the lead wrote or edited', () => {
    const events = [
      toolCall('team-lead', 'Write', '/r/docs/team8/plans/a.md', 1),
      toolCall('team-lead', 'Edit', '/r/src/x.ts', 2),
      toolCall('team-lead', 'Edit', '/r/docs/team8/plans/b.md', 3),
    ];
    expect(planPathOf(events, 'team-lead')).toBe('/r/docs/team8/plans/b.md');
  });

  it('ignores other agents, reads, specs and nested folders', () => {
    const events = [
      toolCall('planner', 'Write', '/r/docs/team8/plans/theirs.md', 1),
      toolCall('team-lead', 'Read', '/r/docs/team8/plans/read.md', 2),
      toolCall('team-lead', 'Write', '/r/docs/team8/specs/s-design.md', 3),
      toolCall('team-lead', 'Write', '/r/docs/team8/plans/old/x.md', 4),
    ];
    expect(planPathOf(events, 'team-lead')).toBeUndefined();
  });
});

describe('createPlanReader', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'plan-'));
    mkdirSync(path.join(dir, 'docs', 'team8', 'plans'), { recursive: true });
    file = path.join(dir, 'docs', 'team8', 'plans', '2026-09-13-thing.md');
    writeFileSync(file, PLAN);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('reads the progress of the plan the lead wrote', () => {
    const reader = createPlanReader();
    const plan = reader.read([toolCall('team-lead', 'Write', file, 1)], 'team-lead', 's1');
    expect(plan).toEqual({ path: file, mtime: statSync(file).mtimeMs, tasks: parsePlan(PLAN) });
  });

  it('keeps the path after the records that named it are gone', () => {
    const reader = createPlanReader();
    reader.read([toolCall('team-lead', 'Write', file, 1)], 'team-lead', 's1');
    expect(reader.read([], 'team-lead', 's1')?.path).toBe(file);
  });

  it('does not hand one session another session\'s plan', () => {
    const reader = createPlanReader();
    reader.read([toolCall('team-lead', 'Write', file, 1)], 'team-lead', 's1');
    expect(reader.read([], 'team-lead', 's2')).toBeUndefined();
  });

  it('re-reads the file when it changes', () => {
    const reader = createPlanReader();
    const events = [toolCall('team-lead', 'Write', file, 1)];
    reader.read(events, 'team-lead', 's1');
    writeFileSync(file, PLAN.replace('- Create: `src/b.ts`', '- Create: `src/b.ts`\n\n- [ ] **Step 1: Serve**'));
    const later = new Date(Date.now() + 5_000);
    utimesSync(file, later, later);
    const plan = reader.read(events, 'team-lead', 's1')!;
    expect(plan.tasks[1].written).toBe(true);
    expect(plan.mtime).toBe(statSync(file).mtimeMs);
  });

  it('serves one task\'s section of the plan it last read', () => {
    const reader = createPlanReader();
    expect(reader.task(1)).toBeUndefined();
    reader.read([toolCall('team-lead', 'Write', file, 1)], 'team-lead', 's1');
    expect(reader.task(2)).toBe(sectionOf(PLAN, 2));
    expect(reader.task(9)).toBeUndefined();
  });

  it('has no plan once the file is gone', () => {
    const reader = createPlanReader();
    const events = [toolCall('team-lead', 'Write', file, 1)];
    reader.read(events, 'team-lead', 's1');
    rmSync(file);
    expect(reader.read(events, 'team-lead', 's1')).toBeUndefined();
  });
});
