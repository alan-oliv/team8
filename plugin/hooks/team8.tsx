import type { EngineInterface, Register } from 'claude-code'
import { register as registerWave } from './wave-notify.ts'
import { consoleLink, decidedMode, modeIn, progress, type Health, type Mode, type Task } from './team.ts'

// ponytail: module memory; a reload re-reads the mode from the session's newest
// 4096 messages, so a mode decided further back waits for the next run-log write.
let sessionId = ''
let mode: Mode | undefined
let tasks: Task[] = []
let health: Health | undefined
let drawn = ''
let refreshing = false
let ticking = false

async function refresh($: EngineInterface) {
  // /clear keeps the process under a new session id and fires no session.start.
  try {
    const id = await $.session.id()
    const cleared = sessionId !== '' && id !== sessionId
    sessionId = id
    if (cleared) {
      mode = undefined
      await readMode($)
    }
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
  const key = JSON.stringify([sessionId, mode, tasks, health])
  if (key !== drawn) {
    drawn = key
    try {
      $.ui.invalidate('ui.render')
    } catch {}
  }
}

// At most once a second, trailing, so a burst of task calls costs one read.
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

async function readMode($: EngineInterface) {
  try {
    mode = decidedMode(await $.session.messages()) ?? mode
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
    await readMode($)
    await refresh($)
    return next(e)
  })

  // A run-log write can decide the mode; a TaskCreate or TaskUpdate changes the
  // count. Not TaskList: refresh calls it, and that would refresh forever.
  on('tool.call', async ($, e, next) => {
    try {
      const found = modeIn(e)
      if (found) mode = found
      if (found || e.tool === 'TaskCreate' || e.tool === 'TaskUpdate') refreshSoon($)
    } catch {}
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    try {
      refreshSoon($)
    } catch {}
    return next(e)
  })

  // Drawn after next(e), so the line sits under the bands of the plugins it wraps,
  // right above the prompt. One outside it that answers without next(e) drops it.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const rest = await next(e)
    try {
      if (e.props.hasSurvey) return rest
      const { Box, Text, Link } = $.ui.resolve(e)
      const p = progress(tasks)
      const link = consoleLink(health, sessionId)
      return (
        <Box flexDirection="column">
          {rest}
          <Box flexDirection="row" flexWrap="wrap" marginTop={1}>
            <Text bold>team8</Text>
            <Text dimColor>{mode ? ` is running a ${mode} session · ` : ' · '}</Text>
            <Text>{`total progress ${p.completed}/${p.total} (${p.pct}%)`}</Text>
            {link && <Text dimColor>{' · see details here '}</Text>}
            {link && <Link href={link.href} label={link.label} />}
            {!link && <Text dimColor>{' · console off, /team8:console starts it'}</Text>}
          </Box>
        </Box>
      )
    } catch {
      return rest
    }
  })
}
