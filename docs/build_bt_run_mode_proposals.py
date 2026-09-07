#!/usr/bin/env python3
"""Build the Behavior Tree run-mode design report.

  docs/bt-run-mode-proposals-2026-09-05.html

Phase 1 — five proposals for how "run mode" gets triggered, each composited
onto REAL app captures (docs/labs/capture_bt_run_mode_chrome.mjs boots the
actual app and dumps screen rects), scored against explicit weighted criteria,
with one recommendation and the runner-ups kept visible.

Phase 2 — the per-node mock-parameter data model: where the authored values
live, how presets write them, and what the simulator samples at run time.

Regenerate captures first when the chrome changes:
  node docs/labs/capture_bt_run_mode_chrome.mjs
"""
from __future__ import annotations

import base64
import json
from pathlib import Path

DOCS = Path(__file__).resolve().parent
ASSETS = DOCS / 'assets' / 'bt-run-mode'
STAMP = '2026-09-05'
OUT = DOCS / f'bt-run-mode-proposals-{STAMP}.html'


def data_uri(path: Path) -> str:
    return 'data:image/png;base64,' + base64.b64encode(path.read_bytes()).decode()


def crop(source: str, box: tuple[int, int, int, int], scale: float = 1.0) -> tuple[str, int, int]:
    """Crop a capture; returns (data URI, css width, css height)."""
    from PIL import Image
    image = Image.open(ASSETS / source).convert('RGB').crop(box)
    if scale != 1.0:
        image = image.resize((round(image.width * scale), round(image.height * scale)), Image.LANCZOS)
    out = ASSETS / f'crop-{Path(source).stem}-{box[0]}x{box[1]}.png'
    image.save(out)
    return data_uri(out), image.width, image.height


def within_rect(rect, box, scale):
    return { 'x': (rect['x'] - box[0]) * scale, 'y': (rect['y'] - box[1]) * scale,
             'w': rect['w'] * scale, 'h': rect['h'] * scale }


def main() -> None:
    geometry = json.loads((ASSETS / 'geometry.json').read_text())
    tree = geometry['tree']

    # ---- crops, computed from the dumped screen rects -----------------------
    pill = tree['pill']
    pill_box = (int(pill['x']) - 24, int(pill['y']) - 18, int(pill['x'] + pill['w']) + 150, int(pill['y'] + pill['h']) + 18)
    pill_img, pill_w, pill_h = crop('tree-selected.png', pill_box, 1.6)

    header = tree['header']
    header_box = (int(header['x']) + 2, int(header['y']) - 10, int(header['x']) + 1080, int(header['y'] + header['h']) + 30)
    header_img, header_w, header_h = crop('tree-selected.png', header_box, 1.35)

    view = tree['inspectorView']
    inspector_box = (int(view['x']) - 6, 0, 1760, int(view['y'] + view['h']) + 120)
    inspector_img, inspector_w, inspector_h = crop('tree-selected.png', inspector_box, 1.0)

    start = tree['start']
    strip_box = (int(start['x']) - 330, int(start['y']) - 88, int(start['x'] + start['w']) + 330, int(start['y'] + start['h']) + 96)
    strip_img, strip_w, strip_h = crop('tree-selected.png', strip_box, 1.25)

    node = geometry['node']['inspectorNode']
    node_box = (int(node['x']) - 6, int(node['y']) - 10, 1760, int(node['y'] + node['h']) + 40)
    node_img, node_w, node_h = crop('node-selected.png', node_box, 1.0)

    deep = crop('journey-deep-path.png', (14, 210, 1478, 1080), 0.9)
    authoring = crop('journey-mock-authoring.png', (1474, 40, 1760, 620), 1.0)
    table_shot = crop('journey-transitions-table.png', (1490, 280, 1760, 760), 1.0)

    wide_box = (80, 24, 1760, 1080)
    wide_img, wide_w, wide_h = crop('tree-selected.png', wide_box, 0.78)
    region_in_wide = within_rect(tree['region'], wide_box, 0.78)

    # Positions INSIDE the crops (css px, post-scale) for the overlays.
    within = within_rect

    pill_in = within(pill, pill_box, 1.6)
    header_in = within(header, header_box, 1.35)
    start_in = within(start, strip_box, 1.25)
    view_in = within(view, inspector_box, 1.0)

    html = REPORT_TEMPLATE
    for key, value in {
        'pill_img': pill_img, 'pill_w': pill_w, 'pill_h': pill_h,
        'header_img': header_img, 'header_w': header_w, 'header_h': header_h,
        'inspector_img': inspector_img, 'inspector_w': inspector_w, 'inspector_h': inspector_h,
        'strip_img': strip_img, 'strip_w': strip_w, 'strip_h': strip_h,
        'node_img': node_img, 'node_w': node_w, 'node_h': node_h,
        'wide_img': wide_img, 'wide_w': wide_w, 'wide_h': wide_h,
        'pill_right': pill_in['x'] + pill_in['w'], 'pill_top': pill_in['y'], 'pill_hh': pill_in['h'],
        'pillviews_x': within(tree['pillViews'], pill_box, 1.6)['x'],
        'header_right': header_in['x'] + header_in['w'], 'header_top': header_in['y'], 'header_hh': header_in['h'],
        'start_cx': start_in['x'] + start_in['w'] / 2, 'start_top': start_in['y'],
        'strip_y': max(6, start_in['y'] - 62),
        'view_x': view_in['x'], 'view_bottom': view_in['y'] + view_in['h'], 'view_w': view_in['w'],
        'rw_x': region_in_wide['x'], 'rw_y': region_in_wide['y'], 'rw_w': region_in_wide['w'],
        'rw_h': min(region_in_wide['h'], wide_h - region_in_wide['y'] - 6),
        'rw_cx': region_in_wide['x'] + region_in_wide['w'] / 2, 'rw_strip_y': region_in_wide['y'] + 16,
        'deep_img': deep[0], 'authoring_img': authoring[0], 'table_img': table_shot[0],
        'stamp': STAMP,
    }.items():
        html = html.replace(f'@{key}@', f'{value:.0f}' if isinstance(value, float) else str(value))
    OUT.write_text(html)
    print(f'report -> {OUT}')


REPORT_TEMPLATE = r'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Behavior Tree run mode — trigger proposals and the mock-parameter model</title>
<style>
  :root { --ink:#27272a; --muted:#71717a; --border:#d4d4d8; --surface:#fff; --sunken:#f4f4f5;
          --accent:#6d5be6; --running:#8b5cf6; --running-soft:#E2D9FC; --done:#CAFCD0; }
  * { box-sizing: border-box; }
  body { margin:0; font:15px/1.55 Inter,ui-sans-serif,system-ui; color:var(--ink); background:#fafafa; }
  main { max-width: 1080px; margin: 0 auto; padding: 28px 24px 80px; }
  h1 { font-size: 26px; margin: 8px 0 4px; }
  h2 { font-size: 19px; margin: 42px 0 10px; border-top: 1px solid var(--border); padding-top: 26px; }
  h2 .n { color: var(--muted); font-weight: 600; margin-right: 10px; }
  h3 { font-size: 15.5px; margin: 26px 0 8px; }
  .dek { color: var(--muted); font-size: 14.5px; max-width: 76ch; }
  .stampline { color: var(--muted); font-size: 12.5px; margin: 8px 0 0; }
  code { background: var(--sunken); border-radius: 5px; padding: 1px 5px; font-size: 13px; }
  pre { background: #18181b; color: #e4e4e7; border-radius: 10px; padding: 14px 16px; overflow-x: auto; font-size: 12.5px; line-height: 1.5; }
  pre code { background: none; padding: 0; color: inherit; }
  figure { margin: 14px 0 22px; }
  figcaption { color: var(--muted); font-size: 13px; margin-top: 7px; max-width: 82ch; }
  .mock { position: relative; display: inline-block; border: 1px solid var(--border); border-radius: 10px; overflow: hidden;
          box-shadow: 0 1px 8px rgba(0,0,0,.06); max-width: 100%; }
  .mock img { display: block; max-width: 100%; height: auto; }
  .mock .add { position: absolute; }
  .tag { position: absolute; top: 8px; left: 8px; font: 700 10.5px Inter; letter-spacing: .06em; color: #fff;
         background: var(--accent); border-radius: 6px; padding: 2px 7px; text-transform: uppercase; }
  /* App-idiom mock controls. Sampled from the real captures: the selection
     pill is charcoal with white glyph buttons; the inspector is a light panel
     with segmented gray buttons; the region header is a light band. */
  .mock-pillgroup { display: inline-flex; align-items: center; gap: 4px; background: #202125; border-radius: 10px;
         padding: 5px 8px; box-shadow: 0 2px 8px rgba(0,0,0,.35); }
  .mock-pillgroup button { font: 600 18px Inter; color: #fff; background: transparent; border: 0; border-radius: 7px;
         padding: 4px 10px; display: inline-flex; align-items: center; gap: 6px; }
  .mock-pillgroup button.on { background: #3f4046; }
  .mock-pillgroup .sep { width: 1px; height: 20px; background: #3a3b40; }
  .mock-headerbtn { display: inline-flex; align-items: center; gap: 7px; font: 600 13px Inter; color: #3f3f46;
         background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 4px 12px;
         box-shadow: 0 1px 3px rgba(0,0,0,.07); }
  .mock-section { background: #fff; border: 1px solid #e4e4e7; border-left: 0; border-right: 0; padding: 10px 14px;
         font: 13px Inter; }
  .mock-section .title { font: 700 11px Inter; letter-spacing: .07em; color: var(--muted); margin-bottom: 8px; }
  .mock-row { display: flex; align-items: center; gap: 8px; margin: 6px 0; color: #3f3f46; font-size: 13px; }
  .mock-row .lbl { width: 78px; color: var(--muted); }
  .mock-seg { display: inline-flex; border: 1px solid var(--border); border-radius: 7px; overflow: hidden; }
  .mock-seg span { padding: 3px 10px; font: 500 12.5px Inter; color: #52525b; background: var(--sunken); }
  .mock-seg span.on { background: #fff; color: #18181b; font-weight: 600; }
  .mock-runbtn { display: inline-flex; align-items: center; gap: 7px; font: 600 13px Inter; color: #fff;
         background: #18181b; border-radius: 8px; padding: 6px 14px; }
  .mock-strip { display: inline-flex; align-items: center; gap: 8px; background: #fff; border: 1px solid var(--border);
         border-radius: 10px; padding: 6px 10px; box-shadow: 0 3px 14px rgba(0,0,0,.13); font: 600 13px Inter; color: #3f3f46; }
  .mock-strip .scrub { width: 130px; height: 4px; border-radius: 2px; background: linear-gradient(90deg, var(--running) 60%, #e4e4e7 60%); }
  .mock-strip .time { font: 600 11.5px ui-monospace,monospace; color: var(--muted); }
  .mock-strip .stop { color: #dc2626; }
  .mock-modeframe { position: absolute; inset: 0; border: 3px solid var(--running); border-radius: 10px; pointer-events: none;
         box-shadow: inset 0 0 34px rgba(139,92,246,.12); }
  .mock-modetag { position: absolute; font: 700 11px Inter; letter-spacing: .05em; color: #fff; background: var(--running);
         border-radius: 0 0 8px 0; padding: 3px 10px; }
  table.score { border-collapse: collapse; width: 100%; font-size: 13.5px; margin: 14px 0; }
  table.score th, table.score td { border: 1px solid var(--border); padding: 7px 10px; text-align: left; vertical-align: top; }
  table.score th { background: var(--sunken); font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); }
  table.score td.num { text-align: center; font-variant-numeric: tabular-nums; }
  table.score tr.win td { background: #f3f0ff; }
  .verdict { border-left: 4px solid var(--accent); background: #f6f4ff; border-radius: 0 10px 10px 0; padding: 12px 18px; margin: 18px 0; }
  ul { padding-left: 22px; } li { margin: 5px 0; }
  .pro { color: #15803d; } .con { color: #b91c1c; }
</style>
</head>
<body>
<main>
<h1>Behavior Tree run mode — the trigger, and the mock-parameter model</h1>
<div class="dek">Phase 1 of turning the runtime lab into the real feature: five genuinely different places the
mock run could start from, each drawn onto captures of the actual app chrome (not invented UI), scored against
explicit criteria, one recommendation — runner-ups kept visible per house convention. Phase 2: the authored
per-node mock-parameter model the simulator samples from.</div>
<div class="stampline">@stamp@ · captures by <code>docs/labs/capture_bt_run_mode_chrome.mjs</code> (real app, throwaway ports) ·
built by <code>docs/build_bt_run_mode_proposals.py</code></div>

<h2><span class="n">00</span>Criteria before options</h2>
<table class="score">
<tr><th>criterion</th><th>weight</th><th>why this weight, here</th></tr>
<tr><td><b>Distinct from editing</b></td><td class="num">30%</td><td>Zach's stated worry class: nobody should wonder whether a live
run can corrupt the tree. Run mode must read as a MODE with an obvious exit, not as one more view flip. The runtime state model
already guarantees the document is untouched (ephemeral store, never shape props); the trigger has to make that legible.</td></tr>
<tr><td><b>Discoverability</b></td><td class="num">25%</td><td>Findable from the thing you want to run, without docs.</td></tr>
<tr><td><b>Chrome-space contention</b></td><td class="num">20%</td><td>The pill, header and inspector are already dense; the prior-art
atlas ruling (B11) says no decorative buttons at rest — a run affordance must not tax every board that never runs.</td></tr>
<tr><td><b>Fits existing idiom + references</b></td><td class="num">15%</td><td>Zero-relearning: the app's selection-pill/commands
architecture, and what Flowstate/MoveIt/Groot2 users already expect.</td></tr>
<tr><td><b>Scales to the full transport</b></td><td class="num">10%</td><td>Play/pause · step · «» · scrub · speed · presets · the
transitions table all need a home once running; a trigger that strands them scores low.</td></tr>
</table>

<h2><span class="n">01</span>P1 · ▶ Run on the selection pill — Zach's suggestion</h2>
<figure><div class="mock"><span class="tag">mockup on real capture</span>
  <img src="@pill_img@" alt="The real Behavior Tree selection pill">
  <div class="add" style="left:@pill_right@px; top:@pill_top@px; height:@pill_hh@px; display:flex; align-items:center;">
    <span class="mock-pillgroup"><span class="sep"></span><button class="on" title="Run this tree against the mock backend">▶<span style="font-size:12px">run</span></button></span>
  </div>
</div>
<figcaption><b>The real selection pill</b> (Tree/Process · direction · faces · lens · tidy) <b>plus a ▶ run group</b> drawn in its own
idiom. Pressing it enters run mode; the pill group is also where run mode is later left.</figcaption></figure>
<ul>
<li class="pro">Lives exactly where Tree/Process already lives — the surface Zach flips most, so discovery is immediate on selection.</li>
<li class="pro">Zero at-rest chrome: nothing appears until a region is selected (B11-clean).</li>
<li class="pro">The pill is command-backed (<code>behaviorTreeCommands</code>), so pill and inspector cannot disagree.</li>
<li class="con">Transient surface — the pill hides on deselect, so the RUNNING transport cannot live here; needs a docked strip once running.</li>
<li class="con">The pill is one group away from crowded.</li>
</ul>

<h2><span class="n">02</span>P2 · ▶ on the region's own header band</h2>
<figure><div class="mock"><span class="tag">mockup on real capture</span>
  <img src="@header_img@" alt="The real region header band">
  <div class="add" style="right:26px; top:@header_top@px; ">
    <span class="mock-headerbtn" style="margin-top:6px">▶ Run</span>
  </div>
</div>
<figcaption><b>The region's real header band</b> with a Run button docked at its right edge — always visible on the region itself,
the way Flowstate docks execution on the process card.</figcaption></figure>
<ul>
<li class="pro">Per-region and always visible: the run affordance sits on the thing that runs, selection or not.</li>
<li class="pro">Matches Flowstate's mental model (execution controls belong to the process card).</li>
<li class="con">At-rest chrome tax on every region on every board — the exact thing atlas B11 warns about.</li>
<li class="con">Small target at typical zoom; competes with title/subtitle space, and the header already carries the error count.</li>
</ul>

<h2><span class="n">03</span>P3 · a Run section in the Behavior Tree inspector</h2>
<figure><div class="mock"><span class="tag">mockup on real capture</span>
  <img src="@inspector_img@" alt="The real Behavior Tree inspector">
  <div class="add" style="left:@view_x@px; top:@view_bottom@px; width:@view_w@px;">
    <div class="mock-section">
      <div class="title">RUN</div>
      <div class="mock-row"><span class="mock-runbtn">▶ Run mock</span></div>
      <div class="mock-row"><span class="lbl">Preset</span><span class="mock-seg"><span class="on">Nominal</span><span>Flaky</span><span>Chaos</span></span></div>
      <div class="mock-row"><span class="lbl">Speed</span><span class="mock-seg"><span>0.5×</span><span class="on">1×</span><span>2×</span><span>4×</span></span></div>
    </div>
  </div>
</div>
<figcaption><b>The real inspector</b> (View section above) with a mocked <b>Run section</b> inserted after it: the trigger plus the
run configuration — and, once running, the natural home for the Groot2-style transitions table.</figcaption></figure>
<ul>
<li class="pro">Room: presets, seed, speed and the transitions table all fit; nothing else in the app has this much space.</li>
<li class="pro">Config-beside-source: mock parameters are authored in the same panel (Phase 2's Node section).</li>
<li class="con">Lowest discoverability of the five — behind select-then-dock; nothing on the canvas hints a tree can run.</li>
<li class="con">As the ONLY trigger it hides the feature; as the detail surface it is exactly right.</li>
</ul>

<h2><span class="n">04</span>P4 · a Flowstate-style transport strip docked on the region</h2>
<figure><div class="mock"><span class="tag">mockup on real capture</span>
  <img src="@strip_img@" alt="The region around its Start pill">
  <div class="add" style="left:@start_cx@px; top:@strip_y@px; transform: translateX(-50%);">
    <span class="mock-strip">▶ <span>‖</span> <span>»</span> <span class="scrub"></span> <span class="time">tick 12 · 0:01.2</span> <span class="stop">■</span></span>
  </div>
</div>
<figcaption><b>The real canvas around Start</b> with Flowstate's own move: a floating transport docked above the root, scrolling
with the tree (their &#8220;Execute on: Simulation&#8221; bar). Shown mid-run with scrub position and clock.</figcaption></figure>
<ul>
<li class="pro">The reference behavior, verbatim — Flowstate docks play/stop/step above the root; zero relearning for anyone who has seen it.</li>
<li class="pro">The transport is exactly where the eyes are during a run; scrubbing happens next to the paint it drives.</li>
<li class="con">As the TRIGGER it must exist before any run is attached — a floating strip at rest violates B11 (Flowstate only shows
it because execution is always attachable there).</li>
<li class="con">Floating chrome over the canvas; must dodge the Start pill, insert buttons and marching cables.</li>
</ul>

<h2><span class="n">05</span>P5 · Run as a third projection (Tree · Process · Run)</h2>
<figure><div class="mock"><span class="tag">mockup on real capture</span>
  <img src="@pill_img@" alt="The real selection pill">
  <div class="add" style="left:@pillviews_x@px; top:@pill_top@px; height:@pill_hh@px; display:flex; align-items:center;">
    <span class="mock-pillgroup"><button class="on">Tree</button><button>Process</button><button>▶ Run</button></span>
  </div>
</div>
<figcaption><b>The projection group extended</b>: Tree · Process · <b>Run</b>, in the pill and the inspector's Projection row.</figcaption></figure>
<ul>
<li class="pro">Reuses the strongest muscle memory in the feature (the projection flip).</li>
<li class="con"><b>Conflates a lens with a mode.</b> The runtime state model was built so one status map paints EVERY projection —
you should watch a run in Tree or Process at will; making Run a sibling of those forbids exactly that.</li>
<li class="con">Worst of the five on distinct-from-editing: it looks like one more view flip, the opposite of &#8220;this is a live
run, your document is safe.&#8221;</li>
<li class="con">A projection is authored presentation persisted in props; a run is ephemeral. Storing &#8220;projection: run&#8221;
would write runtime state into the document.</li>
</ul>

<h2><span class="n">06</span>Scored</h2>
<table class="score">
<tr><th>proposal</th><th>distinct 30%</th><th>discover 25%</th><th>space 20%</th><th>idiom 15%</th><th>transport 10%</th><th>weighted</th></tr>
<tr class="win"><td><b>P1 pill ▶ run</b> → docks P4's strip while running, table in P3's section</td>
<td class="num">4</td><td class="num">5</td><td class="num">5</td><td class="num">5</td><td class="num">4</td><td class="num"><b>4.60</b></td></tr>
<tr><td>P4 strip (as trigger)</td><td class="num">5</td><td class="num">4</td><td class="num">2</td><td class="num">5</td><td class="num">5</td><td class="num">4.15</td></tr>
<tr><td>P2 header ▶</td><td class="num">4</td><td class="num">5</td><td class="num">3</td><td class="num">4</td><td class="num">2</td><td class="num">3.85</td></tr>
<tr><td>P3 inspector section (as trigger)</td><td class="num">4</td><td class="num">2</td><td class="num">5</td><td class="num">4</td><td class="num">5</td><td class="num">3.80</td></tr>
<tr><td>P5 third projection</td><td class="num">1</td><td class="num">5</td><td class="num">5</td><td class="num">3</td><td class="num">2</td><td class="num">3.20</td></tr>
</table>
<div class="verdict"><b>Recommendation — P1 as the trigger, composing P4 and P3 as the run-mode surfaces.</b> The ▶ run group on the
selection pill starts the mock (Zach's own instinct, zero at-rest cost, highest discoverability-per-pixel). Entering run mode then
docks the Flowstate-style transport strip above the region (P4's strength, now B11-legal because a run IS attached), frames the
region with the running-purple mode boundary + a &#8220;Mock run&#8221; tag + an explicit ✕ exit (the distinctness the criteria weight
most), and the inspector grows the Run section (P3's strength) carrying presets, seed, speed and the Groot2 transitions table.
P4-as-trigger is the runner-up and remains one keypress away conceptually: the strip's ▶ IS the same command. Reversible: the
trigger is one pill group; moving or duplicating it (e.g. adding P2's header ▶ later) touches no engine or store code.</div>
<figure><div class="mock"><span class="tag">composed recommendation, mockup</span>
  <img src="@wide_img@" alt="The whole app with run mode composed">
  <div class="mock-modeframe" style="left:@rw_x@px; top:@rw_y@px; width:@rw_w@px; height:@rw_h@px"></div>
  <div class="mock-modetag" style="left:@rw_x@px; top:@rw_y@px;">MOCK RUN · document untouched</div>
  <div class="add" style="left:@rw_cx@px; top:@rw_strip_y@px; transform: translateX(-50%);">
    <span class="mock-strip">‖ <span>step</span> <span>«</span> <span>»</span> <span class="scrub"></span> <span class="time">tick 12 · 0:01.2 · 1×</span> <span class="stop">■</span></span>
  </div>
</div>
<figcaption><b>What entering run mode composes</b> (mock): purple mode frame + tag on the region, transport strip docked over the
tree, canvas painting the decided runtime language. The inspector's Run section (off-frame right) holds presets/seed/speed and the
transitions table.</figcaption></figure>
<p><b>One vocabulary note</b> (decided upstream, recorded here): since <code>7de23721</code> every plain <i>data</i> cable marches
ambiently (React Flow's homepage dash — Zach's literal ask, its collision with async/delayed explicitly deferred by him). The
run-mode active path stays distinguishable by <b>color + width + speed</b> (saturated <span style="color:#8b5cf6">#8b5cf6</span>,
3.5px, 10-7 dash at 0.7s vs the data cables' neutral 1.75px 5-5 at 0.5s), and async/delayed cables remain fully static — the
motion-vs-static contract from the lab holds against BOTH.</p>

<h2><span class="n">07</span>Phase 2 · the per-node mock-parameter model</h2>
<p>Zach's brief, verbatim: <i>&#8220;each node should have the option to define its own success chance, or expected execution
time&#8221;</i>, presets stay as bulk moves, values must survive &#8220;when you make new trees using the same nodes,&#8221; and
outcomes are <i>randomized</i> around the authored expectation.</p>
<h3>Where the values live — the document's own skill registry</h3>
<p>The app already has exactly one place where a skill exists independently of any occurrence in a tree: the
<code>&lt;TreeNodesModel&gt;</code> declaration (<code>btcppXml.ts</code> parses it into <code>BtNodeModel</code>; the Behaviors
panel and the inspector Library are both derived from it). Mock parameters are therefore <b>authored per skill, on the model
entry</b> — underscore-prefixed attributes, BT.CPP's own convention for non-port metadata (<code>isReservedAttribute</code>
already treats <code>_…</code> as reserved, so they can never be mistaken for ports):</p>
<pre><code>&lt;TreeNodesModel&gt;
  &lt;Action ID="command_multi_axis_gripper" _mock_success="0.55" _mock_duration_ms="800"&gt;
    &lt;input_port name="gripper"/&gt;
  &lt;/Action&gt;
&lt;/TreeNodesModel&gt;</code></pre>
<ul>
<li><b>Survives reuse</b>: every tree in the document (subtrees included) that uses the skill reads the same profile — Zach's
&#8220;sense of what you can do&#8221; when composing new trees from known nodes. (Cross-<i>board</i> reuse is out of scope, same as
the skill declarations themselves; noted, not hidden.)</li>
<li><b>It's authored data, so it belongs in the document</b> — editing it goes through a command
(<code>setBehaviorTreeMockParams</code>), is one undo step, autosaves, and round-trips through BT.CPP tooling that ignores unknown
reserved attributes.</li>
<li><b>Runtime status never touches the document</b> — the run itself lives in an ephemeral module store (the recorder-store
pattern), exactly as the runtime-viz proposal specified.</li>
</ul>
<h3>Defaults, presets, sampling</h3>
<ul>
<li><b>Defaults</b>: an undeclared skill mocks at <b>90% success, 800&nbsp;ms</b>; conditions at 95%, 120&nbsp;ms — a fresh tree
runs reasonably with zero configuration. Builtins keep their semantics (<code>AlwaysFailure</code> fails, <code>Sleep</code>
sleeps its <code>msec</code>, decorators decorate).</li>
<li><b>Presets are bulk setters of the authored values, not a runtime mode</b>: Nominal writes success 1.0 for every skill the
tree uses; Flaky multiplies each current success by 0.6 (floor 0.35); Chaos writes 0.6 everywhere. One command, one undo step —
and afterward the per-node values ARE what the preset wrote, visible and individually editable.</li>
<li><b>Sampling</b>: at run time each leaf's completion draws duration ~ U[0.7·d, 1.3·d] (per attempt) and outcome ~
Bernoulli(success) from a seeded RNG — a node at 80% succeeds in roughly 80% of runs, never always. Seed shown in the Run
section; same seed, same run.</li>
</ul>
<h3>The authoring UI — &#8220;just a button,&#8221; not a subsystem</h3>
<figure><div class="mock"><span class="tag">mockup on real capture</span>
  <img src="@node_img@" alt="The real Node section of the inspector">
  <div class="add" style="left:0px; top:@node_h@px; width:100%; margin-top:-38px;">
    <div class="mock-section" style="border-top:1px solid #e4e4e7">
      <div class="title">MOCK</div>
      <div class="mock-row"><span class="lbl">Success</span><input type="range" style="width:90px" value="55" max="100"> <b>55%</b></div>
      <div class="mock-row"><span class="lbl">Duration</span><span class="mock-seg"><span class="on">800 ms</span></span><span style="color:#a1a1aa;font-size:12px">· skill-wide</span></div>
    </div>
  </div>
</div>
<figcaption><b>The real Node section</b> (identity · name · ports · structure) growing a two-row <b>Mock</b> block for leaf nodes:
success slider + duration field. Editing writes the SKILL's profile — the caption says &#8220;skill-wide&#8221; so it is never
mistaken for a per-occurrence value.</figcaption></figure>

<h2><span class="n">08</span>What Phase 3 implemented — same day, proven in the real app</h2>
<ul>
<li><code>src/behaviorTree/runtime/</code>: <code>mockParams.ts</code> (authored profile read/write, defaults, presets as bulk
writers), <code>btMockEngine.ts</code> (BT.CPP semantics — latched/reactive/memory sequences and fallbacks,
Parallel/ParallelAll thresholds, IfThenElse/WhileDoElse, the decorator set incl. RunOnce and SequenceWithMemory persistence,
SubTree descent, loud refusal for Switch/ManualSelector — emitting the canonical transition log, with per-tick snapshots kept
only as the oracle tests verify the fold against), <code>runStore.ts</code> (recorder-store pattern: ephemeral, never the
document; XML drift stops a run as <i>stale</i>), <code>BtRunOverlay.tsx</code> (node paint + spinner + mode frame + the
docked transport strip, camera-tracked in the chrome's front layer).</li>
<li>The P1 trigger (<code>bt-pill-run</code> on the selection pill), the P4 strip while a run exists, the P3 Run section
(presets · seed · speed · the Groot2 Transitions table with filter, row highlight, «/» transition stepping), the Mock rows in
the Node section, and the purple mode frame + MOCK RUN tag.</li>
<li><b>One deviation from the lab, found by looking:</b> the lab's <code>mix-blend-mode: multiply</code> fills render opaque
in the app's transformed front layer (an isolated stacking context — the blend can't reach the canvas) and erased card text.
The overlay now uses low-alpha veils solved to composite to the EXACT sampled swatches over a white card
(<code>rgba(74,18,236,.16)</code> → #E2D9FC, etc.), keeping the card text readable. All run colours are
<code>--ss-run-*</code> tokens in <code>src/theme/tokens.css</code> — the theme gate caught the literals.</li>
<li>Tests: 19 vitest cases (<code>btMockEngine.test.ts</code> — semantics, every-tick fold≡snapshot across seeds, the
ancestors-running invariant, 30%-node statistics over 600 runs, replay determinism, params/presets round-trip) and the
32-check CDP journey <code>tests/behavior_tree_run_mode_smoke.mjs</code> (<code>npm run test:bt-run</code>), plus
<code>npm run check</code> green: 1482 vitest · 118 Python incl. the theme gate.</li>
</ul>
<figure><div class="mock"><span class="tag">real app · journey capture</span><img src="@deep_img@" alt="Run mode live in the real app"></div>
<figcaption><b>The decided language, live on a real <code>BehaviorTreeShape</code></b> (journey capture, seed 20260905, scrubbed
to tick 1): mint done condition with ✓ and a green taken edge, the whole active chain lavender with a spinner on every RUNNING
ancestor, marching purple wires Start → leaf, pending gray with text readable through the veils, the transport strip docked
above the region inside the purple mode frame.</figcaption></figure>
<figure><div class="mock" style="margin-right:12px"><span class="tag">real app</span><img src="@authoring_img@" alt="The Run section in the inspector"></div>
<div class="mock"><span class="tag">real app</span><img src="@table_img@" alt="The transitions table mid-run"></div>
<figcaption><b>Left:</b> the Run section as built — ▶ Run mock, presets (bulk authored writes), seed, and the honesty line
(&#8220;the document is never written by a run&#8221;). <b>Right:</b> the Groot2 Transitions table mid-run — Time · Node ·
Status in the status colours, «/» transition stepping, Stop.</figcaption></figure>
</main>
</body>
</html>
'''


if __name__ == '__main__':
    main()
