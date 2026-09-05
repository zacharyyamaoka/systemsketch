"""Build the self-contained contextual-menu composition review gallery."""
from __future__ import annotations

import base64
import html
from pathlib import Path


DOCS = Path(__file__).resolve().parent
ROOT = DOCS.parent
OUTPUT = DOCS / "contextual-menu-composition-2026-09-04.html"
TEXT_CAPTURE = DOCS / "assets" / "contextual-menu-text-font-2026-09-04.png"
BLOCK_CAPTURE = DOCS / "assets" / "contextual-menu-block-font-2026-09-04.png"


def image(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def lines(relative: str) -> int:
    return len((ROOT / relative).read_text(encoding="utf-8").splitlines())


def build() -> str:
    text_capture = image(TEXT_CAPTURE)
    block_capture = image(BLOCK_CAPTURE)
    title_lines = lines("src/blocks/ui/BlockTitleFormattingMenu.tsx")
    registry_lines = lines("src/contextualMenus/contextualControlRegistry.ts")
    renderer_lines = lines("src/contextualMenus/ContextualControls.tsx")
    metrics = html.escape(
        f"17 registered controls · 3 formatting recipes · {title_lines}-line Block binding adapter · "
        f"{registry_lines}-line registry · {renderer_lines}-line renderer"
    )
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch · Contextual menu composition</title>
<style>
  :root {{ color-scheme:light; --ink:#172033; --muted:#647086; --paper:#f4f6fa; --card:#fff; --line:#dce2ec; --violet:#8257e6; --blue:#3188ec; --green:#167447; --green-bg:#ebf8f0; font-family:Inter,ui-sans-serif,system-ui,sans-serif }}
  * {{ box-sizing:border-box }} body {{ margin:0; color:var(--ink); background:var(--paper) }} main {{ width:min(1160px,calc(100% - 36px)); margin:auto; padding:52px 0 78px }}
  .eyebrow {{ color:var(--blue); font:750 12px/1 ui-monospace,monospace; letter-spacing:.11em; text-transform:uppercase }} h1 {{ max-width:900px; margin:12px 0 16px; font-size:clamp(40px,6vw,70px); line-height:.98; letter-spacing:-.055em }} .lede {{ max-width:850px; margin:0; color:var(--muted); font-size:19px; line-height:1.6 }}
  .chips {{ display:flex; gap:9px; flex-wrap:wrap; margin-top:24px }} .chip {{ padding:8px 11px; border:1px solid var(--line); border-radius:999px; background:#fff; color:var(--muted); font:650 12px/1 ui-monospace,monospace }} .chip.ok {{ color:var(--green); background:var(--green-bg); border-color:#b9dfc8 }}
  section {{ margin-top:56px }} h2 {{ margin:0 0 10px; font-size:29px; letter-spacing:-.035em }} .sub {{ max-width:830px; margin:0 0 22px; color:var(--muted); line-height:1.65 }}
  .compare {{ display:grid; grid-template-columns:1fr 1fr; gap:18px }} figure {{ margin:0; overflow:hidden; border:1px solid var(--line); border-radius:18px; background:#fff; box-shadow:0 14px 36px rgba(34,48,73,.08) }} figure img {{ display:block; width:100%; aspect-ratio:4/3; object-fit:cover; object-position:center }} figcaption {{ min-height:104px; padding:15px 18px 17px; color:var(--muted); border-top:1px solid var(--line); font-size:14px; line-height:1.55 }} figcaption b {{ display:block; color:var(--ink); margin-bottom:4px }}
  .flow {{ display:grid; grid-template-columns:1.2fr 38px 1fr 38px 1fr 38px 1.25fr; gap:9px; align-items:stretch }} .node {{ padding:18px; border:1px solid var(--line); border-radius:15px; background:var(--card) }} .node[data-accent] {{ border-color:#c9b9f3; box-shadow:inset 0 3px 0 var(--violet) }} .node b {{ display:block; margin-bottom:9px; font-size:15px }} .node code {{ display:block; margin:6px 0; color:#4a3b7c; font:650 12px/1.4 ui-monospace,monospace }} .node small {{ color:var(--muted); line-height:1.5 }} .arrow {{ align-self:center; color:#99a5b7; font-size:25px; text-align:center }}
  table {{ width:100%; border-collapse:separate; border-spacing:0; overflow:hidden; border:1px solid var(--line); border-radius:16px; background:#fff }} th,td {{ padding:14px 16px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; line-height:1.5 }} th {{ color:#667286; background:#f8f9fb; font-size:11px; letter-spacing:.08em; text-transform:uppercase }} tr:last-child td {{ border-bottom:0 }} code {{ padding:2px 5px; border-radius:5px; background:#eef1f5; font:620 12px/1.4 ui-monospace,monospace }}
  .why {{ padding:22px 24px; border:1px solid #cfe1fd; border-radius:16px; background:#f3f8ff; line-height:1.68 }} .metric {{ color:#514078; background:#f3effd; border:1px solid #d9cdf8; border-radius:14px; padding:16px 18px; font:650 13px/1.55 ui-monospace,monospace }} footer {{ margin-top:54px; color:var(--muted); font-size:13px; line-height:1.6 }}
  @media(max-width:860px) {{ .compare{{grid-template-columns:1fr}} .flow{{grid-template-columns:1fr}} .arrow{{transform:rotate(90deg)}} }}
</style></head><body><main>
<p class="eyebrow">SystemSketch · implementation review · 2026-09-04</p>
<h1>Contextual menus are recipes now.</h1>
<p class="lede">Text, Block-title, shape, and connector menus no longer own private copies of typeface, size, color, alignment, popover, or option-row UI. A central control vocabulary is bound to each target’s document transaction, then ordered by a small surface recipe and rendered once.</p>
<div class="chips"><span class="chip ok">31/31 live interaction checks</span><span class="chip ok">1,186 unit checks</span><span class="chip">tldraw 5.3.2 stays stock</span></div>

<section><h2>The photographed drift is gone</h2><p class="sub">These two captures come from separate real-browser journeys. The left is stock tldraw Text/Geo appearance; the right is a live SystemSketch Block title. Both typeface lists are the same registered component: a compact family-aware <b>Aa</b> preview plus exactly one label.</p><div class="compare">
  <figure><img src="{text_capture}" alt="Ordinary text shape with shared typeface popover"><figcaption><b>Ordinary Text / Geo target</b>Recipe <code>shape</code> contributes Typeface in its <code>type</code> group. No repeated “Bookish Bookish” or wide traced wordmark.</figcaption></figure>
  <figure><img src="{block_capture}" alt="Editable Block title with shared typeface popover"><figcaption><b>Live Block-title target</b>Recipe <code>block-title</code> uses the same Typeface rows while a Radix editing-mode adapter keeps the title field alive.</figcaption></figure>
</div></section>

<section><h2>One path from vocabulary to pixels</h2><p class="sub">The backend split follows the actual responsibilities. A new text surface implements only its binding adapter and picks a recipe; it does not copy menu markup or CSS.</p><div class="flow">
  <div class="node" data-accent><b>Control registry</b><code>font · size · color · align</code><small>Owns labels, options, trigger, layout, and glyph semantics once.</small></div><div class="arrow">→</div>
  <div class="node"><b>Target bindings</b><code>value + onSelect</code><small>Stock tldraw styles or Block title props own their own transactions.</small></div><div class="arrow">→</div>
  <div class="node"><b>Recipes</b><code>shape · connector · block-title</code><small>Data declares visibility, grouping, and order; empty groups collapse.</small></div><div class="arrow">→</div>
  <div class="node"><b>Shared renderer</b><code>selection | editing</code><small>One toolbar, option row, custom picker, and popover implementation.</small></div>
</div></section>

<section><h2>Composition contracts</h2><table><thead><tr><th>Surface</th><th>Ordered groups</th><th>Binding authority</th></tr></thead><tbody>
  <tr><td>Shape / Text</td><td><code>identity → paint → type → alignment</code></td><td>Stock <code>StyleProp</code> writes through tldraw’s supported style seam.</td></tr>
  <tr><td>Connector</td><td><code>paint → flow</code></td><td>Stock dash/weight/endpoints plus SystemSketch’s existing routing adapter; Add text is a registered action.</td></tr>
  <tr><td>Block title</td><td><code>type → emphasis → ink → alignment</code></td><td>Occurrence-local Block title props; formatting refocuses the live inline editor.</td></tr>
  <tr><td>Whole selection shell</td><td><code>domain actions → appearance → wrap → layout</code></td><td>A second recipe composes larger menu modules without conditional JSX duplication.</td></tr>
</tbody></table></section>

<section><h2>Guardrails against another fork</h2><div class="why"><b>Surfaces cannot redefine the vocabulary through the binding API.</b> <code>bindContextualControl</code> accepts an id, current value, document command, and narrowly-scoped runtime attachments such as Automatic color. It does not accept labels, option arrays, glyphs, layouts, or trigger types. Even connector Weight is now its own registered control rather than a one-off Font-size override. The browser journeys also assert recipe IDs, group order, registered kinds, and the four exact Typeface rows on both targets.</div></section>

<section><div class="metric">{metrics}</div></section>
<footer>Primary source: <code>src/contextualMenus/contextualControlRegistry.ts</code>, <code>src/contextualMenus/ContextualControls.tsx</code>, and <code>src/contextualMenus/contextualSurfaceRegistry.ts</code>. Adapters: <code>src/appearance/AppearanceControls.tsx</code> and <code>src/blocks/ui/BlockTitleFormattingMenu.tsx</code>. Proof: <code>npm run test:appearance</code> (20), <code>npm run test:title-formatting</code> (8), <code>npm run test:contextual-composition</code> (3), and <code>npm run check</code> (1,186 unit + 115 host checks).</footer>
</main></body></html>"""


if __name__ == "__main__":
    OUTPUT.write_text(build(), encoding="utf-8")
    print(OUTPUT)
