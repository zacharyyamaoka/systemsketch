"""Author each subject on the scratch FigJam board, then walk its menu.

Usage: subjects.py <shape|shape-text|connector|connector-text|text>
"""
import asyncio, json, sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import attach
from lib import TOOL
from appearance import walk, escape, shot

BOARD = "https://www.figma.com/board/1zvF9vVoQSN1Dkorj5dHym/Untitled"


async def board():
    page, target = await attach("figma.com")
    if "/board/" not in target["url"]:
        await page.send("Page.navigate", url=BOARD)
        await asyncio.sleep(10)
    return page


async def tool(page, name):
    await page.click(*TOOL[name])
    await asyncio.sleep(0.8)


async def close_library(page):
    await page.evaluate("""
      (() => {
        const btn = [...document.querySelectorAll('button,[role=button]')]
          .find((b) => /^close$/i.test(b.getAttribute('aria-label') || ''))
        if (btn) btn.click()
        return !!btn
      })()
    """)
    await asyncio.sleep(0.6)


async def clear(page):
    await escape(page, 2)
    await page.click(1450, 700)
    await escape(page)
    await page.key("a", "KeyA", modifiers=2, windows_code=65)
    await asyncio.sleep(0.5)
    await page.key("Delete", "Delete", windows_code=46)
    await asyncio.sleep(0.7)
    await escape(page)
    await page.key("0", "Digit0", modifiers=8, windows_code=48)
    await asyncio.sleep(0.6)


async def draw_shape(page, x1=620, y1=340, x2=900, y2=500):
    await tool(page, "shapes")
    await page.drag(x1, y1, x2, y2)
    await asyncio.sleep(1.2)
    await escape(page)
    await close_library(page)
    await escape(page)
    await page.drag(x1 - 50, y1 - 50, x2 + 50, y2 + 50, steps=10)
    await asyncio.sleep(1.2)


async def draw_connector(page):
    """Two shapes, then drag between their quick-connect dots, then select the line."""
    await draw_shape(page, 420, 380, 640, 500)
    await escape(page, 2)
    await draw_shape(page, 1000, 380, 1220, 500)
    await escape(page, 2)
    await page.click(530, 440)          # activate the left shape's connect handles
    await asyncio.sleep(0.8)
    await page.drag(661, 440, 1040, 440, steps=16)
    await asyncio.sleep(1.4)
    await escape(page)
    await asyncio.sleep(0.4)
    await page.click(820, 440)          # click the connector itself
    await asyncio.sleep(1.2)


SUBJECTS = {}
def subject(fn):
    SUBJECTS[fn.__name__.replace("_", "-")] = fn
    return fn


@subject
async def shape(page):
    await clear(page)
    await draw_shape(page)
    await walk(page, "shape")


@subject
async def shape_text(page):
    await clear(page)
    await draw_shape(page)
    # double-click the body to open the shape's own text editor
    await page.click(760, 420, clicks=2)
    await asyncio.sleep(1.0)
    await page.send("Input.insertText", text="asdasd")
    await asyncio.sleep(1.0)
    await escape(page)          # leave the editor, keep the shape selected
    await asyncio.sleep(1.0)
    await walk(page, "shape-text")


@subject
async def connector(page):
    await clear(page)
    await draw_connector(page)
    await walk(page, "connector")


@subject
async def connector_text(page):
    await clear(page)
    await draw_connector(page)
    # the pill's "T" button adds a label to the connector
    hit = await page.evaluate("""
      (() => {
        const menu = document.querySelector('[role=toolbar][aria-label="Selection Properties Menu"]')
        if (!menu) return 'no menu'
        const button = [...menu.querySelectorAll('button,[role=button]')]
          .find((b) => /text/i.test(b.getAttribute('aria-label') || ''))
        if (!button) return [...menu.querySelectorAll('button,[role=button]')]
          .map((b) => b.getAttribute('aria-label'))
        const r = button.getBoundingClientRect()
        return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]
      })()
    """)
    print("  text button:", hit)
    if isinstance(hit, list) and len(hit) == 2 and all(isinstance(v, int) for v in hit):
        await page.click(*hit)
        await asyncio.sleep(1.0)
        await page.send("Input.insertText", text="sdad")
        await asyncio.sleep(0.8)
        await escape(page)      # leave the label editor; the connector stays selected
        await asyncio.sleep(1.0)
    await walk(page, "connector-text")


@subject
async def text(page):
    await clear(page)
    await tool(page, "text")
    await page.click(700, 420)
    await asyncio.sleep(0.9)
    await page.send("Input.insertText", text="asdasdasd")
    await asyncio.sleep(0.9)
    await escape(page)
    await asyncio.sleep(1.0)
    await walk(page, "text", skip=("Start a mind map",))


async def main():
    page = await board()
    await SUBJECTS[sys.argv[1]](page)

if __name__ == "__main__":
    asyncio.run(main())
