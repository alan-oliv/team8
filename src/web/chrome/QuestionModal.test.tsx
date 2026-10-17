// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AskQuestion, NeedsYouItem } from '../../shared/domain';
import { fixtureAgents } from '../agents.fixture';
import { Composer, PendingQuestionsContext } from '../components/Composer';
import { QuestionModal } from './QuestionModal';

const STORAGE: AskQuestion = {
  question: 'Where should the board choice live?',
  header: 'Storage',
  multiSelect: false,
  options: [
    { label: 'URL (Recommended)', description: 'Shareable, survives a reload' },
    { label: 'localStorage', description: 'Per browser' },
  ],
};
const JOBS: AskQuestion = {
  question: 'Which CI jobs block the release?',
  header: 'Jobs',
  multiSelect: true,
  options: [{ label: 'unit' }, { label: 'e2e' }, { label: 'lint' }, { label: 'typecheck' }],
};
const SHIP: AskQuestion = {
  question: 'Ship today?',
  header: 'Ship',
  multiSelect: false,
  options: [{ label: 'yes' }, { label: 'no' }],
};
const BACKOFF: AskQuestion = {
  question: 'Which backoff stays?',
  header: 'Backoff',
  multiSelect: false,
  options: [
    { label: 'fix-1: fixed 500ms', preview: 'const delay = () => 500;' },
    { label: 'fix-2: exponential (Recommended)', preview: '```ts\nconst delay = (i) => 250 * 2 ** i;\n```\nDoubles each retry.' },
  ],
};

const card = (questions: AskQuestion[], extra: Partial<NeedsYouItem> = {}): NeedsYouItem => ({
  id: 'q1',
  kind: 'permission',
  agent: 'team-lead',
  reason: 'permission',
  detail: `AskUserQuestion — ${questions.length} question(s) for you`,
  questions,
  ...extra,
});

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const posted = () =>
  fetchMock.mock.calls.map(([url, init]) => [url, JSON.parse((init as RequestInit).body as string)]);

function show(item: NeedsYouItem | null) {
  const onCancel = vi.fn();
  const onDeclined = vi.fn();
  const view = render(<QuestionModal item={item} leadName="team-lead" onCancel={onCancel} onDeclined={onDeclined} />);
  return { onCancel, onDeclined, ...view };
}

const options = () => screen.getAllByTestId('question-option');
const press = (key: string, target: Element | Window = window) => fireEvent.keyDown(target, { key });

describe('QuestionModal', () => {
  it('renders nothing without a question card', () => {
    show(null);
    expect(screen.queryByTestId('question-modal')).toBeNull();
  });

  it('1a: answers a lone single select with the chosen label, keyed by the question text', () => {
    show(card([STORAGE], { context: 'That decides where she writes it, so I would rather ask.' }));
    expect(screen.getByText('● Claude is asking')).toBeTruthy();
    expect(screen.getByText('1 question')).toBeTruthy();
    expect(screen.queryByTestId('question-tabs')).toBeNull();
    expect(screen.getByTestId('question-context').textContent).toBe(
      'That decides where she writes it, so I would rather ask.',
    );
    expect(screen.getByText('3.')).toBeTruthy(); // "Type something."
    expect(screen.getByTestId('question-chat').textContent).toContain('4.Chat about this');

    const submit = screen.getByTestId('question-submit') as HTMLButtonElement;
    expect(submit.textContent).toBe('submit');
    expect(submit.disabled).toBe(true);
    fireEvent.click(options()[1]);
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    expect(posted()).toEqual([
      ['/api/permits/q1/allow', { answers: { 'Where should the board choice live?': 'localStorage' } }],
    ]);
  });

  it('1a: lets typed text replace the choice', () => {
    show(card([STORAGE]));
    fireEvent.click(options()[0]);
    fireEvent.change(screen.getByTestId('question-other'), { target: { value: 'a cookie' } });
    fireEvent.click(screen.getByTestId('question-submit'));
    expect(posted()[0][1]).toEqual({ answers: { 'Where should the board choice live?': 'a cookie' } });
  });

  it('1b: joins the ticked labels and the typed text, then submits from the review tab', () => {
    show(card([JOBS]));
    expect(screen.getByTestId('question-tabs').textContent).toContain('☐ Jobs');
    expect(screen.queryByTestId('question-submit')).toBeNull();
    expect(screen.getByText('space toggle · ↑↓ move · ←→ tabs · esc decline')).toBeTruthy();

    fireEvent.click(options()[0]);
    fireEvent.click(options()[2]);
    fireEvent.click(options()[1]);
    fireEvent.click(options()[1]);
    expect(within(options()[0]).getByText('[✔]')).toBeTruthy();
    expect(within(options()[1]).getByText('[ ]')).toBeTruthy();
    fireEvent.change(screen.getByTestId('question-other'), { target: { value: 'smoke' } });
    expect(screen.getByTestId('question-tabs').textContent).toContain('☒ Jobs');

    fireEvent.click(screen.getByTestId('question-multi-submit'));
    expect(screen.getByText('Review your answers')).toBeTruthy();
    expect(screen.getByTestId('question-review-row').textContent).toBe(
      '● Which CI jobs block the release?→ unit, lint, smoke',
    );
    fireEvent.click(screen.getByTestId('question-submit-answers'));
    expect(posted()).toEqual([
      ['/api/permits/q1/allow', { answers: { 'Which CI jobs block the release?': 'unit, lint, smoke' } }],
    ]);
  });

  it('1c: keeps every answer across tabs and holds Submit answers until the gaps are filled', () => {
    show(card([STORAGE, JOBS, SHIP]));
    expect(screen.getByText('3 questions')).toBeTruthy();
    expect(screen.getByTestId('question-submit').textContent).toBe('next ›');

    fireEvent.click(options()[0]);
    fireEvent.click(screen.getByTestId('question-submit')); // → Jobs
    expect(screen.getByText(JOBS.question)).toBeTruthy();
    fireEvent.click(screen.getByText('✔ Submit'));

    const rows = screen.getAllByTestId('question-review-row');
    expect(rows[0].textContent).toContain('→ URL (Recommended)');
    expect(rows[1].textContent).toContain('→ not answered');
    expect((within(rows[1]).getByText('→ not answered') as HTMLElement).style.color).toBe('var(--warn)');
    fireEvent.click(screen.getByTestId('question-submit-answers'));
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(rows[2]); // back to Ship
    fireEvent.click(options()[1]);
    fireEvent.click(screen.getByText('☐ Jobs'));
    fireEvent.click(options()[3]);
    fireEvent.click(screen.getByText('✔ Submit'));
    fireEvent.click(screen.getByTestId('question-submit-answers'));
    expect(posted()).toEqual([
      [
        '/api/permits/q1/allow',
        {
          answers: {
            'Where should the board choice live?': 'URL (Recommended)',
            'Which CI jobs block the release?': 'typecheck',
            'Ship today?': 'no',
          },
        },
      ],
    ]);
  });

  it('1d: the preview follows the cursor, fenced lines drawn as code', () => {
    show(card([BACKOFF]));
    const preview = () => screen.getByTestId('question-preview');
    expect(preview().textContent).toContain('const delay = () => 500;');
    press('ArrowDown');
    expect(preview().textContent).toContain('250 * 2 ** i');
    expect(within(preview()).getByText('const delay = (i) => 250 * 2 ** i;').style.color).toBe(
      'var(--color-neutral-300)',
    );
    expect(within(preview()).getByText('Doubles each retry.').style.color).toBe('var(--color-neutral-400)');
  });

  it('moves with the arrows and submits a lone single select on Enter', () => {
    show(card([STORAGE]));
    expect(options()[0].textContent).toContain('❯');
    press('ArrowDown');
    expect(options()[1].textContent).toContain('❯');
    press('Enter');
    expect(posted()).toEqual([
      ['/api/permits/q1/allow', { answers: { 'Where should the board choice live?': 'localStorage' } }],
    ]);
  });

  it('chooses and moves to the next tab on Enter, steps tabs with ←→, toggles with space', () => {
    show(card([STORAGE, JOBS]));
    press('Enter'); // URL, then on to Jobs
    expect(screen.getByText(JOBS.question)).toBeTruthy();
    press(' ');
    expect(within(options()[0]).getByText('[✔]')).toBeTruthy();
    press('ArrowLeft');
    expect(screen.getByText(STORAGE.question)).toBeTruthy();
    press('ArrowRight');
    press('ArrowRight');
    expect(screen.getByText('Review your answers')).toBeTruthy();
    press('Enter'); // cursor starts on "Submit answers"
    expect(posted()).toEqual([
      [
        '/api/permits/q1/allow',
        { answers: { 'Where should the board choice live?': 'URL (Recommended)', 'Which CI jobs block the release?': 'unit' } },
      ],
    ]);
  });

  it('jumps the cursor with a digit, but types it while the field has focus', () => {
    show(card([STORAGE]));
    press('2');
    expect(options()[1].textContent).toContain('❯');
    const field = screen.getByTestId('question-other');
    fireEvent.focus(field);
    press('1', field);
    expect(options()[0].textContent).not.toContain('❯');
  });

  it('declines from Chat about this and from esc, then hands the asker to the composer', () => {
    const { onDeclined } = show(card([STORAGE]));
    fireEvent.click(screen.getByTestId('question-chat'));
    expect(posted()).toEqual([['/api/permits/q1/deny', { reason: 'User declined to answer' }]]);
    expect(onDeclined).toHaveBeenCalledWith('team-lead');

    fetchMock.mockClear();
    press('Escape');
    expect(posted()).toEqual([['/api/permits/q1/deny', { reason: 'User declined to answer' }]]);
  });

  it('Cancel on the review tab sends nothing and reports the call', () => {
    const { onCancel } = show(card([JOBS]));
    fireEvent.click(screen.getByText('✔ Submit'));
    fireEvent.click(screen.getByTestId('question-cancel'));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledWith('q1');
  });

  it('names an asker other than the lead in the context line', () => {
    show(card([BACKOFF], { agent: 'fix-2', context: 'fix-1 and fix-2 both rewrote the backoff.' }));
    expect(screen.getByTestId('question-context').textContent).toBe(
      'fix-2 asks: fix-1 and fix-2 both rewrote the backoff.',
    );
  });

  it('omits the context line when there is none', () => {
    show(card([STORAGE]));
    expect(screen.queryByTestId('question-context')).toBeNull();
  });

  it('starts clean when the next call replaces this one', () => {
    const { rerender } = show(card([STORAGE]));
    fireEvent.click(options()[1]);
    rerender(
      <QuestionModal item={card([STORAGE], { id: 'q2' })} leadName="team-lead" onCancel={() => {}} onDeclined={() => {}} />,
    );
    expect((screen.getByTestId('question-submit') as HTMLButtonElement).disabled).toBe(true);
  });

  it('takes focus when it opens', () => {
    show(card([STORAGE]));
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
  });

  it('leaves keys typed into a field behind it alone, so a composer Enter answers once', async () => {
    const asker = fixtureAgents().find((a) => a.name === 'probe-alpha')!;
    const item = card([SHIP], { agent: asker.name });
    render(
      <PendingQuestionsContext.Provider value={[item]}>
        <Composer agent={asker} variant="wall" />
        <QuestionModal item={item} leadName="team-lead" onCancel={() => {}} onDeclined={() => {}} />
      </PendingQuestionsContext.Provider>,
    );
    const input = screen.getByTestId('composer-input');
    input.focus();
    fireEvent.change(input, { target: { value: 'later' } });
    expect(press('2', input)).toBe(true);
    expect(options()[1].textContent).not.toContain('❯');
    press('Enter', input);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 0));
    expect(posted()).toEqual([['/api/permits/q1/allow', { answers: { 'Ship today?': 'later' } }]]);
  });

  it('leaves a key another handler already took, so closing a menu with Esc does not decline', () => {
    show(card([STORAGE]));
    const menu = document.body.appendChild(document.createElement('div'));
    menu.addEventListener('keydown', (e) => e.preventDefault());
    press('Escape', menu);
    menu.remove();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('closes when its card leaves', () => {
    const { rerender } = show(card([STORAGE]));
    rerender(<QuestionModal item={null} leadName="team-lead" onCancel={() => {}} onDeclined={() => {}} />);
    expect(screen.queryByTestId('question-modal')).toBeNull();
  });
});
