#!/usr/bin/env python3
"""Build the implementation report for the SystemSketch data-edge rebuild.

Six phases, applied as planned in `docs/block-edge-rebuild-2026-09-01.html`:
the donor's module boundary, boundary inner faces, the on-canvas picker in
place of the armed state, refusal made visible, the hit profile, and the edge
editor.
"""

from __future__ import annotations

import base64
import html
import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DOCS = PROJECT_ROOT / "docs"
ASSETS = DOCS / "assets"
OUTPUT = DOCS / "block-edge-implementation-2026-09-01.html"

# The canvas region of the harness's 1440x960 captures.
CROP = (270, 150, 1130, 760)
WIDE_CROP = (150, 150, 1300, 760)


def data_uri(path: Path) -> str:
    mime = {".png": "image/png", ".jpg": "image/jpeg"}[path.suffix.lower()]
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"


def evidence(name: str, crop=CROP) -> str:
    """Crop one harness capture to the canvas and inline it."""
    from PIL import Image

    source = ASSETS / name
    out = ASSETS / f"crop-{name}"
    image = Image.open(source).convert("RGB").crop(crop)
    image = image.resize((image.width * 2, image.height * 2), Image.LANCZOS)
    image.save(out, optimize=True)
    return data_uri(out)


def code(text: str) -> str:
    return html.escape(text.strip("\n"))


ACCEPTANCE = json.loads((ASSETS / "edge-acceptance.json").read_text())
EDITOR = json.loads((ASSETS / "edge-editor.json").read_text())


# --------------------------------------------------------------------------- #
# Code
# --------------------------------------------------------------------------- #

INNER_FACES = """
// blockModel.ts — a boundary port grows a second identity.
export const INNER_PORT_SUFFIX = '__inner'

// blockPorts.ts — same anchor, flipped terminal, hidden outside `expanded`.
function withInnerFaces(ports, view) {
  const inside = view === 'expanded'
  return ports.flatMap((port) => [port, {
    ...port,
    id: innerPortId(port.id),
    terminal: port.terminal === 'start' ? 'end' : 'start',   // FLIPPED
    hidden: port.hidden || !inside,                          // present in every view
    inner: true,
  }])
}
"""

SCOPE_RULE = """
// blockPorts.ts — which FACE a cable coming from `fromShapeId` may land on.
//
// A boundary port is a member of two scopes and a cable belongs to exactly one.
// Terminal alone is not enough: both faces sit at the same coordinate, so the
// filter would happily accept `decode.out → run.in` — data leaving the box
// through its own inlet.
function faceIsInScope(editor, port, blockId, fromShapeId) {
  if (!fromShapeId) return true                    // no scope to compare yet
  const from = editor.getShape(fromShapeId)
  const internal = fromShapeId === blockId
    || (from !== undefined && editor.hasAncestor(from, blockId))
  return port.inner ? internal : !internal
}

// installConnections.ts — and ONE authority for which face a press starts from.
// The DOM listener used to re-derive "nearest port" and silently overrule the
// painted dot's own choice, because it ran last.
const pressedPortId = dot.dataset.blockPortId
const face = activeBlockPortFace(editor, pressedShapeId, pressedPortId)
"""

NO_ARMED_STATE = """
// PointingBlockPort.ts — two exits, and no state that outlives the gesture.
export class PointingBlockPort extends StateNode {
  onPointerMove(info) { if (dragging) this.parent.transition('dragging_handle', {...}) }
  onPointerUp(info)   { this.parent.transition('idle', info); offerBlockFromPort(...) }
  onLongPress(info)   { /* reorder — unchanged */ }
}

// ConnectionShapeUtil.tsx — a cable that landed on EMPTY SPACE is a question.
onHandleDragEnd(connection, { handle, isCreatingShape }) {
  if (getConnectionBindings(this.editor, connection.id)[terminal]) return
  // tldraw hands this the INITIAL handle, so ask the pointer where it landed.
  const dropPoint = this.editor.inputs.getCurrentPagePoint()
  const overABlock = this.editor.getShapeAtPoint(dropPoint, {
    hitInside: true, filter: (shape) => isBlockShape(shape),
  }) !== undefined
  if (isCreatingShape && !overABlock) {
    offerBlockForLooseTerminal(this.editor, connection.id, terminal)   // the picker
    return
  }
  if (!connectionHasBothTerminals(this.editor, connection.id)) {
    this.editor.deleteShapes([connection.id])
  }
}

// OnCanvasBlockPicker.tsx — the offer's lifetime is DERIVED, not enumerated.
useQuickReactor('tool guard', () => {
  if (blockPickerState.get(editor) === null) return
  if (editor.getCurrentToolId() === 'select') return
  closeBlockPicker(editor)                       // A, the toolbar, anything future
}, [editor])
"""

AFFORDANCE = """
// ConnectionShapeUtil.onHandleDrag — refusal, made visible.
const wouldCycle = anchoredShapeId
  ? getAllConnectedBlocks(this.editor, anchoredShapeId, terminal)
  : null
updatePortState(this.editor, { eligiblePorts: { terminal, excludeBlocks: wouldCycle } })

// A hierarchy edge is exempt from the cycle veto: the walk is flat, so a child
// feeding its own parent's outlet reads as a loop when it is the hierarchy
// working as designed.
const isHierarchyEdge = (target?.port.inner ?? false)
  || (oppositeBinding ? isInnerPortId(oppositeBinding.props.portId) : false)

// An input takes one cable. The replacement is DEFERRED to the drag end, so an
// abandoned drag never destroys the wire it merely hovered.
this.pendingReplacementId = occupant && terminal === 'end' ? occupant.connectionId : null
"""

HIT_PROFILE = """
// connectionHit.ts — why the corridor cannot be widened from a call site.
//
//   Editor.getShapeAtPoint → `if (distance < this.getHitTestMargin()) return shape`
//   getHitTestMargin()     → `options.hitTestMargin (3) / zoom`
//
// The `margin` a caller passes is IGNORED on the open-geometry branch, so a 2px
// cable is only ever ±3 screen px wide to the pointer. The pad goes on the
// geometry instead, live, so it follows the profile at every zoom.
export function cableHitPadPageUnits(zoom, engineMarginPageUnits) {
  return Math.max(0, cableHitTargetPageUnits(zoom) - engineMarginPageUnits)
}

systemsketch: {
  cable:     { pageUnits: PORT_OUTER_RADIUS },     //  9u — the dot's outer radius
  port:      { pageUnits: PORT_OUTER_DIAMETER },   // 18u — the dot, twice
  reconnect: { pageUnits: 10 },                    // React Flow's own number
}
"""

FIGMA_RULE = """
// ConnectionShapeUtil.getHandles — Figma's rule.
// Selection alone is the wrong trigger: a selected cable spanning the board
// would offer grabbable points along its whole length, every one a thing to
// knock by accident.
if (nearbyConnection.get(this.editor) !== connection.id) return handles

// connectionProximity.ts — only SELECTED cables are measured, and the atom
// flips at the threshold, so getHandles recomputes on the ANSWER changing
// rather than on every pointer move.
"""

# --------------------------------------------------------------------------- #
# Content
# --------------------------------------------------------------------------- #

PHASES = [
    ("0", "The donor's module boundary", "shipped", [
        "<code>portState.ts</code> — an editor-scoped atom for transient interaction state, so what is highlighted while you drag never reaches the document, the file, or undo.",
        "<code>getLiveBlockPorts</code> / <code>getBlockPortConnections</code> — <code>createComputedCache</code> tables keyed on the Block record, so the dot, the hit test, the connected state and the binding position all read one projection.",
        "The cache degrades to the pure projection when an editor has no store, because the cache is a memo and the projection is the truth.",
    ]),
    ("1", "Boundary inner faces", "shipped", [
        "Every port derives a <code>…__inner</code> twin: same anchor, flipped terminal, hidden outside Expanded so a welded cable survives a view switch.",
        "<b>One</b> authority for which face a press starts from — the DOM listener was re-deriving “nearest port” and silently overruling the painted dot, because <code>queueMicrotask</code> made it run last.",
        "A scope rule at the drop: a cable whose other end is inside this Block must meet the inner face; anything else must meet the outer one.",
    ]),
    ("2", "The armed state, deleted", "shipped", [
        "<code>ConnectingBlockPort</code> is gone. There is no longer a state that outlives its gesture, so there is nothing left to enumerate exits for.",
        "A tap on a port, and a drag that lands on empty space, both open the on-canvas picker; the new Block is offset so its first matching port lands under the cable end.",
        "A drop that was <em>refused</em> offers nothing — you were aiming at that Block, and a new one on top of it is not the alternative you wanted.",
        "The offer's lifetime is derived from the live tool id, not from a list of ways to leave.",
    ]),
    ("3", "Refusal, made visible", "shipped", [
        "<code>eligiblePorts</code> lights every legal landing the moment a cable moves; <code>hintingPort</code> lights the one under the pointer. A boundary dot lights for either of its faces.",
        "Cycle veto, with hierarchy edges exempt — the flat walk conflates a Block's inside with its outside.",
        "An occupied single-connection input is replaced, not doubled, and the replacement is deferred to the drag end.",
    ]),
    ("4", "The hit profile you chose", "shipped", [
        "<code>connectionHit.ts</code> ported whole: three profiles, the padded-geometry mixin, and constants derived from the port dot's own CSS.",
        "Default <code>systemsketch</code>: corridor ±9u, port snap 18u, reconnect 10u, per-port model with the card as fallback only where ports are invisible.",
        "Wired-port precedence: pressing within 10u of a port that already carries a cable moves <em>that</em> cable.",
    ]),
    ("5", "The edge editor", "shipped", [
        "The whole pure elbow package from pyblocks — A* router, pins, path, nudge — 1 800 lines with its own 73 tests, importing neither tldraw nor React.",
        "Three routings; one control point on curved/straight that activates into a bend, one per draggable segment on elbow, with authored routes running between fixed port dongles.",
        "Figma's rule: control points appear only while a selected cable is near the pointer.",
        "A <code>+</code> at every cable's midpoint splices a Block into it, re-aiming the original cable and carrying its old destination on a second.",
        "Cables paint under Blocks, per parent — what makes an Expanded Block's internal wiring readable.",
        "A connection inspector, so a selected cable finally has a home in the dock.",
    ]),
]

TRUTH = """
<table>
  <thead><tr><th>Cable</th><th>What it means at a boundary</th><th>Before</th><th>Now</th></tr></thead>
  <tbody>
    <tr><td><code>run.in_1 → decode.in_1</code></td>
        <td>the boundary's inlet feeds a Block inside it — <b>your gesture</b></td>
        <td><span class="pill bad">refused</span></td><td><span class="pill ok">binds</span></td></tr>
    <tr><td><code>decode.out_1 → run.out_1</code></td>
        <td>a Block inside returns through the boundary's outlet</td>
        <td><span class="pill bad">refused</span></td><td><span class="pill ok">binds</span></td></tr>
    <tr><td><code>decode.out_1 → run.in_1</code></td>
        <td>data leaving the box through its own inlet</td>
        <td><span class="pill bad">allowed</span></td><td><span class="pill ok">refused</span></td></tr>
    <tr><td><code>run.out_1 → decode.in_1</code></td>
        <td>the boundary's outlet acting as a source for the inside</td>
        <td><span class="pill bad">allowed</span></td><td><span class="pill ok">refused</span></td></tr>
  </tbody>
</table>
"""

INVENTORY = [
    ("Custom <code>connection</code> shape + two identity bindings", "was there", "yes"),
    ("Anchor re-derived from <code>portId</code>", "was there", "yes"),
    ("<b>Eligible-port highlight while dragging</b>", "missing", "yes"),
    ("<b>Hinting-port highlight under the pointer</b>", "missing", "yes"),
    ("<b>Cycle veto, hierarchy-exempt</b>", "missing", "yes"),
    ("<b>Occupied input replaced, not doubled</b>", "missing", "yes"),
    ("<b>Drop on nothing → on-canvas picker</b>", "missing", "yes"),
    ("<b>Tap a port → same picker</b>", "missing", "yes"),
    ("<b>Centre <code>+</code> → splice a Block into a cable</b>", "missing", "yes"),
    ("<b>Cables painted below Blocks, per parent</b>", "missing", "yes"),
    ("<b>Boundary inner faces</b>", "missing", "yes"),
    ("<b>Tunable hit profile</b>", "missing", "yes"),
    ("<b>Wired-port precedence</b>", "missing", "yes"),
    ("<b>Elbow routing (A* around obstacles)</b>", "missing", "yes"),
    ("<b>Draggable control points, Figma's reveal rule</b>", "missing", "yes"),
    ("<b>Authored multi-elbow routes</b>", "missing", "yes"),
    ("<b>Connection inspector</b>", "missing", "yes"),
    ("Port data types + compatibility veto", "missing", "deliberately not yet"),
    ("Multi-ports (an input that accepts fan-in)", "missing", "deliberately not yet"),
    ("Edge labels, tags, crossing marks, tunnels", "missing", "deliberately not yet"),
]

NOT_CLAIMED = [
    ("Port data types",
     "Block ports keep their free-string <code>type</code>. The kit's compatibility veto needs a closed enum, and an editor that refuses a cable on a guess is worse than one that accepts it. The cycle veto and the terminal/scope veto ship; the type veto waits for the Python backend to define the lattice."),
    ("Multi-ports",
     "Every input takes exactly one cable. Fan-in needs a per-port flag in the Block model and an ordering rule for the values, which is a model decision, not an edge one."),
    ("Edge labels, tags, crossing marks and tunnel edges",
     "All present in pyblocks, all deliberately left there. Each one is a separate visual language on the cable and each deserves its own look at, not a bulk transplant."),
    ("A promotion to Stable",
     "The production build is verified clean (2 750 modules, 595 ms, no dev seam in the bundle) but Stable is untouched. You built a two-click armed control for exactly this decision; the command is below if you would rather do it from the terminal."),
]

DECISIONS = [
    ("The midpoint of a cable belongs to the <code>+</code>",
     "Clicking a cable at its exact midpoint opens the insert offer rather than selecting the cable — the same trade the image-pipeline kit makes. The ring is 16px painted, 24px pressable, so a click a few pixels either side selects normally. Worth knowing because it is the one place the two affordances collide."),
    ("A refused drop offers nothing",
     "The kit opens its picker for any drop with no binding, including one onto an illegal port. Now that a drag lights its legal targets, a refusal has already been shown — and offering to create a Block on top of the Block you were aiming at is the wrong alternative."),
    ("Switching routing forgets the previous route",
     "A <code>curve</code> waypoint means nothing to an elbow and a pinned rail means nothing to a bezier. Carried across, they snap the cable back into a shape you abandoned. Routing is a <code>StyleProp</code>, so a batch write only sends <code>routing</code> — the reset lives on the shape, in <code>onBeforeUpdate</code>."),
    ("A picked or spliced Block opens its title editor",
     "Same rule your Block tool already follows after a draw, applied to the two new ways a Block can arrive."),
    ("One dev-only test seam",
     "tldraw v5 paints handles to a <code>&lt;canvas&gt;</code>, so “is a control point being offered” has no DOM to read. <code>src/developmentSeam.ts</code> exposes the overlay ids under <code>import.meta.env.DEV</code> only — verified absent from the production bundle."),
]


def rows(results):
    out = []
    for result in results:
        out.append(
            f'<tr><td><code>{html.escape(result["id"])}</code></td>'
            f'<td>{html.escape(result["label"])}</td>'
            f'<td><span class="pill {"ok" if result["ok"] else "bad"}">'
            f'{"PASS" if result["ok"] else "FAIL"}</span></td></tr>'
        )
    return "\n".join(out)


def main() -> None:
    scene = evidence("edge-accept-scene.png")
    b1a = evidence("edge-accept-boundary-1a-drop.png")
    b1c = evidence("edge-accept-boundary-1c-drop.png")
    afford = evidence("edge-accept-affordance.png")
    picker_open = evidence("edge-accept-picker-open.png", WIDE_CROP)
    picker_tap = evidence("edge-accept-picker-tap.png", WIDE_CROP)
    curved = evidence("edge-editor-curved.png")
    bent = evidence("edge-editor-bent.png")
    elbow = evidence("edge-editor-elbow.png")
    controlpoints = evidence("edge-editor-controlpoints.png")
    insert_picker = evidence("edge-editor-insert-picker.png", WIDE_CROP)
    inserted = evidence("edge-editor-inserted.png")
    inspector = data_uri(ASSETS / "edge-editor-inspector.png")

    phases = "\n".join(
        f"""<article class="phase">
  <header><span class="pnum">{pid}</span><h3>{title}</h3><span class="pill ok">{status}</span></header>
  <ul>{''.join(f'<li>{item}</li>' for item in items)}</ul>
</article>"""
        for pid, title, status, items in PHASES
    )

    inventory = "\n".join(
        f'<tr><td>{feature}</td><td class="c {"no" if before == "missing" else ""}">{before}</td>'
        f'<td class="c {"yes" if after == "yes" else "later"}">{after}</td></tr>'
        for feature, before, after in INVENTORY
    )

    not_claimed = "\n".join(
        f'<tr><td><b>{title}</b></td><td>{detail}</td></tr>' for title, detail in NOT_CLAIMED
    )
    decisions = "\n".join(
        f'<tr><td><b>{title}</b></td><td>{detail}</td></tr>' for title, detail in DECISIONS
    )

    accept_pass = sum(1 for r in ACCEPTANCE if r["ok"])
    editor_pass = sum(1 for r in EDITOR if r["ok"])

    report = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch · Data edges, rebuilt</title>
<style>
  :root{{--ink:#14171a;--muted:#626a73;--line:#dfe3e7;--paper:#f6f7f8;--card:#fff;
        --green:#0e6b36;--amber:#8a6206;--blue:#315be8;--red:#c4392c}}
  *{{box-sizing:border-box}}
  body{{margin:0;background:var(--paper);color:var(--ink);
        font:15px/1.58 Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}}
  main{{width:min(1180px,calc(100% - 32px));margin:auto;padding:42px 0 80px}}
  .hero{{padding:34px;border:1px solid var(--line);border-radius:24px;background:var(--card);
         box-shadow:0 18px 50px #1218200b}}
  .kicker{{font-size:12px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:#4b5560}}
  h1{{margin:6px 0 12px;font-size:clamp(32px,5.2vw,58px);line-height:1.02;letter-spacing:-.05em}}
  .lede{{max-width:880px;margin:0;color:var(--muted);font-size:18px}}
  .badges{{display:flex;flex-wrap:wrap;gap:8px;margin-top:22px}}
  .badge{{padding:6px 10px;border:1px solid var(--line);border-radius:999px;background:#fafbfc;
          font:700 12px/1.2 ui-monospace,monospace}}
  .badge.ok{{border-color:#bfe3cd;background:#eefaf2;color:var(--green)}}
  section{{margin-top:52px}}
  h2{{margin:0 0 6px;font-size:28px;letter-spacing:-.03em}}
  h3{{margin:0 0 8px;font-size:17px}}
  .sub{{margin:0 0 22px;color:var(--muted);max-width:880px}}
  figure{{margin:0;padding:10px;border:1px solid var(--line);border-radius:18px;background:var(--card)}}
  figure img{{display:block;width:100%;border-radius:11px;border:1px solid #e3e6e9;background:#fff}}
  figcaption{{padding:10px 4px 2px;color:var(--muted);font-size:13.5px}}
  figcaption strong{{display:block;color:var(--ink);font-size:14.5px}}
  .two{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}}
  pre{{margin:0;padding:16px;border:1px solid var(--line);border-radius:14px;background:#0f1216;
       color:#e6edf3;overflow-x:auto;font:12.5px/1.62 ui-monospace,SFMono-Regular,Menlo,monospace}}
  pre.light{{background:#fbfcfd;color:#1b2027;border-color:var(--line)}}
  .card{{padding:22px;border:1px solid var(--line);border-radius:18px;background:var(--card)}}
  table{{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);
         border-radius:16px;overflow:hidden}}
  th,td{{padding:11px 14px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top;font-size:14px}}
  th{{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#4b5560;background:#fafbfc}}
  tr:last-child td{{border-bottom:0}}
  td.c{{text-align:center;font-size:13px}}
  td.c.no{{color:var(--red);font-weight:700}} td.c.yes{{color:var(--green);font-weight:700}}
  td.c.later{{color:var(--amber);font-weight:600}}
  .pill{{display:inline-block;padding:3px 9px;border-radius:999px;
         font:700 11.5px/1.5 ui-monospace,monospace;white-space:nowrap}}
  .pill.ok{{background:#eefaf2;color:var(--green)}}
  .pill.bad{{background:#fdf1ef;color:var(--red)}}
  code{{padding:.12em .35em;border-radius:5px;background:#eceff2;font:12.5px/1.4 ui-monospace,monospace}}
  .note{{padding:16px 18px;border:1px solid #f2d9a8;border-radius:14px;background:#fdf7ea}}
  .note.good{{border-color:#bfe3cd;background:#eefaf2}}
  .phase{{padding:20px 22px;border:1px solid var(--line);border-radius:18px;background:var(--card);
          margin-bottom:14px}}
  .phase header{{display:flex;align-items:baseline;gap:12px;margin-bottom:10px}}
  .pnum{{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;
         border-radius:9px;background:#eef3ff;color:var(--blue);
         font:800 14px/1 ui-monospace,monospace;flex:none}}
  .phase h3{{margin:0;flex:1;font-size:19px;letter-spacing:-.02em}}
  .phase ul{{margin:0;padding-left:20px}} .phase li{{margin-bottom:5px}}
  .stats{{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-top:18px}}
  .stat{{padding:16px;border:1px solid var(--line);border-radius:14px;background:var(--card);text-align:center}}
  .stat b{{display:block;font:800 30px/1.1 ui-monospace,monospace;letter-spacing:-.03em}}
  .stat span{{color:var(--muted);font-size:12.5px}}
  footer{{margin-top:56px;padding-top:20px;border-top:1px solid var(--line);color:var(--muted);font-size:13.5px}}
  @media(max-width:880px){{.two{{grid-template-columns:1fr}}}}
</style>
</head>
<body><main>

  <header class="hero">
    <div class="kicker">SystemSketch · Block, Ports &amp; Edges · 1 Sep 2026</div>
    <h1>The boundary<br>has an inside.</h1>
    <p class="lede">All six planned phases are applied. A boundary port now carries two identities at
      one anchor, so the two wirings a hierarchy needs both work and the two it must refuse both
      fail. The armed cable that stranded itself on a tool change is deleted rather than patched —
      and the click it was occupying is what the on-canvas picker needed. On top of that the whole
      donor came across: eligible/hinting ports, the cycle veto, occupied-input replacement, the hit
      profile you A/B'd in August, elbow routing with draggable segments, a <code>+</code> that
      splices a Block into a cable, cables painted under Blocks, and an inspector for a selected
      edge.</p>
    <div class="badges">
      <span class="badge ok">{accept_pass}/{len(ACCEPTANCE)} boundary &amp; picker checks</span>
      <span class="badge ok">{editor_pass}/{len(EDITOR)} edge-editor checks</span>
      <span class="badge ok">289 unit · 24 Python</span>
      <span class="badge ok">64 pre-existing browser checks still green</span>
      <span class="badge">tldraw 5.3.2</span>
      <span class="badge">Stable untouched</span>
    </div>
    <div class="stats">
      <div class="stat"><b>4/4</b><span>boundary wirings now correct</span></div>
      <div class="stat"><b>0</b><span>ways left to strand a cable</span></div>
      <div class="stat"><b>17</b><span>donor capabilities landed</span></div>
      <div class="stat"><b>1&nbsp;800</b><span>lines of pure elbow router, with its own 73 tests</span></div>
    </div>
  </header>

  <!-- ------------------------------------------------------------------ 1 -->
  <section>
    <h2>1 · The truth table, flipped</h2>
    <p class="sub">Same scene, same harness, same assertions — it always asserted the desired column,
      so a run that starts passing is the signal the fix landed. It passes.</p>
    {TRUTH}
    <div class="two" style="margin-top:18px">
      <figure><img src="{b1a}" alt="The reported gesture now binds">
        <figcaption><strong>Now binds</strong><code>run.in_1 → decode.in_1</code> — the gesture from
          your screenshot. The boundary dot is filled at both ends because the cable is welded to its
          inner face.</figcaption></figure>
      <figure><img src="{b1c}" alt="The illegal wiring is now refused">
        <figcaption><strong>Now refused</strong><code>decode.out_1 → run.in_1</code> — data leaving
          the box through its own inlet. Released on the dot; no cable
          survives.</figcaption></figure>
    </div>

    <h3 style="margin-top:28px">How</h3>
    <pre>{code(INNER_FACES)}</pre>
    <p class="sub" style="margin-top:16px">The twin alone is not enough. Both faces sit at the same
      coordinate, so terminal filtering picks whichever matches — which is how the two illegal
      wirings used to pass. The scope rule is what makes the boundary a boundary. And the press had
      <em>two</em> authorities deciding which face it started from; the DOM listener won because
      <code>queueMicrotask</code> made it run last.</p>
    <pre>{code(SCOPE_RULE)}</pre>
  </section>

  <!-- ------------------------------------------------------------------ 2 -->
  <section>
    <h2>2 · The armed state is gone, and the click became the picker</h2>
    <p class="sub">Not patched — deleted. A state that outlives its gesture has to enumerate every
      way out of itself, and <code>editor.setCurrentTool</code> is a plain root transition that runs
      <code>onExit</code> without dispatching cancel, complete or interrupt. Neither starter kit has
      such a state, and the click it was occupying is exactly what the picker needed.</p>
    <div class="two">
      <figure><img src="{picker_open}" alt="The on-canvas picker at a cable end">
        <figcaption><strong>Drag to nowhere</strong>The offer rides the loose end and follows it as
          the board pans. Picking places the Block so its first matching port lands under the cable
          end.</figcaption></figure>
      <figure><img src="{picker_tap}" alt="Tapping a port makes the same offer">
        <figcaption><strong>Or tap a port</strong>Same offer, cable already stretched. An
          <code>end</code> terminal reaches left for a producer, a <code>start</code> reaches right
          for a consumer — which also places an inner face's Block <em>inside</em> the
          boundary.</figcaption></figure>
    </div>
    <pre style="margin-top:18px">{code(NO_ARMED_STATE)}</pre>
    <div class="note good" style="margin-top:16px">Every exit in the diagnosis now cleans up:
      <b>A</b>, another toolbar tool, Escape, and a click on empty canvas. The last of those was the
      only one the old state got right.</div>
  </section>

  <!-- ------------------------------------------------------------------ 3 -->
  <section>
    <h2>3 · Refusal, made visible</h2>
    <p class="sub">Before this, the only feedback for an illegal drop was that nothing happened —
      indistinguishable from a missed target. A drag now lights every port it could legally land on,
      and the one under the pointer louder.</p>
    <figure><img src="{afford}" alt="Eligible and hinting ports during a drag">
      <figcaption><strong>Mid-drag out of the boundary</strong><code>decode.in_1</code> is filled and
        haloed — the pointer is on it. <code>run.out_1</code> carries the quiet eligible ring: it is
        the other legal landing, through its inner face. <code>decode.out_1</code> is not lit,
        because a <code>start</code> cannot meet a <code>start</code>.</figcaption></figure>
    <pre style="margin-top:18px">{code(AFFORDANCE)}</pre>
  </section>

  <!-- ------------------------------------------------------------------ 4 -->
  <section>
    <h2>4 · The numbers you already picked</h2>
    <p class="sub">The “port target zones” from 2026‑08‑27, ported whole. Every number in the default
      profile is derived from the port dot's own CSS rather than chosen.</p>
    <pre>{code(HIT_PROFILE)}</pre>
  </section>

  <!-- ------------------------------------------------------------------ 5 -->
  <section>
    <h2>5 · The edge editor</h2>
    <p class="sub">Three routings, each with one automatic shape and one authored form. The pure
      elbow package came across intact — A*, pins, path, nudge — importing neither tldraw nor React,
      with its own 73 tests.</p>
    <div class="two">
      <figure><img src="{curved}" alt="Curved routing">
        <figcaption><strong>Curved</strong>The kit's cubic: leave an outlet horizontally, approach an
          inlet horizontally.</figcaption></figure>
      <figure><img src="{bent}" alt="A bent cable">
        <figcaption><strong>Dragged</strong>The control point activates into a bend through the
          pointer — and does the same to a <em>straight</em> cable, which is the activation your FR
          describes.</figcaption></figure>
      <figure><img src="{elbow}" alt="Elbow routing">
        <figcaption><strong>Elbow</strong>Orthogonal, routed around the Blocks, and — the bug you
          called out in the FR — still perpendicular to the face it leaves and the face it
          meets.</figcaption></figure>
      <figure><img src="{controlpoints}" alt="Control points revealed on approach">
        <figcaption><strong>Figma's rule</strong>A selected cable offers its control point only while
          the pointer is near it. Far away it offers just its two
          terminals.</figcaption></figure>
    </div>
    <pre style="margin-top:18px">{code(FIGMA_RULE)}</pre>

    <h3 style="margin-top:28px">Splice a Block into a cable</h3>
    <div class="two">
      <figure><img src="{insert_picker}" alt="The insert offer at a cable midpoint">
        <figcaption><strong>The <code>+</code></strong>At every fully-bound cable's midpoint, quiet
          until you approach it. Pressable without selecting the cable first — inserting into a path
          is a thing you do while looking at the path.</figcaption></figure>
      <figure><img src="{inserted}" alt="A Block spliced into a cable">
        <figcaption><strong>Spliced</strong>The original cable is re-aimed at the new Block and a
          second carries its old destination, so the two ends you already wired stay
          wired.</figcaption></figure>
    </div>

    <h3 style="margin-top:28px">And a home in the dock</h3>
    <figure><img src="{inspector}" alt="The connection inspector">
      <figcaption><strong>Connection inspector</strong>Routing lived only in a right-click gesture,
        which is not a surface you can read the current state off. Same flat band grammar as the
        Block inspector, same command underneath as the menu, so a batch behaves identically from
        either entry point.</figcaption></figure>
  </section>

  <!-- ------------------------------------------------------------------ 6 -->
  <section>
    <h2>6 · What the trim cost, and what came back</h2>
    <p class="sub">The old cable was a hand-trimmed re-derivation of the image-pipeline starter kit —
      which is what <code>pyblocks/src/pipeline/</code> already is, plus weeks of your fixes. Seventeen
      capabilities were missing. Seventeen landed.</p>
    <table>
      <thead><tr><th>Capability</th><th>Before this pass</th><th>Now</th></tr></thead>
      <tbody>{inventory}</tbody>
    </table>
  </section>

  <!-- ------------------------------------------------------------------ 7 -->
  <section>
    <h2>7 · The phases, as planned</h2>
    {phases}
  </section>

  <!-- ------------------------------------------------------------------ 8 -->
  <section>
    <h2>8 · Calls I made</h2>
    <table><tbody>{decisions}</tbody></table>
    <h3 style="margin-top:28px">Deliberately not claimed</h3>
    <table><tbody>{not_claimed}</tbody></table>
  </section>

  <!-- ------------------------------------------------------------------ 9 -->
  <section>
    <h2>9 · Proof</h2>
    <p class="sub">Two browser journeys, both driven through the real product build with real pointer
      events, both reading the painted document. Plus every pre-existing journey re-run for
      regressions: context menu 12/12, click-to-edit 9/9, fields 9/9, batch 11/11, ports 14/14,
      selection menu 9/9.</p>
    <div class="two">
      <div>
        <h3><code>npm run test:edges</code> — {accept_pass}/{len(ACCEPTANCE)}</h3>
        <table><tbody>{rows(ACCEPTANCE)}</tbody></table>
      </div>
      <div>
        <h3><code>npm run test:edge-editor</code> — {editor_pass}/{len(EDITOR)}</h3>
        <table><tbody>{rows(EDITOR)}</tbody></table>
        <figure style="margin-top:16px"><img src="{scene}" alt="The reproduced scene">
          <figcaption><strong>The scene both suites build</strong>Expanded <code>run</code> with a
            boundary port pair, <code>decode</code> nested inside with its own. Nesting confirmed
            from the DOM, not assumed.</figcaption></figure>
      </div>
    </div>
  </section>

  <footer>
    Acceptance <code>tests/block_edges_acceptance.mjs</code> ·
    editor <code>tests/block_edge_editor_smoke.mjs</code> ·
    donor <code>~/pyblocks/src/pipeline/</code> and <code>~/pyblocks/src/blocks/elbow/</code> ·
    kits re-scaffolded with <code>npx create-tldraw -t workflow</code> / <code>-t image-pipeline</code> ·
    tldraw 5.3.2 · Stable unchanged.
  </footer>

</main></body>
</html>
"""

    OUTPUT.write_text(report, encoding="utf-8")
    print(f"wrote {OUTPUT} ({OUTPUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
