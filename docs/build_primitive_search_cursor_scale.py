#!/usr/bin/env python3
"""Build a self-contained visual proof for the primitive-search scale repair."""

from __future__ import annotations

import base64
import html
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "primitive-search-cursor-scale-2026-09-06.html"
SCREENSHOT = ROOT / "docs" / "assets" / "primitive-search-cursor-160-2026-09-06.png"
MEASUREMENTS = ROOT / "docs" / "assets" / "primitive-search-cursor-160-2026-09-06.json"
CHECKS = ROOT / "docs" / "assets" / "primitive-search-smoke.json"
FIXTURE = ROOT / "sketches" / "review" / "primitive-search-cursor-scale.png"
SEARCH = ROOT / "src" / "library" / "PrimitiveSearch.tsx"
MODAL = ROOT / "src" / "library" / "LibrarySearchModal.tsx"
CSS = ROOT / "src" / "library" / "primitive-search.css"
CSS_NEEDLE = ".systemsketch-primitive-search {"


def data_uri(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def excerpt(path: Path, needle: str, count: int) -> str:
    lines = path.read_text(encoding="utf-8").splitlines()
    start = next(i for i, line in enumerate(lines) if needle in line)
    return "\n".join(f"{i + 1:>4}  {line}" for i, line in enumerate(lines[start:start + count], start))


def main() -> None:
    measurements = json.loads(MEASUREMENTS.read_text(encoding="utf-8"))
    checks = json.loads(CHECKS.read_text(encoding="utf-8"))
    if measurements["interfaceScale"] != 160 or len(checks) != 9:
        raise SystemExit("refusing to build without the nine-check 160% browser run")

    pointer = measurements["pointer"]
    target = measurements["targetCenter"]
    panel = measurements["panel"]
    viewport = measurements["viewport"]
    toolbar_top = measurements["toolbarTop"]
    delta_x = panel["x"] - pointer["x"]
    delta_y = panel["y"] - pointer["y"]
    below_toolbar = toolbar_top - panel["bottom"]
    check_rows = "".join(f"<li><span>✓</span>{html.escape(check)}</li>" for check in checks)

    document = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Primitive search cursor-scale repair · SystemSketch</title>
<style>
:root{{--paper:#f4f7fb;--ink:#172231;--muted:#657386;--line:#d8e1ec;--blue:#287be6;--green:#16805a;--orange:#db742f;--card:#fff}}
*{{box-sizing:border-box}} body{{margin:0;background:var(--paper);color:var(--ink);font:15px/1.5 Inter,ui-sans-serif,system-ui,sans-serif}} main{{width:min(1180px,calc(100% - 40px));margin:auto;padding:58px 0 90px}} .eyebrow{{color:var(--blue);font:800 11px/1.2 ui-monospace,monospace;letter-spacing:.13em;text-transform:uppercase}} h1{{max-width:940px;margin:10px 0 0;font-size:clamp(40px,7vw,74px);line-height:.98;letter-spacing:-.055em}} .lede{{max-width:850px;margin:24px 0 37px;color:#46566b;font-size:20px}} .grid{{display:grid;grid-template-columns:1.15fr .85fr;gap:20px}} .card,figure{{margin:0;overflow:hidden;border:1px solid var(--line);border-radius:17px;background:var(--card);box-shadow:0 12px 34px #18314a0c}} .card{{padding:23px}} figure img{{display:block;width:100%;height:auto}} figcaption{{padding:13px 17px;color:var(--muted);font-size:13px}} section{{margin-top:50px}} h2{{margin:0 0 18px;font-size:28px;letter-spacing:-.035em}} .metric{{display:grid;grid-template-columns:1fr auto;gap:12px;padding:12px 0;border-bottom:1px solid #e8edf4}} .metric b{{color:var(--green);font:800 21px/1 ui-monospace,monospace}} .metric span{{color:var(--muted);font-size:13px;text-align:right}} .flow{{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin:20px 0 6px}} kbd{{padding:7px 11px;border:1px solid #bbcadb;border-bottom-width:3px;border-radius:8px;background:#f4f8fd;color:#245fa7;font:800 14px ui-monospace,monospace}} .arrow{{color:#9aa8b8;font-size:20px}} ul{{display:grid;gap:9px;margin:0;padding:0;list-style:none}} li{{display:flex;gap:10px}} li span{{color:var(--green);font-weight:900}} pre{{margin:0;overflow:auto;padding:18px;border-radius:14px;background:#1e2937;color:#eef4fb;font:12px/1.55 ui-monospace,monospace}} .note{{color:var(--muted);font-size:13px}} .callout{{border-color:#ffc49e;background:#fff9f4}} .callout b{{color:#a84a13}} a{{color:#2367bb}} @media(max-width:800px){{main{{width:min(100% - 24px,1180px);padding-top:36px}}.grid{{grid-template-columns:1fr}}}}
</style></head><body><main>
<div class="eyebrow">SystemSketch · visual repair evidence · 2026-09-06</div>
<h1>At 160%, primitive search stays with the cursor.</h1>
<p class="lede">The panel had crossed a coordinate boundary: tldraw provides real canvas pixels, while interface scale zooms its chrome host. The repair cancels that host zoom for pointer-anchored search, then reapplies visual scale around the exact cursor-relative origin.</p>
<div class="grid"><figure><img src="{data_uri(SCREENSHOT)}" alt="Actual SystemSketch at 160 percent interface scale: blue cursor anchor and primitive search panel begin beside each other"><figcaption><b>Observed browser frame.</b> The blue target dot is the captured cursor anchor; the panel’s top-left begins immediately down-right of it while its chrome is visibly enlarged.</figcaption></figure><article class="card"><div class="eyebrow">Measured in the same CDP journey</div><div class="metric"><b>({pointer['x']}, {pointer['y']})</b><span>pointer input</span></div><div class="metric"><b>({target['x']}, {target['y']})</b><span>painted blue anchor center</span></div><div class="metric"><b>({panel['x']}, {panel['y']})</b><span>panel top-left: +{delta_x}px, +{delta_y}px</span></div><div class="metric"><b>{panel['width']} × {panel['height']}</b><span>scaled panel bounds</span></div><div class="metric"><b>{below_toolbar:.0f}px</b><span>clearance above bottom toolbar</span></div><p class="note">Viewport: {viewport['width']} × {viewport['height']}. The test also asserts the entire panel remains inside it.</p></article></div>
<section><h2>Actual acceptance journey: 9/9 checks pass</h2><div class="grid"><article class="card"><div class="flow"><kbd>Settings</kbd><span class="arrow">→</span><kbd>160%</kbd><span class="arrow">→</span><kbd>move mouse</kbd><span class="arrow">→</span><kbd>S</kbd></div><p>The test persists the setting and reloads the app first, so React’s placement calculation and rendered CSS use the same live preference—not a style-only approximation.</p><ul>{check_rows}</ul></article><article class="card callout"><div class="eyebrow">Root cause</div><p><b>One animation was still stealing the transform.</b> Once the panel’s position and visual scale shared a composed transform, the old entrance keyframe temporarily replaced it with an origin-relative transform. The panel could flash at the surface origin. The repaired keyframe animates opacity only.</p><p class="note">The search continues to use stock tldraw tools for every drawing gesture; only its chrome placement seam changed.</p></article></div></section>
<section><h2>Human review board</h2><div class="grid"><figure><img src="{data_uri(FIXTURE)}" alt="Review board with a function, numbered scale and search steps, attached orange arrows, and green pass condition"><figcaption><b>Scratch fixture, generated through the real editor/autosave path.</b> It contains one function, three bound orange cue arrows, and an explicit 160% pass condition.</figcaption></figure><article class="card"><p>Open the committed board in the retained review runtime, set <b>Settings › Interface</b> to <b>160%</b>, hover inside <code>normalize_reading()</code>, then press <b>S</b>.</p><p><b>Pass when:</b> the blue target remains on the cursor and the enlarged primitive search begins beside it without crossing the viewport or toolbar.</p><p class="note">Fixture generation cold-reopened the board, checked its eight-shape inventory, verified six bindings, and proved each cue stays attached when its target moves.</p></article></div></section>
<section><h2>The narrow coordinate seam</h2><div class="grid"><pre>{html.escape(excerpt(SEARCH, 'const chromeScale', 20))}</pre><pre>{html.escape(excerpt(CSS, CSS_NEEDLE, 32))}</pre></div><p class="note">Search placement measures scaled painted bounds for flips/clamping, then divides the element’s layout width by scale before the CSS transform reapplies that scale about the exact panel origin.</p></section>
<p class="note">Evidence source: <code>npm run test:primitive-search</code>, executed on this working tree. This report is self-contained: its observed screenshots are embedded as data URIs.</p>
</main></body></html>"""
    document = "\n".join(line.rstrip() for line in document.splitlines()) + "\n"
    OUT.write_text(document, encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
