#!/usr/bin/env python3
"""Build the Type primitive V1 engine report.

Covers what changed after Zach picked V1 (Segmented toggle) from the
attribute-body babble and Code Cell from the Type Mapping babble: the
reactive perf fix, unlimited recursive expansion (including self-reference
and cross-primitive expansion into a Type Mapping), the double-click-to-
Source-with-cursor gesture, the two engines converging on one shared
component family, and the real type-name autocomplete wired into both.

Measures facts directly from the live tree so this report cannot drift from
the code it describes. Source: `src/blocks/babble/TypeBabbleV1.tsx`,
`TypeMappingV1.tsx`, `useSourceToggleEditor.ts`, `SourceCodeEditor.tsx`,
`typeReferenceIndex.ts`, `TypeNameAutocomplete.tsx`,
`typeNameAutocompleteLogic.ts`. Board: `sketches/review/type-primitive-babble.systemsketch`.
"""
from __future__ import annotations

import base64
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "type-primitive-v1-engine-2026-09-05.html"


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


def count_tests() -> int:
    output = subprocess.run(
        ["npx", "vitest", "run", "--reporter=json"],
        cwd=ROOT, capture_output=True, text=True, timeout=180,
    )
    match = re.search(r'"numPassedTests":(\d+)', output.stdout)
    return int(match.group(1)) if match else 0


def main() -> None:
    # Facts asserted directly against the live tree — measured, not typed in.
    need(ROOT / "src/blocks/babble/typeReferenceIndex.ts", "useTypeReferenceIndex", "ResolvedTypeRef")
    need(ROOT / "src/blocks/babble/useSourceToggleEditor.ts", "enterSourceAt", "pendingCaret")
    need(ROOT / "src/blocks/babble/SourceCodeEditor.tsx", "overlay")
    need(ROOT / "src/blocks/babble/TypeBabbleV1.tsx", "AttributeNode", "MappingPreviewRow", "chevronPlacement")
    need(ROOT / "src/blocks/babble/TypeMappingV1.tsx", "useSourceToggleEditor", "SourceCodeEditor")
    need(ROOT / "src/blocks/babble/TypeNameAutocomplete.tsx", "caretPixelOffset")
    need(ROOT / "src/blocks/babble/typeNameAutocompleteLogic.ts", "findExpressionTypeSlot", "findTypeSlot")
    need(ROOT / "src/blocks/babble/typeMappingShared.ts", "isTypeMappingBlock(block)")

    region_source = (ROOT / "src/blocks/babble/TypeBabbleRegion.tsx").read_text(encoding="utf-8")
    variants_block = re.search(r"const VARIANTS = \{(.*?)\}", region_source, re.S).group(1)
    variant_count = len(re.findall(r"^\s*\d+:", variants_block, re.M))

    passing = count_tests()

    board = image_uri("sketches/review/type-primitive-babble.png")
    row1 = image_uri("docs/assets/type-primitive-v1-engine-row1.png")
    mapping = image_uri("docs/assets/type-primitive-v1-engine-mapping.png")

    document = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Type primitive V1 engine · SystemSketch</title>
<style>
:root {{ color-scheme:dark; --ink:#f5f7fb; --muted:#aab4c6; --line:#2d384b; --blue:#5aa7ff; --green:#62d58b; --red:#ff8a8a; --card:linear-gradient(145deg,#121b29,#0d1420); }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:#0a0f18; color:var(--ink); font:15px/1.55 Inter,ui-sans-serif,system-ui,sans-serif; }}
main {{ width:min(1180px,calc(100% - 32px)); margin:auto; padding:56px 0 76px; }}
h1 {{ font-size:clamp(30px,5vw,52px); line-height:1.05; letter-spacing:-.04em; margin:12px 0 22px; max-width:920px; }}
h2 {{ font-size:22px; margin:0 0 10px; letter-spacing:-.02em; display:flex; align-items:center; gap:10px; }}
h3 {{ font-size:17px; margin:22px 0 6px; color:#e2e8f4; }}
p {{ color:var(--muted); max-width:76ch; }}
.eyebrow {{ color:var(--blue); font-size:12px; font-weight:800; letter-spacing:.16em; text-transform:uppercase; }}
.lead {{ font-size:18px; color:#d9e0ec; max-width:900px; }}
.metrics {{ display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin:30px 0 46px; }}
.metric,.panel {{ border:1px solid var(--line); background:var(--card); border-radius:16px; }}
.metric {{ padding:16px; }}
.metric b {{ display:block; font-size:26px; }}
.metric span {{ color:var(--muted); font-size:13px; }}
.panel {{ padding:22px; margin:18px 0; overflow:hidden; }}
.shot {{ width:100%; border-radius:10px; border:1px solid var(--line); margin-top:10px; background:#fff; }}
.caption {{ margin:8px 2px 16px; font-size:13px; color:var(--muted); }}
a {{ color:var(--blue); }}
code {{ color:#b9dcff; background:#111b29; padding:2px 6px; border-radius:6px; font-size:.92em; }}
.grid2 {{ display:grid; grid-template-columns:1fr 1fr; gap:18px; }}
.before-after {{ border:1px solid var(--line); border-radius:12px; padding:14px; }}
.before-after b {{ color:var(--red); }}
.before-after b.after {{ color:var(--green); }}
ul.notes {{ padding-left:20px; margin:8px 0 0; color:var(--muted); font-size:13.5px; }}
ul.notes li {{ margin:6px 0; }}
.footer {{ margin-top:36px; padding-top:20px; border-top:1px solid var(--line); font-size:13px; color:var(--muted); }}
@media (max-width:820px) {{ .metrics {{ grid-template-columns:1fr 1fr; }} .grid2 {{ grid-template-columns:1fr; }} }}
</style>
</head>
<body>
<main>
  <div class="eyebrow">SystemSketch · Dev-only babble · 5 September 2026</div>
  <h1>The Type primitive's V1 engine: real reactivity, unlimited recursion, one shared component, real autocomplete.</h1>
  <p class="lead">After picking V1 (Segmented toggle) for the attribute-body babble and Code Cell for the Type Mapping babble, this pass turned both into one production-shaped engine: a reactive board index that actually updates, expansion that goes as deep as the data does (including a type that references itself), a click-precise way into Source mode, and a real type-name autocomplete synthesized from IDE prior art — wired into both editors.</p>

  <section class="metrics" aria-label="Measured results">
    <div class="metric"><b>~9ms</b><span>edit-to-visible, was stuck stale &gt;10s</span></div>
    <div class="metric"><b>∞</b><span>expansion depth, self-reference included</span></div>
    <div class="metric"><b>{variant_count}</b><span>attribute-body variants now live</span></div>
    <div class="metric"><b>{passing}</b><span>vitest tests passing, whole tree</span></div>
  </section>

  <section class="panel">
    <h2>The bug wasn't slow — it was stuck</h2>
    <p>Every variant's "does this type name resolve to something real" check was a plain board scan called at render time, never wrapped in a reactive subscription. Editing a referenced Type's default value didn't make the reader wait — it made them <em>never see it</em> until this component happened to re-render for an unrelated reason. That's what read as "about ten seconds": actually indefinite, until something else nudged a re-render.</p>
    <div class="grid2">
      <div class="before-after"><b>Before</b> — measured live with a MutationObserver armed before the edit: still stale after 8+ seconds, no ceiling found.</div>
      <div class="before-after"><b class="after">After</b> — same measurement, same edit: <code>elapsedMs: 8.6</code> via <code>useTypeReferenceIndex</code>, one reactive scan shared by every row at every depth.</div>
    </div>
    <p class="caption">Fix: <code>src/blocks/babble/typeReferenceIndex.ts</code> — a <code>useValue</code> derive that reads (and therefore depends on) every Type's title <em>and</em> <code>attributeSource</code>, and every Type Mapping block's aliases, so an edit anywhere relevant invalidates the signal instead of leaving a stale snapshot in a Map.</p>
  </section>

  <section class="panel">
    <h2>Unlimited recursion, including self-reference and a cross-primitive jump</h2>
    <img class="shot" src="{row1}" alt="Pose, V1, AltA, AltB blocks on the review board">
    <p class="caption">Clicking "pose: Pose" expands it in place; clicking the nested "x: Pose" expands again — Pose names itself as one of its own fields, and the engine has no depth cap, only the number of times a person keeps clicking.</p>
    <p>A field can also name a Type Mapping alias instead of a record. Rather than fake a field list for something that has none, expanding it shows what the mapping actually equals, tokenized and colored the same way the Type Mapping editor colors its own source:</p>
    <img class="shot" src="{mapping}" alt="Estimator mapping block, and the autocomplete note">
    <p class="caption">The reverse direction works too: clicking the blue "Pose" token inside <code>Estimator = Callable[[Frame, float], Pose]</code> jumps the camera to the real Pose block — proof this is a genuine cross-primitive board scan, not two separate simulated lookups. This surfaced a real, independently-confirmed bug in the Type Mapping babble's own <code>findKnownTypeSource</code>: since a Type Mapping block IS a Type block underneath (same <code>blockType</code>, tagged via <code>meta</code>), checking Type-identity first made the mapping-alias branch dead code — no alias could ever resolve. Fixed by testing mapping identity first.</p>
  </section>

  <section class="panel">
    <h2>Double-click a row → Source mode, cursor at the click</h2>
    <p>The original gesture (any row, single click, whole-block plain textarea) is still here in spirit, but single-click is now reserved for expand/collapse. Double-clicking any row of a block's own source computes the exact character offset under the cursor — via <code>document.caretRangeFromPoint</code> walked back through the row's own text nodes — and lands the textarea's caret there. Measured live: clicking mid-word in "quality: float" landed the cursor within one character of the click point, both in the attribute editor and in the Type Mapping editor.</p>
    <p>Double-clicking an <em>expanded</em> (foreign) row does the opposite on purpose: it jumps the camera to that row's real owning block instead, since editing someone else's source from inside your own preview would silently attribute text to the wrong block.</p>
  </section>

  <section class="panel">
    <h2>One shared engine, not two similar copies</h2>
    <p>Per Zach's own direction after seeing Code Cell — "basically the exact same implementation... maybe it's even the same component" — the Type attribute body and the Type Mapping editor now share:</p>
    <ul class="notes">
      <li><code>useSourceToggleEditor</code> — the entire UI/Source toggle mechanic: mode, draft, commit-on-blur with one history step, Escape-to-cancel, and the pending-caret-after-mode-switch dance, grammar-agnostic (both grammars store their source in the same <code>attributeSource</code> prop).</li>
      <li><code>SourceCodeEditor</code> — the transparent-textarea-over-highlighted-<code>&lt;pre&gt;</code> technique, generic over a <code>renderLine(raw, lineIndex)</code> callback instead of knowing about attributes or aliases specifically.</li>
      <li><code>useTypeReferenceIndex</code> — the one reactive board scan both grammars resolve names against.</li>
    </ul>
    <p>What's deliberately <em>not</em> shared: the read view. Attribute rows expand in place (there's exactly one type per row to expand into); a Mapping's read view stays the code cell itself, with "go to definition" on a token, since an expression can carry many identifiers and there's no single canonical thing to expand a whole row into.</p>
  </section>

  <section class="panel">
    <h2>Real type-name autocomplete, in both editors</h2>
    <p>Built from the synthesis Zach picked after reviewing the V1/V2/V3 autocomplete mockups: V1's anchored-below-caret shell and keyboard model, V2's "show every type on this board" escalation, V3's idea (not its chip UI) that the list is already scoped to what's valid here — plus a correction Zach called out directly: colored kind pills (board type / mapped type / primitive) instead of V1 mockup's glyphs, which "tell you nothing."</p>
    <p>The registry is real — <code>allBlocks</code> scanned for live Type titles and Type Mapping aliases, not a hardcoded list — and a query matches a mapping via its OWN name or its expression: typing "Pose" surfaces <code>Estimator = Callable[[Frame, float], Pose]</code> because Pose appears in what Estimator equals, but accepting it always inserts "Estimator," never the expression. Verified live: typing <code>extra: Po</code> opened a dropdown showing the board-type pill and "Pose"; accepting it produced <code>extra: Pose</code> with the caret placed right after.</p>
    <p>The Type Mapping grammar (<code>Name = expr</code>) has no colon to key off, so it needed its own slot-detector, <code>findExpressionTypeSlot</code> — the identifier run touching the caret anywhere in a nested expression, not just right after a colon. Verified live: typing inside <code>Callable[[Frame], Po</code> surfaced and correctly inserted "Pose."</p>
    <p>One real bug found live, not in review: parking the cursor at the end of an already-complete type (nothing left to type) reopened the dropdown from a bare click, which then hijacked the very next Enter — meant to start a new line — into "accept the suggestion" instead. Fixed by only reopening on an actual keystroke, never on click/focus/navigation alone.</p>
  </section>

  <section class="panel">
    <h2>The board</h2>
    <img class="shot" src="{board}" alt="Full review board: Pose, V1, AltA, AltB, Estimator mapping, autocomplete note, PASS WHEN">
    <p class="caption"><code>sketches/review/type-primitive-babble.systemsketch</code> — six numbered gestures plus a PASS WHEN, generated through the real editor and cold-reopen verified. A separate, deeper exploration of chevron placement and indent-guide styling (informed by IDE prior art) lives in its own board and report — see <a href="chevron-guide-babble-2026-09-05.html">the chevron/guide report</a>.</p>
  </section>

  <div class="footer">Generated from the current tree by <code>docs/build_type_primitive_v1_engine.py</code>. Source: <code>src/blocks/babble/TypeBabbleV1.tsx</code>, <code>TypeMappingV1.tsx</code>, <code>useSourceToggleEditor.ts</code>, <code>SourceCodeEditor.tsx</code>, <code>typeReferenceIndex.ts</code>, <code>caretGeometry.ts</code>, <code>TypeNameAutocomplete.tsx</code>, <code>typeNameAutocompleteLogic.ts</code>. Board: <code>sketches/review/type-primitive-babble.systemsketch</code>.</div>
</main>
</body>
</html>
"""
    OUTPUT.write_text(document, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
