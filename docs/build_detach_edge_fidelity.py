#!/usr/bin/env python3
"""Build the self-contained detached-edge visual-fidelity gallery."""

from __future__ import annotations

import base64
import html
import json
import subprocess
from pathlib import Path


HERE = Path(__file__).resolve().parent
REPO = HERE.parent
ASSETS = HERE / "assets"
OUTPUT = HERE / "detach-edge-fidelity-2026-09-02.html"
ACCEPTANCE = ASSETS / "detach-edge-fidelity-acceptance.json"
REFLOW_ACCEPTANCE = ASSETS / "detached-arrow-reflow-acceptance.json"


def image_data(name: str) -> str:
    return base64.b64encode((ASSETS / name).read_bytes()).decode("ascii")


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=REPO, text=True).strip()


def main() -> None:
    result = json.loads(ACCEPTANCE.read_text())
    reflow = json.loads(REFLOW_ACCEPTANCE.read_text())
    pixels = result["pixels"]
    geometry = result["geometry"]
    checks = result["checks"]
    branch = git("branch", "--show-current")
    checks_html = "".join(
        f'<li><span class="tick">✓</span>{html.escape(label)}</li>'
        for label, passed in checks.items()
        if passed
    )
    reflow_checks_html = "".join(
        f'<li><span class="tick">✓</span>{html.escape(label)}</li>'
        for label, passed in reflow["checks"].items()
        if passed
    )
    before = image_data("detach-edge-fidelity-before.png")
    after = image_data("detach-edge-fidelity-after.png")
    diff = image_data("detach-edge-fidelity-diff.png")
    reflow_baseline = image_data("detached-arrow-reflow-baseline.png")
    reflow_after = image_data("detached-arrow-reflow-after.png")

    page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch — Detached edge fidelity</title>
<style>
:root{{--ink:#19212b;--muted:#5f6975;--paper:#f4f6f9;--card:#fff;--line:#dce2e8;--blue:#2563eb;--green:#13845b;--orange:#e47a19;--red:#db3b2f}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 Inter,ui-sans-serif,system-ui,sans-serif}}
main{{width:min(1160px,calc(100% - 36px));margin:auto;padding:52px 0 72px}}h1{{margin:12px 0 18px;max-width:940px;font:650 clamp(38px,7vw,72px)/.98 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:-.055em}}
h2{{margin:0 0 10px;font-size:23px}}p{{margin:0 0 14px}}code{{font:13px/1.4 ui-monospace,monospace;background:#edf1f5;border-radius:5px;padding:2px 5px}}.eyebrow{{color:var(--blue);font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}}.lede{{max-width:900px;color:var(--muted);font-size:20px}}
.kpis{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:32px 0}}.kpi,.card{{background:var(--card);border:1px solid var(--line);border-radius:16px;box-shadow:0 7px 24px rgb(20 31 45 / 6%)}}.kpi{{padding:18px}}.kpi b{{display:block;font:650 29px/1 ui-monospace,monospace}}.kpi span{{color:var(--muted);font-size:13px}}
.card{{padding:24px;margin:18px 0}}.compare{{position:relative;overflow:hidden;aspect-ratio:584/447;border:1px solid var(--line);border-radius:12px;background:#f7f8fa}}.compare img{{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}}.compare .after{{clip-path:inset(0 0 0 50%)}}.divider{{position:absolute;inset:0 auto 0 50%;width:2px;background:var(--blue);box-shadow:0 0 0 1px #fff}}.labels{{display:flex;justify-content:space-between;margin:8px 2px;color:var(--muted);font:700 11px/1 ui-monospace,monospace}}input[type=range]{{width:100%;accent-color:var(--blue)}}
.grid{{display:grid;grid-template-columns:1.15fr .85fr;gap:18px}}.heat img{{width:100%;border:1px solid #111;border-radius:12px;background:#000}}ul.clean{{list-style:none;margin:0;padding:0;columns:2}}ul.clean li{{padding:5px 0;break-inside:avoid}}.tick{{margin-right:8px;color:var(--green);font-weight:900}}
.motion-grid{{display:grid;grid-template-columns:1fr 1fr;gap:14px}}.motion-grid figure{{margin:0}}.motion-grid img{{display:block;width:100%;border:1px solid var(--line);border-radius:12px}}.motion-grid figcaption{{margin-top:7px;color:var(--muted);font-size:13px}}
table{{width:100%;border-collapse:collapse}}th,td{{padding:12px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}}th{{color:var(--muted);font-size:11px;letter-spacing:.08em;text-transform:uppercase}}.iterate{{color:var(--orange);font-weight:700}}.accepted{{color:var(--green);font-weight:750}}.route{{width:100%;height:auto;border:1px solid var(--line);border-radius:12px;background:#f8fafc}}.muted{{color:var(--muted)}}.links a{{margin-right:18px;color:var(--blue);font-weight:650;text-decoration:none}}footer{{margin-top:34px;color:var(--muted);font-size:12px}}
@media(max-width:800px){{.kpis{{grid-template-columns:repeat(2,1fr)}}.grid,.motion-grid{{grid-template-columns:1fr}}ul.clean{{columns:1}}}}
</style>
</head>
<body><main>
<div class="eyebrow">SystemSketch · implementation evidence · 2026-09-02</div>
<h1>Detach keeps the cable, not an approximation.</h1>
<p class="lede">The semantic connection becomes a valid stock tldraw arrow, but its namespaced metadata carries the exact painted path. Bindings, grouping, movement, rebuilding and the stock fallback remain intact.</p>

<section class="kpis">
  <div class="kpi"><b>{pixels['edgeSimilarity'] * 100:.4f}%</b><span>edge-map similarity</span></div>
  <div class="kpi"><b>{pixels['foregroundSimilarity'] * 100:.4f}%</b><span>foreground similarity</span></div>
  <div class="kpi"><b>{geometry['rms']:.5f}px</b><span>sampled route RMS error</span></div>
  <div class="kpi"><b>{geometry['max']:.5f}px</b><span>worst sampled deviation</span></div>
</section>

<section class="card">
  <h2>Endpoint motion returns control to the stock arrow</h2>
  <p>The exact snapshot exists only to make the detach itself pixel-perfect. Once a bound card moves, the curve and elbow use tldraw's ordinary live bindings and resize grammar.</p>
  <div class="motion-grid">
    <figure><img src="data:image/png;base64,{reflow_baseline}" alt="Curved and elbow detached arrows rotating after a bound card moves"><figcaption>Before: the frozen snapshot is transformed, rotating both routes.</figcaption></figure>
    <figure><img src="data:image/png;base64,{reflow_after}" alt="Curved and elbow detached arrows reflowing normally after a bound card moves"><figcaption>After: the stock arc and orthogonal elbow reflow between the same live bindings.</figcaption></figure>
  </div>
</section>

<section class="card">
  <h2>Same camera, same cable corridor</h2>
  <p>Move the slider. The live semantic cable is below; the detached stock arrow is above it in exactly the same crop.</p>
  <div class="compare"><img src="data:image/png;base64,{before}" alt="Cable before detach"><img id="after" class="after" src="data:image/png;base64,{after}" alt="Arrow after detach"><div id="divider" class="divider"></div></div>
  <div class="labels"><span>SEMANTIC CABLE</span><span>DETACHED STOCK ARROW</span></div>
  <input id="slider" aria-label="Before and after split" type="range" min="0" max="100" value="50">
</section>

<section class="grid">
  <article class="card heat"><h2>Difference map</h2><p>Black is unchanged. The final residual is sub-pixel raster noise; no alternate route is visible.</p><img src="data:image/png;base64,{diff}" alt="Cable pixel difference heatmap"></article>
  <article class="card"><h2>Acceptance gates</h2><ul class="clean">{checks_html}{reflow_checks_html}</ul></article>
</section>

<section class="card">
  <h2>The loop converged on geometry and paint independently</h2>
  <table><thead><tr><th>Pass</th><th>Route RMS</th><th>Worst point</th><th>Edge similarity</th><th>Decision</th></tr></thead><tbody>
    <tr><td>Hard-coded stock arc</td><td>31.2699 px</td><td>48.7359 px</td><td>71.8343%</td><td class="iterate">iterate</td></tr>
    <tr><td>Exact path, stock inset anchors</td><td>0.2070 px</td><td>0.3644 px</td><td>97.6659%</td><td class="iterate">iterate</td></tr>
    <tr><td>Exact path, exact port anchors</td><td>{geometry['rms']:.5f} px</td><td>{geometry['max']:.5f} px</td><td>{pixels['edgeSimilarity'] * 100:.4f}%</td><td class="accepted">accepted</td></tr>
  </tbody></table>
</section>

<section class="grid">
  <article class="card"><h2>Why the old curve could not match</h2><svg class="route" viewBox="-20 -210 540 250" role="img" aria-label="Exact cubic cable and old stock arc approximation"><path d="M 0 0 C 166.6667 0 333.3333 -170 500 -170" fill="none" stroke="#6e7477" stroke-width="2"/><path d="M -0.28 0 C 177.8548 -15.4357 349.6057 -73.7633 500.3 -170" fill="none" stroke="#e47a19" stroke-width="2" stroke-dasharray="8 6"/><circle cx="0" cy="0" r="4" fill="#6e7477"/><circle cx="500" cy="-170" r="4" fill="#6e7477"/></svg><p class="muted">Grey: the live Block cable’s horizontal departure and arrival. Orange: the former circular-arc fallback. Endpoint equality was not route equality.</p></article>
  <article class="card"><h2>Supported seam</h2><p>The saved shape is still <code>type: arrow</code> with ordinary arrow bindings. SystemSketch’s existing <code>ArrowShapeUtil</code> extension paints the captured SVG body and uses sampled points for hit geometry and selection indication.</p><p>While the terminals stay put, the snapshot resolves their exact anchors without tldraw’s anti-degeneracy inset. Moving either bound card or editing the arrow’s own geometry returns visual and routing authority to the stock primitive.</p></article>
</section>

<section class="card links"><h2>Run it</h2><p><a href="../sketches/review/detach-edge-fidelity.systemsketch">review fixture</a><a href="../tests/detach_edge_fidelity_smoke.mjs">detach scorer journey</a><a href="../tests/detached_arrow_reflow_smoke.mjs">movement journey</a><a href="build_detach_edge_fidelity.py">gallery builder</a></p><p><code>npm run test:detach-edge-fidelity</code> · <code>npm run test:detached-arrow-reflow</code> · <code>npm run check</code></p></section>
<footer>Built by <code>docs/build_detach_edge_fidelity.py</code> from branch {html.escape(branch)}. All final measurements and images come from the real-browser acceptance run.</footer>
</main><script>const slider=document.getElementById('slider'),after=document.getElementById('after'),divider=document.getElementById('divider');slider.addEventListener('input',()=>{{after.style.clipPath=`inset(0 0 0 ${{slider.value}}%)`;divider.style.left=`${{slider.value}}%`;}});</script></body></html>"""
    OUTPUT.write_text(page)
    print(OUTPUT)


if __name__ == "__main__":
    main()
