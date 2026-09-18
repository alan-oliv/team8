# Splash Animation Implementation Plan

> **For agentic workers:** this plan is executed by teammates that `team8:run` dispatches from the shared task list. Read your own task section. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Play the 4.4s logo-4b splash animation over the console on every page load, then unmount it and reveal the app.

**Architecture:** One pure function turns elapsed seconds into every visible property of the ten nodes and the bloom (`splash-frame.ts`), a thin React component drives it from a requestAnimationFrame loop and paints it as absolutely positioned divs (`Splash.tsx`), and `App.tsx` overlays that component on every shell branch until it reports done. Reduced motion (the OS preference, or the console's own `motion` setting off) swaps the fly-in timeline for a 1.5s cross-fade of the assembled mark.

**Tech Stack:** React 19, TypeScript, vitest + @testing-library/react (jsdom), plain CSS in `src/web/theme.css`.

**Spec:** `docs/design_handoff_splash_animation/README.md` (geometry, colours, timing and easing tables) with `docs/design_handoff_splash_animation/splash-scene.jsx` as the reference implementation of the same maths. The design was approved in chat on the bounded path; there is no separate spec file.

## Global Constraints

- Colours are the handoff's literals, not theme tokens: ground `#0f1019`, teammate node `#9397ab`, lead node `#b5abfc`, teammate glow `rgba(145,132,217,0.5)`, lead glow `rgba(181,171,252,0.8)`, bloom gradient `rgba(145,132,217,0.20) 0%, rgba(145,132,217,0.06) 40%, rgba(145,132,217,0) 70%`. The splash is a brand moment and plays the same on every theme, including light ones.
- Geometry at authored size: grid unit 9px, node 18×18px, mark 108×108px, bloom 600×600px, border-radius 0 everywhere.
- Timeline cues: Assemble 0.0, Hold 2.0, Exit 2.9, end 4.4. Reduced-motion end 1.5.
- Plays on every page load. No localStorage or sessionStorage.
- No text, icon, spinner or progress indicator in the splash.
- Everything visible is a function of elapsed seconds `t`; no chained CSS animations. The console's `data-motion="off"` rule kills CSS animations only, so reduced motion is passed as a prop.
- No new dependencies.
- Tests run with `npx vitest run <file>`; typecheck with `npm run typecheck`.

---

## File Structure

- Create `src/web/chrome/splash-frame.ts` — node geometry, easing functions, and `splashFrame(t, reduced)` returning the frame to paint. No React.
- Create `src/web/chrome/splash-frame.test.ts` — asserts the frame at the handoff's key timestamps.
- Create `src/web/chrome/Splash.tsx` — the overlay component: rAF clock, viewport fit, paints a frame, fires `onDone`. Exports `prefersReducedMotion()`.
- Create `src/web/chrome/Splash.test.tsx` — component test with a stubbed rAF clock.
- Modify `src/web/theme.css` — the `.splash*` layout classes (positions and sizes only; colours are inline from the frame).
- Modify `src/web/App.tsx` — `splashDone` state, `<Splash>` rendered inside each of the three `.console` roots until done.
- Modify `src/web/App.test.tsx` — the splash covers the shell before the first snapshot and is gone after done.

---

### Task 1: Splash frame maths

**Files:**
- Create: `src/web/chrome/splash-frame.ts`
- Test: `src/web/chrome/splash-frame.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces, exported from `src/web/chrome/splash-frame.ts`:
  - `SPLASH_END = 4.4`, `REDUCED_END = 1.5`, `UNIT = 9`, `MARK = 108`, `BLOOM = 600`
  - `COLORS = { bg: '#0f1019', teammate: '#9397ab', lead: '#b5abfc', glowTeammate: 'rgba(145,132,217,0.5)', glowLead: 'rgba(181,171,252,0.8)' }`
  - `interface NodeFrame { x: number; y: number; lead: boolean; opacity: number; dx: number; dy: number; scale: number; glow: number }` (`x`/`y` are grid units; `dx`/`dy` px offsets from the final position; `glow` the box-shadow blur in px)
  - `interface Frame { done: boolean; breathe: number; bloomOpacity: number; bloomScale: number; nodes: NodeFrame[] }`
  - `splashFrame(t: number, reduced: boolean): Frame`

- [ ] **Step 1: Write the failing tests**

Create `src/web/chrome/splash-frame.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { REDUCED_END, SPLASH_END, splashFrame } from './splash-frame';

describe('assemble', () => {
  it('starts every node invisible, 220px out along its own ray', () => {
    const f = splashFrame(0, false);
    expect(f.nodes).toHaveLength(10);
    for (const n of f.nodes) {
      expect(n.opacity).toBe(0);
      expect(Math.hypot(n.dx, n.dy)).toBeCloseTo(220, 5);
    }
    // Node 0 sits above-left of centre, so it flies in from above-left.
    expect(f.nodes[0].dx).toBeLessThan(0);
    expect(f.nodes[0].dy).toBeLessThan(0);
    expect(f.done).toBe(false);
  });

  it('lands node 0 at 0.8s with an overshoot while the lead has not started', () => {
    const f = splashFrame(0.8, false);
    expect(f.nodes[0].opacity).toBe(1);
    expect(f.nodes[0].dx).toBeCloseTo(0, 5);
    expect(f.nodes[0].dy).toBeCloseTo(0, 5);
    expect(f.nodes[0].scale).toBeGreaterThan(1);
    expect(f.nodes[1].lead).toBe(true);
    expect(f.nodes[1].opacity).toBe(0);
  });

  it('settles node 0 to scale 1 by 0.9s and lands the lead at 1.8s', () => {
    expect(splashFrame(0.9, false).nodes[0].scale).toBeCloseTo(1, 5);
    const lead = splashFrame(1.8, false).nodes[1];
    expect(lead.opacity).toBe(1);
    expect(lead.dx).toBeCloseTo(0, 5);
  });
});

describe('hold', () => {
  it('has the bloom fully in and every glow at full by 2.45s', () => {
    const f = splashFrame(2.45, false);
    expect(f.bloomOpacity).toBeCloseTo(1, 5);
    expect(f.bloomScale).toBeCloseTo(1, 5);
    expect(f.nodes[0].glow).toBeCloseTo(8, 5); // 2*settle + 6*bloom
    expect(f.nodes[1].glow).toBeCloseTo(17, 5); // 5*settle + 12*bloom
  });

  it('has the bloom absent before 1.75s and breathes the mark to 1.05 by 3.3s', () => {
    expect(splashFrame(1.75, false).bloomOpacity).toBe(0);
    expect(splashFrame(1.75, false).bloomScale).toBeCloseTo(0.6, 5);
    expect(splashFrame(2.0, false).breathe).toBeCloseTo(1, 5);
    expect(splashFrame(3.3, false).breathe).toBeCloseTo(1.05, 5);
  });
});

describe('exit', () => {
  it('fades the lead first, gone and shrunk to 86% by 3.54s', () => {
    const lead = splashFrame(3.54, false).nodes[1];
    expect(lead.opacity).toBe(0);
    expect(lead.scale).toBeCloseTo(0.86, 5);
    // Node 2 waits 0.46s, so at 3.2s it is still fully there.
    expect(splashFrame(3.2, false).nodes[2].opacity).toBe(1);
  });

  it('has the bloom out by 3.5s and the frame empty and done at 4.4s', () => {
    expect(splashFrame(3.5, false).bloomOpacity).toBe(0);
    const f = splashFrame(SPLASH_END, false);
    for (const n of f.nodes) expect(n.opacity).toBe(0);
    expect(f.bloomOpacity).toBe(0);
    expect(f.done).toBe(true);
    expect(splashFrame(4.39, false).done).toBe(false);
  });
});

describe('reduced motion', () => {
  it('cross-fades the assembled mark in over 0.5s and out by 1.5s', () => {
    const start = splashFrame(0, true);
    for (const n of start.nodes) {
      expect(n.opacity).toBe(0);
      expect(n.dx).toBe(0);
      expect(n.dy).toBe(0);
      expect(n.scale).toBe(1);
    }
    expect(splashFrame(0.25, true).nodes[0].opacity).toBeCloseTo(0.5, 5);
    const held = splashFrame(0.75, true);
    expect(held.nodes[0].opacity).toBe(1);
    expect(held.bloomOpacity).toBe(1);
    expect(held.bloomScale).toBe(1);
    expect(held.breathe).toBe(1);
    expect(held.nodes[1].glow).toBe(17);
    const end = splashFrame(REDUCED_END, true);
    for (const n of end.nodes) expect(n.opacity).toBe(0);
    expect(end.bloomOpacity).toBe(0);
    expect(end.done).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/web/chrome/splash-frame.test.ts`
Expected: FAIL — cannot resolve `./splash-frame`.

- [ ] **Step 3: Write the frame maths**

Create `src/web/chrome/splash-frame.ts`. Every number below is from the handoff README; keep them verbatim.

```ts
/**
 * The splash timeline as a pure function of elapsed seconds, per
 * docs/design_handoff_splash_animation/README.md. Nothing here touches the
 * DOM, so any timestamp can be asserted directly.
 */

export const SPLASH_END = 4.4;
export const REDUCED_END = 1.5;
export const UNIT = 9;
export const MARK = 12 * UNIT;
export const BLOOM = 600;

export const COLORS = {
  bg: '#0f1019',
  teammate: '#9397ab',
  lead: '#b5abfc',
  glowTeammate: 'rgba(145,132,217,0.5)',
  glowLead: 'rgba(181,171,252,0.8)',
} as const;

const CUE = { assemble: 0, hold: 2.0, exit: 2.9 } as const;

/** Grid coordinates of each node's top-left unit; index is the handoff's node #. */
const NODES = [
  { x: 3, y: 1, lead: false },
  { x: 6, y: 1, lead: true },
  { x: 1, y: 3, lead: false },
  { x: 8, y: 3, lead: false },
  { x: 3, y: 5, lead: false },
  { x: 6, y: 5, lead: false },
  { x: 1, y: 7, lead: false },
  { x: 8, y: 7, lead: false },
  { x: 3, y: 9, lead: false },
  { x: 6, y: 9, lead: false },
] as const;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

type Ease = (t: number) => number;
const c1 = 1.70158;
const c3 = c1 + 1;
const easeOutExpo: Ease = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));
const easeOutBack: Ease = (t) => 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
const easeInOutCubic: Ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeInQuad: Ease = (t) => t * t;
const easeInCubic: Ease = (t) => t * t * t;
const easeInQuart: Ease = (t) => t * t * t * t;
const easeInSine: Ease = (t) => 1 - Math.cos((t * Math.PI) / 2);
const easeInExpo: Ease = (t) => (t <= 0 ? 0 : 2 ** (10 * t - 10));
const easeInOutSine: Ease = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
const easeInOutQuad: Ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const easeInOutQuart: Ease = (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - (-2 * t + 2) ** 4 / 2);

/** `from` → `to` over [start, end] on `ease`, clamped outside the window. */
function tween(t: number, from: number, to: number, start: number, end: number, ease: Ease): number {
  const p = clamp01((t - start) / (end - start));
  return from + (to - from) * ease(p);
}

/** Exit table: delay after the Exit cue and easing, per node #. Duration is 0.5 + (i % 3) * 0.14. */
const EXIT_DELAY = [0.3, 0.0, 0.46, 0.12, 0.22, 0.52, 0.06, 0.38, 0.44, 0.18] as const;
const EXIT_EASE: Ease[] = [
  easeInQuad,
  easeInOutSine,
  easeInCubic,
  easeInOutQuad,
  easeInQuart,
  easeInOutCubic,
  easeInSine,
  easeInExpo,
  easeInQuad,
  easeInOutQuart,
];

/** Fly-in order: teammates by node #, the lead last (0, —, 1, 2, 3, 4, 5, 6, 7, 8). */
const ORDER = [0, null, 1, 2, 3, 4, 5, 6, 7, 8] as const;

export interface NodeFrame {
  x: number;
  y: number;
  lead: boolean;
  opacity: number;
  dx: number;
  dy: number;
  scale: number;
  glow: number;
}

export interface Frame {
  done: boolean;
  breathe: number;
  bloomOpacity: number;
  bloomScale: number;
  nodes: NodeFrame[];
}

function bloomIn(t: number): number {
  return tween(t, 0, 1, CUE.hold - 0.25, CUE.hold + 0.45, easeInOutCubic);
}

function fullFrame(t: number): Frame {
  const bloom = bloomIn(t);
  const bloomOut = tween(t, 1, 0, CUE.exit, CUE.exit + 0.6, easeInOutCubic);
  const nodes = NODES.map((n, i): NodeFrame => {
    // Ray from the mark's centre through the node's centre.
    const cx = (n.x + 1) * UNIT - MARK / 2;
    const cy = (n.y + 1) * UNIT - MARK / 2;
    const len = Math.hypot(cx, cy) || 1;
    const order = ORDER[i];
    const start = CUE.assemble + 0.1 + (order === null ? 1.0 : order * 0.09);
    const end = start + 0.7;

    const p = tween(t, 0, 1, start, end, easeOutExpo);
    const fly = 220 * (1 - p);
    const pop = tween(t, 0.4, 1, start, start + 0.8, easeOutBack);
    const settle = clamp01((t - end) / 0.5);

    const outStart = CUE.exit + EXIT_DELAY[i];
    const out = tween(t, 1, 0, outStart, outStart + 0.5 + (i % 3) * 0.14, EXIT_EASE[i]);

    return {
      x: n.x,
      y: n.y,
      lead: n.lead,
      opacity: p * out,
      dx: (cx / len) * fly,
      dy: (cy / len) * fly,
      scale: pop * (0.86 + 0.14 * out),
      glow: n.lead ? 5 * settle + 12 * bloom : 2 * settle + 6 * bloom,
    };
  });
  return {
    done: t >= SPLASH_END,
    breathe: tween(t, 1, 1.05, CUE.hold, CUE.exit + 0.4, easeInOutCubic),
    bloomOpacity: bloom * bloomOut,
    bloomScale: 0.6 + 0.4 * bloom,
    nodes,
  };
}

/** No fly-in: the assembled mark cross-fades in over 0.5s and out over the last 0.5s. */
function reducedFrame(t: number): Frame {
  const fade = clamp01(t / 0.5) * (1 - clamp01((t - (REDUCED_END - 0.5)) / 0.5));
  return {
    done: t >= REDUCED_END,
    breathe: 1,
    bloomOpacity: fade,
    bloomScale: 1,
    nodes: NODES.map((n) => ({
      x: n.x,
      y: n.y,
      lead: n.lead,
      opacity: fade,
      dx: 0,
      dy: 0,
      scale: 1,
      glow: n.lead ? 17 : 8,
    })),
  };
}

export function splashFrame(t: number, reduced: boolean): Frame {
  return reduced ? reducedFrame(t) : fullFrame(t);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/web/chrome/splash-frame.test.ts`
Expected: PASS, 8 tests. If `lead.opacity` at 3.54 is a hair above 0 rather than exactly 0, the tween clamp is wrong: `p` must reach exactly 1 at `end`, and `easeInOutSine(1)` is exactly 1.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/web/chrome/splash-frame.ts src/web/chrome/splash-frame.test.ts
git commit -m "Add the splash timeline as a pure function of elapsed time"
```

### Task 2: Splash component and overlay styles

**Files:**
- Create: `src/web/chrome/Splash.tsx`
- Modify: `src/web/theme.css` (append after the `@keyframes blink` block)
- Test: `src/web/chrome/Splash.test.tsx`

**Interfaces:**
- Consumes: `splashFrame`, `UNIT`, `MARK`, `BLOOM`, `COLORS` from `src/web/chrome/splash-frame.ts` (`done` on the returned frame is what ends the loop; the `*_END` constants are not read here).
- Produces, exported from `src/web/chrome/Splash.tsx`:
  - `function Splash({ reduced, onDone }: { reduced: boolean; onDone: () => void }): JSX.Element` — renders `<div class="splash" data-testid="splash" aria-hidden="true">`, a centred `data-testid="splash-stage"` wrapper carrying the viewport fit, and each node as `<div class="splash-node" data-testid="splash-node">`; calls `onDone` exactly once when the timeline ends.
  - `function prefersReducedMotion(): boolean` — `matchMedia('(prefers-reduced-motion: reduce)').matches`, false where `matchMedia` is missing (jsdom).

- [ ] **Step 1: Write the failing tests**

Create `src/web/chrome/Splash.test.tsx`. The clock is stubbed rather than faked with `vi.useFakeTimers`, so a frame is one explicit `tick(ms)` call and nothing depends on whether the timers package fakes `requestAnimationFrame`.

```tsx
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/web/chrome/Splash.test.tsx`
Expected: FAIL — cannot resolve `./Splash`.

- [ ] **Step 3: Write the component**

Create `src/web/chrome/Splash.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { BLOOM, COLORS, MARK, UNIT, splashFrame } from './splash-frame';

/** The OS-level preference. jsdom has no matchMedia, so its absence reads as off. */
export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

/** Authored at 1920×1080 with a 600px bloom; a shorter side under 600px scales the whole stage down. */
function fitScale(): number {
  return Math.min(1, Math.min(window.innerWidth, window.innerHeight) / BLOOM);
}

/**
 * The logo-4b entry animation, full-bleed over the console. Every visible
 * property is read off `splashFrame(t)` each frame, so the timeline lives in
 * one pure function and this component only keeps the clock.
 */
export function Splash({ reduced, onDone }: { reduced: boolean; onDone: () => void }) {
  const [t, setT] = useState(0);
  const [fit] = useState(fitScale);
  // Read through a ref so the loop is started once and never restarted by a
  // parent re-render handing down a fresh callback.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const start = performance.now();
    let handle = 0;
    const step = (now: number) => {
      const elapsed = (now - start) / 1000;
      setT(elapsed);
      if (splashFrame(elapsed, reduced).done) {
        onDoneRef.current();
        return;
      }
      handle = requestAnimationFrame(step);
    };
    handle = requestAnimationFrame(step);
    return () => cancelAnimationFrame(handle);
  }, [reduced]);

  const frame = splashFrame(t, reduced);

  return (
    <div className="splash" data-testid="splash" aria-hidden="true" style={{ backgroundColor: COLORS.bg }}>
      <div
        className="splash-stage"
        data-testid="splash-stage"
        style={{ transform: `translate(-50%, -50%) scale(${fit})` }}
      >
        <div
          className="splash-bloom"
          style={{
            width: BLOOM,
            height: BLOOM,
            opacity: frame.bloomOpacity,
            transform: `translate(-50%, -50%) scale(${frame.bloomScale})`,
          }}
        />
        <div
          className="splash-mark"
          style={{
            width: MARK,
            height: MARK,
            transform: `translate(-50%, -50%) scale(${frame.breathe})`,
          }}
        >
          {frame.nodes.map((n) => (
            <div
              key={`${n.x},${n.y}`}
              className="splash-node"
              data-testid="splash-node"
              style={{
                left: n.x * UNIT,
                top: n.y * UNIT,
                width: UNIT * 2,
                height: UNIT * 2,
                backgroundColor: n.lead ? COLORS.lead : COLORS.teammate,
                opacity: n.opacity,
                transform: `translate(${n.dx}px, ${n.dy}px) scale(${n.scale})`,
                boxShadow: `0 0 ${n.glow}px ${n.lead ? COLORS.glowLead : COLORS.glowTeammate}`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add the layout classes**

Append to `src/web/theme.css`, directly after the `@keyframes blink { ... }` block. Colours and sizes are inline from the component, so this is placement only and stays literal-free.

```css
/* The entry splash: a fixed full-bleed layer over the whole console with one
   centred stage, so the mark and the bloom share a single centre and scale
   together. Nothing here is a token: the splash paints the handoff's own
   colours inline and looks the same on every theme. */
.splash {
  position: fixed;
  inset: 0;
  z-index: 1000;
}

.splash-stage {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 0;
  height: 0;
}

.splash-bloom,
.splash-mark {
  position: absolute;
  left: 0;
  top: 0;
}

.splash-bloom {
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(145, 132, 217, 0.2) 0%,
    rgba(145, 132, 217, 0.06) 40%,
    rgba(145, 132, 217, 0) 70%
  );
}

.splash-node {
  position: absolute;
  border-radius: 0;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/web/chrome/Splash.test.tsx src/web/App.test.tsx`
Expected: PASS. The App suite is included because it reads `theme.css` and asserts on its contents; the appended block must not change any of those assertions.

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/web/chrome/Splash.tsx src/web/chrome/Splash.test.tsx src/web/theme.css
git commit -m "Add the splash overlay component driven by a rAF clock"
```

### Task 3: Mount the splash over the console

**Files:**
- Modify: `src/web/App.tsx` (state near line 39 next to `teamsOpen`; the three `.console` returns at lines 331-335, 353-373 and 375-395)
- Test: `src/web/App.test.tsx`

**Interfaces:**
- Consumes: `Splash`, `prefersReducedMotion` from `src/web/chrome/Splash.tsx`; `appearance.settings.motion` already in `App`.
- Produces: nothing new; `App` renders `[data-testid="splash"]` until the splash reports done.

- [ ] **Step 1: Freeze the splash clock for the existing App suite**

In `src/web/App.test.tsx`, the `beforeEach` at the top of the file currently reads:

```tsx
beforeEach(() => {
  installMockEventSource();
  window.history.replaceState(null, '', '/');
  // Hidden sessions and appearance both persist per browser, so without this a
  // test that hides a session leaves it hidden for every test after it — which
  // shows up as an empty picker several cases later, nowhere near the cause.
  window.localStorage.clear();
});
```

Add one stub so the splash sits frozen at its first frame in every case that does not drive it (the `afterEach` already calls `vi.unstubAllGlobals()`):

```tsx
beforeEach(() => {
  installMockEventSource();
  window.history.replaceState(null, '', '/');
  // Hidden sessions and appearance both persist per browser, so without this a
  // test that hides a session leaves it hidden for every test after it — which
  // shows up as an empty picker several cases later, nowhere near the cause.
  window.localStorage.clear();
  // The splash asks for a frame on mount; never granting one keeps it frozen at
  // t=0 so no case sees a re-render from an animation it is not testing.
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
```

- [ ] **Step 2: Write the failing test**

Append to `src/web/App.test.tsx`:

```tsx
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

    now.mockReturnValue(4400);
    act(() => pending?.(4400));
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
    // Reduced motion ends at 1.5s; the full timeline would still be mid-hold.
    now.mockReturnValue(1500);
    act(() => pending?.(1500));
    expect(screen.queryByTestId('splash')).toBeNull();
  } finally {
    now.mockRestore();
  }
});
```

`SETTINGS_KEY` (`'console.appearance'`) is exported from `src/web/state/useSettings.ts`; extend the existing `import { FOLDER_SETTINGS_KEY } from './state/useSettings';` line to `import { FOLDER_SETTINGS_KEY, SETTINGS_KEY } from './state/useSettings';` and write `window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ motion: false }));` instead of the literal.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/web/App.test.tsx -t "splash"`
Expected: FAIL — `Unable to find an element by: [data-testid="splash"]`.

- [ ] **Step 4: Mount the splash in App**

In `src/web/App.tsx`:

1. Add the import next to the other chrome imports:

```tsx
import { Splash, prefersReducedMotion } from './chrome/Splash';
```

2. Next to `const [teamsOpen, setTeamsOpen] = useState(false);` add:

```tsx
  // The entry splash plays once per page load over whichever shell renders
  // underneath, and is unmounted the moment it reports done.
  const [splashDone, setSplashDone] = useState(false);
```

3. Directly above the `if (!state) {` return (after `useKeyboard({...})`), build the element once so all three shells render the same thing:

```tsx
  const splash = splashDone ? null : (
    <Splash
      reduced={!appearance.settings.motion || prefersReducedMotion()}
      onDone={() => setSplashDone(true)}
    />
  );
```

4. Render `{splash}` as the last child of each of the three `<div className="console" ...>` roots:

The empty shell:

```tsx
  if (!state) {
    return (
      <div className="console" style={appearance.vars} data-motion={appearance.settings.motion ? 'on' : 'off'}>
        <main className="console-body" />
        {splash}
      </div>
    );
  }
```

The workflow shell, after `<Workflow ... />`:

```tsx
        <Workflow
          run={run}
          runs={runs}
          onSelectRun={store.setRun}
          backToTeam={state.mode === 'team' ? (state.sessionName ?? state.teamName) : undefined}
          now={now}
          teamName={state.teamName || state.leadSessionId}
          sessionName={state.sessionName}
          switching={state.switching}
          teamsOpen={teamsOpen}
          onTeamsOpenChange={setTeamsOpen}
          appearance={appearance}
          subagents={state.subagents}
        />
        {splash}
      </div>
```

The team shell, at the end of the final `return`, after `<Panel ... />`:

```tsx
      <NeedsYou items={state.needsYou} readOnly={state.readOnly} now={now} />
      <Panel agents={state.agents} focusedAgent={store.agent} onFocusAgent={store.setAgent} />
      {splash}
    </div>
    </WatchContext.Provider>
```

- [ ] **Step 5: Run the App suite to verify it passes**

Run: `npx vitest run src/web/App.test.tsx`
Expected: PASS, including every pre-existing case. If a pre-existing case fails on a duplicate-element query, the splash's own test ids (`splash`, `splash-stage`, `splash-node`) are the only ones it adds; nothing else in the console uses those names.

- [ ] **Step 6: Typecheck, run the whole suite, commit**

Run: `npm run typecheck && npx vitest run`
Expected: no type errors; all suites pass.

```bash
git add src/web/App.tsx src/web/App.test.tsx
git commit -m "Play the splash over the console on every page load"
```
