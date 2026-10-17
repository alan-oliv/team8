// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Diff, SessionRow } from '../shared/domain';
import { App } from './App';
import { MockEventSource, installMockEventSource } from './test/mockEventSource';
import { FIXTURE_NOW, sampleSessions, sampleTeamState } from './test/state-fixture';
import { FOLDER_SETTINGS_KEY, SETTINGS_KEY } from './state/useSettings';
import { THEMES } from './themes';

beforeEach(() => {
  installMockEventSource();
  window.history.replaceState(null, '', '/');
  // The folder scope and appearance both persist per browser, so without this
  // a test that picks one leaves it picked for every test after it.
  window.localStorage.clear();
  // The splash asks for a frame on mount; never granting one keeps it frozen at
  // t=0 so no case sees a re-render from an animation it is not testing.
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

// This suite renders once per `it`; without explicit cleanup the un-unmounted
// nodes from one test leak into the next and getByRole/getByText start
// matching more than one element.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// Counts per-agent renders in the dock: every chip renders exactly one StatusGlyph, and
// in the tasks view the dock is the only thing on screen that renders one at all.
const chip = vi.hoisted(() => ({ renders: 0 }));
vi.mock('./components/StatusGlyph', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./components/StatusGlyph')>();
  return {
    ...actual,
    StatusGlyph(props: Parameters<typeof actual.StatusGlyph>[0]) {
      chip.renders += 1;
      return <actual.StatusGlyph {...props} />;
    },
  };
});

it('renders the console shell with a body slot', () => {
  render(<App />);
  expect(screen.getByRole('main')).toBeTruthy();
});

it('paints the page behind the console on the theme ground, not just the console', () => {
  render(<App />);
  // Nocturne's --term. An overscroll on a light theme would otherwise flash the
  // stylesheet's dark default from behind the console.
  expect(document.documentElement.style.backgroundColor).toBe('rgb(18, 20, 31)');
});

it('gives every non-token colour an explicit custom-property home', async () => {
  // Aliased so Vite's `new URL('literal', import.meta.url)` static asset-URL
  // rewrite (which resolves against the served origin, not disk) doesn't fire.
  const here = import.meta.url;
  const css = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('./theme.css', here), 'utf8'),
  );
  // Renamed deliberately in the theming pass: the old names (--terminal-ground,
  // --attention, --attention-border, --failure-rose, --row-hairline) were
  // Nocturne literals asserted as fixed hex, which is exactly what six themes
  // break. --row-hairline folded into the ramp, where 900 IS the hairline.
  expect(css).toContain('--term: #12141f;');
  expect(css).toContain('--warn: #d99e5c;');
  expect(css).toContain('--warn-edge: #6b4f2c;');
  expect(css).toContain('--warn-tint: #2b2028;');
  expect(css).toContain('--fail: #c98d8d;');
  expect(css).toContain('--on-accent: #161826;');
  // The JSON palette's two new hues; its other four roles reuse tokens above.
  expect(css).toContain('--json-string: #9ec9a8;');
  expect(css).toContain('--json-boolean: #7fb4d9;');
  // No component may paint from a literal, or a light theme breaks around it.
  expect(css).not.toContain('--terminal-ground');
  expect(css).not.toContain('--attention');
  expect(css).toContain('outline: 2px solid var(--color-accent);');
  expect(css).toContain('outline-offset: 2px;');
});

it('holds every view to the width of the body slot', async () => {
  const here = import.meta.url;
  const css = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('./theme.css', here), 'utf8'),
  );
  // At the default `min-width: auto` a view root cannot shrink below its
  // widest unwrapped line, and the page — not the pane — scrolls sideways.
  expect(css).toMatch(/\.console-body > \*\s*\{\s*min-width: 0;\s*\}/);
  // Bottom-anchoring is scoped to streams; a roster or task list anchored this
  // way opens with dead space above its first row.
  expect(css).toContain('.tscroll.tail > *:first-child {');
  // Y only. Containing both axes swallowed the sideways wheel over a transcript
  // pane, and the panes cover nearly the whole wall — the columns off-screen
  // were then reachable only by the scrollbar itself.
  expect(css).toContain('overscroll-behavior-y: contain;');
  expect(css).not.toMatch(/^\s*overscroll-behavior: contain;/m);
  // The wall's horizontal bar is themed like every pane, not left to the OS.
  expect(css).toMatch(/\.tscroll::-webkit-scrollbar,\s*\n\s*\.hscroll::-webkit-scrollbar\s*\{/);
  expect(css).toContain('height: 9px;');
});

it('mounts status bar, body, needs-you strip and panel once the snapshot lands', () => {
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', sampleTeamState()));

  expect(screen.getByRole('tablist')).toBeTruthy();
  expect(screen.getByText('session-98b0b4a7')).toBeTruthy();
  expect(screen.getByRole('main')).toBeTruthy();
  expect(screen.getByText('NEEDS YOU · 0')).toBeTruthy();
  expect(screen.getByText('PANEL')).toBeTruthy();
  expect(screen.getAllByTestId('agent-chip')).toHaveLength(4);
});

function expectChromeMounted() {
  expect(screen.getByRole('tablist')).toBeTruthy();
  expect(screen.getByText('NEEDS YOU · 0')).toBeTruthy();
  expect(screen.getByText('PANEL')).toBeTruthy();
  expect(screen.getAllByTestId('agent-chip')).toHaveLength(4);
}

it('wires each view into the body and never unmounts the chrome switching between them', () => {
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', sampleTeamState()));

  // Chrome elements captured once; the same nodes must persist across every view switch below —
  // only <main>'s contents may swap, per "the chrome never moves between views".
  const tablist = screen.getByRole('tablist');
  const panel = screen.getByText('PANEL');

  // Default view (no ?view= param) is 'wall'.
  expect(screen.getByTestId('wall')).toBeTruthy();
  expect(screen.getAllByTestId('wall-column')).toHaveLength(4);
  expectChromeMounted();
  expect(screen.getByRole('tablist')).toBe(tablist);
  expect(screen.getByText('PANEL')).toBe(panel);

  fireEvent.click(screen.getByRole('tab', { name: 'overview' }));
  expect(screen.getByTestId('overview')).toBeTruthy();
  expect(screen.getAllByTestId('overview-row')).toHaveLength(4);
  expect(screen.queryByTestId('wall')).toBeNull();
  expectChromeMounted();
  expect(screen.getByRole('tablist')).toBe(tablist);
  expect(screen.getByText('PANEL')).toBe(panel);

  fireEvent.click(screen.getByRole('tab', { name: 'comms' }));
  expect(screen.getByTestId('comms')).toBeTruthy();
  expect(screen.getByTestId('thread-list')).toBeTruthy();
  expect(screen.queryByTestId('overview')).toBeNull();
  expectChromeMounted();
  expect(screen.getByRole('tablist')).toBe(tablist);
  expect(screen.getByText('PANEL')).toBe(panel);

  fireEvent.click(screen.getByRole('tab', { name: 'tasks' }));
  expect(screen.getByTestId('tasks')).toBeTruthy();
  // The task list is the whole view: mailbox traffic moved to the comms view,
  // which shows the same inbox data as a conversation rather than a log.
  expect(screen.queryByTestId('mailbox')).toBeNull();
  expect(screen.queryByTestId('comms')).toBeNull();
  expectChromeMounted();
  expect(screen.getByRole('tablist')).toBe(tablist);
  expect(screen.getByText('PANEL')).toBe(panel);

  fireEvent.click(screen.getByRole('tab', { name: 'rail' }));
  expect(screen.getByTestId('rail-left')).toBeTruthy();
  expect(screen.getByTestId('rail-detail-header')).toBeTruthy();
  expect(screen.queryByTestId('tasks')).toBeNull();
  expectChromeMounted();
  expect(screen.getByRole('tablist')).toBe(tablist);
  expect(screen.getByText('PANEL')).toBe(panel);

  fireEvent.click(screen.getByRole('tab', { name: 'grid' }));
  expect(screen.getByTestId('grid')).toBeTruthy();
  expect(screen.getAllByTestId('grid-pane')).toHaveLength(4);
  expect(screen.queryByTestId('rail-left')).toBeNull();
  expectChromeMounted();
  expect(screen.getByRole('tablist')).toBe(tablist);
  expect(screen.getByText('PANEL')).toBe(panel);

  fireEvent.click(screen.getByRole('tab', { name: 'usage' }));
  expect(screen.getByTestId('usage')).toBeTruthy();
  expect(screen.queryByTestId('grid')).toBeNull();
  expectChromeMounted();
  expect(screen.getByRole('tablist')).toBe(tablist);
  expect(screen.getByText('PANEL')).toBe(panel);
});

it('wires useKeyboard to the store — ⌘2 switches from the wall to overview', () => {
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', sampleTeamState()));

  expect(screen.getByTestId('wall')).toBeTruthy();
  fireEvent.keyDown(document.body, { key: '2', metaKey: true });
  expect(screen.getByTestId('overview')).toBeTruthy();
  expect(screen.queryByTestId('wall')).toBeNull();
});

it('⌘7 switches to the seventh pill, usage', () => {
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', sampleTeamState()));

  expect(screen.getByTestId('wall')).toBeTruthy();
  fireEvent.keyDown(document.body, { key: '7', metaKey: true });
  expect(screen.getByTestId('usage')).toBeTruthy();
  expect(screen.queryByTestId('wall')).toBeNull();
});

it('does not let ⌘2 switch the view while a composer has focus', () => {
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', sampleTeamState()));

  const composer = screen.getAllByTestId('composer-input')[0];
  composer.focus();
  fireEvent.keyDown(composer, { key: '2', metaKey: true });

  expect(screen.getByTestId('wall')).toBeTruthy();
  expect(screen.queryByTestId('overview')).toBeNull();
});

it('costs the dock no per-agent renders on an identical frame or a clock tick', () => {
  window.history.replaceState(null, '', '/?view=tasks');
  vi.useFakeTimers();
  try {
    render(<App />);
    act(() => MockEventSource.last().emit('snapshot', sampleTeamState()));
    expect(screen.getAllByTestId('agent-chip')).toHaveLength(4);

    chip.renders = 0;
    act(() => MockEventSource.last().emit('state', sampleTeamState()));
    expect(chip.renders).toBe(0);

    act(() => vi.advanceTimersByTime(1000));
    expect(chip.renders).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

function stubFetch() {
  const fetchMock = vi.fn((_path: string, _init?: RequestInit) => Promise.resolve(new Response('{}', { status: 200 })));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const POST = { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' };
const B5 = 'b5129c7b-a009-4de3-9a42-4664d1214f39';
const C1 = 'c1a2b3c4-0000-4000-8000-000000000003';

/** The fixture frame with the session on screen gone quiet and B5 busy beside it: a bare open would switch. */
function quietCurrentState() {
  const [current, b5, c1] = sampleSessions();
  const sessions: SessionRow[] = [{ ...current, busy: false }, { ...b5, busy: true }, c1];
  return { ...sampleTeamState(), sessions };
}

const selects = (fetchMock: ReturnType<typeof stubFetch>) =>
  fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.startsWith('/api/select-session/'));

it('t opens the team list over any view', async () => {
  stubFetch();
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', sampleTeamState()));

  expect(screen.queryByRole('listbox', { name: 'teams' })).toBeNull();
  fireEvent.keyDown(document.body, { key: 't' });
  expect(screen.getByRole('listbox', { name: 'teams' })).toBeTruthy();
  await screen.findAllByRole('option');

  fireEvent.keyDown(document.body, { key: 't' });
  expect(screen.queryByRole('listbox', { name: 'teams' })).toBeNull();
});

it('switches to the team the launcher announced, once', () => {
  // The launcher announces a bare /?team= when a console is already running for
  // another team; that is the only case where the URL and the server disagree.
  window.history.replaceState(null, '', '/?team=session-b5129c7b');
  const fetchMock = stubFetch();
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', sampleTeamState()));

  expect(fetchMock).toHaveBeenCalledWith('/api/teams/session-b5129c7b/select', POST);

  act(() => MockEventSource.last().emit('state', sampleTeamState()));
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('does not switch when the announced team is already the one on screen', () => {
  window.history.replaceState(null, '', '/?team=session-98b0b4a7');
  const fetchMock = stubFetch();
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', sampleTeamState()));
  expect(fetchMock).not.toHaveBeenCalled();
});

it('does not switch for a ?team= that came from a reload rather than the launcher', () => {
  // A bookmark or a restored tab replays the URL we wrote, which always has a
  // view. Honouring it would let a background tab yank a console someone else
  // is watching, since the switch is server-global.
  window.history.replaceState(null, '', '/?view=wall&team=session-b5129c7b');
  const fetchMock = stubFetch();
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', sampleTeamState()));
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/teams/'))).toBe(false);
});

// ————— landing a bare open on the most active session, from the frame —————

// The scope is the picker's: with nothing picked, the folder of the session on
// screen — so a bare open lands inside it rather than on a busy session elsewhere.
it('switches a bare open to the busy session in the folder on screen, not to one elsewhere', () => {
  const fetchMock = stubFetch();
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', quietCurrentState()));

  expect(fetchMock).toHaveBeenCalledWith(`/api/select-session/${B5}`, POST);
  expect(fetchMock).not.toHaveBeenCalledWith(`/api/select-session/${C1}`, expect.anything());

  // Ref-guarded like `announced`: a later frame must not fire it again.
  act(() => MockEventSource.last().emit('state', quietCurrentState()));
  expect(selects(fetchMock)).toHaveLength(1);
});

it('does not switch when the session on screen is already the most active in its folder', () => {
  const fetchMock = stubFetch();
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', sampleTeamState()));
  expect(fetchMock).not.toHaveBeenCalled();
});

it('never moves a bare open between two sessions just as busy as each other', () => {
  const [current, b5] = sampleSessions();
  const sessions: SessionRow[] = [{ ...current, title: 'zulu' }, { ...b5, busy: true }];
  const fetchMock = stubFetch();
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', { ...sampleTeamState(), sessions }));
  expect(selects(fetchMock)).toEqual([]);
});

it('waits for a frame that carries sessions before deciding', () => {
  const fetchMock = stubFetch();
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', { ...sampleTeamState(), sessions: undefined }));
  expect(fetchMock).not.toHaveBeenCalled();

  act(() => MockEventSource.last().emit('state', quietCurrentState()));
  expect(fetchMock).toHaveBeenCalledWith(`/api/select-session/${B5}`, POST);
});

it('does not auto-switch when a ?team= announce is on the URL', () => {
  window.history.replaceState(null, '', '/?team=session-b5129c7b');
  const fetchMock = stubFetch();
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', quietCurrentState()));

  expect(selects(fetchMock)).toEqual([]);
});

it('does not auto-switch when a /s/:sessionId route is on the URL', () => {
  window.history.replaceState(null, '', '/s/abc12345');
  const fetchMock = stubFetch();
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', quietCurrentState()));

  expect(selects(fetchMock)).toEqual(['/api/select-session/abc12345']);
});

it('shows the nothing-live screen when the frame has no sessions and no agents', () => {
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', { ...sampleTeamState(), agents: [], sessions: [] }));
  expect(screen.getByTestId('no-sessions')).toBeTruthy();
});

it('opens the comms view straight from the URL and keeps it there', () => {
  window.history.replaceState(null, '', '/?view=comms');
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', sampleTeamState()));

  expect(screen.getByTestId('comms')).toBeTruthy();
  expect(screen.getByRole('tab', { name: 'comms' }).getAttribute('aria-selected')).toBe('true');
  expect(window.location.search).toContain('view=comms');
});

it('hands the wall the agent whose thread was open — one store, not six screens', () => {
  window.history.replaceState(null, '', '/?view=comms');
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', sampleTeamState()));

  fireEvent.click(screen.getByTestId('show-in-wall'));

  expect(screen.getByTestId('wall')).toBeTruthy();
  expect(screen.queryByTestId('comms')).toBeNull();
  // The focused agent came from the thread and is now in the URL, so the rail
  // and the panel are looking at the same teammate. With nothing focused the
  // room is what opens, and the room points at whoever spoke last.
  expect(window.location.search).toBe('?view=wall&agent=probe-bravo&team=session-98b0b4a7');
});

// Focus stays single-valued (the URL only carries one `agent=`), but the wall
// scroll itself brings both halves of a non-lead pair into view — the design's
// "jumps to both agents' columns".
it('scrolls both columns into view for a non-lead comms pair shown in the wall', () => {
  window.history.replaceState(null, '', '/?view=comms');
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', sampleTeamState()));

  // The newest thread is the probe-alpha ⇄ probe-bravo exchange — neither is the lead.
  fireEvent.click(screen.getAllByTestId('thread-row')[0]);

  const scrolled: string[] = [];
  Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
    scrolled.push(this.getAttribute('data-agent') ?? '');
  };
  fireEvent.click(screen.getByTestId('show-in-wall'));

  expect(screen.getByTestId('wall')).toBeTruthy();
  expect(scrolled).toContain('probe-alpha');
  expect(scrolled).toContain('probe-bravo');
});

it('clicking a usage ledger row opens that agent in the wall, the way the comms jump does', () => {
  window.history.replaceState(null, '', '/?view=usage');
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', sampleTeamState()));

  const rows = screen.getAllByTestId('usage-ledger-row');
  fireEvent.click(rows[2]);

  // One store, not six screens: the agent chosen in the ledger lands in the
  // same URL-backed selection the wall, rail and overview already read.
  expect(screen.getByTestId('wall')).toBeTruthy();
  expect(screen.queryByTestId('usage')).toBeNull();
  expect(window.location.search).toContain('view=wall');
  expect(window.location.search).toContain('agent=probe-bravo');
});

it('⌘3 switches to comms', () => {
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', sampleTeamState()));

  fireEvent.keyDown(document.body, { key: '3', metaKey: true });
  expect(screen.getByTestId('comms')).toBeTruthy();
});

// The stop control. A stop is not a kill: it POSTs a shutdown_request into the
// agent's inbox, which it reads at its next turn boundary and may decline. The
// confirmation exists because that request is hard to take back, and the whole
// flow lives in the shared chrome so every view is served by one of it.
//
// The wall pins the lead leftmost, so the buttons come back in roster order and
// index is a stabler handle than a label three teammates share.
const LEAD = 0;
const ALPHA = 1;
const stopButtons = () => screen.getAllByTestId('stop-button');

it('asks before stopping, and sends nothing until the operator confirms', () => {
  const fetchMock = stubFetch();
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', sampleTeamState()));

  expect(screen.queryByTestId('stop-confirm')).toBeNull();
  fireEvent.click(stopButtons()[ALPHA]);

  expect(screen.getByTestId('stop-confirm')).toBeTruthy();
  // probe-alpha is idle in this fixture, so #31's idle-last order seats
  // probe-bravo (the only working teammate) in the second column instead.
  expect(screen.getByTestId('stop-confirm-go').textContent).toBe('stop probe-bravo');
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/stop'))).toBe(false);
});

it('sends the stop only for the confirmed teammate', () => {
  const fetchMock = stubFetch();
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', sampleTeamState()));

  fireEvent.click(stopButtons()[ALPHA]);
  fireEvent.click(screen.getByTestId('stop-confirm-go'));

  // The bare-open listing fetch (task #5) is background traffic, not a stop.
  const stopCalls = fetchMock.mock.calls.map((c) => c[0] as string).filter((p) => p.includes('/stop'));
  expect(stopCalls).toEqual(['/api/agents/probe-bravo/stop']);
  expect(screen.queryByTestId('stop-confirm')).toBeNull();
});

it('cancel closes the strip without sending anything', () => {
  const fetchMock = stubFetch();
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', sampleTeamState()));

  fireEvent.click(stopButtons()[ALPHA]);
  fireEvent.click(screen.getByTestId('stop-confirm-cancel'));

  expect(screen.queryByTestId('stop-confirm')).toBeNull();
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/stop'))).toBe(false);
});

// Teammates run inside the lead's session, so ending it ends them. Each one is
// asked explicitly — an agent that never received a request has no reason to
// wind down, and the strip promises they stop with it.
it('ending the session asks every teammate to stop as well', () => {
  const fetchMock = stubFetch();
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', sampleTeamState()));

  fireEvent.click(stopButtons()[LEAD]);
  expect(screen.getByTestId('stop-confirm-go').textContent).toBe('end session');
  expect(screen.getByTestId('stop-confirm-why').textContent).toContain('every teammate');
  fireEvent.click(screen.getByTestId('stop-confirm-go'));

  // The bare-open listing fetch (task #5) is background traffic, not a stop.
  const stopCalls = fetchMock.mock.calls.map((c) => c[0] as string).filter((p) => p.includes('/stop'));
  expect(stopCalls.sort()).toEqual([
    '/api/agents/probe-alpha/stop',
    '/api/agents/probe-bravo/stop',
    '/api/agents/probe-charlie/stop',
    '/api/agents/team-lead/stop',
  ]);
});

it('x opens the same confirmation rather than stopping outright', () => {
  const fetchMock = stubFetch();
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', sampleTeamState()));

  // `x` acts on the focused teammate, and nothing is focused until you pick one.
  fireEvent.click(screen.getAllByTestId('wall-column')[ALPHA]);
  fireEvent.keyDown(window, { key: 'x' });

  // probe-alpha is idle in this fixture, so #31 seats probe-bravo here instead.
  expect(screen.getByTestId('stop-confirm-go').textContent).toBe('stop probe-bravo');
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/stop'))).toBe(false);
});

// The row must not claim the agent is stopped: the request is only in its
// inbox until it reaches a turn boundary, and it may refuse.
it('marks the row as requested, not stopped, once the request is sent', () => {
  stubFetch();
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', sampleTeamState()));

  fireEvent.click(stopButtons()[ALPHA]);
  fireEvent.click(screen.getByTestId('stop-confirm-go'));

  expect(stopButtons()[ALPHA].getAttribute('aria-label')).toBe(
    'stop requested — it stops at its next turn boundary',
  );
  expect(screen.queryByText('stopped by you')).toBeNull();
});

it('a read-only console shows the control but will not arm it', () => {
  const fetchMock = stubFetch();
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', { ...sampleTeamState(), readOnly: true }));

  const button = stopButtons()[ALPHA] as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  fireEvent.click(button);
  expect(screen.queryByTestId('stop-confirm')).toBeNull();
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/stop'))).toBe(false);
});

// The diff modal reads the store's openDiff, which any view's TranscriptFeed
// can set — proof the App-level wiring (DiffContext.Provider + the mount
// point) actually connects a click on a real row to the shared store.
it('opens a diff-bearing row into the modal, from the same store every view shares', () => {
  const diff: Diff = {
    path: 'src/web/state/useTeamState.ts',
    added: 14,
    removed: 2,
    agent: 'probe-alpha',
    ts: Date.parse('2026-08-27T14:22:08.000Z'),
    commit: '9be5ee0',
    hunks: [],
  };
  const withDiff = {
    ...sampleTeamState(),
    agents: sampleTeamState().agents.map((a) =>
      a.name === 'probe-alpha'
        ? { ...a, transcript: [...a.transcript, { id: 'edit#0', marker: '⎿' as const, text: 'Update(x)', ts: 1, diff }] }
        : a,
    ),
  };
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', withDiff));

  expect(screen.queryByTestId('diff-modal')).toBeNull();
  fireEvent.click(screen.getByTestId('diff-chip'));

  expect(screen.getByTestId('diff-path').textContent).toBe(diff.path);
  fireEvent.click(screen.getByTestId('diff-close'));
  expect(screen.queryByTestId('diff-modal')).toBeNull();
});

// "Stop watching" vs "end session": the team keeps running either way unless
// the operator explicitly ends it — this section is about the console merely
// looking away, and never claiming the session ended while it does.
async function openAndStopWatching() {
  fireEvent.keyDown(document.body, { key: 't' });
  const rows = await screen.findAllByRole('option');
  fireEvent.click(within(rows[0]).getByTestId('row-stop-watching'));
  fireEvent.click(screen.getByTestId('watch-confirm-go'));
}

it('empties the body into the left-session screen and dashes the picker', async () => {
  stubFetch();
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', sampleTeamState()));

  expect(screen.queryByTestId('left-session-heading')).toBeNull();
  await openAndStopWatching();

  expect(screen.getByTestId('left-session-heading').textContent).toBe(
    `You stopped watching ${sampleTeamState().teamName}.`,
  );
  expect(screen.queryByTestId('wall')).toBeNull();
  expect(screen.getByTestId('team-trigger-name').textContent).toBe('no session selected');
});

it('cancelling the stop-watching confirmation leaves the wall exactly as it was', async () => {
  stubFetch();
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', sampleTeamState()));

  fireEvent.keyDown(document.body, { key: 't' });
  const rows = await screen.findAllByRole('option');
  fireEvent.click(within(rows[0]).getByTestId('row-stop-watching'));
  fireEvent.click(screen.getByTestId('watch-confirm-cancel'));

  expect(screen.queryByTestId('watch-confirm')).toBeNull();
  expect(screen.queryByTestId('left-session-heading')).toBeNull();
  expect(screen.getByTestId('team-trigger-name').textContent).toBe(sampleTeamState().teamName);
});

it('watch again returns to the normal view', async () => {
  stubFetch();
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', sampleTeamState()));
  await openAndStopWatching();

  fireEvent.click(screen.getByTestId('watch-again'));

  expect(screen.queryByTestId('left-session-heading')).toBeNull();
  expect(screen.getByTestId('wall')).toBeTruthy();
  expect(screen.getByTestId('team-trigger-name').textContent).toBe(sampleTeamState().teamName);
});

it('end it for real, from the left-session screen, reuses the existing destructive session-end flow', async () => {
  const fetchMock = stubFetch();
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', sampleTeamState()));
  await openAndStopWatching();

  fireEvent.click(screen.getByTestId('end-for-real'));
  expect(screen.getByTestId('stop-confirm-go').textContent).toBe('end session');

  fireEvent.click(screen.getByTestId('stop-confirm-go'));
  const stopCalls = fetchMock.mock.calls.map((c) => c[0] as string).filter((p) => p.includes('/stop'));
  expect(stopCalls.sort()).toEqual([
    '/api/agents/probe-alpha/stop',
    '/api/agents/probe-bravo/stop',
    '/api/agents/probe-charlie/stop',
    '/api/agents/team-lead/stop',
  ]);
});

it('clears the dismissal automatically once the console actually switches teams', async () => {
  stubFetch();
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', sampleTeamState()));
  await openAndStopWatching();
  expect(screen.getByTestId('left-session-heading')).toBeTruthy();

  act(() => MockEventSource.last().emit('snapshot', { ...sampleTeamState(), teamName: 'session-b5129c7b' }));

  expect(screen.queryByTestId('left-session-heading')).toBeNull();
  expect(screen.getByTestId('wall')).toBeTruthy();
});

it('lists the other live sessions on the machine and switches to one on click', async () => {
  const fetchMock = stubFetch();
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', sampleTeamState()));
  await openAndStopWatching();

  const rows = await screen.findAllByTestId('left-session-elsewhere-row');
  expect(rows.map((r) => r.textContent ?? '')).toEqual([
    expect.stringContaining('hatch api'),
    expect.stringContaining('session-b5129c7b'),
  ]);
  fireEvent.click(rows[1]);

  expect(fetchMock).toHaveBeenLastCalledWith(`/api/select-session/${B5}`, POST);
});

// Workflow mode replaces the whole shell, not the body: `RUN` in place of
// `TEAM`, and none of the team chrome — no roster, no needs-you, no composer.
it('draws workflow mode instead of the team shell when the frame says so', () => {
  render(<App />);
  act(() =>
    MockEventSource.last().emit('snapshot', {
      ...sampleTeamState(),
      agents: [],
      mode: 'workflow',
      workflows: [
        {
          runId: 'wf_d36b25c0-f96',
          name: 'team-selector',
          status: 'completed',
          live: false,
          startedAt: 1_000_000,
          durationMs: 60_000,
          logs: [],
          phases: [{ index: 1, title: 'Build' }],
          agents: [{ agentId: 'a1', label: 'impl:task-9', phaseIndex: 1, state: 'done' }],
        },
      ],
    }),
  );

  expect(screen.getByTestId('team-mode').textContent).toBe('workflow');
  expect(screen.getByTestId('workflow-run')).toBeTruthy();
  expect(screen.queryByText('NEEDS YOU · 0')).toBeNull();
  // The shell is the shared one, so the way out of a run and the way to the
  // theme are both still on screen.
  expect(screen.getByTestId('team-trigger')).toBeTruthy();
  expect(screen.getByTestId('config-trigger')).toBeTruthy();
});

const QUESTION_CARD = {
  id: 'permit-q',
  kind: 'permission',
  agent: 'team-lead',
  reason: 'permission',
  detail: 'AskUserQuestion — 1 question(s) for you',
  questions: [{ question: 'Ship today?', header: 'Ship', multiSelect: false, options: [{ label: 'yes' }, { label: 'no' }] }],
};

it('opens the question modal over the wall, keeps it off the strip, and gives it Esc', () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  // A focused agent, or the wall's Esc never reaches its interrupt to be suspended.
  window.history.replaceState(null, '', '/?agent=team-lead');
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', sampleTeamState()));
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/interrupt'))).toBe(true);
  fetchMock.mockClear();
  act(() => MockEventSource.last().emit('snapshot', { ...sampleTeamState(), needsYou: [QUESTION_CARD] }));

  expect(screen.getByTestId('question-modal')).toBeTruthy();
  expect(screen.getByText('NEEDS YOU · 0')).toBeTruthy();
  fireEvent.keyDown(window, { key: 'Escape' });
  const urls = fetchMock.mock.calls.map(([url]) => String(url));
  expect(urls).toContain('/api/permits/permit-q/deny');
  expect(urls.some((url) => url.includes('/interrupt'))).toBe(false);
});

it('holds the question back while a patch is open, so Esc only closes the patch', () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  const diff: Diff = { path: 'src/x.ts', added: 1, removed: 0, agent: 'probe-alpha', ts: 1, commit: 'abc1234', hunks: [] };
  const withDiff = {
    ...sampleTeamState(),
    agents: sampleTeamState().agents.map((a) =>
      a.name === 'probe-alpha'
        ? { ...a, transcript: [...a.transcript, { id: 'edit#0', marker: '⎿' as const, text: 'Update(x)', ts: 1, diff }] }
        : a,
    ),
  };
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', withDiff));
  fireEvent.click(screen.getByTestId('diff-chip'));
  act(() => MockEventSource.last().emit('snapshot', { ...withDiff, needsYou: [QUESTION_CARD] }));

  expect(screen.queryByTestId('question-modal')).toBeNull();
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByTestId('diff-modal')).toBeNull();
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/deny'))).toBe(false);
  expect(screen.getByTestId('question-modal')).toBeTruthy();
});

it('hides a question cancelled on the review tab, the call still pending', () => {
  render(<App />);
  const multi = { ...QUESTION_CARD, questions: [{ ...QUESTION_CARD.questions[0], multiSelect: true }] };
  act(() => MockEventSource.last().emit('snapshot', { ...sampleTeamState(), needsYou: [multi] }));

  fireEvent.click(screen.getByText('✔ Submit'));
  fireEvent.click(screen.getByTestId('question-cancel'));
  expect(screen.queryByTestId('question-modal')).toBeNull();
  expect(screen.getByText('NEEDS YOU · 0')).toBeTruthy();
});

it('opens the question modal over the workflow shell too', () => {
  render(<App />);
  act(() =>
    MockEventSource.last().emit('snapshot', {
      ...sampleTeamState(),
      agents: [],
      mode: 'workflow',
      needsYou: [QUESTION_CARD],
      workflows: [
        {
          runId: 'wf_d36b25c0-f96',
          name: 'team-selector',
          status: 'completed',
          live: false,
          startedAt: 1_000_000,
          durationMs: 60_000,
          logs: [],
          phases: [{ index: 1, title: 'Build' }],
          agents: [{ agentId: 'a1', label: 'impl:task-9', phaseIndex: 1, state: 'done' }],
        },
      ],
    }),
  );
  expect(screen.getByTestId('workflow-run')).toBeTruthy();
  expect(screen.getByTestId('question-modal')).toBeTruthy();
});

// A roster always wins, so nothing about workflow mode can regress team mode.
it('stays in the team shell when a roster exists, runs or not', () => {
  render(<App />);
  act(() =>
    MockEventSource.last().emit('snapshot', { ...sampleTeamState(), mode: 'team', workflows: [] }),
  );

  expect(screen.getByTestId('team-mode').textContent).toBe('teammates');
  expect(screen.getByText('NEEDS YOU · 0')).toBeTruthy();
});

const RUNS = [
  {
    runId: 'wf_newer',
    name: 'team-selector',
    status: 'completed' as const,
    live: false,
    startedAt: 1_000_000,
    durationMs: 60_000,
    logs: [],
    phases: [{ index: 1, title: 'Build' }],
    agents: [{ agentId: 'a1', label: 'impl:task-9', phaseIndex: 1, state: 'done' as const }],
  },
  {
    runId: 'wf_older',
    name: 'first-pass',
    status: 'failed' as const,
    live: false,
    startedAt: 500_000,
    durationMs: 30_000,
    logs: [],
    phases: [],
    agents: [],
  },
];

// modeOf gives a team the mode whenever there is one, so a workflow launched
// beside a live team was ingested and held on the frame and never drawable. The
// selection is the client's override of that.
it('draws the run named in the URL even when the frame says team', () => {
  window.history.replaceState(null, '', '/?view=wall&run=wf_older');
  render(<App />);
  act(() =>
    MockEventSource.last().emit('snapshot', {
      ...sampleTeamState(),
      mode: 'team',
      workflows: RUNS,
    }),
  );

  expect(screen.getByTestId('team-mode').textContent).toBe('workflow');
  expect(screen.getByTestId('wf-identity').textContent).toContain('first-pass');
});

it('goes back to the team the run was running beside', () => {
  window.history.replaceState(null, '', '/?view=wall&run=wf_older');
  render(<App />);
  act(() =>
    MockEventSource.last().emit('snapshot', {
      ...sampleTeamState(),
      mode: 'team',
      workflows: RUNS,
    }),
  );

  fireEvent.click(screen.getByTestId('run-trigger'));
  fireEvent.click(screen.getByTestId('run-back-to-team'));
  expect(screen.getByTestId('team-mode').textContent).toBe('teammates');
  expect(window.location.search).not.toContain('run=');
});

it('opens the newest run from the team bar, and switches runs from the run bar', () => {
  render(<App />);
  act(() =>
    MockEventSource.last().emit('snapshot', {
      ...sampleTeamState(),
      mode: 'team',
      workflows: RUNS,
    }),
  );

  fireEvent.click(screen.getByTestId('runs-chip'));
  expect(screen.getByTestId('wf-identity').textContent).toContain('team-selector');

  fireEvent.click(screen.getByTestId('run-trigger'));
  fireEvent.click(screen.getAllByTestId('run-option')[1]);
  expect(screen.getByTestId('wf-identity').textContent).toContain('first-pass');
  expect(window.location.search).toContain('run=wf_older');
});

// ————— the solo-session mode (decisions 23/24, old-batch #28) —————

function soloState() {
  const state = sampleTeamState();
  const lead = { ...state.agents[0], turns: 12 };
  return {
    ...state,
    agents: [lead],
    subagents: {
      [lead.name]: [
        {
          toolUseId: 'toolu_solo1',
          name: 'probe',
          agent: lead.name,
          parent: lead.name,
          depth: 1,
          spawnIndex: 0,
          siblingGroup: 'rec-1',
          state: 'returned' as const,
          queuedAt: FIXTURE_NOW - 60_000,
          startedAt: FIXTURE_NOW - 59_000,
          returnedAt: FIXTURE_NOW - 10_000,
          durationMs: 49_000,
          tokens: 28_700,
          returnedSummary: 'probe finished',
          children: [],
        },
      ],
    },
  };
}

// A bare window — no team, no subagents, no run — used to draw the empty
// screen, because the picker had nowhere to send it. It is its own stream now.
// The lead has said a line: before that it is first light, tested below.
function bareState() {
  const { subagents: _dropped, ...rest } = soloState();
  const lead = { ...rest.agents[0], transcript: [{ id: 'line-0', marker: '⏺' as const, text: 'hello', ts: rest.startedAt }] };
  return { ...rest, agents: [lead], subagents: {} };
}

it('draws a bare session as its own stream rather than the empty screen', async () => {
  stubFetch();
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', bareState()));

  expect(await screen.findByTestId('wall-column')).toBeTruthy();
  expect(screen.queryByTestId('no-sessions')).toBeNull();
});

// The same rule the other three pills follow: a view is offered when its
// subject exists, and a bare session has no tree to draw lifelines for.
it('drops the trace pill when a solo session has no subagents', async () => {
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', bareState()));

  const tabs = await screen.findAllByRole('tab');
  expect(tabs.map((t) => t.textContent)).toEqual(['stream', 'overview']);
});

// …and a `trace` left in the URL from a session that HAD one falls back to the
// stream rather than mounting a view with nothing in it.
it('falls back to the stream when a URL asks for trace on a bare session', async () => {
  window.history.replaceState(null, '', '/?view=trace');
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', bareState()));

  expect(await screen.findByTestId('wall-column')).toBeTruthy();
  expect(screen.queryByTestId('trace-view')).toBeNull();
});

// The canvas builds this switcher as `saViews: [['stream'], ['trace']]`, and
// `overview` is the one addition to it — Screen 8 made the view a written brief
// rather than the wall condensed, which reads on one agent as well as five.
// Still three pills, not the seven a team gets.
it('offers a sub-agents session three pills, with the wall labelled stream', async () => {
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', soloState()));

  const tabs = await screen.findAllByRole('tab');
  expect(tabs.map((t) => t.textContent)).toEqual(['stream', 'overview', 'trace']);
});

it('mounts the trace view over the session’s own tree when its pill is picked', async () => {
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', soloState()));

  fireEvent.click((await screen.findAllByRole('tab')).find((t) => t.textContent === 'trace')!);
  expect(await screen.findByTestId('trace-view')).toBeTruthy();
  expect(screen.getAllByTestId('trace-lane-name').some((n) => n.textContent?.includes('probe'))).toBe(
    true,
  );
});

// ————— the /s/:sessionId route (task #4) —————

// The route's job is to select the session and to resolve its lead without a
// roster-of-one check. It is NOT what decides the mode: a session reached this
// way and then given teammates is a team, and the picker that navigated here
// calls it one off `members >= 2`. It used to keep a one-pill switcher and a
// `solo` kind pill over a wall of four columns.
it('selects the session from a /s/:sessionId URL and takes its mode from the roster', async () => {
  window.history.replaceState(null, '', '/s/abc12345');
  const fetchMock = stubFetch();
  render(<App />);
  // A team-mode fixture on purpose: several agents, not the one-agent roster
  // soloState() builds.
  act(() => MockEventSource.last().emit('snapshot', sampleTeamState()));

  expect(fetchMock).toHaveBeenCalledWith('/api/select-session/abc12345', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });

  const tabs = await screen.findAllByRole('tab');
  expect(tabs.map((t) => t.textContent)).toEqual([
    'wall', 'overview', 'comms', 'tasks', 'rail', 'grid', 'usage',
  ]);
  // The route defaults the view to `trace`, which a team's switcher does not
  // offer — it falls back rather than mounting a view with no tab above it.
  expect(screen.getByRole('tab', { name: 'wall' }).getAttribute('aria-selected')).toBe('true');
});

it('opens a lone /s/:sessionId session on its trace, with the solo switcher', async () => {
  window.history.replaceState(null, '', '/s/abc12345');
  stubFetch();
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', soloState()));

  const tabs = await screen.findAllByRole('tab');
  expect(tabs.map((t) => t.textContent)).toEqual(['stream', 'overview', 'trace']);
  expect(screen.getByRole('tab', { name: 'trace' }).getAttribute('aria-selected')).toBe('true');
  expect(await screen.findByTestId('trace-view')).toBeTruthy();
});

// A team session keeps its seven pills, and a URL-forced 'trace' on one falls
// back to the wall rather than mounting a view its switcher never offered.
it('keeps the team switcher at seven views on a real team', async () => {
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', sampleTeamState()));

  const tabs = await screen.findAllByRole('tab');
  expect(tabs.map((t) => t.textContent)).toEqual([
    'wall', 'overview', 'comms', 'tasks', 'rail', 'grid', 'usage',
  ]);
});

// Canvas 8a: two figures on a sub-agents bar, not the team's six — the trace
// strip below already carries tokens and spend.
it('gives a solo session the canvas two-figure bar, not the team figures', async () => {
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', soloState()));

  const bar = await screen.findByTestId('bar');
  expect(bar.textContent).toContain('turn 12 of 12');
  expect(bar.textContent).not.toContain('tasks');
  expect(bar.textContent).not.toContain('ctx');
});

it('badges a session with a tree subagents, and a bare one not at all', async () => {
  const { rerender } = render(<App />);
  act(() => MockEventSource.last().emit('snapshot', soloState()));
  expect(screen.getByTestId('team-mode').textContent).toBe('subagents');
  cleanup();
  // The first snapshot wrote `/s/<lead>` into the path; a fresh open, not a
  // reload, is what the second mount is about.
  window.history.replaceState(null, '', '/');

  // Nothing has spawned yet, so the mode is not known: the badge waits for
  // evidence (a subagent, a roster, a workflow) rather than guessing "solo".
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', bareState()));
  expect(screen.queryByTestId('team-mode')).toBeNull();
  void rerender;
});

it('wears the watched folder theme, and only while the session lives there', () => {
  window.localStorage.setItem(
    FOLDER_SETTINGS_KEY,
    JSON.stringify({ '/work/alpha': { theme: 'ember' } }),
  );
  render(<App />);
  const console_ = () => document.querySelector('.console') as HTMLElement;
  act(() => MockEventSource.last().emit('snapshot', { ...sampleTeamState(), folder: '/work/alpha' }));
  expect(console_().style.getPropertyValue('--term')).toBe(THEMES.ember.term);

  act(() => MockEventSource.last().emit('snapshot', { ...sampleTeamState(), folder: '/work/beta' }));
  expect(console_().style.getPropertyValue('--term')).toBe(THEMES.nocturne.term);
});

const PLAN_ON_FRAME = {
  path: '/r/docs/team8/plans/p.md',
  mtime: 1,
  tasks: [{ n: 1, title: 'Add the type', written: false }],
};

it('opens the plan tab while the lead is writing a plan', () => {
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', { ...sampleTeamState(), plan: PLAN_ON_FRAME }));
  fireEvent.click(screen.getByRole('tab', { name: 'plan' }));
  expect(screen.getByTestId('plan')).toBeTruthy();
});

it('opens straight onto the plan from the URL when there is one', () => {
  window.history.replaceState(null, '', '/?view=plan');
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', { ...sampleTeamState(), plan: PLAN_ON_FRAME }));
  expect(screen.getByTestId('plan')).toBeTruthy();
});

it('falls back to the wall when the URL asks for a plan the session does not have', () => {
  window.history.replaceState(null, '', '/?view=plan');
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', sampleTeamState()));
  expect(screen.getByTestId('wall')).toBeTruthy();
  expect(screen.queryByTestId('plan')).toBeNull();
});

it('covers the shell with the splash until it finishes, then unmounts it', () => {
  let pending: FrameRequestCallback | null = null;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    pending = cb;
    return 1;
  });
  const now = vi.spyOn(performance, 'now').mockReturnValue(0);
  try {
    render(<App />);
    // The shell is there underneath from the first paint; the splash sits over it.
    expect(screen.getByRole('main')).toBeTruthy();
    expect(screen.getByTestId('splash')).toBeTruthy();
    expect(screen.getAllByTestId('splash-node')).toHaveLength(10);

    now.mockReturnValue(2200);
    act(() => pending?.(2200));
    expect(screen.queryByTestId('splash')).toBeNull();
    expect(screen.getByRole('main')).toBeTruthy();
  } finally {
    now.mockRestore();
  }
});

it('plays the reduced splash when the console motion setting is off', () => {
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ motion: false }));
  let pending: FrameRequestCallback | null = null;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    pending = cb;
    return 1;
  });
  const now = vi.spyOn(performance, 'now').mockReturnValue(0);
  try {
    render(<App />);
    // Reduced motion ends at 0.75s; the full timeline would still be mid-hold.
    now.mockReturnValue(750);
    act(() => pending?.(750));
    expect(screen.queryByTestId('splash')).toBeNull();
  } finally {
    now.mockRestore();
  }
});

it('keeps the splash running across the first snapshot instead of restarting it', () => {
  let pending: FrameRequestCallback | null = null;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    pending = cb;
    return 1;
  });
  const now = vi.spyOn(performance, 'now').mockReturnValue(0);
  try {
    render(<App />);
    now.mockReturnValue(1000);
    act(() => pending?.(1000));
    // Node 0 landed at 0.4s; the first snapshot swaps the shell underneath.
    expect(screen.getAllByTestId('splash-node')[0].style.opacity).toBe('1');
    act(() => MockEventSource.last().emit('snapshot', sampleTeamState()));
    expect(screen.getAllByTestId('splash-node')[0].style.opacity).toBe('1');
    now.mockReturnValue(2200);
    act(() => pending?.(2200));
    expect(screen.queryByTestId('splash')).toBeNull();
  } finally {
    now.mockRestore();
  }
});

function firstLightState(transcriptLines = 0) {
  const base = sampleTeamState();
  const lead = base.agents.find((a) => a.isLead)!;
  const transcript = Array.from({ length: transcriptLines }, (_, i) => ({
    id: `line-${i}`,
    marker: '⏺' as const,
    text: `line ${i}`,
    ts: base.startedAt + i,
  }));
  return { ...base, agents: [{ ...lead, transcript }], tasks: [], mail: [] };
}

it('opens on first light while the session is one agent with nothing said, and cuts to the stream at the first line', () => {
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', firstLightState(0)));
  expect(screen.getByTestId('first-light')).toBeTruthy();
  expect(screen.queryByTestId('wall')).toBeNull();
  expect(screen.queryByTestId('composer-solo')).toBeNull();
  expect(screen.getByTestId('bar').style.opacity).toBe('0.35');
  expect(screen.getByTestId('needs-you').style.opacity).toBe('0.35');
  expect(screen.getByTestId('needs-you-note').textContent).toBe('messages go to lead until a teammate joins');

  act(() => MockEventSource.last().emit('state', firstLightState(1)));
  expect(screen.queryByTestId('first-light')).toBeNull();
  expect(screen.getByTestId('wall')).toBeTruthy();
  expect(screen.getByTestId('bar').style.opacity).toBe('');
  expect(screen.getByTestId('needs-you').style.opacity).toBe('');
  expect(screen.queryByTestId('needs-you-note')).toBeNull();
});

it('cuts from first light to the wall when the first teammate joins', () => {
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', firstLightState(0)));
  expect(screen.getByTestId('first-light')).toBeTruthy();
  act(() => MockEventSource.last().emit('state', sampleTeamState()));
  expect(screen.queryByTestId('first-light')).toBeNull();
  expect(screen.getByTestId('wall')).toBeTruthy();
});

it('shows first light only on the wall view; the overview is itself, undimmed', () => {
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', firstLightState(0)));
  fireEvent.click(screen.getByRole('tab', { name: 'overview' }));
  expect(screen.queryByTestId('first-light')).toBeNull();
  expect(screen.getByTestId('bar').style.opacity).toBe('');
});

it('names the lead by character in the strip note under a film', () => {
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ movieTheme: 'breakingbad' }));
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', firstLightState(0)));
  expect(screen.getByTestId('needs-you-note').textContent).toBe('messages go to Heisenberg until a teammate joins');
  expect(screen.getByTestId('first-light-head').textContent).toBe('Heisenberg is here. The lab is still an RV.');
});

it('does not dim the chrome or note the strip once the operator has stopped watching a first-light session', async () => {
  stubFetch();
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', firstLightState(0)));
  expect(screen.getByTestId('first-light')).toBeTruthy();
  await openAndStopWatching();

  expect(screen.getByTestId('left-session-heading')).toBeTruthy();
  expect(screen.queryByTestId('first-light')).toBeNull();
  expect(screen.getByTestId('bar').style.opacity).toBe('');
  expect(screen.getByTestId('needs-you').style.opacity).toBe('');
  expect(screen.queryByTestId('needs-you-note')).toBeNull();
});
