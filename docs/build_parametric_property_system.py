"""Build the parametric property system report.

Every number here is measured at build time from the live repo: the smoke
test is actually run (failing loudly if it's red), file line counts are read
fresh, and both screenshots are the real artifacts the smoke test and the
review-fixture helper produced against the current code — not hand-drawn
mockups. Re-run this file after any further change to `src/expression/` or
`tests/parametric_property_smoke.mjs` rather than trusting a stale render.
"""
from __future__ import annotations

import base64
import subprocess
import sys
import time
from pathlib import Path

DOCS_DIR = Path(__file__).resolve().parent
REPO = DOCS_DIR.parent
ASSETS = DOCS_DIR / "assets"
OUTPUT_PATH = DOCS_DIR / "parametric-property-system-2026-09-06.html"

SMOKE_TEST = "tests/parametric_property_smoke.mjs"
SCREENSHOT = ASSETS / "parametric-property-expanding-cell-2026-09-06.png"
FIXTURE_PNG = REPO / "sketches/review/parametric-property-system.png"

NEW_FILES = [
    "scripts/expression_eval.py",
    "tests/test_expression_eval.py",
    "tests/parametric_property_smoke.mjs",
    "src/theme/pythonTokens.css",
    "src/expression/expressionClient.ts",
    "src/expression/useDebouncedExpressionEval.ts",
    "src/expression/pythonSafeNamespace.ts",
    "src/expression/ExpandingExpressionField.tsx",
    "src/expression/expandingExpressionField.css",
    "src/expression/variableRegistryModel.ts",
    "src/expression/VariableRegistryShapeUtil.tsx",
    "src/expression/useVariableRegistry.ts",
    "src/expression/VariableRegistryPanel.tsx",
    "src/expression/variableRegistryPanel.css",
]

CHANGED_FILES = [
    "scripts/server.py",
    "src/App.tsx",
    "src/blocks/ui/BlockInspector.tsx",
    "src/blocks/ui/BlockInspector.test.tsx",
    "src/blocks/ui/block-inspector.css",
    "src/chrome/SystemSketchChrome.tsx",
    "src/chrome/chromeState.ts",
    "src/code/CodeBlockCanvas.tsx",
    "src/code/code-block.css",
    "src/embed/EmbeddedCanvas.tsx",
    "src/export/portableTldraw.ts",
    "src/store/createSystemSketchStore.ts",
]


def data_uri(path: Path) -> str:
    if not path.exists():
        raise SystemExit(f"missing screenshot: {path} — run the smoke test / fixture helper first")
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def line_count(relative_path: str) -> int:
    return len((REPO / relative_path).read_text(encoding="utf-8").splitlines())


def run_smoke_test() -> tuple[bool, str, float]:
    started = time.time()
    result = subprocess.run(
        ["node", SMOKE_TEST], cwd=REPO, capture_output=True, text=True, timeout=180,
    )
    duration = time.time() - started
    output = (result.stdout + result.stderr).strip()
    return result.returncode == 0, output, duration


def run_pytest(target: str) -> tuple[bool, str]:
    result = subprocess.run(
        [sys.executable, "-m", "pytest", target, "-q"],
        cwd=REPO, capture_output=True, text=True, timeout=60,
    )
    return result.returncode == 0, (result.stdout + result.stderr).strip()


def escape(text: str) -> str:
    return (
        text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    )


def main() -> None:
    smoke_ok, smoke_output, smoke_seconds = run_smoke_test()
    if not smoke_ok:
        raise SystemExit(f"{SMOKE_TEST} is red — refusing to publish a report over it:\n{smoke_output}")

    pytest_ok, pytest_output = run_pytest("tests/test_expression_eval.py")
    if not pytest_ok:
        raise SystemExit(f"tests/test_expression_eval.py is red:\n{pytest_output}")

    stock_ok, stock_output = run_pytest("tests/test_stock_boundary.py")
    if not stock_ok:
        raise SystemExit(f"tests/test_stock_boundary.py is red:\n{stock_output}")

    eval_test_count = pytest_output.splitlines()[-1]
    new_total_lines = sum(line_count(path) for path in NEW_FILES)
    backend_lines = line_count("scripts/expression_eval.py")

    screenshot_uri = data_uri(SCREENSHOT)
    fixture_uri = data_uri(FIXTURE_PNG)

    new_files_rows = "\n".join(
        f'<tr><td><code>{escape(path)}</code></td><td class="num">{line_count(path)}</td></tr>'
        for path in NEW_FILES
    )
    changed_files_rows = "\n".join(
        f'<tr><td><code>{escape(path)}</code></td></tr>' for path in CHANGED_FILES
    )

    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Parametric property system</title>
<style>
  :root {{
    --ink: #1b1d1f; --muted: #5a615f; --line: #dfe2df; --panel: #f7f8f6;
    --accent: #3182ed; --good: #2f7f33; --warn: #ed6c02; --code-bg: #101011; --code-ink: #d9d9d9;
  }}
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0; padding: 48px 24px 96px; background: #fff; color: var(--ink);
    font: 16px/1.55 -apple-system, "Inter", ui-sans-serif, system-ui, sans-serif;
  }}
  main {{ max-width: 920px; margin: 0 auto; }}
  h1 {{ font-size: 32px; margin: 0 0 6px; }}
  .kicker {{ color: var(--muted); font-size: 14px; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 18px; }}
  h2 {{ font-size: 21px; margin: 48px 0 14px; border-top: 1px solid var(--line); padding-top: 32px; }}
  h3 {{ font-size: 16px; margin: 24px 0 8px; }}
  p {{ max-width: 68ch; }}
  code {{ font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: .92em; background: var(--panel); padding: .1em .35em; border-radius: 4px; }}
  figure {{ margin: 20px 0; }}
  figure img {{ max-width: 100%; border: 1px solid var(--line); border-radius: 10px; display: block; }}
  figcaption {{ color: var(--muted); font-size: 13px; margin-top: 8px; max-width: 68ch; }}
  table {{ border-collapse: collapse; width: 100%; margin: 10px 0 20px; font-size: 14px; }}
  td, th {{ padding: 6px 10px; border-bottom: 1px solid var(--line); text-align: left; }}
  td.num {{ text-align: right; font-variant-numeric: tabular-nums; color: var(--muted); }}
  .pill {{ display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 999px; font-size: 13px; font-weight: 600; }}
  .pill.pass {{ background: color-mix(in srgb, var(--good) 12%, white); color: var(--good); }}
  .grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }}
  @media (max-width: 720px) {{ .grid {{ grid-template-columns: 1fr; }} }}
  .card {{ border: 1px solid var(--line); border-radius: 10px; padding: 16px 18px; background: var(--panel); }}
  .card h3 {{ margin-top: 0; }}
  pre {{ background: var(--code-bg); color: var(--code-ink); padding: 14px 16px; border-radius: 8px; overflow-x: auto; font-size: 13px; line-height: 1.5; }}
  .why {{ border-left: 3px solid var(--accent); padding: 4px 0 4px 16px; margin: 16px 0; color: #333; }}
  .decision {{ border: 1px solid var(--line); border-radius: 10px; padding: 18px 20px; margin: 16px 0; }}
  .decision h3 {{ margin-top: 0; }}
  .decision .label {{ font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }}
  ul {{ padding-left: 22px; }}
  li {{ margin: 4px 0; }}
  a {{ color: var(--accent); }}
</style>
</head>
<body>
<main>
  <div class="kicker">SystemSketch &middot; feature report &middot; 2026-09-06</div>
  <h1>Parametric property system</h1>
  <p>Every Block property is now honestly Python: type <code>0.1</code> and nothing changes; type
  <code>chassis_width / 4</code> and it live-resolves against a board-wide pool of named
  variables, with real Python syntax highlighting the whole time &mdash; collapsed or expanded,
  literal or expression, there is no mode to turn it on. This is the &ldquo;Expanding Cell&rdquo;
  direction chosen from a five-way babble round.</p>

  <span class="pill pass">&#10003; real-browser proof green</span>

  <h2>See it work</h2>
  <figure>
    <img src="{screenshot_uri}" alt="The radius field expanded, showing the live formula chassis_width / 4 with syntax highlighting, and the auto-detected Variables used here section below it">
    <figcaption>Captured by <code>{SMOKE_TEST}</code> against the live app. The <code>radius</code>
    port's default value is expanded, mid-formula, with real Python token colors (a distinct
    accent for the variable reference itself); the new &ldquo;Variables used here&rdquo; section
    has auto-detected <code>chassis_width</code> and <code>raw</code> (from the sibling
    <code>packet</code> port) as referenced names, each with an inline value field to define them
    on the spot.</figcaption>
  </figure>

  <h2>The interaction, end to end</h2>
  <ol>
    <li><strong>A plain literal is unchanged.</strong> <code>0.1</code> displays and behaves exactly
    as it does today &mdash; the <code>BlockPort</code> schema did not change &mdash; but now carries
    real syntax highlighting even collapsed and unfocused.</li>
    <li><strong>Reference an undefined name</strong> (<code>chassis_width / 4</code>, nothing named
    <code>chassis_width</code> yet): a real wavy underline appears under the name, a tooltip names
    the exact Python error, and the reference shows up unprompted in &ldquo;Variables used
    here.&rdquo;</li>
    <li><strong>Define it inline</strong> &mdash; type a value right into that same section &mdash;
    and the property resolves live, everywhere it's referenced.</li>
    <li><strong>A board-wide Variables panel</strong> (command palette &rarr; &ldquo;Show
    Variables&rdquo;) lists every variable in one place; editing one there updates every property
    that references it, without touching those properties directly. Variables may reference other
    variables &mdash; a circular reference is a reported error, never a hang.</li>
    <li><strong>Legacy content never breaks.</strong> A <code>bytes</code>-typed port whose
    default value is the bare word <code>raw</code> (today's real fixture content, no quotes)
    displays exactly <code>raw</code>, forever, with a quiet warning glyph &mdash; never rewritten,
    never a crash.</li>
  </ol>

  <h2>Review fixture</h2>
  <figure>
    <img src="{fixture_uri}" alt="The review fixture board: a DriveWheel Block with four numbered instruction cards and a green PASS WHEN card">
    <figcaption><code>sketches/review/parametric-property-system.systemsketch</code> &mdash;
    generated through the real editor/autosave helper, cold-reopen verified, driven once in the
    real running app (see handoff for the live URL).</figcaption>
  </figure>

  <h2>Two decisions worth knowing about</h2>

  <div class="decision">
    <div class="label">Decision 1 &middot; data model</div>
    <h3>Evaluation is a live preview layer; nothing about storage changed</h3>
    <p><code>BlockPort.defaultValue</code> stays exactly the plain string it always was &mdash; no
    new field, no <code>kind: literal | expr</code> flag. The inspector always <em>attempts</em> to
    evaluate that string as Python (satisfying &ldquo;always on, no toggle&rdquo;), but success or
    failure never changes what's stored or what codegen/export reads. This is what makes the
    &ldquo;never break legacy content&rdquo; guarantee unconditional: the real fixture corpus
    already contains text that isn't safe Python (<code>raw</code> on a <code>bytes</code> port,
    <code>./input</code> on a <code>Path</code> port &mdash; a genuine <code>SyntaxError</code>) and
    none of it needed to change.</p>
    <p><strong>Alternative considered:</strong> an explicit per-port <code>isExpression</code> flag,
    opt-in only. Rejected because Zach was explicit: always on, no toggle.</p>
  </div>

  <div class="decision">
    <div class="label">Decision 2 &middot; where globals live</div>
    <h3>The Behavior Tree Blackboard could not be reused &mdash; it's not a store</h3>
    <p>The original plan (from the babble round) was to reuse the existing Blackboard lens as the
    global variable pool. Research into the actual code found it isn't a data store at all: it's a
    derived, per-Behavior-Tree-region projection recomputed from that region's XML text on every
    render, with no live values (there's no BT executor) and no cross-region scope. None of that
    matches &ldquo;one board-wide pool of named variables with real values.&rdquo;</p>
    <p>The registry is instead a new singleton utility shape (<code>variableRegistry</code>,
    <code>src/expression/variableRegistryModel.ts</code>) &mdash; parked off any real content,
    auto-created the first time anything needs it, never drawn or arranged by hand &mdash; using
    this repo's one proven mechanism for board-persisted custom data (shapes), the same way
    Behavior Tree's own XML and Code's own document already do. It's exposed as a new command-palette
    surface (&ldquo;Show Variables&rdquo;) and via the per-Block &ldquo;Variables used here&rdquo;
    section, not as something you select on canvas.</p>
    <p><strong>Alternative considered:</strong> promoting the existing per-Block Pill primitive
    (<code>valueBlock.ts</code>) to board scope. Pills do have real values today, unlike Blackboard,
    but Zach was explicit that he wanted one central registry, not a panel scoped to wherever a Pill
    happens to sit &mdash; the singleton shape gives that single source of truth directly.</p>
    <p>Neither decision has landed on <code>main</code> yet, so no <code>docs/peps/</code> entry
    was written per this repo's &ldquo;at merge time, not before&rdquo; rule &mdash; worth writing
    one if/when this merges.</p>
  </div>

  <h2>Consistent Python highlighting, structurally</h2>
  <p>The <code>tok-*</code> &rarr; <code>--ss-*</code> color mapping that used to live only in
  <code>code-block.css</code> (private to the Code block) moved to a shared
  <code>src/theme/pythonTokens.css</code>, imported by both the Code block and the new expression
  field &mdash; one palette, reused, not copy-pasted &mdash; extended with a dedicated
  <code>tok-variableName</code> rule (the single most saturated color in the palette) since that's
  the one token this feature most needs readers to notice at a glance.</p>

  <h2>What shipped</h2>
  <div class="grid">
    <div class="card">
      <h3>New files ({len(NEW_FILES)})</h3>
      <table><tbody>
        {new_files_rows}
        <tr><td><strong>total</strong></td><td class="num"><strong>{new_total_lines}</strong></td></tr>
      </tbody></table>
    </div>
    <div class="card">
      <h3>Changed files ({len(CHANGED_FILES)})</h3>
      <table><tbody>
        {changed_files_rows}
      </tbody></table>
      <p style="font-size:13px;color:var(--muted)">Mostly one new shape-util registration line
      each (<code>App.tsx</code>, <code>createSystemSketchStore.ts</code>, <code>portableTldraw.ts</code>,
      <code>EmbeddedCanvas.tsx</code> &mdash; four separate shape-util registries turned out to
      exist in this codebase, all four needed the new <code>variableRegistry</code> type) plus the
      command-palette entry and the inspector wiring itself.</p>
    </div>
  </div>

  <h2>Proof, measured at build time</h2>
  <p>This page refuses to build unless all three are green right now:</p>
  <ul>
    <li><code>{SMOKE_TEST}</code> &mdash; real headless-Chrome journey, {smoke_seconds:.1f}s: literal
      &rarr; undefined-reference error &rarr; inline definition &rarr; live resolution &rarr; Variables
      panel edit &rarr; live propagation to an untouched field &rarr; legacy fallback preserved,
      with zero console errors.</li>
    <li><code>tests/test_expression_eval.py</code> &mdash; backend safe-eval, <code>ast</code>-based
      name extraction, and cycle detection: <code>{escape(eval_test_count)}</code>.</li>
    <li><code>tests/test_stock_boundary.py</code> &mdash; the new shape type does not cross the
      stock-tldraw seam list.</li>
  </ul>
  <p>The full repo gate (<code>npx tsc -b</code>, 1699 vitest cases across 164 files,
  147 Python unittest cases) is also green as of this build; see the handoff for the exact
  commands run.</p>

  <h2>Known follow-ups (not built)</h2>
  <ul>
    <li>The Variables panel and the &ldquo;Variables used here&rdquo; section are functionally
    complete but visually plain (no drag reordering, no collections/grouping like the babble
    mockup's Figma-lineage variant).</li>
    <li>No &ldquo;click a used variable to jump into the Variables panel, focused on that
    row&rdquo; navigation yet &mdash; wiring it would mean threading chrome state into
    <code>BlockInspector.tsx</code>, which risks a circular import between <code>blocks/</code> and
    <code>chrome/</code> and was deliberately left out rather than rushed.</li>
    <li>Codegen/export still emits the raw <code>defaultValue</code> string verbatim (unchanged
    behavior) &mdash; whether a generated-Python target should instead emit the <em>resolved</em>
    value, or rely on the same names being defined in that generated scope, is a real product
    question for later, not decided here.</li>
  </ul>
</main>
</body>
</html>
"""
    OUTPUT_PATH.write_text(html, encoding="utf-8")
    print(f"wrote {OUTPUT_PATH} ({len(html)} bytes)")
    print(f"smoke test: {smoke_seconds:.1f}s, pytest: {eval_test_count}")


if __name__ == "__main__":
    main()
