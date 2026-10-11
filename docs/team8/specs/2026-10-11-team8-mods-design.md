# team8 mods — design

The mods half of `docs/team8/melhorias-agent-teams.md` ("Mods (Claude Code 2.1.296)"), re-scoped
after the fixes batch (PR #39) and checked with one probe mod on 2026-10-11. It ships one mod: a
wave notifier.

## Decisions

- **Mods are the default path.** A mod feature replaces the classic path it covers instead of
  running beside it. Accepted cost: in a session where the module does not load (the rollout flag
  `tengu_plugin_hooks_modules` off, as this machine saw once on 10-11; a build that strips
  `modules`, as 2.1.76 does; a teammate in a pane of its own), that feature is simply absent.
- **Scope: the wave notifier only.** The rest of the mods section is settled without a mod
  (mid-turn delivery by `src/hooks/inbox-deliver.ts`, task gates, git guards, report size, resume
  hint), cannot be done by one (`Agent` `effort` never reaches a named teammate), or has no measured
  pain (a status line). Moving existing classic hooks into the module (delivery, the task gate, the
  console's curl ingest) is a later batch.
- **A console band above the prompt** was proposed and deferred to a fuller mod later.

## Probes (2026-10-11, Claude Code 2.1.296)

A throwaway mod, `t8probe`, in this session's dev-mods folder; one in-process teammate; task A owned
by it, task B blocked by A and owned by `ghost`, a name nobody carries.

- **Loads.** The dev-mods module loaded and `session.start` fired. An installed plugin's module still
  loads only while the rollout flag is on.
- **Teammate calls are tagged.** The teammate's `TaskUpdate` reached `tool.call` with its `agentId`
  (`a<name>-<16 hex>`), and `next(e)` resolved with `result.statusChange: {from, to}`. The lead's
  own calls carry no `agentId`.
- **Roster.** `$.agent.list()` gives the teammate's `name`, `teammateId` (`<name>@session-<8>`),
  `type` and `status`: `running`, then `idle` at its `turn.complete`, `killed` after `TaskStop`,
  then absent. `ghost` is absent.
- **Task list.** `$.tool.call({ tool: 'TaskList' })` from a `$.clock.after` timer read the team's
  list. `blockedBy` holds only open blockers: B showed `[]` once A completed.
- **Wake.** An unawaited `$.prompt.submit` from that timer woke the idle lead about 1 s after the
  completion, as a turn headed "The t8probe plugin sent a message".

## 1. Wave notifier

### Problem
When a task closes, the tasks it unblocks may belong to a teammate that is idle or not spawned yet
(a later wave). Auto-claim never picks them up, since every task has an owner from creation
(`team8:tasks`, teammates mode). Only `executor.md`'s prose wakes the lead ("#N completed; unblocks
#M"); an executor that skips it leaves the wave waiting until the lead looks. Two cases in
September, none measured in October.

### Decision
- **`plugin/hooks/wave.ts`**, no Claude Code imports:
  `unblockedIdle(tasks, roster, notified)` returns `{ id, subject, owner, why }` for each task that
  is `pending`, has an empty `blockedBy`, has an owner other than `team-lead`, is not in `notified`,
  and whose owner is not busy. A roster entry matches by `name`. `pending`, `running` and `waiting`
  are busy and skipped; `idle` gives `why: 'idle'`; an absent owner or one `completed`, `failed` or
  `killed` gives `why: 'not running'`.
- **`plugin/hooks/wave-notify.ts`**, the module. One hook, `tool.call` on `TaskUpdate`:
  `const r = await next(e)`, then return `r` unchanged. When `e.agentId` is set and
  `r.result?.statusChange?.to === 'completed'`, start `$.clock.after(1000, …)`, which:
  1. reads `$.agent.list()` and stops unless the entry whose `id` is `e.agentId` has a `teammateId`;
  2. reads `$.tool.call({ tool: 'TaskList' })` and runs `unblockedIdle`;
  3. when the result is non-empty, adds the ids to `notified` and fires
     `void $.prompt.submit({ text })`, `text` reading
     `team8: #6 completed. Unblocked with nobody on it: #7 "<subject>" (owner ghost, not running). Dispatch per team8:run.`,
     the entries joined with `; `.

  The timer body runs in `try`/`catch` and does nothing on failure. The registration has
  `.catch(($, e, next) => next(e))`, which replays the settled result, so the teammate's call is
  never held or changed. `notified` is a module variable, so a reload can repeat one notice; the
  code marks it with a `ponytail:` comment naming `$.state` as the upgrade.
- **`plugin/hooks/hooks.json`** gains `"modules": ["./wave-notify.ts"]` beside `hooks`, and its
  description gains a sentence for the module: what it watches, and that it only wakes the lead.
- **`plugin/agents/executor.md`** drops the "#N completed; unblocks #M" message (the sentence from
  "If the task's `TaskGet` showed it blocks" to "That message is not your report."): the module
  replaces it. `npm run agents` regenerates `executor-low/high/xhigh.md` from it.
- **`plugin/skills/run/SKILL.md`**, teammates paragraph, one sentence: each later wave starts on a
  team8 unblock notice, which names each unblocked task whose owner is idle or not running; message
  an idle owner, and spawn one that is not running under the name its tasks carry.

### Acceptance
- `src/hooks/wave.test.ts` (vitest): an absent owner and a `killed` one give `not running`; an
  `idle` owner gives `idle`; a `running` owner, a task still blocked, `team-lead`'s task, an unowned
  task, a task not `pending` and an id in `notified` give nothing.
- `npm test` (the agent-variants drift test included) and `npm run typecheck` pass;
  `grep -rn 'unblocks #M' plugin` finds nothing.
- `claude plugin validate plugin` passes and lists the `tool.call{tool=TaskUpdate}` hook.
- The lead's live check at the close: copy `plugin/hooks/wave.ts` and `wave-notify.ts` into this
  session's dev-mods folder under a plugin of another name, rerun the probe's setup (A owned by a
  throwaway teammate, B blocked by A and owned by `ghost`), see the notice arrive naming #B, then
  stop the teammate, delete the tasks and the copy.

## Order and branches

One branch, `mods`, cut from `main`. `plugin/dist` is never committed; the module ships as source,
since Claude Code compiles it.

## Out of scope

The console band above the prompt (a fuller mod, later); a `$.ui.status` line; moving the other
classic hooks into the module (a later batch).
