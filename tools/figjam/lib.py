"""Shared helpers for driving the off-screen FigJam board (CSS px == screenshot px)."""
import asyncio, json, sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import attach

# Measured from the live toolbelt via aria-label, viewport 1680x857 @ dpr 1.
TOOL = {
    "select": (571, 821),
    "hand": (611, 821),
    "marker": (668, 825),
    "sticky": (732, 825),
    "shapes": (804, 825),
    "text": (869, 821),
    "section": (909, 821),
    "table": (949, 821),
    "stamp": (989, 821),
    "comment": (1029, 821),
    "actions": (1069, 821),
    "widgets": (1109, 821),
}
TOOLBELT = (547, 797, 586, 48)

# Every panel that floats above the canvas, with the geometry a spec needs.
PROBE = r"""
(() => {
  const belt = document.querySelector('[role=toolbar][aria-label=Editor]');
  const out = [];
  document.querySelectorAll('body *').forEach((el) => {
    if (el === belt || (belt && belt.contains(el))) return;
    const rect = el.getBoundingClientRect();
    if (rect.width < 60 || rect.height < 24 || rect.height > 520) return;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.opacity === '0' || style.display === 'none') return;
    if (style.boxShadow === 'none') return;
    if (style.position !== 'absolute' && style.position !== 'fixed' && style.position !== 'relative') return;
    // keep only the outermost shadowed box of each stack
    out.push({
      cls: (typeof el.className === 'string' ? el.className : '').slice(0, 70),
      role: el.getAttribute('role'), label: el.getAttribute('aria-label'),
      x: Math.round(rect.x), y: Math.round(rect.y),
      w: Math.round(rect.width), h: Math.round(rect.height),
      radius: style.borderRadius, bg: style.backgroundColor,
      shadow: style.boxShadow.slice(0, 120),
      pad: style.padding, gap: style.gap, z: style.zIndex, pos: style.position,
      text: (el.innerText || '').replace(/\s+/g, ' ').slice(0, 90),
    });
  });
  return out;
})()
"""

# Buttons inside a given popup rect, so the spec can list the actual affordances.
ITEMS = r"""
(rectJson) => {}
"""


async def board():
    page, _ = await attach("figma.com")
    return page


async def probe(page):
    return await page.evaluate(PROBE)


async def popups(page):
    """Only the floating panels that are not the title bar / share bar / toolbelt."""
    found = await probe(page)
    if isinstance(found, str) or found is None:
        return []
    skip = ("collapsed_left_panel", "floating_panel--container", "zoom_controls")
    return [p for p in found if not any(s in (p["cls"] or "") for s in skip)]


async def items_in(page, x, y, w, h):
    expression = f"""
      (() => {{
        const inside = (r) => r.x >= {x - 4} && r.y >= {y - 4} &&
                              r.right <= {x + w + 4} && r.bottom <= {y + h + 4};
        const out = [];
        document.querySelectorAll('button,[role=button],[role=radio],[role=menuitem],[role=menuitemcheckbox],[role=switch]').forEach((el) => {{
          const r = el.getBoundingClientRect();
          if (r.width < 4 || !inside(r)) return;
          out.push({{ label: el.getAttribute('aria-label') || (el.innerText || '').trim().slice(0, 28),
                      x: Math.round(r.x), y: Math.round(r.y),
                      w: Math.round(r.width), h: Math.round(r.height) }});
        }});
        return out;
      }})()
    """
    return await page.evaluate(expression)


async def escape(page, times=1):
    for _ in range(times):
        await page.key("Escape", "Escape", windows_code=27)
        await asyncio.sleep(0.35)


async def select_all_delete(page):
    await escape(page)
    await page.click(300, 400)
    await escape(page)
    await page.key("a", "KeyA", modifiers=2, windows_code=65)
    await asyncio.sleep(0.5)
    await page.key("Delete", "Delete", windows_code=46)
    await asyncio.sleep(0.6)
    await escape(page)


async def use_tool(page, name):
    await page.click(*TOOL[name])
    await asyncio.sleep(0.7)


def dump(label, data):
    print(f"--- {label} ---")
    print(json.dumps(data, indent=1))
