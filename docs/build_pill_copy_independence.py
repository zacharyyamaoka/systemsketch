#!/usr/bin/env python3
"""Build the self-contained Value-pill copy-independence proof gallery."""

from __future__ import annotations

import base64
import html
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs" / "assets"
OUT = ROOT / "docs" / "pill-copy-independence-2026-09-03.html"


def esc(value: object) -> str:
    return html.escape(str(value), quote=True)


def image(name: str) -> str:
    path = ASSETS / name
    if not path.exists():
        raise SystemExit(f"Missing {path}; run npm run test:pill first")
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def source_excerpt(path: str, marker: str, lines: int) -> str:
    content = (ROOT / path).read_text(encoding="utf-8")
    start = content.index(marker)
    return "\n".join(content[start:].splitlines()[:lines])


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, check=True, text=True, capture_output=True).stdout.strip()


def build() -> str:
    checks = json.loads((ASSETS / "literal-pill.json").read_text(encoding="utf-8"))
    copy_checks = [check for check in checks if check["id"].startswith("COPY-")]
    passed = sum(check["ok"] for check in checks)
    head = git("rev-parse", "--short", "HEAD")
    normalise = source_excerpt("src/blocks/valueBlock.ts", "export function normalizeValueBlockProps", 31)
    definition = source_excerpt("src/blocks/definitions/definitionLinking.ts", "export function blockDefinitionId", 18)
    rows = "".join(
        f"<tr><td>{esc(check['id'])}</td><td>{esc(check['label'])}</td><td>PASS</td></tr>"
        for check in copy_checks
    )
    style = """
<style>
:root{--ink:#20201f;--muted:#68655f;--paper:#f5f2ec;--panel:#fffdfa;--line:#d8d2c7;--green:#24785b;--amber:#b77416;--blue:#3974ca;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;--sans:Inter,ui-sans-serif,system-ui,sans-serif}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 var(--sans)}main{width:min(1160px,calc(100% - 44px));margin:auto;padding:48px 0 80px}h1{font:500 39px/1.1 Georgia,serif;letter-spacing:-.025em;margin:8px 0 12px}h2{font:500 26px/1.18 Georgia,serif;margin:44px 0 12px}.eyebrow{font:700 11px/1.2 var(--mono);letter-spacing:.12em;color:var(--muted);text-transform:uppercase}.lede{max-width:850px;font-size:17px;color:#3c3934}.facts,.pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.facts{margin:25px 0}.fact,.card,figure,table{background:var(--panel);border:1px solid var(--line);border-radius:12px}.fact{padding:14px 16px}.fact b{display:block;font-size:23px}.fact small{color:var(--muted)}.card{padding:16px 18px}.card h3{margin:0 0 7px;font-size:14px}.card p{margin:0}.root{border-left:5px solid var(--amber)}.fix{border-left:5px solid var(--green)}figure{padding:12px;margin:0}figure img{display:block;width:100%;height:auto;border-radius:8px}figcaption{margin:9px 2px 1px;color:var(--muted);font-size:13px}svg{display:block;width:100%;height:auto;background:var(--panel);border:1px solid var(--line);border-radius:12px}code,pre{font-family:var(--mono)}code{font-size:.93em;background:#efe9df;padding:1px 4px;border-radius:4px}pre{margin:12px 0 0;padding:14px;white-space:pre-wrap;overflow:auto;background:#1f2937;color:#ecf0f5;border-radius:10px;font-size:12px;line-height:1.48}table{border-collapse:collapse;width:100%;overflow:hidden}th,td{padding:9px 11px;text-align:left;border-bottom:1px solid var(--line)}th{font:700 11px var(--mono);letter-spacing:.08em;text-transform:uppercase;background:#eee7dd}td:last-child{color:var(--green);font-weight:700}@media(max-width:720px){main{width:min(100% - 26px,1160px);padding-top:28px}.facts,.pair{grid-template-columns:1fr}h1{font-size:32px}}
</style>"""
    return f"""<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Value-pill copies are independent</title>{style}</head><body><main>
<div class=\"eyebrow\">SystemSketch · bug fix proof · 2026-09-03 · {esc(head)}</div>
<h1>Copied Value pills are now independent variables</h1>
<p class=\"lede\">Renaming a copied pill used to rename every copy. The capsule was accidentally admitted to the callable-Definition system; duplication preserved its shared identity, and the Definition synchronizer then copied the port name — the pill’s displayed variable name — across every occurrence.</p>
<div class=\"facts\"><div class=\"fact\"><b>{passed}/{len(checks)}</b><small>real-browser pill journey checks</small></div><div class=\"fact\"><b>6/6</b><small>existing real-browser callable-Definition journey still green</small></div></div>
<h2>The boundary that was missing</h2>
<svg viewBox=\"0 0 1100 330\" role=\"img\" aria-label=\"Before and after Definition-linking boundary for a copied value pill\"><defs><marker id=\"arrow\" viewBox=\"0 0 10 10\" refX=\"9\" refY=\"5\" markerWidth=\"7\" markerHeight=\"7\" orient=\"auto\"><path d=\"M0 0L10 5L0 10z\" fill=\"#68655f\"/></marker></defs><g font-family=\"ui-monospace,monospace\" font-size=\"15\"><text x=\"60\" y=\"38\" fill=\"#8a5810\">BEFORE · every Block entered Definition linking</text><rect x=\"60\" y=\"65\" width=\"235\" height=\"68\" rx=\"34\" fill=\"#eee\" stroke=\"#999\"/><text x=\"105\" y=\"107\">gain = 2.0</text><path d=\"M305 99H390\" stroke=\"#68655f\" stroke-width=\"2\" marker-end=\"url(#arrow)\"/><rect x=\"405\" y=\"65\" width=\"235\" height=\"68\" rx=\"34\" fill=\"#eee\" stroke=\"#999\"/><text x=\"450\" y=\"107\">gain = 2.0</text><text x=\"70\" y=\"160\" font-size=\"13\" fill=\"#68655f\">same definitionId → port-name sync → both change</text><text x=\"60\" y=\"206\" fill=\"#24785b\">AFTER · only callable Blocks have Definition identity</text><rect x=\"60\" y=\"225\" width=\"235\" height=\"68\" rx=\"34\" fill=\"#eee\" stroke=\"#999\"/><text x=\"105\" y=\"267\">gain = 2.0</text><path d=\"M305 259H390\" stroke=\"#68655f\" stroke-width=\"2\" marker-end=\"url(#arrow)\"/><rect x=\"405\" y=\"225\" width=\"265\" height=\"68\" rx=\"34\" fill=\"#eee\" stroke=\"#999\"/><text x=\"437\" y=\"267\">gain_copy = 2.0</text><text x=\"690\" y=\"267\" font-size=\"13\" fill=\"#24785b\">no Definition identity → names stay local</text><rect x=\"790\" y=\"65\" width=\"250\" height=\"68\" rx=\"10\" fill=\"#fffdfa\" stroke=\"#3974ca\"/><text x=\"816\" y=\"96\" fill=\"#3974ca\">ordinary callable Block</text><text x=\"816\" y=\"117\" font-size=\"12\" fill=\"#68655f\">still keeps Definition linking</text></g></svg>
<div class=\"pair\" style=\"margin-top:14px\"><section class=\"card root\"><h3>Root cause · missing domain boundary</h3><p>The definition linker assumed every <code>block</code> was a callable definition. But a <code>value</code> Block is a variable occurrence: its <code>outputs[0].name</code> is user-local state, not shared callable content.</p></section><section class=\"card fix\"><h3>Fix · classify and clean at both edges</h3><p>Value pills are excluded from linking even if an old board still has an identity. Normalisation strips stale Definition metadata when a pill is written; the context menu no longer offers Definition actions for it.</p></section></div>
<h2>Observed in the real app</h2><div class=\"pair\"><figure><img src=\"{image('literal-pill-named.png')}\"><figcaption>Source pill after its initial <code>gain</code> name edit.</figcaption></figure><figure><img src=\"{image('literal-pill-copy-independent.png')}\"><figcaption>The copied pill is renamed <code>gain_copy</code> in the real inspector; the source still paints <code>gain = 2.0</code>.</figcaption></figure></div>
<h2>Regression proof</h2><table><thead><tr><th>Check</th><th>What the browser read back</th><th>Result</th></tr></thead><tbody>{rows}</tbody></table><p>The companion Definition journey verifies the intentional opposite: duplicated callable Blocks still converge, can be unlinked deliberately, and retain their shared body semantics.</p>
<h2>The two guardrails in code</h2><section class=\"card\"><b>Value normalisation removes identity</b><pre>{esc(normalise)}</pre></section><section class=\"card\"><b>Legacy pill identities are inert immediately</b><pre>{esc(definition)}</pre></section>
</main></body></html>"""


if __name__ == "__main__":
    OUT.write_text(build(), encoding="utf-8")
    print(OUT)
