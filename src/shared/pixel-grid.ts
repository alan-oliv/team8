/**
 * A 32×32 pixel portrait as the console stores it: one string per row, one
 * char per pixel, the char an index into `colors`; `.` is transparent. The same
 * shape as `SPRITES` in ./portrait.ts, so the generated v3 module reads in a
 * diff and the head turn is a slice per row.
 */
export interface PixelGrid {
  colors: string[];
  rows: string[];
}

export const GRID = 32;

/** Row chars, by colour index: 0–9, a–z, A–Z. 62 colours per portrait is the ceiling. */
export const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function colorAt(grid: PixelGrid, x: number, y: number): string | null {
  const ch = grid.rows[y]?.[x];
  if (ch === undefined || ch === '.') return null;
  return grid.colors[DIGITS.indexOf(ch)] ?? null;
}

/**
 * The grid as inline SVG, one `<rect>` per horizontal run of one colour. The
 * size is checked because a v3 portrait at 24px is 0.75 screen px per pixel —
 * an uneven blur — and nothing downstream could tell.
 */
export function gridSvgV3(grid: PixelGrid, size: number): string {
  if (size % GRID !== 0) throw new Error(`a v3 portrait is drawn at a multiple of ${GRID}px, not ${size}`);
  let rects = '';
  grid.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      const ch = row[x];
      let w = 1;
      while (x + w < row.length && row[x + w] === ch) w++;
      if (ch !== '.') rects += `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${grid.colors[DIGITS.indexOf(ch)]}"/>`;
      x += w;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${GRID} ${GRID}" shape-rendering="crispEdges" style="display:block">${rects}</svg>`;
}
