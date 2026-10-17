import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { AskQuestion, NeedsYouItem } from '../../shared/domain';
import { DECLINE_MESSAGE } from '../../shared/transcript';
import { postJson } from '../api';
import { useCast } from '../state/useCast';
import { answerText, answersPayload, emptyAnswer, previewLines, showsTabs, type TabAnswer } from './question-answers';

export interface QuestionModalProps {
  item: NeedsYouItem | null;
  leadName: string;
  /** `2. Cancel` on the review tab: the call stays pending, only hidden here. */
  onCancel(id: string): void;
  onDeclined(agent: string): void;
}

const ACCENT = 'var(--color-accent-300)';
const MUTED = 'var(--color-neutral-600)';
const TEXT = 'var(--color-text)';
const RULE = '1px solid var(--color-neutral-900)';
const ROW: CSSProperties = { display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' };
const CURSOR: CSSProperties = { color: ACCENT, width: 14, flex: 'none' };
const NUMBER: CSSProperties = { color: MUTED, width: 20, flex: 'none' };
const CHECK: CSSProperties = { color: ACCENT, width: 30, flex: 'none' };
const STEP: CSSProperties = { color: 'var(--color-neutral-500)', padding: '0 4px', cursor: 'pointer' };

export function QuestionModal({ item, ...rest }: QuestionModalProps) {
  if (!item?.questions?.length) return null;
  // Keyed by the call, so the next question never inherits this one's answers.
  return <Asking key={item.id} item={item} questions={item.questions} {...rest} />;
}

function Tab({ label, on, onClick }: { label: string; on: boolean; onClick(): void }) {
  return (
    <span
      data-testid="question-tab"
      onClick={onClick}
      style={{
        padding: '2px 8px',
        borderRadius: 3,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        background: on ? ACCENT : 'transparent',
        color: on ? 'var(--color-bg)' : TEXT,
      }}
    >
      {label}
    </span>
  );
}

function Asking({
  item,
  questions,
  leadName,
  onCancel,
  onDeclined,
}: Omit<QuestionModalProps, 'item'> & { item: NeedsYouItem; questions: AskQuestion[] }) {
  const who = useCast().asChar(item.agent).display;
  const n = questions.length;
  const tabs = showsTabs(questions);
  const [tab, setTab] = useState(0); // n is the Submit tab
  const [cursors, setCursors] = useState<number[]>(() => Array<number>(n + 1).fill(0));
  const [answers, setAnswers] = useState<TabAnswer[]>(() => questions.map(emptyAnswer));
  const field = useRef<HTMLInputElement>(null);

  const review = tabs && tab === n;
  const qi = Math.min(tab, n - 1);
  const q = questions[qi];
  const a = answers[qi];
  const k = q.options.length;
  const cursor = cursors[tab];
  const answered = (i: number) => answerText(questions[i], answers[i]) !== '';
  const allAnswered = questions.every((_, i) => answered(i));
  const ready = review ? allAnswered : answered(qi);

  const setCursor = (row: number) => setCursors((all) => all.map((v, i) => (i === tab ? row : v)));
  const setAnswer = (next: TabAnswer) => setAnswers((all) => all.map((v, i) => (i === qi ? next : v)));
  const goTab = (t: number) => {
    field.current?.blur();
    setTab(Math.max(0, Math.min(tabs ? n : 0, t)));
  };

  const submit = () => {
    if (allAnswered) void postJson(`/api/permits/${item.id}/allow`, { answers: answersPayload(questions, answers) });
  };
  const decline = () => {
    void postJson(`/api/permits/${item.id}/deny`, { reason: DECLINE_MESSAGE });
    onDeclined(item.agent);
  };
  // `next` is passed in rather than read from state: a key both chooses and
  // moves on in the same handler, before the chosen answer has rendered.
  const forward = (next: TabAnswer) => {
    if (answerText(q, next) === '') return;
    if (tabs) goTab(tab + 1);
    else void postJson(`/api/permits/${item.id}/allow`, { answers: answersPayload(questions, [next]) });
  };
  const pick = (row: number): TabAnswer => {
    const next: TabAnswer = q.multiSelect
      ? { ...a, sel: a.sel.includes(row) ? a.sel.filter((j) => j !== row) : [...a.sel, row] }
      : { sel: [row], other: false, otherText: a.otherText };
    setCursor(row);
    setAnswer(next);
    return next;
  };
  const toField = () => {
    setCursor(k);
    if (!q.multiSelect) setAnswer({ sel: [], other: true, otherText: a.otherText });
    field.current?.focus();
  };
  const type = (text: string) =>
    setAnswer(q.multiSelect ? { ...a, other: text !== '', otherText: text } : { sel: [], other: true, otherText: text });

  // Re-bound every render, so the handler always reads this render's state.
  useEffect(() => {
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const typing = field.current !== null && e.target === field.current;
      const rows = review ? 2 : k + 2;
      if (e.key === 'Escape') {
        e.preventDefault();
        decline();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const row = Math.max(0, Math.min(rows - 1, cursor + (e.key === 'ArrowDown' ? 1 : -1)));
        if (!review && row === k) toField();
        else {
          field.current?.blur();
          setCursor(row);
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (review) {
          if (cursor === 0) submit();
          else onCancel(item.id);
        } else if (cursor === k + 1) {
          if (q.multiSelect) forward(a);
          else decline();
        } else if (cursor === k) forward(a);
        else if (q.multiSelect) pick(cursor);
        else forward(pick(cursor));
      } else if (typing) {
        // digits, space and ←→ edit the field
      } else if (tabs && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        goTab(tab + (e.key === 'ArrowRight' ? 1 : -1));
      } else if (e.key === ' ' && !review && q.multiSelect && cursor < k) {
        e.preventDefault();
        pick(cursor);
      } else if (/^[1-9]$/.test(e.key) && Number(e.key) <= rows) {
        e.preventDefault();
        if (!review && Number(e.key) - 1 === k) toField();
        else setCursor(Number(e.key) - 1);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const preview = !q.multiSelect && q.options.some((o) => o.preview !== undefined);
  const focus = cursor < k ? cursor : (a.sel.at(-1) ?? 0);
  const keys = `${q.multiSelect && !review ? 'space toggle' : '⏎ select'} · ↑↓ move${tabs ? ' · ←→ tabs' : ''} · esc decline`;

  return (
    <div
      data-testid="question-modal"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 40,
        background: 'rgba(18,20,31,.55)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Claude is asking"
        style={{
          width: 760,
          maxWidth: 'calc(100% - 32px)',
          maxHeight: 'calc(100% - 40px)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--color-bg)',
          border: '1px solid var(--color-neutral-800)',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 24px 60px rgba(0,0,0,.6)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '12px 20px', display: 'flex', gap: 10, alignItems: 'baseline', borderBottom: RULE }}>
          <span style={{ color: 'var(--warn)', fontSize: 12, whiteSpace: 'nowrap', flex: 'none' }}>● Claude is asking</span>
          <span style={{ flex: 1 }} />
          <span style={{ color: MUTED, fontSize: 11, whiteSpace: 'nowrap', flex: 'none' }}>
            {n === 1 ? '1 question' : `${n} questions`}
          </span>
        </div>

        {tabs && (
          <div
            data-testid="question-tabs"
            style={{ padding: '10px 20px', display: 'flex', gap: 6, alignItems: 'center', borderBottom: RULE, fontSize: 12.5 }}
          >
            <span className="question-step" onClick={() => goTab(tab - 1)} style={STEP}>
              ←
            </span>
            {questions.map((qq, i) => (
              <Tab key={qq.question} label={`${answered(i) ? '☒' : '☐'} ${qq.header}`} on={i === tab} onClick={() => goTab(i)} />
            ))}
            <Tab label="✔ Submit" on={review} onClick={() => goTab(n)} />
            <span className="question-step" onClick={() => goTab(tab + 1)} style={STEP}>
              →
            </span>
          </div>
        )}

        <div
          className="tscroll"
          style={{ padding: '16px 20px 8px', display: 'flex', flexDirection: 'column', gap: 14, overflow: 'auto', minHeight: 0, flex: '1 1 auto' }}
        >
          {item.context && (
            <span
              data-testid="question-context"
              style={{
                color: 'var(--color-neutral-500)',
                fontSize: 11,
                lineHeight: 1.6,
                textWrap: 'pretty',
                borderLeft: '1px solid var(--color-neutral-800)',
                paddingLeft: 10,
              }}
            >
              {item.agent === leadName ? item.context : `${who} asks: ${item.context}`}
            </span>
          )}

          {review ? (
            <>
              <span style={{ fontSize: 14, fontWeight: 700 }}>Review your answers</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {questions.map((qq, i) => {
                  const text = answerText(qq, answers[i]);
                  return (
                    <div
                      key={qq.question}
                      data-testid="question-review-row"
                      onClick={() => goTab(i)}
                      style={{ display: 'flex', flexDirection: 'column', gap: 1, cursor: 'pointer', paddingLeft: 4 }}
                    >
                      <span style={{ color: 'var(--color-neutral-400)', fontSize: 12 }}>{`● ${qq.question}`}</span>
                      <span style={{ color: text ? ACCENT : 'var(--warn)', fontSize: 12, paddingLeft: 20 }}>
                        {`→ ${text || 'not answered'}`}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4, fontSize: 12.5 }}>
                <div
                  data-testid="question-submit-answers"
                  aria-disabled={!ready}
                  onClick={submit}
                  style={{ display: 'flex', gap: 8, cursor: ready ? 'pointer' : 'not-allowed' }}
                >
                  <span style={CURSOR}>{cursor === 0 ? '❯' : ''}</span>
                  <span style={{ color: MUTED }}>1.</span>
                  <span style={{ color: ready ? ACCENT : MUTED }}>Submit answers</span>
                </div>
                <div data-testid="question-cancel" onClick={() => onCancel(item.id)} style={{ display: 'flex', gap: 8, cursor: 'pointer' }}>
                  <span style={CURSOR}>{cursor === 1 ? '❯' : ''}</span>
                  <span style={{ color: MUTED }}>2.</span>
                  <span style={{ color: cursor === 1 ? ACCENT : TEXT }}>Cancel</span>
                </div>
              </div>
            </>
          ) : (
            <>
              <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.5, textWrap: 'pretty' }}>{q.question}</span>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div
                  role="listbox"
                  aria-multiselectable={q.multiSelect}
                  style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5 }}
                >
                  {q.options.map((o, j) => {
                    const on = a.sel.includes(j);
                    return (
                      <div
                        key={o.label}
                        data-testid="question-option"
                        role="option"
                        aria-selected={on}
                        onClick={() => {
                          field.current?.blur();
                          pick(j);
                        }}
                        style={ROW}
                      >
                        <span style={CURSOR}>{cursor === j ? '❯' : ''}</span>
                        <span style={NUMBER}>{`${j + 1}.`}</span>
                        {q.multiSelect && <span style={CHECK}>{on ? '[✔]' : '[ ]'}</span>}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                          <span style={{ color: cursor === j ? ACCENT : TEXT }}>{o.label}</span>
                          {o.description && (
                            <span style={{ color: 'var(--color-neutral-500)', lineHeight: 1.45, textWrap: 'pretty' }}>
                              {o.description}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div onClick={toField} style={{ ...ROW, alignItems: 'baseline', cursor: 'text' }}>
                    <span style={CURSOR}>{cursor === k ? '❯' : ''}</span>
                    <span style={NUMBER}>{`${k + 1}.`}</span>
                    {q.multiSelect && <span style={CHECK}>{a.otherText ? '[✔]' : '[ ]'}</span>}
                    <input
                      ref={field}
                      data-testid="question-other"
                      className="question-other"
                      type="text"
                      value={a.otherText}
                      placeholder="Type something."
                      onFocus={() => setCursor(k)}
                      onChange={(e) => type(e.target.value)}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        background: 'transparent',
                        border: 0,
                        outline: 0,
                        color: TEXT,
                        fontFamily: 'inherit',
                        fontSize: 12.5,
                        padding: 0,
                      }}
                    />
                  </div>
                  {q.multiSelect ? (
                    <div data-testid="question-multi-submit" onClick={() => forward(a)} style={{ display: 'flex', cursor: 'pointer' }}>
                      <span style={CURSOR}>{cursor === k + 1 ? '❯' : ''}</span>
                      {/* 14 + 52: the canvas indents this row 66px */}
                      <span style={{ paddingLeft: 52, fontWeight: 700, color: ready ? ACCENT : MUTED }}>Submit</span>
                    </div>
                  ) : (
                    <div
                      data-testid="question-chat"
                      onClick={decline}
                      style={{ ...ROW, borderTop: '1px solid var(--color-neutral-800)', marginTop: 4, paddingTop: 8 }}
                    >
                      <span style={CURSOR}>{cursor === k + 1 ? '❯' : ''}</span>
                      <span style={NUMBER}>{`${k + 2}.`}</span>
                      <span style={{ color: cursor === k + 1 ? ACCENT : TEXT }}>Chat about this</span>
                    </div>
                  )}
                </div>
                {preview && (
                  <div
                    data-testid="question-preview"
                    style={{
                      width: 340,
                      flex: 'none',
                      border: '1px solid var(--color-neutral-800)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--term)',
                      padding: '10px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'auto',
                    }}
                  >
                    {previewLines(q.options[focus]?.preview ?? '').map((line, i) => (
                      <span
                        key={i}
                        style={{
                          color: line.code ? 'var(--color-neutral-300)' : 'var(--color-neutral-400)',
                          fontSize: 11.5,
                          whiteSpace: 'pre',
                          lineHeight: 1.6,
                        }}
                      >
                        {line.text || ' '}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div style={{ padding: '10px 20px 12px', display: 'flex', gap: 8, alignItems: 'center', flex: 'none', borderTop: RULE }}>
          <span style={{ color: MUTED, fontSize: 10.5, whiteSpace: 'nowrap' }}>{keys}</span>
          <span style={{ flex: 1 }} />
          {!review && !q.multiSelect && (
            <button
              type="button"
              data-testid="question-submit"
              className="btn-approve"
              disabled={!ready}
              onClick={() => forward(a)}
              style={{
                padding: '5px 16px',
                border: `1px solid var(--color-${ready ? 'accent-700' : 'neutral-800'})`,
                color: ready ? ACCENT : MUTED,
                background: 'transparent',
                borderRadius: 'var(--radius-sm)',
                fontSize: 12,
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
                cursor: ready ? 'pointer' : 'not-allowed',
              }}
            >
              {tabs ? 'next ›' : 'submit'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
