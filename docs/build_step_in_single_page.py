#!/usr/bin/env python3
"""Build the self-contained Step In + single-canvas implementation gallery."""

from __future__ import annotations

import base64
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
ASSETS = DOCS / "assets"
OUTPUT = DOCS / "step-in-single-page-2026-09-02.html"


def data_url(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def main() -> None:
    migration = data_url(ASSETS / "step-in-single-page-migration-2026-09-02.png")
    isolation = data_url(ASSETS / "step-in-single-page-isolation-2026-09-02.png")
    fixture = data_url(ROOT / "sketches/review/step-in-single-page.png")
    results = json.loads((ASSETS / "step-in-single-page-results.json").read_text())
    passed = sum(1 for check in results["checks"] if check["ok"])
    total = len(results["checks"])

    html = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SystemSketch · true Step In + one canvas</title>
  <style>
    :root {{ --ink:#17202b; --muted:#66707c; --paper:#f4f6f8; --panel:#fff; --line:#d9dee5; --blue:#2f80ed; --soft:#eaf3ff; --green:#18794e; --orange:#e57b25; }}
    * {{ box-sizing:border-box }}
    body {{ margin:0; color:var(--ink); background:radial-gradient(circle at 8% 0%,#dcecff 0,transparent 30rem),var(--paper); font-family:Inter,ui-sans-serif,system-ui,sans-serif }}
    a {{ color:inherit }}
    .page {{ width:min(1220px,calc(100% - 32px)); margin:auto }}
    .hero {{ padding:66px 0 34px }}
    .eyebrow {{ color:var(--blue); font:800 11px/1 ui-monospace,monospace; letter-spacing:.14em; text-transform:uppercase }}
    h1 {{ max-width:1000px; margin:14px 0 18px; font:520 clamp(48px,7vw,88px)/.93 Georgia,serif; letter-spacing:-.055em }}
    .lede {{ max-width:900px; margin:0; color:#48515d; font-size:clamp(17px,2vw,22px); line-height:1.48 }}
    .chips {{ display:flex; flex-wrap:wrap; gap:8px; margin-top:24px }}
    .chip {{ padding:8px 11px; border:1px solid var(--line); border-radius:999px; background:#ffffffb8; font:750 11px/1 ui-monospace,monospace }}
    .chip.good {{ color:var(--green); border-color:#a8d7c1; background:#eff9f4 }}
    section {{ margin:54px 0 }}
    .section-head {{ display:grid; grid-template-columns:1fr .65fr; gap:28px; align-items:end; margin-bottom:17px }}
    h2 {{ margin:5px 0 0; font:520 clamp(31px,4vw,50px)/1 Georgia,serif; letter-spacing:-.035em }}
    .section-head p {{ margin:0; color:var(--muted); font-size:13px; line-height:1.55 }}
    .proof {{ overflow:hidden; margin:0; border:1px solid var(--line); border-radius:20px; background:var(--panel); box-shadow:0 22px 60px #20304017 }}
    .proof img {{ display:block; width:100%; height:auto }}
    .proof figcaption {{ padding:14px 18px; color:var(--muted); border-top:1px solid var(--line); font-size:12px; line-height:1.55 }}
    .tabs {{ display:flex; gap:7px; padding:10px; border-bottom:1px solid var(--line); background:#f9fafb }}
    .tabs button {{ padding:9px 13px; border:1px solid var(--line); border-radius:9px; color:var(--muted); background:#fff; font-weight:750; cursor:pointer }}
    .tabs button[aria-selected="true"] {{ color:#1559a8; border-color:#a7c9f7; background:var(--soft) }}
    .frame {{ display:none }} .frame.active {{ display:block }}
    .changes {{ display:grid; grid-template-columns:repeat(3,1fr); gap:13px }}
    .change {{ min-height:220px; padding:20px; border:1px solid var(--line); border-radius:15px; background:var(--panel) }}
    .change b {{ display:grid; width:34px; height:34px; place-items:center; color:var(--blue); background:var(--soft); border-radius:10px; font:850 11px/1 ui-monospace,monospace }}
    .change h3 {{ margin:18px 0 8px; font-size:18px }}
    .change p {{ margin:0; color:var(--muted); font-size:12px; line-height:1.6 }}
    .change code {{ color:#185da8; font-size:11px }}
    .flow {{ display:grid; grid-template-columns:repeat(4,1fr); overflow:hidden; border:1px solid #252b33; border-radius:16px; color:#f8fafc; background:#20262e }}
    .flow article {{ position:relative; min-height:175px; padding:20px; border-right:1px solid #424b56 }}
    .flow article:last-child {{ border:0 }}
    .flow article:not(:last-child)::after {{ content:'→'; position:absolute; top:21px; right:-12px; z-index:2; display:grid; width:23px; height:23px; place-items:center; border:1px solid #4b5663; border-radius:50%; color:#8ec2ff; background:#20262e }}
    .flow i {{ color:#8ec2ff; font:800 10px/1 ui-monospace,monospace; font-style:normal }}
    .flow h3 {{ margin:22px 0 8px; font-size:15px }} .flow p {{ margin:0; color:#b8c1cc; font-size:12px; line-height:1.55 }}
    table {{ width:100%; border-collapse:collapse; border:1px solid var(--line); background:var(--panel) }}
    th,td {{ padding:13px 15px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; font-size:12px; line-height:1.5 }}
    th {{ width:205px; color:var(--muted); font:800 10px/1.4 ui-monospace,monospace; text-transform:uppercase }} tr:last-child>* {{ border-bottom:0 }}
    .review {{ display:grid; grid-template-columns:1.25fr .75fr; gap:18px; align-items:start }}
    .review .proof {{ border-color:#b7d8c7 }}
    .review-copy {{ padding:22px; border:1px solid var(--line); border-radius:15px; background:var(--panel) }}
    .review-copy h3 {{ margin:0 0 12px; font:520 28px/1.05 Georgia,serif }}
    .review-copy p,.review-copy li {{ color:var(--muted); font-size:12px; line-height:1.6 }}
    .review-copy a {{ display:block; margin-top:14px; padding:12px 14px; border-radius:9px; color:white; background:var(--blue); text-align:center; text-decoration:none; font-weight:800 }}
    .files {{ display:grid; grid-template-columns:repeat(2,1fr); gap:10px }}
    .files a {{ display:flex; justify-content:space-between; gap:20px; padding:14px; border:1px solid var(--line); border-radius:10px; background:var(--panel); text-decoration:none; font:700 11px/1.3 ui-monospace,monospace }}
    footer {{ margin-top:60px; padding:26px 0 42px; border-top:1px solid var(--line); color:var(--muted); font-size:11px }}
    @media(max-width:820px) {{ .section-head,.review {{ grid-template-columns:1fr }} .changes {{ grid-template-columns:1fr }} .flow {{ grid-template-columns:1fr 1fr }} .flow article:nth-child(2) {{ border-right:0 }} }}
    @media(max-width:560px) {{ .flow,.files {{ grid-template-columns:1fr }} .flow article {{ border-right:0; border-bottom:1px solid #424b56 }} .flow article::after {{ display:none!important }} }}
  </style>
</head>
<body>
<main class="page">
  <header class="hero">
    <span class="eyebrow">SystemSketch · implementation proof · 2026-09-02</span>
    <h1>Step In is now a real board boundary.</h1>
    <p class="lede">No canvas-coloured mask, no leaking siblings, and no clipped ports or resize controls. SystemSketch files expose one canvas; old tldraw pages migrate into named stock Frames, while Depth Stack takes the page selector's former place.</p>
    <div class="chips"><span class="chip good">{passed} / {total} browser checks</span><span class="chip good">real pointer resize</span><span class="chip good">migration persisted + reopened</span><span class="chip">tldraw 5.3.2 unchanged</span></div>
  </header>

  <figure class="proof" id="proof">
    <div class="tabs" role="tablist" aria-label="Implementation evidence">
      <button role="tab" aria-selected="true" data-target="isolation">True isolation</button>
      <button role="tab" aria-selected="false" data-target="migration">Page migration</button>
    </div>
    <div class="frame active" data-frame="isolation"><img src="{isolation}" alt="A selected expanded run block in true Step In scope, with all ports and resize controls visible and the Depth Stack open beside the filename."></div>
    <div class="frame" data-frame="migration"><img src="{migration}" alt="Two named stock Frames, Architecture and Runtime, laid out side by side after importing a two-page tldraw file."></div>
    <figcaption>These are full-product CDP captures from the same 22-check journey. The isolation image follows a physical stock-handle resize; the migration image follows a cold open and an on-disk autosave check.</figcaption>
  </figure>

  <section>
    <div class="section-head"><div><span class="eyebrow">Three corrections</span><h2>Behavior changed at the right seam</h2></div><p>The canvas engine still owns selection, resizing, parenting, Frames, camera, and hit testing. SystemSketch supplies policy through supported visibility, component, and load seams.</p></div>
    <div class="changes">
      <article class="change"><b>01</b><h3>Mask → visibility</h3><p>The four opaque rectangles are gone. <code>getShapeVisibility</code> returns hidden for every shape outside the active Block, removing it from paint and pointer hit testing together.</p></article>
      <article class="change"><b>02</b><h3>Pages → Frames</h3><p>The product is capped at one tldraw page. A loaded multi-page document becomes a grid of named stock Frames, with children reparented, comments relocated, and the result saved.</p></article>
      <article class="change"><b>03</b><h3>Selector → Depth Stack</h3><p>The stock page selector leaves the product shell. Depth Stack occupies that exact capsule slot at root and continues to expose structural Up and direct ancestor jumps in scope.</p></article>
    </div>
  </section>

  <section>
    <div class="section-head"><div><span class="eyebrow">Import path</span><h2>One deterministic migration</h2></div><p>The source remains readable tldraw data. Migration happens immediately after parsing, before ordinary editing listeners attach, then explicitly enters autosave so the next open sees the same one-canvas document.</p></div>
    <div class="flow">
      <article><i>01 · READ</i><h3>Sort old pages</h3><p>Stable page index and id order determine Frame order; the first internal page becomes the sole root canvas.</p></article>
      <article><i>02 · FRAME</i><h3>Measure + name</h3><p>One stock Frame per former page receives its page name, source metadata, padding, and a non-overlapping grid position.</p></article>
      <article><i>03 · MOVE</i><h3>Reparent records</h3><p>Top-level shapes retain their page-local coordinates inside the Frame. Page, point, and region comment anchors move with them.</p></article>
      <article><i>04 · SAVE</i><h3>Commit the result</h3><p>Extra pages are deleted, maxPages is one, and both desktop and embedded hosts serialize the migrated snapshot.</p></article>
    </div>
  </section>

  <section>
    <div class="section-head"><div><span class="eyebrow">Acceptance</span><h2>Claims tied to observations</h2></div><p>The proof checks the persisted records and the painted product independently, then uses the actual overlay hit target and real pointer events for the resize.</p></div>
    <table>
      <tr><th>Isolation</th><td>Outside sibling and note records report hidden and have no painted DOM node; the active Block explicitly remains visible with its child.</td></tr>
      <tr><th>Controls</th><td>Input and output port circles cross the perimeter, the pointer reaches <code>selection_fg:bottom_left</code>, and tldraw enters pointing-resize then resizing.</td></tr>
      <tr><th>Stretch regression</th><td>The physical corner drag grows the Block while every unrelated record remains hidden; there is no mask element to uncover stale content.</td></tr>
      <tr><th>One canvas</th><td>A genuine two-page <code>.tldr</code> reopens as one page plus two named Frames, and the same one-page structure is read back from disk after autosave.</td></tr>
      <tr><th>Chrome</th><td>The old page trigger is absent. A root-aware Depth Stack is inside the top-left shell and shows Board at depth 0 plus run() at depth 1.</td></tr>
    </table>
  </section>

  <section>
    <div class="section-head"><div><span class="eyebrow">Human pass</span><h2>Ready-to-drive review board</h2></div><p>The fixture is small, disposable, single-canvas, and generated through the product editor rather than handwritten schema JSON.</p></div>
    <div class="review">
      <figure class="proof"><img src="{fixture}" alt="Review board with run, decode, unrelated content, three orange instructions, and a green pass card."><figcaption>Before entry, unrelated content makes the isolation result obvious. On Step In, only run() and decode() remain.</figcaption></figure>
      <aside class="review-copy"><h3>Three gestures</h3><ol><li>Select <b>run()</b> and choose <b>Step in</b>.</li><li>Select the boundary and resize from a corner.</li><li>Open Depth Stack beside the filename.</li></ol><p><b>Pass:</b> no unrelated object appears; ports and the stock handle remain visible and draggable; the stack reads Board → run().</p><a href="../sketches/review/step-in-single-page.systemsketch">Open fixture file</a></aside>
    </div>
  </section>

  <section>
    <div class="section-head"><div><span class="eyebrow">Source map</span><h2>Auditable implementation surfaces</h2></div><p>Every source link is relative to this report in the repository.</p></div>
    <div class="files">
      <a href="../src/blocks/blockVisibility.ts"><span>blockVisibility.ts</span><span>true scope</span></a>
      <a href="../src/depth/depthNavigation.ts"><span>depthNavigation.ts</span><span>reactive scope</span></a>
      <a href="../src/depth/DepthStackNavigator.tsx"><span>DepthStackNavigator.tsx</span><span>in-slot menu</span></a>
      <a href="../src/singlePageDocument.ts"><span>singlePageDocument.ts</span><span>page → Frame</span></a>
      <a href="../src/workspace/LocalWorkspace.tsx"><span>LocalWorkspace.tsx</span><span>migration save</span></a>
      <a href="../tests/step_in_single_page_smoke.mjs"><span>step_in_single_page_smoke.mjs</span><span>22 checks</span></a>
    </div>
  </section>
  <footer>SystemSketch true Step In + one-canvas gallery · generated from live-tree evidence · 2026-09-02</footer>
</main>
<script>
  document.querySelectorAll('[role="tab"]').forEach((button) => button.addEventListener('click', () => {{
    document.querySelectorAll('[role="tab"]').forEach((item) => item.setAttribute('aria-selected', String(item === button)))
    document.querySelectorAll('[data-frame]').forEach((frame) => frame.classList.toggle('active', frame.dataset.frame === button.dataset.target))
  }}))
</script>
</body>
</html>
"""
    OUTPUT.write_text(html, encoding="utf-8")
    print(f"Built {OUTPUT}")


if __name__ == "__main__":
    main()
