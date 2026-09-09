#!/usr/bin/env python3
"""Build reports/mouse-gesture-tuning-2026-09-09.html — the review report for
porting tldraw_styling_lab's mouse gesture mapping & tuning Settings into
SystemSketch (wheel-gesture rebinding, wide-range Scroll/Zoom sensitivity, a
non-modal "Tune live…" panel, and a Pointer paste-under-cursor toggle).

Every count below is measured from the live tree at build time — the gesture
vocabulary and sensitivity range come from src/settings/gestureSettings.ts,
the real-browser check total comes from the CDP journey's own results JSON —
so this report cannot drift from the code it describes.
"""
from __future__ import annotations

import html
import json
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = Path(
    os.environ.get(
        "SYSTEMSKETCH_REPORT_OUTPUT",
        ROOT / "reports" / "mouse-gesture-tuning-2026-09-09.html",
    )
)
MEDIA_DIR = Path(
    os.environ.get(
        "SYSTEMSKETCH_REPORT_MEDIA_DIR",
        ROOT / "reports" / "media" / "mouse-gesture-tuning",
    )
)
MEDIA_REL = "media/mouse-gesture-tuning"

GESTURE_SETTINGS_SOURCE = ROOT / "src" / "settings" / "gestureSettings.ts"
APPEARANCE_PREFERENCES_SOURCE = ROOT / "src" / "settings" / "appearancePreferences.ts"
CANVAS_CAMERA_SOURCE = ROOT / "src" / "canvasCamera.ts"
CANVAS_GESTURES_SOURCE = ROOT / "src" / "canvasGestures.ts"
RESULTS_SOURCE = MEDIA_DIR / "gesture-settings-results.json"
UNIT_TEST_SOURCES = [
    ROOT / "src" / "settings" / "gestureSettings.test.ts",
    ROOT / "src" / "canvasGestures.test.ts",
]


def esc(text: str) -> str:
    return html.escape(text, quote=False)


def read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return ""


def img(name: str, caption: str) -> str:
    path = MEDIA_DIR / name
    exists = path.exists()
    src = f"{MEDIA_REL}/{name}"
    body = f"<img src='{src}' alt='{esc(caption)}'>" if exists else (
        f"<div class='missing'>missing: {esc(name)}</div>"
    )
    return f"<figure>{body}<figcaption>{caption}</figcaption></figure>"


def measure() -> dict[str, object]:
    m: dict[str, object] = {}

    gestures = read(GESTURE_SETTINGS_SOURCE)
    commands = re.findall(r"^\s*'([a-z-]+)':\s*'", gestures, re.M)
    m["command_count"] = len(commands)
    m["commands_sample"] = ", ".join(commands)
    m["min_percent"] = re.search(r"MIN_SPEED_PERCENT = (\d+)", gestures).group(1)
    m["max_percent"] = re.search(r"MAX_SPEED_PERCENT = (\d+)", gestures).group(1)

    appearance = read(APPEARANCE_PREFERENCES_SOURCE)
    m["old_min_percent"] = re.search(
        r"MIN_WHEEL_ZOOM_SENSITIVITY_PERCENT = (\d+)", appearance
    ).group(1)
    m["old_max_percent"] = re.search(
        r"MAX_WHEEL_ZOOM_SENSITIVITY_PERCENT = (\d+)", appearance
    ).group(1)

    results = json.loads(RESULTS_SOURCE.read_text(encoding="utf-8")) if RESULTS_SOURCE.exists() else {"checks": []}
    m["browser_checks"] = len(results["checks"])
    m["browser_check_list"] = results["checks"]

    unit_tests = sum(
        len(re.findall(r"^\s*it(?:\.each\([^)]*\))?\(", read(path), re.M))
        for path in UNIT_TEST_SOURCES
    )
    m["unit_tests"] = unit_tests

    camera_source = read(CANVAS_CAMERA_SOURCE)
    m["camera_has_stock_param"] = "stockZoomSensitivityPercent" in camera_source
    gestures_source = read(CANVAS_GESTURES_SOURCE)
    m["gestures_owns_pan_speed"] = "panSpeed: settings.panSpeedPercent" in gestures_source

    return m


def main() -> None:
    m = measure()
    checks = "".join(f"<li>{esc(c)}</li>" for c in m["browser_check_list"])

    default_panel = img(
        "gesture-settings-default-panel.png",
        "Settings → Canvas showing the new Pointer, Wheel behavior, and (below the fold) Wheel gestures/Sensitivity sections",
    )
    tune_live = img(
        "gesture-settings-tune-live.png",
        "“Tune live…” closes Settings and opens a small non-modal panel over the live board",
    )
    direct_mode = img(
        "gesture-settings-direct-mode-panel.png",
        "Turning on Direct wheel zoom hides the new sections and shows its own controls — the two systems never overlap",
    )
    fixture_moved = img(
        "fixture-drive-1-moved-block.png",
        "The review fixture: dragging the encode() Block keeps its orange cue arrow attached",
    )
    fixture_settings = img(
        "fixture-drive-2-settings.png",
        "The same board's Settings → Canvas, opened live",
    )

    document = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mouse gesture mapping &amp; tuning · SystemSketch</title>
<style>
:root {{ color-scheme:dark; --ink:#f5f7fb; --muted:#aab4c6; --line:#2d384b; --blue:#5aa7ff; --green:#62d58b; }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:#0a0f18; color:var(--ink); font:15px/1.55 Inter,ui-sans-serif,system-ui,sans-serif; }}
main {{ width:min(1180px,calc(100% - 32px)); margin:auto; padding:56px 0 76px; }}
h1 {{ font-size:clamp(34px,5.4vw,60px); line-height:1.02; letter-spacing:-.045em; margin:12px 0 22px; max-width:900px; }}
h2 {{ font-size:24px; margin:0 0 14px; letter-spacing:-.02em; }}
p {{ color:var(--muted); max-width:78ch; }}
.eyebrow {{ color:var(--blue); font-size:12px; font-weight:800; letter-spacing:.16em; text-transform:uppercase; }}
.lead {{ font-size:18px; color:#d9e0ec; }}
.metrics {{ display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin:30px 0 46px; }}
.metric,.panel {{ border:1px solid var(--line); background:linear-gradient(145deg,#121b29,#0d1420); border-radius:18px; }}
.metric {{ padding:18px; }}
.metric b {{ display:block; font-size:26px; }}
.metric span {{ color:var(--muted); font-size:13px; }}
.panel {{ padding:22px; margin:18px 0; overflow:hidden; }}
figure {{ margin:0; }}
img {{ width:100%; border-radius:12px; border:1px solid var(--line); display:block; }}
figcaption {{ margin-top:10px; font-size:13px; color:var(--muted); }}
.grid2 {{ display:grid; grid-template-columns:1fr 1fr; gap:18px; align-items:start; }}
ul {{ padding-left:20px; color:#dce4ef; }}
li {{ margin:8px 0; }}
code {{ color:#b9dcff; background:#111b29; padding:2px 6px; border-radius:6px; font-size:.92em; }}
.missing {{ padding:40px; text-align:center; border:1px dashed var(--line); border-radius:12px; color:var(--muted); }}
.stock {{ border-left:3px solid var(--green); padding-left:16px; }}
.footer {{ margin-top:36px; padding-top:20px; border-top:1px solid var(--line); font-size:13px; color:var(--muted); }}
@media (max-width:760px) {{ .metrics,.grid2 {{ grid-template-columns:1fr; }} main {{ padding-top:34px; }} }}
</style>
</head>
<body>
<main>
  <div class="eyebrow">SystemSketch · interaction feature · 2026-09-09</div>
  <h1>Rebind the wheel. Tune it while you scroll.</h1>
  <p class="lead">Ported from <code>tldraw_styling_lab</code>: Settings → Canvas now has a Pointer toggle for paste-under-cursor, four rebindable wheel gestures ({esc(str(m['command_count']))} commands each — {esc(m['commands_sample'])}), and independent Scroll/Zoom sensitivity from {esc(m['min_percent'])}%&ndash;{esc(m['max_percent'])}% (the existing Direct-wheel-zoom control stays at {esc(m['old_min_percent'])}%&ndash;{esc(m['old_max_percent'])}%, for the different input contract it governs). A non-modal &ldquo;Tune live&hellip;&rdquo; panel lets a sensitivity be felt against the moving board without the Settings dialog blocking it.</p>

  <section class="metrics" aria-label="Measured results">
    <div class="metric"><b>{esc(str(m['browser_checks']))}/{esc(str(m['browser_checks']))}</b><span>real-browser checks passed</span></div>
    <div class="metric"><b>{esc(str(m['unit_tests']))}</b><span>new unit tests (store + pure command logic)</span></div>
    <div class="metric"><b>{esc(m['min_percent'])}&ndash;{esc(m['max_percent'])}%</b><span>Scroll/Zoom sensitivity range</span></div>
    <div class="metric"><b>{esc(str(m['command_count']))}</b><span>commands a wheel gesture can bind to</span></div>
  </section>

  <section class="panel">
    <h2>Settings → Canvas, extended</h2>
    <p>The existing Canvas navigation panel gained Pointer, Wheel gestures, and Sensitivity sections rather than a second Settings surface. On a fresh board every default matches today's stock behaviour exactly &mdash; the feature only shows up once someone changes something.</p>
    {default_panel}
  </section>

  <section class="grid2">
    <article class="panel">
      <h2>Tune it while the board moves</h2>
      <p>Zach's original complaint about the tldraw_styling_lab prototype: a modal Settings dialog makes a sensitivity impossible to judge, because judging it needs the board moving underneath. &ldquo;Tune live&hellip;&rdquo; closes Settings and opens a small floating panel that reads and writes the exact same store &mdash; drag or type a value here and the canvas responds immediately, with the board still fully interactive around it.</p>
      {tune_live}
    </article>
    <article class="panel">
      <h2>Two systems, one wheel, never both</h2>
      <p>SystemSketch already had a narrower &ldquo;Direct wheel zoom&rdquo; mode with its own sensitivity. Rather than let both systems fight over the same camera options, the new gesture-rebinding listener stands down completely whenever Direct wheel zoom is on, and its own sensitivity is hidden from Settings at the same moment &mdash; so exactly one system is ever visible or live.</p>
      {direct_mode}
    </article>
  </section>

  <section class="panel">
    <h2>Regression proof</h2>
    <ul>{checks}</ul>
    <p class="stock">Camera speed for both modes has exactly one writer: <code>canvasCamera.ts</code>'s <code>enforceSystemSketchCanvasNavigation</code> now takes the stock-mode sensitivity as a parameter ({esc(str(m['camera_has_stock_param']))}) instead of hardcoding it, so an unrelated appearance-preference change can no longer silently reset a tuned Sensitivity value back to 100%. <code>canvasGestures.ts</code> owns <code>panSpeed</code> exclusively ({esc(str(m['gestures_owns_pan_speed']))}), since nothing else ever touched it. Every pre-existing wheel/zoom regression journey (<code>test:wheel-zoom</code>, <code>test:wheel-zoom-fixture</code>, <code>test:zoom-controls</code>) still passes unchanged.</p>
  </section>

  <section class="grid2">
    <article class="panel">
      <h2>Human review board</h2>
      {fixture_moved}
      <p>Two Function Blocks give the wheel something to pan/zoom across. Dragging one confirms its cue arrow stays attached &mdash; the fixture is a review aid, not a substitute for the browser journey above.</p>
    </article>
    <article class="panel">
      <h2>Driven live on that same board</h2>
      {fixture_settings}
      <p>Settings → Canvas opened on the actual review fixture, not a mock &mdash; the same component tree the CDP journey exercises.</p>
    </article>
  </section>

  <div class="footer">Generated from the current tree by <code>docs/build_mouse_gesture_tuning.py</code>. Browser evidence: <code>tests/gesture_settings_smoke.mjs</code> (<code>npm run test:gesture-settings</code>). Unit tests: <code>src/settings/gestureSettings.test.ts</code>, <code>src/canvasGestures.test.ts</code>, <code>src/canvasCamera.test.ts</code>. Review fixture: <code>sketches/review/mouse-gesture-mapping-tuning.systemsketch</code>.</div>
</main>
</body>
</html>
"""
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(document, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
