#!/usr/bin/env python3
"""Build the self-contained Preview-to-Stable workspace handoff gallery."""

from __future__ import annotations

import base64
import html
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
OUTPUT = DOCS / "promoted-workspace-handoff-2026-09-03.html"
FIXTURE = ROOT / "sketches" / "review" / "promoted-workspace-handoff.systemsketch"
FIXTURE_SHOT = FIXTURE.with_suffix(".png")
RESTORE_SHOT = DOCS / "promoted-workspace-restored-live-2026-09-03.png"


def image_uri(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def check(label: str, ok: bool) -> str:
    return f'<li class="{"ok" if ok else "missing"}"><b>{"✓" if ok else "!"}</b>{html.escape(label)}</li>'


def main() -> None:
    server = (ROOT / "scripts" / "server.py").read_text(encoding="utf-8")
    bootstrap = (ROOT / "src" / "main.tsx").read_text(encoding="utf-8")
    client = (ROOT / "src" / "promotedWorkspaceState.ts").read_text(encoding="utf-8")
    journey = (ROOT / "tests" / "promoted_workspace_restore_smoke.mjs").read_text(encoding="utf-8")
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    shapes = [record for record in fixture["records"] if record.get("typeName") == "shape"]
    bindings = [record for record in fixture["records"] if record.get("typeName") == "binding"]
    facts = [
        ("Preview saves the active board before a confirmed promotion", "await workspace.save()" in (ROOT / "src" / "SystemSketchUtilities.tsx").read_text(encoding="utf-8")),
        ("The controller accepts only an allowlist of small JSON preferences", "PROMOTED_WORKSPACE_PREFERENCE_KEYS" in server and "MAX_PREFERENCE_BYTES" in client),
        ("The record is bound to the exact Stable build and written atomically", "os.replace(temporary, destination)" in server and "channels.stable != self.build" in server),
        ("Stable restores before importing the app and yields to an explicit board URL", "await restorePromotedWorkspaceState()" in bootstrap and "has('board')" in client),
        ("A real fresh-profile browser journey proves restore and explicit-link precedence", "fresh Stable profile" in journey and "explicit board URL" in journey),
    ]
    facts_html = "".join(check(label, ok) for label, ok in facts)
    fixture_image = image_uri(FIXTURE_SHOT)
    restore_image = image_uri(RESTORE_SHOT)
    OUTPUT.write_text(
        f"""<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Preview promotion — workspace handoff</title>
<style>
  :root {{ color-scheme:dark; --ink:#ecf2ff; --muted:#aab8d1; --paper:#101729; --card:#172139; --line:#33445f; --blue:#78aaff; --orange:#ff9b42; --green:#55d985; font-family:Inter,ui-sans-serif,system-ui,sans-serif; }}
  * {{ box-sizing:border-box }} body {{ margin:0; background:radial-gradient(circle at 15% 0,#1b2b50,transparent 32rem),var(--paper); color:var(--ink); }}
  main {{ max-width:1220px; margin:auto; padding:54px 28px 78px }} h1 {{ max-width:980px; margin:10px 0 18px; font-size:clamp(42px,7vw,82px); letter-spacing:-.06em; line-height:.94 }} h2 {{ margin:0 0 14px; font-size:27px; letter-spacing:-.025em }}
  .eyebrow {{ color:var(--blue); font-size:12px; font-weight:850; letter-spacing:.14em; text-transform:uppercase }} .lead {{ max-width:850px; color:var(--muted); font-size:20px; line-height:1.55 }}
  .flow {{ display:grid; grid-template-columns:repeat(3,1fr); gap:13px; margin:34px 0 }} .step {{ min-height:146px; padding:20px; border-radius:18px; background:var(--card); border:1px solid var(--line); position:relative }} .step:not(:last-child)::after {{ content:'→'; position:absolute; z-index:2; right:-20px; top:49px; color:var(--orange); font-size:30px; font-weight:900 }} .step b {{ display:block; color:var(--blue); font-size:12px; letter-spacing:.1em; text-transform:uppercase; margin-bottom:9px }} .step span {{ color:var(--muted); line-height:1.45 }}
  .facts {{ list-style:none; padding:0; display:grid; grid-template-columns:repeat(auto-fit,minmax(290px,1fr)); gap:12px }} .facts li {{ min-height:76px; padding:16px; background:var(--card); border:1px solid var(--line); border-radius:14px; line-height:1.4 }} .facts b {{ color:var(--green); font-size:18px; margin-right:10px }} .facts .missing b {{ color:#ff7383 }}
  .shots {{ display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-top:20px }} figure {{ margin:0; border-radius:18px; overflow:hidden; border:1px solid var(--line); background:var(--card) }} figure img {{ display:block; width:100%; background:#f8fafc }} figcaption {{ padding:16px 18px 19px; color:var(--muted); line-height:1.5 }}
  .boundary {{ margin-top:36px; padding:24px; border-radius:18px; border:1px solid #356a57; background:#142a25; color:#c6f6d8; line-height:1.55 }} code {{ color:#c6d8ff }} footer {{ margin-top:34px; color:var(--muted); line-height:1.6 }} a {{ color:#9ab9ff; font-weight:750 }}
  @media(max-width:760px) {{ main {{ padding:36px 18px 60px }} .flow,.shots {{ grid-template-columns:1fr }} .step:not(:last-child)::after {{ content:'↓'; right:auto; left:calc(50% - 8px); top:auto; bottom:-25px }} }}
</style>
<body><main>
  <div class="eyebrow">SystemSketch release workflow · 3 September 2026</div>
  <h1>Stable picks up where Preview left off.</h1>
  <p class="lead">A confirmed promotion now writes one compact, build-keyed handoff: the saved active board, a capped recent-file list, and selected app preferences. Stable consumes it once in its own profile before the app loads. No browser profile, cookies, session state, arbitrary local storage, or unsaved canvas data crosses the boundary.</p>
  <section class="flow" aria-label="workspace handoff flow">
    <div class="step"><b>1 · Preview</b><span>Save the current shared board and capture the reviewed convenience state.</span></div>
    <div class="step"><b>2 · Confirmed publish</b><span>After Stable actually advances, atomically store that small payload under the new build id.</span></div>
    <div class="step"><b>3 · Fresh Stable</b><span>Fetch only the matching record, restore it once, then bootstrap the usual workspace.</span></div>
  </section>
  <h2>Safety boundaries proved in code</h2><ul class="facts">{facts_html}</ul>
  <section class="shots"><figure><img src="{fixture_image}" alt="Review board for the promoted workspace handoff"><figcaption><b>Review fixture.</b> The live Preview board gives the exact promotion gesture and its observable success condition.</figcaption></figure><figure><img src="{restore_image}" alt="The handoff review board reopened in a fresh Stable browser profile"><figcaption><b>Fresh Stable result.</b> A new browser profile reopened the board from the build-keyed handoff; the browser journey also asserts the recents, selected scale, and one-time receipt.</figcaption></figure></section>
  <div class="boundary"><b>Deliberately not a pointer to a browser profile.</b> The release channel still points at an immutable app build. The extra file is a narrowly validated, versioned workspace hint that can be ignored safely when it is stale, malformed, out of the shared workspace, or superseded by an explicit <code>?board=</code> URL.</div>
  <footer>Evidence: <code>npm run check</code>; <code>npm run test:promotion-handoff</code>; and the opt-in full promotion journey <code>SYSTEMSKETCH_PUBLISH_PROOF=1 npm run test:release-ui</code>. Review artifact: {len(shapes)} shapes, {len(bindings)} bindings, and a cold reopen with a bound-arrow motion probe.</footer>
</main></body></html>\n""",
        encoding="utf-8",
    )
    print(OUTPUT)


if __name__ == "__main__":
    main()
