#!/usr/bin/env python3
"""Build the SystemSketch depth-navigator Babble & Prune gallery."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path


DOCS_DIR = Path(__file__).resolve().parent
SPEC_PATH = DOCS_DIR / "system-depth-navigator-babble-2026-09-01.json"
HTML_PATH = DOCS_DIR / "system-depth-navigator-babble-2026-09-01.html"
GALLERY = Path.home() / ".agents/skills/babble/scripts/gallery.py"


CUSTOM_STYLE = r"""
<style>
  /* Focus mode is the fidelity view: the selected concept becomes the app viewport. */
  .variant-grid.focus-layout {
    width: 100vw;
    max-width: none;
    margin-left: calc(50% - 50vw);
    grid-template-columns: minmax(0, 1fr);
  }

  .variant-grid.focus-layout .variant-card.is-focused {
    border-inline: 0;
    border-radius: 0;
    box-shadow: none;
  }

  .variant-grid.focus-layout .variant-card.is-focused .prototype-frame {
    margin-inline: 0;
    border-inline: 0;
    border-radius: 0;
  }

  .prototype-frame:has(.depth-mock) > .prototype-label { display: none; }

  .depth-mock {
    position: relative;
    container-type: inline-size;
    width: 100%;
    min-height: 0;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    border-radius: 13px;
    color: #23262c;
    background-color: #fafafa;
    background-image: radial-gradient(#d9dce1 1px, transparent 1px);
    background-size: 18px 18px;
    font: 11px/1.35 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .variant-grid.focus-layout .depth-mock { border-radius: 0; }

  .depth-mock * { box-sizing: border-box; }

  .depth-mock button {
    border: 0;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .depth-top-left,
  .depth-top-right,
  .depth-nav,
  .depth-bottom-toolbar,
  .depth-utilities {
    position: absolute;
    z-index: 8;
    display: flex;
    align-items: center;
    border: 1px solid #dedfe3;
    background: rgb(255 255 255 / 97%);
    box-shadow: 0 3px 10px rgb(31 36 44 / 10%), 0 12px 30px rgb(31 36 44 / 8%);
    backdrop-filter: blur(14px);
  }

  .depth-top-left {
    top: 14px;
    left: 14px;
    height: 46px;
    overflow: hidden;
    border-radius: 14px;
  }

  .depth-top-left > span {
    display: grid;
    height: 100%;
    place-items: center;
    padding: 0 10px;
    border-right: 1px solid #eceef1;
    white-space: nowrap;
  }

  .depth-top-left > span:last-child { border-right: 0; }
  .depth-top-left .menu-glyph { width: 36px; padding: 0; font-size: 17px; }
  .depth-top-left .file-name { gap: 6px; font-weight: 750; }
  .depth-top-left .file-name i { width: 6px; height: 6px; border-radius: 50%; background: #4bbf79; }
  .depth-top-left .page-name { color: #5e646d; }

  .depth-top-right {
    top: 14px;
    right: 14px;
    height: 46px;
    gap: 4px;
    padding: 4px;
    border-radius: 14px;
  }

  .depth-avatar {
    display: grid;
    width: 29px;
    height: 29px;
    place-items: center;
    border-radius: 50%;
    color: #fff;
    background: #ca603d;
    font-weight: 850;
  }

  .depth-share {
    display: grid;
    height: 31px;
    place-items: center;
    padding: 0 11px;
    border-radius: 8px;
    color: #fff;
    background: #8358e8;
    font-weight: 800;
  }

  .depth-nav {
    top: 14px;
    left: clamp(260px, 31cqw, 395px);
    min-height: 46px;
    border-radius: 14px;
  }

  .depth-nav button:focus-visible,
  .scope-block--interactive:focus-visible,
  .scope-ledge button:focus-visible {
    outline: 2px solid #6f58e9;
    outline-offset: 2px;
  }

  .depth-parent-pill { overflow: hidden; }

  .depth-parent-pill .up-segment {
    display: grid;
    width: 42px;
    height: 44px;
    place-items: center;
    border-right: 1px solid #eceef1;
    background: #fff;
    font-size: 18px;
    font-weight: 800;
  }

  .depth-parent-pill .up-segment:hover,
  .history-up:hover,
  .crumb-button:hover,
  .stack-row:hover,
  .scope-ledge button:hover { background: #f0edff; color: #6542d7; }

  .depth-parent-pill .current-scope {
    display: flex;
    height: 44px;
    align-items: center;
    gap: 8px;
    padding: 0 11px;
    white-space: nowrap;
  }

  .depth-parent-pill b { font-size: 12px; }
  .depth-parent-pill small,
  .depth-count {
    display: inline-grid;
    min-width: 21px;
    height: 20px;
    place-items: center;
    padding: 0 6px;
    border-radius: 6px;
    color: #6647ca;
    background: #eee9ff;
    font-size: 9px;
    font-weight: 850;
  }

  .breadcrumb-rail {
    left: clamp(260px, 31cqw, 395px);
    max-width: calc(100% - clamp(260px, 31cqw, 395px) - 126px);
    gap: 3px;
    padding: 4px 7px;
    overflow: hidden;
  }

  .breadcrumb-rail span,
  .breadcrumb-rail button {
    display: grid;
    height: 32px;
    place-items: center;
    padding: 0 8px;
    border-radius: 8px;
    background: transparent;
    white-space: nowrap;
  }

  .breadcrumb-rail .crumb-button { color: #555c66; }
  .breadcrumb-rail .separator { padding: 0 1px; color: #a4a8ae; }
  .breadcrumb-rail .current { min-width: 0; overflow: hidden; font-weight: 850; text-overflow: ellipsis; }

  .depth-stack-trigger {
    display: flex;
    height: 44px;
    align-items: center;
    gap: 8px;
    padding: 0 11px;
    border-radius: 13px;
    background: #fff;
    font-weight: 800;
  }

  .depth-stack-trigger .stack-icon {
    display: grid;
    width: 21px;
    height: 21px;
    place-items: center;
    border: 1px solid #b9a9ee;
    border-radius: 6px;
    color: #6542d7;
    background: #f1edff;
  }

  .stack-popover {
    position: absolute;
    z-index: 9;
    top: 66px;
    left: clamp(260px, 31cqw, 395px);
    width: 238px;
    padding: 9px;
    border: 1px solid #dcdee3;
    border-radius: 15px;
    background: rgb(255 255 255 / 98%);
    box-shadow: 0 18px 46px rgb(31 36 44 / 17%);
  }

  .stack-popover header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 3px 4px 8px;
    color: #858b95;
    font-size: 9px;
    font-weight: 850;
    letter-spacing: .08em;
    text-transform: uppercase;
  }

  .stack-list { display: grid; gap: 4px; }

  .stack-row {
    position: relative;
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr) auto;
    min-height: 36px;
    align-items: center;
    gap: 7px;
    padding: 0 8px;
    border-radius: 9px;
    background: transparent;
    text-align: left;
  }

  .stack-row::before {
    content: '';
    position: absolute;
    top: -7px;
    bottom: 24px;
    left: 18px;
    width: 1px;
    background: #d6d9df;
  }

  .stack-row:first-child::before { display: none; }
  .stack-row i { position: relative; z-index: 1; width: 8px; height: 8px; border: 2px solid #9ba1aa; border-radius: 50%; background: #fff; }
  .stack-row b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .stack-row small { color: #969ba4; font-size: 9px; }
  .stack-row.current { color: #5e3bc4; background: #f1edff; }
  .stack-row.current i { border-color: #7656dd; background: #7656dd; }

  .history-nav { gap: 0; overflow: hidden; }

  .history-glyph,
  .history-nav button,
  .history-nav .history-current {
    display: grid;
    height: 44px;
    place-items: center;
    border-right: 1px solid #eceef1;
  }

  .history-glyph { width: 34px; color: #6a7079; font-size: 16px; }
  .history-glyph.disabled { color: #c7cad0; }
  .history-nav button { padding: 0 10px; background: #fff; font-weight: 750; }
  .history-nav .history-current { max-width: 150px; padding: 0 11px; border-right: 0; overflow: hidden; font-weight: 850; text-overflow: ellipsis; white-space: nowrap; }

  .scope-panel {
    position: absolute;
    z-index: 2;
    inset: 0;
    overflow: hidden;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  .scope-header {
    position: absolute;
    top: 82px;
    left: 32px;
    z-index: 2;
  }

  .scope-header small {
    display: block;
    margin-bottom: 2px;
    color: #888e97;
    font-size: 8px;
    font-weight: 850;
    letter-spacing: .1em;
    text-transform: uppercase;
  }

  .scope-header b { font-size: clamp(17px, 1.45cqw, 23px); letter-spacing: -.025em; }
  .scope-header em { margin-left: 7px; color: #7a5add; font-size: 9px; font-style: normal; font-weight: 800; }

  .scope-block {
    position: absolute;
    z-index: 2;
    display: grid;
    width: clamp(150px, 18cqw, 240px);
    min-height: clamp(90px, 11.5cqw, 148px);
    place-content: center;
    gap: 3px;
    padding: 12px 16px;
    border: 1px solid #d3d6dc;
    border-radius: 10px;
    background: #fff;
    box-shadow: 0 5px 16px rgb(31 36 44 / 9%);
    text-align: center;
  }

  .scope-block b { font-size: clamp(12px, 1.15cqw, 18px); }
  .scope-block small { color: #878d96; font-size: clamp(8px, .72cqw, 11px); }
  .scope-block--one { top: 50%; left: 18%; transform: translateY(-50%); }
  .scope-block--two { top: 50%; right: 18%; transform: translateY(-50%); }
  .scope-block--interactive {
    border: 2px solid #7958e0;
    color: #3e2a78;
    background: #fbf9ff;
  }

  .scope-block--interactive::after {
    content: 'Double-click to step in';
    position: absolute;
    right: 8px;
    bottom: 5px;
    color: #8a73cf;
    font-size: 7px;
    font-weight: 750;
  }

  .scope-wire {
    position: absolute;
    z-index: 1;
    top: 50%;
    left: 36%;
    width: 28%;
    height: 2px;
    background: #9ba1aa;
  }

  .scope-wire::after {
    content: '';
    position: absolute;
    top: -3px;
    right: -1px;
    border-top: 4px solid transparent;
    border-bottom: 4px solid transparent;
    border-left: 6px solid #9ba1aa;
  }

  .scope-caption {
    position: absolute;
    left: 32px;
    bottom: 76px;
    color: #999ea6;
    font-size: 8px;
  }

  .scope-caption b { color: #6c727b; }

  .depth-bottom-toolbar {
    z-index: 8;
    bottom: 14px;
    left: 50%;
    height: 48px;
    gap: 3px;
    padding: 4px;
    border-radius: 14px;
    transform: translateX(-50%);
  }

  .depth-bottom-toolbar span {
    display: grid;
    width: 38px;
    height: 38px;
    place-items: center;
    border-radius: 8px;
    font-size: 15px;
  }

  .depth-bottom-toolbar .selected { color: #fff; background: #4c86e8; }

  .depth-utilities {
    right: 13px;
    bottom: 14px;
    height: 48px;
    overflow: hidden;
    border-radius: 14px;
  }

  .depth-utilities span {
    display: grid;
    min-width: 34px;
    height: 46px;
    place-items: center;
    border-right: 1px solid #eceef1;
  }

  .depth-utilities span:last-child { border-right: 0; }
  .depth-utilities .zoom { min-width: 48px; font-weight: 800; }

  .scope-ledge {
    position: absolute;
    z-index: 7;
    top: 82px;
    left: 44px;
    display: flex;
    height: 38px;
    align-items: center;
    overflow: hidden;
    border: 1px solid #8f7ad9;
    border-radius: 10px 10px 10px 2px;
    color: #4d398f;
    background: #f7f4ff;
    box-shadow: 0 7px 20px rgb(76 55 143 / 14%);
  }

  .scope-ledge::after {
    content: '';
    position: absolute;
    bottom: -9px;
    left: -1px;
    width: 22px;
    height: 9px;
    border-left: 2px solid #8f7ad9;
  }

  .scope-ledge button {
    display: grid;
    width: 36px;
    height: 36px;
    place-items: center;
    border-right: 1px solid #d8d0ef;
    background: transparent;
    font-size: 17px;
  }

  .scope-ledge span { padding: 0 11px; font-weight: 850; }
  .scope-ledge small { padding-right: 10px; color: #8a78c4; font-size: 8px; font-weight: 800; }
  .spatial-scope { border: 2px solid rgb(124 91 221 / 52%); box-shadow: inset 0 0 0 3px rgb(124 91 221 / 7%); }
  .spatial-scope .scope-header { top: 136px; }

  /* Component display rules must not reveal the next story state prematurely. */
  .prototype:not(.is-alt) .depth-mock .demo-alt-only { display: none !important; }

  .depth-media-strip,
  .depth-media-flow,
  .depth-media-stack {
    display: flex;
    min-height: 138px;
    align-items: center;
    justify-content: center;
    gap: 9px;
    padding: 20px;
    color: #353a42;
    background: #f7f7f5;
    font: 11px/1.35 Inter, ui-sans-serif, system-ui, sans-serif;
  }

  .depth-media-strip span,
  .depth-media-flow span,
  .depth-media-stack span {
    display: grid;
    min-height: 36px;
    place-items: center;
    padding: 7px 10px;
    border: 1px solid #d9dce1;
    border-radius: 9px;
    background: #fff;
    text-align: center;
  }

  .depth-media-strip span.on,
  .depth-media-flow span.on,
  .depth-media-stack span.on { border-color: #a994e8; color: #5f41c1; background: #f1edff; font-weight: 800; }
  .depth-media-strip i,
  .depth-media-flow i,
  .depth-media-stack i { color: #9ca1aa; font-style: normal; font-weight: 850; }
  .depth-media-flow { flex-wrap: wrap; }
  .depth-media-flow b { color: #6550aa; }
  .depth-media-stack { align-items: stretch; }
  .depth-media-stack span { min-width: 102px; }
  .depth-media-stack small { color: #8a9099; font-size: 8px; }

  @media (max-width: 760px) {
    .variant-grid.focus-layout {
      width: 100vw;
      margin-left: calc(50% - 50vw);
    }
    .depth-mock { min-height: 560px; aspect-ratio: auto; }
    .depth-top-right { display: none; }
    .depth-top-left .page-name { display: none; }
    .depth-nav { top: 64px; left: 14px; }
    .breadcrumb-rail { right: 14px; max-width: none; }
    .stack-popover { top: 112px; left: 14px; }
    .scope-ledge { top: 125px; left: 28px; }
    .scope-header { top: 132px; left: 24px; }
    .scope-block--one { left: 9%; }
    .scope-block--two { right: 9%; }
    .scope-caption { left: 24px; }
  }
</style>
"""


def score(value: int, evidence: str, confidence: str = "high") -> dict[str, object]:
    return {"score": value, "evidence": evidence, "confidence": confidence}


def gate_results(*evidence: str) -> dict[str, dict[str, object]]:
    return {
        f"g{index}": {"pass": True, "evidence": item}
        for index, item in enumerate(evidence, start=1)
    }


def shared_chrome() -> str:
    return """
      <nav class="depth-top-left" aria-label="File and page chrome">
        <span class="menu-glyph">≡</span>
        <span class="file-name"><i></i>Robot sorter.tldr</span>
        <span class="page-name">Page 1⌄</span>
        <span aria-hidden="true">⌘</span>
      </nav>
      <nav class="depth-top-right" aria-label="Collaboration chrome">
        <span class="depth-avatar">Z</span>
        <span aria-hidden="true">▣</span>
        <span class="depth-share">Share</span>
      </nav>
    """


def shared_bottom_chrome() -> str:
    return """
      <nav class="depth-bottom-toolbar" aria-label="Drawing toolbar">
        <span class="selected">↖</span><span>☝</span><span>✎</span><span>◇</span><span>↗</span><span>⌑</span>
      </nav>
      <nav class="depth-utilities" aria-label="Zoom and help">
        <span>▣</span><span>−</span><span class="zoom">100%</span><span>＋</span><span>?</span>
      </nav>
    """


def scope_panels(*, spatial: bool = False) -> str:
    spatial_class = " spatial-scope" if spatial else ""
    return f"""
      <section class="scope-panel{spatial_class} demo-base-only" aria-label="Camera pipeline scope">
        <header class="scope-header"><small>Current scope</small><b>Camera pipeline</b><em>depth 3</em></header>
        <article class="scope-block scope-block--one"><b>Object detector</b><small>image → detections</small></article>
        <i class="scope-wire" aria-hidden="true"></i>
        <article class="scope-block scope-block--two"><b>Frame cache</b><small>detections → tracks</small></article>
        <span class="scope-caption"><b>Expanded Block is the viewport boundary.</b> Outside shapes remain in the document, not in this scope.</span>
      </section>
      <section class="scope-panel{spatial_class} demo-alt-only" aria-label="Perception scope">
        <header class="scope-header"><small>Current scope</small><b>Perception</b><em>depth 2</em></header>
        <button class="scope-block scope-block--one scope-block--interactive" data-demo-toggle data-action="down"><b>Camera pipeline</b><small>image processing</small></button>
        <i class="scope-wire" aria-hidden="true"></i>
        <article class="scope-block scope-block--two"><b>Sensor fusion</b><small>tracks → world model</small></article>
        <span class="scope-caption"><b>Descend from a real Block.</b> There is no generic Down arrow because no child is implied until one is chosen.</span>
      </section>
    """


def depth_preview(navigator: str, *, extra: str = "", class_name: str = "", spatial: bool = False) -> str:
    return f"""
    <div class="depth-mock {class_name}">
      {shared_chrome()}
      {navigator}
      {extra}
      {scope_panels(spatial=spatial)}
      {shared_bottom_chrome()}
    </div>
    """


V1_NAV = """
  <nav class="depth-nav depth-parent-pill" aria-label="Parent navigator">
    <button class="up-segment demo-base-only" data-demo-toggle data-action="up" aria-label="Step out to Perception" title="Step out to Perception">↑</button>
    <span class="up-segment demo-alt-only" aria-hidden="true">↑</span>
    <span class="current-scope demo-base-only"><b>Camera pipeline</b><small>3</small></span>
    <span class="current-scope demo-alt-only"><b>Perception</b><small>2</small></span>
  </nav>
"""


V2_NAV = """
  <nav class="depth-nav breadcrumb-rail demo-base-only" aria-label="Scope breadcrumb">
    <span>Robot sorter</span><span class="separator">›</span>
    <button class="crumb-button" data-demo-toggle data-action="ancestor">Perception</button><span class="separator">›</span>
    <span class="current">Camera pipeline</span><span class="depth-count">3</span>
  </nav>
  <nav class="depth-nav breadcrumb-rail demo-alt-only" aria-label="Scope breadcrumb">
    <span>Robot sorter</span><span class="separator">›</span>
    <span class="current">Perception</span><span class="depth-count">2</span>
  </nav>
"""


V3_NAV = """
  <nav class="depth-nav demo-base-only" aria-label="Depth stack trigger">
    <span class="depth-stack-trigger"><i class="stack-icon">3</i><b>Camera pipeline</b><span aria-hidden="true">⌄</span></span>
  </nav>
  <aside class="stack-popover demo-base-only" aria-label="Ancestor stack">
    <header><span>System depth</span><span>3 levels</span></header>
    <div class="stack-list">
      <span class="stack-row"><i></i><b>Robot sorter</b><small>root</small></span>
      <button class="stack-row" data-demo-toggle data-action="ancestor"><i></i><b>Perception</b><small>parent ↑</small></button>
      <span class="stack-row current"><i></i><b>Camera pipeline</b><small>current</small></span>
    </div>
  </aside>
  <nav class="depth-nav depth-parent-pill demo-alt-only" aria-label="Depth stack collapsed">
    <span class="up-segment" aria-hidden="true">↑</span>
    <span class="current-scope"><b>Perception</b><small>2</small></span>
  </nav>
"""


V4_NAV = """
  <nav class="depth-nav history-nav demo-base-only" aria-label="History and hierarchy navigator">
    <span class="history-glyph">←</span><span class="history-glyph disabled">→</span>
    <button class="history-up" data-demo-toggle data-action="up">↑ Perception</button>
    <span class="history-current">Camera pipeline · 3</span>
  </nav>
  <nav class="depth-nav history-nav demo-alt-only" aria-label="History and hierarchy navigator">
    <span class="history-glyph">←</span>
    <button data-demo-toggle data-action="forward" aria-label="Forward to Camera pipeline">→</button>
    <span class="history-glyph disabled">↑</span>
    <span class="history-current">Perception · 2</span>
  </nav>
"""


V5_EXTRA = """
  <aside class="scope-ledge demo-base-only" aria-label="Current scope ledge">
    <button data-demo-toggle data-action="up" aria-label="Step out to Perception">↑</button>
    <span>Camera pipeline</span><small>inside Perception · 3</small>
  </aside>
  <aside class="scope-ledge demo-alt-only" aria-label="Current scope ledge">
    <span>Perception</span><small>inside Robot sorter · 2</small>
  </aside>
"""


SPEC = {
    "schemaVersion": 3,
    "title": "Five ways to navigate arbitrary SystemSketch depth",
    "kicker": "SystemSketch · /babble 5 · Sep 1, 2026",
    "brief": "Let Zach step into an Expanded Block so that Block becomes the current canvas boundary, then step out without losing orientation. The hierarchy may be arbitrarily deep. Descending always begins from a chosen real Block; ascending always follows the current Block's one real parent.",
    "count": 5,
    "defaultId": "v3",
    "defaultWhy": "Depth Stack is the provisional default at 94.8/100. Its collapsed face stays nearly as quiet as the V1 sketch, while the popover makes an arbitrary parent chain legible and lets Zach jump to any ancestor without confusing structural Up with browser-like visit history.",
    "decisionHinge": "The winner depends on whether direct ancestor jumps are worth a disclosure surface. Move 6 weight points from arbitrary-depth orientation to canvas calmness and 6 from ancestor recovery to implementation fit, and V1 Parent Pill leads 93.2 to 92.4. If real sketches rarely exceed two or three levels, pick V1; if deep decomposition is a defining behavior, keep V3.",
    "invariants": [
        "Use the same Robot sorter → Perception → Camera pipeline → Object detector fixture, beginning inside Camera pipeline at depth 3.",
        "The visible ancestry comes only from the real tldraw parentId chain of nested Expanded Blocks; no view invents relationships or fixed C4 levels.",
        "Up follows the one real parent. Down appears only on a concrete expandable Block selected in the current scope; there is no generic Down arrow.",
        "Changing scope changes camera/projection/session view state only. It does not reparent, move, create, delete, or serialize canvas records.",
        "At the document root, parent controls disappear or become inert without implying another level."
    ],
    "boundary": "These are standalone interactive front-end slices in the current SystemSketch visual language. Up, ancestor selection, visit-forward, descent replay, guided stories, picks, and splice export work inside the gallery; real tldraw camera transactions, nested-record projection, keyboard shortcuts, persistence policy, and production chrome integration are simulated.",
    "axes": [
        {"name": "Mental model", "values": ["one parent escape", "persistent path", "stack switcher", "visit history plus hierarchy", "spatial portal"]},
        {"name": "Persistent information", "values": ["current + depth", "whole ancestry", "collapsed count", "history + parent + current", "scope boundary label"]},
        {"name": "Ancestor access", "values": ["repeat Up", "click any crumb", "pick any stack row", "Up plus back/forward", "repeat spatial exit"]},
        {"name": "Chrome ownership", "values": ["compact top pill", "top rail", "FigJam-like popover", "IcePanel-like control strip", "in-canvas ledge"]}
    ],
    "requirements": [
        {
            "id": "fr1",
            "name": "Unambiguous structural movement",
            "weight": 28,
            "why": "A global Down arrow is undefined until a Block is chosen, while every non-root scope has exactly one parent. The UI must teach that asymmetry instead of hiding it behind generic arrows.",
            "passCondition": "From Camera pipeline, Zach can identify the one parent action immediately; after stepping out, descent is offered only on the real Camera pipeline Block.",
            "anchors": {
                "1": "Back, Up, and Down are conflated or the control implies a child that has not been chosen.",
                "3": "The correct actions exist but their relationship requires interpretation.",
                "5": "Parent movement is unmistakable and descent is visibly attached to a concrete child Block."
            }
        },
        {
            "id": "fr2",
            "name": "Orientation at arbitrary depth",
            "weight": 26,
            "why": "SystemSketch must escape IcePanel's fixed C4 ladder and remain understandable at depth 3, 11, or 40 without pretending those levels have predefined names.",
            "passCondition": "The current scope and its position relative to root remain legible for an unbounded parent chain, with an honest overflow or repeated-navigation policy.",
            "anchors": {
                "1": "Only a fixed number of levels fit, or the current scope could plausibly be mistaken for root.",
                "3": "Depth is visible but the ancestry needed to interpret it is partly hidden or serial.",
                "5": "Current scope, root direction, and an arbitrarily long real ancestry remain recoverable without fixed level names."
            }
        },
        {
            "id": "fr3",
            "name": "Fast ancestor recovery",
            "weight": 20,
            "why": "The practical value of depth navigation is quickly regaining system context after working inside a small subsystem.",
            "passCondition": "Zach can return to Perception in one obvious action and can recover a farther ancestor without reconstructing the path from memory.",
            "anchors": {
                "1": "Recovery depends on remembering the path or leaving the canvas context.",
                "3": "The parent is easy, but distant ancestors require repeated serial actions.",
                "5": "The parent and any visible ancestor are directly recoverable while the current scope stays anchored."
            }
        },
        {
            "id": "fr4",
            "name": "Calm whiteboard fit",
            "weight": 16,
            "why": "The existing top-left capsule already carries file, page, and library controls. Depth should help when needed without turning the drawing surface into application chrome.",
            "passCondition": "The navigator fits the current floating SystemSketch language, leaves the canvas dominant, and degrades cleanly at narrow widths.",
            "anchors": {
                "1": "The control dominates or persistently consumes scarce canvas width.",
                "3": "It fits at common sizes but becomes busy or collapses awkwardly in deep/narrow cases.",
                "5": "It is quiet by default, visually native, and reveals detail only when it is useful."
            }
        },
        {
            "id": "fr5",
            "name": "Learnable implementation fit",
            "weight": 10,
            "why": "A strong V1 should compose existing tldraw ancestry, camera, focus, popover, and UI-slot seams instead of creating a second page model or broad navigation framework.",
            "passCondition": "The concept can be implemented as ephemeral focus history plus a parent-chain projection, using current public SystemSketch/tldraw chrome seams and familiar controls.",
            "anchors": {
                "1": "Needs a new persistent hierarchy model, bespoke camera system, or unfamiliar interaction grammar.",
                "3": "Reuses core data but adds meaningful custom layout, history, or spatial-transition machinery.",
                "5": "Projects the existing parent chain into a small familiar control with little new state."
            }
        }
    ],
    "hardGates": [
        {"id": "g1", "name": "No fixed depth ceiling", "why": "The design must support arbitrary nesting rather than encode the four C4 levels."},
        {"id": "g2", "name": "Only real parent relationships", "why": "Every visible ancestor must come from the actual nested Expanded-Block chain."},
        {"id": "g3", "name": "No undefined global Down", "why": "Descent exists only after a concrete child Block is chosen."},
        {"id": "g4", "name": "Honest root state", "why": "Root cannot show an active parent action or claim a nonexistent ancestor."},
        {"id": "g5", "name": "Navigation is view-only", "why": "Stepping must not mutate document topology or serialize navigation UI into the .tldr file."}
    ],
    "variants": [
        {
            "id": "v1",
            "name": "Parent Pill",
            "thesis": "Show only the current scope, its numeric depth, and one deterministic Up action; descend by double-clicking a real Block.",
            "accent": "#4f76c9",
            "bestWhen": "Most work moves one level at a time and the canvas should stay almost indistinguishable from the root view.",
            "losesWhen": "Zach frequently needs to jump from depth 11 to depth 2 or understand the named path without repeatedly stepping out.",
            "decisions": [
                {"label": "Default face", "value": "A split pill: one arrow segment for parent, current scope name, and a small depth count."},
                {"label": "Descent", "value": "No Down control. Double-click or invoke Step into on an actual Expanded Block."},
                {"label": "Root", "value": "The whole pill disappears at root, matching Zach's V1 sketch."}
            ],
            "keepParts": ["split Up segment", "current-scope label", "numeric depth badge", "hidden-at-root rule"],
            "proof": [
                "The live hero starts at Camera pipeline · 3; its Up segment changes the shared fixture to Perception · 2.",
                "The return action is attached to the real Camera pipeline Block in the parent view rather than a global Down arrow."
            ],
            "scores": {
                "fr1": score(5, "The only global direction is Up, and the exercised return is physically attached to Camera pipeline."),
                "fr2": score(4, "The current name and unbounded integer depth remain legible at any depth, but the named ancestry is recovered serially.", "medium"),
                "fr3": score(4, "The parent is one click away and repeated Up always works, but distant ancestors need repeated actions.", "high"),
                "fr4": score(5, "The 42 px split pill matches the existing floating capsule language and disappears entirely at root."),
                "fr5": score(5, "It needs only a parent lookup, current focus name/depth, and one camera/projection transaction.")
            },
            "gateResults": gate_results(
                "Depth is rendered as an integer and parent traversal has no enumerated level limit.",
                "The pill reads the immediate parent/current chain rather than a second hierarchy.",
                "The parent view exposes descent on the concrete Camera pipeline Block.",
                "The supporting root-state exhibit removes the pill.",
                "The prototype changes scope presentation only; the fixture topology is unchanged."
            ),
            "previewLabel": "interactive parent step",
            "story": {
                "title": "Step out, then return through the Block",
                "steps": [
                    {"label": "Inside Camera pipeline", "caption": "The compact pill names the current scope and depth; Up has exactly one meaning.", "state": "base", "target": "[data-action='up']"},
                    {"label": "Back in Perception", "caption": "Camera pipeline is now a concrete child Block; that Block owns the only descent affordance.", "state": "alt", "target": "[data-action='down']"}
                ]
            },
            "media": [
                {"label": "Root and deep states", "caption": "The pill vanishes at root and keeps the same geometry at depth 11; the number grows, not the level model.", "html": "<div class='depth-media-strip'><span><b>Robot sorter</b><small>root · no parent control</small></span><i>→</i><span class='on'>↑ <b>Motion control</b> · 11</span></div>"}
            ],
            "preview": depth_preview(V1_NAV, class_name="parent-pill-proposal")
        },
        {
            "id": "v2",
            "name": "Breadcrumb Rail",
            "thesis": "Keep the full containment path visible across the top so any ancestor is one click away and the current scope is always named in context.",
            "accent": "#287c70",
            "bestWhen": "Deep ancestry is constantly relevant and desktop width is plentiful enough to spend on persistent context.",
            "losesWhen": "The file/page capsule and collaboration chrome already consume most of the width, especially on smaller windows.",
            "decisions": [
                {"label": "Default face", "value": "Root › … › parent › current remains visible as a horizontal rail."},
                {"label": "Ancestor jump", "value": "Every ancestor crumb is a direct focus target; middle crumbs collapse into an ellipsis menu."},
                {"label": "Descent", "value": "Still belongs to a real Block on the canvas, not to the breadcrumb."}
            ],
            "keepParts": ["persistent root anchor", "direct ancestor crumbs", "middle-overflow rule", "current crumb emphasis"],
            "proof": [
                "Clicking the Perception crumb changes the same fixture from Camera pipeline · 3 to Perception · 2.",
                "The supporting exhibit shows the overflow contract for an eleven-level chain instead of truncating the current scope."
            ],
            "scores": {
                "fr1": score(5, "Ancestor crumbs are separate from on-Block descent, so structural direction remains explicit."),
                "fr2": score(5, "The path retains root, near ancestors, and current scope while collapsing only the middle through an explicit overflow."),
                "fr3": score(5, "Perception and every other exposed ancestor are direct click targets in one stable context."),
                "fr4": score(2, "A persistent rail competes with file/page and collaboration capsules and must wrap or move below them on narrow windows.", "high"),
                "fr5": score(4, "It is a direct parent-chain projection, but responsive overflow, roving focus, and collision with top chrome add behavior.")
            },
            "gateResults": gate_results(
                "The ellipsis policy scales the path without introducing named or numbered ceilings.",
                "Each crumb is sourced from the nested Expanded-Block parent chain.",
                "Descent remains attached to Camera pipeline in the parent canvas.",
                "At root the rail contains only the root/current crumb and no parent action.",
                "Crumb selection changes focus/camera state, not document records."
            ),
            "previewLabel": "interactive ancestor breadcrumb",
            "story": {
                "title": "Jump directly to an ancestor",
                "steps": [
                    {"label": "Read the whole path", "caption": "Root, parent, current scope, and depth are visible without opening anything.", "state": "base", "target": "[data-action='ancestor']"},
                    {"label": "Focus Perception", "caption": "The parent becomes current and Camera pipeline returns as the concrete way back down.", "state": "alt", "target": "[data-action='down']"}
                ]
            },
            "media": [
                {"label": "Depth-11 overflow", "caption": "Long paths preserve root, the nearest parent, and current scope; only the middle collapses behind an explicit ellipsis.", "html": "<div class='depth-media-strip'><span>Robot sorter</span><i>›</i><span>… 7 levels</span><i>›</i><span>Servo bank</span><i>›</i><span class='on'>Joint controller · 11</span></div>"}
            ],
            "preview": depth_preview(V2_NAV, class_name="breadcrumb-proposal")
        },
        {
            "id": "v3",
            "name": "Depth Stack",
            "thesis": "Use a FigJam-like compact level button that opens the real ancestor chain as a vertical stack, with current, parent, and root roles made explicit.",
            "accent": "#7656dd",
            "bestWhen": "Arbitrary depth is a defining feature but the ancestry should occupy space only while Zach is actively navigating it.",
            "losesWhen": "Even one disclosure click feels excessive and stepping only to the immediate parent is almost always enough.",
            "decisions": [
                {"label": "Default face", "value": "A compact current-scope + level-count button, visually borrowing FigJam's Pages affordance."},
                {"label": "Open state", "value": "A vertical root-to-current stack exposes each real ancestor and labels parent/current roles."},
                {"label": "Movement", "value": "Pick an ancestor from the stack; descend later from a concrete Block in that scope."}
            ],
            "keepParts": ["FigJam-like level count", "vertical ancestor stack", "parent/current role labels", "progressive disclosure"],
            "proof": [
                "The hero exposes the three-level real chain and clicking the Perception row changes the same fixture to its parent view.",
                "The returned canvas presents Camera pipeline as the only concrete way to descend again."
            ],
            "scores": {
                "fr1": score(5, "The stack labels Perception as parent and Camera pipeline as current; descent remains attached to a real Block."),
                "fr2": score(5, "The vertical list can scroll through an arbitrary parent chain while preserving explicit root and current endpoints."),
                "fr3": score(5, "Any ancestor row is directly selectable once disclosed, including the immediate parent exercised in the hero."),
                "fr4": score(4, "The collapsed button is compact and familiar; the popover temporarily covers a small canvas region while open."),
                "fr5": score(4, "It projects the existing chain into a standard popover, adding only open state, focus handling, and scroll-to-current behavior.")
            },
            "gateResults": gate_results(
                "The ancestor list is scrollable data rather than a fixed set of level slots.",
                "Every row corresponds to Robot sorter, Perception, or Camera pipeline in the real parent chain.",
                "The parent canvas attaches descent to Camera pipeline.",
                "At root the trigger says Root and the stack contains one non-actionable current row.",
                "The stack stores disclosure/focus state outside the .tldr document."
            ),
            "previewLabel": "interactive ancestor stack",
            "story": {
                "title": "Open the stack and recover context",
                "steps": [
                    {"label": "Inspect the real chain", "caption": "The stack names root, parent, and current without assuming C4 level names.", "state": "base", "target": "[data-action='ancestor']"},
                    {"label": "Land in Perception", "caption": "The compact face returns while the canvas exposes Camera pipeline as the real child entry.", "state": "alt", "target": "[data-action='down']"}
                ]
            },
            "media": [
                {"label": "Progressive depth", "caption": "The same control scales from one root row to a scrollable stack; the face stays compact regardless of chain length.", "html": "<div class='depth-media-stack'><span><b>1</b><small>Robot sorter · root</small></span><span class='on'><b>3</b><small>root → parent → current</small></span><span><b>11</b><small>scroll · current pinned</small></span></div>"}
            ],
            "preview": depth_preview(V3_NAV, class_name="depth-stack-proposal")
        },
        {
            "id": "v4",
            "name": "History + Up",
            "thesis": "Keep IcePanel's Back/Forward visit history, but add a separate structural Up control so chronological navigation and containment never share an arrow.",
            "accent": "#bc6d2f",
            "bestWhen": "Zach frequently bounces between sibling subsystems and wants to recover the exact inspection trail as well as the parent hierarchy.",
            "losesWhen": "The extra axis makes the common parent action slower to parse or implies browser behavior the whiteboard does not otherwise need.",
            "decisions": [
                {"label": "Two axes", "value": "←/→ traverse visited scopes; ↑ follows the real containment parent."},
                {"label": "History", "value": "A short ephemeral focus stack stores visited scope IDs and clears safely when targets disappear."},
                {"label": "Descent", "value": "Forward may revisit a child, but first-time descent still requires selecting a real Block."}
            ],
            "keepParts": ["separate Up from Back", "ephemeral visit stack", "forward return after stepping out", "missing-target cleanup"],
            "proof": [
                "The base hero uses the dedicated ↑ Perception control rather than Back, then enables Forward to revisit Camera pipeline.",
                "The history icons remain visually separate from the current scope and structural parent label."
            ],
            "scores": {
                "fr1": score(3, "Up is technically distinct, but three neighboring arrows still demand interpretation and Forward can look like structural Down.", "high"),
                "fr2": score(3, "The current depth is visible, while history says where the user was rather than explaining the arbitrary parent chain.", "high"),
                "fr3": score(4, "The immediate parent is direct and history can recover visited ancestors, but unvisited distant ancestors remain serial."),
                "fr4": score(2, "The widest and busiest control persists in scarce top chrome even when history is not needed."),
                "fr5": score(2, "It adds an ephemeral navigation stack, invalidation rules, and keyboard semantics beyond the parent-chain projection.")
            },
            "gateResults": gate_results(
                "Containment depth is still unbounded; history capacity is an independent implementation detail.",
                "Only the dedicated Up segment claims a parent relationship.",
                "Forward is labeled as visit history; first descent remains on the Camera pipeline Block.",
                "At root the structural Up segment disables while history may remain independently available.",
                "Visit history and focus are ephemeral and do not enter .tldr records."
            ),
            "previewLabel": "interactive history and parent split",
            "story": {
                "title": "Separate structural Up from visit Forward",
                "steps": [
                    {"label": "Use structural Up", "caption": "The parent action names Perception; Back and Forward retain only visit-history meaning.", "state": "base", "target": "[data-action='up']"},
                    {"label": "Forward becomes available", "caption": "After stepping out, Forward can revisit Camera pipeline without pretending every parent has one child.", "state": "alt", "target": "[data-action='forward']"}
                ]
            },
            "media": [
                {"label": "Two independent graphs", "caption": "Containment is a tree path owned by parentId; visit history is a temporary sequence owned by the navigator session.", "html": "<div class='depth-media-flow'><span><b>Containment</b><small>Robot sorter ↑ Perception ↑ Camera pipeline</small></span><i>≠</i><span><b>Visit history</b><small>Motion planner ← Camera pipeline → Perception</small></span></div>"}
            ],
            "preview": depth_preview(V4_NAV, class_name="history-proposal")
        },
        {
            "id": "v5",
            "name": "Scope Ledge",
            "thesis": "Attach the current scope and its exit directly to the viewport boundary, making step-in feel like entering a spatial portal rather than changing application pages.",
            "accent": "#9a4f85",
            "bestWhen": "Spatial continuity is more important than toolbar consistency and the Block-as-new-bounds metaphor should be felt immediately.",
            "losesWhen": "The scope border collides with drawing content, overlays, or camera movement, or Zach expects navigation to stay in global chrome.",
            "decisions": [
                {"label": "Primary object", "value": "The focused Expanded Block boundary becomes a visible viewport frame with a title ledge."},
                {"label": "Exit", "value": "The ledge names current, parent, and depth; its arrow exits one containment boundary."},
                {"label": "Transition", "value": "A camera zoom morphs the child Block frame into the viewport and reverses on exit."}
            ],
            "keepParts": ["scope boundary ledge", "parent named in spatial context", "camera morph", "viewport-as-expanded-Block metaphor"],
            "proof": [
                "The hero places the Up action on Camera pipeline's purple viewport boundary and returns to the shared Perception view.",
                "The supporting trace separates the spatial camera transaction from the unchanged document records."
            ],
            "scores": {
                "fr1": score(5, "The exit is literally attached to the current containment boundary and descent remains attached to the child Block."),
                "fr2": score(4, "Current, parent, and depth are visible, but the full arbitrary ancestry is still recovered one boundary at a time.", "medium"),
                "fr3": score(3, "The parent is immediate; farther ancestors require repeated exits and there is no path overview."),
                "fr4": score(4, "Global chrome stays untouched, but the persistent frame and ledge consume canvas attention and may overlap content."),
                "fr5": score(2, "A convincing morph needs custom camera interpolation, overlay anchoring, interruption handling, and reduced-motion behavior.")
            },
            "gateResults": gate_results(
                "Repeated ledge exits traverse an unbounded parent chain.",
                "The ledge names only the current real Block and its immediate real parent.",
                "Descent appears on the actual Camera pipeline Block after exit.",
                "At root the purple scope border and ledge disappear.",
                "The camera morph changes presentation only; the source Blocks and parentIds remain intact."
            ),
            "previewLabel": "interactive spatial scope",
            "story": {
                "title": "Exit the Block-shaped viewport",
                "steps": [
                    {"label": "Feel the current boundary", "caption": "The purple viewport edge makes Camera pipeline's Expanded frame the current world.", "state": "base", "target": "[data-action='up']"},
                    {"label": "Reveal the parent canvas", "caption": "Perception becomes the viewport and Camera pipeline returns as a child entry point.", "state": "alt", "target": "[data-action='down']"}
                ]
            },
            "media": [
                {"label": "View-only camera transaction", "caption": "Step-in changes focus projection and camera bounds; shape geometry and parentId records remain byte-for-byte unchanged.", "html": "<div class='depth-media-flow'><span><b>Block bounds</b><small>Camera pipeline</small></span><i>→</i><span class='on'><b>focus + camera fit</b><small>ephemeral view</small></span><i>→</i><span><b>.tldr records</b><small>unchanged</small></span></div>"}
            ],
            "preview": depth_preview("", extra=V5_EXTRA, class_name="scope-ledge-proposal", spatial=True)
        }
    ],
    "checks": [
        "Exactly five structurally distinct navigator models",
        "The same file, viewport, hierarchy, starting scope, and child Blocks appear in every hero",
        "Every live hero supports a guided story and direct Up/ancestor plus real-Block descent or visit-forward interaction",
        "Five weighted criteria were frozen before variants and sum to 100%",
        "Every variant × criterion score includes observable evidence and confidence",
        "Five hard gates are evaluated separately and every recommended direction passes",
        "The gallery preserves all options and supports pick, shortlist, reject, notes, splice, copy, and download",
        "No production SystemSketch behavior, .tldr content, or fixed C4 level model was introduced"
    ]
}


def main() -> None:
    if not GALLERY.exists():
        raise SystemExit(f"Babble gallery builder not found: {GALLERY}")

    SPEC_PATH.write_text(json.dumps(SPEC, indent=2) + "\n", encoding="utf-8")
    if HTML_PATH.exists():
        HTML_PATH.unlink()
    subprocess.run(
        [
            "python3",
            str(GALLERY),
            "build",
            "--spec",
            str(SPEC_PATH),
            "--output",
            str(HTML_PATH),
            "--strict",
        ],
        check=True,
    )

    html = HTML_PATH.read_text(encoding="utf-8")
    html = html.replace("</head>", f"{CUSTOM_STYLE}\n</head>", 1)
    HTML_PATH.write_text(html, encoding="utf-8")

    subprocess.run(
        [
            "python3",
            str(GALLERY),
            "check",
            "--input",
            str(HTML_PATH),
            "--strict",
        ],
        check=True,
    )


if __name__ == "__main__":
    main()
