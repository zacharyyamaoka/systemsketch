#!/usr/bin/env python3
"""Build the self-contained stock-first Canvas navigation gallery."""

from __future__ import annotations

import base64
import html
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
ASSETS = DOCS / "assets"
SOURCE = ROOT / "src/settings/InterfaceSettings.tsx"
CAMERA = ROOT / "src/canvasCamera.ts"
WHEEL_TEST = ROOT / "tests/wheel_zoom_smoke.mjs"
FIXTURE_RECIPE = ROOT / "sketches/review/wheel-zoom.recipe.json"
RESULTS = ASSETS / "canvas-navigation-controls-results.json"
OUTPUT = DOCS / "canvas-navigation-settings-2026-09-05.html"


def data_uri(path: Path, mime: str) -> str:
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


def main() -> None:
    source = SOURCE.read_text(encoding="utf-8")
    camera = CAMERA.read_text(encoding="utf-8")
    wheel_test = WHEEL_TEST.read_text(encoding="utf-8")
    recipe = FIXTURE_RECIPE.read_text(encoding="utf-8")
    results = json.loads(RESULTS.read_text(encoding="utf-8"))

    assert "Direct wheel zoom" in source
    assert "Ctrl/Cmd + scroll zooms" in source
    assert "Ctrl/Cmd + scroll zooms the opposite way" in source
    assert "directWheelZoom" in source
    assert "modifierWheelZoomsOppositely" in camera
    assert "wheelBehavior: 'pan'" in camera
    assert "inputMode: 'trackpad'" in camera
    assert "Ctrl/Cmd + scroll changes the stock camera scale" in wheel_test
    assert "directWheelZoom" in wheel_test
    assert "Ctrl/Cmd + down scroll zooms out" in recipe

    stock = results["stockBefore"]
    panned = results["panned"]
    modifier = results["modifierZoomed"]
    direct = results["directAfter"]
    direct_modifier = results["directModifierZoomed"]
    modifier_reverse = results["modifierReverse"]
    restored = results["restored"]
    checks = results["checks"]

    hero_mp4 = data_uri(ASSETS / "canvas-navigation-hero.mp4", "video/mp4")
    hero_gif = data_uri(ASSETS / "canvas-navigation-hero.gif", "image/gif")
    default_setting = data_uri(ASSETS / "canvas-navigation-default-setting.png", "image/png")
    direct_setting = data_uri(ASSETS / "canvas-navigation-direct-setting.png", "image/png")
    stock_capture = data_uri(ASSETS / "canvas-navigation-stock.png", "image/png")
    pan_capture = data_uri(ASSETS / "canvas-navigation-pan.png", "image/png")
    direct_capture = data_uri(ASSETS / "canvas-navigation-direct-zoom.png", "image/png")
    direct_modifier_capture = data_uri(ASSETS / "canvas-navigation-direct-modifier-zoom.png", "image/png")
    fixture_capture = data_uri(ROOT / "sketches/review/wheel-zoom.png", "image/png")
    check_items = "".join(f"<li>{html.escape(item)}</li>" for item in checks)

    document = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Stock-first canvas navigation · SystemSketch</title>
<style>
:root{{color-scheme:dark;--ink:#f4f7fb;--muted:#adb9cc;--bg:#09101d;--card:#101b2d;--line:#294260;--blue:#7bb4ff;--green:#73d9a0;--orange:#ffb567}}*{{box-sizing:border-box}}body{{margin:0;background:radial-gradient(circle at 80% -12%,#214b80 0,transparent 38rem),var(--bg);color:var(--ink);font:16px/1.55 Inter,ui-sans-serif,system-ui,sans-serif}}main{{width:min(1180px,calc(100% - 36px));margin:auto;padding:52px 0 78px}}.eyebrow{{color:var(--blue);font-size:.76rem;font-weight:850;letter-spacing:.14em;text-transform:uppercase}}h1{{font-size:clamp(2.65rem,7vw,5.9rem);line-height:.94;letter-spacing:-.062em;max-width:1050px;margin:.16em 0}}.lead{{max-width:800px;color:#d4dce8;font-size:1.19rem}}.hero,.panel,.fact{{background:linear-gradient(145deg,#14243d,#0d1727);border:1px solid var(--line);border-radius:20px}}.hero{{overflow:hidden;margin:30px 0 18px}}video,.fallback{{display:block;width:100%;background:#edf1f4}}video{{aspect-ratio:1280/820;object-fit:cover}}.caption{{padding:13px 17px;color:var(--muted);font-size:.88rem}}.facts,.grid,.compare{{display:grid;gap:16px}}.facts{{grid-template-columns:repeat(3,1fr);margin:18px 0 34px}}.fact{{padding:18px}}.fact b{{display:block;color:var(--green);font-size:1.9rem;letter-spacing:-.04em}}.fact span{{color:var(--muted)}}.flow{{display:grid;grid-template-columns:1fr auto 1fr auto 1fr;gap:12px;align-items:stretch;margin:26px 0}}.node{{padding:17px;border:1px solid var(--line);background:#0e1a2c;border-radius:15px}}.node b{{display:block;color:var(--blue);margin-bottom:5px}}.arrow{{display:grid;place-content:center;color:var(--orange);font-size:2rem}}.grid{{grid-template-columns:1fr 1fr}}.panel{{padding:21px;overflow:hidden}}h2{{font-size:1.35rem;letter-spacing:-.025em;margin:0 0 8px}}p{{color:var(--muted)}}figure{{margin:14px 0 0;border-radius:13px;overflow:hidden;border:1px solid var(--line);background:#edf1f4}}figure img{{display:block;width:100%}}figcaption{{padding:12px 14px;color:var(--muted);background:#101b2d;font-size:.86rem}}.compare{{grid-template-columns:1fr auto 1fr;align-items:center}}.compare .swap{{font-size:1.85rem;color:var(--orange)}}.compare-toggle{{display:flex;align-items:center;gap:10px;margin:16px 0 0;color:var(--muted)}}.compare-toggle input{{accent-color:var(--blue);flex:1}}.scenario{{border-radius:14px;overflow:hidden;border:1px solid var(--line);background:#0d1727}}.scenario img{{display:block;width:100%}}table{{border-collapse:collapse;width:100%;font-size:.91rem}}th,td{{padding:11px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}}th{{color:var(--blue)}}code{{background:#182942;color:#d7e7ff;padding:2px 5px;border-radius:5px}}ul{{padding-left:20px}}li+li{{margin-top:8px}}.fixture{{width:100%;border-radius:12px;border:1px solid var(--line)}}.quiet{{font-size:.86rem;color:var(--muted)}}footer{{margin-top:32px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font-size:.86rem}}@media(max-width:760px){{main{{width:min(100% - 24px,1180px);padding-top:30px}}.facts,.grid,.compare{{grid-template-columns:1fr}}.compare .swap{{transform:rotate(90deg);justify-self:center}}.flow{{grid-template-columns:1fr}}.arrow{{transform:rotate(90deg)}}}}
</style></head><body><main>
<div class="eyebrow">SystemSketch · Canvas navigation · 2026-09-05</div>
<h1>The whiteboard behaves like a whiteboard first.</h1>
<p class="lead">Normal wheel movement still pans the page, while <code>Ctrl</code>/<code>⌘</code> + wheel keeps stock zoom. Under <code>Settings → Canvas</code>, Direct wheel zoom now has a second opt-in: the modifier also zooms, but in the exact opposite direction from the plain wheel.</p>
<section class="hero"><video controls autoplay muted loop playsinline poster="{stock_capture}"><source src="{hero_mp4}" type="video/mp4"><img class="fallback" src="{hero_gif}" alt="Actual canvas-navigation journey: stock pan, direct wheel zoom, opposite Ctrl or Command zoom, and restored stock mode"></video><div class="caption">Actual browser journey · stock pan → settings opt-in → direct wheel zoom → opposite Ctrl/Cmd zoom → restored stock navigation. A GIF fallback is embedded for browsers without video.</div></section>
<section class="facts"><div class="fact"><b>{len(checks)}/{len(checks)}</b><span>real-browser checks passed</span></div><div class="fact"><b>{stock['camera']['z']:.0%}</b><span>untouched first-run scale</span></div><div class="fact"><b>two opt-ins</b><span>direct and inverse modifier behavior stay explicit</span></div></section>
<section class="flow"><div class="node"><b>Normal (default)</b>Wheel pans; <code>Ctrl/⌘ + wheel</code> zooms.</div><div class="arrow">→</div><div class="node"><b>Direct (opt-in)</b>Plain down scroll zooms in at the selected sensitivity.</div><div class="arrow">→</div><div class="node"><b>Inverse modifier (opt-in)</b><code>Ctrl/⌘ + down</code> zooms out; up zooms in.</div></section>
<section class="grid"><article class="panel"><h2>The setting says the whole contract</h2><p>The default does not make people infer the modifier: it spells out both stock gestures directly, then removes direct-only controls until direct zoom is deliberately enabled.</p><figure><img src="{default_setting}" alt="Canvas settings with Direct wheel zoom turned off"><figcaption><strong>Default.</strong> Scroll pans; <code>Ctrl/Cmd + scroll</code> zooms.</figcaption></figure></article><article class="panel"><h2>CAD convention remains opt-in</h2><p>Direct mode reveals its direction and sensitivity choices, plus a separate Ctrl/Cmd inversion switch. Turning Direct mode off restores stock panning and ordinary modifier zoom.</p><figure><img src="{direct_setting}" alt="Canvas settings with Direct wheel zoom and opposite Ctrl or Command zoom turned on"><figcaption><strong>Opt-in.</strong> Plain down scroll zooms in; the checked modifier row makes Ctrl/Cmd + down zoom out.</figcaption></figure></article></section>
<section class="panel" style="margin-top:16px"><h2>Observed camera behavior</h2><table><thead><tr><th>Gesture</th><th>Observed change</th><th>What stays stable</th></tr></thead><tbody><tr><td>Plain scroll</td><td><code>y {stock['camera']['y']:.0f} → {panned['camera']['y']:.0f}</code></td><td>Scale <code>{stock['camera']['z']:.0%}</code></td></tr><tr><td>Ctrl/Cmd + scroll (stock)</td><td>Scale <code>{panned['camera']['z']:.0%} → {modifier['camera']['z']:.0%}</code></td><td>Stock pan contract stays selected</td></tr><tr><td>Direct down scroll</td><td>Scale <code>{results['directBefore']['camera']['z']:.0%} → {direct['camera']['z']:.0%}</code></td><td>Opt-in remains explicit in local settings</td></tr><tr><td>Direct Ctrl/Cmd + down</td><td>Scale <code>{direct['camera']['z']:.0%} → {direct_modifier['camera']['z']:.0%}</code></td><td><code>Ctrl/Cmd + up → {modifier_reverse['camera']['z']:.0%}</code></td></tr><tr><td>Disable direct mode</td><td><code>inputMode: {restored['inputMode']}</code></td><td><code>zoomSpeed: {restored['zoomSpeed']:.0f}</code> resets to standard</td></tr></tbody></table><div class="compare-toggle"><span>Direct down: in</span><input id="reveal" type="range" min="0" max="100" value="50" aria-label="Compare direct wheel zoom and opposite modifier zoom"><span>Ctrl/Cmd down: out</span></div><div class="compare" style="margin-top:12px"><figure><img id="left" src="{direct_capture}" alt="Canvas after a direct plain scroll down zoom"><figcaption>Direct plain down scroll: scale increases.</figcaption></figure><div class="swap">⇄</div><figure><img id="right" src="{direct_modifier_capture}" alt="Canvas after direct Ctrl or Command plus scroll down zoom"><figcaption>Direct Ctrl/Cmd + down: scale decreases.</figcaption></figure></div></section>
<section class="grid" style="margin-top:16px"><article class="panel"><h2>Human review board</h2><img class="fixture" src="{fixture_capture}" alt="Wheel zoom review fixture with stock pan and opposite direct modifier zoom instructions"><p>Start with the prepared <code>wheel()</code> Block: plain scroll pans, stock Ctrl/Cmd scroll changes scale, then enable both direct controls to make down scroll zoom in and Ctrl/Cmd + down zoom out.</p></article><article class="panel"><h2>Regression proof</h2><ul>{check_items}</ul><p class="quiet">The implementation keeps tldraw’s stock camera options for normal navigation. Only the enabled direct Ctrl/Cmd gesture uses tldraw’s public constrained <code>setCamera</code> seam, anchored at the real pointer; ordinary wheels, pinch, keys, and pan remain stock.</p></article></section>
<footer>Generated from the live source and real-browser evidence by <code>docs/build_canvas_navigation_settings.py</code>. The review fixture is <code>sketches/review/wheel-zoom.systemsketch</code>.</footer>
</main><script>const r=document.querySelector('#reveal'),l=document.querySelector('#left'),q=document.querySelector('#right');r.addEventListener('input',()=>{{const a=Number(r.value)/100;l.style.opacity=String(1-a*.45);q.style.opacity=String(.55+a*.45)}})</script></body></html>"""
    OUTPUT.write_text(document, encoding="utf-8")
    print(f"wrote {OUTPUT.relative_to(ROOT)} ({len(document):,} bytes)")


if __name__ == "__main__":
    main()
