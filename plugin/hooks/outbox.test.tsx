import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const SESSION = 'abcd1234-0000-0000-0000-000000000000'
const START = { cwd: '/repo', surface: 'terminal', isInteractive: true } as const
const OUTBOX = `http://127.0.0.1:4823/api/outbox/${SESSION}`
const TURN = { answer: 'done', durationMs: 1200, isAborted: false, turnId: 't1', reason: 'answer' } as const

// Answers beneath the module: the console's outbox serves `served` with
// `status` on every poll, and every submit and ack the module makes is recorded.
function stub(on: On, served: { id: string; text: string }[], status = 200) {
  const submitted: { text: string; asUser?: true }[] = []
  const acked: string[] = []
  const clock = mock.clock(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: SESSION }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('prompt.submit', (_, e) => {
    submitted.push({ text: e.text, asUser: e.origin.kind === 'plugin' ? e.origin.asUser : undefined })
    return { text: e.text }
  })
  on('http.fetch', (_, e) => {
    if (e.url === OUTBOX) {
      return { value: { status, ok: status === 200, headers: {}, text: JSON.stringify({ messages: served }) } }
    }
    const ack = /\/api\/outbox\/([^/]+)\/ack$/.exec(e.url)
    if (ack && e.init?.method === 'POST') {
      acked.push(ack[1] ?? '')
      return { value: { status: 200, ok: true, headers: {}, text: '{}' } }
    }
    return { value: { status: 404, ok: false, headers: {}, text: '{}' } }
  })
  return { clock, submitted, acked }
}

test("a queued message enters as the person's own prompt and is acked", async ($, on) => {
  const { clock, submitted, acked } = stub(on, [{ id: 'm1', text: 'use sqlite' }])
  await $.session.start(START)
  await clock.advance(2000)
  expect(submitted).toEqual([{ text: 'use sqlite', asUser: true }])
  expect(acked).toEqual(['m1'])
})

test('a message the console serves again is acked again but not submitted twice', async ($, on) => {
  const { clock, submitted, acked } = stub(on, [{ id: 'm1', text: 'use sqlite' }])
  await $.session.start(START)
  await clock.advance(4000)
  expect(submitted).toHaveLength(1)
  expect(acked).toEqual(['m1', 'm1'])
})

test("the lead's own turn ending polls without waiting for the timer", async ($, on) => {
  const { clock, submitted } = stub(on, [{ id: 'm2', text: 'now ship it' }])
  await $.session.start(START)
  await $.turn.complete(TURN)
  await clock.settle()
  expect(submitted.map(m => m.text)).toEqual(['now ship it'])
})

test("a teammate's turn ending does not poll", async ($, on) => {
  const { clock, submitted } = stub(on, [{ id: 'm3', text: 'not yet' }])
  await $.session.start(START)
  await $.turn.complete({ ...TURN, agentId: 'aprobe-alpha-84fd551b27de6433' })
  await clock.settle()
  expect(submitted).toEqual([])
})

test('a console that is down costs nothing', async ($, on) => {
  const { clock, submitted } = stub(on, [{ id: 'm4', text: 'lost' }], 503)
  await $.session.start(START)
  await clock.advance(2000)
  expect(submitted).toEqual([])
})
