#!/usr/bin/env python3
"""Build the self-contained `.systemsketch` file-type implementation report.

Every number, snippet and verdict on the page is measured at build time from
the live repo and from the runs that actually produced them, so the report
cannot drift from the tree it describes.
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
    source_slice,
    unit_test_count,
)


HERE = Path(__file__).resolve().parent
ASSETS = HERE / "assets"
OUTPUT = HERE / "systemsketch-file-type-2026-09-01.html"

OPEN_DIALOG = ASSETS / "file-type-open-dialog.png"
RENAME_DIALOG = ASSETS / "file-type-rename-dialog.png"
SKETCH_BOARD = ASSETS / "file-type-systemsketch-board.png"
LEGACY_BOARD = ASSETS / "file-type-legacy-tldr-board.png"
STABLE_BOARD = ASSETS / "stable-file-type-board.png"

# (source, crop box, output width) — boxes are in the 1440x960 capture frame.
CROPS = {
    "__OPEN__": (OPEN_DIALOG, (340, 165, 1100, 470), 1140),
    "__RENAME__": (RENAME_DIALOG, (340, 330, 1100, 632), 1140),
    "__SKETCH__": (SKETCH_BOARD, (280, 0, 1180, 500), 1080),
    "__LEGACY__": (LEGACY_BOARD, (280, 0, 1180, 500), 1080),
    "__STABLE__": (STABLE_BOARD, (0, 0, 1180, 500), 1180),
}


def encoded_crop(source: Path, box: tuple[int, int, int, int], width: int) -> str:
    if not source.exists():
        raise SystemExit(f"{source.name} is missing — re-run the journey that captures it")
    image = Image.open(source).convert("RGB").crop(box)
    if width != image.width:
        height = round(image.height * width / image.width)
        image = image.resize((width, height), Image.LANCZOS)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def verdict_rows(results: list[dict]) -> str:
    rows = []
    for result in results:
        mark = "ok" if result["ok"] else "warn"
        # Trim the JSON, then escape it: slicing escaped text can cut an
        # entity in half and print `&q` into the page.
        observed = json.dumps(result["observed"])
        if len(observed) > 190:
            observed = f"{observed[:189]}…"
        rows.append(
            "<tr>"
            f'<td class="mono">{html.escape(result["id"])}</td>'
            f'<td>{html.escape(result["label"])}</td>'
            f'<td><span class="tag {mark}">{"PASS" if result["ok"] else "FAIL"}</span></td>'
            f'<td class="mono">{html.escape(observed)}</td>'
            "</tr>"
        )
    return "\n".join(rows)


def code_block(text: str) -> str:
    return html.escape(text)


def main() -> None:
    build = sys.argv[1] if len(sys.argv) > 1 else "working-tree"

    journey = REPO / "tests" / "systemsketch_file_type_smoke.mjs"
    journey_verdicts = journey_results(
        ASSETS / "file-type-acceptance.json", journey, REPO / "src"
    )
    stable_path = ASSETS / "stable-file-type.json"
    if not stable_path.exists():
        raise SystemExit("stable-file-type.json is missing — run `npm run test:file-type-stable`")
    stable = json.loads(stable_path.read_text())

    envelope_source = REPO / "src" / "workspace" / "systemSketchFile.ts"
    store_source = REPO / "scripts" / "workspace_store.py"

    numbers = {
        "__BUILD__": build,
        "__STABLE_BUILD__": stable["build"],
        "__STABLE_URL__": stable["url"],
        "__ENVELOPE_LINES__": str(line_count("src/workspace/systemSketchFile.ts")),
        "__MODEL_LINES__": str(line_count("src/workspace/workspaceModel.ts")),
        "__STORE_LINES__": str(line_count("scripts/workspace_store.py")),
        "__ENVELOPE_TESTS__": str(unit_test_count("src/workspace/systemSketchFile.test.ts")),
        "__MODEL_TESTS__": str(unit_test_count("src/workspace/workspaceModel.test.ts")),
        "__JOURNEY_TOTAL__": str(len(journey_verdicts)),
        "__JOURNEY_PASSED__": str(sum(1 for row in journey_verdicts if row["ok"])),
        "__STABLE_TOTAL__": str(len(stable["results"])),
        "__STABLE_PASSED__": str(sum(1 for row in stable["results"] if row["ok"])),
        "__JOURNEY_ROWS__": verdict_rows(journey_verdicts),
        "__STABLE_ROWS__": verdict_rows(stable["results"]),
        "__ENCODE_SRC__": code_block(
            source_slice(envelope_source, "export function encodeSystemSketchDocument", "\nfunction readManifest")
        ),
        "__DECODE_SRC__": code_block(
            source_slice(envelope_source, "export function decodeSystemSketchDocument", "\n/** Whether a document")
        ),
        "__SUFFIX_RULE_SRC__": code_block(
            source_slice(store_source, "def normalize_document_source", "\n\ndef _metadata")
        ),
    }

    html_text = TEMPLATE
    for slot, (source, box, width) in CROPS.items():
        html_text = html_text.replace(slot, encoded_crop(source, box, width))
    for slot, value in numbers.items():
        html_text = html_text.replace(slot, value)
    OUTPUT.write_text(html_text, encoding="utf-8")
    print(OUTPUT)


TEMPLATE = r'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>SystemSketch — the .systemsketch file type</title>
<style>
  :root{color-scheme:dark;--bg:#080b12;--panel:#111724;--ink:#f7f8fb;--muted:#9ba8bd;--line:#2b3547;--blue:#6d7cff;--cyan:#52d5d0;--green:#75d39b;--red:#e8836f;--amber:#efbd68;font-family:Inter,ui-sans-serif,system-ui,sans-serif}
  *{box-sizing:border-box}html{scroll-behavior:smooth}
  body{margin:0;color:var(--ink);background:radial-gradient(circle at 78% -10%,rgba(109,124,255,.2),transparent 34rem),radial-gradient(circle at 4% 42%,rgba(82,213,208,.08),transparent 32rem),var(--bg)}
  a{color:var(--cyan)}
  .shell{width:min(1180px,calc(100% - 34px));margin:auto;padding:42px 0 76px}
  .eyebrow{display:flex;align-items:center;gap:9px;color:var(--cyan);font:800 11px/1.2 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase}
  .eyebrow:before{content:"";width:8px;height:8px;border-radius:50%;background:var(--cyan);box-shadow:0 0 16px var(--cyan)}
  h1{max-width:940px;margin:16px 0 14px;font-size:clamp(38px,5.6vw,68px);line-height:.99;letter-spacing:-.05em}
  .lede{max-width:880px;margin:0;color:#c4ccda;font-size:18px;line-height:1.58}
  .lede b{color:#eef2f8}
  .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:11px;margin:28px 0 6px}
  .stat{padding:16px 18px;border:1px solid var(--line);border-radius:15px;background:rgba(17,23,36,.88)}
  .stat b{display:block;font-size:25px}.stat span{color:var(--muted);font-size:13px}
  section{margin-top:52px}
  .section-title{margin:0 0 8px;font-size:30px;letter-spacing:-.03em}
  .section-copy{max-width:900px;margin:0 0 22px;color:var(--muted);line-height:1.62}
  .section-copy b{color:#dfe5ef}
  .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;align-items:start}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start}
  @media(max-width:900px){.grid3,.grid2,.stats{grid-template-columns:1fr}}
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
  td b{color:var(--ink)}
  td.mono{font:600 12.5px ui-monospace,monospace;color:#cfd7e6}
  pre{margin:0;padding:15px 17px;overflow-x:auto;border:1px solid var(--line);border-radius:13px;background:#0d1320;color:#cfd7e6;font:600 12.5px/1.65 ui-monospace,monospace}
  .seam{width:100%;height:auto;border:1px solid var(--line);border-radius:16px;background:rgba(13,19,32,.7)}
  footer{margin-top:56px;padding-top:22px;border-top:1px solid var(--line);color:var(--muted);font-size:13px;line-height:1.6}
</style>
</head>
<body>
<div class="shell">

  <div class="eyebrow">SystemSketch · Documents</div>
  <h1>Its own file type, still a tldraw file underneath.</h1>
  <p class="lede">A <code>.systemsketch</code> <b>is</b> a <code>.tldr</code> — same
  <code>tldrawFileFormatVersion</code>, same <code>schema</code>, same <code>records</code> — with one
  extra top-level <code>systemSketch</code> key written in front of them. That single key is the whole
  difference. SystemSketch strips it and hands the rest to tldraw's own parser, so a plain
  <code>.tldr</code> opens by the identical path with nothing removed. tldraw refuses unknown
  top-level keys, so tldraw.com declines a <code>.systemsketch</code> early and honestly instead of
  half-loading a board whose Blocks and cables it has no utils for.</p>

  <div class="stats">
    <div class="stat"><b>__JOURNEY_PASSED__/__JOURNEY_TOTAL__</b><span>browser checks, product build</span></div>
    <div class="stat"><b>__STABLE_PASSED__/__STABLE_TOTAL__</b><span>checks on deployed Stable</span></div>
    <div class="stat"><b>__ENVELOPE_TESTS__ + __MODEL_TESTS__</b><span>unit tests on the format</span></div>
    <div class="stat"><b>__ENVELOPE_LINES__</b><span>lines in the whole format module</span></div>
  </div>

  <section>
    <h2 class="section-title">1 · What changed, concretely</h2>
    <p class="section-copy">Everything SystemSketch <b>makes</b> is now a <code>.systemsketch</code>:
    a new document, Save&nbsp;As, the untitled board a clean launch prepares. Everything it can
    <b>open</b> is both types. A <code>.tldr</code> already on disk is opened, edited and saved back
    <b>as a <code>.tldr</code></b>, unconverted — backwards compatibility means the old file survives
    the new app, not that the new app quietly rewrites it.</p>

    <div class="grid2">
      <figure>
        <img alt="The Open dialog listing a tldraw document and a SystemSketch document side by side" src="data:image/png;base64,__OPEN__" />
        <figcaption><b>Both types, one browser</b>Legacy is labelled <code>tldraw</code>, Pipeline
        <code>sketch</code>. Captured by the journey while driving File → Open… in the real app.</figcaption>
      </figure>
      <figure>
        <img alt="The rename dialog showing a .systemsketch suffix chip" src="data:image/png;base64,__RENAME__" />
        <figcaption><b>Rename never changes the type</b>The chip is the document's own suffix, so
        renaming <code>Old.tldr</code> gives <code>New.tldr</code>. Changing type is Save As, which
        rewrites the bytes.</figcaption>
      </figure>
    </div>
  </section>

  <section>
    <h2 class="section-title">2 · The envelope</h2>
    <p class="section-copy">The manifest is a plain inventory of the document rather than a judgement
    about which record types are "ours", so a reader can see what a file holds — two Blocks, one
    cable, two bindings — without loading the store, and the future <code>.tldr</code> exporter knows
    exactly what it has to detach. It is written first, so the first bytes of the file identify it.</p>

    <div class="card">
      <h3>Writing — wrap portable tldraw JSON</h3>
      <pre>__ENCODE_SRC__</pre>
    </div>
    <div class="card" style="margin-top:14px">
      <h3>Reading — strip it back off, or leave a <code>.tldr</code> untouched</h3>
      <pre>__DECODE_SRC__</pre>
    </div>
    <p class="section-copy" style="margin-top:18px">A document without the key comes back
    <b>byte-identical</b>: a <code>.tldr</code> is never re-serialized on the way in, so nothing can be
    lost in a round trip SystemSketch did not intend to make. The name appearing inside a text shape is
    not mistaken for the envelope — the fast-path string test only skips work, and the slow path still
    checks the actual top-level key.</p>
  </section>

  <section>
    <h2 class="section-title">3 · The suffix decides the encoding, in both directions</h2>
    <p class="section-copy">Two processes enforce the same rule independently. The browser authors the
    envelope; the Python host refuses to write a document whose bytes disagree with its extension.
    That is what stops the two types from quietly becoming one type with two names — and it is why a
    single mutation in the browser (stop wrapping, or always wrap) turns the browser journey red at
    the save, not three screens later.</p>
    <pre>__SUFFIX_RULE_SRC__</pre>
    <p class="section-copy" style="margin-top:18px">Reading is the lenient direction on purpose: a
    <code>.tldr</code> hand-renamed to <code>.systemsketch</code> in the file manager still opens. A
    document written by a <b>newer</b> SystemSketch is refused rather than guessed at.</p>
  </section>

  <section>
    <h2 class="section-title">4 · What tldraw itself makes of each type</h2>
    <p class="section-copy">Not an argument — a test. The unit suite imports the real
    <code>parseTldrawJsonFile</code>, the same function the tldraw.com editor uses to open a file, and
    puts the identical records through it three times.</p>
    <div class="grid3">
      <div class="card"><h3><span class="tag ok">ACCEPTS</span></h3><p>The plain <code>.tldr</code>.
      Nothing about this changed.</p></div>
      <div class="card"><h3><span class="tag warn">REFUSES</span></h3><p>The same records with the
      envelope in front: <code>notATldrawFile</code>. tldraw's top-level validator is
      <code>T.object(…)</code> without <code>allowUnknownProperties</code>.</p></div>
      <div class="card"><h3><span class="tag ok">ACCEPTS</span></h3><p>The decoded core. So the
      refusal is the envelope and nothing else.</p></div>
    </div>
  </section>

  <section>
    <h2 class="section-title">5 · Driven in the real app</h2>
    <p class="section-copy">Two Blocks and a semantic cable authored through the real tools, then read
    back <b>off the disk the app wrote to</b> — never off the app's report of itself.</p>
    <div class="grid2">
      <figure>
        <img alt="Two Blocks wired together on a .systemsketch board" src="data:image/png;base64,__SKETCH__" />
        <figcaption><b>Pipeline.systemsketch</b>Authored, saved, and reopened with the cable intact.</figcaption>
      </figure>
      <figure>
        <img alt="The same board opened from a legacy .tldr file" src="data:image/png;base64,__LEGACY__" />
        <figcaption><b>Legacy.tldr</b>The same records with the envelope removed by hand — opens, edits,
        and saves back with no envelope added.</figcaption>
      </figure>
    </div>
    <table style="margin-top:22px">
      <thead><tr><th>Check</th><th>Claim</th><th></th><th>Observed</th></tr></thead>
      <tbody>__JOURNEY_ROWS__</tbody>
    </table>
    <pre style="margin-top:18px">npm run test:file-type</pre>
  </section>

  <section>
    <h2 class="section-title">6 · And on the build you actually open</h2>
    <p class="section-copy">A fresh build proving itself is a different claim from the immutable
    Stable build behind the dock icon. This drives <b>__STABLE_BUILD__</b> on
    <code>__STABLE_URL__</code>, against a scratch board it deletes afterwards — the
    <code>~/SystemSketch</code> workspace is never opened or written.</p>
    <figure>
      <img alt="The deployed Stable build with a .systemsketch document open" src="data:image/png;base64,__STABLE__" />
      <figcaption><b>Stable __STABLE_BUILD__</b>The title reads <code>stable-file-type-probe</code>
      with the saved dot green, two Blocks, one bound cable.</figcaption>
    </figure>
    <table style="margin-top:22px">
      <thead><tr><th>Check</th><th>Claim</th><th></th><th>Observed</th></tr></thead>
      <tbody>__STABLE_ROWS__</tbody>
    </table>
    <pre style="margin-top:18px">npm run test:file-type-stable</pre>
  </section>

  <section>
    <h2 class="section-title">7 · A window this work opened on your desktop, and closed</h2>
    <p class="section-copy">Adding the first journey that reaches <b>File → Open…</b> found that the
    browser journeys inherit <code>DISPLAY</code>, so the test's Python controller launched a real GTK
    file chooser onto the desktop and blocked until someone closed it. No existing journey had ever
    driven that path. Two fixes, and the product one is the real one: an installed <code>zenity</code>
    is not a desktop session, so a controller with no <code>DISPLAY</code> or
    <code>WAYLAND_DISPLAY</code> now reports the native chooser <b>unavailable</b> and the in-app
    browser takes over. The shared harness additionally starts its API child with no display at all,
    so no journey can raise a window again.</p>
  </section>

  <section>
    <h2 class="section-title">8 · Deliberately not done</h2>
    <div class="grid2">
      <div class="card">
        <h3><span class="tag info">NEXT</span> Export to <code>.tldr</code></h3>
        <p>The one-way <b>detach to primitives</b> export — reduce every Block and cable to a group of
        stock shapes, and record enough in the group's metadata to rebuild it. That needs the
        detach-to-primitive command, which does not exist yet. Saving As <code>.tldr</code> today
        writes a real tldraw file that still contains semantic records, so SystemSketch reopens it
        perfectly and tldraw.com does not.</p>
      </div>
      <div class="card">
        <h3><span class="tag info">UNCHANGED</span> Existing boards</h3>
        <p>Nothing on disk was migrated or renamed. An existing
        <code>~/SystemSketch/Untitled.tldr</code> stays the document a clean launch opens, and the
        repo's other browser journeys still point at <code>.tldr</code> boards — which now doubles as
        the standing backwards-compatibility net.</p>
      </div>
    </div>
  </section>

  <section>
    <h2 class="section-title">9 · Where it lives</h2>
    <table>
      <thead><tr><th>File</th><th>Role</th><th>Lines</th></tr></thead>
      <tbody>
        <tr><td class="mono">src/workspace/systemSketchFile.ts</td><td>The envelope. Pure string → string; no tldraw, no editor, no DOM.</td><td class="mono">__ENVELOPE_LINES__</td></tr>
        <tr><td class="mono">src/workspace/workspaceModel.ts</td><td>Suffix rules: which type a path is, what a typed name becomes, what a rename keeps.</td><td class="mono">__MODEL_LINES__</td></tr>
        <tr><td class="mono">src/workspace/LocalWorkspace.tsx</td><td>Decode before <code>parseTldrawJsonFile</code>; encode for the path being written.</td><td class="mono">—</td></tr>
        <tr><td class="mono">scripts/workspace_store.py</td><td>Independent enforcement, listing kinds, the default document, the chooser's session guard.</td><td class="mono">__STORE_LINES__</td></tr>
        <tr><td class="mono">scripts/install_desktop.py</td><td><code>application/vnd.systemsketch+json</code> beside the tldraw type.</td><td class="mono">—</td></tr>
        <tr><td class="mono">tests/systemsketch_file_type_smoke.mjs</td><td>The browser journey behind §5.</td><td class="mono">—</td></tr>
        <tr><td class="mono">tests/stable_file_type_probe.mjs</td><td>The deployed-Stable probe behind §6.</td><td class="mono">—</td></tr>
      </tbody>
    </table>
  </section>

  <footer>
    Built from the live repo by <code>docs/build_systemsketch_file_type.py</code> · product build
    <code>__BUILD__</code> · Stable <code>__STABLE_BUILD__</code>. Every count, snippet and verdict on
    this page was measured at build time from the tree and from the runs that produced them.
  </footer>

</div>
</body>
</html>
'''


if __name__ == "__main__":
    main()
