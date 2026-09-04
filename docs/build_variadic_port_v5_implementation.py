#!/usr/bin/env python3
"""Build the self-contained V5 variadic-port implementation gallery."""
from __future__ import annotations

import base64
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
OUT = DOCS / "variadic-port-v5-implementation-2026-09-03.html"


def image(name: str) -> str:
    payload = base64.b64encode((DOCS / "assets" / name).read_bytes()).decode("ascii")
    return f"data:image/png;base64,{payload}"


def main() -> None:
    board = image("variadic-port-v5-review-board.png")
    inspector = image("variadic-port-v5-inspector-live.png")
    html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>V5 variadic parameter ports — implementation</title>
<style>
:root{{--ink:#18212d;--muted:#627082;--paper:#f7f8fa;--card:#fff;--line:#dce2e9;--teal:#187f75;--ochre:#9b651e;--orange:#f08a38;--green:#1c8c54;--shadow:0 16px 45px #24324316}}*{{box-sizing:border-box}}body{{margin:0;background:var(--paper);color:var(--ink);font:16px/1.52 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}}main{{max-width:1320px;margin:auto;padding:56px 28px 90px}}h1{{font-size:clamp(2.2rem,6vw,4.9rem);letter-spacing:-.065em;line-height:.96;margin:0 0 22px;max-width:850px}}h2{{font-size:1.42rem;letter-spacing:-.025em;margin:0 0 12px}}h3{{font-size:1rem;margin:0 0 5px}}p{{margin:0 0 13px;color:var(--muted)}}a{{color:#086ab1}}.eyebrow{{color:var(--teal);font-size:.74rem;font-weight:800;letter-spacing:.13em;text-transform:uppercase}}.lead{{font-size:1.17rem;max-width:760px;color:#405064}}.meta{{display:flex;flex-wrap:wrap;gap:8px;margin:25px 0 42px}}.pill{{padding:6px 10px;border:1px solid var(--line);background:#fff;border-radius:999px;font-size:.82rem;color:#435066}}.grid{{display:grid;grid-template-columns:repeat(12,1fr);gap:18px;margin:18px 0}}.card{{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:22px;box-shadow:var(--shadow)}}.wide{{grid-column:span 12}}.six{{grid-column:span 6}}.four{{grid-column:span 4}}.rule{{margin:48px 0 18px;padding-top:26px;border-top:1px solid var(--line)}}.flow{{display:grid;grid-template-columns:1fr 34px 1fr 34px 1fr;align-items:stretch;gap:10px;margin-top:16px}}.flow .node{{background:#fbfcfd;border:1px solid var(--line);border-radius:12px;padding:16px}}.arrow{{display:grid;place-items:center;color:#94a0ae;font-size:25px}}code{{font: .88em ui-monospace,SFMono-Regular,Menlo,monospace;color:#334257;background:#eef2f5;padding:2px 4px;border-radius:4px}}table{{width:100%;border-collapse:collapse;font-size:.92rem}}th,td{{text-align:left;padding:12px 6px;border-bottom:1px solid var(--line);vertical-align:top}}th{{color:var(--muted);font-weight:650}}.sample{{border-left:4px solid var(--teal);background:#f3fbfa;border-radius:0 10px 10px 0;padding:14px 16px;margin-top:14px}}.sample.keyword{{border-color:var(--ochre);background:#fffaf3}}.shot{{margin:0;background:#fff;border:1px solid var(--line);border-radius:17px;overflow:hidden;box-shadow:var(--shadow)}}.shot img{{display:block;width:100%;height:auto}}.shot figcaption{{padding:11px 14px;color:var(--muted);font-size:.86rem}}.check{{display:flex;gap:9px;padding:9px 0;border-bottom:1px solid var(--line)}}.check:last-child{{border:0}}.ok{{color:var(--green);font-weight:800}}.callout{{border:1px solid #f7c189;background:#fff8ee;border-radius:14px;padding:18px 20px;color:#5c3c1e}}.small{{font-size:.88rem}}@media(max-width:760px){{main{{padding:32px 16px 60px}}.six,.four{{grid-column:span 12}}.flow{{grid-template-columns:1fr;gap:5px}}.arrow{{transform:rotate(90deg);height:18px}}}}
</style></head><body><main>
<div class="eyebrow">SystemSketch × PyBlocks · 03 September 2026</div>
<h1>V5 variadic parameter ports are implemented.</h1>
<p class="lead">A Python signature owns the meaning of <code>*args</code> and <code>**kwargs</code>; the call site owns every visible, cableable argument expression. V5 keeps both truths visible without inventing a collector port.</p>
<div class="meta"><span class="pill">chosen direction · V5</span><span class="pill">real saved review board</span><span class="pill">PyBlocks adapter → native Block metadata</span><span class="pill">inspector authoring escape hatch</span></div>

<section class="grid"><article class="card wide"><h2>The settled contract</h2><div class="flow"><div class="node"><h3>Definition ownership</h3><p><code>*overlays</code> and <code>**options</code> are the callee’s formal groups.</p></div><div class="arrow">→</div><div class="node"><h3>Call ownership</h3><p>Each direct value, named keyword, <code>*iterable</code>, and <code>**mapping</code> gets its own durable input port.</p></div><div class="arrow">→</div><div class="node"><h3>Quiet explanation</h3><p>A centred group label, micro-bracket, and collar explain membership. Nothing steals a cable endpoint.</p></div></div><div class="sample"><strong>*overlays</strong> · direct values keep solid collars; one <code>*extra_layers</code> source is one dotted, unknown-cardinality slot.</div><div class="sample keyword"><strong>**options</strong> · named <code>opacity=</code>/<code>mode=</code> slots remain separate; one <code>**theme</code> source is one dotted slot.</div></article>
<article class="card six"><h2>What V5 deliberately does not do</h2><table><tr><th>Rejected shortcut</th><th>Why</th></tr><tr><td>One synthetic collector</td><td>It loses where a concrete source expression connected.</td></tr><tr><td>One fake empty port</td><td>It suggests a call argument that does not exist.</td></tr><tr><td>Explode a spread into guessed slots</td><td><code>*iterable</code>/<code>**mapping</code> cardinality is intentionally unknown.</td></tr><tr><td>Canvas-only editing gesture</td><td>This is signature metadata, not routine canvas work.</td></tr></table></article>
<article class="card six"><h2>Representation boundary</h2><p><b>PyBlocks</b> emits each unique V5 port ID in call order and attaches an exact <code>variadic</code> object: group ID, visible label, positional/keyword kind, and bundled flag.</p><p><b>SystemSketch</b> validates that payload on legacy import, retains it on each normal <code>BlockPort</code>, and derives decoration from the laid-out real ports. Importing malformed foreign metadata simply omits the adornment.</p><p class="small">The native <code>.systemsketch.py</code> round-trip keeps the same exact object. Port identity and cable bindings do not change.</p></article></section>

<section class="rule"><div class="eyebrow">Live product canvas</div><h2>One real call node, seven normal-cadence slots</h2><p>The saved board wires five source blocks into five different target port IDs. Both groups have three concrete call expressions; only the two spread sources are dotted.</p><figure class="shot"><img alt="SystemSketch V5 review board with compose block, variadic brackets, source blocks, cables, and review instructions" src="{board}"><figcaption>Captured by <code>tests/variadic_port_v5_smoke.mjs</code> in the product canvas. The companion board is <a href="../sketches/review/variadic-port-v5.systemsketch">variadic-port-v5.systemsketch</a>.</figcaption></figure></section>

<section class="grid rule"><article class="card six"><div class="eyebrow">The rare manual path</div><h2>The inspector can author it without a new gesture</h2><p>Each input row has a closed <b>Variadic slot</b> disclosure. It can remain ordinary, become <code>*args</code> or <code>**kwargs</code>, rename the visible group, and mark the source as bundled. That keeps signature work in the “back room” while preserving the normal canvas workflow.</p><div class="callout"><b>Scope intentionally stays narrow.</b> Imported Python boards populate this automatically. The inspector is the manual escape hatch, not a competing canvas-mode.</div></article><figure class="shot six"><img alt="A real SystemSketch block development inspector with the expanded Variadic args control and bundle toggle" src="{inspector}"><figcaption>Real-browser interaction: an ordinary input was turned into <code>*args</code>, then its bundle state was toggled.</figcaption></figure></section>

<section class="grid rule"><article class="card four"><h2>Decision path</h2><p>V1 cluster, V2 uniform cadence, V3 first-jack, V4 gap, and V5 uniform cadence plus micro-bracket were compared. The decisive criteria were port uniformity, call honesty, group ownership, dense usability, then visual quiet.</p><p><b>V5 won</b> because V2’s clarity is preserved while group ownership is legible at a glance.</p></article><article class="card four"><h2>Implemented seams</h2><p><code>pyblocks/python_adapter.py</code> preserves formal parameter kinds, maps edges to canonical V5 slots, and orders direct arguments by source order.</p><p><code>src/blocks/blockModel.ts</code>, importer, canvas, and inspector retain the same narrow metadata contract.</p></article><article class="card four"><h2>Verification</h2><div class="check"><span class="ok">✓</span><span>18 focused PyBlocks adapter / format tests</span></div><div class="check"><span class="ok">✓</span><span>34 focused SystemSketch model, import, and inspector tests</span></div><div class="check"><span class="ok">✓</span><span>7 real-browser checks across product board and inspector</span></div><div class="check"><span class="ok">✓</span><span>TypeScript compile and full project check</span></div></article></section>

<p class="small rule">Historical design context and the Python-facing decision record are kept with the PyBlocks implementation report. This gallery records the integrated renderer, actual board, and browser proof.</p>
</main></body></html>"""
    OUT.write_text(html, encoding="utf-8")
    print(OUT)


if __name__ == "__main__":
    main()
