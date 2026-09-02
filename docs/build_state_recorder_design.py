#!/usr/bin/env python3
"""Build the state-recorder design review.

Answers the Sep 1 2026 prompt in `PROJECT - System Sketch` § Recording program
state: "Help me improve my thinking here. What prior art out there exists that
could help me do this well? How do you recommend that this be implemented?"

Every number on the page is measured at build time — from the live repository
and from `docs/recorder_spike.mjs`, the real-browser spike that produced
`docs/assets/recorder-spike/` — so the report cannot drift from the tree or the
run it describes. Re-run the spike, then this, to refresh it.
"""

from __future__ import annotations

import base64
import html
import io
import json
import subprocess
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
REPO = HERE.parent


def line_count(relative_path: str) -> int:
    return sum(1 for _ in (REPO / relative_path).open(encoding="utf-8"))


def source_slice(path: Path, start_marker: str, end_marker: str) -> str:
    """Quote real source so a snippet cannot outlive the code it describes.

    Same contract as `report_measurements.source_slice` on main, which had not
    landed on this branch's base commit when the report was built. Delete the
    function this quotes and the build fails instead of publishing fiction.
    """
    if not path.exists():
        raise SystemExit(f"{path.name} is gone — the section quoting it describes a mechanism that no longer exists")
    text = path.read_text(encoding="utf-8")
    try:
        begin = text.index(start_marker)
        return text[begin:text.index(end_marker, begin)].rstrip()
    except ValueError:
        raise SystemExit(f"{path.name} no longer contains {start_marker.strip()[:60]!r} — rewrite that section") from None


ASSETS = HERE / "assets" / "recorder-spike"
OUTPUT = HERE / "state-recorder-design-2026-09-01.html"
FRAME_W, FRAME_H = 1440, 960  # the spike's viewport; frames are captured at this size


def sh(command: str) -> str:
    result = subprocess.run(command, shell=True, cwd=REPO, capture_output=True, text=True)
    return (result.stdout + result.stderr).strip()


def esc(text: str) -> str:
    return html.escape(text)


def need(path: Path) -> Path:
    if not path.exists():
        raise SystemExit(f"{path} is missing — run `node docs/recorder_spike.mjs` first")
    return path


def jpeg_uri(path: Path, width: int, quality: int = 72) -> str:
    image = Image.open(need(path)).convert("RGB")
    if width != image.width:
        image = image.resize((width, round(image.height * width / image.width)), Image.LANCZOS)
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=quality, optimize=True)
    return "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def png_uri(path: Path, width: int | None = None) -> str:
    image = Image.open(need(path)).convert("RGB")
    if width and width != image.width:
        image = image.resize((width, round(image.height * width / image.width)), Image.LANCZOS)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


# --------------------------------------------------------------------------- #
# Measurements — the spike run
# --------------------------------------------------------------------------- #
METRICS = json.loads(need(ASSETS / "metrics.json").read_text())
HEADER = json.loads(need(ASSETS / "header.json").read_text())
ROWS = [json.loads(line) for line in need(ASSETS / "timeline.jsonl").read_text().splitlines() if line.strip()]
FRAMES = [json.loads(line) for line in need(ASSETS / "frames.jsonl").read_text().splitlines() if line.strip()]
PACKET = need(ASSETS / "README.md").read_text()
KEPT = [frame for frame in FRAMES if frame["kept"]]

DURATION_S = METRICS["durationMs"] / 1000
LANES = METRICS["rowsPerLane"]
INPUTS = METRICS["inputByName"]
TRANSITIONS = [row for row in ROWS if row["lane"] == "state"]
MARKS = [row for row in ROWS if row["lane"] == "mark"]
KEY_DOWNS = sum(1 for row in ROWS if row["lane"] == "input" and row.get("name") == "key_down")
KEY_UPS = sum(1 for row in ROWS if row["lane"] == "input" and row.get("name") == "key_up")
TRANSLATING = sum(1 for row in TRANSITIONS if "translating" in row["to"])
DOUBLE_CLICK_EDIT = next((row for row in TRANSITIONS if row.get("trigger") == "double_click"), None)

# Projections to the 30 s window, from the measured rates. Stated as projections.
WINDOW_S = 30
HUMAN_MOVE_HZ = 60  # a real mouse reports ~60 moves/s; the harness dispatched far fewer
INPUT_ROW_BYTES = 110
PROJ_TEXT_KB = round((WINDOW_S * HUMAN_MOVE_HZ * INPUT_ROW_BYTES + METRICS["timelineBytes"] * WINDOW_S / DURATION_S) / 1024)
PROJ_FRAMES_MEASURED = round(METRICS["framesPerSecond"] * WINDOW_S)
PROJ_FRAMES_MEASURED_MB = round(PROJ_FRAMES_MEASURED * METRICS["frameBytesMedian"] / 1e6, 1)
PROJ_FRAMES_60_MB = round(60 * WINDOW_S * METRICS["frameBytesMedian"] / 1e6)
KEEP_GAP = METRICS["keepGapMs"]
PROJ_KEPT = round(WINDOW_S * 1000 / KEEP_GAP)
PROJ_KEPT_MB = round(PROJ_KEPT * METRICS["frameBytesMedian"] / 1e6, 1)

# --------------------------------------------------------------------------- #
# Measurements — the live repository
# --------------------------------------------------------------------------- #
PACKAGE = json.loads((REPO / "package.json").read_text())
TLDRAW_VERSION = PACKAGE["dependencies"]["tldraw"]
APP_VERSION = PACKAGE["version"]
NODE_VERSION = sh("node --version")
HEAD = sh("git rev-parse --short HEAD")
BRANCH = sh("git rev-parse --abbrev-ref HEAD")
PORTS = sh("ss -ltnp 2>/dev/null | grep -E ':(4321|4322|4323) ' | awk '{print $4, $6}'") or "(none bound)"
SPIKE_LINES = line_count("docs/recorder_spike.mjs")
INPAGE_LINES = line_count("docs/recorder_spike_inpage.js")
SRC_CLIPBOARD_USES = sh("grep -rl 'navigator.clipboard' src | wc -l")
SRC_CONSOLE_PATCHES = sh("grep -rlE \"addEventListener\\('error'|window.onerror|unhandledrejection\" src | wc -l")

LAUNCH_SLICE = source_slice(REPO / "scripts" / "launch_systemsketch.py", "    command = [\n            chrome,", "    if new_window:")
POST_SLICE = source_slice(REPO / "scripts" / "server.py", "    def do_POST(self) -> None:", '            self._json({"error": "not found"}')
ONMOUNT_SLICE = source_slice(REPO / "src" / "App.tsx", "  const onMount = useCallback((editor: Editor) => {", "    return () => {")
VERSION_ROW_SLICE = source_slice(REPO / "src" / "SystemSketchUtilities.tsx", 'className="systemsketch-help-row systemsketch-version-row"', "</button>")
SEAM_DOC_SLICE = source_slice(REPO / "src" / "developmentSeam.ts", " * Every UI claim in this repo", " * So this exposes")

# --------------------------------------------------------------------------- #
# Criteria and options — scored here so the arithmetic is auditable
# --------------------------------------------------------------------------- #
CRITERIA = [
    ("C1", "Shows what Zach saw — tldraw UI chrome, menus, inspector, handles included", 5),
    ("C2", "One click, no dialog, in the Desktop window and in a plain browser tab", 4),
    ("C3", "Agent-readable output: image files + text an agent can Read", 5),
    ("C4", "Off-the-shelf; tldraw stays stock; the missing piece is small", 4),
    ("C5", "Retroactive: can hand over the last 30 s, not the next", 3),
    ("C6", "Does not perturb the interaction being recorded (no jank)", 4),
    ("C7", "Playback for a human (scrub, watch)", 2),
]
OPTIONS = [
    ("A", "CDP screencast sidecar", "Chrome's own <code>Page.startScreencast</code> over the debugging port; a Node sidecar keeps a ring buffer of frames. Needs one launcher flag.",
     [5, 4, 5, 4, 5, 5, 4]),
    ("B", "In-page tab capture", "<code>getDisplayMedia({preferCurrentTab})</code> + <code>MediaRecorder</code>, frames sampled to canvas in-page.",
     [5, 2, 4, 3, 3, 3, 4]),
    ("C", "rrweb DOM recording", "Record DOM mutations, replay pixel-faithfully in <code>rrweb-player</code>; frames only via <code>rrvideo</code> + ffmpeg.",
     [4, 5, 2, 3, 5, 4, 5]),
    ("D", "editor.toImage() sampling", "tldraw's SVG export of the shapes, rasterised in-page on each state change.",
     [1, 5, 4, 5, 2, 2, 2]),
    ("E", "No pixels — replay diffs later", "Store <code>start.snapshot</code> + diffs only; render frames afterwards by replaying in the CDP harness.",
     [2, 5, 4, 4, 5, 5, 3]),
]
MAX_SCORE = sum(weight * 5 for _, _, weight in CRITERIA)


def score(marks: list[int]) -> float:
    return round(100 * sum(w * m for (_, _, w), m in zip(CRITERIA, marks)) / MAX_SCORE, 1)


# --------------------------------------------------------------------------- #
# Fragments
# --------------------------------------------------------------------------- #
def lane_class(lane: str) -> str:
    return {"input": "in", "state": "st", "store": "sto", "menu": "mn", "console": "co", "mark": "mk"}.get(lane, "")


def transition_rows() -> str:
    out = []
    for row in TRANSITIONS:
        flag = ""
        if row is DOUBLE_CLICK_EDIT:
            flag = ' <span class="pill bad">the spike\'s own bug</span>'
        out.append(
            f'<tr><td class="mono t">+{row["t"] / 1000:6.2f}s</td><td class="mono">{esc(row["from"])}</td>'
            f'<td class="mono">→ {esc(row["to"])}</td><td class="mono muted">{esc(row.get("trigger", ""))}{flag}</td></tr>'
        )
    return "\n".join(out)


def filmstrip() -> str:
    cells = []
    for frame in KEPT:
        path = ASSETS / frame["file"]
        cells.append(
            f'<figure class="film"><img src="{jpeg_uri(path, 320, 68)}" alt="frame at {frame["t"]:.0f} ms">'
            f'<figcaption>+{frame["t"] / 1000:.2f}s · {frame["bytes"] // 1024} KB</figcaption></figure>'
        )
    return "\n".join(cells)


def viewer_frames_json() -> str:
    return json.dumps([{"t": round(frame["t"]), "src": jpeg_uri(ASSETS / frame["file"], 900, 70)} for frame in KEPT])


def viewer_rows_json() -> str:
    slim = []
    for row in ROWS:
        item = {"t": row["t"], "lane": row["lane"]}
        if row["lane"] == "input":
            item["text"] = row.get("name", "") + (f' {row["screen"]}' if row.get("screen") else "") + (f' {row["key"]}' if row.get("key") else "") + (f' on {row["shape"]["type"]}' if row.get("shape") else "")
            if row.get("screen"):
                item["screen"] = row["screen"]
        elif row["lane"] == "state":
            item["text"] = f'{row["from"]} → {row["to"]}  ({row.get("trigger", "")})'
        elif row["lane"] == "store":
            ops = row.get("ops", [])
            item["text"] = ", ".join(f'{op["op"]} {op["type"]}' + (f' {list(op.get("delta", {}).keys())}' if op.get("delta") else "") for op in ops)
        elif row["lane"] == "menu":
            item["text"] = "open: " + (", ".join(row.get("open", [])) or "(none)")
        elif row["lane"] == "mark":
            item["text"] = "✎ " + row.get("text", "")
        elif row["lane"] == "console":
            item["text"] = f'{row.get("level")}: ' + " ".join(map(str, row.get("args", [])))
        slim.append(item)
    return json.dumps(slim)


def prior_art_rows() -> str:
    rows = [
        ("Playwright Trace Viewer", "trace.playwright.dev",
         "A zip: <code>trace.trace</code> JSONL of actions + console + network, JPEG screencast frames from <code>Page.startScreencast</code>, and three DOM snapshots per action (before / action / after). Viewer: filmstrip on top, action list left, console/network/source tabs below; the click point is drawn as a dot on the snapshot.",
         "The <b>whole shape</b> of what you described. Steal: JSONL log + frame folder on one clock, frames keyed by swap time, a marker drawn from data (no cursor in the pixels)."),
        ("Chrome DevTools Protocol — <code>Page.startScreencast</code>", "chromedevtools.github.io/devtools-protocol",
         "Chrome pushes a JPEG/PNG every time the page repaints (<code>everyNthFrame</code>, <code>quality</code>, <code>maxWidth</code>); each frame carries a swap timestamp and must be acked. No frames while nothing changes.",
         "This <b>is</b> the “Chrome already supports something” you half-remembered, and it is what the spike used. Frames-on-repaint means the recording samples exactly when state changes."),
        ("Chrome DevTools Performance panel", "developer.chrome.com/docs/devtools/performance",
         "The “Screenshots” checkbox is a filmstrip built from <code>disabled-by-default-devtools.screenshot</code> trace events. Since Chrome 128 <code>performance.mark(name, {detail:{devtools:{track,…}}})</code> adds custom tracks; since 134 <code>console.timeStamp(label, start, end, track)</code> does the same.",
         "A free viewer for the text lanes if the recording is also written as a Chrome trace. Parked to v3: not verified here, and DevTools is a perf UI, not a bug-reading UI."),
        ("Chrome DevTools Recorder + <code>@puppeteer/replay</code>", "developer.chrome.com/docs/devtools/recorder",
         "Records user flows as steps (click / change / keyDown / navigate with CSS/ARIA selectors), replays them, exports JSON, Puppeteer, and via extension Playwright.",
         "Not a black box — it records intent-level steps, no state, no pixels. Steal its step JSON as the “repro steps” vocabulary; the input lane can be reduced to it."),
        ("rrweb 2.x (PostHog and Sentry replay are built on it)", "github.com/rrweb-io/rrweb",
         "Records DOM mutations, pointer, scroll, input; <code>addCustomEvent(tag, payload)</code> puts your own rows on its timeline; a console plugin; <code>rrweb-player</code> replays pixel-faithfully; <code>rrvideo</code> renders to video.",
         "The strongest alternative for <i>human</i> playback. Weak here because tldraw v5 paints selection, handles and overlays to a <code>&lt;canvas&gt;</code> (quoted from this repo below), and an agent cannot Read an rrweb event log."),
        ("Jam.dev", "jam.dev/docs/record-a-jam/instant-replay",
         "“Instant Replay” keeps a rolling two-minute DOM buffer locally and saves it after the fact, with console, network and device info. Ships an MCP server (<code>getConsoleLogs</code>, <code>getUserEvents</code>, <code>getFrames</code>, <code>getScreenshots</code>…) so a coding agent reads the recording directly.",
         "The closest consumer product to your brief, and it chose <b>retroactive</b>. Its MCP tool list is a ready-made contract for what the packet must contain."),
        ("Bird Eats Bug (BrowserStack Bug Capture), Marker.io", "birdeatsbug.com · marker.io",
         "Dashcam-style background capture of screen + clicks + console + network; annotated screenshots; session replay.",
         "Same category, same lesson: capture continuously, save on demand. Nothing to import."),
        ("Replay.io → Nut.new / Replay QA", "replay.io",
         "A deterministic record-and-replay browser (time-travel debugging). In 2025 it pivoted: Nut.new feeds recordings to an AI builder for root-cause analysis; the 2026 homepage sells an autonomous QA agent on the same engine.",
         "The framing to copy: a recording exists to hand an agent the <i>cause</i>, not a video. Their engine is a forked browser — not on the table here."),
        ("chrome-devtools-mcp (Google, 2025) · Playwright MCP", "github.com/ChromeDevTools/chrome-devtools-mcp",
         "Live tools for an agent: <code>take_screenshot</code>, <code>list_console_messages</code>, <code>screencast_start/stop</code>, performance traces, input automation, against a running Chrome.",
         "Complementary, not competing: MCP answers “what is the page doing <i>now</i>”; the recorder answers “what happened before I was asked”. Your Agentic Coding Handbook clipping flagged these in May and never wired them."),
        ("tldraw's own seams", "tldraw.dev/examples/store-events",
         f"<code>editor.on('event')</code> (pointer / keyboard / wheel / pinch), <code>store.listen(fn, {{scope:'all'}})</code> (added / updated / removed records), <code>editor.getPath()</code>, <code>editor.menus.getOpenMenus()</code>; a Debug menu behind <code>isDebugMode</code> with flags like <code>showFps</code>, <code>debugCursors</code>, <code>throwToBlob</code>.",
         f"Everything the fast channel needs is public API in tldraw {TLDRAW_VERSION}. No fork, no patch, nothing beside the engine — the stock-boundary rule holds."),
        ("Event sourcing · Elm / Redux time-travel", "your vault: C - Event Sourcing, C - The Elm Architecture",
         "A snapshot plus an ordered log of changes reproduces any instant; a pure update function makes replay deterministic.",
         "tldraw's store <i>is</i> this: <code>getStoreSnapshot()</code> at t=0 plus the diff lane replays to any moment with <code>store.applyDiff</code>. The recording is a time machine, not just a picture."),
        ("Flight recorders — ShadowPlay Instant Replay, Xbox “Record that”, PS5, Steam, dashcams · your <code>bam_logger</code> note (Jul 2025)", "your vault: bam_logger - Data Logging",
         "All keep a rolling buffer and save on a trigger; NVIDIA and Xbox default to the last 30 s. Your own note: <i>“You can only save data retrospectively if you have already recorded it!”</i> — with a pre-trigger circular buffer and 30 s atomic chunks.",
         "You already decided this a year ago in another domain. The button is “Save the last 30 s”, not “Start recording”."),
    ]
    out = []
    for name, url, what, steal in rows:
        out.append(f"<tr><td><b>{name}</b><br><small class=\"muted\">{esc(url)}</small></td><td>{what}</td><td>{steal}</td></tr>")
    return "\n".join(out)


def criteria_rows() -> str:
    return "\n".join(f'<tr><td class="mono">{cid}</td><td>{text}</td><td class="mono">×{weight}</td></tr>' for cid, text, weight in CRITERIA)


def option_rows() -> str:
    out = []
    ranked = sorted(OPTIONS, key=lambda option: -score(option[3]))
    for letter, name, blurb, marks in ranked:
        total = score(marks)
        cls = "ok" if letter == "A" else ("warn" if total >= 60 else "bad")
        cells = "".join(f'<td class="mono c{mark}">{mark}</td>' for mark in marks)
        out.append(f'<tr><td><b>{letter} · {name}</b><br><small class="muted">{blurb}</small></td>{cells}<td><span class="pill {cls}">{total}</span></td></tr>')
    return "\n".join(out)


def lane_tiles() -> str:
    labels = {"input": "input events", "state": "state transitions", "store": "store diffs", "menu": "menu changes", "console": "console rows", "mark": "marks"}
    out = []
    for lane in ("input", "state", "store", "menu", "console", "mark"):
        out.append(f'<div class="stat"><b class="{lane_class(lane)}">{LANES.get(lane, 0)}</b><span>{labels[lane]}</span></div>')
    return "\n".join(out)


def seam_diagram() -> str:
    return """<svg viewBox="0 0 1160 500" role="img" aria-label="Two channels on one clock">
  <defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5 0 10z" fill="#4b5560"/></marker></defs>
  <style>.b{fill:#fff;stroke:#c9d0d8;stroke-width:1.5;rx:14}.t{font:600 14px Inter,ui-sans-serif,system-ui;fill:#14171a}.s{font:12.5px Inter,ui-sans-serif,system-ui;fill:#626a73}.m{font:12px ui-monospace,monospace;fill:#315be8}.l{stroke:#4b5560;stroke-width:1.6;fill:none;marker-end:url(#a)}.slow{stroke:#c47a1c}.fast{stroke:#315be8}.lab{font:800 10.5px ui-monospace,monospace;letter-spacing:.1em}.g{fill:#0e6b36}.o{fill:#8a6206}</style>
  <rect x="20" y="20" width="540" height="460" rx="18" fill="#f6f7f8" stroke="#dfe3e7"/>
  <text x="40" y="48" class="t">Chrome window · Preview 4322 / Stable 4321</text>
  <text x="40" y="67" class="s">launched by scripts/launch_systemsketch.py · one new flag: --remote-debugging-port</text>
  <rect x="40" y="90" width="230" height="150" class="b"/>
  <text x="56" y="116" class="t">tldraw editor (stock)</text>
  <text x="56" y="140" class="m">editor.on('event')</text>
  <text x="56" y="160" class="m">store.listen({scope:'all'})</text>
  <text x="56" y="180" class="m">editor.getPath()</text>
  <text x="56" y="200" class="m">editor.menus.getOpenMenus()</text>
  <text x="56" y="220" class="m">console.* · window 'error'</text>
  <rect x="300" y="90" width="240" height="150" class="b"/>
  <text x="316" y="116" class="t">in-page flight recorder</text>
  <text x="316" y="138" class="s">ring buffer · last N seconds</text>
  <text x="316" y="158" class="s">one clock: performance.now()</text>
  <text x="316" y="178" class="s">lanes: input · state · menu · store ·</text>
  <text x="316" y="196" class="s">console · mark (+ DOM keys, v1)</text>
  <text x="316" y="222" class="s g">measured cost: __COST_MS__ ms over __DUR_S__ s</text>
  <path d="M272 165 H298" class="l fast"/>
  <rect x="40" y="280" width="500" height="64" class="b"/>
  <text x="56" y="305" class="t">Dev menu · Save the last 30 s · Record next ≤ 30 s · Copy last</text>
  <text x="56" y="326" class="s">REC bar at the top during an explicit take (InFrontOfTheCanvas seam) · window 5–120 s</text>
  <path d="M420 242 V278" class="l fast"/>
  <rect x="40" y="380" width="500" height="64" class="b"/>
  <text x="56" y="405" class="t">clipboard ← packet (prose, then absolute paths)</text>
  <text x="56" y="426" class="s">written on the Stop click · a failed write is reported as a failure, never as success</text>
  <path d="M290 346 V378" class="l fast"/>
  <rect x="600" y="20" width="540" height="215" rx="18" fill="#f6f7f8" stroke="#dfe3e7"/>
  <text x="620" y="48" class="t">Python host · scripts/server.py (4323)</text>
  <text x="1010" y="48" class="lab" fill="#315be8">FAST CHANNEL · TEXT</text>
  <rect x="620" y="68" width="500" height="150" class="b"/>
  <text x="636" y="94" class="t">POST /api/recordings · GET /api/recordings/last</text>
  <text x="636" y="116" class="m">~/SystemSketch/recordings/&lt;ISO-time&gt;-&lt;note&gt;/</text>
  <text x="636" y="138" class="s">README.md (the packet) · timeline.jsonl · start.snapshot.json</text>
  <text x="636" y="158" class="s">frames/f-&lt;ms&gt;.jpg · frames.jsonl · header.json · playback.html (v2)</text>
  <text x="636" y="180" class="s">staged → fsync → os.replace, like a preview clone · keep the last 20</text>
  <text x="636" y="202" class="s">returns {path, packet}</text>
  <path d="M542 312 C 575 312, 575 143, 618 143" class="l fast"/>
  <rect x="600" y="265" width="540" height="215" rx="18" fill="#fdf7ea" stroke="#f2d9a8"/>
  <text x="620" y="293" class="t">frame sidecar · scripts/recorder_frames.mjs</text>
  <text x="998" y="293" class="lab" fill="#c47a1c">SLOW CHANNEL · PIXELS</text>
  <text x="620" y="312" class="s">Node __NODE__ built-in WebSocket · spawned per channel by the host</text>
  <rect x="620" y="330" width="500" height="132" class="b"/>
  <text x="636" y="355" class="m">Page.startScreencast({format:'jpeg', quality:70})</text>
  <text x="636" y="377" class="s">a frame only when the page repaints · each carries its swap timestamp</text>
  <text x="636" y="397" class="s">ring buffer of the last N s · on save keep one frame per __KEEP__ ms</text>
  <text x="636" y="417" class="s">written into the same recording folder as frames/f-&lt;ms&gt;.jpg</text>
  <text x="636" y="441" class="s o">measured __FPS__ frames/s · __FRAME_KB__ KB median · UI chrome in, cursor out</text>
  <path d="M560 60 C 590 60, 590 396, 618 396" class="l slow" stroke-dasharray="5 4"/>
  <path d="M1120 204 C 1150 204, 1150 240, 1120 240" class="l" style="opacity:0"/>
</svg>"""


# --------------------------------------------------------------------------- #
# Page
# --------------------------------------------------------------------------- #
TEMPLATE = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Record the last 30 seconds — design review</title>
<style>
  :root{--ink:#14171a;--muted:#626a73;--line:#dfe3e7;--paper:#f6f7f8;--card:#fff;
        --green:#0e6b36;--amber:#8a6206;--blue:#315be8;--red:#c4392c;--orange:#c47a1c}
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
  .badge.bad{border-color:#f0c4bd;background:#fdf1ef;color:var(--red)}
  section{margin-top:52px}
  h2{margin:0 0 6px;font-size:27px;letter-spacing:-.03em}
  h3{margin:0 0 8px;font-size:17px}
  .sub{margin:0 0 22px;color:var(--muted);max-width:920px}
  .muted{color:var(--muted)}
  figure{margin:0;padding:14px;border:1px solid var(--line);border-radius:18px;background:var(--card)}
  figure svg{display:block;width:100%;height:auto}
  figcaption{padding:12px 4px 2px;color:var(--muted);font-size:13.5px}
  figcaption strong{display:block;color:var(--ink);font-size:14.5px;margin-bottom:2px}
  .two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
  .three{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
  @media(max-width:860px){.two,.three{grid-template-columns:1fr}}
  pre{margin:0;padding:16px;border:1px solid var(--line);border-radius:14px;background:#0f1216;color:#e6edf3;overflow-x:auto;font:12.5px/1.62 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap}
  pre.light{background:#fbfcfd;color:#1b2027}
  .card{padding:22px;border:1px solid var(--line);border-radius:18px;background:var(--card)}
  .card h3 .n{display:inline-block;width:26px;height:26px;border-radius:50%;background:#eaf0fe;color:var(--blue);font:800 13px/26px ui-monospace,monospace;text-align:center;margin-right:8px}
  table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:16px;overflow:hidden}
  th,td{padding:11px 14px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top;font-size:14px}
  th{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#4b5560;background:#fafbfc}
  tr:last-child td{border-bottom:0}
  td.mono,th.mono,.mono{font:12.5px/1.5 ui-monospace,monospace}
  td.t{white-space:nowrap}
  .pill{display:inline-block;padding:3px 9px;border-radius:999px;font:700 11.5px/1.5 ui-monospace,monospace;white-space:nowrap}
  .pill.ok{background:#eefaf2;color:var(--green)}.pill.bad{background:#fdf1ef;color:var(--red)}.pill.warn{background:#fdf7ea;color:var(--amber)}
  code{padding:.12em .35em;border-radius:5px;background:#eceff2;font:12.5px/1.4 ui-monospace,monospace}
  .note{padding:16px 18px;border:1px solid #f2d9a8;border-radius:14px;background:#fdf7ea}
  .note.bad{border-color:#f0c4bd;background:#fdf1ef}.note.good{border-color:#bfe3cd;background:#eefaf2}
  blockquote{margin:0;padding:14px 18px;border-left:3px solid var(--line);background:#fafbfc;color:var(--muted);font-size:14.5px;border-radius:0 10px 10px 0}
  blockquote b{color:var(--ink)}
  .stats{display:grid;grid-template-columns:repeat(6,1fr);gap:11px}
  @media(max-width:860px){.stats{grid-template-columns:repeat(3,1fr)}}
  .stat{padding:14px 16px;border:1px solid var(--line);border-radius:14px;background:var(--card)}
  .stat b{display:block;font-size:26px;letter-spacing:-.03em}.stat span{color:var(--muted);font-size:12.5px}
  .in{color:var(--blue)}.st{color:var(--green)}.sto{color:#7a3fb5}.mn{color:var(--orange)}.co{color:var(--red)}.mk{color:#a3197c}
  .strip{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
  @media(max-width:860px){.strip{grid-template-columns:repeat(3,1fr)}}
  figure.film{padding:6px;border-radius:10px}figure.film img{display:block;width:100%;border-radius:6px;border:1px solid var(--line)}
  figure.film figcaption{padding:6px 2px 0;font:11.5px ui-monospace,monospace}
  .c1{color:var(--red)}.c2{color:var(--orange)}.c3{color:var(--amber)}.c4{color:#3f7d4a}.c5{color:var(--green);font-weight:800}
  /* viewer */
  .viewer{border:1px solid var(--line);border-radius:18px;background:var(--card);padding:14px;display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:14px}
  @media(max-width:860px){.viewer{grid-template-columns:1fr}}
  .screen{position:relative;border-radius:10px;overflow:hidden;border:1px solid var(--line);background:#eee;aspect-ratio:3/2}
  .screen img{display:block;width:100%;height:100%;object-fit:cover}
  .cursor{position:absolute;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;border:2px solid #fff;background:var(--blue);box-shadow:0 0 0 3px #315be866;pointer-events:none;transition:left .05s,top .05s}
  .cursor.down{background:var(--red);box-shadow:0 0 0 6px #c4392c55}
  .rec{position:absolute;left:0;right:0;top:0;height:30px;background:#c4392cee;color:#fff;font:700 12px/30px ui-monospace,monospace;letter-spacing:.06em;padding:0 12px;display:flex;justify-content:space-between}
  .rec i{display:inline-block;width:8px;height:8px;border-radius:50%;background:#fff;margin-right:8px;animation:blink 1s infinite}
  @keyframes blink{50%{opacity:.25}}
  .log{height:100%;max-height:560px;overflow:auto;border:1px solid var(--line);border-radius:10px;background:#0f1216;padding:8px 10px;font:11.5px/1.55 ui-monospace,monospace;color:#cfd7e6}
  .log div{white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
  .log .t{color:#7d8794;display:inline-block;width:64px}
  .log .lane{display:inline-block;width:52px;font-weight:700}
  .controls{grid-column:1/-1;display:flex;gap:12px;align-items:center;font:12.5px ui-monospace,monospace}
  .controls input[type=range]{flex:1}
  .controls button{padding:6px 12px;border:1px solid var(--line);border-radius:8px;background:#fafbfc;font:700 12px ui-monospace,monospace;cursor:pointer}
  /* dev menu mock */
  .devmock{width:390px;max-width:100%;padding:13px;border:1px solid var(--line);border-radius:22px;background:#fff;box-shadow:0 18px 50px #12182014;font-family:Inter,ui-sans-serif,system-ui}
  .devmock .lbl{display:flex;justify-content:space-between;font:800 11px/1 ui-sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#6b7280;padding:14px 8px 8px}
  .devmock .row{display:grid;grid-template-columns:31px minmax(0,1fr) auto;gap:12px;align-items:center;padding:12px 10px;border-radius:14px;border:1px solid transparent;text-align:left}
  .devmock .row:hover{background:#f6f7fb;border-color:#e6e8f2}
  .devmock .row i{width:31px;height:31px;border-radius:9px;background:#eef0ff;color:#4b56d2;display:grid;place-items:center;font:700 14px ui-monospace,monospace;font-style:normal}
  .devmock .row b{display:block;font-size:14.5px;font-weight:600}.devmock .row small{color:#6b7280;font-size:12px}
  .devmock .row em{color:#9aa0c8;font-style:normal}
  .devmock .row.live i{background:#fdecea;color:#c4392c}
  .devmock .win{display:flex;gap:6px;align-items:center;padding:6px 10px 2px;font-size:12px;color:#6b7280}
  .devmock .win span{padding:3px 9px;border-radius:999px;border:1px solid #e6e8f2;font:600 11.5px ui-monospace,monospace}
  .devmock .win span.on{background:#4b56d2;color:#fff;border-color:#4b56d2}
  footer{margin-top:60px;padding-top:22px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}
  a{color:var(--blue)}
  ol.steps{margin:0;padding:0;list-style:none;counter-reset:s}
  ol.steps li{position:relative;padding:14px 12px 14px 52px;border-bottom:1px solid var(--line)}
  ol.steps li:last-child{border-bottom:0}
  ol.steps li::before{counter-increment:s;content:counter(s);position:absolute;left:12px;top:14px;width:26px;height:26px;border-radius:50%;background:#eaf0fe;color:var(--blue);font:800 13px/26px ui-monospace,monospace;text-align:center}
  ol.steps b{display:block;font-weight:650;margin-bottom:3px}
  ol.steps span{color:var(--muted);font-size:13.5px}
</style>
</head>
<body><main>

<div class="hero">
  <div class="kicker">SystemSketch · design review · 1 September 2026 · answers “Recording program state”</div>
  <h1>Record the last 30 seconds</h1>
  <p class="lede">Your brief is right about the shape — a slow filmstrip and a fast text stream on one clock, handed to an agent as prose plus file paths. Two changes make it land: the button should <b>save what just happened</b>, not start a take (you wrote that rule yourself in July 2025, for the robot logger), and the pixels should come from <b>Chrome's own screencast over the debugging port</b>, not from inside the page. Both halves were run in the real app before this page was written: the fast channel cost the app <b>__COST_MS__ ms</b> over __DUR_S__ s, and Chrome delivered <b>__FRAMES__ frames</b> with the inspector, the menus and the handles in them.</p>
  <div class="badges">
    <span class="badge ok">spike ran in the real app · __DUR_S__ s · __ROWS__ rows · __TIMELINE_KB__ KB text</span>
    <span class="badge ok">__FRAMES__ frames · __FPS__/s natural · __FRAME_KB__ KB median</span>
    <span class="badge ok">recorder overhead __OVERHEAD__ %</span>
    <span class="badge warn">key_down never reached the editor bus (__KEY_DOWNS__ of __KEY_UPS__ keys) — DOM lane needed</span>
    <span class="badge warn">no product code written · design + evidence only</span>
  </div>
</div>

<section>
  <h2>1 · Upgrades to the brief</h2>
  <p class="sub">Seven places where the note's framing can be sharpened. Each one changes something concrete in the build.</p>
  <div class="three">
    <div class="card"><h3><span class="n">1</span>“Start recording” is the wrong verb</h3>
      <p>By the time you notice a bug, it has happened. A recorder you have to start captures only bugs you can reproduce on demand — the easy ones. Keep a rolling buffer of the last N seconds <i>always</i> (the fast channel costs <b>__OVERHEAD__ %</b>), and make the primary button <b>Save the last 30 s</b>. Keep an explicit <b>Record next ≤ 30 s</b> for the reproducible case; that is the one with the red bar at the top. NVIDIA, Xbox, PS5, Steam and Jam.dev all landed here, and so did your <code>bam_logger</code> note: <i>“you can only save data retrospectively if you have already recorded it.”</i></p></div>
    <div class="card"><h3><span class="n">2</span>Two consumers, two channels</h3>
      <p>The agent reads <b>files</b> — JPEGs with its Read tool, JSON lines it can grep. You watch a <b>scrub bar</b>. Your own Match-Mismatch decision from July: layout is spatial → image; behaviour is causal → text. So the recording is a folder first, and the viewer (§3) is a view over that folder, never a separate format. Never base64 into the clipboard — the copy-for-claude template already learned that.</p></div>
    <div class="card"><h3><span class="n">3</span>“State” has four parts here</h3>
      <p>tldraw's <b>store</b> (document <i>and</i> session: selection, hover, editing, camera are ordinary records), the <b>state chart path</b> (<code>select.pointing_block_port</code> → <code>select.dragging_handle</code>), the <b>open menus</b>, and the <b>raw input</b>. The spike's state lane read like a narrative of the interaction — and it exposed a bug in the spike's own script (§3). Store diffs plus the t=0 snapshot also make the recording <b>replayable</b>: <code>loadStoreSnapshot</code> then <code>applyDiff</code> per row.</p></div>
    <div class="card"><h3><span class="n">4</span>Pixels come from outside the page</h3>
      <p>The bugs you chase are in the UI chrome — the selection menu, the inspector, port handles — and tldraw v5 paints handles and overlays to a <code>&lt;canvas&gt;</code>. <code>editor.toImage()</code> shows shapes only, and tab self-capture needs a picker dialog. Chrome's <code>Page.startScreencast</code> shows exactly what you saw, sends a frame only when the page repaints, and costs the page nothing. The price is one flag on the desktop launcher.</p></div>
    <div class="card"><h3><span class="n">5</span>One clock, and draw the cursor from data</h3>
      <p>Screencast frames carry Chrome's swap time; the text rows carry <code>performance.now()</code>. Both are wall-clock on one machine — the spike measured a median skew of <b>__SKEW__ ms</b>. No frame source includes the mouse pointer, so the viewer draws it from the input lane, the way Playwright's viewer draws the click dot.</p></div>
    <div class="card"><h3><span class="n">6</span>The cap is a budget, not a safety net</h3>
      <p>30 s at the measured rate is ≈ <b>__PROJ_FRAMES__ frames · __PROJ_FRAMES_MB__ MB</b> raw, and up to __PROJ_FRAMES_60_MB__ MB if you drag continuously. An agent will not read 300 screenshots. So the cap does two jobs: bound disk and jank, and bound what the agent must read — keep one frame per __KEEP__ ms (≤ __PROJ_KEPT__ frames, ≈ __PROJ_KEPT_MB__ MB per 30 s), all of them on state changes anyway because Chrome only paints on change. Adjustable 5–120 s in the Dev menu, never unlimited.</p></div>
    <div class="card"><h3><span class="n">7</span>A recording should be able to become a test</h3>
      <p>The input lane is a list of <code>Input.dispatchMouseEvent</code> calls with timestamps; the harness already speaks that. Replay it at the recorded viewport onto <code>start.snapshot.json</code> and a bug report becomes a failing <code>tests/*_smoke.mjs</code>. Not v1 — but it is why the folder must carry the viewport, the snapshot and screen-space coordinates from day one. It also answers your daily-note thought that recordings double as goldens.</p></div>
  </div>
</section>

<section>
  <h2>2 · The shape: two channels, one clock, one folder</h2>
  <p class="sub">Everything on the left is public tldraw API and existing seams in this repo. Everything on the right is the Python host you already have plus a small Node sidecar. The single new dependency is a Chrome flag.</p>
  <figure>__SEAM_SVG__
    <figcaption><strong>Fast channel in blue, slow channel in amber, both landing in one recording folder.</strong> The in-page recorder is installed from <code>onMount</code> like every other <code>install*(editor)</code> here; the Dev menu rows sit between “Isolated presets” and “Version &amp; updates”; the host route is written like a preview clone; the sidecar is ~120 lines on Node's built-in WebSocket, modelled on the spike.</figcaption>
  </figure>
</section>

<section>
  <h2>3 · Evidence — the spike, run in the real app</h2>
  <p class="sub"><code>docs/recorder_spike.mjs</code> (__SPIKE_LINES__ lines) drove a fresh headless instance through a Block bug-hunt gesture — draw two Blocks, add ports, wire a cable, try to move a Block, open the context menu, zoom — with <code>docs/recorder_spike_inpage.js</code> (__INPAGE_LINES__ lines) injected as the recorder and Chrome's screencast running over the debugging port. It wrote the exact folder the product would write. Nothing below is illustrative; it is that run.</p>
  <div class="stats">__LANE_TILES__</div>
  <div class="stats" style="margin-top:11px">
    <div class="stat"><b>__DUR_S__ s</b><span>recorded</span></div>
    <div class="stat"><b>__COST_MS__ ms</b><span>spent inside the recorder (__OVERHEAD__ %)</span></div>
    <div class="stat"><b>__TIMELINE_KB__ KB</b><span>timeline.jsonl · __SNAPSHOT_KB__ KB snapshot</span></div>
    <div class="stat"><b>__FRAMES__</b><span>frames from Chrome · __FPS__/s while active</span></div>
    <div class="stat"><b>__FRAME_KB__ KB</b><span>median frame · 1440×960 JPEG q70</span></div>
    <div class="stat"><b>__KEPT__</b><span>kept at one per __KEEP__ ms · __KEPT_KB__ KB</span></div>
  </div>

  <div class="two" style="margin-top:18px">
    <div>
      <h3>The state lane, verbatim</h3>
      <table><thead><tr><th>t</th><th>from</th><th>to</th><th>trigger</th></tr></thead><tbody>__TRANSITIONS__</tbody></table>
    </div>
    <div>
      <h3>What the lane told me that the screenshots did not</h3>
      <div class="note bad" style="margin-bottom:14px"><b>The spike caught its own bug.</b> Step 6 of the script was “press on the detector and drag it 180 px”. The detector never moved: the state lane shows <code>pointing_shape → editing_shape</code> with trigger <code>double_click</code> at +__DBL_T__ s — my press landed inside tldraw's double-click window after the selecting click, so the gesture became “edit the title”, and there is no <code>select.translating</code> anywhere in the run (__TRANSLATING__ occurrences). That is the feature working: the explanation was in the text, and an agent would have read it in one grep.</div>
      <div class="note"><b>Keys are only half-visible from the editor bus.</b> Enter and Escape show up as <code>key_up</code> (__KEY_UPS__) and never as <code>key_down</code> (__KEY_DOWNS__): while a text editor or a menu has focus, the key-down is consumed before tldraw's document handler sees it. The product recorder therefore needs a thin <b>DOM lane</b> — capture-phase <code>keydown</code>/<code>pointerdown</code> on <code>window</code> — beside the editor lane. Cheap, and it is exactly the class of fact the design would have got wrong on paper.</div>
      <div class="note good" style="margin-top:14px"><b>Zero jank.</b> __COST_MS__ ms inside the recorder over __DUR_S__ s, with every pointer move and every store diff summarised. Always-on is affordable.</div>
    </div>
  </div>

  <h3 style="margin-top:26px">The slow channel: every kept frame</h3>
  <p class="sub">Chrome's screencast, one frame per __KEEP__ ms kept. The inspector for a cable mid-drag, the title editor with the details panel, the selection mini-menu — all UI chrome, all in the pixels. No cursor: the viewer below draws it from the input lane.</p>
  <div class="strip">__FILMSTRIP__</div>

  <h3 style="margin-top:26px">The playback viewer you described, built from this recording</h3>
  <p class="sub">Slow video from the frames, fast text streaming like a console, a synthetic pointer from the input lane, and a REC bar as it would look in the explicit mode. Drag the slider or press play. This is ~80 lines over the folder — v2 writes one of these into every recording as <code>playback.html</code>.</p>
  <div class="viewer" id="viewer">
    <div class="screen" id="screen"><img id="frame" alt="recorded frame"><div class="cursor" id="cursor"></div><div class="rec"><span><i></i>REC · Preview · window 30 s</span><span id="clock">00:00.0</span></div></div>
    <div class="log" id="log"></div>
    <div class="controls"><button id="play">▶ play</button><input type="range" id="scrub" min="0" max="__DUR_MS__" value="0" step="10"><span id="tlabel" style="width:70px">0 ms</span></div>
  </div>

  <h3 style="margin-top:26px">The clipboard packet, as written</h3>
  <p class="sub">Prose first, then absolute paths the agent Reads — the copy-for-claude shape. Generated from the run, not typed.</p>
  <pre>__PACKET__</pre>
</section>

<section>
  <h2>4 · Prior art, and what to steal from each</h2>
  <p class="sub">Vault first: you had already written the flight-recorder theory, the two-channel rule, and the paths-not-base64 rule. None of the web session-replay tools appear anywhere in the vault, so that is the new ground. Every product fact below was checked against its own documentation today.</p>
  <table><thead><tr><th style="width:22%">What</th><th>What it is</th><th style="width:34%">Steal / skip</th></tr></thead><tbody>__PRIOR_ART__</tbody></table>
  <blockquote style="margin-top:14px">From this repository, <code>src/developmentSeam.ts</code> — the reason DOM-replay tools underserve tldraw v5:<br><b>__SEAM_DOC__</b></blockquote>
</section>

<section>
  <h2>5 · Where the pixels come from — criteria, then options</h2>
  <p class="sub">The text channel has one answer (tldraw's public seams). The pixel channel has five candidates. Weighted for your situation: a Desktop Chrome window you launch yourself, an agent as the first reader, and a stock-tldraw rule.</p>
  <div class="two">
    <table><thead><tr><th>#</th><th>Criterion</th><th>Weight</th></tr></thead><tbody>__CRITERIA__</tbody></table>
    <div class="card"><h3>Recommendation</h3>
      <p><b>A — CDP screencast sidecar</b>, with <b>D</b> as the fallback when the channel's Chrome has no debugging port (a plain browser tab): text lanes still record, frames come from <code>editor.toImage()</code> and the packet says so (“canvas-only frames”). C (rrweb) is the right answer for a <i>human-first</i> replay product and the wrong one here: its output is not files an agent reads, and tldraw's canvas overlays are outside the DOM it records. B requires a picker or a test-only flag and puts a video encoder inside the page you are trying to debug.</p>
      <p class="muted">Chrome ≥ 136 refuses <code>--remote-debugging-port</code> on the <i>default</i> profile; the desktop launcher already uses its own <code>--user-data-dir</code> per channel, so the flag is legal there.</p></div>
  </div>
  <table style="margin-top:16px"><thead><tr><th>Option</th><th class="mono">C1</th><th class="mono">C2</th><th class="mono">C3</th><th class="mono">C4</th><th class="mono">C5</th><th class="mono">C6</th><th class="mono">C7</th><th>Score</th></tr></thead><tbody>__OPTIONS__</tbody></table>
</section>

<section>
  <h2>6 · What it looks like in the Dev menu</h2>
  <p class="sub">Left: your screenshot of the Dev panel today. Right: the proposed “Recording” section rendered in the panel's own row grammar (glyph · label + detail · action), placed between “Isolated presets” and “Version &amp; updates”. Window chips replace a free-text field so the cap can never be unset.</p>
  <div class="two">
    <figure><img src="__DEVMENU__" alt="The Dev panel today" style="display:block;width:100%;max-width:420px;margin:auto;border-radius:12px">
      <figcaption><strong>Today</strong> Stable · Open Latest Preview · Isolated presets · Version &amp; updates.</figcaption></figure>
    <figure style="display:grid;place-items:center">
      <div class="devmock">
        <div class="lbl"><span>Recording</span><small>last saved 20:41 · 12.4 s</small></div>
        <div class="row live"><i>●</i><span><b>Save the last 30 s</b><small>What just happened · frames + state + input → folder, packet on clipboard</small></span><em>⧉</em></div>
        <div class="row"><i>▶</i><span><b>Record next ≤ 30 s</b><small>Explicit take · red bar at the top · stops at the cap</small></span><em>↗</em></div>
        <div class="row"><i>⧉</i><span><b>Copy last recording</b><small>~/SystemSketch/recordings/2026-09-01T20-41-03/</small></span><em>⧉</em></div>
        <div class="win">window <span>5 s</span><span>15 s</span><span class="on">30 s</span><span>60 s</span><span>120 s</span></div>
      </div>
      <figcaption><strong>Proposed</strong> Three verbs, one cap. The dot on the <code>&lt;/&gt;</code> button pulses while an explicit take runs; the bar at the top (see the viewer above) is mounted through the existing <code>InFrontOfTheCanvas</code> seam.</figcaption></figure>
  </div>
  <div class="note" style="margin-top:16px"><b>On Stop:</b> a one-line “what went wrong?” prompt, skippable — its text becomes the first line of the packet and a <code>mark</code> row on the timeline. The clipboard write happens on that click (a user gesture, so it is allowed); if it fails, the row says so instead of pretending, and “Copy last recording” is the retry. The auto-stop at the cap has no gesture, so it saves the folder and lights the Copy row rather than touching the clipboard.</div>
</section>

<section>
  <h2>7 · How to build it — seams, in order</h2>
  <p class="sub">Everything plugs into a seam that already exists. The stock-boundary test keeps passing because nothing new is bolted beside the engine: one more <code>install*(editor)</code> in <code>onMount</code>, rows in a panel that is already ours, a route in a host that is already ours.</p>
  <ol class="steps">
    <li><b>src/recorder/flightRecorder.ts — the ring buffer (v1)</b><span>The spike's in-page code as a module: six lanes plus the DOM lane, <code>performance.now()</code> clock, a window of N seconds trimmed on every push, <code>getStoreSnapshot('all')</code> taken when a save starts <i>and</i> kept from N seconds ago (snapshot at the buffer's tail, so a retroactive save can still replay). Installed from <code>onMount</code> under <code>import.meta.env.DEV</code> or a <code>?recorder=1</code> flag, like <code>installDevelopmentSeam</code>. Always armed; cost measured at __OVERHEAD__ %.</span></li>
    <li><b>Dev menu rows + REC bar (v1)</b><span>In <code>SystemSketchUtilities.tsx</code>, a “Recording” section in the preset-row grammar; window chips persisted at <code>systemsketch.recorder.window-s.v1</code>; the bar as a small component rendered by <code>SystemSketchSurfaceHost</code> only while an explicit take runs. No new tldraw component seam — <code>NavigationPanel</code> and <code>InFrontOfTheCanvas</code> are already claimed and asserted.</span></li>
    <li><b>scripts/server.py — POST /api/recordings, GET /api/recordings/last (v1)</b><span>Body: header, rows, snapshot, optional canvas-only frames. Writes <code>~/SystemSketch/recordings/&lt;ISO&gt;-&lt;slug&gt;/</code> under <code>files_root</code> (jailed like boards), staged then <code>os.replace</code>d like a release, keeps the last 20, returns <code>{path, packet}</code>. Add to the POST allow-list; remember <code>controller_fingerprint</code> covers <code>server.py</code>, so Preview's API pair restarts on next launch.</span></li>
    <li><b>scripts/recorder_frames.mjs + one launcher flag (v1)</b><span><code>--remote-debugging-port=&lt;4324 for Preview, 4325 for Stable&gt;</code> appended in <code>open_app()</code>; the host spawns the sidecar per channel, which attaches to the page whose URL matches the channel, runs <code>Page.startScreencast</code> into a ring buffer, and on <code>/api/recordings</code> writes the last N seconds at one frame per __KEEP__ ms into the same folder. ~120 lines; the spike is its first draft.</span></li>
    <li><b>Proof (v1)</b><span><code>tests/recorder_smoke.mjs</code>: Save-the-last-30-s after a scripted gesture → folder exists, packet on the clipboard (read back with <code>Browser.grantPermissions clipboardRead</code>), frame count within the cap, a <code>key_down</code> present in the DOM lane. Plus <code>docs/build_recorder_implementation.py</code> and a README paragraph.</span></li>
    <li><b>playback.html per recording + state→source map (v2)</b><span>The viewer above, templated by the host into each folder. The packet gains a section mapping each state-chart node seen to the file that defines it (grep the state ids under <code>src/</code> at save time), so the agent's first Read is the right file.</span></li>
    <li><b>Replay-to-test and a Chrome trace export (v3)</b><span>Turn a recording's input lane into a failing journey against <code>start.snapshot.json</code> at the recorded viewport; and emit <code>trace.json</code> with legacy <code>Screenshot</code> events + extensibility marks so DevTools › Performance › Load profile is a second, free viewer. Both unverified today, deliberately parked.</span></li>
  </ol>
  <div class="two" style="margin-top:18px">
    <figure><pre class="light">__ONMOUNT__</pre><figcaption><strong>src/App.tsx — where the recorder is installed.</strong> One more <code>install*(editor)</code> line and its disposer; the stock-boundary test does not forbid it.</figcaption></figure>
    <figure><pre class="light">__LAUNCH__</pre><figcaption><strong>scripts/launch_systemsketch.py — where the flag goes.</strong> The desktop Chrome is launched with its own profile dir per channel, so <code>--remote-debugging-port</code> is allowed on Chrome ≥ 136.</figcaption></figure>
    <figure><pre class="light">__POST__</pre><figcaption><strong>scripts/server.py — the POST allow-list.</strong> <code>/api/recordings</code> joins it; the write follows <code>create_preview_clone</code>.</figcaption></figure>
    <figure><pre class="light">__VERSION_ROW__</pre><figcaption><strong>src/SystemSketchUtilities.tsx — the row grammar to clone.</strong> The “Recording” section sits directly above this row.</figcaption></figure>
  </div>
</section>

<section>
  <h2>8 · Decision surface</h2>
  <p class="sub">Each question carries the default I will take if you say nothing, so silence keeps the work moving.</p>
  <table><thead><tr><th style="width:30%">Question</th><th>Recommendation</th><th style="width:26%">Default if silent</th></tr></thead><tbody>
    <tr><td><b>Retroactive or explicit?</b></td><td>Both. “Save the last 30 s” is the primary verb and needs no bar; “Record next ≤ 30 s” keeps the take-style flow your note describes, with the red bar.</td><td>Both, retroactive first.</td></tr>
    <tr><td><b>Frame source</b></td><td>CDP screencast sidecar behind one launcher flag; canvas-only <code>toImage</code> fallback in a plain tab, labelled as such in the packet.</td><td>A with D fallback.</td></tr>
    <tr><td><b>Where recordings live</b></td><td><code>~/SystemSketch/recordings/</code>, next to the boards and inside the host's jail — visible, attachable to notes. Not <code>~/.local/state</code>.</td><td><code>~/SystemSketch/recordings/</code>, keep last 20.</td></tr>
    <tr><td><b>Cap</b></td><td>30 s default, chips 5 / 15 / 30 / 60 / 120 s, frames kept at one per __KEEP__ ms. Never unlimited.</td><td>As stated.</td></tr>
    <tr><td><b>Build v1 now?</b></td><td>Yes — steps 1–5 above are a day of agent work with the spike as the first draft; the design risks are retired by the measurements on this page.</td><td>Say “go” (or start a session pointing at this report) and v1 lands with its smoke test and a follow-up report.</td></tr>
  </tbody></table>
  <h3 style="margin-top:22px">Deliberately not done</h3>
  <ul>
    <li><b>No product code.</b> Your question was about the thinking and the approach; the spike lives in <code>docs/</code> and touches nothing in <code>src/</code>, <code>scripts/</code> or the launcher.</li>
    <li><b>No merge.</b> This session was forced into a worktree by the background-job guard (your rule is main by default; the guard rejects edits to the shared checkout). The branch is <code>__BRANCH__</code> off <code>__HEAD__</code>, three docs files and one assets folder. Merging is one fast-forward and yours to run.</li>
    <li><b>No DevTools trace export.</b> The legacy <code>Screenshot</code> event format is documented, but I did not load one in DevTools, so it stays in v3 rather than being claimed.</li>
    <li><b>No rrweb.</b> Considered and scored, not trialled — the canvas-overlay gap is structural, not tunable.</li>
  </ul>
</section>

<footer>
  Built from the live repo by <code>docs/build_state_recorder_design.py</code> at <code>__HEAD__</code> (<code>__BRANCH__</code>) · tldraw <code>__TLDRAW__</code> · app <code>__APP_VERSION__</code> · Node <code>__NODE__</code> · ports bound at build: <code>__PORTS__</code> · <code>navigator.clipboard</code> uses in <code>src/</code> today: __CLIP_USES__ · error/console interceptors in <code>src/</code> today: __CONSOLE_PATCHES__. Every count on this page was measured at build time from the tree and from the spike run that produced <code>docs/assets/recorder-spike/</code>.
</footer>

<script>
(() => {
  const frames = __VIEWER_FRAMES__;
  const rows = __VIEWER_ROWS__;
  const dur = __DUR_MS__;
  const img = document.getElementById('frame');
  const cursor = document.getElementById('cursor');
  const log = document.getElementById('log');
  const scrub = document.getElementById('scrub');
  const tlabel = document.getElementById('tlabel');
  const clock = document.getElementById('clock');
  const screen = document.getElementById('screen');
  const play = document.getElementById('play');
  const colours = { input: '#7aa2ff', state: '#75d39b', store: '#c39bff', menu: '#f2b46b', console: '#f28b7d', mark: '#ff9ad5' };
  let shown = -1, rendered = 0, down = false;
  function render(t) {
    let fi = 0;
    for (let i = 0; i < frames.length; i++) if (frames[i].t <= t) fi = i;
    if (fi !== shown) { img.src = frames[fi].src; shown = fi; }
    let last = null;
    while (rendered < rows.length && rows[rendered].t <= t) {
      const r = rows[rendered];
      const div = document.createElement('div');
      div.innerHTML = `<span class="t">+${(r.t / 1000).toFixed(2)}s</span><span class="lane" style="color:${colours[r.lane]}">${r.lane}</span>${r.text.replace(/</g, '&lt;')}`;
      log.appendChild(div);
      rendered++;
    }
    for (let i = rendered - 1; i >= 0; i--) { if (rows[i].lane === 'input' && rows[i].screen) { last = rows[i]; break; } }
    if (last) {
      const rect = screen.getBoundingClientRect();
      cursor.style.left = (last.screen[0] / __FRAME_W__ * rect.width) + 'px';
      cursor.style.top = (last.screen[1] / __FRAME_H__ * rect.height) + 'px';
      cursor.classList.toggle('down', /pointer_down|pointer_move/.test(last.text) && !/pointer_up/.test(last.text));
    }
    log.scrollTop = log.scrollHeight;
    tlabel.textContent = Math.round(t) + ' ms';
    clock.textContent = '00:' + (t / 1000).toFixed(1).padStart(4, '0');
  }
  function seek(t) {
    if (t < (rows[rendered - 1]?.t ?? -1)) { log.innerHTML = ''; rendered = 0; }
    render(t);
  }
  scrub.addEventListener('input', () => { playing = false; play.textContent = '▶ play'; seek(+scrub.value); });
  let playing = false, startedAt = 0, startT = 0;
  function tick(now) {
    if (!playing) return;
    const t = Math.min(dur, startT + (now - startedAt));
    scrub.value = t; seek(t);
    if (t >= dur) { playing = false; play.textContent = '▶ replay'; return; }
    requestAnimationFrame(tick);
  }
  play.addEventListener('click', () => {
    if (playing) { playing = false; play.textContent = '▶ play'; return; }
    startT = +scrub.value >= dur ? 0 : +scrub.value; startedAt = performance.now(); playing = true; play.textContent = '❚❚ pause';
    requestAnimationFrame(tick);
  });
  // #t=<ms> deep-links a moment, so a packet or a chat can point at "+6.1 s" directly.
  const wanted = Number((location.hash.match(/t=(\d+)/) || [])[1]);
  const start = Number.isFinite(wanted) && wanted > 0 ? Math.min(dur, wanted) : __DEFAULT_T__;
  scrub.value = start;
  seek(start);
})();
</script>
</main></body>
</html>
"""


def main() -> None:
    seam = (seam_diagram()
            .replace("__COST_MS__", str(METRICS["recorderCostMs"]))
            .replace("__DUR_S__", f"{DURATION_S:.1f}")
            .replace("__NODE__", NODE_VERSION)
            .replace("__KEEP__", str(KEEP_GAP))
            .replace("__FPS__", str(METRICS["framesPerSecond"]))
            .replace("__FRAME_KB__", str(METRICS["frameBytesMedian"] // 1024)))
    values = {
        "__SEAM_SVG__": seam,
        "__COST_MS__": str(METRICS["recorderCostMs"]),
        "__DUR_S__": f"{DURATION_S:.1f}",
        "__DUR_MS__": str(int(METRICS["durationMs"])),
        "__ROWS__": str(METRICS["rows"]),
        "__TIMELINE_KB__": str(round(METRICS["timelineBytes"] / 1024)),
        "__SNAPSHOT_KB__": str(round(METRICS["snapshotBytes"] / 1024, 1)),
        "__FRAMES__": str(METRICS["frames"]),
        "__FPS__": str(METRICS["framesPerSecond"]),
        "__FRAME_KB__": str(METRICS["frameBytesMedian"] // 1024),
        "__OVERHEAD__": str(METRICS["recorderOverheadPct"]),
        "__KEY_DOWNS__": str(KEY_DOWNS),
        "__KEY_UPS__": str(KEY_UPS),
        "__KEPT__": str(len(KEPT)),
        "__KEPT_KB__": str(round(METRICS["framesKeptBytes"] / 1024)),
        "__KEEP__": str(KEEP_GAP),
        "__SKEW__": str(METRICS["clockSkewMedianMs"]),
        "__PROJ_FRAMES__": str(PROJ_FRAMES_MEASURED),
        "__PROJ_FRAMES_MB__": str(PROJ_FRAMES_MEASURED_MB),
        "__PROJ_FRAMES_60_MB__": str(PROJ_FRAMES_60_MB),
        "__PROJ_KEPT__": str(PROJ_KEPT),
        "__PROJ_KEPT_MB__": str(PROJ_KEPT_MB),
        "__PROJ_TEXT_KB__": str(PROJ_TEXT_KB),
        "__SPIKE_LINES__": str(SPIKE_LINES),
        "__INPAGE_LINES__": str(INPAGE_LINES),
        "__LANE_TILES__": lane_tiles(),
        "__TRANSITIONS__": transition_rows(),
        "__DBL_T__": f"{DOUBLE_CLICK_EDIT['t'] / 1000:.2f}" if DOUBLE_CLICK_EDIT else "—",
        "__TRANSLATING__": str(TRANSLATING),
        "__FILMSTRIP__": filmstrip(),
        "__PACKET__": esc(PACKET),
        "__PRIOR_ART__": prior_art_rows(),
        "__SEAM_DOC__": esc(" ".join(line.strip(" *") for line in SEAM_DOC_SLICE.splitlines()).strip()),
        "__CRITERIA__": criteria_rows(),
        "__OPTIONS__": option_rows(),
        "__DEVMENU__": png_uri(ASSETS / "dev-menu-reference.png", 610),
        "__ONMOUNT__": esc(ONMOUNT_SLICE),
        "__LAUNCH__": esc(LAUNCH_SLICE),
        "__POST__": esc(POST_SLICE),
        "__VERSION_ROW__": esc(VERSION_ROW_SLICE),
        "__VIEWER_FRAMES__": viewer_frames_json(),
        "__VIEWER_ROWS__": viewer_rows_json(),
        "__DEFAULT_T__": str(int(MARKS[0]["t"])) if MARKS else str(int(METRICS["durationMs"] * 0.5)),
        "__FRAME_W__": str(FRAME_W),
        "__FRAME_H__": str(FRAME_H),
        "__HEAD__": HEAD,
        "__BRANCH__": BRANCH,
        "__TLDRAW__": TLDRAW_VERSION,
        "__APP_VERSION__": APP_VERSION,
        "__NODE__": NODE_VERSION,
        "__PORTS__": esc(PORTS.replace("\n", " · ")),
        "__CLIP_USES__": SRC_CLIPBOARD_USES,
        "__CONSOLE_PATCHES__": SRC_CONSOLE_PATCHES,
    }
    page = TEMPLATE
    for slot, value in values.items():
        page = page.replace(slot, value)
    leftover = [token for token in ("__" + name for name in ["SEAM_SVG", "PACKET", "OPTIONS"]) if token + "__" in page]
    if leftover:
        raise SystemExit(f"unfilled slots: {leftover}")
    OUTPUT.write_text(page, encoding="utf-8")
    print(OUTPUT, f"{OUTPUT.stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
