#!/usr/bin/env python3
"""Build the self-contained Callout primitive implementation gallery.

Run after ``npm run test:callout`` so the gallery embeds the actual review
board capture and browser acceptance evidence instead of illustrative mocks.
"""

from __future__ import annotations

import base64
import html
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
ASSETS = DOCS / "assets"
SKETCHES = ROOT / "sketches" / "review"
OUTPUT = DOCS / "callout-primitive-implementation-2026-09-04.html"


def data_image(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def main() -> None:
    smoke = json.loads((ASSETS / "callout-primitive-smoke.json").read_text(encoding="utf-8"))
    board = json.loads((SKETCHES / "callout-primitive.systemsketch").read_text(encoding="utf-8"))
    results = smoke["checks"]
    passed = sum(bool(item["ok"]) for item in results)
    shapes = [record for record in board["records"] if record.get("typeName") == "shape"]
    bindings = [record for record in board["records"] if record.get("typeName") == "binding"]
    callout_cards = [shape for shape in shapes if shape.get("meta", {}).get("systemSketchCallout", {}).get("role") == "card"]
    callout_leaders = [shape for shape in shapes if shape.get("meta", {}).get("systemSketchCallout", {}).get("role") == "leader"]
    rows = "\n".join(
        f"<tr class=\"{'ok' if item['ok'] else 'bad'}\"><td>{html.escape(item['id'])}</td>"
        f"<td>{html.escape(item['label'])}</td><td>{'PASS' if item['ok'] else 'FAIL'}</td></tr>"
        for item in results
    )
    fixture = data_image(SKETCHES / "callout-primitive.png")
    knee = data_image(ASSETS / "callout-primitive-knee-moved.png")

    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Callout primitive — implementation gallery</title>
<style>
:root{{--ink:#142033;--mute:#58677c;--line:#d9e1eb;--paper:#f5f7fa;--card:#fff;--orange:#f28c28;--blue:#2879de;--green:#14824a;--rail:#eaf0f7}}*{{box-sizing:border-box}}body{{margin:0;background:var(--paper);color:var(--ink);font:16px/1.5 Inter,ui-sans-serif,system-ui,sans-serif}}main{{max-width:1280px;margin:auto;padding:48px 28px 72px}}h1{{margin:0;font-size:clamp(36px,6vw,66px);line-height:1.01;letter-spacing:-.055em}}h2{{font-size:24px;letter-spacing:-.025em;margin:0 0 10px}}p{{max-width:900px}}a{{color:#145ab8}}code{{background:#e7edf5;border-radius:5px;padding:2px 5px;font:12px ui-monospace,SFMono-Regular,monospace}}.eyebrow{{color:#1d66bf;font-weight:800;font-size:12px;letter-spacing:.12em;text-transform:uppercase}}.lede{{font-size:20px;line-height:1.45;color:#37465b;max-width:970px}}.facts{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:28px 0 34px}}.fact,.panel,figure{{background:var(--card);border:1px solid var(--line);box-shadow:0 6px 20px #10213c0a;border-radius:16px}}.fact{{padding:17px 18px}}.fact b{{display:block;font-size:28px;line-height:1.1}}.fact span{{color:var(--mute);font-size:13px}}.composition{{display:grid;grid-template-columns:1fr 42px 1fr 42px 1fr;align-items:stretch;margin:16px 0 34px}}.node{{background:#fff;border:1px solid var(--line);border-top:5px solid var(--orange);padding:18px;border-radius:14px;min-height:145px}}.node:nth-child(3){{border-top-color:var(--blue)}}.node:nth-child(5){{border-top-color:var(--green)}}.node b{{display:block;font-size:18px}}.node span{{color:var(--mute);font-size:14px}}.arrow{{display:grid;place-items:center;color:#8a99ad;font-size:30px}}.tabs{{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}}button{{border:1px solid #cbd7e5;border-radius:999px;padding:8px 14px;background:#fff;color:var(--ink);font:600 14px inherit;cursor:pointer}}button[aria-pressed=true]{{background:#e97912;color:#fff;border-color:#e97912}}figure{{margin:0;padding:12px}}figure img{{width:100%;display:block;border-radius:10px}}figcaption{{padding:10px 4px 2px;color:var(--mute);font-size:14px}}.gallery img{{display:none}}.gallery img.active{{display:block}}.grid{{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:22px 0}}.panel{{padding:18px 20px}}ul{{margin:0;padding-left:20px}}li{{margin:7px 0}}table{{width:100%;border-collapse:collapse;font-size:14px}}td{{padding:9px 6px;border-top:1px solid var(--line);vertical-align:top}}td:last-child{{font-weight:800;color:var(--green)}}tr.bad td:last-child{{color:#c43535}}.callout-note{{border-left:4px solid var(--orange);padding:8px 14px;background:#fff9f2;border-radius:0 8px 8px 0}}footer{{border-top:1px solid var(--line);margin-top:42px;padding-top:18px;color:var(--mute);font-size:13px}}@media(max-width:760px){{main{{padding:28px 16px}}.facts,.grid{{grid-template-columns:1fr 1fr}}.composition{{grid-template-columns:1fr;gap:8px}}.arrow{{height:22px;transform:rotate(90deg)}}}}@media(max-width:440px){{.facts{{grid-template-columns:1fr}}}}
</style></head><body><main>
<div class="eyebrow">SystemSketch · 4 September 2026</div>
<h1>An engineering callout<br>without a private drawing engine.</h1>
<p class="lede">The toolbar now creates a real two-click Callout: click the detail, then place the note. It is deliberately a small semantic relationship among normal TLDR shapes, so standard text editing, arrow bindings, resize, export, and multi-elbow rail editing stay intact.</p>
<section class="facts"><div class="fact"><b>{passed}/{len(results)}</b><span>real-browser acceptance checks</span></div><div class="fact"><b>{len(callout_cards)}</b><span>seeded Callout cards</span></div><div class="fact"><b>{len(callout_leaders)}</b><span>seeded leaders</span></div><div class="fact"><b>{len(bindings)}</b><span>real arrow bindings on the review board</span></div></section>
<h2>One semantic relationship; stock editing everywhere else</h2>
<div class="composition"><div class="node"><b>Callout card</b><span>Ordinary stock <code>geo</code> rectangle, with normal rich-text and resize behavior.</span></div><div class="arrow">↔</div><div class="node"><b>Leader(s)</b><span>Ordinary stock elbow <code>arrow</code>s. Each has its own arrowhead, knee rails, bindings, and deletion.</span></div><div class="arrow">↔</div><div class="node"><b>Small relationship tag</b><span><code>meta.systemSketchCallout</code> says card or leader plus its <code>cardId</code>; no custom record or schema fork.</span></div></div>
<p class="callout-note"><b>Why this is the prototype boundary:</b> the Callout tool owns only authoring and the relationship. tldraw remains the authority for the difficult, already-good parts: terminal binding, selected handles, routing, text, undo, and persistence.</p>
<h2>Review board and live knee proof</h2>
<div class="tabs"><button type="button" data-view="fixture" aria-pressed="true">Orientation playground</button><button type="button" data-view="knee" aria-pressed="false">Moved knee</button></div>
<figure class="gallery"><img class="active" data-view="fixture" src="{fixture}" alt="Callout playground with top, left, right, bottom, and multi-leader examples"><img data-view="knee" src="{knee}" alt="Real browser capture of selected Callout leader showing blue interior rail handles after a knee move"><figcaption id="caption">The seeded board gives four cardinal placements plus a multi-leader note. Every orange card and leader is a real editable product record.</figcaption></figure>
<section class="grid"><article class="panel"><h2>Try it on the board</h2><ol><li>Open <strong>System → Callout</strong>.</li><li>Click a shape or a precise empty point for the pointed terminus.</li><li>Click where the note should sit; type immediately.</li><li>Select the card and choose <strong>System → Add leader</strong> (or right-click → <strong>Add leader</strong>).</li><li>Select a leader. Its rail grip is shown directly; drag it to make or move an elbow knee.</li></ol><p><a href="../sketches/review/callout-primitive.systemsketch">Open the saved playground</a> · <a href="../sketches/review/callout-primitive.recipe.json">fixture recipe</a> · <a href="../sketches/review/callout-primitive.png">fixture PNG</a></p></article><article class="panel"><h2>What it intentionally does not do</h2><ul><li>No fake group or uneditable composite: ungrouping is unnecessary because the primitives are already stock.</li><li>No forced visibility rule: this is a durable annotation, distinct from collapsible review comments.</li><li>No source-reference behavior yet: source provenance belongs on the future annotation contract, not in a visual leader experiment.</li><li>No custom export renderer: the fallback is a valid stock elbow arrow plus a stock rectangle.</li></ul></article></section>
<section class="panel"><h2>Measured browser proof</h2><table><tbody>{rows}</tbody></table></section>
<footer>Built by <code>docs/build_callout_primitive.py</code> from the generated fixture and <code>npm run test:callout</code> transcript. Code and ordinary regression tests remain the living specification.</footer>
</main><script>const cap={{fixture:'The seeded board gives four cardinal placements plus a multi-leader note. Every orange card and leader is a real editable product record.',knee:'Browser acceptance after dragging the selected Callout leader’s immediate rail handle. The arrow now carries its authored multi-elbow route while both stock bindings remain intact.'}};document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{{const v=b.dataset.view;document.querySelectorAll('.gallery img').forEach(i=>i.classList.toggle('active',i.dataset.view===v));document.querySelectorAll('button[data-view]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.view===v)));document.querySelector('#caption').textContent=cap[v]}}));</script></body></html>"""
    OUTPUT.write_text(page, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
