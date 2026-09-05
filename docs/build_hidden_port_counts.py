#!/usr/bin/env python3
"""Build the self-contained hidden-port-count implementation gallery."""
from __future__ import annotations

import base64
import html
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs'
OUTPUT = DOCS / 'hidden-port-counts-2026-09-04.html'
SCREENSHOT = DOCS / 'assets' / 'hidden-port-counts-2026-09-04.png'


def inline_png(path: Path) -> str:
    return 'data:image/png;base64,' + base64.b64encode(path.read_bytes()).decode('ascii')


def source_contains(path: str, text: str) -> bool:
    return text in (ROOT / path).read_text(encoding='utf-8')


def main() -> None:
    image = inline_png(SCREENSHOT)
    guards = [
        ('One layout projection computes the disclosure', source_contains('src/blocks/layoutBlock.ts', 'hiddenPortSummaries')),
        ('Canvas does not persist a second display count', source_contains('src/blocks/ui/BlockCanvas.tsx', 'HiddenPortSummaries')),
        ('SVG export uses the same layout result', source_contains('src/blocks/BlockShapeUtil.tsx', 'layout.hiddenPortSummaries')),
        ('Browser journey drives the inspector Hide / Show control', source_contains('tests/hidden_port_counts_smoke.mjs', 'Hide / Show control')),
    ]
    assert all(value for _label, value in guards)
    guard_rows = ''.join(
        f'<li><span class="pass">PASS</span>{html.escape(label)}</li>'
        for label, value in guards if value
    )
    OUTPUT.write_text(f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Hidden port counts · SystemSketch</title>
<style>
:root{{--ink:#f5f7fb;--muted:#a9b6c8;--line:#2d3c54;--panel:#131c2b;--bg:#080d16;--blue:#5ba3ff;--green:#55d79a;--orange:#ffad57}}*{{box-sizing:border-box}}body{{margin:0;background:radial-gradient(circle at 20% -25%,#193b6f 0,transparent 43%),var(--bg);color:var(--ink);font:16px/1.5 Inter,ui-sans-serif,system-ui,sans-serif}}main{{max-width:1220px;margin:auto;padding:54px 28px 82px}}.eyebrow{{color:var(--blue);font-size:12px;font-weight:800;letter-spacing:.15em;text-transform:uppercase}}h1{{max-width:920px;margin:9px 0 16px;font-size:clamp(42px,7vw,82px);line-height:.95;letter-spacing:-.065em}}.lead{{max-width:800px;color:var(--muted);font-size:19px}}.hero,.proof{{display:grid;grid-template-columns:1.6fr 1fr;gap:18px;margin-top:34px}}.card{{overflow:hidden;border:1px solid var(--line);border-radius:18px;background:color-mix(in srgb,var(--panel) 94%,transparent);box-shadow:0 24px 70px #0004}}.frame{{padding:12px;background:#f6f7f9}}.frame img{{display:block;width:100%;border-radius:10px}}.caption,.pad{{padding:17px 19px;color:var(--muted)}}.caption b,.pad b{{color:var(--ink)}}.result{{padding:26px}}.result h2,.pad h2{{margin:0 0 8px;font-size:20px}}.big{{color:var(--green);font-size:52px;font-weight:850;line-height:1}}.mapping{{display:grid;grid-template-columns:1fr 36px 1fr;gap:12px;align-items:stretch;margin-top:18px}}.side{{border:1px solid var(--line);border-radius:15px;padding:19px;background:var(--panel)}}.side h2{{margin:0 0 9px;font-size:19px}}.side p{{margin:0;color:var(--muted)}}.arrow{{align-self:center;color:var(--blue);font-size:28px;text-align:center}}code{{padding:2px 5px;border-radius:5px;background:#080e1a;color:#dbeafe;font:13px ui-monospace,SFMono-Regular,monospace}}ul{{margin:0;padding:0;list-style:none}}li{{padding:10px 0;border-bottom:1px solid var(--line)}}li:last-child{{border:0}}.pass{{display:inline-block;margin-right:8px;border-radius:999px;padding:2px 6px;background:var(--green);color:#07150f;font-size:10px;font-weight:900;letter-spacing:.05em}}.note{{margin-top:18px;border-left:3px solid var(--blue);border-radius:0 12px 12px 0;background:#111d31;padding:17px 19px;color:var(--muted)}}.note b{{color:var(--ink)}}@media(max-width:800px){{main{{padding:36px 16px}}.hero,.proof,.mapping{{grid-template-columns:1fr}}.arrow{{transform:rotate(90deg)}}}}
</style></head><body><main>
<div class="eyebrow">SystemSketch · Block face implementation · 2026-09-04</div>
<h1>Hide the ports, not the size of the contract.</h1>
<p class="lead">A Block’s compact Port or Expanded face now says exactly how many input and output ports were intentionally hidden: <code>+3 more</code> and <code>+2 more</code>. The count is truthful, per side, and stays out of Simple view where ports are deliberately anonymous.</p>
<section class="hero"><figure class="card"><div class="frame"><img src="{image}" alt="A SystemSketch Component Block with two visible inputs, one visible output, and plus three more and plus two more hidden-port labels"></div><figcaption class="caption"><b>Real Block Dev browser capture.</b> “Component” shows two visible inputs, one visible output, then the separate input/output disclosures. The inspector remains the place to choose what surfaces.</figcaption></figure><aside class="card result"><h2>Evidence</h2><div class="big">4/4</div><p>Real-browser checks passed.</p><p><b>21/21</b> focused layout tests passed.</p><p><b>Build:</b> TypeScript + production Vite build passed.</p></aside></section>
<section class="mapping"><article class="side"><h2>Stored truth</h2><p>Each port retains its stable <code>visible</code> flag and identity. A hidden port still exists for connections and can be restored through the inspector; it is not deleted or turned into a synthetic summary row.</p></article><div class="arrow">→</div><article class="side"><h2>Face projection</h2><p><code>layoutBlock()</code> omits hidden dots and rows, then derives a small per-side disclosure from those same stored lanes. If there is no body room after the last shown port, the label uses the footer band instead of overlapping a row.</p></article></section>
<section class="proof"><article class="card pad"><h2>Live journey</h2><ul><li><span class="pass">PASS</span><code>+3 more</code> inputs and <code>+2 more</code> outputs paint separately.</li><li><span class="pass">PASS</span>Hidden ports paint no phantom dots or rows.</li><li><span class="pass">PASS</span>The inspector’s real Hide / Show eye updates the face immediately.</li><li><span class="pass">PASS</span>Restoring every output removes only its output disclosure.</li></ul></article><article class="card pad"><h2>Regression guards</h2><ul>{guard_rows}</ul></article></section>
<p class="note"><b>WHY:</b> a compact surface should reduce visual noise without suggesting an incomplete component interface. Keeping the count derived, rather than serializing it, makes the small label follow the source-of-truth visibility flags and prevents stale display state. The same layout data is used for HTML and SVG export.</p>
</main></body></html>''', encoding='utf-8')
    print(OUTPUT)


if __name__ == '__main__':
    main()
