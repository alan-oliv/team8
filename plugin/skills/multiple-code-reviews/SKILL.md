---
name: multiple-code-reviews
description: Use when the user asks to review several pull requests at once with teammates, one teammate per PR, and then post the reviews as their own. Triggers on "review these PRs with teammates", "/team8:multiple-code-reviews <urls or titles>", a list of PR links followed by "review them", or a batch of stacked PRs from one author.
---

# Multiple code reviews

## Overview

One teammate per PR, two phases, and nothing reaches GitHub until the user has
read the actual comment bodies. Phase 1 produces a report file per PR. Phase 2
runs only for the PRs the user picks, turns each report into anchored inline
comments in the user's voice, and posts them as PENDING draft reviews the user
submits with a chosen event.

Reviews are not code changes: no branch, no commit, no PR. The terminal
deliverable of every task is a file in the session scratchpad.

**REQUIRED SUB-SKILLS:** `team8:tasks` for the task contract, `team8:run` for
dispatch and roster checks, `my-skills:alanizer` for every comment body,
`my-skills:review-as-me` for Conventional Comments and the posting mechanics.

## Phase 1: review into files

1. **Resolve the PRs.** URLs are used as given. Titles resolve with
   `gh pr list -R <owner>/<repo> --state open --search "<words>" --json number,title,author,url,isDraft,headRefName,baseRefName`.
   Record author, head branch, base branch. A base that is another PR's head
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
   read; only the POSTs in steps 8 and 9 wait for the pickers.
   Verify the roster in `~/.claude/teams/<team>/config.json` right after.
4. **Lead loop while they run.** Relay one line per finished PR: recommendation,
   finding count, headline. The `code-review` skill's own sub-agent reports to
   the lead, not to the teammate that launched it; forward each such result to
   its owner with `SendMessage` and ask them to fold it into the report and note
   in the report that the skill returned. An idle notification that repeats a
   report already relayed is an echo, not new work.
5. **Gate.** When all reports exist, print a table (PR, recommendation, finding
   count, headline) and stop. Phase 2 starts only when the user asks to post.

## Phase 2: anchor, voice, post

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
7. **Show every body verbatim** in the chat, grouped per PR, before any picker.
   Then `AskUserQuestion`, `multiSelect: true`, one option per PR, all or nothing
   per PR, four options per question.
8. **Post PENDING.** For each selected PR build `review.json` with `comments`
   from the payload and `body` = the unanchored bodies joined by blank lines.
   Never include `event` in this POST: that submits immediately and skips the
   draft.
   ```bash
   ALANIZED=1 gh api repos/<o>/<r>/pulls/<n>/reviews -X POST --input review.json --jq '"\(.state) id=\(.id) \(.html_url)"'
   ALANIZED=1 gh api repos/<o>/<r>/pulls/<n>/reviews/<id>/comments --jq length
   ```
   The second line must equal the payload's comment count.
9. **Suggest an event per PR** from the report: `REQUEST_CHANGES` when a finding
   is `issue (blocking)`, `COMMENT` when the headline needs an answer from the
   author or product, else `APPROVE`. Print the table with review URLs and the
   suggested event, and ask. On "proceed":
   ```bash
   ALANIZED=1 gh api repos/<o>/<r>/pulls/<n>/reviews/<id>/events -X POST -f event=<EVENT>
   ```

## Gotchas

| Symptom | Cause | Fix |
|---|---|---|
| Hook blocks a read-only `gh` call | The PR-post hook matches the substrings `comments` and `reviews` | Prefix `ALANIZED=1` as the first token. Reads any time; writes only after the pickers |
| Teammate says the code-review skill never returned | Its sub-agent result went to the lead | Forward it to the teammate (step 4) |
| Review is live the moment it is posted | `event` was in the POST body | Post without `event`, submit in step 9 |
| Inline comment attaches nowhere | Line is not on the RIGHT side of a hunk | Move it to `unanchored`, it posts in the review body |
| Same finding relayed twice | Idle notifications echo | Ignore repeats |
