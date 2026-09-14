import { useEffect, useState, type CSSProperties } from 'react';
import type { PlanProgress } from '../../shared/domain';
import { BAR, STRIP } from './Tasks';

const PLANS_DIR = 'docs/team8/plans/';

const ROW: CSSProperties = {
  display: 'flex',
  gap: '10px',
  alignItems: 'baseline',
  width: '100%',
  padding: '12px 16px',
  border: 'none',
  borderBottom: '1px solid var(--color-neutral-900)',
  background: 'transparent',
  font: 'inherit',
  fontSize: '11.5px',
  textAlign: 'left',
  cursor: 'pointer',
};

const SECTION: CSSProperties = {
  margin: 0,
  padding: '10px 16px 14px 70px',
  borderBottom: '1px solid var(--color-neutral-900)',
  color: 'var(--color-neutral-400)',
  fontSize: '11px',
  whiteSpace: 'pre-wrap',
};

/**
 * One task's section, fetched when its row opens and again whenever the file
 * changes — a row opened while outlined fills in as the lead writes it.
 */
function useSection(n: number | null, mtime: number): string | null {
  const [got, setGot] = useState<{ n: number; text: string | null } | null>(null);

  useEffect(() => {
    if (n === null) return;
    let current = true;
    void (async () => {
      let text: string | null = null;
      try {
        const res = await fetch(`/api/plan-task?n=${n}`);
        if (res.ok) text = ((await res.json()) as { text: string }).text;
      } catch {
        // The console went away; the next frame's mtime retries.
      }
      if (current) setGot({ n, text });
    })();
    return () => {
      current = false;
    };
  }, [n, mtime]);

  return got && got.n === n ? got.text : null;
}

export function Plan({ plan }: { plan: PlanProgress }) {
  const [open, setOpen] = useState<number | null>(null);
  const section = useSection(open, plan.mtime);
  const total = plan.tasks.length;
  const written = plan.tasks.filter((t) => t.written).length;
  const share = total === 0 ? 0 : written / total;
  const at = plan.path.indexOf(PLANS_DIR);

  return (
    <div data-testid="plan" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={STRIP}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
          <span style={{ color: 'var(--color-neutral-600)', fontSize: '10px', letterSpacing: '.12em', flex: 'none' }}>
            PLAN
          </span>
          <span data-testid="plan-pct" style={{ color: 'var(--color-text)', fontSize: '12px', flex: 'none' }}>
            {`${Math.round(share * 100)}%`}
          </span>
          <span
            data-testid="plan-count"
            style={{ color: 'var(--color-neutral-600)', fontSize: '10.5px', flex: 'none', whiteSpace: 'nowrap' }}
          >
            {`${written} of ${total} tasks written`}
          </span>
          <span style={{ flex: 1, minWidth: '8px' }} />
          <span
            data-testid="plan-path"
            style={{
              color: 'var(--color-neutral-600)',
              fontSize: '10px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {at === -1 ? plan.path : plan.path.slice(at)}
          </span>
        </div>
        <div style={BAR}>
          <span data-testid="plan-bar" style={{ width: `${share * 100}%`, background: 'var(--color-accent-500)' }} />
        </div>
      </div>

      <div className="tscroll" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {plan.tasks.map((task) => (
          <div key={task.n}>
            <button
              type="button"
              data-testid="plan-row"
              style={ROW}
              onClick={() => setOpen((o) => (o === task.n ? null : task.n))}
            >
              <span style={{ width: '44px', color: 'var(--color-neutral-600)' }}>{task.n}</span>
              <span
                style={{
                  flex: 1,
                  color: 'var(--color-neutral-300)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {task.title}
              </span>
              <span
                data-testid="plan-state"
                style={{ width: '76px', color: task.written ? 'var(--color-accent-300)' : 'var(--color-neutral-600)' }}
              >
                {task.written ? 'written' : 'outlined'}
              </span>
            </button>
            {open === task.n && (
              <pre data-testid="plan-section" style={SECTION}>
                {section ?? ''}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
