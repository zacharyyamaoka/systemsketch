#!/usr/bin/env python3
"""Build the IDE-plugin and golden-workflow report.

Answers the request in `FR - Block, Ports & Edges Primitive` § "Update
vscode/cursor plugin and golden workflow": put the SystemSketch app in a
VS Code / Cursor editor pane so clicking a file in the tree opens the canvas,
drop the in-app file management, move the plugin into this repo, and reshape a
golden case into `source.py` + `target.systemsketch` + `generated.systemsketch`.

Every number below is measured at build time — from this tree, from the
packaged VSIX, and from the JSON each browser journey wrote when it ran. The
journeys' verdicts are refused outright if they predate either the journey or
the app source, so a rebuild cannot dress up a stale run as a fresh one.
"""

from __future__ import annotations

import base64
import html
import json
import subprocess
import zipfile
from datetime import date
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DOCS = PROJECT_ROOT / "docs"
ASSETS = DOCS / "assets"
EXTENSION = PROJECT_ROOT / "vscode-systemsketch"
PYBLOCKS = Path.home() / "pyblocks"
CORPUS = PYBLOCKS / "examples" / "systemsketch_goldens"
OUTPUT = DOCS / f"ide-plugin-and-goldens-{date.today().isoformat()}.html"


def esc(value: object) -> str:
    return html.escape(str(value))


def data_uri(path: Path) -> str:
    return f"data:image/png;base64,{base64.b64encode(path.read_bytes()).decode()}"


def crop(name: str, box: tuple[int, int, int, int]) -> str:
    """Crop a capture down to the part being talked about."""
    from PIL import Image

    source = ASSETS / name
    out = ASSETS / f"crop-{name}"
    Image.open(source).convert("RGB").crop(box).save(out, optimize=True)
    return data_uri(out)


def journey(prefix: str) -> dict:
    """One journey's own output, refused if the tree has moved since it ran."""
    results = ASSETS / f"{prefix}-plugin-journey.json"
    runner = EXTENSION / "tests" / "vscode_e2e.mjs"
    if not results.exists():
        raise SystemExit(f"{results.name} is missing — run the {prefix} journey first")
    measured = results.stat().st_mtime
    if measured < runner.stat().st_mtime:
        raise SystemExit(
            f"{results.name} predates {runner.name}: those verdicts came from an older"
            " journey. Re-run it."
        )
    newest = max(
        (path for path in (PROJECT_ROOT / "src").rglob("*")
         if path.is_file() and path.suffix in {".ts", ".tsx", ".css"}),
        key=lambda path: path.stat().st_mtime,
    )
    if measured < newest.stat().st_mtime:
        raise SystemExit(
            f"{results.name} predates src/{newest.relative_to(PROJECT_ROOT / 'src')}: those"
            " verdicts were measured against different source. Re-run the journey."
        )
    return json.loads(results.read_text(encoding="utf-8"))


def lines(path: Path) -> int:
    return len(path.read_text(encoding="utf-8").splitlines())


def vsix_facts() -> dict:
    """What is actually inside the packaged extension, read from the archive."""
    vsix = EXTENSION / "dist" / "systemsketch-vscode-0.1.0.vsix"
    if not vsix.exists():
        raise SystemExit("no VSIX packaged — run `npm run package:dev` in vscode-systemsketch")
    with zipfile.ZipFile(vsix) as archive:
        names = [item.filename for item in archive.infolist()]
        app = json.loads(archive.read("extension/dist/app/app.json"))
    return {
        "bytes": vsix.stat().st_size,
        "files": len(names),
        "extensionHostFiles": len([n for n in names if n.startswith("extension/dist/extension")]),
        "appFiles": len([n for n in names if n.startswith("extension/dist/app/")]),
        "app": app,
    }


def unit_tests(target: str) -> int:
    result = subprocess.run(
        ["npx", "vitest", "run", target, "--reporter=json"],
        cwd=PROJECT_ROOT, capture_output=True, text=True, check=False,
    )
    start = result.stdout.find("{")
    if start < 0:
        raise SystemExit(f"could not read vitest JSON for {target}\n{result.stderr[-2000:]}")
    report = json.loads(result.stdout[start:])
    if not report.get("success"):
        raise SystemExit(f"{target} is red — refusing to publish a report over it")
    return int(report["numPassedTests"])


def python_tests(directory: Path, selector: list[str]) -> int:
    result = subprocess.run(
        selector, cwd=directory, capture_output=True, text=True, check=False,
    )
    if result.returncode != 0:
        raise SystemExit(f"{' '.join(selector)} is red in {directory} — refusing to publish")
    for line in reversed((result.stdout + result.stderr).splitlines()):
        if " passed" in line:
            return int(line.strip().split()[0])
    raise SystemExit(f"could not read a pass count from {' '.join(selector)}")


def corpus_shape() -> dict:
    """The golden corpus as it is on disk right now."""
    cases = sorted(path for path in CORPUS.iterdir() if path.is_dir())
    manifest = json.loads((CORPUS / "cases.json").read_text(encoding="utf-8"))
    return {
        "cases": len(cases),
        "withTarget": sum(1 for case in cases if (case / "target.systemsketch").is_file()),
        "withGenerated": sum(1 for case in cases if (case / "generated.systemsketch").is_file()),
        "staleNames": sum(
            1 for case in cases
            if (case / "expected.systemsketch").exists()
            or (case / "artifacts" / "candidate.systemsketch").exists()
        ),
        "manifestKey": "target" if "target" in manifest["cases"][0] else "sketch",
        "artifacts": sorted(
            path.name for path in (cases[0] / "artifacts").iterdir()
        ),
        "example": cases[4].name,
        "tree": sorted(
            (path.name + ("/" if path.is_dir() else ""))
            for path in cases[4].iterdir()
        ),
    }


VSCODE = journey("vscode")
CURSOR = journey("cursor")
VSIX = vsix_facts()
CORPUS_SHAPE = corpus_shape()
EMBED_TESTS = unit_tests("src/embed")
APP_TESTS = python_tests(PROJECT_ROOT, ["python3", "-m", "pytest", "tests/", "-q"]) \
    if (PROJECT_ROOT / "tests").is_dir() else 0
GOLDEN_TESTS = python_tests(PYBLOCKS, ["python3", "-m", "pytest", "tests/test_goldens.py", "-q"])

EMBED_FILES = [
    ("src/embed/EmbeddedCanvas.tsx", "the canvas, with the file surfaces removed"),
    ("src/embed/embedProtocol.ts", "the one channel between the app and a host"),
    ("src/embed/sketchDocument.ts", "the envelope, on and off, by suffix alone"),
    ("src/embed/embedSession.ts", "when an edit may leave, with no React in sight"),
    ("src/embed/sharedWithHost.ts", "the only surface an extension may import"),
]
HOST_FILES = [
    ("vscode-systemsketch/src/extension.ts", "a CustomTextEditorProvider; knows files, not Blocks"),
    ("vscode-systemsketch/scripts/stage_app.mjs", "stages the Stable build, and stamps which"),
    ("vscode-systemsketch/esbuild.config.mjs", "bundles the host only — never the canvas"),
    ("vscode-systemsketch/tests/vscode_e2e.mjs", "the real-IDE journey behind every claim here"),
]


def checklist(result: dict) -> str:
    rows = "".join(
        f'<li><span class="tick">✓</span>{esc(check)}</li>' for check in result["checks"]
    )
    extra = ""
    if result.get("blocked"):
        uncovered = "".join(f"<li>{esc(item)}</li>" for item in result.get("uncovered", []))
        extra = f'''
        <div class="blocked">
          <strong>{esc(result["blocked"])}</strong>
          <p>{esc(result.get("note", ""))}</p>
          <span>Not covered here:</span><ul>{uncovered}</ul>
        </div>'''
    return f'<ul class="checks">{rows}</ul>{extra}'


def file_table(rows: list[tuple[str, str]]) -> str:
    body = "".join(
        f"<tr><td><code>{esc(path)}</code></td><td>{esc(note)}</td>"
        f"<td class=\"num\">{lines(PROJECT_ROOT / path)}</td></tr>"
        for path, note in rows
    )
    return f'<table><thead><tr><th>File</th><th>Its one job</th><th class="num">Lines</th></tr></thead><tbody>{body}</tbody></table>'


BEFORE_TREE = f"""{CORPUS_SHAPE["example"]}/
  artifacts/
    candidate.systemsketch   ← the analyzer's board, buried
    diff.blockview.json
    evaluation.json
  expected.systemsketch      ← "expected" by whom?
  source.py"""

def after_tree() -> str:
    """The case folder exactly as it is on disk, with artifacts nested under theirs."""
    notes = {
        "source.py": "the subject",
        "target.systemsketch": "authored by hand; nothing writes here",
        "generated.systemsketch": "what the analyzer draws today",
        "artifacts/": "you never have to open this",
    }
    width = max(len(name) for name in CORPUS_SHAPE["tree"]) + 2
    rendered = [f"{CORPUS_SHAPE['example']}/"]
    for name in CORPUS_SHAPE["tree"]:
        rendered.append(f"  {name.ljust(width)}← {notes[name]}")
        if name.endswith("/"):
            rendered.extend(f"    {child}" for child in CORPUS_SHAPE["artifacts"])
    return "\n".join(rendered)


AFTER_TREE = after_tree()

HTML = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SystemSketch in the IDE, and the golden case folder</title>
<style>
  :root {{
    --ink: #16181d; --muted: #5c6370; --line: #e3e6ec; --bg: #fbfbfd;
    --card: #fff; --accent: #3d5afe; --good: #128a5b; --warn: #a8690b;
  }}
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; padding: 0 20px 96px; font: 15px/1.62 -apple-system, "Segoe UI", system-ui, sans-serif;
         color: var(--ink); background: var(--bg); }}
  main {{ max-width: 1080px; margin: 0 auto; }}
  header.page {{ padding: 56px 0 28px; border-bottom: 1px solid var(--line); margin-bottom: 40px; }}
  h1 {{ font-size: 34px; line-height: 1.18; margin: 0 0 10px; letter-spacing: -0.02em; }}
  .lede {{ font-size: 17px; color: var(--muted); max-width: 68ch; margin: 0; }}
  h2 {{ font-size: 21px; margin: 48px 0 6px; letter-spacing: -0.01em; }}
  h2 + p.sub {{ margin: 0 0 20px; color: var(--muted); max-width: 72ch; }}
  h3 {{ font-size: 15px; margin: 26px 0 8px; }}
  p {{ max-width: 74ch; }}
  section {{ margin-bottom: 8px; }}
  .card {{ background: var(--card); border: 1px solid var(--line); border-radius: 12px;
           padding: 20px 22px; margin: 18px 0; }}
  .grid {{ display: grid; gap: 18px; }}
  .two {{ grid-template-columns: repeat(auto-fit, minmax(330px, 1fr)); }}
  .stats {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 22px 0; }}
  .stat {{ background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; }}
  .stat b {{ display: block; font-size: 25px; letter-spacing: -0.02em; }}
  .stat span {{ font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; }}
  figure {{ margin: 18px 0; }}
  figure img {{ width: 100%; display: block; border: 1px solid var(--line); border-radius: 10px; background: #222; }}
  figcaption {{ font-size: 13px; color: var(--muted); margin-top: 8px; }}
  pre {{ background: #14161b; color: #e6e9f0; padding: 15px 17px; border-radius: 9px;
         overflow-x: auto; font: 12.5px/1.62 "SF Mono", ui-monospace, Menlo, monospace; }}
  pre.plain {{ background: #f4f5f8; color: var(--ink); border: 1px solid var(--line); }}
  code {{ font: 12.5px/1.5 "SF Mono", ui-monospace, Menlo, monospace;
          background: #eef0f4; padding: 1px 5px; border-radius: 4px; }}
  pre code {{ background: none; padding: 0; }}
  table {{ width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 14px; }}
  th, td {{ text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }}
  th {{ font-size: 11.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }}
  td.num, th.num {{ text-align: right; font-variant-numeric: tabular-nums; }}
  ul.checks {{ list-style: none; padding: 0; margin: 6px 0; }}
  ul.checks li {{ padding: 6px 0 6px 26px; position: relative; border-bottom: 1px solid var(--line); font-size: 14px; }}
  ul.checks li:last-child {{ border-bottom: 0; }}
  .tick {{ position: absolute; left: 0; color: var(--good); font-weight: 700; }}
  .blocked {{ margin-top: 14px; padding: 13px 15px; border-left: 3px solid var(--warn);
              background: #fdf7ec; border-radius: 0 8px 8px 0; font-size: 13.5px; }}
  .blocked strong {{ color: var(--warn); }}
  .blocked ul {{ margin: 4px 0 0 18px; padding: 0; }}
  .blocked span {{ display: block; margin-top: 8px; font-size: 12px; color: var(--muted); }}
  .decide li {{ margin-bottom: 14px; }}
  .decide b {{ display: block; }}
  .tag {{ display: inline-block; font-size: 11px; text-transform: uppercase; letter-spacing: .06em;
          padding: 2px 8px; border-radius: 999px; background: #eaf6ef; color: var(--good); }}
  .tag.warn {{ background: #fdf1de; color: var(--warn); }}
  footer {{ margin-top: 56px; padding-top: 18px; border-top: 1px solid var(--line);
            font-size: 12.5px; color: var(--muted); }}
  @media (prefers-color-scheme: dark) {{
    :root {{ --ink: #e8eaf0; --muted: #9aa2b1; --line: #2a2e37; --bg: #101216; --card: #171a20; }}
    code {{ background: #22262e; }}
    pre.plain {{ background: #1c1f26; }}
    .blocked {{ background: #241f14; }}
    .tag {{ background: #12291f; }} .tag.warn {{ background: #2a2214; }}
  }}
</style></head>
<body><main>

<header class="page">
  <h1>SystemSketch in the IDE, and the golden case folder</h1>
  <p class="lede">Click a <code>.systemsketch</code> in the file tree and the canvas opens in
  the editor pane. The plugin now lives in this repo, ships a build of the app rather than a
  second canvas, and contributes no file management at all — the tree already does that. A
  golden case is now three files you read in order.</p>
</header>

<div class="stats">
  <div class="stat"><b>{VSCODE["passed"]}</b><span>VS&nbsp;Code checks</span></div>
  <div class="stat"><b>{CURSOR["passed"]}</b><span>Cursor checks</span></div>
  <div class="stat"><b>{EMBED_TESTS}</b><span>embed unit tests</span></div>
  <div class="stat"><b>{GOLDEN_TESTS}</b><span>golden tests</span></div>
  <div class="stat"><b>{VSIX["bytes"] / 1_048_576:.2f}&thinsp;MB</b><span>packaged VSIX</span></div>
  <div class="stat"><b>{CORPUS_SHAPE["cases"]}</b><span>cases reshaped</span></div>
</div>

<section>
  <h2>1 · The thing itself</h2>
  <p class="sub">A blank <code>target.systemsketch</code> opened from the tree, and the same
  file after a Block was drawn and saved. Both frames are from the run whose verdicts are
  further down — not staged, and not a mock of the chrome.</p>

  <div class="grid two">
    <figure>
      <img alt="A blank target.systemsketch opened as a SystemSketch canvas in VS Code"
           src="{crop('vscode-target-open.png', (0, 0, 1440, 900))}">
      <figcaption>The file tree on the left, the canvas in the editor pane. No in-app file
      menu, no share shell — the tab bar already names the file.</figcaption>
    </figure>
    <figure>
      <img alt="A Block drawn on the canvas and saved back into the file"
           src="{crop('vscode-target-block-saved.png', (0, 0, 1440, 900))}">
      <figcaption>A Block drawn with the toolbar, then <code>Ctrl</code>+<code>S</code>. The
      inspector is the app's own; only the file surfaces were dropped.</figcaption>
    </figure>
  </div>
</section>

<section>
  <h2>2 · What the extension actually contains</h2>
  <p class="sub">Read from the packaged archive, not from intent. The webview is the app's own
  vite output; the extension host is one file that knows about documents and versions and
  nothing about Blocks.</p>

  <div class="card">
    <table>
      <tbody>
        <tr><td>Files in the VSIX</td><td class="num">{VSIX["files"]}</td></tr>
        <tr><td>… that are the staged app build</td><td class="num">{VSIX["appFiles"]}</td></tr>
        <tr><td>… that are the extension host</td><td class="num">{VSIX["extensionHostFiles"]}</td></tr>
        <tr><td>Stable release it was staged against</td>
            <td class="num"><code>{esc(VSIX["app"]["stableBuild"])}</code></td></tr>
        <tr><td>Channel it recorded for itself</td>
            <td class="num"><span class="tag{' warn' if VSIX['app']['channel'] != 'stable' else ''}">{esc(VSIX["app"]["channel"])}</span></td></tr>
      </tbody>
    </table>
    <p style="font-size:13.5px;color:var(--muted);margin:10px 0 0">
      This VSIX is stamped <code>{esc(VSIX["app"]["channel"])}</code> because it was packaged
      from a track worktree, and a worktree is never the tree Stable was built from.
      <code>npm run package</code> refuses outright; <code>npm run package:dev</code> is what
      built this one, and says so in <code>dist/app/app.json</code>.</p>
  </div>

  <h3>The app side of the seam</h3>
  {file_table(EMBED_FILES)}
  <h3>The host side</h3>
  {file_table(HOST_FILES)}
</section>

<section>
  <h2>3 · Driven in a real IDE</h2>
  <p class="sub">The VSIX installed into a throwaway profile, real VS&nbsp;Code launched under
  Xvfb, driven over CDP. Every check's oracle is either the workbench's own DOM or the bytes
  on disk — never the app's internal state, which a released build does not expose.</p>

  <div class="card">
    <h3 style="margin-top:0">{esc(VSCODE["host"])}</h3>
    {checklist(VSCODE)}
  </div>
  <div class="card">
    <h3 style="margin-top:0">{esc(CURSOR["host"])}</h3>
    {checklist(CURSOR)}
  </div>
</section>

<section>
  <h2>4 · The golden case folder</h2>
  <p class="sub">Three files, read in the order you use them: the Python that is analyzed, the
  board you mean, the board the analyzer draws. The evidence you never have to open moved out
  of the way.</p>

  <div class="grid two">
    <div><h3>Before</h3><pre class="plain"><code>{esc(BEFORE_TREE)}</code></pre></div>
    <div><h3>After</h3><pre class="plain"><code>{esc(AFTER_TREE)}</code></pre></div>
  </div>

  <div class="card">
    <table>
      <tbody>
        <tr><td>Cases</td><td class="num">{CORPUS_SHAPE["cases"]}</td></tr>
        <tr><td>… with a <code>target.systemsketch</code></td><td class="num">{CORPUS_SHAPE["withTarget"]}</td></tr>
        <tr><td>… with a <code>generated.systemsketch</code></td><td class="num">{CORPUS_SHAPE["withGenerated"]}</td></tr>
        <tr><td>… still carrying an old filename</td><td class="num">{CORPUS_SHAPE["staleNames"]}</td></tr>
        <tr><td>Manifest key for the authored board</td><td class="num"><code>{esc(CORPUS_SHAPE["manifestKey"])}</code></td></tr>
      </tbody>
    </table>
  </div>

  <h3>The target is the one file nothing writes to</h3>
  <p>That is the whole point of the rename, and it is enforced in three places rather than
  asked for in prose:</p>
  <pre><code># seeds a blank target only where none exists; never touches one that does
python3 -m pyblocks evaluate examples/systemsketch_goldens --seed-targets

# writes generated.systemsketch beside each target, and evidence into artifacts/
python3 -m pyblocks evaluate examples/systemsketch_goldens --write-artifacts

# refuses, by design, rather than replacing twelve hand-authored judgments
python3 scripts/bootstrap_systemsketch_goldens.py</code></pre>
  <p>A blank target is a blank <em>board</em>, not a parse error — which is what makes a
  freshly seeded case something you can click and start drawing in. The evaluator skips it
  until it has something in it, so an unauthored case is an empty case rather than a failing
  one.</p>
</section>

<section>
  <h2>5 · What was decided, and why</h2>

  <div class="card">
    <h3 style="margin-top:0">The extension ships a <em>build</em>, not the source</h3>
    <p>The obvious shortcut is to bundle <code>src/</code> into a webview with esbuild. That
    would be a second build of the canvas, free to drift from the one you released and
    impossible to name afterwards. Instead <code>stage_app.mjs</code> runs the app's own vite
    build with <code>--base ./</code> and stamps what it staged;
    <code>tests/test_stock_boundary.py</code> fails if the extension's bundler ever grows a
    webview entry point.</p>
  </div>

  <div class="card">
    <h3 style="margin-top:0">A worktree can never claim to be Stable</h3>
    <p>The release manifest records a source timestamp, and comparing timestamps across
    different checkouts is meaningless — a worktree checked out this morning is <em>older</em>
    than Stable by the clock and entirely different source. The gate compares the recorded
    <code>sourceRoot</code> as well, which is why this VSIX honestly reports
    <code>development</code>.</p>
  </div>

  <div class="card">
    <h3 style="margin-top:0">The board stays light in a dark workbench <span class="tag warn">deliberate</span></h3>
    <p>Throwing tldraw's dark mode from the host bridge works — it was measured doing exactly
    that. It is not switched on, because SystemSketch's popout chrome is authored light-only:
    the inspector's header colour and divider are fixed light values, so a dark board renders
    its title invisible. The host's choice is still carried to the canvas and stamped on the
    root, and the journey pins today's answer, so turning it on has to be a deliberate change
    made alongside themed panels.</p>
  </div>
</section>

<footer>
  Generated by <code>docs/build_ide_plugin_and_goldens.py</code> on {date.today().isoformat()}.
  Every figure is measured at build time from this tree, the packaged VSIX, and the JSON each
  journey wrote when it ran; the builder refuses to publish over a red suite or a stale run.
</footer>

</main></body></html>
"""

OUTPUT.write_text(HTML, encoding="utf-8")
print(f"wrote {OUTPUT.relative_to(PROJECT_ROOT)}")
