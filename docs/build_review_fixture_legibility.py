#!/usr/bin/env python3
"""Build the self-contained review-fixture legibility report from live sweeps."""

from __future__ import annotations

import base64
import io
import json
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "review-fixture-legibility-2026-09-02.html"
EXAMPLE_BOARD = ROOT / "sketches" / "review" / "review-fixture-example.systemsketch"
EXAMPLE_SCREENSHOT = ROOT / "docs" / "assets" / "systemsketch-review-fixture-example.png"
SWEEP_SCRIPT = ROOT / "skills" / "systemsketch-review-fixture" / "scripts" / "create_layout_sweep.mjs"
SKILL = ROOT / "skills" / "systemsketch-review-fixture" / "SKILL.md"
QUALITY = ROOT / "skills" / "systemsketch-review-fixture" / "scripts" / "layout_quality.mjs"
QUALITY_TEST = ROOT / "skills" / "systemsketch-review-fixture" / "scripts" / "layout_quality.test.mjs"
SEEDS = (20260902, 8675309)


def png_uri_bytes(data: bytes) -> str:
    return f"data:image/png;base64,{base64.b64encode(data).decode()}"


def png_uri(path: Path) -> str:
    return png_uri_bytes(path.read_bytes())


def contact_sheet(directory: Path) -> bytes:
    screenshots = sorted(directory.glob("layout-*.png"))
    tiles: list[Image.Image] = []
    for screenshot in screenshots:
        image = Image.open(screenshot).convert("RGB")
        image.thumbnail((760, 543))
        tile = Image.new("RGB", (780, 583), "white")
        tile.paste(image, ((780 - image.width) // 2, 30))
        ImageDraw.Draw(tile).text((12, 8), screenshot.stem, fill="#171a21")
        tiles.append(tile)
    sheet = Image.new("RGB", (1560, 583 * ((len(tiles) + 1) // 2)), "#e9e7e2")
    for index, tile in enumerate(tiles):
        sheet.paste(tile, ((index % 2) * 780, (index // 2) * 583))
    output = io.BytesIO()
    sheet.save(output, format="PNG", optimize=True)
    return output.getvalue()


def run_sweep(seed: int, directory: Path) -> dict[str, object]:
    result = subprocess.run(
        [
            "node",
            str(SWEEP_SCRIPT),
            "--count",
            "6",
            "--seed",
            str(seed),
            "--output-dir",
            str(directory),
        ],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=True,
    )
    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    manifest["stdout"] = result.stdout
    manifest["contactSheet"] = png_uri_bytes(contact_sheet(directory))
    return manifest


def main() -> None:
    board = json.loads(EXAMPLE_BOARD.read_text(encoding="utf-8"))
    records = board["records"]
    example_shapes = [record for record in records if record.get("typeName") == "shape"]
    example_bindings = [record for record in records if record.get("typeName") == "binding"]
    arrow_bindings = [record for record in example_bindings if record.get("type") == "arrow"]
    elbow_cues = [
        record for record in example_shapes
        if record.get("type") == "arrow" and record.get("props", {}).get("kind") == "elbow"
    ]
    static_checks = QUALITY_TEST.read_text(encoding="utf-8").count("it('")
    skill_lines = len(SKILL.read_text(encoding="utf-8").splitlines())
    quality_lines = len(QUALITY.read_text(encoding="utf-8").splitlines())

    with tempfile.TemporaryDirectory(prefix="systemsketch-review-report-") as temporary:
        temporary_root = Path(temporary)
        sweeps = [run_sweep(seed, temporary_root / str(seed)) for seed in SEEDS]

    sweep_buttons = "".join(
        f'<button class="seed{" active" if index == 0 else ""}" data-seed="{seed}">Seed {seed}</button>'
        for index, seed in enumerate(SEEDS)
    )
    sweep_images = "".join(
        f'<img class="sheet{" active" if index == 0 else ""}" data-sheet="{seed}" '
        f'src="{sweep["contactSheet"]}" alt="Six randomized review boards generated with seed {seed}">'
        for index, (seed, sweep) in enumerate(zip(SEEDS, sweeps, strict=True))
    )
    example = png_uri(EXAMPLE_SCREENSHOT)

    page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Review fixture legibility loop</title>
<style>
  :root {{ color-scheme:light; --ink:#1c2027; --muted:#69707c; --paper:#f3f1ec;
    --card:#fff; --line:#d8d5ce; --orange:#f3943f; --green:#51c96b; --blue:#2e7de9; }}
  * {{ box-sizing:border-box }} body {{ margin:0; background:var(--paper); color:var(--ink);
    font:16px/1.48 Inter,ui-sans-serif,system-ui,sans-serif }}
  main {{ max-width:1240px; margin:auto; padding:52px 28px 80px }}
  .eyebrow {{ color:#b35b0d; font-size:12px; font-weight:850; letter-spacing:.14em; text-transform:uppercase }}
  h1 {{ max-width:900px; margin:10px 0 18px; font-size:clamp(44px,7vw,82px); line-height:.98;
    letter-spacing:-.055em }} h2 {{ margin:0 0 12px; font-size:28px; letter-spacing:-.025em }}
  h3 {{ margin:0 0 8px; font-size:19px }} p {{ color:var(--muted) }} .lead {{ max-width:850px; font-size:21px }}
  .chips {{ display:flex; flex-wrap:wrap; gap:10px; margin:28px 0 34px }}
  .chip {{ padding:9px 13px; border:1px solid var(--line); border-radius:999px; background:white; font-weight:750 }}
  .hero,.panel {{ overflow:hidden; background:var(--card); border:1px solid var(--line); border-radius:22px;
    box-shadow:0 14px 40px #2f2b2510 }} .hero img {{ display:block; width:100%; height:auto }}
  .caption {{ padding:18px 22px; border-top:1px solid var(--line); color:var(--muted) }}
  .section {{ margin-top:44px }} .compare {{ display:grid; grid-template-columns:1fr 1fr; gap:18px }}
  .panel {{ padding:24px }} .panel.bad {{ border-top:4px solid var(--orange) }} .panel.good {{ border-top:4px solid var(--green) }}
  .diagram {{ display:block; width:100%; height:auto; margin-top:18px; border-radius:14px; background:#f8f9fb }}
  .score {{ display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-top:18px }}
  .metric {{ background:#fff; border:1px solid var(--line); border-radius:16px; padding:18px }}
  .metric b {{ display:block; font-size:34px; line-height:1; letter-spacing:-.04em }} .metric span {{ color:var(--muted); font-size:13px }}
  .seedbar {{ display:flex; gap:8px; margin:16px 0 }} .seed {{ border:1px solid var(--line); background:white;
    border-radius:999px; padding:9px 14px; font-weight:780; cursor:pointer }} .seed.active {{ border-color:var(--blue); color:var(--blue); background:#eef5ff }}
  .sheet {{ display:none; width:100%; height:auto; border:1px solid var(--line); border-radius:18px }} .sheet.active {{ display:block }}
  .checks {{ display:grid; grid-template-columns:repeat(2,1fr); gap:12px; margin-top:18px }}
  .check {{ padding:18px; border:1px solid var(--line); border-radius:15px; background:white }}
  .check b {{ display:block; margin-bottom:5px }} .check span {{ color:var(--muted) }}
  code {{ background:#ece9e3; border-radius:5px; padding:2px 5px }} a {{ color:#256bcb; font-weight:720 }}
  footer {{ margin-top:42px; color:var(--muted) }}
  @media(max-width:820px) {{ .compare,.checks,.score {{ grid-template-columns:1fr }} }}
</style>
</head>
<body><main>
  <div class="eyebrow">SystemSketch · visual correction loop · 2026-09-02</div>
  <h1>Cue arrows now attach; the layout has room to breathe.</h1>
  <p class="lead">The generator moved from loose coordinates and one-example judgment to stock bound elbow arrows,
  executable spacing rules, and two reproducible six-board visual sweeps.</p>
  <div class="chips">
    <span class="chip">{len(elbow_cues)} bound elbow cues in the canonical example</span>
    <span class="chip">{len(arrow_bindings)} persisted cue bindings</span>
    <span class="chip">12 randomized boards</span>
    <span class="chip">2 seeds</span>
  </div>

  <section class="hero">
    <img src="{example}" alt="Updated SystemSketch review fixture with widely spaced cards and orange arrows approaching Block edges perpendicularly">
    <div class="caption"><b>The regenerated canonical fixture, cold-reopened in the real app.</b>
      Each targeted cue has a start binding to its card and an end binding to the named Block edge; the helper also moves the target 64 units and verifies the endpoint follows before restoring it.</div>
  </section>

  <section class="section">
    <h2>The failure and the corrected contract</h2>
    <div class="compare">
      <article class="panel bad">
        <div class="eyebrow">Before · loose geometry</div><h3>Coordinates only</h3>
        <p>Cards could touch, shafts could share a narrow corridor, and the arrow only looked attached. Moving the target exposed the lie.</p>
        <svg class="diagram" viewBox="0 0 520 250" role="img" aria-label="Loose arrows running beside a target edge">
          <rect x="35" y="32" width="195" height="74" rx="7" fill="#fff" stroke="#f3943f" stroke-width="3"/>
          <rect x="35" y="106" width="195" height="74" rx="7" fill="#fff" stroke="#f3943f" stroke-width="3"/>
          <rect x="340" y="42" width="145" height="166" rx="7" fill="#fff" stroke="#aeb3bc" stroke-width="2"/>
          <path d="M230 70 H304 V70 H326 V74" fill="none" stroke="#f3943f" stroke-width="4"/>
          <path d="M230 143 H302 V176 H326 V161" fill="none" stroke="#f3943f" stroke-width="4"/>
          <path d="M326 74 V161" fill="none" stroke="#f3943f" stroke-width="4" stroke-dasharray="5 6"/>
          <text x="357" y="68" font-size="17" font-family="sans-serif">target</text>
          <text x="53" y="68" font-size="16" font-family="sans-serif">1 · crowded</text>
          <text x="53" y="142" font-size="16" font-family="sans-serif">2 · touching</text>
        </svg>
      </article>
      <article class="panel good">
        <div class="eyebrow">Now · stock semantics</div><h3>Two bindings per cue</h3>
        <p>Cards sit outside the named edge; separate target lanes reserve perpendicular final segments, and the stock binding owns attachment.</p>
        <svg class="diagram" viewBox="0 0 520 250" role="img" aria-label="Bound elbow arrows meeting distinct points perpendicularly">
          <rect x="30" y="22" width="205" height="70" rx="7" fill="#fff" stroke="#f3943f" stroke-width="3"/>
          <rect x="30" y="142" width="205" height="70" rx="7" fill="#fff" stroke="#f3943f" stroke-width="3"/>
          <rect x="350" y="42" width="140" height="166" rx="7" fill="#fff" stroke="#aeb3bc" stroke-width="2"/>
          <path d="M235 57 H292 V82 H350" fill="none" stroke="#f3943f" stroke-width="4"/>
          <path d="M235 177 H292 V168 H350" fill="none" stroke="#f3943f" stroke-width="4"/>
          <path d="M342 76 L350 82 L342 88" fill="none" stroke="#f3943f" stroke-width="4"/>
          <path d="M342 162 L350 168 L342 174" fill="none" stroke="#f3943f" stroke-width="4"/>
          <circle cx="235" cy="57" r="5" fill="#f3943f"/><circle cx="235" cy="177" r="5" fill="#f3943f"/>
          <text x="367" y="68" font-size="17" font-family="sans-serif">target</text>
          <text x="47" y="58" font-size="16" font-family="sans-serif">1 · ≥48 gap</text>
          <text x="47" y="178" font-size="16" font-family="sans-serif">2 · own lane</text>
        </svg>
      </article>
    </div>
  </section>

  <section class="section">
    <h2>The loop, run twice</h2>
    <p>The first seed caught right-edge cropping. The fresh seed caught converging same-edge arrow lanes. The rules were tightened after each failure, then both six-board sets were regenerated from the live helper below.</p>
    <div class="seedbar">{sweep_buttons}</div>
    {sweep_images}
  </section>

  <section class="section">
    <h2>What is executable now</h2>
    <div class="score">
      <div class="metric"><b>48</b><span>minimum card gap</span></div>
      <div class="metric"><b>48</b><span>minimum same-edge lane gap</span></div>
      <div class="metric"><b>340×100</b><span>minimum cue-card size</span></div>
      <div class="metric"><b>{static_checks}</b><span>focused layout checks</span></div>
    </div>
    <div class="checks">
      <div class="check"><b>Edge anchors only</b><span>No ambiguous centre binding. Cards must sit outside top, right, bottom, or left.</span></div>
      <div class="check"><b>Axis-safe offsets</b><span><code>dy</code> selects a point along vertical edges; <code>dx</code> selects along horizontal edges.</span></div>
      <div class="check"><b>Text-fit estimate</b><span>Dense prose is rejected before the browser opens; enlarge or shorten the card.</span></div>
      <div class="check"><b>Persisted + moved</b><span>Cold reopen checks arrow kind, both bindings, named edge, then a 64-unit target-motion probe.</span></div>
    </div>
  </section>

  <footer>
    Live sources: <a href="../skills/systemsketch-review-fixture/SKILL.md">skill</a> ·
    <a href="../skills/systemsketch-review-fixture/scripts/create_fixture.mjs">fixture helper</a> ·
    <a href="../skills/systemsketch-review-fixture/scripts/create_layout_sweep.mjs">sweep</a> ·
    <a href="../skills/systemsketch-review-fixture/scripts/layout_quality.mjs">quality gates</a> ·
    <a href="../sketches/review/review-fixture-example.systemsketch">canonical fixture</a> ·
    {skill_lines} skill lines · {quality_lines} quality-gate lines.
  </footer>
</main>
<script>
  document.querySelectorAll('.seed').forEach((button) => button.addEventListener('click', () => {{
    document.querySelectorAll('.seed').forEach((item) => item.classList.toggle('active', item === button))
    document.querySelectorAll('.sheet').forEach((image) => image.classList.toggle('active', image.dataset.sheet === button.dataset.seed))
  }}))
</script>
</body></html>"""
    OUTPUT.write_text(page, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
