#!/usr/bin/env python3
"""Build the self-contained reverse-compatibility verification gallery."""

from __future__ import annotations

import base64
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "reverse-compatibility-2026-09-03.html"
IMAGES = {
    "unreadable": ROOT / "docs" / "assets" / "repo-improvements-workspace-quarantine.png",
    "future": ROOT / "docs" / "assets" / "workspace-followup-future-protected-2026-09-02.png",
    "dialog": ROOT / "docs" / "assets" / "reverse-compatibility-copy-dialog-2026-09-03.png",
    "fixture": ROOT / "sketches" / "review" / "reverse-compatible-copy.png",
}


def data_uri(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def main() -> None:
    for path in IMAGES.values():
        if not path.is_file():
            raise RuntimeError(f"missing browser evidence: {path}")

    source = (ROOT / "src" / "workspace" / "LocalWorkspace.tsx").read_text()
    assert "makePortableCopy" in source
    assert "Make compatible copy" in source
    assert "nothing here to recover or make compatible" in source
    fixture = json.loads((ROOT / "sketches" / "review" / "reverse-compatible-copy.systemsketch").read_text())
    assert fixture["systemSketch"]["shapes"] == {"geo": 3, "connection": 1, "block": 2, "arrow": 2}

    images = {name: data_uri(path) for name, path in IMAGES.items()}
    output = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reverse-compatible copies · 2026-09-03</title>
<style>
:root {{ color-scheme:light; font-family:Inter,ui-sans-serif,system-ui,sans-serif; color:#172033; background:#f3f6fb; }}
body {{ margin:0; }} main {{ max-width:1180px; margin:auto; padding:48px 28px 70px; }}
.eyebrow {{ color:#3867d6; font-size:.75rem; font-weight:850; letter-spacing:.12em; text-transform:uppercase; }}
h1 {{ max-width:930px; margin:.35rem 0 .9rem; font-size:clamp(2.25rem,5.2vw,4.75rem); letter-spacing:-.06em; line-height:.98; }}
.lede {{ max-width:850px; color:#526079; font-size:1.18rem; line-height:1.55; }}
.flow {{ display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; margin:34px 0; }}
.step {{ min-height:142px; padding:18px; border:1px solid #dbe4f2; border-radius:16px; background:#fff; box-shadow:0 12px 30px #263b650b; }}
.step b {{ display:block; margin-bottom:8px; color:#3764c8; font-size:.78rem; letter-spacing:.08em; text-transform:uppercase; }}
.step p {{ margin:0; color:#546176; line-height:1.45; }}
.step.stock {{ border-color:#a9d7ba; background:#f5fff8; }} .step.stock b {{ color:#23834e; }}
h2 {{ margin:48px 0 16px; font-size:1.35rem; letter-spacing:-.025em; }}
.grid {{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:20px; }}
figure {{ margin:0; overflow:hidden; border:1px solid #dbe4f2; border-radius:17px; background:#fff; box-shadow:0 12px 30px #263b650b; }}
figure img {{ display:block; width:100%; }} figcaption {{ padding:14px 16px 17px; color:#536177; font-size:.92rem; line-height:1.48; }}
.policy {{ display:grid; grid-template-columns:1.1fr .9fr; gap:20px; margin-top:22px; }}
.card {{ padding:22px; border:1px solid #dbe4f2; border-radius:17px; background:#fff; }}
.card h3 {{ margin:0 0 10px; font-size:1rem; }} .card p,.card li {{ color:#536177; line-height:1.5; }} .card p {{ margin:0; }} ul {{ margin:0; padding-left:1.15rem; }}
code {{ padding:2px 5px; border-radius:5px; background:#edf2fa; color:#273e69; }}
.links {{ margin-top:28px; color:#536177; }} .links a {{ color:#245dce; font-weight:700; text-decoration:none; }}
@media(max-width:760px) {{ main{{padding:32px 16px 50px}} .flow,.grid,.policy{{grid-template-columns:1fr}} h1{{font-size:2.45rem}} }}
</style></head><body><main>
<div class="eyebrow">Compatibility safety · 3 September 2026</div>
<h1>Rollback gets a real exit—not a misleading “recovery.”</h1>
<p class="lede">A newer SystemSketch board remains its own protected source. When an older build can read the board, it can create and open a separate, portable <code>.tldr</code> whose readable SystemSketch features have been lowered to editable stock tldraw primitives.</p>
<section class="flow"><article class="step"><b>1 · Inspect</b><p>A parseable newer board is visible but read-only. It is never silently downgraded or autosaved over.</p></article><article class="step"><b>2 · Duplicate</b><p><strong>Make compatible copy…</strong> names the format, says exactly what changes, and writes beside—not over—the original.</p></article><article class="step stock"><b>3 · Regress safely</b><p>The new <code>.tldr</code> opens editable. Blocks, regions, and semantic edges become the stock primitives that the older app can understand.</p></article></section>
<h2>What the person sees</h2>
<section class="grid"><figure><img src="{images['future']}" alt="A newer board open read-only with a Make compatible copy action"><figcaption><strong>Parseable newer board.</strong> The warning is readable, does not cover Preview controls, and states that the original remains byte-for-byte untouched.</figcaption></figure><figure><img src="{images['dialog']}" alt="Make compatible copy dialog explaining the separate stock tldraw copy"><figcaption><strong>The explicit choice.</strong> The dialog calls out the separate <code>.tldr</code>, stock editable primitives, and the hard boundary for data this build cannot read.</figcaption></figure><figure><img src="{images['unreadable']}" alt="An unreadable file warning with only Open another available"><figcaption><strong>Unreadable is not recoverable.</strong> When the parser loaded no board data, there is no empty-board “recovery” copy to save. The original remains untouched and the UI says so.</figcaption></figure><figure><img src="{images['fixture']}" alt="Reverse-compatible copy review fixture with real Blocks, a semantic cable, and numbered cue cards"><figcaption><strong>Human review board.</strong> The source has real Blocks and a semantic cable; the green card makes the observable portable-copy result concrete.</figcaption></figure></section>
<section class="policy"><article class="card"><h3>Compatibility contract</h3><ul><li><strong>Forward:</strong> new builds retain migrations for old documents.</li><li><strong>Reverse, readable:</strong> a protected newer board can become a new stock <code>.tldr</code>; its original is not changed.</li><li><strong>Reverse, unreadable:</strong> an old build must not invent a fallback or claim to recover data it could not parse.</li></ul></article><article class="card"><h3>Why stock is the first target</h3><p>A specific older SystemSketch release would require an explicit feature/version capability table. Stock tldraw is the conservative common denominator already exercised by the detached-primitives pipeline, so it is a deterministic rollback route today.</p></article></section>
<p class="links"><a href="pep-0001-reverse-compatible-portable-copies.md">PEP 0001</a> · <a href="../sketches/review/reverse-compatible-copy.systemsketch">Open the review board</a> · <a href="../tests/workspace_followup_smoke.mjs">9-check real-browser future-format journey</a> · <a href="../tests/workspace_safety_smoke.mjs">6-check unreadable-file journey</a> · <a href="build_reverse_compatibility.py">gallery builder</a></p>
</main></body></html>"""
    OUTPUT.write_text(output)
    print(f"wrote {OUTPUT.relative_to(ROOT)} ({len(output):,} bytes)")


if __name__ == "__main__":
    main()
