#!/usr/bin/env python3
"""Build the self-contained detached-port-row implementation gallery."""

from __future__ import annotations

import base64
import html
import io
import json
from pathlib import Path

from PIL import Image


REPO = Path(__file__).resolve().parents[1]
ASSETS = REPO / "docs" / "assets"
OUTPUT = REPO / "docs" / "detached-port-rows-2026-09-01.html"
BEFORE = ASSETS / "detached-port-row-before-move.png"
AFTER = ASSETS / "detached-port-row-after-move.png"
RESULTS = ASSETS / "detached-port-row-acceptance.json"
SOURCE = REPO / "src" / "blocks" / "detach" / "detachBlock.ts"


def crop_uri(path: Path) -> str:
    if not path.exists():
        raise SystemExit(f"missing {path}; run npm run test:detached-port-row")
    image = Image.open(path).convert("RGB").crop((430, 235, 1010, 625))
    image = image.resize((928, 624), Image.Resampling.LANCZOS)
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=90, optimize=True)
    return "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def source_slice() -> str:
    text = SOURCE.read_text(encoding="utf-8")
    start = text.index("\t\t// A port row is its own stock group")
    end = text.index("\n\n\t\t// Grouping is what makes", start)
    return html.escape(text[start:end])


def main() -> None:
    checks = json.loads(RESULTS.read_text(encoding="utf-8"))
    passed = sum(1 for check in checks if check.get("ok"))
    rows = "".join(
        f'<li><span class="tick">✓</span>{html.escape(str(check["label"]))}</li>'
        for check in checks
    )
    page = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>SystemSketch — detached port rows</title>
<style>
:root{{--bg:#090d15;--panel:#111827;--line:#293449;--ink:#f8fafc;--muted:#a8b3c7;--blue:#70a8ff;--green:#65d28c;--orange:#ffad57;font-family:Inter,ui-sans-serif,system-ui,sans-serif}}
*{{box-sizing:border-box}}body{{margin:0;background:radial-gradient(circle at 80% 0,#18284b 0,transparent 32rem),var(--bg);color:var(--ink)}}
main{{width:min(1180px,calc(100% - 36px));margin:auto;padding:50px 0 72px}}h1{{max-width:900px;margin:12px 0;font-size:clamp(42px,7vw,76px);line-height:.96;letter-spacing:-.055em}}
.eyebrow{{color:var(--blue);font:800 12px ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase}}.lede{{max-width:830px;color:#cad2df;font-size:19px;line-height:1.55}}
.stats{{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:30px 0 48px}}.stat,.card{{border:1px solid var(--line);border-radius:16px;background:rgba(17,24,39,.9)}}
.stat{{padding:18px}}.stat b{{display:block;font-size:28px}}.stat span,.muted{{color:var(--muted)}}h2{{margin:48px 0 12px;font-size:30px;letter-spacing:-.03em}}
.shots{{display:grid;grid-template-columns:1fr 1fr;gap:16px}}figure{{margin:0;overflow:hidden;border:1px solid #39465e;border-radius:17px;background:white;box-shadow:0 20px 50px #0008}}figure img{{display:block;width:100%}}figcaption{{padding:13px 15px;background:var(--panel);color:var(--muted);font-size:14px}}figcaption b{{color:var(--ink)}}
.tree{{display:grid;grid-template-columns:1fr 1fr;gap:16px}}.card{{padding:22px}}.node{{margin:9px 0 0 22px;padding:10px 13px;border-left:3px solid var(--blue);background:#0c1321;border-radius:0 10px 10px 0}}.node.row{{border-left-color:var(--orange)}}
ul{{list-style:none;padding:0;margin:0}}li{{display:flex;gap:10px;padding:9px 0;border-bottom:1px solid var(--line);color:#dce3ee}}li:last-child{{border:0}}.tick{{color:var(--green);font-weight:900}}
pre{{margin:0;overflow:auto;padding:18px;border:1px solid var(--line);border-radius:14px;background:#080c13;color:#cbd5e1;font:600 12.5px/1.6 ui-monospace,monospace}}
code{{padding:2px 5px;border-radius:5px;background:#1b2639;color:#d7e4fa}}a{{color:#86b7ff}}footer{{margin-top:48px;padding-top:20px;border-top:1px solid var(--line);color:var(--muted)}}
@media(max-width:800px){{.stats,.shots,.tree{{grid-template-columns:1fr}}}}
</style>
</head>
<body><main>
<div class="eyebrow">SystemSketch · Detach to primitives</div>
<h1>One port circle.<br />One movable row.</h1>
<p class="lede">Detached Blocks now turn every visible port into one stock ellipse, then nest that circle with its name, type, and optional default value inside a stock tldraw group. The large remembered Block group stays intact; the row can move independently without tearing its label away from its port.</p>
<div class="stats"><div class="stat"><b>1</b><span>ellipse per visible port</span></div><div class="stat"><b>2 levels</b><span>Block group → port-row groups</span></div><div class="stat"><b>{passed}/{len(checks)}</b><span>real-browser checks</span></div></div>

<h2>The gesture, before and after</h2>
<p class="muted">The second frame comes from a real pointer drag that begins on <code>payload</code>. The result circle, name, and type stay put; all four input-row parts move together.</p>
<div class="shots">
<figure><img src="{crop_uri(BEFORE)}" alt="Detached Block with single-circle port rows" /><figcaption><b>Detached.</b> One circle at each boundary; the Block remains one outer group.</figcaption></figure>
<figure><img src="{crop_uri(AFTER)}" alt="Input port row moved as a nested group" /><figcaption><b>Row moved.</b> The blue selection encloses circle + payload + int + = 5.</figcaption></figure>
</div>

<h2>The ownership tree</h2>
<div class="tree">
<div class="card"><strong>Detached Block group</strong><div class="node">Card, header, dividers, description</div><div class="node row">Input row group<div class="node">ellipse · payload · int · = 5</div></div><div class="node row">Output row group<div class="node">ellipse · result · float</div></div></div>
<div class="card"><ul>{rows}</ul></div>
</div>

<h2>The stock seam</h2>
<p class="muted">The implementation asks tldraw itself to group each row, then groups those row-group ids with the rest of the Block primitives. No drag, selection, or nesting primitive is reimplemented.</p>
<pre>{source_slice()}</pre>
<footer>Built from the live source, <code>npm run test:detached-port-row</code>, and its inspected Chrome captures.</footer>
</main></body></html>'''
    OUTPUT.write_text(page, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
