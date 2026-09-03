#!/usr/bin/env python3
"""Build the self-contained stock-tldraw primitive portability gallery."""
from __future__ import annotations

import base64
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "stock-tldr-primitives-2026-09-02.html"
ASSETS = HERE / "assets"


def image_uri(name: str) -> str:
    data = base64.b64encode((ASSETS / name).read_bytes()).decode("ascii")
    return f"data:image/png;base64,{data}"


def main() -> None:
    live = image_uri("stock-tldr-primitives-live-stock-render.png")
    exported = image_uri("stock-tldr-primitives-stock-render.png")
    OUT.write_text(f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch — stock .tldr primitives</title>
<style>
:root {{ color-scheme: light; --ink:#172033; --muted:#61708a; --line:#dce3ed; --paper:#f7f9fc; --accent:#2463eb; --good:#087443; }}
* {{ box-sizing:border-box }} body {{ margin:0; background:var(--paper); color:var(--ink); font:16px/1.5 Inter,ui-sans-serif,system-ui,sans-serif }}
main {{ max-width:1280px; margin:auto; padding:52px 30px 72px }} h1 {{ font-size:clamp(30px,5vw,58px); line-height:1.02; letter-spacing:-.055em; max-width:900px; margin:0 }}
h2 {{ margin:44px 0 14px; font-size:24px }} .eyebrow {{ color:var(--accent); font-weight:750; letter-spacing:.08em; text-transform:uppercase; font-size:12px; margin-bottom:16px }}
.lede {{ color:var(--muted); max-width:760px; font-size:19px }} .metrics,.grid {{ display:grid; gap:16px; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); margin-top:26px }}
.card {{ background:white; border:1px solid var(--line); border-radius:16px; padding:18px; box-shadow:0 6px 24px #26354a0d }} .metric b {{ font-size:25px; display:block }} .metric span {{ color:var(--muted); font-size:13px }}
figure {{ margin:0; background:white; border:1px solid var(--line); border-radius:16px; overflow:hidden }} figure img {{ display:block; width:100%; background:white }} figcaption {{ padding:12px 15px; color:var(--muted); font-size:14px }}
code {{ padding:.12em .35em; border-radius:5px; background:#edf2f8; font-size:.9em }} ul {{ padding-left:20px }} a {{ color:var(--accent) }} .good {{ color:var(--good); font-weight:700 }}
</style></head><body><main>
<div class="eyebrow">SystemSketch · 02 Sep 2026</div>
<h1>“Primitive” now means a stock <code>.tldr</code> record.</h1>
<p class="lede">Detach stops borrowing SystemSketch paint. Blocks, ports, defaults, Value pills, Branch regions, arm helpers, and every semantic edge lower to shapes that default tldraw 5.3.2 both loads and renders on its own.</p>
<section class="metrics"><div class="card metric"><b>6</b><span>remaining shape kinds: arrow, frame, group, geo, line, text</span></div><div class="card metric"><b>0</b><span>custom shape IDs, bindings, geo IDs, shadow wrappers, or detached paint hooks</span></div><div class="card metric"><b>3</b><span>honest edge fallbacks: solid data, dashed async, dotted delayed</span></div></section>
<h2>The deliberate stock approximation</h2>
<div class="grid"><figure><img src="{live}" alt="Live detach rendered by default tldraw utilities"><figcaption><b>Live command proof.</b> Context-menu detachment of Blocks, a Branch/Loop region and data/async/delayed edges, then rendered by stock utilities alone.</figcaption></figure><figure><img src="{exported}" alt="Portable export rendered by default tldraw utilities"><figcaption><b>Export proof.</b> The complete multi-view fixture, including nested Branches and Value pills, parsed and painted outside SystemSketch.</figcaption></figure></div>
<h2>What lowers to what</h2>
<div class="grid"><article class="card"><b>Block, ports & defaults</b><p>Stock rectangle/oval, text, lines, ellipse dots, and nested groups. Default values are independent stock oval/text pills.</p></article><article class="card"><b>Data / async / delayed</b><p>Stock arrows with <code>solid</code>, <code>dashed</code>, or <code>dotted</code> props. Delayed’s <code>z⁻¹ = value</code> is its own oval/text pill group inside an outer stock edge group, so ordinary selection, move, and copy take both the arrow and pill.</p></article><article class="card"><b>Branch / Loop</b><p>A stock Frame plus stock headings, dividers, controls, and text. Arm helper frames are unwrapped. There is no separate Loop custom shape in this build; Loop uses the Branch lowering.</p></article></div>
<h2>Portability definition and evidence</h2><p><span class="good">Pass:</span> <code>src/export/stockTldrawPrimitives.ts</code> centralizes the rule: the result must contain only default tldraw shape/binding types and props, then it is parsed and rendered with <code>defaultShapeUtils</code> / <code>defaultBindingUtils</code>—not just schema-checked.</p>
<ul><li><code>npm run test:stock-tldr-primitives</code> drives the live context menu and asserts no custom detached DOM/CSS marker remains.</li><li><code>npm run test:portable</code> exercises every Block view, defaults, data/async/delayed, nested Branches, custom colors/geos, and the isolated stock renderer.</li><li>Semantic metadata remains optional recovery information only; default tldraw ignores it and still paints a complete drawing.</li></ul>
<p><a href="../tests/stock_tldr_primitives_smoke.mjs">live smoke</a> · <a href="../tests/portable_tldraw_export_smoke.mjs">portable export smoke</a> · <a href="build_stock_tldr_primitives.py">gallery builder</a> · <a href="../sketches/review/stock-tldr-primitives.systemsketch">review fixture</a></p>
</main></body></html>\n""", encoding="utf-8")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
