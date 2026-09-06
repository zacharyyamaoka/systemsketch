#!/usr/bin/env python3
"""Build the Behavior Tree runtime-visualization proposal report and its lab.

Outputs (self-contained, data-URI assets, per docs/ convention):
  docs/bt-runtime-lab-2026-09-05.html                        the clickable mock-backend lab
  docs/behavior-tree-runtime-viz-proposal-2026-09-05.html    the three-proposal report

The lab animates runtime status on REAL SystemSketch chrome: node cards are the
editor's own render (docs/labs/capture_bt_runtime_lab.mjs exports them through
`editor.toImage`), and the connective tissue (wires, rails, Start, groups,
chips) is replayed from a verbatim dump of the live DOM's painted SVG layer —
same `d` strings, same region-local coordinates, same ink values as
src/behaviorTree/behavior-tree.css. (The region's own `toSvg` currently drops
that layer from exports — a separate bug, flagged — so the dump is the
faithful source.)

Facts quoted by the report (watch interval, endpoints, identity scheme) are
measured from the live tree at build time, never hardcoded.
"""
from __future__ import annotations

import base64
import json
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

DOCS = Path(__file__).resolve().parent
ROOT = DOCS.parent
ASSETS = DOCS / 'assets' / 'behavior-tree-runtime'
BT_ASSETS = DOCS / 'assets' / 'behavior-tree'
STAMP = '2026-09-05'
LAB_PATH = DOCS / f'bt-runtime-lab-{STAMP}.html'
REPORT_PATH = DOCS / f'behavior-tree-runtime-viz-proposal-{STAMP}.html'


# --------------------------------------------------------------------------
# Measured-at-build-time facts from the live repo
# --------------------------------------------------------------------------

def measure_repo_facts() -> dict:
    local_workspace = (ROOT / 'src/workspace/LocalWorkspace.tsx').read_text()
    watch_ms = re.search(r'const WATCH_INTERVAL_MS = (\d+)', local_workspace)
    server = (ROOT / 'scripts/server.py').read_text()
    endpoints = sorted(set(re.findall(r'"(/api/[a-z-]+(?:/[a-z-]+)*)"', server)))
    model = (ROOT / 'src/behaviorTree/behaviorTreeModel.ts').read_text()
    xml_doc = re.search(r'/\*\* The canonical BT.CPP v4 document[^*]*\*/', model)
    btcpp = (ROOT / 'src/behaviorTree/btcppXml.ts').read_text()
    path_doc = re.search(r'/\*\* `0` is the root; `0\.2\.1`[^\n]*', btcpp)
    recorder = (ROOT / 'src/recorder/recorderStore.ts').read_text()
    git_head = subprocess.run(['git', 'rev-parse', '--short', 'HEAD'], cwd=ROOT,
                              capture_output=True, text=True).stdout.strip()
    vitest_files = len(list((ROOT / 'src').rglob('*.test.ts*')))
    return {
        'watch_interval_ms': int(watch_ms.group(1)) if watch_ms else None,
        'api_endpoints': endpoints,
        'xml_prop_doc': (xml_doc.group(0) if xml_doc else '').strip('/* '),
        'path_doc': (path_doc.group(0) if path_doc else '').strip('/* '),
        'recorder_uses_external_store': 'useSyncExternalStore' in recorder,
        'git_head': git_head,
        'vitest_files': vitest_files,
        'bt_meta_keys': re.findall(r"export const BT_META_\w+ = '(\w+)'", model),
    }


# --------------------------------------------------------------------------
# Geometry: map painted edges to the node they enter / leave
# --------------------------------------------------------------------------

def parse_polyline(d: str) -> list[tuple[float, float]]:
    numbers = [float(value) for value in re.findall(r'-?\d+(?:\.\d+)?', d)]
    return [(numbers[i], numbers[i + 1]) for i in range(0, len(numbers) - 1, 2)]


def map_edges(view: dict) -> None:
    """Stamp each dumped edge with the btPath of the node it enters/leaves."""
    nodes = view['children']
    start = view['layer'].get('start')

    def owner_of(point: tuple[float, float], edge_face: str) -> str | None:
        x, y = point
        for node in nodes:
            near_x = node['x'] - 24 <= x <= node['x'] + node['w'] + 24
            top = abs(y - node['y']) <= 14
            bottom = abs(y - (node['y'] + node['h'])) <= 14
            side = (abs(x - node['x']) <= 14 or abs(x - (node['x'] + node['w'])) <= 14) \
                and node['y'] - 8 <= y <= node['y'] + node['h'] + 8
            near_y = node['y'] - 24 <= y <= node['y'] + node['h'] + 24
            if edge_face == 'into' and near_x and (top or side):
                return node['path']
            if edge_face == 'from' and ((near_x and (bottom or side)) or (side and near_y)):
                return node['path']
        if start and edge_face == 'from' \
                and start['x'] - 20 <= x <= start['x'] + start['w'] + 20 \
                and abs(y - (start['y'] + start['h'])) <= 14:
            return '@start'
        return None

    for edge in view['layer']['edges']:
        points = parse_polyline(edge['d'])
        if not points:
            edge['from'] = edge['to'] = None
            continue
        edge['from'] = owner_of(points[0], 'from')
        edge['to'] = owner_of(points[-1], 'into')


# --------------------------------------------------------------------------
# The lab page
# --------------------------------------------------------------------------

def data_uri(path: Path, mime: str = 'image/png') -> str:
    return f'data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}'


def build_lab(geometry: dict, facts: dict) -> str:
    for view in geometry['views']:
        map_edges(view)
    payload = {
        'generatedAt': geometry['generatedAt'],
        'gitHead': facts['git_head'],
        'xml': geometry['xml'],
        'views': [
            {
                'name': view['name'],
                'region': view['region'],
                'children': view['children'],
                'layer': view['layer'],
                'image': data_uri(ASSETS / f"{view['name']}.png"),
            }
            for view in geometry['views']
        ],
    }
    html = LAB_TEMPLATE.replace('__PAYLOAD__', json.dumps(payload))
    html = html.replace('__STAMP__', STAMP).replace('__GIT_HEAD__', facts['git_head'])
    return html


# The lab page's markup + script live beside the capture/shoot scripts so the
# visual language can be edited without scrolling a 700-line Python literal.
LAB_TEMPLATE = (DOCS / 'labs' / 'bt_runtime_lab_template.html').read_text()


# --------------------------------------------------------------------------
# The report
# --------------------------------------------------------------------------

def crop(source: Path, box: tuple[int, int, int, int], scale: float = 1.0) -> str:
    """Crop a committed capture and return it as a data URI (build output only)."""
    from PIL import Image
    image = Image.open(source).convert('RGB').crop(box)
    if scale != 1.0:
        image = image.resize((round(image.width * scale), round(image.height * scale)), Image.LANCZOS)
    out = ASSETS / f'crop-{source.stem}-{box[0]}x{box[1]}.png'
    image.save(out)
    return data_uri(out)


def shrink(source: Path, width: int) -> str:
    from PIL import Image
    image = Image.open(source).convert('RGB')
    if image.width > width:
        image = image.resize((width, round(image.height * width / image.width)), Image.LANCZOS)
    out = ASSETS / f'crop-{source.stem}-w{width}.png'
    image.save(out)
    return data_uri(out)


def wrap_sub(sub: str, limit: int = 30) -> list[str]:
    """At most two subtitle lines; the second takes whatever remains."""
    if not sub:
        return []
    if len(sub) <= limit:
        return [sub]
    words = sub.split(' ')
    first = ''
    while words and len(f'{first} {words[0]}'.strip()) <= limit:
        first = f'{first} {words.pop(0)}'.strip()
    if not first:
        first = words.pop(0)
    return [first, ' '.join(words)] if words else [first]


def contract_diagram(title: str, lanes: list[tuple[str, str, str]], note: str) -> str:
    """A small boxes-and-arrows SVG: producer -> transport -> store -> paint.

    Boxes size themselves to their text so nothing clips; subtitles wrap to
    two lines.
    """
    boxes = ''
    arrows = ''
    x = 8
    y = 24
    height = 72
    for index, (label, sub, tone) in enumerate(lanes):
        sub_lines = wrap_sub(sub)
        width = max(150.0, len(label) * 7.6 + 26, *(len(line) * 5.9 + 22 for line in sub_lines or ['']))
        width = min(width, 330.0)
        fill = {'code': '#eef2ff', 'file': '#fff7ed', 'live': '#ecfdf5', 'ui': '#fafafa'}.get(tone, '#fafafa')
        boxes += (
            f'<rect x="{x:.0f}" y="{y}" width="{width:.0f}" height="{height}" rx="9" fill="{fill}" stroke="#a1a1aa"/>'
            f'<text x="{x + width / 2:.0f}" y="{y + 25}" text-anchor="middle" font-size="13.5" font-weight="600" fill="#27272a">{label}</text>'
        )
        for line_index, line in enumerate(sub_lines):
            boxes += (
                f'<text x="{x + width / 2:.0f}" y="{y + 43 + line_index * 15}" text-anchor="middle" '
                f'font-size="11.5" fill="#71717a">{line}</text>'
            )
        if index < len(lanes) - 1:
            boxes_end = x + width
            arrows += (
                f'<path d="M {boxes_end + 2:.0f} {y + height / 2} h 22" stroke="#3f3f46" stroke-width="2" fill="none"/>'
                f'<path d="M {boxes_end + 26:.0f} {y + height / 2} l -7 -4.5 v 9 z" fill="#3f3f46"/>'
            )
        x += width + 28
    total = x - 20
    title_text = (f'<text x="8" y="14" font-size="12" font-weight="700" letter-spacing=".05em" '
                  f'fill="#71717a">{title}</text>') if title else ''
    return (
        f'<svg viewBox="0 0 {total:.0f} 132" style="width:100%;max-width:{total:.0f}px" xmlns="http://www.w3.org/2000/svg">'
        f'{title_text}{boxes}{arrows}'
        f'<text x="8" y="122" font-size="12" fill="#52525b">{note}</text>'
        '</svg>'
    )


def build_report(geometry: dict, facts: dict) -> str:
    shoot = json.loads((ASSETS / 'lab-shoot.json').read_text()) if (ASSETS / 'lab-shoot.json').exists() else {}
    tree_view = next(view for view in geometry['views'] if view['name'] == 'tree')
    process_view = next(view for view in geometry['views'] if view['name'] == 'process')
    flowstate = BT_ASSETS / 'reference-flowstate-15m04.png'

    images = {
        'fs_execute_on': crop(flowstate, (495, 0, 800, 26), 2.4),
        'fs_transport': crop(flowstate, (575, 48, 700, 76), 3.0),
        'fs_caption': crop(flowstate, (0, 26, 215, 48), 2.4),
        'lab_running': shrink(ASSETS / 'lab-running.png', 1360),
        'lab_recovery_close': crop(ASSETS / 'lab-recovery.png', (884, 108, 1396, 440), 1.35),
        'lab_deep_close': crop(ASSETS / 'lab-deep-path.png', (14, 100, 832, 578), 1.5),
        'lab_resolved': shrink(ASSETS / 'lab-resolved.png', 1360),
        'lab_process_running': shrink(ASSETS / 'lab-process-running.png', 1360),
        'lab_process': shrink(ASSETS / 'lab-process.png', 1360),
        'lab_motion_a': data_uri(ASSETS / 'lab-motion-a.png'),
        'lab_motion_b': data_uri(ASSETS / 'lab-motion-b.png'),
        'lab_transitions': data_uri(ASSETS / 'lab-transitions.png'),
    }

    endpoints = ' '.join(f'<code>{endpoint}</code>' for endpoint in facts['api_endpoints'])
    diagram_p1 = contract_diagram(
        '',
        [('py_trees runner', 'post-tick handler, ~15 lines', 'code'),
         ('board.run.json · a sibling file', 'atomic replace, ≤10 Hz — never the XML', 'file'),
         ('stat poll', "the document watcher's pattern", 'live'),
         ('runtime store → overlay', 'keyed by btPath', 'ui')],
        'Zero new transport. Latency = poll interval. The canonical XML is never the carrier.')
    diagram_p2 = contract_diagram(
        '',
        [('py_trees runner', 'POSTs tick batches (~20 lines)', 'code'),
         ('server.py · /api/bt/run/*', 'ring of snapshots + transitions', 'live'),
         ('GET latest?since=', 'change-gated · SSE later', 'live'),
         ('runtime store → overlay', 'same store, same overlay', 'ui')],
        'Groot2&#8217;s architecture in this app&#8217;s idiom: structure once, status polled, trace kept — XML untouched.')
    diagram_p3 = contract_diagram(
        '',
        [('any runner', 'appends transition lines', 'code'),
         ('runs/&lt;stamp&gt;.btrace.jsonl', 'append-only · the .btlog shape', 'file'),
         ('load whole, or tail it', 'live = cursor at the tail', 'live'),
         ('fold → frames → overlay', 'scrubbing is free', 'ui')],
        'Replay is the primary object; &#8220;live&#8221; is tailing. Strongest for walking runs, weakest for latency.')

    layers = contract_diagram(
        "ZACH'S THREE LAYERS, MAPPED",
        [('3 · backend / driver', 'real runner or mock', 'code'),
         ('1 · the state model', 'RunSnapshot · btPath + xmlDigest', 'live'),
         ('2 · rendering', 'canvas overlay · “just React”', 'ui')],
        'The contract decision is layer 1 + the arrow into it. Layers 2 and 3 never see the transport.')

    facts_bits = {
        'watch': facts['watch_interval_ms'],
        'head': facts['git_head'],
        'meta': ', '.join(f'<code>{key}</code>' for key in facts['bt_meta_keys']),
        'tree_children': len(tree_view['children']),
        'process_children': len(process_view['children']),
        'seed': shoot.get('seed', '—'),
        'run_ticks': shoot.get('finished', {}).get('frames', 1) - 1,
        'run_frames': shoot.get('finished', {}).get('frames', 1),
        'run_transitions': shoot.get('finished', {}).get('transitions', '—'),
        'run_outcome': (shoot.get('finished', {}).get('outcome') or '—').upper(),
        'deep_seed': shoot.get('deepSeed', '—'),
        'deep_tick': shoot.get('deepTick', '—'),
        'deep_depth': max((len(str(path).split('.')) for path in shoot.get('deepRunning') or ['0']), default=1),
    }

    body = REPORT_TEMPLATE
    for key, value in {**images, **{f'fact_{name}': str(value) for name, value in facts_bits.items()},
                       'diagram_p1': diagram_p1, 'diagram_p2': diagram_p2, 'diagram_p3': diagram_p3,
                       'diagram_layers': layers, 'endpoints': endpoints,
                       'lab_href': LAB_PATH.name, 'lab_abs': str(LAB_PATH), 'stamp': STAMP}.items():
        body = body.replace(f'@{key}@', value)
    return body


REPORT_TEMPLATE = r'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Behavior Tree live runtime visualization — three proposals</title>
<style>
  :root { --ink:#27272a; --soft:#3f3f46; --muted:#71717a; --faint:#a1a1aa; --border:#d4d4d8;
          --surface:#fff; --sunken:#f4f4f5; --accent:#6d5be6; --good:#16a34a; --bad:#dc2626; --run:#2f6fe4; }
  * { box-sizing: border-box; }
  body { margin:0; font:15px/1.55 Inter, ui-sans-serif, system-ui; color:var(--ink); background:#fbfbfa; }
  main { max-width: 1020px; margin: 0 auto; padding: 34px 26px 90px; }
  h1 { font-size: 27px; line-height:1.2; margin: 0 0 6px; }
  .dek { color: var(--muted); font-size: 15px; margin-bottom: 8px; }
  .stampline { color: var(--faint); font-size: 12.5px; }
  h2 { font-size: 19px; margin: 44px 0 10px; padding-top: 18px; border-top: 1px solid var(--border); }
  h2 .n { color: var(--faint); font-weight: 600; margin-right: 8px; }
  h3 { font-size: 15px; margin: 22px 0 6px; }
  p { margin: 8px 0; }
  code { font: 12.8px ui-monospace, monospace; background: var(--sunken); border-radius: 4px; padding: 1px 5px; }
  pre { background: #18181b; color: #e4e4e7; border-radius: 10px; padding: 14px 16px; overflow-x: auto;
        font: 12.5px/1.55 ui-monospace, monospace; }
  pre code { background: none; color: inherit; padding: 0; }
  figure { margin: 14px 0; }
  figure img { max-width: 100%; border: 1px solid var(--border); border-radius: 10px; display: block; }
  figure.bare img { border: none; }
  figcaption { font-size: 12.5px; color: var(--muted); margin-top: 6px; }
  .row { display: flex; gap: 14px; flex-wrap: wrap; align-items: flex-start; }
  .row > figure { flex: 1 1 240px; margin: 8px 0; }
  .card { border: 1px solid var(--border); border-radius: 12px; background: var(--surface); padding: 16px 18px; margin: 14px 0; }
  .card.rec { border-color: var(--good); box-shadow: 0 0 0 1px var(--good); }
  .tag { display:inline-block; font: 700 10.5px/18px Inter; letter-spacing:.06em; text-transform: uppercase;
         border-radius: 5px; padding: 0 7px; margin-left: 8px; vertical-align: 2px; }
  .tag.rec { background: rgba(22,163,74,.12); color: var(--good); }
  .tag.alt { background: var(--sunken); color: var(--muted); }
  table { border-collapse: collapse; width: 100%; font-size: 13.2px; margin: 12px 0; }
  th, td { border: 1px solid var(--border); padding: 7px 10px; text-align: left; vertical-align: top; }
  th { background: var(--sunken); font-size: 12px; }
  td.y { color: var(--good); font-weight: 600; } td.n { color: var(--bad); font-weight: 600; } td.m { color: #b45309; font-weight: 600; }
  ul { margin: 6px 0 6px 2px; padding-left: 20px; } li { margin: 3px 0; }
  .quote { border-left: 3px solid var(--accent); padding: 2px 14px; color: var(--soft); font-style: italic; margin: 10px 0; }
  .quote .who { display:block; font-style: normal; font-size: 12px; color: var(--faint); margin-top: 3px; }
  a { color: #2745c9; text-decoration: none; } a:hover { text-decoration: underline; }
  .verdict { font-weight: 600; }
  .decision li { margin: 8px 0; }
  .decision b.q { color: var(--ink); }
  .default { color: var(--muted); font-size: 13px; }
  .launch { display:inline-block; font-weight:700; border:2px solid var(--ink); border-radius:10px; padding:8px 16px; margin: 6px 0; }
  .kbd { font: 600 11.5px ui-monospace, monospace; border:1px solid var(--border); border-bottom-width:2px;
         border-radius:5px; padding:0 5px; background:var(--surface); }
</style>
</head>
<body>
<main>
<h1>Live runtime state on the Behavior Tree</h1>
<div class="dek">Three backend&#8596;frontend contracts (still open), the state model they share, and the rendering language Zach
decided on 2026-09-05 — Groot2&#8217;s transition-log model, Flowstate&#8217;s sampled palette and group aggregation, spinners on the
whole active path, the marching-dash active-path edge — implemented, photographed, and tested in the clickable mock-backend lab
on real chrome, before any real backend exists.</div>
<div class="stampline">@stamp@ · repo at <code>@fact_head@</code> · facts measured from the tree at build time by <code>docs/build_behavior_tree_runtime_viz_proposal.py</code></div>

<h2><span class="n">01</span>The frame, and one correction to it</h2>
<p>The ask decomposes into four independently decidable layers, and that decomposition is the right one — it is also exactly how the
two reference ecosystems are built (§02): <b>(1) a state model</b> — what runtime state <i>is</i>, per node; <b>(2) rendering</b> —
how the canvas paints it; <b>(3) the backend contract</b> — how state travels from an executing tree into the app; <b>(4) a mock
backend</b> — so layers 1–2 ship and demo before layer 3 has a real producer.</p>
@diagram_layers@
<p>One assumption deserves a push before proposals: <i>&#8220;editing the XML file that then hot-reloads&#8221;</i> put the canonical
document forward as a candidate carrier. Every reference implementation refuses that — Groot2&#8217;s wire never touches the authored
file, py_trees&#8217; visitors &#8220;should not modify the behaviours they visit,&#8221; and this repo&#8217;s own boundary says the same:</p>
<div class="quote">&#8220;I don&#8217;t want to do any deriving logic within the whiteboard… whiteboard should remain like this hackable
thing for drawing things… when we use it for rendering the python code, it&#8217;s the python that is really driving a lot of it.&#8221;
<span class="who">Zach, PROJECT — System Sketch (the whiteboard-stays-dumb boundary, 2026-09-03)</span></div>
<p>Runtime status is ephemeral, high-frequency, derived data; the <code>.systemsketch</code> file is authored content behind a SHA-256
CAS fence with a conflict UI (the draw.io-alignment report, 2026-09-03). Pushing ticks through that channel would make every tick a
document revision, trip the fence against the person&#8217;s own unsaved edits, and persist run state into saved boards. So the honest
version of the file-shaped candidate is a <b>sibling run file</b> — proposal P1 — and the XML itself is never the carrier in any
proposal. Everything else in the frame stands.</p>

<h2><span class="n">02</span>Prior art, verified at the source</h2>
<h3>Groot2 / BehaviorTree.CPP — the ecosystem this feature&#8217;s XML already speaks</h3>
<ul>
  <li><b>The tree process is the server.</b> <code>Groot2Publisher</code> binds ZeroMQ REP :1667 + PUB :1668; Groot2 is a client
      (<a href="https://github.com/BehaviorTree/BehaviorTree.CPP/blob/master/src/loggers/groot2_publisher.cpp">groot2_publisher.cpp</a>).</li>
  <li><b>Structure travels once; status is a poll, not a push.</b> The instantiated tree is serialized to XML in memory once (every node
      stamped with a <code>_uid</code>); <code>STATUS</code> returns one flat <code>uid+status</code> buffer for the whole tree, overwritten
      in place, at whatever cadence the client asks. The only pushed message is &#8220;breakpoint reached.&#8221;</li>
  <li><b>The wire never touches the file on disk.</b> Confirmed by reading the publisher end to end — no filesystem I/O exists in it.</li>
  <li><b>IDLE remembers.</b> A node returning to idle is encoded <code>10 + previous_status</code> so the UI can keep showing what it last
      returned — precedent for outcome-that-decays rather than outcome-that-vanishes.</li>
  <li><b>Replay is an event log.</b> <code>FileLogger2</code>&#8217;s <code>.btlog</code> = XML header + 9-byte records
      <code>(t·µs, uid, status)</code>; Groot2 scrubs by folding records up to the cursor. A bounded in-memory deque
      (<code>TOGGLE_RECORDING</code>/<code>GET_TRANSITIONS</code>) is the live twin of the same shape.</li>
  <li><b>Mocking is official.</b> <code>TestNode</code> (<code>async_delay</code> + scripted result) + wildcard
      <a href="https://www.behaviortree.dev/docs/tutorial-advanced/tutorial_15_replace_rules">substitution rules loadable from JSON</a>
      fake a tree without editing it; Groot2 PRO adds live breakpoints and forced SUCCESS/FAILURE injection. No stock probability knob.</li>
</ul>
<h3>py_trees — the Python runtime the backend will actually be</h3>
<ul>
  <li><b>Two-layer model is canonical:</b> authored structure vs a per-tick dict <code>{uuid → Status}</code> captured by a
      <code>SnapshotVisitor</code> (plus the previous tick&#8217;s dict, so preemption paints as INVALID). Visitors are read-only by contract
      (<a href="https://py-trees.readthedocs.io/en/devel/visualisation.html">visualisation</a>, visitors module).</li>
  <li><b>The wire is whole-tree snapshots, change-gated.</b> py_trees_ros re-serializes every node each publish with
      <code>is_active</code> flags; publishes only when something changed (or a period elapses). Deltas: never. Structure edits are just
      a snapshot with <code>changed=True</code>.</li>
  <li><b>py_trees_js</b> (its web viewer) receives full-snapshot JSON per tick and keeps a client-side cache with
      <b>rewind/resume</b> — a scrubber over received frames, exactly the lab&#8217;s shape.</li>
  <li><b>The dummy kit exists but split:</b> <code>TickCounter</code> (n ticks then a chosen status), <code>ProbabilisticBehaviour</code>
      (weighted SUCCESS/FAILURE/RUNNING), <code>StatusQueue</code> (scripted), <code>Periodic</code>, <code>SuccessEveryN</code>. The lab&#8217;s
      per-node <code>{durationTicks, pSuccess}</code> is TickCounter × ProbabilisticBehaviour composed — the two stock pieces in one knob.</li>
</ul>
<h3>Intrinsic Flowstate — the Process view&#8217;s UX oracle already has this feature</h3>
<div class="row">
  <figure><img src="@fs_execute_on@" alt="Flowstate: Execute on Simulation dropdown"><figcaption>The target picker: <b>Execute on:
  Simulation</b> — the mock backend is a first-class execution target, not a dev tool.</figcaption></figure>
  <figure><img src="@fs_transport@" alt="Flowstate: transport strip"><figcaption>A transport strip docked on the process card:
  run, stop, step, restart.</figcaption></figure>
  <figure><img src="@fs_caption@" alt="Flowstate: execute in draft sim caption"><figcaption>&#8220;Process editor — Execute in draft
  sim&#8221;: the mode is named in the chrome.</figcaption></figure>
</div>
<p class="verdict">Convergent verdict from all three: <b>authored structure + a separate per-tick status overlay joined on one stable
node identity</b>, snapshots over deltas, replay as an event fold, and simulation as a first-class target. Nobody writes status into the
definition.</p>

<h2><span class="n">03</span>What the app already owns (measured at build time)</h2>
<ul>
  <li><b>The identity key exists:</b> every projected child is stamped <code>btPath</code> (<code>0.2.1</code>-style index paths;
      meta keys @fact_meta@). The Flowstate frame projects @fact_tree_children@ children in the Tree view, @fact_process_children@
      in Process — same paths in both, so one status map paints every projection. The analog of Groot2&#8217;s <code>_uid</code>,
      already shipped.</li>
  <li><b>The document channel is deliberately heavyweight:</b> <code>WATCH_INTERVAL_MS = @fact_watch@</code> poll, SHA-256 digest CAS,
      atomic replace, conflict UI. Right for boards; wrong for ticks — which is the architectural argument, not just taste.</li>
  <li><b>An ephemeral-store pattern is already in the codebase:</b> <code>src/recorder/recorderStore.ts</code> — module store +
      <code>useSyncExternalStore</code>, installed from <code>onMount</code>, never in the tldraw store. Runtime state copies this,
      because the tldraw store <i>is</i> the document: status written into shape props/meta would autosave into boards.</li>
  <li><b>The host has room for a run lane:</b> <code>scripts/server.py</code> currently serves @endpoints@ — a bounded-HTTP,
      single-origin loopback controller. A <code>/api/bt/run/*</code> family is the same dialect.</li>
  <li><b>Scrubber precedent in-app:</b> <code>src/history/HistoryList.tsx</code> (element history) and the vault&#8217;s
      trace-viewer shape (filmstrip + event lanes on one clock).</li>
  <li><b>Found while building this:</b> a Behavior Tree region&#8217;s SVG/PNG export silently drops the region&#8217;s own layer
      (wires, Start, header) — child cards only. Flagged as its own fix; the lab replays the painted DOM&#8217;s geometry instead.</li>
</ul>

<h2><span class="n">04</span>The three contracts</h2>

<div class="card">
  <h3 style="margin-top:0">P1 · Run sidecar file, watched <span class="tag alt">the file-shaped candidate, made honest</span></h3>
  @diagram_p1@
  <p><b>Backend:</b> the runner (a py_trees post-tick handler, ~15 lines) writes <code>&lt;board&gt;.run.json</code> — one whole
  <code>RunSnapshot</code> (§05), atomic tmp+rename, debounced to ~10 Hz. <b>Frontend:</b> a second stat-poll on the sidecar
  (the document watcher&#8217;s own pattern, faster interval), parse on digest change, feed the store.</p>
  <p><b>For:</b> zero new transport; works when app and runner share only a filesystem (SSH mounts, containers); trivially inspectable
  (<code>cat</code> the run). <b>Against:</b> latency floor = poll interval + write cadence; disk churn for something never meant to
  persist; no history unless it grows into P3; two runners clobber one file; and it quietly re-couples runtime to the document&#8217;s
  directory. <b>Fidelity:</b> snapshots only — transitions between polls are lost (same loss Groot2 accepts on its STATUS channel).</p>
</div>

<div class="card rec">
  <h3 style="margin-top:0">P2 · A run channel on the Preview host <span class="tag rec">recommended</span></h3>
  @diagram_p2@
  <p><b>Backend:</b> the runner POSTs <code>{runId, xmlDigest, frames:[…]}</code> batches to <code>/api/bt/run</code> after each tick
  (the SnapshotVisitor→JSON adapter is ~20 lines of Python; any language can speak it). The host keeps, per run: latest snapshot +
  a bounded ring of transitions — Groot2&#8217;s STATUS buffer and its recording deque, as one lane. <b>Frontend:</b>
  <code>GET /api/bt/run/latest?since=tick</code> on a 150–250 ms poll (304 when unchanged), store, overlay. SSE is a later
  transport swap behind the same client function, not a different contract.</p>
  <p><b>For:</b> this <i>is</i> the reference architecture — Groot2 live monitoring is literally a client-cadence poll of a
  snapshot buffer, and py_trees_ros is change-gated whole-tree snapshots; no artifact files invented; multiple consumers free
  (a second browser, an agent asking &#8220;what failed last run?&#8221;); <code>GET /api/bt/run/&lt;id&gt;/trace</code> falls out of the
  ring and subsumes P3&#8217;s replay. The host is already the app&#8217;s one loopback authority. <b>Against:</b> needs the host running
  (the embedded IDE case needs its own lane later); one new endpoint family to maintain.</p>
  <p><b>Fidelity:</b> snapshots for liveness <i>plus</i> the transition ring for completeness — the only proposal that keeps both.</p>
</div>

<div class="card">
  <h3 style="margin-top:0">P3 · Trace-first: the run is a file of transitions <span class="tag alt">the walking/replay lane</span></h3>
  @diagram_p3@
  <p><b>Backend:</b> the runner appends JSONL transition records <code>{t, tick, path, to}</code> (the <code>.btlog</code> shape,
  readable form) to <code>runs/&lt;stamp&gt;.btrace.jsonl</code>; a run is an artifact you can commit, attach to a bug, or have an agent
  produce in CI. <b>Frontend:</b> open a trace (or tail a growing one), fold events into frames, scrub — live is just the cursor
  pinned to the tail.</p>
  <p><b>For:</b> nails &#8220;stepping through / walk it&#8221;; replay and diffing runs are first-class; transport-free; the vault&#8217;s
  trace-viewer shape and Groot2&#8217;s own offline story. <b>Against:</b> as the <i>only</i> channel, live latency and lifecycle
  (which file is live? cleanup?) get awkward; every consumer re-implements the fold.</p>
</div>

<h3>Scored against what matters here</h3>
<table>
<tr><th>criterion (weight)</th><th>P1 sidecar file</th><th>P2 host channel</th><th>P3 trace file</th></tr>
<tr><td>XML/document sanctity — non-negotiable</td><td class="y">clean</td><td class="y">clean</td><td class="y">clean</td></tr>
<tr><td>Live latency (high)</td><td class="m">poll + write cadence</td><td class="y">150–250 ms, SSE later</td><td class="m">tail lag</td></tr>
<tr><td>Replay / &#8220;walk it&#8221; (high)</td><td class="n">none until it becomes P3</td><td class="y">ring → trace endpoint</td><td class="y">the point</td></tr>
<tr><td>Backend effort to first pixel (high)</td><td class="y">~15 lines + a file</td><td class="y">~20 lines + endpoint</td><td class="y">~10 lines</td></tr>
<tr><td>Fits existing seams (med)</td><td class="y">watcher pattern</td><td class="y">server.py + recorder-store pattern</td><td class="m">new viewer lane</td></tr>
<tr><td>Multi-consumer / agent access (med)</td><td class="m">file readers</td><td class="y">HTTP, N clients</td><td class="y">file readers</td></tr>
<tr><td>Failure modes (med)</td><td class="m">stale file looks live</td><td class="y">run dies → snapshot ages visibly, heartbeat like Groot2&#8217;s</td><td class="m">unbounded growth, which-is-live</td></tr>
</table>
<p class="verdict">Recommendation: <b>P2, with P3&#8217;s event log as its memory</b> — the host&#8217;s ring <i>is</i> a trace, exposed at
<code>/trace</code>, so scrubbing and run artifacts come free; P1 survives as a degraded-transport fallback (same <code>RunSnapshot</code>
JSON written to a file) for contexts with no host. The deciding facts: the reference implementation Zach named is already a
poll-a-snapshot design, so P2 loses nothing to &#8220;real push&#8221;; and only P2 serves both consumers this app actually has —
a human watching live, and agents/CI asking questions after the fact. Reversible: the store&#8217;s input is the state model, not the
transport, so switching contract later rewrites one client module.</p>

<h2><span class="n">05</span>The state model all three share</h2>
<pre><code>// Layer 1 — the contract that actually gets settled. Everything joins on btPath.
type BtNodeStatus =
  'fresh' | 'running' | 'success' | 'failure' | 'halted'   // halted ≈ py_trees INVALID / Groot2 IDLE_FROM_*

interface BtRunSnapshot {
  runId: string          // one execution of one tree
  xmlDigest: string      // sha256 of the canonical XML — a run against
                         // edited XML is visibly stale, never misdrawn
  treeId: string
  tick: number
  at: number             // wall-clock ms
  statuses: Record&lt;string /* btPath */, { status: BtNodeStatus; sinceTick: number }&gt;
  visited: string[]      // this tick's traversal, in order — wire glow + Start flash
  outcome: 'success' | 'failure' | null
  blackboard?: Record&lt;string, string&gt;   // later; py_trees sends visited keys per tick
}

interface BtRunEvent {                 // the CANONICAL record (decided 2026-09-05):
  seq: number                          // frames above are folds of a list of these;
  tick: number; at: number             // tick + timestamp let a scrubber rebuild the
  path: string                         // exact state at ANY tick — or step INSIDE one
  from: BtNodeStatus; to: BtNodeStatus
}</code></pre>
<p>In-app it lives in a <b>runtime store beside the editor, never inside it</b> (the recorder-store pattern): the tldraw store is the
document, and the digest fence exists precisely to protect it from non-authored writes. <code>BehaviorTreeCanvas</code> already knows
every node&#8217;s rect per projection, so rendering subscribes by region + path and paints — no production shape gains a runtime prop.</p>

<h2><span class="n">06</span>Rendering: the decided language, proven in the lab on real chrome</h2>
<p><b>Decided 2026-09-05 (Zach, after the UX survey), implemented in the lab the same day:</b></p>
<ul>
  <li><b>Groot2&#8217;s model is the base.</b> Status is painted as color/state (no icon system); the history is
      <b>transition-based, not tick-based</b> — the canonical record is <code>{seq, tick, at, path, from, to}</code> and frames are
      derived by folding it, which is exactly the fix for py_trees&#8217; &#8220;skips through ticks&#8221; feeling. The scrubber&#8217;s
      detail view is Groot2&#8217;s real Transitions table (Time · Node · Status, filterable, current row highlighted).</li>
  <li><b>Flowstate&#8217;s palette, verbatim</b> — the survey&#8217;s sampled values: running <code>#E2D9FC</code> (border
      <code>#8b5cf6</code>), done <code>#CAFCD0</code>, pending/untaken <code>#DEDEDE</code>, idle = neutral chrome. Failure keeps
      Groot2&#8217;s <code>#dc2626</code> (Flowstate never shows failure publicly). Group aggregation copied exactly: running tints the
      <i>header</i> lavender; success turns the header mint <i>and washes the whole surface</i> pale green — children keep their own
      fills, untaken branches stay gray. Outcomes persist for the run; re-execution clears them, never a timer (so the earlier
      Monitor-decay mode is gone).</li>
  <li><b>The spinner rides the whole active path</b> — Zach&#8217;s stated improvement over Flowstate: &#8220;everything that is purple
      in Intrinsic Flowstate would have a spinner.&#8221; Every RUNNING ancestor (and a running group&#8217;s header) carries MoveIt&#8217;s
      rotating dotted ring, not just the ticking leaf.</li>
  <li><b>The active path is an animated marching dash</b> from Start to the current node — Zach&#8217;s explicit call, overriding the
      survey&#8217;s recommendation against a dashed running edge. The collision it warned about (dash already means async/delayed on
      this app&#8217;s cables) is resolved on a different channel: <b>the cable vocabulary is a static dash pattern; the active path
      visibly moves</b>. A screenshot of an async cable is identical from moment to moment; the live path never is. The lab draws
      this contract into the scene (the edge-vocabulary inset) and its test asserts it in pixels.</li>
</ul>
<figure><img src="@lab_deep_close@" alt="Close-up: spinners and marching dash on every ancestor of the ticking leaf">
<figcaption><b>The whole active path lights</b> (seed @fact_deep_seed@, tick @fact_deep_tick@, deterministic): the ticking
<code>command_multi_axis_gripper</code> is @fact_deep_depth@ levels deep, and every ancestor — Sequence, Fallback, Parallel, the
root — holds the lavender fill, the purple ring, <i>and its own spinner</i> while the marching dash runs Start → leaf. The failed
first gripper persists red beside the live recovery branch; the finished branch keeps its mint; the untaken Pull-Part-Kit branch
stays pending-gray.</figcaption></figure>
<figure><img src="@lab_running@" alt="Lab mid-run: the Flowstate palette on real chrome">
<figcaption><b>Mid-run, wide.</b> Real exported node cards; wires replayed from the painted DOM at identical coordinates. Done work
holds mint, the active chain is lavender + spinners, pending work is gray, the Start pill is hot. Right rail: per-node mock config
and the Transitions table.</figcaption></figure>
<figure><img src="@lab_recovery_close@" alt="Close-up: a gripper fails and the Fallback recovery branch takes over">
<figcaption><b>The recovery moment</b> (seed @fact_seed@, deterministic): the first
<code>command_multi_axis_gripper</code> holds FAILURE red while the Fallback&#8217;s second branch runs lavender under its spinner.
Failure persists until re-execution — Groot2, MoveIt and the vault doctrine agree.</figcaption></figure>
<figure><div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start">
<img src="@lab_motion_a@" alt="Edge vocabulary inset, first capture" style="max-width:465px">
<img src="@lab_motion_b@" alt="Edge vocabulary inset, 420ms later" style="max-width:465px"></div>
<figcaption><b>The dash-collision resolution, photographed.</b> The same inset captured twice, 420&nbsp;ms apart: the active-path
row&#8217;s dashes have marched (361 pixels differ — measured), the async rail (<code>56 4 10 4</code>, the app&#8217;s real
constants) and the delayed z⁻¹ dots are <i>byte-identical</i>. Motion is the disambiguating channel, by design, not by hope.</figcaption></figure>
<figure><img src="@lab_transitions@" alt="The Groot2-style transitions table" style="max-width:640px">
<figcaption><b>Groot2&#8217;s Transitions table, adopted</b>: Time · Node · Status with colored status text, a name filter, the row at
the scrub position highlighted and kept in view; clicking a row jumps the canvas there, and <span class="kbd">«</span>/<span
class="kbd">»</span> step one transition — <i>inside</i> a tick when several land on the same one.</figcaption></figure>
<figure><img src="@lab_resolved@" alt="Lab resolved run">
<figcaption><b>Resolved.</b> The whole causal story stays painted — @fact_run_outcome@ at tick @fact_run_ticks@,
@fact_run_transitions@ transitions — with ✓/✕ badges, the run banner, and the footer&#8217;s self-check:
&#8220;history ✓ @fact_run_frames@/@fact_run_frames@ ticks reconstruct exactly&#8221; (tick 0 included) runs after every finished
run, folding the transition log to every tick and comparing every node against the driver&#8217;s own snapshots.</figcaption></figure>
<figure><img src="@lab_process_running@" alt="Process view mid-run: header tint vs success wash">
<figcaption><b>Flowstate&#8217;s aggregation, mid-run (Process view).</b> Initialize Workcell is done: mint header <i>and</i> the
pale-green surface wash, its untaken recovery cards still gray inside it. Pull Part Kit is running: lavender header + spinner,
<i>no</i> wash (the wash is success-only), the failed gripper red, the recovery gripper lavender, the unreached one gray.</figcaption></figure>
<figure><img src="@lab_process@" alt="The same run resolved in the Process view">
<figcaption><b>Same run, resolved, Process view.</b> One status map keyed by btPath paints every projection — flipping views mid-run
costs nothing, which is the payoff of keeping the state model out of the renderer.</figcaption></figure>

<h2><span class="n">07</span>The mock backend (&#8220;walk it&#8221;), and where its ideas come from</h2>
<p>The lab&#8217;s driver is a ~120-line BT.CPP-semantics interpreter (Sequence/Fallback with memory, Parallel with
success/failure counts, halt cascades) over the <i>same canonical XML</i> the region stores, with per-leaf
<code>{durationTicks, pSuccess}</code> — py_trees&#8217; TickCounter × ProbabilisticBehaviour composed, the knob BT.CPP&#8217;s
TestNodeConfig (<code>async_delay</code> + scripted result) stops just short of. Seeded RNG makes every walk replayable
(the report&#8217;s screenshots are a seed scan choosing seed @fact_seed@ so the captured run tells the recovery story).
Presets: Nominal, Flaky gripper, Chaos. Every status change appends to the canonical transition log; the scrubber <i>folds the
log</i> — to any tick via the slider, or to any single transition via <span class="kbd">«</span>/<span class="kbd">»</span> and the
table — and the driver&#8217;s own per-tick snapshots survive only as the independent oracle the fold is verified against, after every
run and in <code>docs/labs/test_bt_runtime_lab.mjs</code>.</p>
<p>When the real backend lands, this driver is deleted and nothing else changes: it produces the same frames the wire would.
A real py_trees run mocks even better than random numbers — swap leaves for <code>StatusQueue</code>/<code>TickCounter</code>
behaviours via the same substitution idea BT.CPP ships, and the &#8220;draft sim&#8221; is a real tree, fake actuators — Flowstate&#8217;s
<i>Execute on: Simulation</i> exactly.</p>

<h2><span class="n">08</span>Run the lab</h2>
<p><a class="launch" href="@lab_href@">Open bt-runtime-lab-@stamp@.html</a></p>
<pre><code>@lab_abs@</code></pre>
<p>No server, no build — a self-contained file. <span class="kbd">Play</span> ticks at the chosen rate;
<span class="kbd">Step</span> single-ticks; <span class="kbd">«</span>/<span class="kbd">»</span> step one <i>transition</i>
(inside a tick when several share one); drag any probability slider mid-run; scrub the timeline, click a Transitions row, or
filter it by node name; flip <span class="kbd">Tree</span>/<span class="kbd">Process</span> mid-run. After every finished run the
footer self-checks that the transition log reconstructs every tick exactly. The lab&#8217;s own acceptance test (38 checks — the
reconstruction property across seeds × presets, the whole-path spinners, the wash, the table, and the motion-vs-static pixels) is
<code>node docs/labs/test_bt_runtime_lab.mjs</code>. Regenerate everything (fresh chrome captures from the live
app, fresh screenshots, this page) with <code>python3 docs/build_behavior_tree_runtime_viz_proposal.py --recapture --reshoot</code>.</p>

<h2><span class="n">09</span>Decision surface</h2>
<p><b>Decided since this report was first built (2026-09-05, later the same day):</b> the rendering layer is no longer a proposal.
Zach picked Groot2&#8217;s model (color-state painting, transition-based history, the Transitions table), Flowstate&#8217;s exact
palette and group aggregation, spinners on the whole active path, and the animated marching-dash active-path edge (his call,
overriding the survey&#8217;s dash-collision worry — resolved by the motion-vs-static channel, §06). All of it is implemented and
tested in the lab; §06 shows the result. <b>The transport contract below remains open</b> — nothing here builds P1/P2/P3.</p>
<p><b>Done and proved here:</b> the three contracts with the reference architectures verified at source; the shared state model
with the transition log as the canonical record; the decided rendering language demonstrated on real chrome; a walkable,
configurable mock backend with its own 38-check acceptance test.
<b>Not done, deliberately:</b> no production code touched — no store, no endpoints, no overlay in <code>src/</code>; that is the
implementation this proposal exists to de-risk. Also out of scope by choice: blackboard-value display per tick (py_trees defines the
wire shape when wanted) and the IDE-host transport case.</p>
<ul class="decision">
  <li><b class="q">The contract:</b> adopt P2 (host run-channel, snapshot + transition ring, poll-first)?
      <span class="default">Default if silent: build the state model + store + overlay against the mock first — that work is
      identical under all three contracts — and cut the host lane when the first real runner needs it.</span></li>
  <li><b class="q">Transport ergonomics:</b> poll-first (150–250 ms, 304-on-unchanged), SSE as a later swap?
      <span class="default">Default: yes; the reference tools are polls, and the client function hides it.</span></li>
  <li><b class="q">Where does the real runner live?</b> A <code>py_trees</code> adapter Zach imports in his Python, or a host-side
      &#8220;run this board&#8217;s tree&#8221; button? <span class="default">Default: the adapter first (whiteboard stays dumb; Python
      drives), the button later as sugar over the same POST.</span></li>
  <li><b class="q">Transport strip placement:</b> Flowstate docks run/stop/step on the region header — adopt that as the run-mode
      chrome? <span class="default">Default: yes, next to the projection pill, only while a run/mock is attached.</span></li>
</ul>

<h2><span class="n">10</span>Provenance</h2>
<ul>
  <li>Chrome captures: <code>docs/labs/capture_bt_runtime_lab.mjs</code> — real app, own throwaway ports, region exported via
      <code>editor.toImage</code>, connective geometry dumped verbatim from the painted DOM. Lab screenshots:
      <code>docs/labs/shoot_bt_runtime_lab.mjs</code> (deterministic, seed-scanned).</li>
  <li>Groot2/BT.CPP facts: publisher, protocol and FileLogger2 sources read in full; tutorials 10/11/15; Groot2 feature page.
      py_trees facts: 2.5.0 devel docs + source (display, visitors, trees, behaviours), py_trees_ros trees.py + msg definitions,
      py_trees_js README. Flowstate: the committed reference capture, cropped above.</li>
  <li>Vault: the whiteboard-stays-dumb ruling; High-Performance HMI (gray-first, decay, mode-dependence); the trace-viewer shape;
      flight-recorder note. App facts measured from this tree at <code>@fact_head@</code>.</li>
</ul>
</main>
</body>
</html>
'''


# --------------------------------------------------------------------------
# Entry
# --------------------------------------------------------------------------

def main() -> None:
    if not (ASSETS / 'geometry.json').exists() or '--recapture' in sys.argv:
        subprocess.run(['node', str(DOCS / 'labs/capture_bt_runtime_lab.mjs')], check=True, cwd=ROOT)
    geometry = json.loads((ASSETS / 'geometry.json').read_text())
    facts = measure_repo_facts()

    LAB_PATH.write_text(build_lab(geometry, facts))
    print(f'lab      -> {LAB_PATH}')

    if '--lab-only' in sys.argv:
        return
    if '--reshoot' in sys.argv or not (ASSETS / 'lab-resolved.png').exists():
        subprocess.run(['node', str(DOCS / 'labs/shoot_bt_runtime_lab.mjs'), str(LAB_PATH)], check=True, cwd=ROOT)
    REPORT_PATH.write_text(build_report(geometry, facts))
    print(f'report   -> {REPORT_PATH}')


if __name__ == '__main__':
    main()
