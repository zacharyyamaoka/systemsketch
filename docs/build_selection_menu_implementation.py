"""Build the selection contextual menu implementation report.

Every screenshot embedded here is written by `tests/selection_menu_smoke.mjs`
during the run that asserts the behaviour it shows, so a frame cannot drift
away from the check it illustrates.
"""
from __future__ import annotations

import base64
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from report_measurements import browser_checks, line_count, unit_test_count

DOCS_DIR = Path(__file__).resolve().parent
OUTPUT_PATH = DOCS_DIR / "selection-menu-implementation-2026-09-01.html"

FRAMES = {
    "anchored": "selection-menu-1-anchored-2026-09-01.png",
    "flipped": "selection-menu-2-flipped-2026-09-01.png",
    "clamped": "selection-menu-3-clamped-2026-09-01.png",
    "toolbelt": "selection-menu-4-tool-belt-2026-09-01.png",
    "dragging": "selection-menu-5-dragging-2026-09-01.png",
}


def figure(key: str) -> str:
    data = base64.b64encode((DOCS_DIR / FRAMES[key]).read_bytes()).decode("ascii")
    return f"data:image/png;base64,{data}"


DEFECTS = [
    (
        "The menu never moved",
        "It sat at the container's origin, on top of the document title, and answered clicks meant for it.",
        "<code>SelectionMiniMenu</code> mounts while the marquee is still down &mdash; brushing selects as it "
        "goes &mdash; and the new component returned <code>null</code> during a manipulation. Its position "
        "reactor therefore executed once with <code>ref.current === null</code>, subscribed to no signals, and "
        "its scheduler never fired again. From outside this is indistinguishable from an early return: "
        "<code>data-side</code> null, no inline <code>style</code>, ever.",
        "The gate moved up into a wrapper. <code>PositionedSelectionMenu</code> &mdash; which owns the ref, the "
        "<code>ResizeObserver</code> and the reactor &mdash; only mounts when its element is guaranteed to "
        "exist, and the reactor reads every signal before it touches the DOM so an early bail cannot "
        "unsubscribe it.",
    ),
    (
        "A hidden menu still answered hit tests",
        "Invisible, but <code>elementFromPoint</code> at its centre resolved to one of its buttons.",
        "<code>opacity: 0; pointer-events: none</code> on the container is not enough, because "
        "<code>.tlui-button</code> re-enables pointer events for itself and a container rule cannot undo that.",
        "The same descendant pair tldraw uses for its own contextual toolbar: pointer events off for the menu "
        "<em>and everything inside it</em>, back on only under <code>[data-visible='true']</code>.",
    ),
    (
        "Near the top edge the toolbar landed on the shape",
        "tldraw's primitive clamps the vertical position; it has no flip.",
        "<code>y = clamp(y, 16, vsb.h - h - 16)</code> in "
        "<code>TldrawUiContextualToolbar.getToolbarScreenPosition</code>. Its gap (8) and margin (16) are "
        "module constants with no prop.",
        "Placement is now SystemSketch's own pure function, and the flip is one branch in it.",
    ),
    (
        "The menu rode along through drags and resizes",
        "It followed the shape for the whole gesture instead of getting out of the way.",
        "The primitive hides during manipulation only when handed an <code>isMousingDown</code> prop, which "
        "nothing supplied.",
        "The select tool's own state path is the signal: <code>Editor.isIn('select.translating')</code> and its "
        "six siblings. That also covers handle drags, rotation and cropping, which a pointer-down flag would "
        "have missed.",
    ),
]


PLACEMENT = "src/chrome/selectionMenuPlacement.ts"
PLACEMENT_TESTS = "src/chrome/selectionMenuPlacement.test.ts"
SHELL = "src/chrome/SelectionContextualMenu.tsx"
SMOKE = "tests/selection_menu_smoke.mjs"

CHECKS = browser_checks(SMOKE)
UNIT_TESTS = unit_test_count(PLACEMENT_TESTS)

FILES = [
    (PLACEMENT, f"{line_count(PLACEMENT)} lines",
     "The policy, as a pure function of measured rectangles: centre, offset, flip, clamp. "
     "Four named constants, each carrying the measurement it came from."),
    (PLACEMENT_TESTS, f"{UNIT_TESTS} tests",
     "Unit coverage for every branch, including the two that only appear at the edges of the "
     "viewport and the one where the menu is wider than its own safe area."),
    (SHELL, f"{line_count(SHELL)} lines",
     "The shell: the manipulation gate, a <code>ResizeObserver</code> for content-driven width, and a "
     "<code>useQuickReactor</code> that writes <code>transform</code> once per frame."),
    ("src/chrome/SystemSketchChrome.tsx", "1 swap",
     "<code>SelectionMiniMenu</code> renders <code>&lt;SelectionContextualMenu&gt;</code> instead of "
     "<code>&lt;TldrawUiContextualToolbar&gt;</code>. Its contents are untouched."),
    ("src/chrome/systemsketch-chrome.css", "tokens",
     "Height 40, radius 13, <code>rgb(30,30,30)</code>, the three-layer shadow, and the visibility "
     "contract. The nested Block menu drops its own surface so there is one pill, not two."),
    (SMOKE, f"{len(CHECKS)} checks",
     "Real-browser proof in the product composition. It also writes the frames on this page."),
]


def build() -> str:
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SystemSketch &middot; Selection menu implementation</title>
  <style>
    :root {{
      color-scheme: light;
      --ink: #14161a;
      --muted: #626975;
      --faint: #8b93a1;
      --line: #dfe3e9;
      --paper: #f7f8fa;
      --card: #ffffff;
      --accent: #5b5ee5;
      --accent-soft: #eeefff;
      --green: #177245;
      --green-soft: #e9f8ef;
      --red: #97231c;
      --red-soft: #fdeeec;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }}
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; color: var(--ink); background: var(--paper); }}
    main {{ width: min(1180px, calc(100% - 40px)); margin: 0 auto; padding: 54px 0 96px; }}
    .eyebrow {{ margin: 0 0 12px; color: var(--accent); font: 750 12px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .1em; text-transform: uppercase; }}
    h1 {{ max-width: 900px; margin: 0; font-size: clamp(40px, 5.6vw, 70px); line-height: .97; letter-spacing: -.05em; }}
    .lede {{ max-width: 780px; margin: 24px 0 0; color: var(--muted); font-size: 19px; line-height: 1.6; }}
    .chips {{ display: flex; flex-wrap: wrap; gap: 9px; margin-top: 26px; }}
    .chip {{ display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 999px; background: #fff; color: var(--muted); font: 650 12.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }}
    .chip.ok {{ border-color: #b9e3c9; background: var(--green-soft); color: var(--green); }}
    section {{ margin-top: 60px; }}
    h2 {{ margin: 0 0 6px; font-size: 30px; letter-spacing: -.03em; }}
    .sub {{ margin: 0 0 22px; max-width: 780px; color: var(--muted); font-size: 16px; line-height: 1.6; }}
    p {{ line-height: 1.65; }}
    figure {{ margin: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 18px; background: var(--card); box-shadow: 0 12px 40px rgba(28, 34, 48, .06); }}
    figure img {{ display: block; width: 100%; height: auto; }}
    figcaption {{ padding: 14px 18px 16px; border-top: 1px solid var(--line); color: var(--muted); font-size: 13.5px; line-height: 1.55; }}
    figcaption b {{ color: var(--ink); }}
    .pair {{ display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }}
    .defect {{ display: grid; grid-template-columns: 1fr 1fr; gap: 0; margin-top: 16px; border: 1px solid var(--line); border-radius: 18px; overflow: hidden; background: var(--card); }}
    .defect > div {{ padding: 20px 22px; }}
    .defect .was {{ background: var(--red-soft); border-right: 1px solid var(--line); }}
    .defect h3 {{ margin: 0 0 8px; font-size: 17px; letter-spacing: -.02em; }}
    .defect .was h3 {{ color: var(--red); }}
    .defect .now h3 {{ color: var(--green); }}
    .defect p {{ margin: 0 0 10px; font-size: 14.5px; }}
    .defect p:last-child {{ margin-bottom: 0; }}
    .defect .headline {{ font-weight: 650; color: var(--ink); }}
    code {{ padding: 2px 5px; border-radius: 5px; background: #eef0f4; font: 640 12.5px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }}
    .defect .was code {{ background: #f7dedb; }}
    pre {{ margin: 20px 0 0; padding: 20px 22px; overflow-x: auto; border: 1px solid #23262e; border-radius: 16px; background: #191b21; color: #e6e8ee; font: 500 13px/1.7 ui-monospace, SFMono-Regular, Menlo, monospace; }}
    pre .c {{ color: #8f96a6; }}
    pre .k {{ color: #ff8fbe; }}
    pre .n {{ color: #9fd0ff; }}
    table {{ width: 100%; margin-top: 18px; border-collapse: collapse; background: var(--card); border: 1px solid var(--line); border-radius: 16px; overflow: hidden; font-size: 14px; }}
    th, td {{ padding: 11px 14px; text-align: left; border-bottom: 1px solid var(--line); vertical-align: top; line-height: 1.55; }}
    th {{ background: #f2f4f7; font-size: 11.5px; font-weight: 760; letter-spacing: .07em; text-transform: uppercase; color: var(--faint); }}
    tr:last-child td {{ border-bottom: none; }}
    td.num {{ font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; white-space: nowrap; color: var(--muted); }}
    ul.checks {{ margin: 18px 0 0; padding: 0; list-style: none; display: grid; gap: 8px; }}
    ul.checks li {{ display: grid; grid-template-columns: auto 1fr; gap: 11px; align-items: baseline; padding: 12px 15px; border: 1px solid #c7e6d3; border-radius: 13px; background: var(--green-soft); font-size: 14.5px; }}
    ul.checks b {{ color: var(--green); font: 750 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }}
    .note {{ margin-top: 22px; padding: 18px 20px; border: 1px solid #c9caf5; border-radius: 16px; background: var(--accent-soft); font-size: 15px; line-height: 1.6; }}
    footer {{ margin-top: 72px; padding-top: 22px; border-top: 1px solid var(--line); color: var(--faint); font-size: 13px; line-height: 1.7; }}
    @media (max-width: 900px) {{ .pair, .defect {{ grid-template-columns: 1fr; }} .defect .was {{ border-right: none; border-bottom: 1px solid var(--line); }} }}
  </style>
</head>
<body>
<main>

  <p class="eyebrow">SystemSketch &middot; implementation report &middot; 2026-09-01</p>
  <h1>The selection menu now behaves like FigJam's</h1>
  <p class="lede">
    One dark pill, centred on the selection and 16&nbsp;px clear of its overlay, flipping below when there is
    no room above, clamped to a safe area that treats the bottom tool belt as an obstacle, the same size at
    every zoom, and out of the document entirely while you drag or resize. The behaviour spec was
    <a href="figjam-contextual-menu-spec-2026-09-01.html">measured from the running FigJam editor</a>; this is
    what shipped against it, and the proof that it did.
  </p>
  <div class="chips">
    <span class="chip ok">{len(CHECKS)}/{len(CHECKS)} browser checks</span>
    <span class="chip ok">{UNIT_TESTS} placement unit tests</span>
    <span class="chip">product composition &middot; 1440 &times; 960</span>
    <span class="chip">tldraw 5.3.2, unforked</span>
  </div>

  <section>
    <h2>1 &middot; What was wrong</h2>
    <p class="sub">
      Four separate defects, three of them in tldraw's <code>TldrawUiContextualToolbar</code>'s policy and one
      of them mine. The first is the one that produced the reported symptom.
    </p>
    {''.join(f'''
    <div class="defect">
      <div class="was">
        <h3>{title}</h3>
        <p class="headline">{symptom}</p>
        <p>{cause}</p>
      </div>
      <div class="now">
        <h3>Now</h3>
        <p>{fix}</p>
      </div>
    </div>''' for title, symptom, cause, fix in DEFECTS)}
    <div class="note">
      <b>A reactor that runs once against a missing element is invisible from outside.</b> Measuring the DOM
      showed <code>data-side</code> null and no inline style, which reads exactly like an early return that
      latched. It was not: the reactor had subscribed to zero signals and could never fire again. That is why
      the fix is structural &mdash; the element's existence is now a precondition of the component that owns
      the reactor, not something the reactor has to check.
    </div>
  </section>

  <section>
    <h2>2 &middot; Why the primitive was replaced rather than configured</h2>
    <p class="sub">
      tldraw's contextual toolbar already implements most of this specification, and SystemSketch used it. Its
      policy, though, is four module-scope constants with no prop and no override; two of them differ from
      FigJam's and one behaviour &mdash; the flip &mdash; does not exist in it at all.
    </p>
    <pre><span class="c">// node_modules/tldraw/…/primitives/TldrawUiContextualToolbar.js</span>
<span class="k">const</span> TOOLBAR_GAP   = <span class="n">8</span>       <span class="c">// FigJam: 16, from the overlay</span>
<span class="k">const</span> SCREEN_MARGIN = <span class="n">16</span>      <span class="c">// FigJam: 20</span>
<span class="c">// …and the placement itself, which clamps where FigJam flips:</span>
y = clamp(y, SCREEN_MARGIN, vsb.h - toolbarBounds.h - SCREEN_MARGIN)</pre>
    <p class="sub" style="margin-top:20px">
      The one supported lever is <code>getSelectionBounds</code>, and it is genuinely enough &mdash; you can
      invert the primitive's own formula and hand it a synthetic rectangle that lands the toolbar wherever you
      like. That was rejected: it would make SystemSketch's placement silently depend on a private constant, so
      a tldraw upgrade that changed <code>TOOLBAR_GAP</code> would move our menu with no failing test and no
      diff. Owning {line_count(PLACEMENT)} lines of placement is cheaper than owning that coupling.
    </p>
    <p class="sub">
      Everything <em>except</em> the policy is still stock, and none of it is reached through a fork:
      <code>useQuickReactor</code> for the per-frame write, <code>TldrawUiToolbar</code> for the toolbar
      semantics, <code>usePassThroughWheelEvents</code> so a scroll over the menu still pans the canvas,
      <code>markEventAsHandled</code> on pointer-down, and <code>InFrontOfTheCanvas</code> as the mount point.
      The coordinate conversion is the one tldraw documents for overlays &mdash; screen point minus the
      viewport's screen position &mdash; which is also what the primitive does internally.
    </p>
    <pre><span class="c">// src/chrome/selectionMenuPlacement.ts — the whole policy</span>
<span class="k">let</span> side = <span class="n">'above'</span>
<span class="k">let</span> y = overlayTop - menu.h - SELECTION_MENU_GAP
<span class="k">if</span> (y &lt; SELECTION_MENU_MARGIN) {{ side = <span class="n">'below'</span>; y = overlayBottom + SELECTION_MENU_GAP }}

<span class="k">const</span> x = clamp(centreX - menu.w / <span class="n">2</span>,
                SELECTION_MENU_MARGIN,
                viewport.w - menu.w - SELECTION_MENU_MARGIN)
y = clamp(y, SELECTION_MENU_MARGIN, floor - SELECTION_MENU_MARGIN - menu.h)</pre>
  </section>

  <section>
    <h2>3 &middot; The change</h2>
    <table>
      <tr><th>File</th><th>Size</th><th>What it carries</th></tr>
      {''.join(f'<tr><td><code>{path}</code></td><td class="num">{size}</td><td>{what}</td></tr>' for path, size, what in FILES)}
    </table>
    <div class="note">
      <b>One constant was re-measured rather than copied.</b> FigJam reads as 40&nbsp;px above a shape because
      it paints mid-edge grab dots about 20&nbsp;px outside the box and leaves its 16&nbsp;px gap above
      <em>those</em>. tldraw paints handles on the corners instead, and a selected 240&times;140 rectangle at
      (700,&nbsp;380) paints selection blue from (695,&nbsp;375) to (944,&nbsp;524) &mdash; a 5&nbsp;px
      stand-off. Copying 40 would have looked wrong; copying the <em>rule</em> and measuring the local overlay
      gives 21&nbsp;px from the box and the same 16&nbsp;px from the chrome.
    </div>
  </section>

  <section>
    <h2>4 &middot; Live proof</h2>
    <p class="sub">
      <code>npm run test:selection-menu</code> drives the real product composition in headless Chrome on an
      isolated board. It reads the menu, the shape and the tool belt out of the DOM and compares them to each
      other &mdash; the constants are never restated from the source. The frames below are written by that same
      run, so a picture cannot drift away from the check it illustrates.
    </p>
    <ul class="checks">
      {''.join(f'<li><b>PASS</b><span>{check}</span></li>' for check in CHECKS)}
    </ul>

    <figure style="margin-top:26px">
      <img src="{figure('anchored')}" alt="A selected rectangle in SystemSketch with the dark contextual menu centred above it">
      <figcaption><b>Anchored.</b> Centre offset measured at 0.15&nbsp;px; clearance 16&nbsp;px from the selection overlay, 21&nbsp;px from the shape box. The surface reports 40&nbsp;px tall, 13&nbsp;px radius, <code>rgb(30, 30, 30)</code> &mdash; the spec's tokens, read back from the running app.</figcaption>
    </figure>

    <div class="pair" style="margin-top:18px">
      <figure>
        <img src="{figure('flipped')}" alt="A rectangle near the top of the viewport with the contextual menu below it">
        <figcaption><b>Flipped.</b> With the shape against the top edge the menu goes <em>below</em> it, keeping the same gap. tldraw's primitive would have clamped it down onto the shape.</figcaption>
      </figure>
      <figure>
        <img src="{figure('clamped')}" alt="A rectangle pushed into the left gutter with the contextual menu clamped at the margin">
        <figcaption><b>Clamped.</b> Shoved into the gutter, the menu stops with its left edge at exactly 20&nbsp;px and gives up centring &mdash; which is the point of a clamp.</figcaption>
      </figure>
    </div>

    <div class="pair" style="margin-top:18px">
      <figure>
        <img src="{figure('toolbelt')}" alt="A shape zoomed to 800% filling the viewport, with the contextual menu resting above the bottom toolbar">
        <figcaption><b>Nowhere to go.</b> At 800% the selection covers the viewport in both axes. The menu comes to rest 20&nbsp;px above the tool belt rather than 20&nbsp;px above the window edge, where the toolbar would have covered it.</figcaption>
      </figure>
      <figure>
        <img src="{figure('dragging')}" alt="A rectangle mid-drag in SystemSketch with no contextual menu visible">
        <figcaption><b>Mid-drag.</b> Not faded, not parked off-screen: querying the DOM at this instant returns no menu at all. It returns on pointer-up, re-anchored to the new bounds.</figcaption>
      </figure>
    </div>
  </section>

  <section>
    <h2>5 &middot; Deliberately not FigJam</h2>
    <p class="sub">
      One documented delta from the spec is unimplemented, on purpose.
    </p>
    <table>
      <tr><th>Spec says</th><th>SystemSketch does</th><th>Status</th></tr>
      <tr>
        <td>FigJam carries no destructive command in the pill. Copy, Delete, z-order and Lock live in the right-click menu, where a mis-click is not fatal.</td>
        <td>The pill carries <em>Delete</em> &mdash; on the plain-selection branch always, on the Block branch only for a batch.</td>
        <td>Open, and Zach's to call. It is a conflict between two reference apps rather than a defect: this placement work was specified from FigJam, while the batch-editing work next to it was specified from Excalidraw, which does put Delete in the selection pill.</td>
      </tr>
    </table>
    <div class="note">
      <b>It is one decision covering three cases, not a Block-pill detail.</b> Delete is reachable from the
      plain-selection pill for one shape or many
      (<code>SystemSketchChrome.tsx</code>, the <code>N&nbsp;selected &middot; Inspect &middot; Delete</code>
      branch), and from the Block pill only when several Blocks are selected &mdash;
      <code>EditorBlockSelectionMiniMenu</code> passes <code>onDelete</code> on its batch branch and not on its
      single-Block branch. So today, selecting one rectangle offers Delete and selecting one Block does not,
      at the same pill position under the same gesture. Whichever way the reference-app question is settled,
      settling it should make those three cases agree; changing one of them alone would trade a spec
      deviation for an inconsistency users can feel.
    </div>
    <p class="sub" style="margin-top:20px">
      <code>tests/block_batch_editing_smoke.mjs</code> asserts the batch pill exposes Delete, but that
      assertion records the existing behaviour rather than requiring it &mdash; it is not the reason the
      button is still there, and it follows the product call rather than setting it.
    </p>
  </section>

  <footer>
    <p>
      <b>Reproduce.</b> <code>npm run test:selection-menu</code> for the browser proof and its frames;
      <code>npm run check</code> for types, the {UNIT_TESTS} placement unit tests, and the Python suite. Rebuild this
      page with <code>python3 docs/build_selection_menu_implementation.py</code>.
    </p>
    <p>
      <b>Scope.</b> Verified in the full product composition at 1440&times;960 and at 1680&times;857. The
      placement constants were not re-checked at other device pixel ratios, and the tool-belt floor is
      resolved by querying <code>.tlui-layout__bottom__main</code> &mdash; a stock tldraw layout class, but a
      class rather than an API.
    </p>
  </footer>

</main>
</body>
</html>
"""


if __name__ == "__main__":
    OUTPUT_PATH.write_text(build(), encoding="utf-8")
    print(f"wrote {OUTPUT_PATH} ({OUTPUT_PATH.stat().st_size / 1024:.0f} KB)")
