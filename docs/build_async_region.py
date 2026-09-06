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
STRESS_ASSETS = ROOT / "docs" / "assets" / "async-region-stress"
STRESS_FIXTURE_IMAGE = ROOT / "sketches" / "review" / "async-region-stress.png"
OUTPUT = ROOT / "docs" / "async-region-2026-09-05.html"


def data_uri(path: Path, mime: str = "image/png") -> str:
    payload = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{payload}"


def main() -> None:
    acceptance = json.loads((ASSETS / "acceptance.json").read_text(encoding="utf-8"))
    stress_acceptance = json.loads((STRESS_ASSETS / "acceptance.json").read_text(encoding="utf-8"))
    checks = "".join(f"<li>{html.escape(check)}</li>" for check in acceptance["checks"])
    stress_checks = "".join(f"<li>{html.escape(check)}</li>" for check in stress_acceptance["checks"])
    stress_findings = "".join(
        f"<li>{html.escape(finding)}</li>" for finding in stress_acceptance.get("findings", [])
    )
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
    stress_views = [
        (
            "stress-fixture",
            "Stress board",
            STRESS_FIXTURE_IMAGE,
            "Five contained components and 18 real Async connection records are ready before the first gesture.",
        ),
        (
            "stress-tagged",
            "Nine semantic groups",
            STRESS_ASSETS / "01-nine-groups-across-eighteen-legs.png",
            "Three Actions, three Services, two Topics, and one Stream parse with zero communication-association issues.",
        ),
        (
            "stress-focus",
            "A2 focus",
            STRESS_ASSETS / "02-a2-focus-over-simple-components.png",
            "The component projection collapses 18 legs to nine relationships; focused tags identify the selected carrier phase beside move cancel, feedback, and result.",
        ),
        (
            "stress-exact-phases",
            "S1 exact phases",
            STRESS_ASSETS / "02-service-focus-exact-phases.png",
            "Focus changes the aggregate S1 Service health tag into S1 request, while the expanded return leg says S1 response.",
        ),
        (
            "stress-fixed-carriers",
            "Response + result",
            STRESS_ASSETS / "02a-result-and-response-tracks.png",
            "Service relationships reuse their response legs while Actions reuse result; Topic and Stream stay on their only data carriers.",
        ),
        (
            "stress-shortest-carriers",
            "Shortest per relationship",
            STRESS_ASSETS / "02b-shortest-tracks.png",
            "Every A#/S# independently measures its existing routed legs and paints the shortest eligible carrier without changing a connection record.",
        ),
        (
            "stress-new-wire",
            "Nineteenth Async wire",
            STRESS_ASSETS / "03-new-alerts-wire-defaults-async.png",
            "A real Camera alerts → Telemetry alerts port drag inherits Async while the existing mixed-protocol topology remains intact.",
        ),
    ]
    stress_buttons = "".join(
        f'<button type="button" data-view="{key}" class="{"active" if index == 0 else ""}">{html.escape(label)}</button>'
        for index, (key, label, _image, _caption) in enumerate(stress_views)
    )
    stress_figures = "".join(
        f'<figure data-figure="{key}" class="{"active" if index == 0 else ""}">'
        f'<img src="{data_uri(image)}" alt="{html.escape(label)} in the real SystemSketch app">'
        f'<figcaption><b>{html.escape(label)}</b><span>{html.escape(caption)}</span></figcaption></figure>'
        for index, (key, label, image, caption) in enumerate(stress_views)
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
.viewer {{ overflow:hidden; border:1px solid var(--line); border-radius:16px; background:var(--wash); }} figure {{ display:none; margin:0; }} figure.active {{ display:block; }} figure img {{ display:block; width:100%; height:auto; background:white; }} figcaption {{ display:flex; justify-content:space-between; gap:28px; padding:15px 18px; border-top:1px solid var(--line); color:var(--muted); font-size:12px; }} figcaption b {{ color:var(--ink); font-family:ui-monospace,monospace; }}
.hero-media {{ overflow:hidden; border:1px solid #302952; border-radius:16px; background:#11141d; box-shadow:0 18px 45px rgba(25,20,48,.18); }} .hero-media video {{ display:block; width:100%; height:auto; background:#f7f7f7; }} .hero-note {{ display:flex; justify-content:space-between; gap:24px; padding:14px 17px; color:#cac4dd; background:#171421; font-size:12px; line-height:1.5; }} .hero-note b {{ color:#fff; font-family:ui-monospace,monospace; }}
.flow {{ display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-top:24px; }} .step {{ position:relative; min-height:135px; padding:18px; border:1px solid var(--line); border-radius:13px; background:var(--wash); }} .step:not(:last-child)::after {{ content:'→'; position:absolute; right:-17px; top:50px; z-index:2; width:24px; text-align:center; background:white; color:#8d819f; font-size:19px; }} .step b {{ display:block; margin-bottom:9px; font:760 12px/1.3 ui-monospace,monospace; }} .step span {{ color:var(--muted); font-size:12px; line-height:1.5; }}
.why {{ margin-top:18px; padding:16px 18px; border-left:4px solid var(--violet); background:#f2efff; color:#443a67; font:650 12px/1.55 ui-monospace,monospace; }}
table {{ width:100%; border-collapse:separate; border-spacing:0; overflow:hidden; border:1px solid var(--line); border-radius:13px; font-size:13px; }} th,td {{ padding:12px 14px; border-bottom:1px solid var(--line); text-align:left; }} th {{ background:var(--wash); color:#4c5769; font:750 10px/1 ui-monospace,monospace; letter-spacing:.08em; text-transform:uppercase; }} tr:last-child td {{ border-bottom:0; }}
.checks {{ columns:2; column-gap:28px; margin:20px 0 0; padding:0; list-style:none; }} .checks li {{ break-inside:avoid; margin:0 0 9px; padding:11px 13px 11px 34px; border:1px solid #cce7dc; border-radius:9px; background:#f0faf6; color:#315c4f; font-size:12px; line-height:1.35; }} .checks li::before {{ content:'✓'; float:left; margin-left:-21px; color:var(--green); font-weight:900; }} footer {{ padding:23px 60px; color:var(--muted); font-size:11px; }} code {{ font-family:ui-monospace,monospace; }}
.finding {{ margin-top:20px; padding:17px 19px; border:1px solid #efcf9b; border-radius:12px; background:#fff8e9; color:#6c4a17; }} .finding strong {{ display:block; margin-bottom:7px; font:760 12px/1.3 ui-monospace,monospace; }} .finding ul {{ margin:0; padding-left:20px; font-size:12px; line-height:1.5; }}
@media(max-width:900px) {{ header {{ grid-template-columns:1fr; }} section,header {{ padding:32px 24px; }} .flow {{ grid-template-columns:1fr 1fr; }} .step::after {{ display:none!important; }} .checks {{ columns:1; }} figcaption {{ flex-direction:column; gap:5px; }} }}
</style>
</head>
<body><main>
<header><div><p class="kicker">SystemSketch · implementation proof</p><h1>Async is a place—and a default.</h1><p class="lede">A stock Frame can now carry Async-region meaning. Selecting it opens the communication lens for that region; completing a new wire between two components inside it defaults that wire to Async without making the region an enforcement engine.</p></div><div class="score"><div><b>1</b><span>durable semantic tag on a stock Frame</span></div><div><b>0</b><span>new container or resize primitives</span></div><div><b>3</b><span>scoped communication projections</span></div><div><b>1×</b><span>creation-time default, never continuous rewriting</span></div></div></header>
<section><p class="eyebrow">Driven carrier-selection journey</p><h2>Choose the meaning; keep the graph.</h2><p class="intro">This 9.7-second viewport recording is the real stress board: switch to Components, choose Service response and Action result, choose Shortest for both, then focus A2. Focus replaces the aggregate relationship tag with the chosen leg's exact phase while the component positions and 18 canonical connection records remain unchanged.</p><div class="hero-media"><video autoplay muted loop playsinline controls poster="{data_uri(STRESS_ASSETS / '02b-shortest-tracks.png')}"><source src="{data_uri(STRESS_ASSETS / 'representative-edge-hero.mp4', 'video/mp4')}" type="video/mp4"><img class="hero-gif" src="{data_uri(STRESS_ASSETS / 'representative-edge-hero.gif', 'image/gif')}" alt="Animated fallback of the representative-edge selector journey"></video><div class="hero-note"><b>REAL CHROME SCREENCAST · 9.7 S · MUTED LOOP</b><span>Response / Result → independently measured Shortest → exact-phase focus</span></div></div></section>
<section><p class="eyebrow">Real browser evidence</p><h2>The controls arrive with their context.</h2><p class="intro">No query flag is needed. An ordinary board has no communication bar; selecting an Async region supplies both the transient UI scope and the durable place in which new wires default to asynchronous delivery.</p><div class="gallery"><div class="tabs">{buttons}</div><div class="viewer">{figures}</div></div></section>
<section><p class="eyebrow">Adversarial stress fixture</p><h2>18 protocol legs; nine relationships; one region.</h2><p class="intro">The larger board deliberately puts Action and Service both named <code>status</code> on the same component pair, adds two more Actions, two more Services, two Topics, and one Stream, then leaves a nineteenth Topic port pair unwired. This is the case most likely to reveal association bleed or a hidden region invariant.</p><div class="gallery"><div class="tabs">{stress_buttons}</div><div class="viewer">{stress_figures}</div></div><div class="finding"><strong>Adjacent finding—not hidden by the green communication result</strong><ul>{stress_findings}</ul></div></section>
<section><p class="eyebrow">Representative carrier algorithm</p><h2>A display choice over the authored legs—not another graph.</h2><p class="intro">Each collapsed relationship retains every constituent connection descriptor. Elbow mode chooses one real route as its visible carrier; Straight mode makes every choice equivalent and disables the selectors. Focus keeps the stable A#/S# identity but changes every visible tag from relationship summary to exact phase.</p><table><thead><tr><th>Family</th><th>Explicit choices</th><th>Shortest</th><th>Missing phase</th></tr></thead><tbody><tr><td>Topic / Stream</td><td>Data only</td><td>The one data leg</td><td>Not applicable</td></tr><tr><td>Service</td><td>Request · Response</td><td>Minimum rendered request/response polyline</td><td>Falls back to request, then the surviving leg</td></tr><tr><td>Action</td><td>Goal · Feedback · Result</td><td>Minimum rendered goal/feedback/result polyline</td><td>Falls back to goal, then the surviving leg</td></tr></tbody></table><div class="why">WHY: cancellation coordinates an Action; it does not express its main data journey. Shortest therefore excludes cancel whenever goal, feedback, or result exists, but keeps cancel as the last-resort carrier for an otherwise incomplete Action. All measurement, labeling, and choice stay transient—no port, edge, binding, or component record is rewritten.</div></section>
<section><p class="eyebrow">Algorithm</p><h2>One authored fact, one transient lens, one completion hook.</h2><div class="flow"><div class="step"><b>1 · Draw stock Frame</b><span>The Async-region tool delegates gesture and enclosure to tldraw, then stamps the Frame metadata and name.</span></div><div class="step"><b>2 · Select region</b><span>The selected Frame ID becomes transient projection scope. Its components and relationships are the only ones interpreted.</span></div><div class="step"><b>3 · Complete wire</b><span>After both semantic bindings exist, resolve the nearest Async region shared by both endpoint components.</span></div><div class="step"><b>4 · Apply once</b><span>If the new wire still says Data, write Async plus provenance. Later edits, moves, loads, and imports do nothing.</span></div></div><div class="why">WHY: “inside this region, start asynchronous” is helpful authoring intent. “Anything inside must forever be asynchronous” is a hidden constraint that would undo explicit work. The implementation deliberately chooses the former.</div></section>
<section><p class="eyebrow">Behavior boundary</p><h2>Default, not inference and not enforcement.</h2><table><thead><tr><th>Event</th><th>Result</th><th>Reason</th></tr></thead><tbody><tr><td>New Data wire; both endpoints share one Async region</td><td>Becomes Async</td><td>The region supplies its creation default</td></tr><tr><td>New wire crosses the region boundary</td><td>Unchanged</td><td>No shared region owns both components</td></tr><tr><td>New wire already Delayed or Async</td><td>Unchanged</td><td>An explicit temporal choice wins</td></tr><tr><td>User changes an Async-defaulted wire to Data</td><td>Remains Data</td><td>No background reconciler re-applies the default</td></tr><tr><td>Existing/imported wire or component move</td><td>Unchanged</td><td>Membership is not silently reinterpreted</td></tr></tbody></table></section>
<section><p class="eyebrow">Acceptance</p><h2>{len(acceptance['checks'])} browser checks passed.</h2><ul class="checks">{checks}</ul></section>
<section><p class="eyebrow">Stress acceptance</p><h2>{len(stress_acceptance['checks'])} adversarial browser checks passed.</h2><ul class="checks">{stress_checks}</ul></section>
<footer>Built from <code>tests/async_region_smoke.mjs</code>, <code>tests/async_region_stress_fixture_smoke.mjs</code>, <code>docs/capture_async_region_representative_edge_hero.mjs</code>, and their driven review boards · base evidence generated {html.escape(acceptance['generatedAt'])} · stress evidence generated {html.escape(stress_acceptance['generatedAt'])} · all media embedded.</footer>
</main><script>document.querySelectorAll('.gallery').forEach((gallery)=>gallery.querySelectorAll('[data-view]').forEach((button)=>button.addEventListener('click',()=>{{gallery.querySelectorAll('[data-view],[data-figure]').forEach((node)=>node.classList.remove('active'));button.classList.add('active');gallery.querySelector(`[data-figure="${{button.dataset.view}}"]`)?.classList.add('active')}})));</script></body></html>"""
    OUTPUT.write_text(document, encoding="utf-8")
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
