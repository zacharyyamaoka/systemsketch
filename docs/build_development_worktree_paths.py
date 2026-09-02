#!/usr/bin/env python3
"""Build the self-contained development worktree-path implementation gallery."""

from __future__ import annotations

import base64
import html
import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "development-worktree-paths-2026-09-02.html"
LIVE_CAPTURE = ROOT / "docs" / "assets" / "development-worktree-paths-branch-region.png"
FIXTURE_CAPTURE = ROOT / "sketches" / "review" / "development-worktree-paths.png"
FIXTURE = ROOT / "sketches" / "review" / "development-worktree-paths.systemsketch"


def image_data(path: Path) -> str:
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def run(*command: str) -> str:
    completed = subprocess.run(
        command,
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=True,
    )
    return (completed.stdout + completed.stderr).strip()


def main() -> None:
    server_source = (ROOT / "scripts" / "server.py").read_text(encoding="utf-8")
    track_source = (ROOT / "scripts" / "new_track.py").read_text(encoding="utf-8")
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    fixture_shapes = sum(record.get("typeName") == "shape" for record in fixture["records"])
    fixture_bindings = sum(record.get("typeName") == "binding" for record in fixture["records"])
    python_proof = run(
        "python3",
        "-m",
        "unittest",
        "tests.test_workspace_store",
        "tests.test_release_system",
        "-v",
    )
    browser_proof = run("npm", "run", "test:worktree-paths")
    facts = {
        "previewFlag": "--allow-source-root" in server_source,
        "trackTemplateUsesFlag": "--allow-source-root" in track_source,
        "fixtureShapes": fixture_shapes,
        "fixtureBindings": fixture_bindings,
        "pythonTests": "Ran 31 tests" in python_proof and "OK" in python_proof,
        "browserOpenSaveReload": "PASS source-worktree URL opened" in browser_proof,
        "browserOutsideRejected": "PASS unrelated machine path remained rejected" in browser_proof,
    }
    proof_keys = (
        "previewFlag",
        "trackTemplateUsesFlag",
        "pythonTests",
        "browserOpenSaveReload",
        "browserOutsideRejected",
    )
    if not all(facts[key] for key in proof_keys) or fixture_shapes < 1:
        raise SystemExit(f"implementation evidence is incomplete: {facts}")

    exact_url = (
        "http://127.0.0.1:4410/?board=%2Fhome%2Fbam%2Fsystemsketch-track-"
        "branch-region%2Fsketches%2Freview%2Fbranch-region.systemsketch"
    )
    output = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Development worktree document links · SystemSketch</title>
<style>
:root {{ color-scheme: dark; --bg:#111315; --panel:#1b1e22; --ink:#f4f2eb; --muted:#a9afb8; --blue:#4b9cff; --green:#53d88a; --orange:#ff9f43; --red:#ff6b6b; }}
* {{ box-sizing:border-box }}
body {{ margin:0; background:radial-gradient(circle at 75% -10%,#18314d 0,transparent 38%),var(--bg); color:var(--ink); font:16px/1.5 Inter,ui-sans-serif,system-ui,sans-serif; }}
main {{ width:min(1180px,calc(100% - 40px)); margin:auto; padding:64px 0 90px; }}
h1 {{ font-size:clamp(42px,7vw,82px); line-height:.94; letter-spacing:-.055em; margin:18px 0 24px; max-width:900px; }}
h2 {{ font-size:28px; margin:0 0 14px; letter-spacing:-.02em }}
p {{ color:var(--muted); max-width:800px }}
.eyebrow {{ color:var(--blue); font-weight:800; text-transform:uppercase; letter-spacing:.16em; font-size:12px }}
.lede {{ font-size:21px; color:#d7dbe0; }}
.chips {{ display:flex; flex-wrap:wrap; gap:10px; margin:26px 0 44px }}
.chip {{ padding:8px 13px; border:1px solid #39414a; border-radius:999px; background:#171a1e; color:#d8dde3; font-size:13px }}
.flow {{ display:grid; grid-template-columns:1fr 72px 1fr 72px 1fr; align-items:center; margin:34px 0 54px; }}
.node {{ min-height:150px; padding:22px; background:linear-gradient(145deg,#20252b,#181b1f); border:1px solid #353c45; border-radius:18px; }}
.node strong {{ display:block; font-size:19px; margin-bottom:8px }}
.node small {{ color:var(--muted) }}
.node.allowed {{ border-color:#246d49; box-shadow:inset 0 0 0 1px #246d49 }}
.node.blocked {{ border-color:#69383c; }}
.arrow {{ text-align:center; color:var(--blue); font-size:30px }}
.grid {{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:22px; margin:28px 0 54px }}
.card {{ padding:24px; background:rgba(27,30,34,.92); border:1px solid #343a42; border-radius:18px; }}
.card b {{ color:var(--green) }}
.shot {{ margin:24px 0 56px; background:#08090a; border:1px solid #343a42; border-radius:20px; overflow:hidden; box-shadow:0 25px 65px #0008; }}
.shot img {{ display:block; width:100%; height:auto }}
.caption {{ padding:14px 18px; color:var(--muted); font-size:14px }}
code {{ color:#d7e9ff; background:#202a35; padding:2px 6px; border-radius:6px }}
a {{ color:#8bc2ff }}
.url {{ display:block; padding:16px 18px; margin:18px 0; overflow-wrap:anywhere; background:#151d27; border:1px solid #315273; border-radius:12px; font-family:ui-monospace,monospace }}
.proof {{ border-left:4px solid var(--green) }}
@media(max-width:800px) {{ .flow {{ grid-template-columns:1fr }} .arrow {{ transform:rotate(90deg); padding:10px }} .grid {{ grid-template-columns:1fr }} }}
</style>
</head>
<body><main>
<div class="eyebrow">SystemSketch · implementation proof · 2026-09-02</div>
<h1>Worktree boards open directly in development.</h1>
<p class="lede">Preview now trusts exactly two places: its isolated board folder and its own source worktree. The broad filesystem escape hatch was deliberately not added.</p>
<div class="chips"><span class="chip">Stable unchanged</span><span class="chip">File browser still isolated</span><span class="chip">Direct ?board= links work</span><span class="chip">Digest-fenced autosave retained</span></div>

<section class="flow">
  <div class="node allowed"><strong>.track/boards</strong><small>Normal File browser, Untitled documents, and isolated test boards.</small></div>
  <div class="arrow">+</div>
  <div class="node allowed"><strong>this source worktree</strong><small>Explicit <code>?board=</code> documents such as <code>sketches/review/*.systemsketch</code>.</small></div>
  <div class="arrow">≠</div>
  <div class="node blocked"><strong>the rest of the machine</strong><small>Neighboring worktrees, <code>/tmp</code>, and arbitrary absolute paths remain rejected.</small></div>
</section>

<section><h2>The reported board, open in the real branch UI</h2>
<p>The branch-region fixture was loaded through the new controller policy. The title is green and the former red workspace error is absent.</p>
<a class="url" href="{html.escape(exact_url)}">{html.escape(exact_url)}</a>
<div class="shot"><img src="{image_data(LIVE_CAPTURE)}" alt="Branch-region review board open in SystemSketch"><div class="caption">Real headless Chrome capture · branch-region Vite source · development controller · exact absolute board path.</div></div></section>

<section><h2>The boundary stayed narrow</h2><div class="grid">
  <div class="card"><b>Preview-only</b><p><code>--allow-source-root</code> is refused on Stable. Both the normal Preview launcher and generated track launcher opt in explicitly.</p></div>
  <div class="card"><b>Listing unchanged</b><p>The workspace browser still lists only <code>.track/boards</code>. The source root is available only when a direct document path is supplied.</p></div>
  <div class="card proof"><b>31 Python tests</b><p>Root authorization, Stable refusal, launch wiring, atomic saves, conflicts, rename, trash, and file-format rules all pass.</p></div>
  <div class="card proof"><b>Real Chrome journey</b><p>A source-worktree board opened, autosaved, cold-reopened, and retained its shape. An unrelated machine path returned HTTP 400.</p></div>
</div></section>

<section><h2>Human review fixture</h2>
<p>The fixture itself lives outside the normal board root. Drag its Block, wait for Saved, and reload the exact URL—the moved position must survive.</p>
<div class="shot"><img src="{image_data(FIXTURE_CAPTURE)}" alt="Development worktree paths review fixture"><div class="caption">Generated through the real editor and autosave path · {fixture_shapes} shapes · {fixture_bindings} bindings · cold-reopen verified.</div></div></section>
</main></body></html>"""
    OUTPUT.write_text(output, encoding="utf-8")
    print(json.dumps({"output": str(OUTPUT), "facts": facts}, indent=2))


if __name__ == "__main__":
    main()
