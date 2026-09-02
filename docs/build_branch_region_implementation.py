#!/usr/bin/env python3
"""Build the self-contained Branch region implementation report.

Every number is measured from the live tree at build time; every capture is
inlined from docs/assets (journey) and sketches/review (fixture).
"""

from __future__ import annotations

import base64
import html
import io
import json
import re
import subprocess
from pathlib import Path

from PIL import Image


REPO = Path(__file__).resolve().parents[1]
ASSETS = REPO / "docs" / "assets"
OUTPUT = REPO / "docs" / "branch-region-implementation-2026-09-02.html"
RESULTS = ASSETS / "branch-region-acceptance.json"
FIXTURE_PNG = REPO / "sketches" / "review" / "branch-region.png"
FIXTURE_URL = (
    "http://127.0.0.1:4340/?board=%2Fhome%2Fbam%2Fsystemsketch-track-branch-region"
    "%2Fsketches%2Freview%2Fbranch-region.systemsketch"
)


def shot(name: str) -> Path:
    path = ASSETS / f"branch-region-{name}.png"
    if not path.exists():
        raise SystemExit(f"missing {path}; run npm run test:branch")
    return path


def crop_uri(path: Path, box: tuple[int, int, int, int] | None, width: int = 1100) -> str:
    image = Image.open(path).convert("RGB")
    if box:
        image = image.crop(box)
    if image.width > width:
        image = image.resize((width, round(image.height * width / image.width)), Image.Resampling.LANCZOS)
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=88, optimize=True)
    return "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=REPO, capture_output=True, text=True, check=True).stdout.strip()


def count_tests(paths: list[Path]) -> int:
    return sum(len(re.findall(r"^\s*(?:it|test)\(", path.read_text(encoding="utf-8"), re.M)) for path in paths)


def seam_list() -> list[str]:
    app = (REPO / "src" / "App.tsx").read_text(encoding="utf-8")
    seams = []
    for needle, label in [
        ("BranchShapeUtil,", "shapeUtils · BranchShapeUtil (BaseFrameLikeShapeUtil)"),
        ("const SYSTEMSKETCH_TOOLS = [BlockTool, BranchTool]", "tools · BranchTool (BaseBoxShapeTool)"),
        ("installBranchRegions(", "side effects · arm membership stamped after each operation"),
        ("installBranchClickToEdit(", "event seam · single-click titles (before-event / event)"),
    ]:
        if needle in app:
            seams.append(label)
    toolbar = (REPO / "src" / "toolbar" / "SystemSketchToolbar.tsx").read_text(encoding="utf-8")
    if "label: 'Branch', icon: <BranchIcon />" in toolbar:
        seams.append("toolbar · the Block slot became a system-design family (TldrawUiDropdownMenu)")
    ports = (REPO / "src" / "blocks" / "connections" / "blockPorts.ts").read_text(encoding="utf-8")
    if "isPortHostShape" in ports:
        seams.append("bindings · connection endpoints read a port host (Block or Branch)")
    visibility = (REPO / "src" / "blocks" / "blockVisibility.ts").read_text(encoding="utf-8")
    if "isHiddenByFoldedArm" in visibility:
        seams.append("getShapeVisibility · folded arms hide children and their cables")
    return seams


SEAM_SVG = """
<svg viewBox="0 0 1100 420" xmlns="http://www.w3.org/2000/svg" font-family="Inter,ui-sans-serif,system-ui" font-size="14">
  <defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0L10 5 0 10z" fill="#70a8ff"/></marker></defs>
  <g fill="#0c1321" stroke="#39465e">
    <rect x="20" y="30" width="220" height="70" rx="12"/>
    <rect x="20" y="150" width="220" height="70" rx="12"/>
    <rect x="20" y="270" width="220" height="70" rx="12"/>
    <rect x="300" y="30" width="330" height="310" rx="14" stroke="#70a8ff"/>
    <rect x="690" y="30" width="190" height="70" rx="12"/>
    <rect x="690" y="150" width="190" height="70" rx="12"/>
    <rect x="690" y="270" width="190" height="70" rx="12"/>
    <rect x="920" y="150" width="160" height="70" rx="12" stroke="#ffad57"/>
  </g>
  <g fill="#f8fafc" font-weight="700">
    <text x="130" y="58" text-anchor="middle">Toolbar family slot</text>
    <text x="130" y="178" text-anchor="middle">Selection pill</text>
    <text x="130" y="298" text-anchor="middle">Inspector (280px)</text>
    <text x="465" y="60" text-anchor="middle">branchCommands.ts</text>
    <text x="785" y="58" text-anchor="middle">BranchShapeUtil</text>
    <text x="785" y="178" text-anchor="middle">blockPorts.ts</text>
    <text x="785" y="298" text-anchor="middle">blockVisibility.ts</text>
    <text x="1000" y="178" text-anchor="middle">tldraw 5.3.2</text>
  </g>
  <g fill="#a8b3c7">
    <text x="130" y="80" text-anchor="middle">Block ▾ › Branch (BranchTool)</text>
    <text x="130" y="200" text-anchor="middle">Branch · + port · + arm · E · C · ◎</text>
    <text x="130" y="320" text-anchor="middle">control ports · arms · view</text>
    <text x="465" y="90" text-anchor="middle">one public mutation per gesture</text>
    <text x="465" y="130" text-anchor="middle">addControl · addArm · fold · active · view</text>
    <text x="465" y="160" text-anchor="middle">children keep their arm offset</text>
    <text x="465" y="200" text-anchor="middle">branchModel.ts (pure)</text>
    <text x="465" y="222" text-anchor="middle">layout · transitions · reconcile</text>
    <text x="465" y="262" text-anchor="middle">branchScope.ts (read)</text>
    <text x="465" y="284" text-anchor="middle">arm of child · fold attach · fade</text>
    <text x="465" y="320" text-anchor="middle">meta.branchArm stamped per child</text>
    <text x="785" y="80" text-anchor="middle">BaseFrameLikeShapeUtil</text>
    <text x="785" y="200" text-anchor="middle">port host = Block | Branch</text>
    <text x="785" y="320" text-anchor="middle">getShapeVisibility</text>
    <text x="1000" y="200" text-anchor="middle">stock, unforked</text>
  </g>
  <g stroke="#70a8ff" stroke-width="2" fill="none" marker-end="url(#a)">
    <path d="M240 65 H300"/><path d="M240 185 H300"/><path d="M240 305 H300"/>
    <path d="M630 65 H690"/><path d="M630 185 H690"/><path d="M630 305 H690"/>
    <path d="M880 65 C 905 65 905 185 920 185"/><path d="M880 185 H920"/><path d="M880 305 C 905 305 905 185 920 185"/>
  </g>
  <text x="550" y="400" text-anchor="middle" fill="#a8b3c7">Every gesture writes through the commands; the engine only ever sees updateShapes, reparentShapes and bindings.</text>
</svg>
"""


def main() -> None:
    checks = json.loads(RESULTS.read_text(encoding="utf-8"))
    passed = sum(1 for check in checks if check.get("ok"))
    branch_dir = REPO / "src" / "branch"
    unit_tests = count_tests(sorted(branch_dir.glob("*.test.ts")))
    source_lines = sum(
        len(path.read_text(encoding="utf-8").splitlines())
        for path in branch_dir.rglob("*")
        if path.suffix in {".ts", ".tsx", ".css"} and ".test." not in path.name
    )
    shortstat = git("diff", "--shortstat", "main...HEAD")
    commits = git("log", "--format=%h %s", "main..HEAD").splitlines()
    branch_name = git("rev-parse", "--abbrev-ref", "HEAD")
    seams = seam_list()

    rows = "".join(
        f'<li><span class="tick">{"✓" if check.get("ok") else "✗"}</span><span><b>{html.escape(check["id"])}</b> · {html.escape(str(check["label"]))}</span></li>'
        for check in checks
    )
    seam_rows = "".join(f"<li><span class='tick'>◆</span>{html.escape(seam)}</li>" for seam in seams)
    commit_rows = "".join(f"<li><code>{html.escape(line.split(' ', 1)[0])}</code> {html.escape(line.split(' ', 1)[1])}</li>" for line in commits)

    page = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>SystemSketch — Branch region</title>
<style>
:root{{--bg:#090d15;--panel:#111827;--line:#293449;--ink:#f8fafc;--muted:#a8b3c7;--blue:#70a8ff;--green:#65d28c;--orange:#ffad57;font-family:Inter,ui-sans-serif,system-ui,sans-serif}}
*{{box-sizing:border-box}}body{{margin:0;background:radial-gradient(circle at 80% 0,#18284b 0,transparent 32rem),var(--bg);color:var(--ink)}}
main{{width:min(1180px,calc(100% - 36px));margin:auto;padding:50px 0 72px}}h1{{max-width:960px;margin:12px 0;font-size:clamp(40px,6.5vw,72px);line-height:.96;letter-spacing:-.055em}}
.eyebrow{{color:var(--blue);font:800 12px ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase}}.lede{{max-width:860px;color:#cad2df;font-size:19px;line-height:1.55}}
.stats{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:30px 0 48px}}.stat,.card{{border:1px solid var(--line);border-radius:16px;background:rgba(17,24,39,.9)}}
.stat{{padding:18px}}.stat b{{display:block;font-size:28px}}.stat span,.muted{{color:var(--muted)}}h2{{margin:48px 0 12px;font-size:30px;letter-spacing:-.03em}}h3{{margin:26px 0 8px;font-size:18px}}
.shots{{display:grid;grid-template-columns:1fr 1fr;gap:16px}}.shots.one{{grid-template-columns:1fr}}figure{{margin:0;overflow:hidden;border:1px solid #39465e;border-radius:17px;background:white;box-shadow:0 20px 50px #0008}}figure img{{display:block;width:100%}}figcaption{{padding:13px 15px;background:var(--panel);color:var(--muted);font-size:14px;line-height:1.45}}figcaption b{{color:var(--ink)}}
.grid{{display:grid;grid-template-columns:1fr 1fr;gap:16px}}.card{{padding:22px}}.card h3{{margin-top:0}}
ul{{list-style:none;padding:0;margin:0}}li{{display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--line);color:#dce3ee;line-height:1.4}}li:last-child{{border:0}}.tick{{color:var(--green);font-weight:900;flex:0 0 auto}}
pre{{margin:0;overflow:auto;padding:18px;border:1px solid var(--line);border-radius:14px;background:#080c13;color:#cbd5e1;font:600 12.5px/1.6 ui-monospace,monospace}}
code{{padding:2px 5px;border-radius:5px;background:#1b2639;color:#d7e4fa}}a{{color:#86b7ff}}footer{{margin-top:48px;padding-top:20px;border-top:1px solid var(--line);color:var(--muted)}}
.decision{{border-left:3px solid var(--orange);padding:10px 14px;margin:10px 0;background:#0c1321;border-radius:0 10px 10px 0}}.decision b{{color:var(--orange)}}
.svg{{border:1px solid var(--line);border-radius:16px;background:rgba(17,24,39,.9);padding:12px}}.svg svg{{width:100%;height:auto;display:block}}
@media(max-width:800px){{.stats,.shots,.grid{{grid-template-columns:1fr}}}}
</style>
</head>
<body><main>
<div class="eyebrow">SystemSketch · Branch region · {html.escape(branch_name)}</div>
<h1>An <em>if</em> with a band,<br />arms, and no ports of its own.</h1>
<p class="lede">A Branch is a frame-like region, not a Block. Blocks drop into its arms, cables run straight to them, and the only ports the region owns are the control ports on its band. Arms fold to their header row (a cable into a folded arm lands on that row's edge), one arm can be made active (the others fade to 18%), and Case view keeps one arm open at a time and draws only its wires. The tool lives in a system-design submenu under the Block slot, the pill reads <code>Branch · + port · + arm · E · C · ◎ · Inspect</code>, and the inspector copies the Block's idiom with two lists. With an arm chosen, the other arms' cables and any outside competitor into a port the chosen arm also feeds fade to 18%, and a port with two or more producers wears a count badge.</p>
<div class="stats">
<div class="stat"><b>{passed}/{len(checks)}</b><span>real-browser checks (test:branch)</span></div>
<div class="stat"><b>{unit_tests}</b><span>new unit tests in src/branch</span></div>
<div class="stat"><b>{source_lines}</b><span>lines of Branch source (ts · tsx · css)</span></div>
<div class="stat"><b>{len(seams)}</b><span>stock seams, none forked</span></div>
</div>

<h2>The tool lives under the Block slot</h2>
<p class="muted">The Block slot became a family, like the shapes and draw slots beside it: a chevron opens a popover with a <b>System design</b> heading, Block (B) and Branch with the fork glyph. The slot icon remembers the last pick.</p>
<div class="shots">
<figure><img src="{crop_uri(shot('1-submenu'), (700, 830, 1100, 1000), 800)}" alt="System design submenu open under the Block slot" /><figcaption><b>Open.</b> The popover is the stock <code>TldrawUiDropdownMenu</code> family the shapes slot already uses; nothing new was bolted onto the toolbar.</figcaption></figure>
<figure><img src="{crop_uri(shot('1b-picked'), (700, 830, 1100, 1000), 800)}" alt="Slot shows the Branch fork glyph after the pick" /><figcaption><b>Picked.</b> The branch tool is active and the slot now shows the fork. A preference guard that ignored the new field was the first thing the journey caught.</figcaption></figure>
</div>

<h2>Authored on the canvas and in the inspector</h2>
<p class="muted">Control ports come from the band's blue "+" bubble or the inspector's "+"; arms from the dashed "+ arm" row under the region or the inspector. Both open the new field for typing in place. Titles edit on a single click, like a Block's.</p>
<div class="shots one">
<figure><img src="{crop_uri(shot('2-authored'), (400, 50, 1800, 940), 1180)}" alt="Branch with one control port and three arms, pill and inspector open" /><figcaption><b>One control port, three arms.</b> The pill above, the inspector at right (CONTROL PORTS with its "1 on band" chip; ARMS with drag grip, title, fold chevron, active target and ×), and the "+ arm" row hanging off the bottom edge while the region is selected.</figcaption></figure>
</div>

<h2>Cables run straight in; a control port takes a cable like any input</h2>
<div class="shots one">
<figure><img src="{crop_uri(shot('3-wired'), (0, 90, 1470, 910), 1180)}" alt="decode wired to two Blocks inside the arms, flag wired to the band's control port" /><figcaption><b>Five cables.</b> <code>decode()</code> fans out to <code>estimate()</code> in the first arm and <code>fallback()</code> in the second; <code>flag()</code> lands on the <code>fast</code> control port; <code>estimate()</code> and the outside <code>cached()</code> both feed <code>publish()</code>, whose input wears the "2" count badge. The Branch is transparent to scoping, so these are ordinary outer-face connections through the existing binding and rules.</figcaption></figure>
</div>

<h2>Fold re-attaches at the header; active fades the rest</h2>
<div class="shots">
<figure><img src="{crop_uri(shot('4-folded'), (0, 90, 1470, 700), 1100)}" alt="else arm folded, its Block hidden, the cable ending at the header's left edge" /><figcaption><b>Folded.</b> The <code>else</code> arm keeps only its header row; <code>fallback()</code> is hidden, not deleted, and decode's second cable now ends at the row's left edge centre.</figcaption></figure>
<figure><img src="{crop_uri(shot('5-active'), (0, 90, 1470, 910), 1100)}" alt="if fast arm active, the other arms and their Blocks faded" /><figcaption><b>Active.</b> ◎ on <code>if fast</code> marks it; every other arm, its Blocks and the cables touching them fade to the 18% token, and so does the outside competitor <code>cached()</code> → <code>publish()</code>, because the chosen arm's <code>estimate()</code> → <code>publish()</code> reaches the same port (clause iii). Choosing <code>else</code> instead leaves that competitor at full. Clicking ◎ again clears it.</figcaption></figure>
</div>

<h2>Case view</h2>
<div class="shots one">
<figure><img src="{crop_uri(shot('6-case'), (400, 50, 1800, 580), 1180)}" alt="Case view with one open arm and only its wires" /><figcaption><b>C on the pill.</b> At most one arm open; opening another folds the rest. Any cable touching a folded arm is not drawn, so only the open case's wires remain. E returns to the Expanded layout.</figcaption></figure>
</div>

<h2>The seam</h2>
<div class="svg">{SEAM_SVG}</div>
<div class="grid" style="margin-top:16px">
<div class="card"><h3>Stock seams used</h3><ul>{seam_rows}</ul></div>
<div class="card"><h3>Decisions the contract left to the implementation</h3>
<div class="decision"><b>Arm membership is a stamp.</b> A child's arm is derived from geometry (the open arm whose row holds its top edge) after each completed operation and written to <code>meta.branchArm</code>. A child of a folded arm keeps its stamp: its row has no body, so geometry would re-home it, which is exactly what a fold must survive.</div>
<div class="decision"><b>Port host, not a second port system.</b> <code>blockPorts.ts</code> reads ports from a host (Block or Branch) through one table, so a control port welds with the existing binding, polarity and fan-in rules.</div>
<div class="decision"><b>The body is transparent.</b> Cables live in the page's scope and paint under the region; a filled body would hide them.</div>
<div class="decision"><b>The active path is a fade, never an emphasis.</b> With an arm chosen, a cable fades when either end sits in a non-chosen arm, or when it lands on a port that a live cable from the chosen arm also reaches and does not come from that arm — phi-resolution at the consumer, Zach's many-to-one rule. Control cables into the band never fade that way. Nothing is thickened or tinted; emphasis belongs to a future live-data view.</div>
<div class="decision"><b>Many-to-one shows as a count.</b> A port with two or more producers wears a muted "2" pill beside its dot, on every Block port and band port, following the cables as they land and leave.</div>
<div class="decision"><b>The geometry trusts the record.</b> The base box tool holds a 1×1 placeholder during a drag-create and scales the record by new-bounds / initial-bounds; reporting the layout's height there shrank every arm to its floor.</div>
</div>
</div>

<h2>What the journey proved</h2>
<p class="muted">Real <code>Input.dispatchMouseEvent</code> gestures in headless Chrome against the product composition, on a scratch <code>.tldr</code>. Every check reads the editor or the DOM.</p>
<div class="card"><ul>{rows}</ul></div>

<h2>Review fixture</h2>
<p class="muted">Seeded through the real editor and autosave helper, cold-reopened, with numbered cue cards and a green PASS WHEN card. Open it on the track's own server:</p>
<pre>{html.escape(FIXTURE_URL)}</pre>
<div class="shots one" style="margin-top:14px">
<figure><img src="{crop_uri(FIXTURE_PNG, None, 1180)}" alt="Review fixture board" /><figcaption><b>sketches/review/branch-region.systemsketch.</b> Fold else, make if fast active, press C, add a control port, draw a second region.</figcaption></figure>
</div>

<h2>Left, and deliberately not done</h2>
<div class="grid">
<div class="card"><h3>Left (next, not blocked)</h3><ul>
<li><span class="tick">→</span>The exclusivity lint: many-to-one is legal only when the producers are mutually exclusive by construction (sibling arms of one region, or inside against outside across an implicit arm). Zach's rule is written as pure functions in <code>docs/many_to_one_rule.py</code> on <code>main</code>; the editor draws the count and the fade but does not yet judge legality.</li>
<li><span class="tick">→</span>Reordering arms by dragging their header row on the canvas. The inspector's ⋮⋮ grip reorders today; on-canvas reorder needs a handle seam and a decision about what a drag on a header means.</li>
<li><span class="tick">→</span>Resizing a region by its handles is unit-tested (the delta spreads over the open arms) but not driven by the journey.</li>
<li><span class="tick">→</span>A Branch nested inside a Branch fades as a whole (unit-tested); the journey nests nothing.</li>
<li><span class="tick">→</span>The VS Code / Cursor host registers the shape and tool but was not re-driven.</li>
</ul></div>
<div class="card"><h3>Deliberately not done</h3><ul>
<li><span class="tick">✕</span>No "Add › Branch region" in the right-click menu, per the contract; the boundary test asserts its absence.</li>
<li><span class="tick">✕</span>No ports on arms. Consumers keep one plain port with ordinary fan-in.</li>
<li><span class="tick">✕</span>Arm titles are free text, not code, for now.</li>
<li><span class="tick">✕</span>No schema migration: arm membership rides in <code>meta</code>, and the shape's own props start at version 0.</li>
</ul></div>
</div>

<footer>
<p><b>Branch</b> <code>{html.escape(branch_name)}</code> · {html.escape(shortstat)} against <code>main</code>.</p>
<ul>{commit_rows}</ul>
<p style="margin-top:14px">Built by <code>docs/build_branch_region_implementation.py</code>; numbers and captures are read from the tree at build time.</p>
</footer>
</main></body></html>
'''
    OUTPUT.write_text(page, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
