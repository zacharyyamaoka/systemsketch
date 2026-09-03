#!/usr/bin/env python3
"""Build the self-contained Ctrl+P command-palette implementation gallery."""

from __future__ import annotations

import base64
import html
import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "command-palette-ctrl-p-2026-09-02.html"
RESULTS = ROOT / "docs" / "assets" / "command-palette-results.json"
COMMANDS_SHOT = ROOT / "docs" / "assets" / "command-palette-commands-2026-09-02.png"
FIXTURE_SHOT = ROOT / "sketches" / "review" / "command-palette-ctrl-p.png"
FIXTURE = ROOT / "sketches" / "review" / "command-palette-ctrl-p.systemsketch"
SOURCE = ROOT / "src" / "chrome" / "SystemSketchChrome.tsx"


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


def data_uri(path: Path) -> str:
    payload = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:image/png;base64,{payload}"


def source_excerpt() -> str:
    lines = SOURCE.read_text(encoding="utf-8").splitlines()
    chosen = lines[422:437]
    return "\n".join(f"{number:>4}  {line}" for number, line in enumerate(chosen, 423))


def main() -> None:
    results = json.loads(RESULTS.read_text(encoding="utf-8"))
    passing = sum(1 for item in results if item.get("ok"))
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    shapes = sum(1 for record in fixture["records"] if record.get("typeName") == "shape")
    bindings = sum(1 for record in fixture["records"] if record.get("typeName") == "binding")
    source = SOURCE.read_text(encoding="utf-8")
    checks = {
        "Ctrl+P routed": "key !== 'p'" in source,
        "Ctrl+K retained": "key !== 'k'" in source,
        "Ctrl+F retained": "key !== 'f'" in source,
        "Accessible shortcut": 'aria-keyshortcuts="Control+P Meta+P"' in source,
    }
    if not all(checks.values()) or passing != len(results):
        raise SystemExit("refusing to build from incomplete shortcut or browser evidence")

    check_cards = "".join(
        f'<div class="check"><b>✓ {html.escape(label)}</b><span>measured in the current source</span></div>'
        for label in checks
    )
    browser_checks = "".join(
        f'<li><span>✓</span>{html.escape(item["label"])}</li>' for item in results
    )
    head = git("rev-parse", "--short=12", "HEAD")
    branch = git("branch", "--show-current")
    document = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ctrl+P command palette · SystemSketch</title>
<style>
:root{{--paper:#f6f4ee;--ink:#242322;--muted:#6d6963;--line:#d9d4ca;--blue:#2f79df;--green:#1f7a4d;--card:#fff}}
*{{box-sizing:border-box}} body{{margin:0;background:var(--paper);color:var(--ink);font:16px/1.5 Inter,ui-sans-serif,system-ui,sans-serif}}
main{{width:min(1180px,calc(100% - 40px));margin:auto;padding:64px 0 96px}} h1{{max-width:820px;margin:0;font-size:clamp(42px,7vw,82px);line-height:.96;letter-spacing:-.055em}}
.eyebrow{{color:var(--blue);font:750 12px/1.2 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase}} .lede{{max-width:760px;margin:28px 0 38px;color:#45423d;font-size:21px}}
.hero-grid,.evidence{{display:grid;grid-template-columns:1fr 1fr;gap:20px}} .card,.shot{{border:1px solid var(--line);border-radius:18px;background:var(--card);box-shadow:0 10px 30px #37332b0c;overflow:hidden}}
.card{{padding:24px}} .binding{{display:flex;align-items:center;gap:18px;margin:18px 0}} kbd{{padding:10px 15px;border:1px solid #bdc9dd;border-bottom-width:3px;border-radius:10px;background:#f4f7fc;font:750 19px ui-monospace,monospace;color:#22589f}}
.arrow{{color:#a5a096;font-size:24px}} .mode{{font-weight:780}} .compat{{color:var(--muted)}} .checks{{display:grid;gap:10px;margin-top:20px}} .check{{display:flex;justify-content:space-between;gap:16px;padding-top:10px;border-top:1px solid #ece8e0}}
.check b{{color:var(--green)}} .check span{{color:var(--muted);font-size:13px;text-align:right}} section{{margin-top:54px}} h2{{font-size:30px;letter-spacing:-.03em}} .shot img{{display:block;width:100%;height:auto}} figcaption{{padding:14px 18px;color:var(--muted);font-size:14px}}
pre{{overflow:auto;padding:20px;border-radius:14px;background:#20242b;color:#e8edf3;font:13px/1.55 ui-monospace,monospace}} ul{{display:grid;gap:8px;padding:0;list-style:none}} li{{display:flex;gap:10px}} li span{{color:var(--green);font-weight:800}}
.meta{{margin-top:54px;padding-top:20px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}} a{{color:#225fae}} @media(max-width:780px){{.hero-grid,.evidence{{grid-template-columns:1fr}}}}
</style></head><body><main>
<div class="eyebrow">SystemSketch · implementation evidence · 2026-09-02</div>
<h1>Commands now open on Ctrl+P.</h1>
<p class="lede">The editor-style shortcut is the primary, advertised route into the existing command palette. It opens with search focused, intercepts the browser print command, and leaves the established Ctrl+K route working for existing habits and review boards.</p>
<div class="hero-grid">
  <article class="card"><div class="eyebrow">Primary path</div><div class="binding"><kbd>Ctrl P</kbd><span class="arrow">→</span><span class="mode">Commands</span></div><p>Mac keyboards get the matching <b>⌘P</b> route through the same modifier seam.</p><p class="compat">Compatibility: Ctrl+K still opens Commands; Ctrl+F still opens Find &amp; replace.</p></article>
  <article class="card"><div class="eyebrow">Measured contract</div><div class="checks">{check_cards}</div></article>
</div>
<section><h2>What the real browser saw</h2><div class="evidence">
  <figure class="shot"><img src="{data_uri(COMMANDS_SHOT)}" alt="SystemSketch command palette open over a populated board"><figcaption>Dispatched as a real Ctrl+P key event. The Commands dialog is centered and its query field owns focus.</figcaption></figure>
  <figure class="shot"><img src="{data_uri(FIXTURE_SHOT)}" alt="Review board with a Ctrl+P instruction card and pass condition"><figcaption>The review fixture has {shapes} real shapes and {bindings} bound cue-arrow records; the generator moved the target and cold-reopened the saved file.</figcaption></figure>
</div></section>
<section><h2>{passing}/{len(results)} command-palette checks pass</h2><div class="card"><ul>{browser_checks}</ul></div></section>
<section><h2>The routing seam stayed narrow</h2><pre>{html.escape(source_excerpt())}</pre></section>
<p class="meta">Built from <code>{html.escape(branch)}</code> at <code>{head}</code>, based on main <code>7d7d76d</code>. Review URL: <a href="http://127.0.0.1:4340/?board=%2Fhome%2Fbam%2Fsystemsketch-track-command-palette-ctrl-p%2Fsketches%2Freview%2Fcommand-palette-ctrl-p.systemsketch">open the live Ctrl+P fixture</a>.</p>
</main></body></html>"""
    OUT.write_text(document, encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
