/**
 * The markdown a message carries, rendered rather than shown as source.
 *
 * Only the constructs that actually appear in transcripts — see
 * shared/markdown.ts for why the subset is deliberate. Lives apart from the
 * feed because every surface that shows prose (the expanded drawer, the
 * workflow output tab) renders it the same way, and the feed file is long
 * enough already.
 */
import { blocks as mdBlocks, type Inline } from '../../shared/markdown';

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
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
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
        ) : b.kind === 'table' ? (
          <div
            key={i}
            data-testid="md-table"
            style={{
              whiteSpace: 'pre',
              overflowX: 'auto',
              color: 'var(--color-neutral-400)',
              lineHeight: 1.5,
            }}
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
