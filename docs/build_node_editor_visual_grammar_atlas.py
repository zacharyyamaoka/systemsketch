#!/usr/bin/env python3
"""Build a self-contained visual-grammar atlas for ten node systems.

The glyphs are original schematic SVGs. They describe stable reading
conventions without copying product artwork or implying pixel-level fidelity.
"""

from __future__ import annotations

from dataclasses import dataclass
from html import escape
from pathlib import Path


ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "node-editor-visual-grammar-atlas-2026-09-02.html"


@dataclass(frozen=True)
class Entry:
    term: str
    meaning: str
    cue: str
    drawing: str
    mode: str = ""


@dataclass(frozen=True)
class Editor:
    slug: str
    name: str
    family: str
    summary: str
    accent: str
    entries: tuple[Entry, ...]
    sources: tuple[tuple[str, str], ...]


def svg(label: str, body: str) -> str:
    return f'''<svg class="glyph" viewBox="0 0 380 120" role="img" aria-label="{escape(label)}">
      <title>{escape(label)}</title>{body}</svg>'''


def node(
    label: str,
    title: str,
    accent: str,
    *,
    left: tuple[str, ...] = ("in",),
    right: tuple[str, ...] = ("out",),
    badge: str = "",
    roundness: int = 8,
) -> str:
    height = max(66, 27 + 19 * max(len(left), len(right)))
    y = (120 - height) / 2
    ports = []
    for i, text in enumerate(left):
        py = y + 32 + i * 19
        ports.append(f'<circle cx="94" cy="{py}" r="5" class="port"/><text x="105" y="{py + 4}" class="port-label">{escape(text)}</text>')
    for i, text in enumerate(right):
        py = y + 32 + i * 19
        ports.append(f'<circle cx="286" cy="{py}" r="5" class="port"/><text x="275" y="{py + 4}" text-anchor="end" class="port-label">{escape(text)}</text>')
    badge_svg = f'<rect x="250" y="{y + 6}" width="28" height="17" rx="8" class="badge"/><text x="264" y="{y + 18}" text-anchor="middle" class="badge-text">{escape(badge)}</text>' if badge else ""
    return svg(
        label,
        f'''<rect x="94" y="{y}" width="192" height="{height}" rx="{roundness}" class="node" style="--accent:{accent}"/>
        <path d="M94 {y + 25} H286" class="node-rule" style="--accent:{accent}"/>
        <text x="108" y="{y + 18}" class="node-title">{escape(title)}</text>{badge_svg}{''.join(ports)}''',
    )


def connection(label: str, accent: str, *, wire: str = "value", typed: bool = False, fanout: bool = False) -> str:
    extra = '<path d="M190 59 V94 H305" class="edge"/><circle cx="190" cy="59" r="4" class="junction"/><rect x="305" y="80" width="46" height="28" rx="6" class="mini-node"/>' if fanout else ""
    dot = '<circle cx="190" cy="59" r="9" class="type-dot" style="--accent:#b56cff"/><text x="190" y="63" text-anchor="middle" class="dot-text">T</text>' if typed else ""
    return svg(
        label,
        f'''<rect x="27" y="40" width="82" height="38" rx="7" class="mini-node" style="--accent:{accent}"/>
        <rect x="271" y="40" width="82" height="38" rx="7" class="mini-node" style="--accent:{accent}"/>
        <circle cx="109" cy="59" r="5" class="port"/><circle cx="271" cy="59" r="5" class="port"/>
        <path d="M109 59 C155 59 225 59 271 59" class="edge" style="--accent:{accent}"/>
        <path d="M260 54 L271 59 L260 64" class="arrow-head" style="--accent:{accent}"/>{dot}{extra}
        <text x="190" y="26" text-anchor="middle" class="annotation">{escape(wire)}</text>''',
    )


def branch(label: str, title: str, accent: str, outputs: tuple[str, ...] = ("true", "false"), *, left: str = "condition") -> str:
    height = 48 + 20 * len(outputs)
    y = (120 - height) / 2
    out_svg = []
    for i, output in enumerate(outputs):
        py = y + 43 + i * 20
        out_svg.append(f'<circle cx="272" cy="{py}" r="5" class="port"/><text x="260" y="{py + 4}" text-anchor="end" class="port-label">{escape(output)}</text>')
    return svg(
        label,
        f'''<rect x="101" y="{y}" width="171" height="{height}" rx="8" class="node" style="--accent:{accent}"/>
        <path d="M101 {y + 25} H272" class="node-rule" style="--accent:{accent}"/>
        <text x="115" y="{y + 18}" class="node-title">{escape(title)}</text>
        <circle cx="101" cy="{y + 43}" r="5" class="port"/><text x="112" y="{y + 47}" class="port-label">{escape(left)}</text>{''.join(out_svg)}''',
    )


def container(label: str, title: str, accent: str, *, inner: str = "nested graph", boundary: bool = True) -> str:
    ports = '<circle cx="40" cy="62" r="5" class="port"/><circle cx="340" cy="62" r="5" class="port"/>' if boundary else ""
    return svg(
        label,
        f'''<rect x="40" y="16" width="300" height="90" rx="10" class="frame" style="--accent:{accent}"/>{ports}
        <rect x="129" y="43" width="122" height="40" rx="7" class="mini-node" style="--accent:{accent}"/>
        <text x="190" y="68" text-anchor="middle" class="node-title">{escape(inner)}</text>
        <rect x="54" y="7" width="{max(88, len(title) * 7 + 18)}" height="23" rx="11" class="frame-title" style="--accent:{accent}"/>
        <text x="64" y="23" class="frame-label">{escape(title)}</text>''',
    )


def paired_zone(label: str, accent: str, *, title: str = "Simulation zone") -> str:
    return svg(
        label,
        f'''<path d="M84 20 C55 35 55 85 84 100 H296 C325 85 325 35 296 20 Z" class="zone" style="--accent:{accent}"/>
        <rect x="68" y="35" width="86" height="51" rx="7" class="node" style="--accent:{accent}"/><rect x="226" y="35" width="86" height="51" rx="7" class="node" style="--accent:{accent}"/>
        <text x="111" y="57" text-anchor="middle" class="node-title">Input</text><text x="269" y="57" text-anchor="middle" class="node-title">Output</text>
        <path d="M154 70 H226" class="edge" style="--accent:{accent}"/><circle cx="154" cy="70" r="4" class="port"/><circle cx="226" cy="70" r="4" class="port"/>
        <text x="190" y="14" text-anchor="middle" class="annotation">{escape(title)}</text>''',
    )


def wire_legend(label: str, rows: tuple[tuple[str, str], ...], accent: str) -> str:
    parts = []
    for i, (name, kind) in enumerate(rows):
        y = 26 + i * 30
        if kind in {"double", "dashed"}:
            dash = ' stroke-dasharray="9 5"' if kind == "dashed" else ""
            lines = f'<path d="M145 {y - 3} H340" class="edge fine" style="--accent:{accent}"{dash}/><path d="M145 {y + 3} H340" class="edge fine" style="--accent:{accent}"{dash}/>'
        else:
            cls = "edge signal" if kind == "signal" else "edge"
            lines = f'<path d="M145 {y} H340" class="{cls}" style="--accent:{accent}"/>'
        parts.append(f'<text x="35" y="{y + 4}" class="annotation">{escape(name)}</text>{lines}')
    return svg(label, ''.join(parts))


def code_glyph(label: str, lines: tuple[str, ...], accent: str) -> str:
    rendered = ''.join(f'<text x="48" y="{34 + i * 18}" class="code">{escape(line)}</text>' for i, line in enumerate(lines))
    return svg(label, f'<rect x="28" y="12" width="324" height="96" rx="8" class="code-box" style="--accent:{accent}"/>{rendered}')


def flags(label: str, accent: str) -> str:
    return svg(
        label,
        f'''<rect x="98" y="24" width="184" height="72" rx="8" class="node" style="--accent:{accent}"/>
        <text x="112" y="47" class="node-title">mountain_geo</text><text x="112" y="68" class="port-label">geometry operator</text>
        <circle cx="220" cy="84" r="7" class="flag display"/><circle cx="242" cy="84" r="7" class="flag render"/><circle cx="264" cy="84" r="7" class="flag bypass"/>
        <text x="190" y="113" text-anchor="middle" class="annotation">display · render · bypass</text>''',
    )


def mlir_region(label: str, accent: str) -> str:
    return svg(
        label,
        f'''<rect x="38" y="13" width="304" height="94" rx="8" class="code-box" style="--accent:{accent}"/>
        <text x="53" y="34" class="code">%r = scf.if %cond -&gt; (i32) {{</text>
        <text x="75" y="55" class="code">%a = arith.addi %x, %y</text><text x="75" y="75" class="code strong">scf.yield %a : i32</text>
        <text x="53" y="95" class="code">}} else {{ … scf.yield %b }}</text>''',
    )


def sequence_glyph(label: str, title: str, accent: str, outputs: tuple[str, ...]) -> str:
    return branch(label, title, accent, outputs, left="exec")


def loop_node_glyph(
    label: str,
    title: str,
    accent: str,
    *,
    inputs: tuple[str, ...],
    outputs: tuple[str, ...] = ("body", "done"),
) -> str:
    return node(label, title, accent, left=inputs, right=outputs, badge="LOOP")


def loop_region_glyph(label: str, title: str, accent: str, *, mode: str) -> str:
    return svg(
        label,
        f'''<path d="M68 18 C42 35 42 86 68 102 H312 C338 86 338 35 312 18 Z" class="zone" style="--accent:{accent}"/>
        <rect x="54" y="36" width="94" height="49" rx="7" class="node" style="--accent:{accent}"/><rect x="232" y="36" width="94" height="49" rx="7" class="node" style="--accent:{accent}"/>
        <text x="101" y="56" text-anchor="middle" class="node-title">Begin</text><text x="279" y="56" text-anchor="middle" class="node-title">End</text>
        <text x="101" y="73" text-anchor="middle" class="port-label">{escape(mode)}</text><text x="279" y="73" text-anchor="middle" class="port-label">result</text>
        <path d="M148 61 H232" class="edge" style="--accent:{accent}"/><path d="M278 85 C278 111 101 111 101 85" class="edge feedback" style="--accent:{accent}"/>
        <path d="M108 92 L101 85 L94 92" class="arrow-head" style="--accent:{accent}"/><text x="190" y="13" text-anchor="middle" class="annotation">{escape(title)}</text>''',
    )


def split_join_glyph(label: str, accent: str, *, split: str, join: str) -> str:
    return svg(
        label,
        f'''<rect x="30" y="43" width="83" height="36" rx="7" class="mini-node"/><rect x="267" y="43" width="83" height="36" rx="7" class="mini-node"/>
        <text x="72" y="65" text-anchor="middle" class="node-title">{escape(split)}</text><text x="309" y="65" text-anchor="middle" class="node-title">{escape(join)}</text>
        <path d="M113 61 C158 61 143 27 190 27 S222 61 267 61 M113 61 C158 61 143 95 190 95 S222 61 267 61" class="edge" style="--accent:{accent}"/>
        <text x="190" y="17" text-anchor="middle" class="annotation">branch A</text><text x="190" y="116" text-anchor="middle" class="annotation">branch B</text>''',
    )


def feedback_glyph(label: str, accent: str, *, title: str, guard: str) -> str:
    return svg(
        label,
        f'''<rect x="116" y="35" width="148" height="48" rx="8" class="node" style="--accent:{accent}"/><text x="190" y="57" text-anchor="middle" class="node-title">{escape(title)}</text><text x="190" y="74" text-anchor="middle" class="port-label">{escape(guard)}</text>
        <path d="M264 59 C336 59 336 109 190 109 C44 109 44 59 116 59" class="edge feedback" style="--accent:{accent}"/><path d="M105 53 L116 59 L105 65" class="arrow-head" style="--accent:{accent}"/>
        <text x="190" y="19" text-anchor="middle" class="annotation">explicit feedback / next iteration</text>''',
    )


def workflow_loop_glyph(label: str, accent: str) -> str:
    return svg(
        label,
        f'''<rect x="42" y="32" width="130" height="55" rx="8" class="node" style="--accent:{accent}"/><text x="57" y="52" class="node-title">Loop Over Items</text>
        <circle cx="172" cy="52" r="5" class="port"/><text x="160" y="56" text-anchor="end" class="port-label">loop</text><circle cx="172" cy="77" r="5" class="port"/><text x="160" y="81" text-anchor="end" class="port-label">done</text>
        <rect x="238" y="18" width="98" height="40" rx="7" class="mini-node"/><text x="287" y="42" text-anchor="middle" class="node-title">loop body</text>
        <path d="M172 52 C201 52 210 38 238 38" class="edge" style="--accent:{accent}"/><path d="M336 38 C364 38 364 106 107 106 C58 106 58 87 58 87" class="edge feedback" style="--accent:{accent}"/>
        <path d="M65 95 L58 87 L51 95" class="arrow-head" style="--accent:{accent}"/><path d="M172 77 H350" class="edge" style="--accent:#4f5961"/><text x="350" y="72" text-anchor="end" class="annotation">done</text>''',
    )


def absence_glyph(label: str, accent: str, *, missing: str, alternative: str) -> str:
    return svg(
        label,
        f'''<rect x="72" y="26" width="236" height="68" rx="12" class="absence" style="--accent:{accent}"/>
        <path d="M91 43 L113 65 M113 43 L91 65" class="absence-x"/><text x="128" y="55" class="node-title">{escape(missing)}</text>
        <text x="128" y="76" class="port-label">{escape(alternative)}</text>''',
    )


def editors() -> tuple[Editor, ...]:
    return (
        Editor(
            "unreal", "Unreal Engine Blueprints", "Explicit control + typed data", "White execution wires sequence effects; colored typed wires carry values. Event nodes begin execution, while Branch routes execution and Select chooses data.", "#3586c4",
            (
                Entry("Event node", "An entry point raised by the engine or gameplay code. Its missing execution input marks it as a beginning, not an ordinary step.", "Read outward from the event's execution output.", node("Unreal event node", "Event BeginPlay", "#b44747", left=(), right=("exec",), badge="EVENT")),
                Entry("Callable / action node", "Invokes a function or performs an action. Impure calls participate in execution flow; value ports carry arguments and results.", "The header names the action; pins state its interface.", node("Unreal callable action node", "Apply Damage", "#3586c4", left=("exec", "target", "amount"), right=("then", "result"))),
                Entry("Execution wire", "Orders side-effecting work. The bright directional wire is a control pulse, not a transported value.", "Follow the arrows to read what runs next.", connection("Unreal execution wire", "#f3f5f7", wire="execution order")),
                Entry("Typed data wire", "Carries a value between compatible typed pins. Pin and wire color communicate the value type.", "Color means type; it does not mean control priority.", connection("Unreal typed data wire", "#b56cff", wire="typed value", typed=True)),
                Entry("Branch", "Routes one incoming execution pulse to True or False according to a Boolean condition.", "This chooses which execution path fires.", branch("Unreal Branch node", "Branch", "#3586c4", ("True", "False"), left="Condition")),
                Entry("Collapsed graph", "Hides a nested section behind one node. Tunnel-like boundary pins preserve the parent graph's interface.", "The outer node is a doorway into hierarchy.", container("Unreal collapsed graph", "Collapsed Graph", "#3586c4", inner="nested Blueprint")),
            ),
            (("Epic · Nodes", "https://dev.epicgames.com/documentation/en-us/unreal-engine/nodes-in-unreal-engine"), ("Epic · Flow Control", "https://dev.epicgames.com/documentation/en-us/unreal-engine/flow-control-in-unreal-engine")),
        ),
        Editor(
            "grasshopper", "Grasshopper for Rhino", "Parametric dataflow", "Components calculate from input parameters and publish results. Wire style reveals whether a connection currently carries one item, a list, or a branching data tree.", "#e08b27",
            (
                Entry("Component", "A reusable operation with named inputs on the left and results on the right.", "The capsule is computation; edge grips are parameters.", node("Grasshopper component", "Divide Curve", "#e08b27", left=("C curve", "N count"), right=("P points", "T tangents"), roundness=16)),
                Entry("Standalone parameter", "Stores, references, or relays data without performing a larger transformation.", "A compact capsule often represents data itself.", node("Grasshopper standalone parameter", "Number", "#7d8a94", left=(), right=("N",), badge="0.5", roundness=20)),
                Entry("Input / output grips", "Small edge grips expose the component interface. Wires normally run from an output grip into one or more input grips.", "Left asks; right answers.", connection("Grasshopper parameter grips", "#e08b27", wire="output grip → input grip")),
                Entry("Wire cardinality", "Wire appearance previews the data structure: one item, a list, or a branched data tree.", "Single, double, and dashed-double are semantic encodings.", wire_legend("Grasshopper wire cardinality", (("item", "single"), ("list", "double"), ("tree", "dashed")), "#6f777d")),
                Entry("Data tree", "A hierarchy of branches and paths rather than a flat array. Components may preserve, graft, flatten, or reshape it.", "A path such as {0;2} addresses one branch.", code_glyph("Grasshopper data tree", ("{0;0}  12, 18, 25", "{0;1}  31, 42", "{1;0}  57"), "#e08b27")),
                Entry("Cluster", "Packages a sub-definition behind a component-like boundary with explicit inputs and outputs.", "Use it as a hierarchical component, not merely a backdrop.", container("Grasshopper cluster", "Cluster", "#e08b27", inner="nested definition")),
            ),
            (("McNeel · Parameters and components", "https://developer.rhino3d.com/en/guides/grasshopper/simple-parameters/"), ("McNeel · Data structures and wire display", "https://developer.rhino3d.com/guides/grasshopper/gh-algorithms-and-data-structures/data-structures/"), ("McNeel · Data trees", "https://developer.rhino3d.com/en/guides/grasshopper/the-why-and-how-of-data-trees/")),
        ),
        Editor(
            "blender", "Blender Geometry Nodes", "Field-aware geometry dataflow", "Nodes transform geometry and values through typed sockets. Frames organize visually; zones create semantic regions with paired boundary nodes.", "#b16fe0",
            (
                Entry("Node", "A named operation whose body contains inputs, outputs, controls, and sometimes preview state.", "Header + socket rows form the unit of computation.", node("Blender Geometry Nodes node", "Set Position", "#b16fe0", left=("Geometry", "Selection", "Offset"), right=("Geometry",))),
                Entry("Typed sockets and links", "Circular sockets expose values of specific types; curved links connect compatible outputs to inputs.", "Socket color identifies the value family.", connection("Blender typed node link", "#b16fe0", wire="typed socket link", typed=True)),
                Entry("Field-capable socket", "A diamond socket indicates a value that may vary per geometry element; a circle is a single value.", "Diamond means field-capable, not merely connected.", svg("Blender field socket shapes", '<rect x="58" y="26" width="264" height="68" rx="8" class="node" style="--accent:#b16fe0"/><path d="M94 47 l8 8 -8 8 -8 -8 z" class="type-dot" style="--accent:#b56cff"/><text x="116" y="59" class="port-label">field-capable</text><circle cx="94" cy="78" r="7" class="type-dot" style="--accent:#82b94b"/><text x="116" y="82" class="port-label">single value</text>')),
                Entry("Frame", "A labeled backdrop that moves and organizes enclosed nodes. It communicates authorship structure but does not itself change evaluation.", "A frame groups visually; it is not a semantic zone.", container("Blender Frame node", "Frame · Scatter setup", "#6f777d", inner="organized nodes", boundary=False)),
                Entry("Reroute", "A small routing point bends or fans a link without adding computation.", "It changes layout, not the value.", svg("Blender reroute node", '<path d="M36 60 C112 60 118 29 190 60 S278 91 344 60" class="edge" style="--accent:#b16fe0"/><circle cx="190" cy="60" r="8" class="reroute"/><text x="190" y="103" text-anchor="middle" class="annotation">reroute</text>')),
                Entry("Simulation / Repeat zone", "A paired Input and Output node encloses a semantic region. Values leave through the Output boundary; the zone owns iteration or simulation state.", "The tinted hull is executable structure, not decoration.", paired_zone("Blender paired semantic zone", "#b16fe0", title="paired semantic zone")),
            ),
            (("Blender Manual · Node parts", "https://docs.blender.org/manual/en/latest/interface/controls/nodes/parts.html"), ("Blender Manual · Switch", "https://docs.blender.org/manual/en/latest/modeling/geometry_nodes/utilities/switch.html"), ("Blender Manual · Simulation Zone", "https://docs.blender.org/manual/en/latest/modeling/geometry_nodes/simulation/simulation_zone.html")),
        ),
        Editor(
            "flyde", "Flyde", "Reactive flow-based programming", "Nodes are isolated units with inputs and outputs. Connections deliver emitted values, may fan out, and can cross a flow boundary through declared external pins.", "#35a9a1",
            (
                Entry("Visual node", "A node assembled from other Flyde nodes and exposed as one reusable unit.", "Its interface survives when the internals are hidden.", node("Flyde visual node", "Format Greeting", "#35a9a1", left=("name", "salutation"), right=("text",), badge="VIS")),
                Entry("Code node", "A node whose processing logic is implemented in code while presenting the same pin-based interface on the board.", "Implementation changes; graph grammar does not.", node("Flyde code node", "Fetch User", "#5965cf", left=("id", "token"), right=("user", "error"), badge="CODE")),
                Entry("Input and output pins", "Named pins define what a node receives and what it may emit.", "Connections run output → input.", connection("Flyde input and output pins", "#35a9a1", wire="emitted value")),
                Entry("Fan-out connection", "One emitted value is delivered to every connected input. The branch is broadcast, not a conditional choice.", "A junction means multiple subscribers.", connection("Flyde fan-out connection", "#35a9a1", wire="one emission, two readers", fanout=True)),
                Entry("Flow boundary pins", "A flow can declare external inputs and outputs so the entire graph behaves like one node in a parent flow.", "Boundary pins are the public API of the flow.", container("Flyde flow external pins", "Flow", "#35a9a1", inner="internal nodes")),
                Entry("Conditional router", "Emits the input value on True or False according to a condition; only the selected output fires.", "This is packet routing, not a boxed statement body.", branch("Flyde Conditional node", "Conditional", "#35a9a1", ("true", "false"), left="value + cond")),
            ),
            (("Flyde · Core concepts", "https://www.flyde.dev/docs/core-concepts/"), ("Flyde · Conditional node source", "https://github.com/flydelabs/flyde/blob/main/nodes/src/ControlFlow/Conditional/Conditional.flyde.ts")),
        ),
        Editor(
            "mlir", "MLIR", "Structured SSA — textual reference", "MLIR is not a visual node editor. It is included deliberately because its operations, SSA values, blocks, regions, and yields make the same structural boundaries explicit in text.", "#d45f4d",
            (
                Entry("Operation", "The basic unit of computation. An operation consumes operands, produces zero or more SSA results, and may own nested regions.", "Treat the operation as the textual analogue of a node.", code_glyph("MLIR operation", ("%sum = arith.addi %lhs, %rhs", "       : i32"), "#d45f4d")),
                Entry("SSA value", "A typed result defined exactly once by an operation or block argument and then referenced by name.", "Percent-prefixed names are value edges in textual form.", code_glyph("MLIR SSA value", ("%size = tensor.dim %arg0, %c0", "%next = arith.addi %size, %c1"), "#d45f4d")),
                Entry("Block + block arguments", "A caret label begins a block; arguments on the label receive values from predecessor branches and replace explicit phi operations.", "The block label is a control target and typed join interface.", code_glyph("MLIR block label and arguments", ("^merge(%value: i32):", "  return %value : i32"), "#d45f4d")),
                Entry("Region", "A structural container of blocks owned by an operation. Values defined outside may be visible inside; values cannot escape except through the owner's contract.", "Braces are a semantic boundary, not formatting.", code_glyph("MLIR operation region", ("my.op {", "  ^bb0(%arg0: i32):", "    …", "}"), "#d45f4d")),
                Entry("Branch successor operands", "A branch names its successor block and passes values to that block's arguments.", "Control edge and data transfer are written together.", code_glyph("MLIR branch with successor operands", ("cf.cond_br %cond,", "  ^yes(%a : i32),", "  ^no(%b : i32)"), "#d45f4d")),
                Entry("scf.if + scf.yield", "A structured conditional owns then/else regions and produces results. Each selected region yields values whose types match the operation results.", "The enclosing op is the join; yield is the only value exit.", mlir_region("MLIR scf.if regions and scf.yield", "#d45f4d")),
            ),
            (("MLIR · Language Reference", "https://mlir.llvm.org/docs/LangRef/"), ("MLIR · SCF Dialect", "https://mlir.llvm.org/docs/Dialects/SCFDialect/")),
        ),
        Editor(
            "node-red", "Node-RED", "Message-flow automation", "Nodes receive and send messages through ports. Switch routes messages, Join can recombine sequences, and a flow tab or subflow provides hierarchy.", "#c64a43",
            (
                Entry("Input / source node", "Begins a message flow from an event, timer, network endpoint, or manual injection.", "A source normally has an output but no upstream input.", node("Node-RED input node", "inject", "#c4b449", left=(), right=("msg",), badge="IN")),
                Entry("Processing node", "Reads a message, transforms it or performs an action, then may emit another message.", "The node type is usually signaled by label, icon, and color.", node("Node-RED processing node", "function", "#d9a95d", left=("msg",), right=("msg",))),
                Entry("Port + wire", "A wire carries messages from one output port to an input port. Multiple wires may subscribe to the same output.", "This is event/message delivery, not a continuously sampled signal.", connection("Node-RED message wire", "#c64a43", wire="message")),
                Entry("Switch", "Checks configured rules and routes a message through one or more numbered outputs.", "Output order corresponds to the rule list.", branch("Node-RED Switch node", "switch", "#c64a43", ("1 match", "2 match", "otherwise"), left="msg.payload")),
                Entry("Join", "Combines message parts or sequences using configured counts, keys, or timeouts.", "It is a stateful synchronization node, not plain wire convergence.", node("Node-RED Join node", "join", "#c64a43", left=("parts…",), right=("combined",), badge="Σ")),
                Entry("Subflow / flow tab", "Packages a reusable flow or separates a workspace into a deployable flow scope.", "Hierarchy changes scope and deployment, not just appearance.", container("Node-RED subflow", "Subflow", "#c64a43", inner="message flow")),
            ),
            (("Node-RED · Wires", "https://nodered.org/docs/user-guide/editor/workspace/wires"), ("Node-RED · Flows", "https://nodered.org/docs/user-guide/editor/workspace/flows"), ("Node-RED · Switch and Join help", "https://github.com/node-red/node-red/tree/master/packages/node_modules/@node-red/nodes/locales/en-US")),
        ),
        Editor(
            "n8n", "n8n", "Item-based workflow automation", "Trigger and action nodes exchange arrays of items. If and Switch create routes; Merge explicitly combines streams and its mode determines the join semantics.", "#ff6d5a",
            (
                Entry("Trigger node", "Starts a workflow from an external event, schedule, webhook, or manual run.", "The lightning-like trigger role marks the workflow entry.", node("n8n trigger node", "Webhook", "#ff6d5a", left=(), right=("items",), badge="TRG")),
                Entry("Action node", "Calls a service, transforms data, or performs workflow work over incoming items.", "One tile represents one configured operation.", node("n8n action node", "Create record", "#7353ba", left=("items",), right=("items",))),
                Entry("Item stream", "A connection carries a list of JSON-like items from one node output to another node input.", "Execution data is inspectable on the connection and node run.", connection("n8n item stream connection", "#ff6d5a", wire="items[]")),
                Entry("If", "Tests conditions and routes each item to True or False.", "Both output labels are part of the visible contract.", branch("n8n If node", "If", "#ff6d5a", ("true", "false"), left="items")),
                Entry("Switch", "Routes items among several named or numbered outputs according to multiple rules.", "Use when there are more than two route outcomes.", branch("n8n Switch node", "Switch", "#ff6d5a", ("0 paid", "1 trial", "fallback"), left="items")),
                Entry("Merge", "Combines two or more input streams. Append, combine, choose-branch, and SQL-style modes have different synchronization and output meanings.", "The mode is semantic; the converging shape alone is insufficient.", node("n8n Merge node", "Merge · Combine", "#ff6d5a", left=("Input 1", "Input 2"), right=("items",), badge="2→1")),
            ),
            (("n8n · If", "https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.if"), ("n8n · Merge", "https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.merge/"), ("n8n · Execution order", "https://docs.n8n.io/flow-logic/execution-order/")),
        ),
        Editor(
            "houdini", "Houdini node networks", "Demand-driven procedural networks", "Operators create or transform data inside typed network contexts. Connectors and wires define dependencies; flags select display, render, or bypass behavior.", "#e87932",
            (
                Entry("Operator node", "A procedural operation inside a network such as SOPs, DOPs, VOPs, or COPs. Network context changes what its wires mean.", "Read the node type together with its network context.", node("Houdini operator node", "mountain", "#e87932", left=("geometry",), right=("geometry",), badge="SOP")),
                Entry("Connectors and wires", "Connectors expose a node's ordered inputs and output dependencies. In SOP networks, upstream geometry is cooked on demand.", "A wire means dependency; its payload depends on the network type.", connection("Houdini network wire", "#e87932", wire="network dependency")),
                Entry("Wiring dot", "A small routing dot keeps long or branched wiring legible without adding an operator.", "It is layout-only, like a reroute.", svg("Houdini wiring dot", '<path d="M30 38 H188 V91 H350 M188 62 H350" class="edge" style="--accent:#e87932"/><circle cx="188" cy="62" r="8" class="reroute"/><text x="188" y="114" text-anchor="middle" class="annotation">wiring dot</text>')),
                Entry("Node flags", "Small state flags select which node displays, renders, bypasses, locks, templates, or exports, depending on the network.", "Flags affect behavior without changing the wire topology.", flags("Houdini display render and bypass flags", "#e87932")),
                Entry("Subnet / network box", "A subnet creates hierarchy with an interface; a network box is primarily visual organization. Their similar enclosure is not identical semantics.", "Ask whether the boundary has ports: hierarchy and backdrop differ.", container("Houdini subnet", "Subnet", "#e87932", inner="operator network")),
                Entry("Switch SOP", "Passes one selected input through to its output according to an index parameter.", "The selector is a value join; demand-driven cooking controls upstream work.", node("Houdini Switch SOP", "switch", "#e87932", left=("input 0", "input 1", "select"), right=("chosen",), badge="SOP")),
            ),
            (("SideFX · Networks and nodes", "https://www.sidefx.com/docs/houdini/network/index.html"), ("SideFX · Wires", "https://www.sidefx.com/docs/houdini/network/wire"), ("SideFX · Node flags", "https://www.sidefx.com/docs/houdini/network/flags.html"), ("SideFX · Switch SOP", "https://www.sidefx.com/docs/houdini/nodes/sop/switch.html")),
        ),
        Editor(
            "unity", "Unity Visual Scripting", "Explicit control + values", "Units expose control ports that sequence execution and value ports that carry data. Events start graphs; If and Switch route control; Super Units create nested graphs.", "#4c87d9",
            (
                Entry("Event unit", "Starts a Script Graph when a Unity event occurs, such as Start, Update, or a collision.", "No control input: the event is the source of flow.", node("Unity Visual Scripting event unit", "On Start", "#4aa269", left=(), right=("flow",), badge="EVENT")),
                Entry("Action / function unit", "Invokes a method or action through control flow while reading and producing values through separate ports.", "Control and values coexist but remain distinct.", node("Unity Visual Scripting action unit", "Set Position", "#4c87d9", left=("flow", "target", "position"), right=("flow",))),
                Entry("Control connection", "Links a control output to a control input to say what executes next.", "The connection is traversal, not a data value.", connection("Unity control connection", "#f1f2f4", wire="control flow")),
                Entry("Value connection", "Transfers a typed value from a value output to a compatible value input.", "The port shape and color distinguish values from control.", connection("Unity value connection", "#4c87d9", wire="typed value", typed=True)),
                Entry("If / Switch", "Splits control based on a Boolean, enum, string, or integer and exposes one flow output per branch.", "The Default port handles unmatched Switch values.", branch("Unity Visual Scripting If unit", "If", "#4c87d9", ("True", "False"), left="Condition")),
                Entry("Super Unit", "Nests a Script Graph inside a reusable unit with declared control and value ports.", "It is a semantic hierarchy boundary.", container("Unity Visual Scripting Super Unit", "Super Unit", "#4c87d9", inner="nested Script Graph")),
            ),
            (("Unity · Control nodes", "https://docs.unity3d.com/Packages/com.unity.visualscripting@1.9/manual/vs-control.html"), ("Unity · Nest graphs", "https://docs.unity3d.com/Packages/com.unity.visualscripting@1.9/manual/vs-nesting.html")),
        ),
        Editor(
            "max", "Max / MSP", "Ordered message + signal patching", "Object and message boxes communicate through patch cords. Max messages are event-driven and right-to-left inlet order matters; MSP objects process continuous audio signals.", "#7e54b5",
            (
                Entry("Object box", "Instantiates an object by name with optional arguments. Inlets receive messages; outlets send results.", "The text is the operator invocation.", node("Max object box", "+ 1", "#7e54b5", left=("hot", "cold"), right=("sum",), roundness=2)),
                Entry("Message box", "Stores a message and sends it when triggered, or updates when a message arrives in its right inlet.", "Its clipped/message shape is data and interaction, not an operator class name.", svg("Max message box", '<path d="M100 35 H270 L282 47 V84 H100 Z" class="message-box" style="--accent:#7e54b5"/><text x="119" y="66" class="node-title">start $1</text><circle cx="111" cy="35" r="4" class="port"/><circle cx="270" cy="84" r="4" class="port"/>')),
                Entry("UI / number box", "Displays or edits a value directly on the patcher while still behaving as a connected object.", "It is both control surface and graph node.", svg("Max number box", '<rect x="126" y="31" width="128" height="58" rx="4" class="node" style="--accent:#7e54b5"/><text x="145" y="69" class="number">440.</text><path d="M236 31 V89" class="node-rule" style="--accent:#7e54b5"/><path d="M242 48 l6 -8 l6 8 M242 72 l6 8 l6 -8" class="arrow-head"/>')),
                Entry("Inlets, outlets, patch cords", "Patch cords carry a message from an outlet to an inlet. A leftmost hot inlet typically triggers output; other cold inlets often store values.", "Connection direction and inlet position affect evaluation order.", connection("Max patch cord", "#7e54b5", wire="outlet → inlet")),
                Entry("Max message vs MSP signal", "Ordinary Max cords transmit discrete messages; MSP objects marked with ~ participate in continuous audio-rate signal graphs.", "The tilde and signal cord distinguish the execution domain.", wire_legend("Max message and MSP signal cords", (("message", "single"), ("MSP signal ~", "signal")), "#7e54b5")),
                Entry("Subpatcher", "An object such as p synth owns another patcher. Inlet and outlet objects inside define the parent-facing interface.", "Double-click enters the nested patch.", container("Max subpatcher", "p synth", "#7e54b5", inner="nested patcher")),
            ),
            (("Cycling '74 · Objects", "https://docs.cycling74.com/userguide/objects/"), ("Cycling '74 · Messages", "https://docs.cycling74.com/userguide/messages/"), ("Cycling '74 · Making patches", "https://docs.cycling74.com/legacy/max8/vignettes/making_patches")),
        ),
    )


def hard_cases() -> dict[str, tuple[Entry, ...]]:
    """Control structures that expose each system's deeper execution model."""
    return {
        "unreal": (
            Entry("Sequence", "Turns one execution pulse into an ordered series of execution outputs. Every output fires, top to bottom, without an implicit delay.", "This is ordered fan-out, not a choice and not parallelism.", sequence_glyph("Unreal Sequence node", "Sequence", "#3586c4", ("Then 0", "Then 1", "Then 2")), "native control node"),
            Entry("Switch on value", "Routes execution to one case pin selected by an integer, enum, string, or name, with a Default path for unmatched values.", "The case labels are control exits; they do not carry the selected value.", branch("Unreal Switch node", "Switch on Int", "#3586c4", ("0", "1", "Default"), left="Selection"), "native control node"),
            Entry("For Loop", "Executes the Loop Body once for each integer from First Index through Last Index, then fires Completed.", "The Index value accompanies each body pulse; Completed is the join after all iterations.", loop_node_glyph("Unreal For Loop node", "For Loop", "#3586c4", inputs=("exec", "First", "Last"), outputs=("Body + Index", "Completed")), "native loop node"),
            Entry("For Each Loop", "Iterates over an array, exposing the current element and index on each Loop Body pulse, then fires Completed.", "Collection iteration is explicit even though the body remains outside the node.", loop_node_glyph("Unreal For Each Loop node", "For Each Loop", "#3586c4", inputs=("exec", "Array"), outputs=("Body + Item", "Completed")), "native loop node"),
            Entry("While Loop", "Tests a Boolean before every iteration, pulses Loop Body while it is true, and fires Completed when it becomes false.", "The condition must be updated by the body or the synchronous loop can hang the game.", loop_node_glyph("Unreal While Loop node", "While Loop", "#3586c4", inputs=("exec", "Condition"), outputs=("Loop Body", "Completed")), "native loop node"),
            Entry("For Loop with Break", "Adds a Break execution input to the counted loop. Reaching Break stops further iterations and continues through Completed.", "Early exit enters the loop node; it is not a wire that jumps directly out of the body.", loop_node_glyph("Unreal For Loop with Break node", "For Loop with Break", "#3586c4", inputs=("exec", "First / Last", "Break"), outputs=("Body + Index", "Completed")), "native early exit"),
        ),
        "grasshopper": (
            Entry("Dispatch / Cull Pattern", "Splits or removes list items according to a repeating Boolean pattern. Dispatch exposes complementary A and B result lists.", "This is data partitioning across a whole list, not exclusive execution of two graph regions.", branch("Grasshopper Dispatch component", "Dispatch", "#e08b27", ("A false", "B true"), left="List + Pattern"), "native data branch"),
            Entry("Stream Filter / value selection", "Selects one of several already-computed data streams by index. Upstream computation remains governed by Grasshopper's solution graph.", "A selector chooses a value; it does not create lazy statement bodies.", node("Grasshopper Stream Filter", "Stream Filter", "#e08b27", left=("Stream 0", "Stream 1", "Gate"), right=("Selected",), badge="N→1", roundness=16), "data select"),
            Entry("Implicit component iteration", "A component that operates on items is invoked repeatedly when its inputs contain lists or trees. Much of Grasshopper's 'looping' is therefore implicit data matching.", "There is no loop body outline: the list/tree wire is the iteration carrier.", wire_legend("Grasshopper implicit iteration over item list and tree", (("one item", "single"), ("map over list", "double"), ("map per tree path", "dashed")), "#e08b27"), "implicit iteration"),
            Entry("Long / Short / Cross matching", "When inputs have different lengths, matching policy controls repetition, truncation, or the Cartesian product of items.", "This is the hidden nested-loop rule behind many ordinary components.", code_glyph("Grasshopper list matching policies", ("LONG   A0+B0, A1+B1, A1+B2", "SHORT  A0+B0, A1+B1", "CROSS  every A × every B"), "#e08b27"), "implicit nested iteration"),
            Entry("Data-tree branch traversal", "Tree paths partition related item lists. Graft, Flatten, Path Mapper, and tree matching reshape which branches are processed together.", "Path structure often replaces a visually drawn nested loop.", code_glyph("Grasshopper data tree traversal", ("{0;0} → component → {0;0}", "{0;1} → component → {0;1}", "{1;0} → component → {1;0}"), "#e08b27"), "implicit structural loop"),
            Entry("No core structured while region", "The documented core grammar has no dedicated while-body enclosure or break port. Use list/tree iteration where possible, or put iterative logic in a script, custom component, or loop plug-in.", "A backward-looking wire is not automatically a supported while loop.", absence_glyph("Grasshopper has no native structured while region", "#e08b27", missing="while / break region", alternative="lists · trees · script · plug-in"), "not first-class"),
        ),
        "blender": (
            Entry("Switch", "Chooses one of two values using a Boolean. It is a value selector; with fields, evaluation details can differ from a single-value socket.", "The node rejoins data in one output rather than enclosing branch bodies.", node("Blender Switch node", "Switch", "#b16fe0", left=("False", "True", "Switch"), right=("Output",), badge="2→1"), "native data select"),
            Entry("Index / Menu Switch", "Chooses one value from N inputs using an integer index or menu item, producing one output of the configured type.", "N-way selection is still a data node, not N control regions.", node("Blender Index Switch node", "Index Switch", "#b16fe0", left=("0", "1", "2", "Index"), right=("Output",), badge="N→1"), "native data select"),
            Entry("Repeat Zone", "A paired Input/Output zone runs its enclosed nodes a specified number of times. Repeat items carry values from one iteration into the next and become final outputs.", "Iteration state crosses through the paired zone boundary.", loop_region_glyph("Blender Repeat Zone", "Repeat Zone", "#b16fe0", mode="count + repeat items"), "native loop region"),
            Entry("For Each Geometry Element Zone", "Runs a region for every selected element of a geometry domain, exposing Index and Element and joining generated outputs at the zone output.", "The region boundary makes per-element work explicit rather than relying only on fields.", loop_region_glyph("Blender For Each Geometry Element Zone", "For Each Element Zone", "#b16fe0", mode="geometry element"), "native loop region"),
            Entry("Simulation Zone", "Feeds explicit simulation-state items from the previous frame into the next frame and exposes results only through the Simulation Output node.", "This is time-step feedback with caching, not a tight synchronous while loop.", loop_region_glyph("Blender Simulation Zone feedback", "Simulation Zone", "#b16fe0", mode="previous frame state"), "native temporal feedback"),
            Entry("No conditional break from Repeat", "Repeat Zones expose an iteration count but no documented break/continue outlet. A condition can freeze or select state, yet the configured repetitions still define the region's schedule.", "Do not read a Switch inside the zone as an early loop exit.", absence_glyph("Blender Repeat Zone has no break port", "#b16fe0", missing="while / break outlet", alternative="fixed Repeat · state Switch · Simulation"), "not first-class"),
        ),
        "flyde": (
            Entry("Conditional macro", "Routes a received value to a true or false output based on configured logic. Only the chosen output emits for that decision.", "Branching is an output event, not an enclosed if/else region.", branch("Flyde Conditional macro node", "Conditional", "#35a9a1", ("true", "false"), left="value + cond"), "native router"),
            Entry("Multi-output node as switch", "A code, visual, or macro node may expose several named outputs and emit to the selected one, creating an N-way protocol.", "The output names define the cases; the board has no separate switch keyword.", branch("Flyde multi-output routing node", "Route Status", "#35a9a1", ("success", "retry", "failed"), left="result"), "composed / custom"),
            Entry("Repeated emissions", "A node may emit multiple values over its lifetime, and every emission travels to connected inputs. Repetition can therefore be stream-like rather than a lexical loop.", "Count emissions and lifecycle, not just how many wires exist.", feedback_glyph("Flyde repeated emissions", "#35a9a1", title="Producer", guard="emit 0 · emit 1 · emit 2"), "reactive repetition"),
            Entry("Queued and sticky inputs", "Queued inputs preserve successive values; sticky inputs retain the latest value as configuration. These modes determine how repeated runs pair their inputs.", "Input mode is hidden state that changes the meaning of a feedback-looking flow.", node("Flyde queued and sticky input modes", "Stateful Node", "#35a9a1", left=("queue: jobs", "sticky: config", "trigger"), right=("result",), badge="STATE"), "native lifecycle state"),
            Entry("Trigger and Error special pins", "An exposed Trigger input makes firing explicit; an exposed Error output catches a node failure and routes it instead of propagating to the parent flow.", "Control and error are optional special pins on the same node shape.", node("Flyde trigger and error special pins", "Async Task", "#35a9a1", left=("Trigger", "value"), right=("result", "Error"), badge="ASYNC"), "native lifecycle control"),
            Entry("No dedicated for / while enclosure", "Flyde's documented grammar supplies reactive nodes, connections, macros, and custom code rather than a universal loop region. Put lexical iteration in a code/custom node or model a bounded streaming protocol explicitly.", "A cycle alone does not communicate bounds, state, or termination.", absence_glyph("Flyde has no universal loop region", "#35a9a1", missing="for / while region", alternative="emissions · custom node · explicit protocol"), "not first-class"),
        ),
        "mlir": (
            Entry("scf.index_switch", "Branches to one of several owned case regions based on an index, plus a mandatory default region. Every region yields the operation's result values.", "N-way control and the value join belong to one structured operation.", code_glyph("MLIR scf.index_switch", ("%r = scf.index_switch %i -> i32", "case 0 { … scf.yield %a }", "case 1 { … scf.yield %b }", "default { … scf.yield %d }"), "#d45f4d"), "native structured branch"),
            Entry("scf.for", "Represents a half-open counted loop with lower bound, upper bound, step, an induction variable, and one body region.", "The region is the body; the op result is the post-loop join.", code_glyph("MLIR scf.for", ("scf.for %i = %lb to %ub step %s {", "  …", "}"), "#d45f4d"), "native structured loop"),
            Entry("Loop-carried iter_args", "Initial SSA values enter scf.for as iter_args; block arguments hold the current iteration values; scf.yield sends next values and the final op results.", "Seed → block argument → yield → next/final is the complete state path.", code_glyph("MLIR scf.for iter_args", ("%sum = scf.for %i = %lb to %ub", "  iter_args(%acc = %zero) -> i32 {", "  %next = arith.addi %acc, %x", "  scf.yield %next : i32"), "#d45f4d"), "native loop-carried state"),
            Entry("scf.while", "Owns a before region and an after region. scf.condition decides whether to continue and forwards loop-carried values between the regions or to final results.", "Two regions let the same op encode while and do-while placement.", code_glyph("MLIR scf.while", ("%r = scf.while (%x = %init) : (i32)->i32 {", "  %c = arith.cmpi …", "  scf.condition(%c) %x : i32", "} do { ^bb0(%x: i32): … scf.yield %next }"), "#d45f4d"), "native structured loop"),
            Entry("scf.forall / parallel reduction", "scf.forall and scf.parallel represent multi-dimensional parallel iteration. Shared outputs or scf.reduce define how independent iterations contribute to results.", "Parallel iteration is a distinct operation, not ordinary wire fan-out.", code_glyph("MLIR scf.forall parallel loop", ("scf.forall (%i, %j) in (%m, %n)", "  shared_outs(%o = %dest) {", "  …", "  scf.forall.in_parallel { … }"), "#d45f4d"), "native parallel loop"),
            Entry("Structured versus CFG exit", "SCF loops are single-entry structured regions. Irregular early exits are represented after lowering with cf branches and block arguments rather than a visual Break pin.", "Choose SCF for structure; choose CF blocks when control must be unstructured.", code_glyph("MLIR structured loop lowered to control flow", ("scf.for / scf.while", "        ↓ lower", "^header: cf.cond_br %c, ^body, ^exit", "^body:   … cf.br ^header"), "#d45f4d"), "lowered / unstructured"),
        ),
        "node-red": (
            Entry("Switch rule fan-out", "Tests message properties or sequence metadata against ordered rules and sends a message to the first matching output or to every matching output, depending on configuration.", "One message can become zero, one, or several routed messages.", branch("Node-RED Switch rules", "switch", "#c64a43", ("rule 1", "rule 2", "otherwise"), left="msg"), "native router"),
            Entry("Split → process → Join", "Split turns an array, object, string, or buffer into a message sequence with msg.parts metadata; Join reassembles or reduces it.", "This is Node-RED's closest core visual foreach grammar.", split_join_glyph("Node-RED Split process Join sequence", "#c64a43", split="split", join="join"), "composed collection loop"),
            Entry("Batch / sequence windows", "Batch groups incoming messages by count, time interval, overlap, or concatenated sequence, producing new message sequences.", "The sequence protocol carries index, count, and identity instead of drawing a loop body.", node("Node-RED Batch node", "batch", "#c64a43", left=("messages",), right=("sequence",), badge="N"), "native sequence control"),
            Entry("Function-node loop", "A JavaScript Function node may use for/while internally and emit several messages, but the loop body is text hidden behind one board node.", "The board shows one function tile, not the lexical control structure inside it.", code_glyph("Node-RED Function node containing a loop", ("for (const item of msg.payload) {", "  node.send({ payload: item })", "}", "return null"), "#c64a43"), "text inside node"),
            Entry("Guarded feedback wire", "There is no core while enclosure. A flow may route a message back upstream through a Switch/Function and a Delay, but the author must encode termination and scheduling.", "The backward wire is visible; its guard and state are a custom message protocol.", feedback_glyph("Node-RED guarded message feedback", "#c64a43", title="switch + delay", guard="continue? / stop"), "composed feedback"),
            Entry("Catch / Status side flow", "Catch and Status nodes emit messages for failures or runtime status changes from scoped nodes, creating a separate error-handling flow without a drawn edge from every source.", "Proximity and naming carry the association because the error edge is implicit.", node("Node-RED Catch node", "catch", "#c64a43", left=(), right=("msg.error",), badge="ERR"), "native implicit error edge"),
        ),
        "n8n": (
            Entry("If and Switch routing", "If labels True/False outputs; Switch exposes multiple rule outputs. Items are routed, and separate branches remain visible until they reconverge.", "Branch labels describe item routes, not nested statement regions.", branch("n8n Switch routes", "Switch", "#ff6d5a", ("paid", "trial", "fallback"), left="items"), "native router"),
            Entry("Default per-item iteration", "Most n8n nodes automatically process every incoming item, so an item list often behaves like an implicit foreach without any loop node.", "First count the items; a straight chain may already be iterating.", connection("n8n implicit per-item execution", "#ff6d5a", wire="items[0…N]"), "implicit foreach"),
            Entry("Loop Over Items", "Stores the incoming items, emits batches through the loop output, accepts a return connection from the body, and finally releases combined results through done.", "The backward connection is part of the official loop shape; loop and done are distinct outputs.", workflow_loop_glyph("n8n Loop Over Items with body return connection", "#ff6d5a"), "native loop node"),
            Entry("Pagination / while-like loop", "Connect a guarded branch back to an earlier request node to fetch another page until the response says there is no next page.", "The If condition is the termination test; the return wire makes the loop visible.", feedback_glyph("n8n pagination feedback loop", "#ff6d5a", title="HTTP → If", guard="has next page?"), "composed conditional loop"),
            Entry("Merge after branches", "Merge combines branch data using an explicit mode. It can append, match, choose, or combine inputs; it is not automatically a barrier for every visual fork.", "Read the configured mode before assuming synchronization or phi-like joining.", split_join_glyph("n8n If branches merged", "#ff6d5a", split="If", join="Merge"), "native configurable join"),
            Entry("Error output / error workflow", "A node can continue using an error output or error data, while an Error Trigger starts a separate configured error workflow for failed executions.", "Failure may be a visible node outlet or a non-local workflow edge.", node("n8n node with error output", "HTTP Request", "#ff6d5a", left=("items",), right=("success", "error"), badge="ERR"), "native error path"),
        ),
        "houdini": (
            Entry("Switch SOP", "Chooses one numbered input and passes it through. Because SOP networks cook dependencies on demand, the selected input controls which upstream chain is needed.", "Selection is a pull dependency choice, not an exec pulse.", node("Houdini Switch SOP", "switch", "#e87932", left=("input 0", "input 1", "select"), right=("chosen",), badge="SOP"), "native data select"),
            Entry("For-Each block", "Block Begin and Block End surround nodes that cook once for each piece, point, primitive, or list item. The end node gathers iteration results.", "The tinted hull and paired nodes are the loop syntax.", loop_region_glyph("Houdini For Each block", "For-Each Block", "#e87932", mode="piece / point / item"), "native loop block"),
            Entry("For-Loop with Feedback", "A Begin node set to Fetch Feedback receives the previous iteration's geometry; Block End controls the iteration count and returns the final result.", "The feedback relationship is configured on the pair and shown by the loop hull.", loop_region_glyph("Houdini For Loop with Feedback", "For-Loop with Feedback", "#e87932", mode="previous result"), "native loop block"),
            Entry("Merge Each Iteration", "Block End may collect every independent iteration and merge the results rather than feeding only the last result forward.", "Gather mode changes the join semantics of the same visual loop pair.", node("Houdini Block End merge mode", "foreach_end", "#e87932", left=("iteration results",), right=("merged geometry",), badge="MERGE"), "native loop join"),
            Entry("Stop Condition", "Block End evaluates a Stop Condition at the start of an iteration and terminates when it becomes true, giving a counted loop while-like early exit.", "The exit test lives in the End node's parameters rather than on a separate Break wire.", loop_node_glyph("Houdini Block End stop condition", "Block End", "#e87932", inputs=("feedback", "Stop Condition"), outputs=("result",)), "native conditional exit"),
            Entry("Solver / simulation feedback", "Solver networks evolve state across frames: the previous frame's result is available inside the solver and the current frame becomes the next state.", "Frame feedback is temporal state, distinct from a same-cook For-Loop.", feedback_glyph("Houdini solver temporal feedback", "#e87932", title="Solver SOP", guard="previous frame → current frame"), "native temporal feedback"),
        ),
        "unity": (
            Entry("Sequence", "Sends one incoming control flow through multiple outputs in order, allowing several actions to follow one event.", "All outputs run; this is ordered fan-out rather than a conditional.", sequence_glyph("Unity Visual Scripting Sequence unit", "Sequence", "#4c87d9", ("0", "1", "2")), "native control unit"),
            Entry("Switch", "Branches control on an enum, string, or integer. Configured values become named branch ports and Default handles unmatched values.", "The control ports are cases; a separate Select unit chooses among data values.", branch("Unity Visual Scripting Switch unit", "Switch", "#4c87d9", ("case A", "case B", "Default"), left="Selector"), "native control unit"),
            Entry("For Loop", "Repeats a synchronous body from First toward but excluding Last by Step, exposes the current Index, and then traverses Exit.", "Body and Exit are distinct control ports on one loop unit.", loop_node_glyph("Unity Visual Scripting For Loop", "For Loop", "#4c87d9", inputs=("flow", "First / Last / Step"), outputs=("Body + Index", "Exit")), "native loop unit"),
            Entry("For Each Loop", "Traverses every element of a collection and exposes Item and Index for the synchronous body, then calls Exit.", "Dictionary mode can additionally expose Key and Value.", loop_node_glyph("Unity Visual Scripting For Each Loop", "For Each Loop", "#4c87d9", inputs=("flow", "Collection"), outputs=("Body + Item", "Exit")), "native loop unit"),
            Entry("While Loop", "Checks Condition, runs Body while true, and traverses Exit once false. The loop runs synchronously in one frame.", "A bad condition can hang the editor; it is not a coroutine or frame loop.", loop_node_glyph("Unity Visual Scripting While Loop", "While Loop", "#4c87d9", inputs=("flow", "Condition"), outputs=("Body", "Exit")), "native loop unit"),
            Entry("Break Loop", "A Break Loop unit entered from inside a loop stops the nearest loop and causes that loop's Exit port to fire.", "Early exit is its own control unit connected from the body.", node("Unity Visual Scripting Break Loop unit", "Break Loop", "#4c87d9", left=("flow",), right=(), badge="BREAK"), "native early exit"),
        ),
        "max": (
            Entry("gate / route branching", "gate opens one selected outlet for an incoming message; route and select test message content and emit from matching outlets plus a remainder outlet.", "Branching is message emission: inactive outlets simply do not fire.", branch("Max gate object", "gate 3", "#7e54b5", ("1", "2", "3"), left="message + select"), "native message router"),
            Entry("switch fan-in", "switch selects which inlet is forwarded to one outlet, providing the N-to-one counterpart to gate.", "Several possible message sources rejoin inside one object.", node("Max switch object", "switch 3", "#7e54b5", left=("in 1", "in 2", "in 3", "select"), right=("chosen",), badge="N→1", roundness=2), "native message select"),
            Entry("trigger ordering", "trigger duplicates and converts one message, emitting its outlets strictly from right to left. It makes otherwise spatial message order explicit.", "Read trigger's outlets right-to-left, regardless of wire appearance.", sequence_glyph("Max trigger object", "trigger b i l", "#7e54b5", ("list ③", "int ②", "bang ①")), "native ordering object"),
            Entry("uzi / counted burst", "uzi produces a fast bounded burst with bangs, an iteration number, and a final done bang. It is the compact patching analogue of a counted loop.", "The body is the downstream patch reached by each outlet event.", loop_node_glyph("Max uzi counted iteration object", "uzi 100", "#7e54b5", inputs=("bang", "count"), outputs=("bang + index", "done")), "native counted iteration"),
            Entry("until / while-like loop", "until emits bangs until its right inlet receives a stop message. Without a reachable stop condition it can lock the event thread.", "The stop wire must feed the object's stop inlet; there is no enclosing body region.", loop_node_glyph("Max until object", "until", "#7e54b5", inputs=("start", "stop"), outputs=("bang",)), "native conditional iteration"),
            Entry("metro and scheduled feedback", "metro emits periodic bangs; delay, pipe, or deferlow breaks recursive message feedback into scheduled events. Direct message cycles can overflow the stack, and DSP cycles are rejected.", "A delay object is a semantic boundary between recursion and time-based repetition.", feedback_glyph("Max scheduled feedback loop", "#7e54b5", title="delay / metro", guard="scheduled next event"), "native temporal loop"),
        ),
    }


def extra_sources() -> tuple[tuple[str, str], ...]:
    return (
        ("Grasshopper Docs · Stream Filter component index", "https://grasshopperdocs.com/components/grasshoppersets/streamFilter.html"),
        ("Blender Manual · For Each Geometry Element Zone", "https://docs.blender.org/manual/en/latest/modeling/geometry_nodes/utilities/for_each_geometry_zone.html"),
        ("Flyde · Advanced concepts: queued/sticky inputs, lifecycle, Trigger, Error", "https://www.flyde.dev/docs/7-advanced-concepts/"),
        ("Flyde · Custom code, visual, and macro nodes", "https://www.flyde.dev/docs/5-custom-nodes"),
        ("Node-RED · Message sequences: Split, Join, Sort, Batch", "https://nodered.org/docs/user-guide/messages"),
        ("Node-RED · Handling errors with Catch and Status", "https://nodered.org/docs/user-guide/handling-errors"),
        ("Node-RED · Writing Functions and multiple messages", "https://nodered.org/docs/user-guide/writing-functions"),
        ("n8n · Looping and item processing", "https://docs.n8n.io/flow-logic/looping/"),
        ("n8n · Loop Over Items", "https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.splitinbatches/"),
        ("n8n · Error handling", "https://docs.n8n.io/flow-logic/error-handling/"),
        ("SideFX · Looping in geometry networks", "https://www.sidefx.com/docs/houdini/model/looping"),
        ("SideFX · Block End: gather modes and Stop Condition", "https://www.sidefx.com/docs/houdini/nodes/sop/block_end.html"),
        ("Unity · Control nodes: branches, loops, Break, exceptions", "https://docs.unity3d.com/Packages/com.unity.visualscripting@1.9/manual/vs-control.html"),
        ("Cycling '74 · Message order and feedback loops", "https://docs.cycling74.com/learn/articles/basicchapter05/"),
        ("Cycling '74 · Scheduler, timing, and recursive feedback", "https://docs.cycling74.com/userguide/scheduler/"),
        ("Cycling '74 · trigger reference", "https://docs.cycling74.com/reference/trigger/"),
        ("Cycling '74 · until reference", "https://docs.cycling74.com/reference/until/"),
        ("Cycling '74 · uzi reference", "https://docs.cycling74.com/reference/uzi/"),
    )


def render_rows(editor: Editor, entries: tuple[Entry, ...], prefix: str) -> str:
    rows = []
    for i, entry in enumerate(entries, 1):
        mode = f'<span class="mode">{escape(entry.mode)}</span>' if entry.mode else ''
        rows.append(f'''<tr id="{editor.slug}-{prefix}-{i}">
          <td class="meaning"><div class="row-kicker">{escape(editor.name)} · {prefix.upper()} {i:02d}{mode}</div><h3>{escape(entry.term)}</h3>
          <p>{escape(entry.meaning)}</p><p class="cue">{escape(entry.cue)}</p></td><td class="shape">{entry.drawing}</td></tr>''')
    return ''.join(rows)


def render_section(editor: Editor, advanced: tuple[Entry, ...]) -> str:
    return f'''<section id="{editor.slug}" style="--section-accent:{editor.accent}">
      <div class="section-head"><div><div class="tag">{escape(editor.family)}</div><h2>{escape(editor.name)}</h2></div><p>{escape(editor.summary)}</p></div>
      <div class="subsection-head"><h3>Core reading grammar</h3><p>Nodes, ports, wires, hierarchy, and the system's basic branch or region vocabulary.</p></div>
      <table class="dictionary"><thead><tr><th>What it represents</th><th>Shape used on the board</th></tr></thead><tbody>{render_rows(editor, editor.entries, "core")}</tbody></table>
      <div class="subsection-head hard"><h3>Hard cases · control, iteration, and state</h3><p>How this system actually expresses branching, joins, counted and collection loops, conditional repetition, early exit, feedback, or failure—and where it has no first-class notation.</p></div>
      <table class="dictionary hard-cases"><thead><tr><th>What it represents</th><th>Shape used on the board</th></tr></thead><tbody>{render_rows(editor, advanced, "control")}</tbody></table>
    </section>'''


def build() -> str:
    systems = editors()
    control = hard_cases()
    assert len(systems) == 10
    assert sum(len(editor.entries) for editor in systems) == 60
    assert set(control) == {editor.slug for editor in systems}
    assert sum(len(entries) for entries in control.values()) == 60
    nav = ''.join(f'<a href="#{e.slug}">{escape(e.name.split()[0])}</a>' for e in systems)
    sections = ''.join(render_section(e, control[e.slug]) for e in systems)
    source_blocks = []
    source_number = 1
    for editor in systems:
        for title, url in editor.sources:
            source_blocks.append(f'<p class="source"><b>S{source_number} · {escape(title)}</b><br><a href="{escape(url)}">{escape(url.replace("https://", ""))}</a></p>')
            source_number += 1
    for title, url in extra_sources():
        source_blocks.append(f'<p class="source"><b>S{source_number} · {escape(title)}</b><br><a href="{escape(url)}">{escape(url.replace("https://", ""))}</a></p>')
        source_number += 1
    orientation_matrix = ''.join(
        f'<tr><th>{escape(e.name)}</th><td>{escape(e.family)}</td><td>{"text + regions" if e.slug == "mlir" else "board + wires"}</td></tr>'
        for e in systems
    )
    control_rows = (
        ("Unreal Blueprints", "Branch / Switch", "For / For Each nodes", "While node", "Break input / Completed"),
        ("Grasshopper", "Dispatch / data select", "implicit list + tree matching", "no core while region", "data join / script or plug-in"),
        ("Blender Geometry Nodes", "Switch / Index Switch", "Repeat + For Each zones", "no conditional Repeat exit", "zone output / simulation state"),
        ("Flyde", "Conditional / named outputs", "repeated emissions or custom node", "no universal while region", "queued/sticky state + Error pin"),
        ("MLIR", "scf.if / index_switch", "scf.for / forall", "scf.while", "yield results / lower to cf"),
        ("Node-RED", "Switch router", "Split → process → Join", "guarded feedback or Function", "Join / Catch side flow"),
        ("n8n", "If / Switch", "implicit items + Loop Over Items", "If + return connection", "done / Merge / error output"),
        ("Houdini", "Switch SOP", "For-Each / For-Loop blocks", "Stop Condition + feedback", "Block End gather / stop"),
        ("Unity Visual Scripting", "If / Switch", "For / For Each units", "While unit", "Break Loop / Exit"),
        ("Max / MSP", "gate / route", "uzi / iter message protocols", "until or scheduled feedback", "stop inlet / switch join"),
    )
    control_matrix = ''.join(f'<tr><th>{escape(row[0])}</th>{"".join(f"<td>{escape(cell)}</td>" for cell in row[1:])}</tr>' for row in control_rows)
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Node editor visual grammar atlas — ten more systems</title>
<style>
:root{{--paper:#f4f1ea;--ink:#172028;--muted:#5f6972;--line:#ccd2d6;--panel:#fff;--shadow:0 18px 54px rgba(27,34,41,.12)}}
*{{box-sizing:border-box}}html{{scroll-behavior:smooth}}body{{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}}a{{color:inherit}}.shell{{width:min(1190px,calc(100% - 32px));margin:auto}}
header{{padding:66px 0 42px}}.eyebrow{{color:#b55236;font-size:12px;font-weight:850;letter-spacing:.16em;text-transform:uppercase}}h1{{max-width:970px;margin:11px 0 19px;font-size:clamp(40px,7vw,78px);line-height:.95;letter-spacing:-.055em}}.lede{{max-width:880px;margin:0;color:#44505a;font-size:20px}}
.scope{{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:31px}}.card{{padding:21px 23px;border:1px solid var(--line);border-radius:18px;background:rgba(255,255,255,.7)}}.card h2{{margin:0 0 7px;font-size:18px}}.card p{{margin:0;color:var(--muted)}}
nav{{position:sticky;top:0;z-index:20;border-block:1px solid rgba(120,128,135,.35);background:rgba(244,241,234,.91);backdrop-filter:blur(12px)}}nav .shell{{display:flex;gap:5px;padding:9px 0;overflow:auto;scrollbar-width:none}}nav a{{flex:0 0 auto;padding:7px 10px;border-radius:999px;text-decoration:none;font-size:12px;font-weight:780}}nav a:hover{{background:#fff}}
.family-map{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:34px 0 4px}}.family{{padding:18px;border:1px solid var(--line);border-radius:16px;background:#fff}}.family b{{display:block;margin-bottom:7px}}.family p{{margin:0;color:var(--muted);font-size:13px}}
section{{padding:53px 0 14px;scroll-margin-top:58px}}.section-head{{display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:end;margin-bottom:19px}}.section-head h2{{margin:0;font-size:35px;letter-spacing:-.035em}}.section-head p{{margin:0;color:var(--muted)}}.tag{{display:inline-flex;margin-bottom:9px;padding:5px 9px;border-radius:999px;background:color-mix(in srgb,var(--section-accent) 16%,white);color:color-mix(in srgb,var(--section-accent) 76%,black);font-size:10px;font-weight:850;letter-spacing:.12em;text-transform:uppercase}}
.subsection-head{{display:flex;align-items:baseline;justify-content:space-between;gap:24px;margin:5px 3px 12px}}.subsection-head.hard{{margin-top:35px}}.subsection-head h3{{margin:0;font-size:18px}}.subsection-head p{{max-width:670px;margin:0;color:var(--muted);font-size:13px}}.dictionary{{width:100%;border-collapse:separate;border-spacing:0;overflow:hidden;border:1px solid var(--line);border-radius:19px;background:#fff;box-shadow:var(--shadow)}}.dictionary.hard-cases{{box-shadow:0 18px 54px color-mix(in srgb,var(--section-accent) 12%,transparent)}}.dictionary thead th{{padding:13px 20px;background:#202a33;color:#fff;font-size:12px;letter-spacing:.12em;text-align:left;text-transform:uppercase}}.dictionary.hard-cases thead th{{background:color-mix(in srgb,var(--section-accent) 72%,#202a33)}}.dictionary thead th:first-child{{width:45%}}.dictionary thead th:last-child{{text-align:center}}.dictionary td{{border-top:1px solid #e2e5e7;vertical-align:middle}}.dictionary tbody tr:first-child td{{border-top:0}}.meaning{{padding:21px 25px}}.shape{{padding:8px 19px;background-image:linear-gradient(#eef0f1 1px,transparent 1px),linear-gradient(90deg,#eef0f1 1px,transparent 1px);background-size:18px 18px;background-position:-1px -1px}}.row-kicker{{color:#8b949b;font-size:9px;font-weight:850;letter-spacing:.13em;text-transform:uppercase}}.mode{{display:inline-flex;margin-left:8px;padding:2px 6px;border-radius:999px;background:color-mix(in srgb,var(--section-accent) 13%,white);color:color-mix(in srgb,var(--section-accent) 76%,black);letter-spacing:.08em}}.meaning h3{{margin:2px 0 5px;font-size:19px}}.meaning p{{margin:0;color:#4e5962}}.meaning .cue{{margin-top:8px;color:#1b252d;font-size:13px;font-weight:720}}
.glyph{{display:block;width:100%;height:120px;overflow:visible}}.glyph text{{font-family:Inter,ui-sans-serif,system-ui,sans-serif}}.node,.mini-node{{fill:#f7f8f8;stroke:#273038;stroke-width:1.8}}.node{{filter:drop-shadow(2px 3px 1px rgba(0,0,0,.12))}}.node-rule{{stroke:var(--accent);stroke-width:4}}.node-title{{fill:#202830;font-size:13px;font-weight:720}}.port-label{{fill:#39444c;font-size:10px}}.port{{fill:var(--accent,#535d65);stroke:#fff;stroke-width:1.2}}.edge{{fill:none;stroke:var(--accent,#535d65);stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}}.edge.fine{{stroke-width:1.6}}.edge.signal{{stroke-width:7;stroke-dasharray:2 3}}.edge.feedback{{stroke-dasharray:7 4}}.arrow-head{{fill:none;stroke:var(--accent,#535d65);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}}.junction,.reroute{{fill:var(--accent,#535d65);stroke:#fff;stroke-width:2}}.type-dot{{fill:var(--accent);stroke:#fff;stroke-width:1.5}}.dot-text{{fill:#fff;font-size:8px;font-weight:850}}.annotation{{fill:#606a72;font-size:11px}}.badge{{fill:var(--accent,#4f5961)}}.badge-text{{fill:#fff;font-size:8px;font-weight:850}}.frame{{fill:color-mix(in srgb,var(--accent) 7%,white);stroke:var(--accent);stroke-width:2.4;stroke-dasharray:7 4}}.frame-title{{fill:var(--accent)}}.frame-label{{fill:#fff;font-size:11px;font-weight:780}}.zone{{fill:color-mix(in srgb,var(--accent) 10%,white);stroke:var(--accent);stroke-width:2.3;stroke-dasharray:7 4}}.code-box{{fill:#20262c;stroke:var(--accent);stroke-width:2.3}}.code{{fill:#f3f5f7;font:12px ui-monospace,SFMono-Regular,Menlo,monospace}}.code.strong{{fill:#ffb7a9;font-weight:800}}.flag{{stroke:#fff;stroke-width:1.5}}.flag.display{{fill:#3491e7}}.flag.render{{fill:#7447c8}}.flag.bypass{{fill:#e4bd27}}.message-box{{fill:#fff;stroke:#273038;stroke-width:2}}.number{{font:26px ui-monospace,SFMono-Regular,Menlo,monospace;fill:#222}}.absence{{fill:color-mix(in srgb,var(--accent) 6%,white);stroke:var(--accent);stroke-width:2;stroke-dasharray:6 4}}.absence-x{{fill:none;stroke:var(--accent);stroke-width:4;stroke-linecap:round}}
.matrix-wrap{{overflow-x:auto;border:1px solid var(--line);border-radius:16px;background:#fff}}.comparison{{width:100%;min-width:680px;border-collapse:collapse;background:#fff}}.comparison th,.comparison td{{padding:11px 14px;border-top:1px solid #e2e5e7;text-align:left}}.comparison thead th{{border-top:0;background:#202a33;color:#fff;font-size:11px;letter-spacing:.08em;text-transform:uppercase}}.comparison tbody tr:first-child th,.comparison tbody tr:first-child td{{border-top:0}}.comparison tbody th{{width:23%}}.control-table{{min-width:960px}}.sources{{columns:2;column-gap:28px;padding:14px 0 42px}}.source{{break-inside:avoid;margin:0 0 14px;color:#4e5962;font-size:12px}}.source b{{color:#182129}}.source a{{text-underline-offset:3px;overflow-wrap:anywhere}}.note{{margin:24px 0 0;padding:19px 21px;border-left:4px solid #d45f4d;border-radius:0 13px 13px 0;background:#fff;color:#4e5962}}footer{{padding:36px 0 52px;color:#757e85;font-size:12px}}
@media(max-width:780px){{.scope,.section-head{{grid-template-columns:1fr}}.subsection-head{{display:block}}.subsection-head p{{margin-top:4px}}.family-map{{grid-template-columns:1fr 1fr}}.dictionary,.dictionary tbody,.dictionary tr,.dictionary td{{display:block;width:100%}}.dictionary thead{{display:none}}.dictionary tr{{border-top:1px solid var(--line)}}.dictionary tbody tr:first-child{{border-top:0}}.meaning{{padding:19px}}.shape{{padding:5px 10px}}.glyph{{height:108px}}.sources{{columns:1}}}}
@media(max-width:480px){{.family-map{{grid-template-columns:1fr}}}}@media print{{body{{background:#fff}}nav{{display:none}}.shell{{width:100%}}.dictionary{{box-shadow:none}}.shape{{background:none}}section{{padding-top:28px}}}}
</style></head><body>
<header class="shell"><div class="eyebrow">SystemSketch reference · 02 September 2026</div><h1>Ten more node languages</h1>
<p class="lede">A visual grammar atlas for ten systems beyond Simulink and LabVIEW. Every dictionary row keeps the requested reading order: <b>meaning on the left, representative board shape on the right</b>.</p>
<div class="scope"><div class="card"><h2>Scope</h2><p>Twelve conventions per system—six core marks plus six hard cases—covering branches, joins, counted and collection loops, while-like feedback, state, early exit, and errors. That is 120 original schematic glyphs.</p></div><div class="card"><h2>Interpretation</h2><p>These are reading keys, not complete palettes or copied product artwork. Themes and versions vary. MLIR is the intentional exception: a textual structural reference beside nine visual editors.</p></div></div></header>
<nav><div class="shell"><a href="#control-matrix">Control map</a>{nav}<a href="#comparison">Orientation</a><a href="#sources">Sources</a></div></nav>
<main class="shell"><div class="family-map" aria-label="Four visual grammar families"><div class="family"><b>Control + typed data</b><p>Unreal and Unity draw execution separately from values.</p></div><div class="family"><b>Parametric / pull dataflow</b><p>Grasshopper, Blender, and Houdini expose dependency and structure.</p></div><div class="family"><b>Message / workflow routing</b><p>Flyde, Node-RED, n8n, and Max move discrete emissions or items.</p></div><div class="family"><b>Structured SSA</b><p>MLIR writes node, edge, block, and region structure in text.</p></div></div>
<section id="control-matrix" style="--section-accent:#b55236"><div class="section-head"><div><div class="tag">Long-tail control map</div><h2>Where the hard constructs live</h2></div><p>This is the quick answer before the detailed dictionaries. “No core region” is a meaningful grammar choice: the system expects implicit iteration, a feedback protocol, or text/custom code instead.</p></div><div class="matrix-wrap"><table class="comparison control-table"><thead><tr><th>System</th><th>Branch</th><th>Counted / collection loop</th><th>While / feedback</th><th>Exit / join / failure</th></tr></thead><tbody>{control_matrix}</tbody></table></div></section>
{sections}
<section id="comparison"><div class="section-head"><div><div class="tag" style="--section-accent:#65717a">Orientation map</div><h2>How to approach each canvas</h2></div><p>The same rectangle-and-wire silhouette can mean execution, dependency, messages, geometry, audio, or SSA use. Start by identifying the semantic family.</p></div><div class="matrix-wrap"><table class="comparison"><tbody>{orientation_matrix}</tbody></table></div>
<p class="note"><b>Most important translation rule:</b> never infer execution semantics from shape alone. An Unreal white wire sequences control; a Grasshopper wire carries structured data; a Node-RED wire delivers messages; a Houdini wire expresses a cook dependency; and an MLIR percent-name is a textual SSA value edge.</p></section>
<section id="sources"><div class="section-head"><div><div class="tag" style="--section-accent:#65717a">Primary references</div><h2>Documentation and source</h2></div><p>Meanings are paraphrased from vendor documentation, project documentation, and the named component source/index. Every board glyph is an original SVG drawn by this report.</p></div><div class="sources">{''.join(source_blocks)}</div></section></main>
<footer class="shell">Prepared for SystemSketch · Companion to the <a href="visual-grammar-simulink-labview-2026-09-02.html">Simulink and LabVIEW visual grammar dictionary</a> · Product names and trademarks belong to their respective owners.</footer>
</body></html>'''


def main() -> None:
    html = build()
    if html.count('<svg') != 120 or html.count('<section id=') != 13 or 'https://' not in html:
        raise RuntimeError('Report completeness check failed')
    OUTPUT.write_text(html, encoding='utf-8')
    print(f'wrote {OUTPUT} ({len(html):,} bytes)')


if __name__ == '__main__':
    main()
