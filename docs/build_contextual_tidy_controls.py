#!/usr/bin/env python3
"""Build the self-contained contextual layout controls implementation gallery."""

from __future__ import annotations

import base64
import html
import io
import json
from pathlib import Path

from PIL import Image


HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
OUTPUT = HERE / "contextual-tidy-controls-2026-09-02.html"
LIVE = HERE / "assets/contextual-tidy-controls-live-2026-09-02.png"
RESULTS = HERE / "assets/contextual-tidy-controls-results-2026-09-02.json"
FIXTURE = ROOT / "sketches/review/contextual-tidy-controls.png"
SOURCE = ROOT / "src/chrome/SelectionLayoutActions.tsx"
HOST = ROOT / "src/chrome/SystemSketchChrome.tsx"
BASE_REVISION = "5cc8c94"


def data_url(path: Path) -> str:
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def crop_data_url(path: Path, box: tuple[int, int, int, int]) -> str:
    image = Image.open(path).convert("RGB").crop(box)
    output = io.BytesIO()
    image.save(output, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(output.getvalue()).decode("ascii")


def main() -> None:
    checks = json.loads(RESULTS.read_text(encoding="utf-8"))
    if len(checks) != 5 or not all(check.get("ok") for check in checks):
        raise RuntimeError("the five-check browser proof is missing or incomplete")

    source = SOURCE.read_text(encoding="utf-8")
    host = HOST.read_text(encoding="utf-8")
    required = [
        "getSelectionLayoutActionAvailability",
        'data-testid="selection-action-tidy-edges"',
        'data-testid="selection-action-organize-nodes"',
        "getTidyEdgesSelection(editor).length > 0",
    ]
    if any(token not in source for token in required):
        raise RuntimeError("the contextual layout action seam is incomplete")
    if "const outcome = tidyEdges(editor)" not in host or "const outcome = await organizeNodes(editor)" not in host:
        raise RuntimeError("the contextual controls no longer call the existing commands")

    checklist = "".join(
        f"<li>{html.escape(check['label'])}</li>" for check in checks
    )
    page = TEMPLATE.format(
        base=BASE_REVISION,
        live=data_url(LIVE),
        crop=crop_data_url(LIVE, (520, 742, 920, 848)),
        fixture=data_url(FIXTURE),
        checklist=checklist,
    )
    OUTPUT.write_text(page, encoding="utf-8")
    print(OUTPUT)


TEMPLATE = r'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>SystemSketch · contextual tidy controls</title>
<style>
:root{{--bg:#0a0e16;--panel:#111827;--panel2:#182235;--ink:#f6f8fc;--muted:#9aa9bd;--line:#2d3a50;--blue:#69a0ff;--mint:#70dda9;--orange:#ffad58;color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif}}
*{{box-sizing:border-box}}body{{margin:0;background:radial-gradient(circle at 75% -10%,rgba(105,160,255,.22),transparent 35rem),var(--bg);color:var(--ink)}}
.shell{{width:min(1160px,calc(100% - 36px));margin:auto;padding:48px 0 72px}}.eyebrow{{font:800 11px ui-monospace,monospace;letter-spacing:.13em;text-transform:uppercase;color:#a9c7ff}}
h1{{max-width:880px;margin:14px 0 12px;font-size:clamp(42px,6vw,70px);line-height:.98;letter-spacing:-.055em}}.lede{{max-width:890px;margin:0;color:#c3ccda;font-size:18px;line-height:1.6}}
.stats{{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:28px}}.stat,.card{{border:1px solid var(--line);border-radius:17px;background:rgba(17,24,39,.92)}}.stat{{padding:17px 19px}}.stat b{{display:block;font-size:27px}}.stat span{{color:var(--muted);font-size:13px}}
section{{margin-top:54px}}h2{{margin:0 0 8px;font-size:31px;letter-spacing:-.035em}}.copy{{max-width:900px;margin:0 0 22px;color:var(--muted);line-height:1.65}}
.demo{{display:grid;grid-template-columns:320px 1fr;gap:16px}}.card{{padding:20px}}.card h3{{margin:0 0 8px;font-size:17px}}.card p{{margin:0;color:var(--muted);line-height:1.55}}
.states{{display:grid;gap:8px;margin-top:16px}}.states button{{padding:10px 12px;border:1px solid var(--line);border-radius:9px;color:var(--muted);background:#0d1420;text-align:left;cursor:pointer}}.states button[aria-pressed=true]{{border-color:var(--blue);color:var(--ink);background:#172a49}}
.stage{{display:grid;min-height:330px;place-items:center;border:1px solid var(--line);border-radius:17px;background:radial-gradient(circle,#222c3d 1px,transparent 1.2px) 0 0/22px 22px,#0d131e}}
.selection{{position:relative;width:390px;height:160px;border:2px solid var(--blue);border-radius:8px}}.node{{position:absolute;width:118px;height:72px;border:1px solid #8eb7ff;border-radius:8px;background:#172238;box-shadow:0 8px 20px #0006}}.node.a{{left:18px;bottom:18px}}.node.b{{right:18px;top:18px}}.node:after{{content:'';position:absolute;top:34px;width:118px;border-top:2px solid #8793a4;transform:translateX(118px)}}
.pill{{position:absolute;left:50%;bottom:calc(100% + 16px);display:flex;transform:translateX(-50%);padding:4px;border-radius:13px;background:#1e1e1e;box-shadow:0 9px 25px #0009}}.pill button{{display:grid;width:36px;height:32px;place-items:center;border:0;border-left:1px solid #ffffff20;color:white;background:transparent}}.pill button:first-child{{border-left:0}}.pill svg{{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round}}.pill circle{{fill:currentColor;stroke:none}}.pill [hidden]{{display:none}}
figure{{margin:0;overflow:hidden;border:1px solid #3a4861;border-radius:17px;background:#f5f6f8;box-shadow:0 18px 46px #0006}}figure img{{display:block;width:100%;height:auto}}figcaption{{padding:12px 15px;background:var(--panel);color:var(--muted);font-size:13px;line-height:1.5}}figcaption b{{display:block;margin-bottom:3px;color:var(--ink)}}.grid2{{display:grid;grid-template-columns:1fr 1fr;gap:15px;align-items:start}}
table{{width:100%;border-collapse:collapse;border:1px solid var(--line);border-radius:14px;background:var(--panel);overflow:hidden}}th,td{{padding:12px 14px;border-bottom:1px solid var(--line);text-align:left}}th{{color:#bcd0f2;font-size:12px}}td{{color:#c6d0df;font-size:14px}}tr:last-child td{{border-bottom:0}}.yes{{color:var(--mint);font-weight:800}}.no{{color:#64748b}}
.flow{{display:grid;grid-template-columns:1fr 54px 1fr 54px 1fr;align-items:center}}.flow .card{{min-height:150px}}.arrow{{text-align:center;color:var(--blue);font-size:29px}}code{{padding:2px 5px;border-radius:5px;background:#202c40;color:#dce6f7;font:600 12px ui-monospace,monospace}}
ul{{margin:0;padding:0;list-style:none}}li{{position:relative;margin:0 0 11px;padding-left:25px;color:#cbd5e3;line-height:1.5}}li:before{{content:'✓';position:absolute;left:0;color:var(--mint);font-weight:900}}footer{{margin-top:54px;padding-top:20px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}}
@media(max-width:820px){{.stats,.demo,.grid2{{grid-template-columns:1fr}}.flow{{grid-template-columns:1fr;gap:10px}}.arrow{{transform:rotate(90deg)}}}}
</style>
</head>
<body><main class="shell">
<div class="eyebrow">SystemSketch · implementation · base {base}</div>
<h1>Tidy where the selection already is.</h1>
<p class="lede">Tidy edges and Organize nodes now sit in the floating selection toolbar as compact one-click actions. They are affordances over the existing commands—not a second layout system—so command-palette, right-click, and toolbar behavior share the same selection-local contract.</p>
<div class="stats"><div class="stat"><b>2</b><span>compact layout actions</span></div><div class="stat"><b>5 / 5</b><span>real-browser checks</span></div><div class="stat"><b>0</b><span>new persisted layout state</span></div></div>

<section><h2>The visible interaction</h2><p class="copy">Choose a selection below. The pill exposes only useful actions: an edge or a Block with incident cables gets the bent-route glyph; two selected Blocks get the FigJam-like 3×3 organize glyph.</p>
<div class="demo"><div class="card"><h3>Selection</h3><p>These switches change only the demonstration state.</p><div class="states">
<button type="button" aria-pressed="true" data-state="edge">One selected edge</button>
<button type="button" aria-pressed="false" data-state="block">One Block + incident edges</button>
<button type="button" aria-pressed="false" data-state="blocks">Two connected Blocks</button>
<button type="button" aria-pressed="false" data-state="plain">Plain shape</button>
</div></div>
<div class="stage"><div class="selection"><div class="pill" aria-label="Selection actions demo"><button data-action="tidy" title="Tidy edges" aria-label="Tidy edges"><svg viewBox="0 0 20 20"><path d="M3 4.5h4.5v3H13v-3h4M3 10h7.5v3H14v-3h3M3 15.5h3v-3h3"/></svg></button><button data-action="organize" title="Organize nodes" aria-label="Organize nodes" hidden><svg viewBox="0 0 20 20"><rect x="3" y="3" width="14" height="14" rx="2"/><circle cx="6" cy="6" r=".85"/><circle cx="10" cy="6" r=".85"/><circle cx="14" cy="6" r=".85"/><circle cx="6" cy="10" r=".85"/><circle cx="10" cy="10" r=".85"/><circle cx="14" cy="10" r=".85"/><circle cx="6" cy="14" r=".85"/><circle cx="10" cy="14" r=".85"/><circle cx="14" cy="14" r=".85"/></svg></button></div><div class="node a"></div><div class="node b"></div></div></div></div></section>

<section><h2>What appears when</h2><table><thead><tr><th>Selection</th><th>Tidy edges</th><th>Organize nodes</th></tr></thead><tbody>
<tr><td>Selected semantic connection</td><td class="yes">Shown</td><td class="no">Hidden</td></tr>
<tr><td>One Block with incident connections</td><td class="yes">Shown</td><td class="no">Hidden</td></tr>
<tr><td>Two selected Blocks, disconnected</td><td class="no">Hidden</td><td class="yes">Shown</td></tr>
<tr><td>Two selected Blocks with connections</td><td class="yes">Shown</td><td class="yes">Shown</td></tr>
<tr><td>Plain shapes only</td><td class="no">Hidden</td><td class="no">Hidden</td></tr>
</tbody></table></section>

<section><h2>One read model, existing commands</h2><div class="flow"><div class="card"><h3>Selection signal</h3><p><code>getSelectedShapes()</code> and the existing <code>getTidyEdgesSelection()</code> decide applicability.</p></div><div class="arrow">→</div><div class="card"><h3>Compact controls</h3><p>The toolbar renders only applicable buttons with accessible names and native hover tooltips.</p></div><div class="arrow">→</div><div class="card"><h3>Existing command</h3><p><code>tidyEdges(editor)</code> or <code>organizeNodes(editor)</code> performs the same undoable write and toast.</p></div></div></section>

<section><h2>Real product evidence</h2><div class="grid2"><figure><img src="{crop}" alt="Close crop of the live floating selection toolbar with bent-route and 3 by 3 grid actions"/><figcaption><b>Actual toolbar crop</b>The bent route and 3×3 grid sit at the pill's right edge, beside existing Block and inspector controls.</figcaption></figure><figure><img src="{live}" alt="Live SystemSketch with two selected Blocks and both contextual layout controls"/><figcaption><b>Full live-app frame</b>A two-Block selection with incident cables exposes both actions; the screenshot was captured by the focused acceptance journey.</figcaption></figure></div></section>

<section><h2>Human review fixture</h2><p class="copy">The generated board starts with three tangled connected Blocks and one unselected scope sentinel. Select the three Blocks, click the bent-cables icon, then the 3×3 grid. The sentinel must stay fixed.</p><figure><img src="{fixture}" alt="SystemSketch review board with three numbered contextual-toolbar cues and a green pass condition"/><figcaption><b>Generated through the real editor</b>The saved <code>.systemsketch</code> cold-reopened successfully and every orange cue arrow remains bound at both ends.</figcaption></figure></section>

<section><h2>Executable evidence</h2><div class="card"><ul>{checklist}</ul></div></section>
<footer>Generated by <code>docs/build_contextual_tidy_controls.py</code> from the current source, the five-check real-browser result, and the generated review fixture. The stock tldraw engine, Block shape, connection shape, and layout algorithms are unchanged.</footer>
</main>
<script>
const state={{edge:[true,false],block:[true,false],blocks:[true,true],plain:[false,false]}};
document.querySelectorAll('[data-state]').forEach(button=>button.addEventListener('click',()=>{{
  document.querySelectorAll('[data-state]').forEach(other=>other.setAttribute('aria-pressed',String(other===button)));
  const [tidy,organize]=state[button.dataset.state];
  document.querySelector('[data-action=tidy]').hidden=!tidy;
  document.querySelector('[data-action=organize]').hidden=!organize;
}}));
</script></body></html>'''


if __name__ == "__main__":
    main()
