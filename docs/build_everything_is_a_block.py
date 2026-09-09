#!/usr/bin/env python3
"""Build reports/everything-is-a-block-2026-09-09.html — Zach's thesis, judged.

The thesis (2026-09-09, his words): every system-design primitive — types, type
mappings, loops, regions, behaviour-tree nodes — can be "just Blocks that we
nest and style in a couple of ways", giving one small visual grammar and much
less code, because to date each primitive was built differently.

This page is a THINKING artifact, not a change: it reconstructs the thesis
precisely, states weighted criteria from his own values, says what the frame
is not seeing, reads the prior art, and proposes the version that survives —
one anatomy, one containment tree, one text seam, one closed style vocabulary,
AND an explicit `kind` with a per-kind contract.

Every number on the page is measured from the tree at build time (`need()`
fails the build when a claim's evidence is gone), and the board statistics are
read from Zach's own `.systemsketch` files when they are on this machine. Text
and inline SVG only — no captures — so the page stays on the tracked side of
`tests/test_report_weight.py`.
"""
from __future__ import annotations

import collections
import glob
import json
import os
import re
import subprocess
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NAME = "everything-is-a-block"
# WHY a pinned date and not date.today(): the file name is the report's
# identity (it is what gets linked from the vault); a rebuild next week must
# overwrite the same page, not spawn a second one.
DATE = "2026-09-09"
OUT = Path(os.environ.get("SYSTEMSKETCH_REPORT_OUTPUT", ROOT / f"reports/{NAME}-{DATE}.html"))
BOARDS_DIR = Path(os.environ.get("SYSTEMSKETCH_BOARDS_DIR", "/home/bam/SystemSketch"))
PYBLOCKS_CODEC = Path("/home/bam/pyblocks/pyblocks/systemsketch_codec.py")


def read(name: str) -> str:
    return (ROOT / name).read_text(encoding="utf-8")


def need(text: str, token: str, label: str) -> None:
    if token not in text:
        raise SystemExit(f"report is stale — expected {label}: {token!r}")


def absent(text: str, token: str, label: str) -> None:
    if token in text:
        raise SystemExit(f"report is stale — {label} is present again: {token!r}")


def git(*args: str) -> str:
    try:
        return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=False).stdout.strip()
    except OSError:
        return ""


def source_files(sub: str = "src") -> list[Path]:
    files = []
    for ext in ("*.ts", "*.tsx", "*.css"):
        files.extend(p for p in (ROOT / sub).rglob(ext) if ".test." not in p.name)
    return files


def line_count(sub: str) -> tuple[int, int]:
    files = [p for p in source_files(sub)]
    return sum(p.read_text(encoding="utf-8").count("\n") for p in files), len([p for p in files if p.suffix != ".css"])


def array_names(text: str, const: str) -> list[str]:
    """The identifiers listed in `const NAME = [ ... ]`, spreads included as `...X`."""
    match = re.search(rf"const {const}\s*=\s*\[(.*?)\]", text, re.S)
    if not match:
        raise SystemExit(f"report is stale — {const} not found")
    body = re.sub(r"//.*", "", match.group(1))
    return [t.strip() for t in body.split(",") if t.strip()]


def first_int(pattern: str, files: list[Path]) -> int | None:
    for path in files:
        match = re.search(pattern, path.read_text(encoding="utf-8"))
        if match:
            return int(match.group(1))
    return None


def board_stats() -> dict | None:
    """Read-only statistics over Zach's own boards. Never writes, never opens the app."""
    paths = sorted(glob.glob(str(BOARDS_DIR / "*.systemsketch")))
    if not paths:
        return None
    by_type: collections.Counter[str] = collections.Counter()
    depth: collections.Counter[int] = collections.Counter()
    block_types: collections.Counter[str] = collections.Counter()
    type_children: collections.Counter[int] = collections.Counter()
    boards = 0
    for path in paths:
        try:
            doc = json.loads(Path(path).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        records = doc.get("records") or doc.get("document", {}).get("store", {}) or doc.get("store", {})
        if isinstance(records, dict):
            records = list(records.values())
        shapes = [r for r in records if isinstance(r, dict) and r.get("typeName") == "shape"]
        if not shapes:
            continue
        boards += 1
        by_id = {s["id"]: s for s in shapes}
        children = collections.Counter(s.get("parentId") for s in shapes)
        for shape in shapes:
            by_type[shape["type"]] += 1
            level, parent = 0, shape.get("parentId")
            while parent in by_id:
                level, parent = level + 1, by_id[parent].get("parentId")
            depth[level] += 1
            if shape["type"] == "block":
                label = (shape.get("props", {}).get("blockType") or "").strip().lower()
                block_types[label] += 1
                if label == "type":
                    type_children[children.get(shape["id"], 0)] += 1
    return {
        "boards": boards,
        "shapes": sum(by_type.values()),
        "by_type": by_type.most_common(),
        "depth": sorted(depth.items()),
        "block_types": block_types.most_common(),
        "type_blocks": sum(type_children.values()),
        "type_children": sorted(type_children.items()),
    }


def measured() -> dict:
    app = read("src/App.tsx")
    model = read("src/blocks/blockModel.ts")
    type_attrs = read("src/blocks/typeAttributes.ts")
    mapping = read("src/blocks/babble/typeMappingShared.ts")
    bt_model = read("src/behaviorTree/behaviorTreeModel.ts")
    linking = read("src/blocks/definitions/definitionLinking.ts")
    member_stack = read("src/blocks/memberStack.ts")
    member_layout = read("src/blocks/memberLayout.ts")
    region = read("src/blocks/RegionShapeUtil.ts")
    registered = read("src/detach/registeredKinds.ts")
    subject = read("src/chrome/inspectorSubject.ts")
    canvas = read("src/blocks/ui/BlockCanvas.tsx")
    migrations = read("src/blocks/blockShapeMigrations.ts")
    async_model = read("src/asyncRegion/asyncRegionModel.ts")
    branch_model = read("src/branch/branchModel.ts")
    loop_model = read("src/loop/loopModel.ts")
    lane = read("src/blocks/portLane.ts")
    pkg = read("package.json")

    # --- the four things the thesis rests on, as they exist today ---------
    need(type_attrs, "export const TYPE_BLOCK_TYPE = 'type'", "a Type is a Block with blockType 'type'")
    need(type_attrs, "attributeSource: base.attributeSource || 'field: Type'", "a Type's body is text")
    need(mapping, "export function isTypeMappingBlock(", "a Type Mapping is recognised by a predicate")
    # WHY measured and not assumed: this branch still recognises a Type Mapping
    # by a meta stamp; main promoted it to a blockType after the branch was cut.
    # The page must say what the tree it measures says, and the switch of
    # carrier is itself evidence for the argument.
    mapping_carrier = (
        "blockType" if "TYPE_MAPPING_BLOCK_TYPE = 'typeMapping'" in mapping
        else "meta" if "meta?.typeMappingBabbleVariant" in mapping
        else None
    )
    if mapping_carrier is None:
        raise SystemExit("report is stale — cannot tell how a Type Mapping is recognised")
    need(app, "AsyncRegionTool", "the Async region tool")
    need(model, "export const BLOCK_VIEWS = ['simple', 'port', 'expanded', 'value'] as const", "a Pill is the Block's value view")
    need(async_model, "if (shape?.type !== 'frame') return false", "an Async region is a stock frame plus a meta stamp")
    need(model, "export const UNRESOLVED_BLOCK_TYPE = 'unresolved'", "blockType carries the unresolved kind")
    need(model, "export const PROJECTION_BLOCK_TYPE = 'unbundle'", "blockType carries the projection kind")
    need(bt_model, "export function btLeafBlockType(node: Pick<BtNode, 'kind'>): string", "the BT projection writes a leaf's subtitle into blockType")
    need(bt_model, "case 'action': return 'Skill'", "the BT leaf subtitle is 'Skill'")
    need(linking, "blockType: props.blockType,", "blockType is a definition-shared prop")
    absent(linking, "attributeSource", "attributeSource in definition linking")
    need(linking, "body: bodySignature(editor, block)", "a definition's body signature walks its descendants")
    need(canvas, "<TypeAttributeRegion", "BlockCanvas paints a Type's body from its own region")
    need(canvas, "typeMappingBabbleVariant", "BlockCanvas switches the body region for a Type Mapping")
    need(member_layout, "return width === 'fill' && member.type === 'block' && member.view !== 'expanded'", "only a Block member fills")
    need(migrations, "were the same transform", "the duplicate attributeSource migration story")
    need(branch_model, "export const BranchArm = T.object({", "arms are a prop on the Branch")
    need(branch_model, "/** A control port: an input on the band. Authored, never derived from a title. */", "control ports are authored")
    need(loop_model, "iterable: LoopPort,", "the Loop header is an operator with real ports")
    need(lane, "export function reconcilePortLane(", "the lane keeps port ids across a text edit")
    need(read("src/fields/CodeField.tsx"), "export function CodeField(", "the shared code text box")
    need(read("src/blocks/portSignature.ts"), "export function parsePortSignature(text: string): PortSignature", "ports stay a parsed triple")
    for pep in ("0002-branch-region-port-host", "0004-projected-child-ownership-by-containment", "0005-hierarchical-detach", "0013-two-scoped-canvas-drag-owners"):
        if not (ROOT / "docs/peps" / f"{pep}.md").exists():
            raise SystemExit(f"report is stale — PEP missing: {pep}")

    # --- the member stack: a Code block is a member, annotations are not ---
    non_member = re.search(r"const NON_MEMBER_TYPES = new Set\(\[(.*?)\]\)", member_stack, re.S).group(1)
    non_member_types = re.findall(r"'([^']+)'", non_member)
    if "code" in non_member_types:
        raise SystemExit("report is stale — a Code block is no longer a stack member")
    need(member_stack, "The order is tldraw's own child `index`", "member order is the stock child index")

    # --- Block props: the closed style vocabulary already on the schema ----
    props_block = model.split("export const BLOCK_SHAPE_PROPS = {", 1)[1].split("} as const", 1)[0]
    prop_keys = re.findall(r"(?m)^\t([A-Za-z_]\w*)\s*:", props_block)
    style_keys = [
        "view", "titleSize", "titleFont", "titleAlign", "titleBold", "titleColor", "headerAlign",
        "foldable", "folded", "foldControlSide", "showDescription", "showFooter", "showHeaderDivider",
        "portLayout", "memberLayout", "insetBackground", "bodyLayout", "memberGap", "memberGutter",
        "memberWidth", "icon", "assetId", "autoResize",
    ]
    meaning_keys = [
        "title", "description", "blockType", "attributeSource", "notes", "inputs", "outputs", "stockConfig",
        "definitionId", "definitionKey", "draftOrdinal",
    ]
    lens_keys = ["state", "fieldDiffs", "priorPose"]
    geometry_keys = ["w", "h", "views", "expandedWeights"]
    # WHY only these ten are hard requirements: they are the props the four
    # sketch panels map to, so the page's central claim ("all of it is on the
    # schema already") dies with them. The rest of the classification is a
    # reading of whatever the branch carries — main gains props (assetId,
    # PEP 0014) that a branch cut earlier does not have, and that is not
    # staleness.
    for key in ("showFooter", "showHeaderDivider", "foldable", "titleSize", "memberLayout", "insetBackground",
                "bodyLayout", "memberGap", "memberGutter", "memberWidth", "blockType", "attributeSource", "views"):
        if key not in prop_keys:
            raise SystemExit(f"report is stale — BLOCK_SHAPE_PROPS lost {key!r}")
    style_keys = [k for k in style_keys if k in prop_keys]
    meaning_keys = [k for k in meaning_keys if k in prop_keys]
    lens_keys = [k for k in lens_keys if k in prop_keys]
    geometry_keys = [k for k in geometry_keys if k in prop_keys]
    unclassified = [k for k in prop_keys if k not in style_keys + meaning_keys + lens_keys + geometry_keys]

    # --- inventory: shape utils, registries, tools, detach kinds, inspectors
    src = source_files()
    shape_util_classes = sorted({
        m.group(1) for p in src if p.suffix != ".css"
        for m in re.finditer(r"class (\w+ShapeUtil)\b[^{]*?extends\s+\w*ShapeUtil", p.read_text(encoding="utf-8"))
    })
    product_utils = [n for n in array_names(app, "SYSTEMSKETCH_SHAPE_UTILS")]
    product_named = [n for n in product_utils if not n.startswith("...")]
    tools = array_names(app, "SYSTEMSKETCH_TOOLS")
    registries = [
        ("src/App.tsx", "SYSTEMSKETCH_SHAPE_UTILS", "the product canvas"),
        ("src/App.tsx", "BLOCK_DEVELOPMENT_SHAPE_UTILS", "the Block development profile"),
        ("src/store/createSystemSketchStore.ts", "STORE_SHAPE_UTILS", "the store's validation schema"),
        ("src/export/portableTldraw.ts", "PORTABLE_SHAPE_UTILS", "the portable .tldr export"),
        ("src/embed/EmbeddedCanvas.tsx", "EMBEDDED_SHAPE_UTILS", "the VS Code / Cursor host canvas"),
        ("src/compare/BoardRender.tsx", "COMPARE_SHAPE_UTILS", "the diff renderer"),
    ]
    registry_rows = []
    for path, const, role in registries:
        text = read(path)
        need(text, const, f"the {const} registry")
        registry_rows.append((path, const, role, "LoopShapeUtil" in text, "BlockShapeUtil" in text))
    loop_missing = [r[1] for r in registry_rows if not r[3]]
    detach_kinds = re.findall(r"^\t(\w+Detachable),", registered.split("DETACHABLE_KINDS", 1)[1], re.M)
    subjects = re.findall(r"'(\w+)'", re.search(r"export type InspectorSubject = (.*)", subject).group(1))

    # --- who reads the Type body, and who reads the kind -------------------
    attr_readers = sorted(
        str(p.relative_to(ROOT)) for p in src
        if p.suffix != ".css" and "attributeSource" in p.read_text(encoding="utf-8")
        and "/babble/" not in str(p) and p.name not in ("blockModel.ts", "blockShapeMigrations.ts")
    )
    block_type_files = sorted(
        str(p.relative_to(ROOT)) for p in src if p.suffix != ".css" and "blockType" in p.read_text(encoding="utf-8")
    )
    predicates = {
        "isTypeBlock": "src/blocks/typeAttributes.ts",
        "isTypeMappingBlock": "src/blocks/babble/typeMappingShared.ts",
        "isUnresolvedBlock": "src/blocks/blockModel.ts",
        "isProjectionBlock": "src/blocks/blockModel.ts",
    }
    for fn, path in predicates.items():
        need(read(path), f"export function {fn}(", f"the {fn} predicate")
    codec_reads_block_type = None
    if PYBLOCKS_CODEC.exists():
        codec_reads_block_type = 'props.get("blockType")' in PYBLOCKS_CODEC.read_text(encoding="utf-8")

    # --- header drift across the four containers ---------------------------
    heights = {
        "Block": first_int(r"BLOCK_HEADER_HEIGHT_PX\s*=\s*(\d+)", list((ROOT / "src/blocks").glob("*.ts"))),
        "Loop": first_int(r"LOOP_HEADER_HEIGHT\s*=\s*(\d+)", [ROOT / "src/loop/loopModel.ts"]),
        "Behavior Tree": first_int(r"BT_HEADER_H\s*=\s*(\d+)", list((ROOT / "src/behaviorTree").glob("*.ts"))),
        "Branch arm": first_int(r"BRANCH_ARM_HEADER_HEIGHT\s*=\s*(\d+)", [ROOT / "src/branch/branchModel.ts"]),
    }

    lines = {sub: line_count(sub) for sub in ("src/blocks", "src/behaviorTree", "src/branch", "src/loop", "src/code", "src/floatingPort", "src/asyncRegion", "src/detach", "src/fields")}
    babble_lines = line_count("src/blocks/babble")[0]
    type_ui_lines = sum(read(p).count("\n") for p in ("src/blocks/ui/TypeAttributeRegion.tsx", "src/blocks/typeAttributes.ts", "src/blocks/babble/TypeBabbleV1.tsx", "src/blocks/babble/TypeMappingV1.tsx", "src/blocks/babble/typeMappingShared.ts"))

    return {
        "head": git("rev-parse", "--short", "HEAD"),
        "branch": git("branch", "--show-current"),
        "tldraw": re.search(r'"tldraw":\s*"([^"]+)"', pkg).group(1),
        "prop_keys": prop_keys,
        "style_keys": style_keys,
        "meaning_keys": meaning_keys,
        "lens_keys": lens_keys,
        "geometry_keys": geometry_keys,
        "unclassified": unclassified,
        "shape_util_classes": shape_util_classes,
        "product_utils": product_utils,
        "product_named": product_named,
        "tools": tools,
        "registry_rows": registry_rows,
        "loop_missing": loop_missing,
        "detach_kinds": detach_kinds,
        "subjects": subjects,
        "attr_readers": attr_readers,
        "block_type_files": len(block_type_files),
        "predicates": list(predicates),
        "mapping_carrier": mapping_carrier,
        "mapping_promoted": git("log", "--all", "-1", "--format=%h", "--grep=Promote Type Mapping to a real primitive"),
        "machine_kinds": "'type' 'typeMapping' 'unresolved' 'unbundle'" if mapping_carrier == "blockType" else "'type' 'unresolved' 'unbundle' + a meta stamp",
        "block_tools": [t for t in tools if t in ("TypeTool", "TypeMappingTool", "PillTool")],
        "codec_reads_block_type": codec_reads_block_type,
        "heights": heights,
        "lines": lines,
        "babble_lines": babble_lines,
        "type_ui_lines": type_ui_lines,
        "region_lines": region.count("\n"),
        "non_member_types": non_member_types,
        "boards": board_stats(),
    }


# --------------------------------------------------------------------------
# diagrams — inline SVG, drawn from the measured numbers where they matter
# --------------------------------------------------------------------------

def _count(boards: dict | None, label: str) -> str:
    if not boards:
        return "n"
    for name, n in boards["block_types"]:
        if name == label:
            return str(n)
    return "0"


def anatomy_vs_kind_svg(m: dict) -> str:
    b = m["boards"]
    # The style pills are sized from their text so no label ever outgrows its
    # pill; they wrap inside the left panel's width.
    pills = []
    x, y = 24, 342
    for label in ("footer", "divider", "inset | edge-to-edge", "disclosure", "size s·m·l·xl", "glyph", "background", "gap · gutter", "fill | own", "free | stack body"):
        width = int(len(label) * 6.9) + 16
        if x + width > 454:
            x, y = 24, y + 26
        pills.append(f'<rect x="{x}" y="{y}" width="{width}" height="20" rx="10" class="dg-child"/><text x="{x + 8}" y="{y + 14}" class="dg-dim">{escape(label)}</text>')
        x += width + 6
    pills_svg = "".join(pills)
    cap_y = y + 34
    return f"""<svg viewBox="0 0 980 470" width="100%" role="img" aria-label="Left: the one Block anatomy with its style toggles. Right: the kinds, the readers that need the kind, and the one string that carries four jobs today.">
<defs><marker id="k-ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="dg-arrfill"/></marker></defs>
<text x="20" y="26" class="dg-title">Anatomy — one, shared by every kind (all of it is on Block's schema today)</text>
<rect x="24" y="40" width="430" height="262" rx="10" class="dg-parent"/>
<rect x="24" y="40" width="430" height="46" rx="10" class="dg-band"/>
<circle cx="48" cy="63" r="9" class="dg-child"/><text x="42" y="67" class="dg-dim">›_</text>
<text x="66" y="68" class="dg-h">Type a</text>
<text x="132" y="68" class="dg-dim">class</text>
<rect x="176" y="52" width="56" height="20" rx="10" class="dg-def"/><text x="184" y="66" class="dg-dim">Draft 2</text>
<text x="432" y="68" class="dg-dim">›</text>
<line x1="24" y1="86" x2="454" y2="86" class="dg-rule"/>
<text x="300" y="80" class="dg-dim">header divider · toggle</text>
<rect x="36" y="98" width="406" height="50" rx="6" class="dg-child"/>
<text x="46" y="118" class="dg-h">text seam</text><text x="46" y="136" class="dg-dim">CodeField + a grammar (attributes · aliases · a port line)</text>
<rect x="36" y="156" width="406" height="50" rx="6" class="dg-child"/>
<text x="46" y="176" class="dg-h">ports</text><text x="46" y="194" class="dg-dim">{{ name, type, defaultValue }} — an id a cable binds to</text>
<rect x="36" y="214" width="406" height="50" rx="6" class="dg-child"/>
<text x="46" y="234" class="dg-h">members</text><text x="46" y="252" class="dg-dim">children · order = tldraw child index · live stack or free</text>
<rect x="24" y="284" width="430" height="18" rx="6" class="dg-band"/><text x="34" y="297" class="dg-dim">footer · toggle</text>
<text x="20" y="330" class="dg-title">The closed style set — every one a prop already</text>
{pills_svg}
<text x="24" y="{cap_y}" class="dg-dim">{len(m['style_keys'])} of Block's {len(m['prop_keys'])} props are this vocabulary; {len(m['meaning_keys'])} carry meaning.</text>
<text x="24" y="{cap_y + 18}" class="dg-dim">Style says how it looks. It cannot say what it is.</text>

<text x="500" y="26" class="dg-title">Kind — what it means, and who has to read that</text>
<g>
<rect x="500" y="40" width="150" height="262" rx="8" class="dg-def"/>
<text x="512" y="60" class="dg-h">kind</text>
<text x="512" y="82" class="dg-c">call · def</text>
<text x="512" y="100" class="dg-c">value (pill)</text>
<text x="512" y="118" class="dg-c">type</text>
<text x="512" y="136" class="dg-c">type mapping</text>
<text x="512" y="154" class="dg-c">code</text>
<text x="512" y="172" class="dg-c">port</text>
<text x="512" y="190" class="dg-c">loop</text>
<text x="512" y="208" class="dg-c">branch · arm</text>
<text x="512" y="226" class="dg-c">async region</text>
<text x="512" y="244" class="dg-c">bt region · node</text>
<text x="512" y="270" class="dg-dim">authored, closed,</text>
<text x="512" y="286" class="dg-dim">never derived</text>
</g>
<g>
<rect x="686" y="40" width="274" height="34" rx="6" class="dg-child"/><text x="696" y="56" class="dg-h">Python projection</text><text x="696" y="69" class="dg-dim">NamedTuple? alias? loop body? arm?</text>
<rect x="686" y="82" width="274" height="34" rx="6" class="dg-child"/><text x="696" y="98" class="dg-h">definition linking</text><text x="696" y="111" class="dg-dim">shares blockType, not attributeSource</text>
<rect x="686" y="124" width="274" height="34" rx="6" class="dg-child"/><text x="696" y="140" class="dg-h">completion · go-to-definition</text><text x="696" y="153" class="dg-dim">which Blocks are Types? — a kind scan</text>
<rect x="686" y="166" width="274" height="34" rx="6" class="dg-child"/><text x="696" y="182" class="dg-h">detach → stock primitives</text><text x="696" y="195" class="dg-dim">one registered reduction per kind</text>
<rect x="686" y="208" width="274" height="34" rx="6" class="dg-child"/><text x="696" y="224" class="dg-h">inspector · menus · tools</text><text x="696" y="237" class="dg-dim">{len(m['subjects'])} inspector subjects, {len(m['tools'])} tools</text>
<rect x="686" y="250" width="274" height="34" rx="6" class="dg-child"/><text x="696" y="266" class="dg-h">the style defaults themselves</text><text x="696" y="279" class="dg-dim">kind → footer / divider / inset</text>
</g>
<path d="M650 90 L 686 57" class="dg-arrow" marker-end="url(#k-ah)"/>
<path d="M650 120 L 686 99" class="dg-arrow" marker-end="url(#k-ah)"/>
<path d="M650 150 L 686 141" class="dg-arrow" marker-end="url(#k-ah)"/>
<path d="M650 180 L 686 183" class="dg-arrow" marker-end="url(#k-ah)"/>
<path d="M650 210 L 686 225" class="dg-arrow" marker-end="url(#k-ah)"/>
<path d="M650 240 L 686 267" class="dg-arrow" marker-end="url(#k-ah)"/>

<text x="500" y="328" class="dg-title">Today: one string, four jobs</text>
<rect x="500" y="340" width="460" height="122" rx="8" class="dg-warnbox"/>
<rect x="508" y="387" width="104" height="28" rx="6" class="dg-def"/><text x="522" y="405" class="dg-h">blockType</text>
<text x="634" y="360" class="dg-c">the label you type</text><text x="634" y="373" class="dg-dim">'class' ×{_count(b, 'class')} · 'component' ×{_count(b, 'component')} · 'system' ×{_count(b, 'system')}</text>
<text x="634" y="387" class="dg-c">the machine switch</text><text x="634" y="400" class="dg-dim">{escape(m['machine_kinds'])}</text>
<text x="634" y="414" class="dg-c">the BT leaf subtitle</text><text x="634" y="427" class="dg-dim">'Skill' ×{_count(b, 'skill')} · 'Condition' ×{_count(b, 'condition')} (btLeafBlockType)</text>
<text x="634" y="441" class="dg-c">the Python export</text><text x="634" y="454" class="dg-dim">pyblocks codec → content["type"]</text>
<path d="M612 396 L 630 366" class="dg-arrow" marker-end="url(#k-ah)"/>
<path d="M612 400 L 630 393" class="dg-arrow" marker-end="url(#k-ah)"/>
<path d="M612 404 L 630 420" class="dg-arrow" marker-end="url(#k-ah)"/>
<path d="M612 408 L 630 447" class="dg-arrow" marker-end="url(#k-ah)"/>
</svg>"""


def relations_svg() -> str:
    return """<svg viewBox="0 0 980 372" width="100%" role="img" aria-label="Four relations that nesting cannot carry: a Branch's exclusive ordered arms, a Loop's one cable back, a Behavior Tree's canonical XML order, and a Type Mapping's reference to another Type.">
<defs><marker id="r-ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="dg-arrfill"/></marker></defs>
<text x="20" y="22" class="dg-title">Branch</text>
<rect x="20" y="32" width="220" height="190" rx="8" class="dg-parent"/>
<rect x="20" y="32" width="220" height="30" rx="8" class="dg-band"/><text x="30" y="52" class="dg-h">if pose is None</text>
<circle cx="20" cy="47" r="4.5" class="dg-child"/>
<rect x="30" y="72" width="200" height="86" rx="6" class="dg-child"/><text x="40" y="90" class="dg-dim">arm 1 · open · active</text>
<rect x="60" y="100" width="90" height="40" rx="6" class="dg-def"/><text x="70" y="124" class="dg-h">estimate()</text>
<rect x="30" y="166" width="200" height="26" rx="6" class="dg-child"/><text x="40" y="184" class="dg-dim">arm 2 · folded · faded</text>
<text x="20" y="246" class="dg-c">exclusive · ordered · one active</text>
<text x="20" y="264" class="dg-dim">carrier: props.arms[] + a meta stamp</text>
<text x="20" y="280" class="dg-dim">geometry alone failed on fold</text>
<text x="20" y="296" class="dg-dim">(PEP 0002)</text>

<text x="270" y="22" class="dg-title">Loop</text>
<rect x="270" y="32" width="220" height="190" rx="8" class="dg-parent"/>
<rect x="270" y="32" width="220" height="34" rx="8" class="dg-band"/><text x="280" y="54" class="dg-h">for pose in poses</text>
<circle cx="330" cy="66" r="4.5" class="dg-child"/><text x="338" y="70" class="dg-dim">Iter</text>
<rect x="320" y="100" width="90" height="40" rx="6" class="dg-def"/><text x="330" y="124" class="dg-h">refine()</text>
<circle cx="320" cy="120" r="4.5" class="dg-child"/><circle cx="410" cy="120" r="4.5" class="dg-child"/>
<path d="M330 66 L 320 100" class="dg-arrow"/>
<path d="M410 120 C 470 120, 470 200, 400 200 L 300 200 C 285 200, 285 120, 315 120" class="dg-dotted" marker-end="url(#r-ah)"/>
<rect x="336" y="190" width="30" height="18" rx="9" class="dg-def"/><text x="342" y="203" class="dg-dim">z⁻¹</text>
<text x="270" y="246" class="dg-c">one cable back · seed | last</text>
<text x="270" y="264" class="dg-dim">carrier: an EDGE (temporal: delayed)</text>
<text x="270" y="280" class="dg-dim">plus the header's own ports</text>
<text x="270" y="296" class="dg-dim">no child can mean "next iteration"</text>

<text x="520" y="22" class="dg-title">Behavior Tree</text>
<rect x="520" y="32" width="220" height="190" rx="8" class="dg-parent"/>
<rect x="520" y="32" width="220" height="30" rx="8" class="dg-band"/><text x="530" y="52" class="dg-h">GraspTree</text>
<rect x="530" y="70" width="200" height="60" rx="6" class="dg-code"/>
<text x="538" y="84" class="dg-mono">&lt;Sequence&gt;</text>
<text x="538" y="97" class="dg-mono">  &lt;Action ID="Approach"/&gt;</text>
<text x="538" y="110" class="dg-mono">  &lt;Action ID="Grasp"/&gt;</text>
<text x="538" y="123" class="dg-mono">&lt;/Sequence&gt;</text>
<rect x="600" y="140" width="60" height="22" rx="4" class="dg-child"/><text x="608" y="155" class="dg-dim">→ seq</text>
<rect x="540" y="180" width="80" height="34" rx="6" class="dg-def"/><text x="548" y="201" class="dg-h">Approach</text>
<rect x="640" y="180" width="80" height="34" rx="6" class="dg-def"/><text x="648" y="201" class="dg-h">Grasp</text>
<path d="M620 162 L 580 180" class="dg-arrow"/><path d="M640 162 L 680 180" class="dg-arrow"/>
<text x="520" y="246" class="dg-c">canonical order · attributes · ids</text>
<text x="520" y="264" class="dg-dim">carrier: props.xml</text>
<text x="520" y="280" class="dg-dim">children are projections; owner by</text>
<text x="520" y="296" class="dg-dim">containment, stamp repaired — 0004</text>

<text x="770" y="22" class="dg-title">Type Mapping</text>
<rect x="770" y="32" width="190" height="90" rx="8" class="dg-parent"/>
<rect x="770" y="32" width="190" height="30" rx="8" class="dg-band"/><text x="780" y="52" class="dg-h">= Type Mapping</text>
<text x="780" y="82" class="dg-mono">Pair = Tuple[Pose, Pose]</text>
<text x="780" y="100" class="dg-mono">Pairs = Iterable[Pair]</text>
<rect x="800" y="150" width="120" height="60" rx="8" class="dg-parent"/>
<rect x="800" y="150" width="120" height="26" rx="8" class="dg-band"/><text x="810" y="168" class="dg-h">{ } Pose</text>
<text x="810" y="196" class="dg-mono">x: float</text>
<path d="M880 84 C 940 84, 940 140, 900 150" class="dg-arrow" marker-end="url(#r-ah)"/>
<text x="770" y="246" class="dg-c">a reference, not a child</text>
<text x="770" y="264" class="dg-dim">carrier: a name scan</text>
<text x="770" y="280" class="dg-dim">(findKnownTypeSource)</text>
<text x="770" y="296" class="dg-dim">nesting Pose would copy it</text>

<line x1="20" y1="310" x2="960" y2="310" class="dg-rule"/>
<text x="20" y="330" class="dg-c">Containment (parentId) gives membership, z-order, clipping and move-with. It does not give exclusivity, order, direction or reference.</text>
<text x="20" y="348" class="dg-dim">Three carriers: the tree for membership · props and meta for roles and order · edges for direction and delay.</text>
<text x="20" y="364" class="dg-dim">The kind contract says which carrier each relation uses.</text>
</svg>"""


def ladder_svg(m: dict) -> str:
    h = m["heights"]
    drift = "/".join(str(h[k]) if h[k] is not None else "?" for k in ("Block", "Loop", "Behavior Tree", "Branch arm"))
    return f"""<svg viewBox="0 0 980 214" width="100%" role="img" aria-label="The migration ladder: kind enum first, then the Type body as a Code member, then Type Mapping, then one shared header painter; and the things that never move into children.">
<defs><marker id="l-ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="dg-arrfill"/></marker></defs>
<rect x="20" y="30" width="176" height="96" rx="8" class="dg-def"/>
<text x="30" y="52" class="dg-h">0 · kind ≠ label</text>
<text x="30" y="70" class="dg-dim">a closed enum + contract</text>
<text x="30" y="84" class="dg-dim">migration fills it from</text>
<text x="30" y="98" class="dg-dim">blockType's four values</text>
<text x="30" y="112" class="dg-dim">the tracer bullet</text>
<path d="M196 78 L 204 78" class="dg-arrow" marker-end="url(#l-ah)"/>
<rect x="206" y="30" width="176" height="96" rx="8" class="dg-child"/>
<text x="216" y="52" class="dg-h">1 · Type body → Code</text>
<text x="216" y="70" class="dg-dim">attributes grammar on</text>
<text x="216" y="84" class="dg-dim">CodeField; a migration</text>
<text x="216" y="98" class="dg-dim">makes the child; share,</text>
<text x="216" y="112" class="dg-dim">detach, embed come free</text>
<path d="M382 78 L 390 78" class="dg-arrow" marker-end="url(#l-ah)"/>
<rect x="392" y="30" width="176" height="96" rx="8" class="dg-child"/>
<text x="402" y="52" class="dg-h">2 · Mapping → Code</text>
<text x="402" y="70" class="dg-dim">alias grammar Name=Expr</text>
<text x="402" y="84" class="dg-dim">targets stay references</text>
<text x="402" y="98" class="dg-dim">(a scan), never children</text>
<path d="M568 78 L 576 78" class="dg-arrow" marker-end="url(#l-ah)"/>
<rect x="578" y="30" width="176" height="96" rx="8" class="dg-child"/>
<text x="588" y="52" class="dg-h">3 · shared header</text>
<text x="588" y="70" class="dg-dim">heights: {drift}</text>
<text x="588" y="84" class="dg-dim">anatomy unified, models</text>
<text x="588" y="98" class="dg-dim">untouched; Branch, Loop,</text>
<text x="588" y="112" class="dg-dim">BT keep their ShapeUtils</text>
<rect x="764" y="30" width="176" height="96" rx="8" class="dg-warnbox"/>
<text x="774" y="52" class="dg-h">never</text>
<text x="774" y="70" class="dg-dim">BT xml into children</text>
<text x="774" y="84" class="dg-dim">arms into pure nesting</text>
<text x="774" y="98" class="dg-dim">back-edge into a child</text>
<text x="774" y="112" class="dg-dim">ports into free text</text>
<text x="20" y="158" class="dg-c">Each rung is reversible on its own and leaves the boards loadable; rung 0 is a day, rung 1 is the first real deletion.</text>
<text x="20" y="178" class="dg-dim">({m['type_ui_lines']} lines of Type UI today, {m['babble_lines']} more in babble/.) Rungs 1–2 are your own "attribute block = Block with a Code child";</text>
<text x="20" y="196" class="dg-dim">rung 3 is the 2026-09-06 container-anatomy finding; the last column is PEPs 0002 and 0004 plus this morning's port ruling.</text>
</svg>"""


# --------------------------------------------------------------------------
# tables
# --------------------------------------------------------------------------

CRITERIA = [
    ("Small, closed visual grammar — you can see what a thing is (Principle 3, black)", 20),
    ("Code compactness — one seam per concern, no second copy of a mechanism (Principle 1; \"you always write code twice\")", 15),
    ("Whiteboard stays dumb, Python is rigid — nothing on the canvas derives meaning (2026-09-03)", 15),
    ("One document model — tldraw's store is the truth; text canonical only where a parse would lose something", 15),
    ("Detach / export fidelity — every kind reduces to stock records without losing what it said (Principle 1)", 10),
    ("Meaning is readable — definition linking, go-to-definition and the Python projection can tell kinds apart", 10),
    ("Migration safety for the boards that exist", 5),
    ("Registry and IDE-embed cost per kind (the six shape-util lists)", 5),
    ("Performance at 200+ shapes (shape count, settle passes, definition replication)", 5),
]

OPTIONS = [
    ("A · Today", "N ShapeUtils, kinds smuggled through blockType, bodies each built their own way", [2, 2, 4, 3, 3, 3, 5, 1, 4]),
    ("B · The thesis, literally", "one Block; kind implied by nesting + style; every body a Code child", [4, 4, 2, 3, 2, 1, 2, 5, 3]),
    ("C · One anatomy + explicit kind", "one Block anatomy, one tree, one text seam, closed styles, and a per-kind contract", [5, 4, 5, 5, 4, 5, 4, 4, 3]),
]


def criteria_table() -> str:
    rows = "".join(f"<tr><td>{escape(name)}</td><td class='num'>{w}</td></tr>" for name, w in CRITERIA)
    return f"<table><thead><tr><th>Criterion (from your values, weighted for this decision)</th><th>Weight</th></tr></thead><tbody>{rows}<tr><td><b>Total</b></td><td class='num'><b>{sum(w for _, w in CRITERIA)}</b></td></tr></tbody></table>"


def scores_table() -> str:
    head = "".join(f"<th>{escape(label)}</th>" for label, _, _ in OPTIONS)
    body = []
    for i, (name, w) in enumerate(CRITERIA):
        cells = "".join(f"<td class='num'>{s[i]} <span class='dim'>×{w}</span></td>" for _, _, s in OPTIONS)
        short = name.split(" — ")[0].split(" (")[0]
        body.append(f"<tr><td>{escape(short)}</td>{cells}</tr>")
    totals = "".join(f"<td class='num'><b>{sum(s[i] * w for i, (_, w) in enumerate(CRITERIA))}</b> / {5 * sum(w for _, w in CRITERIA)}</td>" for _, _, s in OPTIONS)
    body.append(f"<tr><td><b>Weighted</b></td>{totals}</tr>")
    descr = "".join(f"<td class='dim'>{escape(d)}</td>" for _, d, _ in OPTIONS)
    return f"<table><thead><tr><th>Score 0–5</th>{head}</tr></thead><tbody><tr><td></td>{descr}</tr>{''.join(body)}</tbody></table>"


MATRIX = [
    ("Block (call · def)", "header · ports · footer · members", "props — the port triple; members are children", "any box shape as a member; body free or a live stack", "cables on ports, polarity decided at the landing", "a call, or a def with occurrences", "anatomy ✓ — it is the anatomy", "the triple stays props; definition sharing is by title"),
    ("Pill (value)", "capsule — the Block's <code>value</code> view", "props — one literal", "none", "one outgoing cable", "a literal argument", "✓ already a Block view", "never a definition (<code>blockDefinitionId</code> returns '')"),
    ("Type", "header · body", "<b>text → a Code member</b> with the attributes grammar", "exactly one Code member", "none (go-to-definition is a scan, not a cable)", "NamedTuple / dataclass / TypedDict — the kind option decides", "✓ anatomy, ✓ body (this is the tracer)", "which class form it projects to is authored, never read off the text"),
    ("Type Mapping", "header · body", "<b>text → a Code member</b> with the alias grammar", "one Code member", "none", "<code>Name = expr</code> aliases", "✓ same move as Type", "targets are references resolved by name; nesting the target would copy it"),
    ("Code", "body only", "text", "none (it is a leaf)", "none", "verbatim source", "✓ becomes a member of anything", "language / width / line numbers are StyleProps, not kind"),
    ("Port (floating)", "dot · text slot", "props — the triple", "none", "one cable end", "a parameter", "✓ the slot is a CodeField line", "direction and semantic role are props"),
    ("Members", "children in a stack or free", "children — tldraw child index", "any box shape; annotations float", "cables hidden while stacked", "class members / body statements", "✓ stock: parentId + index", "order is the child index; nothing else to keep in sync"),
    ("Loop", "region header (an operator) · body", "props — iterable/item ports, turn; the carried value is on a cable", "Blocks, regions", "header inlet and outlet; the back cable is <code>temporal: delayed</code>", "for / while with carried state", "header painter only", "the back-edge is an edge fact; seed | last is a receiver fact"),
    ("Branch · arms", "band · arm headers · arm bodies", "props — <code>arms[]</code> (order, open, height) + <code>meta.branchArm</code>", "Blocks per arm, through invisible arm frames", "control ports on the band only; cables straight to Blocks", "if / elif / else; the join is a φ, drawn as a fade", "band and arm-header painters", "exclusivity, order and the active arm are props (PEP 0002)"),
    ("Async region", "a stock frame", "meta — one stamp", "anything", "cables inside default to async", "asynchronous delivery", "✓ fully stock already", "the stamp <i>is</i> the kind — the precedent for kind-on-a-stock-shape"),
    ("Behavior Tree region", "region · projected children", "props — canonical BT.CPP XML", "only projections (<code>meta.btRole</code>); authored Blocks pasted in lower with it", "projected cables; owner resolved by containment, stamp repaired", "the XML itself", "leaf nodes are Blocks ✓", "order, attributes and ids never live in children (PEP 0004)"),
    ("BT node (leaf · control)", "a Block (leaf) · a small control shape", "a projection of one XML node", "none", "projected", "one XML node", "leaf anatomy ✓", "its kind comes from the XML; today its subtitle is written into blockType"),
]


def matrix_table() -> str:
    head = "<tr><th>Kind</th><th>Anatomy pieces</th><th>Body's canonical form</th><th>May contain</th><th>Edges it accepts</th><th>Python projection</th><th>Unified</th><th>Stays explicit in the contract</th></tr>"
    rows = "".join("<tr>" + "".join(f"<td>{cell}</td>" for cell in row) + "</tr>" for row in MATRIX)
    return f"<div class='scroll'><table class='matrix'><thead>{head}</thead><tbody>{rows}</tbody></table></div>"


PRIOR_ART = [
    ("Notion — the block model", "Everything is a block <i>and</i> every block has a <code>type</code> with a typed payload keyed by that type (paragraph, heading, to_do, code, child_database…); children hang off any block; synced blocks share one body across pages.", "Exactly the surviving frame: one anatomy, explicit kinds, per-kind schema. Their synced block is your definition linking."),
    ("Figma — frames, auto layout, components", "Every node has a <code>type</code> (FRAME, GROUP, COMPONENT, INSTANCE, TEXT). Auto layout is a set of style numbers on a frame — direction, spacing, padding, hug/fill/fixed — which are your gap, gutter and Fill | Own. Components add properties and variants: semantics on top of anatomy.", "Anatomy unified under FRAME; meaning via type + component properties. A GROUP is not a FRAME — the engine keeps the distinction you are tempted to erase."),
    ("tldraw — the engine under you", "Every record is a TLShape with a <code>type</code> and a per-type props validator; containment is <code>parentId</code>; order is the child <code>index</code>; frame-likeness is a ShapeUtil answer.", "The engine is already \"one anatomy + explicit kinds\". A Block-with-a-kind reproduces that one level up — fine, as long as the kind is as explicit as tldraw's <code>type</code>."),
    ("Godot — \"everything is a Node\"", "One base class, a deep class hierarchy (Node2D, Control, Sprite2D…), composition by the scene tree. Theme/styling is separate from class.", "The slogan people quote is the anatomy half; the class hierarchy is the kind half. Nobody builds a Sprite by styling a Node."),
    ("Unreal Blueprints", "One graph-node anatomy (SGraphNode) with a class per node kind (call function, branch, macro instance…), typed pins, and collapse-to-subgraph as containment.", "Shared anatomy, explicit kinds, containment for grouping only. Control flow is pins and exec wires, never nesting."),
    ("HTML — \"everything is a div\"", "The spec says a div \"has no special meaning at all\". Semantic elements and ARIA roles were added because screen readers, crawlers, forms and default keyboard behaviour all need the kind; a div styled like a button is not focusable and does not fire on Enter.", "Div soup works for layout and fails for every machine reader. The fix was adding kinds (<code>&lt;button&gt;</code>, <code>role=</code>), not removing divs. Your machine readers are the Python projection and definition linking."),
    ("JetBrains MPS — projectional", "A <i>concept</i> declares structure; an <i>editor</i> declares its projection; behaviour and constraints hang off the concept. Text is not canonical.", "The cleanest statement of one-anatomy-per-kind with projection separate — and the cautionary pole: no plain-text storage. Keep text canonical where it is text today."),
    ("Enso · Neva · unit (already in the vault)", "All three are languages that own their semantics end to end, so they may derive signatures, refuse graphs and infer kinds.", "SystemSketch does not own its semantics. A kind must be authored, never derived from how something is nested or styled — the same boundary that rejected derived Branch ports."),
    ("Simulink · LabVIEW (vault dictionary, 13 + 18 conventions)", "Meaning rides on silhouettes, port glyphs and a few reserved marks: a subsystem and an enabled subsystem differ by one extra port and one mark, never by a font.", "The glyph-level distinctions readers rely on are reserved and closed. A style vocabulary that can mean anything means nothing; each kind must own its look."),
]


def prior_art_table() -> str:
    rows = "".join(f"<tr><td><b>{escape(name)}</b></td><td>{what}</td><td>{lesson}</td></tr>" for name, what, lesson in PRIOR_ART)
    return f"<table><thead><tr><th>Reference</th><th>What it actually does</th><th>What it says about \"one primitive + styles\"</th></tr></thead><tbody>{rows}</tbody></table>"


DECISIONS = [
    ("D1", "Split <code>kind</code> from <code>blockType</code>",
     "Yes. A closed enum prop with a contract table (<code>primitiveKind.ts</code> beside <code>detachableKind.ts</code>); the four predicates read it; <code>blockType</code> goes back to being the free label you type. A migration maps <code>blockType ∈ {type, typeMapping, unresolved, unbundle}</code> to the kind; a test forbids any other string comparison on the label.",
     "Write the enum and the migration; nothing visible changes on any board."),
    ("D2", "Type and Type Mapping bodies become a Code member",
     "Yes — the text is already canonical there, so nothing is lost, and definition sharing, detach and the IDE embed all fall out of existing seams. The attributes grammar and the alias grammar are the next two CodeField grammars, which this morning's report already named as the follow-up.",
     "Build the Type tracer behind the kind contract first; Type Mapping follows the same day."),
    ("D3", "Which class form a Type projects to",
     "An authored kind option — NamedTuple (your golden), dataclass, TypedDict, Protocol — chosen in the inspector, never inferred from the text. The whiteboard stays dumb; the Python side reads the option.",
     "Default NamedTuple, matching the goldens."),
    ("D4", "Regions keep their ShapeUtils; only the header painter is shared",
     "Yes. Branch, Loop and Behavior Tree keep their models (arms, back-edge, XML) and their ShapeUtils behind the same kind contract; the drift in header heights becomes one ladder in one file. No rewrite — the 2026-09-06 audit already measured that the primitives are sound and the dispatchers are not.",
     "No rewrite; the drift is made visible in one place and left as-is until you re-rung it."),
    ("D5", "Style is reserved per kind",
     "Yes. The closed set (footer, divider, inset | edge-to-edge, disclosure, size, glyph, background, gap, gutter, fill | own, free | stack) gets its <i>defaults</i> from the kind. Overrides stay inside that set; no kind grows its own controls. That is how \"edge-to-edge with no footer\" keeps meaning \"an attributes body\" and nothing else.",
     "A kind → defaults table only; no new user-facing controls."),
]


def decisions_table() -> str:
    rows = "".join(f"<tr><td><b>{d}</b></td><td>{q}</td><td>{rec}</td><td>{default}</td></tr>" for d, q, rec, default in DECISIONS)
    return f"<table><thead><tr><th></th><th>Decision</th><th>Recommendation</th><th>Reversible default if you say nothing</th></tr></thead><tbody>{rows}</tbody></table>"


def sketch_table() -> str:
    rows = [
        ("1 · today's Type", "header with glyph, title, Draft chip, kind label; an ATTRIBUTES band with a UI / SOURCE toggle; rows with type names as links", "<code>blockType: 'type'</code> + <code>attributeSource</code>, painted by <code>TypeAttributeRegion</code> / <code>TypeBabbleV1</code> — a body region only a Type has"),
        ("2 · \"same patterns as everything else\"", "Block <i>Type a</i> (kind label <i>class</i>) containing a child Block <i>attributes</i> whose body is a Code block, with its own footer", "expressible today: <code>bodyLayout: 'stack'</code>, a Block member, a Code member (<code>isStackMemberShape</code> admits <code>code</code>) — three shapes"),
        ("3 · hide the footer and divider, add a drop-down, smaller text", "<i>Type b</i>: the child shown as a card, footer hidden, header line hidden, a chevron, over a grey inset body", "<code>showFooter</code>, <code>showHeaderDivider</code>, <code>foldable</code> (chevron), <code>titleSize</code>, <code>memberLayout: 'inset'</code>, <code>insetBackground: 'soft-gray'</code> — all props already"),
        ("4 · edge to edge, or keep it offset", "<i>Type_c</i>: the attributes child edge-to-edge, a <i>› attributes</i> disclosure row, the code block filling the width", "<code>memberLayout: 'edge-to-edge'</code> (<code>memberGap</code>/<code>memberGutter</code> = 0), a folded child's header as the disclosure row; Fill for a Code member is the one thing not built (<code>stackMemberFillsWidth</code> is Block-only)"),
    ]
    body = "".join(f"<tr><td><b>{p}</b></td><td>{d}</td><td>{t}</td></tr>" for p, d, t in rows)
    return f"<table><thead><tr><th>Your panel</th><th>What it draws</th><th>What carries it in today's schema</th></tr></thead><tbody>{body}</tbody></table>"


def inventory(m: dict) -> str:
    utils = ", ".join(f"<code>{escape(n)}</code>" for n in m["shape_util_classes"])
    named = ", ".join(f"<code>{escape(n)}</code>" for n in m["product_named"])
    reg_rows = "".join(
        f"<tr><td><code>{escape(path)}</code></td><td><code>{escape(const)}</code></td><td>{escape(role)}</td><td>{'✓' if has_block else '✗'}</td><td>{'✓' if has_loop else '<b class=bad>missing</b>'}</td></tr>"
        for path, const, role, has_loop, has_block in m["registry_rows"]
    )
    lines_rows = "".join(f"<tr><td><code>{escape(sub)}</code></td><td class='num'>{n:,}</td><td class='num'>{f}</td></tr>" for sub, (n, f) in m["lines"].items())
    heights = ", ".join(f"{k} {v if v is not None else '?'}" for k, v in m["heights"].items())
    tools = ", ".join(f"<code>{escape(t)}</code>" for t in m["tools"])
    codec = {True: "reads <code>props[\"blockType\"]</code> and writes it out as <code>content[\"type\"]</code> — a label, never a switch", False: "no longer reads blockType", None: "not on this machine — not measured"}[m["codec_reads_block_type"]]
    return f"""
<h3>Shape utils, registries, tools</h3>
<p>{len(m['shape_util_classes'])} ShapeUtil classes in <code>src/</code>: {utils}. The product canvas registers {len(m['product_named'])} of them by name ({named}) plus {len(m['product_utils']) - len(m['product_named'])} spread groups. {len(m['tools'])} tools: {tools}. Of those, {' and '.join(f'<code>{escape(t)}</code>' for t in m['block_tools'])} create a <b>Block</b> — a kind on the one anatomy — and <code>AsyncRegionTool</code> creates a stock <b>frame</b> with a meta stamp. So {len(m['block_tools']) + 1} of the palette's rungs are already "Block or frame + a kind"{' (a Type Mapping on this branch is a Block wearing a meta stamp, with no tool of its own yet)' if m['mapping_carrier'] == 'meta' else ''}, and only Branch, Loop, Behavior Tree, Code and Port own a ShapeUtil.</p>
<table><thead><tr><th>File</th><th>Registry</th><th>Role</th><th>Block</th><th>Loop</th></tr></thead><tbody>{reg_rows}</tbody></table>
<p>{'<b class=bad>Live example of the registry cost:</b> ' + ' and '.join(f'<code>{c}</code>' for c in m['loop_missing']) + ' do not list <code>LoopShapeUtil</code> today, which is the exact failure measured on 2026-09-06 (a Loop opened in the IDE pane paints the whole canvas blank). A kind that lives on Block has nothing to register in any of these lists.' if m['loop_missing'] else 'Every registry lists Loop today.'}</p>
<p>Detach is the one dimension already run as a registry: {len(m['detach_kinds'])} kinds in <code>src/detach/registeredKinds.ts</code> ({', '.join(f'<code>{escape(k)}</code>' for k in m['detach_kinds'])}). The inspector is still a subject switch with {len(m['subjects'])} arms ({', '.join(f'<code>{escape(s)}</code>' for s in m['subjects'])}) — Type and Type Mapping are not among them; they ride the Block arm.</p>
<h3>Where the Type body and the kind are read</h3>
<p><code>attributeSource</code> (the Type's whole body) is read by {len(m['attr_readers'])} files outside the babble variants, the schema and its migration: {', '.join(f'<code>{escape(p)}</code>' for p in m['attr_readers'])}. It is <b>not</b> in <code>sharedDefinitionProps</code>, so two occurrences of one Type do not share their attributes today, and it is not read by any detach reduction, so a detached Type keeps its header and loses its rows. <code>blockType</code>, by contrast, is read in {m['block_type_files']} source files, is definition-shared, is switched on by {len(m['predicates'])} predicates ({', '.join(f'<code>{p}</code>' for p in m['predicates'])}), is written by the Behavior Tree projection as a leaf's subtitle, and the pyblocks codec {codec}.</p>
<h3>Weight</h3>
<table><thead><tr><th>Directory</th><th>Lines (ts · tsx · css, tests excluded)</th><th>Modules</th></tr></thead><tbody>{lines_rows}</tbody></table>
<p>The Type UI alone — region, parser, the shipped babble variant, the mapping variant and its shared resolver — is {m['type_ui_lines']:,} lines, with {m['babble_lines']:,} lines under <code>src/blocks/babble/</code> around it. The shared container base, <code>RegionShapeUtil</code>, is {m['region_lines']} lines and answers hit-testing and drag only; painting was never shared, which is why the header heights read {heights}. Block's own props: {len(m['prop_keys'])} keys — {len(m['style_keys'])} style, {len(m['meaning_keys'])} meaning, {len(m['lens_keys'])} lens, {len(m['geometry_keys'])} geometry{', and ' + ', '.join(f'<code>{k}</code>' for k in m['unclassified']) + ' unclassified' if m['unclassified'] else ''}.</p>
"""


def boards_section(b: dict | None) -> str:
    if not b:
        return "<p class='dim'>Your boards were not on this machine at build time, so the board statistics are not measured here.</p>"
    types = ", ".join(f"<code>{escape(t)}</code> {n:,}" for t, n in b["by_type"][:14])
    labels = ", ".join(f"<code>{escape(t) or '(blank)'}</code> {n}" for t, n in b["block_types"][:12])
    depth = " · ".join(f"depth {d}: {n:,}" for d, n in b["depth"])
    kids = ", ".join(f"{n} Types with {c} children" for c, n in b["type_children"])
    return f"""<p>{b['boards']} boards under <code>{escape(str(BOARDS_DIR))}</code>, {b['shapes']:,} shapes: {types}. Nesting: {depth}. Block labels in use: {labels}. {b['type_blocks']} Type Blocks — {kids}.</p>
<p>Read what the label column says: <code>class</code>, <code>component</code>, <code>system</code>, <code>call</code>, <code>dag</code> are words you typed; <code>type</code> is a machine switch; <code>skill</code>, <code>condition</code>, <code>sub tree</code> are what the Behavior Tree projection wrote. One column, three authors. A Block you label <i>Type</i> by hand becomes a Type primitive (<code>isTypeBlock</code> is a case-insensitive compare), and nothing in the store can tell the two apart afterwards. That is the concrete form of "nesting and style cannot carry the kind": today the kind is carried by the label, and the label is already ambiguous on your own boards.</p>"""


CSS = """
:root { --ink:#17191c; --mute:#5b6470; --line:#dfe3e8; --paper:#fff; --wash:#f4f6f8; --accent:#5b46e5; --ok:#1f8a4c; --warn:#b4531d; --bad:#b23a2c; }
* { box-sizing:border-box; }
body { margin:0; color:var(--ink); background:var(--paper); font:15px/1.5 Inter,system-ui,sans-serif; }
main { max-width:1120px; margin:0 auto; padding:28px 28px 80px; }
h1 { font-size:30px; line-height:1.15; margin:0 0 6px; letter-spacing:-.01em; }
h2 { font-size:21px; margin:44px 0 10px; letter-spacing:-.01em; }
h3 { font-size:16px; margin:22px 0 6px; }
p, li { max-width:84ch; }
p { margin:8px 0; }
.lede { font-size:17px; max-width:88ch; }
.meta, .dim { color:var(--mute); font-size:13px; }
code, pre { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
code { background:var(--wash); padding:1px 5px; border-radius:4px; font-size:13px; }
table { border-collapse:collapse; width:100%; margin:10px 0 16px; font-size:14px; }
th, td { text-align:left; vertical-align:top; padding:7px 10px; border-bottom:1px solid var(--line); }
th { color:var(--mute); font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:.04em; }
td.num { text-align:right; white-space:nowrap; }
.scroll { overflow-x:auto; }
table.matrix { min-width:1040px; font-size:12.5px; }
table.matrix td { padding:6px 8px; }
.callout { border-left:4px solid var(--accent); background:#f4f2ff; padding:12px 16px; border-radius:0 8px 8px 0; margin:14px 0; max-width:92ch; }
.callout.warn { border-color:var(--warn); background:#fff5ee; }
.callout.ok { border-color:var(--ok); background:#eefaf2; }
.bad { color:var(--bad); }
.dg { margin:12px 0; border:1px solid var(--line); border-radius:8px; background:#fbfcfd; padding:8px; }
.dg-title { font:600 13px Inter,system-ui,sans-serif; fill:var(--ink); }
.dg-parent { fill:#fff; stroke:#3b3f45; stroke-width:1.4; }
.dg-child { fill:#fff; stroke:#8a9099; stroke-width:1.1; }
.dg-band { fill:#eef1f5; stroke:none; }
.dg-def { fill:#efe9ff; stroke:#5b46e5; stroke-width:1.2; }
.dg-code { fill:#0f1115; stroke:none; }
.dg-warnbox { fill:#fff5ee; stroke:#b4531d; stroke-width:1.1; }
.dg-h { font:600 12.5px ui-monospace,Menlo,monospace; fill:#1a1c1f; }
.dg-c { font:500 11.5px ui-monospace,Menlo,monospace; fill:#2c3036; }
.dg-dim { font:11px ui-monospace,Menlo,monospace; fill:#6b7480; }
.dg-mono { font:10.5px ui-monospace,Menlo,monospace; fill:#e6e8ee; }
.dg-code + .dg-mono { fill:#e6e8ee; }
.dg-arrow { fill:none; stroke:#5b46e5; stroke-width:1.3; }
.dg-dotted { fill:none; stroke:#5b46e5; stroke-width:1.3; stroke-dasharray:2 3; }
.dg-arrfill { fill:#5b46e5; }
.dg-rule { stroke:#c9ced6; stroke-width:1; }
ol.tight li { margin:6px 0; }
.two { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
@media (max-width:820px) { .two { grid-template-columns:1fr; } }
"""


def page(m: dict) -> str:
    b = m["boards"]
    type_count = b["type_blocks"] if b else "n"
    if m["mapping_carrier"] == "meta":
        promoted = f"; main has since promoted it to <code>blockType: 'typeMapping'</code> in <code>{m['mapping_promoted']}</code>" if m["mapping_promoted"] else ""
        carrier_note = f" On this branch a Type Mapping's kind is not even on that string yet — it is a meta stamp, <code>typeMappingBabbleVariant</code>{promoted} — so the kind has already changed carriers once, with nothing anywhere saying what a kind is."
    else:
        carrier_note = " A Type Mapping was promoted from a meta stamp to <code>blockType: 'typeMapping'</code> on the way here — the kind has already changed carriers once, with nothing anywhere saying what a kind is."
    return f"""<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Everything is a Block — what survives</title>
<style>{CSS}</style>
<main>
<h1>Everything is a Block — what survives</h1>
<p class="meta">A thinking pass on your 2026-09-09 thesis · measured against <code>{m['head']}</code> on <code>{escape(m['branch'])}</code> · tldraw {m['tldraw']} pinned · <a href="#thesis">the thesis, precisely</a> · <a href="#criteria">what good looks like</a> · <a href="#missing">what you are not seeing</a> · <a href="#prior">prior art</a> · <a href="#frame">the frame that survives</a> · <a href="#decisions">what needs you</a> · <a href="#measured">measured</a></p>

<p class="lede"><b>The short answer.</b> The <i>anatomy</i> half of your thesis is right, and the tree is already most of the way there: a Type, a Type Mapping and a Pill are each a Block with a kind, an Async region is a stock frame with a stamp, and your four sketch panels are expressible with props Block already has. The half that does not survive is "nest and style <i>instead of</i> a kind". Style and nesting cannot carry what a thing <i>means</i> — a NamedTuple against an alias, an arm against a member, a loop body against a class body — and the tree proves it by smuggling that meaning through one string, <code>blockType</code>, which on your own boards is simultaneously the label you type, a machine switch, the Behavior Tree's leaf subtitle and the Python export. The version that survives is: <b>one anatomy, one containment tree, one text seam, one closed style vocabulary — and an explicit, authored <code>kind</code> with a per-kind contract</b> saying what the body's canonical form is, what it may contain, what edges it accepts, what it projects to in Python, and which styles it defaults to. That is your thesis with its missing column filled in, and it is the same conclusion the 2026-09-06 seam audit reached from the other side.</p>

<div class="callout ok"><b>Where to affirm, not argue.</b> "Attribute block = Block with a Code child" is better than you think: a Type's body is already text, a Code block is already a stack member, and moving the text into a Code member makes it definition-shared and detachable for free — two things the current <code>attributeSource</code> prop is not. Members are already children on tldraw's own child index. The style set you sketched (footer, divider, inset / edge-to-edge, disclosure, size) is already on the schema. Your instinct that you have "seen the extent of it" is sound for the anatomy; keep it.</div>

<h2 id="thesis">1 · The thesis, reconstructed precisely</h2>
<p>Which primitives: the palette's system rungs — Behavior Tree, Loop, Branch, Block, Pill, Type, Type Mapping, Code, Port — plus members and regions. Which "couple of ways" of styling: the closed set your panels use, every one of which is a prop on Block today — footer on/off, header divider on/off, inset vs edge-to-edge (gap and gutter), a disclosure chevron, the text size rung, the glyph, the inset background, and now free vs stack for the body. What "nest" means in the store: tldraw <code>parentId</code> and the child <code>index</code> for membership and order, exactly what the members work shipped — <i>plus</i>, in your sketch, a Code child as the body's <b>source of truth</b>, which is the one place the thesis changes what is canonical.</p>
{sketch_table()}
<div class="dg">{anatomy_vs_kind_svg(m)}</div>
<p>Read the left half as the part you are right about and the right half as the part the sketch leaves out. The bottom-right strip is measured from your boards: the same string is doing four jobs, and two of its authors are machines.</p>

<h2 id="criteria">2 · What a good answer looks like here</h2>
<p>Weighted from your own stated values — Principle 3 (a small set of visual grammars so you can see what things are), Principle 1 (build from primitives, detach to primitives), the 2026-09-03 boundary (the whiteboard stays dumb, Python is rigid), PEP 0004's rule that containment is a tree fact tldraw maintains, and this morning's port ruling (store the tree when the parse drops nothing).</p>
{criteria_table()}
<div>{scores_table()}<p class="dim">B loses on exactly the criteria that are yours: deriving a kind from how something is nested and styled is canvas-side derivation, and a body that is only text has nothing definition linking or the projection can read without a parser in front of every reader. C keeps B's grammar and compactness and adds the one column B lacks.</p></div>

<h2 id="missing">3 · What you are not seeing</h2>
<h3>3.1 · The kind is already there, and it is overloaded</h3>
<p>A Block <i>looks</i> like one thing; what it <i>means</i> in Python is another. Today that meaning is carried by <code>blockType</code>, a free string: <code>isTypeBlock</code>, <code>isTypeMappingBlock</code>, <code>isUnresolvedBlock</code> and <code>isProjectionBlock</code> all switch on it, the Behavior Tree projection writes a leaf's subtitle into it (<code>btLeafBlockType</code> → 'Skill' / 'Condition' / 'Sub Tree'), definition linking shares it across occurrences, and the pyblocks codec exports it as <code>content["type"]</code>. It is also the label you type — {_count(b, 'class')} Blocks say <code>class</code>, {_count(b, 'component')} say <code>component</code>.{carrier_note} A label and a kind sharing one field is a latent collision, not a design; the thesis makes it explicit by asking nesting and style to carry the kind, and they cannot. The fix is not more style — it is a closed, authored <code>kind</code> beside the label, with a contract per kind that the readers above consult.</p>
<h3>3.2 · Your own boundary rule cuts against the literal thesis</h3>
<p>"No deriving logic within the whiteboard" (2026-09-03) is what killed derived Branch control ports and derived source/sink marks. Inferring "this Block is a Type because it has one Code child and no ports", or "this is a loop body because it is edge-to-edge", is the same derivation wearing a costume. A kind must be a fact someone wrote down, not a pattern the canvas recognises. The Async region already shows the honest form: a stock frame plus one authored stamp.</p>
<h3>3.3 · Containment is one carrier; three relations need the other two</h3>
<div class="dg">{relations_svg()}</div>
<p>Branch arms are mutually exclusive, ordered and at most one is active — <code>props.arms[]</code> plus a <code>branchArm</code> stamp, because geometry alone failed the moment an arm folded (PEP 0002). A Loop has exactly one cable back and a seed | last choice — an <i>edge</i> fact (<code>temporal: delayed</code>) plus header ports; no child can mean "next iteration". A Behavior Tree has a canonical order and attributes that must round-trip to BT.CPP — <code>props.xml</code>, with the children as projections and ownership resolved by containment (PEP 0004). A Type Mapping's target is a <i>reference</i> to another Type — nesting it would copy it. Nesting gives membership, z-order, clipping and move-with; roles, order and direction ride on props, meta and edges. The kind contract's job is to say which carrier each relation uses so a future primitive does not re-litigate it.</p>
<h3>3.4 · Text-canonical or prop-canonical is a per-kind choice, not a global one</h3>
<p>This morning's ruling — store the tree when the parse drops nothing, store text when it would — is the rule, and it lands differently per kind. A Type body drops docstrings, comments and indentation when parsed, so text is canonical there and a Code member is the right home. A port line drops nothing, so the triple stays canonical and the lane is a projection whose reconciler exists precisely because text lines have no stable ids for cables to bind to. "Every body is a Code child" would put a parser in front of every reader of <code>port.name</code> and cut cables loose from ids. The contract records the choice per kind: Type and Type Mapping <b>text</b>; ports, arms, loop headers and BT nodes <b>props</b>. See <i>C - Comment Preserving Code Editing (CST vs AST)</i> for why the lossy/lossless line is the whole question, and <i>C - Projectional Editing</i> for the pole to avoid.</p>
<h3>3.5 · "Everything is a div" is the cautionary half of HTML</h3>
<p>Div soup works for layout. It fails for every machine reader — screen readers, crawlers, forms, default keyboard behaviour — and the web's answer was to add kinds (<code>&lt;button&gt;</code>, <code>&lt;nav&gt;</code>, ARIA <code>role</code>), not to remove divs. Your machine readers are the Python projection, definition linking, go-to-definition and detach. A Block with a <code>kind</code> is a div with a role; a Block without one is a div with a class name and a hope.</p>
<h3>3.6 · Sameness is the cost of a visual grammar, not its goal</h3>
<p>Principle 3 wants a small set of grammars <i>so you can see what things are</i>. If every kind is Block plus styles, the style vocabulary becomes each kind's uniform, and a uniform only works if it is reserved: "edge-to-edge, no footer, a chevron" must mean an attributes body and nothing else, or the reader loses the glyph. The Simulink/LabVIEW dictionary in the vault is thirty-one conventions that are silhouettes and reserved marks, never fonts. So the closed style set should be <i>defaulted by kind</i> — the same move as the title-size rung being a type role — with overrides limited to the set and no kind growing controls of its own.</p>
<h3>3.7 · The cost of nesting is shape count, and the win is the registries</h3>
<p>Your Type becomes three shapes (Block, attributes member, Code) instead of one; with {type_count} Types across your boards that is small, but every occurrence of a definition replicates its descendants and every stack change runs a settle pass, so the per-kind contract should say how many members a kind may have (a Type: exactly one Code member). The win is measured on the other side: a kind on Block registers nothing in the six shape-util lists, and today one of those lists is already wrong — see <a href="#measured">measured</a>.</p>
<h3>3.8 · Where you actually are on "write it twice, abstract the third time"</h3>
<p>Two third instances exist. The text seam — Code block, Type body, Type Mapping body, port line, port lane — produced <code>CodeField</code> plus grammars this morning; that abstraction is done. The container anatomy — Expanded Block, Branch, Loop, Behavior Tree, Async frame — has a {m['region_lines']}-line base for hit-testing and nothing for painting, which is why four header heights disagree. The 2026-09-06 audit said the same thing in dispatcher terms: the primitives are sound, the seams are not, and only Block signs every registry. Your thesis is that finding seen from the anatomy side. The plan you deferred then — a <code>PrimitiveKind</code> contract beside <code>DetachableKind</code> — is the <code>kind</code> this page is asking for; un-defer only that part.</p>
<h3>3.9 · Migration is cheap where the thesis is right and impossible where it is wrong</h3>
<p>{type_count} Type Blocks store <code>attributeSource</code>; a migration creates one Code member from the text and leaves the old prop as the down-migration shadow the existing migration already strips. Branch ({_count_type(b, 'branch')} on your boards), Loop ({_count_type(b, 'loop')}) and Behavior Tree regions do not migrate at all — they keep their models behind the contract. The one true story in the tree is a warning: two agents wrote the same <code>attributeSource</code> migration independently for the same feature (the comment is still in <code>blockShapeMigrations.ts</code>) — a clean merge, one mechanism twice — which is exactly what a written contract prevents.</p>

<h2 id="prior">4 · Prior art, with specifics</h2>
{prior_art_table()}
<p class="dim">Notion, Figma, Godot, Unreal, HTML and MPS are described from their public models as I know them and were not re-fetched for this page; the tldraw row, the vault dictionary and the Enso / Neva / unit reading are checked against the tree and the vault.</p>

<h2 id="frame">5 · The frame that survives</h2>
<div class="callout"><b>One anatomy, one tree, one text seam, one closed style set — and an explicit kind.</b> A Block is the anatomy: header band (glyph · title · kind label · chips), an optional divider, a body that is some mix of a text seam, a port lane and a member stack, an optional footer. Containment is tldraw's tree, order is its child index. Text is edited through one CodeField and a grammar per kind. Style is the closed set, defaulted per kind. And <code>kind</code> is a closed enum whose contract has six columns: body's canonical form (text | props | children), what it may contain, what edges it accepts, what it projects to in Python, which relations ride on props/meta/edges rather than nesting, and its style defaults.</div>
{matrix_table()}
<h3>The migration path, in order</h3>
<div class="dg">{ladder_svg(m)}</div>
<p><b>The smallest tracer bullet:</b> the <code>kind</code> enum with its contract table and the migration that fills it from <code>blockType</code>, the four predicates reading the kind, and one test asserting no source file compares <code>blockType</code> to a literal outside the migration. Nothing paints differently; every board loads. The first visible change is rung 1, the Type body as a Code member, which is also the first deletion.</p>

<h2 id="decisions">6 · What needs you</h2>
{decisions_table()}
<p><b>What I deliberately did not do:</b> touch <code>src/</code>, write a PEP (nothing has merged; the kind contract earns one at merge time), or re-run the seam-audit builder into the tree (its unmerged branch still builds and its matrix is quoted from the 2026-09-06 record, not re-published here).</p>

<h2 id="measured">7 · Measured against the tree</h2>
{inventory(m)}
<h3>Your boards</h3>
{boards_section(b)}
<h3>What I could not verify</h3>
<ul>
<li>Your sketch reached me as a description of four panels, not the photo; the mapping in §1 is to that description.</li>
<li>How many of the {type_count} <code>type</code> labels on your boards were typed by hand versus created by the Type tool — the store cannot say, which is the point of D1.</li>
<li>The prior-art rows flagged above were not re-fetched; treat their specifics as leads.</li>
<li>Performance at 200+ shapes with three-shape Types is reasoned from the settle pass and definition replication, not profiled.</li>
</ul>
</main>
"""


def _count_type(b: dict | None, shape_type: str) -> str:
    if not b:
        return "n"
    for name, n in b["by_type"]:
        if name == shape_type:
            return str(n)
    return "0"


def main() -> None:
    m = measured()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(page(m), encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KB) measured against {m['head']}")


if __name__ == "__main__":
    main()
