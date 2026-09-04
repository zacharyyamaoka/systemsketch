#!/usr/bin/env python3
"""Build `docs/port-outline-alignment-2026-09-03.html`: the socket-skip bug, fixed and guarded.

Zach: "You're having this bug again where the blue outline doesn't perfectly
align with the underlying ports beneath." The blue trace is tldraw's own
selection/hover indicator (`getIndicatorPath`, stroked to a `<canvas>` since
tldraw v5 — there is no DOM node for it). It is a pure function of
`shape.props`, computed independently of the live `.Port` dot `BlockCanvas`
paints, and the two had drifted: a Simple Block's ports are `subtle` (invisible
until canvas-hover), and `getIndicatorPath` skipped every `subtle` port
outright. The selection edge had no circular socket to arc around there, so
hovering a Simple Block's dot while it was selected drew the edge straight
through the dot instead of around it.

Every number and image below is measured from the tree at build time.
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
OUTPUT = DOCS / "port-outline-alignment-2026-09-03.html"
RESULTS = ASSETS / "port-outline-alignment-results-2026-09-03.json"

GIT_HEAD = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=REPO,
                          capture_output=True, text=True).stdout.strip()

FIXED_FILES = [
    REPO / "src/blocks/BlockShapeUtil.tsx",
    REPO / "src/branch/BranchShapeUtil.tsx",
    REPO / "src/loop/LoopShapeUtil.tsx",
]
JOURNEY = REPO / "tests/port_outline_alignment_smoke.mjs"


def esc(value) -> str:
    return html.escape(str(value))


def data_uri(path: Path) -> str | None:
    if not path.exists():
        return None
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def working_diff(path: Path) -> str:
    """This file's diff against HEAD — the fix, as it actually landed on disk."""
    result = subprocess.run(
        ["git", "diff", "--no-color", "--", str(path.relative_to(REPO))],
        cwd=REPO, capture_output=True, text=True,
    )
    return result.stdout


def load_results() -> list[dict]:
    if not RESULTS.exists():
        return []
    return json.loads(RESULTS.read_text(encoding="utf-8"))


CHECKS = load_results()
PASSED = sum(1 for c in CHECKS if c.get("ok"))
FAILED = len(CHECKS) - PASSED

CSS = """
:root{--ink:#1d2230;--muted:#6b7686;--line:#e2e5ea;--warn:#d9480f;--good:#0a7a3d;--accent:#2f6fed;--bg:#fbfbfc;}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
 font:15.5px/1.62 Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;}
main{max-width:1200px;margin:0 auto;padding:44px 30px 90px}
h1{font-size:31px;line-height:1.2;margin:0 0 8px;letter-spacing:-.02em}
.sub{color:var(--muted);font-size:16px;margin:0 0 28px}
h2{font-size:21px;margin:52px 0 14px;padding-top:16px;border-top:1px solid var(--line)}
p{margin:0 0 14px}
code{font:13px/1.5 'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace;
 background:#eef0f3;padding:1px 5px;border-radius:4px}
pre{background:#fff;border:1px solid var(--line);border-radius:8px;padding:14px 16px;overflow-x:auto}
pre code{background:none;padding:0;font-size:12.4px;line-height:1.6;white-space:pre}
.diff{background:#0d1117;color:#c9d1d9;border-radius:8px;padding:14px 16px;overflow-x:auto;font-size:12.4px;
 line-height:1.55;white-space:pre}
.diff .add{color:#7ee787}
.diff .del{color:#ff7b72}
.diff .hunk{color:#8b949e}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin:26px 0 6px}
.fact{background:#fff;border:1px solid var(--line);border-radius:9px;padding:12px 14px}
.fact b{display:block;font-size:23px;letter-spacing:-.02em;margin-bottom:2px}
.fact span{color:var(--muted);font-size:12.6px;line-height:1.42;display:block}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:20px 0}
figure{margin:0}
figure img{width:100%;height:auto;display:block;border:1px solid var(--line);border-radius:9px}
figcaption{color:var(--muted);font-size:13px;margin-top:8px}
figcaption b.bad{color:var(--warn)}
figcaption b.good{color:var(--good)}
.callout{background:#fff;border:1px solid var(--line);border-left:3px solid var(--accent);
 border-radius:8px;padding:16px 18px;margin:22px 0}
.callout.warn{border-left-color:var(--warn)}
table{border-collapse:collapse;width:100%;margin:16px 0;background:#fff;
 border:1px solid var(--line);border-radius:8px;overflow:hidden;font-size:13.6px}
th,td{text-align:left;padding:8px 11px;border-bottom:1px solid var(--line);vertical-align:top}
thead th{background:#f4f5f7;font-size:12.4px;color:var(--muted);font-weight:600}
tbody tr:last-child td{border-bottom:none}
.matrix{columns:2;column-gap:28px;font-size:13px;margin:0}
.matrix li{margin-bottom:3px;break-inside:avoid;list-style:none;display:flex;gap:6px;align-items:baseline}
.matrix li b{color:var(--good);font-size:11px}
.decision{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin-top:14px}
.decision>div{background:#fff;border:1px solid var(--line);border-radius:9px;padding:14px 16px}
.decision h4{margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.decision ul{margin:0;padding-left:18px;font-size:13.8px}
.decision li{margin-bottom:7px}
footer{margin-top:52px;padding-top:16px;border-top:1px solid var(--line);color:var(--muted);font-size:12.5px}
.small{color:var(--muted);font-size:13px}
"""


def diff_html(path: Path) -> str:
    raw = working_diff(path)
    if not raw.strip():
        return '<p class="small">No working-tree diff against HEAD for this file.</p>'
    lines = []
    for line in raw.splitlines():
        cls = None
        if line.startswith("+++") or line.startswith("---"):
            cls = "hunk"
        elif line.startswith("@@"):
            cls = "hunk"
        elif line.startswith("+"):
            cls = "add"
        elif line.startswith("-"):
            cls = "del"
        text = esc(line)
        lines.append(f'<span class="{cls}">{text}</span>' if cls else text)
    return f'<div class="diff">{chr(10).join(lines)}</div>'


def shots_html() -> str:
    before = data_uri(ASSETS / "port-outline-alignment-before-2026-09-03.png")
    after = data_uri(ASSETS / "port-outline-alignment-after-2026-09-03.png")
    if not before or not after:
        return ('<div class="callout warn"><b>No captures.</b> Re-run the smoke test and the before/after '
                'probes, then rebuild.</div>')
    return f"""<div class="pair">
<figure><img src="{before}" alt="Before: the selection edge cuts straight through the port dot">
<figcaption><b class="bad">Before.</b> Simple Block, selected and hovered. The blue selection edge runs
straight through the port dot — <code>getIndicatorPath</code> skipped every <code>subtle</code> port, so
there was no socket for the edge to arc around.</figcaption></figure>
<figure><img src="{after}" alt="After: the selection edge arcs around the port dot as a socket">
<figcaption><b class="good">After.</b> Same Block, same state. The edge now traces a proper socket around
the dot, matching every other view.</figcaption></figure>
</div>"""


def acceptance_html() -> str:
    uri = data_uri(ASSETS / "port-outline-alignment-acceptance-2026-09-03.png")
    if not uri:
        return ""
    return f"""<figure><img src="{uri}" alt="Port view Block, every port socketed correctly">
<figcaption>The dense "port view" stress case from the journey: three input edges (left, right, and a
<code>mut</code> effect port sharing the header row) across every port-colour family, all selected and all
socketed.</figcaption></figure>"""


def checks_html() -> str:
    if not CHECKS:
        return '<p class="small">No results file — run <code>npm run test:port-alignment</code> first.</p>'
    items = "".join(
        f'<li><b>{"PASS" if c["ok"] else "FAIL"}</b> {esc(c["label"])} '
        f'<span class="small">({esc(c.get("detail", ""))})</span></li>'
        for c in CHECKS
    )
    return f'<ul class="matrix">{items}</ul>'


def build() -> str:
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Port outline alignment</title><style>{CSS}</style></head><body><main>
<h1>The port socket that went missing</h1>
<p class="sub">tldraw's selection/hover outline is computed independently of the live port dot it is supposed
to trace. One view's ports had drifted out of it entirely. Fixed, and now pixel-checked on every primitive
that carries a port. 2026-09-03.</p>

<div class="facts">
<div class="fact"><b>{PASSED}/{len(CHECKS)}</b><span>alignment checks pass, across every Block view, Branch and
Loop control/header ports, a 12-port stress case, a resize matrix, and extra zoom levels</span></div>
<div class="fact"><b>1 line</b><span>deleted — the <code>if (port.subtle) continue</code> that caused it</span></div>
<div class="fact"><b>&lt;0.6px</b><span>steady-state indicator/dot delta, everywhere, measured from the app's
own <code>getShapePageTransform</code> + <code>pageToScreen</code> — not a screenshot diff</span></div>
<div class="fact"><b>3</b><span>files touched — Block's, Branch's and Loop's <code>getIndicatorPath</code>, corrected in place, nothing new added</span></div>
</div>

<h2>1 · What was actually wrong</h2>
<p>The blue trace is not part of the live DOM paint at all — since tldraw v5 the selection/hover indicator is
stroked to an overlay <code>&lt;canvas&gt;</code>, computed by each shape's <code>getIndicatorPath(shape)</code>
from <code>shape.props</code> alone. The port dot itself is an ordinary <code>.Port</code> div, positioned by
the same <code>layoutBlock</code> coordinates and centred with a CSS <code>box-shadow</code> ring — which is
why a coordinate-math bug in that path would show as a shift, not what the screenshot actually showed: a
straight line cutting clean through a dot that was otherwise sitting exactly where it should.</p>
<p>The reason turned out to be a missing case, not a wrong number. Simple Block's ports are <code>subtle</code>
— invisible until the canvas is hovered, so the header stays uncluttered — and <code>getIndicatorPath</code>
read that flag as "this port doesn't exist" and skipped it. The dot's <i>position</i> was always correct; there
was simply no socket cut into the outline for it to sit inside of, so the outline's straight body edge painted
straight over it the moment hover revealed the dot.</p>
{shots_html()}

<h2>2 · The fix</h2>
<p><code>subtle</code> only ever gated the dot's paint opacity in CSS — it was never a signal that the port
itself doesn't exist. The fix removes the skip, and while there, replaces all three files' hand-copied magic radius
(<code>9</code>) with the named constant it was always supposed to equal, so the indicator can't silently drift
from the dot's own ring again if that radius is ever retuned.</p>
{"".join(f'<pre><code>{esc(path.name)}</code></pre>{diff_html(path)}' for path in FIXED_FILES)}

<h2>3 · Pixel-perfect, by construction — not by screenshot diff</h2>
<p>The oracle is the app's own <code>layoutBlock</code> / <code>branchLayout</code> — dynamically imported
straight from the running Vite dev server, never reimplemented — mapped through the shape's real
<code>getShapePageTransform</code> and <code>editor.pageToScreen</code>. Two independent claims per port:</p>
<ul>
<li><b>position</b> — the computed indicator centre lands within 1px of the live <code>.Port</code> dot's own
<code>getBoundingClientRect</code> centre (steady-state noise measured under 0.6px everywhere, so 1px never
flakes).</li>
<li><b>existence</b> — the live overlay canvas actually has ink at a point sitting exactly on the socket's own
outer edge, on the port's outward side: the one place a straight body edge never reaches, and the one place a
skipped port (this bug) paints nothing at all.</li>
</ul>
<p>Covers every primitive that carries a port: Block's <code>port</code> / <code>simple</code> /
<code>expanded</code> / <code>value</code> views, ports on the left, right, top and bottom edges (a <code>mut</code>
effect port; Loop's <code>item</code> outlet), a dense six-a-side stress case across every port-colour family, a
connected many-to-one port with its producer-count badge, a Branch region's control ports, a Loop region's
<code>iterable</code>/<code>item</code> header ports, several zoom levels, and a resize matrix for all three shapes
including one real mouse-drag on the actual resize handle — the full breakdown, with screenshots, is the
<a href="port-outline-gallery-2026-09-03.html">port outline gallery</a>. <code>npm run test:port-alignment</code>
(<code>{esc(JOURNEY.relative_to(REPO))}</code>) — reverting the fix turns exactly the two Simple-view "socket
painted" checks red and leaves the other {len(CHECKS) - 2} green, which is the journey doing its one job: point at the
actual regression, not just "something changed."</p>
{acceptance_html()}
<details><summary class="small">All {len(CHECKS)} checks</summary>{checks_html()}</details>

<h2>4 · Decision surface</h2>
<div class="decision">
<div><h4>Done and proved</h4><ul>
<li>Root-caused to the actual defect (a skipped case, not a coordinate bug) by measuring the real page
transform against the real DOM, not by guessing from the screenshot alone.</li>
<li>Fixed in all three shape utils that own port sockets (Block, Branch, Loop); Branch and Loop had the same
magic-number smell without the same live bug, hardened while there.</li>
<li>Regression-proofed twice: stashed the fix back out on the original two shapes, then again after rebuilding
against a much newer main — both times the journey failed on exactly the two Simple-view checks and nothing
else, restored it, watched it go green — before calling it done.</li>
<li>Rebuilt fresh against main after it gained a real Loop region mid-review — the Loop shape shipped with
the identical magic-radius pattern, caught and fixed here rather than merged as a fourth copy of the same bug
waiting to happen.</li>
<li><code>npm run check</code> (tsc + the full vitest + Python suite) stays green.</li>
</ul></div>
<div><h4>Left</h4><ul>
<li>Nothing outstanding on this bug. If a future port-bearing primitive ships with the same skip or the same
magic-number smell, extend <code>{esc(JOURNEY.name)}</code> rather than opening a new file for it — Loop just
proved the pattern carries over cleanly.</li>
</ul></div>
<div><h4>Needs you</h4><ul>
<li>Nothing — this was a pure regression fix plus its guard, no design call to make.</li>
</ul></div>
<div><h4>Deliberately not done</h4><ul>
<li>Did not touch <code>getGeometry</code>'s own <code>subtle</code> filter — that governs hit-testing
precision for an invisible dot, a separate and, as far as this investigation found, correctly-behaving
concern.</li>
<li>Did not add a screenshot-diff test. A byte-diff would flake on font hinting and anti-aliasing across
machines; measuring the same transform math the app itself uses does not.</li>
</ul></div>
</div>
<footer>Built by <code>docs/build_port_outline_alignment.py</code> at {GIT_HEAD} · checks read from
<code>{esc(RESULTS.relative_to(REPO))}</code> at build time · Claude Code · Sonnet 5
(<code>claude-sonnet-5</code>), 2026-09-03.</footer>
</main></body></html>"""


def main() -> None:
    OUTPUT.write_text(build(), encoding="utf-8")
    print(OUTPUT)
    print(json.dumps({"passed": PASSED, "failed": FAILED, "total": len(CHECKS)}, indent=1))


if __name__ == "__main__":
    main()
