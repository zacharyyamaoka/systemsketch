#!/usr/bin/env python3
"""Build the self-contained in-window Port UX implementation report.

Every frame is cropped from the screenshots `tests/block_port_in_window_smoke.mjs`
captured while driving the real app, so the report cannot drift from the proof.
"""

from __future__ import annotations

import base64
import io
import sys
from pathlib import Path

from PIL import Image


HERE = Path(__file__).resolve().parent
OUTPUT = HERE / "block-port-in-window-2026-09-01.html"

ADD = HERE / "block-port-in-window-add-2026-09-01.png"
GROWN = HERE / "block-port-in-window-grown-2026-09-01.png"
DRAG = HERE / "block-port-in-window-drag-2026-09-01.png"
MENU = HERE / "block-port-in-window-menu-2026-09-01.png"

# (source, crop box, output width) — boxes are in the 1440x960 capture frame.
CROPS = {
    "__GUTTER__": (ADD, (400, 220, 790, 480), 780),
    "__BEAD__": (ADD, (404, 296, 500, 380), 576),
    "__SIZE_BEFORE__": (ADD, (1168, 444, 1436, 470), 804),
    "__GROWN__": (GROWN, (400, 220, 790, 545), 780),
    "__SIZE_AFTER__": (GROWN, (1168, 444, 1436, 470), 804),
    "__DRAG__": (DRAG, (386, 220, 790, 500), 808),
    "__MENU__": (MENU, (405, 230, 800, 560), 790),
}


def encoded_crop(source: Path, box: tuple[int, int, int, int], width: int) -> str:
    image = Image.open(source).convert("RGB").crop(box)
    if width != image.width:
        height = round(image.height * width / image.width)
        image = image.resize((width, height), Image.LANCZOS)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def main() -> None:
    build = sys.argv[1] if len(sys.argv) > 1 else "working-tree"
    html = TEMPLATE
    for slot, (source, box, width) in CROPS.items():
        html = html.replace(slot, encoded_crop(source, box, width))
    html = html.replace("__BUILD__", build)
    OUTPUT.write_text(html, encoding="utf-8")
    print(OUTPUT)


TEMPLATE = r'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>SystemSketch — editing ports inside the window</title>
<style>
  :root{color-scheme:dark;--bg:#080b12;--panel:#111724;--panel2:#182133;--ink:#f7f8fb;--muted:#9ba8bd;--line:#2b3547;--blue:#6d7cff;--cyan:#52d5d0;--green:#75d39b;--red:#e8836f;--amber:#efbd68;font-family:Inter,ui-sans-serif,system-ui,sans-serif}
  *{box-sizing:border-box}html{scroll-behavior:smooth}
  body{margin:0;color:var(--ink);background:radial-gradient(circle at 78% -10%,rgba(109,124,255,.2),transparent 34rem),radial-gradient(circle at 4% 42%,rgba(82,213,208,.08),transparent 32rem),var(--bg)}
  a{color:var(--cyan)}
  .shell{width:min(1180px,calc(100% - 34px));margin:auto;padding:42px 0 76px}
  .eyebrow{display:flex;align-items:center;gap:9px;color:var(--cyan);font:800 11px/1.2 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase}
  .eyebrow:before{content:"";width:8px;height:8px;border-radius:50%;background:var(--cyan);box-shadow:0 0 16px var(--cyan)}
  h1{max-width:940px;margin:16px 0 14px;font-size:clamp(38px,5.6vw,68px);line-height:.99;letter-spacing:-.05em}
  .lede{max-width:860px;margin:0;color:#c4ccda;font-size:18px;line-height:1.58}
  .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:11px;margin:28px 0 6px}
  .stat{padding:16px 18px;border:1px solid var(--line);border-radius:15px;background:rgba(17,23,36,.88)}
  .stat b{display:block;font-size:25px}.stat span{color:var(--muted);font-size:13px}
  section{margin-top:52px}
  .section-title{margin:0 0 8px;font-size:30px;letter-spacing:-.03em}
  .section-copy{max-width:880px;margin:0 0 22px;color:var(--muted);line-height:1.62}
  .section-copy b{color:#dfe5ef}
  .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;align-items:start}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start}
  @media(max-width:900px){.grid3,.grid2,.stats{grid-template-columns:1fr}}
  figure{margin:0;overflow:hidden;border:1px solid #3a465e;border-radius:16px;background:#f7f8fb;box-shadow:0 18px 46px rgba(0,0,0,.34)}
  figure img{display:block;width:100%;height:auto}
  figcaption{padding:11px 13px;background:var(--panel);color:var(--muted);font-size:12.5px;line-height:1.45}
  figcaption b{display:block;margin-bottom:3px;color:var(--ink);font-size:13px}
  .card{padding:19px 21px;border:1px solid var(--line);border-radius:16px;background:rgba(17,23,36,.86)}
  .card h3{margin:0 0 8px;font-size:16px;letter-spacing:-.01em}
  .card p{margin:0 0 8px;color:var(--muted);font-size:14px;line-height:1.6}
  .card p:last-child{margin-bottom:0}
  .card code,code{padding:1px 5px;border-radius:5px;background:#1c2637;color:#cfd7e6;font:600 12.5px ui-monospace,monospace}
  .tag{display:inline-block;margin:0 6px 6px 0;padding:4px 9px;border-radius:999px;font:700 11px ui-monospace,monospace;letter-spacing:.04em}
  .tag.ok{background:rgba(117,211,155,.14);color:var(--green)}
  .tag.warn{background:rgba(239,189,104,.14);color:var(--amber)}
  .tag.info{background:rgba(109,124,255,.16);color:#a7b0ff}
  ul.checks{margin:0;padding:0;list-style:none;columns:2;column-gap:22px}
  @media(max-width:900px){ul.checks{columns:1}}
  ul.checks li{break-inside:avoid;margin:0 0 8px;padding-left:24px;position:relative;color:#cbd3e0;font-size:14px;line-height:1.5}
  ul.checks li:before{content:"✓";position:absolute;left:0;top:0;color:var(--green);font-weight:800}
  table{width:100%;border-collapse:collapse;font-size:14px}
  th,td{padding:11px 13px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
  th{color:var(--muted);font:700 11.5px ui-monospace,monospace;letter-spacing:.07em;text-transform:uppercase}
  td b{color:var(--ink)}
  td.mono{font:600 12.5px ui-monospace,monospace;color:#cfd7e6;white-space:nowrap}
  pre{margin:0;padding:15px 17px;overflow-x:auto;border:1px solid var(--line);border-radius:13px;background:#0d1320;color:#cfd7e6;font:600 12.5px/1.65 ui-monospace,monospace}
  .seam{width:100%;height:auto;border:1px solid var(--line);border-radius:16px;background:rgba(13,19,32,.7)}
  footer{margin-top:56px;padding-top:22px;border-top:1px solid var(--line);color:var(--muted);font-size:13px;line-height:1.6}
</style>
</head>
<body>
<div class="shell">

  <div class="eyebrow">SystemSketch · Block, Ports &amp; Edges</div>
  <h1>Ports, edited where they live.</h1>
  <p class="lede">Three gestures, borrowed straight from a table: hover the end of a lane and a
  <b>+</b> offers the next row; press and hold a port to pick its row up and drop it somewhere else;
  right-click a port and the <b>same</b> context menu re-aims itself at that port. No new panel, no
  new mode, and the Block grows a row rather than squeezing the ones it already has.</p>

  <div class="stats">
    <div class="stat"><b>14 / 14</b><span>real-browser checks, product + lab</span></div>
    <div class="stat"><b>34</b><span>unit checks on the lane contract</span></div>
    <div class="stat"><b>1</b><span>undo step per reorder</span></div>
    <div class="stat"><b>0</b><span>console errors on the journey</span></div>
  </div>

  <section>
    <h2 class="section-title">1 · Hover the end of a lane</h2>
    <p class="section-copy">The Block has to be selected — the gutters belong to the Block you are
    working on, so a busy canvas never sprouts a plus under every lane. Inputs own the left half,
    outputs the right, which is what makes one hover unambiguous about which lane it means. The
    strip starts outside the last port's 40px hit halo, so revealing the bead can never cost you a
    cable drag from the port above it.</p>
    <div class="grid2">
      <figure><img alt="A selected Block with the input gutter hovered and its add bead revealed" src="data:image/png;base64,__GUTTER__" />
        <figcaption><b>The gutter, hovered</b>The bead appears on the row the port will occupy. Click it and the port is created with its name editor already open — type, Enter, done.</figcaption></figure>
      <figure><img alt="Close-up of the blue circular add bead with a white plus" src="data:image/png;base64,__BEAD__" />
        <figcaption><b>Why it sits a little inside the edge</b>A selected shape's selection box is painted by tldraw above the shape's own HTML. Centred on the edge — where the dot itself lands — that 2px line runs straight down the glyph and the plus reads as a minus. Measured in the browser, not guessed.</figcaption></figure>
    </div>
  </section>

  <section>
    <h2 class="section-title">2 · The Block makes room</h2>
    <p class="section-copy"><code>layoutBlock</code> compresses the row pitch to whatever space is
    left, so a full Block used to answer "add a port" by silently squeezing every row that was
    already there. <code>blockPortViewHeightForSlots</code> is the exact inverse of that clamp and
    lives in the same module, so the two numbers cannot drift. Adding grows the box to fit; it never
    shrinks a box you deliberately made roomy.</p>
    <div class="grid2">
      <figure><img alt="The Block before growth with one input" src="data:image/png;base64,__GUTTER__" />
        <figcaption><b>Before · one input</b>The inspector reads the Port box back at 340×220.</figcaption></figure>
      <figure><img alt="The Block after growth with four evenly pitched inputs" src="data:image/png;base64,__GROWN__" />
        <figcaption><b>After · four inputs, still 44px apart</b>The box grew to 340×286. The browser check measures the gaps between the painted dots and requires exactly <code>[44, 44, 44]</code>.</figcaption></figure>
    </div>
    <div class="grid2" style="margin-top:14px">
      <figure><img alt="Inspector reading port is 340 by 220" src="data:image/png;base64,__SIZE_BEFORE__" /><figcaption>The inspector's own size readout, before.</figcaption></figure>
      <figure><img alt="Inspector reading port is 340 by 286" src="data:image/png;base64,__SIZE_AFTER__" /><figcaption>…and after. A second, independent witness to the growth.</figcaption></figure>
    </div>
  </section>

  <section>
    <h2 class="section-title">3 · Press and hold to reorder</h2>
    <p class="section-copy">Hold a port still and it becomes a row you are carrying: a grip appears
    outside the edge, the label lifts onto a card, and a rule marks where releasing would drop it.
    <b>Nothing is written until you let go</b> — so the cables stay exactly where they are while a
    port is in flight, and the whole move lands as one undo step. A press that moves straight away
    is still a cable; tldraw cancels its own long-press timer the moment a press crosses the drag
    threshold, which is precisely the difference between the two gestures.</p>
    <figure><img alt="A port row being dragged, showing the grip, the lifted card and the blue drop rule" src="data:image/png;base64,__DRAG__" />
      <figcaption><b><code>window</code> in flight, about to land above <code>asdasd</code></b>The card is a shadow rather than a ring on purpose: a blue-outlined box on this face already means "you are editing this text", and a row in flight is not that.</figcaption></figure>
  </section>

  <section>
    <h2 class="section-title">4 · The same menu, a different subject</h2>
    <p class="section-copy">Not a second context menu. The right-click that opens the ordinary menu
    records which port it landed on, and the port's commands are prepended to it — Block view, Add,
    Ports, Cut/Copy/Paste and the rest all stay exactly where they were. <b>Move up</b> and
    <b>Move down</b> disable themselves at the ends of the lane. <b>Delete port</b> takes the port's
    cables with it, in the same undo step.</p>
    <div class="grid2">
      <figure><img alt="The context menu with port commands at the top" src="data:image/png;base64,__MENU__" />
        <figcaption><b>Add port above · Add port below · Move up · Move down · Delete port</b>Insertion is in place: "Add port below" lands directly under its subject rather than at the end of the lane.</figcaption></figure>
      <div class="card">
        <h3>How the subject is resolved</h3>
        <p>The first attempt read the DOM target of the <code>contextmenu</code> event. It failed in
        the real browser, and the failure is the interesting part: tldraw dispatches its own
        <code>right_click</code> from the <em>press</em>, while the browser only raises
        <code>contextmenu</code> on the <em>release</em> — by which time the painted dot is no longer
        the topmost element under the pointer, and the click reports against the canvas.</p>
        <p>So the subject is resolved from the pointer's page position through
        <code>getBlockConnectionPortAtPoint</code> — the same magnet radius that already decides
        which port a cable starts from. Every right-click writes this, including the ones that miss,
        so a dismissed port menu can never leave its commands attached to the next click elsewhere.</p>
      </div>
    </div>
  </section>

  <section>
    <h2 class="section-title">5 · Where it hangs off tldraw</h2>
    <p class="section-copy">The hold is not a private timer. tldraw already emits
    <code>long_press</code> to whichever state is active, and on a port that state is the connection
    tool's own <code>pointing_block_port</code>. The reorder is registered beside it as another
    <code>select</code> child state, so cancel, interrupt and tool switching need no special cases.</p>
    <svg class="seam" viewBox="0 0 1120 320" role="img" aria-label="The event path from a press on a port to a single reordering write">
      <defs>
        <marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10z" fill="#6d7cff"/></marker>
        <marker id="b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10z" fill="#52d5d0"/></marker>
      </defs>
      <g font-family="ui-monospace,monospace" font-size="13">
        <rect x="18" y="128" width="176" height="58" rx="12" fill="#182133" stroke="#2b3547"/>
        <text x="106" y="152" fill="#f7f8fb" text-anchor="middle" font-weight="700">press on a port</text>
        <text x="106" y="171" fill="#9ba8bd" text-anchor="middle" font-size="11.5">.Port capture listener</text>

        <rect x="252" y="128" width="214" height="58" rx="12" fill="#182133" stroke="#2b3547"/>
        <text x="359" y="152" fill="#f7f8fb" text-anchor="middle" font-weight="700">select.pointing_block_port</text>
        <text x="359" y="171" fill="#9ba8bd" text-anchor="middle" font-size="11.5">existing cable gesture</text>

        <rect x="524" y="34" width="228" height="58" rx="12" fill="#141d2c" stroke="#2b3547"/>
        <text x="638" y="58" fill="#9ba8bd" text-anchor="middle" font-weight="700">moved first → cable</text>
        <text x="638" y="77" fill="#6f7c92" text-anchor="middle" font-size="11.5">unchanged behaviour</text>

        <rect x="524" y="222" width="228" height="58" rx="12" fill="#182133" stroke="#3d4a91"/>
        <text x="638" y="246" fill="#f7f8fb" text-anchor="middle" font-weight="700">select.dragging_block_port</text>
        <text x="638" y="265" fill="#9ba8bd" text-anchor="middle" font-size="11.5">nothing written yet</text>

        <rect x="812" y="222" width="286" height="58" rx="12" fill="#182133" stroke="#2b3547"/>
        <text x="955" y="246" fill="#f7f8fb" text-anchor="middle" font-weight="700">moveBlockPortToIndex</text>
        <text x="955" y="265" fill="#9ba8bd" text-anchor="middle" font-size="11.5">one history mark · ids untouched</text>

        <path d="M198 157 H246" stroke="#6d7cff" stroke-width="2" fill="none" marker-end="url(#a)"/>
        <path d="M470 148 C500 148 496 63 518 63" stroke="#3f4a63" stroke-width="2" fill="none" marker-end="url(#a)"/>
        <path d="M470 166 C500 166 496 251 518 251" stroke="#52d5d0" stroke-width="2" fill="none" marker-end="url(#b)"/>
        <path d="M756 251 H806" stroke="#52d5d0" stroke-width="2" fill="none" marker-end="url(#b)"/>
        <text x="497" y="112" fill="#6f7c92" text-anchor="middle" font-size="11">pointer_move</text>
        <text x="497" y="205" fill="#52d5d0" text-anchor="middle" font-size="11">long_press</text>
        <text x="781" y="212" fill="#52d5d0" text-anchor="middle" font-size="11">drop</text>
      </g>
    </svg>
  </section>

  <section>
    <h2 class="section-title">6 · Calls worth overruling</h2>
    <div class="grid3">
      <div class="card">
        <span class="tag warn">not built</span>
        <h3>No keyboard shortcuts yet</h3>
        <p>The sketch shows <code>A</code>, <code>B</code>, <code>⌥↑</code>, <code>⌥↓</code>,
        <code>⌫</code>. Wiring those needs a port <em>selection</em> model — the section of the
        primitive note that is still empty — and inventing one here would pre-decide it. The menu
        shows no shortcut hints rather than fake ones.</p>
      </div>
      <div class="card">
        <span class="tag info">deliberate</span>
        <h3>The hold target is the dot, not the row</h3>
        <p>The label already owns click-to-edit. Hijacking a hold there would mean a hold-then-release
        on a port's name stops opening its editor — a regression on the gesture that shipped
        yesterday. The dot's 40px halo is the target instead.</p>
      </div>
      <div class="card">
        <span class="tag info">deliberate</span>
        <h3>Growth is Port view only</h3>
        <p>Expanded spreads its ports proportionally inside weighted sections rather than on a fixed
        grid, so it has no single "one more row" height to grow to. Adding, reordering and the menu
        all work there; only the automatic resize is Port-view-specific.</p>
      </div>
    </div>
    <div class="grid2" style="margin-top:14px">
      <div class="card">
        <span class="tag info">as asked</span>
        <h3>Cables do not follow a port mid-drag</h3>
        <p>"You shouldn't need to redraw the arrows until you finish dragging." Nothing is written to
        the document until the drop, so they don't — and that is also what makes the reorder exactly
        one undo step. Live redraw is now a one-line change if you want it: write the reorder on
        every move instead of on release.</p>
      </div>
      <div class="card">
        <span class="tag ok">found in passing</span>
        <h3>Two controls, one name</h3>
        <p>The canvas bead and the docked inspector's add button both answered to "Add output port".
        A screen reader reads that as the same control twice, and it broke a peer session's smoke
        test. The bead is now named for its Block:
        <code>Add input port to refine on canvas</code>.</p>
      </div>
    </div>
  </section>

  <section>
    <h2 class="section-title">7 · Proof</h2>
    <p class="section-copy">Every UI claim above was driven through the real app in headless Chrome —
    the isolated Block Dev lab <em>and</em> the full product composition that becomes Stable. Port
    order is read back from where the dots were actually painted, so a reorder that never reached the
    layout cannot pass.</p>
    <ul class="checks">
      <li>the add gutter belongs to the selected Block only</li>
      <li>hovering a lane gutter offers a bead that creates the port and opens its name</li>
      <li>a full Block expands to fit the new row instead of squeezing the old ones</li>
      <li>every existing row keeps its full 44px pitch after the growth</li>
      <li>press-and-hold on a port enters a drag that reorders its lane</li>
      <li>a reorder is exactly one undo step</li>
      <li>a press that moves first still makes a cable, never a reorder</li>
      <li>a cable spans the two Blocks and survives the edits above</li>
      <li>right-clicking a port re-aims the main menu at that port</li>
      <li>Add port below inserts in place rather than appending</li>
      <li>Move up steps the port one row without touching its identity</li>
      <li>Delete port removes the port and its cable, and one undo restores both</li>
      <li>the full product composition carries all three gestures, not just the lab</li>
      <li>the physical journey produced zero local console errors</li>
    </ul>
    <table style="margin-top:26px">
      <tr><th>Gate</th><th>Result</th></tr>
      <tr><td class="mono">npm run test:ports</td><td><b>14 / 14</b> real-browser checks · Block Dev + product</td></tr>
      <tr><td class="mono">npx vitest run</td><td><b>186</b> unit checks, <b>34</b> of them on the new lane contract</td></tr>
      <tr><td class="mono">npm run check</td><td>typecheck + 186 unit + 24 Python — green</td></tr>
      <tr><td class="mono">test:context-menu</td><td>12 / 12 — unchanged by the prepended port group</td></tr>
      <tr><td class="mono">test:click-to-edit</td><td>9 / 9 — the label still opens its editor</td></tr>
      <tr><td class="mono">test:batch</td><td>11 / 11 — multi-selection styles unaffected</td></tr>
      <tr><td>Mutation A — drop the self-removal shift in <code>moveBlockPortToIndexProps</code></td><td><b>2 checks red</b>, restored green</td></tr>
      <tr><td>Mutation B — let the hover strip overlap the port halo</td><td><b>1 check red</b>, restored green</td></tr>
    </table>
    <pre style="margin-top:18px">npm run test:ports        # the 14 browser checks, and the four screenshots above
npm run check             # typecheck + unit + Python</pre>
  </section>

  <section>
    <h2 class="section-title">8 · Code map</h2>
    <table>
      <tr><th>File</th><th>What it owns</th></tr>
      <tr><td class="mono">src/blocks/ports/portAffordances.ts</td><td><b>new</b> — where the bead sits, where a held port would land, and the grow-to-fit projection. Reads both answers back out of <code>layoutBlock</code>; authors no coordinate of its own.</td></tr>
      <tr><td class="mono">src/blocks/ports/portInteraction.ts</td><td><b>new</b> — the <code>select.dragging_block_port</code> state, the two transient atoms, and the right-click subject recorder.</td></tr>
      <tr><td class="mono">src/blocks/layoutBlock.ts</td><td><code>blockPortViewHeightForSlots</code> — the inverse of the pitch clamp, kept beside the clamp.</td></tr>
      <tr><td class="mono">src/blocks/commands/blockCommands.ts</td><td><code>insertBlockPortProps</code>, <code>insertBlockPortForInlineEditing</code>, <code>moveBlockPortToIndexProps</code>, <code>moveBlockPortToIndex</code>, <code>blockPortIndex</code>. Adding on canvas now grows the box.</td></tr>
      <tr><td class="mono">src/blocks/connections/PointingBlockPort.ts</td><td><code>onLongPress</code> — the one line that turns a held cable press into a reorder.</td></tr>
      <tr><td class="mono">src/blocks/ui/BlockCanvas.tsx</td><td>The gutters, the bead, the grip, the in-flight card and the drop rule.</td></tr>
      <tr><td class="mono">src/blocks/ui/BlockContextMenu.tsx</td><td>The five port commands, prepended to the existing menu.</td></tr>
      <tr><td class="mono">tests/block_port_in_window_smoke.mjs</td><td><b>new</b> — the 14 browser checks and the screenshots in this report.</td></tr>
    </table>
  </section>

  <footer>
    Build <code>__BUILD__</code> · captured from the real app by
    <code>tests/block_port_in_window_smoke.mjs</code> · regenerate this page with
    <code>python3 docs/build_block_port_in_window.py</code>.
    Nothing in the semantic Block model changed: port ids remain the durable identity, renaming and
    reordering never touch a cable binding, and deleting a port removes its cables through the
    binding util that already did that.
  </footer>

</div>
</body>
</html>
'''


if __name__ == "__main__":
    main()
