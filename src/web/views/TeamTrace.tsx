import type { CSSProperties } from 'react';
import type { Agent, MailMessage, Task } from '../../shared/domain';
import { AGENT_STATUS, DORMANT_OPACITY, isDormant } from '../../shared/status';
import { briefAge, contextBar, ctxLabel, formatCost, formatElapsed, formatTokens } from '../format';
import { useCast } from '../state/useCast';
import { overviewRow } from './overview-rows';
import { laneMarks, laneSegments, type LaneMark, type LanePhase } from './team-trace';
import { Stat, TYPE_BADGE, axisTicks, tickLabel } from './Trace';

const AGENT_CELL_WIDTH = 300;
const TOKENS_CELL_WIDTH = 66;
const LANE_HEIGHT = 26;
const RULE = '1px solid var(--color-neutral-900)';
const MUTED = 'var(--color-neutral-600)';

// Canvas `1a`: a failed stretch draws no bar — its ✗ mark is the record.
const PHASE: Record<LanePhase, { color: string; opacity: number; label: string }> = {
  working: { color: 'var(--color-accent-500)', opacity: 0.72, label: 'working' },
  idle: { color: 'var(--color-neutral-700)', opacity: 1, label: 'idle' },
  waiting: { color: 'var(--warn)', opacity: 0.7, label: 'waiting on you' },
  failed: { color: 'transparent', opacity: 0, label: 'failed' },
};

const MARK: Record<LaneMark['kind'], { glyph: string; color: string; size: number; label: string }> = {
  spawn: { glyph: '⟂', color: 'var(--color-neutral-500)', size: 10, label: 'spawned' },
  msg: { glyph: '↑', color: 'var(--color-accent-300)', size: 11, label: 'message to lead' },
  peer: { glyph: '⇄', color: 'var(--color-accent-300)', size: 10, label: 'message to a teammate' },
  fail: { glyph: '✗', color: 'var(--fail)', size: 11, label: 'tool error' },
  departed: { glyph: '⊗', color: 'var(--color-neutral-500)', size: 11, label: 'departed' },
};

const SMALL_BUTTON: CSSProperties = {
  border: '1px solid var(--color-neutral-800)',
  color: 'var(--color-neutral-500)',
  borderRadius: 'var(--radius-sm)',
  padding: '1px 7px',
  fontSize: '10px',
};

export interface TeamTraceProps {
  agents: Agent[];
  tasks: Task[];
  mail: MailMessage[];
  /** The session clock's zero — `TeamState.startedAt`. */
  startedAt: number;
  now: number;
  /** The focused agent: its lane is lit and the detail strip is its own. */
  focused: string | null;
  onFocus(name: string): void;
  onOpenWall(name: string): void;
  onOpenMail(name: string): void;
}

/**
 * Canvas `1a`: the team on the session clock, the way `8a` does it for
 * subagents — one lifeline per teammate under the lead, in spawn order. The bar
 * is the agent's state over time; the marks are the events the other views only
 * report as text. It replaces the rail, whose list-plus-transcript the wall
 * already covers.
 */
export function TeamTrace({ agents, tasks, mail, startedAt, now, focused, onFocus, onOpenWall, onOpenMail }: TeamTraceProps) {
  const cast = useCast();
  const display = (name: string) => cast.asChar(name).display;
  const ordered = [...agents].sort((a, b) => Number(b.isLead) - Number(a.isLead) || a.startedAt - b.startedAt);
  const start = Math.min(startedAt || now, ...agents.map((a) => a.startedAt).filter((t) => t > 0));
  const span = Math.max(1, now - start);
  const pct = (t: number) => Math.max(0, Math.min(100, ((t - start) / span) * 100));
  const clock = (t: number) => tickLabel(t - start, span);
  const lanes = ordered.map((agent) => {
    const segments = laneSegments(agent, now);
    return { agent, segments, marks: laneMarks(agent, agents, mail, segments) };
  });
  const focus = ordered.find((a) => a.name === focused) ?? ordered[0];
  const row = focus ? overviewRow(focus, tasks, mail) : null;
  const waiting = agents.filter((a) => a.status === 'plan_pending' || a.status === 'asking').length;
  const ticks = axisTicks(span);

  const markTitle = (m: LaneMark): string => {
    const what =
      m.kind === 'spawn' ? `spawned ${display(m.name)}`
        : m.kind === 'fail' ? m.text
          : m.kind === 'departed' ? 'departed'
            : `→ ${display(m.to)}: ${m.topic}`;
    return `${clock(m.at)} · ${what}`;
  };

  return (
    <div data-testid="team-trace" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div
        data-testid="team-trace-header"
        style={{ display: 'flex', gap: '26px', alignItems: 'baseline', padding: '11px 14px 9px', borderBottom: RULE, flex: 'none' }}
      >
        <Stat testid="team-trace-count" label="TEAMMATES" value={String(agents.length)} />
        <Stat
          testid="team-trace-working"
          label="WORKING"
          value={String(agents.filter((a) => a.status === 'working').length)}
          color="var(--color-accent-300)"
        />
        <Stat testid="team-trace-waiting" label="WAITING ON YOU" value={String(waiting)} color={waiting ? 'var(--warn)' : undefined} />
        <Stat testid="team-trace-messages" label="MESSAGES" value={String(mail.length)} />
        <Stat testid="team-trace-tokens" label="TOKENS" value={formatTokens(agents.reduce((n, a) => n + a.contextTokens, 0))} />
        <Stat testid="team-trace-spend" label="SPEND" value={formatCost(agents.reduce((n, a) => n + a.costUsd, 0))} />
        <span style={{ flex: 1 }} />
        <span style={{ color: MUTED, fontSize: '10.5px', maxWidth: '300px', textWrap: 'pretty', lineHeight: 1.45 }}>
          one lane per teammate on the session clock — where each one has been, when it spoke, and who is still moving
        </span>
      </div>

      <div className="tscroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 14px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', paddingBottom: '7px' }}>
          <span style={{ width: `${AGENT_CELL_WIDTH}px`, flex: 'none', color: MUTED, fontSize: '9.5px', letterSpacing: '.06em' }}>AGENT</span>
          <div style={{ flex: 1, position: 'relative', height: '12px' }}>
            {ticks.map((tick) => (
              <span
                key={tick.label}
                style={{ position: 'absolute', left: `${tick.at}%`, top: 0, color: 'var(--color-neutral-700)', fontSize: '9.5px', whiteSpace: 'nowrap' }}
              >
                {tick.label}
              </span>
            ))}
            <span data-testid="team-trace-now" style={{ position: 'absolute', right: 0, top: 0, color: 'var(--color-accent-400)', fontSize: '9.5px', whiteSpace: 'nowrap' }}>
              {`now ${clock(now)}`}
            </span>
          </div>
          <span style={{ width: `${TOKENS_CELL_WIDTH}px`, flex: 'none', textAlign: 'right', color: MUTED, fontSize: '9.5px', letterSpacing: '.06em' }}>
            TOKENS
          </span>
        </div>

        <div data-testid="team-trace-lanes" role="listbox" aria-label="teammates on the session clock">
          {lanes.map(({ agent, segments, marks }) => {
            const status = AGENT_STATUS[agent.status];
            return (
              <div
                key={agent.name}
                data-testid="team-trace-lane"
                role="option"
                aria-selected={agent === focus}
                onClick={() => onFocus(agent.name)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  height: `${LANE_HEIGHT}px`,
                  cursor: 'pointer',
                  background: agent === focus ? 'var(--color-bg)' : undefined,
                  opacity: isDormant(agent.status) ? DORMANT_OPACITY : 1,
                }}
              >
                <div
                  style={{
                    width: `${AGENT_CELL_WIDTH}px`,
                    flex: 'none',
                    paddingLeft: agent.isLead ? '4px' : '18px',
                    paddingRight: '10px',
                    display: 'flex',
                    gap: '6px',
                    alignItems: 'center',
                    overflow: 'hidden',
                  }}
                >
                  {!agent.isLead && <span aria-hidden style={{ color: 'var(--color-neutral-700)', flex: 'none' }}>└</span>}
                  <span style={{ color: status.color, fontSize: '10px', flex: 'none' }}>{status.glyph}</span>
                  <span
                    data-testid="team-trace-lane-name"
                    style={{ fontSize: '11px', fontWeight: agent.isLead ? 500 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {display(agent.name)}
                  </span>
                  {agent.agentType && <span style={TYPE_BADGE}>{agent.agentType}</span>}
                  <span style={{ color: MUTED, fontSize: '10px', flex: 'none' }}>{agent.model}</span>
                </div>
                <div style={{ flex: 1, position: 'relative', height: `${LANE_HEIGHT}px`, background: agent.isLead ? 'var(--color-accent-900)' : undefined }}>
                  {ticks.map((tick) => (
                    <div key={tick.label} aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, left: `${tick.at}%`, width: '1px', background: 'var(--color-neutral-900)' }} />
                  ))}
                  {segments.map((seg) => (
                    <div
                      key={seg.from}
                      data-testid="team-trace-segment"
                      data-phase={seg.phase}
                      title={`${PHASE[seg.phase].label} · ${clock(seg.from)} → ${seg.to >= now ? 'now' : clock(seg.to)}`}
                      style={{
                        position: 'absolute',
                        top: '9px',
                        left: `${pct(seg.from)}%`,
                        width: `${Math.max(0, pct(seg.to) - pct(seg.from))}%`,
                        height: '8px',
                        borderRadius: '2px',
                        background: PHASE[seg.phase].color,
                        opacity: PHASE[seg.phase].opacity,
                      }}
                    />
                  ))}
                  {marks.map((m, i) => (
                    <span
                      key={i}
                      data-testid="team-trace-mark"
                      data-kind={m.kind}
                      title={markTitle(m)}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: `${pct(m.at)}%`,
                        transform: 'translateX(-50%)',
                        color: MARK[m.kind].color,
                        fontSize: `${MARK[m.kind].size}px`,
                        lineHeight: `${LANE_HEIGHT}px`,
                        cursor: 'help',
                      }}
                    >
                      {MARK[m.kind].glyph}
                    </span>
                  ))}
                </div>
                <div style={{ width: `${TOKENS_CELL_WIDTH}px`, flex: 'none', textAlign: 'right', paddingRight: '10px', color: 'var(--color-neutral-500)', fontSize: '10.5px' }}>
                  {formatTokens(agent.contextTokens)}
                </div>
              </div>
            );
          })}
        </div>

        <div
          style={{ display: 'flex', gap: '14px', alignItems: 'center', padding: `12px 0 4px ${AGENT_CELL_WIDTH}px`, color: MUTED, fontSize: '9.5px', flexWrap: 'wrap' }}
        >
          {(['working', 'idle', 'waiting'] as const).map((phase) => (
            <span key={phase} style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
              <span style={{ width: '14px', height: '6px', borderRadius: '2px', background: PHASE[phase].color, opacity: PHASE[phase].opacity }} />
              {PHASE[phase].label}
            </span>
          ))}
          {(['fail', 'msg', 'peer', 'spawn', 'departed'] as const).map((kind) => (
            <span key={kind} style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
              <span style={{ color: MARK[kind].color, fontSize: '10px' }}>{MARK[kind].glyph}</span>
              {MARK[kind].label}
            </span>
          ))}
          <span style={{ flex: 1 }} />
          <span>hover a mark for what was said</span>
        </div>
      </div>

      {focus && row && (
        <div
          data-testid="team-trace-detail"
          style={{ borderTop: RULE, padding: '11px 14px', display: 'flex', flexDirection: 'column', gap: '7px', flex: 'none' }}
        >
          <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
            <span style={{ color: AGENT_STATUS[focus.status].color, fontSize: '10px' }}>{AGENT_STATUS[focus.status].glyph}</span>
            <span data-testid="team-trace-detail-name" style={{ fontSize: '12.5px' }}>{display(focus.name)}</span>
            {focus.agentType && <span style={TYPE_BADGE}>{focus.agentType}</span>}
            <span style={{ color: MUTED, fontSize: '10.5px' }}>{focus.model}</span>
            <span style={{ flex: 1 }} />
            <span data-testid="team-trace-detail-since" style={{ color: MUTED, fontSize: '10.5px' }}>
              {focus.isLead
                ? `session started ${formatElapsed(now - start)} ago`
                : `spawned ${formatElapsed(now - focus.startedAt)} ago · ${AGENT_STATUS[focus.status].label}`}
            </span>
          </div>
          <div data-testid="team-trace-detail-task" style={{ display: 'flex', gap: '8px', alignItems: 'baseline', color: 'var(--color-neutral-500)', fontSize: '11px' }}>
            <span style={{ color: 'var(--color-accent-300)', flex: 'none' }}>{row.task?.id ?? '—'}</span>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.task?.subject ?? row.idleNote}</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
            <span style={{ color: 'var(--color-accent-500)', letterSpacing: '-.5px' }}>{contextBar(focus.contextTokens, focus.contextLimit)}</span>
            <span style={{ color: 'var(--color-neutral-500)', fontSize: '10.5px' }}>{ctxLabel(focus.contextTokens, focus.contextLimit)}</span>
            <span style={{ color: MUTED, fontSize: '10px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{`now: ${row.now}`}</span>
          </div>
          <div style={{ display: 'flex', gap: '7px', alignItems: 'baseline' }}>
            <span style={{ color: 'var(--color-accent-500)' }}>⎿</span>
            <span data-testid="team-trace-detail-last" style={{ color: 'var(--color-neutral-300)', fontSize: '11px', minWidth: 0 }}>{row.last?.text ?? '—'}</span>
            {row.last && (
              <span style={{ color: MUTED, fontSize: '10px', flex: 'none' }}>{`${row.last.kind} · ${briefAge(Math.max(0, now - row.last.ts))} ago`}</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button type="button" className="btn-neutral" data-testid="team-trace-open-wall" onClick={() => onOpenWall(focus.name)} style={SMALL_BUTTON}>
              open in wall
            </button>
            <button type="button" className="btn-neutral" data-testid="team-trace-open-mail" onClick={() => onOpenMail(focus.name)} style={SMALL_BUTTON}>
              {focus.isLead ? 'open comms' : `message ${display(focus.name)}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
