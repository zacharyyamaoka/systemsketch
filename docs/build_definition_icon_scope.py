#!/usr/bin/env python3
"""Build the self-contained Definition occurrence icon-scope gallery."""

from __future__ import annotations

import base64
import html
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
ASSETS = DOCS / "assets"
SOURCE = ROOT / "src/blocks/definitions/definitionLinking.ts"
SMOKE = ROOT / "tests/definition_linking_smoke.mjs"
FIXTURE_SMOKE = ROOT / "tests/definition_icon_scope_fixture_smoke.mjs"
FIXTURE = ROOT / "sketches/review/definition-icon-scope.systemsketch"
RESULTS = ASSETS / "definition-icon-scope-fixture-driven-2026-09-06.json"
OUTPUT = DOCS / "definition-icon-scope-2026-09-06.html"


def data_uri(path: Path, mime: str) -> str:
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


def main() -> None:
    source = SOURCE.read_text(encoding="utf-8")
    smoke = SMOKE.read_text(encoding="utf-8")
    fixture_smoke = FIXTURE_SMOKE.read_text(encoding="utf-8")
    fixture = FIXTURE.read_text(encoding="utf-8")
    results = json.loads(RESULTS.read_text(encoding="utf-8"))

    shared_start = source.index("interface SharedDefinitionProps")
    shared_end = source.index("function sameJson", shared_start)
    shared_section = source[shared_start:shared_end]
    assert "icon:" not in shared_section
    assert "icon: source.icon" not in source
    assert "an icon is visual chrome" in source
    assert "choosing an icon in the inspector changes only the selected occurrence" in smoke
    assert "the inspector changes only the selected shared-Definition occurrence icon" in fixture_smoke
    assert '"definitionId": "definition-request-pipeline"' in fixture
    assert results["before"]["ingest"]["icon"] == "Workflow"
    assert results["before"]["parse"]["icon"] == "Braces"
    assert results["after"]["ingest"]["icon"] == "Terminal"
    assert results["after"]["parse"]["icon"] == "Braces"
    assert results["after"]["cueArrowsBoundToIngest"] == 1
    assert results["consoleErrors"] == []

    hero_mp4 = data_uri(ASSETS / "definition-icon-scope-hero-2026-09-06.mp4", "video/mp4")
    hero_gif = data_uri(ASSETS / "definition-icon-scope-hero-2026-09-06.gif", "image/gif")
    fixture_image = data_uri(ROOT / "sketches/review/definition-icon-scope.png", "image/png")
    driven_image = data_uri(ASSETS / "definition-icon-scope-fixture-driven-2026-09-06.png", "image/png")
    before = results["before"]
    after = results["after"]

    document = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Definition icon scope · SystemSketch</title>
<style>
:root{{color-scheme:dark;--ink:#f4f7fb;--muted:#b2bfd2;--bg:#07111f;--card:#101e33;--line:#294768;--blue:#7ab4ff;--green:#76daa0;--orange:#ffb36b;--red:#ff9c9c}}*{{box-sizing:border-box}}body{{margin:0;background:radial-gradient(circle at 12% -8%,#284d80 0,transparent 38rem),var(--bg);color:var(--ink);font:16px/1.55 Inter,ui-sans-serif,system-ui,sans-serif}}main{{width:min(1180px,calc(100% - 36px));margin:auto;padding:54px 0 78px}}.eyebrow{{color:var(--blue);font-size:.76rem;font-weight:850;letter-spacing:.14em;text-transform:uppercase}}h1{{max-width:950px;margin:.14em 0;font-size:clamp(2.7rem,7vw,6rem);line-height:.94;letter-spacing:-.064em}}.lead{{max-width:840px;color:#d5deec;font-size:1.18rem}}.hero,.panel,.fact{{background:linear-gradient(145deg,#152943,#0c1829);border:1px solid var(--line);border-radius:20px}}.hero{{overflow:hidden;margin:30px 0 18px}}video,.fallback{{display:block;width:100%;background:#f6f8fb}}video{{aspect-ratio:16/9;object-fit:cover}}.caption{{padding:13px 17px;color:var(--muted);font-size:.88rem}}.facts,.grid,.flow{{display:grid;gap:16px}}.facts{{grid-template-columns:repeat(3,1fr);margin:18px 0 34px}}.fact{{padding:18px}}.fact b{{display:block;color:var(--green);font-size:1.9rem;letter-spacing:-.04em}}.fact span{{color:var(--muted)}}.flow{{grid-template-columns:1fr auto 1fr;align-items:center;margin:24px 0}}.node{{padding:17px;border:1px solid var(--line);border-radius:15px;background:#0b192b}}.node b{{display:block;color:var(--blue);margin-bottom:4px}}.node.bad b{{color:var(--red)}}.arrow{{color:var(--orange);font-size:2rem}}.grid{{grid-template-columns:1fr 1fr}}.panel{{padding:21px;overflow:hidden}}h2{{font-size:1.36rem;letter-spacing:-.03em;margin:0 0 8px}}p{{color:var(--muted)}}figure{{margin:15px 0 0;border:1px solid var(--line);border-radius:13px;overflow:hidden;background:#f7f9fb}}figure img{{display:block;width:100%}}figcaption{{padding:11px 13px;background:#0e1b2e;color:var(--muted);font-size:.86rem}}.checks{{padding-left:20px}}.checks li+li{{margin-top:8px}}code{{padding:2px 5px;border-radius:5px;background:#1a2f4c;color:#dbe9ff}}table{{border-collapse:collapse;width:100%;font-size:.94rem}}th,td{{padding:11px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}}th{{color:var(--blue)}}.result{{color:var(--green);font-weight:750}}footer{{margin-top:30px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font-size:.86rem}}@media(max-width:760px){{main{{width:min(100% - 24px,1180px);padding-top:32px}}.facts,.grid,.flow{{grid-template-columns:1fr}}.arrow{{transform:rotate(90deg);justify-self:center}}}}
</style></head><body><main>
<div class="eyebrow">SystemSketch · Definition linking repair · 2026-09-06</div>
<h1>An icon belongs to the Block you changed.</h1>
<p class="lead">Definition linking now shares the semantic body without treating a canvas icon as semantic data. Different named occurrences may keep their own visual cue, even when they reference the same Definition.</p>
<section class="hero"><video controls autoplay muted loop playsinline poster="{fixture_image}"><source src="{hero_mp4}" type="video/mp4"><img class="fallback" src="{hero_gif}" alt="Actual review journey showing independent icons on shared Definition occurrences"></video><div class="caption">Actual real-browser review journey · the prepared board begins with Workflow and Braces, then the selected occurrence becomes Terminal while its peer remains Braces. A GIF fallback is embedded for browsers without video.</div></section>
<section class="facts"><div class="fact"><b>3/3</b><span>real-fixture checks passed</span></div><div class="fact"><b>0</b><span>browser console errors</span></div><div class="fact"><b>1 body</b><span>shared Definition identity in the review board</span></div></section>
<section class="flow"><div class="node bad"><b>Previous boundary</b>Icon was included in the shared-property signature, so a local inspector choice fanned out to every occurrence.</div><div class="arrow">→</div><div class="node"><b>Corrected boundary</b>Icon is omitted from Definition synchronization. Description, ports, notes, size, and stock configuration still synchronize.</div></section>
<section class="grid"><article class="panel"><h2>Prepared human check</h2><p>Both Blocks deliberately reference <code>definition-request-pipeline</code>, start with different names and glyphs, and have a visible on-canvas pass condition.</p><figure><img src="{fixture_image}" alt="Definition icon scope review board before editing"><figcaption><strong>Before.</strong> <code>read()</code> carries Workflow; <code>parse()</code> carries Braces.</figcaption></figure></article><article class="panel"><h2>Observed result</h2><p>The test moves the real target (preserving its bound orange cue), chooses Terminal through the Details inspector, then verifies the peer still carries Braces.</p><figure><img src="{driven_image}" alt="Driven Definition icon scope review board after selecting Terminal"><figcaption><strong>After.</strong> The moved <code>read()</code> occurrence is Terminal; <code>parse()</code> remains Braces.</figcaption></figure></article></section>
<section class="panel" style="margin-top:16px"><h2>Recorded proof</h2><table><thead><tr><th>Occurrence</th><th>Before</th><th>After inspector choice</th></tr></thead><tbody><tr><td><code>read()</code></td><td>{html.escape(before['ingest']['icon'])}</td><td class="result">{html.escape(after['ingest']['icon'])}</td></tr><tr><td><code>parse()</code></td><td>{html.escape(before['parse']['icon'])}</td><td class="result">{html.escape(after['parse']['icon'])} (unchanged)</td></tr><tr><td>Step cue binding</td><td>{before['cueArrowsBoundToIngest']} bound arrow</td><td class="result">{after['cueArrowsBoundToIngest']} bound arrow after a real target drag</td></tr></tbody></table></section>
<section class="grid" style="margin-top:16px"><article class="panel"><h2>Regression coverage</h2><ul class="checks"><li>The original Definition smoke chooses an icon through the real inspector and checks the sibling stays unchanged.</li><li>The saved review fixture performs the same interaction after moving its primary Block.</li><li>Semantic description edits still converge across the Definition, proving the repair narrows only presentation scope.</li></ul></article><article class="panel"><h2>Deliberate rule</h2><p>The seam now documents why: a canvas icon is occurrence chrome, not Definition content. This preserves visual differentiation without weakening the linked semantic body.</p><p>That matches the product’s semantic/presentation boundary: the Definition owns behavior; an occurrence owns how it is represented on this canvas.</p></article></section>
<footer>Generated from current source plus real-browser evidence by <code>docs/build_definition_icon_scope.py</code>. The guided board is <code>sketches/review/definition-icon-scope.systemsketch</code>.</footer>
</main></body></html>"""
    OUTPUT.write_text(document, encoding="utf-8")
    print(f"wrote {OUTPUT.relative_to(ROOT)} ({len(document):,} bytes)")


if __name__ == "__main__":
    main()
