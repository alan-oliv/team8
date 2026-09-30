# team8 effort per role Implementation Plan

> **For agentic workers:** this plan is executed by teammates that `team8:run` dispatches from the shared task list. Read your own task section. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each team8 executor and reviewer runs at the effort its definition names instead of inheriting the lead session's `/effort`, and a task's `effort` metadata picks which executor definition is spawned.

**Architecture:**
- Claude Code gives an agent definition's `effort:` frontmatter precedence over the session's effort. The Agent tool has no effort parameter.
- So every effort a task can ask for is its own definition:
  - `executor-low`, `executor` (medium), `executor-high` and `executor-xhigh`;
  - `reviewer` (high) and `reviewer-light` (medium, which PR 3 will use for re-reviews).
- The variants are generated copies of their base file, and a test fails if one drifts.
- `team8:run` maps a task's effort to the definition it spawns.

**Tech Stack:** Markdown agent definitions and skills; TypeScript and Vitest for the generator and its drift test; `tsx` to run the generator.

**Spec:** `docs/team8/specs/2026-09-30-team8-speed-design.md`, section 1.

## Global Constraints

- **Workspace.** Work in the worktree `~/code/team8-speed` on the branch `effort`, which is already checked out. Never touch the main checkout `~/code/team8`: it holds the user's staged work.
- **Build output.** Never commit `plugin/dist/`, and never run `npm install`, `npm ci` or `npm run build`: they rebuild it.
- **Frontmatter.** Effort values are the ones Claude Code accepts: `low`, `medium`, `high`, `xhigh`, `max`.
- **Generated copies.** A variant's body is its base file's body, byte for byte. Only `name`, `description` and `effort` differ.
- **Dependencies.** Add none.
- **Tests.** Tests live under `src/`, since that is what `vitest.config.ts` includes.
- **Commits.** Plain imperative sentences matching the repo's history. No AI attribution.

## File Structure

| File | Responsibility |
|---|---|
| `plugin/agents/executor.md` | gains `effort: medium` |
| `plugin/agents/reviewer.md` | gains `effort: high` |
| `plugin/agents/executor-low.md`, `executor-high.md`, `executor-xhigh.md`, `reviewer-light.md` | generated variants |
| `src/server/agent-variants.ts` | `VARIANTS`, `variantOf`, `writeVariants`; running it regenerates the variants |
| `src/server/agent-variants.test.ts` | pins the base efforts and fails when a variant drifts from its base |
| `package.json` | `"agents": "tsx src/server/agent-variants.ts"` |
| `plugin/skills/run/SKILL.md` | subagents mode, Track Review step 2 and the Dispatch Contract pick the definition by effort |
| `plugin/skills/tasks/SKILL.md` | says a task's effort picks the executor definition |
| `.claude/commands/bench.md` | the `effort` scenario |

---

### Task 1: Effort in the agent definitions

**Files:**
- Modify: `plugin/agents/executor.md`, `plugin/agents/reviewer.md` (frontmatter only)
- Create: `plugin/agents/executor-low.md`, `plugin/agents/executor-high.md`, `plugin/agents/executor-xhigh.md`, `plugin/agents/reviewer-light.md` (generated)
- Create: `src/server/agent-variants.ts`, `src/server/agent-variants.test.ts`
- Modify: `package.json` (one script), `plugin/skills/run/SKILL.md` (three passages), `plugin/skills/tasks/SKILL.md` (one sentence)

**Interfaces:**
- Consumes: nothing
- Produces:
  - the definitions `team8:executor-low`, `team8:executor`, `team8:executor-high`, `team8:executor-xhigh`, `team8:reviewer` and `team8:reviewer-light`, at the efforts low, medium, high, xhigh, high and medium;
  - `npm run agents`, which regenerates the variants.

- [ ] **Step 1: Give the base definitions their effort**

In `plugin/agents/executor.md`, add `effort: medium` as the last frontmatter line, just before the closing `---`. In `plugin/agents/reviewer.md`, add `effort: high` the same way, after `tools:`. Change nothing else in either file.

- [ ] **Step 2: Write the failing test** in `src/server/agent-variants.test.ts`

```ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AGENTS_DIR, VARIANTS, variantOf } from './agent-variants';

const read = (name: string) => readFileSync(path.join(AGENTS_DIR, `${name}.md`), 'utf8');
const effortOf = (text: string) => /^effort: (\S+)$/m.exec(text)?.[1];

describe('agent effort variants', () => {
  it('pins the base definitions: executor at medium, reviewer at high', () => {
    expect(effortOf(read('executor'))).toBe('medium');
    expect(effortOf(read('reviewer'))).toBe('high');
  });

  it.each(VARIANTS)('$name is $base with only its name, description and effort changed (run `npm run agents` after editing $base.md)', (v) => {
    expect(read(v.name)).toBe(variantOf(read(v.base), v));
    expect(effortOf(read(v.name))).toBe(v.effort);
  });

  it('rewrites the frontmatter and keeps the body byte for byte', () => {
    const base = '---\nname: executor\ndescription: "does work"\neffort: medium\n---\n\nBody line.\n';
    expect(variantOf(base, { name: 'executor-high', effort: 'high' })).toBe(
      '---\nname: executor-high\ndescription: "does work. Runs at high effort."\neffort: high\n---\n\nBody line.\n',
    );
  });
});
```

- [ ] **Step 3: Run it and see it fail**

Run: `npx vitest run src/server/agent-variants.test.ts`
Expected: FAIL, because `./agent-variants` doesn't exist.

- [ ] **Step 4: Write `src/server/agent-variants.ts`**

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The Agent tool has no effort parameter, and an agent without `effort` in its
// definition inherits the lead's /effort, so each effort a task can ask for is its
// own definition: a copy of its base file with only the frontmatter changed.
export const VARIANTS = [
  { base: 'executor', name: 'executor-low', effort: 'low' },
  { base: 'executor', name: 'executor-high', effort: 'high' },
  { base: 'executor', name: 'executor-xhigh', effort: 'xhigh' },
  { base: 'reviewer', name: 'reviewer-light', effort: 'medium' },
];

export const AGENTS_DIR = fileURLToPath(new URL('../../plugin/agents/', import.meta.url));

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n/;

export function variantOf(base: string, variant: { name: string; effort: string }): string {
  const m = FRONTMATTER.exec(base);
  if (!m) throw new Error('agent definition has no frontmatter');
  const lines = m[1]
    .split('\n')
    .filter((line) => !line.startsWith('effort:'))
    .map((line) => {
      if (line.startsWith('name:')) return `name: ${variant.name}`;
      if (line.startsWith('description:')) return line.replace(/"$/, `. Runs at ${variant.effort} effort."`);
      return line;
    });
  return `---\n${[...lines, `effort: ${variant.effort}`].join('\n')}\n---\n${base.slice(m[0].length)}`;
}

export function writeVariants(dir = AGENTS_DIR): void {
  for (const v of VARIANTS) {
    writeFileSync(path.join(dir, `${v.name}.md`), variantOf(readFileSync(path.join(dir, `${v.base}.md`), 'utf8'), v));
  }
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) writeVariants();
```

- [ ] **Step 5: Add the script and generate the variants**

In `package.json` `scripts`, add `"agents": "tsx src/server/agent-variants.ts"`. Then run `npm run agents`. Expected: `plugin/agents/executor-low.md`, `executor-high.md`, `executor-xhigh.md` and `reviewer-light.md` appear. Open one and check two things:
- `name:`, `description:` and `effort:` changed;
- the body is identical to its base.

- [ ] **Step 6: Run the test and see it pass**

Run: `npx vitest run src/server/agent-variants.test.ts`
Expected: PASS, 6 tests (the base pin, 4 variants, the rewrite case).

- [ ] **Step 7: Make `team8:run` pick the definition by effort** in `plugin/skills/run/SKILL.md`

1. In the subagents mode paragraph, replace `` `subagent_type: "team8:executor"`, `model` from the task's metadata — never omit
it) `` with:

```markdown
`subagent_type` from the task's `effort` as The Dispatch Contract maps it, `model` from the task's metadata — never omit
either)
```

2. In Track Review step 2, replace `` (`subagent_type: "team8:reviewer"`, whose definition
   carries no Edit or Write, so read-only is enforced) `` with:

```markdown
(`subagent_type: "team8:reviewer"`, whose definition
   runs at high effort and carries no Edit or Write, so read-only is enforced)
```

3. In The Dispatch Contract, replace the opening sentence, "Spawn every executor as `subagent_type: "team8:executor"` and every reviewer as `subagent_type: "team8:reviewer"`.", with:

```markdown
Spawn every executor from the definition that matches its task's `effort`:
`team8:executor-low` for low, `team8:executor` for medium, `team8:executor-high`
for high, and `team8:executor-xhigh` for xhigh or max. Spawn every reviewer as
`subagent_type: "team8:reviewer"`, which runs at high. The Agent tool has no effort
parameter, and an agent whose definition sets no `effort` inherits the lead's
`/effort`, so the definition is the only way a task's effort reaches its agent.
```

Keep the rest of each passage as it is.

- [ ] **Step 8: Correct the one sentence in `plugin/skills/tasks/SKILL.md`**

Replace "The `model` and `effort` set here are what each dispatch passes to its agent." with:

```markdown
The `model` set here goes on each dispatch's `Agent` call, and the `effort` picks the
executor definition it spawns: `team8:executor-low`, `team8:executor`,
`team8:executor-high` or `team8:executor-xhigh`.
```

- [ ] **Step 9: Verify and commit**

Run: `npx vitest run src/server/agent-variants.test.ts && npm run typecheck`
Expected: 6 tests pass; the typecheck exits 0.

```bash
git add plugin/agents/executor-low.md plugin/agents/executor-high.md plugin/agents/executor-xhigh.md plugin/agents/reviewer-light.md src/server/agent-variants.ts src/server/agent-variants.test.ts
git commit -m "Pin each team8 agent's effort in its definition" -- plugin/agents/ src/server/agent-variants.ts src/server/agent-variants.test.ts package.json plugin/skills/run/SKILL.md plugin/skills/tasks/SKILL.md
```

### Task 2: The `effort` bench scenario, run before and after

**Files:**
- Modify: `.claude/commands/bench.md` (add `### effort`)

**Interfaces:**
- Consumes: Task 1's definitions, and `measure` (already on main)
- Produces: the before and after numbers in the task report, which the lead puts in the PR description and the run log

- [ ] **Step 1: Find out how a headless session gets the branch's plugin**

This step settles the scenario's setup before it is written down.
- **Flags.** The CLI has `--effort <level>` and `--plugin-dir <path>`, and `-p` runs headless.
- **Same-name plugin.** The user also has the released team8 plugin installed, under the same name `team8`. Find out which definitions a `claude -p --plugin-dir ~/code/team8-speed/plugin` session actually loads: `team8:executor-high` only exists on this branch, so try spawning it. If the installed plugin shadows the directory, disable it for the run with `--settings '{"enabledPlugins":{"team8@grimoire":false}}'` and check again.
- **Permissions.** Headless sessions need the Agent and Bash tools allowed. Try `--allowedTools "Agent,Bash"`.
- **Session id.** Get it from `--output-format json`, which prints `session_id`.
- **What to report.** Write down the exact commands that worked.

- [ ] **Step 2: Add the scenario** to `.claude/commands/bench.md`, replacing the "None yet" line under `## Scenarios` with:

````markdown
### effort

Checks that each agent definition's `effort` overrides the lead's `/effort max`.

- Before: in a clone on `main` before PR 1, run the "before" prompt. After: on the PR 1 branch, run the "after" prompt with `--plugin-dir <worktree>/plugin` (plus whatever Step 1 of the effort plan found was needed so the branch's plugin wins).
- Command shape: `claude -p --effort max --allowedTools "Agent,Bash" --output-format json "<prompt>"`, which prints the `session_id`.
- Before prompt: "Use the Agent tool twice, one after the other, never in parallel. Each time use model sonnet and the prompt: Run `true` with Bash, then reply ok. The subagent types, in order: team8:executor, team8:reviewer. Then reply done."
- After prompt: the same, with these seven spawns in order: team8:executor-low (model haiku), team8:executor-low, team8:executor, team8:executor-high, team8:executor-xhigh, team8:reviewer, team8:reviewer-light. All use model sonnet except the first.
- Read: `npx tsx src/server/index.ts measure <session_id> --json`, then each subagent's recorded `effort` (the efforts rows by model; or `jq -r 'select(.type=="assistant") | .effort' <its transcript> | sort | uniq -c`).
- Pass: before, both subagents record `max`. After, they record low (haiku), low, medium, high, xhigh, high, medium in that order, and the haiku one runs without an error.
````

- [ ] **Step 3: Run it before and after**

- Before: make a throwaway clone on `origin/main` as it was before this branch (`git worktree add /tmp/team8-before origin/main` from ~/code/team8-speed, or `git clone`), and run the before prompt with `--plugin-dir /tmp/team8-before/plugin`, or with the installed plugin. Then remove the throwaway worktree with `git worktree remove`.
- After: run the after prompt on this branch's plugin.
- Record each subagent's effort, and the median seconds per model call from `measure`'s efforts rows, for both runs.
- These headless runs spawn real subagents on the user's account. Keep the prompts exactly as written, and run each once. Rerun only if a run fails for a setup reason, and say so.

- [ ] **Step 4: Commit**

```bash
git commit -m "Add the effort bench scenario" -- .claude/commands/bench.md
```

Report a table with the subagent type, the model, the effort recorded before, the effort recorded after, and the pass or fail. Include the exact commands used.
