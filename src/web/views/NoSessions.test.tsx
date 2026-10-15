// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { sampleSessions } from '../test/state-fixture';
import { NoSessions } from './NoSessions';

afterEach(cleanup);

it('tells the operator how a session gets back into the picker', () => {
  render(<NoSessions others={[]} onSwitchTo={vi.fn()} />);
  expect(screen.getByText('Nothing live on this machine.')).toBeTruthy();
  expect(screen.getByText(/resume a session from your terminal/i)).toBeTruthy();
  expect(screen.queryByTestId('no-sessions-other')).toBeNull();
});

it('offers the live sessions elsewhere, switching by session id', () => {
  const onSwitchTo = vi.fn();
  render(<NoSessions others={sampleSessions().filter((r) => !r.current)} onSwitchTo={onSwitchTo} />);
  const rows = screen.getAllByTestId('no-sessions-other');
  expect(rows).toHaveLength(2);
  fireEvent.click(rows[0]);
  expect(onSwitchTo).toHaveBeenCalledWith('b5129c7b-a009-4de3-9a42-4664d1214f39');
});
