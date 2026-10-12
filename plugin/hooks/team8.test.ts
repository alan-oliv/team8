import type { AgentInfo, On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const SESSION = 'abcd1234-0000-0000-0000-000000000000'
const ROSTER: AgentInfo[] = [
  { id: 'aVito-0000000000000001', teammateId: 'Vito@session-abcd1234', name: 'Vito', description: 'track A', type: 'team8:executor', status: 'running' },
  { id: 'aAna-0000000000000002', teammateId: 'Ana@session-abcd1234', name: 'Ana', description: 'track B', type: 'team8:executor', status: 'idle' },
]
const TASKS = [
  { id: '4', subject: 'Build the band', status: 'in_progress', owner: 'Vito', blockedBy: [] },
  { id: '5', subject: 'Build the pane', status: 'pending', owner: 'Ana', blockedBy: ['4'] },
]
const BAND = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 9 }, view: {} }
const PANE = { title: 'team8', isFocused: true, bodyColumns: 46, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 16 }, view: {} }

type Seen = { opened: Record<string, unknown>[]; prompts: string[] }

function stub(on: On, roster: AgentInfo[] = ROSTER): Seen {
  const seen: Seen = { opened: [], prompts: [] }
  // The kit's bottom hook throws on anything left unanswered: the module's
  // timers and the engine's own drawing beneath the band are answered here.
  mock.clock(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.render', () => ({ type: 'Box' }))
  on('session.id', () => ({ value: SESSION }))
  on('agent.list', () => ({ value: roster }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('tool.call', { tool: 'TaskList' }, () => ({ result: { tasks: TASKS } }))
  on('http.fetch', () => ({
    value: {
      status: 200,
      ok: true,
      headers: {},
      text: JSON.stringify({ ok: true, watching: { kind: 'session', id: SESSION }, tabs: 2 }),
    },
  }))
  on('ui.open', (_, e) => {
    seen.opened.push({ ...e })
    return { value: { isPlaced: true } }
  })
  on('prompt.submit', (_, e) => {
    seen.prompts.push(e.text)
    return { text: e.text }
  })
  return seen
}

const START = { cwd: '/tmp', surface: 'terminal', isInteractive: true } as const

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the band draws a button per teammate and a digit opens the pane, on ${surface}`, async ($, on) => {
    const seen = stub(on)
    await $.session.start(START)
    const band = await $.ui.mount({ plugin: 'team8', surface, component: 'AbovePrompt', props: BAND })
    expect(await band.findAll({ type: 'Button' })).toHaveLength(2)
    expect(await band.find({ type: 'Text', text: /tasks 0\/2/ })).toBeTruthy()
    await band.press({ key: 'agent-Ana' })
    expect(seen.opened).toEqual([expect.objectContaining({ id: 'team8', focus: true })])
  })

  test(`the pane draws both tabs and sends a non-blank Lead line, on ${surface}`, async ($, on) => {
    const seen = stub(on)
    await $.session.start(START)
    const pane = await $.ui.mount({ plugin: 'team8', surface, component: 'Pane', requestId: 'team8', props: PANE })
    expect(await pane.find({ type: 'Text', text: /TEAM · 2/ })).toBeTruthy()
    await pane.press({ key: 'tab-tasks' })
    expect(await pane.find({ type: 'Text', text: /0 of 2 completed/ })).toBeTruthy()
    await pane.input({ key: 'lead', text: '   ' })
    await pane.input({ key: 'lead', text: '@Vito take #5 after #4' })
    expect(seen.prompts).toEqual(['@Vito take #5 after #4'])
  })
}

test('the band draws nothing of its own with no teammates', async ($, on) => {
  stub(on, [])
  await $.session.start(START)
  const band = await $.ui.mount({ plugin: 'team8', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await band.findAll({ type: 'Button' })).toHaveLength(0)
})

test('the lead invoking team8:run opens the pane without taking the keyboard', async ($, on) => {
  const seen = stub(on)
  on('tool.call', { tool: 'Skill' }, () => ({ result: {} }))
  await $.session.start(START)
  await $.tool.call({ tool: 'Skill', skill: 'team8:run' })
  expect(seen.opened).toEqual([expect.objectContaining({ id: 'team8' })])
  expect(seen.opened[0]).not.toHaveProperty('focus')
})
