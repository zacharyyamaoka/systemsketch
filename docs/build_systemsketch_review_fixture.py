#!/usr/bin/env python3
"""Build the self-contained review-fixture implementation gallery."""

from __future__ import annotations

import base64
import html
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "systemsketch-review-fixture-2026-09-01.html"
SCREENSHOT = ROOT / "docs" / "assets" / "systemsketch-review-fixture-example.png"
BOARD = ROOT / "sketches" / "review" / "review-fixture-example.systemsketch"
RECIPE = ROOT / "skills" / "systemsketch-review-fixture" / "assets" / "example-review-recipe.json"
SKILL = ROOT / "skills" / "systemsketch-review-fixture" / "SKILL.md"


def image_uri(path: Path) -> str:
    return f"data:image/png;base64,{base64.b64encode(path.read_bytes()).decode()}"


def main() -> None:
    document = json.loads(BOARD.read_text(encoding="utf-8"))
    recipe = json.loads(RECIPE.read_text(encoding="utf-8"))
    records = document["records"]
    shapes = [record for record in records if record.get("typeName") == "shape"]
    bindings = [record for record in records if record.get("typeName") == "binding"]
    subject_x = next(record["x"] for record in shapes if record.get("id") == "shape:subject")
    skill_lines = len(SKILL.read_text(encoding="utf-8").splitlines())
    source = html.escape(json.dumps(recipe, indent=2, ensure_ascii=False))
    screenshot = image_uri(SCREENSHOT)

    page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch review fixtures</title>
<style>
  :root {{ color-scheme: light; --ink:#202126; --muted:#666a73; --paper:#f5f3ef;
    --card:#fff; --line:#dedbd3; --orange:#f38b2a; --green:#34b968; --violet:#635bff; }}
  * {{ box-sizing:border-box }} body {{ margin:0; color:var(--ink); background:var(--paper);
    font:16px/1.5 Inter,ui-sans-serif,system-ui,sans-serif }}
  main {{ max-width:1220px; margin:auto; padding:52px 28px 76px }}
  h1 {{ max-width:940px; margin:10px 0 18px; font-size:clamp(42px,7vw,82px); line-height:.98;
    letter-spacing:-.055em }} h2 {{ margin:0 0 14px; font-size:28px; letter-spacing:-.025em }}
  p {{ color:var(--muted) }} .eyebrow {{ color:var(--violet); font-weight:800; text-transform:uppercase;
    letter-spacing:.13em; font-size:12px }} .lead {{ max-width:820px; font-size:21px }}
  .chips {{ display:flex; flex-wrap:wrap; gap:10px; margin:28px 0 34px }}
  .chip {{ background:#fff; border:1px solid var(--line); border-radius:999px; padding:9px 13px; font-weight:700 }}
  .hero,.card {{ background:var(--card); border:1px solid var(--line); border-radius:22px;
    box-shadow:0 12px 34px #2f2e2910 }} .hero {{ overflow:hidden }}
  .hero img {{ display:block; width:100%; height:auto }} .caption {{ padding:17px 21px; border-top:1px solid var(--line) }}
  .grid {{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:18px; margin-top:18px }}
  .card {{ padding:24px }} .metric {{ font-size:42px; line-height:1; font-weight:850; letter-spacing:-.045em }}
  .flow {{ display:grid; grid-template-columns:repeat(5,1fr); gap:10px; align-items:stretch; margin-top:18px }}
  .step {{ position:relative; min-height:150px; padding:18px; background:white; border:1px solid var(--line);
    border-radius:16px }} .step:not(:last-child)::after {{ content:'→'; position:absolute; right:-18px; top:55px;
    z-index:2; color:var(--orange); font-size:26px; font-weight:900 }}
  .step b {{ display:block; margin-bottom:8px }} .step span {{ color:var(--muted); font-size:14px }}
  .good {{ border-top:4px solid var(--green) }} .warn {{ border-top:4px solid var(--orange) }}
  .checks {{ list-style:none; padding:0; margin:10px 0 0 }} .checks li {{ margin:10px 0; padding-left:27px; position:relative }}
  .checks li::before {{ content:'✓'; position:absolute; left:0; color:var(--green); font-weight:900 }}
  details {{ margin-top:18px; background:#17181c; color:#efefe9; border-radius:18px; overflow:hidden }}
  summary {{ cursor:pointer; padding:18px 22px; font-weight:800 }} pre {{ margin:0; padding:0 22px 24px;
    overflow:auto; font:13px/1.5 ui-monospace,SFMono-Regular,monospace; color:#d6d4ff }}
  a {{ color:#5148e8; font-weight:700 }} footer {{ margin-top:34px; color:var(--muted) }}
  @media (max-width:850px) {{ .grid {{ grid-template-columns:1fr }} .flow {{ grid-template-columns:1fr }}
    .step:not(:last-child)::after {{ content:'↓'; right:auto; left:50%; top:auto; bottom:-24px }} }}
</style>
</head>
<body><main>
  <div class="eyebrow">Implemented · real-app round trip</div>
  <h1>A finished feature now hands you a ready-to-test board.</h1>
  <p class="lead">Agents seed the exact objects, put the gesture and pass condition on the canvas,
  cold-reopen the saved <code>.systemsketch</code>, then leave Preview running at that board.</p>
  <div class="chips">
    <span class="chip">{len(shapes)} editable shapes</span>
    <span class="chip">{len(bindings)} semantic bindings in this simple example</span>
    <span class="chip">{BOARD.stat().st_size:,} byte board</span>
    <span class="chip">{skill_lines} line skill</span>
  </div>

  <section class="hero">
    <img src="{screenshot}" alt="The real SystemSketch app showing a Block, two numbered orange cue cards with arrows, and a green pass card">
    <div class="caption"><b>The generated artifact, reopened in the real product.</b>
      The cue shapes are ordinary editable tldraw objects; the centre target is a real SystemSketch Block.</div>
  </section>

  <section style="margin-top:38px">
    <h2>The handoff path</h2>
    <div class="flow">
      <div class="step warn"><b>1 · Recover intent</b><span>Read the just-finished diff, source, and regression test when the standing prompt omits feature detail.</span></div>
      <div class="step"><b>2 · Write a recipe</b><span>Partial real shapes plus numbered callouts. No complete persisted records or schema versions.</span></div>
      <div class="step"><b>3 · Author in Editor</b><span>The running app fills defaults and validates current Block, connection, and binding schemas.</span></div>
      <div class="step good"><b>4 · Autosave + reopen</b><span>Assert the envelope, inventory, console, and a cold reload before copying the fixture out.</span></div>
      <div class="step good"><b>5 · Human review</b><span>Inspect the PNG, drive the gesture once, then send the exact <code>?board=</code> Preview URL.</span></div>
    </div>
  </section>

  <section class="grid" style="margin-top:38px">
    <div class="card warn">
      <div class="eyebrow">Borrowed from Agents365</div>
      <h2>Readable layout and visual cues</h2>
      <p>The upstream skill is a strong starting point for coordinate planning, callout legibility,
      and screenshot self-checking. Its raw schema skeleton is intentionally not copied here.</p>
      <a href="https://github.com/Agents365-ai/tldraw-skill">Open the upstream skill</a>
    </div>
    <div class="card good">
      <div class="eyebrow">SystemSketch adaptation</div>
      <h2>The app owns its file format</h2>
      <p>SystemSketch has custom Block and cable records plus its own top-level envelope. The helper
      creates partials through the registered Editor and relies on the product's real autosave serializer.</p>
      <a href="https://tldraw.dev/reference/tldraw/serializeTldrawJson">Official serializer reference</a>
    </div>
    <div class="card">
      <div class="metric">200 px</div>
      <p>The example's instructed drag was driven through CDP in the real app. The stored Block moved
      from x={subject_x:g} to x={subject_x + 200:g} exactly.</p>
    </div>
    <div class="card">
      <h2>Observed gates</h2>
      <ul class="checks">
        <li>Skill validator passes</li>
        <li>New board autosaves with <code>systemSketch</code> first</li>
        <li>{len(shapes)} shapes survive a cold reopen</li>
        <li>Generated PNG was visually inspected</li>
        <li>Existing output and <code>~/SystemSketch</code> writes are refused</li>
      </ul>
    </div>
  </section>

  <details><summary>See the small recipe that produced the board</summary><pre>{source}</pre></details>

  <footer>
    Artifacts: <a href="../skills/systemsketch-review-fixture/SKILL.md">skill</a> ·
    <a href="../skills/systemsketch-review-fixture/references/recipe.md">recipe reference</a> ·
    <a href="../sketches/review/review-fixture-example.systemsketch">example board</a> ·
    <a href="build_systemsketch_review_fixture.py">gallery builder</a>
  </footer>
</main></body></html>"""
    OUTPUT.write_text(page, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
