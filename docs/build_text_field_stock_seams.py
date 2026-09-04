#!/usr/bin/env python3
"""Build the self-contained text-field / stock-tldraw UX seam review."""

from __future__ import annotations

import base64
import html
import json
import subprocess
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs" / "assets"
OUTPUT = ROOT / "docs" / "text-field-stock-seams-2026-09-03.html"
MEASUREMENTS = ASSETS / "text-field-stock-seams-measurements.json"
REVIEW_KEY = "systemsketch.text-field-stock-seams.review.v1"


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


def image(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


@dataclass(frozen=True)
class Surface:
    name: str
    owner: str
    observed: str
    interaction: str
    direction: str


@dataclass(frozen=True)
class Recommendation:
    number: int
    title: str
    priority: str
    status: str
    evidence: str
    recommendation: str
    acceptance: str
    image_name: str
    caption: str


SURFACES = [
    Surface(
        "Canvas Text",
        "tldraw stock shape editor",
        "Created and edited in a real scratch board with the stock Text tool.",
        "Native tldraw canvas editing; no SystemSketch wrapper is involved.",
        "Keep stock. It is already the right, well-tested primitive.",
    ),
    Surface(
        "Shape-library search",
        "TldrawUiInput",
        "The real Shapes panel focused its Search shapes field; source uses autoFocus + autoSelect.",
        "A transient query: focus, replace, Escape closes.",
        "Keep stock. This is the reference implementation for simple chrome search.",
    ),
    Surface(
        "Document filename",
        "Workspace rename transaction + browser input",
        "Click and F2 select the whole basename; Enter commits, Escape restores, blur commits once.",
        "A replace-the-identity gesture, but backed by a path, digest fence, and immutable file type.",
        "Use a tiny adapter around TldrawUiInput's editing mechanics; retain the workspace transaction.",
    ),
    Surface(
        "Block / Branch inline labels",
        "Custom tldraw shape editors",
        "Their editors focus and select with a second animation frame; port-name selection is visually verified.",
        "Canvas-local semantic fields update the custom shape and end through tldraw editing state.",
        "Keep the custom shape editors; add one physical regression for first-open title selection before refactoring.",
    ),
    Surface(
        "Inspector fields and descriptions",
        "LiveTextInput / LiveTextArea",
        "A local draft protects caret and IME while FieldGesture groups live document writes into one undo step.",
        "Precision editing: preserve the clicked caret; Escape exits and Ctrl/Cmd+Z retracts the grouped gesture.",
        "Keep the live field adapter. Do not force select-all or a generic cancel semantics onto it.",
    ),
    Surface(
        "Command, save, and folder dialogs",
        "Domain-specific native fields",
        "Enter can execute a command or create a resource; Save As has explicit format semantics.",
        "Dialog/action controls, not a plain identity rename.",
        "Keep domain keys. Share styling only where it does not change their meaning.",
    ),
]


RECOMMENDATIONS = [
    Recommendation(
        1,
        "Adopt stock tldraw input mechanics for simple chrome fields",
        "P1",
        "Recommended",
        "TldrawUiInput already powers the shape-library search and provides autofocus, select-on-entry, IME-safe completion, Escape reset, and blur handling.",
        "Create a very small SystemSketch adapter on top of TldrawUiInput. Give it an explicit interaction profile (identity or search) and let callers supply their domain commit/cancel action.",
        "The library search remains behavior-identical, while simple future chrome fields do not hand-roll focus, selection, and composition handling.",
        "inline-document-rename-editing.png",
        "The filename already demonstrates the desired replace-the-identity entry state: focused and fully selected.",
    ),
    Recommendation(
        2,
        "Refactor the header input as an adapter, not as a canvas Text shape",
        "P1",
        "Recommended",
        "A document name is filesystem metadata. The current header delegates its actual commit to the existing rename transaction, which preserves the extension and protects the digest fence.",
        "Replace only the DOM-input interaction layer with TldrawUiInput (or a wrapper). Map its value, complete, cancel, and blur hooks to the current draft, error, single-flight commit, and cancel-on-blur guard.",
        "Click/F2 still select the basename; Enter and blur save once; Escape never renames; invalid names retain focus and the inline error; no text shape is added to the board.",
        "inline-document-rename-editing.png",
        "Stock input ergonomics can improve the shell without conflating a saved document name with canvas content.",
    ),
    Recommendation(
        3,
        "Keep custom Block and Branch editors, then prove their opening selection",
        "P2",
        "Needs focused proof",
        "These fields are not generic text shapes: each targets a semantic property inside a custom shape, drives tldraw's editing lifecycle, and records a single undo boundary. A live port-name journey visibly selects the full value.",
        "Add a focused real-browser regression that creates a Block or Branch, opens every editable field, and asserts both focus and the full selection range. Fix only a demonstrated first-open selection race; do not replace the editors wholesale.",
        "A new custom shape opens directly ready to replace its title or port name, with exactly one undo action for the gesture.",
        "block-click-to-edit/after-3-click-port-name.png",
        "A real custom Block port editor already shows the desired whole-value selection behavior.",
    ),
    Recommendation(
        4,
        "Publish a small interaction taxonomy instead of one universal text rule",
        "P2",
        "Recommended",
        "Live inspector fields intentionally preserve click position and write through a grouped undo transaction. Command dialogs intentionally assign Enter to execution. Applying filename select-all and Escape-cancel everywhere would break both workflows.",
        "Use three named profiles in source/tests: replace identity (select-all, Enter commit, Escape rollback), search/action (native caret plus action-specific Enter/Escape), and live property (preserve caret, grouped undo). Multiline prose remains its own newline-preserving case.",
        "Every new text surface chooses a profile deliberately, and a behavior change can be reviewed against a short, executable contract rather than copied ad hoc.",
        "menu-diff-systemsketch-rectangle-text-2026-09-03.png",
        "Stock canvas text editing and custom chrome can look cohesive without pretending their data and key semantics are identical.",
    ),
]


def esc(value: str) -> str:
    return html.escape(value)


def surface_rows() -> str:
    return "".join(
        f"<tr><th>{esc(item.name)}</th><td>{esc(item.owner)}</td><td>{esc(item.interaction)}</td><td>{esc(item.direction)}</td></tr>"
        for item in SURFACES
    )


def recommendation_card(item: Recommendation, images: dict[str, str]) -> str:
    status_class = "proof" if item.status == "Needs focused proof" else "good"
    return f"""
<article class="item" data-item="item-{item.number}">
  <div class="item-head"><span class="number">{item.number:02d}</span><h3>{esc(item.title)}</h3><span class="badge">{esc(item.priority)}</span><span class="badge {status_class}">{esc(item.status)}</span></div>
  <figure><img src="{images[item.image_name]}" alt="Evidence for {esc(item.title)}"><figcaption>{esc(item.caption)}</figcaption></figure>
  <p><b>Evidence.</b> {esc(item.evidence)}</p>
  <p><b>Suggested move.</b> {esc(item.recommendation)}</p>
  <p><b>Pass when.</b> {esc(item.acceptance)}</p>
  <div class="review"><input id="keep-{item.number}" type="checkbox" data-review-checkbox checked><label for="keep-{item.number}">Adopt this direction</label><textarea data-review-feedback aria-label="Feedback for {esc(item.title)}" placeholder="Feedback, caveat, or alternative…"></textarea></div>
</article>"""


def main() -> None:
    base = git("rev-parse", "HEAD")
    branch = git("branch", "--show-current") or "detached track"
    image_paths = {
        "inline-document-rename-editing.png": ASSETS / "inline-document-rename-editing.png",
        "block-click-to-edit/after-3-click-port-name.png": ASSETS / "block-click-to-edit" / "after-3-click-port-name.png",
        "menu-diff-systemsketch-rectangle-text-2026-09-03.png": ASSETS / "menu-diff-systemsketch-rectangle-text-2026-09-03.png",
    }
    images = {name: image(path) for name, path in image_paths.items()}
    measurements = {
        "date": "2026-09-03",
        "baseCommit": base,
        "branch": branch,
        "scope": "Rendered UI and text-surface source audit; no application behavior changed.",
        "realAppJourney": [
            "Created stock canvas text in an isolated scratch board.",
            "Opened shape library and verified stock search focus.",
            "Clicked document title and verified full selected basename.",
            "Created a custom Block and inspected its inline editor plus its inspector field.",
        ],
        "surfaceCount": len(SURFACES),
        "recommendations": {"adopt": 3, "needsFocusedProof": 1, "applicationChanges": 0},
        "sourceSeams": {
            "stockSearch": "src/library/ShapeLibraryBrowser.tsx",
            "filename": "src/workspace/LocalWorkspace.tsx",
            "canvasEditors": ["src/blocks/BlockInlineEditor.tsx", "src/branch/BranchInlineEditor.tsx"],
            "liveFields": "src/fields/LiveTextField.tsx",
        },
    }
    MEASUREMENTS.write_text(json.dumps(measurements, indent=2) + "\n", encoding="utf-8")
    cards = "\n".join(recommendation_card(item, images) for item in RECOMMENDATIONS)
    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Text fields + stock tldraw · SystemSketch · 2026-09-03</title>
<style>
:root{{--paper:#f3f5f8;--ink:#18212d;--muted:#596778;--line:#d7dee8;--card:#fff;--blue:#2676dc;--blue-weak:#e8f1ff;--green:#19764e;--green-weak:#e7f6ed;--amber:#9a5a00;--amber-weak:#fff3dc;--shadow:0 18px 48px rgb(19 32 50 / .10)}}*{{box-sizing:border-box}}body{{margin:0;background:radial-gradient(circle at 90% -10%,#d9ecff 0,transparent 33%),var(--paper);color:var(--ink);font:15px/1.55 Inter,ui-sans-serif,system-ui,sans-serif}}main{{width:min(1240px,calc(100% - 34px));margin:auto;padding:50px 0 82px}}.eyebrow{{color:var(--blue);font:850 11px/1 ui-monospace,SFMono-Regular,monospace;letter-spacing:.12em;text-transform:uppercase}}h1{{max-width:1000px;margin:14px 0;font-size:clamp(40px,6vw,72px);line-height:.98;letter-spacing:-.055em}}.lead{{max-width:850px;margin:0;color:var(--muted);font-size:19px}}.thesis{{display:grid;grid-template-columns:44px 1fr;gap:14px;align-items:start;margin:30px 0;padding:19px 21px;border:1px solid #b8d3f8;border-radius:16px;background:linear-gradient(135deg,#fff,#edf5ff);box-shadow:var(--shadow)}}.thesis .mark{{display:grid;width:36px;height:36px;place-items:center;border-radius:10px;color:#fff;background:var(--blue);font-size:22px;font-weight:900}}.thesis p{{margin:0}}.metrics{{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:27px 0}}.metric{{padding:15px;border:1px solid var(--line);border-radius:14px;background:rgb(255 255 255 / .82)}}.metric b{{display:block;font-size:27px;line-height:1.1}}.metric span{{color:var(--muted);font-size:10px;font-weight:850;letter-spacing:.08em;text-transform:uppercase}}.metric.green b{{color:var(--green)}}h2{{margin:53px 0 14px;font-size:30px;letter-spacing:-.025em}}.subhead{{max-width:800px;margin:-6px 0 18px;color:var(--muted)}}.matrix-wrap{{overflow:auto;border:1px solid var(--line);border-radius:16px;background:var(--card);box-shadow:var(--shadow)}}table{{width:100%;border-collapse:collapse;min-width:860px}}th,td{{padding:15px;vertical-align:top;border-bottom:1px solid var(--line);text-align:left}}thead th{{color:var(--muted);background:#f7f9fc;font-size:10px;letter-spacing:.08em;text-transform:uppercase}}tbody th{{width:17%;font-size:14px}}tbody td{{color:var(--muted);font-size:13px}}tbody tr:last-child th,tbody tr:last-child td{{border-bottom:0}}.item{{margin-top:20px;padding:20px;border:1px solid var(--line);border-radius:19px;background:rgb(255 255 255 / .9);box-shadow:var(--shadow)}}.item-head{{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px}}.number{{display:grid;width:30px;height:30px;place-items:center;border-radius:9px;color:#fff;background:var(--ink);font:800 11px/1 ui-monospace,monospace}}.item h3{{margin:0 auto 0 0;font-size:21px;letter-spacing:-.017em}}.badge{{padding:4px 7px;border-radius:999px;color:#365f91;background:var(--blue-weak);font-size:10px;font-weight:850;letter-spacing:.06em;text-transform:uppercase}}.badge.good{{color:var(--green);background:var(--green-weak)}}.badge.proof{{color:var(--amber);background:var(--amber-weak)}}figure{{max-width:820px;margin:0;overflow:hidden;border:1px solid var(--line);border-radius:14px;background:#f7f9fc}}figure img{{display:block;width:100%;height:auto}}figcaption{{padding:10px 13px;color:var(--muted);font-size:12px}}.item p{{max-width:970px;margin:13px 0 0}}.review{{display:grid;grid-template-columns:auto 1fr;gap:8px 12px;align-items:start;margin-top:17px;padding-top:15px;border-top:1px solid var(--line)}}.review input{{width:18px;height:18px;margin-top:2px;accent-color:var(--green)}}.review label{{font-weight:780}}.review textarea{{grid-column:2;min-height:57px;width:100%;padding:9px;border:1px solid var(--line);border-radius:9px;font:inherit;resize:vertical}}.actions{{position:sticky;z-index:2;bottom:12px;display:flex;justify-content:flex-end;gap:8px;margin-top:27px}}button{{padding:10px 13px;border:1px solid #bbc6d2;border-radius:9px;color:var(--ink);background:#fff;box-shadow:0 8px 24px rgb(19 32 50 / .11);font:750 13px inherit;cursor:pointer}}button.primary{{border-color:var(--blue);color:#fff;background:var(--blue)}}.copy-state{{align-self:center;color:var(--green);font-size:12px;font-weight:760}}footer{{margin-top:48px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font-size:12px}}a{{color:var(--blue)}}code{{font-family:ui-monospace,SFMono-Regular,monospace}}@media(max-width:760px){{main{{width:min(100% - 20px,1240px);padding-top:28px}}h1{{font-size:42px}}.metrics{{grid-template-columns:repeat(2,1fr)}}.thesis{{grid-template-columns:1fr}}}}
</style></head><body><main>
<div class="eyebrow">SystemSketch · interaction-seam audit · 2026-09-03</div>
<h1>Reuse stock tldraw behavior—but only where its contract matches the field.</h1>
<p class="lead">The filename can and should feel like tldraw: click-to-edit, immediate replacement, Enter, Escape, and solid IME handling. It cannot become a canvas Text shape, because it renames a protected local document rather than editing canvas content.</p>
<section class="thesis"><span class="mark">→</span><p><b>Recommendation:</b> standardize simple chrome inputs on a thin adapter around <code>TldrawUiInput</code>; preserve the small custom layers that own filesystem safety, tldraw custom-shape editing, or live document transactions. This is more stock reuse, not more bespoke machinery.</p></section>
<section class="metrics"><div class="metric green"><b>6</b><span>Text-surface families audited</span></div><div class="metric green"><b>2</b><span>Already stock tldraw</span></div><div class="metric"><b>3</b><span>Adoptable directions</span></div><div class="metric"><b>1</b><span>Focused proof before refactor</span></div></section>
<h2>What each field really is</h2><p class="subhead">Consistency should mean predictable behavior for the same intent—not one key policy pasted into every input.</p><div class="matrix-wrap"><table><thead><tr><th>Surface</th><th>Current owner</th><th>Interaction contract</th><th>Direction</th></tr></thead><tbody>{surface_rows()}</tbody></table></div>
<h2>Recommended next moves</h2><p class="subhead">No application source was changed in this review. Each item below is independently reviewable.</p>{cards}
<div class="actions"><span class="copy-state" aria-live="polite"></span><button id="reset" type="button">Reset review</button><button id="copy" class="primary" type="button">Copy review</button></div>
<footer>Evidence captured against isolated track <code>{esc(branch)}</code> at <code>{esc(base)}</code>. The report includes only real application captures and source seams; the scratch board was isolated from user documents. <a href="assets/text-field-stock-seams-measurements.json">Measurement sidecar</a> · <a href="build_text_field_stock_seams.py">Builder</a>.</footer>
</main><script>
const key={json.dumps(REVIEW_KEY)},cards=[...document.querySelectorAll('.item')],stateText=document.querySelector('.copy-state');
function save(){{const state={{}};for(const card of cards)state[card.dataset.item]={{keep:card.querySelector('[data-review-checkbox]').checked,feedback:card.querySelector('[data-review-feedback]').value}};localStorage.setItem(key,JSON.stringify(state))}}
function restore(){{try{{const state=JSON.parse(localStorage.getItem(key)||'{{}}');for(const card of cards){{const value=state[card.dataset.item];if(value){{card.querySelector('[data-review-checkbox]').checked=value.keep;card.querySelector('[data-review-feedback]').value=value.feedback||''}}}}}}catch{{}}}}
for(const field of document.querySelectorAll('[data-review-checkbox],[data-review-feedback]'))field.addEventListener('input',save);restore();
document.querySelector('#reset').onclick=()=>{{localStorage.removeItem(key);for(const card of cards){{card.querySelector('[data-review-checkbox]').checked=true;card.querySelector('[data-review-feedback]').value=''}}stateText.textContent='Review reset'}};
document.querySelector('#copy').onclick=async()=>{{const lines=['## Text fields + stock tldraw review',''];for(const card of cards){{const keep=card.querySelector('[data-review-checkbox]').checked,title=card.querySelector('h3').textContent.trim(),feedback=card.querySelector('[data-review-feedback]').value.trim();lines.push(`- [${{keep?'x':' '}}] ${{title}}`);if(feedback)lines.push(`  - Feedback: ${{feedback}}`)}}await navigator.clipboard.writeText(lines.join('\\n'));stateText.textContent='Copied Markdown'}};
</script></body></html>"""
    OUTPUT.write_text(page, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
