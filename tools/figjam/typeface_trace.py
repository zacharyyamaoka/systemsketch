"""The Typeface and Text alignment popovers, as DOM trees: row structure and cell geometry."""
import asyncio, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import attach
from appearance import escape, shot
from chrome_trace import MENU_TREE_JS, open_control

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "appearance", "typeface-traced.json")


async def main():
    page, _ = await attach("figma.com")
    await escape(page, 2)
    await page.click(760, 420)
    await asyncio.sleep(1.2)
    out = {"typeface": await open_control(page, "Typeface")}
    await shot(page, "typeface-popover")
    await escape(page)
    await asyncio.sleep(0.6)
    out["alignment"] = await open_control(page, "Text alignment")
    await escape(page)
    json.dump(out, open(OUT, "w"), indent=1)
    print("wrote", OUT)


if __name__ == "__main__":
    asyncio.run(main())
