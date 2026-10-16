// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Prose } from './Prose';

afterEach(cleanup);

describe('a pipe table', () => {
  const TABLE = '| Agent | Wall | Cost |\n|---|---|---|\n| lead | 1429.7 | $4.10 |\n| server | 27.2 | $0.42 |';

  it('renders as a real table with a header row', () => {
    render(<Prose text={TABLE} />);
    expect(screen.getAllByTestId('md-th').map((th) => th.textContent)).toEqual(['Agent', 'Wall', 'Cost']);
    expect(screen.getAllByTestId('md-td')).toHaveLength(6);
    expect(screen.getByTestId('md-table').textContent).not.toContain('|');
  });

  it('right-aligns the numeric columns and leaves the prose one on the left', () => {
    render(<Prose text={TABLE} />);
    const [agent, wall, cost] = screen.getAllByTestId('md-th');
    expect(agent.style.textAlign).toBe('left');
    expect(wall.style.textAlign).toBe('right');
    expect(cost.style.textAlign).toBe('right');
  });

  it('renders inline markdown inside a cell', () => {
    render(<Prose text={'| k |\n|---|\n| `code` |'} />);
    expect(screen.getByTestId('md-code').textContent).toBe('code');
  });

  it('keeps pipe lines with no separator as written', () => {
    render(<Prose text={'| a | b |\n| 1 | 2 |'} />);
    expect(screen.getByTestId('md-pre').textContent).toBe('| a | b |\n| 1 | 2 |');
  });
});
