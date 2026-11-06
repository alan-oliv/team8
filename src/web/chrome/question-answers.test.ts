import { describe, expect, it } from 'vitest';
import type { AskQuestion, NeedsYouItem } from '../../shared/domain';
import {
  answerText,
  answersPayload,
  emptyAnswer,
  firstPermit,
  parseMessage,
  previewLines,
  showsTabs,
} from './question-answers';

const single: AskQuestion = {
  question: 'Where should the choice live?',
  header: 'Storage',
  multiSelect: false,
  options: [{ label: 'URL (Recommended)' }, { label: 'localStorage' }],
};
const multi: AskQuestion = {
  question: 'Which jobs block the release?',
  header: 'Jobs',
  multiSelect: true,
  options: [{ label: 'unit' }, { label: 'e2e' }, { label: 'lint' }],
};

describe('showsTabs', () => {
  it('shows tabs for several questions or one multi select, never for one single select', () => {
    expect(showsTabs([single])).toBe(false);
    expect(showsTabs([multi])).toBe(true);
    expect(showsTabs([single, single])).toBe(true);
  });
});

describe('answerText', () => {
  it('is empty until something is chosen', () => {
    expect(answerText(single, emptyAnswer())).toBe('');
    expect(answerText(multi, emptyAnswer())).toBe('');
  });

  it('sends a single select label as given, Recommended and all', () => {
    expect(answerText(single, { sel: [0], other: false, otherText: '' })).toBe('URL (Recommended)');
  });

  it('lets typed text replace a single select choice, and treats an empty field as unanswered', () => {
    expect(answerText(single, { sel: [], other: true, otherText: '  a cookie ' })).toBe('a cookie');
    expect(answerText(single, { sel: [], other: true, otherText: '' })).toBe('');
  });

  it('joins ticked labels in option order, then the typed text', () => {
    expect(answerText(multi, { sel: [2, 0], other: false, otherText: '' })).toBe('unit, lint');
    expect(answerText(multi, { sel: [1], other: true, otherText: 'smoke' })).toBe('e2e, smoke');
    expect(answerText(multi, { sel: [], other: true, otherText: 'smoke' })).toBe('smoke');
  });
});

describe('answersPayload', () => {
  it('keys every answer by its question text', () => {
    expect(
      answersPayload([single, multi], [
        { sel: [1], other: false, otherText: '' },
        { sel: [0, 1], other: false, otherText: '' },
      ]),
    ).toEqual({ 'Where should the choice live?': 'localStorage', 'Which jobs block the release?': 'unit, e2e' });
  });
});

describe('previewLines', () => {
  it('marks the lines of a fenced block, fences included, as code', () => {
    expect(previewLines('# Retry\n```ts\nconst delay = 500;\n```\nDoubles each time.')).toEqual([
      { text: '# Retry', code: false },
      { text: '```ts', code: true },
      { text: 'const delay = 500;', code: true },
      { text: '```', code: true },
      { text: 'Doubles each time.', code: false },
    ]);
  });
});

describe('parseMessage', () => {
  const md = [
    'Both drafts are below.',
    '**VLP-1: Add the consumer**',
    '## Test',
    '- [ ] `yarn test` passes',
    '- [x] CI is green',
    '',
    '## Deployment',
    '- **Safe?** Yes, see [the runbook](https://example.com).',
    '**VLP-2: Add the backfill**',
    '## Test',
    'Manual only.',
  ].join('\n');

  it('reads titles, headings, list items and inline code, bold and links', () => {
    const { lines, hits } = parseMessage(md, []);
    expect(lines.map((l) => l.kind)).toEqual(['p', 'title', 'h', 'li', 'li', 'blank', 'h', 'li', 'title', 'h', 'p']);
    expect(lines[3].segs).toEqual([
      { text: '☐ ', kind: 'marker' },
      { text: 'yarn test', kind: 'code' },
      { text: ' passes', kind: 'text' },
    ]);
    expect(lines[4].segs[0]).toEqual({ text: '☒ ', kind: 'marker' });
    expect(lines[7].segs).toEqual([
      { text: '– ', kind: 'marker' },
      { text: 'Safe?', kind: 'bold' },
      { text: ' Yes, see ', kind: 'text' },
      { text: 'the runbook', kind: 'link' },
      { text: '.', kind: 'text' },
    ]);
    expect(lines.some((l) => l.marked)).toBe(false);
    expect(hits).toEqual([]);
  });

  it('marks the lines under each heading in refs, one hit per run, named after the title above it', () => {
    const { lines, hits } = parseMessage(md, ['Test']);
    expect(hits).toEqual(['Test · VLP-1', 'Test · VLP-2']);
    expect(lines.map((l) => l.marked)).toEqual([false, false, true, true, true, false, false, false, false, true, true]);
    expect(lines.map((l) => l.hit)).toEqual([undefined, undefined, 0, undefined, undefined, undefined, undefined, undefined, undefined, 1, undefined]);
    expect(parseMessage('## Test\nok', ['Test']).hits).toEqual(['Test']);
  });

  it('reaches the titles themselves as PR', () => {
    const { lines, hits } = parseMessage(md, ['PR']);
    expect(hits).toEqual(['VLP-1', 'VLP-2']);
    expect(lines.filter((l) => l.marked).map((l) => l.kind)).toEqual(['title', 'title']);
  });
});

describe('firstPermit', () => {
  const card = (id: string, extra: Partial<NeedsYouItem> = {}): NeedsYouItem => ({
    id,
    kind: 'permission',
    agent: 'team-lead',
    reason: 'permission',
    detail: '',
    ...extra,
  });

  it('picks the oldest permission hold, question or not, that was not cancelled here', () => {
    const items = [card('plan', { kind: 'plan' }), card('bash'), card('q1', { questions: [single] })];
    expect(firstPermit(items, new Set())!.id).toBe('bash');
    expect(firstPermit(items, new Set(['bash']))!.id).toBe('q1');
    expect(firstPermit(items, new Set(['bash', 'q1']))).toBeNull();
  });
});
