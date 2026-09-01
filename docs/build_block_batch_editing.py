#!/usr/bin/env python3
"""Build the visual implementation report for Block batch editing."""

from __future__ import annotations

import base64
import html
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DOCS = PROJECT_ROOT / "docs"
OUTPUT = DOCS / "block-batch-editing-implementation-2026-09-01.html"


def data_uri(path: Path) -> str:
    mime = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"


def code(text: str) -> str:
    return html.escape(text.strip("\n"))


BEFORE = """
// blockModel.ts — a plain validator. Nothing outside this shape knows the prop
// exists, so a multi-selection has no way to read or write it.
view: T.literalEnum(...BLOCK_VIEWS),
portLayout: T.literalEnum(...PORT_LAYOUTS).optional(),
showDescription: T.boolean,

// BlockContextMenu.tsx — every command gated on exactly one selected shape.
function onlySelectedBlock(editor) {
  const selected = editor.getSelectedShapes()
  return selected.length === 1 && isBlockShape(selected[0]) ? selected[0] : null
}

// blockCommands.ts — the inspector's own gate.
export function getOnlySelectedBlock(editor: Editor): BlockShape | null {
  const selected = editor.getSelectedShapes()
  if (selected.length !== 1) return null
  return isBlockShape(selected[0]) ? selected[0] : null
}
"""

AFTER = """
// blockModel.ts — the same three props, declared as tldraw StyleProps.
export const BlockViewStyle = StyleProp.defineEnum('systemsketch:blockView', {
  defaultValue: 'simple',
  values: BLOCK_VIEWS,
})
export const BlockPortLayoutStyle = StyleProp.defineEnum('systemsketch:blockPortLayout', {
  defaultValue: 'inline',
  values: PORT_LAYOUTS,
})
export const BlockShowDescriptionStyle = StyleProp.define('systemsketch:blockShowDescription', {
  defaultValue: true,
  type: T.boolean,
})

view: BlockViewStyle,
portLayout: BlockPortLayoutStyle,
showDescription: BlockShowDescriptionStyle,

// blockStyleCommands.ts — the whole batch write. No selection walking.
export function setStyleForSelection<T>(editor, style, value, historyLabel) {
  const count = getSelectedShapesFlat(editor)
    .filter((shape) => editor.getShapeStyleIfExists(shape, style) !== undefined).length
  if (count === 0) return { ok: false, reason: 'no-target' }
  if (isSharedStyleValue(getSharedStyleForSelection(editor, style), value)) {
    return { ok: false, reason: 'unchanged' }
  }
  editor.markHistoryStoppingPoint(historyLabel)
  editor.setStyleForSelectedShapes(style, value)
  return { ok: true, style: style.id, count }
}
"""

DOC_QUOTE = """
// tldraw docs · SDK features · Styles
const sharedStyles = editor.getSharedStyles()
const colorStyle = sharedStyles.get(DefaultColorStyle)

if (colorStyle?.type === 'shared') {
  console.log('All shapes are', colorStyle.value)
} else if (colorStyle?.type === 'mixed') {
  console.log('Shapes have different colors')
}

editor.setStyleForSelectedShapes(DefaultColorStyle, 'red')
"""

ONBEFORE = """
// BlockShapeUtil.onBeforeUpdate — already present, and already sufficient.
// setStyleForSelectedShapes writes ONLY { view }, so the box has to be
// restored by the shape itself rather than by the caller.
const remembered = next.props.views[next.props.view]
if (viewChanged && (next.props.w !== remembered.w || next.props.h !== remembered.h)) {
  return { ...next, props: { ...next.props, w: remembered.w, h: remembered.h } }
}
"""

CHECKS = [
    ("three real Blocks are authored through the stock Block tool and pointer lifecycle",
     "Blocks drawn with a real drag, titled through the real inline editor."),
    ("a marquee over three Blocks keeps the Block mini menu, naming the batch and its shared view",
     "The pill reads <code>3 Blocks</code> and presses <code>P</code>, because all three agree."),
    ("one click turns every selected Block from Port into Expanded",
     "The exact gesture in the brief, in one click."),
    ("the batch is one history step: a single Ctrl+Z restores all three Blocks",
     "One <code>markHistoryStoppingPoint</code> per gesture, not one per shape."),
    ("shift-click builds the same batch, and a disagreeing pair reports as mixed with nothing pressed",
     "Second entry point; <code>SharedStyle</code> resolves to <code>mixed</code>."),
    ("the inspector stays open on a multi-selection and shows only what the Blocks share",
     "Requirement 1 in the brief. View · Ports · Display · Per-Block."),
    ("choosing a value in the batch inspector resolves the mixed selection for every Block",
     "Mixed is not a dead end — one click settles it."),
    ("the right-click menu batches Block view over the whole selection, unchecked while mixed, with structural Add withheld",
     "Requirement 2 in the brief, plus the boundary that protects identity."),
    ("Ports batches to Offset for all three, and reopening the menu reads both batched values back as checked",
     "The write is durable, and the menu survives being dismissed."),
    ("the isolated Block Dev lab batches Ports through the same right-click command, and its inspector agrees",
     "Two independent surfaces, one command, same answer."),
    ("the physical journey produced zero local console errors",
     "No exceptions anywhere in the run."),
]


def main() -> None:
    batch_shot = data_uri(DOCS / "block-batch-editing-live-2026-09-01.png")
    inspector_shot = data_uri(DOCS / "block-batch-inspector-live-2026-09-01.png")
    excalidraw = data_uri(Path.home() / "zach_brain" / "Pasted image 20260901124613.png")
    before_state = data_uri(Path.home() / "zach_brain" / "Pasted image 20260901124359.png")

    checks = "\n".join(
        f'      <li><b>{html.escape(label)}</b><span>{detail}</span></li>'
        for label, detail in CHECKS
    )

    report = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch · Block batch editing</title>
<style>
  :root{{--ink:#14171a;--muted:#626a73;--line:#dfe3e7;--paper:#f6f7f8;--card:#fff;--green:#149447;--amber:#e89b12;--blue:#315be8;--red:#c4392c}}
  *{{box-sizing:border-box}} body{{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}}
  main{{width:min(1180px,calc(100% - 32px));margin:auto;padding:42px 0 72px}}
  .hero{{padding:32px;border:1px solid var(--line);border-radius:24px;background:var(--card);box-shadow:0 18px 50px #1218200b}}
  .kicker{{font-size:12px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:#4b5560}}
  h1{{margin:6px 0 10px;font-size:clamp(32px,5.4vw,60px);line-height:1;letter-spacing:-.05em}}
  .lede{{max-width:820px;margin:0;color:var(--muted);font-size:18px}}
  .badges{{display:flex;flex-wrap:wrap;gap:8px;margin-top:20px}}
  .badge{{padding:6px 10px;border:1px solid var(--line);border-radius:999px;background:#fafbfc;font:700 12px/1.2 ui-monospace,monospace}}
  .badge.ok{{border-color:#bfe3cd;background:#eefaf2;color:#0e6b36}}
  section{{margin-top:44px}} h2{{margin:0 0 6px;font-size:28px;letter-spacing:-.03em}}
  h3{{margin:0 0 8px;font-size:17px}}
  .sub{{margin:0 0 20px;color:var(--muted);max-width:820px}}
  figure{{margin:0;padding:10px;border:1px solid var(--line);border-radius:18px;background:var(--card);overflow:hidden}}
  figure img{{display:block;width:100%;border-radius:11px;border:1px solid #e3e6e9}}
  figcaption{{padding:10px 4px 2px;color:var(--muted)}} figcaption strong{{display:block;color:var(--ink)}}
  .two{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}}
  .two.compare{{align-items:start}} .compare figure img{{max-height:430px;object-fit:contain;background:#fff}}
  pre{{margin:0;padding:16px;border:1px solid var(--line);border-radius:14px;background:#0f1216;color:#e6edf3;overflow-x:auto;font:12.5px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace}}
  pre.light{{background:#fbfcfd;color:#1b2027;border-color:var(--line)}}
  .card{{padding:20px;border:1px solid var(--line);border-radius:18px;background:var(--card)}}
  .flow{{display:grid;grid-template-columns:1fr auto 1fr auto 1fr auto 1fr;gap:10px;align-items:center;margin-top:8px}}
  .node{{min-height:126px;padding:16px;border:1px solid var(--line);border-radius:16px;background:var(--card)}}
  .node b{{display:block;font:700 13px/1.3 ui-monospace,monospace}} .node small{{display:block;margin-top:8px;color:var(--muted)}}
  .node.ours{{border-color:#c9d6ff;background:#f6f9ff}} .arrow{{font-size:24px;color:#8b929a;text-align:center}}
  ol.checks{{margin:0;padding:0;list-style:none;counter-reset:c}}
  ol.checks li{{position:relative;counter-increment:c;padding:12px 12px 12px 46px;border-bottom:1px solid var(--line)}}
  ol.checks li:last-child{{border-bottom:0}}
  ol.checks li::before{{content:"✓";position:absolute;left:12px;top:12px;width:22px;height:22px;border-radius:50%;background:#eefaf2;color:#0e6b36;font:800 13px/22px ui-monospace,monospace;text-align:center}}
  ol.checks b{{display:block;font-weight:650}} ol.checks span{{color:var(--muted);font-size:13.5px}}
  table{{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:16px;overflow:hidden}}
  th,td{{padding:11px 14px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}}
  th{{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#4b5560;background:#fafbfc}}
  tr:last-child td{{border-bottom:0}}
  code{{padding:.12em .35em;border-radius:5px;background:#eceff2;font:12.5px/1.4 ui-monospace,monospace}}
  .note{{padding:16px 18px;border:1px solid #f2d9a8;border-radius:14px;background:#fdf7ea}}
  .note.bad{{border-color:#f0c4bd;background:#fdf1ef}}
  footer{{margin-top:50px;padding-top:20px;border-top:1px solid var(--line);color:var(--muted)}}
  @media(max-width:820px){{.two{{grid-template-columns:1fr}}.flow{{grid-template-columns:1fr}}.arrow{{transform:rotate(90deg)}}}}
</style>
</head>
<body><main>
  <header class="hero">
    <div class="kicker">SystemSketch · Block, Ports &amp; Edges</div>
    <h1>Nine Blocks,<br>one click.</h1>
    <p class="lede">Multi-select now behaves on a Block exactly as it behaves on a tldraw rectangle: the inspector
      stays open and shows what the selection has in common, the right-click menu applies to all of it, and
      a disagreement reads <b>Mixed</b> instead of nothing. The implementation is tldraw's own documented
      styles path — three Block props became <code>StyleProp</code>s, and the editor did the rest.</p>
    <div class="badges">
      <span class="badge ok">11/11 real-browser checks</span>
      <span class="badge ok">135 unit tests</span>
      <span class="badge">tldraw 5.3.2</span>
      <span class="badge">StyleProp.defineEnum</span>
      <span class="badge">setStyleForSelectedShapes</span>
      <span class="badge">2026-09-01</span>
    </div>
  </header>

  <section>
    <h2>Before</h2>
    <p class="sub">Nine Blocks selected, and the inspector had nothing to say. Every Block command was gated on
      <code>selected.length === 1</code>, so a batch selection fell through to the generic count pill.</p>
    <div class="two compare">
      <figure>
        <img alt="SystemSketch before: nine Blocks selected, the inspector reads Select one Block to inspect it" src="{before_state}">
        <figcaption><strong>The reported state</strong>“9 selected · Inspect · Delete”, and a right panel that asks for a single Block.</figcaption>
      </figure>
      <figure>
        <img alt="Excalidraw applying a background colour to three selected shapes at once" src="{excalidraw}">
        <figcaption><strong>The reference</strong>Excalidraw keeps the panel open for a multi-selection and applies each control to everything selected.</figcaption>
      </figure>
    </div>
  </section>

  <section>
    <h2>What the documentation recommends</h2>
    <p class="sub">tldraw has a first-class concept for exactly this. A <code>StyleProp</code> is a shape prop the
      editor tracks across a selection: it folds the selection into <code>shared</code> or <code>mixed</code>, and it
      writes every shape that declares the style — group descendants included, shapes without the style skipped.
      The <a href="https://tldraw.dev/sdk-features/styles">Styles</a> page and the
      <a href="https://tldraw.dev/examples/shape-with-custom-styles">custom-styles example</a> spell out the whole loop.</p>
    <div class="two">
      <div><h3>The documented read</h3><pre>{code(DOC_QUOTE)}</pre></div>
      <div class="card">
        <h3>Why this is the happy path and not a shortcut</h3>
        <p>Nothing in SystemSketch iterates the selection to write a batch. <code>setStyleForSelectedShapes</code>
          recurses through groups, skips shapes whose util does not declare the style, and issues one
          <code>updateShapes</code> call. The Mixed state is not a UI invention either — it is
          <code>SharedStyle&lt;T&gt;</code> coming back from the editor.</p>
        <p style="margin-bottom:0">The same mechanism is what makes a rectangle's colour batch. Blocks now sit on it
          unchanged, which is what “function basically the exact same way” has to mean.</p>
      </div>
    </div>
  </section>

  <section>
    <h2>The seam</h2>
    <p class="sub">Blue boxes are SystemSketch. Everything between them is stock tldraw, doing work we no longer write.</p>
    <div class="flow">
      <div class="node ours"><b>BLOCK_SHAPE_PROPS</b><small>view · portLayout · showDescription declared as <code>StyleProp</code>s</small></div>
      <div class="arrow">→</div>
      <div class="node"><b>Editor.styleProps</b><small>tldraw indexes every StyleProp it finds on each ShapeUtil at construction</small></div>
      <div class="arrow">→</div>
      <div class="node"><b>getSharedStyles()</b><small>folds the selection to <code>shared</code> / <code>mixed</code>, walking into groups</small></div>
      <div class="arrow">→</div>
      <div class="node ours"><b>Mini menu · Inspector · Right-click</b><small>three surfaces, one <code>SharedStyle</code> to render</small></div>
    </div>
    <div class="flow" style="margin-top:14px">
      <div class="node ours"><b>setStyleForSelection()</b><small>one history stopping point, then delegate</small></div>
      <div class="arrow">→</div>
      <div class="node"><b>setStyleForSelectedShapes()</b><small>one <code>updateShapes</code> for the whole selection</small></div>
      <div class="arrow">→</div>
      <div class="node ours"><b>BlockShapeUtil.onBeforeUpdate</b><small>restores each Block's remembered box for the new view</small></div>
      <div class="arrow">→</div>
      <div class="node"><b>One undo step</b><small>Ctrl+Z puts every Block back together</small></div>
    </div>
  </section>

  <section>
    <h2>The change</h2>
    <div class="two">
      <div><h3>Before</h3><pre>{code(BEFORE)}</pre></div>
      <div><h3>After</h3><pre>{code(AFTER)}</pre></div>
    </div>
    <div class="card" style="margin-top:18px">
      <h3>The one invariant that needed care</h3>
      <p class="sub" style="margin-bottom:12px"><code>setStyleForSelectedShapes</code> writes a single prop —
        <code>{{ view: 'expanded' }}</code> — and nothing else. A Block's width and height are remembered per view, so
        a raw view write would leave a 340×198 Port box wearing an Expanded label. The guard for that already existed
        on the shape, which is why the batch path needed no special case:</p>
      <pre class="light">{code(ONBEFORE)}</pre>
    </div>
  </section>

  <section>
    <h2>What batches, and what deliberately does not</h2>
    <p class="sub">The StyleProp boundary is the product decision, not just a technical one: the props that batch are
      exactly the props that describe how a Block <em>looks</em>. The props that say which Block it <em>is</em> stay
      behind a single selection, because one batch write would overwrite nine identities with one value.</p>
    <table>
      <tr><th>Property</th><th>Batches</th><th>Why</th></tr>
      <tr><td><code>view</code> · Simple / Port / Expanded</td><td>Yes — <code>systemsketch:blockView</code></td><td>The gesture in the brief. Presentation, and every Block keeps its own remembered size per view.</td></tr>
      <tr><td><code>portLayout</code> · Aligned / Offset</td><td>Yes — <code>systemsketch:blockPortLayout</code></td><td>Presentation. Needed a store migration: a StyleProp cannot be optional.</td></tr>
      <tr><td><code>showDescription</code></td><td>Yes — <code>systemsketch:blockShowDescription</code></td><td>Presentation. “Hide every description on these Blocks” is a real batch wish.</td></tr>
      <tr><td><code>routing</code> on connections · Curved / Straight</td><td>Yes — <code>systemsketch:connectionRouting</code></td><td>Same problem, same answer: a bundle of cables is one selection. No migration — the accepted values did not change.</td></tr>
      <tr><td>title · blockType · icon · description · notes</td><td>No</td><td>Identity. A batch write replaces nine names with one.</td></tr>
      <tr><td>ports (add / rename / reorder / delete)</td><td>No</td><td>Structure with stable ids that cables bind to. <b>Add</b> stays behind a single Block and still opens its inline editor.</td></tr>
      <tr><td><b>Step into</b> (Expanded depth)</td><td>No</td><td>Descent is into one concrete scope; a batch has no single destination.</td></tr>
    </table>
  </section>

  <section>
    <h2>Live in the real app</h2>
    <p class="sub">Both captures come from <code>npm run test:batch</code> driving the actual product build in headless
      Chrome — real pointer drags, real shift-clicks, real menus. Nothing here is a mock of our own CSS.</p>
    <figure>
      <img alt="SystemSketch product app: two Blocks selected, batch inspector showing a Mixed view and shared Ports and Display values" src="{inspector_shot}">
      <figcaption><strong>The batch inspector, mixed</strong>Two Blocks that disagree about view: <b>Mixed</b> is labelled and no
        choice is pressed, while <b>Ports</b> and <b>Display</b> still show the values they share. The mini menu reads
        <code>2 Blocks</code>. Per-Block explains, in the panel, why title and ports are not here.</figcaption>
    </figure>
    <figure style="margin-top:18px">
      <img alt="SystemSketch product app: three Blocks selected and switched to Expanded in one click" src="{batch_shot}">
      <figcaption><strong>The gesture from the brief</strong>Three Port Blocks marquee-selected, then one click on <code>E</code>.
        Each grows to <em>its own</em> remembered Expanded box, and one Ctrl+Z puts all three back.</figcaption>
    </figure>
  </section>

  <section>
    <h2>Browser proof</h2>
    <p class="sub"><code>npm run test:batch</code> — <code>tests/block_batch_editing_smoke.mjs</code>. The product
      composition carries the full journey; the isolated Block Dev lab confirms the same commands without product chrome.</p>
    <div class="card"><ol class="checks">
{checks}
    </ol></div>
  </section>

  <section>
    <h2>Honest edges</h2>
    <div class="two">
      <div class="note">
        <h3 style="margin-top:0">Fixed along the way: the right-click menu used to open once per page session</h3>
        <p>Found while writing the proof, and not introduced by the batch work — it reproduced with a plain rectangle in
          the <code>?preset=stock</code> lane, which mounts zero SystemSketch components. Right-click opened the menu;
          after any dismissal it never reopened until reload, which made every right-click command, batch ones included,
          effectively single-use.</p>
        <p><b>Cause.</b> The stock root is uncontrolled on Radix's side. <code>DefaultContextMenu</code> mirrors Radix's
          open state into tldraw's menu registry and renders the content only while that mirror says open, but
          <code>MenuClickCapture</code> calls <code>clearOpenMenus()</code> straight from the dismissing pointerdown.
          Radix is never told, its internal <code>open</code> stays <code>true</code>, and the next
          <code>contextmenu</code> changes nothing — so <code>onOpenChange</code> never fires and the mirror is never
          repopulated.</p>
        <p style="margin-bottom:0"><b>Fix.</b> <code>src/blocks/ui/stockContextMenuRoot.ts</code> remounts the stock
          root, which is the only lever from outside — a fresh Radix root starts closed. It is never done
          speculatively, because tldraw puts <code>&lt;Canvas /&gt;</code> inside the root's Trigger and a remount would
          discard an open inline editor with it. It happens on window blur, and otherwise only when the wedge is
          actually observed: a right-click that produced no menu, after which that gesture is replayed against the
          fresh root so the user's own click is the one that opens.
          <code>npm run test:context-menu</code> is green again at 12/12.</p>
      </div>
      <div class="note">
        <h3 style="margin-top:0">A marquee will not sweep up an Expanded Block</h3>
        <p>An Expanded Block is frame-like, and stock tldraw only brushes a frame into a selection when the brush
          encloses it whole. That is tldraw's rule and it is kept, not worked around — <b>Select All</b>, shift-click,
          and clicking the frame edge all still reach them.</p>
        <p style="margin-bottom:0">The batch smoke test uses the marquee for Port-sized Blocks and Select All once they
          are Expanded, which is exactly what a person would do.</p>
      </div>
    </div>
  </section>

  <section>
    <h2>Files</h2>
    <table>
      <tr><th>Path</th><th>Role</th></tr>
      <tr><td><code>src/blocks/blockModel.ts</code></td><td>Three props promoted to <code>StyleProp</code>s. The whole feature turns on this file.</td></tr>
      <tr><td><code>src/blocks/BlockShapeUtil.tsx</code></td><td><code>PortLayoutStyle</code> migration: a StyleProp cannot be optional, so stored Blocks get the donor default made explicit.</td></tr>
      <tr><td><code>src/blocks/commands/blockStyleCommands.ts</code></td><td>New. The batch command seam — history mark, delegation, shared/mixed reads, counts.</td></tr>
      <tr><td><code>src/blocks/commands/blockCommands.ts</code></td><td><code>getBlockInspectorContext</code> gains a <code>multi</code> kind.</td></tr>
      <tr><td><code>src/blocks/ui/BlockBatchInspector.tsx</code></td><td>New. The multi-selection inspector face, rendered from <code>SharedStyle</code> alone.</td></tr>
      <tr><td><code>src/blocks/ui/BlockSelectionMiniMenu.tsx</code></td><td>Takes a <code>SharedStyle</code> instead of a bare view, and names the batch.</td></tr>
      <tr><td><code>src/blocks/ui/BlockContextMenu.tsx</code></td><td>Block view and Ports batch and name the count; Add and Step into stay single-Block.</td></tr>
      <tr><td><code>src/blocks/connections/connectionModel.ts</code></td><td><code>ConnectionRoutingStyle</code>, so a bundle of cables batches too.</td></tr>
      <tr><td><code>src/chrome/SystemSketchChrome.tsx</code></td><td>The mini menu now appears for any selection containing a Block.</td></tr>
      <tr><td><code>src/blocks/ui/stockContextMenuRoot.ts</code></td><td>New. Keeps tldraw's stock context-menu root usable for a whole session — see Honest edges.</td></tr>
      <tr><td><code>tests/block_batch_editing_smoke.mjs</code></td><td>New. The real-browser proof behind every claim above.</td></tr>
    </table>
  </section>

  <footer>
    Rebuild this page with <code>python3 docs/build_block_batch_editing.py</code>. Re-run the proof with
    <code>npm run test:batch</code>.
  </footer>
</main></body>
</html>
"""
    OUTPUT.write_text(report, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
