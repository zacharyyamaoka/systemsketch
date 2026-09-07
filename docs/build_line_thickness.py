#!/usr/bin/env python3
"""Build the self-contained line-thickness + contextual-menu-lab report.

Every number is measured here, from the live tree and from the JSON the real
browser journey wrote, so the page cannot drift from the code it describes.
"""

from __future__ import annotations

import base64
import html
import json
import re
import subprocess
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
ASSETS = DOCS / "assets"

STROKE_META = ROOT / "src/appearance/strokeMeta.ts"
REGISTRY = ROOT / "src/contextualMenus/contextualControlRegistry.ts"
MODEL = ROOT / "src/appearance/appearanceModel.ts"
RENDERER = ROOT / "src/contextualMenus/ContextualControls.tsx"
CONTROLS = ROOT / "src/appearance/AppearanceControls.tsx"
LAB_MODEL = ROOT / "src/prototypes/menuLab/menuLabModel.ts"
JOURNEY = ROOT / "tests/line_thickness_smoke.mjs"
RESULTS = ASSETS / "line-thickness-results-2026-09-06.json"
FIXTURE = ROOT / "sketches/review/line-thickness.systemsketch"
OUTPUT = DOCS / "line-thickness-2026-09-06.html"


PRE_AUDIT_REV = "47d44537"
PRESET_CROP = (8, 108, 492, 348)


def preset_crops() -> tuple[str, str]:
    """The preset cards before and after the contrast fix, cropped at build time.

    The "before" frame is read straight out of git rather than kept as a second
    committed PNG: the bug is a property of a commit, so the commit is the
    honest source for it. Crops are gitignored build output.
    """
    before_raw = ASSETS / "crop-presets-before-raw.png"
    before_raw.write_bytes(subprocess.run(
        ["git", "show", f"{PRE_AUDIT_REV}:docs/assets/menu-lab-1-shape-2026-09-06.png"],
        cwd=ROOT, check=True, capture_output=True,
    ).stdout)
    out = []
    for name, source in (("before", before_raw),
                         ("after", ASSETS / "menu-lab-1-shape-2026-09-06.png")):
        crop = Image.open(source).convert("RGB").crop(PRESET_CROP)
        crop = crop.resize((crop.width * 2, crop.height * 2), Image.LANCZOS)
        path = ASSETS / f"crop-presets-{name}.png"
        crop.save(path)
        out.append(data_uri(path, "image/png"))
    before_raw.unlink()
    return out[0], out[1]


def lab_presets() -> list[str]:
    """The preset ids the lab actually ships, read from its own model."""
    source = (ROOT / "src/prototypes/menuLab/menuLabModel.ts").read_text(encoding="utf-8")
    block = source.split("export const LAB_PRESETS", 1)[1].split("\n]", 1)[0]
    return re.findall(r"^\s{4}id: '([^']+)'", block, re.M)


def data_uri(path: Path, mime: str) -> str:
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


def rung_table(source: str) -> dict[str, float]:
    block = source[source.index("export const STROKE_WIDTH_PX"):]
    block = block[: block.index("}")]
    return {name: float(value) for name, value in re.findall(r"(\w+):\s*([\d.]+)", block)}


def registry_kinds(source: str) -> list[str]:
    block = source[source.index("export const CONTEXTUAL_CONTROL_REGISTRY"):]
    block = block[: block.index("\n}\n")]
    return re.findall(r"^  (\w+):", block, flags=re.M)


def paint_seams() -> dict[str, str]:
    """Which shape utils read the one thickness display value, verified live."""
    seams = {
        "geo": (ROOT / "src/stockPrimitiveVisuals.ts", "systemSketchGeoDisplayValues"),
        "draw": (ROOT / "src/stockPrimitiveVisuals.ts", "SystemSketchDrawShapeUtil"),
        "line": (ROOT / "src/stockPrimitiveVisuals.ts", "SystemSketchLineShapeUtil"),
        "arrow": (ROOT / "src/systemSketchArrow.tsx", "ConfiguredArrowShapeUtil"),
    }
    out = {}
    for shape, (path, symbol) in seams.items():
        text = path.read_text(encoding="utf-8")
        assert symbol in text, f"{shape}: {symbol} is gone"
        assert "strokeWidthDisplay" in text, f"{shape} lost its thickness seam"
        out[shape] = f"{path.relative_to(ROOT).as_posix()} · {symbol}"
    return out


def main() -> None:
    stroke_meta = STROKE_META.read_text(encoding="utf-8")
    registry = REGISTRY.read_text(encoding="utf-8")
    model = MODEL.read_text(encoding="utf-8")
    renderer = RENDERER.read_text(encoding="utf-8")
    controls = CONTROLS.read_text(encoding="utf-8")
    lab_model = LAB_MODEL.read_text(encoding="utf-8")
    journey = JOURNEY.read_text(encoding="utf-8")
    results = json.loads(RESULTS.read_text(encoding="utf-8"))

    rungs = rung_table(stroke_meta)
    assert set(rungs) == {"thin", "medium", "thick"}, rungs
    kinds = registry_kinds(registry)
    assert "strokeWidth" in kinds, kinds
    assert "weight" not in kinds, "the connector-only Weight kind must be gone"
    assert "pinStrokeWidth" in stroke_meta and "pinStrokeWidth(editor)" in controls
    assert "stackedModes" in renderer, "the renderer must walk the stacked chain"
    assert "lineStyleWithThickness" in model
    assert "VS Code's `menus` contribution point" in lab_model
    assert results["consoleErrors"] == []
    assert results["fontSize"]["beforeStrokeWidth"] == results["fontSize"]["afterStrokeWidth"]
    assert results["rungs"]["thin"] == rungs["thin"]
    assert results["rungs"]["thick"] == rungs["thick"]
    assert results["connector"]["rungs"] == ["thin", "medium", "thick"]
    assert results["connector"]["labelled"] is False
    assert "has('menu-lab')" in (ROOT / "src/main.tsx").read_text(encoding="utf-8")
    settings = (ROOT / "src/settings/InterfaceSettings.tsx").read_text(encoding="utf-8")
    assert "label: 'Menu lab'," in settings and "MenuLabPanel" in settings
    assert results["settings"]["insideDialog"] is True
    assert results["settings"]["canvases"] == 1
    seams = paint_seams()

    hero_mp4 = data_uri(ASSETS / "line-thickness-hero-2026-09-06.mp4", "video/mp4")
    hero_gif = data_uri(ASSETS / "line-thickness-hero-2026-09-06.gif", "image/gif")
    shape_stack = data_uri(ASSETS / "line-thickness-1-shape-stack-2026-09-06.png", "image/png")
    connector_row = data_uri(ASSETS / "line-thickness-4-connector-row-2026-09-06.png", "image/png")
    font_holds = data_uri(ASSETS / "line-thickness-3-font-size-holds-2026-09-06.png", "image/png")
    lab_shape = data_uri(ASSETS / "menu-lab-1-shape-2026-09-06.png", "image/png")
    lab_connector = data_uri(ASSETS / "menu-lab-2-connector-2026-09-06.png", "image/png")
    lab_settings = data_uri(ASSETS / "menu-lab-4-settings-2026-09-06.png", "image/png")
    fixture_png = data_uri(ROOT / "sketches/review/line-thickness.png", "image/png")
    lab_code = data_uri(ASSETS / "menu-lab-5-code-2026-09-06.png", "image/png")
    presets_before, presets_after = preset_crops()
    preset_ids = lab_presets()
    preset_count = len(preset_ids)
    preset_list = " \u00b7 ".join(preset_ids)
    code_order = " \u00b7 ".join(results["lab"]["codeTriggers"])
    pre_audit_rev = PRE_AUDIT_REV

    font = results["fontSize"]
    checks = "".join(f"<li>{html.escape(check)}</li>" for check in results["checks"])
    seam_rows = "".join(
        f"<tr><td><code>{html.escape(shape)}</code></td><td><code>{html.escape(path)}</code></td></tr>"
        for shape, path in seams.items()
    )
    rung_rows = "".join(
        f"<tr><td><b>{name.title()}</b></td><td>{value:g} px</td><td>{note}</td></tr>"
        for name, value, note in [
            ("thin", rungs["thin"], "tldraw's own <code>s</code> width"),
            ("medium", rungs["medium"], "what every shape is already drawn at — nothing on an existing board moves"),
            ("thick", rungs["thick"], "double medium, so the top rung reads as the top"),
        ]
    )

    document = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Line thickness · SystemSketch</title>
<style>
:root{{color-scheme:dark;--ink:#f4f7fb;--muted:#b2bfd2;--bg:#07111f;--line:#294768;--blue:#7ab4ff;--green:#76daa0;--orange:#ffb36b;--red:#ff9c9c}}
*{{box-sizing:border-box}}
body{{margin:0;background:radial-gradient(circle at 12% -8%,#284d80 0,transparent 38rem),var(--bg);color:var(--ink);font:16px/1.55 Inter,ui-sans-serif,system-ui,sans-serif}}
main{{width:min(1180px,calc(100% - 36px));margin:auto;padding:54px 0 78px}}
.eyebrow{{color:var(--blue);font-size:.76rem;font-weight:850;letter-spacing:.14em;text-transform:uppercase}}
h1{{max-width:950px;margin:.14em 0;font-size:clamp(2.6rem,6.4vw,5.4rem);line-height:.94;letter-spacing:-.06em}}
.lead{{max-width:860px;color:#d5deec;font-size:1.18rem}}
.hero,.panel,.fact{{background:linear-gradient(145deg,#152943,#0c1829);border:1px solid var(--line);border-radius:20px}}
.hero{{overflow:hidden;margin:30px 0 18px}}
video,.fallback{{display:block;width:100%;background:#f6f8fb}}
video{{aspect-ratio:16/10;object-fit:cover}}
.caption{{padding:13px 17px;color:var(--muted);font-size:.88rem}}
.facts,.grid,.flow{{display:grid;gap:16px}}
.facts{{grid-template-columns:repeat(4,1fr);margin:18px 0 34px}}
.fact{{padding:18px}}
.fact b{{display:block;color:var(--green);font-size:1.7rem;letter-spacing:-.04em}}
.fact span{{color:var(--muted);font-size:.92rem}}
.flow{{grid-template-columns:1fr auto 1fr;align-items:center;margin:24px 0}}
.node{{padding:17px;border:1px solid var(--line);border-radius:15px;background:#0b192b}}
.node b{{display:block;color:var(--blue);margin-bottom:4px}}
.node.bad b{{color:var(--red)}}
.arrow{{color:var(--orange);font-size:2rem;text-align:center}}
.grid{{grid-template-columns:1fr 1fr}}
.panel{{padding:21px;overflow:hidden;margin-top:16px}}
h2{{font-size:1.36rem;letter-spacing:-.03em;margin:0 0 8px}}
h3{{font-size:1rem;margin:18px 0 6px;color:var(--blue)}}
p{{color:var(--muted)}}
figure{{margin:15px 0 0;border:1px solid var(--line);border-radius:13px;overflow:hidden;background:#f7f9fb}}
figure img{{display:block;width:100%}}
figcaption{{padding:11px 13px;background:#0e1b2e;color:var(--muted);font-size:.86rem}}
ul{{padding-left:20px;color:var(--muted)}}
li+li{{margin-top:7px}}
code{{padding:2px 5px;border-radius:5px;background:#1a2f4c;color:#dbe9ff;font-size:.92em}}
pre{{overflow-x:auto;padding:14px;border-radius:11px;background:#0a1728;border:1px solid var(--line);color:#dbe9ff;font-size:.86rem;line-height:1.5}}
table{{border-collapse:collapse;width:100%;font-size:.94rem}}
th,td{{padding:11px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}}
th{{color:var(--blue)}}
.result{{color:var(--green);font-weight:750}}
.ladder{{display:flex;gap:26px;align-items:center;margin:14px 0 4px;flex-wrap:wrap}}
.ladder div{{text-align:center;color:var(--muted);font-size:.82rem}}
.ladder i{{display:block;width:120px;background:var(--ink);border-radius:9px;margin-bottom:7px}}
footer{{margin-top:30px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font-size:.86rem}}
@media(max-width:860px){{main{{width:min(100% - 24px,1180px);padding-top:32px}}.facts,.grid,.flow{{grid-template-columns:1fr}}.arrow{{transform:rotate(90deg);justify-self:center}}}}
</style></head><body><main>

<div class="eyebrow">SystemSketch · Line thickness + contextual menu lab · 2026-09-06</div>
<h1>Thickness is its own control now.</h1>
<p class="lead">Stock tldraw derives a geo shape's stroke width <em>and</em> its label font size from one <code>size</code> rung, so the Font size list was quietly the line-thickness control too. There is now a real thickness control — one registered vocabulary, stacked on a shape and beside a connector — and changing the type no longer moves the outline.</p>

<section class="hero"><video controls autoplay muted loop playsinline poster="{shape_stack}"><source src="{hero_mp4}" type="video/mp4"><img class="fallback" src="{hero_gif}" alt="Real browser recording: walking the three thickness rungs on a titled rectangle, then choosing Extra large and watching the outline hold, then the same rungs beside a connector's line styles"></video><div class="caption">Actual browser recording on the review fixture · walk Thin → Thick → Medium → Thick on the titled rectangle, pick <b>Extra large</b> and watch the outline hold at {font['afterStrokeWidth']:g}px while the label goes {font['beforeLabelPx']:g}px → {font['afterLabelPx']:g}px, then the same three rungs beside the connector's line styles. A GIF fallback is embedded for browsers without video.</div></section>

<section class="facts">
<div class="fact"><b>{len(results['checks'])}/{len(results['checks'])}</b><span>real-browser checks passed</span></div>
<div class="fact"><b>{font['afterStrokeWidth']:g}px → {font['afterStrokeWidth']:g}px</b><span>outline across a Small→Extra&nbsp;large type change (stock would paint {font['stockWouldHavePainted']:g})</span></div>
<div class="fact"><b>1 vocabulary</b><span>shared by the shape's stacked popover and the connector's row</span></div>
<div class="fact"><b>{len(results['consoleErrors'])}</b><span>browser console errors</span></div>
</section>

<section class="flow">
<div class="node bad"><b>What Zach reported</b>“I need the option to control the line thickness of the rectangle. Right now its seems linked to the thickness of the text which is bad!!!” One <code>size</code> rung drove the label font <em>and</em> the outline: choosing Extra&nbsp;large for a title jumped the rectangle from 3.5px to 10px, and there was no way to say otherwise.</div>
<div class="arrow">→</div>
<div class="node"><b>What ships</b>An edge thickness of its own, in the Line style popover above the dash chips and the palette. Picking Extra&nbsp;large now pins the painted thickness first, so the type change is visibly a type change.</div>
</section>

<section class="panel">
<h2>The ladder, and why these three numbers</h2>
<div class="ladder">
<div><i style="height:{rungs['thin']:g}px"></i>Thin · {rungs['thin']:g}px</div>
<div><i style="height:{rungs['medium']:g}px"></i>Medium · {rungs['medium']:g}px</div>
<div><i style="height:{rungs['thick']:g}px"></i>Thick · {rungs['thick']:g}px</div>
</div>
<table><thead><tr><th>Rung</th><th>Scene units</th><th>Anchored to</th></tr></thead><tbody>{rung_rows}</tbody></table>
<p style="margin-top:12px">Medium is deliberately what a rectangle is <em>already</em> drawn at, so the control appearing changes nothing on an existing board and an untouched shape reads truthfully as Medium rather than blank. A shape still sitting on tldraw's <code>l</code> or <code>xl</code> rung reports the number it paints and check-marks nothing — the honest reading, not a rung it is not on.</p>
</section>

<section class="grid">
<article class="panel" style="margin-top:0"><h2>On a shape: stacked</h2><p>Three sections in one popover — thickness, line style, palette — which is the layout Zach drew.</p><figure><img src="{shape_stack}" alt="The shape Stroke popover with thickness rungs above the line-style chips above the colour palette"><figcaption>The Line style trigger's popover. Medium is check-marked because that is what the rectangle is painted at.</figcaption></figure></article>
<article class="panel" style="margin-top:0"><h2>On a connector: beside</h2><p>The same registered control, labels hidden, no palette — “all the icons by construction must be the same”.</p><figure><img src="{connector_row}" alt="The connector Line style popover with the same three thickness rungs beside the line styles"><figcaption>One 44px row: thickness, a hairline, the line styles. The inspector reports <code>Line thickness 2px</code>.</figcaption></figure></article>
</section>

<section class="panel">
<h2>The reported bug, photographed fixed</h2>
<figure><img src="{font_holds}" alt="The rectangle at Extra large with its outline unchanged"><figcaption>Font size <b>Extra large</b> applied. The label went {font['beforeLabelPx']:g}px → {font['afterLabelPx']:g}px; the outline stayed at {font['afterStrokeWidth']:g}px. Stock tldraw would have painted {font['stockWouldHavePainted']:g}px.</figcaption></figure>
<h3>How the coupling is actually broken</h3>
<p>Adding a control is not enough on its own — an untouched shape still follows its rung. So the Font size write pins the <em>current painted</em> thickness before it moves <code>size</code> (and before a custom px moves <code>scale</code>). Only shapes with no thickness of their own are touched, so it converges instead of rewriting metadata on every keystroke.</p>
<pre>{html.escape(stroke_meta[stroke_meta.index("export function pinStrokeWidth"):stroke_meta.index("export function pinStrokeWidth") + 520])}…</pre>
</section>

<section class="grid">
<article class="panel"><h2>Where it is painted</h2><p>Thickness lives in shape <code>meta</code>, not a StyleProp — a StyleProp only reaches shapes whose util declares it, and <code>geo</code> is tldraw's own shape, so adding one would change a stock record's on-disk schema. The paint rides tldraw's published <code>getCustomDisplayValues</code> seam, which four utils name identically. A Block cable is deliberately excluded: its width is semantic, so the row reads nothing there and is dropped rather than lying.</p><table><thead><tr><th>Shape</th><th>Seam</th></tr></thead><tbody>{seam_rows}</tbody></table></article>
<article class="panel"><h2>What the browser actually checked</h2><ul>{checks}</ul></article>
</section>

<section class="panel">
<h2>The composition lab · Settings &rsaquo; Menu lab, or <code>?menu-lab</code></h2>
<p>Zach: “make a generic contextual menu with all the different configuration levers that I can just press myself… add this, hide the labels, stack the thing.” The lab is a lever board wired to the <em>real</em> registry, binder and renderer — not a second menu implementation. If a composition works there it works in the product, and if it is buggy there the product bug reproduces without a canvas selection.</p>
<figure><img src="{lab_settings}" alt="The menu lab as a Settings section, with a contextual popover open over the dialog"><figcaption><b>Settings → Menu lab.</b> The same board, in the app. It mounts no editor of its own — the dialog is already inside one, so the panel gets the live theme and tldraw&rsquo;s own popover. Measured in the journey: exactly {results['settings']['canvases']} canvas on the page. Its popovers portal into the host dialog because tldraw stacks popovers at 400 and dialogs at 500, so otherwise the panel opens <em>behind</em> the dialog that hosts it.</figcaption></figure>
<div class="grid">
<figure><img src="{lab_shape}" alt="The contextual menu lab composing the shape surface"><figcaption><b>Shape preset.</b> Thickness and line style are stacked <code>above</code> the palette, so they are folded into its popover and are not triggers of their own.</figcaption></figure>
<figure><img src="{lab_connector}" alt="The contextual menu lab composing the connector surface"><figcaption><b>Connector preset.</b> The same registry, recomposed: the thickness control set to <code>beside</code>, layouts set to <code>row</code> so labels disappear.</figcaption></figure>
</div>
<h3>Levers</h3>
<ul>
<li><b>include</b> — whether a registered control is a candidate at all.</li>
<li><b>layout</b> — <code>swatches · row · chips · list · library</code>. <code>row</code> is the “hide the labels” lever.</li>
<li><b>trigger</b> — <code>value · icon · text · toggle · action</code>: what the pill shows.</li>
<li><b>stack</b> — <code>none · above · beside</code>: fold this control into the next included one. <code>above</code> is the shape's stacked popover, <code>beside</code> is the connector's one-line row.</li>
<li><b>value</b> — shared or mixed, so the disagreeing-selection faces are pressable without setting up a selection.</li>
<li><b>new group</b> and <b>↑ ↓</b> — the hairline separators and the order, i.e. the recipe itself, printed live as a source literal.</li>
</ul>
<p>A control stacked onto nothing is <em>named</em> in the readout rather than silently vanishing — quietly disappearing behaviour is exactly what the lab exists to stop.</p>
<h3>Prior art it follows (not reinvented)</h3>
<ul>
<li><b>VS Code's <code>menus</code> contribution point.</b> A command is declared once; a surface asks for it with <code>group@order</code> and a <code>when</code> clause. That is the registry / recipe / <code>composeContextualControls</code> split already in this repo.</li>
<li><b>Blender's <code>layout.prop()</code>.</b> Panels are rows and columns that <em>bind</em> to properties; the widget comes from the property's type, never restated at the call site — the registry's <code>glyph</code> and <code>layout</code> fields.</li>
<li><b>Tweakpane / leva / dat.GUI.</b> A control panel generated from a schema of levers: the shape of the lab itself.</li>
<li><b>Zach's own <code>C - Semantic Type Registry</code></b> — “resolve semantics once, then project them many times”, and “give plugins a constrained contribution point rather than an unbounded new visual language”.</li>
</ul>
</section>

<section class="panel">
<h2>The audit the work order asked for</h2>
<p>The handoff left two surfaces unexamined — <code>BLOCK_TITLE_CONTEXTUAL_RECIPE</code> and the Code selection pill — with the guess that neither should carry a thickness row, to be “verified in the lab”. Verifying it needed a Code preset, because the pill had never been composable in the lab at all. The lab now ships {preset_count} presets: <code>{preset_list}</code>.</p>
<figure><img src="{lab_code}" alt="The menu lab composing the Code selection pill: Language and Font size, no thickness row"><figcaption><b>Code block preset.</b> The composed pill is <code>{code_order}</code> — the <em>shared</em> shape recipe narrowing itself, not a Code-only menu. A Code block declares no <code>color</code>, <code>dash</code>, <code>font</code> or align StyleProp, so the same recipe every other shape uses resolves to Language plus the one Font size ladder.</figcaption></figure>
<p><b>Verdict: both surfaces are right to have no thickness row.</b> A Block title is a run of text and a Code block's frame is chrome, so neither carries a user-painted edge; <code>hasAdjustableStrokeWidth</code> paints one only on <code>geo</code>, <code>draw</code>, <code>line</code> and <code>arrow</code>. A row on either would be a control that silently does nothing — the exact class of contextual-menu bug this work set out to end. That verdict now lives at the seam and is pinned by test, instead of remaining a guess in a document.</p>
<h3>Two bugs the audit found by looking at it</h3>
<p>The lab is meant to be where a menu bug shows up first. It was carrying two of its own.</p>
<figure><div class="grid">
<figure style="margin:0"><img src="{presets_before}" alt="The preset cards before the fix: only the grey description lines are readable, the bold names are near-white on near-white"><figcaption><b>Before.</b> Every preset's <em>name</em> — the word you click — painted near-white on a near-white surface. Only the description read.</figcaption></figure>
<figure style="margin:0"><img src="{presets_after}" alt="The preset cards after the fix, with every name legible"><figcaption><b>After.</b> <code>--ss-text</code> on the surface, set once for every form control in the shell.</figcaption></figure>
</div><figcaption>Cropped at build time from the journey's own frames — “before” read straight out of commit <code>{pre_audit_rev}</code>, because the bug is a property of a commit.</figcaption></figure>
<ol>
<li><b>A <code>button</code> does not inherit <code>color</code>.</b> The UA paints it with its own <code>buttontext</code>. <code>select</code> and the <code>↑ ↓</code> move buttons had each been given a colour locally; the preset cards were simply missed. Now set once for every form control in <code>.menu-lab__shell</code> rather than per widget.</li>
<li><b>Half the lab's chrome never applied in Settings.</b> <code>.menu-lab select</code> was scoped to <code>.menu-lab</code> — the <em>standalone</em> route's own fixed-position wrapper. Settings renders the shell directly, with no such ancestor, so every select in Settings &rsaquo; Menu lab was a bare native control while the same board at <code>?menu-lab</code> looked designed. Re-scoped to <code>.menu-lab__shell</code>, which both entry points share.</li>
</ol>
<h3>And a preset can no longer lie about the product</h3>
<p>The presets are hand-written, so nothing stopped one from keeping a grouping the real recipe had moved on from — which would make the lab misrepresent the very thing it exists to demonstrate. <code>labPresetDrift</code> now checks each preset against the product recipe it names: every control it emits must exist in that recipe, and controls it draws in one group must not be ones the recipe keeps apart. Stacked controls are exempt by construction, since they fold into a host and never reach a recipe — which is why <code>strokeWidth</code> is legitimately absent from <code>SHAPE_CONTEXTUAL_RECIPE</code> while the Shape preset still composes it. <code>menuLabModel.test.ts</code> fails the build on a mismatch.</p>
</section>

<section class="panel">
<h2>Guided review board</h2>
<figure><img src="{fixture_png}" alt="The line-thickness review fixture with numbered cue cards"><figcaption><code>sketches/review/line-thickness.systemsketch</code> · five numbered gestures and a green PASS WHEN card.</figcaption></figure>
</section>

<footer>Generated from the live tree and the real-browser results in <code>{RESULTS.relative_to(ROOT).as_posix()}</code> by <code>docs/build_line_thickness.py</code>. Journey: <code>npm run test:line-thickness</code> (<code>{JOURNEY.relative_to(ROOT).as_posix()}</code>, {len(journey.splitlines())} lines). Hero recording: <code>docs/capture_line_thickness_hero.mjs</code>.</footer>
</main></body></html>"""

    OUTPUT.write_text(document, encoding="utf-8")
    print(f"wrote {OUTPUT.relative_to(ROOT)} ({len(document):,} bytes)")


if __name__ == "__main__":
    main()
