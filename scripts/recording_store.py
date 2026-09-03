"""Write a flight-recorder capture as a folder an agent can read.

The browser hands over a buffer (header, rows, two store snapshots); Chrome's
screencast, when a sidecar can see the page, hands over frames. This module
turns both into one folder under the workspace:

    ~/SystemSketch/recordings/<local time>-<note>/
        README.md            the packet — prose first, then absolute paths
        header.json          where and when, viewport, camera, channel, counts
        timeline.jsonl       one JSON object per row; `t` is ms since start
        start.snapshot.json  the tldraw store at t=0 (rewound for a retroactive save)
        end.snapshot.json    the tldraw store at save time
        frames/f-<ms>.jpg    Chrome screencast frames named by ms since start
        frames.jsonl         one line per kept frame
        playback.html        the viewer: slow frames, fast lanes, one scrubber

Written the way boards and preview clones are: staged, fsynced, then renamed
into place, so a half-written folder never looks like a recording. Only the
standard library is used, because the Stable channel runs this from an
installed release without the checkout's environment.
"""

from __future__ import annotations

import html
import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
from datetime import UTC, datetime
from pathlib import Path

from workspace_store import DEFAULT_WORKSPACE_DIRNAME

RECORDINGS_DIRNAME = "recordings"
KEEP_LAST_RECORDINGS = 20
KEEP_FRAME_GAP_MS = 300
MAX_ROWS = 200_000
STATE_ID_PATTERN = re.compile(r"\bid\s*=\s*['\"]([a-z][a-z0-9_]*)['\"]")
# `static override id = BLOCK_TOOL_ID` — the id lives in a constant declared elsewhere.
STATE_ID_CONSTANT_USE = re.compile(r"\bid\s*=\s*([A-Z][A-Z0-9_]{2,})\b")
STATE_ID_CONSTANT_DEF = re.compile(r"\b([A-Z][A-Z0-9_]{2,})\s*=\s*['\"]([a-z][a-z0-9_]*)['\"]")
STATE_INDEX_TTL_S = 60.0


class RecordingError(RuntimeError):
    """A recording could not be accepted or written."""


def recordings_dir(files_root: Path) -> Path:
    return files_root.resolve() / DEFAULT_WORKSPACE_DIRNAME / RECORDINGS_DIRNAME


def slugify(text: object, limit: int = 32) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", str(text or "").lower()).strip("-")
    return slug[:limit].rstrip("-")


def recording_stamp(header: dict) -> str:
    started = header.get("startedAt")
    try:
        moment = datetime.fromisoformat(str(started).replace("Z", "+00:00")).astimezone()
    except (TypeError, ValueError):
        moment = datetime.now().astimezone()
    stamp = moment.strftime("%Y-%m-%d_%H-%M-%S")
    slug = slugify(header.get("note")) or str(header.get("mode") or "recording")
    return f"{stamp}-{slug}"


def _require(payload: dict, key: str, kind: type) -> object:
    value = payload.get(key)
    if not isinstance(value, kind):
        raise RecordingError(f"recording payload needs `{key}` as {kind.__name__}")
    return value


def _atomic_bytes(path: Path, content: bytes) -> None:
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as output:
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def _text(path: Path, content: str) -> None:
    _atomic_bytes(path, content.encode("utf-8"))


# --------------------------------------------------------------------------- #
# State → source map
# --------------------------------------------------------------------------- #

_state_index_cache: dict[str, tuple[float, dict[str, list[str]]]] = {}
_state_index_lock = threading.Lock()


def _state_search_roots(source_root: Path) -> list[tuple[Path, tuple[str, ...]]]:
    return [
        (source_root / "src", (".ts", ".tsx")),
        (source_root / "node_modules" / "tldraw" / "dist-esm" / "lib" / "tools", (".mjs",)),
        (source_root / "node_modules" / "@tldraw" / "editor" / "dist-esm" / "lib" / "editor" / "tools", (".mjs",)),
    ]


def state_index(source_root: Path) -> dict[str, list[str]]:
    """Every `id = '<state>'` declaration under the app and tldraw's tools.

    A state id such as `idle` is declared by many tools, so the index keeps
    every file per id and `state_sources` picks by the parent state. Cached for
    a minute per source root: the host is long-lived, and a state id changes
    about as often as a file is renamed.
    """
    key = str(source_root.resolve())
    now = time.monotonic()
    with _state_index_lock:
        cached = _state_index_cache.get(key)
        if cached and now - cached[0] < STATE_INDEX_TTL_S:
            return cached[1]
    index: dict[str, list[str]] = {}
    constant_values: dict[str, str] = {}
    constant_uses: list[tuple[str, str]] = []
    for root, suffixes in _state_search_roots(source_root):
        if not root.is_dir():
            continue
        for path in sorted(root.rglob("*")):
            if not path.is_file() or path.suffix not in suffixes or path.name.endswith((".test.ts", ".test.tsx")):
                continue
            try:
                text = path.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            relative = str(path.relative_to(source_root))
            for match in STATE_ID_PATTERN.finditer(text):
                index.setdefault(match.group(1), []).append(relative)
            for match in STATE_ID_CONSTANT_USE.finditer(text):
                constant_uses.append((match.group(1), relative))
            for match in STATE_ID_CONSTANT_DEF.finditer(text):
                constant_values.setdefault(match.group(1), match.group(2))
    for constant, relative in constant_uses:
        literal = constant_values.get(constant)
        if literal:
            index.setdefault(literal, []).append(relative)
    with _state_index_lock:
        _state_index_cache[key] = (now, index)
    return index


def states_seen(rows: list[dict]) -> list[tuple[str, str | None]]:
    """(state, parent state) pairs in first-seen order, e.g. ('idle', 'select')."""
    seen: list[tuple[str, str | None]] = []
    names: set[str] = set()
    for row in rows:
        if row.get("lane") != "state":
            continue
        for key in ("from", "to"):
            path = row.get(key)
            if not isinstance(path, str):
                continue
            segments = [segment for segment in path.split(".") if segment]
            for position, state in enumerate(segments):
                if state in names:
                    continue
                names.add(state)
                seen.append((state, segments[position - 1] if position else None))
    return seen


def _pick_source(candidates: list[str], parent: str | None) -> str | None:
    if not candidates:
        return None
    # The app's own definition first; then the shallowest file under the parent
    # tool (`select.idle` → SelectTool/childStates/Idle, not Crop's Idle); then
    # tldraw's base tools, which an app tool such as `block` inherits from.
    by_depth = sorted(candidates, key=lambda path: (path.count("/"), path))
    own = [path for path in by_depth if path.startswith("src/")]
    if own:
        return own[0]
    if parent:
        tool = f"/{parent.capitalize()}Tool/"
        in_tool = [path for path in by_depth if tool in path]
        if in_tool:
            return in_tool[0]
    base = [path for path in by_depth if "/@tldraw/editor/" in path]
    if base:
        return base[0]
    return by_depth[0]


def state_sources(rows: list[dict], source_root: Path) -> dict[str, str | None]:
    index = state_index(source_root)
    return {state: _pick_source(index.get(state, []), parent) for state, parent in states_seen(rows)}


# --------------------------------------------------------------------------- #
# The packet
# --------------------------------------------------------------------------- #

def _seconds(ms: object) -> str:
    try:
        return f"{float(ms) / 1000:.2f}"
    except (TypeError, ValueError):
        return "?"


def build_packet(header: dict, rows: list[dict], frames: list[dict], folder: Path, state_map: dict[str, str | None]) -> str:
    duration_s = float(header.get("durationMs") or 0) / 1000
    lanes: dict[str, int] = {}
    inputs: dict[str, int] = {}
    for row in rows:
        lane = str(row.get("lane"))
        lanes[lane] = lanes.get(lane, 0) + 1
        if lane == "input":
            name = str(row.get("name"))
            inputs[name] = inputs.get(name, 0) + 1
    transitions = [row for row in rows if row.get("lane") == "state"]
    console_rows = [row for row in rows if row.get("lane") == "console"]
    errors = [row for row in console_rows if row.get("level") == "error"]
    marks = [row for row in rows if row.get("lane") == "mark" and row.get("text") != "take started"]
    note = str(header.get("note") or "").strip()
    viewport = header.get("viewport") or {}
    mode_label = "the last %s s (retroactive)" % round(float(header.get("windowMs") or 0) / 1000) if header.get("mode") == "last" else "an explicit take"
    frames_source = header.get("framesSource", "none")
    frame_note = {
        "screencast": "Chrome screencast frames: what the window actually showed, UI chrome included, no mouse pointer (the input lane has it).",
        "canvas": "Canvas-only frames: tldraw's shape export at the start and end, no UI chrome — this page had no Chrome debugging port for a screencast.",
        "none": "No frames were captured for this recording; the text lanes carry the interaction.",
    }[frames_source if frames_source in ("screencast", "canvas") else "none"]

    lines: list[str] = []
    lines.append(f"SystemSketch interaction recording — {header.get('startedAt')} · {duration_s:.1f} s · {mode_label}")
    lines.append(f"channel {header.get('channel', 'unknown')} · build {header.get('build', 'unknown')} · {header.get('url', '')}")
    lines.append(
        f"viewport {viewport.get('w', '?')}×{viewport.get('h', '?')} @{header.get('devicePixelRatio', '?')}x · "
        f"state path {header.get('pathAtStart')} → {header.get('pathAtEnd')} · {header.get('shapeCount', '?')} shapes at the end"
    )
    lines.append("")
    if note:
        lines.append("Note from the person recording:")
        lines.append(f"  {note}")
    else:
        lines.append("No note was typed.")
    for mark in marks:
        lines.append(f"  +{_seconds(mark.get('t'))}s  ✎ {mark.get('text')}")
    lines.append("")
    if errors:
        lines.append(f"Errors during the window ({len(errors)}):")
        for row in errors[:12]:
            lines.append(f"  +{_seconds(row.get('t'))}s  {' '.join(str(argument) for argument in row.get('args', []))[:200]}")
        lines.append("")
    lines.append(f"State-chart transitions ({len(transitions)}):")
    for row in transitions[:80]:
        lines.append(f"  +{_seconds(row.get('t')):>7}s  {row.get('from')}  →  {row.get('to')}   ({row.get('trigger')})")
    if len(transitions) > 80:
        lines.append(f"  … {len(transitions) - 80} more in timeline.jsonl")
    lines.append("")
    lines.append(
        f"Totals: {lanes.get('input', 0)} input events ({inputs.get('pointer_move', 0)} moves, {inputs.get('pointer_down', 0)} presses, "
        f"{inputs.get('key_down', 0)} key downs) · {lanes.get('dom', 0)} DOM events · {lanes.get('store', 0)} store diffs · "
        f"{lanes.get('menu', 0)} menu changes · {len(console_rows)} console rows · {len(frames)} frames"
    )
    lines.append("")
    if state_map:
        lines.append("States seen, and the file that defines each:")
        for state, source in state_map.items():
            lines.append(f"  {state:<28} {source or '(not found — a tldraw core state or a typo in the map)'}")
        lines.append("")
    lines.append("Read these files, in this order:")
    lines.append(f"1. {folder / 'README.md'}  — this summary")
    lines.append(
        f"2. {folder / 'timeline.jsonl'}  — every event, one JSON object per line. `t` is ms since the start. Lanes: input (what tldraw's "
        "state chart received), dom (raw keydown/keyup/pointerdown on the window, with the UI element hit), state (state-chart path changes), "
        "menu (open menus), store (record diffs: add/update/remove with the changed keys), console (console calls and uncaught errors), mark (notes)."
    )
    if frames:
        first = frames[1] if len(frames) > 1 else frames[0]
        lines.append(
            f"3. {folder / 'frames'}/  — {len(frames)} screenshots named by ms since the start ({first.get('file', '').split('/')[-1]} = +{_seconds(first.get('t'))} s). "
            "To see what the screen showed after an event at t, open the first frame with a larger number. " + frame_note
        )
    else:
        lines.append(f"3. (no frames) — {frame_note}")
    lines.append(
        f"4. {folder / 'start.snapshot.json'}  — the tldraw store (document + session records) at t=0; "
        f"{folder / 'end.snapshot.json'} is the store at save time. `editor.store.loadStoreSnapshot(start)` then replaying the store lane reproduces every instant."
    )
    lines.append(f"5. {folder / 'playback.html'}  — open in a browser: slow frames, fast lanes, one scrubber; #t=<ms> deep-links a moment.")
    lines.append("")
    lines.append(f"Recorder cost inside the page: {header.get('recorderCostMs', '?')} ms over {_seconds(header.get('recorderUptimeMs'))} s of uptime.")
    lines.append("")
    return "\n".join(lines)


# --------------------------------------------------------------------------- #
# The viewer
# --------------------------------------------------------------------------- #

PLAYBACK_TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>__TITLE__</title>
<style>
  :root{--ink:#14171a;--muted:#626a73;--line:#dfe3e7;--paper:#f6f7f8;--card:#fff;--blue:#315be8;--red:#c4392c}
  *{box-sizing:border-box}
  body{margin:0;background:var(--paper);color:var(--ink);font:14px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}
  main{width:min(1400px,calc(100% - 24px));margin:auto;padding:18px 0 40px}
  h1{margin:0 0 4px;font-size:20px;letter-spacing:-.02em}
  .meta{margin:0 0 12px;color:var(--muted);font-size:12.5px}
  .meta code{background:#eceff2;padding:.1em .3em;border-radius:4px;font:12px ui-monospace,monospace}
  .viewer{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:12px;border:1px solid var(--line);border-radius:14px;background:var(--card);padding:12px}
  @media(max-width:900px){.viewer{grid-template-columns:1fr}}
  .screen{position:relative;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:#eee;aspect-ratio:__ASPECT__}
  .screen img{display:block;width:100%;height:100%;object-fit:contain;background:#fff}
  .screen .empty{position:absolute;inset:0;display:grid;place-items:center;color:var(--muted);font-size:13px}
  .screen .empty[hidden]{display:none}
  .cursor{position:absolute;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;border:2px solid #fff;background:var(--blue);box-shadow:0 0 0 3px #315be866;pointer-events:none;transition:left .05s,top .05s}
  .cursor.down{background:var(--red);box-shadow:0 0 0 6px #c4392c55}
  .log{height:100%;max-height:62vh;overflow:auto;border:1px solid var(--line);border-radius:8px;background:#0f1216;padding:8px 10px;font:11.5px/1.55 ui-monospace,monospace;color:#cfd7e6}
  .log div{white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
  .log div.now{background:#ffffff14}
  .log .t{color:#7d8794;display:inline-block;width:66px}
  .log .lane{display:inline-block;width:56px;font-weight:700}
  .controls{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:10px;align-items:center;font:12.5px ui-monospace,monospace}
  .controls input[type=range]{flex:1;min-width:200px}
  .controls button{padding:5px 11px;border:1px solid var(--line);border-radius:7px;background:#fafbfc;font:700 12px ui-monospace,monospace;cursor:pointer}
  .lanes{display:flex;flex-wrap:wrap;gap:6px}
  .lanes label{display:inline-flex;gap:4px;align-items:center;padding:2px 8px;border:1px solid var(--line);border-radius:999px;font:700 11px ui-monospace,monospace;cursor:pointer}
  .frames{display:flex;gap:4px;overflow-x:auto;grid-column:1/-1;padding-top:4px}
  .frames img{height:54px;border:2px solid transparent;border-radius:4px;cursor:pointer}
  .frames img.on{border-color:var(--blue)}
  pre{margin:14px 0 0;padding:12px;border:1px solid var(--line);border-radius:10px;background:#fbfcfd;font:12px/1.55 ui-monospace,monospace;white-space:pre-wrap}
</style>
</head>
<body><main>
<h1>__TITLE__</h1>
<p class="meta">__META__</p>
<div class="viewer">
  <div class="screen" id="screen"><img id="frame" alt="recorded frame"><div class="empty" id="empty" hidden>no frame yet</div><div class="cursor" id="cursor"></div></div>
  <div class="log" id="log"></div>
  <div class="controls">
    <button id="play">▶ play</button>
    <input type="range" id="scrub" min="0" max="__DUR__" value="0" step="10">
    <span id="tlabel" style="min-width:80px">0 ms</span>
    <span class="lanes" id="lanes"></span>
  </div>
  <div class="frames" id="strip"></div>
</div>
<pre id="packet">__PACKET__</pre>
<script>
(() => {
  const frames = __FRAMES__;
  const rows = __ROWS__;
  const dur = __DUR__;
  const FW = __FW__, FH = __FH__;
  const colours = { input: '#7aa2ff', dom: '#9fd0ff', state: '#75d39b', store: '#c39bff', menu: '#f2b46b', console: '#f28b7d', mark: '#ff9ad5' };
  const img = document.getElementById('frame'), empty = document.getElementById('empty'), cursor = document.getElementById('cursor');
  const log = document.getElementById('log'), scrub = document.getElementById('scrub'), tlabel = document.getElementById('tlabel');
  const screen = document.getElementById('screen'), play = document.getElementById('play'), strip = document.getElementById('strip'), lanesBox = document.getElementById('lanes');
  const hidden = new Set();
  for (const lane of Object.keys(colours)) {
    const label = document.createElement('label');
    label.innerHTML = `<input type="checkbox" checked data-lane="${lane}"><span style="color:${colours[lane]}">${lane}</span>`;
    label.querySelector('input').addEventListener('change', (e) => { e.target.checked ? hidden.delete(lane) : hidden.add(lane); rebuild(+scrub.value); });
    lanesBox.appendChild(label);
  }
  frames.forEach((f, i) => { const th = document.createElement('img'); th.src = f.file; th.title = '+' + (f.t / 1000).toFixed(2) + ' s'; th.addEventListener('click', () => { pause(); scrub.value = f.t; seek(f.t); }); strip.appendChild(th); f.el = th; });
  const text = (r) => {
    if (r.lane === 'input') return r.name + (r.screen ? ' ' + JSON.stringify(r.screen) : '') + (r.key ? ' ' + r.key : '') + (r.shape ? ' on ' + r.shape.type : '') + (r.target ? ' @' + r.target : '');
    if (r.lane === 'dom') return r.event + (r.key ? ' ' + r.key : '') + (r.screen ? ' ' + JSON.stringify(r.screen) : '') + ' on ' + (r.on || '');
    if (r.lane === 'state') return r.from + ' → ' + r.to + '  (' + r.trigger + ')';
    if (r.lane === 'store') return (r.ops || []).map((o) => o.op + ' ' + o.type + (o.delta ? ' ' + JSON.stringify(Object.keys(o.delta)) : '')).join(', ');
    if (r.lane === 'menu') return 'open: ' + ((r.open || []).join(', ') || '(none)');
    if (r.lane === 'mark') return '✎ ' + r.text;
    if (r.lane === 'console') return r.level + ': ' + (r.args || []).join(' ');
    return JSON.stringify(r);
  };
  let shown = -1, rendered = 0, lines = [];
  function rebuild(t) { log.innerHTML = ''; rendered = 0; lines = []; shown = -1; render(t); }
  function render(t) {
    let fi = -1;
    for (let i = 0; i < frames.length; i++) if (frames[i].t <= t) fi = i;
    if (fi !== shown) {
      shown = fi;
      if (fi >= 0) { img.src = frames[fi].file; img.hidden = false; empty.hidden = true; } else { img.removeAttribute('src'); empty.hidden = false; }
      frames.forEach((f, i) => f.el.classList.toggle('on', i === fi));
      if (fi >= 0) frames[fi].el.scrollIntoView({ inline: 'center', block: 'nearest' });
    }
    while (rendered < rows.length && rows[rendered].t <= t) {
      const r = rows[rendered];
      if (!hidden.has(r.lane)) {
        const div = document.createElement('div');
        div.innerHTML = `<span class="t">+${(r.t / 1000).toFixed(2)}s</span><span class="lane" style="color:${colours[r.lane] || '#fff'}">${r.lane}</span>${text(r).replace(/</g, '&lt;')}`;
        log.appendChild(div); lines.push(div);
      }
      rendered++;
    }
    let last = null;
    for (let i = rendered - 1; i >= 0; i--) { const r = rows[i]; if ((r.lane === 'input' || r.lane === 'dom') && r.screen) { last = r; break; } }
    if (last) {
      const rect = screen.getBoundingClientRect();
      const scale = Math.min(rect.width / FW, rect.height / FH);
      const ox = (rect.width - FW * scale) / 2, oy = (rect.height - FH * scale) / 2;
      cursor.style.left = (ox + last.screen[0] * scale) + 'px'; cursor.style.top = (oy + last.screen[1] * scale) + 'px';
      cursor.classList.toggle('down', /pointer_down|pointerdown|pointer_move/.test(last.name || last.event || '') && !/pointer_up/.test(last.name || ''));
    }
    log.scrollTop = log.scrollHeight;
    tlabel.textContent = Math.round(t) + ' ms';
  }
  function seek(t) { if (t < (rows[rendered - 1]?.t ?? -1)) rebuild(t); else render(t); }
  let playing = false, startedAt = 0, startT = 0;
  function pause() { playing = false; play.textContent = '▶ play'; }
  function tick(now) { if (!playing) return; const t = Math.min(dur, startT + (now - startedAt)); scrub.value = t; seek(t); if (t >= dur) { pause(); play.textContent = '▶ replay'; return; } requestAnimationFrame(tick); }
  play.addEventListener('click', () => { if (playing) return pause(); startT = +scrub.value >= dur ? 0 : +scrub.value; startedAt = performance.now(); playing = true; play.textContent = '❚❚ pause'; requestAnimationFrame(tick); });
  scrub.addEventListener('input', () => { pause(); seek(+scrub.value); });
  const wanted = Number((location.hash.match(/t=(\\d+)/) || [])[1]);
  const start = Number.isFinite(wanted) && wanted > 0 ? Math.min(dur, wanted) : 0;
  scrub.value = start; seek(start);
})();
</script>
</main></body>
</html>
"""


def playback_html(header: dict, rows: list[dict], frames: list[dict], packet: str) -> str:
    viewport = header.get("viewport") or {}
    width = int(viewport.get("w") or 1440)
    height = int(viewport.get("h") or 960)
    title = f"Recording {header.get('startedAt', '')} · {header.get('channel', '')}"
    meta = (
        f"{_seconds(header.get('durationMs'))} s · {len(rows)} rows · {len(frames)} frames ({header.get('framesSource', 'none')}) · "
        f"{header.get('pathAtStart')} → {header.get('pathAtEnd')} · <code>{html.escape(str(header.get('url', '')))}</code>"
    )
    slim_frames = [{"t": frame["t"], "file": frame["file"]} for frame in frames]
    page = PLAYBACK_TEMPLATE
    for slot, value in {
        "__TITLE__": html.escape(title),
        "__META__": meta,
        "__ASPECT__": f"{width}/{height}",
        "__DUR__": str(int(float(header.get("durationMs") or 0))),
        "__FW__": str(width),
        "__FH__": str(height),
        "__FRAMES__": json.dumps(slim_frames),
        "__ROWS__": json.dumps(rows),
        "__PACKET__": html.escape(packet),
    }.items():
        page = page.replace(slot, value)
    return page


# --------------------------------------------------------------------------- #
# Writing and listing
# --------------------------------------------------------------------------- #

def _unique_destination(root: Path, stamp: str) -> Path:
    destination = root / stamp
    counter = 2
    while destination.exists():
        destination = root / f"{stamp}-{counter}"
        counter += 1
    return destination


def write_recording(
    payload: dict,
    files_root: Path,
    *,
    source_root: Path,
    channel: str,
    build: str,
    version: str,
    frame_dump=None,
) -> dict:
    """Write one recording folder. `frame_dump(frames_dir, header)` may add screencast frames."""
    header = dict(_require(payload, "header", dict))
    rows = _require(payload, "rows", list)
    start_snapshot = _require(payload, "startSnapshot", dict)
    end_snapshot = _require(payload, "endSnapshot", dict)
    if len(rows) > MAX_ROWS:
        raise RecordingError(f"recording holds {len(rows)} rows; the cap is {MAX_ROWS}")
    rows = [row for row in rows if isinstance(row, dict)]

    root = recordings_dir(files_root)
    root.mkdir(parents=True, exist_ok=True)
    stamp = recording_stamp(header)
    staging = Path(tempfile.mkdtemp(prefix=".staging-", dir=root))
    try:
        frames_dir = staging / "frames"
        frames_dir.mkdir()
        frames: list[dict] = []
        frames_source = "none"
        if frame_dump is not None:
            dumped = frame_dump(frames_dir, header)
            if isinstance(dumped, dict) and dumped.get("frames"):
                frames = [dict(frame) for frame in dumped["frames"]]
                frames_source = "screencast"
        canvas_frames = payload.get("canvasFrames")
        if not frames and isinstance(canvas_frames, list):
            import base64

            for frame in canvas_frames:
                if not isinstance(frame, dict) or not isinstance(frame.get("png"), str):
                    continue
                t = int(float(frame.get("t") or 0))
                name = f"f-{t:06d}.png"
                content = base64.b64decode(frame["png"])
                (frames_dir / name).write_bytes(content)
                frames.append({"t": t, "bytes": len(content), "file": f"frames/{name}"})
            if frames:
                frames_source = "canvas"
        frames.sort(key=lambda frame: frame["t"])

        header.update({
            "channel": channel,
            "build": build,
            "version": version,
            "framesSource": frames_source,
            "frames": len(frames),
            "savedAt": datetime.now(UTC).isoformat(),
        })
        state_map = state_sources(rows, source_root)
        destination = _unique_destination(root, stamp)
        packet = build_packet(header, rows, frames, destination, state_map)

        _text(staging / "header.json", json.dumps(header, ensure_ascii=False, indent=2) + "\n")
        _text(staging / "timeline.jsonl", "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows))
        _text(staging / "start.snapshot.json", json.dumps(start_snapshot, ensure_ascii=False))
        _text(staging / "end.snapshot.json", json.dumps(end_snapshot, ensure_ascii=False))
        _text(staging / "frames.jsonl", "".join(json.dumps(frame, ensure_ascii=False) + "\n" for frame in frames))
        _text(staging / "states.json", json.dumps(state_map, ensure_ascii=False, indent=2) + "\n")
        _text(staging / "README.md", packet)
        _text(staging / "playback.html", playback_html(header, rows, frames, packet))
        os.replace(staging, destination)
    except Exception:
        shutil.rmtree(staging, ignore_errors=True)
        raise
    removed = prune_recordings(root, KEEP_LAST_RECORDINGS)
    return {
        "path": str(destination),
        "packet": packet,
        "savedAt": header["savedAt"],
        "frames": len(frames),
        "framesSource": frames_source,
        "pruned": removed,
    }


def _recording_dirs(root: Path) -> list[Path]:
    if not root.is_dir():
        return []
    return sorted(
        (path for path in root.iterdir() if path.is_dir() and not path.name.startswith(".") and (path / "header.json").is_file()),
        key=lambda path: path.name,
    )


def prune_recordings(root: Path, keep: int) -> list[str]:
    """Keep the newest `keep` recordings; the folder is a buffer, not an archive."""
    removed: list[str] = []
    dirs = _recording_dirs(root)
    for path in dirs[: max(0, len(dirs) - keep)]:
        shutil.rmtree(path, ignore_errors=True)
        removed.append(str(path))
    return removed


def last_recording(files_root: Path) -> dict | None:
    dirs = _recording_dirs(recordings_dir(files_root))
    for path in reversed(dirs):
        readme = path / "README.md"
        if not readme.is_file():
            continue
        try:
            header = json.loads((path / "header.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            header = {}
        return {
            "path": str(path),
            "packet": readme.read_text(encoding="utf-8"),
            "savedAt": header.get("savedAt"),
            "frames": header.get("frames", 0),
            "framesSource": header.get("framesSource", "none"),
        }
    return None


# --------------------------------------------------------------------------- #
# The frame sidecar, seen from the host
# --------------------------------------------------------------------------- #

class FrameSidecar:
    """Owns `recorder_frames.mjs`: one Node process per host, started lazily.

    The protocol is one JSON object per line each way. The sidecar attaches to
    every page of the channel's Chrome over its debugging port, keeps a ring of
    screencast frames per page while armed, and writes the slice a save asks
    for straight into the recording's staging folder.
    """

    def __init__(self, script: Path, *, cdp_port: int | None, window_ms: int = 60_000, node: str | None = None):
        self.script = script
        self.cdp_port = cdp_port
        self.window_ms = window_ms
        self.node = node or shutil.which("node")
        self.url_prefix: str | None = None
        self.process: subprocess.Popen | None = None
        self.armed = False
        self._lock = threading.Lock()
        self._sequence = 0

    def availability(self) -> tuple[bool, str]:
        if self.cdp_port is None:
            return False, "this channel's Chrome was started without a debugging port; relaunch it to get screencast frames"
        if not self.node or not (Path(self.node).is_file() or shutil.which(self.node)):
            return False, "node is not installed, so the screencast sidecar cannot run"
        if not self.script.is_file():
            return False, f"{self.script.name} is missing beside the host"
        return True, "Chrome screencast over the debugging port"

    def _alive(self) -> bool:
        return self.process is not None and self.process.poll() is None

    def _start(self) -> None:
        assert self.node and self.url_prefix
        self.process = subprocess.Popen(
            [
                self.node,
                str(self.script),
                "--cdp-port", str(self.cdp_port),
                "--url-prefix", self.url_prefix,
                "--window-ms", str(self.window_ms),
            ],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            bufsize=1,
            close_fds=True,
        )

    def _request(self, message: dict, timeout: float = 20.0) -> dict:
        with self._lock:
            if not self._alive():
                self._start()
            assert self.process and self.process.stdin and self.process.stdout
            self._sequence += 1
            message = {"id": self._sequence, **message}
            self.process.stdin.write(json.dumps(message) + "\n")
            self.process.stdin.flush()
            deadline = time.monotonic() + timeout
            while time.monotonic() < deadline:
                line = self.process.stdout.readline()
                if not line:
                    raise RecordingError("the screencast sidecar exited")
                try:
                    reply = json.loads(line)
                except ValueError:
                    continue
                if reply.get("id") == message["id"]:
                    return reply
            raise RecordingError("the screencast sidecar did not answer in time")

    def arm(self, enabled: bool, page_url: str) -> dict:
        ok, reason = self.availability()
        if not ok:
            return {"screencast": False, "reason": reason}
        prefix = page_url.split("?", 1)[0]
        origin_end = prefix.find("/", prefix.find("//") + 2)
        self.url_prefix = prefix[: origin_end + 1] if origin_end > 0 else prefix
        if not enabled and not self._alive():
            self.armed = False
            return {"screencast": True, "reason": reason, "armed": False}
        try:
            reply = self._request({"op": "arm", "enabled": enabled})
        except (RecordingError, OSError) as cause:
            return {"screencast": False, "reason": f"screencast sidecar failed: {cause}"}
        self.armed = enabled
        if not reply.get("ok"):
            return {"screencast": False, "reason": str(reply.get("error", "sidecar refused to arm"))}
        return {"screencast": True, "reason": reason, "armed": enabled, "targets": reply.get("targets", 0)}

    def status(self) -> dict:
        ok, reason = self.availability()
        payload = {"screencast": ok, "reason": reason, "armed": self.armed}
        if ok and self._alive():
            try:
                payload["sidecar"] = self._request({"op": "status"}, timeout=5.0)
            except (RecordingError, OSError) as cause:
                payload["sidecar"] = {"error": str(cause)}
        return payload

    def dump(self, frames_dir: Path, header: dict, *, keep_gap_ms: int = KEEP_FRAME_GAP_MS) -> dict | None:
        ok, _reason = self.availability()
        if not ok or not self._alive() or not self.armed:
            return None
        try:
            reply = self._request({
                "op": "dump",
                "dir": str(frames_dir),
                "fromWall": header.get("startedAtWall"),
                "toWall": header.get("endedAtWall"),
                "keepGapMs": keep_gap_ms,
                "url": header.get("url", ""),
            }, timeout=30.0)
        except (RecordingError, OSError):
            return None
        return reply if reply.get("ok") else None

    def stop(self) -> None:
        with self._lock:
            if self.process is not None and self.process.poll() is None:
                try:
                    if self.process.stdin:
                        self.process.stdin.close()
                    self.process.wait(timeout=3)
                except (OSError, subprocess.TimeoutExpired):
                    self.process.kill()
            self.process = None
            self.armed = False
