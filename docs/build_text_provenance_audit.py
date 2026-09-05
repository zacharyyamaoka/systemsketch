#!/usr/bin/env python3
"""Build the self-contained typography-provenance audit gallery."""

from __future__ import annotations

import base64
import html
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "text-provenance-audit-2026-09-05.html"
SCREENSHOT = ROOT / "docs" / "assets" / "text-provenance-live-2026-09-05.png"


def esc(value: object) -> str:
    return html.escape(str(value), quote=True)


def code_has(path: str, needle: str) -> bool:
    return needle in (ROOT / path).read_text(encoding="utf-8")


def source_link(path: str, line: int) -> str:
    return f'<a href="../{esc(path)}">{esc(path)}:{line}</a>'


def inline_image(path: Path) -> str:
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


ROWS = [
    ("Whiteboard", "Scribbled", "Stock Text, Geo and Arrow labels", "Whiteboard-first records", "stock tldraw default", "Stock defaults are already `draw`; preserve this path.", "node_modules/@tldraw/tlschema/src/styles/TLFontStyle.ts", 29),
    ("Whiteboard", "Scribbled", "Stock Note", "Whiteboard-first note", "stock tldraw default", "No change.", "node_modules/@tldraw/tlschema/src/styles/TLFontStyle.ts", 29),
    ("Whiteboard", "Scribbled", "Callout card body", "A user places and writes this engineering note on the board", "sans", "Changed to `draw`; a callout is a sketch note, not application chrome.", "src/callout/calloutModel.ts", 228),
    ("Block", "Technical", "Value-pill name, type and literal", "Python declaration shell", "mono", "Already correct in canvas, SVG and detached primitives.", "src/blocks/ui/block-canvas.css", 1058),
    ("Block", "Technical", "Port-view Block title", "Callable / definition name", "mono", "Already correct.", "src/blocks/ui/block-canvas.css", 112),
    ("Block", "Technical", "Simple-view Block title", "Same callable / definition name as Port view", "sans", "Changed to mono, including its layout measurement, SVG export and detach projection.", "src/blocks/ui/block-canvas.css", 165),
    ("Block", "Technical", "Port names", "Formal and returned binding names", "sans", "Changed to mono, including inline editor, geometry measurement, SVG export and detach projection.", "src/blocks/ui/block-canvas.css", 711),
    ("Block", "Technical", "Port types and default values", "Python annotation and literal", "mono", "Already correct.", "src/blocks/ui/block-canvas.css", 722),
    ("Block", "Simple", "Block type, description, hidden-port summary and definition badge", "SystemSketch presentation / derived caption", "sans", "No change. These are not source tokens even when they describe code.", "src/blocks/ui/block-canvas.css", 127),
    ("Branch", "Technical", "Branch title", "Source-shaped conditional title", "mono", "Already correct.", "src/branch/branch-canvas.css", 42),
    ("Branch", "Technical", "Control-port name", "Conditional input binding", "sans", "Changed to mono in canvas, SVG export, inline editor and detach projection.", "src/branch/branch-canvas.css", 54),
    ("Branch", "Simple", "Arm caption, `active`, `+ arm`, chevrons and target controls", "SystemSketch structure and human-readable case caption", "sans", "No change. The model explicitly calls arm titles human-readable rather than code.", "src/branch/branchModel.ts", 9),
    ("Loop", "Technical", "Loop title", "Source-shaped loop title", "mono", "Already correct.", "src/loop/loop-canvas.css", 56),
    ("Loop", "Technical", "Header port type labels", "Editable type annotation", "sans", "Changed to mono in canvas, SVG export and detach projection.", "src/loop/loop-canvas.css", 69),
    ("Loop", "Simple", "Turn chip (for example `z⁻¹` or `iteration 3 of 7`)", "SystemSketch temporal/state annotation", "mono", "Changed to sans in canvas, SVG export and detach projection.", "src/loop/loop-canvas.css", 79),
    ("Connection", "Simple", "Delay/effect pill (`z⁻¹`, `mut`) and semantic-role pill", "SystemSketch connection grammar", "mono", "Changed to sans. A technical glyph can still be product notation rather than source text.", "src/blocks/connections/ConnectionShapeUtil.tsx", 1340),
    ("Connection", "Technical", "Cable before/after diff chip", "Literal source field values being compared", "mono", "No change; it is code evidence, unlike the grammar pill beside it.", "src/blocks/connections/ConnectionShapeUtil.tsx", 1450),
    ("Control marks", "Simple", "Break/continue icon glyphs, port counts and semantic cues", "Derived status/affordance", "sans", "No change.", "src/control-icons.css", 35),
    ("Menus", "Simple", "Main menu, context menu, toolbar, selection menu and shape library", "SystemSketch navigation and commands", "sans / inherited UI", "No change. Menu labels default to modern UI sans.", "src/chrome/SystemSketchChrome.tsx", 480),
    ("Inspectors", "Simple", "Section titles, labels, help, buttons and status", "SystemSketch UI", "sans", "No change.", "src/blocks/ui/block-inspector.css", 63),
    ("Inspectors", "Technical", "Editable names/types/defaults, source notation and code notes", "Code-shaped values/evidence", "mono", "No change.", "src/blocks/ui/block-inspector.css", 632),
    ("Workspace", "Simple", "Document actions, dialogs, navigation and notifications", "Application chrome", "sans / inherited UI", "No change.", "src/workspace/local-workspace.css", 200),
    ("Workspace", "Technical", "Paths, stable ids, hashes and source snippets", "Exact code/file evidence", "mono", "No change.", "src/workspace/local-workspace.css", 420),
    ("Review & diagnostics", "Simple", "Headings, actions, severity/status labels and explanatory copy", "Application chrome", "sans / inherited UI", "No change.", "src/compare/compare.css", 47),
    ("Review & diagnostics", "Technical", "Previous/current values, line diffs, recorder payloads and command shortcuts", "Exact code/history evidence", "mono", "No change.", "src/compare/review-table.css", 65),
    ("Accessibility", "Nonvisual", "ARIA labels, tooltips and title attributes", "Non-visual description of the same provenance", "Nonvisual", "No visual font. Keep language faithful to the visible concept.", "src/blocks/ui/PortDot.tsx", 78),
]


def build() -> str:
    checks = [
        ("Compact Block title is mono", "src/blocks/ui/block-canvas.css", "BlockNode-simpleTitle"),
        ("Port name is mono", "src/blocks/ui/block-canvas.css", "BlockNode-portName"),
        ("Callout begins as draw", "src/callout/calloutModel.ts", "font: 'draw'"),
        ("Branch control name is mono", "src/branch/branch-canvas.css", "Branch-controlName"),
        ("Loop type label is mono", "src/loop/loop-canvas.css", "Loop-portLabel"),
        ("Loop turn chip is sans", "src/loop/loop-canvas.css", "Loop-turn"),
        ("Delay pill is sans", "src/blocks/connections/ConnectionShapeUtil.tsx", "fontFamily=\"Inter, ui-sans-serif"),
        ("Detached delay pill is sans", "src/blocks/detach/detachBlock.ts", "font: 'sans'"),
    ]
    verified = sum(code_has(path, needle) for _, path, needle in checks)
    updated = sum("Changed" in row[5] for row in ROWS)
    categories = {row[1] for row in ROWS}
    body_rows = "".join(
        "<tr data-origin='{origin}'><td>{surface}</td><td><span class='origin {origin}'>{kind}</span></td>"
        "<td><b>{field}</b><br><small>{provenance}</small></td><td><code>{before}</code></td>"
        "<td>{decision}</td><td>{source}</td></tr>".format(
            origin=row[1].lower().replace(" ", "-"),
            surface=esc(row[0]), kind=esc(row[1]), field=esc(row[2]), provenance=esc(row[3]),
            before=esc(row[4]), decision=esc(row[5]), source=source_link(row[6], row[7]),
        )
        for row in ROWS
    )
    screenshot = ""
    if SCREENSHOT.exists():
        screenshot = (
            "<figure><img src='{}' alt='Live SystemSketch typography provenance fixture'>"
            "<figcaption>Live browser evidence from the disposable review fixture. The Block title and port "
            "signature are technical; the delay chip is SystemSketch chrome.</figcaption></figure>"
        ).format(inline_image(SCREENSHOT))
    else:
        screenshot = "<p class='pending'>Browser capture will be embedded when the fixture journey completes.</p>"
    return f"""<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch · Typography provenance audit</title>
<style>
:root{{--ink:#20242a;--muted:#65707c;--paper:#f5f3ee;--panel:#fff;--line:#d9dce0;--blue:#356fd2;--green:#18784f;--orange:#bf6b1d;--purple:#7756a8;--sans:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;--mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;--draw:"tldraw_draw",cursive}}*{{box-sizing:border-box}}body{{margin:0;background:var(--paper);color:var(--ink);font:15px/1.5 var(--sans)}}main{{max-width:1220px;margin:auto;padding:50px 28px 90px}}h1{{margin:8px 0 12px;font:600 clamp(34px,5vw,58px)/.98 var(--sans);letter-spacing:-.05em}}h2{{margin:48px 0 15px;font:650 25px/1.15 var(--sans);letter-spacing:-.025em}}p{{max-width:880px}}a{{color:#225fae}}.eyebrow{{font:700 11px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--blue)}}.lede{{max-width:930px;font-size:19px;color:#46505a}}.facts{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:28px 0}}.fact{{min-height:104px;padding:16px;border:1px solid var(--line);border-radius:14px;background:var(--panel)}}.fact b{{display:block;font:700 28px/1 var(--mono)}}.fact span{{display:block;margin-top:8px;color:var(--muted);font-size:13px}}.rule{{padding:16px 18px;border-left:5px solid var(--orange);border-radius:8px;background:#fffaf4}}.rule b{{display:block;margin-bottom:4px}}.specimens{{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}}.specimen{{min-height:160px;padding:18px;border:1px solid var(--line);border-radius:14px;background:var(--panel)}}.specimen small{{display:block;margin-bottom:20px;color:var(--muted);font-weight:650}}.specimen .sample{{font-size:23px;line-height:1.2}}.draw .sample{{font-family:var(--draw);font-style:italic}}.mono .sample{{font-family:var(--mono)}}.sans .sample{{font-family:var(--sans);font-weight:650}}.filters{{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}}button{{border:1px solid var(--line);border-radius:999px;background:var(--panel);padding:7px 11px;color:var(--ink);font:650 12px/1 var(--sans);cursor:pointer}}button[aria-pressed=true]{{border-color:var(--blue);background:#eaf1ff;color:#1f56a8}}table{{width:100%;border-spacing:0;border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--panel)}}th,td{{padding:11px 12px;vertical-align:top;text-align:left;border-bottom:1px solid var(--line)}}tr:last-child td{{border-bottom:0}}th{{background:#eff1f4;font:700 10px/1.2 var(--mono);letter-spacing:.08em;text-transform:uppercase}}td{{font-size:13px}}td small{{color:var(--muted)}}code{{font:12px/1.35 var(--mono);background:#edf0f3;border-radius:4px;padding:2px 4px}}.origin{{display:inline-block;padding:3px 6px;border-radius:999px;font:700 10px/1 var(--mono);white-space:nowrap}}.scribbled{{background:#fff0df;color:#8a4812}}.technical{{background:#e9f0ff;color:#2553a0}}.simple{{background:#e7f6ee;color:#176341}}.nonvisual{{background:#eff0f2;color:#5f6670}}figure{{margin:0;border:1px solid var(--line);border-radius:14px;padding:12px;background:var(--panel)}}figure img{{display:block;width:100%;border-radius:8px}}figcaption{{padding:9px 3px 1px;color:var(--muted);font-size:13px}}.pending{{padding:15px;border:1px dashed var(--line);border-radius:10px;color:var(--muted)}}.checklist{{columns:2;gap:24px;padding-left:20px}}.checklist li{{margin:6px 0}}.ok{{color:var(--green)}}@media(max-width:860px){{.facts,.specimens{{grid-template-columns:1fr 1fr}}table{{display:block;overflow:auto;white-space:normal}}}}@media(max-width:560px){{main{{padding:36px 16px 70px}}.facts,.specimens{{grid-template-columns:1fr}}.checklist{{columns:1}}}}
</style><main>
<div class="eyebrow">SystemSketch · audit · 2026-09-05</div>
<h1>Typeface is a provenance cue.</h1>
<p class="lede">The canvas has three origins, not three decorative moods: a whiteboard-first sketch, a source-shaped code projection, and SystemSketch’s own UI or annotations. This audit classifies every visible text-field family by that origin and follows it through live canvas, SVG/portable export, detached primitives, and chrome.</p>
<section class="facts"><div class="fact"><b>{len(ROWS)}</b><span>visible text-field families audited</span></div><div class="fact"><b>{updated}</b><span>misaligned routes corrected</span></div><div class="fact"><b>{verified}/{len(checks)}</b><span>implementation seams checked at build time</span></div><div class="fact"><b>{len(categories)}</b><span>provenance outcomes, including nonvisual</span></div></section>
<div class="rule"><b>The decision rule</b>Ask “where did this string first become meaningful?” before asking what it looks like. A code-like glyph such as <code>z⁻¹</code> or <code>mut</code> remains <em>sans</em> when SystemSketch places it as grammar; a source identifier remains <em>mono</em> even when it sits on a friendly compact card.</div>
<h2>The three reading modes</h2>
<section class="specimens"><article class="specimen draw"><small>SCRIBBLED · whiteboard-first</small><div class="sample">Try a sketch here ↗</div></article><article class="specimen mono"><small>TECHNICAL · source-shaped</small><div class="sample">decode(frame: Image)</div></article><article class="specimen sans"><small>SIMPLE · SystemSketch chrome</small><div class="sample">z⁻¹ · mut · Add port</div></article></section>
<h2>Live canvas evidence</h2>{screenshot}
<h2>Field-by-field audit</h2>
<p>Use the filter to inspect one provenance at a time. “Before” records the family that was present on the audited base; “decision” says whether the current tree changes it. Accessibility-only strings have no visual typeface but are included so their wording stays tied to the same semantic field.</p>
<div class="filters" role="group" aria-label="Filter audit rows"><button aria-pressed="true" data-filter="all">All</button><button aria-pressed="false" data-filter="scribbled">Scribbled</button><button aria-pressed="false" data-filter="technical">Technical</button><button aria-pressed="false" data-filter="simple">Simple</button><button aria-pressed="false" data-filter="nonvisual">Nonvisual</button></div>
<table><thead><tr><th>surface</th><th>font</th><th>text field</th><th>before</th><th>current decision</th><th>evidence</th></tr></thead><tbody>{body_rows}</tbody></table>
<h2>Implementation checks</h2><ul class="checklist">{''.join(f"<li class='{'ok' if code_has(path, needle) else ''}'>{esc(label)} — {'present' if code_has(path, needle) else 'missing'} in <code>{esc(path)}</code></li>" for label, path, needle in checks)}</ul>
<p>The canonical product rule is now in <a href="project-preferences.md">docs/project-preferences.md</a>. The audit intentionally does not turn typeface into a validator: an explicit choice may be appropriate, but the default must communicate provenance rather than happen by accident.</p>
</main><script>const buttons=[...document.querySelectorAll('[data-filter]')],rows=[...document.querySelectorAll('tbody tr')];buttons.forEach(b=>b.onclick=()=>{{buttons.forEach(x=>x.setAttribute('aria-pressed',x===b));const f=b.dataset.filter;rows.forEach(r=>r.hidden=f!=='all'&&!r.dataset.origin.startsWith(f))}})</script></html>"""


if __name__ == "__main__":
    OUT.write_text(build(), encoding="utf-8")
    print(OUT)
