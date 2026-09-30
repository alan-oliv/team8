# team8 message delivery Implementation Plan

> **For agentic workers:** this plan is executed by teammates that `team8:run` dispatches from the shared task list. Read your own task section. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A teammate sees a message from the lead after its next tool call, not when its turn ends. `measure` shows those early deliveries.

**Architecture:**
- A second PostToolUse hook runs `plugin/dist/hooks/inbox-deliver.js`, bundled from `src/hooks/inbox-deliver.ts`. A bash pre-filter in front of it skips the lead, whose hooks have no `agent_id`.
- For a teammate, the hook:
  1. finds the teammate's `meta.json` beside its transcript, which gives its `name` and `teamName`;
  2. locks `~/.claude/teams/<teamName>/inboxes/<name>.json` the way the console's mailbox writer does;
  3. marks the unread plain messages read;
  4. returns them as `hookSpecificOutput.additionalContext`, in the same `<teammate-message>` frames Claude Code uses.
- Claude Code skips `read: true` entries at turn end, so nothing arrives twice.
- `measure`'s trace reader learns to read those frames from `hook_additional_context` attachments.

**Tech Stack:** TypeScript on Node 22; esbuild for the bundle, as for the server; `proper-lockfile`, already a dependency; Vitest; `expect` to drive an interactive Claude Code session for the live test.

**Spec:** `docs/team8/specs/2026-09-30-team8-speed-design.md`, section 2.

## Global Constraints

- **Workspace.** Work in the worktree `~/code/team8-speed` on the branch `delivery`, which is already checked out. Never touch the main checkout `~/code/team8`.
- **Build output.** Never commit `plugin/dist/`: the bump workflow builds and commits it after merge. You may run `npm run build:hooks` locally for the live test, and must leave its output uncommitted. Never run `npm install`, `npm ci` or the full `npm run build`.
- **Never block a tool call.** The hook command always exits 0, prints nothing unless it delivers something, and gives up quietly on any error. It's on every PostToolUse of every agent.
- **Injected context.** Claude Code caps it at 10,000 characters, so the hook keeps what it delivers under 9,000 and leaves the rest for turn end.
- **Protocol entries** (shutdown, plan approval, permission frames) are never delivered early.
- **Dependencies.** Add none.
- **Tests** live under `src/`.
- **Commits.** Plain imperative sentences. No AI attribution.

## File Structure

| File | Responsibility |
|---|---|
| `src/hooks/inbox-deliver.ts` | `metaCandidates`, `inboxFor`, `takeDeliverable`, `frame`, `contextFor`, `deliver`, and the stdin → stdout entry point |
| `src/hooks/inbox-deliver.test.ts` | the hook's behaviour against temp directories |
| `package.json` | `build:hooks`, and `build` runs it |
| `plugin/hooks/hooks.json` | the second PostToolUse entry, and a sentence in `description` |
| `src/server/measure/trace.ts` | reads `hook_additional_context` attachments as incoming messages |
| `src/server/measure/trace.test.ts` | one test for it |
| `.claude/commands/bench.md` | the `delivery` scenario |
| `.claude/bench/delivery.exp` | the expect script that drives the interactive session for it |

---

### Task 1: The delivery hook

**Files:**
- Create: `src/hooks/inbox-deliver.ts`, `src/hooks/inbox-deliver.test.ts`
- Modify: `package.json` (scripts), `plugin/hooks/hooks.json`

**Interfaces:**
- Consumes: `parseInboxEntry` and `InboxEntry` (`src/shared/mailbox.ts`), `atomicWrite` (`src/server/control/mailbox.ts`), `proper-lockfile`
- Produces:
  - the PostToolUse hook, which Task 3 tests live;
  - its context text starts with "Messages that reached you mid-turn", which Task 2 need not match, since it parses the frames;
  - `npm run build:hooks`.

- [ ] **Step 1: Write the failing test** in `src/hooks/inbox-deliver.test.ts`

```ts
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { InboxEntry } from '../shared/mailbox';
import { deliver, metaCandidates } from './inbox-deliver';

const ID = 'arows-0123456789abcdef';
const msg = (text: string, over: Partial<InboxEntry> = {}): InboxEntry => ({
  from: 'team-lead', text, summary: 'note', timestamp: '2026-09-30T20:00:00.000Z', msgV: 1, msg_id: text.slice(0, 8), type: 'message', read: false, ...over,
});

async function setup(meta: object, entries: InboxEntry[] | null) {
  const home = await mkdtemp(path.join(os.tmpdir(), 'inbox-deliver-'));
  const project = path.join(home, 'projects', 'proj');
  await mkdir(path.join(project, 'sid', 'subagents'), { recursive: true });
  await writeFile(path.join(project, 'sid.jsonl'), '');
  await writeFile(path.join(project, 'sid', 'subagents', `agent-${ID}.meta.json`), JSON.stringify(meta));
  const inbox = path.join(home, 'teams', 't1', 'inboxes', 'rows.json');
  if (entries) {
    await mkdir(path.dirname(inbox), { recursive: true });
    await writeFile(inbox, JSON.stringify(entries));
  }
  return { teams: path.join(home, 'teams'), inbox, input: { agent_id: ID, session_id: 'sid', transcript_path: path.join(project, 'sid.jsonl') } };
}
const readInbox = async (f: string) => JSON.parse(await readFile(f, 'utf8')) as InboxEntry[];
const outputOf = (out: string | null) => (JSON.parse(out!) as { hookSpecificOutput: { hookEventName: string; additionalContext: string } }).hookSpecificOutput;

describe('metaCandidates', () => {
  it("looks beside a subagent's own transcript, then under the lead's session folder", () => {
    expect(metaCandidates({ agent_id: ID, session_id: 'sid', transcript_path: `/p/proj/sid/subagents/agent-${ID}.jsonl` })[0]).toBe(`/p/proj/sid/subagents/agent-${ID}.meta.json`);
    expect(metaCandidates({ agent_id: ID, session_id: 'sid', transcript_path: '/p/proj/lead.jsonl' })).toEqual([
      `/p/proj/lead/subagents/agent-${ID}.meta.json`,
      `/p/proj/sid/subagents/agent-${ID}.meta.json`,
    ]);
    expect(metaCandidates({ session_id: 'sid', transcript_path: '/p/proj/lead.jsonl' })).toEqual([]);
  });
});

describe('deliver', () => {
  it('hands over unread plain messages, marks them read, and leaves protocol frames and read ones alone', async () => {
    const shutdown = msg(JSON.stringify({ type: 'shutdown_request', request_id: 'r1' }));
    const { teams, inbox, input } = await setup({ name: 'rows', teamName: 't1' }, [msg('Fix the header, please.'), shutdown, msg('Old news.', { read: true })]);
    const out = outputOf(await deliver(input, teams));
    expect(out.hookEventName).toBe('PostToolUse');
    expect(out.additionalContext).toContain('<teammate-message teammate_id="team-lead" summary="note">\nFix the header, please.\n</teammate-message>');
    expect(out.additionalContext).not.toContain('shutdown_request');
    expect(out.additionalContext).not.toContain('Old news.');
    expect((await readInbox(inbox)).map((e) => e.read)).toEqual([true, false, true]);
  });

  it('returns nothing and leaves the inbox alone when nothing is unread', async () => {
    const { teams, inbox, input } = await setup({ name: 'rows', teamName: 't1' }, [msg('Old news.', { read: true })]);
    const before = await readFile(inbox, 'utf8');
    expect(await deliver(input, teams)).toBeNull();
    expect(await readFile(inbox, 'utf8')).toBe(before);
  });

  it('does nothing for a plain subagent, whose meta names no team, or when the inbox does not exist', async () => {
    expect(await deliver((await setup({ name: 'x' }, null)).input, '/nonexistent')).toBeNull();
    const { teams, input } = await setup({ name: 'rows', teamName: 't1' }, null);
    expect(await deliver(input, teams)).toBeNull();
  });

  it('leaves messages past the context cap for the end of the turn, and says so', async () => {
    const big = 'x'.repeat(6_000);
    const { teams, inbox, input } = await setup({ name: 'rows', teamName: 't1' }, [msg(`A${big}`), msg(`B${big}`)]);
    const out = outputOf(await deliver(input, teams));
    expect(out.additionalContext).toContain(`A${big}`);
    expect(out.additionalContext).not.toContain(`B${big}`);
    expect(out.additionalContext).toContain('1 more message will arrive when your turn ends.');
    expect((await readInbox(inbox)).map((e) => e.read)).toEqual([true, false]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/hooks/inbox-deliver.test.ts`
Expected: FAIL, because `./inbox-deliver` doesn't exist.

- [ ] **Step 3: Write `src/hooks/inbox-deliver.ts`**

```ts
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import lockfile from 'proper-lockfile';
import { atomicWrite } from '../server/control/mailbox';
import { parseInboxEntry, type InboxEntry } from '../shared/mailbox';

export interface HookInput { agent_id?: string; session_id?: string; transcript_path?: string }

// Claude Code caps injected context at 10,000 characters; what doesn't fit arrives at turn end as before.
const CAP = 9_000;

// A teammate's meta.json (name, teamName) sits beside its transcript:
// <project>/<session>/subagents/agent-<agent_id>.meta.json. The team's own leadSessionId
// can't lead there: after a resume the lead's session id is not the team's.
export function metaCandidates(input: HookInput): string[] {
  const { agent_id: id, session_id: sid, transcript_path: transcript } = input;
  if (!id || !transcript) return [];
  const file = `agent-${id}.meta.json`;
  const dir = path.dirname(transcript);
  return [
    ...(path.basename(dir) === 'subagents' ? [path.join(dir, file)] : []),
    path.join(dir, path.basename(transcript, '.jsonl'), 'subagents', file),
    ...(sid && sid !== path.basename(transcript, '.jsonl') ? [path.join(dir, sid, 'subagents', file)] : []),
  ];
}

export function inboxFor(input: HookInput, teamsRoot: string): { inbox: string; name: string } | null {
  for (const candidate of metaCandidates(input)) {
    if (!existsSync(candidate)) continue;
    const meta = JSON.parse(readFileSync(candidate, 'utf8')) as { name?: unknown; teamName?: unknown };
    if (typeof meta.name !== 'string' || typeof meta.teamName !== 'string') return null; // a plain subagent: no team, no inbox
    return { inbox: path.join(teamsRoot, meta.teamName, 'inboxes', `${meta.name}.json`), name: meta.name };
  }
  return null;
}

export function frame(e: InboxEntry): string {
  const summary = e.summary ? ` summary="${e.summary.replace(/"/g, "'")}"` : '';
  return `<teammate-message teammate_id="${e.from}"${summary}>\n${e.text}\n</teammate-message>`;
}

// Unread plain messages, oldest first, that fit under the cap. Protocol frames wait for turn end.
export function takeDeliverable(entries: InboxEntry[], to: string): { take: number[]; left: number } {
  const take: number[] = [];
  let size = 0;
  let left = 0;
  entries.forEach((e, i) => {
    if (e.read || parseInboxEntry(e, to).protocol) return;
    const n = frame(e).length;
    if (size + n > CAP) {
      left++;
      return;
    }
    size += n;
    take.push(i);
  });
  return { take, left };
}

export function contextFor(delivered: InboxEntry[], left: number): string {
  const lines = ['Messages that reached you mid-turn (team8 delivered them early; they will not repeat at the end of your turn):', ...delivered.map(frame)];
  if (left) lines.push(`${left} more message${left === 1 ? '' : 's'} will arrive when your turn ends.`);
  return lines.join('\n');
}

export async function deliver(input: HookInput, teamsRoot: string): Promise<string | null> {
  const target = inboxFor(input, teamsRoot);
  if (!target || !existsSync(target.inbox)) return null;
  // The same lock the console's mailbox writer and Claude Code take on an inbox.
  const release = await lockfile.lock(target.inbox, {
    lockfilePath: `${target.inbox}.lock`,
    realpath: false,
    retries: { retries: 20, minTimeout: 10, maxTimeout: 200 },
  });
  try {
    const entries = JSON.parse(readFileSync(target.inbox, 'utf8')) as InboxEntry[];
    if (!Array.isArray(entries)) return null;
    const { take, left } = takeDeliverable(entries, target.name);
    if (!take.length) return null;
    for (const i of take) entries[i] = { ...entries[i], read: true };
    await atomicWrite(target.inbox, JSON.stringify(entries, null, 2));
    return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: contextFor(take.map((i) => entries[i]), left) } });
  } finally {
    await release();
  }
}

// The PostToolUse hook: hook JSON on stdin, hook output on stdout, silence on anything else.
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  let raw = '';
  process.stdin.on('data', (chunk) => (raw += chunk));
  process.stdin.on('end', () => {
    const teamsRoot = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'teams');
    Promise.resolve()
      .then(() => deliver(JSON.parse(raw || '{}') as HookInput, teamsRoot))
      .then((out) => { if (out) process.stdout.write(out); }, () => {})
      .finally(() => process.exit(0));
  });
}
```

`metaCandidates`' third candidate is skipped when the session id equals the transcript's basename, so the test's lead-transcript case lists two paths, not a duplicate. Check the test expectation matches: `/p/proj/lead.jsonl` with session `sid` gives the `lead` folder, then the `sid` folder.

- [ ] **Step 4: Run it and see it pass**

Run: `npx vitest run src/hooks/inbox-deliver.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Bundle it**

In `package.json` `scripts`:
- add `"build:hooks": "esbuild src/hooks/inbox-deliver.ts --bundle --platform=node --format=esm --target=node22 --outfile=plugin/dist/hooks/inbox-deliver.js --banner:js=\"import{createRequire}from'module';const require=createRequire(import.meta.url);\""`, with the same banner as `build:server`;
- change `build` to `"vite build && npm run build:server && npm run build:hooks"`.

Run `npm run build:hooks`, then:
- `echo '{}' | node plugin/dist/hooks/inbox-deliver.js; echo "exit $?"` should print only `exit 0`;
- `echo 'not json' | node plugin/dist/hooks/inbox-deliver.js; echo "exit $?"` should also print only `exit 0`.
Leave `plugin/dist/hooks/` uncommitted.

- [ ] **Step 6: Register the hook** in `plugin/hooks/hooks.json`

Add this object to the `"PostToolUse"` array, right after the existing `"matcher": "*"` console entry:

```json
{
  "hooks": [
    {
      "type": "command",
      "command": "input=$(cat); case \"$input\" in *'\"agent_id\"'*) printf '%s' \"$input\" | node \"${CLAUDE_PLUGIN_ROOT}/dist/hooks/inbox-deliver.js\" 2>/dev/null;; esac; exit 0",
      "timeout": 5
    }
  ],
  "matcher": "*"
}
```

Then append this sentence to the end of the file's `"description"` string: `A second PostToolUse hook, inbox-deliver.js, hands a teammate its unread messages as added context after each of its tool calls and marks them read, so the delivery at the end of its turn skips them; the lead's hooks carry no agent_id and never start it.`

Check it:
- `node -e "JSON.parse(require('fs').readFileSync('plugin/hooks/hooks.json','utf8'))"` succeeds;
- `grep -rln "hooks.json" src --include='*.test.ts'` lists the tests that read the file. Run them.

- [ ] **Step 7: Verify and commit**

Run: `npx vitest run src/hooks/ && npm run typecheck`, plus the hooks.json tests from Step 6.
Expected: all pass; the typecheck exits 0.

```bash
git add src/hooks/inbox-deliver.ts src/hooks/inbox-deliver.test.ts
git commit -m "Hand a busy teammate its messages after its next tool call" -- src/hooks/inbox-deliver.ts src/hooks/inbox-deliver.test.ts package.json plugin/hooks/hooks.json
```

### Task 2: `measure` reads early deliveries

**Files:**
- Modify: `src/server/measure/trace.ts`, `src/server/measure/trace.test.ts`

**Interfaces:**
- Consumes: `parseTeammateFrames` (`src/shared/mailbox.ts`)
- Produces: early deliveries show up in `AgentTrace.incoming` at the attachment's time, so `messageLags` matches them

- [ ] **Step 1: Write the failing test** at the end of the `describe('readTrace', …)` block in `src/server/measure/trace.test.ts`

```ts
  it('reads messages the inbox hook injected mid-turn as incoming, at the attachment time', () => {
    const t = readTrace('rows', 'executor', [
      user(0, 'go'),
      JSON.stringify({
        type: 'attachment',
        timestamp: at(7),
        attachment: {
          type: 'hook_additional_context',
          content: ['Messages that reached you mid-turn (team8 delivered them early; they will not repeat at the end of your turn):\n<teammate-message teammate_id="team-lead" summary="x">\nFix the header, please.\n</teammate-message>'],
        },
      }),
      JSON.stringify({ type: 'attachment', timestamp: at(8), attachment: { type: 'hook_additional_context', content: ['PONYTAIL MODE ACTIVE'] } }),
    ]);
    expect(t.incoming.filter((m) => m.kind === 'message')).toMatchObject([{ at: T0 + 7000, from: 'team-lead' }]);
    expect(t.incoming.find((m) => m.kind === 'message')?.text).toContain('Fix the header, please.');
  });
```

Run `npx vitest run src/server/measure/trace.test.ts`. Expected: this test FAILS, because attachments are skipped today, and the others pass.

- [ ] **Step 2: Read the attachment** in `src/server/measure/trace.ts`

Inside `records.forEach`, right after the `trace.lastAt = …` line and before `if (r.type === 'assistant')`, add:

```ts
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
```

- [ ] **Step 3: Verify and commit**

Run: `npx vitest run src/server/measure/ && npm run typecheck`
Expected: all pass; the typecheck exits 0.

```bash
git commit -m "Count messages a teammate got mid-turn as delivered in measure" -- src/server/measure/trace.ts src/server/measure/trace.test.ts
```

### Task 3: The `delivery` bench scenario, run before and after

**Files:**
- Modify: `.claude/commands/bench.md`
- Create: `.claude/bench/delivery.exp`

**Interfaces:**
- Consumes: Tasks 1 and 2, and `measure`
- Produces: the before and after numbers in the report, for the PR description and the run log

This scenario needs teammates, and `claude -p` never forms a team, so it drives an interactive session with `expect`. `tmux` isn't installed.

- [ ] **Step 1: Write the harness** `.claude/bench/delivery.exp`

- **Usage:** `expect .claude/bench/delivery.exp <workdir> [extra claude args…]`.
- **What it does:**
  1. Spawn `claude --dangerously-skip-permissions <extra args>` in `<workdir>`, with a 60 s timeout per wait.
  2. If the folder-trust question appears, accept its default with Enter.
  3. Once the input prompt is ready, send the lead prompt below as one line, then Enter.
  4. Wait until the session's transcript on disk shows the lead's final reply, polling the newest `.jsonl` under `~/.claude/projects/<slug of workdir>/` rather than reading the TUI. Give up after 6 min.
  5. Send `/exit` and Enter.
- **Output:** print the lead's session id (the transcript's file name) on its last line.
- **Lead prompt,** one line:
  `Spawn a teammate with the Agent tool: name ping, subagent_type general-purpose, model sonnet, with this prompt: "Make 15 Bash calls one after another, never batched, each exactly: sleep 4; date +%H:%M:%S. After each call, check whether a message starting with PROBE has reached you, and note the first call after which you saw it and the time it printed. After call 15, reply with exactly one line: PROBE_SEEN after_call=<n or none> at=<time or none> last_time=<time printed by call 15>. Then go idle." Once the Agent call returns, run the Bash command sleep 15, then send ping this with SendMessage: PROBE timing probe. Then wait for ping's idle notification and reply with its result line only.`
- **Attempts:** at most three. If the TUI can't be driven reliably by then, stop and report what failed, and the lead will ask the user to run the prompt by hand.

- [ ] **Step 2: Add the scenario** to `.claude/commands/bench.md`, after `### effort`:

```markdown
### delivery

Checks that a message reaches a busy teammate after its next tool call, not when its turn ends.

- Needs an interactive session, since `claude -p` forms no team: `expect .claude/bench/delivery.exp <workdir>` drives one.
- Before: run it on the released plugin, with no extra args. After: run `npm run build:hooks`, then run it with `--plugin-dir <worktree>/plugin`.
- Read:
  - ping's result line, `after_call` and `at`;
  - `npx tsx src/server/index.ts measure <lead session id> --json` for the team-lead → ping lag;
  - ping's transcript: the PROBE must appear exactly once.
- Pass: before, `after_call=none`, since it arrives only after the turn. After, the PROBE is seen mid-turn, within 10 s of the send, and appears once.
```

- [ ] **Step 3: Run it before and after**

- **Where:** use a scratch workdir, e.g. `mkdir -p ~/code/meetnotes-scratch/bench-delivery`, not a repo.
- **Before:** `expect .claude/bench/delivery.exp ~/code/meetnotes-scratch/bench-delivery`.
- **After:** `npm run build:hooks`, then `expect .claude/bench/delivery.exp ~/code/meetnotes-scratch/bench-delivery --plugin-dir ~/code/team8-speed/plugin`.
- **Record,** for each run:
  - the lead session id;
  - ping's result line;
  - the lag from `measure` (Task 2 makes early deliveries visible);
  - how many times the PROBE appears in ping's transcript.
- **Don't commit** `plugin/dist/hooks/`.

- [ ] **Step 4: Commit**

```bash
git add .claude/bench/delivery.exp
git commit -m "Add the delivery bench scenario and its expect harness" -- .claude/bench/delivery.exp .claude/commands/bench.md
```

Report a table with the run, `after_call`, the time seen, the lag, and the number of copies, plus the exact commands.
