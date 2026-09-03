#!/usr/bin/env python3
"""Build the self-contained Definition-linking implementation gallery."""

from __future__ import annotations

import base64
import html
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
OUTPUT = DOCS / "definition-linking-2026-09-02.html"
FIXTURE = ROOT / "sketches" / "review" / "definition-linking.systemsketch"
RECIPE = ROOT / "sketches" / "review" / "definition-linking.recipe.json"


def image_uri(path: Path) -> str:
    return f"data:image/png;base64,{base64.b64encode(path.read_bytes()).decode()}"


def main() -> None:
    board = image_uri(ROOT / "sketches" / "review" / "definition-linking.png")
    smoke = image_uri(DOCS / "definition-linking-live-2026-09-02.png")
    recipe = html.escape(RECIPE.read_text(encoding="utf-8"))
    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch · Definition linking</title>
<style>
:root{{--paper:#f3f5f8;--card:#fff;--ink:#20242b;--muted:#68717d;--line:#dce2e9;--blue:#2f7de8;--blue-soft:#eaf3ff;--green:#23845c;--orange:#ef8a32;--orange-soft:#fff3e8}}
*{{box-sizing:border-box}}body{{margin:0;color:var(--ink);background:radial-gradient(circle at 82% 0,#e6f0ff 0,transparent 35%),var(--paper);font:16px/1.5 Inter,ui-sans-serif,system-ui,sans-serif}}
a{{color:#1e63b7;text-underline-offset:3px}}main{{width:min(1220px,calc(100% - 32px));margin:auto;padding:40px 0 70px}}header,section{{border:1px solid var(--line);border-radius:24px;background:#ffffffed;box-shadow:0 18px 55px #29394d12}}header{{padding:46px;overflow:hidden;position:relative}}header:after{{content:'run()';position:absolute;right:-20px;bottom:-85px;color:#2f7de80b;font:900 190px/1 ui-monospace,monospace}}
.eyebrow{{color:var(--blue);font-size:12px;font-weight:850;letter-spacing:.14em;text-transform:uppercase}}h1{{max-width:850px;margin:10px 0 15px;font-size:clamp(43px,7vw,76px);line-height:.98;letter-spacing:-.055em}}.lead{{max-width:820px;margin:0;color:var(--muted);font-size:19px}}.chips{{display:flex;flex-wrap:wrap;gap:9px;margin-top:24px}}.chip{{padding:7px 11px;border:1px solid #ccdbef;border-radius:999px;background:var(--blue-soft);color:#285f9f;font-size:12px;font-weight:750}}
section{{margin-top:22px;padding:30px}}.head{{display:flex;justify-content:space-between;gap:28px;align-items:end;margin-bottom:20px}}h2{{margin:0;font-size:29px;letter-spacing:-.035em}}.head p{{max-width:670px;margin:0;color:var(--muted)}}
.model{{display:grid;grid-template-columns:repeat(3,1fr);gap:13px}}.model article{{padding:20px;border:1px solid var(--line);border-radius:16px;background:#fafbfd}}.model b{{display:block;color:var(--blue);font-size:12px;letter-spacing:.1em;text-transform:uppercase}}.model strong{{display:block;margin:6px 0;font-size:20px}}.model p{{margin:0;color:var(--muted);font-size:13px}}
.flow{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}}.flow article{{position:relative;padding:18px;border:1px solid var(--line);border-radius:15px;background:#fafbfd}}.flow article:not(:last-child):after{{content:'→';position:absolute;right:-19px;top:41px;z-index:2;color:var(--orange);font-size:25px;font-weight:900}}.flow b{{color:#295d99}}.flow span{{display:block;margin-top:7px;color:var(--muted);font-size:12px}}
.compare{{display:grid;grid-template-columns:1.4fr .6fr;gap:16px;align-items:start}}figure{{margin:0;overflow:hidden;border:1px solid var(--line);border-radius:17px;background:#f8fafc}}img{{display:block;width:100%}}figcaption{{padding:13px 15px;border-top:1px solid var(--line);color:var(--muted);background:#fff;font-size:12px}}figcaption strong{{display:block;color:var(--ink);font-size:14px}}.proof{{display:grid;gap:11px}}.proof div{{padding:17px;border:1px solid #d5e8dd;border-radius:14px;background:#f2faf6}}.proof b{{color:var(--green);font-size:12px}}.proof p{{margin:4px 0 0;color:var(--muted);font-size:12px}}
.draft{{display:inline-flex;padding:2px 9px;border:1px solid #f0b578;border-radius:999px;background:var(--orange-soft);color:#a85612;font-size:12px;font-weight:750}}.buttons{{display:flex;gap:8px;margin-top:14px}}button,.open{{border:0;border-radius:10px;padding:10px 13px;background:var(--blue);color:white;font:700 13px inherit;text-decoration:none;cursor:pointer}}button.secondary{{color:#285f9f;background:var(--blue-soft)}}#demo{{margin-top:14px;padding:16px;border:1px solid var(--line);border-radius:13px;background:#fafbfd;font:13px ui-monospace,monospace}}details{{margin-top:17px;border-radius:14px;overflow:hidden;color:#dbe7f7;background:#20252c}}summary{{padding:15px 18px;cursor:pointer;font-weight:750}}pre{{margin:0;padding:0 18px 20px;max-height:360px;overflow:auto;font:12px/1.5 ui-monospace,monospace}}
footer{{display:flex;justify-content:space-between;gap:20px;padding:24px 5px 0;color:var(--muted);font-size:12px}}@media(max-width:850px){{.model,.flow,.compare{{grid-template-columns:1fr 1fr}}}}@media(max-width:650px){{main{{width:calc(100% - 18px);padding-top:10px}}header,section{{padding:22px;border-radius:17px}}.model,.flow,.compare{{grid-template-columns:1fr}}.flow article:not(:last-child):after{{content:'↓';right:auto;top:auto;bottom:-24px;left:50%}}.head{{display:block}}.head p{{margin-top:8px}}footer{{display:block}}}}
</style></head><body><main>
<header><div class="eyebrow">Implemented · Definition identity</div><h1>Copy fast. Diverge deliberately.</h1><p class="lead">Blocks now keep the zero-command flow: the same Definition identity follows ordinary copy/paste and duplicate. Same-name collisions resolve at the end of a rename—matching content joins; different content stays independent as a numbered Draft.</p><div class="chips"><span class="chip">stable opaque identity</span><span class="chip">Draft 1, Draft 2…</span><span class="chip">expanded body linked</span><span class="chip">compact appearance local</span><span class="chip">explicit unlink</span></div></header>
<section><div class="head"><h2>The working model</h2><p>The title stays human-readable. Identity and the collision-free namespace key are persisted separately, so a visible <code>run()</code> can safely coexist with <code>run_draft_1</code> internally.</p></div><div class="model"><article><b>Linked Definition</b><strong>Semantic content is shared</strong><p>Title, type, description, notes, ports, expanded size/layout, descendants and internal bindings converge across occurrences.</p></article><article><b>Local occurrence</b><strong>Presentation stays hackable</strong><p>Position, outer wires, current view, compact-view size, description visibility and port layout remain local.</p></article><article><b>Collision</b><strong><span class="draft">Draft 1</span></strong><p>No modal and no overwritten body. A different same-name Definition gets the next available draft ordinal and unique export key.</p></article></div></section>
<section><div class="head"><h2>Rename resolution happens once</h2><p>Typing is live, but identity resolution waits for blur or Enter. Temporary half-typed names cannot link unrelated Blocks.</p></div><div class="flow"><article><b>Type a title</b><span>The edited occurrence and its existing linked peers update live.</span></article><article><b>Finish the gesture</b><span>The text field’s commit boundary asks the Definition layer to resolve the name.</span></article><article><b>Compare content</b><span>Same body joins the existing identity; different body allocates Draft N.</span></article><article><b>Keep editing</b><span>Linked edits mirror; Draft edits remain with that draft group.</span></article></div><div class="buttons"><button onclick="demo('same')">Matching content</button><button class="secondary" onclick="demo('different')">Different content</button><button class="secondary" onclick="demo('unlink')">Explicit unlink</button></div><div id="demo">rename decode_copy() → decode() · matching content → linked to definition:decode</div></section>
<section><div class="head"><h2>Ready-to-drive board</h2><p>The fixture is saved through the real editor, cold-reopened, and carries four numbered gestures, bound orange arrows and one green pass condition.</p></div><div class="compare"><figure><img src="{board}" alt="Definition linking review fixture showing two expanded linked run blocks, a Draft 1 collision, and an unlink sandbox"><figcaption><strong>Human review surface</strong>Two expanded occurrences expose the same child; a different <code>run()</code> visibly remains Draft 1.</figcaption></figure><div class="proof"><div><b>6/6 browser checks</b><p>Matching rename, collision draft, stock duplicate link, live content propagation, expanded-child mirroring, Unlink and Duplicate unlinked.</p></div><div><b>16 editable shapes</b><p>The helper verified autosave, cold reopen and bound callout motion.</p></div><div><b>No engine fork</b><p>Identity uses shape props, descendants use shape metadata, and synchronization uses supported editor side effects.</p></div><a class="open" href="../sketches/review/definition-linking.systemsketch">Open the review board</a></div></div><details><summary>See the fixture recipe</summary><pre>{recipe}</pre></details></section>
<section><div class="head"><h2>Real-browser evidence</h2><p>The focused journey edited a linked Definition, changed a nested child, and invoked both context-menu commands against the running app.</p></div><figure><img src="{smoke}" alt="SystemSketch real browser Definition linking test"><figcaption><strong>Captured after the five-check journey</strong>The test reads persisted Definition ids and keys from the live shapes rather than inferring behavior from pixels.</figcaption></figure></section>
<footer><span>SystemSketch · Definition linking · 2 Sep 2026</span><span><a href="build_definition_linking.py">Gallery builder</a> · <a href="../README.md">README</a></span></footer>
</main><script>function demo(kind){{const out=document.getElementById('demo');out.textContent=kind==='same'?'rename decode_copy() → decode() · matching content → linked to definition:decode':kind==='different'?'rename experimental() → decode() · different content → title stays decode(), badge Draft 1, key decode_draft_1':'right-click run() → Duplicate unlinked · new title run_1(), fresh identity, independent body'}}</script></body></html>"""
    OUTPUT.write_text(page, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
