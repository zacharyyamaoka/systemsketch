"""What FigJam shows once a shape carries a custom colour.

Run after `chrome_trace.py` has typed a hex into the picker: re-select the
shape, read the pill (which swatch the Change color trigger shows) and the
palette (which cell is ringed, what the Custom disc looks like now).
"""
import asyncio, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import attach
from appearance import escape, shot
from chrome_trace import MENU_TREE_JS, open_control

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "appearance", "custom-state-traced.json")


async def main():
    page, _ = await attach("figma.com")
    await escape(page, 2)
    await page.click(760, 420)
    await asyncio.sleep(1.2)
    out = {"menu": await page.evaluate(MENU_TREE_JS)}
    await shot(page, "custom-state-pill")
    out["changeColor"] = await open_control(page, "Change color")
    await shot(page, "custom-state-palette")
    await escape(page)
    json.dump(out, open(OUT, "w"), indent=1)
    print("wrote", OUT)


if __name__ == "__main__":
    asyncio.run(main())
