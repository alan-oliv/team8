# Markdown Rendering Implementation Plan

> **For agentic workers:** this plan is executed by teammates that `team8:run` dispatches from the shared task list. Read your own task section. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every markdown construct a message carries renders as what it means in the console — a real table, a link, a quote, a nested or checked item — instead of its source characters.

**Architecture:** `src/shared/markdown.ts` is the one parser: `inlines()` for spans inside a line, `blocks()` for the shape of a message. It grows one variant per construct, each a pure function change with its own test. `Prose` is the one renderer of those blocks; it moves out of the 1500-line `TranscriptFeed.tsx` into `src/web/components/Prose.tsx` and grows one branch per variant. Every place that shows prose (the expanded transcript drawer, the workflow output tab) already goes through `Prose`, so nothing else changes.

**Tech Stack:** TypeScript, React 18, vitest (jsdom for component tests, `@testing-library/react`). No new dependencies.

**Spec:** none — bounded path. The design was approved in chat on 2026-10-16: tables first, then every construct the parser currently leaves as literal text (links, strikethrough, italic, blockquotes, horizontal rules, nested list items, checkbox items). The run log is `docs/team8/runs/2026-10-16-markdown-rendering.md`.

## Global Constraints

- No new dependencies. The parser stays a deliberate subset: a construct that does not appear in transcripts stays literal text (reference-style links, footnotes, HTML, nested emphasis inside emphasis).
- Inline styles with the existing theme tokens, as `TranscriptFeed.tsx` does. Colours only from: `--color-text`, `--color-neutral-300/400/500/600/700/800/900`, `--color-accent-400`, `--term`, `--json-string`, `--json-number`. Radius `--radius-sm`. No new CSS classes.
- Every element a test needs carries a `data-testid` prefixed `md-` (existing: `md-heading`, `md-item`, `md-code`, `md-table`).
- Fenced and indented code is split off before `Prose` ever sees the text (`segments()` in `src/shared/code.ts`). Do not touch `code.ts`.
- Comments say why, never what. Match the voice of the existing header comments in `markdown.ts`.
- Each task: `npx vitest run <its test files>` green, then `npx tsc --noEmit` clean, then commit by path with a message in the repo's `Area: sentence` style.
- Do not touch the uncommitted `docs/` moves in the working tree (deleted `docs/design_handoff_team8_mod/*`, untracked `docs/design/`). They are the user's. Commit by path only.

## File Structure

- `src/shared/markdown.ts` — parser. `Inline` gains `link`, `strike`, `em`. `Block` gains a parsed `table`, `pre` (pipe lines with no separator), `quote`, `rule`; `item` gains `depth` and `checked`.
- `src/shared/markdown.test.ts` — one `it` per construct, pure, no DOM.
- `src/web/components/Prose.tsx` — new. `Prose`, `Spans`, `MarkdownTable`. Moved out of `TranscriptFeed.tsx` in Task 1, then one branch per construct.
- `src/web/components/Prose.test.tsx` — new. Renders `<Prose text=… />` alone under jsdom; `Prose` uses no context or hook.
- `src/web/components/TranscriptFeed.tsx` — loses `Prose` and `Spans` (lines 578–662), imports `Prose` from `./Prose`. `CodeBlock` stays here.
- `src/web/views/WorkflowOutput.tsx` — line 3 import path only.

One track, five tasks in order: every task edits `markdown.ts` and `Prose.tsx`, so no two can run side by side.

---

### Task 1: `Prose` moves to its own file

**Files:**
- Create: `src/web/components/Prose.tsx`
- Modify: `src/web/components/TranscriptFeed.tsx:21`, `src/web/components/TranscriptFeed.tsx:578-662`
- Modify: `src/web/views/WorkflowOutput.tsx:3`
- Test: `src/web/components/TranscriptFeed.test.tsx` (existing, unchanged — the `markdown in an expanded row` block at line 643 is the regression check)

**Interfaces:**
- Consumes: `blocks`, `Inline` from `src/shared/markdown.ts` as they are today.
- Produces: `export function Prose({ text }: { text: string }): JSX.Element` and `export function Spans({ spans }: { spans: Inline[] }): JSX.Element` from `src/web/components/Prose.tsx`. Every later task edits this file.

This is a move with no behaviour change. The existing feed test is the gate: it must pass before and after.

- [ ] **Step 1: Run the regression check before touching anything**

Run: `npx vitest run src/web/components/TranscriptFeed.test.tsx -t "markdown in an expanded row"`
Expected: PASS (1 test). If it fails here, stop and say so — the branch is not where this plan assumes.

- [ ] **Step 2: Create `src/web/components/Prose.tsx` with `Spans` and `Prose` moved verbatim**

Cut lines 578–662 of `src/web/components/TranscriptFeed.tsx` (from `function Spans(` through the closing `}` of `export function Prose`) and paste them into the new file under this header. Keep the bodies character for character; only the imports and the `export` on `Spans` are new.

```tsx
/**
 * The markdown a message carries, rendered rather than shown as source.
 *
 * Only the constructs that actually appear in transcripts — see
 * shared/markdown.ts for why the subset is deliberate. Lives apart from the
 * feed because every surface that shows prose (the expanded drawer, the
 * workflow output tab) renders it the same way, and the feed file is long
 * enough already.
 */
import { blocks as mdBlocks, type Inline } from '../../shared/markdown';

export function Spans({ spans }: { spans: Inline[] }) {
  // …body exactly as it was in TranscriptFeed.tsx…
}

export function Prose({ text }: { text: string }) {
  // …body exactly as it was in TranscriptFeed.tsx…
}
```

- [ ] **Step 3: Point the feed and the workflow tab at the new file**

In `src/web/components/TranscriptFeed.tsx`, line 21 currently reads:

```ts
import { blocks as mdBlocks, type Inline } from '../../shared/markdown';
```

Replace it with:

```ts
import { Prose } from './Prose';
```

Then confirm nothing else in the file used `mdBlocks` or the `Inline` type: `grep -n "mdBlocks\|: Inline\|Inline\[\]" src/web/components/TranscriptFeed.tsx` should print nothing. (`Prose` is still used at the former line 1317, inside the drawer body.)

In `src/web/views/WorkflowOutput.tsx`, line 3 currently reads:

```ts
import { Prose } from '../components/TranscriptFeed';
```

Replace it with:

```ts
import { Prose } from '../components/Prose';
```

- [ ] **Step 4: Typecheck and run the regression check again**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npx vitest run src/web/components/TranscriptFeed.test.tsx src/web/views`
Expected: PASS, same counts as before.

- [ ] **Step 5: Commit**

```bash
git add src/web/components/Prose.tsx src/web/components/TranscriptFeed.tsx src/web/views/WorkflowOutput.tsx
git commit -m "Prose: moves out of the feed into its own file"
```

### Task 2: Tables

**Files:**
- Modify: `src/shared/markdown.ts`
- Modify: `src/shared/markdown.test.ts`
- Modify: `src/web/components/Prose.tsx`
- Create: `src/web/components/Prose.test.tsx`

**Interfaces:**
- Consumes: `Prose`, `Spans` from Task 1.
- Produces, exported from `src/shared/markdown.ts`:
  - `export type Align = 'left' | 'right' | 'center';`
  - `Block` variant `{ kind: 'table'; header: Inline[][]; align: Align[]; rows: Inline[][][] }` — `align[i]` is the separator's marker for column `i` when it has one, else `'right'` when every non-empty body cell in the column is a number, else `'left'`.
  - `Block` variant `{ kind: 'pre'; lines: string[] }` — a run of pipe lines with no separator row, kept verbatim. The old `{ kind: 'table'; lines }` shape is gone.
  - `export function isNumeric(text: string): boolean` — `/^\$?-?\d[\d,]*(\.\d+)?%?$/` on the trimmed text.
- Produces, in `src/web/components/Prose.tsx`: `MarkdownTable` (not exported) with test ids `md-table` (the scrolling wrapper), `md-th`, `md-td`; and `md-pre` for the verbatim fallback.

The reason this task exists: the terminal prints a pipe table with no padding, so the pipes land wherever the cell text ends and the eye cannot follow a column. The console showed the same lines in `white-space: pre`. A real `<table>` is the fix; the measure report (`src/server/measure/report.ts:91-128`) is the shape to design for — nine columns, numbers in most of them, one or two prose columns.

- [ ] **Step 1: Write the failing parser tests**

In `src/shared/markdown.test.ts`, replace the two table tests (`keeps a table verbatim`, `separates a table from the prose around it`) with these, inside `describe('blocks', …)`:

```ts
  it('reads a table into header, alignment and rows', () => {
    const out = blocks('| what | n |\n|---|---|\n| tests | 607 |\n| files | 12 |');
    expect(out).toEqual([
      {
        kind: 'table',
        header: [[{ kind: 'text', text: 'what' }], [{ kind: 'text', text: 'n' }]],
        align: ['left', 'right'],
        rows: [
          [[{ kind: 'text', text: 'tests' }], [{ kind: 'text', text: '607' }]],
          [[{ kind: 'text', text: 'files' }], [{ kind: 'text', text: '12' }]],
        ],
      },
    ]);
  });

  // A separator marker is the author's call; without one, a column of numbers
  // lines up on the right the way a column of numbers should.
  it('takes alignment from the separator markers, else from the cells', () => {
    const out = blocks('| a | b | c | d |\n|:---:|---:|:---|---|\n| 1 | x | 2 | 3.5 |\n| 2 | y | 4 | $1,200 |');
    expect(out[0].kind === 'table' && out[0].align).toEqual(['center', 'right', 'left', 'right']);
  });

  it('leaves a column left-aligned when one cell is not a number', () => {
    const out = blocks('| t | n |\n|---|---|\n| 00:59 | 1 |\n| 1.0 | 2 |');
    expect(out[0].kind === 'table' && out[0].align).toEqual(['left', 'right']);
  });

  it('renders inline markdown inside a cell', () => {
    const out = blocks('| k |\n|---|\n| **bold** and `code` |');
    expect(out[0].kind === 'table' && out[0].rows[0][0]).toEqual([
      { kind: 'strong', text: 'bold' },
      { kind: 'text', text: ' and ' },
      { kind: 'code', text: 'code' },
    ]);
  });

  it('pads a short row and drops a long one to the header width', () => {
    const out = blocks('| a | b |\n|---|---|\n| 1 |\n| 1 | 2 | 3 |');
    expect(out[0].kind === 'table' && out[0].rows.map((r) => r.length)).toEqual([2, 2]);
    expect(out[0].kind === 'table' && out[0].rows[0][1]).toEqual([{ kind: 'text', text: '' }]);
  });

  // Pipe lines with no separator are not a table in GFM; the shape the author
  // wrote still reads better than a paragraph that swallows the newlines.
  it('keeps pipe lines with no separator row verbatim', () => {
    expect(blocks('| what | n |\n| tests | 607 |')).toEqual([
      { kind: 'pre', lines: ['| what | n |', '| tests | 607 |'] },
    ]);
  });

  it('separates a table from the prose around it', () => {
    expect(blocks('before\n| a |\n|---|\n| 1 |\nafter').map((b) => b.kind)).toEqual(['para', 'table', 'para']);
  });
```

And a new describe at the bottom of the file:

```ts
describe('isNumeric', () => {
  it('accepts the numbers a report prints', () => {
    for (const t of ['607', '-3', '3.5', '1,200', '$0.42', '12%', ' 7 ']) expect(isNumeric(t)).toBe(true);
  });
  it('rejects times, words and empty cells', () => {
    for (const t of ['00:59', 'tests 6.9', '', '1.2.3', 'v2']) expect(isNumeric(t)).toBe(false);
  });
});
```

Add `isNumeric` to the import at the top: `import { blocks, inlines, isNumeric } from './markdown';`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/shared/markdown.test.ts`
Expected: FAIL — `isNumeric` is not exported, and the table tests get `{ kind: 'table', lines: […] }`.

- [ ] **Step 3: Parse the table**

In `src/shared/markdown.ts`:

Replace the last two sentences of the file header comment ("Tables stay verbatim — …for nothing.") with:

```
 * A pipe table becomes a real table: the terminal prints it unpadded, so the
 * pipes fall wherever each cell ends and no column can be followed by eye.
```

Replace the `table` variant of `Block` and add `Align` and `pre`:

```ts
export type Align = 'left' | 'right' | 'center';

export type Block =
  | { kind: 'heading'; level: number; spans: Inline[] }
  | { kind: 'para'; spans: Inline[] }
  | { kind: 'item'; spans: Inline[]; ordered: boolean }
  | { kind: 'table'; header: Inline[][]; align: Align[]; rows: Inline[][][] }
  // Pipe lines with no separator row: not a table in GFM, kept as written.
  | { kind: 'pre'; lines: string[] };
```

Add, below the regex constants:

```ts
const SEPARATOR = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const NUMERIC = /^\$?-?\d[\d,]*(\.\d+)?%?$/;

export function isNumeric(text: string): boolean {
  return NUMERIC.test(text.trim());
}

function cells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

function markerAlign(cell: string): Align | undefined {
  const left = cell.startsWith(':');
  const right = cell.endsWith(':');
  return left && right ? 'center' : right ? 'right' : left ? 'left' : undefined;
}

function plain(spans: Inline[]): string {
  return spans.map((s) => s.text).join('');
}

function parseTable(lines: string[]): Block {
  if (lines.length < 2 || !SEPARATOR.test(lines[1].trim())) return { kind: 'pre', lines };
  const header = cells(lines[0]).map(inlines);
  const width = header.length;
  const fit = (row: string[]) => {
    const out = row.slice(0, width);
    while (out.length < width) out.push('');
    return out.map(inlines);
  };
  const rows = lines.slice(2).map((l) => fit(cells(l)));
  const markers = cells(lines[1]).map(markerAlign);
  const align = header.map((_, i) => {
    const marker = markers[i];
    if (marker) return marker;
    const texts = rows.map((r) => plain(r[i])).filter((t) => t !== '');
    return texts.length > 0 && texts.every(isNumeric) ? 'right' : 'left';
  });
  return { kind: 'table', header, align, rows };
}
```

In `blocks()`, change `flushTable` to push the parsed block:

```ts
  const flushTable = () => {
    if (table.length > 0) out.push(parseTable(table));
    table = [];
  };
```

(`parseTable`, not `table`: the buffer inside `blocks()` already has that name.)

- [ ] **Step 4: Run the parser tests**

Run: `npx vitest run src/shared/markdown.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: one error, in `src/web/components/Prose.tsx` — `b.lines` no longer exists on the `table` variant. That is Step 6's job.

- [ ] **Step 5: Write the failing render test**

Create `src/web/components/Prose.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Prose } from './Prose';

afterEach(cleanup);

describe('a pipe table', () => {
  const TABLE = '| Agent | Wall | Cost |\n|---|---|---|\n| lead | 1429.7 | $4.10 |\n| server | 27.2 | $0.42 |';

  it('renders as a real table with a header row', () => {
    render(<Prose text={TABLE} />);
    expect(screen.getAllByTestId('md-th').map((th) => th.textContent)).toEqual(['Agent', 'Wall', 'Cost']);
    expect(screen.getAllByTestId('md-td')).toHaveLength(6);
    expect(screen.getByTestId('md-table').textContent).not.toContain('|');
  });

  it('right-aligns the numeric columns and leaves the prose one on the left', () => {
    render(<Prose text={TABLE} />);
    const [agent, wall, cost] = screen.getAllByTestId('md-th');
    expect(agent.style.textAlign).toBe('left');
    expect(wall.style.textAlign).toBe('right');
    expect(cost.style.textAlign).toBe('right');
  });

  it('renders inline markdown inside a cell', () => {
    render(<Prose text={'| k |\n|---|\n| `code` |'} />);
    expect(screen.getByTestId('md-code').textContent).toBe('code');
  });

  it('keeps pipe lines with no separator as written', () => {
    render(<Prose text={'| a | b |\n| 1 | 2 |'} />);
    expect(screen.getByTestId('md-pre').textContent).toBe('| a | b |\n| 1 | 2 |');
  });
});
```

Run: `npx vitest run src/web/components/Prose.test.tsx`
Expected: FAIL — no `md-th`, and the typecheck error from Step 4 surfaces at render.

- [ ] **Step 6: Render the table**

In `src/web/components/Prose.tsx`, add below `Spans`:

```tsx
/**
 * Header on the text colour, body one step down, hairline rows from the same
 * token as the drawer's rule. Cells never wrap: a nine-column report scrolls
 * sideways inside its own box rather than folding every number onto two lines.
 */
function MarkdownTable({ header, align, rows }: Extract<Block, { kind: 'table' }>) {
  const cell = (i: number): CSSProperties => ({
    textAlign: align[i],
    padding: '3px 12px 3px 0',
    verticalAlign: 'top',
  });
  return (
    <div data-testid="md-table" style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', whiteSpace: 'nowrap', lineHeight: 1.5 }}>
        <thead>
          <tr>
            {header.map((spans, i) => (
              <th
                key={i}
                data-testid="md-th"
                style={{
                  ...cell(i),
                  color: 'var(--color-text)',
                  fontWeight: 700,
                  borderBottom: '1px solid var(--color-neutral-800)',
                }}
              >
                <Spans spans={spans} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((spans, i) => (
                <td
                  key={i}
                  data-testid="md-td"
                  style={{
                    ...cell(i),
                    color: 'var(--color-neutral-300)',
                    borderBottom: '1px solid var(--color-neutral-900)',
                  }}
                >
                  <Spans spans={spans} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

Change the import line to bring in the type and `CSSProperties`:

```ts
import type { CSSProperties } from 'react';
import { blocks as mdBlocks, type Block, type Inline } from '../../shared/markdown';
```

In `Prose`, replace the `b.kind === 'table'` branch (the `whiteSpace: 'pre'` div) with two branches:

```tsx
        ) : b.kind === 'table' ? (
          <MarkdownTable key={i} {...b} />
        ) : b.kind === 'pre' ? (
          <div
            key={i}
            data-testid="md-pre"
            style={{ whiteSpace: 'pre', overflowX: 'auto', color: 'var(--color-neutral-400)', lineHeight: 1.5 }}
          >
            {b.lines.join('\n')}
          </div>
        ) : (
```

- [ ] **Step 7: Run every check**

Run: `npx vitest run src/shared/markdown.test.ts src/web/components/Prose.test.tsx src/web/components/TranscriptFeed.test.tsx`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/shared/markdown.ts src/shared/markdown.test.ts src/web/components/Prose.tsx src/web/components/Prose.test.tsx
git commit -m "Markdown: a pipe table renders as a table, numbers on the right"
```

### Task 3: Links, strikethrough, italic

**Files:**
- Modify: `src/shared/markdown.ts`
- Modify: `src/shared/markdown.test.ts`
- Modify: `src/web/components/Prose.tsx`
- Modify: `src/web/components/Prose.test.tsx`

**Interfaces:**
- Consumes: `Spans` from Task 1, `inlines()` as it is.
- Produces, `Inline` variants exported from `src/shared/markdown.ts`:
  - `{ kind: 'link'; text: string; href: string }` — only for `http://` and `https://` hrefs. Any other `[text](target)` stays literal text.
  - `{ kind: 'strike'; text: string }` for `~~x~~`.
  - `{ kind: 'em'; text: string }` for `*x*` (single asterisk only; `_x_` is left alone because of snake_case).
- Produces, in `Spans`: test ids `md-link`, `md-strike`, `md-em`.

The one regex in `inlines()` matches every inline construct in a single pass so none can split another (a `*` inside backticks, a backtick inside bold). The three new constructs join that regex as alternatives; they do not get regexes of their own.

- [ ] **Step 1: Write the failing parser tests**

In `src/shared/markdown.test.ts`, inside `describe('inlines', …)`, add:

```ts
  it('reads an http link, and leaves any other target as text', () => {
    expect(inlines('see [docs](https://x.y/z) now')).toEqual([
      { kind: 'text', text: 'see ' },
      { kind: 'link', text: 'docs', href: 'https://x.y/z' },
      { kind: 'text', text: ' now' },
    ]);
    // A repo path is not a URL the console can open; the source still reads.
    expect(inlines('read [the plan](docs/team8/plans/x.md) first')).toEqual([
      { kind: 'text', text: 'read [the plan](docs/team8/plans/x.md) first' },
    ]);
  });

  it('reads strikethrough and italic', () => {
    expect(inlines('~~old~~ and *soft*')).toEqual([
      { kind: 'strike', text: 'old' },
      { kind: 'text', text: ' and ' },
      { kind: 'em', text: 'soft' },
    ]);
  });

  // Multiplication, globs and snake_case are the asterisks and underscores a
  // transcript actually carries; none of them is emphasis.
  it('leaves asterisks that are not emphasis alone', () => {
    for (const t of ['2 * 3 * 4', 'a*b*c', 'src/**/*.ts', 'snake_case_name', '_private']) {
      expect(inlines(t)).toEqual([{ kind: 'text', text: t }]);
    }
  });

  it('still reads bold next to italic', () => {
    expect(inlines('**a** *b*')).toEqual([
      { kind: 'strong', text: 'a' },
      { kind: 'text', text: ' ' },
      { kind: 'em', text: 'b' },
    ]);
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/shared/markdown.test.ts`
Expected: FAIL — the link, strike and em cases come back as plain text.

- [ ] **Step 3: Extend `inlines()`**

In `src/shared/markdown.ts`, replace the `Inline` type:

```ts
export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; text: string }
  | { kind: 'em'; text: string }
  | { kind: 'strike'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'link'; text: string; href: string };
```

Replace the `INLINE` constant and its comment:

```ts
// Every inline construct in one pass, so none can split another: `**bold**`,
// `~~strike~~`, `` `code` ``, `[text](href)`, and `*italic*` last so the
// double asterisk is tried first. Italic needs a non-space, non-asterisk
// character on both ends and nothing word-like outside, which is what keeps
// `2 * 3`, `a*b*c` and `**/*.ts` as text. `_italic_` is not read: snake_case.
const INLINE =
  /(\*\*)(?=\S)([\s\S]*?\S)\1|(~~)(?=\S)([\s\S]*?\S)\3|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|(?<![\w*])\*([^\s*](?:[^*]*?[^\s*])?)\*(?![\w*])/g;
const HTTP = /^https?:\/\//;
```

Replace the body of `inlines()`:

```ts
export function inlines(text: string): Inline[] {
  const out: Inline[] = [];
  // Adjacent text stays one span, so a link the console cannot open does not
  // split the sentence around it into three pieces.
  const pushText = (t: string) => {
    const last = out[out.length - 1];
    if (last?.kind === 'text') last.text += t;
    else out.push({ kind: 'text', text: t });
  };
  let last = 0;
  INLINE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE.exec(text)) !== null) {
    if (m.index > last) pushText(text.slice(last, m.index));
    if (m[2] !== undefined) out.push({ kind: 'strong', text: m[2] });
    else if (m[4] !== undefined) out.push({ kind: 'strike', text: m[4] });
    else if (m[5] !== undefined) out.push({ kind: 'code', text: m[5] });
    else if (m[6] !== undefined) {
      if (HTTP.test(m[7])) out.push({ kind: 'link', text: m[6], href: m[7] });
      else pushText(m[0]);
    } else out.push({ kind: 'em', text: m[8] });
    last = m.index + m[0].length;
  }
  if (last < text.length) pushText(text.slice(last));
  return out.length > 0 ? out : [{ kind: 'text', text }];
}
```

- [ ] **Step 4: Run the parser tests**

Run: `npx vitest run src/shared/markdown.test.ts`
Expected: PASS, including the four pre-existing `inlines` tests.

- [ ] **Step 5: Write the failing render test**

In `src/web/components/Prose.test.tsx`, add:

```tsx
describe('inline constructs', () => {
  it('renders a link that opens in a new tab', () => {
    render(<Prose text="see [docs](https://x.y/z)" />);
    const a = screen.getByTestId('md-link') as HTMLAnchorElement;
    expect(a.tagName).toBe('A');
    expect(a.getAttribute('href')).toBe('https://x.y/z');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noreferrer');
    expect(a.textContent).toBe('docs');
  });

  it('renders strikethrough and italic without their markers', () => {
    render(<Prose text="~~old~~ *soft*" />);
    expect(screen.getByTestId('md-strike').textContent).toBe('old');
    expect(screen.getByTestId('md-em').textContent).toBe('soft');
    const text = screen.getByTestId('md-strike').parentElement!.textContent!;
    expect(text).not.toContain('~');
    expect(text).not.toContain('*');
  });
});
```

Run: `npx vitest run src/web/components/Prose.test.tsx`
Expected: FAIL — no `md-link`, `md-strike`, `md-em`.

- [ ] **Step 6: Render the three spans**

In `src/web/components/Prose.tsx`, inside `Spans`, add three branches before the final plain `<span>`:

```tsx
        ) : s.kind === 'link' ? (
          <a
            key={i}
            data-testid="md-link"
            href={s.href}
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--color-accent-400)', textDecoration: 'underline', textUnderlineOffset: '2px' }}
          >
            {s.text}
          </a>
        ) : s.kind === 'strike' ? (
          <span
            key={i}
            data-testid="md-strike"
            style={{ textDecoration: 'line-through', color: 'var(--color-neutral-500)' }}
          >
            {s.text}
          </span>
        ) : s.kind === 'em' ? (
          <em key={i} data-testid="md-em" style={{ fontStyle: 'italic' }}>
            {s.text}
          </em>
        ) : (
```

- [ ] **Step 7: Run every check**

Run: `npx vitest run src/shared/markdown.test.ts src/web/components/Prose.test.tsx src/web/components/TranscriptFeed.test.tsx`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/shared/markdown.ts src/shared/markdown.test.ts src/web/components/Prose.tsx src/web/components/Prose.test.tsx
git commit -m "Markdown: links open, strikethrough strikes, italic leans"
```

### Task 4: Blockquotes and horizontal rules

**Files:**
- Modify: `src/shared/markdown.ts`
- Modify: `src/shared/markdown.test.ts`
- Modify: `src/web/components/Prose.tsx`
- Modify: `src/web/components/Prose.test.tsx`

**Interfaces:**
- Consumes: `blocks()` with the Task 2 table parse in place (the rule check runs before the bullet check, and a `|`-led line still wins over everything).
- Produces, `Block` variants exported from `src/shared/markdown.ts`:
  - `{ kind: 'quote'; spans: Inline[] }` — consecutive `> ` lines join into one quote the way prose lines join into one paragraph.
  - `{ kind: 'rule' }` for a line of three or more `-`, `*` or `_` (spaces allowed between).
- Produces, in `Prose`: test ids `md-quote`, `md-rule`.

A quote is a run of `> ` lines that joins like a paragraph. A rule is a line that is nothing but three or more of one of `-`, `*`, `_`. The rule check must run before the bullet check: `- - -` is a rule, and the bullet regex would otherwise read it as an item whose text is `- -`.

- [ ] **Step 1: Write the failing parser tests**

In `src/shared/markdown.test.ts`, inside `describe('blocks', …)`, add:

```ts
  it('joins consecutive quote lines into one quote', () => {
    expect(blocks('> one line\n> and its continuation')).toEqual([
      { kind: 'quote', spans: [{ kind: 'text', text: 'one line and its continuation' }] },
    ]);
  });

  it('ends a quote at the first unquoted line', () => {
    expect(blocks('> q\nafter').map((b) => b.kind)).toEqual(['quote', 'para']);
  });

  it('reads a horizontal rule in each of its spellings', () => {
    for (const t of ['---', '***', '___', '- - -', '  ----  ']) expect(blocks(t)).toEqual([{ kind: 'rule' }]);
  });

  it('does not mistake a dash-led sentence or a two-dash line for a rule', () => {
    expect(blocks('-- not a rule').map((b) => b.kind)).toEqual(['para']);
    expect(blocks('- an item').map((b) => b.kind)).toEqual(['item']);
  });

  it('breaks a paragraph at a rule', () => {
    expect(blocks('a\n---\nb').map((b) => b.kind)).toEqual(['para', 'rule', 'para']);
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/shared/markdown.test.ts`
Expected: FAIL — quote and rule lines come back as paragraphs.

- [ ] **Step 3: Parse quotes and rules**

In `src/shared/markdown.ts`, add the two variants to `Block`:

```ts
  | { kind: 'quote'; spans: Inline[] }
  | { kind: 'rule' }
```

Add the two regexes beside `HEADING`:

```ts
const QUOTE = /^\s*>\s?(.*)$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
```

In `blocks()`, add a `quote` buffer beside `para` and `table`, a `flushQuote`, and fold it into `flush`:

```ts
  let quote: string[] = [];

  const flushQuote = () => {
    if (quote.length > 0) out.push({ kind: 'quote', spans: inlines(quote.filter((l) => l !== '').join(' ')) });
    quote = [];
  };
  const flush = () => {
    flushPara();
    flushQuote();
    flushTable();
  };
```

Then rewrite the top of the loop body so a quote line is read right after the table check and every other line closes an open quote first. The loop becomes:

```ts
  for (const line of text.split('\n')) {
    if (line.trim().startsWith('|')) {
      flushPara();
      flushQuote();
      table.push(line);
      continue;
    }
    flushTable();

    const quoted = QUOTE.exec(line);
    if (quoted) {
      flushPara();
      quote.push(quoted[1]);
      continue;
    }
    flushQuote();

    if (line.trim() === '') {
      flushPara();
      continue;
    }
    if (RULE.test(line)) {
      flushPara();
      out.push({ kind: 'rule' });
      continue;
    }
    const heading = HEADING.exec(line);
    // …the heading, bullet, ordered and para handling below is unchanged…
```

- [ ] **Step 4: Run the parser tests**

Run: `npx vitest run src/shared/markdown.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing render test**

In `src/web/components/Prose.test.tsx`, add:

```tsx
describe('quotes and rules', () => {
  it('renders a quote without its angle brackets', () => {
    render(<Prose text={'> one\n> two'} />);
    expect(screen.getByTestId('md-quote').textContent).toBe('one two');
  });

  it('renders a rule as an element, not as dashes', () => {
    render(<Prose text={'a\n---\nb'} />);
    expect(screen.getByTestId('md-rule')).toBeTruthy();
    expect(screen.getByTestId('md-rule').textContent).toBe('');
  });
});
```

Run: `npx vitest run src/web/components/Prose.test.tsx`
Expected: FAIL — no `md-quote`, no `md-rule`.

- [ ] **Step 6: Render them**

In `src/web/components/Prose.tsx`, inside `Prose`, add two branches before the final paragraph `<span>`:

```tsx
        ) : b.kind === 'quote' ? (
          <div
            key={i}
            data-testid="md-quote"
            style={{
              borderLeft: '2px solid var(--color-neutral-800)',
              paddingLeft: '10px',
              color: 'var(--color-neutral-400)',
              lineHeight: 1.65,
            }}
          >
            <Spans spans={b.spans} />
          </div>
        ) : b.kind === 'rule' ? (
          <div key={i} data-testid="md-rule" style={{ height: '1px', background: 'var(--color-neutral-900)', margin: '4px 0' }} />
        ) : (
```

- [ ] **Step 7: Run every check**

Run: `npx vitest run src/shared/markdown.test.ts src/web/components/Prose.test.tsx src/web/components/TranscriptFeed.test.tsx`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/shared/markdown.ts src/shared/markdown.test.ts src/web/components/Prose.tsx src/web/components/Prose.test.tsx
git commit -m "Markdown: a quote gets its bar, a rule gets its line"
```

### Task 5: Nested and checkbox list items

**Files:**
- Modify: `src/shared/markdown.ts`
- Modify: `src/shared/markdown.test.ts`
- Modify: `src/web/components/Prose.tsx`
- Modify: `src/web/components/Prose.test.tsx`

**Interfaces:**
- Consumes: the `item` block and its `md-item` rendering as they stand after Task 4.
- Produces: the `item` variant becomes `{ kind: 'item'; spans: Inline[]; ordered: boolean; depth: number; checked?: boolean }`. `depth` is `floor(leading spaces / 2)` with a tab counted as two spaces; `checked` is set only when the item text starts with `[ ]`, `[x]` or `[X]`, and that marker is stripped from `spans`.
- Produces, in `Prose`: the `md-item` element carries `data-depth` and, for a checkbox item, `data-checked="true" | "false"`.

Known limit, not this task's to fix: `segments()` in `src/shared/code.ts` reads an indented line that follows a blank line as pasted code, so a nested item separated from its parent by a blank line never reaches `blocks()`. Nested items written the usual way, directly under their parent, do.

- [ ] **Step 1: Write the failing parser tests**

In `src/shared/markdown.test.ts`, inside `describe('blocks', …)`, add:

```ts
  it('reads nesting from the indent, two spaces or a tab per level', () => {
    const out = blocks('- a\n  - b\n    - c\n\t- d');
    expect(out.map((b) => (b.kind === 'item' ? b.depth : null))).toEqual([0, 1, 2, 1]);
  });

  it('reads a checkbox item and strips its marker', () => {
    const out = blocks('- [ ] todo\n- [x] done\n- [X] also done\n- [ ]not one');
    expect(out.map((b) => (b.kind === 'item' ? b.checked : null))).toEqual([false, true, true, undefined]);
    expect(out[0].kind === 'item' && out[0].spans).toEqual([{ kind: 'text', text: 'todo' }]);
  });

  it('gives a plain item depth 0 and no checked field', () => {
    expect(blocks('- a')).toEqual([
      { kind: 'item', spans: [{ kind: 'text', text: 'a' }], ordered: false, depth: 0 },
    ]);
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/shared/markdown.test.ts`
Expected: FAIL — `depth` is undefined, the checkbox marker stays in the text.

- [ ] **Step 3: Parse depth and the checkbox**

In `src/shared/markdown.ts`, change the `item` variant of `Block`:

```ts
  | { kind: 'item'; spans: Inline[]; ordered: boolean; depth: number; checked?: boolean }
```

Replace the two list regexes so the indent is captured, and add the checkbox one:

```ts
const BULLET = /^(\s*)[-*]\s+(.*)$/;
const ORDERED = /^(\s*)\d+[.)]\s+(.*)$/;
const CHECK = /^\[( |x|X)\]\s+(.*)$/;
```

Add, above `blocks()`:

```ts
// Two spaces per level, the width a teammate's lists actually use; a tab
// counts as one level so a tabbed list does not flatten.
function item(indent: string, text: string, ordered: boolean): Block {
  const depth = Math.floor(indent.replace(/\t/g, '  ').length / 2);
  const check = CHECK.exec(text);
  if (check) return { kind: 'item', spans: inlines(check[2]), ordered, depth, checked: check[1] !== ' ' };
  return { kind: 'item', spans: inlines(text), ordered, depth };
}
```

In `blocks()`, the two list branches become:

```ts
    const bullet = BULLET.exec(line);
    if (bullet) {
      flushPara();
      out.push(item(bullet[1], bullet[2], false));
      continue;
    }
    const ordered = ORDERED.exec(line);
    if (ordered) {
      flushPara();
      out.push(item(ordered[1], ordered[2], true));
      continue;
    }
```

- [ ] **Step 4: Run the parser tests**

Run: `npx vitest run src/shared/markdown.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing render test**

In `src/web/components/Prose.test.tsx`, add:

```tsx
describe('list items', () => {
  it('indents by depth', () => {
    render(<Prose text={'- a\n  - b\n    - c'} />);
    const items = screen.getAllByTestId('md-item');
    expect(items.map((el) => el.getAttribute('data-depth'))).toEqual(['0', '1', '2']);
    expect(items[2].style.paddingLeft).toBe('28px');
    expect(items[0].style.paddingLeft).toBe('0px');
  });

  it('shows a checkbox item as checked or not, with the marker gone', () => {
    render(<Prose text={'- [ ] todo\n- [x] done\n- plain'} />);
    const items = screen.getAllByTestId('md-item');
    expect(items.map((el) => el.getAttribute('data-checked'))).toEqual(['false', 'true', null]);
    expect(items[1].textContent).toContain('done');
    expect(items[1].textContent).not.toContain('[x]');
  });
});
```

Run: `npx vitest run src/web/components/Prose.test.tsx`
Expected: FAIL — no `data-depth`, the marker text is still there.

- [ ] **Step 6: Render depth and the checkbox**

In `src/web/components/Prose.tsx`, replace the `b.kind === 'item'` branch of `Prose`:

```tsx
        ) : b.kind === 'item' ? (
          <div
            key={i}
            data-testid="md-item"
            data-depth={b.depth}
            data-checked={b.checked === undefined ? undefined : String(b.checked)}
            style={{ display: 'flex', gap: '7px', lineHeight: 1.65, paddingLeft: `${b.depth * 14}px` }}
          >
            <span style={{ color: 'var(--color-neutral-600)', flex: 'none' }}>
              {b.checked === undefined ? (b.ordered ? '·' : '–') : b.checked ? '☑' : '☐'}
            </span>
            <span style={{ color: b.checked ? 'var(--color-neutral-500)' : 'var(--color-neutral-300)', minWidth: 0 }}>
              <Spans spans={b.spans} />
            </span>
          </div>
```

- [ ] **Step 7: Run every check, then the whole suite once**

Run: `npx vitest run src/shared/markdown.test.ts src/web/components/Prose.test.tsx src/web/components/TranscriptFeed.test.tsx`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npx vitest run`
Expected: PASS, every file. This is the last task on the track, so the full suite runs here once.

- [ ] **Step 8: Commit**

```bash
git add src/shared/markdown.ts src/shared/markdown.test.ts src/web/components/Prose.tsx src/web/components/Prose.test.tsx
git commit -m "Markdown: items nest by indent, checkboxes show their state"
```
