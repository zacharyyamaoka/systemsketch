#!/usr/bin/env python3
"""Build the self-contained Canvas navigation settings gallery."""

from __future__ import annotations

import base64
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
SOURCE = ROOT / "src/settings/InterfaceSettings.tsx"
WHEEL_TEST = ROOT / "tests/wheel_zoom_smoke.mjs"
FIXTURE_RECIPE = ROOT / "sketches/review/wheel-zoom.recipe.json"
SETTINGS_CAPTURE = DOCS / "assets/wheel-zoom-direction-setting.png"
FIXTURE_CAPTURE = ROOT / "sketches/review/wheel-zoom.png"
OUTPUT = DOCS / "canvas-navigation-settings-2026-09-05.html"


def data_uri(path: Path) -> str:
    return f"data:image/png;base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


def main() -> None:
    source = SOURCE.read_text(encoding="utf-8")
    wheel_test = WHEEL_TEST.read_text(encoding="utf-8")
    recipe = FIXTURE_RECIPE.read_text(encoding="utf-8")
    assert "id: 'canvas'" in source
    assert "Canvas navigation" in source
    assert "category === 'canvas'" in source
    assert "settings-category-canvas" in wheel_test
    assert "Wheel zoom to stay out of Appearance" in wheel_test
    assert "Settings → Canvas → Wheel zoom" in recipe
    settings_image = data_uri(SETTINGS_CAPTURE)
    fixture_image = data_uri(FIXTURE_CAPTURE)

    output = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Canvas navigation settings · SystemSketch</title>
<style>
:root{{color-scheme:dark;--ink:#f2f7ff;--muted:#b5c0d3;--bg:#0b1120;--panel:#131d31;--line:#2b3f61;--blue:#8dbbff;--orange:#ffb35a;--green:#6cde9b}}*{{box-sizing:border-box}}body{{margin:0;background:radial-gradient(circle at 85% -12%,#254d86 0,transparent 39rem),var(--bg);color:var(--ink);font:16px/1.55 ui-sans-serif,system-ui,sans-serif}}main{{width:min(1180px,calc(100% - 36px));margin:auto;padding:52px 0 78px}}.eyebrow{{color:var(--blue);font-size:.78rem;font-weight:850;letter-spacing:.14em;text-transform:uppercase}}h1{{font-size:clamp(2.5rem,7vw,5.65rem);line-height:.96;letter-spacing:-.06em;margin:.17em 0;max-width:1040px}}.lede{{max-width:830px;color:var(--muted);font-size:1.2rem}}.facts,.grid{{display:grid;gap:16px}}.facts{{grid-template-columns:repeat(3,1fr);margin:30px 0}}.fact,.panel{{border:1px solid var(--line);border-radius:18px;background:linear-gradient(145deg,#172641,#0e1728);padding:20px}}.fact strong{{display:block;color:var(--green);font-size:2rem}}.fact span{{color:var(--muted)}}.flow{{display:grid;grid-template-columns:1fr auto 1fr auto 1fr;gap:12px;align-items:center;margin:26px 0}}.node{{min-height:124px;padding:16px;border:1px solid var(--line);border-radius:15px;background:#101a2b}}.node b{{display:block;color:var(--blue)}}.arrow{{color:var(--orange);font-size:2rem;text-align:center}}.grid{{grid-template-columns:1fr 1fr}}h2{{margin:0 0 10px;font-size:1.35rem}}code{{padding:2px 5px;border-radius:5px;background:#202e46;color:#d9e8ff}}ul{{margin:.5rem 0;padding-left:1.2rem}}li+li{{margin-top:.6rem}}figure{{margin:28px 0 0;overflow:hidden;border:1px solid var(--line);border-radius:18px;background:#fff}}figure img{{display:block;width:100%}}figcaption{{padding:15px 18px;background:#101a2b;color:var(--muted)}}.good{{color:var(--green);font-weight:800}}footer{{margin-top:28px;color:var(--muted)}}@media(max-width:760px){{main{{width:min(100% - 24px,1180px);padding-top:32px}}.facts,.grid{{grid-template-columns:1fr}}.flow{{grid-template-columns:1fr}}.arrow{{transform:rotate(90deg)}}}}
</style></head><body><main>
<div class="eyebrow">SystemSketch · 2026-09-05 · settings architecture</div>
<h1>Canvas navigation is a first-class setting, not an Appearance afterthought.</h1>
<p class="lede">Wheel direction, sensitivity, and the compact zoom-strip choice now live together under <code>Settings → Canvas</code>. Color themes and code-style port rows remain under Appearance, so the navigation contract is discoverable without conflating it with visual taste.</p>
<section class="facts"><div class="fact"><strong>Canvas</strong><span>new active settings category</span></div><div class="fact"><strong>16</strong><span>real-browser wheel journey checks</span></div><div class="fact"><strong>100% → 110%</strong><span>one plain-wheel step in the fixture</span></div></section>
<section class="flow"><div class="node"><b>Appearance</b>Theme selection and visual port-row typography remain visual preferences.</div><div class="arrow">→</div><div class="node"><b>Canvas</b>Wheel direction, sensitivity, and the visible zoom buttons share one navigation home.</div><div class="arrow">→</div><div class="node"><b>Stock camera</b>The existing enforced <code>wheelBehavior: 'zoom'</code> contract remains unchanged.</div></section>
<section class="grid"><article class="panel"><h2>Behavioral guardrail</h2><p>The browser journey first opens Appearance and asserts that it contains no Wheel zoom control, then opens Canvas and exercises direction, sensitivity, persistence, and the underlying stock camera. This makes the placement itself a regression-protected product decision.</p></article><article class="panel"><h2>What the earlier report meant</h2><p>The released wheel zoom logic was still active: a real plain-wheel event increased the camera from 100% to 110%. When the pointer is over an open Settings panel, that panel correctly consumes scrolling for its own content. The new category makes the distinction obvious and puts the relevant controls where users look for canvas navigation.</p></article></section>
<figure><img src="{settings_image}" alt="SystemSketch Settings with Canvas selected, showing Wheel zoom and Zoom controls"><figcaption><strong>Canvas navigation settings.</strong> Wheel zoom appears immediately in the dedicated Canvas category, with sensitivity and the companion zoom controls below it.</figcaption></figure>
<figure><img src="{fixture_image}" alt="SystemSketch Wheel zoom review board with instructions and a Canvas settings note"><figcaption><strong>Guided review fixture.</strong> Hover over <code>wheel()</code>, scroll down without Ctrl, then find the options at <code>Settings → Canvas → Wheel zoom</code>.</figcaption></figure>
<footer>Generated by <code>docs/build_canvas_navigation_settings.py</code> from the live settings source, real-browser evidence, and the refreshed wheel review fixture.</footer>
</main></body></html>"""
    OUTPUT.write_text(output, encoding="utf-8")
    print(f"wrote {OUTPUT.relative_to(ROOT)} ({len(output):,} bytes)")


if __name__ == "__main__":
    main()
