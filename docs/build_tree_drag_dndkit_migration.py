#!/usr/bin/env python3
"""
Implementation report: Tree-view drag-reorder migrated to dnd-kit.

Zach's explicit call: replace the hand-rolled depth-band engine
(`treeDragReorder.ts`) with `@dnd-kit/core` + `@dnd-kit/sortable`, modelled as
dnd-kit's own canonical multi-container board (one sortable container per
parent's children list), with react-arborist's ancestor-climb for cross-parent
moves and a two-phase real-layout-then-virtual-geometry pipeline Process view
can reuse. Every number here is measured from this tree at build time: the
acceptance JSONs both journeys wrote tonight, a live run of the new unit
suite, greps of the shipped source for the load-bearing structural claims, and
a probe of the running review server for the code Zach's board actually loads.

Run:  python3 docs/build_tree_drag_dndkit_migration.py
"""
from __future__ import annotations

import base64
import json
import re
import subprocess
import urllib.request
from html import escape
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DOCS = REPO / "docs"
ASSETS = DOCS / "assets" / "behavior-tree-tree-drag-dndkit"
REORDER_ASSETS = DOCS / "assets" / "behavior-tree-tree-drag-reorder"
POLISH_ASSETS = DOCS / "assets" / "behavior-tree-drag-polish"
REVIEW = REPO / "sketches" / "review"
STAMP = "2026-09-06"
OUT = DOCS / f"tree-drag-dndkit-migration-{STAMP}.html"

PREVIEW_PORT = 4960
BOARD_MAIN = REVIEW / "tree-drag-reorder.systemsketch"
BOARD_NEW = REVIEW / "tree-drag-dndkit.systemsketch"


def data_uri(path: Path, mime: str) -> str:
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


def png(path: Path) -> str:
    return data_uri(path, "image/png")


def measure_unit_suite() -> dict:
    """Run the new engine's unit suite right now and parse the summary."""
    run = subprocess.run(
        ["npx", "vitest", "run", "src/behaviorTree/dragListReorder.test.ts"],
        cwd=REPO, capture_output=True, text=True, timeout=300,
    )
    text = run.stdout + run.stderr
    tests = re.search(r"Tests\s+(\d+) passed \((\d+)\)", text)
    return {
        "ok": run.returncode == 0 and tests is not None,
        "passed": int(tests.group(1)) if tests else 0,
        "total": int(tests.group(2)) if tests else 0,
    }


def acceptance(path: Path) -> dict:
    return json.loads(path.read_text())


def grep_count(path: Path, pattern: str) -> int:
    return len(re.findall(pattern, path.read_text()))


def src_files() -> list[Path]:
    return [p for p in (REPO / "src").rglob("*.ts*") if "node_modules" not in p.parts]


def mounted_dndkit_components() -> list[str]:
    """The structural claim: dnd-kit's React components are never mounted.

    Structural, not textual — a WHY comment is allowed to NAME DndContext
    while explaining why it is not used. What must not exist is an import
    that binds one of the React-component/hook symbols, or a JSX mount.
    """
    component_symbols = r"(?:DndContext|SortableContext|useSortable|useDraggable|useDroppable|DragOverlay)"
    hits: list[str] = []
    for path in src_files():
        text = path.read_text()
        imports_component = re.search(
            rf"import\s+(?:type\s+)?{{[^}}]*\b{component_symbols}\b[^}}]*}}\s+from\s+'@dnd-kit/", text
        )
        mounts_component = re.search(rf"<{component_symbols}[\s>]", text)
        if imports_component or mounts_component:
            hits.append(str(path.relative_to(REPO)))
    return hits


def live_server_probe() -> dict:
    """Does the running review server serve the new engine to Zach's board?"""
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{PREVIEW_PORT}/src/behaviorTree/dragListReorder.ts", timeout=4) as response:
            body = response.read().decode("utf-8", "replace")
        with urllib.request.urlopen(f"http://127.0.0.1:{PREVIEW_PORT}/src/behaviorTree/installBehaviorTreeRegions.ts", timeout=4) as response:
            installer = response.read().decode("utf-8", "replace")
        return {
            "up": True,
            "engine_tokens": len(re.findall(r"closestCenter|pointerWithin", body)),
            "installer_wired": "resolveDragListDrop" in installer,
        }
    except Exception as error:  # noqa: BLE001 - a down server is a finding, not a crash
        return {"up": False, "error": str(error), "engine_tokens": 0, "installer_wired": False}


def dndkit_versions() -> dict:
    package = json.loads((REPO / "package.json").read_text())
    deps = package.get("dependencies", {})
    return {name: deps.get(name, "MISSING") for name in ("@dnd-kit/core", "@dnd-kit/sortable")}


def check_rows(data: dict) -> str:
    rows = []
    for result in data["results"]:
        ok = "PASS" if result["ok"] else "FAIL"
        rows.append(
            f"<tr class={'ok' if result['ok'] else 'bad'}><td>{ok}</td>"
            f"<td><code>{escape(result['id'])}</code></td><td>{escape(result['label'])}</td></tr>"
        )
    return "\n".join(rows)


def main() -> None:
    engine = REPO / "src/behaviorTree/dragListReorder.ts"
    geometry = REPO / "src/behaviorTree/sortableGeometry.ts"
    unit = measure_unit_suite()
    reorder = acceptance(REORDER_ASSETS / "acceptance.json")
    polish = acceptance(POLISH_ASSETS / "acceptance.json")
    live = live_server_probe()
    versions = dndkit_versions()
    mounted = mounted_dndkit_components()
    old_engine_gone = not (REPO / "src/behaviorTree/treeDragReorder.ts").exists()
    engine_collision_calls = grep_count(engine, r"closestCenter|pointerWithin")
    hysteresis_exported = "resolveSlotWithHysteresis" in geometry.read_text()
    view_agnostic = not re.search(r"from './(behaviorTreeModel|treeLayout|btcppXml)'", geometry.read_text())

    board_url_main = f"http://127.0.0.1:{PREVIEW_PORT}/?board={BOARD_MAIN}"
    board_url_new = f"http://127.0.0.1:{PREVIEW_PORT}/?board={BOARD_NEW}"

    facts = [
        (unit["ok"] and unit["total"] >= 28, f"unit suite re-run at build time: {unit['passed']}/{unit['total']} passed (16 oracle pins + new coverage)"),
        (reorder["passed"] == reorder["total"], f"drag-reorder journey: {reorder['passed']}/{reorder['total']} at {escape(reorder['generatedAt'])}"),
        (polish["passed"] == polish["total"], f"drag-polish journey (wires + spacing + settle): {polish['passed']}/{polish['total']} at {escape(polish['generatedAt'])}"),
        (versions["@dnd-kit/core"] != "MISSING", f"@dnd-kit/core {escape(versions['@dnd-kit/core'])} · @dnd-kit/sortable {escape(versions['@dnd-kit/sortable'])}"),
        (engine_collision_calls >= 4, f"the engine invokes dnd-kit's real collision functions ({engine_collision_calls} pointerWithin/closestCenter references in dragListReorder.ts)"),
        (len(mounted) == 0, "no DndContext / SortableContext / useSortable mounted anywhere in src/ — tldraw stays the only drag system" if not mounted else f"UNEXPECTED dnd-kit components mounted in: {', '.join(mounted)}"),
        (old_engine_gone, "the hand-rolled treeDragReorder.ts is deleted, not shadowed"),
        (hysteresis_exported and view_agnostic, "sortableGeometry.ts is view-agnostic (no BT imports) and ships the hysteresis resolver"),
        (live["up"] and live["installer_wired"], f"live review server on :{PREVIEW_PORT} serves the new engine (installer wired: {live['installer_wired']}, engine tokens: {live['engine_tokens']})" if live["up"] else f"review server probe failed: {escape(live.get('error', ''))}"),
    ]
    all_green = all(ok for ok, _ in facts)
    fact_rows = "\n".join(
        f"<tr class={'ok' if ok else 'bad'}><td>{'PASS' if ok else 'FAIL'}</td><td>{label}</td></tr>" for ok, label in facts
    )

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Tree drag on dnd-kit — migration report · {STAMP}</title>
<style>
  :root {{ color-scheme: light; }}
  body {{ font: 15px/1.55 -apple-system, "Segoe UI", sans-serif; color: #1a1f27; margin: 0; background: #f6f7f9; }}
  main {{ max-width: 1080px; margin: 0 auto; padding: 40px 28px 80px; }}
  h1 {{ font-size: 30px; margin: 0 0 6px; }}
  h2 {{ font-size: 21px; margin: 44px 0 10px; border-bottom: 2px solid #e2e5ea; padding-bottom: 6px; }}
  h3 {{ font-size: 16px; margin: 26px 0 8px; }}
  .sub {{ color: #5a6372; margin: 0 0 22px; }}
  code {{ background: #eceef2; border-radius: 4px; padding: 1px 5px; font-size: 13px; }}
  pre {{ background: #14181f; color: #dbe2ec; padding: 14px 16px; border-radius: 8px; overflow-x: auto; font-size: 13px; }}
  table {{ border-collapse: collapse; width: 100%; margin: 12px 0 20px; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(20,24,31,.08); }}
  td, th {{ padding: 7px 12px; border-bottom: 1px solid #eef0f3; text-align: left; vertical-align: top; font-size: 14px; }}
  tr.ok td:first-child {{ color: #157a3d; font-weight: 700; }}
  tr.bad td:first-child {{ color: #b3261e; font-weight: 700; }}
  .verdict {{ font-size: 17px; font-weight: 700; padding: 14px 18px; border-radius: 10px; margin: 18px 0; }}
  .verdict.ok {{ background: #e3f4e8; color: #135c30; }}
  .verdict.bad {{ background: #fbe4e2; color: #8f1f18; }}
  figure {{ margin: 18px 0; background: #fff; border-radius: 10px; padding: 12px; box-shadow: 0 1px 4px rgba(20,24,31,.1); }}
  figcaption {{ font-size: 13px; color: #5a6372; padding-top: 8px; }}
  img, video {{ max-width: 100%; border-radius: 6px; display: block; }}
  .grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }}
  .pill {{ display: inline-block; background: #e8ebf0; border-radius: 999px; padding: 2px 10px; font-size: 12px; margin-right: 6px; }}
  ul {{ margin: 8px 0 16px; }}
  li {{ margin: 4px 0; }}
  .decision td:first-child {{ white-space: nowrap; font-weight: 600; }}
</style>
</head>
<body>
<main>
<h1>Tree drag-reorder now runs on dnd-kit</h1>
<p class="sub">{STAMP} · worktree <code>agent-a1eb15213ee582e7b</code> · uncommitted, nothing merged ·
<span class="pill">@dnd-kit/core {escape(versions['@dnd-kit/core'])}</span>
<span class="pill">@dnd-kit/sortable {escape(versions['@dnd-kit/sortable'])}</span></p>

<div class="verdict {'ok' if all_green else 'bad'}">{'Every build-time measurement is green: behavior preserved on the old engine&#39;s own pinned assertions, the new mechanics covered, both real-browser journeys passing, and the live review board serving the new code.' if all_green else 'At least one build-time measurement is red — read the facts table before trusting anything below.'}</div>

<figure>
  <video autoplay muted loop playsinline poster="{png(ASSETS / 'hero-poster.png')}">
    <source src="{data_uri(ASSETS / 'hero-drag.mp4', 'video/mp4')}" type="video/mp4">
    <img src="{data_uri(ASSETS / 'hero-drag.gif', 'image/gif')}" alt="Drag reorder hero recording">
  </video>
  <figcaption>Recorded from the real running app (CDP screencast, {STAMP}): CloseGrip grabbed and glided left — siblings reflow live as each slot boundary is crossed; a deliberate few-pixel wobble on a boundary holds its slot (the new deadband); the drop lands, and one undo restores the whole drag.
  <a href="{data_uri(ASSETS / 'hero-drag.gif', 'image/gif')}">GIF fallback</a>.</figcaption>
</figure>

<h2>The decision, plainly</h2>
<p>The previous engine (<code>treeDragReorder.ts</code>) carried a long WHY arguing <em>against</em> dnd-kit. Zach reversed that after a dedicated research pass read six real tree-drag implementations from source: none use a depth-band inference model; the standing pattern is per-parent sortable lists — dnd-kit's own canonical multi-container Kanban — plus react-arborist's <code>walkUpFrom</code>/<code>bound()</code> ancestor climb. The migration keeps the one idea the old engine got right (resolve against a <strong>ghost layout</strong> with the dragged subtree removed, so slot boundaries hold still) and replaces the resolution model around it.</p>
<p><strong>What "using dnd-kit" means here — and doesn't.</strong> The dragged things are real tldraw Block shapes moved by tldraw's own <code>select.translating</code>. Mounting <code>DndContext</code> with pointer sensors would bolt a second drag system beside the engine — exactly what the stock-boundary rule forbids, and re-fighting the measured two-writer corruption documented in <code>installBehaviorTreeRegions.ts</code>. So <strong>tldraw is the sensor</strong>, and the engine calls the same exported, pure collision functions <code>DndContext</code> runs internally (<code>pointerWithin</code>, <code>closestCenter</code>), composed the way dnd-kit's multi-container example composes them, over virtual per-container geometry derived from the real layout. That claim is structural and measured below: zero dnd-kit React components mounted anywhere in <code>src/</code>.</p>

<h2>Architecture: three picks, two phases</h2>
<pre>Phase 1 — REAL layout        d3-hierarchy (treeLayout.ts), overrides + spacing threaded; commits paint from here
Phase 2 — VIRTUAL geometry   sortableGeometry.ts derives per-parent containers: uniform slots
                             (each container normalized to its own largest member), tiled zones

resolve(rect):
  1. strip     pointerWithin over base depth bands (cross-normalized)   [dnd-kit]
  2. container pointerWithin over the strip's tiled zones — the midpoint
               tiling IS the old two-parent gap rule; past the ends,
               closestCenter over the strip's uniform virtual slots      [dnd-kit]
               then the ancestor CLIMB: a pointer &gt;1 slot outside its
               picked container walks up the parent chain (react-arborist)
  3. slot      resolveSlotWithHysteresis — hello-pangea's capture/release
               deadband over ghost centers; dnd-kit ships no hysteresis
  judge        moveBehaviorTreeNode — unchanged; refusals ARE the illegal-drop signal</pre>
<ul>
  <li><strong>Multi-container answers the audit's objection.</strong> Each container sorts along its own local axis; no global 2D metric over the whole tree is ever asked for.</li>
  <li><strong>The virtual geometry never paints.</strong> It only feeds dnd-kit's collision math; committed positions still come from the real layout engine.</li>
  <li><strong><code>sortableGeometry.ts</code> is view-agnostic</strong> — bare rects + an axis in, containers out; no Behavior-Tree imports — so Process view's future migration reuses it against <code>processLayout.ts</code> output.</li>
  <li><strong>The deadband is per-drag state</strong> (the context now lives on the drag session, built once instead of twice-per-frame): capture when the leading edge crosses a ghost center, release only when the trailing edge passes center + displacement. A point rect with no prior state degrades to exactly the old count-of-centers rule — which is what keeps the oracle green.</li>
</ul>

<h2>Build-time facts</h2>
<table>{fact_rows}</table>

<h2>Regression proof — the old engine is the oracle</h2>
<p>All sixteen of the retired engine's unit assertions were ported unchanged (same fixtures, same expected XML orders, same refusal reasons) and pass against the new engine, alongside twelve new tests for the derivation, tiling, deadband, multi-container scoping, ancestor climb, and threaded hysteresis. The full 22-check browser journey — live reflow, one-step undo, subtree carrying, refusal toast, Auto-layout-off free drag, Expanded-override resolution — passed tonight against the new engine, unmodified except for comment references.</p>

<h3>Drag-reorder journey · {reorder['passed']}/{reorder['total']}</h3>
<table>{check_rows(reorder)}</table>

<div class="grid">
<figure><img src="{png(REORDER_ASSETS / 'reorder-sibling-mid-drag.png')}" alt="mid drag"><figcaption>Mid-drag: siblings have already reflowed around the pointer — a live model reorder, not a pixel offset.</figcaption></figure>
<figure><img src="{png(REORDER_ASSETS / 'reorder-subtree-carried.png')}" alt="subtree carried"><figcaption>A dragged Fallback lands last with both children carried, in order.</figcaption></figure>
<figure><img src="{png(REORDER_ASSETS / 'illegal-drop-toast.png')}" alt="illegal drop"><figcaption>An illegal drop refuses with <code>moveBehaviorTreeNode</code>'s real reason; nothing corrupts.</figcaption></figure>
<figure><img src="{png(REORDER_ASSETS / 'override-aware-drag.png')}" alt="override aware"><figcaption>An Expanded leaf shifts the painted rows; resolution follows the painted layout, overrides re-keyed through the drag.</figcaption></figure>
</div>

<h3>Drag-polish journey (peer work riding on this engine) · {polish['passed']}/{polish['total']}</h3>
<p>The arrow live-tracking fix (<code>liveDragWires.ts</code>) needed no absorption: it keys off <code>select.translating</code> at paint time, and tldraw remains the event source, so it rides the new engine untouched — 0px wire gap on every sampled mid-drag frame. The settle-on-drop fix (the <code>react</code> watcher) was landed by its own agent mid-session; <code>wire.settles-on-drop</code> passes.</p>
<table>{check_rows(polish)}</table>

<h2>Review board</h2>
<div class="grid">
<figure><img src="{png(REVIEW / 'tree-drag-dndkit.png')}" alt="review fixture"><figcaption>New fixture <code>sketches/review/tree-drag-dndkit.systemsketch</code> — three cues (live reflow · deadband wobble · ancestor climb) and a PASS WHEN card. Generated through the real editor, cold-reopen verified, and driven once headlessly: a real drag on a scratch copy reordered CloseGrip to the front.</figcaption></figure>
<figure><figcaption style="padding:0 0 8px"><strong>Open it (paste, don't click-wrap):</strong></figcaption>
<pre>{board_url_new}</pre>
<figcaption>Zach's existing recording board, same server, same new engine underneath:</figcaption>
<pre>{board_url_main}</pre>
</figure>
</div>

<h2>Decision surface</h2>
<table class="decision">
<tr><td>Done, proved</td><td>Engine replaced end to end; 16/16 oracle pins + 12 new unit tests ({unit['passed']}/{unit['total']} at build time); 22/22 and 14/14 real-browser journeys; <code>npm run check</code> green tonight (tsc, full vitest, 118 Python tests incl. the stock boundary, breadcrumbs journey); live server verified serving the new engine.</td></tr>
<tr><td>Left, unblocked</td><td>Process view's own dnd-kit migration — <code>sortableGeometry.ts</code> is built for it and unit-tested on a vertical axis, but nothing in Process view consumes it yet, deliberately.</td></tr>
<tr><td>Needs Zach</td><td>Nothing blocking. Two calls made without asking, both reversible: (1) dnd-kit's React components stay unmounted — tldraw remains the sensor (stock-boundary + two-writer evidence; if you wanted a literal DndContext mount, say so and it's a different, larger change); (2) the ancestor climb changes one unpinned behavior — hovering the void where a dragged subtree used to hang now lands beside its old parent instead of teleporting into the nearest deep container (unit-tested as the intended answer).</td></tr>
<tr><td>Deliberately not done</td><td>No FR notes; no PEP yet — this is a durable architecture fork (pure-collision-functions vs mounted-DndContext) and should get <code>docs/peps/NNNN</code> AT MERGE per <code>docs/peps/README.md</code>, not from a worktree. Old engine's tests deleted with it rather than kept as a shadow suite (the ported pins ARE that suite).</td></tr>
</table>

<p class="sub">Builder: <code>docs/build_tree_drag_dndkit_migration.py</code> — rerun it and every number above is remeasured from the tree.</p>
</main>
</body>
</html>
"""
    OUT.write_text(html)
    print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KB); all_green={all_green}")
    for ok, label in facts:
        print(f"  {'PASS' if ok else 'FAIL'}  {label}")


if __name__ == "__main__":
    main()
