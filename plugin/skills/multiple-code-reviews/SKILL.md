---
name: multiple-code-reviews
description: Use when the user asks to review several pull requests at once with teammates, one teammate per PR, and then post the reviews as their own or fix their own PRs. Triggers on "review these PRs with teammates", "/team8:multiple-code-reviews <urls or titles>", a list of PR links followed by "review them", or a batch of stacked PRs from one author.
---

# Multiple code reviews

## Overview

One teammate per PR, two phases, and nothing reaches GitHub until the user has
read the actual comment bodies. Phase 1 produces a report file per PR. Phase 2
turns each report into anchored inline comments in the user's voice; the user
picks which ones go out on each PR and the event they go out with, or posts
nothing. On the user's own PRs the picked items are fixes instead: the PR's
teammate commits them to the head branch and pushes.

Phase 1 is not a code change: no branch, no commit, no PR. Its terminal
deliverable is a file in the session scratchpad.

**REQUIRED SUB-SKILLS:** `team8:tasks` for the task contract, `team8:run` for
dispatch and roster checks, `grimoire:alanizer` for every comment body,
`grimoire:review-as-me` for Conventional Comments and the posting mechanics.

## Phase 1: review into files

1. **Resolve the PRs.** URLs are used as given. Titles resolve with
   `gh pr list -R <owner>/<repo> --state open --search "<words>" --json number,title,author,url,isDraft,headRefName,baseRefName`.
   Record author, head branch, base branch, and whether the author is the user
   (`gh api user --jq .login`). A base that is another PR's head
   branch means a stack: each teammate reviews only its own diff against its base.
2. **One task per PR** via `TaskCreate`. The description names the PR URL, the
   author, the base branch, the stack position, the report path
   `<scratchpad>/reviews/<repo>-<n>.md`, and says in words: run the built-in
   `code-review` skill at medium effort without `--comment`, post nothing, use
   `gh` for everything because the GitHub MCP may be down. Metadata:
   `complexity: judgment, model: opus, effort: high`.
3. **One teammate per PR**, dispatched in a single message with the seven-part
   contract from `team8:run`. Part 6 reads: "Terminal deliverable: the report
   file. No branch, no commit, no PR." Part 5 reads: "`test -s <report> && head -40 <report>`,
   then `ALANIZED=1 gh api repos/<o>/<r>/pulls/<n> --jq '[.comments, .review_comments]'`
   to confirm nothing of yours reached the PR." `ALANIZED=1` is fine on any
   read; only the POSTs in step 8 wait for the pickers.
   Verify the roster in `~/.claude/teams/<team>/config.json` right after.
4. **Lead loop while they run.** Relay one line per finished PR: recommendation,
   finding count, headline. The `code-review` skill's own sub-agent reports to
   the lead, not to the teammate that launched it; forward each such result to
   its owner with `SendMessage` and ask them to fold it into the report and note
   in the report that the skill returned. An idle notification that repeats a
   report already relayed is an echo, not new work.
5. **Gate.** When all reports exist, print a table (PR, recommendation, finding
   count, headline) and stop. Phase 2 starts only when the user asks to post or fix.

## Phase 2: anchor, voice, pick, post or fix

6. **Payload per PR**, produced by the same teammate via `SendMessage`, since it
   still holds the diff. The message says: anchor every finding to an added or
   context line on the RIGHT side of a hunk, verified against the per-file patch
   from `gh api repos/<o>/<r>/pulls/<n>/files`; a finding with no diff line goes
   to `unanchored`; one comment per line, fold same-line findings; body is a plain
   Conventional Comments label then text; read both alanizer reference files
   before writing; validate with `jq`. File `<report>.comments.json`:
   ```json
   {"pr":"<url>","recommendation":"approve-with-nits",
    "comments":[{"path":"...","line":123,"side":"RIGHT","body":"..."}],
    "unanchored":[{"body":"..."}]}
   ```
7. **Pick one PR at a time**, the way `grimoire:review-as-me` steps 7 and 8
   do. Print that PR's bodies verbatim, numbered from 1, unanchored items last,
   then ask with `AskUserQuestion`:
   - **Items:** `multiSelect: true`, header `#<n>` (12 chars max), label
     `#k path:line` (`#k review body` when unanchored), the full body as
     `description`, four questions per call. A question takes 2 to 4 options, so split 5 items as
     3+2, and a PR with one item gets a single-select `Post #1` / `Drop #1`
     (`Fix #1` / `Skip #1` on an own PR). An unpicked item goes nowhere.
   - **Event, last,** only on a PR the user did not author: single-select,
     header `#<n> event`, `Comment`, `Approve`, `Request changes`, the
     suggested one first with
     "(Recommended)": `Request changes` when a finding is `issue (blocking)`,
     `Comment` when the headline needs an answer from the author or product,
     else `Approve`. It rides in the call with the last item batch when that
     call has a free slot, else in its own call.
8. **Post** the PRs with an event. `review.json` holds `comments` = the picked
   anchored items and `body` = the picked unanchored bodies joined by blank
   lines; `Request changes` with an empty body gets one alanized line pointing
   at the blocking comment. Never include `event` in this POST: that submits
   immediately and skips the count check.
   ```bash
   ALANIZED=1 gh api repos/<o>/<r>/pulls/<n>/reviews -X POST --input review.json --jq '"\(.state) id=\(.id) \(.html_url)"'
   ALANIZED=1 gh api repos/<o>/<r>/pulls/<n>/reviews/<id>/comments --jq length
   ALANIZED=1 gh api repos/<o>/<r>/pulls/<n>/reviews/<id>/events -X POST -f event=<EVENT>
   ```
   The second line must equal the picked anchored count; stop before the third
   if it doesn't. With nothing picked, `Approve` POSTs `{"event":"APPROVE"}`
   alone; `Comment` and `Request changes` post nothing and say so.
9. **Fix** the user's own PRs with any item picked. `SendMessage` the PR's
   teammate the picked numbers: `git fetch origin <head>` in the local clone of
   `<o>/<r>` (else `gh repo clone` it into the scratchpad), then
   `git worktree add --detach <scratchpad>/wt/<repo>-<n> origin/<head>`; apply
   each item, run the repo's checks, commit by path with an alanized message and
   no attribution, `git push origin HEAD:<head>`, reply with the SHAs. Nothing
   is posted on the PR. In a stack each teammate pushes only its own head; the
   PRs above pick the fix up when the user restacks.
10. **Report** one row per PR: event or `fixed`, items posted or commits pushed,
    review URL or SHAs. A PR with nothing posted or fixed carries the payload path.

## Gotchas

| Symptom | Cause | Fix |
|---|---|---|
| Hook blocks a read-only `gh` call | The PR-post hook matches the substrings `comments` and `reviews` | Prefix `ALANIZED=1` as the first token. Reads any time; writes only after the pickers |
| Teammate says the code-review skill never returned | Its sub-agent result went to the lead | Forward it to the teammate (step 4) |
| Review is live the moment it is posted | `event` was in the POST body | Post without `event`, submit in step 8 |
| 422 `Can not approve your own pull request` | An event on a PR the user authored | Own PRs get no event question and are fixed in step 9 |
| Inline comment attaches nowhere | Line is not on the RIGHT side of a hunk | Move it to `unanchored`, it posts in the review body |
| Same finding relayed twice | Idle notifications echo | Ignore repeats |
