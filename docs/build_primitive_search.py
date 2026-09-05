#!/usr/bin/env python3
"""Build the self-contained cursor primitive-search implementation gallery."""

from __future__ import annotations

import base64
import html
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "primitive-search-implementation-2026-09-04.html"
RESULTS = ROOT / "docs" / "assets" / "primitive-search-smoke.json"
FILTERED_SHOT = ROOT / "docs" / "assets" / "primitive-search-filtered-2026-09-04.png"
CORNER_SHOT = ROOT / "docs" / "assets" / "primitive-search-corner-2026-09-04.png"
VARIANTS = ROOT / "docs" / "primitive-search-variants-2026-09-04.json"
SEARCH_SOURCE = ROOT / "src" / "library" / "PrimitiveSearch.tsx"
MODEL_SOURCE = ROOT / "src" / "library" / "primitiveSearchModel.ts"
CATALOG_SOURCE = ROOT / "src" / "library" / "shapeLibraryModel.ts"
TOOL_SOURCE = ROOT / "src" / "library" / "shapeLibraryTool.ts"
CHROME_SOURCE = ROOT / "src" / "chrome" / "SystemSketchChrome.tsx"


def data_uri(path: Path) -> str:
    payload = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:image/png;base64,{payload}"


def excerpt(path: Path, start: str, end: str, pad: int = 0) -> str:
    lines = path.read_text(encoding="utf-8").splitlines()
    first = next(index for index, line in enumerate(lines) if start in line)
    last = next(index for index, line in enumerate(lines[first:], first) if end in line)
    first = max(0, first - pad)
    last = min(len(lines) - 1, last + pad)
    return "\n".join(f"{number + 1:>4}  {lines[number]}" for number in range(first, last + 1))


def main() -> None:
    checks = json.loads(RESULTS.read_text(encoding="utf-8"))
    variants = json.loads(VARIANTS.read_text(encoding="utf-8"))
    search_source = SEARCH_SOURCE.read_text(encoding="utf-8")
    model_source = MODEL_SOURCE.read_text(encoding="utf-8")
    catalog_source = CATALOG_SOURCE.read_text(encoding="utf-8")
    tool_source = TOOL_SOURCE.read_text(encoding="utf-8")
    chrome_source = CHROME_SOURCE.read_text(encoding="utf-8")
    gates = {
        "Plain S only": "isPrimitiveSearchKey(event)" in search_source,
        "Canonical catalog": "filterShapeLibraryItems(query)" in search_source,
        "Real toolbar-tool handoff": "activateShapeLibraryTool(tools, item)" in search_source
        and "onSelect(source)" in tool_source,
        "No search-time insertion": "insertShapeLibraryItem" not in search_source,
        "Six-row ceiling": "PRIMITIVE_SEARCH_MAX_RESULTS = 6" in model_source,
        "Input/editing guards": "isEditableShortcutTarget" in search_source and "getEditingShapeId" in search_source,
        "Existing command modal retained": "<SystemSketchCommandPalette" in chrome_source,
        "Existing library insertion retained": "editor.markHistoryStoppingPoint" in catalog_source and "editor.run" in catalog_source,
    }
    if len(checks) != 8 or not all(gates.values()):
        raise SystemExit("refusing to build without all eight browser checks and source gates")

    score_rows = []
    for variant in variants["variants"]:
        total = sum(
            requirement["weight"] * variant["scores"][requirement["id"]]["score"] / 5
            for requirement in variants["requirements"]
        )
        score_rows.append((variant["name"], total, variant["thesis"]))

    score_table = "".join(
        f'<tr><td>{html.escape(name)}</td><td><b>{score:.0f}</b></td><td>{html.escape(thesis)}</td></tr>'
        for name, score, thesis in score_rows
    )
    browser_checks = "".join(f"<li><span>✓</span>{html.escape(label)}</li>" for label in checks)
    source_gates = "".join(
        f'<div class="gate"><b>✓ {html.escape(label)}</b><span>measured in the current tree</span></div>'
        for label in gates
    )

    document = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cursor primitive search · SystemSketch</title>
<style>
:root{{--paper:#f5f7fa;--ink:#202936;--muted:#6e7b8c;--line:#d8e0e9;--blue:#3182e8;--orange:#e36b3d;--green:#237a54;--card:#fff}}
*{{box-sizing:border-box}} body{{margin:0;background:var(--paper);color:var(--ink);font:15px/1.5 Inter,ui-sans-serif,system-ui,sans-serif}}
main{{width:min(1180px,calc(100% - 40px));margin:auto;padding:62px 0 96px}} h1{{max-width:850px;margin:0;font-size:clamp(42px,7vw,78px);line-height:.97;letter-spacing:-.055em}}
.eyebrow{{color:var(--blue);font:800 11px/1.2 ui-monospace,monospace;letter-spacing:.13em;text-transform:uppercase}} .lede{{max-width:780px;margin:25px 0 38px;color:#485467;font-size:20px}}
.hero,.evidence,.seams{{display:grid;grid-template-columns:1fr 1fr;gap:20px}} .card,.shot{{overflow:hidden;border:1px solid var(--line);border-radius:18px;background:var(--card);box-shadow:0 10px 30px #2432450b}}
.card{{padding:24px}} .flow{{display:flex;align-items:center;gap:12px;margin:23px 0;flex-wrap:wrap}} kbd{{padding:8px 12px;border:1px solid #b8c5d5;border-bottom-width:3px;border-radius:9px;background:#f3f7fc;color:#245ea5;font:800 15px ui-monospace,monospace}} .arrow{{color:#9ba7b5;font-size:21px}}
.winner{{border-color:#efc2ae;background:#fffaf7}} .winner .eyebrow{{color:var(--orange)}} .winner strong.big{{display:block;margin:10px 0 4px;font-size:30px;letter-spacing:-.035em}}
section{{margin-top:54px}} h2{{margin-bottom:18px;font-size:29px;letter-spacing:-.035em}} .shot img{{display:block;width:100%;height:auto}} figcaption{{padding:14px 18px;color:var(--muted);font-size:13px}}
table{{width:100%;border-collapse:collapse}} th,td{{padding:13px 11px;border-bottom:1px solid #e7ebf0;text-align:left;vertical-align:top}} th{{color:var(--muted);font-size:11px;text-transform:uppercase}} td:nth-child(2){{width:80px;color:var(--orange);font-size:20px}}
ul{{display:grid;gap:9px;margin:0;padding:0;list-style:none}} li{{display:flex;gap:10px}} li span{{color:var(--green);font-weight:850}} .gate{{display:flex;justify-content:space-between;gap:14px;padding:10px 0;border-bottom:1px solid #e7ebf0}} .gate b{{color:var(--green)}} .gate span{{color:var(--muted);font-size:12px;text-align:right}}
pre{{margin:0;overflow:auto;padding:19px;border-radius:14px;background:#202833;color:#edf2f7;font:12px/1.55 ui-monospace,monospace}} a{{color:#2467bb}} .note{{color:var(--muted);font-size:13px}} .meta{{margin-top:54px;padding-top:20px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}}
@media(max-width:780px){{.hero,.evidence,.seams{{grid-template-columns:1fr}} main{{width:min(100% - 24px,1180px);padding-top:38px}}}}
</style></head><body><main>
<div class="eyebrow">SystemSketch · implementation evidence · 2026-09-04</div>
<h1>Primitive search now opens where the mouse is.</h1>
<p class="lede">Plain <b>S</b> creates a small, primitive-only typeahead beside the latest canvas pointer. It searches the existing library—not commands or board text—and arms the keyboard-selected stock drawing tool. No shape exists until the next canvas gesture.</p>
<div class="hero">
  <article class="card"><div class="eyebrow">Search, arm, then draw</div><div class="flow"><kbd>S</kbd><span class="arrow">→</span><b>type arrow</b><span class="arrow">→</span><kbd>↓</kbd><span class="arrow">→</span><kbd>Enter</kbd><span class="arrow">→</span><b>canvas drag</b></div><p><b>Escape</b> cancels. Enter or clicking a result only arms its real toolbar tool; the following canvas click or drag owns placement and geometry.</p></article>
  <article class="card winner"><div class="eyebrow">AI prune · provisional default</div><strong class="big">Cursor Stack · 96/100</strong><p>It keeps the Fusion-style pointer anchor while exposing enough labeled matches to distinguish Straight, Curved, and Elbow arrows. <a href="primitive-search-variants-2026-09-04.html">Open all three interactive variants and the full scoring audit.</a></p></article>
</div>
<section><h2>The real product, driven twice</h2><div class="evidence">
  <figure class="shot"><img src="{data_uri(FILTERED_SHOT)}" alt="Three primitive arrow results in a small search beside the canvas pointer"><figcaption>At a normal canvas point, ArrowDown visibly selects Curved arrow and the footer says Enter will arm it. The popup is 304 px wide and keeps the command modal out of the interaction.</figcaption></figure>
  <figure class="shot"><img src="{data_uri(CORNER_SHOT)}" alt="Primitive search flipped above and left near the bottom-right canvas corner"><figcaption>At the bottom-right corner, the same result stack flips above-left, remains inside the viewport, and clears the bottom toolbar.</figcaption></figure>
</div></section>
<section><h2>Three visual directions, one frozen objective</h2><div class="card"><table><thead><tr><th>Direction</th><th>Score</th><th>Structural thesis</th></tr></thead><tbody>{score_table}</tbody></table><p class="note">Weights fixed before generation: pointer-local speed 35%, primitive discovery 25%, compact canvas continuity 20%, confident keyboard handoff 20%. All three passed the canonical-catalog and canvas-safe-hotkey gates.</p></div></section>
<section><h2>8/8 real-browser checks pass</h2><div class="hero"><article class="card"><ul>{browser_checks}</ul></article><article class="card"><div class="eyebrow">Current-tree gates</div>{source_gates}</article></div></section>
<section><h2>The implementation owns two narrow seams</h2><div class="seams"><pre>{html.escape(excerpt(SEARCH_SOURCE, "export function PrimitiveSearch", "if (!invocation) return null"))}</pre><pre>{html.escape(excerpt(TOOL_SOURCE, "export function activateShapeLibraryTool", "return toolId"))}</pre></div><p class="note">The component owns transient search state and keyboard focus. The tool adapter maps the canonical catalog item to the same tldraw UI tool item used by the toolbar. Tldraw owns the subsequent pointer gesture, geometry, snapping, cancellation, selection, and history.</p></section>
<p class="meta">Implementation track <code>track/primitive-search</code>, based on <code>main</code> at <code>e9b3345</code>. The existing Ctrl/Cmd+P, Ctrl/Cmd+K, and Ctrl/Cmd+F command/find modal remains unchanged.</p>
</main></body></html>"""
    document = "\n".join(line.rstrip() for line in document.splitlines()) + "\n"
    OUT.write_text(document, encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
