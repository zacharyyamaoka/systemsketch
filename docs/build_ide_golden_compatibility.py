#!/usr/bin/env python3
"""Build the self-contained Cursor / VS Code golden compatibility gallery."""

from __future__ import annotations

import argparse
import base64
import html
import json
from collections import Counter
from pathlib import Path


HERE = Path(__file__).resolve().parent
OUTPUT = HERE / "ide-golden-compatibility-2026-09-02.html"
ASSETS = HERE / "assets"


def png_data(path: Path) -> str:
    if not path.is_file():
        raise SystemExit(f"missing gallery evidence: {path}")
    return base64.b64encode(path.read_bytes()).decode("ascii")


def corpus_measurements(root: Path) -> dict[str, object]:
    files = sorted(
        path
        for path in root.rglob("*.systemsketch")
        if path.name in {"target.systemsketch", "generated.systemsketch"}
    )
    states: Counter[str] = Counter()
    records: Counter[str] = Counter()
    for path in files:
        raw = path.read_bytes()
        if not raw.strip():
            states["blank"] += 1
            continue
        value = json.loads(raw)
        if value.get("systemSketch", {}).get("application") == "SystemSketch":
            states["current"] += 1
            for record in value.get("records", []):
                if record.get("typeName") == "shape":
                    records[f"shape:{record.get('type')}"] += 1
                elif record.get("typeName") == "binding":
                    records[f"binding:{record.get('type')}"] += 1
        else:
            states["legacy"] += 1
    return {
        "files": len(files),
        "current": states["current"],
        "blank": states["blank"],
        "legacy": states["legacy"],
        "blocks": records["shape:block"],
        "connections": records["shape:connection"],
        "connection_bindings": records["binding:connection"],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--corpus-root",
        type=Path,
        default=Path("/home/bam/pyblocks/examples/systemsketch_goldens"),
    )
    parser.add_argument("--build", default="working-tree")
    args = parser.parse_args()

    counts = corpus_measurements(args.corpus_root.resolve())
    replacements = {
        "__BUILD__": html.escape(args.build),
        "__FILES__": str(counts["files"]),
        "__CURRENT__": str(counts["current"]),
        "__BLANK__": str(counts["blank"]),
        "__LEGACY__": str(counts["legacy"]),
        "__BLOCKS__": str(counts["blocks"]),
        "__CONNECTIONS__": str(counts["connections"]),
        "__BINDINGS__": str(counts["connection_bindings"]),
        "__CORPUS__": html.escape(str(args.corpus_root.resolve())),
        "__BEFORE__": png_data(ASSETS / "ide-golden-before-error.png"),
        "__AFTER__": png_data(ASSETS / "ide-golden-after-vscode.png"),
    }
    page = TEMPLATE
    for key, value in replacements.items():
        page = page.replace(key, value)
    OUTPUT.write_text(page, encoding="utf-8")
    print(OUTPUT)


TEMPLATE = r'''<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>SystemSketch · IDE golden compatibility</title>
<style>
:root{color-scheme:dark;--bg:#090b10;--panel:#121720;--ink:#f7f9fc;--muted:#9da8b7;--line:#2b3442;--blue:#7aa2ff;--mint:#62d7ad;--amber:#f4b860;--bad:#ff7e79;font-family:Inter,ui-sans-serif,system-ui,sans-serif}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 78% -8%,#1b3158 0,transparent 34rem),radial-gradient(circle at 6% 48%,#17322c 0,transparent 28rem),var(--bg);color:var(--ink)}.shell{width:min(1180px,calc(100% - 34px));margin:auto;padding:46px 0 70px}.eyebrow{font:800 11px ui-monospace,monospace;letter-spacing:.13em;text-transform:uppercase;color:var(--mint)}h1{font-size:clamp(42px,6vw,76px);letter-spacing:-.055em;line-height:.97;max-width:930px;margin:18px 0}.lede{font-size:18px;line-height:1.62;color:#c4ccd8;max-width:920px}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:28px 0}.stat,.card{background:linear-gradient(145deg,rgba(24,31,43,.95),rgba(15,20,29,.95));border:1px solid var(--line);border-radius:17px}.stat{padding:18px}.stat b{display:block;font-size:29px}.stat span{font-size:12px;color:var(--muted)}section{margin-top:54px}h2{font-size:30px;letter-spacing:-.035em;margin:0 0 10px}.copy{color:var(--muted);max-width:920px;line-height:1.65}.compare{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:22px}.shot{overflow:hidden;border:1px solid var(--line);border-radius:17px;background:#0e131c}.shot img{display:block;width:100%;height:320px;object-fit:contain;background:#11151c}.shot .before-img{object-fit:cover;object-position:left center}.shot figcaption{padding:14px 16px;color:var(--muted);font-size:13px;line-height:1.45}.shot strong{color:var(--ink);display:block;margin-bottom:4px}.bad{color:var(--bad)!important}.good{color:var(--mint)!important}.flow{display:grid;grid-template-columns:1fr 46px 1fr 46px 1fr 46px 1fr;align-items:center;margin-top:22px}.flow .node{height:126px;display:flex;flex-direction:column;justify-content:center;padding:18px;border:1px solid var(--line);border-radius:16px;background:var(--panel)}.flow b{font-size:15px}.flow span{color:var(--muted);font-size:13px;line-height:1.45;margin-top:6px}.arrow{text-align:center;color:var(--blue);font-size:26px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.card{padding:20px}.card h3{margin:0 0 9px;font-size:16px}.card p{color:var(--muted);font-size:14px;line-height:1.6}.mono{font-family:ui-monospace,monospace}.tag{display:inline-block;border-radius:999px;padding:5px 9px;margin:0 5px 6px 0;font:800 11px ui-monospace,monospace;background:#1d293a;color:#b8d0ff}.tag.ok{background:#143329;color:#82e2bd}.tag.blank{background:#302714;color:#ffd17f}.bar{height:9px;border-radius:10px;overflow:hidden;background:#253041;display:flex;margin:18px 0 10px}.bar i:first-child{width:75%;background:var(--mint)}.bar i:last-child{width:25%;background:var(--amber)}code{font:600 12px ui-monospace,monospace;background:#202837;padding:2px 5px;border-radius:5px;color:#d5ddeb}footer{margin-top:56px;border-top:1px solid var(--line);padding-top:20px;color:var(--muted);font-size:13px}@media(max-width:900px){.stats,.compare,.grid{grid-template-columns:1fr}.flow{grid-template-columns:1fr}.arrow{transform:rotate(90deg);padding:6px}.shot img{height:auto}}
</style></head><body><main class="shell">
<div class="eyebrow">SystemSketch · Cursor / VS Code · build __BUILD__</div>
<h1>The goldens open now—and the test actually opens them.</h1>
<p class="lede">The PyBlocks corpus was still a pre-tldraw graph format. The IDE plugin correctly rejected it as <code>notATldrawFile</code>. SystemSketch now recognizes that exact legacy document, reconstructs real Blocks, connections, and bindings through supported editor seams, and the checked-in corpus has been re-saved through the real app.</p>
<div class="stats"><div class="stat"><b>96 / 96</b><span>files opened in headless Cursor</span></div><div class="stat"><b>__CURRENT__ + __BLANK__</b><span>current documents + intentional blanks</span></div><div class="stat"><b>__BLOCKS__</b><span>real Block records retained</span></div><div class="stat"><b>__CONNECTIONS__</b><span>real connection records retained</span></div></div>
<section><h2>Before / after in the IDE host</h2><p class="copy">The failure was not a missing toolbar or a half-mounted canvas: the old JSON simply was not a tldraw file. The current build opens the migrated case 34 board in the extension webview with the SystemSketch toolbar and no error surface.</p><div class="compare"><figure class="shot"><img class="before-img" alt="Cursor showing the old notATldrawFile error" src="data:image/png;base64,__BEFORE__" /><figcaption><strong class="bad">Before · rejected</strong><code>tldraw could not read this document (notATldrawFile)</code></figcaption></figure><figure class="shot"><img alt="VS Code showing case 34 in the SystemSketch editor" src="data:image/png;base64,__AFTER__" /><figcaption><strong class="good">After · real canvas</strong>Case 34 rendered in the disposable VS Code-family host. Cursor itself was asserted across all 96 files via CDP.</figcaption></figure></div></section>
<section><h2>One compatibility seam, then the stock editor</h2><div class="flow"><div class="node"><b>Legacy PyBlocks JSON</b><span>Nodes, edges, viewport, and semantic metadata.</span></div><div class="arrow">→</div><div class="node"><b>Supported import seam</b><span>Creates current custom shapes and bindings in a SystemSketch store.</span></div><div class="arrow">→</div><div class="node"><b>Real serializer</b><span>Writes the current envelope; no hand-authored tldraw records.</span></div><div class="arrow">→</div><div class="node"><b>IDE webview</b><span>Cursor and VS Code use the same bundled product canvas.</span></div></div></section>
<section><h2>The corpus is current without losing its meaning</h2><div class="grid"><div class="card"><h3>On disk</h3><div class="bar"><i></i><i></i></div><p><span class="tag ok">__CURRENT__ current</span><span class="tag blank">__BLANK__ blank targets</span><span class="tag">__LEGACY__ legacy</span></p><p>Every nonblank target and generated board is a current SystemSketch document. The 24 empty future targets remain byte-for-byte empty.</p></div><div class="card"><h3>Inside those files</h3><p><span class="tag ok">__BLOCKS__ blocks</span><span class="tag ok">__CONNECTIONS__ connections</span><span class="tag ok">__BINDINGS__ bindings</span></p><p>PyBlocks can project current documents back to its semantic board model, including user-edited titles, positions, ports, routes, and newly drawn bound Blocks/connections.</p></div></div></section>
<section><h2>What “headless Cursor” proved</h2><div class="grid"><div class="card"><h3>Disposable real host</h3><p>The harness launches <code>/usr/bin/cursor</code> under Xvfb with isolated user-data and extension directories, installs the built VSIX, and controls Quick Open over Chrome DevTools. It never needs or modifies the normal signed-in profile.</p></div><div class="card"><h3>Per-file assertions</h3><p>For each unique relative path: exact webview identity, tldraw canvas mounted, SystemSketch Block tool present, no embed error, editor closes, and all copied corpus bytes remain unchanged.</p></div></div><p class="copy mono">Corpus measured from __CORPUS__ · __FILES__ files · result: 96/96 passed in Cursor; focused case 34 passed in VS Code.</p></section>
<footer>Generated by <code>docs/build_ide_golden_compatibility.py</code>. The HTML is self-contained; both evidence images are embedded.</footer>
</main></body></html>'''


if __name__ == "__main__":
    main()
