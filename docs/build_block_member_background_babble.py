#!/usr/bin/env python3
"""Build the five-way Block member-background Babble comparison."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "docs" / "block-member-background-babble-contract-2026-09-05.json"
SPEC = ROOT / "docs" / "block-member-background-babble-2026-09-05.json"
OUTPUT = ROOT / "docs" / "block-member-background-babble-2026-09-05.html"
GALLERY = Path("/home/bam/.codex/skills/babble/scripts/gallery.py")


STYLE = """
<style>
  .member-study { --ink:#15181b; --line:#dfe3e7; --paper:#fff; --quiet:#f5f6f7; --wash:#f0f2f4;
    min-height:360px; padding:20px; color:var(--ink); background:#eef1f3; font:14px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace; }
  .member-study * { box-sizing:border-box; }
  .study-toolbar { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:16px; }
  .study-toolbar strong { font:700 13px/1.2 Inter,system-ui,sans-serif; }
  .study-segmented { display:flex; padding:3px; gap:3px; border:1px solid #c9ced4; border-radius:8px; background:#fff; box-shadow:0 1px 2px #1111; }
  .study-segmented button { border:0; border-radius:5px; padding:7px 10px; background:transparent; color:#555d65; font:650 11px/1 Inter,system-ui,sans-serif; cursor:pointer; }
  .prototype[data-story-state='edge'] [data-story-to='edge'],
  .prototype[data-story-state='hidden'] [data-story-to='hidden'],
  .prototype[data-story-state='inset'] [data-story-to='inset'] { color:#fff; background:#25292e; }
  .branch-block { width:min(420px,100%); margin:auto; overflow:hidden; border:1px solid #cbd0d5; border-radius:9px; background:var(--paper); box-shadow:0 2px 7px #1112; }
  .branch-title { height:45px; display:flex; align-items:center; padding:0 14px; border-bottom:1px solid var(--line); background:#fafbfb; font-size:20px; font-weight:700; }
  .members { padding:0; background:#fff; }
  .member { min-height:112px; overflow:hidden; border-bottom:1px solid var(--line); background:#fff; }
  .member:last-child { border-bottom:0; }
  .member-title { min-height:38px; display:flex; align-items:center; padding:0 12px; border-bottom:1px solid var(--line); font-size:17px; font-weight:700; }
  .member-body { min-height:50px; display:flex; align-items:center; padding:10px 12px; color:#59616a; font:12px/1.4 Inter,system-ui,sans-serif; }
  .member-footer { height:24px; display:flex; align-items:center; justify-content:flex-end; padding:0 9px; border-top:1px solid #eceff1; color:#9299a1; font:10px/1 Inter,system-ui,sans-serif; }
  .prototype[data-story-state='hidden'] .member-footer { display:none; }
  .prototype[data-story-state='inset'] .members { display:grid; gap:12px; padding:12px; background:#f8f9fa; }
  .prototype[data-story-state='inset'] .member { border:1px solid var(--line); border-radius:7px; box-shadow:0 1px 2px #1111; }
  .treatment-seam .member { background:#fff; }
  .treatment-well .members { background:#eceff1; }
  .treatment-well .member { margin:0 5px; border-left:1px solid #e0e3e6; border-right:1px solid #e0e3e6; }
  .prototype[data-story-state='inset'] .treatment-well .member { margin:0; }
  .treatment-zebra .member:nth-child(odd) { background:#f5f6f7; }
  .treatment-zebra .member:nth-child(odd) .member-title,
  .treatment-zebra .member:nth-child(odd) .member-body { background:#f5f6f7; }
  .treatment-header .member-title { background:#f0f2f4; }
  .treatment-header .member-body { background:#fff; }
  .treatment-field .member { background:#fff; }
  .treatment-field .member-body { margin:0 8px 7px; min-height:43px; border:1px solid #e4e7e9; border-radius:5px; background:#f4f5f6; }
  .prototype[data-story-state='hidden'] .treatment-field .member-body { margin-bottom:9px; }
  .state-note { margin:12px auto 0; max-width:420px; color:#69717a; font:11px/1.45 Inter,system-ui,sans-serif; }
  .treatment-swatch { display:grid; grid-template-columns:repeat(3,1fr); min-height:90px; overflow:hidden; border:1px solid #dce0e3; border-radius:8px; }
  .treatment-swatch span { display:grid; place-items:center; padding:12px; font:650 11px/1.25 Inter,system-ui,sans-serif; text-align:center; }
  .treatment-swatch span:nth-child(1) { background:#fff; }
  .treatment-swatch span:nth-child(2) { background:#f3f4f5; }
  .treatment-swatch span:nth-child(3) { background:#e9ecee; }
</style>
"""


def preview(treatment: str, note: str) -> str:
    return STYLE + f"""
<div class="member-study">
  <div class="study-toolbar">
    <strong>Member layout</strong>
    <div class="study-segmented" aria-label="Try the structural and footer states">
      <button data-story-to="edge">Edge-to-edge</button>
      <button data-story-to="hidden">Hide footers</button>
      <button data-story-to="inset">Inset</button>
    </div>
  </div>
  <div class="branch-block {treatment}">
    <div class="branch-title">Branch</div>
    <div class="members">
      <section class="member">
        <div class="member-title">if: parsed</div>
        <div class="member-body">normalize → validate → emit</div>
        <div class="member-footer">⋮</div>
      </section>
      <section class="member">
        <div class="member-title">else:</div>
        <div class="member-body">report malformed frame</div>
        <div class="member-footer">⋮</div>
      </section>
    </div>
  </div>
  <p class="state-note">{note}</p>
</div>
"""


def story() -> dict:
    return {
        "title": "Compare the same Branch in all three product states",
        "steps": [
            {
                "label": "Join the members",
                "caption": "Edge-to-edge removes structural gutters while each direct child remains a Block.",
                "state": "edge",
                "target": "[data-story-to='edge']",
            },
            {
                "label": "Hide the footers",
                "caption": "The treatment must still leave an intentional boundary and a complete stack.",
                "state": "hidden",
                "target": "[data-story-to='hidden']",
            },
            {
                "label": "Return to cards",
                "caption": "Inset restores the class-like separated-card composition without changing the content.",
                "state": "inset",
                "target": "[data-story-to='inset']",
            },
        ],
    }


def scores(values: list[int], evidence: list[str]) -> dict:
    return {
        f"fr{index}": {"score": score, "evidence": evidence[index - 1], "confidence": "high" if index in (1, 3) else "medium"}
        for index, score in enumerate(values, start=1)
    }


def gates(boundary: str) -> dict:
    return {
        "g1": {"pass": True, "evidence": "Black titles remain on white or very pale neutral surfaces in every state."},
        "g2": {"pass": True, "evidence": boundary},
        "g3": {"pass": True, "evidence": "The prototype uses only neutral surface roles; no accent suggests status or type."},
    }


def variant(identifier: str, name: str, thesis: str, accent: str, best: str, loses: str,
            decisions: list[dict], keep: list[str], proof: list[str], treatment: str,
            note: str, values: list[int], evidence: list[str], boundary: str) -> dict:
    return {
        "id": identifier,
        "name": name,
        "thesis": thesis,
        "accent": accent,
        "bestWhen": best,
        "losesWhen": loses,
        "decisions": decisions,
        "keepParts": keep,
        "proof": proof,
        "scores": scores(values, evidence),
        "gateResults": gates(boundary),
        "previewLabel": "interactive real-style Block stack",
        "story": story(),
        "media": [{
            "label": "Neutral-token ladder",
            "caption": "All three swatches are surface roles, not semantic colors; the direction differs in where it applies them.",
            "html": STYLE + '<div class="treatment-swatch"><span>canvas</span><span>quiet surface</span><span>recessed surface</span></div>',
        }],
        "preview": preview(treatment, note),
    }


def build_spec() -> dict:
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    variants = [
        variant(
            "v1", "Seam-only White",
            "Let structure do the work: one white silhouette, quiet one-pixel seams, and no background wash.",
            "#59636d", "Maximum neutrality matters and the existing border token already reads crisply.",
            "The canvas or display makes hairline separators hard to see.",
            [{"label": "Tone carrier", "value": "None; paper stays white."}, {"label": "Hierarchy", "value": "One-pixel seams between real child Blocks."}],
            ["single white silhouette", "quiet separator seam", "no added notation"],
            ["All three state buttons drive the same stack.", "Hiding footers leaves the existing member seam in place."],
            "treatment-seam", "A control direction: structure, not tint, identifies membership.", [5, 5, 5, 5, 5],
            ["The outer Block and flush children form one uninterrupted white silhouette.", "Titles and hairline seams scan without a competing fill pattern.", "Footer removal exposes the same member-to-member seam, so rhythm is unchanged.", "Only paper and border semantic roles are required.", "Nothing new competes with ports, text, or dataflow."],
            "A full-width border seam remains between if and else before and after footer removal.",
        ),
        variant(
            "v2", "Shared Recessed Well",
            "Place the whole stack on a continuous recessed bed so membership is read from containment rather than stripes.",
            "#6a7480", "The parent needs a little more separation from member surfaces on large sparse canvases.",
            "The five-pixel edge reveal feels like an accidental gutter at small zoom levels.",
            [{"label": "Tone carrier", "value": "One continuous gray bed behind every member."}, {"label": "Hierarchy", "value": "Shared containment with a narrow edge reveal."}],
            ["shared bed", "contained stack", "white member surfaces"],
            ["The well persists under both members as one continuous plane.", "Footer hiding does not strand any tone band."],
            "treatment-well", "The parent owns the tone; members stay white and directly adjacent.", [5, 4, 5, 5, 4],
            ["A continuous recessed plane visibly belongs to the parent rather than either member.", "The edge reveal clarifies containment but adds a second boundary beside each member.", "The parent bed is independent of footer height and remains complete when footers disappear.", "Paper, quiet surface, and border roles map directly to theme tokens.", "The treatment is neutral, though more visible than the seam-only control."],
            "Member seams remain visible over the parent-owned well in every state.",
        ),
        variant(
            "v3", "Alternating Body Bands",
            "Alternate pale member surfaces to make branch arms instantly traceable down a longer stack.",
            "#76808a", "A parent may contain many similar members and row tracking is the dominant need.",
            "Only two or three members are common, where zebra rhythm reads heavier than the content.",
            [{"label": "Tone carrier", "value": "Every other complete member surface."}, {"label": "Hierarchy", "value": "Repeated luminance rhythm."}],
            ["fast row tracking", "explicit member alternation", "footer-independent bands"],
            ["The same if member stays tinted with and without its footer.", "Inset mode demonstrates that alternation is independent of geometry."],
            "treatment-zebra", "Alternation favors scanning long stacks, at the cost of becoming a stronger visual grammar.", [4, 4, 5, 4, 2],
            ["Alternation binds the stack, though the two different surfaces slightly weaken the single-silhouette read.", "Each member is very easy to follow, but the striped rhythm competes with the titles.", "A band belongs to the whole member and therefore survives footer removal cleanly.", "Two neutral surface tokens work across themes but require careful contrast tuning.", "Zebra striping is the most noticeable and notation-like candidate."],
            "Alternating full-member surfaces keep both child boundaries legible without hover.",
        ),
        variant(
            "v4", "Header Wash",
            "Tint only each child header, turning titles into quiet section bars while leaving content on paper.",
            "#65717c", "Member titles are the main scan path and bodies can be visually sparse.",
            "A stack already has many labeled bands, where another header layer feels nested and busy.",
            [{"label": "Tone carrier", "value": "Child header rows only."}, {"label": "Hierarchy", "value": "Repeated title bars, like sections."}],
            ["scannable title bars", "white content field", "footer-independent hierarchy"],
            ["Both member names anchor a stable pale bar.", "Removing footers has no effect on the header-based hierarchy."],
            "treatment-header", "The title row carries the grouping cue, keeping the larger content surfaces clean.", [4, 5, 5, 5, 4],
            ["Flush members still share one outer shape, though repeated bars subdivide it strongly.", "Names and boundaries are immediate without tinting the data-bearing body.", "The grouping cue lives entirely in headers, so footer removal is lossless.", "The treatment uses the same quiet header surface role as existing chrome.", "The wash stays pale and localized, but introduces more horizontal bands."],
            "Each washed header begins a visibly separate member and a seam closes it below.",
        ),
        variant(
            "v5", "Inset Body Field",
            "Keep member frames flush, but recess only their content fields to create depth inside one continuous stack.",
            "#6c7781", "Member bodies contain rich material that benefits from a distinct working surface.",
            "Bodies are mostly empty, where the nested field looks decorative or like an input control.",
            [{"label": "Tone carrier", "value": "A rounded field inside each member body."}, {"label": "Hierarchy", "value": "Depth within members rather than between them."}],
            ["recessed content field", "white titles", "strong body affordance"],
            ["The body fields respond to footer removal without leaving extra bands.", "Inset mode shows the intentional nested-card cost."],
            "treatment-field", "A small recessed field makes member content feel editable, but adds a nested container level.", [3, 4, 4, 4, 3],
            ["The outer stack remains joined, but inner rounded fields weaken its flat continuous character.", "Each title/body pair is clear, though the body boxes can resemble form inputs.", "Footer hiding still produces complete body fields with intentional bottom spacing.", "Neutral body and border roles are portable with moderate token tuning.", "Localized depth is quieter than zebra bands but heavier than seams or header wash."],
            "Full-width member seams remain visible even though body content gains its own field.",
        ),
    ]
    return {
        "schemaVersion": 3,
        "title": "Five neutral backgrounds for edge-to-edge Block members",
        "kicker": "Member layout · Babble 5 · production winner deliberately unselected",
        "brief": "The production Block now has an Inset / Edge-to-edge structural switch. This separate study compares five background carriers for the Edge-to-edge state using the same Branch, members, and footer states; no candidate has been applied to production.",
        "count": 5,
        "defaultId": "v1",
        "defaultWhy": "Seam-only White is the provisional AI recommendation at 100/100: it leads every weighted criterion while adding no new notation. This is an advisory prune only; production remains visually neutral until Zach chooses.",
        "decisionHinge": "The recommendation hinges on hairline seams remaining visible at normal canvas zoom. If real usage shows they disappear, shifting 15 weight points from low visual weight to containment clarity makes Shared Recessed Well the safer direction.",
        "invariants": contract["invariants"],
        "boundary": contract["prototypeStopLine"],
        "axes": [
            {"name": "Tone carrier", "values": ["none", "parent bed", "alternating member", "member header", "member body field"]},
            {"name": "Hierarchy cue", "values": ["seams", "containment", "rhythm", "title bars", "depth"]},
            {"name": "Footer dependency", "values": ["all five are explicitly exercised shown and hidden"]},
        ],
        "requirements": contract["criteria"],
        "hardGates": [{"id": gate["id"], "name": gate["name"], "why": gate["passCondition"]} for gate in contract["hardGates"]],
        "variants": variants,
    }


def main() -> None:
    SPEC.write_text(json.dumps(build_spec(), indent=2) + "\n", encoding="utf-8")
    OUTPUT.unlink(missing_ok=True)
    subprocess.run([
        "python3", str(GALLERY), "build", "--spec", str(SPEC), "--output", str(OUTPUT), "--strict"
    ], check=True)
    subprocess.run(["python3", str(GALLERY), "check", "--input", str(OUTPUT), "--strict"], check=True)


if __name__ == "__main__":
    main()
