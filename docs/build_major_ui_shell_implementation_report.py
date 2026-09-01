#!/usr/bin/env python3
"""Build the self-contained Major UI Shell + Block implementation gallery."""

from __future__ import annotations

import base64
from pathlib import Path


HERE = Path(__file__).resolve().parent
OUTPUT = HERE / "major-ui-shell-block-implementation-2026-08-31.html"


def data_uri(name: str) -> str:
    path = HERE / name
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


panels = data_uri("systemsketch-shell-panels-live-2026-08-31.png")
commands = data_uri("systemsketch-command-menu-live-2026-08-31.png")
nesting = data_uri("systemsketch-block-nesting-live-2026-08-31.png")

OUTPUT.write_text(
    f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>SystemSketch — Major UI Shell + Block implementation</title>
  <style>
    :root {{
      color-scheme: light;
      --ink: #20242b;
      --muted: #6d7480;
      --faint: #969da8;
      --line: #dddfe4;
      --paper: #f2f3f4;
      --card: #fff;
      --violet: #7556e8;
      --violet-soft: #ece8ff;
      --green: #247854;
      --green-soft: #e8f5ed;
      --orange: #d06138;
      --shadow: 0 24px 80px rgb(29 35 45 / 10%), 0 2px 8px rgb(29 35 45 / 6%);
    }}
    * {{ box-sizing: border-box; }}
    html {{ scroll-behavior: smooth; }}
    body {{ margin: 0; color: var(--ink); background: var(--paper); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }}
    button {{ font: inherit; }}
    .page {{ width: min(1440px, calc(100% - 32px)); margin: 0 auto; padding: 16px 0 80px; }}
    .topbar {{ position: sticky; top: 12px; z-index: 20; display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 20px; padding: 10px 12px 10px 16px; border: 1px solid rgb(32 36 43 / 10%); border-radius: 16px; background: rgb(255 255 255 / 88%); box-shadow: 0 10px 36px rgb(29 35 45 / 8%); backdrop-filter: blur(16px); }}
    .brand {{ display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 780; }}
    .brand i {{ width: 11px; height: 11px; border-radius: 4px; background: var(--violet); box-shadow: 0 0 0 5px var(--violet-soft); }}
    .topbar nav {{ display: flex; gap: 4px; }}
    .topbar a {{ padding: 8px 11px; border-radius: 9px; color: var(--muted); text-decoration: none; font-size: 11px; font-weight: 700; }}
    .topbar a:hover {{ color: var(--ink); background: #eff0f2; }}
    .hero {{ position: relative; overflow: hidden; min-height: 580px; padding: clamp(28px, 5vw, 72px); border: 1px solid #d9dbe0; border-radius: 28px; background: #fff; box-shadow: var(--shadow); }}
    .hero::before {{ content: ""; position: absolute; inset: -20% 48% 20% -10%; background: radial-gradient(circle, rgb(117 86 232 / 17%), transparent 68%); pointer-events: none; }}
    .eyebrow {{ color: var(--violet); font-size: 10px; font-weight: 850; letter-spacing: .14em; text-transform: uppercase; }}
    h1 {{ position: relative; max-width: 870px; margin: 20px 0 18px; font-size: clamp(50px, 7vw, 104px); line-height: .9; letter-spacing: -.066em; }}
    .hero p {{ position: relative; max-width: 700px; margin: 0; color: var(--muted); font-size: clamp(17px, 2vw, 23px); line-height: 1.45; letter-spacing: -.02em; }}
    .status {{ position: relative; display: flex; flex-wrap: wrap; gap: 8px; margin-top: 34px; }}
    .pill {{ display: inline-flex; align-items: center; gap: 7px; padding: 8px 11px; border: 1px solid #dedfe4; border-radius: 99px; color: #515863; background: #fff; font-size: 11px; font-weight: 760; }}
    .pill::before {{ content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--green); box-shadow: 0 0 0 4px var(--green-soft); }}
    .hero-shot {{ position: relative; width: min(1160px, 94%); margin: 54px auto -180px; overflow: hidden; border: 1px solid #d9dce2; border-radius: 18px 18px 0 0; background: #f7f8f9; box-shadow: 0 34px 85px rgb(29 35 45 / 17%); }}
    .hero-shot img {{ display: block; width: 100%; }}
    .section {{ margin-top: 28px; padding: clamp(24px, 4vw, 54px); border: 1px solid #d9dbe0; border-radius: 24px; background: #fff; box-shadow: 0 16px 58px rgb(29 35 45 / 6%); }}
    .section-head {{ display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, .7fr); gap: 28px; align-items: end; margin-bottom: 30px; }}
    h2 {{ margin: 9px 0 0; font-size: clamp(33px, 4vw, 58px); line-height: .98; letter-spacing: -.05em; }}
    .section-head p {{ margin: 0; color: var(--muted); font-size: 14px; line-height: 1.6; }}
    .evidence-controls {{ display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 14px; }}
    .evidence-controls button {{ padding: 9px 12px; border: 1px solid #d9dce2; border-radius: 10px; color: #626a75; background: #fff; cursor: pointer; font-size: 11px; font-weight: 760; }}
    .evidence-controls button[aria-pressed="true"] {{ border-color: #cfc6ff; color: #543bc7; background: var(--violet-soft); }}
    .stage {{ overflow: hidden; border: 1px solid #d8dbe1; border-radius: 18px; background: #eef0f2; box-shadow: 0 18px 50px rgb(29 35 45 / 10%); }}
    .stage img {{ display: block; width: 100%; }}
    .stage.is-cropped {{ height: clamp(390px, 52vw, 655px); }}
    .stage.is-cropped img {{ transform: translateY(-5.1%); }}
    .caption {{ display: flex; justify-content: space-between; gap: 18px; margin-top: 12px; color: var(--faint); font-size: 10px; line-height: 1.5; }}
    .caption strong {{ color: #555d67; }}
    .slot-grid {{ display: grid; grid-template-columns: repeat(12, 1fr); gap: 12px; }}
    .slot {{ min-height: 140px; padding: 18px; border: 1px solid #dedfe4; border-radius: 16px; background: #fafafa; }}
    .slot h3 {{ margin: 0 0 8px; font-size: 15px; }}
    .slot p {{ margin: 0; color: var(--muted); font-size: 12px; line-height: 1.5; }}
    .slot code {{ display: inline-block; margin-top: 16px; padding: 5px 7px; border-radius: 6px; color: #5f48bd; background: var(--violet-soft); font-size: 10px; }}
    .slot.left {{ grid-column: span 4; }} .slot.center {{ grid-column: span 5; }} .slot.right {{ grid-column: span 3; }}
    .slot.wide {{ grid-column: span 7; }} .slot.narrow {{ grid-column: span 5; }}
    .proof-grid {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }}
    .proof {{ padding: 18px; border: 1px solid #dedfe4; border-radius: 15px; }}
    .proof b {{ display: flex; align-items: center; gap: 8px; font-size: 13px; }}
    .proof b::before {{ content: "✓"; display: grid; width: 22px; height: 22px; place-items: center; border-radius: 7px; color: var(--green); background: var(--green-soft); font-size: 12px; }}
    .proof p {{ margin: 10px 0 0 30px; color: var(--muted); font-size: 11px; line-height: 1.55; }}
    .block-layout {{ display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(300px, .55fr); gap: 22px; align-items: start; }}
    .fact-list {{ display: grid; gap: 10px; }}
    .fact {{ padding: 16px; border: 1px solid #dedfe4; border-radius: 14px; background: #fafafa; }}
    .fact span {{ display: block; color: var(--violet); font-size: 9px; font-weight: 850; letter-spacing: .1em; text-transform: uppercase; }}
    .fact strong {{ display: block; margin-top: 5px; font-size: 14px; }}
    .fact p {{ margin: 6px 0 0; color: var(--muted); font-size: 11px; line-height: 1.5; }}
    table {{ width: 100%; border-collapse: collapse; }}
    th, td {{ padding: 13px 10px; border-bottom: 1px solid #e6e7ea; text-align: left; font-size: 11px; vertical-align: top; }}
    th {{ color: var(--faint); font-size: 9px; letter-spacing: .1em; text-transform: uppercase; }}
    td:first-child {{ color: #30353c; font-weight: 760; }}
    td:last-child {{ color: var(--muted); }}
    .scope {{ display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }}
    .scope article {{ padding: 20px; border-radius: 16px; }}
    .scope article:first-child {{ border: 1px solid #cbe6d5; background: #f3faf6; }}
    .scope article:last-child {{ border: 1px solid #e0d9fb; background: #f8f6ff; }}
    .scope h3 {{ margin: 0 0 10px; font-size: 15px; }}
    .scope ul {{ margin: 0; padding-left: 18px; color: var(--muted); font-size: 11px; line-height: 1.65; }}
    footer {{ display: flex; justify-content: space-between; gap: 20px; padding: 30px 6px 0; color: var(--faint); font-size: 10px; }}
    @media (max-width: 820px) {{ .topbar nav {{ display: none; }} .hero {{ min-height: auto; }} .hero-shot {{ margin-bottom: -90px; }} .section-head, .block-layout {{ grid-template-columns: 1fr; }} .slot.left, .slot.center, .slot.right, .slot.wide, .slot.narrow {{ grid-column: span 12; }} .proof-grid, .scope {{ grid-template-columns: 1fr; }} }}
    @media (prefers-reduced-motion: reduce) {{ html {{ scroll-behavior: auto; }} }}
  </style>
</head>
<body>
  <div class="page">
    <header class="topbar">
      <div class="brand"><i></i>SystemSketch · implementation gallery</div>
      <nav><a href="#shell">Shell</a><a href="#block">Block</a><a href="#proof">Proof</a><a href="#scope">Scope</a></nav>
    </header>

    <main>
      <section class="hero">
        <span class="eyebrow">Implemented · Preview verified · Aug 31, 2026</span>
        <h1>Canvas chrome that floats. A Block that belongs.</h1>
        <p>The selected direction is now live: persistent top capsules, inset popouts, an above-toolbar command surface, an on-board selection menu, and a semantic Block implemented through tldraw’s public extension seams.</p>
        <div class="status"><span class="pill">45 frontend tests</span><span class="pill">Nested Block verified</span><span class="pill">No edge-to-edge drawers</span><span class="pill">Stock tldraw lifecycle</span></div>
        <figure class="hero-shot"><img src="{panels}" alt="Live SystemSketch canvas with the shapes and comments popouts open"></figure>
      </section>

      <section class="section" id="shell">
        <header class="section-head"><div><span class="eyebrow">01 · Live shell</span><h2>One shell, four reusable surfaces.</h2></div><p>The top-right collaboration capsule is persistent. Left and right panels float with breathing room on every edge. The canvas menu uses tldraw’s popover lifecycle, and selected objects use its contextual-toolbar positioning.</p></header>
        <div class="evidence-controls" role="group" aria-label="Choose live evidence">
          <button type="button" data-evidence="panels" aria-pressed="true">Dual popouts</button>
          <button type="button" data-evidence="commands" aria-pressed="false">Above-toolbar menu</button>
        </div>
        <figure class="stage"><img id="shell-evidence" src="{panels}" alt="Live dual-popout shell"></figure>
        <div class="caption"><span id="shell-caption"><strong>Dual popouts:</strong> left and right surfaces coexist without covering the persistent top capsules.</span><span>Captured from Preview · 1280 × 720</span></div>
      </section>

      <section class="section">
        <header class="section-head"><div><span class="eyebrow">02 · Extension map</span><h2>Happy-path tldraw, region by region.</h2></div><p>Each UI family is attached at the smallest public seam that owns its behavior. A shared controller coordinates only which temporary surface is open and the order Escape closes them.</p></header>
        <div class="slot-grid">
          <article class="slot left"><h3>Top-left capsule</h3><p>Stock main menu and page menu, plus the Shapes trigger.</p><code>MenuPanel</code></article>
          <article class="slot center"><h3>Canvas + transient surfaces</h3><p>Inset popouts and selection actions live in front of the canvas without becoming a second editor.</p><code>InFrontOfTheCanvas</code></article>
          <article class="slot right"><h3>Top-right capsule</h3><p>Always visible collaboration, timer, and Share placeholders.</p><code>SharePanel</code></article>
          <article class="slot wide"><h3>Toolbar family</h3><p>The stock DefaultToolbar stays responsible for drawing tools. Block and the command menu are composed beside it.</p><code>Toolbar + TldrawUiPopover</code></article>
          <article class="slot narrow"><h3>On-board menu</h3><p>Follows the rotated selection bounds and swaps in Block-specific view commands.</p><code>TldrawUiContextualToolbar</code></article>
        </div>
      </section>

      <section class="section" id="block">
        <header class="section-head"><div><span class="eyebrow">03 · Semantic primitive</span><h2>The Block is a native participant.</h2></div><p>Block uses the stock box-tool gesture and frame-like shape utility. Its model owns title, type, description, three remembered views, and stable input/output identities; tldraw still owns selection, history, resize, parenting, clipping, and export.</p></header>
        <div class="block-layout">
          <div>
            <figure class="stage is-cropped"><img src="{nesting}" alt="A selected child Block drawn inside an expanded parent Block with the inspector open"></figure>
            <div class="caption"><span><strong>Historical regression proof:</strong> the selected child was created inside the expanded parent and remains clipped/parented by it.</span><span>Browser-only test shapes were discarded after capture.</span></div>
          </div>
          <aside class="fact-list">
            <article class="fact"><span>Model</span><strong>Simple · Port · Expanded</strong><p>Each view parks and restores its own width and height.</p></article>
            <article class="fact"><span>Containment</span><strong>Expanded means container</strong><p>Collapsed children decline creation-parenting; drag/drop can proxy to the nearest expanded ancestor.</p></article>
            <article class="fact"><span>Connections</span><strong>Stable port IDs</strong><p>Renaming and hiding a port preserve its identity. Delete remains explicitly destructive.</p></article>
            <article class="fact"><span>Inspector</span><strong>Selection is the source of truth</strong><p>Commands call public Editor APIs and never introduce a parallel canvas model.</p></article>
          </aside>
        </div>
      </section>

      <section class="section" id="proof">
        <header class="section-head"><div><span class="eyebrow">04 · Behavioral proof</span><h2>Verified as interactions, not screenshots alone.</h2></div><p>The live pass exercised the surfaces in combination. Escape closed them newest-first, Block placement activated the inspector, view changes changed geometry, and nested creation hit the historical bug path.</p></header>
        <div class="proof-grid">
          <article class="proof"><b>Persistent top-right capsule</b><p>Remains mounted while comments, inspector, and other temporary surfaces open and close.</p></article>
          <article class="proof"><b>Independent left/right popouts</b><p>Both can coexist; changing the right body does not disturb the left library.</p></article>
          <article class="proof"><b>Owned Escape order</b><p>Popover closes first through Radix/tldraw, then right popout, then left popout.</p></article>
          <article class="proof"><b>Block tool → inspector</b><p>Choosing Block activates the stock placement state and opens a read-only new-Block inspector.</p></article>
          <article class="proof"><b>Selection mini menu</b><p>Appears above the selected Block and switches Simple, Port, and Expanded views.</p></article>
          <article class="proof"><b>Expanded nesting</b><p>A child Block can be created inside an expanded Block; the child is parented and clipped correctly.</p></article>
        </div>
      </section>

      <section class="section">
        <header class="section-head"><div><span class="eyebrow">05 · Verification surface</span><h2>Small contracts around the risky seams.</h2></div><p>Tests concentrate on pure model/layout behavior, public tldraw inheritance, command semantics, chrome coordination, and the expanded-container regression.</p></header>
        <table>
          <thead><tr><th>Layer</th><th>Evidence</th></tr></thead>
          <tbody>
            <tr><td>Block model + layout</td><td>View-size round trips, stable IDs, visibility semantics, and deterministic port/layout placement.</td></tr>
            <tr><td>tldraw bridge</td><td>Frame-like shape utility, stock box tool, resize projection, and creation/translation containment rules.</td></tr>
            <tr><td>Inspector commands</td><td>Selection context, details edits, view switches, and add/update/move/hide/delete port commands.</td></tr>
            <tr><td>Shared chrome</td><td>Independent side zones, right-body replacement, and last-opened-first close order.</td></tr>
            <tr><td>Application boundary</td><td>Component, override, shape, tool, and mount seams are explicit at the root Tldraw integration.</td></tr>
          </tbody>
        </table>
      </section>

      <section class="section" id="scope">
        <header class="section-head"><div><span class="eyebrow">06 · Honest scope</span><h2>Reusable scaffolding now; product depth next.</h2></div><p>The structural system and Block primitive are real. Several menu bodies are intentionally placeholders so future features reuse the same geometry, focus rules, and state coordination.</p></header>
        <div class="scope">
          <article><h3>Working now</h3><ul><li>Persistent top capsules</li><li>Inset, coexisting popout frames</li><li>Above-toolbar command popover</li><li>Block creation, resize, export, selection, and nesting</li><li>Block inspector and connection editing</li><li>Block contextual view menu</li></ul></article>
          <article><h3>Placeholder content</h3><ul><li>Shapes-library entries</li><li>Comments data and threads</li><li>Board-overview content</li><li>Profile, timer, and Share actions</li><li>Find-and-replace and quick-color commands</li></ul></article>
        </div>
      </section>
    </main>

    <footer><span>SystemSketch · Major UI Shell + Block primitive</span><span>Implementation evidence · 2026-08-31</span></footer>
  </div>
  <script>
    const evidence = {{
      panels: {{ src: "{panels}", alt: "Live dual-popout shell", caption: "<strong>Dual popouts:</strong> left and right surfaces coexist without covering the persistent top capsules." }},
      commands: {{ src: "{commands}", alt: "Live above-toolbar command menu", caption: "<strong>Above-toolbar menu:</strong> the command surface is anchored to the toolbar and keeps both side popouts available." }}
    }};
    const image = document.querySelector("#shell-evidence");
    const caption = document.querySelector("#shell-caption");
    document.querySelectorAll("[data-evidence]").forEach((button) => {{
      button.addEventListener("click", () => {{
        const selected = evidence[button.dataset.evidence];
        image.src = selected.src;
        image.alt = selected.alt;
        caption.innerHTML = selected.caption;
        document.querySelectorAll("[data-evidence]").forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
      }});
    }});
  </script>
</body>
</html>
""",
    encoding="utf-8",
)

print(OUTPUT)
