"""Emit `src/appearance/figjamIcons.ts` from the captured SVGs.

Two captures feed it: `docs/assets/figjam-icons-traced.json` (the option cells,
from `icon_trace.py`) and `docs/assets/figjam-chrome-traced.json` (the pill's
fixed trigger icons, the picker's eyedropper, from `chrome_trace.py`). The
module is regenerated whole, so an icon is either in a capture or it is not in
the product — there is no hand-drawn path that looks traced.

Usage: python3 emit_icons.py [--check]   (--check: fail if the module would change)
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
ICONS = os.path.join(REPO, "docs", "assets", "figjam-icons-traced.json")
CHROME = os.path.join(REPO, "docs", "assets", "figjam-chrome-traced.json")
MODULE = os.path.join(REPO, "src", "appearance", "figjamIcons.ts")

PATH_RE = re.compile(r"<path\b([^>]*)>")
ATTR_RE = re.compile(r'([a-zA-Z-]+)="([^"]*)"')


def paths_of(svg_inner: str) -> list[dict]:
    """Every `<path>` in an SVG, keeping only the geometry and the fill rule."""
    out = []
    for attrs in PATH_RE.findall(svg_inner):
        attributes = dict(ATTR_RE.findall(attrs))
        if "d" not in attributes:
            continue
        entry = {"d": attributes["d"]}
        if attributes.get("fill-rule"):
            entry["rule"] = attributes["fill-rule"]
        out.append(entry)
    return out


def ts_string(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"


def entry(key: str, view_box: str, paths: list[dict]) -> str:
    rendered = ", ".join(
        "{ d: " + ts_string(p["d"]) + (f", rule: {ts_string(p['rule'])}" if p.get("rule") else "") + " }" for p in paths
    )
    return f"  {ts_string(key)}: {{ viewBox: {ts_string(view_box)}, paths: [{rendered}] }},"


def traced_cells() -> dict[str, tuple[str, list[dict]]]:
    icons = {}
    for key, cell in json.load(open(ICONS)).items():
        if not cell.get("svg") or not cell.get("viewBox"):
            continue
        # The tracer hovered the Font size rows and read the SVG under the
        # cursor, which in that menu is the check mark beside the row, not a
        # size glyph. It is FigJam's menu check, so it is kept under that name.
        if key == "font-size/Small":
            key = "menu/Check"
        icons[key] = (cell["viewBox"], paths_of(cell["svg"]))
    return icons


def find(node, predicate, acc):
    if predicate(node):
        acc.append(node)
    for child in node.get("children", []):
        find(child, predicate, acc)
    return acc


def chrome_icons() -> dict[str, tuple[str, list[dict]]]:
    """The fixed icons on the pill's triggers, and the picker's eyedropper."""
    chrome = json.load(open(CHROME))
    icons = {}

    def trigger_icon(subject: str, label_prefix: str, key: str):
        buttons = find(chrome[subject]["menu"]["tree"],
                       lambda n: (n.get("label") or "").startswith(label_prefix), [])
        if not buttons:
            raise SystemExit(f"no trigger starting with {label_prefix!r} in the {subject} capture")
        # The first SVG is the icon; the second is the chevron every trigger shares.
        svgs = find(buttons[0], lambda n: n.get("svg") and n["w"] == 24, [])
        if not svgs:
            raise SystemExit(f"{label_prefix!r} trigger carries no 24px icon")
        icons[key] = (svgs[0]["svg"]["viewBox"], paths_of(svgs[0]["svg"]["inner"]))

    trigger_icon("connector", "Line style", "trigger/Line style")
    trigger_icon("shape-text", "Typeface", "trigger/Typeface")
    trigger_icon("connector", "Add text", "trigger/Add text")

    picker = [p for p in chrome["shape-text"]["picker"] if p["w"] < 200]
    if not picker:
        raise SystemExit("the picker is not in the chrome capture")
    eyedropper = find(picker[0]["tree"], lambda n: n.get("label") == "Eyedropper", [])
    svgs = find(eyedropper[0], lambda n: n.get("svg"), []) if eyedropper else []
    if not svgs:
        raise SystemExit("the picker's eyedropper carries no SVG")
    icons["picker/Eyedropper"] = (svgs[0]["svg"]["viewBox"], paths_of(svgs[0]["svg"]["inner"]))
    return icons


HEADER = """/**
 * FigJam's own icons, traced from the running application.
 *
 * Each entry is the exact `<path>` data FigJam draws, captured by hovering the
 * option cell to read its tooltip and reading the SVG under the cursor — so
 * every path arrives already paired with the word FigJam uses for it, rather
 * than by counting positions in a screenshot.
 *
 * Keys are namespaced by control because FigJam reuses names across controls
 * and means something different by each: a `Triangle` in the shape library is a
 * triangle, while a `Triangle` in the endpoint list is an outline arrowhead.
 * Keying on the bare name silently drew arrowheads in the shape picker.
 *
 * Icons carry muscle memory: a reader who knows FigJam should recognise the
 * elbowed connector or the solid arrowhead without reading a label, which is
 * why these are copied rather than approximated.
 *
 * Generated by `tools/figjam/emit_icons.py` from `docs/assets/figjam-icons-traced.json`
 * (the option cells) and `docs/assets/figjam-chrome-traced.json` (the pill's
 * fixed trigger icons and the picker). Do not hand-edit — re-run the emitter.
 */

export interface FigjamIcon {
  viewBox: string
  paths: readonly { d: string; rule?: string }[]
}

export const FIGJAM_ICONS: Record<string, FigjamIcon> = {
"""

FOOTER = """}

export const FIGJAM_ICON_COUNT = Object.keys(FIGJAM_ICONS).length
"""


def render() -> str:
    icons = {**traced_cells(), **chrome_icons()}
    body = "\n".join(entry(key, view_box, paths) for key, (view_box, paths) in sorted(icons.items()))
    return HEADER + body + "\n" + FOOTER


if __name__ == "__main__":
    text = render()
    if "--check" in sys.argv:
        current = open(MODULE).read() if os.path.exists(MODULE) else ""
        if current != text:
            raise SystemExit(f"{MODULE} is stale — run emit_icons.py")
        print("figjamIcons.ts is current")
    else:
        open(MODULE, "w").write(text)
        print(f"wrote {MODULE}: {text.count('viewBox: ')} icons")
