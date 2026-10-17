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

/** One modal at a time, oldest call first; a cancelled one stays pending but hidden. */
export function firstQuestion(items: NeedsYouItem[], cancelled: ReadonlySet<string>): NeedsYouItem | null {
  return items.find((i) => (i.questions?.length ?? 0) > 0 && !cancelled.has(i.id)) ?? null;
}
