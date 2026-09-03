#!/usr/bin/env python3
"""Build the self-contained command-palette modal-layer evidence gallery."""

from __future__ import annotations

import base64
import html
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "modal-layer-contract-2026-09-02.html"
RESULTS = ROOT / "docs" / "assets" / "command-palette-results.json"
BEFORE = ROOT / "docs" / "assets" / "command-palette-layering-before-2026-09-02.png"
AFTER = ROOT / "docs" / "assets" / "command-palette-commands-2026-09-02.png"
FIXTURE_SHOT = ROOT / "sketches" / "review" / "command-palette-backdrop.png"
PALETTE = ROOT / "src" / "commands" / "SystemSketchCommandPalette.tsx"
COMMANDS_CSS = ROOT / "src" / "commands" / "commands.css"
TOKENS = ROOT / "src" / "theme" / "tokens.css"


def data_uri(path: Path) -> str:
    payload = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:image/png;base64,{payload}"


def main() -> None:
    palette = PALETTE.read_text(encoding="utf-8")
    commands_css = COMMANDS_CSS.read_text(encoding="utf-8")
    tokens = TOKENS.read_text(encoding="utf-8")
    results = json.loads(RESULTS.read_text(encoding="utf-8"))
    required = {
        "Palette escapes through EditorPortal": "<EditorPortal>" in palette,
        "Backdrop uses the semantic modal layer": (
            "z-index: var(--systemsketch-layer-modal);" in commands_css
        ),
        "Modal layer matches tldraw dialogs": (
            "--systemsketch-layer-modal: var(--tl-layer-canvas-overlays, 500);"
            in tokens
        ),
        "Browser probes all four chrome regions": any(
            item.get("ok")
            and "covers Preview and every top-level chrome region" in item.get("label", "")
            for item in results
        ),
    }
    if not all(required.values()):
        missing = ", ".join(label for label, ok in required.items() if not ok)
        raise SystemExit(f"refusing to build incomplete modal evidence: {missing}")

    checks = "".join(
        f'<li><span>✓</span>{html.escape(label)}</li>' for label in required
    )
    audit = [
        ("Preview status capsule", "panel · 300", "escaped before", "covered now"),
        ("Top-left document controls", "panel · 300", "escaped before", "covered now"),
        ("Top-right comments/share", "panel · 300", "escaped before", "covered now"),
        ("Bottom utilities", "panel · 300", "escaped before", "covered now"),
        ("Selection menu / canvas picker", "menu · 400", "could escape", "covered now"),
        ("Debug hit-area overlay", "child · 500", "could escape", "covered now"),
        ("Workspace blocking dialog", "critical · 10000", "above", "intentionally above"),
        ("Active recorder indicator", "critical · 100000", "above", "intentionally above"),
    ]
    rows = "".join(
        "<tr>"
        f"<th>{html.escape(surface)}</th><td><code>{html.escape(layer)}</code></td>"
        f"<td>{html.escape(before)}</td><td>{html.escape(now)}</td>"
        "</tr>"
        for surface, layer, before, now in audit
    )
    document = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Modal layer contract · SystemSketch</title>
<style>
:root{{--paper:#f3f1eb;--ink:#242321;--muted:#6b6862;--line:#d7d2c8;--blue:#2878dd;--orange:#e7862d;--green:#25764d;--card:#fff;--dark:#20242a}}
*{{box-sizing:border-box}} body{{margin:0;background:var(--paper);color:var(--ink);font:16px/1.5 Inter,ui-sans-serif,system-ui,sans-serif}}
main{{width:min(1200px,calc(100% - 36px));margin:auto;padding:62px 0 92px}} h1{{max-width:900px;margin:8px 0 22px;font-size:clamp(44px,7vw,84px);line-height:.94;letter-spacing:-.055em}}
h2{{margin:0 0 18px;font-size:30px;letter-spacing:-.035em}} .eyebrow{{color:var(--blue);font:800 12px/1.2 ui-monospace,monospace;letter-spacing:.13em;text-transform:uppercase}}
.lede{{max-width:850px;margin:0 0 38px;color:#45423d;font-size:21px}} section{{margin-top:54px}} .grid{{display:grid;grid-template-columns:1fr 1fr;gap:20px}}
.card,figure,.table-wrap{{overflow:hidden;border:1px solid var(--line);border-radius:18px;background:var(--card);box-shadow:0 12px 32px #39342b0b}} .card{{padding:24px}}
.stack{{display:grid;gap:10px;margin-top:18px}} .layer{{display:flex;justify-content:space-between;align-items:center;min-height:52px;padding:12px 16px;border-radius:11px;background:#eef2f7}}
.layer b{{font-family:ui-monospace,monospace}} .layer.modal{{border:2px solid var(--blue);background:#eaf2ff}} .layer.trap{{border:2px dashed var(--orange);background:#fff4e8}}
.arrow{{padding-left:16px;color:var(--muted);font-size:14px}} ul{{display:grid;gap:10px;padding:0;list-style:none}} li{{display:flex;gap:10px}} li span{{color:var(--green);font-weight:900}}
.compare{{position:relative;min-height:560px}} .compare figure{{display:none;margin:0}} .compare figure.active{{display:block}} figure img{{display:block;width:100%;height:auto}} figcaption{{padding:14px 18px;color:var(--muted);font-size:14px}}
.switcher{{display:flex;gap:8px;margin-bottom:12px}} button{{padding:9px 14px;border:1px solid var(--line);border-radius:999px;background:#fff;color:var(--ink);font:inherit;font-size:14px;font-weight:700;cursor:pointer}} button[aria-pressed="true"]{{border-color:var(--blue);background:var(--blue);color:#fff}}
table{{width:100%;border-collapse:collapse}} th,td{{padding:14px 16px;border-bottom:1px solid #ece8e0;text-align:left;vertical-align:top}} th{{width:31%}} thead th{{width:auto;background:#f7f5f1;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.08em}} tbody tr:last-child th,tbody tr:last-child td{{border-bottom:0}}
code{{padding:2px 6px;border-radius:5px;background:#eef0f3;font:13px ui-monospace,monospace}} .rule{{border-left:4px solid var(--blue)}} .meta{{margin-top:52px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}} a{{color:#205faa}}
@media(max-width:780px){{.grid{{grid-template-columns:1fr}} .compare{{min-height:0}} .table-wrap{{overflow:auto}} table{{min-width:720px}}}}
</style></head><body><main>
<div class="eyebrow">SystemSketch · regression evidence · 2026-09-02</div>
<h1>One modal plane, over every control.</h1>
<p class="lede">The command palette used a large z-index inside tldraw’s <code>InFrontOfTheCanvas</code> stacking context. That context is fixed below application panels, so the Preview capsule and other chrome still painted above the gray scrim. The palette now exits through tldraw’s public <code>EditorPortal</code> seam and uses the same layer as tldraw dialogs.</p>
<div class="grid">
  <article class="card"><div class="eyebrow">Before · trapped hierarchy</div><div class="stack">
    <div class="layer"><span>panel / Preview</span><b>300</b></div>
    <div class="layer trap"><span>InFrontOfCanvas context</span><b>250</b></div>
    <div class="arrow">↳ backdrop asked for 303, but could not leave 250</div>
  </div></article>
  <article class="card"><div class="eyebrow">After · shared portal hierarchy</div><div class="stack">
    <div class="layer modal"><span>portaled modal backdrop</span><b>500</b></div>
    <div class="layer"><span>menus</span><b>400</b></div>
    <div class="layer"><span>panels / Preview</span><b>300</b></div>
  </div></article>
</div>
<section><h2>Before / after</h2><div class="switcher"><button type="button" aria-pressed="true" data-show="before">Before</button><button type="button" aria-pressed="false" data-show="after">After</button></div>
<div class="compare">
  <figure class="active" data-shot="before"><img src="{data_uri(BEFORE)}" alt="Before fix, Preview capsule remains undimmed above command palette scrim"><figcaption>Before: the Preview capsule remains bright because the scrim is trapped below the panel layer.</figcaption></figure>
  <figure data-shot="after"><img src="{data_uri(AFTER)}" alt="After fix, all application chrome is uniformly dimmed beneath the command palette"><figcaption>After: Preview, corner controls, bottom utilities, and board share one uniform scrim; only the Commands dialog remains bright.</figcaption></figure>
</div></section>
<section><h2>Current surface audit</h2><div class="table-wrap"><table><thead><tr><th>Surface</th><th>Layer</th><th>Old behavior</th><th>Contract now</th></tr></thead><tbody>{rows}</tbody></table></div></section>
<section><div class="grid"><article class="card rule"><div class="eyebrow">Future UI rule</div><h2>Portals first, z-index second.</h2><p>Any full-surface modal launched from canvas-hosted UI must render through <code>EditorPortal</code>. A bigger child z-index cannot escape an ancestor stacking context. Ordinary modals use <code>--systemsketch-layer-modal</code>; only explicitly critical surfaces may sit higher.</p></article>
<article class="card"><div class="eyebrow">Enforced evidence</div><ul>{checks}</ul><p>{sum(1 for item in results if item.get('ok'))}/{len(results)} real-browser command-palette checks pass.</p></article></div></section>
<section><h2>Human review board</h2><figure><img src="{data_uri(FIXTURE_SHOT)}" alt="Review board with two numbered instructions, arrows, and a green pass condition"><figcaption>Generated through the real editor, moved with bound arrows, cold-reopened, then driven at the exact board URL with Ctrl+P.</figcaption></figure></section>
<p class="meta">Evidence generated from the current working tree. Review board: <a href="http://127.0.0.1:4322/?board=%2Fhome%2Fbam%2Fsystemsketch%2Fsketches%2Freview%2Fcommand-palette-backdrop.systemsketch">open in Preview</a>.</p>
</main><script>
document.querySelectorAll('[data-show]').forEach(button=>button.addEventListener('click',()=>{{
  document.querySelectorAll('[data-show]').forEach(other=>other.setAttribute('aria-pressed',String(other===button)));
  document.querySelectorAll('[data-shot]').forEach(shot=>shot.classList.toggle('active',shot.dataset.shot===button.dataset.show));
}}));
</script></body></html>"""
    OUT.write_text(document, encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
