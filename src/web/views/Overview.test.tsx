// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { FIXTURE_NOW, fixtureAgents } from '../agents.fixture';
import { buildCast } from '../../shared/cast';
import { CastContext } from '../state/useCast';
import type { Brief, MailMessage, NeedsYouItem, Task } from '../../shared/domain';
import { briefSignature } from '../../shared/brief';
import { Overview } from './Overview';

afterEach(cleanup);

const agents = fixtureAgents();

const tasks: Task[] = [
  { id: 'T-1', subject: 'land the schema', description: '', state: 'in_progress', owner: 'probe-alpha', activeForm: 'Landing the schema', blocks: ['T-2'], blockedBy: [] },
  { id: 'T-2', subject: 'wire the loader', description: '', state: 'pending', blocks: [], blockedBy: ['T-1'], openBlockedBy: ['T-1'] },
  { id: 'T-3', subject: 'write the docs', description: '', state: 'completed', owner: 'probe-charlie', blocks: [], blockedBy: [] },
];

const mail: MailMessage[] = [
  { msgId: 'm1', from: 'probe-alpha', to: 'team-lead', text: 'long body', summary: 'claimed task 1', ts: FIXTURE_NOW - 30_000, tsIsDelivery: false, read: true },
];

const brief: Brief = {
  model: 'claude-haiku-4-5',
  generatedAt: FIXTURE_NOW - 120_000,
  inputs: { transcripts: 4, tasks: 3, windowMin: 5 },
  paragraphs: [
    { head: 'NOW', text: 'probe-alpha is landing the schema.' },
    { head: 'WAITING', text: 'nobody is waiting on you.' },
    { head: 'NEXT', text: 'T-1 unblocks T-2.' },
  ],
  usage: { in: 9_400, out: 210, costUsd: 0.0031 },
  pending: false,
  signature: 'sig',
};

function draw(over: Partial<Parameters<typeof Overview>[0]> = {}) {
  return render(
    <CastContext value={buildCast(agents, 'none')}>
      <Overview
        agents={agents}
        tasks={tasks}
        mail={mail}
        needsYou={[]}
        brief={brief}
        sessionId="session-98b0b4a7"
        startedAt={FIXTURE_NOW - 3_600_000}
        focused={null}
        onOpenWall={vi.fn()}
        now={FIXTURE_NOW}
        readOnly={false}
        {...over}
      />
    </CastContext>,
  );
}

describe('Overview', () => {
  it('is a scrolling column, not the wall condensed', () => {
    draw();
    const root = screen.getByTestId('overview');
    expect(root.style.flexDirection).toBe('column');
    expect(root.style.overflowY).toBe('auto');
    expect(screen.getByTestId('brief')).toBeTruthy();
    expect(screen.getByTestId('where-it-stands').style.width).toBe('300px');
  });

  it('renders one row per member', () => {
    draw();
    expect(screen.getAllByTestId('overview-row')).toHaveLength(agents.length);
  });
});

describe('the brief panel', () => {
  it('names the model, its inputs and its age beside the text', () => {
    draw();
    expect(screen.getByTestId('brief-meta').textContent)
      .toBe('claude-haiku-4-5 · last 5 min of 4 transcripts + 3 tasks · 2m ago');
    expect(screen.getByTestId('brief-cost').textContent)
      .toBe('9.4k in · 210 out · ≈$0.00 per run · rewrites itself when the team moves');
  });

  it('draws the three paragraphs under their own kickers', () => {
    draw();
    const panel = within(screen.getByTestId('brief'));
    for (const head of ['NOW', 'WAITING', 'NEXT']) expect(panel.getByText(head)).toBeTruthy();
    expect(panel.getByText('T-1 unblocks T-2.')).toBeTruthy();
  });

  it('says the brief has never run rather than drawing empty paragraphs', () => {
    draw({ brief: undefined });
    expect(screen.getByTestId('brief-meta').textContent).toBe('not written yet — nothing has asked for one');
    expect(screen.getByText(/click the header line to write the first one/)).toBeTruthy();
  });

  // The six-minute freeze: the brief said every agent was idle while the rows
  // showed one auditing. Nothing on screen admitted the gap.
  it('says it is behind when the team has moved under it', () => {
    draw({ brief: { ...brief, signature: 'written-against-something-else' } });
    expect(screen.getByTestId('brief-stale').textContent).toBe('behind the rows · rewriting');
  });

  it('says nothing when the reading still matches the rows', () => {
    const current = { ...brief, signature: briefSignature(agents, tasks) };
    draw({ brief: current });
    expect(screen.queryByTestId('brief-stale')).toBeNull();
  });

  it('shows the failure instead of passing off a stale reading as current', () => {
    draw({ brief: { ...brief, error: 'claude: command not found' } });
    expect(screen.getByTestId('brief-error').textContent).toContain('claude: command not found');
  });

  describe('regenerate', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')));
    });
    afterEach(() => vi.unstubAllGlobals());

    // There is no regenerate control: the brief re-reads itself. The meta line
    // is the escape hatch for a run that failed, nothing more.
    it('has no regenerate button', () => {
      draw();
      expect(screen.queryByTestId('brief-regenerate')).toBeNull();
      expect(screen.queryByText('↻ regenerate')).toBeNull();
    });

    it('re-runs from the meta line, which names the route it calls', () => {
      draw();
      const line = screen.getByTestId('brief-meta');
      expect(line.getAttribute('title')).toContain('POST /api/sessions/:id/brief');
      fireEvent.click(line);
      expect(fetch).toHaveBeenCalledWith(
        '/api/sessions/session-98b0b4a7/brief',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('says writing… and refuses a second click while one is in flight', () => {
      draw({ brief: { ...brief, pending: true } });
      expect(screen.getByTestId('brief-pending').textContent).toBe('writing…');
      fireEvent.click(screen.getByTestId('brief-meta'));
      expect(fetch).not.toHaveBeenCalled();
    });

    it('is inert on a read-only console, which cannot spend', () => {
      draw({ readOnly: true });
      fireEvent.click(screen.getByTestId('brief-meta'));
      expect(fetch).not.toHaveBeenCalled();
    });
  });
});

describe('where it stands', () => {
  it('counts the tasks and segments the bar', () => {
    draw();
    expect(screen.getByTestId('task-count').textContent).toBe('1/3');
    const widths = Array.from(screen.getByTestId('task-bar').children).map((c) => (c as HTMLElement).style.width);
    expect(parseFloat(widths[0])).toBeCloseTo(100 / 3);
    expect(parseFloat(widths[1])).toBeCloseTo(100 / 3);
  });

  it('lists the five states', () => {
    draw();
    expect(screen.getAllByTestId('stands-row')).toHaveLength(5);
  });

  it('derives NEXT UNBLOCK from the task list', () => {
    draw();
    expect(screen.getByTestId('next-unblock').textContent)
      .toBe('T-2 is unclaimed but still blocked by T-1.');
  });
});

describe('an agent row', () => {
  const rowFor = (name: string) =>
    within(screen.getAllByTestId('overview-row').find(
      (r) => within(r).getByTestId('overview-name').textContent === name,
    ) as HTMLElement);

  it('shows the claimed task, its subject and the runtime activeForm', () => {
    draw();
    const alpha = rowFor('probe-alpha');
    expect(alpha.getByTestId('row-task-id').textContent).toBe('T-1');
    expect(alpha.getByText('land the schema')).toBeTruthy();
    expect(alpha.getByTestId('row-active-form').textContent).toBe('Landing the schema');
  });

  it('says what an unclaimed agent last closed', () => {
    draw();
    expect(rowFor('probe-charlie').getByTestId('row-idle-note').textContent)
      .toBe('Nothing claimed — idle since T-3 closed');
  });

  it('shows the current tool and the context meter', () => {
    draw();
    const alpha = rowFor('probe-alpha');
    expect(alpha.getByTestId('row-now').textContent).toBe('Bash(sleep 20)');
    expect(alpha.getByTestId('row-context').textContent).toBe('34.5k/1M');
    expect(alpha.getByTestId('row-meter').style.width).toBe('96px');
  });

  it('marks a message to the lead with its recipient', () => {
    draw();
    expect(rowFor('probe-alpha').getByTestId('row-last-kind').textContent).toBe('→ team-lead');
    expect(rowFor('probe-alpha').getByText('claimed task 1')).toBeTruthy();
  });

  it('opens the agent in the wall when the row is clicked', () => {
    const onOpenWall = vi.fn();
    draw({ onOpenWall });
    fireEvent.click(screen.getAllByTestId('overview-row')[1]);
    expect(onOpenWall).toHaveBeenCalledWith('probe-alpha');
  });

  it('tints the focused row', () => {
    draw({ focused: 'probe-alpha' });
    const row = screen.getAllByTestId('overview-row')[1];
    expect(row.getAttribute('aria-current')).toBe('true');
    expect(row.style.background).toBe('var(--color-accent-900)');
  });
});
