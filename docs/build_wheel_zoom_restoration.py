#!/usr/bin/env python3
"""Build the self-contained wheel-zoom implementation gallery."""
from __future__ import annotations

import base64
import html
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "wheel-zoom-restoration-2026-09-04.html"


def image_uri(relative: str) -> str:
    path = ROOT / relative
    return f"data:image/png;base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


def main() -> None:
    results = json.loads((ROOT / "docs/assets/wheel-zoom-results.json").read_text(encoding="utf-8"))
    before = results["before"]
    after = results["after"]
    flipped_before = results["flippedBefore"]
    flipped_after = results["flippedAfter"]
    checks = "".join(f"<li>{html.escape(check)}</li>" for check in results["checks"])
    before_image = image_uri("docs/assets/wheel-zoom-before.png")
    after_image = image_uri("docs/assets/wheel-zoom-after.png")
    setting_image = image_uri("docs/assets/wheel-zoom-direction-setting.png")
    flipped_image = image_uri("docs/assets/wheel-zoom-flipped.png")
    fixture_image = image_uri("sketches/review/wheel-zoom.png")

    document = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Wheel zoom restoration · SystemSketch</title>
<style>
:root {{ color-scheme:dark; --ink:#f5f7fb; --muted:#aab4c6; --line:#2d384b; --blue:#5aa7ff; --green:#62d58b; }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:#0a0f18; color:var(--ink); font:15px/1.55 Inter,ui-sans-serif,system-ui,sans-serif; }}
main {{ width:min(1180px,calc(100% - 32px)); margin:auto; padding:56px 0 76px; }}
h1 {{ font-size:clamp(38px,6vw,72px); line-height:.98; letter-spacing:-.055em; margin:12px 0 22px; max-width:850px; }}
h2 {{ font-size:26px; margin:0 0 14px; letter-spacing:-.025em; }}
p {{ color:var(--muted); max-width:78ch; }}
.eyebrow {{ color:var(--blue); font-size:12px; font-weight:800; letter-spacing:.16em; text-transform:uppercase; }}
.lead {{ font-size:19px; color:#d9e0ec; }}
.metrics {{ display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin:30px 0 46px; }}
.metric,.panel {{ border:1px solid var(--line); background:linear-gradient(145deg,#121b29,#0d1420); border-radius:18px; }}
.metric {{ padding:18px; }}
.metric b {{ display:block; font-size:28px; }}
.metric span {{ color:var(--muted); }}
.panel {{ padding:22px; margin:18px 0; overflow:hidden; }}
.compare {{ position:relative; aspect-ratio:1280/820; border-radius:12px; overflow:hidden; background:#eef1f5; }}
.compare img {{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }}
.compare .after {{ clip-path:inset(0 0 0 50%); }}
.divider {{ position:absolute; z-index:3; top:0; bottom:0; left:50%; width:2px; background:white; box-shadow:0 0 0 1px #152033; pointer-events:none; }}
.labels {{ display:flex; justify-content:space-between; color:var(--muted); margin-top:10px; font-size:13px; }}
input[type=range] {{ width:100%; accent-color:var(--blue); margin:18px 0 0; }}
.proof {{ display:grid; grid-template-columns:1.05fr .95fr; gap:18px; align-items:start; }}
.direction-grid {{ display:grid; grid-template-columns:1fr 1fr; gap:18px; align-items:start; }}
.fixture,.screenshot {{ width:100%; border-radius:12px; border:1px solid var(--line); }}
.caption {{ margin:10px 2px 0; font-size:13px; }}
ul {{ padding-left:20px; color:#dce4ef; }}
li {{ margin:10px 0; }}
code {{ color:#b9dcff; background:#111b29; padding:2px 6px; border-radius:6px; }}
.stock {{ border-left:3px solid var(--green); padding-left:16px; }}
.footer {{ margin-top:36px; padding-top:20px; border-top:1px solid var(--line); font-size:13px; color:var(--muted); }}
@media (max-width:760px) {{ .metrics,.proof,.direction-grid {{ grid-template-columns:1fr; }} main {{ padding-top:34px; }} }}
</style>
</head>
<body>
<main>
  <div class="eyebrow">SystemSketch · interaction restoration · 2026-09-04</div>
  <h1>The wheel zooms in your direction.</h1>
  <p class="lead">An ordinary vertical wheel gesture zooms around the pointer instead of moving the board. Scroll down zooms in by default; Appearance now exposes one clear switch for people who prefer scroll up.</p>

  <section class="metrics" aria-label="Measured browser results">
    <div class="metric"><b>{html.escape(before['zoomLabel'])} → {html.escape(after['zoomLabel'])}</b><span>scroll down, default</span></div>
    <div class="metric"><b>{html.escape(flipped_before['zoomLabel'])} → {html.escape(flipped_after['zoomLabel'])}</b><span>scroll up, flipped</span></div>
    <div class="metric"><b>Appearance</b><span>saved on this computer</span></div>
    <div class="metric"><b>{len(results['checks'])} / {len(results['checks'])}</b><span>real-browser checks passed</span></div>
  </section>

  <section class="panel">
    <h2>One real wheel gesture</h2>
    <p>Drag the slider to compare the actual browser frame immediately before and after one plain scroll-down event. The rectangle expands around the pointer; the bottom-right readout moves from 100% to 110%.</p>
    <div class="compare" id="compare">
      <img src="{before_image}" alt="SystemSketch before the wheel gesture at 100 percent zoom">
      <img class="after" id="after" src="{after_image}" alt="SystemSketch after the wheel gesture at 110 percent zoom">
      <span class="divider" id="divider" aria-hidden="true"></span>
    </div>
    <input id="scrub" type="range" min="0" max="100" value="50" aria-label="Reveal after frame">
    <div class="labels"><span>Before · 100%</span><span>After · 110%</span></div>
  </section>

  <section class="panel">
    <h2>Default by taste, reversible by choice</h2>
    <p>The first-run state is visibly on. Turning it off updates the live editor immediately, persists on this computer, and makes the opposite scroll direction zoom in after reload.</p>
    <div class="direction-grid">
      <div>
        <img class="screenshot" src="{setting_image}" alt="Appearance settings showing Scroll down to zoom in enabled by default">
        <p class="caption">Appearance · <strong>Scroll down to zoom in</strong> is enabled by default.</p>
      </div>
      <div>
        <img class="screenshot" src="{flipped_image}" alt="SystemSketch at 121 percent after the setting is flipped and a scroll-up gesture zooms in">
        <p class="caption">Flipped · scroll up moves the stock camera from 110% to 121%.</p>
      </div>
    </div>
  </section>

  <section class="proof">
    <article class="panel">
      <h2>Regression proof</h2>
      <ul>{checks}</ul>
      <p class="stock">The repair stays on tldraw’s supported seams: <code>options.camera.wheelBehavior</code>, <code>Editor.setCameraOptions</code>, and the public <code>inputMode</code> / <code>isZoomDirectionInverted</code> preferences. No wheel listener, camera reimplementation, or tldraw fork was added.</p>
    </article>
    <article class="panel">
      <h2>Human review board</h2>
      <img class="fixture" src="{fixture_image}" alt="Guided wheel zoom review board with two orange steps and a green pass condition">
      <p>Place the pointer over <code>wheel_target()</code> and scroll down without Ctrl. Pass when the Block grows around that point and the visible percentage increases; Appearance can flip the direction.</p>
    </article>
  </section>

  <div class="footer">Generated from the current tree by <code>docs/build_wheel_zoom_restoration.py</code>. Browser evidence: <code>tests/wheel_zoom_smoke.mjs</code>.</div>
</main>
<script>
const scrub=document.querySelector('#scrub'); const after=document.querySelector('#after'); const divider=document.querySelector('#divider');
scrub.addEventListener('input',()=>{{ const value=Number(scrub.value); after.style.clipPath=`inset(0 0 0 ${{value}}%)`; divider.style.left=`${{value}}%`; }});
</script>
</body>
</html>
"""
    OUTPUT.write_text(document, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
