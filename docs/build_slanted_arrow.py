#!/usr/bin/env python3
"""Build the self-contained Slanted-arrow implementation gallery.

The facts in this page are measured from the current source, persisted review
fixture, and browser-journey result rather than copied into a static handoff.
"""

from __future__ import annotations

import base64
import html
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
ASSETS = DOCS / "assets"
SRC = ROOT / "src"
FIXTURE = ROOT / "sketches" / "review" / "slanted-arrow.systemsketch"
RECIPE = ROOT / "sketches" / "review" / "slanted-arrow.recipe.json"
OUTPUT = DOCS / "slanted-arrow-2026-09-04.html"
RESULTS = ASSETS / "slanted-arrow-results-2026-09-04.json"
INSPECTOR_SHOT = ASSETS / "slanted-arrow-inspector-live-2026-09-04.png"
CANVAS_SHOT = ASSETS / "slanted-arrow-canvas-live-2026-09-04.png"
FIXTURE_SHOT = ROOT / "sketches" / "review" / "slanted-arrow.png"


def data_uri(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def measured() -> dict[str, object]:
    source = (SRC / "systemSketchArrow.tsx").read_text(encoding="utf-8")
    panel = (SRC / "chrome" / "ShapeFactsPanel.tsx").read_text(encoding="utf-8")
    board = json.loads(FIXTURE.read_text(encoding="utf-8"))
    recipe = json.loads(RECIPE.read_text(encoding="utf-8"))
    checks = json.loads(RESULTS.read_text(encoding="utf-8"))
    records = board["records"]
    branch = next(record for record in records if record.get("id") == "shape:branch")
    return {
        "checks": checks,
        "passed": sum(1 for check in checks if check["ok"]),
        "fixture_shapes": sum(1 for record in records if record.get("typeName") == "shape"),
        "fixture_bindings": sum(1 for record in records if record.get("typeName") == "binding"),
        "fixture_bytes": FIXTURE.stat().st_size,
        "meta_version": branch["meta"]["systemSketchSlantedArrow"]["version"],
        "lead_reuses": "getConnectionControlPoints(start, end)" in source,
        "marker_orient": 'orient="auto"' in source,
        "virtual_elbow": "SLANTED_ARROW_ELBOW_HANDLE_ID" in source and "elbowT?: number" in source,
        "stock_head_replaced": "systemsketch-authored-arrow__stock--replace-head" in source,
        "inspector_only": "data-testid=\"shape-facts-arrow-routing-slanted\"" in panel,
        "quick_preset_mentions": len(re.findall(r"slanted", (SRC / "toolbar" / "toolbarModel.ts").read_text(encoding="utf-8"), re.I)),
        "recipe_shapes": len(recipe["shapes"]),
    }


def result_rows(checks: list[dict[str, object]]) -> str:
    return "\n".join(
        "<tr><td>✓</td><td><code>{}</code></td><td>{}</td></tr>".format(
            html.escape(str(check["id"])), html.escape(str(check["detail"]))
        )
        for check in checks
    )


def main() -> None:
    facts = measured()
    assert facts["lead_reuses"] and facts["marker_orient"] and facts["virtual_elbow"] and facts["stock_head_replaced"] and facts["inspector_only"]
    assert facts["quick_preset_mentions"] == 0
    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Slanted arrows — SystemSketch implementation</title>
<style>
:root {{ --ink:#1e1b2a; --muted:#676177; --paper:#f8f7fc; --card:#fff; --line:#ddd8e9; --violet:#7b55ff; --violet-soft:#eee9ff; --green:#178451; --orange:#db7b1c; }}
* {{ box-sizing:border-box }} body {{ margin:0; background:radial-gradient(circle at 80% 0,#ece7ff 0,transparent 30rem),var(--paper); color:var(--ink); font:16px/1.5 Inter,ui-sans-serif,system-ui,sans-serif }}
main {{ width:min(1180px,calc(100% - 36px)); margin:auto; padding:54px 0 90px }} h1 {{ max-width:13ch; margin:8px 0 16px; font-size:clamp(3rem,7vw,5.8rem); line-height:.93; letter-spacing:-.07em }} h2 {{ margin:0 0 10px; font-size:1.45rem; letter-spacing:-.025em }} p {{ color:var(--muted) }} a {{ color:#5638c8; font-weight:750 }} code {{ padding:2px 5px; border-radius:5px; background:#f0eef7; font: .9em ui-monospace,SFMono-Regular,monospace }}
.eyebrow {{ color:#6040d9; font-size:.76rem; font-weight:850; letter-spacing:.13em; text-transform:uppercase }} .lead {{ max-width:70ch; font-size:1.16rem }} .decision {{ margin:32px 0; padding:22px 25px; border:1px solid #cfc4ff; border-left:5px solid var(--violet); border-radius:16px; background:linear-gradient(105deg,#f1edff,#fff) }} .decision p {{ max-width:75ch; margin:5px 0 0; color:#39314e }}
.facts {{ display:flex; flex-wrap:wrap; gap:10px; margin:25px 0 42px }} .fact {{ padding:9px 13px; border:1px solid var(--line); border-radius:999px; background:#fff; font-weight:750; font-size:.9rem }} .fact b {{ color:var(--violet) }} .grid {{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:18px }} .card {{ padding:23px; border:1px solid var(--line); border-radius:18px; background:var(--card); box-shadow:0 14px 34px #34285e0b }} .card p:last-child {{ margin-bottom:0 }} .prior {{ border-top:4px solid var(--violet) }} .boundary {{ border-top:4px solid var(--orange) }} .proof {{ border-top:4px solid var(--green) }}
.hero {{ overflow:hidden; margin:30px 0 18px; border:1px solid var(--line); border-radius:20px; background:#fff; box-shadow:0 16px 42px #30235d12 }} .hero img {{ display:block; width:100%; height:auto }} .caption {{ padding:16px 20px; color:var(--muted); border-top:1px solid var(--line) }} .split {{ display:grid; grid-template-columns:1fr 1fr; gap:18px; margin-top:18px }} .shot {{ overflow:hidden; border:1px solid var(--line); border-radius:16px; background:#fff }} .shot img {{ display:block; width:100%; height:auto }} .shot p {{ margin:0; padding:12px 15px; font-size:.9rem }}
.flow {{ display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:11px; margin-top:18px }} .step {{ min-height:150px; padding:17px; border:1px solid var(--line); border-radius:14px; background:#fff }} .step b {{ display:block; color:#4f36ba; margin-bottom:8px }} .step span {{ color:var(--muted); font-size:.9rem }} table {{ width:100%; margin-top:18px; border-collapse:separate; border-spacing:0; overflow:hidden; border:1px solid var(--line); border-radius:15px; background:#fff }} th,td {{ padding:13px 15px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top }} th {{ background:#f1eef9; font-size:.78rem; letter-spacing:.08em; text-transform:uppercase }} tr:last-child td {{ border-bottom:0 }} td:first-child {{ color:var(--green); font-weight:900; width:48px }} footer {{ margin-top:42px; color:var(--muted); font-size:.9rem }}
@media(max-width:760px) {{ main {{ width:min(100% - 24px,1180px); padding-top:34px }} .grid,.split,.flow {{ grid-template-columns:1fr }} h1 {{ font-size:3.25rem }} }}
</style></head><body><main>
<div class="eyebrow">Implemented · 04 September 2026</div>
<h1>A behavior-tree arrow that knows where to bend.</h1>
<p class="lead">Slanted is an uncommon ordinary-arrow route: it leaves the source horizontally, then reaches its destination in one diagonal. It lives only in the Inspector, keeps the everyday arrow menu small, and stays a valid stock tldraw arrow when opened elsewhere. Its elbow begins at the established automatic lead and becomes an authored control only when dragged.</p>
<section class="decision"><div class="eyebrow">Decision from prior art</div><p><strong>Use ELK’s polyline reading, not ELK’s full layout engine.</strong> ELK’s layered polyline documentation explicitly describes keeping horizontal segments in a layer and reserving a sloped edge zone. That is the visual grammar here. A freeform SystemSketch arrow must not let a layout pass move its endpoints, so its lead comes from the existing connection lead helper; SVG’s native <code>orient=&quot;auto&quot;</code> supplies the diagonal arrowhead orientation.</p></section>
<div class="facts"><span class="fact"><b>{facts['passed']}/{len(facts['checks'])}</b> browser checks</span><span class="fact"><b>{facts['fixture_shapes']}</b> fixture shapes</span><span class="fact"><b>{facts['fixture_bindings']}</b> real bindings</span><span class="fact"><b>{facts['fixture_bytes']:,}</b>-byte review board</span><span class="fact">metadata v<b>{facts['meta_version']}</b></span><span class="fact">default elbow <b>virtual</b></span><span class="fact"><b>{facts['quick_preset_mentions']}</b> quick-menu mentions</span></div>
<section class="hero"><img src="{data_uri(CANVAS_SHOT)}" alt="SystemSketch with a selected heavy-stroke Slanted arrow that first goes horizontally and then diagonally upward"><div class="caption"><strong>Actual XL browser render.</strong> The final segment is diagonal and one native marker follows it. The stock fallback head is suppressed only for Slanted, preventing two mismatched tangents from painting as a malformed heavy-stroke head.</div></section>
<div class="split"><article class="shot"><img src="{data_uri(INSPECTOR_SHOT)}" alt="Arrow routing controls in the SystemSketch Inspector showing the slanted arrow icon"><p><strong>Quiet control surface.</strong> The reference icon is rendered as one horizontal leg plus one rising diagonal; activation uses the current theme’s accent rather than a hard-coded purple.</p></article><article class="shot"><img src="{data_uri(FIXTURE_SHOT)}" alt="Saved review board with a violet Slanted behavior branch, orange steps, and a green pass card"><p><strong>Saved human-review board.</strong> Select the real bound arrow, drag its round elbow dot left or right, then switch away and back to Slanted to restore the untouched automatic lead.</p></article></div>
<section style="margin-top:42px"><div class="eyebrow">What was borrowed, what was not</div><div class="grid"><article class="card prior"><h2>ELK polyline routing</h2><p><a href="https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-edgeRouting-polyline-slopedEdgeZoneWidth.html">ELK’s sloped-edge-zone option</a> describes the exact readable shape: horizontal layer runs with sloped departures. <a href="https://eclipse.dev/elk/reference/options/org-eclipse-elk-edgeRouting.html">POLYLINE</a> is an official routing mode.</p><p><strong>Borrowed:</strong> its visual contract.</p></article><article class="card boundary"><h2>Why no new router</h2><p>ELK’s layout algorithms own node placement; calling them for one manually drawn arrow would change the whiteboard’s contract. libavoid is a separate obstacle-router runtime, not a dependency needed for this two-segment route.</p><p><strong>Kept:</strong> authored endpoints and stock binding behavior.</p></article><article class="card prior"><h2>Endpoint-gapped paths</h2><p><a href="https://reactflow.dev/api-reference/utils/get-smooth-step-path">React Flow’s SmoothStep utility</a> is another mature example of direction-aware endpoint gapping. It reinforces the seam: determine the first readable departure, then draw the rest.</p><p><strong>Reused here:</strong> SystemSketch’s established connection lead distance.</p></article><article class="card proof"><h2>Stock fallback</h2><p>The custom route is a versioned namespaced <code>meta</code> enhancement on an otherwise valid, zero-bend stock arrow. Switching back to Straight writes a JSON tombstone because tldraw merges nested metadata patches.</p><p><strong>Result:</strong> no forked tldraw arrow schema and no stale custom route.</p></article></div></section>
<section style="margin-top:42px"><div class="eyebrow">One narrow dataflow</div><div class="flow"><div class="step"><b>1 · Select</b><span>An ordinary tldraw arrow opens the facts Inspector with no new toolbar preset.</span></div><div class="step"><b>2 · Set Slanted</b><span>A versioned metadata flag is added while the stock fallback becomes a zero-bend arrow.</span></div><div class="step"><b>3 · Default</b><span>The existing lead helper supplies a virtual elbow with no manual scalar stored.</span></div><div class="step"><b>4 · Drag</b><span>The dot promotes to a vertex and stores only its relative x position; y remains at the source.</span></div><div class="step"><b>5 · Revert</b><span>Straight tombstones the metadata and returns the same arrow to the stock renderer.</span></div></div></section>
<section style="margin-top:42px"><div class="eyebrow">Real-browser acceptance</div><h2>The journey checked what the canvas painted.</h2><table><thead><tr><th></th><th>Check</th><th>Observed result</th></tr></thead><tbody>{result_rows(facts['checks'])}</tbody></table></section>
<footer>Artifacts: <a href="../sketches/review/slanted-arrow.systemsketch">review board</a> · <a href="../sketches/review/slanted-arrow.recipe.json">recipe</a> · <a href="../tests/slanted_arrow_smoke.mjs">browser journey</a> · <a href="build_slanted_arrow.py">gallery builder</a></footer>
</main></body></html>"""
    OUTPUT.write_text(page, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
