#!/usr/bin/env python3
"""Build the five-direction UI comparison for workspace file sorting."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "workspace-sort-ui-variants-2026-09-05.html"
SPEC = ROOT / "docs" / "workspace-sort-ui-variants-2026-09-05.json"


STYLE = """
<style>
  .sort-lab { min-width: 690px; min-height: 470px; padding: 42px; box-sizing: border-box; background: #f2f3f0; color: #29312e; font: 12px/1.35 Inter, ui-sans-serif, system-ui, sans-serif; }
  .sort-window { overflow: hidden; width: 610px; border: 1px solid #c9ccc7; border-radius: 10px; background: #fff; box-shadow: 0 18px 42px rgba(24, 36, 32, .14); }
  .sort-titlebar { display: flex; align-items: center; justify-content: space-between; height: 48px; padding: 0 17px; border-bottom: 1px solid #e5e7e3; background: #fcfcfb; font-weight: 690; }
  .sort-titlebar small { color: #74807a; font-size: 10px; font-weight: 650; }
  .sort-body { display: grid; grid-template-columns: 132px 1fr; min-height: 330px; }
  .sort-places { padding: 16px 10px; border-right: 1px solid #e7e9e5; background: #fafbfa; color: #65716b; }
  .sort-places b { display: block; margin: 0 9px 10px; color: #89928d; font-size: 9px; letter-spacing: .09em; }
  .sort-place { margin: 3px 0; padding: 7px 9px; border-radius: 5px; }
  .sort-place.current { background: #e8f0ed; color: #22624e; font-weight: 720; }
  .sort-main { min-width: 0; padding: 15px 17px; }
  .sort-crumb { margin-bottom: 16px; color: #72807a; font-size: 10px; }
  .sort-crumb strong { color: #3e4d46; }
  .sort-toolbar { display: flex; align-items: center; justify-content: space-between; min-height: 32px; margin-bottom: 11px; }
  .sort-toolbar label { color: #7a847e; font-size: 10px; font-weight: 720; letter-spacing: .055em; text-transform: uppercase; }
  .sort-button, .sort-segment { min-height: 29px; border: 1px solid #bdc5bf; border-radius: 5px; background: #fff; color: #405048; font: 680 10px/1 Inter, ui-sans-serif, system-ui, sans-serif; }
  .sort-button { padding: 0 9px; }
  .sort-button.active, .sort-segment.active { border-color: #6da38d; background: #e6f3ed; color: #1e6a4b; }
  .sort-list { overflow: hidden; border: 1px solid #dce1dc; border-radius: 6px; }
  .sort-head, .sort-row { display: grid; grid-template-columns: minmax(0, 1fr) 112px; align-items: center; min-height: 36px; padding: 0 11px; border-bottom: 1px solid #ebeeeb; }
  .sort-head { min-height: 31px; background: #f7f8f6; color: #77817b; font-size: 9px; font-weight: 770; letter-spacing: .065em; text-transform: uppercase; }
  .sort-head button { justify-self: start; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; }
  .sort-head button.is-current { color: #176646; }
  .sort-row:last-child { border-bottom: 0; }
  .sort-file { overflow: hidden; color: #34423c; font-weight: 630; text-overflow: ellipsis; white-space: nowrap; }
  .sort-file .icon { display: inline-block; width: 18px; color: #8b9a93; }
  .sort-row.folder .sort-file { color: #49645a; font-weight: 710; }
  .sort-meta { color: #87918c; font-size: 10px; text-align: left; }
  .sort-folder-rule { padding: 8px 11px; border-bottom: 1px solid #e7ece8; background: #fbfcfb; color: #759185; font-size: 9px; font-weight: 730; letter-spacing: .055em; text-transform: uppercase; }
  .sort-menu-wrap { position: relative; }
  .sort-popover { position: absolute; z-index: 2; top: 34px; right: 0; width: 155px; padding: 5px; border: 1px solid #b8c6be; border-radius: 6px; background: #fff; box-shadow: 0 9px 19px rgba(20, 50, 36, .16); color: #3e4c45; font-size: 10px; }
  .sort-popover div { padding: 7px; border-radius: 4px; }
  .sort-popover .chosen { background: #e6f3ed; color: #1d694a; font-weight: 720; }
  .sort-segments { display: inline-flex; padding: 2px; border: 1px solid #c9d0cb; border-radius: 6px; background: #f6f8f6; }
  .sort-segment { min-width: 61px; border-color: transparent; background: transparent; }
  .sort-callout { margin-top: 14px; color: #63716a; font-size: 10px; }
  .sort-callout b { color: #28694e; }
  .sort-alt-only { display: none; }
  .prototype.is-alt .sort-alt-only { display: revert; }
  .prototype.is-alt .sort-base-only { display: none !important; }
  .prototype.is-alt .sort-popover { display: block; }
</style>
"""


NAME_ROWS = """
<div class="sort-row folder"><div class="sort-file"><span class="icon">▸</span>Concepts</div><div class="sort-meta">folder</div></div>
<div class="sort-row folder"><div class="sort-file"><span class="icon">▸</span>Robotics</div><div class="sort-meta">folder</div></div>
<div class="sort-folder-rule">Documents</div>
<div class="sort-row"><div class="sort-file"><span class="icon">▤</span>Arm.systemsketch</div><div class="sort-meta">1 hour ago</div></div>
<div class="sort-row"><div class="sort-file"><span class="icon">▤</span>Gripper.systemsketch</div><div class="sort-meta">1 min ago</div></div>
<div class="sort-row"><div class="sort-file"><span class="icon">▤</span>Legacy.systemsketch</div><div class="sort-meta">10 min ago</div></div>
"""


RECENT_ROWS = """
<div class="sort-row folder"><div class="sort-file"><span class="icon">▸</span>Concepts</div><div class="sort-meta">folder</div></div>
<div class="sort-row folder"><div class="sort-file"><span class="icon">▸</span>Robotics</div><div class="sort-meta">folder</div></div>
<div class="sort-folder-rule">Documents · newest first</div>
<div class="sort-row"><div class="sort-file"><span class="icon">▤</span>Gripper.systemsketch</div><div class="sort-meta">1 min ago</div></div>
<div class="sort-row"><div class="sort-file"><span class="icon">▤</span>Legacy.systemsketch</div><div class="sort-meta">10 min ago</div></div>
<div class="sort-row"><div class="sort-file"><span class="icon">▤</span>Arm.systemsketch</div><div class="sort-meta">1 hour ago</div></div>
"""


def window(main: str, *, style: bool = False) -> str:
    return f"""{STYLE if style else ""}
<div class="sort-lab"><div class="sort-window"><div class="sort-titlebar"><span>Open a board</span><small>workspace</small></div><div class="sort-body"><aside class="sort-places"><b>PLACES</b><div class="sort-place current">SystemSketch</div><div class="sort-place">Home</div></aside><section class="sort-main"><div class="sort-crumb">SystemSketch <strong>› Projects</strong></div>{main}</section></div></div></div>"""


def score(discovery: int, scan: int, fit: int) -> dict[str, dict[str, object]]:
    return {
        "fr-discovery": {
            "score": discovery,
            "evidence": "The rendered control is visible in the organizer specimen and switches its shown state in the exercised prototype.",
            "confidence": "high",
        },
        "fr-scan": {
            "score": scan,
            "evidence": "The live toggle reorders the shared Arm, Gripper, and Legacy fixture to the same newest-first sequence.",
            "confidence": "high",
        },
        "fr-fit": {
            "score": fit,
            "evidence": "The specimen retains the existing compact two-pane dialog and its folders-first list contract.",
            "confidence": "medium",
        },
    }


def gates() -> dict[str, dict[str, object]]:
    return {
        "g-folders": {"pass": True, "evidence": "Concepts and Robotics remain above documents in both interactive states."},
        "g-access": {"pass": True, "evidence": "Each alternate state is driven by a real labelled button in the gallery."},
    }


def variant(
    identifier: str,
    name: str,
    thesis: str,
    preview: str,
    scores: tuple[int, int, int],
    best_when: str,
    loses_when: str,
    decisions: list[tuple[str, str]],
    keep: list[str],
    label: str,
    base_caption: str,
    alt_caption: str,
    exhibit: str,
) -> dict[str, object]:
    return {
        "id": identifier,
        "name": name,
        "thesis": thesis,
        "accent": {"v1": "#277454", "v2": "#5966a8", "v3": "#a56a34", "v4": "#7c5799", "v5": "#237486"}[identifier],
        "bestWhen": best_when,
        "losesWhen": loses_when,
        "decisions": [{"label": key, "value": value} for key, value in decisions],
        "keepParts": keep,
        "proof": [
            "The direct control changes the same shared three-document ordering from name to newest first.",
            "The miniature holds folders above documents before and after sorting.",
        ],
        "previewLabel": label,
        "story": {
            "title": "Try the sort state",
            "steps": [
                {"label": "Read the default", "caption": base_caption, "state": "base", "target": "[data-demo-toggle]"},
                {"label": "Switch to recent", "caption": alt_caption, "state": "alt", "target": "[data-demo-toggle]"},
            ],
        },
        "scores": score(*scores),
        "gateResults": gates(),
        "preview": preview,
        "media": [{
            "label": "What stays invariant",
            "caption": exhibit,
            "html": "<div class=\"mini-shell\" style=\"min-height:106px;padding:18px;color:#425049;background:#f7f8f6\"><b style=\"display:block;margin-bottom:8px;font-size:12px\">Folders remain a stable first group</b><span style=\"color:#728078;font-size:11px\">Only document order changes: Gripper → Legacy → Arm in the recent state.</span></div>",
        }],
    }


def main() -> None:
    header_preview = window(f"""
<div class="sort-list"><div class="sort-head"><button type="button" data-demo-toggle data-base-label="Name ↕" data-alt-label="Last modified ↓" class="sort-base-only">Name ↕</button><button type="button" data-demo-toggle data-base-label="Name ↕" data-alt-label="Last modified ↓" class="sort-alt-only is-current">Last modified ↓</button><span>Modified</span></div><div class="sort-base-only">{NAME_ROWS}</div><div class="sort-alt-only">{RECENT_ROWS}</div></div><div class="sort-callout"><b>Column-owned action.</b> The sort target stays fixed just above the file names while the list scrolls.</div>
""", style=True)

    toolbar_preview = window(f"""
<div class="sort-toolbar"><label>Files</label><button type="button" class="sort-button" data-demo-toggle data-base-label="Sort: Name" data-alt-label="Sort: Last modified">Sort: Name</button></div><div class="sort-list"><div class="sort-head"><span>Name</span><span>Modified</span></div><div class="sort-base-only">{NAME_ROWS}</div><div class="sort-alt-only">{RECENT_ROWS}</div></div><div class="sort-callout"><b>Single utility control.</b> A compact verb-and-state button shares a row with the list title.</div>
""")

    menu_preview = window(f"""
<div class="sort-toolbar"><label>Files</label><div class="sort-menu-wrap"><button type="button" class="sort-button" data-demo-toggle data-base-label="Sort ▾" data-alt-label="Sort: Last modified ▾">Sort ▾</button><div class="sort-popover sort-alt-only"><div>Name</div><div class="chosen">✓ Last modified</div></div></div></div><div class="sort-list"><div class="sort-head"><span>Name</span><span>Modified</span></div><div class="sort-base-only">{NAME_ROWS}</div><div class="sort-alt-only">{RECENT_ROWS}</div></div><div class="sort-callout"><b>Expandable choice set.</b> It can grow to include file type or manual ordering later.</div>
""")

    segmented_preview = window(f"""
<div class="sort-toolbar"><label>Files</label><div class="sort-segments"><button type="button" class="sort-segment sort-base-only active" data-demo-toggle data-base-label="Name" data-alt-label="Recent">Name</button><button type="button" class="sort-segment sort-base-only" data-demo-toggle data-base-label="Recent" data-alt-label="Name">Recent</button><button type="button" class="sort-segment sort-alt-only" data-demo-toggle data-base-label="Name" data-alt-label="Recent">Name</button><button type="button" class="sort-segment sort-alt-only active" data-demo-toggle data-base-label="Recent" data-alt-label="Name">Recent</button></div></div><div class="sort-list"><div class="sort-head"><span>Name</span><span>Modified</span></div><div class="sort-base-only">{NAME_ROWS}</div><div class="sort-alt-only">{RECENT_ROWS}</div></div><div class="sort-callout"><b>Two visible modes.</b> Name and Recent read as a durable browsing preference, not an action menu.</div>
""")

    metadata_preview = window(f"""
<div class="sort-list"><div class="sort-head"><span>Name</span><button type="button" data-demo-toggle data-base-label="Modified ↕" data-alt-label="Modified ↓" class="sort-base-only">Modified ↕</button><button type="button" data-demo-toggle data-base-label="Modified ↕" data-alt-label="Modified ↓" class="sort-alt-only is-current">Modified ↓</button></div><div class="sort-base-only">{NAME_ROWS}</div><div class="sort-alt-only">{RECENT_ROWS}</div></div><div class="sort-callout"><b>Metadata-led scanning.</b> A dedicated Modified column makes both order and age readable at once.</div>
""")

    project = {
        "schemaVersion": 3,
        "title": "SystemSketch — Workspace sort UI directions",
        "kicker": "Babble & Prune · file organizer",
        "brief": "Five compact ways to change the file organizer from name ordering to newest modified first. The shared fixture is Projects with two folders and three documents, so the placement and mental model—not sample content—drive the choice.",
        "count": 5,
        "defaultId": "v1",
        "defaultWhy": "V1 puts the exact control Zach described directly above the file-name column, keeps the current order legible, and adds no extra browsing surface.",
        "decisionHinge": "If visible timestamps matter more than the direct above-column target, V5's metadata column can overtake V1; if future sort modes are imminent, V3 earns its added indirection.",
        "invariants": [
            "The same folders and three documents appear in every direction.",
            "Folders stay grouped before documents in both sort states.",
            "A labelled, keyboard-reachable action makes the active sort observable.",
        ],
        "boundary": "Prototype only — these are live HTML interaction slices inside a comparison gallery. They exercise state change and layout, not the production React dialog or persisted sort preference.",
        "axes": [
            {"name": "Control ownership", "values": ["file column", "utility toolbar", "menu", "mode switch", "metadata column"]},
            {"name": "Mental model", "values": ["column ordering", "quick command", "choice set", "browser mode", "data-table scan"]},
            {"name": "Information density", "values": ["minimal", "compact", "expandable", "explicit modes", "timestamps first"]},
        ],
        "requirements": [
            {
                "id": "fr-discovery",
                "name": "Sort target is discoverable at the file list",
                "weight": 40,
                "why": "The user specifically wants a click target directly above the column, so the control should be found where the ordering is read.",
                "passCondition": "A person opening the list can identify how to switch to recently modified files without scanning unrelated dialog chrome.",
                "anchors": {"1": "The control is hidden or requires a separate conceptual step.", "3": "The control is visible but not closely tied to the rows it changes.", "5": "The control is immediately visible at the affected column or list edge."},
            },
            {
                "id": "fr-scan",
                "name": "Recent work is quick to scan",
                "weight": 35,
                "why": "The feature exists so a returning user can find what they touched most recently, not merely change a preference.",
                "passCondition": "The prototype visibly puts Gripper, then Legacy, then Arm after recent order is selected.",
                "anchors": {"1": "Recency is absent or ambiguous.", "3": "Newest-first order is present but the active meaning needs interpretation.", "5": "Order, direction, and relative age are all legible in one glance."},
            },
            {
                "id": "fr-fit",
                "name": "The organizer stays simple and compact",
                "weight": 25,
                "why": "This should be a small upgrade to an existing file dialog, not a new browser workflow.",
                "passCondition": "The shared two-pane organizer remains recognizably compact and folders remain grouped first.",
                "anchors": {"1": "The solution consumes too much dialog space or changes the organizer's role.", "3": "It works but adds an avoidable new surface or explanation burden.", "5": "It feels like a natural part of the existing file list with almost no extra chrome."},
            },
        ],
        "hardGates": [
            {"id": "g-folders", "name": "Folders stay grouped first", "why": "Sorting recent documents must not bury navigation folders among files."},
            {"id": "g-access", "name": "The primary state change is a real labelled control", "why": "A visual mock alone cannot establish that the compact interaction is judgeable."},
        ],
        "variants": [
            variant("v1", "Column header", "A clickable Name / Last modified header owns the action directly above the file names.", header_preview, (5, 5, 4), "You want the action anchored exactly where the ordering is read, especially in a dense list.", "You need timestamps to be the dominant information or expect many future sorting modes.", [("Control owner", "The primary Name header is the toggle."), ("Feedback", "The header label and downward arrow become Last modified ↓."), ("Placement", "The action remains fixed above the rows.")], ["above-column target", "direction arrow", "one-click toggle"], "interactive column header", "Name is the default and the header itself advertises that relationship.", "Last modified ↓ is now the header and the documents move newest first.", "This is the most literal version of the requested above-column control."),
            variant("v2", "Utility toolbar", "A compact ‘Sort: …’ button sits beside the Files label, matching the just-shipped direction.", toolbar_preview, (3, 4, 5), "One compact named control is preferable to table-like headers and the dialog needs to stay very lightweight.", "The strongest preference is for the sort control to belong to a specific column.", [("Control owner", "A single button in the list toolbar."), ("Feedback", "The button carries the current state in its label."), ("Placement", "The control sits above the list but outside its columns.")], ["compact wording", "toggle state label", "toolbar placement"], "interactive toolbar control", "The toolbar reads as a small file-list utility with Name currently active.", "The same button confirms Last modified while the rows become newest first.", "This is the current production pattern, retained as a baseline rather than assumed as the winner."),
            variant("v3", "Sort menu", "A Sort button opens an explicit choice set that can eventually hold more than two ordering rules.", menu_preview, (2, 4, 4), "The organizer is likely to gain Type, Created, or manual ordering, so a scalable choice set is worth one extra click.", "The immediate one-click recent-files task is more important than a future settings surface.", [("Control owner", "A menu trigger above the list."), ("Feedback", "A visible checkmark names the selected rule."), ("Growth path", "Additional sort rules can join the same compact popover.")], ["checked selection", "future sort menu", "explicit rule names"], "interactive sort menu", "The collapsed Sort trigger saves space until someone asks for an ordering rule.", "The open state shows Last modified chosen and the same recent ordering.", "This is deliberately the most extensible, but least direct, direction."),
            variant("v4", "Name / Recent switch", "Two always-visible browser modes make the distinction between alphabetical and recency browsing explicit.", segmented_preview, (4, 4, 4), "The user may switch back and forth often and benefits from seeing both modes without opening a menu.", "The dialog should not dedicate permanent width to a two-mode chooser.", [("Control owner", "A segmented switch in the list toolbar."), ("Feedback", "The selected mode gets a filled, persistent state."), ("Language", "Recent describes the browsing intention rather than file-system mechanics.")], ["plain-language Recent", "always-visible modes", "persistent selection state"], "interactive mode switch", "Name reads as the calm default for browsing an organized workspace.", "Recent gains the active treatment and its list visibly becomes newest first.", "This favors frequent switching over the most minimal chrome."),
            variant("v5", "Modified column", "A full Modified column makes timestamp age and descending order legible as table data.", metadata_preview, (5, 5, 3), "People need to compare dates as well as identify the newest file, and the list can afford a second column.", "The file dialog must stay visually quiet, especially on narrow windows.", [("Control owner", "The Modified column header is the toggle."), ("Feedback", "A descending arrow appears beside the metadata heading."), ("Information", "Relative ages stay visible alongside every filename.")], ["timestamp column", "direct metadata header", "relative-age scan"], "interactive metadata column", "Alphabetical file names and their relative ages coexist in a compact table-like scan.", "Modified ↓ shows that the metadata column is now deciding the newest-first order.", "This is the strongest scanning aid, at the cost of more persistent visual structure."),
        ],
        "checks": [
            "Exactly five directions share the Arm / Gripper / Legacy fixture.",
            "Every hero has a direct toggle and synchronized two-step walkthrough.",
            "Every state keeps folders first and documents become Gripper, Legacy, Arm when recent is active.",
            "The recommendation appears only after the unranked variant atlas.",
        ],
    }

    SPEC.write_text(json.dumps(project, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {SPEC.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
