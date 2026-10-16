import { describe, expect, it } from 'vitest';
import { blocks, inlines, isNumeric } from './markdown';

describe('inlines', () => {
  it('marks bold and inline code', () => {
    expect(inlines('a **b** and `c`')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'strong', text: 'b' },
      { kind: 'text', text: ' and ' },
      { kind: 'code', text: 'c' },
    ]);
  });

  // Backticks around an asterisk, or bold around a backtick, must not let one
  // construct split the other.
  it('does not let code and bold split each other', () => {
    expect(inlines('`a * b`')).toEqual([{ kind: 'code', text: 'a * b' }]);
    expect(inlines('**a `b` c**')).toEqual([{ kind: 'strong', text: 'a `b` c' }]);
  });

  it('leaves a lone asterisk and an unclosed backtick as text', () => {
    expect(inlines('2 * 3')).toEqual([{ kind: 'text', text: '2 * 3' }]);
    expect(inlines('a `b')).toEqual([{ kind: 'text', text: 'a `b' }]);
  });

  it('round-trips the visible characters', () => {
    const spans = inlines('x **y** `z` w');
    expect(spans.map((s) => s.text).join('')).toBe('x y z w');
  });
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
    expect(inlines('[x](javascript:alert(1))')).toEqual([{ kind: 'text', text: '[x](javascript:alert(1))' }]);
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
});

describe('blocks', () => {
  it('reads nesting from the indent, two spaces or a tab per level', () => {
    const out = blocks('- a\n  - b\n    - c\n\t- d');
    expect(out.map((b) => (b.kind === 'item' ? b.depth : null))).toEqual([0, 1, 2, 1]);
  });

  it('nests an item at most one level under the one above', () => {
    const depths = (t: string) => blocks(t).map((b) => (b.kind === 'item' ? b.depth : null));
    expect(depths('- a\n    - b\n        - c')).toEqual([0, 1, 2]);
    expect(depths('- a\n  - b\n- c\n    - d')).toEqual([0, 1, 0, 1]);
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

  it('reads a heading with its level', () => {
    expect(blocks('## What changed')).toEqual([
      { kind: 'heading', level: 2, spans: [{ kind: 'text', text: 'What changed' }] },
    ]);
  });

  // A hard-wrapped sentence is one sentence, not one line per screen row.
  it('joins consecutive prose lines into one paragraph', () => {
    const out = blocks('one line\nand its continuation\n\na second para');
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      kind: 'para',
      spans: [{ kind: 'text', text: 'one line and its continuation' }],
    });
  });

  it('reads bullets and numbered items', () => {
    const out = blocks('- first\n2. second');
    expect(out.map((b) => b.kind)).toEqual(['item', 'item']);
    expect(out.map((b) => (b.kind === 'item' ? b.ordered : null))).toEqual([false, true]);
  });

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

  it('keeps an escaped pipe inside its cell', () => {
    const out = blocks('| a | b |\n|---|---|\n| x\\|y | 2 |');
    const row = out[0].kind === 'table' ? out[0].rows[0] : [];
    expect(row).toEqual([[{ kind: 'text', text: 'x|y' }], [{ kind: 'text', text: '2' }]]);
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

  it('draws nothing for a quote with no text', () => {
    expect(blocks('>')).toEqual([]);
    expect(blocks('>  \n> ')).toEqual([]);
  });

  it('keeps a quote together across a bare > line', () => {
    expect(blocks('> a\n>\n> b')).toEqual([{ kind: 'quote', spans: [{ kind: 'text', text: 'a b' }] }]);
  });

  it('ends a quote at a table', () => {
    expect(blocks('> q\n| a |\n|---|\n| 1 |').map((b) => b.kind)).toEqual(['quote', 'table']);
  });

  it('breaks a paragraph at a rule', () => {
    expect(blocks('a\n---\nb').map((b) => b.kind)).toEqual(['para', 'rule', 'para']);
  });
});

describe('isNumeric', () => {
  it('accepts the numbers a report prints', () => {
    for (const t of ['607', '-3', '3.5', '1,200', '$0.42', '12%', ' 7 ']) expect(isNumeric(t)).toBe(true);
  });
  it('rejects times, words and empty cells', () => {
    for (const t of ['00:59', 'tests 6.9', '', '1.2.3', 'v2']) expect(isNumeric(t)).toBe(false);
  });
});
