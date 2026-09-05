#!/usr/bin/env python3

"""
 Emit sketches/review/pre-reactor-lingua-franca.recipe.json and regenerate
 the .systemsketch through the real editor.

 The board is a teaching drawing of the Lingua Franca BT Pre reactor
 (Schulz-Rosengarten et al., ICSE 2024): backward channel communication is
 delayed one start-driven tick, never a solid reverse data cable.
"""

# BAM

# PYTHON


def main() -> None:
    import json
    import subprocess
    import sys
    from pathlib import Path

    root = Path(__file__).resolve().parents[1]
    boards = root / "sketches" / "review"
    slug = "pre-reactor-lingua-franca"
    recipe_path = boards / f"{slug}.recipe.json"
    output_path = boards / f"{slug}.systemsketch"
    helper = (
        root
        / "skills"
        / "systemsketch-review-fixture"
        / "scripts"
        / "create_fixture.mjs"
    )

    zinv = "z\u207b\u00b9"

    def port(pid: str, name: str, typ: str, **extra: object) -> dict:
        row = {"id": pid, "name": name, "type": typ, "visible": True}
        row.update(extra)
        return row

    def block(
        sid: str,
        parent: str,
        x: float,
        y: float,
        title: str,
        *,
        w: float = 300,
        h: float = 198,
        inputs: list | None = None,
        outputs: list | None = None,
        description: str = "",
        block_type: str = "call",
    ) -> dict:
        return {
            "id": sid,
            "type": "block",
            "x": x,
            "y": y,
            "parentId": parent,
            "props": {
                "title": title,
                "description": description,
                "blockType": block_type,
                "view": "port",
                "w": w,
                "h": h,
                "inputs": inputs or [],
                "outputs": outputs or [],
            },
        }

    def note(sid: str, parent: str, x: float, y: float, w: float, text: str) -> dict:
        return {
            "id": sid,
            "type": "text",
            "x": x,
            "y": y,
            "parentId": parent,
            "text": text,
            "props": {
                "size": "s",
                "color": "grey",
                "font": "sans",
                "w": w,
                "autoSize": False,
            },
        }

    def frame(sid: str, x: float, y: float, w: float, h: float, name: str) -> dict:
        return {
            "id": sid,
            "type": "frame",
            "x": x,
            "y": y,
            "props": {"name": name, "w": w, "h": h},
        }

    def cable(
        sid: str,
        parent: str,
        *,
        temporal: str = "data",
        delay_value: str = "",
        pill: float = 0.5,
        routing: str = "elbow",
        curve: dict | None = None,
    ) -> dict:
        authored = curve is not None
        return {
            "id": sid,
            "type": "connection",
            "x": 0,
            "y": 0,
            "parentId": parent,
            "props": {
                "start": {"x": 0, "y": 0},
                "end": {"x": 100, "y": 0},
                "routing": routing,
                "curve": curve,
                "pins": [],
                "elbowRoute": None,
                "temporal": temporal,
                "delayValue": delay_value,
                "pillPosition": pill,
                "tunnel": False,
                "tunnelLayer": "",
                "routeMode": "authored" if authored else "automatic",
                "state": "normal",
            },
        }

    def bind(sid: str, conn: str, block_id: str, port_id: str, terminal: str) -> dict:
        return {
            "id": sid,
            "type": "connection",
            "fromId": conn,
            "toId": block_id,
            "props": {
                "portId": port_id,
                "terminal": terminal,
                "face": "outer",
            },
        }

    # Layout: left rail for cards, one content column of frames.
    left = 40
    rail_w = 400
    content_x = 480
    content_w = 1580
    gap = 40

    legend_y = 24
    legend_h = 600
    a_y = legend_y + legend_h + gap
    a_h = 400
    b_y = a_y + a_h + gap
    b_h = 580
    c_y = b_y + b_h + gap
    c_h = 500
    d_y = c_y + c_h + gap
    d_h = 520

    viewport_w = content_x + content_w + 80 + 420
    viewport_h = d_y + d_h + 48

    shapes: list[dict] = []
    bindings: list[dict] = []

    shapes.append(
        frame(
            "legend",
            content_x,
            legend_y,
            content_w,
            legend_h,
            "Legend · four cables, four meanings",
        )
    )
    shapes.append(
        frame(
            "panel-a",
            content_x,
            a_y,
            content_w,
            a_h,
            "A · Forward, same tick · paper Fig. 7b",
        )
    )
    shapes.append(
        frame(
            "panel-b",
            content_x,
            b_y,
            content_w,
            b_h,
            f"B · Generated Pre reactor · paper Fig. 7d · the delay is this Block",
        )
    )
    shapes.append(
        frame(
            "panel-c",
            content_x,
            c_y,
            content_w,
            c_h,
            f"C · SystemSketch compact · Pre compiled onto a {zinv} cable",
        )
    )
    shapes.append(
        frame(
            "panel-d",
            content_x,
            d_y,
            content_w,
            d_h,
            "D · Not Pre · latest-value observation vs named write",
        )
    )

    # ----- legend: 2x2 so block titles stay unclipped -----
    # Title advance is ~21px/char plus ~88px chrome; 280px clears "setattr" / "observe".
    cell_w = 740
    cell_h = 270
    src_w, dst_w = 300, 280
    pair_h = 154
    # mut sits top-right so its effect stub goes up into the frame pad, not into another pair.
    legend_specs = (
        (0, 0, "leg-data", "Writer", "Reader", "x", "int", "data", False, "solid · within-tick value"),
        (1, 0, "leg-mut", "setattr", "apply", "state.camera", "Camera", "data", True, "mut · named write"),
        (0, 1, "leg-async", "camera", "observe", "frame", "Frame", "async", False, "dashed · latest published value"),
        (1, 1, "leg-delay", "Writer", "Reader", "x", "int", "delayed", False, f"{zinv} · previous tick only"),
    )
    for col, row, prefix, src_title, dst_title, pname, ptype, temporal, mutating, caption in legend_specs:
        px = 40 + col * cell_w
        py = 40 + row * cell_h
        src_y = py + (56 if mutating else 36)
        dst_y = py + (8 if mutating else 36)
        src_id = f"{prefix}-src"
        dst_id = f"{prefix}-dst"
        wire_id = f"{prefix}-wire"
        if mutating:
            shapes.append(
                block(
                    src_id,
                    "legend",
                    px,
                    src_y,
                    src_title,
                    w=src_w,
                    h=pair_h,
                    inputs=[port("in_1", pname, ptype, mutates=True)],
                    outputs=[
                        port("effect:in_1", pname, ptype, effect=True, edgeT=0.55),
                    ],
                )
            )
            shapes.append(
                block(
                    dst_id,
                    "legend",
                    px + src_w + 140,
                    dst_y,
                    dst_title,
                    w=dst_w,
                    h=pair_h,
                    inputs=[port("in_1", pname, ptype)],
                )
            )
        else:
            shapes.append(
                block(
                    src_id,
                    "legend",
                    px,
                    src_y,
                    src_title,
                    w=src_w,
                    h=pair_h,
                    outputs=[port("out_1", pname, ptype)],
                )
            )
            shapes.append(
                block(
                    dst_id,
                    "legend",
                    px + src_w + 140,
                    dst_y,
                    dst_title,
                    w=dst_w,
                    h=pair_h,
                    inputs=[port("in_1", pname, ptype)],
                )
            )
        if temporal == "delayed":
            shapes.append(
                cable(
                    wire_id,
                    "legend",
                    temporal=temporal,
                    pill=0.5,
                    routing="curved",
                    curve={"dx": 0, "dy": 28},
                )
            )
        else:
            shapes.append(cable(wire_id, "legend", temporal=temporal, pill=0.55))
        src_port = "effect:in_1" if mutating else "out_1"
        bindings.extend(
            [
                bind(f"{wire_id}-s", wire_id, src_id, src_port, "start"),
                bind(f"{wire_id}-e", wire_id, dst_id, "in_1", "end"),
            ]
        )
        shapes.append(
            note(
                f"{prefix}-cap",
                "legend",
                px,
                py + 228,
                cell_w - 24,
                caption,
            )
        )

    # ----- A: forward, Writer then Reader, solid x -----
    shapes.append(
        note(
            "a-cap",
            "panel-a",
            48,
            16,
            1480,
            "Reader sits after Writer in the sequence. x is produced and consumed at the same start tick, same LF tag. Solid data cable. No Pre.",
        )
    )
    shapes.append(
        block(
            "a-tick",
            "panel-a",
            56,
            120,
            "tick()",
            w=240,
            h=154,
            outputs=[port("out_1", "start", "Tick")],
            block_type="source",
        )
    )
    shapes.append(
        block(
            "a-writer",
            "panel-a",
            400,
            120,
            "Writer",
            w=340,
            h=198,
            inputs=[port("in_1", "start", "Tick")],
            outputs=[
                port("out_1", "success", "Status"),
                port("out_2", "x", "int"),
            ],
            description="x.set(42)",
        )
    )
    shapes.append(
        block(
            "a-reader",
            "panel-a",
            860,
            120,
            "Reader",
            w=340,
            h=198,
            inputs=[
                port("in_1", "start", "Tick"),
                port("in_2", "x", "int"),
            ],
            outputs=[port("out_1", "success", "Status")],
            description="print(x) if present",
        )
    )
    for cid, temporal in (
        ("a-start", "data"),
        ("a-success", "data"),
        ("a-x", "data"),
    ):
        shapes.append(cable(cid, "panel-a", temporal=temporal))
    bindings.extend(
        [
            bind("a-start-s", "a-start", "a-tick", "out_1", "start"),
            bind("a-start-e", "a-start", "a-writer", "in_1", "end"),
            bind("a-success-s", "a-success", "a-writer", "out_1", "start"),
            bind("a-success-e", "a-success", "a-reader", "in_1", "end"),
            bind("a-x-s", "a-x", "a-writer", "out_2", "start"),
            bind("a-x-e", "a-x", "a-reader", "in_2", "end"),
        ]
    )

    # ----- B: Pre reactor (paper Fig. 7d) -----
    shapes.append(
        note(
            "b-cap",
            "panel-b",
            420,
            16,
            1100,
            f"Reader runs before Writer, so this tick cannot see this tick's x. "
            f"A solid Writer.x \u2192 Reader.x would be a causality cycle. "
            f"Pre stores the write and re-emits it on the next start. "
            f"Wires around Pre are ordinary this-tick data; {zinv} lives in the Block.",
        )
    )
    shapes.append(
        block(
            "b-tick",
            "panel-b",
            56,
            48,
            "tick()",
            w=240,
            h=154,
            outputs=[port("out_1", "start", "Tick")],
            block_type="source",
        )
    )
    shapes.append(
        block(
            "b-pre",
            "panel-b",
            56,
            280,
            "Pre",
            w=340,
            h=198,
            inputs=[
                port("in_1", "start", "Tick"),
                port("in_2", "x", "int"),
            ],
            outputs=[port("out_1", "x", "int")],
            description=f"{zinv} until next start",
        )
    )
    shapes.append(
        block(
            "b-reader",
            "panel-b",
            520,
            280,
            "Reader",
            w=340,
            h=198,
            inputs=[
                port("in_1", "start", "Tick"),
                port("in_2", "x", "int"),
            ],
            outputs=[port("out_1", "success", "Status")],
            description="print previous x",
        )
    )
    shapes.append(
        block(
            "b-writer",
            "panel-b",
            1000,
            280,
            "Writer",
            w=340,
            h=198,
            inputs=[port("in_1", "start", "Tick")],
            outputs=[
                port("out_1", "success", "Status"),
                port("out_2", "x", "int"),
            ],
            description="x.set(42)",
        )
    )
    shapes.append(
        note(
            "b-timeline",
            "panel-b",
            420,
            88,
            1100,
            "tick t: start \u2192 Pre emits x[t-1] (absent on the first tick) \u2192 Reader \u2192 Writer writes 42 \u2192 Pre stores 42.\n"
            "tick t+1: start \u2192 Pre emits 42 \u2192 Reader prints 42. Forward writers on the same tick still override this stored value.",
        )
    )
    for cid in (
        "b-start-reader",
        "b-start-pre",
        "b-success",
        "b-emit",
    ):
        shapes.append(cable(cid, "panel-b", temporal="data"))
    shapes.append(
        cable(
            "b-store",
            "panel-b",
            temporal="data",
            routing="curved",
            curve={"dx": 0, "dy": 90},
        )
    )
    bindings.extend(
        [
            bind("b-start-reader-s", "b-start-reader", "b-tick", "out_1", "start"),
            bind("b-start-reader-e", "b-start-reader", "b-reader", "in_1", "end"),
            bind("b-start-pre-s", "b-start-pre", "b-tick", "out_1", "start"),
            bind("b-start-pre-e", "b-start-pre", "b-pre", "in_1", "end"),
            bind("b-success-s", "b-success", "b-reader", "out_1", "start"),
            bind("b-success-e", "b-success", "b-writer", "in_1", "end"),
            bind("b-store-s", "b-store", "b-writer", "out_2", "start"),
            bind("b-store-e", "b-store", "b-pre", "in_2", "end"),
            bind("b-emit-s", "b-emit", "b-pre", "out_1", "start"),
            bind("b-emit-e", "b-emit", "b-reader", "in_2", "end"),
        ]
    )

    # ----- C: compact z^{-1} cable -----
    shapes.append(
        note(
            "c-cap",
            "panel-c",
            48,
            16,
            1480,
            f"Same graph, Pre compiled away. The back edge is Temporal \u2192 Delayed. "
            f"Dotted cable + {zinv} pill. Still not a solid backward data cable. "
            f"Use this when the tick is already a Loop iteration; keep an explicit Pre Block when the tick is an external start.",
        )
    )
    shapes.append(
        block(
            "c-tick",
            "panel-c",
            56,
            160,
            "tick()",
            w=240,
            h=154,
            outputs=[port("out_1", "start", "Tick")],
            block_type="source",
        )
    )
    shapes.append(
        block(
            "c-reader",
            "panel-c",
            400,
            140,
            "Reader",
            w=340,
            h=198,
            inputs=[
                port("in_1", "start", "Tick"),
                port("in_2", "x", "int"),
            ],
            outputs=[port("out_1", "success", "Status")],
        )
    )
    shapes.append(
        block(
            "c-writer",
            "panel-c",
            900,
            140,
            "Writer",
            w=340,
            h=198,
            inputs=[port("in_1", "start", "Tick")],
            outputs=[
                port("out_1", "success", "Status"),
                port("out_2", "x", "int"),
            ],
        )
    )
    shapes.append(cable("c-start", "panel-c", temporal="data"))
    shapes.append(cable("c-success", "panel-c", temporal="data"))
    shapes.append(
        cable(
            "c-back",
            "panel-c",
            temporal="delayed",
            pill=0.5,
            routing="curved",
            curve={"dx": 0, "dy": 120},
        )
    )
    bindings.extend(
        [
            bind("c-start-s", "c-start", "c-tick", "out_1", "start"),
            bind("c-start-e", "c-start", "c-reader", "in_1", "end"),
            bind("c-success-s", "c-success", "c-reader", "out_1", "start"),
            bind("c-success-e", "c-success", "c-writer", "in_1", "end"),
            bind("c-back-s", "c-back", "c-writer", "out_2", "start"),
            bind("c-back-e", "c-back", "c-reader", "in_2", "end"),
        ]
    )

    # ----- D: async observation vs named write -----
    shapes.append(
        note(
            "d-async-cap",
            "panel-d",
            48,
            16,
            480,
            "Dashed async: observe whatever camera last published. No promise it is this Writer's previous x, and no start-gated store.",
        )
    )
    shapes.append(
        block(
            "d-camera",
            "panel-d",
            48,
            160,
            "camera",
            w=280,
            h=154,
            outputs=[port("out_1", "frame", "Frame")],
            block_type="source",
        )
    )
    shapes.append(
        block(
            "d-observe",
            "panel-d",
            400,
            160,
            "observe",
            w=280,
            h=154,
            inputs=[port("in_1", "frame", "Frame")],
        )
    )
    shapes.append(cable("d-async", "panel-d", temporal="async"))
    bindings.extend(
        [
            bind("d-async-s", "d-async", "d-camera", "out_1", "start"),
            bind("d-async-e", "d-async", "d-observe", "in_1", "end"),
        ]
    )

    shapes.append(
        note(
            "d-mut-cap",
            "panel-d",
            720,
            16,
            480,
            "mut cable: a named write to state.camera. The new value exists because of the assignment, not because time stepped.",
        )
    )
    shapes.append(
        block(
            "d-write",
            "panel-d",
            720,
            200,
            "setattr",
            w=320,
            h=198,
            inputs=[port("in_1", "state", "State", mutates=True)],
            outputs=[
                port(
                    "effect:in_1",
                    "state.camera",
                    "Camera",
                    effect=True,
                    edgeT=0.62,
                )
            ],
        )
    )
    shapes.append(
        block(
            "d-apply",
            "panel-d",
            1120,
            88,
            "apply()",
            w=260,
            h=154,
            inputs=[port("in_1", "state.camera", "Camera")],
        )
    )
    shapes.append(cable("d-mut", "panel-d", temporal="data"))
    bindings.extend(
        [
            bind("d-mut-s", "d-mut", "d-write", "effect:in_1", "start"),
            bind("d-mut-e", "d-mut", "d-apply", "in_1", "end"),
        ]
    )

    shapes.append(
        note(
            "d-rule-cap",
            "panel-d",
            48,
            430,
            1480,
            f"Neither dashed observation nor a mut write is a time machine. Only Pre / {zinv} may go backwards in time.",
        )
    )

    callouts = [
        {
            "id": "intro",
            "kind": "note",
            "text": "Lingua Franca BT paper (ICSE 2024): a Reader before a Writer on channel x cannot take a same-tick cable. The compiler inserts Pre, gated by start, because BT ticks are not a fixed after delay.",
            "x": left,
            "y": 24,
            "w": rail_w,
            "h": 220,
        },
        {
            "id": "step-1",
            "kind": "step",
            "text": f"1 \u00b7 Select Pre. Store this tick's x; emit it when start fires again. Output x is ordinary this-tick data. {zinv} is the Block, not a backward cable.",
            "x": left,
            "y": b_y + 40,
            "w": rail_w,
            "h": 200,
            "target": {"shapeId": "b-pre", "anchor": "left", "dy": -50},
        },
        {
            "id": "step-2",
            "kind": "note",
            "text": f"C's back edge is Temporal \u2192 Delayed: dotted cable + {zinv} pill. Same Pre semantics on the edge. Never a solid reverse data cable.",
            "x": content_x + content_w + 80,
            "y": c_y + 80,
            "w": 400,
            "h": 180,
        },
        {
            "id": "pass",
            "kind": "pass",
            "text": f"PASS WHEN the legend's four cables are distinct, Pre has no solid reverse data cable, C's back edge is dotted with a {zinv} pill, and D's dashed / mut cables are clearly not delay.",
            "x": left,
            "y": d_y + 40,
            "w": rail_w,
            "h": 220,
        },
    ]

    recipe = {
        "feature": "Pre reactor · Lingua Franca BT in SystemSketch",
        "viewport": {"width": viewport_w, "height": viewport_h},
        "pages": [{"id": "review", "name": "Pre reactor"}],
        "shapes": shapes,
        "bindings": bindings,
        "callouts": callouts,
    }

    recipe_path.write_text(json.dumps(recipe, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {recipe_path}")

    cmd = [
        "node",
        str(helper),
        "--recipe",
        str(recipe_path),
        "--output",
        str(output_path),
        "--force",
    ]
    print("running", " ".join(cmd))
    result = subprocess.run(cmd, cwd=root)
    if result.returncode != 0:
        sys.exit(result.returncode)
    print(f"wrote {output_path}")


if __name__ == "__main__":
    main()
