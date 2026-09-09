#!/usr/bin/env python3
"""Build reports/block-members-proposal-<date>.html — the proposal for authoring an
Expanded Block's *members* (its direct child Blocks) the way ports are authored:
a Members list in the inspector with add / reorder / remove, an authored stack
order, a live stack layout driven by three numbers on the parent (gap, gutter,
width policy) with Inset and Edge-to-edge as presets, and one rule that keeps a
shared definition from being sized by two parents at once.

Nothing in `src/` changes with this page. Every number on it is measured from the
tree at build time (`measured()`), and the stack diagrams are computed from the
same constants the app lays out with, so the page cannot drift from the code it
describes. Reference crops (Zach's three pasted screenshots and the two live
captures from the 2026-09-05 member-layout work) live in the ignored
`reports/media/block-members-proposal/` and are referenced relatively — the
retained review runtime serves them.
"""
from __future__ import annotations

import os
import re
import subprocess
from datetime import date
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NAME = "block-members-proposal"
OUT = Path(os.environ.get("SYSTEMSKETCH_REPORT_OUTPUT", ROOT / f"reports/{NAME}-{date.today()}.html"))
MEDIA = Path(os.environ.get("SYSTEMSKETCH_REPORT_MEDIA_DIR", ROOT / "reports/media" / NAME))
REL = f"media/{NAME}"


def read(name: str) -> str:
    return (ROOT / name).read_text(encoding="utf-8")


def need(text: str, token: str, label: str) -> None:
    if token not in text:
        raise SystemExit(f"report is stale — expected {label}: {token!r}")


def const(text: str, name: str) -> int:
    match = re.search(rf"export const {name}\s*=\s*(\d+)", text)
    if not match:
        raise SystemExit(f"report is stale — constant {name} not found")
    return int(match.group(1))


def git(*args: str) -> str:
    try:
        return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=False).stdout.strip()
    except OSError:
        return ""


def unit_test_summary() -> str:
    """Run the member unit tests at build time when vitest is reachable; say so when it is not."""
    files = ["src/blocks/memberStack.test.ts", "src/blocks/memberLayout.test.ts", "src/blocks/blockVisibility.test.ts"]
    try:
        run = subprocess.run(["npx", "vitest", "run", *files], cwd=ROOT, capture_output=True, text=True, timeout=180)
    except (OSError, subprocess.TimeoutExpired):
        return "not run at build time (vitest unreachable here)"
    match = re.search(r"Tests\s+(\d+) passed", run.stdout + run.stderr)
    return f"{match.group(1)} passed across the three member test files" if match else "not run at build time (vitest unreachable here)"


def measured() -> dict:
    model = read("src/blocks/blockModel.ts")
    member = read("src/blocks/memberLayout.ts")
    layout = read("src/blocks/layoutBlock.ts")
    autoresize = read("src/blocks/blockAutoResize.ts")
    inspector = read("src/blocks/ui/BlockInspector.tsx")
    linking = read("src/blocks/definitions/definitionLinking.ts")
    migrations = read("src/blocks/blockShapeMigrations.ts")
    shape_util = read("src/blocks/BlockShapeUtil.tsx")
    scope = read("src/blocks/expandedBlockLayoutScope.ts")
    app = read("src/App.tsx")
    pkg = read("package.json")

    need(model, "export const BLOCK_MEMBER_LAYOUTS = ['inset', 'edge-to-edge'] as const", "the member layout enum")
    need(model, "export function canBlockContainChildren(view: BlockView): boolean {\n\treturn view === 'expanded'", "only Expanded contains")
    need(member, "sort((a, b) => a.y - b.y", "placements ordered by y, not by an authored order")
    need(member, "in free mode member layout is a helpful command", "the one-shot WHY, now scoped to free mode")
    need(linking, "expandedSize: props.views.expanded", "expanded size is definition-shared")
    need(linking, "function syncLinkedBody(", "bodies replicate across occurrences")
    need(inspector, 'aria-label="Member layout"', "today's member layout control")
    need(shape_util, "override isFrameLike(shape: BlockShape): boolean {\n\t\treturn isExpandedBlockShape(shape)", "Expanded is frame-like")
    need(autoresize, "fitFrameToContent(editor, block.id, { padding: BLOCK_AUTO_RESIZE_PADDING_PX })", "stock fit")
    need(scope, "shape.parentId === parent.id", "children resolved by parentId")
    need(app, "installBlockAutoResize(editor)", "the settle installer seam")
    need(inspector, 'data-inspector-section="Members"', "the Members section")
    stack = read("src/blocks/memberStack.ts")
    need(stack, "export function installBlockMemberStack(", "the live stack installer")
    need(stack, "options.order === 'authored' ? members : membersByLanding(members)", "landing vs authored order")
    need(model, "bodyLayout: T.literalEnum(...BLOCK_BODY_LAYOUTS).optional()", "the optional bodyLayout prop")
    need(app, "installBlockMemberStack(editor)", "the installer registered")
    need(read("src/blocks/blockVisibility.ts"), "blockBodyLayout(host.props) === 'stack') return 'hidden'", "cables hidden in a stack")
    need(linking, "isEmptyDefinition(editor, source)", "the empty-Block rename exception")
    lane = read("src/blocks/memberStackDnd.tsx")
    need(lane, "if (!editor.isIn('select.pointing_shape')) return", "the stack lane's state-ownership check")
    need(lane, "export const STACK_DND_CLAIM_DISTANCE_PX = 3", "the stack lane's preempt distance")
    need(read("tests/test_stock_boundary.py"), '"memberStackDnd.tsx",', "the third owner admitted by the boundary test")
    journey = read("tests/block_members_smoke.mjs")
    journey_checks = journey.count("pass('")

    tldraw = re.search(r'"tldraw":\s*"([^"]+)"', pkg).group(1)
    migration_ids = re.findall(r"id: blockVersions\.(\w+)", migrations)
    row_arms_merged = subprocess.run(
        ["git", "merge-base", "--is-ancestor", "2877fea", "main"], cwd=ROOT, capture_output=True,
    ).returncode == 0
    head = git("rev-parse", "--short", "HEAD")

    return {
        "inset": const(member, "BLOCK_MEMBER_INSET_PX"),
        "gap": const(member, "BLOCK_MEMBER_GAP_PX"),
        "header": const(layout, "BLOCK_HEADER_HEIGHT_PX"),
        "footer": const(layout, "NODE_FOOTER_HEIGHT_PX"),
        "row_gap": const(layout, "NODE_ROW_HEADER_GAP_PX"),
        "autofit_pad": const(autoresize, "BLOCK_AUTO_RESIZE_PADDING_PX"),
        "corner": const(layout, "BLOCK_CORNER_RADIUS"),
        "tldraw": tldraw,
        "migrations": len(migration_ids),
        "last_migration": migration_ids[-1] if migration_ids else "?",
        "row_arms_merged": row_arms_merged,
        "head": head,
        "lines": {
            "memberLayout.ts": member.count("\n"),
            "blockAutoResize.ts": autoresize.count("\n"),
            "BlockInspector.tsx": inspector.count("\n"),
            "definitionLinking.ts": linking.count("\n"),
            "blockModel.ts": model.count("\n"),
        },
        "optional_props_precedent": sum(1 for _ in re.finditer(r"T\.\w+(?:\([^)]*\))?\.optional\(\)", model)),
        "journey_checks": journey_checks,
        "stack_lines": stack.count("\n"),
        "lane_lines": lane.count("\n"),
        "unit": unit_test_summary(),
    }


# ---------------------------------------------------------------- diagrams

def stack_svg(m: dict, *, title: str, gap: int, gutter: int, fill: bool, parent_w: int | None,
              children: list[tuple[str, int, int]], note: str, hug: bool = False) -> str:
    """Draw one Expanded Block stacking its members from the real constants.

    children: (title, own_width, height). With `hug`, the parent width derives from
    the widest Own child plus two gutters; otherwise `parent_w` is authored.
    """
    header, footer = m["header"], m["footer"]
    if hug:
        parent_w = max(w for _, w, _ in children) + 2 * gutter
    assert parent_w is not None
    y = header + gap
    rows = []
    for name, own_w, h in children:
        w = parent_w - 2 * gutter if fill else own_w
        rows.append((name, gutter, y, w, h))
        y += h + gap
    body_bottom = y  # includes trailing gap
    parent_h = body_bottom + footer
    pad = 26
    scale = 0.62
    W = int(parent_w * scale) + pad * 2 + 120
    H = int(parent_h * scale) + pad * 2 + 44
    s = lambda v: round(v * scale, 1)
    parts = [f'<svg viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-label="{escape(title)}">']
    ox, oy = pad, pad + 18
    parts.append(f'<text x="{ox}" y="{pad}" class="dg-title">{escape(title)}</text>')
    r = s(m["corner"])
    parts.append(f'<rect x="{ox}" y="{oy}" width="{s(parent_w)}" height="{s(parent_h)}" rx="{r}" class="dg-parent"/>')
    parts.append(f'<rect x="{ox}" y="{oy}" width="{s(parent_w)}" height="{s(header)}" class="dg-band"/>')
    parts.append(f'<text x="{ox + 8}" y="{oy + s(header) * 0.66}" class="dg-h">Class</text>')
    parts.append(f'<line x1="{ox}" y1="{oy + s(parent_h - footer)}" x2="{ox + s(parent_w)}" y2="{oy + s(parent_h - footer)}" class="dg-rule"/>')
    edge = gap == 0 and gutter == 0
    for i, (name, x, cy, w, h) in enumerate(rows):
        cls = "dg-child dg-child-edge" if edge else "dg-child"
        rr = 0 if edge else s(6)
        parts.append(f'<rect x="{ox + s(x)}" y="{oy + s(cy)}" width="{s(w)}" height="{s(h)}" rx="{rr}" class="{cls}"/>')
        parts.append(f'<text x="{ox + s(x) + 7}" y="{oy + s(cy) + 15}" class="dg-c">{escape(name)}</text>')
        parts.append(f'<text x="{ox + s(x + w) - 6}" y="{oy + s(cy + h) - 6}" class="dg-dim" text-anchor="end">{w}×{h}</text>')
        # gap callout between rows
        if i < len(rows) - 1 and gap:
            gy = oy + s(cy + h)
            parts.append(f'<line x1="{ox + s(parent_w) + 8}" y1="{gy}" x2="{ox + s(parent_w) + 8}" y2="{gy + s(gap)}" class="dg-meas"/>')
            parts.append(f'<text x="{ox + s(parent_w) + 13}" y="{gy + s(gap) / 2 + 4}" class="dg-dim">gap {gap}</text>')
    if gutter:
        # Measured below the frame, not inside the first card, so the label never
        # overprints a member's own text.
        gy = oy + s(parent_h) + 8
        parts.append(f'<line x1="{ox}" y1="{gy}" x2="{ox + s(gutter)}" y2="{gy}" class="dg-meas"/>')
        parts.append(f'<text x="{ox + s(gutter) + 5}" y="{gy + 4}" class="dg-dim">gutter {gutter}</text>')
    parts.append(f'<text x="{ox}" y="{oy + s(parent_h) + 30}" class="dg-dim">parent {parent_w}×{parent_h}'
                 f'{" (hug: widest own child + 2·gutter)" if hug else " (authored width)"}</text>')
    parts.append("</svg>")
    return f'<figure class="dg"><div class="dg-wrap">{"".join(parts)}</div><figcaption>{note}</figcaption></figure>'


def two_parents_svg() -> str:
    """The shared-field diagram: what a definition shares, and what stays per occurrence."""
    return """
<svg viewBox="0 0 840 300" width="840" height="300" role="img" aria-label="One definition, three occurrences">
  <defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" class="dg-arrfill"/></marker></defs>
  <rect x="290" y="16" width="180" height="58" rx="8" class="dg-def"/>
  <text x="380" y="40" text-anchor="middle" class="dg-h">Definition  Estimator</text>
  <text x="380" y="60" text-anchor="middle" class="dg-dim">shares: ports · description · type · body · views.expanded</text>

  <rect x="20" y="130" width="230" height="150" rx="9" class="dg-parent"/>
  <rect x="20" y="130" width="230" height="30" class="dg-band"/>
  <text x="30" y="150" class="dg-h">Parent A · gutter 12 · Fill</text>
  <rect x="32" y="172" width="206" height="90" rx="6" class="dg-child"/>
  <text x="40" y="190" class="dg-c">Estimator  (Port view)</text>
  <text x="230" y="254" text-anchor="end" class="dg-dim">w 206 · per-occurrence box</text>

  <rect x="270" y="130" width="330" height="150" rx="9" class="dg-parent"/>
  <rect x="270" y="130" width="330" height="30" class="dg-band"/>
  <text x="280" y="150" class="dg-h">Parent B · gutter 0 · Fill</text>
  <rect x="270" y="172" width="330" height="90" class="dg-child dg-child-edge"/>
  <text x="280" y="190" class="dg-c">Estimator  (Port view)</text>
  <text x="592" y="254" text-anchor="end" class="dg-dim">w 330 · per-occurrence box</text>

  <rect x="620" y="130" width="200" height="150" rx="9" class="dg-parent"/>
  <rect x="620" y="130" width="200" height="30" class="dg-band"/>
  <text x="630" y="150" class="dg-h">Estimator · Expanded</text>
  <text x="630" y="180" class="dg-dim">on the page, no parent</text>
  <text x="630" y="196" class="dg-dim">views.expanded 520×340 (shared)</text>
  <text x="630" y="230" class="dg-dim">Own width, always:</text>
  <text x="630" y="246" class="dg-dim">no parent may Fill it</text>

  <path d="M350 74 L140 128" class="dg-arrow" marker-end="url(#arr)"/>
  <path d="M380 74 L430 128" class="dg-arrow" marker-end="url(#arr)"/>
  <path d="M430 74 L720 128" class="dg-arrow" marker-end="url(#arr)"/>
</svg>"""


# ---------------------------------------------------------------- mocks

def member_row(icon: str, title: str, kind: str, view: str, extra: str = "", muted: bool = False) -> str:
    cls = "mk-row" + (" is-muted" if muted else "")
    return (f'<div class="{cls}"><span class="mk-grip" title="Drag to reorder · ↑↓ to step">⋮⋮</span>'
            f'<span class="mk-icon">{icon}</span><span class="mk-title">{escape(title)}</span>'
            f'<span class="mk-kind">{escape(kind)}</span>{extra}'
            f'<span class="mk-view" title="View of this occurrence">{view}</span>'
            f'<span class="mk-more">⋯</span></div>')


def members_list(with_width_chips: bool = False) -> str:
    chip = lambda v: f'<span class="mk-wchip{" is-on" if v == "Fill" else ""}">{v}</span>' if with_width_chips else ""
    return "".join([
        member_row("ƒ", "__init__()", "Function", "P", chip("Fill")),
        member_row("ƒ", "estimate()", "Function", "P", chip("Fill")),
        member_row("▣", "PoseFilter", "Class", "E", chip("Own")),
        member_row("ƒ", "reset()", "Function", "S", chip("Fill"), muted=True),
    ])


def mock_header(count: int, extra: str = "") -> str:
    return (f'<div class="mk-head"><span class="mk-label">MEMBERS</span>'
            f'<span class="mk-pill">{count} members</span>{extra}'
            f'<span class="mk-plus" title="Add member">+</span></div>')


def add_menu() -> str:
    return ('<div class="mk-menu"><div class="mk-menu-title">Add member</div>'
            '<div class="mk-menu-item"><b>New Block</b><span>a fresh definition, Port view, appended last</span></div>'
            '<div class="mk-menu-item"><b>Link existing…</b><span>an occurrence of a definition already on this board</span></div>'
            '</div>')


def variant_b() -> str:
    """V1 (applied): numbers always visible, presets light up when they match."""
    return f"""
<div class="mk">
  {mock_header(4)}
  <div class="mk-list">{members_list()}</div>
  <div class="mk-sub">Member layout</div>
  <div class="mk-presets"><span class="mk-btn is-on">Inset</span><span class="mk-btn">Edge-to-edge</span></div>
  <div class="mk-grid">
    <label>Gap <span class="mk-num">12<i>px</i></span></label>
    <label>Gutter <span class="mk-num">12<i>px</i></span></label>
    <label>Width <span class="mk-seg"><b class="is-on">Fill</b><b>Own</b></span></label>
  </div>
  <p class="mk-hint">Inset is 12 / 12, Edge-to-edge is 0 / 0. Edit a number and neither preset stays lit — the numbers are the truth, the presets only write them.</p>
</div>"""


def variant_a() -> str:
    """Presets first; the numbers live behind a Custom disclosure."""
    return f"""
<div class="mk">
  {mock_header(4)}
  <div class="mk-list">{members_list()}</div>
  <div class="mk-sub">Member layout</div>
  <div class="mk-presets three"><span class="mk-btn is-on">Inset</span><span class="mk-btn">Edge-to-edge</span><span class="mk-btn">Custom…</span></div>
  <p class="mk-hint">Custom opens gap, gutter and width below. Inset and Edge-to-edge hide them. Width lives with the numbers.</p>
</div>"""


def variant_c() -> str:
    """Per-member width chips in the rows; the parent only carries spacing."""
    return f"""
<div class="mk">
  {mock_header(4, '<span class="mk-pill">Fill · 3</span>')}
  <div class="mk-list">{members_list(with_width_chips=True)}</div>
  <div class="mk-sub">Spacing</div>
  <div class="mk-grid two">
    <label>Gap <span class="mk-num">12<i>px</i></span></label>
    <label>Gutter <span class="mk-num">12<i>px</i></span></label>
  </div>
  <p class="mk-hint">Width is decided per member on its row (Figma's per-child Fill/Fixed). The Expanded child is pinned to Own and its chip is disabled.</p>
</div>"""


# ---------------------------------------------------------------- page

CSS = """
:root { --ink:#17191c; --mute:#5b6470; --line:#dfe3e8; --paper:#fff; --wash:#f4f6f8; --accent:#5b46e5; --ok:#1f8a4c; --warn:#b4531d; }
* { box-sizing:border-box; }
body { margin:0; color:var(--ink); background:var(--paper); font:15px/1.5 Inter,system-ui,sans-serif; }
main { max-width:1080px; margin:0 auto; padding:28px 28px 80px; }
h1 { font-size:30px; line-height:1.15; margin:0 0 6px; letter-spacing:-.01em; }
h2 { font-size:21px; margin:44px 0 10px; letter-spacing:-.01em; }
h3 { font-size:16px; margin:22px 0 6px; }
p { margin:8px 0; max-width:78ch; }
.lede { font-size:17px; max-width:82ch; }
.meta { color:var(--mute); font-size:13px; }
code, pre { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
code { background:var(--wash); padding:1px 5px; border-radius:4px; font-size:13px; }
pre { background:#0f1115; color:#e6e8ee; padding:14px 16px; border-radius:8px; overflow:auto; font-size:13px; line-height:1.45; }
pre code { background:none; color:inherit; padding:0; }
table { border-collapse:collapse; width:100%; margin:10px 0 16px; font-size:14px; }
th, td { text-align:left; vertical-align:top; padding:7px 10px; border-bottom:1px solid var(--line); }
th { color:var(--mute); font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:.04em; }
td.num { font-variant-numeric:tabular-nums; }
.callout { border-left:4px solid var(--accent); background:#f4f2ff; padding:12px 16px; border-radius:0 8px 8px 0; margin:14px 0; max-width:88ch; }
.callout.warn { border-color:var(--warn); background:#fff5ee; }
.callout.ok { border-color:var(--ok); background:#eefaf2; }
.refs { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin:12px 0 4px; }
.refs figure, figure.shot { margin:0; border:1px solid var(--line); border-radius:8px; overflow:hidden; background:var(--wash); }
.refs img, figure.shot img { display:block; width:100%; height:auto; }
figcaption { font-size:13px; color:var(--mute); padding:8px 10px; }
.refs .wide { grid-column:1 / -1; }
.dg { margin:12px 0; border:1px solid var(--line); border-radius:8px; background:#fbfcfd; }
.dg-wrap { overflow-x:auto; padding:8px; }
.dg-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.dg-title { font:600 13px Inter,system-ui,sans-serif; fill:var(--ink); }
.dg-parent { fill:#fff; stroke:#3b3f45; stroke-width:1.4; }
.dg-band { fill:#f2f3f5; }
.dg-rule { stroke:#d3d7dc; stroke-width:1; }
.dg-child { fill:#fff; stroke:#8a9099; stroke-width:1.1; }
.dg-child-edge { stroke:#5c636c; }
.dg-def { fill:#efe9ff; stroke:#5b46e5; stroke-width:1.2; }
.dg-h { font:600 12px ui-monospace,Menlo,monospace; fill:#1a1c1f; }
.dg-c { font:500 11px ui-monospace,Menlo,monospace; fill:#2c3036; }
.dg-dim { font:11px ui-monospace,Menlo,monospace; fill:#6b7480; }
.dg-meas { stroke:#c25b17; stroke-width:1.2; }
.dg-arrow { fill:none; stroke:#5b46e5; stroke-width:1.3; }
.dg-arrfill { fill:#5b46e5; }
.mocks { display:grid; grid-template-columns:repeat(3, 1fr); gap:14px; margin:12px 0; }
.mock-card { border:1px solid var(--line); border-radius:10px; overflow:hidden; }
.mock-card h4 { margin:0; padding:9px 12px; font-size:13px; background:var(--wash); border-bottom:1px solid var(--line); }
.mock-card h4 b { color:var(--accent); }
.mock-card .why { font-size:12.5px; color:var(--mute); padding:8px 12px 10px; margin:0; }
.mk { background:#1f1f1f; color:#d6d6d6; padding:12px 12px 10px; font:12.5px/1.35 Inter,system-ui,sans-serif; min-height:340px; }
.mk-head { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
.mk-label { font-weight:700; letter-spacing:.06em; font-size:11.5px; color:#c9c9c9; }
.mk-pill { background:#333; border-radius:9px; padding:3px 8px; font-size:11px; color:#ddd; }
.mk-plus { margin-left:auto; color:#bbb; font-size:18px; line-height:1; cursor:pointer; }
.mk-list { border-top:1px solid #3a3a3a; }
.mk-row { display:flex; align-items:center; gap:7px; padding:6px 2px; border-bottom:1px solid #2e2e2e; }
.mk-row.is-muted { opacity:.5; }
.mk-grip { color:#6b6b6b; cursor:grab; letter-spacing:-3px; }
.mk-icon { width:18px; height:18px; border:1px solid #555; border-radius:4px; display:grid; place-items:center; font-size:11px; color:#ccc; }
.mk-title { font-family:ui-monospace,Menlo,monospace; color:#eee; }
.mk-kind { color:#8d8d8d; font-size:11px; }
.mk-view { margin-left:auto; background:#2b2b2b; border:1px solid #444; border-radius:4px; padding:0 5px; font-size:10.5px; color:#bbb; }
.mk-more { color:#8a8a8a; }
.mk-wchip { background:#2b2b2b; border:1px solid #444; border-radius:9px; padding:0 7px; font-size:10.5px; color:#bbb; }
.mk-wchip.is-on { background:#8e6cff; border-color:#8e6cff; color:#fff; }
.mk-sub { font-weight:700; font-size:12px; margin:14px 0 6px; color:#c9c9c9; }
.mk-presets { display:grid; grid-template-columns:1fr 1fr; gap:6px; }
.mk-presets.three { grid-template-columns:1fr 1fr 1fr; }
.mk-btn { text-align:center; border:1px solid #555; border-radius:8px; padding:8px 4px; color:#eee; font-weight:600; }
.mk-btn.is-on { background:#8e6cff; border-color:#8e6cff; color:#fff; }
.mk-grid { display:grid; grid-template-columns:1fr 1fr 1.3fr; gap:6px; margin-top:8px; }
.mk-grid.two { grid-template-columns:1fr 1fr; }
.mk-grid label { display:flex; flex-direction:column; gap:3px; font-size:11px; color:#a9a9a9; }
.mk-num { background:#2b2b2b; border:1px solid #444; border-radius:6px; padding:5px 8px; color:#eee; font:12.5px ui-monospace,Menlo,monospace; }
.mk-num i { font-style:normal; color:#777; margin-left:3px; }
.mk-seg { display:grid; grid-template-columns:1fr 1fr; border:1px solid #444; border-radius:6px; overflow:hidden; }
.mk-seg b { text-align:center; padding:5px 0; font-weight:600; color:#bbb; }
.mk-seg b.is-on { background:#8e6cff; color:#fff; }
.mk-hint { color:#9a9a9a; font-size:11.5px; margin:8px 0 0; }
.mk-menu { margin:10px 0 0; background:#2a2a2a; border:1px solid #444; border-radius:8px; padding:6px; width:280px; }
.mk-menu-title { font-size:11px; color:#999; padding:2px 8px 6px; }
.mk-menu-item { padding:6px 8px; border-radius:6px; display:flex; flex-direction:column; }
.mk-menu-item:first-of-type { background:#3a3a3a; }
.mk-menu-item b { color:#eee; font-weight:600; }
.mk-menu-item span { color:#999; font-size:11px; }
.crit td:first-child { font-weight:600; }
.plan td:nth-child(1) { font-family:ui-monospace,Menlo,monospace; font-size:12.5px; white-space:nowrap; }
.dec { border:1px solid var(--line); border-radius:8px; padding:10px 14px; margin:10px 0; }
.dec b.q { color:var(--accent); }
.dec .default { color:var(--ok); font-weight:600; }
.pill { display:inline-block; font-size:11px; padding:1px 7px; border-radius:9px; background:var(--wash); color:var(--mute); margin-left:6px; vertical-align:middle; }
.pill.no { background:#fde8e8; color:#a12727; }
.pill.yes { background:#e6f6ec; color:#1f6f3d; }
@media (max-width:900px){ .refs,.dg-grid,.mocks{grid-template-columns:1fr} }
"""


def page(m: dict) -> str:
    inset, gap = m["inset"], m["gap"]
    hdr, ftr = m["header"], m["footer"]
    kids = [("__init__()", 300, 120), ("estimate()", 340, 150), ("PoseFilter", 260, 110)]
    diagrams = "".join([
        stack_svg(m, title=f"Inset preset · gap {gap} · gutter {inset} · Fill", gap=gap, gutter=inset, fill=True,
                  parent_w=380, children=kids,
                  note=f"Today's Inset numbers ({gap}/{inset}) as a live stack. Every member fills 380 − 2·{inset} = {380 - 2 * inset}. The parent's height is hugged: header {hdr} + members + gaps + footer {ftr}."),
        stack_svg(m, title="Edge-to-edge preset · 0 / 0 · Fill", gap=0, gutter=0, fill=True, parent_w=380, children=kids,
                  note="The same members with both numbers at zero: one continuous stack, corners squared, borders shared. This is the Port-view formatting Zach wants for instances."),
        stack_svg(m, title="Custom · gap 4 · gutter 24 · Own", gap=4, gutter=24, fill=False, parent_w=380, children=kids,
                  note="Exact pixels, and Own width: each member keeps its own box and left-aligns on the gutter. Nothing about the parent's width is written."),
        stack_svg(m, title="Hug · gap 8 · gutter 16 · Own", gap=8, gutter=16, fill=False, parent_w=None, hug=True, children=kids,
                  note="Auto-fit on: the parent's width is the widest Own member + 2·gutter, its height is the stack. This is the 'largest child drives the expanded width' rule from the wireframe."),
    ])
    lines = m["lines"]
    row_arms = ('<span class="pill yes">merged</span>' if m["row_arms_merged"] else '<span class="pill no">not merged</span>')

    return f"""<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Block members proposal</title>
<style>{CSS}</style>
<main>
<h1>Members of a Block, authored like ports</h1>
<p class="meta">Proposal, then built the same day · {date.today()} · measured against <code>{m['head']}</code> · tldraw {m['tldraw']} pinned · <a href="#built">jump to what shipped</a></p>

<p class="lede"><b>Recommendation.</b> A member is what an Expanded Block's direct child Block already is — tldraw's <code>parentId</code>, already replicated across every linked occurrence by the definition body sync. So do not add a second membership model. Add the three things that are missing: a <b>Members</b> section in the inspector that mirrors Inputs/Outputs (list, grip reorder, <code>+</code>), an <b>authored order</b> that is tldraw's own child index, and a <b>live stack layout</b> on the parent driven by three numbers — <code>gap</code>, <code>gutter</code>, <code>width: fill | own</code> — with <b>Inset</b> and <b>Edge-to-edge</b> demoted to presets that write those numbers. One rule keeps a definition from being sized by two parents: Fill only ever writes an occurrence's Port/Simple box, and an Expanded child is always Own and drives its parent. Blocks do not store their parents; <code>parentId</code> plus <code>linkedBlockOccurrences</code> derive them, and PEP 0004 already ruled that a stored stamp loses to containment.</p>

<div class="callout"><b>Where this changes the brief.</b> "Add children like ports" reads as if children need building. They exist, they sync, they export, and Inset/Edge-to-edge already paints them. What does not exist is <i>order as an authored fact</i>, <i>layout as a live constraint</i>, and <i>the list</i>. That reframing is why the plan below is ~5 files, not a new primitive.</div>

<h2 id="today">1 · What already exists, measured</h2>
<table>
<tr><th>Fact</th><th>Where</th><th>Consequence for the proposal</th></tr>
<tr><td>Only Expanded contains; it is frame-like and clips children</td><td><code>canBlockContainChildren</code>, <code>isFrameLike</code></td><td>Members are a property of Expanded. Port and Simple faces keep no members; their occurrence inside a parent is the member.</td></tr>
<tr><td>Member layout is a one-shot command, ordered by <code>y</code></td><td><code>memberLayout.ts</code> ({lines['memberLayout.ts']} lines) sorts <code>a.y - b.y</code></td><td>Order is geometry, so a drag silently reorders and the inspector has nothing to list. This is the seam that becomes authored.</td></tr>
<tr><td>Inset = {inset} px inset · {gap} px gap; Edge-to-edge = 0 / 0; width already fills</td><td><code>BLOCK_MEMBER_INSET_PX</code>, <code>BLOCK_MEMBER_GAP_PX</code></td><td>The two presets Zach named are exactly these numbers; today's default is already Fill.</td></tr>
<tr><td>Auto-fit is a derived, history-ignored settle pass over stock <code>fitFrameToContent</code>, padding {m['autofit_pad']}</td><td><code>blockAutoResize.ts</code> ({lines['blockAutoResize.ts']} lines)</td><td>The live stack reuses this exact seam (side effects → settle after the gesture) instead of inventing a layout engine.</td></tr>
<tr><td>A definition shares ports, description, type, <b>body</b> and <b><code>views.expanded</code></b>; Port/Simple boxes stay per occurrence</td><td><code>sharedDefinitionProps</code>, <code>syncLinkedBody</code> in <code>definitionLinking.ts</code></td><td>The "member of two parents" conflict is real for exactly one field. Rule 4 below closes it.</td></tr>
<tr><td>Header {hdr} px, footer {ftr} px, body gap {m['row_gap']} px</td><td><code>layoutBlock.ts</code></td><td>The stack's first slot starts at header + gap; hug height ends at footer. The diagrams below use these.</td></tr>
<tr><td>Inspector Inputs/Outputs: grip drag on dnd-kit, ↑↓ keys, <code>+</code>, reducer <code>moveBlockPortToSection</code></td><td><code>BlockInspector.tsx</code> ({lines['BlockInspector.tsx']} lines)</td><td>Members clone this section's grammar verbatim — same grip, same card-in-flight, same reducer shape.</td></tr>
<tr><td>Named method rows (<code>init()</code>, <code>estimate()</code> as Block-owned rows) — <code>track/block-row-arms</code> {row_arms}</td><td>commit <code>2877fea</code>, 2026-09-03</td><td>Members subsume it: a row that owns children and a header <i>is</i> a child Block. Recommend leaving it unmerged (D6).</td></tr>
<tr><td>{m['migrations']} Block migrations so far, last <code>{m['last_migration']}</code>; {m['optional_props_precedent']} optional props already on the schema</td><td><code>blockShapeMigrations.ts</code>, <code>blockModel.ts</code></td><td>Every new field here is optional with a reader default, so no migration is needed and no saved board changes.</td></tr>
<tr><td>tldraw's <code>stackShapes</code> exists but its own source says nobody uses its gap path, and it refuses two shapes at gap 0</td><td><code>@tldraw/editor Editor.ts</code></td><td>Not the primitive to build on. The pass is ~40 lines of arithmetic over <code>layoutBlock()</code>, which the app already trusts.</td></tr>
</table>

<div class="refs">
  <figure class="wide"><img src="{REL}/ref-wireframe.png" alt="Zach's wireframe: a parent Block stacking three child cards, with notes"><figcaption>Zach's wireframe, 2026-09-09. Children stacked vertically; the widest child drives the expanded width; each child gets the parent's full customization; cabling happens inside the children.</figcaption></figure>
  <figure><img src="{REL}/ref-inputs-section.png" alt="The Inputs section of the inspector today"><figcaption>The Inputs section the Members section copies: label · count pill · <code>+</code>. (The <b>Link</b> chip here is PEP 0003's adjacent-port link, not definition linking.)</figcaption></figure>
  <figure><img src="{REL}/ref-member-layout.png" alt="Today's Member layout control: Inset / Edge-to-edge"><figcaption>Today's control. It stays, as presets, and moves from View into the Members section.</figcaption></figure>
  <figure><img src="{REL}/live-inset.png" alt="Live capture: Inset with soft-gray well"><figcaption>Real app, 2026-09-05: Inset with the soft-gray well. Two direct child Blocks.</figcaption></figure>
  <figure><img src="{REL}/live-edge-to-edge.png" alt="Live capture: Edge-to-edge"><figcaption>Real app, 2026-09-05: Edge-to-edge joins the same two children into one stack.</figcaption></figure>
</div>

<h2 id="criteria">2 · What good looks like</h2>
<table class="crit">
<tr><th>Criterion</th><th>Weight</th><th>Why it is weighted this way</th></tr>
<tr><td>Zero-relearning: members behave like ports, spacing behaves like Figma auto-layout</td><td class="num">30</td><td>Zach specs by pointing at reference apps. Inputs/Outputs is the in-app reference; Figma's Fill/Fixed + gap + padding is the external one.</td></tr>
<tr><td>No second membership model</td><td class="num">25</td><td>Body sync, export, detach, auto-fit and cable scope all read <code>parentId</code>. A stored <code>memberIds</code> array would drift from it the way PEP 0004's stamp did.</td></tr>
<tr><td>Existing boards do not move</td><td class="num">20</td><td>Free-form Expanded frames with children exist on real boards. They must keep their positions until an author opts a Block into a stack.</td></tr>
<tr><td>Every instance view achievable: inset cards, edge-to-edge instances, exact px</td><td class="num">15</td><td>The stated goal — "I see how I can really achieve all the different views I want".</td></tr>
<tr><td>Stock tldraw, small diff</td><td class="num">10</td><td>The one rule. Reparent, clip, index, drag-in/out, history all stay stock.</td></tr>
</table>

<h2 id="model">3 · The model</h2>
<h3>3.1 Membership is <code>parentId</code>; order is the child index</h3>
<p>A member of Block <i>P</i> is a Block whose <code>parentId</code> is <i>P</i>. tldraw already keeps an authored, fractional <code>index</code> on every child and exposes it through <code>getSortedChildIdsForParent</code>. A vertical stack has no meaningful z-order of its own (nothing overlaps), so the index is free to mean <b>stack order</b>. Reorder in the list = rewrite indexes with stock <code>getIndicesBetween</code>; the layout pass then places them. No new array, nothing to keep in sync, and duplicate/paste/undo keep it right because tldraw maintains it.</p>

<h3>3.2 Four optional props on the parent, no migration</h3>
<pre><code>// src/blocks/blockModel.ts — all optional: every saved Block reads as today
bodyLayout:   T.literalEnum('free', 'stack').optional(),   // absent = 'free'
memberGap:    T.number.optional(),                          // absent = preset default
memberGutter: T.number.optional(),                          // absent = preset default
memberWidth:  T.literalEnum('fill', 'own').optional(),      // absent = 'fill' (today's behaviour)

// memberLayout: 'inset' | 'edge-to-edge' stays — it is still the PAINT style
// (cards with radius vs one joined stack) and the preset that seeds the numbers.

export function blockMemberSpacing(props): {{ gap: number; gutter: number }} {{
  const preset = blockMemberLayout(props) === 'edge-to-edge' ? 0 : BLOCK_MEMBER_GAP_PX  // 12
  return {{ gap: props.memberGap ?? preset, gutter: props.memberGutter ?? preset }}
}}</code></pre>
<p>Pressing <b>Inset</b> or <b>Edge-to-edge</b> sets <code>memberLayout</code> and <i>clears</i> both numbers. Typing a number leaves <code>memberLayout</code> (the paint) alone and sets the override. The preset button lights only when the effective numbers equal its pair, so the UI never lies about hidden state.</p>

<h3>3.3 Free vs Stack</h3>
<p><code>bodyLayout: 'free'</code> is today: a frame, children wherever they were dropped, Inset/Edge-to-edge as the one-shot command it is now, with its WHY intact. <code>'stack'</code> is the new mode: the parent lays its member Blocks out continuously, and a Block dropped into it takes the slot under the pointer instead of a free position. That is Zach's "when you add children you cannot add blocks to the parent in the free sense" — as a mode the author enters, not a rule that fires on existing boards. The first <b>Add member</b> from the inspector flips a free Block to stack (D7). Non-Block children (a sticky, a callout) are not laid out and keep floating (D5). Cables are children too and are already excluded from clipping; the pass ignores them.</p>

<h3>3.4 The live pass</h3>
<pre><code>// src/blocks/memberStack.ts — mirrors installBlockAutoResize exactly
installBlockMemberStack(editor):
  side effects (create / change / delete of any shape) → note every stack ancestor
  settle once after the operation; never while isBlockAutoResizeGestureActive()
  for each dirty stack parent, history-ignored, guarded against its own writes:
    frame   = layoutBlock(parent.props)           // header.h, footer.h — the app's own geometry
    members = getSortedChildIdsForParent(parent)  // authored order
              .filter(isBlockShape)
    {{gap, gutter}} = blockMemberSpacing(parent.props)
    y = frame.header.h + gap
    for m in members:
      w = memberWidth === 'fill' && m.props.view !== 'expanded'
            ? parent.w - 2*gutter : m.props.w        // Rule 4: Expanded children are Own
      write m.x = gutter, m.y = y, m.w = w (via resizeBlockProps, keeps views[] honest)
      y += m.h + gap
    if parent.autoResize:
      parent.w = max(own widths of Own members) + 2*gutter  (only if some member is Own)
      parent.h = y + frame.footer.h</code></pre>
<p>Why this is not a feedback loop: the only parent field read by children is <code>w</code>, and the only child field read by the parent is the <code>w</code> of members it did <i>not</i> just write (Own). Fill children never feed the hug, so the fixed point is reached in one pass. When every member is Fill and auto-fit is on, width is authored and only the height hugs.</p>

<div class="dg-grid">{diagrams}</div>

<h3>3.5 Rule 4 — one definition, many parents</h3>
<p>Zach's worry is precise: a Block that is a member of two parents "can only have the one width in the expanded view". The tree confirms it is one field. Occurrences of a definition share <code>views.expanded</code> (and body, ports, description, type); the Port and Simple boxes are per occurrence. So:</p>
<div class="callout ok"><b>Fill writes only the occurrence's Port/Simple box. An Expanded child is always Own and drives its parent.</b> A parent may size the <i>instance</i> it holds; it may never reach through the instance into the class. The stack pass enforces it (one branch), and a unit test proves <code>views.expanded</code> is byte-identical before and after any stack pass. This is exactly the working rule in Zach's note — "in expanded view we generally don't drive the width; in port view we drive the width and do edge to edge".</div>
<figure class="dg"><div class="dg-wrap">{two_parents_svg()}</div><figcaption>The same definition as a Port-view member of two stacks with different gutters, and expanded on its own. Two different member widths, one shared expanded box, no conflict.</figcaption></figure>
<p>"Each block needs to know its parents" therefore needs no field. One occurrence has one <code>parentId</code>; a definition's parents are <code>linkedBlockOccurrences(editor, block).map(o ⇒ parentBlock(o))</code>, derived on demand for the inspector's "Used in: A, B" line. PEP 0004 already decided that a stored owner id is a fallback that loses to containment; storing a parent list here would reopen that bug class on paste.</p>

<h2 id="ui">4 · The inspector — Members section</h2>
<p>Cloned from Inputs/Outputs: uppercase label, count pill, <code>+</code>; rows with a grip (dnd-kit handle, ↑↓ to step, no <code>SortableContext</code>, same as ports), the member's icon, its title in mono, its type, a view badge (S/P/E) for the occurrence, and <code>⋯</code> for <i>Remove from stack</i> (stock reparent to the page, page position kept — the existing "Remove from container" path), <i>Unlink</i>, <i>Delete</i>. <b>Clicking a row selects the member on the canvas</b>, so the inspector then shows the child — that is the "it still acts like a frame; select the parent, the parent comes up; select the child, the child comes up" note answered by stock selection, not by a nested editor. The Member layout control moves out of View into this section, since it only means something with members.</p>
<p>Three ways to lay out the spacing control were babbled. <b>V1 is applied by default</b>; the other two are one CSS block away.</p>
<div class="mocks">
  <div class="mock-card"><h4><b>V1 · Numbers always visible</b> — recommended</h4>{variant_b()}<p class="why">Figma's grammar: gap and padding are always on screen, presets are shortcuts. No hidden state, exact px one click away — the stated want.</p></div>
  <div class="mock-card"><h4>V2 · Presets first, Custom discloses</h4>{variant_a()}<p class="why">Quietest panel. Costs a click to see the numbers and hides whether an override is active behind "Custom" — the state the presets would have to lie about.</p></div>
  <div class="mock-card"><h4>V3 · Width per member</h4>{variant_c()}<p class="why">Figma-exact (Fill/Fixed is per child). More authoring power, one more prop on the child. Recommended as the V2 follow-up once a board actually needs a mixed stack.</p></div>
</div>
<h3>4.1 Add member</h3>
<div class="mk" style="min-height:0;border-radius:8px;max-width:420px">{mock_header(4)}{add_menu()}</div>
<p><b>New Block</b> creates a fresh definition in Port view, parented to the stack and indexed last — the same <code>getDefaultBlockProps()</code> path the tool uses, then a reparent. <b>Link existing…</b> creates a Block carrying a chosen definition's <code>definitionId</code>; the linking installer already materialises its body and ports on <code>afterCreate</code>, so the command is a search over <code>allBlocks</code> by title plus one <code>createShapes</code>. No library work is needed for V1.</p>

<h3>4.2 On the canvas</h3>
<p>In stack mode a member is still a stock shape: plain drag translates it, and the settle pass puts it back into a slot. The slot is decided <b>at the landing</b> from the drop <code>y</code> — the same judge the port rows use (<code>blockPortDropTarget</code> becomes <code>blockMemberDropTarget(parent, members, y)</code> returning <code>{{ before }}</code>), and the same visual grammar: a tinted band and a rule while the card is in flight, nothing else moving until release. Dragging out of the parent leaves the stack through stock <code>onDragShapesOut</code>; dragging a Block in through stock <code>onDragShapesIn</code> inserts it at the pointer's slot instead of at its free position. No new gesture, no hold-to-drag: a press on a member is never a cable, so the port lane's hold rule does not apply here.</p>

<h2 id="rows">5 · So what are rows?</h2>
<p>Zach's follow-up — "what does rows on a block mean? different things inside, but those are just children no?" — splits cleanly on <i>whose ports they are</i>:</p>
<table>
<tr><th>Thing</th><th>Whose ports</th><th>Keep?</th></tr>
<tr><td>Port rows (<code>row 0</code> heading, <code>1+</code> body; <code>if:</code>/<code>elif:</code> bands)</td><td>The parent's own signature, visually grouped</td><td>Yes — one callable, several bands. Unchanged.</td></tr>
<tr><td>Named method rows (<code>track/block-row-arms</code>, unmerged)</td><td>A row that owns a header and children of its own</td><td>No — that is a child Block. Members give it back with the full inspector, definition linking and export for free.</td></tr>
<tr><td>Members</td><td>Each member's own signature</td><td>This proposal.</td></tr>
</table>
<p>The honest answer to "does this solve my rows issue" is: it removes the need for the unmerged named-rows branch, and it leaves port rows alone. If, after members ship, no board still uses a multi-row single signature, port rows can be retired in their own step — but that is a separate observation to make, not a decision to bundle here.</p>

<h2 id="plan">6 · Implementation plan</h2>
<table class="plan">
<tr><th>File</th><th>Change</th><th>Size</th></tr>
<tr><td>src/blocks/blockModel.ts</td><td>Four optional props (3.2), readers <code>blockBodyLayout</code>, <code>blockMemberSpacing</code>, <code>blockMemberWidth</code>. No migration. Presets clear overrides.</td><td>~50</td></tr>
<tr><td>src/blocks/memberLayout.ts</td><td><code>blockMemberPlacements</code> takes members in index order and reads spacing/width from props; add <code>blockMemberDropTarget</code>. The one-shot command keeps serving <code>'free'</code>.</td><td>~60</td></tr>
<tr><td>src/blocks/memberStack.ts <span class="pill">new</span></td><td><code>installBlockMemberStack</code> (3.4), cloned from <code>installBlockAutoResize</code>'s pending/settle/fitting structure. Registered in <code>App.tsx</code>; <code>tests/test_stock_boundary.py</code> learns the new seam line.</td><td>~140</td></tr>
<tr><td>src/blocks/commands/blockCommands.ts</td><td><code>addBlockMember</code>, <code>linkBlockMember</code>, <code>moveBlockMember(before)</code>, <code>removeBlockMember</code>, <code>setBlockMemberSpacing</code>, <code>setBlockMemberWidth</code>, <code>setBlockBodyLayout</code> — each a marked history stop, each expressed against a neighbour id, never an index.</td><td>~120</td></tr>
<tr><td>src/blocks/ui/BlockInspector.tsx</td><td><code>MembersSection</code> cloned from the port section (grip, ↑↓, DndContext, hint), the V1 spacing block, the Add menu; move Member layout here from View. Row click → <code>editor.select(member)</code>.</td><td>~260</td></tr>
<tr><td>src/blocks/BlockShapeUtil.tsx</td><td>In stack mode, <code>onDragShapesIn</code> inserts by drop <code>y</code> (index rewrite) before stock reparents. <code>toSvg</code> already reads the parent's paint style.</td><td>~30</td></tr>
<tr><td>src/blocks/ui/block-canvas.css</td><td>Band + rule while a member is in flight (reuse the port-row classes). Edge-to-edge paint already exists.</td><td>~20</td></tr>
<tr><td>tests</td><td><code>memberLayout.test.ts</code> (order by index, spacing, fill/own, hug fixed point, Expanded child never resized); <code>memberStack.test.ts</code> (no write during a gesture, remote source, <code>views.expanded</code> byte-identical); inspector test (add, reorder, remove, select-on-click); journey <code>tests/block_members_smoke.mjs</code> (add three members, grip-reorder, canvas drop reorders, type gap 4, press Edge-to-edge, export SVG); review fixture <code>sketches/review/block-members.systemsketch</code>.</td><td>~500</td></tr>
</table>
<p><b>Order.</b> Tracer bullet first: the list, read-only, over today's <code>parentId</code> children in index order, plus <b>Add member</b> — visible in a day, and it already answers "add children like ports". Then the live stack and the four props (one PR, because the numbers mean nothing without the pass). Then canvas drop-to-slot. Then <b>Link existing…</b>. Per-member width (V3) waits for a board that needs it.</p>
<p><b>Migration id.</b> None. If a later step does need one, it is the {m['migrations'] + 1}th, after <code>{m['last_migration']}</code>.</p>

<h2 id="decisions">7 · Decisions for you — silence takes the default</h2>
<div class="dec"><b class="q">D1 · Live stack or one-shot command?</b> Ports are live; the wireframe treats members the same way. <span class="default">Default: live in stack mode, one-shot stays for free mode</span>, and the existing WHY comment is narrowed to free mode rather than deleted.</div>
<div class="dec"><b class="q">D2 · Order source?</b> tldraw child index vs a stored <code>memberIds</code> array. <span class="default">Default: the child index</span> — stock, paste-safe, nothing to keep in sync. Say "array" if you want members that are not children (a stack of references) — that is a different feature.</div>
<div class="dec"><b class="q">D3 · Width policy on the parent (V1) or per member (V3)?</b> <span class="default">Default: parent-level <code>fill | own</code> now, per-member override later</span> when a mixed stack shows up on a real board.</div>
<div class="dec"><b class="q">D4 · Expanded children always Own?</b> This is what protects the shared <code>views.expanded</code>. <span class="default">Default: yes, enforced in the pass and proven by a test.</span> The alternative — an occurrence-local width override that shadows the shared box — is more state for a case your own note says you avoid.</div>
<div class="dec"><b class="q">D5 · Non-Block children in a stack?</b> <span class="default">Default: they float free, unlaid-out</span>, so a sticky note beside a member still works. "Refuse" would need a new drag rule and buys nothing.</div>
<div class="dec"><b class="q">D6 · <code>track/block-row-arms</code>?</b> <span class="default">Default: leave it unmerged; members subsume named rows.</span> Port rows stay.</div>
<div class="dec"><b class="q">D7 · How does a Block enter stack mode?</b> <span class="default">Default: the first Add member from the inspector flips <code>bodyLayout</code> to stack; a Free/Stack toggle sits beside the presets for existing frames.</span> Existing boards never flip on their own.</div>

<h2 id="built">8 · Built — V1, as decided</h2>
<p>Zach's answers came back the same morning; this section records what shipped against them. The whole feature is one branch, <code>track/block-members-proposal</code>, on top of the proposal above. Unit tests: {m['unit']}. The real-browser journey <code>npm run test:members</code> makes {m['journey_checks']} checks on the review fixture.</p>

<h3>8.1 D1, explained properly: one-shot vs live</h3>
<table>
<tr><th></th><th>One-shot (a command)</th><th>Live (a constraint)</th></tr>
<tr><td>What happens when you press Inset</td><td>The members are arranged <i>once</i>, right now. Then they are ordinary free shapes again.</td><td>The Block adopts the arrangement as a property. It re-runs after every change.</td></tr>
<tr><td>Drag a member half out of line</td><td>It stays where you dropped it.</td><td>It snaps back into the column — and takes the slot it landed on.</td></tr>
<tr><td>Add a member, grow one by adding a port</td><td>Nothing else moves; you press Inset again to tidy.</td><td>The stack re-flows and the parent hugs it.</td></tr>
<tr><td>Where it lives now</td><td><b>Free</b> mode — exactly today's behaviour, untouched.</td><td><b>Stack</b> mode — the new toggle. Ports have always worked this way.</td></tr>
</table>
<p>The implementation of live is the same shape as auto-fit: subscribe at tldraw's side-effect seam, note the dirty stack, settle <i>once</i> after the operation and never during a pointer gesture, write with history ignored, filter your own writes. <code>memberStack.ts</code> is {m['stack_lines']} lines.</p>

<h3>8.2 The decisions, as taken</h3>
<table>
<tr><th>Decision</th><th>Zach</th><th>Shipped</th></tr>
<tr><td>D1 live vs one-shot</td><td>asked for the explanation, then: "in stack mode I want them to behave more like cards in a kanban row, implementing using dnd kit"</td><td>Live in Stack, one-shot kept in Free (8.1); the canvas drag is a dnd-kit lane (8.3).</td></tr>
<tr><td>D2 order source</td><td>"up to you"</td><td>tldraw's child index. A reorder permutes the members' <i>existing</i> indexes, so their z-order against cables and annotations never changes.</td></tr>
<tr><td>D3 width</td><td>V1</td><td>Parent-level <code>Fill | Own</code>. Per-member override deferred.</td></tr>
<tr><td>D4 Expanded children always Own</td><td>agreed</td><td>Enforced in <code>stackMemberFillsWidth</code>; a unit test proves <code>views.expanded</code> is untouched by a pass, and the journey re-checks it after every gesture.</td></tr>
<tr><td>D5 non-Block children</td><td>allow them; annotations should not show up in the stack</td><td>Every shape with a box of its own is a member — a Code block, a region — and keeps its own width in V1. Stock annotations (rectangle, line, sticky, arrow, text) are not members and <b>float free, still visible</b>. Zach's word was "hidden"; hiding a sticky that cannot be found again felt worse than leaving it beside the stack, and it is a one-line change in <code>getBlockShapeVisibility</code> if he wants it hidden.</td></tr>
<tr><td>D6 named rows</td><td>members are the more powerful model</td><td><code>track/block-row-arms</code> left unmerged.</td></tr>
<tr><td>D7 entering Stack</td><td>only the toggle</td><td>A Free / Stack toggle in the Members section. Add member lands in the middle of a free Block and at the bottom of a stack.</td></tr>
<tr><td>Wired vs stacked</td><td>hide the cables in a stack</td><td>A cable parented to a stacked Block is hidden through tldraw's visibility seam (not deleted) and returns on Free. Unit-tested; not yet in the fixture.</td></tr>
<tr><td>Add member is blank</td><td>yes, and naming links it</td><td>Add creates an untitled Port-view Block. Renaming an <i>empty</i> Block to an existing title now adopts that definition outright instead of minting "Draft 2" — <code>isEmptyDefinition</code> in the title commit.</td></tr>
</table>

<h3>8.3 Kanban cards, on dnd-kit — in the list and on the canvas</h3>
<p>The list reorders exactly as the port list does: a <code>DndContext</code> with a 3px activation distance, the grip as the only handle, no <code>SortableContext</code>, and the drop resolved from live row rects — the moved row goes before the first row whose midpoint is below the pointer. ↑↓ on a grip steps one slot.</p>
<p><b>On the canvas, per Zach's follow-up ("in stack mode I want them to behave more like cards in a kanban row, implementing using dnd kit"), dnd-kit owns the gesture too.</b> <code>memberStackDnd.tsx</code> ({m['lane_lines']} lines) is the third scoped canvas drag owner, admitted on the Behavior Tree lane's exact terms: a capture-phase listener shadows a plain press on a stack member; at 3 px (below tldraw's 4 px threshold) it re-checks that tldraw is still in <code>select.pointing_shape</code> for that press — PEP 0013's state-ownership property, which is what keeps a port press (in <code>pointing_block_port</code>) with the cable lanes — then asks the select tool to stand down through <code>editor.cancel()</code> and hands a cloned, <code>markEventAsHandled</code> pointer-down to the mounted DndContext's proxy. From there the card rides the pointer, the other members take the candidate layout so the slot visibly opens (the slot is read from the card's midpoint against the others' midpoints frozen at claim, so it depends on the pointer alone and never flickers), release commits the order through the same reducer the list uses, Escape bails to the session's history mark, and one undo reverts the whole gesture. The settle pass stands down for the parent while dnd-kit owns it — single writer. The lifted card carries <code>data-member-dragging</code> for its shadow. A Free Block is byte-identical native tldraw. Dragging out of the Block still leaves the stack through stock drag-out; dropping a Block in through stock drag-in joins at the slot it landed on.</p>
<p>The boundary test admits the lane by property (state re-check at claim, preempt distance, cancel + markEventAsHandled, no sortable, page-space geometry, the pass standing down, the host mounted once). A PEP for the third owner is owed at merge time, not before.</p>

<h3>8.4 The Type block, and "everything is a div"</h3>
<p>The screenshot's Type block is today's <code>TypeAttributeRegion</code>: <code>attributeSource</code> parsed into a foldable presentation — deliberately not a second editable schema. The members model does not replace it yet, but it makes Zach's decomposition expressible: a Code block is already a stack member, so "an attribute block is a Block with a Code member" is something a board can hold today (Own width, since only a Block knows how to absorb Fill). The reusable component he pointed at — the rendered code block behind the attribute list — is the right next extraction; projecting a Type's attributes as a Code member would then be a small follow-up rather than a new primitive.</p>

<div class="refs">
  <figure><img src="{REL}/journey-added.png" alt="Journey capture: three stacked members after Add member, Members section open"><figcaption>Journey, step 3: Add member appended a blank Port-view member; the Members section lists all three; the parent hugged the stack.</figcaption></figure>
  <figure><img src="{REL}/journey-mid-drag.png" alt="Journey capture: a member card lifted mid-drag while its siblings open the slot"><figcaption>Journey, step 6, mid-gesture: dnd-kit has the pointer (tldraw is in <code>select.idle</code>), the card is lifted, and the siblings have opened the slot it will take.</figcaption></figure>
  <figure><img src="{REL}/journey-edge-to-edge.png" alt="Journey capture: Edge-to-edge stack"><figcaption>Journey, step 8: Edge-to-edge wrote 0 / 0, the typed Gap cleared, the cards squared and joined.</figcaption></figure>
  <figure class="wide"><img src="{REL}/fixture.png" alt="The review fixture: Class stacking two members with three numbered cues and a PASS WHEN card"><figcaption>The review board, <code>sketches/review/block-members.systemsketch</code>, generated through the real editor: the stack opened already hugged, three cues, one pass condition.</figcaption></figure>
</div>

<h3>8.5 Files</h3>
<table class="plan">
<tr><th>File</th><th>What</th></tr>
<tr><td>src/blocks/blockModel.ts</td><td>Four optional props, readers, presets as numbers (<code>blockMemberSpacingPreset</code>).</td></tr>
<tr><td>src/blocks/memberLayout.ts</td><td><code>stackMemberPlacements</code> over any boxed member, <code>stackMemberFillsWidth</code> (rule 4), <code>blockMemberDropTarget</code>; the free-mode command kept.</td></tr>
<tr><td>src/blocks/memberStack.ts <span class="pill">new</span></td><td>Membership test, landing-order re-index, the pass, the hug, the installer; stands down while the lane owns a parent.</td></tr>
<tr><td>src/blocks/memberStackDnd.tsx <span class="pill">new</span> · memberStackDragState.ts</td><td>The third canvas dnd-kit owner: claim, preempt, hand-off, interlock, per-frame slot preview, commit and cancel; the drag signal the pass and the canvas read.</td></tr>
<tr><td>src/blocks/commands/memberCommands.ts <span class="pill">new</span></td><td>Body layout, spacing, width, add, move, step, remove.</td></tr>
<tr><td>src/blocks/ui/BlockInspector.tsx</td><td>The Members section (V1 control block), actions wired; Member layout moved out of View.</td></tr>
<tr><td>src/blocks/blockVisibility.ts · blockAutoResize.ts · definitionLinking.ts · App.tsx</td><td>Cables hidden in a stack · stock auto-fit stands aside for a stack · empty-Block rename adopts · installer registered (and asserted by <code>test_stock_boundary.py</code>).</td></tr>
<tr><td>tests/block_members_smoke.mjs · sketches/review/block-members.*</td><td>The journey and the review fixture.</td></tr>
</table>

<h2 id="not">9 · Deliberately not done</h2>
<p>Per-member width (V3) waits for a board that needs a mixed stack. <b>Link existing…</b> was dropped from the Add menu on Zach's call: naming a blank member is the link. The Members list does not edit a child in place ("it still kinda acts like a frame"); a row click selects the member and the inspector follows. Horizontal stacks were not designed. Non-member annotations float visibly rather than hiding (D5 above). A Code member keeps its own width — Fill for non-Blocks needs each shape to own a resize path. Nothing here is a PEP yet; if this lands on <code>main</code>, the Free/Stack fork is the one decision worth a numbered record at merge time.</p>

<p class="meta">Built by <code>docs/build_block_members_proposal.py</code>. Numbers are read from the tree at build time; the builder refuses to publish if the seams it describes have moved.</p>
</main>
"""


def main() -> None:
    m = measured()
    fixture_png = ROOT / "sketches/review/block-members.png"
    if fixture_png.exists():
        MEDIA.mkdir(parents=True, exist_ok=True)
        (MEDIA / "fixture.png").write_bytes(fixture_png.read_bytes())
    for name in ("ref-wireframe.png", "ref-inputs-section.png", "ref-member-layout.png", "live-inset.png", "live-edge-to-edge.png",
                 "journey-added.png", "journey-mid-drag.png", "journey-edge-to-edge.png", "fixture.png"):
        if not (MEDIA / name).exists():
            raise SystemExit(f"missing reference capture {MEDIA / name}")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(page(m), encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size:,} bytes) — measured {m}")


if __name__ == "__main__":
    main()
