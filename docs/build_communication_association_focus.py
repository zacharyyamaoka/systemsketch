#!/usr/bin/env python3
"""Build the self-contained communication association/focus implementation gallery."""

from __future__ import annotations

import base64
import html
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs" / "assets" / "communication-association-focus"
OUTPUT = ROOT / "docs" / "communication-association-focus-2026-09-04.html"


def data_uri(name: str) -> str:
    payload = base64.b64encode((ASSETS / name).read_bytes()).decode("ascii")
    return f"data:image/png;base64,{payload}"


def main() -> None:
    acceptance = json.loads((ASSETS / "acceptance.json").read_text(encoding="utf-8"))
    checks = "".join(f"<li>{html.escape(check)}</li>" for check in acceptance["checks"])
    views = [
        ("dataflow", "Canonical dataflow", "01-adversarial-dataflow.png", "Twenty-one ordinary directed wires; no communication records were added."),
        ("ids", "Tagged IDs", "02-tagged-reference-ids.png", "Every constituent leg repeats its stable A#, S#, T#, or ST# association."),
        ("tag-focus", "A2 leg focus", "03-tagged-a2-focus.png", "Click any move leg: all four A2 legs remain vivid and the other fifteen parsed legs dim."),
        ("components", "Six-way collision", "04-components-enumerated.png", "Same-pair Actions and Services collapse independently; same-stem Action/Service status do not collide."),
        ("elbow-focus", "A2 track reveal", "05-components-a2-focus-elbow.png", "The aggregate stays on goal while cancel, feedback, and result reappear on their exact canonical tracks."),
        ("straight-focus", "S4 centreline focus", "07-components-s4-focus-straight.png", "Straight relationships share the honest centreline; staggered ID labels keep each one clickable."),
    ]
    buttons = "".join(
        f'<button type="button" data-view="{key}" class="{"active" if index == 0 else ""}">{html.escape(label)}</button>'
        for index, (key, label, _image, _caption) in enumerate(views)
    )
    figures = "".join(
        f'<figure data-figure="{key}" class="{"active" if index == 0 else ""}">'
        f'<img src="{data_uri(image)}" alt="{html.escape(label)} screenshot from the real SystemSketch browser journey">'
        f'<figcaption><b>{html.escape(label)}</b><span>{html.escape(caption)}</span></figcaption></figure>'
        for index, (key, label, image, caption) in enumerate(views)
    )
    output = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Communication association IDs and focus · SystemSketch</title>
<style>
:root {{ color-scheme: light; --ink:#171c26; --muted:#657084; --line:#d9dee7; --paper:#fff; --wash:#f4f6f8; --blue:#3971dd; --orange:#d27a0a; --green:#118b6d; --purple:#7558d7; }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:#e9edf1; color:var(--ink); font-family:Inter,ui-sans-serif,system-ui,sans-serif; }}
main {{ width:min(1480px,calc(100% - 32px)); margin:16px auto 64px; overflow:hidden; border:1px solid #cfd5de; border-radius:20px; background:var(--paper); box-shadow:0 24px 70px rgba(20,28,42,.13); }}
header {{ display:grid; grid-template-columns:1.6fr .9fr; gap:40px; padding:56px 60px 48px; border-bottom:1px solid var(--line); background:linear-gradient(135deg,#10141d,#20283a); color:white; }}
.kicker,.eyebrow {{ margin:0 0 13px; color:#8fb4ff; font:800 11px/1.2 ui-monospace,monospace; letter-spacing:.14em; text-transform:uppercase; }}
h1 {{ max-width:900px; margin:0; font:760 clamp(36px,5vw,68px)/1.02 ui-monospace,monospace; letter-spacing:-.055em; }}
.lede {{ max-width:820px; margin:24px 0 0; color:#c7d0df; font-size:18px; line-height:1.55; }}
.score {{ align-self:end; display:grid; grid-template-columns:repeat(2,1fr); gap:10px; }}
.score div {{ min-height:104px; padding:18px; border:1px solid rgba(255,255,255,.15); border-radius:14px; background:rgba(255,255,255,.055); }}
.score b {{ display:block; font:760 30px/1 ui-monospace,monospace; }} .score span {{ display:block; margin-top:8px; color:#aeb9ca; font-size:12px; line-height:1.35; }}
section {{ padding:44px 60px; border-bottom:1px solid var(--line); }}
h2 {{ margin:0 0 10px; font:760 28px/1.15 ui-monospace,monospace; letter-spacing:-.035em; }}
.section-intro {{ max-width:870px; margin:0 0 24px; color:var(--muted); line-height:1.55; }}
.view-tabs {{ display:flex; flex-wrap:wrap; gap:7px; margin-bottom:12px; }}
.view-tabs button {{ padding:9px 12px; border:1px solid var(--line); border-radius:9px; background:white; color:var(--muted); cursor:pointer; font:750 11px/1 ui-monospace,monospace; }}
.view-tabs button.active {{ border-color:#8fb4ff; background:#eaf1ff; color:#245fc7; box-shadow:0 0 0 2px rgba(57,113,221,.12); }}
.viewer {{ overflow:hidden; border:1px solid var(--line); border-radius:16px; background:#f7f8fa; }}
figure {{ display:none; margin:0; }} figure.active {{ display:block; }} figure img {{ display:block; width:100%; aspect-ratio:11/6; object-fit:cover; object-position:center top; background:white; }}
figcaption {{ display:flex; justify-content:space-between; gap:30px; padding:15px 18px; border-top:1px solid var(--line); color:var(--muted); font-size:12px; }} figcaption b {{ color:var(--ink); font-family:ui-monospace,monospace; }}
.pipeline {{ display:grid; grid-template-columns:repeat(6,1fr); align-items:stretch; gap:8px; margin-top:26px; }}
.stage {{ position:relative; min-height:128px; padding:18px 16px; border:1px solid var(--line); border-radius:13px; background:var(--wash); }}
.stage:not(:last-child)::after {{ content:'→'; position:absolute; right:-15px; top:48px; z-index:2; display:grid; place-items:center; width:22px; height:28px; background:white; color:#7b8799; font-size:18px; }}
.stage b {{ display:block; margin-bottom:8px; font:750 12px/1.25 ui-monospace,monospace; }} .stage span {{ color:var(--muted); font-size:11px; line-height:1.45; }}
.contract {{ margin-top:20px; padding:16px 18px; border-left:4px solid var(--blue); background:#eef4ff; color:#34425b; font:650 12px/1.5 ui-monospace,monospace; }}
table {{ width:100%; border-collapse:separate; border-spacing:0; overflow:hidden; border:1px solid var(--line); border-radius:13px; font-size:12px; }} th,td {{ padding:11px 13px; border-bottom:1px solid var(--line); text-align:left; }} th {{ background:var(--wash); color:#4c5769; font:750 10px/1 ui-monospace,monospace; text-transform:uppercase; letter-spacing:.08em; }} tr:last-child td {{ border-bottom:0; }} .ref {{ font:800 12px/1 ui-monospace,monospace; }} .action {{ color:var(--orange); }} .service {{ color:var(--blue); }} .topic {{ color:var(--green); }} .stream {{ color:var(--purple); }}
.twocol {{ display:grid; grid-template-columns:1fr 1fr; gap:20px; }} .panel {{ padding:22px; border:1px solid var(--line); border-radius:14px; background:var(--wash); }} .panel h3 {{ margin:0 0 12px; font:750 15px/1.2 ui-monospace,monospace; }} .panel p {{ margin:0; color:var(--muted); font-size:13px; line-height:1.55; }}
.checks {{ columns:2; column-gap:34px; margin:20px 0 0; padding:0; list-style:none; }} .checks li {{ break-inside:avoid; margin:0 0 9px; padding:11px 13px 11px 34px; border:1px solid #cce7dc; border-radius:9px; background:#f0faf6; color:#315c4f; font-size:12px; line-height:1.35; }} .checks li::before {{ content:'✓'; float:left; margin-left:-21px; color:var(--green); font-weight:900; }}
footer {{ padding:24px 60px; color:var(--muted); font-size:11px; }} code {{ font-family:ui-monospace,monospace; }}
@media(max-width:900px) {{ header,.twocol {{ grid-template-columns:1fr; }} .pipeline {{ grid-template-columns:1fr 1fr; }} .stage::after {{ display:none!important; }} section,header {{ padding:32px 24px; }} .checks {{ columns:1; }} figcaption {{ flex-direction:column; gap:5px; }} }}
</style>
</head>
<body>
<main>
<header>
  <div><p class="kicker">SystemSketch · implemented V1</p><h1>One protocol, one readable identity.</h1><p class="lede">Strict port-name inference now groups each Action and Service without conflating neighbors. The same stable reference ID appears on every leg and on the collapsed component relationship; click either representation to isolate the whole protocol.</p></div>
  <div class="score"><div><b>21</b><span>canonical data edges in the adversarial browser proof</span></div><div><b>9</b><span>independently addressable relationships</span></div><div><b>2</b><span>ambiguous edges left visibly unresolved</span></div><div><b>0</b><span>stored graph records changed by the projection</span></div></div>
</header>

<section>
  <p class="eyebrow">Real browser evidence</p><h2>Read the association, then interrogate it.</h2>
  <p class="section-intro">These are real application states from one automated journey. The deliberately dense graph contains multiple Actions, multiple Services, a same-stem Action and Service, the same Service on two component pairs, Topic, Stream, and two malformed claims.</p>
  <div class="view-tabs">{buttons}</div><div class="viewer">{figures}</div>
</section>

<section>
  <p class="eyebrow">The V1 algorithm</p><h2>Names infer claims; graph facts decide identity.</h2>
  <div class="pipeline">
    <div class="stage"><b>1 · Read endpoints</b><span>Use the two bound component ports on each canonical data edge.</span></div>
    <div class="stage"><b>2 · Parse strictly</b><span>Recognize <code>interaction.phase</code>. A bare phase cannot create a multi-leg protocol.</span></div>
    <div class="stage"><b>3 · Reconcile claims</b><span>If both endpoints claim semantics, family, stem, and normalized phase must agree.</span></div>
    <div class="stage"><b>4 · Build identity</b><span>Group by unordered component pair + family + normalized interaction stem.</span></div>
    <div class="stage"><b>5 · Validate legs</b><span>Check required phases, duplicates, and request/return direction.</span></div>
    <div class="stage"><b>6 · Project paint</b><span>Assign stable family ordinals and render Tag or Components without persisting a second graph.</span></div>
  </div>
  <div class="contract">Association key = <b>(component A, component B, family, interaction name)</b>. This is why <code>status.goal</code> and <code>status.request</code> remain different, and why two <code>pose</code> Services on different component pairs remain independently focusable.</div>
</section>

<section>
  <p class="eyebrow">Observed grouping</p><h2>The reference designators are an audit surface.</h2>
  <p class="section-intro">Ordinals are assigned deterministically within each family after sorting by interaction name and component pair. They are view IDs, not new document records.</p>
  <table><thead><tr><th>ID</th><th>Family</th><th>Interaction</th><th>Legs</th><th>Why it does not collide</th></tr></thead><tbody>
    <tr><td class="ref action">A1</td><td>Action</td><td>dock</td><td>goal · feedback · result</td><td>Distinct interaction stem</td></tr>
    <tr><td class="ref action">A2</td><td>Action</td><td>move</td><td>goal · cancel · feedback · result</td><td>Distinct interaction stem</td></tr>
    <tr><td class="ref action">A3</td><td>Action</td><td>status</td><td>goal · result</td><td>Action family namespace</td></tr>
    <tr><td class="ref service">S1</td><td>Service</td><td>health</td><td>request · response</td><td>Distinct interaction stem</td></tr>
    <tr><td class="ref service">S2</td><td>Service</td><td>pose</td><td>request · response</td><td>Mission ↔ Runtime pair</td></tr>
    <tr><td class="ref service">S3</td><td>Service</td><td>pose</td><td>request · response</td><td>Supervisor ↔ Runtime pair</td></tr>
    <tr><td class="ref service">S4</td><td>Service</td><td>status</td><td>request · response</td><td>Service family namespace</td></tr>
    <tr><td class="ref topic">T1</td><td>Topic</td><td>telemetry</td><td>publish</td><td>Single-edge family</td></tr>
    <tr><td class="ref stream">ST1</td><td>Stream</td><td>scene</td><td>stream</td><td>Single-edge family</td></tr>
  </tbody></table>
</section>

<section>
  <div class="twocol">
    <div class="panel"><h3>Failure is visible</h3><p><code>goal → goal</code> has no interaction stem; <code>move.goal → dock.goal</code> has conflicting endpoint claims. Both remain gray instead of joining a plausible-but-wrong Action. The status card reports two issues.</p></div>
    <div class="panel"><h3>V2 seam stays narrow</h3><p>The renderer consumes normalized descriptors carrying provenance. A Dora YAML/source analyser can later emit explicit pattern, interaction ID, phase, side, and carrier claims through that seam; it does not need to replace grouping or paint.</p></div>
  </div>
</section>

<section>
  <p class="eyebrow">Acceptance</p><h2>{len(acceptance['checks'])} browser checks passed.</h2><ul class="checks">{checks}</ul>
</section>
<footer>Built from <code>tests/communication_association_focus_smoke.mjs</code> · generated {html.escape(acceptance['generatedAt'])} · screenshots embedded for a self-contained review artifact.</footer>
</main>
<script>
document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => {{
  document.querySelectorAll('[data-view], [data-figure]').forEach((node) => node.classList.remove('active'));
  button.classList.add('active');
  document.querySelector(`[data-figure="${{button.dataset.view}}"]`)?.classList.add('active');
}}));
</script>
</body>
</html>"""
    OUTPUT.write_text(output, encoding="utf-8")
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
