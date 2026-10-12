import type { EngineInterface, Register } from 'claude-code'
import { register as registerWave } from './wave-notify.ts'
import { bandDetail, consoleLink, members, taskCounts, type Health, type Member, type RosterAgent, type Task } from './team.ts'

const ACCENT = '#9184d9'
const FAIL = '#c98d8d'
const GLYPH = { working: '●', idle: '○', blocked: '✕', failed: '✕' } as const

// ponytail: module memory, so a reload draws nothing until its first refresh,
// at most 5 s later; $.state if that ever shows.
let sessionId = ''
let roster: RosterAgent[] = []
let tasks: Task[] = []
let health: Health | undefined
let drawn = ''
let refreshing = false
let ticking = false

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
  const key = JSON.stringify([sessionId, roster, tasks, health])
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

async function openInConsole($: EngineInterface, name?: string) {
  const link = consoleLink(health, sessionId)
  if (!link) return
  const url = name ? `${link.href}?agent=${encodeURIComponent(name)}` : link.href
  try {
    await $.process.run(['open', url], { timeoutMs: 5000 })
  } catch {}
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
    } catch {}
    await refresh($)
    return next(e)
  })

  // A teammate's task and status changes ride on its tool calls and turn ends.
  on('tool.call', async ($, e, next) => {
    if (e.agentId) refreshSoon($)
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
      const list = members(roster, tasks)
      if (e.props.hasSurvey || list.length === 0) return rest
      const { Box, Text, Button, Link } = $.ui.resolve(e)
      const counts = taskCounts(tasks)
      const link = consoleLink(health, sessionId)
      const shown = list.length > 9 ? list.slice(0, 8) : list
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" columnGap={3} flexWrap="wrap">
            <Text bold>team8</Text>
            {shown.map((m, i) => (
              <Button key={`agent-${m.name}`} hotkey={String(i + 1)} plain onPress={() => void openInConsole($, m.name)}>
                <Text color={glyphColor(m)} dimColor={m.state === 'idle'}>{GLYPH[m.state]}</Text>
                {` ${m.name} `}
                <Text color={m.state === 'failed' ? FAIL : undefined} dimColor={m.state !== 'failed'}>{bandDetail(m)}</Text>
              </Button>
            ))}
            {shown.length < list.length && (
              <Button key="more" plain onPress={() => void openInConsole($)}>{`+${list.length - shown.length}`}</Button>
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
}
