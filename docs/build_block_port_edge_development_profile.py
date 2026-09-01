#!/usr/bin/env python3
"""Build the self-contained Block / Port / Edge Stable-promotion gallery."""

from __future__ import annotations

import base64
from pathlib import Path


HERE = Path(__file__).resolve().parent
SCREENSHOT = HERE / "block-port-edge-development-profile-live-2026-09-01.jpg"
OUTPUT = HERE / "block-port-edge-development-profile-2026-09-01.html"


def main() -> None:
    screenshot = base64.b64encode(SCREENSHOT.read_bytes()).decode("ascii")
    html = TEMPLATE.replace("__SCREENSHOT_DATA__", screenshot)
    OUTPUT.write_text(html, encoding="utf-8")
    print(OUTPUT)


TEMPLATE = r'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>SystemSketch — Block / Port / Edge in Stable</title>
<style>
  :root {
    color-scheme: dark;
    --bg:#080b12; --panel:#111724; --panel2:#161e2d; --ink:#f7f8fb;
    --muted:#9ba8bd; --line:#2b3547; --violet:#8b7cf6; --cyan:#50d4d1;
    --green:#76d39b; --amber:#f0bd69; --radius:22px;
    font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  }
  *{box-sizing:border-box} html{scroll-behavior:smooth} body{margin:0;background:
    radial-gradient(circle at 72% -10%,rgba(139,124,246,.18),transparent 34rem),
    radial-gradient(circle at 8% 34%,rgba(80,212,209,.08),transparent 30rem),var(--bg);color:var(--ink)}
  a{color:inherit} .shell{width:min(1180px,calc(100% - 36px));margin:auto;padding:42px 0 72px}
  .eyebrow{display:flex;align-items:center;gap:9px;color:var(--cyan);font:700 12px/1.2 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase}
  .eyebrow:before{content:"";width:8px;height:8px;border-radius:50%;background:var(--cyan);box-shadow:0 0 18px var(--cyan)}
  h1{max-width:930px;margin:16px 0 14px;font-size:clamp(38px,6vw,72px);line-height:.98;letter-spacing:-.045em}
  .lede{max-width:800px;margin:0;color:#c3cad7;font-size:18px;line-height:1.55}
  .actions{display:flex;gap:10px;flex-wrap:wrap;margin:25px 0 34px}
  .button{padding:11px 16px;border:1px solid var(--line);border-radius:11px;text-decoration:none;font-weight:750;background:var(--panel)}
  .button.primary{border-color:transparent;background:linear-gradient(135deg,#7768ec,#5d54d6);box-shadow:0 10px 30px rgba(119,104,236,.22)}
  .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:0 0 24px}
  .stat{padding:16px 18px;border:1px solid var(--line);border-radius:15px;background:rgba(17,23,36,.82)}
  .stat b{display:block;font-size:26px}.stat span{color:var(--muted);font-size:13px}
  .hero{overflow:hidden;border:1px solid #38435a;border-radius:var(--radius);background:#eef0f3;box-shadow:0 30px 90px rgba(0,0,0,.45)}
  .hero img{display:block;width:100%;height:auto}.caption{display:flex;justify-content:space-between;gap:20px;padding:13px 17px;background:var(--panel);color:var(--muted);font-size:13px}
  .tabs{position:sticky;top:12px;z-index:2;display:flex;gap:6px;width:max-content;max-width:100%;margin:38px auto 22px;padding:5px;border:1px solid var(--line);border-radius:14px;background:rgba(8,11,18,.88);backdrop-filter:blur(18px)}
  .tabs button{border:0;border-radius:9px;padding:10px 15px;background:transparent;color:var(--muted);font:700 13px/1 inherit;cursor:pointer}.tabs button[aria-selected="true"]{background:var(--panel2);color:var(--ink)}
  .view[hidden]{display:none}.section-title{margin:0 0 18px;font-size:30px;letter-spacing:-.025em}.section-copy{max-width:780px;margin:-8px 0 24px;color:var(--muted);line-height:1.6}
  .journey{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}.step{position:relative;min-height:168px;padding:18px;border:1px solid var(--line);border-radius:17px;background:linear-gradient(155deg,var(--panel2),var(--panel))}
  .step:not(:last-child):after{content:"→";position:absolute;z-index:1;right:-16px;top:68px;color:var(--cyan);font-size:22px}.num{color:var(--violet);font:800 12px/1 ui-monospace,monospace}.step h3{margin:15px 0 8px;font-size:17px}.step p{margin:0;color:var(--muted);font-size:13px;line-height:1.5}
  .checks{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:18px}.check{display:grid;grid-template-columns:28px 1fr;gap:10px;padding:16px;border:1px solid var(--line);border-radius:14px;background:var(--panel)}
  .check i{display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:rgba(118,211,155,.14);color:var(--green);font-style:normal;font-weight:900}.check b{display:block}.check small{display:block;margin-top:4px;color:var(--muted);line-height:1.45}
  .fidelity-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.fidelity-card{padding:20px;border:1px solid var(--line);border-radius:17px;background:var(--panel)}.fidelity-card.after{border-color:rgba(118,211,155,.55);background:linear-gradient(145deg,rgba(118,211,155,.08),var(--panel) 50%)}
  .fidelity-card h3{margin:0 0 7px;font-size:19px}.fidelity-card p{margin:0 0 16px;color:var(--muted);line-height:1.55}.surface-list{display:grid;gap:8px}.surface-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:#0c111b;font-size:13px}.surface-row span:last-child{color:var(--muted);font:650 11px/1.2 ui-monospace,monospace}.surface-row.good{border-color:rgba(118,211,155,.34)}
  .boundary{display:grid;grid-template-columns:1fr 72px 1fr;align-items:stretch}.lane{padding:22px;border:1px solid var(--line);border-radius:18px;background:var(--panel)}
  .lane.dev{border-color:rgba(139,124,246,.7);background:linear-gradient(145deg,rgba(139,124,246,.12),var(--panel) 45%)}.lane h3{margin:0 0 6px}.lane p{color:var(--muted);line-height:1.5}.chips{display:flex;flex-wrap:wrap;gap:7px}.chip{padding:7px 9px;border:1px solid var(--line);border-radius:9px;background:#0c111b;color:#cad1dd;font:650 12px/1.2 ui-monospace,monospace}.divider{display:grid;place-items:center;color:var(--amber);font:800 11px/1.4 ui-monospace,monospace;text-align:center}.rule{margin-top:16px;padding:14px;border-left:3px solid var(--green);background:rgba(118,211,155,.07);color:#d6e8dc;line-height:1.55}
  .files{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.file{padding:15px 17px;border:1px solid var(--line);border-radius:13px;background:var(--panel)}.file code{color:var(--cyan);font-size:12px}.file p{margin:8px 0 0;color:var(--muted);font-size:13px;line-height:1.5}
  footer{margin-top:48px;padding-top:20px;border-top:1px solid var(--line);display:flex;justify-content:space-between;gap:20px;color:var(--muted);font-size:12px}
  @media(max-width:900px){.stats,.journey{grid-template-columns:repeat(2,1fr)}.step:after{display:none}.boundary{grid-template-columns:1fr;gap:10px}.divider{min-height:35px}.files,.fidelity-grid{grid-template-columns:1fr}}
  @media(max-width:580px){.shell{width:min(100% - 20px,1180px);padding-top:28px}.stats,.journey,.checks{grid-template-columns:1fr}.caption,footer{flex-direction:column}.tabs{overflow:auto;justify-content:flex-start}}
</style>
</head>
<body>
<main class="shell">
  <div class="eyebrow">SystemSketch Stable release evidence · 2026-09-01</div>
  <h1>The pyblocks Block capability is now in Stable.</h1>
  <p class="lede">The verified Block / Port / Edge tracer bullet now ships in the normal SystemSketch composition: the mature pyblocks canvas and inspector UI, a real frame-backed Expanded view, durable ports, and semantic cables. The independent Block Dev profile remains available for focused follow-on work.</p>
  <div class="actions">
    <a class="button primary" href="http://127.0.0.1:4321/">Open Stable ↗</a>
    <a class="button" href="http://127.0.0.1:4322/?preset=block-dev">Open Block Dev lab</a>
  </div>
  <div class="stats">
    <div class="stat"><b>3</b><span>faithful pyblocks Block views</span></div>
    <div class="stat"><b>1</b><span>real Expanded frame backend</span></div>
    <div class="stat"><b>88 + 24</b><span>passing frontend + Python tests</span></div>
    <div class="stat"><b>19e8</b><span>promoted Stable build prefix</span></div>
  </div>
  <figure class="hero">
    <img alt="Live Stable build showing the Block toolbar item, selected Port-view Block, selection mini menu, and pyblocks inspector" src="data:image/jpeg;base64,__SCREENSHOT_DATA__" />
    <figcaption class="caption"><span>Real Stable capture: Block toolbar, Port view, editable ports, and the faithful right inspector.</span><span>Build 19e8167eed92f7d4 · http://127.0.0.1:4321/</span></figcaption>
  </figure>

  <nav class="tabs" aria-label="Gallery sections">
    <button type="button" aria-selected="true" data-view="proof">Tracer bullet</button>
    <button type="button" aria-selected="false" data-view="fidelity">Pyblocks fidelity</button>
    <button type="button" aria-selected="false" data-view="boundary">Composition boundary</button>
    <button type="button" aria-selected="false" data-view="files">Implementation map</button>
  </nav>

  <section class="view" id="proof">
    <h2 class="section-title">The end-to-end journey is usable</h2>
    <p class="section-copy">These are canvas behaviors, not mock UI. The same deterministic Block layout drives paint, geometry, port anchors, hit testing, export, and connection positioning.</p>
    <div class="journey">
      <article class="step"><span class="num">01 / BLOCK</span><h3>Create with B</h3><p>A cube-plus item is added to the otherwise stock toolbar. The stock box gesture owns click, drag, cancel, and history.</p></article>
      <article class="step"><span class="num">02 / VIEWS</span><h3>Hide information</h3><p>Simple, Port, and Expanded each remember their own dimensions; switching views keeps semantic content intact.</p></article>
      <article class="step"><span class="num">03 / FRAME</span><h3>Compose hierarchically</h3><p>Expanded is a real frame-like parent. Drawing inside it and enclosing existing Blocks both use tldraw's parent tree.</p></article>
      <article class="step"><span class="num">04 / PORTS</span><h3>Edit durable ports</h3><p>The inspector adds, renames, reorders, hides, and deletes ports. Identity is the stable ID, never the editable label.</p></article>
      <article class="step"><span class="num">05 / EDGE</span><h3>Wire port to port</h3><p>A cable stores two semantic bindings and re-derives geometry when Blocks move, resize, nest, reorder, hide, or reload.</p></article>
    </div>
    <div class="checks">
      <div class="check"><i>✓</i><div><b>Stable release acceptance</b><small>On immutable build 19e8167eed92f7d4, the toolbar item and B shortcut opened the inspector; a Block was created, renamed, typed, given input/output ports, switched to Port, then removed so the saved board stayed unchanged.</small></div></div>
      <div class="check"><i>✓</i><div><b>Browser interaction</b><small>Created Producer and Consumer, added an output, dragged output → input, moved the target, switched views, and reloaded.</small></div></div>
      <div class="check"><i>✓</i><div><b>Historical nesting regression</b><small>Drew a new Simple Block inside an Expanded Block after enclosing two existing Blocks; the 820×400 drawn frame stayed intact.</small></div></div>
      <div class="check"><i>✓</i><div><b>Non-destructive hiding</b><small>Hiding the bound output removed its dot while the cable and stable port identity remained; showing it restored the affordance.</small></div></div>
      <div class="check"><i>✓</i><div><b>Reload persistence</b><small>Four Blocks, the frame hierarchy, one semantic connection, and the exact 820-pixel frame width survived a hard reload.</small></div></div>
      <div class="check"><i>✓</i><div><b>Self-reparent crash guard</b><small>A descendant hit may proxy to the Expanded Block being dragged. The callback now rejects that entire gesture before tldraw can receive the Block as its own child.</small></div></div>
      <div class="check"><i>✓</i><div><b>Nearest nested container</b><small>When Expanded Blocks are nested, containment walks inward and selects the nearest eligible Expanded ancestor instead of the outermost frame.</small></div></div>
      <div class="check"><i>✓</i><div><b>Restored field editing</b><small>Double-clicking the title enters tldraw's editing lifecycle, commits directly to Block data, and immediately synchronizes the right inspector.</small></div></div>
      <div class="check"><i>✓</i><div><b>Restored port semantics</b><small>Type-colored hollow dots, connected fills, default chips, aligned/offset layout, and direct output-to-input cable creation were exercised in the live profile.</small></div></div>
    </div>
  </section>

  <section class="view" id="fidelity" hidden>
    <h2 class="section-title">The mature pyblocks face, on the current frame backend</h2>
    <p class="section-copy">“Keep stock tldraw” governs menus, toolbar, selection, and gestures—not the visual identity of the Block primitive. The old Block canvas and right inspector are restored from the pyblocks donor while Expanded continues to use SystemSketch's corrected frame implementation.</p>
    <div class="fidelity-grid">
      <article class="fidelity-card">
        <div class="eyebrow">Superseded adaptation</div>
        <h3>First-pass approximation</h3>
        <p>The superseded version replaced the old Block face with a small SVG card and also invented a stock-adjacent inspector vocabulary.</p>
        <div class="surface-list">
          <div class="surface-row"><span>Canvas face</span><span>TINY SVG TYPOGRAPHY</span></div>
          <div class="surface-row"><span>Expanded body</span><span>INVENTED DASHED INSET</span></div>
          <div class="surface-row"><span>Context header</span><span>SELECTED / BLOCK</span></div>
          <div class="surface-row"><span>Sections</span><span>NESTED MENU CARDS</span></div>
        </div>
      </article>
      <article class="fidelity-card after">
        <div class="eyebrow">Current implementation</div>
        <h3>Direct donor transplant</h3>
        <p>The mature pyblocks model, layout grammar, HTML paint, icon set, inline editor, and inspector are the visual oracle; only the document and frame boundaries are adapted.</p>
        <div class="surface-list">
          <div class="surface-row good"><span>Simple face</span><span>40 / 44 / 18 SCALE</span></div>
          <div class="surface-row good"><span>Port + Expanded</span><span>48 HEADER · 46 FOOTER</span></div>
          <div class="surface-row good"><span>Port grammar</span><span>TYPE COLOR · DIVIDERS · CHIPS</span></div>
          <div class="surface-row good"><span>Inspector</span><span>DETAILS / NOTES · 280PX</span></div>
        </div>
      </article>
    </div>
    <div class="rule"><strong>Donor boundary:</strong> icons, Notes, input defaults, aligned/offset rows, field editing, and view sizes are real Block data. Tags remain the only explicitly disabled future surface. Expanded containment, clipping, resize memory, and the self-reparent guard stay owned by the current frame backend.</div>
  </section>

  <section class="view" id="boundary" hidden>
    <h2 class="section-title">Stable capability, separate development lab</h2>
    <p class="section-copy">Stable and Block Dev now share the same Block tool, shape, inspector, and connection implementation. The URL is still resolved before the first &lt;Tldraw&gt; mount, so the lab keeps its independent document and stock-toolbar composition.</p>
    <div class="boundary">
      <article class="lane"><div class="eyebrow">Stable · no preset</div><h3>SystemSketch + released Block capability</h3><p>The normal local workspace now registers the Block tool, connection shape and bindings, port gesture runtime, cube-plus toolbar slot, and the existing exclusive right-surface inspector.</p><div class="chips"><span class="chip">SystemSketchCanvas</span><span class="chip">workspace</span><span class="chip">BlockTool + B</span><span class="chip">semantic connections</span><span class="chip">product chrome</span></div></article>
      <div class="divider">PRE-MOUNT<br/>SEAM</div>
      <article class="lane dev"><div class="eyebrow">Preview · block-dev</div><h3>Focused stock-tldraw Block lab</h3><p>An independent browser-local document uses stock tldraw chrome plus the same released Block capability, keeping future Block work isolated from the production workspace.</p><div class="chips"><span class="chip">shared Block UI</span><span class="chip">shared tool + B</span><span class="chip">shared connections</span><span class="chip">independent document</span><span class="chip">Preview identity</span></div></article>
    </div>
    <div class="rule"><strong>Release boundary:</strong> Stable is immutable build 19e8167eed92f7d4 on :4321. Block Dev stays live on :4322 with an independent persistence key, so experiments cannot mutate the Stable workspace.</div>
  </section>

  <section class="view" id="files" hidden>
    <h2 class="section-title">Closed feature surface, small integration seam</h2>
    <p class="section-copy">The mature pyblocks design was used as a donor, then reduced to the current Block fundamentals and tldraw 5.3.2 public APIs.</p>
    <div class="files">
      <article class="file"><code>src/App.tsx</code><p>Registers the released Block and connection runtime in Product while retaining the isolated pre-mount Block Dev composition.</p></article>
      <article class="file"><code>src/developmentProfiles.ts</code><p>Typed Product / Block Dev / Stock Dev manifest plus independent persistence keys.</p></article>
      <article class="file"><code>src/blocks/blockToolUi.tsx</code><p>One shared Block UI-tool contract owns the cube-plus icon, B shortcut, and Draw-shortcut handoff in Stable and Block Dev.</p></article>
      <article class="file"><code>src/blocks/ui/BlockCanvas.tsx</code><p>Restored pyblocks HTML face: exact view typography, iconography, port states, dividers, footer, default chips, and connection magnets.</p></article>
      <article class="file"><code>src/blocks/layoutBlock.ts</code><p>One donor-derived geometry authority for paint, port anchors, hit testing, labels, section weights, and the open Expanded interior.</p></article>
      <article class="file"><code>src/blocks/BlockShapeUtil.tsx</code><p>tldraw bridge for inline editing, export, selection geometry, remembered sizes, real frame containment, and the self-reparent guard.</p></article>
      <article class="file"><code>src/blocks/ui/BlockInspector.tsx</code><p>Faithful 280px Details / Notes dock with functional icon, defaults, port layout, view, and port editing controls.</p></article>
      <article class="file"><code>src/blocks/connections/</code><p>Semantic cable shape, two port bindings, live port projection, interaction states, cleanup, routing, and focused tests.</p></article>
      <article class="file"><code>tests/test_stock_boundary.py</code><p>Executable guard that Product deliberately receives the released Block connections while development persistence stays out of Stable.</p></article>
    </div>
  </section>

  <footer><span>Generated from the verified main working tree in /home/bam/systemsketch.</span><span>Stable 19e8167eed92f7d4 · Donor: pyblocks · Runtime: tldraw 5.3.2</span></footer>
</main>
<script>
  const buttons = [...document.querySelectorAll('[data-view]')]
  const views = [...document.querySelectorAll('.view')]
  for (const button of buttons) button.addEventListener('click', () => {
    for (const candidate of buttons) candidate.setAttribute('aria-selected', String(candidate === button))
    for (const view of views) view.hidden = view.id !== button.dataset.view
    document.querySelector('.tabs').scrollIntoView({behavior:'smooth',block:'start'})
  })
  document.querySelector('.hero img').addEventListener('click', (event) => {
    event.currentTarget.requestFullscreen?.()
  })
</script>
</body>
</html>
'''


if __name__ == "__main__":
    main()
