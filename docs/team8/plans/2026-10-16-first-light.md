# First Light and v3 Portraits Implementation Plan

> **For agentic workers:** this plan is executed by teammates that `team8:run` dispatches from the shared task list. Read your own task section. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the "first light" empty-team state on the wall while a session has one agent and no transcript yet, and draw every character with the hand-drawn 32×32 v3 portraits instead of the recoloured 12×12 role sprites.

**Architecture:** The 60 SVGs are source; a script compiles them into one committed TypeScript module of pixel grids keyed by theme key and character name. A pure head-turn engine computes four turned frames from a grid. `Portrait` looks a cast slot up in that module and falls back to the role sprite. A new `FirstLight` view renders the seeker, copy from the theme JSON, and a frame clock; `App` mounts it instead of `Wall` and dims the chrome.

**Tech Stack:** React 19, TypeScript, Vite, vitest with jsdom for components, tsx for the generator script. No new dependencies.

**Spec:** `docs/team8/specs/2026-10-16-first-light-design.md` — read it first; the handoff it implements is `docs/design/design_handoff_first_light/README.md`.

## Global Constraints

- A v3 portrait is drawn only at an integer multiple of 32px (32 in slots, 128 in first light), with `shape-rendering="crispEdges"` on the SVG and `image-rendering: pixelated` on its host. Never scale a v3 grid by a non-integer factor.
- No recolour, lift or tint of a v3 portrait at render time. Colours come out of the SVG exactly.
- Every colour in the UI is a CSS custom property (`var(--color-…)`, `var(--term)`), never a literal hex, so the six system themes and the film palettes keep working.
- First light copy is data: it lives in `src/shared/movie-themes.json` under `firstLight` with `{lead}` as a literal placeholder, copied verbatim from the table in Task 3, curly apostrophes included.
- First light shows when `state.agents.length === 1 && state.agents[0].transcript.length === 0`, on the wall view only. Hand-over to the wall or the stream is an unmount, no transition.
- Animation is whole frames swapped on a timer. No CSS transforms, transitions or tweening. Frame `F` only, and no "?", when the console's `motion` setting is off or `prefers-reduced-motion: reduce` matches.
- Tests: `npm test` (vitest) and `npm run typecheck` must be green at the end of every task. Component tests carry `// @vitest-environment jsdom` on line 1 and `afterEach(cleanup)`.
- Commit after each task with a message in the repo's voice (imperative, what and why), no AI attribution lines.
- `plugin/dist` is never committed by hand: run `npm run build` only to verify it succeeds, then `git checkout -- plugin/dist`.

---

## File Structure

| Path | Responsibility | Track |
|---|---|---|
| `src/shared/pixel-grid.ts` (new) | `PixelGrid` type, index digits, `gridSvgV3` renderer | A |
| `src/shared/pixel-grid.test.ts` (new) | its tests | A |
| `scripts/build-portraits.ts` (new) | SVG → grid compiler, writes the module below | A |
| `src/web/images/characters-v3/**` (new) | the 60 SVGs as shipped, plus `index.json` | A |
| `src/shared/portraits-v3.ts` (generated) | `PORTRAITS_V3`, theme key → name → grid | A |
| `src/shared/character-portrait.ts` (new) | `characterGrid(cast, name)` | A |
| `src/shared/portraits-v3.test.ts` (new) | generator drift, coverage, shape | A |
| `package.json` | `build:portraits` script | A |
| `src/shared/movie-themes.json` | `firstLight` per theme; later drops `looks`/`feats` | B |
| `src/shared/cast.ts` | `FirstLightCopy`, `firstLightCopy`, type changes | B |
| `src/shared/cast.test.ts` | its tests | B |
| `src/shared/portrait.ts` | loses look/feat/lift code | B |
| `src/shared/portrait.test.ts` | loses their tests | B |
| `src/shared/head-turn.ts` (new) | `SEQ`, `turnFrame`, `framesOf` | C |
| `src/shared/head-turn.test.ts` (new) | its tests | C |
| `src/web/components/Portrait.tsx` | v3 lookup, 32px default, sprite fallback | D |
| `src/web/components/Portrait.test.tsx` | its tests | D |
| `src/web/views/Comms.tsx` | 32px faces and pair | D |
| `src/web/views/Comms.test.tsx` | size assertions | D |
| `src/web/views/FirstLight.tsx` (new) | the view and `useFrameClock` | E |
| `src/web/views/FirstLight.test.tsx` (new) | its tests | E |
| `src/web/chrome/Bar.tsx` | `dimmed` prop | F |
| `src/web/chrome/StatusBar.tsx` | passes `dimmed` | F |
| `src/web/chrome/StatusBar.test.tsx` | dimmed test | F |
| `src/web/chrome/NeedsYou.tsx` | `dimmed` and `note` props | F |
| `src/web/chrome/NeedsYou.test.tsx` | their tests | F |
| `src/web/App.tsx` | mounts `FirstLight`, dims chrome | F |
| `src/web/App.test.tsx` | the hand-over tests | F |

Tracks and order: A: 1 → 2. B: 3 → 8. C: 4. D: 6. E: 7. F: 5 → 9. Cross-track blocks: 2 ← 1; 4 ← 1; 6 ← 2; 7 ← 2, 3, 4; 8 ← 6; 9 ← 7.

---

### Task 1: Pixel grid type and v3 SVG renderer

**Files:**
- Create: `src/shared/pixel-grid.ts`
- Test: `src/shared/pixel-grid.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `export interface PixelGrid { colors: string[]; rows: string[] }` (32 rows of 32 chars; a char indexes `colors` through `DIGITS`, `.` is transparent); `export const GRID = 32`; `export const DIGITS: string` (`0-9a-zA-Z`, 62 symbols); `export function colorAt(grid: PixelGrid, x: number, y: number): string | null`; `export function gridSvgV3(grid: PixelGrid, size: number): string` (throws unless `size % 32 === 0`; one `<rect>` per horizontal run; `width`/`height` attributes set to `size`; viewBox `0 0 32 32`; `shape-rendering="crispEdges"`; `style="display:block"`).

Why a string-row grid: it is the shape `SPRITES` in `src/shared/portrait.ts` already uses, the generated module stays readable in a diff, and the head turn (Task 4) is string slicing per row.

- [ ] **Step 1: Write the failing tests**

Create `src/shared/pixel-grid.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/shared/pixel-grid.test.ts`
Expected: FAIL — `Cannot find module './pixel-grid'`.

- [ ] **Step 3: Write the module**

Create `src/shared/pixel-grid.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/shared/pixel-grid.test.ts && npm run typecheck`
Expected: 5 tests PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/shared/pixel-grid.ts src/shared/pixel-grid.test.ts
git commit -m "Pixel grid: the 32x32 portrait shape and its crisp SVG renderer"
```

### Task 2: Portrait assets, generator and the cast lookup

**Files:**
- Create: `src/web/images/characters-v3/**` (copied from `docs/design/design_handoff_first_light/brand/characters-v3/`)
- Create: `scripts/build-portraits.ts`
- Create: `src/shared/portraits-v3.ts` (generated by the script)
- Create: `src/shared/character-portrait.ts`
- Test: `src/shared/portraits-v3.test.ts`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: `PixelGrid`, `DIGITS`, `GRID` from `src/shared/pixel-grid.ts` (Task 1); `Cast` from `src/shared/cast.ts` (exists: `cast.theme.key`, `cast.theme.roles`, `cast.slotOf(name)`).
- Produces: `export const PORTRAITS_V3: Record<string, Record<string, PixelGrid>>` from `src/shared/portraits-v3.ts` (theme key → character name exactly as in `themes[].roles` → grid); `export function characterGrid(cast: Cast, name: string): PixelGrid | null` from `src/shared/character-portrait.ts` (null for a spare, an extra past the slots, or no theme); from `scripts/build-portraits.ts`: `export const FOLDERS: Record<string, string>` (folder → theme key), `export function gridOfSvg(svg: string): PixelGrid`, `export function buildPortraits(srcDir?: string): Record<string, Record<string, PixelGrid>>`, `export function renderModule(portraits): string`; `npm run build:portraits`.

Facts about the SVGs, verified over all 60 files: the only elements are `<svg>` and `<rect>`; every rect has exactly `x y width height fill`, all integers, `height="1"`, fills are `#rrggbb`; viewBox is `0 0 32 32`; a `<metadata>` block of C2PA data makes up most of each file's ~18 KB. The generated module is ~70 KB.

- [ ] **Step 1: Copy the assets**

```bash
mkdir -p src/web/images/characters-v3
cp -R docs/design/design_handoff_first_light/brand/characters-v3/. src/web/images/characters-v3/
find src/web/images/characters-v3 -name '*.svg' | wc -l   # expect 60
```

Vite's root is `src/web`; files under `images/` that nothing imports are not bundled, so these ship nowhere. They are the source the script reads.

- [ ] **Step 2: Write the failing tests**

Create `src/shared/portraits-v3.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/shared/portraits-v3.test.ts`
Expected: FAIL — `Cannot find module '../../scripts/build-portraits'`.

- [ ] **Step 4: Write the generator**

Create `scripts/build-portraits.ts`:

```ts
/**
 * Compiles src/web/images/characters-v3/<folder>/<Name>.svg into
 * src/shared/portraits-v3.ts, one PixelGrid per character, keyed by theme key
 * and the character's name exactly as themes[].roles spells it. The SVGs are
 * the source; the module is what the app imports, so nothing fetches or parses
 * at runtime and the C2PA metadata (most of every file) never ships.
 *
 * Run: npm run build:portraits
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIGITS, GRID, type PixelGrid } from '../src/shared/pixel-grid';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src/web/images/characters-v3');
const OUT = path.join(ROOT, 'src/shared/portraits-v3.ts');

/** Asset folder → theme key in movie-themes.json. */
export const FOLDERS: Record<string, string> = {
  inception: 'inception',
  'stranger-things': 'stranger',
  'the-lord-of-the-rings': 'lotr',
  'star-wars': 'starwars',
  'back-to-the-future': 'bttf',
  'pulp-fiction': 'pulp',
  'the-godfather': 'godfather',
  'reservoir-dogs': 'dogs',
  'the-matrix': 'matrix',
  'breaking-bad': 'breakingbad',
};

export function gridOfSvg(svg: string): PixelGrid {
  const body = svg.replace(/<metadata>[\s\S]*?<\/metadata>/g, '');
  const cells = Array.from({ length: GRID }, () => Array<string>(GRID).fill('.'));
  const colors: string[] = [];
  for (const m of body.matchAll(/<rect\s+([^>]*?)\/?>/g)) {
    const a = Object.fromEntries([...m[1].matchAll(/(\w+)="([^"]*)"/g)].map(([, k, v]) => [k, v]));
    const x = Number(a.x), y = Number(a.y), w = Number(a.width), h = Number(a.height);
    const fill = a.fill.toLowerCase();
    let i = colors.indexOf(fill);
    if (i < 0) i = colors.push(fill) - 1;
    if (i >= DIGITS.length) throw new Error(`more than ${DIGITS.length} colours in one portrait`);
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) cells[y + dy][x + dx] = DIGITS[i];
  }
  return { colors, rows: cells.map((r) => r.join('')) };
}

export function buildPortraits(srcDir = SRC): Record<string, Record<string, PixelGrid>> {
  const out: Record<string, Record<string, PixelGrid>> = {};
  for (const [folder, key] of Object.entries(FOLDERS)) {
    const dir = path.join(srcDir, folder);
    out[key] = {};
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.svg')).sort()) {
      out[key][file.slice(0, -'.svg'.length)] = gridOfSvg(readFileSync(path.join(dir, file), 'utf8'));
    }
  }
  return out;
}

export function renderModule(portraits: Record<string, Record<string, PixelGrid>>): string {
  return [
    '// GENERATED by scripts/build-portraits.ts from src/web/images/characters-v3 — do not edit.',
    '// Rebuild with `npm run build:portraits`; portraits-v3.test.ts fails when this is stale.',
    "import type { PixelGrid } from './pixel-grid';",
    '',
    '/** Theme key → character name (as themes[].roles spells it) → 32×32 grid. */',
    `export const PORTRAITS_V3: Record<string, Record<string, PixelGrid>> = ${JSON.stringify(portraits, null, 2)};`,
    '',
  ].join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeFileSync(OUT, renderModule(buildPortraits()));
  console.log(`wrote ${path.relative(ROOT, OUT)}`);
}
```

Add the npm script in `package.json`, after `"build:hooks"`:

```json
    "build:portraits": "tsx scripts/build-portraits.ts",
```

Then generate the module:

```bash
npm run build:portraits
head -c 400 src/shared/portraits-v3.ts
```

`tsconfig.json` includes only `src`, but TypeScript follows the test's import into `scripts/`, so `npm run typecheck` covers the script.

- [ ] **Step 5: Write the cast lookup**

Create `src/shared/character-portrait.ts`:

```ts
import type { Cast } from './cast';
import type { PixelGrid } from './pixel-grid';
import { PORTRAITS_V3 } from './portraits-v3';

/**
 * The v3 portrait for the character this agent was cast as. Null keeps the
 * role sprite: a spare has no file, an agent past the theme's slots was never
 * cast, and the off theme has no characters.
 */
export function characterGrid(cast: Cast, name: string): PixelGrid | null {
  const slot = cast.slotOf(name);
  const character = slot ? cast.theme.roles[slot] : undefined;
  return (character && PORTRAITS_V3[cast.theme.key]?.[character]) ?? null;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/shared/portraits-v3.test.ts && npm run typecheck`
Expected: 8 tests PASS, typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add scripts/build-portraits.ts src/web/images/characters-v3 src/shared/portraits-v3.ts src/shared/character-portrait.ts src/shared/portraits-v3.test.ts package.json
git commit -m "v3 portraits: the 60 SVGs, the grid compiler and the cast lookup"
```

### Task 3: First-light copy in the theme data

**Files:**
- Modify: `src/shared/movie-themes.json`
- Modify: `src/shared/cast.ts`
- Test: `src/shared/cast.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `export interface FirstLightCopy { kicker: string; head: string; body: string }`; `MovieTheme.firstLight: FirstLightCopy` (required, on all eleven themes); `export function firstLightCopy(theme: MovieTheme, lead: string): FirstLightCopy` (every `{lead}` replaced). `looks`, `feats` and `FEAT_IDS` are left in place for Task 8.

This task is additive only. `Portrait.tsx` still reads `theme.looks` until Task 6 lands, so nothing is removed from the JSON or the types here.

- [ ] **Step 1: Write the failing tests**

In `src/shared/cast.test.ts`, change the import line to:

```ts
import { FEAT_IDS, MOVIE_THEMES, buildCast, firstLightCopy, themeFor, type CastAgent } from './cast';
```

and append a new describe block at the end of the file:

```ts
describe('first light copy', () => {
  it('is carried by every theme, the off entry included, with {lead} in the headline', () => {
    for (const theme of MOVIE_THEMES) {
      expect(theme.firstLight, theme.key).toBeDefined();
      expect(theme.firstLight.kicker, theme.key).not.toBe('');
      expect(theme.firstLight.head, theme.key).toContain('{lead}');
      expect(theme.firstLight.body, theme.key).not.toBe('');
    }
  });

  it('fills every {lead}, however many a line has', () => {
    const copy = firstLightCopy(themeFor('inception'), 'Cobb');
    expect(copy.kicker).toBe('THE CREW IS STILL ON THE PLANE');
    expect(copy.head).toBe('Cobb is awake. Everyone else is a level down.');
    expect(copy.body).toBe('Arthur, Eames and the rest arrive when Cobb needs them. If they never do, check your totem and carry on.');
    const twice = firstLightCopy(themeFor('godfather'), 'Vito');
    expect(twice.body).toBe('Vito will make them an offer when there’s work. Until then, nobody gets a visit.');
    expect(twice.body).not.toContain('{lead}');
  });

  it('reads "lead" with no theme', () => {
    expect(firstLightCopy(themeFor(null), 'lead').head).toBe('lead is here. Nobody else yet.');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/shared/cast.test.ts`
Expected: FAIL — `firstLightCopy` is not exported; the first test fails on `theme.firstLight` undefined.

- [ ] **Step 3: Add the copy to the JSON**

In `src/shared/movie-themes.json`, add a `firstLight` object to each entry in `themes`, placed after `spare`. Exact values (curly apostrophes as written):

| key | kicker | head | body |
|---|---|---|---|
| `off` | `A TEAM OF ONE, FOR NOW` | `{lead} is here. Nobody else yet.` | `Teammates show up here when the lead spawns them. Until then it’s a quiet room, and a quiet room is fine.` |
| `inception` | `THE CREW IS STILL ON THE PLANE` | `{lead} is awake. Everyone else is a level down.` | `Arthur, Eames and the rest arrive when {lead} needs them. If they never do, check your totem and carry on.` |
| `stranger` | `THE PARTY IS STILL ON THEIR BIKES` | `{lead} is here. The rest are still at the arcade.` | `Nobody has radioed in yet. The party shows up when {lead} calls them, usually right before something goes wrong.` |
| `lotr` | `A FELLOWSHIP OF ONE` | `{lead} is here. The others are still at second breakfast.` | `One does not simply spawn a fellowship. They arrive when {lead} asks, and not a moment before.` |
| `starwars` | `THE REBELLION IS STILL IN HYPERSPACE` | `{lead} is here. Everyone else is still in hyperspace.` | `The rest of the rebellion drops out of lightspeed when {lead} sends the signal. Chewbacca has been told to stop roaring at the log.` |
| `bttf` | `THE GARAGE IS STILL AT 87 MPH` | `{lead} got here first. Everyone else is still accelerating.` | `The rest of the garage arrives when {lead} needs them. Roads, at this stage, are optional.` |
| `pulp` | `THE OUTFIT IS STILL ORDERING` | `{lead} is here. Everyone else is still deciding what to order.` | `The outfit gets called in when there’s a problem worth solving. The Wolf only comes if it’s a real one.` |
| `godfather` | `THE FAMILY HAS NOT BEEN SENT FOR` | `{lead} is here. The family hasn’t been sent for.` | `{lead} will make them an offer when there’s work. Until then, nobody gets a visit.` |
| `dogs` | `THE JOB IS FIVE PEOPLE SHORT` | `{lead} is here. The job is five people short.` | `Everyone else turns up when {lead} hands out the colours. Nobody gets to be Mr. Black.` |
| `matrix` | `THE NEB HAS NOT JACKED IN` | `{lead} is in. Nobody else has taken the pill.` | `The rest of the crew jacks in when {lead} calls the operator. Until then there is no team. There is only the lead.` |
| `breakingbad` | `THE LAB IS STILL AN RV` | `{lead} is here. The lab is still an RV.` | `The rest of the crew gets called in when {lead} says the word. Until then it’s one chemist in a parking lot.` |

The `off` entry becomes:

```json
    {
      "key": "off",
      "film": "No theme",
      "team": "",
      "note": "agents keep their real names",
      "roles": {},
      "spare": [],
      "firstLight": {
        "kicker": "A TEAM OF ONE, FOR NOW",
        "head": "{lead} is here. Nobody else yet.",
        "body": "Teammates show up here when the lead spawns them. Until then it’s a quiet room, and a quiet room is fine."
      }
    },
```

Also add one rule to the top-level `rules` object, after `teamNameIsDecoration`:

```json
    "firstLightIsData": "The empty-team state's kicker, headline and body live here per theme as firstLight, with {lead} as a literal placeholder the console fills with the lead's character name ('lead' with no theme). Copy is data, so a new film needs no code.",
```

Validate: `node -e "JSON.parse(require('fs').readFileSync('src/shared/movie-themes.json','utf8'))"`.

- [ ] **Step 4: Add the type and the helper**

In `src/shared/cast.ts`, after the `FilmPalette` interface and before `MovieTheme`, add:

```ts
/** The empty-team state's three lines, with `{lead}` still literal. */
export interface FirstLightCopy {
  kicker: string;
  head: string;
  body: string;
}
```

In `MovieTheme`, after the `spare: string[];` line, add:

```ts
  firstLight: FirstLightCopy;
```

After `themeFor`, add:

```ts
/** The theme's first-light copy with every `{lead}` filled. `lead` is the cast's lead name, or 'lead' with no theme. */
export function firstLightCopy(theme: MovieTheme, lead: string): FirstLightCopy {
  const fill = (s: string) => s.split('{lead}').join(lead);
  return { kicker: fill(theme.firstLight.kicker), head: fill(theme.firstLight.head), body: fill(theme.firstLight.body) };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/shared/cast.test.ts && npm run typecheck`
Expected: all cast tests PASS (the three new ones included), typecheck clean. If typecheck reports a test fixture elsewhere building a `MovieTheme` literal without `firstLight`, add the `off` copy object to that fixture.

- [ ] **Step 6: Commit**

```bash
git add src/shared/movie-themes.json src/shared/cast.ts src/shared/cast.test.ts
git commit -m "Themes: first-light copy per film, with {lead} filled by the cast"
```

### Task 4: Head-turn engine

**Files:**
- Create: `src/shared/head-turn.ts`
- Test: `src/shared/head-turn.test.ts`

**Interfaces:**
- Consumes: `PixelGrid` from `src/shared/pixel-grid.ts` (Task 1).
- Produces: `export type FrameId = 'F' | 'L1' | 'L2' | 'R1' | 'R2'`; `export const SEQ: readonly (readonly [FrameId, number])[]` (12 entries, 5350 ms); `export function turnFrame(grid: PixelGrid, g: number, dir: -1 | 1): PixelGrid`; `export function framesOf(grid: PixelGrid): Record<FrameId, PixelGrid>` (cached per grid object).

The algorithm, from the handoff, per row `y` of the 32×32 grid. The row's own outline never moves; only what is inside the face slides.
1. `[rL, rR]` = first and last non-`.` in the row. An empty row copies through.
2. `[cL, cR]` = the same for row 18, the face's own width. `L = max(rL, cL)`, `R = min(rR, cR)`. If `R <= L` the row copies through (side buns, brims, ears outside the face stay put).
3. Exponent by row: rows 0–10 (hair, hats) `g' = 1 + (g − 1) × 0.45`; rows 11–28 (face) `g' = g`; rows 29–31 (neck, collar) copy through.
4. For `x` in `[L, R]`: `u = (x − L) / (R − L)`; looking left `su = u^(1/g')`, looking right `su = 1 − (1 − u)^(1/g')`; output pixel = source pixel `round(L + su × (R − L))`. Pixels outside `[L, R]` copy through.

- [ ] **Step 1: Write the failing tests**

Create `src/shared/head-turn.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/shared/head-turn.test.ts`
Expected: FAIL — `Cannot find module './head-turn'`.

- [ ] **Step 3: Write the engine**

Create `src/shared/head-turn.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/shared/head-turn.test.ts && npm run typecheck`
Expected: 9 tests PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/shared/head-turn.ts src/shared/head-turn.test.ts
git commit -m "Head turn: the seeker's five frames, computed per row from the portrait"
```

### Task 5: Dimmed chrome and the footer note

**Files:**
- Modify: `src/web/chrome/Bar.tsx`
- Modify: `src/web/chrome/StatusBar.tsx`
- Test: `src/web/chrome/StatusBar.test.tsx`
- Modify: `src/web/chrome/NeedsYou.tsx`
- Test: `src/web/chrome/NeedsYou.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `BarProps.dimmed?: boolean` and `StatusBarProps.dimmed?: boolean` (root `data-testid="bar"` gets `style.opacity = 0.35` when true, nothing otherwise); `NeedsYouProps.dimmed?: boolean` (same on its root) and `NeedsYouProps.note?: string` (rendered right-aligned as `data-testid="needs-you-note"`).

Both pieces of chrome stay fully interactive while dimmed: it is opacity only, no `pointer-events`.

- [ ] **Step 1: Write the failing tests**

Append to `src/web/chrome/StatusBar.test.tsx` (the file already has `renderBar`, `APPEARANCE`, `sampleTeamState`, `FIXTURE_NOW`, `vi`):

```ts
it('dims to .35 when asked, and not otherwise — first light lowers the chrome, it never hides it', () => {
  renderBar();
  expect(screen.getByTestId('bar').style.opacity).toBe('');
  cleanup();
  render(
    <StatusBar
      state={sampleTeamState()}
      view="wall"
      onViewChange={vi.fn()}
      now={FIXTURE_NOW}
      teamsOpen={false}
      onTeamsOpenChange={vi.fn()}
      onSelectRun={vi.fn()}
      appearance={APPEARANCE}
      dimmed
    />,
  );
  expect(screen.getByTestId('bar').style.opacity).toBe('0.35');
  expect(screen.getByRole('tablist')).toBeTruthy();
});
```

Append to `src/web/chrome/NeedsYou.test.tsx`:

```ts
it('dims to .35 when asked, and carries a right-hand note when given one', () => {
  render(<NeedsYou items={[]} readOnly={false} now={FIXTURE_NOW} dimmed note="messages go to Heisenberg until a teammate joins" />);
  expect(screen.getByTestId('needs-you').style.opacity).toBe('0.35');
  expect(screen.getByText('nothing waiting')).toBeTruthy();
  const note = screen.getByTestId('needs-you-note');
  expect(note.textContent).toBe('messages go to Heisenberg until a teammate joins');
  expect(note.style.marginLeft).toBe('auto');
});

it('draws no note and no dimming by default', () => {
  render(<NeedsYou items={[]} readOnly={false} now={FIXTURE_NOW} />);
  expect(screen.getByTestId('needs-you').style.opacity).toBe('');
  expect(screen.queryByTestId('needs-you-note')).toBeNull();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/web/chrome/StatusBar.test.tsx src/web/chrome/NeedsYou.test.tsx`
Expected: the three new tests FAIL (`opacity` is `''`; `needs-you` test id not found).

- [ ] **Step 3: Thread `dimmed` through Bar and StatusBar**

In `src/web/chrome/Bar.tsx`, add to `BarProps<T>` after `build?: BuildInfo;`:

```ts
  /** First light lowers the chrome to .35 so the empty state reads as the subject; it stays clickable. */
  dimmed?: boolean;
```

Add `dimmed` to the destructured props of `Bar`, and on the root `<div ref={bar} data-testid="bar" style={{ … }}>` add, after `fontSize: 12.5,`:

```ts
        opacity: dimmed ? 0.35 : undefined,
```

In `src/web/chrome/StatusBar.tsx`, add to `StatusBarProps` after `hasSubagents?: boolean;` (or at the end of the interface):

```ts
  /** See BarProps.dimmed. */
  dimmed?: boolean;
```

Add `dimmed` to `StatusBar`'s destructured props and pass `dimmed={dimmed}` to `<Bar …>` next to `build={state.build}`.

- [ ] **Step 4: Add `dimmed` and `note` to NeedsYou**

In `src/web/chrome/NeedsYou.tsx`, extend the props:

```ts
export interface NeedsYouProps {
  items: NeedsYouItem[];
  readOnly: boolean;
  now: number;
  /** First light lowers the strip to .35; it stays interactive. */
  dimmed?: boolean;
  /** A right-hand line, e.g. "messages go to Cobb until a teammate joins". */
  note?: string;
}
```

Change the signature to `export function NeedsYou({ items, readOnly, now, dimmed, note }: NeedsYouProps)`. On the root `<div style={{ borderTop: …, background: …, padding: '9px 14px', display: 'flex', alignItems: 'stretch', gap: 10 }}>` add `data-testid="needs-you"` and `opacity: dimmed ? 0.35 : undefined` in the style. After the `<div style={{ flex: 1, display: 'flex', gap: 8, minWidth: 0, alignItems: 'center' }}>…</div>` block (the items or "nothing waiting"), add:

```tsx
      {note && (
        <span
          data-testid="needs-you-note"
          style={{ marginLeft: 'auto', alignSelf: 'center', whiteSpace: 'nowrap', color: 'var(--color-neutral-600)', fontSize: 11 }}
        >
          {note}
        </span>
      )}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/web/chrome && npm run typecheck`
Expected: all chrome tests PASS, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/web/chrome/Bar.tsx src/web/chrome/StatusBar.tsx src/web/chrome/StatusBar.test.tsx src/web/chrome/NeedsYou.tsx src/web/chrome/NeedsYou.test.tsx
git commit -m "Chrome: a dimmed state for the bar and the strip, and a note slot on the strip"
```

### Task 6: Portrait draws v3 at 32px

**Files:**
- Modify: `src/web/components/Portrait.tsx`
- Test: `src/web/components/Portrait.test.tsx`
- Modify: `src/web/views/Comms.tsx`
- Test: `src/web/views/Comms.test.tsx`

**Interfaces:**
- Consumes: `characterGrid(cast, name)` from `src/shared/character-portrait.ts` and `gridSvgV3(grid, size)` from `src/shared/pixel-grid.ts` (Tasks 1–2); `portraitSvg(portrait, skinIndex)` and `portraitFor` from `src/shared/portrait.ts` (exist; the third `film` argument is no longer passed).
- Produces: `Portrait` with `size` defaulting to 32, `data-portrait="v3"` when a grid is drawn, the role id otherwise. No other module imports `parseLook`, `FilmPaint`, `activePalette` or `THEMES` for portraits after this task.

Call sites: `Wall.tsx`, `Grid.tsx`, `Overview.tsx` and `Rail.tsx` pass no `size`, so the new default moves them to 32px with no edit. `Comms.tsx` hard-codes 20 and 22 and is the only call site this task edits. The role sprite (12×12) is still a viewBox-scaled SVG, so drawing it at 32px is fine; only v3 grids need the integer rule.

- [ ] **Step 1: Rewrite the failing tests**

In `src/web/components/Portrait.test.tsx`:

Change the first test's expectations from `'24px'` to `'32px'` and its title to `'hosts the inline SVG in a 32x32 relative box'`.

Delete the four film-look tests at the end of the file: `'wears the film look when the cast gave the agent a role slot'`, `'keeps the default portrait for an agent that took a spare'`, `'tints portraits even with the film palette switched off'`, `'still honours the avatars toggle while a film is casting'`. Keep the `filmed` and `svgOf` helpers, and add in their place:

```ts
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
```

Add `vi` to the vitest import at the top of the file.

In `src/web/views/Comms.test.tsx`, change the three size assertions: line ~149 `toBe('20px')` → `toBe('32px')` and the following `left` assertion `toBe('14px')` → `toBe('22px')`; line ~239 `toBe('22px')` → `toBe('32px')`; line ~486 `toBe('22px')` → `toBe('32px')`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/web/components/Portrait.test.tsx src/web/views/Comms.test.tsx`
Expected: FAIL on the 32px sizes and on `data-portrait="v3"`.

- [ ] **Step 3: Rewrite Portrait**

Replace the imports and the `Portrait` function in `src/web/components/Portrait.tsx` (leave `TerminalSprite` and everything below it untouched):

```tsx
import { characterGrid } from '../../shared/character-portrait';
import { gridSvgV3 } from '../../shared/pixel-grid';
import { portraitFor, portraitSvg, TERMINAL_SPRITE, TERMINAL_SPRITE_SVG } from '../../shared/portrait';
import { useCast } from '../state/useCast';
import { useAppearance } from '../state/useSettings';

export type PortraitSlot = 'wall' | 'rail-row' | 'default';

const SLOT_MARGIN: Record<PortraitSlot, number> = { wall: 3, 'rail-row': 1, default: 0 };

export interface PortraitProps {
  agent: { name: string; agentType: string; isLead: boolean };
  slot?: PortraitSlot;
  /**
   * Rendered edge, in px. A v3 portrait is a 32×32 grid and is only ever drawn
   * at a multiple of 32, so every pixel is a whole number of screen pixels —
   * `gridSvgV3` throws otherwise. The 12×12 role sprite is one SVG viewBox and
   * scales to any size.
   */
  size?: number;
}

export function Portrait({ agent, slot = 'default', size = 32 }: PortraitProps) {
  const appearance = useAppearance();
  const cast = useCast();
  const { portrait, skinIndex } = portraitFor(agent);
  // Nothing at all, not a blank box: the rows close up around the missing face.
  if (!appearance.avatars) return null;

  // The character follows the slot the CAST assigned, not the portrait the
  // sprite hashed: an agent that took a spare is one whose role could not be
  // read, and it keeps the role sprite rather than wearing someone's face.
  // The film palette switch reaches the ground, never the cast, so it plays
  // no part here.
  const grid = characterGrid(cast, agent.name);

  return (
    <div
      data-testid="portrait"
      data-portrait={grid ? 'v3' : portrait}
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        position: 'relative',
        flex: 'none',
        marginTop: SLOT_MARGIN[slot],
        imageRendering: 'pixelated',
      }}
      dangerouslySetInnerHTML={{ __html: grid ? gridSvgV3(grid, size) : portraitSvg(portrait, skinIndex) }}
    />
  );
}
```

`themeFor`, `parseLook`, `FilmPaint`, `activePalette` and `THEMES` are no longer imported by this file.

- [ ] **Step 4: Move Comms to 32px**

In `src/web/views/Comms.tsx`, change the two constants (the pair keeps its ~70% overlap):

```ts
const PORTRAIT_PX = 32;
const OVERLAP_PX = 22;
```

and

```ts
const FACE_PX = 32;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/web && npm run typecheck`
Expected: all web tests PASS (Wall, Grid, Overview, Rail, ConfigMenu render portraits through the default and need no change), typecheck clean. If a Rail or Overview row test pins a row height that grew, update the number and say so in the commit.

- [ ] **Step 6: Commit**

```bash
git add src/web/components/Portrait.tsx src/web/components/Portrait.test.tsx src/web/views/Comms.tsx src/web/views/Comms.test.tsx
git commit -m "Portrait: the character's v3 file at 32px, the role sprite when there is none"
```

### Task 7: First light view and frame clock

**Files:**
- Create: `src/web/views/FirstLight.tsx`
- Test: `src/web/views/FirstLight.test.tsx`

**Interfaces:**
- Consumes: `firstLightCopy` (Task 3); `framesOf`, `SEQ`, `FrameId` (Task 4); `characterGrid` (Task 2); `gridSvgV3` (Task 1); `prefersReducedMotion` from `src/web/chrome/Splash.tsx`; `useCast`, `useAppearance` (exist).
- Produces: `export function FirstLight({ lead }: { lead: Agent })` rendering `data-testid="first-light"`, a seeker host `data-testid="seeker"` with `data-frame={FrameId}`, `data-testid="seeker-question"` only on `L2`/`R2`, and `first-light-kicker` / `first-light-head` / `first-light-body`; `export function useFrameClock(enabled: boolean): FrameId`; `export function leadNameOf(cast: Cast, lead: Agent): string` (the character's name with a theme, `'lead'` without).

Layout and type, from the handoff (every value final): content `display:flex; align-items:center; gap:48px; padding:0 72px`; avatar box 220×220 `flex:none`, inner 200×200 relative; portrait 128px; text column `gap:10px`: kicker 10.5px, `letter-spacing:.16em`, uppercase, accent-400; headline `--font-heading` 500 / 42px / line-height 1.2 / `max-width:24ch` / `text-wrap:balance`; body 12px / line-height 1.7 / `max-width:62ch` / `text-wrap:pretty` / neutral-500. The "?" is 20px / 700 / accent-400 at `top:14px`, `left:50%`, `margin-left: ±60px − 6px`, shown only on `L2` (left) and `R2` (right). The console body is already JetBrains Mono, so the kicker, body and "?" inherit it. The `avatars` setting is about roster portraits and does not apply here.

- [ ] **Step 1: Write the failing tests**

Create `src/web/views/FirstLight.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/web/views/FirstLight.test.tsx`
Expected: FAIL — `Cannot find module './FirstLight'`.

- [ ] **Step 3: Write the view**

Create `src/web/views/FirstLight.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { firstLightCopy, type Cast } from '../../shared/cast';
import { characterGrid } from '../../shared/character-portrait';
import type { Agent } from '../../shared/domain';
import { framesOf, SEQ, type FrameId } from '../../shared/head-turn';
import { gridSvgV3 } from '../../shared/pixel-grid';
import { prefersReducedMotion } from '../chrome/Splash';
import { useCast } from '../state/useCast';
import { useAppearance } from '../state/useSettings';

/**
 * First light (handoff `2a`): what the wall shows while the session is one
 * agent with nothing said yet. The lead's portrait looks left and right for
 * the rest of the team, over a themed kicker, headline and body. App swaps it
 * for the wall at the first teammate or the first transcript line — a cut, no
 * transition.
 */

/** The team8 mark at 112px: the no-theme seeker. Accent-500 body, accent-300 top-right pixel, as the handoff draws it. */
const MARK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="112" height="112" viewBox="0 0 12 12" shape-rendering="crispEdges" style="display:block">' +
  '<path d="M3 1h2v2h-2zM1 3h2v2h-2zM8 3h2v2h-2zM3 5h2v2h-2zM6 5h2v2h-2zM1 7h2v2h-2zM8 7h2v2h-2zM3 9h2v2h-2zM6 9h2v2h-2z" fill="var(--color-accent-500)"/>' +
  '<path d="M6 1h2v2h-2z" fill="var(--color-accent-300)"/></svg>';

const PORTRAIT_PX = 128;

/** `{lead}` in the copy: the character's name under a theme, the word "lead" without one. */
export function leadNameOf(cast: Cast, lead: Agent): string {
  return cast.theme.key === 'off' ? 'lead' : cast.asChar(lead.name).display;
}

/**
 * Steps through SEQ on a setTimeout chain: whole frames, no tweening. Paused
 * while the tab is hidden, cleared on unmount, and pinned to F (no timer at
 * all) when disabled — the console's motion setting or the OS preference.
 */
export function useFrameClock(enabled: boolean): FrameId {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!enabled) {
      setIndex(0);
      return;
    }
    let i = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      timer = setTimeout(() => {
        i = (i + 1) % SEQ.length;
        setIndex(i);
        tick();
      }, SEQ[i][1]);
    };
    const onVisibility = () => {
      clearTimeout(timer);
      if (!document.hidden) tick();
    };
    document.addEventListener('visibilitychange', onVisibility);
    if (!document.hidden) tick();
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled]);
  return enabled ? SEQ[index][0] : 'F';
}

export function FirstLight({ lead }: { lead: Agent }) {
  const cast = useCast();
  const settings = useAppearance();
  const copy = firstLightCopy(cast.theme, leadNameOf(cast, lead));
  const grid = characterGrid(cast, lead.name);
  // The mark does not turn, but the "?" keeps the schedule either way.
  const frame = useFrameClock(settings.motion && !prefersReducedMotion());
  const art = grid ? gridSvgV3(framesOf(grid)[frame], PORTRAIT_PX) : MARK_SVG;
  const question = frame === 'L2' ? -60 : frame === 'R2' ? 60 : null;

  return (
    <div
      data-testid="first-light"
      style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', gap: 48, padding: '0 72px' }}
    >
      <div style={{ width: 220, height: 220, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div
          data-testid="seeker"
          data-frame={frame}
          style={{ position: 'relative', width: 200, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {question !== null && (
            <span
              data-testid="seeker-question"
              style={{
                position: 'absolute',
                top: 14,
                left: '50%',
                // Minus 6 centres the glyph on the ±60 offset.
                marginLeft: question - 6,
                fontSize: 20,
                fontWeight: 700,
                color: 'var(--color-accent-400)',
              }}
            >
              ?
            </span>
          )}
          <div aria-hidden="true" style={{ imageRendering: 'pixelated' }} dangerouslySetInnerHTML={{ __html: art }} />
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span
          data-testid="first-light-kicker"
          style={{ color: 'var(--color-accent-400)', fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase' }}
        >
          {copy.kicker}
        </span>
        <h1
          data-testid="first-light-head"
          style={{
            fontFamily: 'var(--font-heading)',
            fontWeight: 500,
            fontSize: 42,
            lineHeight: 1.2,
            maxWidth: '24ch',
            textWrap: 'balance',
            margin: 0,
            color: 'var(--color-text)',
          }}
        >
          {copy.head}
        </h1>
        <p
          data-testid="first-light-body"
          style={{ color: 'var(--color-neutral-500)', fontSize: 12, lineHeight: 1.7, maxWidth: '62ch', textWrap: 'pretty', margin: 0 }}
        >
          {copy.body}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/web/views/FirstLight.test.tsx && npm run typecheck`
Expected: 10 tests PASS, typecheck clean. (jsdom's CSSOM round-trips `gap`, `opacity`, `letterSpacing`, `imageRendering`, `textWrap` and `padding` as written, `padding` as `0px 72px`; verified against the installed `cssstyle`.)

- [ ] **Step 5: Commit**

```bash
git add src/web/views/FirstLight.tsx src/web/views/FirstLight.test.tsx
git commit -m "First light: the seeker, the themed copy and the frame clock"
```

### Task 8: Retire looks, feats and the lift

**Files:**
- Modify: `src/shared/movie-themes.json`
- Modify: `src/shared/cast.ts`
- Test: `src/shared/cast.test.ts`
- Modify: `src/shared/portrait.ts`
- Test: `src/shared/portrait.test.ts`

**Interfaces:**
- Consumes: Task 6 must be merged first (it is the last importer of the code removed here).
- Produces: `portraitSvg(portrait: PortraitId, skinIndex: number): string` with two parameters; `MovieTheme` without `looks`/`feats`; no `FEAT_IDS`, `FeatId`, `Look`, `parseLook`, `FEAT_SPRITES`, `applyFeats`, `LIFT_TARGETS`, `FilmPaint`, `lift` anywhere.

Before starting, confirm nothing outside this task's files still imports the code being removed:

```bash
grep -rn "parseLook\|applyFeats\|FEAT_IDS\|FeatId\|LIFT_TARGETS\|FilmPaint\|\blift(" src | grep -v "src/shared/portrait\.\(ts\|test\.ts\)\|src/shared/cast\.\(ts\|test\.ts\)"
```

Expected: no output. If `src/web/components/Portrait.tsx` appears, Task 6 has not landed; stop and wait.

- [ ] **Step 1: Delete the tests of the retired code**

In `src/shared/portrait.test.ts`: remove `applyFeats`, `FEAT_SPRITES`, `LIFT_TARGETS`, `lift`, `parseLook` and `themeFor` from the imports (keep `PORTRAIT_IDS, portraitFor, portraitSvg, SKIN_PAIRS, SPRITE_COLORS, SPRITES, TERMINAL_SPRITE, TERMINAL_SPRITE_SVG`), and delete these `describe` blocks whole: `'parseLook'`, `'applyFeats'`, `'the silhouette lift'`, `'portraitSvg painted from a film'`, `'every film repro garment reaches the portrait'`. Delete the luminance helper at the top of the file if nothing left uses it.

In `src/shared/cast.test.ts`: remove `FEAT_IDS` from the import; delete the tests `'carries a look per role slot as five pipe-joined hex, without the hash'`, `'carries accessories per role slot, in the order they are drawn'` and `'draws every accessory from the published vocabulary'`; in `'gives every film all three keys, and every palette colour as a hex'` delete the two lines asserting `film.looks` and `film.feats` and retitle it `'gives every film a palette, every colour a hex'`; retitle `'leaves the off entry without a palette, looks or accessories'` to `'leaves the off entry without a palette'` and delete its `looks` and `feats` assertions. Add one test to `'the theme database'`:

```ts
  it('carries no looks or accessories: portraits are files now', () => {
    for (const theme of MOVIE_THEMES) {
      expect('looks' in theme, theme.key).toBe(false);
      expect('feats' in theme, theme.key).toBe(false);
    }
  });
```

- [ ] **Step 2: Run the tests to verify the new one fails**

Run: `npx vitest run src/shared/cast.test.ts src/shared/portrait.test.ts`
Expected: the new test FAILS (every film still carries `looks`); the rest PASS.

- [ ] **Step 3: Strip the JSON**

In `src/shared/movie-themes.json`:
- Delete the `looks` and `feats` objects from every theme.
- Delete the rules `looksAreNotLikenesses`, `lookFollowsRoleSlot`, `silhouetteMustRead`, `accessoriesCarryTheCharacter`.
- Add a rule after `castingIsByRoleSlot`:

```json
    "portraitsAreFiles": "Each character in themes[].roles has a hand-drawn 32x32 portrait at src/web/images/characters-v3/<film>/<Name>.svg, compiled into src/shared/portraits-v3.ts by npm run build:portraits and keyed by this theme's key and the role's exact name. It is drawn only at integer multiples of 32px and never recoloured. A spare, an agent past the slots, and the off theme keep the role sprite.",
```

- Replace `about[0]` with: `"Movie themes for the agent-teams console. A theme renames agents, gives each character a hand-drawn 32x32 portrait, and — with film palette on — sets the console's ground and accent."`
- Leave `legal` as it is.

Validate: `node -e "JSON.parse(require('fs').readFileSync('src/shared/movie-themes.json','utf8'))"`.

- [ ] **Step 4: Strip the types**

In `src/shared/cast.ts`: delete the `FEAT_IDS` constant, the `FeatId` type and the comment above them; delete the `looks?` and `feats?` members (and their doc comments) from `MovieTheme`.

- [ ] **Step 5: Strip portrait.ts**

In `src/shared/portrait.ts`:
- Delete the line `import type { FeatId } from './cast';`.
- Make `portraitSvg` two-parameter:

```ts
const svgCache = new Map<string, string>();

export function portraitSvg(portrait: PortraitId, skinIndex: number): string {
  const key = `${portrait}:${skinIndex}`;
  const cached = svgCache.get(key);
  if (cached !== undefined) return cached;
  const skin = SKIN_PAIRS[PORTRAIT_IDS[skinIndex % PORTRAIT_IDS.length]];
  const svg = gridSvg(SPRITES[portrait], 12, PAINT_ORDER, (ch) =>
    ch === 's' ? skin[0] : ch === 'S' ? skin[1] : SPRITE_COLORS[ch],
  );
  svgCache.set(key, svg);
  return svg;
}
```

- Delete everything from the `Look` interface to the end of the file: `Look`, `BARE_HEX`, `parseLook`, `FEAT_SPRITES`, `applyFeats`, `LIFT_TARGETS`, `LOOK_GLYPHS`, `LIFT_ROLES`, `FilmPaint`, `srgb`, `luminanceOf`, `contrastOf`, `toHsl`, `toHex`, `lift`, with their comments. `TERMINAL_SPRITE_SVG`, which sits between `portraitSvg` and `Look`, stays.

- [ ] **Step 6: Run everything**

Run: `npm test && npm run typecheck`
Expected: all green. `grep -rn "looks\|feats" src/shared/movie-themes.json` prints nothing.

- [ ] **Step 7: Commit**

```bash
git add src/shared/movie-themes.json src/shared/cast.ts src/shared/cast.test.ts src/shared/portrait.ts src/shared/portrait.test.ts
git commit -m "Retire looks, accessories and the silhouette lift: portraits are files now"
```

### Task 9: App mounts first light and dims the chrome

**Files:**
- Modify: `src/web/App.tsx`
- Test: `src/web/App.test.tsx`

**Interfaces:**
- Consumes: `FirstLight`, `leadNameOf` (Task 7); `dimmed` on `StatusBar` and `dimmed`/`note` on `NeedsYou` (Task 5).
- Produces: the running behaviour: `first-light` on a roster of one with an empty transcript, `wall` otherwise; bar and strip at opacity .35 only then.

The composer is not mounted in first light because the wall is not; nothing in `Composer.tsx` changes. Once the lead's first line arrives the stream mounts with its existing "solo session" line, by decision in the spec.

- [ ] **Step 1: Write the failing tests**

Append to `src/web/App.test.tsx` (the file already imports `act`, `render`, `screen`, `MockEventSource`, `sampleTeamState`):

```tsx
function soloState(transcriptLines = 0) {
  const base = sampleTeamState();
  const lead = base.agents.find((a) => a.isLead)!;
  const transcript = Array.from({ length: transcriptLines }, (_, i) => ({
    id: `line-${i}`,
    marker: '⏺' as const,
    text: `line ${i}`,
    ts: base.startedAt + i,
  }));
  return { ...base, agents: [{ ...lead, transcript }], tasks: [], mail: [] };
}

it('opens on first light while the session is one agent with nothing said, and cuts to the stream at the first line', () => {
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', soloState(0)));
  expect(screen.getByTestId('first-light')).toBeTruthy();
  expect(screen.queryByTestId('wall')).toBeNull();
  expect(screen.queryByTestId('composer-solo')).toBeNull();
  expect(screen.getByTestId('bar').style.opacity).toBe('0.35');
  expect(screen.getByTestId('needs-you').style.opacity).toBe('0.35');
  expect(screen.getByTestId('needs-you-note').textContent).toBe('messages go to lead until a teammate joins');

  act(() => MockEventSource.last().emit('state', soloState(1)));
  expect(screen.queryByTestId('first-light')).toBeNull();
  expect(screen.getByTestId('wall')).toBeTruthy();
  expect(screen.getByTestId('bar').style.opacity).toBe('');
  expect(screen.getByTestId('needs-you').style.opacity).toBe('');
  expect(screen.queryByTestId('needs-you-note')).toBeNull();
});

it('cuts from first light to the wall when the first teammate joins', () => {
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', soloState(0)));
  expect(screen.getByTestId('first-light')).toBeTruthy();
  act(() => MockEventSource.last().emit('state', sampleTeamState()));
  expect(screen.queryByTestId('first-light')).toBeNull();
  expect(screen.getByTestId('wall')).toBeTruthy();
});

it('shows first light only on the wall view; the overview is itself, undimmed', () => {
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', soloState(0)));
  fireEvent.click(screen.getByRole('tab', { name: 'overview' }));
  expect(screen.queryByTestId('first-light')).toBeNull();
  expect(screen.getByTestId('bar').style.opacity).toBe('');
});

it('names the lead by character in the strip note under a film', () => {
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ movieTheme: 'breakingbad' }));
  render(<App />);
  act(() => MockEventSource.last().emit('snapshot', soloState(0)));
  expect(screen.getByTestId('needs-you-note').textContent).toBe('messages go to Heisenberg until a teammate joins');
  expect(screen.getByTestId('first-light-head').textContent).toBe('Heisenberg is here. The lab is still an RV.');
});
```

If the overview tab's accessible name differs (the solo switcher labels `wall` as `stream`), use `screen.getAllByRole('tab')[1]`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/web/App.test.tsx`
Expected: the four new tests FAIL (`first-light` not found).

- [ ] **Step 3: Wire App**

In `src/web/App.tsx`:

Add the import next to the other views:

```ts
import { FirstLight, leadNameOf } from './views/FirstLight';
```

After the line `const solo = state === null ? store.sessionRoute !== null : state.agents.length <= 1;`, add:

```ts
  // First light (handoff 2a): one agent and nothing said yet. The first
  // transcript line hands over to the solo stream, the first teammate to the
  // wall — both a cut. Wall view only: the other views are themselves.
  const firstLight =
    state !== null && state.agents.length === 1 && state.agents[0].transcript.length === 0 && view === 'wall';
  const firstLightNote = firstLight ? `messages go to ${leadNameOf(cast, state.agents[0])} until a teammate joins` : undefined;
```

(`view` and `cast` are both computed above this point; if `view` is declared later, move this block below it.)

On `<StatusBar …>` add `dimmed={firstLight}`.

Replace the wall branch:

```tsx
        {view === 'wall' && firstLight && <FirstLight lead={state.agents[0]} />}
        {view === 'wall' && !firstLight && (
          <Wall
            …unchanged props…
          />
        )}
```

On `<NeedsYou items={state.needsYou} readOnly={state.readOnly} now={now} />` add `dimmed={firstLight} note={firstLightNote}`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/web/App.test.tsx && npm test && npm run typecheck`
Expected: all green.

- [ ] **Step 5: Build check**

```bash
npm run build && git checkout -- plugin/dist
```

Expected: the Vite build succeeds. `plugin/dist` is left as committed.

- [ ] **Step 6: Commit**

```bash
git add src/web/App.tsx src/web/App.test.tsx
git commit -m "App: first light on the wall until the lead speaks or a teammate joins"
```
