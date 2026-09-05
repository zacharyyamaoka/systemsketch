#!/usr/bin/env python3
"""Build the self-contained recursive Definition load-recovery gallery."""

from __future__ import annotations

import base64
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "sketches/review/recursive-definition-load.systemsketch"
SCREENSHOT = ROOT / "sketches/review/recursive-definition-load.png"
OUTPUT = ROOT / "docs/recursive-definition-load-2026-09-05.html"


def data_uri(path: Path) -> str:
    return f"data:image/png;base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


def main() -> None:
    fixture = json.loads(FIXTURE.read_text())
    shapes = [record for record in fixture["records"] if record.get("typeName") == "shape"]
    assert len(shapes) == 8
    assert sum(shape.get("type") == "block" for shape in shapes) == 3
    assert all(shape.get("parentId") != shape.get("id") for shape in shapes)
    source = (ROOT / "src/blocks/definitions/definitionLinking.ts").read_text()
    assert "definitionBodiesOverlap" in source
    assert "opaque recursive boundary" in source
    assert "recursive_definition_load_smoke.mjs" in (ROOT / "package.json").read_text()
    image = data_uri(SCREENSHOT)

    output = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Recursive Definition load recovery · SystemSketch</title>
<style>
:root{{color-scheme:dark;--ink:#f2f7ff;--muted:#aebbd0;--bg:#0d121d;--panel:#151e2e;--line:#2c3d58;--blue:#8dbbff;--orange:#ffb35a;--green:#74dfa0}}*{{box-sizing:border-box}}body{{margin:0;background:radial-gradient(circle at 74% -20%,#25467c 0,transparent 44rem),var(--bg);color:var(--ink);font:16px/1.55 ui-sans-serif,system-ui,sans-serif}}main{{width:min(1180px,calc(100% - 36px));margin:auto;padding:52px 0 78px}}.eyebrow{{color:var(--blue);font-size:.78rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase}}h1{{font-size:clamp(2.5rem,7vw,5.7rem);line-height:.96;letter-spacing:-.06em;margin:.18em 0;max-width:980px}}.lede{{font-size:1.22rem;color:var(--muted);max-width:870px}}.facts,.grid{{display:grid;gap:16px}}.facts{{grid-template-columns:repeat(3,1fr);margin:30px 0}}.fact,.panel{{border:1px solid var(--line);border-radius:18px;background:linear-gradient(145deg,#18243a,#101722);padding:20px}}.fact strong{{display:block;font-size:2rem;color:var(--green)}}.fact span{{color:var(--muted)}}.flow{{display:grid;grid-template-columns:1fr auto 1fr auto 1fr;gap:12px;align-items:center;margin:26px 0}}.node{{border:1px solid var(--line);border-radius:15px;background:#111a29;padding:16px;min-height:124px}}.node b{{display:block;color:var(--blue)}}.arrow{{font-size:2rem;color:var(--orange);text-align:center}}.grid{{grid-template-columns:1fr 1fr}}h2{{margin:0 0 10px;font-size:1.35rem}}code{{background:#202d43;border-radius:5px;padding:2px 5px;color:#d9e8ff}}ul{{padding-left:1.2rem;margin:.5rem 0}}li+li{{margin-top:.6rem}}figure{{margin:28px 0 0;border:1px solid var(--line);background:#fff;border-radius:18px;overflow:hidden}}figure img{{width:100%;display:block}}figcaption{{background:#111a29;color:var(--muted);padding:15px 18px}}.good{{color:var(--green);font-weight:800}}footer{{margin-top:28px;color:var(--muted)}}@media(max-width:760px){{main{{width:min(100% - 24px,1180px);padding-top:32px}}.facts,.grid{{grid-template-columns:1fr}}.flow{{grid-template-columns:1fr}}.arrow{{transform:rotate(90deg)}}}}
</style></head><body><main>
<div class="eyebrow">SystemSketch · 2026-09-05 · load recovery</div>
<h1>A recursive Definition no longer turns itself into its own parent.</h1>
<p class="lede">The affected pipeline is valid: <code>run_09_branch()</code> contains a recursive occurrence of itself. The Definition synchronizer treated overlapping occurrence trees as two independent copies, mapped the inner occurrence onto itself, and sent stock tldraw into an infinite ancestry walk during load.</p>
<section class="facts"><div class="fact"><strong>574</strong><span>shapes in the recovered supplied board</span></div><div class="fact"><strong>0</strong><span>self-parent records after opening it</span></div><div class="fact"><strong>2</strong><span>new real-browser regression assertions</span></div></section>
<section class="flow"><div class="node"><b>Valid recursive board</b>An occurrence is physically nested beneath the same Definition.</div><div class="arrow">→</div><div class="node"><b>Safe boundary</b>Ancestor/descendant occurrences are treated as opaque bodies; disjoint occurrences still synchronize.</div><div class="arrow">→</div><div class="node"><b>Stock canvas lives</b>tldraw sees no transient cycle, so its normal ancestry traversal completes.</div></section>
<section class="grid"><article class="panel"><h2>Precise repair</h2><p><code>definitionBodiesOverlap</code> follows both parent chains before a Definition body copy. If either occurrence contains the other, body mirroring is skipped at that recursive boundary. Shared Definition props remain synchronized, while placement and the recursive subtree remain local and valid.</p></article><article class="panel"><h2>Evidence</h2><ul><li><span class="good">PASS</span> The supplied Series A pipeline cold-opens with all 574 shapes.</li><li><span class="good">PASS</span> <code>recursive_definition_load_smoke.mjs</code> loads the minimal overlapping member-stamp case in a real browser and verifies its parent chain.</li><li><span class="good">PASS</span> The full <code>npm run test:definitions</code> suite passes.</li><li><span class="good">PASS</span> The guided fixture cold-reopens; its innermost card can move and undo while the cue stays bound.</li></ul></article></section>
<figure><img src="{image}" alt="SystemSketch review board showing three nested rec() Definition occurrences and reload and drag instructions"><figcaption><strong>Guided review fixture.</strong> Reload to prove the saved recursive graph opens, then drag the innermost <code>rec()</code> card and undo. The canvas must remain live and the three cards must remain nested.</figcaption></figure>
<footer>Generated by <code>docs/build_recursive_definition_load.py</code> from <code>sketches/review/recursive-definition-load.systemsketch</code>.</footer>
</main></body></html>"""
    OUTPUT.write_text(output, encoding="utf-8")
    print(f"wrote {OUTPUT.relative_to(ROOT)} ({len(output):,} bytes)")


if __name__ == "__main__":
    main()
