// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildCast } from '../../shared/cast';
import type { Agent } from '../../shared/domain';
import { SEQ } from '../../shared/head-turn';
import { fixtureAgents } from '../agents.fixture';
import { CastContext } from '../state/useCast';
import { DEFAULT_SETTINGS, SettingsContext } from '../state/useSettings';
import { FirstLight, leadNameOf, useFrameClock } from './FirstLight';

afterEach(cleanup);
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const LEAD: Agent = { ...fixtureAgents().find((a) => a.isLead)!, transcript: [] };

function mount(movieTheme: string | null, settings: Partial<typeof DEFAULT_SETTINGS> = {}) {
  const cast = buildCast([LEAD], movieTheme);
  return render(
    <SettingsContext.Provider value={{ ...DEFAULT_SETTINGS, movieTheme, ...settings }}>
      <CastContext.Provider value={cast}>
        <FirstLight lead={LEAD} />
      </CastContext.Provider>
    </SettingsContext.Provider>,
  );
}

const frame = () => screen.getByTestId('seeker').getAttribute('data-frame');

it('names the lead by character and fills the theme copy', () => {
  mount('breakingbad');
  expect(screen.getByTestId('first-light-kicker').textContent).toBe('THE LAB IS STILL AN RV');
  expect(screen.getByTestId('first-light-head').textContent).toBe('Heisenberg is here. The lab is still an RV.');
  expect(screen.getByTestId('first-light-body').textContent).toBe(
    'The rest of the crew gets called in when Heisenberg says the word. Until then it’s one chemist in a parking lot.',
  );
});

it('says "lead" and draws the still team8 mark with no theme', () => {
  mount(null);
  expect(screen.getByTestId('first-light-head').textContent).toBe('lead is here. Nobody else yet.');
  const svg = screen.getByTestId('seeker').querySelector('svg')!;
  expect(svg.getAttribute('viewBox')).toBe('0 0 12 12');
  expect(svg.getAttribute('width')).toBe('112');
  act(() => vi.advanceTimersByTime(900 + 110));
  // The mark does not turn, but the "?" still keeps the schedule.
  expect(svg.getAttribute('viewBox')).toBe('0 0 12 12');
  expect(frame()).toBe('L2');
  expect(screen.getByTestId('seeker-question')).toBeTruthy();
});

it('draws the lead\'s v3 portrait at 128px and swaps whole frames on the sequence', () => {
  mount('breakingbad');
  const svg = () => screen.getByTestId('seeker').querySelector('svg')!;
  expect(svg().getAttribute('width')).toBe('128');
  expect(svg().getAttribute('viewBox')).toBe('0 0 32 32');
  expect(frame()).toBe('F');
  const front = svg().innerHTML;
  act(() => vi.advanceTimersByTime(900));
  expect(frame()).toBe('L1');
  expect(svg().innerHTML).not.toBe(front);
  act(() => vi.advanceTimersByTime(110));
  expect(frame()).toBe('L2');
  act(() => vi.advanceTimersByTime(1100 + 110));
  expect(frame()).toBe('F');
  expect(svg().innerHTML).toBe(front);
  // The whole loop lands back on F.
  act(() => vi.advanceTimersByTime(SEQ.reduce((n, [, ms]) => n + ms, 0) - 900 - 110 - 1100 - 110));
  expect(frame()).toBe('F');
});

it('shows the "?" only on the near-profile frames, on the side being looked at', () => {
  mount('breakingbad');
  expect(screen.queryByTestId('seeker-question')).toBeNull();
  act(() => vi.advanceTimersByTime(900 + 110));
  expect(frame()).toBe('L2');
  expect(screen.getByTestId('seeker-question').style.marginLeft).toBe('-66px');
  act(() => vi.advanceTimersByTime(1100));
  expect(screen.queryByTestId('seeker-question')).toBeNull();
  act(() => vi.advanceTimersByTime(110 + 450 + 110));
  expect(frame()).toBe('R2');
  expect(screen.getByTestId('seeker-question').style.marginLeft).toBe('54px');
});

it('holds frame F with no "?" when the console\'s motion setting is off', () => {
  mount('breakingbad', { motion: false });
  act(() => vi.advanceTimersByTime(5000));
  expect(frame()).toBe('F');
  expect(screen.queryByTestId('seeker-question')).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});

it('holds frame F when the OS asks for reduced motion', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  mount('breakingbad');
  act(() => vi.advanceTimersByTime(5000));
  expect(frame()).toBe('F');
  vi.unstubAllGlobals();
});

it('pauses while the tab is hidden and clears its timer on unmount', () => {
  const { unmount } = mount('breakingbad');
  act(() => vi.advanceTimersByTime(900));
  expect(frame()).toBe('L1');
  Object.defineProperty(document, 'hidden', { configurable: true, value: true });
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  act(() => vi.advanceTimersByTime(5000));
  expect(frame()).toBe('L1');
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  act(() => vi.advanceTimersByTime(110));
  expect(frame()).toBe('L2');
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it('lays the block out as the handoff draws it', () => {
  mount('breakingbad');
  const root = screen.getByTestId('first-light');
  expect(root.style.padding).toBe('0px 72px');
  expect(root.style.gap).toBe('48px');
  expect(root.style.alignItems).toBe('center');
  const head = screen.getByTestId('first-light-head');
  expect(head.style.fontSize).toBe('42px');
  expect(head.style.maxWidth).toBe('24ch');
  expect(screen.getByTestId('first-light-kicker').style.letterSpacing).toBe('.16em');
  expect(screen.getByTestId('first-light-body').style.maxWidth).toBe('62ch');
});

it('names the lead as the cast does, or "lead" with no theme', () => {
  expect(leadNameOf(buildCast([LEAD], 'lotr'), LEAD)).toBe('Gandalf');
  expect(leadNameOf(buildCast([LEAD], null), LEAD)).toBe('lead');
});

it('exposes the clock as a hook that returns F and runs nothing when disabled', () => {
  let seen = '';
  function Probe({ on }: { on: boolean }) {
    seen = useFrameClock(on);
    return null;
  }
  render(<Probe on={false} />);
  expect(seen).toBe('F');
  expect(vi.getTimerCount()).toBe(0);
});
