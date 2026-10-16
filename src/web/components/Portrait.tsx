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

const TERMINAL_ASPECT = TERMINAL_SPRITE.length / TERMINAL_SPRITE[0].length; // 17/24

/**
 * The "left session" screen's sprite — same 2px pixel language, palette and
 * `avatars` toggle as the role portraits, but not one: nobody is dismissing an
 * agent, so it lives outside `portraitFor`'s agent-shaped API.
 */
export function TerminalSprite({ size = 144 }: { size?: number }) {
  const { avatars } = useAppearance();
  if (!avatars) return null;
  const height = size * TERMINAL_ASPECT;
  const scale = size / 144;
  return (
    <div
      data-testid="terminal-sprite"
      aria-hidden="true"
      style={{ width: size, height, position: 'relative', flex: 'none' }}
    >
      <div
        data-testid="terminal-sprite-glow"
        style={{
          position: 'absolute',
          left: -16 * scale,
          top: -10 * scale,
          width: 176 * scale,
          height: 122 * scale,
          borderRadius: '50%',
          background: 'radial-gradient(closest-side, var(--color-accent-900), transparent 72%)',
          opacity: 0.85,
        }}
      />
      <div
        style={{ position: 'absolute', top: 0, left: 0, width: size, height }}
        dangerouslySetInnerHTML={{ __html: TERMINAL_SPRITE_SVG }}
      />
    </div>
  );
}
