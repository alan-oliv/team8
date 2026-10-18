import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const SESSION = 'abcd1234-0000-0000-0000-000000000000'
const RUN_LOG = '/repo/docs/team8/runs/2026-10-12-x.md'
const DECIDED = [{ role: 'assistant', text: '', toolUses: [{ input: { file_path: RUN_LOG, content: '- tasks: 2 · mode: subagents — one track' } }] }]
const TASKS = [
  { id: '1', subject: 'Draw the line', status: 'completed', blockedBy: [] },
  { id: '2', subject: 'Seat it first', status: 'in_progress', blockedBy: [] },
]
const BAND = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 9 }, view: {} }
const START = { cwd: '/repo', surface: 'terminal', isInteractive: true } as const

const live = { id: SESSION, messages: DECIDED as unknown[], tasks: TASKS as unknown[] }

// Answers beneath the module for each call it makes on $. The kit's bottom
// hook throws on anything left unanswered.
function stub(on: On, { messages = DECIDED, tasks = TASKS, consoleUp = true, store = {} as Record<string, unknown> } = {}) {
  live.id = SESSION
  live.messages = messages
  live.tasks = tasks
  const clock = mock.clock(on)
  mock.store(on, store)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.render', () => ({ type: 'Box' }))
  on('session.id', () => ({ value: live.id }))
  on('session.messages', () => ({ value: live.messages }))
  on('tool.call', { tool: 'TaskList' }, () => ({ result: { tasks: live.tasks } }))
  on('tool.call', { tool: 'Write' }, () => ({ result: {} }))
  on('tool.call', { tool: 'Skill' }, () => ({ result: {} }))
  on('http.fetch', () => ({
    value: consoleUp
      ? { status: 200, ok: true, headers: {}, text: JSON.stringify({ ok: true }) }
      : { status: 503, ok: false, headers: {}, text: '{}' },
  }))
  return clock
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the band says the mode, the progress bar and the console link, on ${surface}`, async ($, on) => {
    stub(on)
    await $.session.start(START)
    const band = await $.ui.mount({ plugin: 'team8', surface, component: 'AbovePrompt', props: BAND })
    expect(await band.find({ type: 'Text', text: /^○ subagents\s*$/ })).toBeTruthy()
    expect(await band.find({ type: 'Text', text: '▰'.repeat(10) })).toBeTruthy()
    expect(await band.find({ type: 'Text', text: '▱'.repeat(10) })).toBeTruthy()
    expect(await band.find({ type: 'Text', text: /1\/2/ })).toBeTruthy()
    // The desktop surface draws only https or localhost links; 127.0.0.1 falls back to its label as plain text.
    if (surface === 'terminal') expect(await band.find({ type: 'Link' })).toBeTruthy()
    else expect(await band.find({ type: 'Text', text: 'team:8/s/abcd1234' })).toBeTruthy()
  })
}

test('the band says team8, with no clock, before any team8 skill runs', async ($, on) => {
  stub(on, { messages: [] })
  await $.session.start(START)
  const band = await $.ui.mount({ plugin: 'team8', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await band.find({ type: 'Text', text: /^○ team8\s*$/ })).toBeTruthy()
  expect(await band.find({ type: 'Text', text: /\d+s$/ })).toBeFalsy()
})

test('the band shows with no tasks', async ($, on) => {
  stub(on, { tasks: [] })
  await $.session.start(START)
  const band = await $.ui.mount({ plugin: 'team8', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await band.find({ type: 'Text', text: '▱'.repeat(20) })).toBeTruthy()
  expect(await band.find({ type: 'Text', text: /0\/0/ })).toBeTruthy()
})

test('the band says how to start the console while it is down', async ($, on) => {
  stub(on, { consoleUp: false })
  await $.session.start(START)
  const band = await $.ui.mount({ plugin: 'team8', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await band.find({ type: 'Text', text: '/team8:console' })).toBeTruthy()
  expect(await band.find({ type: 'Link' })).toBeFalsy()
})

test('a run-log write that decides the mode shows the band', async ($, on) => {
  const clock = stub(on, { messages: [] })
  await $.session.start(START)
  await $.tool.call({ tool: 'Write', file_path: RUN_LOG, content: '- mode: teammates — two tracks' })
  await clock.advance(1000)
  const band = await $.ui.mount({ plugin: 'team8', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await band.find({ type: 'Text', text: /^○ teammates\s*$/ })).toBeTruthy()
})

test('the band forgets the mode when /clear starts a new session', async ($, on) => {
  const clock = stub(on)
  await $.session.start(START)
  const mount = () => $.ui.mount({ plugin: 'team8', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await (await mount()).find({ type: 'Text', text: /subagents/ })).toBeTruthy()
  live.id = 'ffff0000-0000-0000-0000-000000000000'
  live.messages = []
  await clock.advance(5000)
  const band = await mount()
  expect(await band.find({ type: 'Text', text: /subagents/ })).toBeFalsy()
  expect(await band.find({ type: 'Text', text: /^○ team8\s*$/ })).toBeTruthy()
})

test('the band keeps the last progress once Claude Code empties the task list', async ($, on) => {
  const clock = stub(on)
  await $.session.start(START)
  live.tasks = []
  await clock.advance(5000)
  const band = await $.ui.mount({ plugin: 'team8', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await band.find({ type: 'Text', text: /1\/2/ })).toBeTruthy()
})

test('the line sits under the bands beneath it', async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>other band</Text>
  })
  stub(on)
  await $.session.start(START)
  const band = await $.ui.mount({ plugin: 'team8', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  const texts = (await band.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts[0]).toBe('other band')
  expect(texts.findIndex(t => t?.includes('subagents'))).toBeGreaterThan(0)
})

// With no other plugin drawing, next(e) hands up core's own node, which the
// engine refuses under a Box with a size; the line has to survive that tree.
test("the line draws over core's own band beneath it", async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'engine', ref: 0 }))
  stub(on)
  await $.session.start(START)
  const band = await $.ui.mount({ plugin: 'team8', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await band.find({ type: 'Text', text: /subagents/ })).toBeTruthy()
})

test('the band walks spec, planning and the mode on one clock that stops when the run is done', async ($, on) => {
  const clock = stub(on, { messages: [], tasks: [] })
  await $.session.start(START)
  const mount = () => $.ui.mount({ plugin: 'team8', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  await $.tool.call({ tool: 'Skill', skill: 'team8:plan' })
  await clock.advance(190_000)
  let band = await mount()
  expect(await band.find({ type: 'Text', text: /^○ spec\s*$/ })).toBeTruthy()
  expect(await band.find({ type: 'Text', text: ' · 3m10s' })).toBeTruthy()

  await $.tool.call({ tool: 'Write', file_path: '/repo/docs/team8/plans/2026-10-17-x.md', content: '# Plan' })
  // team8:plan's own team8:tasks call keeps the clock it started.
  await $.tool.call({ tool: 'Skill', skill: 'team8:tasks' })
  live.tasks = [{ id: '1', status: 'pending', blockedBy: [] }, { id: '2', status: 'pending', blockedBy: [] }]
  await clock.advance(60_000)
  band = await mount()
  expect(await band.find({ type: 'Text', text: /^○ planning\s*$/ })).toBeTruthy()
  expect(await band.find({ type: 'Text', text: /0\/2/ })).toBeTruthy()
  expect(await band.find({ type: 'Text', text: ' · 4m10s' })).toBeTruthy()

  await $.tool.call({ tool: 'Write', file_path: RUN_LOG, content: '- mode: teammates — two tracks' })
  live.tasks = TASKS.map(t => ({ ...t, status: 'completed' }))
  await clock.advance(1000)
  band = await mount()
  expect(await band.find({ type: 'Text', text: /^● teammates\s*$/ })).toBeTruthy()
  expect(await band.find({ type: 'Text', text: '▰'.repeat(20) })).toBeTruthy()
  expect(await band.find({ type: 'Text', text: ' · 4m11s' })).toBeTruthy()
  await clock.advance(60_000)
  band = await mount()
  expect(await band.find({ type: 'Text', text: ' · 4m11s' })).toBeTruthy()
})

test('a typed /team8:plan starts the clock too', async ($, on) => {
  const clock = stub(on, { messages: [] })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  await $.session.start(START)
  await $.prompt.submit({ text: '/team8:plan the band', wait: false, origin: { kind: 'composer' } })
  await clock.advance(42_000)
  const band = await $.ui.mount({ plugin: 'team8', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await band.find({ type: 'Text', text: /^○ spec\s*$/ })).toBeTruthy()
  expect(await band.find({ type: 'Text', text: ' · 42s' })).toBeTruthy()
})

test('the clock comes back from the store after a reload', async ($, on) => {
  const clock = stub(on, { store: { [`clock:${SESSION}`]: { startedAt: 0 } } })
  await clock.set(402_000)
  await $.session.start(START)
  const band = await $.ui.mount({ plugin: 'team8', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await band.find({ type: 'Text', text: ' · 6m42s' })).toBeTruthy()
})
