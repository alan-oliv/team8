import { useState, type CSSProperties } from 'react';
import type { Agent, Brief, MailMessage, NeedsYouItem, Task } from '../../shared/domain';
import { wallOrder } from '../../shared/roster';
import { AGENT_STATUS, DORMANT_OPACITY, isDormant } from '../../shared/status';
import { postJson } from '../api';
import { Elapsed, NowContext } from '../components/Elapsed';
import { Portrait } from '../components/Portrait';
import { StatusGlyph } from '../components/StatusGlyph';
import { useCast } from '../state/useCast';
import { briefIsStale } from '../../shared/brief';
import { briefAge, costLabel, elapsedLabel, formatTokens } from '../format';
import { findingCount, nextUnblock, overviewRow, stateCounts, taskBar } from './overview-rows';

const PANEL: CSSProperties = {
  border: '1px solid var(--color-neutral-900)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--color-bg)',
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
};

const KICKER: CSSProperties = {
  fontSize: '10px',
  color: 'var(--color-neutral-700)',
  letterSpacing: '.12em',
};

const ELLIPSIS: CSSProperties = {
  minWidth: 0,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const REGENERATE_TITLE =
  'POST /api/sessions/:id/brief — re-reads the last 5 minutes of every transcript and the task list';

function BriefPanel({
  brief, agents, tasks, sessionId, now, readOnly,
}: {
  brief?: Brief;
  agents: Agent[];
  tasks: Task[];
  sessionId: string;
  now: number;
  readOnly: boolean;
}) {
  const [hover, setHover] = useState(false);
  const pending = brief?.pending ?? false;
  // The panel's own honesty check: the team has moved since this was written, so
  // the paragraphs below describe a state the rows no longer show.
  const stale = briefIsStale(brief, agents, tasks);

  // A brief that has never run says so rather than drawing three empty rows.
  const meta = brief
    ? `${brief.model} · last ${brief.inputs.windowMin} min of ${brief.inputs.transcripts} transcripts + ${brief.inputs.tasks} tasks · ${briefAge(Math.max(0, now - brief.generatedAt))} ago`
    : 'not written yet — nothing has asked for one';

  const paragraphs = brief?.paragraphs ?? [];

  return (
    <div data-testid="brief" style={{ ...PANEL, flex: 1 }}>
      <div
        style={{
          padding: '9px 14px',
          borderBottom: '1px solid var(--color-neutral-900)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <span style={{ ...KICKER, flex: 'none' }}>BRIEF</span>
        {/*
          No regenerate button. The brief re-reads itself whenever the state it
          describes moves, so a control to ask for that is a control with nothing
          to do — and one the operator has to police. The meta line carries the
          whole state instead: what wrote it, when, and whether it is behind. It
          stays clickable as the escape hatch for a run that failed.
        */}
        <button
          data-testid="brief-meta"
          type="button"
          title={REGENERATE_TITLE}
          disabled={pending || readOnly}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          onClick={() => void postJson(`/api/sessions/${encodeURIComponent(sessionId)}/brief`)}
          style={{
            ...ELLIPSIS,
            flex: 1,
            font: 'inherit',
            fontSize: '10px',
            textAlign: 'left',
            padding: 0,
            border: 'none',
            background: 'transparent',
            color: hover && !pending && !readOnly ? 'var(--color-accent-300)' : 'var(--color-neutral-600)',
            cursor: pending || readOnly ? 'default' : 'pointer',
          }}
        >
          {meta}
        </button>
        {pending && (
          <span data-testid="brief-pending" style={{ flex: 'none', fontSize: '10px', color: 'var(--color-neutral-500)' }}>
            writing…
          </span>
        )}
        {!pending && stale && (
          <span data-testid="brief-stale" style={{ flex: 'none', fontSize: '10px', color: 'var(--warn)' }}>
            behind the rows · rewriting
          </span>
        )}
      </div>

      <div style={{ padding: '12px 14px 13px', display: 'flex', flexDirection: 'column', gap: '9px', flex: 1 }}>
        {brief?.error && (
          <div data-testid="brief-error" style={{ fontSize: '10.5px', color: 'var(--fail)' }}>
            the brief could not be written — {brief.error}
          </div>
        )}
        {paragraphs.length === 0 && !brief?.error && (
          <div style={{ fontSize: '11.5px', color: 'var(--color-neutral-600)', lineHeight: 1.6 }}>
            {pending
              ? 'reading the last five minutes…'
              : 'nothing has been read yet — click the header line to write the first one.'}
          </div>
        )}
        {paragraphs.map((p) => (
          <div key={p.head} style={{ display: 'flex', gap: '10px' }}>
            <span
              style={{
                flex: 'none',
                width: '78px',
                fontSize: '9.5px',
                letterSpacing: '.1em',
                color: 'var(--color-neutral-600)',
                paddingTop: '2px',
              }}
            >
              {p.head}
            </span>
            <span
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: '11.5px',
                color: 'var(--color-neutral-200)',
                lineHeight: 1.6,
                textWrap: 'pretty',
              }}
            >
              {p.text || '—'}
            </span>
          </div>
        ))}
      </div>

      <div
        style={{
          padding: '7px 14px',
          borderTop: '1px solid var(--color-neutral-900)',
          display: 'flex',
          gap: '12px',
          fontSize: '9.5px',
          color: 'var(--color-neutral-600)',
        }}
      >
        <span style={{ ...ELLIPSIS, flex: 1 }}>
          a reading of the transcripts, not a record — every claim in it can be found in an agent's wall
        </span>
        <span data-testid="brief-cost" style={{ flex: 'none' }}>
          {brief
            ? `${formatTokens(brief.usage.in)} in · ${formatTokens(brief.usage.out)} out · ${costLabel(brief.usage.costUsd)} per run · rewrites itself when the team moves`
            : 'rewrites itself when the team moves'}
        </span>
      </div>
    </div>
  );
}

function WhereItStands({
  roster, tasks, needsYou, startedAt, now,
}: {
  roster: Agent[];
  tasks: Task[];
  needsYou: NeedsYouItem[];
  startedAt: number;
  now: number;
}) {
  const bar = taskBar(tasks);
  const counts = stateCounts(roster, needsYou, findingCount(roster));

  return (
    <div data-testid="where-it-stands" style={{ ...PANEL, flex: 'none', width: '300px' }}>
      <div
        style={{
          padding: '9px 14px',
          borderBottom: '1px solid var(--color-neutral-900)',
          display: 'flex',
          alignItems: 'baseline',
          gap: '10px',
        }}
      >
        <span style={{ ...KICKER, flex: 1 }}>WHERE IT STANDS</span>
        <span style={{ flex: 'none', fontSize: '10px', color: 'var(--color-neutral-600)' }}>
          {elapsedLabel(startedAt, now)}
        </span>
      </div>

      <div style={{ padding: '11px 14px 12px', display: 'flex', flexDirection: 'column', gap: '9px' }}>
        <div style={{ display: 'flex', fontSize: '10.5px', color: 'var(--color-neutral-500)' }}>
          <span style={{ flex: 1 }}>tasks</span>
          <span data-testid="task-count">{`${bar.done}/${bar.total}`}</span>
        </div>
        <div
          data-testid="task-bar"
          style={{ display: 'flex', height: '6px', background: 'var(--term)', borderRadius: '2px', overflow: 'hidden' }}
        >
          {bar.segments.map((s) => (
            <div key={s.key} title={s.key} style={{ width: `${s.pct}%`, background: s.color }} />
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px' }}>
          {counts.map((row) => (
            <div key={row.label} data-testid="stands-row" style={{ display: 'flex', gap: '7px', fontSize: '10.5px' }}>
              <span style={{ flex: 'none', width: '10px', color: row.color }}>{row.glyph}</span>
              <span style={{ flex: 1, minWidth: 0, color: 'var(--color-neutral-400)' }}>{row.label}</span>
              <span style={{ flex: 'none', color: row.color }}>{row.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--color-neutral-900)', padding: '9px 14px 11px' }}>
        <div style={{ ...KICKER, fontSize: '9.5px', marginBottom: '5px' }}>NEXT UNBLOCK</div>
        <div data-testid="next-unblock" style={{ fontSize: '10.5px', color: 'var(--color-neutral-300)', lineHeight: 1.5 }}>
          {nextUnblock(tasks)}
        </div>
      </div>
    </div>
  );
}

const COLUMNS = [
  { key: 'AGENT', width: '176px' },
  { key: 'TRYING TO', width: '290px' },
  { key: 'NOW', width: '230px' },
  { key: 'LAST REPORTED', width: undefined },
  { key: 'CONTEXT', width: '96px' },
] as const;

function cell(width: string | undefined): CSSProperties {
  return width
    ? { flex: 'none', width, minWidth: 0 }
    : { flex: 1, minWidth: 0 };
}

function AgentRow({
  row, isFocused, onOpen,
}: {
  row: ReturnType<typeof overviewRow>;
  isFocused: boolean;
  onOpen: (name: string) => void;
}) {
  const [hover, setHover] = useState(false);
  const { agent } = row;
  const status = AGENT_STATUS[agent.status];
  const display = useCast().asChar(agent.name).display;
  const chipColor =
    agent.status === 'plan_pending' ? 'var(--warn)'
      : agent.status === 'failed' ? 'var(--fail)'
        : 'var(--color-neutral-500)';
  const pct = agent.contextLimit > 0
    ? Math.min(100, (agent.contextTokens / agent.contextLimit) * 100)
    : 0;

  return (
    <div
      data-testid="overview-row"
      role="button"
      tabIndex={0}
      aria-current={isFocused}
      onClick={() => onOpen(agent.name)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(agent.name);
        }
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        gap: '10px',
        padding: '9px 12px',
        borderBottom: '1px solid var(--color-neutral-900)',
        cursor: 'pointer',
        background: isFocused ? 'var(--color-accent-900)' : hover ? 'var(--color-neutral-900)' : 'transparent',
        opacity: isDormant(agent.status) ? DORMANT_OPACITY : 1,
      }}
    >
      <div style={{ ...cell(COLUMNS[0].width), display: 'flex', gap: '8px' }}>
        <Portrait agent={agent} />
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1px' }}>
          <div style={{ display: 'flex', gap: '5px', alignItems: 'baseline' }}>
            <StatusGlyph status={agent.status} size={10} />
            <span data-testid="overview-name" style={{ ...ELLIPSIS, color: 'var(--color-text)', fontWeight: 500, fontSize: '12px' }}>
              {display}
            </span>
          </div>
          <span style={{ fontSize: '9.5px', color: status.color }}>{status.label}</span>
          <span style={{ ...ELLIPSIS, fontSize: '9.5px', color: 'var(--color-neutral-600)' }}>
            {`${agent.agentType || 'teammate'} · ${agent.model}`}
          </span>
        </div>
      </div>

      <div style={{ ...cell(COLUMNS[1].width), display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {row.task ? (
          <>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'baseline' }}>
              <span
                data-testid="row-task-id"
                style={{
                  flex: 'none',
                  fontSize: '9.5px',
                  padding: '1px 6px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-neutral-800)',
                  color: chipColor,
                }}
              >
                {row.task.id}
              </span>
              <span style={{ ...ELLIPSIS, flex: 1, fontSize: '11px', color: 'var(--color-neutral-300)' }}>
                {row.task.subject}
              </span>
            </div>
            {row.activeForm && (
              <span data-testid="row-active-form" style={{ fontSize: '10.5px', color: 'var(--color-neutral-500)' }}>
                {row.activeForm}
              </span>
            )}
          </>
        ) : (
          <>
            <span style={{ fontSize: '11px', color: 'var(--color-neutral-600)' }}>—</span>
            <span data-testid="row-idle-note" style={{ fontSize: '10.5px', color: 'var(--color-neutral-500)' }}>
              {row.idleNote}
            </span>
          </>
        )}
      </div>

      <div style={{ ...cell(COLUMNS[2].width), display: 'flex', flexDirection: 'column', gap: '3px' }}>
        <span data-testid="row-now" style={{ ...ELLIPSIS, fontSize: '10.5px', color: 'var(--color-neutral-300)' }}>
          {row.now}
        </span>
        <span style={{ fontSize: '9.5px', color: 'var(--color-neutral-600)' }}>
          {row.nowNote ?? <>for <Elapsed startedAt={agent.turnStartedAt ?? agent.startedAt} /></>}
        </span>
      </div>

      <div style={{ ...cell(COLUMNS[3].width), display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {row.last ? (
          <>
            <div style={{ display: 'flex', gap: '6px', minWidth: 0 }}>
              <span
                data-testid="row-last-kind"
                style={{ flex: 'none', fontSize: '10.5px', color: row.last.toLead ? 'var(--color-accent-400)' : 'var(--color-neutral-600)' }}
              >
                {row.last.kind}
              </span>
              <span style={{ ...ELLIPSIS, flex: 1, fontSize: '10.5px', color: 'var(--color-neutral-300)' }}>
                {row.last.text}
              </span>
            </div>
            <span style={{ fontSize: '9.5px', color: 'var(--color-neutral-600)' }}>
              {`${briefAge(Math.max(0, Date.now() - row.last.ts))} ago`}
            </span>
          </>
        ) : (
          <span style={{ fontSize: '10.5px', color: 'var(--color-neutral-600)' }}>nothing reported yet</span>
        )}
      </div>

      <div style={{ ...cell(COLUMNS[4].width), display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-end' }}>
        <span data-testid="row-context" style={{ fontSize: '10px', color: 'var(--color-neutral-500)' }}>
          {`${formatTokens(agent.contextTokens)}/${formatTokens(agent.contextLimit)}`}
        </span>
        <div data-testid="row-meter" style={{ width: '96px', height: '4px', background: 'var(--term)' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: 'var(--color-accent-600)' }} />
        </div>
        <span style={{ fontSize: '9.5px', color: 'var(--color-neutral-600)' }}>
          <Elapsed startedAt={agent.startedAt} /> · {costLabel(agent.costUsd)}
        </span>
      </div>
    </div>
  );
}

export function Overview({
  agents, tasks, mail, needsYou, brief, sessionId, startedAt, focused, onOpenWall, now, readOnly, solo,
}: {
  agents: Agent[];
  tasks: Task[];
  mail: MailMessage[];
  needsYou: NeedsYouItem[];
  brief?: Brief;
  sessionId: string;
  startedAt: number;
  focused: string | null;
  /** A row is a way into the wall — the click sets the focused agent and switches. */
  onOpenWall: (name: string) => void;
  now: number;
  readOnly: boolean;
  /** The wall pill labels itself `stream` on a solo session; the footer follows. */
  solo?: boolean;
}) {
  const roster = wallOrder(agents);
  const wallName = solo ? 'stream' : 'wall';

  return (
    <NowContext value={now}>
      <div
        data-testid="overview"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          background: 'var(--term)',
          padding: '12px 14px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', gap: '10px', alignItems: 'stretch' }}>
          <BriefPanel
            brief={brief}
            agents={roster}
            tasks={tasks}
            sessionId={sessionId}
            now={now}
            readOnly={readOnly}
          />
          <WhereItStands
            roster={roster}
            tasks={tasks}
            needsYou={needsYou}
            startedAt={startedAt}
            now={now}
          />
        </div>

        <div style={PANEL}>
          <div
            style={{
              display: 'flex',
              gap: '10px',
              padding: '8px 12px',
              borderBottom: '1px solid var(--color-neutral-900)',
              fontSize: '9px',
              letterSpacing: '.07em',
              color: 'var(--color-neutral-700)',
            }}
          >
            {COLUMNS.map((c) => (
              <span key={c.key} style={{ ...cell(c.width), textAlign: c.key === 'CONTEXT' ? 'right' : 'left' }}>
                {c.key}
              </span>
            ))}
          </div>
          {roster.map((agent) => (
            <AgentRow
              key={agent.name}
              row={overviewRow(agent, tasks, mail)}
              isFocused={agent.name === focused}
              onOpen={onOpenWall}
            />
          ))}
        </div>

        <div
          data-testid="overview-footer"
          style={{ display: 'flex', gap: '14px', fontSize: '10px', color: 'var(--color-neutral-600)' }}
        >
          <span>{`click a row → open it in the ${wallName}`}</span>
          <span>{`⌘1 ${wallName}`}</span>
          <span style={{ flex: 1 }} />
          {needsYou.length > 0 && (
            <span style={{ color: 'var(--warn)' }}>
              {`${needsYou.length} agent${needsYou.length === 1 ? '' : 's'} waiting on you`}
            </span>
          )}
        </div>
      </div>
    </NowContext>
  );
}
