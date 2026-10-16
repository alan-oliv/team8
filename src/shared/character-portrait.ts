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
