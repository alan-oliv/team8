import { describe, expect, it } from 'vitest';
import { colorAt, DIGITS, GRID, gridSvgV3, type PixelGrid } from './pixel-grid';

// A 32×32 grid: row 0 is a 3-wide run of colour 0 then one pixel of colour 1,
// row 1 is a lone pixel of colour 1 at x=31, everything else transparent.
const row = (s: string) => s.padEnd(GRID, '.');
const FIXTURE: PixelGrid = {
  colors: ['#112233', '#abcdef'],
  rows: [row('0001'), row('.'.repeat(31) + '1'), ...Array.from({ length: 30 }, () => row(''))],
};

describe('the index alphabet', () => {
  it('has 62 distinct symbols, none of them the transparent dot', () => {
    expect(DIGITS).toHaveLength(62);
    expect(new Set(DIGITS).size).toBe(62);
    expect(DIGITS).not.toContain('.');
  });
});

describe('colorAt', () => {
  it('reads a colour through the row char, null for transparent and off-grid', () => {
    expect(colorAt(FIXTURE, 0, 0)).toBe('#112233');
    expect(colorAt(FIXTURE, 3, 0)).toBe('#abcdef');
    expect(colorAt(FIXTURE, 4, 0)).toBeNull();
    expect(colorAt(FIXTURE, 31, 1)).toBe('#abcdef');
    expect(colorAt(FIXTURE, 32, 0)).toBeNull();
    expect(colorAt(FIXTURE, 0, 32)).toBeNull();
  });
});

describe('gridSvgV3', () => {
  it('draws one rect per horizontal run, at the pixel size asked for', () => {
    const svg = gridSvgV3(FIXTURE, 128);
    expect(svg.startsWith('<svg ')).toBe(true);
    expect(svg).toContain('width="128" height="128" viewBox="0 0 32 32" shape-rendering="crispEdges"');
    expect(svg).toContain('<rect x="0" y="0" width="3" height="1" fill="#112233"/>');
    expect(svg).toContain('<rect x="3" y="0" width="1" height="1" fill="#abcdef"/>');
    expect(svg).toContain('<rect x="31" y="1" width="1" height="1" fill="#abcdef"/>');
    expect(svg.match(/<rect /g)).toHaveLength(3);
  });

  it('refuses a size that is not a multiple of 32, so a slot can never blur a portrait', () => {
    expect(() => gridSvgV3(FIXTURE, 24)).toThrow(/multiple of 32/);
    expect(() => gridSvgV3(FIXTURE, 32)).not.toThrow();
    expect(() => gridSvgV3(FIXTURE, 64)).not.toThrow();
  });

  it('is a block element so the host box, not the line box, sizes it', () => {
    expect(gridSvgV3(FIXTURE, 32)).toContain('style="display:block"');
  });
});
