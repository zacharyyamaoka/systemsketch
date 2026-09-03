#!/usr/bin/env python3
"""Build the self-contained draw.io persistence-alignment review gallery."""

from __future__ import annotations

import base64
import html
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "drawio-persistence-alignment-2026-09-03.html"
SCREENSHOT = ROOT / "docs" / "assets" / "drawio-conflict-make-copy.png"

DRAWIO_DESKTOP_COMMIT = "d1fa65d804e8ddaeb4919080aff90c307c15f609"
DRAWIO_WEB_COMMIT = "074a2ea4f2be105b1fe7cae9a26ecc15761dcef6"


REVIEW_ITEMS = [
    {
        "id": "stage-readback",
        "number": "01",
        "section": "adopted",
        "label": "Keep this change",
        "title": "Verify staged bytes, with three fresh attempts",
        "summary": (
            "Each candidate is written, flushed, fsynced, and read back before it can replace "
            "the document. A mismatch discards that inode and tries again, at most three times."
        ),
        "why": (
            "This ports draw.io's mature read-after-write check without importing its in-place "
            "O_TRUNC failure mode. All failed candidates are cleaned up and the canonical file stays untouched."
        ),
        "evidence": "Python regressions prove two mismatches then success, and three mismatches with no publish or temp leak.",
        "links": [
            ("writer", "../scripts/workspace_store.py"),
            ("regressions", "../tests/test_workspace_store.py"),
        ],
    },
    {
        "id": "canonical-confirm",
        "number": "02",
        "section": "adopted",
        "label": "Keep this change",
        "title": "Confirm the published canonical revision",
        "summary": (
            "After atomic replace and directory fsync, the server rereads the path and returns metadata "
            "from those confirmed bytes—not from the pre-publish string."
        ),
        "why": (
            "An external tool does not honor SystemSketch's advisory lock. If it wins immediately after "
            "publication, SystemSketch reports its digest as a conflict instead of blindly overwriting it."
        ),
        "evidence": "Tests assert a second canonical identity read and preserve an externally replaced revision.",
        "links": [("transaction", "../scripts/workspace_store.py"), ("tests", "../tests/test_workspace_store.py")],
    },
    {
        "id": "idempotent-replay",
        "number": "03",
        "section": "adopted",
        "label": "Keep this change",
        "title": "Treat an exact lost-response replay as success",
        "summary": (
            "When a timed-out request is retried with its old base digest, exact equality between disk and "
            "the desired normalized bytes proves the first request already committed."
        ),
        "why": (
            "draw.io's Electron callback does not have SystemSketch's bounded HTTP response-loss window. "
            "Without this adaptation, a successful save can return later as a false conflict."
        ),
        "evidence": "The replay regression checks identical metadata, inode, mtime, and zero temp files.",
        "links": [("idempotent branch", "../scripts/workspace_store.py"), ("test", "../tests/test_workspace_store.py")],
    },
    {
        "id": "mode-preservation",
        "number": "04",
        "section": "adopted",
        "label": "Keep this change",
        "title": "Preserve safe POSIX group ownership and modes",
        "summary": (
            "Before ordinary user/group/other rwx modes are applied, atomic replacement attempts to give the staged "
            "inode the existing document's GID. Setuid, setgid, and sticky bits are never copied; a genuinely new "
            "document retains mkstemp's private 0600 default."
        ),
        "why": (
            "Applying GID first matters because chown may clear permission bits. If the original GID cannot be "
            "established, group rwx bits are stripped rather than granting them to the wrong principals. This avoids "
            "both silently privatizing a shared file and leaking its group access."
        ),
        "evidence": (
            "Regressions cover 0640 preservation, alternate-GID 0660 preservation, failed-GID fallback to 0600, "
            "06755 becoming ordinary 0755, and a new file remaining 0600."
        ),
        "links": [("mode seam", "../scripts/workspace_store.py"), ("test", "../tests/test_workspace_store.py")],
    },
    {
        "id": "max-autosave",
        "number": "05",
        "section": "adopted",
        "label": "Keep this change",
        "title": "Cap continuous autosave deferral at 30 seconds",
        "summary": (
            "Nearby changes still coalesce behind SystemSketch's 600 ms debounce, but the first unsaved edit "
            "starts a 30-second deadline that later edits cannot move."
        ),
        "why": (
            "draw.io couples idle autosave with a maximum delay. The same bound prevents a long drag or continuous "
            "stream of edits from leaving the only current revision in memory indefinitely."
        ),
        "evidence": "Pure model tests cover first edit, near-deadline, and expired-deadline scheduling.",
        "links": [("scheduler", "../src/workspace/workspaceModel.ts"), ("integration", "../src/workspace/LocalWorkspace.tsx"), ("tests", "../src/workspace/workspaceModel.test.ts")],
    },
    {
        "id": "make-copy",
        "number": "06",
        "section": "adopted",
        "label": "Keep this change",
        "title": "Put preserve-both directly in the conflict alert",
        "summary": (
            "A digest conflict now offers Use disk version, Save my version as…, and the explicitly destructive "
            "Overwrite disk version. The safe copy action is visually primary."
        ),
        "why": (
            "This adopts draw.io's Make Copy product invariant: preserving both revisions is a named recovery path, "
            "not a capability the person must remember exists elsewhere."
        ),
        "evidence": "The browser journey leaves the external bytes exact and saves the local canvas revision under a new path.",
        "links": [("conflict actions", "../src/workspace/LocalWorkspace.tsx"), ("browser proof", "../tests/drawio_persistence_alignment_smoke.mjs")],
    },
    {
        "id": "copy-navigation",
        "number": "07",
        "section": "adopted",
        "label": "Keep this change",
        "title": "Switch live file identity without losing newer edits",
        "summary": (
            "Save As captures an edit epoch and its exact snapshot. When accepted, that snapshot becomes the source, "
            "digest, and fingerprint base at the new path; an edit from a later epoch remains dirty and gets a "
            "follow-up autosave against that new identity."
        ),
        "why": (
            "An ordinary copy now updates browser history without reloading the mounted editor, so an edit made while "
            "Make Copy is in flight cannot disappear. A quarantined recovery copy may still reload once to leave its "
            "protected bootstrap state safely."
        ),
        "evidence": (
            "The browser pauses Make Copy, edits the live canvas, accepts the first snapshot as the new base, and then "
            "observes the later edit autosave to “Contested local copy” while the external original remains exact."
        ),
        "links": [("save-as transition", "../src/workspace/LocalWorkspace.tsx"), ("journey", "../tests/drawio_persistence_alignment_smoke.mjs")],
    },
    {
        "id": "storage-503",
        "number": "08",
        "section": "adopted",
        "label": "Keep this change",
        "title": "Route transient storage failures to the retry lane",
        "summary": (
            "Operational storage and OS errors return 503; revision, path, format, and payload errors remain semantic "
            "409 responses and do not retry."
        ),
        "why": (
            "The accepted autosave retry policy only retries transport and 5xx failures. Classifying every filesystem "
            "fault as 409 made that recovery path unreachable in the cases it was built for."
        ),
        "evidence": "Server classification tests enumerate retryable storage/OS faults and non-retryable semantic faults.",
        "links": [("HTTP classification", "../scripts/server.py"), ("test", "../tests/test_release_system.py")],
    },
    {
        "id": "delayed-write-proof",
        "number": "09",
        "section": "adopted",
        "label": "Keep this proof",
        "title": "Exercise conflict and three asynchronous races in a real browser",
        "summary": (
            "The CDP journey creates an exact-byte conflict, edits during Make Copy, edits during an ordinary paused "
            "save, then loses both committed response B and the first exact B/A replay response after authoring C. "
            "It waits through the resulting 3-second retry backoff and proves the next B/A acknowledgement advances "
            "the base before newer C/B is written."
        ),
        "why": (
            "draw.io's shadow-modified pattern is only meaningful when the actual asynchronous boundary is exercised. "
            "The 1.5-second disk watcher observes committed B during that longer backoff, but must defer to the pending "
            "exact replay; treating B as external, or sending newer C against old base A, would manufacture a conflict "
            "with SystemSketch's own successful write."
        ),
        "evidence": (
            "The green browser run remains in error—not conflict—after the watcher interval, then reaches clean only "
            "after exact B/A replay and C/B both complete. It verifies every final record on disk and fails on unexpected "
            "console errors. The full check is also green: 96 files / 830 TypeScript tests plus 92 Python tests."
        ),
        "links": [("browser journey", "../tests/drawio_persistence_alignment_smoke.mjs"), ("npm entry", "../package.json")],
    },
    {
        "id": "digest-polling",
        "number": "10",
        "section": "kept",
        "label": "Agree with this divergence",
        "title": "Keep exact-digest, single-flight polling",
        "summary": (
            "SystemSketch keeps bounded stat/read polling with a raw SHA-256 identity instead of adopting "
            "draw.io's fs.watchFile + mtime gate + semantic page checksum."
        ),
        "why": (
            "The current path catches same-size, same-mtime, formatting-only, replacement, and deletion changes. "
            "Its single-flight fence also avoids overlapping requests; switching APIs would reduce evidence, not add robustness."
        ),
        "evidence": "Existing regressions cover exact-byte identity and reload fencing across asynchronous reads.",
        "links": [("watch path", "../src/workspace/LocalWorkspace.tsx"), ("digest identity", "../scripts/workspace_store.py")],
    },
    {
        "id": "atomic-not-truncate",
        "number": "11",
        "section": "kept",
        "label": "Agree with this divergence",
        "title": "Keep atomic replace; do not port O_TRUNC",
        "summary": (
            "SystemSketch keeps temp-file publication, a cross-process advisory lock, digest CAS, and directory fsync "
            "instead of draw.io's direct canonical open with O_TRUNC and mtime-only precondition."
        ),
        "why": (
            "Stable and Preview are independent writers. Literal adoption would reintroduce partial canonical files and "
            "a check/write race that the current transaction already closes."
        ),
        "evidence": "Contention tests admit exactly one same-base winner; failure-before-replace leaves canonical bytes intact.",
        "links": [("transaction", "../scripts/workspace_store.py"), ("contention tests", "../tests/test_workspace_store.py")],
    },
    {
        "id": "backup-recovery",
        "number": "12",
        "section": "deferred",
        "label": "Agree with this deferral",
        "title": "Add sibling backup only with a recovery surface",
        "summary": (
            "draw.io writes a sibling .$name.bkp and has startup recovery behavior. SystemSketch does not create a hidden "
            "backup that its product cannot discover, explain, open, or retire."
        ),
        "why": (
            "Atomic publication already removes the backup's main interrupted-write job. A prior-valid-version safety net "
            "still has value, but it should arrive as one bounded backup + detection + recover-as-copy + cleanup system."
        ),
        "evidence": "Deferred as a complete user-facing slice; no invisible workspace/Git litter is introduced in this change.",
        "links": [("draw.io recovery source", f"https://github.com/jgraph/drawio/blob/{DRAWIO_WEB_COMMIT}/src/main/webapp/js/diagramly/ElectronApp.js#L1570-L1598")],
    },
    {
        "id": "record-merge",
        "number": "13",
        "section": "deferred",
        "label": "Agree with this deferral",
        "title": "Do not copy draw.io's XML merge into tldraw records",
        "summary": (
            "The conflict alert preserves both versions now, but it does not expose Merge until SystemSketch has explicit "
            "record-level rules for shapes, bindings, pages, deletions, and app-owned metadata."
        ),
        "why": (
            "draw.io's merge is coupled to mxGraph/XML page semantics. Reusing the label with a generic JSON merge could "
            "produce a schema-valid but visually or semantically wrong board."
        ),
        "evidence": "Preserve-both is the safe current primitive; merge remains a separately designable domain operation.",
        "links": [("draw.io conflict source", f"https://github.com/jgraph/drawio/blob/{DRAWIO_WEB_COMMIT}/src/main/webapp/js/diagramly/DrawioFile.js#L2280-L2380")],
    },
]


def escape(value: object) -> str:
    return html.escape(str(value), quote=True)


def link_list(links: list[tuple[str, str]]) -> str:
    return " · ".join(
        f'<a href="{escape(href)}">{escape(label)}</a>' for label, href in links
    )


def review_card(item: dict[str, object]) -> str:
    section = str(item["section"])
    return f"""
      <article class="review-card {escape(section)}" data-review-id="{escape(item['id'])}" data-section="{escape(section)}">
        <div class="review-number">#{escape(item['number'])}</div>
        <div class="review-main">
          <div class="review-heading">
            <div>
              <span class="pill {escape(section)}">{escape(section)}</span>
              <h3>{escape(item['title'])}</h3>
            </div>
            <label class="decision">
              <input type="checkbox" data-decision>
              <span>{escape(item['label'])}</span>
            </label>
          </div>
          <p class="summary">{escape(item['summary'])}</p>
          <div class="why"><strong>Why</strong><span>{escape(item['why'])}</span></div>
          <div class="evidence"><strong>Evidence</strong><span>{escape(item['evidence'])}</span></div>
          <div class="source-links">{link_list(item['links'])}</div>
          <label class="feedback-label" for="feedback-{escape(item['id'])}">Feedback for #{escape(item['number'])}</label>
          <textarea id="feedback-{escape(item['id'])}" data-feedback rows="2" placeholder="Optional: what should change before you accept this?"></textarea>
        </div>
      </article>
    """


def screenshot_data_url() -> str | None:
    if not SCREENSHOT.exists():
        return None
    return "data:image/png;base64," + base64.b64encode(SCREENSHOT.read_bytes()).decode("ascii")


def build() -> str:
    cards = "\n".join(review_card(item) for item in REVIEW_ITEMS)
    screenshot = screenshot_data_url()
    screenshot_markup = (
        f"""
        <figure class="screenshot-card">
          <img src="{screenshot}" alt="SystemSketch conflict alert and preserve-version Save As dialog in the real browser">
          <figcaption>
            <strong>Real browser evidence.</strong> The contested file stays byte-for-byte external while
            <em>Save my version as…</em> defaults to <em>Contested local copy</em> and retains the local shape.
          </figcaption>
        </figure>
        """
        if screenshot
        else "<p class=\"missing-shot\">Screenshot is generated by <code>npm run test:drawio-alignment</code>.</p>"
    )
    data = json.dumps(
        [
            {
                "id": item["id"],
                "number": item["number"],
                "title": item["title"],
                "section": item["section"],
            }
            for item in REVIEW_ITEMS
        ]
    )
    document = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SystemSketch × draw.io persistence alignment</title>
  <style>
    :root {{
      color-scheme: light;
      --ink: #182024;
      --muted: #617077;
      --paper: #f5f2eb;
      --card: #fffef9;
      --line: #d9d6cd;
      --navy: #173f52;
      --blue: #276783;
      --green: #17705a;
      --green-soft: #dff2e9;
      --amber: #a45e08;
      --amber-soft: #fff0d3;
      --violet: #6d4d92;
      --violet-soft: #eee5f7;
      --shadow: 0 18px 48px rgba(40, 44, 38, .09);
    }}
    * {{ box-sizing: border-box; }}
    html {{ scroll-behavior: smooth; }}
    body {{
      margin: 0;
      color: var(--ink);
      background:
        radial-gradient(circle at 5% 0%, rgba(39,103,131,.13), transparent 28rem),
        radial-gradient(circle at 92% 4%, rgba(23,112,90,.10), transparent 31rem),
        var(--paper);
      font: 15px/1.55 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }}
    a {{ color: var(--blue); text-underline-offset: 3px; }}
    button, input, textarea {{ font: inherit; }}
    .shell {{ width: min(1180px, calc(100% - 32px)); margin: 0 auto; }}
    .hero {{ padding: 68px 0 34px; }}
    .eyebrow {{
      display: inline-flex; gap: 8px; align-items: center; margin-bottom: 18px;
      color: var(--green); font-size: 12px; font-weight: 800; letter-spacing: .11em; text-transform: uppercase;
    }}
    .eyebrow::before {{ content: ""; width: 24px; height: 2px; background: currentColor; }}
    h1 {{ margin: 0; max-width: 970px; font-size: clamp(38px, 7vw, 78px); line-height: .98; letter-spacing: -.055em; }}
    .hero-copy {{ max-width: 850px; margin: 24px 0 0; font-size: clamp(18px, 2.2vw, 24px); line-height: 1.42; color: #39484e; }}
    .verdict {{
      margin-top: 32px; padding: 20px 22px; border: 1px solid #bed8ca; border-left: 5px solid var(--green);
      border-radius: 14px; background: rgba(255,254,249,.82); box-shadow: var(--shadow);
    }}
    .verdict strong {{ display: block; margin-bottom: 4px; color: var(--green); font-size: 12px; letter-spacing: .09em; text-transform: uppercase; }}
    .verdict span {{ font-size: 20px; font-weight: 760; }}
    .meta-row {{ display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; color: var(--muted); font-size: 13px; }}
    .meta-row span {{ padding: 5px 9px; border: 1px solid var(--line); border-radius: 999px; background: rgba(255,255,255,.55); }}
    .review-bar {{
      position: sticky; top: 10px; z-index: 20; display: grid; grid-template-columns: 1fr auto; gap: 14px;
      align-items: center; margin: 12px auto 44px; padding: 13px 14px 13px 18px; border: 1px solid rgba(23,63,82,.2);
      border-radius: 16px; background: rgba(255,254,249,.94); box-shadow: 0 12px 35px rgba(25,45,50,.14); backdrop-filter: blur(14px);
    }}
    .progress {{ min-width: 0; }}
    .progress-line {{ display: flex; justify-content: space-between; gap: 12px; font-size: 13px; font-weight: 750; }}
    .track {{ height: 6px; margin-top: 8px; overflow: hidden; border-radius: 99px; background: #e4e2da; }}
    .track > i {{ display: block; width: 0; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--blue), var(--green)); transition: width .2s; }}
    .review-actions {{ display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 7px; }}
    button {{
      border: 1px solid #b9c0c1; border-radius: 9px; padding: 8px 11px; color: var(--ink); background: #fff;
      cursor: pointer; font-weight: 700;
    }}
    button:hover {{ border-color: var(--blue); }}
    button.primary {{ border-color: var(--navy); color: #fff; background: var(--navy); }}
    section {{ margin: 0 0 56px; }}
    .section-head {{ display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 20px; align-items: end; margin-bottom: 18px; }}
    h2 {{ margin: 0; font-size: clamp(26px, 4vw, 42px); line-height: 1.08; letter-spacing: -.035em; }}
    .section-head p {{ max-width: 640px; margin: 10px 0 0; color: var(--muted); }}
    .section-index {{ color: #a7aba7; font: 700 38px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }}
    .architecture {{
      display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 9px; margin-top: 20px; padding: 18px;
      border: 1px solid var(--line); border-radius: 18px; background: var(--card); box-shadow: var(--shadow);
    }}
    .node {{ position: relative; min-height: 112px; padding: 13px; border: 1px solid #d7dcd9; border-radius: 11px; background: #fafaf5; }}
    .node:not(:last-child)::after {{ content: "→"; position: absolute; right: -13px; top: 39px; z-index: 2; color: var(--blue); font-weight: 900; }}
    .node b {{ display: block; margin-bottom: 7px; font-size: 13px; line-height: 1.25; }}
    .node span {{ color: var(--muted); font-size: 12px; line-height: 1.35; }}
    .node.drawio {{ border-color: #e8c890; background: #fff9ec; }}
    .node.system {{ border-color: #a8d1c3; background: #f0faf6; }}
    .mapping-wrap {{ overflow-x: auto; border: 1px solid var(--line); border-radius: 16px; background: var(--card); box-shadow: var(--shadow); }}
    table {{ width: 100%; min-width: 820px; border-collapse: collapse; }}
    th, td {{ padding: 14px 16px; text-align: left; vertical-align: top; border-bottom: 1px solid #e8e5dd; }}
    th {{ color: var(--muted); background: #f4f3ed; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }}
    tr:last-child td {{ border-bottom: 0; }}
    td:first-child {{ width: 15%; font-weight: 780; }}
    td:last-child {{ width: 19%; }}
    .map-verdict {{ display: inline-block; padding: 3px 8px; border-radius: 99px; font-size: 11px; font-weight: 800; }}
    .map-verdict.adopt {{ color: var(--green); background: var(--green-soft); }}
    .map-verdict.keep {{ color: var(--blue); background: #dfeff5; }}
    .map-verdict.defer {{ color: var(--violet); background: var(--violet-soft); }}
    .provenance {{ display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }}
    .source-card {{ padding: 19px; border: 1px solid var(--line); border-radius: 14px; background: var(--card); }}
    .source-card h3 {{ margin: 0 0 8px; font-size: 17px; }}
    .source-card p {{ margin: 8px 0; color: var(--muted); }}
    .commit {{ overflow-wrap: anywhere; color: #3e5056; font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; }}
    .license-note {{ grid-column: 1 / -1; padding: 18px 20px; border-left: 4px solid var(--amber); border-radius: 10px; background: var(--amber-soft); }}
    .license-note strong {{ display: block; margin-bottom: 4px; }}
    .screenshot-card {{ margin: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 18px; background: var(--card); box-shadow: var(--shadow); }}
    .screenshot-card img {{ display: block; width: 100%; height: auto; background: #e8e7e2; }}
    .screenshot-card figcaption {{ padding: 14px 18px 16px; color: var(--muted); }}
    .missing-shot {{ padding: 24px; border: 1px dashed var(--line); border-radius: 14px; background: var(--card); }}
    .review-group {{ display: grid; gap: 12px; }}
    .review-card {{
      display: grid; grid-template-columns: 62px minmax(0, 1fr); gap: 16px; padding: 20px; border: 1px solid var(--line);
      border-radius: 16px; background: var(--card); box-shadow: 0 6px 24px rgba(40,44,38,.05); transition: border-color .18s, transform .18s;
    }}
    .review-card:has([data-decision]:checked) {{ border-color: #79af9c; }}
    .review-number {{ color: #9ba19f; font: 760 17px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; }}
    .review-heading {{ display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }}
    .review-heading h3 {{ margin: 5px 0 0; font-size: 21px; line-height: 1.18; letter-spacing: -.02em; }}
    .pill {{ display: inline-block; padding: 2px 7px; border-radius: 99px; font-size: 10px; font-weight: 850; letter-spacing: .08em; text-transform: uppercase; }}
    .pill.adopted {{ color: var(--green); background: var(--green-soft); }}
    .pill.kept {{ color: var(--blue); background: #dfeff5; }}
    .pill.deferred {{ color: var(--violet); background: var(--violet-soft); }}
    .decision {{
      display: inline-flex; flex: 0 0 auto; align-items: center; gap: 8px; padding: 8px 10px; border: 1px solid #c9cfcb;
      border-radius: 10px; background: #fff; cursor: pointer; font-size: 12px; font-weight: 780;
    }}
    .decision:has(input:checked) {{ color: #fff; border-color: var(--green); background: var(--green); }}
    .decision input {{ width: 16px; height: 16px; margin: 0; accent-color: var(--green); }}
    .summary {{ margin: 13px 0; font-size: 16px; }}
    .why, .evidence {{ display: grid; grid-template-columns: 70px minmax(0, 1fr); gap: 9px; margin: 8px 0; color: var(--muted); }}
    .why strong, .evidence strong {{ color: var(--ink); font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }}
    .source-links {{ margin: 12px 0; font-size: 13px; }}
    .feedback-label {{ display: block; margin: 16px 0 6px; color: var(--muted); font-size: 12px; font-weight: 750; }}
    textarea {{ width: 100%; resize: vertical; min-height: 58px; padding: 10px 11px; border: 1px solid #cdd1cd; border-radius: 9px; color: var(--ink); background: #fff; }}
    textarea:focus, button:focus-visible, input:focus-visible {{ outline: 3px solid rgba(39,103,131,.28); outline-offset: 2px; }}
    .decision-output {{ display: none; margin-top: 14px; }}
    .decision-output.visible {{ display: block; }}
    .decision-output textarea {{ min-height: 260px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }}
    footer.page-footer {{ padding: 18px 0 70px; color: var(--muted); font-size: 13px; }}
    @media (max-width: 920px) {{
      .architecture {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }}
      .node:not(:last-child)::after {{ display: none; }}
      .provenance {{ grid-template-columns: 1fr; }}
      .license-note {{ grid-column: auto; }}
      .review-bar {{ position: static; grid-template-columns: 1fr; }}
      .review-actions {{ justify-content: flex-start; }}
    }}
    @media (max-width: 650px) {{
      .shell {{ width: min(100% - 20px, 1180px); }}
      .hero {{ padding-top: 40px; }}
      .architecture {{ grid-template-columns: 1fr; }}
      .review-card {{ grid-template-columns: 1fr; padding: 16px; }}
      .review-heading {{ display: block; }}
      .decision {{ margin-top: 13px; }}
      .why, .evidence {{ grid-template-columns: 1fr; gap: 2px; }}
      .section-index {{ display: none; }}
    }}
  </style>
</head>
<body>
  <header class="hero shell">
    <div class="eyebrow">Architecture alignment · 03 Sep 2026</div>
    <h1>Use draw.io's scars.<br>Keep SystemSketch's stronger transaction.</h1>
    <p class="hero-copy">
      The right architecture is <strong>draw.io recovery/product invariants + SystemSketch stronger transaction core</strong>.
      The current draw.io release is the behavioral reference; its Electron, mxGraph/XML, mtime, and in-place-write details
      are not copied across boundaries where they would weaken this app.
    </p>
    <div class="verdict">
      <strong>Architecture verdict</strong>
      <span>Adapt the proven failure-handling rules. Preserve digest CAS, cross-process locking, and atomic publication.</span>
    </div>
    <div class="meta-row">
      <span>13 independently reviewable decisions</span><span>9 implemented/proof items</span><span>2 intentional divergences</span><span>2 bounded deferrals</span><span>96 files · 830 TS + 92 Python tests green</span><span>browser journey green</span><span>file:// ready</span>
    </div>
  </header>

  <div class="review-bar shell" aria-label="Review controls">
    <div class="progress">
      <div class="progress-line"><span id="progress-label">0 of 13 decisions confirmed</span><span id="progress-percent">0%</span></div>
      <div class="track" aria-hidden="true"><i id="progress-fill"></i></div>
    </div>
    <div class="review-actions">
      <button type="button" id="accept-implemented">Accept implemented</button>
      <button type="button" id="clear-decisions">Clear</button>
      <button type="button" class="primary" id="copy-decisions">Copy Markdown decisions</button>
      <button type="button" id="download-decisions">Download .md</button>
    </div>
    <div class="decision-output" id="decision-output">
      <label class="feedback-label" for="decision-markdown">Decision packet</label>
      <textarea id="decision-markdown" readonly></textarea>
    </div>
  </div>

  <main class="shell">
    <section id="architecture">
      <div class="section-head"><div><h2>The resulting save path</h2><p>One narrow transaction, with draw.io's readback discipline moved to the safe side of publication.</p></div><div class="section-index">01</div></div>
      <div class="architecture" aria-label="Persistence transaction flow">
        <div class="node drawio"><b>1 · Bound deferral</b><span>600 ms quiet period<br>30 s hard ceiling</span></div>
        <div class="node system"><b>2 · Desired bytes</b><span>Normalize once<br>compute SHA-256</span></div>
        <div class="node drawio"><b>3 · Verify stage</b><span>write + fsync + reread<br>three fresh attempts</span></div>
        <div class="node system"><b>4 · Fence revision</b><span>cross-process lock<br>exact digest CAS</span></div>
        <div class="node system"><b>5 · Publish</b><span>GID first + safe rwx<br>atomic replace + dir fsync</span></div>
        <div class="node drawio"><b>6 · Confirm</b><span>reread canonical bytes<br>never blind-retry conflict</span></div>
        <div class="node drawio"><b>7 · Recover</b><span>exact replay → success<br>conflict → preserve both</span></div>
      </div>
    </section>

    <section id="mapping">
      <div class="section-head"><div><h2>Exact architectural mapping</h2><p>“Copy draw.io” means matching mature invariants, with every boundary-specific difference made explicit.</p></div><div class="section-index">02</div></div>
      <div class="mapping-wrap">
        <table>
          <thead><tr><th>Concern</th><th>draw.io 31.4.2</th><th>SystemSketch after this change</th><th>Verdict</th></tr></thead>
          <tbody>
            <tr><td>Write integrity</td><td>O_SYNC/O_TRUNC canonical write, fsync, full reread, up to 3 tries</td><td>Fresh temp write, fsync, full reread, up to 3 tries; only verified bytes may publish</td><td><span class="map-verdict adopt">Adopt invariant</span></td></tr>
            <tr><td>Concurrency</td><td>mtime precondition before write</td><td>SHA-256 CAS inside a cross-process path lock</td><td><span class="map-verdict keep">Keep stronger core</span></td></tr>
            <tr><td>Publication</td><td>Canonical file truncated in place</td><td>GID-first, special-bit-stripping mode preservation + atomic replace + directory fsync</td><td><span class="map-verdict keep">Keep stronger core</span></td></tr>
            <tr><td>Post-write</td><td>Read canonical bytes and retry mismatches</td><td>Confirm canonical once; report an external winner rather than overwrite it</td><td><span class="map-verdict adopt">Adapt invariant</span></td></tr>
            <tr><td>Edits in flight</td><td><code>savingFile</code> + <code>shadowModified</code></td><td>single-flight save + change epoch + complete follow-up revision</td><td><span class="map-verdict adopt">Equivalent invariant</span></td></tr>
            <tr><td>Autosave</td><td>Idle delay plus 30 s maximum delay</td><td>600 ms idle debounce plus 30 s maximum deferral</td><td><span class="map-verdict adopt">Adopt ceiling</span></td></tr>
            <tr><td>Monitoring</td><td><code>fs.watchFile</code>, mtime, size, semantic page checksum</td><td>Single-flight bounded poll with exact-byte digest identity</td><td><span class="map-verdict keep">Keep broader detection</span></td></tr>
            <tr><td>Conflict recovery</td><td>Make Copy / Merge / Overwrite / Cancel</td><td>Use disk / Save my version as… / Overwrite disk; merge deferred</td><td><span class="map-verdict adopt">Adopt preserve-both</span></td></tr>
            <tr><td>Backups</td><td>Sibling <code>.$name.bkp</code> plus recovery behavior</td><td>No hidden orphan; backup deferred until detection/recovery/cleanup ship together</td><td><span class="map-verdict defer">Defer complete slice</span></td></tr>
            <tr><td>Transport</td><td>Electron IPC callback</td><td>Bounded HTTP; frozen B/A replay precedes newer C/B; storage faults are 503</td><td><span class="map-verdict adopt">Boundary adaptation</span></td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section id="provenance">
      <div class="section-head"><div><h2>Pinned upstream, not folklore</h2><p>Every comparison points at immutable source snapshots so later draw.io changes cannot silently rewrite this decision.</p></div><div class="section-index">03</div></div>
      <div class="provenance">
        <article class="source-card">
          <h3>drawio-desktop · Electron file boundary</h3>
          <div class="commit">{DRAWIO_DESKTOP_COMMIT}</div>
          <p><a href="https://github.com/jgraph/drawio-desktop/blob/{DRAWIO_DESKTOP_COMMIT}/src/main/electron.js#L3435-L3579">saveFile: precondition, backup, O_SYNC/O_TRUNC, fsync, readback retry</a></p>
          <p><a href="https://github.com/jgraph/drawio-desktop/commit/{DRAWIO_DESKTOP_COMMIT}">exact reviewed commit</a> · <a href="https://github.com/jgraph/drawio-desktop/blob/{DRAWIO_DESKTOP_COMMIT}/LICENSE">Apache-2.0 license</a></p>
        </article>
        <article class="source-card">
          <h3>drawio · renderer persistence behavior</h3>
          <div class="commit">{DRAWIO_WEB_COMMIT}</div>
          <p><a href="https://github.com/jgraph/drawio/blob/{DRAWIO_WEB_COMMIT}/src/main/webapp/js/diagramly/ElectronApp.js#L1025-L1152">watcher and checksum</a> · <a href="https://github.com/jgraph/drawio/blob/{DRAWIO_WEB_COMMIT}/src/main/webapp/js/diagramly/ElectronApp.js#L1760-L1875">save while edits continue</a></p>
          <p><a href="https://github.com/jgraph/drawio/blob/{DRAWIO_WEB_COMMIT}/src/main/webapp/js/diagramly/DrawioFile.js#L2280-L2380">conflict recovery choices</a> · <a href="https://github.com/jgraph/drawio/blob/{DRAWIO_WEB_COMMIT}/LICENSE">Apache-2.0 license</a></p>
        </article>
        <div class="license-note">
          <strong>No literal draw.io source expression was copied.</strong>
          The algorithms and product invariants were adapted and precisely attributed. Substantial source copying would
          require preserving the applicable Apache notices, and it would also pull callback-heavy Electron code,
          mxGraph/XML assumptions, mtime identity, and O_TRUNC publication into the wrong Python/React/tldraw seams.
          This report is an engineering provenance record, not a legal opinion.
        </div>
      </div>
    </section>

    <section id="evidence">
      <div class="section-head"><div><h2>Preserve-both, exercised</h2><p>The visual is embedded as base64. This report needs no local server, fonts, scripts, or adjacent image files.</p></div><div class="section-index">04</div></div>
      {screenshot_markup}
    </section>

    <section id="review">
      <div class="section-head"><div><h2>Confirm each decision independently</h2><p>Checks and feedback stay in this browser via localStorage. The toolbar produces a Markdown packet you can paste directly back into Codex.</p></div><div class="section-index">05</div></div>
      <div class="review-group">
        {cards}
      </div>
    </section>
  </main>

  <footer class="page-footer shell">
    Generated from the live SystemSketch worktree by <code>docs/build_drawio_persistence_alignment.py</code>.
    Static artifact: <code>docs/drawio-persistence-alignment-2026-09-03.html</code>.
  </footer>

  <script>
    const items = {data};
    const storageKey = 'systemsketch:drawio-persistence-alignment:v1';
    const cards = [...document.querySelectorAll('[data-review-id]')];
    const outputBox = document.getElementById('decision-output');
    const output = document.getElementById('decision-markdown');

    function readState() {{
      try {{ return JSON.parse(localStorage.getItem(storageKey) || '{{}}'); }} catch {{ return {{}}; }}
    }}

    function writeState() {{
      const state = {{}};
      cards.forEach((card) => {{
        state[card.dataset.reviewId] = {{
          accepted: card.querySelector('[data-decision]').checked,
          feedback: card.querySelector('[data-feedback]').value,
        }};
      }});
      try {{ localStorage.setItem(storageKey, JSON.stringify(state)); }} catch {{}}
      updateProgress();
    }}

    function restoreState() {{
      const state = readState();
      cards.forEach((card) => {{
        const saved = state[card.dataset.reviewId];
        if (!saved) return;
        card.querySelector('[data-decision]').checked = Boolean(saved.accepted);
        card.querySelector('[data-feedback]').value = saved.feedback || '';
      }});
      updateProgress();
    }}

    function updateProgress() {{
      const confirmed = cards.filter((card) => card.querySelector('[data-decision]').checked).length;
      const percent = Math.round(confirmed / cards.length * 100);
      document.getElementById('progress-label').textContent = `${{confirmed}} of ${{cards.length}} decisions confirmed`;
      document.getElementById('progress-percent').textContent = `${{percent}}%`;
      document.getElementById('progress-fill').style.width = `${{percent}}%`;
    }}

    function markdownPacket() {{
      const lines = [
        '# SystemSketch × draw.io persistence alignment review',
        '',
        'Architecture: draw.io recovery/product invariants + SystemSketch stronger transaction core',
        '',
      ];
      for (const item of items) {{
        const card = document.querySelector(`[data-review-id="${{item.id}}"]`);
        const checked = card.querySelector('[data-decision]').checked;
        const feedback = card.querySelector('[data-feedback]').value.trim();
        lines.push(`- [${{checked ? 'x' : ' '}}] #${{item.number}} ${{item.title}}`);
        if (feedback) lines.push(`  - Feedback: ${{feedback.replace(/\\n/g, '\\n    ')}}`);
      }}
      return lines.join('\\n') + '\\n';
    }}

    function showPacket() {{
      output.value = markdownPacket();
      outputBox.classList.add('visible');
    }}

    async function copyPacket() {{
      showPacket();
      let copied = false;
      try {{ await navigator.clipboard.writeText(output.value); copied = true; }} catch {{}}
      if (!copied) {{
        output.focus(); output.select();
        try {{ copied = document.execCommand('copy'); }} catch {{}}
      }}
      const button = document.getElementById('copy-decisions');
      const previous = button.textContent;
      button.textContent = copied ? 'Copied' : 'Select and copy below';
      setTimeout(() => {{ button.textContent = previous; }}, 1600);
    }}

    cards.forEach((card) => card.addEventListener('input', writeState));
    document.getElementById('accept-implemented').addEventListener('click', () => {{
      cards.filter((card) => card.dataset.section === 'adopted').forEach((card) => {{
        card.querySelector('[data-decision]').checked = true;
      }});
      writeState();
    }});
    document.getElementById('clear-decisions').addEventListener('click', () => {{
      cards.forEach((card) => {{ card.querySelector('[data-decision]').checked = false; card.querySelector('[data-feedback]').value = ''; }});
      writeState();
      outputBox.classList.remove('visible');
    }});
    document.getElementById('copy-decisions').addEventListener('click', copyPacket);
    document.getElementById('download-decisions').addEventListener('click', () => {{
      const blob = new Blob([markdownPacket()], {{ type: 'text/markdown' }});
      const href = URL.createObjectURL(blob);
      const anchor = Object.assign(document.createElement('a'), {{ href, download: 'systemsketch-drawio-alignment-review.md' }});
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(href), 0);
    }});
    restoreState();
  </script>
</body>
</html>
"""
    # Keep the generated artifact reviewable with ordinary Git whitespace
    # checks even when indented triple-quoted fragments contribute blank lines.
    return "\n".join(line.rstrip() for line in document.splitlines()) + "\n"


def main() -> None:
    OUTPUT.write_text(build(), encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
