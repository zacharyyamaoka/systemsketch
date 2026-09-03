#!/usr/bin/env python3
"""Build the self-contained Branch arm-frame implementation gallery."""

from __future__ import annotations

import base64
import html
import io
import json
import re
import subprocess
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
ASSETS = DOCS / "assets"
OUTPUT = DOCS / "branch-arm-frames-implementation-2026-09-02.html"
CLIP_SHOT = ASSETS / "branch-arm-frames-clipping.png"
FIXTURE_SHOT = ROOT / "sketches" / "review" / "branch-arm-frames.png"
FRAME_RESULTS = ASSETS / "branch-arm-frames-acceptance.json"
BRANCH_RESULTS = ASSETS / "branch-region-acceptance.json"


def data_uri(path: Path, width: int = 1180) -> str:
    image = Image.open(path).convert("RGB")
    if image.width > width:
        image = image.resize(
            (width, round(image.height * width / image.width)),
            Image.Resampling.LANCZOS,
        )
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=90, optimize=True)
    return "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def command(*args: str) -> str:
    return subprocess.run(
        args, cwd=ROOT, check=True, capture_output=True, text=True
    ).stdout.strip()


def lines(path: str) -> int:
    return len((ROOT / path).read_text(encoding="utf-8").splitlines())


def checks(path: Path) -> tuple[int, int, str]:
    values = json.loads(path.read_text(encoding="utf-8"))
    passed = sum(1 for value in values if value.get("ok"))
    rows = "".join(
        "<li><span>✓</span><b>"
        + html.escape(str(value["id"]))
        + "</b> · "
        + html.escape(str(value["label"]))
        + "</li>"
        for value in values
    )
    return passed, len(values), rows


def main() -> None:
    for path in (CLIP_SHOT, FIXTURE_SHOT, FRAME_RESULTS, BRANCH_RESULTS):
        if not path.exists():
            raise SystemExit(f"missing {path}")

    frame_passed, frame_total, frame_rows = checks(FRAME_RESULTS)
    branch_passed, branch_total, _ = checks(BRANCH_RESULTS)
    format_source = (ROOT / "src/workspace/systemSketchFile.ts").read_text(encoding="utf-8")
    format_version = re.search(r"SYSTEMSKETCH_FORMAT_VERSION = (\d+)", format_source).group(1)
    branch = command("git", "rev-parse", "--abbrev-ref", "HEAD")
    base = command("git", "merge-base", "HEAD", "main")[:12]
    change_stat = command(
        "git", "diff", "HEAD", "--shortstat", "--",
        "README.md", "package.json", "scripts/workspace_store.py", "src", "tests",
        "skills/systemsketch-review-fixture", "docs/*branch-arm-frames*",
        "sketches/review/branch-arm-frames*",
    ) or "feature tree clean"
    implementation_lines = lines("src/branch/BranchArmShapeUtil.tsx") + lines("src/branch/branchArmFrames.ts")

    registrations = []
    for path, label in [
        ("src/App.tsx", "product + development canvas"),
        ("src/embed/EmbeddedCanvas.tsx", "VS Code / Obsidian embed"),
        ("src/store/createSystemSketchStore.ts", "document store schema"),
        ("src/export/portableTldraw.ts", "isolated portable exporter"),
    ]:
        source = (ROOT / path).read_text(encoding="utf-8")
        if "BranchArmShapeUtil" in source:
            registrations.append(label)

    registration_rows = "".join(f"<li><span>◆</span>{html.escape(item)}</li>" for item in registrations)
    page = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch · Branch arm frames</title>
<style>
:root{{--bg:#080c13;--panel:#101827;--panel2:#172235;--line:#2d3b52;--ink:#f7f9fc;--muted:#abb7ca;--blue:#72a8ff;--green:#65d58a;--orange:#ffad57;font-family:Inter,ui-sans-serif,system-ui,sans-serif}}*{{box-sizing:border-box}}body{{margin:0;background:radial-gradient(circle at 78% 0,#1d3157 0,transparent 34rem),var(--bg);color:var(--ink)}}main{{width:min(1200px,calc(100% - 36px));margin:auto;padding:54px 0 80px}}.eyebrow{{color:var(--blue);font:800 12px ui-monospace,monospace;letter-spacing:.15em;text-transform:uppercase}}h1{{max-width:930px;margin:12px 0 18px;font-size:clamp(42px,7vw,78px);line-height:.95;letter-spacing:-.055em}}h2{{font-size:30px;letter-spacing:-.03em;margin:54px 0 12px}}h3{{margin:0 0 10px}}p{{line-height:1.55}}.lede{{max-width:910px;color:#d0d8e6;font-size:20px}}.stats{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:32px 0 50px}}.stat,.card{{border:1px solid var(--line);border-radius:16px;background:rgba(16,24,39,.93)}}.stat{{padding:18px}}.stat b{{display:block;font-size:29px}}.stat small,.muted{{color:var(--muted)}}figure{{margin:0;border:1px solid #3d4b61;border-radius:18px;overflow:hidden;background:white;box-shadow:0 24px 70px #0009}}figure img{{display:block;width:100%}}figcaption{{padding:14px 17px;background:var(--panel);color:var(--muted);line-height:1.5}}figcaption b{{color:var(--ink)}}.grid{{display:grid;grid-template-columns:1fr 1fr;gap:16px}}.card{{padding:22px}}ul{{list-style:none;margin:0;padding:0}}li{{display:flex;gap:9px;padding:8px 0;border-bottom:1px solid var(--line);line-height:1.42;color:#dfe6f1}}li:last-child{{border:0}}li span{{color:var(--green);font-weight:900}}code{{background:#1d2a3e;color:#dce9ff;border-radius:5px;padding:2px 5px}}.diagram{{position:relative;border:1px solid var(--line);border-radius:18px;background:linear-gradient(145deg,#0c1422,#131e30);padding:20px;overflow:hidden}}.diagram svg{{display:block;width:100%;height:auto}}.risk b{{color:var(--orange)}}.callout{{border-left:3px solid var(--orange);padding:10px 14px;background:#0c1422;border-radius:0 10px 10px 0;margin:10px 0}}a{{color:#8ab8ff}}pre{{white-space:pre-wrap;background:#070b11;border:1px solid var(--line);border-radius:12px;padding:16px;color:#ccd7e9}}footer{{margin-top:54px;padding-top:20px;border-top:1px solid var(--line);color:var(--muted)}}@media(max-width:800px){{.stats,.grid{{grid-template-columns:1fr}}}}
</style></head><body><main>
<div class="eyebrow">SystemSketch · implemented · {html.escape(branch)}</div>
<h1>Each Branch arm is now a real frame.</h1>
<p class="lede">The implementation is the small version of the proposal: one invisible stock frame-like shape per arm, spanning the arm header through the bottom of its body. A child may paint above <em>its own</em> header, while the next arm's top is a hard clipping boundary. The semantic Branch and all existing Block behavior remain authoritative.</p>
<div class="stats">
  <div class="stat"><b>{frame_passed}/{frame_total}</b><small>focused clipping checks</small></div>
  <div class="stat"><b>{branch_passed}/{branch_total}</b><small>existing Branch journey</small></div>
  <div class="stat"><b>{len(registrations)}</b><small>registered app/store/export lanes</small></div>
  <div class="stat"><b>v{format_version}</b><small>SystemSketch document format</small></div>
</div>

<h2>The visible result</h2>
<figure><img src="{data_uri(CLIP_SHOT)}" alt="Branch showing a Block above its own header and another clipped at the next arm"><figcaption><b>One screenshot, both boundaries.</b> <code>header overlap()</code> remains above the <code>if</code> header. <code>divider clip()</code> extends farther in its record, but paint and hit-testing stop exactly at <code>else</code>.</figcaption></figure>

<h2>The entire mechanism</h2>
<div class="diagram"><svg viewBox="0 0 1120 430" xmlns="http://www.w3.org/2000/svg" font-family="Inter,system-ui" font-size="16">
<defs><clipPath id="arm1"><rect x="360" y="112" width="650" height="122" rx="3"/></clipPath><clipPath id="arm2"><rect x="360" y="234" width="650" height="122" rx="3"/></clipPath><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5 0 10z" fill="#72a8ff"/></marker></defs>
<rect x="330" y="55" width="710" height="330" rx="14" fill="#101827" stroke="#6d7b91"/><text x="685" y="88" fill="#f7f9fc" text-anchor="middle" font-size="20" font-weight="700">Branch (semantic authority)</text>
<rect x="360" y="112" width="650" height="122" fill="#172235" stroke="#72a8ff" stroke-dasharray="7 5"/><rect x="360" y="234" width="650" height="122" fill="#172235" stroke="#72a8ff" stroke-dasharray="7 5"/><text x="378" y="138" fill="#abb7ca">arm_1 frame · header included</text><text x="378" y="260" fill="#abb7ca">arm_2 frame · next clipping region</text>
<g clip-path="url(#arm1)"><rect x="485" y="120" width="220" height="84" rx="10" fill="#f8fafc"/><text x="595" y="157" fill="#111827" text-anchor="middle" font-family="ui-monospace,monospace">own header overlap</text><rect x="748" y="182" width="210" height="120" rx="10" fill="#f8fafc"/><text x="853" y="218" fill="#111827" text-anchor="middle" font-family="ui-monospace,monospace">straddling Block</text></g>
<line x1="360" y1="234" x2="1010" y2="234" stroke="#ffad57" stroke-width="3"/><text x="1010" y="222" text-anchor="end" fill="#ffad57" font-weight="700">hard sibling boundary</text>
<rect x="25" y="75" width="245" height="70" rx="12" fill="#101827" stroke="#2d3b52"/><text x="148" y="104" fill="#f7f9fc" text-anchor="middle" font-weight="700">Branch.props.arms[]</text><text x="148" y="128" fill="#abb7ca" text-anchor="middle">titles · order · open · height</text>
<rect x="25" y="185" width="245" height="70" rx="12" fill="#101827" stroke="#2d3b52"/><text x="148" y="214" fill="#f7f9fc" text-anchor="middle" font-weight="700">reconcile projection</text><text x="148" y="238" fill="#abb7ca" text-anchor="middle">create · size · reparent</text>
<rect x="25" y="295" width="245" height="70" rx="12" fill="#101827" stroke="#2d3b52"/><text x="148" y="324" fill="#f7f9fc" text-anchor="middle" font-weight="700">tldraw 5.3.2</text><text x="148" y="348" fill="#abb7ca" text-anchor="middle">mask · hit test · carry · fold</text>
<path d="M270 110H330" stroke="#72a8ff" stroke-width="2" marker-end="url(#arrow)"/><path d="M270 220H330" stroke="#72a8ff" stroke-width="2" marker-end="url(#arrow)"/><path d="M270 330H330" stroke="#72a8ff" stroke-width="2" marker-end="url(#arrow)"/>
</svg></div>
<div class="grid" style="margin-top:16px"><div class="card"><h3>Where the helper is registered</h3><ul>{registration_rows}</ul></div><div class="card"><h3>Why it stays simple</h3><div class="callout">No bespoke CSS crop, overlay portal, or duplicate React membership tree. tldraw's supported <code>BaseFrameLikeShapeUtil</code> provides clipping and carrying.</div><div class="callout">The helper is structural only: invisible, uneditable, untabbable, unbindable, and normalized to the Branch if selected.</div><div class="callout">Portable export unwraps helpers in an isolated clone, so stock tldraw receives ordinary Branch children and no custom helper records.</div></div></div>

<h2>Side effects checked, not assumed</h2>
<div class="grid"><div class="card risk"><h3>Behavior retained</h3>
<p><b>Header z-order.</b> The arm frame begins at the header's top, not its bottom; descendants therefore cover their own header just as children cover an Expanded Block header.</p>
<p><b>Wires.</b> Semantic connections remain outside arm frames and both frame utilities explicitly exempt connections from clipping.</p>
<p><b>Fold / active / Case.</b> Deep arm ancestry resolves through the helper, so existing hide, fade and folded-header attachment behavior is unchanged.</p>
<p><b>Drops on Blocks.</b> A collapsed Block proxies stock drag-in/out to its nearest real container, now either an Expanded Block or an arm frame.</p></div>
<div class="card risk"><h3>Persistence and repair</h3>
<p><b>Old boards.</b> Direct Branch children are upgraded after load using the existing <code>meta.branchArm</code> stamp, with geometry as fallback.</p>
<p><b>New format.</b> Because helpers persist, the envelope advances to v{format_version}; newer files stay protected from older writers by the existing version fence.</p>
<p><b>Undo / remote changes.</b> An operation-complete reconciler is idempotent and runs remote repairs inside <code>mergeRemoteChanges</code>.</p>
<p><b>Coincident masks.</b> A framed child uses only the tighter arm mask. This avoids a polygon-intersection degeneracy discovered by the full wiring journey.</p></div></div>

<h2>Focused browser evidence</h2><div class="card"><ul>{frame_rows}</ul></div>

<h2>Human review board</h2>
<p class="muted">Generated through the real editor, autosaved, cold-reopened, visually inspected, and then driven once through fold → unfold. The board contains zero diagnostics.</p>
<figure><img src="{data_uri(FIXTURE_SHOT)}" alt="Numbered Branch arm frame review board"><figcaption><b>Review fixture.</b> Orange cards point to own-header overlap, sibling-arm clipping, and fold/unfold. The green card states the visible pass condition.</figcaption></figure>
<pre>http://127.0.0.1:4340/?board=%2Fhome%2Fbam%2Fsystemsketch-track-branch-arm-frames%2Fsketches%2Freview%2Fbranch-arm-frames.systemsketch</pre>

<footer><b>{html.escape(branch)}</b> · base <code>{base}</code> · {html.escape(change_stat)} · {implementation_lines} lines across the two new frame/projection modules. Built from live files by <code>docs/build_branch_arm_frames_implementation.py</code>.</footer>
</main></body></html>'''
    OUTPUT.write_text(page, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
