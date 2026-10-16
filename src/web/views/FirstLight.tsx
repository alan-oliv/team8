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
