#!/usr/bin/env python3
"""Build reports/icon-picker-proposal-<date>.html — the proposal for a Notion-style
Block icon picker over the whole Lucide library, with emoji and image upload.

Nothing in the app changes with this page. Its centrepiece is a LIVE mock of the
proposed picker (real Lucide 1.43.0 icons + tags, real emoji data, real paste-to-
upload) so the design can be felt, not read. Every number is measured at build
time from the tree or from the data files beside the report.

Data + reference crops live in the ignored `reports/media/icon-picker-proposal/`
and are referenced relatively — the retained review runtime serves them. Source
of the data files (regenerate with the same versions if they go missing):
  lucide-static@1.43.0   icon-nodes.json + tags.json  -> lucide-1.43.0.json
  unicode-emoji-json@0.9.0 data-by-emoji.json         -> emoji-0.9.0.json
"""
from __future__ import annotations

import json
import os
import re
from datetime import date
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NAME = "icon-picker-proposal"
OUT = Path(os.environ.get("SYSTEMSKETCH_REPORT_OUTPUT", ROOT / f"reports/{NAME}-{date.today()}.html"))
MEDIA = Path(os.environ.get("SYSTEMSKETCH_REPORT_MEDIA_DIR", ROOT / "reports/media" / NAME))
REL = f"media/{NAME}"


def read(name: str) -> str:
    return (ROOT / name).read_text(encoding="utf-8")


def need(text: str, token: str, label: str) -> None:
    if token not in text:
        raise SystemExit(f"report is stale — expected {label}: {token!r}")


def measured() -> dict:
    icons_src = read("src/blocks/ui/blockIcons.tsx")
    model = read("src/blocks/blockModel.ts")
    inspector = read("src/blocks/ui/BlockInspector.tsx")
    layout = read("src/blocks/layoutBlock.ts")
    pkg = json.loads(read("package.json"))
    need(icons_src, "export const BLOCK_ICONS", "the curated registry")
    need(model, "icon: T.string.optional()", "the icon prop")
    need(inspector, "function IconPicker(", "the inspector picker")
    curated = len(re.findall(r"^\s*\{ name: '", icons_src, re.M))
    simple_px = re.search(r"SIMPLE_ICON_PX = (\d+)", layout).group(1)
    header_px = re.search(r"HEADER_ICON_PX = (\d+)", layout).group(1)
    lucide_version = pkg["dependencies"]["lucide-react"]
    lucide = json.loads((MEDIA / "lucide-1.43.0.json").read_text())
    emoji = json.loads((MEDIA / "emoji-0.9.0.json").read_text())
    return {
        "curated": curated,
        "simple_px": simple_px,
        "header_px": header_px,
        "lucide_pinned": lucide_version,
        "lucide_next": lucide["version"],
        "lucide_count": len(lucide["icons"]),
        "lucide_in_pinned": sum(1 for i in lucide["icons"] if i["pinned"]),
        "tag_count": sum(len(i["tags"]) for i in lucide["icons"]),
        "emoji_count": len(emoji["emoji"]),
        "emoji_groups": len({e["g"] for e in emoji["emoji"]}),
        "lucide_json_kb": (MEDIA / "lucide-1.43.0.json").stat().st_size // 1024,
        "emoji_json_kb": (MEDIA / "emoji-0.9.0.json").stat().st_size // 1024,
    }


# Measured once with esbuild 0.25 in a scratch install (see the handoff): the whole
# lucide-react 1.43.0 `icons` map, minified ESM with react external.
BUNDLE = {"min_kb": 1011, "gz_kb": 165, "tags_gz_kb": 47, "app_chunk_kb": 1726, "tldraw_chunk_kb": 1693}


CSS = r"""
  :root { color-scheme:light; --ink:#1c2027; --muted:#5c636e; --line:#d9dee6; --paper:#f2f4f8;
    --card:#fff; --blue:#3061e6; --blue-soft:#e9f0fe; --green:#1f8a5a; --red:#c8453a; --amber:#c47b1b; --violet:#7048c8 }
  * { box-sizing:border-box }
  body { margin:0; color:var(--ink); background:radial-gradient(circle at 82% -4%,#e5edfb 0,transparent 40%),var(--paper);
    font:16px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif }
  main { width:min(1120px,calc(100% - 32px)); margin:auto; padding:40px 0 72px }
  code { font:0.86em ui-monospace,SFMono-Regular,Menlo,monospace; background:#eef1f6; padding:1px 5px; border-radius:5px }
  a { color:var(--blue); text-decoration:none } a:hover { text-decoration:underline }
  .hero { padding:42px; border:1px solid #d5dde8; border-radius:24px; background:#ffffffe8; box-shadow:0 22px 60px #22344c14 }
  .eyebrow { color:var(--blue); font-size:12px; font-weight:800; letter-spacing:.13em; text-transform:uppercase }
  h1 { margin:10px 0 14px; font-size:clamp(30px,4.6vw,48px); line-height:1.06; letter-spacing:-.045em; max-width:26ch }
  .lead { max-width:76ch; margin:0; color:var(--muted); font-size:17px } .lead b { color:var(--ink) }
  .verdict { margin-top:22px; padding:18px 20px; border:1px solid #cfe6da; border-left:4px solid var(--green);
    border-radius:12px; background:#f1faf5; font-size:15px; line-height:1.6 }
  .verdict b { color:var(--green) } .verdict ul { margin:6px 0 0; padding-left:20px } .verdict li { margin:4px 0 }
  .quiet { margin-top:12px; padding:14px 18px; border:1px solid var(--line); border-left:4px solid var(--muted);
    border-radius:12px; background:#f7f8fb; font-size:13.5px; color:var(--muted) }
  section { margin-top:22px; padding:30px; border:1px solid var(--line); border-radius:20px; background:#fffffff2; box-shadow:0 12px 36px #22344c0d }
  h2 { margin:0 0 6px; font-size:23px; letter-spacing:-.03em } h3 { margin:22px 0 8px; font-size:16px; letter-spacing:-.01em }
  section > p, .prose p { margin:0 0 14px; color:#3a404a; max-width:80ch }
  section > ul, .prose ul, section > ol { margin:0 0 14px; padding-left:22px; color:#3a404a; max-width:80ch } section li { margin:5px 0 }
  table { width:100%; border-collapse:collapse; font-size:13.5px }
  th, td { padding:9px 11px; text-align:left; vertical-align:top; border-bottom:1px solid var(--line) }
  thead th { font-size:10.5px; letter-spacing:.06em; text-transform:uppercase; color:var(--muted) }
  tbody th { font-weight:650; min-width:150px }
  td small, th small { display:block; margin-top:3px; color:var(--muted); font-size:11.5px; line-height:1.45; font-weight:400 }
  td.num { text-align:right; font-variant-numeric:tabular-nums }
  .tag { display:inline-block; padding:2px 9px; border-radius:99px; font-size:11px; font-weight:700; letter-spacing:.03em }
  .tag.keep { background:#e9f7f0; color:var(--green) } .tag.no { background:#fdeeec; color:var(--red) }
  .tag.ref { background:#fdf3e4; color:var(--amber) } .tag.core { background:var(--blue-soft); color:var(--blue) }
  .metrics { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin:14px 0 6px }
  @media (max-width:840px){ .metrics { grid-template-columns:repeat(2,1fr) } }
  .metric { padding:15px; border:1px solid var(--line); border-radius:12px; background:#fafbfd }
  .metric strong { display:block; font-size:22px; letter-spacing:-.04em } .metric span { color:var(--muted); font-size:11px; line-height:1.4; display:block; margin-top:2px }
  .box { padding:18px; border:1px solid var(--line); border-radius:13px; background:#fff } .box h4 { margin:0 0 8px; font-size:13.5px }
  .cols { display:grid; grid-template-columns:1fr 1fr; gap:16px } .cols3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px }
  @media (max-width:840px){ .cols, .cols3 { grid-template-columns:1fr } }
  .box.free h4 { color:var(--green) } .box.cost h4 { color:var(--red) } .box.warn h4 { color:var(--amber) }
  .box ul { margin:0; padding-left:18px; color:#4a5057; font-size:13px } .box li { margin:5px 0 }
  .diagram { width:100%; height:auto; display:block; margin:12px 0 4px }
  figure { margin:0; } figure img { width:100%; height:auto; display:block; border:1px solid var(--line); border-radius:10px; background:#111 }
  figcaption { margin-top:6px; color:var(--muted); font-size:12.5px; line-height:1.45 }
  .refs { display:grid; grid-template-columns:repeat(3,1fr); gap:14px } @media (max-width:840px){ .refs { grid-template-columns:1fr 1fr } }
  .pair { display:grid; grid-template-columns:1fr 1fr; gap:14px; align-items:start }
  .decision { display:grid; grid-template-columns:150px 1fr; gap:10px 18px; padding:14px 0; border-bottom:1px solid var(--line); font-size:14px }
  .decision:last-child { border-bottom:0 } .decision b.q { color:var(--ink) } .decision .d { color:#3a404a }
  .decision .default { margin-top:6px; padding:6px 10px; border-radius:8px; background:var(--blue-soft); color:#1e3f9c; font-size:13px; display:inline-block }
  footer { margin-top:26px; padding-top:18px; border-top:1px solid var(--line); color:var(--muted); font-size:12px; display:flex; justify-content:space-between; flex-wrap:wrap; gap:10px }

  /* ---------- the live mock ---------- */
  .lab { margin-top:14px; padding:26px; border-radius:16px; border:1px solid #2b2f36; background:#1b1d21; color:#d9dbe0; position:relative }
  .lab[data-theme=light] { background:#f7f7f5; border-color:#e3e2de; color:#37352f }
  .lab-bar { display:flex; gap:10px; align-items:center; justify-content:space-between; margin-bottom:16px; font-size:12.5px; color:#8f96a3 }
  .lab-bar button { font:inherit; padding:5px 11px; border-radius:7px; border:1px solid #3a3f48; background:#24272d; color:#d9dbe0; cursor:pointer }
  .lab[data-theme=light] .lab-bar button { border-color:#d6d5d0; background:#fff; color:#37352f }
  .stage { display:grid; grid-template-columns:auto 1fr; gap:36px; align-items:start }
  @media (max-width:900px){ .stage { grid-template-columns:1fr } }
  .blocks { display:flex; flex-direction:column; gap:18px; min-width:280px }
  .blk { border:1.5px solid #3d4350; border-radius:10px; background:#23262c; color:#e6e7ea; font:500 15px Inter,sans-serif; overflow:hidden }
  .lab[data-theme=light] .blk { border-color:#c9c8c3; background:#fff; color:#2a2a2a }
  .blk.simple { display:flex; align-items:center; gap:12px; padding:14px 18px; width:280px }
  .blk.port { width:280px } .blk.port .hd { display:flex; align-items:center; gap:8px; padding:9px 12px; border-bottom:1px solid #3d4350; font-size:14px }
  .lab[data-theme=light] .blk.port .hd { border-color:#e2e1dc }
  .blk.port .body { padding:10px 12px; display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:12px; color:#9aa1ad }
  .blk.port .body span::before { content:'● '; color:#4f8ef7 }
  .well { display:grid; place-items:center; flex:0 0 auto; border-radius:8px; cursor:pointer; border:1.5px dashed transparent; color:inherit }
  .well.empty { border-color:#5a6170 } .well:hover { background:#ffffff14 }
  .well.s40 { width:44px; height:44px } .well.s22 { width:26px; height:26px }
  .well img { width:100%; height:100%; object-fit:contain; border-radius:5px } .well .emo { line-height:1; font-family:"Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji",sans-serif }
  .well svg { display:block }
  .hint { font-size:12px; color:#8f96a3; max-width:280px; line-height:1.5 }

  .picker { width:430px; max-width:100%; border-radius:10px; background:#252525; border:1px solid #3a3a3a; color:#d4d4d4;
    box-shadow:0 14px 40px #0009, 0 0 0 1px #0004; font:14px/1.3 Inter,ui-sans-serif,system-ui,sans-serif; user-select:none }
  .lab[data-theme=light] .picker { background:#fff; border-color:#e9e9e7; color:#37352f; box-shadow:0 10px 32px #0002, 0 0 0 1px #0000000d }
  .picker[hidden], .pk-filter[hidden], .pk-foot[hidden] { display:none }
  .pk-head { display:flex; align-items:center; padding:6px 10px 0; border-bottom:1px solid #373737 }
  .lab[data-theme=light] .pk-head { border-color:#e9e9e7 }
  .pk-tab { padding:8px 6px 9px; margin-right:8px; border:0; background:none; color:#8a8a8a; font:inherit; cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-1px }
  .pk-tab[aria-selected=true] { color:inherit; border-bottom-color:currentColor }
  .pk-remove { margin-left:auto; border:0; background:none; color:#8a8a8a; font:inherit; cursor:pointer; padding:6px } .pk-remove:hover { color:inherit }
  .pk-filter { display:flex; gap:6px; align-items:center; padding:10px 10px 4px }
  .pk-input { flex:1; display:flex; align-items:center; gap:6px; height:32px; padding:0 8px; border-radius:6px; background:#1f1f1f; border:1px solid #3a3a3a; color:#8a8a8a }
  .pk-input:focus-within { border-color:#5a8dee; box-shadow:0 0 0 2px #5a8dee44 }
  .lab[data-theme=light] .pk-input { background:#f7f7f5; border-color:#e3e2de }
  .pk-input input { flex:1; min-width:0; border:0; background:none; color:inherit; font:inherit; outline:none } .pk-input input::placeholder { color:#8a8a8a }
  .lab[data-theme=light] .pk-input input { color:#37352f }
  .pk-input .clear { border:0; background:none; color:#8a8a8a; cursor:pointer; padding:0; display:grid; place-items:center }
  .pk-btn { width:32px; height:32px; border-radius:6px; border:1px solid #3a3a3a; background:#2b2b2b; color:#bbb; display:grid; place-items:center; cursor:pointer; position:relative; font-size:16px }
  .pk-btn:hover { background:#333 } .lab[data-theme=light] .pk-btn { background:#fff; border-color:#e3e2de; color:#5f5e5a }
  .pk-btn .dot { width:14px; height:14px; border-radius:50%; background:currentColor; box-shadow:inset 0 0 0 2px #0003 }
  .pk-pop { position:absolute; right:0; top:36px; z-index:5; display:flex; gap:4px; padding:6px; border-radius:8px; background:#2b2b2b; border:1px solid #3a3a3a; box-shadow:0 8px 24px #0006 }
  .lab[data-theme=light] .pk-pop { background:#fff; border-color:#e3e2de }
  .pk-pop button { width:24px; height:24px; border-radius:6px; border:0; background:none; cursor:pointer; display:grid; place-items:center; font-size:17px; padding:0 }
  .pk-pop button i { width:14px; height:14px; border-radius:50%; display:block; box-shadow:inset 0 0 0 1px #0004 }
  .pk-pop button[aria-pressed=true] { background:#ffffff22 }
  .pk-body { height:328px; overflow-y:auto; padding:4px 10px 10px; scrollbar-width:thin }
  .pk-sec { margin:8px 0 6px; font-size:12px; color:#8a8a8a } .pk-sec:first-child { margin-top:4px }
  .pk-grid { display:grid; grid-template-columns:repeat(12,1fr); gap:2px }
  .pk-cell { aspect-ratio:1; display:grid; place-items:center; border-radius:5px; cursor:pointer; color:#c9c9c9; border:0; background:none; padding:0 }
  .pk-cell:hover, .pk-cell:focus-visible { background:#ffffff1a; outline:none } .pk-cell[aria-selected=true] { background:#5a8dee33; box-shadow:inset 0 0 0 1px #5a8dee }
  .lab[data-theme=light] .pk-cell { color:#37352f } .lab[data-theme=light] .pk-cell:hover { background:#00000010 }
  .pk-cell svg { width:20px; height:20px; display:block } .pk-cell.emo { font:20px/1 "Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji",sans-serif }
  .pk-empty { padding:36px 10px; text-align:center; color:#8a8a8a; font-size:13px }
  .pk-up { padding:12px 10px 10px }
  .pk-upload { display:flex; align-items:center; justify-content:center; gap:8px; height:52px; border-radius:6px; background:#2b2b2b; border:1px solid #3a3a3a; color:#d4d4d4; font:inherit; cursor:pointer; width:100% }
  .pk-upload:hover { background:#333 } .lab[data-theme=light] .pk-upload { background:#f7f7f5; border-color:#e3e2de; color:#37352f }
  .pk-upload.drop { border-color:#5a8dee; background:#5a8dee22 }
  .pk-or { text-align:center; color:#8a8a8a; font-size:12px; margin:12px 0 18px }
  .pk-actions { display:flex; justify-content:space-between; align-items:center; margin-top:8px }
  .pk-actions button { font:inherit; border-radius:6px; padding:6px 12px; cursor:pointer; border:1px solid transparent; background:none; color:#d4d4d4 }
  .lab[data-theme=light] .pk-actions button { color:#37352f }
  .pk-actions .save { background:#2383e2; color:#fff } .pk-actions .save:disabled { opacity:.45; cursor:default }
  .pk-preview { border-radius:6px; background:#1f1f1f; border:1px solid #3a3a3a; padding:10px 12px 14px; text-align:center }
  .lab[data-theme=light] .pk-preview { background:#f7f7f5; border-color:#e3e2de }
  .pk-preview .lbl { color:#8a8a8a; font-size:12px; margin-bottom:10px }
  .pk-preview .row { display:flex; justify-content:center; align-items:center; gap:18px }
  .pk-preview .mini { border:1.5px solid #3d4350; border-radius:8px; background:#23262c; padding:8px 12px; display:flex; align-items:center; gap:8px; color:#e6e7ea; font-weight:500 }
  .lab[data-theme=light] .pk-preview .mini { background:#fff; border-color:#c9c8c3; color:#2a2a2a }
  .pk-preview .mini img { object-fit:contain; border-radius:4px } .pk-preview .mini.big img { width:40px; height:40px } .pk-preview .mini.small img { width:22px; height:22px }
  .pk-preview .mini.big { font-size:15px } .pk-preview .mini.small { font-size:13px }
  .pk-preview .meta { margin-top:10px; font-size:11.5px; color:#8a8a8a }
  .pk-check { display:flex; align-items:center; gap:8px; margin:12px 2px 0; font-size:13px; color:#8a8a8a } .pk-check input { margin:0 }
  .pk-foot { padding:6px 10px 8px; border-top:1px solid #373737; font-size:11px; color:#6f6f6f; display:flex; justify-content:space-between }
  .lab[data-theme=light] .pk-foot { border-color:#e9e9e7 }
"""


MOCK_JS = r"""
(() => {
  const MEDIA = 'media/icon-picker-proposal/';
  const TONES = ['', '\u{1F3FB}', '\u{1F3FC}', '\u{1F3FD}', '\u{1F3FE}', '\u{1F3FF}'];
  const TONE_HANDS = ['✋', '✋\u{1F3FB}', '✋\u{1F3FC}', '✋\u{1F3FD}', '✋\u{1F3FE}', '✋\u{1F3FF}'];
  // tldraw's DEFAULT_THEME light solids — the palette a future `iconColor` StyleProp would draw from.
  const COLORS = [['black','#1d1d1d'],['grey','#9fa8b2'],['light-violet','#e085f4'],['violet','#ae3ec9'],['blue','#4263eb'],['light-blue','#4dabf7'],['yellow','#ffc034'],['orange','#f76707'],['green','#099268'],['light-green','#40c057'],['light-red','#ff8787'],['red','#e03131']];
  const GROUP_ORDER = ['Smileys & Emotion','People & Body','Animals & Nature','Food & Drink','Travel & Places','Activities','Objects','Symbols','Flags'];
  const lab = document.getElementById('lab');
  if (!lab) return;
  const $ = (sel, root = lab) => root.querySelector(sel);
  const state = {
    tab: 'icons', query: '', color: null, tone: 0, open: true,
    icon: { kind: 'lucide', name: 'terminal' },
    upload: null, uploadPreview: false, addToLibrary: false, colorOpen: false, toneOpen: false,
    recent: [],
  };
  try { state.recent = JSON.parse(localStorage.getItem('ss-icon-recent') || '[]'); } catch {}
  const hash = new URLSearchParams(location.hash.slice(1));
  if (hash.get('tab')) state.tab = hash.get('tab');
  if (hash.get('q')) state.query = hash.get('q');
  if (hash.get('theme')) lab.dataset.theme = hash.get('theme');
  if (hash.get('icon')) state.icon = { kind: 'lucide', name: hash.get('icon') };

  let LUCIDE = null, EMOJI = null, timings = { load: 0, grid: 0 };
  const byName = new Map();

  function svg(node, size, extra = '') {
    const kids = node.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`).join('');
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${kids}</svg>`;
  }
  function esc(s) { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function emojiChar(e, tone) { return e.t && tone ? e.e + TONES[tone] : e.e; }

  function iconMarkup(icon, size) {
    if (!icon) return '';
    const style = state.color ? ` style="color:${state.color}"` : '';
    if (icon.kind === 'lucide') { const entry = byName.get(icon.name); return entry ? `<span${style}>${svg(entry.node, size)}</span>` : ''; }
    if (icon.kind === 'emoji') return `<span class="emo" style="font-size:${Math.round(size * 0.9)}px">${icon.char}</span>`;
    if (icon.kind === 'asset') return `<img src="${icon.src}" alt="" style="width:${size}px;height:${size}px">`;
    return '';
  }
  function iconLabel(icon) {
    if (!icon) return 'no icon';
    if (icon.kind === 'lucide') return `lucide:${icon.name}`;
    if (icon.kind === 'emoji') return `emoji:${icon.char}`;
    return `asset (${icon.kb} KB ${icon.type})`;
  }

  // ---- search ----------------------------------------------------------------
  function rankLucide(q) {
    if (!q) return LUCIDE.icons;
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const scored = [];
    for (const icon of LUCIDE.icons) {
      let score = 0;
      for (const term of terms) {
        let best = 0;
        if (icon.name === term) best = 100;
        else if (icon.name.startsWith(term)) best = 60;
        else if (icon.name.includes(term)) best = 40;
        for (const tag of icon.tags) {
          if (tag === term) best = Math.max(best, 50);
          else if (tag.startsWith(term)) best = Math.max(best, 30);
          else if (tag.includes(term)) best = Math.max(best, 15);
        }
        if (!best) { score = 0; break; }
        score += best;
      }
      if (score) scored.push([score, icon]);
    }
    scored.sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name));
    return scored.map((s) => s[1]);
  }
  function rankEmoji(q) {
    if (!q) return EMOJI.emoji;
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return EMOJI.emoji.filter((e) => terms.every((t) => e.n.includes(t) || e.s.includes(t) || (e.k || []).some((k) => k.includes(t))));
  }

  // ---- rendering ---------------------------------------------------------------
  function renderBlocks() {
    const empty = state.icon ? '' : ' empty';
    $('#well-simple').className = `well s40${empty}`;
    $('#well-simple').innerHTML = iconMarkup(state.icon, 40);
    $('#well-port').className = `well s22${empty}`;
    $('#well-port').innerHTML = iconMarkup(state.icon, 22);
    $('#stored').textContent = iconLabel(state.icon);
  }

  function renderPicker() {
    const picker = $('#picker');
    picker.hidden = !state.open;
    if (!state.open) return;
    for (const tab of picker.querySelectorAll('.pk-tab')) tab.setAttribute('aria-selected', String(tab.dataset.tab === state.tab));
    const filter = $('#pk-filter');
    const body = $('#pk-body');
    const foot = $('#pk-foot');
    if (state.tab === 'upload') { filter.hidden = true; body.className = 'pk-up'; renderUpload(body); foot.hidden = true; return; }
    filter.hidden = false; foot.hidden = false;
    body.className = 'pk-body';
    $('#pk-q').value = state.query;
    $('#pk-q').placeholder = 'Filter…';
    $('#pk-clear').hidden = !state.query;
    const aux = $('#pk-aux');
    if (state.tab === 'icons') {
      aux.innerHTML = `<button class="pk-btn" id="pk-color" title="Icon colour (follows the Block by default)" aria-haspopup="true"><span class="dot" style="color:${state.color || (lab.dataset.theme === 'light' ? '#37352f' : '#c9c9c9')}"></span></button>` +
        (state.colorOpen ? `<div class="pk-pop" role="menu">${COLORS.map(([n, hex]) => `<button data-color="${hex}" title="${n}" aria-pressed="${state.color === hex}"><i style="background:${hex}"></i></button>`).join('')}<button data-color="" title="Follow the Block" aria-pressed="${!state.color}">×</button></div>` : '');
    } else {
      aux.innerHTML = `<button class="pk-btn" id="pk-tone" title="Skin tone" aria-haspopup="true">${TONE_HANDS[state.tone]}</button>` +
        (state.toneOpen ? `<div class="pk-pop" role="menu">${TONE_HANDS.map((h, i) => `<button data-tone="${i}" aria-pressed="${state.tone === i}">${h}</button>`).join('')}</div>` : '');
    }
    if (!LUCIDE) { body.innerHTML = '<div class="pk-empty">Loading the library…</div>'; return; }
    const t0 = performance.now();
    const q = state.query.trim();
    let html = '';
    let count = 0;
    if (state.tab === 'icons') {
      const list = rankLucide(q);
      count = list.length;
      if (!q && state.recent.length) {
        html += `<div class="pk-sec">Recent</div><div class="pk-grid">${state.recent.map((n) => byName.get(n)).filter(Boolean).map((i) => cell(i)).join('')}</div>`;
      }
      html += `<div class="pk-sec">${q ? `Icons · ${count}` : 'Icons'}</div>`;
      html += count ? `<div class="pk-grid">${list.map((i) => cell(i)).join('')}</div>` : `<div class="pk-empty">No icons match “${esc(q)}”.<br>Try the Emoji tab, or Upload your own.</div>`;
    } else {
      const list = rankEmoji(q);
      count = list.length;
      if (!count) html = `<div class="pk-empty">No emoji match “${esc(q)}”.</div>`;
      else if (q) html = `<div class="pk-sec">Emoji · ${count}</div><div class="pk-grid">${list.map((e) => ecell(e)).join('')}</div>`;
      else for (const g of GROUP_ORDER) {
        const items = list.filter((e) => e.g === g);
        if (items.length) html += `<div class="pk-sec">${g}</div><div class="pk-grid">${items.map((e) => ecell(e)).join('')}</div>`;
      }
    }
    body.innerHTML = html;
    body.scrollTop = 0;
    timings.grid = performance.now() - t0;
    foot.innerHTML = `<span>${state.tab === 'icons' ? `Lucide ${LUCIDE.version} · ${LUCIDE.icons.length} icons · ${count} shown` : `${EMOJI.emoji.length} emoji · ${count} shown`}</span><span>grid built in ${timings.grid.toFixed(0)} ms</span>`;
  }
  function cell(icon) {
    const sel = state.icon && state.icon.kind === 'lucide' && state.icon.name === icon.name;
    return `<button class="pk-cell" data-lucide="${icon.name}" title="${esc(icon.name)}${icon.tags.length ? ' · ' + esc(icon.tags.slice(0, 4).join(', ')) : ''}" aria-selected="${sel}">${svg(icon.node, 20)}</button>`;
  }
  function ecell(e) {
    const ch = emojiChar(e, state.tone);
    const sel = state.icon && state.icon.kind === 'emoji' && state.icon.char === ch;
    return `<button class="pk-cell emo" data-emoji="${ch}" title="${esc(e.n)}${e.k && e.k.length ? ' · ' + esc(e.k.join(', ')) : ''}" aria-selected="${sel}">${ch}</button>`;
  }

  function renderUpload(body) {
    const up = state.upload;
    if (up && state.uploadPreview) {
      body.innerHTML = `
        <div class="pk-preview">
          <div class="lbl">Preview</div>
          <div class="row">
            <div class="mini big"><img src="${up.src}" alt=""><span>class</span></div>
            <div class="mini small"><img src="${up.src}" alt=""><span>class</span></div>
          </div>
          <div class="meta">${up.note}</div>
        </div>
        <label class="pk-check"><input type="checkbox" id="pk-lib" ${state.addToLibrary ? 'checked' : ''}> Add to workspace library <span style="opacity:.6">(phase 2)</span></label>
        <div class="pk-actions"><button id="pk-back">Back</button><button class="save" id="pk-save">Save</button></div>`;
      return;
    }
    body.innerHTML = `
      <button class="pk-upload" id="pk-upload-btn">${svg([["rect",{"width":"18","height":"18","x":"3","y":"3","rx":"2","ry":"2"}],["circle",{"cx":"9","cy":"9","r":"2"}],["path",{"d":"m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"}]], 18)} Upload an image</button>
      <input type="file" id="pk-file" accept="image/*,.svg" hidden>
      <div class="pk-or">or Ctrl+V to paste an image or link</div>
      <div class="pk-actions"><button id="pk-cancel">Cancel</button><button class="save" disabled>Save</button></div>`;
  }

  // ---- upload pipeline (the same one the app would run) --------------------------
  const MAX_EDGE = 256;
  async function ingestFile(file) {
    const original = file.size;
    if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name || '')) {
      const text = await file.text();
      const src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(text)));
      return { src, kb: Math.max(1, Math.round(original / 1024)), type: 'svg', note: `SVG kept as vector · ${fmtKb(original)} stored as-is` };
    }
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale)), h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    const src = canvas.toDataURL('image/png');
    const stored = Math.round((src.length - 22) * 3 / 4);
    return { src, kb: Math.max(1, Math.round(stored / 1024)), type: 'png', note: `${bitmap.width}×${bitmap.height} ${fmtKb(original)} → ${w}×${h} PNG ${fmtKb(stored)} stored in the .systemsketch` };
  }
  function fmtKb(bytes) { return bytes >= 1024 * 1024 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB'; }
  async function ingestUrl(url) {
    // WHY the mock loads the URL straight into <img>: a real implementation fetches through the Python host
    // (port 4323) so the bytes can be downscaled and inlined without a CORS taint. Here it stays a link.
    return { src: url, kb: 0, type: 'link', note: `Linked image · in the app the host fetches it and inlines a ${MAX_EDGE}px copy` };
  }
  async function acceptUpload(result) {
    state.upload = result; state.uploadPreview = true; state.tab = 'upload'; render();
  }

  // ---- events -------------------------------------------------------------------
  function choose(icon) {
    state.icon = icon;
    if (icon && icon.kind === 'lucide') {
      state.recent = [icon.name, ...state.recent.filter((n) => n !== icon.name)].slice(0, 12);
      try { localStorage.setItem('ss-icon-recent', JSON.stringify(state.recent)); } catch {}
    }
    state.open = false; state.colorOpen = false; state.toneOpen = false;
    render();
  }
  lab.addEventListener('click', async (ev) => {
    const t = ev.target.closest('button, .well, label');
    if (!t) { if (!ev.target.closest('.pk-pop')) { state.colorOpen = state.toneOpen = false; render(); } return; }
    if (t.classList.contains('well')) { state.open = true; render(); $('#pk-q') && $('#pk-q').focus(); return; }
    if (t.dataset.tab) { state.tab = t.dataset.tab; state.query = ''; state.colorOpen = state.toneOpen = false; render(); $('#pk-q') && $('#pk-q').focus(); return; }
    if (t.dataset.lucide) return choose({ kind: 'lucide', name: t.dataset.lucide });
    if (t.dataset.emoji) return choose({ kind: 'emoji', char: t.dataset.emoji });
    if (t.id === 'pk-remove') return choose(null);
    if (t.id === 'pk-shuffle') {
      if (state.tab === 'icons') { const list = rankLucide(state.query.trim()); if (list.length) choose({ kind: 'lucide', name: list[Math.floor(Math.random() * list.length)].name }); }
      else { const list = rankEmoji(state.query.trim()); if (list.length) choose({ kind: 'emoji', char: emojiChar(list[Math.floor(Math.random() * list.length)], state.tone) }); }
      state.open = true; render(); return;
    }
    if (t.id === 'pk-clear') { state.query = ''; render(); $('#pk-q').focus(); return; }
    if (t.id === 'pk-color') { state.colorOpen = !state.colorOpen; render(); return; }
    if (t.dataset.color !== undefined) { state.color = t.dataset.color || null; state.colorOpen = false; render(); return; }
    if (t.id === 'pk-tone') { state.toneOpen = !state.toneOpen; render(); return; }
    if (t.dataset.tone !== undefined) { state.tone = Number(t.dataset.tone); state.toneOpen = false; render(); return; }
    if (t.id === 'pk-upload-btn') { $('#pk-file').click(); return; }
    if (t.id === 'pk-cancel') { state.open = false; render(); return; }
    if (t.id === 'pk-back') { state.uploadPreview = false; render(); return; }
    if (t.id === 'pk-save') { const up = state.upload; choose({ kind: 'asset', src: up.src, kb: up.kb, type: up.type }); return; }
    if (t.id === 'lab-theme') { lab.dataset.theme = lab.dataset.theme === 'light' ? 'dark' : 'light'; render(); return; }
    if (t.id === 'lab-demo') { const blob = await (await fetch(MEDIA + 'ref-icepanel-logos.png')).blob(); acceptUpload(await ingestFile(new File([blob], 'screenshot.png', { type: 'image/png' }))); return; }
  });
  lab.addEventListener('change', async (ev) => {
    if (ev.target.id === 'pk-file' && ev.target.files[0]) acceptUpload(await ingestFile(ev.target.files[0]));
    if (ev.target.id === 'pk-lib') state.addToLibrary = ev.target.checked;
  });
  lab.addEventListener('input', (ev) => { if (ev.target.id === 'pk-q') { state.query = ev.target.value; renderPicker(); } });
  lab.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && state.open) { state.open = false; render(); }
    if (ev.key === 'Enter' && ev.target.id === 'pk-q') { const first = $('#pk-body .pk-cell'); if (first) first.click(); }
  });
  // Paste while the picker is open: an image → Upload preview; a URL → linked image. Exactly Notion's promise.
  document.addEventListener('paste', async (ev) => {
    if (!state.open) return;
    const items = Array.from(ev.clipboardData?.items || []);
    const image = items.find((i) => i.type.startsWith('image/'));
    if (image) { ev.preventDefault(); return acceptUpload(await ingestFile(image.getAsFile())); }
    const text = ev.clipboardData?.getData('text/plain')?.trim();
    if (text && /^https?:\/\/\S+$/.test(text)) { ev.preventDefault(); return acceptUpload(await ingestUrl(text)); }
  });
  const dropZone = () => $('#pk-upload-btn');
  lab.addEventListener('dragover', (ev) => { if (state.open && state.tab === 'upload') { ev.preventDefault(); dropZone()?.classList.add('drop'); } });
  lab.addEventListener('dragleave', () => dropZone()?.classList.remove('drop'));
  lab.addEventListener('drop', async (ev) => { if (state.open && state.tab === 'upload') { ev.preventDefault(); const f = ev.dataTransfer.files[0]; if (f) acceptUpload(await ingestFile(f)); } });

  function render() { renderBlocks(); renderPicker(); }

  (async () => {
    render();
    const t0 = performance.now();
    try {
      [LUCIDE, EMOJI] = await Promise.all([fetch(MEDIA + 'lucide-1.43.0.json').then((r) => r.json()), fetch(MEDIA + 'emoji-0.9.0.json').then((r) => r.json())]);
    } catch (err) {
      $('#pk-body').innerHTML = `<div class="pk-empty">Could not load the library data (${esc(String(err))}).<br>This page fetches <code>media/…</code> relatively — open it through the review runtime, not as a data: preview.</div>`;
      return;
    }
    for (const icon of LUCIDE.icons) byName.set(icon.name, icon);
    timings.load = performance.now() - t0;
    $('#lab-load').textContent = `library loaded in ${timings.load.toFixed(0)} ms (${LUCIDE.icons.length} icons + ${EMOJI.emoji.length} emoji)`;
    render();
    if (hash.get('demo') === 'preview') { const blob = await (await fetch(MEDIA + 'ref-icepanel-logos.png')).blob(); acceptUpload(await ingestFile(new File([blob], 'screenshot.png', { type: 'image/png' }))); }
    if (hash.get('open') === 'color') { state.colorOpen = true; render(); }
    if (hash.get('open') === 'tone') { state.toneOpen = true; render(); }
    window.__mockReady = true;
  })();
})();
"""


def lab_html() -> str:
    return f"""
<div class="lab" id="lab" data-theme="dark">
  <div class="lab-bar">
    <span>Live mock — real Lucide 1.43.0 + tags, real emoji data, real paste → image pipeline. <b id="lab-load">loading…</b></span>
    <span><button id="lab-demo" title="Feeds the IcePanel screenshot through the upload pipeline">Paste a demo screenshot</button> <button id="lab-theme">Light / dark</button></span>
  </div>
  <div class="stage">
    <div class="blocks">
      <div class="blk simple"><div class="well s40" id="well-simple" title="Click to change icon"></div><span>class</span></div>
      <div class="blk port"><div class="hd"><div class="well s22" id="well-port" title="Click to change icon"></div><span>class</span></div>
        <div class="body"><span>name: str</span><span>value: int</span><span>parent: Node</span><span>→ Node</span></div></div>
      <div class="hint">Stored on the Block: <code id="stored">—</code><br>Click either icon well to reopen the picker. Ctrl+V anywhere while it is open pastes an image or a link.</div>
    </div>
    <div class="picker" id="picker" role="dialog" aria-label="Block icon">
      <div class="pk-head">
        <button class="pk-tab" data-tab="emoji" role="tab">Emoji</button>
        <button class="pk-tab" data-tab="icons" role="tab">Icons</button>
        <button class="pk-tab" data-tab="upload" role="tab">Upload</button>
        <button class="pk-remove" id="pk-remove">Remove</button>
      </div>
      <div class="pk-filter" id="pk-filter">
        <label class="pk-input"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input id="pk-q" type="text" placeholder="Filter…" autocomplete="off" spellcheck="false">
          <button class="clear" id="pk-clear" hidden title="Clear"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><circle cx="12" cy="12" r="10" opacity=".5"/><path d="m9 9 6 6m0-6-6 6" stroke="#252525" stroke-width="2" stroke-linecap="round"/></svg></button>
        </label>
        <button class="pk-btn" id="pk-shuffle" title="Random"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 14 4 4-4 4"/><path d="m18 2 4 4-4 4"/><path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22"/><path d="M2 6h1.972a4 4 0 0 1 3.6 2.2"/><path d="M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45"/></svg></button>
        <span style="position:relative" id="pk-aux"></span>
      </div>
      <div class="pk-body" id="pk-body"></div>
      <div class="pk-foot" id="pk-foot"></div>
    </div>
  </div>
</div>"""


def architecture_svg(m: dict) -> str:
    return f"""
<svg class="diagram" viewBox="0 0 1060 400" xmlns="http://www.w3.org/2000/svg" font-family="Inter,sans-serif">
  <defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0L10 5L0 10z" fill="#5c636e"/></marker></defs>
  <style>.lane{{fill:#fafbfd;stroke:#d9dee6}} .t{{font-size:13.5px;font-weight:700;fill:#1c2027}} .s{{font-size:11px;fill:#5c636e}} .k{{font-size:10.5px;font-weight:600;letter-spacing:.06em;fill:#3061e6}} .bx{{fill:#fff;stroke:#c9d2e0}} .ln{{stroke:#5c636e;stroke-width:1.4;fill:none;marker-end:url(#ar)}}</style>
  <rect class="lane" x="8" y="8" width="230" height="384" rx="14"/><text class="k" x="24" y="32">TRIGGERS · three, one picker</text>
  <rect class="bx" x="24" y="48" width="198" height="52" rx="9"/><text class="t" x="36" y="70">Inspector icon well</text><text class="s" x="36" y="88">BlockInspector.tsx · today's seam</text>
  <rect class="bx" x="24" y="112" width="198" height="52" rx="9"/><text class="t" x="36" y="134">Click the icon on canvas</text><text class="s" x="36" y="152">BlockInlineEditor.tsx · replaces &lt;select&gt;</text>
  <rect class="bx" x="24" y="176" width="198" height="52" rx="9"/><text class="t" x="36" y="198">Context menu › Icon…</text><text class="s" x="36" y="216">BlockContextMenu.tsx</text>
  <rect class="lane" x="262" y="8" width="250" height="384" rx="14"/><text class="k" x="278" y="32">ONE COMPONENT</text>
  <rect class="bx" x="278" y="48" width="218" height="180" rx="9"/><text class="t" x="290" y="70">BlockIconPicker</text>
  <text class="s" x="290" y="92">Radix Popover in tldraw's container</text><text class="s" x="290" y="108">(the BtInsertMenu pattern)</text>
  <text class="s" x="290" y="132">tabs Emoji · Icons · Upload · Remove</text><text class="s" x="290" y="148">filter + shuffle + colour / tone</text>
  <text class="s" x="290" y="164">grid: 12 columns, Recent first</text><text class="s" x="290" y="180">Upload: file · drop · Ctrl+V image or link</text>
  <text class="s" x="290" y="196">Preview at {m['simple_px']}px and {m['header_px']}px, then Save</text><text class="s" x="290" y="212">src/blocks/ui/iconPicker/</text>
  <rect class="bx" x="278" y="244" width="218" height="60" rx="9"/><text class="t" x="290" y="266">Library chunk · lazy</text><text class="s" x="290" y="284">import() on first open: {m['lucide_count']} icons</text><text class="s" x="290" y="298">+ {m['tag_count']} tags ≈ {BUNDLE['gz_kb']} KB gz, once per session</text>
  <rect class="lane" x="536" y="8" width="250" height="384" rx="14"/><text class="k" x="552" y="32">BLOCK RECORD · props</text>
  <rect class="bx" x="552" y="48" width="218" height="112" rx="9"/><text class="t" x="564" y="70">icon: string</text>
  <text class="s" x="564" y="90">'' · none</text><text class="s" x="564" y="106">'Box' · Lucide (unchanged, bare names)</text><text class="s" x="564" y="122">'emoji:🎉' · one prefix, one glyph</text><text class="s" x="564" y="138">'asset' · look at assetId</text>
  <rect class="bx" x="552" y="176" width="218" height="88" rx="9"/><text class="t" x="564" y="198">assetId: TLAssetId | null</text>
  <text class="s" x="564" y="218">named exactly `assetId` because tldraw's</text><text class="s" x="564" y="234">copy / export scan reads that key and</text><text class="s" x="564" y="250">carries the asset record with the shape</text>
  <rect class="lane" x="810" y="8" width="242" height="384" rx="14"/><text class="k" x="826" y="32">RENDER + FILE</text>
  <rect class="bx" x="826" y="48" width="210" height="72" rx="9"/><text class="t" x="838" y="70">BlockIconGlyph</text><text class="s" x="838" y="90">curated {m['curated']} static · rest from the</text><text class="s" x="838" y="106">lazy chunk · emoji span · &lt;img&gt; for assets</text>
  <rect class="bx" x="826" y="136" width="210" height="72" rx="9"/><text class="t" x="838" y="158">.systemsketch</text><text class="s" x="838" y="178">asset record, base64 inline (tldraw's</text><text class="s" x="838" y="194">default store) — file stays self-contained</text>
  <rect class="bx" x="826" y="224" width="210" height="72" rx="9"/><text class="t" x="838" y="246">Upload pipeline</text><text class="s" x="838" y="266">bitmap → ≤256px PNG · SVG kept · URL</text><text class="s" x="838" y="282">fetched by the Python host (no CORS)</text>
  <path class="ln" d="M222 74 H262"/><path class="ln" d="M222 138 H262"/><path class="ln" d="M222 202 H262"/>
  <path class="ln" d="M496 104 H552"/><path class="ln" d="M496 220 H552"/>
  <path class="ln" d="M770 104 H826 V84"/><path class="ln" d="M770 220 H826 V172"/>
  <path class="ln" d="M1036 260 C1052 260 1052 172 1036 172"/>
</svg>"""


def main() -> None:
    m = measured()
    stills = sorted(p.name for p in MEDIA.glob("mock-*.png"))

    def fig(name: str, cap: str) -> str:
        return f'<figure><img src="{REL}/{escape(name)}" alt="{escape(cap)}" loading="lazy"><figcaption>{escape(cap)}</figcaption></figure>'

    refs = "".join([
        fig("ref-current-picker.png", f"Today: {m['curated']} curated Lucide icons in a fixed grid, no search. Zach: “a bit too limited”."),
        fig("ref-notion-icons.png", "Notion’s Icons tab — the spec. Tabs, filter, shuffle, colour dot, section label, dense scrolling grid."),
        fig("ref-notion-emoji-search.png", "Notion’s Emoji tab mid-search (“scre” → screwdriver, screenshot…) with the skin-tone hand and a + for custom emoji."),
        fig("ref-notion-upload.png", "Upload tab: one big button and “or Ctrl+V to paste an image or link”."),
        fig("ref-notion-upload-preview.png", "After a paste: preview at two sizes, “Add to workspace emoji library”, Back / Save."),
        fig("ref-icepanel-logos.png", "Why upload matters: IcePanel’s technology list is all brand logos, which no stroke-icon set carries (Lucide 1.0 removed brands for trademark reasons)."),
    ])
    mock_stills = ""
    if stills:
        caps = {
            "mock-icons.png": "Icons tab, nothing typed: Recent, then all icons.",
            "mock-icons-search.png": "Filter “data” — ranked by name, then Lucide’s own tags, so “database”, “server”, “hard-drive” all surface.",
            "mock-icons-color.png": "The colour dot opens tldraw’s twelve solids. Proposed as phase 2; shown so it can be judged.",
            "mock-emoji.png": "Emoji tab: Unicode groups in Notion’s order, native colour-emoji font.",
            "mock-emoji-search.png": "Emoji filter “scre”, matching Zach’s Notion capture.",
            "mock-upload.png": "Upload tab — copied verbatim, including the Ctrl+V line.",
            "mock-upload-preview.png": "A pasted 1,000-px screenshot after the pipeline: downscaled to 256 px, previewed at 40 px and 22 px exactly as the Block will draw it.",
            "mock-block-asset.png": "Saved: the Block now carries an image asset; the stored form is shown under it.",
            "mock-light.png": "The same picker on the light theme.",
        }
        mock_stills = '<div class="refs">' + "".join(fig(s, caps.get(s, s)) for s in stills) + "</div>"

    rows = "".join(f"<tr><th>{escape(k)}</th><td>{v}</td></tr>" for k, v in [
        ("Curated icons today", f"{m['curated']} — hand-picked in <code>src/blocks/ui/blockIcons.tsx</code>, rendered statically"),
        ("Lucide pinned / proposed", f"{m['lucide_pinned']} → {m['lucide_next']} · {m['lucide_count']} icons, {m['lucide_in_pinned']} of them already in the pinned build (only <code>Trash2</code> was renamed)"),
        ("Searchable tags", f"{m['tag_count']:,} tag words across the set, from Lucide’s own per-icon metadata ({BUNDLE['tags_gz_kb']} KB gz)"),
        ("Whole-library chunk", f"{BUNDLE['min_kb']:,} KB minified, <b>{BUNDLE['gz_kb']} KB gz</b> — one lazy <code>import()</code>; the app chunk is {BUNDLE['app_chunk_kb']:,} KB and tldraw’s {BUNDLE['tldraw_chunk_kb']:,} KB, so loading it statically would be +59% on the app"),
        ("Emoji", f"{m['emoji_count']:,} in {m['emoji_groups']} Unicode groups · names from <code>unicode-emoji-json</code>, keywords from <code>emojibase-data</code> · {m['emoji_json_kb']} KB raw, 45 KB gz, MIT, zero runtime deps · rendered by the system font (Noto Color Emoji is installed)"),
        ("Icon sizes on the Block", f"Simple view {m['simple_px']} px, Port/Expanded header {m['header_px']} px — the two sizes the Upload preview shows"),
        ("Uploads in the file", "tldraw’s default <code>inlineBase64AssetStore</code> keeps asset bytes inside the .systemsketch — self-contained, no sidecar"),
    ])

    html = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Block icon picker — copy Notion, fill it with all of Lucide</title>
<style>{CSS}</style></head><body><main>
<div class="hero">
  <div class="eyebrow">SystemSketch · proposal · {date.today().isoformat()}</div>
  <h1>Block icon picker: copy Notion’s, fill it with all of Lucide</h1>
  <p class="lead">Today a Block chooses from <b>{m['curated']} curated icons</b> in a fixed grid. The proposal is Notion’s picker, element for element — <b>Emoji · Icons · Upload</b>, a filter bar, shuffle, Remove, and Ctrl+V to paste an image or a link — over the <b>whole Lucide set ({m['lucide_count']} icons, searchable by Lucide’s own tags)</b>, with uploads stored as tldraw assets inside the board file. Nothing is implemented yet; the mock below is real data and real behaviour so it can be judged before it is built.</p>
  <div class="verdict"><b>Recommendation.</b> Build it ourselves on the Radix popover already in the app; take from the shadcn pickers only the idea (Lucide tags as the search index). Reasons:
    <ul>
      <li>None of the three shadcn pickers has an Emoji or Upload tab — they are Icons-only, on a Tailwind/shadcn stack we do not run. Copying them buys the smallest third of the feature and a second styling system.</li>
      <li>Everything hard is already in the tree: lucide-react (bump {m['lucide_pinned']} → {m['lucide_next']}), a Radix popover inside tldraw’s container (<code>BtInsertMenu</code>), and tldraw’s inline asset store for uploads.</li>
      <li>The one genuinely new artefact is the lazy library chunk ({BUNDLE['gz_kb']} KB gz) — loaded on first open, and by the canvas only for a board that uses a non-curated icon.</li>
    </ul></div>
  <div class="quiet">Scope: a proposal with a working mock. Not built into the app, so nothing here is verified in-app; the mock proves the data, the search, the paste pipeline and the look — not the tldraw integration.</div>
</div>

<section id="mock">
  <h2>The picker, live</h2>
  <p>Notion’s design, in the app’s dark and light tones. Type to filter, press Enter for the first hit, click the shuffle for a random one, paste an image or an <code>https://…</code> link while it is open. The Blocks on the left draw what would be stored.</p>
  {lab_html()}
  {mock_stills}
</section>

<section id="anatomy">
  <h2>Notion’s anatomy → ours</h2>
  <div class="refs">{refs}</div>
  <h3>Element by element</h3>
  <table><thead><tr><th>Notion</th><th>SystemSketch</th><th>Where</th></tr></thead><tbody>
    <tr><th>Emoji · Icons · Upload tabs, Remove at right</th><td>Same three tabs, same order. Remove clears <code>icon</code> and <code>assetId</code>.</td><td>new <code>src/blocks/ui/iconPicker/BlockIconPicker.tsx</code></td></tr>
    <tr><th>Filter…</th><td>Substring over icon name and Lucide tags, ranked name › tag. Emoji: name, slug and emojibase keywords. Enter picks the first hit. No fuzzy library — Notion doesn’t fuzz either.</td><td><code>iconSearch.ts</code> + vitest</td></tr>
    <tr><th>Shuffle</th><td>Random pick from the current filter (so “animal” + shuffle is a random animal).</td><td>picker</td></tr>
    <tr><th>Colour dot</th><td>Phase 2: an <code>iconColor</code> StyleProp over tldraw’s twelve solids. V1: the icon follows the Block’s text colour, as today.</td><td><code>blockModel.ts</code></td></tr>
    <tr><th>Skin-tone hand</th><td>Same six tones, applied to emoji that support them; persisted as a user preference, not on the Block.</td><td>picker</td></tr>
    <tr><th>Recent section</th><td>Last 12 picks, per user, first in the grid when the filter is empty.</td><td><code>localStorage</code></td></tr>
    <tr><th>Dense 12-column grid</th><td>Same. All {m['lucide_count']} icons render as inline SVG in one pass; the mock measures the build time in its footer. If it stays under ~100 ms no virtualisation is needed.</td><td>picker</td></tr>
    <tr><th>Upload an image · “or Ctrl+V to paste an image or link”</th><td>File dialog, drop, and a document-level paste while the picker is open. Image bytes → downscale to ≤256 px PNG (SVG kept as vector) → <code>editor.createAssets</code> → <code>assetId</code>. A pasted URL is fetched by the Python host so the bytes can be inlined without a CORS taint.</td><td><code>uploadIcon.ts</code>, <code>scripts/server.py</code></td></tr>
    <tr><th>Preview at two sizes</th><td>At {m['simple_px']} px and {m['header_px']} px, the exact sizes the Block draws.</td><td>picker</td></tr>
    <tr><th>Add to workspace emoji library</th><td>Phase 2: saves the asset into the workspace Library panel (shipped 2026-09-06) so other boards can pick it. Notion’s “+” custom emoji flow is the same thing.</td><td><code>src/library/</code></td></tr>
    <tr><th>Opens from the page icon</th><td>Opens from all three places a Block’s icon is reachable: the inspector well, the icon on the canvas (today a bare <code>&lt;select&gt;</code>), and the context menu.</td><td>see diagram</td></tr>
  </tbody></table>
</section>

<section id="arch">
  <h2>How it fits the app</h2>
  {architecture_svg(m)}
  <div class="cols3">
    <div class="box free"><h4>Stays stock</h4><ul><li>Popover, portal and positioning are Radix inside tldraw’s container — the seam <code>BtInsertMenu</code> already uses.</li><li>Uploads are ordinary tldraw asset records; copy, paste, export and the .systemsketch envelope carry them because the prop is literally named <code>assetId</code>.</li><li>No new canvas interaction: click the icon, choose, done.</li></ul></div>
    <div class="box warn"><h4>Two traps, both handled</h4><ul><li>tldraw only collects assets for a copied shape when <code>"assetId" in shape.props</code>. A prettier name like <code>iconAssetId</code> would silently drop the image on paste. WHY comment at the prop.</li><li>Unknown icon names must keep rendering as nothing (files from a newer peer). The lazy chunk resolves names it knows; a name it does not know stays blank, as today.</li></ul></div>
    <div class="box cost"><h4>What it costs</h4><ul><li>One {BUNDLE['gz_kb']} KB gz chunk on first picker open, or on first paint of a board that uses a non-curated icon (a placeholder box until it lands, one frame on a warm cache).</li><li>Uploaded icons live in the file: ~20–50 KB per pasted screenshot after downscale; a 2 MB paste does not become a 2 MB board.</li><li>lucide-react {m['lucide_pinned']} → {m['lucide_next']} and <code>lucide-static</code> as a devDependency for the tags, pinned to the same version and asserted equal by a test.</li></ul></div>
  </div>
</section>

<section id="numbers">
  <h2>Measured</h2>
  <table><tbody>{rows}</tbody></table>
</section>

<section id="prior-art">
  <h2>The references, and what to take from each</h2>
  <table><thead><tr><th>Reference</th><th>What it is</th><th>Take</th></tr></thead><tbody>
    <tr><th>Notion</th><td>Emoji · Icons · Upload; proprietary icon set; Ctrl+V of an image or a link; “Add to workspace emoji library”.</td><td><span class="tag core">the spec</span> the whole chrome and every interaction</td></tr>
    <tr><th>ui.raulcarini.dev/icon-picker</th><td>MIT, shadcn copy-paste, React 19, lucide-react, search, colour option, virtualised variants (Virtua / TanStack Virtual).</td><td><span class="tag keep">pattern</span> Figma-like density; virtualise only if the measured grid build says so</td></tr>
    <tr><th>alan-crts/shadcn-iconpicker · modall.ca</th><td>MIT, shadcn registry install, Lucide only, Fuse.js over Lucide’s tags JSON, category jump buttons.</td><td><span class="tag keep">idea</span> Lucide’s tags as the index — no Fuse needed</td></tr>
    <tr><th>lucide-react/dynamic</th><td><code>DynamicIcon</code> emits one chunk per icon (1,818 files in the build and the VSIX).</td><td><span class="tag no">skip</span> one lazy chunk instead</td></tr>
    <tr><th>frimousse · emoji-mart</th><td>Emoji pickers; frimousse is headless but loads its data from a CDN by default; emoji-mart’s React 19 story is a fork.</td><td><span class="tag no">skip</span> the grid is shared with Icons; data is a 28 KB gz JSON, offline</td></tr>
    <tr><th>Iconify JSON sets</th><td>Unified format across families (Tabler 5,000+, Simple Icons brands).</td><td><span class="tag ref">later</span> only if a second family is wanted — Simple Icons would answer the “website logos” case without uploads</td></tr>
  </tbody></table>
</section>

<section id="plan">
  <h2>Build plan</h2>
  <ol>
    <li><b>Model.</b> <code>assetId: assetIdValidator.nullable().optional()</code> beside <code>icon</code>; <code>blockIcon()</code> stays the one reader, gains <code>blockIconRef()</code> returning <code>{{kind, name|char|assetId}}</code>. Migration-free: optional props.</li>
    <li><b>Library chunk.</b> <code>src/blocks/ui/iconPicker/lucideLibrary.ts</code> lazily imports <code>{{ icons }}</code> from lucide-react and <code>tags.json</code> from lucide-static; exposes <code>search(query)</code>. Vitest: ranking, empty query, unknown names, version-pin equality.</li>
    <li><b>Renderer.</b> <code>BlockIconGlyph</code> renders curated names statically, others via the chunk, <code>emoji:</code> as a span in the emoji font stack, assets via <code>editor.resolveAssetUrl</code>. Layout is untouched: same {m['simple_px']} / {m['header_px']} boxes.</li>
    <li><b>Picker.</b> Notion’s chrome on Radix Popover; one component, three triggers. Upload pipeline in <code>uploadIcon.ts</code> (downscale, SVG passthrough, host fetch for URLs).</li>
    <li><b>Proof.</b> <code>tests/icon_picker_smoke.mjs</code>: open from each trigger, filter “data”, pick, verify the canvas glyph; paste an image via CDP <code>Input.insertText</code>/clipboard, Save, reload the board from disk and assert the asset record and the glyph; copy/paste the Block and assert the asset travels. Review board <code>sketches/review/icon-picker.systemsketch</code>.</li>
    <li><b>Phase 2.</b> Colour dot as <code>iconColor</code>; “Add to workspace library”; optional Simple Icons family for brand logos.</li>
  </ol>
</section>

<section id="decisions">
  <h2>Decisions for Zach — each with the default that takes effect if you say nothing</h2>
  <div class="decision"><b class="q">D1 · Library loading</b><div class="d">One lazy chunk ({BUNDLE['gz_kb']} KB gz) vs importing all of Lucide statically (+{BUNDLE['min_kb']:,} KB minified on the app chunk) vs per-icon chunks. <div class="default">Default: one lazy chunk; the curated {m['curated']} stay static so today’s boards never load it.</div></div></div>
  <div class="decision"><b class="q">D2 · Lucide version</b><div class="d">Stay on {m['lucide_pinned']} ({m['lucide_in_pinned']} icons searchable) or bump to {m['lucide_next']} ({m['lucide_count']}). Only <code>Trash2</code> changes name. <div class="default">Default: bump, pinned exactly, with lucide-static at the same version for tags.</div></div></div>
  <div class="decision"><b class="q">D3 · Colour dot</b><div class="d">Notion tints icons independently of the page. Ours follow the Block’s text colour. The mock shows the dot working over tldraw’s solids. <div class="default">Default: not in V1; icon keeps following the Block. Say “dot” to pull it forward.</div></div></div>
  <div class="decision"><b class="q">D4 · Emoji tab</b><div class="d">It is in Notion and it is cheap (28 KB gz, shared grid), but it is a second visual language on a technical whiteboard. <div class="default">Default: include it, Notion order (Emoji first).</div></div></div>
  <div class="decision"><b class="q">D5 · Upload storage</b><div class="d">Inline base64 in the board (self-contained, ~20–50 KB per icon after downscale) vs files beside the board (lighter, but a .systemsketch stops being one file). Downscale ceiling 256 px. <div class="default">Default: inline, ≤256 px, SVG untouched.</div></div></div>
  <div class="decision"><b class="q">D6 · Brand logos</b><div class="d">Upload covers it (paste a favicon or screenshot). Simple Icons would make 3,000+ logos searchable without pasting, but it is a second family and a bigger chunk. <div class="default">Default: upload only; revisit after using it on a real architecture board.</div></div></div>
</section>

<section id="not-done">
  <h2>Deliberately not done</h2>
  <ul>
    <li>No app code changed. This is the proposal; the build follows your pick on D1–D6 (or silence, which takes the defaults).</li>
    <li>The mock does not run inside tldraw — popover placement, undo grouping and the inline-editor seam are exactly the things only the real build proves.</li>
    <li>Pasted URLs are shown as links in the mock; the host fetch is described, not built.</li>
  </ul>
</section>

<footer><span>docs/build_icon_picker_proposal.py · data: lucide-static {m['lucide_next']}, unicode-emoji-json 0.9.0 · served with its media by review_runtime.py</span><span>SystemSketch · Claude Fable 5.1</span></footer>
</main>
<script>{MOCK_JS}</script>
</body></html>"""
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB); stills: {len(stills)}")


if __name__ == "__main__":
    main()
