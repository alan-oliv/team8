import type { EngineInterface, Register } from 'claude-code'
import { noticeText, unblockedIdle, type ListedTask } from './wave.ts'

// ponytail: the reported ids live in module memory, so a reload can repeat a
// notice; move them to $.state if that turns into noise.
const notified = new Set<string>()

async function notify($: EngineInterface, agentId: string, completedId: string) {
  try {
    const roster = await $.agent.list()
    if (!roster.some(a => a.id === agentId && a.teammateId)) return
    const list = await $.tool.call({ tool: 'TaskList' })
    const tasks = (list.result as { tasks?: ListedTask[] } | undefined)?.tasks ?? []
    const unblocked = unblockedIdle(tasks, roster, notified)
    if (unblocked.length === 0) return
    for (const u of unblocked) notified.add(u.id)
    void $.prompt.submit({ text: noticeText(completedId, unblocked) })
  } catch {
    // A failed read costs only this notice.
  }
}

export const register: Register = on => {
  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const r = await next(e)
    const change = (r.result as { statusChange?: { to: string } } | undefined)?.statusChange
    if (e.agentId && change?.to === 'completed') {
      const { agentId, taskId } = e
      // A timer, so the teammate's call returns without waiting on the roster
      // and TaskList reads, which then run outside its loop.
      $.clock.after(1000, () => void notify($, agentId, taskId))
    }
    return r
  }).catch(($, e, next) => next(e))
}
