/**
 * Shared real-browser (CDP) harness for SystemSketch smoke tests.
 *
 * Every UI claim in this repo is proven by driving the actual app in headless
 * Chrome — never by asserting against a component rendered in isolation. This
 * module owns the boring parts of that: free ports, the API + Vite servers,
 * Chrome, and a small CDP client with pointer/keyboard primitives.
 */
import { spawn } from 'node:child_process'
import { access, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import net from 'node:net'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => resolve(port))
    })
  })
}

async function executable(path) {
  try { await access(path, fsConstants.X_OK); return true } catch { return false }
}

export async function findChrome() {
  const fromPath = (process.env.PATH ?? '').split(delimiter).filter(Boolean).flatMap((dir) => [
    join(dir, 'google-chrome'), join(dir, 'google-chrome-stable'),
    join(dir, 'chromium'), join(dir, 'chromium-browser'),
  ])
  const candidates = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium', ...fromPath]
  for (const candidate of new Set(candidates.filter(Boolean))) {
    if (await executable(candidate)) return candidate
  }
  throw new Error('Chrome/Chromium was not found')
}

async function waitForDevTools(profileDir, chrome, timeoutMs = 20000) {
  const portFile = join(profileDir, 'DevToolsActivePort')
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (chrome.exitCode !== null) throw new Error(`Chrome exited before CDP was ready (${chrome.exitCode})`)
    try {
      const [line] = (await readFile(portFile, 'utf8')).trim().split(/\r?\n/)
      const port = Number(line)
      if (Number.isInteger(port) && port > 0) return port
    } catch { /* Chrome writes this after launch. */ }
    await delay(50)
  }
  throw new Error('Timed out waiting for Chrome DevTools')
}

export class Cdp {
  constructor(url) {
    this.url = url
    this.socket = null
    this.seq = 0
    this.pending = new Map()
    this.events = []
  }
  async open() {
    const socket = new WebSocket(this.url)
    this.socket = socket
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true })
      socket.addEventListener('error', (event) => reject(new Error(event.message ?? 'websocket error')), { once: true })
    })
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data))
      if (message.id === undefined) { this.events.push(message); return }
      const request = this.pending.get(message.id)
      if (!request) return
      this.pending.delete(message.id)
      if (message.error) request.reject(new Error(`${request.method}: ${message.error.message}`))
      else request.resolve(message.result ?? {})
    })
    return this
  }
  send(method, params = {}) {
    const id = ++this.seq
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }
  close() { this.socket?.close() }
}

export async function newPage(cdpPort) {
  const response = await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, {
    method: 'PUT', signal: AbortSignal.timeout(8000),
  })
  return new Cdp((await response.json()).webSocketDebuggerUrl).open()
}

export async function evaluate(page, expression) {
  const result = await page.send('Runtime.evaluate', {
    expression, awaitPromise: true, returnByValue: true, userGesture: true,
  })
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
  }
  return result.result?.value
}

export async function waitFor(page, expression, label, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try {
      if (await evaluate(page, `Boolean(${expression})`)) return
    } catch (error) { lastError = error }
    await delay(80)
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? ` (${lastError.message})` : ''}`)
}

export async function mouse(page, type, x, y, { button = 'left', buttons = 0, clickCount = 1 } = {}) {
  await page.send('Input.dispatchMouseEvent', {
    type, x, y, button, buttons,
    clickCount: type === 'mouseMoved' ? 0 : clickCount,
    pointerType: 'mouse',
  })
}

export async function clickAt(page, x, y, button = 'left') {
  await mouse(page, 'mouseMoved', x, y, { button })
  await mouse(page, 'mousePressed', x, y, { button, buttons: button === 'right' ? 2 : 1 })
  await mouse(page, 'mouseReleased', x, y, { button })
  await delay(160)
}

export async function drag(page, from, to) {
  await mouse(page, 'mouseMoved', from.x, from.y)
  await mouse(page, 'mousePressed', from.x, from.y, { buttons: 1 })
  for (let step = 1; step <= 8; step += 1) {
    await mouse(page, 'mouseMoved',
      from.x + (to.x - from.x) * step / 8,
      from.y + (to.y - from.y) * step / 8,
      { buttons: 1 })
    await delay(25)
  }
  await mouse(page, 'mouseReleased', to.x, to.y)
  await delay(240)
}

export async function key(page, key, code = key, modifiers = 0) {
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, modifiers })
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers })
  await delay(80)
}

/**
 * Send an application shortcut. tldraw's shortcut layer only matches events
 * that carry a virtual key code, which a bare `Input.dispatchKeyEvent` omits.
 */
export async function shortcut(page, key, code, modifiers = 0) {
  const virtualKeyCode = /^(Key|Digit)/.test(code)
    ? code.replace(/^(Key|Digit)/, '').charCodeAt(0)
    : undefined
  const event = { key, code, modifiers, windowsVirtualKeyCode: virtualKeyCode, nativeVirtualKeyCode: virtualKeyCode }
  await page.send('Input.dispatchKeyEvent', { ...event, type: 'rawKeyDown' })
  await page.send('Input.dispatchKeyEvent', { ...event, type: 'keyUp' })
  await delay(120)
}

/** Type one character at a time, so each character is its own edit. */
export async function typeSlowly(page, text) {
  for (const character of text) {
    await page.send('Input.insertText', { text: character })
    await delay(30)
  }
  await delay(120)
}

export async function elementBox(page, selector) {
  const value = await evaluate(page, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)})
    if (!element) return null
    const rect = element.getBoundingClientRect()
    return JSON.stringify({ x: rect.x, y: rect.y, width: rect.width, height: rect.height })
  })()`)
  if (!value) throw new Error(`Missing element ${selector}`)
  return JSON.parse(value)
}

export async function clickElement(page, selector) {
  const box = await elementBox(page, selector)
  await clickAt(page, box.x + box.width / 2, box.y + box.height / 2)
}

export async function hoverElement(page, selector) {
  const box = await elementBox(page, selector)
  await mouse(page, 'mouseMoved', box.x + box.width / 2, box.y + box.height / 2)
  await delay(320)
}

export function localConsoleErrors(page) {
  return page.events.filter((event) =>
    event.method === 'Runtime.exceptionThrown'
    || (event.method === 'Log.entryAdded'
      && event.params.entry.level === 'error'
      && (event.params.entry.url ?? '').includes('127.0.0.1')
      && !(event.params.entry.url ?? '').endsWith('/favicon.ico')))
    .map((event) => event.params.entry?.text ?? event.params.exceptionDetails?.text)
}

function python(script, args) {
  return new Promise((resolve, reject) => {
    const child = spawn('python3', ['-c', script, ...args], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout.on('data', (chunk) => { out += chunk })
    child.stderr.on('data', (chunk) => { err += chunk })
    child.on('error', reject)
    child.on('close', (code) => code === 0 ? resolve(out.trim()) : reject(new Error(err || `python exited ${code}`)))
  })
}

/**
 * Stage one real release and point Stable at it.
 *
 * A Stable channel is not a flag on the server — it is a manifest the server
 * reads back — so proving Stable chrome needs a genuine release on disk.
 */
async function stageStableRelease(releaseHome, dist) {
  await writeFile(join(dist, 'index.html'), '<!doctype html><title>SystemSketch</title>\n')
  return python(`
import sys
from pathlib import Path
sys.path.insert(0, ${JSON.stringify(join(ROOT, 'scripts'))})
from release_lib import promote_candidate, stage_candidate
build, _manifest = stage_candidate(Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]))
promote_candidate(Path(sys.argv[2]))
print(build)
`, [ROOT, releaseHome, dist])
}

/**
 * Boot the API server, Vite, and headless Chrome, then hand back a CDP page
 * plus the temp roots. Callers must call `close()` in a finally block.
 *
 * The release home is always a throwaway directory: a smoke test that reaches
 * a channel control must not be able to move the developer's real Stable.
 */
export async function startApp({
  label,
  build,
  channel = 'preview',
  width = 1440,
  height = 960,
  allowSourceRoot = false,
  cdpToApi = false,
} = {}) {
  const name = label ?? 'systemsketch-smoke'
  const port = await freePort()
  const apiPort = await freePort()
  const chromePath = await findChrome()
  const chromeProfile = await mkdtemp(join(tmpdir(), `${name}-chrome-`))
  const filesRoot = await mkdtemp(join(tmpdir(), `${name}-files-`))
  const emptyDist = await mkdtemp(join(tmpdir(), `${name}-dist-`))
  const releaseHome = await mkdtemp(join(tmpdir(), `${name}-release-`))
  const apiBuild = channel === 'stable'
    ? await stageStableRelease(releaseHome, emptyDist)
    : build ?? name

  // A journey drives a headless browser, so its controller must be headless
  // too: with a display inherited, File > Open would spawn a real GTK file
  // chooser onto the developer's screen and block until a person closed it.
  const headlessEnv = { ...process.env }
  delete headlessEnv.DISPLAY
  delete headlessEnv.WAYLAND_DISPLAY

  // Chrome first: it depends on nothing, and a journey that proves the flight
  // recorder's frames needs its DevTools port BEFORE the Python host starts,
  // the way the desktop launcher hands `--cdp-port` to the real host.
  const chrome = spawn(chromePath, [
    '--headless=new', '--disable-dev-shm-usage', '--disable-gpu', '--no-sandbox',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--remote-allow-origins=*', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
    `--user-data-dir=${chromeProfile}`, `--window-size=${width},${height}`, 'about:blank',
  ], { stdio: 'ignore' })
  let earlyCdpPort = null
  if (cdpToApi) {
    try {
      earlyCdpPort = await waitForDevTools(chromeProfile, chrome)
    } catch (error) {
      chrome.kill('SIGKILL')
      throw error
    }
  }

  const apiArguments = [
    join(ROOT, 'scripts', 'server.py'),
    '--port', String(apiPort),
    '--dist', emptyDist,
    '--channel', channel,
    '--build', apiBuild,
    '--release-home', releaseHome,
    '--source-root', ROOT,
    '--files-root', filesRoot,
    ...(earlyCdpPort ? ['--cdp-port', String(earlyCdpPort)] : []),
  ]
  if (allowSourceRoot) apiArguments.push('--allow-source-root')
  const api = spawn('python3', apiArguments, {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: headlessEnv,
  })
  const vite = spawn(process.execPath, [
    join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'),
    '--host', '127.0.0.1', '--port', String(port), '--strictPort',
  ], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, SYSTEMSKETCH_API_PORT: String(apiPort) },
  })
  if (process.env.VERBOSE) {
    for (const child of [api, vite]) {
      child.stdout.on('data', (chunk) => process.stdout.write(chunk))
      child.stderr.on('data', (chunk) => process.stderr.write(chunk))
    }
  }

  const close = () => {
    chrome.kill('SIGKILL')
    vite.kill('SIGKILL')
    api.kill('SIGKILL')
  }

  try {
    for (let attempt = 0; attempt <= 120; attempt += 1) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1000) })
        if (response.ok) break
      } catch { if (attempt === 120) throw new Error('Vite never became ready') }
      await delay(100)
    }
    const cdpPort = earlyCdpPort ?? await waitForDevTools(chromeProfile, chrome)
    const page = await newPage(cdpPort)
    await page.send('Page.enable')
    await page.send('Runtime.enable')
    await page.send('Log.enable')
    await page.send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile: false,
    })
    return {
      page,
      port,
      apiPort,
      cdpPort,
      filesRoot,
      releaseHome,
      close: () => { page.close(); close() },
    }
  } catch (error) {
    close()
    throw error
  }
}

export async function openApp(page, port, query) {
  await page.send('Page.navigate', { url: `http://127.0.0.1:${port}/${query}` })
  await waitFor(page, 'document.readyState === "complete"', 'page load')
}

export async function ensureDir(path) {
  await mkdir(path, { recursive: true })
}

export function makeChecklist() {
  const checks = []
  return {
    checks,
    pass(label) {
      checks.push(label)
      process.stdout.write(`  PASS  ${label}\n`)
    },
  }
}
