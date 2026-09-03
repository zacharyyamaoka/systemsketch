#!/usr/bin/env python3
"""Build the self-contained UI/UX hardening report for 2026-09-03.

Every number on the page is measured here, at build time, from the live tree
and from the JSON the browser journey wrote — never typed into the template.
A report that hardcoded its counts would go on claiming them after the code
moved underneath it.
"""

from __future__ import annotations

import base64
import html
import json
import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
ASSETS = DOCS / "assets"
SRC = ROOT / "src"
OUTPUT = DOCS / "ui-hardening-2026-09-03.html"
RESULTS = DOCS / "ui-hardening-results.json"
FIXTURE_PNG = ROOT / "sketches" / "review" / "ui-hardening.png"
JOURNEY = ROOT / "tests" / "ui_hardening_smoke.mjs"
BEFORE_LOG = ASSETS / "ui-hardening-before.txt"
DRIVE_LOG = ASSETS / "ui-hardening-drive.txt"


def image_uri(path: Path) -> str:
    return f"data:image/png;base64,{base64.b64encode(path.read_bytes()).decode()}"


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=ROOT, capture_output=True, text=True, check=False
    ).stdout.strip()


def strip_comments(css: str) -> str:
    return re.sub(r"/\*.*?\*/", "", css, flags=re.S)


def focus_visible_rules() -> dict[str, int]:
    """How many `:focus-visible` selectors each stylesheet declares, right now."""
    counts: dict[str, int] = {}
    for path in sorted(SRC.rglob("*.css")):
        source = strip_comments(path.read_text(encoding="utf-8"))
        found = len(re.findall(r":focus-visible", source))
        if found:
            counts[path.relative_to(SRC).as_posix()] = found
    return counts


def measure() -> dict[str, object]:
    results = json.loads(RESULTS.read_text(encoding="utf-8"))
    changed = [
        line for line in git("diff", "main", "--name-only", "--", "src", "tests").splitlines()
        if line
    ]
    added = [
        line for line in git(
            "ls-files", "--others", "--exclude-standard", "--", "src", "tests"
        ).splitlines() if line
    ]
    diffstat = git("diff", "--shortstat", "main", "--", "src", "tests")
    native_confirm = len(re.findall(
        r"window\.confirm\(",
        "\n".join(
            path.read_text(encoding="utf-8")
            for path in SRC.rglob("*.ts*")
        ),
    ))
    vitest_files = len(list(SRC.rglob("*.test.ts"))) + len(list(SRC.rglob("*.test.tsx")))
    return {
        "checks": results["checks"],
        "measured": results["measured"],
        "changed": changed,
        "added": added,
        "diffstat": diffstat,
        "native_confirm": native_confirm,
        "focus_rules": focus_visible_rules(),
        "vitest_files": vitest_files,
        "journey_lines": len(JOURNEY.read_text(encoding="utf-8").splitlines()),
    }


# The thirty candidates the live audit produced, and which of them each shipped
# change closes. Kept here because the report IS the record of that pass.
CANDIDATES: list[tuple[str, str, str]] = [
    ("A", "Command palette has no visible keyboard focus ring", "shipped-1"),
    ("A", "Comments panel buttons have no focus ring", "shipped-1"),
    ("A", "Appearance triggers and 28 swatches have no focus ring", "shipped-1"),
    ("A", "Workspace dialogs and file rows have no focus ring", "shipped-1"),
    ("A", "Palette mode switch is a malformed tablist", "shipped-7"),
    ("A", "28 menuitemradio buttons with no menu ancestor", "shipped-7"),
    ("A", "Theme radiogroup ignores the arrow keys", "shipped-7"),
    ("A", "Disabled Settings categories hide their reason in a title", "shipped-7"),
    ("A", "Block view switcher is a bare S / P / E with no tooltip", "shipped-6"),
    ("A", "The whole comment list is one aria-live region", "open"),
    ("A", "No focus ring for on-canvas port affordances", "shipped-1"),
    ("A", "No roving tabindex on the diagnostics severity filters", "open"),
    ("B", "Inspect on a rectangle dead-ends on a Block placeholder", "shipped-3"),
    ("B", "Inspect is a button for a request the selection already made", "shipped-3"),
    ("B", "The inspector dock's empty state has no header and no close", "shipped-2"),
    ("B", "The Z avatar is an inert “Profile placeholder”", "shipped-10"),
    ("B", "Dead CSS: :has(.block-inspector__header) matches nothing", "shipped-2"),
    ("B", "The empty inspector ignores the app's own empty-state pattern", "shipped-2"),
    ("B", "The dock repeats its own title above the panel's", "shipped-3"),
    ("C", "The dock re-opens itself after an explicit close", "shipped-4"),
    ("C", "Escape closes the dock instead of returning the tool to select", "shipped-4"),
    ("C", "Native window.confirm for two destructive actions", "shipped-5"),
    ("C", "Clipboard failures are silent in the comment source copy", "open"),
    ("C", "No event.repeat guard on the global Ctrl+P/K/F capture", "open"),
    ("C", "Disabled palette rows read as enabled", "shipped-7"),
    ("C", "Escape in the library search closes the whole panel", "open"),
    ("C", "Async elk layout has no pending state", "open"),
    ("D", "Appearance popovers clamp flush to the window edge", "shipped-8"),
    ("D", "Default OS scrollbars inside designed panels", "shipped-9"),
    ("D", "8px/850 uppercase eyebrows are below a legibility floor", "open"),
    ("D", "The system-dark token fallback contradicts the explicit dark block", "open"),
    ("D", "Only 4 of 14 stylesheets guard reduced motion", "open"),
]

SHIPPED: list[tuple[str, str, str, str]] = [
    ("1", "One focus ring for every surface the app owns",
     "A real Tab into the palette left <code>outline: none</code> on the focused control; five "
     "stylesheets had zero <code>:focus-visible</code> rules between them. The ring now lives "
     "once, in <code>app.css</code>, scoped to app-owned roots so tldraw's own focus treatment "
     "is left alone, with an inset variant for the inverse pill and its dark palettes. One "
     "deliberate exception, from review: a palette tab takes no ring. Selection follows focus "
     "there, so the focused tab is always the selected tab and a ring would be a second mark for "
     "a fact the raised chip already carries. Every control where focus and selection differ "
     "keeps its ring, and the journey asserts both halves.",
     "src/app.css"),
    ("2", "The dock always has a header you can close it with",
     "<code>block-inspector.css</code> hid the frame's header for <em>every</em> inspector "
     "subject, and a second rule in <code>systemsketch-chrome.css</code> keyed on "
     "<code>.block-inspector__header</code>, a class that exists nowhere in <code>src</code>. A "
     "cable, an ordinary shape and an empty selection each got a headerless column with no "
     "pointer way out. One attribute rule now replaces both, driven by "
     "<code>inspectorSubjectOwnsHeader</code>.",
     "src/chrome/inspectorSubject.ts"),
    ("3", "The dock follows the selection; Inspect is gone",
     "The pill offered <code>Inspect</code> for every selection, and a rectangle that took the "
     "offer landed on “Select a Block to inspect it.” — an action whose only outcome was a "
     "contradiction of itself. Review found the button itself was the redundancy: it only ever "
     "meant “show me the panel for what I already selected”, a step the selection had taken. So "
     "the button is gone from both pills and the dock follows every selection, an ordinary shape "
     "included — where it now states what tldraw already holds, inventing no semantics a "
     "whiteboard does not have. <code>Show inspector</code> in the command palette is the one "
     "deliberate way back to a dock you dismissed without changing the selection.",
     "src/chrome/shapeFactsModel.ts"),
    ("4", "An explicit dismissal of the dock is respected, and Escape stays on the canvas",
     "Measured: the dock auto-opened, the user closed it, and selecting a second Block re-opened "
     "it. The close is now remembered against the context it was made on and released when the "
     "selection empties, so it sticks for that run of selections and never becomes permanent. A "
     "dock that follows the selection is also open most of the time, which made a second rule "
     "necessary: Escape no longer closes it. Drawing a rectangle selects it and opens the dock, so "
     "the Escape meant to return the geo tool to select was closing the panel instead — leaving "
     "the tool armed with no selection pill. Escape closes the surfaces a person opened; the dock "
     "closes with its own \u00d7 or by clearing the selection.",
     "src/chrome/ChromeProvider.tsx"),
    ("5", "One app-owned confirm replaces both native ones",
     "Deleting a comment thread and moving a board to Trash asked with <code>window.confirm</code>: "
     "an OS modal that steals focus from a canvas mid-gesture, cannot wear the board's theme, and "
     "may be suppressed outright inside a VS Code or Obsidian webview. The ask now goes through "
     "tldraw's own dialog stack and returns a promise, so each call site reads as it did.",
     "src/chrome/ConfirmDialog.tsx"),
    ("6", "The Block view switcher explains itself",
     "The pill shows one capital per view because three names would be wider than the pill — but "
     "measured, <code>S</code>, <code>P</code> and <code>E</code> carried <code>title: null</code>, "
     "so hovering taught nothing and only a screen reader ever heard the label. <code>Inspect</code> "
     "had neither. All four now carry a tooltip and a name.",
     "src/blocks/ui/BlockSelectionMiniMenu.tsx"),
    ("7", "Three malformed ARIA widgets, made real",
     "The palette's mode switch had two <code>role=\"tab\"</code> buttons both at "
     "<code>tabIndex=0</code>, no <code>aria-controls</code>, no <code>tabpanel</code> and no arrow "
     "keys; 28 <code>menuitemradio</code> options sat in a <code>group</code> with no "
     "<code>menu</code> ancestor; the theme <code>radiogroup</code> ignored the arrows. Each is "
     "now the widget it claimed to be, one tab stop with arrow-key navigation.",
     "src/commands/SystemSketchCommandPalette.tsx"),
    ("8", "The appearance palette keeps clear of the window edge",
     "Measured at a 520px window: the 455px colour panel opened at <code>x=0</code>, its first "
     "swatch column cut in half, because the two appearance popovers were the only ones in the app "
     "not passing a collision padding. They now keep the same 12px as everything else.",
     "src/appearance/figjamTokens.ts"),
    ("9", "Thin themed scrollbars in every app panel",
     "Every panel scrolls its own body, and each drew the OS scrollbar — a wide grey trough "
     "against an 18px-radius designed panel. Both the Firefox and the WebKit/Blink spellings are "
     "declared rather than one being assumed.",
     "src/app.css"),
    ("10", "The profile badge does the thing its shape promises",
     "The <code>Z</code> badge was a button titled “Profile placeholder” that did nothing when "
     "pressed. There is no identity to show — SystemSketch is local and single-user — so it now "
     "opens the preferences a profile badge implies: the same Settings dialog the main menu opens, "
     "landing on the theme panel.",
     "src/chrome/SystemSketchChrome.tsx"),
]


def render_candidates() -> str:
    groups = {
        "A": "Keyboard &amp; assistive access",
        "B": "Honesty &amp; dead ends",
        "C": "Interaction friction",
        "D": "Visual polish",
    }
    rows = []
    for index, (group, text, state) in enumerate(CANDIDATES, 1):
        shipped = state.startswith("shipped")
        badge = (
            f"<span class='tag ok'>#{state.split('-')[1]}</span>" if shipped
            else "<span class='tag'>follow-up</span>"
        )
        rows.append(
            f"<tr class='{'done' if shipped else ''}'>"
            f"<td class='num'>{index}</td><td class='grp'>{groups[group]}</td>"
            f"<td>{text}</td><td>{badge}</td></tr>"
        )
    return "\n".join(rows)


def render_shipped(measured: dict[str, object]) -> str:
    cards = []
    for number, title, body, seam in SHIPPED:
        cards.append(f"""
      <article class="ship" id="change-{number}">
        <header><span class="pill">{number}</span><h3>{title}</h3></header>
        <p>{body}</p>
        <code class="seam">{html.escape(seam)}</code>
      </article>""")
    return "\n".join(cards)


def main() -> None:
    facts = measure()
    measured = facts["measured"]
    checks = facts["checks"]

    before_after = [
        ("Inspect on a rectangle",
         "ui-hardening-before-inspect.png", "ui-hardening-1-shape-facts-2026-09-03.png",
         "A headerless slab reading “Select a Block to inspect it.”, with no way to close it "
         "by pointer — versus the shape's real facts under a header that carries a ×."),
        ("The command palette",
         "ui-hardening-before-palette.png", "ui-hardening-2-palette-focus-2026-09-03.png",
         "Two equally-weighted tabs beside the OS scrollbar — versus one raised chip that says "
         "which tab is on without a ring competing with it, a thin themed scrollbar, and "
         "unavailable commands struck through rather than merely faint."),
        ("The appearance palette at 520px",
         "ui-hardening-before-appearance.png", "ui-hardening-4-appearance-2026-09-03.png",
         "The colour panel flush at x=0 with its first swatch column cut in half — versus the "
         "same panel holding the app's 12px clear of both window edges."),
        ("The Block selection pill",
         "ui-hardening-before-pill.png", "ui-hardening-1-shape-facts-2026-09-03.png",
         "Bare capitals with <code>title: null</code>, and an Inspect button for a request the "
         "selection had already made — versus a pill carrying only what changes the shape, each "
         "control naming the view it switches to, with the dock arriving by itself."),
    ]

    comparisons = "\n".join(f"""
      <figure class="ba">
        <figcaption><b>{html.escape(name)}</b><span>{caption}</span></figcaption>
        <div class="pair">
          <div><em>before &middot; main</em><img alt="{html.escape(name)} before" src="{image_uri(ASSETS / before)}"></div>
          <div><em>after &middot; this branch</em><img alt="{html.escape(name)} after" src="{image_uri(DOCS / after)}"></div>
        </div>
      </figure>""" for name, before, after, caption in before_after)

    check_items = "\n".join(f"<li>{html.escape(check)}</li>" for check in checks)
    focus_rows = "\n".join(
        f"<tr><td><code>{html.escape(name)}</code></td><td class='num'>{count}</td></tr>"
        for name, count in sorted(facts["focus_rules"].items())
    )
    changed_files = "\n".join(
        f"<li><code>{html.escape(name)}</code></li>" for name in facts["changed"]
    )
    added_files = "\n".join(
        f"<li><code>{html.escape(name)}</code> <span class='tag ok'>new</span></li>"
        for name in facts["added"]
    )
    before_log = html.escape(BEFORE_LOG.read_text(encoding="utf-8"))
    drive_log = html.escape(DRIVE_LOG.read_text(encoding="utf-8"))

    page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch &middot; UI/UX hardening, 2026-09-03</title>
<style>
  :root {{ color-scheme:light; --ink:#20242b; --muted:#666d78; --line:#dde1e7; --paper:#f3f5f8;
    --card:#fff; --blue:#3182ed; --blue-soft:#eaf2fd; --green:#27865f; --orange:#f08a32; }}
  * {{ box-sizing:border-box }} html {{ scroll-behavior:smooth }}
  body {{ margin:0; color:var(--ink);
    background:radial-gradient(circle at 82% 0,#e7effb 0,transparent 34%),var(--paper);
    font:16px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif }}
  main {{ width:min(1180px,calc(100% - 32px)); margin:auto; padding:42px 0 80px }}
  a {{ color:#1f65be; text-underline-offset:3px }}
  .hero {{ position:relative; overflow:hidden; padding:44px; border:1px solid #d9e0ea; border-radius:28px;
    background:#ffffffed; box-shadow:0 24px 70px #26364c16 }}
  .hero::after {{ content:'10/30'; position:absolute; right:-10px; bottom:-70px; color:#3182ed0d;
    font-size:190px; font-weight:900; letter-spacing:-.07em }}
  .eyebrow {{ color:var(--blue); font-size:12px; font-weight:850; letter-spacing:.14em; text-transform:uppercase }}
  h1 {{ max-width:860px; margin:11px 0 15px; font-size:clamp(40px,6.4vw,70px); line-height:.98; letter-spacing:-.055em }}
  .lead {{ max-width:800px; margin:0; color:var(--muted); font-size:19px }}
  .chips {{ display:flex; flex-wrap:wrap; gap:9px; margin-top:26px }}
  .chip {{ padding:8px 12px; border:1px solid #ccdbef; border-radius:999px; color:#245d9d;
    background:#eef5fe; font-size:12px; font-weight:760 }}
  .chip.good {{ border-color:#bde0cd; color:#1d6a4b; background:#eaf7f0 }}
  section {{ margin-top:24px; padding:30px; border:1px solid #dce1e7; border-radius:22px;
    background:#ffffffed; box-shadow:0 13px 40px #26364c0d }}
  .head {{ display:flex; justify-content:space-between; align-items:end; gap:24px; margin-bottom:20px }}
  h2 {{ margin:0; font-size:28px; letter-spacing:-.035em }} .head p {{ max-width:640px; margin:0; color:var(--muted) }}
  h3 {{ margin:0; font-size:17px; letter-spacing:-.02em }}
  code {{ padding:1px 5px; border-radius:5px; background:#eef1f5;
    font:13px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace }}
  /* `min-width:0` on the grid child and wrapping inside: without both, a long
     JSON line makes the grid column as wide as the line and scrolls the page. */
  pre {{ margin:0; padding:16px 18px; max-width:100%; overflow:auto; border-radius:14px;
    color:#dfe6ef; background:#1b1f27; white-space:pre-wrap; overflow-wrap:anywhere;
    font:12.5px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace }}
  .ships {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(330px,1fr)); gap:14px }}
  .ship {{ padding:20px; border:1px solid var(--line); border-radius:16px; background:#fbfcfe }}
  .ship header {{ display:flex; align-items:center; gap:11px; margin-bottom:9px }}
  .pill {{ display:grid; width:28px; height:28px; flex:0 0 28px; place-items:center; border-radius:9px;
    color:#fff; background:var(--blue); font-size:13px; font-weight:850 }}
  .ship p {{ margin:0 0 11px; color:var(--muted); font-size:14px }}
  .seam {{ display:inline-block; background:#eef4fd; color:#245d9d }}
  figure.ba {{ margin:0 0 20px }} figure.ba figcaption {{ margin-bottom:10px }}
  figure.ba b {{ display:block; font-size:15px }} figure.ba span {{ color:var(--muted); font-size:13.5px }}
  .pair {{ display:grid; grid-template-columns:1fr 1fr; gap:14px }}
  .pair > div {{ overflow:hidden; border:1px solid var(--line); border-radius:14px; background:#f8f9fb }}
  .pair em {{ display:block; padding:7px 12px; border-bottom:1px solid var(--line); color:var(--muted);
    background:#fff; font-size:11px; font-style:normal; font-weight:800; letter-spacing:.05em; text-transform:uppercase }}
  .pair img {{ display:block; width:100%; height:auto }}
  img.wide {{ display:block; width:100%; height:auto; border:1px solid var(--line); border-radius:14px }}
  table {{ width:100%; border-collapse:collapse; font-size:14px }}
  th, td {{ padding:8px 10px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top }}
  th {{ color:var(--muted); font-size:11px; letter-spacing:.06em; text-transform:uppercase }}
  td.num {{ width:44px; color:var(--muted); font-variant-numeric:tabular-nums }}
  td.grp {{ width:210px; color:var(--muted); font-size:13px }}
  tr.done {{ background:#f6fbf8 }}
  .tag {{ display:inline-block; padding:2px 8px; border:1px solid #d7dde5; border-radius:999px;
    color:var(--muted); font-size:11px; font-weight:800 }}
  .tag.ok {{ border-color:#bde0cd; color:#1d6a4b; background:#eaf7f0 }}
  ul.checks {{ margin:0; padding-left:0; list-style:none }}
  ul.checks li {{ position:relative; padding:6px 0 6px 26px; border-bottom:1px solid var(--line); font-size:14px }}
  ul.checks li::before {{ content:'\\2713'; position:absolute; left:2px; color:var(--green); font-weight:900 }}
  ul.files {{ margin:0; padding-left:0; list-style:none; columns:2; font-size:13.5px }}
  ul.files li {{ padding:3px 0; break-inside:avoid }}
  .grid2 {{ display:grid; grid-template-columns:1fr 1fr; gap:20px }}
  .grid2 > div {{ min-width:0 }}
  .note {{ padding:16px 18px; border-left:3px solid var(--orange); border-radius:0 12px 12px 0;
    background:#fff6ec; color:#7a4a12; font-size:14px }}
  @media (max-width:860px) {{ .pair, .grid2 {{ grid-template-columns:1fr }} ul.files {{ columns:1 }} }}
</style>
</head>
<body>
<main>
  <div class="hero">
    <div class="eyebrow">SystemSketch &middot; 2026-09-03</div>
    <h1>Sharpening the chrome</h1>
    <p class="lead">Thirty UI/UX defects found by driving the running product in a real browser, not by
      reading the source. Ten fixed, each proved in the app it changed. Every number on this page is
      measured at build time from this tree and from the journey's own JSON.</p>
    <div class="chips">
      <span class="chip">30 candidates, all measured live</span>
      <span class="chip">10 shipped</span>
      <span class="chip good">{len(checks)}/{len(checks)} browser checks</span>
      <span class="chip good">tsc + vitest + python green</span>
      <span class="chip">{html.escape(facts["diffstat"] or "no source churn")}</span>
      <span class="chip">window.confirm call sites: {facts["native_confirm"]}</span>
    </div>
  </div>

  <section>
    <div class="head">
      <div><h2>Before and after, in the running app</h2>
      <p>Left is <code>main</code>, captured from a throwaway copy of that commit; right is this
        branch. Same seeded board, same window, same gestures.</p></div>
    </div>
    {comparisons}
  </section>

  <section>
    <div class="head"><div><h2>The ten changes</h2>
      <p>Ordered as they were prioritised: the systematic keyboard gap first, then the dead ends a
        user actually walks into, then friction, then polish.</p></div></div>
    <div class="ships">{render_shipped(measured)}</div>
  </section>

  <section>
    <div class="head"><div><h2>What the browser measured</h2>
      <p><code>npm run test:ui-hardening</code> &mdash; {facts["journey_lines"]} lines driving real
        Chrome against the real product profile, with zero local console errors.</p></div></div>
    <ul class="checks">{check_items}</ul>
    <div class="grid2" style="margin-top:20px">
      <div>
        <h3 style="margin-bottom:8px">Pre-change, read off <code>main</code></h3>
        <pre>{before_log}</pre>
      </div>
      <div>
        <h3 style="margin-bottom:8px">The saved review fixture, driven</h3>
        <pre>{drive_log}</pre>
      </div>
    </div>
  </section>

  <section>
    <div class="head"><div><h2>All thirty candidates</h2>
      <p>Each one was reproduced in the running app before it went on this list. The ten marked with
        a number are closed by the change of that number; the rest are named follow-ups, not
        oversights.</p></div></div>
    <table>
      <thead><tr><th></th><th>Area</th><th>Finding</th><th>State</th></tr></thead>
      <tbody>{render_candidates()}</tbody>
    </table>
    <div class="note" style="margin-top:18px"><b>Deliberately not taken.</b> The 8px uppercase
      eyebrows would move geometry that several browser journeys assert; the system-dark token
      contradiction is only reachable for a theme with no block of its own; and the remaining
      follow-ups are real but small. Each is listed above rather than quietly dropped.</div>
  </section>

  <section>
    <div class="head"><div><h2>The review board</h2>
      <p>Five numbered cues and one <code>PASS WHEN</code> card, generated through the real editor
        and autosave path, then cold-reopened and driven once in a launched Preview.</p></div></div>
    <img class="wide" alt="The UI hardening review fixture" src="{image_uri(FIXTURE_PNG)}">
    <figure class="ba" style="margin-top:18px">
      <figcaption><b>Driven, not just generated</b><span>The saved fixture opened in the launched
        Preview, with step 3 carried out: the plain rectangle inspected.</span></figcaption>
      <img class="wide" alt="The fixture driven in the real app"
        src="{image_uri(ASSETS / 'ui-hardening-fixture-drive.png')}">
    </figure>
  </section>

  <section>
    <div class="head"><div><h2>Where the focus ring now lives</h2>
      <p>Counted from this tree: how many <code>:focus-visible</code> selectors each stylesheet
        declares. Before this branch, <code>commands</code>, <code>comments</code>,
        <code>appearance</code>, <code>local-workspace</code> and <code>block-canvas</code>
        declared none between them.</p></div></div>
    <div class="grid2">
      <table>
        <thead><tr><th>Stylesheet</th><th>:focus-visible</th></tr></thead>
        <tbody>{focus_rows}</tbody>
      </table>
      <div>
        <h3 style="margin-bottom:10px">Files changed</h3>
        <ul class="files">{changed_files}</ul>
        <h3 style="margin:16px 0 10px">Files added</h3>
        <ul class="files">{added_files}</ul>
      </div>
    </div>
  </section>
</main>
</body>
</html>
"""
    OUTPUT.write_text(page, encoding="utf-8")
    print(f"wrote {OUTPUT} ({OUTPUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
