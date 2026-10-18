import type { EngineInterface, Register } from 'claude-code'
import { register as registerWave } from './wave-notify.ts'
import { bar, consoleLink, elapsed, isDone, progress, skillIn, stageAfter, stageOf, type Health, type Stage, type Task } from './team.ts'

type Clock = { startedAt: number; stoppedAt?: number }

// ponytail: module memory; a reload re-reads the stage from the session's newest
// 4096 messages, so a stage set further back waits for the next team8 call.
let sessionId = ''
let stage: Stage = {}
let tasks: Task[] = []
let health: Health | undefined
// In $.store under the session id, so a reload, a restart or a resume keeps it.
// ponytail: one key per team8 session, never pruned; prune by age if the store nears its 4 MiB.
let clock: Clock | undefined
let now = 0
let drawn = ''
let refreshing = false
let ticking = false

const clockKey = () => `clock:${sessionId}`

async function refresh($: EngineInterface) {
  let cleared = false
  try {
    now = await $.clock.now()
  } catch {}
  // /clear keeps the process under a new session id and fires no session.start.
  try {
    const id = await $.session.id()
    if (id !== sessionId) {
      cleared = sessionId !== ''
      sessionId = id
      clock = (await $.store.get(clockKey())) as Clock | undefined
    }
    if (cleared) {
      stage = {}
      await readStage($)
    }
  } catch {}
  try {
    const list = await $.tool.call({ tool: 'TaskList' })
    const listed = (list.result as { tasks?: Task[] } | undefined)?.tasks ?? []
    // Claude Code empties the list once every task is done; keep the last one so a finished run reads full.
    if (listed.length > 0 || cleared) tasks = listed
  } catch {}
  try {
    if (clock && !clock.stoppedAt && isDone(progress(tasks))) {
      clock = { ...clock, stoppedAt: now }
      await $.store.set(clockKey(), clock)
    }
  } catch {}
  try {
    const r = await $.http.fetch('http://127.0.0.1:4823/health')
    health = r.ok ? (JSON.parse(r.text) as Health) : undefined
  } catch {
    health = undefined
  }
  const key = JSON.stringify([sessionId, stage, tasks, health, clock])
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

async function tick($: EngineInterface) {
  if (!clock || clock.stoppedAt) return
  try {
    now = await $.clock.now()
    $.ui.invalidate('ui.render')
  } catch {}
}

async function readStage($: EngineInterface) {
  try {
    stage = stageOf(await $.session.messages())
  } catch {}
}

// A team8 skill starts the clock unless one is running, so team8:plan's own
// team8:tasks and team8:run calls keep the clock it started.
async function see($: EngineInterface, input: unknown) {
  const next = stageAfter(stage, input)
  const changed = JSON.stringify(next) !== JSON.stringify(stage)
  stage = next
  if (skillIn(input) && (!clock || clock.stoppedAt)) {
    now = await $.clock.now()
    clock = { startedAt: now }
    // The last batch's list would read as already done and stop the new clock.
    tasks = []
    if (sessionId) await $.store.set(clockKey(), clock)
    return true
  }
  return changed
}

export const register: Register = (on, options) => {
  registerWave(on, options)

  on('session.start', async ($, e, next) => {
    try {
      // session.start can fire again in the same module; one timer each is enough.
      if (!ticking) {
        $.clock.every(5000, () => void refresh($))
        $.clock.every(1000, () => void tick($))
        ticking = true
      }
    } catch {}
    await readStage($)
    await refresh($)
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    try {
      if (await see($, e)) refreshSoon($)
    } catch {}
    return next(e)
  }).catch(($, e, next) => next(e))

  // A Skill call or a plan or run-log write can move the stage; a TaskCreate or
  // TaskUpdate changes the count. Not TaskList: refresh calls it, and that would refresh forever.
  on('tool.call', async ($, e, next) => {
    try {
      if ((await see($, e)) || e.tool === 'TaskCreate' || e.tool === 'TaskUpdate') refreshSoon($)
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
      const cells = bar(p)
      const label = stage.mode ?? stage.phase ?? 'team8'
      const link = consoleLink(health, sessionId)
      return (
        <Box flexDirection="column">
          {rest}
          <Box flexDirection="row" flexWrap="wrap" marginTop={1}>
            {/* Padded to the longest mode, so the bar holds still as the phase changes. */}
            <Text dimColor>{`${isDone(p) ? '●' : '○'} ${label.padEnd(11)}`}</Text>
            <Text>{cells.filled}</Text>
            <Text dimColor>{cells.empty}</Text>
            <Text dimColor>{`  ${p.completed}/${p.total}`}</Text>
            {clock && <Text dimColor>{` · ${elapsed((clock.stoppedAt ?? now) - clock.startedAt)}`}</Text>}
            <Text dimColor>{' · '}</Text>
            {link ? <Link href={link.href} label={link.label} /> : <Text dimColor>/team8:console</Text>}
          </Box>
        </Box>
      )
    } catch {
      return rest
    }
  })
}
