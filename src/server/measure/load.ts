import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parseLine } from '../../shared/transcript';
import { readTrace, type AgentTrace, type Role } from './trace';

export interface SessionFiles { sessionId: string; lead: string; agents: Array<{ name: string; role: Role; path: string }> }

const SUBAGENT_FILE = /^agent-a(.+)-[0-9a-f]{16}\.jsonl$/;

const roleOf = (type: string): Role => (/executor/.test(type) ? 'executor' : /reviewer/.test(type) ? 'reviewer' : 'other');

// The lead's Agent call names a named teammate's definition: that teammate's
// meta.json gives only its own name as agentType. An unnamed subagent's
// meta.json carries its definition as agentType.
function rolesFromLead(lines: string[]): Map<string, Role> {
  const roles = new Map<string, Role>();
  for (const line of lines) {
    const r = parseLine(line);
    const content = r?.type === 'assistant' ? r.message?.content : undefined;
    if (!Array.isArray(content)) continue;
    for (const b of content as Array<{ type?: string; name?: string; input?: { name?: unknown; subagent_type?: unknown } }>) {
      if (b?.type !== 'tool_use' || b.name !== 'Agent' || typeof b.input?.name !== 'string') continue;
      roles.set(b.input.name, roleOf(typeof b.input.subagent_type === 'string' ? b.input.subagent_type : ''));
    }
  }
  return roles;
}

async function readLines(file: string): Promise<string[]> {
  return (await fs.readFile(file, 'utf8')).split('\n');
}

async function firstTimestamp(file: string): Promise<number> {
  for (const line of await readLines(file)) {
    const at = Date.parse(parseLine(line)?.timestamp ?? '');
    if (!Number.isNaN(at)) return at;
  }
  return Infinity;
}

export async function findSession(claudeHome: string, sessionId: string): Promise<SessionFiles | null> {
  const projects = path.join(claudeHome, 'projects');
  let dirs: string[];
  try {
    dirs = await fs.readdir(projects);
  } catch {
    return null;
  }
  for (const dir of dirs) {
    const lead = path.join(projects, dir, `${sessionId}.jsonl`);
    try {
      await fs.access(lead);
    } catch {
      continue;
    }
    const roles = rolesFromLead(await readLines(lead));
    const subdir = path.join(projects, dir, sessionId, 'subagents');
    let files: string[] = [];
    try {
      files = (await fs.readdir(subdir)).filter((f) => f.endsWith('.jsonl')).sort();
    } catch {
      // A session that never spawned anything has no subagents folder.
    }
    // The file name's hex is random, so only the first timestamp says which incarnation came first.
    const firstAt = new Map<string, number>();
    for (const file of files) firstAt.set(file, await firstTimestamp(path.join(subdir, file)));
    files.sort((a, b) => firstAt.get(a)! - firstAt.get(b)! || 0);
    const seen = new Map<string, number>();
    const agents: SessionFiles['agents'] = [];
    for (const file of files) {
      let name = SUBAGENT_FILE.exec(file)?.[1] ?? file.replace(/\.jsonl$/, '');
      let agentType = '';
      try {
        const meta = JSON.parse(await fs.readFile(path.join(subdir, file.replace(/\.jsonl$/, '.meta.json')), 'utf8')) as { name?: unknown; agentType?: unknown };
        if (typeof meta.name === 'string') name = meta.name;
        if (typeof meta.agentType === 'string') agentType = meta.agentType;
      } catch {
        // No meta.json: keep the name from the file.
      }
      const role = roles.get(name) ?? roleOf(agentType);
      const n = (seen.get(name) ?? 0) + 1;
      seen.set(name, n);
      agents.push({ name: n > 1 ? `${name}#${n}` : name, role, path: path.join(subdir, file) }); // a respawn under the same name
    }
    return { sessionId, lead, agents };
  }
  return null;
}

// A resumed session's file opens with a copy of its parent's history (same
// uuids, sessionId rewritten) before going its own way. A parent that was never
// compacted is copied from its first line, so parent and child each hold the
// other's first uuid; only the child's lines are a run of the other's, then its own.
// ponytail: a parent that kept going after a child copied all of it reads as that child's child; file birth times would tell them apart.
async function withoutCopiedHistory(lead: string, lines: string[]): Promise<string[]> {
  const ids = lines.map((l) => parseLine(l)?.uuid);
  const uuids = ids.filter((u): u is string => !!u);
  if (!uuids.length) return lines;
  const dir = path.dirname(lead);
  const copied = new Set<string>();
  for (const file of await fs.readdir(dir)) {
    const sibling = path.join(dir, file);
    if (!file.endsWith('.jsonl') || sibling === lead) continue;
    const bytes = await fs.readFile(sibling); // searched as bytes: the folder can hold hundreds of MB
    if (!bytes.includes(uuids[0])) continue;
    const theirs = new Set(bytes.toString('utf8').split('\n').map((l) => parseLine(l)?.uuid));
    const own = uuids.findIndex((u) => !theirs.has(u));
    if (own <= 0 || uuids.slice(own).some((u) => theirs.has(u))) continue;
    for (const u of uuids.slice(0, own)) copied.add(u);
  }
  return lines.filter((_, i) => !copied.has(ids[i] ?? ''));
}

export async function loadTraces(files: SessionFiles): Promise<AgentTrace[]> {
  const traces = [readTrace('team-lead', 'lead', await withoutCopiedHistory(files.lead, await readLines(files.lead)))];
  for (const a of files.agents) traces.push(readTrace(a.name, a.role, await readLines(a.path)));
  return traces;
}
