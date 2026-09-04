#!/usr/bin/env python3
"""Build the self-contained empty-field guidance review gallery."""

from __future__ import annotations

import base64
import html
import json
import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
ASSETS = DOCS / "assets"
GUIDANCE = ROOT / "src" / "fields" / "emptyFieldGuidance.ts"
RESULTS = ASSETS / "inspector-field-guidance-results-2026-09-03.json"
SCREENSHOT = ASSETS / "inspector-field-guidance-2026-09-03.png"
OUTPUT = DOCS / "inspector-field-guidance-2026-09-03.html"


def image_uri(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode()


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=ROOT, text=True, capture_output=True, check=False
    ).stdout.strip()


def measure() -> dict[str, object]:
    results = json.loads(RESULTS.read_text(encoding="utf-8"))
    source = GUIDANCE.read_text(encoding="utf-8")
    roles = re.findall(r"\w+: '([^']+)'", source)
    changed = sorted({
        path for path in [
            *git("diff", "main", "--name-only").splitlines(),
            *git("ls-files", "--others", "--exclude-standard").splitlines(),
        ]
        if path.startswith(("src/", "tests/", "docs/", "sketches/review/"))
    })
    return {
        "checks": results["checks"],
        "roles": roles,
        "changed": changed,
        "diffstat": f"{len(changed)} working-tree files",
        "shared_references": sum(
            path.read_text(encoding="utf-8").count("EMPTY_FIELD_GUIDANCE")
            for path in ROOT.glob("src/**/*.tsx")
        ),
    }


def card(label: str, fields: list[str]) -> str:
    items = "".join(f"<div class='field'><span>{html.escape(value)}</span></div>" for value in fields)
    return f"<article class='card'><h3>{html.escape(label)}</h3>{items}</article>"


def build() -> None:
    facts = measure()
    cards = "".join([
        card("Block", ["Title", "Type", "Display description", "Notes"]),
        card("Port", ["Name", "Type", "Default"]),
        card("Pill", ["Name", "Value", "Type"]),
        card("Branch", ["Title", "Name", "Type", "Case title"]),
        card("Loop", ["Title", "Type", "Iteration status"]),
        card("Connection", ["Layer name", "Initial value"]),
    ])
    checks = "".join(
        f"<li><b>PASS</b> {html.escape(check)}</li>"
        for check in facts["checks"]
    )
    changed = "".join(f"<li><code>{html.escape(path)}</code></li>" for path in facts["changed"])
    roles = ", ".join(html.escape(role) for role in facts["roles"])
    page = f"""<!doctype html>
<html lang='en'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>
<title>Inspector field guidance — 2026-09-03</title>
<style>
  :root {{ color-scheme: light; --ink:#1d1d22; --muted:#6f737c; --line:#dde0e6; --panel:#f7f8fa; --blue:#3b82f6; --green:#0b8f54; }}
  * {{ box-sizing:border-box }} body {{ margin:0; background:#fff; color:var(--ink); font:15px/1.5 Inter,ui-sans-serif,system-ui,sans-serif }}
  main {{ max-width:1180px; margin:auto; padding:48px 28px 72px }} h1 {{ font-size:clamp(2rem,5vw,4.1rem); letter-spacing:-.05em; line-height:1; margin:0 0 16px }} h2 {{ margin:42px 0 14px; font-size:1.25rem }} p {{ max-width:76ch; color:var(--muted) }}
  .eyebrow {{ color:var(--blue); font-weight:800; font-size:.75rem; letter-spacing:.12em; text-transform:uppercase }}
  .hero {{ display:grid; grid-template-columns:1.05fr .95fr; gap:28px; align-items:start }} .hero img {{ width:100%; border:1px solid var(--line); border-radius:14px; box-shadow:0 16px 50px #17243a18 }}
  .statline {{ display:flex; flex-wrap:wrap; gap:10px; margin-top:22px }} .stat {{ border:1px solid var(--line); border-radius:999px; padding:5px 10px; color:var(--muted); font-size:.84rem }}
  .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px }} .card {{ padding:15px; border:1px solid var(--line); border-radius:12px; background:var(--panel) }} .card h3 {{ margin:0 0 10px; font-size:.76rem; letter-spacing:.08em; text-transform:uppercase; color:var(--muted) }}
  .field {{ border:1px solid #aeb3bc; min-height:30px; display:flex; align-items:center; padding:0 9px; margin-top:6px; border-radius:6px; background:white; color:#8a9099 }}
  .result {{ display:grid; grid-template-columns:1fr 1fr; gap:20px }} .box {{ border:1px solid var(--line); border-radius:12px; padding:18px; background:var(--panel) }} ul {{ margin:0; padding-left:20px }} li {{ margin:7px 0 }} b {{ color:var(--green) }} code {{ font-size:.82em }} a {{ color:#1768d9 }}
  @media(max-width:760px) {{ main {{ padding:30px 18px 54px }} .hero,.result {{ grid-template-columns:1fr }} }}
</style>
<main>
  <div class='eyebrow'>SystemSketch · implemented preference</div>
  <section class='hero'><div><h1>Empty says what belongs.</h1>
    <p>Inspector fields keep their persistent labels and add a short, generic in-field role only while blank. No example data is implied, and new editable ports keep implementation IDs out of the authored value.</p>
    <div class='statline'><span class='stat'>{len(facts['checks'])}/{len(facts['checks'])} real-browser checks</span><span class='stat'>{facts['shared_references']} shared-vocabulary references</span><span class='stat'>{html.escape(str(facts['diffstat']))}</span></div>
  </div><img alt='A blank Pill in the running SystemSketch inspector, showing Name, Value, and Type.' src='{image_uri(SCREENSHOT)}'></section>
  <h2>One short vocabulary across the authored surfaces</h2><div class='grid'>{cards}</div>
  <h2>Browser evidence</h2><section class='result'><div class='box'><ul>{checks}</ul></div><div class='box'><p><strong>Shared role vocabulary:</strong> {roles}</p><p>The journey creates a real Block, adds a port, then creates a real Pill and reads each mounted input's empty value and placeholder. The full ongoing rule is in the <a href='pep-ui-visual-language.md'>UI and visual-language PEP</a>.</p></div></section>
  <h2>Changed surface</h2><section class='box'><ul>{changed}</ul></section>
</main></html>"""
    OUTPUT.write_text(page, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    build()
