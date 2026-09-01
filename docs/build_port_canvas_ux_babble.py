#!/usr/bin/env python3
"""Build the ten-direction Port-on-canvas Babble + Prune gallery."""

from __future__ import annotations

import base64
import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
GALLERY = Path("/home/bam/.agents/skills/babble/scripts/gallery.py")
SPEC_PATH = ROOT / "docs" / "port-canvas-ux-babble-2026-09-01.json"
HTML_PATH = ROOT / "docs" / "port-canvas-ux-babble-2026-09-01.html"


CUSTOM_STYLE = r"""
<style id="port-canvas-babble-style">
  .reference-board {
    margin: 0 0 38px;
    padding: 18px;
    border: 1px solid var(--line);
    background: rgb(255 253 249 / 74%);
  }

  .reference-head {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 18px;
    margin-bottom: 14px;
  }

  .reference-head h2 {
    margin: 6px 0 0;
    font: 500 25px/1.15 var(--serif);
  }

  .reference-head p {
    max-width: 690px;
    margin: 0;
    color: var(--muted);
    font-size: 12px;
  }

  .reference-grid {
    display: grid;
    grid-template-columns: 1.25fr .72fr 1.18fr;
    gap: 12px;
  }

  .reference-card {
    display: grid;
    min-height: 198px;
    grid-template-rows: 1fr auto;
    overflow: hidden;
    border: 1px solid #dedfe3;
    border-radius: 13px;
    background: #f8f8f9;
  }

  .reference-card img {
    width: 100%;
    height: 170px;
    object-fit: contain;
    background: #f1f1f2;
  }

  .reference-card span {
    padding: 9px 11px;
    border-top: 1px solid #e5e5e7;
    color: #5d6269;
    background: #fff;
    font-size: 11px;
  }

  .variant-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .prototype-frame {
    background: #f5f6f8;
  }

  .port-prototype {
    position: relative;
    min-height: 365px;
    overflow: hidden;
    color: #262a31;
    background:
      radial-gradient(circle at 22% 20%, rgb(99 91 255 / 5%), transparent 180px),
      linear-gradient(#f7f8fa 1px, transparent 1px),
      linear-gradient(90deg, #f7f8fa 1px, transparent 1px),
      #eef0f3;
    background-size: auto, 18px 18px, 18px 18px, auto;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  }

  .port-prototype button {
    font: inherit;
  }

  .canvas-caption {
    position: absolute;
    top: 13px;
    left: 15px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 5px 8px;
    border: 1px solid #dfe1e5;
    border-radius: 7px;
    color: #777d86;
    background: rgb(255 255 255 / 82%);
    font-size: 9px;
    font-weight: 760;
    letter-spacing: .08em;
    text-transform: uppercase;
  }

  .canvas-caption::before {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--variant-accent, #635bff);
    content: "";
  }

  .decode-block {
    position: absolute;
    top: 61px;
    left: 50%;
    width: 326px;
    min-height: 240px;
    transform: translateX(-50%);
    border: 1px solid #d9dadd;
    border-radius: 10px;
    background: #fff;
    box-shadow: 0 2px 4px rgb(36 39 45 / 7%);
  }

  .decode-block.is-selected {
    box-shadow: 0 0 0 2px rgb(99 91 255 / 65%), 0 8px 24px rgb(36 39 45 / 11%);
  }

  .block-title {
    display: flex;
    height: 48px;
    align-items: center;
    padding: 0 14px;
    border-bottom: 1px solid #e8e9ec;
    font-size: 25px;
    font-weight: 560;
    letter-spacing: -.025em;
  }

  .block-body {
    position: relative;
    min-height: 146px;
    padding: 12px 0;
  }

  .port-row {
    position: relative;
    display: flex;
    min-height: 38px;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 16px;
    transition: transform 160ms ease, opacity 160ms ease, background 160ms ease;
  }

  .port-row::before,
  .port-row::after {
    position: absolute;
    top: 50%;
    width: 12px;
    height: 12px;
    transform: translateY(-50%);
    border: 1.5px solid #c08520;
    border-radius: 50%;
    background: #fff;
    content: "";
  }

  .port-row::before { left: -7px; }
  .port-row::after { right: -7px; }

  .port-row.input-only::after,
  .port-row.output-only::before { opacity: 0; }

  .port-label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: #31343a;
    font-size: 13px;
    font-weight: 560;
  }

  .port-label:last-child { margin-left: auto; }

  .type-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #9e9e9e;
  }

  .block-footer {
    position: relative;
    display: flex;
    height: 46px;
    align-items: center;
    justify-content: flex-end;
    padding: 0 10px;
    border-top: 1px solid #e8e9ec;
  }

  .footer-dots {
    display: grid;
    width: 26px;
    height: 26px;
    place-items: center;
    border: 0;
    border-radius: 6px;
    color: #777c84;
    background: transparent;
    cursor: pointer;
  }

  .footer-dots:hover { background: #f0f1f4; }

  .native-actions {
    position: absolute;
    z-index: 6;
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .native-actions button,
  .native-control {
    display: inline-grid;
    min-width: 28px;
    height: 28px;
    place-items: center;
    border: 1px solid #d7d9dd;
    border-radius: 7px;
    color: #50555e;
    background: #fff;
    box-shadow: 0 5px 14px rgb(40 44 52 / 11%);
    cursor: pointer;
  }

  .native-actions button:hover,
  .native-control:hover { border-color: #aaaeb6; background: #f7f7f9; }

  .native-actions button.danger { color: #b64843; }

  .native-status {
    position: absolute;
    right: 13px;
    bottom: 12px;
    display: none;
    padding: 6px 9px;
    border-radius: 7px;
    color: #fff;
    background: #343941;
    font-size: 10px;
    box-shadow: 0 7px 18px rgb(31 35 42 / 19%);
  }

  .prototype[data-story-state="add"] .status-add,
  .prototype[data-story-state="move"] .status-move,
  .prototype[data-story-state="delete"] .status-delete,
  .prototype[data-story-state="mode"] .status-mode,
  .prototype[data-story-state="menu"] .status-menu,
  .prototype[data-story-state="sheet"] .status-sheet,
  .prototype[data-story-state="edit"] .status-edit,
  .prototype[data-story-state="selected"] .status-selected,
  .prototype[data-story-state="palette"] .status-palette {
    display: block;
  }

  .port-new { display: none; }

  .prototype[data-story-state="add"] .port-new,
  .prototype[data-story-state="move"] .port-new,
  .prototype[data-story-state="delete"] .port-new { display: flex; }

  .prototype[data-story-state="add"] .port-new {
    background: rgb(69 141 102 / 10%);
    animation: new-port-in 220ms ease both;
  }

  .prototype[data-story-state="move"] .port-new { order: -1; }
  .prototype[data-story-state="move"] .port-moved { background: rgb(99 91 255 / 9%); }
  .prototype[data-story-state="delete"] .port-delete { display: none; }

  @keyframes new-port-in {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .command-tray {
    position: absolute;
    right: 12px;
    bottom: 12px;
    display: flex;
    gap: 5px;
  }

  .command-tray button {
    min-width: 43px;
    height: 28px;
    padding: 0 8px;
    border: 1px solid #d7d9dd;
    border-radius: 7px;
    color: #5e646d;
    background: rgb(255 255 255 / 92%);
    font-size: 9px;
    font-weight: 760;
    cursor: pointer;
  }

  .command-tray button:hover { border-color: var(--variant-accent); color: var(--variant-accent); }

  /* V1 · hover boundary */
  .v1-preview .row-grip {
    position: absolute;
    left: -30px;
    display: grid;
    width: 21px;
    height: 28px;
    place-items: center;
    border: 1px solid #d7d9dd;
    border-radius: 6px;
    color: #70757d;
    background: #fff;
    box-shadow: 0 4px 12px rgb(40 44 52 / 10%);
    cursor: grab;
  }

  .v1-preview .insert-edge {
    position: absolute;
    left: -10px;
    top: 41px;
    display: flex;
    width: 20px;
    height: 20px;
    align-items: center;
    justify-content: center;
    border: 1px solid #6257d5;
    border-radius: 50%;
    color: #fff;
    background: #6a5de0;
    cursor: pointer;
  }

  .v1-preview .row-menu {
    top: 90px;
    right: -18px;
  }

  /* V2 · beads */
  .bead-rail {
    position: absolute;
    top: 54px;
    bottom: 49px;
    left: -18px;
    width: 36px;
    border-left: 2px solid rgb(83 126 181 / 28%);
  }

  .bead {
    position: absolute;
    left: -10px;
    display: grid;
    width: 20px;
    height: 20px;
    place-items: center;
    border: 2px solid #4f76ad;
    border-radius: 50%;
    color: #4f76ad;
    background: #fff;
    font-size: 11px;
    cursor: grab;
  }

  .bead.ghost { border-style: dashed; opacity: .68; cursor: pointer; }
  .bead.b1 { top: 22px; }
  .bead.b2 { top: 66px; }
  .bead.b3 { top: 108px; }
  .bead.trash { top: 151px; border-color: #ba5550; color: #ba5550; }

  /* V3 · port tool */
  .port-tool {
    top: 15px;
    right: 16px;
  }

  .port-tool button {
    display: flex;
    width: auto;
    gap: 6px;
    padding: 0 9px;
    font-size: 10px;
    font-weight: 780;
  }

  .prototype:not([data-story-state="base"]) .v3-preview .decode-block {
    box-shadow: 0 0 0 2px rgb(90 125 81 / 70%), 0 9px 26px rgb(36 39 45 / 12%);
  }

  .v3-preview .mode-rail {
    top: 88px;
    right: 7px;
    flex-direction: column;
    opacity: 0;
    pointer-events: none;
  }

  .prototype:not([data-story-state="base"]) .v3-preview .mode-rail {
    opacity: 1;
    pointer-events: auto;
  }

  /* V4 · transient lens */
  .hold-target {
    top: 17px;
    right: 17px;
  }

  .hold-target button { width: auto; padding: 0 9px; font-size: 10px; font-weight: 760; }

  .port-lens {
    position: absolute;
    inset: 48px 0 46px;
    display: none;
    padding: 13px;
    background: rgb(246 241 255 / 98%);
  }

  .prototype:not([data-story-state="base"]) .v4-preview .port-lens { display: block; }
  .prototype:not([data-story-state="base"]) .v4-preview .block-body { opacity: 0; }

  .lens-row {
    display: grid;
    height: 35px;
    grid-template-columns: 25px 1fr 54px 25px;
    align-items: center;
    gap: 7px;
    padding: 0 7px;
    border-bottom: 1px solid #e1d9f0;
    font-size: 11px;
  }

  .lens-row button { border: 0; background: transparent; cursor: pointer; }

  /* V5 · context menu */
  .context-menu {
    position: absolute;
    z-index: 9;
    top: 117px;
    right: -82px;
    display: none;
    width: 178px;
    padding: 6px;
    border: 1px solid #d7d8dc;
    border-radius: 10px;
    background: #fff;
    box-shadow: 0 13px 35px rgb(30 34 41 / 18%);
  }

  .prototype:not([data-story-state="base"]) .v5-preview .context-menu { display: grid; }

  .context-menu button {
    display: flex;
    height: 30px;
    align-items: center;
    justify-content: space-between;
    padding: 0 8px;
    border: 0;
    border-radius: 6px;
    color: #484d55;
    background: transparent;
    font-size: 10px;
    cursor: pointer;
  }

  .context-menu button:hover { background: #f0effa; }
  .context-menu button.danger { color: #b64d47; }
  .context-menu-trigger { top: 115px; right: -16px; }

  /* V6 · anchored sheet */
  .port-sheet {
    position: absolute;
    z-index: 10;
    top: 37px;
    left: 50%;
    display: none;
    width: 356px;
    transform: translateX(-50%);
    overflow: hidden;
    border: 1px solid #ced0d6;
    border-radius: 12px;
    background: #fff;
    box-shadow: 0 20px 46px rgb(31 35 42 / 23%);
  }

  .prototype:not([data-story-state="base"]) .v6-preview .port-sheet { display: block; }

  .sheet-head {
    display: flex;
    height: 40px;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
    border-bottom: 1px solid #e6e7e9;
    font-size: 11px;
    font-weight: 800;
  }

  .sheet-row {
    display: grid;
    height: 36px;
    grid-template-columns: 25px 1fr 72px 27px;
    align-items: center;
    gap: 6px;
    padding: 0 9px;
    border-bottom: 1px solid #eff0f2;
    font-size: 10px;
  }

  .sheet-row button { border: 0; background: transparent; cursor: pointer; }
  .sheet-add { display: flex; gap: 6px; padding: 9px; }
  .sheet-add button { flex: 1; height: 30px; border: 1px dashed #c9cbd0; border-radius: 6px; background: #fafafa; font-size: 10px; cursor: pointer; }

  /* V7 · keyboard editor */
  .key-editor {
    position: absolute;
    z-index: 8;
    inset: 49px 0 46px;
    display: none;
    padding: 12px 14px;
    background: #1f2228;
    color: #e8ebef;
    font: 11px/1.65 ui-monospace, SFMono-Regular, Menlo, monospace;
  }

  .prototype:not([data-story-state="base"]) .v7-preview .key-editor { display: block; }
  .prototype:not([data-story-state="base"]) .v7-preview .block-body { visibility: hidden; }

  .key-line { display: grid; grid-template-columns: 20px 1fr 74px; gap: 8px; }
  .key-line.on { margin: 0 -5px; padding: 0 5px; border-radius: 4px; background: #353b46; }
  .key-line em { color: #9ca6b6; font-style: normal; }
  .key-hints { position: absolute; right: 10px; bottom: 8px; display: flex; gap: 5px; }
  .key-hints button { height: 24px; border: 1px solid #4c5360; border-radius: 5px; color: #dfe3e9; background: #2b3038; font-size: 9px; cursor: pointer; }
  .key-trigger { top: 115px; right: -18px; }

  /* V8 · selection halo */
  .port-halo {
    top: 104px;
    right: -79px;
    display: none;
    flex-direction: column;
  }

  .prototype:not([data-story-state="base"]) .v8-preview .port-halo { display: flex; }
  .v8-preview .port-pick { top: 112px; right: -15px; }
  .prototype:not([data-story-state="base"]) .v8-preview .port-delete { background: rgb(90 126 190 / 10%); }

  /* V9 · typed token palette */
  .token-palette {
    position: absolute;
    top: 74px;
    left: 9px;
    display: none;
    width: 98px;
    padding: 8px;
    border: 1px solid #d7d9dd;
    border-radius: 10px;
    background: #fff;
    box-shadow: 0 12px 28px rgb(32 36 43 / 16%);
  }

  .prototype:not([data-story-state="base"]) .v9-preview .token-palette { display: grid; gap: 6px; }

  .token-palette button {
    display: flex;
    height: 28px;
    align-items: center;
    gap: 7px;
    padding: 0 7px;
    border: 1px solid #e0e2e5;
    border-radius: 6px;
    background: #fafafa;
    font-size: 9px;
    cursor: grab;
  }

  .drop-edge {
    position: absolute;
    top: 70px;
    bottom: 53px;
    left: -10px;
    display: none;
    width: 20px;
    border: 2px dashed #4f8b7e;
    border-radius: 10px;
    background: rgb(79 139 126 / 8%);
  }

  .prototype:not([data-story-state="base"]) .v9-preview .drop-edge { display: block; }
  .palette-trigger { top: 15px; right: 16px; }
  .palette-trigger button { width: auto; padding: 0 9px; font-size: 10px; }

  /* V10 · persistent footer strip */
  .footer-command-strip {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-right: auto;
  }

  .footer-command-strip button {
    height: 27px;
    padding: 0 8px;
    border: 1px solid #d7d9dd;
    border-radius: 6px;
    color: #555b64;
    background: #fff;
    font-size: 9px;
    font-weight: 730;
    cursor: pointer;
  }

  .footer-command-strip button:first-child { color: #5a4dce; background: #f2efff; }
  .footer-command-strip button:last-child { color: #b64e48; }

  .port-media {
    display: grid;
    min-height: 148px;
    place-items: center;
    padding: 14px;
    background: #f2f3f5;
  }

  .port-media-flow {
    display: flex;
    align-items: center;
    gap: 9px;
    color: #60656d;
    font-size: 10px;
  }

  .port-media-flow span {
    display: grid;
    min-width: 82px;
    gap: 3px;
    padding: 10px;
    border: 1px solid #d8dade;
    border-radius: 8px;
    background: #fff;
    text-align: center;
  }

  .port-media-flow b { color: #333840; font-size: 11px; }
  .port-media-flow i { color: var(--variant-accent, #635bff); font-style: normal; font-weight: 900; }

  @media (max-width: 980px) {
    .variant-grid,
    .reference-grid { grid-template-columns: 1fr; }
    .reference-head { align-items: start; flex-direction: column; }
    .reference-card img { height: 220px; }
  }

  @media (max-width: 620px) {
    .decode-block { width: min(326px, calc(100% - 48px)); }
    .command-tray { display: none; }
  }
</style>
"""


def image_data(path: Path) -> str:
    mime = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


def score(value: int, evidence: str, confidence: str = "high") -> dict[str, object]:
    return {"score": value, "evidence": evidence, "confidence": confidence}


def gates(wire: str, delete: str, views: str, history: str, *, wire_pass: bool = True) -> dict[str, object]:
    return {
        "g1": {"pass": wire_pass, "evidence": wire},
        "g2": {"pass": True, "evidence": delete},
        "g3": {"pass": True, "evidence": views},
        "g4": {"pass": True, "evidence": history},
    }


def status(text: str, kind: str) -> str:
    return f'<div class="native-status status-{kind}">{text}</div>'


def standard_rows() -> str:
    return """
      <div class="block-body">
        <div class="port-row input-only port-moved"><span class="port-label"><i class="type-dot"></i>in_1</span></div>
        <div class="port-row input-only port-new"><span class="port-label"><i class="type-dot"></i>in_2</span></div>
        <div class="port-row output-only port-delete"><span class="port-label">out_1<i class="type-dot"></i></span></div>
      </div>
    """


def base_block(body_extra: str = "", footer: str = '<button class="footer-dots" aria-label="More">⋮</button>', *, selected: bool = False) -> str:
    selected_class = " is-selected" if selected else ""
    return f"""
      <div class="decode-block{selected_class}">
        <div class="block-title">decode</div>
        {standard_rows()}
        {body_extra}
        <div class="block-footer">{footer}</div>
      </div>
    """


def preview(name: str, inner: str, actions: str, statuses: str) -> str:
    return f"""
      <div class="port-prototype {name}">
        <div class="canvas-caption">Port view · decode</div>
        {inner}
        {actions}
        {statuses}
      </div>
    """


def story(title: str, steps: list[tuple[str, str, str, str]]) -> dict[str, object]:
    return {
        "title": title,
        "steps": [
            {"label": label, "caption": caption, "state": state_name, "target": target}
            for label, caption, state_name, target in steps
        ],
    }


def media(label: str, caption: str, left: str, middle: str, right: str) -> list[dict[str, str]]:
    return [{
        "label": label,
        "caption": caption,
        "html": (
            '<div class="port-media"><div class="port-media-flow">'
            f'<span><b>{left}</b><small>starting state</small></span><i>→</i>'
            f'<span><b>{middle}</b><small>decisive model</small></span><i>→</i>'
            f'<span><b>{right}</b><small>commit + undo</small></span>'
            '</div></div>'
        ),
    }]


V1_BLOCK = base_block(
    '<button class="row-grip" data-story-to="move" aria-label="Hold and move in_1" style="top:64px">⠿</button>'
    '<button class="insert-edge" data-story-to="add" aria-label="Add input below in_1">+</button>'
    '<div class="native-actions row-menu"><button data-story-to="delete" class="danger" aria-label="Open row commands and delete out_1">⋮</button></div>'
)

V2_BLOCK = base_block(
    '<div class="bead-rail">'
    '<button class="bead b1" data-story-to="move" aria-label="Drag first bead to reorder">●</button>'
    '<button class="bead ghost b2" data-story-to="add" aria-label="Add port at ghost bead">+</button>'
    '<button class="bead b3" data-story-to="move" aria-label="Drag output bead">●</button>'
    '<button class="bead trash" data-story-to="delete" aria-label="Alt click bead to delete">×</button>'
    '</div>'
)

V3_BLOCK = base_block(
    '<div class="native-actions mode-rail">'
    '<button data-story-to="add" aria-label="Add port in Port mode">＋</button>'
    '<button data-story-to="move" aria-label="Move port in Port mode">↕</button>'
    '<button data-story-to="delete" class="danger" aria-label="Delete port in Port mode">⌫</button>'
    '</div>',
    selected=True,
)

V4_LENS = """
  <div class="port-lens">
    <div class="lens-row"><button data-story-to="move">⠿</button><b>in_1</b><span>input</span><button data-story-to="delete">×</button></div>
    <div class="lens-row"><button data-story-to="move">⠿</button><b>out_1</b><span>output</span><button data-story-to="delete">×</button></div>
    <div class="lens-row"><button data-story-to="add">＋</button><span>Add at this boundary</span><span></span><span></span></div>
  </div>
"""
V4_BLOCK = base_block(V4_LENS)

V5_MENU = """
  <div class="context-menu">
    <button data-story-to="add"><span>Add port above</span><kbd>A</kbd></button>
    <button data-story-to="add"><span>Add port below</span><kbd>B</kbd></button>
    <button data-story-to="move"><span>Move up</span><kbd>⌥↑</kbd></button>
    <button data-story-to="move"><span>Move down</span><kbd>⌥↓</kbd></button>
    <button data-story-to="delete" class="danger"><span>Delete port</span><kbd>⌫</kbd></button>
  </div>
"""
V5_BLOCK = base_block(V5_MENU + '<button class="native-control context-menu-trigger" data-story-to="menu" aria-label="Open port context menu">⋮</button>')

V6_SHEET = """
  <div class="port-sheet">
    <div class="sheet-head"><span>decode · Ports</span><button data-story-to="base">×</button></div>
    <div class="sheet-row"><button data-story-to="move">⠿</button><b>in_1</b><span>Input</span><button data-story-to="delete">⌫</button></div>
    <div class="sheet-row"><button data-story-to="move">⠿</button><b>out_1</b><span>Output</span><button data-story-to="delete">⌫</button></div>
    <div class="sheet-add"><button data-story-to="add">＋ Input</button><button data-story-to="add">＋ Output</button></div>
  </div>
"""
V6_BLOCK = base_block(V6_SHEET, '<button class="footer-dots" data-story-to="sheet" aria-label="Open Ports sheet">Ports ▤</button>')

V7_EDITOR = """
  <div class="key-editor">
    <div class="key-line on"><em>1</em><b>in_1</b><span>: input</span></div>
    <div class="key-line"><em>2</em><b>out_1</b><span>: output</span></div>
    <div class="key-line port-new"><em>3</em><b>in_2</b><span>: input</span></div>
    <div class="key-hints">
      <button data-story-to="add">Enter add</button>
      <button data-story-to="move">Alt+↑ move</button>
      <button data-story-to="delete">⌫ delete</button>
    </div>
  </div>
"""
V7_BLOCK = base_block(V7_EDITOR + '<button class="native-control key-trigger" data-story-to="edit" aria-label="Edit ports as a keyboard list">↵</button>')

V8_BLOCK = base_block(
    '<button class="native-control port-pick" data-story-to="selected" aria-label="Select out_1 port">●</button>'
    '<div class="native-actions port-halo">'
    '<button data-story-to="add" aria-label="Add above selected port">＋↑</button>'
    '<button data-story-to="add" aria-label="Add below selected port">＋↓</button>'
    '<button data-story-to="move" aria-label="Move selected port">↕</button>'
    '<button data-story-to="delete" class="danger" aria-label="Delete selected port">⌫</button>'
    '</div>'
)

V9_PALETTE = """
  <div class="token-palette">
    <button data-story-to="add"><i class="type-dot"></i>Input</button>
    <button data-story-to="add"><i class="type-dot" style="background:#c060e0"></i>Image</button>
    <button data-story-to="add"><i class="type-dot" style="background:#4caf50"></i>Text</button>
    <button data-story-to="delete">🗑 Trash</button>
  </div>
  <div class="drop-edge"></div>
"""
V9_BLOCK = base_block(V9_PALETTE)

V10_FOOTER = """
  <div class="footer-command-strip">
    <button data-story-to="add">＋ Input</button>
    <button data-story-to="add">＋ Output</button>
    <button data-story-to="move">↕ Reorder</button>
    <button data-story-to="delete">⌫</button>
  </div>
  <button class="footer-dots" aria-label="More">⋮</button>
"""
V10_BLOCK = base_block(footer=V10_FOOTER)


REQUIREMENTS = [
    {
        "id": "fr1",
        "name": "Repeated-edit throughput",
        "weight": 30,
        "why": "Zach's stated outcome is a very fast on-canvas loop for creating, arranging, and removing several ports—not merely one successful edit.",
        "passCondition": "After the mechanism is known, add, reorder, and delete each take one short action and several edits can be chained without leaving the Block.",
        "anchors": {
            "1": "Each edit requires leaving the canvas or reopening a deep surface.",
            "3": "Each operation is available, but repeated edits accumulate menu, targeting, or mode overhead.",
            "5": "All three operations chain as direct one-action edits at the Block.",
        },
    },
    {
        "id": "fr2",
        "name": "Zero gesture ambiguity",
        "weight": 24,
        "why": "A port already owns the cable-drag gesture, while the Block owns selection and text editing. Inline editing must not make those common actions feel unreliable.",
        "passCondition": "The user can predict whether a pointer action selects, wires, edits text, reorders, or deletes before committing it.",
        "anchors": {
            "1": "Common wiring or selection gestures can accidentally mutate the port list.",
            "3": "Conflicts are reduced with timing, modifiers, or target precision but remain learnable hazards.",
            "5": "Port-list mutation has an unmistakable target or bounded mode and ordinary canvas gestures stay intact.",
        },
    },
    {
        "id": "fr3",
        "name": "First-use discoverability",
        "weight": 18,
        "why": "The Block should teach the interaction through familiar visible affordances rather than rely on remembered shortcuts or documentation.",
        "passCondition": "A new user hovering or selecting the Block can identify how to add a port and infer where reorder/delete live.",
        "anchors": {
            "1": "The interaction is invisible unless the user already knows a shortcut or gesture.",
            "3": "One entry point is visible, but the full operation set is hidden behind convention or exploration.",
            "5": "Visible labels, handles, or familiar row controls make all three operations self-explanatory.",
        },
    },
    {
        "id": "fr4",
        "name": "Canvas continuity",
        "weight": 15,
        "why": "The point of this feature is to stay in the window and preserve spatial focus on the Block rather than detour into the inspector.",
        "passCondition": "The Block, target side, and neighboring ports remain visible while editing, with little temporary occlusion or chrome.",
        "anchors": {
            "1": "Editing replaces the canvas context or moves the task to a distant surface.",
            "3": "The interaction stays anchored but meaningfully covers the Block or surrounding sketch.",
            "5": "Edits happen directly at the port boundary with the full local sketch context intact.",
        },
    },
    {
        "id": "fr5",
        "name": "Precision, access, and scale",
        "weight": 13,
        "why": "Expanded Blocks may hold dense port lists, and the same capability should remain usable with keyboard, touch/pen, zoom, and reduced dexterity.",
        "passCondition": "Targets remain precise at dense scales and every operation has an explicit keyboard- or command-invocable path.",
        "anchors": {
            "1": "Tiny targets, timing, or unsupported input devices make the operation unreliable.",
            "3": "The common mouse case works, but density or alternate input needs a fallback surface.",
            "5": "Large targets, keyboard parity, and list behavior remain robust across dense Port and Expanded views.",
        },
    },
]


HARD_GATES = [
    {
        "id": "g1",
        "name": "Cable drag remains unambiguous",
        "why": "Dragging a port is already how semantic cables start; a winning edit model cannot silently steal that gesture.",
    },
    {
        "id": "g2",
        "name": "Connected delete is explicit and undoable",
        "why": "Removing a connected port changes topology; the affected cable count must be visible and the mutation must be recoverable in one undo.",
    },
    {
        "id": "g3",
        "name": "Port and Expanded parity",
        "why": "The same mental model must work on the compact Port face and the spatially stretched Expanded frame.",
    },
    {
        "id": "g4",
        "name": "Stable identity and one history step",
        "why": "Reorder must preserve durable port IDs and each add/move/delete commit must map cleanly onto tldraw undo/redo.",
    },
]


VARIANTS = [
    {
        "id": "v1",
        "name": "Boundary Rows",
        "thesis": "Use Zach's table-inspired hybrid: hover gaps to insert, press-hold a row grip to reorder, and right-click for explicit row commands.",
        "accent": "#6757d6",
        "bestWhen": "The priority is maximum pointer speed with familiar table grammar and the existing right-click command layer as a safety net.",
        "losesWhen": "Hold timing and small boundary targets make pen, touch, or dense Expanded layouts feel unreliable.",
        "decisions": [
            {"label": "Primary object", "value": "A port behaves like a table row whose boundary exposes insertion and whose gutter exposes ordering."},
            {"label": "Reorder", "value": "Press-hold on the row gutter crosses a drag threshold; a normal click still selects."},
            {"label": "Delete", "value": "The row menu names affected cables and exposes Delete plus Undo."},
        ],
        "keepParts": ["hover gap plus", "press-hold row grip", "add above/below commands", "connected-delete disclosure"],
        "proof": ["The live hero adds in_2 at a gap, moves it above in_1, and removes out_1 through its row affordance.", "The reference strip shows the exact Block, Obsidian table insertion, and row-menu sources Zach supplied."],
        "scores": {"fr1": score(5, "Gap add, held row grip, and row menu all remain at the Block and can chain without opening the inspector."), "fr2": score(3, "A distinct gutter helps, but reorder still depends on a hold threshold that can be confused with selection or a slow cable drag.", "medium"), "fr3": score(5, "The visible plus, six-dot grip, and familiar row menu expose the complete operation set."), "fr4": score(5, "Every action stays on the boundary and the Block remains visible."), "fr5": score(3, "The menu provides keyboard fallback, but hover gaps and hold timing remain precision-sensitive.", "medium")},
        "gateResults": gates("The reorder grip is outside the port dot, so the cable terminal keeps its direct drag gesture.", "The row menu can show ‘Delete out_1 · 1 cable’ and produce a single Undo toast.", "The row/gap grammar projects onto both compact and stretched edges.", "Moving rows changes list order while the stable port id remains unchanged."),
        "previewLabel": "interactive table-inspired hybrid",
        "story": story("Try gap add, held reorder, and row delete", [
            ("See the quiet Block", "The existing Port face stays unchanged until the pointer reaches a row boundary.", "base", ".insert-edge"),
            ("Insert at the boundary", "A table-like plus adds in_2 exactly between neighboring rows.", "add", ".insert-edge"),
            ("Hold and move", "The separate gutter grip moves in_2 above in_1 without touching the cable terminal.", "move", ".row-grip"),
            ("Delete from the row", "The row command removes out_1 and would disclose its connected cable before commit.", "delete", ".row-menu button"),
        ]),
        "media": media("Row grammar", "The interaction separates three verbs across gap, gutter, and menu so no one target must infer everything.", "hover gap", "hold row grip", "menu delete"),
        "preview": preview("v1-preview", V1_BLOCK, "", status("in_2 inserted", "add") + status("in_2 moved above in_1", "move") + status("out_1 deleted · Undo", "delete")),
    },
    {
        "id": "v2",
        "name": "Perimeter Beads",
        "thesis": "Treat ports like elbow control points: selected Blocks reveal occupied beads and hollow gap beads directly on the perimeter.",
        "accent": "#4f76ad",
        "bestWhen": "The geometric edge itself should be the entire mental model and pointer users value minimal chrome.",
        "losesWhen": "The same bead must mean both wire terminal and reorder handle, or the edge becomes too dense to target reliably.",
        "decisions": [
            {"label": "Primary object", "value": "The Block perimeter is a control-point rail, not a list of rows."},
            {"label": "Add and move", "value": "Click a hollow bead to add; drag an occupied bead to a new slot."},
            {"label": "Delete", "value": "Alt-click or drag a bead to a perimeter trash notch."},
        ],
        "keepParts": ["ghost gap beads", "perimeter preview rail", "slot snapping", "edge-near reveal rule"],
        "proof": ["The live hero exposes a hollow insertion bead and occupied reorder beads on the same spatial edge.", "The delete notch makes removal visible, but the prototype also exposes the unresolved conflict with cable dragging."],
        "scores": {"fr1": score(5, "All mutations are one direct pointer gesture on the edge."), "fr2": score(2, "Dragging an occupied port bead is also the established cable-start gesture, so the prototype cannot predict intent without a modifier or mode.", "high"), "fr3": score(4, "Hollow and occupied points are legible once the Block is selected, though delete still needs a legend."), "fr4": score(5, "The control rail adds almost no occlusion and preserves the whole Block."), "fr5": score(2, "Small perimeter points and modifier deletion degrade at dense scales and on touch.", "high")},
        "gateResults": gates("FAIL: the occupied bead still carries both cable-start and reorder semantics; the prototype has not proven a non-ambiguous threshold.", "The trash notch can show the connected-cable count and one-step Undo.", "A stretched edge can render the same bead rail in Expanded view.", "Slot snapping reorders ids without recreating the port records.", wire_pass=False),
        "previewLabel": "interactive control-point perimeter",
        "story": story("Manipulate the Block edge as geometry", [
            ("Reveal the edge rail", "Occupied beads align with ports; hollow beads mark valid insertion slots.", "base", ".bead.ghost"),
            ("Click a hollow bead", "A new input appears at the chosen edge position.", "add", ".bead.ghost"),
            ("Drag along the rail", "The bead snaps to the slot above in_1, making order spatial.", "move", ".bead.b1"),
            ("Use the trash notch", "Removal is on the same edge, but this model still conflicts with cable dragging.", "delete", ".bead.trash"),
        ]),
        "media": media("Perimeter grammar", "The strongest geometric direction is also the only hard-gate failure because the existing terminal drag already owns the decisive gesture.", "hollow bead", "occupied bead", "trash notch"),
        "preview": preview("v2-preview", V2_BLOCK, "", status("in_2 snapped into gap", "add") + status("bead moved to slot 1", "move") + status("out_1 removed · Undo", "delete")),
    },
    {
        "id": "v3",
        "name": "Port Tool",
        "thesis": "Give port editing one explicit, persistent canvas mode: press P or choose Ports, then click gaps, drag rows, and delete without colliding with wiring.",
        "accent": "#5a7d51",
        "bestWhen": "Several port edits happen in a burst and preserving predictable canvas gestures matters more than avoiding a mode.",
        "losesWhen": "Most sessions make only one tiny edit and entering or exiting a dedicated tool feels like ceremony.",
        "decisions": [
            {"label": "Primary object", "value": "Port editing is a first-class tldraw tool state, parallel to drawing or text tools."},
            {"label": "Mode boundary", "value": "P or a labeled Ports pill enters; Escape or selecting another tool exits."},
            {"label": "Within mode", "value": "Gap pluses, row grips, and trash are all explicit; cable creation is disabled until exit."},
        ],
        "keepParts": ["P shortcut", "green mode outline", "tool-owned gap/grip/trash", "Escape exit"],
        "proof": ["The hero visibly changes the selected Block boundary when Port mode becomes active and exposes a dedicated edit rail.", "Add, move, and delete map onto separate mode-owned controls while the cable tool remains outside the mode."],
        "scores": {"fr1": score(5, "One mode entry amortizes across an arbitrary burst of single-action adds, moves, and deletes."), "fr2": score(5, "Port-list mutation is impossible outside the labeled tool and cable dragging is unavailable inside it."), "fr3": score(4, "The labeled Ports pill and mode outline are clear, though the P shortcut is learned rather than self-evident."), "fr4": score(4, "The Block and canvas remain visible; only a narrow rail and mode outline are added."), "fr5": score(5, "The tool can own large hit targets, keyboard traversal, pen behavior, and dense-list scrolling consistently.")},
        "gateResults": gates("Port mode disables cable-start behavior; exiting restores the normal semantic terminal drag.", "Deleting a connected port opens an in-mode impact chip and commits through one Undo point.", "The same tool projects controls onto Port rows or Expanded edge positions.", "The tool dispatches moveBlockPort against durable ids and brackets each gesture as one history unit."),
        "previewLabel": "interactive explicit Port mode",
        "story": story("Enter one bounded mode for a burst of edits", [
            ("Normal canvas", "Ports keep their ordinary selection and cable behavior outside editing mode.", "base", ".port-tool button"),
            ("Enter and add", "The green Block outline and edit rail make the tool boundary unmistakable while in_2 is inserted.", "add", ".mode-rail button:nth-child(1)"),
            ("Reorder in mode", "The rail moves in_2 above in_1 while stable ids and cables remain attached.", "move", ".mode-rail button:nth-child(2)"),
            ("Delete with impact", "The trash action removes out_1 in one undoable edit, then Escape returns to wiring.", "delete", ".mode-rail button:nth-child(3)"),
        ]),
        "media": media("Mode boundary", "A short burst has a clear lifecycle: enter once, perform several edits, then return to normal cable semantics.", "P / Ports", "burst edit", "Escape"),
        "preview": preview("v3-preview", V3_BLOCK, '<div class="native-actions port-tool"><button data-story-to="add" aria-label="Enter Port tool and add">P · Ports</button></div>', status("Port mode · click gaps to add", "add") + status("in_2 moved · ids preserved", "move") + status("out_1 + 1 cable removed · Undo", "delete")),
    },
    {
        "id": "v4",
        "name": "Hold Lens",
        "thesis": "Press-hold any port row to temporarily transform the Block into a large-target port-only lens; release to return to the sketch.",
        "accent": "#8563b2",
        "bestWhen": "A transient focus state should make dense ports easy to manipulate without leaving a lasting canvas mode.",
        "losesWhen": "Hold duration is hard to discover or repeated edits outlast the comfortable pointer hold." ,
        "decisions": [
            {"label": "Primary object", "value": "The Block temporarily becomes a focused list while its title and footprint remain anchored."},
            {"label": "Entry/exit", "value": "Hold crosses a visible dwell ring; pointer release or Escape restores the normal face."},
            {"label": "Targets", "value": "Rows expand to large grips, labels, types, insertion boundaries, and delete buttons."},
        ],
        "keepParts": ["temporary port-only lens", "large row targets", "release-to-exit", "internals fade during reorder"],
        "proof": ["The live hero swaps the body to a focused list without moving the Block or opening external chrome.", "The lens exposes direct add/move/delete targets and then collapses back to the same face."],
        "scores": {"fr1": score(4, "Actions are fast inside the lens, but entry must be repeated if the hold is released between edits."), "fr2": score(4, "A dwell ring and transformed face establish intent, though hold timing remains a threshold interaction.", "medium"), "fr3": score(3, "The row reacts once held, but a new user may not know that a hold exists."), "fr4": score(5, "The lens occupies only the Block's own footprint and intentionally hides irrelevant internals during editing."), "fr5": score(4, "Large targets help touch and density, while keyboard users need an explicit command to lock the transient lens.")},
        "gateResults": gates("The dwell completes on the row label/gutter, never the cable dot, and the transformed lens suspends wiring.", "The lens has an explicit trash cell with cable impact and one-step Undo.", "Expanded view can transform only its boundary layer while fading interior content.", "List operations keep ids and the hold lifecycle brackets each commit cleanly."),
        "previewLabel": "interactive transient focus lens",
        "story": story("Hold to reveal a temporary port-only face", [
            ("Normal Block face", "The canvas stays calm before a deliberate row hold.", "base", ".hold-target button"),
            ("Hold and add", "The body transforms into large port rows; the insertion boundary creates in_2.", "add", ".lens-row:nth-child(3) button"),
            ("Move with a large grip", "The temporary list uses comfortable targets and fades irrelevant Block content.", "move", ".lens-row:nth-child(1) button"),
            ("Delete, then release", "A visible trash cell removes out_1; releasing restores the ordinary Block face.", "delete", ".lens-row:nth-child(2) button:last-child"),
        ]),
        "media": media("Transient lifecycle", "The interaction borrows a camera-like press-and-hold lens: local focus appears only for the duration of the edit.", "press + dwell", "port-only face", "release"),
        "preview": preview("v4-preview", V4_BLOCK, '<div class="native-actions hold-target"><button data-story-to="add" aria-label="Hold row to open Port lens">Hold row · 350 ms</button></div>', status("Port lens held", "add") + status("in_2 moved", "move") + status("out_1 deleted · release to exit", "delete")),
    },
    {
        "id": "v5",
        "name": "Row Commands",
        "thesis": "Keep the canvas visually unchanged and put the complete add-above/below, move, duplicate, and delete vocabulary in the port context menu.",
        "accent": "#b26943",
        "bestWhen": "A reliable accessible command path matters more than peak repeated-edit speed or persistent visual affordances.",
        "losesWhen": "Many ports are being rearranged and reopening a menu per action becomes tedious.",
        "decisions": [
            {"label": "Primary object", "value": "Each port is a command target; the menu is the canonical invocation surface."},
            {"label": "Ordering", "value": "Move up/down commands avoid drag precision and gain keyboard shortcuts."},
            {"label": "Delete", "value": "The menu can state the exact cable impact before the destructive item is chosen."},
        ],
        "keepParts": ["add above/below", "move up/down shortcuts", "duplicate port", "explicit cable impact"],
        "proof": ["The hero opens a row-anchored command menu beside out_1 and drives add, move, and delete states from real menu items.", "No controls occupy the Block until the row command is invoked."],
        "scores": {"fr1": score(3, "Every operation exists, but repeated changes reopen and traverse the menu."), "fr2": score(5, "Commands are explicit, target-bound, and separate from cable or selection gestures."), "fr3": score(3, "Right-click is familiar, but the operation set remains invisible until invoked."), "fr4": score(5, "The normal canvas has zero added chrome; the temporary menu is row-anchored."), "fr5": score(4, "Keyboard shortcuts and menu targets scale well, though touch needs a long-press or visible overflow trigger.")},
        "gateResults": gates("The context trigger is a secondary click or overflow button; direct port drag always starts a cable.", "The delete item can read ‘Delete port and 1 cable’ and map to one undoable command.", "Commands operate on a selected semantic port independent of its rendered y position.", "All entries call the existing id-based command layer with explicit history labels."),
        "previewLabel": "interactive port context menu",
        "story": story("Operate one port through explicit commands", [
            ("Target out_1", "The face remains stock until the port's secondary command is invoked.", "base", ".context-menu-trigger"),
            ("Open row commands", "The menu exposes add above/below, move, and destructive actions together.", "menu", ".context-menu button:nth-child(2)"),
            ("Add below", "A menu command inserts in_2 with no drag targeting.", "add", ".context-menu button:nth-child(2)"),
            ("Move with a shortcut", "Move up/down gives keyboard and low-precision parity.", "move", ".context-menu button:nth-child(3)"),
            ("Delete explicitly", "The destructive item can name affected cables before commit.", "delete", ".context-menu button.danger"),
        ]),
        "media": media("Command vocabulary", "This is the clean baseline: slower but semantically explicit, fully keyboard invocable, and safe to retain beside any faster gesture.", "right-click", "named command", "undo"),
        "preview": preview("v5-preview", V5_BLOCK, "", status("Port commands open", "menu") + status("in_2 added below", "add") + status("in_2 moved up", "move") + status("out_1 + 1 cable deleted · Undo", "delete")),
    },
    {
        "id": "v6",
        "name": "Port Sheet",
        "thesis": "Open a compact spreadsheet-like editor anchored over the Block, with large rows, drag grips, types, and add/delete controls in one stable surface.",
        "accent": "#437c8b",
        "bestWhen": "The list is dense or typed, several properties must be edited together, and one local overlay is acceptable.",
        "losesWhen": "Preserving a completely unobscured view of the Block and nearby cables is more important than list control." ,
        "decisions": [
            {"label": "Primary object", "value": "A compact two-kind table treats Inputs and Outputs as editable records."},
            {"label": "Surface", "value": "The footer's Ports button opens an anchored sheet rather than the distant inspector."},
            {"label": "Scale", "value": "The sheet can scroll, expose types/defaults, and support keyboard row navigation."},
        ],
        "keepParts": ["anchored local sheet", "large typed rows", "scrollable dense list", "two-column input/output add"],
        "proof": ["The hero opens a real anchored sheet inside the canvas and keeps the decode title visibly behind it.", "Add, move, and delete all remain available without reopening the surface."],
        "scores": {"fr1": score(4, "One sheet opening amortizes across rapid row operations, though it adds an entry click."), "fr2": score(5, "Every mutation has a labeled table control and the canvas cable gesture is untouched."), "fr3": score(5, "The labeled Ports footer and conventional table controls expose the full interaction."), "fr4": score(3, "The sheet is local but covers most of the Block body and some nearby canvas.", "high"), "fr5": score(5, "Large scrollable rows, keyboard focus, and type fields are the most robust dense-list surface.")},
        "gateResults": gates("All sheet interactions occur off the port terminal, leaving direct cable drag unchanged.", "The trash cell can disclose connection impact and retain an Undo action in the sheet footer.", "The sheet edits semantic records and therefore behaves identically for Port and Expanded rendering.", "Rows bind to stable ids, and each manipulation is one named command/history unit."),
        "previewLabel": "interactive anchored spreadsheet",
        "story": story("Open one local sheet for a dense edit burst", [
            ("Block remains primary", "A labeled Ports control sits in the existing footer.", "base", ".footer-dots"),
            ("Open the local sheet", "The anchored table exposes the whole list without sending focus to the inspector.", "sheet", ".sheet-add button:first-child"),
            ("Add a typed row", "Input and Output additions are labeled and ready for immediate naming/type editing.", "add", ".sheet-add button:first-child"),
            ("Reorder precisely", "A large row grip supports pointer and keyboard movement in a dense list.", "move", ".sheet-row:nth-child(2) button:first-child"),
            ("Delete with context", "The row stays visible while its connected-cable impact is confirmed and undone.", "delete", ".sheet-row:nth-child(3) button:last-child"),
        ]),
        "media": media("Local table lifecycle", "The sheet pays one disclosure click to gain durable large targets and a scalable editing surface.", "Ports footer", "anchored sheet", "close"),
        "preview": preview("v6-preview", V6_BLOCK, "", status("Ports sheet open", "sheet") + status("in_2 added as Input", "add") + status("in_2 moved to row 1", "move") + status("out_1 deleted · Undo", "delete")),
    },
    {
        "id": "v7",
        "name": "Keyboard List",
        "thesis": "Let the Block's port region enter a text-like list editor: Enter adds, Alt+Arrow reorders, and Backspace deletes the focused port.",
        "accent": "#657184",
        "bestWhen": "Expert keyboard throughput, port naming, and accessible deterministic focus matter more than first-use pointer discoverability.",
        "losesWhen": "The user expects purely spatial manipulation or rarely uses shortcuts." ,
        "decisions": [
            {"label": "Primary object", "value": "Ports are editable lines with a caret, selection, and familiar text-list commands."},
            {"label": "Entry", "value": "Double-click a label or press Enter on a selected port; Escape returns to canvas selection."},
            {"label": "Mutation", "value": "Enter, Alt+Arrow, and Backspace map to add, move, and delete while inline naming remains available."},
        ],
        "keepParts": ["deterministic keyboard focus", "Enter-to-add", "Alt+Arrow reorder", "inline rename and type"],
        "proof": ["The hero swaps the body into a compact line editor and exposes active focus plus actual shortcut controls.", "The same ordered list state drives the add, move, and delete examples."],
        "scores": {"fr1": score(5, "After entry, an expert can add/name/reorder/delete without leaving the keyboard."), "fr2": score(5, "A focused editor state owns keyboard mutation while pointer terminal dragging remains unchanged."), "fr3": score(2, "The entry and shortcut vocabulary are poorly discoverable without a hint or command menu.", "high"), "fr4": score(4, "The editor replaces only the Block body and preserves its title, footprint, and canvas context."), "fr5": score(5, "Deterministic focus, large line rows, screen-reader labels, and no pointer precision make this exceptionally robust.")},
        "gateResults": gates("The editor begins only from label focus/Enter; pointer dragging the terminal remains a cable action.", "Backspace on a connected row opens an inline impact confirmation and one Undo unit.", "Both visual views project the same ordered list into this editor state.", "Caret rows are keyed by id and Alt+Arrow mutates order without recreation."),
        "previewLabel": "interactive text-like port editor",
        "story": story("Edit the port list without leaving the keyboard", [
            ("Focus a port label", "The normal Block remains unchanged until Enter or a label double-click.", "base", ".key-trigger"),
            ("Enter list editing", "A caret and stable row focus expose the keyboard-owned state.", "edit", ".key-hints button:first-child"),
            ("Press Enter", "A new line creates in_2 and is ready for immediate naming.", "add", ".key-hints button:first-child"),
            ("Press Alt+Up", "The focused line moves without pointer targeting or identity loss.", "move", ".key-hints button:nth-child(2)"),
            ("Press Backspace", "Connected deletion remains explicit and recoverable before Escape returns to canvas.", "delete", ".key-hints button:nth-child(3)"),
        ]),
        "media": media("Keyboard grammar", "The model borrows the mature affordances of list and text editors instead of inventing a new canvas gesture.", "Enter edit", "line commands", "Escape"),
        "preview": preview("v7-preview", V7_BLOCK, "", status("Port list editor focused", "edit") + status("line 2 · in_2 created", "add") + status("line moved up", "move") + status("out_1 deleted · Ctrl+Z", "delete")),
    },
    {
        "id": "v8",
        "name": "Port Halo",
        "thesis": "Select one port, then expose a tiny adjacent halo with add-above/below, move, and delete actions bound to that exact target.",
        "accent": "#5a7dbc",
        "bestWhen": "Single precise edits dominate and the UI should explicitly show which port each action will affect.",
        "losesWhen": "Many ports must be reordered because each operation begins with a new target selection." ,
        "decisions": [
            {"label": "Primary object", "value": "One selected port owns a small contextual action cluster."},
            {"label": "Target clarity", "value": "The selected row highlights before any add, move, or delete command is offered."},
            {"label": "Dismissal", "value": "Clicking canvas, Escape, or starting a cable hides the halo immediately."},
        ],
        "keepParts": ["selected-row highlight", "add above/below", "adjacent action halo", "automatic dismissal on cable drag"],
        "proof": ["The hero highlights out_1 and opens a compact vertical halo physically adjacent to that port.", "Each button drives the shared add/move/delete list states and keeps the target visible."],
        "scores": {"fr1": score(3, "Single edits are fast, but repeated work incurs select-then-command cycles."), "fr2": score(5, "The explicit selection state and separate halo buttons make target and verb unambiguous."), "fr3": score(5, "Selecting a port reveals labeled-symbol controls exactly where the user is looking."), "fr4": score(4, "The halo stays beside the Block but temporarily occupies a narrow canvas gutter."), "fr5": score(4, "Large halo buttons and keyboard roving focus work well, though dense edges can make initial port selection difficult.")},
        "gateResults": gates("Starting a cable dismisses the halo; halo actions live outside the terminal dot.", "The selected target lets delete show an exact impact count and one-step Undo.", "The halo anchors to whichever semantic port position the current view projects.", "Commands address the selected stable id and bracket history per action."),
        "previewLabel": "interactive selected-port halo",
        "story": story("Select one port, then act beside it", [
            ("Select out_1", "A direct port click targets the row before mutation controls appear.", "base", ".port-pick"),
            ("Reveal the halo", "The action cluster sits beside the highlighted target rather than in global chrome.", "selected", ".port-halo button:first-child"),
            ("Add beside selection", "Above/below controls make the insertion location explicit.", "add", ".port-halo button:first-child"),
            ("Move the selection", "The same target remains highlighted as it changes order.", "move", ".port-halo button:nth-child(3)"),
            ("Delete the target", "A dedicated trash button removes the visibly selected port and offers Undo.", "delete", ".port-halo button:nth-child(4)"),
        ]),
        "media": media("Selection lifecycle", "The halo optimizes one exact edit: target first, then reveal only the verbs valid for that port.", "select row", "adjacent verbs", "dismiss"),
        "preview": preview("v8-preview", V8_BLOCK, "", status("out_1 selected", "selected") + status("in_2 added above target", "add") + status("selection moved", "move") + status("out_1 deleted · Undo", "delete")),
    },
    {
        "id": "v9",
        "name": "Typed Tokens",
        "thesis": "Open a tiny palette of typed port tokens and drag one onto a highlighted Block edge; rearrange tokens spatially and drop them into Trash.",
        "accent": "#4f8b7e",
        "bestWhen": "Choosing a port type while adding is common and direct spatial placement is more valuable than compact menus.",
        "losesWhen": "Pointer travel, touch precision, or many reorder operations make drag-and-drop tiring." ,
        "decisions": [
            {"label": "Primary object", "value": "A port is a typed token inserted onto a spatial drop edge."},
            {"label": "Creation", "value": "Drag Input, Image, or Text from a local palette to the exact side and slot."},
            {"label": "Move/delete", "value": "Drag a row to another slot or into a visible Trash token while edit state is active."},
        ],
        "keepParts": ["typed add tokens", "highlighted drop edge", "slot preview", "visible trash dropzone"],
        "proof": ["The hero opens a typed palette and exposes a dashed insertion edge directly on the Block.", "The shared states demonstrate a typed in_2 addition, spatial reorder, and explicit Trash drop."],
        "scores": {"fr1": score(4, "Typed add combines creation and type choice, but drag travel slows repeated reorder and delete."), "fr2": score(4, "The palette/drop-edge state establishes intent, though dragging existing ports still needs an edit-state rule.", "medium"), "fr3": score(4, "The palette labels types and the dashed edge advertises a drop target, but its launcher must first be found."), "fr4": score(4, "The palette stays local and the Block remains visible, with modest gutter occlusion."), "fr5": score(3, "Spatial drag is clear at moderate density but needs command fallbacks for keyboard, touch, and long Expanded edges.", "medium")},
        "gateResults": gates("The highlighted drop edge appears only after opening the palette; ordinary terminal drag outside that state remains wiring.", "Trash is a labeled drop target with cable impact and a one-step Undo toast.", "Tokens target semantic side/order and can drop onto compact or stretched edge projections.", "Drops resolve to id-based create/move/remove commands with one history boundary."),
        "previewLabel": "interactive typed drag palette",
        "story": story("Drag a typed port onto the Block edge", [
            ("Open typed ports", "A local launcher reveals port kinds rather than creating an untyped row first.", "base", ".palette-trigger button"),
            ("Reveal drop targets", "The dashed Block edge shows where a token can land and how side/order will resolve.", "palette", ".token-palette button:first-child"),
            ("Drop an Input", "One drag both creates in_2 and assigns its initial input type.", "add", ".token-palette button:first-child"),
            ("Drag to another slot", "The edge preview makes the new order spatial before commit.", "move", ".drop-edge"),
            ("Drop into Trash", "A visible destructive target names topology impact and offers Undo.", "delete", ".token-palette button:last-child"),
        ]),
        "media": media("Typed drag lifecycle", "This direction makes the port type part of creation rather than a follow-up inspector edit.", "pick token", "drop side + slot", "Trash"),
        "preview": preview("v9-preview", V9_BLOCK, '<div class="native-actions palette-trigger"><button data-story-to="palette" aria-label="Open typed port palette">＋ Typed port</button></div>', status("Choose a token and drop edge", "palette") + status("Input in_2 dropped", "add") + status("in_2 moved to slot 1", "move") + status("out_1 dropped in Trash · Undo", "delete")),
    },
    {
        "id": "v10",
        "name": "Footer Strip",
        "thesis": "Put a quiet but permanent +Input, +Output, Reorder, and Delete strip in the Block footer so the core operations are always one click away.",
        "accent": "#a35b68",
        "bestWhen": "The fastest learnable default matters and a small amount of persistent Block chrome is acceptable.",
        "losesWhen": "Hundreds of Blocks make the repeated footer controls visually noisy or the footer width becomes constrained." ,
        "decisions": [
            {"label": "Primary object", "value": "The existing Block footer becomes the stable command home for port-list edits."},
            {"label": "Creation", "value": "Separate +Input and +Output buttons remove side/type ambiguity."},
            {"label": "Ordering/delete", "value": "Reorder enters an obvious numbered state; Delete applies to the selected port and is disabled without one."},
        ],
        "keepParts": ["persistent +Input/+Output", "footer command home", "explicit reorder state", "disabled-until-selected delete"],
        "proof": ["The live hero uses the Block's already-existing 46px footer and adds no popover or external surface.", "All three operations are visible in the starting state and drive the same port-list mutations."],
        "scores": {"fr1": score(4, "Add is always one click and reorder/delete are shallow, though target selection adds a step."), "fr2": score(5, "Labeled footer buttons are separate from every port, selection, text, and cable gesture."), "fr3": score(5, "The complete operation vocabulary is visible without hover, hold, shortcut, or secondary click."), "fr4": score(4, "The strip stays inside an existing footer but adds persistent visual weight to every editable Block."), "fr5": score(4, "Large labeled buttons and keyboard focus are robust, while narrow Blocks need overflow or responsive compaction.")},
        "gateResults": gates("All mutations start in the footer, so terminal dragging is exclusively cable creation.", "Delete activates only after a port selection and can state the affected cable count before one-step commit.", "The footer persists in both Port and Expanded views and targets semantic records.", "Commands call stable-id mutations and one named history step each."),
        "previewLabel": "interactive permanent footer controls",
        "story": story("Keep every port command one click away", [
            ("See all commands", "The existing footer permanently exposes the complete edit vocabulary.", "base", ".footer-command-strip button:first-child"),
            ("Add an Input", "A labeled one-click command inserts in_2 with no menu or gesture discovery.", "add", ".footer-command-strip button:first-child"),
            ("Enter reorder", "The footer's reorder command makes the temporary ordering state explicit.", "move", ".footer-command-strip button:nth-child(3)"),
            ("Delete selected", "Trash is available only after a port target is selected and remains undoable.", "delete", ".footer-command-strip button:nth-child(4)"),
        ]),
        "media": media("Persistent command home", "The strip trades a small permanent footprint for immediate first-use comprehension and predictable keyboard access.", "visible verbs", "select target", "commit"),
        "preview": preview("v10-preview", V10_BLOCK, "", status("in_2 added", "add") + status("reorder state · in_2 moved", "move") + status("out_1 deleted · Undo", "delete")),
    },
]


SPEC = {
    "schemaVersion": 3,
    "title": "Ten fast ways to edit Ports inside a Block",
    "kicker": "SystemSketch · Babble + Prune 10 · Sep 1, 2026",
    "brief": "Make adding, reordering, and deleting semantic ports extremely fast from within the Block window itself, while preserving the existing port-as-cable-terminal interaction. The comparison deliberately includes Zach's table-inspired hover/hold/context-menu hybrid and the proposed elbow-control-point model.",
    "count": 10,
    "defaultId": "v3",
    "defaultWhy": "Port Tool is the provisional default at 93.4/100. It is the only direction that combines top-tier repeated-edit throughput, dense-list/accessibility strength, and a completely explicit gesture boundary: one P/Ports entry amortizes across the edit burst, while ordinary port dragging remains exclusively cable creation outside the mode.",
    "decisionHinge": "The recommendation depends on burst throughput versus zero-learning visibility. Move 13 weight points from Repeated-edit throughput to First-use discoverability and V10 Footer Strip narrowly leads V3 (91.0 vs 90.8). If a typical session makes one port edit, choose V10; if it makes several, keep V3. V1 Boundary Rows is the best gesture layer to splice on top of either command baseline.",
    "invariants": [
        "Use the same selected decode Block in Port view with in_1 and out_1, then demonstrate adding in_2, moving it above in_1, and deleting out_1.",
        "Inputs remain on the left edge and outputs on the right; port order is semantic and survives Port ↔ Expanded view changes.",
        "A normal drag from a port terminal continues to start a semantic cable unless an unmistakable port-edit state owns the gesture.",
        "Deleting a connected port must make the affected cable count explicit and remain one-step undoable.",
        "All port mutations address stable ids and commit through the same command layer used by the inspector and context menu.",
    ],
    "boundary": "Standalone interactive front-end slices at a shared SystemSketch-like Block fidelity. Guided stories, direct add/move/delete controls, prune state, and export work in the gallery; real tldraw pointer capture, cable bindings, touch thresholds, command dispatch, undo, persistence, and Port/Expanded integration are simulated and require production validation after selection.",
    "axes": [
        {"name": "Mental model", "values": ["table rows", "geometry beads", "persistent tool", "transient lens", "commands", "local sheet", "text list", "selected-object halo", "typed tokens", "footer toolbar"]},
        {"name": "Disclosure", "values": ["hover", "selection-near", "explicit mode", "press-hold", "secondary click", "anchored overlay", "focus mode", "port selection", "palette", "always visible"]},
        {"name": "Reorder", "values": ["held row grip", "drag bead", "mode drag", "large-row drag", "move command", "sheet grip", "Alt+Arrow", "halo arrows", "spatial drop", "reorder state"]},
        {"name": "Safety boundary", "values": ["separate gutter", "modifier/threshold", "tool state", "dwell state", "named command", "off-canvas table", "keyboard focus", "selected target", "palette state", "footer command"]},
    ],
    "requirements": REQUIREMENTS,
    "hardGates": HARD_GATES,
    "variants": VARIANTS,
    "checks": [
        "Exactly ten structurally distinct edit models",
        "Same decode Block, initial ports, viewport, and add/move/delete scenario",
        "Five weighted criteria frozen before generation and summing to 100%",
        "Four hard gates scored separately from the weighted objective",
        "Every hero supports a synchronized guided story and direct controls",
        "Every variant retains add, reorder, and delete behavior at comparable fidelity",
        "Only V2 fails a hard gate and it is excluded from recommendation",
        "No production Block, port, cable, or inspector code changed",
    ],
}


def reference_html() -> str:
    sources = [
        (
            Path("/home/bam/zach_brain/Pasted image 20260901120051.png"),
            "Current decode Block: one input, one output, quiet footer.",
            "Current SystemSketch Block screenshot",
        ),
        (
            Path("/home/bam/zach_brain/Pasted image 20260901120232.png"),
            "Obsidian Table: a boundary plus appears only where insertion is valid.",
            "Obsidian table hover insertion screenshot",
        ),
        (
            Path("/home/bam/zach_brain/Pasted image 20260901120316.png"),
            "Obsidian Table: row commands group add, move, duplicate, and delete.",
            "Obsidian table row command screenshot",
        ),
    ]
    cards = "".join(
        f'<figure class="reference-card"><img src="{image_data(path)}" alt="{alt}"><span>{caption}</span></figure>'
        for path, caption, alt in sources
    )
    return f"""
      <section class="reference-board" aria-labelledby="reference-heading">
        <div class="reference-head">
          <div><div class="eyebrow">Actual references inspected</div><h2 id="reference-heading">One Block, two table grammars</h2></div>
          <p>The prototypes preserve the current Block silhouette and borrow behavior—not dark styling—from the table references. These images are embedded so the gallery stays self-contained.</p>
        </div>
        <div class="reference-grid">{cards}</div>
      </section>
    """


def main() -> None:
    if not GALLERY.exists():
        raise SystemExit(f"Babble gallery builder not found: {GALLERY}")

    SPEC_PATH.write_text(json.dumps(SPEC, indent=2) + "\n", encoding="utf-8")
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
    html = html.replace(
        '<section aria-labelledby="variants-heading">',
        f'{reference_html()}\n    <section aria-labelledby="variants-heading">',
        1,
    )
    HTML_PATH.write_text(html, encoding="utf-8")

    subprocess.run(
        ["python3", str(GALLERY), "check", "--input", str(HTML_PATH), "--strict"],
        check=True,
    )


if __name__ == "__main__":
    main()
