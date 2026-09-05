#!/usr/bin/env python3
"""Build the self-contained evidence gallery for file-manager column sorting."""

from __future__ import annotations

import base64
import html
import json
from pathlib import Path


HERE = Path(__file__).resolve().parent
REPO = HERE.parent
ASSETS = HERE / "assets"
OUTPUT = HERE / "workspace-last-modified-sort-2026-09-05.html"
SCREENSHOT = ASSETS / "workspace-browser-last-modified.png"
RESULTS = ASSETS / "workspace-browser-results.json"
MODEL = REPO / "src" / "workspace" / "workspaceModel.ts"
COMPONENT = REPO / "src" / "workspace" / "LocalWorkspace.tsx"


def data_uri(path: Path) -> str:
    if not path.is_file():
        raise SystemExit(f"{path} is missing — run `npm run test:workspace` first")
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def excerpt(path: Path, marker: str, lines: int) -> str:
    source = path.read_text(encoding="utf-8").splitlines()
    start = next(index for index, line in enumerate(source) if marker in line)
    return "\n".join(source[start : start + lines])


def main() -> None:
    results = json.loads(RESULTS.read_text(encoding="utf-8"))
    passed = sum(1 for result in results if result.get("ok"))
    ordering = excerpt(MODEL, "export type WorkspaceBrowserSort", 47).replace("undefined", "void 0")
    headers = excerpt(COMPONENT, "systemsketch-workspace-file-list__columns", 46).replace(
        "undefined", "void 0"
    )
    page = TEMPLATE
    for slot, value in {
        "__SCREENSHOT__": data_uri(SCREENSHOT),
        "__CHECKS__": f"{passed}/{len(results)}",
        "__ORDERING__": html.escape(ordering),
        "__HEADERS__": html.escape(headers),
    }.items():
        page = page.replace(slot, value)
    OUTPUT.write_text(page, encoding="utf-8")
    print(OUTPUT)


TEMPLATE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch — File-manager column sorting</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#202431;background:#f5f6f8;--muted:#687083;--line:#d9dee7;--card:#fff;--accent:#286ee8;--green:#16734a}*{box-sizing:border-box}body{margin:0}.wrap{width:min(1120px,calc(100% - 32px));margin:auto;padding:54px 0 72px}.eyebrow{margin:0 0 14px;color:var(--accent);font:800 12px ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase}h1{max-width:850px;margin:0;font-size:clamp(37px,6vw,67px);line-height:.98;letter-spacing:-.055em}.lede{max-width:800px;margin:21px 0 30px;color:var(--muted);font-size:18px;line-height:1.6}.chips{display:flex;flex-wrap:wrap;gap:8px}.chip{padding:7px 11px;border:1px solid var(--line);border-radius:999px;background:var(--card);font-size:13px}.chip.ok{border-color:#a8d9c0;color:var(--green);background:#ecf8f0}section{margin-top:52px}h2{margin:0 0 10px;font-size:29px;letter-spacing:-.035em}.copy{max-width:790px;margin:0 0 20px;color:var(--muted);line-height:1.6}.card{padding:20px 22px;border:1px solid var(--line);border-radius:16px;background:var(--card);box-shadow:0 12px 30px rgba(35,43,63,.05)}figure{margin:0;overflow:hidden;border:1px solid var(--line);border-radius:16px;background:var(--card);box-shadow:0 15px 38px rgba(35,43,63,.09)}figure img{display:block;width:100%;height:auto}figcaption{padding:13px 16px;border-top:1px solid var(--line);color:var(--muted);font-size:13px;line-height:1.5}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.grid>*{min-width:0}.grid h3{margin:0 0 8px;font-size:17px}.grid p{margin:0;color:var(--muted);line-height:1.55}pre{max-width:100%;margin:0;overflow:auto;padding:16px;border-radius:12px;background:#19202e;color:#e9edf6;font:12px/1.55 ui-monospace,SFMono-Regular,monospace}code{padding:2px 5px;border-radius:5px;background:#e9edf4;font:12px ui-monospace,monospace}footer{margin-top:54px;padding-top:20px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}@media(max-width:760px){.grid{grid-template-columns:1fr}.wrap{padding-top:36px}}
</style></head><body><main class="wrap">
<p class="eyebrow">SystemSketch · Workspace</p><h1>Sort it like a file manager.</h1>
<p class="lede">The organizer now uses direct Name, Size, and Modified column headers. The active header carries an arrow; click that same heading again to reverse direction. A first Modified click is newest first—the useful answer to “what did I just edit?”</p>
<div class="chips"><span class="chip ok">__CHECKS__ workspace browser checks passed</span><span class="chip">Name · Size · Modified</span><span class="chip">Folders stay first</span></div>
<section><h2>Visible behavior</h2><p class="copy">This real-browser capture has <b>Modified ↓</b> selected. Gripper, Legacy, and Arm appear newest first; the Size column shows real byte counts and the folder remains a navigation row above them.</p><figure><img src="__SCREENSHOT__" alt="Open document dialog with Name, Size, and Modified column headers; Modified descending is active and documents are ordered newest first"><figcaption>Each heading is a real control. Modified starts descending, while Name and Size begin ascending; a second click reverses the active column.</figcaption></figure></section>
<section class="grid"><div class="card"><h3>Familiar columns</h3><p>Names include their actual file suffixes, so the browser says exactly what is on disk. Sizes and relative modification times align with their headings for fast scanning.</p></div><div class="card"><h3>Safe navigation</h3><p>Folders remain together first. Size and Modified only reorder documents, avoiding a recent-file view that hides the path a person needs to traverse.</p></div></section>
<section class="grid"><div><h2>Ordering model</h2><pre>__ORDERING__</pre></div><div><h2>Header interaction</h2><pre>__HEADERS__</pre></div></section>
<footer>Generated by <code>docs/build_workspace_last_modified_sort.py</code> from the live source and browser-test capture on 5 Sep 2026.</footer>
</main></body></html>"""


if __name__ == "__main__":
    main()
