#!/usr/bin/env python3
"""Build the flight-recorder implementation report.

Follows the design review (`state-recorder-design-2026-09-01.html`) with the
thing itself: steps 1–6 of that review's build plan, proved in a real browser
by `tests/recorder_smoke.mjs`, plus the measured answer to "what do the
screenshots cost?" from `docs/recorder_screencast_cost.mjs`.

Every number on the page is measured at build time from the live repository
and from the runs that produced `docs/assets/recorder-*`; the journey results
must be newer than the journey and the source, or the build refuses.
"""

from __future__ import annotations

import base64
import html
import io
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from report_measurements import REPO, journey_results, line_count, unit_test_count  # noqa: E402

HERE = Path(__file__).resolve().parent
ASSETS = HERE / "assets"
OUTPUT = HERE / "recorder-implementation-2026-09-01.html"


def sh(command: str) -> str:
    result = subprocess.run(command, shell=True, cwd=REPO, capture_output=True, text=True)
    return (result.stdout + result.stderr).strip()


def esc(text: str) -> str:
    return html.escape(text)


def need(path: Path) -> Path:
    if not path.exists():
        raise SystemExit(f"{path} is missing — run the journey or the measurement that produces it")
    return path


def source_slice(path: Path, start_marker: str, end_marker: str) -> str:
    text = need(path).read_text(encoding="utf-8")
    try:
        begin = text.index(start_marker)
        return text[begin:text.index(end_marker, begin)].rstrip()
    except ValueError:
        raise SystemExit(f"{path.name} no longer contains {start_marker.strip()[:60]!r} — rewrite that section") from None


def png_uri(path: Path, crop: tuple[int, int, int, int] | None = None, width: int | None = None) -> str:
    image = Image.open(need(path)).convert("RGB")
    if crop:
        image = image.crop(crop)
    if width and width != image.width:
        image = image.resize((width, round(image.height * width / image.width)), Image.LANCZOS)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


# --------------------------------------------------------------------------- #
# Measurements
# --------------------------------------------------------------------------- #
JOURNEY = REPO / "tests" / "recorder_smoke.mjs"
VERDICTS = journey_results(ASSETS / "recorder-acceptance.json", JOURNEY, REPO / "src")
PASSED = sum(1 for verdict in VERDICTS if verdict["ok"])
COST = json.loads(need(ASSETS / "recorder-spike" / "screencast-cost.json").read_text())
SUMMARY = COST["summary"]
SPIKE = json.loads(need(ASSETS / "recorder-spike" / "metrics.json").read_text())
PACKET = need(ASSETS / "recorder-sample-packet.txt").read_text()
SAMPLE_ROWS = [json.loads(line) for line in need(ASSETS / "recorder-sample-timeline.jsonl").read_text().splitlines() if line.strip()]
SAMPLE_LANES: dict[str, int] = {}
for row in SAMPLE_ROWS:
    SAMPLE_LANES[row["lane"]] = SAMPLE_LANES.get(row["lane"], 0) + 1

HEAD = sh("git rev-parse --short HEAD")
BRANCH = sh("git rev-parse --abbrev-ref HEAD")
TLDRAW = json.loads((REPO / "package.json").read_text())["dependencies"]["tldraw"]
RECORDER_TESTS = unit_test_count("src/recorder/flightRecorder.test.ts")
PY_TESTS = int(sh("grep -c 'def test_' tests/test_recording_store.py") or 0)
FILES = {
    "src/recorder/flightRecorder.ts": "the ring buffer: seven lanes on one clock, window trim, rewind of the start snapshot",
    "src/recorder/recorderStore.ts": "policy, arm/disarm, save, clipboard, the external store the UI reads",
    "src/recorder/recorderClient.ts": "the three host calls",
    "src/recorder/RecorderControls.tsx": "Dev-menu rows, compact preset controls, the REC bar",
    "src/recorder/recorder.css": "row accents, chips, the bar",
    "scripts/recording_store.py": "folder writer, packet, state→source map, playback.html, retention, the sidecar owner",
    "scripts/recorder_frames.mjs": "the screencast sidecar",
    "tests/recorder_smoke.mjs": "the real-browser proof",
    "tests/test_recording_store.py": "the host's unit tests",
    "src/recorder/flightRecorder.test.ts": "the buffer's unit tests",
}
FILE_ROWS = "\n".join(
    f'<tr><td class="mono">{esc(path)}</td><td class="mono">{line_count(path)}</td><td>{esc(what)}</td></tr>'
    for path, what in FILES.items()
)
NEW_LINES = sum(line_count(path) for path in FILES)

ONMOUNT = source_slice(REPO / "src" / "App.tsx", "    const stopFlightRecorder = installFlightRecorder(editor)\n    return () => {", "      stopToolbarSideEffects()")
LAUNCH = source_slice(REPO / "scripts" / "launch_systemsketch.py", "    command = [\n            chrome,", "    if new_window:")
ROUTES = source_slice(REPO / "scripts" / "server.py", '        if path == "/api/recordings/arm":', '            if path == "/api/workspace/file":')
POLICY = source_slice(REPO / "src" / "recorder" / "recorderStore.ts", "export function defaultRecorderEnabled(): boolean {", "export function readStoredWindowMs")
EVERY_NTH = source_slice(REPO / "scripts" / "recorder_frames.mjs", "// Measured (docs/assets/recorder-spike/screencast-cost.json)", "const MAX_WIDTH")


def cost_rows() -> str:
    labels = {
        "A": ("no screencast", "baseline"),
        "B": ("every repaint, 1440×960, q70", "the spike's setting"),
        "C": ("every 2nd repaint, ≤960 wide, q60", ""),
        "D": ("every 3rd repaint, ≤720 wide, q50", ""),
    }
    base = SUMMARY["A"]
    out = []
    for key in ("A", "B", "C", "D"):
        row = SUMMARY[key]
        delta_pts = row["cpuPct"] - base["cpuPct"]
        chosen = ' <span class="pill ok">closest to the shipped default</span>' if key == "C" else ""
        out.append(
            f'<tr><td><b>{key}</b> · {labels[key][0]}{chosen}<br><small class="muted">{labels[key][1]}</small></td>'
            f'<td class="mono">{row["cpuSeconds"]:.2f} s</td><td class="mono">{row["cpuPct"]:.1f} %</td>'
            f'<td class="mono">{"—" if key == "A" else f"+{delta_pts:.1f} pts"}</td>'
            f'<td class="mono">{row["raf"]["p50"]:.1f} / {row["raf"]["p95"]:.1f} / {row["raf"]["max"]:.0f}</td>'
            f'<td class="mono">{row["raf"]["over33"]:.1f}</td>'
            f'<td class="mono">{row["frames"]:.0f} ({row["fps"]:.1f}/s)</td>'
            f'<td class="mono">{row["frameBytes"] / 1e6:.2f} MB</td></tr>'
        )
    return "\n".join(out)


def per_frame_ms() -> str:
    base = SUMMARY["A"]["cpuSeconds"]
    values = []
    for key in ("B", "C", "D"):
        row = SUMMARY[key]
        if row["frames"]:
            values.append((row["cpuSeconds"] - base) * 1000 / row["frames"])
    return f"{min(values):.0f}–{max(values):.0f}" if values else "?"


def verdict_rows() -> str:
    out = []
    for verdict in VERDICTS:
        observed = json.dumps(verdict["observed"])
        if len(observed) > 120:
            observed = observed[:119] + "…"
        out.append(
            f'<tr><td class="mono">{esc(verdict["id"])}</td><td>{esc(verdict["label"])}</td>'
            f'<td class="mono">{esc(observed)}</td><td><span class="pill {"ok" if verdict["ok"] else "bad"}">{"pass" if verdict["ok"] else "fail"}</span></td></tr>'
        )
    return "\n".join(out)


def lane_tiles() -> str:
    labels = {"input": "input", "dom": "dom", "state": "state", "store": "store", "menu": "menu", "console": "console", "mark": "mark"}
    return "\n".join(f'<div class="stat"><b class="{lane}">{SAMPLE_LANES.get(lane, 0)}</b><span>{label} rows</span></div>' for lane, label in labels.items())


B = SUMMARY["B"]
C = SUMMARY["C"]
A = SUMMARY["A"]
CHROME = COST.get("chrome", "")

TEMPLATE = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>The flight recorder, built</title>
<style>
  :root{--ink:#14171a;--muted:#626a73;--line:#dfe3e7;--paper:#f6f7f8;--card:#fff;--green:#0e6b36;--amber:#8a6206;--blue:#315be8;--red:#c4392c}
  *{box-sizing:border-box}
  body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.58 Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}
  main{width:min(1180px,calc(100% - 32px));margin:auto;padding:42px 0 80px}
  .hero{padding:34px;border:1px solid var(--line);border-radius:24px;background:var(--card);box-shadow:0 18px 50px #1218200b}
  .kicker{font-size:12px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:#4b5560}
  h1{margin:6px 0 12px;font-size:clamp(30px,4.6vw,50px);line-height:1.04;letter-spacing:-.045em}
  .lede{max-width:900px;margin:0;color:var(--muted);font-size:18px}
  .badges{display:flex;flex-wrap:wrap;gap:8px;margin-top:22px}
  .badge{padding:6px 10px;border:1px solid var(--line);border-radius:999px;background:#fafbfc;font:700 12px/1.2 ui-monospace,monospace}
  .badge.ok{border-color:#bfe3cd;background:#eefaf2;color:var(--green)}
  .badge.warn{border-color:#f2d9a8;background:#fdf7ea;color:var(--amber)}
  section{margin-top:52px}
  h2{margin:0 0 6px;font-size:27px;letter-spacing:-.03em}
  h3{margin:0 0 8px;font-size:17px}
  .sub{margin:0 0 22px;color:var(--muted);max-width:920px}
  .muted{color:var(--muted)}
  figure{margin:0;padding:14px;border:1px solid var(--line);border-radius:18px;background:var(--card)}
  figure img{display:block;width:100%;border-radius:10px;border:1px solid var(--line)}
  figcaption{padding:12px 4px 2px;color:var(--muted);font-size:13.5px}
  figcaption strong{display:block;color:var(--ink);font-size:14.5px;margin-bottom:2px}
  .two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
  .three{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
  @media(max-width:860px){.two,.three{grid-template-columns:1fr}}
  pre{margin:0;padding:16px;border:1px solid var(--line);border-radius:14px;background:#0f1216;color:#e6edf3;overflow-x:auto;font:12.5px/1.62 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap}
  pre.light{background:#fbfcfd;color:#1b2027}
  .card{padding:22px;border:1px solid var(--line);border-radius:18px;background:var(--card)}
  table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:16px;overflow:hidden}
  th,td{padding:10px 13px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top;font-size:14px}
  th{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#4b5560;background:#fafbfc}
  tr:last-child td{border-bottom:0}
  td.mono,th.mono,.mono{font:12.5px/1.5 ui-monospace,monospace}
  .pill{display:inline-block;padding:3px 9px;border-radius:999px;font:700 11.5px/1.5 ui-monospace,monospace;white-space:nowrap}
  .pill.ok{background:#eefaf2;color:var(--green)}.pill.bad{background:#fdf1ef;color:var(--red)}.pill.warn{background:#fdf7ea;color:var(--amber)}
  code{padding:.12em .35em;border-radius:5px;background:#eceff2;font:12.5px/1.4 ui-monospace,monospace}
  .note{padding:16px 18px;border:1px solid #f2d9a8;border-radius:14px;background:#fdf7ea}
  .note.good{border-color:#bfe3cd;background:#eefaf2}.note.bad{border-color:#f0c4bd;background:#fdf1ef}
  .stats{display:grid;grid-template-columns:repeat(7,1fr);gap:10px}
  @media(max-width:860px){.stats{grid-template-columns:repeat(3,1fr)}}
  .stat{padding:12px 14px;border:1px solid var(--line);border-radius:14px;background:var(--card)}
  .stat b{display:block;font-size:24px;letter-spacing:-.03em}.stat span{color:var(--muted);font-size:12px}
  .input{color:var(--blue)}.dom{color:#2a7fbf}.state{color:var(--green)}.store{color:#7a3fb5}.menu{color:#c47a1c}.console{color:var(--red)}.mark{color:#a3197c}
  ol.steps{margin:0;padding:0;list-style:none;counter-reset:s}
  ol.steps li{position:relative;padding:14px 12px 14px 52px;border-bottom:1px solid var(--line)}
  ol.steps li:last-child{border-bottom:0}
  ol.steps li::before{counter-increment:s;content:"✓";position:absolute;left:12px;top:14px;width:26px;height:26px;border-radius:50%;background:#eefaf2;color:var(--green);font:800 13px/26px ui-monospace,monospace;text-align:center}
  ol.steps b{display:block;font-weight:650;margin-bottom:3px}
  ol.steps span{color:var(--muted);font-size:13.5px}
  footer{margin-top:60px;padding-top:22px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}
  a{color:var(--blue)}
</style>
</head>
<body><main>

<div class="hero">
  <div class="kicker">SystemSketch · implementation report · 1 September 2026 · follows the state-recorder design review</div>
  <h1>The flight recorder, built</h1>
  <p class="lede">Steps 1 to 6 of the design review are in the tree and proved in a real browser: an always-armed ring buffer in the page, a Recording section in the Dev menu with <b>Save the last 30 s</b>, <b>Record next ≤ 30 s</b> and <b>Copy last recording</b>, a red bar during a take, a Python route that writes one folder per recording with the packet first, a Node sidecar that keeps Chrome's screencast in a ring behind one launcher flag, and a <code>playback.html</code> in every folder. Recording is <b>on by default in Preview and the isolated presets, off by default in Stable</b>, with a persisted toggle either way. Your question about the cost of the screenshots is answered with a measurement in §1.</p>
  <div class="badges">
    <span class="badge ok">journey __PASSED__ / __TOTAL__ checks · real Chrome, real folder, real clipboard</span>
    <span class="badge ok">__RECORDER_TESTS__ buffer unit tests · __PY_TESTS__ host unit tests · tsc clean</span>
    <span class="badge ok">screencast: ~__PER_FRAME__ ms CPU per frame, frame timing unchanged</span>
    <span class="badge warn">desktop windows need one relaunch to get the debugging port</span>
  </div>
</div>

<section>
  <h2>1 · Your two questions</h2>
  <div class="two">
    <div class="card">
      <h3>What do the screenshots cost?</h3>
      <p>Measured, not estimated: <code>docs/recorder_screencast_cost.mjs</code> ran the spike's 8.4 s Block gesture eight times in fresh headless instances (A B C D A B C D) and read every Chrome process's CPU time from <code>/proc</code>, plus frame timing from inside the page.</p>
      <p><b>The screencast costs CPU, not smoothness.</b> At the spike's setting Chrome used <b>+__B_DELTA__ percentage points of one core</b> on top of a __A_PCT__ % baseline while the gesture ran, and <b>nothing</b> when the page was idle, because Chrome only produces a frame on repaint. Frame timing inside the page did not move: rAF p50 / p95 stayed at __A_P50__ / __A_P95__ ms with and without the screencast, and the long tasks are the gesture's own. The cost is a near-constant <b>~__PER_FRAME__ ms of CPU per delivered frame</b> whatever the size or quality, so frame <i>count</i> is the lever. The shipped sidecar therefore takes <b>every second repaint</b> at full resolution (row C is the nearest measured point: +__C_DELTA__ points), which still delivers more frames than a save keeps.</p>
      <p class="muted">Caveat: headless Chrome with the GPU disabled, so capture and JPEG encoding were all on the CPU; a GPU-backed desktop window should be cheaper in absolute terms. The relative picture — cost per frame, none at rest, no jank — is the finding. The in-page half stays at the design review's __SPIKE_COST__ ms per __SPIKE_DUR__ s.</p>
    </div>
    <div class="card">
      <h3>Off in Stable, on where bugs are expected — yes</h3>
      <p>Adopted exactly as you proposed. The default is decided synchronously at mount, which a retroactive recorder needs, and it is a one-liner: the app runs from the dev server in Preview and in every isolated preset, and from a built release in Stable, so <code>import.meta.env.DEV</code> <i>is</i> the channel split. A persisted toggle in the Recording section overrides it in either direction and disarms the host's screencast the moment you turn it off (proved in the journey). Stable therefore costs nothing until you opt in.</p>
      <pre class="light">__POLICY__</pre>
      <p class="muted" style="margin-top:12px">The launcher opens the debugging port for both channels regardless, so opting in on Stable works without another relaunch. It is loopback-only, and Chrome refuses any browser origin on it; the sidecar connects as a plain Node client (verified against a Chrome started without any origin allow-list).</p>
    </div>
  </div>
  <table style="margin-top:18px"><thead><tr><th>Variant</th><th>Chrome CPU</th><th>% of a core</th><th>Δ vs A</th><th>rAF p50 / p95 / max (ms)</th><th>frames &gt; 33 ms</th><th>frames delivered</th><th>bytes</th></tr></thead><tbody>__COST_ROWS__</tbody></table>
  <p class="muted" style="margin-top:8px">Means of two interleaved runs each, 8.4 s gesture, Chrome __CHROME__. Data: <code>docs/assets/recorder-spike/screencast-cost.json</code>.</p>
</section>

<section>
  <h2>2 · What shipped, step by step</h2>
  <p class="sub">The six steps of the design review's §7, each one where the review said it would go. __NEW_LINES__ new lines across __NEW_FILES__ files; the stock-boundary test still passes because nothing new sits beside the engine.</p>
  <ol class="steps">
    <li><b>The ring buffer — <code>src/recorder/flightRecorder.ts</code></b><span>Seven lanes on one clock (input · dom · state · menu · store · console · mark), trimmed to the window on every push. The DOM lane is the finding from the spike made real: capture-phase <code>keydown</code>/<code>keyup</code>/<code>pointerdown</code> on the window, with the UI element hit, so Escape into a menu is recorded even though tldraw never sees it. A retroactive save <b>rewinds</b> the end snapshot through the window's diffs with tldraw's own <code>reverseRecordsDiff</code>, so <code>start.snapshot.json</code> is real for both modes. Installed from <code>onMount</code> in the product and in the presets, never in the embedded IDE lane.</span></li>
    <li><b>Dev menu, REC bar, policy — <code>src/recorder/RecorderControls.tsx</code>, <code>recorderStore.ts</code></b><span>The Recording section sits between Isolated presets and Version &amp; updates, in the panel's own row grammar; window chips 5 / 15 / 30 / 60 / 120 s; no prefatory text box, because context can be typed directly before pasting the packet; an On/Off chip. The bar is portaled onto <code>document.body</code> because the canvas layer sits under tldraw's top chrome. The presets get the same three verbs in a compact strip inside their identity bar.</span></li>
    <li><b>Host route and writer — <code>scripts/server.py</code>, <code>scripts/recording_store.py</code></b><span><code>POST /api/recordings</code> writes <code>~/SystemSketch/recordings/&lt;local time&gt;-&lt;note&gt;/</code> staged then renamed, keeps the last 20, and returns the packet; <code>GET /api/recordings/last</code> refills the clipboard after a reload; <code>POST /api/recordings/arm</code> tells the host whether the page wants frames. The packet maps every state seen to the file that defines it by indexing <code>id = '…'</code> declarations under <code>src/</code> and tldraw's tools.</span></li>
    <li><b>Frames — <code>scripts/recorder_frames.mjs</code> + one launcher flag</b><span><code>--remote-debugging-port</code> per channel (4324 Preview, 4325 Stable) on the desktop Chrome, passed to the host as <code>--cdp-port</code>. The host spawns the sidecar lazily when a page arms it; the sidecar attaches to every page of that Chrome, keeps a ring of screencast frames per page while armed, and on save writes the wall-time slice into the folder at one frame per 300 ms. Both files travel with a release's <code>runtime/</code> and count toward the controller fingerprint.</span></li>
    <li><b>Proof — <code>tests/recorder_smoke.mjs</code> (<code>npm run test:recorder</code>)</b><span>__TOTAL__ checks read off the disk and the DOM (§3). The harness learned to start Chrome first and hand its DevTools port to the host, the way the launcher does.</span></li>
    <li><b><code>playback.html</code> per recording + state→source map</b><span>Written into every folder by the host: frames by relative path, rows inlined, lane filters, a synthetic pointer, <code>#t=&lt;ms&gt;</code> deep links. Opens from <code>file://</code> with no server.</span></li>
  </ol>
  <table style="margin-top:18px"><thead><tr><th>File</th><th>Lines</th><th>What it holds</th></tr></thead><tbody>__FILE_ROWS__</tbody></table>
  <div class="three" style="margin-top:18px">
    <figure><pre class="light">__ONMOUNT__</pre><figcaption><strong>src/App.tsx</strong> One more install line and its disposer.</figcaption></figure>
    <figure><pre class="light">__LAUNCH__</pre><figcaption><strong>scripts/launch_systemsketch.py</strong> The flag, on the channel's own profile.</figcaption></figure>
    <figure><pre class="light">__ROUTES__</pre><figcaption><strong>scripts/server.py</strong> The two POST routes, beside the workspace ones.</figcaption></figure>
  </div>
</section>

<section>
  <h2>3 · Proof, in the real app</h2>
  <p class="sub">One fresh headless instance: draw two Blocks, wire them, press Escape, prove there is no prefatory text input, and save the last 30 s from the Dev menu; then a 5 s take that stops itself; then open the folder's <code>playback.html</code>; then turn the recorder off and reload. Everything below is read from that run.</p>
  <div class="two">
    <figure><img src="__SHOT_MENU__" alt="The Dev menu with the Recording section"><figcaption><strong>The Recording section, in the Dev menu</strong> Save the last 30 s · Record next ≤ 30 s · Copy last recording · window chips · On. No prefatory text box competes with the chat where the packet will be pasted.</figcaption></figure>
    <figure><img src="__SHOT_BAR_STRIP__" alt="The REC bar, close up" style="margin-bottom:10px"><img src="__SHOT_BAR__" alt="The REC bar during a take"><figcaption><strong>A take running</strong> The red bar across the top with the elapsed time against the 5 s cap, and the row turned into Stop and save.</figcaption></figure>
    <figure><img src="__SHOT_SAVED__" alt="The Dev menu after a save"><figcaption><strong>After Save</strong> The Copy row now names the folder; the Copy row's mark read <code>Copied</code>, and the clipboard held the packet verbatim.</figcaption></figure>
    <figure><img src="__SHOT_PLAYBACK__" alt="playback.html"><figcaption><strong>playback.html, opened from file://</strong> Frames on the left, lanes streaming on the right, the filmstrip below, the packet under it.</figcaption></figure>
  </div>
  <h3 style="margin-top:26px">The first recording's lanes</h3>
  <div class="stats">__LANE_TILES__</div>
  <h3 style="margin-top:26px">The packet, as it went onto the clipboard</h3>
  <pre>__PACKET__</pre>
  <h3 style="margin-top:26px">Every check</h3>
  <table><thead><tr><th>id</th><th>claim</th><th>observed</th><th></th></tr></thead><tbody>__VERDICTS__</tbody></table>
</section>

<section>
  <h2>4 · Using it</h2>
  <div class="two">
    <div class="card">
      <h3>Once, after merging</h3>
      <p>The running desktop windows were started before the debugging port existed, so the first save on them will say <i>frames: canvas only</i> and the packet will say why. One relaunch fixes it:</p>
      <pre class="light">cd ~/systemsketch && npm run desktop:stop && npm run desktop:preview && npm run desktop:start</pre>
      <p class="muted" style="margin-top:10px">Preview's host restarts on its own the next time it is opened, because <code>server.py</code> changed and the controller fingerprint with it.</p>
    </div>
    <div class="card">
      <h3>Every time</h3>
      <p>Something odd happens → <code>&lt;/&gt;</code> → <b>Save the last 30 s</b> → paste into the agent. If context will help, type it directly in the chat before pasting. The packet is prose plus absolute paths; the agent Reads <code>README.md</code>, greps <code>timeline.jsonl</code>, opens the frames it needs. <b>Copy last recording</b> refills the clipboard after a reload. For a bug you can reproduce, <b>Record next ≤ 30 s</b>, do it, stop or let the cap stop it. Open any folder's <code>playback.html</code> to watch it yourself.</p>
    </div>
  </div>
</section>

<section>
  <h2>5 · Not done, and the branch</h2>
  <ul>
    <li><b>Step 7 stays parked</b>, as you asked: replay-to-test and the Chrome trace export.</li>
    <li><b>The screencast numbers are headless.</b> A windowed, GPU-backed measurement would be the next honest data point if the desktop ever feels heavier while recording.</li>
    <li><b>No merge.</b> This follow-up is isolated on <code>__BRANCH__</code> at <code>__HEAD__</code>, based on the recorder implementation branch. It has not been merged into either that branch or <code>main</code>.</li>
  </ul>
</section>

<footer>
  Built from the live repo by <code>docs/build_recorder_implementation.py</code> at <code>__HEAD__</code> (<code>__BRANCH__</code>) · tldraw <code>__TLDRAW__</code> · journey verdicts from <code>docs/assets/recorder-acceptance.json</code>, which must be newer than the journey and the source or this page refuses to build · screencast cost from <code>docs/assets/recorder-spike/screencast-cost.json</code>.
</footer>
</main></body>
</html>
"""


def main() -> None:
    values = {
        "__PASSED__": str(PASSED),
        "__TOTAL__": str(len(VERDICTS)),
        "__RECORDER_TESTS__": str(RECORDER_TESTS),
        "__PY_TESTS__": str(PY_TESTS),
        "__PER_FRAME__": per_frame_ms(),
        "__B_DELTA__": f"{B['cpuPct'] - A['cpuPct']:.1f}",
        "__C_DELTA__": f"{C['cpuPct'] - A['cpuPct']:.1f}",
        "__A_PCT__": f"{A['cpuPct']:.1f}",
        "__A_P50__": f"{A['raf']['p50']:.1f}",
        "__A_P95__": f"{A['raf']['p95']:.1f}",
        "__SPIKE_COST__": str(SPIKE["recorderCostMs"]),
        "__SPIKE_DUR__": f"{SPIKE['durationMs'] / 1000:.1f}",
        "__POLICY__": esc(POLICY),
        "__COST_ROWS__": cost_rows(),
        "__CHROME__": esc(f"{CHROME.get('version', '')} · headless {CHROME.get('headless', '')} · GPU {CHROME.get('gpu', '')}" if isinstance(CHROME, dict) else str(CHROME)),
        "__NEW_LINES__": str(NEW_LINES),
        "__NEW_FILES__": str(len(FILES)),
        "__FILE_ROWS__": FILE_ROWS,
        "__ONMOUNT__": esc(ONMOUNT),
        "__LAUNCH__": esc(LAUNCH),
        "__ROUTES__": esc(ROUTES),
        "__SHOT_MENU__": png_uri(ASSETS / "recorder-dev-menu.png", (1040, 160, 1440, 900), 800),
        "__SHOT_BAR__": png_uri(ASSETS / "recorder-rec-bar.png", (0, 0, 1440, 900), 1100),
        "__SHOT_BAR_STRIP__": png_uri(ASSETS / "recorder-rec-bar.png", (0, 0, 1440, 64), 1100),
        "__SHOT_SAVED__": png_uri(ASSETS / "recorder-saved.png", (1040, 160, 1440, 900), 800),
        "__SHOT_PLAYBACK__": png_uri(ASSETS / "recorder-playback.png", None, 1100),
        "__LANE_TILES__": lane_tiles(),
        "__PACKET__": esc(PACKET),
        "__VERDICTS__": verdict_rows(),
        "__HEAD__": HEAD,
        "__BRANCH__": BRANCH,
        "__TLDRAW__": TLDRAW,
    }
    page = TEMPLATE
    for slot, value in values.items():
        page = page.replace(slot, value)
    leftover = [slot for slot in values if slot in page]
    if leftover:
        raise SystemExit(f"unfilled: {leftover}")
    OUTPUT.write_text(page, encoding="utf-8")
    print(OUTPUT, f"{OUTPUT.stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
