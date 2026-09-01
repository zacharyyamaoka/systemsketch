from __future__ import annotations

import base64
from pathlib import Path

DOCS_DIR = Path(__file__).resolve().parent
OUTPUT_PATH = DOCS_DIR / "wysiwyg-field-commit-2026-09-01.html"

SHOTS = {
    "before_typed": "field-commit-before-1-typed-2026-09-01.png",
    "before_canvas": "field-commit-before-2-clicked-canvas-2026-09-01.png",
    "before_sidebar": "field-commit-before-3-clicked-sidebar-2026-09-01.png",
    "after_typed": "field-commit-1-typed-2026-09-01.png",
    "after_canvas": "field-commit-2-clicked-canvas-2026-09-01.png",
    "after_reselected": "field-commit-3-reselected-2026-09-01.png",
}


def data_uri(name: str) -> str:
    encoded = base64.b64encode((DOCS_DIR / name).read_bytes()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


EXIT_ROUTES_SVG = """
<svg viewBox="0 0 1080 400" role="img" aria-label="Every route out of a text field, before and after the fix">
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="#8a91a0"/>
    </marker>
    <marker id="arrow-green" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="#28a461"/>
    </marker>
    <marker id="arrow-red" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="#d1435b"/>
    </marker>
  </defs>

  <text x="0" y="18" class="svg-title">BEFORE &mdash; the document is written by one event that the browser does not always send</text>
  <g class="svg-routes">
    <text x="0" y="52">Enter</text>
    <text x="0" y="80">click another panel control</text>
    <text x="0" y="108">click a tab</text>
    <text x="0" y="136">click the canvas &rarr; Block deselects &rarr; panel unmounts</text>
  </g>
  <path d="M250 46 L360 46" stroke="#8a91a0" stroke-width="1.6" marker-end="url(#arrow)" fill="none"/>
  <path d="M250 74 L360 74" stroke="#8a91a0" stroke-width="1.6" marker-end="url(#arrow)" fill="none"/>
  <path d="M250 102 L360 102" stroke="#8a91a0" stroke-width="1.6" marker-end="url(#arrow)" fill="none"/>
  <path d="M478 130 L560 130" stroke="#d1435b" stroke-width="1.8" stroke-dasharray="6 5" marker-end="url(#arrow-red)" fill="none"/>

  <rect x="360" y="30" width="118" height="88" rx="10" class="svg-box"/>
  <text x="419" y="68" class="svg-box-label" text-anchor="middle">blur</text>
  <text x="419" y="88" class="svg-box-sub" text-anchor="middle">fires</text>

  <path d="M478 74 L620 74" stroke="#28a461" stroke-width="1.8" marker-end="url(#arrow-green)" fill="none"/>
  <rect x="620" y="46" width="180" height="56" rx="10" class="svg-box svg-box--good"/>
  <text x="710" y="80" class="svg-box-label" text-anchor="middle">document written</text>

  <rect x="560" y="106" width="240" height="52" rx="10" class="svg-box svg-box--bad"/>
  <text x="680" y="138" class="svg-box-label svg-box-label--bad" text-anchor="middle">no blur &mdash; draft discarded</text>
  <text x="812" y="138" class="svg-note">Chrome fires no blur for a focused</text>
  <text x="812" y="156" class="svg-note">element removed from the DOM.</text>

  <line x1="0" y1="196" x2="1080" y2="196" class="svg-rule"/>

  <text x="0" y="238" class="svg-title">AFTER &mdash; every route is the same boundary, and the document already has the text</text>
  <g class="svg-routes">
    <text x="0" y="272">Enter &middot; Escape</text>
    <text x="0" y="300">click another panel control</text>
    <text x="0" y="328">click a tab</text>
    <text x="0" y="356">click the canvas &rarr; panel unmounts</text>
  </g>
  <path d="M250 266 L360 274" stroke="#28a461" stroke-width="1.6" marker-end="url(#arrow-green)" fill="none"/>
  <path d="M250 294 L360 290" stroke="#28a461" stroke-width="1.6" marker-end="url(#arrow-green)" fill="none"/>
  <path d="M250 322 L360 306" stroke="#28a461" stroke-width="1.6" marker-end="url(#arrow-green)" fill="none"/>
  <path d="M250 350 L360 322" stroke="#28a461" stroke-width="1.6" marker-end="url(#arrow-green)" fill="none"/>

  <rect x="360" y="256" width="180" height="80" rx="10" class="svg-box svg-box--good"/>
  <text x="450" y="290" class="svg-box-label" text-anchor="middle">gesture.commit()</text>
  <text x="450" y="312" class="svg-box-sub" text-anchor="middle">React lifecycle, not a DOM event</text>

  <path d="M540 296 L620 296" stroke="#28a461" stroke-width="1.8" marker-end="url(#arrow-green)" fill="none"/>
  <rect x="620" y="256" width="200" height="80" rx="10" class="svg-box svg-box--good"/>
  <text x="720" y="290" class="svg-box-label" text-anchor="middle">closes the undo step</text>
  <text x="720" y="312" class="svg-box-sub" text-anchor="middle">the text is already written</text>
  <text x="850" y="286" class="svg-note">Each keystroke wrote straight into</text>
  <text x="850" y="304" class="svg-note">the shape, so there is no second</text>
  <text x="850" y="322" class="svg-note">copy left to lose.</text>
</svg>
"""


def build() -> str:
    shots = {key: data_uri(name) for key, name in SHOTS.items()}
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SystemSketch &middot; WYSIWYG text fields</title>
  <style>
    :root {{
      color-scheme: light;
      --ink: #14161a;
      --muted: #626975;
      --line: #dfe3e9;
      --paper: #f7f8fa;
      --card: #ffffff;
      --accent: #5b5ee5;
      --accent-soft: #eeefff;
      --green: #177245;
      --green-soft: #e9f8ef;
      --red: #b32138;
      --red-soft: #fdecef;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }}
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; color: var(--ink); background: var(--paper); }}
    main {{ width: min(1180px, calc(100% - 40px)); margin: 0 auto; padding: 54px 0 90px; }}
    .eyebrow {{ margin: 0 0 12px; color: var(--accent); font: 750 12px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .1em; text-transform: uppercase; }}
    h1 {{ max-width: 900px; margin: 0; font-size: clamp(40px, 5.4vw, 70px); line-height: .98; letter-spacing: -.05em; }}
    .lede {{ max-width: 780px; margin: 24px 0 0; color: var(--muted); font-size: 20px; line-height: 1.55; }}
    .status {{ display: inline-flex; align-items: center; gap: 9px; margin-top: 26px; padding: 9px 13px; border: 1px solid #b9e3c9; border-radius: 999px; color: var(--green); background: var(--green-soft); font-weight: 720; font-size: 14px; }}
    .dot {{ width: 8px; height: 8px; border-radius: 50%; background: #28a461; box-shadow: 0 0 0 4px #ccefd9; }}
    section {{ margin-top: 60px; }}
    h2 {{ margin: 0 0 6px; font-size: 30px; letter-spacing: -.03em; }}
    h3 {{ margin: 0 0 8px; font-size: 18px; letter-spacing: -.015em; }}
    .sub {{ margin: 0 0 24px; max-width: 800px; color: var(--muted); font-size: 16px; line-height: 1.6; }}
    p {{ line-height: 1.65; }}
    .card {{ overflow: hidden; border: 1px solid var(--line); border-radius: 18px; background: var(--card); box-shadow: 0 12px 40px rgba(28, 34, 48, .05); }}
    .pad {{ padding: 22px 24px 24px; }}
    .journey {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }}
    .journey figure {{ margin: 0; }}
    .journey img {{ display: block; width: 100%; border-bottom: 1px solid var(--line); background: #fff; }}
    .journey figcaption {{ padding: 14px 16px 16px; }}
    .step {{ margin: 0 0 6px; color: var(--muted); font: 700 11px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .09em; text-transform: uppercase; }}
    .verdict {{ display: inline-block; margin-top: 8px; padding: 5px 9px; border-radius: 7px; font: 700 12px/1.2 system-ui, sans-serif; }}
    .verdict.bad {{ color: var(--red); background: var(--red-soft); }}
    .verdict.good {{ color: var(--green); background: var(--green-soft); }}
    .band {{ margin: 0 0 14px; padding: 10px 14px; border-radius: 10px; font: 700 13px/1.3 system-ui, sans-serif; }}
    .band.bad {{ color: var(--red); background: var(--red-soft); border: 1px solid #f4c3cd; }}
    .band.good {{ color: var(--green); background: var(--green-soft); border: 1px solid #b9e3c9; }}
    figcaption p {{ margin: 0; color: var(--muted); font-size: 14px; line-height: 1.55; }}
    svg {{ display: block; width: 100%; height: auto; }}
    .svg-title {{ font: 700 14px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; fill: #3c4250; letter-spacing: .02em; }}
    .svg-routes text {{ font: 500 14px/1.2 Inter, system-ui, sans-serif; fill: #4a515e; }}
    .svg-box {{ fill: #fff; stroke: #cfd4dc; stroke-width: 1.4; }}
    .svg-box--good {{ fill: var(--green-soft); stroke: #a9dcbe; }}
    .svg-box--bad {{ fill: var(--red-soft); stroke: #f0b7c3; }}
    .svg-box-label {{ font: 700 15px/1.2 Inter, system-ui, sans-serif; fill: #22262e; }}
    .svg-box-label--bad {{ fill: var(--red); }}
    .svg-box-sub {{ font: 500 12px/1.2 Inter, system-ui, sans-serif; fill: #6b7280; }}
    .svg-note {{ font: 500 12.5px/1.2 Inter, system-ui, sans-serif; fill: #7a828f; }}
    .svg-rule {{ stroke: #e3e7ed; stroke-width: 1.4; }}
    pre {{ margin: 0; padding: 18px 20px; overflow-x: auto; color: #e9ecf3; background: #16181d; font: 500 12.5px/1.7 ui-monospace, SFMono-Regular, Menlo, monospace; }}
    pre.diff {{ background: #14161a; }}
    .add {{ color: #7ee2a8; }}
    .del {{ color: #ff9aab; }}
    .dim {{ color: #8a91a0; }}
    .ok {{ color: #7ee2a8; }}
    .fail {{ color: #ff9aab; }}
    .two {{ display: grid; grid-template-columns: 1fr 1fr; gap: 18px; align-items: stretch; }}
    .two .card {{ display: flex; }}
    .two pre {{ flex: 1; }}
    .three {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 14.5px; }}
    th, td {{ padding: 13px 14px; text-align: left; border-bottom: 1px solid var(--line); vertical-align: top; line-height: 1.55; }}
    th {{ color: var(--muted); font-size: 11.5px; font-weight: 760; letter-spacing: .08em; text-transform: uppercase; }}
    tbody tr:last-child td {{ border-bottom: 0; }}
    code {{ padding: 2px 5px; border-radius: 5px; background: #eef0f4; font: 600 13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }}
    .files {{ display: grid; gap: 10px; }}
    .file {{ display: grid; grid-template-columns: 300px 1fr; gap: 16px; padding: 13px 15px; border: 1px solid var(--line); border-radius: 12px; background: var(--card); align-items: baseline; }}
    .file b {{ font: 700 13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }}
    .file span {{ color: var(--muted); font-size: 14px; line-height: 1.5; }}
    .open {{ margin-top: 14px; padding: 16px 18px; border: 1px dashed #c8ccd6; border-radius: 12px; background: #fff; }}
    .open p {{ margin: 0; font-size: 15px; }}
    @media (max-width: 900px) {{
      .journey, .two, .three {{ grid-template-columns: 1fr; }}
      .file {{ grid-template-columns: 1fr; gap: 4px; }}
    }}
  </style>
</head>
<body>
<main>
  <p class="eyebrow">SystemSketch &middot; Block, Ports &amp; Edges &middot; 1 Sep 2026</p>
  <h1>Whatever you type is already saved.</h1>
  <p class="lede">
    Renaming a port in the inspector and clicking onto the canvas dropped the edit. The panel's fields
    wrote the document on <code>blur</code> &mdash; and clicking the canvas deselects the Block, which
    unmounts the panel, and Chrome fires no <code>blur</code> for a focused element that is removed from
    the DOM. Every text box in the app now writes as you type, and every way out of a field is the same
    boundary.
  </p>
  <span class="status"><span class="dot"></span>9/9 real-browser checks &middot; 108 unit tests &middot; 24 Python tests &middot; zero console errors</span>

  <section>
    <h2>The journey, before and after</h2>
    <p class="sub">
      Same three moments as the bug report: type into a port field, click the canvas, then look again.
      The top row is the reported behaviour; the bottom row is the same journey driven by
      <code>tests/inspector_live_commit_smoke.mjs</code> in headless Chrome against the real app.
    </p>

    <div class="band bad">BEFORE &mdash; the port keeps its old name; the typed value never reached the document</div>
    <div class="journey">
      <figure class="card">
        <img src="{shots['before_typed']}" alt="Inspector with a port name typed into the field">
        <figcaption>
          <p class="step">1 &middot; typed</p>
          <p>&ldquo;Frame&rdquo; is in the field. The canvas still shows an unnamed port.</p>
        </figcaption>
      </figure>
      <figure class="card">
        <img src="{shots['before_canvas']}" alt="After clicking the canvas the port is still unnamed">
        <figcaption>
          <p class="step">2 &middot; clicked the canvas</p>
          <p>Panel gone, port still unnamed. The edit is lost with no warning.</p>
          <span class="verdict bad">value dropped</span>
        </figcaption>
      </figure>
      <figure class="card">
        <img src="{shots['before_sidebar']}" alt="Clicking the sidebar instead does commit the value">
        <figcaption>
          <p class="step">3 &middot; or clicked the sidebar</p>
          <p>The same edit survives &mdash; because that route happens to fire <code>blur</code>.</p>
          <span class="verdict good">value kept</span>
        </figcaption>
      </figure>
    </div>

    <div class="band good" style="margin-top:26px">AFTER &mdash; the canvas updates while you type, and clicking away changes nothing</div>
    <div class="journey">
      <figure class="card">
        <img src="{shots['after_typed']}" alt="Typing in the inspector updates the canvas live">
        <figcaption>
          <p class="step">1 &middot; typed</p>
          <p>The port reads &ldquo;Frame&rdquo; on the canvas with the caret still in the field.</p>
        </figcaption>
      </figure>
      <figure class="card">
        <img src="{shots['after_canvas']}" alt="After clicking the canvas the port keeps its new name">
        <figcaption>
          <p class="step">2 &middot; clicked the canvas</p>
          <p>Panel gone, name kept. Nothing had to be flushed on the way out.</p>
          <span class="verdict good">value kept</span>
        </figcaption>
      </figure>
      <figure class="card">
        <img src="{shots['after_reselected']}" alt="Re-selecting the Block reads the new name back from shape state">
        <figcaption>
          <p class="step">3 &middot; re-selected</p>
          <p>Read back from shape state &mdash; it is really in the document, not just on screen.</p>
          <span class="verdict good">in the document</span>
        </figcaption>
      </figure>
    </div>
  </section>

  <section>
    <h2>Why it happened</h2>
    <p class="sub">
      Not a missing handler &mdash; a missing event. The old field kept the text in React state and pushed
      it into the document on <code>blur</code>, so its correctness depended on the browser reporting an
      exit it does not report.
    </p>
    <div class="card pad">{EXIT_ROUTES_SVG}</div>
  </section>

  <section>
    <h2>The two loss-free policies &mdash; and which one is the default</h2>
    <p class="sub">
      What editors actually do: the local document is the source of truth and takes the keystroke
      immediately; the expensive parts &mdash; undo granularity, and any network or process boundary
      &mdash; are handled by <em>coalescing</em> rather than by delaying the write. Both policies below
      are loss-free, because unmount is an end boundary in both.
    </p>
    <div class="card">
      <table>
        <thead>
          <tr><th style="width:120px">Policy</th><th>What it does</th><th>Cost</th><th style="width:210px">Use it for</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>live</code><br><span style="color:var(--muted);font-size:12px">default</span></td>
            <td>Every keystroke writes straight into the shape. The document is the only copy of the text, so there is nothing left to lose.</td>
            <td>One in-memory store write per character. Already what the on-canvas editor does.</td>
            <td>Everything in the inspector today.</td>
          </tr>
          <tr>
            <td><code>exit</code></td>
            <td>Buffered, written once at the end boundary &mdash; including unmount, which is why it is still loss-free.</td>
            <td>The canvas lags the field until you leave it. Not WYSIWYG while typing.</td>
            <td>A field whose write is genuinely expensive.</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="open">
      <p><b>For the Python backend:</b> don't couple the rename RPC to the keystroke. The document write
      and the backend event are different boundaries, and the field model already separates them
      &mdash; <code>onWrite</code> fires per keystroke, <code>onEditEnd</code> fires exactly once per
      editing gesture with both the old and the new value. So a semantic
      <code>rename(port_id, from, to)</code> hangs off <code>onEditEnd</code> and the canvas never waits
      for the round trip. If you later want live streaming instead, subscribe to the store &mdash; no
      field code changes.</p>
    </div>
  </section>

  <section>
    <h2>What changed in the code</h2>
    <p class="sub">One editing contract, used by every text box. The panel's three bespoke draft editors are gone.</p>
    <div class="card"><pre class="diff"><span class="dim">src/blocks/ui/BlockInspector.tsx</span>
<span class="del">- function CommitInput({{ value, onCommit, ... }}) {{</span>
<span class="del">-   const [draft, setDraft] = useState(value)</span>
<span class="del">-   useEffect(() =&gt; setDraft(value), [value])</span>
<span class="del">-   const commit = () =&gt; {{ if (draft !== value) onCommit(draft) }}</span>
<span class="del">-   return &lt;input value={{draft}} onChange={{...}} onBlur={{commit}} /&gt;   // ← the only write path</span>
<span class="del">- }}</span>

<span class="add">+ &lt;LiveTextInput</span>
<span class="add">+   value={{port.name}}</span>
<span class="add">+   beginEdit={{() =&gt; actions?.beginEdit?.('rename block port')}}</span>
<span class="add">+   onWrite={{(name) =&gt; actions?.updatePort(side, port.id, {{ name }}, {{ continuous: true }})}}</span>
<span class="add">+ /&gt;</span>

<span class="dim">src/fields/LiveTextField.tsx &mdash; the line that fixes the bug</span>
<span class="add">+ // Unmount is an end boundary like any other, and it is the one the browser</span>
<span class="add">+ // refuses to report.</span>
<span class="add">+ useEffect(() =&gt; () =&gt; gesture.commit(), [gesture])</span></pre></div>
  </section>

  <section>
    <h2>A second bug the proof turned up</h2>
    <p class="sub">
      Writing per keystroke is only safe if the keystrokes are bounded in history. While checking that,
      the baseline probe showed the <em>on-canvas</em> editor &mdash; which already wrote live &mdash; had
      never bounded its own typing: undoing a rename merged into the Block's creation and
      <b>deleted the Block</b>. Both editors now stamp one history mark per editing session, lazily, on
      the first character that actually changes something.
    </p>
    <div class="two">
      <div class="card"><pre>$ node probe_baseline_undo.mjs   <span class="dim"># untouched on-canvas editor</span>
title: alpha
inline-editor undo #1: <span class="dim">"alpha"</span>
inline-editor undo #2: <span class="fail">null</span>      <span class="dim">← the Block is gone</span>
inline-editor undo #3: <span class="fail">null</span></pre></div>
      <div class="card"><pre>$ npm run test:fields            <span class="dim"># after</span>
<span class="ok">PASS</span>  one undo retracts a nine-keystroke inspector
      rename, not one character
<span class="ok">PASS</span>  undoing an on-canvas rename restores the previous
      title instead of deleting the Block</pre></div>
    </div>
  </section>

  <section>
    <h2>This is a requirement you already wrote down</h2>
    <p class="sub">
      Two FRs from the Workbench work say exactly this, and the behaviour here now matches both:
      <b>one gesture is one undo step</b> &mdash; the snapshot at gesture start, the commit at gesture
      end, so a rename is one Ctrl+Z; and <b>text keeps its native character-level undo</b> &mdash; while
      the caret is in a field, Ctrl+Z belongs to the field and must not reach past it and rip something
      off the canvas. tldraw already skips its own shortcuts when the event target is an input, and the
      ninth browser check now proves the Block behind the panel survives an undo pressed mid-edit. That
      FR recorded an honest coverage gap &mdash; &ldquo;inspector fields &hellip; not yet probed by a
      test&rdquo;. In this app they are.
    </p>
  </section>

  <section>
    <h2>Proof</h2>
    <p class="sub">
      The same journey, run against the real app in headless Chrome &mdash; not a component in isolation.
      The first run is the pre-fix code: it reproduces the report exactly.
    </p>
    <div class="two">
      <div class="card"><pre>$ node tests/inspector_live_commit_smoke.mjs   <span class="dim"># before</span>

  Port labels: <span class="fail">["out_1"]</span>

  <span class="fail">FAIL</span>  AssertionError: the port renamed in the
        inspector must survive clicking away onto
        the canvas
  + actual   <span class="fail">[ 'out_1' ]</span>
  - expected <span class="ok">[ 'Frame' ]</span></pre></div>
      <div class="card"><pre>$ npm run test:fields                         <span class="dim"># after</span>

  <span class="ok">PASS</span>  a port renamed in the inspector survives
        clicking straight onto the canvas
  <span class="ok">PASS</span>  the committed value is read back from shape
        state on re-selection
  <span class="ok">PASS</span>  clicking another inspector control commits
        the same way
  <span class="ok">PASS</span>  switching inspector tabs mid-edit commits
        instead of dropping the edit
  <span class="ok">PASS</span>  Escape exits the field and keeps the text,
        matching on-canvas editing
  <span class="ok">PASS</span>  Ctrl+Z inside a focused field stays in the
        field and never reaches the canvas
  <span class="ok">PASS</span>  one undo retracts a nine-keystroke inspector
        rename, not one character
  <span class="ok">PASS</span>  undoing an on-canvas rename restores the
        previous title instead of deleting the Block
  <span class="ok">PASS</span>  the physical journey produced zero local
        console errors

  <span class="ok">9/9 browser checks passed</span></pre></div>
    </div>
  </section>

  <section>
    <h2>Files</h2>
    <div class="files">
      <div class="file"><b>src/fields/fieldCommit.ts</b><span>The gesture: begin &rarr; write &rarr; end exactly once. Framework-free, 10 unit tests.</span></div>
      <div class="file"><b>src/fields/LiveTextField.tsx</b><span><code>useLiveField</code> plus <code>LiveTextInput</code> / <code>LiveTextArea</code>. Owns the unmount boundary.</span></div>
      <div class="file"><b>src/blocks/ui/BlockInspector.tsx</b><span>All seven panel fields migrated; <code>beginEdit</code> maps a gesture onto a tldraw history mark.</span></div>
      <div class="file"><b>src/blocks/BlockInlineEditor.tsx</b><span>On-canvas editing gets the same history bounding.</span></div>
      <div class="file"><b>tests/browser_harness.mjs</b><span>The CDP harness, lifted out of the context-menu smoke test so both share it.</span></div>
      <div class="file"><b>tests/inspector_live_commit_smoke.mjs</b><span>The eight real-browser checks and the three journey screenshots above.</span></div>
    </div>
  </section>

  <section>
    <h2>Two calls I made, both easy to reverse</h2>
    <div class="two">
      <div class="card pad">
        <h3>Escape exits, it does not discard</h3>
        <p style="margin:0;color:var(--muted);font-size:15px">
          tldraw's own Escape is a global cancel that deselects the shape and unmounts the panel before a
          field can react &mdash; and its on-canvas text editor keeps what you typed on Escape. Rather
          than fight that, Escape here means &ldquo;leave the field&rdquo;, and <b>Ctrl+Z</b> is the
          retract &mdash; one press for the whole rename. Say the word if you want Escape to revert
          instead; it needs the field to claim the key via <code>editor.markEventAsHandled</code>.
        </p>
      </div>
      <div class="card pad">
        <h3>The workspace dialogs were left alone</h3>
        <p style="margin:0;color:var(--muted);font-size:15px">
          Open / Save&nbsp;a&nbsp;copy / Rename keep their own text state and commit on the Save button.
          That is a modal transaction with an explicit Cancel, not a field that silently vanishes, so it
          is not the same defect. Everything else that takes typing now goes through the field contract.
        </p>
      </div>
    </div>
  </section>
</main>
</body>
</html>
"""


def main() -> None:
    OUTPUT_PATH.write_text(build(), encoding="utf-8")
    print(OUTPUT_PATH)


if __name__ == "__main__":
    main()
