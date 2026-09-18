// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Splash, prefersReducedMotion } from './Splash';

// One pending rAF callback at a time and a clock we set by hand, so a test
// can land on the handoff's timestamps exactly.
let pending: FrameRequestCallback | null = null;
let clock = 0;

beforeEach(() => {
  pending = null;
  clock = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    pending = cb;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    pending = null;
  });
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function tick(ms: number) {
  clock = ms;
  act(() => {
    const cb = pending;
    pending = null;
    cb?.(clock);
  });
}

it('paints ten sharp nodes on the handoff ground, hidden from assistive tech', () => {
  render(<Splash reduced={false} onDone={() => {}} />);
  const splash = screen.getByTestId('splash');
  expect(splash.getAttribute('aria-hidden')).toBe('true');
  expect(splash.style.backgroundColor).toBe('rgb(15, 16, 25)');
  expect(splash.textContent).toBe('');
  const nodes = screen.getAllByTestId('splash-node');
  expect(nodes).toHaveLength(10);
  // Node 1 is the lead: accent fill at grid (6, 1) → 54px, 9px.
  expect(nodes[1].style.backgroundColor).toBe('rgb(181, 171, 252)');
  expect(nodes[1].style.left).toBe('54px');
  expect(nodes[1].style.top).toBe('9px');
  expect(nodes[0].style.backgroundColor).toBe('rgb(147, 151, 171)');
});

it('drives every node from the rAF clock and calls onDone once at 4.4s', () => {
  const onDone = vi.fn();
  render(<Splash reduced={false} onDone={onDone} />);
  const nodes = screen.getAllByTestId('splash-node');
  expect(nodes[0].style.opacity).toBe('0');

  tick(800);
  expect(nodes[0].style.opacity).toBe('1');
  expect(nodes[1].style.opacity).toBe('0');
  expect(onDone).not.toHaveBeenCalled();

  tick(2450);
  // jsdom may re-serialise the colour, so only the blur is pinned.
  expect(nodes[1].style.boxShadow).toContain('0 0 17px');

  tick(4400);
  expect(nodes[0].style.opacity).toBe('0');
  expect(onDone).toHaveBeenCalledTimes(1);
  // The loop stopped: nothing was scheduled after the final frame.
  expect(pending).toBeNull();
});

it('ends at 1.5s with the mark already assembled when reduced', () => {
  const onDone = vi.fn();
  render(<Splash reduced onDone={onDone} />);
  const nodes = screen.getAllByTestId('splash-node');
  tick(750);
  expect(nodes[0].style.opacity).toBe('1');
  expect(nodes[0].style.transform).toBe('translate(0px, 0px) scale(1)');
  tick(1500);
  expect(onDone).toHaveBeenCalledTimes(1);
});

// `vi.stubGlobal` writes globalThis, and under vitest's jsdom `window` is a
// separate object, so the viewport is set on the window itself.
function setViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true });
}

it('fits the stage to a short viewport and leaves it at authored size on a tall one', () => {
  try {
    setViewport(1440, 300);
    render(<Splash reduced={false} onDone={() => {}} />);
    expect(screen.getByTestId('splash-stage').style.transform).toBe('translate(-50%, -50%) scale(0.5)');
    cleanup();
    setViewport(1920, 1080);
    render(<Splash reduced={false} onDone={() => {}} />);
    expect(screen.getByTestId('splash-stage').style.transform).toBe('translate(-50%, -50%) scale(1)');
  } finally {
    setViewport(1024, 768); // jsdom's defaults
  }
});

it('reads reduced motion as false where matchMedia is missing', () => {
  expect(prefersReducedMotion()).toBe(false);
  const w = window as unknown as { matchMedia?: () => { matches: boolean } };
  w.matchMedia = () => ({ matches: true });
  try {
    expect(prefersReducedMotion()).toBe(true);
  } finally {
    delete w.matchMedia;
  }
});
