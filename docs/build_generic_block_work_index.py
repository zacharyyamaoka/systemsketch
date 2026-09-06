#!/usr/bin/env python3
"""Build the self-contained index for every generic-Block review track."""

from __future__ import annotations

import base64
import html
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "generic-block-work-index-2026-09-05.html"


FEATURES = [
    {
        "group": "Ports",
        "title": "Floating Port primitive",
        "summary": "Place a Port anywhere, edit name/type/value/orientation/offset, override filled state, and wire it like a normal endpoint.",
        "commit": "f46676e8a55c6cbbad16096511702a7e526be184",
        "image": "sketches/review/floating-port.png",
        "board": "http://127.0.0.1:4616/?board=%2Fhome%2Fbam%2F.systemsketch-reviews%2Fmerge-review-floating-port-20260904-f46676e8a55c%2Fsketches%2Freview%2Ffloating-port.systemsketch",
        "report": "http://127.0.0.1:4616/docs/floating-port-primitive-2026-09-04.html",
    },
    {
        "group": "Ports",
        "title": "First-press Port dragging",
        "summary": "An unselected Port enters stock tldraw translation on the first press-and-drag; no activation click is required.",
        "commit": "2a7f365e8873f14bc854721493e832f3dde5d295",
        "image": "sketches/review/floating-port-direct-drag.png",
        "board": "http://127.0.0.1:4622/?board=%2Fhome%2Fbam%2F.systemsketch-reviews%2Fmerge-review-port-direct-drag-20260904-2a7f365e8873%2Fsketches%2Freview%2Ffloating-port-direct-drag.systemsketch",
        "report": "http://127.0.0.1:4622/docs/floating-port-primitive-2026-09-04.html",
    },
    {
        "group": "Container",
        "title": "Folding, fold side, and fit",
        "summary": "Optional disclosure, left/right chevrons, stable title/type composition, auto-fit, and an explicit Remove from container escape hatch.",
        "commit": "bf3df4ff75f4d63cb65f034fe98508d2bb34ffea",
        "image": "sketches/review/block-fold-autosize.png",
        "board": "http://127.0.0.1:4804/?board=%2Fhome%2Fbam%2F.systemsketch-reviews%2Fblock-autofit-reactive-cycle-fix-20260905-bf3df4ff75f4%2Fsketches%2Freview%2Fblock-fold-autosize.systemsketch",
        "report": "http://127.0.0.1:4804/docs/block-fold-autosize-2026-09-04.html",
    },
    {
        "group": "Container",
        "title": "Continuous auto-fit, repaired",
        "summary": "Paint-only held feedback plus one stock release fit; child-first dragging, membership, page pose, and tldraw's reactive cache all stay stable.",
        "commit": "bf3df4ff75f4d63cb65f034fe98508d2bb34ffea",
        "image": "docs/assets/block-autofit-child-first-drag-2026-09-05.png",
        "board": "http://127.0.0.1:4804/?board=%2Fhome%2Fbam%2F.systemsketch-reviews%2Fblock-autofit-reactive-cycle-fix-20260905-bf3df4ff75f4%2Fsketches%2Freview%2Fblock-autofit-continuous.systemsketch",
        "report": "http://127.0.0.1:4804/docs/block-autofit-continuous-2026-09-05.html",
    },
    {
        "group": "Chrome",
        "title": "Footer and divider toggles",
        "summary": "Independent inspector switches hide or show the footer and the rule between the header and body.",
        "commit": "cc82b900877ae3b6c16e536f74bb0584b1e4a56b",
        "image": "docs/assets/block-chrome-toggles-fixture-driven-2026-09-04.png",
        "board": "http://127.0.0.1:4630/?board=%2Fhome%2Fbam%2F.systemsketch-reviews%2Fmerge-review-block-chrome-toggles-20260904-cc82b900877a%2Fsketches%2Freview%2Fblock-chrome-toggles.systemsketch",
        "report": "http://127.0.0.1:4630/docs/block-chrome-toggles-2026-09-04.html",
    },
    {
        "group": "Text",
        "title": "Live title formatting",
        "summary": "The title's contextual controls remain available during on-canvas editing, while the focused Left/Center header control supplies the fast default.",
        "commit": "e5b654adeefc6c27d69148a29b7229b8d0775739",
        "image": "docs/assets/block-title-formatting-live-2026-09-04.png",
        "board": "http://127.0.0.1:4632/?board=%2Fhome%2Fbam%2F.systemsketch-reviews%2Fmerge-review-title-formatting-20260904-e5b654adeefc%2Fsketches%2Freview%2Fblock-title-formatting.systemsketch",
        "report": "http://127.0.0.1:4632/docs/block-title-formatting-2026-09-04.html",
    },
    {
        "group": "Text",
        "title": "Composable contextual menus",
        "summary": "One registry owns the menu controls; small ordered recipes compose the right subset for Text, Geo, connectors, and Block titles.",
        "commit": "cc7a364f4d3830da51b3cea712fc8bf32143bbba",
        "image": "sketches/review/contextual-menu-composition.png",
        "board": "http://127.0.0.1:4634/?board=%2Fhome%2Fbam%2F.systemsketch-reviews%2Fmerge-review-contextual-menu-20260904-cc7a364f4d38%2Fsketches%2Freview%2Fcontextual-menu-composition.systemsketch",
        "report": "http://127.0.0.1:4634/docs/contextual-menu-composition-2026-09-04.html",
    },
    {
        "group": "Text",
        "title": "Stock rich-text toolbar, dark chrome",
        "summary": "tldraw's reliable selected-range editing stays intact; a narrow CSS adapter matches SystemSketch's black contextual surface.",
        "commit": "b41c02db3729b60307f28bea3d9d225663289549",
        "image": "docs/assets/rich-text-toolbar-chrome-live-2026-09-04.png",
        "board": "http://127.0.0.1:4636/?board=%2Fhome%2Fbam%2F.systemsketch-reviews%2Fmerge-review-rich-text-toolbar-20260904-b41c02db3729%2Fsketches%2Freview%2Frich-text-toolbar-chrome.systemsketch",
        "report": "http://127.0.0.1:4636/docs/rich-text-toolbar-chrome-2026-09-04.html",
    },
    {
        "group": "Chrome",
        "title": "Header Left / Center identity",
        "summary": "Centering moves only the icon, title, and optional draft-link identity; folding remains independently pinned to its chosen corner.",
        "commit": "5d334a1942cf95d44cd83398151988d204928be4",
        "image": "docs/assets/block-header-alignment-live-2026-09-04.png",
        "board": "http://127.0.0.1:4606/?board=%2Fhome%2Fbam%2F.systemsketch-reviews%2Fblock-header-identity-draft-20260905-5d334a1942cf%2Fsketches%2Freview%2Fblock-header-alignment.systemsketch",
        "report": "http://127.0.0.1:4606/docs/block-header-alignment-2026-09-04.html",
    },
    {
        "group": "Members",
        "title": "Inset / edge-to-edge members",
        "summary": "Choose individually separated member cards or a continuous edge-to-edge stack for class and branching presentations.",
        "commit": "8fd1afbb93add9ec37c1ae06f2121bf45cb8e723",
        "image": "sketches/review/block-member-layout.png",
        "board": "http://127.0.0.1:4708/?board=%2Fhome%2Fbam%2F.systemsketch-reviews%2Fblock-member-layout-20260905-8fd1afb-8fd1afbb93ad%2Fsketches%2Freview%2Fblock-member-layout.systemsketch",
        "report": "http://127.0.0.1:4708/docs/block-member-background-babble-2026-09-05.html",
    },
    {
        "group": "Members",
        "title": "Optional gray inset background",
        "summary": "Inset members default to white and gain one deliberate neutral-gray option for stronger grouping without adding a full styling system.",
        "commit": "7a4d132ddf0f7488d5924e577a85002ee2003cb4",
        "image": "sketches/review/block-inset-background.png",
        "board": "http://127.0.0.1:4802/?board=%2Fhome%2Fbam%2F.systemsketch-reviews%2Fblock-inset-background-20260905-7a4d132ddf0f%2Fsketches%2Freview%2Fblock-inset-background.systemsketch",
        "report": "http://127.0.0.1:4802/docs/block-inset-background-2026-09-05.html",
    },
]


def git_image(commit: str, path: str) -> str:
    raw = subprocess.check_output(["git", "show", f"{commit}:{path}"], cwd=ROOT)
    return "data:image/png;base64," + base64.b64encode(raw).decode("ascii")


def card(index: int, feature: dict[str, str]) -> str:
    group = html.escape(feature["group"])
    title = html.escape(feature["title"])
    summary = html.escape(feature["summary"])
    image = git_image(feature["commit"], feature["image"])
    return f"""<article class="feature" data-group="{group}"><div class="shot"><img loading="lazy" src="{image}" alt="{title} review capture"><span>{index:02d}</span></div><div class="copy"><div class="meta"><b>{group}</b><code>{feature['commit'][:7]}</code></div><h3>{title}</h3><p>{summary}</p><div class="actions"><a class="primary" href="{feature['board']}">Open board</a><a href="{feature['report']}">View gallery</a></div></div></article>"""


def build() -> str:
    cards = "".join(card(index, feature) for index, feature in enumerate(FEATURES, 1))
    groups = ["All", "Ports", "Container", "Chrome", "Text", "Members"]
    filters = "".join(
        f'<button type="button" data-filter="{group}" aria-pressed="{str(group == "All").lower()}">{group}</button>'
        for group in groups
    )
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SystemSketch · Generic Block work index</title><style>
:root{{--paper:#f3f5f9;--ink:#172033;--muted:#667187;--line:#dce2ec;--card:#fff;--blue:#247de4;--green:#167447;font-family:Inter,ui-sans-serif,system-ui,sans-serif}}*{{box-sizing:border-box}}body{{margin:0;background:var(--paper);color:var(--ink)}}main{{width:min(1320px,calc(100% - 32px));margin:auto;padding:54px 0 82px}}.eyebrow{{color:var(--blue);font:760 12px ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase}}h1{{max-width:1050px;margin:12px 0 18px;font-size:clamp(46px,6.4vw,82px);line-height:.94;letter-spacing:-.06em}}.lede{{max-width:980px;margin:0;color:var(--muted);font-size:19px;line-height:1.65}}.principle{{display:grid;grid-template-columns:auto 1fr;gap:18px;margin:32px 0;padding:20px 22px;border:1px solid #c9dcf8;border-radius:16px;background:#f0f6ff}}.principle b{{color:var(--blue);font:800 12px ui-monospace,monospace;text-transform:uppercase;letter-spacing:.07em}}.principle p{{margin:0;color:#40506a}}nav{{display:flex;flex-wrap:wrap;gap:8px;margin:34px 0 20px}}button{{padding:9px 13px;border:1px solid var(--line);border-radius:999px;background:#fff;color:var(--muted);font-weight:700;cursor:pointer}}button[aria-pressed=true]{{border-color:var(--blue);background:var(--blue);color:#fff}}.grid{{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}}.feature{{overflow:hidden;border:1px solid var(--line);border-radius:18px;background:var(--card);box-shadow:0 12px 30px #26334c12}}.feature[hidden]{{display:none}}.shot{{position:relative;overflow:hidden;aspect-ratio:16/10;border-bottom:1px solid var(--line);background:#e9edf3}}.shot img{{display:block;width:100%;height:100%;object-fit:cover}}.shot span{{position:absolute;top:12px;left:12px;display:grid;width:35px;height:35px;place-items:center;border-radius:50%;background:#172033dc;color:#fff;font:750 12px ui-monospace,monospace}}.copy{{display:flex;min-height:270px;flex-direction:column;padding:20px}}.meta{{display:flex;justify-content:space-between;color:var(--blue);font:720 10px ui-monospace,monospace;letter-spacing:.07em;text-transform:uppercase}}.meta code{{color:#8a95a8;letter-spacing:0;text-transform:none}}h3{{margin:12px 0 9px;font-size:23px;line-height:1.12;letter-spacing:-.035em}}.copy p{{margin:0;color:var(--muted);line-height:1.58}}.actions{{display:flex;gap:9px;margin-top:auto;padding-top:20px}}.actions a{{flex:1;padding:10px;border:1px solid var(--line);border-radius:9px;text-align:center;text-decoration:none;color:inherit;font-weight:750;font-size:13px}}.actions .primary{{border-color:var(--blue);background:var(--blue);color:#fff}}footer{{margin-top:44px;padding:22px;border:1px solid #b9dfc8;border-radius:16px;background:#effaf3;color:#38624d;line-height:1.6}}@media(max-width:1020px){{.grid{{grid-template-columns:repeat(2,minmax(0,1fr))}}}}@media(max-width:700px){{.grid{{grid-template-columns:1fr}}.principle{{grid-template-columns:1fr}}}}
</style></head><body><main><div class="eyebrow">SystemSketch · complete generic-Block review · 05 September 2026</div><h1>Good defaults. Enough hackability.</h1><p class="lede">Eleven completed increments from this design thread, each on its exact commit-pinned review surface. The work deliberately keeps one general-purpose Block underneath presets without turning every fast choice into a Figma-sized styling system.</p><aside class="principle"><b>Design rule</b><p><strong>Freedom of control, freedom from control.</strong> Prefer fast, coherent defaults; expose the few choices that materially change meaning or composition; retain deeper text editing where stock tldraw already provides it reliably.</p></aside><nav aria-label="Filter reviews">{filters}</nav><section class="grid">{cards}</section><footer><strong>Integration boundary.</strong> These features are implemented and reviewable, but their code still lives on separate candidate branches. This index does not imply they have been merged into <code>main</code>; landing remains a separate explicit decision.</footer></main><script>const buttons=[...document.querySelectorAll('[data-filter]')],cards=[...document.querySelectorAll('.feature')];for(const b of buttons)b.addEventListener('click',()=>{{for(const x of buttons)x.setAttribute('aria-pressed',String(x===b));for(const c of cards)c.hidden=b.dataset.filter!=='All'&&c.dataset.group!==b.dataset.filter}})</script></body></html>"""


if __name__ == "__main__":
    OUTPUT.write_text(build(), encoding="utf-8")
    print(OUTPUT)
