"""Trace FigJam's control icons: for every option cell, its name and its SVG.

FigJam's option cells are unlabelled divs, so the meaning of an icon only comes
from its tooltip. This hovers each cell, reads the tooltip, and pulls the SVG
sitting under the cursor — so every path arrives already paired with the word
FigJam uses for it.
"""
import asyncio, json, os, sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import attach
from appearance import escape, POPOVER_JS, MENU_SELECTOR
from palette import TOOLTIP_JS
from subjects import clear, draw_shape, draw_connector

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "appearance", "icons-traced.json")

TRIGGERS_JS = """
(() => {
  const menu = document.querySelector('[role=toolbar][aria-label="Selection Properties Menu"]')
  if (!menu) return null
  return [...menu.querySelectorAll('button,[role=button]')].map((b) => {
    const r = b.getBoundingClientRect()
    return { label: b.getAttribute('aria-label'),
             x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }
  }).filter((c) => c.label && c.x > 0)
})()
"""

SVG_AT_JS = """
(([x, y]) => {
  const el = document.elementFromPoint(x, y)
  if (!el) return null
  const svg = el.closest('svg') || el.querySelector('svg')
    || (el.closest('button,[role=button],div') || el).querySelector('svg')
  if (!svg) return null
  const cs = getComputedStyle(svg)
  return { viewBox: svg.getAttribute('viewBox'), fill: cs.fill, stroke: cs.stroke,
           strokeWidth: cs.strokeWidth, linecap: cs.strokeLinecap, svg: svg.innerHTML }
})
"""


async def trace_panel(page, panel):
    """Hover every cell in an open popover; pair its tooltip with its SVG."""
    cells = [i for i in panel["items"] if i["w"] >= 16 and i["h"] >= 16]
    traced = []
    for cell in cells:
        cx = int(panel["x"] + cell["x"] + cell["w"] / 2)
        cy = int(panel["y"] + cell["y"] + cell["h"] / 2)
        await page.send("Input.dispatchMouseEvent", type="mouseMoved", x=cx, y=cy)
        await asyncio.sleep(0.65)
        tips = await page.evaluate(TOOLTIP_JS)
        art = await page.evaluate(f"({SVG_AT_JS})([{cx},{cy}])")
        traced.append({
            "name": tips[0]["text"] if tips else (cell.get("label") or None),
            "x": cell["x"], "y": cell["y"], "w": cell["w"], "h": cell["h"],
            "checked": cell.get("checked"),
            **(art or {}),
        })
    return traced


async def sweep(page, subject):
    triggers = await page.evaluate(TRIGGERS_JS)
    if not triggers:
        print(f"  !! no pill for {subject}")
        return {}
    print(f"  {subject}: {', '.join(t['label'] for t in triggers)}")
    result = {}
    for control in triggers:
        await page.click(control["x"], control["y"])
        await asyncio.sleep(1.3)
        panels = await page.evaluate(POPOVER_JS)
        if panels:
            panel = max(panels, key=lambda p: p["w"] * p["h"])
            traced = await trace_panel(page, panel)
            named = [t for t in traced if t.get("name")]
            drawn = [t for t in traced if t.get("svg")]
            result[control["label"]] = {"w": panel["w"], "h": panel["h"], "options": traced}
            print(f"    {control['label'][:32]:32} {panel['w']}x{panel['h']}  "
                  f"{len(traced)} cells, {len(named)} named, {len(drawn)} drawn")
            for t in named[:8]:
                print(f"        {t['name'][:26]:26} {t.get('viewBox') or '-'}")
        else:
            print(f"    {control['label'][:32]:32} -- no panel")
        await escape(page)
        await asyncio.sleep(0.7)
        if not await page.evaluate(f"Boolean(document.querySelector('{MENU_SELECTOR}'))"):
            print("    !! selection lost after", control["label"])
            break
    return result


async def main():
    page, _ = await attach("figma.com")
    out = {}
    for name in (sys.argv[1:] or ["connector"]):
        print(f"== {name}")
        await clear(page)
        if name == "connector":
            await draw_connector(page)
        elif name == "shape-text":
            await draw_shape(page)
            await page.click(760, 420, clicks=2)
            await asyncio.sleep(1.0)
            await page.send("Input.insertText", text="Text")
            await asyncio.sleep(1.0)
            await escape(page)
            await asyncio.sleep(1.0)
        else:
            await draw_shape(page)
        out[name] = await sweep(page, name)
    json.dump(out, open(OUT, "w"), indent=1)
    print("wrote", OUT)


asyncio.run(main())
