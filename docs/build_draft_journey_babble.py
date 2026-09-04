#!/usr/bin/env python3

"""
    Build the five-variant document-draft *journey* Babble & Prune gallery.

    Each variant is a full Main → Draft → edit → switch → review → merge
    walkthrough rendered as real chrome, not a wireframe. The builder measures
    the live tree, inlines prototype CSS and beat screenshots, then writes a
    self-contained dated HTML gallery.
"""

# BAM Imports

# PYTHON Imports


def main() -> None:
    import base64
    import io
    import json
    import re
    import subprocess
    import sys
    import tempfile
    from pathlib import Path

    from PIL import Image, ImageDraw

    repo = Path(__file__).resolve().parents[1]
    docs = repo / "docs"
    proto = docs / "assets" / "draft-journey"
    captures = proto / "captures"
    assets = docs / "assets"
    output = docs / "draft-journey-babble-2026-09-03.html"
    spec_output = docs / "draft-journey-babble-2026-09-03.json"
    gallery = Path("/home/bam/.claude/skills/babble/scripts/gallery.py")

    app_text = (repo / "src" / "App.tsx").read_text(encoding="utf-8")
    pages = re.search(r"maxPages:\s*(\d+)", app_text)
    if pages is None:
        raise SystemExit("Could not measure SystemSketch's maxPages constraint.")
    max_pages = int(pages.group(1))

    tokens = (repo / "src" / "theme" / "tokens.css").read_text(encoding="utf-8")
    token_names = len(re.findall(r"--ss-[a-z0-9-]+", tokens))
    has_warning = "--ss-warning" in tokens
    chrome_css = (repo / "src" / "chrome" / "systemsketch-chrome.css").read_text(encoding="utf-8")
    has_shell = "systemsketch-top-left-shell" in chrome_css
    single_page = "consolidateDocumentToSinglePage" in (repo / "src" / "singlePageDocument.ts").read_text(encoding="utf-8")

    beat_ids = ["main", "create", "edit", "return", "resume", "review", "merged"]
    beat_labels = {
        "main": "On Main",
        "create": "Create Draft",
        "edit": "Edit in draft",
        "return": "Back on Main",
        "resume": "Back in Draft 1",
        "review": "Review",
        "merged": "Merged",
    }
    variants_meta = [
        ("v1", "v1-minimal-bar", "Minimal bar"),
        ("v2", "v2-icepanel-header", "IcePanel header"),
        ("v3", "v3-page-stack", "Page-stack"),
        ("v4", "v4-filmstrip", "Filmstrip"),
        ("v5", "v5-workspace-column", "Workspace column"),
    ]

    missing = [
        proto / f"{stem}.html"
        for _, stem, _ in variants_meta
        if not (proto / f"{stem}.html").is_file()
    ]
    if missing:
        raise SystemExit(f"Missing prototypes: {missing}")
    shot_count = 0
    for _, stem, _ in variants_meta:
        for beat in beat_ids:
            path = captures / f"{stem}-{beat}.png"
            if not path.is_file():
                raise SystemExit(f"Missing capture {path.name}")
            shot_count += 1

    css = (proto / "shared.css").read_text(encoding="utf-8")
    css = re.sub(r"@import url\([^)]+\);\s*", "", css)

    def png_data(image: Image.Image, width: int | None = None) -> str:
        work = image.convert("RGB")
        if width and work.width > width:
            work = work.resize((width, round(work.height * width / work.width)), Image.LANCZOS)
        buffer = io.BytesIO()
        work.save(buffer, format="PNG", optimize=True)
        return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")

    def load_shot(stem: str, beat: str) -> Image.Image:
        return Image.open(captures / f"{stem}-{beat}.png").convert("RGB")

    def contact_sheet(stem: str) -> str:
        thumbs = []
        label_h = 22
        thumb_w = 168
        for beat in beat_ids:
            shot = load_shot(stem, beat)
            thumb = shot.resize((thumb_w, round(shot.height * thumb_w / shot.width)), Image.LANCZOS)
            cell = Image.new("RGB", (thumb_w, thumb.height + label_h), (248, 249, 251))
            cell.paste(thumb, (0, label_h))
            draw = ImageDraw.Draw(cell)
            draw.text((6, 4), beat_labels[beat], fill=(40, 48, 56))
            thumbs.append(cell)
        gap = 6
        sheet = Image.new(
            "RGB",
            (sum(t.width for t in thumbs) + gap * (len(thumbs) - 1), thumbs[0].height),
            (255, 255, 255),
        )
        x = 0
        for thumb in thumbs:
            sheet.paste(thumb, (x, 0))
            x += thumb.width + gap
        dated = assets / f"draft-journey-2026-09-03-{stem}-strip.png"
        sheet.save(dated, optimize=True)
        return png_data(sheet, width=1100)

    def hero_data(stem: str, beat: str = "edit") -> str:
        dated = assets / f"draft-journey-2026-09-03-{stem}-{beat}.png"
        image = load_shot(stem, beat)
        image.save(dated, optimize=True)
        return png_data(image, width=880)

    def extract_app(html: str) -> str:
        start = html.find("<div class=\"ss-app\"")
        if start < 0:
            start = html.find("<div class=\"ss-app ")
        walk = html.find("<div class=\"ss-walk\"")
        if start < 0 or walk < 0:
            raise SystemExit("Could not extract prototype app markup.")
        markup = html[start:walk].rstrip()

        def mapped(match: re.Match[str]) -> str:
            target = match.group(1)
            alias = {"return": "main", "resume": "edit"}
            return f'data-story-to="{alias.get(target, target)}"'

        return re.sub(r'data-to="([^"]+)"', mapped, markup)

    story_css = """
.journey-preview{position:relative;height:360px;overflow:hidden;background:#eef1f5}
.journey-preview .ss-page,.journey-preview .ss-stage{padding:0;margin:0;min-height:0;width:100%}
.journey-preview .ss-app{transform:scale(.5);transform-origin:top left;width:200%;height:720px;border:0;border-radius:0;box-shadow:none}
.prototype:not([data-story-state]) [data-show]:not([data-show~="main"]),
.prototype[data-story-state="base"] [data-show]:not([data-show~="main"]),
.prototype[data-story-state="main"] [data-show]:not([data-show~="main"]){display:none!important}
.prototype[data-story-state="create"] [data-show]:not([data-show~="create"]){display:none!important}
.prototype[data-story-state="edit"] [data-show]:not([data-show~="edit"]){display:none!important}
.prototype[data-story-state="review"] [data-show]:not([data-show~="review"]){display:none!important}
.prototype[data-story-state="merged"] [data-show]:not([data-show~="merged"]){display:none!important}
.prototype[data-story-state="edit"] [data-variant="ice"],
.prototype[data-story-state="review"] [data-variant="ice"]{ }
.prototype[data-story-state="edit"] [data-variant="ice"] .ss-canvas,
.prototype[data-story-state="review"] [data-variant="ice"] .ss-canvas{top:44px}
.prototype[data-story-state="edit"] [data-variant="ice"] .ss-shell-left,
.prototype[data-story-state="edit"] [data-variant="ice"] .ss-shell-right,
.prototype[data-story-state="review"] [data-variant="ice"] .ss-shell-left,
.prototype[data-story-state="review"] [data-variant="ice"] .ss-shell-right{top:58px}
"""

    def preview_for(stem: str) -> str:
        markup = extract_app((proto / f"{stem}.html").read_text(encoding="utf-8"))
        return f"<style>{css}\n{story_css}</style><div class='journey-preview'>{markup}</div>"

    def film_html(stem: str) -> str:
        uri = contact_sheet(stem)
        return (
            f"<div class='ss-ref' style='height:auto;padding:8px;background:#f4f6f8'>"
            f"<img src='{uri}' alt='Seven-beat journey for {stem}' "
            f"style='display:block;width:100%;height:auto'>"
            f"</div>"
        )

    def hero_html(stem: str, beat: str, caption: str) -> str:
        uri = hero_data(stem, beat)
        return (
            f"<div class='ss-ref' style='height:auto;padding:8px;background:#eef2f6'>"
            f"<img src='{uri}' alt='{caption}' style='display:block;width:100%;height:auto'>"
            f"</div>"
        )

    shared_proof = [
        f"Each prototype is a clickable seven-beat storyboard using measured SystemSketch tokens and the {max_pages}-canvas rule.",
        f"{shot_count} headless Chrome captures were taken from the rendered HTML chrome, not from wireframes.",
        "Persistence, digest fencing, and merge execution stay simulated; this round judges the integrated visual system.",
    ]

    def score(value: int, evidence: str, confidence: str) -> tuple:
        return (value, evidence, confidence)

    def variant(
        identifier: str,
        stem: str,
        name: str,
        thesis: str,
        best_when: str,
        loses_when: str,
        decisions: list[tuple[str, str]],
        keep_parts: list[str],
        scores: dict[str, tuple],
        story_title: str,
        steps: list[tuple[str, str, str, str]],
        extra_media: list[dict],
    ) -> dict:
        return {
            "id": identifier,
            "name": name,
            "thesis": thesis,
            "accent": {"v1": "#8a5308", "v2": "#1e1e1e", "v3": "#3d6ea8", "v4": "#2f7f74", "v5": "#3b6fb6"}[identifier],
            "bestWhen": best_when,
            "losesWhen": loses_when,
            "decisions": [{"label": label, "value": value} for label, value in decisions],
            "keepParts": keep_parts,
            "proof": shared_proof,
            "previewLabel": "clickable journey chrome",
            "story": {
                "title": story_title,
                "steps": [
                    {"label": label, "caption": caption, "state": state, "target": target}
                    for label, caption, state, target in steps
                ],
            },
            "scores": {
                key: {"score": value, "evidence": evidence, "confidence": confidence}
                for key, (value, evidence, confidence) in scores.items()
            },
            "gateResults": {
                "g1": {
                    "pass": True,
                    "evidence": f"Switching replaces the document revision on the measured {max_pages}-canvas; no page tabs appear as draft containers.",
                },
                "g2": {
                    "pass": True,
                    "evidence": "User-facing copy uses Main, Draft, Version, Merge, and changes. GitBranch appears only as the Drafts chip icon.",
                },
                "g3": {
                    "pass": True,
                    "evidence": "The same Planner → Controller board is walked through create, edit, leave, resume, review, and merge in every variant.",
                },
                "g4": {
                    "pass": True,
                    "evidence": "Prototypes live under docs/assets/draft-journey/. No product source in the dirty checkout was edited.",
                },
            },
            "preview": preview_for(stem),
            "media": [
                {
                    "label": "Seven-beat filmstrip",
                    "caption": "Same story in every variant: Main, create, edit, leave, resume, review, merged. Compare chrome, not content.",
                    "html": film_html(stem),
                },
                {
                    "label": "Editing in the draft",
                    "caption": "Planner v2 and Safety check are the shared edit. Judge how little chrome is left once the person is drawing.",
                    "html": hero_html(stem, "edit", f"{name} while editing Draft 1"),
                },
                *extra_media,
            ],
        }

    common_steps = [
        ("On Main", "robot-arm is on Main. Planner still feeds Controller. Drafts is a chip, not a second canvas.", "main", "[data-story-to='create'], [data-story-to='edit']"),
        ("Create Draft", "Name the fork “try a second planner”. Main is the recorded base.", "create", "[data-story-to='edit']"),
        ("Edit in draft", "Planner becomes Planner v2 and Safety check appears. The canvas is still the same one document.", "edit", "[data-story-to='review']"),
        ("Review changes", "Keep / Discard on Change 1 of 2. Main was unchanged while this draft existed.", "review", "[data-story-to='merged']"),
        ("Merged", "Main now shows Planner v2. The draft is gone. Version v0.8 remembers the board from before the merge.", "merged", "[data-story-to='main']"),
    ]

    spec = {
        "schemaVersion": 3,
        "title": "Draft journey · five integrated UIs",
        "kicker": "SystemSketch · Babble & Prune · 3 September 2026",
        "brief": (
            "Judge five complete visual systems for the same document-draft journey: "
            "open Main, create a Draft, edit, leave and return, review changes, merge. "
            "Zach wants the most minimalist, clean chrome. Clicks can be fined later. "
            f"One canvas forever (measured maxPages={max_pages}). Words: Main, Draft, Version, Merge, changes."
        ),
        "count": 5,
        "defaultId": "v5",
        "defaultWhy": (
            "Workspace column is the AI recommendation at 88.8/100, co-leading with Page-stack at 88.0. "
            "The rail keeps Main, the draft, the change list, and Merge in one quiet column so the journey "
            "never changes products. Page-stack is the cleaner pick if a persistent rail feels like chrome "
            "Zach did not ask for."
        ),
        "decisionHinge": (
            "The recommendation is fragile. Move 8 points from state-inventory to cleanliness and "
            "Page-stack or Minimal bar overtakes the rail. If the hairline-plus-chip is too quiet to "
            "trust, IcePanel header wins on unmistakable-draft and loses on density."
        ),
        "invariants": [
            f"One SystemSketch document exposes {max_pages} durable canvas; drafts replace the document, they do not add pages.",
            "User-facing words are Main, Draft, Version, Merge, and changes. Never Current, commit, checkout, or rebase.",
            "Every variant walks the same robot-arm story: create “try a second planner”, rename Planner → Planner v2, add Safety check, leave Main unchanged, review, merge to Version v0.8.",
            "Lucide GitBranch may mark the Drafts chip. It is not a Git operation.",
            f"Chrome borrows the live token vocabulary ({token_names} --ss-* names; warning token present={has_warning}) and the floating top-left shell.",
        ],
        "boundary": (
            "These are self-contained HTML journey prototypes with real rendered chrome. "
            "Autosave, digest fencing, record-aware merge, and the three live tracks stay untouched. "
            "Product code in the dirty checkout was not edited."
        ),
        "axes": [
            {"name": "Chrome persistence", "values": ["chip + hairline", "full-width draft header", "named sheets", "edge filmstrip", "always-on rail"]},
            {"name": "Mental model", "values": ["mode mark", "draft session", "paper stack", "state pictures", "workspace tree"]},
            {"name": "Where other drafts live", "values": ["inside the chip", "inside the chip", "visible sheets", "always-visible frames", "always-visible list"]},
            {"name": "Review surface", "values": ["on-demand strip", "header-owned", "sheet-adjacent strip", "deck + strip", "rail-owned"]},
        ],
        "requirements": [
            {
                "id": "fr1",
                "name": "Integrated journey",
                "weight": 24,
                "why": "The live tracks explore pieces. Zach asked to see the whole path as one visual system.",
                "passCondition": "Main → Draft → edit → leave → return → review → merge stays in one language.",
                "anchors": {
                    "1": "Beats feel like different products.",
                    "3": "The path works but chrome jumps between modes.",
                    "5": "One visual system from Main through merge.",
                },
            },
            {
                "id": "fr2",
                "name": "Minimalist cleanliness",
                "weight": 28,
                "why": "Zach said the job now is the most minimalist, clean UI. Fine-tune clicks afterwards.",
                "passCondition": "The canvas stays primary; chrome is quiet and only as large as the moment needs.",
                "anchors": {
                    "1": "Fat chrome or competing banners.",
                    "3": "Useful but visually busy.",
                    "5": "Almost nothing until needed, and still never lost.",
                },
            },
            {
                "id": "fr3",
                "name": "Main versus Draft unmistakable",
                "weight": 20,
                "why": "A prototype must never feel like it is quietly editing Main.",
                "passCondition": "The active state is obvious without reading a filename.",
                "anchors": {
                    "1": "State is inferred from memory.",
                    "3": "Labeled but easy to miss while drawing.",
                    "5": "Continuously obvious without shouting.",
                },
            },
            {
                "id": "fr4",
                "name": "State inventory",
                "weight": 16,
                "why": "Zach wants to see other drafts and return to Main without hunting.",
                "passCondition": "Main, drafts, and versions are findable without a second workspace.",
                "anchors": {
                    "1": "Hidden behind memory.",
                    "3": "One click behind a chip or menu.",
                    "5": "Visible without opening anything.",
                },
            },
            {
                "id": "fr5",
                "name": "Review without ceremony",
                "weight": 12,
                "why": "Keep / Discard / Merge should feel like the same product, not a third app.",
                "passCondition": "The change list and merge actions reuse the journey's chrome language.",
                "anchors": {
                    "1": "Review is a separate product.",
                    "3": "Works but heavier than the rest of the UI.",
                    "5": "Review is the same quiet language.",
                },
            },
        ],
        "hardGates": [
            {"id": "g1", "name": "One canvas forever", "why": "Drafts are document revisions, not tldraw pages."},
            {"id": "g2", "name": "Main / Draft vocabulary", "why": "Current, commit, checkout, and rebase stay out of the UI."},
            {"id": "g3", "name": "Shared seven-beat story", "why": "Variants must be comparable, not differently staged."},
            {"id": "g4", "name": "No product implementation here", "why": "The checkout is dirty with peer work; this round is a report."},
        ],
        "variants": [
            variant(
                "v1", "v1-minimal-bar", "Minimal bar",
                "Least chrome: Drafts chip, a 3px hazard hairline while editing, and a quiet review strip only when merging.",
                "The person is drawing most of the time and only needs to know they are not on Main.",
                "Other drafts must stay visible, or the hairline is too quiet to trust.",
                [("Chrome", "Chip + hairline. No fat header."), ("Inventory", "Open the Drafts chip."), ("Review", "Floating VS Code strip, only on merge.")],
                ["Drafts chip + GitBranch", "3px hazard hairline", "on-demand review strip"],
                {
                    "fr1": score(5, "The same chip language opens create, lists the other draft on return, and hands off to a strip for review.", "high"),
                    "fr2": score(5, "Edit beat leaves only the floating shells, a hairline, and the canvas. No header, rail, or deck.", "high"),
                    "fr3": score(3, "Draft 1 chip plus hairline mark the mode; both are easy to miss once the person is drawing.", "high"),
                    "fr4": score(3, "Return beat proves Main and the named draft sit in one popover, not on the canvas.", "high"),
                    "fr5": score(5, "Review is a floating Change 1 of 2 strip with Keep / Discard; it is absent on every other beat.", "high"),
                },
                "Walk the quiet chip",
                common_steps,
                [{"label": "Back on Main", "caption": "Main still shows Planner. The draft is listed, not applied.", "html": hero_html("v1-minimal-bar", "return", "Minimal bar back on Main")}],
            ),
            variant(
                "v2", "v2-icepanel-header", "IcePanel header",
                "A full-width inverse DRAFT bar names the draft, counts changes, and owns Merge. Closest to the live tracks.",
                "Draft identity must be impossible to miss, even at the cost of a persistent header.",
                "The job is the cleanest possible canvas and the header feels like a second product.",
                [("Chrome", "Inverse 44px DRAFT bar + hazard stripe."), ("Inventory", "Still a Drafts popover."), ("Review", "The header becomes the VS Code bar.")],
                ["inverse DRAFT word", "N changes + Merge", "full-width hazard stripe"],
                {
                    "fr1": score(4, "Create uses the chip; edit switches into a different header species; review reuses that header.", "high"),
                    "fr2": score(3, "The 44px inverse bar plus stripe is the loudest chrome in the set. File shells have to move down to survive it.", "high"),
                    "fr3": score(5, "Orange DRAFT + named draft + ← Main cannot be mistaken for the official board.", "high"),
                    "fr4": score(3, "Other drafts still live in the chip popover, same as Minimal bar.", "high"),
                    "fr5": score(4, "2 changes and Merge sit in the header; review replaces that header with Keep / Discard.", "high"),
                },
                "Walk the draft session bar",
                common_steps,
                [{"label": "Draft session header", "caption": "This is the live-track look: DRAFT, name, 2 changes, Merge, hazard stripe.", "html": hero_html("v2-icepanel-header", "edit", "IcePanel header while editing")}],
            ),
            variant(
                "v3", "v3-page-stack", "Page-stack",
                "Drafts are named sheets in a small stack beside the file. Switching replaces the document, never adds a canvas.",
                "The person thinks in a few named alternatives and wants them visible like paper, not like git.",
                "A growing draft list would turn the stack into a second toolbar, or versions need a real home.",
                [("Chrome", "Overlapping sheets + a quiet hairline in draft."), ("Inventory", "The other sheet is the other draft."), ("Review", "Same floating strip as Minimal bar.")],
                ["named sheet tabs", "Main peeking behind Draft 1", "Create sheet dialog"],
                {
                    "fr1": score(5, "Create, edit, return, and merge are all sheet operations. The canvas never changes products.", "high"),
                    "fr2": score(4, "Sheets add a thin row, not a header or rail. Still more chrome than a single chip.", "high"),
                    "fr3": score(4, "Selected Draft 1 sheet plus hairline plus orange chip. Clear, not shouted.", "medium"),
                    "fr4": score(5, "Main and Draft 1 are simultaneously visible as sheets on the return and edit beats.", "high"),
                    "fr5": score(4, "Review is the shared strip, sitting with the stack rather than replacing it.", "high"),
                },
                "Flip the named sheet",
                common_steps,
                [{"label": "Sheets on Main", "caption": "Main is the front sheet. Plus starts a new named sheet of the same document.", "html": hero_html("v3-page-stack", "main", "Page-stack on Main")}],
            ),
            variant(
                "v4", "v4-filmstrip", "Filmstrip",
                "Main and every Draft are thumbnail frames along the bottom edge. Click a frame to replace the document.",
                "The decision is visual and the person wants to see Main sitting next to the experiment.",
                "The deck plus the tool dock fight for the bottom edge, or many drafts make tiny unreadable thumbs.",
                [("Chrome", "Bottom state deck + hairline in draft."), ("Inventory", "Every state is a picture."), ("Review", "Strip above, deck still showing Main unchanged.")],
                ["Main vs Draft thumbnails", "click-a-frame switching", "unchanged Main sitting beside the draft"],
                {
                    "fr1": score(4, "Frames carry the whole journey, but the deck is a second surface under the drawing.", "high"),
                    "fr2": score(3, "A persistent 72px deck plus the tool dock is the busiest bottom edge in the set.", "high"),
                    "fr3": score(4, "Selected draft frame, orange chip, and hairline mark the mode together.", "high"),
                    "fr4": score(5, "Edit beat shows the draft frame and an unchanged Main frame at the same time.", "high"),
                    "fr5": score(3, "Review adds a strip on top of an already-busy deck. Comparable, but heavier.", "medium"),
                },
                "Pick a frame",
                common_steps,
                [{"label": "Deck while editing", "caption": "Draft frame is selected. Main sits beside it, still the old Planner.", "html": hero_html("v4-filmstrip", "edit", "Filmstrip while editing")}],
            ),
            variant(
                "v5", "v5-workspace-column", "Workspace column",
                "A persistent left rail is the document: Main, drafts, changes, versions. The canvas is everything else.",
                "The person wants the whole journey visible without opening a menu, and will give up 228px to get it.",
                "The rail feels like an IDE Zach did not ask for, or a small laptop cannot spare the column.",
                [("Chrome", "Always-on 228px rail. No Drafts chip."), ("Inventory", "Main, drafts, versions are the rail."), ("Review", "Changes already live in the rail; Keep / Discard is a quiet strip.")],
                ["persistent Main row", "in-rail change list", "Version appears after merge"],
                {
                    "fr1": score(5, "Create, edit, review, and the post-merge Version never leave the same column.", "high"),
                    "fr2": score(3, "The rail is always there, including on Main with nothing to manage. Clean, not minimal.", "high"),
                    "fr3": score(5, "Selected draft row, in-rail 'editing', and the canvas title stay aligned.", "high"),
                    "fr4": score(5, "Main, the named draft, the two changes, and later Version v0.8 are readable without a click.", "high"),
                    "fr5": score(5, "Changes are already in the rail; Review & Merge is one button in that same column.", "high"),
                },
                "Stay in the rail",
                common_steps,
                [{"label": "After merge", "caption": "Main is v0.8 with Planner v2. Drafts is empty. Version v0.8 remembers the previous Main.", "html": hero_html("v5-workspace-column", "merged", "Workspace column after merge")}],
            ),
        ],
        "checks": [
            "Exactly five integrated visual systems, not five skins of one header.",
            f"Builder measured maxPages={max_pages}, token names={token_names}, top-left shell present={has_shell}, single-page migration={single_page}.",
            f"{shot_count} real-chrome captures, seven beats each, inlined as data URIs.",
            "Weighted requirements sum to 100%; AI rank appears after the variant atlas.",
            "No tldraw page, no Current label, no commit/checkout/rebase, no product-code edit in the dirty checkout.",
        ],
    }

    weights = sum(item["weight"] for item in spec["requirements"])
    if weights != 100:
        raise SystemExit(f"FR weights sum to {weights}, not 100.")

    spec_output.write_text(json.dumps(spec, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if output.exists():
        output.unlink()
    with tempfile.TemporaryDirectory(prefix="systemsketch-draft-journey-") as directory:
        staged = Path(directory) / "gallery.json"
        staged.write_text(json.dumps(spec, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        subprocess.run(
            [sys.executable, str(gallery), "build", "--spec", str(staged), "--output", str(output), "--strict"],
            check=True,
        )
    print(f"Wrote {spec_output.relative_to(repo)}")
    print(f"Wrote {output.relative_to(repo)}")
    print(f"Measured maxPages={max_pages} token_names={token_names} shots={shot_count}")


if __name__ == "__main__":
    main()
