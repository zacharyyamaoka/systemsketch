"""Case view prototype, second pass: fold, active, and one-open-at-a-time.

Zach's 2026-09-02 feedback on the first pass, in six points, is the model:
transparency is the only thing a branch controls (per-edge Tunnel already
exists and stays per edge); Case view is the Expanded layout with exactly one
arm open, every arm header still visible; each arm header carries a "make
active" control; the data that decides the branch goes to the branch header,
never to the arms; a folded arm keeps only its header and its cables attach at
the row's edge centres, like Simple view; and no active arm means every arm is
active.  Every board is one scene rendered under (open arms, active arm); the
JS swaps pre-rendered layers and enforces Case view's one-open rule.
"""

from __future__ import annotations

import html
import itertools
from dataclasses import dataclass, field

from branch_board_svg import (
    ACCENT, ANY, INK, MUTED, NUMBER, REGION, SVG, THICK,
    block, boundary_in, boundary_out, cable, dot, frame, polycable, text,
)

DIM = 0.18


@dataclass
class BlockSpec:
    key: str
    x: float
    y: float
    w: float
    title: str
    inputs: list
    outputs: list


@dataclass
class ArmSpec:
    key: str
    label: str
    h: float
    muted: bool = False
    blocks: list = field(default_factory=list)
    regions: list = field(default_factory=list)


@dataclass
class RegionSpec:
    key: str
    x: float
    y: float
    w: float
    arms: list
    headers: list = field(default_factory=list)   # names of the values that decide the branch; dots on the band
    title: str = "Branch"


@dataclass
class CableSpec:
    src: str
    dst: str
    kind: str = "data"
    mid: float | None = None
    arms: tuple = ()          # the arm path this cable belongs to; () = outside every region
    passthrough: bool = False


@dataclass
class Scene:
    key: str
    w: int
    h: int
    frame: tuple
    inputs: list
    outputs: list
    blocks: list
    regions: list
    cables: list
    output_half_line: float | None = None


LABEL_H = 24
BAND_TOP = 30
BAND_NESTED = 22
PAD = 8


# --------------------------------------------------------------------------
# Layout
# --------------------------------------------------------------------------


class Layout:
    """Absolute positions for one (open, active) rendering of a scene."""

    def __init__(self, scene: Scene, open_arms: dict) -> None:
        self.scene, self.open = scene, open_arms
        self.blocks: dict[str, dict] = {}
        self.regions: dict[str, dict] = {}
        self.lane: dict[str, float] = {}
        self.region_of_path: dict[tuple, str] = {}

    def is_open(self, region_key: str, arm_key: str) -> bool:
        return arm_key in self.open.get(region_key, set())

    def run(self) -> None:
        for spec in self.scene.blocks:
            self.blocks[spec.key] = {"x": spec.x, "y": spec.y, "spec": spec, "arms": ()}
        for region in self.scene.regions:
            self._place_region(region, region.x, region.y, ())

    def _place_region(self, region: RegionSpec, x: float, y: float, path: tuple) -> float:
        nested = bool(path)
        band = BAND_NESTED if nested else BAND_TOP
        info = {"x": x, "y": y, "w": region.w, "right": x + region.w, "band": band, "nested": nested, "spec": region, "path": path, "arms": {}}
        self.regions[region.key] = info
        self.region_of_path[path] = region.key
        cy = y + band
        for index, arm in enumerate(region.arms):
            open_ = self.is_open(region.key, arm.key)
            row = {"row_top": cy, "row_cy": cy + LABEL_H / 2, "label_y": cy + 16, "divider_y": cy if index else None,
                   "open": open_, "body_top": cy + LABEL_H, "h": arm.h if open_ else 0, "spec": arm, "index": index}
            info["arms"][arm.key] = row
            arm_path = path + (arm.key,)
            if open_:
                for spec in arm.blocks:
                    self.blocks[spec.key] = {"x": x + spec.x, "y": cy + LABEL_H + spec.y, "spec": spec, "arms": arm_path}
                for sub in arm.regions:
                    self._place_region(sub, x + sub.x, cy + LABEL_H + sub.y, arm_path)
                if arm.muted:
                    self.lane[f"{region.key}/{arm.key}"] = cy + LABEL_H + arm.h / 2
            else:
                for spec in arm.blocks:
                    self.blocks[spec.key] = {"folded": True, "spec": spec, "arms": arm_path}
                for sub in arm.regions:
                    self._register_folded(sub, arm_path)
            cy += LABEL_H + row["h"]
        info["h"] = cy - y + PAD
        return info["h"]

    def _register_folded(self, region: RegionSpec, path: tuple) -> None:
        self.regions[region.key] = {"folded": True, "spec": region, "path": path, "arms": {}}
        self.region_of_path[path] = region.key
        for arm in region.arms:
            arm_path = path + (arm.key,)
            for spec in arm.blocks:
                self.blocks[spec.key] = {"folded": True, "spec": spec, "arms": arm_path}
            for sub in arm.regions:
                self._register_folded(sub, arm_path)

    def fold_attach(self, arms: tuple, side: str):
        """The edge-centre of the outermost folded arm row on this path, or None if nothing on the path is folded."""
        for depth in range(len(arms)):
            region_key = self.region_of_path[arms[:depth]]
            info = self.regions[region_key]
            if info.get("folded"):
                continue
            row = info["arms"][arms[depth]]
            if not row["open"]:
                return (info["x"], row["row_cy"]) if side == "in" else (info["right"], row["row_cy"])
        return None


# --------------------------------------------------------------------------
# Rendering
# --------------------------------------------------------------------------


class Renderer:
    def __init__(self, scene: Scene, open_arms: dict, active: str | None, board_key: str, view: str = "expanded") -> None:
        self.scene, self.active, self.board, self.view = scene, active, board_key, view
        self.layout = Layout(scene, open_arms)
        self.layout.run()
        self.svg = SVG(scene.w, scene.h)
        self.ports: dict[str, tuple] = {}

    def opacity(self, arms: tuple) -> float:
        if self.active is None or not arms:
            return 1.0
        return 1.0 if arms[0] == self.active else DIM

    def draw(self) -> str:
        svg, scene, lay = self.svg, self.scene, self.layout
        fx, fy, fw, fh = scene.frame
        frame(svg, fx, fy, fw, fh, "run()")
        for name, y, typ, color in scene.inputs:
            self.ports[f"in:{name}"] = boundary_in(svg, fx, y, name, typ, color)
        for name, y, typ, arms in scene.outputs:
            self.ports[f"out:{name}"] = boundary_out(svg, fx + fw, y, name, typ, ANY, True, opacity=max(self.opacity(arms), 0.55))
        if scene.output_half_line:
            svg.add(f'<line x1="{fx + fw - 46}" y1="{scene.output_half_line}" x2="{fx + fw}" y2="{scene.output_half_line}" stroke="{THICK}" stroke-width="1.8"/>')
        for region in scene.regions:
            self.draw_region(region)
        for key, info in lay.blocks.items():
            if info.get("folded"):
                continue
            self.draw_block(info)
        for c in scene.cables:
            self.draw_cable(c)
        return svg.render(f"{scene.key}")

    def draw_block(self, info: dict) -> None:
        spec: BlockSpec = info["spec"]
        ports = block(self.svg, info["x"], info["y"], spec.w, spec.title, spec.inputs, spec.outputs, opacity=self.opacity(info["arms"]))
        for name, pos in ports["in"].items():
            if isinstance(pos, dict):
                for k, p in pos.items():
                    self.ports[f"blk:{spec.key}.{name}#{k}"] = p
            elif isinstance(pos, list):
                for k, p in enumerate(pos):
                    self.ports[f"blk:{spec.key}.{name}#{k}"] = p
            else:
                self.ports[f"blk:{spec.key}.{name}"] = pos
        for name, pos in ports["out"].items():
            self.ports[f"blk:{spec.key}.{name}"] = pos

    def draw_region(self, region: RegionSpec) -> None:
        svg, info = self.svg, self.layout.regions[region.key]
        if info.get("folded"):
            return
        x, y, w, h = info["x"], info["y"], info["w"], info["h"]
        nested = info["nested"]
        band = info["band"]
        stroke = REGION if not nested else "#c9ccd5"
        group_opacity = self.opacity(info["path"])
        svg.add(f'<g opacity="{group_opacity}">')
        svg.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="4" fill="none" stroke="{stroke}" stroke-width="{1.2 if not nested else 1}"/>')
        svg.add(f'<line x1="{x}" y1="{y + band}" x2="{x + w}" y2="{y + band}" stroke="{stroke}" stroke-width="1"/>')
        if nested:
            svg.add(text(x + w / 2, y + 15, region.title, size=11, mono=True, anchor="middle", color=MUTED))
        else:
            svg.add(text(x + w / 2, y + 20, region.title, size=15, mono=True, anchor="middle", color=INK))
        # the values that decide the branch land on the band, never on an arm
        n = len(region.headers)
        for i, name in enumerate(region.headers):
            hy = y + band * (i + 1) / (n + 1)
            svg.add(dot(x, hy, ANY, True, r=5))
            svg.add(text(x + 12, hy + 4, name, size=10.5, color=MUTED))
            self.ports[f"hdr:{region.key}/{name}"] = (x, hy)
            if n == 1:
                self.ports[f"hdr:{region.key}"] = (x, hy)
        for arm in region.arms:
            a = info["arms"][arm.key]
            if a["divider_y"] is not None:
                width = 2.2 if not nested else 1.1
                color = THICK if not nested else "#8d919c"
                svg.add(f'<line x1="{x}" y1="{a["divider_y"]}" x2="{x + w}" y2="{a["divider_y"]}" stroke="{color}" stroke-width="{width}"/>')
            arm_path = info["path"] + (arm.key,)
            arm_opacity = self.opacity(arm_path) / group_opacity if group_opacity else 1.0
            is_active = (not nested) and self.active == arm.key
            svg.add(f'<g opacity="{arm_opacity if not is_active else 1.0}">')
            chevron = "⌄" if a["open"] else "›"
            svg.add(text(x + 16, a["label_y"], chevron, size=12 if a["open"] else 14, color=MUTED))
            svg.add(text(x + 28, a["label_y"], arm.label, size=12, weight=700, color=ACCENT if is_active else (MUTED if arm.muted else INK), italic=arm.muted))
            # the make-active control, on every arm header
            if not nested:
                tx, ty = x + w - 18, a["row_cy"]
                if is_active:
                    svg.add(f'<circle cx="{tx}" cy="{ty}" r="6" fill="{ACCENT}" stroke="{ACCENT}" stroke-width="1.4"/>')
                    svg.add(f'<circle cx="{tx}" cy="{ty}" r="2" fill="#fff"/>')
                    svg.add(text(tx - 12, ty + 4, "active", size=10, color=ACCENT, anchor="end", weight=600))
                else:
                    svg.add(f'<circle cx="{tx}" cy="{ty}" r="6" fill="none" stroke="{MUTED}" stroke-width="1.2" opacity="0.7"/>')
                    svg.add(f'<circle cx="{tx}" cy="{ty}" r="1.6" fill="{MUTED}" opacity="0.7"/>')
                svg.add(f'<rect class="hit" data-board="{self.board}" data-action="active" data-arm="{arm.key}" x="{tx - 14}" y="{ty - 12}" width="28" height="24" fill="transparent" style="cursor:pointer"><title>make {arm.key} the active case</title></rect>')
            svg.add(f'<rect class="hit" data-board="{self.board}" data-action="fold" data-region="{region.key}" data-arm="{arm.key}" x="{x}" y="{a["row_top"]}" width="{min(w - 40, 260)}" height="{LABEL_H}" fill="transparent" style="cursor:pointer"><title>{"fold" if a["open"] else "open"} {arm.key}</title></rect>')
            svg.add("</g>")
        svg.add("</g>")
        for arm in region.arms:
            a = info["arms"][arm.key]
            if a["open"]:
                for sub in arm.regions:
                    self.draw_region(sub)

    # -- cables -------------------------------------------------------------

    def endpoint(self, ref: str, side: str):
        """Resolve a cable end; if it sits inside a folded arm, attach at that arm's header edge instead."""
        if ref.startswith("blk:"):
            key = ref[4:].split(".")[0]
            info = self.layout.blocks.get(key)
            if info is None:
                return None
            attach = self.layout.fold_attach(info["arms"], side)
            if attach is not None:
                return attach
            return self.ports.get(ref)
        if ref.startswith("hdr:"):
            region_key = ref[4:].split("/")[0]
            info = self.layout.regions.get(region_key)
            if info is None:
                return None
            attach = self.layout.fold_attach(info["path"], side)
            if attach is not None:
                return attach
            return self.ports.get(ref)
        return self.ports.get(ref)

    def touches_folded(self, c: CableSpec) -> bool:
        """Whether either end of the cable sits inside an arm that is folded at any level."""
        for ref in (c.src, c.dst):
            if ref.startswith("blk:"):
                info = self.layout.blocks.get(ref[4:].split(".")[0])
                if info is not None and self.layout.fold_attach(info["arms"], "in") is not None:
                    return True
            elif ref.startswith("hdr:"):
                info = self.layout.regions.get(ref[4:].split("/")[0])
                if info is not None and self.layout.fold_attach(info["path"], "in") is not None:
                    return True
        return False

    def draw_cable(self, c: CableSpec) -> None:
        opacity = self.opacity(c.arms)
        if self.view == "case" and self.touches_folded(c):
            return  # Case view shows the wires of the open case only
        if c.passthrough:
            self.draw_passthrough(c, opacity)
            return
        src = self.endpoint(c.src, "out")
        dst = self.endpoint(c.dst, "in")
        if src is None or dst is None or src == dst:
            return
        # a cable wholly inside one folded arm has nothing to attach to
        src_folded = c.src.startswith("blk:") and self.layout.blocks[c.src[4:].split(".")[0]].get("folded")
        dst_folded = c.dst.startswith("blk:") and self.layout.blocks[c.dst[4:].split(".")[0]].get("folded")
        if src_folded and dst_folded:
            return
        self.svg.add(cable(src, dst, kind=c.kind, mid=c.mid, opacity=opacity))

    def draw_passthrough(self, c: CableSpec, opacity: float) -> None:
        lane_key = c.kind
        inner_key = lane_key.split("/")[0]
        lane_y = self.layout.lane.get(lane_key)
        inner = self.layout.regions.get(inner_key)
        src = self.endpoint(c.src, "out")
        dst = self.endpoint(c.dst, "in")
        if src is None or dst is None:
            return
        if inner is None or inner.get("folded"):
            # the whole safe arm is folded: the pass-through is one more cable out of its header
            if src != dst:
                self.svg.add(cable(src, dst, mid=c.mid, opacity=opacity))
            return
        if lane_y is None:
            # the inner (unchanged) lane is folded: in at its header's left edge, out at its right edge
            row = inner["arms"][c.arms[-1]]
            left, right = (inner["x"], row["row_cy"]), (inner["right"], row["row_cy"])
            self.svg.add(cable(src, left, mid=src[0] + 12, opacity=opacity))
            self.svg.add(cable(right, dst, mid=c.mid, opacity=opacity))
            return
        mid = c.mid or (inner["right"] + 32)
        points = [src, (src[0] + 12, src[1]), (src[0] + 12, lane_y), (mid, lane_y), (mid, dst[1]), dst]
        self.svg.add(polycable(points, opacity=opacity))


# --------------------------------------------------------------------------
# Scenes — the report's fixtures in V1, control data on the band
# --------------------------------------------------------------------------


def scene_a() -> Scene:
    return Scene(
        key="a", w=1380, h=600, frame=(20, 20, 1340, 560),
        inputs=[("raws", 175, "bytes", ANY), ("gain", 310, "float", NUMBER), ("fast", 450, "bool", ANY)],
        outputs=[("bytes", 341, "bytes", ())],
        blocks=[
            BlockSpec("decode", 150, 120, 200, "decode()", [{"name": "raw", "type": "bytes"}], [{"name": "Frame"}]),
            BlockSpec("encode", 1030, 290, 200, "encode()", [{"name": "pose", "type": "Pose"}], [{"name": "bytes"}]),
        ],
        regions=[RegionSpec("br", 440, 130, 460, headers=["fast"], arms=[
            ArmSpec("if", "if fast:", 144, blocks=[BlockSpec("estimate", 120, 20, 230, "estimate()", [{"name": "frame", "type": "Frame"}, {"name": "gain", "type": "Float", "color": NUMBER}], [{"name": "Pose"}])]),
            ArmSpec("else", "else:", 166, blocks=[BlockSpec("fallback", 120, 30, 230, "fallback()", [{"name": "frame", "type": "Frame"}], [{"name": "Pose"}])]),
        ])],
        cables=[
            CableSpec("in:raws", "blk:decode.raw"),
            CableSpec("in:fast", "hdr:br", kind="control", mid=400),
            CableSpec("blk:decode.Frame", "blk:estimate.frame", mid=410, arms=("if",)),
            CableSpec("blk:decode.Frame", "blk:fallback.frame", mid=410, arms=("else",)),
            CableSpec("in:gain", "blk:estimate.gain", mid=380, arms=("if",)),
            CableSpec("blk:estimate.Pose", "blk:encode.pose", mid=960, arms=("if",)),
            CableSpec("blk:fallback.Pose", "blk:encode.pose", mid=960, arms=("else",)),
            CableSpec("blk:encode.bytes", "out:bytes", mid=1300),
        ],
    )


def scene_b() -> Scene:
    return Scene(
        key="b", w=1380, h=560, frame=(20, 20, 1340, 520),
        inputs=[("raws", 175, "bytes", ANY), ("gain", 300, "float", NUMBER), ("fast", 440, "bool", ANY)],
        outputs=[("bytes", 256, "bytes", ("if",)), ("Pose", 436, "Pose", ("else",))],
        output_half_line=330,
        blocks=[BlockSpec("decode", 150, 120, 200, "decode()", [{"name": "raw", "type": "bytes"}], [{"name": "Frame"}])],
        regions=[RegionSpec("br", 440, 130, 620, headers=["fast"], arms=[
            ArmSpec("if", "if fast:", 144, blocks=[
                BlockSpec("estimate", 60, 20, 220, "estimate()", [{"name": "frame", "type": "Frame"}, {"name": "gain", "type": "Float", "color": NUMBER}], [{"name": "Pose"}]),
                BlockSpec("encode", 360, 20, 190, "encode()", [{"name": "pose", "type": "Pose"}], [{"name": "bytes"}]),
            ]),
            ArmSpec("else", "else:", 166, blocks=[BlockSpec("fallback", 60, 30, 220, "fallback()", [{"name": "frame", "type": "Frame"}], [{"name": "Pose"}])]),
        ])],
        cables=[
            CableSpec("in:raws", "blk:decode.raw"),
            CableSpec("in:fast", "hdr:br", kind="control", mid=400),
            CableSpec("blk:decode.Frame", "blk:estimate.frame", mid=410, arms=("if",)),
            CableSpec("blk:decode.Frame", "blk:fallback.frame", mid=410, arms=("else",)),
            CableSpec("in:gain", "blk:estimate.gain", mid=380, arms=("if",)),
            CableSpec("blk:estimate.Pose", "blk:encode.pose", mid=760, arms=("if",)),
            CableSpec("blk:encode.bytes", "out:bytes", mid=1200, arms=("if",)),
            CableSpec("blk:fallback.Pose", "out:Pose", mid=1200, arms=("else",)),
        ],
    )


def scene_c() -> Scene:
    return Scene(
        key="c", w=1380, h=730, frame=(20, 20, 1340, 690),
        inputs=[("raws", 175, "bytes", ANY), ("gain", 330, "float", NUMBER), ("mode", 540, "str", "#4caf50")],
        outputs=[("payload", 451, "bytes", ())],
        blocks=[
            BlockSpec("decode", 150, 120, 200, "decode()", [{"name": "raw", "type": "bytes"}], [{"name": "Frame"}]),
            BlockSpec("encode", 1060, 400, 200, "encode()", [{"name": "pose", "type": "Pose"}], [{"name": "bytes"}]),
        ],
        regions=[RegionSpec("outer", 430, 120, 530, headers=["mode"], arms=[
            ArmSpec("fast", 'if mode == "fast":', 130, blocks=[BlockSpec("estimate", 110, 14, 230, "estimate()", [{"name": "frame", "type": "Frame"}, {"name": "gain", "type": "Float", "color": NUMBER}], [{"name": "Pose"}])]),
            ArmSpec("safe", 'elif mode == "safe":', 236,
                    blocks=[BlockSpec("fallback", 40, 26, 170, "fallback()", [{"name": "frame", "type": "Frame"}], [{"name": "Pose"}])],
                    regions=[RegionSpec("inner", 227, 8, 245, headers=["gain"], arms=[
                        ArmSpec("if", "if gain > 1.0:", 96, blocks=[BlockSpec("refine", 40, 20, 170, "refine()", [{"name": "pose", "type": "Pose"}], [{"name": "Pose"}])]),
                        ArmSpec("unchanged", "(unchanged)", 40, muted=True),
                    ])]),
            ArmSpec("else", "else:", 92, blocks=[BlockSpec("identity", 110, 24, 190, "identity()", [{"name": "frame", "type": "Frame"}], [{"name": "Pose"}])]),
        ])],
        cables=[
            CableSpec("in:raws", "blk:decode.raw"),
            CableSpec("in:mode", "hdr:outer", kind="control", mid=395),
            CableSpec("blk:decode.Frame", "blk:estimate.frame", mid=400, arms=("fast",)),
            CableSpec("blk:decode.Frame", "blk:fallback.frame", mid=400, arms=("safe",)),
            CableSpec("blk:decode.Frame", "blk:identity.frame", mid=400, arms=("else",)),
            CableSpec("in:gain", "blk:estimate.gain", mid=380, arms=("fast",)),
            CableSpec("in:gain", "hdr:inner", kind="control", mid=380, arms=("safe",)),
            CableSpec("blk:fallback.Pose", "blk:refine.pose", mid=660, arms=("safe", "if")),
            CableSpec("blk:refine.Pose", "blk:encode.pose", mid=995, arms=("safe", "if")),
            CableSpec("blk:fallback.Pose", "blk:encode.pose", kind="inner/unchanged", mid=1015, arms=("safe", "unchanged"), passthrough=True),
            CableSpec("blk:estimate.Pose", "blk:encode.pose", mid=975, arms=("fast",)),
            CableSpec("blk:identity.Pose", "blk:encode.pose", mid=1035, arms=("else",)),
            CableSpec("blk:encode.bytes", "out:payload", mid=1310),
        ],
    )


# --------------------------------------------------------------------------
# Section
# --------------------------------------------------------------------------


def subsets(keys: list) -> list[tuple]:
    out = []
    for r in range(len(keys) + 1):
        out.extend(itertools.combinations(keys, r))
    return out


def layer_id(board: str, view: str, outer_open: tuple, inner_open: tuple | None, active: str | None) -> str:
    o = "+".join(outer_open) or "none"
    i = "x" if inner_open is None else ("+".join(inner_open) or "none")
    return f"{board}-{view}-o{o}-i{i}-a{active or 'none'}"


def render_all(scene: Scene, outer: str, outer_arms: list, inner: str | None, inner_arms: list, actives: list) -> list[tuple[str, str]]:
    """Expanded: every open-set.  Case: at most one open arm per region, and only that arm's wires."""
    out = []
    for view in ("exp", "case"):
        outer_states = subsets(outer_arms) if view == "exp" else [()] + [(a,) for a in outer_arms]
        for outer_open in outer_states:
            if inner and "safe" in outer_open:
                inner_states = subsets(inner_arms) if view == "exp" else [()] + [(a,) for a in inner_arms]
            else:
                inner_states = [None]
            for inner_open in inner_states:
                for active in actives:
                    open_arms = {outer: set(outer_open)}
                    if inner_open is not None:
                        open_arms[inner] = set(inner_open)
                    renderer = Renderer(scene, open_arms, active, scene.key, view="case" if view == "case" else "expanded")
                    out.append((layer_id(scene.key, view, outer_open, inner_open, active), renderer.draw()))
    return out


def board_html(scene: Scene, outer: str, outer_arms: list, inner: str | None, inner_arms: list, actives: list, caption: str) -> str:
    svgs = render_all(scene, outer, outer_arms, inner, inner_arms, actives)
    layers = "".join(f'<div class="layer" id="{sid}" hidden>{svg}</div>' for sid, svg in svgs)
    k = scene.key
    open_boxes = "".join(f'<label><input type="checkbox" name="{k}-open" value="{a}" checked> {html.escape(a)}</label>' for a in outer_arms)
    inner_boxes = ""
    if inner:
        inner_boxes = f'<span class="ctl"><b>inner open</b> ' + "".join(f'<label><input type="checkbox" name="{k}-inner" value="{a}" checked> {html.escape(a)}</label>' for a in inner_arms) + "</span>"
    active_radios = "".join(f'<label><input type="radio" name="{k}-active" value="{a or "none"}"{" checked" if a is None else ""}> {html.escape(a or "none")}</label>' for a in actives)
    return f'''<div class="proto" data-board="{k}" data-arms="{",".join(outer_arms)}" data-inner="{",".join(inner_arms)}" data-actives="{",".join(a or "none" for a in actives)}">
<div class="controls">
<span class="ctl"><b>view</b> <label><input type="radio" name="{k}-view" value="expanded" checked> Expanded</label> <label><input type="radio" name="{k}-view" value="case"> Case</label></span>
<span class="ctl"><b>open</b> {open_boxes}</span>
{inner_boxes}
<span class="ctl"><b>active</b> {active_radios}</span>
<span class="ctl small" data-role="hint"></span>
</div>
<figure>{layers}<figcaption>{caption}</figcaption></figure>
</div>'''


PROTO_CSS = """
.proto .controls{display:flex;flex-wrap:wrap;gap:8px 22px;padding:10px 4px 2px;font-size:13px;align-items:baseline}
.proto .ctl b{margin-right:6px;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em}
.proto label{margin-right:8px;cursor:pointer}
.proto .layer[hidden]{display:none}
.proto figure{margin-top:8px}
ul.checks{list-style:none;padding:0;columns:2;column-gap:28px;max-width:1200px;font-size:13.5px}
ul.checks li{break-inside:avoid;padding:4px 0}
ul.checks .tick{color:var(--ok);font-weight:900;margin-right:8px}
"""

PROTO_JS = """
(function(){
  document.querySelectorAll('.proto').forEach(function(p){
    var b=p.dataset.board, arms=p.dataset.arms.split(','), inner=(p.dataset.inner||'').split(',').filter(Boolean);
    var st={view:'expanded',open:new Set(arms),inner:new Set(inner),active:null};
    function id(){
      var o=arms.filter(function(a){return st.open.has(a)}).join('+')||'none';
      var i='x'; if(inner.length&&st.open.has('safe')){i=inner.filter(function(a){return st.inner.has(a)}).join('+')||'none';}
      return b+'-'+(st.view==='case'?'case':'exp')+'-o'+o+'-i'+i+'-a'+(st.active||'none');
    }
    function enforceCase(){
      if(st.view!=='case')return;
      var keep=arms.filter(function(a){return st.open.has(a)}); if(keep.length>1)st.open=new Set([keep[0]]);
      var ki=inner.filter(function(a){return st.inner.has(a)}); if(ki.length>1)st.inner=new Set([ki[0]]);
    }
    function paint(){
      enforceCase();
      var want=id();
      p.querySelectorAll('.layer').forEach(function(l){l.hidden=(l.id!==want)});
      p.querySelectorAll('input[name="'+b+'-view"]').forEach(function(r){r.checked=(r.value===st.view)});
      p.querySelectorAll('input[name="'+b+'-open"]').forEach(function(c){c.checked=st.open.has(c.value)});
      p.querySelectorAll('input[name="'+b+'-inner"]').forEach(function(c){c.checked=st.inner.has(c.value); c.disabled=!st.open.has('safe')});
      p.querySelectorAll('input[name="'+b+'-active"]').forEach(function(r){r.checked=((st.active||'none')===r.value)});
      var hint=p.querySelector('[data-role=hint]'); if(hint)hint.textContent=(st.view==='case'?'Case: at most one arm open per region, and only the wires of that arm are drawn.':'Expanded: any arms open; click a header to fold, the target to make active.')+(st.active?' Active: '+st.active+' (others fade).':' No active arm: all arms active.');
    }
    function toggleOpen(set,key){
      if(st.view==='case'){ if(set.has(key)){set.clear()} else {set.clear();set.add(key)} }
      else { if(set.has(key))set.delete(key); else set.add(key) }
    }
    p.addEventListener('change',function(e){
      var n=e.target.name||'';
      if(n===b+'-view'){st.view=e.target.value}
      if(n===b+'-open'){toggleOpen(st.open,e.target.value)}
      if(n===b+'-inner'){toggleOpen(st.inner,e.target.value)}
      if(n===b+'-active'){st.active=(e.target.value==='none')?null:e.target.value}
      paint();
    });
    p.addEventListener('click',function(e){
      var h=e.target.closest('.hit'); if(!h)return;
      if(h.dataset.action==='fold'){ if(h.dataset.region==='inner')toggleOpen(st.inner,h.dataset.arm); else toggleOpen(st.open,h.dataset.arm); }
      if(h.dataset.action==='active'){ st.active=(st.active===h.dataset.arm)?null:h.dataset.arm; }
      paint();
    });
    paint();
  });
})();
"""


def acceptance_html() -> str:
    from pathlib import Path
    import json
    path = Path(__file__).resolve().parent / "assets" / "branch-case-view-acceptance.json"
    if not path.exists():
        return "<p class='small'>Browser journey not yet run: <code>npm run test:case-view</code>.</p>"
    checks = json.loads(path.read_text(encoding="utf-8"))
    passed = sum(1 for c in checks if c.get("ok"))
    items = "".join(f"<li><span class='tick'>{'✓' if c.get('ok') else '✗'}</span> {html.escape(c['label'])}</li>" for c in checks)
    return f"<p><b>{passed}/{len(checks)} real-browser checks</b> — <code>tests/branch_case_view_smoke.mjs</code> drives this page over CDP with real mouse events: the fold chevrons and make-active targets on the canvas, the checkboxes and radios, the Case-view one-open rule on both the outer and the nested region, and reads which layer is visible after each gesture.</p><ul class='checks'>{items}</ul>"


def section_html() -> str:
    a = board_html(scene_a(), "br", ["if", "else"], None, [], [None, "if", "else"],
                   "<b>09_branch.</b> <code>fast</code> lands on the Branch band, not on an arm. Click an arm header (or its chevron) to fold it: in Expanded the arm keeps its header and its cables attach at the row's edge centres, like Simple view. Click the target at the right of a header to make that arm active; the others fade. Case view is the same layout with at most one arm open and only that arm's wires; <code>encode.pose</code> is one plain port either way.")
    c = board_html(scene_c(), "outer", ["fast", "safe", "else"], "inner", ["if", "unchanged"], [None, "safe"],
                   "<b>elif chain with a nested if.</b> <code>mode</code> lands on the outer band, <code>gain</code> on the inner band. Four cables fan into one <code>encode.pose</code>. The inner region folds on its own; in Expanded, fold <i>(unchanged)</i> and the pass-through enters its header on the left and leaves on the right; fold <i>safe</i> and everything inside collapses to one header row with two cables leaving it. In Case view only the open path's cables remain.")
    b = board_html(scene_b(), "br", ["if", "else"], None, [], [None, "if", "else"],
                   "<b>Optional returns.</b> In Expanded a folded arm still feeds its boundary output row from its header's right edge; fold both and the region is two header rows with one cable each. In Case view the row the shown case does not feed is simply unwired.")
    return f'''<h2 id="case-view">0 · Your pick, prototyped (second pass): fold, active, one open at a time</h2>
<p class="lede">Your six points on the first pass are the model here. <b>Transparency is the only thing a branch controls</b>: hide and tunnel are gone from the branch (per-edge Tunnel already exists in pyblocks and stays a property of the edge). <b>Case view is the Expanded layout with at most one arm open</b>, every arm header still visible, no ◀ ▶. <b>Every arm header carries a make-active target</b>; clicking the active one again clears it, and no active arm means all arms are active. <b>The value that decides the branch lands on the band</b>, never on an arm. <b>A folded arm keeps only its header</b>, and in Expanded view its cables attach at the row's edge centres, the way Simple view attaches cables to a Block; in Case view the folded arms' wires are not drawn at all. <b>The consumer has one plain port</b>: the arms' cables fan into <code>encode.pose</code> the way any fan-in does, with no sub-slots.</p>
<div class="callout"><b>What the second pass settles</b> (third pass, 10:51: single port, Case view hides folded wires). (1) Fold and active are orthogonal and both survive the view switch: Case view adds the one-open rule and drops the wires of every folded arm, so the open case reads as one straight dataflow. (2) Folding composes with nesting: fold the outer <i>safe</i> arm and the inner region folds with it, its cables collapsing onto the outer header; open <i>safe</i> and fold only <i>(unchanged)</i> and the pass-through becomes a cable into that header and a cable out of it. (3) Because the condition lives on the band, an arm header has exactly two affordances, fold and make-active, and nothing else to learn. (4) The per-edge Tunnel (<code>tunnelRouteIsRevealed</code> in pyblocks: the long run hides, the two stubs stay, revealed by its layer, the edge, an endpoint node, or a port reattachment) is the right tool for one noisy cable; the branch never needs it.</div>
{a}
{c}
{b}
{acceptance_html()}
<p class="small">Prototype only: SVG in the SystemSketch idiom, one pre-rendered layer per (view, open arms, active arm) state, swapped by a few lines of JavaScript that also enforce Case view's one-open rule. Nothing here runs in the app; the region shape does not exist yet.</p>
'''
