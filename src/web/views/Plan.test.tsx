// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PlanProgress } from '../../shared/domain';
import { Plan } from './Plan';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const PLAN: PlanProgress = {
  path: '/Users/me/code/app/docs/team8/plans/2026-09-13-thing.md',
  mtime: 1000,
  tasks: [
    { n: 1, title: 'Add the type', written: true },
    { n: 2, title: 'Serve it', written: false },
    { n: 3, title: 'Draw it', written: false },
  ],
};

function stubSection(text: string) {
  const fetchMock = vi.fn((_path: string) =>
    Promise.resolve(new Response(JSON.stringify({ n: 2, text }), { status: 200 })),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

it('shows how much of the plan is written', () => {
  render(<Plan plan={PLAN} />);
  expect(screen.getByTestId('plan-pct').textContent).toBe('33%');
  expect(screen.getByTestId('plan-count').textContent).toBe('1 of 3 tasks written');
  expect(screen.getByTestId('plan-bar').style.width).toBe(`${(1 / 3) * 100}%`);
  expect(screen.getByTestId('plan-path').textContent).toBe('docs/team8/plans/2026-09-13-thing.md');
});

it('marks each task written or outlined', () => {
  render(<Plan plan={PLAN} />);
  expect(screen.getAllByTestId('plan-state').map((s) => s.textContent)).toEqual([
    'written',
    'outlined',
    'outlined',
  ]);
});

it('draws a plan with no task headings yet as 0 of 0 and no rows', () => {
  render(<Plan plan={{ ...PLAN, tasks: [] }} />);
  expect(screen.getByTestId('plan-count').textContent).toBe('0 of 0 tasks written');
  expect(screen.queryAllByTestId('plan-row')).toHaveLength(0);
});

it('opens a task\'s section on click and closes it on a second click', async () => {
  const fetchMock = stubSection('### Task 2: Serve it\n\n**Files:**');
  render(<Plan plan={PLAN} />);
  fireEvent.click(screen.getAllByTestId('plan-row')[1]);
  await waitFor(() =>
    expect(screen.getByTestId('plan-section').textContent).toBe('### Task 2: Serve it\n\n**Files:**'),
  );
  expect(fetchMock).toHaveBeenCalledWith('/api/plan-task?n=2');
  expect(screen.getAllByTestId('plan-row')[1].getAttribute('aria-expanded')).toBe('true');
  fireEvent.click(screen.getAllByTestId('plan-row')[1]);
  expect(screen.queryByTestId('plan-section')).toBeNull();
  expect(screen.getAllByTestId('plan-row')[1].getAttribute('aria-expanded')).toBe('false');
});

it('fetches an open section again when the plan file changes', async () => {
  const fetchMock = stubSection('### Task 2: Serve it');
  const { rerender } = render(<Plan plan={PLAN} />);
  fireEvent.click(screen.getAllByTestId('plan-row')[1]);
  await waitFor(() => expect(screen.getByTestId('plan-section').textContent).toBe('### Task 2: Serve it'));
  rerender(<Plan plan={{ ...PLAN, mtime: 2000 }} />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
});
