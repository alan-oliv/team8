import { useEffect, useRef, useState } from 'react';
import { BLOOM, COLORS, MARK, UNIT, holdAt, splashFrame, waitOpacity } from './splash-frame';

/** The OS-level preference. jsdom has no matchMedia, so its absence reads as off. */
export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

/** The timeline is authored at 4.4s; it plays at double speed. */
const SPEED = 2;

/** Authored at 1920×1080 with a 600px bloom; a shorter side under 600px scales the whole stage down. */
function fitScale(): number {
  return Math.min(1, Math.min(window.innerWidth, window.innerHeight) / BLOOM);
}

/**
 * The logo-4b entry animation, full-bleed over the console. Every visible
 * property is read off `splashFrame(t)` each frame, so the timeline lives in
 * one pure function and this component only keeps the clock.
 */
export function Splash({ reduced, holding = false, onDone }: { reduced: boolean; holding?: boolean; onDone: () => void }) {
  const [clock, setClock] = useState({ t: 0, waited: 0 });
  const [fit] = useState(fitScale);
  // Read through a ref so the loop is started once and never restarted by a
  // parent re-render handing down a fresh callback.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const holdingRef = useRef(holding);
  holdingRef.current = holding;
  const hold = holdAt(reduced);

  useEffect(() => {
    const start = performance.now();
    let handle = 0;
    let t = 0;
    let waited = 0;
    const step = (now: number) => {
      const elapsed = ((now - start) / 1000) * SPEED;
      // A session still loading keeps the mark assembled, unless its exit already began.
      if (holdingRef.current && t <= hold && elapsed - waited > hold) {
        waited = elapsed - hold;
        t = hold;
      } else {
        t = elapsed - waited;
      }
      setClock({ t, waited });
      if (splashFrame(t, reduced).done) {
        onDoneRef.current();
        return;
      }
      handle = requestAnimationFrame(step);
    };
    handle = requestAnimationFrame(step);
    return () => cancelAnimationFrame(handle);
  }, [reduced, hold]);

  const frame = splashFrame(clock.t, reduced);

  return (
    <div className="splash" data-testid="splash" aria-hidden="true" style={{ backgroundColor: COLORS.bg }}>
      <div
        className="splash-stage"
        data-testid="splash-stage"
        style={{ transform: `translate(-50%, -50%) scale(${fit})` }}
      >
        <div
          className="splash-bloom"
          style={{
            width: BLOOM,
            height: BLOOM,
            opacity: frame.bloomOpacity,
            transform: `translate(-50%, -50%) scale(${frame.bloomScale})`,
          }}
        />
        <div
          className="splash-mark"
          style={{
            width: MARK,
            height: MARK,
            transform: `translate(-50%, -50%) scale(${frame.breathe})`,
          }}
        >
          {frame.nodes.map((n) => (
            <div
              key={`${n.x},${n.y}`}
              className="splash-node"
              data-testid="splash-node"
              style={{
                left: n.x * UNIT,
                top: n.y * UNIT,
                width: UNIT * 2,
                height: UNIT * 2,
                backgroundColor: n.lead ? COLORS.lead : COLORS.teammate,
                opacity: n.opacity,
                transform: `translate(${n.dx}px, ${n.dy}px) scale(${n.scale})`,
                boxShadow: `0 0 ${n.glow}px ${n.lead ? COLORS.glowLead : COLORS.glowTeammate}`,
              }}
            />
          ))}
        </div>
        {clock.waited > 0 && (
          <div
            className="splash-wait"
            style={{ color: COLORS.teammate, opacity: waitOpacity(clock.waited, clock.t, hold) }}
          >
            loading your session
          </div>
        )}
      </div>
    </div>
  );
}
