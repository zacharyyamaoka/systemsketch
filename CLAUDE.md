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

## The IDE plugins live here

`vscode-systemsketch/` is the VS Code / Cursor extension, and Obsidian's will sit beside it.
Two rules hold the boundary, and `tests/test_stock_boundary.py` asserts both:

- **A host ships a *build* of the app, never a second canvas.** `scripts/stage_app.mjs` runs
  the app's own vite build (with `--base ./`, which a webview needs) and stamps which release
  it staged; the extension's esbuild config bundles the host only. If you find yourself adding
  a webview entry point beside it, stop — you are forking the product.
- **`src/embed/sharedWithHost.ts` is the only thing an extension may import from the app.**
  A host bundles separately, so anything it reaches past that becomes a second, invisible
  build of that code. Keep every module behind it free of React, tldraw and the DOM.

IDE plugin proof must launch the packaged VSIX in **each actual target editor** (VS Code and
Cursor) under Xvfb, using disposable user-data, extension, workspace, and port directories.
Drive the visible workflow over CDP like a Playwright test; Cursor sign-in is not required for
extension/webview acceptance and is not a reason to stop early. Assert the exact case and
custom editor opened, SystemSketch-specific controls, no host or webview error surface, the
intended interaction and close/save behavior, and unchanged bytes for read-only opens. Capture
and inspect screenshots. A parser pass, successful package, `.tl-container`, or mounted canvas
alone does not count.

`npm run plugin:test` exercises one packaged case. For the full golden corpus use
`CODE_PATH=/usr/bin/cursor npm --prefix vscode-systemsketch run test:corpus` and repeat with
`CODE_PATH=/usr/bin/code`; record the per-file result and fail on any skipped or unverified case.

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

## Seed the human review board before handoff

After implementing a feature, and before the handoff, use the repo-local
[`systemsketch-review-fixture`](skills/systemsketch-review-fixture/SKILL.md) skill to create
`sketches/review/<feature>.systemsketch`. Seed the minimum real Blocks, connections, and other
objects needed to exercise the new interaction, then place numbered text cards and orange
arrows outside the interaction area to say exactly what Zach should do. Include a separate
green `PASS WHEN` card with the visible success condition.

Commit the board with its report, then publish one retained review. Its first launch includes
the complete manifest so the runtime can pin the board, small report, and ignored captures:

```bash
python3 /home/bam/systemsketch/scripts/review_runtime.py up <review-name> --ref HEAD --board sketches/review/<feature>.systemsketch --report reports/<feature>-<date>.html --report-media reports/media/<review-name> --report-builder docs/build_<feature>.py
```

Verify the runtime card's clickable Board target. The final handoff contains only the
feature's review heading and the concise absolute `review_runtime.py up <review-name> --ref
<committed-sha>` command. Never include an Open-it table, a direct board URL, a `file://`
report, or a stop command.

This standing instruction may not repeat the feature just implemented. Recover it from the
task history, diff, source, and regression test. If the fixture skill lacks the new shape,
binding, state, or gesture, update its narrow guidance/example before generating the board.
Generate through the real SystemSketch editor/autosave helper rather than hand-maintaining
tldraw schema JSON. Inspect the generated PNG and drive the saved fixture once in the real
app; the board complements the smoke test and never replaces it. Never use `~/SystemSketch`.

## Reports — retained runtime contract

Reports are now served with their boards from one retained, commit-pinned runtime. The tracked
page is `reports/<name>-<date>.html`; captures live in ignored
`reports/media/<review-name>/` and are referenced relatively. On first publish,
`review_runtime.py up` copies that ignored directory into its retained worktree and, when
given `--report-builder`, rebuilds the page with `SYSTEMSKETCH_REPORT_OUTPUT` and
`SYSTEMSKETCH_REPORT_MEDIA_DIR`. Its terminal card exposes clickable **Board** and **Report**
labels rather than raw URLs.

At handoff, end with only `## Review · <feature>` and the one-line absolute
`review_runtime.py up <review-name> --ref <committed-sha>` command. The detailed
self-contained `file://` procedure below is retained only as the record of the predecessor;
do not follow it for new work.

### Retired `file://` procedure (historical)

The builder is the source: every report is a `docs/build_<name>.py`, self-contained, with
captures from `docs/assets/` inlined as data URIs. Measure numbers **at build time from the
live repo** rather than hardcoding them, so a report cannot drift from the tree it describes.
Render it headlessly and look at it before handing it over, then link it from `README.md` by
its `reports/` path. Generated `docs/assets/crop-*.png` are build output and gitignored.

**The finished HTML is written to the absolute path
`/home/bam/systemsketch/reports/<name>-<date>.html`, and that is the path you hand over** —
even when you are working inside a worktree.

```
file:///home/bam/systemsketch/reports/<name>-<date>.html
```

WHY: two separate failures forced this, on 2026-09-06 and 2026-09-07. A report written into a
worktree's own tree dies when the worktree is swept, so the `file://` link Zach clicks a day
later is gone. And Claude Code's desktop preview will only read a file inside the session's
granted roots — `[cwd, originCwd, worktreePath, harnessCwd, …granted]` — so a path in
`~/zach_brain` renders "Couldn't find this file" from *any* session rooted here, however
durable the file is. The main checkout's `reports/` is the one directory that satisfies both:
it never gets swept, and `originCwd` puts it inside the granted roots of every session in this
repo, worktree lanes included. The tempting alternatives are both dead ends — a symlink from
the repo into the vault fails because the Electron main process realpaths before its
containment check, and the in-app "Add folder to session" control does not render for local
sessions (and is session-scoped even where it does).

Do **not** publish reports into `~/zach_brain` any more. `publish_report.py` still exists for
other repos; SystemSketch does not use it.

`reports/` has two halves, and **inlined payload** decides which one a report lands in:

| | git | what goes here |
|---|---|---|
| `reports/<name>-<date>.html` | tracked | text, CSS, inline SVG — under 256 KB of data URIs |
| `reports/media/<name>-<date>.html` | **gitignored** | anything that inlines captures, GIFs or video |

WHY payload and not total size: reports are bimodal. Across the ten published on
2026-09-07 every one was either 0% base64 or 97-99% base64 — nothing in between — so a
size threshold admits media by accident. A 1 MB cap let two pages through that were 98.2%
and 98.9% captures, purely because they weighed 890 KB and 955 KB.

WHY the line is drawn around the whole file: a report cannot reference its media as
sibling files. Claude Code's HTML preview turns the page into a
`data:text/html;charset=utf-8,<encoded>` URL — non-hierarchical, so a relative
`<img src="media/x.png">` has nothing to resolve against and never loads. Every other
previewable type gets a real `pathToFileURL` base; HTML and SVG are the deliberate
exception. A page that carries media *is* its media. Zach's call on 2026-09-07 — "git
ignore the media of the reports for now, keep the light weight stuff" — with `.git`
already at 1.4 GB, 209 MB of it base64 captures inlined into tracked `docs/*.html`.
`tests/test_report_weight.py` holds both lines and is mutation-tested red.

Two constraints on the file itself:

- **Two ceilings, and the tight one is 2 MB measured *encoded*, not on disk.** The native
  HTML preview builds `data:text/html;charset=utf-8,<encoded>` and refuses the page three
  ways at **2,097,024 bytes** — `PREVIEW_FILE_TOO_LARGE`, `PREVIEW_CONTENT_TOO_LARGE`,
  `PREVIEW_URL_TOO_LARGE`. How much `encodeURIComponent` inflates depends entirely on the
  content, and the spread is huge: a base64-heavy page grows ~7-8% (its alphabet is nearly
  all URL-safe), a text-heavy page grows **46-73%**, because every `<`, `>`, `"` and `/`
  becomes three bytes. Measured on the ten reports published 2026-09-07: media pages +6.8%
  to +8.5%, text pages +46.4% to +72.8%. So the on-disk line is **~1.9 MB for a media page
  but only ~1.2 MB for a text one** — never reason from file size alone.
  `tests/test_report_weight.py` measures the encoded length for you. Past the cap the pane
  still *reads* the file (that wall is `SESSION_FILE_MAX_BYTES`, 10,485,760) but will not
  render it, so **say "browser only" in the handoff** when you ship one over.
- **One report per unit of work.** Extend and re-link an existing one rather than spawning a
  second.

Full rule: [`skills/review-hub`](skills/review-hub/SKILL.md).

## Decisions go in `docs/peps/`; corrections go in `docs/bugs/`

Keep the two kinds of record distinct:

- A PEP records a real engineering choice: “we chose X over Y because…”. It can cover
  architecture, process, or another decision future work should understand.
- A bug record explains a correction: “it was supposed to do X and did Y”. It names how the
  failure escaped, the sibling paths swept, and the proof that protects the fix.

Most work needs neither record. Use a local `WHY:` comment for reasoning that belongs at one
code seam. Full workflows: `docs/peps/README.md` and `docs/bugs/README.md`.

**A PEP is history, not law.** Do not accept or reject a design because a numbered record says
so. Re-derive the claim from the primary source; for behavioural questions, run the smallest
useful experiment against the real app. Observed behaviour beats code archaeology, and both beat
the PEP's prose. If new evidence reverses a merged decision, write a new PEP and mark the old
one `Superseded by NNNN`; never silently rewrite what was believed at the time.

**Write it at merge time, not before, and stay sparing.** A PEP describes what actually
landed on `main`, not a branch's or worktree's intermediate churn — don't create one for work
that might still be reverted. Most decisions still just get a `WHY:` comment where they live
(already a live convention in `src/workspace/*`); only promote one to a numbered PEP when the
fork was real and it's cross-cutting or visual/comparative enough to deserve the rich-media
treatment. High signal beats complete — a PEP nobody will ever need is noise.

When a decision does get a PEP, leave the `WHY:` comment anyway and add one clause pointing at
it: `// WHY: <one line> — see docs/peps/0001-slug.md`. `tests/test_pep_links.py` is a small
documentation smoke alarm: it catches missing links, duplicate numbers, and malformed PEP
shape. It does not prove the PEP true or make the decision binding.

**Say so when you write one.** One line in your handoff — "Per `docs/peps/README.md`, also
wrote `docs/peps/0007-slug.md` and linked it at `file:line`." A PEP that lands silently in a
diff is easy for Zach to miss; the sync test proves the link works, not that anyone noticed.

## Several agent sessions edit this tree at once

Peers write here in real time — this is the normal case, not an edge case.

- `ls --time-style=full-iso` a file before rewriting it; if it moved in the last few minutes,
  it belongs to a peer's in-flight run. Leave it, or make a surgical exact-match edit that
  fails loudly rather than a rewrite.
- Never `git add -A`. Stage explicit pathspecs and read `git diff --cached --name-only` before
  every commit.
- Never reset, clean, or checkout over someone else's work.
- Don't kill a server you did not start.
- Don't delete a worktree by eye. `python3 scripts/sweep_worktrees.py` reports which ones are
  spent — merged into `main`, nothing uncommitted, nobody working in them — and `--remove`
  deletes only those. Merged alone is not enough: peers routinely leave uncommitted source in
  a worktree whose branch has already landed.
