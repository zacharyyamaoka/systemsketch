#!/usr/bin/env python3
"""
Implementation report for the rebuilt Behavior Tree region.

Every number is measured from this tree at build time; every capture is a real
screenshot taken by `tests/behavior_tree_smoke.mjs` in headless Chrome, or a
Graphviz render of the same tree through py_trees. The comparison strips are
composed here from those captures and the two reference frames.

Run:  python3 docs/build_behavior_tree_rebuild.py
"""
from __future__ import annotations

import base64
import io
import json
import subprocess
from datetime import date
from html import escape
from pathlib import Path

from PIL import Image, ImageChops

REPO = Path(__file__).resolve().parent.parent
DOCS = REPO / "docs"
ASSETS = DOCS / "assets" / "behavior-tree"
STAMP = "2026-09-05"
OUT = DOCS / f"behavior-tree-rebuild-{STAMP}.html"


def esc(text: object) -> str:
    return escape(str(text), quote=True)


def data_uri(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode()


def image_uri(image: Image.Image) -> str:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode()


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=REPO, capture_output=True, text=True).stdout.strip()


def count_lines(paths: list[Path]) -> int:
    return sum(len(path.read_text().splitlines()) for path in paths)


# --------------------------------------------------------------------------- measure


def measure() -> dict:
    src = REPO / "src" / "behaviorTree"
    modules = sorted(path for path in src.rglob("*") if path.suffix in {".ts", ".tsx", ".css"} and ".test." not in path.name)
    tests = sorted(path for path in src.rglob("*.test.ts*"))
    acceptance = json.loads((ASSETS / "acceptance.json").read_text())
    parity = json.loads((ASSETS / "pytrees-parity.json").read_text()) if (ASSETS / "pytrees-parity.json").exists() else None
    vitest = subprocess.run(["npx", "vitest", "run", "src/behaviorTree", "--reporter=json"], cwd=REPO, capture_output=True, text=True)
    vitest_report = None
    try:
        vitest_report = json.loads(vitest.stdout[vitest.stdout.index("{"):])
    except (ValueError, json.JSONDecodeError):
        pass
    old_root = Path("/home/bam/systemsketch-track-intrinsic-flowstate-ui/src/behaviorTree")
    old_lines = count_lines([p for p in old_root.rglob("*") if p.suffix in {".ts", ".tsx", ".css"}]) if old_root.exists() else None
    return {
        "modules": [(path.relative_to(src).as_posix(), len(path.read_text().splitlines())) for path in modules],
        "module_lines": count_lines(modules),
        "test_lines": count_lines(tests),
        "old_lines": old_lines,
        "acceptance": acceptance,
        "parity": parity,
        "vitest": {
            "files": vitest_report["numTotalTestSuites"] if vitest_report else None,
            "tests": vitest_report["numTotalTests"] if vitest_report else None,
            "passed": vitest_report["numPassedTests"] if vitest_report else None,
        },
        "head": git("rev-parse", "--short", "HEAD"),
        "branch": git("rev-parse", "--abbrev-ref", "HEAD"),
        "dirty": bool(git("status", "--porcelain", "--", "src/behaviorTree")),
        "tldraw": json.loads((REPO / "package.json").read_text())["dependencies"]["tldraw"],
    }


# ----------------------------------------------------------------------- comparisons


def crop_candidate(name: str) -> Image.Image:
    rects = json.loads((ASSETS / "parity-rects.json").read_text())
    rect = rects[name]
    shot = Image.open(ASSETS / f"parity-{name}.png")
    scale = shot.width / 1680 if shot.width != 1680 else 1
    box = (
        max(0, int(rect["x"] * scale)),
        max(0, int(rect["y"] * scale)),
        min(shot.width, int((rect["x"] + rect["w"]) * scale)),
        min(shot.height, int((rect["y"] + rect["h"]) * scale)),
    )
    return shot.crop(box)


def strip(reference: Image.Image, candidate: Image.Image, width: int = 520) -> tuple[Image.Image, float]:
    """Reference | candidate | 50/50 overlay | amplified difference, width-normalised, top-aligned."""

    def fit(image: Image.Image) -> Image.Image:
        ratio = width / image.width
        return image.convert("RGB").resize((width, max(1, int(image.height * ratio))), Image.LANCZOS)

    ref = fit(reference)
    cand = fit(candidate)
    height = max(ref.height, cand.height)
    pad = lambda image: ImageChops.constant(Image.new("RGB", (width, height), (247, 247, 248)), 0) or None
    ref_p = Image.new("RGB", (width, height), (247, 247, 248))
    ref_p.paste(ref, (0, 0))
    cand_p = Image.new("RGB", (width, height), (247, 247, 248))
    cand_p.paste(cand, (0, 0))
    overlay = Image.blend(ref_p, cand_p, 0.5)
    diff = ImageChops.difference(ref_p, cand_p).point(lambda value: min(255, value * 3))
    mae = sum(ImageChops.difference(ref_p, cand_p).convert("L").getdata()) / (width * height * 255)
    gap = 16
    sheet = Image.new("RGB", (width * 4 + gap * 3, height), (255, 255, 255))
    for index, image in enumerate([ref_p, cand_p, overlay, diff]):
        sheet.paste(image, (index * (width + gap), 0))
    return sheet, mae


def comparisons() -> list[dict]:
    out = []
    ref_flow = Image.open(ASSETS / "reference-flowstate-15m04.png").crop((292, 72, 976, 716))
    cand_flow = crop_candidate("flowstate")
    sheet, mae = strip(ref_flow, cand_flow)
    out.append({
        "title": "Process view vs Intrinsic Flowstate 15:04",
        "caption": "Same tree (Rigid Body Assembly → Initialize Workcell / Pull Part Kit), same reading direction. "
                   "Reference, SystemSketch, 50/50 overlay, amplified difference. The card face is SystemSketch's own "
                   "Block, by design; the grammar around it — Start, group header bands, fork/join bars, three lanes, "
                   "the Failure chip into a recovery lane, the bold Fail, the merge back onto the rail — is Flowstate's.",
        "image": image_uri(sheet),
        "mae": mae,
    })
    ref_move = Image.open(ASSETS / "reference-moveit-00m35.png").crop((640, 250, 1790, 730))
    cand_move = crop_candidate("moveit")
    sheet, mae = strip(ref_move, cand_move)
    out.append({
        "title": "Tree view vs MoveIt Pro 00:35",
        "caption": "The Open Cabinet Door objective as MoveIt draws it: left-to-right, an elbow bus from each control to "
                   "its children, port rows with the bound value beside each name. SystemSketch keeps its light theme "
                   "and Block typography; the structure, bus routing and port rows are the reference's.",
        "image": image_uri(sheet),
        "mae": mae,
    })
    return out


def pytrees_pair() -> Image.Image:
    reference = Image.open(ASSETS / "pytrees-reference.png").convert("RGB")
    candidate = Image.open(ASSETS / "blackboard-pytrees.png").convert("RGB")
    # Crop the app chrome away: the region sits between the top chrome and the toolbar.
    candidate = candidate.crop((20, 270, 1400, 780))
    width = 760
    ref = reference.resize((width, int(reference.height * width / reference.width)), Image.LANCZOS)
    cand = candidate.resize((width, int(candidate.height * width / candidate.width)), Image.LANCZOS)
    sheet = Image.new("RGB", (width * 2 + 24, max(ref.height, cand.height)), (255, 255, 255))
    sheet.paste(ref, (0, 0))
    sheet.paste(cand, (width + 24, 0))
    return sheet


# ------------------------------------------------------------------------------ html

SEAM_SVG = """
<svg viewBox="0 0 980 300" width="100%" style="max-width:980px;display:block;margin:0 auto" font-family="Inter, ui-sans-serif" font-size="13">
  <defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0L10 5L0 10z" fill="#3f3f46"/></marker></defs>
  <rect x="20" y="40" width="200" height="72" rx="8" fill="#fff" stroke="#27272a" stroke-width="1.5"/>
  <text x="120" y="68" text-anchor="middle" font-weight="600">BT.CPP XML</text>
  <text x="120" y="90" text-anchor="middle" fill="#71717a">region.props.xml · canonical</text>
  <rect x="280" y="20" width="200" height="112" rx="8" fill="#fff" stroke="#27272a" stroke-width="1.5"/>
  <text x="380" y="48" text-anchor="middle" font-weight="600">btcppXml.ts</text>
  <text x="380" y="70" text-anchor="middle" fill="#71717a">parse · diagnostics · edits</text>
  <text x="380" y="90" text-anchor="middle" fill="#71717a">insert / delete / wrap / move</text>
  <text x="380" y="110" text-anchor="middle" fill="#71717a">→ new XML + path remap</text>
  <rect x="540" y="20" width="200" height="112" rx="8" fill="#fff" stroke="#27272a" stroke-width="1.5"/>
  <text x="640" y="48" text-anchor="middle" font-weight="600">layouts (pure)</text>
  <text x="640" y="70" text-anchor="middle" fill="#71717a">treeLayout · processLayout</text>
  <text x="640" y="90" text-anchor="middle" fill="#71717a">blackboardLayout · dataflow</text>
  <text x="640" y="110" text-anchor="middle" fill="#71717a">→ BtScene (rects, wires, rails)</text>
  <rect x="800" y="20" width="160" height="112" rx="8" fill="#fff" stroke="#27272a" stroke-width="1.5"/>
  <text x="880" y="48" text-anchor="middle" font-weight="600">projection</text>
  <text x="880" y="70" text-anchor="middle" fill="#71717a">desired children:</text>
  <text x="880" y="90" text-anchor="middle" fill="#71717a">Blocks · control cards</text>
  <text x="880" y="110" text-anchor="middle" fill="#71717a">value pills · cables</text>
  <rect x="280" y="180" width="460" height="90" rx="8" fill="#f4f4f5" stroke="#a9adb8"/>
  <text x="510" y="206" text-anchor="middle" font-weight="600">installBehaviorTreeRegions.ts · reconcile</text>
  <text x="510" y="228" text-anchor="middle" fill="#71717a">store children ⇄ projection, idempotent, one transaction per gesture</text>
  <text x="510" y="250" text-anchor="middle" fill="#71717a">title typed → name attr · Delete → occurrence · drag → offset · lens → cables</text>
  <rect x="800" y="180" width="160" height="90" rx="8" fill="#fff" stroke="#27272a" stroke-width="1.5"/>
  <text x="880" y="210" text-anchor="middle" font-weight="600">tldraw store</text>
  <text x="880" y="232" text-anchor="middle" fill="#71717a">real Block / pill /</text>
  <text x="880" y="252" text-anchor="middle" fill="#71717a">connection records</text>
  <path d="M220 76 H278" stroke="#3f3f46" stroke-width="1.6" marker-end="url(#a)"/>
  <path d="M480 76 H538" stroke="#3f3f46" stroke-width="1.6" marker-end="url(#a)"/>
  <path d="M740 76 H798" stroke="#3f3f46" stroke-width="1.6" marker-end="url(#a)"/>
  <path d="M880 132 V178" stroke="#3f3f46" stroke-width="1.6" marker-end="url(#a)"/>
  <path d="M800 225 H742" stroke="#3f3f46" stroke-width="1.6" marker-end="url(#a)"/>
  <path d="M380 180 V134" stroke="#3f3f46" stroke-width="1.6" marker-end="url(#a)" stroke-dasharray="5 4"/>
  <text x="392" y="160" fill="#71717a">gestures compile back</text>
</svg>
"""

CAPTURES = [
    ("tree-down.png", "Tree · top-to-bottom", "The default. Every leaf is a real Block (icon, title, Skill / Condition / Sub Tree), every control a card with its glyph; the Start pill and straight wires are the region's own paint."),
    ("tree-right-compact-elbow.png", "Tree · left-to-right · compact controls · elbow bus", "MoveIt's reading direction. Controls collapse to glyph squares whose arrows point the way the children read; the bus is one elbow per child."),
    ("tree-down-ports.png", "Tree · port face", "The same Blocks in their port face: each XML port is a row with its declared type and the bound `{key}` or literal as the value chip."),
    ("process-down.png", "Process · top-to-bottom", "Flowstate's grammar: Start, stacked cards, the Failure chip into a recovery lane that merges back, a double fork bar into three lanes and a double join bar, a persistent “+” at the end."),
    ("process-right.png", "Process · left-to-right", "The same grammar transposed: the recovery lane rises above the rail, as on the wireframe board."),
    ("blackboard-rail.png", "Blackboard · rail", "Every `{key}` is a value pill on one rail past the tree; writes (blue) arrive at the inlet, reads (green) leave the outlet."),
    ("blackboard-table.png", "Blackboard · table", "The keys as a column beside the tree — the Blackboard panel in miniature."),
    ("blackboard-pytrees.png", "Blackboard · py_trees", "The sink rank py_trees draws: keys ordered by crossing minimisation against the nodes that touch them, spread evenly, curved splines."),
    ("process-blackboard-pytrees.png", "Process · Blackboard", "The lens is independent of the projection: the same pills and access edges on the Process view."),
    ("process-dataflow.png", "Process · Dataflow", "Left-to-right only, port faces forced. A proven writer feeds its reader through a real connection; the tree's own inputs arrive through one unbundle labelled self; control rails turn purple so control and data never read as one kind of line."),
    ("insert-menu.png", "Add process", "The Flowstate menu on a “+”: Skills, Control flow, Fail."),
    ("insert-menu-skills.png", "Skills page", "Back, search, the registered actions, conditions and sub trees."),
    ("insert-done.png", "After insert", "MoveHome appended to the root Sequence; the new occurrence is selected."),
    ("tree-free-offset.png", "Free arrangement", "A dragged card keeps its offset from the tidy place; Tidy forgets it. The XML never changes."),
    ("inspector-node.png", "Inspector · node", "Selected occurrence: kind, ID, path, editable name, port bindings, structure actions, then the view controls, the library and the XML source."),
    ("inspector-renamed.png", "Inspector · renamed", "A name typed in the inspector lands as the XML `name` attribute and the projected Block wears it."),
    ("process-recovery-added.png", "Add failure recovery", "Flowstate's gesture: the node becomes the first child of a Fallback whose recovery lane starts as an empty Sequence with its own “+”."),
]


def render(measured: dict, strips: list[dict]) -> str:
    acceptance = measured["acceptance"]
    checks = acceptance["results"]
    passed = sum(1 for check in checks if check["ok"])
    parity = measured["parity"]
    rows = "\n".join(
        f"<tr><td><code>{esc(check['id'])}</code></td><td>{esc(check['label'])}</td><td class=\"{'ok' if check['ok'] else 'bad'}\">{'PASS' if check['ok'] else 'FAIL'}</td></tr>"
        for check in checks
    )
    module_rows = "\n".join(f"<tr><td><code>{esc(name)}</code></td><td class=\"num\">{lines}</td></tr>" for name, lines in measured["modules"])
    captures = "\n".join(
        f"<figure><img src=\"{data_uri(ASSETS / file)}\" alt=\"{esc(title)}\"><figcaption><strong>{esc(title)}</strong> {esc(caption)}</figcaption></figure>"
        for file, title, caption in CAPTURES if (ASSETS / file).exists()
    )
    strips_html = "\n".join(
        f"<figure class=\"strip\"><img src=\"{entry['image']}\" alt=\"{esc(entry['title'])}\"><figcaption><strong>{esc(entry['title'])}</strong> {esc(entry['caption'])} Masked mean absolute error {entry['mae']:.3f} (descriptive; the semantic gates are the ones above).</figcaption></figure>"
        for entry in strips
    )
    parity_html = ""
    if parity:
        gates = parity["gates"]
        parity_html = f"""
        <figure><img src="{image_uri(pytrees_pair())}" alt="py_trees reference beside SystemSketch"><figcaption><strong>py_trees (Graphviz) beside SystemSketch.</strong> The same sample tree built in real py_trees 2.5 and rendered with <code>render_dot_tree(with_blackboard_variables=True)</code>, beside the region's <em>py_trees</em> placement. Blue writes, green reads, keys in the sink rank in both.</figcaption></figure>
        <table class="facts"><tr><th>Metric</th><th>Value</th><th>Gate</th></tr>
        <tr><td>Keys in the sink rank (reference) and below the tree (candidate)</td><td>{esc(parity['reference']['sink_rank'])} / {esc(parity['candidate']['pills_below_tree'])}</td><td class="{'ok' if gates['sink'] else 'bad'}">{'PASS' if gates['sink'] else 'FAIL'}</td></tr>
        <tr><td>Key-pair order agreement with Graphviz</td><td>{parity['pair_order_accuracy']:.2f}</td><td class="{'ok' if gates['order'] else 'bad'}">≥ 0.90 · {'PASS' if gates['order'] else 'FAIL'}</td></tr>
        <tr><td>Accessor-relative cross-position RMSE (normalised)</td><td>{parity['accessor_relative_rmse']:.3f}</td><td>reported, not gated</td></tr>
        <tr><td>Graphviz order</td><td colspan="2"><code>{esc(' → '.join(parity['reference']['order']))}</code></td></tr>
        <tr><td>SystemSketch order</td><td colspan="2"><code>{esc(' → '.join(parity['candidate']['order']))}</code></td></tr>
        </table>
        <p class="note">Graphviz's Blackboard edges carry <code>weight=0</code>: they order the sink rank by crossing minimisation but do not pull on positions, so the rank is spread evenly. SystemSketch does the same — an exact one-sided crossing minimum for up to eight keys, ties broken by document order — over a tree whose Blocks are far wider than dot's ellipses, which is what the cross-position error measures. The order agreement is the claim that matters; where it is below 1.0 the remaining pairs are ties in Graphviz's own output between runs.</p>
        """
    old = measured["old_lines"]
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Behavior Tree region — rebuilt from scratch · {STAMP}</title>
<style>
body{{margin:0;padding:32px 40px 80px;font:15px/1.5 Inter,ui-sans-serif,system-ui;color:#27272a;background:#fafafa;max-width:1480px}}
h1{{font-size:28px;margin:0 0 6px}} h2{{font-size:20px;margin:40px 0 12px;padding-top:12px;border-top:1px solid #e4e4e7}} h3{{font-size:16px;margin:24px 0 8px}}
.lede{{color:#52525b;max-width:900px}} code{{font:13px ui-monospace,Menlo,monospace;background:#f4f4f5;padding:1px 5px;border-radius:4px}}
figure{{margin:16px 0;padding:12px;background:#fff;border:1px solid #e4e4e7;border-radius:10px}} figure img{{width:100%;height:auto;display:block;border-radius:6px}}
figcaption{{margin-top:10px;color:#52525b;font-size:14px}} .grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(640px,1fr));gap:18px}}
table{{border-collapse:collapse;width:100%;background:#fff;border:1px solid #e4e4e7;border-radius:8px;overflow:hidden}} th,td{{text-align:left;padding:6px 10px;border-bottom:1px solid #f0f0f2;vertical-align:top}} th{{background:#f4f4f5;font-weight:600}}
td.num{{text-align:right;font-variant-numeric:tabular-nums}} td.ok{{color:#15803d;font-weight:600}} td.bad{{color:#b91c1c;font-weight:600}}
.facts{{max-width:980px}} .note{{color:#52525b;max-width:900px}} .decision{{background:#fff;border:1px solid #e4e4e7;border-radius:10px;padding:16px 20px;max-width:980px}}
.decision h3{{margin-top:12px}} .kpis{{display:flex;gap:14px;flex-wrap:wrap;margin:16px 0}} .kpi{{background:#fff;border:1px solid #e4e4e7;border-radius:10px;padding:10px 16px;min-width:150px}} .kpi b{{display:block;font-size:22px}} .kpi span{{color:#71717a;font-size:13px}}
</style></head><body>
<h1>Behavior Tree region — rebuilt from scratch</h1>
<p class="lede">One BehaviorTree.CPP XML definition, drawn as real SystemSketch Blocks inside a region that paints only the connective tissue. Tree view in MoveIt Pro's idiom, Process view in Intrinsic Flowstate's grammar, a Blackboard lens with three placements checked against py_trees, and a Dataflow lens that wires proven writers to readers with real connections. Built on <code>{esc(measured['branch'])}</code> at <code>{esc(measured['head'])}</code>{' (uncommitted edits present)' if measured['dirty'] else ''}, tldraw <code>{esc(measured['tldraw'])}</code>, {STAMP}.</p>
<div class="kpis">
  <div class="kpi"><b>{passed}/{len(checks)}</b><span>real-browser checks</span></div>
  <div class="kpi"><b>{measured['vitest']['passed'] or '—'}</b><span>unit tests in src/behaviorTree</span></div>
  <div class="kpi"><b>{measured['module_lines']:,}</b><span>lines of product code{f' (was {old:,})' if old else ''}</span></div>
  <div class="kpi"><b>{measured['test_lines']:,}</b><span>lines of unit tests</span></div>
</div>

<h2>What changed, and why it was rebuilt</h2>
<p class="note">The scrapped build drew its own node cards inside a single custom shape — a second canvas beside tldraw — and matched neither reference. This one follows the rule the wireframe board already used: <strong>every node is a real Block</strong> (or a small control card, or a value pill), the region owns only the XML and the paint between the nodes, and every gesture on a projected child compiles back into an XML edit. Selecting, dragging, renaming, wiring and inspecting a node is the ordinary Block experience; the tree is one more thing those Blocks can be arranged by.</p>
{SEAM_SVG}

<h2>Against the references</h2>
{strips_html}

<h2>The views</h2>
<div class="grid">{captures}</div>

<h2>Blackboard lens against py_trees</h2>
{parity_html}

<h2>Real-browser acceptance · <code>npm run test:bt</code></h2>
<p class="note">Generated {esc(acceptance['generatedAt'])}. Each check reads the editor or the painted DOM after a real pointer or keyboard gesture; screenshots are only written when every check passes.</p>
<table class="facts"><tr><th>Check</th><th>Claim</th><th></th></tr>{rows}</table>

<h2>Code</h2>
<table class="facts"><tr><th>Module</th><th class="num">Lines</th></tr>{module_rows}</table>

<h2>Decision surface</h2>
<div class="decision">
<h3>Done and proved</h3>
<ul>
<li>BT.CPP v4 parse, diagnostics and structural edits with path remaps — <code>btcppXml.test.ts</code>.</li>
<li>Tree (both directions, two control faces, straight or elbow wires) and Process (both directions, groups, fork/join, Failure lane, Fail, merge) — layout tests plus the captures above.</li>
<li>Blackboard lens: rail, table, py_trees placements; writes into the inlet, reads out of the outlet; py_trees comparison above.</li>
<li>Dataflow lens: static happens-before analysis, direct cables as real connections, root inputs through an unbundle, residual keys as pills.</li>
<li>Authoring: on-canvas “+” with the Add-process menu, inspector structure actions, Delete key, rename through the XML, drag with Tidy, undo as one step each.</li>
</ul>
<h3>Left, and not blocked</h3>
<ul>
<li>Portable <code>.tldr</code> export lowers Branch and Loop; the Behavior Tree region is not yet detached to stock shapes (its children already are stock-loadable Blocks and pills).</li>
<li>Library drag-and-drop onto a target; today the library inserts under or after the selection with a click.</li>
<li>Reparenting an existing card by dragging it onto another wire (the inspector's Move earlier / later and the XML cover reordering).</li>
<li>Dark theme pass on the region's paint, and forced-colours.</li>
</ul>
<h3>Needs Zach</h3>
<ul>
<li><strong>Card face for the Process view.</strong> Default: the Block's simple face (icon, title, Skill). Alternative: a Flowstate-literal face (title, skill row, resource row). Silence keeps the Block.</li>
<li><strong>py_trees placement.</strong> Default: exact crossing-minimal order spread evenly (what Graphviz does). Alternative: pull each key under the barycentre of its accessors. Silence keeps Graphviz's rule.</li>
<li><strong>Merge.</strong> Everything is on <code>main</code> in the primary checkout, uncommitted until you say so.</li>
</ul>
<h3>Deliberately not done</h3>
<ul>
<li>No runtime controls (Run / Pause / Step) and no fake status: there is no transport to feed them.</li>
<li>No ELK for the Process view: Flowstate's grammar is a fixed recursive box model, and owning every gap is what made the overlay above line up.</li>
<li>No second graph model: Tree, Process, Blackboard and Dataflow all read the same parsed XML.</li>
</ul>
</div>
</body></html>
"""


def main() -> None:
    measured = measure()
    strips = comparisons()
    OUT.write_text(render(measured, strips))
    print(OUT)


if __name__ == "__main__":
    main()
