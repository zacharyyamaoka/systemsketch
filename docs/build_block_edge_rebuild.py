#!/usr/bin/env python3
"""Build the diagnosis + rebuild plan report for SystemSketch data edges.

Answers the two questions in `FR - Block, Ports & Edges Primitive`
§ Ports → Bugs → "Connecting from ports in expanded view to port inside":

  1. Diagnose the two reported bugs (proven in the real app, not asserted).
  2. Plan a rebuild of the data edges from the tldraw starter kits plus the
     learnings already banked in pyblocks.
"""

from __future__ import annotations

import base64
import html
import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DOCS = PROJECT_ROOT / "docs"
ASSETS = DOCS / "assets"
VAULT = Path.home() / "zach_brain"
OUTPUT = DOCS / "block-edge-rebuild-2026-09-01.html"


def data_uri(path: Path) -> str:
    mime = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}[path.suffix.lower()]
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"


# The canvas region of the harness's 1440x960 captures. Full-window shots are
# unreadable at report width, and evidence you cannot read is not evidence.
EVIDENCE_CROP = (270, 150, 1130, 760)


def evidence(name: str) -> str:
    """Crop one harness capture to the canvas, upscale it, and inline it."""
    from PIL import Image

    source = ASSETS / name
    cropped = ASSETS / f"crop-{name.replace('edge-diagnosis-', '')}"
    image = Image.open(source).convert("RGB").crop(EVIDENCE_CROP)
    image = image.resize((image.width * 2, image.height * 2), Image.LANCZOS)
    image.save(cropped, optimize=True)
    return data_uri(cropped)


def code(text: str) -> str:
    return html.escape(text.strip("\n"))


FINDINGS = json.loads((ASSETS / "edge-diagnosis.json").read_text())


# --------------------------------------------------------------------------- #
# Root cause 1 — the terminal filter
# --------------------------------------------------------------------------- #

CAUSE_1_MODEL = """
// connectionModel.ts — a port's side IS its terminal. One port, one direction.
export function terminalForBlockPortSide(side: 'input' | 'output'): ConnectionTerminal {
  return side === 'output' ? 'start' : 'end'
}
"""

CAUSE_1_FILTER = """
// ConnectionShapeUtil.tsx — onHandleDrag, the only place a drop finds a port.
const terminal = handle.id as ConnectionTerminal            // the FREE end
const target = getBlockConnectionPortAtPoint(this.editor, pagePoint, { terminal })

// blockPorts.ts — and the filter that decides.
for (const port of getBlockConnectionPorts(shape.props)) {
  if (options.terminal !== undefined && port.terminal !== options.terminal) continue
  ...
}
"""

CAUSE_1_TRACE = """
press  run.in_1              side 'input'   → terminal 'end'
       origin.terminal = 'end'
       draggingTerminal = opposite('end') = 'start'          ← the free handle

drop   getBlockConnectionPortAtPoint(p, { terminal: 'start' })
       decode.in_1          side 'input'   → terminal 'end'  ← 'end' !== 'start'
       CONTINUE  ── the only candidate under the pointer is skipped

       target === null
       → removeConnectionBinding(...)  and the free end just follows the mouse
"""

CAUSE_1_FIX = """
// pyblocks · nodes/types/blockModel.ts — the whole fix, 12 lines.
export const INNER_PORT_SUFFIX = '__inner'

/**
 * Derive the inner-face twin of every anchored port — flipped terminal, same
 * anchor. Twins exist in EVERY view (a cable welded to one must survive view
 * switches) but are hidden outside `expanded`, where the inside is wired.
 */
function addInnerFacePorts(ports: Record<string, ShapePort>, view: BlockView) {
  for (const id of Object.keys(ports)) {
    if (isInnerPortId(id)) continue
    const outer = ports[id]
    const hidden = view !== 'expanded' || outer.hidden === true
    ports[innerPortId(id)] = {
      id: innerPortId(id),
      x: outer.x, y: outer.y,                                   // SAME anchor
      terminal: outer.terminal === 'start' ? 'end' : 'start',   // FLIPPED
      dataType: outer.dataType,
      inner: true,
      ...(hidden ? { hidden: true } : null),
    }
  }
}

// pyblocks · ports/Port.tsx — and which face a press starts from.
onPointerDown={() => {
  // In the expanded view the dot's press wires the INSIDE (the inner face is
  // what an internal drag can land on both ends of); outer cables are made
  // from the other block's dot, exactly as before.
  const active = innerFace ?? port
  editor.setCurrentTool('select.pointing_port', {
    shapeId, portId: active.id, terminal: active.terminal, dataType: active.dataType,
  })
}}
"""

# --------------------------------------------------------------------------- #
# Root cause 2 — the state with no exit
# --------------------------------------------------------------------------- #

CAUSE_2_STATE = """
// PointingBlockPort.ts — SystemSketch's own invention: a tap arms a cable that
// follows the pointer with no button held, until the next press.
override onPointerUp(info: TLPointerEventInfo): void {
  const created = origin ? createConnectionFromPort(this.editor, this.info, origin) : null
  this.parent.transition('connecting_block_port', created)      // ← armed
}

export class ConnectingBlockPort extends StateNode {
  onCancel(info)    { this.abandon(info) }   // Escape        → bailToMark ✓
  onComplete(info)  { this.abandon(info) }   // Enter         → bailToMark ✓
  onInterrupt(info) { if (!this.committed) this.abandon(info) }
  onPointerDown(info) { ...bailToMark if not both terminals... }  //           ✓

  onExit(): void {
    this.editor.setCursor({ type: 'default', rotation: 0 })      // ← and that is all
  }
}
"""

CAUSE_2_TLDRAW = """
// tldraw 5.3.2 · Editor.ts — a tool shortcut is a plain root transition.
setCurrentTool(id: string, info = {}): this {
  this.root.transition(id, info)     // runs onExit on the whole active branch.
  return this                        // dispatches NO cancel / complete / interrupt.
}
"""

CAUSE_2_FIX = """
// image-pipeline kit · ports/PointingPort.tsx — there is no armed state at all.
export class PointingPort extends StateNode {
  static override id = 'pointing_port'

  onPointerMove(info) { if (dragging) this.parent.transition('dragging_handle', {...}) }
  onPointerUp(info)   { this.onClick(); this.parent.transition('idle', info) }
  //                    └── opens the on-canvas node picker anchored to the cable
}

// ConnectionShapeUtil.tsx — and a drag that lands on nothing does the same.
onHandleDragEnd(connection, { handle, isCreatingShape }) {
  if (bindings[draggingTerminal]) return
  if (isCreatingShape && draggingTerminal === 'end') {
    onCanvasNodePickerState.set(this.editor, {
      connectionShapeId: connection.id,
      location: draggingTerminal,
      onClose: () => { if (!bindings.start || !bindings.end) this.editor.deleteShapes([...]) },
      onPick: (nodeType, terminalInPageSpace) => { /* create + auto-bind first compatible port */ },
    })
  } else {
    if (!bindings.start || !bindings.end) this.editor.deleteShapes([connection.id])
  }
}
"""

EXITS = [
    ("Escape", "cancel event → <code>onCancel</code>", "bails the mark", True),
    ("Enter", "complete event → <code>onComplete</code>", "bails the mark", True),
    ("click on empty canvas", "pointer-down → <code>onPointerDown</code>", "bails the mark", True),
    ("press <b>A</b> (or any tool key)", "<code>root.transition('arrow')</code> → <code>onExit</code>",
     "orphan cable survives", False),
    ("click another toolbar tool", "<code>root.transition(…)</code> → <code>onExit</code>",
     "orphan cable survives", False),
    ("switch page / undo / delete the Block", "no event reaches the state",
     "unproven, same shape", False),
]


# --------------------------------------------------------------------------- #
# Provenance inventory
# --------------------------------------------------------------------------- #

INVENTORY = [
    ("Custom <code>connection</code> shape + two identity bindings", "kit", "kit", "yes"),
    ("Anchor re-derived from <code>portId</code>, never a frozen point", "kit", "kit", "yes"),
    ("Curved / straight routing", "kit", "+ elbow, A* around obstacles", "curved + straight"),
    ("Reparent the cable to the endpoints' shared ancestor", "kit", "+ boundary rule", "yes"),
    ("<b>Eligible-port highlight while dragging</b>", "kit", "kit", "no"),
    ("<b>Hinting-port highlight under the pointer</b>", "kit", "kit", "no"),
    ("<b>Cycle veto</b> (a drop that would close a loop is refused)", "kit", "+ hierarchy exemption", "no"),
    ("<b>Port data types + compatibility veto</b>", "image-pipeline", "yes", "no"),
    ("<b>Occupied input is replaced, not doubled</b>", "image-pipeline", "yes", "no"),
    ("<b>Multi-ports</b> (an input that accepts fan-in)", "image-pipeline", "yes", "no"),
    ("<b>Drop on nothing → on-canvas node picker</b>", "kit", "yes", "no"),
    ("<b>Tap a port → same picker, auto-placed to the right</b>", "kit", "+ inner-face stand-down", "no"),
    ("<b>Centre <code>+</code> handle → insert a node into a cable</b>", "kit", "yes", "no"),
    ("<b>Cables painted below nodes, per parent</b>", "kit", "yes", "no"),
    ("<b>Boundary inner faces</b> (wire the inside of an Expanded block)", "—", "yes", "<b>no — this report</b>"),
    ("<b>Tunable hit profile</b> (cable corridor, port snap, reconnect radius)", "—", "yes, A/B'd with you", "no"),
    ("<b>Wired-port precedence</b> (press a wired dot → move that cable)", "—", "yes", "no"),
    ("<b>Splice / rail / elbow control points</b>", "—", "yes", "no"),
    ("<b>Edge inspector</b> (routing, text, error state)", "—", "yes", "no"),
]

HIT_PROFILE = [
    ("Cable click corridor", "±3 screen px<br><small>tldraw <code>hitTestMargin</code></small>",
     "±10 page units<br><small>React Flow <code>interactionWidth</code>/2</small>",
     "±9 page units<br><small>the port dot's outer radius</small>"),
    ("Drop-snap to a port", "8 page units, nearest port on the card under the pointer",
     "20 page units around each port anchor (<code>connectionRadius</code>)",
     "18 page units — the port dot's own outer <em>diameter</em>"),
    ("Which port a drop picks", "the card's nearest port, uncapped",
     "per-port radius; never binds to a port you were not near",
     "per-port, with the card as fallback only where ports are invisible"),
    ("Press a wired dot", "starts a new cable", "10 page units <code>reconnectRadius</code>",
     "10 page units — Zach's pick, row 5 of the hit gallery"),
]


# --------------------------------------------------------------------------- #
# The plan
# --------------------------------------------------------------------------- #

PHASES = [
    {
        "id": "0",
        "title": "Land the donor, unchanged",
        "cost": "half a day",
        "why": "Every later phase is cheap only if the shared vocabulary is the kit's. "
               "Port the kit's <code>ports/</code> + <code>connection/</code> module boundary "
               "into <code>src/blocks/connections/</code> as-is, then re-point it at the "
               "SystemSketch <code>block</code> shape instead of the kit's <code>node</code>.",
        "does": [
            "<code>ports/portState.ts</code>, <code>ports/getPortAtPoint.ts</code>, "
            "<code>ports/Port.tsx</code>, <code>connection/*</code> arrive with their kit names, "
            "so a future <code>diff</code> against a re-scaffolded kit still works.",
            "<code>getBlockConnectionPorts()</code> becomes the <code>getNodePorts()</code> "
            "equivalent: a <code>createComputedCache</code> keyed on the Block record.",
            "<code>getNodePortConnections()</code> arrives with it — the cached table the port "
            "dot, the inspector and (later) the Python analyzer all read.",
        ],
        "proof": "The four existing connection unit suites still pass, plus the current "
                 "real-browser journeys. No behaviour change is claimed.",
    },
    {
        "id": "1",
        "title": "Boundary inner faces — the reported bug",
        "cost": "half a day",
        "why": "Your own words: <em>“when you are inside the box, the input port becomes like an "
               "output port once you are inside the boundary.”</em> That is exactly what pyblocks "
               "already ships, and it is 12 lines.",
        "does": [
            "<code>addInnerFacePorts()</code> derives a <code>…__inner</code> twin per port: same "
            "anchor, flipped terminal, <code>hidden</code> outside the Expanded view.",
            "The port dot draws <b>once</b> and carries the union of both faces' connected / "
            "hinting / eligible state, so nothing new appears on screen.",
            "A press on a boundary dot in Expanded view starts from the <b>inner</b> face; a press "
            "from outside still starts from the outer one.",
            "<code>reparentConnectionToBoundary()</code> gains the both-ends-on-one-block case, so "
            "a straight-through <code>in_1__inner → out_1__inner</code> wire parents inside the block.",
        ],
        "proof": "<code>tests/boundary_port_edge_diagnosis.mjs</code> flips from <b>4 REPRO</b> to "
                 "<b>4 ok</b> on the truth table — it already asserts the desired column.",
    },
    {
        "id": "2",
        "title": "Delete the armed state; adopt the picker",
        "cost": "one day",
        "why": "The bug and the feature you asked for are the same edit. The kit has no armed "
               "tap-to-place state — a tap opens the node picker, and a drag that lands on nothing "
               "opens the same picker at the loose end.",
        "does": [
            "<code>ConnectingBlockPort</code> is deleted. With it goes every un-enumerable exit "
            "path, because there is no longer a state that outlives the gesture.",
            "<code>PointingBlockPort</code> keeps exactly two exits: <code>dragging_handle</code> "
            "on a drag, <code>idle</code> on a tap.",
            "<code>onHandleDragEnd</code> with no binding on the dragged terminal opens "
            "<code>OnCanvasBlockPicker</code> anchored to that terminal; <code>onClose</code> "
            "deletes a still-half-bound cable.",
            "<code>onPick</code> creates the Block, offsets it so its first compatible port lands "
            "under the cable end, and binds — the image-pipeline behaviour in your screenshot.",
            "The picker lists SystemSketch Block presets, not the kit's node zoo. Inside an "
            "Expanded block it stands down on an inner face (pyblocks already does this: the "
            "picker would place the new Block outside the boundary).",
        ],
        "proof": "New browser journey: drag to empty canvas → picker → pick → a bound cable and a "
                 "placed Block. Plus BUG-2a/2b flip to <b>ok</b>, and a fuzz pass that leaves the "
                 "gesture by every exit in the table and asserts zero half-bound cables.",
    },
    {
        "id": "3",
        "title": "Refusal, and showing it",
        "cost": "one day",
        "why": "Today the only feedback for an illegal drop is that nothing happens — which is "
               "indistinguishable from a missed target. The kit answers this with two port states "
               "and a veto list.",
        "does": [
            "<code>portState</code> arrives: <code>eligiblePorts</code> lights every port a drag "
            "could legally land on the moment it starts; <code>hintingPort</code> lights the one "
            "under the pointer.",
            "Vetoes: wrong terminal, cycle, and (once Block ports carry a type) type mismatch. "
            "Hierarchy edges are exempt from the cycle veto — a child feeding its parent's inner "
            "face is the hierarchy working, not a loop.",
            "An occupied single-connection input is <em>replaced</em> at drop, not doubled; the "
            "replacement is deferred to <code>onHandleDragEnd</code> so an abandoned drag never "
            "destroys the wire it hovered.",
        ],
        "proof": "Journey asserts the eligible set is painted, an illegal drop leaves no cable, and "
                 "a legal drop onto an occupied input leaves exactly one.",
    },
    {
        "id": "4",
        "title": "The hit profile you already chose",
        "cost": "half a day",
        "why": "You picked these numbers on 2026-08-27 against a live A/B gallery. They are the "
               "answer to “the clickable region is really thin”, and they are the “port target "
               "zones” you asked me to bring over.",
        "does": [
            "<code>connectionHit.ts</code> ports across whole: the three profiles, the padded "
            "geometry mixin, and the constants derived from the port dot's own CSS.",
            "Default profile <code>pyblocks</code>: cable corridor ±9u, port snap 18u, per-port "
            "model, reconnect 10u.",
            "Wired-port precedence: pressing within 10u of a port that already has a cable moves "
            "<em>that</em> cable rather than starting a new one.",
        ],
        "proof": "The existing pure unit tests come with the file. The browser journey re-measures "
                 "the port dot's outer radius out of the running app rather than trusting the "
                 "constant.",
    },
    {
        "id": "5",
        "title": "The edge editor",
        "cost": "two days",
        "why": "This is the FR's own § Edges: three routings, control points, Figma's "
               "show-on-select-and-near rule, labels, error state.",
        "does": [
            "Elbow routing with the A* + authored-route persistence from pyblocks, including the "
            "fix that keeps a segment perpendicular to the block side it leaves.",
            "Splice / rail handles; the centre <code>+</code> that inserts a Block into a cable "
            "(<code>ConnectionCenterHandleOverlayUtil</code> + "
            "<code>insertNodeWithinConnection</code>, both straight from the kit).",
            "<code>keepConnectionsAtBottom</code> so cables paint under Blocks, per parent — which "
            "is what makes an Expanded block's internal wiring readable.",
            "Routing becomes a <code>StyleProp</code> (it already is) so the inspector and a "
            "multi-selection batch it for free.",
        ],
        "proof": "Golden geometry tests per routing kind, plus a journey per control-point gesture.",
    },
]

DECISIONS = [
    ("Do Block ports get a data type?",
     "The Block model has <code>port.type</code> as a free string today (<code>Frame</code>, "
     "<code>raw bytes</code>). The kit's compatibility veto needs a closed enum. I would "
     "<b>keep the free string and skip the type veto</b> until the Python backend defines the "
     "type lattice — an editor that refuses a cable on a guess is worse than one that accepts it. "
     "Phase 3 ships the cycle veto and the terminal veto only.",
     "my call — say the word and I'll wire types instead"),
    ("Should a boundary port draw two dots or one?",
     "pyblocks draws <b>one</b>: the dot is the port, and the inner face is a second identity at "
     "the same anchor. That keeps the Expanded frame edge clean and matches your "
     "<em>“only the circle of the port should be visible outside the frame”</em> note. The cost is "
     "that you cannot see, at a glance, whether the inside or the outside is wired.",
     "my call — one dot, union state"),
    ("Straight-through wires (<code>in_1__inner → out_1__inner</code>)",
     "Both ends on the same Block. pyblocks allows it and parents the cable inside that Block. "
     "It is how you draw a pass-through, so I would keep it.",
     "my call — allowed"),
    ("Tap-to-place goes away",
     "Today a tap on a port arms a cable that follows the pointer. Nothing in either kit does "
     "this, it is the whole surface of bug 2, and the click gesture is needed for the picker. "
     "<b>If you actually liked the armed cable</b>, say so — it can be kept, but then it needs a "
     "real state-machine exit contract rather than an <code>onExit</code>.",
     "wants your yes/no"),
    ("Where the work happens",
     "<code>?preset=block-dev</code> — the isolated Block Dev profile with its own board — then one "
     "promotion to Stable at the end of phase 2, and another at the end of phase 5. That keeps "
     "your Friday-shippable Stable intact while the edge layer is rebuilt underneath it.",
     "my call"),
]

CHECKS = [
    ("the reported scene is built through real gestures: an Expanded <code>run</code> with a "
     "boundary port, a nested <code>decode</code> with its own",
     "Block tool, real drag, real inspector clicks — nested confirmed from the painted DOM."),
    ("<code>run.in → decode.in</code> — the exact gesture from your screenshot — creates no cable",
     "0 cables. The reported bug, reproduced."),
    ("<code>decode.out → run.out</code> also creates no cable",
     "The same root cause on the other half of the boundary; not in your report, and just as broken."),
    ("<code>decode.out → run.in</code> <em>does</em> create a cable",
     "Data leaving the box through its own inlet. The polarity is not strict — it is inverted."),
    ("<code>run.out → decode.in</code> <em>does</em> create a cable",
     "An outlet acting as a source for the inside."),
    ("a tap on a port arms a cable that follows the pointer with no button held",
     "<code>select.connecting_block_port</code>, a SystemSketch invention neither kit has."),
    ("pressing <b>A</b> leaves the half-bound cable in the document",
     "Bug 2, reproduced — and the arrow tool is now active over an orphaned cable."),
    ("clicking a different toolbar tool leaves it too",
     "So the leak is the transition, not the keyboard."),
    ("Escape <em>does</em> clean up — the control",
     "The state's own bail path works; it is simply never reached by a tool change."),
    ("the orphan does not survive a reload",
     "<code>cleanupStaleConnections</code> prunes half-bound cables at install. "
     "Session-lifetime corruption, not file corruption."),
]


def render_findings_rows() -> str:
    rows = []
    for finding in FINDINGS:
        good = not finding["reproduced"]
        rows.append(
            f'<tr><td><code>{html.escape(finding["id"])}</code></td>'
            f'<td>{html.escape(finding["label"])}</td>'
            f'<td class="num">{finding["observed"]}</td>'
            f'<td class="num">{finding["expected"]}</td>'
            f'<td><span class="pill {"ok" if good else "bad"}">'
            f'{"as designed" if good else "REPRODUCED"}</span></td></tr>'
        )
    return "\n".join(rows)


TRUTH_TABLE = """
<table>
  <thead><tr><th>Cable</th><th>What it means at a boundary</th><th>Should</th><th>Today</th></tr></thead>
  <tbody>
    <tr><td><code>run.in_1 → decode.in_1</code></td>
        <td>the boundary's inlet feeds a block inside it</td>
        <td><span class="pill ok">allow</span></td>
        <td><span class="pill bad">refused</span></td></tr>
    <tr><td><code>decode.out_1 → run.out_1</code></td>
        <td>a block inside returns through the boundary's outlet</td>
        <td><span class="pill ok">allow</span></td>
        <td><span class="pill bad">refused</span></td></tr>
    <tr><td><code>decode.out_1 → run.in_1</code></td>
        <td>data leaving the box through its own inlet</td>
        <td><span class="pill bad">refuse</span></td>
        <td><span class="pill bad">allowed</span></td></tr>
    <tr><td><code>run.out_1 → decode.in_1</code></td>
        <td>the boundary's outlet acting as a source for the inside</td>
        <td><span class="pill bad">refuse</span></td>
        <td><span class="pill bad">allowed</span></td></tr>
  </tbody>
</table>
"""


BOUNDARY_SVG = """
<svg viewBox="0 0 940 400" role="img" aria-label="Boundary port faces, today versus inner faces">
  <defs>
    <marker id="grey" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="#8b929a"/></marker>
    <marker id="blue" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="#315be8"/></marker>
  </defs>

  <!-- ============================ LEFT: today ============================ -->
  <text x="30" y="16" class="cap">Today &#183; a port&#8217;s side IS its terminal</text>
  <rect x="80" y="44" width="340" height="250" rx="14" class="frame"/>
  <line x1="80" y1="88" x2="420" y2="88" class="hair"/>
  <text x="94" y="78" class="ttl">run()</text>
  <rect x="250" y="140" width="150" height="100" rx="10" class="inner"/>
  <text x="262" y="166" class="ttl sm">decode()</text>

  <path d="M32 196 L 64 196" class="wire lead" marker-end="url(#grey)"/>
  <circle cx="80" cy="196" r="7" class="dot"/>
  <text x="92" y="220" class="lbl">in_1</text>
  <text x="80" y="252" class="tag bad" text-anchor="middle">terminal &#8216;end&#8217;</text>

  <path d="M94 196 L 232 196" class="wire bad"/>
  <text x="163" y="200" class="xmark" text-anchor="middle">&#10005;</text>
  <text x="163" y="176" class="tag bad" text-anchor="middle">the free handle needs a &#8216;start&#8217;</text>

  <circle cx="250" cy="196" r="7" class="dot"/>
  <text x="262" y="200" class="lbl">in_1</text>
  <text x="250" y="264" class="tag bad" text-anchor="middle">terminal &#8216;end&#8217;</text>

  <text x="30" y="336" class="note">Both ports are &#8216;end&#8217;, so the drop has no candidate &#8212; refused.</text>
  <text x="30" y="358" class="note">Flip either arrow and it binds, which is why the two illegal wirings work.</text>

  <!-- ======================== RIGHT: inner faces ========================= -->
  <text x="520" y="16" class="cap">Inner faces &#183; one dot, two identities</text>
  <rect x="570" y="44" width="340" height="250" rx="14" class="frame"/>
  <line x1="570" y1="88" x2="910" y2="88" class="hair"/>
  <text x="584" y="78" class="ttl">run()</text>
  <rect x="740" y="140" width="150" height="100" rx="10" class="inner"/>
  <text x="752" y="166" class="ttl sm">decode()</text>

  <path d="M522 196 L 554 196" class="wire lead" marker-end="url(#grey)"/>
  <circle cx="570" cy="196" r="13" class="halo"/>
  <circle cx="570" cy="196" r="7" class="dot"/>
  <text x="584" y="222" class="lbl">in_1</text>
  <text x="556" y="248" class="tag" text-anchor="end">outer face &#8216;end&#8217;</text>

  <path d="M586 196 L 726 196" class="wire ok" marker-end="url(#blue)"/>
  <text x="660" y="176" class="tag ok" text-anchor="middle">inner face &#8216;start&#8217; &#183; same anchor</text>

  <circle cx="740" cy="196" r="7" class="dot"/>
  <text x="752" y="200" class="lbl">in_1</text>
  <text x="740" y="264" class="tag ok" text-anchor="middle">terminal &#8216;end&#8217;</text>

  <text x="520" y="336" class="note">One dot, carrying the union of both faces&#8217; state.</text>
  <text x="520" y="358" class="note">A press inside starts from the inner face, and it binds.</text>
</svg>
"""


def main() -> None:
    scene = evidence("edge-diagnosis-scene.png")
    bug1a_drag = evidence("edge-diagnosis-bug-1a-drag.png")
    bug1a_drop = evidence("edge-diagnosis-bug-1a-drop.png")
    bug1b_drag = evidence("edge-diagnosis-bug-1b-drag.png")
    bug1c_drop = evidence("edge-diagnosis-bug-1c-drop.png")
    bug1d_drop = evidence("edge-diagnosis-bug-1d-drop.png")
    bug2_armed = evidence("edge-diagnosis-bug2-armed.png")
    bug2_orphan = evidence("edge-diagnosis-bug2-orphan.png")
    reported_1 = data_uri(VAULT / "Pasted image 20260901135540.png")
    reported_2 = data_uri(VAULT / "Pasted image 20260901135734.png")
    picker = data_uri(VAULT / "Pasted image 20260901140044.png")

    exits = "\n".join(
        f'<tr><td>{label}</td><td>{route}</td>'
        f'<td><span class="pill {"ok" if good else "bad"}">{result}</span></td></tr>'
        for label, route, result, good in EXITS
    )

    inventory = "\n".join(
        f'<tr><td>{feature}</td><td class="c">{kit}</td><td class="c">{py}</td>'
        f'<td class="c {"yes" if ss.startswith("yes") or ss.startswith("curved") else "no"}">{ss}</td></tr>'
        for feature, kit, py, ss in INVENTORY
    )

    hits = "\n".join(
        f"<tr><td>{what}</td><td>{a}</td><td>{b}</td><td class=\"pick\">{c}</td></tr>"
        for what, a, b, c in HIT_PROFILE
    )

    phases = "\n".join(
        f"""<article class="phase">
  <header><span class="pnum">{p['id']}</span><h3>{p['title']}</h3><span class="cost">{p['cost']}</span></header>
  <p class="why">{p['why']}</p>
  <ul>{''.join(f'<li>{item}</li>' for item in p['does'])}</ul>
  <p class="proof"><b>Proof</b> {p['proof']}</p>
</article>"""
        for p in PHASES
    )

    decisions = "\n".join(
        f'<tr><td><b>{q}</b></td><td>{a}</td>'
        f'<td><span class="pill {"warn" if "yes/no" in tag else "ok"}">{tag}</span></td></tr>'
        for q, a, tag in DECISIONS
    )

    checks = "\n".join(
        f"      <li><b>{label}</b><span>{detail}</span></li>" for label, detail in CHECKS
    )

    report = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch · Data edges — diagnosis &amp; rebuild plan</title>
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
  .lede{{max-width:860px;margin:0;color:var(--muted);font-size:18px}}
  .badges{{display:flex;flex-wrap:wrap;gap:8px;margin-top:22px}}
  .badge{{padding:6px 10px;border:1px solid var(--line);border-radius:999px;background:#fafbfc;
          font:700 12px/1.2 ui-monospace,monospace}}
  .badge.bad{{border-color:#f0c4bd;background:#fdf1ef;color:var(--red)}}
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
  .three{{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}}
  pre{{margin:0;padding:16px;border:1px solid var(--line);border-radius:14px;background:#0f1216;
       color:#e6edf3;overflow-x:auto;font:12.5px/1.62 ui-monospace,SFMono-Regular,Menlo,monospace}}
  pre.light{{background:#fbfcfd;color:#1b2027;border-color:var(--line)}}
  .card{{padding:22px;border:1px solid var(--line);border-radius:18px;background:var(--card)}}
  table{{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);
         border-radius:16px;overflow:hidden}}
  th,td{{padding:11px 14px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top;font-size:14px}}
  th{{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#4b5560;background:#fafbfc}}
  tr:last-child td{{border-bottom:0}}
  td.num{{font:700 14px/1.4 ui-monospace,monospace;text-align:center;width:82px}}
  td.c{{text-align:center;font-size:13px}}
  td.c.no{{color:var(--red);font-weight:700}} td.c.yes{{color:var(--green);font-weight:700}}
  td.pick{{background:#f4f8ff}}
  .pill{{display:inline-block;padding:3px 9px;border-radius:999px;
         font:700 11.5px/1.5 ui-monospace,monospace;white-space:nowrap}}
  .pill.ok{{background:#eefaf2;color:var(--green)}}
  .pill.bad{{background:#fdf1ef;color:var(--red)}}
  .pill.warn{{background:#fdf7ea;color:var(--amber)}}
  code{{padding:.12em .35em;border-radius:5px;background:#eceff2;font:12.5px/1.4 ui-monospace,monospace}}
  .note{{padding:16px 18px;border:1px solid #f2d9a8;border-radius:14px;background:#fdf7ea}}
  .note.bad{{border-color:#f0c4bd;background:#fdf1ef}}
  .note.good{{border-color:#bfe3cd;background:#eefaf2}}
  ol.checks{{margin:0;padding:0;list-style:none;counter-reset:c}}
  ol.checks li{{position:relative;padding:12px 12px 12px 46px;border-bottom:1px solid var(--line)}}
  ol.checks li:last-child{{border-bottom:0}}
  ol.checks li::before{{content:"✓";position:absolute;left:12px;top:12px;width:22px;height:22px;
        border-radius:50%;background:#eefaf2;color:var(--green);
        font:800 13px/22px ui-monospace,monospace;text-align:center}}
  ol.checks>li>b{{display:block;font-weight:650}} ol.checks b b{{display:inline}}
  ol.checks span{{color:var(--muted);font-size:13.5px}}
  .phase{{padding:20px 22px;border:1px solid var(--line);border-radius:18px;background:var(--card);
          margin-bottom:14px}}
  .phase header{{display:flex;align-items:baseline;gap:12px;margin-bottom:10px}}
  .pnum{{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;
         border-radius:9px;background:#eef3ff;color:var(--blue);
         font:800 14px/1 ui-monospace,monospace;flex:none}}
  .phase h3{{margin:0;flex:1;font-size:19px;letter-spacing:-.02em}}
  .cost{{color:var(--muted);font:700 12px/1 ui-monospace,monospace}}
  .phase .why{{margin:0 0 10px;color:var(--muted)}}
  .phase ul{{margin:0 0 12px;padding-left:20px}} .phase li{{margin-bottom:5px}}
  .phase .proof{{margin:0;padding:10px 12px;border-radius:11px;background:#f6f8fa;font-size:13.5px}}
  svg{{width:100%;height:auto;display:block}}
  svg .frame{{fill:#fff;stroke:#315be8;stroke-width:1.5}}
  svg .inner{{fill:#fbfcfd;stroke:#c9ced4;stroke-width:1.2}}
  svg .hair{{stroke:#e3e6e9;stroke-width:1}}
  svg .ttl{{font:600 20px/1 ui-monospace,monospace;fill:#14171a}}
  svg .ttl.sm{{font-size:14px}}
  svg .lbl{{font:500 12px/1 ui-monospace,monospace;fill:#4b5560}}
  svg .cap{{font:800 11px/1 Inter,sans-serif;fill:#4b5560;letter-spacing:.11em;text-transform:uppercase}}
  svg .tag{{font:600 11.5px/1 Inter,sans-serif;fill:#626a73}}
  svg .tag.bad{{fill:#c4392c}} svg .tag.ok{{fill:#0e6b36}}
  svg .note{{font:500 13px/1 Inter,sans-serif;fill:#4b5560}}
  svg .xmark{{font:800 17px/1 Inter,sans-serif;fill:#c4392c}}
  svg .dot{{fill:#fff;stroke:#e89b12;stroke-width:2.5}}
  svg .halo{{fill:none;stroke:#0e6b36;stroke-width:1.5;stroke-dasharray:3 3}}
  svg .wire{{fill:none;stroke-width:2}}
  svg .wire.lead{{stroke:#8b929a;stroke-width:1.6}}
  svg .wire.bad{{stroke:#c4392c;stroke-dasharray:5 4}}
  svg .wire.ok{{stroke:#315be8}}
  footer{{margin-top:56px;padding-top:20px;border-top:1px solid var(--line);color:var(--muted);font-size:13.5px}}
  @media(max-width:880px){{.two,.three{{grid-template-columns:1fr}}}}
</style>
</head>
<body><main>

  <header class="hero">
    <div class="kicker">SystemSketch · Block, Ports &amp; Edges · 1 Sep 2026</div>
    <h1>The boundary<br>has no inside.</h1>
    <p class="lede">Your cable is refused because a SystemSketch port has exactly one direction,
      and an Expanded block's boundary needs two: from outside, <code>raw&nbsp;bytes</code> is a sink;
      from inside, it is a source. One filter decides every drop, and at a boundary it gets all four
      answers wrong — it refuses both legal wirings and accepts both illegal ones. The second bug is
      unrelated and smaller: a state SystemSketch invented, which neither starter kit has, has exits
      that nobody enumerated. Both are reproduced below in the real app, and both are already solved
      in code you own.</p>
    <div class="badges">
      <span class="badge bad">6 / 8 checks reproduced the report</span>
      <span class="badge">headless Chrome · real pointer events</span>
      <span class="badge">tldraw 5.3.2</span>
      <span class="badge ok">fix already exists in pyblocks</span>
      <span class="badge ok">feature already exists in the kit</span>
    </div>
  </header>

  <!-- ------------------------------------------------------------------ 1 -->
  <section>
    <h2>1 · Reproduced, not inferred</h2>
    <p class="sub">Same scene as your screenshots, built through the real Block tool and real pointer
      events in the product build: an Expanded <code>run</code> with a boundary port, a
      <code>decode</code> Block drawn inside it. The harness is
      <code>tests/boundary_port_edge_diagnosis.mjs</code>; it asserts the <em>desired</em> column, so
      a run that starts passing is the signal the fix landed.</p>

    <div class="two" style="margin-bottom:18px">
      <figure><img src="{reported_1}" alt="Zach's report: cable refused">
        <figcaption><strong>Your report</strong>The cable reaches <code>decode</code>'s
          <code>raw bytes</code> and will not take.</figcaption></figure>
      <figure><img src="{bug1a_drag}" alt="Reproduction mid-drag">
        <figcaption><strong>Reproduced, mid-drag</strong>Same gesture, driven by the harness. The
          free end is on the target dot and no binding forms.</figcaption></figure>
    </div>

    {TRUTH_TABLE}

    <div class="two" style="margin-top:18px">
      <figure><img src="{bug1a_drop}" alt="Legal wiring refused">
        <figcaption><strong>Legal, refused</strong><code>run.in_1 → decode.in_1</code> — the
          boundary's inlet feeding the inside. Released on the dot; no cable
          survives.</figcaption></figure>
      <figure><img src="{bug1b_drag}" alt="The other legal wiring, also refused">
        <figcaption><strong>Legal, refused</strong><code>decode.out_1 → run.out_1</code> — the
          inside returning through the outlet. Same root cause, the other half of the boundary,
          and not in your report.</figcaption></figure>
      <figure><img src="{bug1c_drop}" alt="Illegal wiring accepted">
        <figcaption><strong>Illegal, accepted</strong><code>decode.out_1 → run.in_1</code> — data
          leaving the box through its own inlet. This one binds, and
          persists.</figcaption></figure>
      <figure><img src="{bug1d_drop}" alt="The other illegal wiring, also accepted">
        <figcaption><strong>Illegal, accepted</strong><code>run.out_1 → decode.in_1</code> — the
          outlet acting as a source for the inside. Binds
          too.</figcaption></figure>
    </div>

    <p class="sub" style="margin-top:22px">And bug 2, on the same board:</p>
    <div class="two">
      <figure><img src="{bug2_armed}" alt="Armed cable following the pointer">
        <figcaption><strong>Armed</strong>A tap on a port leaves a cable following the pointer with
          no button held — <code>select.connecting_block_port</code>.</figcaption></figure>
      <figure><img src="{bug2_orphan}" alt="Orphaned cable after pressing A">
        <figcaption><strong>After <b>A</b></strong>The arrow tool is active, and the half-bound cable
          is still in the document. Your second screenshot,
          exactly.</figcaption></figure>
    </div>

    <table style="margin-top:20px">
      <thead><tr><th>Check</th><th>What it drives</th><th>Cables</th><th>Desired</th><th></th></tr></thead>
      <tbody>{render_findings_rows()}</tbody>
    </table>
    <p class="sub" style="margin-top:14px">The two that read <em>as designed</em> are controls, and
      they matter: <b>Escape does clean up</b>, which proves the bail path works and is simply never
      reached; and <b>the orphan does not survive a reload</b>, because
      <code>cleanupStaleConnections</code> prunes half-bound cables at install. So bug 2 is
      session-lifetime corruption, not file corruption.</p>
  </section>

  <!-- ------------------------------------------------------------------ 2 -->
  <section>
    <h2>2 · Root cause — one filter, four wrong answers</h2>
    <p class="sub">In SystemSketch a port's <em>side</em> is its <em>terminal</em>. That equation is
      the whole bug: it is true for a leaf Block and false for a boundary.</p>
    <pre class="light">{code(CAUSE_1_MODEL)}</pre>
    <pre style="margin-top:14px">{code(CAUSE_1_FILTER)}</pre>
    <pre style="margin-top:14px">{code(CAUSE_1_TRACE)}</pre>
    <div class="note bad" style="margin-top:16px">Your hypothesis was right, and understated.
      It is not that input→input is blocked; it is that at a boundary the polarity is
      <b>inverted</b>. The filter refuses the two wirings a hierarchy needs and accepts the two
      it must not — and nothing in the model can express the difference, because a port's side
      <em>is</em> its terminal.</div>

    <div class="card" style="margin-top:22px">{BOUNDARY_SVG}</div>

    <h3 style="margin-top:26px">The fix you already wrote</h3>
    <p class="sub">pyblocks solved this months ago, in the words you used in the FR: a boundary
      port grows an <b>inner face</b> — a derived twin at the <em>same anchor</em> with the
      <em>flipped</em> terminal, live only in the Expanded view. Exactly one of the two faces matches
      any given drag, so there is no ambiguity to resolve and no new dot on screen.</p>
    <pre>{code(CAUSE_1_FIX)}</pre>
  </section>

  <!-- ------------------------------------------------------------------ 3 -->
  <section>
    <h2>3 · Root cause — a state with an unenumerated exit</h2>
    <p class="sub">Bug 2 has nothing to do with ports. SystemSketch invented a gesture neither
      starter kit has: a tap on a port <em>arms</em> a cable that follows the pointer with no button
      held. Four ways out of that state clean up after themselves. Two do not — and they are the two
      you reach by changing tool.</p>
    <pre>{code(CAUSE_2_STATE)}</pre>
    <pre class="light" style="margin-top:14px">{code(CAUSE_2_TLDRAW)}</pre>
    <table style="margin-top:16px">
      <thead><tr><th style="width:30%">Leaving the armed state by…</th><th>Route</th><th style="width:24%">Result</th></tr></thead>
      <tbody>{exits}</tbody>
    </table>
    <div class="note" style="margin-top:18px"><b>Why enumerating exits is the wrong fix.</b>
      Adding a bail to <code>onExit</code> closes the two rows above and leaves the class open —
      <code>onExit</code> also runs on transitions where bailing would be wrong, and a state that
      outlives its gesture will keep growing exits as the app grows.
      <b>The kit's answer is to not have the state.</b></div>
  </section>

  <!-- ------------------------------------------------------------------ 4 -->
  <section>
    <h2>4 · The same edit is the feature you asked for</h2>
    <p class="sub">In the kits, a tap on a port and a drag that lands on nothing both open the
      on-canvas picker — the behaviour in your third screenshot. Deleting the armed state is what
      frees the click gesture to do it.</p>
    <figure style="max-width:420px"><img src="{picker}" alt="Image pipeline kit's on-canvas node picker">
      <figcaption><strong>What you want</strong>The image-pipeline kit: drag a cable to nowhere,
        release, choose what to put there — and the new node is placed so its first compatible port
        lands under the cable end.</figcaption></figure>
    <pre style="margin-top:18px">{code(CAUSE_2_FIX)}</pre>
  </section>

  <!-- ------------------------------------------------------------------ 5 -->
  <section>
    <h2>5 · Where the code should come from</h2>
    <p class="sub">A finding worth stating plainly: <b>pyblocks <code>src/pipeline/</code> is the
      image-pipeline starter kit</b> — its own <code>fileBackedBoard.tsx</code> says so — carrying
      several weeks of fixes on top. So “start from the kits” and “take the learnings from pyblocks”
      are not two sources to reconcile; they are the same lineage, and the second is strictly ahead
      of the first. Today's SystemSketch cable is a hand-trimmed re-derivation that dropped almost
      all of it. That trim is why the bugs are re-appearing one at a time.</p>

    <table>
      <thead><tr><th>Capability</th><th>workflow / image-pipeline kit</th><th>pyblocks</th>
        <th>SystemSketch today</th></tr></thead>
      <tbody>{inventory}</tbody>
    </table>

    <h3 style="margin-top:28px">Port target zones — the numbers you already picked</h3>
    <p class="sub">This is the “port target zones, etc.” you asked me to bring across. pyblocks'
      <code>connection/connectionHit.ts</code> measured the design space and you chose on
      2026‑08‑27 against a live A/B lens. The chosen column is highlighted; every number in it is
      derived from the port dot's own CSS rather than picked.</p>
    <table>
      <thead><tr><th></th><th>tldraw as it ships</th><th>React Flow</th>
        <th>pyblocks — your pick</th></tr></thead>
      <tbody>{hits}</tbody>
    </table>
    <div class="note" style="margin-top:16px"><b>One measurement worth keeping:</b> a caller's
      <code>margin</code> is <em>ignored</em> on tldraw's open-geometry branch —
      <code>getShapeAtPoint</code> hits when <code>distanceToPoint(p) &lt; hitTestMargin / zoom</code>
      and nothing else. Widening a cable's clickable corridor therefore cannot be done from a call
      site; it has to be done by padding the geometry. That is what the
      <code>HitPadded*</code> mixin exists for.</div>
  </section>

  <!-- ------------------------------------------------------------------ 6 -->
  <section>
    <h2>6 · The plan</h2>
    <p class="sub">Six phases, each one shippable and each one provable in the real app. Phases 0–2
      are the ones that answer this report; 3–5 are the FR's own § Edges. Everything happens in
      <code>?preset=block-dev</code> and promotes to Stable at the end of phase 2 and phase 5.</p>
    {phases}
  </section>

  <!-- ------------------------------------------------------------------ 7 -->
  <section>
    <h2>7 · Calls I made, and the one I need from you</h2>
    <table>
      <thead><tr><th style="width:26%">Question</th><th>Answer</th><th style="width:16%"></th></tr></thead>
      <tbody>{decisions}</tbody>
    </table>
  </section>

  <!-- ------------------------------------------------------------------ 8 -->
  <section>
    <h2>8 · What the harness actually drove</h2>
    <p class="sub">Every line below is a real gesture in the real product build, read back from the
      painted document. No editor API was called to make a cable, and no component was rendered in
      isolation.</p>
    <div class="card"><ol class="checks">
{checks}
    </ol></div>
    <figure style="margin-top:18px"><img src="{scene}" alt="The reproduced scene">
      <figcaption><strong>The scene</strong>Built by the harness: Expanded <code>run</code> with
        <code>in_1</code> / <code>out_1</code> on its boundary, <code>decode</code> nested inside with
        its own pair. Nesting confirmed from the DOM, not assumed.</figcaption></figure>
    <div class="two" style="margin-top:18px">
      <figure><img src="{reported_2}" alt="Zach's second report screenshot">
        <figcaption><strong>Your report</strong>The orphaned cable after pressing
          <b>A</b>.</figcaption></figure>
      <figure><img src="{bug2_orphan}" alt="Reproduction of the orphan">
        <figcaption><strong>Reproduced</strong>Same orphan, same arrow tool, driven by the
          harness.</figcaption></figure>
    </div>
  </section>

  <footer>
    Diagnosis harness <code>tests/boundary_port_edge_diagnosis.mjs</code> ·
    findings <code>docs/assets/edge-diagnosis.json</code> ·
    donor <code>~/pyblocks/src/pipeline/</code> ·
    kits re-scaffolded with <code>npx create-tldraw -t workflow</code> and
    <code>-t image-pipeline</code> and read at source ·
    tldraw 5.3.2. Nothing in <code>src/</code> was changed by this pass.
  </footer>

</main></body>
</html>
"""

    OUTPUT.write_text(report, encoding="utf-8")
    print(f"wrote {OUTPUT} ({OUTPUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
