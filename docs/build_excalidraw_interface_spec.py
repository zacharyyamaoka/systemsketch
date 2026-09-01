from __future__ import annotations

import base64
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = PROJECT_ROOT / "docs" / "excalidraw-interface-spec-2026-08-30.html"

REFERENCE_IMAGES = {
    "vanilla": Path("/home/bam/pyblocks/docs/screenshots/excalidraw-menu-reference-2026-08-30.png"),
    "properties": Path("/home/bam/pyblocks/docs/screenshots/excalidraw-properties-reference-2026-08-30.png"),
    "main_menu": Path("/home/bam/pyblocks/docs/screenshots/excalidraw-main-menu-reference-2026-08-30.png"),
    "prior_proposal": Path("/home/bam/zach_brain/Pasted image 20260830105716.png"),
}


def image_data_url(image_path: Path) -> str:
    image_bytes = image_path.read_bytes()
    mime_type = "image/jpeg" if image_bytes.startswith(b"\xff\xd8") else "image/png"
    return f"data:{mime_type};base64,{base64.b64encode(image_bytes).decode('ascii')}"


embedded_images = {name: image_data_url(path) for name, path in REFERENCE_IMAGES.items()}

html = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SystemSketch × Excalidraw interface sheet</title>
  <style>
    :root {{
      --ink: #171925;
      --muted: #69697c;
      --line: #dedee9;
      --soft-line: #ececf3;
      --paper: #ffffff;
      --wash: #f7f6fb;
      --purple: #6965db;
      --purple-soft: #eeedff;
      --blue: #4263eb;
      --green: #159447;
      --shadow: 0 18px 54px rgba(31, 29, 58, .11);
      color-scheme: light;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }}
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; color: var(--ink); background: linear-gradient(180deg, #fbfaff 0, #f6f5fa 560px, #f3f2f7 100%); }}
    button {{ font: inherit; }}
    .page {{ width: min(1420px, calc(100% - 36px)); margin: 0 auto; padding: 42px 0 80px; }}
    .eyebrow {{ margin: 0 0 8px; color: var(--purple); font-size: 12px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }}
    h1 {{ max-width: 860px; margin: 0; font-size: clamp(36px, 6vw, 72px); line-height: .98; letter-spacing: -.055em; }}
    .lede {{ max-width: 850px; margin: 20px 0 0; color: #505064; font-size: 18px; line-height: 1.65; }}
    .boundary {{ display: flex; gap: 10px; flex-wrap: wrap; margin-top: 22px; }}
    .chip {{ padding: 8px 11px; border: 1px solid var(--line); border-radius: 999px; background: rgba(255,255,255,.78); color: #545468; font-size: 12px; font-weight: 700; }}
    .chip strong {{ color: var(--ink); }}
    .switcher {{ position: sticky; top: 12px; z-index: 30; display: inline-flex; gap: 6px; margin: 34px 0 22px; padding: 6px; border: 1px solid var(--line); border-radius: 14px; background: rgba(255,255,255,.88); box-shadow: 0 8px 28px rgba(38,35,63,.1); backdrop-filter: blur(16px); }}
    .switcher button, .state-switch button {{ border: 0; border-radius: 10px; background: transparent; color: #666579; cursor: pointer; font-weight: 750; }}
    .switcher button {{ padding: 10px 14px; }}
    .switcher button.active, .state-switch button.active {{ color: #3733a8; background: var(--purple-soft); box-shadow: inset 0 0 0 1px #c8c5ff; }}
    .layer {{ display: none; }}
    .layer.active {{ display: block; }}
    .section-head {{ display: grid; grid-template-columns: minmax(0, 1fr) minmax(260px, 440px); gap: 32px; align-items: end; margin-bottom: 20px; }}
    .section-head h2 {{ margin: 0; font-size: clamp(28px, 4vw, 48px); letter-spacing: -.035em; }}
    .section-head p {{ margin: 0; color: var(--muted); line-height: 1.55; }}
    .figure {{ margin: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 22px; background: var(--paper); box-shadow: var(--shadow); }}
    .figure img {{ display: block; width: 100%; height: auto; }}
    figcaption {{ display: flex; justify-content: space-between; gap: 20px; padding: 14px 17px; border-top: 1px solid var(--soft-line); color: var(--muted); font-size: 12px; }}
    figcaption strong {{ color: var(--ink); }}
    .grid-3 {{ display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 14px; margin-top: 14px; }}
    .card {{ padding: 19px; border: 1px solid var(--line); border-radius: 17px; background: rgba(255,255,255,.87); }}
    .card .number {{ display: grid; place-items: center; width: 28px; height: 28px; margin-bottom: 14px; border-radius: 9px; color: #403cb5; background: var(--purple-soft); font-size: 12px; font-weight: 900; }}
    .card h3, .card h4 {{ margin: 0 0 8px; font-size: 16px; }}
    .card p, .card li {{ color: #5d5d70; font-size: 13px; line-height: 1.55; }}
    .card p {{ margin: 0; }}
    .card ul {{ margin: 10px 0 0; padding-left: 18px; }}
    .card li + li {{ margin-top: 5px; }}
    .tool-strip {{ display: flex; gap: 7px; overflow-x: auto; margin: 16px 0 0; padding: 13px; border: 1px solid var(--line); border-radius: 16px; background: #fff; }}
    .tool {{ flex: 0 0 auto; display: grid; place-items: center; min-width: 57px; height: 55px; padding: 5px 7px; border: 1px solid #e8e7ef; border-radius: 11px; background: #fafafd; color: #454456; font-size: 11px; font-weight: 750; }}
    .tool b {{ display: block; color: #232331; font-size: 16px; }}
    .tool.active {{ border-color: #c4c1ff; color: #4741bf; background: var(--purple-soft); }}
    .reference-closeups {{ display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 14px; }}
    .reference-closeups img {{ aspect-ratio: 16/9; object-fit: cover; object-position: top left; }}
    .contract-table {{ width: 100%; margin-top: 14px; border-collapse: separate; border-spacing: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 16px; background: #fff; }}
    .contract-table th, .contract-table td {{ padding: 13px 14px; border-bottom: 1px solid var(--soft-line); vertical-align: top; text-align: left; font-size: 13px; line-height: 1.5; }}
    .contract-table th {{ width: 22%; color: #4e4d61; background: #fafafd; }}
    .contract-table tr:last-child th, .contract-table tr:last-child td {{ border-bottom: 0; }}
    .state-switch {{ display: inline-flex; gap: 5px; margin: 0 0 12px; padding: 5px; border: 1px solid var(--line); border-radius: 12px; background: #fff; }}
    .state-switch button {{ padding: 8px 11px; font-size: 12px; }}
    .mock-shell {{ position: relative; min-height: 720px; overflow: hidden; border: 12px solid #e6e5ec; border-radius: 28px; background-color: #fff; background-image: radial-gradient(#d6d4e3 1px, transparent 1px); background-size: 23px 23px; box-shadow: var(--shadow); }}
    .island {{ position: absolute; display: flex; align-items: center; border: 1px solid rgba(37,36,55,.11); background: rgba(255,255,255,.96); box-shadow: 0 6px 19px rgba(31,29,58,.11); }}
    .mock-menu {{ top: 15px; left: 15px; width: 42px; height: 42px; justify-content: center; border-radius: 11px; font-size: 20px; }}
    .file-pill {{ top: 15px; left: 68px; gap: 8px; height: 42px; padding: 0 13px; border-radius: 11px; font-size: 12px; font-weight: 750; }}
    .dirty-dot {{ width: 7px; height: 7px; border-radius: 50%; background: var(--blue); }}
    .mock-toolbar {{ top: 15px; left: 50%; transform: translateX(-50%); gap: 4px; height: 52px; padding: 5px 7px; border-radius: 13px; }}
    .mock-tool {{ position: relative; display: grid; place-items: center; width: 38px; height: 38px; border-radius: 9px; color: #252533; font-size: 16px; font-weight: 650; }}
    .mock-tool small {{ position: absolute; right: 3px; bottom: 1px; color: #89879d; font-size: 8px; font-weight: 800; }}
    .mock-tool.selected {{ color: #453fb8; background: #e8e6ff; }}
    .mock-divider {{ width: 1px; height: 28px; margin: 0 3px; background: #e5e3ed; }}
    .mock-tool.domain {{ color: #2b4c9c; background: #edf3ff; }}
    .update-control {{ top: 15px; right: 15px; gap: 7px; height: 42px; padding: 0 13px; border-radius: 999px; color: #303341; font-size: 11px; font-weight: 800; }}
    .update-dot {{ width: 8px; height: 8px; border-radius: 50%; background: var(--green); box-shadow: 0 0 0 3px rgba(21,148,71,.1); }}
    .appearance {{ top: 88px; left: 15px; width: 190px; display: block; padding: 15px; border-radius: 14px; }}
    .appearance h4 {{ margin: 0 0 13px; font-size: 12px; }}
    .swatches {{ display: flex; gap: 8px; margin-bottom: 14px; }}
    .swatch {{ width: 23px; height: 23px; border: 2px solid #fff; border-radius: 7px; box-shadow: 0 0 0 1px #d7d5df; }}
    .panel-row {{ display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 10px; color: #68677a; font-size: 10px; }}
    .tiny-options {{ display: flex; gap: 4px; }}
    .tiny-options span {{ display: grid; place-items: center; min-width: 28px; height: 26px; padding: 0 5px; border-radius: 7px; background: #f4f3f8; color: #383746; font-weight: 800; }}
    .block-card {{ position: absolute; top: 310px; left: 50%; width: 290px; transform: translateX(-50%); overflow: visible; border: 1.5px solid #8f8ca2; border-radius: 13px; background: #fff; box-shadow: 0 10px 24px rgba(42,40,67,.11); }}
    .block-title {{ padding: 15px 17px 12px; border-bottom: 1px solid #e6e4ed; font-weight: 850; }}
    .block-meta {{ display: flex; justify-content: space-between; padding: 14px 17px; color: #615f73; font-size: 12px; }}
    .port {{ position: absolute; top: 66px; width: 12px; height: 12px; border: 2px solid #fff; border-radius: 50%; background: var(--blue); box-shadow: 0 0 0 1px var(--blue); }}
    .port.in {{ left: -7px; }}
    .port.out {{ right: -7px; }}
    .context-menu {{ top: 470px; left: calc(50% + 165px); width: 185px; display: block; padding: 7px; border-radius: 13px; }}
    .context-menu div {{ display: flex; justify-content: space-between; padding: 9px 10px; border-radius: 8px; color: #4f4e61; font-size: 11px; font-weight: 700; }}
    .context-menu div:hover {{ background: #f3f2f8; }}
    .connection-badge {{ position: absolute; top: 370px; left: calc(50% + 180px); padding: 7px 9px; border: 1px solid #c9c6ff; border-radius: 999px; color: #4640b6; background: #f0efff; font-size: 10px; font-weight: 850; }}
    .zoom {{ bottom: 15px; left: 15px; gap: 15px; padding: 11px 15px; border-radius: 12px; font-size: 12px; }}
    .help {{ right: 15px; bottom: 15px; width: 42px; height: 42px; justify-content: center; border-radius: 11px; font-weight: 900; }}
    .state-no-selection .appearance, .state-no-selection .block-card, .state-no-selection .context-menu, .state-no-selection .connection-badge {{ display: none; }}
    .state-block-selected .connection-badge {{ display: none; }}
    .state-connection-selected .block-card, .state-connection-selected .context-menu {{ display: none; }}
    .state-connection-selected .appearance h4::after {{ content: "Connection appearance"; }}
    .state-connection-selected .appearance h4 {{ font-size: 0; }}
    .state-connection-selected .appearance h4::after {{ font-size: 12px; }}
    .state-connection-selected .connection-badge {{ display: block; }}
    .legend {{ display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px; margin-top: 14px; }}
    .legend .card {{ display: grid; grid-template-columns: auto 1fr; gap: 12px; }}
    .legend .number {{ margin: 0; }}
    .rule {{ margin-top: 14px; padding: 16px 18px; border-left: 4px solid var(--purple); border-radius: 4px 14px 14px 4px; background: #f0efff; color: #4f4b73; font-size: 14px; line-height: 1.55; }}
    .acceptance {{ display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px 20px; margin: 14px 0 0; padding: 18px; border: 1px solid #d9d7e4; border-radius: 16px; background: #fff; }}
    .acceptance div {{ display: flex; gap: 9px; color: #555469; font-size: 13px; line-height: 1.45; }}
    .check {{ color: var(--green); font-weight: 900; }}
    .scope-note {{ margin-top: 16px; color: #777589; font-size: 12px; line-height: 1.6; }}
    @media (max-width: 980px) {{
      .section-head, .grid-3, .reference-closeups, .legend {{ grid-template-columns: 1fr; }}
      .mock-shell {{ min-height: 650px; }}
      .mock-toolbar {{ top: 70px; max-width: calc(100% - 30px); overflow-x: auto; }}
      .appearance {{ top: 138px; }}
      .update-control {{ right: 15px; }}
      .file-pill {{ max-width: 42vw; overflow: hidden; white-space: nowrap; }}
    }}
    @media (max-width: 620px) {{
      .page {{ width: min(100% - 20px, 1420px); padding-top: 28px; }}
      .switcher {{ display: flex; width: 100%; }}
      .switcher button {{ flex: 1; padding-inline: 8px; font-size: 12px; }}
      .grid-3, .acceptance {{ grid-template-columns: 1fr; }}
      .mock-shell {{ min-height: 710px; border-width: 7px; }}
      .update-control {{ top: 15px; right: 15px; max-width: 160px; overflow: hidden; white-space: nowrap; }}
      .file-pill {{ display: none; }}
      .appearance {{ width: 166px; }}
      .block-card {{ width: 240px; }}
      .context-menu {{ left: auto; right: 15px; }}
    }}
  </style>
</head>
<body>
  <main class="page">
    <p class="eyebrow">SystemSketch · interface baseline · 30 Aug 2026</p>
    <h1>Excalidraw first.<br>SystemSketch second.</h1>
    <p class="lede">A two-layer interface sheet: preserve the vanilla Excalidraw spatial and interaction grammar as the reference oracle, then add SystemSketch capabilities in explicit adjacent seams. The canvas engine remains tldraw; this sheet governs what the human sees and learns.</p>
    <div class="boundary">
      <span class="chip"><strong>Engine</strong> tldraw 5.3.2</span>
      <span class="chip"><strong>Shared UI oracle</strong> Excalidraw</span>
      <span class="chip"><strong>Extension rule</strong> additive, never slot-shifting</span>
      <span class="chip"><strong>Current foundation</strong> stock tldraw + update pill</span>
    </div>

    <nav class="switcher" aria-label="Interface layers">
      <button class="active" data-layer="vanilla">1 · Raw vanilla Excalidraw</button>
      <button data-layer="extensions">2 · SystemSketch extensions</button>
    </nav>

    <section class="layer active" id="vanilla">
      <header class="section-head">
        <h2>1. Raw vanilla Excalidraw</h2>
        <p>This is the control surface. No Block tool, no release pill, no semantic inspector, no SystemSketch file chrome. Shared tools should feel unsurprising before any extension is added.</p>
      </header>

      <figure class="figure">
        <img src="{embedded_images['vanilla']}" alt="Captured vanilla Excalidraw interface with blank canvas and toolbar">
        <figcaption><strong>Captured upstream oracle</strong><span>blank canvas · top tool island · transient chrome</span></figcaption>
      </figure>

      <div class="grid-3">
        <article class="card"><span class="number">01</span><h3>Quiet at rest</h3><p>The canvas dominates. Only the main menu, tool island, top-right controls, zoom/history, and help remain. Selection-only controls stay absent until there is a target.</p></article>
        <article class="card"><span class="number">02</span><h3>Spatial muscle memory</h3><p>The shared tool order and numbered slots are stable. New capabilities never insert themselves between familiar shared tools.</p></article>
        <article class="card"><span class="number">03</span><h3>Context owns detail</h3><p>Appearance and actions appear beside the canvas only when relevant. Menus close after commands; the interface never becomes a permanent wall of controls.</p></article>
      </div>

      <div class="tool-strip" aria-label="Vanilla Excalidraw tool order">
        <span class="tool"><b>⌾</b>Lock</span><span class="tool"><b>☝</b>Hand</span><span class="tool active"><b>↖</b>Select · 1</span><span class="tool"><b>□</b>Rect · 2</span><span class="tool"><b>◇</b>Diamond · 3</span><span class="tool"><b>○</b>Ellipse · 4</span><span class="tool"><b>→</b>Arrow · 5</span><span class="tool"><b>—</b>Line · 6</span><span class="tool"><b>⌁</b>Draw · 7</span><span class="tool"><b>A</b>Text · 8</span><span class="tool"><b>▧</b>Image · 9</span><span class="tool"><b>⌫</b>Eraser · 0</span><span class="tool"><b>⋮</b>More</span>
      </div>

      <div class="reference-closeups">
        <figure class="figure"><img src="{embedded_images['properties']}" alt="Excalidraw contextual properties panel"><figcaption><strong>Selection state</strong><span>appearance and actions only when needed</span></figcaption></figure>
        <figure class="figure"><img src="{embedded_images['main_menu']}" alt="Excalidraw main menu"><figcaption><strong>Main menu</strong><span>document and app commands in one transient island</span></figcaption></figure>
      </div>

      <table class="contract-table">
        <tr><th>Navigation</th><td>Wheel pans; Ctrl/pinch zooms; Space or Hand pans while dragging. Zoom/history stay bottom-left and help stays bottom-right.</td></tr>
        <tr><th>Selection</th><td>Four small hollow corner handles, a hairline perimeter, and a small rotation handle on a stem. Text keeps horizontal side handles because they change wrapping width without changing font size.</td></tr>
        <tr><th>Text</th><td>Double-click or Enter begins editing. Side-handle resizing changes line wrapping; it does not geometrically scale the font.</td></tr>
        <tr><th>Properties</th><td>Contextual left island: stroke/fill, style, font, alignment, opacity, layers, duplicate/delete/link, with only controls meaningful to the current selection.</td></tr>
        <tr><th>Menus</th><td>Main and context menus are command surfaces, not miniature inspectors. A command acts, then the menu gets out of the way.</td></tr>
      </table>

      <div class="acceptance">
        <div><span class="check">✓</span><span>Shared tools retain Excalidraw ordering, geometry, hover/selected/focus states, tooltips, and displayed shortcuts.</span></div>
        <div><span class="check">✓</span><span>Blank/no-selection state contains no SystemSketch-specific chrome in this control layer.</span></div>
        <div><span class="check">✓</span><span>Escape, click-away, focus return, duplicate/delete, undo/redo, and text edit semantics match the captured oracle.</span></div>
        <div><span class="check">✓</span><span>The vanilla layer is an oracle, not a second document model or an embedded Excalidraw runtime.</span></div>
      </div>
    </section>

    <section class="layer" id="extensions">
      <header class="section-head">
        <h2>2. Proposed SystemSketch extensions</h2>
        <p>Everything unique to SystemSketch is visibly additive: an adjacent domain group, semantic context menus, on-canvas editing, and one host-owned update pill docked at the edge of the top chrome.</p>
      </header>

      <div class="state-switch" aria-label="Mock interface state">
        <button data-state="no-selection">Nothing selected</button>
        <button class="active" data-state="block-selected">Block selected</button>
        <button data-state="connection-selected">Connection selected</button>
      </div>

      <div class="mock-shell state-block-selected" id="systemsketch-mock">
        <div class="island mock-menu" title="Main menu">≡</div>
        <div class="island file-pill"><span class="dirty-dot"></span><span>Robot sorter</span><span style="color:#aaa7b5">/</span><span>Page 1</span></div>
        <div class="island mock-toolbar" aria-label="Combined Excalidraw and SystemSketch toolbar">
          <span class="mock-tool">☝</span><span class="mock-tool selected">↖<small>1</small></span><span class="mock-tool">□<small>2</small></span><span class="mock-tool">◇<small>3</small></span><span class="mock-tool">○<small>4</small></span><span class="mock-tool">→<small>5</small></span><span class="mock-tool">—<small>6</small></span><span class="mock-tool">⌁<small>7</small></span><span class="mock-tool">A<small>8</small></span><span class="mock-divider"></span><span class="mock-tool domain">▣<small>B</small></span><span class="mock-tool domain">⌘</span><span class="mock-tool">⋮</span>
        </div>
        <div class="island update-control"><span class="update-dot"></span><span>SystemSketch 0.1.0 · Stable</span><span>⌄</span></div>

        <aside class="island appearance">
          <h4>Block appearance</h4>
          <div class="swatches"><span class="swatch" style="background:#1d1d25"></span><span class="swatch" style="background:#4c6ef5"></span><span class="swatch" style="background:#ae3ec9"></span><span class="swatch" style="background:#f08c00"></span></div>
          <div class="panel-row"><span>Fill</span><span class="tiny-options"><span>□</span><span>▧</span><span>▦</span></span></div>
          <div class="panel-row"><span>Stroke</span><span class="tiny-options"><span>—</span><span>━</span></span></div>
          <div class="panel-row"><span>Size</span><span class="tiny-options"><span>S</span><span style="background:#e8e6ff">M</span><span>L</span></span></div>
          <div class="panel-row"><span>Actions</span><span class="tiny-options"><span>⧉</span><span>⌫</span><span>↗</span></span></div>
        </aside>

        <div class="block-card">
          <div class="block-title">decode_frame</div>
          <div class="block-meta"><span>image · ndarray</span><span>detections · list</span></div>
          <span class="port in"></span><span class="port out"></span>
        </div>
        <div class="island context-menu">
          <div><span>Block view</span><span>Simple ✓ · Port · Expanded ›</span></div>
          <div><span>Add</span><span>Input · Output · Type ›</span></div>
          <div><span>Ports</span><span>Aligned ✓ · Offset ›</span></div>
          <div><span>Advanced</span><span>Detach · Duplicate ›</span></div>
        </div>
        <div class="connection-badge">Curved · Straight · Elbow</div>
        <div class="island zoom"><span>−</span><strong>100%</strong><span>＋</span><span style="color:#aaa7b5">│</span><span>↶</span><span>↷</span></div>
        <div class="island help">?</div>
      </div>

      <div class="legend">
        <article class="card"><span class="number">01</span><div><h3>Shared tool island stays fixed</h3><p>The vanilla Excalidraw sequence remains intact. Block and Templates live in an adjacent domain group; they add capability without shifting learned shared positions.</p></div></article>
        <article class="card"><span class="number">02</span><div><h3>Update pill is host chrome</h3><p>The existing top pill docks to the toolbar edge when Excalidraw chrome arrives. It shows version/channel and opens Stable, Preview, promote, rollback, changelog, and stock-control actions. It never edits the board.</p></div></article>
        <article class="card"><span class="number">03</span><div><h3>Whiteboard-first block editing</h3><p>Double-click edits visible title, type, description, icon, port names, and port types in place. Right-click creates missing structure through Block view, Add, Ports, and Advanced submenus.</p></div></article>
        <article class="card"><span class="number">04</span><div><h3>Optional depth, not permanent clutter</h3><p>The Excalidraw appearance island remains contextual. A dense semantic inspector is an explicit Details action for batch edits—not something selection forces open.</p></div></article>
      </div>

      <div class="rule"><strong>Primitive conformity rule.</strong> For behavior already supplied by tldraw, use the native primitive contract. When tldraw does not supply the required behavior, adapt the corresponding Excalidraw interaction or geometry with retained MIT provenance. Do not invent a third interaction grammar.</div>

      <table class="contract-table">
        <tr><th>Block primitive</th><td><strong>B</strong> places an empty Block. It supports Simple, Port, and Expanded views; each view remembers its own size. Expanded behaves as a frame and may contain nested shapes. Context menu: Block view ▸, Add ▸, Ports ▸, Advanced ▸.</td></tr>
        <tr><th>Inline editing</th><td>Double-click edits any visible semantic field. Adding a missing field through the context menu creates it and immediately hands focus to the same on-canvas editor. One value model; no menu-owned draft state.</td></tr>
        <tr><th>Ports</th><td>Stable port IDs survive rename, visibility changes, and reordering. Drag from a port or use Arrow then select a port. Aligned/Offset presentation changes never change semantic identity.</td></tr>
        <tr><th>Connections</th><td>Curved, Straight, and multi-segment Elbow. Excalidraw-style inert midpoint/segment handles activate when dragged; bound endpoints keep fixed entry/exit dongles so authored rails never run along a block face.</td></tr>
        <tr><th>Escape hatch</th><td>Detach to primitives is a one-way authority transfer: preserve the visible result and external wiring, then drop semantic/link identity so the drawing becomes ordinary editable canvas geometry.</td></tr>
        <tr><th>Optional semantic tools</th><td>Templates, Full/Focus/Isolate scene commands, tags/types, and the detailed inspector remain adjacent or contextual. None permanently occupies the blank canvas.</td></tr>
      </table>

      <h3 style="margin:28px 0 10px;font-size:22px">State contract</h3>
      <table class="contract-table">
        <tr><th>Nothing selected</th><td>Blank board, file/page chip, shared toolbar, adjacent SystemSketch group, update pill, zoom/history, help. No appearance panel and no semantic inspector.</td></tr>
        <tr><th>Vanilla shape selected</th><td>Excalidraw appearance panel only; stock gestures and handles.</td></tr>
        <tr><th>Block selected</th><td>Appearance panel plus inline edit affordances and the nested semantic context menu. Optional Details opens the dense inspector.</td></tr>
        <tr><th>Connection selected</th><td>Appearance panel plus Curved/Straight/Elbow routing and authored segment controls.</td></tr>
        <tr><th>Update pill open</th><td>Release/build controls only. Same editor, store, page, camera, selection, current tool, and undo stack remain mounted; document serialization is byte-identical before and after.</td></tr>
      </table>

      <figure class="figure" style="margin-top:14px">
        <img src="{embedded_images['prior_proposal']}" alt="Earlier proposed SystemSketch interface using Excalidraw-shaped chrome">
        <figcaption><strong>Prior proposal retained</strong><span>shared Excalidraw slots + adjacent SystemSketch tools + quiet canvas</span></figcaption>
      </figure>

      <div class="acceptance">
        <div><span class="check">✓</span><span>Extension tools never shift the vanilla shared tool positions or their shortcut numbers.</span></div>
        <div><span class="check">✓</span><span>Chrome-only and release-pill actions produce zero `.systemsketch` record changes and zero unintended autosave writes.</span></div>
        <div><span class="check">✓</span><span>Selection, text, resize, wheel, paste, layering, edge editing, and menu interactions conform to the named reference before custom behavior is added.</span></div>
        <div><span class="check">✓</span><span>IcePanel hierarchy/versioning and LabVIEW semantics remain later layers; they are not smuggled into this Excalidraw interface pass.</span></div>
      </div>
      <p class="scope-note">Scope note: this is a durable interface decision surface, not an FR/requirements mirror. Executable code and ordinary regression tests remain the living specification when implementation begins.</p>
    </section>
  </main>

  <script>
    const layerButtons = [...document.querySelectorAll('[data-layer]')]
    const layers = [...document.querySelectorAll('.layer')]
    layerButtons.forEach((button) => button.addEventListener('click', () => {{
      layerButtons.forEach((item) => item.classList.toggle('active', item === button))
      layers.forEach((layer) => layer.classList.toggle('active', layer.id === button.dataset.layer))
      history.replaceState(null, '', `#${{button.dataset.layer}}`)
    }}))

    const mock = document.querySelector('#systemsketch-mock')
    const stateButtons = [...document.querySelectorAll('[data-state]')]
    stateButtons.forEach((button) => button.addEventListener('click', () => {{
      stateButtons.forEach((item) => item.classList.toggle('active', item === button))
      mock.className = `mock-shell state-${{button.dataset.state}}`
    }}))

    if (location.hash === '#extensions') layerButtons.find((button) => button.dataset.layer === 'extensions').click()
  </script>
</body>
</html>
"""

OUTPUT_PATH.write_text(html, encoding="utf-8")
print(OUTPUT_PATH)
