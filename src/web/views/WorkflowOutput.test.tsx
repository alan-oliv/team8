// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { WorkflowAgent, WorkflowRun as Run } from '../../shared/domain';
import { clockLabel } from '../format';
import { WorkflowOutput } from './WorkflowOutput';

afterEach(cleanup);

const agent = (over: Partial<WorkflowAgent> & { agentId: string }): WorkflowAgent => ({
  state: 'done',
  ...over,
});

const RETURNED: Run = {
  runId: 'wf_d36b25c0-f96',
  status: 'completed',
  live: false,
  startedAt: 1787921982823,
  durationMs: 2930000,
  agentCount: 2,
  logs: [],
  phases: [],
  agents: [agent({ agentId: 'a1' }), agent({ agentId: 'a2' })],
  result: '# Title\n\na two word brief',
};

describe('WorkflowOutput', () => {
  it('renders the full return value as a document once the run has finished', () => {
    render(<WorkflowOutput run={RETURNED} now={0} />);
    expect(screen.getByTestId('wf-output-doc').textContent).toContain('a two word brief');
    expect(screen.getByTestId('wf-output-head').textContent).toContain(
      clockLabel(RETURNED.startedAt! + RETURNED.durationMs!),
    );
  });

  it('copies the return value verbatim', () => {
    const writeText = vi.fn();
    Object.assign(navigator, { clipboard: { writeText } });
    render(<WorkflowOutput run={RETURNED} now={0} />);
    fireEvent.click(screen.getByTestId('wf-output-copy'));
    expect(writeText).toHaveBeenCalledWith(RETURNED.result);
  });

  it('says there is nothing to read yet while the run is live, with elapsed and agent count', () => {
    const live: Run = { ...RETURNED, live: true, status: 'running', result: undefined, startedAt: 1000, durationMs: undefined };
    render(<WorkflowOutput run={live} now={1000 + 5000} />);
    expect(screen.getByTestId('wf-output-empty').textContent).toMatch(/no output yet/i);
    expect(screen.queryByTestId('wf-output-doc')).toBeNull();
  });

  it('says the script returned nothing once a finished run has no result', () => {
    render(<WorkflowOutput run={{ ...RETURNED, result: undefined }} now={0} />);
    expect(screen.getByTestId('wf-output-empty').textContent).toMatch(/returned nothing/i);
  });

  it('names a failed or killed run rather than reusing the no-result message', () => {
    render(<WorkflowOutput run={{ ...RETURNED, status: 'failed', result: undefined }} now={0} />);
    expect(screen.getByTestId('wf-output-empty').textContent).toMatch(/failed/i);
  });

  describe('a structured return', () => {
    const STRUCTURED: Run = {
      ...RETURNED,
      result: '{"question":"What matters?","findings":[{"claim":"Sleep matters","sources":["https://example.com/a"]}]}',
    };

    it('lays it out as labeled sections rather than one dense JSON line', () => {
      render(<WorkflowOutput run={STRUCTURED} now={0} />);
      const sections = screen.getAllByTestId('wf-output-section').map((s) => s.textContent ?? '');
      expect(sections.some((t) => t.includes('QUESTION'))).toBe(true);
      expect(sections.some((t) => t.includes('FINDINGS'))).toBe(true);
    });

    it('links a source that looks like a URL instead of printing it as text', () => {
      render(<WorkflowOutput run={STRUCTURED} now={0} />);
      expect(screen.getByRole('link', { name: 'https://example.com/a' })).toBeTruthy();
    });

    it('counts fields rather than words in the header', () => {
      render(<WorkflowOutput run={STRUCTURED} now={0} />);
      expect(screen.getByTestId('wf-output-head').textContent).toContain('2 fields');
    });

    it('copies it pretty-printed rather than as the raw dense string', () => {
      const writeText = vi.fn();
      Object.assign(navigator, { clipboard: { writeText } });
      render(<WorkflowOutput run={STRUCTURED} now={0} />);
      fireEvent.click(screen.getByTestId('wf-output-copy'));
      expect(writeText).toHaveBeenCalledWith(JSON.stringify(JSON.parse(STRUCTURED.result!), null, 2));
    });

    it('saves it as .json rather than mislabeling it .md', () => {
      // A rendered `<a>` source link (see `Bullet`) also goes through
      // document.createElement, so the download anchor is whichever one
      // gets created AFTER the click, not just the first one seen.
      const created: HTMLAnchorElement[] = [];
      const realCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = realCreateElement(tag);
        if (tag === 'a') created.push(el as HTMLAnchorElement);
        return el;
      });
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      render(<WorkflowOutput run={STRUCTURED} now={0} />);
      fireEvent.click(screen.getByTestId('wf-output-save'));

      expect(created.at(-1)?.download).toBe(`${STRUCTURED.runId}.json`);
      vi.restoreAllMocks();
    });
  });

  it('beautifies a top-level array or primitive rather than sectioning it', () => {
    render(<WorkflowOutput run={{ ...RETURNED, result: '[1,2,3]' }} now={0} />);
    expect(screen.queryAllByTestId('wf-output-section')).toHaveLength(0);
    expect(screen.getByTestId('wf-output-doc').textContent).toContain('1');
  });

  describe('a "stats" field', () => {
    const WITH_STATS: Run = {
      ...RETURNED,
      result: '{"question":"q","stats":{"angles":5,"claimsExtracted":93}}',
    };

    it('draws it as a KPI row rather than another scrolled-past section', () => {
      render(<WorkflowOutput run={WITH_STATS} now={0} />);
      const bar = screen.getByTestId('wf-output-statbar');
      expect(bar.textContent).toContain('ANGLES');
      expect(bar.textContent).toContain('5');
      expect(bar.textContent).toContain('CLAIMS EXTRACTED');
      expect(bar.textContent).toContain('93');
    });

    it('does not also list stats among the ordinary sections', () => {
      render(<WorkflowOutput run={WITH_STATS} now={0} />);
      const sections = screen.getAllByTestId('wf-output-section').map((s) => s.textContent ?? '');
      expect(sections.some((t) => t.includes('STATS'))).toBe(false);
    });

    it('draws no stat bar for a return with no stats field', () => {
      render(<WorkflowOutput run={RETURNED} now={0} />);
      expect(screen.queryByTestId('wf-output-statbar')).toBeNull();
    });
  });
});
