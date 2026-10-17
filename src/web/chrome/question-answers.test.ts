import { describe, expect, it } from 'vitest';
import type { AskQuestion, NeedsYouItem } from '../../shared/domain';
import {
  answerText,
  answersPayload,
  emptyAnswer,
  firstQuestion,
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

describe('firstQuestion', () => {
  const card = (id: string, questions?: AskQuestion[]): NeedsYouItem => ({
    id,
    kind: 'permission',
    agent: 'team-lead',
    reason: 'permission',
    detail: '',
    ...(questions ? { questions } : {}),
  });

  it('picks the oldest card that asks something and was not cancelled here', () => {
    const items = [card('bash'), card('q1', [single]), card('q2', [multi])];
    expect(firstQuestion(items, new Set())!.id).toBe('q1');
    expect(firstQuestion(items, new Set(['q1']))!.id).toBe('q2');
    expect(firstQuestion(items, new Set(['q1', 'q2']))).toBeNull();
    expect(firstQuestion([card('empty', [])], new Set())).toBeNull();
  });
});
