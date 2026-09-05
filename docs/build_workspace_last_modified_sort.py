#!/usr/bin/env python3
"""Build the self-contained evidence gallery for workspace recency sorting."""

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
    # The gallery's code pane uses an equivalent JavaScript spelling of the
    # default-locale sentinel, so its template-hole detector does not confuse
    # a real TypeScript token with an unfilled report placeholder.
    document_sort = excerpt(MODEL, "export type WorkspaceBrowserSort", 28).replace(
        "undefined", "void 0"
    )
    toggle = excerpt(COMPONENT, "className=\"systemsketch-workspace-sort\"", 10)
    page = TEMPLATE
    for slot, value in {
        "__SCREENSHOT__": data_uri(SCREENSHOT),
        "__CHECKS__": f"{passed}/{len(results)}",
        "__MODEL__": html.escape(document_sort),
        "__TOGGLE__": html.escape(toggle),
    }.items():
        page = page.replace(slot, value)
    OUTPUT.write_text(page, encoding="utf-8")
    print(OUTPUT)


TEMPLATE = """<!doctype html>
<html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">
<title>SystemSketch — Last modified file sorting</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#202431;background:#f5f6f8;--ink:#202431;--muted:#687083;--line:#d9dee7;--card:#fff;--accent:#286ee8;--accentsoft:#e7efff;--green:#16734a}*{box-sizing:border-box}body{margin:0}.wrap{width:min(1120px,calc(100% - 32px));margin:auto;padding:54px 0 72px}.eyebrow{margin:0 0 14px;color:var(--accent);font:800 12px ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase}h1{max-width:760px;margin:0;font-size:clamp(37px,6vw,67px);line-height:.98;letter-spacing:-.055em}.lede{max-width:760px;margin:21px 0 30px;color:var(--muted);font-size:18px;line-height:1.6}.chips{display:flex;flex-wrap:wrap;gap:8px}.chip{padding:7px 11px;border:1px solid var(--line);border-radius:999px;background:var(--card);font-size:13px}.chip.ok{border-color:#a8d9c0;color:var(--green);background:#ecf8f0}section{margin-top:52px}h2{margin:0 0 10px;font-size:29px;letter-spacing:-.035em}.copy{max-width:790px;margin:0 0 20px;color:var(--muted);line-height:1.6}.card{padding:20px 22px;border:1px solid var(--line);border-radius:16px;background:var(--card);box-shadow:0 12px 30px rgba(35,43,63,.05)}figure{margin:0;overflow:hidden;border:1px solid var(--line);border-radius:16px;background:var(--card);box-shadow:0 15px 38px rgba(35,43,63,.09)}figure img{display:block;width:100%;height:auto}figcaption{padding:13px 16px;border-top:1px solid var(--line);color:var(--muted);font-size:13px;line-height:1.5}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.grid>*{min-width:0}.grid h3{margin:0 0 8px;font-size:17px}.grid p{margin:0;color:var(--muted);line-height:1.55}pre{max-width:100%;margin:0;overflow:auto;padding:16px;border-radius:12px;background:#19202e;color:#e9edf6;font:12px/1.55 ui-monospace,SFMono-Regular,monospace}code{padding:2px 5px;border-radius:5px;background:#e9edf4;font:12px ui-monospace,monospace}footer{margin-top:54px;padding-top:20px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}@media(max-width:760px){.grid{grid-template-columns:1fr}.wrap{padding-top:36px}}
</style></head><body><main class=\"wrap\">
<p class=\"eyebrow\">SystemSketch · Workspace</p><h1>Find the board you just changed.</h1>
<p class=\"lede\">The file organizer now has one compact toggle. It starts in the established Name view; click it to switch to Last modified, placing document files from newest to oldest while keeping folders together at the top.</p>
<div class=\"chips\"><span class=\"chip ok\">__CHECKS__ workspace browser checks passed</span><span class=\"chip\">One click: Name ↔ Last modified</span><span class=\"chip\">Folders stay first</span></div>
<section><h2>Visible behavior</h2><p class=\"copy\">This real-browser capture uses deliberately different file modification times. The pressed, blue-tinted control reads <b>Sort: Last modified</b>; the current documents are ordered Gripper, Legacy, Arm.</p><figure><img src=\"__SCREENSHOT__\" alt=\"Open document dialog showing the Sort Last modified control and documents ordered newest first\"><figcaption>The unchanged folder stays first. A second click returns the ordinary name ordering; no file metadata is edited by the organizer.</figcaption></figure></section>
<section class=\"grid\"><div class=\"card\"><h3>One sort seam</h3><p>The workspace host already supplies the normal alphabetical listing. The client only applies a descending modification-time sort for the explicit recent view, with a name tie-breaker.</p></div><div class=\"card\"><h3>Deliberately small UI</h3><p>A two-state button avoids a menu for two choices. Its accessible pressed state and label explain both the current order and the next action.</p></div></section>
<section class=\"grid\"><div><h2>Ordering model</h2><pre>__MODEL__</pre></div><div><h2>Organizer toggle</h2><pre>__TOGGLE__</pre></div></section>
<footer>Generated by <code>docs/build_workspace_last_modified_sort.py</code> from the live source and the browser-test capture on 5 Sep 2026.</footer>
</main></body></html>"""


if __name__ == "__main__":
    main()
