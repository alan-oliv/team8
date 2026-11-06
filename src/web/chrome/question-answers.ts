import type { AskQuestion, NeedsYouItem } from '../../shared/domain';

/** One question tab's state: ticked option indexes, and the "Type something." field. */
export interface TabAnswer {
  sel: number[];
  other: boolean;
  otherText: string;
}

export const emptyAnswer = (): TabAnswer => ({ sel: [], other: false, otherText: '' });

/** Several questions, or a single multi select, get the tab bar and the Submit tab. */
export function showsTabs(questions: AskQuestion[]): boolean {
  return questions.length > 1 || questions[0]?.multiSelect === true;
}

/** What goes back to Claude for one question; '' means unanswered. */
export function answerText(q: AskQuestion, a: TabAnswer): string {
  const typed = a.otherText.trim();
  if (!q.multiSelect) return a.other ? typed : (q.options[a.sel[0]]?.label ?? '');
  const labels = q.options.filter((_, i) => a.sel.includes(i)).map((o) => o.label);
  return [...labels, ...(typed ? [typed] : [])].join(', ');
}

/** The tool's `answers`, keyed by question text, never by header. */
export function answersPayload(questions: AskQuestion[], answers: TabAnswer[]): Record<string, string> {
  return Object.fromEntries(questions.map((q, i) => [q.question, answerText(q, answers[i] ?? emptyAnswer())]));
}

/** A preview's lines, with those inside a ``` fence (fences included) marked as code. */
export function previewLines(md: string): { text: string; code: boolean }[] {
  let fenced = false;
  return md.split('\n').map((text) => {
    const fence = /^\s*```/.test(text);
    const code = fenced || fence;
    if (fence) fenced = !fenced;
    return { text, code };
  });
}

/** A run of one message line: a list marker, inline code, bold, a link's label, or plain text. */
export interface Seg {
  text: string;
  kind: 'marker' | 'code' | 'bold' | 'link' | 'text';
}

export interface MessageLine {
  kind: 'title' | 'h' | 'li' | 'p' | 'blank';
  segs: Seg[];
  /** Under a heading the question is about. */
  marked: boolean;
  /** Set on the first line of each marked run: its index in `hits`, a jump target. */
  hit?: number;
}

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/;

function segsOf(text: string): Seg[] {
  return text
    .split(INLINE)
    .filter((x) => x !== '')
    .map((x) => {
      if (/^`[^`]+`$/.test(x)) return { text: x.slice(1, -1), kind: 'code' };
      if (/^\*\*[^*]+\*\*$/.test(x)) return { text: x.slice(2, -2), kind: 'bold' };
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(x);
      if (link) return { text: link[1], kind: 'link' };
      return { text: x, kind: 'text' };
    });
}

/**
 * The asker's message, line by line, so nothing is cut. Lines under a heading
 * in `refs` are marked. A line that is only bold is a title ("VLP-10256: …"):
 * `refs` reaches titles as 'PR', and the hits under one carry its name.
 */
export function parseMessage(md: string, refs: string[]): { lines: MessageLine[]; hits: string[] } {
  const lines: MessageLine[] = [];
  const hits: string[] = [];
  let head = '';
  let title = '';
  let prevMarked = false;
  for (const raw of md.split('\n')) {
    const t = raw.trim();
    let kind: MessageLine['kind'] = 'p';
    let body = t;
    let marker: string | undefined;
    if (!t) kind = 'blank';
    else if (/^\*\*[^*]+\*\*$/.test(t)) {
      kind = 'title';
      body = t.slice(2, -2);
      title = body.split(':')[0];
      head = 'PR';
    } else if (/^#{1,3}\s/.test(t)) {
      kind = 'h';
      body = t.replace(/^#+\s+/, '');
      head = body;
    } else if (/^- \[[ x]\] /.test(t)) {
      kind = 'li';
      marker = t[3] === 'x' ? '☒ ' : '☐ ';
      body = t.slice(6);
    } else if (/^- /.test(t)) {
      kind = 'li';
      marker = '– ';
      body = t.slice(2);
    }
    const marked = kind !== 'blank' && head !== '' && refs.includes(head);
    const line: MessageLine = { kind, marked, segs: kind === 'blank' ? [] : segsOf(body) };
    if (marker) line.segs.unshift({ text: marker, kind: 'marker' });
    if (marked && !prevMarked) {
      line.hit = hits.length;
      hits.push(head === 'PR' ? title : [head, title].filter(Boolean).join(' · '));
    }
    if (kind !== 'blank') prevMarked = marked;
    lines.push(line);
  }
  return { lines, hits };
}

/** One modal at a time, oldest hold first; a cancelled one stays pending but hidden. */
export function firstPermit(items: NeedsYouItem[], cancelled: ReadonlySet<string>): NeedsYouItem | null {
  return items.find((i) => i.kind === 'permission' && !cancelled.has(i.id)) ?? null;
}
