// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { buildCast, type Cast } from '../../shared/cast';
import { CastContext } from '../state/useCast';
import { SettingsContext, DEFAULT_SETTINGS } from '../state/useSettings';
import { Portrait, TerminalSprite } from './Portrait';

// This suite renders several times per test (and across tests); without
// explicit cleanup the un-unmounted nodes from one `it` leak into the next
// and getByTestId starts matching more than one element.
afterEach(cleanup);

const LEAD = { name: 'team-lead', agentType: 'team-lead', isLead: true };
const ALPHA = { name: 'probe-alpha', agentType: 'general-purpose', isLead: false };

// jsdom's CSSOM always serialises the `flex` shorthand back out in its
// longhand form, so `flex: 'none'` round-trips as `'0 0 auto'` even though
// that's exactly what was set. Compare against the same round-trip instead
// of the literal keyword.
function domFlex(css: string): string {
  const probe = document.createElement('div');
  probe.style.flex = css;
  return probe.style.flex;
}

it('hosts the inline SVG in a 32x32 relative box', () => {
  render(<Portrait agent={LEAD} />);
  const host = screen.getByTestId('portrait');
  expect(host.style.width).toBe('32px');
  expect(host.style.height).toBe('32px');
  expect(host.style.position).toBe('relative');
  expect(host.style.flex).toBe(domFlex('none'));
  expect(host.querySelector('svg')).not.toBeNull();
});

it('gives the lead the crown portrait', () => {
  render(<Portrait agent={LEAD} />);
  expect(screen.getByTestId('portrait').getAttribute('data-portrait')).toBe('lead');
});

it('applies the per-slot margin-top', () => {
  const { unmount } = render(<Portrait agent={ALPHA} slot="wall" />);
  expect(screen.getByTestId('portrait').style.marginTop).toBe('3px');
  unmount();

  const rail = render(<Portrait agent={ALPHA} slot="rail-row" />);
  expect(screen.getByTestId('portrait').style.marginTop).toBe('1px');
  rail.unmount();

  render(<Portrait agent={ALPHA} />);
  expect(screen.getByTestId('portrait').style.marginTop).toBe('0px');
});

it('draws the same agent identically every time', () => {
  const first = render(<Portrait agent={ALPHA} />);
  const html = screen.getByTestId('portrait').innerHTML;
  first.unmount();
  render(<Portrait agent={ALPHA} />);
  expect(screen.getByTestId('portrait').innerHTML).toBe(html);
});

it('sizes the terminal sprite box to the grid\'s 24:17 aspect, default 144x102', () => {
  render(<TerminalSprite />);
  const host = screen.getByTestId('terminal-sprite');
  expect(host.style.width).toBe('144px');
  expect(host.style.height).toBe('102px');
  expect(host.style.position).toBe('relative');
  expect(host.querySelector('svg')).not.toBeNull();
});

it('scales the terminal sprite and its glow together via the size prop', () => {
  render(<TerminalSprite size={72} />);
  const host = screen.getByTestId('terminal-sprite');
  expect(host.style.width).toBe('72px');
  expect(host.style.height).toBe('51px');
  const glow = screen.getByTestId('terminal-sprite-glow');
  expect(glow.style.width).toBe('88px'); // 176 * (72/144)
});

it('draws nothing for the terminal sprite when avatars are off, like the role portraits', () => {
  render(
    <SettingsContext.Provider value={{ ...DEFAULT_SETTINGS, avatars: false }}>
      <TerminalSprite />
    </SettingsContext.Provider>,
  );
  expect(screen.queryByTestId('terminal-sprite')).toBeNull();
});

// The look follows the cast's role slot, and the whole thing goes through the
// contexts the views already provide, so none of the seven call sites change.
const filmed = (settings: Partial<typeof DEFAULT_SETTINGS>, cast: Cast, agent = LEAD) =>
  render(
    <SettingsContext.Provider value={{ ...DEFAULT_SETTINGS, ...settings }}>
      <CastContext.Provider value={cast}>
        <Portrait agent={agent} />
      </CastContext.Provider>
    </SettingsContext.Provider>,
  );

const svgOf = () => screen.getByTestId('portrait').innerHTML;

it('draws the v3 portrait of the character the cast gave the agent, crisp, at the integer size', () => {
  const cast = buildCast([LEAD], 'breakingbad');
  expect(cast.slotOf('team-lead')).toBe('lead');
  filmed({ movieTheme: 'breakingbad' }, cast);
  const host = screen.getByTestId('portrait');
  expect(host.getAttribute('data-portrait')).toBe('v3');
  expect(host.style.width).toBe('32px');
  expect(host.style.imageRendering).toBe('pixelated');
  const svg = host.querySelector('svg')!;
  expect(svg.getAttribute('viewBox')).toBe('0 0 32 32');
  expect(svg.getAttribute('shape-rendering')).toBe('crispEdges');
  expect(svg.querySelectorAll('rect').length).toBeGreaterThan(50);
  // No recolour: every fill is a hex from the file, never a CSS variable or a lifted value.
  for (const r of svg.querySelectorAll('rect')) expect(r.getAttribute('fill')).toMatch(/^#[0-9a-f]{6}$/);
});

it('keeps the role sprite for an agent that took a spare, and with no theme', () => {
  const cast = buildCast([LEAD, ALPHA], 'breakingbad');
  expect(cast.slotOf('probe-alpha')).toBeNull();
  filmed({ movieTheme: 'breakingbad' }, cast, ALPHA);
  expect(screen.getByTestId('portrait').getAttribute('data-portrait')).not.toBe('v3');
  const spare = svgOf();
  cleanup();
  render(<Portrait agent={ALPHA} />);
  expect(svgOf()).toBe(spare);
  cleanup();
  filmed({ movieTheme: null }, buildCast([LEAD], null));
  expect(screen.getByTestId('portrait').getAttribute('data-portrait')).toBe('lead');
});

it('draws the v3 portrait whatever the film palette switch says — the switch reaches the ground, not the cast', () => {
  const cast = buildCast([LEAD], 'breakingbad');
  filmed({ movieTheme: 'breakingbad', filmPalette: false }, cast);
  expect(screen.getByTestId('portrait').getAttribute('data-portrait')).toBe('v3');
});

it('still honours the avatars toggle while a film is casting', () => {
  const cast = buildCast([LEAD], 'breakingbad');
  filmed({ movieTheme: 'breakingbad', avatars: false }, cast);
  expect(screen.queryByTestId('portrait')).toBeNull();
});

it('scales a v3 portrait to 128 for the seeker and refuses a size that is not a multiple of 32', () => {
  const cast = buildCast([LEAD], 'breakingbad');
  render(
    <SettingsContext.Provider value={{ ...DEFAULT_SETTINGS, movieTheme: 'breakingbad' }}>
      <CastContext.Provider value={cast}>
        <Portrait agent={LEAD} size={128} />
      </CastContext.Provider>
    </SettingsContext.Provider>,
  );
  expect(screen.getByTestId('portrait').querySelector('svg')!.getAttribute('width')).toBe('128');
  cleanup();
  const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
  expect(() =>
    render(
      <SettingsContext.Provider value={{ ...DEFAULT_SETTINGS, movieTheme: 'breakingbad' }}>
        <CastContext.Provider value={cast}>
          <Portrait agent={LEAD} size={24} />
        </CastContext.Provider>
      </SettingsContext.Provider>,
    ),
  ).toThrow(/multiple of 32/);
  quiet.mockRestore();
});
