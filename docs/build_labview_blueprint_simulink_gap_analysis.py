#!/usr/bin/env python3
"""Build the source-backed LabVIEW / Blueprint / Simulink gap-analysis gallery.

This is a research artefact, deliberately not a product implementation.  It
reads the few current-SystemSketch facts it names from the live tree and embeds
the captured primary-source reference images as data URIs, so the resulting
HTML remains useful after a browser session or a source site disappears.
"""

from __future__ import annotations

import base64
import html
import io
import re
import subprocess
from pathlib import Path

from PIL import Image


REPO = Path(__file__).resolve().parents[1]
DOCS = REPO / "docs"
ASSETS = DOCS / "assets"
OUTPUT = DOCS / "labview-blueprint-simulink-vocabulary-controls-gap-analysis-2026-09-03.html"
SOURCE_NOTE = DOCS / "labview-blueprint-simulink-vocabulary-controls-gap-analysis-2026-09-03.md"


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=REPO, text=True, capture_output=True, check=False
    ).stdout.strip()


def read(path: str) -> str:
    return (REPO / path).read_text(encoding="utf-8")


def has(path: str, needle: str) -> bool:
    return needle in read(path)


HEAD = git("rev-parse", "--short", "HEAD")
BRANCH = git("branch", "--show-current") or "detached"
# The report's artifact is committed alongside the builder, so HEAD will always
# become a new commit as it is added. Name the stable source base instead of
# pretending the generated HTML could already contain its own future commit id.
BASE = git("merge-base", "HEAD", "main")[:7] or HEAD
CURRENT = {
    "branch": has("src/branch/branchModel.ts", "Branch"),
    "loop": has("src/loop/loopModel.ts", "Loop"),
    "views": all(
        has("src/blocks/blockModel.ts", word) for word in ("'simple'", "'port'", "'expanded'")
    ),
    "visible": has("src/blocks/blockModel.ts", "visible: T.boolean"),
    "default": has("src/blocks/blockModel.ts", "defaultValue: T.string.optional"),
    "effect": has("src/blocks/blockModel.ts", "effect: T.boolean.optional"),
    "async_style": has("src/blocks/connections/connectionModel.ts", "'async'"),
    "comments": has("src/comments/commentModel.ts", "CommentSourceReference"),
    "definition": has("src/blocks/definitions/definitionLinking.ts", "definition"),
}


def esc(value: object) -> str:
    return html.escape(str(value), quote=True)


def source(label: str, url: str) -> str:
    return f'<a href="{esc(url)}" target="_blank" rel="noreferrer">{esc(label)}</a>'


def image_uri(name: str, width: int = 1060) -> str | None:
    """Return a sensibly sized embedded JPEG, or None for an optional capture.

    Reference captures are evidence rather than production assets.  Resizing
    them here keeps a report portable without asking the reader to fetch any
    image from a vendor CDN.
    """
    path = ASSETS / name
    if not path.exists():
        return None
    image = Image.open(path).convert("RGB")
    if image.width > width:
        scale = width / image.width
        image = image.resize((width, max(1, round(image.height * scale))), Image.Resampling.LANCZOS)
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=87, optimize=True)
    return "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def evidence_image(name: str, alt: str, citation: str, url: str) -> str:
    uri = image_uri(name)
    if not uri:
        return (
            '<figure class="evidence missing"><div class="missing-art">'
            'Reference capture unavailable in this checkout.</div><figcaption>'
            f'{esc(alt)} · {source(citation, url)}</figcaption></figure>'
        )
    return (
        '<figure class="evidence"><img src="' + uri + '" alt="' + esc(alt) + '">'
        f'<figcaption>{esc(alt)} · {source(citation, url)}</figcaption></figure>'
    )


def current_image(name: str, alt: str, code_location: str) -> str:
    """Embed a real SystemSketch capture for the already-shipped bucket."""
    uri = image_uri(name)
    if not uri:
        return (
            '<figure class="evidence missing"><div class="missing-art">'
            'Current-SystemSketch capture unavailable in this checkout.</div><figcaption>'
            f'{esc(alt)} · <code>{esc(code_location)}</code></figcaption></figure>'
        )
    return (
        '<figure class="evidence"><img src="' + uri + '" alt="' + esc(alt) + '">'
        f'<figcaption>{esc(alt)} · current SystemSketch capture · <code>{esc(code_location)}</code></figcaption></figure>'
    )


def sketch_svg(label: str, drawing: str, view_box: str = "0 0 760 280") -> str:
    return (
        f'<svg class="proposal" viewBox="{view_box}" role="img" aria-label="{esc(label)}">'
        f'<title>{esc(label)}</title><defs><marker id="arrow" markerWidth="8" markerHeight="8" '
        'refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8z" fill="currentColor"/></marker></defs>'
        + drawing + '</svg>'
    )


FAULT_SKETCH = sketch_svg(
    "Original projection sketch of a source-recognized Python exception outcome",
    '''<rect x="34" y="99" width="188" height="76" rx="12" class="box"/><text x="128" y="130" class="title" text-anchor="middle">decode(payload)</text><text x="128" y="153" class="code" text-anchor="middle">try</text>
       <path d="M222 137 H382" class="data" marker-end="url(#arrow)"/><text x="302" y="123" class="small" text-anchor="middle">value</text>
       <rect x="382" y="99" width="148" height="76" rx="12" class="box"/><text x="456" y="142" class="title" text-anchor="middle">render</text>
       <path d="M128 99 V54 H595" class="fault" marker-end="url(#arrow)"/><circle cx="128" cy="99" r="6" class="fault-dot"/>
       <rect x="595" y="25" width="132" height="58" rx="12" class="fault-box"/><text x="661" y="51" class="title" text-anchor="middle">except</text><text x="661" y="71" class="code" text-anchor="middle">DecodeError</text>
       <text x="378" y="231" class="caption" text-anchor="middle">a source-level failure path, not a red pin on every call</text>''',
)

ASYNC_SKETCH = sketch_svg(
    "Original projection sketch of a source-recognized async queue or event relation",
    '''<rect x="35" y="105" width="164" height="64" rx="12" class="box"/><text x="117" y="143" class="title" text-anchor="middle">producer</text>
       <path d="M199 137 H294" class="async" marker-end="url(#arrow)"/><rect x="294" y="89" width="152" height="96" rx="14" class="async-box"/><text x="370" y="127" class="title" text-anchor="middle">asyncio.Queue</text><text x="370" y="153" class="code" text-anchor="middle">put / get</text>
       <path d="M446 137 H544" class="async" marker-end="url(#arrow)"/><rect x="544" y="105" width="168" height="64" rx="12" class="box"/><text x="628" y="143" class="title" text-anchor="middle">consumer</text>
       <text x="370" y="61" class="caption" text-anchor="middle">only when the analyzer recognizes a real asynchronous relation</text><text x="370" y="231" class="caption" text-anchor="middle">dashed packet treatment is a visual cue; Python source owns the meaning</text>''',
)

STATE_SKETCH = sketch_svg(
    "Original projection sketch of source-recognized explicit state modes",
    '''<rect x="52" y="35" width="656" height="196" rx="18" class="region"/><text x="78" y="69" class="small">recognized state machine / enum-controlled mode</text>
       <rect x="98" y="100" width="180" height="82" rx="14" class="state"/><text x="188" y="136" class="title" text-anchor="middle">Idle</text><text x="188" y="159" class="code" text-anchor="middle">on start</text>
       <rect x="478" y="100" width="180" height="82" rx="14" class="state active"/><text x="568" y="136" class="title" text-anchor="middle">Running</text><text x="568" y="159" class="code" text-anchor="middle">on stop</text>
       <path d="M278 123 C350 78 405 78 478 123" class="transition" marker-end="url(#arrow)"/><text x="380" y="88" class="small" text-anchor="middle">start event</text>
       <path d="M478 164 C404 212 350 212 278 164" class="transition" marker-end="url(#arrow)"/><text x="380" y="216" class="small" text-anchor="middle">stop event</text>''',
)

CONTRACT_SKETCH = sketch_svg(
    "Original projection sketch of Python-derived call contract badges",
    '''<rect x="119" y="33" width="524" height="207" rx="16" class="box"/><text x="381" y="72" class="title" text-anchor="middle">def connect(host, timeout=5, *, trace=False)</text>
       <line x1="144" y1="99" x2="618" y2="99" class="rule"/>
       <circle cx="144" cy="134" r="7" class="required-dot"/><text x="166" y="140" class="row-label">host</text><text x="575" y="140" class="badge req" text-anchor="end">required</text>
       <circle cx="144" cy="173" r="7" class="default-dot"/><text x="166" y="179" class="row-label">timeout = 5</text><text x="575" y="179" class="badge opt" text-anchor="end">defaulted</text>
       <circle cx="144" cy="212" r="7" class="keyword-dot"/><text x="166" y="218" class="row-label">trace = False</text><text x="575" y="218" class="badge kw" text-anchor="end">keyword-only</text>
       <text x="381" y="270" class="caption" text-anchor="middle">informs a reader from source; never imposes LabVIEW-style wire validation</text>''',
)

FIELD_SKETCH = sketch_svg(
    "Original projection sketch of source-derived named record field ports",
    '''<rect x="64" y="60" width="236" height="162" rx="14" class="box"/><text x="182" y="96" class="title" text-anchor="middle">User</text><line x1="88" y1="114" x2="276" y2="114" class="rule"/><text x="96" y="145" class="row-label">name: str</text><text x="96" y="179" class="row-label">role: Role</text>
       <path d="M300 139 H436" class="data" marker-end="url(#arrow)"/><path d="M300 173 H436" class="data soft" marker-end="url(#arrow)"/>
       <rect x="436" y="78" width="260" height="126" rx="14" class="region"/><text x="566" y="108" class="small" text-anchor="middle">source-backed field exposure</text><text x="466" y="146" class="row-label">● name</text><text x="466" y="180" class="row-label dim">○ role (collapsed)</text>
       <text x="381" y="266" class="caption" text-anchor="middle">selection is a presentation choice; field identities are from dataclass / TypedDict source</text>''',
)


SOURCES = [
    ("NI · Handling Errors", "LabVIEW error clusters carry status, code, and source through a dataflow; nodes pass an incoming error onward without executing.", "https://www.ni.com/docs/en-US/bundle/labview/page/handling-errors.html"),
    ("NI · Using Wires", "Distinguishes ordinary synchronous wires from async channel wires and documents their visual grammar.", "https://www.ni.com/docs/en-US/bundle/labview/page/using-wires-to-link-block-diagram-objects.html"),
    ("NI · Case Structures", "Documents selected case execution; used as calibration for the existing Branch region rather than a new palette proposal.", "https://www.ni.com/docs/en-US/bundle/labview/page/case-structures-executing-a-section-of-code-based-on-input-values.html"),
    ("NI · Create and Configure a SubVI", "Documents required, recommended, and optional terminal treatment; optional can be hidden and outputs cannot be required.", "https://knowledge.ni.com/KnowledgeArticleDetails?id=kA03q000000YK4VCAW&l=en-US"),
    ("NI · Arrays and Clusters Explained", "Documents named bundle/unbundle as a structured-record precedent.", "https://www.ni.com/en/support/documentation/supplemental/08/labview-arrays-and-clusters-explained.html"),
    ("Epic · Flow Control", "Documents Branch/Switch/Sequence and stateful Gate/DoOnce-style nodes.", "https://dev.epicgames.com/documentation/en-us/unreal-engine/flow-control-in-unreal-engine"),
    ("Epic · Struct Variables", "Documents Split Struct Pin, Set Members, Hide Unconnected Pins, and restoring a member with As Pin.", "https://dev.epicgames.com/documentation/en-us/unreal-engine/struct-variables-in-blueprints?application_version=4.27"),
    ("Epic · Cast To GameInstance", "Documents success and Cast Failed execution outputs alongside a narrowed typed value.", "https://dev.epicgames.com/documentation/en-us/unreal-engine/BlueprintAPI/Utilities/Casting/CastToGameInstance"),
    ("Epic · Custom Events", "Documents named events with input parameters, defaults, execution output, and multiple call sites.", "https://dev.epicgames.com/documentation/en-us/unreal-engine/custom-events-in-unreal-engine"),
    ("Epic · Creating Dispatcher Events", "Documents binding, event creation, and dispatcher execution only after binding.", "https://dev.epicgames.com/documentation/en-us/unreal-engine/creating-dispatcher-events-in-unreal-engine"),
    ("Epic · Nodes", "Documents collapsed graphs and their auto-generated boundary tunnel pins.", "https://dev.epicgames.com/documentation/en-us/unreal-engine/nodes-in-unreal-engine"),
    ("MathWorks · Stateflow", "Stateflow charts model finite state machines with states, transitions, events, and hierarchy.", "https://www.mathworks.com/help/stateflow/gs/get-started-introduction.html"),
    ("MathWorks · MATLAB Function", "Ports are generated from variables in function source; it validates source-as-text instead of a palette escape hatch.", "https://www.mathworks.com/help/simulink/slref/matlabfunction.html"),
    ("MathWorks · Dynamic Mask Dialog Boxes", "Masked-subsystem controls can show, hide, enable, or disable based on mask parameters.", "https://www.mathworks.com/help/simulink/ug/create-dynamic-mask-dialog-boxes.html"),
]


TRACK_A = [
    ("Branch / case / merge / φ", "LabVIEW Case; Blueprint Branch/Switch; Simulink If/Action", "Already have", "Branch regions are already a Python-shaped control-scope projection. Keep phi/merge as source analysis, not a palette block."),
    ("Loop / feedback / delay / timing", "LabVIEW loop + Feedback; Simulink delay", "Already have", "The Loop region and z⁻¹ delayed cable cover the useful grammar. Timed loops are runtime scheduler configuration, not Python syntax."),
    ("Exceptions, errors, and type-failure outcomes", "LabVIEW error wire; Blueprint Cast Failed", "Missing — useful", "A source-recognized try/except/raise or narrowing outcome is valuable; a synthetic error port on every call is not."),
    ("Async, queues, events, delegates, latent completion", "LabVIEW channel / queue; Blueprint dispatcher / async task; Stateflow events", "Missing — useful", "Show relations only when the analyzer recognizes async/await, queue, subscription, or emit semantics. Do not invent universal Success / Failure / Timeout pins."),
    ("Explicit state / mode machines", "Stateflow charts; Blueprint Gate/DoOnce calibration", "Missing — useful", "A state region could clarify explicit enum/state-machine source patterns, but needs an analyzer boundary before it can be built."),
    ("Records, structs, arrays, buses, member mutation", "LabVIEW Bundle By Name; Blueprint struct pins; Simulink bus", "Already have", "Existing named ports, splitter work, and top-edge effect exits are the useful starting grammar; generic collection operations remain source expressions."),
    ("Math, Boolean, numeric, collection-operation palettes", "All three ecosystems", "Missing — not useful", "These editors need libraries because they author programs visually. SystemSketch reads Python, so calls, literals, comprehensions, and operators should remain projected source."),
    ("Functions, macros, interfaces, formula/MATLAB Function", "Blueprint macros/interfaces; MATLAB Function", "Already have", "Canonical linked definitions and Python source already preserve the useful edit-once truth. Macro and formula palettes would create a second language."),
    ("Properties, invoke, variants, construction/spawn", "LabVIEW Property/Invoke; Blueprint Construct Object", "Missing — not useful", "Attribute access, reflection, constructors, and library APIs are ordinary source-level calls; no special renderer vocabulary follows."),
]


TRACK_B = [
    ("Simple / Port / Expanded presentation", "LabVIEW icon vs expandable node; Blueprint collapsed graph", "Already have", "All three current views already separate compact reading from exposed terminals; keep their semantics source-defined."),
    ("Visible ports and disconnected fields", "Blueprint Hide Unconnected Pins / As Pin", "Missing — useful", "Binary manual visibility exists. The meaningful next step is source-derived record-field exposure, never a user-created field schema."),
    ("Required / defaulted / keyword-only call contract", "LabVIEW required / recommended / optional terminals", "Missing — useful", "Python can truthfully derive required, defaulted, and keyword-only. Do not copy LabVIEW recommended as validation or make cables required."),
    ("Literal/default editing", "LabVIEW constants; Blueprint defaults", "Already have", "Default-value pills already distinguish definition defaults from a connected cable override."),
    ("Details inspector and source-linked comments", "Blueprint Details/comments; LabVIEW labels", "Already have", "Generic inspector controls and anchored, source-referenced comments are already stronger than a loose comment-box analogue."),
    ("Dynamic masks / custom parameter dialog authoring", "Simulink masked subsystem", "Missing — not useful", "An author-defined mask is a second UI/programming surface. A later generated source-linked configuration view is a different, narrower question."),
    ("Automatic hide-unconnected / pin add-remove behavior", "Blueprint pin menu; variadic node controls", "Missing — not useful", "Automatic wire-driven hiding would make the Python signature appear to change. Keep visibility a presentation choice and signatures source-owned."),
    ("Runtime-specific palette controls", "LabVIEW hardware/timing; Unreal game controls; Simulink simulation settings", "Missing — not useful", "These belong to their host runtimes, not to a renderer of Python semantics."),
]


CSS = r'''
:root{--ink:#18202b;--muted:#607080;--line:#d8dee7;--paper:#fff;--wash:#f4f7fb;--blue:#2866d6;--violet:#7049be;--red:#c3424a;--green:#1d805e;--amber:#ac6b00;--radius:14px}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#f5f7fa;color:var(--ink);font:16px/1.62 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{max-width:1280px;margin:auto;padding:34px 28px 86px}header{background:linear-gradient(135deg,#172b55,#2d5eb4 62%,#574294);color:#fff;border-radius:22px;padding:38px 42px 32px;box-shadow:0 16px 35px #1d326329}h1{font-size:clamp(30px,4.4vw,51px);letter-spacing:-.045em;line-height:1.05;margin:0 0 14px;max-width:900px}h2{font-size:27px;letter-spacing:-.025em;line-height:1.2;margin:55px 0 17px}h3{font-size:18px;margin:0 0 8px;line-height:1.3}.deck{max-width:880px;font-size:19px;line-height:1.54;margin:0;color:#e7efff}.eyebrow,.kicker{font-size:12px;text-transform:uppercase;letter-spacing:.11em;font-weight:750;color:#bcd3ff;margin-bottom:11px}.meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:24px}.chip{border:1px solid #ffffff49;border-radius:99px;padding:5px 9px;color:#eff5ff;font-size:12px}.nav{display:flex;flex-wrap:wrap;gap:6px;margin:20px 0 4px}.nav a{color:#315f9e;font-size:13px;background:#e8effa;padding:5px 10px;border-radius:99px;text-decoration:none}.lead{font-size:18px;max-width:1000px}.finding{background:linear-gradient(110deg,#eaf1ff,#f3efff);border:1px solid #cbd9f6;border-left:5px solid var(--blue);padding:17px 20px;border-radius:10px;margin:24px 0}.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;margin:22px 0}.fact,.card,.decision>div{background:var(--paper);border:1px solid var(--line);border-radius:var(--radius);padding:16px 18px}.fact b{font-size:20px;display:block;line-height:1.25}.fact span{font-size:13px;color:var(--muted);display:block;margin-top:4px}.ledger{width:100%;border-collapse:separate;border-spacing:0;background:var(--paper);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;font-size:13.2px}.ledger th,.ledger td{text-align:left;padding:11px 12px;border-bottom:1px solid var(--line);vertical-align:top}.ledger tr:last-child td{border-bottom:0}.ledger th{font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);background:#f8f9fb}.status{font-size:11.5px;font-weight:760;border-radius:99px;padding:4px 7px;white-space:nowrap}.have{color:#0f6a4c;background:#e7f6ef}.useful{color:#975700;background:#fff2d4}.skip{color:#5c6673;background:#edf0f4}.dictionary{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:12px}.dictionary .card p{font-size:14px;color:#495868;margin:0}.dictionary .sources{font-size:12.5px;margin-top:9px;color:var(--muted)}.current-evidence{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:18px 0 14px}.proposal-grid{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(300px,.92fr);gap:22px;margin:22px 0 34px;padding:20px;background:#f1f5fc;border:1px solid #d6e0f1;border-radius:18px}.proposal-wrap{background:#fff;border:1px solid var(--line);border-radius:13px;padding:8px}.proposal{width:100%;display:block;color:#304d82}.proposal .box{fill:#fff;stroke:#365c9c;stroke-width:2}.proposal .region{fill:#f2f6ff;stroke:#6a88bd;stroke-width:2}.proposal .state{fill:#f8fbff;stroke:#476ba5;stroke-width:2}.proposal .state.active{fill:#e2ecff;stroke:#2866d6;stroke-width:3}.proposal .data{fill:none;stroke:#2866d6;stroke-width:3}.proposal .data.soft{stroke:#7c9bd2}.proposal .async{fill:none;stroke:#7049be;stroke-width:4;stroke-dasharray:13 7}.proposal .async-box{fill:#f4efff;stroke:#7049be;stroke-width:2.5}.proposal .fault{fill:none;stroke:#c3424a;stroke-width:4;stroke-dasharray:9 6}.proposal .fault-dot{fill:#c3424a}.proposal .fault-box{fill:#fff1f1;stroke:#c3424a;stroke-width:2.5}.proposal .transition{fill:none;stroke:#476ba5;stroke-width:2.8}.proposal .rule{stroke:#d7deeb;stroke-width:1.5}.proposal .required-dot{fill:#2866d6}.proposal .default-dot{fill:#fff;stroke:#2866d6;stroke-width:2}.proposal .keyword-dot{fill:#7049be}.proposal text{font-family:Inter,system-ui,sans-serif;fill:#20314c}.proposal .title{font-size:17px;font-weight:700}.proposal .code{font-size:13px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;fill:#55657b}.proposal .small{font-size:12px;fill:#63738a}.proposal .caption{font-size:12px;fill:#65748a}.proposal .row-label{font-size:15px;font-weight:600}.proposal .dim{fill:#788797}.proposal .badge{font-size:11px;font-weight:800;letter-spacing:.05em}.proposal .req{fill:#2866d6}.proposal .opt{fill:#8a5b00}.proposal .kw{fill:#7049be}.evidence{margin:0;background:#fff;border:1px solid var(--line);padding:8px;border-radius:13px}.evidence img{display:block;width:100%;max-height:350px;object-fit:contain;border-radius:8px;background:#fff}.evidence figcaption{font-size:12.5px;color:var(--muted);padding:8px 4px 1px}.evidence-stack{display:grid;gap:12px}.missing-art{height:220px;display:grid;place-items:center;background:#f5f6f8;border-radius:8px;color:var(--muted);font-size:13px;text-align:center;padding:20px}.why{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}.why .card{border-top:4px solid var(--violet)}.decision{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}.decision h3{font-size:14px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}.decision ul{margin:0;padding-left:20px;font-size:14px}.decision li{margin:7px 0}.source-index{columns:2;column-gap:32px;font-size:13px}.source-index li{break-inside:avoid;margin:0 0 12px}.source-index span{color:var(--muted)}a{color:#1c57ba}footer{margin-top:55px;padding-top:18px;border-top:1px solid var(--line);font-size:12.5px;color:var(--muted)}.callout{border-left:4px solid var(--amber);background:#fff8e8;border-radius:8px;padding:14px 16px;font-size:14px}@media(max-width:780px){main{padding:18px 14px 55px}header{padding:28px 24px}.current-evidence,.proposal-grid{grid-template-columns:1fr}.source-index{columns:1}.ledger{display:block;overflow-x:auto;white-space:normal}.ledger th,.ledger td{min-width:140px}}
'''


def bucket(value: str) -> str:
    cls = "have" if value == "Already have" else "useful" if "useful" in value else "skip"
    return f'<span class="status {cls}">{esc(value)}</span>'


def ledger(rows: list[tuple[str, str, str, str]]) -> str:
    body = "".join(
        f"<tr><td><b>{esc(family)}</b></td><td>{esc(references)}</td><td>{bucket(status)}</td><td>{esc(verdict)}</td></tr>"
        for family, references, status, verdict in rows
    )
    return (
        '<table class="ledger"><thead><tr><th>semantic family</th><th>reference set</th>'
        '<th>disposition</th><th>SystemSketch reading</th></tr></thead><tbody>' + body + '</tbody></table>'
    )


def card(title: str, body: str, refs: str, state: str) -> str:
    return (
        '<article class="card"><div class="kicker" style="color:#607080">' + esc(state) + '</div>'
        f'<h3>{esc(title)}</h3><p>{body}</p><p class="sources">{refs}</p></article>'
    )


def build() -> str:
    stock = ", ".join(
        label for label, key in (
            ("Branch region", "branch"), ("Loop region", "loop"), ("Simple / Port / Expanded", "views"),
            ("binary port visibility", "visible"), ("default-value pill", "default"),
            ("top-edge effect port", "effect"), ("async cable style", "async_style"),
            ("source-linked comments", "comments"), ("linked definitions", "definition"),
        ) if CURRENT[key]
    )
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>LabVIEW, Unreal Blueprint &amp; Simulink — Vocabulary and UI Controls Gap Analysis</title><style>{CSS}</style></head><body><main>
<header><div class="eyebrow">SystemSketch · research-only work order · 2026-09-03</div><h1>LabVIEW, Unreal Blueprint &amp; Simulink<br>Vocabulary and UI Controls Gap Analysis</h1><p class="deck">A source-canonical renderer can borrow mature editors’ reading grammar without becoming a fourth visual programming language.</p><div class="meta"><span class="chip">based on {esc(BASE)}</span><span class="chip">{esc(BRANCH)}</span><span class="chip">primary-source evidence</span><span class="chip">no product code changed</span></div></header>
<nav class="nav"><a href="#framing">framing</a><a href="#track-a">A · vocabulary</a><a href="#projections">four useful projections</a><a href="#track-b">B · controls</a><a href="#decision">decision surface</a><a href="#sources">sources</a></nav>

<section id="framing"><h2>The answer in one sentence</h2><p class="lead"><b>Do not build a palette.</b> The cross-tool signal is to add a small number of <em>source-recognized semantic projections</em>—failure outcomes, async/event relations, perhaps explicit state modes—and to refine source-derived contracts and field exposure. Everything else mostly serves environments that author executable graphs directly.</p><div class="finding"><b>Filter used throughout:</b> SystemSketch projects real Python and preserves a hackable canvas; it does not replace Python with LabVIEW VIs, Blueprint graphs, or Simulink models. A visual idea earns a future seam only if it makes a recognizable Python fact or dependency clearer without inventing another program to maintain.</div><div class="facts"><div class="fact"><b>{esc(stock)}</b><span>Verified in the live tree; these are current grammar, not requests.</span></div><div class="fact"><b>3 mature tools</b><span>NI LabVIEW, Epic Unreal Blueprint, and MathWorks Simulink / Stateflow, using official documentation only.</span></div><div class="fact"><b>2 axes</b><span>Node/block vocabulary (Track A) and UI controls (Track B), kept separate so a UI precedent cannot smuggle in a language feature.</span></div><div class="fact"><b>4 candidates</b><span>Exception outcome, async relation, state mode, and source-derived contract/field exposure are the only positive gaps surfaced here.</span></div></div></section>

<section id="track-a"><h2>Track A · node and block vocabulary</h2><p>The ledger is deliberately exhaustive at the work-order family level. “Already have” means the useful <em>renderer grammar</em> is already shipped, not that SystemSketch is claiming feature parity with an authoring-first IDE.</p>{ledger(TRACK_A)}<div class="current-evidence">{current_image("branch-region-3-wired.png", "Current SystemSketch Branch region with visible exclusive paths and join", "src/branch/branchModel.ts")} {current_image("effect-ports-3-wired-2026-09-03.png", "Current SystemSketch top-edge effect exit from a mutating call", "src/blocks/effectPorts.test.ts")}</div><p class="callout"><b>Already-shipped evidence.</b> These real SystemSketch captures show the distinction this research preserves: regions read Python control scope; an effect exit distinguishes an in-place write from a normal return. Neither image claims a general exception rail, statechart, or new visual authoring palette.</p><div class="dictionary"><!-- concise cross-tool dictionary -->
{card("Fault flow is a distinct outcome, not generic plumbing", "LabVIEW makes error propagation explicit; Blueprint makes a cast failure a distinct execution path. The useful commonality is <b>outcome separation</b>. Python earns it only at <code>try/except/raise</code>, typed narrowing, or another analyzer-proven boundary—not at every ordinary call.", source("NI error handling", "https://www.ni.com/docs/en-US/bundle/labview/page/handling-errors.html") + " · " + source("Epic cast", "https://dev.epicgames.com/documentation/en-us/unreal-engine/BlueprintAPI/Utilities/Casting/CastToGameInstance"), "convergent")}
{card("Async vocabulary needs a semantic trigger", "LabVIEW’s channel wires, Blueprint dispatcher bindings, and Stateflow events all distinguish a relation that is not ordinary synchronous value flow. The shared lesson is a <b>relation grammar</b>, not a blanket dashed cable style. The source must prove queueing, subscription, <code>async/await</code>, or emission.", source("NI async channel wires", "https://www.ni.com/docs/en-US/bundle/labview/page/using-wires-to-link-block-diagram-objects.html") + " · " + source("Epic dispatcher", "https://dev.epicgames.com/documentation/en-us/unreal-engine/creating-dispatcher-events-in-unreal-engine") + " · " + source("Stateflow", "https://www.mathworks.com/help/stateflow/gs/get-started-introduction.html"), "convergent")}
{card("State is an opt-in semantic region", "Stateflow proves why named modes, transitions, and events are legible. Blueprint’s Gate / DoOnce nodes are a warning: hidden runtime state should not become an arbitrary generic node. A future state region needs a narrow, explainable Python recognition rule.", source("MathWorks Stateflow", "https://www.mathworks.com/help/stateflow/gs/get-started-introduction.html") + " · " + source("Epic flow control", "https://dev.epicgames.com/documentation/en-us/unreal-engine/flow-control-in-unreal-engine"), "convergent")}
{card("Text escape hatches validate the source premise", "Simulink’s MATLAB Function derives ports from function variables, while Blueprint macros and LabVIEW subVIs package authored graph semantics. The former aligns with SystemSketch’s source-first model; the latter should not create an editable visual macro language.", source("MATLAB Function", "https://www.mathworks.com/help/simulink/slref/matlabfunction.html") + " · " + source("Epic macros", "https://dev.epicgames.com/documentation/en-us/unreal-engine/macros-in-unreal-engine?lang=en-US"), "contrast")}
</div></section>

<section id="projections"><h2>Four useful projections, sketched—not implemented</h2><p>Each left-hand image is an official reference capture. Each right-hand diagram is original SystemSketch proposal art, deliberately labelled as a projection hypothesis rather than a product mockup.</p>
<div class="proposal-grid"><div class="evidence-stack">{evidence_image("gap-labview-error-wire-2026-09-03.png", "NI LabVIEW error propagation diagram", "NI · Handling Errors", "https://www.ni.com/docs/en-US/bundle/labview/page/handling-errors.html")}{evidence_image("gap-blueprint-cast-failure-2026-09-03.png", "Epic Blueprint cast nodes with explicit Cast Failed outcomes", "Epic · Blueprint Communications", "https://dev.epicgames.com/documentation/en-us/unreal-engine/blueprint-communications-in-unreal-engine")}</div><div class="proposal-wrap">{FAULT_SKETCH}<p class="callout"><b>Candidate 1 · Exception outcome.</b> Make a separate fault path visible only when Python source says there is one. LabVIEW and Blueprint both make an abnormal outcome readable; neither mandates pervasive synthetic error pins in Python.</p></div></div>
<div class="proposal-grid"><div>{evidence_image("gap-labview-async-channel-2026-09-03.png", "NI LabVIEW ordinary and asynchronous channel wire comparison", "NI · Using Wires", "https://www.ni.com/docs/en-US/bundle/labview/page/using-wires-to-link-block-diagram-objects.html")}</div><div class="proposal-wrap">{ASYNC_SKETCH}<p class="callout"><b>Candidate 2 · Async / event relation.</b> Preserve the existing visual vocabulary as a presentation cue, then attach actual meaning only to recognized queues, subscriptions, callbacks, <code>async</code>, or <code>await</code>.</p></div></div>
<div class="proposal-grid"><div>{evidence_image("gap-stateflow-state-transition-2026-09-03.png", "MathWorks Stateflow state and transition example", "MathWorks · Stateflow getting started", "https://www.mathworks.com/help/stateflow/gs/get-started-introduction.html")}</div><div class="proposal-wrap">{STATE_SKETCH}<p class="callout"><b>Candidate 3 · Explicit state mode.</b> This is high explanatory value but also high semantic cost. It waits for Zach to settle which Python patterns can soundly be called an explicit state machine.</p></div></div>
<div class="proposal-grid"><div>{evidence_image("gap-blueprint-struct-pins-2026-09-03.png", "Epic Blueprint named struct fields with visibility controls", "Epic · Struct Variables", "https://dev.epicgames.com/documentation/en-us/unreal-engine/struct-variables-in-blueprints?application_version=4.27")}</div><div class="proposal-wrap">{CONTRACT_SKETCH}{FIELD_SKETCH}<p class="callout"><b>Candidate 4 · Source-derived call and field contract.</b> LabVIEW’s terminal hierarchy and Blueprint’s As Pin behavior converge on readable interfaces. Python offers a more truthful substrate: required vs defaulted vs keyword-only parameters, and dataclass / TypedDict fields whose identity comes from source.</p></div></div>
</section>

<section id="track-b"><h2>Track B · UI controls</h2><p>Controls are classified by what they change: presentation controls can be borrowed freely; semantic controls must be derivable from source; host-runtime controls do not belong in the renderer.</p>{ledger(TRACK_B)}<div class="dictionary">
{card("Signature status, not wiring legality", "LabVIEW’s bold/plain/dim terminal hierarchy is useful as a reading cue. For Python, the honest statuses are <b>required</b>, <b>defaulted</b>, and <b>keyword-only</b>. ‘Recommended’ has no equivalent semantic force and should never turn an unconnected wire into an invalid program.", source("NI SubVI connector pane", "https://knowledge.ni.com/KnowledgeArticleDetails?id=kA03q000000YK4VCAW&l=en-US"), "useful, source-derived")}
{card("Field exposure, not handmade schemas", "Blueprint makes selected struct members visible as pins. SystemSketch’s existing boolean visibility is a coarse analogue. The improvement is to derive named field candidates from dataclass / TypedDict / record source, then let a reader collapse them without changing the definition.", source("Epic Struct Variables", "https://dev.epicgames.com/documentation/en-us/unreal-engine/struct-variables-in-blueprints?application_version=4.27"), "useful, source-derived")}
{card("Masks are the wrong authority boundary", "Simulink masks can dynamically show, hide, and enable custom dialog controls. That is useful in a tool that authors parameterized subsystems. It would create a second editable configuration language here. A future generated source-linked configuration view is a separate question.", source("MathWorks dynamic masks", "https://www.mathworks.com/help/simulink/ug/create-dynamic-mask-dialog-boxes.html"), "not useful now")}
{card("Current comments already exceed grouping comments", "Blueprint comment boxes group and move nodes; LabVIEW labels document a board. SystemSketch’s comment model keeps a shape/point/region anchor plus optional Python source reference, so it has the more durable identity model already.", source("Epic comments", "https://dev.epicgames.com/documentation/unreal-engine/comments-in-unreal-engine?lang=en-US"), "already have")}
</div></section>

<section><h2>Your thinking, sharpened</h2><div class="why"><article class="card"><h3>1 · Error wire: copy the contract, not the plumbing</h3><p>The mature-tool convergence is that failure needs a first-class reading path. The Python-native translation is a source-aware exception/outcome region, not a colored terminal added to every block.</p></article><article class="card"><h3>2 · “Async” has to mean more than a dash pattern</h3><p>The shipped async cable style is valuable presentation vocabulary. Its semantic promotion should be conditional on a recognized queue, await, event registration, or callback relation—otherwise the drawing claims runtime facts it cannot know.</p></article><article class="card"><h3>3 · Interface hierarchy has a clean Python translation</h3><p>Required/defaulted/keyword-only is more accurate than LabVIEW’s required/recommended/optional and does not turn a rendering preference into validation logic.</p></article><article class="card"><h3>4 · State machines are worth a named threshold</h3><p>Stateflow is compelling precisely because it gives state an explicit model. That makes it a strong candidate only after the analyzer can name a narrow pattern; the generic Blueprint stateful nodes demonstrate the cost of faking it.</p></article><article class="card"><h3>5 · The work order’s mutation gap is partly stale</h3><p>Top-edge effect ports now exist for mutating inputs. They are not a truly portless effect rail, but they already preserve the important distinction between a named returned value and an in-place write.</p></article><article class="card"><h3>6 · Canvas controls should never author hidden semantics</h3><p>Collapse, field visibility, and comments can be presentation choices. Dynamic mask fields, automatic pin manufacture, and palette-specific runtime controls would cross the source-canonical boundary.</p></article></div></section>

<section id="decision"><h2>Decision surface</h2><div class="decision"><div><h3>Done</h3><ul><li>Primary-source, two-axis dictionary with an explicit disposition for every in-scope family.</li><li>Audited current SystemSketch primitives instead of relying on the work order’s starting inventory.</li><li>Captured official reference visuals and produced original projection sketches; no product behavior was changed.</li></ul></div><div><h3>Left</h3><ul><li>Write analyzer contracts for exception / narrowing outcomes and async/event relations before any canvas seam.</li><li>Define the smallest source patterns eligible for named state modes.</li><li>Prototype source-derived parameter and record-field badges after the analyzer boundary exists.</li></ul></div><div><h3>Needs Zach</h3><ul><li>Which Python idioms count as a state machine worth projecting?</li><li>Should the first outcome projection be <code>try/except/raise</code>, type narrowing, or both?</li><li>Should call-contract and field badges lead the next low-risk visual pass?</li></ul></div><div><h3>Deliberately not done</h3><ul><li>No draggable LabVIEW / Blueprint / Simulink node palette.</li><li>No synthetic error wire on every function call.</li><li>No author-defined mask/dialog layer, automatic wire-driven signature changes, or host-runtime palette controls.</li><li>No SystemSketch source or product-code changes; this is evidence for a later choice.</li></ul></div></div></section>

<section id="sources"><h2>Primary-source index</h2><ol class="source-index">{''.join(f'<li><b>{esc(name)}</b><br><span>{esc(description)}</span><br>{source(name, url)}</li>' for name, description, url in SOURCES)}</ol></section>
<footer>Canonical research source: <code>{esc(SOURCE_NOTE.relative_to(REPO))}</code>. Rendered by <code>docs/build_labview_blueprint_simulink_gap_analysis.py</code> from base <code>{esc(BASE)}</code>. The vendor captures are embedded at build time; all original blue diagrams are proposals, not claims about shipped UI.</footer>
</main></body></html>'''


if __name__ == "__main__":
    OUTPUT.write_text(build(), encoding="utf-8")
    print(OUTPUT)
