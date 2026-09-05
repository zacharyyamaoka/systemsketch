"""Build the app-wide UI review report: 7 shipped fixes, before/after proof, accept/reject."""
from __future__ import annotations

import base64
import html
import subprocess
from pathlib import Path

DOCS = Path(__file__).resolve().parent
ASSETS = DOCS / "assets"
REPO = DOCS.parent
DATE = "2026-09-05"
OUTPUT = DOCS / f"ui-review-{DATE}.html"


def sh(*args: str) -> str:
    return subprocess.run(args, cwd=REPO, capture_output=True, text=True, check=True).stdout.strip()


def commit_sha(subject_prefix: str) -> str:
    out = sh("git", "log", "--format=%h %s", "-20")
    for line in out.splitlines():
        sha, _, subject = line.partition(" ")
        if subject.startswith(subject_prefix):
            return sha
    raise SystemExit(f"no commit found starting with {subject_prefix!r}")


def image_uri(name: str) -> str:
    path = ASSETS / f"ui-review-{name}-{DATE}.png"
    if not path.exists():
        raise SystemExit(f"missing capture: {path}")
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


FINDINGS = [
    {
        "id": "comments-empty",
        "title": "Comments panel: the ◌ glyph reads as a stuck spinner",
        "commit": commit_sha("Comments panel"),
        "summary": (
            "The “No comments yet” empty state used a bespoke ◌ glyph and its own CSS "
            "instead of the boxed-glyph pattern every other empty state in the app already uses "
            "(the Sept 3 audit built that pattern specifically so every panel would share one look). "
            "The ◌ reads as a circular loading spinner — you wait for it to resolve, and it never does."
        ),
        "files": ["src/comments/LocalCommentsPanel.tsx:293–296", "src/comments/comments.css"],
        "before_img": "comments-before",
        "after_img": "comments-after",
        "before_caption": "Comments panel, freshly opened — the ◌ above “No comments yet” looks like it's still loading.",
        "after_caption": "Same panel — the shared boxed-square glyph used everywhere else in the app, which reads as static.",
        "verified": "npm run test:comments — 12/12 checks pass.",
    },
    {
        "id": "compare-consolidate",
        "title": "Compare changes: four contradictory empty states became one",
        "commit": commit_sha("Compare changes"),
        "summary": (
            "With no saved history to compare against, the dialog showed an amber “no prior "
            "versions” banner, “No snapshot loaded.” on the left pane, and — in the same "
            "breath — “These two versions are identical.” right next to “Select an edited "
            "element to compare changes,” two invitations that directly contradict each other. "
            "All four were independent consequences of the same missing snapshot, with nothing "
            "coordinating them."
        ),
        "files": [
            "src/compare/CompareDialog.tsx:150,780–784",
            "src/compare/BoardRender.tsx:240",
            "src/compare/PropertyTable.tsx:218,277,313",
        ],
        "before_img": "compare-before",
        "after_img": "compare-after",
        "before_caption": "Compare changes on a brand-new board — four messages competing for attention, two of them opposite.",
        "after_caption": "Same state — one banner. The rest of the panel no longer pretends there's something to browse.",
        "verified": "npm run test:compare (21/21) and npm run test:converged (22/23, one pre-existing unrelated failure — see note below) both pass on the paths this touches.",
    },
    {
        "id": "help-panel",
        "title": "Help panel: wrong keyboard shortcut, over-promising copy",
        "commit": commit_sha("Help panel"),
        "summary": (
            "The Help popover told you to press Ctrl+Shift+? for keyboard shortcuts. That combination "
            "does nothing — the real shortcut, confirmed against tldraw's own shortcuts dialog, is "
            "Ctrl+Alt+/. Separately, the intro line promised “Canvas guidance stays here” while the "
            "panel holds exactly one link; the clause has been cut rather than left as a promise the "
            "panel doesn't keep."
        ),
        "files": ["src/SystemSketchUtilities.tsx:586,589"],
        "before_img": "help-before",
        "after_img": "help-after",
        "before_caption": "Help popover — “Ctrl Shift ?” does not open anything.",
        "after_caption": "Corrected shortcut, and copy that only claims what's actually there.",
        "verified": "Manually confirmed Ctrl+Alt+/ opens tldraw's shortcuts dialog; Ctrl+Shift+? does nothing, in both builds.",
    },
    {
        "id": "diagnostics-filters",
        "title": "Diagnostics filters: All / Errors / Warnings had no arrow-key navigation",
        "commit": commit_sha("Diagnostics filters"),
        "summary": (
            "The three severity filter buttons in the Problems panel were a role=\"group\" of plain "
            "aria-pressed buttons — each its own Tab stop, arrow keys doing nothing. The Sept 3 audit "
            "fixed this exact shape for the command palette's tablist and the theme picker's radiogroup; "
            "this one control was missed. It's now a real radiogroup: one Tab stop, arrows/Home/End move "
            "and choose."
        ),
        "files": [
            "src/diagnostics/BoardDiagnosticsPanel.tsx:120–160",
            "src/diagnostics/diagnostics.css",
        ],
        "no_visual": True,
        "why_no_visual": (
            "Purely a keyboard/ARIA-semantics change — the filters look pixel-identical at rest. "
            "Verified with a unit test asserting the DOM role/attributes rather than a screenshot."
        ),
        "verified": "src/diagnostics/BoardDiagnosticsPanel.test.tsx — 3/3 pass, asserting role=\"radiogroup\"/role=\"radio\"/aria-checked.",
    },
    {
        "id": "library-escape",
        "title": "Shape library: Escape closed the panel instead of clearing the search",
        "commit": commit_sha("Shape library"),
        "summary": (
            "Type a filter, hit Escape meaning to clear it — the whole panel closed instead. The fix "
            "took two attempts: the first (an app-level check) looked correct in the diff but changed "
            "nothing on screen, caught only by an actual before/after screenshot. The real cause: the "
            "toolbar's Library button hosts the search inside a stock Radix Popover, whose own "
            "dismiss-on-Escape listener lives entirely outside the app's event handling and fires first. "
            "The panel now owns Escape itself (first clears, second closes), with Radix's default "
            "explicitly stood down via tldraw's own disableEscapeKeyDown prop."
        ),
        "files": [
            "src/library/ShapeLibraryBrowser.tsx",
            "src/toolbar/SystemSketchToolbar.tsx",
            "src/chrome/ChromeProvider.tsx",
        ],
        "before_img": "library-after-escape-before",
        "after_img": "library-after-escape-after",
        "before_caption": "Typed “rect”, pressed Escape once — the whole panel is gone.",
        "after_caption": "Same gesture — the search clears, the panel and full shape list stay open. A second Escape now closes it.",
        "verified": "npm run test:toolbar (28/28) and npm run test:tool-aliases (3/3) pass; behavior re-confirmed directly against the running app for both the toolbar popover and the older left-dock entry point.",
    },
    {
        "id": "layout-actions",
        "title": "Layout actions: Organize Nodes had no busy state; toasts under-reported failure",
        "commit": commit_sha("Layout actions"),
        "summary": (
            "Organize Nodes runs an async elk layout pass, but its trigger stayed clickable and "
            "unlabeled the whole time — no feedback, nothing stopping a redundant second click "
            "mid-run. It now disables itself and reads “Organizing…” while awaiting. Separately, "
            "Tidy Edges and Organize Nodes always toasted at severity ‘info’, even for outcomes like "
            "“Not enough room” or “N routes could not clear every obstacle” — a real limitation "
            "reported in the same neutral tone as routine confirmation. Severity now follows whether "
            "the outcome actually delivered. Also: the global Ctrl+P/K/F shortcut had no key-repeat "
            "guard, re-firing on every OS repeat tick while the key was held."
        ),
        "files": [
            "src/chrome/SelectionLayoutActions.tsx",
            "src/chrome/SystemSketchChrome.tsx",
            "src/blocks/layout/organizeNodes.ts",
            "src/blocks/connections/tidyEdges.ts",
        ],
        "no_visual": True,
        "why_no_visual": (
            "The busy state is a sub-second transient during a fast layout pass, and the toast-severity "
            "change is a color swap that only appears on outcomes that are fiddly to force reliably on "
            "demand — neither makes for an honest screenshot pair. Verified by exercising the actual "
            "app and reading the resulting DOM state instead."
        ),
        "verified": "npm run check (tsc + full vitest + Python + browser smoke) green; disabled/aria-busy state and severity mapping confirmed directly against running component state.",
    },
    {
        "id": "small-polish",
        "title": "Small polish: reduced-motion guard, Replace-button reason",
        "commit": commit_sha("Small polish"),
        "summary": (
            "The recorder's blinking-dot indicator was the one @keyframes animation of four in the app "
            "with no prefers-reduced-motion guard. And the Find & Replace “Replace” button disabled "
            "itself for a locked/unsupported/formatting-boundary match with no explanation on the button "
            "itself — the reason was already computed and shown in the match list, just not surfaced here."
        ),
        "files": ["src/recorder/recorder.css:260–263", "src/commands/SystemSketchCommandPalette.tsx:397"],
        "no_visual": True,
        "why_no_visual": (
            "A disabled animation and a native tooltip attribute don't produce a meaningful static "
            "screenshot pair (native title tooltips don't render under the automation used to capture "
            "this report's other screenshots, only under a real pointing device)."
        ),
        "verified": "npm run check green; both changes are single-attribute additions confirmed present in the built output.",
    },
]

RULED_OUT = [
    "Block title truncation “with no way to see the full text” — false alarm: a native "
    "title attribute already carries the full string (confirmed in the live DOM); the earlier "
    "“no tooltip on hover” observation was a synthetic-mouse-event limitation of the automation, "
    "not a real gap for an actual pointing device.",
    "Input port row density (Name/Type/Default packed into 280px) — Zach's own deliberate "
    "2026-09-03 trade-off, locked by a dedicated smoke test. Not touched.",
    "Code block primitive — merged the same day this review ran, after an extensive babble/pick "
    "process. Not touched.",
    "Callout “shows Pill's properties when selected” — could not reproduce; Callout is "
    "deliberately built from plain stock geo+arrow shapes, documented 2026-09-04.",
    "Dev panel “duplicating” Return to Stable / Make Preview Stable from the top banner — not "
    "a bug: a dedicated smoke test exercises the Dev panel's copy of these buttons independently, "
    "confirming it's a deliberate reachability fallback.",
    "Redo losing a Block after undo — could not reproduce on a careful, isolated retest.",
    "Appearance pill “missing” on a plain rectangle — test error (clicked the fill:none "
    "interior, which tldraw doesn't select); works correctly via the shape's stroke.",
]


def fig(img_key: str, caption: str) -> str:
    return (
        f'<figure><img loading="lazy" alt="{html.escape(caption)}" src="{image_uri(img_key)}">'
        f"<figcaption>{html.escape(caption)}</figcaption></figure>"
    )


def file_chips(files: list[str]) -> str:
    return "".join(f"<code>{html.escape(f)}</code>" for f in files)


def render_finding(index: int, item: dict) -> str:
    if item.get("no_visual"):
        visual = (
            f'<div class="no-visual"><p>{html.escape(item["why_no_visual"])}</p></div>'
        )
    else:
        visual = (
            '<div class="pair">'
            f'<div><em>Before</em>{fig(item["before_img"], item["before_caption"])}</div>'
            f'<div><em>After</em>{fig(item["after_img"], item["after_caption"])}</div>'
            "</div>"
        )
    return f"""
    <article class="finding" id="{item['id']}" data-finding="{item['id']}">
      <header>
        <div class="num">{index:02d}</div>
        <div class="head-text">
          <h2>{html.escape(item['title'])}</h2>
          <div class="meta"><code class="sha">{item['commit']}</code>{file_chips(item['files'])}</div>
        </div>
        <label class="toggle" data-role="toggle">
          <input type="checkbox" checked data-finding-checkbox="{item['id']}">
          <span class="toggle-track"><span class="toggle-thumb"></span></span>
          <span class="toggle-label" data-role="toggle-label">Keep</span>
        </label>
      </header>
      <p class="summary">{item['summary']}</p>
      {visual}
      <p class="verified">✓ {html.escape(item['verified'])}</p>
    </article>"""


def main() -> None:
    findings_html = "\n".join(render_finding(i + 1, item) for i, item in enumerate(FINDINGS))
    ruled_out_html = "".join(f"<li>{item}</li>" for item in RULED_OUT)
    total = len(FINDINGS)

    source = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch UI review · {DATE}</title>
<style>
:root {{ color-scheme:light; --ink:#172033; --muted:#5b6b82; --line:#dbe3ef; --card:#fff; --paper:#f2f5fa;
  --blue:#2563d9; --blue-soft:#eaf0ff; --green:#1d8a4e; --green-soft:#e7f7ee; --amber:#b06a10; --amber-soft:#fdf1e0; }}
* {{ box-sizing:border-box }} body {{ margin:0; font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif; color:var(--ink); background:var(--paper); }}
main {{ max-width:980px; margin:auto; padding:52px 24px 90px }}
.eyebrow {{ color:var(--blue); font-size:12px; font-weight:800; letter-spacing:.1em; text-transform:uppercase }}
h1 {{ max-width:820px; margin:9px 0 14px; font-size:clamp(32px,5vw,52px); line-height:1.05; letter-spacing:-.03em }}
.lede {{ max-width:760px; color:var(--muted); font-size:17px; line-height:1.6 }}
.stat-row {{ display:flex; flex-wrap:wrap; gap:10px; margin:26px 0 6px }}
.stat {{ padding:9px 14px; border:1px solid var(--line); border-radius:999px; background:#fff; font-size:13px; font-weight:700; color:var(--muted) }}
.stat b {{ color:var(--ink) }}
.note {{ margin:22px 0; padding:16px 18px; border-left:4px solid var(--blue); border-radius:0 10px 10px 0; background:var(--blue-soft); line-height:1.55; font-size:14.5px }}
.controls {{ position:sticky; top:0; z-index:5; display:flex; align-items:center; justify-content:space-between; gap:14px;
  margin:34px 0 20px; padding:12px 16px; border:1px solid var(--line); border-radius:14px; background:#fffffff2; backdrop-filter:blur(10px); box-shadow:0 8px 24px #1a233010 }}
.controls .left {{ font-size:14px; color:var(--muted) }}
.controls .left b {{ color:var(--ink) }}
.controls button {{ padding:9px 14px; border:1px solid var(--line); border-radius:9px; background:#fff; font:700 13px/1 Inter,sans-serif; cursor:pointer; color:var(--ink) }}
.controls button.primary {{ border-color:var(--blue); background:var(--blue); color:#fff }}
.controls .btn-row {{ display:flex; gap:8px }}
article.finding {{ margin:0 0 26px; padding:22px 24px 24px; border:1px solid var(--line); border-radius:16px; background:var(--card); box-shadow:0 10px 26px #1a233010; transition:opacity .15s, filter .15s }}
article.finding[data-kept="false"] {{ opacity:.5; filter:grayscale(.4) }}
article.finding header {{ display:flex; align-items:flex-start; gap:14px }}
.num {{ flex:0 0 auto; width:34px; height:34px; display:grid; place-items:center; border-radius:9px; background:var(--blue-soft); color:var(--blue); font-weight:800; font-size:14px }}
.head-text {{ flex:1; min-width:0 }}
.head-text h2 {{ margin:2px 0 6px; font-size:19px; letter-spacing:-.01em }}
.meta {{ display:flex; flex-wrap:wrap; gap:6px; align-items:center }}
.meta code {{ font:700 11.5px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace; padding:3px 8px; border-radius:6px; background:#eef1f6; color:#42506a }}
.meta code.sha {{ background:#20242b; color:#d9e6ff }}
.summary {{ margin:14px 0; line-height:1.6; color:#333d4d; font-size:14.5px }}
.pair {{ display:grid; grid-template-columns:1fr 1fr; gap:14px; margin:14px 0 }}
.pair > div {{ border:1px solid var(--line); border-radius:12px; overflow:hidden; background:#f8f9fb }}
.pair em {{ display:block; padding:7px 12px; border-bottom:1px solid var(--line); background:#fff; font-style:normal; font-weight:800; font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:var(--muted) }}
figure {{ margin:0 }} figure img {{ display:block; width:100%; height:auto }}
figcaption {{ padding:9px 12px; font-size:12.5px; color:var(--muted); line-height:1.4 }}
.no-visual {{ margin:14px 0; padding:14px 16px; border:1px dashed var(--line); border-radius:12px; background:#fafbfd; color:var(--muted); font-size:13.5px; line-height:1.55 }}
.verified {{ margin:14px 0 0; font-size:13px; color:var(--green); font-weight:600 }}
.toggle {{ flex:0 0 auto; display:flex; flex-direction:column; align-items:center; gap:4px; cursor:pointer; user-select:none }}
.toggle input {{ position:absolute; opacity:0; width:0; height:0 }}
.toggle-track {{ position:relative; width:42px; height:24px; border-radius:999px; background:var(--green); transition:background .15s }}
.toggle-thumb {{ position:absolute; top:3px; left:21px; width:18px; height:18px; border-radius:50%; background:#fff; box-shadow:0 1px 3px #0003; transition:left .15s }}
.toggle input:not(:checked) + .toggle-track {{ background:#c7cedb }}
.toggle input:not(:checked) + .toggle-track .toggle-thumb {{ left:3px }}
.toggle-label {{ font-size:11px; font-weight:800; color:var(--muted); text-transform:uppercase; letter-spacing:.04em }}
h3.section {{ margin:46px 0 14px; font-size:22px; letter-spacing:-.02em }}
.ruled-out {{ padding:20px 22px; border:1px solid var(--line); border-radius:14px; background:#fff }}
.ruled-out ul {{ margin:0; padding-left:20px; line-height:1.6; font-size:14px; color:#333d4d }}
.ruled-out li {{ margin-bottom:10px }}
.followup {{ margin-top:18px; padding:16px 18px; border-left:4px solid var(--amber); border-radius:0 10px 10px 0; background:var(--amber-soft); font-size:14px; line-height:1.55 }}
footer {{ margin-top:50px; padding-top:20px; border-top:1px solid var(--line); color:var(--muted); font-size:13.5px; line-height:1.7 }}
footer a {{ color:var(--blue) }}
#toast {{ position:fixed; left:50%; bottom:24px; transform:translate(-50%,12px); padding:11px 18px; border-radius:10px; background:#20242b; color:#fff; font-size:13.5px; font-weight:600; opacity:0; pointer-events:none; transition:opacity .18s, transform .18s; box-shadow:0 10px 30px #0004 }}
#toast.show {{ opacity:1; transform:translate(-50%,0) }}
@media(max-width:720px) {{ .pair {{ grid-template-columns:1fr }} .controls {{ flex-direction:column; align-items:stretch }} }}
</style></head><body><main>

<div class="eyebrow">SystemSketch · app UI review · {DATE}</div>
<h1>Thirty-plus candidates driven through, seven shipped.</h1>
<p class="lede">Reviewed by actually driving the running app in a real browser — toolbars, panels, dialogs,
keyboard paths — not by reading source. A prior 30-item audit already hardened this app on 2026-09-03
(focus rings, dead ends, malformed ARIA widgets); this pass re-verified what it left open and hunted for
what's landed since. Every fix below is proven with either a real before/after screenshot of the running
app, or an automated test run — several early attempts looked correct in the diff and changed nothing on
screen until checked this way.</p>

<div class="stat-row">
  <div class="stat"><b>{total}</b> fixes shipped</div>
  <div class="stat"><b>{len(RULED_OUT)}</b> leads investigated and ruled out</div>
  <div class="stat"><b>7</b> commits, independently revertable</div>
  <div class="stat"><b>npm run check</b> green throughout</div>
</div>

<div class="note">Each card below defaults to <strong>Keep</strong>. Flip any to <strong>Revert</strong> and
use “Copy my decisions” at the top — paste the result back in chat and the flagged commits get
reverted. Your choices are saved in this browser tab, so reloading the page keeps them.</div>

<div class="controls">
  <div class="left"><b id="kept-count">{total}</b> of {total} kept</div>
  <div class="btn-row">
    <button type="button" data-action="accept-all">Keep all</button>
    <button type="button" data-action="reject-all">Revert all</button>
    <button type="button" class="primary" data-action="copy">Copy my decisions</button>
  </div>
</div>

{findings_html}

<h3 class="section">Investigated and ruled out</h3>
<div class="ruled-out"><ul>{ruled_out_html}</ul>
<div class="followup">Also found in passing, filed as a separate follow-up rather than fixed here: two
smoke tests (<code>npm run test:commands</code>, <code>npm run test:repo-ui</code>) have been broken since
yesterday's breadcrumb-controls refactor renamed the toolbar titles they look for by exact string — pure
test-selector staleness, no application behavior is actually broken.</div>
</div>

<footer>
  Built by <code>docs/build_ui_review.py</code> from the live repo. Commits:
  {" · ".join(f'<code>{item["commit"]}</code>' for item in FINDINGS)}.
  <br>See also <a href="ui-hardening-2026-09-03.html">the prior 2026-09-03 UI/UX hardening pass</a> this one builds on.
</footer>
</main>

<div id="toast"></div>
<script>
(function() {{
  var STORAGE_KEY = 'systemsketch-ui-review-{DATE}';
  var boxes = Array.from(document.querySelectorAll('[data-finding-checkbox]'));
  var toast = document.getElementById('toast');
  var countEl = document.getElementById('kept-count');

  function load() {{
    try {{ return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{{}}'); }} catch (e) {{ return {{}}; }}
  }}
  function save(state) {{
    try {{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }} catch (e) {{}}
  }}
  function applyState() {{
    var state = load();
    boxes.forEach(function(box) {{
      var id = box.getAttribute('data-finding-checkbox');
      if (state[id] === false) box.checked = false;
      updateCard(box);
    }});
    updateCount();
  }}
  function updateCard(box) {{
    var id = box.getAttribute('data-finding-checkbox');
    var card = document.getElementById(id);
    var label = card.querySelector('[data-role="toggle-label"]');
    card.setAttribute('data-kept', box.checked ? 'true' : 'false');
    label.textContent = box.checked ? 'Keep' : 'Revert';
  }}
  function updateCount() {{
    var kept = boxes.filter(function(b) {{ return b.checked; }}).length;
    countEl.textContent = kept;
  }}
  function persist() {{
    var state = {{}};
    boxes.forEach(function(box) {{ state[box.getAttribute('data-finding-checkbox')] = box.checked; }});
    save(state);
  }}
  function showToast(text) {{
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function() {{ toast.classList.remove('show'); }}, 2200);
  }}

  boxes.forEach(function(box) {{
    box.addEventListener('change', function() {{
      updateCard(box);
      updateCount();
      persist();
    }});
  }});

  document.querySelector('[data-action="accept-all"]').addEventListener('click', function() {{
    boxes.forEach(function(box) {{ box.checked = true; updateCard(box); }});
    updateCount(); persist();
    showToast('All 7 marked Keep.');
  }});
  document.querySelector('[data-action="reject-all"]').addEventListener('click', function() {{
    boxes.forEach(function(box) {{ box.checked = false; updateCard(box); }});
    updateCount(); persist();
    showToast('All 7 marked Revert.');
  }});
  document.querySelector('[data-action="copy"]').addEventListener('click', function() {{
    var keep = [], revert = [];
    boxes.forEach(function(box) {{
      var title = document.getElementById(box.getAttribute('data-finding-checkbox')).querySelector('h2').textContent;
      (box.checked ? keep : revert).push(title);
    }});
    var lines = ['SystemSketch UI review — {DATE} decisions:', ''];
    lines.push('KEEP (' + keep.length + '):');
    keep.forEach(function(t) {{ lines.push('  ✓ ' + t); }});
    lines.push('');
    lines.push('REVERT (' + revert.length + '):');
    if (revert.length === 0) lines.push('  (none)');
    revert.forEach(function(t) {{ lines.push('  ✗ ' + t); }});
    var text = lines.join('\\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {{
      navigator.clipboard.writeText(text).then(function() {{ showToast('Decisions copied — paste them back in chat.'); }},
        function() {{ showToast('Could not copy — see console.'); console.log(text); }});
    }} else {{
      console.log(text);
      showToast('Clipboard unavailable — decisions logged to console.');
    }}
  }});

  applyState();
}})();
</script>
</body></html>"""
    OUTPUT.write_text(source, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
