#!/usr/bin/env python3
"""Build the self-contained evidence gallery for the linked-cable depth fix."""

from __future__ import annotations

import base64
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCREENSHOT = ROOT / "sketches/review/linked-definition-port-drag.png"
OUTPUT = ROOT / "docs/linked-definition-port-drag-2026-09-03.html"


def data_uri(path: Path) -> str:
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def main() -> None:
    image = data_uri(SCREENSHOT)
    output = f"""<!doctype html>
<html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">
<title>Linked Definition cable drag repair · SystemSketch</title>
<style>
:root{{color-scheme:dark;--bg:#0c1018;--panel:#151c29;--line:#2d3a50;--ink:#f5f8ff;--muted:#a8b4c8;--blue:#8cb8ff;--green:#76e0a2;--orange:#ffb35e}}*{{box-sizing:border-box}}body{{margin:0;background:radial-gradient(circle at 80% -10%,#243c6d 0,transparent 40rem),var(--bg);color:var(--ink);font:16px/1.55 ui-sans-serif,system-ui,sans-serif}}main{{width:min(1160px,calc(100% - 36px));margin:auto;padding:54px 0 80px}}.eyebrow{{color:var(--blue);font-weight:800;letter-spacing:.13em;text-transform:uppercase;font-size:.8rem}}h1{{font-size:clamp(2.5rem,7vw,5.8rem);line-height:.95;margin:.18em 0;max-width:1000px}}.lede{{font-size:1.25rem;color:var(--muted);max-width:850px}}.facts{{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:30px 0}}.fact,.panel{{border:1px solid var(--line);border-radius:18px;background:linear-gradient(145deg,#182232,#111723);padding:20px}}.fact strong{{display:block;font-size:2rem;color:var(--green)}}.fact span{{color:var(--muted)}}.flow{{display:grid;grid-template-columns:1fr auto 1fr auto 1fr;gap:14px;align-items:center;margin:30px 0}}.flow .node{{border:1px solid var(--line);border-radius:16px;background:#101722;padding:18px;min-height:126px}}.flow b{{display:block;color:var(--blue)}}.arrow{{color:var(--orange);font-size:2rem}}h2{{margin:0 0 10px;font-size:1.5rem}}.grid{{display:grid;grid-template-columns:1.1fr .9fr;gap:20px;margin:20px 0}}figure{{margin:0;border:1px solid var(--line);border-radius:18px;overflow:hidden;background:#f7f8fa}}figure img{{display:block;width:100%;height:430px;object-fit:contain}}figcaption{{background:#111723;color:var(--muted);padding:13px 16px}}ol{{margin:0;padding-left:1.25rem}}li+li{{margin-top:.65rem}}code{{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#cddaff}}.good{{color:var(--green);font-weight:800}}.note{{border-left:4px solid var(--orange);background:#211b14;border-radius:8px;padding:14px 17px;color:#ffe1bd}}footer{{color:var(--muted);margin-top:35px}}@media(max-width:760px){{main{{width:min(100% - 24px,1160px);padding-top:32px}}.facts,.grid{{grid-template-columns:1fr}}.flow{{grid-template-columns:1fr;gap:8px}}.arrow{{transform:rotate(90deg);text-align:center}}figure img{{height:auto}}}}
</style></head><body><main>
<div class=\"eyebrow\">SystemSketch · 2026-09-03 · linked Definition repair</div>
<h1>A linked port drag no longer blows the store depth limit.</h1>
<p class=\"lede\">Dragging <code>.attr_1</code> into the nested literal of one linked <code>assignment</code> now creates the source cable, mirrors it to the second Definition occurrence, and leaves the editor responsive.</p>
<section class=\"facts\"><div class=\"fact\"><strong>1 → 2</strong><span>user cable becomes one mirrored cable per Definition occurrence</span></div><div class=\"fact\"><strong>0</strong><span>console errors in the regression and review-board drag</span></div><div class=\"fact\"><strong>33 / 33</strong><span>existing semantic edge checks stay green</span></div></section>
<section class=\"flow\"><div class=\"node\"><b>Pointer operation</b>Creates the semantic binding at the pressed port.</div><div class=\"arrow\">→</div><div class=\"node\"><b>Store flush</b>Completes the tldraw atomic update without a nested write.</div><div class=\"arrow\">→</div><div class=\"node\"><b>Derived sync</b>A coalesced microtask mirrors the Definition body with ignored history.</div></section>
<section class=\"grid\"><article class=\"panel\"><h2>What failed</h2><p>The Definition-linking operation-complete hook wrote materialized children while tldraw was still flushing the pointer transaction. Nested cables made that write path re-enter the store until its protection limit threw <code>Maximum store update depth exceeded</code>.</p><h2>What changed</h2><p>The hook now batches pending Definition-body work into one next-microtask reconciliation. It is marked <code>history: 'ignore'</code>: the user action remains the source-of-truth undo step, while its linked occurrences are derived copies.</p></article><article class=\"panel\"><h2>Evidence</h2><ol><li><span class=\"good\">PASS</span> Exact recovered-pipeline gesture reproduced before the change.</li><li><span class=\"good\">PASS</span> A portable browser regression creates two linked assignments and sees two cables after one physical drag.</li><li><span class=\"good\">PASS</span> Definition-linking smoke: 6 checks.</li><li><span class=\"good\">PASS</span> Edge acceptance: 33 checks.</li><li><span class=\"good\">PASS</span> Saved review board performs the drag, has no console errors, then undoes back to its ready state.</li></ol></article></section>
<figure><img src=\"{image}\" alt=\"Review board: two linked assignment Blocks, nested literal ports, and the drag instruction\"><figcaption>Prepared review board. Drag <code>.attr_1</code> on the left assignment into its literal's left port; both assignments should show a cable.</figcaption></figure>
<p class=\"note\"><strong>Merge audit:</strong> the unsafe Definition-linking operation hook arrived with automatic Definition linking. The later container-cable merge made complete internal cables materialized children, exposing the path in normal nested Definition work. The Preview/stable-promotion changes themselves do not participate in this stack.</p>
<footer>Generated by <code>docs/build_linked_definition_port_drag.py</code>. Review fixture: <code>sketches/review/linked-definition-port-drag.systemsketch</code>.</footer>
</main></body></html>"""
    OUTPUT.write_text(output, encoding="utf-8")
    print(f"wrote {OUTPUT.relative_to(ROOT)} ({OUTPUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
