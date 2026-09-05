#!/usr/bin/env python3
"""Build the self-contained Async region implementation gallery."""

from __future__ import annotations

import base64
import html
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs" / "assets" / "async-region"
FIXTURE_IMAGE = ROOT / "sketches" / "review" / "async-region.png"
OUTPUT = ROOT / "docs" / "async-region-2026-09-05.html"


def data_uri(path: Path) -> str:
    payload = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:image/png;base64,{payload}"


def main() -> None:
    acceptance = json.loads((ASSETS / "acceptance.json").read_text(encoding="utf-8"))
    checks = "".join(f"<li>{html.escape(check)}</li>" for check in acceptance["checks"])
    views = [
        (
            "default",
            "Async default",
            ASSETS / "01-contextual-region-and-async-wire.png",
            "A real port drag inside the selected Frame produced the moving packet treatment; the outside component remains out of scope.",
        ),
        (
            "tagged",
            "Scoped semantic lens",
            ASSETS / "02-selected-region-tagged-view.png",
            "Selecting the Frame reopens its controls. Tag edges interprets only the relationship inside this region.",
        ),
        (
            "fixture",
            "Review board",
            FIXTURE_IMAGE,
            "The durable fixture starts with one Async cable and leaves metrics unwired so the default can be tested by hand.",
        ),
    ]
    buttons = "".join(
        f'<button type="button" data-view="{key}" class="{"active" if index == 0 else ""}">{html.escape(label)}</button>'
        for index, (key, label, _image, _caption) in enumerate(views)
    )
    figures = "".join(
        f'<figure data-figure="{key}" class="{"active" if index == 0 else ""}">'
        f'<img src="{data_uri(image)}" alt="{html.escape(label)} in the real SystemSketch app">'
        f'<figcaption><b>{html.escape(label)}</b><span>{html.escape(caption)}</span></figcaption></figure>'
        for index, (key, label, image, caption) in enumerate(views)
    )
    document = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Async regions · SystemSketch</title>
<style>
:root {{ color-scheme:light; --ink:#171c26; --muted:#657084; --line:#d9dee7; --paper:#fff; --wash:#f5f6f8; --violet:#7558d7; --green:#118b6d; }}
* {{ box-sizing:border-box; }} body {{ margin:0; background:#e9edf1; color:var(--ink); font-family:Inter,ui-sans-serif,system-ui,sans-serif; }}
main {{ width:min(1480px,calc(100% - 32px)); margin:16px auto 64px; overflow:hidden; border:1px solid #ccd3dd; border-radius:20px; background:var(--paper); box-shadow:0 24px 70px rgba(20,28,42,.13); }}
header {{ display:grid; grid-template-columns:1.5fr .8fr; gap:36px; padding:56px 60px 48px; background:linear-gradient(135deg,#11141d,#282242); color:white; }}
.kicker,.eyebrow {{ margin:0 0 13px; color:#b9a9ff; font:800 11px/1.2 ui-monospace,monospace; letter-spacing:.14em; text-transform:uppercase; }}
h1 {{ margin:0; font:760 clamp(38px,5vw,70px)/1.02 ui-monospace,monospace; letter-spacing:-.055em; }} .lede {{ max-width:820px; margin:24px 0 0; color:#d0cbe2; font-size:18px; line-height:1.55; }}
.score {{ align-self:end; display:grid; grid-template-columns:repeat(2,1fr); gap:10px; }} .score div {{ min-height:100px; padding:18px; border:1px solid rgba(255,255,255,.15); border-radius:14px; background:rgba(255,255,255,.055); }} .score b {{ display:block; font:760 29px/1 ui-monospace,monospace; }} .score span {{ display:block; margin-top:8px; color:#bbb4cf; font-size:12px; line-height:1.35; }}
section {{ padding:42px 60px; border-bottom:1px solid var(--line); }} h2 {{ margin:0 0 10px; font:760 29px/1.15 ui-monospace,monospace; letter-spacing:-.035em; }} .intro {{ max-width:900px; margin:0 0 24px; color:var(--muted); line-height:1.6; }}
.tabs {{ display:flex; gap:7px; margin-bottom:12px; }} .tabs button {{ padding:9px 13px; border:1px solid var(--line); border-radius:9px; background:white; color:var(--muted); cursor:pointer; font:750 11px/1 ui-monospace,monospace; }} .tabs button.active {{ border-color:#a99ae9; background:#f0ecff; color:#5d43c0; }}
.viewer {{ overflow:hidden; border:1px solid var(--line); border-radius:16px; background:var(--wash); }} figure {{ display:none; margin:0; }} figure.active {{ display:block; }} figure img {{ display:block; width:100%; aspect-ratio:19/10.5; object-fit:cover; object-position:center top; background:white; }} figcaption {{ display:flex; justify-content:space-between; gap:28px; padding:15px 18px; border-top:1px solid var(--line); color:var(--muted); font-size:12px; }} figcaption b {{ color:var(--ink); font-family:ui-monospace,monospace; }}
.flow {{ display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-top:24px; }} .step {{ position:relative; min-height:135px; padding:18px; border:1px solid var(--line); border-radius:13px; background:var(--wash); }} .step:not(:last-child)::after {{ content:'→'; position:absolute; right:-17px; top:50px; z-index:2; width:24px; text-align:center; background:white; color:#8d819f; font-size:19px; }} .step b {{ display:block; margin-bottom:9px; font:760 12px/1.3 ui-monospace,monospace; }} .step span {{ color:var(--muted); font-size:12px; line-height:1.5; }}
.why {{ margin-top:18px; padding:16px 18px; border-left:4px solid var(--violet); background:#f2efff; color:#443a67; font:650 12px/1.55 ui-monospace,monospace; }}
table {{ width:100%; border-collapse:separate; border-spacing:0; overflow:hidden; border:1px solid var(--line); border-radius:13px; font-size:13px; }} th,td {{ padding:12px 14px; border-bottom:1px solid var(--line); text-align:left; }} th {{ background:var(--wash); color:#4c5769; font:750 10px/1 ui-monospace,monospace; letter-spacing:.08em; text-transform:uppercase; }} tr:last-child td {{ border-bottom:0; }}
.checks {{ columns:2; column-gap:28px; margin:20px 0 0; padding:0; list-style:none; }} .checks li {{ break-inside:avoid; margin:0 0 9px; padding:11px 13px 11px 34px; border:1px solid #cce7dc; border-radius:9px; background:#f0faf6; color:#315c4f; font-size:12px; line-height:1.35; }} .checks li::before {{ content:'✓'; float:left; margin-left:-21px; color:var(--green); font-weight:900; }} footer {{ padding:23px 60px; color:var(--muted); font-size:11px; }} code {{ font-family:ui-monospace,monospace; }}
@media(max-width:900px) {{ header {{ grid-template-columns:1fr; }} section,header {{ padding:32px 24px; }} .flow {{ grid-template-columns:1fr 1fr; }} .step::after {{ display:none!important; }} .checks {{ columns:1; }} figcaption {{ flex-direction:column; gap:5px; }} }}
</style>
</head>
<body><main>
<header><div><p class="kicker">SystemSketch · implementation proof</p><h1>Async is a place—and a default.</h1><p class="lede">A stock Frame can now carry Async-region meaning. Selecting it opens the communication lens for that region; completing a new wire between two components inside it defaults that wire to Async without making the region an enforcement engine.</p></div><div class="score"><div><b>1</b><span>durable semantic tag on a stock Frame</span></div><div><b>0</b><span>new container or resize primitives</span></div><div><b>3</b><span>scoped communication projections</span></div><div><b>1×</b><span>creation-time default, never continuous rewriting</span></div></div></header>
<section><p class="eyebrow">Real browser evidence</p><h2>The controls arrive with their context.</h2><p class="intro">No query flag is needed. An ordinary board has no communication bar; selecting an Async region supplies both the transient UI scope and the durable place in which new wires default to asynchronous delivery.</p><div class="tabs">{buttons}</div><div class="viewer">{figures}</div></section>
<section><p class="eyebrow">Algorithm</p><h2>One authored fact, one transient lens, one completion hook.</h2><div class="flow"><div class="step"><b>1 · Draw stock Frame</b><span>The Async-region tool delegates gesture and enclosure to tldraw, then stamps the Frame metadata and name.</span></div><div class="step"><b>2 · Select region</b><span>The selected Frame ID becomes transient projection scope. Its components and relationships are the only ones interpreted.</span></div><div class="step"><b>3 · Complete wire</b><span>After both semantic bindings exist, resolve the nearest Async region shared by both endpoint components.</span></div><div class="step"><b>4 · Apply once</b><span>If the new wire still says Data, write Async plus provenance. Later edits, moves, loads, and imports do nothing.</span></div></div><div class="why">WHY: “inside this region, start asynchronous” is helpful authoring intent. “Anything inside must forever be asynchronous” is a hidden constraint that would undo explicit work. The implementation deliberately chooses the former.</div></section>
<section><p class="eyebrow">Behavior boundary</p><h2>Default, not inference and not enforcement.</h2><table><thead><tr><th>Event</th><th>Result</th><th>Reason</th></tr></thead><tbody><tr><td>New Data wire; both endpoints share one Async region</td><td>Becomes Async</td><td>The region supplies its creation default</td></tr><tr><td>New wire crosses the region boundary</td><td>Unchanged</td><td>No shared region owns both components</td></tr><tr><td>New wire already Delayed or Async</td><td>Unchanged</td><td>An explicit temporal choice wins</td></tr><tr><td>User changes an Async-defaulted wire to Data</td><td>Remains Data</td><td>No background reconciler re-applies the default</td></tr><tr><td>Existing/imported wire or component move</td><td>Unchanged</td><td>Membership is not silently reinterpreted</td></tr></tbody></table></section>
<section><p class="eyebrow">Acceptance</p><h2>{len(acceptance['checks'])} browser checks passed.</h2><ul class="checks">{checks}</ul></section>
<footer>Built from <code>tests/async_region_smoke.mjs</code> and the driven <code>sketches/review/async-region.systemsketch</code> fixture · generated {html.escape(acceptance['generatedAt'])} · all screenshots embedded.</footer>
</main><script>document.querySelectorAll('[data-view]').forEach((button)=>button.addEventListener('click',()=>{{document.querySelectorAll('[data-view],[data-figure]').forEach((node)=>node.classList.remove('active'));button.classList.add('active');document.querySelector(`[data-figure="${{button.dataset.view}}"]`)?.classList.add('active')}}));</script></body></html>"""
    OUTPUT.write_text(document, encoding="utf-8")
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
