#!/usr/bin/env python3
"""Build the Type Mapping ("algebraic type system") primitive babble gallery.

Five proposals for a NEW primitive — separate from the shipped Type record
Block — that holds pure Python type-ALIAS assignments (`Name = <type expr>`),
mapping/composing existing types rather than declaring a record's fields.
Every proposal is a real live Block instance, driven and screenshotted in an
actual browser (Block Dev harness), not a synthetic mockup — the same
feel-parity standard the sibling attribute-region babble holds itself to.

Reached only through `shape.meta.typeMappingBabbleVariant`; no ordinary board
ever sets it. See `src/blocks/babble/typeMappingShared.ts` and
`src/blocks/babble/TypeMappingV1.tsx` .. `TypeMappingV5.tsx`.
"""
from __future__ import annotations

import base64
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "type-mapping-babble-2026-09-05.html"


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
    results_path = ROOT / "docs/assets/type-mapping-babble-results.json"
    if not results_path.exists():
        raise RuntimeError(f"missing proof artifact: {results_path.relative_to(ROOT)}")
    results = json.loads(results_path.read_text(encoding="utf-8"))
    passed = sum(1 for check in results if check["ok"])

    # Facts asserted directly against the live tree, so this report cannot
    # drift from the code it describes.
    need(ROOT / "src/blocks/babble/typeMappingShared.ts",
         "parseTypeMappingSource", "findKnownTypeSource", "tokenizeTypeExpr", "KNOWN_TYPING_CONSTRUCTS")
    need(ROOT / "src/blocks/ui/BlockCanvas.tsx", "typeMappingBabbleVariant", "TypeMappingRegion")
    for variant in range(1, 6):
        need(ROOT / f"src/blocks/babble/TypeMappingV{variant}.tsx", f"type-mapping-v{variant}")

    checklist = "".join(
        f'<li class="{"pass" if check["ok"] else "fail"}"><b>{check["id"]}</b> {check["label"]}</li>'
        for check in results
    )

    overview = image_uri("docs/assets/type-mapping-babble-overview.png")
    v1_edit = image_uri("docs/assets/type-mapping-babble-v1-editing.png")
    v1_goto = image_uri("docs/assets/type-mapping-babble-v1-goto.png")
    v2_chip = image_uri("docs/assets/type-mapping-babble-v2-chip-editing.png")
    v3_shot = image_uri("docs/assets/type-mapping-babble-v3.png")
    v4_collapsed = image_uri("docs/assets/type-mapping-babble-v4-collapsed.png")
    v4_pretty = image_uri("docs/assets/type-mapping-babble-v4-pretty.png")
    v5_shot = image_uri("docs/assets/type-mapping-babble-v5.png")

    example_source = "Estimator = Callable[[Frame, float], Pose]\nPoses = Iterable[Pose]\nClient = Any"

    variants = [
        {
            "id": "v1", "name": "Code Cell", "accent": "#4d8dff",
            "thesis": "Converges with the SHIPPED Type record pattern, not just the sibling babble: one canonical source, one shared textarea, no toggle. The read view is a syntax-coloured code cell; clicking it opens the whole source, exactly the gesture Type already has.",
            "image": v1_edit,
            "imageCaption": "Selected and editing: the coloured read view is replaced by one plain textarea over the exact source — no highlight overlay while typing, matching TypeAttributeRegion's own editing mode.",
            "secondImage": v1_goto,
            "secondCaption": "“Go to definition” proven live: clicking the resolved Pose token selects the real Pose Type Block on the board.",
            "notes": [
                "Mode switch: click-to-edit-the-whole-source, identical contract to the shipped Type primitive.",
                "Best when: the primitive should feel like a natural extension of Type, not a new interaction to learn.",
                "Loses when: batching many aliases with per-line editing would be faster as individual chips (see V2).",
            ],
        },
        {
            "id": "v2", "name": "Alias Chips", "accent": "#e0a92f",
            "thesis": "Zach's own framing made literal — “that is like the code block view of a pill” — each alias is its own rounded chip, wrapped in a flowing rail. Click a chip to edit just its one line; a { } button escapes to one plain textarea for pasting many lines at once.",
            "image": v2_chip,
            "imageCaption": "Clicking a chip opens a single-line input scoped to just that alias — an atomic statement gets an atomic editor, unlike a Type's nested attribute tree.",
            "secondImage": None,
            "secondCaption": None,
            "notes": [
                "Mode switch: per-chip inline edit for one alias; a header toggle swaps the whole rail for raw source batching.",
                "Best when: aliases are added/renamed one at a time and the canvas reads like a set of small named things.",
                "Loses when: authoring many aliases from scratch — the raw-source escape hatch does the real batching work.",
            ],
        },
        {
            "id": "v3", "name": "Definition Table", "accent": "#b46bff",
            "thesis": "Deliberately converges with the sibling babble's V2 mental model — never make the reader choose a mode, show both at once — reshaped as a Name / Expression table because this grammar is naturally two columns per line, where the sibling's `name: Type` tree had no second column to give.",
            "image": v3_shot,
            "imageCaption": "The table and the live source pane are BOTH always on screen, kept in sync — no toggle exists to get lost in. Callable reads as a library construct (blue), Frame/Pose as live board types (purple, underlined), float/Any as builtins (teal).",
            "secondImage": None,
            "secondCaption": None,
            "notes": [
                "Mode switch: none — always both, converging with the sibling's “never hide either surface” answer.",
                "Best when: a reader wants to scan names at a glance AND have the exact Python one scroll away.",
                "Loses when: vertical space is tight — two surfaces cost more height than one.",
            ],
        },
        {
            "id": "v4", "name": "Collapsed Ladder", "accent": "#3fa46a",
            "thesis": "Answers “batch many compactly” head-on: the default state is a single summary line — “3 type aliases” — generalising the density idea Block's own simple/port/expanded sizes already use. Opening it steps to a resolved list; a second step reveals raw source. Three rungs, not a binary switch.",
            "image": v4_collapsed,
            "imageCaption": "Collapsed: a board with forty mapped names can stay forty one-line summaries until a reader wants one open.",
            "secondImage": v4_pretty,
            "secondCaption": "Expanded to the pretty rung — the default reading state once opened, one step short of raw source.",
            "notes": [
                "Mode switch: a 3-rung ladder (collapsed → pretty → source), not a 2-way toggle.",
                "Best when: many Type Mapping blocks share a board and most should stay out of the way.",
                "Loses when: a reader wants the pretty list and the raw source open at once (see V3 instead).",
            ],
        },
        {
            "id": "v5", "name": "Inline REPL Feed", "accent": "#d15b7a",
            "thesis": "The opposite extreme from V4's chrome: no table, no chips, no ladder — just a “>>> ” prompt column beside a live-highlighted source, like a Python console echoing back what you typed. The most code-native, least-decorated of the five.",
            "image": v5_shot,
            "imageCaption": "The prompt lives in its own fixed gutter — the same fix the sibling babble's V5 made for line numbers — so it never breaks the highlight/textarea overlay's character-for-character alignment.",
            "secondImage": None,
            "secondCaption": None,
            "notes": [
                "Mode switch: none — one live-highlighted surface, always editable, always coloured.",
                "Best when: the author thinks in Python already and wants zero UI between typing and seeing it resolved.",
                "Loses when: a reader who has never seen the source wants a scannable list without reading code (see V4's pretty rung).",
            ],
        },
    ]

    def variant_card(v: dict) -> str:
        notes = "".join(f"<li>{note}</li>" for note in v["notes"])
        second = ""
        if v["secondImage"]:
            second = (
                f'<img class="shot" src="{v["secondImage"]}" alt="{v["name"]} second state">'
                f'<p class="caption">{v["secondCaption"]}</p>'
            )
        return f"""
    <article class="panel variant" style="--accent:{v['accent']}">
      <h2><span class="tag">{v['id'].upper()}</span> {v['name']}</h2>
      <p class="thesis">{v['thesis']}</p>
      <img class="shot" src="{v['image']}" alt="{v['name']} state">
      <p class="caption">{v['imageCaption']}</p>
      {second}
      <ul class="notes">{notes}</ul>
    </article>"""

    cards = "".join(variant_card(v) for v in variants)

    document = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Type Mapping primitive · 5 proposals · SystemSketch</title>
<style>
:root {{ color-scheme:dark; --ink:#f5f7fb; --muted:#aab4c6; --line:#2d384b; --blue:#5aa7ff; --green:#62d58b; --red:#ff8a8a; --card:linear-gradient(145deg,#121b29,#0d1420); }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:#0a0f18; color:var(--ink); font:15px/1.55 Inter,ui-sans-serif,system-ui,sans-serif; }}
main {{ width:min(1180px,calc(100% - 32px)); margin:auto; padding:56px 0 76px; }}
h1 {{ font-size:clamp(32px,5.4vw,58px); line-height:1.05; letter-spacing:-.04em; margin:12px 0 22px; max-width:920px; }}
h2 {{ font-size:22px; margin:0 0 10px; letter-spacing:-.02em; display:flex; align-items:center; gap:10px; }}
p {{ color:var(--muted); max-width:76ch; }}
.eyebrow {{ color:var(--blue); font-size:12px; font-weight:800; letter-spacing:.16em; text-transform:uppercase; }}
.lead {{ font-size:18px; color:#d9e0ec; max-width:900px; }}
.metrics {{ display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin:30px 0 46px; }}
.metric,.panel {{ border:1px solid var(--line); background:var(--card); border-radius:16px; }}
.metric {{ padding:16px; }}
.metric b {{ display:block; font-size:26px; }}
.metric span {{ color:var(--muted); font-size:13px; }}
.panel {{ padding:22px; margin:18px 0; overflow:hidden; }}
pre {{ margin:14px 0 0; padding:16px; overflow:auto; border-radius:10px; background:#050a12; color:#dceafb; font:13px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace; }}
.shot {{ width:100%; border-radius:10px; border:1px solid var(--line); margin-top:10px; }}
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
code {{ color:#b9dcff; background:#111b29; padding:2px 6px; border-radius:6px; }}
.footer {{ margin-top:36px; padding-top:20px; border-top:1px solid var(--line); font-size:13px; color:var(--muted); }}
@media (max-width:820px) {{ .metrics {{ grid-template-columns:1fr 1fr; }} ul.checks {{ columns:1; }} }}
</style>
</head>
<body>
<main>
  <div class="eyebrow">SystemSketch · Dev-only babble · 5 September 2026</div>
  <h1>Five faces for the Type Mapping primitive — the “algebraic type system.”</h1>
  <p class="lead">Separate from the shipped Type record Block (<code>pose: Pose</code>, a NamedTuple-like field list), this NEW primitive holds pure Python type-ALIAS assignments — <code>Name = &lt;type expression&gt;</code> — that map or compose EXISTING types together, batched many-per-block. Every proposal below reuses the exact Block shape, the sibling babble's real board-scanning type lookup, and its transparent-textarea-over-highlighted-source technique, gated behind a distinctly-named <code>shape.meta.typeMappingBabbleVariant</code> that no ordinary board ever sets.</p>

  <section class="metrics" aria-label="Measured results">
    <div class="metric"><b>{passed} / {len(results)}</b><span>real-browser checks passed</span></div>
    <div class="metric"><b>5</b><span>orthogonal proposals</span></div>
    <div class="metric"><b>1</b><span>dev-only meta hook, zero shipped surface</span></div>
    <div class="metric"><b>2</b><span>identifiers resolved per line (construct + board type)</span></div>
  </section>

  <section class="panel">
    <h2>The reference example — Zach's own</h2>
    <pre><span style="color:#86d6ff"># one line = one alias, real typing vocabulary</span>
{example_source}</pre>
    <p class="caption">Every screenshot below renders exactly this source, alongside two real Type Blocks named <code>Frame</code> and <code>Pose</code> found live on the board — so “known” resolution is a real scan, never a simulated lookup.</p>
  </section>

  <section class="panel">
    <h2>All five, side by side</h2>
    <img class="shot" src="{overview}" alt="Five Type Mapping variants and two real Type blocks on one board">
    <p class="caption">Left to right: Code Cell, Alias Chips, Definition Table, Collapsed Ladder, Inline REPL Feed — plus the two real Type blocks (Frame, Pose) every variant resolves against.</p>
  </section>

  <section class="variants">{cards}</section>

  <section class="panel">
    <h2>Real-browser proof — {passed}/{len(results)} checks</h2>
    <ul class="checks">{checklist}</ul>
    <p class="caption">Every proposal was created as a real live Block instance in the Block Dev harness (<code>?preset=block-dev</code>) and driven with real CDP pointer events — click-to-edit, chip inline-edit, always-both sync, ladder collapse/expand, and a live “go to definition” click that moves the editor's actual selection to the real Pose block. No synthetic HTML mockup stands in for any of this.</p>
  </section>

  <div class="footer">Generated from the current tree by <code>docs/build_type_mapping_babble.py</code>. Source: <code>src/blocks/babble/typeMappingShared.ts</code>, <code>TypeMappingParts.tsx</code>, <code>TypeMappingV1..V5.tsx</code>, <code>TypeMappingRegion.tsx</code>, <code>type-mapping.css</code>. Wired into <code>src/blocks/ui/BlockCanvas.tsx</code> behind <code>shape.meta.typeMappingBabbleVariant</code> — inert on every ordinary board, exactly like the sibling attribute-region babble's own <code>meta.babbleVariant</code> hook.</div>
</main>
</body>
</html>
"""
    OUTPUT.write_text(document, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
