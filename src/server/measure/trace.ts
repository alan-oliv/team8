import { parseTeammateFrames } from '../../shared/mailbox';
import { parseLine, type TranscriptRecord } from '../../shared/transcript';
import { totalCost, usageRecordsOf } from '../../shared/usage';
import { classifyTool, type Category } from './classify';

export interface ModelCall {
  id: string;
  model: string;
  effort?: string; // the record's top-level `effort`, e.g. 'max'
  requestedAt: number; // the later of the last user line and the previous call's last line
  firstAt: number;
  lastAt: number;
  outputTokens: number;
  stopReason?: string;
  toolIds: string[];
}
export interface ToolSpan { id: string; name: string; category: Category; command?: string; startAt: number; endAt: number; unfinished: boolean }
export type IncomingKind = 'message' | 'idle' | 'task-notification' | 'user';
export interface Incoming { at: number; kind: IncomingKind; from?: string; text: string }
export interface Send { at: number; from: string; to: string; text: string }
export interface TaskEvent { at: number; by: string; taskId: string; status?: string; owner?: string; addBlockedBy?: string[] }
export type Role = 'lead' | 'executor' | 'reviewer' | 'other';
export interface AgentTrace {
  name: string;
  role: Role;
  firstAt: number;
  lastAt: number;
  calls: ModelCall[];
  tools: ToolSpan[];
  incoming: Incoming[];
  sends: Send[];
  taskEvents: TaskEvent[];
  costUsd: number;
}

type Rec = TranscriptRecord & { effort?: string; requestId?: string; isMeta?: boolean };
interface Block { type?: string; id?: string; name?: string; input?: unknown; tool_use_id?: string; content?: unknown; text?: string }

const BACKGROUND_ID = /running in background with ID: (\w+)/;
const BACKGROUND_POLL = /tasks\/(\w+)\.output/;
const CREATED_TASK = /Task #(\d+) created/;
const NOT_A_MESSAGE = /^<(system-reminder|local-command|command-)/;

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return (content as Block[])
    .map((b) => (b?.type === 'text' ? b.text ?? '' : b?.type === 'tool_result' ? textOf(b.content) : ''))
    .join('\n');
}

export function readTrace(name: string, role: Role, lines: string[]): AgentTrace {
  const records = lines.map(parseLine).filter((r): r is Rec => r !== null);
  const trace: AgentTrace = { name, role, firstAt: Infinity, lastAt: -Infinity, calls: [], tools: [], incoming: [], sends: [], taskEvents: [], costUsd: 0 };
  const callsById = new Map<string, ModelCall>();
  const tools = new Map<string, ToolSpan>();
  const background = new Map<string, Category>(); // background command id -> the category of what it runs
  const creates = new Set<string>(); // TaskCreate tool ids whose result carries the new task's number
  let lastUserAt = -Infinity;

  records.forEach((r, i) => {
    const at = r.timestamp ? Date.parse(r.timestamp) : NaN;
    if (Number.isNaN(at)) return;
    trace.firstAt = Math.min(trace.firstAt, at);
    trace.lastAt = Math.max(trace.lastAt, at);

    if (r.type === 'attachment') {
      // team8's inbox hook hands a busy teammate its messages as injected context; those are deliveries too.
      const a = (r as { attachment?: { type?: string; content?: unknown } }).attachment;
      if (a?.type !== 'hook_additional_context') return;
      for (const text of Array.isArray(a.content) ? a.content : [a.content]) {
        if (typeof text !== 'string') continue;
        for (const f of parseTeammateFrames(text, at, name)) {
          trace.incoming.push({ at, kind: f.protocol?.type === 'idle_notification' ? 'idle' : 'message', from: f.from, text: f.text });
        }
      }
      return;
    }

    if (r.type === 'assistant') {
      const m = (r.message ?? {}) as NonNullable<Rec['message']> & { stop_reason?: string | null };
      if (m.model === '<synthetic>') return;
      const id = m.id ?? r.requestId ?? `line:${i}`;
      let call = callsById.get(id);
      if (!call) {
        const previous = trace.calls[trace.calls.length - 1];
        const requestedAt = Math.max(lastUserAt, previous?.lastAt ?? -Infinity);
        call = { id, model: m.model ?? 'unknown', effort: r.effort, requestedAt: Number.isFinite(requestedAt) ? requestedAt : at, firstAt: at, lastAt: at, outputTokens: 0, toolIds: [] };
        callsById.set(id, call);
        trace.calls.push(call);
      }
      call.lastAt = Math.max(call.lastAt, at);
      call.outputTokens = Math.max(call.outputTokens, m.usage?.output_tokens ?? 0);
      if (m.stop_reason) call.stopReason = m.stop_reason;
      for (const b of (Array.isArray(m.content) ? m.content : []) as Block[]) {
        if (b?.type !== 'tool_use' || !b.id || !b.name) continue;
        const input = (b.input ?? {}) as Record<string, unknown>;
        const command = str(input.command);
        const polled = command ? BACKGROUND_POLL.exec(command)?.[1] : undefined;
        const category = (polled && background.get(polled)) || classifyTool(b.name, input);
        tools.set(b.id, { id: b.id, name: b.name, category, command, startAt: at, endAt: at, unfinished: true });
        call.toolIds.push(b.id);
        if (b.name === 'SendMessage' && typeof input.to === 'string') {
          trace.sends.push({ at, from: name, to: input.to, text: typeof input.message === 'string' ? input.message : JSON.stringify(input.message ?? '') });
        }
        if (b.name === 'TaskUpdate' && input.taskId != null) {
          trace.taskEvents.push({
            at,
            by: name,
            taskId: String(input.taskId),
            status: str(input.status),
            owner: str(input.owner),
            addBlockedBy: Array.isArray(input.addBlockedBy) ? input.addBlockedBy.map(String) : undefined,
          });
        }
        if (b.name === 'TaskCreate') creates.add(b.id);
      }
      return;
    }

    if (r.type !== 'user') return;
    lastUserAt = at;
    const content = r.message?.content;
    const results = (Array.isArray(content) ? (content as Block[]) : []).filter((b) => b?.type === 'tool_result');
    for (const b of results) {
      const span = b.tool_use_id ? tools.get(b.tool_use_id) : undefined;
      if (!span || !span.unfinished) continue;
      span.endAt = at;
      span.unfinished = false;
      const output = textOf(b.content);
      const backgroundId = BACKGROUND_ID.exec(output)?.[1];
      if (backgroundId) background.set(backgroundId, span.category);
      if (creates.delete(span.id)) {
        const taskId = CREATED_TASK.exec(output)?.[1];
        if (taskId) trace.taskEvents.push({ at, by: name, taskId, status: 'pending' });
      }
    }
    if (results.length || r.isMeta) return;
    const text = textOf(content);
    if (!text.trim() || NOT_A_MESSAGE.test(text.trim())) return;
    const frames = parseTeammateFrames(text, at, name);
    if (frames.length) {
      for (const f of frames) trace.incoming.push({ at, kind: f.protocol?.type === 'idle_notification' ? 'idle' : 'message', from: f.from, text: f.text });
    } else {
      trace.incoming.push({ at, kind: text.includes('<task-notification') ? 'task-notification' : 'user', text });
    }
  });

  trace.tools = [...tools.values()];
  trace.costUsd = totalCost(usageRecordsOf(records));
  if (!Number.isFinite(trace.firstAt)) trace.firstAt = trace.lastAt = 0;
  return trace;
}
