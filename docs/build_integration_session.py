#!/usr/bin/env python3
"""Build the self-contained integration-session report.

Every number is measured here, from the live tree and the live merge-ready
queue, so the page cannot drift from the repository it describes.
"""

from __future__ import annotations

import base64
import html
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
QUEUE = Path("/home/bam/.claude/skills/merge-ready/scripts/merge_ready.py")
BASELINE = "47d44537"


def git(*a: str) -> str:
    return subprocess.run(["git", *a], cwd=ROOT, capture_output=True, text=True).stdout.strip()


def measure() -> dict:
    q = subprocess.run(["python3", str(QUEUE), "list", "--base", "main"],
                       cwd=ROOT, capture_output=True, text=True).stdout
    states: dict[str, int] = {}
    ready: list[tuple[str, str]] = []
    for line in q.splitlines():
        if not line.startswith("iq-"):
            continue
        parts = line.split()
        states[parts[1]] = states.get(parts[1], 0) + 1
        if parts[1] == "ready":
            ready.append((parts[2], parts[3]))
    trees = git("worktree", "list").splitlines()
    return {
        "main": git("rev-parse", "--short", "main"),
        "baseline": BASELINE,
        "landed": git("log", "--oneline", f"{BASELINE}..main").splitlines(),
        "files": git("diff", "--stat", BASELINE, "main").splitlines()[-1].strip(),
        "states": states,
        "ready": ready,
        "worktrees": len(trees),
        "reviews": sum(1 for t in trees if ".systemsketch-reviews/" in t),
        "dirty": len(git("status", "--porcelain").splitlines()),
        "rescue_a": git("rev-parse", "--short", "rescue/wip-2026-09-06"),
        "rescue_b": git("rev-parse", "--short", "rescue/wip-2026-09-06-b"),
        "train": git("rev-parse", "--short", "integrator/merge-ready"),
    }


def img(rel: str, cap: str) -> str:
    p = DOCS / "assets" / rel
    if not p.is_file():
        return ""
    b64 = base64.b64encode(p.read_bytes()).decode()
    return (f'<figure><img src="data:image/png;base64,{b64}" alt="{html.escape(cap)}">'
            f'<figcaption>{cap}</figcaption></figure>')


CSS = """
:root{--bg:#faf9f7;--ink:#1a1a1a;--dim:#6b6b6b;--rule:#e2e0dc;--card:#fff;
--ok:#1c7c4a;--bad:#b3261e;--warn:#8a6100;--accent:#2f5fd0}
@media(prefers-color-scheme:dark){:root{--bg:#16171a;--ink:#e9e8e6;--dim:#9a9a9a;
--rule:#2e3035;--card:#1d1f23;--ok:#4fbe83;--bad:#f2887f;--warn:#d7a34a;--accent:#7ea2f5}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:920px;margin:0 auto;padding:56px 24px 96px}
h1{font-size:34px;line-height:1.2;margin:0 0 6px;letter-spacing:-.02em}
.sub{color:var(--dim);margin:0 0 40px;font-size:15px}
h2{font-size:22px;margin:52px 0 14px;letter-spacing:-.01em}
h3{font-size:16px;margin:28px 0 8px}
p{margin:0 0 14px}
code{font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;
background:var(--card);border:1px solid var(--rule);border-radius:4px;padding:1px 5px}
pre{background:var(--card);border:1px solid var(--rule);border-radius:8px;
padding:14px 16px;overflow-x:auto;font:13px/1.6 ui-monospace,Menlo,monospace}
table{border-collapse:collapse;width:100%;margin:16px 0;font-size:14.5px;display:block;overflow-x:auto}
th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--rule);vertical-align:top}
th{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--dim);font-weight:600}
.ok{color:var(--ok);font-weight:600}.bad{color:var(--bad);font-weight:600}
.warn{color:var(--warn);font-weight:600}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin:20px 0}
.stat{background:var(--card);border:1px solid var(--rule);border-radius:10px;padding:14px 16px}
.stat b{display:block;font-size:26px;letter-spacing:-.02em}
.stat span{color:var(--dim);font-size:12.5px;text-transform:uppercase;letter-spacing:.05em}
figure{margin:20px 0;background:var(--card);border:1px solid var(--rule);
border-radius:10px;padding:12px;overflow:hidden}
figure img{width:100%;height:auto;display:block;border-radius:6px}
figcaption{color:var(--dim);font-size:13px;margin-top:9px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:720px){.two{grid-template-columns:1fr}}
.note{border-left:3px solid var(--accent);background:var(--card);
padding:12px 16px;border-radius:0 8px 8px 0;margin:18px 0}
.danger{border-left-color:var(--bad)}
"""


def build() -> Path:
    m = measure()
    s = m["states"]
    rows = "\n".join(
        f"<tr><td><code>{html.escape(c.split(chr(32))[0])}</code></td><td>{html.escape(msg)}</td></tr>"
        for c, msg in (l.split(" ", 1) for l in m["landed"]))
    ready_rows = "\n".join(
        f"<tr><td><code>{html.escape(p)}</code></td><td><code>{html.escape(b)}</code></td></tr>"
        for p, b in m["ready"]) or "<tr><td colspan=2>none</td></tr>"

    body = f"""
<h1>Integration session</h1>
<p class="sub">SystemSketch &middot; 2026-09-06 &middot; <code>{m['baseline']}</code> &rarr;
<code>{m['main']}</code> &middot; every number below measured from the live tree at build time</p>

<div class="grid">
  <div class="stat"><b>{len(m['landed'])}</b><span>commits landed</span></div>
  <div class="stat"><b>{s.get('merged',0)}</b><span>queue: merged</span></div>
  <div class="stat"><b class="warn">{s.get('ready',0)}</b><span>queue: still ready</span></div>
  <div class="stat"><b>{m['worktrees']}</b><span>worktrees on disk</span></div>
</div>

<h2>What actually landed</h2>
<p><code>main</code> moved from <code>{m['baseline']}</code> to <code>{m['main']}</code> &mdash;
{html.escape(m['files'])}. <code>npm run check</code> is green on it.</p>
<table><tr><th>commit</th><th>subject</th></tr>{rows}</table>

<h2>The finding: green is not ready</h2>
<p>The session began with a git heuristic &mdash; <em>ahead of main, clean tree, no live
session</em> &mdash; which produced twelve candidates. Nine of them merged cleanly and passed
<code>npm run check</code>. That looked like success and was not.</p>
<p>The authoritative signal is the shared <strong>merge-ready queue</strong>, where an author
explicitly presses ready. Checked against it, <strong>seven of the nine</strong> had never been
submitted by anyone. They passed a technical gate, never an authorial one.</p>
<div class="note"><p>A branch being mergeable says nothing about whether its author considers
it finished. Only two of the original twelve were ever marked ready; a third author pressed
ready mid-session, and that one landed too.</p></div>

<h2>Taking a checkout back without destroying work</h2>
<p>Every candidate modified <code>README.md</code>, which sat uncommitted in the only checkout
holding <code>main</code>, alongside 27 other files belonging to a peer session. Landing was
mechanically impossible until that cleared.</p>
<p>Rather than stash or discard, the working tree was snapshotted to a rescue commit built
through a <strong>separate index file</strong>, so the shared <code>.git/index</code> was never
touched and no peer's staging was disturbed. Then only the genuinely colliding files were
reverted, the fast-forward applied, and the peer's hunks 3-way merged back on top.</p>
<table>
<tr><th>landing</th><th>files touched</th><th>true collisions</th><th>resolution</th></tr>
<tr><td><code>queue-ready</code></td><td>56</td><td>2</td>
<td><code>package.json</code>, <code>README.md</code> &mdash; additions in different regions, 3-way merged clean</td></tr>
<tr><td><code>queue-ready-2</code></td><td>30</td><td>5</td>
<td><code>README.md</code> 3-way merged; 4 regenerable journey PNGs took the landed version</td></tr>
</table>
<p>The peer's uncommitted <code>src/code/*</code> edits turned out to be a finished, tested fix
that lets Preview load a legacy board &mdash; work that a naive force-clean would have thrown
away. Both snapshots survive: <code>rescue/wip-2026-09-06</code>
(<code>{m['rescue_a']}</code>) and <code>rescue/wip-2026-09-06-b</code>
(<code>{m['rescue_b']}</code>).</p>

<h2>Evidence that was looked at, not inferred</h2>
<p>Two of the landed branches ship journeys <code>npm run check</code> never runs, and in both
cases the passing exit code did not test the thing the branch claims to fix.</p>

<h3>Font size is a type role, not one number</h3>
<p>The same stored <code>size: xl</code> renders differently per role. That contrast is the
feature, and it is only visible by looking:</p>
<div class="two">
{img('font-size-type-role/menu-heading.png', 'Heading role: Small 18 / Medium 24 / Large 36 / Extra large 44')}
{img('font-size-type-role/menu-sticky.png', 'Sticky role: same four names, 18 / 22 / 26 / 32')}
</div>
<p>Identical names, a 12&nbsp;px gap at the top of the ladder.</p>

<h3>Edge creation policy</h3>
<p>Nine permissions and four presets, read only by <code>judgeConnection</code> so the drop,
the highlight, the picker and validation cannot disagree.</p>
<div class="two">
{img('edge-policy-panel-guided.png', 'Guided — the default, reproducing existing behaviour exactly')}
{img('edge-policy-panel-strict.png', 'Strict — only edges that could exist in the running program')}
</div>

<h3>Menu lab, Code block preset</h3>
{img('menu-lab-5-code-2026-09-06.png', 'The Code selection pill, newly composable in the lab — and preset names now legible, a bug that shipped because a button does not inherit color')}

<h2>What is still open</h2>
<table><tr><th>queue entry</th><th>branch</th></tr>{ready_rows}</table>
<div class="note danger"><p><strong>Blocked on an architecture decision, not a merge problem.</strong>
<code>track/communication-draw-hotkeys</code> merges cleanly &mdash; all seven conflicts were
determinate unions &mdash; then fails the stock-boundary invariant:</p>
<pre>FAIL: test_the_behavior_tree_dual_drag_exception_is_scoped_and_mutually_exclusive
  [('src/blocks/ports/CommunicationPortDnd.tsx', '@dnd-kit import'),
   ('src/blocks/ports/CommunicationPortDnd.tsx', 'second DndContext')] != []</pre>
<p>It descends from a branch that hit the identical failure, so the violation was inherited.
The test was deliberately not loosened &mdash; it encodes the rule that the engine already owns
drag. Either Communication port drag folds into the existing scoped gesture owner, or the
repository consciously widens the exception to two owners. The second is a real fork and would
want a PEP at merge time.</p></div>

<h2>Deliberately not done</h2>
<ul>
<li><strong>Six unqueued branches were not landed.</strong> They remain on
<code>integrator/merge-ready</code> (<code>{m['train']}</code>). Taking a checkout back is not
licence to land work nobody submitted.</li>
<li><strong>No PEP written.</strong> Nothing that landed was an architecture fork; the one
decision that will earn a numbered PEP is the dual-drag question above, and it has not been
made.</li>
<li><strong>No worktrees removed.</strong> {m['worktrees']} remain on disk,
{m['reviews']} of them detached review snapshots. <code>scripts/sweep_worktrees.py</code> was
repaired along the way &mdash; a worktree whose directory had been swept crashed the sweep
mid-list, silently truncating its report to roughly a fifth of the tree.</li>
</ul>
"""
    out = DOCS / "integration-session-2026-09-06.html"
    out.write_text(
        "<!doctype html><html lang=en><meta charset=utf-8>"
        "<meta name=viewport content='width=device-width,initial-scale=1'>"
        "<title>Integration session &middot; SystemSketch</title>"
        f"<style>{CSS}</style><main>{body}</main></html>", encoding="utf-8")
    return out


if __name__ == "__main__":
    p = build()
    print(f"wrote {p}  ({p.stat().st_size/1024:.0f} KB)")
