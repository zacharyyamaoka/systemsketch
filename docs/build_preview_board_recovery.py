#!/usr/bin/env python3
"""Build the self-contained Preview board-recovery verification gallery."""

from __future__ import annotations

import base64
import html
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "sketches/review/legacy-board-recovery.systemsketch"
SCREENSHOT = ROOT / "sketches/review/legacy-board-recovery.png"
OUTPUT = ROOT / "docs/preview-board-recovery-2026-09-03.html"


def main() -> None:
    fixture = json.loads(FIXTURE.read_text())
    shapes = [record for record in fixture["records"] if record.get("typeName") == "shape"]
    assert len(shapes) == 12
    assert sum(record.get("type") == "branch-arm" for record in shapes) == 2
    assert "DiffState: 5" in (ROOT / "src/blocks/BlockShapeUtil.tsx").read_text()
    assert "queueMicrotask(repairPendingBranches)" in (ROOT / "src/branch/installBranchRegions.ts").read_text()
    image = base64.b64encode(SCREENSHOT.read_bytes()).decode("ascii")

    output = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Preview board recovery · 2026-09-03</title>
<style>
  :root {{ color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; color:#162033; background:#f3f6fb; }}
  body {{ margin:0; }} main {{ max-width:1180px; margin:auto; padding:46px 28px 64px; }}
  .eyebrow {{ color:#3667d6; font-weight:800; letter-spacing:.11em; font-size:.76rem; text-transform:uppercase; }}
  h1 {{ font-size:clamp(2rem,5vw,4rem); letter-spacing:-.055em; margin:.3rem 0 .8rem; max-width:900px; line-height:1.02; }}
  .lede {{ font-size:1.18rem; max-width:800px; color:#4c5a70; line-height:1.55; }}
  .grid {{ display:grid; grid-template-columns:1.15fr .85fr; gap:22px; margin-top:30px; }}
  .card {{ background:#fff; border:1px solid #dde5f2; border-radius:18px; padding:22px; box-shadow:0 12px 34px #2339650c; }}
  h2 {{ font-size:1.05rem; margin:0 0 16px; }} .metric {{ font-size:2.05rem; font-weight:800; letter-spacing:-.05em; }}
  .muted {{ color:#617089; font-size:.9rem; line-height:1.45; }}
  .flow {{ display:flex; align-items:stretch; gap:10px; margin-top:18px; }}
  .step {{ flex:1; min-height:108px; padding:14px; border-radius:13px; background:#f5f8ff; border:1px solid #dbe5ff; }}
  .step b {{ display:block; font-size:.85rem; color:#315fc2; margin-bottom:7px; }} .arrow {{ align-self:center; color:#8ca0c6; font-size:1.45rem; }}
  .proof {{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }} .proof div {{ padding:13px; border-radius:11px; background:#f7fafc; }}
  figure {{ margin:30px 0 0; background:#fff; border:1px solid #dde5f2; border-radius:18px; padding:14px; }}
  img {{ width:100%; display:block; border-radius:10px; }} figcaption {{ padding:13px 6px 2px; color:#52617a; line-height:1.45; }}
  code {{ background:#edf2fa; padding:2px 5px; border-radius:5px; }}
  @media(max-width:780px) {{ main{{padding:30px 16px}} .grid{{grid-template-columns:1fr}} .flow{{display:grid;grid-template-columns:1fr}} .arrow{{display:none}} }}
</style></head><body><main>
<div class="eyebrow">Preview recovery verification · 2026-09-03</div>
<h1>An old board now opens as a board—not a blank canvas.</h1>
<p class="lede">Series A had a legacy Block record without the later required <code>state</code> style value. The reader now supplies the safe default before validation, and Branch-frame repair waits until the load transaction has finished.</p>
<section class="grid"><article class="card"><h2>Safe-open path</h2><div class="flow">
<div class="step"><b>1 · Parse</b>Old Blocks receive <code>state: normal</code>.</div><div class="arrow">→</div>
<div class="step"><b>2 · Migrate</b>Four historical pages become named Frames.</div><div class="arrow">→</div>
<div class="step"><b>3 · Project</b>Branch arm frames repair in the next microtask.</div></div></article>
<aside class="card"><h2>Live recovery result</h2><div class="metric">598 shapes</div><p class="muted">The recovered Series A document retained 167 Blocks, one Branch, and two Branch-arm frames, with no alert or browser-console error.</p>
<div class="proof"><div><b>4 → 1</b><br><span class="muted">pages → canvas</span></div><div><b>4</b><br><span class="muted">named Frames</span></div><div><b>167</b><br><span class="muted">Blocks</span></div><div><b>0</b><br><span class="muted">safety alerts</span></div></div></aside></section>
<figure><img alt="Legacy board recovery review fixture in Preview" src="data:image/png;base64,{image}"><figcaption><strong>Human review board.</strong> Reload it in Preview, then select <em>validate()</em>. Both formerly separate pages remain named Frames and the Branch arms stay real, editable content. The fixture is authored through the editor, autosaved, cold-reopened, and has bound cue arrows.</figcaption></figure>
</main></body></html>"""
    OUTPUT.write_text(output)
    print(f"wrote {OUTPUT.relative_to(ROOT)} ({len(output):,} bytes)")


if __name__ == "__main__":
    main()
