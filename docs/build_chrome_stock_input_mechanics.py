#!/usr/bin/env python3
"""Build the self-contained stock-tldraw chrome-input implementation gallery."""

from __future__ import annotations

import base64
import html
import json
import subprocess
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs" / "assets"
OUTPUT = ROOT / "docs" / "chrome-stock-input-mechanics-2026-09-03.html"
MEASUREMENTS = ASSETS / "chrome-stock-input-mechanics-measurements.json"
REVIEW_KEY = "systemsketch.chrome-stock-input-mechanics.review.v1"


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


def image(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


@dataclass(frozen=True)
class Surface:
    name: str
    update: str
    contract: str
    evidence: str


@dataclass(frozen=True)
class Result:
    number: int
    title: str
    detail: str
    pass_when: str
    image_name: str
    caption: str


SURFACES = [
    Surface("Shape-library search", "Already stock `TldrawUiInput`", "Transient query: selected on initial open; Escape restores/clears the query.", "Existing stock primitive retained."),
    Surface("Header filename", "Moved to `SystemSketchUiInput`", "Identity: select all, Enter or blur commits once, Escape cancels; the workspace owns the rename.", "6/6 inline rename browser checks."),
    Surface("Workspace Filter", "Moved to `SystemSketchUiInput`", "Search/action: stock selection and Escape reset; Enter opens the selected result only in Open mode.", "12/12 workspace-browser checks."),
    Surface("Rename / Save As / Export filename", "Moved to `SystemSketchUiInput`", "Dialog action: selected on entry; Enter performs the existing dialog action; Escape restores the input draft.", "9/9 safety checks and 11/11 export checks."),
    Surface("New folder name", "Moved to `SystemSketchUiInput`", "Dialog action: selected on entry; Enter creates once; Escape removes only the inline folder form.", "9/9 workspace follow-up checks."),
    Surface("Block, Branch, inspector, command, prose", "Intentionally unchanged", "Canvas editors and live inspectors own tldraw editing/undo; commands own Enter; prose owns newlines.", "Kept out of the adapter by the documented contract."),
]


RESULTS = [
    Result(
        1,
        "One adapter, stock mechanics, no duplicate commits",
        "`SystemSketchUiInput` delegates focus, auto-select, composition handling, Enter, Escape, and iOS behavior to stock `TldrawUiInput`. It adds the one application seam stock cannot infer: whether blur is a filename commit or Enter is an action. Its microtask guard coalesces tldraw's blur-before-complete ordering into one domain event.",
        "A single Enter cannot save, rename, or create twice; a blur commits only identity fields; browser console stays clean.",
        "inline-document-rename-editing.png",
        "Real browser capture: the stock-backed header field is focused with the entire previous name selected.",
    ),
    Result(
        2,
        "Workspace chrome now shares the stock input path",
        "The Open filter, Rename, Save As, Export, and New folder fields now use the adapter. Existing request, conflict, file-type, and folder containment logic remains in the workspace controller rather than moving into the UI primitive.",
        "Filter Enter still opens the selected match; a folder Enter creates once; Save As and Export keep their explicit replacement and suffix rules.",
        "workspace-browser-open.png",
        "Real browser capture: the Open workspace browser retains its familiar pathbar, Filter entry point, and keyboard flow.",
    ),
    Result(
        3,
        "A written rule prevents future one-off inputs",
        "`AGENTS.md` now names `SystemSketchUiInput` as the default for ordinary single-line chrome and records the three interaction contracts: identity, search/action, and live property. It explicitly preserves canvas editors, live inspector fields, commands, and multiline prose as exceptions.",
        "A future chrome field starts with the documented adapter and chooses a contract deliberately; a filename continues to use the digest-fenced workspace rename transaction.",
        "workspace-followup-folder-created-2026-09-02.png",
        "Real browser capture: folder creation remains an honest workspace action while inheriting stock text-entry behavior.",
    ),
]


def esc(value: str) -> str:
    return html.escape(value)


def surface_rows() -> str:
    return "".join(
        f"<tr><th>{esc(item.name)}</th><td>{esc(item.update)}</td><td>{esc(item.contract)}</td><td>{esc(item.evidence)}</td></tr>"
        for item in SURFACES
    )


def result_card(item: Result, images: dict[str, str]) -> str:
    return f"""
<article class="result" data-item="result-{item.number}">
  <div class="result-head"><span class="number">{item.number:02d}</span><h3>{esc(item.title)}</h3><span class="badge">Shipped</span></div>
  <figure><img src="{images[item.image_name]}" alt="Evidence for {esc(item.title)}"><figcaption>{esc(item.caption)}</figcaption></figure>
  <p>{esc(item.detail)}</p><p><b>Pass when.</b> {esc(item.pass_when)}</p>
  <div class="review"><input id="keep-{item.number}" type="checkbox" data-review-checkbox checked><label for="keep-{item.number}">Keep this implementation</label><textarea data-review-feedback aria-label="Feedback for {esc(item.title)}" placeholder="Feedback, concern, or follow-up…"></textarea></div>
</article>"""


def main() -> None:
    base = git("rev-parse", "HEAD")
    branch = git("branch", "--show-current") or "detached track"
    image_paths = {
        "inline-document-rename-editing.png": ASSETS / "inline-document-rename-editing.png",
        "workspace-browser-open.png": ASSETS / "workspace-browser-open.png",
        "workspace-followup-folder-created-2026-09-02.png": ASSETS / "workspace-followup-folder-created-2026-09-02.png",
    }
    images = {name: image(path) for name, path in image_paths.items()}
    measurements = {
        "date": "2026-09-03",
        "baseCommit": base,
        "branch": branch,
        "applicationChanges": [
            "src/chrome/SystemSketchUiInput.tsx",
            "src/workspace/LocalWorkspace.tsx",
            "src/workspace/local-workspace.css",
            "AGENTS.md",
        ],
        "stockFields": [
            "Shape-library search (already stock)",
            "Header filename",
            "Workspace Filter",
            "Rename / Save As / Export filenames",
            "New folder name",
        ],
        "intentionalExceptions": [
            "Canvas Block and Branch editors",
            "Live inspector fields",
            "Command palette",
            "Multiline prose",
        ],
        "focusedBrowserChecks": {
            "inlineDocumentRename": "6/6",
            "workspaceBrowser": "12/12",
            "workspaceFollowup": "9/9",
            "workspaceSafety": "9/9",
            "fileType": "13/13",
            "tldrawExport": "11/11",
            "total": "60/60",
        },
        "fullCheck": "107 Vitest files / 981 tests plus 94 Python tests",
    }
    MEASUREMENTS.write_text(json.dumps(measurements, indent=2) + "\n", encoding="utf-8")
    cards = "\n".join(result_card(item, images) for item in RESULTS)
    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Stock tldraw chrome inputs · SystemSketch · 2026-09-03</title>
<style>
:root{{--ink:#182432;--muted:#5e6b7a;--paper:#f5f7fb;--card:#fff;--line:#d8e0ea;--blue:#2478df;--blue-soft:#eaf3ff;--green:#168050;--green-soft:#e8f8ef;--shadow:0 16px 44px rgb(18 35 56 / .10)}}*{{box-sizing:border-box}}body{{margin:0;background:radial-gradient(circle at 82% -8%,#d9ebff 0,transparent 34%),var(--paper);color:var(--ink);font:15px/1.55 Inter,ui-sans-serif,system-ui,sans-serif}}main{{width:min(1240px,calc(100% - 36px));margin:auto;padding:50px 0 84px}}.eyebrow{{color:var(--blue);font:850 11px/1 ui-monospace,SFMono-Regular,monospace;letter-spacing:.13em;text-transform:uppercase}}h1{{max-width:970px;margin:14px 0;font-size:clamp(42px,6vw,74px);line-height:.98;letter-spacing:-.055em}}.lead{{max-width:840px;margin:0;color:var(--muted);font-size:19px}}.thesis{{display:grid;grid-template-columns:42px 1fr;gap:14px;align-items:start;margin:30px 0;padding:19px 20px;border:1px solid #bed8fb;border-radius:16px;background:linear-gradient(135deg,#fff,#edf6ff);box-shadow:var(--shadow)}}.mark{{display:grid;width:36px;height:36px;place-items:center;border-radius:10px;color:#fff;background:var(--blue);font-size:22px;font-weight:900}}.thesis p{{margin:0}}.metrics{{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:27px 0}}.metric{{padding:15px;border:1px solid var(--line);border-radius:14px;background:rgb(255 255 255 / .84)}}.metric b{{display:block;color:var(--green);font-size:27px;line-height:1.1}}.metric span{{color:var(--muted);font-size:10px;font-weight:850;letter-spacing:.08em;text-transform:uppercase}}h2{{margin:52px 0 14px;font-size:30px;letter-spacing:-.025em}}.subhead{{max-width:850px;margin:-6px 0 18px;color:var(--muted)}}.matrix{{overflow:auto;border:1px solid var(--line);border-radius:16px;background:var(--card);box-shadow:var(--shadow)}}table{{width:100%;border-collapse:collapse;min-width:870px}}th,td{{padding:15px;vertical-align:top;border-bottom:1px solid var(--line);text-align:left}}thead th{{color:var(--muted);background:#f7f9fc;font-size:10px;letter-spacing:.08em;text-transform:uppercase}}tbody th{{width:19%;font-size:14px}}tbody td{{color:var(--muted);font-size:13px}}tbody tr:last-child th,tbody tr:last-child td{{border-bottom:0}}.result{{margin-top:20px;padding:20px;border:1px solid var(--line);border-radius:19px;background:rgb(255 255 255 / .91);box-shadow:var(--shadow)}}.result-head{{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px}}.number{{display:grid;width:30px;height:30px;place-items:center;border-radius:9px;color:#fff;background:var(--ink);font:800 11px/1 ui-monospace,monospace}}.result h3{{margin:0 auto 0 0;font-size:21px;letter-spacing:-.017em}}.badge{{padding:4px 7px;border-radius:999px;color:var(--green);background:var(--green-soft);font-size:10px;font-weight:850;letter-spacing:.06em;text-transform:uppercase}}figure{{max-width:820px;margin:0;overflow:hidden;border:1px solid var(--line);border-radius:14px;background:#f7f9fc}}figure img{{display:block;width:100%;height:auto}}figcaption{{padding:10px 13px;color:var(--muted);font-size:12px}}.result p{{max-width:980px;margin:13px 0 0}}.review{{display:grid;grid-template-columns:auto 1fr;gap:8px 12px;align-items:start;margin-top:17px;padding-top:15px;border-top:1px solid var(--line)}}.review input{{width:18px;height:18px;margin-top:2px;accent-color:var(--green)}}.review label{{font-weight:780}}.review textarea{{grid-column:2;min-height:57px;width:100%;padding:9px;border:1px solid var(--line);border-radius:9px;font:inherit;resize:vertical}}.actions{{position:sticky;z-index:2;bottom:12px;display:flex;justify-content:flex-end;gap:8px;margin-top:27px}}button{{padding:10px 13px;border:1px solid #bbc7d5;border-radius:9px;color:var(--ink);background:#fff;box-shadow:0 8px 24px rgb(19 32 50 / .11);font:750 13px inherit;cursor:pointer}}button.primary{{border-color:var(--blue);color:#fff;background:var(--blue)}}.copy-state{{align-self:center;color:var(--green);font-size:12px;font-weight:760}}footer{{margin-top:48px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font-size:12px}}a{{color:var(--blue)}}code{{font-family:ui-monospace,SFMono-Regular,monospace}}@media(max-width:760px){{main{{width:min(100% - 20px,1240px);padding-top:28px}}h1{{font-size:43px}}.metrics{{grid-template-columns:repeat(2,1fr)}}.thesis{{grid-template-columns:1fr}}}}
</style></head><body><main>
<div class="eyebrow">SystemSketch · chrome input implementation · 2026-09-03</div>
<h1>One stock text-field path for ordinary chrome.</h1>
<p class="lead">Filename naming, workspace searching, dialog names, and folder creation now lean on tldraw's proven single-line input mechanics. Their domain operations remain where they belong: in workspace transactions, not in an input widget.</p>
<section class="thesis"><span class="mark">→</span><p><b>What changed:</b> <code>SystemSketchUiInput</code> is a thin adapter around stock <code>TldrawUiInput</code>. It converts tldraw's complete/cancel/blur signals into the field's declared contract without reimplementing selection, composition, or keyboard plumbing.</p></section>
<section class="metrics"><div class="metric"><b>5</b><span>Chrome fields on stock path</span></div><div class="metric"><b>1</b><span>Reusable adapter</span></div><div class="metric"><b>60/60</b><span>Focused browser checks</span></div><div class="metric"><b>0</b><span>Browser console errors</span></div></section>
<h2>Exact field inventory</h2><p class="subhead">This is the future-facing answer to “should this field use tldraw?”: use stock mechanics for an ordinary single-line shell field; preserve a specialized primitive when it owns another transaction.</p><div class="matrix"><table><thead><tr><th>Surface</th><th>Current path</th><th>Interaction contract</th><th>Proof</th></tr></thead><tbody>{surface_rows()}</tbody></table></div>
<h2>Implemented seams</h2><p class="subhead">The cards below are reviewable independently. Checkboxes and notes persist locally in this browser; Copy review exports your choices as Markdown.</p>{cards}
<div class="actions"><span class="copy-state" aria-live="polite"></span><button id="reset" type="button">Reset review</button><button id="copy" class="primary" type="button">Copy review</button></div>
<footer>Built from isolated track <code>{esc(branch)}</code> at <code>{esc(base)}</code>. Evidence: <a href="assets/chrome-stock-input-mechanics-measurements.json">measurement sidecar</a> · <a href="build_chrome_stock_input_mechanics.py">builder</a>.</footer>
</main><script>
const key={json.dumps(REVIEW_KEY)},cards=[...document.querySelectorAll('.result')],stateText=document.querySelector('.copy-state');
function save(){{const state={{}};for(const card of cards)state[card.dataset.item]={{keep:card.querySelector('[data-review-checkbox]').checked,feedback:card.querySelector('[data-review-feedback]').value}};localStorage.setItem(key,JSON.stringify(state))}}
function restore(){{try{{const state=JSON.parse(localStorage.getItem(key)||'{{}}');for(const card of cards){{const value=state[card.dataset.item];if(value){{card.querySelector('[data-review-checkbox]').checked=value.keep;card.querySelector('[data-review-feedback]').value=value.feedback||''}}}}}}catch{{}}}}
for(const field of document.querySelectorAll('[data-review-checkbox],[data-review-feedback]'))field.addEventListener('input',save);restore();
document.querySelector('#reset').onclick=()=>{{localStorage.removeItem(key);for(const card of cards){{card.querySelector('[data-review-checkbox]').checked=true;card.querySelector('[data-review-feedback]').value=''}}stateText.textContent='Review reset'}};
document.querySelector('#copy').onclick=async()=>{{const lines=['## Stock tldraw chrome inputs review',''];for(const card of cards){{const keep=card.querySelector('[data-review-checkbox]').checked,title=card.querySelector('h3').textContent.trim(),feedback=card.querySelector('[data-review-feedback]').value.trim();lines.push(`- [${{keep?'x':' '}}] ${{title}}`);if(feedback)lines.push(`  - Feedback: ${{feedback}}`)}}await navigator.clipboard.writeText(lines.join('\\n'));stateText.textContent='Copied Markdown'}};
</script></body></html>"""
    OUTPUT.write_text(page, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
