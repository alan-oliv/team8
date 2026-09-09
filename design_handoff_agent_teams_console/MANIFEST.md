# Bundle manifest — 2026-09-03 (rev 5)

Unzip **over** `design/` in the repo. Every file below is replaced; `DIFF-VIEWER-NOTES.md` and `USAGE-DASHBOARD.md` are included unchanged so the overwrite cannot lose them.

**Read `CHANGELOG.md` first if the console is already built.** Rev 2 was largely the spec being corrected against what was actually built — several previously specified things are now explicitly *not* to be built.

## One design file

`Octo Agent Console - Canvas.dc.html` **is the handoff.** Every study lives in it, laid out in three columns — **sub-agents · teammates · workflow** — so an engine can be read down its own column. The earlier single-stack console and the separate usage-dashboard page are gone: both were the same studies at an older revision, and two copies of one design drift.

**Serve the folder to open it** — do not double-click the file:

```sh
cd design && python3 -m http.server 8000
# then http://localhost:8000/Octo%20Agent%20Console%20-%20Canvas.dc.html
```

It fetches `support.js`, `browser-window.jsx` and the design-system bundle at load time, and `file://` blocks `fetch` for local files — over `file://` the page draws without its browser frames. Any static server works.

## Files

| File | Bytes | Lines |
| --- | --- | --- |
| `README.md` | 54511 | 384 |
| `PROMPT.md` | 5809 | 37 |
| `CHANGELOG.md` | 49449 | 285 |
| `MESSAGING.md` | 5184 | 112 |
| `USAGE-DASHBOARD.md` | 16020 | 107 |
| `DIFF-VIEWER-NOTES.md` | 9325 | 178 |
| `movie-themes.json` | 22610 | 726 |
| `Octo Agent Console - Canvas.dc.html` | 378259 | 5601 |
| `browser-window.jsx` | 4728 | 128 |
| `support.js` | 69134 | 1912 |

Plus `_ds/nocturne-4bc22666-5c49-4c20-81d3-6a17ba2f206d/` — `styles.css`, `_ds_bundle.js`, `readme.md`.

## Landed-correctly checks

All eight must pass after unzipping.

```sh
cd design
grep -c 'Sub-agents mode: two views' README.md                 # 1
grep -c 'Reconciled with the console at 0.6.5' CHANGELOG.md    # 1
grep -c 'Declare the theme once at' README.md                  # 1
grep -c '## Standing rules' README.md                          # 1
grep -c '## Screen 5 — No team at all' README.md               # 1
grep -c 'saIsStream' 'Octo Agent Console - Canvas.dc.html'      # >=1
grep -c 'id="workflow"' 'Octo Agent Console - Canvas.dc.html'   # 1
grep -c -- '--color-accent:{{' 'Octo Agent Console - Canvas.dc.html'  # 0
```

Expected: `README.md` 384 lines, `CHANGELOG.md` 285 lines.

## What changed in rev 5

- **The handoff is one design file** — the canvas. `Octo Session Console.dc.html` and `Octo Usage Dashboard.dc.html` are removed; the usage dashboard is a view inside the canvas, not a separate page.
- **The page ground moved to `html`** — on `body` alone, everything outside body's box fell through to the browser's white default on a canvas wider than the viewport.
- From rev 4: `stream` and `trace` as two real views, the three-column canvas, no mailbox in the tasks view, and identity rendered goal-first everywhere.

## Not in this bundle

`WORKFLOWS.md`, `ENGINE.md`, `ACCEPTANCE.md`, `WORKFLOW-STATE.md`, `IMPLEMENTED.md`, `CONSOLE-NOTES.md`, the repo-root `README.md` and `build-history/` are yours. Nothing here touches them.
