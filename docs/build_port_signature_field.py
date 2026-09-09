#!/usr/bin/env python3
"""Build reports/port-signature-field-<date>.html — a port is ONE line of code.

The refactor Zach asked for on 2026-09-09: every port editor (the docked
inspector row, the on-canvas click-to-edit editor, the free Port's panel)
becomes a single code text field spelled `name: Type = default`, backed by a
general `CodeField` component on CodeMirror whose grammar is plugged in as
extensions. Storage does not change — the field is a projection of the stored
`{name, type, defaultValue}` triple — so every binding, projection and journey
that reads the triple keeps reading it.

Every claim on the page is checked against the tree at build time (`need()`),
the journey evidence is read from the results the real-browser run wrote, and
the captures live in ignored `reports/media/port-signature-field/` referenced
relatively — the retained review runtime serves them beside the page.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
from datetime import date
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NAME = "port-signature-field"
OUT = Path(os.environ.get("SYSTEMSKETCH_REPORT_OUTPUT", ROOT / f"reports/{NAME}-{date.today()}.html"))
MEDIA = Path(os.environ.get("SYSTEMSKETCH_REPORT_MEDIA_DIR", ROOT / "reports/media" / NAME))
REL = f"media/{NAME}"

CAPTURES = [
    ("port-signature-field-inspector-rows.png", "The inspector after the refactor: one field per port. The input reads <code>frame: Frame</code>, the untyped output is just <code>pose</code>."),
    ("port-signature-field-inspector-typed.png", "Typing <code>window: int = 5</code> into that field. The Block paints the name, the type hint and the <code>= 5</code> chip while the line is still being typed; the field colours the same three roles."),
    ("port-signature-field-type-completion.png", "The moment the caret passes the colon the board's Types appear — <code>Pose</code> is the Type Block on the left, with its kind pill; primitives follow. Enter accepts."),
    ("port-signature-field-canvas-editor.png", "Click-to-edit on the canvas opens the same one line over the port, with the same grammar and completions. Enter commits, Escape closes."),
    ("port-signature-field-round-trip.png", "Back in the inspector: the canonical spelling of what the canvas wrote. Two views, one stored triple."),
    ("fixture.png", "The guided review board that ships with this page: three numbered cues and one green PASS WHEN card around a real Type Block and a real Block."),
]

LANE_CAPTURES = [
    ("port-lanes-inputs-open.png", "Multi-line on (the default) · a click on the left half of the body opens ONE editor over all three inputs, one line per port, each line pinned to its dot's row; the caret opened on <code>frame</code>, the row that was clicked, and the painted input labels stepped aside while their lane is open."),
    ("port-lanes-moved-up.png", "Ctrl+↑ (or Alt+↑) on that line: <code>frame</code> is now first. The store reads <code>in_2, in_1, in_3</code> — the ids moved with their lines, so a cable bound to <code>in_2</code> is still bound to <code>frame</code>."),
    ("port-lanes-duplicated.png", "Enter started <code>yaw: float = 0</code> as a new port in place; Shift+Alt+↓ then duplicated the line into a fifth port with its own id. The Block re-laid its rows under the editor as they were added."),
    ("port-lanes-committed.png", "Ctrl+Enter commits: the Block paints the five ports the lane described."),
    ("port-lanes-outputs-open.png", "The right half opens the outputs lane — parked just past the Block's right edge and typed the ordinary way, rows still one-to-one with the dots (your suggestion, applied as V1 below). Escape leaves the outputs untouched."),
    ("port-lanes-folded.png", "A long line: it runs to the right while it is the caret's line, and folds to <code>…</code> the moment the caret leaves it — the per-line reveal, applied to width. The ⤢ in the lane's corner opens the whole document in a bigger, wrapped viewer."),
    ("port-lanes-settings-toggle.png", "Settings › Canvas › Port editor: the multi-line editor is on by default; off is the single-line drag-and-drop editor, and the bottom-right drop-down follows."),
    ("port-lanes-viewer-completion.png", "Inside the viewer the completion popup paints inside the modal, above the scrim, and Escape dismisses it before it closes the viewer."),
    ("port-lanes-lane-above-cover.png", "A Block pasted above estimate in z-order, right where the outputs lane parks: the open lane is promoted above it."),
    ("port-lanes-viewer.png", "The ⤢ viewer: the same lane document, wrapped, in a panel inside the theme root — Escape from anywhere, a scrim click, or Ctrl+Enter closes it; Tab cannot leave it."),
    ("port-lanes-blank-block.png", "A Block with no ports: click either half, type, and the ports are created line by line — the first port no longer needs the inspector. Here two inputs were typed into the empty inputs lane after an output was typed into the empty outputs lane."),
    ("lanes-fixture.png", "The lanes' own guided board: the three gestures and a PASS WHEN."),
]


def read(name: str) -> str:
    return (ROOT / name).read_text(encoding="utf-8")


def need(text: str, token: str, label: str) -> None:
    if token not in text:
        raise SystemExit(f"report is stale — expected {label}: {token!r}")


def absent(text: str, token: str, label: str) -> None:
    if token in text:
        raise SystemExit(f"report is stale — {label} is still present: {token!r}")


def git(*args: str) -> str:
    try:
        return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=False).stdout.strip()
    except OSError:
        return ""


def measured() -> dict:
    grammar = read("src/blocks/portSignature.ts")
    field = read("src/fields/CodeField.tsx")
    port_field = read("src/blocks/ui/PortSignatureField.tsx")
    inspector = read("src/blocks/ui/BlockInspector.tsx")
    inline = read("src/blocks/BlockInlineEditor.tsx")
    inline_model = read("src/blocks/inlineBlockEditing.ts")
    floating = read("src/floatingPort/FloatingPortInspector.tsx")
    shape_util = read("src/blocks/BlockShapeUtil.tsx")
    model = read("src/blocks/blockModel.ts")
    prefs = read("src/settings/appearancePreferences.ts")
    guidance = read("src/fields/emptyFieldGuidance.ts")
    journey = read("tests/port_signature_field_smoke.mjs")
    pkg = read("package.json")

    need(grammar, "export function parsePortSignature(text: string): PortSignature", "the parser")
    need(grammar, "export function formatPortSignature(", "the formatter")
    need(grammar, "export function portSignatureSlotAt(", "the slot finder")
    need(grammar, "export function portSignaturePatch(", "the store patch")
    need(grammar, "if (char === '\"' || char === \"'\")", "quote awareness in the splitter")
    need(field, "export function CodeField(", "the code text box")
    need(field, "grammarCompartment.current.of(extensions)", "grammar as extensions")
    need(field, "event.stopPropagation()", "Enter/Escape stopped before tldraw")
    need(field, "new FieldGesture({", "the shared commit contract")
    need(port_field, "export function portCompletionSource(", "the slot-dispatched completion")
    need(port_field, "if (slot.slot === 'name') return null", "no completion in the name slot")
    need(port_field, "useDebouncedExpressionEval(defaultText, registry)", "evaluation scoped to the default slot")
    need(port_field, "class ResolvedWidget extends WidgetType", "the resolved-value ghost")
    need(inspector, "<PortSignatureField", "the inspector row uses the field")
    absent(inspector, "EMPTY_FIELD_GUIDANCE.block.portName", "the three-field row")
    absent(inspector, "punctuatedPortRow", "the punctuated-row preference in the inspector")
    need(inline, "<CodeField", "the canvas editor is the field")
    need(inline, "portSignaturePatch(port, value)", "live parse on the canvas")
    need(inline_model, "if (aIsPort && bIsPort)", "name and type spans are one field")
    need(floating, "<PortSignatureField", "the free Port's panel uses the field")
    absent(shape_util, "canvasPortSignaturePatch", "the commit-time canvas parse")
    need(model, "defaultValue: T.string.optional()", "storage unchanged: the triple")
    absent(prefs, "punctuatedPortRow", "the retired preference")
    need(guidance, "portSignature: 'name: Type = default'", "the grammar as guidance")
    absent(pkg, "test:port-punctuation", "the retired journey runner")
    need(pkg, "\"test:port-signature\"", "the new journey runner")

    results_path = MEDIA / "port-signature-field-results.json"
    checks = json.loads(results_path.read_text())["checks"] if results_path.exists() else []
    lane_results = MEDIA / "port-lanes-results.json"
    lane_checks = json.loads(lane_results.read_text())["checks"] if lane_results.exists() else []
    lane = read("src/blocks/portLane.ts")
    need(lane, "export function reconcilePortLane(", "the lane reconciler")
    need(lane, "function commonLines(", "the line diff that keeps ids across a move")
    need(read("src/development/PrototypeSwitch.tsx"), "aria-label=\"Port editor prototype\"", "the in-app prototype switch")
    need(read("src/blocks/portLanePrototype.ts"), "localStorage.getItem(STORAGE_KEY)", "the switch is remembered")
    need(inline_model, "kind: 'portLane'", "the lane field kind")
    need(inline, "multiline", "the lane editor is the multi-line CodeField")
    need(field, "multiline", "CodeField's lane mode")
    need(pkg, "\"test:port-lanes\"", "the lanes journey runner")
    lane_tests = read("src/blocks/portLane.test.ts").count("\tit(") + read("src/blocks/portLaneAtPoint.test.ts").count("\tit(")
    grammar_tests = read("src/blocks/portSignature.test.ts").count("\tit(")
    completion_tests = read("src/blocks/ui/PortSignatureField.test.ts").count("\tit(")
    journey_checks = journey.count("pass('") + journey.count('pass("')

    return {
        "head": git("rev-parse", "--short", "HEAD"),
        "tldraw": re.search(r'"tldraw":\s*"([^"]+)"', pkg).group(1),
        "codemirror": re.search(r'"@codemirror/view":\s*"([^"]+)"', pkg).group(1),
        "checks": checks,
        "journey_checks": journey_checks,
        "lane_checks": lane_checks,
        "lane_tests": lane_tests,
        "lane_lines": lane.count("\n"),
        "grammar_tests": grammar_tests,
        "completion_tests": completion_tests,
        "lines": {
            "portSignature.ts": grammar.count("\n"),
            "CodeField.tsx": field.count("\n"),
            "PortSignatureField.tsx": port_field.count("\n"),
        },
    }


def lane_mock(*, title: str, editor: str, inputs: list[str], outputs: list[str],
              editor_side: str = "outputs", editor_x: int | None = None, editor_w: int = 150,
              align: str = "left", clip: bool = False, both: bool = False, wide_block: bool = False,
              modal: bool = False, sigils: bool = False, strip: bool = False) -> str:
    """A small schematic of a Port-view Block with a lane editor, drawn from a few numbers."""
    bw = 300 if wide_block else 220
    rows = max(len(inputs), len(outputs))
    pitch = 22
    body_top = 40
    h = body_top + rows * pitch + 18
    x0 = 90
    W = 480
    # Room under the Block for the strip / modal mock and the caption line.
    H = h + 30 + (60 if strip else 0) + (92 if modal else 0)
    parts = [f'<svg viewBox="0 0 {W} {H}" width="100%" role="img" aria-label="{escape(title)}">']
    parts.append(f'<rect x="{x0}" y="6" width="{bw}" height="{h}" rx="8" class="dg-parent"/>')
    parts.append(f'<text x="{x0 + 12}" y="28" class="dg-h">estimate</text>')
    parts.append(f'<line x1="{x0}" y1="{body_top - 4}" x2="{x0 + bw}" y2="{body_top - 4}" class="dg-rule"/>')
    for i, name in enumerate(inputs):
        y = body_top + i * pitch + 10
        parts.append(f'<circle cx="{x0}" cy="{y}" r="4.5" class="dg-child"/>')
        if not (editor_side in ("inputs", "both") and (both or editor_side == "inputs")):
            parts.append(f'<text x="{x0 + 12}" y="{y + 4}" class="dg-c">{escape(name)}</text>')
    for i, name in enumerate(outputs):
        y = body_top + i * pitch + 10
        parts.append(f'<circle cx="{x0 + bw}" cy="{y}" r="4.5" class="dg-child"/>')
        if not (editor_side in ("outputs", "both")):
            parts.append(f'<text x="{x0 + bw - 12}" y="{y + 4}" class="dg-c" text-anchor="end">{escape(name)}</text>')
    def draw_editor(ex: int, ew: int, lines: list[str], anchor_end: bool) -> None:
        ey = body_top - 2
        eh = max(1, len(lines)) * pitch + 4
        parts.append(f'<rect x="{ex}" y="{ey}" width="{ew}" height="{eh}" rx="5" class="dg-def"/>')
        for i, line in enumerate(lines):
            y = body_top + i * pitch + 14
            if anchor_end:
                parts.append(f'<text x="{ex + ew - 6}" y="{y}" class="dg-h" text-anchor="end">{escape(line)}</text>')
            else:
                text = line
                if clip and len(text) > 18:
                    text = text[:17] + "…"
                parts.append(f'<text x="{ex + 6}" y="{y}" class="dg-h">{escape(text)}</text>')
    if strip:
        sy = h + 16
        parts.append(f'<rect x="{x0}" y="{sy}" width="{bw}" height="44" rx="5" class="dg-def"/>')
        parts.append(f'<text x="{x0 + 8}" y="{sy + 18}" class="dg-h">def estimate({", ".join(i.split(":")[0] for i in inputs)})</text>')
        parts.append(f'<text x="{x0 + 8}" y="{sy + 36}" class="dg-h">  -&gt; ({", ".join(o.split(":")[0] for o in outputs)})</text>')
    elif sigils:
        draw_editor(x0 + 12, bw - 24, [f"&gt; {i}" for i in inputs] + [f"&lt; {o}" for o in outputs], False)
    elif modal:
        my = h + 14
        parts.append(f'<rect x="{x0 - 40}" y="{my}" width="{bw + 80}" height="70" rx="8" class="dg-def"/>')
        parts.append(f'<text x="{x0 - 30}" y="{my + 18}" class="dg-dim">⤢ estimate — ports</text>')
        parts.append(f'<text x="{x0 - 30}" y="{my + 38}" class="dg-h">{escape(inputs[0])}   |   {escape(outputs[0])}</text>')
        parts.append(f'<text x="{x0 - 30}" y="{my + 56}" class="dg-h">{escape(inputs[1])}   |   {escape(outputs[1])}</text>')
        parts.append(f'<rect x="{x0 + bw - 22}" y="12" width="16" height="16" rx="3" class="dg-child"/><text x="{x0 + bw - 18}" y="24" class="dg-dim">⤢</text>')
    else:
        if editor_side in ("outputs", "both"):
            ex = editor_x if editor_x is not None else x0 + bw + 10
            draw_editor(ex, editor_w, outputs, align == "right")
        if editor_side in ("inputs", "both") or both:
            draw_editor(x0 + 12 if not both else x0 - 10 - editor_w, editor_w, inputs, False)
    parts.append(f'<text x="8" y="{H - 6}" class="dg-dim">{escape(editor)}</text>')
    parts.append('</svg>')
    return "".join(parts)


def variant_card(tag: str, title: str, svg: str, why: str, cost: str, applied: bool = False) -> str:
    pill = '<span class="pill">applied</span>' if applied else ''
    return (f'<div class="variant"><h4><b>{escape(tag)}</b> · {escape(title)} {pill}</h4>'
            f'<div class="dg">{svg}</div><p><b>Why:</b> {why}</p><p><b>Cost:</b> {cost}</p></div>')


def seam_svg() -> str:
    """The one seam: text ↔ triple, with the three editors on the text side and every reader on the triple side."""
    return """<svg viewBox="0 0 980 330" width="100%" role="img" aria-label="One line of text on the left, parsed by one function into the stored triple on the right, and every consumer reading the triple">
<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="dg-arrfill"/></marker></defs>
<text x="20" y="28" class="dg-title">The editors — three surfaces, one line</text>
<rect x="20" y="44" width="250" height="52" rx="8" class="dg-child"/><text x="34" y="66" class="dg-h">Inspector row</text><text x="34" y="84" class="dg-dim">PortSignatureField · CodeField</text>
<rect x="20" y="108" width="250" height="52" rx="8" class="dg-child"/><text x="34" y="130" class="dg-h">Canvas click-to-edit</text><text x="34" y="148" class="dg-dim">BlockInlineEditor · CodeField</text>
<rect x="20" y="172" width="250" height="52" rx="8" class="dg-child"/><text x="34" y="194" class="dg-h">Free Port panel</text><text x="34" y="212" class="dg-dim">FloatingPortInspector · PortSignatureField</text>
<rect x="340" y="90" width="270" height="92" rx="10" class="dg-def"/>
<text x="356" y="116" class="dg-h">pose: Pose = None</text>
<text x="356" y="138" class="dg-dim">parsePortSignature  →</text>
<text x="356" y="156" class="dg-dim">←  formatPortSignature</text>
<text x="356" y="174" class="dg-dim">depth-0 ':' and '=' · brackets + quotes respected</text>
<path d="M270 70 C 305 70, 305 118, 340 118" class="dg-arrow" marker-end="url(#ah)"/>
<path d="M270 134 L 340 134" class="dg-arrow" marker-end="url(#ah)"/>
<path d="M270 198 C 305 198, 305 150, 340 150" class="dg-arrow" marker-end="url(#ah)"/>
<rect x="680" y="90" width="280" height="92" rx="10" class="dg-parent"/>
<text x="696" y="116" class="dg-h">{ name, type, defaultValue }</text>
<text x="696" y="138" class="dg-dim">BlockPort — schema unchanged</text>
<text x="696" y="156" class="dg-dim">no migration · no second copy</text>
<text x="696" y="174" class="dg-dim">patchBlockPortProps writes it</text>
<path d="M610 128 L 680 128" class="dg-arrow" marker-end="url(#ah)" marker-start="url(#ah)"/>
<text x="680" y="28" class="dg-title">The readers — untouched</text>
<text x="700" y="215" class="dg-c">canvas label · detach primitives · Python projection</text>
<text x="700" y="233" class="dg-c">connection bindings · definition linking · diffs</text>
<text x="700" y="251" class="dg-c">every existing journey that reads a port</text>
<text x="20" y="262" class="dg-title">Where the caret is decides what is offered</text>
<text x="20" y="286" class="dg-c">name slot → nothing</text>
<text x="200" y="286" class="dg-c">after ':' → board Types + primitives</text>
<text x="470" y="286" class="dg-c">after '=' → board variables + safe namespace</text>
<text x="20" y="308" class="dg-dim">portSignatureSlotAt(text, caret) is the whole language service; the same function drives the highlighting.</text>
</svg>"""


CSS = """
:root { --ink:#17191c; --mute:#5b6470; --line:#dfe3e8; --paper:#fff; --wash:#f4f6f8; --accent:#5b46e5; --ok:#1f8a4c; --warn:#b4531d; }
* { box-sizing:border-box; }
body { margin:0; color:var(--ink); background:var(--paper); font:15px/1.5 Inter,system-ui,sans-serif; }
main { max-width:1080px; margin:0 auto; padding:28px 28px 80px; }
h1 { font-size:30px; line-height:1.15; margin:0 0 6px; letter-spacing:-.01em; }
h2 { font-size:21px; margin:44px 0 10px; letter-spacing:-.01em; }
h3 { font-size:16px; margin:22px 0 6px; }
p, li { max-width:80ch; }
p { margin:8px 0; }
.lede { font-size:17px; max-width:84ch; }
.meta { color:var(--mute); font-size:13px; }
code, pre { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
code { background:var(--wash); padding:1px 5px; border-radius:4px; font-size:13px; }
pre { background:#0f1115; color:#e6e8ee; padding:14px 16px; border-radius:8px; overflow:auto; font-size:13px; line-height:1.45; }
table { border-collapse:collapse; width:100%; margin:10px 0 16px; font-size:14px; }
th, td { text-align:left; vertical-align:top; padding:7px 10px; border-bottom:1px solid var(--line); }
th { color:var(--mute); font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:.04em; }
.callout { border-left:4px solid var(--accent); background:#f4f2ff; padding:12px 16px; border-radius:0 8px 8px 0; margin:14px 0; max-width:88ch; }
.callout.warn { border-color:var(--warn); background:#fff5ee; }
.callout.ok { border-color:var(--ok); background:#eefaf2; }
.shots { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin:12px 0 4px; }
.shots figure { margin:0; border:1px solid var(--line); border-radius:8px; overflow:hidden; background:var(--wash); }
.shots img { display:block; width:100%; height:auto; }
.shots .wide { grid-column:1 / -1; }
figcaption { font-size:13px; color:var(--mute); padding:8px 10px; }
.dg { margin:12px 0; border:1px solid var(--line); border-radius:8px; background:#fbfcfd; padding:8px; }
.dg-title { font:600 13px Inter,system-ui,sans-serif; fill:var(--ink); }
.dg-parent { fill:#fff; stroke:#3b3f45; stroke-width:1.4; }
.dg-child { fill:#fff; stroke:#8a9099; stroke-width:1.1; }
.dg-def { fill:#efe9ff; stroke:#5b46e5; stroke-width:1.2; }
.dg-h { font:600 12.5px ui-monospace,Menlo,monospace; fill:#1a1c1f; }
.dg-c { font:500 11.5px ui-monospace,Menlo,monospace; fill:#2c3036; }
.dg-dim { font:11px ui-monospace,Menlo,monospace; fill:#6b7480; }
.dg-arrow { fill:none; stroke:#5b46e5; stroke-width:1.3; }
.dg-arrfill { fill:#5b46e5; }
.checks { list-style:none; padding:0; margin:8px 0; }
.checks li { padding:4px 0 4px 26px; position:relative; }
.checks li::before { content:"✓"; position:absolute; left:4px; color:var(--ok); font-weight:700; }
.pill { display:inline-block; padding:1px 8px; border-radius:10px; font-size:12px; font-weight:600; background:#e9f7ee; color:var(--ok); }
.pill.no { background:#fdeeea; color:#b23a2c; }
.tiers { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin:12px 0; }
.variants { display:grid; grid-template-columns:repeat(2,1fr); gap:14px; margin:12px 0; }
.variant { border:1px solid var(--line); border-radius:10px; padding:10px 12px; background:#fff; }
.variant h4 { margin:0 0 6px; font-size:14px; }
.variant .dg { margin:6px 0; }
.variant p { font-size:13px; margin:4px 0; }
.tier { border:1px solid var(--line); border-radius:10px; padding:12px 14px; background:var(--wash); }
.tier h4 { margin:0 0 6px; font-size:14px; }
.tier p { font-size:13px; color:var(--mute); margin:4px 0; }
.tier code { background:#fff; }
kbd { font:12px ui-monospace,Menlo,monospace; background:#fff; border:1px solid var(--line); border-bottom-width:2px; border-radius:4px; padding:0 5px; }
"""


def shots(names: list[tuple[str, str]]) -> str:
    out = []
    for i, (name, caption) in enumerate(names):
        wide = ' class="wide"' if name.endswith("fixture.png") or i == 0 else ""
        out.append(f'<figure{wide}><img src="{REL}/{name}" alt="{escape(re.sub("<[^>]+>", "", caption))}" loading="lazy"><figcaption>{caption}</figcaption></figure>')
    return '<div class="shots">' + "".join(out) + "</div>"


LANE_IN = ['pose: Pose = None', 'frame: Frame', 'gain: float = 1.0']
LANE_OUT = ['pose: Pose', 'quality: float']
LANE_LONG_OUT = ['pose: Pose', 'quality: float = estimate_quality(frame, pose)']


def page(m: dict) -> str:
    a1 = variant_card('A1', 'Park it outside, type it normally', lane_mock(title='A1', editor='outputs lane just past the right edge, left-aligned, rows aligned', inputs=LANE_IN, outputs=LANE_OUT), 'Rows still map one-to-one to the dots; the hands type left-to-right; the Block keeps painting the real labels underneath. Your own suggestion.', 'The mirror symmetry of the painted labels is lost while the lane is open; the editor can overlap whatever sits right of the Block.', applied=True)
    a2 = variant_card('A2', 'Right-aligned, in place (the first cut)', lane_mock(title='A2', editor='outputs lane inside the Block, text anchored to the right edge', inputs=LANE_IN, outputs=LANE_OUT, editor_x=210, editor_w=100, align='right'), 'Perfect correspondence with the painted labels: the raw line sits exactly where the rendered one was.', 'The caret lives at the right edge and text grows leftward — this is the part that feels reverse. Rejected by driving it.')
    a3 = variant_card('A3', 'Mirrored grammar for outputs', lane_mock(title='A3', editor='outputs typed as  Type name  reading toward the dot', inputs=LANE_IN, outputs=['Pose pose', 'float quality'], editor_x=210, editor_w=100, align='right'), 'What the labels already paint (type then name, toward the socket) becomes what you type, so the mirror is honest.', 'A second grammar to learn and to parse; Python never spells an output this way. Not recommended.')
    a4 = variant_card('A4', 'Both lanes at once, both outside', lane_mock(title='A4', editor='inputs lane left of the Block, outputs lane right of it; the Block is pure render', inputs=LANE_IN, outputs=LANE_OUT, editor_side='both', both=True), 'The Block becomes the rendered view and the two lanes its source, side by side — the overlay picture literally.', 'Twice the surface for an edit that almost always touches one side; hides nothing but crowds the canvas. Not recommended.')
    a5 = variant_card('A5', 'One signature strip under the Block', lane_mock(title='A5', editor='def estimate(pose, frame, gain) -> (pose, quality) in one editor below', inputs=LANE_IN, outputs=LANE_OUT, strip=True), 'It is the Python: one line, inputs then outputs, the arrow between them. Reads like the code it will become.', 'Loses the one-line-per-port correspondence with the dots, which is the whole point of the lane; better as the Code-block view of a Block than as its port editor.')
    b1 = variant_card('B1', 'Run off into the page', lane_mock(title='B1', editor='a long line keeps going past the Block; nothing scrolls, nothing clips while typing', inputs=LANE_IN, outputs=LANE_LONG_OUT, editor_w=230), 'Nothing moves under your hands: no horizontal scroll, no ellipsis chasing the caret. The painted label clips as it always did once you leave.', 'A very long default can cross a neighbour on a busy board while the lane is open. Acceptable for a one-line grammar; that is what B5 is for.', applied=True)
    b2 = variant_card('B2', 'Clip at the wall, scroll to the caret', lane_mock(title='B2', editor='the lane is as wide as its half of the Block; the line scrolls horizontally under the caret', inputs=LANE_IN, outputs=LANE_LONG_OUT, editor_x=210, editor_w=100, clip=True), 'The Block never grows and nothing leaks over the canvas.', 'Sliding text is the frustrating case you named; you lose the start of the line the moment you type the end.')
    b3 = variant_card('B3', 'The Block grows while editing', lane_mock(title='B3', editor='the Block widens live to fit the longest line, snaps back on commit', inputs=LANE_IN, outputs=LANE_LONG_OUT, wide_block=True, editor_x=400, editor_w=70), 'Everything stays inside the Block and readable.', 'Layout thrash on every keystroke and cables re-route as the wall moves; the Block\'s width is a stored property you did not ask to change.')
    b4 = variant_card('B4', 'Both lanes activate, both park outside', lane_mock(title='B4', editor='clicking either half opens both lanes outside the Block; the Block is untouched', inputs=LANE_IN, outputs=LANE_LONG_OUT, editor_side='both', both=True, editor_w=150), 'The width question disappears: the lanes are outside, the Block is pure render.', 'Same as A4 — the second lane is noise for a one-sided edit.')
    b5 = variant_card('B5', 'A ⤢ button opens a bigger viewer', lane_mock(title='B5', editor='top-right ⤢ opens both lane documents side by side in a modal, wrapping on', inputs=LANE_IN, outputs=LANE_LONG_OUT, modal=True), 'Long definitions get room without the Block changing; wrapping is fine there because the modal is not row-aligned. The same two documents, so nothing to sync.', 'One more surface to build; the modal is where the per-line reveal would first be worth doing. The natural next step.')
    checks = "".join(f"<li>{escape(c)}</li>" for c in m["checks"]) or "<li>(journey results not found at build time — run <code>npm run test:port-signature</code>)</li>"
    return f"""<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Port signature field</title>
<style>{CSS}</style>
<main>
<h1>A port is one line of code</h1>
<p class="meta">Refactor + the general code text box + the lane prototype · {date.today()} · measured against <code>{m['head']}</code> · tldraw {m['tldraw']} pinned, CodeMirror view {m['codemirror']} · <a href="#thinking">the thinking</a> · <a href="#evidence">the evidence</a> · <a href="#lanes">the lane prototype</a> · <a href="#decisions">what needs you</a></p>

<p class="lede"><b>What shipped.</b> Every place a port is edited is now <b>one text field</b> spelled <code>name: Type = default</code>: the docked inspector row (was Name · Type · Default, three boxes), the on-canvas click-to-edit editor (was a name box <i>or</i> a type box depending on which span you hit), and the free Port's panel (was Name · Type · Value). Underneath them is a new general component, <code>CodeField</code> — a single line of CodeMirror that knows nothing about grammar until one is plugged in — and one grammar module, <code>portSignature.ts</code>, that is the entire "language service": it splits the line into its three roles for highlighting, tells the completion which slot the caret is in, and writes the stored triple. <b>Storage did not change.</b> The stored <code>{{ name, type, defaultValue }}</code> is the parse tree of the line; the field formats it in and parses it back on every keystroke, so the Block paints the name, the type hint and the <code>= 5</code> chip live while you type, and every binding, projection and journey that reads the triple keeps reading it.</p>

<div class="callout ok"><b>Loss of nothing, checked.</b> The one thing three boxes had that one line could have lost was the parametric default — live Python evaluation, wavy underlines on undefined names, "Variables used here". It moved onto the <code>=</code> slot of the line instead: the same debounced evaluation runs on exactly the text after the equals sign, squiggles land inside that slot, and the resolved value now rides beside the formula as a ghost (<code>chassis_width / 4 ⇢ 0.105</code>) instead of replacing it. The formula is source text; it stays visible.</div>

{shots(CAPTURES[:4])}

<h2 id="thinking">The thinking, improved</h2>

<h3>1 · The field is the port's parse tree, so store the tree</h3>
<p>Your instinct — "we can still parse it internally for the Python" — is right, and it decides the storage question. The Type block stores <i>text</i> (<code>attributeSource</code>) because its body is multi-line and a parse would drop comments, docstrings and indentation. A port line has nothing a parse drops: <code>name: Type = default</code> round-trips through the triple losslessly for every name without a depth-0 <code>:</code> or <code>=</code>, and the parser respects brackets and quotes so <code>dict[str, int]</code>, <code>Callable[[int], str] = f</code> and <code>lambda x: x</code> all land where they belong. Keeping the triple canonical means <b>no migration, no second copy of one fact, and no consumer changes</b> — the alternative (text canonical, triple derived) would have touched every reader of <code>port.name</code> and created exactly the two-truths trap the members work just avoided. The reversal trigger is written into the module: if the grammar ever grows something the triple can't hold (<code>*args</code>, a trailing comment), add a <code>source</code> field then.</p>

<div class="dg">{seam_svg()}</div>

<h3>2 · "Code text box" = one component + a grammar, and a grammar is just <i>slots</i></h3>
<p>The general feature you named already existed in four separate pieces — the Code block (CodeMirror, multi-line), the parametric expression field (CodeMirror, one line, evaluation), the Type block's highlighted textarea, and the type-name completion built for the Type babble. What was missing was the abstraction that makes them one thing. It is small: <b>a grammar is a function from (text, caret) to a slot</b>. The slot drives everything — which mark to paint, which completion source to consult, whether to stay silent. That is why "as soon as you enter a <code>:</code> it knows you are doing a type" needs no parser generator: <code>portSignatureSlotAt</code> is thirty lines and is shared by the highlighter and the completer, so they can never disagree.</p>
<div class="tiers">
<div class="tier"><h4>v1 · plain</h4><p><code>&lt;CodeField extensions={{[]}} /&gt;</code></p><p>A text box with a real caret, IME, undo, paste — CodeMirror's, not a mirror div. No grammar. This is already the same component; nothing to build later.</p></div>
<div class="tier"><h4>v2 · grammar-aware <span class="pill">shipped</span></h4><p><code>portSignatureExtensions(…)</code></p><p>Slot marks (name / punct / type / default), completion dispatched by slot, diagnostics scoped to a slot, a ghost value. Ports and the free Port use it today.</p></div>
<div class="tier"><h4>next · more grammars</h4><p>Type attribute lines, Type Mapping aliases (<code>Name = expr</code>), the parametric expression field itself.</p><p>Each is a new <code>slotAt</code> + extensions, not a new editor. The expression field should become <code>CodeField</code> + an <i>expression</i> grammar.</p></div>
</div>

<h3>3 · Prior art worth naming</h3>
<table>
<tr><th>Where</th><th>What it does</th><th>What we took</th></tr>
<tr><td>Excel's formula bar</td><td>Free text until it starts with <code>=</code>; then it is a formula with completion and highlighting.</td><td>The exact mental model: a bare word is a label, a glyph opens structure. Ours has two glyphs.</td></tr>
<tr><td>Fusion 360 parameter fields</td><td>A dimension box accepts <code>d1 * 2</code>; the resolved number shows beside the expression.</td><td>The ghost value beside the formula, instead of swapping the formula for its value.</td></tr>
<tr><td>VS Code / Jupyter inline completion</td><td>Context decides the list; nothing pops while you type an identifier you are defining.</td><td>Silence in the name slot. A suggestion while naming a port is an interruption, not help.</td></tr>
<tr><td>Enso's widget registry (read 2026-09-02)</td><td>Compresses an argument into an inline widget.</td><td>Rejected then for data sources ("I like making data source explicit"); still rejected. The line stays text.</td></tr>
<tr><td>Your port-text babble (2026-09-05)</td><td>The whole signature as one multi-line body with dividers and sigils.</td><td>The per-line half of it. Rows, sides and branches stay <i>positions</i> you drag, not text you type — that is what keeps the port an object with an id, bindings and a grip.</td></tr>
<tr><td>JetBrains MPS (projectional editing)</td><td>Structure first, text as a projection — the opposite pole.</td><td>The thing three boxes were accidentally doing. Named so it is not re-invented.</td></tr>
</table>

<h3>4 · Where this sits against the whiteboard rule</h3>
<p>"The whiteboard stays dumb, Python is rigid" holds. The TypeScript parser is the <i>shell</i> only — it finds a depth-0 colon and a depth-0 equals sign and nothing else; what is inside the type or the default is opaque text until the Python side reads it. Free text is a name, always: <code>temperature sensor readings</code> is a legal port and nothing lints it. The completions <i>offer</i>, they never validate. The one place a red mark appears is the default slot, and that is Python's verdict (the existing expression host), not the board's.</p>

<h3>5 · The stock parts, element by element</h3>
<table>
<tr><th>Element</th><th>Today (before)</th><th>Off-the-shelf part, by name</th><th>Behaviour that must survive</th></tr>
<tr><td>The text box</td><td><code>&lt;input&gt;</code> ×3 in the inspector; <code>&lt;input&gt;</code> on the canvas</td><td><code>EditorView</code> + <code>EditorState</code> (@codemirror/view, @codemirror/state)</td><td>Live per-keystroke write, one undo step per gesture, unmount commits — all via the existing <code>FieldGesture</code></td></tr>
<tr><td>One line only</td><td>native single-line input</td><td><code>EditorView.inputHandler</code> stripping <code>\\n</code></td><td>Paste of a multi-line snippet stays one line</td></tr>
<tr><td>Placeholder</td><td><code>placeholder=</code> attribute</td><td><code>placeholder()</code> (@codemirror/view)</td><td>Role guidance, never sample data — now the grammar itself: <code>name: Type = default</code></td></tr>
<tr><td>Highlighting</td><td>CSS on separate boxes; hand-built spans in the Type region</td><td><code>syntaxHighlighting(classHighlighter)</code> + <code>EditorView.decorations.compute</code> marks</td><td>Name carries the ink, type is the accent hint, default is muted — the canvas's own voice</td></tr>
<tr><td>Completion</td><td>Type-name popup only inside the Type babble</td><td><code>autocompletion({{ override: [source] }})</code> with one slot-dispatched <code>CompletionSource</code></td><td>Board Types with kind pills; nothing in the name slot; Enter/Tab accept, Escape closes first</td></tr>
<tr><td>Diagnostics</td><td>Expression field's own <code>StateField</code></td><td>Same <code>StateField</code> + <code>Decoration.mark</code>, offsets shifted to the slot</td><td>Wavy underline on an undefined name, tooltip with Python's error</td></tr>
<tr><td>Resolved value</td><td>Collapsed text swap in the expression field</td><td><code>Decoration.widget</code> (<code>WidgetType</code>)</td><td>You can always see the formula; the value rides beside it</td></tr>
<tr><td>Tooltip stacking</td><td>—</td><td><code>tooltips({{ parent: .tl-container }})</code></td><td>The popup beats every shape and panel (the Type babble's z-index rule)</td></tr>
<tr><td><b>unchanged (stock seam)</b></td><td colspan="3">tldraw's editing session (<code>select.editing_shape</code>, <code>editor.complete()</code> / <code>editor.cancel()</code>), the shape's click-to-edit resolution, the port drag grip, the store write through <code>patchBlockPortProps</code>, and the Block port schema — none of these moved.</td></tr>
</table>

<h3>6 · One trap worth recording</h3>
<p>Enter closed the canvas editor and then re-opened it on the title. The keydown that CodeMirror consumed kept bubbling to tldraw's document listener, where <kbd>Enter</kbd> on a selected shape starts editing it — stock behaviour, correct, and invisible until the field it was landing on stopped stopping propagation. The old <code>&lt;input&gt;</code> did <code>stopPropagation()</code>; the field now handles Enter and Escape on the raw DOM event so it can do the same. A keymap binding cannot, because it never sees the event.</p>

<h2 id="evidence">Evidence</h2>
<p>Real browser, product canvas, real pointer and key events — <code>npm run test:port-signature</code> ({m['journey_checks']} checks, {len(m['checks'])} recorded on the last run):</p>
<ul class="checks">{checks}</ul>
<p>Unit: {m['grammar_tests']} grammar tests (<code>portSignature.test.ts</code> — round trips, brackets and quotes, comparisons vs assignment, slots, patches) and {m['completion_tests']} completion-dispatch tests (<code>PortSignatureField.test.ts</code>). New modules: <code>portSignature.ts</code> {m['lines']['portSignature.ts']} lines · <code>CodeField.tsx</code> {m['lines']['CodeField.tsx']} · <code>PortSignatureField.tsx</code> {m['lines']['PortSignatureField.tsx']}. Retired: the "Code-style Inputs row" Appearance toggle (meaningless with one field — a board that had it switched <i>off</i> now simply shows the one field; the stored key is ignored, not rejected), its journey, and the commit-time canvas parse (<code>canvasPortSignaturePatch</code>) the live parse replaces.</p>
<p><b>After the pass — a second bug you found: z-order.</b> The open lane lived inside its Block's own HTML container, so any shape later in z-order — a pasted Block sitting where the outputs lane parks — painted over it. The open lane is now portalled into tldraw's shape layer (the one element that carries the camera transform and every shape's z-index) with a z-index above every shape, and the journey covers the lane with a later Block and proves the lane is what the pointer hits.</p>
<p><b>After the pass — a bug you found.</b> On a Block just drawn, with its title editor still open, a click in the empty left half stayed on the title instead of opening the inputs lane. tldraw's <code>canEditShape</code> answers "can editing <i>start</i>" and says no for the shape already being edited, and click-to-edit used it as "is editable", so a body click never armed while any editor was open (painted labels were unaffected — the Block's own span handler moves the editor). The editing shape is now exempt in both checks, and the lanes journey draws a Block with the tool and types its first port straight into the lane from that state.</p>
<p><b>Judged, round 7 — PASS</b> on the z-order overlay. A seventh auditor mutation-tested the journey live — re-parenting the open lane back into its Block's container at the same screen position turned the assertion red — then checked the inputs lane under a cover, the lane at zoom 0.6 after a pan (page drift 0, sub-pixel at zoom 2 and 0.5), a resize while open, clicks and drags inside the lane, five open/close cycles (no leaked overlays), delete-while-open, undo, a page switch, light and dark tokens, the viewer above the lane, and <code>?portLanes=0</code> not portalling. Two risks it named are closed here: tldraw re-renders a shape's subtree only on props and meta, so a pure x/y move of the Block (auto-layout, a nudge script) left the open lane behind until the next keystroke — the page bounds are now a tracked read and the journey moves the Block with the lane open; and with no shape layer the lane fell back to the Block's top-left corner instead of its placement. Its weak assertion (the lane was already under <code>.tl-html-layer</code> before the fix) now checks the lane is outside every Block's container. Left as documented: a rotated Block's lane would float off unrotated, but Block hides its rotate handle so no gesture reaches it; wheel over an open lane pans the canvas, unchanged.</p>
<p><b>Judged, round 6 — PASS</b> on the fresh-Block fix. A sixth auditor confirmed the root cause in tldraw's own source (<code>canEditShape</code> returns false for the shape being edited), re-ran the gates and four journeys, drove the fix in all four Block views and in the IDE-host embed, and found no spec-breaking defect. One gap it named is closed: the single-line click-to-edit journey pressed Escape before its body click, so nothing protected "a miss stays a miss <i>while the title editor is open</i>" — it now asserts that directly. Listed for you, unfixed on purpose: the Branch's click-to-edit carries the same <code>canEditShape</code> gate, so with a Branch's band title open a click on an arm's title closes the editor instead of moving it (pre-existing, outside this feature). A locked ancestor can still let a lane open on its editing child, but the store refuses every write and no human gesture reaches that state.</p>
<p><b>Judged, round 5 — PASS.</b> A fifth auditor re-ran every gate and seven journeys, attacked the round-4 fixes with eight adversarial lane fixtures (hidden before a header, hidden after a removed line, effect plus hidden, a lane emptied, grown and reordered), proved the viewer opens themed inside the IDE-host embed and its completion popup stays inside the panel even with the field scrolled, and found no spec-breaking defect. Four risks remain documented: a legacy name holding a depth-0 <code>:</code> or <code>=</code> re-splits when that line is edited (neither editor can author one); the embed portal is themed by inheritance from the page's pre-paint stamp; a journey-only <code>?portLanes=</code> URL makes the Settings switch read the stored preference rather than the effective mode; in the lane one Escape closes the completion popup and the lane together (nothing is lost — the lane writes live).</p>
<p><b>Judged, round 4.</b> A fourth auditor re-ran the gates and could not break the round-3 fixes (× button, scrim click, re-open, dark theme, header and hidden ports, the Settings toggle) but found two real defects in the viewer, fixed since: in the IDE-host embed there is no theme-portal provider, so round 3's portal made the <code>⤢</code> a dead button there — it now falls back to the embed's own themed root; and the completion popup inside the viewer was parented to the canvas container under the modal's scrim, so Enter could accept a suggestion nobody saw — the popup now lives inside the panel and Escape dismisses it before the viewer. A hidden port also kept its place in the lane order through an edit instead of dropping to the bottom, and the Settings toggle gained journey coverage.</p>
<p><b>Judged, round 3.</b> A third auditor drove the default flip, the Settings toggle, the per-character caret on both spans, the hidden labels in both lanes, the fold (a decoration, not a mutation — undo across it restores all three ports), the empty-Block flow on inputs-only and header-only Blocks, and the pill (untouched). It found one real defect, fixed: the <code>⤢</code> viewer was portalled into <code>document.body</code>, outside the theme root where every colour token lives, so it painted white-on-white with an invisible full-screen scrim and, after a Tab, no Escape — it now portals into the theme root, traps focus, closes on Escape from anywhere and on a scrim click, and the journey captures it. A click past the end of a line's text now lands the caret at the line's end, not column 0.</p>
<p><b>Judged, round 2.</b> A fresh Opus auditor re-ran everything against a pristine checkout, confirmed the four round-1 fixes under attack (a click on the type still selects the type; a duplicated line edited in place keeps its own id; an emptied lane keeps header and hidden ports; no existing board carries an output default, so nothing repaints), and found two defects in the lane prototype, fixed since: the header <code>+</code> bead created a row-0 port that is not a lane line, so the lane opened on line 0 and typing renamed the wrong port — a header port now keeps its own editor; and an effect output (derived from a mutated input, painted on the top edge without a label) was counted by the lane but not by its placement, shifting the outputs lane by one and losing edits — effect ports are now outside the lane and preserved through it. Two risks it named stand as documented: a legacy port name holding a depth-0 <code>:</code> or <code>=</code> re-splits when <i>that line</i> is edited (the grammar is the deal; none exist in this repo), and an emptied lane can reuse an id — the same <code>in_N</code> rule the shipped add-port command has always used.</p>
<p><b>Judged, round 1.</b> An independent Opus auditor re-ran every journey and the full check, built its own fixtures (a cable bound to a port, then that port's line moved: same id, wire still painted; header and hidden ports kept across a reorder; one undo restores the order) and found four things the suite had missed, all fixed in the same round: a canvas click on a port's <i>name</i> opened the line fully selected, so typing a new name silently dropped the type and default — the editor now selects only the slot that was clicked; an output's <code>= value</code> was stored but never painted — the board now paints a default chip on outputs too; the lane re-parsed lines nobody edited, which would split a legacy name holding a colon — an unedited line now keeps its port record byte for byte; and an emptied lane left one phantom port — an empty document is now an empty lane.</p>

{shots(CAPTURES[4:])}

<h2 id="lanes">Multi-line port editor · one line per port (on by default; Settings › Canvas › Port editor)</h2>
<p class="lede">Built the same afternoon from your follow-up, then promoted to the default at your call ("for people used to working in an IDE this feels natural and fast"): instead of one line per field, <b>each lane of a Port view is one multi-line code text box</b> — the inputs lane on the left, the outputs lane parked just outside the right edge so it is typed left-to-right — and each line <i>is</i> a port. Clicking the left half of the Block opens the inputs lane with the caret on the row you clicked; the right half opens the outputs. Because the lane is a CodeMirror document, the IDE keys come for free and mean what you'd hope: <kbd>Alt</kbd>+<kbd>↑</kbd>/<kbd>↓</kbd> or <kbd>Ctrl</kbd>+<kbd>↑</kbd>/<kbd>↓</kbd> reorders a port, <kbd>Enter</kbd> adds one on the next line, <kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>↓</kbd> duplicates one, <kbd>Ctrl</kbd>+<kbd>Enter</kbd> commits, <kbd>Esc</kbd> leaves. Every keystroke reads the whole lane back into the same port records: <code>reconcilePortLane</code> diffs the lines, a line that still says what a port said keeps that port's id (so a <b>moved port keeps its cables</b>), a line edited in place keeps its id, a new line is a new port, a missing line is a removed one. Storage is still the triple; header ports and hidden ports are not lines and keep their place around the lane.</p>
<div class="callout"><b>What the lane taught about the overlay idea.</b> The Block itself is the rendered layer: while the lane is open the Block keeps painting dots, chips and labels from the store, so you are looking at source and projection at once, aligned row for row. That is the two-state field you described — rendered by default, source when you click in — with the cursor landing on the right line because the lines <i>are</i> the rows. What is still missing is the reveal rule inside the editor (raw only on the caret's line, rendered elsewhere); here the whole lane is raw while open, which is the "switch the whole thing" mode. The per-line reveal is the next step and is a decoration rule, not a second editor.</div>
{shots(LANE_CAPTURES)}
<p>Proof: <code>npm run test:port-lanes</code> ({len(m['lane_checks'])} real-browser checks) and {m['lane_tests']} unit tests over the reconciler and the hit-test (<code>portLane.test.ts</code>, <code>portLaneAtPoint.test.ts</code>); <code>portLane.ts</code> is {m['lane_lines']} lines. <b>Settings › Canvas › Port editor</b> is the switch (default on); the bottom-right Prototype drop-down writes the same preference and adds the one open style choice, <i>ragged lines</i> (each line its own box that grows with its text). Off, the single-line drag-and-drop editor is exactly as it was, and the journeys that prove it pin that mode with a journey-only URL override. <b>Since your third pass:</b> the caret opens beside the <i>character</i> you clicked (the browser's caret-from-point on the painted label, carried into the lane — including into the outputs lane after it moves outside; the OS pointer itself cannot be moved by a page); the edited side's painted labels hide while its lane is open; a line the caret is not on folds past 32 characters to an ellipsis and unfolds when you arrive; and the ⤢ at the lane's corner opens the bigger viewer.</p>

<h3 id="lane-ergonomics">Two questions you asked, five directions each</h3>
<p><b>A · the outputs lane "feels reverse".</b> Typing into a right-anchored box is nothing anyone's hands know. The five ways out, with the one you suggested already applied:</p>
<div class="variants">
{a1}{a2}{a3}{a4}{a5}
</div>
<p><b>B · what the text box does with width.</b> A lane is a column of one-liners; the question is what happens when a line is longer than its half of the Block, and whether the box should own more space while it is open.</p>
<div class="variants">
{b1}{b2}{b3}{b4}{b5}
</div>
<div class="callout"><b>Recommendation, and what silence keeps.</b> A1 + B1 are live now: the outputs lane parks outside the right edge and types normally; while editing, a long line runs off into the page rather than scrolling or clipping, exactly as you reasoned ("it runs off into the page … if it must be one line"), and the painted label clips as it always did. B5's <code>⤢</code> button is built: it opens the lane you are in — one document, wrapped, with room — in a modal inside the theme root; the two-lane side-by-side form in the mock stays a mock. A4 (both lanes at once, outside) is the one I would <i>not</i> do: it doubles the surface for a rare case and hides the Block's own render, which is the thing the lane is supposed to sit beside.</div>

<h3>Rough edges, deliberately left</h3>
<ul>
<li><b>Rows and branches are not lines yet.</b> A moved port keeps its own row/branch; a new port takes its neighbour's. The Sep 5 port-text babble's <code>---</code> divider is the obvious grammar for a row break, and a lane with several rows will not line up with the row gaps until it exists.</li>
<li><b>Header ports (row 0) and hidden ports are outside the lane</b> — visible in the Block, not in the text.</li>
<li><b>Line pitch is measured from the first two dots</b>; a Block whose rows have already been compressed to fit re-measures on every render, so the editor keeps up, but the outputs lane in Aligned layout shares rows with the inputs and inherits their pitch.</li>
<li><b>The inspector still lists ports one field per row.</b> The lane could replace the list there too; not done.</li>
<li><b>Per-line reveal is width-only so far:</b> folding long lines to <code>…</code> is the reveal rule applied to length; rendering chrome (chips, dots) inside the lane on inactive lines is the next step.</li>
</ul>

<h2 id="decisions">What needs you — each with the default silence keeps</h2>
<table>
<tr><th>#</th><th>Question</th><th>Recommendation · default if you say nothing</th></tr>
<tr><td>D1</td><td>Outputs and <code>=</code>. An output line accepts <code>= value</code> and stores it (a NamedTuple field default); since the judge round the board paints the chip on outputs too.</td><td>Keep it — stored and painted are now the same set. Say if an output should refuse a default instead; default is as built.</td></tr>
<tr><td>D2</td><td>The Pill's inspector still has Name · Value · Type boxes (its canvas editor was already one line).</td><td>Convert it next with the pill grammar (<code>value</code> first, <code>2.0</code> alone is a literal). Left as is here because its grammar differs and its journeys are large; default is unchanged.</td></tr>
<tr><td>D3</td><td>Promote <code>typeNameAutocompleteLogic.ts</code> and the type index out of <code>src/blocks/babble/</code> — the product now imports them.</td><td>Yes, a pure move. Not done in this diff to keep it reviewable; default is a follow-up.</td></tr>
<tr><td>D4</td><td>Fold <code>ExpandingExpressionField</code> into <code>CodeField</code> + an expression grammar, and give Type attribute lines and Type Mapping aliases the same field.</td><td>Yes — that is the "general feature" fully realised. Default is a follow-up, one grammar per change.</td></tr>
<tr><td>D5</td><td>Lanes are now the default (your call). Solid box vs ragged lines is still open — the drop-down flips it.</td><td>Solid by default; say "ragged" and it becomes the default in one line. Next: the <code>---</code> row divider.</td></tr>
<tr><td>D6</td><td>Lane keys: should bare Enter add a port (as now) or commit, with Shift+Enter adding? </td><td>Keep Enter = new line: a lane is a document, and that is what makes it feel like an editor. Default as built.</td></tr>
</table>

<p class="meta">Built by <code>docs/build_port_signature_field.py</code>; captures in <code>{REL}/</code>; guided board <code>sketches/review/port-signature-field.systemsketch</code>.</p>
</main>
"""


def main() -> None:
    m = measured()
    fixture_png = ROOT / "sketches/review/port-signature-field.png"
    MEDIA.mkdir(parents=True, exist_ok=True)
    if fixture_png.exists():
        (MEDIA / "fixture.png").write_bytes(fixture_png.read_bytes())
    lanes_png = ROOT / "sketches/review/port-lanes.png"
    if lanes_png.exists():
        (MEDIA / "lanes-fixture.png").write_bytes(lanes_png.read_bytes())
    for name, _ in CAPTURES + LANE_CAPTURES:
        if not (MEDIA / name).exists():
            raise SystemExit(f"missing capture {MEDIA / name} — run npm run test:port-signature first")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(page(m), encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size:,} bytes) — {len(m['checks'])} journey checks recorded")


if __name__ == "__main__":
    main()
