import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parseLine } from '../../shared/transcript';
import { readTrace, type AgentTrace, type Role } from './trace';

export interface SessionFiles { sessionId: string; lead: string; agents: Array<{ name: string; role: Role; path: string }> }

const SUBAGENT_FILE = /^agent-a(.+)-[0-9a-f]{16}\.jsonl$/;

// A teammate's meta.json keeps only its name; the lead's Agent call is the one
// record of which definition it was spawned from.
function rolesFromLead(lines: string[]): Map<string, Role> {
  const roles = new Map<string, Role>();
  for (const line of lines) {
    const r = parseLine(line);
    const content = r?.type === 'assistant' ? r.message?.content : undefined;
    if (!Array.isArray(content)) continue;
    for (const b of content as Array<{ type?: string; name?: string; input?: { name?: unknown; subagent_type?: unknown } }>) {
      if (b?.type !== 'tool_use' || b.name !== 'Agent' || typeof b.input?.name !== 'string') continue;
      const type = typeof b.input.subagent_type === 'string' ? b.input.subagent_type : '';
      roles.set(b.input.name, /executor/.test(type) ? 'executor' : /reviewer/.test(type) ? 'reviewer' : 'other');
    }
  }
  return roles;
}

async function readLines(file: string): Promise<string[]> {
  return (await fs.readFile(file, 'utf8')).split('\n');
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
    const seen = new Map<string, number>();
    const agents: SessionFiles['agents'] = [];
    for (const file of files) {
      let name = SUBAGENT_FILE.exec(file)?.[1] ?? file.replace(/\.jsonl$/, '');
      try {
        const meta = JSON.parse(await fs.readFile(path.join(subdir, file.replace(/\.jsonl$/, '.meta.json')), 'utf8')) as { name?: unknown };
        if (typeof meta.name === 'string') name = meta.name;
      } catch {
        // No meta.json: keep the name from the file.
      }
      const role = roles.get(name) ?? 'other';
      const n = (seen.get(name) ?? 0) + 1;
      seen.set(name, n);
      agents.push({ name: n > 1 ? `${name}#${n}` : name, role, path: path.join(subdir, file) }); // a respawn under the same name
    }
    return { sessionId, lead, agents };
  }
  return null;
}

export async function loadTraces(files: SessionFiles): Promise<AgentTrace[]> {
  const traces = [readTrace('team-lead', 'lead', await readLines(files.lead))];
  for (const a of files.agents) traces.push(readTrace(a.name, a.role, await readLines(a.path)));
  return traces;
}
