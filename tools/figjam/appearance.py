"""Walk every control in FigJam's selection menu and record the popover behind it.

For each subject (connector, shape, shape with text, text object) this opens each
control in turn, screenshots the panel, and dumps what is inside it — labels,
pressed state, geometry, and every swatch's colour as hex — so the inventory
comes from the DOM rather than from counting pixels in a screenshot.
"""
import asyncio, base64, json, os, sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import attach, SHOTS

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "appearance")
os.makedirs(OUT, exist_ok=True)
RESULTS = os.path.join(OUT, "inventory.json")

MENU_SELECTOR = '[role=toolbar][aria-label="Selection Properties Menu"]'

# Every control in the pill, in visual order.
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
      role: el.getAttribute('role'),
      expandsPopover: el.getAttribute('aria-haspopup') || null,
      pressed: el.getAttribute('aria-pressed'),
      x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2),
      w: +r.width.toFixed(1), h: +r.height.toFixed(1),
    }})
  }})
  return {{ menu: {{ x: +rect.x.toFixed(1), y: +rect.y.toFixed(1),
                    w: +rect.width.toFixed(1), h: +rect.height.toFixed(1) }},
           controls }}
}})()
"""

# The dark surfaces that are not the pill itself: FigJam's popovers.
POPOVER_JS = f"""
(() => {{
  const menu = document.querySelector('{MENU_SELECTOR}')
  const hex = (value) => {{
    const m = (value || '').match(/rgba?\\(([^)]+)\\)/)
    if (!m) return value || null
    const [r, g, b, a] = m[1].split(',').map((n) => parseFloat(n))
    if (a !== undefined && a < 0.02) return 'transparent'
    const to = (n) => Math.round(n).toString(16).padStart(2, '0')
    return '#' + to(r) + to(g) + to(b)
  }}
  const panels = []
  document.querySelectorAll('body *').forEach((el) => {{
    const style = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    if (r.width < 60 || r.height < 24) return
    if (style.backgroundColor !== 'rgb(30, 30, 30)') return
    if (menu && (el === menu || el.contains(menu) || menu.contains(el))) return
    panels.push(el)
  }})
  // keep only the outermost of any nested pair
  const outer = panels.filter((el) => !panels.some((other) => other !== el && other.contains(el)))
  return outer.map((el) => {{
    const r = el.getBoundingClientRect()
    const items = []
    el.querySelectorAll('button,[role=button],[role=radio],[role=menuitem],[role=menuitemradio],[role=option],[role=switch],input').forEach((item) => {{
      const ir = item.getBoundingClientRect()
      if (ir.width < 4) return
      const s = getComputedStyle(item)
      // a swatch paints its colour on itself or on a single child
      const child = item.firstElementChild ? getComputedStyle(item.firstElementChild) : null
      items.push({{
        label: item.getAttribute('aria-label') || item.getAttribute('title')
               || (item.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 30) || null,
        role: item.getAttribute('role'),
        checked: item.getAttribute('aria-checked') ?? item.getAttribute('aria-selected')
                 ?? item.getAttribute('aria-pressed'),
        swatch: hex(s.backgroundColor) !== 'transparent' && hex(s.backgroundColor) !== '#1e1e1e'
                ? hex(s.backgroundColor)
                : (child ? hex(child.backgroundColor) : null),
        x: +(ir.x - r.x).toFixed(1), y: +(ir.y - r.y).toFixed(1),
        w: +ir.width.toFixed(1), h: +ir.height.toFixed(1),
        radius: s.borderRadius,
      }})
    }})
    const style = getComputedStyle(el)
    return {{
      cls: (typeof el.className === 'string' ? el.className : '').slice(0, 60),
      role: el.getAttribute('role'), label: el.getAttribute('aria-label'),
      x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
      radius: style.borderRadius, padding: style.padding, gap: style.gap,
      text: (el.innerText || '').replace(/\\s+/g, ' ').slice(0, 120),
      items,
    }}
  }})
}})()
"""


async def shot(page, name, clip=None):
    params = {"format": "png"}
    if clip:
        x, y, w, h = clip
        params["clip"] = {"x": max(0, x), "y": max(0, y), "width": w, "height": h, "scale": 2}
    result = await page.send("Page.captureScreenshot", **params)
    path = os.path.join(OUT, f"{name}.png")
    with open(path, "wb") as handle:
        handle.write(base64.b64decode(result["data"]))
    return path


async def escape(page, times=1):
    for _ in range(times):
        await page.key("Escape", "Escape", windows_code=27)
        await asyncio.sleep(0.3)


def save(record):
    data = json.load(open(RESULTS)) if os.path.exists(RESULTS) else {}
    data.setdefault(record["subject"], {})[record["control"]] = record
    json.dump(data, open(RESULTS, "w"), indent=1)


async def walk(page, subject, skip=()):
    """Open every control in the current pill and record what appears."""
    state = await page.evaluate(CONTROLS_JS)
    if not state:
        print(f"  !! no selection menu for {subject}")
        return []
    print(f"  {subject}: {len(state['controls'])} controls "
          f"({', '.join(c['label'] for c in state['controls'])})")
    await shot(page, f"{subject}-00-menu",
               (state["menu"]["x"] - 20, state["menu"]["y"] - 20,
                state["menu"]["w"] + 40, state["menu"]["h"] + 40))

    found = []
    for index, control in enumerate(state["controls"], start=1):
        label = control["label"] or f"control{index}"
        if label in skip:
            continue
        slug = "".join(ch if ch.isalnum() else "-" for ch in label.lower()).strip("-")[:34]
        # No Escape before the click: with no popover open, Escape clears the
        # selection and the pill goes with it.
        await page.click(control["x"], control["y"])
        await asyncio.sleep(1.0)
        panels = await page.evaluate(POPOVER_JS)
        name = f"{subject}-{index:02d}-{slug}"
        if panels:
            panel = max(panels, key=lambda p: p["w"] * p["h"])
            await shot(page, name, (panel["x"] - 16, panel["y"] - 16, panel["w"] + 32, panel["h"] + 32))
            print(f"    {label:34} -> {panel['w']:.0f}x{panel['h']:.0f}, {len(panel['items'])} items")
        else:
            panel = None
            await shot(page, name)
            print(f"    {label:34} -> no popover (direct toggle)")
        record = {"subject": subject, "control": label, "index": index,
                  "trigger": control, "panel": panel, "shot": os.path.basename(name) + ".png"}
        save(record)
        found.append(record)
        await escape(page)          # closes the popover, leaving the pill up
        still = await page.evaluate(f"Boolean(document.querySelector('{MENU_SELECTOR}'))")
        if not still:
            print("    !! selection lost after", label)
            break
    return found
