# 0011: A Behavior Tree run's canonical state is its transition log

- **Status:** Accepted
- **Date:** 2026-09-06
- **Merge:** 175c72e8 (`worktree-agent-a69f2ed13c2bc39ce` @ 32d783fe → `main`)

## Context

Run mode had to show a Behavior Tree executing. Nothing about the execution *source* was
settled when it was built, and still isn't: three backend transports are live candidates —
a run sidecar file the host watches, a Groot2-shaped run channel on the Preview host
(recommended), and trace-first replay of a recorded run. Shipping the visualization behind a
seeded mock engine let the rendering language land without that choice, but only if the state
model was chosen so that whichever transport wins can feed it unchanged.

Two things forced the model beyond "hold each node's current status". A run is something Zach
wants to *read*, not just watch: stepping back one transition, scrubbing to an earlier tick,
and asking "what was true at tick 12" are the operations that make an execution legible. And a
tick is not atomic — a Reactive Sequence can halt a RUNNING child and resolve an earlier one
inside the same tick, so ordering *within* a tick carries real meaning. A structure that only
knows the present cannot answer either.

There was also a live hazard specific to this app. A Behavior Tree region is a projection of
its own `props.xml`, reconciled into real Blocks. The path of least resistance was to write
status onto those projected shapes and let the existing reconcile machinery paint it — which
would have made a mock run a document mutation, on the undo stack, in autosave, in the file.

## Decision

The canonical runtime state is an append-only log of status transitions —
`{seq, tick, at, treeId, path, from, to}` — and nothing else. Every visual is a pure fold of
that log at a cursor: node fills, wire status, group aggregation, the spinner path over
RUNNING ancestors, and the inspector's transitions table all derive from `reconstructAt(log,
index, rootKey)`. The cursor is an index into the log, so "step one transition" and "scrub to
tick N" are the same operation at different granularities, and "live" is just the cursor
sitting at the end.

The engine can also emit a per-tick end-state snapshot. It is used **only** as independent
ground truth that the fold is checked against in tests; nothing in the app renders from it.

A run never writes the document. Runtime state lives entirely in the run store, keyed by
region id. Editing the XML under a live run marks that run **stale** rather than remapping it
onto the new tree.

## Alternatives considered

- **A per-node current-status map, mutated in place.** The obvious model, and what a naive
  live-status feed would hand you. Rejected because it is a fold with the history thrown
  away: no step-back, no scrub, no transitions table, and no way to express two ordered
  transitions inside one tick. Every feature that makes a run readable would have had to be
  bolted back on as a parallel history anyway.
- **Per-tick frame snapshots as the canonical form.** Scrubbing by tick becomes an array
  index, which is genuinely simpler. Rejected because it costs O(nodes × ticks) to keep, it
  cannot represent ordering within a tick, and stepping by single transition — the granularity
  that actually explains a Reactive halt — is not expressible at all. Snapshots survive in the
  codebase, demoted to the test oracle, which is the role they are good at.
- **Write status onto the projected shapes / region props.** Free rendering: the reconcile
  path already paints from the document. Rejected because it makes a run an edit — undoable,
  autosaved, and diffed into the `.systemsketch` file. A mock run leaving fossils in a real
  board is a worse bug than any rendering cost it saves.

## Consequences

- The porting contract for a real backend is now exactly one shape: produce that transition
  log. The transport decision stays genuinely open, and picking it later is not a rewrite of
  the rendering layer.
- Scrub, step-by-tick, step-by-transition and the Groot2-style table are all one mechanism,
  so they cannot disagree with each other or with the canvas.
- The snapshot/fold split gives the engine an oracle that is independent of the code under
  test — `reconstructAt` is checked against a value the fold never touched, rather than
  against itself.
- Memory grows with transition count, not with wall-clock time. A long run of a mostly-idle
  tree is cheap; a hot Reactive tree is not. Nothing truncates the log today, and a real
  backend running for minutes is where that will first bite.
- Because runtime state is not in the document, it cannot survive a reload, and it cannot be
  saved or shared. That is intended: a mock run is evidence, not content.
- A future reader tempted to "simplify" the store into a status map should read this first —
  that change silently deletes scrub, step-back and the table, and they will not fail loudly.

## References

- Code: `src/behaviorTree/runtime/btMockEngine.ts:11` — the contract header's `WHY:` pointer
  back here; `src/behaviorTree/runtime/runStore.ts:17` — the cursor-is-a-fold rule
- Evidence: `docs/behavior-tree-runtime-viz-proposal-2026-09-05.html` (the three transports
  and the rendering language), `docs/bt-runtime-lab-2026-09-05.html` (the model implemented
  over captured chrome, with the reconstruct-any-tick-exactly property as its acceptance)
- Test: `tests/behavior_tree_run_mode_smoke.mjs` — 32 checks in a real browser, including
  "no runtime status ever reaches the document"
