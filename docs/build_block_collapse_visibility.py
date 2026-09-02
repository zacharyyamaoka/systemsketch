#!/usr/bin/env python3
"""Build the self-contained evidence gallery for opaque collapsed Blocks."""

from __future__ import annotations

import base64
import html
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
ASSETS = DOCS / "assets"
OUTPUT = DOCS / "block-collapse-visibility-2026-09-01.html"


def data_uri(path: Path) -> str:
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def main() -> None:
    checks = json.loads(
        (ASSETS / "block-collapse-visibility-2026-09-01.json").read_text(encoding="utf-8")
    )
    passed = sum(bool(item["ok"]) for item in checks)
    failed = len(checks) - passed
    frames = [
        ("expanded", "Expanded", "The composite is open: 3 child Blocks + 4 internal cables.",
         data_uri(ASSETS / "block-collapse-expanded-2026-09-01.png")),
        ("simple", "Simple", "Opaque leaf: the children and their cables are not painted or hittable.",
         data_uri(ASSETS / "block-collapse-simple-2026-09-01.png")),
        ("port", "Port", "Opaque boundary: only run() and its own ports remain visible.",
         data_uri(ASSETS / "block-collapse-port-2026-09-01.png")),
    ]
    tabs = "".join(
        f'<button class="tab{(" active" if index == 0 else "")}" data-frame="{key}">'
        f'<span>{html.escape(label)}</span><small>{html.escape(caption)}</small></button>'
        for index, (key, label, caption, _image) in enumerate(frames)
    )
    figures = "".join(
        f'<figure id="frame-{key}" class="frame{(" active" if index == 0 else "")}">'
        f'<img src="{image}" alt="SystemSketch Block in {html.escape(label)} view">'
        f'<figcaption><b>{html.escape(label)}</b> · {html.escape(caption)}</figcaption></figure>'
        for index, (key, label, caption, image) in enumerate(frames)
    )
    check_rows = "".join(
        "<tr>"
        f'<td><code>{html.escape(str(item["id"]))}</code></td>'
        f'<td>{html.escape(str(item["label"]))}</td>'
        f'<td class="status">{"PASS" if item["ok"] else "FAIL"}</td>'
        "</tr>"
        for item in checks
    )

    document = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch · Collapsed Blocks are opaque</title>
<style>
:root{{--paper:#f6f4ef;--card:#fff;--ink:#20252b;--muted:#65707a;--line:#d8d5ce;--blue:#4b5cf0;--green:#18794e;--shadow:0 18px 55px rgba(34,39,45,.12)}}
*{{box-sizing:border-box}} body{{margin:0;background:var(--paper);color:var(--ink);font:16px/1.55 Inter,ui-sans-serif,system-ui,sans-serif}}
main{{width:min(1480px,calc(100% - 40px));margin:36px auto 72px}} .eyebrow{{font:700 12px/1 ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--blue)}}
h1{{max-width:980px;margin:12px 0 12px;font-size:clamp(38px,6vw,78px);line-height:.98;letter-spacing:-.055em}} .lead{{max-width:900px;margin:0 0 30px;color:var(--muted);font-size:20px}}
.score{{display:inline-flex;gap:10px;align-items:center;padding:10px 14px;border:1px solid #b8dec9;border-radius:999px;background:#eef9f3;color:var(--green);font-weight:750}}
.viewer{{margin-top:26px;display:grid;grid-template-columns:290px minmax(0,1fr);gap:16px}} .tabs{{display:flex;flex-direction:column;gap:10px}}
.tab{{appearance:none;border:1px solid var(--line);border-radius:16px;background:rgba(255,255,255,.6);padding:16px;text-align:left;color:inherit;cursor:pointer}}
.tab span{{display:block;font-size:19px;font-weight:800}} .tab small{{display:block;margin-top:5px;color:var(--muted);line-height:1.4}} .tab.active{{border-color:var(--blue);background:#eef0ff;box-shadow:0 0 0 2px rgba(75,92,240,.12)}}
.stage{{min-width:0;border:1px solid var(--line);border-radius:22px;background:var(--card);box-shadow:var(--shadow);overflow:hidden}} .frame{{display:none;margin:0}} .frame.active{{display:block}} .frame img{{display:block;width:100%;height:auto;background:#f8f9fa}} figcaption{{padding:13px 18px;border-top:1px solid var(--line);color:var(--muted)}}
.grid{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:28px}} .card{{padding:22px;border:1px solid var(--line);border-radius:18px;background:rgba(255,255,255,.78)}} .card h2{{margin:0 0 8px;font-size:21px}} .card p{{margin:0;color:var(--muted)}}
.flow{{display:flex;align-items:stretch;gap:12px;margin:12px 0 0}} .node{{flex:1;padding:14px;border:1px solid var(--line);border-radius:12px;background:#fff}} .arrow{{align-self:center;color:var(--blue);font-size:26px}} code{{font:13px ui-monospace,SFMono-Regular,Consolas,monospace}}
section{{margin-top:34px}} section>h2{{font-size:28px;margin:0 0 12px}} table{{width:100%;border-collapse:separate;border-spacing:0;overflow:hidden;border:1px solid var(--line);border-radius:16px;background:#fff}} th,td{{padding:12px 14px;border-bottom:1px solid var(--line);text-align:left}} tr:last-child td{{border-bottom:0}} th{{background:#f0eee8;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.08em}} .status{{color:var(--green);font-weight:800}}
.files{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}} .file{{padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:#fff}} footer{{margin-top:34px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted)}}
@media(max-width:850px){{.viewer{{grid-template-columns:1fr}}.tabs{{display:grid;grid-template-columns:repeat(3,1fr)}}.grid{{grid-template-columns:1fr}}.files{{grid-template-columns:1fr}}}} @media(max-width:560px){{main{{width:min(100% - 20px,1480px)}}.tabs{{grid-template-columns:1fr}}}}
</style>
</head>
<body><main>
<div class="eyebrow">SystemSketch · Block information hiding · 2026-09-01</div>
<h1>Collapsed means opaque.</h1>
<p class="lead">Switching an Expanded Block to Simple or Port now removes its entire interior projection—child Blocks, semantic cables, stock shapes, and deeper descendants—while preserving the exact composite in the document. Saved boards from before authored cable routing also upgrade in place instead of failing at startup.</p>
<div class="score">✓ {passed}/{len(checks)} real-browser checks{f" · {failed} failed" if failed else ""}</div>

<div class="viewer"><div class="tabs">{tabs}</div><div class="stage">{figures}</div></div>

<div class="grid">
  <article class="card"><h2>One stock seam</h2><p><code>Tldraw.getShapeVisibility</code> is reactive, recursive, and already removes hidden shapes from rendering and hit-testing. No CSS masking and no tldraw fork.</p></article>
  <article class="card"><h2>Records stay put</h2><p>The test observes 4 Block records + 4 connection records before, during, and after collapse. Re-expanding reveals them; it does not recreate them.</p></article>
  <article class="card"><h2>Every host agrees</h2><p>The product canvas, Block Dev profile, and embedded VS Code / Cursor canvas all use the same visibility callback.</p></article>
  <article class="card"><h2>Old boards open</h2><p>A connection-props migration supplies the automatic-route defaults before validation. The failing persisted Preview board was reloaded twice with no reset, no error screen, and no new console errors.</p></article>
</div>

<section><h2>The whole mechanism</h2><div class="flow">
  <div class="node"><b>Parent view</b><br><code>expanded</code></div><div class="arrow">→</div><div class="node"><b>Child visibility</b><br><code>inherit</code></div><div class="arrow">→</div><div class="node"><b>Paint + hit-test</b><br>interior is live</div>
</div><div class="flow">
  <div class="node"><b>Parent view</b><br><code>simple | port</code></div><div class="arrow">→</div><div class="node"><b>Child visibility</b><br><code>hidden</code></div><div class="arrow">→</div><div class="node"><b>Paint + hit-test</b><br>opaque leaf</div>
</div><div class="flow">
  <div class="node"><b>Legacy cable</b><br><code>curve</code> absent</div><div class="arrow">→</div><div class="node"><b>Props migration</b><br><code>null · [] · null</code></div><div class="arrow">→</div><div class="node"><b>Store load</b><br>valid, preserved board</div>
</div></section>

<section><h2>Browser scoreboard</h2><table><thead><tr><th>Check</th><th>Observed contract</th><th>Result</th></tr></thead><tbody>{check_rows}</tbody></table></section>

<section><h2>Implementation map</h2><div class="files">
  <div class="file"><code>src/blocks/blockVisibility.ts</code><br>One parent-view visibility rule.</div>
  <div class="file"><code>src/App.tsx</code><br>Product + Block Dev composition seam.</div>
  <div class="file"><code>src/embed/EmbeddedCanvas.tsx</code><br>The shipped IDE canvas uses the same rule.</div>
  <div class="file"><code>tests/block_collapse_visibility_smoke.mjs</code><br>Real gestures, paint assertions, reload, restore.</div>
  <div class="file"><code>src/blocks/connections/ConnectionShapeUtil.tsx</code><br>Retroactive defaults for pre-routing connection records.</div>
  <div class="file"><code>src/blocks/connections/connectionShapeMigrations.test.ts</code><br>Loads and validates a legacy saved snapshot end to end.</div>
</div></section>

<footer>Focused UI proof: <code>npm run test:visibility</code> · legacy-load regression: <code>connectionShapeMigrations.test.ts</code> · full gate: <code>384 Vitest + 35 Python</code>.</footer>
</main>
<script>
document.querySelectorAll('.tab').forEach(button=>button.addEventListener('click',()=>{{
  document.querySelectorAll('.tab,.frame').forEach(node=>node.classList.remove('active'))
  button.classList.add('active');document.getElementById('frame-'+button.dataset.frame).classList.add('active')
}}))
</script></body></html>"""
    OUTPUT.write_text(document, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
