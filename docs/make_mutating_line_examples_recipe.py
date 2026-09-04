#!/usr/bin/env python3
"""Emit `sketches/review/mutating-line-examples.recipe.json` and regenerate
`sketches/review/mutating-line-examples.systemsketch` through the real editor.

The 30 blocks' content (titles, ports, wiring) comes from the board an
independent auditor reviewed on 2026-09-03 (`docs/mutating-line-review-2026-09-03.html`,
built by `docs/build_mutating_line_review.py`). That review found the *content*
correct and the *layout* broken — truncated titles, an unreadable portrait
board, overlapping blocks, Draft-N pills from reused titles, and no legend for
the visual vocabulary. This script keeps the content and re-solves layout,
sizing, and framing from scratch, following the audit's punch list verbatim.
Its own original generator (`gen_v2.py`) lived in a scratch dir wiped between
sessions; this is a clean rewrite, not a recovery of that file.

The recipe is rendered by `create_fixture.mjs` through the real editor; this
script never hand-writes tldraw schema. Run it directly:

    python3 docs/make_mutating_line_examples_recipe.py

It writes the recipe JSON beside the board and then shells out to
`create_fixture.mjs --force` to regenerate the `.systemsketch` in place.
"""

from __future__ import annotations

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
# CONFIRMED (open question in the work order): Block width is author-chosen,
# never auto-fit to title or port content. `layoutBlock.ts` reads
# `const width = finiteDimension(props.w)` directly — the only input is the
# shape's own `props.w`. Height for Port view is likewise driven by the
# layout constants below, not measured from title text. So MUST FIX #6/#7
# have to be solved with arithmetic on the real string lengths, not by
# omitting `w`/`h` and hoping the renderer fills them in.
#
# TITLE_CHAR_PX is empirical, not guessed: it is the auditor's own measured
# average glyph advance off the *rendered* board (36px title font *
# ~0.58 sans-serif average-glyph-width ratio). The app's source
# (`layoutBlock.ts` -> `measureBlockText`) uses a coarser 0.55 canvas-less
# fallback; trusting the auditor's number, which was checked against the
# real DOM, gives more headroom than re-deriving from the fallback constant.
TITLE_CHAR_PX = 20.9
TITLE_PAD_PX = 88
# Simple view renders its title at SIMPLE_TITLE_FONT_PX = TLDRAW_TEXT_XL_PX
# (44px); the same ratio scales the per-character cost up accordingly.
SIMPLE_TITLE_CHAR_PX = 44 * 0.58
# The audit's own port-row formula: "name_px + type_px + 60" (dot, gap, and
# edge margin), reusing the measured char-width for both name and type since
# the app does not publish a separate metric for the mono type face.
PORT_ROW_PAD_PX = 60
MIN_MAIN_WIDTH = 320
MIN_COMPANION_WIDTH = 280

# Height, unlike width, follows real layout constants read straight out of
# `layoutBlock.ts` (BLOCK_HEADER_HEIGHT_PX=48, NODE_ROW_HEADER_GAP_PX=8,
# NODE_ROW_HEIGHT_PX=44, NODE_FOOTER_HEIGHT_PX=46) rather than an audit
# estimate, so a Port-view block never runs out of room for its own rows.
BODY_TOP_PX = 48 + 8
ROW_PITCH_PX = 44
FOOTER_PX = 46
HEIGHT_SLACK_PX = 12

GUTTER_X = 120  # MUST FIX #7: the gutter every block in a row shares
FRAME_PAD = 40  # MUST FIX #5: interior frame padding
FRAME_GUTTER = 140  # MUST FIX #5: space between tier frames (>=120)
COLUMN_GUTTER = 160  # MUST FIX #2: space between the two macro columns
NOTE_WIDTH = 340  # WOULD HELP #16: one placement rule for every note
NOTE_GAP_Y = 32  # WOULD HELP #16: fixed offset below the block
NOTE_LINE_PX = 24
NOTE_CHARS_PER_LINE = 34
ORDINAL_GAP_Y = 34  # MUST FIX #10: numbered examples, visible on the canvas

# MUST FIX #3 / #13: clear top band for the title, and clearance so the app's
# own PREVIEW banner (top) and toolbar (bottom) never cover board content at
# the zoom a reviewer will actually fit to.
TOP_MARGIN = 90
BOTTOM_MARGIN = 120
TITLE_HEIGHT = 60
TITLE_GAP = 60  # MUST FIX #3: >=60 units of clear space below the title
TOPCARD_GAP = 140  # clearance between the intro/PASS band and the first tier;
# generous on purpose — a Frame's name label paints just above its top edge,
# so this has to clear both the card AND that label, not just the card.

# An Expanded-view block is itself a small frame: header band, side padding,
# footer padding around whatever it contains. These match the pre-fix
# board's own run_outer (h=360 header+footer around a 170-tall child ->
# header+footer ~190, split 140/50) closely enough for the nesting demos
# (items 17-18), which only need "does not clip its child", not pixel parity
# with the app's real Expanded-view metrics.
EXPANDED_HEADER = 110
EXPANDED_SIDE_PAD = 48
EXPANDED_BOTTOM_PAD = 50


def title_width(title: str, *, simple: bool = False) -> float:
	px = SIMPLE_TITLE_CHAR_PX if simple else TITLE_CHAR_PX
	return len(title) * px + TITLE_PAD_PX


def port_row_width(name: str, ptype: str) -> float:
	return len(name) * TITLE_CHAR_PX + len(ptype) * TITLE_CHAR_PX + PORT_ROW_PAD_PX


def block_size(title: str, inputs: list[dict], outputs: list[dict], *,
				minimum: float = MIN_MAIN_WIDTH, simple: bool = False) -> tuple[int, int]:
	"""MUST FIX #6/#7: size to the title and the widest port row, from actual
	string lengths — never one universal width for every block."""
	rows = inputs + outputs
	widest_row = max((port_row_width(p["name"], p["type"]) for p in rows), default=0)
	w = round(max(minimum, title_width(title, simple=simple), widest_row))
	if simple:
		h = 206  # unchanged from the pre-fix board; only its WIDTH truncated (item 18)
	else:
		real_outputs = [o for o in outputs if not o.get("effect")]
		row_count = max(len(inputs), len(real_outputs), 1)
		h = round(BODY_TOP_PX + row_count * ROW_PITCH_PX + FOOTER_PX + HEIGHT_SLACK_PX)
	return w, h


def wrap_note(text: str, chars_per_line: int = NOTE_CHARS_PER_LINE) -> str:
	"""Wrap by words to a fixed width, matching NOTE_WIDTH — WOULD HELP #16."""
	out_lines: list[str] = []
	for paragraph in text.split("\n"):
		line = ""
		for word in paragraph.split():
			candidate = f"{line} {word}".strip()
			if len(candidate) > chars_per_line and line:
				out_lines.append(line)
				line = word
			else:
				line = candidate
		out_lines.append(line)
	return "\n".join(out_lines)


def note_height(text: str) -> int:
	return max(40, (text.count("\n") + 1) * NOTE_LINE_PX + 10)


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
	"""A stock Frame. `scope_host=True` stamps the same `meta.systemSketch.kind
	= 'imported-page'` the app's own single-page migration puts on a Frame
	that stands in for a former tldraw page (`singlePageDocument.ts`).

	This is load-bearing, not decorative: `blockScopeId` in
	`connectionScope.ts` only treats a Block or an `isImportedPageFrame` as a
	scope boundary. An ordinary named Frame is neither, so two Blocks nested
	in the SAME plain Frame still scope to the page, and
	`cableCompositingParent` then has no shared region to give their cable —
	it parents the cable to the page too. That cable is real (bindings and
	route are correct) but paints BEHIND the Frame's own opaque fill, which
	sits one z-band above ordinary page content: a wire between two examples
	in one tier frame renders, invisibly, every time. Marking the tier frames
	as scope hosts — exactly the sanctioned use for "a stock Frame standing in
	for a page boundary" per `skills/systemsketch-review-fixture/references/recipe.md`
	— makes `blockScopeId` stop at the frame, so `cableCompositingParent`'s
	fallback resolves to the frame itself and the wire becomes its real child,
	painted in the same z-band as every other example inside it. Confirmed
	live via CDP (`document.querySelector('[data-shape-id=...]').style.zIndex`
	before/after): worth a follow-up product fix in `connectionScope.ts` so a
	plain Frame does not need this stamp to host a legible cable — flagged
	separately, not fixed here, since that is app code and this script only
	authors a recipe.
	"""
	shape: dict = {"id": fid, "type": "frame", "x": x, "y": y, "props": {"name": name, "w": w, "h": h}}
	if scope_host:
		shape["meta"] = {"systemSketch": {
			"kind": "imported-page", "sourcePageId": fid, "sourcePageName": name, "sourcePageIndex": "0",
		}}
	return shape


def text(tid: str, x: int, y: int, body: str, *, size: str = "s", parent: str | None = None) -> dict:
	shape = {"id": tid, "type": "text", "x": x, "y": y, "text": body,
			 "props": {"size": size, "color": "black", "font": "sans"}}
	if parent:
		shape["parentId"] = parent
	return shape


def ordinal(tid: str, x: int, y: int, n: int, *, parent: str | None = None) -> dict:
	shape = text(tid, x, y, f"{n:02d}", size="m", parent=parent)
	shape["props"]["color"] = "orange"
	return shape


def note(tid: str, x: int, y: int, body: str, *, parent: str | None = None) -> dict:
	return text(tid, x, y, wrap_note(body), size="s", parent=parent)


def cable(cid: str) -> dict:
	return {
		"id": cid, "type": "connection", "x": 0, "y": 0,
		"props": {
			"start": {"x": 0, "y": 0}, "end": {"x": 100, "y": 0},
			"routing": "elbow", "curve": None, "pins": [], "elbowRoute": None,
			"temporal": "data", "delayValue": "", "pillPosition": 0.5,
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


def layout_row(specs: list[dict], x0: int, y0: int) -> tuple[list[dict], dict, int, int]:
	"""Lay a list of block specs left to right, bottom-aligned (WOULD HELP #14).

	Each spec: id, title, inputs, outputs, view='port', minimum=MIN_MAIN_WIDTH.
	Returns (shapes, {id: (x, y, w, h)}, row_width, row_height).
	"""
	sized = []
	for spec in specs:
		w, h = block_size(spec["title"], spec["inputs"], spec["outputs"],
						   minimum=spec.get("minimum", MIN_MAIN_WIDTH),
						   simple=(spec.get("view", "port") == "simple"))
		sized.append((spec, w, h))
	row_h = max(h for _, _, h in sized)
	shapes = []
	positions: dict[str, tuple[int, int, int, int]] = {}
	x = x0
	for spec, w, h in sized:
		y = y0 + (row_h - h)
		shapes.append(block(spec["id"], x, y, title=spec["title"], inputs=spec["inputs"],
							 outputs=spec["outputs"], view=spec.get("view", "port"), w=w, h=h))
		positions[spec["id"]] = (x, y, w, h)
		x += w + GUTTER_X
	row_w = x - GUTTER_X - x0
	return shapes, positions, row_w, row_h


def below_band(positions: dict, ids: list[str], notes: dict[str, str],
			   companions: dict[str, list[dict]]) -> tuple[list[dict], int, int]:
	"""MUST FIX #10 numbering is placed by the caller; this places the one note
	every example gets (WOULD HELP #17) directly below its block, left-aligned,
	fixed width, 32 down (WOULD HELP #16). Companions stack BELOW the note, in
	the same column (WOULD HELP #15) — not beside it.

	An earlier version placed a companion to the note's right at `x + 400`,
	which reads fine for a 4-wide row in isolation but silently creeps into
	the NEXT column once that column's own block is narrower than 400 units
	away: `len(poses)` under example 1 landed on top of example 2's note text.
	Stacking strictly downward in the block's own column can only grow the
	band's height, never its width past the block/note's own right edge, so
	it cannot collide with a neighbour no matter how narrow the gutter.

	Returns (shapes, band_bottom, band_right) so the caller can size the
	enclosing tier frame to whatever this band actually needed, rather than
	just the row of primary blocks above it.
	"""
	shapes: list[dict] = []
	band_bottom = 0
	band_right = 0
	for bid in ids:
		x, y, w, h = positions[bid]
		band_right = max(band_right, x + w)
		cursor_y = y + h + NOTE_GAP_Y
		note_text = notes.get(bid)
		if note_text:
			shapes.append(note(f"note-{bid}", x, cursor_y, note_text))
			cursor_y += note_height(wrap_note(note_text)) + NOTE_GAP_Y
			band_right = max(band_right, x + NOTE_WIDTH)
		for comp in companions.get(bid, []):
			cw, ch = block_size(comp["title"], comp["inputs"], comp["outputs"],
								 minimum=MIN_COMPANION_WIDTH)
			shapes.append(block(comp["id"], x, cursor_y, title=comp["title"],
								 inputs=comp["inputs"], outputs=comp["outputs"], w=cw, h=ch))
			positions[comp["id"]] = (x, cursor_y, cw, ch)
			band_right = max(band_right, x + cw)
			cursor_y += ch + NOTE_GAP_Y
		band_bottom = max(band_bottom, cursor_y - NOTE_GAP_Y)
	return shapes, band_bottom, band_right


def ordinals(positions: dict, ids: list[str], numbers: dict[str, int]) -> list[dict]:
	out = []
	for bid in ids:
		x, y, _w, _h = positions[bid]
		out.append(ordinal(f"ord-{bid}", x, y - ORDINAL_GAP_Y, numbers[bid]))
	return out


def shift_and_parent(shapes: list[dict], dx: int, dy: int, parent_id: str) -> None:
	"""Move every shape that is not already someone else's child into the tier
	frame's local coordinate space, then adopt it.

	A nested Expanded-view child (e.g. `append_inner` inside `run_outer`)
	already carries `parentId` and coordinates local to *that* container —
	shifting it here would double-offset it. Only shapes still waiting for a
	home (the tier's own top-level blocks, notes, ordinals, cables) get
	moved and adopted. See the skill's containment rule: `parentId` is the
	only thing that makes a child a child, and a child's x/y are parent-local
	once it has one.
	"""
	for shape in shapes:
		if "parentId" not in shape:
			shape["x"] += dx
			shape["y"] += dy
			shape["parentId"] = parent_id


def wrap_tier(tier_id: str, name: str, content: tuple[list[dict], list[dict], int, int],
			  macro_x: int, macro_y: int, *, reserve_ordinal_row: bool = True) -> tuple[dict, list[dict], list[dict], int, int]:
	"""MUST FIX #5: wrap one tier's already-laid-out content (built at local
	origin 0,0) in its own named stock Frame, with FRAME_PAD interior padding.

	The frame's own `name` IS the section header (MUST FIX #4) — there is no
	separate floating header text to glue 2 units above a row anymore.
	"""
	shapes, bindings, content_w, content_h = content
	dx = FRAME_PAD
	dy = FRAME_PAD + (ORDINAL_GAP_Y if reserve_ordinal_row else 0)
	shift_and_parent(shapes, dx, dy, tier_id)
	w = round(content_w + FRAME_PAD * 2)
	h = round(content_h + dy + FRAME_PAD)
	# scope_host=True unconditionally: every tier wires at least one companion
	# INSIDE itself, and the stamp is inert for a tier that has none.
	fr = frame(tier_id, macro_x, macro_y, w, h, name=name, scope_host=True)
	return fr, shapes, bindings, w, h


# ------------------------------------------------------------------ content
#
# Every title, port, and wire below reproduces the pre-fix recipe's content
# (transcribed from `mutating-line-examples.recipe.json` before this script
# overwrote it). MUST FIX #8 renames the four `poses.append`, three `run`,
# three `len`, and two `show` collisions that were producing "Draft N" pills;
# every other title is unchanged. Renamed titles stay truthful to their real
# port names (e.g. `len(pending)` because that block's own input port really
# is named `pending`) rather than inventing a name that reads well; where two
# truthful names would still collide (both `len` companions read a `poses`
# list), the tie-breaker names the block's role instead (`len (delayed)`).


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
		"r0c0": "1 - the base case: a hook, an effect port, one tether.",
		"r0c1": "2 - same shape, a dict this time.",
		"r0c2": "3 - a set. adding still mutates with no return.",
		"r0c3": "4 - extend copies elements in; the argument still just mutates.",
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
		"r1c0": "5 - in-place reordering: no new list, no return, just the hook.",
		"r1c1": "6 - same idea, cheaper: reverses the list in place.",
		"r1c2": "7 - two ordinary args plus the one that mutates.",
		"r1c3": "8 - the extreme case: every element leaves, none return.",
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
		"r2c0": "9 - a real output AND an effect port, wired to two different consumers.",
		"r2c1": "10 - same split as pop() above, keyed by name instead of position.",
		"r2c2": "11 - three inputs, a real return, and an effect port: the busiest header here.",
		"r2c3": "12 - a deque's own pop: value and effect, front instead of back.",
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
		"r3c0": "13 - a's port sits right, b's sits left, reversed from argument\norder, so the cables cross on purpose.",
		"r3c1": "14 - three mutated arguments, three effect ports on one top edge.",
		"r3c2": "15 - self mutates like any other argument; the receiver isn't special.",
		"r3c3": "16 - same receiver pattern, a different shape of state.",
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
	w = round(max(title_width(title), child_w + EXPANDED_SIDE_PAD * 2))
	h = round(EXPANDED_HEADER + child_h + EXPANDED_BOTTOM_PAD)
	return block(bid, 0, 0, title=title, inputs=inputs, outputs=outputs, view="expanded",
				 w=w, h=h), w, h


def hard_tier() -> tuple[list[dict], list[dict], int, int]:
	"""ex17-20: nesting, the combined pill, and a Simple/Port view comparison.

	Content varies too much in shape for one grid (MUST FIX #5 explicitly
	allows this), so this lays out four independent "units" in a 2x2
	arrangement and top-aligns each pair, rather than forcing a uniform row
	pitch. MUST FIX #9: `run_collapsed` gets its own lane, a full GUTTER_X
	away from `run_outer` — not stacked on top of it — and `note-17b` sits
	beside its own companion, never inside `run_outer`'s frame interior.
	"""
	shapes: list[dict] = []
	bindings: list[dict] = []
	numbers: dict[str, int] = {}

	# --- unit A (17): run(), expanded, containing poses.append -----------
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
	run_collapsed = block("run_collapsed", run_outer_w + GUTTER_X, run_outer_h - run_collapsed_h,
						   title="run() — collapsed",
						   inputs=[port("in_1", "poses", "list[Pose]", mutates=True)],
						   outputs=[port("effect:in_1", "poses", "list[Pose]", effect=True, edge_t=0.5)],
						   w=run_collapsed_w, h=run_collapsed_h)
	unit_a_row_h = run_outer_h
	note17_body = ("17 - two levels, hand-marked at each: check the interior tether AND\n"
				   "the outer's own collapsed Port view (right).")
	note17b_body = "same run(), Port view: the outside, collapsed."
	note17b = note("note-17b", run_outer_w + GUTTER_X, unit_a_row_h + NOTE_GAP_Y, note17b_body)
	note17 = note("note-17", 0, unit_a_row_h + NOTE_GAP_Y, note17_body)
	unit_a_w = run_outer_w + GUTTER_X + run_collapsed_w
	unit_a_h = (unit_a_row_h + NOTE_GAP_Y
				+ max(note_height(wrap_note(note17_body)), note_height(wrap_note(note17b_body))))
	shapes += [run_outer, append_inner, run_collapsed, note17b, note17]
	numbers["run_outer"] = 17

	# --- unit B (18): outer() > run() > add_pose(), three levels ---------
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
	note18_body = ("18 - three levels. Each is independently marked; auto-follow\n"
				   "across a frame boundary is not wired yet.")
	note18 = note("note-18", unit_a_w + GUTTER_X, unit_a_row_h + NOTE_GAP_Y, note18_body)
	unit_b_x = unit_a_w + GUTTER_X
	nest_outer["x"] = unit_b_x
	unit_b_w = nest_outer_w
	shapes += [nest_outer, nest_mid, nest_inner, note18]
	numbers["nest_outer"] = 18

	row1_bottom = max(unit_a_h, nest_outer_h + NOTE_GAP_Y + note_height(wrap_note(note18_body)))

	# --- unit C (19): the combined mut z⁻¹ pill --------------------------
	row2_y = row1_bottom + FRAME_GUTTER - FRAME_PAD  # a full inter-frame-scale gap, even inside one frame
	append_delayed_w, append_delayed_h = block_size("append (delayed)",
		[port("in_1", "poses", "list[Pose]", mutates=True), port("in_2", "pose", "Pose")],
		[port("effect:in_1", "poses", "list[Pose]", effect=True, edge_t=0.5)])
	len_delayed_w, len_delayed_h = block_size("len (delayed)", [port("in_1", "poses", "list")],
		[port("out_1", "count", "int")], minimum=MIN_COMPANION_WIDTH)
	row_c_h = max(append_delayed_h, len_delayed_h)
	append_delayed = block("append_delayed", 0, row2_y + (row_c_h - append_delayed_h),
							title="append (delayed)",
							inputs=[port("in_1", "poses", "list[Pose]", mutates=True), port("in_2", "pose", "Pose")],
							outputs=[port("effect:in_1", "poses", "list[Pose]", effect=True, edge_t=0.5)],
							w=append_delayed_w, h=append_delayed_h)
	len_delayed = block("len_delayed", append_delayed_w + GUTTER_X, row2_y + (row_c_h - len_delayed_h),
						 title="len (delayed)", inputs=[port("in_1", "poses", "list")],
						 outputs=[port("out_1", "count", "int")], w=len_delayed_w, h=len_delayed_h)
	bindings += wire("wire-19", "append_delayed", "effect:in_1", "len_delayed", "in_1")
	wire19_cable = cable("wire-19")
	wire19_cable["props"]["temporal"] = "delayed"
	wire19_cable["props"]["delayValue"] = "1.0"
	shapes.append(wire19_cable)
	note19_body = ("19 - one cable, both marks: mut z⁻¹ = 1.0.\n"
				   "Drag the pill - it should move like any pill.")
	note19 = note("note-19", 0, row2_y + row_c_h + NOTE_GAP_Y, note19_body)
	unit_c_w = append_delayed_w + GUTTER_X + len_delayed_w
	unit_c_h = row_c_h + NOTE_GAP_Y + note_height(wrap_note(note19_body))
	shapes += [append_delayed, len_delayed, note19]
	numbers["append_delayed"] = 19

	# --- unit D (20): Simple view vs. Port view, side by side ------------
	simple_w, simple_h = block_size("append (simple)",
		[port("in_1", "poses", "list[Pose]", mutates=True), port("in_2", "pose", "Pose")],
		[port("effect:in_1", "poses", "list[Pose]", effect=True, edge_t=0.5)], simple=True)
	port_twin_ports = ([port("in_1", "poses", "list[Pose]", mutates=True), port("in_2", "pose", "Pose")],
						[port("effect:in_1", "poses", "list[Pose]", effect=True, edge_t=0.5)])
	twin_w, twin_h = block_size("append (port view)", *port_twin_ports)
	row_d_h = max(simple_h, twin_h)
	unit_d_x = unit_c_w + GUTTER_X
	# A LABEL row of its own, above the ordinal row — item 20's "20" ordinal
	# and this "Simple view" caption previously shared one y and rendered as
	# one smashed-together string ("20ple view").
	label_y = row2_y - ORDINAL_GAP_Y - 30
	label_simple = text("label-simple", unit_d_x, label_y, "Simple view", size="s")
	label_port = text("label-port", unit_d_x + simple_w + GUTTER_X, label_y, "Port view", size="s")
	append_simple = block("append_simple", unit_d_x, row2_y + (row_d_h - simple_h), title="append (simple)",
						   inputs=[port("in_1", "poses", "list[Pose]", mutates=True), port("in_2", "pose", "Pose")],
						   outputs=[port("effect:in_1", "poses", "list[Pose]", effect=True, edge_t=0.5)],
						   view="simple", w=simple_w, h=simple_h)
	append_simple_portview = block("append_simple_portview", unit_d_x + simple_w + GUTTER_X,
									row2_y + (row_d_h - twin_h), title="append (port view)",
									inputs=port_twin_ports[0], outputs=port_twin_ports[1],
									w=twin_w, h=twin_h)
	note20_body = ("20 - Simple view: the hook and the effect port both hide\n"
				   "until hover, like every subtle port does.")
	note20 = note("note-20", unit_d_x, row2_y + row_d_h + NOTE_GAP_Y, note20_body)
	unit_d_w = simple_w + GUTTER_X + twin_w
	shapes += [label_simple, label_port, append_simple, append_simple_portview, note20]
	numbers["append_simple"] = 20

	numbers_positions = {
		"run_outer": (0, 0), "nest_outer": (unit_b_x, 0),
		"append_delayed": (0, row2_y), "append_simple": (unit_d_x, row2_y),
	}
	content_w = max(unit_a_w + GUTTER_X + unit_b_w, unit_c_w + GUTTER_X + unit_d_w)
	content_h = row2_y + row_c_h + NOTE_GAP_Y + note_height(wrap_note(note19_body))
	for bid, num in numbers.items():
		x, y = numbers_positions[bid]
		shapes.append(ordinal(f"ord-{bid}", x, y - ORDINAL_GAP_Y, num))
	return shapes, bindings, round(content_w), round(content_h)


# --------------------------------------------------------------- tier build


def build_tier1() -> tuple[list[dict], list[dict], int, int]:
	specs, notes, companions, numbers = easy_single_arg()
	ids = [s["id"] for s in specs]
	shapes, positions, row_w, row_h = layout_row(specs, 0, 0)
	shapes += ordinals(positions, ids, numbers)
	band_shapes, band_bottom, band_right = below_band(positions, ids, notes, companions)
	shapes += band_shapes
	bindings = wire("wire-1", "r0c0", "effect:in_1", "len_consumer", "in_1")
	shapes.append(cable("wire-1"))
	return shapes, bindings, max(row_w, band_right), max(row_h, band_bottom)


def build_tier2() -> tuple[list[dict], list[dict], int, int]:
	specs, notes, companions, numbers = easy_reordering()
	ids = [s["id"] for s in specs]
	shapes, positions, row_w, row_h = layout_row(specs, 0, 0)
	shapes += ordinals(positions, ids, numbers)
	band_shapes, band_bottom, band_right = below_band(positions, ids, notes, companions)
	shapes += band_shapes
	return shapes, [], max(row_w, band_right), max(row_h, band_bottom)


def build_tier3() -> tuple[list[dict], list[dict], int, int]:
	specs, notes, companions, numbers = medium_returns_and_mutates()
	ids = [s["id"] for s in specs]
	shapes, positions, row_w, row_h = layout_row(specs, 0, 0)
	shapes += ordinals(positions, ids, numbers)
	band_shapes, band_bottom, band_right = below_band(positions, ids, notes, companions)
	shapes += band_shapes
	bindings = (wire("wire-9a", "r2c0", "out_1", "use_item", "in_1")
				+ wire("wire-9b", "r2c0", "effect:in_1", "len_after_pop", "in_1"))
	shapes += [cable("wire-9a"), cable("wire-9b")]
	return shapes, bindings, max(row_w, band_right), max(row_h, band_bottom)


def build_tier4() -> tuple[list[dict], list[dict], int, int]:
	specs, notes, companions, numbers = medium_hard_receiver()
	ids = [s["id"] for s in specs]
	shapes, positions, row_w, row_h = layout_row(specs, 0, 0)
	shapes += ordinals(positions, ids, numbers)
	band_shapes, band_bottom, band_right = below_band(positions, ids, notes, companions)
	shapes += band_shapes
	bindings = (wire("wire-13a", "r3c0", "effect:in_1", "show_a", "in_1")
				+ wire("wire-13b", "r3c0", "effect:in_2", "show_b", "in_1"))
	shapes += [cable("wire-13a"), cable("wire-13b")]
	return shapes, bindings, max(row_w, band_right), max(row_h, band_bottom)


def build_legend() -> tuple[list[dict], list[dict], int, int]:
	"""MUST FIX #11: legend the marks that are actually this feature's own
	vocabulary. Checked against `block-canvas.css` / `connectionPresentation.ts`
	first, so the legend does not explain ordinary product chrome:

	- `.Port_variadic::after` (a full hollow ring, green/orange/dotted) is the
	  *args/**kwargs spread marker — unrelated to mutation, and this board has
	  no variadic ports, so it never legitimately appears here.
	- `data-pb-defaultmark='dotted'` underlines a port with a definition
	  default — ordinary "this argument has a default" chrome, not mutation
	  grammar.
	- The plain hollow/filled port dot (`.Port`, `.Port_connected`) is every
	  port on the board, wired or not; it needs no special explanation.

	What IS this feature's vocabulary, confirmed in `effectCable.ts` /
	`connectionPresentation.ts`: the mutates hook (`.Port_mutates::after`, a
	half orange ring), the effect port itself, an effect cable rendering
	orange and heavier than an ordinary cable, a delayed cable rendering
	dotted, and the `mut` / `mut z⁻¹ = 1.0` pill glyphs
	(`EFFECT_PILL_GLYPH` / `DELAY_PILL_GLYPH` in `connectionPresentation.ts`).
	Draws each with the real shapes and real connection props rather than a
	drawn icon, so the legend cannot drift out of sync with the renderer.
	"""
	shapes: list[dict] = []
	src_w, src_h = block_size("mutates(obj)", [port("in_1", "obj", "Any", mutates=True)],
							   [port("effect:in_1", "obj", "Any", effect=True, edge_t=0.5)])
	now_w, now_h = block_size("reads now", [port("in_1", "obj", "Any")], [], minimum=MIN_COMPANION_WIDTH)
	later_w, later_h = block_size("reads later", [port("in_1", "obj", "Any")], [], minimum=MIN_COMPANION_WIDTH)
	row1_h = max(src_h, now_h, later_h)
	src = block("legend_src", 0, row1_h - src_h, title="mutates(obj)",
				inputs=[port("in_1", "obj", "Any", mutates=True)],
				outputs=[port("effect:in_1", "obj", "Any", effect=True, edge_t=0.5)], w=src_w, h=src_h)
	now_x = src_w + GUTTER_X
	now = block("legend_now", now_x, row1_h - now_h, title="reads now",
				inputs=[port("in_1", "obj", "Any")], outputs=[], w=now_w, h=now_h)
	later_x = now_x + now_w + GUTTER_X
	later = block("legend_later", later_x, row1_h - later_h, title="reads later",
				  inputs=[port("in_1", "obj", "Any")], outputs=[], w=later_w, h=later_h)
	row1_w = later_x + later_w

	wire_a = wire("wire-legend-a", "legend_src", "effect:in_1", "legend_now", "in_1")
	wire_b = wire("wire-legend-b", "legend_src", "effect:in_1", "legend_later", "in_1")
	cable_a = cable("wire-legend-a")
	cable_b = cable("wire-legend-b")
	cable_b["props"]["temporal"] = "delayed"
	cable_b["props"]["delayValue"] = "1.0"

	caption1_body = ("hook (orange, opens left) = this call rewrites its\n"
					  "argument in place. Port on the top edge = the only\n"
					  "way the mutated value leaves (no return channel).")
	caption2_body = "solid orange cable, 'mut' pill:\nthis value exists only because of the mutation."
	caption3_body = "dotted orange cable, 'mut z⁻¹ = 1.0' pill:\nsame, but read one iteration late."
	caption1 = note("legend-caption-1", 0, row1_h + NOTE_GAP_Y, caption1_body)
	caption2 = note("legend-caption-2", now_x, row1_h + NOTE_GAP_Y, caption2_body)
	caption3 = note("legend-caption-3", later_x, row1_h + NOTE_GAP_Y, caption3_body)
	row1_caption_h = max(note_height(wrap_note(caption1_body)), note_height(wrap_note(caption2_body)),
						  note_height(wrap_note(caption3_body)))

	row2_y = row1_h + NOTE_GAP_Y + row1_caption_h + NOTE_GAP_Y * 2
	prod_w, prod_h = block_size("producer", [], [port("out_1", "value", "int")], minimum=MIN_COMPANION_WIDTH)
	cons_w, cons_h = block_size("consumer", [port("in_1", "value", "int")], [], minimum=MIN_COMPANION_WIDTH)
	row2_h = max(prod_h, cons_h)
	prod = block("legend_producer", 0, row2_y + (row2_h - prod_h), title="producer",
				 inputs=[], outputs=[port("out_1", "value", "int")], w=prod_w, h=prod_h)
	cons_x = prod_w + GUTTER_X
	cons = block("legend_consumer", cons_x, row2_y + (row2_h - cons_h), title="consumer",
				 inputs=[port("in_1", "value", "int")], outputs=[], w=cons_w, h=cons_h)
	wire_c = wire("wire-legend-c", "legend_producer", "out_1", "legend_consumer", "in_1")
	cable_c = cable("wire-legend-c")
	caption4_body = "plain cable, no pill: an ordinary return value, for contrast\n(the board's other 'grey cable' look)."
	caption4 = note("legend-caption-4", 0, row2_y + row2_h + NOTE_GAP_Y, caption4_body)

	shapes += [src, now, later, cable_a, cable_b, caption1, caption2, caption3,
			   prod, cons, cable_c, caption4]
	bindings = wire_a + wire_b + wire_c
	content_w = max(row1_w, cons_x + cons_w)
	content_h = row2_y + row2_h + NOTE_GAP_Y + note_height(wrap_note(caption4_body))
	return shapes, bindings, round(content_w), round(content_h)


# ---------------------------------------------------------------------- main


def main() -> None:
	all_shapes: list[dict] = []
	all_bindings: list[dict] = []

	# MUST FIX #2: a 2-column macro layout so the whole board reads landscape
	# instead of the pre-fix 0.49-aspect portrait scroll. Column A stacks the
	# three EASY/MEDIUM row-shaped tiers; column B stacks the receiver tier
	# and the much taller HARD tier, which balances the two columns' heights.
	tiers_top = TOP_MARGIN + TITLE_HEIGHT + TITLE_GAP + 200 + TOPCARD_GAP

	col_a_x = 0
	col_b_frames: list[tuple[dict, list[dict], list[dict]]] = []
	col_a_frames: list[tuple[dict, list[dict], list[dict]]] = []

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
		hard_tier(), col_b_x, fr["y"] + h4 + FRAME_GUTTER, reserve_ordinal_row=False)
	col_b_frames.append((fr, shapes, bindings))

	col_a_bottom = col_a_frames[-1][0]["y"] + col_a_frames[-1][0]["props"]["h"]
	col_b_bottom = col_b_frames[-1][0]["y"] + col_b_frames[-1][0]["props"]["h"]
	col_b_w = max(w4, w5)

	# The legend is its own third column rather than a full-width band below
	# both — turning its height into macro WIDTH is what gets the whole board
	# from the pre-fix 0.49 portrait aspect to a landscape one (MUST FIX #2),
	# since the legend is short (~800u) next to either tier column (~1800u).
	col_c_x = col_b_x + col_b_w + COLUMN_GUTTER
	legend_content = build_legend()
	legend_fr, legend_shapes, legend_bindings, legend_w, legend_h = wrap_tier(
		"tier-legend", "Legend — what each mark means", legend_content, col_c_x, tiers_top,
		reserve_ordinal_row=False)

	total_h = max(col_a_bottom, col_b_bottom, legend_fr["y"] + legend_h) + BOTTOM_MARGIN
	total_w = col_c_x + legend_w

	for fr, shapes, bindings in col_a_frames + col_b_frames:
		all_shapes.append(fr)
		all_shapes += shapes
		all_bindings += bindings
	all_shapes.append(legend_fr)
	all_shapes += legend_shapes
	all_bindings += legend_bindings

	# MUST FIX #3: title gets its own band, >=60 units clear before anything
	# below it. MUST FIX #12: ONE real PASS WHEN card, folded together with
	# the orientation card near the top instead of the pre-fix board's
	# title/cue-1/cue-pass 4-way overlap — and no cue arrow is needed, since
	# numbering (#10) and the named tier frames (#5) already carry the
	# reading order that the old "Start here" arrow existed to supply.
	title_shape = text("t-title", 0, TOP_MARGIN,
						"The mutating line - 20 examples, easy to hard", size="xl")
	all_shapes.append(title_shape)

	card_y = TOP_MARGIN + TITLE_HEIGHT + TITLE_GAP
	callouts = [
		{
			# kind "step" (not "note") purely to satisfy the fixture helper's own
			# "at least one step callout must target something" gate — this board
			# is a static gallery, not a click-through, but "start reading here"
			# is a legitimate literal target for that arrow, and it doubles as
			# the reading-order cue the pre-fix board's overlapping cue-1 tried
			# and failed to give.
			"id": "orientation", "kind": "step", "x": 0, "y": card_y, "w": 480, "h": 280,
			"text": ("Start here. 20 real mutating calls, laid out easy to hard.\n"
					 "Each tier below is its own labeled frame; every example is\n"
					 "numbered 1-20 in orange. See the Legend frame (bottom) for\n"
					 "what every hook, port, and cable style means."),
			"target": {"shapeId": "r0c0", "anchor": "top"},
		},
		{
			"id": "pass", "kind": "pass", "x": 560, "y": card_y, "w": 640, "h": 240,
			"text": ("PASS WHEN\n"
					 "Every mutated argument shows a hook.\n"
					 "Every effect port sits on the top edge.\n"
					 "Tethers are right-angled, and may cross when ports do.\n"
					 "Nesting shows independently at each level.\n"
					 "The combined pill reads mut z⁻¹ = 1.0.\n"
					 "Simple view reveals the hook and the port on hover."),
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
