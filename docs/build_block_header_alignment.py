"""Build the self-contained Block header-alignment review gallery."""
from __future__ import annotations

import base64
import json
from pathlib import Path


DOCS = Path(__file__).resolve().parent
ROOT = DOCS.parent
OUTPUT = DOCS / "block-header-alignment-2026-09-04.html"
LIVE = DOCS / "assets" / "block-header-alignment-live-2026-09-04.png"
FIXTURE = ROOT / "sketches" / "review" / "block-header-alignment.png"
RESULTS = DOCS / "assets" / "block-header-alignment-results.json"


def image(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def build() -> str:
    live = image(LIVE)
    fixture = image(FIXTURE)
    checks = json.loads(RESULTS.read_text(encoding="utf-8"))
    checklist = "".join(f"<li>{item['label']}</li>" for item in checks if item["ok"])
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch · Block header alignment</title>
<style>
  :root {{ color-scheme:light; --ink:#172033; --muted:#647086; --paper:#f4f6fa; --card:#fff; --line:#dce2ec; --blue:#3188ec; --green:#167447; --green-bg:#eaf8f0; font-family:Inter,ui-sans-serif,system-ui,sans-serif }}
  * {{ box-sizing:border-box }} body {{ margin:0; color:var(--ink); background:var(--paper) }} main {{ width:min(1220px,calc(100% - 36px)); margin:auto; padding:54px 0 78px }}
  .eyebrow {{ color:var(--blue); font:750 12px/1 ui-monospace,monospace; letter-spacing:.11em; text-transform:uppercase }} h1 {{ max-width:970px; margin:12px 0 16px; font-size:clamp(42px,6vw,72px); line-height:.98; letter-spacing:-.055em }} .lede {{ max-width:930px; margin:0; color:var(--muted); font-size:19px; line-height:1.62 }}
  .chips {{ display:flex; gap:9px; flex-wrap:wrap; margin-top:24px }} .chip {{ padding:8px 11px; border:1px solid var(--line); border-radius:999px; background:#fff; color:var(--muted); font:650 12px/1 ui-monospace,monospace }} .chip.ok {{ color:var(--green); background:var(--green-bg); border-color:#b9dfc8 }}
  section {{ margin-top:56px }} h2 {{ margin:0 0 10px; font-size:29px; letter-spacing:-.035em }} .sub {{ max-width:900px; margin:0 0 22px; color:var(--muted); line-height:1.65 }}
  figure {{ margin:0; overflow:hidden; border:1px solid var(--line); border-radius:18px; background:#fff; box-shadow:0 14px 36px rgba(34,48,73,.08) }} figure img {{ display:block; width:100%; height:auto }} figcaption {{ padding:15px 18px 17px; color:var(--muted); border-top:1px solid var(--line); font-size:14px; line-height:1.55 }} figcaption b {{ color:var(--ink) }}
  .split {{ display:grid; grid-template-columns:1fr 1fr; gap:18px }} .card {{ padding:24px; border:1px solid var(--line); border-radius:17px; background:#fff }} .card h3 {{ margin:0 0 8px; font-size:20px }} .card p {{ margin:0; color:var(--muted); line-height:1.65 }}
  .diagram {{ display:grid; grid-template-columns:1fr 42px 1.2fr 42px 1fr; align-items:center; gap:10px; margin-top:20px }} .lane {{ min-height:112px; display:grid; place-items:center; padding:18px; border:1px solid var(--line); border-radius:15px; background:#fff; text-align:center }} .lane.center {{ border-color:#a8ccfb; background:#f2f7ff }} .lane b {{ display:block; margin-bottom:7px }} .lane small {{ color:var(--muted); line-height:1.45 }} .arrow {{ text-align:center; color:#9aa7ba; font-size:24px }}
  code {{ padding:2px 6px; border-radius:5px; color:#325a91; background:#edf4ff; font:620 12px/1.45 ui-monospace,monospace }} ul {{ margin:0; padding:0; list-style:none; display:grid; grid-template-columns:1fr 1fr; gap:10px }} li {{ position:relative; padding:13px 15px 13px 40px; border:1px solid #cfe4d8; border-radius:12px; background:#f3fbf6; color:#335443; line-height:1.45 }} li::before {{ content:'✓'; position:absolute; left:15px; color:var(--green); font-weight:800 }}
  .why {{ padding:23px 25px; border:1px solid #cfe1fd; border-radius:17px; background:#f3f8ff; line-height:1.7 }} footer {{ margin-top:54px; color:var(--muted); font-size:13px; line-height:1.65 }}
  @media(max-width:820px) {{ .split,ul{{grid-template-columns:1fr}} .diagram{{grid-template-columns:1fr}} .arrow{{transform:rotate(90deg)}} }}
</style></head><body><main>
<p class="eyebrow">SystemSketch · implementation review · 2026-09-04</p>
<h1>One useful choice: left or truly centered.</h1>
<p class="lede">Port and Expanded Blocks now expose <b>Header alignment</b> in the inspector. Left preserves the established header. Center places the icon/title/optional Draft identity group on the Block’s actual midpoint while semantic type and fold chrome remain independent. The existing title-formatting popup is deliberately unchanged.</p>
<div class="chips"><span class="chip ok">7/7 live browser checks</span><span class="chip ok">Port + Expanded</span><span class="chip">no migration required</span><span class="chip">title formatting retained</span></div>

<section><h2>The result in the real editor</h2><p class="sub">This is the actual Port Block after using the new inspector control. The same journey also switches to Expanded and compares the identity group and Block midpoints directly, with a one-pixel tolerance.</p><figure><img src="{live}" alt="Centered Block header in the live SystemSketch inspector"><figcaption><b>Live product capture.</b> Icon, <code>parse_frame</code>, and <code>Draft 2</code> stay together at center; <code>Transform</code> remains readable at the right edge. The same selection keeps its ordinary S / P / E menu.</figcaption></figure></section>

<section><h2>Two layers of control, not one overloaded setting</h2><div class="split">
  <div class="card"><h3>Header alignment</h3><p>The inspector’s Left / Center choice places the identity composition. It is the fast, structural choice most people need.</p></div>
  <div class="card"><h3>Title-box formatting</h3><p>The existing contextual popup still owns font, size, bold, ink, and alignment <em>inside</em> the title box. Those occurrence-local properties are neither removed nor rewritten.</p></div>
</div><div class="diagram"><div class="lane"><div><b>Mirrored metadata lane</b><small>An invisible layout twin reserves the exact same width as the visible type lane.</small></div></div><div class="arrow">→</div><div class="lane center"><div><b>Icon + title + Draft</b><small>The identity track remains centered and truncates safely when the Block becomes narrow.</small></div></div><div class="arrow">→</div><div class="lane"><div><b>Visible metadata lane</b><small>Diff state and semantic type stay anchored to the right.</small></div></div></div></section>

<section><h2>Ready-to-drive review board</h2><p class="sub">The generated fixture contains the left-aligned interaction target with a Draft badge and a centered reference, plus stock bound callout arrows. The browser journey first drags the target to prove its cue follows, then drives Left / Center and both header-bearing views.</p><figure><img src="{fixture}" alt="Block header alignment review fixture"><figcaption><b>Human review path.</b> Select <code>parse_frame</code>, use View → Header alignment → Center, then switch it back to Left. The centered identity is the icon, title, and optional Draft badge; disclosure controls remain an independent corner choice and type metadata stays right.</figcaption></figure></section>

<section><h2>Browser evidence</h2><ul>{checklist}</ul></section>
<section><div class="why"><b>Why this shape stays simple:</b> a strong default plus one high-value escape hatch is faster than turning the inspector into Figma. The lower-level title controls remain available for compatibility, but the ordinary job—choosing a conventional or centered header—takes one click.</div></section>
<footer>Primary seams: <code>src/blocks/blockModel.ts</code>, <code>src/blocks/layoutBlock.ts</code>, <code>src/blocks/ui/BlockCanvas.tsx</code>, and <code>src/blocks/ui/BlockInspector.tsx</code>. Physical proof: <code>npm run test:header-alignment</code>. Fixture: <code>sketches/review/block-header-alignment.systemsketch</code>.</footer>
</main></body></html>"""


if __name__ == "__main__":
    OUTPUT.write_text(build(), encoding="utf-8")
    print(OUTPUT)
