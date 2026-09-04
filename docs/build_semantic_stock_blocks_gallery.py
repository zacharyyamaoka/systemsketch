#!/usr/bin/env python3
"""Build a self-contained visual handoff for the semantic stock Block track."""

from __future__ import annotations

import base64
from html import escape
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "semantic-stock-blocks-gallery-2026-09-04.html"
FIXTURE = ROOT / "sketches" / "review" / "semantic-stock-blocks.png"


def embedded_png(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def main() -> None:
    image = embedded_png(FIXTURE)
    html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Semantic stock Blocks · review gallery</title>
<style>
:root {{ color-scheme: light; --ink:#20242c; --muted:#647084; --line:#dce2ec; --panel:#fff; --paper:#f5f7fb; --accent:#286fd4; --green:#16835c; --amber:#a15c00; }}
* {{ box-sizing:border-box }} body {{ margin:0; font:15px/1.55 Inter,ui-sans-serif,system-ui,sans-serif; color:var(--ink); background:var(--paper) }}
main {{ max-width:1320px; margin:auto; padding:48px 32px 80px }} header {{ display:grid; grid-template-columns:1.5fr .8fr; gap:28px; align-items:end; margin-bottom:30px }}
h1 {{ font-size:clamp(32px,5vw,58px); line-height:.98; margin:0 0 16px; letter-spacing:-.045em }} h2 {{ font-size:24px; margin:0 0 10px }} h3 {{ margin:0 0 8px; font-size:18px }}
p {{ margin:0 0 12px }} .eyebrow {{ color:var(--accent); font-weight:800; letter-spacing:.1em; text-transform:uppercase; font-size:12px }}
.lede {{ color:var(--muted); font-size:18px; max-width:760px }} .facts {{ display:grid; gap:10px }} .fact {{ background:#e8f0ff; border:1px solid #c8dbff; border-radius:14px; padding:14px 16px }} .fact b {{ display:block; font-size:22px }}
.panel {{ background:var(--panel); border:1px solid var(--line); border-radius:18px; padding:24px; box-shadow:0 8px 24px #25324b0b }} .grid {{ display:grid; grid-template-columns:repeat(3,1fr); gap:16px; margin:18px 0 34px }}
.kind {{ display:inline-block; color:var(--accent); background:#eaf1ff; padding:2px 8px; border-radius:99px; font-size:12px; font-weight:700; margin-bottom:10px }} code {{ background:#f0f3f8; padding:2px 5px; border-radius:5px; font-size:.9em }}
.gallery {{ margin:0 0 34px }} .gallery img {{ width:100%; display:block; border:1px solid var(--line); border-radius:14px; background:white }} figcaption {{ color:var(--muted); margin-top:9px }}
table {{ width:100%; border-collapse:collapse; font-size:14px }} th,td {{ text-align:left; vertical-align:top; padding:12px; border-top:1px solid var(--line) }} th {{ color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.06em }}
.boundary {{ border-left:4px solid var(--amber); padding:12px 16px; background:#fff8ed; border-radius:0 10px 10px 0; margin-top:18px }} .proof {{ color:var(--green); font-weight:700 }}
svg {{ width:100%; height:auto; margin:10px 0 4px }} .node {{ fill:#fff; stroke:#cbd5e1; stroke-width:2 }} .wire {{ fill:none; stroke:#286fd4; stroke-width:3; marker-end:url(#arrow) }} .note {{ fill:#647084; font:14px ui-sans-serif,system-ui }} .label {{ fill:#20242c; font:600 16px ui-sans-serif,system-ui }}
footer {{ margin-top:34px; color:var(--muted); font-size:13px }} @media(max-width:800px) {{ header,.grid {{ grid-template-columns:1fr }} main {{ padding:28px 16px 56px }} }}
</style></head><body><main>
<header><div><div class="eyebrow">SystemSketch · implementation review · 2026-09-04</div><h1>Semantic stock Blocks</h1><p class="lede">Three source-shaped Blocks now travel through the existing picker, persistence, Block layout and inspector seams: a named record update, a pure conditional value selection, and an intentionally non-running Clock / Trigger declaration.</p></div>
<aside class="facts"><div class="fact"><b>3</b>curated picker presets</div><div class="fact"><b>9</b>real-browser acceptance assertions</div><div class="fact"><b>0</b>new canvas primitives or schedulers</div></aside></header>

<section class="grid"><article class="panel"><span class="kind">Record data</span><h2>Set attributes</h2><p>One ordinary <code>record</code> inlet and output, with stable <code>member_N</code> input identities whose editable names are the attributes being changed.</p><p><b>Projection:</b> unresolved — direct mutation, immutable replacement, or an opaque helper remain open.</p></article>
<article class="panel"><span class="kind">Pure value</span><h2>Select</h2><p>Boolean <code>condition</code> plus <code>true</code> and <code>false</code> candidate values. It is a normal Block, not a Branch region or execution flow feature.</p><p><b>Projection:</b> <code>true_value if condition else false_value</code></p></article>
<article class="panel"><span class="kind">Authoring source</span><h2>Clock / Trigger</h2><p>Typed ordinary <code>Trigger</code> output, persisted source and rate. Its visible label derives from that declaration: Clock at a finite positive rate, External trigger, or Manual trigger.</p><p><b>Boundary:</b> prototype declares intent; it does not schedule.</p></article></section>

<section class="panel gallery"><h2>Review fixture — real canvas objects</h2><figure><img src="{image}" alt="SystemSketch review board with Set attributes, Select and Clock Blocks plus instructions"><figcaption>Generated by the registered editor/schema and cold-reopened; the orange cues point at real Block targets. The saved board is <code>sketches/review/semantic-stock-blocks.systemsketch</code>.</figcaption></figure></section>

<section class="panel"><h2>One ordinary data plane</h2><svg viewBox="0 0 1040 190" role="img" aria-label="ordinary dataflow sketch"><defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#286fd4"/></marker></defs><rect class="node" x="30" y="50" width="210" height="82" rx="12"/><text class="label" x="50" y="84">Record</text><text class="note" x="50" y="108">ordinary data input</text><path class="wire" d="M240 91H378"/><rect class="node" x="380" y="32" width="260" height="120" rx="12"/><text class="label" x="402" y="73">Set attributes</text><text class="note" x="402" y="101">.quota · .enabled</text><text class="note" x="402" y="125">preserve the rest</text><path class="wire" d="M640 91H780"/><rect class="node" x="782" y="50" width="220" height="82" rx="12"/><text class="label" x="804" y="84">Updated record</text><text class="note" x="804" y="108">ordinary data output</text></svg><p>No top-edge mutation effect is created for Set attributes; it returns an updated value. Likewise, Select and Clock keep their typed values on ordinary ports.</p></section>

<section class="panel" style="margin-top:24px"><h2>Proof surface</h2><table><thead><tr><th>Concern</th><th>Evidence</th></tr></thead><tbody><tr><td>Preset and persistence</td><td><span class="proof">Unit-tested.</span> The named StockConfig migration normalizes legacy values, strips configuration on downgrade, and schema-round-trips saved Blocks.</td></tr><tr><td>Member identity</td><td><span class="proof">Browser-tested.</span> The actual picker creates Set attributes; adding and renaming <code>member_2</code> retains its stable identity.</td></tr><tr><td>Value/control distinction</td><td><span class="proof">Browser-tested.</span> The actual picker creates Select as a Block and its inspector shows <code>true_value if condition else false_value</code>.</td></tr><tr><td>Linked Clock</td><td><span class="proof">Browser-tested twice.</span> Positive rate edits repaint the label, propagate through linked occurrences, undo, reload without stale prose, and stay visible but disabled in read-only mode.</td></tr></tbody></table><div class="boundary"><b>Scoped limitation.</b> Clock / Trigger does not schedule, execute, or make time advance. It persists only authoring source/rate; runtime capability belongs to a separate adapter contract.</div></section>
<footer>Built from <code>src/blocks/stockBlocks.ts</code> · <code>tests/semantic_stock_blocks_smoke.mjs</code> · generated fixture PNG embedded above for a self-contained review.</footer>
</main></body></html>"""
    OUTPUT.write_text(html, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
