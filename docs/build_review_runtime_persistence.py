#!/usr/bin/env python3
"""Build the retained-review runtime gallery."""

from __future__ import annotations

from pathlib import Path
from textwrap import dedent


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "review-runtime-persistence-2026-09-03.html"


def build() -> str:
    return dedent(
        """\
        <!doctype html>
        <html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
        <title>SystemSketch retained review runtime — 3 Sep 2026</title>
        <style>
        :root{--paper:#f6f4ef;--ink:#172034;--muted:#596579;--line:#cad2de;--navy:#152742;--blue:#2774ce;--mint:#1a936f;--gold:#b46b00;--red:#a2353b}*{box-sizing:border-box}body{margin:0;background:linear-gradient(135deg,#e8eff8,#f6f4ef 47%);color:var(--ink);font:16px/1.5 Inter,ui-sans-serif,system-ui,sans-serif}main{width:min(1120px,calc(100% - 42px));margin:auto;padding:64px 0 84px}.eyebrow{color:var(--blue);font:800 12px/1 ui-monospace,monospace;letter-spacing:.14em}.hero{display:grid;grid-template-columns:1.5fr .8fr;gap:28px;align-items:end;margin:18px 0 38px}h1{font:800 clamp(39px,6vw,76px)/.94 Georgia,serif;letter-spacing:-.045em;margin:0}h2{font:700 29px/1.05 Georgia,serif;letter-spacing:-.025em;margin:58px 0 16px}.lede{max-width:760px;font-size:20px;color:var(--muted)}code,pre{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.promise{padding:21px;border-radius:16px;background:var(--navy);color:white;box-shadow:0 16px 35px #15274225}.promise b{display:block;color:#9de4ca;font-size:12px;letter-spacing:.12em}.promise p{margin:7px 0 0;color:#d5e5f7}.facts,.lanes,.controls{display:grid;gap:14px}.facts{grid-template-columns:repeat(4,1fr);margin:32px 0}.fact,.card{border:1px solid var(--line);background:#fffdfa;border-radius:16px;padding:20px}.fact b{display:block;font-size:30px;line-height:1.1}.fact span{color:var(--muted);font-size:13px}.lanes{grid-template-columns:repeat(5,1fr);align-items:stretch}.lane{position:relative;padding:22px 17px;min-height:205px;border:1px solid var(--line);background:#fffdfa}.lane:first-child{border-radius:16px 0 0 16px}.lane:last-child{border-radius:0 16px 16px 0}.step{display:inline-grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--ink);color:white;font:700 13px ui-monospace,monospace}.lane h3{margin:18px 0 6px;font-size:18px}.lane p{margin:0;color:var(--muted);font-size:14px}.lane:not(:last-child)::after{content:'→';position:absolute;right:-11px;top:76px;z-index:2;width:22px;color:var(--blue);background:var(--paper);text-align:center;font-size:20px}.terminal{overflow:auto;background:#162033;color:#dce8ff;border-radius:16px;padding:22px;box-shadow:0 12px 30px #16203319}.prompt{color:#7ed0b5}.states{display:grid;grid-template-columns:1fr auto 1fr auto 1fr;gap:14px;align-items:center}.state{padding:18px;border-radius:14px;background:#fffdfa;border:1px solid var(--line)}.state b{display:block}.state span{color:var(--muted);font-size:14px}.arrow{text-align:center;color:var(--blue);font-size:25px}.note{border-left:5px solid var(--gold);padding:16px 19px;background:#fff3d9;border-radius:0 12px 12px 0}.note p{margin:0}.controls{grid-template-columns:repeat(3,1fr);margin-top:14px}.control{border:1px solid var(--line);border-radius:13px;padding:17px;background:#fffdfa}.control b{display:block}.control p{margin:5px 0 0;color:var(--muted);font-size:14px}footer{margin-top:48px;padding-top:20px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}a{color:var(--blue)}@media(max-width:780px){main{width:min(100% - 28px,1120px);padding-top:42px}.hero,.facts,.lanes,.controls,.states{grid-template-columns:1fr}.lane,.lane:first-child,.lane:last-child{border-radius:14px}.lane:not(:last-child)::after{content:'↓';top:auto;bottom:-15px;right:calc(50% - 11px)}.arrow{transform:rotate(90deg)}}
        </style></head><body><main>
        <div class="eyebrow">SYSTEMSKETCH · RETAINED REVIEW RUNTIME · 03 SEPTEMBER 2026</div>
        <section class="hero"><div><h1>The review stays when the agent leaves.</h1><p class="lede">A finished task now publishes a deliberate review artifact rather than leaving an agent-owned development shell behind. The public URL is commit-pinned, health-checked, supervised, and explicitly retired.</p></div><aside class="promise"><b>THE LIFETIME PROMISE</b><p>Live from <code>up</code> until <code>down NAME</code>, <code>down --all</code>, or destructive <code>remove NAME</code>. No 30-minute idle timeout.</p></aside></section>
        <section class="facts"><div class="fact"><b>1</b><span>immutable commit per review</span></div><div class="fact"><b>2</b><span>public/API ports per review</span></div><div class="fact"><b>35 s</b><span>maximum initial health wait</span></div><div class="fact"><b>10 s</b><span>maximum restart backoff</span></div></section>
        <h2>One handoff, five intentional steps</h2><section class="lanes"><article class="lane"><span class="step">1</span><h3>Commit</h3><p>Board and report enter the reviewed commit. A dirty agent tree is never silently published.</p></article><article class="lane"><span class="step">2</span><h3>Publish</h3><p><code>npm run review -- up …</code> resolves <code>HEAD</code> to an immutable commit.</p></article><article class="lane"><span class="step">3</span><h3>Pin</h3><p>A detached worktree lives beside the primary checkout, not inside a temporary agent track.</p></article><article class="lane"><span class="step">4</span><h3>Supervise</h3><p>The detached runner owns Vite and API, verifies public <code>/api/health</code>, and restarts a failed pair.</p></article><article class="lane"><span class="step">5</span><h3>Retire</h3><p>Stop one, stop all, or explicitly remove the pinned worktree. The normal sweeper refuses leased reviews.</p></article></section>
        <h2>The commands that matter</h2><pre class="terminal"><span class="prompt">$</span> npm run review -- up loop-ports --ref HEAD \\
    --board sketches/review/loop-ports.systemsketch \\
    --report docs/loop-ports-2026-09-03.html

<span class="prompt">$</span> npm run review -- list
<span class="prompt">$</span> npm run review -- down loop-ports
<span class="prompt">$</span> npm run review -- down --all</pre>
        <h2>Stopping is not deleting</h2><section class="states"><article class="state"><b>UP · healthy</b><span>The agent can end; a detached process session retains the review.</span></article><div class="arrow">→</div><article class="state"><b>DOWN · restartable</b><span><code>down</code> stops memory use but preserves the lease, commit, board, and stable URL assignment.</span></article><div class="arrow">→</div><article class="state"><b>REMOVED · explicit</b><span><code>remove</code> is the only action that removes the retained worktree.</span></article></section>
        <h2>Why archive does not currently stop it</h2><section class="note"><p><strong>Deliberate boundary:</strong> Codex’s available session-end hook also runs when a chat has been inactive and unopened for 30 minutes, and it currently reports no archive-specific reason. Wiring cleanup to it would cause the same delayed-review failure this runtime exists to solve. Until Codex exposes an archive-only lifecycle event, <code>down --all</code> is the dependable manual reset.</p></section>
        <section class="controls"><article class="control"><b>For agents</b><p><code>AGENTS.md</code> now requires durable links to use the retained runtime, never <code>serve.sh</code>.</p></article><article class="control"><b>For cleanup</b><p>The worktree sweeper detects a <code>.review-runtime/lease.json</code> and refuses to remove it.</p></article><article class="control"><b>For recovery</b><p><code>list</code> checks public health; a failed child pair is supervised with bounded backoff.</p></article></section>
        <footer>Built from <code>scripts/review_runtime.py</code>, <code>scripts/new_track.py</code>, <code>scripts/sweep_worktrees.py</code>, and <code>AGENTS.md</code> · <a href="../README.md">README</a> · <a href="build_review_runtime_persistence.py">gallery builder</a></footer>
        </main></body></html>
        """
    )


if __name__ == "__main__":
    OUTPUT.write_text(build(), encoding="utf-8")
    print(OUTPUT)
