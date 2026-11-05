import type { EngineInterface } from 'claude-code'

// The console's default port, as the band's /health read uses it.
const CONSOLE = 'http://127.0.0.1:4823'
const POLL_MS = 2000

// Module memory, like wave-notify's `notified`: a message the console serves
// again (its ack was lost) is never submitted twice in this process.
const acked = new Set<string>()

type Served = { messages: { id: string; text: string }[] }

export async function poll($: EngineInterface) {
  try {
    const id = await $.session.id()
    const r = await $.http.fetch(`${CONSOLE}/api/outbox/${id}`)
    if (!r.ok) return
    const { messages } = JSON.parse(r.text) as Served
    for (const m of messages) {
      // Served again means the ack was lost: ack again, never submit again.
      if (!acked.has(m.id)) {
        acked.add(m.id)
        // The engine runs this once the session is idle; the ack must not wait on it.
        void $.prompt.submit({ text: m.text, asUser: true })
      }
      await $.http.fetch(`${CONSOLE}/api/outbox/${m.id}/ack`, { method: 'POST' })
    }
  } catch {
    // The console is down or restarting; the next poll tries again.
  }
}

// team8.tsx calls this from its session.start and poll from its own
// turn.complete: the engine allows one unmatched hook per event in a module.
export function start($: EngineInterface) {
  $.clock.every(POLL_MS, () => void poll($))
}
