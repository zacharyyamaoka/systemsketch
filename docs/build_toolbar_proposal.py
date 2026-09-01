from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DOCS_DIR = PROJECT_ROOT / "docs"
BABBLE_GALLERY = Path("/home/bam/.agents/skills/babble/scripts/gallery.py")
SPEC_PATH = DOCS_DIR / "toolbar-proposal-2026-08-31.json"
STYLE_PATH = DOCS_DIR / "toolbar-proposal-2026-08-31.css"
SCRIPT_PATH = DOCS_DIR / "toolbar-proposal-2026-08-31.js"
OUTPUT_PATH = DOCS_DIR / "toolbar-proposal-2026-08-31.html"


IMPLEMENTATION_BLUEPRINT = r'''
    <section class="implementation-blueprint" aria-labelledby="implementation-heading">
      <div class="section-intro">
        <div>
          <div class="eyebrow">Provisional default · V1</div>
          <h2 id="implementation-heading">Implement one owned toolbar controller over stock tldraw tools</h2>
          <p>The visual shell is custom; canvas behavior stays upstream. Tool choice flows through tldraw's existing registry and editor, while last-used family state is a small user-interface preference—not document data.</p>
        </div>
        <span class="judgment-chip">proposal · not applied</span>
      </div>

      <div class="blueprint-flow" aria-label="Recommended implementation seams">
        <div class="blueprint-box host"><small>HOST CHROME</small><b>SystemSketchToolbar</b><span>seven slots · menus · active feedback</span></div>
        <i>→</i>
        <div class="blueprint-box controller"><small>NARROW CONTROLLER</small><b>useToolbarController</b><span>lastByFamily · arrowPreset · libraryOpen</span></div>
        <i>→</i>
        <div class="blueprint-box upstream"><small>STOCK TLDRAW 5.3.2</small><b>useTools + useEditor</b><span>tool states · geometry · styles · document</span></div>
        <div class="flow-branch">+</div>
        <div class="blueprint-box library"><small>HOST PANEL</small><b>ShapeLibrarySidebar</b><span>search · categories · insert actions</span></div>
      </div>

      <div class="blueprint-grid">
        <article class="implementation-card">
          <h3>State belongs in three different places</h3>
          <div class="state-row"><b>Document</b><span>Nothing. The selected tool and last-used subtype are not board content.</span></div>
          <div class="state-row"><b>tldraw editor</b><span>Current tool, <code>GeoShapeGeoStyle</code>, <code>ArrowShapeKindStyle</code>, and the next-shape styles.</span></div>
          <div class="state-row"><b>UI preference</b><span><code>lastByFamily</code> and <code>lastArrowPreset</code>, persisted under one namespaced local-storage key.</span></div>
        </article>

        <article class="implementation-card">
          <h3>The repeated-A contract</h3>
          <div class="state-machine">
            <span><b>Not Arrow</b><small>A</small></span><i>→</i><span><b>Recall last preset</b><small>straight by default</small></span>
            <span><b>Arrow active</b><small>A</small></span><i>→</i><span><b>Cycle preset</b><small>straight → curve → elbow</small></span>
            <span><b>R / O / L</b><small>any time</small></span><i>→</i><span><b>Shape slot mutates</b><small>rectangle / ellipse / line</small></span>
          </div>
        </article>

        <article class="implementation-card curve-caveat">
          <h3>One honest technical caveat: Curve is not a stock tool</h3>
          <p>tldraw already exposes <code>ArrowShapeKindStyle</code> for <b>arc</b> versus <b>elbow</b>. A straight arrow is an arc arrow with zero bend. A reusable curved preset therefore needs one narrow adapter that applies a non-zero bend to the newly created arrow; keep it guarded by the current preset and prove it in a real editor spike before building the rest of the chrome.</p>
        </article>
      </div>

      <div class="implementation-ladder">
        <div class="impl-rung"><b>1</b><span><strong>Shell first</strong>Replace only <code>components.Toolbar</code>; wire Cursor, Frame, Shape, Draw, Text, and existing tldraw tool actions. Keep + visual-only.</span><em>visual + selection proof</em></div>
        <div class="impl-rung"><b>2</b><span><strong>Family memory</strong>Add the slot controller and persist user preference outside the tldraw document. Verify leaving and returning to each family.</span><em>state + reload proof</em></div>
        <div class="impl-rung"><b>3</b><span><strong>Keyboard contract</strong>Override only R/O/L/A while the canvas owns focus; do nothing while editing text or typing in search.</span><em>real keyboard journey</em></div>
        <div class="impl-rung"><b>4</b><span><strong>Library vertical slice</strong>Open the sidebar, filter a small real catalog, and insert one stock geo shape. Add categories only after insertion works.</span><em>search → insert proof</em></div>
        <div class="impl-rung"><b>5</b><span><strong>Arrow presets + Comment</strong>Spike the curve adapter, use stock elbow style, then gate Comment on the licensed commenting tool being registered.</span><em>three-arrow + license proof</em></div>
      </div>

      <p class="seam-links"><b>Verified seams:</b> <a href="file:///home/bam/systemsketch/src/App.tsx">current mount</a> · <a href="file:///home/bam/systemsketch/node_modules/tldraw/src/lib/ui/context/components.tsx">Toolbar override</a> · <a href="file:///home/bam/systemsketch/node_modules/tldraw/src/lib/ui/hooks/useTools.tsx">stock tool registry</a> · <a href="file:///home/bam/systemsketch/node_modules/tldraw/src/lib/styles.tsx">arrow-kind styles</a></p>
    </section>
'''


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="toolbar-proposal-", dir=DOCS_DIR) as temp_dir:
        temp_output = Path(temp_dir) / OUTPUT_PATH.name
        subprocess.run(
            [
                "python3",
                str(BABBLE_GALLERY),
                "build",
                "--spec",
                str(SPEC_PATH),
                "--output",
                str(temp_output),
            ],
            check=True,
        )

        html = temp_output.read_text(encoding="utf-8")
        styles = STYLE_PATH.read_text(encoding="utf-8")
        script = SCRIPT_PATH.read_text(encoding="utf-8")
        # The current shared shell styles and validates the renamed synthesis field,
        # while its DOM and event hooks still use the former global-why id. Normalize
        # the generated artifact so the control, persistence, and strict check agree.
        html = html.replace(
            'class="global-why" id="global-why"',
            'class="global-synthesis" id="global-synthesis"',
            1,
        )
        html = html.replace('"global-why"', '"global-synthesis"')
        html = html.replace("</style>", f"\n/* SystemSketch toolbar prototypes */\n{styles}\n</style>", 1)
        html = html.replace('    <section class="checks">', f"{IMPLEMENTATION_BLUEPRINT}\n    <section class=\"checks\">", 1)
        html = html.replace("</body>", f"\n<script>\n{script}\n</script>\n</body>", 1)
        temp_output.write_text(html, encoding="utf-8")
        temp_output.replace(OUTPUT_PATH)
    print(OUTPUT_PATH)


if __name__ == "__main__":
    main()
