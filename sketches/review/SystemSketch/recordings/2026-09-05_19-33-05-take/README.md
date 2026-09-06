SystemSketch interaction recording — 2026-09-06T02:33:05.555Z · 11.8 s · an explicit take
channel preview · build worktree-code-block · http://127.0.0.1:4372/?board=/home/bam/systemsketch/.claude/worktrees/testing-architecture-regression-5636ee/sketches/review/merge-verification.systemsketch
viewport 1754×1192 @1.5x · state path select.idle → select.idle · 19 shapes at the end

Indexed moments (4; the first 4):
  +   0.14s  WARN  main thread blocked for 100.0 ms
  +   1.09s  INFO  opened inspector
  +   6.99s  INFO  opened inspector
  +   8.89s  INFO  opened inspector

State-chart transitions (9):
  +   1.09s  select.idle  →  select.pointing_shape   (pointer_down)
  +   1.17s  select.pointing_shape  →  select.idle   (pointer_up)
  +   5.89s  select.idle  →  select.pointing_canvas   (pointer_down)
  +   5.97s  select.pointing_canvas  →  select.idle   (pointer_up)
  +   6.98s  select.idle  →  select.pointing_shape   (pointer_down)
  +   7.11s  select.pointing_shape  →  select.idle   (pointer_up)
  +   9.08s  select.idle  →  select.pointing_shape   (pointer_down)
  +   9.10s  select.pointing_shape  →  select.translating   (pointer_move)
  +   9.18s  select.translating  →  select.idle   (pointer_up)

Totals: 444 input events (432 moves, 4 presses, 0 key downs) · 27 DOM events · 33 store diffs · 0 menu changes · 0 console rows · 2 frames
Deep lanes: 3 app actions · 21 workspace events · 11 network events · 2 performance events · 33 lossless store diffs

States seen, and the file that defines each:
  select                       node_modules/tldraw/dist-esm/lib/tools/SelectTool/SelectTool.mjs
  idle                         node_modules/tldraw/dist-esm/lib/tools/SelectTool/childStates/Idle.mjs
  pointing_shape               node_modules/tldraw/dist-esm/lib/tools/SelectTool/childStates/PointingShape.mjs
  pointing_canvas              node_modules/tldraw/dist-esm/lib/tools/SelectTool/childStates/PointingCanvas.mjs
  translating                  node_modules/tldraw/dist-esm/lib/tools/SelectTool/childStates/Translating.mjs

Read these files, in this order:
1. /home/bam/systemsketch/.claude/worktrees/testing-architecture-regression-5636ee/sketches/review/SystemSketch/recordings/2026-09-05_19-33-05-take/README.md  — this summary
2. /home/bam/systemsketch/.claude/worktrees/testing-architecture-regression-5636ee/sketches/review/SystemSketch/recordings/2026-09-05_19-33-05-take/manifest.json  — artifact index, counts, sizes, capture health, and privacy boundaries
3. /home/bam/systemsketch/.claude/worktrees/testing-architecture-regression-5636ee/sketches/review/SystemSketch/recordings/2026-09-05_19-33-05-take/moments.json  — errors, stalls, app actions, and menu moments already paired with the nearest frame
4. /home/bam/systemsketch/.claude/worktrees/testing-architecture-regression-5636ee/sketches/review/SystemSketch/recordings/2026-09-05_19-33-05-take/timeline.jsonl  — the compact causal index, one JSON object per line. `t` is ms since the start. Lanes: input (what tldraw's state chart received), dom (raw key, pointer, and click events on the window, with the UI element hit), state (state-chart path changes), menu (open menus), store (compact add/update/remove summaries), console, action, workspace, network, perf, ui, and mark.
5. /home/bam/systemsketch/.claude/worktrees/testing-architecture-regression-5636ee/sketches/review/SystemSketch/recordings/2026-09-05_19-33-05-take/frames/  — 2 event-aware screenshots named by ms since the start (f-011808.png = +11.81 s). Use the frame named by moments.json, or open the first frame with a larger t. Canvas-only frames: tldraw's shape export at the start and end, no UI chrome — this page had no Chrome debugging port for a screencast.
6. /home/bam/systemsketch/.claude/worktrees/testing-architecture-regression-5636ee/sketches/review/SystemSketch/recordings/2026-09-05_19-33-05-take/store.full.jsonl  — complete added, removed, and before/after updated records; timeline store rows point here by `detail` id
7. /home/bam/systemsketch/.claude/worktrees/testing-architecture-regression-5636ee/sketches/review/SystemSketch/recordings/2026-09-05_19-33-05-take/start.snapshot.json  — the tldraw store (document + session records) at t=0; /home/bam/systemsketch/.claude/worktrees/testing-architecture-regression-5636ee/sketches/review/SystemSketch/recordings/2026-09-05_19-33-05-take/end.snapshot.json is the store at save time. `editor.store.loadStoreSnapshot(start)` then replaying `store.full.jsonl` reproduces every document instant.
8. /home/bam/systemsketch/.claude/worktrees/testing-architecture-regression-5636ee/sketches/review/SystemSketch/recordings/2026-09-05_19-33-05-take/workspace.jsonl, network.jsonl, ui-hits.jsonl, performance.jsonl, browser-errors.jsonl, actions.jsonl, host.jsonl — detailed lanes; open only when the compact index points there
9. /home/bam/systemsketch/.claude/worktrees/testing-architecture-regression-5636ee/sketches/review/SystemSketch/recordings/2026-09-05_19-33-05-take/playback.html  — open in a browser: slow frames, fast lanes, one scrubber; #t=<ms> deep-links a moment.

Recorder cost inside the page: 13.2 ms over 11.81 s of uptime.
