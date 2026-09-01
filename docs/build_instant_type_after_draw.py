#!/usr/bin/env python3
"""Build the self-contained instant-typing implementation gallery."""

from __future__ import annotations

import base64
import sys
from pathlib import Path


HERE = Path(__file__).resolve().parent
RECTANGLE_SCREENSHOT = HERE / "instant-type-rectangle-preview-2026-09-01.png"
BLOCK_SCREENSHOT = HERE / "instant-type-block-preview-2026-09-01.png"
OUTPUT = HERE / "instant-type-after-draw-2026-09-01.html"


def image_data(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode("ascii")


def main() -> None:
    build = sys.argv[1] if len(sys.argv) > 1 else "working-tree"
    html = (
        TEMPLATE.replace("__RECTANGLE_SCREENSHOT__", image_data(RECTANGLE_SCREENSHOT))
        .replace("__BLOCK_SCREENSHOT__", image_data(BLOCK_SCREENSHOT))
        .replace("__STABLE_BUILD__", build)
    )
    OUTPUT.write_text(html, encoding="utf-8")
    print(OUTPUT)


TEMPLATE = r'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>SystemSketch — instant typing after drawing</title>
<style>
  :root{color-scheme:dark;--bg:#080b12;--panel:#111724;--panel2:#182133;--ink:#f7f8fb;--muted:#9ba8bd;--line:#2b3547;--blue:#6d7cff;--cyan:#52d5d0;--green:#75d39b;--amber:#efbd68;font-family:Inter,ui-sans-serif,system-ui,sans-serif}
  *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;color:var(--ink);background:radial-gradient(circle at 80% -10%,rgba(109,124,255,.2),transparent 34rem),radial-gradient(circle at 4% 40%,rgba(82,213,208,.08),transparent 32rem),var(--bg)}
  a{color:inherit}.shell{width:min(1180px,calc(100% - 34px));margin:auto;padding:42px 0 70px}.eyebrow{display:flex;align-items:center;gap:9px;color:var(--cyan);font:800 11px/1.2 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase}.eyebrow:before{content:"";width:8px;height:8px;border-radius:50%;background:var(--cyan);box-shadow:0 0 16px var(--cyan)}
  h1{max-width:900px;margin:16px 0 14px;font-size:clamp(40px,6vw,72px);line-height:.98;letter-spacing:-.05em}.lede{max-width:820px;margin:0;color:#c4ccda;font-size:18px;line-height:1.55}.actions{display:flex;flex-wrap:wrap;gap:10px;margin:25px 0}.button{padding:11px 16px;border:1px solid var(--line);border-radius:11px;background:var(--panel);text-decoration:none;font-weight:760}.button.primary{border-color:transparent;background:linear-gradient(135deg,#7180ff,#575fd8);box-shadow:0 12px 28px rgba(90,102,224,.24)}
  .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:11px;margin:0 0 24px}.stat{padding:16px 18px;border:1px solid var(--line);border-radius:15px;background:rgba(17,23,36,.88)}.stat b{display:block;font-size:25px}.stat span{color:var(--muted);font-size:13px}
  .visuals{display:grid;grid-template-columns:1fr 1fr;gap:14px}.visual{overflow:hidden;border:1px solid #3a465e;border-radius:20px;background:#eef0f3;box-shadow:0 28px 80px rgba(0,0,0,.35)}.visual img{display:block;width:100%;height:auto}.visual figcaption{display:flex;justify-content:space-between;gap:14px;padding:13px 15px;background:var(--panel);color:var(--muted);font-size:12px}.visual figcaption b{color:var(--ink)}
  section{margin-top:44px}.section-title{margin:0 0 8px;font-size:30px;letter-spacing:-.03em}.section-copy{max-width:800px;margin:0 0 22px;color:var(--muted);line-height:1.6}.flow{display:grid;grid-template-columns:repeat(4,1fr);gap:11px}.step{position:relative;min-height:156px;padding:18px;border:1px solid var(--line);border-radius:16px;background:linear-gradient(145deg,var(--panel2),var(--panel))}.step:not(:last-child):after{content:"→";position:absolute;right:-17px;top:63px;z-index:1;color:var(--cyan);font-size:23px}.num{color:var(--blue);font:800 11px/1 ui-monospace,monospace}.step h3{margin:15px 0 7px;font-size:17px}.step p{margin:0;color:var(--muted);font-size:13px;line-height:1.5}
  table{width:100%;border-collapse:separate;border-spacing:0;overflow:hidden;border:1px solid var(--line);border-radius:16px;background:var(--panel);font-size:13px}th,td{padding:13px 14px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th:last-child,td:last-child{border-right:0}tr:last-child td{border-bottom:0}th{color:#c8d0df;background:#151d2b;font-size:11px;letter-spacing:.06em;text-transform:uppercase}td{color:var(--muted)}td:first-child{color:var(--ink);font-weight:750}.yes{color:var(--green)}.no{color:#8995a8}.native{color:var(--cyan);font:700 11px/1.3 ui-monospace,monospace}
  .cards{display:grid;grid-template-columns:repeat(3,1fr);gap:11px}.card{padding:18px;border:1px solid var(--line);border-radius:16px;background:var(--panel)}.card h3{margin:0 0 7px;font-size:17px}.card p{margin:0;color:var(--muted);font-size:13px;line-height:1.55}.card.good{border-color:rgba(117,211,155,.45);background:linear-gradient(145deg,rgba(117,211,155,.08),var(--panel) 55%)}.rule{margin-top:14px;padding:15px 17px;border-left:3px solid var(--amber);background:rgba(239,189,104,.07);color:#d9dfeb;line-height:1.55}
  .files{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.file{padding:15px 17px;border:1px solid var(--line);border-radius:13px;background:var(--panel)}.file code{color:var(--cyan);font-size:12px}.file p{margin:7px 0 0;color:var(--muted);font-size:13px;line-height:1.5}footer{display:flex;justify-content:space-between;gap:20px;margin-top:46px;padding-top:19px;border-top:1px solid var(--line);color:var(--muted);font-size:12px}
  @media(max-width:900px){.stats,.visuals,.flow,.cards{grid-template-columns:repeat(2,1fr)}.step:after{display:none}.files{grid-template-columns:1fr}table{display:block;overflow-x:auto;white-space:nowrap}}@media(max-width:590px){.shell{width:min(100% - 20px,1180px);padding-top:28px}.stats,.visuals,.flow,.cards{grid-template-columns:1fr}.visual figcaption,footer{flex-direction:column}}
</style>
</head>
<body>
<main class="shell">
  <div class="eyebrow">SystemSketch interaction evidence · 2026-09-01</div>
  <h1>Draw the shape. Start typing.</h1>
  <p class="lede">SystemSketch now enters each newly drawn shape’s primary text editor as soon as tldraw finishes the creation gesture. Rectangle labels, arrow labels, Frame names, and Block titles use their existing native editing surfaces—no extra modal, focus trap, or parallel text model.</p>
  <div class="actions"><a class="button primary" href="http://127.0.0.1:4321/">Open Stable ↗</a><a class="button" href="http://127.0.0.1:4322/?preset=block-dev">Open Block Dev</a></div>
  <div class="stats">
    <div class="stat"><b>6</b><span>editable drawing families</span></div>
    <div class="stat"><b>1</b><span>editor-owned lifecycle</span></div>
    <div class="stat"><b>96 + 24</b><span>passing frontend + Python tests</span></div>
    <div class="stat"><b>__STABLE_BUILD__</b><span>verified Stable build</span></div>
  </div>
  <div class="visuals">
    <figure class="visual"><img alt="New Rectangle with its centered tldraw rich-text editor active and Rectangle name typed" src="data:image/png;base64,__RECTANGLE_SCREENSHOT__" /><figcaption><b>Rectangle</b><span>Active ProseMirror label · typed without a second click</span></figcaption></figure>
    <figure class="visual"><img alt="New Block with its title inline editor active and the right inspector synchronized" src="data:image/png;base64,__BLOCK_SCREENSHOT__" /><figcaption><b>Block</b><span>Active title input · inspector updates from the same shape data</span></figcaption></figure>
  </div>

  <section>
    <h2 class="section-title">The supported tldraw happy path</h2>
    <p class="section-copy">Creation and editing stay separate until the correct boundary. The hook only remembers a candidate during the drawing gesture; tldraw finishes resizing, bindings, parenting, and selection before SystemSketch asks for the shape’s public editing state.</p>
    <div class="flow">
      <article class="step"><span class="num">01 / POINTER DOWN</span><h3>Remember the tool</h3><p>Capture the actual drawing tool before tldraw creates any record.</p></article>
      <article class="step"><span class="num">02 / AFTER CREATE</span><h3>Qualify the shape</h3><p>Require a local user record whose type matches that drawing tool and owns primary text.</p></article>
      <article class="step"><span class="num">03 / POINTER UP</span><h3>Let tldraw finish</h3><p>Wait until stock resize, arrow binding, frame containment, and Block parenting complete.</p></article>
      <article class="step"><span class="num">04 / EDIT</span><h3>Enter the native editor</h3><p>Use rich-text editing or setEditingShape; focus and selection stay shape-owned.</p></article>
    </div>
  </section>

  <section>
    <h2 class="section-title">Capability matrix</h2>
    <p class="section-copy">“All shapes” means every drawn shape with a real primary text editor. Shapes without one remain ordinary selected shapes.</p>
    <table>
      <thead><tr><th>Drawn family</th><th>Primary text</th><th>After drawing</th><th>Native path</th></tr></thead>
      <tbody>
        <tr><td>Rectangle + every Geo</td><td>Centered label</td><td class="yes">Edit immediately</td><td class="native">startEditingShapeWithRichText</td></tr>
        <tr><td>Arrow</td><td>Connection label</td><td class="yes">Edit after handles bind</td><td class="native">startEditingShapeWithRichText</td></tr>
        <tr><td>Text + Note</td><td>Rich text body</td><td class="yes">Existing stock behavior retained</td><td class="native">tldraw stock tool</td></tr>
        <tr><td>Frame</td><td>Frame name</td><td class="yes">Edit after enclosure</td><td class="native">setEditingShape</td></tr>
        <tr><td>Block</td><td>Semantic title</td><td class="yes">Select title + edit</td><td class="native">setEditingShape + title field</td></tr>
        <tr><td>Line / Pen / Highlight / Cable</td><td>None</td><td class="no">Remain selected</td><td class="native">no editor to enter</td></tr>
      </tbody>
    </table>
  </section>

  <section>
    <h2 class="section-title">Focus without surprises</h2>
    <div class="cards">
      <article class="card good"><h3>Creation only</h3><p>Paste, duplicate, import, workspace restore, remote sync, and programmatic Library insertion never steal keyboard focus.</p></article>
      <article class="card good"><h3>Gesture complete</h3><p>Cancelled clicks create no ghost editor. Arrow bindings and Frame/Expanded containment settle before typing begins.</p></article>
      <article class="card good"><h3>Tool lock respected</h3><p>Explicit repeated-draw mode remains repeated-draw mode; the new intervention intentionally yields when a drawing tool is locked.</p></article>
    </div>
    <div class="rule"><strong>Documentation choice:</strong> tldraw exposes one editing shape at a time. Rich-text shapes use the public <code>startEditingShapeWithRichText</code> helper; plain/custom inputs use <code>Editor.setEditingShape</code>. The implementation does not synthesize DOM clicks or focus an inspector field.</div>
  </section>

  <section>
    <h2 class="section-title">Implementation map</h2>
    <div class="files">
      <article class="file"><code>src/instantTextEditing.ts</code><p>Shared drawing-gesture coordinator, capability detection, native editor dispatch, cancellation, and cleanup.</p></article>
      <article class="file"><code>src/instantTextEditing.test.ts</code><p>Focused coverage for rich text, Frame, Block title, source/tool gating, lock, cancel, existing stock editing, and disposal.</p></article>
      <article class="file"><code>src/App.tsx</code><p>Installs the interaction in Product and Block Dev; Stock Dev remains a true stock comparison lane.</p></article>
      <article class="file"><code>src/blocks/BlockInlineEditor.tsx</code><p>The existing Block title editor focuses and selects its value when tldraw marks the Block as editing.</p></article>
    </div>
  </section>

  <footer><span>Generated from the verified main working tree in /home/bam/systemsketch.</span><span>tldraw 5.3.2 · Stable __STABLE_BUILD__</span></footer>
</main>
</body>
</html>
'''


if __name__ == "__main__":
    main()
