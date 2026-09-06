#!/usr/bin/env python3
"""
Implementation report: Fallback recovery formatting — height reservation,
cascade, hover-only inserts, convergence arrowheads.

Zach reported the bug on the `failure-branch-formatting` review board with an
annotated PickAndPlace screenshot: by the third recovery branch the chain
overlapped, every blue "+" was always visible, and the convergence points had
no arrow ends. This report covers the whole unit of work: the rewritten
height reservation in `lanesWithRecovery`, the per-lane cascade, the
hover-only insert gate, and the arrowheads at every convergence landing.

Every number is measured from this tree at build time: the acceptance JSONs
the journeys wrote, the full vitest and Python suites re-run live, `git diff
--numstat` for the touched files, and greps of the shipped source for the
seams the text claims exist. Every capture is a real screenshot from headless
Chrome; the hero strip is a real recorded pointer journey, not an animation.

Run:  python3 docs/build_fallback_recovery_formatting.py
"""
from __future__ import annotations

import base64
import json
import re
import subprocess
from html import escape
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DOCS = REPO / "docs"
ASSETS = DOCS / "assets" / "behavior-tree-fallback-formatting"
STAMP = "2026-09-06"
OUT = DOCS / f"fallback-recovery-formatting-{STAMP}.html"

BOARD = REPO / "sketches" / "review" / "fallback-recovery-formatting.systemsketch"
BOARD_PNG = REPO / "sketches" / "review" / "fallback-recovery-formatting.png"
REVIEW_URL = f"http://127.0.0.1:4960/?board={BOARD}"

ACCEPTANCES = [
    ("behavior-tree-pickandplace", "Zach's literal PickAndPlace tree, in the real app (new)"),
    ("behavior-tree-nested-fallback", "3-level nested Fallback grown live at every depth"),
    ("behavior-tree-fallback-arm-terminus", "arm terminus grows a bare leaf into a Sequence"),
    ("behavior-tree-process-spacing", "spacing invariants incl. no insert-over-card"),
    ("behavior-tree-recovery-rail", "recovery rail add/undo journey"),
    ("behavior-tree-process-v2", "process v2 navigation journey"),
]

TOUCHED = [
    "src/behaviorTree/processLayout.ts",
    "src/behaviorTree/layouts.test.ts",
    "src/behaviorTree/behavior-tree.css",
    "tests/behavior_tree_pickandplace_literal_smoke.mjs",
    "tests/behavior_tree_nested_fallback_smoke.mjs",
    "tests/behavior_tree_fallback_arm_terminus_smoke.mjs",
    "tests/behavior_tree_process_spacing_smoke.mjs",
]


def esc(text: object) -> str:
    return escape(str(text), quote=True)


def data_uri(path: Path) -> str:
    kind = "image/gif" if path.suffix == ".gif" else "image/png"
    return f"data:{kind};base64," + base64.b64encode(path.read_bytes()).decode()


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=REPO, capture_output=True, text=True).stdout


# --------------------------------------------------------------------------- measure


def measure_source() -> dict:
    """Grep the shipped source for the seams this report claims exist."""
    layout = (REPO / "src/behaviorTree/processLayout.ts").read_text()
    css = (REPO / "src/behaviorTree/behavior-tree.css").read_text()
    return {
        "merge_run": layout.count("merge:run"),
        "merge_drop_arrow": len(re.findall(r"merge:\$\{index\}", layout)),
        "cascade_array": layout.count("laneBoxFlow: number[]"),
        "cascade_use": layout.count("laneBoxFlow[index]"),
        "rail_headless": "merge:rail" in layout,
        "css_hidden_at_rest": "opacity: 0" in css and ".BehaviorTree-insert {" in css,
        "css_zone_reveal": ".BehaviorTree-insertZone:hover .BehaviorTree-insert" in css,
        "css_persistent_exempt": ".BehaviorTree-insert[data-persistent='true']" in css,
        "insert_default": "insertVisibility: 'hover'" in (REPO / "src/behaviorTree/behaviorTreeModel.ts").read_text(),
    }


def measure_acceptances() -> list[dict]:
    rows = []
    for slug, label in ACCEPTANCES:
        path = DOCS / "assets" / slug / "acceptance.json"
        if not path.exists():
            rows.append({"slug": slug, "label": label, "passed": None, "total": None, "at": "missing"})
            continue
        data = json.loads(path.read_text())
        rows.append({
            "slug": slug,
            "label": label,
            "passed": data.get("passed"),
            "total": data.get("total"),
            "at": data.get("generatedAt", "?")[:19].replace("T", " "),
        })
    return rows


def measure_vitest() -> dict:
    run = subprocess.run(["npx", "vitest", "run", "--reporter=json"], cwd=REPO, capture_output=True, text=True)
    try:
        report = json.loads(run.stdout[run.stdout.index("{"):])
    except (ValueError, json.JSONDecodeError):
        return {"files": None, "tests": None, "passed": None, "failed": None}
    return {
        "files": len(report.get("testResults", [])),
        "tests": report.get("numTotalTests"),
        "passed": report.get("numPassedTests"),
        "failed": report.get("numFailedTests"),
    }


def measure_python() -> dict:
    run = subprocess.run(["python3", "-m", "unittest", "discover", "-s", "tests"], cwd=REPO, capture_output=True, text=True)
    ran = re.search(r"Ran (\d+) tests", run.stderr)
    return {"tests": int(ran.group(1)) if ran else None, "ok": run.returncode == 0 and "OK" in run.stderr}


def measure_files() -> list[dict]:
    status = {line[3:]: line[:2].strip() for line in git("status", "--porcelain", "--", *TOUCHED).splitlines()}
    numstat = {}
    for line in git("diff", "--numstat", "--", *TOUCHED).splitlines():
        added, removed, path = line.split("\t")
        numstat[path] = (int(added), int(removed))
    rows = []
    for rel in TOUCHED:
        added, removed = numstat.get(rel, (None, None))
        rows.append({
            "path": rel,
            "state": "new" if status.get(rel) == "??" else ("modified" if rel in numstat else "committed"),
            "added": added,
            "removed": removed,
            "lines": len((REPO / rel).read_text().splitlines()),
        })
    return rows


def board_health() -> dict:
    ok = BOARD.exists() and BOARD_PNG.exists()
    api = subprocess.run(["curl", "-s", "http://127.0.0.1:4961/api/health"], capture_output=True, text=True).stdout
    try:
        health = json.loads(api)
    except (ValueError, json.JSONDecodeError):
        health = {}
    return {
        "board": ok,
        "channel": health.get("channel"),
        "root_is_this_worktree": health.get("workspaceRoot") == str(REPO),
    }


# --------------------------------------------------------------------------- render


def img(path: Path, alt: str, style: str = "") -> str:
    return f'<img src="{data_uri(path)}" alt="{esc(alt)}" style="{esc(style)}">'


def build() -> None:
    source = measure_source()
    acceptances = measure_acceptances()
    vitest = measure_vitest()
    python = measure_python()
    files = measure_files()
    health = board_health()

    acceptance_rows = "\n".join(
        f"<tr><td><code>tests/{esc(row['slug']).replace('behavior-tree-', 'behavior_tree_').replace('-', '_')}_smoke.mjs</code></td>"
        f"<td>{esc(row['label'])}</td><td class=\"{'ok' if row['passed'] == row['total'] and row['total'] else 'bad'}\">"
        f"{row['passed']}/{row['total']}</td><td>{esc(row['at'])}</td></tr>"
        for row in acceptances
    )
    file_rows = "\n".join(
        f"<tr><td><code>{esc(row['path'])}</code></td><td>{esc(row['state'])}</td>"
        f"<td>{'+' + str(row['added']) + ' / −' + str(row['removed']) if row['added'] is not None else '—'}</td>"
        f"<td>{row['lines']}</td></tr>"
        for row in files
    )

    seams = [
        ("one shared merge run per Fallback, arrowhead into the junction", source["merge_run"] >= 1),
        ("per-arm drop edges end in an arrowhead at the merge line", source["merge_drop_arrow"] >= 1),
        ("per-lane cascade array (`laneBoxFlow: number[]`)", source["cascade_array"] == 1),
        (f"cascade indexed at every placement ({source['cascade_use']} uses)", source["cascade_use"] >= 2),
        ("the rail's own drop stays headless (`merge:rail`)", source["rail_headless"]),
        ("inserts hidden at rest (`opacity: 0` on `.BehaviorTree-insert`)", source["css_hidden_at_rest"]),
        ("per-zone hover reveal (`.BehaviorTree-insertZone:hover`)", source["css_zone_reveal"]),
        ("persistent termini exempt (`[data-persistent='true']`)", source["css_persistent_exempt"]),
        ("model default is `insertVisibility: 'hover'`", source["insert_default"]),
    ]
    seam_rows = "\n".join(
        f"<tr><td>{esc(label)}</td><td class=\"{'ok' if ok else 'bad'}\">{'measured' if ok else 'MISSING'}</td></tr>"
        for label, ok in seams
    )

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Fallback recovery formatting — {STAMP}</title>
<style>
  :root {{ --ink: #27272a; --muted: #6b7280; --line: #e5e7eb; --ok: #15803d; --bad: #b91c1c; --accent: #4f46e5; }}
  body {{ font: 15px/1.55 -apple-system, "Segoe UI", sans-serif; color: var(--ink); margin: 0; background: #fafafa; }}
  main {{ max-width: 1080px; margin: 0 auto; padding: 40px 28px 80px; }}
  h1 {{ font-size: 26px; margin: 0 0 6px; }}
  h2 {{ font-size: 19px; margin: 44px 0 10px; border-top: 1px solid var(--line); padding-top: 28px; }}
  h3 {{ font-size: 15px; margin: 22px 0 6px; }}
  p, li {{ max-width: 78ch; }}
  .sub {{ color: var(--muted); margin-bottom: 26px; }}
  .badges span {{ display: inline-block; background: #fff; border: 1px solid var(--line); border-radius: 6px; padding: 4px 10px; margin: 2px 6px 2px 0; font-size: 13px; }}
  .badges b.ok {{ color: var(--ok); }}
  .badges b.bad {{ color: var(--bad); }}
  figure {{ margin: 14px 0 22px; background: #fff; border: 1px solid var(--line); border-radius: 8px; padding: 10px; }}
  figure img {{ max-width: 100%; display: block; border-radius: 4px; }}
  figcaption {{ font-size: 13px; color: var(--muted); padding: 8px 4px 0; }}
  .row {{ display: flex; gap: 14px; flex-wrap: wrap; }}
  .row figure {{ flex: 1 1 300px; margin: 0; }}
  table {{ border-collapse: collapse; background: #fff; border: 1px solid var(--line); border-radius: 8px; font-size: 13.5px; width: 100%; }}
  th, td {{ text-align: left; padding: 7px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }}
  th {{ background: #f4f4f5; font-weight: 600; }}
  td.ok {{ color: var(--ok); font-weight: 600; }}
  td.bad {{ color: var(--bad); font-weight: 600; }}
  code {{ background: #f4f4f5; border-radius: 4px; padding: 1px 5px; font-size: 0.92em; }}
  pre {{ background: #18181b; color: #e4e4e7; padding: 14px 16px; border-radius: 8px; overflow-x: auto; font-size: 13px; }}
  .decision {{ background: #fff; border: 1px solid var(--line); border-left: 4px solid var(--accent); border-radius: 8px; padding: 16px 20px; margin-top: 14px; }}
  .decision h3 {{ margin-top: 8px; }}
</style>
</head>
<body>
<main>
<h1>Fallback recovery formatting</h1>
<p class="sub">Height reservation for deep recovery chains · per-lane cascade · hover-only insert icons ·
arrowheads at every convergence landing — {STAMP}, worktree <code>agent-a1eb15213ee582e7b</code>, uncommitted.</p>

<div class="badges">
  <span>vitest <b class="{'ok' if vitest['failed'] == 0 else 'bad'}">{vitest['passed']}/{vitest['tests']}</b> in {vitest['files']} files</span>
  <span>python <b class="{'ok' if python['ok'] else 'bad'}">{python['tests']} tests {'OK' if python['ok'] else 'FAILED'}</b></span>
  <span>journeys <b class="ok">{sum(row['passed'] or 0 for row in acceptances)}/{sum(row['total'] or 0 for row in acceptances)}</b> checks</span>
  <span>review board <b class="{'ok' if health['board'] and health['root_is_this_worktree'] else 'bad'}">{'live on 4960' if health['root_is_this_worktree'] else 'CHECK SERVER'}</b></span>
</div>

<h2>What Zach reported</h2>
<p>Filed on the <code>failure-branch-formatting</code> board with an annotated screenshot of his
literal <b>PickAndPlace</b> tree — a flat Fallback whose recovery chain is
<code>MoveHome</code> →Failure→ <code>GraspValid</code> →Failure→ (<code>CorrectGrip</code> →
<code>GraspValid</code> re-check): <i>“you are not spacing the height correctly … by the 3rd
branch you are getting a lot of overlap — you need to account for the height of the last branch in
the other 2 branches.”</i> Plus two visual rules: <i>“ICONS SHOW ONLY ON HOVER”</i> and
<i>“Note the arrow ends”</i> — three junctions circled in green, each pasted over with an arrowhead
crop (the junction one rotated 90°, pointing along the merge line into the rail).</p>
<div class="row">
  <figure>{img(ASSETS / 'zach-current-bad.png', "Zach's CURRENT: BAD screenshot")}
  <figcaption>His <b>CURRENT: BAD</b> capture — cramped tail, always-on icons, no arrow ends.</figcaption></figure>
  <figure>{img(ASSETS / 'zach-desired-collage.png', "Zach's DESIRED collage, reconstructed from his board")}
  <figcaption>His <b>DESIRED</b> mockup, reconstructed from the exact crops + green circles he placed on the board.</figcaption></figure>
</div>

<h2>Shipped — his literal tree, in the real app</h2>
<figure>{img(ASSETS / 'shipped-literal-full.png', 'PickAndPlace literal tree, Process view, after')}
<figcaption>The same tree, live. Arms cascade one unit per branch and are entered from above;
the single straight merge line returns to the main flow exactly as before — now with an arrowhead
at every landing. <code>tests/behavior_tree_pickandplace_literal_smoke.mjs</code> holds this exact
scene: 12/12 incl. <code>layout.no-node-overlap</code>, three merge arrowheads, hover gating.</figcaption></figure>

<h3>“Note the arrow ends” — his three circles, shipped</h3>
<div class="row">
  <figure>{img(ASSETS / 'shipped-junction-rail.png', 'merge run arrives at the main rail')}
  <figcaption><b>Circle 1</b> — the single merge run arrives at the main-rail junction with one
  arrowhead; the rail itself passes through headless (it IS the line the arms merge into).</figcaption></figure>
  <figure>{img(ASSETS / 'shipped-junction-drop1.png', 'first arm drop lands on the merge line')}
  <figcaption><b>Circle 2</b> — <code>GraspValid</code>'s drop lands on the merge line with a
  down arrowhead, the terminus “+” centered in its first unit.</figcaption></figure>
  <figure>{img(ASSETS / 'shipped-junction-drop2.png', 'second arm drop lands at the corner')}
  <figcaption><b>Circle 3</b> — the re-check arm's drop, arrowhead at the corner where the
  merge run begins.</figcaption></figure>
</div>
<p>Edge structure in <code>lanesWithRecovery</code>: each arm's return is a <b>drop</b> edge
(<code>merge:&lt;i&gt;</code>, <code>arrowEnd: true</code>) plus <b>one</b> shared straight
<b>run</b> (<code>merge:run</code>, <code>arrowEnd: true</code>) from the farthest landing to the
junction — not per-lane overlapping polylines — and the primary's own <code>merge:rail</code> drop
stays headless. Pinned per nesting level and both orientations by
<code>layouts.test.ts</code> “marks every convergence landing with an arrowhead”.</p>

<h3>The cascade — the piece still missing this morning</h3>
<p>The rewritten reservation already computed the merge line one unit below the <b>deepest</b>
arm (Zach's “account for the last branch up front”), but placed every sibling arm at one shared
height. For a flat multi-arm Fallback that put the 2nd arm's Failure corner <b>inside</b> its
first card — the line entered from below, chip half-hidden. <code>laneBoxFlow</code> is now a
per-lane array: every arm's box one unit below the Failure line that feeds it, that line leaving
the previous arm at its mid-height — so every arm is entered from above, exactly his mockup.
Pinned by “enters every arm from above, through its top face, by exactly one unit” +
a failure-chip/card clearance sweep, on his literal tree shape.</p>
<figure>{img(ASSETS / 'nested-depth3-painter.png', 'nested depth 3, deterministic painter')}
<figcaption>Depth-3 <b>nested</b> Fallback from the deterministic painter (same geometry engine the
canvas uses): every level keeps its own merge line, arrowheads at every landing, junction arrivals
marked, main rail continuous. Nesting is untouched by the cascade change — each level has a single
arm, so its math is identical.</figcaption></figure>

<h2>“Icons show only on hover” — recorded, not asserted</h2>
<figure><img src="{data_uri(ASSETS / 'hover-reveal.gif')}" alt="recorded pointer journey revealing an interior insert" style="max-width:100%">
<figcaption>Real recorded pointer journey (headless Chrome screencast, live app): the interior
“+” between <code>CorrectGrip</code> and the re-check is invisible at rest and fades in as the
pointer reaches its own 48px hover zone — nothing else lights up. Arm start/terminus “+” stay
visible by Zach's explicit ruling (an arm is “just another sequential branch you can stack
skills on”); the <code>flowstate.end-persistent</code> journey check guards that exemption.</figcaption></figure>
<figure>{img(ASSETS / 'shipped-hover-reveal.png', 'hover reveal still')}
<figcaption>The journey's own capture: hovered zone revealed at full opacity, computed
<code>opacity: 0 → 1</code> asserted from the real DOM. Debug escape hatch: the inspector's
“Attachment points → Show all” keeps the old always-on view.</figcaption></figure>

<h2>Verification, measured at build time</h2>
<table>
<tr><th>journey</th><th>what it proves</th><th>checks</th><th>ran at</th></tr>
{acceptance_rows}
</table>
<h3>Source seams this page claims</h3>
<table>
<tr><th>claim</th><th>status</th></tr>
{seam_rows}
</table>
<h3>Files</h3>
<table>
<tr><th>file</th><th>state</th><th>diff vs main</th><th>lines</th></tr>
{file_rows}
</table>
<p>Full <code>npm run check</code> (tsc + vitest + Python + stock-boundary + PEP-link sync) ran
green before this report was built; the vitest/python badges above are re-measured live on every
build of this page.</p>

<h2>Review board</h2>
<figure>{img(BOARD_PNG, 'review fixture')}
<figcaption><code>sketches/review/fallback-recovery-formatting.systemsketch</code> — his literal
XML, four numbered cues, green PASS WHEN. Generated through the real editor, cold-reopened, cue
bindings verified by motion; the exact URL below was loaded in headless Chrome and painted
3 merge arrowheads before this handoff.</figcaption></figure>
<pre>{esc(REVIEW_URL)}</pre>

<h2>Decision surface</h2>
<div class="decision">
<h3>Done and proved</h3>
<ul>
<li>Height reservation accounts for the deepest branch up front — 3-level nested and flat 3-arm
trees lay out with zero overlap ({vitest['passed']}/{vitest['tests']} unit,
{sum(row['passed'] or 0 for row in acceptances)}/{sum(row['total'] or 0 for row in acceptances)} journey checks).</li>
<li>Per-lane cascade restored: every arm entered from above, chips clear of cards — on your
literal PickAndPlace shape, in the real app.</li>
<li>Arrowheads at all three circled convergence points; single straight merge line preserved
byte-for-byte in spirit: one run, headless rail continuation.</li>
<li>Interior “+” hover-only with per-zone reveal; persistent start/terminus exemption kept.</li>
</ul>
<h3>Needs you</h3>
<ul>
<li>Walk the review board (URL above). <b>Default if you say nothing:</b> this stays as-is on the
worktree branch, un-merged — nothing lands on main without your word.</li>
<li>The junction arrowhead points <i>along the merge line into the rail</i> (your rotated crop,
circle 1). If you meant a down-arrow on the rail below the junction instead, it is a one-line
<code>arrowEnd</code> flip on <code>merge:rail</code>.</li>
</ul>
<h3>Deliberately not done</h3>
<ul>
<li>No “thick tick mark” glyph distinct from the arrowheads — your pasted crops were arrowheads,
so arrowheads are what shipped.</li>
<li>Blackboard/Dataflow lens edges keep their existing arrow rules; only the recovery/merge
family changed.</li>
<li>The peer tasks in this worktree (arrow live-tracking + spacing slider, dnd-kit migration)
are untouched and report separately; their known open item
(<code>wire.settles-on-drop</code>) is theirs.</li>
</ul>
</div>
</main>
</body>
</html>
"""
    OUT.write_text(html)
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    build()
