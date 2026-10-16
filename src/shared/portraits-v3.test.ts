import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildPortraits, FOLDERS, gridOfSvg, renderModule } from '../../scripts/build-portraits';
import { buildCast, MOVIE_THEMES } from './cast';
import { characterGrid } from './character-portrait';
import { DIGITS, GRID } from './pixel-grid';
import { PORTRAITS_V3 } from './portraits-v3';

const films = MOVIE_THEMES.filter((t) => t.key !== 'off');

describe('gridOfSvg', () => {
  it('rasterises rect runs into rows, first-seen colours first, metadata ignored', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges"><metadata><x>junk</x></metadata><rect x="2" y="0" width="3" height="1" fill="#AABBCC"/><rect x="31" y="31" width="1" height="1" fill="#000000"/></svg>`;
    const grid = gridOfSvg(svg);
    expect(grid.colors).toEqual(['#aabbcc', '#000000']);
    expect(grid.rows).toHaveLength(GRID);
    expect(grid.rows[0]).toBe('..000' + '.'.repeat(27));
    expect(grid.rows[31]).toBe('.'.repeat(31) + '1');
  });
});

describe('the generated module', () => {
  it('is what the script produces from the SVGs on disk — rerun `npm run build:portraits` if not', () => {
    const file = path.resolve(process.cwd(), 'src/shared/portraits-v3.ts');
    expect(readFileSync(file, 'utf8')).toBe(renderModule(buildPortraits()));
  });

  it('maps every folder to a theme key the database has', () => {
    const keys = new Set(films.map((f) => f.key));
    for (const key of Object.values(FOLDERS)) expect(keys.has(key), key).toBe(true);
    expect(Object.keys(FOLDERS)).toHaveLength(10);
  });

  it('has a grid for every character in every film role, under the exact role name', () => {
    for (const film of films) {
      for (const [slot, name] of Object.entries(film.roles)) {
        expect(PORTRAITS_V3[film.key]?.[name], `${film.key}.${slot} = ${name}`).toBeDefined();
      }
    }
  });

  it('keeps every grid 32 rows of 32 chars, every char a known colour or the dot', () => {
    for (const [key, byName] of Object.entries(PORTRAITS_V3)) {
      for (const [name, grid] of Object.entries(byName)) {
        expect(grid.rows, `${key}/${name}`).toHaveLength(GRID);
        for (const row of grid.rows) {
          expect(row, `${key}/${name}`).toHaveLength(GRID);
          for (const ch of row) {
            if (ch === '.') continue;
            expect(DIGITS.indexOf(ch), `${key}/${name} char ${ch}`).toBeLessThan(grid.colors.length);
          }
        }
        for (const c of grid.colors) expect(c).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it('carries the Heisenberg hat fix: no skin beside the crown on rows 6–9', () => {
    // The handoff removed the skin pixels either side of the crown above the
    // brim. The skin is the most common colour on the face rows (11–28); none of
    // it may appear on rows 6–9.
    const grid = PORTRAITS_V3.breakingbad.Heisenberg;
    const count = new Map<string, number>();
    for (let y = 11; y <= 28; y++) for (const ch of grid.rows[y]) if (ch !== '.') count.set(ch, (count.get(ch) ?? 0) + 1);
    const skin = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
    for (let y = 6; y <= 9; y++) expect(grid.rows[y], `row ${y}`).not.toContain(skin);
  });
});

describe('characterGrid', () => {
  const LEAD = { name: 'team-lead', agentType: 'team-lead', isLead: true };
  const ALPHA = { name: 'probe-alpha', agentType: 'general-purpose', isLead: false };

  it('finds the grid for the character a cast slot names', () => {
    const cast = buildCast([LEAD], 'breakingbad');
    expect(characterGrid(cast, 'team-lead')).toBe(PORTRAITS_V3.breakingbad.Heisenberg);
  });

  it('is null for a spare, an unknown agent, and with no theme', () => {
    const cast = buildCast([LEAD, ALPHA], 'breakingbad');
    expect(cast.slotOf('probe-alpha')).toBeNull();
    expect(characterGrid(cast, 'probe-alpha')).toBeNull();
    expect(characterGrid(cast, 'nobody')).toBeNull();
    expect(characterGrid(buildCast([LEAD], null), 'team-lead')).toBeNull();
  });
});
