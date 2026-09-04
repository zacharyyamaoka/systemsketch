#!/usr/bin/env python3
"""Build the self-contained control-icon implementation gallery.

Run after ``npm run test:control-icons`` so the report embeds the actual
browser capture and the measured 13-check acceptance transcript.
"""

from __future__ import annotations

import base64
import html
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
ASSETS = DOCS / "assets"
RESULTS = json.loads((ASSETS / "control-icon-placement-acceptance.json").read_text(encoding="utf-8"))
SCREENSHOT = base64.b64encode((ASSETS / "control-icon-placement-acceptance.png").read_bytes()).decode("ascii")
OUTPUT = DOCS / "control-icon-placement-implementation-2026-09-03.html"


def flow_card(title: str, body: str, css: str) -> str:
    return f'<div class="flow-card {css}"><b>{html.escape(title)}</b><span>{html.escape(body)}</span></div>'


def main() -> None:
    passed = sum(bool(item["ok"]) for item in RESULTS)
    rows = "\n".join(
        f"<tr class=\"{'ok' if item['ok'] else 'bad'}\"><td>{html.escape(item['id'])}</td>"
        f"<td>{html.escape(item['label'])}</td><td>{'PASS' if item['ok'] else 'FAIL'}</td></tr>"
        for item in RESULTS
    )
    image = f"data:image/png;base64,{SCREENSHOT}"
    document = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Control icon placement — implementation gallery</title>
<style>
:root{{--ink:#152033;--muted:#5d6b7e;--line:#dbe3ee;--paper:#f6f8fb;--card:#fff;--blue:#2672e7;--red:#d92828;--green:#16834c;--orange:#ee8a19}}
*{{box-sizing:border-box}} body{{margin:0;background:var(--paper);color:var(--ink);font:16px/1.5 Inter,ui-sans-serif,system-ui,sans-serif}} main{{max-width:1280px;margin:auto;padding:48px 28px 72px}} h1{{font-size:clamp(32px,5vw,58px);line-height:1.04;letter-spacing:-.045em;margin:0 0 14px}} h2{{font-size:25px;letter-spacing:-.02em;margin:0 0 12px}} p{{max-width:900px}} a{{color:#1556b5}} code{{background:#eaf0f7;border-radius:5px;padding:2px 5px;font:13px ui-monospace,SFMono-Regular,monospace}} .eyebrow{{color:#285eaa;font-weight:800;letter-spacing:.12em;text-transform:uppercase;font-size:12px}} .lede{{font-size:20px;color:#3a485b;max-width:900px}} .facts{{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:28px 0}} .fact,.panel{{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px 20px;box-shadow:0 5px 18px #1a35500a}} .fact b{{display:block;font-size:28px}} .fact span{{color:var(--muted);font-size:13px}} .flow{{display:grid;grid-template-columns:1fr 34px 1fr 34px 1fr 34px 1fr;align-items:stretch;margin:18px 0 34px}} .flow-card{{border:1px solid var(--line);border-radius:14px;padding:16px;min-height:126px;background:#fff;display:flex;flex-direction:column;justify-content:center}} .flow-card b{{font-size:17px}} .flow-card span{{font-size:13px;color:var(--muted);margin-top:5px}} .strict{{border-top:4px solid var(--red)}} .map{{border-top:4px solid var(--orange)}} .meta{{border-top:4px solid var(--blue)}} .paint{{border-top:4px solid var(--green)}} .arrow{{display:grid;place-items:center;color:#8b9bb0;font-size:26px}} figure{{margin:22px 0;background:#fff;border:1px solid var(--line);border-radius:16px;padding:12px;box-shadow:0 5px 18px #1a35500a}} figure img{{display:block;width:100%;border-radius:9px}} figcaption{{padding:10px 5px 2px;color:var(--muted);font-size:14px}} .grid{{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:22px 0}} ul{{padding-left:20px}} li{{margin:7px 0}} table{{width:100%;border-collapse:collapse;font-size:14px}} td{{padding:10px 8px;border-top:1px solid var(--line);vertical-align:top}} td:last-child{{font-weight:800;color:var(--green)}} tr.bad td:last-child{{color:var(--red)}} footer{{margin-top:42px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}} @media(max-width:760px){{main{{padding:28px 16px}}.facts,.grid{{grid-template-columns:1fr}}.flow{{grid-template-columns:1fr;gap:8px}}.arrow{{transform:rotate(90deg);height:22px}}}}
</style></head><body><main>
<div class="eyebrow">SystemSketch · 3 September 2026</div>
<h1>Control exits are metadata,<br>not wires.</h1>
<p class="lede">The offline Python pass finds <code>break</code> and <code>continue</code>; the canvas faithfully shows those persisted lists in the owning Loop or Branch-arm header. The live app performs no source walk.</p>
<section class="facts"><div class="fact"><b>{passed}/{len(RESULTS)}</b><span>real-browser acceptance checks</span></div><div class="fact"><b>7</b><span>computed badges across six source cases</span></div><div class="fact"><b>0</b><span>icons leaked from a nested loop</span></div></section>
<h2>The deliberately narrow boundary</h2>
<div class="flow">{flow_card('Python source', 'The only place an AST is walked.', 'strict')}<div class="arrow">→</div>{flow_card('Explicit owner map', 'Source region ids map to semantic Loop / arm identities, never canvas coordinates.', 'map')}<div class="arrow">→</div>{flow_card('Shape props', 'The batch command writes controlIcons lists; empty lists clear stale output.', 'meta')}<div class="arrow">→</div>{flow_card('Header renderer', 'React reads the list and draws fixed, right-aligned red badges.', 'paint')}</div>
<section class="grid"><article class="panel"><h2>What ships</h2><ul><li><code>scripts/place_control_icons.py</code> mirrors the frozen AST rule: If changes owner; Try/With are transparent; nested loops stop descent.</li><li><code>controlIcons</code> is optional durable data on both Loop props and Branch arms, so older boards remain valid.</li><li>One shared SVG family preserves the selected grammar: octagonal <code>!</code> for Break; rounded <code>»</code> for Continue.</li></ul></article><article class="panel"><h2>What remains intentionally absent</h2><ul><li>No parser in <code>src/</code>, no control-flow cable, and no geometry-derived source ownership.</li><li>No guessed <code>match</code>/<code>case</code> lowering or Loop <code>else:</code> behavior.</li><li>The source map fails closed if a computed owner has no target, rather than silently omitting a badge.</li></ul></article></section>
<h2>Six real cases, one saved board</h2><figure><img src="{image}" alt="Real SystemSketch board showing six control-icon placement cases and instructional cards"><figcaption>Fresh real-browser capture after the batch pass. The red marks occupy the Loop / Branch header lane; c6's outer Loop and nested Loop correctly show none.</figcaption></figure>
<section class="grid"><article class="panel"><h2>Review it</h2><p><a href="../sketches/review/control-icon-placement.systemsketch">Open the saved review board</a> · <a href="../sketches/review/control-icon-placement.png">PNG</a> · <a href="../sketches/review/control-icon-placement.recipe.json">recipe</a></p><p>On c4, fold and reopen the first arm. Its Break badge remains attached to the compressed header; the test drives that exact gesture.</p></article><article class="panel"><h2>Measured browser proof</h2><table><tbody>{rows}</tbody></table></article></section>
<footer>Built by <code>docs/build_control_icon_placement_implementation.py</code> from the real-browser transcript and screenshot. The implementation and regression tests remain the living specification.</footer>
</main></body></html>"""
    OUTPUT.write_text(document, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
