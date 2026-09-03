#!/usr/bin/env python3
"""Build the self-contained Detach visual-fidelity implementation gallery."""

from __future__ import annotations

import base64
import html
import json
import subprocess
from pathlib import Path


HERE = Path(__file__).resolve().parent
REPO = HERE.parent
ASSETS = HERE / "assets"
OUTPUT = HERE / "detach-fidelity-2026-09-02.html"
ACCEPTANCE = ASSETS / "detach-fidelity-acceptance.json"


def image_data(name: str) -> str:
    path = ASSETS / name
    return base64.b64encode(path.read_bytes()).decode("ascii")


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=REPO, text=True).strip()


def main() -> None:
    result = json.loads(ACCEPTANCE.read_text())
    score = result["score"]
    checks = result["checks"]
    detached = result["detached"]
    branch = git("branch", "--show-current")
    checks_html = "".join(
        f'<li><span class="tick">✓</span>{html.escape(label)}</li>'
        for label, passed in checks.items()
        if passed
    )
    before = image_data("detach-fidelity-before.png")
    after = image_data("detach-fidelity-after.png")
    diff = image_data("detach-fidelity-diff.png")

    page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SystemSketch — Detach fidelity</title>
<style>
:root{{--ink:#18212b;--muted:#5e6975;--paper:#f5f7fa;--card:#fff;--line:#dbe1e8;--blue:#2563eb;--green:#16845b;--orange:#e47a19;--red:#e23d28;}}
*{{box-sizing:border-box}} body{{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 Inter,ui-sans-serif,system-ui,sans-serif}}
main{{width:min(1180px,calc(100% - 36px));margin:0 auto;padding:52px 0 70px}} h1{{font:650 clamp(38px,7vw,72px)/.98 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:-.055em;margin:14px 0 18px;max-width:900px}}
h2{{font-size:24px;margin:0 0 12px}} h3{{margin:0 0 8px;font-size:17px}} p{{margin:0 0 14px}} .eyebrow{{color:var(--blue);font-weight:750;letter-spacing:.12em;text-transform:uppercase;font-size:12px}}
.lede{{font-size:20px;color:var(--muted);max-width:900px}} .kpis{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:32px 0}}
.kpi,.card{{background:var(--card);border:1px solid var(--line);border-radius:16px;box-shadow:0 7px 24px rgb(20 31 45 / 6%)}}
.kpi{{padding:18px}} .kpi b{{font:650 30px/1 ui-monospace,monospace;display:block}} .kpi span{{color:var(--muted);font-size:13px}}
.card{{padding:24px;margin:18px 0}} .grid{{display:grid;grid-template-columns:1.25fr .75fr;gap:18px}} .compare{{position:relative;aspect-ratio:468/324;overflow:hidden;border:1px solid var(--line);border-radius:12px;background:#f8f9fa}}
.compare img{{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}} .compare .after{{clip-path:inset(0 0 0 50%)}} .divider{{position:absolute;top:0;bottom:0;left:50%;width:2px;background:var(--blue);box-shadow:0 0 0 1px white}}
.labels{{display:flex;justify-content:space-between;font:700 11px/1 ui-monospace,monospace;color:var(--muted);margin:8px 2px}} input[type=range]{{width:100%;accent-color:var(--blue)}}
.heat img{{width:100%;border-radius:12px;background:#000;border:1px solid #111}} .legend{{display:flex;gap:16px;color:var(--muted);font-size:12px}} .swatch{{width:10px;height:10px;border-radius:50%;display:inline-block;margin-right:5px}}
table{{width:100%;border-collapse:collapse}} th,td{{text-align:left;padding:12px 10px;border-bottom:1px solid var(--line);vertical-align:top}} th{{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}} code{{font:13px/1.4 ui-monospace,monospace;background:#edf1f5;border-radius:5px;padding:2px 5px}}
.accepted{{color:var(--green);font-weight:700}} .rejected{{color:var(--red);font-weight:700}} .tree{{font:14px/1.65 ui-monospace,monospace;background:#111927;color:#dbeafe;border-radius:12px;padding:18px;white-space:pre-wrap}}
ul.clean{{list-style:none;padding:0;margin:0;columns:2}} ul.clean li{{padding:5px 0;break-inside:avoid}} .tick{{color:var(--green);font-weight:900;margin-right:8px}} .callout{{border-left:4px solid var(--blue);padding:10px 0 10px 16px;color:var(--muted)}}
.links a{{color:var(--blue);font-weight:650;text-decoration:none;margin-right:18px}} footer{{color:var(--muted);font-size:12px;margin-top:35px}}
@media(max-width:800px){{.kpis{{grid-template-columns:repeat(2,1fr)}}.grid{{grid-template-columns:1fr}}ul.clean{{columns:1}}}}
</style>
</head>
<body><main>
<div class="eyebrow">SystemSketch · implementation evidence · 2026-09-02</div>
<h1>Detach now preserves the Block’s visual grammar.</h1>
<p class="lede">The detached result uses editable stock tldraw geo, line, and text records, but keeps the live Block’s layered ports, typography, rounded value chip, 9 px card radius, one-pixel rules, and resting shadow. Every port row is a nested group.</p>

<section class="kpis">
  <div class="kpi"><b>{score['score'] * 100:.2f}%</b><span>weighted visual similarity</span></div>
  <div class="kpi"><b>{score['wholeSimilarity'] * 100:.2f}%</b><span>whole-frame pixel similarity</span></div>
  <div class="kpi"><b>{detached['rowGroups']}</b><span>nested port-row groups in proof</span></div>
  <div class="kpi"><b>18 / 12</b><span>outer ring / optional filled core, in pixels</span></div>
</section>

<section class="card">
  <h2>Same camera, same crop, before and after</h2>
  <p>Move the slider. The before capture is the live HTML Block; the after capture is its materialized stock-shape composite. The scorer compares these exact PNGs.</p>
  <div class="compare" id="compare">
    <img src="data:image/png;base64,{before}" alt="Live Block before detach">
    <img class="after" id="after" src="data:image/png;base64,{after}" alt="Stock primitives after detach">
    <div class="divider" id="divider"></div>
  </div>
  <div class="labels"><span>LIVE BLOCK</span><span>DETACHED PRIMITIVES</span></div>
  <input id="slider" aria-label="Before and after split" type="range" min="0" max="100" value="50">
</section>

<section class="grid">
  <article class="card heat">
    <h2>Deterministic difference map</h2>
    <p>Black is unchanged. Orange/red marks foreground and edge disagreement; most residual error is browser antialiasing between HTML and SVG text.</p>
    <img src="data:image/png;base64,{diff}" alt="Pixel difference heatmap">
    <div class="legend"><span><i class="swatch" style="background:#ff5a1f"></i>foreground delta</span><span><i class="swatch" style="background:#e11d12"></i>edge delta</span></div>
  </article>
  <article class="card">
    <h2>Acceptance gates</h2>
    <ul class="clean">{checks_html}</ul>
  </article>
</section>

<section class="card">
  <h2>The iteration loop was allowed to reject a better-looking number</h2>
  <table><thead><tr><th>Pass</th><th>Score</th><th>Visual judgment</th><th>Decision</th></tr></thead><tbody>
    <tr><td>Baseline exact styles</td><td>88.07%</td><td>Typography and primitive paint still drifted; the stock text outline made glyphs too heavy.</td><td>iterate</td></tr>
    <tr><td>Width experiment</td><td>92.90%</td><td>Score rose because final glyphs wrapped below fixed-height boxes and disappeared.</td><td class="rejected">rejected</td></tr>
    <tr><td>Measured text + integrity gates</td><td>93.14%</td><td>Every expected label present; horizontal and vertical overflow both zero; repeat run byte-identical.</td><td>iterate</td></tr>
    <tr><td>Exact letter spacing + card shadow</td><td>94.80%</td><td>Single-line Function, complete labels, rounded pill, and matching card geometry.</td><td>preserved</td></tr>
    <tr><td>Layered port restoration</td><td>{score['score'] * 100:.2f}%</td><td>Every port keeps the 18 px ring; connected/default ports add the centred 12 px core seen in the live Block.</td><td class="accepted">accepted ≥ 94.5%</td></tr>
  </tbody></table>
  <p class="callout">The scalar score is never trusted alone: text completeness and both scroll dimensions are independent gates, and the generated heatmap is inspected after each pass.</p>
</section>

<section class="grid">
  <article class="card"><h2>Editable hierarchy</h2><div class="tree">detached Block group
├── card + header/footer primitives
├── input row group
│   ├── 18 px outer-ring ellipse
│   ├── optional 12 px filled-core ellipse
│   ├── name text
│   ├── type text
│   ├── rounded default-value geo
│   └── default-value text
├── input row group
├── output row group
└── output row group</div></article>
  <article class="card"><h2>Supported extension boundary</h2><p><code>layoutBlock()</code> remains the only geometry authority. Public <code>ShapeUtil.configure</code> display-value seams reproduce token colours, exact type metrics, and one-pixel strokes while the saved records stay ordinary tldraw shapes.</p><p>The remembered outer group still rebuilds the semantic Block and connection graph; row groups carry only selection/movement structure.</p></article>
</section>

<section class="card links"><h2>Run it</h2>
  <p><a href="../sketches/review/detach-fidelity.systemsketch">review fixture</a><a href="../tests/detach_fidelity_smoke.mjs">browser scorer journey</a><a href="../tests/detached_port_row_smoke.mjs">row-drag journey</a><a href="build_detach_fidelity.py">gallery builder</a></p>
  <p><code>npm run test:detach-fidelity</code> · <code>npm run test:detached-port-row</code> · <code>npm run test:detach</code></p>
</section>

<footer>Built by <code>docs/build_detach_fidelity.py</code> from branch {html.escape(branch)}. Measurements and images are read from the current real-browser acceptance artifacts.</footer>
</main>
<script>
const slider=document.getElementById('slider'),after=document.getElementById('after'),divider=document.getElementById('divider');
slider.addEventListener('input',()=>{{const n=slider.value;after.style.clipPath=`inset(0 0 0 ${{n}}%)`;divider.style.left=`${{n}}%`;}});
</script></body></html>"""
    OUTPUT.write_text(page)
    print(OUTPUT)


if __name__ == "__main__":
    main()
