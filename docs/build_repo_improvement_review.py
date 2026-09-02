#!/usr/bin/env python3
"""Build the self-contained SystemSketch repo-improvement decision gallery."""

from __future__ import annotations

import base64
import html
from pathlib import Path
from urllib.parse import quote


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "repo-improvement-review-2026-09-02.html"
ASSETS = ROOT / "docs" / "assets"


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
    image: str = "library-overview-chrome-1440-2026-09-02.png",
) -> dict[str, object]:
    return {
        "rank": rank,
        "title": title,
        "priority": priority,
        "category": category,
        "score": score,
        "status": status,
        "actual": actual,
        "expected": expected,
        "reproduce": reproduce,
        "proof": proof,
        "seam": seam,
        "acceptance": acceptance,
        "image": image,
    }


FINDINGS = [
    finding(1, "Quarantine unreadable documents", "P0", "Data safety", 98, "shipped",
            "A syntactically valid but tldraw-invalid file could fall through to an editable blank canvas and later autosave over its source.",
            "Refused bytes remain untouched; the UI explains the quarantine and offers an explicit recovery copy.",
            "Open a valid JSON file whose records fail the stock tldraw schema.",
            "Parser-first unit coverage plus the real workspace quarantine screen; no write is armed for the source path.",
            "src/workspace/workspaceDocument.ts + LocalWorkspace status state; stock parseTldrawJsonFile remains the oracle.",
            "The original bytes and digest are unchanged, editing is blocked, and Save recovery as… produces a separate valid board.",
            "repo-improvements-workspace-quarantine.png"),
    finding(2, "Serialize IDE edits without dropping an in-flight change", "P0", "Embedded host", 97, "shipped",
            "A store change arriving while the previous serialization/postMessage was awaiting could be silently discarded.",
            "At most one send is in flight and one latest pending edit is replayed immediately afterward.",
            "Delay the first serializer, mutate the editor again, then resolve the first promise.",
            "Focused embed-session regression proves the second revision is delivered and stale host sessions are fenced.",
            "src/embed/embedSession.ts; no canvas primitive is reimplemented.",
            "Two rapid edits yield two ordered host changes, with the second containing the latest snapshot."),
    finding(3, "Flush the final IDE debounce before teardown", "P0", "Embedded host", 95, "shipped",
            "Closing the embedded pane inside its debounce window could strand the last edit.",
            "A short debounce coalesces gestures; before async asset work, an opaque stock Editor snapshot crosses into extension-owned recovery storage and survives teardown or an in-flight host write.",
            "Edit and close inside 80 ms, then repeat while the previous full-document write is deliberately left unacknowledged.",
            "Five-check real-browser unload/reopen journey plus eight checkpoint-store/host-queue checks; both edits restore and the official tldraw serializer produces the final stock-readable text.",
            "Public Editor.getSnapshot/loadSnapshot + serializeTldrawJson; the IDE host stores one opaque checkpoint per URI, enforces one canvas owner per document, and fences queued work again at execution time.",
            "The next pane restores the newest edit after either close race; stale source/session checkpoints are rejected and a host failure stays retryable.",
            "repo-improvements-embed-recovery.png"),
    finding(4, "Open future .systemsketch formats read-only", "P0", "Compatibility", 93, "shipped",
            "An older client could accept a newer envelope and rewrite it as today’s format.",
            "A newer formatVersion is visible but immutable, with an explicit compatibility reason.",
            "Send the embedded canvas a .systemsketch envelope with formatVersion above the supported value.",
            "Decoder and embedded-session tests assert newerDocumentVersion and read-only host state independently.",
            "src/embed/sketchDocument.ts and EmbeddedCanvas.tsx.",
            "Future-format content renders without outbound changes and clearly reports why editing is disabled."),
    finding(5, "Export a stock-readable portable .tldr", "P0", "Interoperability", 92, "shipped",
            "Save As .tldr serialized custom Block, connection, and binding records that stock tldraw cannot load.",
            "Share creates a detached copy in a hidden editor; the live semantic board stays byte-identical.",
            "Draw a Block, choose Share → Download portable .tldr, then parse the result with stock createTLSchema().",
            "Fourteen-check real-browser journey: all pages/custom colours/cables normalize, rebuild metadata survives, stock parser accepts, live palette and board remain unchanged.",
            "src/export/portableTldraw.ts uses Editor, detachBlockToPrimitives, and serializeTldrawJson.",
            "The download opens under stock tldraw, contains no SystemSketch-only record types, and does not enter live undo/autosave.",
            "repo-improvements-share.png"),
    finding(6, "Protect dirty standalone boards during close/navigation", "P0", "Data safety", 91, "shipped",
            "The final 600 ms standalone debounce had no lifecycle guard, so a fast close could lose the last edit.",
            "visibilitychange flushes early, beforeunload warns while dirty, and pagehide uses one digest-fenced keepalive write.",
            "Mutate a board and dispatch hidden, beforeunload, and pagehide before the normal debounce fires.",
            "Lifecycle unit tests mutation-check listener cleanup, dirty gating, duplicate pagehide, and final teardown.",
            "src/workspace/workspaceLifecycle.ts + workspaceClient.flushWorkspaceDocument.",
            "A dirty board triggers an ordinary save and one final keepalive attempt; a clean board triggers neither."),
    finding(7, "Confirm before replacing an existing Save As target", "P0", "File workflow", 89, "shipped",
            "The server supported force replacement, but the dialog exposed only an opaque conflict error.",
            "A collision names the destination and requires a second, explicit Replace action.",
            "Save As to an existing board, then inspect and confirm the conflict state.",
            "Workspace client test proves force=false first and force=true only after the explicit retry.",
            "LocalWorkspace document dialog + existing workspace API force seam.",
            "First submit writes nothing; Replace targets exactly the named path and the dialog can still be cancelled.",
            "repo-improvements-workspace-quarantine.png"),
    finding(8, "Make the Preview header collision-safe", "P0", "Responsive UI", 88, "shipped",
            "At 900 px the centred Preview banner overlapped both stock top capsules; at 560 px the collision grew.",
            "Narrow layouts give the banner its own compact, non-overlapping position while every control stays reachable.",
            "Resize the product to 900×700 and 560×700 with the Preview banner visible.",
            "Real-browser geometry assertions require zero intersections at both viewports.",
            "src/systemsketch-utilities.css media queries; stock tldraw controls are not replaced.",
            "Banner, left shell, and right shell have zero rectangle intersection at 900 and 560 px.",
            "library-overview-chrome-900-2026-09-02.png"),
    finding(9, "Turn Shapes into a searchable insertion library", "P0", "Canvas UI", 87, "shipped",
            "Search did not filter the 13 decorative tiles and clicking Rectangle created no shape.",
            "Search filters a shared catalog; a tile inserts a stock shape at viewport centre, selects it, and records recents.",
            "Open Shapes, search decision, click the result, then reopen the library.",
            "Unit coverage freezes query/recents/insertion; a physical browser click proves a real painted shape and one-step undo.",
            "src/library over public Editor.createShape and stock geo/arrow records.",
            "Only matching tiles remain, click inserts one selected stock shape, Undo removes it, and it appears first in Recents.",
            "library-overview-library-2026-09-02.png"),
    finding(10, "Replace Board overview’s placeholder with real navigation", "P0", "Canvas UI", 85, "shipped",
            "The utility opened a literal placeholder with no board information or action.",
            "The panel lists pages, Frames, and expanded Blocks; a row selects and fits the real target.",
            "Seed a Frame and expanded Block, open Board overview, and click either landmark.",
            "Model tests plus physical browser navigation assert the current page, selected id, and camera fit.",
            "src/chrome/BoardOverview.tsx over getPages, select, setCurrentPage, and zoomToSelection.",
            "Every landmark is named, click focuses the correct object, and empty pages explain what qualifies.",
            "library-overview-panel-2026-09-02.png"),
    finding(11, "Treat zero-byte desktop boards as intentional blanks", "P1", "Compatibility", 83, "bonus",
            "IDE hosts accepted zero-byte boards, while standalone treated the same file as an unreadable error.",
            "All hosts interpret a zero-byte document consistently as an intentional blank board.",
            "Create a zero-byte .tldr or .systemsketch and open it in standalone.",
            "workspaceDocument tests cover blank, malformed, schema-invalid, and valid sources.",
            "src/workspace/workspaceDocument.ts.",
            "The file opens blank without quarantine and the first authored edit saves a valid document."),
    finding(12, "Contain every async file-action failure", "P1", "Data safety", 81, "open",
            "Several click handlers launch promises without a common failure boundary.",
            "Every open/save/rename/trash/reveal action lands in one visible, recoverable error state.",
            "Reject each workspace API call from the browser harness.",
            "Source audit found mixed local catches and fire-and-forget event handlers.",
            "LocalWorkspace action dispatcher.",
            "No unhandled rejection; the failed operation is named and retry/cancel remains available."),
    finding(13, "Add timeouts and cancellation to workspace fetches", "P1", "Reliability", 79, "open",
            "Workspace fetch calls can wait indefinitely when the local API stalls.",
            "Reads and ordinary writes time out with an actionable message; superseded reads abort.",
            "Accept the TCP connection but never answer a workspace request.",
            "workspaceClient currently calls fetch without AbortSignal or a timeout budget.",
            "src/workspace/workspaceClient.ts.",
            "Stalled reads resolve to a visible error inside a bounded interval; navigation cancels obsolete work."),
    finding(14, "Digest-fence external-change reload decisions", "P1", "Data safety", 78, "open",
            "The watch loop compares limited file state and can misclassify same-size/same-mtime external rewrites.",
            "External-change decisions use the same content digest that guards writes.",
            "Rewrite a board’s bytes while preserving its size and timestamp.",
            "Source audit: write conflicts are digest-aware; periodic stat observations are not.",
            "workspace stat/watch response.",
            "A same-size rewrite is detected before any local autosave and offers reload or preserve-local."),
    finding(15, "Expire orphaned Live Preview clones", "P1", "Release workflow", 76, "open",
            "Preview clones accumulate without a retention policy.",
            "Old, unused clones expire predictably while active review URLs remain stable.",
            "Create many Live Preview clones and inspect the runtime directory days later.",
            "Release API and tests cover creation/launch but no age-based cleanup.",
            "scripts/release_system.py clone store.",
            "A documented TTL removes only inactive clones and never the current Stable/Candidate artifacts."),
    finding(16, "Make Add Port fully keyboard-operable", "P1", "Accessibility", 75, "open",
            "The on-canvas Add Port affordance uses a pointer-oriented div in one interaction path.",
            "Tab, Enter, and Space can add a port with a visible focus ring and the same undo semantics.",
            "Select a Block and navigate the port editor using only the keyboard.",
            "Source audit found a non-native interactive surface around the Add Port path.",
            "Block port UI; retain stock canvas focus management.",
            "Keyboard and pointer produce identical port records, focus remains logical, and one Undo removes the port."),
    finding(17, "Finish dialog focus containment and slider naming", "P1", "Accessibility", 73, "open",
            "Workspace dialogs and custom sliders have incomplete focus-loop / accessible-value coverage.",
            "Modal focus stays inside until close and every slider announces label, value, and bounds.",
            "Open each dialog, cycle Tab/Shift+Tab, and inspect the accessibility tree.",
            "Static audit of LocalWorkspace and custom inspector controls.",
            "Existing tldraw dialog/popover primitives plus native ARIA attributes.",
            "Automated keyboard journey cannot escape the modal; axe reports no unnamed range controls."),
    finding(18, "Promote critical browser journeys into npm run check", "P1", "Test system", 72, "open",
            "The comprehensive check is green but omits several expensive browser acceptance journeys.",
            "A bounded critical subset runs in CI/check; extended visual journeys remain opt-in.",
            "Break a top-shell insertion action and run npm run check.",
            "package.json exposes many separate smoke scripts outside the default gate.",
            "Package scripts and browser harness, without making check depend on Zach’s servers.",
            "A deliberate UI regression makes check red; total routine runtime remains documented and tolerable."),
    finding(19, "Give generic selections a real Inspect destination", "P1", "Canvas UI", 70, "open",
            "Inspect opens a Block-oriented dock that has little to say about ordinary tldraw shapes.",
            "Generic shapes receive a useful property summary or the dead-end action disappears.",
            "Select a rectangle and press Inspect.",
            "Live UI audit observed the non-Block selection pill leading to an empty/irrelevant surface.",
            "SystemSketch selection menu + stock relevant styles.",
            "Rectangle Inspect exposes useful identity/geometry/appearance facts and never renders an empty panel."),
    finding(20, "Name mixed selections instead of only counting them", "P1", "Canvas UI", 69, "open",
            "The contextual pill says only “N selected,” hiding whether the set is Blocks, shapes, or cables.",
            "The label summarizes the selected kinds and preserves Mixed style semantics.",
            "Select one Block, one rectangle, and one cable.",
            "Live UI audit plus current SelectionMiniMenu source.",
            "Selection mini menu model.",
            "The pill names the kinds without unstable ordering and remains compact at narrow widths."),
    finding(21, "Expose Block appearance through stock styles", "P1", "Canvas UI", 68, "open",
            "A Block-only selection contributes no fill, color, or stroke controls.",
            "Block appearance is editable through supported StyleProps and participates in Mixed batch state.",
            "Select a Block and inspect the appearance pill.",
            "Appearance tests explicitly document that Blocks currently contribute no tldraw styles.",
            "Block ShapeUtil props/StyleProps, not custom resize or selection logic.",
            "Color/fill changes paint immediately, batch correctly, undo once, and round-trip in .systemsketch."),
    finding(22, "Add lightweight tags to Blocks", "P1", "System modeling", 67, "open",
            "Blocks can encode title/type/description/ports but not cross-cutting categories.",
            "Small searchable tags support grouping without inventing hierarchy.",
            "Try to mark several Blocks as safety-critical across different Frames.",
            "Block model source has no tag field or filter surface.",
            "Semantic Block props + inspector; no relationship is inferred from a tag.",
            "Tags round-trip, batch add/remove, remain optional, and are searchable."),
    finding(23, "Implement local canvas comments", "P1", "Review workflow", 66, "open",
            "The Comments panel is an explicit placeholder.",
            "A comment can anchor to a shape or board point, resolve locally, and survive file round-trip.",
            "Open Comments and attempt to leave review feedback.",
            "README and live UI both label the surface as unwired.",
            "Custom records or shape meta through supported tldraw store seams.",
            "Create, resolve, reopen, and delete a comment without collaboration or cloud dependencies."),
    finding(24, "Add command palette and board find/replace", "P1", "Navigation", 65, "open",
            "The command affordance exists visually but has no useful searchable actions.",
            "Keyboard search jumps to Blocks/Frames and invokes named commands; replace is explicit and undoable.",
            "Open the command surface and search a Block title.",
            "README calls quick-command contents a placeholder.",
            "Existing action registry + editor selection/camera APIs.",
            "Cmd/Ctrl+K finds a named Block, Enter focuses it, and replace is one undo step."),
    finding(25, "Remove or implement the fake timer", "P2", "Chrome honesty", 58, "open",
            "The top shell displays a static “03:00” timer placeholder.",
            "Either a real local timer runs correctly or the misleading control is absent.",
            "Observe the header for more than one minute.",
            "Live UI audit and aria-label=Timer placeholder.",
            "SystemSketchSharePanel only; no canvas state required.",
            "If kept, start/pause/reset persist for the session and time advances accurately."),
    finding(26, "Replace the fake profile badge with real preferences", "P2", "Chrome honesty", 56, "open",
            "The Z avatar is an inert profile placeholder.",
            "It opens useful local preferences/identity or is removed until identity exists.",
            "Click the Z badge.",
            "Live UI audit and title=Profile placeholder.",
            "Top shell preference surface.",
            "The badge has an honest label and every visible action works offline."),
    finding(27, "Add a literal Value Pill Block", "P2", "System modeling", 55, "open",
            "Constants and observed values must masquerade as full Blocks or stock text.",
            "A compact semantic literal supports type/value, connections, detach, and round-trip.",
            "Model a numeric threshold connected to a Block input.",
            "A complete donor implementation exists on claude/literal-pill-babble but is behind current main.",
            "New custom ShapeUtil/bindings only through App seams; donor must be ported, not blindly cherry-picked.",
            "Literal creates from toolbar, connects, edits inline, detaches to stock shapes, and survives reload."),
    finding(28, "Offer header-row port layout", "P2", "System modeling", 54, "open",
            "Ports occupy side lanes only, which is noisy for table-like compact systems.",
            "An optional header-row layout preserves semantic bindings and stock resize behavior.",
            "Create a compact Block with many inputs/outputs.",
            "A complete but stale donor branch exists: claude/header-port-rows-447683.",
            "Block layout/renderer only; reuse stock selection, drag, resize, and bindings.",
            "Switching layout preserves port ids, cables, undo, nested visibility, and round-trip."),
    finding(29, "Put semantic labels on data edges", "P2", "System modeling", 53, "open",
            "Connections carry routing but no visible signal/unit/condition label.",
            "Optional labels follow the cable, edit inline, and remain legible across routing modes.",
            "Connect two ports and try to name the transferred value.",
            "Connection model has no label prop or editor.",
            "Connection ShapeUtil props + stock text measurement; retain stock binding lifecycle.",
            "Label edits are undoable, do not alter endpoints, and export to portable stock text."),
    finding(30, "Support one-off custom palette colours", "P2", "Appearance", 52, "open",
            "The captured FigJam palette is closed; the picker affordance is not yet a persisted arbitrary colour.",
            "A custom colour can be entered, painted, named accessibly, and reopened.",
            "Select a shape and choose the custom picker.",
            "Donor branch claude/figjam-fidelity-9dc86a contains related work but predates current changes.",
            "Theme/StyleProp registration rather than direct DOM paint.",
            "Hex input paints the shape, participates in Mixed state, and round-trips without theme corruption."),
    finding(31, "Unify line style across arrows and semantic cables", "P2", "Appearance", 51, "open",
            "Arrow and cable routing now synchronize, but their dash/weight surface still differs.",
            "One line-style decision applies wherever the selected line kind supports it.",
            "Select one stock arrow and one semantic cable.",
            "Source audit found shared routing but separate paint vocabularies.",
            "Shared StyleProps, with semantic cable renderer consuming the same public values.",
            "Mixed selection reports Mixed; one edit updates both and one Undo restores both."),
    finding(32, "Enforce compatible port types", "P2", "Model correctness", 50, "open",
            "Any source port can connect to any sink regardless of data/energy/control type.",
            "Optional declared types reject incompatible drops and explain the refusal.",
            "Declare numeric output and image input, then attempt a connection.",
            "Connection rules cover polarity/scope but no type compatibility.",
            "connectionRules verdict, Block port schema, and existing refusal UI.",
            "Untyped ports retain today’s behavior; typed mismatch never creates a cable and states why."),
    finding(33, "Add board diagnostics and lint navigation", "P2", "Model correctness", 49, "open",
            "Dangling, duplicated, or incompatible model elements have no consolidated diagnosis surface.",
            "A local diagnostics panel lists deterministic findings and jumps to the offending object.",
            "Create an unconnected required input and duplicate port names.",
            "No diagnostics registry or error-state surface exists in src.",
            "Pure model analysis + Board overview-style focus; no background mutation.",
            "Diagnostics are stable, dismissible only when fixed, and clicking one selects/fits the object."),
    finding(34, "Create folders from the workspace dialog", "P2", "File workflow", 47, "open",
            "The browser can enter existing directories but cannot create a project folder.",
            "New Folder is available with safe naming and root confinement.",
            "Open Save As and try to create a directory.",
            "Workspace listing/API expose directories but no mkdir action.",
            "Workspace API + LocalWorkspace dialog.",
            "Folder creation cannot escape the configured root, handles collisions, and selects the new folder."),
    finding(35, "Record a compact local edit timeline", "P3", "Recovery", 42, "open",
            "Undo is session-local and there is no inspectable crash/recovery timeline.",
            "A bounded local recorder preserves named checkpoints without becoming a second document source of truth.",
            "Make several edits, reload, and try to inspect or restore an earlier point.",
            "A stale donor branch contains a flight-recorder design, but current product has no integration.",
            "Store listeners + bounded sidecar/checkpoint API; never replace stock undo.",
            "Recorder is opt-in, bounded, privacy-local, crash-safe, and restoration always creates a copy."),
]


def image_uri(filename: str) -> str:
    path = ROOT / filename if "/" in filename else ASSETS / filename
    if path.exists():
        media_type = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
        encoded = base64.b64encode(path.read_bytes()).decode("ascii")
        return f"data:{media_type};base64,{encoded}"
    label = html.escape(f"Evidence capture pending: {filename}")
    svg = (
        "<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='680'>"
        "<rect width='1200' height='680' fill='#17191f'/><rect x='36' y='36' width='1128' height='608' "
        "rx='24' fill='#22252d' stroke='#3b404c'/><text x='70' y='112' fill='#9da7ba' "
        f"font-family='system-ui' font-size='25'>{label}</text></svg>"
    )
    encoded = base64.b64encode(svg.encode("utf-8")).decode("ascii")
    return f"data:image/svg+xml;base64,{encoded}"


def escaped(value: object) -> str:
    return html.escape(str(value))


def render_finding(item: dict[str, object], detailed: bool) -> str:
    rank = int(item["rank"])
    status = str(item["status"])
    implemented = status in {"shipped", "bonus"}
    decision_label = "Keep this fix" if implemented else "Implement this fix"
    fields = "".join(
        f"<div><dt>{label}</dt><dd>{escaped(item[key])}</dd></div>"
        for label, key in (
            ("Actual", "actual"),
            ("Expected", "expected"),
            ("Reproduce", "reproduce"),
            ("Measured proof", "proof"),
            ("Supported seam", "seam"),
            ("Acceptance", "acceptance"),
        )
    )
    screenshot = (
        f'<figure><img src="{image_uri(str(item["image"]))}" '
        f'alt="Real SystemSketch evidence associated with {escaped(item["title"])}"><figcaption>'
        f'Live-app evidence · <code>{escaped(item["image"])}</code></figcaption></figure>'
        if detailed else ""
    )
    screenshot_line = f"  {screenshot}\n" if screenshot else ""
    return f"""
<article class="finding {'finding--detail' if detailed else 'finding--compact'}" data-status="{status}" data-rank="{rank}">
  <header>
    <div class="rank">{rank:02d}</div>
    <div class="title"><div class="chips"><span class="chip {escaped(item['priority']).lower()}">{escaped(item['priority'])}</span><span class="chip">{escaped(item['category'])}</span><span class="chip status">{escaped(status)}</span></div><h3>{escaped(item['title'])}</h3></div>
    <div class="score" title="Weighted priority score"><b>{escaped(item['score'])}</b><span>/100</span></div>
  </header>
{screenshot_line}  <dl>{fields}</dl>
  <div class="decision">
    <label class="keep"><input type="checkbox" data-review="decision" data-key="finding-{rank}"><span>{decision_label}</span></label>
    <label class="note"><span>Review note</span><textarea data-review="note" data-key="finding-{rank}-note" placeholder="Why yes/no, or what to splice…"></textarea></label>
  </div>
</article>"""


def main() -> None:
    top_findings = "\n".join(render_finding(item, detailed=True) for item in FINDINGS[:10])
    bonus = render_finding(FINDINGS[10], detailed=True)
    later_findings = "\n".join(render_finding(item, detailed=False) for item in FINDINGS[11:])
    hero = image_uri("sketches/review/library-overview.png")
    shapes = image_uri("library-overview-library-2026-09-02.png")
    overview = image_uri("library-overview-panel-2026-09-02.png")
    responsive = image_uri("library-overview-chrome-900-2026-09-02.png")
    review_board = ROOT / "sketches" / "review" / "library-overview.systemsketch"
    review_board_url = f"../?board={quote(str(review_board), safe='')}"
    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch repo improvement review · 2026-09-02</title>
<style>
:root{{--paper:#f1f0ec;--card:#fff;--ink:#1d2027;--muted:#687080;--line:#d9d9d3;--violet:#635bff;--orange:#ee8a2f;--green:#17874d;--red:#d64747;--blue:#2475d0;--shadow:0 18px 50px #20242c13;color-scheme:light}}
*{{box-sizing:border-box}}html{{scroll-behavior:smooth}}body{{margin:0;background:var(--paper);color:var(--ink);font:15px/1.5 Inter,ui-sans-serif,system-ui,sans-serif}}button,input,textarea{{font:inherit}}a{{color:#4940df;font-weight:750}}main{{max-width:1360px;margin:auto;padding:48px 28px 96px}}.eyebrow{{color:var(--violet);font-size:12px;font-weight:850;letter-spacing:.14em;text-transform:uppercase}}h1{{max-width:1050px;margin:10px 0 18px;font-size:clamp(45px,6.7vw,86px);line-height:.94;letter-spacing:-.058em}}h2{{font-size:31px;letter-spacing:-.035em;margin:0 0 12px}}h3{{font-size:23px;line-height:1.13;letter-spacing:-.025em;margin:8px 0 0}}p{{color:var(--muted)}}.lead{{max-width:850px;font-size:20px}}.hero{{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(280px,.7fr);gap:0;margin:34px 0 20px;background:#17191f;border-radius:25px;overflow:hidden;box-shadow:var(--shadow)}}.hero img{{width:100%;height:100%;min-height:390px;object-fit:cover;display:block}}.hero aside{{padding:30px;color:#f5f5f0;display:flex;flex-direction:column;justify-content:space-between}}.hero aside p{{color:#b5bdcb}}.metrics{{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}}.metric{{border:1px solid #3b404b;border-radius:15px;padding:14px}}.metric b{{display:block;font-size:30px;letter-spacing:-.045em}}.metric span{{color:#aeb6c6;font-size:12px}}.method{{display:grid;grid-template-columns:1.1fr 1fr;gap:18px;margin:18px 0 42px}}.panel{{background:var(--card);border:1px solid var(--line);border-radius:21px;padding:25px;box-shadow:var(--shadow)}}.weights{{display:grid;gap:12px}}.weight{{display:grid;grid-template-columns:1fr 2fr 46px;gap:12px;align-items:center}}.bar{{height:10px;background:#e8e8e4;border-radius:999px;overflow:hidden}}.bar i{{display:block;height:100%;background:var(--violet)}}.notice{{border-left:4px solid var(--orange)}}.controls{{position:sticky;top:10px;z-index:20;margin:0 0 22px;padding:12px 14px;border:1px solid var(--line);background:#ffffffee;backdrop-filter:blur(16px);border-radius:17px;box-shadow:var(--shadow);display:flex;gap:8px;align-items:center;flex-wrap:wrap}}.controls button{{border:1px solid var(--line);background:white;border-radius:10px;padding:8px 12px;cursor:pointer;font-weight:750}}.controls button:hover{{border-color:var(--violet)}}.controls .primary{{background:var(--ink);color:white;border-color:var(--ink)}}.controls output{{margin-left:auto;color:var(--muted);font-size:13px}}.section-head{{display:flex;align-items:end;justify-content:space-between;gap:20px;margin:48px 0 16px}}.section-head p{{max-width:620px;margin:0}}.finding{{background:var(--card);border:1px solid var(--line);border-radius:21px;box-shadow:var(--shadow);overflow:hidden;margin:0 0 18px}}.finding>header{{display:grid;grid-template-columns:58px 1fr 70px;gap:16px;align-items:start;padding:22px 24px}}.rank{{font-size:30px;font-weight:900;color:#adb0b7;line-height:1}}.chips{{display:flex;gap:6px;flex-wrap:wrap}}.chip{{border:1px solid var(--line);border-radius:999px;padding:3px 8px;color:var(--muted);font-size:11px;font-weight:850;text-transform:uppercase;letter-spacing:.05em}}.chip.p0{{background:#ffeded;border-color:#f7c4c4;color:#a92a2a}}.chip.p1{{background:#fff4e8;border-color:#f2d1ae;color:#9b541b}}.chip.p2{{background:#eef5ff;border-color:#c9ddf7;color:#285d9a}}.chip.p3{{background:#f2f2f0}}.chip.status{{color:var(--green);border-color:#b7dfc8;background:#eef9f2}}[data-status="open"] .chip.status{{color:#6d687b;border-color:#d4d0de;background:#f5f3f8}}.score{{text-align:right;color:var(--muted)}}.score b{{display:block;font-size:27px;color:var(--ink);line-height:1}}.score span{{font-size:11px}}figure{{margin:0;border-block:1px solid var(--line);background:#20232a}}figure img{{display:block;width:100%;max-height:680px;object-fit:contain}}figcaption{{padding:8px 13px;background:#f7f7f4;color:var(--muted);font-size:11px}}dl{{display:grid;grid-template-columns:repeat(3,1fr);gap:0;margin:0;border-bottom:1px solid var(--line)}}dl>div{{padding:18px 21px;border-right:1px solid var(--line);border-top:1px solid var(--line)}}dl>div:nth-child(3n){{border-right:0}}dt{{font-size:11px;color:var(--muted);font-weight:850;text-transform:uppercase;letter-spacing:.08em}}dd{{margin:6px 0 0}}.decision{{display:grid;grid-template-columns:210px 1fr;gap:16px;align-items:start;padding:17px 21px;background:#fbfbf8}}.keep{{display:flex;align-items:center;gap:10px;font-weight:850;cursor:pointer;padding-top:8px}}.keep input{{width:20px;height:20px;accent-color:var(--green)}}.note span{{display:block;color:var(--muted);font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.07em}}textarea{{width:100%;min-height:66px;margin-top:5px;padding:10px 12px;resize:vertical;border:1px solid var(--line);border-radius:10px;background:white}}.finding--compact>header{{padding-bottom:16px}}.finding--compact dl{{grid-template-columns:repeat(2,1fr)}}.finding--compact dl>div{{padding:14px 20px}}.finding--compact dl>div:nth-child(3n){{border-right:1px solid var(--line)}}.finding--compact dl>div:nth-child(2n){{border-right:0}}.gallery{{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:18px 0 36px}}.gallery figure{{border-radius:17px;overflow:hidden;border:1px solid var(--line)}}.gallery img{{height:240px;object-fit:cover}}.hidden{{display:none!important}}footer{{margin-top:40px;padding-top:22px;border-top:1px solid var(--line);color:var(--muted)}}code{{font:12px/1.4 ui-monospace,SFMono-Regular,monospace}}@media(max-width:900px){{main{{padding:28px 15px 70px}}.hero,.method{{grid-template-columns:1fr}}.hero img{{min-height:0}}.metrics{{grid-template-columns:repeat(2,1fr)}}dl,.finding--compact dl{{grid-template-columns:1fr}}dl>div,.finding--compact dl>div{{border-right:0!important}}.decision{{grid-template-columns:1fr}}.gallery{{grid-template-columns:1fr}}.gallery img{{height:auto}}.controls output{{width:100%;margin:0}}}}@media(max-width:560px){{.finding>header{{grid-template-columns:42px 1fr}}.score{{display:none}}h1{{font-size:46px}}}}
</style></head><body><main>
<div class="eyebrow">Repo audit → implemented tranche → decision surface</div><h1>35 candidates. The top ten are already real.</h1>
<p class="lead">This is a temporary review sheet, not a second specification to maintain. The ranking combines failure cost with visible product value; the executable code and ordinary regression tests remain the source of truth.</p>
<section class="hero"><img src="{hero}" alt="The improved SystemSketch application running in a real browser"><aside><div><div class="eyebrow">2026-09-02 · isolated worktree</div><h2>Review the phenotype.</h2><p>Every shipped item has a measurable pass condition. Check <b>Keep this fix</b>, add notes where the direction should change, then copy one Markdown response.</p></div><div class="metrics"><div class="metric"><b>35</b><span>ranked candidates</span></div><div class="metric"><b>10</b><span>top fixes shipped</span></div><div class="metric"><b>+1</b><span>safety bonus</span></div><div class="metric"><b>0</b><span>engine forks</span></div></div></aside></section>
<section class="method"><div class="panel"><div class="eyebrow">Priority ruler · frozen before selection</div><h2>What “top” means</h2><div class="weights"><div class="weight"><b>Failure / data impact</b><div class="bar"><i style="width:40%"></i></div><span>40%</span></div><div class="weight"><b>Broken visible promise</b><div class="bar"><i style="width:25%"></i></div><span>25%</span></div><div class="weight"><b>Stock-seam confidence</b><div class="bar"><i style="width:20%"></i></div><span>20%</span></div><div class="weight"><b>Independent reviewability</b><div class="bar"><i style="width:15%"></i></div><span>15%</span></div></div></div><div class="panel notice"><div class="eyebrow">Late P0 adjustment</div><h2>Responsive collision displaced #11.</h2><p>The initial code audit put zero-byte parity in the ten. Real 900 px and 560 px browser runs found the Preview banner physically covering both header capsules, so responsive safety moved to #8. Zero-byte parity was already small and valuable, so it shipped as the bonus rather than being discarded.</p></div></section>
<nav class="controls" aria-label="Review controls"><button type="button" data-filter="all">All 35</button><button type="button" data-filter="shipped">Shipped + bonus</button><button type="button" data-filter="open">Open candidates</button><button type="button" class="primary" id="copy-review">Copy review Markdown</button><button type="button" id="reset-review">Reset</button><output id="review-status">Decisions save in this browser.</output></nav>
<div class="section-head"><div><div class="eyebrow">Ranks 01–10 · implemented</div><h2>Keep or reject each fix</h2></div><p>These cards carry the observed failure, expected behavior, reproduction, runtime proof, supported seam, and an acceptance contract.</p></div>
{top_findings}
<div class="section-head"><div><div class="eyebrow">Real-app UI evidence</div><h2>Three reviewable surfaces</h2></div><p>The report is evidence index; the seeded boards linked below are the direct interaction surface.</p></div><div class="gallery"><figure><img src="{shapes}" alt="Searchable Shapes library in SystemSketch"><figcaption>Search → stock insertion → Recents</figcaption></figure><figure><img src="{overview}" alt="Board overview listing real SystemSketch landmarks"><figcaption>Pages, Frames, and expanded Blocks</figcaption></figure><figure><img src="{responsive}" alt="SystemSketch header at a collision-sensitive viewport"><figcaption>900 px collision gate</figcaption></figure></div>
<div class="section-head"><div><div class="eyebrow">Rank 11 · implemented bonus</div><h2>Small enough not to lose</h2></div><p>Standalone and embedded hosts now agree on the intentional blank-file representation.</p></div>{bonus}
<div class="section-head"><div><div class="eyebrow">Ranks 12–35 · not implemented</div><h2>The next decision queue</h2></div><p>These are source-confirmed gaps or bounded feature candidates—not commitments. Check only the ones worth pulling into the next tranche.</p></div>{later_findings}
<footer><b>Artifacts:</b> real screenshots are embedded above; the source captures remain under <code>docs/assets/</code>. Review the implemented canvas surfaces in the <a id="live-review-board" href="{escaped(review_board_url)}">live Shapes + overview board</a>, or open its <a data-review-fixture href="../sketches/review/library-overview.systemsketch">fixture file</a> directly. The <a data-review-fixture href="../sketches/review/portable-export.systemsketch">portable export fixture</a> exercises Share. Builder: <a href="build_repo_improvement_review.py">build_repo_improvement_review.py</a>.</footer>
<script>
const prefix='systemsketch.repo-review.2026-09-02.';const status=document.querySelector('#review-status');
for(const control of document.querySelectorAll('[data-review]')){{const key=prefix+control.dataset.key;const saved=localStorage.getItem(key);if(control.type==='checkbox')control.checked=saved==='true';else if(saved!==null)control.value=saved;control.addEventListener('input',()=>{{localStorage.setItem(key,control.type==='checkbox'?String(control.checked):control.value);status.value='Saved locally.'}})}}
for(const button of document.querySelectorAll('[data-filter]'))button.addEventListener('click',()=>{{const filter=button.dataset.filter;for(const card of document.querySelectorAll('.finding')){{const done=card.dataset.status==='shipped'||card.dataset.status==='bonus';card.classList.toggle('hidden',filter==='shipped'?!done:filter==='open'?done:false)}}}});
document.querySelector('#reset-review').addEventListener('click',()=>{{for(const key of Object.keys(localStorage))if(key.startsWith(prefix))localStorage.removeItem(key);for(const control of document.querySelectorAll('[data-review]'))control.type==='checkbox'?control.checked=false:control.value='';status.value='Review reset.'}});
document.querySelector('#copy-review').addEventListener('click',async()=>{{const lines=['# SystemSketch improvement review',''];for(const card of document.querySelectorAll('.finding')){{const rank=card.dataset.rank.padStart(2,'0');const title=card.querySelector('h3').textContent.trim();const checked=card.querySelector('[data-review="decision"]').checked;const label=card.querySelector('.keep span').textContent.trim();const note=card.querySelector('[data-review="note"]').value.trim();lines.push(`- [${{checked?'x':' '}}] #${{rank}} ${{label}} — ${{title}}${{note?`\n  - ${{note}}`:''}}`)}}try{{await navigator.clipboard.writeText(lines.join('\\n'));status.value='Copied 35 decisions as Markdown.'}}catch{{status.value='Clipboard blocked; select this page and retry.'}}}});
</script></main></body></html>"""
    OUTPUT.write_text(page, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
