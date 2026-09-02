"""Minimal Chrome DevTools Protocol driver for the off-screen FigJam capture."""
import asyncio, base64, json, os, sys, urllib.request
import websockets

PORT = int(os.environ.get("CDP_PORT", "9334"))
SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shots")
os.makedirs(SHOTS, exist_ok=True)


def targets():
    with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json") as response:
        return json.load(response)


def page_target(url_contains=None):
    pages = [t for t in targets() if t["type"] == "page"]
    if url_contains:
        pages = [t for t in pages if url_contains in t["url"]] or pages
    if not pages:
        raise RuntimeError("no page targets")
    return pages[0]


class Page:
    def __init__(self, socket):
        self.socket = socket
        self.next_id = 0
        self.events = []

    async def send(self, method, **params):
        self.next_id += 1
        message_id = self.next_id
        await self.socket.send(json.dumps({"id": message_id, "method": method, "params": params}))
        while True:
            raw = json.loads(await self.socket.recv())
            if raw.get("id") == message_id:
                if "error" in raw:
                    raise RuntimeError(f"{method}: {raw['error']}")
                return raw.get("result", {})
            self.events.append(raw)

    async def evaluate(self, expression, await_promise=True):
        result = await self.send(
            "Runtime.evaluate",
            expression=expression,
            returnByValue=True,
            awaitPromise=await_promise,
            userGesture=True,
        )
        if "exceptionDetails" in result:
            return {"__error__": str(result["exceptionDetails"])[:400]}
        return result.get("result", {}).get("value")

    async def screenshot(self, name, clip=None):
        params = {"format": "png", "captureBeyondViewport": False}
        if clip:
            x, y, w, h = clip
            params["clip"] = {"x": x, "y": y, "width": w, "height": h, "scale": 1}
        result = await self.send("Page.captureScreenshot", **params)
        path = os.path.join(SHOTS, f"{name}.png")
        with open(path, "wb") as handle:
            handle.write(base64.b64decode(result["data"]))
        print("shot:", path)
        return path

    async def mouse(self, action, x, y, button="left", clicks=1, modifiers=0):
        await self.send(
            "Input.dispatchMouseEvent",
            type=action, x=x, y=y, button=button, clickCount=clicks,
            modifiers=modifiers, buttons=1 if action == "mouseMoved" and button != "none" else 0,
        )

    async def click(self, x, y, button="left", clicks=1, modifiers=0):
        await self.send("Input.dispatchMouseEvent", type="mouseMoved", x=x, y=y, modifiers=modifiers)
        await asyncio.sleep(0.12)
        await self.send("Input.dispatchMouseEvent", type="mousePressed", x=x, y=y,
                        button=button, clickCount=clicks, modifiers=modifiers)
        await asyncio.sleep(0.06)
        await self.send("Input.dispatchMouseEvent", type="mouseReleased", x=x, y=y,
                        button=button, clickCount=clicks, modifiers=modifiers)

    async def wheel(self, x, y, dx=0, dy=0):
        await self.send("Input.dispatchMouseEvent", type="mouseWheel", x=x, y=y,
                        deltaX=dx, deltaY=dy, modifiers=0)

    async def drag(self, x1, y1, x2, y2, steps=14):
        await self.send("Input.dispatchMouseEvent", type="mouseMoved", x=x1, y=y1)
        await self.send("Input.dispatchMouseEvent", type="mousePressed", x=x1, y=y1,
                        button="left", clickCount=1)
        for step in range(1, steps + 1):
            await self.send(
                "Input.dispatchMouseEvent", type="mouseMoved",
                x=x1 + (x2 - x1) * step / steps, y=y1 + (y2 - y1) * step / steps,
                button="left", buttons=1,
            )
            await asyncio.sleep(0.02)
        await self.send("Input.dispatchMouseEvent", type="mouseReleased", x=x2, y=y2,
                        button="left", clickCount=1)

    async def key(self, key_name, code=None, text=None, modifiers=0, windows_code=0):
        common = {"key": key_name, "code": code or key_name, "modifiers": modifiers,
                  "windowsVirtualKeyCode": windows_code, "nativeVirtualKeyCode": windows_code}
        await self.send("Input.dispatchKeyEvent", type="keyDown",
                        **({**common, "text": text} if text else common))
        await self.send("Input.dispatchKeyEvent", type="keyUp", **common)

    async def type_text(self, text):
        for character in text:
            await self.send("Input.dispatchKeyEvent", type="keyDown", text=character, key=character)
            await self.send("Input.dispatchKeyEvent", type="keyUp", key=character)
            await asyncio.sleep(0.02)


async def attach(url_contains=None):
    target = page_target(url_contains)
    socket = await websockets.connect(target["webSocketDebuggerUrl"], max_size=64 * 1024 * 1024)
    page = Page(socket)
    await page.send("Page.enable")
    await page.send("Runtime.enable")
    return page, target
