# SystemSketch — repository guidance

Zach's portable context is already loaded from the agent's user-level configuration.
Do **not** run the vault ritual from this code repository: no `Settings/entry.md`,
`obsidian-edit.py`, daily-log writes, or vault authoring conventions. The vault is a
read-only source of prior thinking; deliver code and artifacts here.

## The design boundary

- Keep `tldraw@5.3.2` stock and pinned exactly. Add capability only through supported
  component, shape, tool, binding, and mount seams. Do not fork the engine or reimplement a
  tldraw primitive.
- `tests/test_stock_boundary.py` asserts the seam list in `src/App.tsx`. If you are about to
  implement drag, resize, snapping, or z-order, stop and use the stock primitive.

## Running the application

```bash
cd ~/systemsketch
npm run dev
```

- Stable is `:4321`; Preview is the candidate at `:4322`; the Preview API is `:4323`.
- `npm run dev` uses `--strictPort`. Check `ss -ltnp | grep 432` and set
  `SYSTEMSKETCH_DEV_PORT` / `SYSTEMSKETCH_API_PORT` for an extra server. Never kill Zach's.
- Channel moves are `release:candidate`, `release:promote`, and `release:rollback`.

## Worktree lifecycle

- Put each bounded implementation track in a fresh temporary worktree based on the current
  committed `main`. Use the repository's track tooling so the track owns its ports, runtime,
  and scratch board; do not reuse Stable, Preview, or another track's process.
- Worktrees isolate files, not design dependencies. Run tracks in parallel only when their
  contracts are independent, and keep one writer per shared seam.
- An already-merged worktree is finished. Even when Zach continues in the same chat, create
  a new worktree from the updated `main` before the next implementation change.
- Verify in the track, reconcile with current `main`, and re-run the relevant proof on the
  combined tree. After the merge is verified on `main`, remove the temporary worktree and
  delete its branch only if it is fully merged. Never remove dirty or unmerged work.
- In every handoff, name the worktree path, branch or detached commit, base commit, merge
  status, and whether cleanup is complete.

## Plugin boundary

- `vscode-systemsketch/` ships a build of the app, never a second canvas. Its staging script
  builds with `--base ./`; the host bundles independently.
- An extension may import from the app only through `src/embed/sharedWithHost.ts`. Keep that
  module free of React, tldraw, and the DOM.

## Proof and reports

- Run `npm run check` before handoff. For UI work, also drive a real CDP journey from
  `tests/*_smoke.mjs`, inspect its screenshots, and use a scratch `.systemsketch` or `.tldr`
  board—never Zach's auto-saved board.
- Reports are `docs/build_<name>.py` builders producing self-contained dated HTML. Measure
  facts from the live tree, render and inspect the report headlessly, then link it from
  `README.md`. `docs/assets/crop-*.png` is ignored build output.

## Seed the human review board before handoff

After implementing a feature and before handing over a launched Preview, use the repo-local
[`systemsketch-review-fixture`](skills/systemsketch-review-fixture/SKILL.md) skill to create
`sketches/review/<feature>.systemsketch`. Seed the minimum real Blocks, connections, and other
objects needed to exercise the interaction. Put numbered instruction cards and orange arrows
outside the interaction area, plus a green `PASS WHEN` card with the visible result. Give Zach
the exact `?board=` URL and keep the server running.

This standing instruction may not restate the feature just implemented. Recover it from the
task history, diff, source, and regression test. If the fixture skill lacks the new shape,
binding, state, or gesture, update its narrow guidance/example before generating the board.
Use the real-editor/autosave helper instead of hand-editing tldraw schema JSON, inspect the
generated PNG, and drive the fixture once in the real app. It supplements tests and never
targets `~/SystemSketch`.

## Concurrent edits

- This tree normally has several active sessions. Check mtime before rewriting; a recently
  changed file belongs to another lane unless a surgical exact-match edit is safe.
- Never use `git add -A`, reset, clean, or checkout over peer work. Do not kill a server you
  did not start.
