SystemSketch interaction recording — 2026-09-06T01:28:34.000Z · 13.8 s · an explicit take
channel preview · build worktree-code-block · http://127.0.0.1:4372/?board=/home/bam/systemsketch/.claude/worktrees/testing-architecture-regression-5636ee/sketches/review/merge-verification.systemsketch
viewport 1754×1192 @1.5x · state path select.idle → select.idle · 19 shapes at the end

Indexed moments (3; the first 3):
  +   1.64s  INFO  opened inspector
  +   3.88s  INFO  opened inspector
  +   6.17s  INFO  opened inspector

State-chart transitions (7):
  +   0.67s  select.idle  →  select.pointing_canvas   (pointer_down)
  +   0.70s  select.pointing_canvas  →  select.brushing   (pointer_move)
  +   0.92s  select.brushing  →  select.idle   (pointer_up)
  +   1.64s  select.idle  →  select.pointing_shape   (pointer_down)
  +   1.75s  select.pointing_shape  →  select.idle   (pointer_up)
  +   6.17s  select.idle  →  select.pointing_shape   (pointer_down)
  +   6.29s  select.pointing_shape  →  select.idle   (pointer_up)

Totals: 518 input events (502 moves, 3 presses, 0 key downs) · 41 DOM events · 75 store diffs · 0 menu changes · 0 console rows · 2 frames
Deep lanes: 3 app actions · 18 workspace events · 12 network events · 2 performance events · 75 lossless store diffs

States seen, and the file that defines each:
  select                       node_modules/tldraw/dist-esm/lib/tools/SelectTool/SelectTool.mjs
  idle                         node_modules/tldraw/dist-esm/lib/tools/SelectTool/childStates/Idle.mjs
  pointing_canvas              node_modules/tldraw/dist-esm/lib/tools/SelectTool/childStates/PointingCanvas.mjs
  brushing                     node_modules/tldraw/dist-esm/lib/tools/SelectTool/childStates/Brushing.mjs
  pointing_shape               node_modules/tldraw/dist-esm/lib/tools/SelectTool/childStates/PointingShape.mjs

Read these files, in this order:
1. /home/bam/systemsketch/.claude/worktrees/testing-architecture-regression-5636ee/sketches/review/SystemSketch/recordings/2026-09-05_18-28-34-take/README.md  — this summary
2. /home/bam/systemsketch/.claude/worktrees/testing-architecture-regression-5636ee/sketches/review/SystemSketch/recordings/2026-09-05_18-28-34-take/manifest.json  — artifact index, counts, sizes, capture health, and privacy boundaries
3. /home/bam/systemsketch/.claude/worktrees/testing-architecture-regression-5636ee/sketches/review/SystemSketch/recordings/2026-09-05_18-28-34-take/moments.json  — errors, stalls, app actions, and menu moments already paired with the nearest frame
4. /home/bam/systemsketch/.claude/worktrees/testing-architecture-regression-5636ee/sketches/review/SystemSketch/recordings/2026-09-05_18-28-34-take/timeline.jsonl  — the compact causal index, one JSON object per line. `t` is ms since the start. Lanes: input (what tldraw's state chart received), dom (raw key, pointer, and click events on the window, with the UI element hit), state (state-chart path changes), menu (open menus), store (compact add/update/remove summaries), console, action, workspace, network, perf, ui, and mark.
5. /home/bam/systemsketch/.claude/worktrees/testing-architecture-regression-5636ee/sketches/review/SystemSketch/recordings/2026-09-05_18-28-34-take/frames/  — 2 event-aware screenshots named by ms since the start (f-013808.png = +13.81 s). Use the frame named by moments.json, or open the first frame with a larger t. Canvas-only frames: tldraw's shape export at the start and end, no UI chrome — this page had no Chrome debugging port for a screencast.
6. /home/bam/systemsketch/.claude/worktrees/testing-architecture-regression-5636ee/sketches/review/SystemSketch/recordings/2026-09-05_18-28-34-take/store.full.jsonl  — complete added, removed, and before/after updated records; timeline store rows point here by `detail` id
7. /home/bam/systemsketch/.claude/worktrees/testing-architecture-regression-5636ee/sketches/review/SystemSketch/recordings/2026-09-05_18-28-34-take/start.snapshot.json  — the tldraw store (document + session records) at t=0; /home/bam/systemsketch/.claude/worktrees/testing-architecture-regression-5636ee/sketches/review/SystemSketch/recordings/2026-09-05_18-28-34-take/end.snapshot.json is the store at save time. `editor.store.loadStoreSnapshot(start)` then replaying `store.full.jsonl` reproduces every document instant.
8. /home/bam/systemsketch/.claude/worktrees/testing-architecture-regression-5636ee/sketches/review/SystemSketch/recordings/2026-09-05_18-28-34-take/workspace.jsonl, network.jsonl, ui-hits.jsonl, performance.jsonl, browser-errors.jsonl, actions.jsonl, host.jsonl — detailed lanes; open only when the compact index points there
9. /home/bam/systemsketch/.claude/worktrees/testing-architecture-regression-5636ee/sketches/review/SystemSketch/recordings/2026-09-05_18-28-34-take/playback.html  — open in a browser: slow frames, fast lanes, one scrubber; #t=<ms> deep-links a moment.

Recorder cost inside the page: 13.6 ms over 13.81 s of uptime.
