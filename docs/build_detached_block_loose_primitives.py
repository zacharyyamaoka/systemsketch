#!/usr/bin/env python3
"""Build the detachable-block clipping fix gallery from checked evidence."""
from __future__ import annotations

import base64
import html
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs" / "assets"
OUTPUT = ROOT / "docs" / "detached-block-loose-primitives-2026-09-03.html"
SCREENSHOT = ASSETS / "detached-block-loose-primitives-2026-09-03.png"
RESULTS = ASSETS / "detached-block-loose-primitives-acceptance.json"
SOURCE = ROOT / "src" / "blocks" / "detach" / "detachBlock.ts"


def data_uri(path: Path) -> str:
    if not path.exists():
        raise SystemExit(f"Missing {path}; run npm run test:detach-loose-primitives first.")
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def source_excerpt() -> str:
    code = SOURCE.read_text(encoding="utf-8")
    start = code.index("function unframedPrimitiveParentId(")
    end = code.index("\n\n/**\n * Stock tldraw has no inline delay pill", start)
    return html.escape(code[start:end])


def main() -> None:
    required = ["unframedPrimitiveParentId", "primitiveParentId", "parentId: primitiveParentId"]
    code = SOURCE.read_text(encoding="utf-8")
    missing = [needle for needle in required if needle not in code]
    if missing:
        raise SystemExit(f"Detach seam changed; update this gallery: {', '.join(missing)}")
    checks = json.loads(RESULTS.read_text(encoding="utf-8"))
    if not all(check.get("ok") for check in checks):
        raise SystemExit("The acceptance evidence contains a failing check.")
    evidence_rows = "".join(
        f"<li><span>✓</span><b>{html.escape(check['id'])}</b> {html.escape(check['label'])}</li>"
        for check in checks
    )
    page = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch — detached Blocks are loose primitives</title>
<style>
:root{{--paper:#f7f8fb;--ink:#172033;--muted:#61708a;--line:#dce3ed;--blue:#2463eb;--orange:#ef8b26;--green:#087443;--navy:#10192a;font-family:Inter,ui-sans-serif,system-ui,sans-serif}}*{{box-sizing:border-box}}body{{margin:0;background:linear-gradient(130deg,#edf5ff 0,#f7f8fb 45%,#f6fbf7 100%);color:var(--ink)}}main{{max-width:1240px;margin:auto;padding:54px 28px 76px}}.eyebrow{{color:var(--blue);font:800 12px ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase}}h1{{font-size:clamp(38px,6vw,72px);line-height:.98;letter-spacing:-.06em;margin:14px 0;max-width:940px}}.lede{{color:var(--muted);font-size:19px;line-height:1.55;max-width:850px}}.stats,.grid{{display:grid;gap:16px;grid-template-columns:repeat(3,1fr);margin:30px 0}}.card,.stat,figure{{background:#fff;border:1px solid var(--line);border-radius:18px;box-shadow:0 12px 34px #25345c10}}.stat{{padding:20px}}.stat b{{display:block;font-size:30px;letter-spacing:-.04em}}.stat span{{color:var(--muted);font-size:14px}}h2{{font-size:29px;letter-spacing:-.035em;margin:52px 0 14px}}figure{{margin:0;overflow:hidden}}figure img{{display:block;width:100%;background:#fff}}figcaption{{padding:13px 16px;color:var(--muted);font-size:14px}}.diagram{{display:grid;grid-template-columns:1fr 56px 1fr;gap:14px;align-items:center;padding:26px}}.state{{min-height:210px;padding:24px;border-radius:14px;border:2px solid var(--line)}}.state.bad{{border-color:#f1aa5a;background:#fff8f0}}.state.good{{border-color:#75cda3;background:#f4fff8}}.arrow{{font-size:44px;text-align:center;color:var(--orange)}}.frame{{margin-top:16px;padding:16px;border:2px solid #9ba5b4;border-radius:4px}}.frame .cut{{height:50px;margin:24px -16px -16px;padding:10px 14px;border-top:2px dashed #e27a22;background:linear-gradient(90deg,#fff 62%,#ffd8b3 62%);overflow:hidden;white-space:nowrap}}.loose{{margin-top:30px;padding:15px;border:2px solid var(--blue);border-radius:8px;background:#fff;box-shadow:0 8px 18px #2463eb20}}.line{{height:2px;background:#718096;margin:28px -12px 0;position:relative}}.line:after{{content:'arrow stays visible';position:absolute;right:0;bottom:8px;color:#087443;font:700 12px ui-monospace,monospace}}.card{{padding:22px}}ul{{list-style:none;padding:0;margin:0}}li{{padding:11px 0;border-bottom:1px solid var(--line);line-height:1.35}}li:last-child{{border:0}}li span{{color:var(--green);font-weight:900;margin-right:9px}}li b{{font:800 12px ui-monospace,monospace;margin-right:9px;color:var(--blue)}}pre{{margin:0;overflow:auto;border-radius:14px;background:var(--navy);color:#d9e7ff;padding:18px;font:600 12px/1.55 ui-monospace,monospace}}code{{background:#eaf0fa;padding:2px 5px;border-radius:5px}}footer{{margin-top:48px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted)}}@media(max-width:760px){{.stats,.grid,.diagram{{grid-template-columns:1fr}}.arrow{{transform:rotate(90deg)}}}}
</style></head><body><main>
<div class="eyebrow">SystemSketch · Detach to primitives · 03 Sep 2026</div>
<h1>Detached Blocks now leave the frame.</h1>
<p class="lede">The visible failure was clipping, not ordinary draw order. A Block and the semantic connection it owned remained children of an Expanded Block after detachment. tldraw clipped those child pixels at the frame boundary before “Bring to front” or “Send to back” could affect them. Detach now lifts the stock group, card, arrow, and delayed pill outside every frame-like ancestor while preserving their page-space pose.</p>
<section class="stats"><div class="stat"><b>0</b><span>frame-like ancestors for detached primitives</span></div><div class="stat"><b>5 / 5</b><span>nested-frame browser acceptance checks</span></div><div class="stat"><b>1 undo</b><span>still restores the semantic Block and cable</span></div></section>
<h2>The ownership change</h2><section class="card diagram"><div class="state bad"><b>Before</b><div class="frame">Expanded Block<div class="cut">func group + data edge — clipped here</div></div></div><div class="arrow">→</div><div class="state good"><b>After</b><div class="frame">Expanded Block</div><div class="loose">stock group → stock rectangle</div><div class="line"></div></div></section>
<h2>Real nested-block journey</h2><figure><img src="{data_uri(SCREENSHOT)}" alt="Detached func stock group below a While Loop with its data arrow escaping the frame boundary"><figcaption><b>Checked in Chrome.</b> The original child extended below its real Expanded parent. After the context-menu command, <code>func</code> is a selected stock group beneath the boundary and the arrow remains visibly continuous.</figcaption></figure>
<h2>What the regression proves</h2><section class="grid"><div class="card"><ul>{evidence_rows}</ul></div><div class="card"><b>Normal primitives, normal ordering</b><p>The result is a stock <code>group</code> and <code>geo</code> rectangle under the page (or a normal non-frame group). Its converted connection is a stock page-level <code>arrow</code>. Stock selection, stack ordering, moving, resizing, and ungrouping therefore work without the old clipping boundary.</p><b>Nested ancestors included</b><p>The lookup climbs all ancestors. That covers a group inside a Frame, an Expanded Block, Branch, or Loop; stopping at only the direct parent would leave a hidden clipping ancestor in the tree.</p></div></section>
<h2>The narrow seam</h2><pre>{source_excerpt()}</pre>
<footer>Evidence: <code>npm run test:detach-loose-primitives</code>, <code>npm run test:detach</code>, <code>npm run test:stock-tldr-primitives</code>, and <code>npm run test:portable</code>. Review fixture: <code>sketches/review/detached-block-loose-primitives.systemsketch</code>.</footer>
</main></body></html>'''
    OUTPUT.write_text(page, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
