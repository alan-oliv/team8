import type { Agent, Brief, BriefParagraph, Task } from './domain';

export const BRIEF_WINDOW_MIN = 5;
export const BRIEF_HEADS = ['NOW', 'WAITING', 'NEXT'] as const;

/**
 * What one run is allowed to read. A team that has been going for hours holds
 * far more than five minutes of transcript per agent once several are working,
 * and the brief re-runs on every task-state change — without a cap the bill
 * grows with the session rather than with the window.
 */
export const BRIEF_PROMPT_CAP = 24_000;

const INSTRUCTIONS = `You are writing the standing brief for an operator watching a team of Claude Code agents.

Write exactly three paragraphs, each on its own line, in this form and nothing else:

NOW: what is being worked on right now and what has been found.
WAITING: what waits on the operator, who is idle, who failed.
NEXT: what unblocks what, and whose move it is.

Rules: two or three sentences per paragraph. If the material below is empty or says nothing happened, write that plainly in one short sentence per paragraph — never ask for more material, never address the reader, never speculate about what might be happening. You are writing for a screen, not answering a request. Plain past/present tense, no headings beyond the three labels, no bullet lists, no preamble, no closing remark. Name agents and task ids as they appear below. State only what the material supports — this is a reading of the transcripts, not a guess about intent.`;

function taskBlock(tasks: Task[]): string {
  if (tasks.length === 0) return 'TASK LIST\n(empty)';
  const lines = tasks.map((t) => {
    const owner = t.owner ? `owner ${t.owner}` : 'unclaimed';
    const open = (t.openBlockedBy ?? t.blockedBy).filter(Boolean);
    const blocked = open.length > 0 ? ` · blocked by ${open.join(', ')}` : '';
    return `- ${t.id} [${t.state}] ${owner}${blocked} — ${t.subject}`;
  });
  return `TASK LIST\n${lines.join('\n')}`;
}

function agentBlock(agent: Agent, since: number): string {
  const head = `## ${agent.name} — ${agent.agentType || 'teammate'} · ${agent.model} · ${agent.status}`;
  const recent = agent.transcript.filter((l) => l.ts >= since);
  const body = recent.length === 0
    ? '(nothing in the window)'
    : recent.map((l) => `${l.marker} ${l.text}`).join('\n');
  return `${head}\n${body}`;
}

/**
 * The task list goes in whole and the transcripts fill what is left: a brief
 * that has lost half the task list cannot say what unblocks what, which is one
 * of the three paragraphs it is asked for.
 */
export function briefPrompt(
  agents: Agent[],
  tasks: Task[],
  now: number,
  windowMin = BRIEF_WINDOW_MIN,
): string {
  const since = now - windowMin * 60_000;
  const fixed = `${INSTRUCTIONS}\n\n${taskBlock(tasks)}\n\nTRANSCRIPTS — the last ${windowMin} minutes\n`;
  const budget = Math.max(0, BRIEF_PROMPT_CAP - fixed.length);
  const blocks: string[] = [];
  let used = 0;
  for (const agent of agents) {
    const block = agentBlock(agent, since);
    const trimmed = block.length > budget - used ? `${block.slice(0, Math.max(0, budget - used))}…` : block;
    if (trimmed.length === 0) break;
    blocks.push(trimmed);
    used += trimmed.length + 2;
    if (used >= budget) break;
  }
  return `${fixed}${blocks.join('\n\n')}`;
}

// Tolerates the shapes a small model reaches for around a label it was told to
// use literally: `**NOW:**`, `NOW —`, `### NOW`.
function markOf(text: string, head: string): { start: number; body: number } | null {
  const re = new RegExp(`(?:^|\\n)[ \\t]*[*_#>]{0,4}[ \\t]*${head}[*_]{0,2}[ \\t]*[:\\-\\u2014]?[ \\t]*`, 'i');
  const m = re.exec(text);
  return m ? { start: m.index, body: m.index + m[0].length } : null;
}

export function parseBrief(raw: string): BriefParagraph[] {
  const text = raw.trim();
  const marks = BRIEF_HEADS.map((head) => ({ head, mark: markOf(text, head) }));
  if (marks.every((m) => m.mark === null)) {
    // No labels at all: the whole answer is the reading, and NOW is where it goes.
    return BRIEF_HEADS.map((head) => ({ head, text: head === 'NOW' ? text : '' }));
  }
  return marks.map(({ head, mark }, i) => {
    if (!mark) return { head, text: '' };
    const next = marks.slice(i + 1).find((m) => m.mark !== null && m.mark.start > mark.start);
    const body = text.slice(mark.body, next?.mark?.start);
    return { head, text: body.trim().replace(/\s+/g, ' ') };
  });
}

/**
 * The task half of the signature: the set of tasks, their states and their
 * owners. Text edits to a subject do not move the brief.
 */
export function taskSignature(tasks: Task[]): string {
  return tasks
    .map((t) => `${t.id}:${t.state}:${t.owner ?? ''}`)
    .sort()
    .join('|');
}

/**
 * Everything the brief's three paragraphs actually describe — not just the task
 * list. Gating on tasks alone froze the panel for six minutes at a stretch while
 * an agent worked: WAITING went on saying "all agents are idle" because no task
 * had moved. Who is working and what they have found belong in the trigger.
 *
 * `currentTool` deliberately does NOT: it changes every few seconds, and the
 * brief does not report tool calls. The floor interval in `createBriefs` is what
 * bounds the cost of the rest.
 */
export function briefSignature(agents: Agent[], tasks: Task[]): string {
  const roster = agents
    .map((a) => `${a.name}:${a.status}:${a.transcript.filter((l) => l.marker === '!').length}`)
    .sort()
    .join('|');
  return `${taskSignature(tasks)}#${roster}`;
}

/**
 * Whether there is anything to read at all. Without this the first automatic run
 * on a quiet session handed the model an empty task list and an empty window,
 * and it answered by asking the reader to supply the transcripts — which the
 * parser then rendered as the NOW paragraph.
 */
export function briefHasMaterial(agents: Agent[], tasks: Task[], now: number, windowMin = BRIEF_WINDOW_MIN): boolean {
  if (tasks.length > 0) return true;
  const since = now - windowMin * 60_000;
  return agents.some((a) => a.transcript.some((l) => l.ts >= since));
}

export function briefIsStale(brief: Brief | undefined, agents: Agent[], tasks: Task[]): boolean {
  return brief !== undefined && brief.signature !== briefSignature(agents, tasks);
}
