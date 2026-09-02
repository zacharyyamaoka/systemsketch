#!/usr/bin/env python3
"""Build the self-contained Simulink + LabVIEW visual grammar dictionary.

The diagrams are original, schematic SVG reconstructions.  They describe the
stable reading grammar of the two editors without copying product artwork or
pretending that every library block has one canonical icon.
"""

from __future__ import annotations

from dataclasses import dataclass
from html import escape
from pathlib import Path


ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "visual-grammar-simulink-labview-2026-09-02.html"


def svg(label: str, body: str, *, viewbox: str = "0 0 360 104") -> str:
    return f"""
    <svg class="glyph" viewBox="{viewbox}" role="img" aria-label="{escape(label)}">
      <title>{escape(label)}</title>
      {body}
    </svg>"""


ARROW = """<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L8,4 L0,8 z" fill="currentColor"/></marker></defs>"""


@dataclass(frozen=True)
class Entry:
    term: str
    meaning: str
    cue: str
    drawing: str


def simulink_entries() -> list[Entry]:
    return [
        Entry(
            "Source block",
            "Creates a signal. It has an output but normally no input; the icon often previews the waveform or value.",
            "Read from the icon outward.",
            svg(
                "A source block showing a sine wave and one outgoing signal",
                ARROW + """
                <rect x="52" y="20" width="78" height="64" rx="2" class="sl-block"/>
                <path d="M64 53 C73 22 82 22 91 53 S109 84 118 53" class="sl-ink"/>
                <path d="M130 52 H300" class="sl-signal arrow"/>
                <text x="91" y="99" text-anchor="middle" class="cap">Sine Wave</text>""",
            ),
        ),
        Entry(
            "Operation block",
            "Transforms its input signals into output signals. The rectangle is the actor; its text or icon names the operation.",
            "Inputs enter left; outputs leave right by convention.",
            svg(
                "A rectangular Gain operation block with one input and one output",
                ARROW + """
                <path d="M24 52 H112" class="sl-signal arrow"/>
                <rect x="112" y="20" width="132" height="64" rx="2" class="sl-block"/>
                <text x="178" y="49" text-anchor="middle" class="sl-label">Gain</text>
                <text x="178" y="68" text-anchor="middle" class="sl-small">K · u</text>
                <path d="M244 52 H334" class="sl-signal arrow"/>
                <circle cx="112" cy="52" r="3" class="sl-port"/><circle cx="244" cy="52" r="3" class="sl-port"/>""",
            ),
        ),
        Entry(
            "Inport / Outport block",
            "Declares the interface of the current model or subsystem. Its number is the port order; its label is the interface name.",
            "These are boundary declarations, not ordinary computation.",
            svg(
                "Rounded Inport and Outport blocks with port numbers",
                ARROW + """
                <rect x="24" y="30" width="62" height="28" rx="14" class="sl-port-block"/>
                <text x="55" y="49" text-anchor="middle" class="sl-small">1</text>
                <text x="55" y="78" text-anchor="middle" class="cap">In1</text>
                <path d="M86 44 H266" class="sl-signal arrow"/>
                <rect x="266" y="30" width="62" height="28" rx="14" class="sl-port-block"/>
                <text x="297" y="49" text-anchor="middle" class="sl-small">1</text>
                <text x="297" y="78" text-anchor="middle" class="cap">Out1</text>""",
            ),
        ),
        Entry(
            "Signal line",
            "Carries a time-varying value from an output port to an input port. Arrowheads show the transfer direction.",
            "A line is data movement, not merely a visual connector.",
            svg(
                "A directed Simulink signal line between two ports",
                ARROW + """
                <rect x="35" y="35" width="36" height="34" rx="2" class="sl-block"/>
                <circle cx="71" cy="52" r="3" class="sl-port"/>
                <path d="M71 52 H289" class="sl-signal arrow"/>
                <circle cx="289" cy="52" r="3" class="sl-port"/>
                <rect x="289" y="35" width="36" height="34" rx="2" class="sl-block"/>
                <text x="180" y="40" text-anchor="middle" class="cap">speed</text>""",
            ),
        ),
        Entry(
            "Signal branch",
            "Fans one source signal out to multiple readers. Every branch carries the same signal; it is not a conditional split.",
            "The filled junction dot means shared source.",
            svg(
                "One Simulink signal line branching to two destinations at a filled dot",
                ARROW + """
                <path d="M28 52 H180 V25 H326 M180 52 V81 H326" class="sl-signal"/>
                <path d="M304 25 H326 M304 81 H326" class="sl-signal arrow"/>
                <circle cx="180" cy="52" r="5" class="junction"/>
                <text x="180" y="99" text-anchor="middle" class="cap">same signal, two readers</text>""",
            ),
        ),
        Entry(
            "Subsystem",
            "Groups an internal block diagram behind one hierarchical block. Its edge ports form a reusable interface.",
            "Double-clicking normally enters the nested diagram.",
            svg(
                "A subsystem block with named input and output ports",
                ARROW + """
                <path d="M18 52 H86" class="sl-signal arrow"/>
                <rect x="86" y="14" width="188" height="76" rx="2" class="sl-subsystem"/>
                <text x="98" y="47" class="sl-small">In1</text><text x="262" y="47" text-anchor="end" class="sl-small">Out1</text>
                <path d="M132 52 H228" class="sl-muted"/>
                <text x="180" y="76" text-anchor="middle" class="cap">Controller</text>
                <path d="M274 52 H342" class="sl-signal arrow"/>""",
            ),
        ),
        Entry(
            "Enabled subsystem",
            "Executes only while its enable control is positive. The extra control port and enable mark distinguish it from an always-running subsystem.",
            "Thick frame + top control port = conditional execution.",
            svg(
                "A thick outlined enabled subsystem with a control input at the top",
                ARROW + """
                <path d="M18 58 H80" class="sl-signal arrow"/>
                <rect x="80" y="20" width="200" height="72" rx="2" class="sl-subsystem enabled"/>
                <text x="100" y="56" class="sl-small">In1</text><text x="260" y="56" text-anchor="end" class="sl-small">Out1</text>
                <path d="M180 2 V20" class="sl-control arrow"/>
                <path d="M173 27 H187 M180 20 V34" class="sl-ink"/>
                <text x="180" y="82" text-anchor="middle" class="cap">Enabled Subsystem</text>
                <path d="M280 58 H342" class="sl-signal arrow"/>""",
            ),
        ),
        Entry(
            "If + action signal",
            "The If block evaluates conditions and sends action events to selected If Action Subsystems. The action connection controls execution rather than carrying ordinary data.",
            "Control decides which branch body runs.",
            svg(
                "An If block driving two action subsystems with control connections",
                ARROW + """
                <rect x="24" y="27" width="70" height="50" rx="2" class="sl-block"/><text x="59" y="57" text-anchor="middle" class="sl-label">If</text>
                <path d="M94 42 H163 V24 H210" class="sl-action arrow"/><path d="M94 62 H163 V80 H210" class="sl-action arrow"/>
                <rect x="210" y="8" width="126" height="34" rx="2" class="sl-subsystem"/><rect x="210" y="63" width="126" height="34" rx="2" class="sl-subsystem"/>
                <text x="273" y="30" text-anchor="middle" class="sl-small">if action</text><text x="273" y="85" text-anchor="middle" class="sl-small">else action</text>""",
            ),
        ),
        Entry(
            "Switch",
            "Selects one of multiple already-available input signals according to a control input. It routes values; it is not the same execution semantics as an If Action Subsystem.",
            "A lever-like diagonal shows the selected data path.",
            svg(
                "A Simulink Switch block selecting between upper and lower data inputs",
                ARROW + """
                <path d="M22 25 H116 M22 80 H116 M52 52 H116" class="sl-signal"/>
                <rect x="116" y="12" width="126" height="80" rx="2" class="sl-block"/>
                <circle cx="132" cy="28" r="3" class="sl-port"/><circle cx="132" cy="76" r="3" class="sl-port"/>
                <path d="M132 76 L218 32 M210 32 H222" class="sl-ink strong"/>
                <text x="170" y="56" text-anchor="middle" class="sl-small">u2 ≥ T</text>
                <path d="M242 52 H338" class="sl-signal arrow"/>""",
            ),
        ),
        Entry(
            "Merge",
            "Combines outputs from mutually exclusive, conditionally executed subsystems into one signal. Its value is the most recently computed driving output.",
            "Many conditional writers → one continuing signal.",
            svg(
                "A Merge block with two conditional inputs and one output",
                ARROW + """
                <path d="M22 27 H132 M22 77 H132" class="sl-signal arrow"/>
                <rect x="132" y="14" width="98" height="76" rx="2" class="sl-block merge"/>
                <text x="181" y="57" text-anchor="middle" class="sl-label">merge</text>
                <path d="M230 52 H338" class="sl-signal arrow"/>
                <text x="181" y="103" text-anchor="middle" class="cap">one branch updates at a time</text>""",
            ),
        ),
        Entry(
            "Bus creator / selector",
            "Bundles named signals into one bus, or extracts named elements from a bus. A bus preserves element identities; it is not merely a numeric vector.",
            "Thin signals converge into a thick structured line, then fan out.",
            svg(
                "Several signals bundled into a bus and selected back into signals",
                ARROW + """
                <path d="M16 25 H90 M16 52 H90 M16 79 H90" class="sl-signal"/>
                <rect x="90" y="15" width="26" height="74" rx="2" class="sl-block"/><text x="103" y="55" text-anchor="middle" class="tiny rotate">BUS</text>
                <path d="M116 52 H245" class="sl-bus arrow"/>
                <rect x="245" y="15" width="26" height="74" rx="2" class="sl-block"/>
                <path d="M271 25 H344 M271 52 H344 M271 79 H344" class="sl-signal arrow"/>
                <text x="181" y="40" text-anchor="middle" class="cap">vehicle</text>""",
            ),
        ),
        Entry(
            "Unit Delay / state",
            "Returns the input from one sample period earlier. The delay breaks direct feedthrough and makes state across simulation steps explicit.",
            "The z⁻¹ symbol means previous sample, not a generic wait.",
            svg(
                "A z to the minus one Unit Delay block between input and output signals",
                ARROW + """
                <path d="M22 52 H116" class="sl-signal arrow"/>
                <rect x="116" y="17" width="128" height="70" rx="2" class="sl-block"/>
                <text x="180" y="60" text-anchor="middle" class="math">z⁻¹</text>
                <path d="M244 52 H338" class="sl-signal arrow"/>
                <text x="180" y="101" text-anchor="middle" class="cap">previous sample</text>""",
            ),
        ),
        Entry(
            "Goto / From tag",
            "Continues a named signal without drawing the intervening line. Matching tags are a non-local connection within their visibility scope.",
            "Same tag name = same routed signal; no line does not mean no dependency.",
            svg(
                "Matching Goto and From tag blocks named CMD with an omitted visual connection",
                ARROW + """
                <path d="M16 34 H72" class="sl-signal arrow"/>
                <path d="M72 20 H145 L164 34 L145 48 H72 Z" class="sl-tag"/><text x="116" y="38" text-anchor="middle" class="sl-small">CMD</text>
                <text x="180" y="38" text-anchor="middle" class="sl-fade">⋯</text>
                <path d="M198 20 H290 V48 H198 L180 34 Z" class="sl-tag"/><text x="236" y="38" text-anchor="middle" class="sl-small">CMD</text>
                <path d="M290 34 H344" class="sl-signal arrow"/>
                <text x="180" y="82" text-anchor="middle" class="cap">non-local signal route</text>""",
            ),
        ),
    ]


def labview_entries() -> list[Entry]:
    return [
        Entry(
            "Control terminal",
            "Receives a value from the front panel and supplies it to the block diagram. A thick border and outward arrow mark it as a data source.",
            "Front panel → diagram.",
            svg(
                "A LabVIEW control terminal with a thick border and outward arrow",
                """
                <rect x="74" y="24" width="106" height="58" rx="2" class="lv-terminal control"/>
                <path d="M136 43 L156 53 L136 63 Z" class="lv-arrow"/>
                <path d="M180 53 H318" class="lv-wire orange"/>
                <text x="127" y="100" text-anchor="middle" class="cap">setpoint control</text>""",
            ),
        ),
        Entry(
            "Indicator terminal",
            "Receives a result from block-diagram logic and displays it on the front panel. A thin border and inward arrow mark it as a sink.",
            "Diagram → front panel.",
            svg(
                "A LabVIEW indicator terminal with a thin border and inward arrow",
                """
                <path d="M38 53 H180" class="lv-wire orange"/>
                <rect x="180" y="24" width="106" height="58" rx="2" class="lv-terminal indicator"/>
                <path d="M206 43 L226 53 L206 63 Z" class="lv-arrow"/>
                <text x="233" y="100" text-anchor="middle" class="cap">result indicator</text>""",
            ),
        ),
        Entry(
            "Constant",
            "Introduces a literal value directly on the diagram. Its color and border follow the value's data type.",
            "A constant has an output only and no front-panel counterpart.",
            svg(
                "An orange numeric constant wired into a node",
                """
                <rect x="52" y="34" width="84" height="38" rx="2" class="lv-constant orange-fill"/>
                <text x="94" y="59" text-anchor="middle" class="lv-label">0.5</text>
                <path d="M136 53 H306" class="lv-wire orange"/>
                <text x="94" y="92" text-anchor="middle" class="cap">numeric literal</text>""",
            ),
        ),
        Entry(
            "Primitive function",
            "Performs a built-in operation. The small icon is the operator; wires land on typed terminals around its edge.",
            "A node runs when all required inputs have data.",
            svg(
                "A LabVIEW multiply primitive with two numeric inputs and one output",
                """
                <path d="M26 31 H150 M26 75 H150 M210 53 H336" class="lv-wire orange"/>
                <rect x="150" y="23" width="60" height="60" rx="3" class="lv-node"/>
                <text x="180" y="65" text-anchor="middle" class="lv-op">×</text>
                <circle cx="150" cy="31" r="3" class="lv-pin orange-dot"/><circle cx="150" cy="75" r="3" class="lv-pin orange-dot"/><circle cx="210" cy="53" r="3" class="lv-pin orange-dot"/>""",
            ),
        ),
        Entry(
            "SubVI node",
            "Calls another VI as a reusable subroutine. Its icon identifies the VI; the connector-pane terminals around it are the call interface.",
            "Equivalent role to a function call, with graphical pins.",
            svg(
                "A LabVIEW subVI icon with typed terminals on both sides",
                """
                <path d="M24 30 H130 M24 73 H130" class="lv-wire"/><path d="M230 30 H336 M230 73 H336" class="lv-wire"/>
                <rect x="130" y="12" width="100" height="80" rx="3" class="lv-subvi"/>
                <rect x="143" y="25" width="74" height="38" rx="5" class="lv-icon"/><text x="180" y="50" text-anchor="middle" class="lv-label">filter.vi</text>
                <circle cx="130" cy="30" r="4" class="lv-pin orange-dot"/><circle cx="130" cy="73" r="4" class="lv-pin green-dot"/><circle cx="230" cy="30" r="4" class="lv-pin orange-dot"/><circle cx="230" cy="73" r="4" class="lv-pin pink-dot"/>""",
            ),
        ),
        Entry(
            "Wire",
            "Transfers data from one source to one or more readers. Normal wires have no arrowheads; source/sink terminals and node dependencies determine direction.",
            "Color, pattern, and thickness encode type and shape.",
            svg(
                "A normal LabVIEW wire routed orthogonally without arrowheads",
                """
                <rect x="26" y="28" width="48" height="48" rx="2" class="lv-terminal control"/><rect x="288" y="28" width="48" height="48" rx="2" class="lv-terminal indicator"/>
                <path d="M74 52 H170 V32 H288" class="lv-wire orange"/>
                <text x="180" y="88" text-anchor="middle" class="cap">typed dataflow, no arrowhead</text>""",
            ),
        ),
        Entry(
            "Wire junction",
            "Branches one source value to several consumers. Every destination receives the same data after the source produces it.",
            "A junction is fan-out, not a conditional path.",
            svg(
                "One LabVIEW wire branching at a junction into two consumers",
                """
                <path d="M24 52 H172 V22 H336 M172 52 V82 H336" class="lv-wire blue"/>
                <circle cx="172" cy="52" r="5" class="blue-dot"/>
                <text x="172" y="102" text-anchor="middle" class="cap">same value, multiple readers</text>""",
            ),
        ),
        Entry(
            "Wire type",
            "The wire itself is a type annotation: common scalar colors include orange for floating-point numeric, blue for integer, green for Boolean, pink for string, and brown for cluster.",
            "Arrays use thicker patterned versions of their element type.",
            svg(
                "LabVIEW wire color legend for common scalar data types",
                """
                <path d="M18 19 H94" class="lv-wire orange"/><text x="104" y="23" class="legend-text">DBL</text>
                <path d="M18 42 H94" class="lv-wire blue"/><text x="104" y="46" class="legend-text">integer</text>
                <path d="M18 65 H94" class="lv-wire green"/><text x="104" y="69" class="legend-text">Boolean</text>
                <path d="M190 30 H266" class="lv-wire pink"/><text x="276" y="34" class="legend-text">string</text>
                <path d="M190 58 H266" class="lv-wire brown thick"/><text x="276" y="62" class="legend-text">cluster</text>""",
            ),
        ),
        Entry(
            "Structure frame",
            "A resizable region that controls how the nodes inside execute. Loops, cases, and sequences are structures rather than ordinary function nodes.",
            "The frame owns the enclosed subdiagram.",
            svg(
                "A generic LabVIEW structure frame containing a small node",
                """
                <rect x="50" y="10" width="260" height="88" class="lv-frame"/>
                <rect x="147" y="32" width="66" height="44" rx="3" class="lv-node"/><text x="180" y="59" text-anchor="middle" class="lv-label">code</text>
                <rect x="44" y="48" width="12" height="12" class="lv-tunnel orange-fill"/><rect x="304" y="48" width="12" height="12" class="lv-tunnel orange-fill"/>
                <path d="M18 54 H44 M56 54 H147 M213 54 H304 M316 54 H342" class="lv-wire orange"/>""",
            ),
        ),
        Entry(
            "Case Structure",
            "Executes exactly one case subdiagram selected by its input. The selector label names the visible case; the question-mark terminal receives the selector value.",
            "Only one case is visible at a time, even though others are stored in the frame.",
            svg(
                "A LabVIEW Case Structure showing its True case and selector terminal",
                """
                <rect x="48" y="18" width="264" height="78" class="lv-frame case"/>
                <path d="M128 18 L136 10 H224 L232 18" class="lv-case-tab"/><text x="180" y="15" text-anchor="middle" class="lv-small">◀  True  ▶</text>
                <rect x="42" y="50" width="14" height="16" rx="2" class="lv-selector"/><text x="49" y="62" text-anchor="middle" class="selector-text">?</text>
                <path d="M18 58 H42" class="lv-wire green"/>
                <rect x="133" y="38" width="94" height="38" rx="3" class="lv-node"/><text x="180" y="61" text-anchor="middle" class="lv-label">True code</text>""",
            ),
        ),
        Entry(
            "For Loop",
            "Repeats the enclosed subdiagram a set number of times. N is the requested count; i is the zero-based iteration number available inside.",
            "A frame means the whole enclosed graph repeats.",
            svg(
                "A LabVIEW For Loop frame with N and i terminals",
                """
                <rect x="54" y="9" width="252" height="90" class="lv-frame loop"/>
                <rect x="49" y="20" width="16" height="16" class="lv-loop-terminal"/><text x="57" y="32" text-anchor="middle" class="lv-small">N</text>
                <rect x="49" y="73" width="16" height="16" class="lv-loop-terminal"/><text x="57" y="85" text-anchor="middle" class="lv-small">i</text>
                <path d="M18 28 H49" class="lv-wire blue"/>
                <path d="M87 53 H270" class="lv-wire orange"/><path d="M255 44 L270 53 L255 62" class="lv-ink"/>
                <text x="180" y="43" text-anchor="middle" class="cap">repeat N times</text>""",
            ),
        ),
        Entry(
            "While Loop",
            "Repeats the enclosed subdiagram until its conditional terminal says to stop (or continue, depending on configuration).",
            "The stop terminal is part of the loop's execution contract.",
            svg(
                "A LabVIEW While Loop frame with iteration and stop terminals",
                """
                <rect x="54" y="9" width="252" height="90" class="lv-frame loop"/>
                <rect x="49" y="73" width="16" height="16" class="lv-loop-terminal"/><text x="57" y="85" text-anchor="middle" class="lv-small">i</text>
                <rect x="294" y="73" width="16" height="16" rx="8" class="lv-stop"/><path d="M299 78 L305 84 M305 78 L299 84" class="stop-x"/>
                <path d="M202 81 H294" class="lv-wire green"/>
                <text x="180" y="47" text-anchor="middle" class="cap">repeat until condition</text>""",
            ),
        ),
        Entry(
            "Tunnel",
            "Moves data across a structure boundary. The small square on the frame is the boundary point; its wire type remains visible on both sides.",
            "A tunnel belongs to the structure, not to the node inside.",
            svg(
                "An orange LabVIEW wire crossing a structure through input and output tunnels",
                """
                <rect x="92" y="8" width="176" height="90" class="lv-frame"/>
                <rect x="86" y="46" width="12" height="12" class="lv-tunnel orange-fill"/><rect x="262" y="46" width="12" height="12" class="lv-tunnel orange-fill"/>
                <path d="M20 52 H86 M98 52 H262 M274 52 H340" class="lv-wire orange"/>
                <text x="92" y="82" text-anchor="middle" class="cap">input</text><text x="268" y="82" text-anchor="middle" class="cap">output</text>""",
            ),
        ),
        Entry(
            "Auto-indexing tunnel",
            "On a loop, automatically takes one array element per iteration on input or builds an array from per-iteration values on output.",
            "Bracket marks mean array ↔ element conversion at the loop edge.",
            svg(
                "A thick array wire entering a For Loop through an auto-indexing tunnel and becoming a scalar wire",
                """
                <rect x="116" y="9" width="190" height="90" class="lv-frame loop"/>
                <path d="M18 52 H110" class="lv-wire orange array"/>
                <rect x="108" y="42" width="16" height="20" class="lv-index-tunnel"/><text x="116" y="57" text-anchor="middle" class="index-text">[ ]</text>
                <path d="M124 52 H286" class="lv-wire orange"/>
                <text x="65" y="80" text-anchor="middle" class="cap">array</text><text x="204" y="80" text-anchor="middle" class="cap">one element</text>""",
            ),
        ),
        Entry(
            "Shift register",
            "Carries a value from one loop iteration to the next. The left terminal reads the previous value; the right terminal stores the next value.",
            "Paired border terminals make loop-carried state explicit.",
            svg(
                "Paired shift-register terminals on a loop frame carrying state through an add node",
                """
                <rect x="62" y="9" width="236" height="90" class="lv-frame loop"/>
                <path d="M18 52 H54 M70 52 H142" class="lv-wire orange"/>
                <path d="M218 52 H290 M306 52 H342" class="lv-wire orange"/>
                <rect x="54" y="42" width="16" height="20" class="lv-shift"/><path d="M58 47 L66 52 L58 57" class="shift-chevron"/>
                <rect x="290" y="42" width="16" height="20" class="lv-shift"/><path d="M294 47 L302 52 L294 57" class="shift-chevron"/>
                <rect x="142" y="29" width="76" height="46" rx="3" class="lv-node"/><text x="180" y="59" text-anchor="middle" class="lv-op">+1</text>
                <text x="180" y="94" text-anchor="middle" class="cap">previous → next</text>""",
            ),
        ),
        Entry(
            "Select function",
            "Chooses between true and false input values. It selects data, whereas a Case Structure selects which code executes.",
            "Use when both candidate values are already available.",
            svg(
                "A LabVIEW Select function with true false and selector inputs",
                """
                <path d="M24 25 H144 M24 79 H144" class="lv-wire pink"/><path d="M82 52 H144" class="lv-wire green"/>
                <path d="M144 14 H226 L246 52 L226 90 H144 Z" class="lv-select"/>
                <text x="158" y="29" class="lv-small">T</text><text x="158" y="82" class="lv-small">F</text><text x="158" y="57" class="lv-small">s</text>
                <text x="196" y="58" text-anchor="middle" class="lv-op">?</text>
                <path d="M246 52 H336" class="lv-wire pink"/>""",
            ),
        ),
        Entry(
            "Coercion dot",
            "Warns that LabVIEW is converting the wired value to another compatible representation at a node terminal.",
            "A small red dot is an implicit conversion, not a normal pin.",
            svg(
                "A red coercion dot where a blue integer wire enters an orange numeric node",
                """
                <path d="M30 52 H166" class="lv-wire blue"/>
                <rect x="166" y="22" width="98" height="60" rx="3" class="lv-node"/>
                <circle cx="166" cy="52" r="7" class="coercion"/>
                <text x="215" y="57" text-anchor="middle" class="lv-label">DBL math</text>
                <path d="M264 52 H336" class="lv-wire orange"/>
                <text x="166" y="100" text-anchor="middle" class="cap">implicit numeric conversion</text>""",
            ),
        ),
        Entry(
            "Broken wire",
            "Marks an invalid or incomplete connection. The VI cannot run until required terminals and incompatible types are repaired.",
            "Dashed black wire + red X = compile-time error on the diagram.",
            svg(
                "A dashed broken LabVIEW wire with a red X",
                """
                <path d="M28 52 H332" class="lv-broken"/>
                <circle cx="180" cy="52" r="16" class="broken-badge"/>
                <path d="M171 43 L189 61 M189 43 L171 61" class="broken-x"/>
                <text x="180" y="94" text-anchor="middle" class="cap">VI cannot run</text>""",
            ),
        ),
    ]


def render_rows(entries: list[Entry], prefix: str) -> str:
    rows = []
    for i, entry in enumerate(entries, 1):
        rows.append(
            f"""
            <tr id="{prefix}-{i}">
              <td class="meaning">
                <div class="row-kicker">{prefix.upper()} · {i:02d}</div>
                <h3>{escape(entry.term)}</h3>
                <p>{entry.meaning}</p>
                <p class="cue">{escape(entry.cue)}</p>
              </td>
              <td class="shape">{entry.drawing}</td>
            </tr>"""
        )
    return "".join(rows)


def build() -> str:
    sim = simulink_entries()
    lab = labview_entries()
    assert len(sim) == 13
    assert len(lab) == 18

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Visual grammar dictionary — Simulink &amp; LabVIEW</title>
<style>
  :root{{--paper:#f6f3ed;--ink:#182029;--muted:#626b74;--line:#cfd3d6;--white:#fff;--sl:#087f8c;--sl-soft:#d9f2f2;--lv:#6b4ccf;--lv-soft:#ece6ff;--orange:#e98218;--blue:#246dd6;--green:#27924b;--pink:#ef3f98;--brown:#81512f;--red:#d9342b;--shadow:0 20px 60px rgba(35,42,48,.12)}}
  *{{box-sizing:border-box}} html{{scroll-behavior:smooth}} body{{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}}
  a{{color:inherit}} .shell{{width:min(1180px,calc(100% - 32px));margin:auto}} header{{padding:64px 0 44px}}
  .eyebrow{{font-size:12px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--sl)}}
  h1{{max-width:850px;margin:12px 0 18px;font-size:clamp(40px,7vw,76px);line-height:.94;letter-spacing:-.055em}} .lede{{max-width:790px;margin:0;font-size:20px;line-height:1.5;color:#46515b}}
  .scope{{display:grid;grid-template-columns:1.1fr .9fr;gap:18px;margin:32px 0 8px}} .card{{padding:22px 24px;border:1px solid var(--line);border-radius:18px;background:rgba(255,255,255,.68)}}
  .card h2{{margin:0 0 8px;font-size:18px}} .card p{{margin:0;color:var(--muted)}}
  nav{{position:sticky;top:0;z-index:10;border-block:1px solid rgba(128,135,141,.35);background:rgba(246,243,237,.9);backdrop-filter:blur(12px)}} nav .shell{{display:flex;gap:10px;padding:10px 0}} nav a{{text-decoration:none;padding:8px 12px;border-radius:999px;font-weight:750;font-size:13px}} nav a:hover{{background:#fff}}
  section{{padding:54px 0 18px;scroll-margin-top:66px}} .section-head{{display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:end;margin-bottom:20px}} .section-head h2{{margin:0;font-size:36px;letter-spacing:-.035em}} .section-head p{{margin:0;color:var(--muted)}}
  .section-head .tag{{display:inline-flex;align-items:center;gap:8px;margin-bottom:10px;padding:5px 9px;border-radius:999px;font-size:11px;font-weight:850;letter-spacing:.12em;text-transform:uppercase}} .sim .tag{{background:var(--sl-soft);color:#08636d}} .lab .tag{{background:var(--lv-soft);color:#5434b8}}
  .dictionary{{width:100%;border-collapse:separate;border-spacing:0;overflow:hidden;border:1px solid var(--line);border-radius:20px;background:#fff;box-shadow:var(--shadow)}}
  .dictionary thead th{{padding:13px 20px;background:#202a33;color:#fff;font-size:12px;letter-spacing:.12em;text-align:left;text-transform:uppercase}} .dictionary thead th:first-child{{width:44%}} .dictionary th:last-child{{text-align:center}}
  .dictionary td{{border-top:1px solid #e2e4e6;vertical-align:middle}} .dictionary tbody tr:first-child td{{border-top:0}} .dictionary tr{{break-inside:avoid}} .meaning{{padding:22px 26px}} .shape{{padding:10px 20px;background-image:linear-gradient(#edf0f2 1px,transparent 1px),linear-gradient(90deg,#edf0f2 1px,transparent 1px);background-size:18px 18px;background-position:-1px -1px}}
  .row-kicker{{font-size:10px;font-weight:850;letter-spacing:.14em;color:#87909a}} .meaning h3{{margin:2px 0 5px;font-size:19px;letter-spacing:-.015em}} .meaning p{{margin:0;color:#4f5963}} .meaning .cue{{margin-top:8px;color:#182029;font-size:13px;font-weight:700}}
  .glyph{{display:block;width:100%;height:116px;color:#111;overflow:visible}} .glyph text{{font-family:Inter,ui-sans-serif,system-ui,sans-serif}}
  .cap{{font-size:11px;fill:#65707a}} .tiny{{font-size:9px;fill:#33404a}} .rotate{{transform:rotate(-90deg);transform-origin:center}} .math{{font:30px Georgia,serif;fill:#111}}
  .sl-block{{fill:#fff;stroke:#101419;stroke-width:2}} .sl-subsystem{{fill:#fff;stroke:#101419;stroke-width:2.2}} .sl-subsystem.enabled{{stroke-width:3.4}} .sl-port-block{{fill:#fff;stroke:#101419;stroke-width:1.7}} .sl-port{{fill:#111}} .sl-label{{font-size:16px;fill:#111}} .sl-small{{font-size:12px;fill:#111}} .sl-ink{{fill:none;stroke:#101419;stroke-width:1.7}} .sl-ink.strong{{stroke-width:2.5}} .sl-muted{{fill:none;stroke:#6a737b;stroke-width:1.4;stroke-dasharray:4 3}} .sl-signal{{fill:none;stroke:currentColor;stroke-width:1.7}} .arrow{{marker-end:url(#arrow)}} .sl-control{{fill:none;stroke:#111;stroke-width:1.8}} .sl-action{{fill:none;stroke:#6b4ccf;stroke-width:2;stroke-dasharray:7 4}} .junction,.sl-port{{fill:#111;stroke:none}} .sl-block.merge{{fill:#d7f3f5;stroke:#087f8c;stroke-width:2.3}} .sl-bus{{fill:none;stroke:#146e8c;stroke-width:5}} .sl-tag{{fill:#fff;stroke:#101419;stroke-width:1.7}} .sl-fade{{font-size:28px;fill:#8a9299}}
  .lv-terminal{{fill:#f6c686;stroke:#23282d}} .lv-terminal.control{{stroke-width:5}} .lv-terminal.indicator{{stroke-width:1.5}} .lv-arrow{{fill:#fff;stroke:#78410b;stroke-width:1}} .lv-wire{{fill:none;stroke:#2b3035;stroke-width:3.4;stroke-linecap:round;stroke-linejoin:round}} .lv-wire.orange{{stroke:var(--orange)}} .lv-wire.blue{{stroke:var(--blue)}} .lv-wire.green{{stroke:var(--green)}} .lv-wire.pink{{stroke:var(--pink)}} .lv-wire.brown{{stroke:var(--brown)}} .lv-wire.thick{{stroke-width:6}} .lv-wire.array{{stroke-width:7;stroke-dasharray:10 3}}
  .orange-fill{{fill:#f5bd73;stroke:#b85a06}} .lv-constant{{stroke-width:2}} .lv-label{{font-size:12px;fill:#182029}} .lv-op{{font-size:26px;fill:#182029}} .lv-small{{font-size:10px;fill:#182029}} .lv-node{{fill:#f4f0e7;stroke:#34393e;stroke-width:2;filter:drop-shadow(2px 3px 1px rgba(0,0,0,.18))}} .lv-subvi{{fill:#e9e7df;stroke:#34393e;stroke-width:2;filter:drop-shadow(2px 3px 1px rgba(0,0,0,.16))}} .lv-icon{{fill:#fff;stroke:#6b4ccf;stroke-width:2}} .lv-pin{{stroke:#fff;stroke-width:1}} .orange-dot{{fill:var(--orange)}} .blue-dot{{fill:var(--blue)}} .green-dot{{fill:var(--green)}} .pink-dot{{fill:var(--pink)}}
  .legend-text{{font-size:11px;fill:#3f4952}} .lv-frame{{fill:rgba(255,255,255,.5);stroke:#676d72;stroke-width:4}} .lv-frame.case{{stroke:#7b776f}} .lv-frame.loop{{stroke:#77736b}} .lv-tunnel{{stroke-width:1.4}} .lv-case-tab{{fill:#e7e3db;stroke:#676d72;stroke-width:2}} .lv-selector{{fill:#2f9b50;stroke:#1b6c34;stroke-width:1.5}} .selector-text{{font-size:12px;font-weight:900;fill:#fff}} .lv-loop-terminal{{fill:#e4e6e8;stroke:#50575d;stroke-width:1.5}} .lv-stop{{fill:#e84f48;stroke:#a41f1a;stroke-width:1.5}} .stop-x{{stroke:#fff;stroke-width:1.5}} .lv-ink{{fill:none;stroke:#434a50;stroke-width:2}} .lv-index-tunnel{{fill:#fff;stroke:#b85a06;stroke-width:1.5}} .index-text{{font-size:8px;fill:#b85a06;font-weight:800}} .lv-shift{{fill:#f5bd73;stroke:#a65508;stroke-width:1.5}} .shift-chevron{{fill:none;stroke:#79400c;stroke-width:1.5}} .lv-select{{fill:#e9e7df;stroke:#34393e;stroke-width:2}} .coercion{{fill:var(--red);stroke:#fff;stroke-width:2}} .lv-broken{{fill:none;stroke:#171a1d;stroke-width:3;stroke-dasharray:8 6}} .broken-badge{{fill:#fff;stroke:var(--red);stroke-width:2}} .broken-x{{stroke:var(--red);stroke-width:5;stroke-linecap:round}}
  .crosswalk{{display:grid;grid-template-columns:1fr 52px 1fr;gap:0;margin-top:20px;border:1px solid var(--line);border-radius:18px;overflow:hidden;background:#fff}} .crosswalk div{{padding:14px 18px;border-top:1px solid #e2e4e6}} .crosswalk div:nth-child(-n+3){{border-top:0}} .crosswalk .sl-side{{font-weight:750;background:#f4fbfb}} .crosswalk .lv-side{{font-weight:750;background:#f8f5ff}} .crosswalk .bridge{{padding-inline:0;text-align:center;color:#8a9299;background:#fff}}
  .sources{{columns:2;column-gap:30px;padding:22px 0 56px}} .source{{break-inside:avoid;margin:0 0 14px;color:#4d5760;font-size:13px}} .source b{{color:#182029}} .source a{{text-decoration-thickness:1px;text-underline-offset:3px}}
  .footnote{{margin:36px 0 0;padding:20px 22px;border-left:4px solid var(--sl);background:#fff;border-radius:0 14px 14px 0;color:#4f5963}} footer{{padding:38px 0 54px;color:#717980;font-size:12px}}
  @media(max-width:760px){{.scope,.section-head{{grid-template-columns:1fr}} .dictionary,.dictionary tbody,.dictionary tr,.dictionary td{{display:block;width:100%}} .dictionary thead{{display:none}} .dictionary tr{{border-top:1px solid var(--line)}} .dictionary tbody tr:first-child{{border-top:0}} .meaning{{padding:20px}} .shape{{padding:6px 12px}} .glyph{{height:106px}} .crosswalk{{grid-template-columns:1fr 38px 1fr}} .sources{{columns:1}}}}
  @media print{{body{{background:#fff}} nav{{display:none}} header{{padding-top:22px}} .shell{{width:100%}} .dictionary{{box-shadow:none}} .shape{{background:none}} section{{padding-top:30px}} a{{text-decoration:none}}}}
</style>
</head>
<body>
<header class="shell">
  <div class="eyebrow">SystemSketch reference · 02 September 2026</div>
  <h1>Visual grammar dictionary</h1>
  <p class="lede">A board-reading key for <b>Simulink</b> and <b>LabVIEW</b>. In every dictionary row, the meaning is on the left and the representative board shape is on the right.</p>
  <div class="scope">
    <div class="card"><h2>What this report is</h2><p>A compact semantic lexicon: nodes, boundaries, wires, control flow, joins, hierarchy, and state—the marks that change how a board should be read.</p></div>
    <div class="card"><h2>What it is not</h2><p>Not a complete library palette and not a pixel-perfect icon catalogue. Individual blocks and themes vary; the diagrams below are original schematic reconstructions of stable conventions.</p></div>
  </div>
</header>
<nav><div class="shell"><a href="#simulink">Simulink · {len(sim)}</a><a href="#labview">LabVIEW · {len(lab)}</a><a href="#crosswalk">Crosswalk</a><a href="#sources">Sources</a></div></nav>
<main class="shell">
  <section id="simulink" class="sim">
    <div class="section-head"><div><div class="tag">Signal-flow model</div><h2>Simulink</h2></div><p>Blocks transform or generate time-varying signals. Directed lines carry those signals. Extra control ports, action lines, and state blocks change when a block executes or which value persists.</p></div>
    <table class="dictionary"><thead><tr><th>What it represents</th><th>Shape used on the board</th></tr></thead><tbody>{render_rows(sim, "sl")}</tbody></table>
  </section>

  <section id="labview" class="lab">
    <div class="section-head"><div><div class="tag">Typed dataflow program</div><h2>LabVIEW</h2></div><p>Nodes execute when their required inputs have data. Wires carry typed values; structures own subdiagrams; tunnels and registers explain how data crosses structure boundaries and loop iterations.</p></div>
    <table class="dictionary"><thead><tr><th>What it represents</th><th>Shape used on the board</th></tr></thead><tbody>{render_rows(lab, "lv")}</tbody></table>
  </section>

  <section id="crosswalk">
    <div class="section-head"><div><div class="tag" style="background:#e9ecef;color:#45515b">Translation key</div><h2>Closest conceptual crosswalk</h2></div><p>These are reading analogies, not claims of identical execution semantics. The conditional row is the most important exception.</p></div>
    <div class="crosswalk" role="table" aria-label="Conceptual crosswalk between Simulink and LabVIEW">
      <div class="sl-side">Simulink operation block</div><div class="bridge">↔</div><div class="lv-side">LabVIEW function node</div>
      <div class="sl-side">Signal line + branch</div><div class="bridge">↔</div><div class="lv-side">Typed wire + junction</div>
      <div class="sl-side">Subsystem</div><div class="bridge">↔</div><div class="lv-side">SubVI</div>
      <div class="sl-side">Inport / Outport</div><div class="bridge">↔</div><div class="lv-side">Connector-pane terminal</div>
      <div class="sl-side">Unit Delay / Memory</div><div class="bridge">↔</div><div class="lv-side">Shift register / Feedback Node</div>
      <div class="sl-side">If Action Subsystems + Merge</div><div class="bridge">≈</div><div class="lv-side">Case Structure + output tunnel</div>
    </div>
    <p class="footnote"><b>Critical distinction:</b> a Simulink Switch and a LabVIEW Select both choose among data values. An If Action Subsystem and a LabVIEW Case Structure choose which enclosed computation executes. A Merge then rejoins mutually exclusive Simulink writers; a Case Structure's output tunnel is the LabVIEW boundary join.</p>
  </section>

  <section id="sources">
    <div class="section-head"><div><div class="tag" style="background:#e9ecef;color:#45515b">Primary references</div><h2>Official documentation</h2></div><p>Definitions are paraphrased from MathWorks and NI. Product artwork is not embedded; every glyph in this report is drawn in the report itself.</p></div>
    <div class="sources">
      <p class="source"><b>S1 · MathWorks</b><br><a href="https://www.mathworks.com/help/simulink/slref/simulink-concepts-models.html">Simulink Models: blocks, lines, and signal semantics</a></p>
      <p class="source"><b>S2 · MathWorks</b><br><a href="https://www.mathworks.com/help/simulink/ug/connect-blocks.html">Connect Blocks: ports, direction, and signal branching</a></p>
      <p class="source"><b>S3 · MathWorks</b><br><a href="https://www.mathworks.com/help/simulink/slref/subsystem.html">Subsystem: model hierarchy and external ports</a></p>
      <p class="source"><b>S4 · MathWorks</b><br><a href="https://www.mathworks.com/help/simulink/slref/enabledsubsystem.html">Enabled Subsystem: conditional execution</a></p>
      <p class="source"><b>S5 · MathWorks</b><br><a href="https://www.mathworks.com/help/simulink/slref/ifactionsubsystem.html">If Action Subsystem: action-signal control</a></p>
      <p class="source"><b>S6 · MathWorks</b><br><a href="https://www.mathworks.com/help/simulink/slref/merge.html">Merge: mutually exclusive writers into one signal</a></p>
      <p class="source"><b>S7 · MathWorks</b><br><a href="https://www.mathworks.com/help/simulink/slref/buscreator.html">Bus Creator</a> and <a href="https://www.mathworks.com/help/simulink/slref/busselector.html">Bus Selector</a></p>
      <p class="source"><b>S8 · MathWorks</b><br><a href="https://www.mathworks.com/help/simulink/slref/unitdelay.html">Unit Delay: one-sample state</a></p>
      <p class="source"><b>S9 · MathWorks</b><br><a href="https://www.mathworks.com/help/simulink/data-stores.html">Data Stores and Goto/From routing alternatives</a></p>
      <p class="source"><b>L1 · NI</b><br><a href="https://www.ni.com/en/support/documentation/supplemental/08/labview-block-diagram-explained.html">LabVIEW Block Diagram Explained: objects, terminals, and nodes</a></p>
      <p class="source"><b>L2 · NI</b><br><a href="https://www.ni.com/docs/en-AS/bundle/labview/page/using-wires-to-link-block-diagram-objects.html">Using Wires: appearance, branches, broken wires, and coercion dots</a></p>
      <p class="source"><b>L3 · NI</b><br><a href="https://knowledge.ni.com/KnowledgeArticleDetails?id=kA00Z0000019LsVSAU">Common LabVIEW wire colors and types</a></p>
      <p class="source"><b>L4 · NI</b><br><a href="https://www.ni.com/en/support/documentation/supplemental/21/labview-equivalent-of-if--if-else--and-switch-statements.html">Select Function versus Case Structure</a></p>
      <p class="source"><b>L5 · NI</b><br><a href="https://www.ni.com/en/support/documentation/supplemental/08/labview-for-loops-and-while-loops-explained.html">For Loops and While Loops Explained</a></p>
      <p class="source"><b>L6 · NI</b><br><a href="https://knowledge.ni.com/KnowledgeArticleDetails?id=kA03q000000YKYuCAO&amp;l=en-US">Using Shift Registers in LabVIEW</a></p>
    </div>
  </section>
</main>
<footer class="shell">Prepared for SystemSketch · Original schematic glyphs · Continue with the <a href="node-editor-visual-grammar-atlas-2026-09-02.html">ten-system node editor atlas</a> · Simulink and MATLAB are trademarks of The MathWorks, Inc.; LabVIEW is a trademark of National Instruments.</footer>
</body>
</html>"""


def main() -> None:
    html = build()
    if "https://" not in html or html.count("<svg") != 31:
        raise RuntimeError("Report completeness check failed")
    OUTPUT.write_text(
        "\n".join(line.rstrip() for line in html.splitlines()) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {OUTPUT} ({len(html):,} bytes)")


if __name__ == "__main__":
    main()
