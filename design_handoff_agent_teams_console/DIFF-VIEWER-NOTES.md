# Notes back to the design: the diff viewer, from building it

Built as agent-teams-console 0.5.0. The feature works and is on main. These are
the places where the design and the runtime disagreed, in the same spirit as
`MESSAGING.md` — things that cannot be drawn honestly without knowing them.

The diff viewer exists **only** in `Octo Session Console.dc.html`. No prose doc
describes it: the README, CHANGELOG, MESSAGING and PROMPT in the handoff bundle
all pre-date it. Everything below was read out of the prototype markup.

## 1. One colour in the spec is unreadable on two of the six themes

`#7fb98d`, the add-sign green, is a hex literal in the prototype. Measured
against its own tinted row: **1.87:1 on Organic, 1.95:1 on Frost.** It only ever
ran on Nocturne.

This is the exact failure `styles.css` warns about — a hex in a component
survives the theme switch and the light themes break silently around it. The
header's `+14 −2` stat carries the same literal and fails the same way
(1.82 / 1.90).

Both now resolve through `var(--json-string)` — the one green the palette
already tunes per theme — which measures 5.00:1 to 10.13:1 across all six.

**The tints themselves are fine.** `rgba(126,196,146,.13)` add and
`rgba(200,141,141,.13)` delete were the values we expected to fail on light
grounds, and they hold: worst case is Organic's delete row at ΔE2000 4.34, and
add-vs-delete never drops below 9.44. Tinted overlays were the right call; the
literal ink beside them was not.

**Design consequence:** the JSON palette already established the rule that a
new hue must be held at the accent's chroma and defined per theme. The diff
palette needs the same treatment, or it needs to reuse the JSON one.

## 2. Two controls in the toolbar have no runtime behind them

- **`open in editor` / `⌘⏎`** — the server's entire POST surface is
  `/api/teams/:name/select`, `/api/shutdown`,
  `/api/agents/:name/(message|interrupt|stop|respawn)`, plans and permits. The
  only `child_process` use anywhere is `ps`. Nothing reaches an editor. Both the
  button and the footer legend were removed rather than shipped dead.
- **`unified` / `split`** — the prototype tracks `diffSplit` and computes
  `oldW: split ? '50%' : 'auto'`, and nothing consumes it. There is no split
  layout to build. The toggle was removed.

The console had already made this call twice before — the in-flight badge is a
readout because no route can force a turn boundary, and `http.ts` says the same
about respawn. The design's own rule ("a control that does not change the render
is worse than none") points the same way.

**Design consequence:** either spec the split layout properly or drop the
toggle from the design. Same for `open in editor` — it needs a server route
before it can be drawn. Note that removing the segments leaves the toolbar's
left side empty, so the hunk count and `copy patch` sit right-aligned against
nothing. The bar wants rebalancing if split is not coming back.

## 3. The `DIFF` const has no concept of truncation

The prototype's payload is a fixed 34-row fixture. Real ones are not bounded,
and the diffs that threaten a frame are not one enormous hunk — they are a
lockfile arriving as hundreds of small ones.

What the real model needs, and now has:

- a cap on **total** lines across all hunks (300), not per hunk
- a cap on a single line's text (200)
- a `truncated` flag, because a cut patch is otherwise indistinguishable from a
  whole one
- `added` / `removed` counting the **whole** patch including what the cap
  dropped, since that is what the collapsed row's chip shows

**Design consequence:** the drawer header shows `+N −M`. Those numbers can now
legitimately exceed the number of rows visible below them. The design should say
what a truncated patch looks like — today nothing marks it.

Related: `copy patch` on a truncated payload cannot apply. It now prepends
`# truncated: N of M changed lines — incomplete, will not apply`, which
`git apply` ignores (it skips everything before the `---`), so it fails loudly
instead of silently.

## 4. `ts` and `commit` are the wrong shapes in the prototype

- **`ts: '14:22:08'`** is a display string. Every other timestamp in the domain
  is epoch ms, and the transcript line that carries the diff already has one.
  Two `ts` fields of different types on nested objects is a bug waiting to
  happen. It is now epoch ms, formatted at the render site.
- **`commit: '9be5ee0'`** is presented as a field the payload always has. It is
  not knowable: a patch is usually observed before it is committed, and an
  uncommitted edit has no sha. It is optional and, in practice, currently never
  populated — the Edit/Write tool input carries no sha and we ruled out shelling
  to git.

**Design consequence:** the header meta line reads `<agent> · <time> · <sha>`.
Draw it for the case where the sha is absent, because that is the common case.

## 5. Two things the modal needs that the design does not mention

- **`.console { position: relative }`.** The modal is `position: absolute;
  inset: 0`. Without a positioned ancestor it sizes against the viewport rather
  than the console.
- **The keyboard must suspend the wall's bindings while open.** Not
  hypothetical: the first test run caught `esc` firing *interrupt on the focused
  agent* while the patch was open. The modal now sets a suspend flag at the root
  where it is mounted.

Also: the design applies its one-line/nowrap discipline to the status bar only.
The modal's toolbar and footer needed exactly the same treatment — their
children had neither `flex: none` nor `white-space: nowrap`, so under a narrow
card they wrapped and doubled the row height. That rule is not specific to the
status bar; it belongs to every fixed-height chrome row.

## 6. Line numbers are relative to the snippet, not the file

Hunks are derived from the `Edit`/`Write` tool input (`old_string` /
`new_string`), not from git. That input carries no absolute file position, so
`oldLineNo` / `newLineNo` start at 1 and are relative to the snippet. The hunk
header is synthesised, not read.

**Design consequence:** the prototype's header,
`@@ -146,10 +146,24 @@ export function useTeamState(`, implies real file
offsets and a real function context. Neither is available from this source.
Either the design accepts snippet-relative numbering, or the feature needs a
different data source than the transcript.

## 7. Three defects in screens the design already covers

Found by watching the live console, not by tests:

- **Teammate messages rendered their own envelope.** The raw
  `<teammate-message …>` tag showed as body text in **121 of 121** real
  deliveries — the strip was anchored to the start of the content, and every
  real delivery wraps the frame in prose. Fixed. But the envelope's
  `teammate_id` / `color` / `summary` are still discarded on the transcript
  path, so a message now renders with **no attribution at all**. The design
  should say what a received message's header looks like on a row.
- **An indented code block flattened into a paragraph.** Teammates indent
  snippets far more often than they fence them. Keeping leading indentation
  costs +0.17% characters on real message bodies (+1.0% after the transcript
  cap) — measured, against the design comment's own currency.
- **`blocked` was shown for tasks that were not blocked**, including ones being
  actively worked. Two causes: the check used the raw dependency list, so a
  *completed* dependency blocked forever; and `blocked` outranked the task's own
  status. The rule is now: blocked = pending **and** at least one dependency
  still open. The design's own footer already stated the intent — "completing a
  task unblocks its dependents".

## 8. The tasks view gained a MODEL column

Each task can carry `metadata: { complexity, model, effort, why }`, and the
tasks view now shows the model. Column budget: **MODEL 60px, between STATE and
OWNER**, taken out of DESCRIPTION's flex — 60 because the values are short tier
names, where OWNER's 80px is sized for "unassigned" and DEPENDS ON's 88px for
joined ids.

Two notes for the design:

- `metadata.model` (a tier name: "opus") and `agent.model` (a canonical id:
  "claude-haiku-4-5") are **different vocabularies**. They should not be drawn
  as the same field.
- `metadata` is optional and most tasks anywhere else will have none. Absent
  renders as `—`, matching DEPENDS ON's convention rather than OWNER's
  "unassigned" — the latter implies an action pending, which is wrong for a task
  that simply predates the field.

Separately, `agent.model` was shown in Wall and Grid but not Rail or Overview.
Now consistent across all four. Comms deliberately left out; it is a view about
messages, not agent status.

## Open questions for the design

1. **What does a received teammate message look like on a row?** Stripping the
   envelope removed the only attribution. The data exists on the mail path.
2. **Gutter line numbers are pinned to `var(--color-neutral-700)`**, which
   measures **1.53–2.35:1** against its own gutter on every theme — below any
   text threshold. Left as specified. Deliberate restraint, or a real problem?
3. **Is split coming back?** If not, the toolbar wants rebalancing.
4. **What marks a truncated patch** in the drawer, beyond the copied text?
