#!/usr/bin/env python3
"""Build the self-contained Type primitive implementation gallery."""
from __future__ import annotations

import base64
import html
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "type-primitive-2026-09-05.html"


def image_uri(relative: str) -> str:
    path = ROOT / relative
    return f"data:image/png;base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


def need(path: Path, *tokens: str) -> None:
    source = path.read_text(encoding="utf-8")
    missing = [token for token in tokens if token not in source]
    if missing:
        raise RuntimeError(f"{path.relative_to(ROOT)} is missing {missing!r}")


def count_it_blocks(path: Path) -> int:
    return len(re.findall(r"\n\tit\(", path.read_text(encoding="utf-8")))


def main() -> None:
    results_path = ROOT / "docs/assets/type-primitive.json"
    board_path = ROOT / "sketches/review/type-primitive.systemsketch"
    for path in (results_path, board_path):
        if not path.exists():
            raise RuntimeError(f"missing proof artifact: {path.relative_to(ROOT)}")

    need(ROOT / "src/blocks/typeAttributes.ts", "parseTypeAttributeSource", "createTypeProps", "bodyIndent")
    need(ROOT / "src/blocks/TypeTool.ts", "originPagePoint", "currentPagePoint")
    need(ROOT / "src/blocks/ui/TypeAttributeRegion.tsx", "onKeyDownCapture", "type-attribute-source")
    need(ROOT / "src/blocks/typeAttributePresentation.ts", "systemsketch.type-attributes.v1")
    need(ROOT / "src/SystemSketchUtilities.tsx", "systemsketch-dev-type-chevron-gutter", "Chevrons in code gutter")

    results = json.loads(results_path.read_text(encoding="utf-8"))
    passed = sum(1 for check in results if check["ok"])

    unit_tests = (
        count_it_blocks(ROOT / "src/blocks/typeAttributes.test.ts")
        + count_it_blocks(ROOT / "src/blocks/typeAttributePresentation.test.ts")
    )

    board = json.loads(board_path.read_text(encoding="utf-8"))
    records = board.get("records", [])
    shapes = [record for record in records if record.get("typeName") == "shape"]
    bindings = [record for record in records if record.get("typeName") == "binding"]

    source = "pose: Pose\n  position: Position\n    x: float\n    y: float\nquality: float"
    source_code = html.escape(source)

    checklist = "".join(
        f'<li class="{"pass" if check["ok"] else "fail"}"><b>{html.escape(check["id"])}</b> {html.escape(check["label"])}</li>'
        for check in results
    )

    board_image = image_uri("sketches/review/type-primitive.png")
    parsed_image = image_uri("docs/assets/type-primitive-parsed.png")
    product_image = image_uri("docs/assets/type-primitive-product.png")

    document = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Type primitive · SystemSketch</title>
<style>
:root {{ color-scheme:dark; --ink:#f5f7fb; --muted:#aab4c6; --line:#2d384b; --blue:#5aa7ff; --green:#62d58b; --red:#ff8a8a; --card:linear-gradient(145deg,#121b29,#0d1420); }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:#0a0f18; color:var(--ink); font:15px/1.55 Inter,ui-sans-serif,system-ui,sans-serif; }}
main {{ width:min(1180px,calc(100% - 32px)); margin:auto; padding:56px 0 76px; }}
h1 {{ font-size:clamp(36px,6vw,66px); line-height:1.0; letter-spacing:-.05em; margin:12px 0 22px; max-width:880px; }}
h2 {{ font-size:24px; margin:0 0 14px; letter-spacing:-.02em; }}
p {{ color:var(--muted); max-width:76ch; }}
.eyebrow {{ color:var(--blue); font-size:12px; font-weight:800; letter-spacing:.16em; text-transform:uppercase; }}
.lead {{ font-size:18px; color:#d9e0ec; }}
.metrics {{ display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin:30px 0 46px; }}
.metric,.panel {{ border:1px solid var(--line); background:var(--card); border-radius:16px; }}
.metric {{ padding:16px; }}
.metric b {{ display:block; font-size:26px; }}
.metric span {{ color:var(--muted); font-size:13px; }}
.panel {{ padding:22px; margin:18px 0; overflow:hidden; }}
.contract {{ display:grid; grid-template-columns:1fr 40px 1fr 40px 1fr; align-items:stretch; margin-top:16px; }}
.node {{ padding:16px; border:1px solid var(--line); border-top:4px solid var(--blue); border-radius:12px; background:#0d1420; }}
.node:nth-child(3) {{ border-top-color:#7fd6ff; }}
.node:nth-child(5) {{ border-top-color:var(--green); }}
.node b {{ display:block; margin-bottom:4px; font-size:15px; }}
.node span {{ color:var(--muted); font-size:13px; }}
.arrow {{ display:grid; place-items:center; color:#5a6b85; font-size:22px; }}
pre {{ margin:14px 0 0; padding:16px; overflow:auto; border-radius:10px; background:#050a12; color:#dceafb; font:13px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace; }}
.keyword {{ color:#86d6ff; }}
.grid2 {{ display:grid; grid-template-columns:1fr 1fr; gap:18px; align-items:start; }}
.shot {{ width:100%; border-radius:10px; border:1px solid var(--line); }}
.caption {{ margin:8px 2px 0; font-size:13px; color:var(--muted); }}
table {{ width:100%; border-collapse:collapse; }}
th,td {{ padding:10px 12px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; font-size:14px; }}
th {{ color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.06em; }}
tr:last-child td {{ border-bottom:0; }}
.ship {{ color:var(--green); font-weight:700; }}
ul.checks {{ list-style:none; margin:0; padding:0; columns:2; column-gap:24px; }}
ul.checks li {{ margin:0 0 8px; font-size:13.5px; break-inside:avoid; }}
ul.checks li.pass b {{ color:var(--green); }}
ul.checks li.fail b {{ color:var(--red); }}
ul.bugs {{ padding-left:20px; color:#dce4ef; }}
ul.bugs li {{ margin:12px 0; }}
code {{ color:#b9dcff; background:#111b29; padding:2px 6px; border-radius:6px; }}
.footer {{ margin-top:36px; padding-top:20px; border-top:1px solid var(--line); font-size:13px; color:var(--muted); }}
@media (max-width:820px) {{ .metrics,.grid2 {{ grid-template-columns:1fr; }} .contract {{ grid-template-columns:1fr; }} .arrow {{ height:20px; transform:rotate(90deg); }} ul.checks {{ columns:1; }} }}
</style>
</head>
<body>
<main>
  <div class="eyebrow">SystemSketch · Block primitive · 5 September 2026</div>
  <h1>One editable source.<br>One compact Type face.</h1>
  <p class="lead">Type is a Block-shaped domain definition, not a second canvas engine. Its attributes stay as exact multiline text for native cursor, Enter, paste, and undo behavior; the Port face reads that same text as a collapsible nested tree.</p>

  <section class="metrics" aria-label="Measured results">
    <div class="metric"><b>{passed} / {len(results)}</b><span>real-browser checks passed</span></div>
    <div class="metric"><b>{unit_tests}</b><span>parser &amp; preference unit tests</span></div>
    <div class="metric"><b>1</b><span>canonical source field</span></div>
    <div class="metric"><b>{len(shapes)} / {len(bindings)}</b><span>review fixture shapes / bound arrows</span></div>
  </section>

  <section class="panel">
    <h2>A deliberately small data model</h2>
    <div class="contract">
      <div class="node"><b>Type Block</b><span>The existing Block shape, title, views, selection, history, and toolbar seams — nothing new.</span></div>
      <div class="arrow">&rarr;</div>
      <div class="node"><b>attributeSource</b><span>One opaque string. Never prettified, split into row records, or made dependent on a parser succeeding.</span></div>
      <div class="arrow">&rarr;</div>
      <div class="node"><b>Read projection</b><span>The parser supplies a dense tree only. Fold state and chevron placement are local presentation state.</span></div>
    </div>
    <pre><span class="keyword"># exact authored source</span>
{source_code}</pre>
    <p class="caption">A pasted <code>class Foo(NamedTuple):</code> body loses its wrapper and docstring on display, and the body's own indent is <em>learned</em> from the first indented line rather than assumed to be four spaces — a 2-space or tab-indented paste nests exactly the same way.</p>
  </section>

  <section class="grid2">
    <article class="panel">
      <h2>Compact tree, real edits</h2>
      <img class="shot" src="{parsed_image}" alt="A selected Type block showing a nested pose/position/quality attribute tree with Python type coloring">
      <p class="caption">Pasting the NamedTuple source above projects into this tree; the wrapper and its docstring never became rows.</p>
    </article>
    <article class="panel">
      <h2>Product toolbar</h2>
      <img class="shot" src="{product_image}" alt="A Type block drawn in the product composition from the System family toolbar slot">
      <p class="caption">Drawn from the System family slot beside Block, Branch, Loop, and Pill — no keyboard shortcut, so <code>T</code> stays stock text.</p>
    </article>
  </section>

  <section class="panel">
    <h2>Two real bugs the browser proof caught</h2>
    <ul class="bugs">
      <li><b>Escape didn't cancel.</b> tldraw's own container listens for Escape in the bubble phase and unconditionally calls <code>container.focus()</code> there — which blurs whatever text field was open and runs its commit handler <em>before</em> a same-phase handler on that field ever sees the key. A typed draft was committing anyway. Fixed by intercepting Escape in the capture phase, which runs before tldraw's bubble-phase listener exists.</li>
      <li><b>A fixed-size box snapped to the wrong corner.</b> Unlike the Pill capsule, a Type stays resizable while it is being drawn, so the box tool's own live-resize rewrites the drawn shape's geometry before <code>onCreate</code> ever runs. Computing "keep the drag centred" from that already-resized geometry landed the box off by half its width. Reading the gesture's real endpoints from <code>editor.inputs.originPagePoint</code> / <code>currentPagePoint</code> instead fixed it exactly.</li>
    </ul>
  </section>

  <section class="panel">
    <h2>Five attribute-region directions considered</h2>
    <table>
      <thead><tr><th>Direction</th><th>Editing contract</th><th>Why source-first shipped</th></tr></thead>
      <tbody>
        <tr><td class="ship">Source-first tree — shipped</td><td>One multiline text field; the tree is a read view.</td><td>Preserves native code editing; exactly one canonical body.</td></tr>
        <tr><td>Foldable code cell</td><td>A code editor plus a separate compact summary.</td><td>Strong editor, but the compact face becomes a second representation to keep in sync.</td></tr>
        <tr><td>Structured table</td><td>One editable row per field.</td><td>Direct scanning, but nesting and paste become grid operations.</td></tr>
        <tr><td>Direct contenteditable outline</td><td>Contenteditable tree rows.</td><td>Selection, IME, and structural Enter rules become a custom editor.</td></tr>
        <tr><td>Card + inspector</td><td>Canvas summary; details in a side panel.</td><td>Hides the type system exactly where the user is modelling.</td></tr>
      </tbody>
    </table>
  </section>

  <section class="panel">
    <h2>Real-browser proof — {passed}/{len(results)} checks</h2>
    <ul class="checks">{checklist}</ul>
    <p class="caption">Runs the actual Type tool (drag centring, fixed size), a real paste into the source textarea, Escape-cancel, blur-commit, fold/unfold, undo/redo as one step, the <code>T</code>-stays-text guarantee, the System family menu, and the Dev Hub gutter switch — twice, once in the Block Dev harness and once in the product composition. Source: <code>tests/type_primitive_smoke.mjs</code>.</p>
  </section>

  <section class="panel">
    <h2>Human review board</h2>
    <img class="shot" src="{board_image}" alt="Guided Type primitive review board with three numbered steps, orange bound arrows, and a green PASS WHEN card">
    <p class="caption">Cue arrows carry real tldraw bindings — moving the Type keeps all three attached — verified live, not just generated.</p>
  </section>

  <div class="footer">Generated from the current tree and the smoke test's own JSON output by <code>docs/build_type_primitive.py</code>. Migration: Block schema V7 &rarr; V8 (<code>attributeSource</code>, additive and reversible). The source text and the ordinary regression suite remain the living specification.</div>
</main>
</body>
</html>
"""
    OUTPUT.write_text(document, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
