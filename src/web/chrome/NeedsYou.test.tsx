// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { NeedsYouItem } from '../../shared/domain';
import { FIXTURE_NOW } from '../test/state-fixture';
import { buildCast } from '../../shared/cast';
import { CastContext } from '../state/useCast';
import { NeedsYou } from './NeedsYou';

// This suite renders once per `it`; without explicit cleanup the un-unmounted
// nodes from one test leak into the next and getByRole/getByText start
// matching more than one element.
afterEach(cleanup);

const PLAN: NeedsYouItem = {
  id: 'req-7f3',
  kind: 'plan',
  agent: 'probe-bravo',
  reason: 'plan approval',
  detail: '4 steps · step 4 drops migrations/legacy/',
};
const FAILURE: NeedsYouItem = {
  id: 'fail-1',
  kind: 'failure',
  agent: 'probe-charlie',
  reason: 'failed',
  detail: '529 overloaded_error',
};
const PERMISSION: NeedsYouItem = {
  id: 'permit-9',
  kind: 'permission',
  agent: 'probe-alpha',
  reason: 'permission',
  detail: 'Bash(rm -rf migrations/legacy)',
  expiresAt: FIXTURE_NOW + 90_000,
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('labels the strip with the pending count in the attention colour', () => {
  render(<NeedsYou items={[PLAN, FAILURE, PERMISSION]} readOnly={false} now={FIXTURE_NOW} />);
  const label = screen.getByText('NEEDS YOU · 3');
  expect(label.style.color).toBe('var(--warn)');
  expect(label.style.fontSize).toBe('10.5px');
  expect(label.style.letterSpacing).toBe('.12em');
});

it('renders the three card kinds', () => {
  render(<NeedsYou items={[PLAN, FAILURE, PERMISSION]} readOnly={false} now={FIXTURE_NOW} />);
  expect(screen.getByText('probe-bravo · plan approval')).toBeTruthy();
  expect(screen.getByText('4 steps · step 4 drops migrations/legacy/')).toBeTruthy();
  expect(screen.getByText('probe-charlie · failed').style.color).toBe('var(--fail)');
  expect(screen.getByText('529 overloaded_error')).toBeTruthy();
  expect(screen.getByTestId('card-plan').style.border).toBe('1px solid var(--warn-edge)');
});

it('counts the permission hold down to expiresAt', () => {
  render(<NeedsYou items={[PERMISSION]} readOnly={false} now={FIXTURE_NOW} />);
  expect(screen.getByTestId('permit-countdown').textContent).toBe('90s');

  screen.getByTestId('permit-countdown').remove();
  render(<NeedsYou items={[PERMISSION]} readOnly={false} now={FIXTURE_NOW + 89_400} />);
  expect(screen.getByTestId('permit-countdown').textContent).toBe('1s');
});

it('POSTs approve to the plan endpoint', () => {
  render(<NeedsYou items={[PLAN]} readOnly={false} now={FIXTURE_NOW} />);
  fireEvent.click(screen.getByRole('button', { name: 'approve' }));
  expect(fetchMock).toHaveBeenCalledWith('/api/plans/req-7f3/approve', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
});

it('POSTs the collected feedback on reject, and sends nothing when cancelled', () => {
  vi.spyOn(window, 'prompt').mockReturnValueOnce('step 4 is unsafe');
  render(<NeedsYou items={[PLAN]} readOnly={false} now={FIXTURE_NOW} />);
  fireEvent.click(screen.getByRole('button', { name: 'reject with feedback' }));
  expect(fetchMock).toHaveBeenCalledWith('/api/plans/req-7f3/reject', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ feedback: 'step 4 is unsafe' }),
  });

  vi.spyOn(window, 'prompt').mockReturnValueOnce(null);
  fireEvent.click(screen.getByRole('button', { name: 'reject with feedback' }));
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('POSTs respawn and permission decisions to their own endpoints', () => {
  render(<NeedsYou items={[FAILURE, PERMISSION]} readOnly={false} now={FIXTURE_NOW} />);
  fireEvent.click(screen.getByRole('button', { name: 'respawn' }));
  expect(fetchMock).toHaveBeenLastCalledWith(
    '/api/agents/probe-charlie/respawn',
    expect.objectContaining({ method: 'POST' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'allow' }));
  expect(fetchMock).toHaveBeenLastCalledWith(
    '/api/permits/permit-9/allow',
    expect.objectContaining({ method: 'POST' }),
  );
});

it('disables every button in read-only mode instead of failing on click', () => {
  render(<NeedsYou items={[PLAN, FAILURE, PERMISSION]} readOnly now={FIXTURE_NOW} />);
  const buttons = screen.getAllByRole('button');
  expect(buttons.length).toBeGreaterThan(0);
  for (const b of buttons) expect((b as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'approve' }));
  expect(fetchMock).not.toHaveBeenCalled();
});

it('stays mounted with an empty queue', () => {
  render(<NeedsYou items={[]} readOnly={false} now={FIXTURE_NOW} />);
  expect(screen.getByText('NEEDS YOU · 0')).toBeTruthy();
  expect(screen.getByText('nothing waiting')).toBeTruthy();
});

it('names the character on a card, and still answers on the real id', () => {
  const agents = [
    { name: 'team-lead', agentType: 'team-lead', isLead: true },
    { name: 'probe-bravo', agentType: 'Explore', isLead: false },
  ];
  render(
    <CastContext.Provider value={buildCast(agents, 'inception')}>
      <NeedsYou items={[PLAN]} readOnly={false} now={FIXTURE_NOW} />
    </CastContext.Provider>,
  );
  expect(screen.getByText('Saito · plan approval')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'approve' }));
  expect(fetchMock).toHaveBeenCalledWith('/api/plans/req-7f3/approve', expect.anything());
});

const ASK: NeedsYouItem = {
  ...PERMISSION,
  id: 'permit-ask',
  detail: 'AskUserQuestion',
  questions: [
    {
      question: 'Which database?',
      header: 'DB',
      multiSelect: false,
      options: [{ label: 'Postgres', description: 'relational, already in prod' }, { label: 'SQLite' }],
    },
    {
      question: 'Which checks run in CI?',
      header: 'CI',
      multiSelect: true,
      options: [{ label: 'lint' }, { label: 'test' }, { label: 'e2e' }],
    },
  ],
};

const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;
const lastBody = () => JSON.parse(fetchMock.mock.lastCall![1].body as string);

it('renders each question with its header, options and an other answer in place of allow', () => {
  render(<NeedsYou items={[ASK]} readOnly={false} now={FIXTURE_NOW} />);
  expect(screen.getByText('DB')).toBeTruthy();
  expect(screen.getByText('Which database?')).toBeTruthy();
  expect(screen.getByText('CI')).toBeTruthy();
  expect(screen.getByText('Which checks run in CI?')).toBeTruthy();
  expect(button('Postgres').title).toBe('relational, already in prod');
  for (const label of ['SQLite', 'lint', 'test', 'e2e']) expect(button(label)).toBeTruthy();
  expect(screen.getAllByRole('button', { name: 'other' })).toHaveLength(2);
  expect(button('deny with reason')).toBeTruthy();
  expect(screen.getByTestId('permit-countdown').textContent).toBe('90s');
  expect(screen.queryByRole('button', { name: 'allow' })).toBeNull();
});

it('keeps submit disabled until every question has an answer', () => {
  render(<NeedsYou items={[ASK]} readOnly={false} now={FIXTURE_NOW} />);
  expect(button('submit').disabled).toBe(true);
  fireEvent.click(button('Postgres'));
  expect(button('submit').disabled).toBe(true);
  fireEvent.click(button('lint'));
  expect(button('submit').disabled).toBe(false);
});

it('posts the picked answers keyed by question, a later single-select pick replacing the earlier one', () => {
  render(<NeedsYou items={[ASK]} readOnly={false} now={FIXTURE_NOW} />);
  fireEvent.click(button('SQLite'));
  fireEvent.click(button('Postgres'));
  fireEvent.click(button('lint'));
  expect(button('SQLite').getAttribute('aria-pressed')).toBe('false');
  expect(button('Postgres').getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(button('submit'));
  expect(fetchMock.mock.lastCall![0]).toBe('/api/permits/permit-ask/allow');
  expect(lastBody()).toEqual({ answers: { 'Which database?': 'Postgres', 'Which checks run in CI?': 'lint' } });
});

it('toggles multiSelect options and joins the picks with ", "', () => {
  render(<NeedsYou items={[ASK]} readOnly={false} now={FIXTURE_NOW} />);
  fireEvent.click(button('Postgres'));
  for (const label of ['e2e', 'test', 'lint', 'e2e']) fireEvent.click(button(label));
  expect(button('e2e').getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(button('submit'));
  expect(lastBody().answers['Which checks run in CI?']).toBe('lint, test');
});

it('posts typed free text from other, and a cancelled prompt changes nothing', () => {
  render(<NeedsYou items={[ASK]} readOnly={false} now={FIXTURE_NOW} />);
  fireEvent.click(button('Postgres'));
  vi.spyOn(window, 'prompt').mockReturnValueOnce('MySQL').mockReturnValueOnce(null);
  const [otherDb, otherCi] = screen.getAllByRole('button', { name: 'other' });
  fireEvent.click(otherDb);
  expect(button('Postgres').getAttribute('aria-pressed')).toBe('false');
  expect(button('other: MySQL')).toBeTruthy();
  fireEvent.click(otherCi);
  expect(button('submit').disabled).toBe(true);
  fireEvent.click(button('test'));
  fireEvent.click(button('submit'));
  expect(lastBody()).toEqual({ answers: { 'Which database?': 'MySQL', 'Which checks run in CI?': 'test' } });
});

it('disables every question button in read-only mode', () => {
  render(<NeedsYou items={[ASK]} readOnly now={FIXTURE_NOW} />);
  for (const b of screen.getAllByRole('button')) expect((b as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(button('Postgres'));
  fireEvent.click(button('lint'));
  fireEvent.click(button('submit'));
  expect(fetchMock).not.toHaveBeenCalled();
});

it('still shows a plain allow on a permission hold without questions', () => {
  render(<NeedsYou items={[PERMISSION]} readOnly={false} now={FIXTURE_NOW} />);
  expect(button('allow')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'submit' })).toBeNull();
});

it('keeps every action button at its full width when a card is narrow', () => {
  // The ellipsis on Action turns off the flex min-content floor, so without
  // flexShrink 0 the approve/deny buttons shrink and truncate alongside the detail.
  render(<NeedsYou items={[PLAN, FAILURE, PERMISSION, ASK]} readOnly={false} now={FIXTURE_NOW} />);
  for (const b of screen.getAllByRole('button')) expect(b.style.flexShrink).toBe('0');
});
