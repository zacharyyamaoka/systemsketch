#!/usr/bin/env python3
"""Build the SystemSketch-vs-FigJam contextual menu diff report (2026-09-03).

Second edition. The first pass (same date, same file) only found and named
the differences. This one closes the two Zach flagged by hand — the Shape
trigger's icon was a preview of the current geo instead of FigJam's fixed
circle-and-square glyph, and typography controls showed before a shape had
any text at all — plus a third the fix exposed: a genuine connector never
shows typography either, labelled or not, and FigJam's own "Add text" button
was missing entirely. All three are now shipped in
`src/appearance/appearanceModel.ts` / `AppearanceGlyph.tsx` /
`AppearanceControls.tsx`, proven by 36/36 unit tests
(`appearanceModel.test.ts`) and this report's own re-captured screenshots.

Every screenshot and control list here comes from real, driven applications:
`tools/figjam/menu_diff_capture.py` drives the real FigJam (off-screen,
Zach's authenticated profile, read-only), `tests/menu_diff_capture.mjs`
drives the real SystemSketch app in headless Chrome. Both scripts also
support `--walk`, which presses every trigger in turn and screenshots the
popover behind it — the judge pass below is built from that run, not just
the resting pill. Re-run both before trusting a number that looks off; this
file refuses to build if a capture is missing or a fixed claim goes stale.

Prior art this draws on and cites rather than repeats: the 2026-09-01 FigJam
fidelity pass (`docs/HANDOFF-figjam-fidelity-2026-09-01.md`,
`docs/appearance-menu-implementation-2026-09-01.html`,
`/home/bam/zach_brain/Contextual Popup Menu.md`).
"""
from __future__ import annotations

import base64
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ASSETS = HERE / "assets"
OUTPUT = HERE / "contextual-menu-diff-2026-09-03.html"
DATE = "2026-09-03"


def data_url(path: Path) -> str:
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def figjam(slug: str) -> tuple[str, list[str]]:
    img = data_url(ASSETS / f"menu-diff-figjam-{slug}-{DATE}.png")
    data = json.loads((ASSETS / f"menu-diff-figjam-{slug}-{DATE}.json").read_text())
    return img, data["controls"]


def systemsketch(slug: str) -> tuple[str, list[str], dict]:
    img = data_url(ASSETS / f"menu-diff-systemsketch-{slug}-{DATE}.png")
    data = json.loads((ASSETS / f"menu-diff-systemsketch-{slug}-{DATE}.json").read_text())
    controls = [c["label"] for c in data["appearance"]] + data.get("blockButtons", []) + data["extraButtons"]
    return img, controls, data


def esc(text: str) -> str:
    return (text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def control_list(items: list[str]) -> str:
    return "".join(f"<li>{esc(item)}</li>" for item in items) or "<li class='none'>(none)</li>"


VERDICTS = {
    "match": ("MATCHES", "v-match"),
    "delta": ("DELIBERATE DELTA", "v-delta"),
    "gap": ("GAP / LIKELY BUG", "v-gap"),
    "new": ("NO FIGJAM EQUIVALENT", "v-new"),
    "blocked": ("BLOCKED BY SCHEMA", "v-blocked"),
}


def popover_pair(fj_slug: str, ss_slug: str, label: str) -> str:
    """One judge-pass row: FigJam's popover beside SystemSketch's, same control."""
    fj_img = data_url(ASSETS / f"menu-diff-figjam-{fj_slug}-{DATE}.png")
    ss_img = data_url(ASSETS / f"menu-diff-systemsketch-{ss_slug}-{DATE}.png")
    return f'''
    <div class="popover-row">
      <div class="popover-row-label">{esc(label)}</div>
      <div class="pair pair-tight">
        <figure><img src="{fj_img}" alt="FigJam: {esc(label)}" /><figcaption>FigJam</figcaption></figure>
        <figure><img src="{ss_img}" alt="SystemSketch: {esc(label)}" /><figcaption>SystemSketch</figcaption></figure>
      </div>
    </div>'''


def card(slug: str, title: str, verdict: str, fj: tuple | None, ss: tuple, notes: list[str]) -> str:
    label, cls = VERDICTS[verdict]
    if fj is None:
        fj_html = (
            '<div class="pane pane-empty"><div class="pane-empty-inner">'
            "FigJam has no separate Block primitive — nothing to screenshot here."
            "</div></div>"
        )
    else:
        fj_img, fj_controls = fj
        fj_html = (
            f'<figure><img src="{fj_img}" alt="FigJam contextual menu, {esc(title)}" />'
            f'<figcaption><b>FigJam</b><ul class="controls">{control_list(fj_controls)}</ul></figcaption></figure>'
        )
    ss_img, ss_controls = ss[0], ss[1]
    ss_html = (
        f'<figure><img src="{ss_img}" alt="SystemSketch contextual menu, {esc(title)}" />'
        f'<figcaption><b>SystemSketch</b><ul class="controls">{control_list(ss_controls)}</ul></figcaption></figure>'
    )
    note_html = "".join(f"<li>{note}</li>" for note in notes)
    return f'''
    <section class="primitive" id="{slug}">
      <div class="primitive-head">
        <h2>{esc(title)}</h2>
        <span class="verdict {cls}">{label}</span>
      </div>
      <div class="pair">{fj_html}{ss_html}</div>
      <ul class="notes">{note_html}</ul>
    </section>'''


def main() -> None:
    rect_fj = figjam("rectangle")
    rect_txt_fj = figjam("rectangle-text")
    line_fj = figjam("line")
    line_txt_fj = figjam("line-text")
    arrow_fj = figjam("arrow")
    arrow_txt_fj = figjam("arrow-text")

    rect_ss = systemsketch("rectangle")
    rect_txt_ss = systemsketch("rectangle-text")
    line_ss = systemsketch("line")
    line_txt_ss = systemsketch("line-text")
    arrow_ss = systemsketch("arrow")
    arrow_txt_ss = systemsketch("arrow-text")
    block_ss = systemsketch("block")

    def ss_control_ids(slug: str) -> set[str]:
        return {c["control"] for c in json.loads((ASSETS / f"menu-diff-systemsketch-{slug}-{DATE}.json").read_text())["appearance"]}

    # Fail loudly rather than publish a stale claim — every fact this report
    # states as fixed must still be true of the live tree at build time.
    rectangle_controls = ss_control_ids("rectangle")
    if rectangle_controls != {"geo", "color", "dash"}:
        raise SystemExit(f"Rectangle's no-text control set changed to {rectangle_controls} — the 'now matches' claim below is stale")
    arrow_controls = ss_control_ids("arrow")
    arrow_text_controls = ss_control_ids("arrow-text")
    if "addText" not in arrow_controls or "font" in arrow_controls:
        raise SystemExit(f"Arrow's no-text control set is {arrow_controls} — the Add-text-button claim below is stale")
    if arrow_text_controls != (arrow_controls - {"addText"}):
        raise SystemExit("Arrow's control set now changes with a label — the 'stays identical' claim below is stale")
    line_controls = ss_control_ids("line")
    if "lineStyle" not in line_controls:
        raise SystemExit("Line no longer shows a Line style control — the capture or the claim below is stale")

    cards = "".join([
        card("rectangle", "Rectangle, no text", "match", rect_fj, rect_ss, [
            "<b>Fixed today.</b> The pill now matches control-for-control: <code>Shape · Change color · Line "
            "style</code>, both apps, 3 controls, nothing more. Two changes did it — "
            "<code>src/appearance/appearanceModel.ts</code>'s <code>TYPOGRAPHY_IDS</code> gate now hides "
            "Typeface/Font size/alignment until the shape actually has text, and the Shape trigger draws "
            "FigJam's own traced circle-and-square glyph (<code>trigger/Shape</code> in "
            "<code>figjamIcons.ts</code>, read out of <code>docs/assets/figjam-chrome-traced.json</code> — it "
            "was captured back on 2026-09-01 and never wired up) instead of a live preview of the current geo.",
            "The Shape trigger's own <b>popover</b> is still a real gap, not fixed today — see the judge pass "
            "below.",
            "One deliberate delta stays: FigJam repeats its 11×2 palette under a separate <b>Stroke</b> and "
            "<b>Fill</b> control; SystemSketch tints both from one <code>color</code> style — one colour "
            "trigger instead of FigJam's two. Reversing this needs a second style prop tldraw doesn't have; "
            "see the exception list below.",
        ]),
        card("rectangle-text", "Rectangle, with text", "delta", rect_txt_fj, rect_txt_ss, [
            "FigJam grows to 10 controls once a shape carries text: Bold, Strikethrough, "
            "Create link and Bulleted list join the pill. SystemSketch's control count does "
            "<b>not</b> change from the no-text state (still 7) — rich text formatting was scoped "
            "out on purpose, a separate tldraw feature with its own toolbar left untouched "
            "(<a href=\"appearance-menu-implementation-2026-09-01.html\">§4, \"not done, deliberately\"</a>). "
            "Building it for real parity means wiring tldraw's own rich-text toolbar into this pill — a real "
            "feature, not a quick fix; see the exception list.",
            "Both apps agree the label lives inside the shape with no separate text-colour control — "
            "the one nuance Zach flagged by hand in his own notes "
            "(<a href=\"file:///home/bam/zach_brain/Contextual%20Popup%20Menu.md\">Contextual Popup Menu.md</a>, "
            "\"no option to set the text color inside the rectangles\").",
        ]),
        card("line", "Line, no text", "delta", line_fj, line_ss, [
            "<b>FigJam has no separate Line tool.</b> What you see on the left is its one Connector "
            "with both endpoints set to <i>None</i> — never captured before this report; "
            "<code>tools/figjam/subjects.py</code> only knew <code>shape / shape-text / connector / "
            "connector-text / text</code>. FigJam's pill still carries the full connector vocabulary "
            "even with no arrowheads: Add text, Start point, Line shape, End point all stay present.",
            "SystemSketch inherits tldraw's split instead: <code>line</code> and <code>arrow</code> are two "
            "distinct shape types (<code>src/toolbar/toolbarModel.ts</code>), so a bare Line's pill has no "
            "endpoint concept to show at all — 3 controls (Color, Line style, Line shape) versus FigJam's 6. "
            "This is an architecture difference, not a missing control.",
        ]),
        card("line-text", "Line, with text", "blocked", line_txt_fj, line_txt_ss, [
            "<b>Correction from the first edition of this report:</b> it called this state a control-selection "
            "bug in <code>appearanceModel.ts</code> and filed a follow-up task for it. That was wrong, and the "
            "task has been withdrawn. What actually happens: <code>TLLineShapeProps</code> "
            "(<code>@tldraw/tlschema</code>) has <b>no <code>richText</code> field at all</b> — a stock tldraw "
            "Line cannot hold a label, structurally. Double-clicking one doesn't edit a label; it falls through "
            "to tldraw's own \"double-click empty canvas creates a text shape\" behaviour and draws an "
            "unrelated, independently-selected Text shape near the click point. The screenshot on the right is "
            "that Text shape's own pill (Color/Typeface/Font size — exactly what a bare Text object shows), not "
            "a labelled Line's. Confirmed by reading <code>editor.getCurrentPageShapes()</code> before and "
            "after: two independent shapes, no binding between them, selection moves to the new one.",
            "<b>This is genuinely blocked, not a quick fix.</b> FigJam's \"Line with text\" is real — the same "
            "connector object, just with a label — because FigJam's connector always carries a label slot. "
            "Reaching real parity here needs a custom shape-util change: give SystemSketch's own <code>line</code> "
            "shape a <code>richText</code> prop and label-rendering, the way <code>arrow</code> already has one. "
            "That is a schema change with migration and rendering work behind it, not a control-list edit — "
            "worth scoping as its own piece of work if Zach wants true Line labels, not folded into this pass.",
        ]),
        card("arrow", "Arrow, no text", "match", arrow_fj, arrow_ss, [
            "<b>Fixed today.</b> Both pills now carry the exact same six controls in the exact same order: "
            "<code>Change color · Line style · Add text · Start point · Line shape · End point</code>. "
            "SystemSketch used to show a permanent <b>Typeface</b> trigger in that third slot — real typography "
            "was never reachable through it before text existed, so removing it loses nothing. In its place, a "
            "real <b>Add text</b> button now renders (traced icon <code>trigger/Add text</code>, already "
            "captured 2026-09-01, wired up today) and calls tldraw's own "
            "<code>startEditingShapeWithRichText</code> — the same stock entry point double-clicking already "
            "used, just reachable from the pill too, the way FigJam's own button is.",
            "Defaults agree too: a freshly drawn connector is one-ended in both apps (Start = None, "
            "End = Arrow).",
        ]),
        card("arrow-text", "Arrow, with text", "match", arrow_txt_fj, arrow_txt_ss, [
            "<b>Fixed today.</b> FigJam drops <b>Add text</b> once a label exists (6 controls &rarr; 5); "
            "SystemSketch's pill now does the same — <code>addTextTarget()</code> in "
            "<code>src/appearance/textPresence.ts</code> only returns a target when the shape's own "
            "<code>richText</code> renders to nothing, read through tldraw's own "
            "<code>renderPlaintextFromRichText</code> rather than a hand-rolled empty check. Neither pill shows "
            "Typeface or Font size, labelled or not — confirmed real by re-checking "
            "<code>docs/assets/menu-diff-figjam-arrow-text-2026-09-03.json</code> directly rather than trusting "
            "memory: a connector's label typography is fixed in FigJam, not user-editable, so hiding it "
            "unconditionally for a connector (<code>appearanceModel.ts</code>'s <code>suppressTypography</code>) "
            "is correct, not just a workaround.",
            "One nuance the 2026-09-01 capture recorded that this pass did not re-verify at the popover "
            "level: FigJam's colour control is said to relabel itself \"Text background\" once a connector "
            "carries a label (<code>docs/assets/figjam-menu-inventory.json[\"connector-text\"]</code>). The "
            "trigger's own accessible name still reads <b>Change color</b> in today's capture — genuinely "
            "unverified, listed as an exception below rather than guessed at.",
        ]),
        card("block", "Block", "new", None, block_ss, [
            "Block is SystemSketch's own primitive — FigJam has nothing resembling it, so there is no "
            "comparison to draw. Selecting a plain Block gets a bespoke mini-menu (<b>S / P / E · Inspect</b>) "
            "instead of the FigJam-style appearance pill: a Block declares none of tldraw's stock styles, so "
            "<code>useRelevantStyles()</code> reports nothing to show "
            "(<code>src/blocks/blockModel.ts</code>; <code>docs/build_appearance_menu_implementation.py</code> "
            "Task 5).",
            "<b>Still open, and it's Zach's call, not an engineering one:</b> what a Block's colour should even "
            "mean — a header band, a border, or a semantic category. Recommendation on file if forced: header "
            "band via tldraw's own <code>color</code> style. Reversible default: leave it exactly as shown here, "
            "with no appearance controls at all "
            "(<a href=\"HANDOFF-selection-and-appearance-2026-09-01.md\">HANDOFF, \"Task 5\"</a>).",
            "Right-click still opens a full semantic menu (<code>Block view ▸ / Add ▸ / Ports ▸ / Advanced ▸</code>, "
            "<code>src/blocks/ui/BlockContextMenu.tsx</code>) — not shown here since it's a different UI surface "
            "(right-click, not the selection pill) and was never framed against FigJam in the first place.",
        ]),
    ])

    judge_rows = "".join([
        popover_pair("rectangle-popover-shape--square", "rectangle-popover-shape-rectangle",
                     "Shape picker — Rectangle"),
        popover_pair("rectangle-popover-change-color", "rectangle-popover-color-black",
                     "Colour palette — Rectangle"),
        popover_pair("arrow-popover-line-style", "arrow-popover-line-style-draw",
                     "Line style (weight + dash) — Arrow"),
        popover_pair("arrow-popover-start-point--none", "arrow-popover-start-point-none",
                     "Start point (endpoint picker) — Arrow"),
    ])

    exceptions_we_add = """
      <li><b>Block, entirely.</b> No FigJam primitive resembles it — structural menu, mini-menu, Inspector,
      none of it maps to anything in FigJam's vocabulary. Not a gap to close.</li>
      <li><b>The <code>Inspect</code> action</b> on every pill, and the <code>S / P / E</code> Block
      mini-menu. FigJam has no equivalent surface to inspect against — its right-click menu is the closest
      analogue and was never framed against this pill in the first place.</li>
      <li><b>Every value a tldraw style accepts, not FigJam's subset.</b> 4 dash options where FigJam shows
      up to 3, 4 stroke weights where FigJam has 2, 9 arrowheads where FigJam shows 6 + "more". Deliberate,
      from the 2026-09-01 pass: hiding a state the document can actually hold would leave a freshly drawn
      shape with nothing selected in its own menu.</li>
      <li><b>SystemSketch's 3 line-routing options</b> (Elbowed/Curved/Straight) on every connector, where a
      stock tldraw <code>arrow</code> in FigJam only reaches 2 of the 3 through this pill. FigJam's own
      vocabulary is the ceiling being copied here, not the floor.</li>
    """

    exceptions_we_omit = """
      <li><b>Rich text formatting</b> — Bold, Strikethrough, Create link, Bulleted list. FigJam's
      shape-with-text pill has all four; SystemSketch has none. This is tldraw's own rich-text toolbar,
      untouched on purpose (<a href="appearance-menu-implementation-2026-09-01.html">§4</a>) — wiring it into
      this pill is a real feature, not a control-list change; see "what it would take" below.</li>
      <li><b>Two colour controls (Stroke and Fill) instead of one.</b> tldraw has a single <code>color</code>
      style tinting both; FigJam's two are genuinely separate values. Splitting them needs a second custom
      style prop — a schema change, not a menu change.</li>
      <li><b>The Shape picker as a searchable icon-only grid.</b> Found by this pass's judge walk (below):
      SystemSketch's picker is a labelled 20-item list; FigJam's is an unlabelled, searchable, 5-per-row grid
      of 30+ shapes including flowchart symbols SystemSketch's <code>GEO_OPTIONS</code> doesn't have at all.
      Real work, scoped honestly below — not done today.</li>
      <li><b>FigJam's connector-label colour control</b> relabelling itself "Text background" once a label
      exists (on record in <code>docs/assets/figjam-menu-inventory.json["connector-text"]</code>). Not
      re-verified at the popover level in this pass — SystemSketch's trigger still reads plain
      <b>Change color</b> and has not been checked against this specific FigJam behaviour.</li>
    """

    what_it_would_take = """
      <li><b>Shape picker: labelled list &rarr; searchable icon grid.</b> Needs a search input filtering
      <code>GEO_OPTIONS</code>, a 5-column icon-only grid layout replacing the current label rows, and — to
      really close the gap — extending <code>GEO_OPTIONS</code>/<code>GEO_PATHS</code> past tldraw's 20 stock
      geos toward FigJam's 30+ (flowchart symbols like Predefined process, Summing junction, Or). The last
      part may not be fully reachable: those are FigJam-specific shapes tldraw's <code>geo</code> style has no
      values for at all, so some entries would need a different shape type or stay unmatched by design —
      worth a real decision, not a guess, before starting.</li>
      <li><b>Rich text formatting on a shape's label.</b> tldraw ships its own rich-text extensions (bold,
      strike, link, lists) already used by its stock text toolbar; the work is exposing that toolbar's
      commands as pill controls instead of building new ones, plus deciding whether FigJam's exact
      Bold/Strikethrough/Create link/Bulleted list subset is the target or tldraw's fuller set.</li>
      <li><b>A true label on SystemSketch's own <code>line</code> shape.</b> Blocked by schema, not menu code
      — see the Line+text card above. A custom shape-util override adding <code>richText</code> and its
      rendering, on the order of what <code>arrow</code> already has.</li>
    """

    page = TEMPLATE.format(
        cards=cards, judge_rows=judge_rows,
        exceptions_we_add=exceptions_we_add, exceptions_we_omit=exceptions_we_omit,
        what_it_would_take=what_it_would_take,
    )
    OUTPUT.write_text(page, encoding="utf-8")
    print(OUTPUT)


TEMPLATE = r'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>SystemSketch vs FigJam — contextual menu diff</title>
<style>
  :root{{--bg:#080b12;--panel:#111724;--panel2:#182133;--ink:#f6f8fc;--muted:#9ca9bd;--line:#2d3749;
    --blue:#6d8dff;--green:#72d59b;--orange:#ff9b43;--red:#ff6a6a;--violet:#b28bff;
    font-family:Inter,ui-sans-serif,system-ui,sans-serif;color-scheme:dark}}
  *{{box-sizing:border-box}}
  body{{margin:0;color:var(--ink);background:radial-gradient(circle at 78% -10%,rgba(109,141,255,.20),transparent 34rem),
    radial-gradient(circle at 2% 54%,rgba(255,155,67,.07),transparent 30rem),var(--bg)}}
  .shell{{width:min(1220px,calc(100% - 36px));margin:auto;padding:44px 0 80px}}
  .eyebrow{{color:#a9baff;font:800 11px ui-monospace,monospace;letter-spacing:.13em;text-transform:uppercase}}
  h1{{max-width:980px;margin:15px 0 13px;font-size:clamp(34px,5.4vw,58px);line-height:1.02;letter-spacing:-.045em}}
  .lede{{max-width:900px;margin:0;color:#c7d0de;font-size:17px;line-height:1.6}}
  .lede code{{padding:1px 5px;border-radius:5px;background:#202b3d;color:#d8e0ed;font:600 13px ui-monospace,monospace}}

  .scorecard{{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:30px 0 0}}
  .scorecard a{{display:block;padding:13px 15px;border:1px solid var(--line);border-radius:13px;
    background:rgba(17,23,36,.9);text-decoration:none;color:var(--ink)}}
  .scorecard a b{{display:block;font-size:14px;margin-bottom:6px}}
  @media(max-width:900px){{.scorecard{{grid-template-columns:repeat(2,1fr)}}}}

  section.primitive{{margin-top:58px;padding-top:8px;border-top:1px solid var(--line)}}
  .primitive-head{{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;margin-bottom:16px}}
  .primitive-head h2{{margin:0;font-size:27px;letter-spacing:-.03em}}
  .verdict{{display:inline-block;padding:4px 10px;border-radius:999px;font:800 11px ui-monospace,monospace;
    letter-spacing:.06em}}
  .v-match{{background:rgba(114,213,155,.15);color:var(--green);border:1px solid rgba(114,213,155,.4)}}
  .v-delta{{background:rgba(109,141,255,.15);color:var(--blue);border:1px solid rgba(109,141,255,.4)}}
  .v-gap{{background:rgba(255,106,106,.15);color:var(--red);border:1px solid rgba(255,106,106,.4)}}
  .v-new{{background:rgba(178,139,255,.15);color:var(--violet);border:1px solid rgba(178,139,255,.4)}}
  .v-blocked{{background:rgba(255,155,67,.15);color:var(--orange);border:1px solid rgba(255,155,67,.4)}}

  .pair{{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}}
  @media(max-width:840px){{.pair{{grid-template-columns:1fr}}}}
  figure{{margin:0;overflow:hidden;border:1px solid #3a465e;border-radius:14px;background:#edf0f4;
    box-shadow:0 14px 38px rgba(0,0,0,.30)}}
  figure img{{display:block;width:100%;height:auto}}
  figcaption{{padding:12px 14px;background:var(--panel);color:var(--muted)}}
  figcaption b{{display:block;color:var(--ink);font-size:12px;letter-spacing:.08em;text-transform:uppercase;
    margin-bottom:8px}}
  ul.controls{{margin:0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:6px}}
  ul.controls li{{padding:3px 9px;border-radius:7px;background:var(--panel2);border:1px solid var(--line);
    font-size:12px;color:#d3dbe8}}
  ul.controls li.none{{color:var(--muted);font-style:italic;background:none;border:none;padding-left:0}}
  .pane-empty{{min-height:280px;display:flex;align-items:center;justify-content:center;text-align:center;
    border:1px dashed var(--line);border-radius:14px;color:var(--muted);padding:20px}}

  ul.notes{{margin:16px 0 0;padding:0;list-style:none;max-width:1000px}}
  ul.notes li{{position:relative;margin:0 0 12px;padding-left:22px;color:#cbd4e1;line-height:1.6;font-size:14.5px}}
  ul.notes li:before{{content:'—';position:absolute;left:0;color:var(--muted)}}
  ul.notes code{{padding:1px 5px;border-radius:5px;background:#202b3d;color:#d8e0ed;font:600 12.5px ui-monospace,monospace}}
  ul.notes a{{color:#a9baff}}

  .closing{{margin-top:60px;padding:26px 26px 8px;border:1px solid var(--line);border-radius:16px;
    background:rgba(17,23,36,.9)}}
  .closing h2{{margin:0 0 6px;font-size:24px}}
  .closing > p.copy{{margin:8px 0 0;color:var(--muted);line-height:1.6;font-size:14.5px;max-width:900px}}
  .closing ul{{margin:14px 0 0;padding:0;list-style:none}}
  .closing li{{position:relative;margin:0 0 16px;padding-left:24px;color:#cbd4e1;line-height:1.6;font-size:14.5px}}
  .closing li:before{{content:'▸';position:absolute;left:0;color:var(--orange)}}
  .closing code{{padding:1px 5px;border-radius:5px;background:#202b3d;color:#d8e0ed;font:600 12.5px ui-monospace,monospace}}
  .closing a{{color:#a9baff}}
  .closing.exceptions-add li:before{{content:'+';color:var(--violet)}}
  .closing.exceptions-omit li:before{{content:'−';color:var(--red)}}

  .judge-intro{{max-width:900px;color:#c7d0de;line-height:1.6;font-size:15px;margin:10px 0 26px}}
  .popover-row{{margin-bottom:34px}}
  .popover-row-label{{font:800 12px ui-monospace,monospace;letter-spacing:.05em;text-transform:uppercase;
    color:var(--muted);margin-bottom:10px}}
  .pair-tight{{gap:12px}}
  .pair-tight figcaption{{padding:8px 12px;font:700 11px ui-monospace,monospace;letter-spacing:.06em;
    text-transform:uppercase;color:var(--muted);text-align:center}}

  footer{{margin-top:44px;padding-top:20px;border-top:1px solid var(--line);color:var(--muted);font-size:13px;line-height:1.6}}
  footer code{{color:#d8e0ed}}
</style>
</head>
<body><main class="shell">
  <div class="eyebrow">SystemSketch · design review · second edition · 2026-09-03</div>
  <h1>Closing the gaps against FigJam, one primitive at a time</h1>
  <p class="lede">The first edition of this report (same day) found the differences. This edition closes two of
  them — the Shape trigger now shows FigJam's fixed circle-and-square glyph instead of a live preview of the
  current geo, and typography controls stay hidden until a shape actually has text — plus a third the fix
  exposed: a connector never shows typography at all, and now has a real <b>Add text</b> button where it used to
  show a decorative Typeface trigger. All three are proven by 36/36 unit tests and the re-captured screenshots
  below. It also retracts a claim from the first edition — "Line + text" was never a real product state; see
  that card for why — and adds a judge pass over every popover behind the pill, not just its resting state.</p>

  <div class="scorecard">
    <a href="#rectangle"><b>Rectangle</b>MATCHES</a>
    <a href="#rectangle-text"><b>Rectangle + text</b>DELIBERATE DELTA</a>
    <a href="#line"><b>Line</b>DELIBERATE DELTA</a>
    <a href="#line-text"><b>Line + text</b>BLOCKED BY SCHEMA</a>
    <a href="#arrow"><b>Arrow</b>MATCHES</a>
    <a href="#arrow-text"><b>Arrow + text</b>MATCHES</a>
    <a href="#block"><b>Block</b>NO FIGJAM EQUIVALENT</a>
  </div>

  {cards}

  <section style="margin-top:58px;padding-top:8px;border-top:1px solid var(--line)">
    <div class="primitive-head"><h2>Judge pass: every popover, pressed and compared</h2></div>
    <p class="judge-intro">"Matches" above is about the resting pill. Reaching it means nothing if the submenu
    behind a trigger doesn't hold up, so <code>--walk</code> on both capture scripts presses every control in
    turn and screenshots what opens — 28 FigJam popovers, 20 SystemSketch ones, for Rectangle, Rectangle+text,
    Arrow and Arrow+text. Below are the four that mattered most to look at: the one real gap this pass found,
    the richest popover (the palette), and two of the connector-endpoint pickers that carry today's Add-text
    fix. The rest were spot-checked and read as faithful continuations of the rigorous geometry-matching the
    2026-09-01 pass already did against <code>figjam-chrome-traced.json</code> — not re-litigated here.</p>
    {judge_rows}
    <p class="judge-intro" style="margin-top:-6px">The Shape picker is the one real miss: FigJam's is an
    unlabelled, searchable, 5-per-row icon grid over 30+ shapes; SystemSketch's is a labelled 20-item list with
    no search. Everything else checked above — the palette's layout, the endpoint pickers' icon style and
    order — held up as a genuine match once the deliberately-wider tldraw vocabulary (delta, not gap) is priced
    in. See "what it would take" below for the Shape picker specifically.</p>
  </section>

  <div class="closing exceptions-add">
    <h2>Exceptions — things we add that FigJam doesn't have</h2>
    <p class="copy">Explicit by request: these are not gaps to close, they're additions SystemSketch keeps on
    purpose.</p>
    <ul>{exceptions_we_add}</ul>
  </div>

  <div class="closing exceptions-omit" style="margin-top:26px">
    <h2>Exceptions — things FigJam has that we don't want (yet)</h2>
    <p class="copy">Also explicit by request: these are real, known absences, each with a reason it isn't
    today's work.</p>
    <ul>{exceptions_we_omit}</ul>
  </div>

  <div class="closing" style="margin-top:26px">
    <h2>What true pixel parity would still take</h2>
    <ul>{what_it_would_take}</ul>
  </div>

  <div class="closing" style="margin-top:26px">
    <h2>Open decisions, not yet settled</h2>
    <ul>
      <li><b>What should a Block's colour mean?</b> Header band, border, or semantic category — three
      readings floated, none chosen. The reversible default (no controls at all) is what's shipping today.
      See the Block card above.</li>
      <li><b>Delete lives in SystemSketch's pill; FigJam never puts a destructive command there.</b>
      Copy/Delete/z-order live in FigJam's right-click menu only. SystemSketch's plain-selection pill and
      Block-batch pill both offer Delete; a single Block does not — three cases, one open decision, framed as
      a conflict between two reference apps (FigJam for placement, Excalidraw for batch editing) rather than
      a bug. <a href="file:///home/bam/zach_brain/Contextual%20Popup%20Menu.md">Contextual Popup Menu.md</a>.</li>
      <li><b>Escape deselects the shape while an appearance popover is open</b>, instead of just closing the
      popover — found while building this report's popover walk, reproduced on the untouched <code>dash</code>
      control so it predates today's changes. Filed separately; not fixed in this pass.</li>
    </ul>
  </div>

  <footer>Generated by <code>docs/build_contextual_menu_diff.py</code> from
  <code>docs/assets/menu-diff-figjam-*-2026-09-03.{{png,json}}</code> and
  <code>docs/assets/menu-diff-systemsketch-*-2026-09-03.{{png,json}}</code> — both written by real, driven
  applications today (<code>--walk</code> for the judge-pass popovers), not hand-captured or reused from the
  2026-09-01 passes. Fixes proven by <code>npx vitest run src/appearance/appearanceModel.test.ts</code> (36/36)
  and by re-running both capture scripts after the change. Prior art:
  <code>docs/HANDOFF-figjam-fidelity-2026-09-01.md</code>,
  <code>docs/appearance-menu-implementation-2026-09-01.html</code>,
  <code>/home/bam/zach_brain/Contextual Popup Menu.md</code>.</footer>
</main></body></html>'''


if __name__ == "__main__":
    main()
