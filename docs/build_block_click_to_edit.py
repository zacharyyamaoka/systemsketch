#!/usr/bin/env python3
"""Build the self-contained Block click-to-edit implementation gallery."""

from __future__ import annotations

import base64
import sys
from pathlib import Path


HERE = Path(__file__).resolve().parent
FRAMES = HERE / "assets" / "block-click-to-edit"
FULL_APP = HERE / "block-click-to-edit-live-2026-09-01.png"
OUTPUT = HERE / "block-click-to-edit-2026-09-01.html"

SLOTS = {
    "__BEFORE_0__": FRAMES / "before-0-no-click.png",
    "__BEFORE_1__": FRAMES / "before-1-first-click.png",
    "__BEFORE_2__": FRAMES / "before-2-slow-second-click.png",
    "__BEFORE_3__": FRAMES / "before-3-click-port-name.png",
    "__AFTER_0__": FRAMES / "after-0-no-click.png",
    "__AFTER_1__": FRAMES / "after-1-first-click.png",
    "__AFTER_2__": FRAMES / "after-2-slow-second-click.png",
    "__AFTER_3__": FRAMES / "after-3-click-port-name.png",
    "__FULL_APP__": FULL_APP,
}


def image_data(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode("ascii")


def main() -> None:
    build = sys.argv[1] if len(sys.argv) > 1 else "working-tree"
    html = TEMPLATE
    for slot, path in SLOTS.items():
        html = html.replace(slot, image_data(path))
    html = html.replace("__STABLE_BUILD__", build)
    OUTPUT.write_text(html, encoding="utf-8")
    print(OUTPUT)


TEMPLATE = r'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>SystemSketch — editing text inside a Block</title>
<style>
  :root{color-scheme:dark;--bg:#080b12;--panel:#111724;--panel2:#182133;--ink:#f7f8fb;--muted:#9ba8bd;--line:#2b3547;--blue:#6d7cff;--cyan:#52d5d0;--green:#75d39b;--red:#e8836f;--amber:#efbd68;font-family:Inter,ui-sans-serif,system-ui,sans-serif}
  *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;color:var(--ink);background:radial-gradient(circle at 80% -10%,rgba(109,124,255,.2),transparent 34rem),radial-gradient(circle at 4% 40%,rgba(82,213,208,.08),transparent 32rem),var(--bg)}
  a{color:inherit}.shell{width:min(1180px,calc(100% - 34px));margin:auto;padding:42px 0 70px}
  .eyebrow{display:flex;align-items:center;gap:9px;color:var(--cyan);font:800 11px/1.2 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase}.eyebrow:before{content:"";width:8px;height:8px;border-radius:50%;background:var(--cyan);box-shadow:0 0 16px var(--cyan)}
  h1{max-width:900px;margin:16px 0 14px;font-size:clamp(40px,6vw,72px);line-height:.98;letter-spacing:-.05em}
  .lede{max-width:840px;margin:0;color:#c4ccda;font-size:18px;line-height:1.55}
  .actions{display:flex;flex-wrap:wrap;gap:10px;margin:25px 0}.button{padding:11px 16px;border:1px solid var(--line);border-radius:11px;background:var(--panel);text-decoration:none;font-weight:760}.button.primary{border-color:transparent;background:linear-gradient(135deg,#7180ff,#575fd8);box-shadow:0 12px 28px rgba(90,102,224,.24)}
  .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:11px;margin:0 0 24px}.stat{padding:16px 18px;border:1px solid var(--line);border-radius:15px;background:rgba(17,23,36,.88)}.stat b{display:block;font-size:25px}.stat span{color:var(--muted);font-size:13px}
  section{margin-top:44px}.section-title{margin:0 0 8px;font-size:30px;letter-spacing:-.03em}.section-copy{max-width:840px;margin:0 0 22px;color:var(--muted);line-height:1.6}
  .strip{display:grid;grid-template-columns:150px repeat(4,1fr);gap:11px;align-items:stretch}
  .strip + .strip{margin-top:11px}
  .rowlabel{display:flex;flex-direction:column;justify-content:center;padding:14px 15px;border:1px solid var(--line);border-radius:16px;background:var(--panel)}
  .rowlabel b{font-size:15px}.rowlabel span{margin-top:5px;color:var(--muted);font-size:12px;line-height:1.45}
  .rowlabel.before b{color:var(--red)}.rowlabel.after b{color:var(--green)}
  .frame{overflow:hidden;border:1px solid #3a465e;border-radius:16px;background:#f7f8fb;box-shadow:0 18px 46px rgba(0,0,0,.32)}
  .frame img{display:block;width:100%;height:auto}
  .frame figcaption{padding:10px 12px;background:var(--panel);color:var(--muted);font-size:11.5px;line-height:1.35}
  .frame figcaption b{display:block;color:var(--ink);font-size:12px}
  .heads{display:grid;grid-template-columns:150px repeat(4,1fr);gap:11px;margin-bottom:11px}
  .heads div{padding:9px 12px;border-radius:11px;background:#151d2b;color:#c8d0df;font:700 11px/1.3 ui-monospace,monospace;letter-spacing:.05em;text-transform:uppercase}
  .heads div:first-child{background:transparent}
  .verdict{margin-top:14px;padding:15px 17px;border-left:3px solid var(--green);background:rgba(117,211,155,.07);color:#d9dfeb;line-height:1.55}
  .verdict.warn{border-left-color:var(--amber);background:rgba(239,189,104,.07)}
  .wide{overflow:hidden;border:1px solid #3a465e;border-radius:20px;background:#eef0f3;box-shadow:0 28px 80px rgba(0,0,0,.35)}.wide img{display:block;width:100%;height:auto}.wide figcaption{display:flex;justify-content:space-between;gap:14px;padding:13px 15px;background:var(--panel);color:var(--muted);font-size:12px}.wide figcaption b{color:var(--ink)}
  pre{overflow-x:auto;margin:0;padding:16px 18px;border:1px solid var(--line);border-radius:14px;background:#0c111b;color:#d7deea;font:12.5px/1.65 ui-monospace,SFMono-Regular,monospace}
  pre .c{color:#6f7d95}pre .k{color:#9aa8ff}pre .s{color:#7fd6a4}pre .b{color:var(--amber);font-weight:700}
  .flow{display:grid;grid-template-columns:repeat(4,1fr);gap:11px}.step{position:relative;min-height:164px;padding:18px;border:1px solid var(--line);border-radius:16px;background:linear-gradient(145deg,var(--panel2),var(--panel))}.step:not(:last-child):after{content:"→";position:absolute;right:-17px;top:70px;z-index:1;color:var(--cyan);font-size:23px}.num{color:var(--blue);font:800 11px/1 ui-monospace,monospace}.step h3{margin:15px 0 7px;font-size:17px}.step p{margin:0;color:var(--muted);font-size:13px;line-height:1.5}
  table{width:100%;border-collapse:separate;border-spacing:0;overflow:hidden;border:1px solid var(--line);border-radius:16px;background:var(--panel);font-size:13px}th,td{padding:13px 14px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th:last-child,td:last-child{border-right:0}tr:last-child td{border-bottom:0}th{color:#c8d0df;background:#151d2b;font-size:11px;letter-spacing:.06em;text-transform:uppercase}td{color:var(--muted)}td:first-child{color:var(--ink);font-weight:750}.yes{color:var(--green)}.no{color:#8995a8}.native{color:var(--cyan);font:700 11px/1.3 ui-monospace,monospace}
  .files{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.file{padding:15px 17px;border:1px solid var(--line);border-radius:13px;background:var(--panel)}.file code{color:var(--cyan);font-size:12px}.file p{margin:7px 0 0;color:var(--muted);font-size:13px;line-height:1.5}
  .checks{display:grid;grid-template-columns:repeat(2,1fr);gap:9px;font-size:13px}.check{display:flex;gap:10px;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:var(--panel);color:#c9d1de;line-height:1.45}.check:before{content:"✓";color:var(--green);font-weight:800}
  footer{display:flex;justify-content:space-between;gap:20px;margin-top:46px;padding-top:19px;border-top:1px solid var(--line);color:var(--muted);font-size:12px}
  @media(max-width:1000px){.heads,.strip{grid-template-columns:1fr 1fr}.heads div:first-child,.rowlabel{grid-column:1 / -1}.step:after{display:none}}
  @media(max-width:900px){.stats,.flow,.checks{grid-template-columns:repeat(2,1fr)}.files{grid-template-columns:1fr}table{display:block;overflow-x:auto;white-space:nowrap}}
  @media(max-width:590px){.shell{width:min(100% - 20px,1180px);padding-top:28px}.stats,.flow,.checks,.heads,.strip{grid-template-columns:1fr}.wide figcaption,footer{flex-direction:column}}
</style>
</head>
<body>
<main class="shell">
  <div class="eyebrow">SystemSketch interaction evidence · 2026-09-01</div>
  <h1>Two clicks. Any speed.</h1>
  <p class="lede">Editing text inside a Block now feels like editing text inside a rectangle: the first click activates the Block, the next click on any of its text opens that text. It never mattered whether the two clicks were fast — and once the Block is active, one click moves the open editor onto a port name.</p>
  <div class="actions">
    <a class="button primary" href="http://127.0.0.1:4321/">Open Stable ↗</a>
    <a class="button" href="http://127.0.0.1:4322/?preset=block-dev">Open Block Dev</a>
  </div>
  <div class="stats">
    <div class="stat"><b>9 / 9</b><span>real-browser checks</span></div>
    <div class="stat"><b>0</b><span>tldraw internals patched</span></div>
    <div class="stat"><b>186 + 24</b><span>frontend + Python tests</span></div>
    <div class="stat"><b>__STABLE_BUILD__</b><span>verified build</span></div>
  </div>

  <section>
    <h2 class="section-title">The same journey, before and after</h2>
    <p class="section-copy">Both rows are the identical scripted pointer journey against the identical Block, driven through CDP in headless Chrome: no click, one click, then a second click <b>800&nbsp;ms later</b> — deliberately past tldraw’s 450&nbsp;ms double-click window — then a single click on the input port’s name. The only difference between the rows is whether <code>installBlockClickToEdit</code> is mounted.</p>
    <div class="heads"><div></div><div>No click</div><div>1st click</div><div>2nd click · slow</div><div>Then: click the port name</div></div>
    <div class="strip">
      <div class="rowlabel before"><b>Before</b><span>Frames 2 and 3 are byte-identical to frame 1. Nothing happened.</span></div>
      <figure class="frame"><img alt="Block at rest, not selected" src="data:image/png;base64,__BEFORE_0__" /><figcaption><b>At rest</b>Quiet face, no selection</figcaption></figure>
      <figure class="frame"><img alt="Block selected after one click" src="data:image/png;base64,__BEFORE_1__" /><figcaption><b>Activated</b>Selected, no editor</figcaption></figure>
      <figure class="frame"><img alt="Block still merely selected after a slow second click" src="data:image/png;base64,__BEFORE_2__" /><figcaption><b>Nothing happens</b>Second click re-selects only</figcaption></figure>
      <figure class="frame"><img alt="Block still merely selected after clicking the port name" src="data:image/png;base64,__BEFORE_3__" /><figcaption><b>Nothing happens</b>Port name is not reachable</figcaption></figure>
    </div>
    <div class="strip">
      <div class="rowlabel after"><b>After</b><span>Each click lands on the field under the pointer.</span></div>
      <figure class="frame"><img alt="Block at rest, not selected" src="data:image/png;base64,__AFTER_0__" /><figcaption><b>At rest</b>Identical starting face</figcaption></figure>
      <figure class="frame"><img alt="Block selected after one click" src="data:image/png;base64,__AFTER_1__" /><figcaption><b>Activated</b>Still just a selection</figcaption></figure>
      <figure class="frame"><img alt="Block title inline editor open with the word decode selected" src="data:image/png;base64,__AFTER_2__" /><figcaption><b>Title editor</b>Open, focused, text selected</figcaption></figure>
      <figure class="frame"><img alt="Block port name inline editor open with the word raw selected" src="data:image/png;base64,__AFTER_3__" /><figcaption><b>Port editor</b>One click moves the editor</figcaption></figure>
    </div>
    <p class="verdict">The before row is not a re-enactment. It is the same capture script run against a copy of this checkout with the two <code>installBlockClickToEdit(editor)</code> call sites disabled; frames 1, 2 and 3 came back byte-for-byte identical at 22,911 bytes each.</p>
  </section>

  <section>
    <h2 class="section-title">Why the slow click did nothing</h2>
    <p class="section-copy">tldraw already implements exactly this gesture for a rectangle, in <code>PointingShape.onPointerUp</code>. The branch is guarded on the shape having <b>exactly one</b> text label:</p>
<pre><span class="c">// tldraw 5.3.2 · SelectTool/childStates/PointingShape.mjs</span>
<span class="k">if</span> (selectedShapeIds.includes(selectingShape.id)) {
  <span class="k">if</span> (selectedShapeIds.length === 1) {
    <span class="k">const</span> geometry  = <span class="k">this</span>.editor.getShapeUtil(selectingShape).getGeometry(selectingShape)
    <span class="k">const</span> textLabels = getTextLabels(geometry)
    <span class="k">const</span> textLabel  = textLabels.length === <span class="b">1</span> ? textLabels[<span class="b">0</span>] : <span class="k">void</span> <span class="b">0</span>   <span class="c">// ← the gate</span>
    <span class="k">if</span> (textLabel) { <span class="c">/* select, setEditingShape, place caret */</span> }
  }
  <span class="c">// …otherwise fall through to a plain re-select: visually, nothing.</span>
}</pre>
    <p class="section-copy" style="margin-top:18px">A Block’s <code>getGeometry</code> returns a <code>Group2d</code> holding its body, its header, and one <code>Circle2d</code> per visible port — and the header and every port circle are flagged <code>isLabel</code> so they stay out of the shape’s bounds and stay hit-testable as anchors. That count is never 1, so the gate never opened. The rapid double-click kept working only because it travels a completely different route: <code>Idle.onDoubleClick</code> → <code>util.onDoubleClick</code>.</p>
    <p class="section-copy">Reducing the geometry to one label was never an option — a Block genuinely has several text boxes, which is the whole point of the shape. So the fix restores the rectangle’s <em>feel</em> without pretending a Block has a rectangle’s <em>anatomy</em>.</p>
  </section>

  <section>
    <h2 class="section-title">One rule, three gestures</h2>
    <p class="section-copy">The module keys off a single question — <b>was this Block already active when you pressed?</b> — which is why the fast case, the slow case, and the field-to-field case all come out of the same four lines instead of three special cases.</p>
    <div class="flow">
      <article class="step"><span class="num">01 / BEFORE-EVENT · DOWN</span><h3>Read the past</h3><p><code>before-event</code> runs ahead of the state chart, so this sees the selection the user actually saw when they pressed — not the one the click is about to create.</p></article>
      <article class="step"><span class="num">02 / EVENT · DOWN</span><h3>Resolve the field</h3><p>The painted <code>[data-pb-inline-field]</code> element answers first; the layout boxes cover the space beside the glyphs. A miss stays a miss.</p></article>
      <article class="step"><span class="num">03 / BEFORE-EVENT · UP</span><h3>Drop drags</h3><p>tldraw clears <code>isDragging</code> on pointer up before any handler runs, so the drag verdict is taken one step earlier.</p></article>
      <article class="step"><span class="num">04 / EVENT · UP</span><h3>Hand it back</h3><p><code>setEditingShape</code> drives tldraw’s own side effect into <code>select.editing_shape</code>. SystemSketch only chose <em>which</em> field that lifecycle exposes.</p></article>
    </div>
    <div class="verdict">Because step 4 is tldraw’s ordinary editing state, Escape, Enter, undo, the selection outline, and the context menu all keep behaving exactly as they did — the live browser check asserts the container really reports <code>data-state="select.editing_shape"</code>, not a bespoke overlay.</div>
  </section>

  <section>
    <h2 class="section-title">A miss has to stay a miss</h2>
    <p class="section-copy">The hit test returns <code>null</code> off the text, and that null is load-bearing. Without it, clicking an Expanded Block’s interior would open its title instead of selecting a child, and a double-click there would stop reaching <code>stepIntoDepthScope</code>.</p>
<pre><span class="c">// src/blocks/inlineBlockEditing.ts</span>
<span class="k">export function</span> blockInlineFieldAtPointOrNull(props, point) {
  <span class="k">const</span> layout = layoutBlock(props)
  <span class="k">if</span> (contains(layout.icon      ?? layout.headerIcon,  point)) <span class="k">return</span> { kind: <span class="s">'icon'</span> }
  <span class="k">if</span> (contains(layout.typeLabel ?? layout.headerType,  point)) <span class="k">return</span> { kind: <span class="s">'blockType'</span> }
  <span class="k">if</span> (contains(layout.description, point))                     <span class="k">return</span> { kind: <span class="s">'description'</span> }
  <span class="k">for</span> (<span class="k">const</span> placed <span class="k">of</span> layout.ports) { <span class="c">/* name vs type, per side */</span> }
  <span class="k">if</span> (contains(layout.title     ?? layout.headerTitle, point)) <span class="k">return</span> { kind: <span class="s">'title'</span> }
  <span class="k">return</span> <span class="b">null</span>                                <span class="c">// ← body, footer, frame interior</span>
}

<span class="c">/* The double-click reading of that same miss is unchanged: open the title. */</span>
<span class="k">export function</span> blockInlineFieldAtPoint(props, point) {
  <span class="k">return</span> blockInlineFieldAtPointOrNull(props, point) ?? DEFAULT_FIELD
}</pre>
    <table style="margin-top:22px">
      <thead><tr><th>Gesture on an active Block</th><th>Lands on</th><th>Result</th><th>Owner</th></tr></thead>
      <tbody>
        <tr><td>Second click, any speed</td><td>Title / type / icon / description</td><td class="yes">That field opens, text selected</td><td class="native">setEditingShape</td></tr>
        <tr><td>Second click, any speed</td><td>A port’s name or its type</td><td class="yes">That port’s field opens</td><td class="native">setEditingShape</td></tr>
        <tr><td>Click while already editing</td><td>A different field</td><td class="yes">Editor moves and refocuses</td><td class="native">reactive field atom</td></tr>
        <tr><td>Click</td><td>Body, footer, frame interior</td><td class="no">Nothing — plain selection</td><td class="native">stock tldraw</td></tr>
        <tr><td>Drag from the title</td><td>Title</td><td class="no">Block translates, no editor</td><td class="native">select.translating</td></tr>
        <tr><td>Double-click</td><td>Expanded interior</td><td class="no">Steps into the depth scope</td><td class="native">util.onDoubleClick</td></tr>
        <tr><td>Shift / ⌘ / right click</td><td>Anywhere</td><td class="no">Stock meaning, untouched</td><td class="native">stock tldraw</td></tr>
      </tbody>
    </table>
  </section>

  <section>
    <h2 class="section-title">Moving the editor needed signal, not paint</h2>
    <p class="section-copy">Clicking a second field of the Block you are already editing changes nothing about the shape record — same title, same ports, same box. The active field used to live in a plain <code>WeakMap</code>, so React had no reason to re-render and the editor stayed put. It is now an atom, which is what makes the fourth frame above possible.</p>
<pre><span class="c">// src/blocks/inlineBlockEditing.ts</span>
<span class="k">const</span> activeFields = <span class="k">new</span> WeakMap&lt;Editor, Atom&lt;ReadonlyMap&lt;TLShapeId, BlockInlineField&gt;&gt;&gt;()

<span class="c">// src/blocks/BlockInlineEditor.tsx</span>
<span class="k">const</span> field = useValue(
  <span class="s">'active Block inline field'</span>,
  () =&gt; getBlockInlineField(editor, shape.id),
  [editor, shape.id],
)</pre>
  </section>

  <section>
    <h2 class="section-title">Proven in the real app</h2>
    <p class="section-copy">Every claim above is asserted by <code>tests/block_click_to_edit_smoke.mjs</code>, which boots the Python API server, Vite, and headless Chrome, draws the Block with the real <kbd>B</kbd> tool, and then performs each gesture as physical pointer events at real coordinates — in the isolated Block Dev lab <em>and</em> again in the full product composition, because <code>App.tsx</code> mounts the behavior from two separate call sites.</p>
    <figure class="wide"><img alt="SystemSketch Block Dev canvas with the decode Block active and its input port name in an inline editor, inspector on the right" src="data:image/png;base64,__FULL_APP__" /><figcaption><b>Block Dev · live capture at the end of the run</b><span>Port name editing, inspector synchronized from the same shape record</span></figcaption></figure>
    <div class="checks" style="margin-top:16px">
      <div class="check">One click on the title activates the Block without opening its text</div>
      <div class="check">A slow second click on the title opens the title editor</div>
      <div class="check">One click on a port name moves the open editor onto that port</div>
      <div class="check">What you type in the moved editor is in the document</div>
      <div class="check">Two rapid clicks still open the title, unchanged</div>
      <div class="check">Clicking the body of an active Block opens nothing</div>
      <div class="check">Dragging from the title moves the Block and opens nothing</div>
      <div class="check">The same two clicks work in the full product composition, not just the lab</div>
      <div class="check">The whole journey produced zero local console errors</div>
    </div>
  </section>

  <section>
    <h2 class="section-title">What changed</h2>
    <div class="files">
      <div class="file"><code>src/blocks/blockClickToEdit.ts</code><p>New. The whole behavior: arm on pointer down, resolve the field, hand the decision back to <code>setEditingShape</code> on pointer up. Installed from both the product canvas and the Block Dev lab.</p></div>
      <div class="file"><code>src/blocks/inlineBlockEditing.ts</code><p>The active field became a reactive atom; added the strict <code>…AtPointOrNull</code> hit test and a shared, shape-scoped DOM hit helper.</p></div>
      <div class="file"><code>src/blocks/BlockInlineEditor.tsx</code><p>Reads the active field through <code>useValue</code>, so moving between fields re-renders and refocuses.</p></div>
      <div class="file"><code>src/blocks/BlockShapeUtil.tsx</code><p><code>onDoubleClick</code> now uses the shared DOM hit helper, which also scopes it to its own shape instead of any Block under the pointer.</p></div>
      <div class="file"><code>src/blocks/ui/BlockCanvas.tsx</code><p>The pointer-down capture remembers only a real field hit instead of resetting to the title, so it can no longer fight the atom.</p></div>
      <div class="file"><code>tests/block_click_to_edit_smoke.mjs</code><p>Nine real-browser checks across both compositions, each coordinate click hit-tested before it fires; <code>src/blocks/blockClickToEdit.test.ts</code> adds ten unit checks over the gesture and hit test.</p></div>
    </div>
  </section>

  <footer>
    <span>SystemSketch · FR — Block, Ports &amp; Edges Primitive · Editing text inside blocks</span>
    <span>Captured in headless Chrome against this checkout · 2026-09-01</span>
  </footer>
</main>
</body>
</html>
'''


if __name__ == "__main__":
    main()
