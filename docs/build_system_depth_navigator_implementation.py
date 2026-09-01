#!/usr/bin/env python3
"""Build the self-contained SystemSketch Depth Stack implementation gallery."""

from __future__ import annotations

import base64
from pathlib import Path


DOCS = Path(__file__).resolve().parent
SCREENSHOT = DOCS / "system-depth-navigator-live-2026-09-01.png"
OUTPUT = DOCS / "system-depth-navigator-implementation-2026-09-01.html"


def main() -> None:
    screenshot = base64.b64encode(SCREENSHOT.read_bytes()).decode("ascii")
    html = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SystemSketch Depth Stack · implementation proof</title>
  <style>
    :root {{
      --ink: #1e2127;
      --muted: #676d76;
      --line: #d8d3ca;
      --paper: #f4f1ea;
      --panel: #fffdf9;
      --violet: #6b4bd6;
      --violet-soft: #eee8ff;
      --green: #25785f;
      --shadow: 0 24px 70px rgb(36 31 25 / 12%);
    }}
    * {{ box-sizing: border-box; }}
    html {{ scroll-behavior: smooth; }}
    body {{
      margin: 0;
      color: var(--ink);
      background:
        radial-gradient(circle at 8% 0%, rgb(107 75 214 / 8%), transparent 30rem),
        var(--paper);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }}
    a {{ color: inherit; }}
    .page {{ width: min(1180px, calc(100% - 32px)); margin: 0 auto; }}
    header.hero {{ padding: 64px 0 34px; }}
    .kicker {{ color: var(--violet); font: 800 11px/1 ui-monospace, monospace; letter-spacing: .14em; text-transform: uppercase; }}
    h1 {{ max-width: 850px; margin: 15px 0 18px; font: 520 clamp(48px, 7vw, 92px)/.91 Georgia, serif; letter-spacing: -.055em; }}
    .lede {{ max-width: 800px; margin: 0; color: #474b52; font-size: clamp(17px, 2vw, 23px); line-height: 1.45; }}
    .chips {{ display: flex; flex-wrap: wrap; gap: 8px; margin-top: 25px; }}
    .chip {{ padding: 8px 11px; border: 1px solid var(--line); border-radius: 999px; background: rgb(255 253 249 / 72%); font: 750 11px/1 ui-monospace, monospace; }}
    .chip.good {{ border-color: rgb(37 120 95 / 28%); color: var(--green); background: #eff8f4; }}
    .proof {{ overflow: hidden; border: 1px solid #cfc8bd; border-radius: 20px; background: #fff; box-shadow: var(--shadow); }}
    .proof-head {{ display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 14px 18px; border-bottom: 1px solid #ddd8cf; background: #fbfaf7; }}
    .proof-head b {{ font-size: 13px; }}
    .proof-head span {{ color: var(--muted); font: 750 10px/1 ui-monospace, monospace; }}
    .proof img {{ display: block; width: 100%; height: auto; background: #f8f9fa; }}
    .proof figcaption {{ padding: 12px 18px 15px; color: var(--muted); font-size: 12px; line-height: 1.5; }}
    section {{ margin-top: 52px; }}
    .section-head {{ display: grid; grid-template-columns: minmax(0, 1fr) minmax(260px, .65fr); gap: 30px; align-items: end; margin-bottom: 18px; }}
    .section-head h2 {{ margin: 4px 0 0; font: 500 clamp(30px, 4vw, 49px)/1 Georgia, serif; letter-spacing: -.035em; }}
    .section-head p {{ margin: 0; color: var(--muted); font-size: 13px; line-height: 1.55; }}
    .flow {{ display: grid; grid-template-columns: repeat(4, 1fr); overflow: hidden; border: 1px solid var(--line); border-radius: 16px; background: var(--panel); }}
    .flow article {{ position: relative; min-height: 170px; padding: 20px; border-right: 1px solid var(--line); }}
    .flow article:last-child {{ border-right: 0; }}
    .flow article:not(:last-child)::after {{ content: '→'; position: absolute; z-index: 2; top: 22px; right: -11px; display: grid; width: 21px; height: 21px; place-items: center; border: 1px solid var(--line); border-radius: 50%; color: var(--violet); background: var(--paper); font-weight: 900; }}
    .flow i {{ color: var(--violet); font: 800 10px/1 ui-monospace, monospace; font-style: normal; }}
    .flow h3 {{ margin: 22px 0 8px; font-size: 16px; }}
    .flow p {{ margin: 0; color: var(--muted); font-size: 12px; line-height: 1.5; }}
    .grid {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }}
    .card {{ min-height: 225px; padding: 20px; border: 1px solid var(--line); border-radius: 15px; background: var(--panel); }}
    .card .num {{ display: grid; width: 32px; height: 32px; place-items: center; border-radius: 9px; color: var(--violet); background: var(--violet-soft); font: 850 11px/1 ui-monospace, monospace; }}
    .card h3 {{ margin: 18px 0 8px; font-size: 18px; }}
    .card p, .card li {{ color: var(--muted); font-size: 12px; line-height: 1.55; }}
    .card ul {{ margin: 9px 0 0; padding-left: 17px; }}
    .contract {{ display: grid; grid-template-columns: .85fr 1.15fr; overflow: hidden; border: 1px solid #24272d; border-radius: 16px; color: #f5f6f8; background: #23262c; }}
    .contract > div {{ padding: 24px; }}
    .contract > div:first-child {{ border-right: 1px solid #44484f; }}
    .contract h3 {{ margin: 0 0 12px; font: 500 29px/1 Georgia, serif; }}
    .contract p {{ margin: 0; color: #bfc3ca; font-size: 13px; line-height: 1.6; }}
    .contract code {{ display: block; margin: 0 0 9px; color: #d8ccff; font: 700 12px/1.45 ui-monospace, monospace; }}
    .evidence {{ width: 100%; border-collapse: collapse; border: 1px solid var(--line); background: var(--panel); }}
    .evidence th, .evidence td {{ padding: 13px 14px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; font-size: 12px; line-height: 1.5; }}
    .evidence th {{ width: 190px; color: var(--muted); font: 800 10px/1.4 ui-monospace, monospace; text-transform: uppercase; }}
    .evidence tr:last-child th, .evidence tr:last-child td {{ border-bottom: 0; }}
    .files {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }}
    .files a {{ display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 14px 15px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); text-decoration: none; font: 700 11px/1.3 ui-monospace, monospace; }}
    .files a:hover {{ border-color: var(--violet); color: var(--violet); }}
    footer {{ margin-top: 56px; padding: 24px 0 42px; border-top: 1px solid var(--line); color: var(--muted); font-size: 11px; }}
    @media (max-width: 820px) {{
      .section-head, .contract {{ grid-template-columns: 1fr; }}
      .flow {{ grid-template-columns: 1fr 1fr; }}
      .flow article:nth-child(2) {{ border-right: 0; }}
      .flow article:nth-child(-n+2) {{ border-bottom: 1px solid var(--line); }}
      .grid {{ grid-template-columns: 1fr; }}
      .contract > div:first-child {{ border-right: 0; border-bottom: 1px solid #44484f; }}
    }}
    @media (max-width: 560px) {{
      .page {{ width: min(100% - 20px, 1180px); }}
      .flow, .files {{ grid-template-columns: 1fr; }}
      .flow article {{ border-right: 0; border-bottom: 1px solid var(--line); }}
      .flow article:last-child {{ border-bottom: 0; }}
      .flow article::after {{ display: none !important; }}
    }}
  </style>
</head>
<body>
  <main class="page">
    <header class="hero">
      <span class="kicker">SystemSketch · selected V3 implementation</span>
      <h1>Depth Stack is live.</h1>
      <p class="lede">An Expanded Block can now become the working canvas, while a compact parent stack keeps arbitrary nesting recoverable without inventing pages or C4 levels.</p>
      <div class="chips">
        <span class="chip good">97 / 97 frontend tests</span>
        <span class="chip good">24 / 24 Python tests</span>
        <span class="chip good">production build passed</span>
        <span class="chip good">browser checked · zero console errors</span>
        <span class="chip">11-level regression proof</span>
      </div>
    </header>

    <figure class="proof">
      <div class="proof-head"><b>Live depth-two scope</b><span>PAGE 1 → BLOCK → CONSUMER</span></div>
      <img src="data:image/png;base64,{screenshot}" alt="SystemSketch Block development preview focused inside Consumer at depth two, with the ancestor stack open.">
      <figcaption>The Browser exercise entered a resized parent Block, descended into its nested Consumer Block, opened the full chain, jumped directly back to the parent, and returned to the root camera. The blue-violet edge is the active Expanded Block boundary; content outside it is fully masked.</figcaption>
    </figure>

    <section>
      <div class="section-head"><div><span class="kicker">One real chain</span><h2>From concrete Block to scoped canvas</h2></div><p>The implementation composes existing tldraw bounds, camera, frame containment, and public chrome seams. Depth remains session-only UI state.</p></div>
      <div class="flow">
        <article><i>01 · CHOOSE</i><h3>Expanded Block</h3><p>Use Step in from the selection toolbar or Block menu, or double-click a non-editable Block edge/footer.</p></article>
        <article><i>02 · VALIDATE</i><h3>Real ancestry</h3><p>The target must be Expanded, on the current page, and—after the first step—a descendant of the active scope.</p></article>
        <article><i>03 · PROJECT</i><h3>Fit + boundary</h3><p>The camera fits the Block and an opaque mask makes its frame the visible, non-interactive boundary.</p></article>
        <article><i>04 · RECOVER</i><h3>Depth Stack</h3><p>Up resolves the nearest real parent. The disclosure lists root, every ancestor, current scope, and numeric depth.</p></article>
      </div>
    </section>

    <section>
      <div class="section-head"><div><span class="kicker">Interaction contract</span><h2>Fast common path, complete escape route</h2></div><p>The collapsed face stays quiet. The full ancestry appears only on request and has no fixed maximum depth.</p></div>
      <div class="grid">
        <article class="card"><span class="num">↑</span><h3>Structural Up</h3><p>One click always moves to the nearest focusable parent Block. At depth one it restores the root canvas and the exact pre-entry camera.</p></article>
        <article class="card"><span class="num">11</span><h3>Arbitrary depth</h3><p>The stack is projected from `Editor.getShapeAncestors` on every read. An ordinary regression constructs and verifies eleven levels; no level names or ceiling exist.</p></article>
        <article class="card"><span class="num">↗</span><h3>Direct ancestor jump</h3><p>Open the stack and choose any real Expanded ancestor, or choose the page row to return directly to root.</p></article>
      </div>
    </section>

    <section class="contract">
      <div><h3>View state only.</h3><p>Entering and leaving scope changes selection, camera, and an in-memory navigator store. It does not alter the diagram or create a parallel document model.</p></div>
      <div>
        <code>parentId records → unchanged</code>
        <code>Block geometry / ports / cables → unchanged</code>
        <code>.tldr serialization → unchanged</code>
        <code>root camera → captured once, restored on exit</code>
      </div>
    </section>

    <section>
      <div class="section-head"><div><span class="kicker">Verification</span><h2>Observable proof</h2></div><p>Behavior was exercised in the isolated Block Dev board so Stable documents were not used as test fixtures.</p></div>
      <table class="evidence">
        <tr><th>Live entry</th><td>Expanded Block overflow action entered depth 1, cleared selection, and animated the Block to the viewport.</td></tr>
        <tr><th>Nested scope</th><td>A nested Expanded Consumer entered depth 2; the trigger announced “Consumer, depth 2.”</td></tr>
        <tr><th>Ancestor stack</th><td>The open menu exposed Page 1, Block, and Consumer with root / ancestor / current labels and numeric depth.</td></tr>
        <tr><th>Direct recovery</th><td>Choosing Block returned to depth 1; choosing the page row and the Up action both restored root behavior.</td></tr>
        <tr><th>Automated checks</th><td>21 Vitest files / 97 tests and 24 Python tests passed. `tsc -b` and the Vite production build passed.</td></tr>
        <tr><th>Browser diagnostics</th><td>The live interaction produced no browser warnings or errors after the final opaque-mask refinement.</td></tr>
      </table>
    </section>

    <section>
      <div class="section-head"><div><span class="kicker">Source map</span><h2>Small auditable seams</h2></div><p>The core navigation model is independent of React; chrome and entry affordances delegate to it.</p></div>
      <div class="files">
        <a href="../src/depth/depthNavigation.ts"><span>depthNavigation.ts</span><span>state + camera</span></a>
        <a href="../src/depth/DepthStackNavigator.tsx"><span>DepthStackNavigator.tsx</span><span>live chrome</span></a>
        <a href="../src/depth/depth-stack-navigator.css"><span>depth-stack-navigator.css</span><span>layout + mask</span></a>
        <a href="../src/depth/depthNavigation.test.ts"><span>depthNavigation.test.ts</span><span>11-level proof</span></a>
        <a href="../src/blocks/BlockShapeUtil.tsx"><span>BlockShapeUtil.tsx</span><span>double-click entry</span></a>
        <a href="../src/blocks/ui/BlockCanvas.tsx"><span>BlockCanvas.tsx</span><span>Block menu entry</span></a>
      </div>
    </section>

    <footer>SystemSketch Depth Stack implementation proof · generated from the verified local artifact · 2026-09-01</footer>
  </main>
</body>
</html>
"""
    OUTPUT.write_text(html, encoding="utf-8")
    print(f"Built {OUTPUT}")


if __name__ == "__main__":
    main()
