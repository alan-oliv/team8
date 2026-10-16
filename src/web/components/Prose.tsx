/**
 * The markdown a message carries, rendered rather than shown as source.
 *
 * Only the constructs that actually appear in transcripts — see
 * shared/markdown.ts for why the subset is deliberate. Lives apart from the
 * feed because every surface that shows prose (the expanded drawer, the
 * workflow output tab) renders it the same way, and the feed file is long
 * enough already.
 */
import type { CSSProperties } from 'react';
import { blocks as mdBlocks, type Block, type Inline } from '../../shared/markdown';

export function Spans({ spans }: { spans: Inline[] }) {
  return (
    <>
      {spans.map((s, i) =>
        s.kind === 'strong' ? (
          <strong key={i} style={{ color: 'var(--color-text)', fontWeight: 700 }}>
            {s.text}
          </strong>
        ) : s.kind === 'code' ? (
          <span
            key={i}
            data-testid="md-code"
            style={{
              background: 'var(--term)',
              border: '1px solid var(--color-neutral-900)',
              borderRadius: '3px',
              padding: '0 3px',
              color: 'var(--json-string)',
            }}
          >
            {s.text}
          </span>
        ) : s.kind === 'link' ? (
          <a
            key={i}
            data-testid="md-link"
            href={s.href}
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--color-accent-400)', textDecoration: 'underline', textUnderlineOffset: '2px' }}
          >
            {s.text}
          </a>
        ) : s.kind === 'strike' ? (
          <span
            key={i}
            data-testid="md-strike"
            style={{ textDecoration: 'line-through', color: 'var(--color-neutral-500)' }}
          >
            {s.text}
          </span>
        ) : s.kind === 'em' ? (
          <em key={i} data-testid="md-em" style={{ fontStyle: 'italic' }}>
            {s.text}
          </em>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

/**
 * Header on the text colour, body one step down, hairline rows from the same
 * token as the drawer's rule. Cells never wrap: a nine-column report scrolls
 * sideways inside its own box rather than folding every number onto two lines.
 */
function MarkdownTable({ header, align, rows }: Extract<Block, { kind: 'table' }>) {
  const cell = (i: number): CSSProperties => ({
    textAlign: align[i],
    padding: '3px 12px 3px 0',
    verticalAlign: 'top',
  });
  return (
    <div data-testid="md-table" style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', whiteSpace: 'nowrap', lineHeight: 1.5 }}>
        <thead>
          <tr>
            {header.map((spans, i) => (
              <th
                key={i}
                data-testid="md-th"
                style={{
                  ...cell(i),
                  color: 'var(--color-text)',
                  fontWeight: 700,
                  borderBottom: '1px solid var(--color-neutral-800)',
                }}
              >
                <Spans spans={spans} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((spans, i) => (
                <td
                  key={i}
                  data-testid="md-td"
                  style={{
                    ...cell(i),
                    color: 'var(--color-neutral-300)',
                    borderBottom: '1px solid var(--color-neutral-900)',
                  }}
                >
                  <Spans spans={spans} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The markdown a message carries, rendered rather than shown as source. Only
 * the constructs that actually appear — see shared/markdown.ts for why the
 * subset is deliberate.
 */
export function Prose({ text }: { text: string }) {
  return (
    <>
      {mdBlocks(text).map((b, i) =>
        b.kind === 'heading' ? (
          <div
            key={i}
            data-testid="md-heading"
            style={{
              color: 'var(--color-text)',
              fontWeight: 700,
              fontSize: b.level <= 2 ? '12.5px' : '11.5px',
              marginTop: i === 0 ? 0 : '3px',
            }}
          >
            <Spans spans={b.spans} />
          </div>
        ) : b.kind === 'item' ? (
          <div key={i} data-testid="md-item" style={{ display: 'flex', gap: '7px', lineHeight: 1.65 }}>
            <span style={{ color: 'var(--color-neutral-600)', flex: 'none' }}>
              {b.ordered ? '·' : '–'}
            </span>
            <span style={{ color: 'var(--color-neutral-300)', minWidth: 0 }}>
              <Spans spans={b.spans} />
            </span>
          </div>
        ) : b.kind === 'quote' ? (
          <div
            key={i}
            data-testid="md-quote"
            style={{
              borderLeft: '2px solid var(--color-neutral-800)',
              paddingLeft: '10px',
              color: 'var(--color-neutral-400)',
              lineHeight: 1.65,
            }}
          >
            <Spans spans={b.spans} />
          </div>
        ) : b.kind === 'rule' ? (
          <div key={i} data-testid="md-rule" style={{ height: '1px', background: 'var(--color-neutral-900)', margin: '4px 0' }} />
        ) : b.kind === 'table' ? (
          <MarkdownTable key={i} {...b} />
        ) : b.kind === 'pre' ? (
          <div
            key={i}
            data-testid="md-pre"
            style={{ whiteSpace: 'pre', overflowX: 'auto', color: 'var(--color-neutral-400)', lineHeight: 1.5 }}
          >
            {b.lines.join('\n')}
          </div>
        ) : (
          <span
            key={i}
            style={{ color: 'var(--color-neutral-300)', textWrap: 'pretty', lineHeight: 1.65 }}
          >
            <Spans spans={b.spans} />
          </span>
        ),
      )}
    </>
  );
}
