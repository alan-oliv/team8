import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { SessionRow } from '../../shared/domain';
import { postJson } from '../api';
import { diffStat, shortPath } from '../format';
import { useWatch } from '../state/useWatch';

// Derived, not chosen: 2 border + 12 padding + 120.03 ("session-" + 8 hex at the
// bar's 12.5px) + 6 gap + 6 caret. Fixed so a longer team name ellipsizes instead
// of shoving the view switcher sideways on the operator's own click.
const TRIGGER_WIDTH = '146px';

// Ruling 14. The reconcile turned each row into two lines — name over id,
// branch and diffstat — and that anatomy was sized for 520; 432 predates it.
const PANEL_WIDTH = '520px';

// The folder menu is narrower than the panel it hangs off, and starts under the
// chip that opens it — which is the left edge of the second header row, so the
// offset is that row's own padding.
const FOLDER_MENU_WIDTH = '288px';
const FOLDER_MENU_LEFT = '12px';

// The folder scope is a preference of this machine, not of one mount: the
// wall view and a workflow view each render their own TeamSelect, sharing no
// React state, so without persisting it here every navigation between them
// reset the operator back to every folder on the next open.
const FOLDER_KEY = 'console.folder';

/** The folder a pick stored — a bare absolute path, else nothing. */
export function readStoredFolder(): string | null {
  try {
    const raw = window.localStorage.getItem(FOLDER_KEY);
    return raw && raw.startsWith('/') ? raw : null;
  } catch {
    return null;
  }
}

function storeFolder(folder: string): void {
  try {
    window.localStorage.setItem(FOLDER_KEY, folder);
  } catch {
    // A full or disabled store costs the operator the preference on the next open.
  }
}

const folderBase = (path: string) => path.split('/').filter(Boolean).pop() ?? path;

/** Every folder with a live session in it, most rows first, then by name. */
export function foldersOf(rows: readonly SessionRow[]): { path: string; name: string; live: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.folder, (counts.get(r.folder) ?? 0) + 1);
  return [...counts]
    .map(([path, live]) => ({ path, name: folderBase(path), live }))
    .sort((a, b) => b.live - a.live || a.name.localeCompare(b.name));
}

/**
 * The folder in scope: the stored pick while something lives there, else the
 * folder of the row on screen — the one default under which that row is
 * always listed — else every row.
 */
export function scopeOf(rows: readonly SessionRow[], stored: string | null): string | null {
  if (stored && rows.some((r) => r.folder === stored)) return stored;
  return rows.find((r) => r.current)?.folder ?? null;
}

/** Busy first, then title, then id — the list's one order. */
export function byRow(a: SessionRow, b: SessionRow): number {
  return (
    Number(b.busy) - Number(a.busy) ||
    a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/**
 * The three session kinds the canvas knows, with the colours it gives them —
 * its own `KIND` table, transcribed. `subagents` is deliberately the quiet one:
 * a session with a subagent tree is still one operator's window, not a team.
 *
 * `solo` is ours. The canvas has no artboard for a window with nothing in it,
 * so it borrows the quietest pair rather than inventing a colour.
 */
export const KIND_STYLE: Record<string, { color: string; edge: string }> = {
  teammates: { color: 'var(--color-accent-300)', edge: 'var(--color-accent-700)' },
  subagents: { color: 'var(--color-neutral-400)', edge: 'var(--color-neutral-700)' },
  workflow: { color: 'var(--warn)', edge: 'var(--warn-edge)' },
  solo: { color: 'var(--color-neutral-400)', edge: 'var(--color-neutral-700)' },
};

/** What KIND a row is, by the same bar the console classifies on. */
export function kindOf(row: SessionRow): string {
  // A decided mode beats the evidence: it is the batch saying what it is.
  if (row.mode) return row.mode;
  if (row.members >= 2) return 'teammates';
  if (row.workflow) return 'workflow';
  return row.subagents ? 'subagents' : 'solo';
}

type Mark =
  | { kind: 'switching'; id: string; team?: string }
  | { kind: 'failed'; id: string }
  | { kind: 'gone'; id: string };

const MARK_TEXT = { switching: 'switching…', failed: 'switch failed', gone: 'gone' };
const MARK_COLOR = {
  switching: 'var(--color-accent-300)',
  failed: 'var(--fail)',
  gone: 'var(--fail)',
};

function agentCount(row: SessionRow): string {
  return `${row.members} agent${row.members === 1 ? '' : 's'}`;
}

// A solo session has no team directory, so the caller hands `current` over as
// the raw session uuid — the same thing a row's `id` holds.
const SESSION_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/;

function triggerName(current: string): string {
  return SESSION_UUID.test(current) ? `session-${current.slice(0, 8)}` : current;
}

export interface TeamSelectProps {
  /**
   * The id on the frame — a team name, or the session uuid when there is no
   * team. Names the trigger and closes the popover once a switch lands; which
   * ROW is on screen is the server's `current` flag, not a match on this.
   */
  current: string;
  /** What the operator called this session. Falls back to `current` when unnamed. */
  sessionName?: string;
  /**
   * What KIND of session this is — `teammates`, `subagents`, `solo`, `workflow`.
   * Canvas `4a`/`6a`/`8a` all draw it as an outlined pill inside the trigger,
   * ahead of the goal, and it is the only thing in the chrome that says which
   * of the four shapes you are looking at. The wordmark used to carry it by
   * reading `TEAM` or `RUN`, which could not name the other two.
   */
  mode?: string;
  open: boolean;
  onOpenChange(open: boolean): void;
  now: number;
  /** A session switch is loading on the server, which refuses another until it lands. */
  switching?: boolean;
  /** `state.sessions ?? []` — every live session, from the frame. */
  sessions: SessionRow[];
}

export function TeamSelect({ current, sessionName, mode, open, onOpenChange, switching, sessions }: TeamSelectProps) {
  const watch = useWatch();
  const [cursor, setCursor] = useState(0);
  const [mark, setMark] = useState<Mark | null>(null);
  const [picked, setPicked] = useState(readStoredFolder);
  const [foldersOpen, setFoldersOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const wrapper = useRef<HTMLDivElement>(null);

  const folders = foldersOf(sessions);
  const scope = scopeOf(sessions, picked);
  const rows = sessions.filter((r) => scope === null || r.folder === scope).sort(byRow);
  const cursorRow = rows[Math.min(cursor, rows.length - 1)];
  const folderSpan = scope ? 1 : folders.length;

  // The cursor lands on the row on screen each time the panel opens.
  useEffect(() => {
    if (open) {
      setCursor(Math.max(0, rows.findIndex((r) => r.current)));
      list.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close() {
    setMark(null);
    // Only one menu is ever open: opening the session dropdown puts the folder
    // menu away, and so does closing it.
    setFoldersOpen(false);
    onOpenChange(false);
    trigger.current?.focus();
  }

  // The 200 is an ack, not a repaint: the switch has landed when the frame
  // names the target — its session id for a bare session, its directory for
  // a team.
  useEffect(() => {
    if (mark?.kind === 'switching' && (current === mark.id || (mark.team !== undefined && current === mark.team))) close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, mark]);

  // Shut for the length of a switch: any pick made meanwhile would be refused.
  // Covers `⌘K` and the `t` key too, which open without going through the trigger.
  useEffect(() => {
    if (switching && open) close();
  }, [switching, open]);

  useEffect(() => {
    if (!open) return;
    // pointerdown, not click, so dismissal beats the focus move.
    function onPointerDown(e: PointerEvent) {
      if (!wrapper.current?.contains(e.target as Node)) close();
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, onOpenChange]);

  // Global, not gated on `open`, so ⌘K can open the picker from anywhere — and
  // re-focus the list once it is already open, since a row click can have
  // moved focus off it.
  useEffect(() => {
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (!e.metaKey || e.ctrlKey || e.altKey || e.key.toLowerCase() !== 'k') return;
      e.preventDefault();
      if (open) list.current?.focus();
      else onOpenChange(true);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  function select(row: SessionRow) {
    if (mark?.kind === 'switching') return;
    if (row.current) {
      // Reselecting the session you dismissed is how you resume watching it —
      // the picker's whole purpose is paging back in with one click.
      if (watch.dismissed) watch.watchAgain();
      close();
      return;
    }
    setMark({ kind: 'switching', id: row.id, ...(row.team ? { team: row.team } : {}) });
    postJson(`/api/select-session/${encodeURIComponent(row.id)}`)
      .then((res) => {
        if (!res.ok) {
          setMark({ kind: res.status === 404 ? 'gone' : 'failed', id: row.id });
          return;
        }
        // The path is the one durable selection (useTeamState.writeUrlState);
        // a reload lands back here. No page load: the frame is already moving.
        try {
          window.history.pushState(null, '', `/s/${encodeURIComponent(row.id)}`);
        } catch {
          // The switch has landed server-side regardless.
        }
      })
      .catch(() => setMark({ kind: 'failed', id: row.id }));
  }

  const runOf = (r: SessionRow) => (r.members < 2 ? r.workflow : undefined);

  function renderRow(row: SessionRow) {
    const isCurrent = row.current;
    // A dismissed session is still the current one server-side — just
    // not rendered — so its checkmark would contradict the "not
    // watching" text sitting right below it. Drop the mark instead.
    const notWatching = isCurrent && watch.dismissed;
    const run = runOf(row);
    const rowMark = mark?.id === row.id ? mark.kind : isCurrent && !notWatching ? 'current' : null;
    const rowId = row.team ?? `session-${row.id.slice(0, 8)}`;
    return (
      <div
        key={row.id}
        id={`team-option-${row.id}`}
        role="option"
        aria-selected={isCurrent}
        onClick={() => select(row)}
        style={{
          padding: '8px 10px',
          borderRadius: 'var(--radius-sm)',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          gap: '3px',
          background: isCurrent ? 'var(--color-bg)' : 'transparent',
          borderLeft: `2px solid ${isCurrent ? 'var(--color-accent-600)' : 'transparent'}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span
            aria-hidden="true"
            style={{ fontSize: '10px', color: row.busy ? 'var(--color-accent-400)' : 'var(--color-neutral-600)' }}
          >
            {row.busy ? '\u25cf' : '\u25cb'}
          </span>
          {/* Canvas: every row leads with its kind, then the goal —
              it is how the list tells the four shapes apart without
              the operator having to read the counts on the line
              below. Smaller than the trigger's badge (9px / 0 6px),
              which is the canvas's own pair of sizes. A bare session
              gets no pill, same as the trigger: `solo` is a mode the
              batch decides, not what a window with no evidence is. */}
          {(row.mode || kindOf(row) !== 'solo') && (
          <span
            data-testid="team-kind"
            style={{
              color: KIND_STYLE[kindOf(row)].color,
              fontSize: '9px',
              border: `1px solid ${KIND_STYLE[kindOf(row)].edge}`,
              borderRadius: 8,
              padding: '0 6px',
              whiteSpace: 'nowrap',
              flex: 'none',
            }}
          >
            {kindOf(row)}
          </span>
          )}
          <span
            data-testid="team-title"
            style={{
              color: 'var(--color-text)',
              fontSize: '12px',
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {row.title}
          </span>
          <span style={{ flex: 1 }} />
          {rowMark && (
            <span
              data-testid="team-mark"
              style={{
                fontSize: '10.5px',
                flex: 'none',
                color:
                  rowMark === 'current'
                    ? 'var(--color-accent-400)'
                    : MARK_COLOR[rowMark],
              }}
            >
              {rowMark === 'current' ? '✓' : MARK_TEXT[rowMark]}
            </span>
          )}
          {isCurrent && !watch.dismissed && (
            <button
              type="button"
              data-testid="row-stop-watching"
              onClick={(e) => {
                e.stopPropagation();
                watch.requestStopWatching();
              }}
              style={{
                fontSize: '10px',
                color: 'var(--color-neutral-600)',
                background: 'transparent',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                flex: 'none',
              }}
            >
              stop watching
            </button>
          )}
        </div>
        <div
          data-testid="team-meta"
          style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}
        >
          {rowId !== row.title && (
            <span
              data-testid="team-id"
              style={{
                color: 'var(--color-neutral-600)',
                fontSize: '10.5px',
                whiteSpace: 'nowrap',
                flex: 'none',
              }}
            >
              {rowId}
            </span>
          )}
          {/* The run's own name lands with its snapshot, which is
              written at termination — so a live run has only its id,
              and that is what the row says rather than a placeholder
              that would read like a name. */}
          {run && (
            <span
              data-testid="team-run"
              style={{
                color: 'var(--color-neutral-600)',
                fontSize: '10.5px',
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {run.name ?? run.runId}
            </span>
          )}
          {/* Only a row that is not where the scope says: a row that moved says where. */}
          {row.folder !== scope && (
            <span
              data-testid="team-folder"
              style={{ color: 'var(--color-neutral-500)', fontSize: '10.5px', whiteSpace: 'nowrap', flex: 'none' }}
            >
              {folderBase(row.folder)}
            </span>
          )}
          {row.branch && (
            <span
              data-testid="team-branch"
              style={{
                color: 'var(--color-neutral-600)',
                fontSize: '10.5px',
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {row.branch}
            </span>
          )}
          {/* The design pairs this with the branch. It reads the
              narrowest thing a local console can know for certain —
              which is not self-evident from `+14 −2`, so the row says
              so rather than leaving it to be assumed. */}
          {row.diffstat && (
            <span
              data-testid="team-diffstat"
              title="uncommitted in the working tree, against HEAD"
              style={{
                color: 'var(--color-neutral-600)',
                fontSize: '10.5px',
                whiteSpace: 'nowrap',
                flex: 'none',
              }}
            >
              {diffStat(row.diffstat.added, row.diffstat.removed)}
            </span>
          )}
          <span style={{ flex: 1 }} />
          <span
            style={{
              color: 'var(--color-neutral-600)',
              fontSize: '10px',
              whiteSpace: 'nowrap',
              flex: 'none',
            }}
          >
            {agentCount(row)}
          </span>
          <span
            style={{
              color: 'var(--color-neutral-600)',
              fontSize: '10px',
              whiteSpace: 'nowrap',
              flex: 'none',
            }}
          >
            {/* The kind pill above says WHAT this is, so this cell
                says what it is DOING — the canvas's own split, whose
                state column reads `4 working` / `6 subagents` /
                `9 of 10 slots`. */}
            {notWatching
              ? 'running · not watching'
              : run
                ? run.live
                  ? 'running'
                  : 'ended'
                : row.members < 2 && row.subagents
                  ? `${row.subagents} subagent${row.subagents === 1 ? '' : 's'}`
                  : row.busy
                    ? 'working'
                    : 'at prompt'}
          </span>
        </div>
      </div>
    );
  }

  function onListKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(rows.length - 1, c + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === 'Enter' && e.metaKey) {
      e.preventDefault();
      if (cursorRow) window.open(`/s/${encodeURIComponent(cursorRow.id)}`, '_blank');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (cursorRow) select(cursorRow);
    } else if (e.key === 'Escape') {
      // preventDefault is what stops the global handler interrupting an agent.
      e.preventDefault();
      close();
    }
  }

  return (
    <div
      ref={wrapper}
      style={{
        position: 'relative',
        alignSelf: 'stretch',
        display: 'flex',
        alignItems: 'center',
        flex: 'none',
      }}
    >
      <button
        ref={trigger}
        className="team-trigger"
        data-testid="team-trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="team-list"
        aria-labelledby="team-wordmark team-trigger-name"
        disabled={switching}
        title={switching ? 'switching session…' : undefined}
        onClick={() => (open ? close() : onOpenChange(true))}
        style={{
          opacity: switching ? 0.5 : 1,
          cursor: switching ? 'wait' : undefined,
          display: 'flex',
          alignItems: 'baseline',
          gap: 7,
          // Ruling 14 measured 146px for the GOAL, so that is what carries it
          // (below) rather than the whole trigger: the badge and the in-world
          // chip are decoration either side of it, and pinning the trigger
          // instead would let a long badge eat the goal it was sized for. The
          // tabs still cannot move when the operator switches session, which is
          // what the pin is for — only a change of session KIND shifts them.
          flex: 'none',
          whiteSpace: 'nowrap',
          padding: '3px 8px',
          margin: '-3px 0',
          border: `1px ${watch.dismissed ? 'dashed' : 'solid'} var(--color-neutral-800)`,
          borderRadius: 'var(--radius-sm)',
        }}
      >
        {mode && (
          <span
            data-testid="team-mode"
            style={{
              color: (KIND_STYLE[mode] ?? KIND_STYLE.solo).color,
              fontSize: 9.5,
              border: `1px solid ${(KIND_STYLE[mode] ?? KIND_STYLE.solo).edge}`,
              borderRadius: 8,
              padding: '0 7px',
              whiteSpace: 'nowrap',
              flex: 'none',
            }}
          >
            {mode}
          </span>
        )}
        <span
          id="team-trigger-name"
          data-testid="team-trigger-name"
          style={{
            maxWidth: TRIGGER_WIDTH,
            color: watch.dismissed ? 'var(--color-neutral-500)' : 'var(--color-text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {watch.dismissed ? 'no session selected' : (sessionName || triggerName(current))}
        </span>
        <span aria-hidden="true" style={{ color: 'var(--color-accent-400)', fontSize: 10 }}>
          ▾
        </span>
      </button>

      {open && (
        <div
          id="team-list"
          data-testid="team-list"
          ref={list}
          role="listbox"
          aria-label="teams"
          aria-busy={mark?.kind === 'switching'}
          aria-activedescendant={cursorRow ? `team-option-${cursorRow.id}` : undefined}
          tabIndex={0}
          onKeyDown={onListKeyDown}
          style={{
            position: 'absolute',
            // The bar's own 9px padding, so the panel lands on its bottom border.
            top: 'calc(100% + 9px)',
            left: 0,
            zIndex: 10,
            width: PANEL_WIDTH,
            background: 'var(--color-bg)',
            // The panel floats on the same ground as the bar behind it, so the
            // shadow alone leaves its top edge indistinguishable.
            border: '1px solid var(--color-neutral-800)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-md)',
            outline: 'none',
          }}
        >
          {/* Row 1 \u2014 the folder pill: the one filter left. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '9px',
              padding: '9px 12px',
              borderBottom: '1px solid var(--color-neutral-900)',
              position: 'relative',
            }}
          >
            <button
              type="button"
              data-testid="folder-chip"
              aria-haspopup="listbox"
              aria-expanded={foldersOpen}
              onClick={() => setFoldersOpen((o) => !o)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '2px 8px',
                border: '1px solid var(--color-neutral-800)',
                borderRadius: 'var(--radius-sm)',
                background: 'transparent',
                letterSpacing: 'normal',
                cursor: 'pointer',
                flex: 'none',
              }}
            >
              <span style={{ color: 'var(--color-accent-300)', fontSize: '11px', whiteSpace: 'nowrap' }}>
                {scope ? folderBase(scope) : 'every folder'}
              </span>
              <span style={{ color: 'var(--color-neutral-600)', fontSize: '10px', whiteSpace: 'nowrap' }}>
                {scope ? shortPath(scope) : 'no session on screen'}
              </span>
              <span aria-hidden="true" style={{ color: 'var(--color-accent-400)', fontSize: '10px' }}>
                {foldersOpen ? '\u25b4' : '\u25be'}
              </span>
            </button>
            <span style={{ flex: 1 }} />
            <span
              style={{
                flex: 'none',
                fontSize: '9.5px',
                color: 'var(--color-neutral-700)',
                border: '1px solid var(--color-neutral-800)',
                borderRadius: 4,
                padding: '1px 5px',
              }}
            >
              {'\u2318K'}
            </span>

            {foldersOpen && (
              <div
                data-testid="folder-menu"
                role="listbox"
                aria-label="folders"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 5px)',
                  left: FOLDER_MENU_LEFT,
                  zIndex: 22,
                  display: 'flex',
                  flexDirection: 'column',
                  width: FOLDER_MENU_WIDTH,
                  background: 'var(--color-bg)',
                  border: '1px solid var(--color-neutral-800)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'var(--shadow-md)',
                  overflow: 'hidden',
                  letterSpacing: 'normal',
                  // The canvas draws three folders and needs no cap. This
                  // machine has eighteen, and uncapped the menu ran 200px past
                  // the panel it hangs off. Same ceiling as the session list
                  // below it, so the two menus stop in the same place.
                  maxHeight: '320px',
                  overflowY: 'auto',
                }}
              >
                {folders.map((f) => {
                  const isHere = f.path === scope;
                  return (
                    <div
                      key={f.path}
                      role="option"
                      aria-selected={isHere}
                      onClick={() => {
                        // The menu closes on the pick; the session dropdown
                        // stays up, since choosing a folder is how you get to
                        // the session in it.
                        setPicked(f.path);
                        storeFolder(f.path);
                        setFoldersOpen(false);
                        setCursor(0);
                      }}
                      style={{
                        padding: '7px 11px',
                        display: 'flex',
                        gap: '9px',
                        alignItems: 'baseline',
                        cursor: 'pointer',
                        background: isHere ? 'var(--color-accent-900)' : 'transparent',
                        borderBottom: '1px solid var(--color-neutral-900)',
                      }}
                    >
                      <span
                        data-testid="folder-mark"
                        aria-hidden="true"
                        style={{
                          color: isHere ? 'var(--color-accent-400)' : 'var(--color-neutral-700)',
                          fontSize: '11px',
                          flex: 'none',
                        }}
                      >
                        {isHere ? '\u2713' : '\u00b7'}
                      </span>
                      <span
                        style={{
                          color: isHere ? 'var(--color-accent-300)' : 'var(--color-text)',
                          fontSize: '11.5px',
                          whiteSpace: 'nowrap',
                          flex: 'none',
                        }}
                      >
                        {f.name}
                      </span>
                      <span
                        style={{
                          color: 'var(--color-neutral-700)',
                          fontSize: '10px',
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {shortPath(f.path)}
                      </span>
                      <span style={{ flex: 1 }} />
                      <span
                        style={{
                          color: 'var(--color-accent-400)',
                          fontSize: '10px',
                          whiteSpace: 'nowrap',
                          flex: 'none',
                        }}
                      >
                        {`${f.live} live`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Row 2 — a label, not a control (the noun stays "SESSIONS",
              decision 23), and the scope's count. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '7px 12px',
              borderBottom: '1px solid var(--color-neutral-900)',
              color: 'var(--color-neutral-700)',
              fontSize: '9.5px',
              letterSpacing: '.12em',
            }}
          >
            <span>LIVE SESSIONS</span>
            <span style={{ flex: 1 }} />
            <span
              data-testid="session-count"
              style={{
                letterSpacing: 'normal',
                fontSize: '10px',
                color: rows.length === 0 ? 'var(--warn)' : 'var(--color-neutral-600)',
              }}
            >
              {`${rows.length} live`}
            </span>
          </div>

          <div
            style={{
              maxHeight: '320px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
              padding: '0 8px 8px',
            }}
          >
            {rows.map((row) => renderRow(row))}

            {rows.length === 0 && (
              <div style={{ padding: '6px 10px 4px', fontSize: '11px', color: 'var(--color-neutral-600)' }}>
                {sessions.length === 0
                  ? 'Nothing live on this machine. Resume a session from your terminal and it appears here.'
                  : 'Nothing live in this folder.'}
              </div>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              gap: '12px',
              padding: '8px 12px',
              color: 'var(--color-neutral-600)',
              fontSize: '10px',
            }}
          >
            {/* The canvas gives the footer two slots: the keyboard hints it
                wants named, and the scope's live count. The
                separator above comes from the last row's own bottom border,
                so there is no border here. */}
            {/* Both `flex: none`: a flex child shrinks below its content by
                default, and these two wrapped to four lines before the spacer
                between them gave up any width. */}
            <span style={{ flex: 'none' }}>⏎ open</span>
            <span style={{ flex: 'none' }}>⌘⏎ new tab</span>
            <span style={{ flex: 1 }} />
            <span data-testid="folder-note" style={{ flex: 'none' }}>
              {`${rows.length} live across ${folderSpan} folder${folderSpan === 1 ? '' : 's'}`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
