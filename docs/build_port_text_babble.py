#!/usr/bin/env python3
"""Build the Port text-authoring babble report — a /babble-shaped exploration
of applying the Type attribute-body primitive's flat-text idea to authoring a
Block's OWN `inputs`/`outputs`.

Four proposals, gated behind `shape.meta.portTextBabbleVariant` (never set on
an ordinary board), each a real Block instance with a real parser/writer that
round-trips into `props.inputs`/`props.outputs` — driven and screenshotted in
an actual browser (`tests/port_text_babble_smoke.mjs`), not a synthetic mock.

Follows the babble skill's disclosure order: brief, frozen criteria/gates,
unranked variant atlas, then the AI prune (scores, ranking, decision hinge).
Numbers are measured live from the tree so this report cannot drift from the
code it describes.
"""
from __future__ import annotations

import base64
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "port-text-babble-2026-09-05.html"


def image_uri(relative: str) -> str:
    path = ROOT / relative
    if not path.exists():
        raise RuntimeError(f"missing capture: {relative}")
    return f"data:image/png;base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


def need(path: Path, *tokens: str) -> None:
    source = path.read_text(encoding="utf-8")
    missing = [token for token in tokens if token not in source]
    if missing:
        raise RuntimeError(f"{path.relative_to(ROOT)} is missing {missing!r}")


def main() -> None:
    results_path = ROOT / "docs/assets/port-text-babble.json"
    if not results_path.exists():
        raise RuntimeError(f"missing proof artifact: {results_path.relative_to(ROOT)}")
    results = json.loads(results_path.read_text(encoding="utf-8"))
    passed = sum(1 for check in results if check["ok"])

    # Facts asserted directly against the live tree, so this report cannot
    # drift from the code it describes.
    need(ROOT / "src/blocks/babble/portTextShared.ts",
         "reconcilePortLane", "applyParsedPortText", "isRestrictedDefaultExpr", "applyDivider")
    need(ROOT / "src/blocks/ui/BlockCanvas.tsx", "portTextBabbleVariant", "PortTextBabbleRegion")
    for variant in range(1, 5):
        need(ROOT / f"src/blocks/babble/PortTextBabbleV{variant}.tsx", f"port-text-babble-v{variant}")
    grammar_loc = sum(
        len((ROOT / f"src/blocks/babble/{name}").read_text(encoding="utf-8").splitlines())
        for name in (
            "portTextShared.ts", "portTextGrammarTwoLane.ts", "portTextGrammarSigil.ts",
            "portTextGrammarKeywords.ts", "usePortTextToggleEditor.ts",
        )
    )
    unit_tests = len([
        line for line in (ROOT / "src/blocks/babble/portTextGrammar.test.ts").read_text(encoding="utf-8").splitlines()
        if line.strip().startswith("it(")
    ])

    checklist = "".join(
        f'<li class="{"pass" if check["ok"] else "fail"}"><b>{check["id"]}</b> {check["label"]}</li>'
        for check in results
    )

    v1_shot = image_uri("docs/assets/port-text-babble-v1.png")
    v2_shot = image_uri("docs/assets/port-text-babble-v2.png")
    v3_shot = image_uri("docs/assets/port-text-babble-v3.png")
    v4_shot = image_uri("docs/assets/port-text-babble-v4.png")
    fixture_shot = image_uri("sketches/review/port-text-babble.png")

    criteria = [
        {"name": "Model fidelity", "weight": 25,
         "why": "The ask was explicit: never invent a grammar the real BlockPort/blockPortSections model can't hold. row/branch/header are the only structural vocabulary that exists.",
         "anchors": "5 = every construct maps onto a real, named model concept (HEADER_ROW, row, branch) with no invented mechanism · 3 = mostly faithful, one soft edge (e.g. independent per-lane counters) · 1 = invents new persisted semantics the schema can't represent"},
        {"name": "Round-trip fidelity / cable safety", "weight": 25,
         "why": "This is not a syntax-highlighted mockup — a real parser+writer that can silently sever a cable on a careless rename would make the surface actively dangerous to use.",
         "anchors": "5 = verified live: rename preserves id, add/delete are correct, effect ports excluded cleanly · 3 = round-trips structurally but loses some incidental port data · 1 = text→ports is lossy or simulated"},
        {"name": "Side / branch legibility", "weight": 20,
         "why": "Zach's sketch left input-vs-output unmarked; each variant has to resolve that honestly against the real model's own input/output/branch constraints.",
         "anchors": "5 = side and row/branch are unambiguous and structurally enforced · 3 = correct but requires author discipline to keep two things in sync · 1 = ambiguous or silently wrong in a common case"},
        {"name": "Authoring speed / bulk-edit ergonomics", "weight": 15,
         "why": "Bulk renaming/retyping many ports at once is the entire point of this primitive — a text mode that is not faster than the form list has no reason to exist.",
         "anchors": "5 = one flat pass, minimal repeated syntax · 3 = some repeated ceremony (switching sections/lanes) · 1 = as slow as or slower than the form list"},
        {"name": "Read-view clarity", "weight": 10,
         "why": "The read view is what you see 99% of the time — it has to scan cleanly, matching the sketch's bullet/name/type/pill/hairline language.",
         "anchors": "5 = a distinctive, well-justified visual answer to what a bullet/hairline should mean · 3 = readable but generic · 1 = cluttered or ambiguous"},
        {"name": "Interaction-model robustness", "weight": 5,
         "why": "A toggle vs. always-live editor trades discoverability against runtime cost; worth a small, honest weight rather than ignoring it.",
         "anchors": "5 = listener/lifecycle cost scoped tightly to when it matters · 3 = standard toggle, well-understood cost · 1 = a global cost that scales with board size"},
    ]
    gates = [
        "Never invents a third persisted mechanism beyond row/branch to signal structure",
        "Never silently discards authored text — an out-of-subset default is flagged, not dropped",
        "Effect ports (derived from mutates) are never shown or editable as authored text",
        "Reachable only behind shape.meta.portTextBabbleVariant — zero surface on an ordinary board",
        "Does not modify the existing Type-attribute or Type-Mapping babbles",
    ]

    variants = [
        {
            "id": "v1", "name": "Two Lanes", "accent": "#4d8dff",
            "thesis": "The safest, most literal reading: side is which HALF of the document you're in — mirrors BlockInspector's own separate Inputs/Outputs sections exactly, so there is nothing new to learn about what a line means.",
            "grammar": "pose: Pose = 10\nwindow: int\n=== outputs ===\nresult: float\n--- error\nmessage: str",
            "image": v1_shot,
            "caption": "Toggle UI/Source; the read view stacks INPUTS then OUTPUTS with a full-width hairline between rows and an “arm N” badge for a branch. Bullet = CONNECTED (filled when a real cable is attached to that port).",
            "notes": [
                "Side signal: a fixed === outputs === marker splits the doc into two independent divider streams.",
                "Best when: the two-list mental model already in BlockInspector should carry over unchanged.",
                "Loses when: input row 2 and output row 2 must visually line up — the two counters can drift (proven live: docs test “two-lane: independent per-lane counters…”).",
            ],
        },
        {
            "id": "v2", "name": "Single List, Sigil", "accent": "#e0a92f",
            "thesis": "Closest to Zach's own sketch — ONE flat list, not two — at the cost of one leading glyph per line: “&gt;” flows into the Block (input), “&lt;” flows out (output), the same arrowheads a cable itself draws.",
            "grammar": "> pose: Pose = 10\n---\n> window: int\n< result: float\n--- error\n< message: str",
            "image": v2_shot,
            "caption": "One unified list; bullet = DIRECTION (filled = output, hollow = input), matching the sigil right beside it. This is the one grammar where an input and output between the same two dividers land in the SAME row without any author discipline — verified live.",
            "notes": [
                "Side signal: a per-line sigil in a single shared divider stream, so row is genuinely shared between lanes.",
                "Best when: the flat, single-column reading of the sketch matters more than avoiding a new glyph.",
                "Loses when: a long interleaved list makes tracking the sigil per line more work than two short lists.",
            ],
        },
        {
            "id": "v3", "name": "Section Keywords, Strict", "accent": "#b46bff",
            "thesis": "Leans into the literal reading of the sketch's own “data_in:” line — a reserved inputs:/outputs: keyword switches lane, sharing ONE row counter across as many toggles as the author writes. Also the strict variant: an out-of-subset default gets a live wavy-underline flag plus a diagnostics banner, never silent tolerance.",
            "grammar": "inputs:\npose: Pose = 10\nrandom: MyComponent = Component(var=0.1)\noutputs:\nresult: float",
            "image": v3_shot,
            "caption": "Columnar read view keyed to the REAL portLayout style prop (inline = two columns, offset = stacked) — the only variant whose layout follows an existing product setting. Bullet = VISIBLE (the port's own visible flag).",
            "notes": [
                "Side signal: inputs:/outputs: keyword lines toggle lane any number of times, one shared counter throughout.",
                "Best when: precise control over row/branch across a long, re-entrant document, plus a strict guardrail on defaults, matters.",
                "Loses when: the repeated keyword ceremony costs more keystrokes than V1/V2 for a short, simple Block.",
            ],
        },
        {
            "id": "v4", "name": "Always-Live Hybrid", "accent": "#3fa46a",
            "thesis": "Same two-lane grammar as V1 — this variant's axis is the INTERACTION MODEL, not the grammar. There is no [UI | Source] toggle at all: a read-only preview and the live CodeMirror document sit stacked, always both on screen, the preview re-rendering on every keystroke from the unsaved draft.",
            "grammar": "pose: Pose = 10\nwindow: int\nnewinput: str\n=== outputs ===\nresult: float",
            "image": v4_shot,
            "caption": "No mode to enter or leave; commit still happens on click-away so undo history isn't spammed per keystroke. Proven live: the preview reflects the unsaved draft (“newinput” visible) before any commit, and updates to real ports only once you click away.",
            "notes": [
                "Side signal: identical two-lane grammar to V1.",
                "Best when: even one click to \"enter edit mode\" is one click too many, and the raw text should always be in view.",
                "Loses when: a board carries MANY V4 instances — each mounts its own permanent, board-wide outside-click listener (see Interaction-model score and the finding below).",
            ],
        },
    ]

    def variant_card(v: dict) -> str:
        notes = "".join(f"<li>{note}</li>" for note in v["notes"])
        return f"""
    <article class="panel variant" style="--accent:{v['accent']}">
      <h2><span class="tag">{v['id'].upper()}</span> {v['name']}</h2>
      <p class="thesis">{v['thesis']}</p>
      <pre>{v['grammar']}</pre>
      <img class="shot" src="{v['image']}" alt="{v['name']} state">
      <p class="caption">{v['caption']}</p>
      <ul class="notes">{notes}</ul>
    </article>"""

    cards = "".join(variant_card(v) for v in variants)
    criteria_rows = "".join(
        f'<tr><td>{c["name"]}</td><td class="w">{c["weight"]}%</td><td>{c["why"]}</td><td class="anchors">{c["anchors"]}</td></tr>'
        for c in criteria
    )
    gate_items = "".join(f"<li>{g}</li>" for g in gates)

    # ---- AI prune: scores frozen against the criteria above, evidence-backed ----
    scores = {
        "v1": {"Model fidelity": 5, "Round-trip fidelity / cable safety": 5, "Side / branch legibility": 4,
               "Authoring speed / bulk-edit ergonomics": 4, "Read-view clarity": 4, "Interaction-model robustness": 4},
        "v2": {"Model fidelity": 4, "Round-trip fidelity / cable safety": 5, "Side / branch legibility": 5,
               "Authoring speed / bulk-edit ergonomics": 5, "Read-view clarity": 4, "Interaction-model robustness": 4},
        "v3": {"Model fidelity": 4, "Round-trip fidelity / cable safety": 5, "Side / branch legibility": 4,
               "Authoring speed / bulk-edit ergonomics": 3, "Read-view clarity": 5, "Interaction-model robustness": 4},
        "v4": {"Model fidelity": 5, "Round-trip fidelity / cable safety": 5, "Side / branch legibility": 4,
               "Authoring speed / bulk-edit ergonomics": 4, "Read-view clarity": 3, "Interaction-model robustness": 2},
    }
    weight_by_name = {c["name"]: c["weight"] for c in criteria}
    totals = {}
    for vid, row in scores.items():
        totals[vid] = round(sum(weight_by_name[name] * score for name, score in row.items()) / 5, 1)
    ranked = sorted(totals.items(), key=lambda kv: kv[1], reverse=True)

    def score_table() -> str:
        header = "<tr><th>Criterion</th>" + "".join(f"<th>{v['id'].upper()}</th>" for v in variants) + "</tr>"
        rows = ""
        for c in criteria:
            cells = "".join(f"<td>{scores[v['id']][c['name']]}</td>" for v in variants)
            rows += f"<tr><td>{c['name']} <span class='w'>({c['weight']}%)</span></td>{cells}</tr>"
        total_row = "<tr class='total'><td>Weighted total</td>" + "".join(f"<td>{totals[v['id']]}</td>" for v in variants) + "</tr>"
        return f"<table class='scores'>{header}{rows}{total_row}</table>"

    rank_list = "".join(
        f"<li><b>{vid.upper()}</b> — {totals[vid]}</li>" for vid, _ in ranked
    )

    document = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Port text-authoring babble · 4 proposals · SystemSketch</title>
<style>
:root {{ color-scheme:dark; --ink:#f5f7fb; --muted:#aab4c6; --line:#2d384b; --blue:#5aa7ff; --green:#62d58b; --red:#ff8a8a; --amber:#e0a92f; --card:linear-gradient(145deg,#121b29,#0d1420); }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:#0a0f18; color:var(--ink); font:15px/1.55 Inter,ui-sans-serif,system-ui,sans-serif; }}
main {{ width:min(1180px,calc(100% - 32px)); margin:auto; padding:56px 0 76px; }}
h1 {{ font-size:clamp(30px,5vw,52px); line-height:1.08; letter-spacing:-.04em; margin:12px 0 22px; max-width:920px; }}
h2 {{ font-size:22px; margin:0 0 10px; letter-spacing:-.02em; display:flex; align-items:center; gap:10px; }}
h3 {{ font-size:16px; margin:22px 0 8px; color:#d9e0ec; }}
p {{ color:var(--muted); max-width:80ch; }}
.eyebrow {{ color:var(--blue); font-size:12px; font-weight:800; letter-spacing:.16em; text-transform:uppercase; }}
.lead {{ font-size:18px; color:#d9e0ec; max-width:920px; }}
.metrics {{ display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin:30px 0 46px; }}
.metric,.panel {{ border:1px solid var(--line); background:var(--card); border-radius:16px; }}
.metric {{ padding:16px; }}
.metric b {{ display:block; font-size:26px; }}
.metric span {{ color:var(--muted); font-size:13px; }}
.panel {{ padding:22px; margin:18px 0; overflow:hidden; }}
pre {{ margin:14px 0 0; padding:14px; overflow:auto; border-radius:10px; background:#050a12; color:#dceafb; font:12.5px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace; white-space:pre; }}
.shot {{ width:100%; border-radius:10px; border:1px solid var(--line); margin-top:12px; }}
.caption {{ margin:8px 2px 16px; font-size:13px; color:var(--muted); }}
.tag {{ font-size:11px; font-weight:800; letter-spacing:.08em; padding:3px 8px; border-radius:999px; background:color-mix(in srgb, var(--accent) 24%, transparent); color:var(--accent); }}
.variants {{ display:grid; grid-template-columns:1fr; gap:0; }}
.variant {{ border-top:4px solid var(--accent); }}
.thesis {{ color:#d9e0ec; font-size:15px; }}
ul.notes {{ padding-left:20px; margin:8px 0 0; color:var(--muted); font-size:13.5px; }}
ul.notes li {{ margin:6px 0; }}
ul.checks {{ list-style:none; margin:0; padding:0; columns:2; column-gap:24px; }}
ul.checks li {{ margin:0 0 8px; font-size:13.5px; break-inside:avoid; }}
ul.checks li.pass b {{ color:var(--green); }}
ul.checks li.fail b {{ color:var(--red); }}
ul.gates {{ margin:8px 0 0; padding-left:20px; color:#d9e0ec; font-size:14px; }}
ul.gates li {{ margin:6px 0; }}
table.criteria, table.scores {{ width:100%; border-collapse:collapse; margin-top:10px; font-size:13.5px; }}
table.criteria td, table.scores td, table.scores th {{ border-top:1px solid var(--line); padding:8px 10px; vertical-align:top; text-align:left; }}
table.criteria td.w, table.scores td {{ text-align:center; white-space:nowrap; }}
table.scores th {{ text-align:center; color:var(--blue); }}
table.criteria td.anchors {{ color:var(--muted); font-size:12.5px; }}
table.scores tr.total td {{ font-weight:800; border-top:2px solid var(--blue); }}
.w {{ color:var(--amber); font-weight:700; }}
ol.rank {{ font-size:15px; padding-left:22px; }}
ol.rank li {{ margin:6px 0; }}
code {{ color:#b9dcff; background:#111b29; padding:2px 6px; border-radius:6px; }}
.hinge {{ border-left:3px solid var(--amber); padding:4px 0 4px 14px; color:#d9e0ec; }}
.footer {{ margin-top:36px; padding-top:20px; border-top:1px solid var(--line); font-size:13px; color:var(--muted); }}
@media (max-width:820px) {{ .metrics {{ grid-template-columns:1fr 1fr; }} ul.checks {{ columns:1; }} table.scores {{ font-size:12px; }} }}
</style>
</head>
<body>
<main>
  <div class="eyebrow">SystemSketch · Dev-only babble · 5 September 2026</div>
  <h1>Four faces for authoring a Block's own ports as flat text.</h1>
  <p class="lead">Zach looked at the Type attribute-body primitive — a flat <code>name: type = value</code> grammar with a UI/Source toggle and live syntax highlighting — and asked for the same idea applied to a Block's <code>inputs</code>/<code>outputs</code>. His own sketch used a Markdown-inspired <code>---</code>/<code>---Label</code> divider vocabulary but left input-vs-output unmarked and punted on how cables would render ("that is why you have the other views"). This report freezes the criteria BEFORE building, then scores four genuinely orthogonal variants against them — never a single committed spec.</p>

  <section class="metrics" aria-label="Measured results">
    <div class="metric"><b>{passed} / {len(results)}</b><span>real-browser checks passed</span></div>
    <div class="metric"><b>4</b><span>orthogonal proposals</span></div>
    <div class="metric"><b>{grammar_loc}</b><span>lines of shared grammar/writer/hook code</span></div>
    <div class="metric"><b>{unit_tests}</b><span>unit tests on the parser/writer/reconciler</span></div>
  </section>

  <section class="panel">
    <h2>The prototype boundary</h2>
    <p>Every variant stores its canonical state in the REAL, shipped <code>props.inputs</code>/<code>props.outputs</code> — nothing new is added to <code>BLOCK_SHAPE_PROPS</code>. The text you see in Source mode is a transient projection, regenerated fresh from the live ports every time you enter it, then parsed back through an id-preserving reconciler on commit. This is what the sibling Type-babble's "not simulated" discipline means applied to a two-array (not one-string) field: a real parser, a real writer, exercised against real Block shapes on a real board, never a static mock.</p>
    <p>Out of scope for all four, by design: authoring <code>visible</code>, <code>mutates</code>/effect ports (derived, never shown), <code>semanticRole*</code>, <code>link</code>, or <code>variadic</code> through text — all are preserved silently across an edit, never exposed as syntax. Function/method-signature semantics for a named divider (Zach's own "maybe not, idk") were explicitly excluded.</p>
  </section>

  <section class="panel">
    <h2>Frozen criteria — decided before any variant was built</h2>
    <table class="criteria">
      <tr><th>Criterion</th><th>Weight</th><th>Why it matters here</th><th>1 / 3 / 5 anchors</th></tr>
      {criteria_rows}
    </table>
    <h3>Hard gates (pass/fail, never blended into the score)</h3>
    <ul class="gates">{gate_items}</ul>
  </section>

  <section class="panel">
    <h2>Resolving the four ambiguities Zach's sketch left open</h2>
    <p><b>1 — Input vs output.</b> Never inferred from an implicit rule the real model can't back: header (row 0) is INPUT-ONLY per <code>portInHeader</code>/<code>HEADER_ROW</code>, and branch is OUTPUT-ONLY per the model's own <code>branch</code> field. Each variant picks an explicit signal — which half of the document (V1), a leading <code>&gt;</code>/<code>&lt;</code> (V2), or a keyword section (V3/V4 reuses V1's).</p>
    <p><b>2 — Round-trip fidelity.</b> A real two-pass reconciler (<code>reconcilePortLane</code>) matches parsed lines back to existing ports by exact name first, then by ordinal position among what's left — so a pure retype (same position, new name) keeps its id and any attached cable, while a genuinely new/deleted line gets a fresh id or vanishes. Verified live in all four variants (see the checklist below); the one deliberately destructive edit is deleting a line, exactly as destructive as deleting a row in the existing form list.</p>
    <p><b>3 — What a divider maps to.</b> Exactly three spellings, each a real named concept in <code>blockModel.ts</code>: bare <code>---</code> advances to the next ROW; <code>---header</code> (inputs only) jumps to <code>HEADER_ROW</code>; any OTHER label opens a new BRANCH — output-only, so on the input lane it degrades to a plain, unpersisted section heading. No fourth mechanism was invented for "just a label."</p>
    <p><b>4 — Default expressions.</b> V1/V2/V4 accept any Python-shaped text verbatim (matching the Type babble's own treatment of values). V3 additionally validates against a restricted literal/keyword-call subset and flags anything outside it live — with a wavy underline AND a diagnostics-banner entry — while still storing the exact authored text. A bare no-arg call like <code>f()</code> is deliberately still IN the subset (no less restricted than one keyword arg); <code>1 + 2</code> and a nested call are OUT.</p>
  </section>

  <section class="panel">
    <h2>Real-browser proof — {passed}/{len(results)} checks, plus a review board</h2>
    <img class="shot" src="{fixture_shot}" alt="Generated review board with all four variants and numbered walkthrough cards">
    <p class="caption">The generated review board (<code>sketches/review/port-text-babble.systemsketch</code>) — four real Block instances, one shared Pose Type block for live autocomplete, and four numbered walkthrough cards. Re-verified by reopening the SAVED file cold in a fresh app instance and confirming Source mode still opens correctly from disk.</p>
    <ul class="checks">{checklist}</ul>
    <p class="caption">Along the way, seeding four test Blocks with the SAME title collided with this app's own Definition Linking feature (same-titled, same-shaped Blocks with no explicit <code>definitionId</code> sync as occurrences of one definition) — a real product behavior, not a bug in this babble; the fix was giving each test/review Block its own title and <code>definitionId</code>.</p>
  </section>

  <section class="variants">{cards}</section>

  <section class="panel">
    <h2>AI prune — scores, ranking, and the decision hinge</h2>
    <p>Evidence is <b>is</b> (the proof above); the weights, scores, and recommendation below are AI <b>judgment</b>, applied only after every variant existed and was driven live. All four variants pass every hard gate — none is excluded from winning.</p>
    {score_table()}
    <h3>Ranking</h3>
    <ol class="rank">{"".join(f"<li><b>{vid.upper()}</b> — {total}</li>" for vid, total in ranked)}</ol>
    <p>V2 (Sigil) and V1 (Two Lanes) are within 3 points of each other — <b>co-leaders, a fragile recommendation</b>, not a clean win. V2 wins on legibility and speed because row is genuinely shared and the list never splits; V1 wins on being the least novel, since it needs zero new glyph beyond the divider Zach's own sketch already used.</p>
    <p class="hinge"><b>Decision hinge:</b> the whole ranking turns on how much a NEW per-line glyph (V2's <code>&gt;</code>/<code>&lt;</code>) costs against a two-list split that already exists in <code>BlockInspector</code> (V1). If Zach wants zero new visual vocabulary, V1 is the clear pick. If the flat, single-list reading of his own sketch is the actual point, V2 wins outright. V3 is the strongest READ view (columnar, keyed to a real style prop) but the most verbose to type; V4's always-live idea is real and proven, but its global per-instance listener is a genuine, measured cost on a board with many such Blocks — the weakest of the four on interaction-model robustness alone.</p>
  </section>

  <section class="panel">
    <h2>Deliberately left unresolved for Zach</h2>
    <ul class="notes">
      <li>Which bullet-meaning matters most day to day — CONNECTED (V1), DIRECTION (V2), or VISIBLE (V3) — was answered three different, honest ways rather than picked for him.</li>
      <li>Whether a named divider's LABEL text should ever be persisted (today it's discarded on write; re-opening Source after a round trip always shows a generic <code>--- arm N</code>, never the author's chosen word).</li>
      <li>Whether <code>visible</code> and effect/mutates authoring belong in text at all, or should stay form-list-only forever.</li>
      <li>Where this surface should actually live in the UI — these prototypes render inline on the Block's own canvas body (mirroring the Type-babble precedent) rather than inside the <code>BlockInspector</code> side panel; either integration point is compatible with the same grammar/writer core.</li>
      <li>Two ports with the identical name on one side: the reconciler's positional fallback is untested against that specific collision and may behave surprisingly.</li>
    </ul>
  </section>

  <div class="footer">Generated from the current tree by <code>docs/build_port_text_babble.py</code>. Source: <code>src/blocks/babble/portTextShared.ts</code>, <code>portTextGrammarTwoLane.ts</code>, <code>portTextGrammarSigil.ts</code>, <code>portTextGrammarKeywords.ts</code>, <code>usePortTextToggleEditor.ts</code>, <code>PortTextBabbleV1..V4.tsx</code>, <code>PortTextBabbleRegion.tsx</code>, <code>port-text-babble.css</code>. Wired into <code>src/blocks/ui/BlockCanvas.tsx</code> behind <code>shape.meta.portTextBabbleVariant</code> — inert on every ordinary board. Proof: <code>tests/port_text_babble_smoke.mjs</code> (<code>npm run test:port-text-babble</code>) and <code>src/blocks/babble/portTextGrammar.test.ts</code> (vitest). Review board: <code>sketches/review/port-text-babble.systemsketch</code>.</div>
</main>
</body>
</html>
"""
    OUTPUT.write_text(document, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
