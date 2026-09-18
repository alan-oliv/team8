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
  // Snap at the boundaries: some easings (e.g. easeInSine(1)) are a hair off
  // exact due to floating point, which would leak into "done" frames.
  if (p >= 1) return to;
  if (p <= 0) return from;
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
