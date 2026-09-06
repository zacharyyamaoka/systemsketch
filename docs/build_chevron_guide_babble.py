#!/usr/bin/env python3
"""Build the chevron placement / indent-guide prior-art report.

Zach asked, after seeing V1 and its two style variants live: "look at prior
art for where the chevron and guide line should go, and whether the chevron
should be hover-only or always visible" — then implement the prior-art
recommendation plus a couple more variants. This report records the actual
citations behind the recommendation and compares all six variants.

Measures facts directly from the live tree. Source:
`src/blocks/babble/TypeBabbleV1Variants.tsx`, `TypeBabbleV1.tsx`,
`type-babble.css`. Board:
`sketches/review/chevron-guide-babble.systemsketch`.
"""
from __future__ import annotations

import base64
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "chevron-guide-babble-2026-09-05.html"


def image_uri(relative: str) -> str:
    path = ROOT / relative
    if not path.exists():
        raise RuntimeError(f"missing capture: {relative}")
    return f"data:image/png;base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


def need(path: Path, *tokens: str) -> None:
    source = path.read_text(encoding="utf-8")
    missing = [token for token in tokens if token not in source]
    if missing:
        raise RuntimeError(f"{path.relative_to(ROOT)} is missing {missing!r}")


def main() -> None:
    need(ROOT / "src/blocks/babble/TypeBabbleV1Variants.tsx",
         "TypeBabbleV1PriorArt", "TypeBabbleV1HoverReveal", "TypeBabbleV1DotToggle")
    need(ROOT / "src/blocks/babble/TypeBabbleV1.tsx", "ChevronVisibility", "ChevronGlyph", "'muted-rail'")
    need(ROOT / "src/blocks/babble/type-babble.css", "chevronGlyph--dot", "chevronGlyph--hoverOnly", "guide--muted-rail")

    board = image_uri("sketches/review/chevron-guide-babble.png")
    row1 = image_uri("docs/assets/chevron-guide-row1.png")
    row2 = image_uri("docs/assets/chevron-guide-row2.png")

    variants = [
        {
            "name": "V1 (original pick)", "accent": "#e0a92f",
            "chevron": "Trailing, always visible", "guide": "Solid, accent-tinted",
            "verdict": "Ships-shaped baseline. The accent rail is confident but competes with the accent-colored links inside the tree for attention.",
        },
        {
            "name": "AltA", "accent": "#4d8dff",
            "chevron": "Leading, always visible", "guide": "Solid, accent-tinted",
            "verdict": "Closer to convention on placement; the rail still reads as strongly as the interactive links, which is the one thing prior art argues against.",
        },
        {
            "name": "AltB", "accent": "#b46bff",
            "chevron": "Trailing, always visible", "guide": "Dotted, muted",
            "verdict": "The guide is already muted here — only the chevron side is still off from convention.",
        },
        {
            "name": "Prior Art (recommended)", "accent": "#3fa46a",
            "chevron": "Leading, always visible", "guide": "Solid, muted",
            "verdict": "Every citation below points the same direction at once: this is the one that matches all three.",
        },
        {
            "name": "Hover Reveal", "accent": "#d15b7a",
            "chevron": "Leading, hover-only", "guide": "Solid, muted",
            "verdict": "Cleanest at rest. Costs exactly what NN/g and Zach's own Information Scent note predict: nothing on the page says a row is expandable until the pointer happens to land on it.",
        },
        {
            "name": "Dot Toggle", "accent": "#5aa7ff",
            "chevron": "Leading dot (hollow/filled), always visible", "guide": "Solid, muted",
            "verdict": "Reads as a status indicator before it reads as \"click to expand\" — the triangle's directionality (it points where the content will go) is doing more work than it gets credit for.",
        },
    ]

    def variant_row(v: dict) -> str:
        return f"""
      <tr style="--accent:{v['accent']}">
        <td><b>{v['name']}</b></td>
        <td>{v['chevron']}</td>
        <td>{v['guide']}</td>
        <td>{v['verdict']}</td>
      </tr>"""

    rows = "".join(variant_row(v) for v in variants)

    document = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Chevron and indent-guide prior art · SystemSketch</title>
<style>
:root {{ color-scheme:dark; --ink:#f5f7fb; --muted:#aab4c6; --line:#2d384b; --blue:#5aa7ff; --green:#62d58b; --card:linear-gradient(145deg,#121b29,#0d1420); }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:#0a0f18; color:var(--ink); font:15px/1.55 Inter,ui-sans-serif,system-ui,sans-serif; }}
main {{ width:min(1180px,calc(100% - 32px)); margin:auto; padding:56px 0 76px; }}
h1 {{ font-size:clamp(30px,5vw,50px); line-height:1.05; letter-spacing:-.04em; margin:12px 0 22px; max-width:920px; }}
h2 {{ font-size:22px; margin:0 0 10px; letter-spacing:-.02em; }}
p {{ color:var(--muted); max-width:76ch; }}
.eyebrow {{ color:var(--blue); font-size:12px; font-weight:800; letter-spacing:.16em; text-transform:uppercase; }}
.lead {{ font-size:18px; color:#d9e0ec; max-width:900px; }}
.panel {{ border:1px solid var(--line); background:var(--card); border-radius:16px; padding:22px; margin:18px 0; overflow:hidden; }}
.shot {{ width:100%; border-radius:10px; border:1px solid var(--line); margin-top:10px; background:#fff; }}
.caption {{ margin:8px 2px 16px; font-size:13px; color:var(--muted); }}
a {{ color:var(--blue); }}
code {{ color:#b9dcff; background:#111b29; padding:2px 6px; border-radius:6px; font-size:.92em; }}
table {{ width:100%; border-collapse:collapse; margin-top:8px; }}
th, td {{ text-align:left; padding:10px 12px; border-bottom:1px solid var(--line); font-size:13.5px; vertical-align:top; }}
th {{ color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.06em; }}
tr td:first-child {{ border-left:3px solid var(--accent); color:var(--ink); font-size:14px; }}
.recommend {{ border:1px solid var(--green); background:color-mix(in srgb, var(--green) 10%, var(--card)); }}
.cite {{ padding-left:20px; margin:8px 0 0; }}
.cite li {{ margin:10px 0; color:var(--muted); }}
.cite b {{ color:#e2e8f4; }}
.footer {{ margin-top:36px; padding-top:20px; border-top:1px solid var(--line); font-size:13px; color:var(--muted); }}
</style>
</head>
<body>
<main>
  <div class="eyebrow">SystemSketch · Dev-only babble · 5 September 2026</div>
  <h1>Where should the chevron sit, and should it hide until you hover it?</h1>
  <p class="lead">A short prior-art pass on the two style variants (AltA, AltB) Zach saw live, before babbling a couple more. Same shared V1 engine throughout — chevron placement, chevron visibility, chevron glyph, and guide-line style are all now independent props on <code>TypeBabbleV1Engine</code>, so every combination below is a real, running block, not a mockup.</p>

  <section class="panel">
    <h2>The citations</h2>
    <ul class="cite">
      <li><b>Chevron placement — leading, near-universally.</b> Every mainstream file/tree browser (Windows Explorer, macOS Finder, VS Code's Explorer and Outline views, GitHub's repo file tree, JetBrains IDEs) places the disclosure control <em>before</em> the label. The <a href="https://en.wikipedia.org/wiki/Disclosure_widget">Disclosure widget</a> pattern itself is defined as a triangle that rotates between a sideways (collapsed) and downward (expanded) orientation, sitting at the head of the row it discloses.</li>
      <li><b>Chevron visibility — always, not hover-only, for the ONLY expand affordance.</b> Zach's own vault note <code>C - Information Scent</code> (from an earlier shell-UI deep research pass) already states the rule this babble needed: "hiding something is safe only if a scent-bearing cue marks the trail to it... scentless hiding is how features die — hidden navigation halves discoverability (NN/g, n=179)." A hover-only chevron on a canvas app (no persistent mouse-over affordance the way a desktop file-tree sidebar has) is exactly the scentless-hiding case that note warns about.</li>
      <li><b>Guide-line color — faint and low-contrast, not accent-colored, by default.</b> VS Code's own "indent guide" setting ships a subtle, low-contrast default specifically so the guide orients the eye without competing with real content; an "active" variant highlights only the single guide leading to the cursor, leaving every other one faint. Style is either solid or dotted; color is explicitly meant to be low-contrast by default, not accent-tinted.</li>
    </ul>
    <p class="caption">Full search trail: web searches on tree-view disclosure-triangle convention, expand/collapse affordance discoverability (Nielsen Norman Group), and VS Code indent-guide styling, cross-checked against Zach's own vault (<code>C - Information Scent.md</code>, linked to the 2026-07-16 shell-UI deep research). Sources: <a href="https://en.wikipedia.org/wiki/Disclosure_widget">Disclosure widget (Wikipedia)</a>, <a href="https://en.wikipedia.org/wiki/Tree_view">Tree view (Wikipedia)</a>, <a href="https://fluent2.microsoft.design/components/web/react/core/tree/usage">Fluent 2 Tree usage</a>, <a href="https://github.com/microsoft/vscode/issues/17777">VS Code indent-guide discussion</a>.</p>
  </section>

  <section class="panel recommend">
    <h2>Recommendation: leading + always-visible + muted guide</h2>
    <p>Every citation points the same direction — this is the only variant of the six that applies all three at once. It's the fourth block below, gated behind <code>chevronPlacement="leading"</code>, <code>chevronVisibility="always"</code>, <code>guideStyle="muted-rail"</code>.</p>
  </section>

  <section class="panel">
    <h2>All six, side by side</h2>
    <img class="shot" src="{board}" alt="Six chevron/guide variants on the review board">
    <p class="caption"><code>sketches/review/chevron-guide-babble.systemsketch</code> — top row is the original pair (V1, AltA, AltB), bottom row is the three new prior-art-informed variants.</p>
    <img class="shot" src="{row1}" alt="V1, AltA, AltB close-up">
    <p class="caption">Trailing-accent (V1), leading-accent (AltA), trailing-dotted-muted (AltB) — none matches all three citations at once.</p>
    <img class="shot" src="{row2}" alt="Prior Art, Hover Reveal, Dot Toggle close-up">
    <p class="caption">Left to right: the recommendation (leading, always-visible, muted rail); Hover Reveal — note there is genuinely no chevron visible at rest, confirmed via <code>getComputedStyle(...).opacity === "0"</code> live, not just by eye; Dot Toggle's hollow ring instead of a triangle.</p>
  </section>

  <section class="panel">
    <h2>Compare</h2>
    <table>
      <thead><tr><th>Variant</th><th>Chevron</th><th>Guide</th><th>Verdict</th></tr></thead>
      <tbody>{rows}</tbody>
    </table>
  </section>

  <div class="footer">Generated from the current tree by <code>docs/build_chevron_guide_babble.py</code>. Source: <code>src/blocks/babble/TypeBabbleV1.tsx</code> (the <code>ChevronPlacement</code> / <code>ChevronVisibility</code> / <code>ChevronGlyph</code> / <code>GuideStyle</code> props), <code>TypeBabbleV1Variants.tsx</code>, <code>type-babble.css</code>. Board: <code>sketches/review/chevron-guide-babble.systemsketch</code>. Part of the same session as <a href="type-primitive-v1-engine-2026-09-05.html">the Type primitive V1 engine report</a>.</div>
</main>
</body>
</html>
"""
    OUTPUT.write_text(document, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
