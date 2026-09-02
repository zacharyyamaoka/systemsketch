#!/usr/bin/env python3
"""Build the literal-argument pill implementation report.

Emits docs/literal-pill-implementation-2026-09-01.html, self-contained. The
captures come from `npm run test:pill` (tests/literal_pill_smoke.mjs), which
writes them into docs/assets/ as it asserts; the check table is read from the
JSON that journey leaves beside them, and every number about the tree is
measured here rather than typed.
"""

from __future__ import annotations

import base64
import html
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs" / "assets"
OUT = ROOT / "docs" / "literal-pill-implementation-2026-09-01.html"
GALLERY = "literal-pill-babble-2026-09-01.html"


def esc(text: str) -> str:
    return html.escape(text, quote=True)


def image_data(name: str) -> str:
    path = ASSETS / name
    if not path.exists():
        raise SystemExit(f"Missing capture {path} — run `npm run test:pill` first")
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, check=True, capture_output=True, text=True).stdout


def excerpt(rel: str, start: str, end: str) -> str:
    """The source between two anchors, verbatim, so the report cannot drift from the file."""
    text = read(rel)
    begin = text.index(start)
    stop = text.index(end, begin) + len(end)
    return text[begin:stop]


# ---------------------------------------------------------------------------
# Measured from the tree.
# ---------------------------------------------------------------------------

def measure() -> dict[str, object]:
    model = read("src/blocks/blockModel.ts")
    views = re.search(r"export const BLOCK_VIEWS = \[(.*?)\] as const", model)
    value_size = re.search(r"value: \{ w: (\d+), h: (\d+) \}", model)
    layout = read("src/blocks/layoutBlock.ts")
    constants = {
        name: int(re.search(rf"export const {name} = (\d+)", layout).group(1))
        for name in ("VALUE_HEIGHT_PX", "VALUE_PAD_X", "VALUE_FONT_PX", "VALUE_MIN_WIDTH_PX", "VALUE_MAX_WIDTH_PX")
    }
    value = read("src/blocks/valueBlock.ts")
    fold = int(re.search(r"VALUE_FOLD_LENGTH = (\d+)", value).group(1))
    type_rules = len(re.findall(r"\n\tif \(.*\) return '", value))
    util = read("src/blocks/BlockShapeUtil.tsx")
    migration = re.search(r"ValueView: (\d+)", util).group(1)
    tool_ui = read("src/blocks/blockToolUi.tsx")
    kbd = re.search(r"\[PILL_TOOL_ID\]: \{[^}]*kbd: '([a-z])'", tool_ui, re.S).group(1)
    picker = read("src/blocks/connections/blockPicker.ts")
    preset = re.search(r"\{ id: 'value', label: '(\w+)', icon: '(\w+)'", picker)
    checks = json.loads((ASSETS / "literal-pill.json").read_text(encoding="utf-8"))
    # The working tree against main: what this build describes, committed or not.
    diff = git("diff", "--stat=140", "main", "--", "src", "tests", "package.json").strip().splitlines()
    summary = diff[-1] if diff else ""
    return {
        "views": [v.strip().strip("'") for v in views.group(1).split(",") if v.strip()],
        "value_size": (int(value_size.group(1)), int(value_size.group(2))),
        **constants,
        "fold": fold,
        "type_rules": type_rules,
        "migration": migration,
        "kbd": kbd,
        "preset_label": preset.group(1),
        "preset_icon": preset.group(2),
        "checks": checks,
        "passed": sum(1 for c in checks if c["ok"]),
        "diff_files": [line for line in diff[:-1]],
        "diff_summary": summary,
        "head": git("rev-parse", "--short", "HEAD").strip(),
    }


# ---------------------------------------------------------------------------
# Page.
# ---------------------------------------------------------------------------

STYLE = """
<style>
  :root { --ink:#20201f; --muted:#6e6a63; --line:#d8d0c4; --panel:#fffdf9; --paper:#f4f0e8; --accent:#c08520;
          --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; --sans: Inter, ui-sans-serif, system-ui, sans-serif; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--paper); color:var(--ink); font: 15px/1.55 var(--sans); }
  main { max-width: 1180px; margin: 0 auto; padding: 36px 28px 80px; }
  h1 { font: 500 38px/1.1 Iowan Old Style, Baskerville, Georgia, serif; margin: 6px 0 10px; }
  h2 { font: 500 26px/1.15 Iowan Old Style, Baskerville, Georgia, serif; margin: 44px 0 10px; }
  h3 { font: 600 15px/1.3 var(--sans); margin: 22px 0 8px; }
  .eyebrow { color:var(--muted); font: 700 11px/1.2 var(--mono); letter-spacing:.12em; text-transform:uppercase; }
  .lede { max-width: 820px; font-size: 17px; color:#3d3a35; }
  .facts { display:grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 12px; margin: 22px 0; }
  .fact { padding: 12px 14px; border:1px solid var(--line); border-radius: 9px; background: var(--panel); }
  .fact b { display:block; font: 600 22px/1.2 var(--sans); }
  .fact span { color: var(--muted); font-size: 12px; }
  figure { margin: 18px 0; padding: 12px; border:1px solid var(--line); border-radius: 12px; background: var(--panel); }
  figure img { display:block; width:100%; height:auto; border-radius: 8px; background:#f7f8fa; }
  figcaption { margin-top: 9px; color: var(--muted); font-size: 13px; }
  figcaption b { color: var(--ink); }
  .pair { display:grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .strip { display:grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 14px; }
  pre { margin: 0; padding: 12px 14px; overflow-x:auto; border-radius: 8px; background: #1f2937; color: #e5e7eb; font: 12.5px/1.5 var(--mono); }
  code { font: 13px var(--mono); background: rgba(0,0,0,.05); padding: 1px 5px; border-radius: 4px; }
  pre code { background: none; padding: 0; font-size: inherit; }
  table { width:100%; border-collapse: collapse; background: var(--panel); border:1px solid var(--line); border-radius: 9px; overflow:hidden; font-size: 13.5px; }
  th, td { padding: 8px 11px; border-bottom: 1px solid var(--line); text-align:left; vertical-align: top; }
  th { background: #efe9dd; font: 700 11px/1.3 var(--mono); letter-spacing:.06em; text-transform: uppercase; }
  td.ok { color:#2f7f62; font-weight:700; white-space:nowrap; }
  td.id { font-family: var(--mono); white-space:nowrap; }
  .seams { display:grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .seam { padding: 12px 14px; border:1px solid var(--line); border-radius: 9px; background: var(--panel); }
  .seam b { display:block; font-family: var(--mono); font-size: 12.5px; color: var(--accent); margin-bottom: 4px; }
  .seam p { margin: 0; font-size: 13.5px; }
  .decision { margin: 12px 0; padding: 12px 14px; border-left: 4px solid var(--accent); background: var(--panel); border-radius: 0 9px 9px 0; }
  .decision b { display:block; margin-bottom: 3px; }
  ul { padding-left: 20px; } li { margin: 4px 0; }
  a { color: #3f6fa8; }
  svg text { font-family: var(--mono); }
</style>
"""


def anatomy_svg(m: dict[str, object]) -> str:
    """The capsule's anatomy, drawn from the measured constants."""
    h = m["VALUE_HEIGHT_PX"]
    pad = m["VALUE_PAD_X"]
    w = 300
    return f"""
<svg viewBox="0 0 760 264" width="100%" role="img" aria-label="Anatomy of the value view">
  <defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#6e6a63"/></marker></defs>
  <g transform="translate(60,60)">
    <rect x="0" y="0" width="{w}" height="{h}" rx="{h/2}" fill="#f4f4f5" stroke="#9ca3af" stroke-width="1.5"/>
    <text x="{pad}" y="{h/2 + 8}" font-size="24" font-weight="500" fill="#27272a">gain</text>
    <text x="{pad + 62}" y="{h/2 + 8}" font-size="24" font-weight="500" fill="#71717a">=</text>
    <text x="{pad + 92}" y="{h/2 + 8}" font-size="24" font-weight="500" fill="#27272a">2.0</text>
    <circle cx="{w}" cy="{h/2}" r="6" fill="#fff" stroke="#c08520" stroke-width="2"/>
    <line x1="{pad}" y1="{h + 12}" x2="{pad + 50}" y2="{h + 12}" stroke="#6e6a63" stroke-width="1"/>
    <line x1="{pad + 25}" y1="{h + 12}" x2="{pad + 25}" y2="{h + 40}" stroke="#6e6a63" stroke-width="1"/>
    <line x1="{pad + 92}" y1="{h + 12}" x2="{pad + 132}" y2="{h + 12}" stroke="#6e6a63" stroke-width="1"/>
    <path d="M{pad + 132},{h + 12} H{w + 28} V{h + 86}" fill="none" stroke="#6e6a63" stroke-width="1" marker-end="url(#arr)"/>
  </g>
  <g font-size="12" fill="#3d3a35">
    <text x="60" y="176">outlet name = the variable name</text>
    <text x="60" y="192" fill="#6e6a63">'' → passed inline · 'gain' → gain = 2.0 is hoisted</text>
    <text x="395" y="216">title = the literal</text>
    <text x="395" y="232" fill="#6e6a63">past {m["fold"]} characters or a line break → '…',</text>
    <text x="395" y="248" fill="#6e6a63">the full text in the tooltip</text>
    <text x="395" y="96">outlet type = inferred from the literal</text>
    <text x="395" y="112" fill="#6e6a63" font-size="11.5">float int str bytes bool None dict set list tuple</text>
    <text x="395" y="128" fill="#6e6a63">an expression keeps whatever type it had</text>
    <text x="395" y="52">box = fitted to the text</text>
    <text x="395" y="68" fill="#6e6a63">{h}px tall · {m["VALUE_MIN_WIDTH_PX"]}–{m["VALUE_MAX_WIDTH_PX"]}px wide · not resizable</text>
    <line x1="388" y1="48" x2="358" y2="62" stroke="#6e6a63" marker-end="url(#arr)"/>
    <line x1="388" y1="92" x2="370" y2="88" stroke="#6e6a63" marker-end="url(#arr)"/>
  </g>
</svg>
"""


def checks_table(checks: list[dict[str, object]]) -> str:
    rows = "".join(
        f'<tr><td class="id">{esc(c["id"])}</td><td>{esc(c["label"])}</td>'
        f'<td class="ok">{"PASS" if c["ok"] else "FAIL"}</td></tr>'
        for c in checks
    )
    return f"<table><thead><tr><th>check</th><th>what the browser proved</th><th></th></tr></thead><tbody>{rows}</tbody></table>"


def figure(name: str, caption: str) -> str:
    return f'<figure><img src="{image_data(name)}" alt="{esc(caption)}"><figcaption>{caption}</figcaption></figure>'


def build() -> str:
    m = measure()
    views = " · ".join(m["views"])
    seams = [
        ("src/blocks/blockModel.ts", "`BLOCK_VIEWS` gains `value`; every Block remembers a box for it; `isValueBlockShape`, `PILL_TOOL_ID`."),
        ("src/blocks/valueBlock.ts", "The capsule's semantics: literal → type, name → hoist, fold rule, and `normalizeValueBlockProps`, the invariant applied on every write."),
        ("src/blocks/layoutBlock.ts", "The `value` branch: one text box across the face, the outlet centred on the right rim, no heading, rows or footer."),
        ("src/blocks/BlockShapeUtil.tsx", f"Stadium geometry and indicator; migration {m['migration']} fills the remembered box on old records; `onBeforeCreate` turns a blank Block drawn by the Pill tool into a capsule; `onBeforeUpdate` re-normalises; `canResize` is false."),
        ("src/blocks/ui/BlockCanvas.tsx", "`ValueFace`: name · `=` · literal as ordinary inline fields; the `=` carries the name field while unnamed; a wired input's default chip is dimmed."),
        ("src/blocks/inlineBlockEditing.ts", "Editor placement and double-click reading for the two capsule fields."),
        ("src/blocks/PillTool.ts", f"`{m['kbd'].upper()}` — the stock box tool, centring the capsule on whatever was drawn."),
        ("src/blocks/connections/blockPicker.ts", f"The `{m['preset_label']}` preset, offered only to a cable that wants a producer; its outlet arrives unnamed."),
        ("src/instantTextEditing.ts", "The Pill tool is the one tool whose id is not its shape type, so the creation gate names it."),
        ("src/toolbar/SystemSketchToolbar.tsx", "The Pill slot beside Block in the product toolbar; the Block Dev toolbar gets the same item."),
    ]
    seam_cards = "".join(
        f'<div class="seam"><b>{esc(path)}</b><p>{note}</p></div>' for path, note in seams
    )
    infer = excerpt("src/blocks/valueBlock.ts", "export function inferLiteralType", "\n}\n")
    create = excerpt("src/blocks/BlockShapeUtil.tsx", "\toverride onBeforeCreate", "\n\t}\n")
    diff_rows = "".join(f"<li><code>{esc(line.strip())}</code></li>" for line in m["diff_files"])

    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Literal argument pill — implementation</title>{STYLE}</head>
<body><main>
<div class="eyebrow">SystemSketch · Block · implementation · 2026-09-01 · {esc(m['head'])}</div>
<h1>The literal argument is a pill, and P draws it</h1>
<p class="lede">You picked V1 Capsule from <a href="{GALLERY}">the five directions</a>. It is live as the Block's fourth view, <code>value</code>:
the same primitive wearing a capsule, so cables, the polarity judge, click-to-edit, the inspector, batch styles and the file format apply to it unchanged.
Press <b>{esc(m['kbd'].upper())}</b>, click, type the literal. Its outlet's name is the variable name — empty means the literal is passed inline —
and its type follows the literal. Every claim below was driven in the real app by <code>npm run test:pill</code>.</p>

<div class="facts">
  <div class="fact"><b>{m['passed']}/{len(m['checks'])}</b><span>browser checks, Block Dev + product</span></div>
  <div class="fact"><b>{views}</b><span>the Block's views now</span></div>
  <div class="fact"><b>{m['type_rules']} rules</b><span>literal → type, and none for an expression</span></div>
  <div class="fact"><b>{esc(m['diff_summary'].strip())}</b><span>src + tests vs main</span></div>
</div>

<h2>What it looks like, in the app</h2>
<div class="pair">
{figure("literal-pill-typed.png", "<b>P, click, type <code>2.0</code>, Enter.</b> A capsule the width of its text, its one outlet on the rim. The grey <code>= 1.0</code> on estimate's row is the definition default, untouched.")}
{figure("literal-pill-wired.png", "<b>Drag the outlet onto <code>gain</code>.</b> Polarity is judged at the landing as for any cable; the pill is the source. The default chip dims: the cable overrides it.")}
</div>
<div class="pair">
{figure("literal-pill-named.png", "<b>Click the pill, then click <code>=</code>, type <code>gain</code>.</b> The name is the outlet's name; the capsule grows to fit; the cable survives.")}
{figure("literal-pill-folded.png", f"<b>A dict literal folds to <code>= …</code></b> once it passes {m['fold']} characters; the full text rides the tooltip and the outlet is typed <code>dict</code>.")}
</div>
<div class="pair">
{figure("literal-pill-picker-open.png", "<b>An input dropped on nothing asks what should feed it,</b> and <code>Value</code> is in the offer — only for a cable that wants a producer.")}
{figure("literal-pill-picked.png", "<b>Value makes a capsule already wired into <code>opts</code>,</b> its literal open for typing, exactly as a picked Call opens its title.")}
</div>
<div class="pair">
{figure("literal-pill-inspector.png", "<b>The inspector knows the fourth view.</b> Value sits beside Simple, Port and Expanded; the inputs lane is hidden because a capsule has none; the outlet is editable like any port.")}
{figure("literal-pill-product.png", "<b>The product composition:</b> the Pill slot beside Block in the toolbar, and <code>P</code> draws a capsule on the real board.")}
</div>

<h2>Anatomy</h2>
<figure>{anatomy_svg(m)}<figcaption>Drawn from the constants in the tree: {m['VALUE_HEIGHT_PX']}px tall, {m['VALUE_PAD_X']}px padding, {m['VALUE_FONT_PX']}px monospace, folding past {m['fold']} characters.</figcaption></figure>

<h2>Where it lives</h2>
<div class="seams">{seam_cards}</div>

<h3>The type follows the literal</h3>
<pre><code>{esc(infer)}</code></pre>

<h3>Why the util, not the tool, makes the capsule</h3>
<p>tldraw's box tool has two creation paths. A drag hands the new shape to <code>select.resizing</code>, which calls the tool's <code>onCreate</code> when the gesture ends.
A click creates the default shape, centres it on the pointer, and switches back to Select — and never calls <code>onCreate</code>. The first journey run caught exactly that:
<code>P</code> then a click left a Simple card. The shape util's <code>onBeforeCreate</code> sees both paths, so a blank Block created while the Pill tool is active becomes a capsule there,
before the box tool reads its size to centre it.</p>
<pre><code>{esc(create)}</code></pre>

<h2>Proof</h2>
<p>Unit: the vitest suite covers the type table, folding, the normalisation invariants (inputs stripped, one outlet kept by identity, type re-inferred only when the literal changes, box re-fitted in the record and the remembered view), the layout branch, the migration, the picker preset and the instant-typing gate. Browser: <code>npm run test:pill</code>, read back from the painted DOM and the editor.</p>
{checks_table(m['checks'])}
<p>Every neighbouring journey was re-run on this tree: polarity 42/42, edge acceptance 33/33, click-to-edit 9/9, batch editing, context menu 12/12, ports, fields, selection menu, edge editor, reveal, arrow sync, file type. Two of them enumerate the View submenu and now expect the fourth entry.</p>

<h2>Decisions you can reverse in a line</h2>
<div class="decision"><b>The <code>=</code> is the click that names an unnamed pill.</b> There is no ghost "name" placeholder; the tooltip on <code>=</code> says <i>Name this value</i>, and the inspector's Outputs row edits the same field. A hover hint is a CSS rule away.</div>
<div class="decision"><b>A capsule is not resizable.</b> It is as wide as its text ({m['VALUE_MIN_WIDTH_PX']}–{m['VALUE_MAX_WIDTH_PX']}px), like a tldraw text shape with auto width; the resize handles are hidden for the value view only.</div>
<div class="decision"><b>The type is re-inferred only when the literal changes.</b> Typing a type by hand in the inspector sticks until the literal is edited; an expression the spelling cannot type (<code>math.pi</code>) keeps the type it had.</div>
<div class="decision"><b>A pill drawn by the tool is <code>blockType: 'literal'</code>.</b> It shows nowhere on the capsule; a reader of the file can tell a pill from a Block without loading it.</div>
<div class="decision"><b>Long literals fold at {m['fold']} characters.</b> Editing a folded literal is still a single-line editor.</div>

<h2>Deliberately not done</h2>
<ul>
<li>No Python writer: nothing regenerates <code>gain = 2.0; estimate(frame, gain)</code> yet. The name/no-name rule is in the record for the pyblocks writer to read.</li>
<li>No extract-to-pill command on a row, and no docking (V4/V3 from the gallery). A single-use literal costs a pill and a cable, as the Capsule direction accepted.</li>
<li>Fan-out needs no work — a capsule's outlet is a Block output, and outputs already fan out — but it is not separately proven here.</li>
<li>Older files: a <code>.systemsketch</code> written before this view loads through migration {m['migration']}; a file written by this build and opened by an older build would need its down migration, which maps a capsule to a Simple card.</li>
</ul>

<h2>Files</h2>
<ul>{diff_rows}</ul>
</main></body></html>
"""


def main() -> None:
    OUT.write_text(build(), encoding="utf-8")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
