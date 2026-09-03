#!/usr/bin/env python3
"""Build the self-contained Loop contents-layout implementation gallery."""

from __future__ import annotations

import base64
import html
import json
from pathlib import Path


DOCS = Path(__file__).resolve().parent
ROOT = DOCS.parent
OUTPUT = DOCS / "loop-contents-layout-2026-09-03.html"
BEFORE = DOCS / "assets" / "loop-contents-layout-live-2026-09-03.png"
AFTER = DOCS / "assets" / "loop-contents-layout-organized-2026-09-03.png"
FIXTURE = ROOT / "sketches" / "review" / "loop-contents-layout.png"
RESULTS = DOCS / "assets" / "loop-contents-layout-results-2026-09-03.json"


def data_url(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def required_source(path: Path, *needles: str) -> None:
    source = path.read_text(encoding="utf-8")
    missing = [needle for needle in needles if needle not in source]
    if missing:
        raise RuntimeError(f"{path.name} is missing: {', '.join(missing)}")


def main() -> None:
    checks = json.loads(RESULTS.read_text(encoding="utf-8"))
    if len(checks) != 5 or not all(check.get("ok") for check in checks):
        raise RuntimeError("the five-check Loop browser proof is missing or incomplete")
    required_source(
        ROOT / "src/blocks/expandedBlockLayoutScope.ts",
        "getSelectedLoopLayoutScope",
        "getSelectedContainerLayoutScope",
        "ownedByContainer",
    )
    required_source(
        ROOT / "src/blocks/layout/organizeNodes.ts",
        "scope: 'loop'",
        "loopInteriorInPage",
        "inside the Loop",
    )
    required_source(
        ROOT / "src/chrome/SystemSketchChrome.tsx",
        "hasVisibleActions",
        "hasAppearance",
    )
    for asset in [BEFORE, AFTER, FIXTURE]:
        if not asset.is_file():
            raise RuntimeError(f"missing required visual evidence: {asset}")

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
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Loop contents layout · SystemSketch</title>
<style>
:root{{--ink:#17212d;--muted:#617083;--paper:#f6f8fb;--panel:#fff;--line:#dbe3ed;--blue:#3577e5;--orange:#ef8a35;--green:#159866;--dark:#1e1e1e;font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:var(--ink);background:var(--paper)}}
*{{box-sizing:border-box}}body{{margin:0;background:radial-gradient(circle at 72% -8%,#dcecff,transparent 34rem),var(--paper)}}.page{{width:min(1220px,calc(100% - 32px));margin:auto;padding:54px 0 82px}}.eyebrow{{font:800 11px ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--blue)}}h1{{max-width:900px;margin:13px 0;font-size:clamp(42px,6vw,68px);line-height:.98;letter-spacing:-.06em}}h2{{font-size:29px;letter-spacing:-.035em;margin:0 0 9px}}.lede,.copy{{max-width:900px;color:var(--muted);line-height:1.65;font-size:17px}}section{{margin-top:60px}}.stats{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:28px}}.stat,.card,figure,table{{border:1px solid var(--line);background:rgba(255,255,255,.94);border-radius:16px;box-shadow:0 10px 30px #2f49610d}}.stat{{padding:17px}}.stat b{{display:block;font-size:27px}}.stat span{{font-size:13px;color:var(--muted)}}.compare{{position:relative;overflow:hidden;aspect-ratio:1560/960;border:1px solid var(--line);border-radius:17px;background:#eef1f5;box-shadow:0 12px 34px #20384d24}}.compare img{{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}}.compare .after{{clip-path:inset(0 calc(100% - var(--split,52%)) 0 0)}}.compare input{{position:absolute;z-index:3;left:5%;bottom:18px;width:90%;accent-color:var(--blue)}}.labels{{position:absolute;inset:14px 14px auto;z-index:2;display:flex;justify-content:space-between;pointer-events:none}}.labels span{{padding:6px 10px;border-radius:99px;color:#fff;background:#182536d9;font-size:12px;font-weight:800}}.grid{{display:grid;grid-template-columns:1fr 1fr;gap:16px}}figure{{margin:0;overflow:hidden}}figure img{{display:block;width:100%;height:auto}}figcaption{{padding:13px 15px;color:var(--muted);font-size:13px;line-height:1.5}}figcaption b{{display:block;color:var(--ink);margin-bottom:3px}}table{{border-collapse:separate;border-spacing:0;width:100%;overflow:hidden}}th,td{{padding:14px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}}tr:last-child td{{border-bottom:0}}th{{font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted)}}.yes{{color:var(--green);font-weight:800}}.no{{color:#778496}}.flow{{display:grid;grid-template-columns:1fr 44px 1fr 44px 1fr;align-items:stretch}}.card{{padding:20px}}.card h3{{margin:0 0 8px;font-size:17px}}.card p{{margin:0;color:var(--muted);line-height:1.55}}.arrow{{display:grid;place-items:center;color:var(--blue);font-size:28px}}ul{{margin:0;padding:0;list-style:none}}li{{position:relative;padding-left:26px;margin-bottom:12px;color:var(--muted);line-height:1.5}}li:last-child{{margin-bottom:0}}li:before{{content:'✓';position:absolute;left:0;color:var(--green);font-weight:900}}.checks{{padding:22px}}a{{color:#175fcb;font-weight:700;text-decoration:none}}a:hover{{text-decoration:underline}}code{{padding:2px 5px;border-radius:5px;background:#e8eef6;font:600 12px ui-monospace,monospace}}footer{{margin-top:58px;padding-top:20px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}}
@media(max-width:780px){{.stats,.grid{{grid-template-columns:1fr 1fr}}.flow{{grid-template-columns:1fr;gap:10px}}.arrow{{transform:rotate(90deg)}}}}@media(max-width:500px){{.stats,.grid{{grid-template-columns:1fr}}}}
</style></head><body><main class="page">
<div class="eyebrow">SystemSketch · Loop region · implementation proof · 2026-09-03</div>
<h1>A Loop can organize what it contains.</h1>
<p class="lede">Selecting a populated For Loop now exposes the same compact layout controls as a container Block. <strong>Organize nodes</strong> reflows only its immediate child Blocks inside the open body; <strong>Tidy edges</strong> stays with the Loop’s composited cables. A selection with no applicable action has no contextual pill at all.</p>
<div class="stats"><div class="stat"><b>3</b><span>Loop child Blocks arranged</span></div><div class="stat"><b>5 / 5</b><span>live-browser checks</span></div><div class="stat"><b>0</b><span>exterior moves allowed</span></div><div class="stat"><b>0</b><span>empty pills rendered</span></div></div>

<section><h2>Before → organized</h2><p class="copy">Drag the splitter. The selected Loop itself stays fixed; its scattered direct children become a readable left-to-right dataflow. The Loop header and footer remain outside the safe placement rectangle.</p><div class="compare" id="compare"><img src="{after}" alt="The same Loop after organizing its child Blocks"><img class="after" src="{before}" alt="Selected Loop before organizing its contents"><div class="labels"><span>Before</span><span>After</span></div><input aria-label="Before and after split" type="range" min="0" max="100" value="52"></div></section>

<section><h2>One container contract, two region types</h2><table><thead><tr><th>Selected subject</th><th>Tidy edges</th><th>Organize nodes</th><th>Scope</th></tr></thead><tbody><tr><td>Expanded Block</td><td class="yes">Shown when interior cables exist</td><td class="yes">2+ direct children, or one with a boundary rail</td><td>Immediate children; nested Blocks stay atomic.</td></tr><tr><td>Loop</td><td class="yes">Its owned/composited cables</td><td class="yes">2+ direct child Blocks</td><td>The Loop body; header ports remain semantic operators, not fake side rails.</td></tr><tr><td>Any selection with no action</td><td class="no">Hidden</td><td class="no">Hidden</td><td>No empty dark selection pill is mounted.</td></tr></tbody></table></section>

<section><h2>Why the Loop path is deliberately different</h2><div class="flow"><div class="card"><h3>Resolve direct membership</h3><p>A Block belongs only when its real <code>parentId</code> is the selected Loop. Nested containers are kept whole.</p></div><div class="arrow">→</div><div class="card"><h3>Keep the operator honest</h3><p>The Loop header’s item outlet points downward, not left or right. Its boundary is excluded from ELK’s Block-only rail model.</p></div><div class="arrow">→</div><div class="card"><h3>Guard the body</h3><p>The ELK result must fit below the header and above the footer. If it does not, no position is written and the Loop is never resized implicitly.</p></div></div></section>

<section><h2>Review board, ready to drive</h2><p class="copy">The saved board starts with three tangled direct children, real semantic cables, numbered orange cues, and a green visible pass condition. I opened this exact board on the isolated Preview, selected the Loop, used Organize nodes, confirmed the reflow, then undid it so the board remains ready for your first gesture.</p><figure><img src="{fixture}" alt="Loop contents layout review fixture"><figcaption><b>Click the For each pose Loop, then click the grid icon</b>Pass when <code>decode()</code>, <code>merge()</code>, and <code>encode()</code> become a clear flow without anything outside the Loop moving.</figcaption></figure><p class="copy"><a href="../sketches/review/loop-contents-layout.systemsketch">Open the editable review fixture</a> · <a href="../sketches/review/loop-contents-layout-recipe.json">View its recipe</a></p></section>

<section><h2>Executable evidence</h2><div class="card checks"><ul>{checklist}</ul></div></section>
<footer>Built by <code>docs/build_loop_contents_layout.py</code> from the current track’s live-browser captures and review fixture. The report embeds its visual evidence and needs no server to inspect.</footer>
</main><script>const c=document.querySelector('#compare'),r=c.querySelector('input');r.addEventListener('input',()=>c.style.setProperty('--split',r.value+'%'));</script></body></html>'''


if __name__ == "__main__":
    main()
