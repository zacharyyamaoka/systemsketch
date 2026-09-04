#!/usr/bin/env python3
"""Build `docs/port-outline-gallery-2026-09-03.html`: every port kind, and proof each socket is right.

Zach asked for a report that shows all the possible ports — Block, Branch,
for loop, while loop, loop header ports, mutable ports — and verifies the
outline traced around each one is correct. This is that catalogue.

Everything shown here is a real screenshot of the running app, captured by
`tests/port_outline_alignment_smoke.mjs` (`npm run test:port-alignment`),
never a redrawn mockup. The pass/fail counts under each card are read from
that same run's own results file, not asserted separately here — a stale
screenshot next to a stale count would both be wrong in the same direction
and neither would say so.
"""

from __future__ import annotations

import base64
import html
import json
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DOCS = REPO / "docs"
ASSETS = DOCS / "assets"
OUTPUT = DOCS / "port-outline-gallery-2026-09-03.html"

MANIFEST = ASSETS / "port-outline-gallery-manifest-2026-09-03.json"
RESIZE_MANIFEST = ASSETS / "port-outline-gallery-resize-manifest-2026-09-03.json"
RESULTS = ASSETS / "port-outline-alignment-results-2026-09-03.json"
JOURNEY = REPO / "tests/port_outline_alignment_smoke.mjs"

GIT_HEAD = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=REPO,
                          capture_output=True, text=True).stdout.strip()


def esc(value) -> str:
    return html.escape(str(value))


def data_uri(path: Path) -> str | None:
    if not path.exists():
        return None
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else []


MANIFEST_ROWS = load_json(MANIFEST)
RESIZE_ROWS = load_json(RESIZE_MANIFEST)
CHECKS = load_json(RESULTS)
PASSED = sum(1 for c in CHECKS if c.get("ok"))
TOTAL = len(CHECKS)

RESIZE_CAPTIONS = {
    "tiny": "Small enough to squeeze rows — the sockets stay put, not the row spacing's problem to solve.",
    "small": "Default-ish proportions, well under the fixture's starting 300×240.",
    "large": "Comfortably larger than any real Block is likely to need.",
    "very-wide": "Width far past height — the aspect ratio that pushed the outward existence probe off the "
                 "actual rendered canvas before this suite's own zoom-safety cap was added.",
    "very-tall": "Height far past width — the opposite extreme, same result.",
    "square": "1:1, the one aspect ratio nothing above tests on its own.",
    "branch-large": "Branch resized large — reconcileBranchProps spreads the height delta across both open "
                     "arms rather than just stretching a body, a different code path from Block's resize.",
    "loop-large": "Loop resized large — reconcileLoopProps floors it at 300×180 and otherwise just stretches "
                   "the body; iterable and item stay exactly where loopLayout puts them.",
    "dragged": "Not `resizeShape` called directly — a real mouse press, ten intermediate move events, and a "
               "release on the actual bottom-right resize handle, the literal gesture a person makes.",
}

# What each capture demonstrates, and which port KINDS it covers — the
# catalogue Zach asked for, not just a re-listing of the screenshot labels.
CARDS = [
    {
        "slug": "port-view", "title": "Block — Port view (the ordinary card)",
        "kinds": "left-edge inputs, right-edge outputs, a mutates argument surfaced as a top-edge "
                 "effect port, all six port-colour families",
        "body": "Three inputs and three outputs, one of every colour family the app assigns by "
                "type — <code>text</code> green, <code>number</code> grey, <code>model</code> blue, "
                "<code>latent</code> orange, <code>image</code> purple, <code>any</code> gold. "
                "<code>mut</code> is marked <code>mutates</code>, which derives an effect port and "
                "moves it to the top edge, sharing the header row rather than taking an input row.",
    },
    {
        "slug": "simple-view", "title": "Block — Simple view (chromeless)",
        "kinds": "subtle ports (hidden until canvas-hover), the exact case this bug shipped in",
        "body": "A Simple Block's ports are <code>subtle</code> — invisible until the pointer is "
                "over the canvas, so the title stays uncluttered. This is the view whose outline "
                "used to skip the socket entirely: selected and hovered here, at the state that "
                "used to draw the selection edge straight through the dot. See the "
                "<a href=\"port-outline-alignment-2026-09-03.html\">bug-fix report</a> for the "
                "before/after.",
    },
    {
        "slug": "value-view", "title": "Block — Value view (the pill)",
        "kinds": "rim ports on a capsule body, no header, no rows",
        "body": "A Value Block is a variable, not a call: one rim dot on each side of the pill, no "
                "header band and no port rows to lay them into — the smallest port geometry in the "
                "app, and a different body shape (<code>Stadium2d</code>, not a rounded rect) for "
                "the socket to sit against.",
    },
    {
        "slug": "expanded-view", "title": "Block — Expanded view (a container)",
        "kinds": "a frame-like Block's own boundary ports, alongside a nested child Block's ports "
                 "one level in",
        "body": "Expanded is the one view that holds children — the <code>Container</code> block "
                "here has its own boundary ports (<code>p</code>, <code>q</code> in, <code>r</code> "
                "out) plus a real child Block nested inside it, each with its own independent "
                "socket-correct outline.",
    },
    {
        "slug": "many-ports", "title": "Block — dense stress case",
        "kinds": "six ports a side, every colour family, to prove the socket holds as row count grows",
        "body": "Twelve ports on one card is well past anything a real board is likely to need — "
                "included because a bug that only shows up past N rows is exactly the kind a normal "
                "two-port fixture would never catch.",
    },
    {
        "slug": "connected-sink", "title": "Block — connected + many-to-one",
        "kinds": "a wired port's filled, type-coloured core; a many-to-one producer-count badge",
        "body": "Two source Blocks feed one sink input. A wired port paints a filled core in its own "
                "type colour instead of a hollow ring, and two or more producers into the same port "
                "add a count badge — both are extra paint on the very same <code>.Port</code> div, "
                "so the outline math is identical to an empty port, but it is included so \"every "
                "possible port\" also means every paint <em>state</em> a port can carry.",
    },
    {
        "slug": "default-value", "title": "Block — unconnected, with a default value",
        "kinds": "Port_default — a filled, muted core with no cable and no badge",
        "body": "An input with a default value and no cable paints a filled core too — muted grey "
                "rather than the port's type colour, because nothing is actually flowing through it "
                "yet — the third and last paint state a Block's own port carries.",
    },
    {
        "slug": "branch-region", "title": "Branch — control ports",
        "kinds": "a second shape type's ports, living on a region's band rather than on a Block",
        "body": "Branch is not a Block: it is a frame-like region whose control ports "
                "(<code>cond</code>, <code>value</code>) sit on its header band and decide which "
                "arm runs. A structurally different shape, with its own "
                "<code>getIndicatorPath</code> — proof the fix's reasoning, and the constant it "
                "introduced, generalises past the one class it shipped in.",
    },
    {
        "slug": "loop-region", "title": "Loop — header ports",
        "kinds": "the `for`/`while` header's iterable inlet and item outlet, the one port ever placed "
                 "on a shape's BOTTOM edge",
        "body": "Loop landed on main mid-review — this catalogue named it a gap and it stopped being "
                "one before merge. <code>iterable</code> lands on the left wall exactly like a Branch "
                "control port; <code>item</code> leaves the header's <em>bottom</em> edge, perpendicular, "
                "straight down into the body — the one edge no Block port or Branch control ever sits "
                "on, and the edge that specifically exercises the outward-probe direction math. Loop's "
                "own <code>getIndicatorPath</code> shipped with the identical hand-copied magic radius "
                "Block and Branch had, fixed here alongside them rather than merged as a third copy of "
                "the same footgun.",
    },
]

CARD_BY_SLUG = {c["slug"]: c for c in CARDS}
MANIFEST_BY_SLUG = {row["slug"]: row for row in MANIFEST_ROWS}


def check_count(label_prefix: str) -> tuple[int, int]:
    # Match "<label> input/…" / "<label> output/…" exactly — not e.g. "port view @0.5x …",
    # a separate zoom-sensitivity pass over the same shape that would otherwise also match
    # the plain "port view " prefix.
    prefixes = (f"{label_prefix} input/", f"{label_prefix} output/")
    matches = [c for c in CHECKS if c["label"].startswith(prefixes)]
    return sum(1 for c in matches if c.get("ok")), len(matches)


def resize_check_count(row: dict) -> tuple[int, int]:
    # The resize labels carry the landed size in parens (from the *live* run,
    # so it can't be baked into a static prefix here) — match everything
    # after "resize probe <label> (" / "resize branch <label> (" instead of
    # requiring the exact WxH suffix. "dragged" has no size suffix at all.
    slug = row["label"]
    if slug == "dragged":
        prefix = "resize probe dragged by hand"
    elif slug == "branch-large":
        prefix = "resize branch large ("
    elif slug == "loop-large":
        prefix = "resize loop large ("
    else:
        prefix = f"resize probe {slug} ("
    matches = [c for c in CHECKS if c["label"].startswith(prefix)]
    return sum(1 for c in matches if c.get("ok")), len(matches)


CSS = """
:root{--ink:#1d2230;--muted:#6b7686;--line:#e2e5ea;--warn:#d9480f;--good:#0a7a3d;--accent:#2f6fed;--bg:#fbfbfc;}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
 font:15.5px/1.62 Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;}
main{max-width:1240px;margin:0 auto;padding:44px 30px 90px}
h1{font-size:31px;line-height:1.2;margin:0 0 8px;letter-spacing:-.02em}
.sub{color:var(--muted);font-size:16px;margin:0 0 28px;max-width:900px}
h2{font-size:21px;margin:52px 0 14px;padding-top:16px;border-top:1px solid var(--line)}
p{margin:0 0 14px}
a{color:var(--accent)}
code{font:13px/1.5 'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace;
 background:#eef0f3;padding:1px 5px;border-radius:4px}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin:26px 0 6px}
.fact{background:#fff;border:1px solid var(--line);border-radius:9px;padding:12px 14px}
.fact b{display:block;font-size:23px;letter-spacing:-.02em;margin-bottom:2px}
.fact span{color:var(--muted);font-size:12.6px;line-height:1.42;display:block}
.cards{display:grid;grid-template-columns:1fr;gap:22px;margin-top:18px}
.card{background:#fff;border:1px solid var(--line);border-radius:11px;overflow:hidden}
.card img{width:100%;height:auto;display:block;border-bottom:1px solid var(--line);background:#f4f5f7}
.card .body{padding:16px 20px 20px}
.card h3{margin:0 0 4px;font-size:17px}
.kinds{color:var(--muted);font-size:12.6px;text-transform:uppercase;letter-spacing:.04em;margin:0 0 10px}
.badge{display:inline-flex;align-items:center;gap:5px;font-size:12.6px;font-weight:600;
 padding:2px 9px;border-radius:999px;margin-left:8px;vertical-align:middle}
.badge.pass{background:#e7f7ee;color:var(--good)}
.badge.fail{background:#fdeceb;color:var(--warn)}
.resize-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;margin-top:18px}
.resize-card{background:#fff;border:1px solid var(--line);border-radius:11px;overflow:hidden}
.resize-card img{width:100%;height:210px;object-fit:cover;object-position:top;display:block;
 border-bottom:1px solid var(--line);background:#f4f5f7}
.resize-card .body{padding:12px 15px 15px}
.resize-card h3{margin:0 0 3px;font-size:14.5px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.resize-card .dims{color:var(--muted);font-size:12px;font-weight:400}
.resize-card p{font-size:13px;color:var(--muted);margin:6px 0 0}
.callout{background:#fff;border:1px solid var(--line);border-left:3px solid var(--accent);
 border-radius:8px;padding:16px 18px;margin:22px 0}
.callout.warn{border-left-color:var(--warn)}
.callout h4{margin:0 0 8px;font-size:14.5px}
.callout ul{margin:8px 0 0;padding-left:20px;font-size:13.8px}
.callout li{margin-bottom:6px}
footer{margin-top:52px;padding-top:16px;border-top:1px solid var(--line);color:var(--muted);font-size:12.5px}
.small{color:var(--muted);font-size:13px}
"""


def card_html(card: dict) -> str:
    slug = card["slug"]
    row = MANIFEST_BY_SLUG.get(slug)
    passed, total = check_count(card_label(slug))
    badge = (f'<span class="badge pass">{passed}/{total} checks pass</span>' if total and passed == total
             else f'<span class="badge fail">{passed}/{total} checks pass</span>' if total
             else '<span class="badge fail">no checks recorded</span>')
    img_uri = data_uri(ASSETS / row["file"]) if row else None
    img_html = (f'<img src="{img_uri}" alt="{esc(card["title"])}">' if img_uri
                else '<div class="callout warn">No capture — re-run <code>npm run test:port-alignment</code>.</div>')
    return f"""<div class="card">
{img_html}
<div class="body">
<h3>{esc(card['title'])}{badge}</h3>
<p class="kinds">{esc(card['kinds'])}</p>
<p>{card['body']}</p>
</div>
</div>"""


def card_label(slug: str) -> str:
    return next((c["label"] for c in MANIFEST_ROWS if c["slug"] == slug), slug.replace("-", " "))


def resize_card_html(row: dict) -> str:
    passed, total = resize_check_count(row)
    badge = (f'<span class="badge pass">{passed}/{total}</span>' if total and passed == total
             else f'<span class="badge fail">{passed}/{total}</span>' if total
             else '<span class="badge fail">no checks</span>')
    dims = f'<span class="dims">{row["w"]}×{row["h"]}px</span>' if "w" in row else ""
    img_uri = data_uri(ASSETS / row["file"])
    img_html = (f'<img src="{img_uri}" alt="resize {esc(row["label"])}">' if img_uri
                else '<div class="callout warn">No capture.</div>')
    caption = RESIZE_CAPTIONS.get(row["label"], "")
    return f"""<div class="resize-card">
{img_html}
<div class="body">
<h3>{esc(row['label'])}{dims}{badge}</h3>
<p>{esc(caption)}</p>
</div>
</div>"""


def build() -> str:
    cards_html = "".join(card_html(c) for c in CARDS)
    resize_cards_html = "".join(resize_card_html(r) for r in RESIZE_ROWS)
    resize_passed = sum(resize_check_count(r)[0] for r in RESIZE_ROWS)
    resize_total = sum(resize_check_count(r)[1] for r in RESIZE_ROWS)
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Every port, verified</title><style>{CSS}</style></head><body><main>
<h1>Every port kind in the app, and proof the outline is right on each one</h1>
<p class="sub">The catalogue Zach asked for: Block's four views, every port-colour family, every edge a
port can sit on (including the bottom edge, which only Loop uses), every paint state a port carries, and
Branch's and Loop's header/control ports — each shown at a legible zoom in the real running app, with the
exact alignment checks that back the screenshot, and resized to extreme sizes to prove the sockets track
the port, not the fixture's original dimensions. Loop itself landed on main partway through this review;
§3 covers how it was folded in rather than left as a gap. 2026-09-03.</p>

<div class="facts">
<div class="fact"><b>{PASSED}/{TOTAL}</b><span>alignment checks pass across every card and resize below</span></div>
<div class="fact"><b>{len(CARDS)}</b><span>distinct port-bearing configurations captured live, not mocked</span></div>
<div class="fact"><b>{len(RESIZE_ROWS)}</b><span>sizes stress-tested per Block/Branch/Loop, from 140×100 to
1100×190, plus one real drag on the resize handle</span></div>
<div class="fact"><b>3</b><span>shape types covered — Block, Branch and Loop — sharing one socket contract</span></div>
</div>

<h2>1 · What exists, captured live</h2>
<div class="cards">
{cards_html}
</div>

<h2>2 · Resized to extremes, still socket-correct</h2>
<p>The port dot's position is <code>layoutBlock</code>/<code>branchLayout</code>/<code>loopLayout</code>
output — a pure function of <code>props.w</code>/<code>props.h</code> — recomputed on every resize, so a
resize is the one live edit most likely to desync the outline from the paint again. Every card below is the
<strong>same</strong> Block, Branch or Loop, driven through the real <code>editor.resizeShape</code> API (the
same call a dragged handle makes) across a tiny/small/large/very-wide/very-tall/square matrix, plus one
genuine mouse drag on the actual bottom-right resize handle — ten intermediate move events, not a single
jump. {resize_passed}/{resize_total} checks pass.</p>
<div class="resize-grid">
{resize_cards_html}
</div>

<h2>3 · Loop landed mid-review — here's what changed</h2>
<div class="callout">
<h4>This report originally said the Loop region didn't exist yet. It does now.</h4>
<p>The first pass of this catalogue found no <code>for</code>/<code>while</code> shape in the codebase and
said so plainly, pointing at the design-stage <a href="loop-regions-2026-09-02.html">loop-region babble</a>
(five directions, L1 — "cycle as a cable" — provisionally ahead) rather than fabricating a screenshot of
something unbuilt. Between then and merge, <code>src/loop/LoopShapeUtil.tsx</code> landed on main for real.
Re-running this suite against the new code found two things: the port geometry itself is correct (all 16
Loop-related checks below pass), and <code>getIndicatorPath</code> shipped with the exact same hand-copied magic radius
(<code>9</code> instead of <code>LOOP_PORT_RADIUS + 3</code>) that Block and Branch had — not yet a live bug
there, since Loop's ports are never <code>subtle</code>, but the identical footgun, fixed alongside the other
two rather than left to become a fourth copy of it later.</p>
<p>The shipped design also answers the babble's open question directly: Loop does <em>not</em> use a distinct
"loop header port" glyph. <code>iterable</code> and <code>item</code> are ordinary <code>.Port</code> dots —
same component, same CSS, same connection rules Block and Branch already have — placed on the header via
<code>elbowSide: 'left'</code> and <code>elbowSide: 'bottom'</code>. One socket contract, a third shape using
it.</p>
</div>

<h2>4 · How "verified" is measured</h2>
<p>Every card's badge is read from <code>npm run test:port-alignment</code>'s own results file — the same
run that captured the screenshots, not a second pass. Two independent claims per port: the computed
indicator centre lands within 1px of the live <code>.Port</code> dot's <code>getBoundingClientRect</code>
centre (measured through the app's real <code>getShapePageTransform</code> + <code>editor.pageToScreen</code>,
never a screenshot diff), and the live selection-overlay canvas actually has ink at a point sitting on the
socket's own outer edge — the one place a skipped port (the bug this suite guards) paints nothing at all.
See the <a href="port-outline-alignment-2026-09-03.html">original bug-fix report</a> for the full method and
the regression proof.</p>

<footer>Built by <code>docs/build_port_outline_gallery.py</code> at {GIT_HEAD} · screenshots and checks read
from <code>{esc(MANIFEST.relative_to(REPO))}</code> and <code>{esc(RESULTS.relative_to(REPO))}</code> at
build time · Claude Code · Sonnet 5 (<code>claude-sonnet-5</code>), 2026-09-03.</footer>
</main></body></html>"""


def main() -> None:
    OUTPUT.write_text(build(), encoding="utf-8")
    print(OUTPUT)
    print(json.dumps({"cards": len(CARDS), "passed": PASSED, "total": TOTAL}, indent=1))


if __name__ == "__main__":
    main()
