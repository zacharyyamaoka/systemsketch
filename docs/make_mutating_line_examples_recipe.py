#!/usr/bin/env python3

"""
 Emit `sketches/review/mutating-line-examples.recipe.json` and regenerate
 `sketches/review/mutating-line-examples.systemsketch` through the real editor.

 The 30 blocks' content (titles, ports, wiring) comes from the board an
 independent auditor reviewed on 2026-09-03 (`docs/mutating-line-review-2026-09-03.html`).
 That review found the *content* correct and the *layout* broken. Round 1 of the
 critique→fix loop rebuilt framing, unique titles, and a legend. Round 2 then
 found a tighter cluster: cables striking captions and ordinal chips, `mut`
 pills bisected by a *different* cable, nested port labels buried under
 children, captions sharing a row Y, hard-wrapped stub lines, and a legend
 location that disagreed with the intro card.

 This script is that generator, extended in place for round 3. It never
 hand-writes tldraw schema. Run it directly:

     python3 docs/make_mutating_line_examples_recipe.py
"""

from __future__ import annotations

# BAM

# PYTHON
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BOARDS = ROOT / "sketches" / "review"
SLUG = "mutating-line-examples"
RECIPE_PATH = BOARDS / f"{SLUG}.recipe.json"
OUTPUT_PATH = BOARDS / f"{SLUG}.systemsketch"

# --------------------------------------------------------------- sizing math
#
# Block width is author-chosen (`layoutBlock.ts` reads `finiteDimension(props.w)`).
TITLE_CHAR_PX = 20.9
TITLE_PAD_PX = 88
SIMPLE_TITLE_CHAR_PX = 44 * 0.58
PORT_ROW_PAD_PX = 60
MIN_MAIN_WIDTH = 320
MIN_COMPANION_WIDTH = 280

BODY_TOP_PX = 48 + 8
ROW_PITCH_PX = 44
FOOTER_PX = 46
HEIGHT_SLACK_PX = 12

GUTTER_X = 100
FRAME_PAD = 48
FRAME_GUTTER = 96
COLUMN_GUTTER = 120
# Left slot so an ordinal chip never sits in the ~24px effect-cable stub that
# leaves a top-edge port (DEFAULT_ELBOW_OPTIONS.padding). Round 2 measured
# cables through chips 01, 09, and 13; those chips were 34px above the block.
ORDINAL_COL_W = 88
# Gap between a primary and the companions that read it. Wide enough for a
# sub-label plus an elbow corridor (padding 24 on each obstacle).
COMPANION_GUTTER = 120
SUBLABEL_H = 22

NOTE_WIDTH = 320
NOTE_GAP_Y = 28
NOTE_LINE_PX = 22
# Matches skills/.../layout_quality.mjs estimatedWrappedLines, used only to
# reserve vertical space. The text shape itself is `autoSize: false` with a
# fixed `w`, so tldraw wraps — we do not insert `\n` at a guessed column.
NOTE_WRAP_PAD = 44
NOTE_WRAP_CHAR_PX = 10

TOP_MARGIN = 48
BOTTOM_MARGIN = 64
TITLE_HEIGHT = 56
TITLE_GAP = 24
TOPCARD_GAP = 56  # includes the Frame name-label that paints above the frame

# Expanded children must clear the parent's left-edge port-label column.
# Expanded ports are *vertically centred in the body* (`placeExpandedBody`), so
# extra top-inset alone just moves the port down with the child. The auditor's
# elementFromPoint failures (`run_outer.poses` under `append_inner`, and the
# same on both nest parents) are a left-overlap. 168px clears
# PORT_LABEL_INSET (12) + "poses" + gap + "list[Pose]" at the label font.
# A modest extra top inset still keeps the child out of the 48px header.
EXPANDED_SIDE_PAD = 168
EXPANDED_RIGHT_PAD = 40
EXPANDED_HEADER = 48 + 8 + 16  # header + row gap + slack, not a port-row
EXPANDED_BOTTOM_PAD = 50

# Keep the combined-pill phrase one wrap atom so tldraw cannot split `z⁻¹`.
PILL_DELAY = "mut\u00a0z⁻¹\u00a0=\u00a01.0"


def title_width(title: str, *, simple: bool = False) -> float:
	px = SIMPLE_TITLE_CHAR_PX if simple else TITLE_CHAR_PX
	return len(title) * px + TITLE_PAD_PX


def port_row_width(name: str, ptype: str) -> float:
	return len(name) * TITLE_CHAR_PX + len(ptype) * TITLE_CHAR_PX + PORT_ROW_PAD_PX


def block_size(title: str, inputs: list[dict], outputs: list[dict], *,
				minimum: float = MIN_MAIN_WIDTH, simple: bool = False) -> tuple[int, int]:
	rows = inputs + outputs
	widest_row = max((port_row_width(p["name"], p["type"]) for p in rows), default=0)
	w = round(max(minimum, title_width(title, simple=simple), widest_row))
	if simple:
		h = 206
	else:
		real_outputs = [o for o in outputs if not o.get("effect")]
		row_count = max(len(inputs), len(real_outputs), 1)
		h = round(BODY_TOP_PX + row_count * ROW_PITCH_PX + FOOTER_PX + HEIGHT_SLACK_PX)
	return w, h


def wrapped_line_count(text: str, width: int = NOTE_WIDTH) -> int:
	chars_per_line = max(16, (width - NOTE_WRAP_PAD) // NOTE_WRAP_CHAR_PX)
	lines = 0
	for paragraph in text.split("\n"):
		lines += 1
		used = 0
		for word in paragraph.split(" "):
			if not word:
				continue
			length = min(len(word), chars_per_line)
			if used == 0:
				used = length
			elif used + 1 + length <= chars_per_line:
				used += 1 + length
			else:
				lines += 1
				used = length
	return max(1, lines)


def note_height(text: str, width: int = NOTE_WIDTH) -> int:
	return max(40, wrapped_line_count(text, width) * NOTE_LINE_PX + 10)


# ------------------------------------------------------------- shape helpers


def port(pid: str, name: str, ptype: str, *, mutates: bool = False,
		 effect: bool = False, edge_t: float | None = None, row: int | None = None) -> dict:
	p: dict = {"id": pid, "name": name, "type": ptype, "visible": True}
	if mutates:
		p["mutates"] = True
	if effect:
		p["effect"] = True
	if edge_t is not None:
		p["edgeT"] = edge_t
	if row is not None:
		p["row"] = row
	return p


def block(bid: str, x: int, y: int, *, title: str, inputs: list[dict], outputs: list[dict],
		  view: str = "port", parent: str | None = None, w: int | None = None,
		  h: int | None = None, minimum: float = MIN_MAIN_WIDTH) -> dict:
	if w is None or h is None:
		computed_w, computed_h = block_size(title, inputs, outputs, minimum=minimum,
											 simple=(view == "simple"))
		w = w if w is not None else computed_w
		h = h if h is not None else computed_h
	shape = {
		"id": bid,
		"type": "block",
		"x": x,
		"y": y,
		"props": {
			"title": title,
			"description": "",
			"blockType": "call",
			"view": view,
			"w": w,
			"h": h,
			"inputs": inputs,
			"outputs": outputs,
		},
	}
	if parent:
		shape["parentId"] = parent
	return shape


def frame(fid: str, x: int, y: int, w: int, h: int, *, name: str, scope_host: bool = False) -> dict:
	"""A stock Frame. `scope_host=True` stamps `meta.systemSketch.kind =
	'imported-page'` so cables inside the frame composite into it rather than
	painting behind its fill. App-level fix for plain Frames is tracked
	separately; this script only authors a recipe.
	"""
	shape: dict = {"id": fid, "type": "frame", "x": x, "y": y, "props": {"name": name, "w": w, "h": h}}
	if scope_host:
		shape["meta"] = {"systemSketch": {
			"kind": "imported-page", "sourcePageId": fid, "sourcePageName": name, "sourcePageIndex": "0",
		}}
	return shape


def text(tid: str, x: int, y: int, body: str, *, size: str = "s", parent: str | None = None,
		 color: str = "black", width: int | None = None) -> dict:
	props: dict = {"size": size, "color": color, "font": "sans"}
	if width is not None:
		# Fixed box, editor wraps at word boundaries. No author-inserted `\n`.
		props["w"] = width
		props["autoSize"] = False
	shape = {"id": tid, "type": "text", "x": x, "y": y, "text": body, "props": props}
	if parent:
		shape["parentId"] = parent
	return shape


def ordinal(tid: str, x: int, y: int, n: int | str, *, parent: str | None = None) -> dict:
	return text(tid, x, y, str(n), size="m", parent=parent, color="orange")


def note(tid: str, x: int, y: int, body: str, *, parent: str | None = None,
		 width: int = NOTE_WIDTH) -> dict:
	return text(tid, x, y, body, size="s", parent=parent, width=width)


def cable(cid: str, *, temporal: str = "data", delay_value: str = "",
		  pill_position: float = 0.5) -> dict:
	return {
		"id": cid, "type": "connection", "x": 0, "y": 0,
		"props": {
			"start": {"x": 0, "y": 0}, "end": {"x": 100, "y": 0},
			"routing": "elbow", "curve": None, "pins": [], "elbowRoute": None,
			"temporal": temporal, "delayValue": delay_value, "pillPosition": pill_position,
			"tunnel": False, "tunnelLayer": "", "routeMode": "automatic", "state": "normal",
		},
	}


def wire(cid: str, from_id: str, from_port: str, to_id: str, to_port: str) -> list[dict]:
	return [
		{"type": "connection", "fromId": cid, "toId": from_id,
		 "props": {"portId": from_port, "terminal": "start", "face": "outer"}},
		{"type": "connection", "fromId": cid, "toId": to_id,
		 "props": {"portId": to_port, "terminal": "end", "face": "outer"}},
	]


# ------------------------------------------------------------------ layout


def layout_example_row(specs: list[dict], notes: dict[str, str], companions: dict[str, list[dict]],
					   numbers: dict[str, int], x0: int = 0, y0: int = 0
					   ) -> tuple[list[dict], dict, int, int]:
	"""One difficulty-row: top-aligned primaries, companions to the RIGHT of
	their primary (never under the caption), notes under each column's own
	bottom, ordinals in a reserved left slot so they sit off the effect-cable
	stub corridor.

	Round 2 measured `wire-9a` striking `note-r2c0` because companions were
	stacked *below* the note, forcing the return cable through it; and chips
	01/09/13 struck because they sat in the 24px top-edge stub. Both go away
	when the cable's destination is beside the block and the chip is not above
	the port.
	"""
	shapes: list[dict] = []
	positions: dict[str, tuple[int, int, int, int]] = {}
	x = x0
	band_bottom = y0
	band_right = x0

	for spec in specs:
		pw, ph = block_size(spec["title"], spec["inputs"], spec["outputs"],
							 minimum=spec.get("minimum", MIN_MAIN_WIDTH),
							 simple=(spec.get("view", "port") == "simple"))
		comps = companions.get(spec["id"], [])
		sized_comps = [
			(comp, *block_size(comp["title"], comp["inputs"], comp["outputs"],
								minimum=MIN_COMPANION_WIDTH))
			for comp in comps
		]
		primary_x = x + ORDINAL_COL_W
		primary_y = y0
		n = numbers[spec["id"]]
		shapes.append(ordinal(f"ord-{spec['id']}", x, primary_y, n))
		shapes.append(block(spec["id"], primary_x, primary_y, title=spec["title"],
							 inputs=spec["inputs"], outputs=spec["outputs"],
							 view=spec.get("view", "port"), w=pw, h=ph))
		positions[spec["id"]] = (primary_x, primary_y, pw, ph)

		comp_x = primary_x + pw + COMPANION_GUTTER
		col_right = primary_x + pw
		right_bottom = primary_y + ph
		below_bottom = primary_y + ph
		if sized_comps:
			# First companion sits to the RIGHT (return cables go horizontally
			# and never cross the caption). Any further companion sits BELOW
			# the primary, so a second effect cable gets a downward corridor
			# of its own instead of sharing the right-hand lane — that shared
			# lane is what still bisected wire-13b's mut pill after stagger.
			first, fw, fh = sized_comps[0]
			shapes.append(text(f"sub-{first['id']}", comp_x, primary_y, f"{n}b",
								 size="s", color="orange"))
			shapes.append(block(first["id"], comp_x, primary_y + SUBLABEL_H, title=first["title"],
								 inputs=first["inputs"], outputs=first["outputs"], w=fw, h=fh))
			positions[first["id"]] = (comp_x, primary_y + SUBLABEL_H, fw, fh)
			col_right = max(col_right, comp_x + fw)
			right_bottom = primary_y + SUBLABEL_H + fh
			cursor_y = primary_y + ph + NOTE_GAP_Y
			for i, (comp, cw, ch) in enumerate(sized_comps[1:]):
				suffix = chr(ord("c") + i)
				shapes.append(text(f"sub-{comp['id']}", primary_x, cursor_y, f"{n}{suffix}",
									 size="s", color="orange"))
				by = cursor_y + SUBLABEL_H
				shapes.append(block(comp["id"], primary_x, by, title=comp["title"],
									 inputs=comp["inputs"], outputs=comp["outputs"],
									 w=cw, h=ch))
				positions[comp["id"]] = (primary_x, by, cw, ch)
				col_right = max(col_right, primary_x + cw)
				cursor_y = by + ch + NOTE_GAP_Y
			below_bottom = cursor_y - NOTE_GAP_Y if len(sized_comps) > 1 else primary_y + ph
		block_band_h = max(right_bottom, below_bottom) - y0

		note_text = notes.get(spec["id"])
		if note_text:
			note_y = y0 + block_band_h + NOTE_GAP_Y
			shapes.append(note(f"note-{spec['id']}", primary_x, note_y, note_text))
			band_bottom = max(band_bottom, note_y + note_height(note_text))
		else:
			band_bottom = max(band_bottom, y0 + block_band_h)
		band_right = max(band_right, col_right)
		side_w = (COMPANION_GUTTER + sized_comps[0][1]) if sized_comps else 0
		col_w = ORDINAL_COL_W + pw + side_w
		x += col_w + GUTTER_X

	row_w = band_right - x0
	row_h = band_bottom - y0
	return shapes, positions, round(row_w), round(row_h)


def shift_and_parent(shapes: list[dict], dx: int, dy: int, parent_id: str) -> None:
	for shape in shapes:
		if "parentId" not in shape:
			shape["x"] += dx
			shape["y"] += dy
			shape["parentId"] = parent_id


def wrap_tier(tier_id: str, name: str, content: tuple[list[dict], list[dict], int, int],
			  macro_x: int, macro_y: int) -> tuple[dict, list[dict], list[dict], int, int]:
	shapes, bindings, content_w, content_h = content
	dx = FRAME_PAD
	dy = FRAME_PAD
	shift_and_parent(shapes, dx, dy, tier_id)
	w = round(content_w + FRAME_PAD * 2)
	h = round(content_h + dy + FRAME_PAD)
	fr = frame(tier_id, macro_x, macro_y, w, h, name=name, scope_host=True)
	return fr, shapes, bindings, w, h


# ------------------------------------------------------------------ content


def easy_single_arg() -> tuple[list[dict], dict, dict, dict]:
	specs = [
		dict(id="r0c0", title="poses.append",
			 inputs=[port("in_1", "poses", "list[Pose]", mutates=True), port("in_2", "pose", "Pose")],
			 outputs=[port("effect:in_1", "poses", "list[Pose]", effect=True, edge_t=0.5)]),
		dict(id="r0c1", title="cache.update",
			 inputs=[port("in_1", "cache", "dict", mutates=True), port("in_2", "patch", "dict")],
			 outputs=[port("effect:in_1", "cache", "dict", effect=True, edge_t=0.5)]),
		dict(id="r0c2", title="seen.add",
			 inputs=[port("in_1", "seen", "set", mutates=True), port("in_2", "item", "Any")],
			 outputs=[port("effect:in_1", "seen", "set", effect=True, edge_t=0.5)]),
		dict(id="r0c3", title="buffer.extend",
			 inputs=[port("in_1", "buffer", "list[int]", mutates=True), port("in_2", "chunk", "list[int]")],
			 outputs=[port("effect:in_1", "buffer", "list[int]", effect=True, edge_t=0.5)]),
	]
	notes = {
		"r0c0": "The base case: a hook, an effect port, one tether.",
		"r0c1": "Same shape, a dict this time.",
		"r0c2": "A set. Adding still mutates with no return.",
		"r0c3": "extend copies elements in; the argument still just mutates.",
	}
	companions = {
		"r0c0": [dict(id="len_consumer", title="len(poses)",
					  inputs=[port("in_1", "poses", "list[Pose]")],
					  outputs=[port("out_1", "count", "int")])],
	}
	numbers = {"r0c0": 1, "r0c1": 2, "r0c2": 3, "r0c3": 4}
	return specs, notes, companions, numbers


def easy_reordering() -> tuple[list[dict], dict, dict, dict]:
	specs = [
		dict(id="r1c0", title="items.sort",
			 inputs=[port("in_1", "items", "list[int]", mutates=True)],
			 outputs=[port("effect:in_1", "items", "list[int]", effect=True, edge_t=0.5)]),
		dict(id="r1c1", title="items.reverse",
			 inputs=[port("in_1", "items", "list[int]", mutates=True)],
			 outputs=[port("effect:in_1", "items", "list[int]", effect=True, edge_t=0.5)]),
		dict(id="r1c2", title="stack.insert",
			 inputs=[port("in_1", "stack", "list", mutates=True), port("in_2", "index", "int"),
					 port("in_3", "item", "Any")],
			 outputs=[port("effect:in_1", "stack", "list", effect=True, edge_t=0.5)]),
		dict(id="r1c3", title="queue.clear",
			 inputs=[port("in_1", "queue", "list", mutates=True)],
			 outputs=[port("effect:in_1", "queue", "list", effect=True, edge_t=0.5)]),
	]
	notes = {
		"r1c0": "In-place reordering: no new list, no return, just the hook.",
		"r1c1": "Same idea, cheaper: reverses the list in place.",
		"r1c2": "Two ordinary args plus the one that mutates.",
		"r1c3": "The extreme case: every element leaves, none return.",
	}
	numbers = {"r1c0": 5, "r1c1": 6, "r1c2": 7, "r1c3": 8}
	return specs, notes, {}, numbers


def medium_returns_and_mutates() -> tuple[list[dict], dict, dict, dict]:
	specs = [
		dict(id="r2c0", title="pending.pop",
			 inputs=[port("in_1", "pending", "list", mutates=True)],
			 outputs=[port("out_1", "item", "Any"),
					  port("effect:in_1", "pending", "list", effect=True, edge_t=0.5)]),
		dict(id="r2c1", title="table.pop",
			 inputs=[port("in_1", "table", "dict", mutates=True), port("in_2", "key", "str")],
			 outputs=[port("out_1", "value", "Any"),
					  port("effect:in_1", "table", "dict", effect=True, edge_t=0.5)]),
		dict(id="r2c2", title="table.setdefault",
			 inputs=[port("in_1", "table", "dict", mutates=True), port("in_2", "key", "str"),
					 port("in_3", "default", "Any")],
			 outputs=[port("out_1", "value", "Any"),
					  port("effect:in_1", "table", "dict", effect=True, edge_t=0.5)]),
		dict(id="r2c3", title="queue.popleft",
			 inputs=[port("in_1", "queue", "deque", mutates=True)],
			 outputs=[port("out_1", "item", "Any"),
					  port("effect:in_1", "queue", "deque", effect=True, edge_t=0.5)]),
	]
	notes = {
		"r2c0": "A real output AND an effect port, wired to two different consumers.",
		"r2c1": "Same split as pop() above, keyed by name instead of position.",
		"r2c2": "Three inputs, a real return, and an effect port: the busiest header here.",
		"r2c3": "A deque's own pop: value and effect, front instead of back.",
	}
	companions = {
		"r2c0": [
			dict(id="use_item", title="use", inputs=[port("in_1", "item", "Any")], outputs=[]),
			dict(id="len_after_pop", title="len(pending)", inputs=[port("in_1", "pending", "list")],
				 outputs=[port("out_1", "n", "int")]),
		],
	}
	numbers = {"r2c0": 9, "r2c1": 10, "r2c2": 11, "r2c3": 12}
	return specs, notes, companions, numbers


def medium_hard_receiver() -> tuple[list[dict], dict, dict, dict]:
	specs = [
		dict(id="r3c0", title="swap",
			 inputs=[port("in_1", "a", "list", mutates=True), port("in_2", "b", "list", mutates=True)],
			 outputs=[port("effect:in_1", "a", "list", effect=True, edge_t=0.82),
					  port("effect:in_2", "b", "list", effect=True, edge_t=0.18)]),
		dict(id="r3c1", title="reconcile",
			 inputs=[port("in_1", "primary", "Cache", mutates=True), port("in_2", "backup", "Cache", mutates=True),
					 port("in_3", "preview", "Image", mutates=True)],
			 outputs=[port("effect:in_1", "primary", "Cache", effect=True, edge_t=0.25),
					  port("effect:in_2", "backup", "Cache", effect=True, edge_t=0.5),
					  port("effect:in_3", "preview", "Image", effect=True, edge_t=0.75)]),
		dict(id="r3c2", title="counter.update",
			 inputs=[port("in_self", "self", "Counter", mutates=True, row=0), port("in_2", "other", "Counter")],
			 outputs=[port("effect:in_self", "self", "Counter", effect=True, edge_t=0.5)]),
		dict(id="r3c3", title="tracker.record",
			 inputs=[port("in_self", "self", "Tracker", mutates=True, row=0), port("in_2", "event", "Event")],
			 outputs=[port("effect:in_self", "self", "Tracker", effect=True, edge_t=0.5)]),
	]
	notes = {
		"r3c0": "a's port sits right, b's sits left, reversed from argument order, so the tethers cross on purpose.",
		"r3c1": "Three mutated arguments, three effect ports on one top edge.",
		"r3c2": "self mutates like any other argument; the receiver isn't special.",
		"r3c3": "Same receiver pattern, a different shape of state.",
	}
	companions = {
		"r3c0": [
			dict(id="show_a", title="show(a)", inputs=[port("in_1", "a", "list")], outputs=[]),
			dict(id="show_b", title="show(b)", inputs=[port("in_1", "b", "list")], outputs=[]),
		],
	}
	numbers = {"r3c0": 13, "r3c1": 14, "r3c2": 15, "r3c3": 16}
	return specs, notes, companions, numbers


def expanded_block(bid: str, title: str, inputs: list[dict], outputs: list[dict],
					child_w: int, child_h: int) -> tuple[dict, int, int]:
	w = round(max(title_width(title), child_w + EXPANDED_SIDE_PAD + EXPANDED_RIGHT_PAD))
	h = round(EXPANDED_HEADER + child_h + EXPANDED_BOTTOM_PAD)
	return block(bid, 0, 0, title=title, inputs=inputs, outputs=outputs, view="expanded",
				 w=w, h=h), w, h


def hard_tier() -> tuple[list[dict], list[dict], int, int]:
	"""Examples 17–20: nesting, the combined pill, Simple vs Port.

	Captions sit on each column's own bottom (round-2 item 4: 17 is 362 tall,
	18 is 522, and a shared caption Y printed 18's note on top of nest_outer).
	Children start at EXPANDED_SIDE_PAD so the parent's left port labels stay
	hittable. Ordinals live in the left slot, and 20's chip sits above its
	Simple/Port labels.
	"""
	shapes: list[dict] = []
	bindings: list[dict] = []
	intra = 80

	# --- 17: run() expanded, containing append (inner) ---
	append_inner_ports = ([port("in_1", "poses", "list[Pose]", mutates=True), port("in_2", "pose", "Pose")],
						   [port("effect:in_1", "poses", "list[Pose]", effect=True, edge_t=0.5)])
	append_inner_w, append_inner_h = block_size("append (inner)", *append_inner_ports)
	run_outer, run_outer_w, run_outer_h = expanded_block(
		"run_outer", "run() — expanded",
		[port("in_1", "poses", "list[Pose]", mutates=True)],
		[port("effect:in_1", "poses", "list[Pose]", effect=True, edge_t=0.5)],
		append_inner_w, append_inner_h)
	append_inner = block("append_inner", EXPANDED_SIDE_PAD, EXPANDED_HEADER, title="append (inner)",
						  inputs=append_inner_ports[0], outputs=append_inner_ports[1],
						  parent="run_outer", w=append_inner_w, h=append_inner_h)
	run_collapsed_w, run_collapsed_h = block_size("run() — collapsed",
		[port("in_1", "poses", "list[Pose]", mutates=True)],
		[port("effect:in_1", "poses", "list[Pose]", effect=True, edge_t=0.5)])
	run_outer["x"] = ORDINAL_COL_W
	collapsed_x = ORDINAL_COL_W + run_outer_w + COMPANION_GUTTER
	run_collapsed = block("run_collapsed", collapsed_x, 0,
						   title="run() — collapsed",
						   inputs=[port("in_1", "poses", "list[Pose]", mutates=True)],
						   outputs=[port("effect:in_1", "poses", "list[Pose]", effect=True, edge_t=0.5)],
						   w=run_collapsed_w, h=run_collapsed_h)
	note17_body = ("Two levels, hand-marked at each: check the interior tether AND the outer's own collapsed Port view (right).")
	note17b_body = "Same run(), Port view: the outside, collapsed."
	unit_a_block_h = max(run_outer_h, SUBLABEL_H + run_collapsed_h)
	note17 = note("note-17", ORDINAL_COL_W, unit_a_block_h + NOTE_GAP_Y, note17_body)
	note17b = note("note-17b", collapsed_x, unit_a_block_h + NOTE_GAP_Y, note17b_body)
	sub17b = text("sub-run_collapsed", collapsed_x, 0, "17b", size="s", color="orange")
	run_collapsed["y"] = SUBLABEL_H
	unit_a_w = collapsed_x + max(run_collapsed_w, NOTE_WIDTH)
	unit_a_h = (unit_a_block_h + NOTE_GAP_Y
				+ max(note_height(note17_body), note_height(note17b_body)))
	shapes += [run_outer, append_inner, sub17b, run_collapsed, note17, note17b]
	shapes.append(ordinal("ord-run_outer", 0, 0, 17))

	# --- 18: outer > run > add_pose ---
	nest_inner_ports = ([port("in_1", "poses", "list[Pose]", mutates=True), port("in_2", "pose", "Pose")],
						 [port("effect:in_1", "poses", "list[Pose]", effect=True, edge_t=0.5)])
	nest_inner_w, nest_inner_h = block_size("add_pose", *nest_inner_ports)
	nest_mid, nest_mid_w, nest_mid_h = expanded_block(
		"nest_mid", "run() — nested",
		[port("in_1", "poses", "list[Pose]", mutates=True)],
		[port("effect:in_1", "poses", "list[Pose]", effect=True, edge_t=0.5)],
		nest_inner_w, nest_inner_h)
	nest_inner = block("nest_inner", EXPANDED_SIDE_PAD, EXPANDED_HEADER, title="add_pose",
						inputs=nest_inner_ports[0], outputs=nest_inner_ports[1],
						parent="nest_mid", w=nest_inner_w, h=nest_inner_h)
	nest_outer, nest_outer_w, nest_outer_h = expanded_block(
		"nest_outer", "outer",
		[port("in_1", "poses", "list[Pose]", mutates=True)],
		[port("effect:in_1", "poses", "list[Pose]", effect=True, edge_t=0.5)],
		nest_mid_w, nest_mid_h)
	nest_mid["x"], nest_mid["y"], nest_mid["parentId"] = EXPANDED_SIDE_PAD, EXPANDED_HEADER, "nest_outer"
	unit_b_x = unit_a_w + GUTTER_X
	nest_outer["x"] = unit_b_x + ORDINAL_COL_W
	note18_body = "Three levels. Each is independently marked; auto-follow across a frame boundary is not wired yet."
	note18 = note("note-18", nest_outer["x"], nest_outer_h + NOTE_GAP_Y, note18_body)
	shapes += [nest_outer, nest_mid, nest_inner, note18]
	shapes.append(ordinal("ord-nest_outer", unit_b_x, 0, 18))
	unit_b_w = ORDINAL_COL_W + nest_outer_w
	unit_b_h = nest_outer_h + NOTE_GAP_Y + note_height(note18_body)

	row1_bottom = max(unit_a_h, unit_b_h)
	row2_y = row1_bottom + intra

	# --- 19: combined mut z⁻¹ pill ---
	append_delayed_w, append_delayed_h = block_size("append (delayed)",
		[port("in_1", "poses", "list[Pose]", mutates=True), port("in_2", "pose", "Pose")],
		[port("effect:in_1", "poses", "list[Pose]", effect=True, edge_t=0.5)])
	len_delayed_w, len_delayed_h = block_size("len (delayed)", [port("in_1", "poses", "list")],
		[port("out_1", "count", "int")], minimum=MIN_COMPANION_WIDTH)
	append_delayed = block("append_delayed", ORDINAL_COL_W, row2_y,
							title="append (delayed)",
							inputs=[port("in_1", "poses", "list[Pose]", mutates=True), port("in_2", "pose", "Pose")],
							outputs=[port("effect:in_1", "poses", "list[Pose]", effect=True, edge_t=0.5)],
							w=append_delayed_w, h=append_delayed_h)
	len_x = ORDINAL_COL_W + append_delayed_w + COMPANION_GUTTER
	sub19b = text("sub-len_delayed", len_x, row2_y, "19b", size="s", color="orange")
	len_delayed = block("len_delayed", len_x, row2_y + SUBLABEL_H, title="len (delayed)",
						 inputs=[port("in_1", "poses", "list")],
						 outputs=[port("out_1", "count", "int")], w=len_delayed_w, h=len_delayed_h)
	bindings += wire("wire-19", "append_delayed", "effect:in_1", "len_delayed", "in_1")
	shapes.append(cable("wire-19", temporal="delayed", delay_value="1.0", pill_position=0.55))
	note19_body = f"One cable, both marks: {PILL_DELAY}. Drag the pill — it should move like any pill."
	unit_c_block_h = max(append_delayed_h, SUBLABEL_H + len_delayed_h)
	note19 = note("note-19", ORDINAL_COL_W, row2_y + unit_c_block_h + NOTE_GAP_Y, note19_body)
	unit_c_w = len_x + max(len_delayed_w, NOTE_WIDTH)
	shapes += [append_delayed, sub19b, len_delayed, note19]
	shapes.append(ordinal("ord-append_delayed", 0, row2_y, 19))

	# --- 20: Simple view vs Port view. Chip ABOVE the view labels. ---
	simple_w, simple_h = block_size("append (simple)",
		[port("in_1", "poses", "list[Pose]", mutates=True), port("in_2", "pose", "Pose")],
		[port("effect:in_1", "poses", "list[Pose]", effect=True, edge_t=0.5)], simple=True)
	port_twin_ports = ([port("in_1", "poses", "list[Pose]", mutates=True), port("in_2", "pose", "Pose")],
						[port("effect:in_1", "poses", "list[Pose]", effect=True, edge_t=0.5)])
	twin_w, twin_h = block_size("append (port view)", *port_twin_ports)
	label_h = 24
	unit_d_x = unit_c_w + GUTTER_X
	# Chip at row2_y (same top as 19). Labels under the chip. Blocks under labels.
	shapes.append(ordinal("ord-append_simple", unit_d_x, row2_y, 20))
	label_y = row2_y + 36
	block_y = label_y + label_h + 8
	simple_x = unit_d_x + ORDINAL_COL_W
	twin_x = simple_x + simple_w + COMPANION_GUTTER
	label_simple = text("label-simple", simple_x, label_y, "Simple view", size="s")
	label_port = text("label-port", twin_x, label_y, "Port view · 20b", size="s")
	row_d_h = max(simple_h, twin_h)
	append_simple = block("append_simple", simple_x, block_y + (row_d_h - simple_h), title="append (simple)",
						   inputs=[port("in_1", "poses", "list[Pose]", mutates=True), port("in_2", "pose", "Pose")],
						   outputs=[port("effect:in_1", "poses", "list[Pose]", effect=True, edge_t=0.5)],
						   view="simple", w=simple_w, h=simple_h)
	append_simple_portview = block("append_simple_portview", twin_x,
									block_y + (row_d_h - twin_h), title="append (port view)",
									inputs=port_twin_ports[0], outputs=port_twin_ports[1],
									w=twin_w, h=twin_h)
	note20_body = "Simple view: the hook and the effect port both hide until hover, like every subtle port does."
	unit_d_block_bottom = block_y + row_d_h
	note20 = note("note-20", simple_x, unit_d_block_bottom + NOTE_GAP_Y, note20_body)
	unit_d_w = twin_x + max(twin_w, NOTE_WIDTH) - unit_d_x
	shapes += [label_simple, label_port, append_simple, append_simple_portview, note20]

	content_w = max(unit_a_w + GUTTER_X + unit_b_w, unit_c_w + GUTTER_X + unit_d_w)
	content_h = max(
		unit_d_block_bottom + NOTE_GAP_Y + note_height(note20_body),
		row2_y + unit_c_block_h + NOTE_GAP_Y + note_height(note19_body),
	)
	return shapes, bindings, round(content_w), round(content_h)


# --------------------------------------------------------------- tier build


def build_tier1() -> tuple[list[dict], list[dict], int, int]:
	specs, notes, companions, numbers = easy_single_arg()
	shapes, _positions, row_w, row_h = layout_example_row(specs, notes, companions, numbers)
	bindings = wire("wire-1", "r0c0", "effect:in_1", "len_consumer", "in_1")
	shapes.append(cable("wire-1", pill_position=0.62))
	return shapes, bindings, row_w, row_h


def build_tier2() -> tuple[list[dict], list[dict], int, int]:
	specs, notes, companions, numbers = easy_reordering()
	shapes, _positions, row_w, row_h = layout_example_row(specs, notes, companions, numbers)
	return shapes, [], row_w, row_h


def build_tier3() -> tuple[list[dict], list[dict], int, int]:
	specs, notes, companions, numbers = medium_returns_and_mutates()
	shapes, _positions, row_w, row_h = layout_example_row(specs, notes, companions, numbers)
	# 9a is the ordinary return (short hop to the side companion). 9b is the
	# effect cable to the lower companion; keep its pill off the shared stub.
	bindings = (wire("wire-9a", "r2c0", "out_1", "use_item", "in_1")
				+ wire("wire-9b", "r2c0", "effect:in_1", "len_after_pop", "in_1"))
	shapes += [cable("wire-9a"), cable("wire-9b", pill_position=0.68)]
	return shapes, bindings, row_w, row_h


def build_tier4() -> tuple[list[dict], list[dict], int, int]:
	specs, notes, companions, numbers = medium_hard_receiver()
	shapes, _positions, row_w, row_h = layout_example_row(specs, notes, companions, numbers)
	# Round-2 item 2 root cause (measured, not guessed): wire-13a's mut pill is
	# crossed by wire-13b and vice versa — two effect cables sharing a corridor,
	# not a same-cable paint bug. Companions-to-the-right plus staggered
	# pillPositions keep the two runs from occupying one pill's rect.
	bindings = (wire("wire-13a", "r3c0", "effect:in_1", "show_a", "in_1")
				+ wire("wire-13b", "r3c0", "effect:in_2", "show_b", "in_1"))
	shapes += [cable("wire-13a", pill_position=0.72), cable("wire-13b", pill_position=0.38)]
	return shapes, bindings, row_w, row_h


def build_legend() -> tuple[list[dict], list[dict], int, int]:
	"""Mutation-grammar vocabulary, drawn with real shapes.

	Round 3 adds the tether (dashed hook→effect-port elbow on the Port-view
	source — it is already painted by the block; the legend now *names* it)
	and puts the delayed consumer on a lower row so its cable is not hidden
	under the solid `mut` cable for the first ~229px.
	"""
	shapes: list[dict] = []
	src_w, src_h = block_size("mutates(obj)", [port("in_1", "obj", "Any", mutates=True)],
							   [port("effect:in_1", "obj", "Any", effect=True, edge_t=0.5)])
	now_w, now_h = block_size("reads now", [port("in_1", "obj", "Any")], [], minimum=MIN_COMPANION_WIDTH)
	later_w, later_h = block_size("reads later", [port("in_1", "obj", "Any")], [], minimum=MIN_COMPANION_WIDTH)

	src = block("legend_src", 0, 0, title="mutates(obj)",
				inputs=[port("in_1", "obj", "Any", mutates=True)],
				outputs=[port("effect:in_1", "obj", "Any", effect=True, edge_t=0.5)], w=src_w, h=src_h)
	now_x = src_w + COMPANION_GUTTER
	now = block("legend_now", now_x, 0, title="reads now",
				inputs=[port("in_1", "obj", "Any")], outputs=[], w=now_w, h=now_h)
	# Directly below the source, not beside `reads now`. The delayed cable then
	# leaves downward while the solid cable leaves rightward, so they share
	# only the effect port itself — not a 229px first run (round-2 item 13).
	later_x = 0
	later_y = src_h + 72
	later = block("legend_later", later_x, later_y, title="reads later",
				  inputs=[port("in_1", "obj", "Any")], outputs=[], w=later_w, h=later_h)

	cable_a = cable("wire-legend-a", pill_position=0.58)
	cable_b = cable("wire-legend-b", temporal="delayed", delay_value="1.0", pill_position=0.55)
	bindings = (wire("wire-legend-a", "legend_src", "effect:in_1", "legend_now", "in_1")
				+ wire("wire-legend-b", "legend_src", "effect:in_1", "legend_later", "in_1"))

	caption1_body = (
		"Hook (orange, opens left) = this call rewrites its argument in place. "
		"Dashed elbow from hook to top-edge port = tether (which argument the port belongs to). "
		"Port on the top edge = the only way the mutated value leaves."
	)
	caption2_body = "Solid orange cable, mut pill: this value exists only because of the mutation."
	caption3_body = f"Dotted orange cable, {PILL_DELAY} pill: same value, read one iteration late."
	caption2 = note("legend-caption-2", now_x, now_h + NOTE_GAP_Y, caption2_body, width=now_w)
	cap1_y = now_h + NOTE_GAP_Y + note_height(caption2_body, now_w) + 8
	caption1 = note("legend-caption-1", now_x, cap1_y, caption1_body, width=now_w)
	caption3 = note("legend-caption-3", 0, later_y + later_h + NOTE_GAP_Y, caption3_body, width=max(later_w, src_w))
	cluster_bottom = max(
		later_y + later_h + NOTE_GAP_Y + note_height(caption3_body, max(later_w, src_w)),
		cap1_y + note_height(caption1_body, now_w),
	)
	row1_caption_h = 0
	cap_y = cluster_bottom

	row2_y = cap_y + row1_caption_h + NOTE_GAP_Y * 2
	prod_w, prod_h = block_size("producer", [], [port("out_1", "value", "int")], minimum=MIN_COMPANION_WIDTH)
	cons_w, cons_h = block_size("consumer", [port("in_1", "value", "int")], [], minimum=MIN_COMPANION_WIDTH)
	row2_h = max(prod_h, cons_h)
	prod = block("legend_producer", 0, row2_y + (row2_h - prod_h), title="producer",
				 inputs=[], outputs=[port("out_1", "value", "int")], w=prod_w, h=prod_h)
	cons_x = prod_w + COMPANION_GUTTER
	cons = block("legend_consumer", cons_x, row2_y + (row2_h - cons_h), title="consumer",
				 inputs=[port("in_1", "value", "int")], outputs=[], w=cons_w, h=cons_h)
	bindings += wire("wire-legend-c", "legend_producer", "out_1", "legend_consumer", "in_1")
	cable_c = cable("wire-legend-c")
	caption4_body = "Plain cable, no pill: an ordinary return value, for contrast."
	caption4 = note("legend-caption-4", 0, row2_y + row2_h + NOTE_GAP_Y, caption4_body)
	caption5_body = (
		"Simple view (see 20) hides the hook and the effect port until hover. "
		"A filled effect-port dot is wired; a hollow one is not. "
		"Type-coloured rings on ordinary ports are product chrome, not mutation grammar."
	)
	caption5 = note("legend-caption-5", cons_x, row2_y + row2_h + NOTE_GAP_Y, caption5_body,
					 width=max(cons_w, NOTE_WIDTH))

	shapes += [src, now, later, cable_a, cable_b, caption1, caption2, caption3,
			   prod, cons, cable_c, caption4, caption5]
	content_w = max(later_x + later_w, cons_x + max(cons_w, NOTE_WIDTH), now_x + now_w)
	content_h = row2_y + row2_h + NOTE_GAP_Y + max(note_height(caption4_body),
													 note_height(caption5_body, max(cons_w, NOTE_WIDTH)))
	return shapes, bindings, round(content_w), round(content_h)


# ---------------------------------------------------------------------- main


def main() -> None:
	all_shapes: list[dict] = []
	all_bindings: list[dict] = []

	card_y = TOP_MARGIN + TITLE_HEIGHT + TITLE_GAP
	card_h = 240
	tiers_top = card_y + card_h + TOPCARD_GAP

	col_a_x = 0
	col_a_frames: list[tuple[dict, list[dict], list[dict]]] = []
	col_b_frames: list[tuple[dict, list[dict], list[dict]]] = []

	fr, shapes, bindings, w1, h1 = wrap_tier(
		"tier-easy-single", "EASY — single argument, no return (1–4)",
		build_tier1(), col_a_x, tiers_top)
	col_a_frames.append((fr, shapes, bindings))

	fr, shapes, bindings, w2, h2 = wrap_tier(
		"tier-easy-reorder", "EASY — in-place reordering (5–8)",
		build_tier2(), col_a_x, fr["y"] + h1 + FRAME_GUTTER)
	col_a_frames.append((fr, shapes, bindings))

	fr, shapes, bindings, w3, h3 = wrap_tier(
		"tier-medium-dual", "MEDIUM — returns a value AND mutates (9–12)",
		build_tier3(), col_a_x, fr["y"] + h2 + FRAME_GUTTER)
	col_a_frames.append((fr, shapes, bindings))

	col_a_w = max(w1, w2, w3)
	col_b_x = col_a_w + COLUMN_GUTTER

	fr, shapes, bindings, w4, h4 = wrap_tier(
		"tier-medium-hard-receiver", "MEDIUM/HARD — multiple mutated arguments, and the receiver (13–16)",
		build_tier4(), col_b_x, tiers_top)
	col_b_frames.append((fr, shapes, bindings))

	fr, shapes, bindings, w5, h5 = wrap_tier(
		"tier-hard-nesting", "HARD — nesting, the combined pill, and a Simple-view check (17–20)",
		hard_tier(), col_b_x, fr["y"] + h4 + FRAME_GUTTER)
	col_b_frames.append((fr, shapes, bindings))

	col_a_bottom = col_a_frames[-1][0]["y"] + col_a_frames[-1][0]["props"]["h"]
	col_b_bottom = col_b_frames[-1][0]["y"] + col_b_frames[-1][0]["props"]["h"]
	col_b_w = max(w4, w5)

	# Legend starts at the title band, top-right — filling the dead band that
	# used to sit above a legend aligned with the first tier. Intro text names
	# this location.
	col_c_x = col_b_x + col_b_w + COLUMN_GUTTER
	legend_fr, legend_shapes, legend_bindings, legend_w, legend_h = wrap_tier(
		"tier-legend", "Legend — what each mark means", build_legend(), col_c_x, TOP_MARGIN)

	total_h = max(col_a_bottom, col_b_bottom, legend_fr["y"] + legend_h) + BOTTOM_MARGIN
	total_w = col_c_x + legend_w

	for fr, shapes, bindings in col_a_frames + col_b_frames:
		all_shapes.append(fr)
		all_shapes += shapes
		all_bindings += bindings
	all_shapes.append(legend_fr)
	all_shapes += legend_shapes
	all_bindings += legend_bindings

	title_shape = text("t-title", 0, TOP_MARGIN,
						"The mutating line — 20 examples, easy to hard", size="xl")
	all_shapes.append(title_shape)

	callouts = [
		{
			"id": "orientation", "kind": "step", "x": 0, "y": card_y, "w": 500, "h": card_h,
			"text": ("Start here. 20 real mutating calls, laid out easy to hard. "
					 "Each tier below is its own labeled frame; every example is numbered 1–20 in orange. "
					 "The Legend frame on the right names every hook, tether, port, and cable style."),
			"target": {"shapeId": "r0c0", "anchor": "top"},
		},
		{
			"id": "pass", "kind": "pass", "x": 560, "y": card_y, "w": 520, "h": card_h,
			"text": ("PASS WHEN\n"
					 "Every mutated argument shows a hook.\n"
					 "Every effect port sits on the top edge.\n"
					 "Tethers are right-angled and may cross.\n"
					 "Nesting is independent at each level.\n"
					 f"Combined pill reads {PILL_DELAY}.\n"
					 "Simple view: hook and port on hover."),
		},
	]

	recipe = {
		"feature": "The mutating line - 20 examples (relaid out per 2026-09-03 layout audit)",
		"viewport": {"width": round(min(2400, total_w)), "height": round(min(1500, total_h))},
		"shapes": all_shapes,
		"bindings": all_bindings,
		"callouts": callouts,
	}

	RECIPE_PATH.parent.mkdir(parents=True, exist_ok=True)
	RECIPE_PATH.write_text(json.dumps(recipe, indent=2) + "\n")
	print(f"wrote {RECIPE_PATH}  ({len(all_shapes)} shapes, {len(all_bindings)} bindings)")
	print(f"content bounds: {total_w:.0f} x {total_h:.0f}  aspect {total_w / total_h:.2f}")

	result = subprocess.run(
		[
			"node", str(ROOT / "skills" / "systemsketch-review-fixture" / "scripts" / "create_fixture.mjs"),
			"--recipe", str(RECIPE_PATH),
			"--output", str(OUTPUT_PATH),
			"--force",
		],
		cwd=ROOT,
	)
	sys.exit(result.returncode)


if __name__ == "__main__":
	main()
