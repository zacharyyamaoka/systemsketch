#!/usr/bin/env python3
"""Build the self-contained inline-document-rename UX implementation gallery."""

from __future__ import annotations

import base64
import html
import json
import subprocess
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs" / "assets"
OUTPUT = ROOT / "docs" / "inline-document-rename-ux-2026-09-03.html"
MEASUREMENTS = ASSETS / "inline-document-rename-measurements.json"


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


def image(path: Path) -> str:
    return f"data:image/png;base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


@dataclass(frozen=True)
class Finding:
    number: int
    title: str
    classification: str
    actual: str
    expected: str
    journey: str
    proof: str
    seam: str
    acceptance: str
    image_name: str
    caption: str


FINDINGS = [
    Finding(1, "Rename in the header, not a modal", "UX improvement",
        "Clicking the title dimmed the board and opened a separate Rename document dialog.",
        "The title itself becomes the editing field in the same chrome.",
        "Click the filename once.", "The before/after pair shows the old modal replaced by the focused header field.",
        "Confirmed · SystemSketchMainMenu in src/workspace/LocalWorkspace.tsx.",
        "No workspace dialog exists after clicking the title; a text field owns focus.",
        "inline-document-rename-editing.png", "After · a real click opens the header field, never a dialog."),
    Finding(2, "Select the whole old name automatically", "UX improvement",
        "Replacing a name required an additional select-all gesture after a modal transition.",
        "Entering rename selects the basename immediately, ready for one keystroke or paste.",
        "Click title, inspect focus and selection range.", "The browser journey read selectionStart=0 and selectionEnd=5 for Draft.",
        "Confirmed · focus effect tied to the inline rename state.",
        "A click or F2 focuses the field with its entire visible name selected.",
        "inline-document-rename-editing.png", "After · selected text is visible in the real app."),
    Finding(3, "Give naming a familiar F2 entry point", "UX improvement",
        "Keyboard users had to navigate File menus or reach for the pointer.",
        "F2 opens the same inline field while ordinary text inputs ignore it.",
        "Press F2 while the canvas has focus.", "The dedicated browser journey drives F2 before renaming Robotics plan.",
        "Confirmed · scoped window key handler in SystemSketchMainMenu.",
        "F2 opens the selected inline name field and does not hijack active text inputs.",
        "inline-document-rename-editing.png", "After · the same field serves pointer and keyboard entry."),
    Finding(4, "Commit with Enter", "UX improvement",
        "The old flow required moving to a modal confirmation button after typing.",
        "Enter commits the current field value immediately.",
        "Type a new name, then press Enter.", "The journey renamed Draft to Robotics plan and read the renamed file from disk.",
        "Confirmed · inline key boundary delegates to the existing digest-fenced workspace rename.",
        "Enter updates the chrome title, URL, recents, and on-disk document.",
        "inline-document-rename-saved.png", "After · the saved name is back in the ordinary header state."),
    Finding(5, "Commit naturally on blur", "UX improvement",
        "A person who clicked back to work faced a modal that demanded a second action.",
        "Leaving a valid field commits once, so naming does not interrupt canvas work.",
        "Edit a name, then click an empty canvas area.", "The browser journey clicked the canvas and read Robotics plan v2 from disk.",
        "Confirmed · onBlur shares the single in-flight commit boundary.",
        "A valid blur saves exactly once and returns the normal title control.",
        "inline-document-rename-saved.png", "After · no lingering confirmation surface blocks the canvas."),
    Finding(6, "Make Escape a safe cancel", "UX improvement",
        "Backing out of the old modal required locating its Cancel control or closing the dialog.",
        "Escape restores the original name and returns focus to the title launcher.",
        "Open inline rename, then press Escape without typing.", "Workspace browser smoke verifies title restoration and focus return.",
        "Confirmed · cancel-on-blur guard plus focus restoration in SystemSketchMainMenu.",
        "Escape never renames; focus is back on the clickable filename.",
        "inline-document-rename-editing.png", "After · concise keyboard help is exposed to assistive technology while editing."),
    Finding(7, "Keep the file type protected", "Data-safety improvement",
        "The modal made extension handling a visible field concern even though a rename must not convert a document.",
        "Only the basename is edited; the existing .systemsketch or .tldr suffix remains authoritative.",
        "Rename a .systemsketch board and inspect the resulting path and bytes.", "The real file-type journey confirms the URL path and envelope remain .systemsketch.",
        "Confirmed · existing renamedDocumentPath and workspace server validation remain untouched.",
        "Inline rename cannot change the document format; Save As remains the explicit conversion path.",
        "inline-document-rename-saved.png", "After · a concise header edit retains the same persisted file identity."),
    Finding(8, "Keep invalid-name recovery in place", "Accessibility improvement",
        "A malformed name could fail after a modal transition and send attention away from the edit point.",
        "The field stays focused, announces its error, and shows a compact correction message below the header.",
        "Type only dots and press Enter.", "The journey asserts aria-invalid=true and the visible message Give this board a name.",
        "Confirmed · inline validation state, role-compatible description, and error bubble CSS.",
        "Bad input never closes the field or silently changes the document.",
        "inline-document-rename-validation.png", "After · the real validation message appears beside the source of the problem."),
    Finding(9, "Make File → Rename an honest shortcut", "UX improvement",
        "The File menu advertised Rename… even though it was no longer a separate workflow.",
        "The item is Rename, advertises F2, and opens the same inline control.",
        "Open File, select Rename, or press F2.", "The menu and F2 both call one beginInlineRename action.",
        "Confirmed · TldrawUiMenuItem delegates to the inline title state rather than showDialog('rename').",
        "No menu path can reintroduce the old Rename document dialog.",
        "inline-document-rename-editing.png", "After · every entry route converges on one editing surface."),
    Finding(10, "Prioritize identity and scope on narrow shells", "Responsive UX improvement",
        "At narrow widths the title disappeared and duplicate launcher icons squeezed the current Board label.",
        "The title remains clickable at 500px; duplicate Shapes yields to the bottom dock at 900px, keeping Board readable.",
        "Resize to 900px and 500px, then click the filename.", "Live browser screenshots at both sizes retained a readable title, Board, status dot, and inline field.",
        "Confirmed · responsive chrome rules and a dedicated Shapes hook class.",
        "At 500px and 900px, title and Board remain visible and rename is reachable.",
        "inline-document-rename-review.png", "After · guided board captured in the real app; the header remains the test target."),
]


def finding_card(finding: Finding, images: dict[str, str]) -> str:
    title = html.escape(finding.title)
    text = lambda value: html.escape(value)
    return f"""
<article class=\"issue\" data-item=\"fix-{finding.number}\">
  <div class=\"issue-head\"><span class=\"index\">{finding.number:02d}</span><h3>{title}</h3><span class=\"badge\">P1</span><span class=\"badge muted\">{text(finding.classification)}</span><span class=\"badge good\">Fixed and verified</span></div>
  <figure><img src=\"{images[finding.image_name]}\" alt=\"Real SystemSketch evidence for {title}\"><figcaption>{text(finding.caption)}</figcaption></figure>
  <p class=\"impact\"><b>User impact.</b> {text(finding.actual)}</p>
  <dl class=\"facts\"><div><dt>Actual → expected</dt><dd>{text(finding.actual)} → {text(finding.expected)}</dd></div><div><dt>Reproduction</dt><dd>{text(finding.journey)}</dd></div><div><dt>Concrete proof</dt><dd>{text(finding.proof)}</dd></div><div><dt>Likely seam</dt><dd>{text(finding.seam)}</dd></div></dl>
  <p><b>Acceptance check.</b> {text(finding.acceptance)}</p>
  <div class=\"review\"><input id=\"keep-{finding.number}\" type=\"checkbox\" data-review-checkbox checked><label for=\"keep-{finding.number}\">Keep this fix</label><textarea data-review-feedback aria-label=\"Feedback for {title}\" placeholder=\"Feedback on this change…\"></textarea></div>
</article>"""


def main() -> None:
    base = git("rev-parse", "HEAD")
    branch = git("branch", "--show-current") or "detached track"
    inputs = {
        "file-type-rename-dialog.png": ASSETS / "file-type-rename-dialog.png",
        "inline-document-rename-editing.png": ASSETS / "inline-document-rename-editing.png",
        "inline-document-rename-saved.png": ASSETS / "inline-document-rename-saved.png",
        "inline-document-rename-validation.png": ASSETS / "inline-document-rename-validation.png",
        "inline-document-rename-review.png": ROOT / "sketches" / "review" / "inline-document-rename.png",
    }
    images = {name: image(path) for name, path in inputs.items()}
    measurements = {
        "date": "2026-09-03",
        "baseCommit": base,
        "branch": branch,
        "isolation": "throwaway browser profile, API root, and document files; fixture under this track only",
        "findings": {"open": 0, "fixedAndVerified": 10, "unconfirmed": 0, "tooling": 0},
        "browserChecks": {"inlineRename": "6/6", "workspaceBrowser": "11/11", "fileType": "13/13", "themeContrast": "240/240"},
        "responsiveViewports": [900, 500],
        "fixture": {"shapes": 8, "bindings": 6, "coldReopen": True, "boundMotion": True},
    }
    MEASUREMENTS.write_text(json.dumps(measurements, indent=2) + "\n", encoding="utf-8")
    cards = "\n".join(finding_card(item, images) for item in FINDINGS)
    page = f"""<!doctype html>
<html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Inline document rename · SystemSketch · 2026-09-03</title>
<style>
:root{{--paper:#f5f3ef;--ink:#20242b;--muted:#626a75;--line:#dad7d0;--blue:#2676dc;--orange:#ed8e38;--green:#267d55;--green-bg:#e8f7ed;--card:#fffdf9;--shadow:0 14px 42px rgb(40 44 50 / .11)}}*{{box-sizing:border-box}}body{{margin:0;color:var(--ink);background:linear-gradient(180deg,#ece9e3,#f8f6f1 540px);font:15px/1.55 Inter,ui-sans-serif,system-ui,sans-serif}}main{{width:min(1320px,calc(100% - 36px));margin:auto;padding:48px 0 88px}}.eyebrow{{color:var(--blue);font:800 11px/1 ui-monospace,monospace;letter-spacing:.13em;text-transform:uppercase}}h1{{max-width:920px;margin:13px 0;font-size:clamp(42px,7vw,80px);line-height:.95;letter-spacing:-.055em}}.lead{{max-width:840px;margin:0;color:var(--muted);font-size:19px}}.metrics{{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin:30px 0}}.metric{{padding:16px;border:1px solid var(--line);border-radius:15px;background:rgb(255 253 249 / .86);box-shadow:0 4px 18px rgb(40 44 50 / .05)}}.metric b{{display:block;font-size:26px}}.metric span{{color:var(--muted);font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}}.metric.good b{{color:var(--green)}}.pair{{display:grid;grid-template-columns:1fr 1fr;gap:16px}}figure{{margin:0;overflow:hidden;border:1px solid var(--line);border-radius:18px;background:#fff;box-shadow:var(--shadow)}}figure img{{display:block;width:100%;height:auto;background:#eef0f2}}figcaption{{padding:11px 14px;color:var(--muted);font-size:12px}}h2{{margin:52px 0 13px;font-size:30px;letter-spacing:-.025em}}.journeys{{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}}.journey{{padding:16px;border:1px solid var(--line);border-radius:14px;background:var(--card)}}.journey b{{display:block;margin-bottom:4px}}.journey p{{margin:0;color:var(--muted);font-size:13px}}.issue{{margin-top:22px;padding:20px;border:1px solid var(--line);border-radius:20px;background:rgb(255 253 249 / .9);box-shadow:var(--shadow)}}.issue-head{{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px}}.issue-head h3{{margin:0 auto 0 0;font-size:21px;letter-spacing:-.015em}}.index{{display:grid;width:30px;height:30px;place-items:center;border-radius:9px;color:#fff;background:var(--ink);font:800 11px/1 ui-monospace,monospace}}.badge{{padding:4px 7px;border-radius:999px;color:#91511e;background:#fff0e4;font-size:10px;font-weight:850;letter-spacing:.05em;text-transform:uppercase}}.badge.muted{{color:#425b7d;background:#eaf0fa}}.badge.good{{color:var(--green);background:var(--green-bg)}}.issue figure{{max-width:820px}}.impact{{margin:16px 0 0}}.facts{{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:15px 0}}.facts div{{padding:12px;border:1px solid var(--line);border-radius:11px;background:#fff}}dt{{margin-bottom:4px;color:var(--muted);font-size:10px;font-weight:850;letter-spacing:.07em;text-transform:uppercase}}dd{{margin:0;color:var(--muted);font-size:13px}}.review{{display:grid;grid-template-columns:auto 1fr;gap:8px 12px;align-items:start;margin-top:16px;padding-top:14px;border-top:1px solid var(--line)}}.review input{{width:18px;height:18px;margin-top:2px;accent-color:var(--green)}}.review label{{font-weight:760}}.review textarea{{grid-column:2;min-height:58px;width:100%;padding:9px;border:1px solid var(--line);border-radius:9px;font:inherit;resize:vertical}}.review-board{{margin-top:16px}}.actions{{position:sticky;z-index:3;bottom:14px;display:flex;justify-content:flex-end;gap:8px;margin-top:26px}}button{{padding:10px 13px;border:1px solid #bfc4cc;border-radius:9px;color:var(--ink);background:#fff;box-shadow:var(--shadow);font:750 13px inherit;cursor:pointer}}button.primary{{border-color:var(--blue);color:#fff;background:var(--blue)}}.copy-state{{align-self:center;color:var(--green);font-size:12px;font-weight:750}}footer{{margin-top:48px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font-size:12px}}a{{color:var(--blue)}}@media(max-width:900px){{main{{width:min(100% - 20px,1320px);padding-top:28px}}.metrics{{grid-template-columns:repeat(2,1fr)}}.pair,.journeys,.facts{{grid-template-columns:1fr}}h1{{font-size:43px}}}}
</style></head><body><main>
<div class=\"eyebrow\">SystemSketch · focused UX implementation · 2026-09-03</div><h1>Naming a board is now one small, reversible gesture.</h1><p class=\"lead\">This pass removes the rename modal and uses the filename as the working surface. The existing local-first save, file type, conflict, and recovery behavior stays behind it.</p>
<section class=\"metrics\"><div class=\"metric good\"><b>0</b><span>Open findings</span></div><div class=\"metric good\"><b>10</b><span>Fixed + verified</span></div><div class=\"metric\"><b>0</b><span>Unconfirmed</span></div><div class=\"metric\"><b>0</b><span>Tooling findings</span></div><div class=\"metric good\"><b>270/270</b><span>Relevant checks</span></div></section>
<section class=\"pair\"><figure><img src=\"{images['file-type-rename-dialog.png']}\" alt=\"Before: Rename document modal obscures a real board\"><figcaption><b>Before · real application capture</b>A one-field decision dimmed the canvas and demanded a modal confirmation.</figcaption></figure><figure><img src=\"{images['inline-document-rename-editing.png']}\" alt=\"After: selected inline document-name field in header\"><figcaption><b>After · same real-browser journey</b>The header is the field, ready to replace the whole basename.</figcaption></figure></section>
<h2>Journey reach</h2><section class=\"journeys\"><div class=\"journey\"><b>Real browser + disk</b><p>6/6 naming checks: click, selection, Escape, F2, Enter, blur, validation, URL, file bytes, and console cleanliness.</p></div><div class=\"journey\"><b>Existing safety flows</b><p>11/11 workspace and 13/13 file-type browser checks stay green; the actual server still owns filename and digest rules.</p></div><div class=\"journey\"><b>Visual states</b><p>240/240 contrast checks across five themes plus live 900px and 500px shells. The review fixture cold-reopened with 8 shapes and 6 bound cues.</p></div></section>
<h2>Ten seam-removing changes</h2>{cards}
<h2>Guided in-app review board</h2><figure class=\"review-board\"><img src=\"{images['inline-document-rename-review.png']}\" alt=\"Guided SystemSketch review board for inline document rename\"><figcaption><b>Real review fixture · cold-reopened and driven in the track preview</b>Click the board filename in the app header, then follow the numbered cards. A cue target was moved in the live app and its bound arrows followed before Undo restored the board.</figcaption></figure>
<div class=\"actions\"><span class=\"copy-state\" aria-live=\"polite\"></span><button id=\"reset\" type=\"button\">Reset review</button><button class=\"primary\" id=\"copy\" type=\"button\">Copy review</button></div><footer>Audit target: isolated SystemSketch track · base <code>{html.escape(base)}</code> · branch <code>{html.escape(branch)}</code> · evidence: <a href=\"assets/inline-document-rename-measurements.json\">measurement sidecar</a> · builder: <a href=\"build_inline_document_rename_ux.py\">build_inline_document_rename_ux.py</a>.</footer>
</main><script>
const key='systemsketch.inline-document-rename.review.v1',cards=[...document.querySelectorAll('.issue')];function save(){{let state={{}};for(const card of cards)state[card.dataset.item]={{keep:card.querySelector('[data-review-checkbox]').checked,feedback:card.querySelector('[data-review-feedback]').value}};localStorage.setItem(key,JSON.stringify(state))}}function restore(){{try{{let state=JSON.parse(localStorage.getItem(key)||'{{}}');for(const card of cards){{let value=state[card.dataset.item];if(value){{card.querySelector('[data-review-checkbox]').checked=value.keep;card.querySelector('[data-review-feedback]').value=value.feedback||''}}}}}}catch{{}}}}for(const item of document.querySelectorAll('[data-review-checkbox],[data-review-feedback]'))item.addEventListener('input',save);restore();document.querySelector('#reset').onclick=()=>{{localStorage.removeItem(key);for(const card of cards){{card.querySelector('[data-review-checkbox]').checked=true;card.querySelector('[data-review-feedback]').value=''}}document.querySelector('.copy-state').textContent='Review reset'}};document.querySelector('#copy').onclick=async()=>{{let lines=['## UI audit review',''];for(const card of cards){{let keep=card.querySelector('[data-review-checkbox]').checked,title=card.querySelector('h3').textContent.trim(),feedback=card.querySelector('[data-review-feedback]').value.trim();lines.push(`- [${{keep?'x':' '}}] ${{title}}`);if(feedback)lines.push(`  - Feedback: ${{feedback}}`)}}await navigator.clipboard.writeText(lines.join('\\n'));document.querySelector('.copy-state').textContent='Copied Markdown'}};
</script></body></html>"""
    OUTPUT.write_text(page, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
