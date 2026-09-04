#!/usr/bin/env python3
"""Build the self-contained semantic-role implementation review gallery."""
from __future__ import annotations

import base64
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PNG = ROOT / 'sketches/review/semantic-role-inheritance.png'
OUT = ROOT / 'docs/semantic-role-inheritance-implementation-2026-09-04.html'


def main() -> None:
    image = base64.b64encode(PNG.read_bytes()).decode('ascii')
    OUT.write_text(f'''<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Semantic role inheritance · SystemSketch</title>
<style>
:root{{color-scheme:dark;--ink:#edf2f7;--muted:#a8b4c4;--line:#344154;--panel:#17202c;--accent:#79b8ff;--warn:#f6c453;--green:#66d987}}*{{box-sizing:border-box}}body{{margin:0;background:#0d131c;color:var(--ink);font:16px/1.55 Inter,system-ui,sans-serif}}main{{max-width:1240px;margin:auto;padding:56px 28px 80px}}h1{{font-size:clamp(2rem,5vw,4.3rem);line-height:1.04;max-width:960px;margin:0 0 20px}}h2{{margin-top:48px}}.lede{{font-size:1.25rem;color:var(--muted);max-width:860px}}.eyebrow{{color:var(--accent);font-weight:700;letter-spacing:.09em;text-transform:uppercase}}.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}}article{{padding:19px;border:1px solid var(--line);border-radius:13px;background:var(--panel)}}article h3{{margin:0 0 7px;color:var(--accent)}}code{{color:#d5e8ff}}.warning{{border-left:4px solid var(--warn);padding:10px 14px;background:#211d12}}figure{{margin:28px 0;padding:12px;border:1px solid var(--line);border-radius:16px;background:#f8fafc}}img{{display:block;width:100%;border-radius:10px}}figcaption{{color:#263548;padding:10px 5px 2px}}a{{color:#9dcbff}}ul{{padding-left:1.2rem}}.quiet{{color:var(--muted)}}
</style><main>
<p class="eyebrow">Implementation gallery · 2026-09-04</p>
<h1>Semantic roles are authored once, at the port—and inherited live by the cable.</h1>
<p class="lede">This branch adds a small semantic layer without making the canvas a second type system: roles say how a value is being used, while type, async/delayed delivery, mutation, routing, and execution remain separate facts.</p>
<div class="grid"><article><h3>Port-owned claims</h3><p>Every Block port may carry a derived claim with analyser/source provenance and a separate authored override. <code>authored → derived → implicit Data</code> is the only precedence rule.</p></article><article><h3>Wire read model</h3><p>A wire stores no role. It resolves source first, then explicit sink, then implicit Data. This makes changes, linked occurrences, reopening, export, and detachment read the same current truth.</p></article><article><h3>Conflict is information</h3><p>Event feeding Control remains a legal cable. Its connection inspector says <code>Event → Control</code>, names both origins, and warns without rewriting or disconnecting either endpoint.</p></article></div>
<h2>Real review board</h2><figure><img alt="SystemSketch review board with Event and Control port role labels and a legal connecting cable" src="data:image/png;base64,{image}"><figcaption>The generated board contains real Blocks, a real bound cable, and bound instructional arrows. It was cold-reopened through the application serializer before capture.</figcaption></figure>
<h2>Deliberate boundaries</h2><div class="grid"><article><h3>Orthogonal, not ornamental</h3><ul><li>Data is quiet; non-Data ports show a compact text cue.</li><li>Role does not recolor Python types or alter cable temporal style.</li><li>Role does not change topology, routing, execution, or effect behavior.</li></ul></article><article><h3>Canonical definitions</h3><p>Role claims travel through the existing canonical input/output records, so linked Definition occurrences converge rather than drifting into per-occurrence metadata.</p></article><article><h3>Region rules</h3><p>Branch-band controls synthesize <code>Control</code>. Loop iterable/item remain ordinary <code>Data</code>. Reconciled effect ports retain the source port’s role claims.</p></article></div>
<p class="warning"><strong>Review gesture:</strong> select <code>emit_tick()</code>, inspect the Event selector on <code>tick</code>; then select the cable. Pass when its inspector is read-only and shows provenance plus the mismatch warning, while the connection remains intact.</p>
<p class="quiet">Evidence: focused unit tests for precedence, provenance clearing, source/sink fallback, conflict legality, Branch synthesis, and migration down-stripping; real-app fixture cold reopen and browser journey.</p>
</main></html>''', encoding='utf-8')


if __name__ == '__main__':
    main()
