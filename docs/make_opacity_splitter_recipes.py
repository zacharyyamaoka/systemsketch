#!/usr/bin/env python3
"""Emit the review recipes for two open grammar questions on the golden corpus.

Question 1 — golden 12 `client.send()`: what does a Block say about a callee the
analyzer could not resolve? Ten directions, one board each.

Question 2 — golden 33 `ObjectRecord.to_object_spec()`: where does a projection
(`self.shape`, `response.id`) live? Five directions, one board each.

Every board is the *same scene* in a different grammar, so the comparison is fair.
The recipes are written here and rendered by the review-fixture helper through the
real editor; this script never hand-writes tldraw schema.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BOARDS = ROOT / "sketches" / "review"

VIEWPORT = {"width": 1600, "height": 1010}


# --------------------------------------------------------------------- helpers


def block(bid: str, x: int, y: int, w: int, h: int, *, title: str, kind: str,
          inputs: list[dict], outputs: list[dict], view: str = "port",
          description: str = "", icon: str = "") -> dict:
    props = {
        "title": title,
        "description": description,
        "blockType": kind,
        "view": view,
        "w": w,
        "h": h,
        "inputs": inputs,
        "outputs": outputs,
    }
    if icon:
        props["icon"] = icon
    return {"id": bid, "type": "block", "x": x, "y": y, "props": props}


def pill(bid: str, x: int, y: int, *, title: str, name: str, ptype: str,
         w: int = 200, h: int = 56) -> dict:
    """The shipped `value` capsule: title is the literal, ports mirror one name."""
    return {
        "id": bid,
        "type": "block",
        "x": x,
        "y": y,
        "props": {
            "title": title,
            "description": "",
            "blockType": "",
            "view": "value",
            "w": w,
            "h": h,
            "inputs": [{"id": "in_1", "name": name, "type": ptype, "visible": True}],
            "outputs": [{"id": "out_1", "name": name, "type": ptype, "visible": True}],
        },
    }


def port(pid: str, name: str, ptype: str) -> dict:
    return {"id": pid, "name": name, "type": ptype, "visible": True}


def cable(cid: str) -> dict:
    return {
        "id": cid,
        "type": "connection",
        "x": 0,
        "y": 0,
        "props": {
            "start": {"x": 0, "y": 0},
            "end": {"x": 0, "y": 0},
            "routing": "elbow",
            "curve": None,
            "pins": [],
            "elbowRoute": None,
            "temporal": "data",
            "delayValue": "",
            "pillPosition": 0.5,
        },
    }


def wire(cid: str, from_shape: str, from_port: str, to_shape: str, to_port: str) -> list[dict]:
    return [
        {"id": f"{cid}-a", "type": "connection", "fromId": cid, "toId": from_shape,
         "props": {"portId": from_port, "terminal": "start", "face": "outer"}},
        {"id": f"{cid}-b", "type": "connection", "fromId": cid, "toId": to_shape,
         "props": {"portId": to_port, "terminal": "end", "face": "outer"}},
    ]


def wrapped_lines(text: str, width: int) -> int:
    """Mirror of `layout_quality.mjs` so a card is sized, not guessed."""
    per_line = max(16, (width - 44) // 10)
    lines = 0
    for paragraph in text.split("\n"):
        used = 0
        lines += 1
        for word in paragraph.strip().split():
            length = min(len(word), per_line)
            if used == 0:
                used = length
            elif used + 1 + length <= per_line:
                used += 1 + length
            else:
                lines += 1
                used = length
    return lines


def card(cid: str, kind: str, text: str, x: int, y: int, w: int,
         target: dict | None = None) -> dict:
    """A callout whose height is derived from its own text, never eyeballed."""
    height = max(100, 34 + 24 * wrapped_lines(text, w))
    out = {"id": cid, "kind": kind, "text": text, "x": x, "y": y, "w": w, "h": height}
    if target:
        out["target"] = target
    return out


def write(slug: str, recipe: dict) -> Path:
    path = BOARDS / f"{slug}.recipe.json"
    path.write_text(json.dumps(recipe, indent=2) + "\n", encoding="utf-8")
    return path


# ------------------------------------------------------- question 1 · opacity
#
# The scene, identical on all ten boards:
#
#     encode()  ──payload──▶  client.send()  ──?──▶  run() ↦ receipt
#
# from golden 12:
#     payload  = encode(pose)
#     response = client.send(payload)
#     receipt  = response.id
#     return receipt          # run(...) -> str
#
# What the analyzer knows: the callee TEXT (`client.send`), the receiver's
# annotation (`Client`, itself `Any`), the argument's type (`bytes`, from the
# cable) and the function's declared return (`str`). What it does not know: the
# parameter's name, the callee's return type, and whether `.id` exists.

OPACITY_SOURCE = (
    "golden 12 · response = client.send(payload) · receipt = response.id\n"
    "Client = Any, so `send` never resolves."
)


def opacity_board(slug: str, *, send_title: str, send_kind: str,
                  send_inputs: list[dict], send_outputs: list[dict],
                  send_view: str = "port", send_h: int = 200,
                  send_description: str = "", send_icon: str = "",
                  step: str, passes: str, extra_shapes: list[dict] | None = None,
                  extra_bindings: list[dict] | None = None) -> dict:
    shapes = [
        block("encode", 110, 440, 300, 150,
              title="encode()", kind="call",
              inputs=[port("in_1", "pose", "Pose")],
              outputs=[port("out_1", "payload", "bytes")]),
        block("send", 540, 400, 520, send_h,
              title=send_title, kind=send_kind, view=send_view,
              description=send_description, icon=send_icon,
              inputs=send_inputs, outputs=send_outputs),
        block("ret", 1180, 460, 300, 130,
              title="run() ↦", kind="boundary",
              inputs=[port("in_1", "receipt", "str")],
              outputs=[]),
        cable("c1"),
        cable("c2"),
    ]
    # The argument lands on the last input row; the value that reaches the
    # boundary is whatever the Block calls its final output.
    bindings = (
        wire("c1", "encode", "out_1", "send", send_inputs[-1]["id"])
        + wire("c2", "send", send_outputs[-1]["id"], "ret", "in_1")
    )
    shapes += extra_shapes or []
    bindings += extra_bindings or []
    return {
        "feature": f"Symbol opacity · {slug}",
        "viewport": VIEWPORT,
        "shapes": shapes,
        "bindings": bindings,
        "callouts": [
            card("step-1", "step", step, 520, 130, 520,
                 {"shapeId": "send", "anchor": "top"}),
            card("note-src", "note", OPACITY_SOURCE, 80, 750, 440),
            card("pass", "pass", passes, 1000, 750, 500),
        ],
    }


OPACITY: dict[str, dict] = {}

# V1 · Any — the language's own word for a type it cannot narrow.
OPACITY["opacity-v1"] = opacity_board(
    "v1",
    send_title="client.send()", send_kind="call",
    send_inputs=[port("in_1", "self", "Client"), port("in_2", "payload", "Any")],
    send_outputs=[port("out_1", "response", "Any")],
    step="1 · Read the two Any slots. Is `payload: Any` telling you the parameter is "
         "typed Any, or that nobody looked?",
    passes="PASS WHEN · every unknown slot reads `Any`, a word that already exists in "
           "Python, and nothing on the board is invented vocabulary.",
)

# V2 · `?` — certainty as one character on the type that IS known.
OPACITY["opacity-v2"] = opacity_board(
    "v2",
    send_title="client.send()", send_kind="call",
    send_inputs=[port("in_1", "self", "Client"), port("in_2", "payload", "bytes?")],
    send_outputs=[port("out_1", "response", "?")],
    step="1 · `bytes?` means the cable says bytes but the callee never confirmed it. "
         "Bare `?` means nothing is known at all.",
    passes="PASS WHEN · the type slot still carries whatever is known, and the `?` is "
           "the only thing added — no row grows.",
)

# V3 · Blank — absence drawn as absence.
OPACITY["opacity-v3"] = opacity_board(
    "v3",
    send_title="client.send()", send_kind="call",
    send_inputs=[port("in_1", "self", "Client"), port("in_2", "payload", "")],
    send_outputs=[port("out_1", "response", "")],
    step="1 · Two rows carry no type at all. Compare them with `pose Pose` on encode() "
         "to the left.",
    passes="PASS WHEN · nothing on the Block claims a type it does not have, and the "
           "unresolved rows cost no ink.",
)

# V4 · Frame voice — the type line says it once; ports keep only known facts.
OPACITY["opacity-v4"] = opacity_board(
    "v4",
    send_title="client.send()", send_kind="external · unresolved",
    send_description="Receiver dispatch, response.id and side effects are summarized here",
    send_icon="Cloud",
    send_h=230,
    send_inputs=[port("in_1", "self", "Client"), port("in_2", "payload", "bytes")],
    send_outputs=[port("out_1", "receipt", "str")],
    step="1 · No port says unknown. The type line under the title says it once, for the "
         "whole call.",
    passes="PASS WHEN · every port carries a type the program actually proves, and the "
           "opacity is a fact about the call, not about each row.",
)

# V5 · Port certainty — a per-port mark. The dot is the intended channel; the
# schema has no field for it, so the glyph stands in the type slot here.
OPACITY["opacity-v5"] = opacity_board(
    "v5",
    send_title="client.send()", send_kind="call",
    send_inputs=[port("in_1", "self", "Client"), port("in_2", "payload", "◌ bytes")],
    send_outputs=[port("out_1", "response", "◌")],
    step="1 · The ◌ is standing in for a hollow port dot: a per-port certainty mark. "
         "Check whether it survives being read at a glance.",
    passes="PASS WHEN · you can point at exactly which ports the analyzer failed on — "
           "and you notice the mark is text, not a dot.",
)

# V6 · TODO — the unknown as an actionable stub.
OPACITY["opacity-v6"] = opacity_board(
    "v6",
    send_title="client.send()", send_kind="stub · 2 to fill",
    send_description="Click a TODO to type the signature; it writes a .pyi stub beside the source",
    send_h=230,
    send_inputs=[port("in_1", "self", "Client"), port("in_2", "payload", "TODO")],
    send_outputs=[port("out_1", "response", "TODO")],
    step="1 · Double-click a TODO and type `bytes`. The board is inviting you to author "
         "the missing signature.",
    passes="PASS WHEN · the unknown reads as work to do rather than a fact — and you "
           "decide whether a third-party client is work you want.",
)

# V7 · Positional slots — arity and order are known even when names are not.
OPACITY["opacity-v7"] = opacity_board(
    "v7",
    send_title="client.send()", send_kind="unresolved · 1 arg",
    send_inputs=[port("in_1", "self", "Client"), port("in_2", "arg 1", "bytes")],
    send_outputs=[port("out_1", "→ 1", "")],
    step="1 · `arg 1` is a true statement — one positional argument was passed. Compare "
         "it with `pose Pose` on encode().",
    passes="PASS WHEN · no invented name appears, and you judge whether a positional "
           "label helps a reader or just fills a slot.",
)

# V8 · Opaque region — the call is a hole where the program leaves your code.
OPACITY["opacity-v8"] = opacity_board(
    "v8",
    send_title="outside this program", send_kind="opaque boundary",
    send_description="client.send(payload) — one value in, one value out, nothing named",
    send_view="simple", send_h=190,
    send_inputs=[port("in_1", "", "")],
    send_outputs=[port("out_1", "", "")],
    step="1 · The call has become a region, not a function. Note what you can no longer "
         "see: which argument went where.",
    passes="PASS WHEN · the board reads as `here the program leaves my code` — and you "
           "decide if losing the argument wiring is an acceptable price.",
)

# V9 · Inferred — fill every slot the neighbours can prove; mark nothing.
OPACITY["opacity-v9"] = opacity_board(
    "v9",
    send_title="client.send()", send_kind="call · inferred",
    send_inputs=[port("in_1", "self", "Client"), port("in_2", "payload", "bytes")],
    send_outputs=[port("out_1", "response", "Any"), port("out_2", "receipt", "str")],
    send_h=245,
    send_description="payload: bytes from encode() · receipt: str from run()'s return annotation",
    step="1 · Both derived types came from neighbours, not from the callee. Find the one "
         "slot inference still cannot fill.",
    passes="PASS WHEN · you see that inference removes most of the ignorance and `response` "
           "is the residue it cannot remove.",
)

# V10 · Simple view — a Block whose signature cannot be stated shows no port table.
OPACITY["opacity-v10"] = opacity_board(
    "v10",
    send_title="client.send()", send_kind="unresolved callee",
    send_view="simple", send_h=200, send_icon="Cloud",
    send_inputs=[port("in_1", "self", "Client"), port("in_2", "payload", "bytes")],
    send_outputs=[port("out_1", "receipt", "str")],
    step="1 · The unresolved call is the only Block on the board without a port table. "
         "Hover its rim to see the dots are still there.",
    passes="PASS WHEN · you can spot the unresolved call from across the board without "
           "reading a single word.",
)


# ------------------------------------------------------ question 2 · splitter
#
# The scene, identical on all five boards, from golden 33
# `ObjectRecord.to_object_spec()`:
#
#     ObjectSpec(name=self.object_id, type_name=self.subcategory,
#                shape=shape, size=size_m, ...)
#
# `ObjectRecord` declares 20 fields. This body reads 5 of them. That ratio is
# the whole argument for deriving the projection instead of pre-building it.

SPLIT_SOURCE = (
    "golden 33 · shape = self.shape · size_m = self.size_m\n"
    "ObjectSpec(name=self.object_id, type_name=self.subcategory, …)\n"
    "ObjectRecord declares 20 fields. to_object_spec reads 7. Four reach ObjectSpec()."
)

SPEC_INPUTS = [
    port("in_1", "name", "str"),
    port("in_2", "type_name", "str"),
    port("in_3", "shape", "str"),
    port("in_4", "size", "Vec3"),
]

MEMBERS = [
    ("out_1", ".object_id", "str", "in_1"),
    ("out_2", ".subcategory", "str", "in_2"),
    ("out_3", ".shape", "str", "in_3"),
    ("out_4", ".size_m", "Vec3", "in_4"),
]


def split_scene(*, middle: list[dict], middle_bindings: list[dict],
                record_outputs: list[dict] | None = None,
                spec_x: int = 1070, spec_w: int = 420) -> tuple[list[dict], list[dict]]:
    record_ports = record_outputs or [port("out_1", "self", "ObjectRecord")]
    record_h = max(150, 60 + 46 * len(record_ports))
    shapes = [
        block("record", 40, 505 - record_h // 2, 480, record_h,
              title="to_object_spec()", kind="boundary",
              inputs=[],
              outputs=record_ports),
        block("spec", spec_x, 370, spec_w, 250,
              title="ObjectSpec()", kind="constructor",
              inputs=SPEC_INPUTS, outputs=[port("out_1", "spec", "ObjectSpec")]),
    ]
    return shapes + middle, middle_bindings


def split_board(slug: str, *, middle: list[dict], bindings: list[dict],
                record_outputs: list[dict] | None = None, spec_x: int = 1070,
                spec_w: int = 420, step: str, step_target: str, passes: str) -> dict:
    shapes, binds = split_scene(middle=middle, middle_bindings=bindings,
                                record_outputs=record_outputs, spec_x=spec_x,
                                spec_w=spec_w)
    return {
        "feature": f"Splitter · {slug}",
        "viewport": VIEWPORT,
        "shapes": shapes,
        "bindings": binds,
        "callouts": [
            card("step-1", "step", step, 470, 120, 520,
                 {"shapeId": step_target, "anchor": "top"}),
            card("note-src", "note", SPLIT_SOURCE, 60, 720, 480),
            card("pass", "pass", passes, 990, 720, 510),
        ],
    }


SPLITTER: dict[str, dict] = {}

# S1 · Derived Block — the projection is a Block whose ports come from the type.
_s1_middle = [
    block("split", 540, 370, 460, 260,
          title="ObjectRecord", kind="projection",
          description="4 of ObjectRecord's 20 fields — the ones ObjectSpec() is given here",
          icon="Shuffle",
          inputs=[port("in_1", "record", "ObjectRecord")],
          outputs=[port(pid, name, ptype) for pid, name, ptype, _ in MEMBERS]),
    cable("c0"), cable("c1"), cable("c2"), cable("c3"), cable("c4"),
]
_s1_bind = wire("c0", "record", "out_1", "split", "in_1")
for _i, (_pid, _n, _t, _dst) in enumerate(MEMBERS, start=1):
    _s1_bind += wire(f"c{_i}", "split", _pid, "spec", _dst)
SPLITTER["splitter-s1"] = split_board(
    "s1", middle=_s1_middle, bindings=_s1_bind, step_target="split",
    step="1 · One Block, ports derived from the incoming type. Right-click it and switch "
         "the view to Simple — that is the small chip on the edge.",
    passes="PASS WHEN · every output row reads `type .accessor`, no variable name appears, "
           "and Simple view shrinks it without changing the file.",
)

# S2 · Wire pills — the shipped `value` capsule, one per accessor, on the cable.
_s2_middle: list[dict] = []
_s2_bind: list[dict] = []
for _i, (_pid, _n, _t, _dst) in enumerate(MEMBERS):
    # The pill's port name is the variable name it shows beside the capsule;
    # a fed pill folds its title to `⋯`, so the accessor has to ride the name.
    _s2_middle.append(pill(f"p{_i}", 620, 340 + _i * 90, title=_n, name=_n, ptype=_t))
    _s2_middle.append(cable(f"a{_i}"))
    _s2_middle.append(cable(f"b{_i}"))
    _s2_bind += wire(f"a{_i}", "record", "out_1", f"p{_i}", "in_1")
    _s2_bind += wire(f"b{_i}", f"p{_i}", "out_1", "spec", _dst)
SPLITTER["splitter-s2"] = split_board(
    "s2", middle=_s2_middle, bindings=_s2_bind, step_target="p0",
    step="1 · Four capsules on the wire, each one an accessor. Click one and read its "
         "inspector — it is the literal Pill, reused.",
    passes="PASS WHEN · the projection sits on the edge with no new object type — and you "
           "judge whether a Pill meaning `.object_id` still reads as a literal.",
)

# S3 · Producer rows — the members become extra outputs on the producing Block.
# `out_1` is already a member id, so the composite keeps a distinct one.
_s3_outputs = [port("out_self", "self", "ObjectRecord")] + [
    port(pid, name, ptype) for pid, name, ptype, _ in MEMBERS
]
_s3_middle = [cable(f"c{i}") for i in range(4)]
_s3_bind: list[dict] = []
for _i, (_pid, _n, _t, _dst) in enumerate(MEMBERS):
    _s3_bind += wire(f"c{_i}", "record", _pid, "spec", _dst)
SPLITTER["splitter-s3"] = split_board(
    "s3", middle=_s3_middle, bindings=_s3_bind, record_outputs=_s3_outputs,
    spec_x=880, step_target="record",
    step="1 · No node between. The producer grew four extra output rows, one per member "
         "the body reads.",
    passes="PASS WHEN · the board has the fewest objects of any variant — and you check "
           "whether it still says WHERE in the program each read happened.",
)

# S4 · Consumer inlets — the accessor is written on the receiving port.
_s4_inputs = [
    port("in_1", "name ← .object_id", "str"),
    port("in_2", "type_name ← .subcategory", "str"),
    port("in_3", "shape ← .shape", "str"),
    port("in_4", "size ← .size_m", "Vec3"),
]
_s4_middle = [cable(f"c{i}") for i in range(4)]
_s4_bind: list[dict] = []
for _i, (_pid, _n, _t, _dst) in enumerate(MEMBERS):
    _s4_bind += wire(f"c{_i}", "record", "out_1", "spec", _dst)
SPLITTER["splitter-s4"] = split_board(
    "s4", middle=_s4_middle, bindings=_s4_bind, spec_x=900, spec_w=620,
    step_target="spec",
    step="1 · Four cables leave one output port; the accessor is written where each one "
         "lands. Nothing sits between the two Blocks.",
    passes="PASS WHEN · the fan-out is legal because every cable carries ObjectRecord — "
           "and you judge whether the consumer should own the accessor.",
)
# The consumer's inlets carry the accessors in this direction.
SPLITTER["splitter-s4"]["shapes"] = [
    dict(s, props={**s["props"], "inputs": _s4_inputs, "h": 250})
    if s.get("id") == "spec" else s
    for s in SPLITTER["splitter-s4"]["shapes"]
]

# S5 · Library definition — a per-type splitter authored once and linked.
_s5_all = [
    ("out_1", ".object_id", "str"), ("out_2", ".name", "str"),
    ("out_3", ".slug", "str"), ("out_4", ".category", "str"),
    ("out_5", ".subcategory", "str"), ("out_6", ".material", "str"),
    ("out_7", ".shape", "str"), ("out_8", ".size_m", "Vec3"),
]
_s5_middle = [
    block("split", 520, 290, 520, 430,
          title="split ObjectRecord", kind="library · all fields",
          icon="Package",
          inputs=[port("in_1", "record", "ObjectRecord")],
          outputs=[port(pid, name, ptype) for pid, name, ptype in _s5_all]),
    cable("c0"), cable("c1"), cable("c2"), cable("c3"), cable("c4"),
]
_s5_bind = wire("c0", "record", "out_1", "split", "in_1")
_s5_bind += wire("c1", "split", "out_1", "spec", "in_1")
_s5_bind += wire("c2", "split", "out_5", "spec", "in_2")
_s5_bind += wire("c3", "split", "out_7", "spec", "in_3")
_s5_bind += wire("c4", "split", "out_8", "spec", "in_4")
SPLITTER["splitter-s5"] = split_board(
    "s5", middle=_s5_middle, bindings=_s5_bind, step_target="split",
    step="1 · The splitter is a definition in the library, so it carries every field the "
         "type declares. Count the unwired rows.",
    passes="PASS WHEN · the block is reusable at every call site — and you see the cost: "
           "rows for members this body never reads, frozen at authoring time.",
)


def main() -> None:
    BOARDS.mkdir(parents=True, exist_ok=True)
    written = []
    for slug, recipe in {**OPACITY, **SPLITTER}.items():
        written.append(write(slug, recipe))
    for path in written:
        print(path.relative_to(ROOT))


if __name__ == "__main__":
    main()
