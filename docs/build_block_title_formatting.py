"""Build the self-contained review gallery for editable Block title formatting."""
from __future__ import annotations

import base64
from pathlib import Path


DOCS = Path(__file__).resolve().parent
SCREENSHOT = DOCS / "assets" / "block-title-formatting-live-2026-09-04.png"
OUTPUT = DOCS / "block-title-formatting-2026-09-04.html"


def image(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def build() -> str:
    screenshot = image(SCREENSHOT)
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch · Block title formatting</title>
<style>
  :root {{ color-scheme: light; --ink:#172033; --muted:#5f6c80; --paper:#f4f6fa; --card:#fff; --line:#dce2ec; --blue:#3d9dff; --green:#167447; --green-bg:#ebf8f0; font-family:Inter,ui-sans-serif,system-ui,sans-serif; }}
  * {{ box-sizing:border-box }} body {{ margin:0; background:var(--paper); color:var(--ink) }} main {{ width:min(1100px,calc(100% - 36px)); margin:auto; padding:54px 0 82px }}
  .eyebrow {{ color:#286fd4; font:700 12px/1 ui-monospace,monospace; letter-spacing:.1em; text-transform:uppercase }} h1 {{ max-width:850px; margin:12px 0 16px; font-size:clamp(38px,6vw,68px); line-height:.98; letter-spacing:-.055em }}
  .lede {{ max-width:760px; margin:0; color:var(--muted); font-size:19px; line-height:1.6 }} .chips {{ display:flex; flex-wrap:wrap; gap:9px; margin:24px 0 0 }} .chip {{ padding:8px 11px; border:1px solid var(--line); border-radius:999px; background:#fff; color:var(--muted); font:650 12px/1 ui-monospace,monospace }} .chip.ok {{ color:var(--green); background:var(--green-bg); border-color:#b9dfc8 }}
  section {{ margin-top:54px }} h2 {{ margin:0 0 10px; font-size:28px; letter-spacing:-.035em }} p {{ line-height:1.65 }} .sub {{ max-width:780px; color:var(--muted); margin:0 0 22px }} figure {{ margin:0; overflow:hidden; border:1px solid var(--line); border-radius:18px; background:#fff; box-shadow:0 14px 36px rgba(34,48,73,.08) }} figure img {{ display:block; width:100%; height:auto }} figcaption {{ padding:14px 18px 16px; color:var(--muted); border-top:1px solid var(--line); font-size:14px; line-height:1.55 }}
  .flow {{ display:grid; grid-template-columns:repeat(5,1fr); gap:10px; align-items:stretch; margin-top:22px }} .step {{ min-height:122px; padding:17px; border:1px solid var(--line); border-radius:15px; background:var(--card) }} .step b {{ display:block; margin-bottom:8px; font-size:15px }} .step small {{ color:var(--muted); line-height:1.5 }} .arrow {{ align-self:center; color:#9aa7b8; font-size:25px; text-align:center }}
  table {{ width:100%; border-collapse:separate; border-spacing:0; overflow:hidden; border:1px solid var(--line); border-radius:16px; background:#fff }} th,td {{ padding:13px 15px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; line-height:1.5 }} th {{ color:#667286; background:#f8f9fb; font-size:11px; letter-spacing:.08em; text-transform:uppercase }} tr:last-child td {{ border-bottom:0 }} .control {{ display:inline-grid; place-items:center; min-width:31px; height:27px; margin-right:7px; padding:0 8px; border:1px solid #cbd3df; border-radius:6px; color:#27344a; font-weight:700; vertical-align:middle }} .swatch {{ width:14px; min-width:14px; height:14px; min-height:14px; padding:0; border-radius:99px; background:var(--blue) }}
  .why {{ padding:21px 23px; border:1px solid #cfe1fd; border-radius:16px; background:#f3f8ff; line-height:1.65 }} code {{ padding:2px 5px; border-radius:5px; background:#eef1f5; font:600 12px/1.4 ui-monospace,monospace }} footer {{ margin-top:54px; color:var(--muted); font-size:13px }} @media(max-width:760px){{.flow{{grid-template-columns:1fr}}.arrow{{transform:rotate(90deg)}}}}
</style></head><body><main>
<p class="eyebrow">SystemSketch · implementation review · 2026-09-04</p>
<h1>Format a Block title without leaving the title.</h1>
<p class="lede">A Block’s semantic name remains one edit field. While it is live, a FigJam-like contextual bar follows the selection and applies durable visual presentation to that one canvas occurrence.</p>
<div class="chips"><span class="chip ok">8/8 live browser checks</span><span class="chip">SVG export preserves title appearance</span><span class="chip">tldraw 5.3.2 stays stock</span></div>
<section><h2>Live proof</h2><p class="sub">This is the actual product after changing the active Port-view Block title to Bookish, Medium, bold, blue, and right-aligned. The text input remains present under the floating bar.</p><figure><img src="{screenshot}" alt="SystemSketch canvas with an editable Block title, a floating formatting menu, and the Block inspector"><figcaption><b>Real browser capture.</b> The title is still in its input, while typeface, size, bold, color, and alignment are all visible in the selection-anchored contextual bar.</figcaption></figure></section>
<section><h2>One editing transaction, five visual controls</h2><div class="flow"><div class="step"><b>1 · Edit title</b><small>Click a Block title. The existing inline editor remains tldraw-owned.</small></div><div class="arrow">→</div><div class="step"><b>2 · Format</b><small>The bar opens typeface, size, FigJam ink/custom color, bold, and alignment choices.</small></div><div class="arrow">→</div><div class="step"><b>3 · Keep typing</b><small>Each choice returns focus to the live title editor; Enter still commits normally.</small></div></div></section>
<section><h2>Control contract</h2><table><thead><tr><th>Control</th><th>Stored on Block</th><th>What changes</th></tr></thead><tbody><tr><td><span class="control">Aa</span>Typeface</td><td><code>titleFont</code></td><td>Simple, Bookish, Technical, or Scribbled face</td></tr><tr><td><span class="control">Medium</span>Size</td><td><code>titleSize</code></td><td>Small, Medium, Large, or Extra large title scale</td></tr><tr><td><span class="control">B</span>Bold</td><td><code>titleBold</code></td><td>Explicit strong or regular weight without rewriting the title</td></tr><tr><td><span class="control swatch"></span>Color</td><td><code>titleColor</code></td><td>FigJam palette, self-describing custom hex, or automatic ink</td></tr><tr><td><span class="control">≡</span>Alignment</td><td><code>titleAlign</code></td><td>Left, center, or right alignment inside the view’s title region</td></tr></tbody></table></section>
<section><h2>Deliberate boundary</h2><div class="why"><b>Presentation is occurrence-local.</b> Formatting does not rename a linked definition or fork the Block’s semantic identity. The title string remains the canonical function name; these five optional properties describe how this particular canvas occurrence speaks. Existing boards retain their prior Simple, Port, Expanded, and Value defaults until someone makes an explicit formatting choice. The same resolved title appearance is used by the canvas, live input, and SVG export.</div></section>
<footer>Evidence: <code>npm run test:title-formatting</code> (8 checks), <code>npm run test:export</code> (11 checks), and <code>npm run test:appearance</code> (existing picker regression). Source: <code>src/blocks/titleAppearance.ts</code> and <code>src/blocks/ui/BlockTitleFormattingMenu.tsx</code>.</footer>
</main></body></html>"""


if __name__ == "__main__":
    OUTPUT.write_text(build(), encoding="utf-8")
    print(OUTPUT)
