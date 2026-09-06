#!/usr/bin/env python3
"""Build the self-contained Branch interior-cable selection gallery."""

from __future__ import annotations

import base64
import html
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
ASSETS = DOCS / "assets"
OUTPUT = DOCS / "branch-edge-selection-2026-09-06.html"
ARM_UTIL = ROOT / "src" / "branch" / "BranchArmShapeUtil.tsx"
UNIT = ROOT / "src" / "branch" / "BranchArmShapeUtil.test.ts"
SMOKE = ROOT / "tests" / "branch_edge_selection_smoke.mjs"
FIXTURE_SMOKE = ROOT / "tests" / "branch_edge_selection_fixture_smoke.mjs"
FIXTURE = ROOT / "sketches" / "review" / "branch-edge-selection.systemsketch"
FIXTURE_IMAGE = ROOT / "sketches" / "review" / "branch-edge-selection.png"
DRIVEN = ASSETS / "branch-edge-selection-fixture-driven-2026-09-06.png"
RESULTS = ASSETS / "branch-edge-selection-fixture-driven-2026-09-06.json"
HERO_MP4 = ASSETS / "branch-edge-selection-hero-2026-09-06.mp4"
HERO_GIF = ASSETS / "branch-edge-selection-hero-2026-09-06.gif"


def data_uri(path: Path, mime: str) -> str:
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


def main() -> None:
    arm_source = ARM_UTIL.read_text(encoding="utf-8")
    unit = UNIT.read_text(encoding="utf-8")
    smoke = SMOKE.read_text(encoding="utf-8")
    fixture_smoke = FIXTURE_SMOKE.read_text(encoding="utf-8")
    fixture = FIXTURE.read_text(encoding="utf-8")
    results = json.loads(RESULTS.read_text(encoding="utf-8"))

    assert "new Polyline2d" in arm_source
    assert "override getClipPath" in arm_source
    assert "cable owned by the Branch" in arm_source
    assert "open perimeter" in unit
    assert "semantic cable selection through the arm frame" in smoke
    assert "connection selection from its painted interior" in fixture_smoke
    assert results == {
        "cueFollowsMovedTarget": True,
        "selectedShape": "shape:cable",
        "consoleErrors": [],
    }
    assert "Click the blue wire inside the open if arm" in fixture
    assert '"type": "connection"' in fixture

    hero_mp4 = data_uri(HERO_MP4, "video/mp4")
    hero_gif = data_uri(HERO_GIF, "image/gif")
    fixture_image = data_uri(FIXTURE_IMAGE, "image/png")
    driven = data_uri(DRIVEN, "image/png")

    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Branch interior cable selection · SystemSketch</title>
<style>
:root{{--bg:#07111f;--panel:#102139;--panel2:#0b182a;--line:#294867;--ink:#f3f7fc;--muted:#b2c0d2;--blue:#78b3ff;--green:#75daa2;--orange:#ffb56c;--red:#ff9a9a}}*{{box-sizing:border-box}}body{{margin:0;background:radial-gradient(circle at 88% -8%,#28517d 0,transparent 37rem),var(--bg);color:var(--ink);font:16px/1.55 Inter,ui-sans-serif,system-ui,sans-serif}}main{{width:min(1180px,calc(100% - 36px));margin:auto;padding:54px 0 78px}}.eyebrow{{color:var(--blue);font-size:.76rem;letter-spacing:.14em;font-weight:800;text-transform:uppercase}}h1{{margin:.14em 0;font-size:clamp(2.8rem,7vw,6.3rem);line-height:.92;letter-spacing:-.064em;max-width:990px}}.lead{{max-width:830px;color:#d4deeb;font-size:1.18rem}}.hero,.panel,.fact{{border:1px solid var(--line);border-radius:20px;background:linear-gradient(145deg,#152b48,#0b1728)}}.hero{{overflow:hidden;margin:30px 0 18px}}video,.fallback{{display:block;width:100%;background:#eef2f6}}video{{aspect-ratio:5/3;object-fit:cover}}.caption{{padding:13px 17px;color:var(--muted);font-size:.88rem}}.facts,.grid,.flow{{display:grid;gap:16px}}.facts{{grid-template-columns:repeat(3,1fr);margin:18px 0 34px}}.fact{{padding:18px}}.fact b{{display:block;color:var(--green);font-size:1.9rem;letter-spacing:-.04em}}.fact span{{color:var(--muted)}}.flow{{grid-template-columns:1fr auto 1fr;align-items:center;margin:24px 0}}.node{{padding:18px;border:1px solid var(--line);border-radius:15px;background:#0b1a2d}}.node b{{display:block;margin-bottom:4px;color:var(--blue)}}.node.bad b{{color:var(--red)}}.arrow{{font-size:2rem;color:var(--orange)}}.grid{{grid-template-columns:1fr 1fr}}.panel{{padding:21px;overflow:hidden}}h2{{font-size:1.36rem;letter-spacing:-.03em;margin:0 0 8px}}p{{color:var(--muted)}}figure{{margin:15px 0 0;border:1px solid var(--line);border-radius:13px;overflow:hidden;background:#f8fafc}}figure img{{display:block;width:100%}}figcaption{{padding:11px 13px;background:#0d1b2e;color:var(--muted);font-size:.86rem}}ul{{padding-left:20px}}li+li{{margin-top:8px}}code{{padding:2px 5px;border-radius:5px;background:#1b3452;color:#dceaff}}table{{width:100%;border-collapse:collapse;font-size:.94rem}}th,td{{padding:11px 8px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}}th{{color:var(--blue)}}.ok{{color:var(--green);font-weight:750}}.seam{{border-left:3px solid var(--orange);padding:12px 15px;border-radius:0 12px 12px 0;background:#0b192b}}footer{{margin-top:32px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font-size:.86rem}}@media(max-width:760px){{main{{width:min(100% - 24px,1180px);padding-top:32px}}.facts,.grid,.flow{{grid-template-columns:1fr}}.arrow{{transform:rotate(90deg);justify-self:center}}}}
</style></head><body><main>
<div class="eyebrow">SystemSketch · Branch interaction repair · 2026-09-06</div>
<h1>A cable inside a Branch is an edge, not empty canvas.</h1>
<p class="lead">Invisible Branch-arm frames still crop ordinary arm content, but their hollow interior no longer ends tldraw’s search before it reaches a semantic cable owned by the surrounding Branch. Clicking the painted wire now selects that connection and opens its inspector.</p>
<section class="hero"><video controls autoplay muted loop playsinline poster="{fixture_image}"><source src="{hero_mp4}" type="video/mp4"><img class="fallback" src="{hero_gif}" alt="Actual browser journey clicking a cable inside a Branch arm and opening the Connection inspector"></video><div class="caption">Seven-second muted loop from the real saved-fixture journey: prepared Branch → click the wire’s painted interior → selected cable with its live Connection inspector. A GIF fallback is embedded for browsers without video.</div></section>
<section class="facts"><div class="fact"><b>1 click</b><span>selects the connection from its visible interior</span></div><div class="fact"><b>0</b><span>browser console errors in the saved-fixture journey</span></div><div class="fact"><b>9 shapes</b><span>cold-reopened review board, including two derived arm frames</span></div></section>
<section class="flow"><div class="node bad"><b>Before</b>The invisible arm frame used a closed rectangle for both clipping and hit testing. tldraw correctly stopped at the frame’s hollow face, returning no wire.</div><div class="arrow">→</div><div class="node"><b>Now</b>The arm exposes an open perimeter for hit testing and an explicit rectangular clip path for descendants. The cable can win the interior hit without changing the arm’s crop boundary.</div></section>
<section class="grid"><article class="panel"><h2>Prepared human check</h2><p>The saved board keeps a real <code>connection</code> as a direct Branch child and two Blocks in the <code>if</code> arm. The orange cue names the exact gesture.</p><figure><img src="{fixture_image}" alt="Branch cable-selection review board before clicking"><figcaption><strong>Before.</strong> The blue wire sits inside the open arm; no inspector is open.</figcaption></figure></article><article class="panel"><h2>Observed result</h2><p>The fixture first moves its target Block to prove the orange cue remains bound, then clicks the wire’s painted midpoint. The selected object is the semantic cable, not either Block.</p><figure><img src="{driven}" alt="Selected Branch cable with Connection inspector open"><figcaption><strong>After.</strong> Blue selection handles and the Connection inspector make the successful hit visible.</figcaption></figure></article></section>
<section class="panel" style="margin-top:16px"><h2>What stayed intact</h2><table><thead><tr><th>Contract</th><th>Evidence</th></tr></thead><tbody><tr><td>Arm clipping</td><td class="ok">The focused arm-frame browser suite still passes all 8 checks, including clipping at the next arm and fold/unfold visibility.</td></tr><tr><td>Connection selection</td><td class="ok">A fresh real-browser regression samples the SVG wire itself, clicks it, and asserts <code>shape:edge-within-branch</code> is selected.</td></tr><tr><td>Review cue relationship</td><td class="ok">The saved fixture moves its target through a real drag; its bound orange arrow follows before the cable click.</td></tr></tbody></table></section>
<section class="grid" style="margin-top:16px"><article class="panel"><h2>The deliberate seam</h2><div class="seam">The frame must remain frame-like for stock clipping and containment, so this is not a custom hit-test fork. Its <code>getClipPath()</code> now declares the rectangular crop independently from the open perimeter returned by <code>getGeometry()</code>.</div></article><article class="panel"><h2>Regression coverage</h2><ul><li><code>npm run test:branch-edge-selection</code> proves the edge wins an actual canvas click.</li><li><code>npm run test:branch-edge-selection-fixture</code> drives the saved review board, verifies cue binding, selected cable, inspector, and no console errors.</li><li><code>npm run test:branch-frames</code> confirms the structural arm behavior stays stock-supported.</li></ul></article></section>
<footer>Generated from the current source and real-browser evidence by <code>docs/build_branch_edge_selection.py</code>. The guided board is <code>sketches/review/branch-edge-selection.systemsketch</code>.</footer>
</main></body></html>"""
    OUTPUT.write_text(page, encoding="utf-8")
    print(f"wrote {OUTPUT.relative_to(ROOT)} ({len(page):,} bytes)")


if __name__ == "__main__":
    main()
