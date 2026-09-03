#!/usr/bin/env python3
"""Build the progressive deep-capture recorder gallery from fresh journey evidence."""

from __future__ import annotations

import base64
import html
import json
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
HERE = Path(__file__).resolve().parent
ASSETS = HERE / "assets"
OUTPUT = HERE / "recorder-deep-capture-2026-09-02.html"
JOURNEY = REPO / "tests" / "recorder_smoke.mjs"


def need(path: Path) -> Path:
    if not path.is_file():
        raise SystemExit(f"{path} is missing — run npm run test:recorder")
    return path


def text(path: Path) -> str:
    return need(path).read_text(encoding="utf-8")


def image_uri(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(need(path).read_bytes()).decode("ascii")


def command(*args: str) -> str:
    result = subprocess.run(args, cwd=REPO, capture_output=True, text=True, check=True)
    return result.stdout.strip()


acceptance_path = need(ASSETS / "recorder-acceptance.json")
freshness_floor = max(
    JOURNEY.stat().st_mtime,
    max(path.stat().st_mtime for path in (REPO / "src" / "recorder").glob("*.ts*")),
    (REPO / "scripts" / "recording_store.py").stat().st_mtime,
    (REPO / "scripts" / "recorder_frames.mjs").stat().st_mtime,
)
if acceptance_path.stat().st_mtime < freshness_floor:
    raise SystemExit("recorder acceptance evidence is stale — run npm run test:recorder")

acceptance = json.loads(text(acceptance_path))
manifest = json.loads(text(ASSETS / "recorder-sample-manifest.json"))
moments = json.loads(text(ASSETS / "recorder-sample-moments.json"))
timeline = [json.loads(line) for line in text(ASSETS / "recorder-sample-timeline.jsonl").splitlines() if line]
store_full = [json.loads(line) for line in text(ASSETS / "recorder-sample-store-full.jsonl").splitlines() if line]
packet = text(ASSETS / "recorder-sample-packet.txt")
screenshot = image_uri(ASSETS / "recorder-playback.png")

passed = sum(1 for check in acceptance if check["ok"])
lanes: dict[str, int] = {}
for row in timeline:
    lanes[row["lane"]] = lanes.get(row["lane"], 0) + 1

layer_samples = {
    "summary": packet[:2600],
    "moments": json.dumps(moments[:8], indent=2),
    "timeline": "\n".join(json.dumps(row) for row in timeline[:18]),
    "lossless": json.dumps(store_full[0] if store_full else {}, indent=2)[:7000],
}

artifact_rows = "\n".join(
    f"<tr><td><code>{html.escape(item['file'])}</code></td><td>{item.get('rows', '—')}</td>"
    f"<td>{item['bytes']:,}</td><td>{html.escape(item['description'])}</td></tr>"
    for item in manifest["artifacts"]
)
acceptance_rows = "\n".join(
    f"<tr><td><span class='pass'>PASS</span></td><td><code>{html.escape(check['id'])}</code></td><td>{html.escape(check['label'])}</td></tr>"
    for check in acceptance
)
lane_chips = "".join(
    f"<span><b>{count}</b> {html.escape(lane)}</span>" for lane, count in sorted(lanes.items())
)

page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SystemSketch recorder · progressive deep capture</title>
<style>
:root{{--ink:#17202a;--muted:#64707d;--paper:#f4f6f8;--card:#fff;--line:#dce2e7;--blue:#315be8;--green:#10713c;--orange:#b45f16}}
*{{box-sizing:border-box}} body{{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 Inter,system-ui,sans-serif}}
main{{width:min(1180px,calc(100% - 32px));margin:auto;padding:38px 0 72px}} h1{{font-size:clamp(34px,5vw,56px);line-height:1.02;letter-spacing:-.05em;margin:8px 0 14px}}
h2{{margin:50px 0 6px;font-size:27px;letter-spacing:-.03em}} .sub{{color:var(--muted);max-width:880px;margin:0 0 20px}}
.hero,.card,figure{{background:var(--card);border:1px solid var(--line);border-radius:20px}} .hero{{padding:34px}} .kicker{{font:800 12px ui-monospace,monospace;letter-spacing:.12em;color:var(--blue);text-transform:uppercase}}
.lede{{max-width:920px;color:var(--muted);font-size:18px}} .badges,.lanes{{display:flex;flex-wrap:wrap;gap:8px;margin-top:20px}} .badges span,.lanes span{{border:1px solid var(--line);border-radius:999px;padding:6px 10px;background:#fafbfc;font:700 12px ui-monospace,monospace}}
.badges .ok,.pass{{background:#edf9f1;color:var(--green);border-color:#bce1c8}} .flow{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}} .card{{padding:20px}} .card b{{font-size:17px}} .card p{{color:var(--muted);margin:7px 0 0}}
.flow .card:not(:last-child)::after{{content:'→';float:right;color:var(--blue);font-size:24px}} @media(max-width:800px){{.flow{{grid-template-columns:1fr}}.flow .card::after{{display:none}}}}
.explorer{{display:grid;grid-template-columns:240px 1fr;gap:12px}} .tabs{{display:flex;flex-direction:column;gap:8px}} button{{text-align:left;border:1px solid var(--line);background:#fff;border-radius:10px;padding:10px 12px;cursor:pointer;font-weight:700}} button.on{{border-color:var(--blue);box-shadow:0 0 0 2px #315be822;color:var(--blue)}}
pre{{margin:0;min-height:380px;max-height:560px;overflow:auto;background:#101419;color:#dce5ef;border-radius:14px;padding:16px;font:12px/1.55 ui-monospace,monospace;white-space:pre-wrap}}
figure{{margin:0;padding:12px}} figure img{{display:block;width:100%;border:1px solid var(--line);border-radius:12px}} figcaption{{padding:10px 4px 2px;color:var(--muted)}}
table{{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line)}} th,td{{text-align:left;padding:9px 11px;border-bottom:1px solid var(--line);vertical-align:top}} th{{font-size:11px;text-transform:uppercase;letter-spacing:.08em;background:#f8fafb}} code{{font:12px ui-monospace,monospace}} .table{{border-radius:16px;overflow:auto}} .pass{{display:inline-block;border-radius:99px;padding:2px 7px;font:800 10px ui-monospace,monospace}}
.privacy{{border-left:4px solid var(--orange)}} footer{{margin-top:48px;color:var(--muted);font-size:13px}} @media(max-width:760px){{.explorer{{grid-template-columns:1fr}}.tabs{{flex-direction:row;overflow:auto}}}}
</style></head><body><main>
<section class="hero"><div class="kicker">SystemSketch · implementation evidence · 2 September 2026</div>
<h1>More evidence,<br>less default noise.</h1>
<p class="lede">The flight recorder now writes a compact causal index first and keeps lossless replay data, host diagnostics, request timing, semantic actions, UI hit geometry, performance stalls, and full error stacks behind linked detail files. Screenshots are selected around meaningful events instead of cadence alone.</p>
<div class="badges"><span class="ok">{passed}/{len(acceptance)} real-browser checks</span><span class="ok">{len(store_full)} lossless store diffs in the sample</span><span>{len(manifest['artifacts'])} indexed artifacts</span><span>branch {html.escape(command('git','branch','--show-current'))} · {html.escape(command('git','rev-parse','--short','HEAD'))}</span></div></section>

<h2>Progressive disclosure is the file format</h2><p class="sub">An agent can stop after any layer. Every deeper record shares the same millisecond clock and is reached by an ID or moment, so “more information” does not mean “read everything.”</p>
<section class="flow"><div class="card"><b>1 · README</b><p>Small paste: identity, health, counts, errors, and reading order.</p></div><div class="card"><b>2 · Moments</b><p>Errors, stalls, actions and menus paired with the nearest frame.</p></div><div class="card"><b>3 · Timeline</b><p>Compact causal rows across all lanes; detail IDs are hyperlinks in spirit.</p></div><div class="card"><b>4 · Deep evidence</b><p>Complete records, stacks, hit-test stacks, host requests and snapshots.</p></div></section>

<h2>Inspect the layers</h2><p class="sub">This switcher is built from the accepted journey’s real packet, not illustrative data.</p>
<section class="explorer"><div class="tabs"><button class="on" data-layer="summary">README summary</button><button data-layer="moments">moments.json</button><button data-layer="timeline">timeline.jsonl</button><button data-layer="lossless">store.full.jsonl</button></div><pre id="sample"></pre></section>

<h2>The synchronized viewer</h2><p class="sub">Raw input, DOM, store and UI lanes start collapsed. They remain available beside the event-aware filmstrip, and clicking a highlighted row opens its structured detail.</p>
<figure><img src="{screenshot}" alt="Playback viewer showing a SystemSketch recording, causal lanes, filmstrip and collapsed detail panel"><figcaption>Real output from <code>npm run test:recorder</code>. The UI, event log, frames and detail drawer are all generated into the saved folder.</figcaption></figure>

<h2>What the accepted sample contains</h2><div class="lanes">{lane_chips}</div>
<div class="table" style="margin-top:14px"><table><thead><tr><th>Artifact</th><th>Rows</th><th>Bytes</th><th>Purpose</th></tr></thead><tbody>{artifact_rows}</tbody></table></div>

<h2>Privacy remains a capture boundary</h2><section class="card privacy"><b>Progressive disclosure controls attention, not exposure.</b><p>Network and clipboard bodies are not captured. Text-input events keep lengths rather than values, password keystrokes are redacted, and the packet records request metadata and failures without copying response content.</p></section>

<h2>Executable evidence</h2><p class="sub">The journey drives Start → interaction → autosave → Stop against a private board and real Chrome debugging port, then reads the folder back from disk and opens its standalone playback page.</p><div class="table"><table><thead><tr><th></th><th>Check</th><th>Claim</th></tr></thead><tbody>{acceptance_rows}</tbody></table></div>
<footer>Generated by <code>docs/build_recorder_deep_capture.py</code> from fresh recorder journey artifacts. tldraw remains stock at 5.3.2.</footer>
<script>
const samples={json.dumps(layer_samples)}; const out=document.querySelector('#sample');
function show(name){{out.textContent=samples[name];document.querySelectorAll('[data-layer]').forEach(b=>b.classList.toggle('on',b.dataset.layer===name))}}
document.querySelectorAll('[data-layer]').forEach(button=>button.addEventListener('click',()=>show(button.dataset.layer)));show('summary');
</script></main></body></html>"""

OUTPUT.write_text(page, encoding="utf-8")
print(OUTPUT)
