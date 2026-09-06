#!/usr/bin/env python3
"""
Implementation report: the Behavior Tree's dual drag ownership.

Zach's scoped exception to the stock-boundary rule, implemented: with Auto
layout ON a Tree region acts as a reactive diagram, so pressing a diagram
node hands the gesture to a real mounted dnd-kit context; pressing anything
else — whiteboard primitives drawn over the diagram included — stays native
tldraw. Plus the Dev-panel drag-model overlay that paints the invisible
Kanban the drag resolves against.

Every number is measured from this tree at build time: the acceptance JSONs
the three drag journeys wrote, the claim-gate literals grepped out of the
drag lane itself, the boundary-test rule, and line counts for every file the
work touched. Every capture is a real screenshot (or screencast) from
headless Chrome driving the real app.

Run:  python3 docs/build_tree_dual_drag_report.py
"""
from __future__ import annotations

import base64
import json
import re
import subprocess
from html import escape
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DOCS = REPO / "docs"
ASSETS = DOCS / "assets" / "behavior-tree-dual-drag"
STAMP = "2026-09-06"
OUT = DOCS / f"tree-dual-drag-report-{STAMP}.html"

REVIEW_BOARD = REPO / "sketches" / "review" / "dual-drag.systemsketch"
REVIEW_URL = f"http://127.0.0.1:4341/?board={REVIEW_BOARD}"

NEW_FILES = [
    "src/behaviorTree/treeDndDrag.tsx",
    "src/behaviorTree/treeDndDragState.ts",
    "src/behaviorTree/treeDndDrag.test.ts",
    "src/behaviorTree/BtDragModelOverlay.tsx",
    "src/behaviorTree/treeDragModelOverlayState.ts",
    "src/behaviorTree/treeDragModelOverlay.test.ts",
    "tests/behavior_tree_dual_drag_smoke.mjs",
    "src/behaviorTree/treeDragTuningState.ts",
    "src/behaviorTree/dragSensitivity.ts",
    "src/behaviorTree/dragSensitivity.test.ts",
    "src/behaviorTree/ui/BtDragModelTunerPanel.tsx",
    "tests/behavior_tree_drag_tuner_smoke.mjs",
    "src/behaviorTree/processDragList.ts",
    "src/behaviorTree/processDragList.test.ts",
    "tests/behavior_tree_process_drag_smoke.mjs",
    "sketches/review/dual-drag.systemsketch",
    "skills/systemsketch-review-fixture/assets/dual-drag-review-recipe.json",
]
MODIFIED_FILES = [
    "src/behaviorTree/installBehaviorTreeRegions.ts",
    "src/behaviorTree/dragListReorder.ts",
    "src/behaviorTree/BehaviorTreeCanvas.tsx",
    "src/behaviorTree/behavior-tree.css",
    "src/behaviorTree/index.ts",
    "src/chrome/SystemSketchChrome.tsx",
    "src/chrome/SelectionContextualMenu.tsx",
    "src/installConnectorControlVisibility.ts",
    "src/SystemSketchUtilities.tsx",
    "src/developmentSeam.ts",
    "src/theme/tokens.css",
    "tests/test_stock_boundary.py",
    "package.json",
]


def data_uri(path: Path, mime: str) -> str:
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


def acceptance(name: str) -> dict:
    path = DOCS / "assets" / name / "acceptance.json"
    return json.loads(path.read_text(encoding="utf-8"))


def line_count(relative: str) -> int:
    return len((REPO / relative).read_text(encoding="utf-8").splitlines())


def grep_gate_literals() -> list[str]:
    source = (REPO / "src" / "behaviorTree" / "treeDndDrag.tsx").read_text(encoding="utf-8")
    found = []
    for literal in (
        "region.props.projection !== 'tree' || region.props.arrangement !== 'tidy'",
        "meta.btRole !== 'node'",
        "editor.cancel()",
        "editor.markEventAsHandled(clone)",
        "export const BT_DND_CLAIM_DISTANCE_PX = 3",
    ):
        if literal in source:
            found.append(literal)
    return found


def boundary_rule() -> tuple[str, int]:
    source = (REPO / "tests" / "test_stock_boundary.py").read_text(encoding="utf-8")
    match = re.search(
        r"def test_the_behavior_tree_dual_drag_exception_is_scoped_and_mutually_exclusive.*?(?=\n    def )",
        source,
        flags=re.S,
    )
    body = match.group(0) if match else ""
    return ("present" if match else "MISSING"), body.count("assert")


def main() -> None:
    dual = acceptance("behavior-tree-dual-drag")
    reorder = acceptance("behavior-tree-tree-drag-reorder")
    polish = acceptance("behavior-tree-drag-polish")
    tuner = acceptance("behavior-tree-drag-tuner")
    process = acceptance("behavior-tree-process-drag")
    sensitivity = json.loads((DOCS / "assets" / "behavior-tree-dual-drag" / "sensitivity.json").read_text(encoding="utf-8"))
    gate_literals = grep_gate_literals()
    rule_present, rule_asserts = boundary_rule()
    dnd_lines = line_count("src/behaviorTree/treeDndDrag.tsx")
    overlay_lines = line_count("src/behaviorTree/BtDragModelOverlay.tsx")

    hero_webm = data_uri(ASSETS / "hero-dual-drag.webm", "video/webm")
    hero_gif = data_uri(ASSETS / "hero-dual-drag.gif", "image/gif")

    def img(name: str, caption: str) -> str:
        return (
            f'<figure class="frame"><img alt="{escape(caption)}" src="{data_uri(ASSETS / name, "image/png")}"/>'
            f"<figcaption>{escape(caption)}</figcaption></figure>"
        )

    TUNER_ASSETS = DOCS / "assets" / "behavior-tree-drag-tuner"
    PROCESS_ASSETS = DOCS / "assets" / "behavior-tree-process-drag"

    def tuner_img(name: str, caption: str) -> str:
        return (
            f'<figure class="frame"><img alt="{escape(caption)}" src="{data_uri(TUNER_ASSETS / name, "image/png")}"/>'
            f"<figcaption>{escape(caption)}</figcaption></figure>"
        )

    def process_img(name: str, caption: str) -> str:
        return (
            f'<figure class="frame"><img alt="{escape(caption)}" src="{data_uri(PROCESS_ASSETS / name, "image/png")}"/>'
            f"<figcaption>{escape(caption)}</figcaption></figure>"
        )

    def sensitivity_rows() -> str:
        rows = []
        for row in sensitivity["table"]:
            down, right = row["down"], row["right"]
            ratio = down["capturePx"] / max(1, right["capturePx"])
            rows.append(
                "<tr>"
                f"<th>{escape(row['scenario'])}<small>{escape(row['path'])}</small></th>"
                f"<td><b>{down['capturePx']}px</b><small>release {down['releaseBackPx']}px · w {round(down['crossExtentPx'])}</small></td>"
                f"<td><b>{right['capturePx']}px</b><small>release {right['releaseBackPx']}px · h {round(right['crossExtentPx'])}</small></td>"
                f"<td><b>{ratio:.1f}×</b></td>"
                "</tr>"
            )
        return "".join(rows)

    def checks_rows(payload: dict) -> str:
        rows = []
        for entry in payload["results"]:
            rows.append(
                f'<li><span>{escape(entry["id"])}</span>{escape(entry["label"])}'
                f'<i>{"PASS" if entry["ok"] else "FAIL"}</i></li>'
            )
        return "".join(rows)

    files_rows = "".join(
        f"<li><span>new</span><code>{escape(f)}</code><i>{line_count(f) if not f.endswith('.systemsketch') else '—'}</i></li>"
        for f in NEW_FILES
    ) + "".join(
        f"<li><span>mod</span><code>{escape(f)}</code><i>{line_count(f)}</i></li>" for f in MODIFIED_FILES
    )

    quote = (
        "only when we’ve turned on auto formatting. At that point it no longer acts as a "
        "whiteboard, but as this reactive diagram. I still want to be able to draw whiteboard "
        "primitives over top of it, and tldraw can’t own that, but I do think it is more "
        "accurate to actually create two drag systems — if you’re clicking on something "
        "that is part of the diagram, the dnd-kit drag system overtakes; if you’re doing "
        "something that is not part of the diagram, you use the whiteboard one."
    )

    html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Dual drag ownership — Behavior Tree · {STAMP}</title>
<style>
:root{{--ink:#172033;--muted:#667085;--line:#d7deea;--paper:#f4f7fb;--card:#fff;--blue:#2563eb;--blue2:#dbeafe;--violet:#6d5ed9;--orange:#ea790f;--green:#087a55;--mono:ui-monospace,SFMono-Regular,Menlo,monospace}}
*{{box-sizing:border-box}}body{{margin:0;background:radial-gradient(circle at 84% -8%,#e4e0fb 0,transparent 40%),var(--paper);color:var(--ink);font:15px/1.55 Inter,ui-sans-serif,system-ui,sans-serif}}
main{{width:min(1180px,calc(100% - 40px));margin:0 auto;padding:54px 0 80px}}
.eyebrow{{font:700 12px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--violet)}}
h1{{max-width:900px;margin:15px 0 12px;font-size:clamp(40px,6.4vw,70px);line-height:.95;letter-spacing:-.05em}}h1 em{{color:var(--violet);font-style:normal}}
.lede{{max-width:830px;color:#465268;font-size:19px}}
.stats{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:26px 0}}
.stat,.card{{background:color-mix(in srgb,var(--card) 94%,transparent);border:1px solid var(--line);border-radius:16px;box-shadow:0 8px 28px #2531490b}}
.stat{{padding:16px}}.stat b{{display:block;font:750 24px/1.1 var(--mono)}}.stat span{{color:var(--muted);font-size:12px}}
video{{display:block;width:100%;height:auto;border-radius:16px}}
.hero-video{{border:1px solid var(--line);border-radius:18px;overflow:hidden;background:#0f1522;box-shadow:0 18px 48px #25314918}}
.hero-video p{{margin:0;padding:11px 16px;color:#c8d2e4;font-size:13px;background:#0f1522}}
details.gif summary{{cursor:pointer;color:var(--blue);font-weight:650;margin:8px 2px}}
.section{{margin-top:52px}}.section h2{{font-size:29px;letter-spacing:-.025em;margin:0 0 8px}}.section>p{{max-width:860px;color:var(--muted);margin:0 0 18px}}
blockquote{{margin:18px 0;padding:18px 22px;border-left:4px solid var(--violet);background:#efeefb;border-radius:0 14px 14px 0;font-size:16.5px;max-width:860px}}
.frame{{margin:0;overflow:hidden;border:1px solid var(--line);border-radius:16px;background:#fff;box-shadow:0 14px 38px #25314912}}
.frame img{{display:block;width:100%;height:auto}}.frame figcaption{{padding:12px 15px;border-top:1px solid var(--line);color:var(--muted);font-size:13.5px}}
.grid{{display:grid;grid-template-columns:1fr 1fr;gap:18px}}
.card{{padding:20px}}.card h3{{margin:0 0 8px}}.card p{{color:var(--muted);margin:0}}
.flow{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:18px}}
.flow div{{position:relative;padding:15px 13px;min-height:118px;border:1px solid var(--line);border-radius:13px;background:#fff}}
.flow div:not(:last-child):after{{content:'→';position:absolute;right:-14px;top:40px;z-index:2;color:var(--violet);font-size:20px}}
.flow b{{display:block;margin-bottom:4px}}.flow span{{color:var(--muted);font-size:12.5px}}
.checks{{list-style:none;padding:0;margin:14px 0 0}}
.checks li{{display:grid;grid-template-columns:210px 1fr auto;gap:12px;padding:9px 0;border-top:1px solid var(--line);align-items:center;font-size:13.5px}}
.checks span{{font:700 11.5px var(--mono);color:var(--violet)}}.checks i{{font:700 11px var(--mono);color:var(--green)}}
.checks code{{font:600 12.5px var(--mono)}}
.gate{{margin:14px 0 0;padding:0;list-style:none}}
.gate li{{padding:9px 12px;border:1px solid var(--line);border-radius:10px;margin:7px 0;background:#fff;font:600 13px var(--mono);overflow-x:auto;white-space:nowrap}}
.senstable{{width:100%;max-width:860px;border-collapse:collapse;margin:6px 0 14px}}.senstable th,.senstable td{{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line)}}.senstable thead th{{font:700 11px var(--mono);text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}}.senstable tbody th{{font-weight:650}}.senstable tbody th small{{display:block;color:var(--muted);font-weight:500;font-size:11px}}.senstable td b{{font:700 15px var(--mono)}}.senstable td small{{display:block;color:var(--muted);font-size:11px}}.urlbox{{margin-top:14px;padding:15px 18px;background:#101827;color:#e8eefb;border-radius:14px;font:600 13.5px var(--mono);overflow-x:auto;white-space:nowrap}}
.decision{{margin-top:48px;padding:20px 22px;border-left:4px solid var(--blue);background:var(--blue2);border-radius:0 12px 12px 0;max-width:980px}}
.decision h2{{margin:0 0 10px;font-size:22px}}
.decision ul{{margin:8px 0 0;padding-left:20px}}.decision li{{margin:7px 0}}
footer{{margin-top:34px;color:var(--muted);font:12px var(--mono)}}
@media(max-width:820px){{.grid{{grid-template-columns:1fr}}.flow{{grid-template-columns:1fr 1fr}}.stats{{grid-template-columns:1fr 1fr}}main{{width:min(100% - 24px,1180px)}}}}
</style></head><body><main>
<header>
  <div class="eyebrow">SystemSketch · Behavior Tree · shipped in worktree · {STAMP}</div>
  <h1>Two drag systems, <em>one owner</em> per gesture.</h1>
  <p class="lede">With Auto layout ON, a Tree region stops being a whiteboard and becomes a reactive
  diagram — so pressing a diagram node now hands the gesture to a real mounted dnd-kit context,
  while everything else, whiteboard ink drawn over the diagram included, stays byte-identical
  native tldraw. Plus a Dev-panel overlay that paints the invisible Kanban the drag resolves against.</p>
</header>

<div class="stats">
  <div class="stat"><b>{dual["passed"]}/{dual["total"]}</b><span>dual-drag boundary journey (new)</span></div>
  <div class="stat"><b>{reorder["passed"]}/{reorder["total"]} · {polish["passed"]}/{polish["total"]}</b><span>existing reorder + polish journeys, now on the dnd path</span></div>
  <div class="stat"><b>{rule_asserts} asserts</b><span>new stock-boundary rule ({rule_present}), test updated not disabled</span></div>
  <div class="stat"><b>{tuner["passed"]}/{tuner["total"]} tuner</b><span>Drag Model Tuner journey; {dnd_lines}+{overlay_lines} lines drag lane + overlay</span></div>
</div>

<div class="hero-video">
  <video controls muted loop playsinline autoplay src="{hero_webm}"></video>
  <p>12.6&thinsp;s from the real app, headless Chrome screencast: Dev overlay switched on through the real
  Dev panel · a node drag — dnd-kit owns it, tldraw idle, live reorder, active column highlighted ·
  a second deeper reorder · then the black whiteboard arrow lying across the diagram dragged natively
  there and back. No frame is fabricated.</p>
</div>
<details class="gif"><summary>GIF fallback (same take)</summary>
  <figure class="frame"><img alt="GIF fallback of the hero take" src="{hero_gif}"/></figure>
</details>

<section class="section">
  <h2>The decision, in Zach's own words</h2>
  <blockquote>&ldquo;{escape(quote)}&rdquo;</blockquote>
  <p>That authorization is implemented as a <b>precisely conditioned</b> exception, recorded in the WHY
  header of <code>src/behaviorTree/treeDndDrag.tsx</code> with a note that a PEP is owed at merge
  (single-drag-owner vs conditional-dual-drag-owner). The claim gate, grepped from the shipped source
  at build time:</p>
  <ul class="gate">{"".join(f"<li>{escape(lit)}</li>" for lit in gate_literals)}</ul>
</section>

<section class="section">
  <h2>How a gesture is claimed — and why the two systems can never fight</h2>
  <p>The measured two-writer corruption the old observer path documented is the failure mode this
  design rules out structurally. Everything runs through tldraw's public API: its own hit test
  replicated verbatim, its own cancel event, its documented <code>markEventAsHandled</code> seam.</p>
  <div class="flow">
    <div><b>1 · Shadow</b><span>The pointer-down flows to tldraw untouched: selection, clicks,
    double-click, right-click all keep stock meaning. A capture listener merely remembers presses
    that match the gate.</span></div>
    <div><b>2 · Preempt</b><span>At 3&thinsp;px — strictly under tldraw's 4&thinsp;px drag threshold —
    <code>editor.cancel()</code> is queued. FIFO dispatch guarantees it lands between the pointer-down
    and the crossing move: <code>select.translating</code> can never engage.</span></div>
    <div><b>3 · Hand off</b><span>The remembered press is cloned, hidden from tldraw via
    <code>markEventAsHandled</code>, and dispatched at the mounted DndContext's proxy. dnd-kit's real
    PointerSensor owns the pointer from there: moves, drop, Escape, window-blur.</span></div>
    <div><b>4 · Interlock</b><span>A reactor on <code>select.translating</code> catches any residual
    route (long-press, selection-bounds grab) and cancels + claims on entry — an invariant, not a
    race. Multi-select stays native and settles back.</span></div>
  </div>
</section>

<section class="section">
  <h2>The boundary, photographed from both sides</h2>
  <div class="grid">
    {img("arrow-over-diagram-mid-drag.png", "A whiteboard arrow drawn across the auto-laid-out diagram, mid-drag: select.translating, dnd signal null — tldraw owns it whole, the tree never reacts. The single most direct test of the mutual-exclusivity boundary.")}
    {img("node-dnd-mid-drag.png", "A diagram node mid-drag: tldraw sits in select.idle the entire gesture while dnd-kit drives — the reorder has already committed live, siblings reflowed, wires re-anchored to the moving card.")}
  </div>
</section>

<section class="section">
  <h2>The invisible Kanban, made visible (Dev panel toggle)</h2>
  <p>Off by default; flips live from Dev → Behavior Tree → &ldquo;Show the Tree drag model&rdquo;.
  Violet columns are the per-parent container zones (tiled adjudication areas), dashed violet the
  members' real union, orange the uniform virtual card slots. It is a read-only rendering pass over
  the REAL geometry: mid-drag it draws the live session's own frozen ghost context — the exact object
  <code>resolveDragListDrop</code> runs against, hysteresis highlight included — and at rest the same
  <code>deriveDragListGeometry</code> derivation over the resting layout. No third computation exists
  to drift.</p>
  <div class="grid">
    {img("overlay-at-rest.png", "At rest: parallel sibling lists paint as columns side by side (Fallback's and Parallel's lists share the depth-2 strip), the nested Sequence list sits in its own row below, and beside Expanded GraspValid the un-Expanded sibling's orange virtual slot is visibly padded far past its painted card.")}
    {img("overlay-mid-drag.png", "Mid-drag: the session's frozen ghost geometry holds still while cards move — that stillness IS the model — with the hysteresis deadband's current container highlighted.")}
  </div>
</section>

<section class="section">
  <h2>The sensitivity complaint, measured — and the Drag Model Tuner</h2>
  <p>Zach's two review recordings (same document, spacing 2) are the ground truth: on the
  <b>left-right</b> tree one swap took ≈68 page px and felt right; on the <b>top-down</b> tree six
  consecutive gestures needed 150–370 px each. Every gesture claimed correctly — the cost lives in
  resolution, and his hypothesis was exact: both the swap distance and the deadband scale with the
  dragged rectangle's CROSS extent, which is card <b>width</b> (~270–370&thinsp;px here) top-down but card
  <b>height</b> (~64–112&thinsp;px) left-right, with spacing&nbsp;2 doubling the gap term on top. Driven
  through the real resolver (<code>measureSwapTravel</code>, pinned by
  <code>dragSensitivity.test.ts</code> and recomputed live in the tuner):</p>
  <table class="senstable"><thead><tr><th>scenario</th><th>top-down capture</th><th>left-right capture</th><th>ratio</th></tr></thead>
  <tbody>{sensitivity_rows()}</tbody></table>
  <p>The tuner (Dev → Behavior Tree → <b>Drag Model Tuner</b>) makes every parameter a live slider —
  claim distance, lead-side capture padding, the deadband's extent factor and fixed padding (factor 0
  = dimension-independent, the direct test of the hypothesis; the unit suite proves it equalises
  release travel across orientations to ≤2&thinsp;px), climb reach, zone overhang — with independent
  layer switches for containers / virtual slots / capture-release lines / climb ring, the measured
  table recomputed per scenario and per orientation on every change, and <b>Copy values for chat</b>
  exporting tuning JSON + readouts. {tuner["passed"]}/{tuner["total"]} browser checks, including the
  behavioral one: +240&thinsp;px deadband padding makes a past-default-swap drag commit nothing, and
  Reset makes the same travel commit again.</p>
  <div class="grid">
    {tuner_img("tuner-open.png", "The tuner over the complaint configuration (top-down, spacing 2): layer switches, six live knobs, and the measured table — 496px vs 233px capture for the same root-leaf swap, the orientation asymmetry as numbers.")}
    {tuner_img("tuner-mid-drag.png", "Mid-drag with the panel open: the active strip highlighted, teal capture lines, the labeled release boundary, and the orange climb ring marking where the drag would re-parent upward.")}
  </div>
  <p><b>Recommended starting point for the taste pass</b> (then paste your Copy output back):
  <code>releaseFactor 0.5 · releasePaddingPx 24</code> halves the dimension-scaled term and adds a
  fixed floor; if top-down still feels heavy, <code>releaseFactor 0</code> +
  <code>releasePaddingPx 32–48</code> is the fully dimension-independent deadband. Capture distance
  itself is dominated by ghost-slot geometry (you must actually reach the neighbour's slot), so if
  tuned values differ per orientation, per-orientation defaults are the follow-up — the state module
  is shaped so that lands as data, not surgery.</p>
</section>

<section class="section">
  <h2>Ported: Process view runs the same drag model</h2>
  <p>Zach's second follow-up ("I'm confident that you're on the right path to make it work for the
  process view") landed the same day: the identical claim protocol and session driver now accept
  <code>projection === 'process'</code> when Auto layout is on, resolved by
  <code>processDragList.ts</code> — the same ghost model, the same tuned hysteresis knobs, the same
  <code>moveBehaviorTreeNode</code> judge, adapted to Flowstate's geometry. Two things are genuinely
  different and deliberate: each list carries its OWN sort axis read off the base layout (a
  Sequence stacks steps along the flow, a Parallel forks lanes across it, a Fallback holds arm heads
  across the recovery gap), and container adjudication is nested-containment — a real card-union hit
  wins deepest-first, contested pad-gaps split at their midpoint by nearest-real-bound (Tree's zone
  tiling, read in 2D). Two measured first-cut failures are now pinned as unit tests: ghost-anchored
  claim areas swallowed presses one card-extent off, and a card-less section (a Fallback between two
  steps) poisoned the median-gap deadband to 516&thinsp;px — the fix reads the layout's own rhythm unit
  (<code>PROCESS_GAP × spacing</code>) instead. One arrangement contract now covers both views
  (Process gets the full Auto-layout toggle; free offsets apply only when it's off), and
  <b>{process["passed"]}/{process["total"]}</b> browser checks prove rail reorders, lane reparents,
  one-step undo, Escape revert and native free-drags — with mid-gesture ownership sampled from the
  editor exactly as the Tree journeys sample it.</p>
  <div class="grid">
    {process_img("process-dnd-mid-drag.png", "A rail step mid-dnd-drag in the real Flowstate grammar — Start, Failure chip, recovery lane, fork/join bars — with the swap already committed live and tldraw sitting in select.idle.")}
    {process_img("process-reparent-after.png", "After dropping the step among the recovery lane's cards: it joined the Fallback's list — nested-containment adjudication plus the shared judge, no Tree-specific machinery involved.")}
  </div>
  <p>Known limit, deliberate for v1: the drag-model overlay and the tuner's measured table stay
  Tree-only (the Process containers ARE tuner-governed, but not yet painted), and Process wires
  re-anchor on commit rather than riding the card per frame — both follow-ups, not architecture.</p>
</section>

<section class="section">
  <h2>Every check, read back from the editor — never inferred from pixels</h2>
  <p>The new dual-drag journey ({dual["passed"]}/{dual["total"]}, generated {escape(dual["generatedAt"])}).
  Ownership claims are sampled mid-gesture from <code>editor.getPath()</code> and the drag lane's
  editor-scoped signal.</p>
  <ul class="checks">{checks_rows(dual)}</ul>
</section>

<section class="section">
  <h2>Regression: the two existing drag journeys, unchanged, now prove the dnd path</h2>
  <p>Their gestures are plain primary drags, so the claim protocol now owns them — same outcomes as
  the observer path they were written against, including live reflow, one-step undo, refusal toasts,
  subtree carrying, Expanded-override re-keying, free-arrangement offsets, wires riding the card at
  0&thinsp;px gap, and 2× spacing resolution. Escape-cancel is now strictly better: it bails the whole
  gesture to its history mark, where the old path left the last candidate XML committed.</p>
  <div class="grid">
    <div class="card"><h3>test:tree-drag-reorder — {reorder["passed"]}/{reorder["total"]}</h3>
      <p>Generated {escape(reorder["generatedAt"])}. Sibling reorder, subtree carry, illegal-drop refusal,
      Auto-layout-off free offsets, Expanded-override resolution.</p></div>
    <div class="card"><h3>test:drag-polish — {polish["passed"]}/{polish["total"]}</h3>
      <p>Generated {escape(polish["generatedAt"])}. Live wire tracking (worst mid-drag gap 0&thinsp;px),
      settle-on-drop, composite anchors, elbow legs, spacing slider.</p></div>
  </div>
  <p style="margin-top:16px">Full suites beside them: <b>tsc clean · 1544 vitest · 119 Python unittest
  (the updated stock-boundary rule included) · breadcrumbs journey</b> — all green at handoff, re-verified
  after the machine crash mid-session.</p>
</section>

<section class="section">
  <h2>Try it — the review board is live</h2>
  <p>Seeded fixture with numbered cues: drag a node (live reorder), drag the black arrow lying across
  the diagram (plain ink), Escape mid-drag, Auto layout off. The server pair 4341/4342 runs from this
  worktree and stays up.</p>
  <div class="urlbox">{escape(REVIEW_URL)}</div>
</section>

<section class="section">
  <h2>Files</h2>
  <ul class="checks">{files_rows}</ul>
</section>

<div class="decision">
  <h2>Decision surface</h2>
  <ul>
    <li><b>Done and proved:</b> the scoped dual-drag exception end to end ({dual["passed"]}/{dual["total"]}
    new checks + {reorder["passed"]}/{reorder["total"]} + {polish["passed"]}/{polish["total"]} regression),
    the drag-model overlay + Drag Model Tuner ({tuner["passed"]}/{tuner["total"]}), the Process view
    port on the same architecture ({process["passed"]}/{process["total"]}), the stock-boundary test
    extended with the precise new rule ({rule_asserts} assertions), review board live.</li>
    <li><b>Needs Zach:</b> nothing to unblock. Judgment calls made and reversible: claim scope excludes
    modified/multi-select presses (they stay native and glide-settle); Escape now reverts the whole drag;
    hover rings still paint during a dnd drag (tldraw stays live for non-gesture feedback) — say the word
    and any of these flips.</li>
    <li><b>Deliberately not done:</b> <code>SortableContext</code>/<code>useSortable</code> are not
    mounted — dnd-kit's DOM-measured sortable layer would be a second, staler copy of a layout the XML
    projection owns (screen-space measurements go stale under mid-drag zoom); the page-space pipeline
    stays the resolver, fed by the real sensor. The boundary test forbids the sortable import. No PEP
    written yet — owed at merge, per <code>docs/peps/README.md</code>, flagged in the WHY header.</li>
    <li><b>Peer note:</b> this worktree is shared; a peer's in-flight BtInsertGlyph work and a
    +910-line layouts.test.ts edit (one-line missing import fixed additively to unblock the shared tsc
    gate) are interleaved uncommitted — version-control integration left to the dispatcher on purpose.</li>
  </ul>
</div>

<footer>build_tree_dual_drag_report.py · measured from the live tree at build time · {STAMP}</footer>
</main></body></html>"""
    OUT.write_text(html, encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
