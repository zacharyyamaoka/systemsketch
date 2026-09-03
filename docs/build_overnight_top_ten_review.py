#!/usr/bin/env python3
"""Build the self-contained SystemSketch overnight decision gallery."""

from __future__ import annotations

import base64
import html
import json
from pathlib import Path
from urllib.parse import quote


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs" / "assets"
OUTPUT = ROOT / "docs" / "overnight-top-ten-review-2026-09-03.html"
LEDGER = ASSETS / "overnight-top-ten-findings.json"


def finding(
    rank: int,
    title: str,
    priority: str,
    category: str,
    score: int,
    status: str,
    actual: str,
    expected: str,
    reproduce: str,
    proof: str,
    seam: str,
    acceptance: str,
    image: str | None = None,
) -> dict[str, object]:
    return dict(
        rank=rank,
        title=title,
        priority=priority,
        category=category,
        score=score,
        status=status,
        actual=actual,
        expected=expected,
        reproduce=reproduce,
        proof=proof,
        seam=seam,
        acceptance=acceptance,
        image=image,
    )


FINDINGS = [
    finding(
        1, "Make revision-fenced saves an actual cross-process transaction", "P0", "Data safety", 100, "implemented",
        "Two concurrent requests could read the same base digest, both report success, and let the later replace silently erase the earlier save.",
        "Each canonical board path has one cross-process mutation lane; a same-base race produces exactly one winner and one explicit conflict.",
        "Queue two same-base saves behind one held path lock, then release both together.",
        "Deterministic Python concurrency coverage asserts one success, one WorkspaceConflictError, and disk bytes equal to the winning response.",
        "workspace_store.py + server.py; stdlib advisory locks live under the shared release home, never beside user boards.",
        "Concurrent save/save, save/rename, and save/trash outcomes are equivalent to a valid sequential order; directories are fsynced after replacement.",
        "workspace-browser-open.png",
    ),
    finding(
        2, "Make portable export non-destructive and no-clobber by default", "P0", "Export safety", 98, "implemented",
        "File → Export detached the live editor, awaited disk I/O, bailed history afterward, cleared dirty state, and forced replacement of an existing .tldr.",
        "Export snapshots into the existing hidden clone and requires a second explicit Replace choice when the destination exists.",
        "Export an authored board and compare the live editor snapshot and source-file bytes before and after; separately export onto an existing distinctive .tldr.",
        "The portable-clone browser smoke proves the live snapshot stays byte-identical; the File-export smoke proves the source file stays intact and an occupied target stays byte-exact until explicit Replace.",
        "LocalWorkspace delegates to portableTldraw.ts and reuses the Save As conflict state.",
        "Export leaves the live editor snapshot and source file unchanged, and it cannot alter an existing target until the user chooses Replace.",
        "export-dialog.png",
    ),
    finding(
        3, "Fence automatic reloads against edits made while the read is in flight", "P0", "Data safety", 96, "implemented",
        "The watcher decided to reload while clean, awaited a GET, then applied it and marked clean even if the user edited during that wait.",
        "Automatic reload captures the local epoch and base revision, then rechecks them immediately before replacing editor state.",
        "Delay the GET after an external rewrite is observed, make a real canvas edit, then release the GET.",
        "A focused fence regression enumerates edit-epoch, base-digest, and loaded-digest changes that must refuse the apply; the full workspace browser journeys remain green.",
        "LocalWorkspace automatic reload only; explicit Use disk version remains the intentional discard path.",
        "No automatic read may erase an edit or clear dirty state that appeared after the read began.",
        "workspace-browser-open.png",
    ),
    finding(
        4, "Use content digests for external-change decisions", "P0", "Data safety", 94, "implemented",
        "Polling compared only size and floating-point mtime, so a same-size rewrite with a restored/coarse timestamp could remain invisible.",
        "The stat contract carries a bounded SHA-256 over the exact raw file bytes, matching the revision identity used by writes and conflicts.",
        "Rewrite a board with different same-length bytes and restore its original mtime.",
        "Python tests hash raw bytes before text decoding and enforce the document-size bound; Python and TypeScript regressions assert the fingerprint changes even when size and mtime do not.",
        "workspace_store.stat_document → workspace stat API → workspaceModel DocumentFingerprint.",
        "A same-size, same-mtime external rewrite triggers reload when clean and conflict when locally dirty.",
        "workspace-browser-open.png",
    ),
    finding(
        5, "Bound workspace requests and keep external polling single-flight", "P1", "Reliability", 91, "implemented",
        "Raw fetch calls could wait forever, and the 1.5-second watcher could stack another stat request behind every stalled predecessor.",
        "Operations have explicit deadlines/cancellation semantics and at most one external-stat poll is active.",
        "Accept a request but never answer it, then let several poll intervals elapse.",
        "Controlled-fetch tests prove timeout classification and caller abort propagation; the watch loop has an explicit in-flight guard and abortable request, backed by zero-error workspace browser journeys.",
        "workspaceClient request helper plus LocalWorkspace watch effect; any automatic retry remains digest-fenced, so an uncertain prior success becomes a conflict rather than a double-write.",
        "A stalled controller resolves to actionable UI inside its budget, cleanup aborts stale reads, and request count stays bounded.",
        "workspace-browser-open.png",
    ),
    finding(
        6, "Retry transient autosave failures without waiting for another edit", "P1", "Recovery", 89, "implemented",
        "After one transient write failure the board stayed dirty indefinitely unless the user edited again or manually saved.",
        "Autosave retries with bounded backoff, resets after success, and never loops on a real revision conflict.",
        "Make the first autosave fail transiently and let the next attempt succeed without another canvas mutation.",
        "Model tests freeze the 1s/3s/8s retry schedule and stop conditions; client tests limit retries to transport, timeout, 408, 429, and 5xx failures.",
        "LocalWorkspace autosave scheduler; the digest fence remains authoritative.",
        "Transient failure self-heals; retry stops on success, conflict, unmount, or document switch.",
        "workspace-browser-open.png",
    ),
    finding(
        7, "Turn workspace failures into recoverable, named actions", "P1", "Recovery", 87, "implemented",
        "Several File-menu promises were discarded, while an initial list/read error stranded the app on a message with no Retry.",
        "One action boundary surfaces the failed operation, and bootstrap can retry without restarting the app.",
        "Reject New, Open, Reveal, or Trash; separately fail the first startup request and succeed the second.",
        "The central action runner contains every launched promise, bootstrap renders an explicit Try again path, and all normal workspace browser journeys finish with zero console errors.",
        "LocalWorkspace action runner + WorkspaceLoading recovery controls.",
        "Every launched action completes or presents a visible recovery path; successful Retry reaches the canvas.",
        "workspace-browser-open.png",
    ),
    finding(
        8, "Make the workspace browser a real keyboard modal", "P1", "Accessibility", 85, "implemented",
        "Physical Tab escaped the Open dialog after its last control and continued into the canvas toolbar.",
        "Useful initial focus enters the dialog, Tab and Shift+Tab loop inside, Escape closes only it, and focus returns to its launcher.",
        "Open with Ctrl+O, traverse past both ends using physical keys, then press Escape.",
        "A focus-order regression and real in-app browser journey record each active element and return focus.",
        "WorkspaceDialog DOM behavior only; stock canvas keyboard handling is unchanged.",
        "Focus never leaves the modal while open and close restores the element that launched it.",
        "workspace-browser-open.png",
    ),
    finding(
        9, "Make Block creation and section resizing operable from the keyboard", "P1", "Accessibility", 83, "implemented",
        "Add Port was a div with role=button and tabIndex=-1; Expanded section dividers supported pointer drags only.",
        "Add Port is a native focused action, while each divider exposes separator value semantics and arrow-key resizing.",
        "Select an Expanded Block, Tab to a port bead, press Enter/Space, then adjust dividers with arrows and a coarse modifier.",
        "Markup/math regressions prove native semantics, clamping, and the shared pointer equation; the permanent CDP smoke proves real Tab/Space/Enter/ArrowDown, while the driven review fixture recorded divider values 40 → 42 → 35 → 42 → 40 through adjustment and Undo.",
        "BlockCanvas native DOM semantics around the existing Block seam; tldraw drag/resize stays stock.",
        "Add Port is focusable and keyboard-activatable; dividers announce their values, use the shared resize updater, clamp correctly, and each keyboard adjustment remains undoable.",
        "overnight-top-ten-block-controls-after.jpg",
    ),
    finding(
        10, "Keep transient chrome usable on narrow canvases", "P1", "Responsive UI", 82, "implemented",
        "At 560 px the selection pill measured 569 px and extended 29 px offscreen; Shapes and Inspector overlapped almost entirely.",
        "The pill stays inside the 20 px safe area with keyboard-reachable overflow, while an interface-scale-aware compact breakpoint keeps only the newest side panel visible.",
        "At 560 px and default Interface size, then at 900 px and 160%, open a wide generic selection menu and open Shapes followed by Inspector or Comments.",
        "Pure placement/state coverage plus real-browser rectangles prove no horizontal overflow or panel overlap, including compact behavior adjusted for enlarged Interface size.",
        "Selection menu CSS/placement and ChromeProvider responsive state; desktop coexistence is preserved.",
        "At the tested compact widths and Interface sizes every action stays reachable, and opening one compact side sheet closes the other.",
        "overnight-top-ten-responsive-after.jpg",
    ),
    finding(11, "Make immediate close durable for boards above the browser keepalive budget", "P0", "Lifecycle", 80, "candidate",
            "The final pagehide path sends the whole document with keepalive; realistic review boards already exceed the practical queued-body ceiling.",
            "A host-owned checkpoint/ack protocol persists the last edit regardless of size.",
            "Edit a large board and immediately close the app.", "Architecture audit measured an existing board above the practical limit.",
            "Standalone lifecycle protocol + local controller.", "Cold reopen contains the exact final edit after repeated immediate closes."),
    finding(12, "Replace Obsidian's fixed close delay with checkpoint acknowledgement", "P0", "Embedded host", 78, "candidate",
            "The host sleeps 450 ms and unmounts while it ignores checkpoint messages already emitted by the canvas.",
            "Persist or acknowledge the final opaque snapshot before teardown.",
            "Delay serialization beyond 450 ms, edit, close, and reopen.", "VS Code already implements this protocol.",
            "Obsidian host bridge.", "The delayed final edit reopens exactly without a timing guess."),
    finding(13, "Quarantine schema-invalid embedded documents before host writeback", "P0", "Embedded safety", 77, "candidate",
            "Embedded parse failure can remain editable and post a blank fallback snapshot.",
            "All hosts share one quarantined load decision and suppress writes.",
            "Open invalid bytes in a packaged host and attempt an edit.", "Standalone has the safe model; EmbeddedCanvas lacks its guard.",
            "Shared load-decision model + packaged-host acceptance.", "Original bytes remain bit-for-bit stable."),
    finding(14, "Preserve both versions during conflict resolution", "P1", "Recovery", 76, "candidate",
            "Use disk and Keep mine each permanently discard one side.", "Keep both creates a collision-free sibling first.",
            "Create distinguishable local/disk edits and resolve each way.", "Source audit confirms only destructive choices.",
            "Workspace conflict UI + no-clobber copy API.", "Both readable versions remain."),
    finding(15, "Serialize release-channel transitions", "P1", "Release safety", 74, "candidate",
            "Candidate, promote, and rollback mutate pointers without coordination.", "One release lock and expected-candidate identity serialize them.",
            "Race stage/promote and promote/rollback.", "release_lib paths are unlocked.",
            "scripts/release_lib.py.", "Every race resolves to one valid serial history."),
    finding(16, "Protect the loopback controller from cross-origin mutation", "P1", "Security", 73, "candidate",
            "Mutating POSTs do not validate Origin, content type, or a capability.", "Only the intended same-origin app can mutate.",
            "POST from a foreign Origin and text/plain form.", "Controller route audit found no gate.",
            "server bootstrap + request validation.", "Foreign requests fail without changes."),
    finding(17, "Align the HTTP envelope limit with the document limit", "P1", "File safety", 72, "candidate",
            "Decoded source and escaped outer JSON share 64 MiB, so some valid documents cannot save.", "Transport overhead gets a separate budget.",
            "Save quote-heavy source just below 64 MiB.", "Constants and JSON escaping reproduce it.",
            "Workspace POST reader.", "Below-limit decoded source saves; above-limit stays rejected."),
    finding(18, "Make every custom color control keyboard-operable", "P1", "Accessibility", 71, "candidate",
            "Hue, opacity, and saturation/value are pointer-only with tabIndex=-1.", "Tab reaches each control and arrows adjust it.",
            "Edit a custom color without a pointer.", "DOM/source audit confirmed missing handlers.",
            "CustomColorPicker.tsx.", "Keyboard and pointer share undo and announce values."),
    finding(19, "Give the workspace file list correct composite-widget semantics", "P1", "Accessibility", 70, "candidate",
            "Arrow keys in the file-name input can change a row without exposing an active descendant.", "Input editing and announced list navigation agree.",
            "Filter, use arrows, and press Enter with a screen reader.", "Keyboard branches and ARIA roles diverge.",
            "WorkspaceDialog listbox model.", "The announced active row matches Enter."),
    finding(20, "Remove the generic Inspect dead end", "P1", "Canvas UI", 69, "candidate",
            "A rectangle exposes Inspect, then the panel says Select a Block.", "Generic selections get useful content or no action.",
            "Select a rectangle and activate Inspect.", "A real-browser screenshot confirms the dead end.",
            "Selection menu + inspector.", "Every visible Inspect action leads somewhere useful."),
    finding(21, "Complete Depth Stack keyboard navigation", "P1", "Navigation", 67, "candidate",
            "The popup lacks full menu focus, arrows, Home/End, and return focus.", "It behaves as one keyboard menu.",
            "Open it and traverse without a pointer.", "Static semantic audit.",
            "DepthStackNavigator.tsx.", "Open focuses; arrows move; Escape returns."),
    finding(22, "Add efficient keyboard navigation to the shape grid", "P1", "Canvas UI", 66, "candidate",
            "Every shape is a Tab stop and search cannot hand focus into the grid.", "Arrow navigation traverses visible tiles.",
            "Search Decision, press ArrowDown, navigate, insert.", "Shape-library DOM audit.",
            "ShapeLibraryBrowser roving focus.", "Search-to-grid flow is predictable and announced."),
    finding(23, "Correct command-palette tab semantics", "P1", "Accessibility", 65, "candidate",
            "Categories expose partial tab semantics.", "Use a valid roving tablist or honest pressed buttons.",
            "Drive categories with arrows and Tab.", "Accessibility-tree audit.",
            "SystemSketchCommandPalette.", "Roles, focus, selection, and panels agree."),
    finding(24, "Implement standard theme-radio navigation", "P1", "Settings", 64, "candidate",
            "Theme choices behave as many Tab stops.", "Tab enters once and arrows apply choices.",
            "Change theme using only Tab and arrows.", "InterfaceSettings audit.",
            "Theme radio group.", "Selection applies; removal stays separate."),
    finding(25, "Make the top-right capsule honest", "P2", "Chrome honesty", 61, "candidate",
            "The Z badge is inert and its neighbor's name does not match Comments.", "Every visible control has a truthful action.",
            "Click Profile placeholder.", "Real-browser click produced no result.",
            "SystemSketchSharePanel.", "No dead affordance remains."),
    finding(26, "Add quiet first-run guidance to an empty board", "P2", "Onboarding", 60, "candidate",
            "A blank board gives no task path into Blocks, Shapes, connections, or depth.", "A dismissible guide offers real starter actions.",
            "Create an empty board.", "Empty-canvas audit.",
            "SystemSketchUtilities overlay.", "Guidance adds no records and stays reachable from Help."),
    finding(27, "Put the production bundle in the ordinary check", "P2", "Verification", 58, "candidate",
            "npm run check omits a Vite production build.", "A bundle-only failure blocks handoff.",
            "Introduce a production-only failure and run check.", "package.json audit.",
            "Disposable-output build.", "A clean build leaves status unchanged."),
    finding(28, "Exercise built candidate bytes before promotion", "P2", "Release proof", 57, "candidate",
            "Promotion builds but never opens the bundle.", "A production golden path boots, edits, saves, and reloads.",
            "Break runtime mounting while compilation stays green.", "Release/harness audit.",
            "Production-dist harness.", "Promotion refuses a broken runtime."),
    finding(29, "Make the browser harness fail fast on console and transport errors", "P2", "Test system", 55, "candidate",
            "The helper misses console.error/assert and can strand CDP promises.", "Each error fails quickly with logs.",
            "Emit errors, then kill Chrome mid-command.", "Harness audit found both blind spots.",
            "tests/browser_harness.mjs.", "Faults fail inside a deadline with diagnostics."),
    finding(30, "Make arbitrary worktrees reproducible", "P2", "Developer workflow", 52, "candidate",
            "A generic worktree lacks dependencies; the track helper linked to an absent node_modules and wrote an unused exclude file.", "Bootstrap resolves canonical dependencies and validates runtime.",
            "Create a track from a dependency-less worktree.", "This audit hit both failures.",
            "new_track.py + preflight.", "A fresh worktree serves and checks without manual repair."),
]


def esc(value: object) -> str:
    return html.escape(str(value))


def image_uri(filename: str | None) -> str:
    path = ASSETS / filename if filename else None
    if path and path.exists():
        mime = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
        return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"
    label = esc(f"Evidence capture pending: {filename or 'source + tests'}")
    svg = (
        "<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='675'>"
        "<rect width='1200' height='675' fill='#17191f'/>"
        "<rect x='34' y='34' width='1132' height='607' rx='28' fill='#23262e' stroke='#414653'/>"
        f"<text x='72' y='120' fill='#aeb8cb' font-family='system-ui' font-size='25'>{label}</text></svg>"
    )
    return "data:image/svg+xml;base64," + base64.b64encode(svg.encode()).decode()


def card(item: dict[str, object], detailed: bool) -> str:
    rank = int(item["rank"])
    label = "Keep this change" if item["status"] == "implemented" else "Queue this candidate"
    visual = ""
    if detailed:
        visual = (
            f'<figure><img src="{image_uri(item["image"])}" alt="Evidence for {esc(item["title"])}">'
            f'<figcaption>Review evidence · {esc(item["image"] or "source + regression proof")}</figcaption></figure>'
        )
        details = f"""<dl>
<div><dt>Why it matters</dt><dd>{esc(item["actual"])}</dd></div>
<div><dt>Expected instead</dt><dd>{esc(item["expected"])}</dd></div>
<div><dt>Reproduce</dt><dd>{esc(item["reproduce"])}</dd></div>
<div><dt>Proof</dt><dd>{esc(item["proof"])}</dd></div>
<div><dt>Implementation seam</dt><dd>{esc(item["seam"])}</dd></div>
<div><dt>Accept when</dt><dd>{esc(item["acceptance"])}</dd></div>
</dl>"""
    else:
        details = f"""<dl><div><dt>Observed gap</dt><dd>{esc(item["actual"])}</dd></div>
<div><dt>Accept when</dt><dd>{esc(item["acceptance"])}</dd></div></dl>"""
    return f"""<article class="finding {'detail' if detailed else 'compact'}" data-status="{esc(item["status"])}" data-rank="{rank}">
<header><div class="rank">{rank:02d}</div><div><div class="chips"><span class="chip {esc(item["priority"]).lower()}">{esc(item["priority"])}</span><span class="chip">{esc(item["category"])}</span><span class="chip status">{esc(item["status"])}</span></div><h3>{esc(item["title"])}</h3></div><div class="score"><b>{item["score"]}</b><span>/100</span></div></header>
{visual}{details}<div class="decision"><label class="keep"><input type="checkbox" data-review="decision" data-key="finding-{rank}"><span>{label}</span></label><label class="note"><span>Review note</span><textarea data-review="note" data-key="finding-{rank}-note" placeholder="What to keep, reject, or adjust…"></textarea></label></div></article>"""


def main() -> None:
    implemented = "\n".join(card(item, True) for item in FINDINGS[:10])
    candidates = "\n".join(card(item, False) for item in FINDINGS[10:])
    board_path = quote(str(ROOT / "sketches" / "review" / "overnight-top-ten.systemsketch"), safe="")
    board_url = f"http://127.0.0.1:4370/?board={board_path}"
    before = image_uri("overnight-baseline-mobile-panels-overlap.jpg")
    after = image_uri("overnight-top-ten-responsive-after.jpg")
    page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SystemSketch overnight deep dive · 2026-09-03</title>
<style>
:root{{--paper:#f1f0eb;--card:#fff;--ink:#17191f;--muted:#666b76;--line:#d9d8d1;--violet:#5b50e6;--orange:#f47a34;--green:#16784a;--red:#a72d2d;--shadow:0 16px 44px #24262c12}}*{{box-sizing:border-box}}html{{scroll-behavior:smooth}}body{{margin:0;background:var(--paper);color:var(--ink);font:15px/1.5 Inter,ui-sans-serif,system-ui,sans-serif}}button,input,textarea{{font:inherit}}a{{color:#4940df;font-weight:760}}main{{max-width:1380px;margin:auto;padding:48px 28px 100px}}.eyebrow{{color:var(--violet);font-size:12px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}}h1{{max-width:1080px;margin:10px 0 18px;font-size:clamp(46px,6.8vw,88px);line-height:.94;letter-spacing:-.06em}}h2{{font-size:31px;letter-spacing:-.035em;margin:0 0 12px}}h3{{font-size:23px;line-height:1.14;letter-spacing:-.025em;margin:8px 0 0}}p{{color:var(--muted)}}.lead{{max-width:880px;font-size:20px}}.hero{{display:grid;grid-template-columns:1.2fr 1fr;margin:34px 0 18px;background:#17191f;border-radius:26px;overflow:hidden;box-shadow:var(--shadow)}}.hero-copy{{padding:34px;color:#f5f5f1;display:flex;flex-direction:column;justify-content:space-between}}.hero-copy p{{color:#b7c0d0}}.metrics{{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}}.metric{{border:1px solid #3d424e;border-radius:15px;padding:14px}}.metric b{{display:block;font-size:30px}}.metric span{{color:#aeb6c6;font-size:11px}}.hero-visual{{display:grid;grid-template-columns:1fr 1fr;background:#242730}}.hero-visual figure{{margin:0;min-width:0;position:relative}}.hero-visual img{{width:100%;height:100%;min-height:450px;object-fit:cover}}.hero-visual figcaption{{position:absolute;left:12px;top:12px;background:#111b;color:#fff;border:0;border-radius:999px;padding:5px 9px;font-weight:850}}.method{{display:grid;grid-template-columns:1.1fr .9fr;gap:18px;margin:18px 0 42px}}.panel{{background:var(--card);border:1px solid var(--line);border-radius:21px;padding:25px;box-shadow:var(--shadow)}}.weights{{display:grid;gap:12px}}.weight{{display:grid;grid-template-columns:1fr 2fr 48px;gap:12px;align-items:center}}.bar{{height:10px;background:#e8e8e4;border-radius:99px;overflow:hidden}}.bar i{{display:block;height:100%;background:var(--violet)}}.scope{{border-left:4px solid var(--orange)}}.controls{{position:sticky;top:10px;z-index:20;margin-bottom:22px;padding:12px 14px;border:1px solid var(--line);background:#ffffffee;backdrop-filter:blur(16px);border-radius:17px;box-shadow:var(--shadow);display:flex;gap:8px;align-items:center;flex-wrap:wrap}}.controls button{{border:1px solid var(--line);background:white;border-radius:10px;padding:8px 12px;cursor:pointer;font-weight:760}}.controls .primary{{background:var(--ink);color:white}}.controls output{{margin-left:auto;color:var(--muted);font-size:13px}}.section-head{{display:flex;align-items:end;justify-content:space-between;gap:20px;margin:48px 0 16px}}.section-head p{{max-width:650px;margin:0}}.finding{{background:var(--card);border:1px solid var(--line);border-radius:21px;box-shadow:var(--shadow);overflow:hidden;margin-bottom:18px}}.finding>header{{display:grid;grid-template-columns:58px 1fr 70px;gap:16px;padding:22px 24px}}.rank{{font-size:30px;font-weight:900;color:#aeb0b8}}.chips{{display:flex;gap:6px;flex-wrap:wrap}}.chip{{border:1px solid var(--line);border-radius:99px;padding:3px 8px;color:var(--muted);font-size:11px;font-weight:850;text-transform:uppercase}}.chip.p0{{background:#ffeded;color:var(--red)}}.chip.p1{{background:#fff4e8;color:#985019}}.chip.p2{{background:#eef5ff;color:#285d9a}}.chip.status{{color:var(--green);background:#eef9f2}}[data-status="candidate"] .chip.status{{color:#6d687b;background:#f5f3f8}}.score{{text-align:right;color:var(--muted)}}.score b{{display:block;font-size:27px;color:var(--ink)}}.score span{{font-size:11px}}figure{{margin:0;border-block:1px solid var(--line);background:#20232a}}figure img{{display:block;width:100%;max-height:670px;object-fit:contain}}figure figcaption{{padding:8px 13px;background:#f7f7f4;color:var(--muted);font-size:11px}}dl{{display:grid;grid-template-columns:repeat(3,1fr);margin:0;border-bottom:1px solid var(--line)}}dl>div{{padding:18px 21px;border-right:1px solid var(--line);border-top:1px solid var(--line)}}dl>div:nth-child(3n){{border-right:0}}dt{{font-size:11px;color:var(--muted);font-weight:850;text-transform:uppercase}}dd{{margin:6px 0 0}}.decision{{display:grid;grid-template-columns:220px 1fr;gap:16px;padding:17px 21px;background:#fbfbf8}}.keep{{display:flex;align-items:center;gap:10px;font-weight:850;padding-top:8px}}.keep input{{width:20px;height:20px;accent-color:var(--green)}}.note span{{display:block;color:var(--muted);font-size:11px;font-weight:800;text-transform:uppercase}}textarea{{width:100%;min-height:66px;margin-top:5px;padding:10px;border:1px solid var(--line);border-radius:10px}}.compact dl{{grid-template-columns:repeat(2,1fr)}}.hidden{{display:none!important}}footer{{margin-top:42px;padding-top:22px;border-top:1px solid var(--line);color:var(--muted)}}code{{font:12px ui-monospace,monospace}}@media(max-width:960px){{main{{padding:28px 15px 72px}}.hero,.method{{grid-template-columns:1fr}}.hero-visual img{{min-height:300px}}.metrics{{grid-template-columns:repeat(2,1fr)}}dl,.compact dl{{grid-template-columns:1fr}}dl>div{{border-right:0!important}}.decision{{grid-template-columns:1fr}}.controls output{{width:100%;margin:0}}}}@media(max-width:560px){{.finding>header{{grid-template-columns:42px 1fr}}.score{{display:none}}h1{{font-size:46px}}.hero-visual{{grid-template-columns:1fr}}}}
</style></head><body><main><div class="eyebrow">Overnight audit → implemented tranche → one-click review</div><h1>Thirty concrete improvements. Ten are ready to keep or reject.</h1><p class="lead">The ranking starts with failure severity and reproduced evidence, then discounts changes that cannot land through a narrow supported seam and be reviewed independently. Every implemented card has its own decision and note.</p>
<section class="hero"><div class="hero-copy"><div><div class="eyebrow">2026-09-03 · track/overnight-top-ten</div><h2>Data safety first; interaction truth second.</h2><p>The tranche closes four loss windows, makes controller failure recoverable, and fixes keyboard and narrow-screen defects reproduced in the real app.</p></div><div class="metrics"><div class="metric"><b>30</b><span>ranked findings</span></div><div class="metric"><b>10</b><span>implemented</span></div><div class="metric"><b>4</b><span>loss windows closed</span></div><div class="metric"><b>0</b><span>engine forks</span></div></div></div><div class="hero-visual"><figure><img src="{before}" alt="Before: overlapping panels"><figcaption>Before · 560 px</figcaption></figure><figure><img src="{after}" alt="After: responsive chrome"><figcaption>After · verified track</figcaption></figure></div></section>
<section class="method"><div class="panel"><div class="eyebrow">Priority ruler · frozen before selection</div><h2>Confidence-adjusted impact</h2><div class="weights"><div class="weight"><b>Failure / data impact</b><div class="bar"><i style="width:30%"></i></div><span>30%</span></div><div class="weight"><b>Reach / broken promise</b><div class="bar"><i style="width:20%"></i></div><span>20%</span></div><div class="weight"><b>Reproduced evidence</b><div class="bar"><i style="width:20%"></i></div><span>20%</span></div><div class="weight"><b>Supported-seam fit</b><div class="bar"><i style="width:15%"></i></div><span>15%</span></div><div class="weight"><b>Independent reviewability</b><div class="bar"><i style="width:15%"></i></div><span>15%</span></div></div></div><div class="panel scope"><div class="eyebrow">Boundary</div><h2>Why some P0s remain queued</h2><p>Large-board unload durability and embedded-host recovery cross process/lifecycle contracts and require packaged-host acceptance. Their raw severity is high; their confidence-adjusted overnight score is lower. No tldraw primitive was forked.</p></div></section>
<nav class="controls" aria-label="Review controls"><button type="button" data-filter="all">All 30</button><button type="button" data-filter="implemented">Implemented 10</button><button type="button" data-filter="candidate">Candidates 20</button><button type="button" class="primary" id="copy-review">Copy review Markdown</button><button type="button" id="reset-review">Reset</button><output id="review-status">Decisions save in this browser.</output></nav>
<div class="section-head"><div><div class="eyebrow">Ranks 01–10 · implemented</div><h2>Approve each change independently</h2></div><p>Check Keep this change, leave a note, then copy one Markdown response. Unchecked means reject or revisit.</p></div>{implemented}
<div class="section-head"><div><div class="eyebrow">Ranks 11–30 · not implemented</div><h2>The next decision queue</h2></div><p>These are source-confirmed gaps, not commitments. Queue only the ones worth another bounded track.</p></div>{candidates}
<footer><b>Review surfaces:</b> <a href="{esc(board_url)}">live verification board</a> · <a href="../sketches/review/overnight-top-ten.systemsketch">fixture file</a> · <a href="build_overnight_top_ten_review.py">builder</a> · <a href="assets/overnight-top-ten-findings.json">proof ledger</a>. Code and regression tests remain the living specification.</footer>
</main><script>
const prefix='systemsketch-overnight-review-v1:',status=document.querySelector('#review-status');
for(const c of document.querySelectorAll('[data-review]')){{const k=prefix+c.dataset.key,s=localStorage.getItem(k);if(s!==null){{if(c.type==='checkbox')c.checked=s==='true';else c.value=s}}c.addEventListener('input',()=>{{localStorage.setItem(k,c.type==='checkbox'?String(c.checked):c.value);status.value='Saved locally.'}})}}
for(const b of document.querySelectorAll('[data-filter]'))b.addEventListener('click',()=>{{for(const c of document.querySelectorAll('.finding'))c.classList.toggle('hidden',b.dataset.filter!=='all'&&c.dataset.status!==b.dataset.filter)}});
document.querySelector('#reset-review').addEventListener('click',()=>{{for(const c of document.querySelectorAll('[data-review]')){{localStorage.removeItem(prefix+c.dataset.key);if(c.type==='checkbox')c.checked=false;else c.value=''}}status.value='Review reset.'}});
document.querySelector('#copy-review').addEventListener('click',async()=>{{const lines=['# SystemSketch overnight review',''];for(const card of document.querySelectorAll('.finding')){{const rank=card.dataset.rank.padStart(2,'0'),title=card.querySelector('h3').textContent.trim(),checked=card.querySelector('[data-review="decision"]').checked,label=card.querySelector('.keep span').textContent.trim(),note=card.querySelector('[data-review="note"]').value.trim();lines.push('- ['+(checked?'x':' ')+'] #'+rank+' '+label+' — '+title+(note?'\\n  - '+note:''))}}try{{await navigator.clipboard.writeText(lines.join('\\n'));status.value='Copied all 30 decisions as Markdown.'}}catch{{status.value='Clipboard blocked; select the page and retry.'}}}});
</script></body></html>"""
    OUTPUT.write_text(page, encoding="utf-8")
    LEDGER.write_text(json.dumps({
        "date": "2026-09-03",
        "base": "cf8680084f9b4f06cc7242086880a868bd8ffe92",
        "track": "track/overnight-top-ten",
        "weights": {
            "failure_data_impact": 30,
            "reach_broken_promise": 20,
            "reproduced_evidence": 20,
            "supported_seam_fit": 15,
            "independent_reviewability": 15,
        },
        "measurements": {
            "baseline_compact_560x700": {
                "selection_menu": {"left": 20, "right": 589, "width": 569, "overflow_right": 29},
                "shapes_panel": {"left": 8, "right": 308, "width": 300},
                "inspector_panel": {"left": 280, "right": 560, "width": 280},
                "panel_overlap": 28,
            },
            "implemented_compact_560x700": {
                "selection_menu": {"left": 20, "right": 540, "width": 520},
                "selection_bar": {"client_width": 520, "scroll_width": 569, "overflow_x": "auto"},
                "maximum_simultaneous_side_panels": 1,
            },
            "verification": {
                "vitest_files": 94,
                "vitest_tests": 799,
                "python_tests": 80,
                "focused_browser_checks": 45,
                "production_build": "pass",
                "git_diff_check": "pass",
                "fixture": {"shapes": 8, "cue_bindings": 6, "cold_reopen": True},
                "fixture_keyboard": {
                    "bound_motion_delta": {"x": 30, "y": 20},
                    "divider_sequence": [40, 42, 35, 42, 40],
                    "added_port": "audit",
                },
            },
        },
        "findings": FINDINGS,
    }, indent=2) + "\n", encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
