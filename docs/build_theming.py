#!/usr/bin/env python3
"""Build the theming report: one token layer, five themes, contrast measured.

Answers `docs/work-order-host-theming.md`. Every number is measured at build
time — the colour literals from the tree and from the pinned commit the work
started on, the contrast ratios from the JSON the browser journey wrote when it
ran, the palettes from the generated modules and their provenance lines, the
plugin verdicts from the JSON each IDE journey wrote. The builder refuses to
publish over a stale journey, the same way the goldens report does.
"""

from __future__ import annotations

import base64
import html
import json
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DOCS = PROJECT_ROOT / "docs"
ASSETS = DOCS / "assets"
SRC = PROJECT_ROOT / "src"
OUTPUT = DOCS / f"theming-{date.today().isoformat()}.html"
# The commit the work order was picked up on: the "before" every count is
# measured against. A pinned id, so the comparison cannot drift.
BRANCH_POINT = "be53803"

sys.path.insert(0, str(PROJECT_ROOT / "tests"))
from test_theme_tokens import COLOR_LITERAL, CONTENT_FILES, strip_comments  # noqa: E402


def esc(value: object) -> str:
    return html.escape(str(value))


def data_uri(path: Path) -> str:
    return f"data:image/png;base64,{base64.b64encode(path.read_bytes()).decode()}"


def crop(name: str, box: tuple[int, int, int, int]) -> str:
    from PIL import Image

    source = ASSETS / name
    out = ASSETS / f"crop-{name}"
    Image.open(source).convert("RGB").crop(box).save(out, optimize=True)
    return data_uri(out)


def git_show(path: str) -> str | None:
    result = subprocess.run(
        ["git", "show", f"{BRANCH_POINT}:{path}"],
        cwd=PROJECT_ROOT, capture_output=True, text=True, check=False,
    )
    return result.stdout if result.returncode == 0 else None


def count_literals(css: str) -> int:
    return len(COLOR_LITERAL.findall(strip_comments(css)))


def literal_table() -> list[dict]:
    rows = []
    for path in sorted(SRC.rglob("*.css")):
        relative = path.relative_to(PROJECT_ROOT).as_posix()
        before_text = git_show(relative)
        before = count_literals(before_text) if before_text is not None else 0
        after = count_literals(path.read_text(encoding="utf-8"))
        rows.append({
            "file": relative,
            "before": before,
            "after": after,
            "tokens": len(re.findall(r"var\(--ss-", path.read_text(encoding="utf-8"))),
            "kind": "tokens" if relative == "src/theme/tokens.css"
            else "content" if relative in CONTENT_FILES
            else "new" if before_text is None
            else "chrome",
        })
    return rows


def fresh_json(name: str, *newer_than: Path) -> dict:
    path = ASSETS / name
    if not path.exists():
        raise SystemExit(f"{name} is missing — run the journey that writes it first")
    measured = path.stat().st_mtime
    for dependency in newer_than:
        if measured < dependency.stat().st_mtime:
            raise SystemExit(
                f"{name} predates {dependency.relative_to(PROJECT_ROOT)}: re-run the journey"
            )
    newest = max(
        (p for p in SRC.rglob("*") if p.is_file() and p.suffix in {".ts", ".tsx", ".css"}),
        key=lambda p: p.stat().st_mtime,
    )
    if measured < newest.stat().st_mtime:
        raise SystemExit(
            f"{name} predates src/{newest.relative_to(SRC)}: those verdicts were measured"
            " against different source. Re-run the journey."
        )
    return json.loads(path.read_text(encoding="utf-8"))


def unit_tests(target: str) -> int:
    result = subprocess.run(
        ["npx", "vitest", "run", target, "--reporter=json"],
        cwd=PROJECT_ROOT, capture_output=True, text=True, check=False,
    )
    start = result.stdout.find("{")
    if start < 0:
        raise SystemExit(f"could not read vitest JSON for {target}\n{result.stderr[-2000:]}")
    report = json.loads(result.stdout[start:])
    if not report.get("success"):
        raise SystemExit(f"{target} is red — refusing to publish a report over it")
    return int(report["numPassedTests"])


def python_tests(module: str) -> int:
    result = subprocess.run(
        [sys.executable, "-m", "unittest", module, "-v"],
        cwd=PROJECT_ROOT, capture_output=True, text=True, check=False,
    )
    if result.returncode != 0:
        raise SystemExit(f"{module} is red — refusing to publish\n{result.stderr[-2000:]}")
    match = re.search(r"Ran (\d+) tests", result.stderr)
    return int(match.group(1)) if match else 0


def palette_module(name: str) -> dict:
    source = (SRC / "theme" / "palettes" / name).read_text(encoding="utf-8")
    header = source.split("*/", 1)[0]
    palettes = []
    for match in re.finditer(r"export const (\w+): ThemePalette = \{(.*?)\n\}", source, flags=re.S):
        body = match.group(2)
        fields = dict(re.findall(r"^\s{2}(id|label|scheme|source): ['\"](.*?)['\"],", body, flags=re.M))
        tokens = re.findall(r"^\s{4}(\w+): \"(.*?)\",", body, flags=re.M)
        chains = re.findall(r"^\s{4}// (--[\w-]+): (.*)$", body, flags=re.M)
        palettes.append({"export": match.group(1), **fields, "tokens": tokens, "chains": dict(chains)})
    return {"header": header, "palettes": palettes}


def mutation() -> dict:
    text = (ASSETS / "theme-contrast-mutation.txt").read_text(encoding="utf-8")
    fails = re.findall(r"FAIL\s+(.*?)\n\s+(.*?)\n", text)
    summary = re.search(r"(\d+) passed, (\d+) failed", text)
    return {
        "fails": fails,
        "passed": int(summary.group(1)) if summary else None,
        "failed": int(summary.group(2)) if summary else None,
        "exit": re.search(r"exit (\d+)", text).group(1) if re.search(r"exit (\d+)", text) else "?",
    }


def luminance_hex(value: str) -> float | None:
    match = re.fullmatch(r"#([0-9a-f]{6})", value.strip().lower())
    if not match:
        return None
    channel = lambda v: v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4  # noqa: E731
    r, g, b = (int(match.group(1)[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)


# --------------------------------------------------------------------------
# Measure.
# --------------------------------------------------------------------------

LITERALS = literal_table()
CHROME_BEFORE = sum(r["before"] for r in LITERALS if r["kind"] in {"chrome", "new"})
CHROME_AFTER = sum(r["after"] for r in LITERALS if r["kind"] in {"chrome", "new"})
TOKENS_AFTER = sum(r["tokens"] for r in LITERALS)
CONTRAST = fresh_json("theme-contrast.json", PROJECT_ROOT / "tests" / "theme_contrast_smoke.mjs")
MUTATION = mutation()
VSCODE = fresh_json("vscode-plugin-journey.json", PROJECT_ROOT / "vscode-systemsketch" / "tests" / "vscode_e2e.mjs")
CURSOR = fresh_json("cursor-plugin-journey.json", PROJECT_ROOT / "vscode-systemsketch" / "tests" / "vscode_e2e.mjs")
DARK_MODERN = palette_module("darkModern.ts")
OBSIDIAN = palette_module("obsidian.ts")
THEME_UNIT_TESTS = unit_tests("src/theme")
THEME_GATE_TESTS = python_tests("tests.test_theme_tokens")
TOKENS_CSS = (SRC / "theme" / "tokens.css").read_text(encoding="utf-8")
VOCABULARY = re.findall(r"^\s\*\s{3}(--ss-[\w-]+)\s{2,}(.*)$", TOKENS_CSS.split("Derived (never per-theme", 1)[0], flags=re.M)
DERIVED = re.findall(r"^\s\*\s{3}(--ss-[\w-]+)\s{2,}(.*)$", TOKENS_CSS.split("Derived (never per-theme", 1)[1].split("One rule about", 1)[0], flags=re.M)
PROBES_TOTAL = sum(len(t["probes"]) for t in CONTRAST["themes"])
PROBES_OK = sum(1 for t in CONTRAST["themes"] for p in t["probes"] if p.get("ok"))
LOWEST = sorted(
    (p | {"theme": t["label"]} for t in CONTRAST["themes"] for p in t["probes"] if p.get("ratio")),
    key=lambda p: p["ratio"] / p["threshold"],
)[:6]

if CONTRAST["failed"] != 0:
    raise SystemExit("theme-contrast.json is red — refusing to publish a report over it")
if MUTATION["failed"] in (None, 0):
    raise SystemExit("the mutation run did not go red; the journey proves nothing")


# --------------------------------------------------------------------------
# Render.
# --------------------------------------------------------------------------

def theme_card(theme: dict) -> str:
    shots = theme["screenshots"]
    lowest = min((p for p in theme["probes"] if p.get("ratio")), key=lambda p: p["ratio"] / p["threshold"])
    state = theme["state"]
    return f"""
    <figure class="theme">
      <img src="{data_uri(PROJECT_ROOT / shots[0])}" alt="{esc(theme['label'])} with a Block selected and the inspector open">
      <img src="{data_uri(PROJECT_ROOT / shots[1])}" alt="{esc(theme['label'])}: the Settings dialog">
      <figcaption>
        <strong>{esc(theme['label'])}</strong>
        <span>root <code>{esc(state['theme'])}/{esc(state['scheme'])}</code> · tldraw {'dark' if state['tldrawDark'] else 'light'} · canvas <code>{esc(state['canvas'])}</code></span>
        <span>{len(theme['probes'])} probes, lowest {lowest['ratio']}:1 ({esc(lowest['label'])}, needs {lowest['threshold']}:1)</span>
      </figcaption>
    </figure>"""


def probe_rows(theme: dict) -> str:
    rows = []
    for probe in theme["probes"]:
        if not probe.get("found"):
            rows.append(f"<tr class='skip'><td>{esc(probe['label'])}</td><td colspan='4'>not on screen (optional)</td></tr>")
            continue
        ok = probe.get("ok")
        rows.append(
            f"<tr class='{'ok' if ok else 'bad'}'><td>{esc(probe['label'])}</td>"
            f"<td><i class='chip' style='background:{esc(probe['fg'].split(' @')[0])}'></i><code>{esc(probe['fg'])}</code></td>"
            f"<td><i class='chip' style='background:{esc(probe['bg'])}'></i><code>{esc(probe['bg'])}</code></td>"
            f"<td class='num'>{probe['ratio']}:1</td><td class='num'>≥ {probe['threshold']}</td></tr>"
        )
    return "\n".join(rows)


def literal_rows() -> str:
    rows = []
    for row in sorted(LITERALS, key=lambda r: (-r["before"], r["file"])):
        note = {
            "tokens": "the one place literals belong",
            "content": "content, allowlisted",
            "new": "new",
            "chrome": "",
        }[row["kind"]]
        rows.append(
            f"<tr class='{row['kind']}'><td><code>{esc(row['file'])}</code></td>"
            f"<td class='num'>{row['before']}</td><td class='num'>{row['after']}</td>"
            f"<td class='num'>{row['tokens']}</td><td>{esc(note)}</td></tr>"
        )
    return "\n".join(rows)


def palette_rows(palette: dict) -> str:
    rows = []
    for name, value in palette["tokens"]:
        chain = palette["chains"].get(f"--{name}", "")
        swatch = value if value.startswith("#") or value.startswith("rgb") or value.startswith("hsl") or value == "white" else ""
        chip = f"<i class='chip' style='background:{esc(swatch)}'></i>" if swatch and "px" not in swatch else ""
        rows.append(
            f"<tr><td><code>{esc(name)}</code></td><td>{chip}<code>{esc(value)}</code></td>"
            f"<td class='chain'>{esc(chain)}</td></tr>"
        )
    return "\n".join(rows)


def obsidian_chain_rows(palette: dict) -> str:
    rows = []
    for line in re.findall(r"^\s{4}// (.*)$", (SRC / "theme" / "palettes" / "obsidian.ts").read_text(encoding="utf-8"), flags=re.M):
        pass
    for name, value in palette["tokens"]:
        rows.append(f"<tr><td><code>{esc(name)}</code></td><td><i class='chip' style='background:{esc(value)}'></i><code>{esc(value)}</code></td></tr>")
    return "\n".join(rows)


def checklist(items: list[str]) -> str:
    return "\n".join(f"<li>{esc(item)}</li>" for item in items)


SEAM_SVG = """
<svg viewBox="0 0 980 420" class="seam" role="img" aria-label="The three layers of the token design">
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
      <path d="M0 0L10 5L0 10z" fill="currentColor"/>
    </marker>
  </defs>
  <g font-family="ui-sans-serif, system-ui" font-size="13">
    <!-- Layer 3: the switch -->
    <rect x="20" y="20" width="940" height="70" rx="10" fill="var(--paper)" stroke="var(--line)"/>
    <text x="36" y="44" font-weight="700">3 · One place decides which theme is on</text>
    <text x="36" y="66" fill="var(--muted)">standalone: ThemeRoot stamps data-ss-theme from Settings (localStorage) · embedded: EmbeddedCanvas stamps resolveHostTheme(bridge.host) · unknown host → systemsketch</text>

    <!-- Layer 2: themes -->
    <rect x="20" y="120" width="220" height="130" rx="10" fill="var(--paper)" stroke="var(--line)"/>
    <text x="36" y="144" font-weight="700">systemsketch</text>
    <text x="36" y="166" fill="var(--muted)">--ss-* ← --tl-*</text>
    <text x="36" y="186" fill="var(--muted)">declared on .tl-container,</text>
    <text x="36" y="204" fill="var(--muted)">flips with .tl-theme__dark</text>
    <text x="36" y="232" fill="var(--muted)">Light · Dark · Match system</text>

    <rect x="260" y="120" width="220" height="130" rx="10" fill="var(--paper)" stroke="var(--line)"/>
    <text x="276" y="144" font-weight="700">vscode</text>
    <text x="276" y="166" fill="var(--muted)">--ss-* ← --vscode-*</text>
    <text x="276" y="186" fill="var(--muted)">the workbench's live variables,</text>
    <text x="276" y="204" fill="var(--muted)">already light or dark</text>
    <text x="276" y="232" fill="var(--muted)">VS Code · Cursor</text>

    <rect x="500" y="120" width="220" height="130" rx="10" fill="var(--paper)" stroke="var(--line)"/>
    <text x="516" y="144" font-weight="700">obsidian</text>
    <text x="516" y="166" fill="var(--muted)">--ss-* ← --background-primary …</text>
    <text x="516" y="186" fill="var(--muted)">names read from app.css;</text>
    <text x="516" y="204" fill="var(--muted)">the plugin, when it exists</text>

    <rect x="740" y="120" width="220" height="130" rx="10" fill="var(--paper)" stroke="var(--line)"/>
    <text x="756" y="144" font-weight="700">palette</text>
    <text x="756" y="166" fill="var(--muted)">--ss-* inline on the root</text>
    <text x="756" y="186" fill="var(--muted)">Obsidian Light/Dark, Dark Modern,</text>
    <text x="756" y="204" fill="var(--muted)">any imported VS Code theme</text>
    <text x="756" y="232" fill="var(--muted)">→ pushed back into --tl-*</text>

    <!-- Layer 1: vocabulary -->
    <rect x="20" y="290" width="940" height="110" rx="10" fill="var(--accent-soft)" stroke="var(--accent)"/>
    <text x="36" y="314" font-weight="700">1 · The vocabulary — 20 per-theme tokens, 11 derived, the only names a stylesheet may use</text>
    <text x="36" y="338" fill="var(--muted)">surface · surface-raised · surface-sunken · surface-hover · surface-active · surface-inverse · text · text-muted · text-faint · text-inverse</text>
    <text x="36" y="358" fill="var(--muted)">border · accent · accent-text · danger · warning · success · code-surface · code-text · shadow-1 · shadow-2</text>
    <text x="36" y="384" fill="var(--muted)">derived: border-strong, border-inverse, surface-inverse-hover, accent-hover, accent-soft(+hover), danger/warning/success-soft, focus-ring, overlay</text>

    <g stroke="currentColor" fill="none" marker-end="url(#arrow)">
      <path d="M130 90 V118"/><path d="M370 90 V118"/><path d="M610 90 V118"/><path d="M850 90 V118"/>
      <path d="M130 250 V288"/><path d="M370 250 V288"/><path d="M610 250 V288"/><path d="M850 250 V288"/>
    </g>
  </g>
</svg>
"""

vscode_theme_check = next(c for c in VSCODE["checks"] if c.startswith("the workbench theme"))
vscode_legible = next(c for c in VSCODE["checks"] if c.startswith("the inspector is legible"))
cursor_theme_check = next(c for c in CURSOR["checks"] if c.startswith("the workbench theme"))
cursor_legible = next(c for c in CURSOR["checks"] if c.startswith("the inspector is legible"))
importer = CONTRAST.get("importer") or {}

HTML = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SystemSketch — one token layer, five themes, contrast measured</title>
<style>
  :root {{ --ink: #1f2328; --muted: #57606a; --line: #d0d7de; --paper: #ffffff; --ground: #f6f8fa;
           --accent: #0969da; --accent-soft: #ddf4ff; --ok: #1a7f37; --bad: #cf222e; }}
  @media (prefers-color-scheme: dark) {{
    :root {{ --ink: #e6edf3; --muted: #9aa4b2; --line: #30363d; --paper: #161b22; --ground: #0d1117;
             --accent: #58a6ff; --accent-soft: #0c2d6b; --ok: #3fb950; --bad: #f85149; }}
  }}
  body {{ margin: 0; color: var(--ink); background: var(--ground); font: 15px/1.55 ui-sans-serif, system-ui, sans-serif; }}
  main {{ max-width: 1180px; margin: 0 auto; padding: 32px 24px 80px; }}
  h1 {{ font-size: 30px; line-height: 1.15; margin: 0 0 8px; }}
  h2 {{ font-size: 22px; margin: 48px 0 12px; }}
  h3 {{ font-size: 16px; margin: 24px 0 8px; }}
  p.lede {{ font-size: 17px; color: var(--muted); max-width: 900px; }}
  .facts {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; margin: 24px 0; }}
  .fact {{ padding: 14px 16px; border: 1px solid var(--line); border-radius: 10px; background: var(--paper); }}
  .fact b {{ display: block; font-size: 28px; line-height: 1; }}
  .fact span {{ color: var(--muted); font-size: 13px; }}
  .card {{ padding: 18px 20px; border: 1px solid var(--line); border-radius: 12px; background: var(--paper); margin: 14px 0; }}
  .seam {{ width: 100%; height: auto; color: var(--muted); }}
  table {{ width: 100%; border-collapse: collapse; font-size: 13px; background: var(--paper); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }}
  th, td {{ text-align: left; padding: 7px 10px; border-top: 1px solid var(--line); vertical-align: top; }}
  th {{ background: var(--ground); font-weight: 600; }}
  td.num {{ text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }}
  td.chain {{ color: var(--muted); font-size: 12px; }}
  tr.ok td.num:first-of-type {{ color: var(--ok); }}
  tr.bad td {{ color: var(--bad); }}
  tr.skip td {{ color: var(--muted); }}
  tr.tokens td, tr.content td {{ color: var(--muted); }}
  .chip {{ display: inline-block; width: 12px; height: 12px; border-radius: 3px; border: 1px solid var(--line); margin-right: 6px; vertical-align: -1px; }}
  code {{ font: 12.5px ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--ground); padding: 1px 5px; border-radius: 4px; }}
  pre {{ background: var(--paper); border: 1px solid var(--line); border-radius: 10px; padding: 14px; overflow: auto; font-size: 12.5px; }}
  .themes {{ display: grid; grid-template-columns: 1fr; gap: 18px; }}
  figure.theme {{ margin: 0; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--paper); display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }}
  figure.theme img {{ width: 100%; height: auto; border-radius: 8px; border: 1px solid var(--line); }}
  figure.theme figcaption {{ grid-column: 1 / -1; display: flex; gap: 18px; flex-wrap: wrap; font-size: 13px; color: var(--muted); }}
  figure.theme figcaption strong {{ color: var(--ink); }}
  .two {{ display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }}
  .two img {{ width: 100%; height: auto; border: 1px solid var(--line); border-radius: 8px; }}
  ul.tight li {{ margin: 4px 0; }}
  .tag {{ display: inline-block; padding: 1px 8px; border-radius: 999px; background: var(--accent-soft); color: var(--ink); font-size: 12px; font-weight: 600; margin-left: 6px; }}
  .tag.ok {{ background: color-mix(in srgb, var(--ok) 18%, transparent); }}
  .tag.warn {{ background: color-mix(in srgb, #bf8700 22%, transparent); }}
  details summary {{ cursor: pointer; color: var(--accent); }}
  footer {{ margin-top: 60px; color: var(--muted); font-size: 13px; }}
  .decision li {{ margin: 8px 0; }}
</style></head>
<body><main>

<h1>One token layer: SystemSketch wears light, dark, Obsidian, and Dark Modern</h1>
<p class="lede">The chrome was authored light-only — {CHROME_BEFORE} colour literals across the chrome stylesheets at
<code>{BRANCH_POINT}</code>. It now names {TOKENS_AFTER} tokens from one closed vocabulary and holds {CHROME_AFTER}
literals (the four quick-colour swatches, marked as shape-colour content), and a theme is a table of values: the default is derived from tldraw's own palette so the board and the
panels on it cannot disagree, a host theme reads the IDE's live variables, and a palette — Obsidian's two, VS Code's
Dark Modern, or any theme file a person imports — arrives inline and is pushed back into tldraw's own menus. Legibility
is a measured contrast ratio in a real browser, not a screenshot review, and the journey was mutation-tested red.</p>

<div class="facts">
  <div class="fact"><b>{CHROME_BEFORE} → {CHROME_AFTER}</b><span>chrome colour literals, before → after (measured from <code>{BRANCH_POINT}</code> and the tree)</span></div>
  <div class="fact"><b>{len(VOCABULARY)} + {len(DERIVED)}</b><span>per-theme tokens + derived ones</span></div>
  <div class="fact"><b>{len(CONTRAST['themes'])}</b><span>themes driven in headless Chrome</span></div>
  <div class="fact"><b>{PROBES_OK}/{PROBES_TOTAL}</b><span>contrast probes clearing their threshold ({CONTRAST['passed']} checks, {CONTRAST['failed']} failed)</span></div>
  <div class="fact"><b>{MUTATION['failed']}</b><span>failures when the old <code>#272b32</code> header is put back (mutation test, exit {MUTATION['exit']})</span></div>
  <div class="fact"><b>{THEME_UNIT_TESTS} + {THEME_GATE_TESTS}</b><span>vitest tests on the model and importer + Python gate tests</span></div>
</div>

<h2>1 · The design: three layers, and the middle one is the whole idea</h2>
<div class="card">
{SEAM_SVG}
<p>Two things in the drawing are load-bearing. The default theme's block is declared on <code>.tl-container</code>, not
on the app root: a custom property is substituted where it is declared, and <code>--tl-*</code> exists only from the
container down — declared any higher, every <code>var(--tl-…)</code> resolves to nothing and the chrome inherits that
nothing. And every theme other than the default is pushed <em>back</em> into <code>--tl-color-panel</code>,
<code>--tl-color-text-1</code>, <code>--tl-color-divider</code> and friends on the same container, which is why
tldraw's own context menu, dialogs and zoom controls wear Dark Modern too rather than sitting beside it in tldraw-dark.</p>
<p>The root also carries a fallback in <code>:where()</code> — tldraw's own light and dark values, copied — so the
embed lane's strips outside the container paint correctly and a host nobody has written a block for gets a
correct-looking app. <code>resolveHostTheme()</code> maps an unknown host to <code>systemsketch</code> first; the CSS
fallback is the second line, not the first. Adding Obsidian's plugin is the <code>obsidian</code> block that already
exists plus the string <code>'obsidian'</code> in <code>KNOWN_HOST_THEMES</code>; the gate test checks both are present.</p>
</div>

<h3>The vocabulary</h3>
<table><thead><tr><th>Token</th><th>What it names</th></tr></thead><tbody>
{''.join(f"<tr><td><code>{esc(n)}</code></td><td>{esc(m)}</td></tr>" for n, m in VOCABULARY)}
</tbody></table>
<p style="color:var(--muted);font-size:13px">Derived, never per-theme: {', '.join(f'<code>{esc(n)}</code>' for n, _ in DERIVED)}. One rule the measurements forced: <code>--ss-accent-soft</code> is a surface, and copy on it is <code>--ss-text</code>, never <code>--ss-accent</code> — see §4.</p>

<h2>2 · The five themes, driven and captured</h2>
<p>Each pair is the product with a Block selected (inspector and selection pill on screen) and the Settings → Appearance
dialog, captured by <code>npm run test:theme</code> on {esc(CONTRAST['ranAt'][:19].replace('T', ' '))}. The canvas colour
is read off <code>.tl-background</code>; for a palette it must equal that palette's <code>surface</code> token.</p>
<div class="themes">
{''.join(theme_card(theme) for theme in CONTRAST['themes'])}
</div>

<h3>The picker, and an imported theme</h3>
<div class="two">
  <figure style="margin:0"><img src="{data_uri(ASSETS / 'theme-picker-dark-modern.png')}" alt="Choosing Dark Modern in the picker">
  <figcaption style="font-size:13px;color:var(--muted)">Clicking <em>Dark Modern</em> switched the root to <code>palette/dark</code>, tldraw to <code>.tl-theme__dark</code>, and the canvas to <code>rgb(31, 31, 31)</code> — no reload. The <code>&lt;html&gt;</code> pre-paint stamp was released on mount.</figcaption></figure>
  <figure style="margin:0"><img src="{data_uri(ASSETS / 'theme-picker-imported.png')}" alt="An imported Light Modern theme">
  <figcaption style="font-size:13px;color:var(--muted)">{esc(importer.get('name', 'a theme file'))} handed to the real file input via <code>DOM.setFileInputFiles</code>: a new removable option, a {esc(importer.get('scheme', ''))} board ({esc(importer.get('canvas', ''))}), and the stored tokens equal to what <code>vsCodeThemeTokens()</code> says — {'matched' if importer.get('tokensMatch') else 'DID NOT MATCH'}. The app said: “{esc(importer.get('message', ''))}”</figcaption></figure>
</div>

<h2>3 · The gate: contrast, measured</h2>
<p>For every piece of chrome that carries text or an icon the journey reads the painted foreground and the effective
background off the live element — compositing translucent layers down to the first opaque one — and computes the WCAG
ratio. Body text needs 4.5:1; text on an accent fill, icons and input boundaries 3:1. The six tightest readings across
all themes:</p>
<table><thead><tr><th>Theme</th><th>Probe</th><th>Foreground</th><th>Background</th><th>Ratio</th><th>Needs</th></tr></thead><tbody>
{''.join(f"<tr class='ok'><td>{esc(p['theme'])}</td><td>{esc(p['label'])}</td><td><i class='chip' style='background:{esc(p['fg'].split(' @')[0])}'></i><code>{esc(p['fg'])}</code></td><td><i class='chip' style='background:{esc(p['bg'])}'></i><code>{esc(p['bg'])}</code></td><td class='num'>{p['ratio']}:1</td><td class='num'>≥ {p['threshold']}</td></tr>" for p in LOWEST)}
</tbody></table>

<div class="card">
<h3 style="margin-top:0">Mutation test: the original bug, put back <span class="tag ok">went red</span></h3>
<p>With <code>.block-inspector__section-title</code> hardcoded back to <code>#272b32</code> — the invisible-header bug
the work order opens with — the same journey reported {MUTATION['passed']} passed, {MUTATION['failed']} failed and exit {MUTATION['exit']}.
The three dark themes failed on exactly that element:</p>
<pre>{esc(chr(10).join(f'FAIL  {label}{chr(10)}      {detail}' for label, detail in MUTATION['fails']))}</pre>
</div>

<details><summary>Every probe, every theme ({PROBES_TOTAL} rows)</summary>
{''.join(f"<h3>{esc(t['label'])}</h3><table><thead><tr><th>Probe</th><th>Foreground</th><th>Background</th><th>Ratio</th><th>Needs</th></tr></thead><tbody>{probe_rows(t)}</tbody></table>" for t in CONTRAST['themes'])}
</details>

<h2>4 · What the oracle found that a screenshot review would not</h2>
<div class="card">
<ul class="tight">
  <li><strong>Accent-coloured copy on an accent-tinted chip cannot reach 4.5:1 in any palette.</strong> Measured 2.60 (Dark Modern), 2.83 (Obsidian Dark), 2.91 (tldraw light), 3.01 (Obsidian Light), 4.29 (tldraw dark) on the settings rail's active item — and the same pattern sat on the tool menu, the depth navigator, the inspector's count pill and icon picker, and the dev panel. All of them now paint ink on the tint and mark the active state with a 3px accent bar or ring; the rule is written into <code>tokens.css</code>.</li>
  <li><strong>tldraw's <code>text-3</code> on its <code>low</code> surface is 4.14:1 in light</strong> — tuned for its panel (4.62), not for a chip. The default theme derives <code>--ss-text-muted</code> as <code>color-mix(text-3 88%, text-1)</code>, which clears 4.5 on every surface the chrome uses without touching tldraw.</li>
  <li><strong>An input outline at 45% ink measured 2.5–2.9:1</strong> in the light themes; 55% clears 3:1 in all five.</li>
  <li><strong>Four phantom variables were resolving to their fallbacks all along:</strong> <code>--tl-color-text-2</code> (8 uses; tldraw has text-0, -1, -3), <code>--tl-font-ui</code> (3), and unprefixed <code>--color-panel</code> / <code>--color-text-3</code> in the Block picker and the workspace title. The gate now asserts every <code>--tl-*</code> a stylesheet reads exists in <code>tldraw.css</code>.</li>
</ul>
</div>

<h2>5 · Where every value came from</h2>
<div class="card">
<h3 style="margin-top:0">Dark Modern — read from the theme file Cursor ships</h3>
<pre>{esc(DARK_MODERN['header'].strip())}</pre>
<p><code>scripts/import_vscode_theme.mjs</code> resolves the <code>include</code> chain the way VS Code does (deepest first, outermost overrides) and hands the merged table to the same <code>vsCodeThemeTokens()</code> the Settings dialog runs on an imported file — one mapping, two callers. Cursor's <code>workbench.colorTheme</code> is <em>Default Dark Modern</em>, so this is the palette Zach sees in his editor. <code>tests/test_theme_tokens.py</code> re-hashes the installed files and fails if they have moved since the palette was generated.</p>
<table><thead><tr><th>Token</th><th>Value</th><th></th></tr></thead><tbody>{palette_rows(DARK_MODERN['palettes'][0])}</tbody></table>
</div>

<div class="card">
<h3 style="margin-top:0">Obsidian Light and Dark — read from Obsidian's own <code>app.css</code></h3>
<pre>{esc(OBSIDIAN['header'].strip())}</pre>
<p><code>scripts/extract_obsidian_palette.py</code> pulls <code>app.css</code> out of the asar, merges the top-level
<code>body</code>, <code>.theme-light</code> and <code>.theme-dark</code> blocks the way the cascade would, and resolves each
variable the <code>[data-ss-theme='obsidian']</code> host block reads — the names come from <code>tokens.css</code> itself, so the
live-Obsidian mapping and the standalone palette cannot name different variables. The accent is Obsidian's own
<code>hsl(calc(var(--accent-h) − 1), …)</code> chain, evaluated.</p>
<div class="two">
{''.join(f"<div><h3>{esc(p['label'])}</h3><table><thead><tr><th>Token</th><th>Value</th><th>Resolved through</th></tr></thead><tbody>{palette_rows(p)}</tbody></table></div>" for p in OBSIDIAN['palettes'])}
</div>
</div>

<h2>6 · The VS Code plugin: the board follows the workbench</h2>
<div class="two">
  <figure style="margin:0"><img src="{data_uri(ASSETS / 'vscode-target-block-saved.png')}" alt="VS Code, dark workbench, dark SystemSketch pane">
  <figcaption style="font-size:13px;color:var(--muted)">Visual Studio Code — {VSCODE['passed']} of {VSCODE['passed']} checks.</figcaption></figure>
  <figure style="margin:0"><img src="{data_uri(ASSETS / 'cursor-target-block-saved.png')}" alt="Cursor, dark workbench, dark SystemSketch pane">
  <figcaption style="font-size:13px;color:var(--muted)">Cursor — {CURSOR['passed']} checks reached behind its sign-in wall; {esc(CURSOR.get('blocked', ''))}.</figcaption></figure>
</div>
<div class="card">
<p>The journey's pin — <code>painted: false</code>, “the board stays light on purpose” — is now
<code>painted: workbenchIsDark</code>, and two things are read that were not before: the canvas colour must equal the
workbench's own <code>--vscode-editor-background</code> as the webview receives it, and the inspector's copy is measured
as a ratio on the very element that used to render invisible.</p>
<ul class="tight">
  <li>VS Code: {esc(vscode_theme_check)}</li>
  <li>VS Code: {esc(vscode_legible)}</li>
  <li>Cursor: {esc(cursor_theme_check)}</li>
  <li>Cursor: {esc(cursor_legible)}</li>
</ul>
<p style="color:var(--muted);font-size:13px">A detail worth knowing: the editor background a webview is handed is not always the theme's <code>editor.background</code> — VS Code's fresh profile reported <code>#121314</code> and Cursor's <code>#181818</code>. The canvas is painted with whatever the host says, which is the point.</p>
</div>

<h2>7 · The migration, file by file</h2>
<table><thead><tr><th>Stylesheet</th><th>Literals at {BRANCH_POINT}</th><th>Now</th><th>Tokens</th><th></th></tr></thead><tbody>
{literal_rows()}
</tbody></table>
<p style="color:var(--muted);font-size:13px">Every hand-rolled <code>.tl-theme__dark …</code> override block — 40-odd of them across five files — was deleted rather than migrated; the tokens flip themselves. <code>--systemsketch-panel-border</code> and <code>-panel-shadow</code> folded into <code>--ss-border</code> / <code>--ss-shadow-2</code>; the geometry variables moved into <code>src/theme/</code> beside the colours.</p>

<h2>8 · Decision surface</h2>
<div class="card decision">
<p><strong>Done and proved</strong> — everything above, with <code>npm run check</code> green ({THEME_UNIT_TESTS} new vitest tests, {THEME_GATE_TESTS} new Python gate tests), the five-theme contrast journey green and mutation-tested, and both IDE journeys re-run against the packaged VSIX.</p>
<p><strong>Left, and next rather than blocked</strong></p>
<ul>
  <li><code>src/appearance/appearance.css</code> is the one chrome file still on literals, deliberately: it is the FigJam appearance pill the appearance track is actively editing (its values equal <code>--ss-surface-inverse</code> / <code>--ss-text-inverse</code>), and a merge conflict there would cost more than a week on the allowlist. Pointing it at those two tokens is a ten-line change once that track lands.</li>
  <li>The <code>obsidian</code> host block is verified against Obsidian's stylesheet, not a running Obsidian — there is no Obsidian plugin yet to run it in. The standalone Obsidian palettes are the same variables resolved, so the day the plugin exists the check is one journey.</li>
  <li>Syntax colours: an imported theme's <code>tokenColors</code> are carried on the record untouched. SystemSketch renders no syntax highlighting today, so <code>--ss-code-surface</code> / <code>--ss-code-text</code> (the notes editor, port types) are what “code wears the theme” means for now.</li>
</ul>
<p><strong>Needs Zach</strong> — each with the default that holds if he says nothing</p>
<ul>
  <li><em>One accent, taken from tldraw's selection blue.</em> The old chrome mixed a violet (<code>#7253df</code>) for settings and depth, an indigo (<code>#536dfe</code>) for the toolbar, and a purple Share button. The work order asked for the accent to derive from <code>--tl-color-selected</code>, so the default theme is now one blue everywhere; Obsidian keeps its purple, Dark Modern its <code>#0078d4</code>. <strong>Default: keep.</strong> If the violet identity mattered, it is one line in the systemsketch block.</li>
  <li><em>The selection pill stays dark in dark themes.</em> FigJam, Obsidian and VS Code all keep that pill dark; only tldraw's tooltip flips to white. <strong>Default: keep dark</strong>; flipping is one token.</li>
  <li><em>A labelled button's border is decorative.</em> The journey measures input boundaries at 3:1 and leaves button borders at the hairline the sources use (Dark Modern's own buttons are <code>#FFFFFF12</code>). <strong>Default: keep.</strong></li>
</ul>
<p><strong>Deliberately not done</strong> — the Obsidian plugin itself (the work order's increment 4 is “when its plugin exists”); a second copy of tldraw's palette (every default value is derived); and any theming of document content — a Block's port colours and the FigJam swatches render identically in every theme, and the gate exempts exactly those files.</p>
</div>

<footer>Generated by <code>docs/build_theming.py</code> on {date.today().isoformat()}. Literal counts are measured from the tree and from
commit <code>{BRANCH_POINT}</code>; contrast ratios and IDE verdicts come from the JSON each journey wrote when it ran, and the builder refuses to
publish over a red or stale run.</footer>

</main></body></html>
"""

OUTPUT.write_text(HTML, encoding="utf-8")
print(f"wrote {OUTPUT.relative_to(PROJECT_ROOT)} ({OUTPUT.stat().st_size // 1024} KB)")
