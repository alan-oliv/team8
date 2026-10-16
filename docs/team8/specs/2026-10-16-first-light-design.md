# First light and v3 portraits — design

The console gets an empty-team state, "first light", and swaps its 12×12 role sprites for the
60 hand-drawn 32×32 v3 character portraits. Built from the design handoff at
`docs/design/design_handoff_first_light/README.md` (fidelity: high; `2a` is the design).
Brainstormed 2026-10-16.

## Decisions

- **When first light shows.** The wall view, when the roster has one agent AND that agent's
  transcript on the frame is empty (`agents.length === 1 && agents[0].transcript.length === 0`).
  The first transcript line hands over to the solo stream; the first teammate hands over to the
  wall. Both hand-overs are an unmount, no transition. It does not come back once the lead has
  spoken, even if the last teammate leaves. This departs from the handoff's "zero teammates"
  rule because a roster of one already shows the lead's own transcript as a full-width stream
  (`Wall.tsx`, the canvas `8b` ruling), and `/s/<id>` exists to watch exactly that.
- **v3 portraits everywhere, at 32px.** Every portrait slot grows to 32px: wall header, grid,
  overview, rail rows and comms. A v3 portrait is drawn only at an integer multiple of 32 (32
  here, 128 in first light), `shape-rendering: crispEdges`, no recolour. An agent with no role
  slot (beyond the theme's slots, a spare, or no theme) keeps the 12×12 role sprite, drawn at
  32px as well.
- **Looks and feats are retired.** `parseLook`, `applyFeats`, `lift`, `FilmPaint`,
  `LIFT_TARGETS`, `FEAT_SPRITES`, `FEAT_IDS` and the `looks` / `feats` keys in the JSON go. The
  rules `looksAreNotLikenesses`, `silhouetteMustRead`, `accessoriesCarryTheCharacter` and the
  `about` text about tinting go with them. `SPRITES`, `TERMINAL_SPRITE`, `portraitFor` stay.
- **Assets ship as a generated grid module.** The SVGs are source; a committed TypeScript module
  of pixel grids is what the app imports. No runtime fetch, no SVG parsing in the browser. No
  `portrait` folder key in the JSON: the folder table lives in the generator.
- **The solo stream's composer line stays.** "solo session · a message needs a live teammate to
  deliver it" is still what the stream shows once the lead has spoken. First light never mounts
  the composer, so the handoff's removal holds for its own frame.

## Components

### 1. Assets and generator

- `src/web/images/characters-v3/<folder>/<Character Name>.svg` — the 60 files as shipped in the
  handoff (Heisenberg fix included), plus `index.json`. Source of truth; not imported by the app.
- `scripts/build-portraits.mjs` — reads every SVG, parses `<rect x y width height fill>` runs into
  a 32×32 grid, drops everything else (the C2PA `<metadata>` is most of each file), and writes
  `src/shared/portraits-v3.ts`. Folder → theme key table:

  | folder | key | folder | key |
  |---|---|---|---|
  | `inception` | `inception` | `pulp-fiction` | `pulp` |
  | `stranger-things` | `stranger` | `the-godfather` | `godfather` |
  | `the-lord-of-the-rings` | `lotr` | `reservoir-dogs` | `dogs` |
  | `star-wars` | `starwars` | `the-matrix` | `matrix` |
  | `back-to-the-future` | `bttf` | `breaking-bad` | `breakingbad` |

- `src/shared/portraits-v3.ts` (generated, committed, header says so):

  ```ts
  export interface PixelGrid {
    /** Hex fills in first-seen order; a row char is an index into this, `.` is transparent. */
    colors: string[];
    /** 32 strings of 32 chars. Index 0 = '0', 10 = 'a', 36 = 'A'. */
    rows: string[];
  }
  export const PORTRAITS_V3: Record<string, Record<string, PixelGrid>>; // theme key → character name → grid
  ```

- `npm run build:portraits` runs the script. A test regenerates in memory and deep-equals the
  committed module, so a patched SVG without a rebuild fails CI.

### 2. Theme data

`src/shared/movie-themes.json`:
- Every theme, `off` included, gains `firstLight: { kicker, head, body }` with `{lead}` as a
  literal placeholder, copy verbatim from the handoff table (curly apostrophes kept).
- `looks` and `feats` removed from every theme; the three rules named above removed; `about`
  rewritten to say portraits are hand-drawn 32×32 v3 files per character; `legal` unchanged.

`src/shared/cast.ts`: `MovieTheme` gains `firstLight: FirstLightCopy`, loses `looks` and `feats`;
`FEAT_IDS` / `FeatId` deleted. A new pure helper:

```ts
export interface FirstLightCopy { kicker: string; head: string; body: string }
/** The theme's copy with `{lead}` filled; `lead` is the cast's lead name, 'lead' with no theme. */
export function firstLightCopy(theme: MovieTheme, lead: string): FirstLightCopy;
```

### 3. Portrait component

`src/web/components/Portrait.tsx`:
- `size` defaults to 32. Call sites in `Wall.tsx`, `Grid.tsx`, `Overview.tsx`, `Rail.tsx`,
  `Comms.tsx` drop their explicit sizes (`FACE_PX`, `PORTRAIT_PX` go). Row heights grow with it.
- Lookup: `role = cast.slotOf(agent.name)`; `name = theme.roles[role]`;
  `grid = PORTRAITS_V3[theme.key]?.[name]`. With a grid: `data-portrait="v3"` and an inline SVG
  from `gridSvgV3(grid)` (one `<rect>` per horizontal run, viewBox `0 0 32 32`, `crispEdges`),
  `image-rendering: pixelated` on the host. Without: today's `portraitSvg(portrait, skinIndex)`
  with no film paint.
- `avatars` off still renders nothing; `TerminalSprite` unchanged.

`src/shared/portrait.ts` gains `gridSvgV3(grid: PixelGrid, size: number): string` (size must be
a multiple of 32; the function asserts it in dev) and loses the look/feat/lift code.

### 4. Head-turn engine

`src/shared/head-turn.ts`, pure, node-tested:

```ts
export type FrameId = 'F' | 'L1' | 'L2' | 'R1' | 'R2';
/** The loop: 5.35 s. */
export const SEQ: readonly (readonly [FrameId, number])[] = [
  ['F', 900], ['L1', 110], ['L2', 1100], ['L1', 110], ['F', 450], ['R1', 110], ['R2', 1100],
  ['R1', 110], ['F', 800], ['L1', 90], ['L2', 380], ['L1', 90],
];
/** One turned frame. g: 1.45 (three-quarter) or 2.1 (near-profile); dir: -1 left, +1 right. */
export function turnFrame(grid: PixelGrid, g: number, dir: -1 | 1): PixelGrid;
/** All five, computed once per grid and cached in a WeakMap. */
export function framesOf(grid: PixelGrid): Record<FrameId, PixelGrid>;
```

`turnFrame` per row `y`:
1. `[rL, rR]` = first and last non-`.` in the row; empty rows copy through.
2. `[cL, cR]` = the same for row 18. `L = max(rL, cL)`, `R = min(rR, cR)`. If `R <= L` the row
   copies through.
3. `g'`: rows 0–10 → `1 + (g − 1) × 0.45`; rows 11–28 → `g`; rows 29–31 → copy through.
4. For `x` in `[L, R]`: `u = (x − L) / (R − L)`; left: `su = u^(1/g')`; right:
   `su = 1 − (1 − u)^(1/g')`; output = source `round(L + su × (R − L))`. Pixels outside `[L, R]`
   copy through.

### 5. First light view

`src/web/views/FirstLight.tsx`, props `{ lead: Agent }`:
- Content block exactly as the handoff: `display:flex; align-items:center; gap:48px;
  padding:0 72px; flex:1; min-height:0`. Avatar box 220×220, inner 200×200 relative. Text column
  `gap:10px`: kicker 10.5px mono `.16em` uppercase `var(--color-accent-400)`; headline
  `var(--font-heading)` 500 / 42px / 1.2, `max-width:24ch`, `text-wrap:balance`; body 12px mono,
  line-height 1.7, `max-width:62ch`, `text-wrap:pretty`, `var(--color-neutral-500)`.
- Copy from `firstLightCopy(cast.theme, leadName)`, where `leadName` is `cast.asChar(lead.name).display`
  with a theme and `'lead'` without.
- Seeker: with a theme and a v3 grid for the lead's character, `framesOf(grid)[frame]` drawn at
  128px with `gridSvgV3`. Otherwise the team8 mark at 112px, still: the handoff's two paths on a
  `0 0 12 12` viewBox, body `var(--color-accent-500)`, top-right pixel `var(--color-accent-300)`
  (the chrome's `Logo` is the same figure on a 6-cell grid in neutral-500, so it is not reused).
- `useFrameClock(enabled: boolean): FrameId` in the same file: `setTimeout` chain over `SEQ`,
  cleared on unmount, paused while `document.hidden`, resumed on `visibilitychange`. Returns `'F'`
  and runs no timer when `enabled` is false. `enabled = settings.motion &&
  !matchMedia('(prefers-reduced-motion: reduce)').matches`.
- The "?": only while the frame is `L2` or `R2`; 20px mono 700 `var(--color-accent-400)`,
  `position:absolute; top:14px; left:50%; margin-left: ±60px − 6px`, left for `L2`. Hidden when
  the clock is disabled.
- `data-testid="first-light"`, `data-frame={frame}` on the seeker host.

### 6. App wiring

- `App.tsx`: `firstLight = state.agents.length === 1 && state.agents[0].transcript.length === 0`.
  On `view === 'wall'`, render `<FirstLight lead={state.agents[0]} />` when `firstLight`, else
  `<Wall … />` as today.
- `StatusBar` gains `dimmed?: boolean` → `style.opacity = .35`; still interactive.
- `NeedsYou` gains `dimmed?: boolean` (same) and `note?: string`, rendered right-aligned 11px
  `var(--color-neutral-600)` after the items. App passes
  `note={`messages go to ${leadName} until a teammate joins`}` only in first light.
- Nothing else in the chrome changes; the composer is not mounted because the wall is not.

## Testing

- `head-turn.test.ts`: `turnFrame(grid, 1, dir)` equals the grid; outline columns `rL`/`rR` and
  rows 29–31 are unchanged for every `g`; a symmetric fixture's `L2` is the mirror of its `R2`;
  rows 0–10 move strictly less than rows 11–28 on a fixture with a wide face; `SEQ` sums to 5350.
- `portraits-v3.test.ts`: regenerate from the SVGs, deep-equal the module; every
  `themes[].roles` name has a grid; every grid is 32×32 with indices inside `colors`.
- `cast.test.ts`: `firstLightCopy` fills `{lead}` everywhere; `off` yields `lead`.
- `Portrait.test.tsx`: 32px default; `data-portrait="v3"` for a cast lead on `breakingbad`;
  role sprite for a spare, for an agent past the slots, and with no theme; no look attributes
  remain.
- `FirstLight.test.tsx` (jsdom, fake timers): copy per theme; frame advances through `SEQ`;
  `?` only on `L2`/`R2`; `motion: false` holds `F` with no `?`; the mark with no theme;
  timer cleared on unmount.
- `App.test.tsx`: first light on a roster of one with an empty transcript; `Wall` once a line
  arrives; `Wall` with two agents; `StatusBar` and `NeedsYou` dimmed only in first light.
- Full suite and `npm run typecheck` green; `npm run build` succeeds.

## Out of scope

- A transition between first light and the wall (the handoff says cut).
- Keeping first light reachable after the lead has spoken.
- Any change to the stream mode, the trace view, or the solo composer line.
- A `portrait` folder key in the JSON.
