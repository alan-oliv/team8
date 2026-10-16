import { describe, expect, it } from 'vitest';
import type { PixelGrid } from './pixel-grid';
import { framesOf, SEQ, turnFrame } from './head-turn';

// Fixture: a 16-wide head (x 8..23) with a single marker pixel 'b' at x=16 on
// every row, a 24-wide hat brim on row 3 (x 4..27), and a neck on rows 29–31.
// Row 18 is the face row the algorithm measures the turn span against.
const HEAD = '........' + 'aaaaaaaa' + 'b' + 'aaaaaaa' + '........'; // 32 chars, 'b' at 16
const BRIM = '....' + 'c'.repeat(24) + '....';
const fixture = (): PixelGrid => ({
  colors: ['#aaaaaa', '#bbbbbb', '#cccccc'],
  rows: Array.from({ length: 32 }, (_, y) => (y === 3 ? BRIM : HEAD)),
});
const markerAt = (row: string) => row.indexOf('b');

describe('the sequence', () => {
  it('is the twelve-frame loop from the handoff, 5.35 s long', () => {
    expect(SEQ.map(([f]) => f).join(' ')).toBe('F L1 L2 L1 F R1 R2 R1 F L1 L2 L1');
    expect(SEQ.reduce((n, [, ms]) => n + ms, 0)).toBe(5350);
  });
});

describe('turnFrame', () => {
  it('is the identity at g = 1', () => {
    expect(turnFrame(fixture(), 1, -1).rows).toEqual(fixture().rows);
    expect(turnFrame(fixture(), 1, 1).rows).toEqual(fixture().rows);
  });

  it('slides the inside of the face toward the side being looked at', () => {
    const left = turnFrame(fixture(), 2.1, -1);
    const right = turnFrame(fixture(), 2.1, 1);
    expect(markerAt(left.rows[18])).toBeLessThan(16);
    expect(markerAt(right.rows[18])).toBeGreaterThan(16);
  });

  it('never moves a row\'s outline: first and last pixel stay where they were', () => {
    const edges = (row: string) => [row.search(/[^.]/), row.replace(/\.+$/, '').length - 1];
    for (const g of [1.45, 2.1]) {
      for (const dir of [-1, 1] as const) {
        const out = turnFrame(fixture(), g, dir);
        out.rows.forEach((row, y) => {
          expect(edges(row), `row ${y} g ${g} dir ${dir}`).toEqual(edges(fixture().rows[y]));
          expect(row).toHaveLength(32);
        });
      }
    }
  });

  it('leaves what is outside the face width alone: the brim beyond x 8..23 is untouched', () => {
    const out = turnFrame(fixture(), 2.1, -1);
    expect(out.rows[3].slice(0, 8)).toBe(BRIM.slice(0, 8));
    expect(out.rows[3].slice(24)).toBe(BRIM.slice(24));
  });

  it('turns hair rows less than face rows and the neck not at all', () => {
    const out = turnFrame(fixture(), 2.1, -1);
    const faceShift = 16 - markerAt(out.rows[18]);
    const hairShift = 16 - markerAt(out.rows[5]);
    expect(faceShift).toBeGreaterThan(hairShift);
    expect(hairShift).toBeGreaterThanOrEqual(0);
    for (const y of [29, 30, 31]) expect(out.rows[y]).toBe(HEAD);
  });

  it('turns further at the near-profile exponent than at three-quarter', () => {
    const q = 16 - markerAt(turnFrame(fixture(), 1.45, -1).rows[18]);
    const p = 16 - markerAt(turnFrame(fixture(), 2.1, -1).rows[18]);
    expect(p).toBeGreaterThan(q);
  });

  it('keeps the colour table by reference and never invents a colour', () => {
    const src = fixture();
    const out = turnFrame(src, 2.1, 1);
    expect(out.colors).toBe(src.colors);
    for (const row of out.rows) expect(row).toMatch(/^[abc.]{32}$/);
  });
});

describe('framesOf', () => {
  it('returns the source as F and the four turned frames, once per grid object', () => {
    const src = fixture();
    const frames = framesOf(src);
    expect(frames.F).toBe(src);
    expect(frames.L1.rows).toEqual(turnFrame(src, 1.45, -1).rows);
    expect(frames.L2.rows).toEqual(turnFrame(src, 2.1, -1).rows);
    expect(frames.R1.rows).toEqual(turnFrame(src, 1.45, 1).rows);
    expect(frames.R2.rows).toEqual(turnFrame(src, 2.1, 1).rows);
    expect(framesOf(src)).toBe(frames);
  });
});
