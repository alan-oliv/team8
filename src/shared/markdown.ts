/**
 * The markdown an expanded row actually contains.
 *
 * `tidy()` keeps a message's newlines precisely so a drawer can show "the shape
 * the author wrote" — headings, tables, fenced code, in 42% of a lead's
 * messages. Fences are handled in code.ts; this is the rest of that shape.
 *
 * A deliberate subset, not a markdown implementation. Rendering the constructs
 * that appear and leaving the rest as literal text is better than half-parsing
 * everything: an unrendered `~~strike~~` still reads, a mangled one does not.
 * A pipe table becomes a real table: the terminal prints it unpadded, so the
 * pipes fall wherever each cell ends and no column can be followed by eye.
 */
export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; text: string }
  | { kind: 'em'; text: string }
  | { kind: 'strike'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'link'; text: string; href: string };

export type Align = 'left' | 'right' | 'center';

export type Block =
  | { kind: 'heading'; level: number; spans: Inline[] }
  | { kind: 'para'; spans: Inline[] }
  | { kind: 'item'; spans: Inline[]; ordered: boolean }
  | { kind: 'quote'; spans: Inline[] }
  | { kind: 'rule' }
  | { kind: 'table'; header: Inline[][]; align: Align[]; rows: Inline[][][] }
  // Pipe lines with no separator row: not a table in GFM, kept as written.
  | { kind: 'pre'; lines: string[] };

const HEADING = /^(#{1,6})\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const BULLET = /^\s*[-*]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;
// Every inline construct in one pass, so none can split another: `**bold**`,
// `~~strike~~`, `` `code` ``, `[text](href)`, and `*italic*` last so the
// double asterisk is tried first. Italic needs a non-space, non-asterisk
// character on both ends and nothing word-like outside, which is what keeps
// `2 * 3`, `a*b*c` and `**/*.ts` as text. `_italic_` is not read: snake_case.
const INLINE =
  /(\*\*)(?=\S)([\s\S]*?\S)\1|(~~)(?=\S)([\s\S]*?\S)\3|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|(?<![\w*])\*([^\s*](?:[^*]*?[^\s*])?)\*(?![\w*])/g;
const HTTP = /^https?:\/\//;

export function inlines(text: string): Inline[] {
  const out: Inline[] = [];
  // Adjacent text stays one span, so a link the console cannot open does not
  // split the sentence around it into three pieces.
  const pushText = (t: string) => {
    const prev = out[out.length - 1];
    if (prev?.kind === 'text') prev.text += t;
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

const SEPARATOR = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const NUMERIC = /^\$?-?\d[\d,]*(\.\d+)?%?$/;

export function isNumeric(text: string): boolean {
  return NUMERIC.test(text.trim());
}

function cells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, '|').trim());
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
  const align = header.map((_, i): Align => {
    const marker = markers[i];
    if (marker) return marker;
    const texts = rows.map((r) => plain(r[i])).filter((t) => t !== '');
    return texts.length > 0 && texts.every(isNumeric) ? 'right' : 'left';
  });
  return { kind: 'table', header, align, rows };
}

/**
 * Consecutive prose lines join into one paragraph, the way markdown reads them
 * — a hard-wrapped sentence is one sentence, not one line per screen row.
 * Headings, list items and table rows each stand alone.
 */
export function blocks(text: string): Block[] {
  const out: Block[] = [];
  let para: string[] = [];
  let table: string[] = [];
  let quote: string[] = [];

  const flushPara = () => {
    if (para.length > 0) out.push({ kind: 'para', spans: inlines(para.join(' ')) });
    para = [];
  };
  const flushTable = () => {
    if (table.length > 0) out.push(parseTable(table));
    table = [];
  };
  const flushQuote = () => {
    if (quote.length > 0) out.push({ kind: 'quote', spans: inlines(quote.filter((l) => l !== '').join(' ')) });
    quote = [];
  };
  const flush = () => {
    flushPara();
    flushQuote();
    flushTable();
  };

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
    // Before the bullet check: `- - -` is a rule, not an item reading `- -`.
    if (RULE.test(line)) {
      flushPara();
      out.push({ kind: 'rule' });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flushPara();
      out.push({ kind: 'heading', level: heading[1].length, spans: inlines(heading[2]) });
      continue;
    }
    const bullet = BULLET.exec(line);
    if (bullet) {
      flushPara();
      out.push({ kind: 'item', spans: inlines(bullet[1]), ordered: false });
      continue;
    }
    const ordered = ORDERED.exec(line);
    if (ordered) {
      flushPara();
      out.push({ kind: 'item', spans: inlines(ordered[1]), ordered: true });
      continue;
    }
    para.push(line.trim());
  }
  flush();
  return out;
}
