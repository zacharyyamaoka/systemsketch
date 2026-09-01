#!/usr/bin/env python3
"""Build the visual implementation report for the Preview → Stable controls."""

from __future__ import annotations

import base64
import html
import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DOCS = PROJECT_ROOT / "docs"
OUTPUT = DOCS / "release-channel-controls-2026-09-01.html"


# The frames are 1440x960 of mostly empty canvas; the report crops them to the
# two regions the change lives in. Each capture writes a `.boxes.json` sidecar
# holding the boxes the browser actually laid out, so nothing here guesses at
# pixels. The constants are only the fallback for a frame captured before that.
PANEL = "panel"
MARKER = "marker"
FALLBACK = {"panel": (1046, 88, 1436, 900), "marker": (396, 0, 1044, 58)}
PAD = {"panel": 10, "marker": 8}


def crop_box(path: Path, region: str) -> tuple[int, int, int, int]:
    sidecar = path.with_suffix("").with_suffix(".boxes.json")
    try:
        box = json.loads(sidecar.read_text(encoding="utf-8"))[region]
    except (OSError, ValueError, KeyError):
        box = None
    if not box:
        return FALLBACK[region]
    pad = PAD[region]
    return (
        box["x"] - pad,
        max(0, box["y"] - pad),
        box["x"] + box["width"] + pad,
        box["y"] + box["height"] + pad,
    )


def data_uri(path: Path, region: str | None = None) -> str:
    mime = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
    payload = path.read_bytes()
    if region is not None:
        try:
            import io

            from PIL import Image
        except ImportError:  # pragma: no cover - the full frame still reads
            pass
        else:
            image = Image.open(path)
            left, top, right, bottom = crop_box(path, region)
            box = (max(0, left), max(0, top), min(image.width, right), min(image.height, bottom))
            buffer = io.BytesIO()
            image.crop(box).save(buffer, format="PNG")
            payload = buffer.getvalue()
    return f"data:{mime};base64,{base64.b64encode(payload).decode()}"


def code(text: str) -> str:
    return html.escape(text.strip("\n"))


BEFORE_CODE = """
// SystemSketchUtilities.tsx — the only exit on screen.
<aside className="systemsketch-preview-mode">
  <span>Preview · {profileLabel}</span>
  <span>Live working copy · Stable stays unchanged</span>
  <button onClick={() => void act('stable')}>Return to Stable</button>
</aside>

// …and 795px lower, behind two disclosures, the only way to promote:
{detailsOpen ? (
  <section className="systemsketch-release-details">
    …heading, freshness, released, composition, changelog…
    <div className="systemsketch-release-details__actions">
      {isPreview ? (
        <button className="primary" onClick={() => void act('promote')}>
          {busy === 'promote' ? 'Verifying…' : 'Publish Preview'}
        </button>
      ) : …}
"""

AFTER_CODE = """
// One component renders the pair, wherever the pair belongs.
function ChannelActions({ className, phase, returning,
                          disabled, onReturn, onMakeStable }) {
  return (
    <div className={className}>
      <button
        data-action="return"
        data-emphasis={phase === 'published' ? 'primary' : 'secondary'}
        disabled={disabled}
        onClick={onReturn}
      >
        {returnToStableLabel(phase, returning)}
      </button>
      {phase === 'unavailable' ? null : (
        <button
          data-action="make-stable"
          data-phase={phase}
          disabled={disabled || phase === 'published'}
          onClick={onMakeStable}
          {...{ [MAKE_STABLE_ATTRIBUTE]: '' }}
        >
          {makeStableLabel(phase)}
        </button>
      )}
    </div>
  )
}

// Arming and committing are the same control.
const requestMakeStable = () => {
  if (busy) return
  if (!armed) { setArmed(true); return }
  void act('promote')
}
"""

PHASE_CODE = """
// releaseModel.ts — the transition as one value,
// not four booleans spread through the JSX.
export type MakeStablePhase =
  | 'unavailable' | 'idle' | 'armed' | 'working' | 'published'

export function makeStablePhase(
  status: ReleaseStatus | null,
  state: MakeStableState,
): MakeStablePhase {
  if (!status || status.channel !== 'preview' || !status.canPromote) {
    return 'unavailable'
  }
  if (state.working) return 'working'
  if (state.published) return 'published'
  return state.armed ? 'armed' : 'idle'
}

export function makeStableLabel(phase: MakeStablePhase): string {
  if (phase === 'armed') return 'Confirm · replaces Stable'
  if (phase === 'working') return 'Making Stable…'
  if (phase === 'published') return 'Stable updated'
  return 'Make Preview Stable'
}
"""

SERVER_CODE = """
# scripts/server.py — what the second click actually starts. Unchanged by this work;
# it was already there, five minutes deep behind two disclosures.
if action == "promote":
    if self.channel != "preview":
        raise ReleaseError("publishing is only available from live Preview")
    subprocess.run([sys.executable, str(self.source_root / "scripts" / "release.py"),
                    "--release-home", str(self.release_home), "promote"],
                   cwd=self.source_root, check=True, timeout=300)

# scripts/release.py promote → npm run check → vite build → stage_candidate → promote_candidate
#                            → install_controller
"""

TERMINAL = """
$ SYSTEMSKETCH_PUBLISH_PROOF=1 node tests/release_channel_controls_smoke.mjs

  PASS  Preview shows Return to Stable and Make Preview Stable together, with the committing action emphasised
  PASS  the banner still says what Preview is without repeating the composition name
  PASS  the first click only arms the control: it restates the consequence and sends nothing
  PASS  the banner detail line explains what confirming will do, in place
  PASS  clicking away disarms the confirm rather than leaving a live trigger behind
  PASS  Escape disarms the confirm without closing the panel it was armed from, and still sends nothing
  PASS  the Latest Preview row in Dev drops its call-out gradient and is inert while Preview is what you are in
  PASS  the Dev panel carries the same two buttons at the top, not a buried Publish Preview row
  PASS  the old Publish Preview control is gone from the collapsed version details
  PASS  no console errors while driving the channel controls
  PASS  Stable shows no Preview banner and therefore no channel buttons
  PASS  from Stable the same row keeps its call-out gradient, because there it really is the offer
  PASS  Make Preview Stable is absent from Stable, where there is no Preview to make Stable
  PASS  newer local work still raises the Dev indicator and relabels the offer, from Stable only
  PASS  no console errors on the Stable channel
  PASS  the second click starts the real build and locks both exits while it runs
  PASS  a finished promote reports Stable updated and turns Return into the follow-through
  PASS  the banner says where Stable now points instead of leaving the result implicit
  PASS  the isolated release home now points Stable at the freshly built candidate
  PASS  no console errors across the full publish

20 checks passed
"""

CHECKS = [
    ("Both exits sit together, at the top",
     "<code>Return to Stable</code> and <code>Make Preview Stable</code> in the always-visible marker, "
     "the committing one filled and the quiet one outlined."),
    ("One click arms, it does not build",
     "The button restates the consequence as <code>Confirm · replaces Stable</code> and the spy on "
     "<code>window.fetch</code> records zero POSTs to <code>/api/release</code>."),
    ("Clicking away or Escape cancels",
     "Escape disarms without closing the panel it was armed from — the armed control owns the key first."),
    ("The build really runs",
     "Second click → <code>npm run check</code> + <code>vite build</code> + <code>promote_candidate</code>, "
     "both exits locked, marker reporting progress."),
    ("The pointer really moves",
     "<code>channels.json</code> in the throwaway release home comes back with "
     "<code>stable === candidate</code> at the freshly built id."),
    ("Preview stops being called out to itself",
     "<code>getComputedStyle(card).backgroundImage === 'none'</code>, "
     "<code>cursor: default</code>, and the node is a <code>DIV</code>, not a button."),
    ("Stable keeps the call-out, because there it is the offer",
     "Same row, same class, <code>backgroundImage !== 'none'</code> and <code>cursor: pointer</code>."),
    ("Nothing regressed around it",
     "Newer local work still raises the Dev dot from Stable only; zero console errors in either channel."),
]


def main() -> None:
    before_panel = data_uri(DOCS / "release-channel-before-panel-2026-09-01.png", PANEL)
    before_marker = data_uri(DOCS / "release-channel-before-panel-2026-09-01.png", MARKER)
    before_buried = data_uri(DOCS / "release-channel-before-buried-2026-09-01.png", PANEL)
    after_panel = data_uri(DOCS / "release-channel-preview-live-2026-09-01.png", PANEL)
    after_marker = data_uri(DOCS / "release-channel-preview-live-2026-09-01.png", MARKER)
    after_preview = data_uri(DOCS / "release-channel-preview-live-2026-09-01.png")
    after_armed = data_uri(DOCS / "release-channel-armed-live-2026-09-01.png", MARKER)
    after_stable = data_uri(DOCS / "release-channel-stable-live-2026-09-01.png", PANEL)
    after_published = data_uri(DOCS / "release-channel-published-live-2026-09-01.png", MARKER)

    checks = "\n".join(
        f'      <li><b>{html.escape(label)}</b><span>{detail}</span></li>'
        for label, detail in CHECKS
    )

    report = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch · Preview → Stable</title>
<style>
  :root{{--ink:#14171a;--muted:#626a73;--line:#dfe3e7;--paper:#f6f7f8;--card:#fff;--green:#149447;--amber:#b4531a;--blue:#4458df;--red:#c4392c}}
  *{{box-sizing:border-box}} body{{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}}
  main{{width:min(1180px,calc(100% - 32px));margin:auto;padding:42px 0 72px}}
  .hero{{padding:32px;border:1px solid var(--line);border-radius:24px;background:var(--card);box-shadow:0 18px 50px #1218200b}}
  .kicker{{font-size:12px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:#4b5560}}
  h1{{margin:6px 0 10px;font-size:clamp(32px,5.4vw,60px);line-height:1;letter-spacing:-.05em}}
  .lede{{max-width:840px;margin:0;color:var(--muted);font-size:18px}}
  .badges{{display:flex;flex-wrap:wrap;gap:8px;margin-top:20px}}
  .badge{{padding:6px 10px;border:1px solid var(--line);border-radius:999px;background:#fafbfc;font:700 12px/1.2 ui-monospace,monospace}}
  .badge.ok{{border-color:#bfe3cd;background:#eefaf2;color:#0e6b36}}
  section{{margin-top:44px}} h2{{margin:0 0 6px;font-size:28px;letter-spacing:-.03em}}
  h3{{margin:0 0 8px;font-size:17px}}
  .sub{{margin:0 0 20px;color:var(--muted);max-width:840px}}
  figure{{margin:0;padding:10px;border:1px solid var(--line);border-radius:18px;background:var(--card);overflow:hidden}}
  figure img{{display:block;width:100%;border-radius:11px;border:1px solid #e3e6e9}}
  figcaption{{padding:10px 4px 2px;color:var(--muted);font-size:13.5px}} figcaption strong{{display:block;color:var(--ink);font-size:15px}}
  .two{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;align-items:start}}
  .two.compare figure img{{max-height:660px;object-fit:contain;object-position:top;background:#fdfdfd}}
  figure.strip img{{background:#fdfdfd}}
  pre{{margin:0;padding:16px;border:1px solid var(--line);border-radius:14px;background:#0f1216;color:#e6edf3;overflow-x:auto;font:12.5px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace}}
  pre.light{{background:#fbfcfd;color:#1b2027;border-color:var(--line)}}
  pre.term{{background:#10151b;color:#c9f5d8}}
  .card{{padding:20px;border:1px solid var(--line);border-radius:18px;background:var(--card)}}
  .states{{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-top:8px}}
  .state{{padding:14px;border:1px solid var(--line);border-radius:16px;background:var(--card)}}
  .state b{{display:block;font:700 12px/1.3 ui-monospace,monospace;letter-spacing:.02em}}
  .state small{{display:block;margin-top:8px;color:var(--muted)}}
  .chip{{display:inline-block;margin-top:10px;padding:5px 9px;border-radius:7px;font:750 10.5px/1.2 Inter,sans-serif;color:#fff}}
  .chip.idle{{background:var(--blue)}} .chip.armed{{background:var(--amber)}}
  .chip.working{{background:#5a67c9}} .chip.done{{background:#e8f7ed;color:#1f6b3c;border:1px solid #b9e2c6}}
  .chip.none{{background:#eceff2;color:#626a73}}
  ol.checks{{margin:0;padding:0;list-style:none;counter-reset:c;border:1px solid var(--line);border-radius:16px;background:var(--card);overflow:hidden}}
  ol.checks li{{position:relative;counter-increment:c;padding:12px 12px 12px 46px;border-bottom:1px solid var(--line)}}
  ol.checks li:last-child{{border-bottom:0}}
  ol.checks li::before{{content:"✓";position:absolute;left:12px;top:12px;width:22px;height:22px;border-radius:50%;background:#eefaf2;color:#0e6b36;font:800 13px/22px ui-monospace,monospace;text-align:center}}
  ol.checks b{{display:block;font-weight:650}} ol.checks span{{color:var(--muted);font-size:13.5px}}
  table{{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:16px;overflow:hidden}}
  th,td{{padding:11px 14px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}}
  th{{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#4b5560;background:#fafbfc}}
  tr:last-child td{{border-bottom:0}}
  code{{padding:.12em .35em;border-radius:5px;background:#eceff2;font:12.5px/1.4 ui-monospace,monospace}}
  .note{{padding:16px 18px;border:1px solid #f2d9a8;border-radius:14px;background:#fdf7ea}}
  footer{{margin-top:50px;padding-top:20px;border-top:1px solid var(--line);color:var(--muted);font-size:13.5px}}
  @media(max-width:900px){{.two{{grid-template-columns:1fr}}.states{{grid-template-columns:1fr}}}}
</style>
</head>
<body><main>
  <header class="hero">
    <div class="kicker">SystemSketch · System update workflow</div>
    <h1>Preview is now<br>a two-way door.</h1>
    <p class="lede">Promoting the working tree was always possible — it just lived 795&nbsp;pixels down, behind
      opening the Dev shelf and then expanding <b>Version&nbsp;&amp;&nbsp;updates</b>. It now sits beside
      <b>Return to Stable</b> in the marker that is on screen the whole time you are in Preview. And the Dev shelf
      stopped calling out the view you are already looking at.</p>
    <div class="badges">
      <span class="badge ok">20/20 real-browser checks</span>
      <span class="badge ok">190 unit tests</span>
      <span class="badge ok">24 Python tests</span>
      <span class="badge">one real end-to-end promote</span>
      <span class="badge">tldraw 5.3.2</span>
      <span class="badge">2026-09-01</span>
    </div>
  </header>

  <section>
    <h2>Before</h2>
    <p class="sub">Both frames are the real app, driven headlessly against the pre-change source. Left: what you
      reported — one exit in the marker, and a Latest&nbsp;Preview row still painted as a call to action while
      Latest&nbsp;Preview is exactly what you are in. Right: the same panel with
      <b>Version&nbsp;&amp;&nbsp;updates</b> expanded, which is the only place <code>Publish Preview</code> existed.</p>
    <figure class="strip">
      <img alt="The Preview marker before the change: a single Return to Stable button" src="{before_marker}">
      <figcaption><strong>The marker, before</strong>One exit — and “Preview · Latest Preview”, a composition name the
        panel can only ever have.</figcaption>
    </figure>
    <div class="two compare" style="margin-top:18px">
      <figure>
        <img alt="The Dev panel in Preview before the change" src="{before_panel}">
        <figcaption><strong>Return offered twice, next to a call-out to where you already are</strong>
          The Stable row repeats the marker's action, and the Latest Preview card keeps its gradient while its own
          right edge reads “Current”.</figcaption>
      </figure>
      <figure>
        <img alt="Publish Preview buried inside the expanded version details" src="{before_buried}">
        <figcaption><strong>Publish Preview at y=795</strong>
          Two disclosures deep, under the release heading, freshness line, released/composition facts and the
          changelog — measured in the browser, not estimated.</figcaption>
      </figure>
    </div>
    <div class="two" style="margin-top:18px">
      <div><h3>The shape of the old code</h3><pre>{code(BEFORE_CODE)}</pre></div>
      <div class="card">
        <h3>Why it read badly</h3>
        <p>Three separate problems, all of them about <em>where</em> rather than <em>whether</em>:</p>
        <ul style="margin:0;padding-left:20px">
          <li>The most consequential action in the app was the least reachable one.</li>
          <li><code>Return</code> appeared twice — in the marker and again on the Stable row — so neither read as
            the canonical control.</li>
          <li>The Latest&nbsp;Preview card kept its call-out gradient in Preview, where it is not an offer. Its own
            right edge said <code>Current</code>, contradicting the styling beside it.</li>
        </ul>
        <p style="margin-bottom:0">The label was wrong too. <code>Publish Preview</code> names a channel operation;
          the thing you actually want is “make this the one that launches”.</p>
      </div>
    </div>
  </section>

  <section>
    <h2>After</h2>
    <p class="sub">The marker carries the pair. The Dev shelf carries the same pair at the top, under a card that is
      now inert state — <b>You are here · Current</b> — with Stable reduced to the quiet row saying what launches
      by default.</p>
    <figure class="strip">
      <img alt="The Preview marker after the change, carrying both channel buttons" src="{after_marker}">
      <figcaption><strong>The marker, after</strong>Both exits, always on screen. The quiet one is outlined, the
        committing one filled.</figcaption>
    </figure>
    <div class="two compare" style="margin-top:18px">
      <figure>
        <img alt="The Dev panel in Preview after the change" src="{after_panel}">
        <figcaption><strong>The Dev shelf, after</strong>“You are here · Current” as flat state, the two buttons
          directly beneath it, and Stable reduced to the row saying what launches by default.</figcaption>
      </figure>
      <figure>
        <img alt="The whole app in Preview after the change" src="{after_preview}">
        <figcaption><strong>In place</strong>Marker and shelf together, in the real product composition on a real
          board.</figcaption>
      </figure>
    </div>
  </section>

  <section>
    <h2>The commit is armed, not instant</h2>
    <p class="sub">The second click starts <code>npm run check</code> and a production <code>vite build</code> —
      minutes of work that moves what launches by default. A control that sits on screen permanently must not be
      able to start that from one stray click, so the first click only states the consequence.</p>
    <div class="states">
      <div class="state"><b>unavailable</b><small>Not in Preview, or the server says it cannot promote. The button is
        not rendered at all.</small><span class="chip none">— hidden —</span></div>
      <div class="state"><b>idle</b><small>The resting offer. Nothing has been sent.</small>
        <span class="chip idle">Make Preview Stable</span></div>
      <div class="state"><b>armed</b><small>Six seconds, or until you click elsewhere or press Escape. Still nothing
        sent.</small><span class="chip armed">Confirm · replaces Stable</span></div>
      <div class="state"><b>working</b><small>Check suite, build, promote. Both exits locked.</small>
        <span class="chip working">Making Stable…</span></div>
      <div class="state"><b>published</b><small>Stable moved. Return becomes the follow-through.</small>
        <span class="chip done">Stable updated</span></div>
    </div>
    <div class="two" style="margin-top:18px">
      <figure class="strip">
        <img alt="The armed confirm state in the Preview marker" src="{after_armed}">
        <figcaption><strong>Armed</strong>The detail line changes with it: “Checks, builds, then points Stable at this
          working tree.” The consequence is stated where the click happens.</figcaption>
      </figure>
      <figure class="strip">
        <img alt="The published state after a real promote" src="{after_published}">
        <figcaption><strong>Published, after a real build</strong>“Stable now points here · return to launch it”, with
          Return promoted to <code>Open new Stable</code> — the launcher restarts Stable on the new build.</figcaption>
      </figure>
    </div>
    <div class="two" style="margin-top:18px">
      <div><h3>The phase, as one value</h3><pre>{code(PHASE_CODE)}</pre></div>
      <div><h3>One component, rendered in both places</h3><pre>{code(AFTER_CODE)}</pre></div>
    </div>
  </section>

  <section>
    <h2>Stable is untouched — deliberately</h2>
    <p class="sub">The same <code>.systemsketch-dev-latest</code> row keeps its gradient on the Stable channel,
      because there it really is the offer. The change is not “remove the call-out”; it is “stop calling out the view
      you are already in”.</p>
    <div class="two compare">
      <figure>
        <img alt="The Dev panel on the Stable channel, still showing the call-out" src="{after_stable}">
        <figcaption><strong>Stable, after</strong>No marker, no channel buttons, and Open Latest Preview still
          gradient-filled with the green Dev dot when local work is newer.</figcaption>
      </figure>
      <div class="card">
        <h3>What decides it</h3>
        <table>
          <tr><th>Surface</th><th>Preview</th><th>Stable</th></tr>
          <tr><td>Top marker</td><td>Return · Make Preview Stable</td><td>Not rendered</td></tr>
          <tr><td>Latest Preview row</td><td><code>&lt;div data-current&gt;</code>, flat, <code>cursor:default</code></td>
            <td><code>&lt;button&gt;</code>, gradient, <code>cursor:pointer</code></td></tr>
          <tr><td>Stable row</td><td>Quiet: “launches by default”</td><td><code>Current</code></td></tr>
          <tr><td>Dev dot</td><td>Never</td><td>Only when source is newer</td></tr>
          <tr><td>Version details</td><td>Facts only</td><td>Facts + rollback</td></tr>
        </table>
        <p style="margin:16px 0 0">The panel only ever mounts in the full product, so the marker no longer prints the
          composition name it could only ever have — <code>Preview · Latest Preview</code> became <code>Preview</code>,
          and the dead <code>activeProfile === 'product'</code> branches went with it.</p>
      </div>
    </div>
  </section>

  <section>
    <h2>What the second click actually starts</h2>
    <p class="sub">Unchanged by this work. The promote path already existed and already worked; it was only
      unreachable.</p>
    <pre class="light">{code(SERVER_CODE)}</pre>
  </section>

  <section>
    <h2>Proof</h2>
    <p class="sub">Every claim above is asserted against the real app in headless Chrome — the marker, the panel, the
      arming, the build, and the channel pointer on disk afterwards. The publish leg is opt-in because it is a genuine
      multi-minute build; it was run for this report.</p>
    <ol class="checks">
{checks}
    </ol>
    <pre class="term" style="margin-top:18px">{code(TERMINAL)}</pre>
    <div class="note" style="margin-top:18px">
      <b>One safety change came with it.</b> <code>startApp</code> now gives every harness server a throwaway
      <code>--release-home</code>. Before, a smoke test that reached a channel control would have moved your real
      Stable pointer. It now moves a temp directory's, which is also what let the end-to-end promote above run for
      real without touching your runtime.
    </div>
  </section>

  <footer>
    <b>Run it:</b> <code>npm run test:release-ui</code> — add <code>SYSTEMSKETCH_PUBLISH_PROOF=1</code> for the full
    build. Before-state frames were captured from an isolated copy of the pre-change source, since the component is
    not yet in git history. Live Preview on <code>127.0.0.1:4322</code> serves the change now.
  </footer>
</main></body>
</html>
"""
    OUTPUT.write_text(report, encoding="utf-8")
    print(f"{OUTPUT} · {OUTPUT.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
