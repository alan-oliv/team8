import type { NeedsYouItem } from '../../shared/domain';
import { postJson } from '../api';
import { useCast } from '../state/useCast';

export interface NeedsYouProps {
  items: NeedsYouItem[];
  readOnly: boolean;
  now: number;
  /** First light lowers the strip to .35; it stays interactive. */
  dimmed?: boolean;
  /** A right-hand line, e.g. "messages go to Cobb until a teammate joins". */
  note?: string;
}

const CARD_BASE = {
  borderRadius: 'var(--radius-sm)',
  padding: '6px 10px',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
} as const;

const DETAIL = { fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const;

function Action({
  label,
  tone,
  readOnly,
  onClick,
}: {
  label: string;
  tone: 'accent' | 'neutral';
  readOnly: boolean;
  onClick(): void;
}) {
  const accent = tone === 'accent';
  return (
    <button
      type="button"
      className={accent ? 'btn-approve' : 'btn-neutral'}
      disabled={readOnly}
      onClick={onClick}
      style={{
        border: `1px solid var(--color-${accent ? 'accent-700' : 'neutral-800'})`,
        color: `var(--color-${accent ? 'accent-300' : 'neutral-500'})`,
        borderRadius: 'var(--radius-sm)',
        padding: '1px 8px',
        fontSize: 10.5,
        whiteSpace: 'nowrap',
        flexShrink: 0,
        maxWidth: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        opacity: readOnly ? 0.45 : 1,
        cursor: readOnly ? 'not-allowed' : 'pointer',
      }}
    >
      {label}
    </button>
  );
}

function Card({ item, readOnly, now }: { item: NeedsYouItem; readOnly: boolean; now: number }) {
  // The card names the agent to the operator, so it names the character. Every
  // answer below is posted on the item's own id and is untouched by the theme.
  const who = useCast().asChar(item.agent).display;

  if (item.kind === 'failure') {
    return (
      <div
        data-testid="card-failure"
        style={{ ...CARD_BASE, flex: 'none', border: '1px solid var(--color-neutral-800)' }}
      >
        <span style={{ color: 'var(--fail)', fontSize: 11, whiteSpace: 'nowrap' }}>
          {`${who} · ${item.reason}`}
        </span>
        <span style={{ ...DETAIL, color: 'var(--color-neutral-600)' }}>{item.detail}</span>
        <Action
          label="respawn"
          tone="accent"
          readOnly={readOnly}
          onClick={() => void postJson(`/api/agents/${item.agent}/respawn`)}
        />
      </div>
    );
  }

  const permission = item.kind === 'permission';
  return (
    <div
      data-testid={permission ? 'card-permission' : 'card-plan'}
      style={{ ...CARD_BASE, flex: 1, minWidth: 0, border: '1px solid var(--warn-edge)' }}
    >
      <span style={{ color: 'var(--warn)', fontSize: 11, whiteSpace: 'nowrap' }}>
        {`${who} · ${item.reason}`}
      </span>
      <span style={{ ...DETAIL, color: 'var(--color-neutral-500)' }}>{item.detail}</span>
      <span style={{ flex: 1 }} />
      {permission && item.expiresAt !== undefined && (
        <span
          data-testid="permit-countdown"
          style={{ color: 'var(--color-neutral-600)', fontSize: 10.5, whiteSpace: 'nowrap' }}
        >
          {`${Math.max(0, Math.ceil((item.expiresAt - now) / 1000))}s`}
        </span>
      )}
      {permission ? (
        <>
          <Action
            label="allow"
            tone="accent"
            readOnly={readOnly}
            onClick={() => void postJson(`/api/permits/${item.id}/allow`)}
          />
          <Action
            label="deny with reason"
            tone="neutral"
            readOnly={readOnly}
            onClick={() => {
              const reason = window.prompt(`reason for denying ${who}`);
              if (reason === null) return;
              void postJson(`/api/permits/${item.id}/deny`, { reason });
            }}
          />
        </>
      ) : (
        <>
          <Action
            label="approve"
            tone="accent"
            readOnly={readOnly}
            onClick={() => void postJson(`/api/plans/${item.id}/approve`)}
          />
          <Action
            label="reject with feedback"
            tone="neutral"
            readOnly={readOnly}
            onClick={() => {
              const feedback = window.prompt(`feedback for ${who}`);
              if (feedback === null) return;
              void postJson(`/api/plans/${item.id}/reject`, { feedback });
            }}
          />
        </>
      )}
    </div>
  );
}

export function NeedsYou({ items, readOnly, now, dimmed, note }: NeedsYouProps) {
  // AskUserQuestion has the modal; the strip never draws one.
  const shown = items.filter((item) => !item.questions?.length);
  return (
    <div
      data-testid="needs-you"
      style={{
        borderTop: '1px solid var(--color-neutral-900)',
        background: 'var(--color-bg)',
        padding: '9px 14px',
        display: 'flex',
        alignItems: 'stretch',
        gap: 10,
        opacity: dimmed ? 0.35 : undefined,
      }}
    >
      <span
        style={{
          color: 'var(--warn)',
          fontSize: 10.5,
          letterSpacing: '.12em',
          alignSelf: 'center',
          whiteSpace: 'nowrap',
        }}
      >
        {`NEEDS YOU · ${shown.length}`}
      </span>
      <div style={{ flex: 1, display: 'flex', gap: 8, minWidth: 0, alignItems: 'center' }}>
        {shown.length === 0 ? (
          <span style={{ color: 'var(--color-neutral-600)', fontSize: 11 }}>nothing waiting</span>
        ) : (
          shown.map((item) => <Card key={item.id} item={item} readOnly={readOnly} now={now} />)
        )}
      </div>
      {note && (
        <span
          data-testid="needs-you-note"
          style={{ marginLeft: 'auto', alignSelf: 'center', whiteSpace: 'nowrap', color: 'var(--color-neutral-600)', fontSize: 11 }}
        >
          {note}
        </span>
      )}
    </div>
  );
}
