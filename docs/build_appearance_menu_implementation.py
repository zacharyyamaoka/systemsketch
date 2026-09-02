"""Build the appearance menu implementation report.

Frames are written by `tests/appearance_menu_smoke.mjs` during the run that
asserts the behaviour they show; the FigJam frames beside them were read out of
FigJam's DOM by `tools/figjam/chrome_trace.py`. Every number on the page is
measured here, at build time, from the live repo and those captures — and the
FigJam readings are checked against the tokens the product uses, so the page
cannot claim a match the tree does not have.
"""
from __future__ import annotations

import base64
import json
import re
import sys
from io import BytesIO
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from report_measurements import journey_results, line_count, source_slice, unit_test_count

DOCS_DIR = Path(__file__).resolve().parent
REPO = DOCS_DIR.parent
ASSETS = DOCS_DIR / "assets"
OUTPUT_PATH = DOCS_DIR / "appearance-menu-implementation-2026-09-01.html"

FRAMES = {
    "color": "appearance-menu-1-color-2026-09-01.png",
    "shape": "appearance-menu-2-shape-2026-09-01.png",
    "connector": "appearance-menu-3-connector-2026-09-01.png",
    "picker": "appearance-menu-4-custom-picker-2026-09-01.png",
    "custom": "appearance-menu-5-custom-applied-2026-09-01.png",
    "lineStyle": "appearance-menu-6-line-style-2026-09-01.png",
    "fontSize": "appearance-menu-7-font-size-2026-09-01.png",
    "chips": "appearance-menu-8-shape-line-style-2026-09-01.png",
    "mixed": "appearance-menu-9-mixed-selection-2026-09-01.png",
}


def data_uri(image: Image.Image) -> str:
    buffer = BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def figure(key: str) -> str:
    data = base64.b64encode((DOCS_DIR / FRAMES[key]).read_bytes()).decode("ascii")
    return f"data:image/png;base64,{data}"


# --- The two captures the second pass is checked against ------------------

CHROME = json.loads((ASSETS / "figjam-chrome-traced.json").read_text())
SMOKE = "tests/appearance_menu_smoke.mjs"
GEOMETRY_PATH = DOCS_DIR / "appearance-menu-geometry.json"


def find(node: dict, predicate) -> list[dict]:
    found = []
    if predicate(node):
        found.append(node)
    for child in node.get("children", []):
        found.extend(find(child, predicate))
    return found


def rgb_to_hex(css: str) -> str:
    r, g, b = [int(v) for v in re.findall(r"\d+", css)[:3]]
    return f"#{r:02x}{g:02x}{b:02x}"


def token(name: str) -> str:
    """One `export const NAME = ...` out of figjamTokens.ts, as source text."""
    source = (REPO / "src/appearance/figjamTokens.ts").read_text(encoding="utf-8")
    match = re.search(rf"^export const {name}(?::[^=]+)? = (.+?)$", source, re.M)
    if not match:
        raise SystemExit(f"figjamTokens.ts no longer defines {name}")
    return match.group(1).strip().rstrip(",")


def token_number(name: str) -> float:
    return float(token(name))


def token_string(name: str) -> str:
    return token(name).strip("'\"")


def union(boxes: list[dict], margin: int) -> tuple[int, int, int, int]:
    boxes = [box for box in boxes if box]
    left = min(b["x"] for b in boxes) - margin
    top = min(b["y"] for b in boxes) - margin
    right = max(b["x"] + b["w"] for b in boxes) + margin
    bottom = max(b["y"] + b["h"] for b in boxes) + margin
    return int(left), int(top), int(right), int(bottom)


def crop(path: Path, box: tuple[int, int, int, int], scale: float = 2.0) -> Image.Image:
    image = Image.open(path).convert("RGB")
    left, top, right, bottom = box
    region = image.crop((max(0, left), max(0, top), min(image.width, right), min(image.height, bottom)))
    if scale != 1:
        region = region.resize((int(region.width * scale), int(region.height * scale)), Image.LANCZOS)
    return region


def figjam_crop(image: str, boxes: list[dict], margin: int = 16, scale: float = 2.0) -> str:
    return data_uri(crop(ASSETS / image, union(boxes, margin), scale))


def ours_crop(frame: str, parts: tuple[str, ...], margin: int = 16, scale: float = 2.0) -> str:
    entry = GEOMETRY[frame]
    boxes = [entry[part] for part in parts if entry.get(part)]
    return data_uri(crop(DOCS_DIR / FRAMES[frame], union(boxes, margin), scale))


# --- FigJam's readings, and the tokens they must equal -----------------------

def figjam_trigger(subject: str, label_prefix: str) -> dict:
    buttons = find(CHROME[subject]["menu"]["tree"], lambda n: (n.get("label") or "").startswith(label_prefix))
    if not buttons:
        raise SystemExit(f"the {subject} capture has no trigger starting with {label_prefix!r}")
    return buttons[0]


def figjam_separator_margin() -> int:
    dividers = find(CHROME["shape-text"]["menu"]["tree"], lambda n: n["w"] == 1 and n["h"] == 40)
    return int(re.findall(r"\d+", dividers[0]["margin"])[1])


def figjam_cell() -> dict:
    """The chosen Thin cell in the connector's Line style popover."""
    cells = find(CHROME["connector"]["lineStyle"]["tree"],
                 lambda n: n["w"] == 24 and n["h"] == 24 and n["bg"].startswith("rgb("))
    return cells[0]


def figjam_chip() -> dict:
    chips = find(CHROME["shape-text"]["fillRow"], lambda n: n["bg"].startswith("rgb(") and n["h"] == 24)
    return chips[0]


def figjam_font_sizes() -> list[int]:
    rows = find(CHROME["shape-text"]["fontSize"]["tree"], lambda n: n.get("text") and n["font"].endswith("Inter"))
    return [int(re.match(r"(\d+)px", n["font"]).group(1)) for n in rows if n["text"] in
            ("Small", "Medium", "Large", "Extra large", "Huge")]


def figjam_picker() -> dict:
    return CHROME["shape-text"]["picker"][0]


def figjam_custom_cell() -> dict:
    return CHROME["shape-text"]["customCell"]


PICKER = figjam_picker()
PICKER_TREE = PICKER["tree"]
PICKER_HEAD = find(PICKER_TREE, lambda n: n["h"] == 64 and n["w"] == 184)[0]
PICKER_SLIDERS = find(PICKER_TREE, lambda n: n["h"] == 62 and n["w"] == 184)[0]
PICKER_FIELD = find(PICKER_TREE, lambda n: n["tag"] == "input" and n.get("type") == "text")[0]
PICKER_TRACK = find(PICKER_TREE, lambda n: n["w"] == 152 and n["h"] == 16)[0]
PICKER_THUMB = find(PICKER_TREE, lambda n: n["w"] == 16 and n["h"] == 16 and "4px solid" in n["border"])[0]
FONT_SIZES = figjam_font_sizes()
LADDER = json.loads(re.sub(r"(\w+):", r'"\1":', token("FONT_SIZE_LADDER")))

# Each row: what was read out of FigJam, and the token the product carries.
# The build refuses to publish if any pair disagrees.
READINGS = [
    ("An icon trigger", f"{figjam_trigger('shape-text', 'Line style')['w']:.0f}px wide", figjam_trigger('shape-text', 'Line style')['w'], token_number("TRIGGER_WIDTH"), "TRIGGER_WIDTH"),
    ("The colour trigger", f"{figjam_trigger('shape-text', 'Change color')['w']:.0f}px, an 18px swatch in a 22px ring box", figjam_trigger('shape-text', 'Change color')['w'], token_number("TRIGGER_PADDING") * 2 + token_number("SWATCH_RING_BOX") + token_number("CHEVRON_SIZE"), "TRIGGER_PADDING · SWATCH_RING_BOX · CHEVRON_SIZE"),
    ("The Font size combobox", f"{figjam_trigger('shape-text', 'Font size')['w']:.0f}px wide", figjam_trigger('shape-text', 'Font size')['w'], token_number("TEXT_TRIGGER_WIDTH"), "TEXT_TRIGGER_WIDTH"),
    ("Clear on each side of a hairline", f"{figjam_separator_margin()}px", figjam_separator_margin(), token_number("SEPARATOR_MARGIN"), "SEPARATOR_MARGIN"),
    ("An option cell", f"{figjam_cell()['w']:.0f}px square, {figjam_cell()['radius']} radius", figjam_cell()['w'], token_number("CELL_SIZE"), "CELL_SIZE"),
    ("A chosen icon cell", figjam_cell()["bg"], rgb_to_hex(figjam_cell()["bg"]), token_string("ACCENT_RADIO"), "ACCENT_RADIO"),
    ("A chosen labelled chip", figjam_chip()["bg"], rgb_to_hex(figjam_chip()["bg"]), token_string("ACCENT"), "ACCENT"),
    ("The Font size rows", " / ".join(f"{size}px" for size in FONT_SIZES), FONT_SIZES[:4], [LADDER[k] for k in ("s", "m", "l", "xl")], "FONT_SIZE_LADDER (Huge has no tldraw rung)"),
    ("The Custom cell", f"{figjam_custom_cell()['w']:.0f}px box on the swatches' 32px pitch", figjam_custom_cell()['w'], token_number("CUSTOM_CELL_SIZE"), "CUSTOM_CELL_SIZE"),
    ("The picker", f"{PICKER['w']:.0f} × {PICKER['h']:.0f}", (PICKER['w'], PICKER['h']), (token_number("PICKER_WIDTH"), token_number("PICKER_HEIGHT")), "PICKER_WIDTH · PICKER_HEIGHT"),
    ("Its three bands", f"{PICKER_HEAD['h']:.0f} / {PICKER_SLIDERS['h']:.0f} / {PICKER['h'] - PICKER_HEAD['h'] - PICKER_SLIDERS['h']:.0f}px", (PICKER_HEAD['h'], PICKER_SLIDERS['h']), (token_number("PICKER_HEAD_HEIGHT"), token_number("PICKER_SLIDERS_HEIGHT")), "PICKER_HEAD_HEIGHT · PICKER_SLIDERS_HEIGHT"),
    ("The hex field", f"{PICKER_FIELD['h']:.0f}px tall, {PICKER_FIELD['font']}", PICKER_FIELD['h'], token_number("PICKER_FIELD_HEIGHT"), "PICKER_FIELD_HEIGHT"),
    ("A slider's travel", f"{PICKER_TRACK['w']:.0f} × {PICKER_TRACK['h']:.0f}, the track painted {PICKER_TRACK['before']['inset'].split()[1].lstrip('-')} past each end", (PICKER_TRACK['w'], PICKER_TRACK['h']), (token_number("SLIDER_TRAVEL"), token_number("SLIDER_HEIGHT")), "SLIDER_TRAVEL · SLIDER_HEIGHT"),
    ("A thumb", f"{PICKER_THUMB['w']:.0f}px, {PICKER_THUMB['border'].split(' solid')[0]} white border", (PICKER_THUMB['w'], int(PICKER_THUMB['border'].split('px')[0])), (token_number("THUMB_SIZE"), token_number("THUMB_BORDER")), "THUMB_SIZE · THUMB_BORDER"),
]

for what, reading, figjam_value, ours_value, token_name in READINGS:
    if isinstance(figjam_value, (list, tuple)):
        equal = [float(v) for v in figjam_value] == [float(v) for v in ours_value]
    elif isinstance(figjam_value, str):
        equal = figjam_value == ours_value
    else:
        equal = abs(float(figjam_value) - float(ours_value)) < 0.01
    if not equal:
        raise SystemExit(f"{what}: FigJam reads {figjam_value!r} but {token_name} is {ours_value!r} — the copy has drifted")


# --- What the journey proved ---------------------------------------------

CHECKS = [row["label"] for row in journey_results(
    DOCS_DIR / "appearance-menu-results.json", REPO / SMOKE, REPO / "src")]
GEOMETRY = json.loads(GEOMETRY_PATH.read_text())
if GEOMETRY_PATH.stat().st_mtime < (REPO / SMOKE).stat().st_mtime:
    raise SystemExit("appearance-menu-geometry.json predates the journey — re-run it")

PALETTE = "src/appearance/figjamPalette.ts"
ICONS = "src/appearance/figjamIcons.ts"
ICON_MAP = "src/appearance/figjamIconMap.ts"
ICON_MAP_TESTS = "src/appearance/figjamIconMap.test.ts"
CUSTOM = "src/appearance/customColors.ts"
CUSTOM_TESTS = "src/appearance/customColors.test.ts"
PICKER_COMPONENT = "src/appearance/CustomColorPicker.tsx"
MODEL = "src/appearance/appearanceModel.ts"
MODEL_TESTS = "src/appearance/appearanceModel.test.ts"
SHELL = "src/appearance/AppearanceControls.tsx"
GLYPHS = "src/appearance/AppearanceGlyph.tsx"
MINI_MENU = "src/blocks/ui/BlockSelectionMiniMenu.tsx"

ICON_COUNT = (REPO / ICONS).read_text(encoding="utf-8").count("viewBox: '")
PALETTE_COUNT = len([
    line for line in (REPO / PALETTE).read_text(encoding="utf-8").splitlines()
    if line.strip().startswith("['") and line.strip().endswith("],")
])
ICON_MAP_TESTS_COUNT = unit_test_count(ICON_MAP_TESTS)
CUSTOM_TESTS_COUNT = unit_test_count(CUSTOM_TESTS)
UNIT_TESTS = unit_test_count(MODEL_TESTS)

# The regression test that would have caught the baseline's parser bug must
# exist by name, or this page is describing a guard that is not there.
PARSER_TEST = "reopens a board painted in a FigJam-only colour"
if PARSER_TEST not in (REPO / CUSTOM_TESTS).read_text(encoding="utf-8"):
    raise SystemExit(f"{CUSTOM_TESTS} no longer carries the test {PARSER_TEST!r}")

EXTEND_DEFAULT_THEME = source_slice(REPO / PALETTE, "function extendDefaultTheme", "\nfor (const")
REGISTER = source_slice(REPO / CUSTOM, "export function registerCustomColors", "\n/**\n * Register every custom colour")
LOAD_SITES = [
    path for path in ("src/workspace/LocalWorkspace.tsx", "src/embed/EmbeddedCanvas.tsx", "src/previewClone.ts")
    if "hydrateCustomColors(" in (REPO / path).read_text(encoding="utf-8")
]
if len(LOAD_SITES) != 3:
    raise SystemExit(f"expected all three load sites to hydrate custom colours, found {LOAD_SITES}")

CONTROLS = [
    ("Shape", "<code>tldraw:geo</code>", "20", "Library grid, 5 per row.",
     "FigJam's picker searches; this one lists, because 20 fits without one."),
    ("Color", "<code>tldraw:color</code>", f"{PALETTE_COUNT} + Custom", "Swatch grid, 11 columns, a 22nd cell that opens the picker.",
     "FigJam's own palette, registered on the editor through a stock theme, plus FigJam's picker: hex field, "
     "eyedropper, hue, opacity, saturation/value. A picked colour is a named colour that carries its hex."),
    ("Fill", "<code>tldraw:fill</code>", "6", "Labelled chips above the palette.",
     "Exactly FigJam's Fill / Transparent / No fill idea, with tldraw's three extra treatments."),
    ("Line style", "<code>tldraw:dash</code>", "5", "Labelled chips on a shape; an icon row beside weight on a connector.",
     "FigJam has Solid / Dashed / None. tldraw adds <code>draw</code> &mdash; its default &mdash; and "
     "<code>dotted</code>; both are shown. On a connector the same popover holds the weight, as FigJam's does."),
    ("Font size", "<code>tldraw:size</code>", "4", "A 144px combobox naming the rung; a list drawn at each size.",
     "FigJam's five-rung 12/13/14/16/18px list, on tldraw's four rungs. In tldraw this one prop drives "
     "stroke weight <em>and</em> text size together; FigJam separates them."),
    ("Typeface", "<code>tldraw:font</code>", "4", "Named list, each in its own face, behind an <code>Aa</code> trigger.",
     "A clean four-for-four: Simple, Bookish, Technical, Scribbled &mdash; FigJam's names, tldraw's "
     "sans / serif / mono / draw."),
    ("Text alignment", "<code>tldraw:horizontalAlign</code>", "3", "Icon row.", "Left, centre, right."),
    ("Vertical alignment", "<code>tldraw:verticalAlign</code>", "3", "Icon row.",
     "FigJam has none; Excalidraw does, and so does tldraw."),
    ("Start point", "<code>tldraw:arrowheadStart</code>", "9", "Icon row.",
     "First, because FigJam reads start &rarr; shape &rarr; end. FigJam shows six and hides the rest "
     "behind a &hellip;; tldraw has nine and shows them all."),
    ("Line shape", "<code>systemsketch:connectionRouting</code> / <code>tldraw:arrowKind</code> / "
     "<code>tldraw:spline</code>", "3 / 2 / 2", "Icon row.",
     "A SystemSketch cable carries FigJam's full three &mdash; elbowed, curved, straight. A stock tldraw "
     "arrow is arc or elbow and a line cubic or straight, so each shows what it can actually hold."),
    ("End point", "<code>tldraw:arrowheadEnd</code>", "9", "Icon row.",
     "Last, and its icons are FigJam's own set mirrored, so an arrowhead points the way the arrow travels."),
]

DELTAS = [
    (
        "One colour, not two",
        "FigJam gives a shape a separate stroke colour and fill colour, each with its own palette; its shape Line style popover repeats the palette under Solid / Dashed / None.",
        "tldraw has a single <code>color</code> per shape that tints both. Repeating the grid under Line style "
        "would be two controls writing one value &mdash; an alias that reads as a bug the first time you "
        "change one and the other moves. Colour lives in the colour popover only; a shape's Line style is the chip row alone.",
    ),
    (
        "Every value, not FigJam's subset",
        "FigJam's stroke styles are Solid / Dashed / None; its connector weights are Thin / Thick; its font sizes end in Huge.",
        "A menu that cannot show a state the document can hold is broken, not tidy. tldraw's default dash is "
        "<code>draw</code>: hide it and a freshly drawn shape opens its own popover with nothing selected. "
        "tldraw's middle two weights and its four-rung size ladder are shown the same way, and Huge has no rung to sit on.",
    ),
    (
        "Size is one control, not two",
        "FigJam has a stroke weight (2 values, connectors only) and a font size (5 values) as separate controls.",
        "In tldraw <code>size</code> drives both. On a shape it is presented as FigJam's Font size; on a "
        "connector it is the weight inside Line style. That is a presentational grouping of one prop, not a split "
        "of it: setting a connector's weight also sets its label's size, and splitting them would need a custom "
        "style prop and a schema change, which is the boundary this repo deliberately keeps.",
    ),
    (
        "Opacity is a shape property, not a colour channel",
        "FigJam's picker has an alpha slider on the colour itself.",
        "The slider is there and drives tldraw's own <code>setOpacityForSelectedShapes</code>, which fades the "
        "whole shape, label included. It is the stock API, one undo step per drag, and the one place the two "
        "colour models differ.",
    ),
    (
        "A Block contributes nothing, but does not block its neighbours",
        "n/a &mdash; FigJam has no equivalent of a Block.",
        "A Block defines its own style props (<code>systemsketch:blockView</code> and friends) and none of "
        "tldraw's, so it has no appearance to edit and the Block-only pill is unchanged. Selected alongside a "
        "rectangle, the pill now counts the whole selection and marks the S / P / E group as the Blocks' &mdash; "
        "see &sect;7. What a Block's <em>colour</em> should mean is a decision, not a default; it is left open below.",
    ),
    (
        "Typography shows before there is text",
        "FigJam only grows the typography group once a shape actually has a label, and on a connector with a label it moves Line style after the text controls.",
        "tldraw reports font and alignment as relevant for any geo shape or arrow, since every one can carry a "
        "label. Following tldraw here means you can set the type before you type, and a connector keeps its "
        "no-label order; it is a deviation, not an oversight.",
    ),
]

FILES = [
    (MODEL, f"{UNIT_TESTS} unit tests",
     "Which controls a selection gets and what each offers, as a pure function of tldraw's "
     "<code>ReadonlySharedStyleMap</code> &mdash; and which of FigJam's two pills to copy. No React, no DOM."),
    (SHELL, f"{line_count(SHELL)} lines",
     "One <code>TldrawUiPopover</code> per control, the Custom cell nested in the colour popover; writes go through "
     "<code>markHistoryStoppingPoint</code> + <code>setStyleForSelectedShapes</code> + "
     "<code>setStyleForNextShapes</code>, the same path tldraw's own panel uses."),
    (PICKER_COMPONENT, f"{line_count(PICKER_COMPONENT)} lines",
     "FigJam's picker: hex field, eyedropper, hue, opacity, saturation/value. Live while dragging, one undo per gesture."),
    (CUSTOM, f"{CUSTOM_TESTS_COUNT} unit tests",
     "A custom colour is a named colour carrying its hex, registered through tldraw's theme API; every load site "
     "hydrates a file's names before parsing it."),
    (GLYPHS, f"{line_count(GLYPHS)} lines",
     "FigJam previews a value rather than naming it &mdash; sizes drawn at their weight, endings drawn as "
     "lines, fills drawn on one square so they can be compared; fixed trigger icons for Line style and Typeface."),
    ("src/appearance/appearance.css", "FigJam tokens",
     "Every number read out of FigJam's DOM: 56px triggers, 24px cells on a 32px pitch, two purples, the picker's three bands."),
    (PALETTE, f"{PALETTE_COUNT} colours",
     "FigJam's palette as a stock <code>TLTheme</code>, spread over <code>DEFAULT_THEME</code> and written back "
     "into it, so tldraw's own thirteen stay registered and a themeless store keeps ours."),
    (ICONS, f"{ICON_COUNT} icons",
     "Generated by <code>tools/figjam/emit_icons.py</code>: the exact path data FigJam draws, keyed by control and by FigJam's "
     "own name for the value, now including the pill's fixed trigger icons and the picker's eyedropper."),
    (ICON_MAP, f"{ICON_MAP_TESTS_COUNT} unit tests",
     "Which FigJam icon stands for which tldraw value &mdash; deliberately partial, because tldraw has "
     "nine arrowheads to FigJam's six and four sizes to its two."),
    (MINI_MENU, f"{line_count(MINI_MENU)} lines",
     "A mixed selection reads <em>N selected</em> with the S / P / E group marked as the Blocks'."),
    (SMOKE, f"{len(CHECKS)} checks",
     "Drives the real product composition, reads two oracles per change, and asserts FigJam's geometry."),
]

CONTROL_COUNT = len(CONTROLS)

# FigJam beside the copy, cropped at build time from the geometry each side recorded.
PAIRS = [
    ("The connector's pill",
     "Change color, Line style | Add text | Start point, Line shape, End point. Ours has no Add text and shows tldraw's Typeface, which an arrow always carries.",
     figjam_crop("figjam-chrome-connector-pill.png", [CHROME["connector"]["menu"]]),
     ours_crop("connector", ("pill",))),
    ("The shape's pill",
     "Shape | Change color, Line style | Typeface, Font size | ... | Text alignment. The fixed three-bar and Aa triggers, and the 144px Font size combobox naming its rung.",
     figjam_crop("figjam-chrome-shape-text-pill.png", [CHROME["shape-text"]["menu"]]),
     ours_crop("chips", ("pill",))),
    ("A connector's Line style",
     "Thin, Thick | Solid, Dashed: one 44px popover, one hairline cutting its full height. Ours holds tldraw's four weights and five dashes on the same cells.",
     figjam_crop("figjam-chrome-connector-line-style.png", [CHROME["connector"]["menu"], CHROME["connector"]["lineStyle"]]),
     ours_crop("lineStyle", ("pill", "panel"))),
    ("Font size",
     "Each rung at its own size, the chosen one checked, no fill. FigJam's number field below the list has no tldraw value to write and is not copied.",
     figjam_crop("figjam-chrome-font-size.png", [CHROME["shape-text"]["menu"], CHROME["shape-text"]["fontSize"]]),
     ours_crop("fontSize", ("pill", "panel"))),
    ("Custom",
     "The picker opens flush under the palette, centred on the 22nd cell, with the current hex selected: eyedropper, hex, hue, opacity, and the 184px square.",
     data_uri(Image.open(ASSETS / "figjam-chrome-custom-picker-context.png").convert("RGB")),
     ours_crop("picker", ("pill", "panel", "picker"), margin=24)),
    ("A custom colour, applied",
     "The Custom cell becomes the colour with the wheel as a ring around it, no swatch is ringed, and the trigger shows the colour.",
     figjam_crop("figjam-custom-state-palette.png", [CHROME["shape-text"]["changeColor"]], margin=24),
     ours_crop("custom", ("panel", "picker"), margin=24)),
]

CSS = """
    :root {
      color-scheme: light;
      --ink: #14161a; --muted: #626975; --faint: #8b93a1;
      --line: #dfe3e9; --paper: #f7f8fa; --card: #ffffff;
      --accent: #5b5ee5; --accent-soft: #eeefff;
      --green: #177245; --green-soft: #e9f8ef;
      --amber: #8a5a00; --amber-soft: #fff5e0;
      --red: #9b2c2c; --red-soft: #fdecec;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    body { margin: 0; color: var(--ink); background: var(--paper); }
    main { width: min(1180px, calc(100% - 40px)); margin: 0 auto; padding: 54px 0 96px; }
    .eyebrow { margin: 0 0 12px; color: var(--accent); font: 750 12px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .1em; text-transform: uppercase; }
    h1 { max-width: 900px; margin: 0; font-size: clamp(40px, 5.6vw, 70px); line-height: .97; letter-spacing: -.05em; }
    .lede { max-width: 800px; margin: 24px 0 0; color: var(--muted); font-size: 19px; line-height: 1.6; }
    .chips { display: flex; flex-wrap: wrap; gap: 9px; margin-top: 26px; }
    .chip { display: inline-flex; align-items: center; padding: 8px 12px; border: 1px solid var(--line); border-radius: 999px; background: #fff; color: var(--muted); font: 650 12.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
    .chip.ok { border-color: #b9e3c9; background: var(--green-soft); color: var(--green); }
    section { margin-top: 60px; }
    h2 { margin: 0 0 6px; font-size: 30px; letter-spacing: -.03em; }
    h3 { margin: 30px 0 6px; font-size: 18px; letter-spacing: -.02em; }
    .sub { margin: 0 0 22px; max-width: 800px; color: var(--muted); font-size: 16px; line-height: 1.6; }
    p { line-height: 1.65; }
    blockquote { margin: 18px 0; padding: 14px 20px; border-left: 4px solid var(--accent); border-radius: 0 12px 12px 0; background: var(--accent-soft); color: var(--ink); font-size: 15px; line-height: 1.6; }
    blockquote cite { display: block; margin-top: 6px; color: var(--muted); font-size: 12.5px; font-style: normal; }
    figure { margin: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 18px; background: var(--card); box-shadow: 0 12px 40px rgba(28,34,48,.06); }
    figure img { display: block; width: 100%; height: auto; }
    figcaption { padding: 13px 17px 15px; border-top: 1px solid var(--line); color: var(--muted); font-size: 13.5px; line-height: 1.55; }
    figcaption b { color: var(--ink); }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
    .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 0; margin-top: 18px; border: 1px solid var(--line); border-radius: 18px; overflow: hidden; background: var(--card); box-shadow: 0 12px 40px rgba(28,34,48,.06); }
    .pair > div { display: flex; flex-direction: column; min-width: 0; }
    .pair > div + div { border-left: 1px solid var(--line); }
    .pair .who { padding: 9px 15px; border-bottom: 1px solid var(--line); background: #f2f4f7; font: 760 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .07em; text-transform: uppercase; color: var(--faint); }
    .pair .shot { display: flex; flex: 1; align-items: center; justify-content: center; padding: 14px; background: #eceef2; }
    .pair .shot img { max-width: 100%; height: auto; border-radius: 8px; }
    .pair .cap { grid-column: 1 / -1; padding: 13px 17px 15px; border-top: 1px solid var(--line); color: var(--muted); font-size: 13.5px; line-height: 1.55; }
    .pair .cap b { color: var(--ink); }
    table { width: 100%; margin-top: 18px; border-collapse: collapse; background: var(--card); border: 1px solid var(--line); border-radius: 16px; overflow: hidden; font-size: 14px; }
    th, td { padding: 11px 14px; text-align: left; border-bottom: 1px solid var(--line); vertical-align: top; line-height: 1.55; }
    th { background: #f2f4f7; font-size: 11.5px; font-weight: 760; letter-spacing: .07em; text-transform: uppercase; color: var(--faint); }
    td.n { text-align: center; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--muted); }
    td.ok { color: var(--green); font: 750 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: nowrap; }
    tr:last-child td { border-bottom: none; }
    code { padding: 2px 5px; border-radius: 5px; background: #eef0f4; font: 640 12.5px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
    pre { margin: 20px 0 0; padding: 20px 22px; overflow-x: auto; border: 1px solid #23262e; border-radius: 16px; background: #191b21; color: #e6e8ee; font: 500 13px/1.7 ui-monospace, SFMono-Regular, Menlo, monospace; }
    pre code { padding: 0; background: transparent; color: inherit; font: inherit; }
    pre .c { color: #8f96a6; }
    pre .k { color: #ff8fbe; }
    pre .n2 { color: #9fd0ff; }
    ul.checks { margin: 18px 0 0; padding: 0; list-style: none; display: grid; gap: 8px; }
    ul.checks li { display: grid; grid-template-columns: auto 1fr; gap: 11px; align-items: baseline; padding: 12px 15px; border: 1px solid #c7e6d3; border-radius: 13px; background: var(--green-soft); font-size: 14.5px; }
    ul.checks b { color: var(--green); font: 750 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
    .delta { margin-top: 14px; padding: 18px 20px; border: 1px solid #f0d9a8; border-radius: 16px; background: var(--amber-soft); }
    .delta h3 { margin: 0 0 6px; color: #6b4500; font-size: 16px; }
    .delta p { margin: 0 0 8px; font-size: 14.5px; color: var(--amber); }
    .delta p:last-child { margin-bottom: 0; }
    .delta .figjam { color: #7a6440; font-style: italic; }
    .delta.bug { border-color: #efb9b9; background: var(--red-soft); }
    .delta.bug h3 { color: var(--red); }
    .delta.bug p { color: #6d2b2b; }
    .delta.ask { border-color: #c9caf5; background: var(--accent-soft); }
    .delta.ask h3 { color: #3b3ea8; }
    .delta.ask p { color: #3a3d6b; }
    .note { margin-top: 22px; padding: 18px 20px; border: 1px solid #c9caf5; border-radius: 16px; background: var(--accent-soft); font-size: 15px; line-height: 1.6; }
    footer { margin-top: 72px; padding-top: 22px; border-top: 1px solid var(--line); color: var(--faint); font-size: 13px; line-height: 1.7; }
    @media (max-width: 900px) { .grid2, .pair { grid-template-columns: 1fr; } .pair > div + div { border-left: 0; border-top: 1px solid var(--line); } }
"""


def escape(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def build() -> str:
    readings_rows = "".join(
        f"<tr><td><b>{what}</b></td><td>{reading}</td><td><code>{name}</code></td><td class=\"ok\">EQUAL</td></tr>"
        for what, reading, _figjam, _ours, name in READINGS
    )
    pairs = "".join(f"""
    <div class="pair">
      <div><div class="who">FigJam</div><div class="shot"><img src="{figjam}" alt="FigJam: {title}"></div></div>
      <div><div class="who">SystemSketch</div><div class="shot"><img src="{ours}" alt="SystemSketch: {title}"></div></div>
      <div class="cap"><b>{title}.</b> {caption}</div>
    </div>""" for title, caption, figjam, ours in PAIRS)

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SystemSketch &middot; Appearance menu implementation</title>
  <style>{CSS}</style>
</head>
<body>
<main>

  <p class="eyebrow">SystemSketch &middot; implementation report &middot; 2026-09-01</p>
  <h1>You can change how things look now</h1>
  <p class="lede">
    SystemSketch ships with tldraw's style panel switched off, so until now a shape's colour, fill, stroke,
    size, typeface, alignment, routing and endpoints could not be changed on canvas at all. The selection
    pill now carries them, laid out the way
    <a href="figjam-appearance-menu-spec-2026-09-01.html">FigJam lays them out</a>, over tldraw's own styles
    &mdash; and, since the second pass in &sect;7, at FigJam's own sizes, with FigJam's own picker behind a Custom cell.
  </p>
  <div class="chips">
    <span class="chip ok">{len(CHECKS)}/{len(CHECKS)} browser checks</span>
    <span class="chip ok">{UNIT_TESTS + CUSTOM_TESTS_COUNT + ICON_MAP_TESTS_COUNT} appearance unit tests</span>
    <span class="chip ok">{len(READINGS)} FigJam readings equal their tokens</span>
    <span class="chip">{CONTROL_COUNT} controls &middot; 0 new shape props</span>
    <span class="chip">tldraw 5.3.2, unforked</span>
  </div>

  <div class="note">
    <b>The closed vocabulary is still the feature.</b> Every option is a value tldraw's style system already
    accepts, so the menu can only ever ask for a state a shape can actually hold. The picker does not break
    that: a colour it produces becomes a <em>named</em> colour on tldraw's enum, registered through the same
    theme API the palette uses, and the name carries the hex so the file describes its own colours.
  </div>

  <section>
    <h2>1 &middot; What it does</h2>
    <div class="grid2">
      <figure>
        <img src="{figure('color')}" alt="A selected rectangle in SystemSketch with the colour popover open above the pill">
        <figcaption><b>Colour.</b> FigJam's fill row stacked over the palette in one popover, 8&nbsp;px clear of the pill, on the pill's own surface; the 22nd cell is Custom. The current colour is ringed; the current fill is filled.</figcaption>
      </figure>
      <figure>
        <img src="{figure('custom')}" alt="The custom colour picker open under the palette, with a mint colour applied">
        <figcaption><b>Custom.</b> FigJam's picker, flush under the palette. A typed or dragged colour repaints the shape live; the cell shows it with the wheel as a ring, and the file stores it as <code>custom-a3f2c1</code>.</figcaption>
      </figure>
    </div>
    <figure style="margin-top:18px">
      <img src="{figure('lineStyle')}" alt="A selected connector with its Line style popover open: weight beside dash">
      <figcaption><b>Connectors get different controls.</b> No shape, no fill; one Line style holding weight beside dash, then routing and two endpoints. Nothing decides this by hand &mdash; the controls are whatever <code>useRelevantStyles()</code> says applies, which is the same driven-by-what-the-selection-has rule FigJam uses.</figcaption>
    </figure>
  </section>

  <section>
    <h2>2 &middot; The controls</h2>
    <p class="sub">
      {CONTROL_COUNT} controls over stock tldraw styles. No new shape props, no schema change, nothing that would move
      the boundary this repo guards.
    </p>
    <table>
      <tr><th>Control</th><th>tldraw style</th><th class="n">Values</th><th>Popover</th><th>Against FigJam</th></tr>
      {''.join(f'<tr><td><b>{name}</b></td><td>{style}</td><td class="n">{count}</td><td>{layout}</td><td>{note}</td></tr>' for name, style, count, layout, note in CONTROLS)}
    </table>
    <pre><span class="c">// The write path, straight out of tldraw's own style panel</span>
editor.markHistoryStoppingPoint(<span class="n2">'appearance'</span>)
editor.run(() => {{
  <span class="k">if</span> (editor.isIn(<span class="n2">'select'</span>)) editor.setStyleForSelectedShapes(style, value)
  editor.setStyleForNextShapes(style, value)
}})</pre>
  </section>

  <section>
    <h2>3 &middot; Copying FigJam's own values</h2>
    <p class="sub">
      A first pass copied FigJam's <em>layout</em> and drew everything else by hand. Zach looked at it and
      named four things that were still wrong. Each was fixed by reading the value out of FigJam rather
      than by judging it &mdash; and one of them was a claim of mine that turned out to be false.
    </p>

    <div class="delta">
      <h3>The palette: I said this needed a fork. It does not.</h3>
      <p class="figjam">FigJam: {PALETTE_COUNT} colours in an 11&times;2 grid, plus a Custom picker.</p>
      <p>
        I had said FigJam's palette would need a custom colour <code>StyleProp</code>, that a custom style
        prop means replacing tldraw's built-in shape utils, and that replacing shape utils is a fork &mdash;
        so the answer was tldraw's thirteen. That reasoning was wrong at the first step.
        tldraw derives the colour style <em>from the theme</em>: <code>&lt;Tldraw themes={{...}}&gt;</code>
        calls <code>registerColorsFromThemes</code> before any effect runs or any store loads, and that
        function calls <code>DefaultColorStyle.addValues(...)</code> for every colour a theme names. The
        palette is a documented prop on the stock component. No shape util is replaced, no schema forked.
      </p>
      <p>
        The subtlety is in the same function's other half: it also <em>removes</em> any registered colour
        absent from every theme. A palette of only FigJam's names would unregister tldraw's <code>grey</code>,
        and a board that had ever stored a grey shape would fail validation on load. So the theme spreads
        <code>DEFAULT_THEME</code> rather than replacing it &mdash; all thirteen stay registered, and the
        menu simply shows FigJam's {PALETTE_COUNT}. (&sect;7 found the same removal biting from a second direction.)
      </p>
      <p>
        The hexes are sampled from FigJam's own popover: the centre pixel of each 24px swatch, located from
        the panel geometry rather than by eye.
      </p>
    </div>

    <div class="delta">
      <h3>The icons: traced, not approximated</h3>
      <p class="figjam">FigJam: filled paths on a 24&times;24 viewBox, drawn with a CSS variable.</p>
      <p>
        {ICON_COUNT} icons are captured from the running application. FigJam's option cells are unlabelled
        divs, so an icon's meaning only exists in its tooltip: the tracer hovers each cell, reads the
        tooltip, and reads the SVG under the cursor, so every path arrives already paired with FigJam's own
        word for it rather than by counting positions in a screenshot.
      </p>
      <p>
        Keys are namespaced by control, and that is not tidiness. FigJam calls two different icons
        <code>Triangle</code> &mdash; a shape in the library, an outline arrowhead in the endpoint list &mdash;
        and a first cut keyed on the bare name, which silently drew <em>arrowheads in the shape picker</em>.
        The failure was silent because an unknown key falls back to a drawn glyph rather than throwing, so
        <code>{ICON_MAP_TESTS}</code> now fails on any name that was not traced.
      </p>
      <p>
        Arrowheads mirror on the end control: FigJam draws one set of six and flips it for the far end, so
        the icon always points the way the arrow travels.
      </p>
    </div>

    <div class="delta">
      <h3>The control order follows the arrow</h3>
      <p class="figjam">FigJam: <code>Change color | Line style | Add text | Start point | Line shape | End point</code>.</p>
      <p>
        Where the arrow leaves, how it travels, where it lands. The first pass put the line shape ahead of
        both ends. This was already in the capture &mdash; the frames are named
        <code>04-start-point</code>, <code>05-line-shape</code>, <code>06-end-point</code> &mdash; and had
        simply not been read.
      </p>
    </div>

    <div class="delta">
      <h3>Three line shapes, because we have three</h3>
      <p class="figjam">FigJam: <code>Elbowed &middot; Curved &middot; Straight</code>.</p>
      <p>
        The menu showed two. SystemSketch's own cable style has carried exactly FigJam's three all along
        &mdash; <code>CONNECTION_ROUTING_KINDS</code> is <code>curved / straight / elbow</code> &mdash; and the
        appearance menu had simply never surfaced it. It does now, so a cable reaches the full vocabulary,
        while a stock tldraw arrow keeps the two kinds it actually has. Offering a third to a shape that
        cannot hold one would be the failure mode this whole model exists to avoid.
      </p>
    </div>
  </section>

  <section>
    <h2>4 &middot; Where it deliberately differs from FigJam</h2>
    <p class="sub">
      {len(DELTAS)} decisions worth arguing with. Each is a consequence of building on tldraw's styles rather
      than a shortcut, and each is reversible.
    </p>
    {''.join(f'''
    <div class="delta">
      <h3>{title}</h3>
      <p class="figjam">FigJam: {figjam}</p>
      <p>{ours}</p>
    </div>''' for title, figjam, ours in DELTAS)}
  </section>

  <section>
    <h2>5 &middot; Live proof</h2>
    <p class="sub">
      <code>npm run test:appearance</code> drives the real product composition on an isolated board. Every
      change is checked against <em>two</em> oracles: the pill's own label, which comes from
      <code>useRelevantStyles()</code> and so round-trips through the document, and the painted
      <code>stroke</code> attribute on the canvas. A change that only moved the UI fails. The second pass
      added FigJam's geometry as a third: trigger widths, cell sizes, the two purples, the picker's bands.
    </p>
    <ul class="checks">
      {''.join(f'<li><b>PASS</b><span>{check}</span></li>' for check in CHECKS)}
    </ul>
    <div class="note">
      <b>One bug this found is worth keeping in mind.</b> <code>TldrawUiPopover</code> computes its open
      state as <code>open || isOpen</code> &mdash; it ORs any <code>open</code> prop with its own
      <code>useMenuIsOpen</code>. A component that also tracks the state can therefore open a popover but
      never close it, and clicking the trigger again does nothing. The fix is to pass neither prop and style
      on Radix's <code>data-state="open"</code>.
    </div>
  </section>

  <section>
    <h2>6 &middot; The change</h2>
    <table>
      <tr><th>File</th><th>Carries</th><th>What it is</th></tr>
      {''.join(f'<tr><td><code>{path}</code></td><td>{size}</td><td>{what}</td></tr>' for path, size, what in FILES)}
    </table>
  </section>

  <section>
    <h2>7 &middot; The second pass: the chrome, read from the DOM</h2>
    <p class="sub">
      The handoff left five tasks. Four are done here and the fifth is a question. The method did not change:
      every value below was read out of FigJam's running editor over the DevTools Protocol
      (<code>tools/figjam/chrome_trace.py</code>, which dumps the pill and each popover as a DOM tree with
      computed styles and path data), and the build of this page checks each reading against the token the
      product carries. It refuses to publish if any pair disagrees.
    </p>

    <h3>Side by side</h3>
    {pairs}

    <h3>Read from FigJam, carried as a token</h3>
    <table>
      <tr><th>What</th><th>FigJam's DOM says</th><th>figjamTokens.ts</th><th></th></tr>
      {readings_rows}
    </table>
    <p>
      Two of these corrected the first pass rather than extending it. Cells in an icon row are 24px on a
      32px pitch, not 32px on 36; and there are <em>two</em> purples &mdash; <code>#9747ff</code> for a
      labelled chip, <code>#8a38f5</code> for an icon cell and for the ring around the chosen swatch &mdash;
      where the first pass had used one. A trigger is 56px because the 24px icon is butted straight against
      the 16px chevron with 8px either side, and the colour trigger is 54px because its 18px swatch sits in a
      22px ring box instead. The Fill chips and the Solid / Dashed / None chips are two different components
      in FigJam (a 24px icon with no left padding; a 16px icon in a 24px slot with 4px before it) and are kept
      as two here.
    </p>

    <h3>Task 1 &middot; Custom colour</h3>
    <blockquote>
      &ldquo;I think we can just save the hex into like the metadata or something in the file so that it can be
      loaded?&rdquo;
      <cite>Zach, mid-task, on the open question of how a custom colour should persist.</cite>
    </blockquote>
    <p>
      That is what is built, with one refinement: the hex is saved <em>in the colour's name</em>, on every shape
      that uses it, rather than in a registry beside them. tldraw's <code>color</code> is a closed enum, so a
      picked colour has to become a named colour before any shape can hold it; naming it
      <code>custom-a3f2c1</code> means the file describes its own colours, nothing can drift between a
      registry and the shapes, and the answer to &ldquo;which build can open this board&rdquo; is simply
      &ldquo;any build that knows the prefix&rdquo;. The unbounded, faithful option was taken over a fixed set of
      slots, because slot reuse would have silently recoloured other shapes; the cost is that a session
      registers one theme entry per distinct hex it ever previews, which is a kilobyte apiece.
    </p>
    <pre><code>{escape(REGISTER)}</code></pre>
    <p>
      The store validates <em>before</em> it loads, so a saved board naming <code>custom-a3f2c1</code> would
      fail to parse unless the name were registered first. Every load path &mdash;
      {', '.join(f'<code>{site}</code>' for site in LOAD_SITES)} &mdash; therefore scans the raw text for
      custom names and registers them before parsing. The journey proves the round trip: type a hex, wait for
      the autosave, confirm the file contains <code>"custom-a3f2c1"</code>, reopen the board, and read the
      colour back off the pill and the painted stroke.
    </p>

    <div class="delta bug">
      <h3>Found on the way: a board in FigJam's teal could not be reopened</h3>
      <p class="figjam">Baseline: a board painted in any of FigJam's nine names tldraw does not ship (teal, pink, dark-gray, gray, light-gray, light-orange, light-yellow, light-teal, light-pink) failed to load with <code>invalidRecords</code>.</p>
      <p>
        <code>parseTldrawJsonFile</code>, which every load path uses, creates a throwaway store of its own
        with no themes. That store's <code>registerColorsFromThemes</code> resolves to tldraw's
        <code>DEFAULT_THEME</code> alone and &mdash; the removal half of &sect;3 again &mdash; unregisters
        every other name, custom or FigJam's, on the very parse that would load them. The first pass never
        reloaded a board, so nothing caught it. The one object every registration path resolves through is
        <code>DEFAULT_THEME</code>, so the palette and every custom colour are now written into its colour
        tables as well as into the theme the app paints with:
      </p>
      <pre><code>{escape(EXTEND_DEFAULT_THEME)}</code></pre>
      <p>
        <code>{CUSTOM_TESTS}</code> now parses a one-rectangle board through tldraw's own file parser twice
        &mdash; painted in <code>teal</code>, and in a custom colour after hydration &mdash; and this page
        refuses to build if the test named &ldquo;{PARSER_TEST}&rdquo; is gone. Worth an upstream issue:
        <code>parseTldrawJsonFile</code> takes no <code>themes</code>, so any app with a custom palette hits this.
      </p>
    </div>

    <h3>Task 2 &middot; Line style is one control</h3>
    <p>
      FigJam's connector Line style is one 145&times;44 popover holding <code>Thin Thick | Solid Dashed</code>.
      The model now decides which of FigJam's two pills to copy from the same style map it always used: a
      connector anywhere in the selection (an arrowhead, an arrow kind, a spline, a cable routing) merges
      <code>size</code> and <code>dash</code> into one <code>lineStyle</code> control, the weight group
      <em>beside</em> the dash group with a hairline cutting the panel's full height, exactly the mechanism
      the Fill row already used <em>above</em> the palette. On a shape, FigJam's Line style is the chip row
      (its palette underneath is the alias &sect;4 declines), and its size is FigJam's Font size: a 144px
      combobox after Typeface, with each rung listed at 12 / 13 / 14 / 16px and the chosen one checked. That
      reordering &mdash; Font size after Typeface, not beside Line style &mdash; was in the capture and had not
      been read.
    </p>

    <h3>Task 3 &middot; The remaining icons</h3>
    <p>
      Five more icons were read off FigJam and are now in the product: the three-bar Line style trigger, the
      <code>Aa</code> Typeface trigger, the menu check mark beside a chosen list row, the picker's eyedropper,
      and Add text (captured for completeness, unused). Nothing else could honestly be added. The tldraw
      values that still fall back to a drawn glyph &mdash; <code>draw</code> and <code>dotted</code> dashes,
      the middle two weights, the <code>square</code> / <code>pipe</code> / <code>bar</code> arrowheads,
      eleven of twenty geo shapes, and vertical alignment &mdash; are states FigJam does not have an icon for.
      FigJam's library has 22 shapes and nine map; the rest (Cylinder, Document, Folder, Chevron&hellip;) have
      no tldraw <code>geo</code> value, so that is bounded by tldraw, not by the tracing. Inventing a
      FigJam-looking icon for a state FigJam lacks would teach a muscle memory that is wrong.
    </p>

    <h3>Task 4 &middot; The mixed-selection label</h3>
    <p>
      Two Blocks and three shapes read &ldquo;2 Blocks&rdquo;, as though the Blocks had overridden the
      selection. It now reads &ldquo;5 selected&rdquo;, and the S / P / E group carries a small
      &ldquo;2 Blocks&rdquo; caption naming what it governs; a Blocks-only batch still reads
      &ldquo;N Blocks&rdquo;, so <code>npm run test:batch</code> is unchanged.
    </p>
    <figure style="margin-top:18px">
      <img src="{figure('mixed')}" alt="A Block and a rectangle selected together: the pill reads 2 selected, with 1 Block marking the view group">
      <figcaption><b>Mixed.</b> The count is the whole selection; the Block-only group says whose setting it is; the rectangle's paint stays reachable.</figcaption>
    </figure>

    <div class="delta ask">
      <h3>Task 5 &middot; What should a Block's colour mean? (needs Zach)</h3>
      <p class="figjam">A Block declares only <code>systemsketch:*</code> style props, so it contributes nothing to the menu and a Block-only pill has no appearance controls.</p>
      <p>
        Not built, on purpose. Three readings are plausible and they are not the same feature: the header
        band (a tag, like FigJam's sticky colours), the border (a state, like a highlighted node), or a
        semantic category that the file format should own rather than a palette. Recommendation, if it has to
        be one: the header band, driven by tldraw's own <code>color</code> style added to the Block's props
        &mdash; it is the FigJam sticky-note idiom, it reuses this whole menu unchanged, and it survives a
        change of mind because the value is a stock style. The reversible default if nothing is said: leave it
        as it is.
      </p>
    </div>

    <div class="delta ask">
      <h3>Smaller calls made without asking</h3>
      <p>
        <b>Opacity</b> is FigJam's alpha mapped onto tldraw's shape opacity (&sect;4). <b>Huge</b> has no
        tldraw rung and no row. <b>A connector with a label</b> keeps its no-label order; FigJam moves Line
        style after the text controls once a label exists. <b>FigJam's number field</b> under the Font size
        list has no value tldraw could hold and is not copied. <b>Paste</b> of a shape carrying a custom colour
        into a session that has never seen it is not handled &mdash; tldraw's paste path validates before any
        hook here runs &mdash; and is the one known gap. <b>Stable</b> (built before this pass) cannot open a
        board that uses a custom colour, exactly as it cannot open one in FigJam's teal; that is the same
        one-way door every new colour is.
      </p>
    </div>
  </section>

  <footer>
    <p>
      <b>Reproduce.</b> <code>npm run test:appearance</code> for the browser proof and its frames;
      <code>npm run check</code> for types and the unit suites;
      <code>python3 tools/figjam/emit_icons.py --check</code> to confirm the icon module matches its captures.
      Rebuild this page with <code>python3 docs/build_appearance_menu_implementation.py</code>.
    </p>
    <p>
      <b>Not yet done.</b> Rich text &mdash; bold, strikethrough, links, lists &mdash; is a separate tldraw
      feature with its own toolbar and is untouched here. FigJam's separate stroke weight on shapes and its
      shape-picker search remain the two things a stock <code>size</code> and a 20-entry list do not need.
    </p>
  </footer>

</main>
</body>
</html>
"""


if __name__ == "__main__":
    OUTPUT_PATH.write_text(build(), encoding="utf-8")
    print(f"wrote {OUTPUT_PATH} ({OUTPUT_PATH.stat().st_size / 1024:.0f} KB)")
