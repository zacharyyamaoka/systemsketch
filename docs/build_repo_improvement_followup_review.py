#!/usr/bin/env python3
"""Build the self-contained SystemSketch follow-up decision gallery."""

from __future__ import annotations

import base64
import html
from pathlib import Path
from urllib.parse import quote


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs" / "assets"
OUTPUT = ROOT / "docs" / "repo-improvement-followup-review-2026-09-02.html"
PREVIEW_ORIGIN = "http://127.0.0.1:4400"


FEATURES = [
    {
        "rank": 4,
        "title": "Editable compatibility copy",
        "kicker": "Compatibility · revised after review",
        "behavior": (
            "A future-format board opens visibly but protected. “Create editable copy…” writes a new, "
            "current-format document; the newer original remains byte-exact and cannot autosave, rename, or overwrite."
        ),
        "boundary": (
            "The stock tldraw snapshot must parse before a copy is offered. SystemSketch owns only its versioned "
            "envelope and file workflow, so it leaves unknown future metadata byte-exact in the protected original "
            "without teaching tldraw a foreign format."
        ),
        "acceptance": [
            "Future content renders with a specific format-version warning.",
            "Save and Rename cannot target the protected source.",
            "The explicit copy is current-format, editable, and separate; cancelling changes nothing.",
        ],
        "images": [
            ("workspace-followup-future-protected-2026-09-02.png", "Newer document protected from edits"),
            ("workspace-followup-compatible-copy-2026-09-02.png", "Explicit compatible-copy destination"),
        ],
    },
    {
        "rank": 23,
        "title": "Local canvas comments",
        "kicker": "Review workflow · local-first",
        "behavior": (
            "Comments now attach to the selected shape or the page, support replies, resolve/reopen, soft delete, "
            "and travel inside the .systemsketch document without a server or account. Clicking a thread reveals its anchor."
        ),
        "boundary": (
            "Threads use tldraw’s public comment record schema, but SystemSketch supplies the local panel. A thread may "
            "carry an optional Python path + line/span + symbol + source digest reference. That is navigation metadata: "
            "a later IDE action can open the source location, but comments never silently mutate a .py file."
        ),
        "acceptance": [
            "Create and reply to a shape-anchored thread, then reload the board.",
            "Resolve and reopen without losing its history; deletion remains a soft local record change.",
            "An optional Python reference is explicit, copyable, and independent of the board anchor.",
        ],
        "images": [
            ("repo-improvements-local-comments.png", "Local thread, replies, resolution, and Python reference"),
        ],
        "fixture": "local-comments.systemsketch",
    },
    {
        "rank": 24,
        "title": "Command palette and cross-page find / replace",
        "kicker": "Navigation · public editor APIs",
        "behavior": (
            "Ctrl/Cmd+K opens searchable commands. Ctrl/Cmd+F searches readable shape text across pages, focuses a "
            "match, and performs explicit single or replace-all edits as one undoable history action."
        ),
        "boundary": (
            "Pinned tldraw 5.3.2 has no stock command palette or board find/replace. This stays above the engine: "
            "public ShapeUtil.getText supplies search text, Editor APIs navigate, and history batches replacement. "
            "Only formats with safe text adapters are rewritten."
        ),
        "acceptance": [
            "The two shortcuts open their named modes and keyboard focus stays contained.",
            "Results are stable across pages and Enter selects, changes page, and fits the match.",
            "Replace All changes supported text only and one Undo restores the full batch.",
        ],
        "images": [
            ("command-palette-commands-2026-09-02.png", "Searchable command mode"),
            ("command-palette-find-replace-2026-09-02.png", "Cross-page find and replace mode"),
        ],
        "fixture": "board-find-replace.systemsketch",
    },
    {
        "rank": 25,
        "title": "Fake timer removed",
        "kicker": "Chrome honesty · subtraction",
        "behavior": (
            "The static “03:00” badge is gone. Header space now contains only working actions, so a decorative mock "
            "can no longer be mistaken for a running timer."
        ),
        "boundary": (
            "This is application chrome, not canvas state. Removing the inert control avoids inventing persistence or "
            "timing semantics and leaves the stock tldraw surface untouched."
        ),
        "acceptance": [
            "No timer label or hard-coded 03:00 string is present in the live header.",
            "Header controls remain collision-free at desktop and narrow widths.",
            "No canvas document or history record changes as a result.",
        ],
        "images": [
            ("command-palette-commands-2026-09-02.png", "Live header with the placeholder timer absent"),
        ],
    },
    {
        "rank": 33,
        "title": "Problems-style board diagnostics",
        "kicker": "Model correctness · derived view",
        "behavior": (
            "A Problems button reports warning and error counts. The panel groups deterministic findings by page, "
            "filters by severity, and clicking an item changes page, selects the subject, and zooms to it."
        ),
        "boundary": (
            "Diagnostics are a pure read model over current records—not saved issue objects and not a second source of "
            "truth. Findings disappear only when the board is fixed. It intentionally avoids type-mismatch claims until "
            "typed ports exist, and ignores transient half-built cables."
        ),
        "acceptance": [
            "Known issues produce stable, named rows grouped under the correct page.",
            "Severity filters and counters agree with the visible list.",
            "Clicking a row navigates to and frames the real offending object; a clean board shows zero problems.",
        ],
        "images": [
            ("board-diagnostics-problems-2026-09-02.png", "Problems panel with grouped, clickable findings"),
            ("board-diagnostics-clear-2026-09-02.png", "Clear state after fixing the board"),
        ],
        "fixture": "board-diagnostics.systemsketch",
    },
    {
        "rank": 34,
        "title": "Create folders from the workspace dialog",
        "kicker": "File workflow · root confined",
        "behavior": (
            "New Folder is available beside workspace navigation. A successful create enters that directory immediately; "
            "Enter submits, Escape cancels only the inline form, and failures remain visible and recoverable."
        ),
        "boundary": (
            "Directory creation belongs to the local workspace API. The server resolves the parent beneath the configured "
            "files root, validates one folder name, refuses collisions, and never delegates filesystem semantics to tldraw."
        ),
        "acceptance": [
            "A valid Unicode or spaced name creates exactly one directory and enters it.",
            "Empty, dot, separator, control-character, and escape names are rejected.",
            "An existing file/folder is never replaced and every failure stays inside the dialog.",
        ],
        "images": [
            ("workspace-followup-folder-created-2026-09-02.png", "Created folder selected as the current destination"),
            ("workspace-followup-folder-validation-2026-09-02.png", "Inline validation without losing dialog context"),
        ],
    },
]


def image_uri(filename: str) -> str:
    path = ASSETS / filename
    if not path.is_file():
        raise FileNotFoundError(f"Missing required review evidence: {path}")
    suffix = path.suffix.lower()
    media_type = "image/png" if suffix == ".png" else "image/jpeg"
    return f"data:{media_type};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


def live_fixture_url(filename: str) -> str:
    path = ROOT / "sketches" / "review" / filename
    return f"{PREVIEW_ORIGIN}/?board={quote(str(path), safe='')}"


def render_feature(feature: dict[str, object]) -> str:
    rank = int(feature["rank"])
    images = "".join(
        f'<figure><img src="{image_uri(filename)}" alt="{html.escape(alt)}"><figcaption>{html.escape(alt)}<code>{html.escape(filename)}</code></figcaption></figure>'
        for filename, alt in feature["images"]
    )
    checklist = "".join(f"<li>{html.escape(item)}</li>" for item in feature["acceptance"])
    fixture = feature.get("fixture")
    try_it = ""
    if fixture:
        url = live_fixture_url(str(fixture))
        try_it = (
            f'<a class="try" data-live-fixture="{html.escape(str(fixture))}" href="{html.escape(url)}">'
            f'Try the seeded board <span aria-hidden="true">↗</span></a>'
            f'<a class="file" data-fixture-file href="../sketches/review/{html.escape(str(fixture))}">fixture file</a>'
        )
    return f"""
<article class="feature" data-rank="{rank}">
  <div class="feature-head"><div class="number">#{rank:02d}</div><div><p class="kicker">{html.escape(str(feature['kicker']))}</p><h2>{html.escape(str(feature['title']))}</h2></div></div>
  <div class="evidence evidence--{len(feature['images'])}">{images}</div>
  <div class="feature-body">
    <section><h3>What changed</h3><p>{html.escape(str(feature['behavior']))}</p></section>
    <section class="boundary"><h3>Why this is the right seam</h3><p>{html.escape(str(feature['boundary']))}</p></section>
    <section class="acceptance"><h3>Accept when</h3><ul>{checklist}</ul></section>
  </div>
  <div class="feature-foot"><div class="links">{try_it}</div><label class="decision"><input type="checkbox" data-review="decision" data-key="{rank}"><span>Accept this follow-up</span></label><label class="notes"><span>Notes</span><textarea data-review="note" data-key="{rank}-note" placeholder="What should change, or why this works…"></textarea></label></div>
</article>"""


def main() -> None:
    cards = "\n".join(render_feature(feature) for feature in FEATURES)
    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch follow-up review · 2026-09-02</title>
<style>
:root{{--paper:#f2f1ed;--card:#fff;--ink:#1b1e25;--muted:#667080;--line:#d9dad7;--violet:#6258f5;--violet-pale:#f0efff;--orange:#e47b26;--green:#13794a;--shadow:0 18px 52px #20242c12;color-scheme:light}}
*{{box-sizing:border-box}}html{{scroll-behavior:smooth}}body{{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 Inter,ui-sans-serif,system-ui,sans-serif}}button,input,textarea{{font:inherit}}a{{color:#4239d1;font-weight:760}}main{{max-width:1360px;margin:auto;padding:44px 28px 96px}}.eyebrow,.kicker{{margin:0;color:var(--violet);font-size:11px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}}h1{{max-width:1000px;margin:10px 0 16px;font-size:clamp(44px,6vw,78px);line-height:.95;letter-spacing:-.055em}}h2{{margin:4px 0 0;font-size:31px;line-height:1.08;letter-spacing:-.04em}}h3{{margin:0 0 8px;font-size:12px;letter-spacing:.08em;text-transform:uppercase}}p{{color:var(--muted)}}.lead{{max-width:850px;margin:0 0 28px;font-size:19px}}.hero{{display:grid;grid-template-columns:1.25fr .75fr;gap:16px;margin-bottom:18px}}.hero-card,.stock-note{{border:1px solid var(--line);border-radius:22px;background:var(--card);box-shadow:var(--shadow);padding:24px}}.hero-card{{background:linear-gradient(135deg,#1b1e25,#292642);color:#fff}}.hero-card p{{color:#c7c9d6;margin-bottom:0}}.metrics{{display:flex;gap:8px;flex-wrap:wrap;margin-top:22px}}.metric{{padding:9px 12px;border:1px solid #ffffff28;border-radius:12px}}.metric b{{display:block;font-size:24px}}.metric span{{color:#b9bcc9;font-size:11px}}.stock-note{{border-left:5px solid var(--orange)}}.stock-note p{{margin:8px 0}}.stock-note strong{{color:var(--ink)}}.controls{{position:sticky;z-index:10;top:10px;display:flex;align-items:center;gap:10px;margin:20px 0 26px;padding:12px;background:#ffffffed;border:1px solid var(--line);border-radius:15px;box-shadow:var(--shadow);backdrop-filter:blur(14px)}}button{{cursor:pointer;border:1px solid #272a31;border-radius:10px;background:#272a31;color:#fff;padding:9px 13px;font-weight:800}}button.secondary{{background:#fff;color:var(--ink);border-color:var(--line)}}output{{margin-left:auto;color:var(--muted);font-size:12px}}.feature{{overflow:hidden;margin:0 0 22px;border:1px solid var(--line);border-radius:24px;background:var(--card);box-shadow:var(--shadow)}}.feature-head{{display:grid;grid-template-columns:72px 1fr;gap:12px;padding:25px 26px 21px;align-items:start}}.number{{font-size:28px;font-weight:950;color:#aaadb5;letter-spacing:-.04em}}.evidence{{display:grid;background:#17191e;border-block:1px solid var(--line)}}.evidence--2{{grid-template-columns:1fr 1fr}}figure{{min-width:0;margin:0;border-right:1px solid #3a3d45}}figure:last-child{{border-right:0}}figure img{{display:block;width:100%;height:410px;object-fit:contain}}figcaption{{display:flex;justify-content:space-between;gap:12px;padding:9px 13px;background:#23262c;color:#d5d7dd;font-size:12px}}figcaption code{{color:#9299a7;font-size:10px}}.feature-body{{display:grid;grid-template-columns:1fr 1fr 1fr}}.feature-body>section{{padding:22px 24px;border-right:1px solid var(--line)}}.feature-body>section:last-child{{border-right:0}}.feature-body p{{margin:0}}.boundary{{background:var(--violet-pale)}}.boundary p{{color:#4d4a6b}}.acceptance ul{{margin:0;padding-left:19px}}.acceptance li+li{{margin-top:7px}}.feature-foot{{display:grid;grid-template-columns:minmax(130px,.65fr) 210px minmax(260px,1fr);gap:16px;align-items:start;padding:17px 22px;border-top:1px solid var(--line);background:#fafaf7}}.links{{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding-top:8px}}.try{{display:inline-flex;gap:5px;border-radius:9px;background:var(--violet);color:#fff;padding:8px 10px;text-decoration:none}}.file{{font-size:12px}}.decision{{display:flex;gap:9px;align-items:center;padding-top:9px;font-weight:850;cursor:pointer}}.decision input{{width:20px;height:20px;accent-color:var(--green)}}.notes>span{{display:block;color:var(--muted);font-size:10px;font-weight:850;letter-spacing:.08em;text-transform:uppercase}}textarea{{width:100%;min-height:64px;margin-top:5px;padding:9px 11px;border:1px solid var(--line);border-radius:10px;background:#fff;resize:vertical}}footer{{padding:24px 4px;color:var(--muted)}}
@media(max-width:900px){{main{{padding:26px 15px 70px}}.hero{{grid-template-columns:1fr}}.feature-body{{grid-template-columns:1fr}}.feature-body>section{{border-right:0;border-bottom:1px solid var(--line)}}.feature-body>section:last-child{{border-bottom:0}}.feature-foot{{grid-template-columns:1fr 1fr}}.notes{{grid-column:1/-1}}.evidence--2{{grid-template-columns:1fr}}figure{{border-right:0;border-bottom:1px solid #3a3d45}}figure:last-child{{border-bottom:0}}figure img{{height:auto;max-height:560px}}}}
@media(max-width:560px){{h1{{font-size:43px}}.feature-head{{grid-template-columns:54px 1fr;padding-inline:17px}}h2{{font-size:25px}}.feature-body>section{{padding:19px 17px}}.feature-foot{{grid-template-columns:1fr;padding-inline:17px}}.notes{{grid-column:auto}}.controls{{align-items:stretch;flex-direction:column}}.controls output{{margin:0}}figcaption{{display:block}}figcaption code{{display:block;margin-top:4px;overflow-wrap:anywhere}}}}
</style></head><body><main>
<p class="eyebrow">SystemSketch · follow-up decision surface · 2026-09-02</p><h1>Six changes, each ready for a yes or no.</h1>
<p class="lead">This page is a temporary human review surface. Exercise the linked seeded boards, check the changes worth keeping, add notes, and copy one Markdown response. The code and regression tests remain the living specification.</p>
<section class="hero"><div class="hero-card"><p class="eyebrow">Review the phenotype</p><h2>Safety first, then faster review and navigation.</h2><p>The rejected read-only-only behavior is now a compatibility-copy workflow. The five selected product changes are implemented with local, inspectable state and public tldraw seams.</p><div class="metrics"><div class="metric"><b>6</b><span>judgeable changes</span></div><div class="metric"><b>3</b><span>seeded boards</span></div><div class="metric"><b>0</b><span>engine forks</span></div></div></div>
<aside class="stock-note"><p class="eyebrow">#02 / #03 / #06 · ownership answer</p><h2>Stock tldraw owns the document primitives.</h2><p><strong>tldraw:</strong> editor store, snapshots, serializer/parser, history, and read-only mode.</p><p><strong>SystemSketch + its IDE/browser hosts:</strong> session/revision queues, debounce and lifecycle flushing, recovery checkpoints, and close/navigation guards. Those concerns sit outside a canvas engine because only the host knows when writes, tabs, webviews, or pages are being replaced.</p></aside></section>
<nav class="controls" aria-label="Review controls"><button type="button" id="copy-review">Copy Markdown decisions</button><button type="button" class="secondary" id="reset-review">Reset this review</button><output id="review-status">Decisions save only in this browser.</output></nav>
{cards}
<footer>Seeded review boards open against Preview on <code>127.0.0.1:4400</code>. Screenshot evidence is embedded, so this report remains self-contained. Builder: <a href="build_repo_improvement_followup_review.py">build_repo_improvement_followup_review.py</a>.</footer>
<script>
const prefix='systemsketch.followup-review.2026-09-02.';const status=document.querySelector('#review-status');
for(const control of document.querySelectorAll('[data-review]')){{const key=prefix+control.dataset.key;const saved=localStorage.getItem(key);if(control.type==='checkbox')control.checked=saved==='true';else if(saved!==null)control.value=saved;control.addEventListener('input',()=>{{localStorage.setItem(key,control.type==='checkbox'?String(control.checked):control.value);status.value='Saved locally.'}})}}
document.querySelector('#reset-review').addEventListener('click',()=>{{for(const key of Object.keys(localStorage))if(key.startsWith(prefix))localStorage.removeItem(key);for(const control of document.querySelectorAll('[data-review]'))control.type==='checkbox'?control.checked=false:control.value='';status.value='Review reset.'}});
document.querySelector('#copy-review').addEventListener('click',async()=>{{const lines=['# SystemSketch follow-up review',''];for(const card of document.querySelectorAll('.feature')){{const rank=card.dataset.rank.padStart(2,'0');const title=card.querySelector('h2').textContent.trim();const checked=card.querySelector('[data-review="decision"]').checked;const note=card.querySelector('[data-review="note"]').value.trim();lines.push(`- [${{checked?'x':' '}}] #${{rank}} Accept — ${{title}}${{note?`\n  - ${{note}}`:''}}`)}}try{{await navigator.clipboard.writeText(lines.join(String.fromCharCode(10)));status.value='Copied all six decisions.'}}catch{{status.value='Clipboard unavailable; retry in a secure browser context.'}}}});
</script></main></body></html>"""
    OUTPUT.write_text(page, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
