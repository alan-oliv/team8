// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { FIXTURE_NOW, sampleSessions } from '../test/state-fixture';
import { WatchContext, type WatchState } from '../state/useWatch';
import { TeamSelect, type TeamSelectProps } from './TeamSelect';

// This suite renders once per `it`; without explicit cleanup the un-unmounted
// nodes from one test leak into the next and getByRole/getByText start
// matching more than one element.
afterEach(cleanup);

const SESSIONS = sampleSessions();
const B5 = 'b5129c7b-a009-4de3-9a42-4664d1214f39';
const SELECT = (id: string) => [
  `/api/select-session/${id}`,
  { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
];

let fetchMock: ReturnType<typeof vi.fn>;
let pushState: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchMock = vi.fn(() => Promise.resolve(new Response('{}', { status: 200 })));
  vi.stubGlobal('fetch', fetchMock);
  pushState = vi.spyOn(window.history, 'pushState');
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

function renderSelect(props: Partial<TeamSelectProps> = {}, watch: Partial<WatchState> = {}) {
  const onOpenChange = vi.fn();
  const all: TeamSelectProps = {
    current: 'session-98b0b4a7', open: true, onOpenChange, now: FIXTURE_NOW, sessions: SESSIONS, ...props,
  };
  const watchValue: WatchState = { dismissed: false, requestStopWatching: vi.fn(), watchAgain: vi.fn(), ...watch };
  function Harness({ extra }: { extra: Partial<TeamSelectProps> }) {
    return (
      <WatchContext.Provider value={watchValue}>
        <TeamSelect {...all} {...extra} />
      </WatchContext.Provider>
    );
  }
  const view = render(<Harness extra={{}} />);
  const rerender = (next: Partial<TeamSelectProps> = {}) => view.rerender(<Harness extra={next} />);
  return { onOpenChange, rerender, watch: watchValue };
}

it('never fetches: the rows come from the frame', () => {
  renderSelect();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(screen.getAllByRole('option')).toHaveLength(2); // the two rows in the current row's folder
});

it('scopes to the folder of the session on screen by default, and names it on the chip', () => {
  renderSelect();
  expect(screen.getByTestId('folder-chip')).toHaveTextContent('octo');
  const titles = screen.getAllByTestId('team-title').map((el) => el.textContent);
  expect(titles).toEqual(['agents-team-console-design', 'session-b5129c7b']);
});

it('sorts busy rows first, then by title', () => {
  const rows = [
    { ...SESSIONS[1], title: 'alpha', busy: false },
    { ...SESSIONS[0], title: 'zulu', busy: true, current: false },
    { ...SESSIONS[2], folder: '/Users/dev/code/octo', title: 'bravo', busy: true },
  ];
  renderSelect({ sessions: rows, current: '' });
  expect(screen.getAllByTestId('team-title').map((el) => el.textContent)).toEqual(['bravo', 'zulu', 'alpha']);
});

it('lists only folders with a live session, with their counts, and no `all`', () => {
  renderSelect();
  fireEvent.click(screen.getByTestId('folder-chip'));
  const menu = screen.getByTestId('folder-menu');
  const options = within(menu).getAllByRole('option').map((el) => el.textContent);
  expect(options).toHaveLength(2);
  expect(options[0]).toContain('octo');
  expect(options[0]).toContain('2 live');
  expect(options[1]).toContain('hatch');
  expect(options[1]).toContain('1 live');
  expect(within(menu).queryByText('all')).toBeNull();
});

it('switches folder on a pick, remembers it, and ignores a remembered folder with nothing live', () => {
  renderSelect();
  fireEvent.click(screen.getByTestId('folder-chip'));
  fireEvent.click(within(screen.getByTestId('folder-menu')).getAllByRole('option')[1]);
  expect(screen.getAllByTestId('team-title').map((el) => el.textContent)).toEqual(['hatch api']);
  expect(localStorage.getItem('console.folder')).toBe('/Users/dev/code/hatch');
  cleanup();

  // Nothing lives in hatch any more: the default scope applies.
  renderSelect({ sessions: SESSIONS.filter((r) => r.folder !== '/Users/dev/code/hatch') });
  expect(screen.getByTestId('folder-chip')).toHaveTextContent('octo');
});

it('switches any row through select-session and rewrites the URL on 200', async () => {
  renderSelect();
  fireEvent.click(screen.getByText('session-b5129c7b'));
  expect(fetchMock).toHaveBeenCalledWith(...SELECT(B5));
  const row = screen.getByText('session-b5129c7b').closest('[role="option"]') as HTMLElement;
  expect(within(row).getByTestId('team-mark')).toHaveTextContent('switching…');
  await vi.waitFor(() => expect(pushState).toHaveBeenCalledWith(null, '', `/s/${B5}`));
});

it('closes once the frame names the target: the session id for a bare row, the directory for a team', () => {
  const { onOpenChange, rerender } = renderSelect();
  fireEvent.click(screen.getByText('session-b5129c7b'));
  expect(onOpenChange).not.toHaveBeenCalled();
  rerender({ current: B5 });
  expect(onOpenChange).toHaveBeenCalledWith(false);

  cleanup();
  const team = renderSelect({
    current: B5,
    sessions: [{ ...SESSIONS[0], current: false }, { ...SESSIONS[1], current: true }],
  });
  fireEvent.click(screen.getByText('agents-team-console-design'));
  expect(team.onOpenChange).not.toHaveBeenCalled();
  team.rerender({ current: 'session-98b0b4a7' });
  expect(team.onOpenChange).toHaveBeenCalledWith(false);
});

it('marks a row gone on 404 and failed on any other error, and does not touch the URL', async () => {
  fetchMock.mockImplementationOnce(() => Promise.resolve(new Response('{}', { status: 404 })));
  renderSelect();
  fireEvent.click(screen.getByText('session-b5129c7b'));
  expect(await screen.findByText('gone')).toBeTruthy();
  expect(pushState).not.toHaveBeenCalled();
});

it('re-selecting the current session resumes watching and closes', () => {
  const watchAgain = vi.fn();
  const { onOpenChange } = renderSelect({}, { dismissed: true, watchAgain });
  fireEvent.click(screen.getByText('agents-team-console-design'));
  expect(watchAgain).toHaveBeenCalled();
  expect(onOpenChange).toHaveBeenCalledWith(false);
  expect(fetchMock).not.toHaveBeenCalled();
});

it('walks the rows with the arrow keys, opens on Enter and a new tab on ⌘Enter', () => {
  const open = vi.spyOn(window, 'open').mockImplementation(() => null);
  renderSelect();
  const list = screen.getByTestId('team-list');
  fireEvent.keyDown(list, { key: 'ArrowDown' });
  fireEvent.keyDown(list, { key: 'Enter', metaKey: true });
  expect(open).toHaveBeenCalledWith(`/s/${B5}`, '_blank');
  fireEvent.keyDown(list, { key: 'Enter' });
  expect(fetchMock).toHaveBeenCalledWith(...SELECT(B5));
});

it('reads working / at prompt / N subagents in the state cell, with a live glyph for busy rows', () => {
  renderSelect({ sessions: SESSIONS.map((r) => ({ ...r, folder: '/Users/dev/code/octo' })) });
  const metas = screen.getAllByTestId('team-meta').map((el) => el.textContent);
  expect(metas[0]).toContain('working');
  expect(metas.some((m) => m?.includes('at prompt'))).toBe(true);
  expect(metas.some((m) => m?.includes('2 subagents'))).toBe(true);
});

it('says what to do when nothing is live anywhere', () => {
  renderSelect({ sessions: [], current: '' });
  expect(screen.getByText(/resume a session from your terminal/i)).toBeTruthy();
  expect(screen.getByTestId('session-count')).toHaveTextContent('0 live');
});

it('⌘K opens the picker and, when it is open, focuses the list', () => {
  const { onOpenChange } = renderSelect({ open: false });
  fireEvent.keyDown(window, { key: 'k', metaKey: true });
  expect(onOpenChange).toHaveBeenCalledWith(true);
});

it('shows the footer’s live-across-folders line for the scope', () => {
  renderSelect();
  expect(screen.getByTestId('folder-note')).toHaveTextContent('2 live across 1 folder');
});
