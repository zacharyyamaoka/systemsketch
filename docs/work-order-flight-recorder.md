# Work order — the flight recorder, after v1

Written 2026-09-01 and updated 2026-09-02 for the explicit Start/Stop interaction.
Everything below is verifiable from the tree; nothing here needs the author.

## Where things stand

- **Current follow-up:** the explicit Start/Stop work was reconciled with committed
  `main`, fast-forwarded into `main` through `9147e6f`, and verified there. Its
  temporary `/home/bam/systemsketch-track-recorder-start-stop` worktree and
  `track/recorder-start-stop` branch were removed after Git confirmed the branch
  was fully merged.
- **Progressive deep capture:** implemented on `track/recorder-deep-capture` from
  `main` at `3f04a70`. The clipboard packet remains compact, while its manifest
  and moments index route into lossless store diffs, structured browser/host
  errors, workspace/autosave lifecycle, redacted network timing, semantic app
  actions, UI hit-test geometry, performance stalls, exact build/window/target
  identity, and event-adjacent frames. The dedicated gallery is
  `docs/recorder-deep-capture-2026-09-02.html`.
- **Gate:** `npm run check` and `npm run test:recorder` are the required gates.
  The latter is 33/33 in a real Chrome and covers idle/unarmed, Start, manual Stop,
  a saved packet with screencast frames, collision-free top notices, and the exact
  one-minute cancel-without-save boundary.
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
  Treat these as historical context from this code repository; do not edit the
  vault as part of recorder implementation work.

## What v1 is (steps 1–6 of the design review's §7)

| Piece | File | Notes |
|---|---|---|
| Ring buffer | `src/recorder/flightRecorder.ts`, `src/recorder/recorderEvents.ts` | Twelve compact lanes on one `performance.now()` clock: the original `input`, `dom`, `state`, `menu`, `store`, `console`, and `mark`, plus `network`, `workspace`, `action`, `perf`, and `ui`. The compact store row points by ID into a lossless before/after diff; detailed errors keep stacks, UI hits keep target rectangles and `elementsFromPoint`, fetch keeps timing/status but no body, and semantic modules publish through a dependency-free event seam. Window trim covers rows, details, and full diffs. |
| Store / policy | `src/recorder/recorderStore.ts` | One recorder per page, `useSyncExternalStore` for the UI. Install is idle and explicitly disarms the host. Start creates the in-page recorder, begins a take, arms Chrome, and captures the start snapshot. Manual Stop saves and copies. At exactly 60,000 ms the take is stopped, disarmed, and discarded with a visible notice—no folder and no clipboard claim. Every take prepares cheap start/end canvas frames; the writer uses them only when the screencast dump is empty, including the deceptive “debugging port exists, zero attached targets” case. The old preference/window functions and `saveLast()` stay as dormant retrospective code, with the old install calls commented beside the active policy. `installFlightRecorder(editor)` is called from both `onMount`s in `src/App.tsx`; never in the embedded IDE lane. |
| Host client | `src/recorder/recorderClient.ts` | `armRecorder`, `saveRecording`, `readLastRecording` (`GET /api/recordings/last` answers 200 with `{recording: null}` when empty — a 404 printed a console error into the very lane being recorded). |
| UI | `src/recorder/RecorderControls.tsx`, `recorder.css` | `RecorderControls` is a split capture between *Isolated presets* and *Version & updates*: one broad **Start recording** face at rest; its chevron contains only **Copy last recording** and the one-minute cancellation policy. During a take the broad face becomes **Stop and save**. The presets use the same interaction in `compact` form. `RecorderIndicator` is a compact red notice portaled to `.systemsketch-theme-root`, so it sits above the canvas without losing theme tokens. Preview is hidden while REC is active. There is deliberately no prefatory text input: add context in the chat before pasting. Test ids: `recorder-controls`, `recorder-status`, `recorder-split`, `recorder-menu`, `recorder-indicator`, `recorder-last-path`; actions `data-action="start-recording" | "stop-recording" | "more" | "copy-last"`. |
| Top-notice placement | `src/chrome/topNoticePlacement.ts`, `topNoticePlacement.test.ts`, `src/SystemSketchUtilities.tsx` | Preview and REC measure their painted width against the real top-left and top-right capsules with a 12 px safety gap. A notice uses the top gap when it fits and drops beneath the capsules when it does not. Active REC owns the slot, so passive Preview actions cannot overlap it. Popouts also move below whichever notice is in the second row. |
| Folder writer | `scripts/recording_store.py` | `write_recording()` keeps the original packet/timeline/snapshots/frames/viewer and adds `manifest.json`, `moments.json`, `store.full.jsonl`, `capture-health.json`, plus deep `network`, `workspace`, `actions`, `ui-hits`, `performance`, `browser-errors`, and `host` JSONL files. The packet shows at most twelve transitions and eight indexed moments; every deeper file is optional reading. The staged-then-rename write and last-20 retention remain unchanged. |
| Host routes | `scripts/server.py` | `POST /api/recordings` (body = the buffer payload + `channel/build/version` + optional `canvasFrames`), `POST /api/recordings/arm` `{enabled, url}`, `GET /api/recordings/last`, `GET /api/recordings/status`. New CLI flag `--cdp-port`. `health_payload` gained `recorderFrames`. |
| Sidecar | `scripts/recorder_frames.mjs` | The 60 s Chrome ring is unchanged, but dump selection now combines the 300 ms cadence with the first nearby compositor frame after state changes, clicks, keys, semantic/workspace events, and errors. Each kept frame names its reason; `capture-health.json` records raw/kept counts, gaps, CDP port, selected target ID/URL, target count, and keyframe matches. |
| Launcher | `scripts/launch_systemsketch.py` | `--remote-debugging-port=<4324 preview | 4325 stable>` on the desktop Chrome (env `SYSTEMSKETCH_PREVIEW_CDP_PORT` / `SYSTEMSKETCH_STABLE_CDP_PORT`), passed to the host as `--cdp-port` for both channels. |
| Release | `scripts/release_lib.py` | `recording_store.py` and `recorder_frames.mjs` are in `CONTROLLER_RUNTIME_FILES`, copied into a release's `runtime/`, and part of the controller fingerprint (so Preview's host restarts on next launch). |
| Harness | `tests/browser_harness.mjs` | `startApp({ cdpToApi: true })` starts Chrome first and passes its DevTools port to the host as `--cdp-port`. Chrome now always starts before the servers. |
| Proof | `tests/recorder_smoke.mjs`, `tests/test_recording_store.py`, `tests/test_release_system.py`, `src/recorder/flightRecorder.test.ts` | The 33-check journey writes accepted sample packet, manifest, moments, compact timeline, lossless store, and five captures only after real Chrome, folder, clipboard, standalone playback, and exact non-pointer store reconstruction all pass. Unit tests cover full-record linkage, semantic details, build fingerprints, host-log rebasing, manifest privacy, and packet order. |
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

## Original merge history and current follow-up

Zach asked for the merge. The branch absorbed that day's `main` cleanly (a new
theme-token gate arrived with it; `src/recorder/recorder.css` now names tokens only)
and every gate was re-run green. `git merge --ff-only` into his checkout was refused
because a peer had uncommitted work in six of the same files (README.md,
package.json, scripts/server.py, scripts/launch_systemsketch.py,
tests/browser_harness.mjs, tests/test_release_system.py). That work was left alone.
That original recorder branch later landed on `main`. The explicit Start/Stop
follow-up was then reconciled with the latest committed `main`, verified, and
fast-forwarded into `main` through `9147e6f`. A review board is committed at
`sketches/review/flight-recorder.systemsketch` (recipe and PNG beside it); note that
the fixture helper on `main` does not bind cue arrows at either end, in this board
or in the peers' boards, so a moved target leaves the orange arrow behind.

## What to do next

1. **Relaunch the desktop windows once after this follow-up lands:**
   `npm run desktop:stop && npm run desktop:preview && npm run desktop:start`, so the
   windows get the debugging port. Until then a save on the old windows says
   *frames: canvas only* and the packet says why.
2. **Prove the Stable channel end to end.** Not yet driven: stage a candidate with
   `npm run release:candidate`, promote, launch Stable from the release runtime, start
   a recording in Stable's Dev menu, stop it, and confirm frames arrive through the
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
   for *Start recording* was not added because tldraw owns most keys; the compact
   REC notice has automated computed-style coverage but still merits a manual dark-theme look.

## How to run it

```bash
cd ~/systemsketch && npm run check                 # tsc + vitest + python
cd ~/systemsketch && npm run test:recorder         # the real-browser journey
cd ~/systemsketch && node docs/recorder_screencast_cost.mjs   # ~2.5 min, rewrites screencast-cost.json
cd ~/systemsketch/docs && python3 build_recorder_implementation.py
```

The track tool assigns private ports and a scratch files root without touching the
real Stable/Preview (4321–4323). The completed Start/Stop track used Vite 4340 and
API 4341; create a fresh track for any new implementation unit and stop only the
PIDs owned by its `.track/` directory.
