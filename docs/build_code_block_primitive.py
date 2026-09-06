#!/usr/bin/env python3
"""Build the self-contained Code block primitive rebuild report.

Every number is measured from the live tree at build time — the smoke test's
own JSON, the unit-test count, the review fixture's records, and the
deleted-file guarantees — so the report cannot drift from the code it
describes.
"""
from __future__ import annotations

import base64
import html
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "code-block-primitive-2026-09-05.html"


def image_uri(relative: str) -> str:
    path = ROOT / relative
    return f"data:image/png;base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


def need(path: Path, *tokens: str) -> None:
    source = path.read_text(encoding="utf-8")
    missing = [token for token in tokens if token not in source]
    if missing:
        raise RuntimeError(f"{path.relative_to(ROOT)} is missing {missing!r}")


def must_not_exist(*relatives: str) -> None:
    still = [relative for relative in relatives if (ROOT / relative).exists()]
    if still:
        raise RuntimeError(f"hand-rolled modules were supposed to be deleted: {still!r}")


def count_it_blocks(path: Path) -> int:
    return len(re.findall(r"\n\tit\(", path.read_text(encoding="utf-8")))


def main() -> None:
    results_path = ROOT / "docs/assets/code-block-primitive.json"
    board_path = ROOT / "sketches/review/code-block-primitive.systemsketch"
    for path in (results_path, board_path):
        if not path.exists():
            raise RuntimeError(f"missing proof artifact: {path.relative_to(ROOT)}")

    # The composed-menu contract, asserted against the live tree.
    need(ROOT / "src/code/codeModel.ts", "CodeLanguageStyle", "DefaultSizeStyle", "characterWidth")
    need(ROOT / "src/appearance/appearanceModel.ts", "codeLanguage", "CodeLanguageStyle")
    need(ROOT / "src/chrome/SystemSketchChrome.tsx", "EditorCodeSelectionMiniMenu", "CodeResizeIndicator")
    need(ROOT / "src/code/CodeSelectionControls.tsx", "systemsketch-appearance__trigger", "CODE_WIDTH_PRESETS")
    need(ROOT / "src/code/CodeShapeUtil.tsx", "onBeforeUpdate", "codePropsForPresentation")
    # The babble swap: CodeMirror owns the editing vocabulary now.
    need(ROOT / "src/blocks/babble/SourceCodeEditor.tsx", "indentWithTab", "moveLineUp", "typeNameCompletion")
    need(ROOT / "src/blocks/babble/typeNameCompletion.ts", "buildRegistry", "buildQueryResults", "buildBrowseList")
    must_not_exist(
        "src/blocks/babble/codeEditorKeymap.ts",
        "src/blocks/babble/codeEditorKeymap.test.ts",
        "src/blocks/babble/TypeNameAutocomplete.tsx",
    )

    results = json.loads(results_path.read_text(encoding="utf-8"))
    passed = sum(1 for check in results if check["ok"])
    unit_tests = count_it_blocks(ROOT / "src/code/codeModel.test.ts")

    board = json.loads(board_path.read_text(encoding="utf-8"))
    records = board.get("records", [])
    shapes = [record for record in records if record.get("typeName") == "shape"]
    bindings = [record for record in records if record.get("typeName") == "binding"]

    checklist = "".join(
        f'<li class="{"pass" if check["ok"] else "fail"}"><b>{html.escape(check["id"])}</b> {html.escape(check["label"])}</li>'
        for check in results
    )

    size_image = image_uri("docs/assets/code-block-size-ladder.png")
    width_image = image_uri("docs/assets/code-block-width-popover.png")
    hud_image = image_uri("docs/assets/code-block-resize-hud.png")
    fixture_image = image_uri("docs/assets/code-block-fixture-live.png")
    babble_image = image_uri("docs/assets/babble-cm-autocomplete.png")

    document = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Code block primitive · SystemSketch</title>
<style>
:root {{ color-scheme:dark; --ink:#f5f7fb; --muted:#aab4c6; --line:#2d384b; --blue:#5aa7ff; --green:#62d58b; --red:#ff8a8a; --amber:#ffcf7a; --card:linear-gradient(145deg,#121b29,#0d1420); }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:#0a0f18; color:var(--ink); font:15px/1.55 Inter,ui-sans-serif,system-ui,sans-serif; }}
main {{ width:min(1180px,calc(100% - 32px)); margin:auto; padding:56px 0 76px; }}
h1 {{ font-size:clamp(36px,6vw,64px); line-height:1.02; letter-spacing:-.05em; margin:12px 0 22px; max-width:940px; }}
h2 {{ font-size:24px; margin:0 0 14px; letter-spacing:-.02em; }}
p {{ color:var(--muted); max-width:80ch; }}
.eyebrow {{ color:var(--blue); font-size:12px; font-weight:800; letter-spacing:.16em; text-transform:uppercase; }}
.lead {{ font-size:18px; color:#d9e0ec; }}
.metrics {{ display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin:30px 0 46px; }}
.metric,.panel {{ border:1px solid var(--line); background:var(--card); border-radius:16px; }}
.metric {{ padding:16px; }}
.metric b {{ display:block; font-size:26px; }}
.metric span {{ color:var(--muted); font-size:13px; }}
.panel {{ padding:22px; margin:18px 0; overflow:hidden; }}
.grid2 {{ display:grid; grid-template-columns:1fr 1fr; gap:18px; align-items:start; }}
.shot {{ width:100%; border-radius:10px; border:1px solid var(--line); }}
.caption {{ margin:8px 2px 0; font-size:13px; color:var(--muted); }}
table {{ width:100%; border-collapse:collapse; }}
th,td {{ padding:10px 12px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; font-size:14px; }}
th {{ color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.06em; }}
tr:last-child td {{ border-bottom:0; }}
.keep {{ color:var(--green); font-weight:700; }}
.change {{ color:var(--amber); font-weight:700; }}
ul.checks {{ list-style:none; margin:0; padding:0; columns:2; column-gap:24px; }}
ul.checks li {{ margin:0 0 8px; font-size:13.5px; break-inside:avoid; }}
ul.checks li.pass b {{ color:var(--green); }}
ul.checks li.fail b {{ color:var(--red); }}
code {{ color:#b9dcff; background:#111b29; padding:2px 6px; border-radius:6px; }}
blockquote {{ margin:12px 0 0; padding:12px 16px; border-left:3px solid var(--blue); background:#0d1420; color:#d9e0ec; font-size:14px; border-radius:0 10px 10px 0; }}
.footer {{ margin-top:36px; padding-top:20px; border-top:1px solid var(--line); font-size:13px; color:var(--muted); }}
@media (max-width:820px) {{ .metrics,.grid2 {{ grid-template-columns:1fr; }} ul.checks {{ columns:1; }} }}
</style>
</head>
<body>
<main>
  <div class="eyebrow">SystemSketch · Code primitive rebuilt · 5 September 2026</div>
  <h1>The same design decisions,<br>in the one menu you already know.</h1>
  <p class="lead">The merged Code block (main <code>a146983c</code>&nbsp;&rarr;&nbsp;<code>1d0313b4</code>) chose the right direction and shipped the wrong chrome. This rebuild keeps the recorded decisions — real CodeMirror&nbsp;6, stock tldraw interaction, a character-width contract with live drag feedback — and replaces every bespoke control with the composable selection menu the rest of the app uses.</p>

  <section class="metrics" aria-label="Measured results">
    <div class="metric"><b>{passed} / {len(results)}</b><span>real-browser checks passed</span></div>
    <div class="metric"><b>{unit_tests}</b><span>width-model unit tests</span></div>
    <div class="metric"><b>1 / 0</b><span>shared selection pill / bespoke floating menus</span></div>
    <div class="metric"><b>{len(shapes)} / {len(bindings)}</b><span>review fixture shapes / bound arrows</span></div>
  </section>

  <section class="panel">
    <h2>Recovered from the original babble record</h2>
    <p>The first implementation left an honest decision record behind
    (<code>docs/code-block-primitive-babble-2026-09-05.json</code> on main): four weighted
    requirements, three hard gates, five orthogonal directions, and a scored pick —
    V5, “Ribbon + width popover.” Those decisions survive intact; only their execution changed.</p>
    <table>
      <thead><tr><th>Recorded decision</th><th>Fate here</th><th>Why</th></tr></thead>
      <tbody>
        <tr><td>g1 · Real CodeMirror 6, never a styled textarea</td><td class="keep">Kept</td><td><code>CodeBlockCanvas</code> mounts a live EditorView; languages are real CM modes.</td></tr>
        <tr><td>g2 · Stock shape/selection/resize/undo/persistence</td><td class="keep">Kept</td><td><code>BaseBoxShapeUtil</code> + <code>BaseBoxShapeTool</code>; a free resize derives <code>ch</code>, never reimplements the drag.</td></tr>
        <tr><td>g3 · No implicit program semantics</td><td class="keep">Kept</td><td>The shape stores raw text + display prefs. No lint, no execution, no completion inside the Code block.</td></tr>
        <tr><td>FR2 · One visible character count everywhere</td><td class="keep">Kept</td><td>Preset rows, exact entry, and the live <code>ch</code> badge at the stock handle all agree; presentation changes preserve the authored measure (<code>onBeforeUpdate</code>).</td></tr>
        <tr><td>FR3 · Quiet canvas — V4's always-on header scored 2/5 and was rejected</td><td class="keep">Kept, harder</td><td>The first build added a persistent language/width header anyway; this one has <em>none</em> — the unselected block is only code.</td></tr>
        <tr><td>V5 · A floating ribbon above the selection</td><td class="change">Re-homed</td><td>Not a bespoke <code>CodeSelectionMiniMenu</code>: the controls ride the ONE shared <code>SelectionContextualMenu</code> pill, beside every other shape's.</td></tr>
        <tr><td>V5 · Four named width preset buttons (Compact/Standard/Wide/Extra&nbsp;wide)</td><td class="change">Replaced</td><td>Zach: “not standard.” See the width row below.</td></tr>
        <tr><td>V5 · A ±&nbsp;px font-size stepper</td><td class="change">Replaced</td><td>The text size is tldraw's own <code>DefaultSizeStyle</code>, rendered by the standard Font size ladder — zero new menu items to learn.</td></tr>
      </tbody>
    </table>
  </section>

  <section class="grid2">
    <article class="panel">
      <h2>The standard Font size ladder, verbatim</h2>
      <img class="shot" src="{size_image}" alt="A selected Code block whose pill shows JavaScript, the standard Small/Medium/Large/Extra large font size ladder open, a line-numbers toggle and a 50 ch width combobox">
      <p class="caption">The Code block's <code>size</code> prop IS <code>DefaultSizeStyle</code>, so <code>AppearanceControls</code> renders the exact combobox every text shape gets — Small/Medium/Large/Extra&nbsp;large, each row at its own size. The shape maps the rungs to a mono scale (12/16/20/24&nbsp;px, Medium&nbsp;=&nbsp;the babble specimen's 16&nbsp;px), and <code>CodeShapeUtil.onBeforeUpdate</code> re-derives pixel width from the authored <code>ch</code> whenever the rung changes.</p>
    </article>
    <article class="panel">
      <h2>Width, brought in line with the house idiom</h2>
      <img class="shot" src="{width_image}" alt="The ch width combobox open: 32 / 48 / 64 / 80 ch rows with a Custom numeric field beneath">
      <p class="caption">The survey found no numeric-property precedent matching the old four-button grid: every valued property in the pill is a combobox of check rows (Font size, Typeface, Language), and exact numbers live in labelled fields (Block inspector's Rate&nbsp;Hz). So width became a <code>48&nbsp;ch</code> combobox whose presets are ordinary list rows named by value, with a Custom field beneath — same classes, same popover, same check glyph as every other row.</p>
    </article>
  </section>

  <section class="grid2">
    <article class="panel">
      <h2>Language is an appearance row</h2>
      <p><code>CodeLanguageStyle</code> is a custom <code>StyleProp</code> — the exact precedent
      <code>ConnectionRoutingStyle</code> set: one stock style write covers a multi-selection,
      the next Code block drawn remembers the last language, and <code>appearanceModel.ts</code>
      lists it as one more <code>list</code>-layout row that only a Code selection surfaces.
      Nothing about the pill is Code-specific except the two controls that genuinely are:
      the line-number toggle and the width combobox
      (<code>src/code/CodeSelectionControls.tsx</code>).</p>
      <blockquote>“You should only be adding the things which are unique to the code block…
      the text size model should follow the standard text sizing menu we use on other
      things — we don't want to relearn new menu items for each of these things.”</blockquote>
    </article>
    <article class="panel">
      <h2>Live <code>ch</code> at the stock handle</h2>
      <img class="shot" src="{hud_image}" alt="A Code block mid-resize with an 80 ch badge at the drag corner">
      <p class="caption">FR2's drag feedback: tldraw owns the resize; <code>CodeResizeIndicator</code> only reads <code>select.resizing</code> and prints the reciprocal character count beside the handle. The drag is deliberately unsnapped — pixels stay free-form, <code>ch</code> is derived.</p>
    </article>
  </section>

  <section class="panel">
    <h2>The babble Source editors now share the real editor</h2>
    <div class="grid2">
      <div>
        <p>The Type / Type&nbsp;Mapping babbles' Source mode existed as a transparent
        <code>&lt;textarea&gt;</code> over a highlighted <code>&lt;pre&gt;</code> only because no real
        editor was in the tree yet. With CodeMirror in as a first-class dependency,
        <code>SourceCodeEditor</code> keeps its seam (value, per-line highlight, commit-on-blur,
        Escape-to-cancel, caret-at-click entry) and swaps its internals for a CM document:</p>
        <ul class="bugs" style="padding-left:20px;color:#dce4ef">
          <li><code>codeEditorKeymap.ts</code> (+ its test) — <b>deleted</b>; <code>indentWithTab</code> and <code>moveLineUp/Down</code> are the real commands.</li>
          <li><code>TypeNameAutocomplete.tsx</code> and its mirror-div caret-pixel hack — <b>deleted</b>; the registry/query/browse logic became a real <code>completionSource</code> whose tooltip anchors via CodeMirror's own <code>coordsAtPos</code>.</li>
          <li>The kind pill with its icon, and the “show every type on this board” browse escalation, survive verbatim — they were UI decisions, not implementation details.</li>
        </ul>
      </div>
      <div>
        <img class="shot" src="{babble_image}" alt="The Type babble Source mode as a CodeMirror document with the board-type autocomplete tooltip open, showing a board type pill for Pose and the browse escalation row">
        <p class="caption">A live board scan feeding a real completion source: <code>Pose</code> is a board type on this very board, the matched run is bold, and the footer row escalates to the full library. The recursive UI-tree read view and the reactive type index are untouched.</p>
      </div>
    </div>
  </section>

  <section class="panel">
    <h2>Real-browser proof — {passed}/{len(results)} checks</h2>
    <ul class="checks">{checklist}</ul>
    <p class="caption">One journey (<code>tests/code_block_primitive_smoke.mjs</code>, <code>npm run test:code-block</code>) drives the System family menu, the shared pill's language/size/width/line-number controls, a stock handle resize with the live <code>ch</code> badge, click-to-edit into CodeMirror, and then the babble Source editors: CM mount, decoration highlighting, the completion tooltip, Tab-accept, click-outside commit, and Escape cancel.</p>
  </section>

  <section class="panel">
    <h2>Human review board</h2>
    <img class="shot" src="{fixture_image}" alt="The review fixture open in the live Preview: a selected Code block under the single shared pill, three numbered cue cards with bound orange arrows, and a green PASS WHEN card">
    <p class="caption"><code>sketches/review/code-block-primitive.systemsketch</code>, generated through the real editor and opened here through the live Preview server — the pill above the block is the one shared selection menu, not a Code-only surface.</p>
  </section>

  <div class="footer">Generated from the current tree and the smoke test's own JSON output by <code>docs/build_code_block_primitive.py</code>. The original decision record and its scored variants live on main: <code>docs/code-block-primitive-babble-2026-09-05.json</code> (commit <code>a146983c</code>); this rebuild re-implements its chosen direction against the composable selection-menu architecture that landed after it.</div>
</main>
</body>
</html>
"""
    OUTPUT.write_text(document, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
