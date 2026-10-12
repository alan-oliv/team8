import type { AgentInfo, On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const SESSION = 'abcd1234-0000-0000-0000-000000000000'
const ROSTER: AgentInfo[] = [
  { id: 'aVito-0000000000000001', teammateId: 'Vito@session-abcd1234', name: 'Vito', description: 'track A', type: 'team8:executor', status: 'running' },
  { id: 'aAna-0000000000000002', teammateId: 'Ana@session-abcd1234', name: 'Ana', description: 'track B', type: 'team8:executor', status: 'idle' },
]
const TASKS = [
  { id: '4', subject: 'Build the band', status: 'in_progress', owner: 'Vito', blockedBy: [] },
  { id: '5', subject: 'Open the console', status: 'pending', owner: 'Ana', blockedBy: ['4'] },
]
const BAND = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 9 }, view: {} }
const START = { cwd: '/tmp', surface: 'terminal', isInteractive: true } as const

// Answers beneath the module for each call it makes on $, and records the
// commands it runs. The kit's bottom hook throws on anything left unanswered.
function stub(on: On, roster: AgentInfo[] = ROSTER, consoleUp = true): unknown[] {
  const runs: unknown[] = []
  mock.clock(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.render', () => ({ type: 'Box' }))
  on('session.id', () => ({ value: SESSION }))
  on('agent.list', () => ({ value: roster }))
  on('tool.call', { tool: 'TaskList' }, () => ({ result: { tasks: TASKS } }))
  on('http.fetch', () => ({
    value: consoleUp
      ? { status: 200, ok: true, headers: {}, text: JSON.stringify({ ok: true }) }
      : { status: 503, ok: false, headers: {}, text: '{}' },
  }))
  on('process.run', (_, e) => {
    runs.push(e.argv)
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  return runs
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the band draws a button per teammate and the task count, on ${surface}`, async ($, on) => {
    stub(on)
    await $.session.start(START)
    const band = await $.ui.mount({ plugin: 'team8', surface, component: 'AbovePrompt', props: BAND })
    expect(await band.findAll({ type: 'Button' })).toHaveLength(2)
    expect(await band.find({ type: 'Text', text: /tasks 0\/2/ })).toBeTruthy()
  })
}

test('a digit opens the console on that teammate', async ($, on) => {
  const runs = stub(on)
  await $.session.start(START)
  const band = await $.ui.mount({ plugin: 'team8', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  await band.press({ key: 'agent-Ana' })
  expect(runs).toEqual([['open', `http://127.0.0.1:4823/s/${SESSION}?agent=Ana`]])
})

test('a digit does nothing while the console is down', async ($, on) => {
  const runs = stub(on, ROSTER, false)
  await $.session.start(START)
  const band = await $.ui.mount({ plugin: 'team8', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  await band.press({ key: 'agent-Ana' })
  expect(runs).toEqual([])
})

test('the band draws nothing of its own with no teammates', async ($, on) => {
  stub(on, [])
  await $.session.start(START)
  const band = await $.ui.mount({ plugin: 'team8', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await band.findAll({ type: 'Button' })).toHaveLength(0)
})
