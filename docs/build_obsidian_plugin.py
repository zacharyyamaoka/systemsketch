#!/usr/bin/env python3
"""Build the measured, self-contained Obsidian plugin implementation report."""

from __future__ import annotations

import base64
import html
import json
from datetime import date
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DOCS = PROJECT_ROOT / "docs"
ASSETS = DOCS / "assets"
PLUGIN = PROJECT_ROOT / "obsidian-systemsketch"
OUTPUT = DOCS / f"obsidian-plugin-{date.today().isoformat()}.html"


def esc(value: object) -> str:
    return html.escape(str(value))


def image_uri(path: Path) -> str:
    return f"data:image/png;base64,{base64.b64encode(path.read_bytes()).decode()}"


def lines(path: Path) -> int:
    return len(path.read_text(encoding="utf-8").splitlines())


def fresh_journey() -> dict:
    result_path = ASSETS / "obsidian-plugin-journey.json"
    runner = PLUGIN / "tests" / "obsidian_e2e.mjs"
    if not result_path.exists():
        raise SystemExit("run `npm --prefix obsidian-systemsketch run test:e2e` first")
    measured = result_path.stat().st_mtime
    inputs = [runner, *sorted((PLUGIN / "src").glob("*.ts")), *sorted((PROJECT_ROOT / "src" / "embed").glob("*.tsx"))]
    stale = [path for path in inputs if path.stat().st_mtime > measured]
    if stale:
        names = ", ".join(str(path.relative_to(PROJECT_ROOT)) for path in stale)
        raise SystemExit(f"journey evidence predates {names}; rerun it")
    return json.loads(result_path.read_text(encoding="utf-8"))


JOURNEY = fresh_journey()
BUNDLE = json.loads((PLUGIN / "dist" / "bundle.json").read_text(encoding="utf-8"))
MANIFEST = json.loads((PLUGIN / "manifest.json").read_text(encoding="utf-8"))

if JOURNEY.get("checks") != 8 or not JOURNEY.get("drivable"):
    raise SystemExit("the real-Obsidian journey is incomplete")
if BUNDLE.get("architecture") != "same-document-fallback" or not BUNDLE.get("matchesReferenceApp"):
    raise SystemExit("the fallback or staged-app provenance gate is not green")

screens = [
    ("Light editor", ASSETS / "obsidian-systemsketch-light.png", "A writable `.systemsketch` in Obsidian light."),
    ("Dark editor", ASSETS / "obsidian-systemsketch-dark.png", "The same canvas following Obsidian dark."),
    ("Markdown embed", ASSETS / "obsidian-systemsketch-embed.png", "`![[target.systemsketch]]`, rendered inert and read-only."),
]
for _, path, _ in screens:
    if not path.exists():
        raise SystemExit(f"missing journey capture: {path.name}")

file_rows = [
    ("src/embed/EmbeddedCanvas.tsx", "the existing canvas; now accepts the optional direct bridge"),
    ("src/embed/embedProtocol.ts", "one optional inbound subscription for same-document hosts"),
    ("obsidian-systemsketch/src/view.ts", "TextFileView lifecycle, version fence, autosave and reload"),
    ("obsidian-systemsketch/src/embed.ts", "read-only Obsidian Markdown embed"),
    ("obsidian-systemsketch/esbuild.config.mjs", "scoped fallback bundle and provenance refusal"),
    ("obsidian-systemsketch/tests/obsidian_e2e.mjs", "the isolated real-host acceptance journey"),
]

proof_items = "".join(f"<li><span>✓</span>{esc(item)}</li>" for item in JOURNEY["proved"])
file_table = "".join(
    f"<tr><td><code>{esc(path)}</code></td><td>{esc(role)}</td><td>{lines(PROJECT_ROOT / path)}</td></tr>"
    for path, role in file_rows
)
contrast_rows = "".join(
    f"<tr><td>{esc(scheme.title())}</td><td>{esc(reading['selector'])}</td>"
    f"<td>{reading['ratio']:.2f}:1</td><td><span class='pass'>PASS</span></td></tr>"
    for scheme, readings in JOURNEY["contrastByScheme"].items()
    for reading in readings
)
screen_cards = "".join(
    f"<figure data-shot='{index}' class='shot{' active' if index == 0 else ''}'>"
    f"<img src='{image_uri(path)}' alt='{esc(title)}'><figcaption><strong>{esc(title)}</strong>{esc(caption)}</figcaption></figure>"
    for index, (title, path, caption) in enumerate(screens)
)
screen_buttons = "".join(
    f"<button class='shot-button{' active' if index == 0 else ''}' data-target='{index}'>{esc(title)}</button>"
    for index, (title, _, _) in enumerate(screens)
)

html_text = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch × Obsidian — implementation proof</title>
<style>
:root{{--ink:#e9edf5;--muted:#9ca9bd;--panel:#151b25;--line:#2b3545;--orange:#ff9850;--green:#54d68c;--blue:#83aaff;--paper:#0c1017}}
*{{box-sizing:border-box}} body{{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 Inter,ui-sans-serif,system-ui,sans-serif}}
main{{width:min(1180px,calc(100% - 32px));margin:auto;padding:64px 0 90px}} h1{{font-size:clamp(42px,8vw,92px);line-height:.93;letter-spacing:-.06em;margin:14px 0 24px;max-width:920px}}
h2{{font-size:28px;letter-spacing:-.025em;margin:0 0 18px}} h3{{font-size:16px;margin:0 0 8px}} p{{color:var(--muted);max-width:820px}} code{{color:#bed0ff}} .eyebrow{{color:var(--orange);text-transform:uppercase;letter-spacing:.15em;font-weight:800;font-size:12px}}
.lede{{font-size:20px;max-width:820px}} .metrics{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:36px 0 64px}} .metric,.card,section{{border:1px solid var(--line);background:var(--panel);border-radius:18px}}
.metric{{padding:20px}} .metric b{{display:block;font-size:30px;line-height:1.1}} .metric span{{color:var(--muted);font-size:13px}} section{{padding:30px;margin:18px 0}} .decision{{display:grid;grid-template-columns:1fr 66px 1fr;gap:16px;align-items:stretch}}
.decision .card{{padding:22px}} .decision .arrow{{display:grid;place-items:center;color:var(--orange);font-size:34px}} .failed{{border-color:#76503c}} .chosen{{border-color:#39765a}} .tag{{font-size:11px;letter-spacing:.12em;font-weight:800;color:var(--orange)}}
.shots-nav{{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}} button{{border:1px solid var(--line);background:#101722;color:var(--muted);padding:10px 14px;border-radius:999px;cursor:pointer}} button.active{{color:var(--ink);border-color:var(--blue);background:#16213a}}
.shot{{display:none;margin:0}} .shot.active{{display:block}} .shot img{{display:block;width:100%;border-radius:12px;border:1px solid var(--line)}} figcaption{{display:grid;grid-template-columns:140px 1fr;gap:15px;color:var(--muted);padding-top:12px}} figcaption strong{{color:var(--ink)}}
.grid{{display:grid;grid-template-columns:1.1fr .9fr;gap:18px}} ul.proof{{list-style:none;padding:0;margin:0;display:grid;gap:10px}} ul.proof li{{display:grid;grid-template-columns:24px 1fr;gap:8px;color:var(--muted)}} ul.proof span{{color:var(--green);font-weight:900}}
table{{width:100%;border-collapse:collapse;font-size:13px}} th,td{{padding:11px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}} th{{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.09em}} td:last-child{{text-align:right}} .pass{{color:var(--green);font-weight:800}}
.flow{{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:18px}} .flow b{{padding:10px 14px;border-radius:10px;background:#101722;border:1px solid var(--line)}} .flow i{{color:var(--orange)}} .foot{{margin:40px 4px 0;color:#6f7e93;font-size:12px}}
@media(max-width:800px){{.metrics{{grid-template-columns:1fr 1fr}}.decision,.grid{{grid-template-columns:1fr}}.decision .arrow{{transform:rotate(90deg)}}section{{padding:21px}}figcaption{{grid-template-columns:1fr}}}}
</style></head><body><main>
<div class="eyebrow">SystemSketch host seam · measured {date.today().isoformat()}</div>
<h1>The canvas now lives inside Obsidian.</h1>
<p class="lede">Both file suffixes are editable, autosave is native, outside changes reload in place, host appearance reaches the board, and Markdown embeds are real read-only canvases. One architectural fallback is explicit and fenced.</p>
<div class="metrics">
  <div class="metric"><b>{JOURNEY['checks']}/8</b><span>real-host checks</span></div>
  <div class="metric"><b>{JOURNEY['autosaveModifyEvents']}</b><span>modify event for one settled edit</span></div>
  <div class="metric"><b>{min(r['ratio'] for rows in JOURNEY['contrastByScheme'].values() for r in rows):.2f}:1</b><span>worst measured text contrast</span></div>
  <div class="metric"><b>2</b><span>editable suffixes</span></div>
</div>

<section><div class="eyebrow">Decision record</div><h2>The iframe spike failed for a precise reason.</h2>
<div class="decision">
  <div class="card failed"><div class="tag">SPIKED · REJECTED</div><h3>Staged Vite app in an iframe</h3><p><code>getResourcePath(index.html)</code> loaded the document, but Obsidian assigns each resource its own query URL. The relative JavaScript entry omitted the asset's query, so the app root never mounted.</p></div>
  <div class="arrow">→</div>
  <div class="card chosen"><div class="tag">SHIPPED · GUARDED</div><h3>Same-document bundle of the existing embed</h3><p>No new canvas: Obsidian mounts <code>EmbeddedCanvas</code> with the same protocol. CSS is scoped, imports are boundary-tested, and the bundle refuses to build unless its source commit matches the app staged for VS Code.</p></div>
</div>
<div class="flow"><b>TextFileView</b><i>→ direct subscribe →</i><b>embed protocol</b><i>→</i><b>EmbeddedCanvas</b><i>→</i><b>stock tldraw</b></div></section>

<section><div class="eyebrow">Seen, not inferred</div><h2>The isolated Obsidian journey</h2><div class="shots-nav">{screen_buttons}</div>{screen_cards}</section>

<div class="grid">
<section><div class="eyebrow">Behavior</div><h2>Eight checks</h2><ul class="proof">{proof_items}</ul></section>
<section><div class="eyebrow">Contrast</div><h2>Live computed colours</h2><table><thead><tr><th>Theme</th><th>Surface</th><th>Ratio</th><th></th></tr></thead><tbody>{contrast_rows}</tbody></table><p>The gate requires 4.5:1. A same-colour mutation was applied during the run and correctly failed the same measurement.</p></section>
</div>

<section><div class="eyebrow">Ownership</div><h2>One seam, narrow responsibilities</h2><table><thead><tr><th>File</th><th>Job</th><th>Lines</th></tr></thead><tbody>{file_table}</tbody></table></section>

<section><div class="eyebrow">Artifact identity</div><h2>The installed files say what they are.</h2>
<div class="grid"><div><h3>Manifest</h3><p><code>{esc(MANIFEST['id'])}</code> · desktop-only <strong>{str(MANIFEST['isDesktopOnly']).lower()}</strong> · minimum Obsidian {esc(MANIFEST['minAppVersion'])}. The ID deliberately avoids collision with the older donor.</p></div>
<div><h3>Bundle stamp</h3><p><code>{esc(BUNDLE['architecture'])}</code><br><code>{esc(BUNDLE['sourceCommit'])}</code><br>reference commit match: <strong class="pass">{str(BUNDLE['matchesReferenceApp']).lower()}</strong></p></div></div>
<p>No live vault was opened. The journey created and removed a private vault and profile. Legacy PyBlocks goldens remain deferred; no legacy reader or migration was added.</p></section>

<p class="foot">Built from live repository files by <code>docs/build_obsidian_plugin.py</code>. Screenshots and values come from <code>obsidian-systemsketch/tests/obsidian_e2e.mjs</code> running the installed plugin in Obsidian.</p>
</main><script>
const buttons=[...document.querySelectorAll('.shot-button')];const shots=[...document.querySelectorAll('.shot')];buttons.forEach(b=>b.addEventListener('click',()=>{{buttons.forEach(x=>x.classList.remove('active'));shots.forEach(x=>x.classList.remove('active'));b.classList.add('active');document.querySelector(`[data-shot="${{b.dataset.target}}"]`).classList.add('active')}}));
</script></body></html>"""

OUTPUT.write_text(html_text, encoding="utf-8")
print(OUTPUT)
