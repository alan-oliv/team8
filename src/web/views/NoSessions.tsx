import type { CSSProperties } from 'react';
import type { SessionRow } from '../../shared/domain';
import { TerminalSprite } from '../components/Portrait';

const ELLIPSIS: CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

export interface NoSessionsProps {
  /** Live sessions elsewhere on the machine, one click away. Empty: nothing is live anywhere. */
  others: SessionRow[];
  onSwitchTo(id: string): void;
}

/**
 * The body when nothing is live and nothing is on screen. Sibling to
 * `LeftSession` rather than a mode of it: that screen is about ONE session you
 * deliberately left and can still see ticking, and every part of it — the live
 * card, `watch again`, `end it for real` — needs a session to point at. This
 * one has none.
 */
export function NoSessions({ others, onSwitchTo }: NoSessionsProps) {
  return (
    <div
      data-testid="no-sessions"
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        display: 'flex',
        // Centred on both axes: this is the whole body, not a panel inside one,
        // and a block pinned to the top of an otherwise empty console reads as
        // something that failed to load rather than a resting state.
        justifyContent: 'center',
        alignItems: 'center',
        padding: '24px',
      }}
    >
      <div style={{ width: '560px', maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: '22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '26px' }}>
          <TerminalSprite size={144} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', minWidth: 0 }}>
            <h1 style={{ color: 'var(--color-text)', fontSize: '16px', fontWeight: 500, margin: 0 }}>
              Nothing live on this machine.
            </h1>
            <p
              style={{
                color: 'var(--color-neutral-500)',
                fontSize: '11.5px',
                lineHeight: 1.6,
                textWrap: 'pretty',
                margin: 0,
              }}
            >
              {/* Say what did not happen. A blank console is the moment an
                  operator most needs telling that nothing was stopped — the
                  same reason the stop glyph and the in-flight badge refuse
                  to overstate. */}
              The picker lists sessions whose Claude process is running. Resume a session
              from your terminal — session-deck, or `claude --resume` — and it appears
              here within a few seconds. Nothing was stopped and nothing was deleted.
            </p>
          </div>
        </div>

        {others.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
            <span
              style={{
                color: 'var(--color-neutral-600)',
                fontSize: '10px',
                letterSpacing: '.12em',
              }}
            >
              ELSEWHERE ON THIS MACHINE
            </span>
            {others.map((r) => (
              <button
                key={r.id}
                type="button"
                className="chip"
                data-testid="no-sessions-other"
                onClick={() => onSwitchTo(r.id)}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: '9px',
                  padding: '7px 11px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-neutral-900)',
                  background: 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{ fontSize: '10px', color: r.busy ? 'var(--color-accent-400)' : 'var(--color-neutral-600)' }}
                >
                  {r.busy ? '●' : '○'}
                </span>
                <span style={{ color: 'var(--color-text)', fontSize: '11.5px', ...ELLIPSIS }}>
                  {r.title}
                </span>
                <span style={{ flex: 1 }} />
                <span
                  style={{ color: 'var(--color-neutral-600)', fontSize: '10px', flex: 'none' }}
                >
                  {`${r.members} agent${r.members === 1 ? '' : 's'}`}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
