import { useEffect, useRef, useState } from 'react';
import { BLOOM, COLORS, MARK, UNIT, splashFrame } from './splash-frame';

/** The OS-level preference. jsdom has no matchMedia, so its absence reads as off. */
export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

/** Authored at 1920×1080 with a 600px bloom; a shorter side under 600px scales the whole stage down. */
function fitScale(): number {
  return Math.min(1, Math.min(window.innerWidth, window.innerHeight) / BLOOM);
}

/**
 * The logo-4b entry animation, full-bleed over the console. Every visible
 * property is read off `splashFrame(t)` each frame, so the timeline lives in
 * one pure function and this component only keeps the clock.
 */
export function Splash({ reduced, onDone }: { reduced: boolean; onDone: () => void }) {
  const [t, setT] = useState(0);
  const [fit] = useState(fitScale);
  // Read through a ref so the loop is started once and never restarted by a
  // parent re-render handing down a fresh callback.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const start = performance.now();
    let handle = 0;
    const step = (now: number) => {
      const elapsed = (now - start) / 1000;
      setT(elapsed);
      if (splashFrame(elapsed, reduced).done) {
        onDoneRef.current();
        return;
      }
      handle = requestAnimationFrame(step);
    };
    handle = requestAnimationFrame(step);
    return () => cancelAnimationFrame(handle);
  }, [reduced]);

  const frame = splashFrame(t, reduced);

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
      </div>
    </div>
  );
}
