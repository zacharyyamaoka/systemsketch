"""Build the in-app file browser + multiple windows implementation report.

Every screenshot embedded here is written by the journey that asserts the
behaviour it shows — `tests/workspace_browser_smoke.mjs` in headless Chrome and
`tests/desktop_windows_smoke.mjs` in a real Chrome app window on a private Xvfb
display — so a frame cannot drift away from the check it illustrates.

Numbers are measured from the live repo at build time, never typed in.
"""
from __future__ import annotations

import base64
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from report_measurements import journey_results, line_count, unit_test_count

DOCS_DIR = Path(__file__).resolve().parent
ASSETS = DOCS_DIR / "assets"
REPO = DOCS_DIR.parent
OUTPUT_PATH = DOCS_DIR / "in-app-file-browser-2026-09-01.html"

FRAMES = {
    "crash": "zenity-not-responding.png",
    "menu": "workspace-file-menu.png",
    "browser": "workspace-browser-open.png",
    "filter": "workspace-browser-filter.png",
    "folder": "workspace-browser-folder.png",
    "second": "workspace-second-window.png",
    "desktop": "desktop-two-windows.png",
}


def figure(key: str) -> str:
    data = base64.b64encode((ASSETS / FRAMES[key]).read_bytes()).decode("ascii")
    return f"data:image/png;base64,{data}"


def git(*arguments: str) -> str:
    return subprocess.run(
        ["git", *arguments], cwd=REPO, capture_output=True, text=True, check=True
    ).stdout.strip()


def branch_diff() -> dict[str, tuple[int, int]]:
    """Added/removed lines per file, this branch's base against the live tree.

    Diffing the base against the *working tree* rather than against HEAD keeps
    the table honest whether or not the work has been committed yet; a file git
    does not track yet is all-new, so its line count is its addition.
    """
    base = git("merge-base", "HEAD", "main")
    rows: dict[str, tuple[int, int]] = {}
    for line in git("diff", "--numstat", base).splitlines():
        added, removed, name = line.split("\t")
        if added != "-":
            rows[name] = (int(added), int(removed))
    for name in git("ls-files", "--others", "--exclude-standard").splitlines():
        path = REPO / name
        if path.is_file() and path.suffix in {".py", ".ts", ".tsx", ".css", ".mjs"}:
            rows[name] = (line_count(name), 0)
    return rows


def chooser_calls() -> int:
    """Desktop-chooser invocations left in the Python host — the guard test's set.

    Deliberately the host only: the browser cannot spawn a process, and the one
    surviving mention in `LocalWorkspace.tsx` is a comment recording why the
    dialog exists at all.
    """
    return sum(
        path.read_text(encoding="utf-8").count(token)
        for path in sorted((REPO / "scripts").glob("*.py"))
        for token in ("zenity", "kdialog", "yad", "--file-selection")
    )


DIFF = branch_diff()
CHOOSER_CALLS = chooser_calls()
STORE_REMOVED = DIFF.get("scripts/workspace_store.py", (0, 0))[1]
SERVER_REMOVED = DIFF.get("scripts/server.py", (0, 0))[1]
CLIENT_REMOVED = DIFF.get("src/workspace/workspaceClient.ts", (0, 0))[1]
UNIT_TESTS = unit_test_count("src/workspace/workspaceModel.test.ts")
BROWSER_CHECKS = journey_results(
    ASSETS / "workspace-browser-results.json",
    REPO / "tests" / "workspace_browser_smoke.mjs",
    REPO / "src",
)
DESKTOP_CHECKS = journey_results(
    ASSETS / "desktop-windows-results.json",
    REPO / "tests" / "desktop_windows_smoke.mjs",
    REPO / "src",
)
DIALOG_LINES = line_count("src/workspace/LocalWorkspace.tsx")
MODEL_LINES = line_count("src/workspace/workspaceModel.ts")


def checklist(results: list[dict]) -> str:
    return "\n".join(
        f'      <li><b>PASS</b><span>{row["label"]}</span></li>' for row in results
    )


def build() -> str:
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SystemSketch &middot; In-app file browser and windows</title>
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
    h1 {{ max-width: 940px; margin: 0; font-size: clamp(38px, 5.4vw, 66px); line-height: .98; letter-spacing: -.05em; }}
    .lede {{ max-width: 800px; margin: 24px 0 0; color: var(--muted); font-size: 19px; line-height: 1.6; }}
    .chips {{ display: flex; flex-wrap: wrap; gap: 9px; margin-top: 26px; }}
    .chip {{ display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 999px; background: #fff; color: var(--muted); font: 650 12.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }}
    .chip.ok {{ border-color: #b9e3c9; background: var(--green-soft); color: var(--green); }}
    .chip.gone {{ border-color: #f0c2bd; background: var(--red-soft); color: var(--red); }}
    section {{ margin-top: 60px; }}
    h2 {{ margin: 0 0 6px; font-size: 30px; letter-spacing: -.03em; }}
    h3 {{ margin: 26px 0 6px; font-size: 18px; letter-spacing: -.02em; }}
    .sub {{ margin: 0 0 22px; max-width: 820px; color: var(--muted); font-size: 16px; line-height: 1.6; }}
    p {{ line-height: 1.65; }}
    figure {{ margin: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 18px; background: var(--card); box-shadow: 0 12px 40px rgba(28, 34, 48, .06); }}
    figure img {{ display: block; width: 100%; height: auto; }}
    figcaption {{ padding: 14px 18px 16px; border-top: 1px solid var(--line); color: var(--muted); font-size: 13.5px; line-height: 1.55; }}
    figcaption b {{ color: var(--ink); }}
    .pair {{ display: grid; grid-template-columns: 1fr 1fr; gap: 18px; align-items: start; }}
    .lean {{ display: grid; grid-template-columns: 1.35fr 1fr; gap: 18px; align-items: start; }}
    .defect {{ display: grid; grid-template-columns: 1fr 1fr; gap: 0; margin-top: 16px; border: 1px solid var(--line); border-radius: 18px; overflow: hidden; background: var(--card); }}
    .defect > div {{ padding: 20px 22px; }}
    .defect .was {{ background: var(--red-soft); border-right: 1px solid var(--line); }}
    .defect h3 {{ margin: 0 0 8px; font-size: 17px; letter-spacing: -.02em; }}
    .defect .was h3 {{ color: var(--red); }}
    .defect .now h3 {{ color: var(--green); }}
    .defect p {{ margin: 0 0 10px; font-size: 14.5px; }}
    .defect p:last-child {{ margin-bottom: 0; }}
    code {{ padding: 2px 5px; border-radius: 5px; background: #eef0f4; font: 640 12.5px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }}
    .defect .was code {{ background: #f7dedb; }}
    pre {{ margin: 20px 0 0; padding: 20px 22px; overflow-x: auto; border: 1px solid #23262e; border-radius: 16px; background: #191b21; color: #e6e8ee; font: 500 13px/1.7 ui-monospace, SFMono-Regular, Menlo, monospace; }}
    pre .c {{ color: #8f96a6; }}
    pre .k {{ color: #ff8fbe; }}
    pre .n {{ color: #9fd0ff; }}
    pre .d {{ color: #ff9b91; }}
    pre .a {{ color: #8ce0ab; }}
    table {{ width: 100%; margin-top: 18px; border-collapse: collapse; background: var(--card); border: 1px solid var(--line); border-radius: 16px; overflow: hidden; font-size: 14px; }}
    th, td {{ padding: 11px 14px; text-align: left; border-bottom: 1px solid var(--line); vertical-align: top; line-height: 1.55; }}
    th {{ background: #f2f4f7; font-size: 11.5px; font-weight: 760; letter-spacing: .07em; text-transform: uppercase; color: var(--faint); }}
    tr:last-child td {{ border-bottom: none; }}
    td.num {{ font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; white-space: nowrap; color: var(--muted); }}
    ul.checks {{ margin: 18px 0 0; padding: 0; list-style: none; display: grid; gap: 8px; }}
    ul.checks li {{ display: grid; grid-template-columns: auto 1fr; gap: 11px; align-items: baseline; padding: 12px 15px; border: 1px solid #c7e6d3; border-radius: 13px; background: var(--green-soft); font-size: 14.5px; }}
    ul.checks b {{ color: var(--green); font: 750 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }}
    .note {{ margin-top: 22px; padding: 18px 20px; border: 1px solid #c9caf5; border-radius: 16px; background: var(--accent-soft); font-size: 15px; line-height: 1.6; }}
    .seam {{ margin-top: 18px; border: 1px solid var(--line); border-radius: 18px; background: var(--card); padding: 22px; }}
    footer {{ margin-top: 72px; padding-top: 22px; border-top: 1px solid var(--line); color: var(--faint); font-size: 13px; line-height: 1.7; }}
    footer b {{ color: var(--muted); }}
    @media (max-width: 900px) {{ .pair, .lean, .defect {{ grid-template-columns: 1fr; }} .defect .was {{ border-right: none; border-bottom: 1px solid var(--line); }} }}
  </style>
</head>
<body>
<main>

  <p class="eyebrow">SystemSketch &middot; 1 Sep 2026</p>
  <h1>Files are browsed inside the app.<br>Boards get their own windows.</h1>
  <p class="lede">
    Opening a board used to hand the job to <code>zenity</code>, a separate GTK application the Python host
    started and then waited on. When it wedged, File&nbsp;&rsaquo;&nbsp;Open wedged with it. That dependency
    is gone: the chooser is now SystemSketch's own browser, reading the same digest-fenced workspace API the
    canvas already saves through &mdash; and any board can be sent to a second desktop window.
  </p>
  <div class="chips">
    <span class="chip gone">{CHOOSER_CALLS} chooser subprocesses left in the host</span>
    <span class="chip ok">{len(BROWSER_CHECKS)} checks &middot; headless journey</span>
    <span class="chip ok">{len(DESKTOP_CHECKS)} checks &middot; real Chrome app window</span>
    <span class="chip ok">{UNIT_TESTS} unit tests &middot; workspaceModel</span>
  </div>

  <section>
    <h2>What was actually broken</h2>
    <p class="sub">
      Not the dialog's design &mdash; its process model. Two independent single points of failure, either of
      which turns "open a file" into a hang with no way back.
    </p>
    <div class="lean">
      <figure>
        <img src="{figure('crash')}" alt="GNOME dialog reading zenity is not responding">
        <figcaption>
          <b>The reported symptom.</b> The desktop, not SystemSketch, telling you a second application stopped
          answering. SystemSketch had no way to say anything: it was still awaiting the fetch.
        </figcaption>
      </figure>
      <div>
        <h3>1. A GUI subprocess inside the HTTP handler</h3>
        <p style="font-size:15px">
          <code>pick_document_path</code> ran <code>subprocess.run([zenity, …])</code> with
          <code>capture_output=True</code> and <b>no timeout</b>, on the request thread of a
          <code>ThreadingHTTPServer</code>. A wedged chooser holds that thread until the process dies.
        </p>
        <h3>2. No client-side deadline either</h3>
        <p style="font-size:15px">
          The browser's <code>await pickWorkspaceDocument(…)</code> carried no <code>AbortSignal</code>, so the
          fallback the code already had &mdash; the app's own dialog &mdash; could only run on a <em>fast</em>
          failure. A slow one was indistinguishable from a user reading their folders, forever.
        </p>
        <p style="font-size:15px; color: var(--muted)">
          The fix is not a timeout. Two processes were being asked to agree about one modal interaction; the
          second process is what should go.
        </p>
      </div>
    </div>

    <div class="defect">
      <div class="was">
        <h3>Before &mdash; the host owned the chooser</h3>
        <p><code>POST /api/workspace/pick</code> &rarr; <code>shutil.which("zenity")</code> &rarr; spawn &rarr;
        block &rarr; parse stdout &rarr; re-validate the path against the workspace root.</p>
        <p>The in-app dialog existed, but only as the <em>fallback</em> for
        <code>available: false</code>.</p>
        <p>Paths outside the files root came back from a chooser that happily showed the whole filesystem, and
        were then refused by the server &mdash; a picker that lets you pick things it will not open.</p>
      </div>
      <div class="now">
        <h3>After &mdash; the app owns the chooser</h3>
        <p><code>showDialog('open')</code> &rarr; the same React dialog, reading
        <code>GET /api/workspace/list</code>. No subprocess, no second window manager, nothing to wedge.</p>
        <p>{STORE_REMOVED} lines left <code>scripts/workspace_store.py</code>, {SERVER_REMOVED} left
        <code>scripts/server.py</code>, {CLIENT_REMOVED} left <code>workspaceClient.ts</code>.</p>
        <p>The browser can only ever show what the host will open, because it is the host's own listing.</p>
      </div>
    </div>

    <div class="note">
      <b>The regression guard is a test, not a habit.</b>
      <code>test_the_host_never_shells_out_to_a_desktop_file_chooser</code> greps every
      <code>scripts/*.py</code> for <code>zenity</code>, <code>kdialog</code>, <code>yad</code> and
      <code>--file-selection</code>, and <code>test_no_workspace_endpoint_spawns_a_chooser</code> asserts the
      endpoint is absent. Re-adding an out-of-process chooser now turns <code>npm run check</code> red.
    </div>
  </section>

  <section>
    <h2>The browser you get instead</h2>
    <p class="sub">
      The dialog that was the fallback is now the product surface, so it was given the things a chooser you
      actually use needs: a filter, a breadcrumb, arrow keys, places, and a second confirm button.
    </p>
    <figure>
      <img src="{figure('browser')}" alt="The SystemSketch open dialog listing a folder and two boards">
      <figcaption>
        <b>Ctrl+O, in the running app.</b> Places (the SystemSketch folder, then Home), Recent, a breadcrumb
        whose last crumb is the folder you are in, and the folder's own subfolders and <code>.tldr</code>
        documents. The first document is pre-selected, so Enter means something before you touch anything.
      </figcaption>
    </figure>
    <div class="pair" style="margin-top:18px">
      <figure>
        <img src="{figure('filter')}" alt="Filtering the folder to one document">
        <figcaption>
          <b>Type to narrow.</b> The filter box holds focus when the dialog opens, so Ctrl+O &rarr;
          <code>grip</code> &rarr; Enter is the whole gesture. A filter that hides the selected row moves the
          selection to the first row still visible &mdash; Enter can never open something you cannot see.
        </figcaption>
      </figure>
      <figure>
        <img src="{figure('folder')}" alt="Inside a nested folder with the breadcrumb showing the path">
        <figcaption>
          <b>Folders open in place.</b> One click descends, the breadcrumb walks back out, Backspace goes up a
          level, and the crumb trail keeps its tail in view when the path is long.
        </figcaption>
      </figure>
    </div>
    <table>
      <tr><th>Gesture</th><th>What it does</th><th>Where</th></tr>
      <tr><td class="num">Ctrl+O</td><td>Open the in-app browser</td><td>anywhere on the canvas</td></tr>
      <tr><td class="num">type</td><td>Filter this folder by name</td><td>focus starts in the filter box</td></tr>
      <tr><td class="num">&uarr; &darr;</td><td>Move the selection, clamped at both ends</td><td>works while typing</td></tr>
      <tr><td class="num">Enter</td><td>Open the document &mdash; or enter the folder</td><td>whichever row is selected</td></tr>
      <tr><td class="num">Backspace</td><td>Up one folder</td><td>only when not typing in a field</td></tr>
      <tr><td class="num">Escape</td><td>Close without changing anything</td><td>unchanged</td></tr>
    </table>
  </section>

  <section>
    <h2>Many windows</h2>
    <p class="sub">
      SystemSketch on the desktop is Chrome in <code>--app</code> mode, so a second window is a real second
      OS window with the same chromeless frame &mdash; not a tab, and not a panel inside the canvas.
    </p>
    <figure>
      <img src="{figure('desktop')}" alt="Two SystemSketch app windows on one desktop, Arm behind and Untitled in front">
      <figcaption>
        <b>Captured from the X server, not from a mock.</b> Two SystemSketch app windows, each on its own
        board. <code>tests/desktop_windows_smoke.mjs</code> launches the desktop launcher's own Chrome recipe
        on a private Xvfb display, presses Ctrl+Shift+N, and asks <code>xdotool</code> how many windows exist
        &mdash; the count and the per-window titles are the assertion, this image is only what it looked like.
        The flat black around them is the bare X display: no wallpaper, no window manager, nothing else running.
      </figcaption>
    </figure>
    <div class="pair" style="margin-top:18px">
      <figure>
        <img src="{figure('menu')}" alt="The File menu showing New window between New and Open">
        <figcaption>
          <b>New window sits beside New.</b> Ctrl+N still makes a board in this window; Ctrl+Shift+N makes a
          window &mdash; the split every editor already uses, so there is nothing to learn.
        </figcaption>
      </figure>
      <figure>
        <img src="{figure('second')}" alt="The second window running the Elbow board">
        <figcaption>
          <b>&ldquo;Open in new window&rdquo;</b> in the browser's footer sends the selected board to its own
          window and closes the dialog. The window title is the board name, so a taskbar full of them reads.
        </figcaption>
      </figure>
    </div>

    <div class="seam">
      <h3 style="margin-top:0">Two details that decide whether this works at all</h3>
      <p style="font-size:15px; margin-top:6px">
        <b>The window handle is taken inside the gesture.</b> Chrome blocks a popup opened after an awaited
        round trip, and choosing a name for a fresh board needs a directory listing first. So the handle is
        opened synchronously on <code>about:blank</code> and pointed at the board once the name is known.
      </p>
      <pre><span class="c">// src/workspace/LocalWorkspace.tsx</span>
<span class="k">const</span> handle = window.<span class="n">open</span>(<span class="a">''</span>, <span class="a">'_blank'</span>, newWindowFeatures())   <span class="c">// gesture still live</span>
<span class="k">const</span> nextPath = target ?? (<span class="k">await</span> reserveUntitledPath())      <span class="c">// listing + reservation</span>
handle.location.<span class="n">replace</span>(<span class="k">new</span> <span class="n">URL</span>(documentHref(nextPath), location.href).toString())</pre>
      <p style="font-size:15px; margin-top:18px">
        <b>Two new windows must not claim the same name.</b> <code>nextUntitledDocumentPath</code> can only see
        files that exist, and a fresh board writes nothing until its first edit &mdash; so two windows opened
        seconds apart both computed <code>Untitled 2</code>. Each window now records a short-lived local
        reservation, and reservations expire so a window that never came back cannot hold a name hostage.
      </p>
    </div>
  </section>

  <section>
    <h2>What changed</h2>
    <table>
      <tr><th>File</th><th>+ / &minus;</th><th>What</th></tr>
      {"".join(
        f'<tr><td class="num">{name}</td><td class="num">+{added} &minus;{removed}</td><td>{note}</td></tr>'
        for name, note in [
          ("scripts/workspace_store.py", "The zenity chooser deleted; every other operation untouched."),
          ("scripts/server.py", "<code>/api/workspace/pick</code> removed from the POST allowlist and the handler."),
          ("src/workspace/workspaceClient.ts", "The <code>pick</code> RPC and its result type deleted."),
          ("src/workspace/workspaceModel.ts", f"Pure browser model: rows, filter, selection, breadcrumbs, untitled reservations ({MODEL_LINES} lines)."),
          ("src/workspace/LocalWorkspace.tsx", f"The dialog becomes the chooser; <code>openWindow</code>, <code>newWindow</code>, window titles ({DIALOG_LINES} lines)."),
          ("src/workspace/local-workspace.css", "Breadcrumbs, filter box, places, and the notice toast."),
          ("tests/workspace_browser_smoke.mjs", "The headless journey, and the frames in this report."),
          ("tests/desktop_windows_smoke.mjs", "The Chrome app-mode window proof on a private display."),
        ]
        for added, removed in [DIFF.get(name, (0, 0))]
      )}
    </table>
  </section>

  <section>
    <h2>Proof</h2>
    <p class="sub">
      Both lists are read from the JSON each journey writes as it asserts, and the build refuses to publish
      verdicts older than the source they were measured against.
    </p>
    <h3><code>npm run test:workspace</code> &mdash; headless Chrome, real pointer and key events</h3>
    <ul class="checks">
{checklist(BROWSER_CHECKS)}
    </ul>
    <h3><code>npm run test:windows</code> &mdash; a real Chrome <code>--app</code> window on Xvfb</h3>
    <ul class="checks">
{checklist(DESKTOP_CHECKS)}
    </ul>
  </section>

  <footer>
    <p>
      <b>Reproduce.</b> <code>npm run test:workspace</code> for the browser journey and its frames,
      <code>npm run test:windows</code> for the desktop-window proof (it skips itself unless Xvfb and xdotool
      are installed, and never opens a window on your screen), <code>npm run check</code> for types, the
      {UNIT_TESTS} workspace unit tests, and the Python suite. Rebuild this page with
      <code>python3 docs/build_in_app_file_browser.py</code>.
    </p>
    <p>
      <b>Scope.</b> Verified at 1400&times;940 headless and in a 1041&times;740 Chrome app window. The desktop
      proof runs without a window manager, so window placement is done explicitly rather than by a WM — the
      window <em>count</em> and their titles are what is asserted.
    </p>
    <p>
      <b>Deliberately not done.</b> Opening a board still marks it dirty for under a second and rewrites it
      once — measured before this work and left alone, because it lives in the save path rather than the
      chooser. With two windows on the <em>same</em> board that shows up as a reload in the other window, not
      as a conflict or a lost edit. <code>Show in Files</code> still calls the desktop file manager on
      purpose: revealing a file in the OS is the one job that belongs to the OS.
    </p>
  </footer>

</main>
</body>
</html>
"""


if __name__ == "__main__":
    OUTPUT_PATH.write_text(build(), encoding="utf-8")
    print(f"wrote {OUTPUT_PATH} ({OUTPUT_PATH.stat().st_size / 1024:.0f} KB)")
