#!/usr/bin/env python3
"""Build the self-contained Expanded Block layout-scope implementation gallery."""

from __future__ import annotations

import base64
import html
import json
from pathlib import Path


HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
OUTPUT = HERE / "expanded-block-layout-scope-2026-09-02.html"
BEFORE = HERE / "assets/expanded-block-layout-scope-before-2026-09-02.png"
AFTER = HERE / "assets/expanded-block-layout-scope-after-2026-09-02.png"
RESULTS = HERE / "assets/expanded-block-layout-scope-results-2026-09-02.json"
FIXTURE = ROOT / "sketches/review/expanded-block-layout-scope.png"


def data_url(path: Path) -> str:
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def main() -> None:
    checks = json.loads(RESULTS.read_text(encoding="utf-8"))
    if len(checks) != 7 or not all(check.get("ok") for check in checks):
        raise RuntimeError("the seven-check real-browser proof is missing or incomplete")

    required = {
        ROOT / "src/blocks/expandedBlockLayoutScope.ts": [
            "shape.parentId === parent.id",
            "shape.parentId === parent.id",
        ],
        ROOT / "src/blocks/layout/organizeNodes.ts": [
            "expandedScopeHasBoundaryConnection",
            "virtualRailId",
            "insufficient-space",
            "pageRectContains",
        ],
        ROOT / "src/blocks/connections/tidyEdges.ts": [
            "getSelectedExpandedBlockLayoutScope",
            "expandedScope.connections",
        ],
    }
    for path, tokens in required.items():
        source = path.read_text(encoding="utf-8")
        if any(token not in source for token in tokens):
            raise RuntimeError(f"the Expanded Block layout seam is incomplete in {path.name}")

    checklist = "".join(
        f"<li>{html.escape(check['label'])}</li>" for check in checks
    )
    OUTPUT.write_text(TEMPLATE.format(
        before=data_url(BEFORE),
        after=data_url(AFTER),
        fixture=data_url(FIXTURE),
        checklist=checklist,
    ), encoding="utf-8")
    print(OUTPUT)


TEMPLATE = r'''<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>SystemSketch · Expanded Block layout scope</title>
<style>
:root{{--bg:#091019;--panel:#101a28;--panel2:#152338;--ink:#f5f7fb;--muted:#9eacc0;--line:#2c3b50;--blue:#69a2ff;--mint:#6ee7b7;--amber:#f6b85f;color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif}}
*{{box-sizing:border-box}}body{{margin:0;background:radial-gradient(circle at 78% 0,rgba(71,126,216,.2),transparent 35rem),var(--bg);color:var(--ink)}}
.shell{{width:min(1240px,calc(100% - 36px));margin:auto;padding:50px 0 76px}}.eyebrow{{color:#a9c7ff;font:800 11px ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase}}
h1{{max-width:940px;margin:14px 0 13px;font-size:clamp(43px,6vw,72px);line-height:.98;letter-spacing:-.055em}}.lede{{max-width:930px;margin:0;color:#c4cfdd;font-size:19px;line-height:1.6}}
.stats{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:28px}}.stat,.card{{border:1px solid var(--line);border-radius:17px;background:rgba(16,26,40,.94)}}.stat{{padding:17px 19px}}.stat b{{display:block;font-size:27px}}.stat span{{color:var(--muted);font-size:13px}}
section{{margin-top:56px}}h2{{margin:0 0 9px;font-size:32px;letter-spacing:-.035em}}.copy{{max-width:930px;margin:0 0 22px;color:var(--muted);line-height:1.65}}
.compare{{position:relative;overflow:hidden;border:1px solid #3a4a62;border-radius:18px;background:#e8ebef;box-shadow:0 18px 50px #0007;aspect-ratio:1550/980}}.compare img{{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}}.compare .after{{clip-path:inset(0 calc(100% - var(--split,50%)) 0 0)}}.compare input{{position:absolute;z-index:3;inset:auto 5% 18px;width:90%;accent-color:var(--blue)}}.labels{{position:absolute;z-index:2;inset:14px 14px auto;display:flex;justify-content:space-between;pointer-events:none}}.labels span{{padding:7px 10px;border:1px solid #ffffff20;border-radius:999px;background:#08101dcc;font-weight:800;font-size:12px}}
.grid2{{display:grid;grid-template-columns:1fr 1fr;gap:15px;align-items:start}}figure{{margin:0;overflow:hidden;border:1px solid var(--line);border-radius:17px;background:var(--panel)}}figure img{{display:block;width:100%;height:auto}}figcaption{{padding:13px 15px;color:var(--muted);font-size:13px;line-height:1.55}}figcaption b{{display:block;margin-bottom:4px;color:var(--ink)}}
table{{width:100%;border-collapse:collapse;overflow:hidden;border:1px solid var(--line);border-radius:15px;background:var(--panel)}}th,td{{padding:13px 15px;border-bottom:1px solid var(--line);text-align:left}}th{{color:#bcd0ef;font-size:12px}}td{{color:#cad4e1;font-size:14px}}tr:last-child td{{border-bottom:0}}.yes{{color:var(--mint);font-weight:800}}.no{{color:#718096}}.note{{color:var(--amber)}}
.flow{{display:grid;grid-template-columns:1fr 44px 1fr 44px 1fr;align-items:stretch}}.flow .card{{padding:20px}}.flow h3{{margin:0 0 7px;font-size:17px}}.flow p{{margin:0;color:var(--muted);line-height:1.55}}.arrow{{display:grid;place-items:center;color:var(--blue);font-size:27px}}code{{padding:2px 5px;border-radius:5px;background:#203048;color:#e5edf8;font:600 12px ui-monospace,monospace}}
.card.checks{{padding:22px}}ul{{margin:0;padding:0;list-style:none}}li{{position:relative;margin:0 0 12px;padding-left:26px;color:#cbd6e4;line-height:1.5}}li:last-child{{margin-bottom:0}}li:before{{content:'✓';position:absolute;left:0;color:var(--mint);font-weight:900}}footer{{margin-top:55px;padding-top:20px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}}
@media(max-width:820px){{.stats,.grid2{{grid-template-columns:1fr 1fr}}.flow{{grid-template-columns:1fr;gap:10px}}.arrow{{transform:rotate(90deg)}}}}@media(max-width:520px){{.stats,.grid2{{grid-template-columns:1fr}}}}
</style></head><body><main class="shell">
<div class="eyebrow">SystemSketch · implementation proof · 2026-09-02</div>
<h1>Select the container. Lay out its inside.</h1>
<p class="lede">A lone Expanded Block is now an intentional exception to the ordinary two-node rule. Tidy edges operates on cables owned by that interior; Organize nodes moves its immediate child Blocks and uses the parent’s input/output ports as virtual rails. Outside objects and nested interiors remain out of scope.</p>
<div class="stats"><div class="stat"><b>1</b><span>selected container required</span></div><div class="stat"><b>20 + 20</b><span>outside stress sentinels</span></div><div class="stat"><b>7 / 7</b><span>real-browser checks</span></div><div class="stat"><b>0</b><span>scope leaks observed</span></div></div>

<section><h2>The real before / after</h2><p class="copy">Drag the slider. The same selected parent stays fixed while three overlapping immediate children become a left-to-right chain between the parent’s boundary ports. The nested child remains inside its nested Block.</p>
<div class="compare" id="compare"><img src="{before}" alt="Before: three overlapping child Blocks inside the selected Expanded Block"/><img class="after" src="{after}" alt="After: three child Blocks arranged left to right between parent boundary ports"/><div class="labels"><span>Before</span><span>After</span></div><input aria-label="Before and after split" type="range" min="0" max="100" value="50" /></div></section>

<section><h2>The exception is narrow</h2><table><thead><tr><th>Selection</th><th>Tidy edges</th><th>Organize nodes</th><th>Why</th></tr></thead><tbody>
<tr><td>Expanded Block · 2+ immediate child Blocks</td><td class="yes">Shown</td><td class="yes">Shown</td><td>There is a real interior graph to arrange.</td></tr>
<tr><td>Expanded Block · 1 boundary-connected child</td><td class="yes">Shown</td><td class="yes">Shown</td><td>The parent port supplies a non-arbitrary alignment target.</td></tr>
<tr><td>Expanded Block · 1 disconnected child</td><td class="no">Hidden</td><td class="no">Hidden</td><td>Moving one unconstrained child would be arbitrary.</td></tr>
<tr><td>Expanded Block · nested Expanded child</td><td class="yes">Direct scope</td><td class="yes">Atomic child</td><td class="note">The nested Block may move; its private contents do not.</td></tr>
<tr><td>Ordinary selection · 2+ Blocks</td><td>Incident selected scope</td><td>Selected Blocks</td><td>The existing behavior is unchanged.</td></tr>
</tbody></table></section>

<section><h2>How the boundary stays honest</h2><div class="flow"><div class="card"><h3>Resolve one scope</h3><p>Immediate children have <code>parentId === selected.id</code>. Interior cables use that same canonical owner.</p></div><div class="arrow">→</div><div class="card"><h3>Lay out with virtual rails</h3><p>Used parent input and output ports become temporary ELK rail nodes at their exact vertical positions.</p></div><div class="arrow">→</div><div class="card"><h3>Commit guarded edits</h3><p>Only real immediate child positions are written. If the result cannot fit, nothing moves and the parent is never resized.</p></div></div></section>

<section><h2>Human review board</h2><p class="copy">The saved fixture begins immediately before the gesture: two tangled children, four coincident cables, parent boundary connections, numbered cues, and a visible pass condition.</p><figure><img src="{fixture}" alt="Generated SystemSketch review fixture for Expanded Block layout scope"/><figcaption><b>Generated and cold-reopened through the real editor</b>Select only <code>run()</code>, click Tidy edges, then click Organize nodes. The children should spread between the boundary ports without moving or resizing the parent.</figcaption></figure></section>

<section><h2>Executable evidence</h2><div class="card checks"><ul>{checklist}</ul></div></section>
<footer>Generated by <code>docs/build_expanded_block_layout_scope.py</code> from the current source, the seven-check real-browser result, and the generated review fixture. tldraw remains stock and pinned; the feature uses existing selection, containment, binding, and layout seams.</footer>
</main><script>const c=document.querySelector('#compare'),r=c.querySelector('input');r.addEventListener('input',()=>c.style.setProperty('--split',r.value+'%'));</script></body></html>'''


if __name__ == "__main__":
    main()
