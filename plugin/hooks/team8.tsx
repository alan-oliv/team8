import type { EngineInterface, Register } from 'claude-code'
import { register as registerWave } from './wave-notify.ts'
import {
  activityLine,
  ago,
  bandDetail,
  barCells,
  claimedAndBlocked,
  consoleLink,
  members,
  taskCounts,
  teamOf,
  type Activity,
  type Health,
  type Member,
  type RosterAgent,
  type Task,
} from './team.ts'

const PANE = 'team8'
const ACCENT = '#9184d9'
const FAIL = '#c98d8d'
const WARN = '#d99e5c'
const GLYPH = { working: '●', idle: '○', blocked: '✕', failed: '✕' } as const

// ponytail: module memory, so a reload starts from an empty snapshot and a
// teammate's last tool call returns only with its next one; $.state if that matters.
const activity = new Map<string, Activity>()
let sessionId = ''
let roster: RosterAgent[] = []
let tasks: Task[] = []
let health: Health | undefined
let drawn = ''
let refreshing = false
let ticking = false
let tab: 'team' | 'tasks' = 'team'
let focusName: string | undefined

function glyphColor(m: Member): string | undefined {
  return m.state === 'working' ? ACCENT : m.state === 'idle' ? undefined : FAIL
}

async function refresh($: EngineInterface) {
  // /clear keeps the process under a new session id and fires no session.start.
  try {
    sessionId = await $.session.id()
  } catch {}
  try {
    roster = await $.agent.list()
  } catch {}
  try {
    const list = await $.tool.call({ tool: 'TaskList' })
    tasks = (list.result as { tasks?: Task[] } | undefined)?.tasks ?? []
  } catch {}
  try {
    const r = await $.http.fetch('http://127.0.0.1:4823/health')
    health = r.ok ? (JSON.parse(r.text) as Health) : undefined
  } catch {
    health = undefined
  }
  // The minute is in the key so an age like 3m redraws as it changes.
  const key = JSON.stringify([roster, tasks, health, [...activity], Math.floor(Date.now() / 60_000)])
  if (key !== drawn) {
    drawn = key
    try {
      $.ui.invalidate('ui.render')
    } catch {}
  }
}

// At most once a second, trailing, so a burst of tool calls costs one read.
function refreshSoon($: EngineInterface) {
  if (refreshing) return
  try {
    $.clock.after(1000, () => {
      refreshing = false
      void refresh($)
    })
    refreshing = true
  } catch {}
}

async function openPane($: EngineInterface, name?: string) {
  focusName = name
  try {
    await $.ui.open({ id: PANE, title: 'team8', focus: true, closeOnEscape: true, rows: 16, columns: 46 })
    $.ui.invalidate('ui.render')
  } catch {}
}

// Unasked, so Claude Code places it only from 144 columns (110 once opened by
// hand this session); below that it waits, and the toast says how to open it.
async function openForRun($: EngineInterface) {
  try {
    const opened = await $.ui.open({ id: PANE, title: 'team8', closeOnEscape: true, rows: 16, columns: 46 })
    if (!opened.isPlaced) $.ui.toast('team8: /team8 opens the team pane')
  } catch {}
}

async function openAgent($: EngineInterface, name: string) {
  const link = consoleLink(health, sessionId, teamOf(roster))
  if (!link) return
  try {
    await $.process.run(['open', `${link.href}?agent=${encodeURIComponent(name)}`], { timeoutMs: 5000 })
  } catch {}
}

function setTab($: EngineInterface, next: 'team' | 'tasks') {
  tab = next
  $.ui.invalidate('ui.render')
}

function submitLead($: EngineInterface, value: string) {
  if (!value.trim()) return
  void $.prompt.submit({ text: value })
}

export const register: Register = (on, options) => {
  registerWave(on, options)

  on('session.start', async ($, e, next) => {
    try {
      // session.start can fire again in the same module; one timer is enough.
      if (!ticking) {
        $.clock.every(5000, () => void refresh($))
        ticking = true
      }
      await $.command.register({ name: 'team8', description: 'Open the team8 pane: teammates and tasks', immediate: true })
    } catch {}
    await refresh($)
    return next(e)
  })

  on('command.run', { command: 'team8' }, async $ => {
    await openPane($)
    return { text: 'opened the team8 pane' }
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId) {
      activity.set(e.agentId, { text: activityLine(e.tool, e as unknown as Record<string, unknown>), at: Date.now() })
      refreshSoon($)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    const r = await next(e)
    if ((e as { skill?: string }).skill === 'team8:run') await openForRun($)
    return r
  }).catch(($, e, next) => next(e))

  // The person's own /team8:run, where Claude Code raises a skill as a command.
  on('command.run', { command: 'team8:run' }, async ($, e, next) => {
    await openForRun($)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    try {
      refreshSoon($)
    } catch {}
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const rest = await next(e)
    try {
      const list = members(roster, tasks, activity)
      if (e.props.hasSurvey || list.length === 0) return rest
      const { Box, Text, Button, Link } = $.ui.resolve(e)
      const counts = taskCounts(tasks)
      const link = consoleLink(health, sessionId, teamOf(roster))
      const shown = list.length > 9 ? list.slice(0, 8) : list
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" columnGap={3} flexWrap="wrap">
            <Text bold>team8</Text>
            {shown.map((m, i) => (
              <Button key={`agent-${m.name}`} hotkey={String(i + 1)} plain onPress={() => void openPane($, m.name)}>
                <Text color={glyphColor(m)} dimColor={m.state === 'idle'}>{GLYPH[m.state]}</Text>
                {` ${m.name} `}
                <Text color={m.state === 'failed' ? FAIL : undefined} dimColor={m.state !== 'failed'}>{bandDetail(m)}</Text>
              </Button>
            ))}
            {shown.length < list.length && (
              <Button key="more" plain onPress={() => void openPane($)}>{`+${list.length - shown.length}`}</Button>
            )}
            <Text dimColor>{`tasks ${counts.completed}/${counts.total}`}</Text>
            <Box flexGrow={1} />
            {link && <Link href={link.href} label={link.label} />}
          </Box>
          {rest}
        </Box>
      )
    } catch {
      return rest
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    try {
      const table = $.ui.resolve(e)
      const { Box, Text, Button, Link } = table
      // Mobile's table has no Input.
      const Input = 'Input' in table ? table.Input : undefined
      const list = members(roster, tasks, activity)
      const counts = taskCounts(tasks)
      const rows = claimedAndBlocked(tasks)
      const link = consoleLink(health, sessionId, teamOf(roster))
      const width = Math.max(10, e.props.bodyColumns)
      const bar = barCells(counts, width)
      const now = Date.now()
      return (
        <Box flexDirection="column" flexGrow={1}>
          <Box flexDirection="row" columnGap={2}>
            <Text bold>team8</Text>
            {e.props.placement === 'inline' && <Text dimColor>/tui fullscreen for a side panel</Text>}
            <Box flexGrow={1} />
            <Text dimColor>esc close</Text>
          </Box>
          {link && (
            <Box flexDirection="row" columnGap={1}>
              <Text dimColor>console</Text>
              <Link href={link.href} label={link.label} />
              {link.watching !== undefined && <Text dimColor>{`· ${link.watching} watching`}</Text>}
            </Box>
          )}
          <Box flexDirection="row" columnGap={3}>
            <Button key="tab-team" hotkey="1" plain dimColor={tab !== 'team'} onPress={() => setTab($, 'team')}>team</Button>
            <Button key="tab-tasks" hotkey="2" plain dimColor={tab !== 'tasks'} onPress={() => setTab($, 'tasks')}>tasks</Button>
          </Box>
          {tab === 'team' ? (
            <Box flexDirection="column">
              <Text dimColor>{`TEAM · ${list.length}`}</Text>
              {list.length === 0 && <Text dimColor>no teammates in this session</Text>}
              {list.map(m => (
                <Box key={`row-${m.name}`} flexDirection="row" columnGap={1}>
                  <Button key={`member-${m.name}`} plain autoFocus={m.name === focusName ? true : undefined} onPress={() => void openAgent($, m.name)}>
                    <Text color={glyphColor(m)} dimColor={m.state === 'idle'}>{GLYPH[m.state]}</Text>
                    {` ${m.name.slice(0, 8).padEnd(8)}`}
                  </Button>
                  <Text dimColor>{(m.taskId ? `#${m.taskId}` : '').padEnd(6)}</Text>
                  <Box flexGrow={1}>
                    <Text wrap="truncate-end">{m.activity}</Text>
                  </Box>
                  <Text dimColor>{ago(m.at, now)}</Text>
                </Box>
              ))}
            </Box>
          ) : (
            <Box flexDirection="column">
              <Text>
                {`${counts.completed} of ${counts.total} completed`}
                <Text dimColor>{` · ${counts.claimed} claimed · ${counts.blocked} blocked`}</Text>
              </Text>
              {e.surface === 'terminal' && (
                <Text>
                  <Text color="#796cbf">{'█'.repeat(bar.completed)}</Text>
                  <Text color="#d2cefd">{'█'.repeat(bar.claimed)}</Text>
                  <Text color={WARN}>{'█'.repeat(bar.blocked)}</Text>
                  <Text color="#292b31">{'█'.repeat(bar.rest)}</Text>
                </Text>
              )}
              <Text dimColor>CLAIMED AND BLOCKED</Text>
              {rows.map(r => (
                <Box key={`task-${r.id}`} flexDirection="row" columnGap={1}>
                  <Text color={r.state === 'claimed' ? ACCENT : FAIL}>{r.state === 'claimed' ? '●' : '✕'}</Text>
                  <Text dimColor>{`#${r.id}`.padEnd(6)}</Text>
                  <Box flexGrow={1}>
                    <Text wrap="truncate-end">{r.subject}</Text>
                  </Box>
                  <Text dimColor>{r.right}</Text>
                </Box>
              ))}
            </Box>
          )}
          <Box flexGrow={1} />
          <Text dimColor>{'─'.repeat(width)}</Text>
          {Input && <Input key="lead" label="Lead" placeholder="@Vito take #9 after #4" submitLabel="send" value="" onSubmit={value => submitLead($, value)} />}
        </Box>
      )
    } catch {
      return next(e)
    }
  })
}
