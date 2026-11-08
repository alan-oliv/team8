// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { FIXTURE_NOW, sampleTeamState } from '../test/state-fixture';
import { TeamTrace } from './TeamTrace';

afterEach(cleanup);

function mount(focused: string | null = null) {
  const state = sampleTeamState();
  const onFocus = vi.fn();
  const onOpenWall = vi.fn();
  const onOpenMail = vi.fn();
  render(
    <TeamTrace
      agents={state.agents} tasks={state.tasks} mail={state.mail} startedAt={state.startedAt} now={FIXTURE_NOW}
      focused={focused} onFocus={onFocus} onOpenWall={onOpenWall} onOpenMail={onOpenMail}
    />,
  );
  return { state, onFocus, onOpenWall, onOpenMail };
}

it('draws one lane per teammate, lead first, and counts the team in the header', () => {
  const { state } = mount();
  const names = screen.getAllByTestId('team-trace-lane-name').map((n) => n.textContent);
  expect(names).toHaveLength(state.agents.length);
  expect(names[0]).toBe('team-lead');
  expect(screen.getByTestId('team-trace-count').textContent).toBe(String(state.agents.length));
  expect(screen.getByTestId('team-trace-working').textContent).toBe(
    String(state.agents.filter((a) => a.status === 'working').length),
  );
  expect(screen.getByTestId('team-trace-messages').textContent).toBe(String(state.mail.length));
  // A spawn mark on the lead's lane per teammate; every lane has a bar.
  const lead = screen.getAllByTestId('team-trace-lane')[0];
  expect(within(lead).getAllByTestId('team-trace-mark').filter((m) => m.dataset.kind === 'spawn')).toHaveLength(state.agents.length - 1);
  expect(screen.getAllByTestId('team-trace-segment').length).toBeGreaterThanOrEqual(state.agents.length);
});

it('clicking a lane focuses that teammate, whose task and buttons fill the detail strip', () => {
  const { onFocus, onOpenWall, onOpenMail } = mount('probe-bravo');
  const lanes = screen.getAllByTestId('team-trace-lane');
  expect(lanes.find((l) => l.getAttribute('aria-selected') === 'true')?.textContent).toContain('probe-bravo');
  expect(screen.getByTestId('team-trace-detail-name').textContent).toBe('probe-bravo');
  expect(screen.getByTestId('team-trace-detail-task').textContent).toContain(sampleTeamState().tasks[1].id);

  fireEvent.click(lanes[0]);
  expect(onFocus).toHaveBeenCalledWith('team-lead');
  fireEvent.click(screen.getByTestId('team-trace-open-wall'));
  expect(onOpenWall).toHaveBeenCalledWith('probe-bravo');
  fireEvent.click(screen.getByTestId('team-trace-open-mail'));
  expect(onOpenMail).toHaveBeenCalledWith('probe-bravo');
});
