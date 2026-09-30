import { describe, expect, it } from 'vitest';
import { readTrace } from './trace';

const T0 = Date.UTC(2026, 8, 30, 8, 0, 0);
const at = (s: number) => new Date(T0 + s * 1000).toISOString();
const user = (s: number, content: unknown) => JSON.stringify({ type: 'user', timestamp: at(s), message: { role: 'user', content } });
const asst = (s: number, id: string, content: unknown[], o: { stop?: string; out?: number; effort?: string } = {}) =>
  JSON.stringify({
    type: 'assistant',
    timestamp: at(s),
    effort: o.effort,
    message: {
      id,
      model: 'claude-opus-5-5',
      role: 'assistant',
      content,
      stop_reason: o.stop ?? null,
      usage: { input_tokens: 10, output_tokens: o.out ?? 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    },
  });

describe('readTrace', () => {
  it('times each model call from its request and each tool from use to result', () => {
    const t = readTrace('rows', 'executor', [
      user(0, 'go'),
      asst(2, 'm1', [{ type: 'text', text: 'running tests' }], { effort: 'max' }),
      asst(3, 'm1', [{ type: 'tool_use', id: 'tu1', name: 'Bash', input: { command: 'npx vitest run a.ts' } }], { out: 50, effort: 'max' }),
      user(13, [{ type: 'tool_result', tool_use_id: 'tu1', content: 'ok' }]),
      asst(15, 'm2', [{ type: 'text', text: 'done' }], { stop: 'end_turn' }),
    ]);
    expect(t.calls.map((c) => [c.id, c.requestedAt - T0, c.lastAt - T0, c.outputTokens, c.effort])).toEqual([
      ['m1', 0, 3000, 50, 'max'],
      ['m2', 13000, 15000, 5, undefined],
    ]);
    expect(t.calls[1].stopReason).toBe('end_turn');
    expect(t.tools).toEqual([
      { id: 'tu1', name: 'Bash', category: 'tests', command: 'npx vitest run a.ts', startAt: T0 + 3000, endAt: T0 + 13000, unfinished: false },
    ]);
    expect([t.firstAt - T0, t.lastAt - T0]).toEqual([0, 15000]);
    expect(t.costUsd).toBeGreaterThan(0);
  });

  it('collects incoming messages, sends and task events', () => {
    const t = readTrace('rows', 'executor', [
      user(0, '<teammate-message teammate_id="team-lead" summary="fix">\nFix the header, please.\n</teammate-message>'),
      asst(5, 'm1', [
        { type: 'tool_use', id: 'tc', name: 'TaskCreate', input: { subject: 'x', description: 'y' } },
        { type: 'tool_use', id: 'tu', name: 'TaskUpdate', input: { taskId: '7', status: 'in_progress', owner: 'rows' } },
        { type: 'tool_use', id: 'sm', name: 'SendMessage', input: { to: 'team-lead', message: 'Header fixed.' } },
      ]),
      user(6, [
        { type: 'tool_result', tool_use_id: 'tc', content: 'Task #9 created successfully: x' },
        { type: 'tool_result', tool_use_id: 'tu', content: 'Updated task #7 status' },
        { type: 'tool_result', tool_use_id: 'sm', content: '{"success":true}' },
      ]),
      user(9, '<teammate-message teammate_id="voices" color="purple">\n{"type":"idle_notification","from":"voices"}\n</teammate-message>'),
    ]);
    expect(t.incoming).toMatchObject([
      { at: T0, kind: 'message', from: 'team-lead' },
      { at: T0 + 9000, kind: 'idle', from: 'voices' },
    ]);
    expect(t.incoming[0].text).toContain('Fix the header, please.');
    expect(t.sends).toEqual([{ at: T0 + 5000, from: 'rows', to: 'team-lead', text: 'Header fixed.' }]);
    expect(t.taskEvents).toEqual([
      { at: T0 + 5000, by: 'rows', taskId: '7', status: 'in_progress', owner: 'rows', addBlockedBy: undefined },
      { at: T0 + 6000, by: 'rows', taskId: '9', status: 'pending' },
    ]);
  });

  it('files a poll on a background command under what it waits for', () => {
    const t = readTrace('rows', 'executor', [
      user(0, 'go'),
      asst(1, 'm1', [{ type: 'tool_use', id: 'pk', name: 'Bash', input: { command: 'npm run package', run_in_background: true } }]),
      user(2, [{ type: 'tool_result', tool_use_id: 'pk', content: 'Command running in background with ID: bx1. Output is being written to: /tmp/tasks/bx1.output' }]),
      asst(3, 'm2', [{ type: 'tool_use', id: 'po', name: 'Bash', input: { command: 'until grep -q exit /tmp/tasks/bx1.output; do sleep 5; done' } }]),
      user(200, [{ type: 'tool_result', tool_use_id: 'po', content: '' }]),
    ]);
    expect(t.tools.find((x) => x.id === 'po')?.category).toBe('expensive check');
  });

  it('reads messages the inbox hook injected mid-turn as incoming, at the attachment time', () => {
    const t = readTrace('rows', 'executor', [
      user(0, 'go'),
      JSON.stringify({
        type: 'attachment',
        timestamp: at(7),
        attachment: {
          type: 'hook_additional_context',
          content: ['Messages that reached you mid-turn (team8 delivered them early; they will not repeat at the end of your turn):\n<teammate-message teammate_id="team-lead" summary="x">\nFix the header, please.\n</teammate-message>'],
        },
      }),
      JSON.stringify({ type: 'attachment', timestamp: at(8), attachment: { type: 'hook_additional_context', content: ['PONYTAIL MODE ACTIVE'] } }),
    ]);
    expect(t.incoming.filter((m) => m.kind === 'message')).toMatchObject([{ at: T0 + 7000, from: 'team-lead' }]);
    expect(t.incoming.find((m) => m.kind === 'message')?.text).toContain('Fix the header, please.');
  });
});
