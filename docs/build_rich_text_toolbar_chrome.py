"""Build the self-contained stock-rich-text chrome review gallery."""
from __future__ import annotations

import base64
import json
from pathlib import Path


DOCS = Path(__file__).resolve().parent
ROOT = DOCS.parent
OUTPUT = DOCS / "rich-text-toolbar-chrome-2026-09-04.html"
LIVE = DOCS / "assets" / "rich-text-toolbar-chrome-live-2026-09-04.png"
FIXTURE = ROOT / "sketches" / "review" / "rich-text-toolbar-chrome.png"
RESULTS = DOCS / "assets" / "rich-text-toolbar-chrome-results.json"


def image(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def build() -> str:
    live = image(LIVE)
    fixture = image(FIXTURE)
    checks = json.loads(RESULTS.read_text(encoding="utf-8"))
    checklist = "".join(f"<li>{item['label']}</li>" for item in checks if item["ok"])
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch · Rich-text toolbar chrome</title>
<style>
  :root {{ color-scheme:light; --ink:#172033; --muted:#647086; --paper:#f4f6fa; --card:#fff; --line:#dce2ec; --blue:#3188ec; --violet:#8257e6; --green:#167447; --green-bg:#eaf8f0; font-family:Inter,ui-sans-serif,system-ui,sans-serif }}
  * {{ box-sizing:border-box }} body {{ margin:0; color:var(--ink); background:var(--paper) }} main {{ width:min(1220px,calc(100% - 36px)); margin:auto; padding:54px 0 78px }}
  .eyebrow {{ color:var(--blue); font:750 12px/1 ui-monospace,monospace; letter-spacing:.11em; text-transform:uppercase }} h1 {{ max-width:940px; margin:12px 0 16px; font-size:clamp(42px,6vw,72px); line-height:.98; letter-spacing:-.055em }} .lede {{ max-width:900px; margin:0; color:var(--muted); font-size:19px; line-height:1.62 }}
  .chips {{ display:flex; gap:9px; flex-wrap:wrap; margin-top:24px }} .chip {{ padding:8px 11px; border:1px solid var(--line); border-radius:999px; background:#fff; color:var(--muted); font:650 12px/1 ui-monospace,monospace }} .chip.ok {{ color:var(--green); background:var(--green-bg); border-color:#b9dfc8 }}
  section {{ margin-top:56px }} h2 {{ margin:0 0 10px; font-size:29px; letter-spacing:-.035em }} .sub {{ max-width:870px; margin:0 0 22px; color:var(--muted); line-height:1.65 }}
  figure {{ margin:0; overflow:hidden; border:1px solid var(--line); border-radius:18px; background:#fff; box-shadow:0 14px 36px rgba(34,48,73,.08) }} figure img {{ display:block; width:100%; height:auto }} figcaption {{ padding:15px 18px 17px; color:var(--muted); border-top:1px solid var(--line); font-size:14px; line-height:1.55 }} figcaption b {{ color:var(--ink) }}
  .compare {{ display:grid; grid-template-columns:1fr 1fr; gap:18px }} .compare figure img {{ aspect-ratio:3/2; object-fit:cover; object-position:center }}
  .scopes {{ display:grid; grid-template-columns:1fr 1fr; gap:18px }} .scope {{ padding:22px; border:1px solid var(--line); border-radius:17px; background:var(--card) }} .scope b {{ display:block; margin-bottom:10px; font-size:18px }} .scope code {{ display:inline-block; margin-top:12px }}
  .flow {{ display:grid; grid-template-columns:1fr 46px 1fr 46px 1fr; gap:10px; align-items:stretch }} .node {{ padding:20px; border:1px solid var(--line); border-radius:16px; background:#fff }} .node[data-accent] {{ border-color:#cdbff1; box-shadow:inset 0 3px 0 var(--violet) }} .node b {{ display:block; margin-bottom:8px }} .node small {{ color:var(--muted); line-height:1.55 }} .arrow {{ align-self:center; text-align:center; color:#99a5b7; font-size:25px }}
  code {{ padding:2px 6px; border-radius:5px; color:#4f407c; background:#f0edf8; font:620 12px/1.45 ui-monospace,monospace }} ul {{ margin:0; padding:0; list-style:none; display:grid; grid-template-columns:1fr 1fr; gap:10px }} li {{ position:relative; padding:13px 15px 13px 40px; border:1px solid #cfe4d8; border-radius:12px; background:#f3fbf6; color:#335443; line-height:1.45 }} li::before {{ content:'✓'; position:absolute; left:15px; color:var(--green); font-weight:800 }}
  .why {{ padding:23px 25px; border:1px solid #cfe1fd; border-radius:17px; background:#f3f8ff; line-height:1.7 }} footer {{ margin-top:54px; color:var(--muted); font-size:13px; line-height:1.65 }}
  @media(max-width:820px) {{ .compare,.scopes,ul{{grid-template-columns:1fr}} .flow{{grid-template-columns:1fr}} .arrow{{transform:rotate(90deg)}} }}
</style></head><body><main>
<p class="eyebrow">SystemSketch · implementation review · 2026-09-04</p>
<h1>Stock text behavior, SystemSketch chrome.</h1>
<p class="lede">Selected-text formatting remains tldraw 5.3.2’s native Tiptap toolbar—its six commands, range selection, link transaction, focus, and keyboard behavior are untouched. A narrowly scoped CSS adapter gives that reliable stock component the same black contextual surface as whole-box formatting.</p>
<div class="chips"><span class="chip ok">6/6 live browser checks</span><span class="chip ok">stock commands preserved</span><span class="chip">CSS-only behavior seam</span></div>

<section><h2>The result in the real editor</h2><p class="sub">The sentence is a stock tldraw Geo rich-text field. Only “range formatting” is bold; the floating bar is still tldraw’s own <code>DefaultRichTextToolbar</code>.</p><figure><img src="{live}" alt="Live SystemSketch review fixture with black tldraw rich-text toolbar"><figcaption><b>Actual browser capture.</b> The bar retains Bold, Italic, Code, Link, List, and Highlight in their stock order. Its 40px height, 13px radius, inverse surface, shadow, hover, focus, and active state now use the SystemSketch contextual vocabulary.</figcaption></figure></section>

<section><h2>Two scopes, one visual family</h2><div class="scopes">
  <div class="scope"><b>Whole box</b>Single-click selection uses SystemSketch’s composed appearance menu. Font, size, paint, alignment, and shape settings apply to the selected object.<br><code>document scope</code></div>
  <div class="scope"><b>Selected text</b>Double-click and select characters to invoke tldraw’s stock range toolbar. Bold, italic, code, link, list, and highlight apply only to that range.<br><code>character-range scope</code></div>
</div></section>

<section><h2>The implementation boundary</h2><p class="sub">There is no second rich-text command registry and no replacement React toolbar.</p><div class="flow">
  <div class="node"><b>tldraw selection + Tiptap</b><small>Owns the current range, editor focus, and document transaction.</small></div><div class="arrow">→</div>
  <div class="node" data-accent><b>Stock toolbar component</b><small><code>DefaultRichTextToolbar</code> renders the native controls and link editor.</small></div><div class="arrow">→</div>
  <div class="node"><b>SystemSketch skin</b><small><code>.tlui-rich-text__toolbar</code> maps only chrome to <code>--ss-*</code> tokens.</small></div>
</div></section>

<section><h2>Ready-to-drive review board</h2><p class="sub">The committed fixture explains both scopes on-canvas. Its instruction arrows are stock bound arrows; the acceptance journey moves the target and proves the cue follows before exercising range formatting.</p><figure><img src="{fixture}" alt="Rich-text toolbar review fixture"><figcaption><b>Human review path.</b> Click once to see whole-box formatting. Double-click, select “range formatting,” and use Bold or Italic. Pass when the menus share black chrome and only the selected words change.</figcaption></figure></section>

<section><h2>Browser evidence</h2><ul>{checklist}</ul></section>
<section><div class="why"><b>Why this stays easy to extend:</b> any existing or future stock tldraw rich-text field receives this skin automatically because the adapter targets the public stock toolbar root, while app-owned fields can continue using the compositional contextual-control registry. Behavior follows the field’s transaction model; visual language stays shared.</div></section>
<footer>Primary source: <code>src/chrome/rich-text-toolbar.css</code>. Stock-boundary guard: <code>tests/test_stock_boundary.py</code>. Physical proof: <code>npm run test:rich-text-toolbar</code>. Fixture: <code>sketches/review/rich-text-toolbar-chrome.systemsketch</code>.</footer>
</main></body></html>"""


if __name__ == "__main__":
    OUTPUT.write_text(build(), encoding="utf-8")
    print(OUTPUT)
