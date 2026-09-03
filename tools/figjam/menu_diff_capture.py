"""Resting-pill screenshots for the SystemSketch-vs-FigJam contextual menu diff
report (2026-09-03): Rectangle, Rectangle+text, Line, Line+text, Arrow,
Arrow+text — six comparable states, one full-viewport screenshot each, plus
the pill's own control list read from the DOM.

FigJam has no separate Line tool: subjects.py's `connector` is a single tool
whose Start/End point controls choose the arrowhead per end. "Line" here is
that same connector with both ends set to "None" — never captured before
(see the 2026-09-03 menu-diff research). "Arrow" is the connector's default
end state, untouched.

Usage: CDP_PORT=9333 python3 menu_diff_capture.py
"""
import asyncio, json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from appearance import shot, escape  # noqa: E402
from subjects import board, clear, draw_shape, draw_connector  # noqa: E402

OUT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "docs", "assets"))
os.makedirs(OUT, exist_ok=True)
DATE = "2026-09-03"
MENU_SELECTOR = '[role=toolbar][aria-label="Selection Properties Menu"]'

CONTROLS_JS = f"""
(() => {{
  const menu = document.querySelector('{MENU_SELECTOR}')
  if (!menu) return null
  const rect = menu.getBoundingClientRect()
  const controls = []
  menu.querySelectorAll('button,[role=button],[role=combobox],[role=radio],[role=switch]').forEach((el) => {{
    const r = el.getBoundingClientRect()
    if (r.width < 4) return
    controls.push({{
      label: el.getAttribute('aria-label') || (el.innerText || '').trim().slice(0, 30),
      x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2),
      w: +r.width.toFixed(1), h: +r.height.toFixed(1),
    }})
  }})
  return {{ menu: {{ x: +rect.x.toFixed(1), y: +rect.y.toFixed(1),
                    w: +rect.width.toFixed(1), h: +rect.height.toFixed(1) }},
           controls }}
}})()
"""


async def read_controls(page):
    return await page.evaluate(CONTROLS_JS)


async def find_control(page, label_substr):
    state = await read_controls(page)
    if not state:
        return None
    for c in state["controls"]:
        if label_substr.lower() in (c["label"] or "").lower():
            return c
    return None


POPOVER_PANEL_JS = f"""
(() => {{
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
  if (!outer.length) return null
  const el = outer[0]
  const r = el.getBoundingClientRect()
  const items = [...el.querySelectorAll('div')].filter((n) => {{
    const ir = n.getBoundingClientRect()
    return ir.width >= 20 && ir.width <= 30 && ir.height >= 20 && ir.height <= 30 && n.children.length <= 1
  }})
  return JSON.stringify({{
    text: (el.innerText || '').replace(/\\s+/g, ' ').trim(),
    items: items.map((n) => {{
      const ir = n.getBoundingClientRect()
      return {{ x: Math.round(ir.x + ir.width / 2), y: Math.round(ir.y + ir.height / 2) }}
    }}),
  }})
}})()
"""


async def set_endpoint(page, control_label, option_index, option_word):
    """FigJam's endpoint cells are unlabelled divs — pick by position instead.

    The popover's own `innerText` lists every option in order (e.g. "End point
    None Line arrow Solid arrow ..."), so `option_word` is asserted against
    that text as a sanity check that the index still points at "None".
    """
    control = await find_control(page, control_label)
    if not control:
        print(f"  !! no '{control_label}' control")
        return False
    await page.click(control["x"], control["y"])
    await asyncio.sleep(0.7)
    raw = await page.evaluate(POPOVER_PANEL_JS)
    if not raw:
        print(f"  !! no popover under {control_label}")
        await escape(page)
        return False
    panel = json.loads(raw)
    if option_word.lower() not in panel["text"].lower():
        print(f"  !! '{option_word}' not in {control_label} popover text: {panel['text']!r}")
        await escape(page)
        return False
    if option_index >= len(panel["items"]):
        print(f"  !! {control_label} popover only has {len(panel['items'])} cells")
        await escape(page)
        return False
    point = panel["items"][option_index]
    await page.click(point["x"], point["y"])
    await asyncio.sleep(0.6)
    await escape(page)
    return True


async def add_connector_label(page, text):
    control = await find_control(page, "text")
    if not control:
        print("  !! no Add text control")
        return False
    await page.click(control["x"], control["y"])
    await asyncio.sleep(0.8)
    await page.send("Input.insertText", text=text)
    await asyncio.sleep(0.6)
    await escape(page)
    await asyncio.sleep(0.6)
    return True


async def walk_popovers(page, slug):
    """Open every control's popover in turn and screenshot the full frame.

    Companion to the resting-pill shot from `capture()`: pressing a trigger
    is the only way to see whether a submenu's layout, icons and order still
    match FigJam, and nothing here asserts that automatically — these frames
    are for the judge pass to look at.
    """
    state = await read_controls(page)
    if not state:
        return
    for control in state["controls"]:
        label = control["label"]
        if not label or label in ("Inspect", "Add text"):
            continue
        await page.click(control["x"], control["y"])
        await asyncio.sleep(0.9)
        raw = await page.evaluate(POPOVER_PANEL_JS)
        panel = json.loads(raw) if raw else None
        control_slug = "".join(ch if ch.isalnum() else "-" for ch in label.lower()).strip("-")[:40]
        if panel:
            await shot(page, f"../../../docs/assets/menu-diff-figjam-{slug}-popover-{control_slug}-{DATE}")
            print(f"    popover: {label} -> {len(panel['items'])} cells")
        else:
            print(f"    (no popover, direct toggle) {label}")
        await escape(page)
        await asyncio.sleep(0.3)


async def capture(page, slug):
    state = await read_controls(page)
    if not state:
        print(f"  !! {slug}: no selection menu present, skipping capture")
        return
    labels = [c["label"] for c in state["controls"]]
    print(f"  {slug}: {len(labels)} controls -> {labels}")
    await shot(page, f"../../../docs/assets/menu-diff-figjam-{slug}-{DATE}")
    with open(os.path.join(OUT, f"menu-diff-figjam-{slug}-{DATE}.json"), "w") as handle:
        json.dump({"subject": slug, "menu": state["menu"], "controls": labels}, handle, indent=1)


async def main():
    page = await board()
    walk = "--walk" in sys.argv

    await clear(page)
    await draw_shape(page)
    await capture(page, "rectangle")
    if walk:
        await walk_popovers(page, "rectangle")

    await page.click(760, 420, clicks=2)
    await asyncio.sleep(1.0)
    await page.send("Input.insertText", text="Sort items")
    await asyncio.sleep(1.0)
    await escape(page)
    await asyncio.sleep(0.8)
    await capture(page, "rectangle-text")
    if walk:
        await walk_popovers(page, "rectangle-text")

    await clear(page)
    await draw_connector(page)
    await capture(page, "arrow")
    if walk:
        await walk_popovers(page, "arrow")

    await add_connector_label(page, "on error")
    await capture(page, "arrow-text")
    if walk:
        await walk_popovers(page, "arrow-text")

    await clear(page)
    await draw_connector(page)
    await set_endpoint(page, "End point", 0, "None")
    await capture(page, "line")
    if walk:
        await walk_popovers(page, "line")

    await add_connector_label(page, "shared state")
    await capture(page, "line-text")

    await clear(page)


if __name__ == "__main__":
    asyncio.run(main())
