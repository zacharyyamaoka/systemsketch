#!/usr/bin/env python3
"""Build the self-contained property-text fidelity proof gallery."""

from __future__ import annotations

import base64
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs" / "assets"
OUT = ROOT / "docs" / "text-fidelity-2026-09-03.html"


def esc(value: object) -> str:
    return html.escape(str(value), quote=True)


def image(path: Path) -> str:
    if not path.exists():
        raise SystemExit(f"Missing evidence image: {path}")
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def source(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def excerpt(rel: str, start: str, end: str) -> str:
    text = source(rel)
    first = text.index(start)
    last = text.index(end, first) + len(end)
    return text[first:last]


def figure(path: Path, caption: str) -> str:
    return (
        f'<figure><img src="{image(path)}" alt="{esc(caption)}">'
        f"<figcaption>{caption}</figcaption></figure>"
    )


def build() -> str:
    checks = json.loads((ASSETS / "literal-pill.json").read_text(encoding="utf-8"))
    pill_total = len(checks)
    pill_passed = sum(check["ok"] for check in checks)
    portable_checks = len(re.findall(
        r"^    check\(", source("tests/portable_tldraw_export_smoke.mjs"), flags=re.MULTILINE,
    ))
    value_code = excerpt("src/blocks/valueBlock.ts", "export function valueBlockExactText", "\n}\n")
    stored_code = source("src/textFidelity.ts").strip()
    fixture = ROOT / "sketches" / "review" / "text-fidelity.png"

    audit_rows = [
        ("Value pill", "Name and literal render from their stored strings; no fed-state replacement marker.", "Canvas + tooltip + portable export"),
        ("Pill geometry", "A 1.25 line-height keeps descent glyphs such as `_` inside the clipped face.", "Real browser glyph bounds"),
        ("Block and port chrome", "Titles, descriptions, names, and types retain raw characters and expose full strings by tooltip.", "Canvas + inspector"),
        ("Branch and loop", "Arm/control labels and iteration titles no longer trim authored text.", "Canvas tooltips"),
        ("Shape facts and appearance", "Tokens such as `custom_shape` and `light-blue` are shown verbatim rather than humanised.", "Facts panel + model tests"),
        ("Navigation and summaries", "Search, breadcrumbs, diagnostics, depth navigation, frames, and single-page export preserve nonempty strings exactly.", "Shared `storedTextOr` helper"),
    ]
    rows = "".join(
        f"<tr><td>{esc(surface)}</td><td>{esc(rule)}</td><td>{esc(proof)}</td></tr>"
        for surface, rule, proof in audit_rows
    )
    copy_checks = [check for check in checks if check["id"].startswith("COPY-")]
    checks_html = "".join(
        f"<li><code>{esc(check['id'])}</code> — {esc(check['label'])}</li>" for check in copy_checks
    )
    return f"""<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch · Truthful property rendering</title>
<style>
:root{{--ink:#222425;--muted:#62676c;--paper:#f4f3f0;--panel:#fff;--line:#d9dadd;--blue:#4d83dc;--green:#27785c;--orange:#cb7c28;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;--sans:Inter,ui-sans-serif,system-ui,sans-serif}}*{{box-sizing:border-box}}body{{margin:0;color:var(--ink);background:var(--paper);font:15px/1.55 var(--sans)}}main{{max-width:1120px;margin:auto;padding:46px 26px 86px}}h1{{font:500 42px/1.05 Georgia,serif;margin:8px 0 12px}}h2{{font:500 28px/1.16 Georgia,serif;margin:50px 0 14px}}p{{max-width:840px}}.eyebrow{{color:var(--blue);font:700 11px/1.2 var(--mono);letter-spacing:.12em;text-transform:uppercase}}.lede{{font-size:18px;color:#45494d}}.facts,.grid{{display:grid;gap:14px}}.facts{{grid-template-columns:repeat(3,1fr);margin:25px 0}}.grid{{grid-template-columns:repeat(2,1fr)}}.fact,figure,.rule{{background:var(--panel);border:1px solid var(--line);border-radius:12px}}.fact{{padding:15px}}.fact b{{display:block;font-size:23px}}.fact span{{color:var(--muted);font-size:13px}}figure{{margin:0;padding:12px}}figure img{{display:block;width:100%;border-radius:8px;background:#f8f9fa}}figcaption{{color:var(--muted);font-size:13px;margin:9px 2px 2px}}.rule{{border-left:5px solid var(--orange);padding:14px 16px}}.rule b{{display:block;margin-bottom:4px}}table{{width:100%;border-collapse:separate;border-spacing:0;background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden}}th,td{{padding:10px 12px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line)}}tr:last-child td{{border:0}}th{{font:700 11px var(--mono);letter-spacing:.08em;text-transform:uppercase;background:#f0f2f5}}code,pre{{font-family:var(--mono)}}code{{font-size:.92em;background:#e9edf2;padding:2px 4px;border-radius:4px}}pre{{margin:0;padding:14px;overflow:auto;background:#20252b;color:#e8edf3;border-radius:9px;font-size:12px;line-height:1.45}}.code{{margin-top:14px}}ul{{padding-left:21px}}a{{color:#2868b2}}@media(max-width:720px){{.facts,.grid{{grid-template-columns:1fr}}h1{{font-size:34px}}}}
</style><main>
<div class="eyebrow">SystemSketch · UI integrity proof · 2026-09-03</div>
<h1>Truthful property rendering</h1>
<p class="lede">Stored text is payload. A visible property preserves every authored character by default—underscores, hyphens, spaces, punctuation, and casing included. An ellipsis is allowed only as an explicit spatial abbreviation with the exact source immediately available.</p>
<section class="facts"><div class="fact"><b>{pill_passed}/{pill_total}</b><span>real-app pill checks</span></div><div class="fact"><b>{portable_checks}/{portable_checks}</b><span>portable export checks</span></div><div class="fact"><b>6 surfaces</b><span>audited display families</span></div></section>
<div class="rule"><b>The actual fault</b>The value-pill face had <code>line-height: 1</code> inside an overflow-clipped box, so the underscore’s descent fell outside its line box. The fix gives visible glyphs enough line height; it does not replace or sanitize the name. A fed pill now keeps its stored literal in muted ink instead of substituting a marker.</div>
<h2>Observed in the running product</h2>
<div class="grid">{figure(ASSETS / "literal-pill-copy-independent.png", "Actual browser capture: gain_copy retains its underscore while the original pill remains independent.")}{figure(ASSETS / "literal-pill-fed.png", "Actual browser capture: a wired value pill keeps its stored fallback literal, muted rather than replaced.")}</div>
<p>The copy-specific browser assertions:</p><ul>{checks_html}</ul>
<h2>The audit boundary</h2>
<table><thead><tr><th>surface family</th><th>literal rendering rule</th><th>evidence route</th></tr></thead><tbody>{rows}</tbody></table>
<h2>Two small, shared contracts</h2>
<div class="grid"><div class="code"><pre>{esc(value_code)}</pre></div><div class="code"><pre>{esc(stored_code)}</pre></div></div>
<p>Only an actual empty string selects a UI fallback. Nonempty whitespace is preserved. When a value is too long or multi-line, its capsule visibly displays <code>…</code>; the raw source remains first in its tooltip.</p>
<h2>Human review board</h2>
{figure(fixture, "Seeded Text fidelity board: the copy pill shows gain_copy, a separate source proves independence, and the fed pill retains fallback.")}
<p>Open <a href="../sketches/review/text-fidelity.systemsketch">the review board</a> in SystemSketch. Its numbered cues exercise the exact underscore, independent rename, and fed-state fidelity boundaries.</p>
<h2>What this deliberately does not do</h2>
<p>It does not prevent visual styling, nor does it force long values to overflow their geometry. It removes hidden transformations. A constrained surface may abbreviate visibly; a property surface may never silently drop, normalize, trim, or substitute authored text.</p>
</main></html>"""


if __name__ == "__main__":
    OUT.write_text(build(), encoding="utf-8")
    print(OUT)
