# Run log — markdown rendering

spec: none — bounded path, design approved in chat (tables, then "everything": links, strike, italic, blockquotes, rules, nested and checkbox items)
plan: docs/team8/plans/2026-10-16-markdown-rendering.md
branch: render-improvements
pr: https://github.com/alan-oliv/team8/pull/48

## Brainstorm
- path: bounded
- spec rounds with the user: 1 (one scope question — tables only, or every ignored construct; answer: everything)

## Plan
- plan: written by the lead · self-review fixes: 2 (a table helper named `table` that shadowed the buffer in `blocks()`, renamed `parseTable`; a grep in Task 1 that would have flagged the word "Inline" in comments)
- tasks: 5 · tracks: 1 · waves: 1 · peak: 1 at once · mode: subagents — one track, every task edits markdown.ts and Prose.tsx, so the five run one after another and the lead reviews each result
- estimate: ≈$4.61 (per task in the plan's table: 1 haiku·low ≈$0.01, 2–5 sonnet·medium ≈$1.15 each)

## Run
- executors (subagents, one at a time, track A): prose-move · haiku · low · task 1 · 1.0 min wall, 11 calls; tables · sonnet · medium · task 2 · 3.2 min, 14 calls; inline · sonnet · medium · task 3 · 2.3 min, 10 calls; quotes · sonnet · medium · task 4 · 2.3 min, 9 calls; items · sonnet · medium · task 5 · 4.9 min (2.3 of it the full suite), 8 calls · peak 1 at once
- track reviews, one reviewer per task (sonnet, `team8:reviewer`), task 1 read by the lead instead since a verbatim move is one diff comparison: task 2 1/3 rounds, 0 Blocking, 2 Minor fixed in `cd5b744` (an escaped `\|` split its cell and the fit step dropped the last value; `td` alignment unasserted) · task 3 1/3, 0 Blocking, 1 Minor pinned in `bd935d2` (`javascript:` target as text) · task 4 1/3, 0 Blocking, 2 Minor fixed in `bf88c5a` (a lone `>` drew an empty bar; quote-then-table and empty-line-in-quote unpinned) · task 5 1/3, 0 Blocking, 2 Minor fixed in `275323c` (a four-space child landed at depth 2; glyphs unasserted) · residuals 6, run-log only: a URL with parentheses is cut at the first `)`; link text shows inline markup raw (nested inline is out of the subset); unclosed `[` / `**` / `~~` backtrack quadratically, 216 ms on a 21 KB malformed line; a separator row of a different width than the header is still accepted; `1. [x]` drops its ordinal like GitHub does; `- [x]` with no text stays literal. Pre-existing and left alone: `segments()` in `code.ts` reads an indented line after a blank line as code, so a nested item under a blank line never reaches the parser; `blocksOf` in `TranscriptFeed.tsx` has no callers.
- actual: ≈$1.84 for the nine agents — prose-move ≈$0.02, tables ≈$0.46, review-tables ≈$0.19, inline ≈$0.28, review-inline ≈$0.11, quotes ≈$0.27, review-quotes ≈$0.11, items ≈$0.26, review-items ≈$0.14 — plus the lead's whole transcript ≈$14.03 (brainstorm, plan writing and the run) · measure: 4/4 messages delivered, lag median 0.0 min, max 0.0 · review tails none · idle with work waiting none · sonnet·medium 41 calls, median 5.1 s, p90 12.6 s · haiku·low 11 calls, median 3.3 s
- estimate vs actual: ≈$4.61 estimated for the five tasks; executors came in at ≈$1.29 (72% under) and the four reviewers at ≈$0.55. The sonnet·medium cell (≈$1.15) is about 4× what a task costs when the plan carries the code verbatim; haiku·low (≈$0.01) was 2× under.
- full gate by the lead at `275323c`: `npx tsc --noEmit` clean · `npx vitest run` 109 files, 2307 tests passed (130 s)
- went wrong / change next time: nothing broke. Every review round was Minor-only and each took one round, so a `team8:reviewer-light` per task would have done; the sonnet reviewers found real things in every task (a dropped cell value, an empty quote bar, a two-level jump), so the per-task review is worth keeping even when the plan carries the code. The attribution hook blocked a heredoc that also wrote the run log, so the file never landed on the first try: write files with the Write tool, commit in a separate command. The alanizer hook reads the command's first token, so `ALANIZED=1` has to be the first thing in the command, not after a `cd`.
