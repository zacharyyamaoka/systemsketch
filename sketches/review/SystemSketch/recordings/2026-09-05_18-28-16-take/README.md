SystemSketch interaction recording — 2026-09-06T01:28:16.068Z · 11.4 s · an explicit take
channel preview · build worktree-code-block · http://127.0.0.1:4372/?board=/home/bam/systemsketch/.claude/worktrees/testing-architecture-regression-5636ee/sketches/review/merge-verification.systemsketch
viewport 1754×1192 @1.5x · state path select.idle → select.idle · 19 shapes at the end

Indexed moments (7; the first 7):
  +   0.15s  WARN  main thread blocked for 113.0 ms
  +   1.36s  INFO  opened inspector
  +   3.87s  INFO  opened inspector
  +   4.01s  INFO  opened inspector
  +   6.24s  INFO  opened inspector
  +   7.67s  INFO  opened inspector
  +   9.77s  INFO  opened inspector

State-chart transitions (12):
  +   1.35s  select.idle  →  select.pointing_shape   (pointer_down)
  +   1.47s  select.pointing_shape  →  select.idle   (pointer_up)
  +   4.01s  select.idle  →  select.pointing_shape   (pointer_down)
  +   4.03s  select.pointing_shape  →  select.translating   (pointer_move)
  +   4.10s  select.translating  →  select.idle   (pointer_up)
  +   4.98s  select.idle  →  select.pointing_canvas   (pointer_down)
  +   5.08s  select.pointing_canvas  →  select.idle   (pointer_up)
  +   6.23s  select.idle  →  select.pointing_shape   (pointer_down)
  +   6.31s  select.pointing_shape  →  select.translating   (pointer_move)
  +   7.15s  select.translating  →  select.idle   (pointer_up)
  +   7.66s  select.idle  →  select.pointing_shape   (pointer_down)
  +   7.77s  select.pointing_shape  →  select.idle   (pointer_up)

Totals: 435 input events (409 moves, 5 presses, 0 key downs) · 65 DOM events · 145 store diffs · 0 menu changes · 0 console rows · 2 frames
Deep lanes: 6 app actions · 26 workspace events · 13 network events · 2 performance events · 145 lossless store diffs

States seen, and the file that defines each:
  select                       node_modules/tldraw/dist-esm/lib/tools/SelectTool/SelectTool.mjs
  idle                         node_modules/tldraw/dist-esm/lib/tools/SelectTool/childStates/Idle.mjs
  pointing_shape               node_modules/tldraw/dist-esm/lib/tools/SelectTool/childStates/PointingShape.mjs
  translating                  node_modules/tldraw/dist-esm/lib/tools/SelectTool/childStates/Translating.mjs
  pointing_canvas              node_modules/tldraw/dist-esm/lib/tools/SelectTool/childStates/PointingCanvas.mjs

Read these files, in this order:
1. /home/bam/systemsketch/.claude/worktrees/testing-architecture-regression-5636ee/sketches/review/SystemSketch/recordings/2026-09-05_18-28-16-take/README.md  — this summary
2. /home/bam/systemsketch/.claude/worktrees/testing-architecture-regression-5636ee/sketches/review/SystemSketch/recordings/2026-09-05_18-28-16-take/manifest.json  — artifact index, counts, sizes, capture health, and privacy boundaries
3. /home/bam/systemsketch/.claude/worktrees/testing-architecture-regression-5636ee/sketches/review/SystemSketch/recordings/2026-09-05_18-28-16-take/moments.json  — errors, stalls, app actions, and menu moments already paired with the nearest frame
4. /home/bam/systemsketch/.claude/worktrees/testing-architecture-regression-5636ee/sketches/review/SystemSketch/recordings/2026-09-05_18-28-16-take/timeline.jsonl  — the compact causal index, one JSON object per line. `t` is ms since the start. Lanes: input (what tldraw's state chart received), dom (raw key, pointer, and click events on the window, with the UI element hit), state (state-chart path changes), menu (open menus), store (compact add/update/remove summaries), console, action, workspace, network, perf, ui, and mark.
5. /home/bam/systemsketch/.claude/worktrees/testing-architecture-regression-5636ee/sketches/review/SystemSketch/recordings/2026-09-05_18-28-16-take/frames/  — 2 event-aware screenshots named by ms since the start (f-011351.png = +11.35 s). Use the frame named by moments.json, or open the first frame with a larger t. Canvas-only frames: tldraw's shape export at the start and end, no UI chrome — this page had no Chrome debugging port for a screencast.
6. /home/bam/systemsketch/.claude/worktrees/testing-architecture-regression-5636ee/sketches/review/SystemSketch/recordings/2026-09-05_18-28-16-take/store.full.jsonl  — complete added, removed, and before/after updated records; timeline store rows point here by `detail` id
7. /home/bam/systemsketch/.claude/worktrees/testing-architecture-regression-5636ee/sketches/review/SystemSketch/recordings/2026-09-05_18-28-16-take/start.snapshot.json  — the tldraw store (document + session records) at t=0; /home/bam/systemsketch/.claude/worktrees/testing-architecture-regression-5636ee/sketches/review/SystemSketch/recordings/2026-09-05_18-28-16-take/end.snapshot.json is the store at save time. `editor.store.loadStoreSnapshot(start)` then replaying `store.full.jsonl` reproduces every document instant.
8. /home/bam/systemsketch/.claude/worktrees/testing-architecture-regression-5636ee/sketches/review/SystemSketch/recordings/2026-09-05_18-28-16-take/workspace.jsonl, network.jsonl, ui-hits.jsonl, performance.jsonl, browser-errors.jsonl, actions.jsonl, host.jsonl — detailed lanes; open only when the compact index points there
9. /home/bam/systemsketch/.claude/worktrees/testing-architecture-regression-5636ee/sketches/review/SystemSketch/recordings/2026-09-05_18-28-16-take/playback.html  — open in a browser: slow frames, fast lanes, one scrubber; #t=<ms> deep-links a moment.

Recorder cost inside the page: 19.1 ms over 11.35 s of uptime.
