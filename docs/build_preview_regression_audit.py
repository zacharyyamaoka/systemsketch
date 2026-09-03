#!/usr/bin/env python3
"""Build the self-contained Preview regression and performance audit gallery."""

from __future__ import annotations

import base64
import html
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
ASSETS = DOCS / "assets"
OUTPUT = DOCS / "preview-regression-audit-2026-09-03.html"
MEASUREMENTS = ASSETS / "preview-regression-audit-measurements-2026-09-03.json"


def data_uri(relative: str) -> str:
    path = ROOT / relative
    mime = "image/png" if path.suffix == ".png" else "image/svg+xml"
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def scenario(document: dict, name: str) -> dict:
    return next(item for item in document["scenarios"] if item["name"] == name)


before = json.loads((ASSETS / "perf-probe-preview-audit-2964.json").read_text())
after = json.loads((ASSETS / "perf-probe-preview-audit-final.json").read_text())
before_select = scenario(before, "select-all-drag")
after_select = scenario(after, "select-all-drag")
before_cable = scenario(before, "cable-drag")
after_cable = scenario(after, "cable-drag")

missing_journeys = [
    "tests/block_diff_states_smoke.mjs",
    "tests/block_diff_vocabulary_smoke.mjs",
    "tests/block_diff_round2_smoke.mjs",
]
missing_journeys = [path for path in missing_journeys if not (ROOT / path).exists()]

measurements = {
    "snapshot": {
        "baseline": "2964abb",
        "integratedMain": "8f6d1b5",
        "blocks": after["seed"]["blocks"],
        "cables": after["seed"]["cables"],
        "shapes": after["seed"]["shapesOnPage"],
    },
    "selectAllDrag": {
        "busyMsBefore": before_select["cpu"]["busyMs"],
        "busyMsAfter": after_select["cpu"]["busyMs"],
        "busyReductionPercent": round(
            100 * (before_select["cpu"]["busyMs"] - after_select["cpu"]["busyMs"])
            / before_select["cpu"]["busyMs"],
            1,
        ),
        "sourceInclusiveMsBefore": before_select["cpu"]["buckets"]["src"],
        "sourceInclusiveMsAfter": after_select["cpu"]["buckets"]["src"],
        "maxFrameGapMsBefore": before_select["frames"]["maxGapMs"],
        "maxFrameGapMsAfter": after_select["frames"]["maxGapMs"],
    },
    "cableDrag": {
        "sourceInclusiveMsBefore": before_cable["cpu"]["buckets"]["src"],
        "sourceInclusiveMsAfter": after_cable["cpu"]["buckets"]["src"],
        "maxFrameGapMsAfter": after_cable["frames"]["maxGapMs"],
        "longTaskMsAfter": after_cable["frames"]["longTaskMs"],
    },
    "verification": {
        "reviewBoardsParsed": 80,
        "vitestTests": 1066,
        "pythonTests": 94,
        "browserChecks": 69,
    },
    "missingJourneys": missing_journeys,
}
MEASUREMENTS.write_text(json.dumps(measurements, indent=2) + "\n", encoding="utf-8")


ISSUES = [
    {
        "id": "saved-board-migration",
        "priority": "P1",
        "kind": "Product bug",
        "status": "Implemented",
        "title": "Pre-diff saved boards were quarantined on open",
        "summary": "The diff merge made Block state required without advancing the Block migration sequence. A valid version-4 board therefore failed current validation before it could render.",
        "images": [
            ("docs/assets/repo-improvements-workspace-quarantine.png", "The product's read-only quarantine surface—the state the tunnel fixture entered before the migration repair."),
            ("docs/assets/edge-tunnel-hidden-live-2026-09-02.png", "After repair, the same committed two-edge review board cold-opens and its tunnel interaction is driveable."),
        ],
        "actual": "Opening sketches/review/edge-tunnel.systemsketch produced invalidRecords, an empty editor, and the read-only safety alert.",
        "expected": "A board written before diff state existed migrates to state: normal and remains editable.",
        "repro": "npm run test:tunnel on baseline 2964abb; wait for the saved review fixture.",
        "proof": "Added Block migration versions 5 and 6, a version-4 regression, and a sweep that parses every committed review board. The tunnel journey now passes 10/10.",
        "seam": "src/blocks/BlockShapeUtil.tsx · src/blocks/blockShapeMigrations.test.ts · src/workspace/reviewFixtures.test.ts",
        "acceptance": "All committed .systemsketch review boards parse as ready; the tunnel fixture cold-opens and completes hover/layer interactions.",
    },
    {
        "id": "diagnostics-hot-path",
        "priority": "P1",
        "kind": "Performance",
        "status": "Implemented",
        "title": "The always-visible Problems badge rebuilt the board graph on every drag frame",
        "summary": "getBoardDiagnosticsModel walked pages, shapes, bindings, occupancy, duplicate edges, and cycles whenever any reactive editor value changed—including transform-only updates.",
        "images": [
            ("docs/assets/board-diagnostics-problems-2026-09-02.png", "The Problems surface stays live, but its derived model now subscribes only to semantic document changes."),
            ("docs/assets/perf-probe-preview-audit-final-board.png", "The measured 48-Block, 68-cable stress board after the subscription fix."),
        ],
        "actual": "Profiler samples attributed roughly 31–39 ms of source-inclusive work per drag scenario to whole-board diagnostics recomputation.",
        "expected": "Moving or rotating shapes must not recompute semantic diagnostics; edits to Blocks, scopes, pages, or connection bindings still must.",
        "repro": "node tests/perf_probe.mjs preview-audit-2964 48; inspect source-inclusive stacks during block, cable, and select-all drags.",
        "proof": "A filtered document-store subscription ignores transform and in-flight cable geometry but refreshes semantic props, ancestry, bindings, additions, removals, and pages. The 6-check Problems journey passes.",
        "seam": "src/diagnostics/useBoardDiagnosticsModel.ts · src/SystemSketchUtilities.tsx · src/diagnostics/BoardDiagnosticsPanel.tsx",
        "acceptance": "Problems counts update after semantic repairs, stay stable during translation, and the stress trace no longer reports diagnostics as a per-frame source hot path.",
    },
    {
        "id": "connector-hidden-work",
        "priority": "P2",
        "kind": "Performance",
        "status": "Implemented",
        "title": "Hidden connector controls and plain cables still performed route work during manipulation",
        "summary": "The connector-control listener measured every selected route even while tldraw hid controls; every plain cable also collected tunnel context and recomputed render points that common paint never used.",
        "images": [
            ("docs/assets/connector-data-edge-controls.png", "Interior controls still appear immediately when the pointer is near the selected route."),
            ("docs/assets/preview-regression-audit-drag-2026-09-03.png", "Real review-board drag: both bound cables follow the moved Block and Problems remains clean."),
        ],
        "actual": "A large drag paid connector bounds and redundant cable render-point costs on pointer frames where no interior controls could paint.",
        "expected": "Defer control bounds until manipulation settles; skip tunnel/binding/render-point work for ordinary data cables unless a tunnel, async cadence, or endpoint diff needs it.",
        "repro": "Select all on the 116-shape perf board and drag for 40 pointer steps; profile source-inclusive route/control work.",
        "proof": "The final select-all trace falls from 947 to 767 ms sampled busy time (19.0%), source-inclusive time from 73 to 47 ms, and max frame gap from 66.6 to 50 ms. Connector controls pass 10/10.",
        "seam": "src/installConnectorControlVisibility.ts · src/blocks/connections/ConnectionShapeUtil.tsx",
        "acceptance": "Control parity remains unchanged before/after gestures, tunnels and async paint remain intact, and large selection motion spends less code-owned CPU.",
    },
    {
        "id": "perf-probe-schema",
        "priority": "P2",
        "kind": "Tooling",
        "status": "Implemented",
        "title": "The performance probe could no longer seed a current Block",
        "summary": "Its hand-authored Block views predated the required value view, so the audit instrument itself failed before measuring Preview.",
        "images": [("docs/assets/perf-probe-preview-audit-final-board.png", "The repaired probe successfully seeds and renders all 116 semantic shapes before measurement.")],
        "actual": "Creating the first stress Block failed validation because views.value was absent.",
        "expected": "The probe uses current product defaults/schema and reaches every recorded gesture.",
        "repro": "node tests/perf_probe.mjs any-label 48 on the unpatched probe.",
        "proof": "The seed now includes the value box and produced complete baseline/final JSON plus board/after screenshots.",
        "seam": "tests/perf_probe.mjs",
        "acceptance": "The probe seeds 48 Blocks and 68 cables, runs eight scenarios, and writes its measurement sidecar.",
    },
    {
        "id": "responsive-popover-test",
        "priority": "P3",
        "kind": "Tooling",
        "status": "Implemented",
        "title": "Responsive toolbar movement made a valid popover clamp fail the hardening journey",
        "summary": "At 520 px the trigger moved to the opposite edge, but the test only accepted evidence of a left-edge collision. The UI was correctly clamped on the right.",
        "images": [("docs/ui-hardening-4-appearance-2026-09-03.png", "The 520 px appearance panel remains inside the 12 px viewport padding after the responsive trigger moves.")],
        "actual": "The assertion failed even though both panel edges stayed inside the intended collision padding.",
        "expected": "Prove that natural centering crosses either padded viewport edge, then assert the rendered panel is clamped inside both.",
        "repro": "npm run test:ui-hardening at the 520 px appearance step.",
        "proof": "The assertion now accepts left or right collision pressure; the complete physical journey passes 19/19 with zero browser errors.",
        "seam": "tests/ui_hardening_smoke.mjs",
        "acceptance": "Both responsive trigger placements exercise a real clamp and preserve the app-wide 12 px clearance.",
    },
    {
        "id": "residual-cable-long-task",
        "priority": "P2",
        "kind": "Performance",
        "status": "Unconfirmed",
        "title": "One cable-drag long task remains in the synthetic stress run",
        "summary": "Code-owned inclusive time improved, but the final 48-Block run still recorded one 62 ms long task and a 66.7 ms maximum frame gap while drawing a cable.",
        "images": [("docs/assets/perf-probe-preview-audit-final-after.png", "Final state of the same stress board after all measured gestures.")],
        "actual": "One synthetic cable drag exceeded the 50 ms long-task threshold; sampled source time fell from 31 to 19 ms, so the remaining stall is not yet localized.",
        "expected": "Repeated runs should establish whether this is stable application work or headless/profiler variance before another optimization is attempted.",
        "repro": "Repeat node tests/perf_probe.mjs with 48 Blocks at least five times and compare the cable-drag profiler stacks.",
        "proof": "No speculative code change was made for this residual. Tunnel, connector, and workspace browser journeys remain green.",
        "seam": "tests/perf_probe.mjs · tldraw/React scheduling and connection-drop picker lifecycle",
        "acceptance": "Confirm a repeatable source stack before changing behavior, or close this item if unprofiled production runs do not reproduce the long task.",
    },
    {
        "id": "missing-diff-journeys",
        "priority": "P1",
        "kind": "Tooling",
        "status": "Open",
        "title": "Three committed npm scripts point to journey files that are not committed",
        "summary": "The diff-state, diff-vocabulary, and diff-round2 commands fail with MODULE_NOT_FOUND. Files with those names exist only as untracked work in the busy Preview checkout, so this audit did not copy or overwrite them.",
        "images": [("docs/assets/edge-vocabulary-4-dragged.png", "The nearest committed edge-vocabulary surface is covered; the newer diff journeys themselves are unavailable in this branch.")],
        "actual": "npm run test:diff-states, test:diff-vocabulary, or test:diff-round2 exits before opening a browser.",
        "expected": "Every committed package script resolves to a committed executable journey and is included in the release-readiness pass.",
        "repro": "npm run test:diff-states",
        "proof": "package.json names all three paths; none exists in committed main or this integrated branch. They remain deliberately untouched in /home/bam/systemsketch.",
        "seam": "package.json · tests/block_diff_*_smoke.mjs",
        "acceptance": "Commit the owning journey files (or remove stale scripts), then run all three successfully against an isolated board.",
    },
]


def issue_card(issue: dict) -> str:
    figures = "".join(
        f'<figure><img src="{data_uri(path)}" alt="{html.escape(issue["title"])} evidence"><figcaption>{html.escape(caption)}</figcaption></figure>'
        for path, caption in issue["images"]
    )
    fields = "".join(
        f'<div><dt>{label}</dt><dd>{html.escape(issue[key])}</dd></div>'
        for label, key in [
            ("Actual", "actual"), ("Expected", "expected"), ("Reproduce", "repro"),
            ("Verification", "proof"), ("Likely seam", "seam"), ("Acceptance", "acceptance"),
        ]
    )
    slug = issue["id"]
    return f'''
      <article class="issue" data-status="{issue['status'].lower()}" data-kind="{issue['kind'].lower()}">
        <header><div><span class="priority">{issue['priority']}</span><span class="kind">{html.escape(issue['kind'])}</span></div><span class="status">{issue['status']}</span></header>
        <h2>{html.escape(issue['title'])}</h2>
        <p class="summary">{html.escape(issue['summary'])}</p>
        <div class="evidence">{figures}</div>
        <dl>{fields}</dl>
        <div class="review"><label><input type="checkbox" data-review-check="{slug}"> Include in implementation follow-up</label><textarea data-review-note="{slug}" placeholder="Feedback, decision, or owner…"></textarea></div>
      </article>'''


implemented = sum(issue["status"] == "Implemented" for issue in ISSUES)
open_count = sum(issue["status"] == "Open" for issue in ISSUES)
unconfirmed = sum(issue["status"] == "Unconfirmed" for issue in ISSUES)
tooling = sum(issue["kind"] == "Tooling" for issue in ISSUES)
cards = "".join(issue_card(issue) for issue in ISSUES)

page = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch Preview regression audit · 2026-09-03</title>
<style>
:root{{--bg:#0b1020;--panel:#131b2f;--panel2:#17223b;--ink:#f5f7fb;--muted:#aeb9ce;--line:#2a3a59;--blue:#66a6ff;--green:#55d68b;--amber:#ffbd59;--red:#ff7373}}*{{box-sizing:border-box}}body{{margin:0;background:radial-gradient(circle at 20% 0,#17284c 0,transparent 34rem),var(--bg);color:var(--ink);font:15px/1.5 Inter,ui-sans-serif,system-ui,sans-serif}}main{{width:min(1240px,calc(100% - 32px));margin:auto;padding:48px 0 80px}}.eyebrow{{color:var(--blue);font-weight:800;letter-spacing:.12em;text-transform:uppercase}}h1{{font-size:clamp(34px,6vw,70px);line-height:.98;max-width:900px;margin:.25em 0}}.lede{{font-size:19px;color:var(--muted);max-width:880px}}.metrics{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:30px 0}}.metric{{background:linear-gradient(145deg,var(--panel2),var(--panel));border:1px solid var(--line);border-radius:16px;padding:18px}}.metric strong{{display:block;font-size:30px}}.metric span{{color:var(--muted)}}.toolbar{{position:sticky;top:10px;z-index:4;display:flex;flex-wrap:wrap;gap:9px;align-items:center;background:#10182be8;border:1px solid var(--line);border-radius:14px;padding:10px;margin:24px 0 28px;backdrop-filter:blur(12px)}}button,select{{border:1px solid #3a4c70;background:#17233e;color:var(--ink);border-radius:9px;padding:8px 11px;font:inherit}}button:hover{{border-color:var(--blue)}}.count{{color:var(--muted);margin-left:auto}}.issue{{background:linear-gradient(160deg,var(--panel),#0f1729);border:1px solid var(--line);border-radius:22px;padding:24px;margin:18px 0;box-shadow:0 16px 40px #0003}}.issue>header{{display:flex;justify-content:space-between;gap:12px}}.priority,.kind,.status{{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:4px 9px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.05em}}.priority{{color:var(--amber);margin-right:7px}}.status{{color:var(--green)}}[data-status="open"] .status{{color:var(--red)}}[data-status="unconfirmed"] .status{{color:var(--amber)}}h2{{font-size:26px;line-height:1.15;margin:15px 0 8px}}.summary{{color:var(--muted);font-size:17px;max-width:980px}}.evidence{{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:14px;margin:20px 0}}figure{{margin:0;border:1px solid var(--line);background:#090e19;border-radius:14px;overflow:hidden}}figure img{{display:block;width:100%;height:330px;object-fit:contain;background:#f4f5f7}}figcaption{{padding:11px 13px;color:var(--muted);font-size:13px}}dl{{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:18px 0}}dl>div{{background:#0d1425;border:1px solid #22314d;border-radius:11px;padding:12px}}dt{{color:var(--blue);font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.07em}}dd{{margin:5px 0 0}}.review{{display:grid;grid-template-columns:280px 1fr;gap:12px;align-items:start;border-top:1px solid var(--line);padding-top:16px}}.review label{{font-weight:700}}textarea{{width:100%;min-height:76px;resize:vertical;border:1px solid #3a4c70;background:#0a1120;color:var(--ink);border-radius:10px;padding:10px;font:inherit}}.note{{border-left:4px solid var(--amber);background:#1d1a18;padding:16px 18px;border-radius:9px;color:#f5dfbd;margin:20px 0}}footer{{margin-top:36px;color:var(--muted)}}a{{color:#8fc0ff}}@media(max-width:760px){{.metrics{{grid-template-columns:1fr 1fr}}dl{{grid-template-columns:1fr}}.review{{grid-template-columns:1fr}}figure img{{height:240px}}.count{{width:100%;margin:0}}}}
</style></head><body><main>
<div class="eyebrow">SystemSketch · Preview audit · 2026-09-03</div>
<h1>Seven findings across saved-board safety, drag performance, and release coverage.</h1>
<p class="lede">Audited the latest committed Preview merge snapshot, reconciled it with current <code>main</code>, profiled a 116-shape board, parsed every committed review fixture, and drove the affected UI in real headless Chrome. Fixes remain isolated from the busy user checkout.</p>
<section class="metrics">
 <div class="metric"><strong>{implemented}</strong><span>implemented + verified</span></div>
 <div class="metric"><strong>{measurements['selectAllDrag']['busyReductionPercent']}%</strong><span>select-all busy-time reduction</span></div>
 <div class="metric"><strong>80 / 80</strong><span>review boards parse</span></div>
 <div class="metric"><strong>{open_count} + {unconfirmed}</strong><span>open + unconfirmed</span></div>
</section>
<div class="note"><strong>Scope boundary.</strong> The live Preview checkout contains extensive user/peer edits and untracked diff journeys. This audit used committed source plus current committed main, never Zach's real board, and did not copy or overwrite peer-owned work.</div>
<div class="toolbar"><label for="filter">Show</label><select id="filter"><option value="all">All findings</option><option value="implemented">Implemented</option><option value="open">Open</option><option value="unconfirmed">Unconfirmed</option><option value="tooling">Tooling</option></select><button id="check-visible">Check visible</button><button id="reset">Reset review</button><button id="copy">Copy Markdown</button><span class="count">{open_count} open · {implemented} implemented · {unconfirmed} unconfirmed · {tooling} tooling</span></div>
<section id="issues">{cards}</section>
<footer>Measured facts: <a href="assets/preview-regression-audit-measurements-2026-09-03.json">concise sidecar</a> · <a href="assets/perf-probe-preview-audit-2964.json">baseline trace</a> · <a href="assets/perf-probe-preview-audit-final.json">final trace</a>. Review state stays only in this browser's localStorage.</footer>
</main><script>
const key='systemsketch.preview-regression-audit.2026-09-03';
const cards=[...document.querySelectorAll('.issue')];
const save=()=>{{const value={{}};cards.forEach(card=>{{const id=card.querySelector('input').dataset.reviewCheck;value[id]={{checked:card.querySelector('input').checked,note:card.querySelector('textarea').value}}}});localStorage.setItem(key,JSON.stringify(value))}};
const load=()=>{{const value=JSON.parse(localStorage.getItem(key)||'{{}}');cards.forEach(card=>{{const id=card.querySelector('input').dataset.reviewCheck;card.querySelector('input').checked=!!value[id]?.checked;card.querySelector('textarea').value=value[id]?.note||''}})}};load();
document.addEventListener('input',save);document.addEventListener('change',save);
document.querySelector('#filter').addEventListener('change',e=>{{cards.forEach(card=>{{const f=e.target.value;card.hidden=!(f==='all'||card.dataset.status===f||(f==='tooling'&&card.dataset.kind==='tooling'))}})}});
document.querySelector('#check-visible').onclick=()=>{{cards.filter(c=>!c.hidden).forEach(c=>c.querySelector('input').checked=true);save()}};
document.querySelector('#reset').onclick=()=>{{localStorage.removeItem(key);cards.forEach(c=>{{c.querySelector('input').checked=false;c.querySelector('textarea').value=''}})}};
const copyText=async text=>{{try{{await navigator.clipboard.writeText(text)}}catch{{const area=document.createElement('textarea');area.value=text;document.body.append(area);area.select();document.execCommand('copy');area.remove()}}}};
document.querySelector('#copy').onclick=async()=>{{const lines=['# Preview regression audit follow-up',''];cards.forEach(card=>{{const box=card.querySelector('input'),note=card.querySelector('textarea').value.trim();lines.push(`- [${{box.checked?'x':' '}}] ${{card.querySelector('h2').textContent}}${{note?` — ${{note}}`:''}}`)}});await copyText(lines.join('\\n'));document.querySelector('#copy').textContent='Copied';setTimeout(()=>document.querySelector('#copy').textContent='Copy Markdown',1200)}};
</script></body></html>'''

OUTPUT.write_text(page, encoding="utf-8")
print(OUTPUT)
print(MEASUREMENTS)
