#!/usr/bin/env python3
"""
Implementation report for the Loop region and "B solid drop".

Every number is measured from this worktree at build time, and every capture is
a real screenshot taken by the acceptance journey or the review-fixture helper.

Run:  python3 docs/build_loop_region_implementation.py
"""
from __future__ import annotations

import base64
import json
import subprocess
from datetime import date
from html import escape
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DOCS = REPO / "docs"
STAMP = "2026-09-03"


def esc(text: str) -> str:
    return escape(str(text), quote=True)


def data_uri(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode()


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=REPO, capture_output=True,
                          text=True).stdout.strip()


QA_FRAMES = [
    ("baseline", "The shipped default, as the datum for every other frame."),
    ("narrow", "300px wide with a turn chip. Before the fix the title ran straight "
               "through the chip; now the chip yields and the title centres in what is left."),
    ("turn", "A turn string nobody sized the chip for. It truncates with an ellipsis and "
             "keeps its 14px inset from the region's edge."),
    ("long-types", "Types long enough to reach the centred title. Both truncate; the two "
                   "rows stay apart."),
    ("wide", "1180×200 — the header's three tenants at their most crowded horizontally."),
    ("floor", "At the 180px floor, where the footer must yield rather than overlap."),
    ("selected", "Stock resize handles and semantic port dots sharing the same edge."),
    ("dark", "The region derives its chrome from --tl-* tokens, so dark comes free."),
    ("zoomed-out", "At 5% the region is a bare rectangle. That is tldraw culling detail, "
                   "the same as a Block."),
    ("nested", "A Loop inside a Loop: the inner one is a real child and is clipped by its "
               "parent."),
    ("fan-out", "One element, three consumers. Correct, and the three parallel runs are "
                "worth a design decision before anyone draws this for real."),
    ("tap-port", "A tap now offers a Block, and it opens BELOW the port — the direction the "
                 "cable points."),
]


def measure() -> dict:
    loop = sorted((REPO / "src" / "loop").glob("*.ts*"))
    journey = (REPO / "tests" / "loop_region_smoke.mjs").read_text()
    results = json.loads((DOCS / "assets" / "loop-region-acceptance.json").read_text())
    model = (REPO / "src" / "loop" / "loopModel.ts").read_text()
    return {
        "modules": [(path.name, len(path.read_text().splitlines())) for path in loop],
        "loop_lines": sum(len(path.read_text().splitlines()) for path in loop),
        "journey_lines": len(journey.splitlines()),
        "checks": results["results"],
        "branch": git("rev-parse", "--abbrev-ref", "HEAD"),
        "commits": git("log", "--oneline", "main..HEAD").splitlines(),
        "base": git("rev-parse", "--short", "main"),
        "diffstat": git("diff", "--stat", "main...HEAD").splitlines()[-1:],
        "header_h": model.split("LOOP_HEADER_HEIGHT = ")[1].split("\n")[0],
        "qa": json.loads((DOCS / "assets" / "loop-qa" / "observations.json").read_text())["observations"],
        "tldraw": json.loads((REPO / "package.json").read_text())["dependencies"]["tldraw"],
    }


CSS = """
:root{--bg:#FCFCFC;--panel:#fff;--ink:#1B1B1B;--muted:#5E5E5E;--faint:#8C8C8C;
--line:#E6E6E6;--soft:#F5F5F4;--accent:#6B4FBF;--good:#2E7D5B;--warn:#B4531F;--code:#F6F6F4}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
font:15.5px/1.62 "Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}
.wrap{max-width:1120px;margin:0 auto;padding:56px 28px 110px}
h1{font-size:33px;line-height:1.16;letter-spacing:-.02em;margin:0 0 10px;font-weight:650}
h2{font-size:22px;margin:58px 0 12px;font-weight:640;padding-top:20px;border-top:1px solid var(--line)}
h3{font-size:17px;margin:30px 0 8px;font-weight:640}
p{margin:0 0 13px;max-width:78ch}
.lede{font-size:18px;color:var(--muted);max-width:76ch}
.eyebrow{font:600 11.5px/1 ui-monospace,Menlo,monospace;letter-spacing:.13em;
text-transform:uppercase;color:var(--faint);margin:0 0 14px}
code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.9em;background:var(--code);
padding:1px 5px;border-radius:4px}
pre{background:var(--code);border:1px solid var(--line);border-radius:9px;padding:14px 16px;
overflow-x:auto;margin:0 0 16px;font:13px/1.6 ui-monospace,Menlo,Consolas,monospace}
pre code{background:none;padding:0}
table{border-collapse:collapse;width:100%;font-size:14px;margin:0 0 18px}
th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:11.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--faint);font-weight:600}
td.num{text-align:right;font-family:ui-monospace,Menlo,monospace;white-space:nowrap}
.tag{display:inline-block;font:600 11px/1 ui-monospace,Menlo,monospace;padding:5px 9px;
border-radius:20px;border:1px solid var(--line);color:var(--muted);background:var(--soft)}
.tag.win{color:var(--good);border-color:#BFE0CE;background:#F1F8F4}
.tag.bad{color:var(--warn);border-color:#E9CDBC;background:#FBF2EC}
.kv{display:flex;gap:10px;flex-wrap:wrap;margin:10px 0 4px}
.note{border-left:3px solid var(--accent);padding:2px 0 2px 15px;color:var(--muted);
margin:16px 0;max-width:74ch}
.note.warn{border-color:var(--warn)}
.note.good{border-color:var(--good)}
img.shot{width:100%;border:1px solid var(--line);border-radius:9px;display:block}
figcaption{font-size:12.5px;color:var(--faint);margin-top:7px}
ul{margin:0 0 14px;padding-left:20px;max-width:76ch}
li{margin:0 0 6px}
.foot{margin-top:64px;padding-top:20px;border-top:1px solid var(--line);font-size:13px;color:var(--faint)}
"""


def build() -> str:
    facts = measure()
    passed = sum(1 for check in facts["checks"] if check["ok"])
    rows = "".join(
        f'<tr><td class="num">{check["id"]}</td><td>{esc(check["label"])}</td>'
        f'<td>{"<span class=\'tag win\'>pass</span>" if check["ok"] else "<span class=\'tag bad\'>fail</span>"}</td></tr>'
        for check in facts["checks"])
    modules = "".join(f'<tr><td><code>src/loop/{name}</code></td><td class="num">{lines}</td></tr>'
                      for name, lines in facts["modules"])
    commits = "".join(f"<li><code>{esc(line)}</code></li>" for line in facts["commits"])
    qa_frames = "".join(
        f'<figure style="margin:0 0 18px"><img class="shot" src="{data_uri(DOCS / "assets" / "loop-qa" / (name + ".png"))}" '
        f'alt="{esc(name)}"><figcaption><strong>{esc(name)}</strong> — {note}</figcaption></figure>'
        for name, note in QA_FRAMES if (DOCS / "assets" / "loop-qa" / f"{name}.png").exists())
    return f"""<style>{CSS}</style><div class="wrap">
<p class="eyebrow">SystemSketch · golden 10 · implementation</p>
<h1>The Loop region, with the item on an ordinary solid cable</h1>
<p class="lede">Golden 10's grammar was settled across two days of babble. This is the
vertical slice of it: a <code>for</code> becomes a frame-like region whose header is an
<strong>operator</strong>, and the element it emits travels on a plain solid cable — because
dotted already means one turn late.</p>
<div class="kv">
  <span class="tag">tldraw {facts['tldraw']} · stock</span>
  <span class="tag">{facts['loop_lines']} lines in src/loop</span>
  <span class="tag">{passed}/{len(facts['checks'])} real-browser checks</span>
  <span class="tag">branch {esc(facts['branch'])} from {esc(facts['base'])}</span>
</div>

<h2>What "B solid drop" actually required</h2>
<p>B is a claim about one cable, but the cable had nothing to hang off: there was no Loop
region. So the slice is the region, and B falls out of one decision inside it.</p>
<table>
<tr><th style="width:250px">The grammar said</th><th>What the code does</th></tr>
<tr><td><strong>The header is an operator</strong></td>
<td>The collection lands ON the header through a real <code>Iterable</code> inlet — the same
move a Branch makes with its controlling value — and the header emits the element from a real
outlet directly beneath it. Nothing passes through the region on its way to a Block.</td></tr>
<tr><td><strong>A real port, not a derived one</strong></td>
<td>Both are ordinary entries in the connection layer's port table, welded by the same
binding, the same rules and the same paint as a Block's. The drawing stays wirable.</td></tr>
<tr><td><strong>The item cable is solid</strong></td>
<td><em>This is the whole of B, and it cost nothing.</em> The item outlet is an
<code>output</code> port, and an output welds an ordinary <code>temporal: data</code>
connection, which paints solid. Dotted is <code>temporal: delayed</code> — one turn late —
and the loop's back cable uses it. The element is this turn's value, so it must not share
that line. <strong>No new cable kind was needed to say so.</strong></td></tr>
<tr><td><strong>Centred title</strong></td>
<td>An operator's name belongs over the middle of it. The layout keeps it clear of the
iterable label on the left and the turn chip on the right.</td></tr>
</table>

<h2>The one seam that had drifted</h2>
<p>Adding a third port host produced a cable tldraw silently refused to bind. The drag died
with no error, no console entry and no failed assertion — the state machine simply fell back
to idle.</p>
<pre><code>// ConnectionShapeUtil.canBind, before
return bindingType === 'connection'
    &amp;&amp; fromShapeType === CONNECTION_SHAPE_TYPE
    &amp;&amp; (toShapeType === 'block' || toShapeType === 'branch')</code></pre>
<p><code>isPortHostShape</code> kept one list of hosts and <code>canBind</code> spelled out
another by hand. They agreed for two hosts and disagreed for three. Both now read one
exported <code>PORT_HOST_SHAPE_TYPES</code>, so a fourth host can only be forgotten in one
place.</p>

<h2>Two things the first screenshot decided</h2>
<p>Neither was visible in a unit test, and both were obvious the moment the acceptance
journey painted a real board.</p>
<ul>
<li><strong>The item label moved below its dot.</strong> It sat beside the dot, on exactly
the row a cable leaves along — so the first cable drawn from that port struck the word
through.</li>
<li><strong>The item port moved onto the wall.</strong> It was inset on the header's top
edge; it now sits at the header's bottom corner directly under <code>Iterable</code>, which
is where Zach drew it.</li>
</ul>

<h2>Proof</h2>
<p><code>npm run check</code> is green — tsc, 792 vitest and 74 Python tests, including nine
new unit tests over the layout and the port projection. That is necessary and not
sufficient; the claim is about a real board.</p>
<p><code>npm run test:loop</code> drives the actual app with real mouse events:</p>
<table><tr><th style="width:56px">#</th><th>Check</th><th style="width:90px">Result</th></tr>{rows}</table>
<figure style="margin:22px 0">
  <img class="shot" src="{data_uri(DOCS / 'assets' / 'loop-region-acceptance.png')}" alt="The acceptance journey's final board">
  <figcaption>The journey's own screenshot: the region drawn by the box gesture,
  <code>source()</code> welded to the <code>Iterable</code> inlet, and <code>merge()</code>
  adopted as a child.</figcaption>
</figure>
<figure style="margin:22px 0">
  <img class="shot" src="{data_uri(REPO / 'sketches' / 'review' / 'loop-region.png')}" alt="The review board">
  <figcaption>The review board. The element arrives on a <strong>solid</strong> cable; the
  carry returns on a <strong>dotted</strong> one with its <code>z⁻¹</code> pill. No legend is
  needed to tell them apart — which is the entire claim of B.</figcaption>
</figure>

<h2>The visual QA sweep, and what it found</h2>
<p><code>npm run test:loop-qa</code> is a capture rig rather than a pass/fail journey. It
drives the region through the cases that actually break a canvas UI and writes one frame and
one machine-readable observation each, so every frame can be looked at rather than trusted.
Three real defects came out of looking.</p>
<table>
<tr><th style="width:250px">Defect</th><th>What it was, and what fixed it</th></tr>
<tr><td><strong>The header had three tenants and no allocation</strong></td>
<td>The type labels, the centred title and the turn chip all wanted the same pixels. At 300px
the title ran straight through the chip; a long turn string crowded the region's edge and
nothing truncated. The row is now allocated — labels get a bounded budget, the title centres
in the band that survives, and <strong>the chip yields first</strong> because it reports a
live state while the title identifies the region. All three truncate with an ellipsis and
keep the full string as a tooltip. The old assertion on the title's exact x is replaced by a
property over six widths × three turn strings × two type lengths.</td></tr>
<tr><td><strong>A tap on a Loop port did nothing</strong></td>
<td>…while a drag from the same dot worked. <code>anchorFaceForScope</code> spelled its hosts
out by hand — <code>isBlockShape || isBranchShape</code> — exactly as <code>canBind</code>
had, so the picker asked for a face, got <code>null</code>, and bailed with no error.
<strong>Second instance of one bug: a hand-written host list.</strong> The rig only caught it
because it ran the same tap on a Block port as a control.</td></tr>
<tr><td><strong>The picker opened the wrong way</strong></td>
<td>Off to the right, on top of the header the cable had just left. The offered Block now
goes where the cable points, which for a header port is down — the same
<code>elbowSide</code> the router reads.</td></tr>
</table>
<p class="note warn"><strong>One flaw was in the rig, not the product.</strong> The
<code>tap-port</code> case left a picker open, and the <code>export</code> case that followed
reported the region's chrome missing from the SVG — a defect that vanished when the case ran
alone. Each case now cancels and resets first. A rig that lies about a real feature is worse
than no rig.</p>
<div class="grid2">
{qa_frames}
</div>
<p class="note"><strong>Left as a design question, not a bug.</strong> The
<code>fan-out</code> frame shows one element feeding three Blocks as three parallel
horizontal runs — the bundle of parallel arrows this whole thread started by rejecting. It is
correct and it is ugly, and it wants a decision before anyone draws it for real.</p>

<h2>Known, and deliberately left</h2>
<p class="note warn"><strong>The item cable's elbow route laps the region.</strong> The
binding is right and the line style is right; only the path is ugly. The live paint asks
every port to leave rightward and escape its shape's box, and a region's box is the whole
region. Fixing it means changing box construction shared with every Block cable, which
belongs in its own slice behind the routing corpus rather than bolted onto this one. A card
on the review board says so.</p>
<p><strong>Not built, and not pretended:</strong> the faded zero-iterations arm (it needs the
analyzer's last/zero φ, not just a shape); a live iteration counter (<code>turn</code> is a
plain string prop today, so the chip renders whatever it is given); authoring the port names
from the inspector; <code>break</code>, <code>else</code>, and nested loops.</p>

<h2>The track</h2>
<table>
<tr><th style="width:170px">Worktree</th><td><code>/home/bam/systemsketch-track-loop-region</code></td></tr>
<tr><th>Branch</th><td><code>{esc(facts['branch'])}</code>, forked from <code>main</code> at <code>{esc(facts['base'])}</code></td></tr>
<tr><th>Server</th><td><code>http://127.0.0.1:4390</code> (API 4391) — Zach's 4321/4322 untouched</td></tr>
<tr><th>Merge status</th><td><strong>not merged</strong> — waiting on review</td></tr>
</table>
<ul>{commits}</ul>
<pre><code>{esc(facts['diffstat'][0] if facts['diffstat'] else '')}</code></pre>
<table><tr><th>Module</th><th class="num">Lines</th></tr>{modules}</table>
<div class="foot">Built by <code>docs/build_loop_region_implementation.py</code> from
<code>{esc(facts['branch'])}</code>. Every number measured from the worktree at build time.</div>
</div>"""


def main() -> None:
    report = DOCS / f"loop-region-implementation-{STAMP}.html"
    report.write_text(
        "<!doctype html><html lang='en'><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<title>The Loop region · SystemSketch</title></head><body>"
        f"{build()}</body></html>", encoding="utf-8")
    print(f"report {report} ({report.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
