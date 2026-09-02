"""Read FigJam's colour palette: each swatch's name from its tooltip, its hex from the pixels."""
import asyncio, base64, json, os, sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image
from cdp import attach
from appearance import POPOVER_JS, OUT
from subjects import clear, draw_shape

TOOLTIP_JS = """
(() => {
  const seen = []
  document.querySelectorAll('body *').forEach((el) => {
    const s = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    if (r.width < 20 || r.height < 14 || r.height > 40) return
    if (s.position !== 'absolute' && s.position !== 'fixed') return
    const text = (el.innerText || '').trim()
    if (!text || text.length > 24 || el.children.length > 1) return
    if (s.backgroundColor === 'rgba(0, 0, 0, 0)') return
    seen.push({ text, y: Math.round(r.y), bg: s.backgroundColor })
  })
  return seen
})()
"""


async def open_fill(page):
    hit = await page.evaluate("""
      (() => {
        const menu = document.querySelector('[role=toolbar][aria-label="Selection Properties Menu"]')
        if (!menu) return null
        const b = [...menu.querySelectorAll('button,[role=button]')]
          .find((x) => /change color/i.test(x.getAttribute('aria-label') || ''))
        if (!b) return null
        const r = b.getBoundingClientRect()
        return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]
      })()
    """)
    await page.click(*hit)
    await asyncio.sleep(1.2)
    panels = await page.evaluate(POPOVER_JS)
    return max(panels, key=lambda p: p["w"] * p["h"])


async def main():
    page, _ = await attach("figma.com")
    await clear(page)
    await draw_shape(page)
    panel = await open_fill(page)
    print("panel", panel["w"], "x", panel["h"], "at", panel["x"], panel["y"])

    # Grid geometry read off the panel: 11 columns, 32px pitch, two rows.
    rows = sorted({round(item["y"]) for item in panel["items"] if abs(item["w"] - 24) < 1})
    print("swatch rows at y =", rows)

    result = []
    for row_index, row_y in enumerate(rows):
        for column in range(11):
            sx = panel["x"] + 12 + 32 * column + 12
            sy = panel["y"] + row_y + 12
            await page.send("Input.dispatchMouseEvent", type="mouseMoved", x=sx, y=sy)
            await asyncio.sleep(0.7)
            tips = await page.evaluate(TOOLTIP_JS)
            name = tips[0]["text"] if tips else None
            result.append({"row": row_index + 1, "column": column + 1, "name": name})
            print(f"  r{row_index + 1}c{column + 1:<2} {name}")

    json.dump(result, open(os.path.join(OUT, "palette-names.json"), "w"), indent=1)

asyncio.run(main())
