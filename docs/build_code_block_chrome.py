"""Build the standalone Code-block chrome gallery from live-browser proof."""
from __future__ import annotations

import base64
import html
import json
from pathlib import Path


DOCS = Path(__file__).resolve().parent
ASSETS = DOCS / "assets"
RESULTS = DOCS / "code-block-primitive-results-2026-09-05.json"
IMAGES = {
    "Language": ASSETS / "code-block-primitive-language-menu-2026-09-05.png",
    "Text size": ASSETS / "code-block-primitive-text-size-menu-2026-09-05.png",
    "Character width": ASSETS / "code-block-primitive-live-2026-09-05.png",
    "Dark mode": ASSETS / "code-block-primitive-dark-menu-2026-09-05.png",
}
OUTPUT = DOCS / "code-block-chrome-2026-09-05.html"


def image_uri(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def main() -> None:
    proof = json.loads(RESULTS.read_text(encoding="utf-8"))
    checks = proof["checks"]
    if not checks or not all(check["ok"] for check in checks):
        raise SystemExit("cannot publish Chrome gallery without a passing browser journey")
    missing = [str(path) for path in IMAGES.values() if not path.exists()]
    if missing:
        raise SystemExit(f"missing capture(s): {', '.join(missing)}")

    evidence = "".join(
        f"<li><code>{html.escape(check['id'])}</code><span>{html.escape(check['detail'])}</span></li>"
        for check in checks
    )
    captures = "".join(
        f'''<figure><img alt="Real SystemSketch Code {html.escape(label)} control"
src="{image_uri(path)}"><figcaption>{html.escape(label)}</figcaption></figure>'''
        for label, path in IMAGES.items()
    )
    source = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Code block chrome · SystemSketch</title>
<style>
:root {{ color-scheme:light; font-family:Inter,ui-sans-serif,system-ui,sans-serif; color:#172033; background:#f2f5fa; }}
* {{ box-sizing:border-box }} body {{ margin:0 }} main {{ max-width:1320px; margin:auto; padding:52px 28px 76px }}
.eyebrow {{ color:#2563d9; font-size:12px; font-weight:800; letter-spacing:.1em; text-transform:uppercase }}
h1 {{ max-width:920px; margin:9px 0 16px; font-size:clamp(40px,6.2vw,72px); line-height:.93; letter-spacing:-.06em }}
h2 {{ margin:46px 0 15px; font-size:28px; letter-spacing:-.03em }} p {{ line-height:1.58 }}
.lede {{ max-width:820px; color:#536174; font-size:18px }}
.principles {{ display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin:30px 0 }}
.principle {{ min-height:142px; padding:19px; border:1px solid #dbe3ef; border-radius:15px; background:#fff; box-shadow:0 9px 26px #182a4110 }}
.principle b {{ display:block; margin-bottom:8px; font-size:20px }}
.ribbon {{ display:flex; gap:0; width:max-content; max-width:100%; margin:30px 0 38px; overflow:hidden; border:1px solid #313943; border-radius:12px; background:#202327; color:#f7f9fc; box-shadow:0 9px 24px #17203324 }}
.ribbon span {{ display:flex; align-items:center; gap:7px; min-height:40px; padding:0 14px; border-right:1px solid #444c57; font-size:12px; font-weight:700; white-space:nowrap }} .ribbon span:last-child {{ border:0 }}
.gallery {{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:20px }} figure {{ margin:0; overflow:hidden; border:1px solid #dbe3ef; border-radius:16px; background:#fff; box-shadow:0 10px 28px #182a4112 }} figure img {{ display:block; width:100%; background:#fff }} figcaption {{ padding:12px 15px; color:#536174; font-size:14px; font-weight:700 }}
.note {{ max-width:930px; padding:18px 20px; border-left:4px solid #2563d9; border-radius:9px; background:#eaf0ff; line-height:1.55 }}
ul {{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; padding:0; list-style:none }} li {{ display:flex; gap:10px; padding:13px; border:1px solid #dbe3ef; border-radius:11px; background:#fff; line-height:1.42 }} code {{ color:#2563d9; font:800 .88em ui-monospace,SFMono-Regular,monospace; white-space:nowrap }}
.links a {{ margin-right:18px }} footer {{ margin-top:44px; color:#66758a; font-size:14px }}
@media(max-width:780px) {{ main {{ padding:30px 16px 56px }} .principles,.gallery,ul {{ grid-template-columns:1fr }} .ribbon {{ width:100%; flex-wrap:wrap }} .ribbon span {{ border-bottom:1px solid #444c57 }} }}
</style></head><body><main>
<div class="eyebrow">SystemSketch · Code block refinement · 5 September 2026</div>
<h1>One serious ribbon, not a browser control taped to a canvas.</h1>
<p class="lede">The Code block’s selected-object chrome now uses the same 40px inverse surface, portal behavior, focus treatment, typography scale, and semantic theme tokens as the rest of SystemSketch. The three Code-specific decisions remain independent modules, ready to compose into the incoming generic menu surface.</p>
<div class="ribbon" aria-label="Code contextual controls"><span>⌘&lt;/&gt; Language</span><span>Ｔ Text size</span><span>☷ Line numbers</span><span>⌁ Character width</span></div>
<section class="principles"><div class="principle"><b>Language is a real menu</b>Accessible radio choices replace the browser-native select, with a selected check and a proper close transaction.</div><div class="principle"><b>Type follows product scale</b>Font sizes use the same compact list grammar as SystemSketch’s text controls rather than tiny − / + buttons.</div><div class="principle"><b>Width earns a focused panel</b>Named measures, a custom <code>ch</code> field, and free stock resizing all describe the same persisted character width.</div></section>
<h2>Real product captures</h2><div class="gallery">{captures}</div>
<h2>Composition boundary</h2><div class="note"><strong>Why these controls are separate.</strong> Language, line numbers, and character width are meaningful only to Code; the surrounding selection pill is generic. <code>CodeContextualControls.tsx</code> keeps a small ordered recipe of those modules, so the other in-flight contextual-menu work can host them without duplicating labels, mutations, menu state, or icon treatment.</div>
<h2>Browser acceptance</h2><ul>{evidence}</ul>
<p class="links"><a href="../sketches/review/code-block-chrome.systemsketch">Open the guided review board</a><a href="code-block-primitive-implementation-2026-09-05.html">Original Code primitive gallery</a><a href="../tests/code_block_primitive_smoke.mjs">Open the real-browser journey</a><a href="build_code_block_chrome.py">Open this gallery builder</a><a href="../README.md">Project README</a></p>
<footer>Generated from the passing <code>npm run test:code-block</code> result. All four captures are embedded for a portable review.</footer>
</main></body></html>"""
    OUTPUT.write_text(source, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
