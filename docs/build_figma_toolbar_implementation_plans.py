from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DOCS_DIR = PROJECT_ROOT / "docs"
BABBLE_GALLERY = Path("/home/bam/.agents/skills/babble/scripts/gallery.py")
SPEC_PATH = DOCS_DIR / "figma-toolbar-implementation-plans-2026-08-31.json"
STYLE_PATH = DOCS_DIR / "figma-toolbar-implementation-plans-2026-08-31.css"
SCRIPT_PATH = DOCS_DIR / "figma-toolbar-implementation-plans-2026-08-31.js"
OUTPUT_PATH = DOCS_DIR / "figma-toolbar-implementation-plans-2026-08-31.html"


TECHNICAL_APPENDIX = r'''
    <section class="implementation-recommendation" aria-labelledby="recommendation-heading">
      <div class="section-intro">
        <div>
          <div class="eyebrow">Recommendation · P1</div>
          <h2 id="recommendation-heading">Compose upstream first; own only the missing concepts</h2>
          <p>Start with <code>DefaultToolbar</code> as the chassis and treat the seven Figma families as a projection over tldraw's stock tool registry. This preserves tldraw's keyboard suppression, focus semantics, accessibility announcements, responsive overflow, tool analytics, shared styles, and editor behavior. SystemSketch owns four narrow things: family recall, the exact seven-slot projection, Curve's non-zero-bend preset, and library content.</p>
        </div>
        <span class="judgment-chip">91 / 100 · provisional pick</span>
      </div>
      <div class="recommendation-grid">
        <article class="recommendation-card">
          <b>Why this is more off-the-shelf than the original V1 blueprint</b>
          <p>The original proposal assumed an owned toolbar controller. Source inspection found a smaller seam: public <code>DefaultToolbar</code> accepts custom children, <code>OverflowingToolbar</code> already preserves the last active overflow item, and <code>TLUiOverrides.tools</code> lets R/O/L/A keep using the stock keyboard registry. That removes owned focus, raw keyboard, a11y announcement, and overflow systems.</p>
        </article>
        <article class="hinge-card">
          <b>When to switch to P2</b>
          <p>If hiding DefaultToolbar extras or matching Figma's exact responsive chrome becomes brittle in the first spike, stop and move only the shell to P2. The tool overrides, preference model, Curve adapter, library catalog, and tests all survive that switch.</p>
        </article>
      </div>
    </section>

    <section class="api-seam-table" aria-labelledby="seam-heading">
      <div class="section-intro">
        <div>
          <div class="eyebrow">Responsibility map</div>
          <h2 id="seam-heading">What each plan reuses versus owns</h2>
          <p>The percentages in the prototypes are conceptual responsibility, not predicted lines of code. The meaningful distinction is which side must maintain behavior after a tldraw upgrade.</p>
        </div>
      </div>
      <div class="seam-table-wrap">
        <table class="seam-table">
          <thead><tr><th>Surface</th><th>P1 · Compose Upstream</th><th>P2 · Own Controller</th><th>P3 · Preset Tools</th></tr></thead>
          <tbody>
            <tr><td>Toolbar layout</td><td class="winner">tldraw <code>DefaultToolbar</code> + overflow</td><td>Host-owned seven-slot DOM/CSS</td><td>Host-owned catalog DOM/CSS</td></tr>
            <tr><td>Buttons, menus, focus</td><td class="winner">tldraw primitives and contexts</td><td>tldraw primitives; host composition</td><td>tldraw primitives; host composition</td></tr>
            <tr><td>R / O / L</td><td class="winner">Stock tool items and keyboard registry</td><td>Stock registry → host commands</td><td>Catalog descriptors → tools</td></tr>
            <tr><td>Repeated A</td><td class="winner">Wrapped stock Arrow <code>onSelect</code></td><td>Owned reducer called by stock registry</td><td>Cycle first-class preset tool IDs</td></tr>
            <tr><td>Straight / Elbow</td><td class="winner">Stock arrow + <code>ArrowShapeKindStyle</code></td><td>Same stock style boundary</td><td>Custom StateNodes create stock shapes</td></tr>
            <tr><td>Curve</td><td class="winner">One guarded before-create bend</td><td>Controller-driven before-create bend</td><td>Owned pointing/create tool behavior</td></tr>
            <tr><td>Family recall</td><td>Small shared UI preference store</td><td>Owned reducer + preference store</td><td>Tool ID + last-family catalog state</td></tr>
            <tr><td>Library</td><td class="winner">Stock popover/focus; host catalog</td><td>Host sidebar/focus; stock primitives</td><td>Shared host descriptor catalog</td></tr>
            <tr><td>Board document</td><td class="winner">100% stock tldraw records</td><td>100% stock tldraw records</td><td>100% stock shapes; custom tool states only</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="implementation-slices" aria-labelledby="slices-heading">
      <div class="section-intro">
        <div>
          <div class="eyebrow">P1 delivery plan</div>
          <h2 id="slices-heading">Five closed vertical slices</h2>
          <p>Each slice ends with observable behavior in the deployed Preview. Do not build the full library or commenting setup before the selected-tool loop works end to end.</p>
        </div>
      </div>
      <div class="slice-list">
        <article class="slice-row">
          <b>0</b>
          <div><strong>Prove the two uncertain seams</strong><p>Spike a Figma-slot child inside <code>DefaultToolbar</code>, confirm the seven direct children survive overflow duplication, and register a guarded arrow before-create handler that produces a visible curve while leaving pasted/imported arrows unchanged. Inspect whether <code>tools.comment</code> is actually registered under the current license/package set.</p></div>
          <div class="slice-proof"><small>EXIT PROOF</small><p>One stock Rectangle click, one repeated-A Curve creation, one narrow-width overflow check, and an explicit Comment capability result.</p></div>
        </article>
        <article class="slice-row">
          <b>1</b>
          <div><strong>Ship the stock-backed seven-slot shell</strong><p>Add <code>src/toolbar/SystemSketchToolbar.tsx</code> and scoped <code>systemsketch-toolbar.css</code>. Extend the existing <code>SYSTEMSKETCH_COMPONENTS</code> in <code>src/App.tsx</code> with <code>Toolbar</code>. Wire Cursor, Frame, Draw, Text, and the current Shape subtype to real <code>useTools()</code> callbacks; render + but keep its panel small.</p></div>
          <div class="slice-proof"><small>EXIT PROOF</small><p>The exact bottom-center silhouette selects five real stock tools, retains tldraw tooltips/focus, and does not collide with the bottom-right utility strip.</p></div>
        </article>
        <article class="slice-row">
          <b>2</b>
          <div><strong>Unify clicks, hotkeys, and recall</strong><p>Add <code>toolbarOverrides.ts</code>, <code>toolbarPreferences.ts</code>, and a pure <code>arrowPresetModel.ts</code>. Wrap existing rectangle/ellipse/line/arrow items rather than attaching raw keyboard listeners. Store only last-family choices under a versioned SystemSketch preference key; use editor styles and current tool as the live truth.</p></div>
          <div class="slice-proof"><small>EXIT PROOF</small><p><code>R O L A A A</code> updates the same slot immediately; switching to Cursor and pressing A recalls the last arrow preset; reload preserves preference without adding document records.</p></div>
        </article>
        <article class="slice-row">
          <b>3</b>
          <div><strong>Close one real library journey</strong><p>Add <code>ShapeLibraryPanel.tsx</code> and <code>shapeLibraryCatalog.ts</code>. Use tldraw popover/input primitives, filter a deliberately small catalog, and make one library item create a real stock geo shape at the viewport center. Preserve the selected tool and return focus to + on close.</p></div>
          <div class="slice-proof"><small>EXIT PROOF</small><p>Open +, type “decision”, insert a diamond, close with Escape, and press R; no search keystroke activates a canvas tool.</p></div>
        </article>
        <article class="slice-row">
          <b>4</b>
          <div><strong>Finish the production edges</strong><p>Connect the licensed stock Comment tool or its explicit disabled state. Add coarse-pointer sizing, narrow-width behavior, readonly behavior, reduced motion, tooltip labels, screen-reader announcements, preference migration/fallback, and the single DefaultToolbar class-contract upgrade smoke. Keep the existing Excalidraw paste and utility-strip mounts unchanged.</p></div>
          <div class="slice-proof"><small>EXIT PROOF</small><p>Keyboard, touch, readonly, comment availability, library focus, reload, and existing paste/release flows pass in Preview before promotion.</p></div>
        </article>
      </div>
    </section>

    <section class="acceptance-matrix" aria-labelledby="acceptance-heading">
      <div class="section-intro">
        <div>
          <div class="eyebrow">Evidence plan</div>
          <h2 id="acceptance-heading">Test the pure contract, editor effect, and rendered journey separately</h2>
        </div>
      </div>
      <div class="acceptance-grid">
        <article class="acceptance-card"><b>Pure Vitest model</b><ul><li>First A recalls last arrow</li><li>Repeated A cycles 0 → 1 → 2 → 0</li><li>R/O/L replace the Shape slot</li><li>Preference parse, migration, corruption fallback</li><li>Library open never changes active tool</li></ul></article>
        <article class="acceptance-card"><b>Editor integration</b><ul><li>Overrides delegate to original tool callbacks</li><li>Curve guard touches only newly drawn arrows</li><li>Elbow uses <code>ArrowShapeKindStyle</code></li><li>No UI preference in the tldraw store</li><li>Comment resolves only when capability exists</li></ul></article>
        <article class="acceptance-card"><b>Real browser journey</b><ul><li>Wide + narrow visual captures</li><li>Keyboard suppression while editing/searching</li><li>Overflow clone shares one remembered icon</li><li>Focus return, Escape, touch targets</li><li>No collision with utilities or style panel</li></ul></article>
      </div>
    </section>

    <section class="avoid-list" aria-labelledby="avoid-heading">
      <div class="section-intro">
        <div>
          <div class="eyebrow">Guardrails</div>
          <h2 id="avoid-heading">Four tempting shortcuts to reject</h2>
        </div>
      </div>
      <div class="avoid-grid">
        <div><b>No raw global keydown router.</b><br>Wrapping <code>TLUiToolItem.onSelect</code> keeps tldraw's existing editing, open-menu, readonly, and focus suppression.</div>
        <div><b>No toolbar state in the board.</b><br>Last-used subtype is a local user preference, not shared diagram content or shape metadata.</div>
        <div><b>No custom arrow shape types.</b><br>Straight, Curve, and Elbow remain ordinary stock arrows so export, paste, bindings, and collaboration stay compatible.</div>
        <div><b>No copied DefaultToolbar.</b><br>Compose it in P1; if its shell is too constrained, switch cleanly to P2 instead of forking upstream JSX.</div>
      </div>
      <p class="verified-seams"><b>Verified against pinned tldraw 5.3.2:</b> <a href="file:///home/bam/systemsketch/node_modules/tldraw/src/lib/ui/components/Toolbar/DefaultToolbar.tsx">DefaultToolbar custom children</a> · <a href="file:///home/bam/systemsketch/node_modules/tldraw/src/lib/ui/components/Toolbar/OverflowingToolbar.tsx">overflow and last-active behavior</a> · <a href="file:///home/bam/systemsketch/node_modules/tldraw/src/lib/ui/hooks/useTools.tsx">stock tools and R/O/L/A mappings</a> · <a href="file:///home/bam/systemsketch/node_modules/tldraw/src/lib/ui/hooks/useKeyboardShortcuts.ts">editing-safe keyboard registry</a> · <a href="file:///home/bam/systemsketch/node_modules/tldraw/src/lib/shapes/arrow/toolStates/Pointing.tsx">arrow creation path</a>.</p>
    </section>
'''


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="figma-toolbar-plans-", dir=DOCS_DIR) as temp_dir:
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
                "--strict",
            ],
            check=True,
        )

        html = temp_output.read_text(encoding="utf-8")
        styles = STYLE_PATH.read_text(encoding="utf-8")
        script = SCRIPT_PATH.read_text(encoding="utf-8")
        html = html.replace(
            'class="global-why" id="global-why"',
            'class="global-synthesis" id="global-synthesis"',
            1,
        )
        html = html.replace('"global-why"', '"global-synthesis"')
        html = html.replace(
            "Type naturally: “Use V5’s structure, V2’s scrubber, and V1’s density. Avoid modals.”",
            "Type naturally: “Start with P1; borrow P2’s true sidebar and keep P1’s keyboard boundary.”",
            1,
        )
        html = html.replace("</style>", f"\n/* SystemSketch implementation-plan prototypes */\n{styles}\n</style>", 1)
        html = html.replace(
            '    <section class="checks">',
            f'{TECHNICAL_APPENDIX}\n    <section class="checks">',
            1,
        )
        html = html.replace("</body>", f"\n<script>\n{script}\n</script>\n</body>", 1)
        temp_output.write_text(html, encoding="utf-8")
        temp_output.replace(OUTPUT_PATH)

    print(OUTPUT_PATH)


if __name__ == "__main__":
    main()
