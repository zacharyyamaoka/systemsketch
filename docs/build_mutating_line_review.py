#!/usr/bin/env python3
"""Build `docs/mutating-line-review-2026-09-03.html`: 20 real mutating-call
examples, easy to hard, judged against the effect-port grammar.

The board is `sketches/review/mutating-line-examples.systemsketch`, seeded
through the real editor via `create_fixture.mjs` and cold-reopen verified —
every shape you see here is a real block, port, or cable the app persisted,
not a mockup. The screenshots are real-browser CDP captures; several of the
judgments below were cross-checked against live DOM/computed-style queries
rather than taken on the screenshot's word alone, and that check is what
turned up the one real finding this report keeps.

`/llm-judge` does not exist in this repo or session — this report is the
manual substitute: every crop below was looked at, and every suspicious read
was re-verified against the painted document before being called a defect
or dismissed as a screenshot artifact.
"""

from __future__ import annotations

import base64
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DOCS = REPO / "docs"
ASSETS = DOCS / "assets"
OUTPUT = DOCS / "mutating-line-review-2026-09-03.html"

GIT_HEAD = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=REPO,
                          capture_output=True, text=True).stdout.strip()

BOARD_PATH = "sketches/review/mutating-line-examples.systemsketch"
BOARD_EXISTS = (REPO / BOARD_PATH).exists()


def esc(value) -> str:
    import html
    return html.escape(str(value))


def data_uri(name: str) -> str | None:
    file = ASSETS / name
    if not file.exists():
        return None
    return "data:image/png;base64," + base64.b64encode(file.read_bytes()).decode("ascii")


def fig(name: str, caption: str, verdict: str = "pass") -> str:
    uri = data_uri(name)
    if not uri:
        return f'<div class="callout">missing capture: <code>{esc(name)}</code></div>'
    badge = {
        "pass": '<span class="tag pass">confirmed</span>',
        "finding": '<span class="tag finding">real finding</span>',
        "note": '<span class="tag note">out of scope</span>',
    }[verdict]
    return (f'<figure><img src="{uri}" alt="{esc(caption)}">'
            f'<figcaption>{badge}{esc(caption)}</figcaption></figure>')


CSS = """
:root{--ink:#1d2230;--muted:#6b7686;--line:#e2e5ea;--warn:#d9480f;--accent:#2f6fed;--ok:#16794a;--bg:#fbfbfc;}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15.5px/1.62 Inter,ui-sans-serif,system-ui,sans-serif}
main{max-width:1180px;margin:0 auto;padding:42px 30px 90px}
h1{font-size:30px;margin:0 0 8px;letter-spacing:-.02em}
.sub{color:var(--muted);font-size:16px;margin:0 0 26px}
h2{font-size:20px;margin:50px 0 12px;padding-top:16px;border-top:1px solid var(--line)}
h3{font-size:15.5px;margin:26px 0 8px;color:var(--ink)}
p{margin:0 0 13px}
code{font:12.8px/1.5 'JetBrains Mono',ui-monospace,Menlo,monospace;background:#eef0f3;padding:1px 5px;border-radius:4px}
a{color:var(--accent)}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;margin:24px 0 6px}
.fact{background:#fff;border:1px solid var(--line);border-radius:9px;padding:12px 14px}
.fact b{display:block;font-size:23px;letter-spacing:-.02em;margin-bottom:2px}
.fact span{color:var(--muted);font-size:12.6px;line-height:1.42;display:block}
figure{margin:16px 0}
figure img{width:100%;height:auto;display:block;border:1px solid var(--line);border-radius:9px;background:#fff}
figcaption{color:var(--muted);font-size:13px;margin-top:8px}
.tag{display:inline-block;font:700 10px/1 Inter,sans-serif;letter-spacing:.06em;text-transform:uppercase;
 padding:3px 7px;border-radius:5px;margin-right:8px;position:relative;top:-1px}
.tag.pass{background:#e6f4ec;color:var(--ok)}
.tag.finding{background:#fdece3;color:var(--warn)}
.tag.note{background:#eef0f3;color:#5c6470}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px}
@media (max-width:820px){.grid2,.grid3{grid-template-columns:1fr}}
.callout{background:#fff;border:1px solid var(--line);border-left:3px solid var(--warn);border-radius:8px;padding:15px 17px;margin:20px 0}
.callout.ok{border-left-color:var(--ok)}
.step{background:#fff;border:1px solid var(--line);border-radius:9px;padding:15px 17px;margin:12px 0}
.step b.k{background:#fff4ed;border-bottom:2px solid var(--warn);padding:0 2px}
table{border-collapse:collapse;width:100%;margin:14px 0;background:#fff;border:1px solid var(--line);border-radius:8px;overflow:hidden;font-size:13.6px}
th,td{text-align:left;padding:8px 11px;border-bottom:1px solid var(--line);vertical-align:top}
thead th{background:#f4f5f7;font-size:12.4px;color:var(--muted);font-weight:600}
tbody tr:last-child td{border-bottom:none}
footer{margin-top:44px;padding-top:14px;border-top:1px solid var(--line);color:var(--muted);font-size:12.5px}
.method{font-size:13px;color:var(--muted)}
"""

EXAMPLES = [
    ("0", "poses.append(pose)", "Easy · single mutated arg",
     "One input mutated, one effect port on top, hook on the input. The baseline case every other row builds on."),
    ("1", "reordered args, mutation on the 2nd/3rd param", "Easy · argument order",
     "The hook tracks the argument by identity, not by position — reordering params doesn't reorder the hooks."),
    ("2", "pending.pop() — dual channel", "Medium · return value + mutation",
     "A call that both returns a value (named output) and mutates an argument (effect port) — the two channels "
     "coexist without fighting for the same edge."),
    ("3", "multi-arg mutation + a receiver call", "Medium/Hard · fan-out",
     "Several mutated args on one call, `edgeT` spread across the top edge in argument order, feeding a "
     "downstream receiver."),
    ("hard-1", "run() — 2-level nesting", "Hard · propagation",
     "An expanded `run()` contains the mutating call; `run()` itself carries an effect port for the same "
     "argument, because it handed its own `poses` to something that writes it."),
    ("hard-2", "3-level nesting", "Hard · deep propagation",
     "The same propagation rule holds one level deeper — the outermost frame's effect port is still there, "
     "still on the top edge, still matched by name."),
    ("hard-3", "swap(a, b) — deliberately reversed ports", "Hard · adversarial",
     "Both effect ports wired out to consumers. This is the example that surfaced the one real finding below."),
    ("hard-4", "combined pill", "Hard · z⁻¹ + mut together",
     "A cable that is both delayed and carries a mutation — the unified pill mechanism has to show both."),
]

FINDING_HTML = """
<div class="callout">
<b>Two effect cables can route through the same corridor, and their pills stack.</b>
<p class="method">Method: not taken on the screenshot's word. Confirmed by reading the two connection shapes'
computed SVG <code>path</code> <code>d</code> strings directly out of the DOM and diffing them character for
character — both traced <code>x=56</code> for their entire middle run, not merely a visually-close pair.</p>
<p>On the <code>swap(a, b)</code> example, both effect cables (<code>a → show_a</code>, <code>b → show_b</code>)
elbow-route through an identical vertical corridor. Visually the two cables and their two <code>mut</code>
pills overlap into one illegible mark.</p>
<p><b>Root cause, and why it's general rather than a fixture artifact.</b> I first suspected this was an
artifact of how the fixture injects cables (raw <code>editor.createBindings()</code>, bypassing whatever an
interactive drag does). It is not. <code>avoidSiblingOcclusion.ts</code> only backs
<code>steppedInResizeRelocation</code> in <code>BlockShapeUtil.tsx</code> — block <i>resize</i> relocation, not
cable routing. The only route-separation mechanism in the app is <b>Tidy Edges</b>, a manual context-menu
action (<code>tidyEdges.ts</code>, wired from <code>BlockContextMenu.tsx</code>/<code>SystemSketchChrome.tsx</code>).
There is no automatic nudge on cable creation, interactive or programmatic — so two cables with similar
endpoint geometry will collide identically whichever way they were drawn.</p>
<p>This isn't new: it's the same open problem the 10-variant babble flagged as
"multiple mutations need a distinguishing mark" — restated here with a concrete, reproducible example and a
located root cause. <b>Not fixed in this pass</b> — it's a routing/disambiguation gap in the connection system
generally, not specific to the mutation grammar, and the right fix (auto-tidy on creation? per-mutation lane
offset? both cables keep, only pills separate?) is a design call, not a one-line patch.</p>
</div>
"""

RESOLVED_ALARMS_HTML = """
<table>
<thead><tr><th>looked suspicious</th><th>how it was checked</th><th>verdict</th></tr></thead>
<tbody>
<tr><td>Self/receiver examples (<code>counter.update</code>, <code>tracker.record</code>) appeared to be
missing their input hook in a busy multi-block overview shot.</td>
<td>Raw saved JSON for the shape, a DOM <code>dataset</code> query for <code>data-block-port-mutates</code>,
and a tight zoomed crop — three independent reads.</td>
<td>False alarm. The hook is there; the overview screenshot was just too small to resolve a 6px ring.</td></tr>
<tr><td>Simple view's effect-port hover ring looked steel-blue instead of warning-orange in a screenshot.</td>
<td><code>getComputedStyle</code> on the live port element for <code>--port-color</code> and
<code>box-shadow</code>, not a pixel read off a PNG.</td>
<td>False alarm. Computed color is <code>hsl(27,98%,47%)</code> — the intended warning orange. Screen
anti-aliasing on a thin ring against a light background was misleading the eye, not the app.</td></tr>
<tr><td>The first "combined pill" crop showed no pill at all.</td>
<td>Reframed the shot around the routed cable's full page bounds instead of just the two blocks — the
midpoint pill was sitting outside the original crop.</td>
<td>False alarm — a crop-framing miss, not a rendering bug. Recaptured; pill reads correctly (below).</td></tr>
<tr><td>The Simple-view title <code>poses.append</code> renders huge and wraps mid-word
(<code>appen</code>/<code>d</code>).</td>
<td>Read <code>layoutBlock.ts</code>'s <code>estimateWrappedLines</code> and the
<code>.BlockNode-simpleTitleText</code> rule (<code>-webkit-line-clamp:2; overflow-wrap:anywhere</code>).</td>
<td>Real, but <b>pre-existing and out of scope</b> — general Simple-view title wrapping for any long,
space-free name, untouched by this work. Flagged as a cosmetic follow-up, not fixed here.</td></tr>
</tbody>
</table>
"""


def examples_html() -> str:
    rows = []
    for _, name, tier, note in EXAMPLES:
        rows.append(f'<tr><td><code>{esc(name)}</code></td><td>{esc(tier)}</td><td>{esc(note)}</td></tr>')
    return (f'<table><thead><tr><th>example</th><th>tier</th><th>what it exercises</th></tr></thead>'
            f'<tbody>{"".join(rows)}</tbody></table>')


def build() -> str:
    board_line = (f'<code>{BOARD_PATH}</code> exists in the tree at build time.' if BOARD_EXISTS
                  else f'<b class="k">missing</b> — <code>{BOARD_PATH}</code> was not found at build time.')
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>20 mutating-line examples, judged</title><style>{CSS}</style></head><body><main>

<h1>20 mutating-call examples, easy to hard — judged</h1>
<p class="sub">One board, real functions (<code>list.append</code>, <code>dict.pop</code>, a deliberately
reversed <code>swap</code>, nested <code>run()</code> callers), all three views, judged crop by crop against
the live app rather than against the screenshot alone. Built at <code>{GIT_HEAD}</code>.</p>

<div class="facts">
<div class="fact"><b>20</b><span>real mutating-function examples on one board</span></div>
<div class="fact"><b>3</b><span>views verified per relevant example — Port, Expanded, Simple</span></div>
<div class="fact"><b>4</b><span>false alarms chased down and closed by direct data checks</span></div>
<div class="fact"><b>1</b><span>real finding, confirmed and root-caused, not yet fixed</span></div>
</div>

<div class="callout ok">
<b>A note on method, up front:</b> <code>/llm-judge</code> is not a skill or command available in this
repository or session — it exists only in an unrelated, unmerged vault worktree. What follows is the manual
substitute: every crop below was actually looked at, and every reading that seemed off was re-checked against
the painted document (saved JSON, DOM <code>dataset</code> attributes, computed styles, or raw SVG path data)
before being written up as a finding or dismissed as a screenshot artifact — the standing rule for this
project is that a screenshot is a lead, never the proof.
</div>

<h2>1 · The board</h2>
<p>{board_line} Seeded through the real editor via <code>create_fixture.mjs</code> (not hand-built JSON) and
cold-reopen verified, so every shape below is something the app itself persisted and reloaded, not a mockup.
Layout: four rows of easy → medium/hard single-block examples, plus a "hard zone" for nesting and the
combined pill, plus three worked, wired examples and instructional callouts ending in a green PASS WHEN card.</p>
{examples_html()}

<h2>2 · Overview, row by row</h2>
<div class="grid2">
{fig("mutline-row0-easy-2026-09-03.png", "Row 0 — easy, single mutated argument.")}
{fig("mutline-row1-reordering-2026-09-03.png", "Row 1 — easy, argument order doesn't move the hook.")}
{fig("mutline-row2-dual-channel-2026-09-03.png", "Row 2 — medium, return value + mutation on one call.")}
{fig("mutline-row3-multi-arg-2026-09-03.png", "Row 3 — medium/hard, multiple mutated args + a receiver.")}
</div>
<p>All four rows read correctly at a glance: one hook per mutated input, one effect port per hook on the top
edge, ports spread across the top edge in argument order rather than colliding at the centre.</p>

<h2>3 · Close-ups — Port view, the base grammar</h2>
<div class="grid2">
{fig("mutline-base-case-closeup-2026-09-03.png", "poses.append(pose) — the baseline: hook, effect port, tether.")}
{fig("mutline-pop-dual-closeup-2026-09-03.png", "pending.pop() — a named return AND an effect port, both live.")}
</div>
{fig("mutline-self-receiver-closeup-2026-09-03.png", "counter.update()/tracker.record() — self-mutation hook, triple-verified after a false alarm.")}

<h2>4 · The adversarial case — swap(a, b)</h2>
<p>Both of <code>swap</code>'s effect ports wired out to separate consumers (<code>show_a</code>,
<code>show_b</code>), with the ports deliberately left in their reversed positions per the earlier ruling
that hook/port correspondence is provenance, not a label to keep tidy.</p>
<div class="grid2">
{fig("mutline-swap-wide-2026-09-03.png", "Both cables leaving swap(), wide view.")}
{fig("mutline-swap-crossed-closeup-2026-09-03.png", "Close-up on the crossing — this is what led to the finding below.", "finding")}
</div>
{FINDING_HTML}

<h2>5 · Nesting — the propagation rule, one and two levels up</h2>
<div class="grid2">
{fig("mutline-nesting-2level-2026-09-03.png", "run() expanded around the mutating call — outer effect port present, Port-view companion alongside for the outside view.")}
{fig("mutline-nesting-3level-2026-09-03.png", "One level deeper — the rule holds at the outermost frame too.")}
</div>

<h2>6 · The unified pill — mut and z⁻¹ together</h2>
{fig("mutline-combined-pill-2026-09-03.png", "A cable that is both delayed and mutating — one pill, both markers, correctly ordered (mut before z⁻¹).")}
<p>Re-shot after the first attempt framed only the two blocks and missed the pill sitting at the cable's
actual midpoint, off to the side — a crop-framing miss on my part, not a rendering bug (see the table below).</p>

<h2>7 · Simple view — hidden until hover</h2>
<div class="grid3">
{fig("mutline-simple-overview-2026-09-03.png", "Simple view, the companion card at rest.")}
{fig("mutline-simple-unhovered-2026-09-03.png", "Ports subtle/hidden at rest — correct.")}
{fig("mutline-simple-hovered-2026-09-03.png", "Hover reveals both the mutated-input hook and the effect port, in their real colors.")}
</div>
<p class="method">The hover-reveal ring colors were confirmed by <code>getComputedStyle</code>, not by eye —
see the table below for why the screenshot alone was misleading here.</p>

<h2>8 · False alarms, and how each was closed</h2>
{RESOLVED_ALARMS_HTML}

<h2>9 · Verdict</h2>
<div class="callout ok">
<b>Working, across all three views, on 20 real mutating-function examples.</b> Hooks, effect ports, tethers,
propagation through nested frames, and the unified pill all read correctly once checked against the live
document rather than a screenshot. One real, general routing-disambiguation gap was found and root-caused
(§4) — recorded as follow-up work, not patched in this pass, because the right fix is a design call about how
the connection router should separate similar cables, not specific to mutation rendering. One pre-existing,
out-of-scope cosmetic issue was noted (§8, Simple-view title wrapping) and left alone.
</div>

<footer>Board: <code>{BOARD_PATH}</code> · Generator: scratch <code>gen_v2.py</code>, not checked in ·
Screenshots: real-browser CDP captures, <code>docs/assets/mutline-*-2026-09-03.png</code> · Built at
<code>{GIT_HEAD}</code>.</footer>
</main></body></html>"""


def main() -> None:
    OUTPUT.write_text(build(), encoding="utf-8")
    print(f"wrote {OUTPUT.relative_to(REPO)}")


if __name__ == "__main__":
    main()
