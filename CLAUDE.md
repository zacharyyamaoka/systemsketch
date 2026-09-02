# SystemSketch — working notes for agents

Zach's digital brain (`~/zach_brain`) is already loaded in every session via his global
`~/.claude/CLAUDE.md` — you do **not** need to import it here, and you should not run the
vault's rituals from this repo. Grep it read-only for prior thinking:
`PROJECT - System Sketch`, `FR - Block, Ports & Edges Primitive`, `PROJECT - pyblocks`.
This file carries what only this repository knows.

## The one rule the whole design rests on

**tldraw stays stock.** `tldraw@5.3.2`, pinned exactly. Everything is added through its
supported component / shape / tool / binding / mount seams — never by forking the engine or
reimplementing a primitive it already has. `tests/test_stock_boundary.py` asserts the seam
list in `src/App.tsx` and will fail loudly if a new capability is bolted on beside the engine
rather than through it. If you find yourself writing drag, resize, snapping, or z-order logic,
stop: tldraw already has it.

Corollary Zach cares about: don't invent new whiteboard interactions. A frame, a rectangle, an
arrow already carry muscle memory. Compose new things out of those.

## Running it

Two channels, both already built. Preview is a **release channel**, not a git branch.

```bash
cd ~/systemsketch && npm run dev
```

| | port | what it is |
|---|---|---|
| Stable | 4321 | the immutable build Zach trusts |
| Preview | 4322 | the candidate he is judging — `npm run dev` serves here |
| Preview API | 4323 | the Python host behind it |

`npm run dev` is pinned with `--strictPort`, and Zach usually has Stable + Preview already
running. **Check `ss -ltnp | grep 432` before assuming a port is yours.** If you need a second
server, override `SYSTEMSKETCH_DEV_PORT` / `SYSTEMSKETCH_API_PORT` rather than killing his.

Channel moves: `npm run release:candidate` → `release:promote` → `release:rollback`.
Desktop: `desktop:start`, `desktop:preview`, `desktop:status`, `desktop:stop`.

## Proof is the running app, driven in a real browser

```bash
cd ~/systemsketch && npm run check
```

That is tsc + 289 vitest tests + 24 Python tests, and it must be green before you hand
anything over. It is **not** sufficient for UI work.

A UI change is done when it has been driven in a real browser and looked at. The pattern is a
CDP journey in `tests/*_smoke.mjs` (`browser_harness.mjs` is the shared driver): vite + the
Python host, headless Chrome, real `Input.dispatchMouseEvent` gestures, assertions read from
the editor and the DOM, screenshots you actually inspect. Named runners exist —
`test:ports`, `test:edges`, `test:batch`, `test:click-to-edit`, `test:fields`,
`test:selection-menu`, `test:context-menu`, `test:release-ui`, `test:workspace`.

`test:windows` is the one journey that is not headless: it drives a real Chrome `--app` window on a
private Xvfb display, because a headless target has no OS window to count. It must never open a
window on Zach's screen — keep it on its own `DISPLAY`.

Never point a test at Zach's real board — the app autosaves into it. Use a scratch
`.systemsketch` (or a `.tldr`, which is still opened and saved unconverted).

## Reports live in `docs/`, and the builder is the source

Every report is a `docs/build_<name>.py` that emits `docs/<name>-<date>.html`, self-contained,
with captures from `docs/assets/` inlined as data URIs. Measure numbers **at build time from
the live repo** rather than hardcoding them, so a report cannot drift from the tree it
describes. Render it headlessly and look at it before handing it over, then link it from
`README.md`. Generated `docs/assets/crop-*.png` are build output and gitignored.

## Several agent sessions edit this tree at once

Peers write here in real time — this is the normal case, not an edge case.

- `ls --time-style=full-iso` a file before rewriting it; if it moved in the last few minutes,
  it belongs to a peer's in-flight run. Leave it, or make a surgical exact-match edit that
  fails loudly rather than a rewrite.
- Never `git add -A`. Stage explicit pathspecs and read `git diff --cached --name-only` before
  every commit.
- Never reset, clean, or checkout over someone else's work.
- Don't kill a server you did not start.
