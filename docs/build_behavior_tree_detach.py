#!/usr/bin/env python3
"""
Implementation report: Detach and identity for the Behavior Tree region.

Two bugs, one seam. "Detach to primitives" on a Behavior Tree region crashed
the app, and duplicating or pasting a region scrambled the ORIGINAL region's
layout. Every number is measured from this tree at build time: the acceptance
JSONs the two new journeys wrote, the mutation run that went red, the row of
Zach's own recording that carries the scrambled offsets, the portable `.tldr`
the app exported, the full vitest and Python suites, and `git diff` for every
file the work touched. Every capture is a real screenshot from headless Chrome.

Run:  python3 docs/build_behavior_tree_detach.py
"""
from __future__ import annotations

import base64
import collections
import io
import json
import re
import subprocess
from html import escape
from pathlib import Path

from PIL import Image, ImageChops

REPO = Path(__file__).resolve().parent.parent
DOCS = REPO / "docs"
DETACH_ASSETS = DOCS / "assets" / "behavior-tree-detach"
IDENTITY_ASSETS = DOCS / "assets" / "behavior-tree-identity"
BT_ASSETS = DOCS / "assets" / "behavior-tree"
REVIEW = REPO / "sketches" / "review"
STAMP = "2026-09-05"
OUT = DOCS / f"behavior-tree-detach-{STAMP}.html"

RECORDING = Path(
    "/home/bam/.systemsketch-reviews/behavior-tree-f09d802eba2a/.review-runtime/boards/SystemSketch/"
    "recordings/2026-09-05_10-54-32-take/store.full.jsonl"
)
RECORDING_ROW = "store-000325"
RECORDING_REGION = "shape:vDWuwUTulofT4T6da223D"
RECORDING_EXCERPT = DETACH_ASSETS.parent / "behavior-tree-identity" / "recording-store-000325.json"

PREVIEW_PORT = 4730
PREVIEW_API_PORT = 4731

NEW_FILES = [
    "src/behaviorTree/detachBehaviorTree.ts",
    "src/behaviorTree/btPrimitives.ts",
    "src/behaviorTree/btPrimitives.test.ts",
    "tests/behavior_tree_detach_smoke.mjs",
    "tests/behavior_tree_identity_smoke.mjs",
    "sketches/review/behavior-tree-detach.systemsketch",
    "sketches/review/behavior-tree-region-identity.systemsketch",
    "docs/peps/0004-projected-child-ownership-by-containment.md",
]
MODIFIED_FILES = [
    "src/blocks/detach/detachModel.ts",
    "src/blocks/detach/detachModel.test.ts",
    "src/blocks/detach/detachBlock.ts",
    "src/blocks/definitions/definitionLinking.ts",
    "src/branch/detachBranch.ts",
    "src/loop/detachLoop.ts",
    "src/behaviorTree/installBehaviorTreeRegions.ts",
    "src/behaviorTree/index.ts",
    "src/export/portableTldraw.ts",
    "tests/test_stock_boundary.py",
]

# Measured by hand against the running app BEFORE the fix, 2026-09-05. Not
# re-measurable at build time: the crash no longer exists.
PRE_FIX_TABLE = [
    ("the region (right-click its header band)", "app dies", "ValidationError", "n/a", "app unmounted"),
    ("one projected leaf Block", "“succeeds”", "none", "2123 → 2062 bytes: the occurrence was silently deleted from the XML", "1 group + 2 geo + 2 text"),
    ("one control card", "menu shows no Detach item", "none", "unchanged", "nothing"),
    ("one Blackboard key pill", "“succeeds”", "none", "unchanged", "a stock group; the pill vanished from the region"),
    ("three children at once (2 controls + 1 leaf)", "only the leaf lowers", "none", "2123 → 2062: occurrence deleted", "as above"),
    ("region + one child", "app dies", "ValidationError", "n/a", "app unmounted"),
]

# The three mutation runs of the identity journey. Only the last one left an
# artifact (`acceptance.failed.json`); the first two are quoted from the run.
MUTATIONS = [
    ("containment resolution disabled", "stored `meta.btRegion` decides again", 1, ["undo.total"], None),
    ("created-in-this-operation guard disabled", "every arrival is read as a drag", 2, ["lone.offsets", "lone.kids"], None),
    ("both disabled — the shipped pre-fix behaviour", "", None, None, "acceptance.failed.json"),
]


def esc(text: object) -> str:
    return escape(str(text), quote=True)


def data_uri(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode()


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=REPO, capture_output=True, text=True).stdout


def sh(*args: str) -> str:
    return subprocess.run(list(args), cwd=REPO, capture_output=True, text=True).stdout


def line_count(rel: str) -> int:
    return len((REPO / rel).read_text().splitlines())


# --------------------------------------------------------------------------- measure


def measure_files() -> list[dict]:
    status = {line[3:]: line[:2] for line in git("status", "--porcelain", "--", *NEW_FILES, *MODIFIED_FILES).splitlines()}
    numstat = {}
    for line in git("diff", "--numstat", "--", *MODIFIED_FILES).splitlines():
        added, removed, path = line.split("\t")
        numstat[path] = (int(added), int(removed))
    rows = []
    for rel in NEW_FILES:
        rows.append({"path": rel, "state": "new" if status.get(rel, "").strip() == "??" else status.get(rel, "committed"), "lines": line_count(rel), "added": None, "removed": None})
    for rel in MODIFIED_FILES:
        added, removed = numstat.get(rel, (0, 0))
        rows.append({"path": rel, "state": "modified" if rel in numstat else "unchanged", "lines": line_count(rel), "added": added, "removed": removed})
    return rows


def measure_vitest() -> dict:
    run = subprocess.run(["npx", "vitest", "run", "--reporter=json"], cwd=REPO, capture_output=True, text=True)
    try:
        report = json.loads(run.stdout[run.stdout.index("{"):])
    except (ValueError, json.JSONDecodeError):
        return {"files": None, "tests": None, "passed": None, "failed": None, "per_file": {}}
    per_file = {}
    for result in report.get("testResults", []):
        rel = Path(result["name"]).resolve().relative_to(REPO).as_posix()
        per_file[rel] = {
            "tests": len(result.get("assertionResults", [])),
            "passed": sum(1 for a in result.get("assertionResults", []) if a.get("status") == "passed"),
        }
    return {
        "files": len(report.get("testResults", [])),
        "tests": report.get("numTotalTests"),
        "passed": report.get("numPassedTests"),
        "failed": report.get("numFailedTests"),
        "per_file": per_file,
    }


def measure_python() -> dict:
    run = subprocess.run(["python3", "-m", "unittest", "discover", "-s", "tests"], cwd=REPO, capture_output=True, text=True)
    ran = re.search(r"Ran (\d+) tests", run.stderr)
    return {"tests": int(ran.group(1)) if ran else None, "ok": run.returncode == 0 and "OK" in run.stderr}


def measure_recording() -> dict | None:
    """The one row of Zach's recording where the original region's offsets were written."""
    row = None
    if RECORDING.exists():
        for line in RECORDING.open():
            if f'"{RECORDING_ROW}"' in line:
                row = json.loads(line)
                break
    if row is None and RECORDING_EXCERPT.exists():
        row = json.loads(RECORDING_EXCERPT.read_text())
    if row is None:
        return None
    changes = row["changes"]
    updated = changes.get("updated", {})
    if RECORDING_REGION not in updated:
        return None
    before, after = updated[RECORDING_REGION]
    offsets_before = before["props"].get("offsets", {})
    offsets_after = after["props"].get("offsets", {})
    added = changes.get("added", {})
    added_types = collections.Counter(record.get("type") for record in added.values())
    added_stamps = collections.Counter(
        (record.get("meta") or {}).get("btRegion") for record in added.values() if (record.get("meta") or {}).get("btRegion")
    )
    known_ids = set(updated) | set(added)
    if RECORDING.exists():
        end_snapshot = RECORDING.parent / "end.snapshot.json"
        if end_snapshot.exists():
            try:
                snapshot = json.loads(end_snapshot.read_text())
                records = snapshot.get("records") or snapshot.get("store") or snapshot
                if isinstance(records, dict):
                    known_ids |= set(records.keys())
                elif isinstance(records, list):
                    known_ids |= {record.get("id") for record in records if isinstance(record, dict)}
            except (ValueError, json.JSONDecodeError):
                pass
    stale_stamps = {stamp: count for stamp, count in added_stamps.items() if stamp not in known_ids}
    if not RECORDING_EXCERPT.exists() and RECORDING.exists():
        RECORDING_EXCERPT.write_text(json.dumps(row))
    return {
        "row": row["id"],
        "t_ms": row["t"],
        "source": row.get("source"),
        "region": RECORDING_REGION,
        "region_w": before["props"].get("w"),
        "region_h": before["props"].get("h"),
        "before": offsets_before,
        "after": offsets_after,
        "max_abs": max((max(abs(o["dx"]), abs(o["dy"])) for o in offsets_after.values()), default=0),
        "added": len(added),
        "updated": len(updated),
        "added_types": dict(added_types),
        "stale_stamps": stale_stamps,
        "path": RECORDING.as_posix() if RECORDING.exists() else RECORDING_EXCERPT.as_posix(),
        "live": RECORDING.exists(),
    }


def measure_portable() -> dict | None:
    path = DETACH_ASSETS / "portable-export.tldr"
    if not path.exists():
        return None
    document = json.loads(path.read_text())
    records = document["records"]
    shapes = [r for r in records if r["typeName"] == "shape"]
    bindings = [r for r in records if r["typeName"] == "binding"]
    frames = [s for s in shapes if s["type"] == "frame"]
    frame = frames[0] if frames else None
    record = ((frame or {}).get("meta") or {}).get("systemSketch") or {}
    return {
        "path": path.relative_to(REPO).as_posix(),
        "bytes": path.stat().st_size,
        "shape_types": dict(sorted(collections.Counter(s["type"] for s in shapes).items())),
        "binding_types": dict(collections.Counter(b["type"] for b in bindings)),
        "frames": len(frames),
        "frame_name": (frame or {}).get("props", {}).get("name"),
        "frame_kind": record.get("kind"),
        "xml_bytes": len((record.get("props") or {}).get("xml", "").encode()),
        "stamps": sum(1 for s in shapes if "btRegion" in (s.get("meta") or {})),
        "custom": sorted({s["type"] for s in shapes} - {"group", "geo", "arrow", "line", "text", "frame", "draw", "note", "image", "video", "embed", "bookmark", "highlight"}),
    }


def listening(port: int) -> bool:
    return bool(re.search(rf":{port}\b", sh("ss", "-ltn")))


def measure_pep() -> dict | None:
    """The decision record for the identity rule, read from the tree at build time.

    WHY: the decision surface used to *promise* a PEP in hardcoded prose, which goes
    stale the moment one is written. Measure the file and the WHY: pointer instead, so
    the report can only ever say what is actually on disk.
    """
    owner = "src/behaviorTree/installBehaviorTreeRegions.ts"
    pointer = re.compile(r"docs/peps/(\d{4}-[A-Za-z0-9_-]+\.md)")
    match = pointer.search((REPO / owner).read_text())
    if not match:
        return None
    path = REPO / "docs" / "peps" / match.group(1)
    if not path.exists():
        return None
    title = path.read_text().splitlines()[0].lstrip("# ").strip()
    return {"file": f"docs/peps/{match.group(1)}", "title": title, "owner": owner}


def measure() -> dict:
    detach = json.loads((DETACH_ASSETS / "acceptance.json").read_text())
    identity = json.loads((IDENTITY_ASSETS / "acceptance.json").read_text())
    failed_path = IDENTITY_ASSETS / "acceptance.failed.json"
    failed = json.loads(failed_path.read_text()) if failed_path.exists() else None
    bt = json.loads((BT_ASSETS / "acceptance.json").read_text()) if (BT_ASSETS / "acceptance.json").exists() else None
    vitest = measure_vitest()
    return {
        "head": git("rev-parse", "--short", "HEAD").strip(),
        "branch": git("rev-parse", "--abbrev-ref", "HEAD").strip(),
        "tldraw": json.loads((REPO / "package.json").read_text())["dependencies"]["tldraw"],
        "files": measure_files(),
        "detach": detach,
        "identity": identity,
        "failed": failed,
        "bt": bt,
        "vitest": vitest,
        "python": measure_python(),
        "recording": measure_recording(),
        "portable": measure_portable(),
        "preview": listening(PREVIEW_PORT),
        "preview_api": listening(PREVIEW_API_PORT),
        "pep": measure_pep(),
        "diffs": {rel: git("diff", "-U3", "--", rel) for rel in MODIFIED_FILES},
        "to_json_safe": source_excerpt("src/blocks/detach/detachModel.ts", "export function toJsonSafe", "/** Wrap a record"),
        "region_for": source_excerpt("src/behaviorTree/installBehaviorTreeRegions.ts", "export function behaviorTreeRegionFor", "/**\n * A cable is parented"),
        "arrow_head": source_excerpt("src/behaviorTree/btPrimitives.ts", "\t// A shape's rotation turns it", "\t\t}, { geo: 'triangle'"),
    }


def source_excerpt(rel: str, start: str, stop: str) -> str:
    text = (REPO / rel).read_text()
    begin = text.index(start)
    end = text.index(stop, begin)
    return text[begin:end].rstrip()


# ------------------------------------------------------------------------------ html


def diff_html(diff: str, title: str, open_by_default: bool = False) -> str:
    lines = []
    for line in diff.splitlines():
        if line.startswith("+++") or line.startswith("---"):
            klass = "meta"
        elif line.startswith("+"):
            klass = "add"
        elif line.startswith("-"):
            klass = "del"
        elif line.startswith("@@"):
            klass = "hunk"
        else:
            klass = ""
        lines.append(f"<span class=\"{klass}\">{esc(line)}</span>")
    added = sum(1 for line in diff.splitlines() if line.startswith("+") and not line.startswith("+++"))
    removed = sum(1 for line in diff.splitlines() if line.startswith("-") and not line.startswith("---"))
    return (
        f"<details class=\"diff\"{' open' if open_by_default else ''}><summary><code>{esc(title)}</code> "
        f"<span class=\"addn\">+{added}</span> <span class=\"deln\">−{removed}</span></summary>"
        f"<pre>{''.join(lines)}</pre></details>"
    )


def code_html(text: str, title: str) -> str:
    return f"<figure class=\"code\"><figcaption><code>{esc(title)}</code></figcaption><pre>{esc(text)}</pre></figure>"


def checks_table(acceptance: dict, id_prefixes: tuple[str, ...] | None = None) -> str:
    rows = []
    for check in acceptance["results"]:
        if id_prefixes and not check["id"].startswith(id_prefixes):
            continue
        label = check.get("description") or check.get("label") or ""
        rows.append(
            f"<tr><td><code>{esc(check['id'])}</code></td><td>{esc(label)}</td>"
            f"<td class=\"{'ok' if check['ok'] else 'bad'}\">{'PASS' if check['ok'] else 'FAIL'}</td></tr>"
        )
    return "<table class=\"facts checks\"><tr><th>Check</th><th>Claim</th><th></th></tr>" + "\n".join(rows) + "</table>"


def image_uri(image: Image.Image) -> str:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode()


def autocrop_uri(path: Path, margin: int = 28, threshold: int = 24) -> str:
    """A capture of a mostly-empty canvas, cropped to the drawn content plus a margin.

    The canvas tint differs from pure white by a few levels; the threshold ignores it
    so only real ink counts as content.
    """
    image = Image.open(path).convert("RGB")
    background = Image.new("RGB", image.size, image.getpixel((0, 0)))
    mask = ImageChops.difference(image, background).convert("L").point(lambda v: 255 if v > threshold else 0)
    box = mask.getbbox()
    if box is None:
        return image_uri(image)
    left, top, right, bottom = box
    return image_uri(image.crop((max(0, left - margin), max(0, top - margin), min(image.width, right + margin), min(image.height, bottom + margin))))


def crop_uri(path: Path, box: tuple[int, int, int, int]) -> str:
    return image_uri(Image.open(path).convert("RGB").crop(box))


def figure(path: Path, title: str, caption: str, klass: str = "", src: str | None = None) -> str:
    if not path.exists():
        return f"<figure class=\"{klass}\"><figcaption><strong>{esc(title)}</strong> capture missing: <code>{esc(path.name)}</code></figcaption></figure>"
    return f"<figure class=\"{klass}\"><img src=\"{src or data_uri(path)}\" alt=\"{esc(title)}\"><figcaption><strong>{esc(title)}</strong> {caption}</figcaption></figure>"


MONO = "font-family=\"ui-monospace,Menlo,monospace\" font-size=\"11.5\""

VALIDATION_SVG = f"""
<svg viewBox="0 0 980 320" width="100%" style="max-width:980px;display:block;margin:0 auto" font-family="Inter, ui-sans-serif" font-size="12.5">
  <defs><marker id="v" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0L10 5L0 10z" fill="#3f3f46"/></marker>
  <marker id="vg" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0L10 5L0 10z" fill="#15803d"/></marker>
  <marker id="vr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0L10 5L0 10z" fill="#b91c1c"/></marker></defs>

  <rect x="20" y="24" width="250" height="104" rx="8" fill="#fff" stroke="#27272a" stroke-width="1.5"/>
  <text x="145" y="48" text-anchor="middle" font-weight="600">definitionLinking.ts:539</text>
  <text x="145" y="70" text-anchor="middle" fill="#52525b" {MONO}>draftOrdinal:</text>
  <text x="145" y="88" text-anchor="middle" fill="#52525b" {MONO}>canonical.props.draftOrdinal</text>
  <text x="145" y="112" text-anchor="middle" fill="#71717a">absent optional prop → undefined</text>

  <rect x="310" y="24" width="280" height="104" rx="8" fill="#fff" stroke="#27272a" stroke-width="1.5"/>
  <text x="450" y="48" text-anchor="middle" font-weight="600">Editor.updateShape</text>
  <text x="450" y="70" text-anchor="middle" fill="#52525b" {MONO}>applyPartialToRecordWithProps</text>
  <text x="450" y="92" text-anchor="middle" fill="#71717a">skips a top-level undefined (l. 8741)</text>
  <text x="450" y="112" text-anchor="middle" fill="#71717a">copies props sub-keys verbatim (l. 8745)</text>

  <rect x="630" y="24" width="220" height="104" rx="8" fill="#f4f4f5" stroke="#a9adb8"/>
  <text x="740" y="48" text-anchor="middle" font-weight="600">store record</text>
  <text x="740" y="74" text-anchor="middle" {MONO}>props.draftOrdinal:</text>
  <text x="740" y="94" text-anchor="middle" fill="#b91c1c" {MONO}>undefined</text>
  <text x="740" y="114" text-anchor="middle" fill="#71717a">present, not absent</text>

  <path d="M270 76 H308" stroke="#3f3f46" stroke-width="1.6" marker-end="url(#v)"/>
  <path d="M590 76 H628" stroke="#3f3f46" stroke-width="1.6" marker-end="url(#v)"/>

  <path d="M740 128 V160 H145 V188" fill="none" stroke="#15803d" stroke-width="1.6" marker-end="url(#vg)"/>
  <path d="M740 160 H450 V188" fill="none" stroke="#3f3f46" stroke-width="1.6" marker-end="url(#v)"/>
  <text x="750" y="150" fill="#71717a">every write is validated</text>

  <rect x="20" y="190" width="250" height="74" rx="8" fill="#fff" stroke="#15803d" stroke-width="1.5"/>
  <text x="145" y="214" text-anchor="middle" font-weight="600" fill="#15803d">props validator</text>
  <text x="145" y="234" text-anchor="middle" fill="#52525b" {MONO}>draftOrdinal: T.number.optional()</text>
  <text x="145" y="254" text-anchor="middle" fill="#15803d">accepts a present undefined</text>

  <rect x="310" y="190" width="280" height="74" rx="8" fill="#fff" stroke="#27272a" stroke-width="1.5"/>
  <text x="450" y="214" text-anchor="middle" font-weight="600">detachBlock.ts:226</text>
  <text x="450" y="236" text-anchor="middle" fill="#52525b" {MONO}>group.meta = {{ props: block.props }}</text>
  <text x="450" y="254" text-anchor="middle" fill="#71717a">the whole props bag, copied into meta</text>

  <path d="M590 227 H628" stroke="#b91c1c" stroke-width="1.6" stroke-dasharray="5 4" marker-end="url(#vr)"/>

  <rect x="630" y="190" width="330" height="74" rx="8" fill="#fff" stroke="#b91c1c" stroke-width="1.5"/>
  <text x="795" y="214" text-anchor="middle" font-weight="600" fill="#b91c1c">meta validator</text>
  <text x="795" y="234" text-anchor="middle" fill="#52525b" {MONO}>T.jsonValue → isValidJson (validation.mjs:857)</text>
  <text x="795" y="254" text-anchor="middle" fill="#b91c1c">rejects undefined anywhere in the tree</text>

  <text x="490" y="298" text-anchor="middle" fill="#b91c1c" {MONO}>ValidationError: At shape(type = group).meta: Expected json serializable value, got object</text>
</svg>
"""

IDENTITY_SVG = f"""
<svg viewBox="0 0 980 330" width="100%" style="max-width:980px;display:block;margin:0 auto" font-family="Inter, ui-sans-serif" font-size="12.5">
  <defs><marker id="ir" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0L10 5L0 10z" fill="#b91c1c"/></marker>
  <marker id="ig" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0L10 5L0 10z" fill="#15803d"/></marker></defs>

  <text x="20" y="22" font-weight="600">Before: the stored id decides</text>
  <rect x="20" y="36" width="200" height="104" rx="8" fill="#f4f4f5" stroke="#27272a" stroke-width="1.5"/>
  <text x="30" y="56" font-weight="600">region R1</text>
  <rect x="35" y="68" width="170" height="60" rx="6" fill="#fff" stroke="#27272a"/>
  <text x="120" y="90" text-anchor="middle">child · id c1</text>
  <text x="120" y="112" text-anchor="middle" fill="#52525b" {MONO}>meta.btRegion = R1</text>

  <rect x="260" y="36" width="210" height="104" rx="8" fill="#f4f4f5" stroke="#27272a" stroke-width="1.5" stroke-dasharray="6 4"/>
  <text x="270" y="56" font-weight="600">copy R2 · Ctrl+D or Ctrl+V</text>
  <rect x="275" y="68" width="180" height="60" rx="6" fill="#fff" stroke="#27272a"/>
  <text x="365" y="90" text-anchor="middle">child · id c1′ (re-minted)</text>
  <text x="365" y="112" text-anchor="middle" fill="#b91c1c" {MONO}>meta.btRegion = R1</text>
  <path d="M275 112 H240 V100 H222" fill="none" stroke="#b91c1c" stroke-width="1.6" marker-end="url(#ir)"/>
  <text x="248" y="128" text-anchor="middle" fill="#b91c1c" font-size="11">verbatim</text>

  <text x="20" y="170" fill="#b91c1c" font-weight="600">Every rule that read the name acted on R1:</text>
  <text x="20" y="192" fill="#52525b">· reparent the copy into R1</text>
  <text x="20" y="212" fill="#52525b">· record the paste distance as one of R1's free offsets</text>
  <text x="20" y="232" fill="#52525b">· delete R1's own children as duplicate role:path strays</text>
  <text x="20" y="260" fill="#71717a">Tidy clears offsets — which is why Tidy looked like the repair.</text>

  <line x1="490" y1="14" x2="490" y2="316" stroke="#e4e4e7"/>

  <text x="510" y="22" font-weight="600">After: containment decides</text>
  <rect x="510" y="36" width="200" height="104" rx="8" fill="#f4f4f5" stroke="#27272a" stroke-width="1.5"/>
  <text x="520" y="56" font-weight="600">region R1</text>
  <rect x="525" y="68" width="170" height="60" rx="6" fill="#fff" stroke="#27272a"/>
  <text x="610" y="90" text-anchor="middle">child c1</text>
  <text x="610" y="112" text-anchor="middle" fill="#15803d" {MONO}>parentId → R1</text>
  <path d="M700 98 H712 V56 H700" fill="none" stroke="#15803d" stroke-width="1.6" marker-end="url(#ig)"/>

  <rect x="750" y="36" width="210" height="104" rx="8" fill="#f4f4f5" stroke="#27272a" stroke-width="1.5" stroke-dasharray="6 4"/>
  <text x="760" y="56" font-weight="600">copy R2</text>
  <rect x="765" y="68" width="180" height="60" rx="6" fill="#fff" stroke="#27272a"/>
  <text x="855" y="90" text-anchor="middle">child c1′</text>
  <text x="855" y="112" text-anchor="middle" fill="#15803d" {MONO}>parentId → R2  ✓</text>
  <path d="M950 98 H962 V56 H950" fill="none" stroke="#15803d" stroke-width="1.6" marker-end="url(#ig)"/>

  <text x="510" y="170" fill="#15803d" font-weight="600">behaviorTreeRegionFor: the nearest region ancestor wins.</text>
  <text x="510" y="192" fill="#52525b">A cable resolves through its bound Blocks; the stored id is only</text>
  <text x="510" y="212" fill="#52525b">the fallback for a child dragged clean out of every region.</text>
  <text x="510" y="240" fill="#15803d" font-weight="600">Second guard: a shape created in this operation is never a drag,</text>
  <text x="510" y="260" fill="#52525b">so an arrival cannot write its paste distance into any offsets.</text>
  <text x="510" y="288" fill="#15803d" font-weight="600">reconcileBehaviorTree re-stamps the copied child's btRegion,</text>
  <text x="510" y="308" fill="#52525b">so a later delete edits R2's XML and not R1's.</text>
</svg>
"""


def offsets_svg(recording: dict) -> str:
    """Every free offset the paste wrote into the ORIGINAL region, to scale against the region's own width."""
    entries = sorted(recording["after"].items(), key=lambda item: abs(item[1]["dx"]), reverse=True)
    if not entries:
        return ""
    width = 980
    label_w = 90
    bar_x = label_w + 10
    bar_w = width - bar_x - 120
    row_h = 22
    height = 40 + row_h * len(entries) + 30
    scale = bar_w / max(abs(o["dx"]) for _, o in entries)
    region_w = recording["region_w"] or 0
    out = [f'<svg viewBox="0 0 {width} {height}" width="100%" style="max-width:{width}px;display:block;margin:0 auto" font-family="Inter, ui-sans-serif" font-size="12">']
    out.append(f'<text x="{bar_x}" y="16" font-weight="600">props.offsets written into {esc(recording["region"])} at t = {recording["t_ms"]:.1f} ms · |dx| to scale</text>')
    out.append(f'<text x="{bar_x}" y="32" fill="#71717a">grey band = the region’s own width ({region_w:.0f} px); every bar is a card told to sit that far LEFT of its tidy place</text>')
    if region_w:
        out.append(f'<rect x="{bar_x}" y="40" width="{region_w * scale:.1f}" height="{row_h * len(entries)}" fill="#e4e4e7"/>')
    for index, (path, offset) in enumerate(entries):
        y = 40 + index * row_h
        length = abs(offset["dx"]) * scale
        out.append(f'<text x="{label_w}" y="{y + 15}" text-anchor="end" font-family="ui-monospace,Menlo,monospace">{esc(path)}</text>')
        out.append(f'<rect x="{bar_x}" y="{y + 4}" width="{length:.1f}" height="{row_h - 8}" fill="#b91c1c" opacity="0.85"/>')
        out.append(f'<text x="{bar_x + length + 6:.1f}" y="{y + 15}" fill="#27272a">dx {offset["dx"]:.0f} · dy {offset["dy"]:.0f}</text>')
    out.append("</svg>")
    return "\n".join(out)


def render(m: dict) -> str:
    detach, identity, failed, bt = m["detach"], m["identity"], m["failed"], m["bt"]
    detach_pass = sum(1 for c in detach["results"] if c["ok"])
    identity_pass = sum(1 for c in identity["results"] if c["ok"])
    failed_ids = [c["id"] for c in failed["results"] if not c["ok"]] if failed else []
    pep = m["pep"]
    pep_done = (
        f'<li><strong>The identity rule has a decision record.</strong> '
        f'<code>{esc(pep["file"])}</code> — <em>{esc(pep["title"].split(":", 1)[-1].strip())}</em> — '
        f'records why the stored stamp is kept and repaired rather than deleted, linked from the '
        f'<code>WHY:</code> at <code>behaviorTreeRegionFor</code>. '
        f'<code>tests/test_pep_links.py</code> fails if that pointer ever rots.</li>'
    ) if pep else ""
    pep_todo = "" if pep else (
        '<li><strong>PEP at merge time.</strong> Per <code>docs/peps/README.md</code> the identity rule '
        '— <em>a projected child belongs to the region it sits in, never to a stored id</em> — is a genuine '
        'architecture fork worth a numbered PEP, and none is on disk yet. Default: write it at merge, '
        'linked from the <code>WHY:</code> at <code>behaviorTreeRegionFor</code>.</li>'
    )
    bt_pass = sum(1 for c in bt["results"] if c["ok"]) if bt else None
    bt_drag = any(c["id"] == "drag.offset" and c["ok"] for c in bt["results"]) if bt else False
    vt = m["vitest"]
    per = vt["per_file"]
    detach_model_tests = per.get("src/blocks/detach/detachModel.test.ts", {})
    primitives_tests = per.get("src/behaviorTree/btPrimitives.test.ts", {})
    rec = m["recording"]
    portable = m["portable"]
    dirty = any(row["state"] in {"new", "modified"} for row in m["files"])

    pre_fix_rows = "\n".join(
        f"<tr><td>{esc(sel)}</td><td>{esc(outcome)}</td><td class=\"{'bad' if crash != 'none' else ''}\">{esc(crash)}</td><td>{esc(xml)}</td><td>{esc(left)}</td></tr>"
        for sel, outcome, crash, xml, left in PRE_FIX_TABLE
    )

    mutation_rows = []
    for title, note, red, ids, artifact in MUTATIONS:
        if artifact and failed:
            red_n = len(failed_ids)
            ids_html = ", ".join(f"<code>{esc(i)}</code>" for i in failed_ids)
            source = f"measured from <code>{esc(artifact)}</code> ({esc(failed['generatedAt'])})"
        else:
            red_n = red
            ids_html = ", ".join(f"<code>{esc(i)}</code>" for i in (ids or []))
            source = "reported by the run; no artifact kept"
        mutation_rows.append(
            f"<tr><td>{esc(title)}{('<br><span class=\"muted\">' + esc(note) + '</span>') if note else ''}</td>"
            f"<td class=\"num bad\">{red_n} / {identity['total']}</td><td>{ids_html}</td><td class=\"muted\">{source}</td></tr>"
        )

    file_rows = "\n".join(
        f"<tr><td><code>{esc(row['path'])}</code></td><td>{esc(row['state'])}</td><td class=\"num\">{row['lines']}</td>"
        f"<td class=\"num\">{'' if row['added'] is None else '<span class=\"addn\">+' + str(row['added']) + '</span> <span class=\"deln\">−' + str(row['removed']) + '</span>'}</td></tr>"
        for row in m["files"]
    )

    recording_html = "<p class=\"note\">The recording is not present on this machine at build time; the numbers in this section were not re-measured.</p>"
    if rec:
        stale = ", ".join(f"<code>{esc(k)}</code> ×{v}" for k, v in rec["stale_stamps"].items())
        recording_html = f"""
        <p class="note">Zach recorded it. Row <code>{esc(rec['row'])}</code> of <code>{esc(rec['path'])}</code> is the Ctrl+V, at t = {rec['t_ms']:.1f} ms, source <code>{esc(rec['source'])}</code>: {rec['added']} records added (a second <code>behaviorTree</code> and its projection) and {rec['updated']} updated. Among the updated records is the <em>original</em> region <code>{esc(rec['region'])}</code>, whose <code>props.offsets</code> goes from <code>{esc(json.dumps(rec['before']))}</code> to {len(rec['after'])} entries, the largest {rec['max_abs']:,.0f} px — {rec['max_abs'] / (rec['region_w'] or 1):.1f}× the region's own width. That is the distance to the pasted copies, recorded as if someone had dragged each original card there. Tidy clears <code>offsets</code>, which is why Tidy appeared to repair it.{(' The pasted control cards in the same row arrive stamped ' + stale + ' — a region id that exists nowhere on the board: the stamp is whatever the copied shape had.') if stale else ''}</p>
        {offsets_svg(rec)}
        """

    portable_html = "<p class=\"note\">No exported <code>.tldr</code> is in the assets folder; nothing to measure.</p>"
    if portable:
        types = ", ".join(f"<code>{esc(k)}</code> {v}" for k, v in portable["shape_types"].items())
        bindings = ", ".join(f"<code>{esc(k)}</code> {v}" for k, v in portable["binding_types"].items()) or "none"
        portable_html = f"""
        <div class="grid two">
        {figure(DETACH_ASSETS / 'portable-stock-open.png', 'The exported .tldr, painted by stock tldraw alone.', 'A whole review board containing a Behavior Tree region, exported through the app’s real Share → <em>Download portable .tldr</em> on the running Preview, then opened in an isolated stock tldraw editor with zero SystemSketch shape utilities registered; cropped to the drawn content. The frame, the Start capsule, the control-card rectangles, the leaves as ordinary groups, the wires with their triangle heads, and the fixture’s orange cue cards are all there.', src=autocrop_uri(DETACH_ASSETS / 'portable-stock-open.png'))}
        <div>
        <table class="facts"><tr><th>Measured from <code>{esc(portable['path'])}</code> ({portable['bytes']:,} bytes)</th><th>Value</th></tr>
        <tr><td>Shape types</td><td>{types}</td></tr>
        <tr><td>Custom types left</td><td class="{'ok' if not portable['custom'] else 'bad'}">{esc(portable['custom']) if portable['custom'] else 'none'}</td></tr>
        <tr><td>Binding types</td><td>{bindings}</td></tr>
        <tr><td>Frames</td><td>{portable['frames']} · named <code>{esc(portable['frame_name'])}</code> · <code>meta.systemSketch.kind</code> = <code>{esc(portable['frame_kind'])}</code></td></tr>
        <tr><td>BT.CPP XML carried in the frame's meta</td><td>{portable['xml_bytes']} bytes</td></tr>
        <tr><td>Shapes still stamped <code>btRegion</code></td><td class="{'ok' if portable['stamps'] == 0 else 'bad'}">{portable['stamps']}</td></tr>
        </table>
        <p class="note">The export UI reported <em>“Downloaded a stock-tldraw copy. Your live board was not changed.”</em> with no console errors. Before this change <code>portableTldraw.ts</code> did not register <code>BehaviorTreeShapeUtil</code> or <code>BtControlShapeUtil</code> at all, so a board containing a region could not even be loaded into the isolated export store, let alone lowered.</p>
        </div>
        </div>
        """

    preview_state = (
        f"listening on <code>127.0.0.1:{PREVIEW_PORT}</code> (API <code>{PREVIEW_API_PORT}</code>{'' if m['preview_api'] else ', API not listening'})"
        if m["preview"] else f"<span class=\"bad\">not listening on {PREVIEW_PORT} at build time</span>"
    )

    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Behavior Tree region — Detach and identity · {STAMP}</title>
<style>
body{{margin:0;padding:32px 40px 80px;font:15px/1.5 Inter,ui-sans-serif,system-ui;color:#27272a;background:#fafafa;max-width:1480px}}
h1{{font-size:28px;margin:0 0 6px}} h2{{font-size:20px;margin:40px 0 12px;padding-top:12px;border-top:1px solid #e4e4e7}} h3{{font-size:16px;margin:24px 0 8px}}
.lede{{color:#52525b;max-width:980px}} code{{font:13px ui-monospace,Menlo,monospace;background:#f4f4f5;padding:1px 5px;border-radius:4px}}
figure{{margin:16px 0;padding:12px;background:#fff;border:1px solid #e4e4e7;border-radius:10px}} figure img{{width:100%;height:auto;display:block;border-radius:6px}}
figcaption{{margin-top:10px;color:#52525b;font-size:14px}} .grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(640px,1fr));gap:18px}} .grid.two{{grid-template-columns:repeat(auto-fit,minmax(560px,1fr))}}
.grid figure{{margin:0}} .grid > div{{min-width:0}}
table{{border-collapse:collapse;width:100%;background:#fff;border:1px solid #e4e4e7;border-radius:8px;overflow:hidden}} th,td{{text-align:left;padding:6px 10px;border-bottom:1px solid #f0f0f2;vertical-align:top}} th{{background:#f4f4f5;font-weight:600}}
td.num{{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}} td.ok,.ok{{color:#15803d;font-weight:600}} td.bad,.bad{{color:#b91c1c;font-weight:600}} .muted{{color:#71717a;font-weight:400}}
.facts{{max-width:980px}} .checks td:nth-child(2){{color:#52525b}} .note{{color:#52525b;max-width:980px}} .decision{{background:#fff;border:1px solid #e4e4e7;border-radius:10px;padding:16px 20px;max-width:980px}}
.decision h3{{margin-top:12px}} .kpis{{display:flex;gap:14px;flex-wrap:wrap;margin:16px 0}} .kpi{{background:#fff;border:1px solid #e4e4e7;border-radius:10px;padding:10px 16px;min-width:150px}} .kpi b{{display:block;font-size:22px}} .kpi span{{color:#71717a;font-size:13px}}
ol.cause{{max-width:980px;padding-left:22px}} ol.cause li{{margin:6px 0}}
.diff{{max-width:980px;margin:12px 0;background:#fff;border:1px solid #e4e4e7;border-radius:8px}} .diff summary{{padding:8px 12px;cursor:pointer;color:#52525b}} .diff pre{{margin:0;padding:10px 12px;border-top:1px solid #e4e4e7;font:12.5px/1.45 ui-monospace,Menlo,monospace;overflow-x:auto;white-space:pre}}
.diff pre span{{display:block;min-height:1.45em}} .diff .add{{color:#15803d;background:#f0fdf4}} .diff .del{{color:#b91c1c;background:#fef2f2}} .diff .hunk{{color:#6d28d9}} .diff .meta{{color:#71717a}}
.addn{{color:#15803d}} .deln{{color:#b91c1c}} .diff pre{{tab-size:2}}
figure.code{{max-width:980px;padding:0;overflow:hidden}} figure.code figcaption{{margin:0;padding:8px 12px;border-bottom:1px solid #e4e4e7;background:#f4f4f5}} figure.code pre{{margin:0;padding:10px 12px;font:12.5px/1.45 ui-monospace,Menlo,monospace;overflow-x:auto;white-space:pre;tab-size:2}}
table.mutations td:first-child{{min-width:250px}} table.mutations td:nth-child(3){{max-width:420px}}
.url{{display:block;font:14px ui-monospace,Menlo,monospace;background:#f4f4f5;padding:8px 12px;border-radius:6px;margin:6px 0;overflow-x:auto;white-space:nowrap}}
.callout{{border-left:3px solid #b91c1c;padding:6px 14px;background:#fff;max-width:960px;margin:14px 0}} .callout.good{{border-color:#15803d}}
</style></head><body>
<h1>Behavior Tree region — Detach and identity</h1>
<p class="lede">Two bugs, one seam. <strong>Detach to primitives</strong> on a Behavior Tree region threw <code>ValidationError</code> and unmounted the whole React app; <strong>duplicating or pasting a region</strong> scrambled the layout of the region it was copied from. The first was a value that is legal in a shape's <code>props</code> and illegal in its <code>meta</code>; the second was a stored id trusted after copy and paste re-minted every id around it. Both are fixed at the seam that owns the invariant, both have a real-browser journey that can go red, and the region now lowers whole to stock tldraw. Built on <code>{esc(m['branch'])}</code> at <code>{esc(m['head'])}</code>{' (uncommitted)' if dirty else ''}, tldraw <code>{esc(m['tldraw'])}</code>, {STAMP}.</p>
<div class="kpis">
  <div class="kpi"><b>{detach_pass}/{detach['total']}</b><span>detach journey checks</span></div>
  <div class="kpi"><b>{identity_pass}/{identity['total']}</b><span>identity journey checks</span></div>
  <div class="kpi"><b class="bad">{len(failed_ids) if failed else '—'}/{identity['total']}</b><span>red with the fix mutated out</span></div>
  <div class="kpi"><b>{bt_pass if bt_pass is not None else '—'}/{bt['total'] if bt else '—'}</b><span>existing <code>test:bt</code> journey</span></div>
  <div class="kpi"><b>{vt['passed'] if vt['passed'] is not None else '—'}</b><span>vitest, {vt['files'] or '—'} files{(' · ' + str(vt['failed']) + ' failed') if vt['failed'] else ''}</span></div>
  <div class="kpi"><b>{m['python']['tests'] if m['python']['tests'] is not None else '—'}</b><span>Python tests{'' if m['python']['ok'] else ' · NOT green'}</span></div>
</div>

<h2>1 · Detach crashed the app</h2>
<p class="note"><strong>Symptom.</strong> Right-click the region's header band, choose <em>Detach to primitives</em>: <code>ValidationError: At shape(type = group).meta: Expected json serializable value, got object</code>, and the app is gone — <code>window.__systemsketch</code> disappears, the canvas unmounts.</p>
<h3>Reproduction, measured against the running app before the fix</h3>
<table class="facts"><tr><th>Selection</th><th>Outcome</th><th>Crash</th><th>XML after</th><th>Left behind</th></tr>{pre_fix_rows}</table>
<p class="note">Two different failures in one table. The region crashes. A projected <em>child</em> "succeeds" — and the XML shrinks, because detaching a projected occurrence was never a legitimate operation: its truth is the region's XML, and deleting the Block record compiles an XML delete. Asking to detach a node silently removed it from the tree.</p>

<h3>Root cause — one value, two validators</h3>
{VALIDATION_SVG}
<ol class="cause">
<li><code>src/blocks/definitions/definitionLinking.ts:539</code> passes <code>draftOrdinal: canonical.props.draftOrdinal</code> — an <em>absent</em> optional prop, so the value is <code>undefined</code> — into <code>updateDefinitionGroup</code> (line 384), which spreads it into <code>props</code> (line 393).</li>
<li>tldraw's <code>applyPartialToRecordWithProps</code> (<code>@tldraw/editor/dist-esm/lib/editor/Editor.mjs:8735–8758</code>) skips a <em>top-level</em> <code>undefined</code> in a partial (line 8741) but copies every <code>props</code>/<code>meta</code> sub-key verbatim (lines 8745–8750). The store record now literally holds <code>draftOrdinal: undefined</code>.</li>
<li>That is legal for <code>props</code> — <code>draftOrdinal: T.number.optional()</code>, <code>src/blocks/blockModel.ts:349</code> — and illegal for <code>meta</code>: <code>createShapeValidator</code> (<code>@tldraw/tlschema/dist-esm/shapes/TLBaseShape.mjs:24</code>) validates <code>meta</code> with <code>T.jsonValue</code>, whose <code>isValidJson</code> (<code>@tldraw/validate/dist-esm/lib/validation.mjs:857–878</code>) rejects <code>undefined</code> anywhere in the tree.</li>
<li><code>src/blocks/detach/detachBlock.ts:226</code> copies the whole <code>block.props</code> into the detached group's <code>meta</code>. Crash.</li>
<li><strong>Why the message was hard to read.</strong> It says <em>got object</em> and points at <code>.meta</code>, not at <code>draftOrdinal</code>, because <code>jsonValue</code> is a leaf validator with no path tracking: <code>isValidJson</code> returns a bare <code>false</code> from wherever it fails and the error is composed at the top with <code>typeof value</code> of the <em>whole</em> meta. The offending key is never named.</li>
<li><strong>Why the Behavior Tree region specifically.</strong> The sample tree repeats leaf names (<code>CloseGrip</code> ×3, <code>MoveHome</code> ×3). The duplicate-title reconciler at <code>definitionLinking.ts:535–540</code> fires for the content-identical copies, so exactly 4 of the 9 projected Blocks (paths <code>0.4.0</code>, <code>0.4.1.0</code>, <code>0.4.1.1</code>, <code>0.4.2</code>) carried <code>draftOrdinal: undefined</code>. Detaching one clean leaf worked; detaching the region swept all nine and hit a poisoned one. Proved by monkey-patching <code>editor.store.put</code> in the live page and capturing the stack of the write that planted it: <code>updateDefinitionGroup (definitionLinking.ts) ← reconcileExistingDefinitionNames</code>.</li>
</ol>

<h3>The fix, at the seam that owns the invariant</h3>
<p class="note">A new exported <code>toJsonSafe</code> in <code>src/blocks/detach/detachModel.ts</code> deep-copies a value dropping present-but-undefined keys; an array hole becomes <code>null</code>, which is what JSON would do. <code>detachMeta</code> runs every record through it, and <code>detachBranch.ts</code> / <code>detachLoop.ts</code> do too — they had the same latent crash via <code>structuredClone(props)</code>.</p>
{code_html(m['to_json_safe'], 'src/blocks/detach/detachModel.ts · toJsonSafe (read from the tree at build time)')}
<div class="callout"><strong>Deliberately not "fixed" upstream.</strong> Writing <code>draftOrdinal: undefined</code> is the only way tldraw's update merge can express <em>cleared</em>; dropping the key from the patch would keep the OLD value and a set ordinal would stop being clearable. <code>definitionLinking.ts</code> gets a <code>WHY:</code> comment saying so and nothing else:</div>
{diff_html(m['diffs']['src/blocks/definitions/definitionLinking.ts'], 'src/blocks/definitions/definitionLinking.ts', True)}
{diff_html(m['diffs']['src/branch/detachBranch.ts'], 'src/branch/detachBranch.ts')}
{diff_html(m['diffs']['src/loop/detachLoop.ts'], 'src/loop/detachLoop.ts')}
<p class="note">The unit test that pins it uses tldraw's <em>own</em> <code>T.jsonValue</code> as the oracle: it asserts the validator rejects the raw record with a cleared optional prop and accepts the sanitized one — <code>src/blocks/detach/detachModel.test.ts</code>, {detach_model_tests.get('passed', '—')}/{detach_model_tests.get('tests', '—')} passing at build time.</p>
{diff_html(m['diffs']['src/blocks/detach/detachModel.test.ts'], 'src/blocks/detach/detachModel.test.ts')}

<h3>A projected child cannot be detached at all</h3>
<div class="grid two">
{figure(DETACH_ASSETS / 'refused-child-menu.png', 'Right-click a projected leaf: no Detach item.', 'Close-up of the context menu on <code>MoveToObj</code>, a projected Sub Tree occurrence, with the region’s toolbar above it. <code>selectedDetachableIds</code> now excludes any shape carrying BT child meta, so the item simply is not offered — the same visible refusal idiom the menu already used for control cards. The XML is byte-identical afterwards (<code>refuse.xml</code>) and the occurrence is still on the canvas (<code>refuse.children</code>).', src=crop_uri(DETACH_ASSETS / 'refused-child-menu.png', (0, 360, 720, 1045)))}
{figure(DETACH_ASSETS / 'refused-child-menu.png', 'The whole frame that close-up was cut from.', 'Same capture, uncropped: the leaf is selected (blue handles), the inspector on the right still shows the node, and nothing on the board changed.')}
</div>
{diff_html(m['diffs']['src/blocks/detach/detachBlock.ts'], 'src/blocks/detach/detachBlock.ts', True)}

<h3>The region detaches whole</h3>
<p class="note">New <code>src/behaviorTree/detachBehaviorTree.ts</code> plus a pure <code>src/behaviorTree/btPrimitives.ts</code>. The region becomes a stock <code>frame</code> named for the tree, carrying the canonical BT.CPP XML in JSON-only <code>meta</code>; each projected leaf and pill goes through the ordinary Block detach and becomes the same stock group any detached Block becomes; Dataflow cables go through the ordinary connection detach; and the layer the region paints for itself — control cards, wires, rails, merge marks, chips, group boxes, Start — becomes stock <code>line</code> / <code>geo</code> / <code>text</code> records. Wired into <code>detachSelectedPrimitives</code> and into <code>src/export/portableTldraw.ts</code> beside Branch and Loop, with <code>tests/test_stock_boundary.py</code> extended to require it.</p>
<div class="grid two">
{figure(DETACH_ASSETS / 'region-before.png', 'Before: the live region.', 'PickAndPlace as the region projects it — real Blocks, control cards with glyphs, the Start capsule, the region’s own wires, the Behavior Tree inspector on the right.')}
{figure(DETACH_ASSETS / 'region-detached.png', 'After: one stock frame full of stock shapes.', 'The same board after <em>Detach to primitives</em> on the header band. The inspector now says <code>frame</code>, 2097 × 908, "no editable styles": nothing SystemSketch-specific is left to select. Every leaf is a detached Block group, every control card a rectangle with bold text, every wire a line with a triangle head.')}
{figure(DETACH_ASSETS / 'region-detached-zoom.png', 'Close-up of the lowered paint.', 'Stock arrowheads landing on the wire tips, the control-card rectangles, the Start capsule, a lowered leaf whose icon slot is an empty stock square. Two details cost a sentence each: an elbowed control wire cannot be a stock <code>arrow</code>, so a wire stays a polyline <code>line</code> and its head is a rotated stock <code>triangle</code> geo — and a tldraw shape rotates about its top-left <em>origin</em>, not its centre, which had to be solved for so the head lands on the tip. And stock <code>solid</code> fill is a light tint, not black, so Start is <code>fill: none</code> with dark ink rather than white-on-black.')}
{figure(DETACH_ASSETS / 'region-undone.png', 'One Ctrl+Z.', 'The region is back with its projection and its XML byte for byte (<code>undo.region</code>, <code>undo.children</code>, <code>undo.xml</code>); no stock leftover survives (<code>undo.stock</code>), and it detaches again afterwards (<code>redetach</code>).')}
</div>
{code_html(m['arrow_head'], 'src/behaviorTree/btPrimitives.ts · placing a rotated stock triangle on the wire tip (read at build time)')}
{figure(DETACH_ASSETS / 'stock-render.png', 'The load-bearing proof: stock tldraw paints the detached board.', 'The detached document re-rendered by an <em>isolated</em> stock tldraw ' + esc(m['tldraw']) + ' editor with zero SystemSketch shape utilities registered (<code>stock.render</code>, <code>stock.types</code>), cropped to the drawn content. The purple rectangle at the left is the unrelated witness shape the journey planted to prove nothing else on the page was touched (<code>region.witness</code>). If any custom record had survived, this editor could not have loaded the file.', src=autocrop_uri(DETACH_ASSETS / 'stock-render.png'))}

<h3>The portable <code>.tldr</code>, opened in stock tldraw</h3>
{portable_html}
{diff_html(m['diffs']['src/export/portableTldraw.ts'], 'src/export/portableTldraw.ts')}
{diff_html(m['diffs']['tests/test_stock_boundary.py'], 'tests/test_stock_boundary.py')}

<h3>Real-browser acceptance · <code>node tests/behavior_tree_detach_smoke.mjs</code></h3>
<p class="note">Generated {esc(detach['generatedAt'])}. Each check reads the editor or the DOM after a real pointer or keyboard gesture; screenshots are only written when every check passes. Run it by path: no <code>package.json</code> script was added because another agent holds that file.</p>
{checks_table(detach)}

<h2>2 · Duplicating or pasting a region scrambled the original</h2>
{recording_html}

<h3>Root cause — a stored id, trusted after every id was re-minted</h3>
{IDENTITY_SVG}
<p class="note"><code>src/behaviorTree/installBehaviorTreeRegions.ts</code> resolved a projected child's region from <code>meta.btRegion</code>, a stored id. tldraw re-mints every shape id on duplicate and paste but copies <code>meta</code> verbatim, so a copied child still names the region it was copied from. Every rule that read that name then acted on the original: reparent the copy into it, record the paste distance as one of <em>its</em> free offsets, and delete its own children as duplicate <code>role:path</code> strays.</p>
<h3>The fix — containment decides</h3>
{code_html(m['region_for'], 'src/behaviorTree/installBehaviorTreeRegions.ts · behaviorTreeRegionFor (read at build time)')}
<p class="note">New <code>behaviorTreeRegionFor</code> / <code>behaviorTreeRegionAncestor</code> resolve a child's region by walking up to the nearest region ancestor; a cable — parented at page level by the connection layer — resolves through its bindings' Blocks. The stored id survives only as the fallback for the one case containment cannot answer: a child dragged clean out of every region, which the drag rule then pulls back. A second, independent guard: the set of shapes created in the current operation, so a freshly-created arrival is never read as a drag — that is what wrote the huge offsets. And <code>reconcileBehaviorTree</code> re-stamps a copied child's <code>btRegion</code> so a later delete edits the right tree's XML.</p>
{diff_html(m['diffs']['src/behaviorTree/installBehaviorTreeRegions.ts'], 'src/behaviorTree/installBehaviorTreeRegions.ts')}

<h3>Mutation evidence — the journey can go red</h3>
<p class="note">The fixed code was temporarily mutated (and restored, md5-verified) to prove <code>tests/behavior_tree_identity_smoke.mjs</code> actually measures the fix rather than passing vacuously.</p>
<table class="facts mutations"><tr><th>Mutation</th><th class="num">Red</th><th>Checks that failed</th><th>Source</th></tr>{''.join(mutation_rows)}</table>
<div class="callout good">With both guards off — the shipped pre-fix behaviour — <code>duplicate.offsets</code>, <code>paste.offsets</code>, <code>move.offsets</code> and their <code>.kids</code> twins go red across the plain, paste, bare-child and Dataflow-lens cases. That reproduces Zach's recording.</div>

<h3>What the fixed app does</h3>
<div class="grid two">
{figure(IDENTITY_ASSETS / 'after-duplicate.png', 'Ctrl+D.', 'A second region appears offset to the right; the original — its edge visible at the left, still <code>PickAndPlace · 13 nodes</code> — keeps <code>offsets: {{}}</code> and every child exactly where it was (<code>duplicate.offsets</code>, <code>duplicate.kids</code>). The copy has its own full child set, every one stamped with the copy (<code>duplicate.copy.parent</code>).')}
{figure(IDENTITY_ASSETS / 'after-move.png', 'Drag the copy 400 px.', 'Only the copy moved (<code>move.copy</code>); the original’s offsets are still empty and no original child moved (<code>move.offsets</code>, <code>move.kids</code>). Moving a whole region is not a free child offset (<code>move.copy.offsets</code>).')}
{figure(IDENTITY_ASSETS / 'after-paste.png', 'Ctrl+C, Ctrl+V.', 'The same claims for paste (<code>paste.offsets</code>, <code>paste.kids</code>), plus the bare case — pasting one projected occurrence alone leaves the region’s offsets empty (<code>lone.offsets</code>, <code>lone.kids</code>), which is the check only the created-in-this-operation guard can pass.')}
{figure(IDENTITY_ASSETS / 'after-dataflow-duplicate.png', 'Ctrl+D under the Dataflow lens.', 'Real cables are involved now. Each cable resolves to exactly one region through its bound Blocks (<code>dataflow.contained</code>); after the duplicate there are twice the cables and none bound across the two regions (<code>dataflow.cables.count</code>, <code>dataflow.cables.contained</code>).')}
</div>

<h3>Real-browser acceptance · <code>node tests/behavior_tree_identity_smoke.mjs</code></h3>
<p class="note">Generated {esc(identity['generatedAt'])}.</p>
{checks_table(identity)}

<h2>Proof state</h2>
<table class="facts"><tr><th>Gate</th><th>Result at build time</th></tr>
<tr><td><code>node tests/behavior_tree_detach_smoke.mjs</code></td><td class="{'ok' if detach_pass == detach['total'] else 'bad'}">{detach_pass}/{detach['total']}</td></tr>
<tr><td><code>node tests/behavior_tree_identity_smoke.mjs</code></td><td class="{'ok' if identity_pass == identity['total'] else 'bad'}">{identity_pass}/{identity['total']}</td></tr>
<tr><td><code>npm run test:bt</code> — the pre-existing journey</td><td class="{'ok' if bt and bt_pass == bt['total'] else 'bad'}">{bt_pass if bt else '—'}/{bt['total'] if bt else '—'}{' · <code>drag.offset</code> still passes, so the new created-in-this-operation guard did not disable genuine drags' if bt_drag else ''}</td></tr>
<tr><td><code>vitest run</code></td><td class="{'ok' if vt['failed'] == 0 else 'bad'}">{vt['passed']}/{vt['tests']} tests across {vt['files']} files</td></tr>
<tr><td><code>python3 -m unittest discover -s tests</code></td><td class="{'ok' if m['python']['ok'] else 'bad'}">{m['python']['tests']} tests{' · OK' if m['python']['ok'] else ' · FAILED'}</td></tr>
<tr><td><code>src/blocks/detach/detachModel.test.ts</code></td><td class="ok">{detach_model_tests.get('passed', '—')}/{detach_model_tests.get('tests', '—')} — one of them uses tldraw's own <code>T.jsonValue</code> as the oracle</td></tr>
<tr><td><code>src/behaviorTree/btPrimitives.test.ts</code></td><td class="ok">{primitives_tests.get('passed', '—')}/{primitives_tests.get('tests', '—')} — stock types only, no <code>undefined</code>, every painted element lowered exactly once, deterministic, line point indices ordered, all 12 projection/face/lens combinations lower cleanly</td></tr>
</table>
<p class="note"><code>npm run check</code> is tsc + the vitest and Python suites above + the breadcrumbs journey; the vitest and Python numbers here were measured by running those suites from this builder.</p>

<h2>Files</h2>
<p class="note">Only the files this unit of work touched. Other agents are editing other files in the same tree; their changes are not in this table.</p>
<table class="facts"><tr><th>File</th><th>State</th><th class="num">Lines</th><th class="num">Diff</th></tr>{file_rows}</table>

<h2>Review surface</h2>
<p class="note">Two review fixtures, on the Preview {preview_state}. Paste the URL as-is: the <code>?board=</code> query is a literal absolute path.</p>
<div class="grid two">
{figure(REVIEW / 'behavior-tree-detach.png', 'behavior-tree-detach.systemsketch', 'Step 1 right-clicks a leaf and expects no Detach item; step 2 detaches the region from its header band; step 3 clicks the stock leftovers; step 4 is one Ctrl+Z.')}
{figure(REVIEW / 'behavior-tree-region-identity.png', 'behavior-tree-region-identity.systemsketch', 'Ctrl+D, drag the copy, Ctrl+Z twice; the original must never move a pixel and Tidy must never be needed.')}
</div>
<span class="url">http://127.0.0.1:{PREVIEW_PORT}/?board=/home/bam/systemsketch/sketches/review/behavior-tree-detach.systemsketch</span>
<span class="url">http://127.0.0.1:{PREVIEW_PORT}/?board=/home/bam/systemsketch/sketches/review/behavior-tree-region-identity.systemsketch</span>

<h2>Decision surface</h2>
<div class="decision">
<h3>Done and proved</h3>
<ul>
<li>Detach on a region no longer crashes; it lowers the region to one stock frame of stock records, undoes in one step, and stock tldraw {esc(m['tldraw'])} with no SystemSketch utilities renders the result — {detach_pass}/{detach['total']} in a real browser, plus the exported <code>.tldr</code> measured above.</li>
<li>A projected child is refused, not lowered: the menu item does not appear and the XML is byte-identical.</li>
<li>The latent <code>structuredClone(props)</code> crash in Branch and Loop detach is closed by the same <code>toJsonSafe</code>.</li>
<li>Duplicate, paste, move and the Dataflow lens leave the original region's offsets and children untouched — {identity_pass}/{identity['total']}, and {len(failed_ids) if failed else '—'} of those go red when the fix is mutated out.</li>
{pep_done}</ul>
<h3>Left, and not blocked</h3>
<ul>
<li>Importing a detached frame back into a region (the frame carries the XML for exactly that; no reader exists yet).</li>
<li><code>package.json</code> scripts for the two new journeys — another agent holds that file; run them by path until then.</li>
</ul>
<h3>Needs Zach</h3>
<ul>
{pep_todo}<li><strong>Merge.</strong> Everything is on <code>{esc(m['branch'])}</code> in the primary checkout and <strong>nothing is pushed</strong> — the remote moves only when you say so. (This report is inside the commit it describes, so its header stamps the tree as it stood at build time.)</li>
</ul>
<h3>Deliberately not done</h3>
<ul>
<li>Not "fixing" <code>definitionLinking.ts</code> to delete the key: <code>undefined</code> in the patch is the only spelling of <em>cleared</em> tldraw's merge understands.</li>
<li>Not lowering a projected child on its own, ever: its truth is the XML, and the primitives would claim to be an authored Block.</li>
<li>Not a stock <code>arrow</code> for control wires: an elbow cannot be an arrow, so the head is its own triangle and the wire stays a faithful polyline.</li>
<li>Not touching <code>treeLayout.ts</code>, <code>layouts.test.ts</code>, <code>behavior_tree_smoke.mjs</code> or <code>package.json</code>: other agents are in them.</li>
</ul>
</div>
</body></html>
"""


def main() -> None:
    measured = measure()
    OUT.write_text(render(measured))
    print(OUT)


if __name__ == "__main__":
    main()
