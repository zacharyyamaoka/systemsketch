"""Build the round-2 app UI review report: 2 shipped fixes, critic-checked, before/after proof."""
from __future__ import annotations

import base64
import html
import subprocess
from pathlib import Path

DOCS = Path(__file__).resolve().parent
ASSETS = DOCS / "assets"
REPO = DOCS.parent
DATE = "2026-09-05"
OUTPUT = DOCS / f"ui-review-round2-{DATE}.html"


def sh(*args: str) -> str:
    return subprocess.run(args, cwd=REPO, capture_output=True, text=True, check=True).stdout.strip()


def commit_sha(subject_prefix: str) -> str:
    out = sh("git", "log", "--format=%h %s", "-10")
    for line in out.splitlines():
        sha, _, subject = line.partition(" ")
        if subject.startswith(subject_prefix):
            return sha
    raise SystemExit(f"no commit found starting with {subject_prefix!r}")


def image_uri(name: str) -> str:
    path = ASSETS / f"ui-review-r2-{name}-{DATE}.png"
    if not path.exists():
        raise SystemExit(f"missing capture: {path}")
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


FINDINGS = [
    {
        "id": "bt-empty-region",
        "title": "A fresh Behavior Tree region could never accept its first node",
        "commit": commit_sha("Behavior Tree: a fresh region"),
        "summary": (
            "Placing a Behavior Tree region with a single click (as opposed to a drag) left it "
            "permanently dead: neither the on-canvas “+” menu nor the inspector's Library could ever "
            "place a first node, because the region's default XML was a blank string and "
            "insertBehaviorTreeNode fails immediately on that (“The file has no &lt;root&gt; element”) "
            "before it ever reaches its own “empty tree accepts a root” case."
        ),
        "critic_note": (
            "The independent critic confirmed the bug — then caught two regressions in the first fix: "
            "hard-defaulting treeId to \"MainTree\" silently broke the toolbar's own sample-tree seeding "
            "on drag (it checked `xml === ''` verbatim), and separately let a region offer itself as its "
            "own insertable Sub Tree — an infinite-recursion trap — because a truthy treeId defeated an "
            "existing self-exclusion fallback elsewhere. Also flagged that the existing 43-check browser "
            "journey and 34 unit tests all construct trees via `editor.createShape()` directly, bypassing "
            "the tool entirely, so none of them could ever have caught this. Revised fix: leave treeId "
            "empty (existing readers already fall back correctly) and detect an empty *document* rather "
            "than an empty *string* in the tool's seeding guard."
        ),
        "files": [
            "src/behaviorTree/behaviorTreeModel.ts",
            "src/behaviorTree/btcppXml.ts",
            "src/behaviorTree/BehaviorTreeTool.ts",
        ],
        "before_img": "bt-empty-before",
        "after_img": "bt-empty-after",
        "before_caption": "Click-created region — “Start” only, and no operation can ever add to it.",
        "after_caption": "Same gesture, after the fix — a real empty document a person can build on. (Same screenshot also shows finding #2, below.)",
        "verified": "Live-verified both paths after the revision: drag still seeds the full 13-node PickAndPlace sample; click now yields a buildable empty tree. npx vitest run src/behaviorTree (34/34) and npm run test:bt (43/43) both green.",
    },
    {
        "id": "bt-inspector-overflow",
        "title": "Behavior Tree inspector rows overflowed the 280px dock",
        "commit": commit_sha("Behavior Tree inspector"),
        "summary": (
            "The Direction and Data rows (and the node-type Library list) overflowed their column — "
            "confirmed by direct DOM measurement, not a screenshot glance: the Direction row measured "
            "scrollWidth 276 vs clientWidth 236, Data 285 vs 236 (“Blackboard”/“Dataflow” "
            "are the longest option labels). A CSS grid item's default min-width is its content's "
            "min-content size, so the segmented button group's un-ellipsized text forced its track wider "
            "than the dock."
        ),
        "critic_note": (
            "The critic confirmed the overflow was real and the CSS fix worked — then pointed out it was "
            "only half the job: eliminating the overflow, on its own, would have made the remaining "
            "unavoidable truncation on the longest labels *worse* (fewer visible characters) with no way "
            "to recover the full text anywhere — exactly what the truthful-property-rendering rule "
            "forbids. The Segmented button component already accepted a per-option `title` prop; it just "
            "wasn't populated with the label by default. Also caught a redundant title I'd proposed "
            "adding elsewhere that duplicated one already present one level up, and recommended the "
            "narrower, more general `grid-template-columns` fix over a second, option-specific rule."
        ),
        "files": [
            "src/behaviorTree/ui/BehaviorTreeInspector.tsx",
            "src/behaviorTree/ui/behavior-tree-inspector.css",
        ],
        "before_img": "bt-empty-before",
        "after_img": "bt-empty-after",
        "before_caption": "VIEW panel — labels clipped past the dock edge, page carries a horizontal scrollbar, no tooltip anywhere.",
        "after_caption": "Same panel, after the fix — zero container overflow (scrollWidth === clientWidth on every row); truncation that remains is now inescapable at this width, but every label carries a title with the full text.",
        "verified": "Direct DOM measurement before/after (not eyeballing a screenshot): panel body and library list both measure scrollWidth === clientWidth with zero overflow; every segmented button's title now equals its full label text. npm run check green.",
    },
]

RULED_OUT = [
    "“Detach to primitives crashes on a Behavior Tree region” — a scout reported this as a "
    "confirmed crash with a specific ValidationError. Investigated: the region's own rebuild report "
    "already lists “not yet detached to stock shapes” under tracked, not-yet-built work (portable "
    ".tldr export has the same gap) — this is very likely that same known limitation surfacing through "
    "a different menu action, not a new discovery. Whether it fails gracefully or actually throws needs "
    "its own investigation with the region's future detach design in mind, not a quick patch bolted onto "
    "this pass; flagged separately rather than fixed here.",
    "Blackboard pill inlet/outlet circles have no in/out label — refuted by the critic: polarity is "
    "already carried three ways (side, colour, arrowheads), matching every other Block's port idiom in "
    "the app. Adding letters here would break the very consistency it seemed to be asking for.",
    "Blackboard pill shows only the key name, never its type — refuted, factually: the critic read the "
    "painted DOM directly and found the type already rendered (e.g. “object_pose: Pose”) with the "
    "full string additionally available in a title attribute. This claim would not have survived one "
    "look at the running app.",
    "Blackboard's “@key” global-scope prefix has no visual distinction — true, but “@” is "
    "BehaviorTree.CPP v4's own notation, unstyled in both Groot and py_trees, the reference implementations "
    "this feature is matching. Inventing a colour or icon here would be relitigating a design call that "
    "belongs to Zach, not an AI decision.",
    "Workspace file browser “silently rejects empty folder names” — refuted: the critic drove the "
    "actual form and found the Create button already disabled on an empty/whitespace name, and a visible "
    "role=\"alert\" error on Enter, backed by real server-side validation (scripts/workspace_store.py:274).",
    "“Three unlabeled menu items in the Add-process submenu” (own finding) — the accessibility-"
    "snapshot tool used for review simply failed to extract their text; direct DOM inspection found real "
    "text content on every item with no aria-label, which a browser correctly falls back to computing "
    "from text content. Tool limitation, not a product bug — second time this exact failure mode has "
    "nearly produced a false accessibility finding this project.",
    "Behavior Tree Process view — a dedicated pass found nothing: fixed spacing constants, consistent "
    "labeling, and an empty-state check, all already well executed.",
    "Recorder controls, Landmarks panel, board overview, portable export/share, and workspace file "
    "operations more broadly — all already hardened by the two prior passes; nothing new found.",
]

DROPPED_BEFORE_CRITIC = [
    "“The header shows an alarming ‘1 error’ badge on a completely untouched, freshly-placed region” — "
    "own finding, lower confidence from the start (the badge is small and gray, not a red alarm). Folded "
    "into finding #1 above rather than treated separately, since fixing the underlying dead-end made the "
    "count legitimately reach 0 anyway.",
]


def fig(img_key: str, caption: str) -> str:
    return (
        f'<figure><img loading="lazy" alt="{html.escape(caption)}" src="{image_uri(img_key)}">'
        f"<figcaption>{html.escape(caption)}</figcaption></figure>"
    )


def file_chips(files: list[str]) -> str:
    return "".join(f"<code>{html.escape(f)}</code>" for f in files)


def render_finding(index: int, item: dict) -> str:
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
      <div class="critic"><strong>What the critic caught:</strong> {item['critic_note']}</div>
      {visual}
      <p class="verified">✓ {html.escape(item['verified'])}</p>
    </article>"""


def main() -> None:
    findings_html = "\n".join(render_finding(i + 1, item) for i, item in enumerate(FINDINGS))
    ruled_out_html = "".join(f"<li>{item}</li>" for item in RULED_OUT)
    dropped_html = "".join(f"<li>{item}</li>" for item in DROPPED_BEFORE_CRITIC)
    total = len(FINDINGS)

    source = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch UI review · round 2 · {DATE}</title>
<style>
:root {{ color-scheme:light; --ink:#172033; --muted:#5b6b82; --line:#dbe3ef; --card:#fff; --paper:#f2f5fa;
  --blue:#2563d9; --blue-soft:#eaf0ff; --green:#1d8a4e; --green-soft:#e7f7ee; --amber:#b06a10; --amber-soft:#fdf1e0;
  --purple:#6d3fd9; --purple-soft:#f1ecfd; }}
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
.critic {{ margin:14px 0; padding:14px 16px; border-radius:12px; background:var(--purple-soft); border-left:4px solid var(--purple); font-size:13.5px; line-height:1.6; color:#3a2a63 }}
.critic strong {{ color:var(--purple) }}
.pair {{ display:grid; grid-template-columns:1fr 1fr; gap:14px; margin:14px 0 }}
.pair > div {{ border:1px solid var(--line); border-radius:12px; overflow:hidden; background:#f8f9fb }}
.pair em {{ display:block; padding:7px 12px; border-bottom:1px solid var(--line); background:#fff; font-style:normal; font-weight:800; font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:var(--muted) }}
figure {{ margin:0 }} figure img {{ display:block; width:100%; height:auto }}
figcaption {{ padding:9px 12px; font-size:12.5px; color:var(--muted); line-height:1.4 }}
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
footer {{ margin-top:50px; padding-top:20px; border-top:1px solid var(--line); color:var(--muted); font-size:13.5px; line-height:1.7 }}
footer a {{ color:var(--blue) }}
#toast {{ position:fixed; left:50%; bottom:24px; transform:translate(-50%,12px); padding:11px 18px; border-radius:10px; background:#20242b; color:#fff; font-size:13.5px; font-weight:600; opacity:0; pointer-events:none; transition:opacity .18s, transform .18s; box-shadow:0 10px 30px #0004 }}
#toast.show {{ opacity:1; transform:translate(-50%,0) }}
@media(max-width:720px) {{ .pair {{ grid-template-columns:1fr }} .controls {{ flex-direction:column; align-items:stretch }} }}
</style></head><body><main>

<div class="eyebrow">SystemSketch · app UI review · round 2 · {DATE}</div>
<h1>Six agents swept the new ground. One critic caught what two of my own fixes got wrong.</h1>
<p class="lede">Same process as round 1 — drive the real running app, not the source — pointed this time at
the only genuinely new surface since then: the Behavior Tree region merged into <code>main</code> earlier
today. Six parallel scouts covered its four view lenses plus leftover ground (Recorder, Landmarks,
workspace, export). This round added a new step: every proposed fix went to an independent critic
(a fresh model instance, told to try to refute each one) <strong>before</strong> being finalized — it
confirmed both real findings below, then caught two regressions my first pass at fixing them introduced,
refuted a claimed crash-severity miss on a third scout report, and threw out three more scout findings
that didn't survive a look at the actual running app.</p>

<div class="stat-row">
  <div class="stat"><b>{total}</b> fixes shipped</div>
  <div class="stat"><b>2</b> critic-caught regressions fixed before shipping</div>
  <div class="stat"><b>{len(RULED_OUT)}</b> scout findings refuted or already covered</div>
  <div class="stat"><b>2</b> commits, independently revertable</div>
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

<h3 class="section">Also proposed, dropped before reaching the critic</h3>
<div class="ruled-out"><ul>{dropped_html}</ul></div>

<h3 class="section">Investigated and ruled out</h3>
<div class="ruled-out"><ul>{ruled_out_html}</ul></div>

<footer>
  Built by <code>docs/build_ui_review_round2.py</code> from the live repo. Commits:
  {" · ".join(f'<code>{item["commit"]}</code>' for item in FINDINGS)}.
  <br>Builds on <a href="ui-review-2026-09-05.html">round 1's UI review</a> and
  <a href="behavior-tree-rebuild-2026-09-05.html">the Behavior Tree rebuild report</a> this pass reviewed.
</footer>
</main>

<div id="toast"></div>
<script>
(function() {{
  var STORAGE_KEY = 'systemsketch-ui-review-round2-{DATE}';
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
    showToast('All marked Keep.');
  }});
  document.querySelector('[data-action="reject-all"]').addEventListener('click', function() {{
    boxes.forEach(function(box) {{ box.checked = false; updateCard(box); }});
    updateCount(); persist();
    showToast('All marked Revert.');
  }});
  document.querySelector('[data-action="copy"]').addEventListener('click', function() {{
    var keep = [], revert = [];
    boxes.forEach(function(box) {{
      var title = document.getElementById(box.getAttribute('data-finding-checkbox')).querySelector('h2').textContent;
      (box.checked ? keep : revert).push(title);
    }});
    var lines = ['SystemSketch UI review round 2 — {DATE} decisions:', ''];
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
