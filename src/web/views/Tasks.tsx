import { useState, type CSSProperties, type ReactNode } from 'react';
import type { Task, TaskState } from '../../shared/domain';
import { TASK_STATUS } from '../../shared/status';
import { useCast } from '../state/useCast';

// Task completion is countable — done over total — so a bar is honest here in
// a way a per-task percentage never would be. It is segmented by STATE rather
// than by an estimate, and `blocked` folds in plan approval and failed so the
// four segments always sum to the task count.
const SEGMENTS: Array<{ label: string; color: string; states: TaskState[] }> = [
  { label: 'completed', color: 'var(--color-accent-500)', states: ['completed'] },
  { label: 'in progress', color: 'var(--color-accent-300)', states: ['in_progress'] },
  { label: 'blocked', color: 'var(--warn)', states: ['blocked', 'plan_pending', 'failed'] },
  { label: 'pending', color: 'var(--color-neutral-800)', states: ['pending'] },
];

// The ladder every task actually climbs. A percentage would be invented — an
// agent never reports how far through a task it is — but the step it has
// reached is observable.
const LADDER = 'created → unblocked → claimed → completed';

const STEP: Record<TaskState, number> = {
  blocked: 1,
  pending: 2,
  in_progress: 3,
  plan_pending: 3,
  failed: 3,
  completed: 4,
};

const STEP_FILL: Partial<Record<TaskState, string>> = {
  completed: 'var(--color-accent-500)',
  blocked: 'var(--warn)',
  failed: 'var(--fail)',
};

const STEP_EMPTY = 'var(--color-neutral-900)';

const COLUMN_HEAD: CSSProperties = {
  display: 'flex',
  gap: '10px',
  padding: '10px 16px 8px',
  color: 'var(--color-neutral-600)',
  fontSize: '10.5px',
  letterSpacing: '.12em',
  borderBottom: '1px solid var(--color-neutral-900)',
};

// Headers over a blank pane read as broken, not as empty — a team that never
// touched the shared list looks exactly like a console that failed to read it.
// Same register as the rest of the chrome: `nothing waiting`, `no live teams`.
const EMPTY: CSSProperties = {
  padding: '14px 16px',
  color: 'var(--color-neutral-600)',
  fontSize: '11px',
};

export const STRIP: CSSProperties = {
  padding: '11px 16px 10px',
  borderBottom: '1px solid var(--color-neutral-900)',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  flex: 'none',
};

export const BAR: CSSProperties = {
  display: 'flex',
  height: '7px',
  borderRadius: '4px',
  overflow: 'hidden',
  background: 'var(--color-neutral-900)',
};

const FOOTER: CSSProperties = {
  borderTop: '1px solid var(--color-neutral-900)',
  padding: '9px 16px',
  display: 'flex',
  gap: '14px',
  color: 'var(--color-neutral-600)',
  fontSize: '10.5px',
};

function stepTitle(task: Task): string {
  const open = task.openBlockedBy ?? task.blockedBy;
  const deps = task.blockedBy.length
    ? ` · ${task.blockedBy.length - open.length} of ${task.blockedBy.length} dependencies done`
    : '';
  return `${LADDER} · at step ${STEP[task.state]} of 4${deps}`;
}

// The board's columns are the same ladder the STATE stepper climbs, keyed off
// the same derived state, so a card can never sit where its row disagrees.
// Plan approval and failed are claimed work: they stay in progress, flagged.
const BOARD: Array<{ label: string; color: string; sub: string; states: TaskState[] }> = [
  { label: 'blocked', color: 'var(--warn)', sub: 'waiting on a dependency', states: ['blocked'] },
  { label: 'ready', color: 'var(--color-neutral-400)', sub: 'unblocked, not claimed', states: ['pending'] },
  {
    label: 'in progress',
    color: 'var(--color-accent-300)',
    sub: 'claimed by an agent',
    states: ['in_progress', 'plan_pending', 'failed'],
  },
  { label: 'completed', color: 'var(--color-accent-500)', sub: '', states: ['completed'] },
];

const CARD_EDGE: Partial<Record<TaskState, string>> = {
  plan_pending: 'var(--warn)',
  failed: 'var(--fail)',
};

const CARD_TINT: Partial<Record<TaskState, string>> = {
  blocked: 'var(--warn)',
  completed: 'var(--color-accent-500)',
};

type TaskView = 'rows' | 'board';

// View-local and per operator, like the appearance settings: the team being
// watched has no say in how this machine prefers to read its list.
export const TASK_VIEW_KEY = 'console.tasks.view';

function readTaskView(): TaskView {
  try {
    return window.localStorage.getItem(TASK_VIEW_KEY) === 'rows' ? 'rows' : 'board';
  } catch {
    return 'board';
  }
}

function needs(task: Task): string {
  if (task.blockedBy.length === 0) return '';
  const open = task.openBlockedBy ?? task.blockedBy;
  return `needs ${task.blockedBy.join(', ')} · ${task.blockedBy.length - open.length}/${task.blockedBy.length} done`;
}

function ViewToggle({ view, onChange }: { view: TaskView; onChange: (view: TaskView) => void }) {
  return (
    <div style={{ display: 'flex', gap: '2px', flex: 'none' }}>
      {(['board', 'rows'] as const).map((mode) => {
        const on = mode === view;
        return (
          <button
            key={mode}
            type="button"
            data-testid="tasks-view-toggle"
            aria-pressed={on}
            onClick={() => onChange(mode)}
            style={{
              padding: '1px 8px',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              font: 'inherit',
              fontSize: '11px',
              whiteSpace: 'nowrap',
              boxShadow: `inset 0 0 0 1px ${on ? 'var(--color-accent-700)' : 'transparent'}`,
              background: on ? 'var(--color-accent-900)' : 'transparent',
              color: on ? 'var(--color-accent-300)' : 'var(--color-neutral-600)',
            }}
          >
            {mode}
          </button>
        );
      })}
    </div>
  );
}

function Board({ tasks }: { tasks: Task[] }) {
  const { asChar } = useCast();
  return (
    <div
      data-testid="tasks-board"
      className="tscroll"
      style={{
        flex: 1,
        minHeight: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        gap: '10px',
        padding: '12px 16px',
        alignItems: 'start',
      }}
    >
      {BOARD.map((column) => {
        const cards = tasks.filter((t) => column.states.includes(t.state));
        return (
          <div
            key={column.label}
            data-testid="board-column"
            style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}
          >
            <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline', padding: '0 2px 4px' }}>
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '2px',
                  background: column.color,
                  flex: 'none',
                  alignSelf: 'center',
                }}
              />
              <span style={{ color: 'var(--color-text)', fontSize: '11.5px', whiteSpace: 'nowrap' }}>
                {column.label}
              </span>
              <span data-testid="board-count" style={{ color: 'var(--color-neutral-500)', fontSize: '10.5px' }}>
                {cards.length}
              </span>
              <span style={{ flex: 1 }} />
              <span
                style={{
                  color: 'var(--color-neutral-700)',
                  fontSize: '9.5px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  minWidth: 0,
                }}
              >
                {column.sub}
              </span>
            </div>

            {cards.map((task) => {
              const flagged = task.state === 'plan_pending' || task.state === 'failed';
              return (
                <div
                  key={task.id}
                  data-testid="board-card"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '5px',
                    padding: '8px 10px',
                    background: CARD_TINT[task.state]
                      ? `color-mix(in srgb, ${CARD_TINT[task.state]} 8%, var(--color-bg))`
                      : 'var(--color-bg)',
                    border: `1px solid ${CARD_EDGE[task.state] ?? 'var(--color-neutral-900)'}`,
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                    <span style={{ color: 'var(--color-neutral-600)', fontSize: '10.5px' }}>{task.id}</span>
                    {flagged && (
                      <span
                        data-testid="card-note"
                        style={{ color: TASK_STATUS[task.state].color, fontSize: '10px', whiteSpace: 'nowrap' }}
                      >
                        {TASK_STATUS[task.state].label}
                      </span>
                    )}
                    <span style={{ flex: 1 }} />
                    <span
                      style={{
                        color: task.metadata?.model ? 'var(--color-neutral-500)' : 'var(--color-neutral-700)',
                        fontSize: '10px',
                      }}
                    >
                      {task.metadata?.model ?? '—'}
                    </span>
                  </div>
                  <span style={{ color: 'var(--color-neutral-300)', fontSize: '11.5px', lineHeight: 1.45, textWrap: 'pretty' }}>
                    {task.subject}
                  </span>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline', fontSize: '10px' }}>
                    <span style={{ color: 'var(--color-neutral-500)', whiteSpace: 'nowrap' }}>
                      {task.owner ? asChar(task.owner).display : 'unassigned'}
                    </span>
                    <span style={{ flex: 1 }} />
                    <span
                      data-testid="card-deps"
                      style={{
                        color: 'var(--color-neutral-600)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        minWidth: 0,
                      }}
                    >
                      {needs(task)}
                    </span>
                  </div>
                </div>
              );
            })}

            {cards.length === 0 && (
              <span
                style={{
                  padding: '10px',
                  border: '1px dashed var(--color-neutral-900)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--color-neutral-700)',
                  fontSize: '10.5px',
                }}
              >
                none
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ProgressStrip({ tasks, toggle }: { tasks: Task[]; toggle: ReactNode }) {
  // One count feeds both the legend number and the segment width, so the
  // drawing cannot contradict the figure printed beside it.
  const counts = SEGMENTS.map((s) => tasks.filter((t) => s.states.includes(t.state)).length);
  const done = counts[0];

  return (
    <div style={STRIP}>
      <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'nowrap', gap: '10px' }}>
        {toggle}
        <span style={{ color: 'var(--color-neutral-600)', fontSize: '10px', letterSpacing: '.12em', flex: 'none' }}>
          PROGRESS
        </span>
        <span data-testid="progress-pct" style={{ color: 'var(--color-text)', fontSize: '12px', flex: 'none' }}>
          {`${Math.round((done / tasks.length) * 100)}%`}
        </span>
        <span
          data-testid="progress-count"
          style={{ color: 'var(--color-neutral-600)', fontSize: '10.5px', flex: 'none', whiteSpace: 'nowrap' }}
        >
          {`${done} of ${tasks.length} done`}
        </span>
        <span style={{ flex: 1, minWidth: '8px' }} />
        <div style={{ display: 'flex', gap: '12px', flex: 'none' }}>
          {SEGMENTS.map((segment, i) => (
            <span
              key={segment.label}
              style={{ display: 'flex', gap: '5px', alignItems: 'center', whiteSpace: 'nowrap' }}
            >
              <span
                style={{ width: '7px', height: '7px', borderRadius: '2px', background: segment.color, flex: 'none' }}
              />
              <span style={{ color: 'var(--color-neutral-600)', fontSize: '10px' }}>{segment.label}</span>
              <span data-testid="legend-count" style={{ color: 'var(--color-neutral-500)', fontSize: '10px' }}>
                {counts[i]}
              </span>
            </span>
          ))}
        </div>
      </div>

      <div style={BAR}>
        {SEGMENTS.map((segment, i) => (
          <span
            key={segment.label}
            data-testid="progress-segment"
            style={{ width: `${(counts[i] / tasks.length) * 100}%`, background: segment.color }}
          />
        ))}
      </div>
    </div>
  );
}

export function Tasks({
  tasks, teamName,
}: {
  tasks: Task[];
  teamName: string;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [view, setView] = useState<TaskView>(readTaskView);
  const pickView = (next: TaskView) => {
    setView(next);
    try {
      window.localStorage.setItem(TASK_VIEW_KEY, next);
    } catch {
      // A blocked store costs the remembered choice, nothing else.
    }
  };
  // The OWNER cell only. Ids, states and dependency ids are readouts.
  const { asChar } = useCast();

  return (
    <div data-testid="tasks" style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {tasks.length > 0 && (
          <ProgressStrip tasks={tasks} toggle={<ViewToggle view={view} onChange={pickView} />} />
        )}

        {view === 'board' && tasks.length > 0 ? <Board tasks={tasks} /> : <>
        <div style={COLUMN_HEAD}>
          <span style={{ width: '44px' }}>TASK</span>
          <span style={{ flex: 1 }}>DESCRIPTION</span>
          <span style={{ width: '118px' }}>STATE</span>
          <span style={{ width: '60px' }}>MODEL</span>
          <span style={{ width: '80px' }}>OWNER</span>
          <span style={{ width: '76px' }}>DEPENDS ON</span>
        </div>

        <div
          className="tscroll"
          style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
        >
          {tasks.map((task) => {
            const state = TASK_STATUS[task.state];
            return (
              <div
                key={task.id}
                data-testid="task-row"
                style={{
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'baseline',
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--color-neutral-900)',
                  fontSize: '11.5px',
                  background: hovered === task.id ? 'var(--color-bg)' : 'transparent',
                }}
                onMouseEnter={() => setHovered(task.id)}
                onMouseLeave={() => setHovered((h) => (h === task.id ? null : h))}
              >
                <span style={{ width: '44px', color: 'var(--color-neutral-600)' }}>{task.id}</span>
                <span
                  data-testid="task-description"
                  style={{
                    flex: 1,
                    color: 'var(--color-neutral-300)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {task.subject}
                </span>
                <span
                  data-testid="task-state"
                  title={stepTitle(task)}
                  style={{
                    width: '118px',
                    display: 'flex',
                    gap: '7px',
                    alignItems: 'center',
                    color: state.color,
                  }}
                >
                  <span style={{ display: 'flex', gap: '1px', flex: 'none' }}>
                    {[1, 2, 3, 4].map((cell) => (
                      <span
                        key={cell}
                        data-testid="step-cell"
                        style={{
                          width: '5px',
                          height: '9px',
                          borderRadius: '1px',
                          background: cell <= STEP[task.state]
                            ? STEP_FILL[task.state] ?? 'var(--color-accent-300)'
                            : STEP_EMPTY,
                        }}
                      />
                    ))}
                  </span>
                  <span
                    style={{
                      fontSize: '11px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {state.label}
                  </span>
                </span>
                <span
                  data-testid="task-model"
                  style={{ width: '60px', color: task.metadata?.model ? 'var(--color-neutral-500)' : 'var(--color-neutral-700)' }}
                >
                  {task.metadata?.model ?? '—'}
                </span>
                <span data-testid="task-owner" style={{ width: '80px', color: 'var(--color-neutral-500)' }}>
                  {task.owner ? asChar(task.owner).display : 'unassigned'}
                </span>
                <span
                  data-testid="task-deps"
                  style={{
                    width: '76px',
                    color: 'var(--color-neutral-600)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {task.blockedBy.length > 0 ? task.blockedBy.join(', ') : '—'}
                </span>
              </div>
            );
          })}

          {tasks.length === 0 && (
            <div data-testid="tasks-empty" style={EMPTY}>
              no tasks — this team hasn&apos;t used the shared list
            </div>
          )}
        </div>
        </>}

        <div data-testid="tasks-footer" style={FOOTER}>
          <span>{`~/.claude/tasks/${teamName}/`}</span>
          <span style={{ flex: 1 }} />
          <span>claiming is file-locked · completing a task unblocks its dependents · cards move when the file does</span>
        </div>
      </div>

    </div>
  );
}
