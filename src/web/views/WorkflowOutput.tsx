import type { CSSProperties, ReactNode } from 'react';
import type { WorkflowRun as Run } from '../../shared/domain';
import { Prose } from '../components/TranscriptFeed';
import { clockLabel, formatElapsed, formatTokens } from '../format';
import { liveCounts } from './workflow-grid';
import { humanizeKey, parseOutput, type OutputDoc, type Primitive } from './workflow-output';

const HEAD: CSSProperties = {
  flex: 'none',
  display: 'flex',
  alignItems: 'baseline',
  gap: '10px',
  padding: '10px 16px 8px',
  color: 'var(--color-neutral-600)',
  fontSize: '10px',
  letterSpacing: '.12em',
  borderBottom: '1px solid var(--color-neutral-900)',
};

const BUTTON: CSSProperties = {
  flex: 'none',
  border: '1px solid var(--color-neutral-800)',
  borderRadius: 'var(--radius-sm)',
  background: 'transparent',
  color: 'var(--color-neutral-500)',
  fontSize: '10px',
  letterSpacing: 'normal',
  padding: '1px 8px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const SECTION_HEAD: CSSProperties = {
  color: 'var(--color-neutral-600)',
  fontSize: '10px',
  letterSpacing: '.12em',
  marginBottom: '6px',
};

const STAT_BAR: CSSProperties = {
  flex: 'none',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '18px 32px',
  padding: '14px 16px',
  borderBottom: '1px solid var(--color-neutral-900)',
};

const STAT_LABEL: CSSProperties = {
  color: 'var(--color-neutral-600)',
  fontSize: '10px',
  letterSpacing: '.12em',
  marginBottom: '4px',
};

const STAT_VALUE: CSSProperties = { color: 'var(--color-text)', fontSize: '21px', fontWeight: 600, lineHeight: 1 };

const CARD: CSSProperties = {
  border: '1px solid var(--color-neutral-900)',
  borderRadius: '5px',
  padding: '8px 10px',
};

const ROW: CSSProperties = { display: 'flex', gap: '10px', fontSize: '11px', lineHeight: 1.5, alignItems: 'flex-start' };
const ROW_LABEL: CSSProperties = { flex: 'none', width: '84px', color: 'var(--color-neutral-600)' };
const ROW_VALUE: CSSProperties = { flex: 1, minWidth: 0, color: 'var(--color-neutral-300)', wordBreak: 'break-word' };

const CODE: CSSProperties = {
  background: 'var(--term)',
  border: '1px solid var(--color-neutral-900)',
  borderRadius: 'var(--radius-sm)',
  padding: '8px 10px',
  color: 'var(--color-neutral-300)',
  fontSize: '11px',
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

// Past this many levels a nested object or array-of-objects falls back to
// inline JSON rather than growing an unbounded tree for a shape nobody asked
// to read — the console has no schema for what a script returns.
const MAX_DEPTH = 2;
const isUrl = (s: string) => /^https?:\/\//.test(s);

function Bullet({ value }: { value: unknown }) {
  const text = String(value);
  return (
    <div style={{ display: 'flex', gap: '7px' }}>
      <span style={{ flex: 'none', color: 'var(--color-neutral-600)' }}>–</span>
      {isUrl(text) ? (
        <a
          href={text}
          target="_blank"
          rel="noreferrer"
          style={{ color: 'var(--color-accent-400)', wordBreak: 'break-all' }}
        >
          {text}
        </a>
      ) : (
        <span style={{ color: 'var(--color-neutral-300)', wordBreak: 'break-word' }}>{text}</span>
      )}
    </div>
  );
}

/** Any JS value a section can hold, laid out by shape rather than by an assumed schema. */
function Value({ value, depth }: { value: unknown; depth: number }): ReactNode {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return depth === 0 ? <Prose text={value} /> : <span>{value}</span>;
  if (typeof value === 'number' || typeof value === 'boolean') return <span>{String(value)}</span>;

  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    if (value.every((v) => v === null || typeof v !== 'object')) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          {value.map((v, i) => (
            <Bullet key={i} value={v} />
          ))}
        </div>
      );
    }
    if (depth >= MAX_DEPTH) return <pre style={CODE}>{JSON.stringify(value, null, 2)}</pre>;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {value.map((item, i) => (
          <div key={i} style={CARD}>
            <Value value={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }

  if (depth >= MAX_DEPTH) return <pre style={CODE}>{JSON.stringify(value, null, 2)}</pre>;
  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== null && v !== undefined);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {entries.map(([k, v]) => (
        <div key={k} style={ROW}>
          <span style={ROW_LABEL}>{humanizeKey(k)}</span>
          <span style={ROW_VALUE}>
            <Value value={v} depth={depth + 1} />
          </span>
        </div>
      ))}
    </div>
  );
}

/** KPI row: a script's own summary counters, at a glance above the fold rather than scrolled past as another section. */
function StatBar({ stats }: { stats: Record<string, Primitive> }) {
  return (
    <div data-testid="wf-output-statbar" style={STAT_BAR}>
      {Object.entries(stats).map(([key, v]) => (
        <div key={key} data-testid="wf-output-stat">
          <div style={STAT_LABEL}>{humanizeKey(key)}</div>
          <div style={STAT_VALUE}>{typeof v === 'number' ? formatTokens(v) : String(v)}</div>
        </div>
      ))}
    </div>
  );
}

function Sections({ value, exclude }: { value: Record<string, unknown>; exclude?: string }) {
  const entries = Object.entries(value).filter(([k, v]) => v !== null && v !== undefined && k !== exclude);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {entries.map(([key, v]) => (
        <div key={key} data-testid="wf-output-section">
          <div style={SECTION_HEAD}>{humanizeKey(key)}</div>
          <Value value={v} depth={0} />
        </div>
      ))}
    </div>
  );
}

function copyTextOf(doc: OutputDoc): string {
  return doc.kind === 'prose' ? doc.text : JSON.stringify(doc.value, null, 2);
}

/** The same detached-anchor trick every browser "save" button uses. */
function saveOutput(runId: string, doc: OutputDoc) {
  const isProse = doc.kind === 'prose';
  const text = copyTextOf(doc);
  const url = URL.createObjectURL(new Blob([text], { type: isProse ? 'text/markdown' : 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${runId}.${isProse ? 'md' : 'json'}`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * A workflow returns once, at the end — there is no partial output to draw
 * mid-run, so this tab says that plainly instead of showing an empty document.
 */
export function WorkflowOutput({ run, now }: { run: Run; now: number }) {
  const result = run.result;

  if (run.live || run.status !== 'completed' || result === undefined) {
    const elapsed =
      run.durationMs !== undefined
        ? formatElapsed(run.durationMs)
        : run.startedAt !== undefined
          ? formatElapsed(now - run.startedAt)
          : '—';
    const agentCount = run.live ? liveCounts(run).started : (run.agentCount ?? run.agents.length);
    const reason = run.live
      ? 'no output yet — a workflow returns once, at completion'
      : run.status === 'failed'
        ? 'no output — this run failed'
        : run.status === 'killed'
          ? 'no output — this run was killed'
          : 'no output — the script returned nothing';

    return (
      <div data-testid="workflow-output" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div data-testid="wf-output-head" style={HEAD}>
          <span>OUTPUT</span>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '14px 16px' }}>
          <div data-testid="wf-output-empty" style={{ color: 'var(--color-neutral-500)', fontSize: '11.5px', lineHeight: 1.6 }}>
            {reason}
          </div>
          <div style={{ marginTop: '8px', color: 'var(--color-neutral-700)', fontSize: '10px' }}>
            {`${elapsed} elapsed · ${agentCount} agent${agentCount === 1 ? '' : 's'}`}
          </div>
        </div>
      </div>
    );
  }

  const doc = parseOutput(result);
  const meta =
    doc.kind === 'prose'
      ? (() => {
          const n = doc.text.trim().split(/\s+/).filter(Boolean).length;
          return `${n} word${n === 1 ? '' : 's'}`;
        })()
      : doc.kind === 'sections'
        ? (() => {
            const n = Object.keys(doc.value).length;
            return `${n} field${n === 1 ? '' : 's'}`;
          })()
        : undefined;
  const returnedAt =
    run.startedAt !== undefined && run.durationMs !== undefined ? run.startedAt + run.durationMs : undefined;

  return (
    <div data-testid="workflow-output" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div data-testid="wf-output-head" style={HEAD}>
        <span>OUTPUT</span>
        {returnedAt !== undefined && (
          <span>{`returned ${clockLabel(returnedAt)}${meta ? ` · ${meta}` : ''}`}</span>
        )}
        <span style={{ flex: 1 }} />
        <button
          type="button"
          className="btn-neutral"
          data-testid="wf-output-copy"
          onClick={() => void navigator.clipboard?.writeText(copyTextOf(doc))}
          style={BUTTON}
        >
          copy
        </button>
        <button
          type="button"
          className="btn-neutral"
          data-testid="wf-output-save"
          onClick={() => saveOutput(run.runId, doc)}
          style={BUTTON}
        >
          {doc.kind === 'prose' ? 'save .md' : 'save .json'}
        </button>
      </div>
      {doc.kind === 'sections' && doc.statsKey !== undefined && (
        <StatBar stats={doc.value[doc.statsKey] as Record<string, Primitive>} />
      )}
      <div
        data-testid="wf-output-doc"
        style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '3px' }}
      >
        {doc.kind === 'prose' ? (
          <Prose text={doc.text} />
        ) : doc.kind === 'sections' ? (
          <Sections value={doc.value} exclude={doc.statsKey} />
        ) : (
          <pre style={CODE}>{JSON.stringify(doc.value, null, 2)}</pre>
        )}
      </div>
    </div>
  );
}
