import { gridSvg } from './portrait';

/**
 * The mark (design canvas 4b): a pixel 8 built from eight nodes, two stacked
 * rings sharing the middle pair. One-unit border of empty cells for breathing
 * room at small sizes.
 */
const LOGO_GRID: string[] = [
  '......',
  '..gA..',
  '.g..g.',
  '..gg..',
  '.g..g.',
  '..gg..',
  '......',
];

const LOGO_COLORS: Record<string, string> = {
  g: 'var(--color-neutral-500)',
  A: 'var(--color-accent-400)',
};

export const LOGO_SVG = gridSvg(LOGO_GRID, 6, ['g', 'A'], (ch) => LOGO_COLORS[ch]);
