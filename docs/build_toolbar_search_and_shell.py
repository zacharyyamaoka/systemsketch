#!/usr/bin/env python3
"""Build the self-contained searchable-toolbar and compact-shell gallery."""

from __future__ import annotations

import base64
import html
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
ASSETS = DOCS / "assets"
OUTPUT = DOCS / "toolbar-search-and-shell-2026-09-06.html"
FIXTURE = ROOT / "sketches" / "review" / "toolbar-search-and-shell.systemsketch"
RECIPE = ROOT / "sketches" / "review" / "toolbar-search-and-shell.recipe.json"


def data_uri(path: Path, mime: str) -> str:
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


def main() -> None:
    tools = [
        "Cursor", "Frame", "Block", "Branch", "Loop", "Behavior Tree", "Code", "Pill", "Type", "Callout",
        "Rectangle", "Ellipse", "Triangle", "Diamond", "Line", "Straight arrow", "Curved arrow", "Elbow arrow",
        "Pen", "Highlighter", "Text",
    ]
    chips = "".join(f"<span>{html.escape(tool)}</span>" for tool in tools)
    page = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Searchable toolbar · SystemSketch</title>
<style>
:root { --ink:#20252d; --muted:#65707d; --paper:#eef2f7; --line:#dbe3ec; --blue:#347dec; --blue-soft:#e7f0ff; --green:#21885a; --orange:#f29136; }
* { box-sizing:border-box } body { margin:0; color:var(--ink); background:radial-gradient(circle at 88% 0,#dfeaff 0,transparent 35%),var(--paper); font:16px/1.48 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
main { width:min(1180px,calc(100% - 32px)); margin:auto; padding:42px 0 72px; } a { color:#215fab; text-underline-offset:3px; } .hero,.panel { border:1px solid var(--line); border-radius:24px; background:#fffc; box-shadow:0 18px 46px #27364b12; }
.hero { padding:42px; } .eyebrow { color:var(--blue); font-size:12px; font-weight:850; letter-spacing:.14em; text-transform:uppercase; } h1 { max-width:900px; margin:11px 0 14px; font-size:clamp(42px,7vw,75px); line-height:.96; letter-spacing:-.06em; } h2 { margin:0; font-size:28px; letter-spacing:-.035em; } h3 { margin:0 0 6px; font-size:18px; } .lead { max-width:820px; margin:0; color:var(--muted); font-size:19px; }
.stats { display:flex; flex-wrap:wrap; gap:10px; margin-top:25px; } .stats span { padding:8px 11px; border:1px solid #cbdcf4; border-radius:999px; color:#255b9c; background:#edf4ff; font-size:12px; font-weight:760; }
.panel { margin-top:24px; padding:30px; } .head { display:flex; align-items:end; justify-content:space-between; gap:24px; margin-bottom:18px; } .head p { max-width:600px; margin:0; color:var(--muted); }
video,.shot { display:block; width:100%; border:1px solid var(--line); border-radius:16px; background:#fff; } .caption { margin:10px 4px 0; color:var(--muted); font-size:13px; }
.grid { display:grid; grid-template-columns:1fr 1fr; gap:18px; } .card { overflow:hidden; border:1px solid var(--line); border-radius:17px; background:#fff; } .card div { padding:18px 18px 6px; } .card p { margin:0; color:var(--muted); font-size:14px; } .card img { display:block; width:100%; margin-top:13px; border-top:1px solid var(--line); }
.flow { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; } .flow article { position:relative; min-height:130px; padding:19px; border:1px solid var(--line); border-radius:16px; background:#f9fbfe; } .flow b { display:block; margin-bottom:8px; color:#225eaa; font-size:12px; letter-spacing:.08em; text-transform:uppercase; } .flow span { color:var(--muted); font-size:14px; } .flow article:not(:last-child)::after { content:'→'; position:absolute; z-index:2; right:-17px; top:52px; color:var(--orange); font-size:25px; font-weight:900; }
.tools { display:flex; flex-wrap:wrap; gap:8px; } .tools span { padding:7px 10px; border:1px solid #d7e0ec; border-radius:8px; background:#fff; font-size:13px; font-weight:680; } .proof { display:grid; grid-template-columns:.7fr 1.3fr; gap:18px; align-items:center; } .metric { padding:23px; border:1px solid #cfe6d9; border-radius:17px; color:#286546; background:#f0faf4; } .metric strong { display:block; font-size:43px; letter-spacing:-.055em; } .metric span { font-size:13px; } .proof ul { margin:0; padding:0; list-style:none; } .proof li { margin:8px 0; padding-left:29px; position:relative; color:var(--muted); } .proof li::before { content:'✓'; position:absolute; left:0; top:0; display:grid; place-items:center; width:19px; height:19px; border-radius:50%; color:#fff; background:var(--green); font-size:11px; font-weight:900; }
.fixture { display:grid; grid-template-columns:1.55fr .75fr; gap:18px; align-items:start; } .fixture img { display:block; width:100%; border:1px solid var(--line); border-radius:16px; } .fixture p { color:var(--muted); } .button { display:inline-block; padding:10px 13px; border-radius:10px; color:#fff; background:var(--blue); font-size:13px; font-weight:800; text-decoration:none; } details { margin-top:16px; overflow:hidden; border-radius:14px; color:#dce5f0; background:#20252d; } summary { padding:15px 18px; cursor:pointer; font-weight:750; } pre { margin:0; padding:0 18px 20px; overflow:auto; font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; }
footer { display:flex; justify-content:space-between; gap:18px; padding:25px 4px 0; color:var(--muted); font-size:12px; } @media (max-width:800px) { .grid,.fixture,.proof { grid-template-columns:1fr; } .flow { grid-template-columns:1fr; } .flow article:not(:last-child)::after { content:'↓'; right:auto; top:auto; left:50%; bottom:-24px; } .head { display:block; } .head p { margin-top:8px; } } @media (max-width:560px) { main { width:calc(100% - 18px); padding-top:10px; } .hero,.panel { padding:22px; border-radius:17px; } footer { display:block; } }
</style></head><body><main>
<header class="hero"><div class="eyebrow">Implemented · Toolbar flow</div><h1>S speaks the toolbar’s language.</h1><p class="lead">Every visible drawing choice now has one exact S-search registration, so the entry point named by its label arms the same public tool action as the toolbar. The top-right shell drops two duplicate launchers without taking away Library or Commands.</p><div class="stats"><span>21 visible toolbar tools</span><span>Type ranks before Text</span><span>Library stays in bottom toolbar</span><span>Commands stay on Ctrl/Cmd + P</span></div></header>
<section class="panel"><div class="head"><h2>Observed journey</h2><p>A real-browser capture first establishes the simplified chrome, then demonstrates literal-first S search and Type arming.</p></div><video class="hero-video" controls autoplay muted loop playsinline><source src="__HERO_MP4__" type="video/mp4"><img src="__HERO_GIF__" alt="The focused top-right shell followed by S search with Type first"></video><p class="caption">Seven-second muted loop assembled only from the real browser evidence captured by the acceptance journey. The GIF is the compatibility fallback.</p></section>
<section class="panel"><div class="head"><h2>One search contract, two visible outcomes</h2><p>The test captures show the two surfaces the user can verify directly.</p></div><div class="grid"><article class="card"><div><h3>Focused right shell</h3><p>Inspector and Share remain; the Shapes library and ⌘ buttons no longer duplicate their bottom-toolbar and keyboard entry points.</p></div><img src="__SHELL_PNG__" alt="SystemSketch top-right shell without Shapes library or Commands buttons"></article><article class="card"><div><h3>Literal-first tool search</h3><p>Typing <code>Type</code> yields Type before Text; Enter arms the registered Type tool.</p></div><img src="__SEARCH_PNG__" alt="S tool search with Type listed before Text"></article></div></section>
<section class="panel"><div class="head"><h2>How a name becomes a tool</h2><p>A narrow registry owns the labels and tool IDs, reuses aliases, and fences results to tools actually registered in the editor.</p></div><div class="flow"><article><b>Toolbar name</b><span>The visible label is registered once with its actual tool ID and related search words.</span></article><article><b>S search / aliases</b><span>The same catalog drives literal ranking, personal aliases, and Settings rows.</span></article><article><b>Public action</b><span>Enter calls that live tool’s <code>onSelect('toolbar')</code>, just as the toolbar does.</span></article></div></section>
<section class="panel"><div class="head"><h2>Searchable toolbar names</h2><p>Every currently visible toolbar choice is covered in the real-browser journey. Port is not listed because it is not a present toolbar tool in this code line.</p></div><div class="tools">__TOOL_CHIPS__</div></section>
<section class="panel"><div class="head"><h2>Executable proof</h2><p>The focused browser journeys exercised visible chrome, S search, literal ordering, Enter arming, Library focus ownership, and the retained command shortcut.</p></div><div class="proof"><div class="metric"><strong>1,511</strong><span>Vitest checks in the green full suite</span></div><ul><li><code>npm run test:primitive-search</code> — 9/9, cycles every listed toolbar name</li><li><code>npm run test:commands</code> — 11/11, Ctrl/Cmd + P remains the command path</li><li><code>node tests/library_overview_smoke.mjs</code> — 17/17, bottom Library entry remains responsive</li><li><code>npm run check</code> — green, including 118 Python tests and the depth browser journey</li></ul></div></section>
<section class="panel"><div class="head"><h2>Ready-to-drive review board</h2><p>The disposable board starts at an honest canvas target and uses bound orange cues for the Block and Type gestures; its green card names the visible shell result.</p></div><div class="fixture"><img src="__FIXTURE_PNG__" alt="Toolbar search and shell review fixture with numbered S-search instructions"><div><div class="eyebrow">Human verification</div><h2>Find, arm, inspect</h2><p>Press S on the canvas, search for Block and Type, then verify the right shell shows no duplicate Shapes or Commands icons.</p><a class="button" data-review-fixture href="../sketches/review/toolbar-search-and-shell.systemsketch">Open the fixture file</a></div></div><details><summary>See the review recipe</summary><pre>__RECIPE__</pre></details></section>
<footer><span>SystemSketch · searchable toolbar and focused shell · 6 Sep 2026</span><span><a href="build_toolbar_search_and_shell.py">Builder</a> · <a href="../tests/primitive_search_smoke.mjs">Browser journey</a> · <a href="../README.md">README</a></span></footer>
</main></body></html>"""
    substitutions = {
        "__HERO_MP4__": data_uri(ASSETS / "toolbar-search-and-shell-hero.mp4", "video/mp4"),
        "__HERO_GIF__": data_uri(ASSETS / "toolbar-search-and-shell-hero.gif", "image/gif"),
        "__SHELL_PNG__": data_uri(ASSETS / "library-overview-chrome-1440-2026-09-02.png", "image/png"),
        "__SEARCH_PNG__": data_uri(ASSETS / "primitive-search-toolbar-tools-2026-09-06.png", "image/png"),
        "__FIXTURE_PNG__": data_uri(FIXTURE.with_suffix(".png"), "image/png"),
        "__TOOL_CHIPS__": chips,
        "__RECIPE__": html.escape(RECIPE.read_text(encoding="utf-8")),
    }
    for token, value in substitutions.items():
        page = page.replace(token, value)
    OUTPUT.write_text(page, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
