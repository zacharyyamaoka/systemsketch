#!/usr/bin/env python3
"""Build the self-contained robotics stress gallery for mutation-flow routing."""

from __future__ import annotations

import base64
import html
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ASSETS = REPO / "docs" / "assets"
OUTPUT = REPO / "docs" / "mutating-line-review-2026-09-03.html"
BOARD = "sketches/review/mutating-line-examples.systemsketch"
HEAD = subprocess.run(
	["git", "rev-parse", "--short", "HEAD"], cwd=REPO, check=True,
	capture_output=True, text=True,
).stdout.strip()


def asset_uri(name: str) -> str:
	return "data:image/png;base64," + base64.b64encode((ASSETS / name).read_bytes()).decode()


def figure(name: str, caption: str, klass: str = "") -> str:
	return (
		f'<figure class="{klass}"><img src="{asset_uri(name)}" alt="{html.escape(caption)}">'
		f"<figcaption>{html.escape(caption)}</figcaption></figure>"
	)


CSS = """
:root { --ink:#172131; --muted:#647286; --line:#d9e0e8; --paper:#fff; --bg:#f4f7fa;
  --orange:#e86f1c; --green:#14834a; --blue:#2f6feb; }
* { box-sizing:border-box } body { margin:0; color:var(--ink); background:var(--bg);
  font:15.5px/1.58 Inter,ui-sans-serif,system-ui,sans-serif }
main { width:min(1220px,calc(100% - 40px)); margin:auto; padding:46px 0 78px }
h1 { margin:0 0 9px; font-size:clamp(30px,4vw,45px); line-height:1.08; letter-spacing:-.04em }
h2 { margin:50px 0 14px; padding-top:23px; border-top:1px solid var(--line); font-size:22px }
h3 { margin:0 0 5px; font-size:15px } p { margin:0 0 14px }
.lede { color:var(--muted); font-size:17px; max-width:910px }
.facts { display:grid; grid-template-columns:repeat(5,1fr); gap:11px; margin:28px 0 }
.fact,.note,details { background:var(--paper); border:1px solid var(--line); border-radius:12px; padding:14px 16px }
.fact b { display:block; font-size:25px; letter-spacing:-.04em }
.fact span { color:var(--muted); font-size:12px }
.note { border-left:4px solid var(--green); margin:19px 0 }.note.orange { border-left-color:var(--orange) }
.grid { display:grid; grid-template-columns:1fr 1fr; gap:18px; margin:18px 0 }
.grid.hero { grid-template-columns:.72fr 1.28fr; align-items:start }
figure { margin:0; background:var(--paper); border:1px solid var(--line); border-radius:12px; overflow:hidden }
figure img { display:block; width:100%; height:auto } figcaption { padding:10px 13px; color:var(--muted); font-size:13px }
.flow { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin:18px 0 }
.flow span { padding:8px 11px; border-radius:999px; background:#fff; border:1px solid var(--line); font:13px ui-monospace,SFMono-Regular,Menlo,monospace }
.flow i { color:var(--orange); font-style:normal; font-weight:800 }
table { width:100%; border-collapse:collapse; background:var(--paper); border:1px solid var(--line); font-size:14px }
th,td { text-align:left; vertical-align:top; padding:10px 12px; border-bottom:1px solid var(--line) }
th { color:var(--muted); font-size:12px; background:#f7f9fb } tr:last-child td { border:0 }
code { padding:1px 4px; border-radius:4px; background:#edf1f5; font:12.5px ui-monospace,SFMono-Regular,Menlo,monospace }
details { margin:18px 0 } summary { cursor:pointer; font-weight:700 } footer { color:var(--muted); font-size:12.5px; margin-top:44px }
@media(max-width:820px){.facts{grid-template-columns:repeat(2,1fr)}.grid,.grid.hero{grid-template-columns:1fr}}
@media(max-width:480px){main{width:min(100% - 26px,1220px);padding-top:26px}.facts{grid-template-columns:1fr}}
"""


def build() -> str:
	return f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mutation flow under load — robotics stress gallery</title><style>{CSS}</style></head><body><main>
<h1>Mutation flow under load</h1>
<p class="lede">The specimen sheet is gone. Its replacement is one connected robotic waste-sorting program with enough nesting, ordinary dataflow, and independent mutable state to expose routing mistakes instead of politely avoiding them.</p>
<div class="facts"><div class="fact"><b>130</b><span>persisted shapes</span></div>
<div class="fact"><b>86</b><span>semantic connections</span></div>
<div class="fact"><b>6</b><span>Expanded scopes</span></div>
<div class="fact"><b>4</b><span>mutable state channels</span></div>
<div class="fact"><b>24/24</b><span>browser assertions</span></div></div>
<div class="note"><b>Fixed at the routing seam.</b> A top-edge effect port has one physical dot but two faces. The outer face points up; the inner face points down into the Expanded Block. Routing now reverses the edge normal for <code>face: inner</code>, so a nested wire approaches the same top dot from below and never escapes above its enclosing header.</div>

<h2>Before and after</h2>
<div class="grid hero">{figure('mutline-inner-face-before-2026-09-05.png', 'Before: the inner append() mutation wire exits above run(), loops around the parent header, then returns to the same top dot.')}
{figure('mutline-robotics-acquire-2026-09-05.png', 'After: frames.popleft() exits upward, stays inside acquire_scene(), and reaches the parent’s top-edge effect port from below. Ordinary RGB-D and SceneCloud cables remain visible around it.')}</div>

<h2>The stress board</h2>
{figure('mutline-robotics-browser-2026-09-05.png', 'Cold-opened real browser at fit-to-board: perception, world-model update, grasp planning, force-controlled execution, external stores, metrics, and review cues.')}
<div class="flow"><span>RGB-D</span><i>→</i><span>SceneCloud</span><i>→</i><span>TrackedObject[]</span><i>→</i><span>Grasp[]</span><i>→</i><span>PickPlan</span><i>→</i><span>JointTrajectory</span><i>→</i><span>ServoTrace</span><i>→</i><span>CycleReport</span></div>

<h2>Nesting that actually pressures the grammar</h2>
<div class="grid">{figure('mutline-robotics-root-boundaries-2026-09-05.png', 'The sort_cycle boundary carries frames, world, robot, and queue mutation paths while external metrics and persistence consumers read the resulting state.')}
{figure('mutline-robotics-servo-2026-09-05.png', 'Three levels deep: execute_pick() contains servo_loop(), which contains read, inverse-dynamics, torque-saturation, hardware mutation, and trace sampling functions connected by ordinary and effect cables.')}</div>
<p>The four state channels do different work: <code>frames</code> drains a camera buffer, <code>world</code> updates tracked objects, <code>queue</code> appends the selected pick, and <code>robot</code> crosses the deepest boundary through a 1 kHz servo loop. They are interleaved with twenty-plus typed data products rather than shown as isolated demonstrations.</p>

<h2>How the critique→fix loop converged</h2>
<table><thead><tr><th>round</th><th>critique</th><th>change</th></tr></thead><tbody>
<tr><td>1</td><td>The original board was an unframed portrait stack: clipped text, overlapping blocks, ambiguous duplicate names, and no readable review sequence.</td><td>Introduced generated sizing, framing, unique titles, a legend, and explicit review cues.</td></tr>
<tr><td>2</td><td>The structural rewrite still let cables cross captions, ordinal chips, and foreign pill areas; several nested parent labels were buried.</td><td>Reflowed the fixture around measured geometry and cold-opened it through the real editor.</td></tr>
<tr><td>3</td><td>The repaired specimen sheet was still too sterile, too shallow, and exposed an actual routing error: an inner-face effect wire looped above its enclosing Block.</td><td>Fixed face-aware routing in product code and replaced the specimens with one dense robotics program. The previous cross-cable/pill collision class disappears with the obsolete grid rather than being hidden by paint order.</td></tr>
<tr><td>Final proof</td><td>Could the same error survive at a different depth or after collapse?</td><td>Measured all nine painted nested effect routes and drove a collapse/re-expand cycle in a fresh browser.</td></tr>
</tbody></table>

<h2>Browser proof</h2>
<table><thead><tr><th>claim</th><th>measured result</th></tr></thead><tbody>
<tr><td>Inner-face direction</td><td>All nine nested effect segments leave their child top edge upward and arrive at their parent top edge from below.</td></tr>
<tr><td>Graph density</td><td>The cold-opened document reports 130 shapes, 37 real Blocks, 117 typed ports, and 86 semantic connections.</td></tr>
<tr><td>Collapse behavior</td><td>A real inspector click collapses <code>execute_pick()</code>, hiding the nested servo mutation route; re-expansion restores the same persisted connection record.</td></tr>
<tr><td>Runtime health</td><td>No local console errors during load, route measurement, collapse, or re-expansion.</td></tr>
<tr><td>Persistence</td><td>The review-fixture helper created the board through the real editor, reached autosave-clean, reloaded it cold, verified containment and bound motion, and captured the board.</td></tr>
</tbody></table>
<details><summary>Connections checked directly</summary><p><code>cycle_frames_effect</code>, <code>cycle_world_effect</code>, <code>cycle_queue_effect</code>, <code>cycle_robot_effect</code>, <code>acquire_frames_effect</code>, <code>world_effect</code>, <code>plan_queue_effect</code>, <code>execute_robot_effect</code>, and <code>servo_robot_effect</code>. Each assertion samples the painted SVG path in screen coordinates; it does not infer correctness from stored metadata.</p></details>

<div class="note orange"><b>Review gesture.</b> Open the board, inspect the nine orange boundary segments, then collapse and re-expand <code>execute_pick()</code>. The deep servo data and mutation cables should disappear and return with unchanged endpoints.</div>
<footer>Built from <a href="../{html.escape(BOARD)}"><code>{html.escape(BOARD)}</code></a> at base commit <code>{html.escape(HEAD)}</code>. Work remains uncommitted on <code>track/mutating-line-recovery</code>; no merge or promotion was performed.</footer>
</main></body></html>"""


OUTPUT.write_text(build())
print(f"wrote {OUTPUT}")
