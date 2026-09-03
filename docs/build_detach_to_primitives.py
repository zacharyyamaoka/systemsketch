#!/usr/bin/env python3
"""Build the self-contained Detach to primitives implementation report.

Numbers, snippets and verdicts are measured at build time from the live repo
and from the run that produced them, so the page cannot drift from the tree.
"""

from __future__ import annotations

import base64
import html
import io
import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from report_measurements import (  # noqa: E402
    REPO,
    journey_results,
    line_count,
    unit_test_count,
)


def quote_source(path: Path, start_marker: str, end_marker: str) -> str:
    """Quote real source, so a snippet cannot outlive the code it describes.

    Local to this builder on purpose. `report_measurements.source_slice` does
    exactly this on `main`, but only as an uncommitted change by another
    session — and a worktree forks from commits, so depending on it here would
    be depending on a contract that is not frozen yet. Collapse the two once
    that lands.
    """
    if not path.exists():
        raise SystemExit(
            f"{path.name} is gone, so the snippet quoting it cannot be built. "
            f"The report describes a mechanism that no longer exists — rewrite that section."
        )
    text = path.read_text(encoding="utf-8")
    try:
        begin = text.index(start_marker)
        return text[begin:text.index(end_marker, begin)].rstrip()
    except ValueError:
        raise SystemExit(
            f"{path.name} no longer contains {start_marker.strip()[:60]!r}. "
            f"The report is describing a mechanism that has been replaced — "
            f"rewrite that section rather than re-pointing the marker."
        ) from None

HERE = Path(__file__).resolve().parent
ASSETS = HERE / "assets"
OUTPUT = HERE / "detach-to-primitives-2026-09-01.html"

BEFORE = ASSETS / "detach-before.png"
AFTER_ONE = ASSETS / "detach-after-one.png"
AFTER_BOTH = ASSETS / "detach-after-both.png"
REBUILT = ASSETS / "detach-rebuilt.png"
FIXTURE = REPO / "sketches" / "review" / "detach-to-primitives.png"
EXPORT_DIALOG = ASSETS / "export-dialog.png"
EXPORT_INTACT = ASSETS / "export-document-intact.png"
EXPORT_ROUND_TRIP = ASSETS / "export-round-trip.png"

# (source, crop box, output width) — boxes are in the 1440x960 capture frame.
CROPS = {
    "__BEFORE__": (BEFORE, (280, 210, 1180, 470), 1100),
    "__AFTER__": (AFTER_BOTH, (280, 210, 1180, 470), 1100),
    "__ONE__": (AFTER_ONE, (280, 210, 1180, 480), 1100),
    "__REBUILT__": (REBUILT, (280, 210, 1180, 690), 1100),
    "__FIXTURE__": (FIXTURE, (0, 40, 1440, 900), 1240),
    "__EXPORT_DIALOG__": (EXPORT_DIALOG, (330, 150, 1110, 660), 1080),
    "__EXPORT_INTACT__": (EXPORT_INTACT, (280, 210, 1180, 470), 1080),
    "__EXPORT_ROUND_TRIP__": (EXPORT_ROUND_TRIP, (280, 210, 1180, 470), 1080),
}


def encoded_crop(source: Path, box: tuple[int, int, int, int], width: int) -> str:
    if not source.exists():
        raise SystemExit(f"{source.name} is missing — re-run the journey that captures it")
    image = Image.open(source).convert("RGB").crop(box)
    if width != image.width:
        image = image.resize((width, round(image.height * width / image.width)), Image.LANCZOS)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def verdict_rows(results: list[dict]) -> str:
    rows = []
    for result in results:
        observed = json.dumps(result["observed"])
        if len(observed) > 190:
            observed = f"{observed[:189]}…"
        rows.append(
            "<tr>"
            f'<td class="mono">{html.escape(result["id"])}</td>'
            f'<td>{html.escape(result["label"])}</td>'
            f'<td><span class="tag {"ok" if result["ok"] else "warn"}">'
            f'{"PASS" if result["ok"] else "FAIL"}</span></td>'
            f'<td class="mono">{html.escape(observed)}</td>'
            "</tr>"
        )
    return "\n".join(rows)


def main() -> None:
    build = sys.argv[1] if len(sys.argv) > 1 else "track-detach-to-primitives"
    journey = REPO / "tests" / "block_detach_smoke.mjs"
    verdicts = journey_results(ASSETS / "detach-acceptance.json", journey, REPO / "src")
    export_journey = REPO / "tests" / "tldraw_export_smoke.mjs"
    export_verdicts = journey_results(
        ASSETS / "export-acceptance.json", export_journey, REPO / "src"
    )

    model = REPO / "src" / "blocks" / "detach" / "detachModel.ts"
    command = REPO / "src" / "blocks" / "detach" / "detachBlock.ts"

    values = {
        "__BUILD__": build,
        "__JOURNEY_TOTAL__": str(len(verdicts)),
        "__JOURNEY_PASSED__": str(sum(1 for row in verdicts if row["ok"])),
        "__JOURNEY_ROWS__": verdict_rows(verdicts),
        "__EXPORT_TOTAL__": str(len(export_verdicts)),
        "__EXPORT_PASSED__": str(sum(1 for row in export_verdicts if row["ok"])),
        "__EXPORT_ROWS__": verdict_rows(export_verdicts),
        "__EXPORT_SRC__": html.escape(
            quote_source(
                REPO / "src" / "workspace" / "LocalWorkspace.tsx",
                "  const exportTldraw = useCallback",
                "\n  const rename = useCallback",
            )
        ),
        "__MODEL_TESTS__": str(unit_test_count("src/blocks/detach/detachModel.test.ts")),
        "__PRIMITIVE_TESTS__": str(unit_test_count("src/blocks/detach/blockPrimitives.test.ts")),
        "__MODEL_LINES__": str(line_count("src/blocks/detach/detachModel.ts")),
        "__PRIMITIVE_LINES__": str(line_count("src/blocks/detach/blockPrimitives.ts")),
        "__COMMAND_LINES__": str(line_count("src/blocks/detach/detachBlock.ts")),
        "__META_SRC__": html.escape(
            quote_source(model, "export function detachMeta", "\n/**\n * Read a record back")
        ),
        "__RESOLVE_SRC__": html.escape(
            quote_source(command, "\t\t// An end is home if", "\n\t\tfor (const arrow of arrows)")
        ),
        "__SWEEP_ARROW_SRC__": html.escape(
            quote_source(command, "\t\t// An arrow left by an EARLIER detach", "\n\n\t\t// An Expanded frame's children")
        ),
    }

    page = TEMPLATE
    for slot, (source, box, width) in CROPS.items():
        page = page.replace(slot, encoded_crop(source, box, width))
    for slot, value in values.items():
        page = page.replace(slot, value)
    OUTPUT.write_text(page, encoding="utf-8")
    print(OUTPUT)


TEMPLATE = r'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>SystemSketch — detach to primitives</title>
<style>
  :root{color-scheme:dark;--bg:#080b12;--panel:#111724;--ink:#f7f8fb;--muted:#9ba8bd;--line:#2b3547;--cyan:#52d5d0;--green:#75d39b;--red:#e8836f;--amber:#efbd68;font-family:Inter,ui-sans-serif,system-ui,sans-serif}
  *{box-sizing:border-box}html{scroll-behavior:smooth}
  body{margin:0;color:var(--ink);background:radial-gradient(circle at 78% -10%,rgba(109,124,255,.2),transparent 34rem),radial-gradient(circle at 4% 42%,rgba(82,213,208,.08),transparent 32rem),var(--bg)}
  a{color:var(--cyan)}
  .shell{width:min(1280px,calc(100% - 34px));margin:auto;padding:42px 0 76px}
  .eyebrow{display:flex;align-items:center;gap:9px;color:var(--cyan);font:800 11px/1.2 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase}
  .eyebrow:before{content:"";width:8px;height:8px;border-radius:50%;background:var(--cyan);box-shadow:0 0 16px var(--cyan)}
  h1{max-width:980px;margin:16px 0 14px;font-size:clamp(38px,5.6vw,68px);line-height:.99;letter-spacing:-.05em}
  .lede{max-width:900px;margin:0;color:#c4ccda;font-size:18px;line-height:1.58}
  .lede b{color:#eef2f8}
  .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:11px;margin:28px 0 6px}
  .stat{padding:16px 18px;border:1px solid var(--line);border-radius:15px;background:rgba(17,23,36,.88)}
  .stat b{display:block;font-size:25px}.stat span{color:var(--muted);font-size:13px}
  section{margin-top:52px}
  .section-title{margin:0 0 8px;font-size:30px;letter-spacing:-.03em}
  .section-copy{max-width:920px;margin:0 0 22px;color:var(--muted);line-height:1.62}
  .section-copy b{color:#dfe5ef}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start}
  .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;align-items:start}
  @media(max-width:900px){.grid2,.grid3,.stats{grid-template-columns:1fr}}
  figure{margin:0;overflow:hidden;border:1px solid #3a465e;border-radius:16px;background:#f7f8fb;box-shadow:0 18px 46px rgba(0,0,0,.34)}
  figure img{display:block;width:100%;height:auto}
  figcaption{padding:11px 13px;background:var(--panel);color:var(--muted);font-size:12.5px;line-height:1.45}
  figcaption b{display:block;margin-bottom:3px;color:var(--ink);font-size:13px}
  .card{min-width:0;padding:19px 21px;border:1px solid var(--line);border-radius:16px;background:rgba(17,23,36,.86)}
  .card h3{margin:0 0 8px;font-size:16px;letter-spacing:-.01em}
  .card p{margin:0 0 8px;color:var(--muted);font-size:14px;line-height:1.6}
  .card p:last-child{margin-bottom:0}
  .card code,code{padding:1px 5px;border-radius:5px;background:#1c2637;color:#cfd7e6;font:600 12.5px ui-monospace,monospace}
  .tag{display:inline-block;margin:0 6px 6px 0;padding:4px 9px;border-radius:999px;font:700 11px ui-monospace,monospace;letter-spacing:.04em}
  .tag.ok{background:rgba(117,211,155,.14);color:var(--green)}
  .tag.warn{background:rgba(232,131,111,.16);color:var(--red)}
  .tag.info{background:rgba(109,124,255,.16);color:#a7b0ff}
  table{width:100%;border-collapse:collapse;font-size:14px}
  th,td{padding:11px 13px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
  th{color:var(--muted);font:700 11.5px ui-monospace,monospace;letter-spacing:.07em;text-transform:uppercase}
  td.mono{font:600 12.5px ui-monospace,monospace;color:#cfd7e6}
  pre{margin:0;padding:15px 17px;overflow-x:auto;border:1px solid var(--line);border-radius:13px;background:#0d1320;color:#cfd7e6;font:600 12.5px/1.65 ui-monospace,monospace}
  footer{margin-top:56px;padding-top:22px;border-top:1px solid var(--line);color:var(--muted);font-size:13px;line-height:1.6}
</style>
</head>
<body>
<div class="shell">

  <div class="eyebrow">SystemSketch · Block, Ports &amp; Edges</div>
  <h1>Detach to primitives — a door, not a cliff.</h1>
  <p class="lede">A Block is one custom shape: it renders through our code, it has our style rules, and
  only SystemSketch knows what its interior means. Detaching transfers authority the other way — it
  becomes ordinary tldraw geo, text, line and arrow shapes that upstream owns, with the full style
  panel and no dependency on us at all. What is new here is the second half: the primitives arrive as
  <b>one group, and that group remembers</b>. Its <code>meta</code> carries the whole Block record,
  through the canvas and through the file, so the transfer can be walked back.</p>

  <div class="stats">
    <div class="stat"><b>__JOURNEY_PASSED__/__JOURNEY_TOTAL__</b><span>real-browser checks</span></div>
    <div class="stat"><b>__MODEL_TESTS__ + __PRIMITIVE_TESTS__</b><span>unit tests on the pure halves</span></div>
    <div class="stat"><b>__MODEL_LINES__</b><span>lines in the whole envelope</span></div>
    <div class="stat"><b>__EXPORT_PASSED__/__EXPORT_TOTAL__</b><span>checks on the .tldr export</span></div>
  </div>

  <section>
    <h2 class="section-title">1 · The contract</h2>
    <div class="grid2">
      <div class="card">
        <h3><span class="tag ok">KEEPS</span></h3>
        <p>The look, the position, the parent, and the cables — each one becomes a stock arrow bound at
        the exact page points the cable occupied. And, in the group's <code>meta</code>, the entire
        semantic record: title, type, notes, icon, every port with its durable id, the remembered
        per-view boxes.</p>
      </div>
      <div class="card">
        <h3><span class="tag warn">GIVES UP</span></h3>
        <p>Block behaviour, live layout, and semantic port identity on the canvas. Exact colours,
        one-pixel strokes, rounded cards and value pills now travel through supported stock-shape
        display seams; lucide icons remain outline-primitive approximations. Ungrouping with
        <code>Ctrl+Shift+G</code> discards the record too — that is the honest meaning of taking it
        apart by hand.</p>
      </div>
    </div>
  </section>

  <section>
    <h2 class="section-title">2 · It looks the same</h2>
    <p class="section-copy">Every position is read from <code>layoutBlock</code> — the same function
    the renderer, the indicator and the binding anchors read — so the detached copy cannot drift from
    what was on screen a frame earlier. Both frames below are the journey's own captures.</p>
    <div class="grid2">
      <figure>
        <img alt="Two Blocks wired together" src="data:image/png;base64,__BEFORE__" />
        <figcaption><b>Before</b>Two Blocks and one semantic cable.</figcaption>
      </figure>
      <figure>
        <img alt="The same board as stock tldraw primitives" src="data:image/png;base64,__AFTER__" />
        <figcaption><b>After</b>Not a Block on the page: geo, text, line and one arrow, in two groups.
        Right-hand group selected — those are tldraw's own handles.</figcaption>
      </figure>
    </div>
    <figure style="margin-top:14px">
      <img alt="One Block detached beside one still live" src="data:image/png;base64,__ONE__" />
      <figcaption><b>Half and half</b>Detaching one of a wired pair. The cable became an arrow; the far
      end is still a Block, still holding its semantics.</figcaption>
    </figure>
  </section>

  <section>
    <h2 class="section-title">3 · The group remembers</h2>
    <p class="section-copy"><code>meta</code> is tldraw's own per-shape JSON bag: it survives save,
    load, copy, paste and duplicate untouched, and stock tldraw neither reads nor validates it. That is
    exactly the property this needs — a <code>.tldr</code> opened on tldraw.com shows a group of
    rectangles and text, and the same file opened in SystemSketch can put the Block back. The card
    inside the group is marked too, so a rebuild finds its anchor without storing an id that copy and
    paste would re-mint.</p>
    <div class="card"><pre>__META_SRC__</pre></div>
    <p class="section-copy" style="margin-top:18px">The journey proves this against a real
    <code>.tldr</code> on disk, because that is the file the export will write: after detaching a whole
    board and letting it save, the document holds
    <code>group:block</code>, <code>geo:block-card</code> and <code>arrow:connection</code> records —
    and <b>no</b> <code>block</code> or <code>connection</code> shape type at all.</p>
  </section>

  <section>
    <h2 class="section-title">4 · And it comes back</h2>
    <p class="section-copy">Reading the record back is not decoration — it is the only honest proof
    that what was stored is <b>sufficient</b>. Position and size come from where the group <b>is now</b>,
    not from the record, so a detached group that was moved or resized rebuilds where the user left it.
    Only the semantics come from <code>meta</code>.</p>
    <figure>
      <img alt="Both Blocks rebuilt, one moved, with the cable re-routed" src="data:image/png;base64,__REBUILT__" />
      <figcaption><b>Rebuilt</b>The inspector says “2 Blocks selected” — these are real Blocks again,
      not pictures. <code>decode</code> came back 220px lower, where its group was dragged to, and the
      elbow router has re-routed the cable around the new positions on its own.</figcaption>
    </figure>
  </section>

  <section>
    <h2 class="section-title">5 · Two things that only showed up when driven</h2>
    <div class="grid2">
      <div class="card">
        <h3>An arrow from an earlier detach in the same sweep</h3>
        <p>Detaching a wired pair detaches the first Block, whose cable becomes an arrow bound to the
        second — which is still a Block. When that one detaches, the wiring table no longer mentions
        the cable, so nothing transferred the arrow, and deleting the Block took the binding with it.
        The pair could then never be rebuilt: only one end resolved.</p>
        <pre>__SWEEP_ARROW_SRC__</pre>
      </div>
      <div class="card">
        <h3>A far end that never left</h3>
        <p>Found by driving the <b>review fixture</b>, not by the journey: the journey detached both
        Blocks, so both ends were always symmetric. Detach only one of a wired pair and the far end is
        a live Block — a rebuild that insists both ends were detached leaves the arrow an arrow. The
        journey now carries that asymmetric case as
        <code>REBUILDS-AGAINST-A-LIVE-BLOCK</code>, and it goes red without this.</p>
        <pre>__RESOLVE_SRC__</pre>
      </div>
    </div>
  </section>

  <section>
    <h2 class="section-title">6 · Proof</h2>
    <table>
      <thead><tr><th>Check</th><th>Claim</th><th></th><th>Observed</th></tr></thead>
      <tbody>__JOURNEY_ROWS__</tbody>
    </table>
    <pre style="margin-top:18px">npm run test:detach</pre>
    <p class="section-copy" style="margin-top:18px">Four gates were mutation-tested red: stop writing
    the group's <code>meta</code>; rebuild at a hardcoded position; rebuild 40px off; and refuse a far
    end that was never detached. The position check was strengthened after a first mutation slipped
    past it — a two-pixel arrow nudge was too small a signal, so the journey now drags the group 220px.</p>
  </section>

  <section>
    <h2 class="section-title">7 · A board to try it on</h2>
    <p class="section-copy">Two Blocks, a real cable, and the gesture written on the canvas. Generated
    through the real editor and cold-reopened, then driven once on the running track server — which is
    where the second bug above surfaced.</p>
    <figure>
      <img alt="The review fixture board" src="data:image/png;base64,__FIXTURE__" />
      <figcaption><b>sketches/review/detach-to-primitives.systemsketch</b>Right-click
      <code>decode()</code> → Detach to primitives; drag the group; right-click → Rebuild Block from
      primitives.</figcaption>
    </figure>
  </section>

  <section>
    <h2 class="section-title">8 · What it was for: <code>File → Export to tldraw…</code></h2>
    <p class="section-copy">The FR's own recipe, now a menu item: run detach over
    <b>everything</b>, so the whole board reduces to groups of stock shapes whose <code>meta</code>
    carries what it would take to rebuild them, and write that as a plain <code>.tldr</code>.
    <code>.systemsketch</code> → <code>.tldr</code> → Blocks again, on the same records.</p>

    <div class="grid2">
      <figure>
        <img alt="The export dialog, offering a .tldr name" src="data:image/png;base64,__EXPORT_DIALOG__" />
        <figcaption><b>One destination, one format</b>The suffix is <code>.tldr</code> and not
        negotiable — an export written under <code>.systemsketch</code> would promise semantics it
        does not carry, which is the exact confusion two file types exist to prevent.</figcaption>
      </figure>
      <figure>
        <img alt="The board still holding real Blocks after the export" src="data:image/png;base64,__EXPORT_INTACT__" />
        <figcaption><b>The document is untouched</b>Not just on screen — the journey re-reads the
        <code>.systemsketch</code> off disk after the export and finds <code>block</code> and
        <code>connection</code> records, and no detached group.</figcaption>
      </figure>
    </div>

    <p class="section-copy" style="margin-top:22px">The export <b>borrows the live document</b>
    rather than building a second one. Running the real command is the only way the exported file is
    guaranteed to match what the canvas would have produced — a second code path that assembles group
    records by hand would be a second thing to keep in step. Two things make borrowing safe: autosave
    is held off for the whole window, and the bail is in a <code>finally</code>, so a failed write
    cannot leave someone staring at a board that silently came apart. Removing that one line turns
    both <code>DOCUMENT-SURVIVES</code> checks red.</p>
    <div class="card" style="margin-top:14px"><pre>__EXPORT_SRC__</pre></div>

    <figure style="margin-top:22px">
      <img alt="Blocks rebuilt out of the exported tldraw file" src="data:image/png;base64,__EXPORT_ROUND_TRIP__" />
      <figcaption><b>All the way back</b>The exported <code>.tldr</code> reopened, selected, and
      rebuilt: two Blocks and the semantic cable, out of a file with no SystemSketch shape type in
      it.</figcaption>
    </figure>

    <table style="margin-top:22px">
      <thead><tr><th>Check</th><th>Claim</th><th></th><th>Observed</th></tr></thead>
      <tbody>__EXPORT_ROWS__</tbody>
    </table>
    <pre style="margin-top:18px">npm run test:export</pre>
  </section>

  <section>
    <h2 class="section-title">9 · Where it came from</h2>
    <div class="grid3">
      <div class="card">
        <h3><span class="tag info">DONOR</span> pyblocks</h3>
        <p><code>src/pipeline/nodes/detachNode.ts</code> is where this operation was worked out —
        primitives from the layout, cables to arrows, grouping, one history mark, reparenting an
        Expanded frame's children before deleting it. All carried over.</p>
      </div>
      <div class="card">
        <h3><span class="tag info">NEW</span> The record</h3>
        <p>The donor group is a picture. This one remembers, which is what
        <code>FR - Block, Ports &amp; Edges Primitive</code> asked for and what makes the operation
        reversible instead of terminal.</p>
      </div>
      <div class="card">
        <h3><span class="tag ok">SHIPPED</span> Export to <code>.tldr</code></h3>
        <p>§8. Detach everything, then save — and put the board straight back. The reader was already
        there, which is what made the export small.</p>
      </div>
    </div>
    <table style="margin-top:22px">
      <thead><tr><th>File</th><th>Role</th><th>Lines</th></tr></thead>
      <tbody>
        <tr><td class="mono">src/blocks/detach/detachModel.ts</td><td>The record and its reader. Pure; no editor, no tldraw runtime.</td><td class="mono">__MODEL_LINES__</td></tr>
        <tr><td class="mono">src/blocks/detach/blockPrimitives.ts</td><td>The look as a value — asserted without an editor.</td><td class="mono">__PRIMITIVE_LINES__</td></tr>
        <tr><td class="mono">src/blocks/detach/detachBlock.ts</td><td>Both commands, and everything that touches the editor.</td><td class="mono">__COMMAND_LINES__</td></tr>
        <tr><td class="mono">src/blocks/ui/portPalette.ts</td><td>One table for a port's exact live colour and its portable stock fallback.</td><td class="mono">—</td></tr>
        <tr><td class="mono">src/blocks/ui/BlockContextMenu.tsx</td><td>Both menu items, counted for a multi-selection.</td><td class="mono">—</td></tr>
        <tr><td class="mono">src/workspace/LocalWorkspace.tsx</td><td>The export: borrow, serialize, bail, and hold autosave off across it.</td><td class="mono">—</td></tr>
        <tr><td class="mono">tests/block_detach_smoke.mjs</td><td>The journey behind §6.</td><td class="mono">—</td></tr>
        <tr><td class="mono">tests/tldraw_export_smoke.mjs</td><td>The journey behind §8.</td><td class="mono">—</td></tr>
      </tbody>
    </table>
  </section>

  <footer>
    Built from the live repo by <code>docs/build_detach_to_primitives.py</code> · build
    <code>__BUILD__</code>. Every count, snippet and verdict was measured at build time from the tree
    and from the run that produced it.
  </footer>

</div>
</body>
</html>
'''


if __name__ == "__main__":
    main()
