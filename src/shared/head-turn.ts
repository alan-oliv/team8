import type { PixelGrid } from './pixel-grid';

/** F is the portrait as drawn; 1 is three-quarter, 2 near-profile; L/R the side looked at. */
export type FrameId = 'F' | 'L1' | 'L2' | 'R1' | 'R2';

/**
 * The seeker's loop (handoff "The head turn"): look left, look right, then a
 * quick double-take to the left. Whole frames on a timer — no tweening.
 */
export const SEQ: readonly (readonly [FrameId, number])[] = [
  ['F', 900], ['L1', 110], ['L2', 1100], ['L1', 110],
  ['F', 450], ['R1', 110], ['R2', 1100], ['R1', 110],
  ['F', 800], ['L1', 90], ['L2', 380], ['L1', 90],
];

const THREE_QUARTER = 1.45;
const NEAR_PROFILE = 2.1;
/** The row whose filled span is the face's own width; the turn happens inside it. */
const FACE_ROW = 18;
/** Rows above this are hair and hats: they turn less than half as much as the face. */
const FACE_FROM = 11;
const HAIR_FACTOR = 0.45;
/** Rows from here down are neck and collar: they do not turn. */
const NECK_FROM = 29;

function span(row: string): [number, number] {
  let L = -1;
  let R = -1;
  for (let x = 0; x < row.length; x++) {
    if (row[x] === '.') continue;
    if (L < 0) L = x;
    R = x;
  }
  return [L, R];
}

/**
 * One turned frame. `g` is the exponent (1.45 three-quarter, 2.1 near-profile),
 * `dir` −1 looks left, +1 right. Per row: the outline never moves; pixels
 * inside the face width are resampled toward the side looked at, nearest
 * neighbour. Hair rows get a softened exponent, the neck none.
 */
export function turnFrame(grid: PixelGrid, g: number, dir: -1 | 1): PixelGrid {
  const [cL, cR] = span(grid.rows[FACE_ROW] ?? '');
  const rows = grid.rows.map((row, y) => {
    const [rL, rR] = span(row);
    if (rL < 0 || y >= NECK_FROM) return row;
    const L = Math.max(rL, cL);
    const R = Math.min(rR, cR);
    const gy = y < FACE_FROM ? 1 + (g - 1) * HAIR_FACTOR : g;
    if (R <= L || gy === 1) return row;
    const out = row.split('');
    for (let x = L; x <= R; x++) {
      const u = (x - L) / (R - L);
      const su = dir < 0 ? Math.pow(u, 1 / gy) : 1 - Math.pow(1 - u, 1 / gy);
      out[x] = row[Math.round(L + su * (R - L))];
    }
    return out.join('');
  });
  return { colors: grid.colors, rows };
}

const cache = new WeakMap<PixelGrid, Record<FrameId, PixelGrid>>();

/** All five frames, computed once per grid object; the grids in PORTRAITS_V3 are module constants, so this is once per character. */
export function framesOf(grid: PixelGrid): Record<FrameId, PixelGrid> {
  let frames = cache.get(grid);
  if (!frames) {
    frames = {
      F: grid,
      L1: turnFrame(grid, THREE_QUARTER, -1),
      L2: turnFrame(grid, NEAR_PROFILE, -1),
      R1: turnFrame(grid, THREE_QUARTER, 1),
      R2: turnFrame(grid, NEAR_PROFILE, 1),
    };
    cache.set(grid, frames);
  }
  return frames;
}
