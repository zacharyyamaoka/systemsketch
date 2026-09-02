# Work order — the flight recorder, after v1

Written 2026-09-01 for whichever agent picks this up. Everything below is
verifiable from the tree; nothing here needs the author.

## Where things stand

- **Branch:** `claude/state-recorder-design-95c0fc`, pushed to origin, with `main`
  merged in. `git merge-base --is-ancestor main <branch>` is true, so from Zach's
  checkout it is `git merge --ff-only claude/state-recorder-design-95c0fc`.
- **Worktree:** `/home/bam/systemsketch/.claude/worktrees/state-recorder-design-95c0fc`
  (node_modules is a symlink to the main checkout's). Background sessions on this
  box cannot run Bash while *inside* a worktree via EnterWorktree; work from the
  main checkout and target the worktree by absolute path, or just merge first.
- **Gate:** `npm run check` green on the merged tree (tsc · 387 vitest · 44 Python).
  `npm run test:recorder` green, 30/30, in a real headless Chrome.
- **Reports:** `docs/state-recorder-design-2026-09-01.html` (the design review,
  prior art, the spike) and `docs/recorder-implementation-2026-09-01.html` (what
  shipped, the screencast cost measurement, captures, every check). Builders are
  `docs/build_state_recorder_design.py` and `docs/build_recorder_implementation.py`;
  the latter refuses to build if `docs/assets/recorder-acceptance.json` is older
  than the journey or `src/`, so re-run `npm run test:recorder` first.
- **Vault:** the conversation lives in
  `~/zach_brain/Sources/Notes/PROJECT - System Sketch.md` § *Recording program
  state* (two `[!ai]-` callouts, marker ids `systemsketch-state-recorder-design-2026-09-01`
  and `systemsketch-recorder-implementation-2026-09-01`), plus two concept notes:
  `C - Flight Recorder Debugging (Save the Last 30 Seconds, Not the Next)` and
  `C - Trace Viewer Shape (Slow Filmstrip + Fast Event Lanes on One Clock)`.
  Edit the note through `Settings/Scripts/obsidian-edit.py`, never with a raw write.

## What v1 is (steps 1–6 of the design review's §7)

| Piece | File | Notes |
|---|---|---|
| Ring buffer | `src/recorder/flightRecorder.ts` | Seven lanes on one `performance.now()` clock: `input` (tldraw's event bus), `dom` (capture-phase keydown/keyup/pointerdown on `window`, with the UI element hit — tldraw does not see key-downs while a menu or text field has focus), `state` (state-chart path changes via `editor.getPath()`), `menu` (`editor.menus.getOpenMenus()`), `store` (record diffs, document + session, pointer record skipped), `console` (patched console + uncaught errors + editor crash), `mark`. Window trimmed on every push. `collect('last')` rewinds the end snapshot through the window's diffs with tldraw's `reverseRecordsDiff`; `collect('take')` uses the snapshot taken at `beginTake()`. |
| Store / policy | `src/recorder/recorderStore.ts` | One recorder per page, `useSyncExternalStore` for the UI. Default enabled = `import.meta.env.DEV` (Preview + presets on, built Stable off); override persisted at `systemsketch.recorder.enabled.v1`; window at `systemsketch.recorder.window-ms.v1`. `installFlightRecorder(editor)` is called from both `onMount`s in `src/App.tsx`; never in the embedded IDE lane. Arms the host (`POST /api/recordings/arm`) on mount and on toggle. Clipboard: `navigator.clipboard.writeText`, then `execCommand('copy')`, failure reported as failure. An auto-stopped take saves but does not touch the clipboard. |
| Host client | `src/recorder/recorderClient.ts` | `armRecorder`, `saveRecording`, `readLastRecording` (`GET /api/recordings/last` answers 200 with `{recording: null}` when empty — a 404 printed a console error into the very lane being recorded). |
| UI | `src/recorder/RecorderControls.tsx`, `recorder.css` | `RecorderControls` (Dev-menu rows between *Isolated presets* and *Version & updates*; `compact` form in the presets' identity bar) and `RecorderIndicator` (the REC bar, **portaled to `document.body`** because the canvas layer sits under tldraw's top chrome). Test ids: `recorder-controls` (`data-mode`, `data-enabled`), `recorder-indicator`, `recorder-note`, `recorder-last-path`; actions `data-action="save-last" | "take" | "copy-last" | "toggle"`, chips `data-window="<ms>"`. |
| Folder writer | `scripts/recording_store.py` | `write_recording()` → `~/SystemSketch/recordings/<local YYYY-MM-DD_HH-MM-SS>-<slug of note or mode>/` under the host's `files_root`, staged then `os.replace`d; keeps the last 20 (`prune_recordings`). Files: `README.md` (the packet), `header.json`, `timeline.jsonl`, `start.snapshot.json`, `end.snapshot.json`, `frames/f-<ms>.jpg`, `frames.jsonl`, `states.json`, `playback.html`. `state_sources()` maps every state seen to the file that declares its id (`id = 'x'` or `id = CONSTANT`), preferring `src/`, then the parent tool's shallowest file, then `@tldraw/editor` base tools. `FrameSidecar` owns the Node sidecar process (JSON lines over stdin/stdout). |
| Host routes | `scripts/server.py` | `POST /api/recordings` (body = the buffer payload + `channel/build/version` + optional `canvasFrames`), `POST /api/recordings/arm` `{enabled, url}`, `GET /api/recordings/last`, `GET /api/recordings/status`. New CLI flag `--cdp-port`. `health_payload` gained `recorderFrames`. |
| Sidecar | `scripts/recorder_frames.mjs` | `--cdp-port --url-prefix [--window-ms 30000] [--every-nth 2] [--quality 70] [--max-width 0]`. Polls `/json/list`, attaches to every page under the prefix, `Page.startScreencast` while armed, ring per page trimmed by window and bytes, re-arms after navigation. Ops: `arm`, `status`, `dump {dir, fromWall, toWall, keepGapMs, url}`, `quit`. Frames are named by ms since the recording's `startedAtWall`. Node's built-in WebSocket connects to a Chrome started **without** `--remote-allow-origins` (verified). |
| Launcher | `scripts/launch_systemsketch.py` | `--remote-debugging-port=<4324 preview | 4325 stable>` on the desktop Chrome (env `SYSTEMSKETCH_PREVIEW_CDP_PORT` / `SYSTEMSKETCH_STABLE_CDP_PORT`), passed to the host as `--cdp-port` for both channels. |
| Release | `scripts/release_lib.py` | `recording_store.py` and `recorder_frames.mjs` are in `CONTROLLER_RUNTIME_FILES`, copied into a release's `runtime/`, and part of the controller fingerprint (so Preview's host restarts on next launch). |
| Harness | `tests/browser_harness.mjs` | `startApp({ cdpToApi: true })` starts Chrome first and passes its DevTools port to the host as `--cdp-port`. Chrome now always starts before the servers. |
| Proof | `tests/recorder_smoke.mjs`, `tests/test_recording_store.py`, `src/recorder/flightRecorder.test.ts` | Journey writes `docs/assets/recorder-acceptance.json`, `recorder-sample-packet.txt`, `recorder-sample-timeline.jsonl` and four captures, last, only if all checks pass. |
| Measurement | `docs/recorder_screencast_cost.mjs` → `docs/assets/recorder-spike/screencast-cost.json` | Headless, GPU disabled: ~17 ms Chrome CPU per delivered frame, nothing at rest, page frame timing unchanged. |

## Contracts to keep

- **Folder layout and packet order** above. The packet is prose first, then absolute
  paths in reading order (README → timeline → frames → snapshots → playback), then
  the recorder's own cost. `copy-for-claude` shape: paths, never base64.
- **One clock.** Rows carry `t` in ms since the recording's start; frames carry
  Chrome's swap time on the wall clock and are renamed relative to
  `header.startedAtWall`. Skew measured at 7 ms median.
- **Retention is 20 folders**, the folder is a buffer, not an archive.
- **tldraw stays stock.** Everything hangs off `editor.on`, `store.listen`,
  `getPath`, `menus.getOpenMenus`, `getStoreSnapshot`, `reverseRecordsDiff`, and
  the existing component seams; `tests/test_stock_boundary.py` must keep passing.

## Merge state on 2026-09-02

Zach asked for the merge. The branch absorbed that day's `main` cleanly (a new
theme-token gate arrived with it; `src/recorder/recorder.css` now names tokens only)
and every gate was re-run green. `git merge --ff-only` into his checkout was refused
because a peer had uncommitted work in six of the same files (README.md,
package.json, scripts/server.py, scripts/launch_systemsketch.py,
tests/browser_harness.mjs, tests/test_release_system.py). That work was left alone.
When it lands, the merge is still one fast-forward. A review board is committed at
`sketches/review/flight-recorder.systemsketch` (recipe and PNG beside it); note that
the fixture helper on `main` does not bind cue arrows at either end, in this board
or in the peers' boards, so a moved target leaves the orange arrow behind.

## What to do next

1. **Zach merges and relaunches.** Not an agent's call. After the merge:
   `npm run desktop:stop && npm run desktop:preview && npm run desktop:start`, so the
   windows get the debugging port. Until then a save on the old windows says
   *frames: canvas only* and the packet says why.
2. **Prove the Stable channel end to end.** Not yet driven: stage a candidate with
   `npm run release:candidate`, promote, launch Stable from the release runtime, turn
   the recorder On in Stable's Dev menu, save, and confirm frames arrive through the
   runtime copy of the sidecar. The unit tests cover the file plumbing; the launch
   itself has not been exercised. Use a private `--state-home` / `--release-home`
   and never Zach's real board.
3. **Measure the screencast on a windowed, GPU-backed Chrome.** The numbers are
   headless-only. `tests/desktop_windows_smoke.mjs` shows how to drive a real
   `--app` window on a private Xvfb display; a variant of
   `docs/recorder_screencast_cost.mjs` against that would close the caveat. Do not
   open a window on Zach's `DISPLAY=:0`.
4. **Multi-window behaviour.** The sidecar attaches to every page of the channel's
   Chrome and picks the dump target by URL match; only single-page runs were
   proved. A duplicate-board Preview window plus the original is the case to try.
5. **Step 7, parked by Zach:** replay-to-test (drive the `input` lane through
   `Input.dispatchMouseEvent` at the recorded viewport onto `start.snapshot.json`
   and make it a failing journey) and a Chrome trace export (legacy `Screenshot`
   events + extensibility marks, opened in DevTools › Performance › Load profile).
   Both were deliberately left out of v1.
6. **Small polish, none load-bearing:** the state map says *(not found)* for a
   handful of tldraw core states with no `id = '…'` literal; a keyboard shortcut
   for *Save the last 30 s* was not added because tldraw owns most keys; the
   Recording section has no dark-theme pass beyond the inputs and chips.

## How to run it

```bash
cd ~/systemsketch && npm run check                 # tsc + vitest + python
cd ~/systemsketch && npm run test:recorder         # the real-browser journey
cd ~/systemsketch && node docs/recorder_screencast_cost.mjs   # ~2.5 min, rewrites screencast-cost.json
cd ~/systemsketch/docs && python3 build_recorder_implementation.py
```

A test instance serves the branch without touching the real Stable/Preview
(4321–4323): host on 4353 with `--cdp-port 4354`, vite on 4352, files root under
the worktree's `.track/files`. Pids in `.track/api.pid` / `.track/vite.pid`; stop with
`kill $(cat .track/api.pid) $(cat .track/vite.pid)` from the worktree.
