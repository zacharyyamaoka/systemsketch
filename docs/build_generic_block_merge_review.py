"""Build one self-contained index of the Block/Port candidate review tracks."""
from __future__ import annotations

import base64
import html
import subprocess
from pathlib import Path


DOCS = Path(__file__).resolve().parent
ROOT = DOCS.parent
OUTPUT = DOCS / "generic-block-merge-review-2026-09-04.html"


FEATURES = [
    {
        "group": "Primitive & interaction",
        "index": "01",
        "title": "Floating Port primitive",
        "summary": "A place-anywhere Port with name, type, value, orientation, offset, and filled-state override—the reusable endpoint beneath richer Blocks.",
        "commit": "f46676e8a55c6cbbad16096511702a7e526be184",
        "image": "sketches/review/floating-port.png",
        "board": "http://127.0.0.1:4616/?board=%2Fhome%2Fbam%2F.systemsketch-reviews%2Fmerge-review-floating-port-20260904-f46676e8a55c%2Fsketches%2Freview%2Ffloating-port.systemsketch",
        "report": "http://127.0.0.1:4616/docs/floating-port-primitive-2026-09-04.html",
    },
    {
        "group": "Primitive & interaction",
        "index": "02",
        "title": "Direct Port dragging repair",
        "summary": "A selected or unselected floating Port enters stock tldraw translation on the first press-and-drag; no activation click is required.",
        "commit": "2a7f365e8873f14bc854721493e832f3dde5d295",
        "image": "sketches/review/floating-port-direct-drag.png",
        "board": "http://127.0.0.1:4622/?board=%2Fhome%2Fbam%2F.systemsketch-reviews%2Fmerge-review-port-direct-drag-20260904-2a7f365e8873%2Fsketches%2Freview%2Ffloating-port-direct-drag.systemsketch",
        "report": "http://127.0.0.1:4622/docs/floating-port-primitive-2026-09-04.html",
    },
    {
        "group": "Container behavior",
        "index": "03",
        "title": "Folding + fit contents",
        "summary": "Optional disclosure chevrons, folded Port/Expanded faces, automatic child-fitting, and an explicit Remove from container escape hatch.",
        "commit": "6f523738e7037cffb6a618ec2d94ee416d25d552",
        "image": "sketches/review/block-fold-autosize.png",
        "board": "http://127.0.0.1:4624/?board=%2Fhome%2Fbam%2F.systemsketch-reviews%2Fmerge-review-block-fold-autosize-20260904-6f523738e703%2Fsketches%2Freview%2Fblock-fold-autosize.systemsketch",
        "report": "http://127.0.0.1:4624/docs/block-fold-autosize-2026-09-04.html",
    },
    {
        "group": "Container behavior",
        "index": "04",
        "title": "Auto-fit drag stability repair",
        "summary": "Rapid child drags remain in the stock frame membership transaction; auto-fit no longer ejects a child or makes the container jump.",
        "commit": "9418e8b5f96f58117d3e0d19a00b86b39db2df3b",
        "image": "docs/assets/block-fold-autosize-rapid-drag-2026-09-04.png",
        "board": "http://127.0.0.1:4628/?board=%2Fhome%2Fbam%2F.systemsketch-reviews%2Fmerge-review-autofit-stability-20260904-9418e8b5f96f%2Fsketches%2Freview%2Fblock-autofit-drag-stability.systemsketch",
        "report": "http://127.0.0.1:4628/docs/block-fold-autosize-2026-09-04.html",
    },
    {
        "group": "Block chrome",
        "index": "05",
        "title": "Footer + header-divider toggles",
        "summary": "Independent inspector switches hide or show the footer and the rule between header and body without changing Block semantics.",
        "commit": "cc82b900877ae3b6c16e536f74bb0584b1e4a56b",
        "image": "docs/assets/block-chrome-toggles-fixture-driven-2026-09-04.png",
        "board": "http://127.0.0.1:4630/?board=%2Fhome%2Fbam%2F.systemsketch-reviews%2Fmerge-review-block-chrome-toggles-20260904-cc82b900877a%2Fsketches%2Freview%2Fblock-chrome-toggles.systemsketch",
        "report": "http://127.0.0.1:4630/docs/block-chrome-toggles-2026-09-04.html",
    },
    {
        "group": "Text surfaces",
        "index": "06",
        "title": "Live Block-title formatting",
        "summary": "The title’s contextual bar remains available during on-canvas editing; occurrence-local font, size, bold, ink, and alignment survive the edit.",
        "commit": "e5b654adeefc6c27d69148a29b7229b8d0775739",
        "image": "docs/assets/block-title-formatting-live-2026-09-04.png",
        "board": "http://127.0.0.1:4632/?board=%2Fhome%2Fbam%2F.systemsketch-reviews%2Fmerge-review-title-formatting-20260904-e5b654adeefc%2Fsketches%2Freview%2Fblock-title-formatting.systemsketch",
        "report": "http://127.0.0.1:4632/docs/block-title-formatting-2026-09-04.html",
    },
    {
        "group": "Text surfaces",
        "index": "07",
        "title": "Contextual-menu composition refactor",
        "summary": "One registry defines menu controls; small recipes choose composition and order for Text, Geo, connectors, and live Block-title editing.",
        "commit": "cc7a364f4d3830da51b3cea712fc8bf32143bbba",
        "image": "sketches/review/contextual-menu-composition.png",
        "board": "http://127.0.0.1:4634/?board=%2Fhome%2Fbam%2F.systemsketch-reviews%2Fmerge-review-contextual-menu-20260904-cc7a364f4d38%2Fsketches%2Freview%2Fcontextual-menu-composition.systemsketch",
        "report": "http://127.0.0.1:4634/docs/contextual-menu-composition-2026-09-04.html",
    },
    {
        "group": "Text surfaces",
        "index": "08",
        "title": "Stock rich-text toolbar, dark chrome",
        "summary": "tldraw’s native selected-range commands and Tiptap transaction stay intact; a CSS adapter gives the toolbar the same black contextual surface.",
        "commit": "b41c02db3729b60307f28bea3d9d225663289549",
        "image": "docs/assets/rich-text-toolbar-chrome-live-2026-09-04.png",
        "board": "http://127.0.0.1:4636/?board=%2Fhome%2Fbam%2F.systemsketch-reviews%2Fmerge-review-rich-text-toolbar-20260904-b41c02db3729%2Fsketches%2Freview%2Frich-text-toolbar-chrome.systemsketch",
        "report": "http://127.0.0.1:4636/docs/rich-text-toolbar-chrome-2026-09-04.html",
    },
    {
        "group": "Block chrome",
        "index": "09",
        "title": "Header Left / Center",
        "summary": "A focused inspector choice centers the icon/title identity group on the true Block midpoint while type metadata remains at the right edge.",
        "commit": "0f81ca705dbcfb83339bbfeace9426949c356668",
        "image": "docs/assets/block-header-alignment-live-2026-09-04.png",
        "board": "http://127.0.0.1:4638/?board=%2Fhome%2Fbam%2F.systemsketch-reviews%2Fmerge-review-header-alignment-20260904-0f81ca705dbc%2Fsketches%2Freview%2Fblock-header-alignment.systemsketch",
        "report": "http://127.0.0.1:4638/docs/block-header-alignment-2026-09-04.html",
    },
]


def git_image(commit: str, path: str) -> str:
    raw = subprocess.check_output(["git", "show", f"{commit}:{path}"], cwd=ROOT)
    return "data:image/png;base64," + base64.b64encode(raw).decode("ascii")


def feature_card(item: dict[str, str]) -> str:
    title = html.escape(item["title"])
    summary = html.escape(item["summary"])
    group = html.escape(item["group"])
    image = git_image(item["commit"], item["image"])
    return f"""<article class="feature" data-group="{group}">
      <div class="shot"><img loading="lazy" src="{image}" alt="{title} review capture"><span class="number">{item['index']}</span></div>
      <div class="copy"><div class="meta"><span>{group}</span><code>{item['commit'][:7]}</code></div><h3>{title}</h3><p>{summary}</p>
      <div class="actions"><a class="primary" href="{item['board']}">Open board</a><a href="{item['report']}">Detailed gallery</a></div></div>
    </article>"""


def build() -> str:
    cards = "".join(feature_card(item) for item in FEATURES)
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch · Generic Block merge-review index</title>
<style>
  :root {{ color-scheme:light; --ink:#172033; --muted:#667187; --paper:#f3f5f9; --card:#fff; --line:#dce2ec; --blue:#237ee7; --blue2:#eaf3ff; --green:#167447; --orange:#e9822b; font-family:Inter,ui-sans-serif,system-ui,sans-serif }}
  * {{ box-sizing:border-box }} body {{ margin:0; color:var(--ink); background:var(--paper) }} a {{ color:inherit }} main {{ width:min(1320px,calc(100% - 32px)); margin:auto; padding:54px 0 82px }}
  .eyebrow {{ color:var(--blue); font:760 12px/1 ui-monospace,monospace; letter-spacing:.11em; text-transform:uppercase }} h1 {{ max-width:1050px; margin:12px 0 18px; font-size:clamp(44px,6.2vw,78px); line-height:.96; letter-spacing:-.058em }} .lede {{ max-width:970px; margin:0; color:var(--muted); font-size:19px; line-height:1.65 }}
  .status {{ display:flex; flex-wrap:wrap; gap:9px; margin:25px 0 0 }} .pill {{ padding:8px 11px; border:1px solid var(--line); border-radius:999px; background:#fff; color:var(--muted); font:650 12px/1 ui-monospace,monospace }} .pill.live {{ border-color:#b9dfc8; color:var(--green); background:#ecf9f1 }}
  .boundary {{ display:grid; grid-template-columns:auto 1fr; gap:18px; align-items:start; margin:38px 0 50px; padding:20px 22px; border:1px solid #cfe1fb; border-radius:16px; background:#f1f7ff }} .boundary strong {{ color:var(--blue); font:800 13px/1 ui-monospace,monospace; text-transform:uppercase; letter-spacing:.06em }} .boundary p {{ margin:0; line-height:1.62; color:#40506a }}
  .controls {{ display:flex; gap:8px; flex-wrap:wrap; margin-bottom:20px }} .controls button {{ padding:8px 12px; border:1px solid var(--line); border-radius:999px; color:var(--muted); background:#fff; cursor:pointer; font:650 12px/1.1 inherit }} .controls button[aria-pressed=true] {{ border-color:var(--blue); color:#fff; background:var(--blue) }}
  .grid {{ display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:20px }} .feature {{ min-width:0; overflow:hidden; border:1px solid var(--line); border-radius:18px; background:var(--card); box-shadow:0 12px 30px rgba(38,51,76,.07) }} .feature[hidden] {{ display:none }}
  .shot {{ position:relative; overflow:hidden; aspect-ratio:16/10; border-bottom:1px solid var(--line); background:#edf1f6 }} .shot img {{ width:100%; height:100%; display:block; object-fit:cover; object-position:center }} .number {{ position:absolute; top:12px; left:12px; display:grid; width:34px; height:34px; place-items:center; border:1px solid rgba(255,255,255,.7); border-radius:50%; color:#fff; background:rgba(20,29,44,.78); backdrop-filter:blur(8px); font:750 12px/1 ui-monospace,monospace }}
  .copy {{ display:flex; min-height:260px; flex-direction:column; padding:20px }} .meta {{ display:flex; justify-content:space-between; gap:12px; color:var(--blue); font:720 10px/1.2 ui-monospace,monospace; letter-spacing:.07em; text-transform:uppercase }} .meta code {{ color:#8994a8; letter-spacing:0; text-transform:none }} h3 {{ margin:12px 0 9px; font-size:22px; line-height:1.12; letter-spacing:-.032em }} .copy p {{ margin:0; color:var(--muted); line-height:1.58 }} .actions {{ display:flex; gap:9px; margin-top:auto; padding-top:20px }} .actions a {{ flex:1 1 0; padding:10px 12px; border:1px solid var(--line); border-radius:9px; text-align:center; text-decoration:none; font-weight:700; font-size:13px }} .actions a:hover {{ border-color:#9fc6f8; background:#f6faff }} .actions .primary {{ border-color:var(--blue); color:#fff; background:var(--blue) }}
  .legend {{ margin-top:48px; padding:25px; border:1px solid var(--line); border-radius:17px; background:#fff }} .legend h2 {{ margin:0 0 10px; font-size:25px }} .legend p {{ margin:0; max-width:940px; color:var(--muted); line-height:1.65 }} footer {{ margin-top:45px; color:var(--muted); font-size:13px; line-height:1.65 }}
  @media(max-width:1020px) {{ .grid{{grid-template-columns:repeat(2,minmax(0,1fr))}} }} @media(max-width:700px) {{ .grid{{grid-template-columns:1fr}} .boundary{{grid-template-columns:1fr}} h1{{font-size:46px}} }}
</style></head><body><main>
<p class="eyebrow">SystemSketch · candidate review index · 2026-09-04</p>
<h1>The generic Block work, in one place.</h1>
<p class="lede">Nine focused increments from this design thread: a reusable Port, reliable movement and membership, optional container/chrome behavior, composable text menus, stock range formatting in matching chrome, and one fast Left / Center header choice. Each card opens the exact commit-pinned board and its detailed evidence.</p>
<div class="status"><span class="pill live">9/9 review runtimes live</span><span class="pill">commit-pinned</span><span class="pill">self-contained index</span><span class="pill">not integrated into main</span></div>
<aside class="boundary"><strong>Review boundary</strong><p>These candidates intentionally remain on their own unmerged branches or sequential text-menu branch. The links below do not pretend there is one combined build: each board is served by the commit that implements it. Integration remains a separate decision after review.</p></aside>
<nav class="controls" aria-label="Filter feature reviews"><button type="button" data-filter="all" aria-pressed="true">All 9</button><button type="button" data-filter="Primitive & interaction" aria-pressed="false">Primitive & interaction</button><button type="button" data-filter="Container behavior" aria-pressed="false">Container behavior</button><button type="button" data-filter="Block chrome" aria-pressed="false">Block chrome</button><button type="button" data-filter="Text surfaces" aria-pressed="false">Text surfaces</button></nav>
<section class="grid" aria-label="Feature review cards">{cards}</section>
<section class="legend"><h2>How to review</h2><p><b>Open board</b> launches a prepared canvas with numbered gestures and a visible pass condition. <b>Detailed gallery</b> explains the implementation boundary and automated evidence. The Port and auto-fit repair cards deliberately point at their repair-specific boards even when they share the original feature’s longer-form gallery.</p></section>
<footer>Generated from durable Git objects: every thumbnail is read from the exact commit named on its card and embedded into this HTML. Runtime names begin with <code>merge-review-</code> and remain live until explicitly retired with <code>scripts/review_runtime.py down</code>.</footer>
</main><script>
  const buttons=[...document.querySelectorAll('[data-filter]')]; const cards=[...document.querySelectorAll('.feature')];
  for(const button of buttons) button.addEventListener('click',()=>{{ const value=button.dataset.filter; for(const other of buttons) other.setAttribute('aria-pressed',String(other===button)); for(const card of cards) card.hidden=value!=='all'&&card.dataset.group!==value; }});
</script></body></html>"""


if __name__ == "__main__":
    OUTPUT.write_text(build(), encoding="utf-8")
    print(OUTPUT)
