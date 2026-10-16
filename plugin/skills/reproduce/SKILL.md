---
name: reproduce
description: Use when the work is a bug report whose root cause is not yet confirmed — a ticket, a Slack thread, an error trace, "X is broken", "it only happens sometimes" — before designing or planning a fix. Also when asked to reproduce, repro, confirm or re-test a reported bug, and when team8:plan receives a bug.
---

# Reproduce

## Overview

A fix designed on an unconfirmed cause is a guess. This skill turns a bug
report into one of three outcomes, each with evidence, before anyone designs
the fix: **reproduced**, **not reproduced**, or **blocked**.

**Core principle: reproduce the reporter's symptom, under conditions you can
name, somewhere the user agreed to.**

**Not for:** a bug whose cause is already confirmed by a failing test. That
goes straight to `team8:plan` as a bounded fix.

## Steps

1. **Read all the evidence first.** The whole ticket, its comments, every
   attachment: watch the recording, open the screenshot. **If an attachment or
   a log source won't open, ask for it, or for the symptom it shows, in your
   first message.** Until the symptom is named (spinner, empty list, banner,
   error), read code only. Repro steps name the actions, not the symptom. If
   users are hurting right now, offer a stopgap (a revert, a flag off) as
   soon as you see one. Doing it needs a yes.
2. **Pin the version.** Run `git log --since=<a week before the report>` on
   the paths involved, and find what production ran on the report date
   (deploy tags, the release log). If the code changed around or after the
   report, say so up front: today's code may not be what the reporter saw.
3. **Propose the probe, then stop.** In two or three sentences: the suspected
   path, where you'll reproduce, and the conditions you'll vary. No test or
   script is written or run until the user says yes. **That yes covers a failing test
   and a scratch script.** It does not cover the fix. Cut the fix branch
   before writing the test.
4. **Cheapest first:** a failing unit test on the suspect code, then the local
   app, then staging, then production. **Production only if the user's own
   words named it, and read-only:** never book, buy, submit or send.
   Production is anywhere with real customer data: the live site, a preview
   inside the production admin, a local app pointed at production APIs.
   Re-running there after the fix needs its own yes.
5. **A browser repro is a recorded script.** Write a CommonJS Playwright
   script (`repro.cjs`) in the scratchpad with `recordVideo` on the context,
   so the steps re-run identically. Run it with
   `NODE_PATH=<app>/node_modules node repro.cjs` so it finds the repo's
   Playwright; ESM `import` ignores `NODE_PATH`. No Playwright in the repo?
   Ask before installing it: `npm i playwright` in the scratchpad, then
   `npx playwright install chromium`; the script finds it there without
   `NODE_PATH`. Convert the video for sharing with
   `ffmpeg -i <file>.webm <file>.mp4`. Attaching it to the ticket is a write:
   ask first.
6. **One line after each hypothesis you test:** what you tried and what you
   saw. After three hypotheses without a repro, stop and report.

## The report

```
Outcome: Reproduced | Not reproduced | Blocked
Symptom: <the reporter's, one line>
Trigger: <the reporter's steps | a hand-made input only>
Steps: <numbered, re-runnable, with the script's path>
Conditions: <environment, commit, timezone, network, timing, flags>
Video: <mp4 path, or "no browser used">
Evidence: <failing test path> · <console/network excerpt>
Not covered: <conditions you did not vary>
Next: <see below>
```

`Not covered` is required unless the outcome is Reproduced.

**Next:**
- Reproduced: `team8:plan` designs the fix, with the failing test as its RED.
- Reproduced only on an older commit: name the commit that fixed it, and
  propose a regression test instead of a fix.
- Not reproduced: name what would settle it, such as the reporter re-testing on
  the current release, or a condition you couldn't vary.
- Blocked: name what is missing and who has it.

## Red Flags

| Thought | Reality |
|---------|---------|
| "The user said get it moving — read-only prod clicks are fine" | Moving means reading code and proposing the probe. Prod needs a yes that names prod. |
| "The video needs a login, so I'll go off the written steps" | The steps name the actions, not the symptom. Ask for the video in your first message. |
| "A failing test is code, and the hard gate says wait" | The probe's yes covers the failing test. Design the fix on a confirmed cause. |
| "I'll draft the test while I wait for the yes" | No test or script before the yes. Read code instead. |
| "It's a bug in existing code, so it's bounded" | Bounded is a fix design. With no cause there's nothing to design yet. Reproduce first. |
| "My unit test fails, so it's reproduced" | It reproduces your hypothesis. Say so under Trigger, and check the reporter's steps. |
| "Clicking through by hand is quicker than a script" | Hand clicks leave no video and can't be re-run after the fix. |
| "One more attempt and I'll have it" | Three hypotheses, then report. |
