"""Trace what `icon_trace.py` cannot see: the pill's own chrome.

The icon tracer hovers option cells inside popovers. Three things live outside
those cells and were still being approximated: the fixed icons on the pill's
triggers (Line style's three bars, Typeface's "Aa"), the Custom cell and the
picker behind it, and the exact box a popover cell and its divider occupy. All
of it is in the DOM, so this reads it there — geometry relative to its panel,
computed colours, radii, fonts, and any SVG's path data — and writes one JSON
the copy can be checked against.

Usage: CDP_PORT=9333 python3 chrome_trace.py
"""
import asyncio, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import attach
from appearance import escape, MENU_SELECTOR, POPOVER_JS, shot
from subjects import board, clear, draw_connector, draw_shape

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "appearance", "chrome-traced.json")

# One node of the tree: enough computed style to rebuild it, plus its SVG.
DUMP_JS = """
const pseudo = (el, which) => {
  const p = getComputedStyle(el, which)
  if (p.content === 'none' || p.content === 'normal') return undefined
  return { content: p.content, bg: p.backgroundColor, bgImage: p.backgroundImage, bgSize: p.backgroundSize, w: p.width, h: p.height,
           radius: p.borderRadius, shadow: p.boxShadow.slice(0, 160), inset: `${p.top} ${p.right} ${p.bottom} ${p.left}` }
}
const dumpTree = (root, cap) => {
  const base = root.getBoundingClientRect()
  let count = 0
  const dump = (el, depth) => {
    const r = el.getBoundingClientRect()
    const s = getComputedStyle(el)
    const tag = el.tagName.toLowerCase()
    const node = {
      tag, role: el.getAttribute('role'),
      label: el.getAttribute('aria-label') || el.getAttribute('title') || null,
      checked: el.getAttribute('aria-checked') ?? el.getAttribute('aria-selected') ?? el.getAttribute('aria-pressed'),
      x: +(r.x - base.x).toFixed(1), y: +(r.y - base.y).toFixed(1),
      w: +r.width.toFixed(1), h: +r.height.toFixed(1),
      bg: s.backgroundColor, bgImage: s.backgroundImage,
      before: pseudo(el, '::before'), after: pseudo(el, '::after'),
      radius: s.borderRadius, border: s.border, outline: s.outline,
      shadow: s.boxShadow.slice(0, 160), color: s.color, opacity: s.opacity,
      font: `${s.fontSize} / ${s.fontWeight} ${s.fontFamily.split(',')[0]}`,
      padding: s.padding, margin: s.margin, gap: s.gap, display: s.display,
      text: el.children.length === 0 ? (el.textContent || '').trim().slice(0, 60) || undefined : undefined,
      value: tag === 'input' ? el.value : undefined,
      type: tag === 'input' ? el.type : undefined,
      svg: tag === 'svg'
        ? { viewBox: el.getAttribute('viewBox'), fill: s.fill, stroke: s.stroke, inner: el.innerHTML.slice(0, 6000) }
        : undefined,
      children: [],
    }
    if (tag !== 'svg' && depth < 9) {
      for (const child of el.children) {
        if (count++ > cap) break
        node.children.push(dump(child, depth + 1))
      }
    }
    return node
  }
  return dump(root, 0)
}
"""

PANELS_TREE_JS = f"""
(() => {{
  {DUMP_JS}
  const menu = document.querySelector('{MENU_SELECTOR}')
  const panels = []
  document.querySelectorAll('body *').forEach((el) => {{
    const style = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    if (r.width < 60 || r.height < 24) return
    if (style.backgroundColor !== 'rgb(30, 30, 30)') return
    if (menu && (el === menu || el.contains(menu) || menu.contains(el))) return
    panels.push(el)
  }})
  const outer = panels.filter((el) => !panels.some((other) => other !== el && other.contains(el)))
  return outer.map((el) => {{
    const r = el.getBoundingClientRect()
    return {{ x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
             tree: dumpTree(el, 600) }}
  }})
}})()
"""

MENU_TREE_JS = f"""
(() => {{
  {DUMP_JS}
  const menu = document.querySelector('{MENU_SELECTOR}')
  if (!menu) return null
  const r = menu.getBoundingClientRect()
  return {{ x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
           tree: dumpTree(menu, 400) }}
}})()
"""

TRIGGER_JS = """
((needle) => {
  const menu = document.querySelector('[role=toolbar][aria-label="Selection Properties Menu"]')
  if (!menu) return null
  const b = [...menu.querySelectorAll('button,[role=button],[role=combobox]')]
    .find((x) => (x.getAttribute('aria-label') || '').toLowerCase().startsWith(needle.toLowerCase()))
  if (!b) return null
  const r = b.getBoundingClientRect()
  return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]
})
"""

CELL_JS = """
((needle) => {
  const el = [...document.querySelectorAll('body *')]
    .find((x) => (x.getAttribute('aria-label') || x.getAttribute('title') || '') === needle)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]
})
"""


async def open_control(page, needle):
    hit = await page.evaluate(f"({TRIGGER_JS})({json.dumps(needle)})")
    if not hit:
        print(f"  !! no trigger starting with {needle!r}")
        return None
    await page.click(*hit)
    await asyncio.sleep(1.2)
    panels = await page.evaluate(PANELS_TREE_JS)
    if not panels:
        print(f"  !! no popover for {needle!r}")
        return None
    panel = max(panels, key=lambda p: p["w"] * p["h"])
    print(f"  {needle:14} -> {panel['w']}x{panel['h']}")
    return panel


async def main():
    page = await board()
    out = {}

    print("== connector")
    await clear(page)
    await draw_connector(page)
    out["connector"] = {"menu": await page.evaluate(MENU_TREE_JS)}
    await shot(page, "chrome-connector-pill")
    out["connector"]["lineStyle"] = await open_control(page, "Line style")
    await shot(page, "chrome-connector-line-style")
    await escape(page)
    await asyncio.sleep(0.6)

    print("== shape-text")
    await clear(page)
    await draw_shape(page)
    await page.click(760, 420, clicks=2)
    await asyncio.sleep(1.0)
    await page.send("Input.insertText", text="Text")
    await asyncio.sleep(1.0)
    await escape(page)
    await asyncio.sleep(1.0)
    out["shape-text"] = {"menu": await page.evaluate(MENU_TREE_JS)}
    await shot(page, "chrome-shape-text-pill")

    out["shape-text"]["lineStyle"] = await open_control(page, "Line style")
    await escape(page)
    await asyncio.sleep(0.6)

    out["shape-text"]["fontSize"] = await open_control(page, "Font size")
    await shot(page, "chrome-font-size")
    await escape(page)
    await asyncio.sleep(0.6)

    palette = await open_control(page, "Change color")
    out["shape-text"]["changeColor"] = palette
    custom = await page.evaluate(f"({CELL_JS})('Custom')")
    print("  Custom cell at", custom)
    if custom:
        await page.click(*custom)
        await asyncio.sleep(1.4)
        panels = await page.evaluate(PANELS_TREE_JS)
        out["shape-text"]["picker"] = panels
        for panel in panels:
            print(f"  picker panel {panel['w']}x{panel['h']} at {panel['x']},{panel['y']}")
        await shot(page, "chrome-custom-picker")
        # A wider frame so the picker's place relative to the palette is on record.
        field = await page.evaluate("(() => { const i = document.querySelector('input[value^=\"#\"]'); if (!i) return null; const r = i.getBoundingClientRect(); return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)] })()")
    print('  hex field at', field)
    await shot(page, "chrome-custom-picker-context",
                   (min(p["x"] for p in panels) - 24, min(p["y"] for p in panels) - 24,
                    max(p["x"] + p["w"] for p in panels) - min(p["x"] for p in panels) + 48,
                    max(p["y"] + p["h"] for p in panels) - min(p["y"] for p in panels) + 48))
    if field:
        await page.click(*field, clicks=3)
        await asyncio.sleep(0.3)
        await page.send("Input.insertText", text="A3F2C1")
        await page.key("Enter", "Enter", windows_code=13)
        await asyncio.sleep(1.0)
        out["shape-text"]["pickerAfterHex"] = await page.evaluate(PANELS_TREE_JS)
        await shot(page, "chrome-custom-picker-after-hex")
        await escape(page, 2)
        await asyncio.sleep(0.6)
        out["shape-text"]["menuAfterHex"] = await page.evaluate(MENU_TREE_JS)
        out["shape-text"]["changeColorAfterHex"] = await open_control(page, "Change color")
        await shot(page, "chrome-palette-after-hex")
    await escape(page, 2)

    json.dump(out, open(OUT, "w"), indent=1)
    print("wrote", OUT)


if __name__ == "__main__":
    asyncio.run(main())
