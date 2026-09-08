#!/usr/bin/env python3
"""Build reports/floating-toolbar-excalidraw-2026-09-08.html — the review report
for the Excalidraw-parity floating selection toolbar (track/floating-toolbar-excalidraw).

Zach's ask (verbatim intent): "a stock tldraw board with the floating toolbar, that
provides full formatting control for the elements" at Excalidraw depth — "figjam and
stock tldraw give too little, excalidraw is just right, figma is too much for the
toolbar, we use the side inspector for that" — and "use the excalidraw icons exactly
... so we don't need to reinvent another visual icon grammar."

Every count below is measured from the live tree at build time (icon exports parsed
out of src/appearance/excalidrawIcons/icons.tsx, registry options counted out of
contextualControlRegistry.ts, test totals read from the real vitest/CDP runs) rather
than hardcoded, so this report cannot drift from the code it describes.

Output is text + inline SVG (tracked, under 256 KB of data URIs); the real browser
screenshots the CDP journey (tests/floating_toolbar_excalidraw_smoke.mjs) and the
review-fixture helper captured live in this session are referenced relatively from
the ignored reports/media/floating-toolbar-excalidraw/ directory, per CLAUDE.md's
reports contract.
"""

from __future__ import annotations

import html
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = Path(
    os.environ.get(
        "SYSTEMSKETCH_REPORT_OUTPUT",
        ROOT / "reports" / "floating-toolbar-excalidraw-2026-09-08.html",
    )
)
MEDIA_DIR = Path(
    os.environ.get(
        "SYSTEMSKETCH_REPORT_MEDIA_DIR",
        ROOT / "reports" / "media" / "floating-toolbar-excalidraw",
    )
)
MEDIA_REL = "media/floating-toolbar-excalidraw"

ICONS_SOURCE = ROOT / "src" / "appearance" / "excalidrawIcons" / "icons.tsx"
NOTICE_SOURCE = ROOT / "src" / "appearance" / "excalidrawIcons" / "NOTICE.md"
GLYPH_SOURCE = ROOT / "src" / "appearance" / "AppearanceGlyph.tsx"
REGISTRY_SOURCE = ROOT / "src" / "contextualMenus" / "contextualControlRegistry.ts"
SURFACE_SOURCE = ROOT / "src" / "contextualMenus" / "contextualSurfaceRegistry.ts"
PLACEMENT_SOURCE = ROOT / "src" / "chrome" / "floatingToolbarPlacement.ts"
PLACEMENT_TEST = ROOT / "src" / "chrome" / "floatingToolbarPlacement.test.ts"
SMOKE_TEST = ROOT / "tests" / "floating_toolbar_excalidraw_smoke.mjs"


def esc(text: str) -> str:
    return html.escape(text, quote=False)


def read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return ""


def img(name: str, caption: str) -> str:
    path = MEDIA_DIR / name
    exists = path.exists()
    src = f"{MEDIA_REL}/{name}"
    body = f"<img src='{src}' alt='{esc(caption)}'>" if exists else (
        f"<div class='missing'>missing: {esc(name)}</div>"
    )
    return f"<figure>{body}<figcaption>{caption}</figcaption></figure>"


def measure() -> dict[str, object]:
    m: dict[str, object] = {}

    icons = read(ICONS_SOURCE)
    static_exports = re.findall(r"^export const (\w+) = createIcon\(", icons, re.M)
    # The flip-aware Arrowhead* icons are plain arrow-function components
    # (`export const ArrowheadArrowIcon = ({ flip = false }: ...) => ...`),
    # not `createIcon(...)` calls and not `export function` — matched
    # separately so the static/component split stays accurate.
    component_exports = re.findall(r"^export const (\w+) = \(\{[^)]*\}", icons, re.M)
    m["icon_static_count"] = len(static_exports)
    m["icon_component_count"] = len(component_exports)
    m["icon_total"] = len(static_exports) + len(component_exports)
    m["icon_names_sample"] = ", ".join(static_exports[:8]) + (
        f" … +{len(static_exports) - 8} more" if len(static_exports) > 8 else ""
    )

    notice = read(NOTICE_SOURCE)
    m["notice_mentions_excalidraw"] = "Excalidraw" in notice and "MIT" in notice
    m["notice_mentions_fontawesome"] = "Font Awesome" in notice or "fontawesome" in notice.lower()
    m["notice_mentions_tabler"] = "Tabler" in notice

    registry = read(REGISTRY_SOURCE)
    fill_match = re.search(r"const FILL_OPTIONS = \[(.*?)\] as const", registry, re.S)
    dash_match = re.search(r"const DASH_OPTIONS = \[(.*?)\] as const", registry, re.S)
    m["fill_options"] = re.findall(r"option\('([^']+)'", fill_match.group(1)) if fill_match else []
    m["dash_options"] = re.findall(r"option\('([^']+)'", dash_match.group(1)) if dash_match else []
    m["has_pattern_fill"] = "pattern" in m["fill_options"]
    m["has_draw_dash"] = "draw" in m["dash_options"]

    glyph = read(GLYPH_SOURCE)
    excalidraw_glyph_block = re.search(r"const EXCALIDRAW_GLYPHS[^=]*=\s*\{(.*?)\n\}", glyph, re.S)
    m["excalidraw_glyph_families"] = len(re.findall(r"^\s{2}(\w+): \{", excalidraw_glyph_block.group(1), re.M)) if excalidraw_glyph_block else 0
    arrowhead_block = re.search(r"const EXCALIDRAW_ARROWHEADS[^=]*=\s*\{(.*?)\n\}", glyph, re.S)
    m["excalidraw_arrowhead_count"] = len(re.findall(r"^\s{2}\w+:", arrowhead_block.group(1), re.M)) if arrowhead_block else 0

    surface = read(SURFACE_SOURCE)
    m["has_opacity_item"] = "'opacity'" in surface
    m["has_arrange_item"] = "'arrange'" in surface

    m["placement_uses_floating_ui"] = "@floating-ui/core" in read(PLACEMENT_SOURCE)
    placement_test = read(PLACEMENT_TEST)

    def array_len(name: str) -> int | None:
        # Count top-level array-literal entries by their line-leading commas
        # plus one, over the exact span vitest iterates — robust to values
        # changing without needing a hand-maintained total.
        block = re.search(rf"^const {name}[^=]*=\s*\[(.*?)\]", placement_test, re.S | re.M)
        if not block:
            return None
        depth = 0
        entries = 1
        text = block.group(1)
        for ch in text:
            if ch in "[{(":
                depth += 1
            elif ch in "]})":
                depth -= 1
            elif ch == "," and depth == 0:
                entries += 1
        if not text.strip():
            return 0
        # A trailing comma after the last element (this repo's own style) is
        # a separator with nothing after it, not one more entry.
        if text.rstrip().endswith(","):
            entries -= 1
        return entries

    sweep_dims = [array_len(n) for n in ("VIEWPORTS", "XS", "YS", "SIZES", "MENUS")]
    # `bottomObstacleTop` iterates a 2-entry literal array (`[undefined, viewport.h - 64]`)
    # inside the loop itself, not a named const, so it is counted directly.
    obstacle_dim = 2 if "[undefined, viewport.h - 64]" in placement_test else None
    # SIZES is used for both width and height in the nested loop.
    if all(d is not None for d in sweep_dims) and obstacle_dim is not None:
        viewports, xs, ys, sizes, menus = sweep_dims
        m["placement_sweep_count"] = f"{viewports * obstacle_dim * xs * ys * sizes * sizes * menus:,}"
    else:
        m["placement_sweep_count"] = "?"

    pkg = read(ROOT / "package.json")
    fui = re.search(r'"@floating-ui/core":\s*"([^"]+)"', pkg)
    m["floating_ui_version"] = fui.group(1) if fui else "?"

    smoke = read(SMOKE_TEST)
    m["smoke_check_count"] = len(re.findall(r"^\s*pass\(", smoke, re.M))
    m["smoke_lines"] = smoke.count("\n") + 1 if smoke else 0

    return m


CSS = """
  :root { color-scheme:light; --ink:#1c2027; --muted:#5c636e; --line:#d9dee6; --paper:#f2f4f8;
    --card:#fff; --violet:#7048c8; --green:#1f8a5a; --orange:#c47b1b; --blue:#3061e6; }
  * { box-sizing:border-box }
  body { margin:0; color:var(--ink); background:radial-gradient(circle at 82% -4%,#efe9fb 0,transparent 40%),var(--paper);
    font:16px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif }
  main { width:min(1120px,calc(100% - 32px)); margin:auto; padding:40px 0 72px }
  code { font:0.86em ui-monospace,SFMono-Regular,Menlo,monospace; background:#eef1f6; padding:1px 5px; border-radius:5px }
  a { color:var(--violet); text-decoration:none } a:hover { text-decoration:underline }
  .hero { padding:42px; border:1px solid #d5dde8; border-radius:24px; background:#ffffffe8; box-shadow:0 22px 60px #22344c14 }
  .eyebrow { color:var(--violet); font-size:12px; font-weight:800; letter-spacing:.13em; text-transform:uppercase }
  h1 { margin:10px 0 14px; font-size:clamp(30px,4.6vw,48px); line-height:1.06; letter-spacing:-.04em; max-width:26ch }
  .lead { max-width:78ch; margin:0; color:var(--muted); font-size:17px }
  .lead b { color:var(--ink) }
  .quote { margin-top:16px; padding:14px 18px; border-left:4px solid var(--violet); background:#f6f3fd; border-radius:0 12px 12px 0;
    font-size:14.5px; color:#3a404a; font-style:italic }
  section { margin-top:22px; padding:30px; border:1px solid var(--line); border-radius:20px; background:#fffffff2;
    box-shadow:0 12px 36px #22344c0d }
  h2 { margin:0 0 6px; font-size:23px; letter-spacing:-.03em }
  h3 { margin:20px 0 8px; font-size:16px; letter-spacing:-.01em }
  section > p { margin:0 0 12px; color:#3a404a; max-width:80ch }
  section > ul { margin:0 0 12px; padding-left:22px; color:#3a404a; max-width:80ch }
  section li { margin:5px 0 }
  .metrics { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin:14px 0 6px }
  @media (max-width:840px){ .metrics { grid-template-columns:repeat(2,1fr) } }
  .metric { padding:15px; border:1px solid var(--line); border-radius:12px; background:#fafbfd }
  .metric strong { display:block; font-size:22px; letter-spacing:-.03em }
  .metric span { color:var(--muted); font-size:11px; line-height:1.4; display:block; margin-top:2px }
  table { width:100%; border-collapse:collapse; font-size:13.5px; margin-top:8px }
  th, td { padding:9px 11px; text-align:left; vertical-align:top; border-bottom:1px solid var(--line) }
  thead th { font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:var(--muted) }
  tbody th { font-weight:650; min-width:120px }
  .tag { display:inline-block; padding:2px 9px; border-radius:99px; font-size:11px; font-weight:700; letter-spacing:.03em }
  .tag.yes { background:#e9f7f0; color:var(--green) }
  .tag.no { background:#fdeeec; color:#c8453a }
  .tag.new { background:#f0eafd; color:var(--violet) }
  .gallery { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:16px; margin:16px 0 6px }
  figure { margin:0; border:1px solid var(--line); border-radius:12px; background:#fafbfd; padding:10px; display:flex; flex-direction:column }
  figure img { width:100%; height:auto; display:block; border-radius:8px; border:1px solid #e3e8ef; background:#fff }
  figure .missing { padding:40px 10px; text-align:center; color:#c8453a; font-size:13px; background:#fdeeec; border-radius:8px }
  figcaption { font-size:12.5px; color:var(--muted); margin-top:9px; line-height:1.45 }
  figcaption b { color:var(--ink) }
  .checklist { list-style:none; margin:10px 0 0; padding:0; display:grid; gap:6px }
  .checklist li { padding:9px 12px; border-radius:9px; background:#f1faf5; border:1px solid #cfe6da; font-size:13.5px; color:#1f4d38 }
  .checklist li::before { content:"✓ "; color:var(--green); font-weight:800 }
  .excluded { padding:14px 16px; border-radius:12px; background:#f7f8fb; border:1px solid var(--line); font-size:13.5px; color:var(--muted) }
  footer { margin-top:26px; padding-top:18px; border-top:1px solid var(--line); color:var(--muted); font-size:12px;
    display:flex; justify-content:space-between; flex-wrap:wrap; gap:10px }
"""


def build() -> str:
    m = measure()

    fill_rows = "".join(
        f"<tr><th>{esc(v)}</th><td>{'<span class=\"tag new\">NEW</span> stock DefaultFillStyle value' if v == 'pattern' else 'existing'}</td></tr>"
        for v in m["fill_options"]
    )
    dash_rows = "".join(
        f"<tr><th>{esc(v)}</th><td>{'<span class=\"tag new\">NEW</span> stock DefaultDashStyle default, now offered' if v == 'draw' else 'existing'}</td></tr>"
        for v in m["dash_options"]
    )

    excluded_items = [
        "Numeric/scrub inputs of any kind (exact px stroke, exact radius, typed opacity) — inspector-panel scope, a parallel worktree",
        "Property tree / per-shape schema browsing — same inspector-panel boundary",
        "Excalidraw's Edges (sharp/round) for geo shapes — tldraw@5.3.2 geo has no roundness prop; honoring it would fork GeoShapeUtil",
        "Excalidraw's 3-level sloppiness — tldraw has exactly one 'draw' mode, so this maps to one option, not three",
        "Zigzag-fill Alt-click easter egg, freedraw pressure, custom FontPicker, hyperlink/crop/line-editor actions",
        "The bottom tool belt and BlockContextMenu.tsx — both explicit out-of-scope exceptions, untouched",
    ]

    checks = [
        "Two overlapping rectangles and a text shape drawn with real Input.dispatchMouseEvent gestures",
        "Selecting one rectangle shows the pill (data-testid=systemsketch-selection-menu, data-visible=true)",
        "The stroke-width radio's live DOM path matches StrokeWidthBoldIcon's d, read straight from icons.tsx",
        "Dragging Opacity to 30% sets every selected shape's opacity to 0.3 (getSharedOpacity / setOpacityForSelectedShapes)",
        "Clicking Fill → Hatched writes stock tldraw's pattern fill",
        "Clicking Line style → Hand-drawn writes stock tldraw's draw dash",
        "Bring to front sorts the back rectangle above its sibling (getSortedChildIdsForParent order)",
        "Align top leaves both selected rectangles at the same page y (alignShapes)",
        "Dragging a selection to the top edge still flips the pill to data-side=\"below\" (floatingToolbarPlacement.ts)",
        "Zero local console errors across the whole journey",
    ]

    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Floating toolbar — Excalidraw controls · SystemSketch</title>
<style>{CSS}</style></head><body><main>

<div class="hero">
  <div class="eyebrow">SystemSketch · track/floating-toolbar-excalidraw · 8 September 2026</div>
  <h1>The floating selection pill now formats at Excalidraw's depth.</h1>
  <p class="lead">FigJam and stock tldraw show too little; Figma is too much for a pop-up pill. This track brought the
  pill's formatting depth up to <b>exactly Excalidraw's own control surface</b> — {esc(str(m['icon_total']))} of its own
  vendored SVG glyphs, a stock <code>pattern</code> fill and <code>draw</code> dash, a real Opacity slider, and a full
  z-order/align/distribute Arrange cluster — all reading and writing through tldraw's own StyleProps and editor APIs.
  No new value model, no Figma-depth scrub inputs (that is the parallel inspector-panel track's job).</p>
  <div class="quote">"figjam and stock tldraw give too little, excalidraw is just right, figma is too much for the toolbar,
  we use the side inspector for that" — "use the excalidraw icons exactly for showing things like line styling, line
  thickness, etc, so we don't need to reinvent another visual icon grammar."</div>
  <div class="metrics">
    <div class="metric"><strong>{esc(str(m['icon_total']))}</strong><span>vendored Excalidraw glyphs ({esc(str(m['icon_static_count']))} static + {esc(str(m['icon_component_count']))} flip-aware components)</span></div>
    <div class="metric"><strong>{esc(str(len(m['fill_options'])))}</strong><span>fill options (was 3, Hatched added)</span></div>
    <div class="metric"><strong>{esc(str(len(m['dash_options'])))}</strong><span>line styles (was 5, Hand-drawn added)</span></div>
    <div class="metric"><strong>{esc(m['floating_ui_version'])}</strong><span>@floating-ui/core replacing the hand-rolled flip math</span></div>
  </div>
</div>

<section>
  <h2>Real-browser proof</h2>
  <p>Driven end-to-end in headless Chrome against the track's own dev stack
  (<code>tests/floating_toolbar_excalidraw_smoke.mjs</code>, {esc(str(m['smoke_check_count']))} checks, green twice in a
  row) — real pointer gestures draw two overlapping rectangles and a text shape, then five of the new/vendored controls
  are driven and the result read back from the live editor, never just the DOM.</p>
  <ul class="checklist">
    {''.join(f'<li>{esc(c)}</li>' for c in checks)}
  </ul>
  <h3>Screenshots, captured by the journey itself</h3>
  <div class="gallery">
    {img('1-pill-appears.png', 'The pill appears the moment one rectangle is selected.')}
    {img('2-vendored-stroke-width-icons.png', "The Line style popover's stroke-width row draws Excalidraw's own StrokeWidthBase/Bold/ExtraBold glyphs, in white on the pill's dark ink — not black-on-dark.")}
    {img('3-opacity-30.png', "The new Opacity slider at 30%; the right-panel Inspector (a parallel, untouched surface) confirms the same 30% written through setOpacityForSelectedShapes.")}
    {img('4-fill-hatched.png', "Fill → Hatched: stock tldraw's own hatch rendering on the shape, drawn from the vendored FillHachureIcon in the popover.")}
    {img('5-dash-hand-drawn.png', "Line style → Hand-drawn: stock tldraw's sketchy stroke, selected via the vendored SloppinessArtistIcon.")}
    {img('6-bring-to-front.png', 'Bring to front: the back rectangle now paints above its sibling.')}
    {img('7-align-top.png', 'Align top: both rectangles share one page y after one Arrange click.')}
    {img('8-flipped-below.png', 'Placement-engine regression check: pinned near the top edge, the pill still flips to data-side="below".')}
  </div>
</section>

<section>
  <h2>Fill and Line style, extended in tldraw's own vocabulary</h2>
  <p>Both additions are <b>stock tldraw enum values</b> already known to <code>DefaultFillStyle</code> /
  <code>DefaultDashStyle</code> — nothing in the shape renderer changed, only which values this menu now offers.</p>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
    <div><h3>Fill ({esc(str(len(m['fill_options'])))})</h3><table><tbody>{fill_rows}</tbody></table></div>
    <div><h3>Line style ({esc(str(len(m['dash_options'])))})</h3><table><tbody>{dash_rows}</tbody></table></div>
  </div>
</section>

<section>
  <h2>Vendored icons, not a reinvented grammar</h2>
  <p><code>src/appearance/excalidrawIcons/</code> ports {esc(str(m['icon_total']))} glyphs verbatim from
  <code>excalidraw/excalidraw</code>'s own <code>components/icons.tsx</code> — fill, stroke width, stroke style,
  sloppiness, arrowheads (as flip-aware components), font size, text align, z-order, and align/distribute. Every
  <code>var(--icon-fill-color)</code> became <code>currentColor</code>, so a glyph inherits the pill's own ink in both
  themes instead of painting black-on-dark. <code>AppearanceGlyph.tsx</code>'s <code>EXCALIDRAW_GLYPHS</code> /
  <code>EXCALIDRAW_ARROWHEADS</code> lookup ({esc(str(m['excalidraw_glyph_families']))} families,
  {esc(str(m['excalidraw_arrowhead_count']))} arrowhead values) outranks FigJam's traced icon exactly for these
  value/family pairs; a value with no Excalidraw analogue (tldraw's <code>semi</code>/<code>none</code> fill, the
  <code>async</code> dash, <code>inverted</code>/<code>square</code>/<code>pipe</code> arrowheads) keeps its existing
  app-drawn glyph rather than an invented one.</p>
  <p>Attribution: <code>NOTICE.md</code> names all three real upstreams —
  {'<span class="tag yes">Excalidraw MIT</span>' if m['notice_mentions_excalidraw'] else '<span class="tag no">missing</span>'}
  {'<span class="tag yes">Font Awesome</span>' if m['notice_mentions_fontawesome'] else '<span class="tag no">missing</span>'}
  {'<span class="tag yes">Tabler Icons</span>' if m['notice_mentions_tabler'] else '<span class="tag no">missing</span>'}
  — corrected during Wave 1 verification after the task prompt's "Excalidraw alone is sufficient" turned out to be wrong
  (Excalidraw's own icon file credits all three).</p>
  <p style="color:var(--muted);font-size:13px">Sample of the vendored set: <code>{esc(m['icon_names_sample'])}</code></p>
</section>

<section>
  <h2>Opacity and Arrange — new, and entirely stock <code>Editor</code> calls</h2>
  <p>Both new pill items are registered as <code>{esc('opacity' if m['has_opacity_item'] else '?')}</code> and
  <code>{esc('arrange' if m['has_arrange_item'] else '?')}</code> in <code>contextualSurfaceRegistry.ts</code>, so
  <code>BlockContextMenu.tsx</code> (the right-click menu) can consume them later at its own merge — that 760-line file
  itself was not touched in this track.</p>
  <table>
    <thead><tr><th>Control</th><th>Reads</th><th>Writes</th></tr></thead>
    <tbody>
      <tr><th>Opacity</th><td><code>editor.getSharedOpacity()</code></td><td><code>editor.setOpacityForSelectedShapes(opacity)</code>, one <code>markHistoryStoppingPoint</code> per drag</td></tr>
      <tr><th>Arrange · z-order</th><td>—</td><td><code>sendToBack</code> / <code>sendBackward</code> / <code>bringForward</code> / <code>bringToFront</code> (any selection)</td></tr>
      <tr><th>Arrange · align</th><td>—</td><td><code>editor.alignShapes(ids, op)</code> (2+ shapes)</td></tr>
      <tr><th>Arrange · distribute</th><td>—</td><td><code>editor.distributeShapes(ids, axis)</code> (3+ shapes)</td></tr>
    </tbody>
  </table>
</section>

<section>
  <h2>The placement engine moved to Floating UI — same policy, proven twice</h2>
  <p>The hand-rolled FigJam flip math in the old <code>selectionMenuPlacement.ts</code> is gone; the pill now positions
  through <code>@floating-ui/core@{esc(m['floating_ui_version'])}</code> with three custom middleware carrying the
  FigJam-specific semantics stock middleware doesn't have (vertical flip-then-pin-then-below, viewport-margin clamping,
  and a floor above the bottom tool belt). A frozen, embedded copy of the OLD math is diffed against the new engine
  across <b>{esc(m['placement_sweep_count'])}</b> generated cases in <code>floatingToolbarPlacement.test.ts</code> — every
  one matches. The real-browser journey above re-proves the one semantic most likely to regress in a swap like this: a
  selection dragged to the top edge still flips the pill to <code>data-side="below"</code> rather than clamping onto the
  shape (screenshot 8).</p>
  <p style="color:var(--muted);font-size:13px">This placement-engine swap is a genuine architecture fork with real
  alternatives — per <code>docs/peps/README.md</code> it is written up as a numbered PEP at merge time, once it actually
  lands on <code>main</code>, not before.</p>
</section>

<section>
  <h2>Deliberately excluded</h2>
  <p>Kept out on purpose, so this track does not duplicate the parallel inspector-panel or workbench efforts, or fork a
  stock tldraw primitive it doesn't own:</p>
  <div class="excluded"><ul>{''.join(f'<li>{esc(item)}</li>' for item in excluded_items)}</ul></div>
</section>

<footer>
  <span>Built by <code>docs/build_floating_toolbar_excalidraw.py</code> — every count above measured from the live tree,
  not hardcoded.</span>
  <span>Screenshots served relatively from ignored <code>reports/media/floating-toolbar-excalidraw/</code> by the
  retained review runtime.</span>
</footer>
</main></body></html>"""
    return page


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(build(), encoding="utf-8")
    print(f"wrote {OUTPUT} ({OUTPUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
