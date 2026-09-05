#!/usr/bin/env python3
"""Build the self-contained Bundle / Unbundle / Copy implementation gallery."""
from __future__ import annotations

import base64
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
PNG = ROOT / "docs/assets/bundle-unbundle-copy-quick-insert-review.png"
PICKER_PNG = ROOT / "docs/assets/bundle-unbundle-copy-quick-insert-picker.png"
OUTPUT = ROOT / "docs/bundle-unbundle-copy-quick-insert-2026-09-04.html"


def embedded_png(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def main() -> None:
    image = embedded_png(PNG)
    picker = embedded_png(PICKER_PNG)
    OUTPUT.write_text(f"""<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bundle / Unbundle / Copy quick insert · SystemSketch</title>
<style>
body{{margin:0;background:#f6f8fb;color:#172033;font:16px/1.55 ui-sans-serif,system-ui,sans-serif}}main{{max-width:1120px;margin:auto;padding:42px 24px 72px}}h1{{font-size:clamp(2rem,5vw,4rem);line-height:1.04;margin:.1em 0}}.lede{{font-size:1.25rem;max-width:800px}}.cards{{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:28px 0}}.card{{background:white;border:1px solid #dbe3ee;border-radius:14px;padding:20px}}.card h2{{margin:0 0 8px;font-size:1.15rem}}code{{background:#eaf0f7;padding:2px 5px;border-radius:4px}}img{{width:100%;border-radius:14px;border:1px solid #dbe3ee;background:white}}.proof{{background:#e9f9ee;border-left:5px solid #28a65b;border-radius:8px;padding:16px 20px;margin:28px 0}}.limit{{background:#fff7e7;border-left:5px solid #e59b22;border-radius:8px;padding:16px 20px;margin:28px 0}}a{{color:#135cc5}}@media(max-width:680px){{main{{padding:26px 16px 52px}}.cards{{grid-template-columns:1fr}}.lede{{font-size:1.1rem}}}}
</style><main>
<p><a href="../README.md">SystemSketch</a> / implementation gallery / 2026-09-04</p>
<h1>Quick dataflow insertion<br>without pretending to execute</h1>
<p class="lede">Dropping a new data cable on empty canvas now offers <strong>Bundle</strong>, <strong>Unbundle</strong>, and <strong>Copy</strong> before ordinary presets. They are ordinary Port-view Blocks, connected through the existing cable binding seam—not edge-only node types.</p>
<section class="cards"><article class="card"><h2>Bundle</h2><p>Retains a record and exposes editable <code>.field</code> update rows. Each row keeps a stable <code>member_N</code> identity when renamed, so an attached cable stays attached. It explicitly says it does not mutate the input.</p></article><article class="card"><h2>Unbundle</h2><p>Projects aggregate members through normalized <code>.field</code> accessors. The one shipped legacy spelling, <code>projection</code>, reads as this canonical Block.</p></article><article class="card"><h2>Copy</h2><p>Names Python <code>copy.copy(value)</code> exactly: a shallow top-level copy whose nested mutable members may remain shared.</p></article></section>
<div class="proof"><strong>33/33 browser checks:</strong> real pointer drags choose Bundle and Copy forward and Unbundle backward; verify both terminal direction and exact canonical port IDs; exercise the same Bundle member grammar from inspector, canvas bead, and labelled context-menu action; prove each edit and the whole insertion have honest Undo boundaries; navigate the edge-clamped picker by keyboard; and cover Escape/Undo cancellation, a host readonly transition, readonly-before-drag, reload, and console cleanliness. Run <code>npm run test:bundle-quick-insert</code>.</div>
<h2>The primary surface: ordered quick insert</h2><p>This is the real on-canvas picker from the pointer journey. The three data Blocks lead visibly; ordinary presets follow below.</p><img alt="Quick insert picker with Bundle, Unbundle, and Copy first" src="{picker}">
<h2>Guided review board</h2><p>The committed board has live Blocks, semantic cables, numbered arrows, and a visible pass condition. Its PNG is embedded so this report remains self-contained.</p><img alt="Bundle, Copy, and Unbundle guided SystemSketch review board" src="{image}">
<p><strong>Compatibility:</strong> current boards write <code>bundle</code>, <code>unbundle</code>, and <code>copy</code>. A V6 <code>projection</code> upgrades to <code>unbundle</code> and safely downgrades again without row, field, or prose loss. Authored <code>split</code>, <code>merge</code>, and <code>set-attributes</code> remain literal: <code>blockType</code> is user data, so this migration refuses to guess. The separate semantic-stock branch's Set attributes Block is reconciled only if those branches are intentionally combined.</p>
<div class="limit"><strong>Deliberate boundary:</strong> this uses the existing loose-terminal drop seam, not a restored midpoint <strong>+</strong> on settled cables. While the offer is open, the existing workspace autosave can briefly serialize its one-ended cable; the current app removes that stale cable on reopen. Making the unanswered offer entirely non-document state is inherited persistence hardening, not hidden by this prototype.</div>
</main></html>""", encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
