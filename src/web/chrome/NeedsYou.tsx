import { useState } from 'react';
import type { AskQuestion, NeedsYouItem } from '../../shared/domain';
import { postJson } from '../api';
import { useCast } from '../state/useCast';

export interface NeedsYouProps {
  items: NeedsYouItem[];
  readOnly: boolean;
  now: number;
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
  title,
  pressed,
  disabled = false,
}: {
  label: string;
  tone: 'accent' | 'neutral';
  readOnly: boolean;
  onClick(): void;
  title?: string;
  pressed?: boolean;
  disabled?: boolean;
}) {
  const accent = tone === 'accent';
  const off = readOnly || disabled;
  return (
    <button
      type="button"
      className={accent ? 'btn-approve' : 'btn-neutral'}
      disabled={off}
      title={title}
      aria-pressed={pressed}
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
        opacity: off ? 0.45 : 1,
        cursor: off ? 'not-allowed' : 'pointer',
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
  // Per question: the option labels picked, or the text typed into `other`.
  const [answers, setAnswers] = useState<Record<string, string[] | string>>({});

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
  const questions = permission ? (item.questions ?? []) : [];
  const answerOf = (q: AskQuestion) => {
    const a = answers[q.question] ?? [];
    if (typeof a === 'string') return a;
    return q.options.filter((o) => a.includes(o.label)).map((o) => o.label).join(', ');
  };
  const pick = (q: AskQuestion, label: string) => {
    const a = answers[q.question];
    const picked = Array.isArray(a) ? a : [];
    const next = !q.multiSelect
      ? [label]
      : picked.includes(label)
        ? picked.filter((l) => l !== label)
        : [...picked, label];
    setAnswers({ ...answers, [q.question]: next });
  };

  const head = (
    <>
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
          {questions.length ? (
            <Action
              label="submit"
              tone="accent"
              readOnly={readOnly}
              disabled={!questions.every(answerOf)}
              onClick={() =>
                void postJson(`/api/permits/${item.id}/allow`, {
                  answers: Object.fromEntries(questions.map((q) => [q.question, answerOf(q)])),
                })
              }
            />
          ) : (
            <Action
              label="allow"
              tone="accent"
              readOnly={readOnly}
              onClick={() => void postJson(`/api/permits/${item.id}/allow`)}
            />
          )}
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
    </>
  );

  const card = { ...CARD_BASE, flex: 1, minWidth: 0, border: '1px solid var(--warn-edge)' } as const;
  if (!questions.length) {
    return (
      <div data-testid={permission ? 'card-permission' : 'card-plan'} style={card}>
        {head}
      </div>
    );
  }

  // The strip is one line; a question card grows downward instead: the usual
  // header row, then one wrapping row per question so it stays usable narrow.
  return (
    <div data-testid="card-permission" style={{ ...card, flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>{head}</div>
      {questions.map((q) => {
        const a = answers[q.question];
        const typed = typeof a === 'string' ? a : undefined;
        return (
          <div key={q.question} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                border: '1px solid var(--color-neutral-800)',
                borderRadius: 'var(--radius-sm)',
                padding: '0 5px',
                fontSize: 10,
                color: 'var(--color-neutral-500)',
                whiteSpace: 'nowrap',
              }}
            >
              {q.header}
            </span>
            <span style={{ fontSize: 11, color: 'var(--color-neutral-400)' }}>{q.question}</span>
            {q.options.map((o) => {
              const on = Array.isArray(a) && a.includes(o.label);
              return (
                <Action
                  key={o.label}
                  label={o.label}
                  title={o.description}
                  tone={on ? 'accent' : 'neutral'}
                  pressed={on}
                  readOnly={readOnly}
                  onClick={() => pick(q, o.label)}
                />
              );
            })}
            <Action
              label={typed === undefined ? 'other' : `other: ${typed}`}
              title={typed}
              tone={typed === undefined ? 'neutral' : 'accent'}
              pressed={typed !== undefined}
              readOnly={readOnly}
              onClick={() => {
                const text = window.prompt(q.question);
                if (!text) return;
                setAnswers({ ...answers, [q.question]: text });
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

export function NeedsYou({ items, readOnly, now }: NeedsYouProps) {
  return (
    <div
      style={{
        borderTop: '1px solid var(--color-neutral-900)',
        background: 'var(--color-bg)',
        padding: '9px 14px',
        display: 'flex',
        alignItems: 'stretch',
        gap: 10,
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
        {`NEEDS YOU · ${items.length}`}
      </span>
      <div style={{ flex: 1, display: 'flex', gap: 8, minWidth: 0, alignItems: 'center' }}>
        {items.length === 0 ? (
          <span style={{ color: 'var(--color-neutral-600)', fontSize: 11 }}>nothing waiting</span>
        ) : (
          items.map((item) => <Card key={item.id} item={item} readOnly={readOnly} now={now} />)
        )}
      </div>
    </div>
  );
}
