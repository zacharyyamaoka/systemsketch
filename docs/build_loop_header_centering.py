#!/usr/bin/env python3
"""Build the self-contained Loop header-centering implementation gallery."""

from __future__ import annotations

import base64
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "loop-header-centering-2026-09-03.html"
FIXTURE = ROOT / "sketches" / "review" / "loop-header-centering.png"
ACCEPTANCE = ROOT / "docs" / "assets" / "loop-region-acceptance.png"
MODEL = ROOT / "src" / "loop" / "loopModel.ts"
SMOKE = ROOT / "tests" / "loop_region_smoke.mjs"


def image_data(path: Path) -> str:
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def main() -> None:
    model = MODEL.read_text(encoding="utf-8")
    smoke = SMOKE.read_text(encoding="utf-8")
    assert "function titleWidth" in model
    assert "centredW >= titleWidth(props.title)" in model
    assert "L10b" in smoke
    assert FIXTURE.is_file() and ACCEPTANCE.is_file()

    compact = image_data(FIXTURE)
    expanded = image_data(ACCEPTANCE)
    OUT.write_text(
        f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Loop header centering · SystemSketch</title>
<style>
:root {{ color-scheme:light; --ink:#172033; --muted:#61708a; --line:#dce3ee; --paper:#f6f8fc; --blue:#2779e6; --green:#35a66b; }}
* {{ box-sizing:border-box }} body {{ margin:0; background:var(--paper); color:var(--ink); font:16px/1.5 Inter,ui-sans-serif,system-ui,sans-serif }} main {{ width:min(1240px,calc(100% - 48px)); margin:44px auto 72px }}
.eyebrow {{ color:var(--blue); font-size:12px; font-weight:800; letter-spacing:.12em; text-transform:uppercase }} h1 {{ max-width:850px; margin:8px 0 12px; font-size:clamp(32px,6vw,62px); letter-spacing:-.055em; line-height:1.02 }} .lede {{ max-width:780px; margin:0; color:var(--muted); font-size:19px }}
.facts {{ display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin:32px 0 40px }} .fact {{ padding:20px; border:1px solid var(--line); border-radius:16px; background:#fff }} .fact b {{ display:block; margin-bottom:5px; font-size:20px }} .fact span {{ color:var(--muted) }}
.comparison {{ display:grid; grid-template-columns:1fr 1fr; gap:22px }} figure {{ margin:0; overflow:hidden; border:1px solid var(--line); border-radius:18px; background:#fff; box-shadow:0 12px 35px #263b5b12 }} figure img {{ display:block; width:100%; background:#fff }} figcaption {{ padding:17px 19px 20px; color:var(--muted) }} figcaption b {{ color:var(--ink) }}
.detail {{ display:grid; grid-template-columns:1.1fr .9fr; gap:36px; align-items:start; margin-top:44px; padding:30px; border-radius:20px; background:#10233e; color:#eef5ff }} .detail h2 {{ margin:0 0 12px; font-size:26px; letter-spacing:-.03em }} .detail p {{ margin:0; color:#c9d7e9 }} code {{ padding:17px; overflow:auto; border:1px solid #38506f; border-radius:12px; background:#091727; color:#b8d8ff; font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace }}
.proof {{ margin-top:34px; padding:24px; border-left:4px solid var(--green); border-radius:0 14px 14px 0; background:#fff }} .proof b {{ color:#18814e }} a {{ color:inherit }} .inline {{ display:inline; padding:0; border:0; background:none; color:inherit; font:inherit }}
@media(max-width:760px) {{ main {{ width:min(100% - 28px,1240px); margin-top:28px }} .facts,.comparison,.detail {{ grid-template-columns:1fr }} h1 {{ font-size:40px }} }}
</style></head><body><main>
<div class="eyebrow">SystemSketch · Loop region · 2026-09-03</div>
<h1>Centre the operator title when the Loop has earned the room.</h1>
<p class="lede">A compact Loop keeps a long title in the free header lane, away from its typed ports. Once a resize can show the complete title inside a protected centre lane, it returns to the actual midpoint of the Loop.</p>
<div class="facts"><div class="fact"><b>Protected compact lane</b><span>No overlap with the Poses/Pose labels or the live turn chip.</span></div><div class="fact"><b>True geometric centre</b><span>The title's rendered box is centred on the Loop, not merely centred in leftover space.</span></div><div class="fact"><b>Full text threshold</b><span>It centres only when the whole operator label fits—never by hiding the failure behind an ellipsis.</span></div></div>
<section class="comparison"><figure><img src="{compact}" alt="Compact Loop review fixture: For each pose uses the safe header lane beside Poses and Pose"><figcaption><b>Compact before.</b> The review fixture begins at 340 canvas units, where <code class="inline">For each pose</code> deliberately stays in the free lane.</figcaption></figure><figure><img src="{expanded}" alt="Expanded SystemSketch Loop: For each pose is centred above its open body"><figcaption><b>Expanded after.</b> In the real browser journey, a wider Loop gives the full title space and it lands at the Loop midpoint.</figcaption></figure></section>
<section class="detail"><div><h2>One layout function, two honest states.</h2><p>The title continues to use the existing header reservation, so no port label or status chip loses its space. The only new decision is whether the reserved band includes enough room symmetrically around the Loop's centre to render the complete monospace title.</p></div><code>centredW = 2 × min(centre − protectedLeft, protectedRight − centre)&#10;&#10;if centredW ≥ fullTitleWidth:&#10;  title.x = Loop.width / 2&#10;else:&#10;  title.x = compactLaneCentre</code></section>
<section class="proof"><b>Browser proof · 17/17 checks passed.</b><br>The real Loop journey types <em>For each pose</em> through the inspector after creating and wiring the Loop, then measures the painted title box against the painted Loop box. The targeted test is <code class="inline">L10b</code>; the review fixture was generated through the real autosave/cold-reopen path and its cue arrows were moved live to verify their bindings.</section>
<p style="margin-top:28px;color:var(--muted)">Human review board: <a href="../sketches/review/loop-header-centering.systemsketch">loop-header-centering.systemsketch</a> · Generated from <code class="inline">docs/build_loop_header_centering.py</code>.</p>
</main></body></html>""",
        encoding="utf-8",
    )
    print(OUT)


if __name__ == "__main__":
    main()
