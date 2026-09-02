#!/usr/bin/env node
/**
 * The plugin, proven in a real IDE.
 *
 * This installs the packaged VSIX into a throwaway profile, launches real
 * VS Code (or Cursor) under Xvfb, and drives it over raw CDP: click the file
 * in the tree, draw on the canvas that appears, press Ctrl+S, and read the
 * bytes that landed on disk. Nothing here is mocked — the oracle for every
 * claim is either the workbench's own DOM or the file itself.
 *
 * It walks the golden workflow end to end, because that is what the plugin is
 * for: a blank `target.systemsketch` is created the way the corpus creates
 * one, opened from the tree, drawn on, and saved; then the same board is
 * copied to a `.tldr` and saved again to prove the suffix — and only the
 * suffix — decides whether the SystemSketch envelope is written.
 */

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import net from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const EXTENSION_ROOT = dirname(TEST_DIR)
const PROJECT_ROOT = dirname(EXTENSION_ROOT)
const VSIX = join(EXTENSION_ROOT, 'dist', 'systemsketch-vscode-0.1.0.vsix')
const CAPTURE_DIR = process.env.SYSTEMSKETCH_E2E_CAPTURE_DIR
  ?? join(PROJECT_ROOT, 'docs', 'assets')
const CAPTURE_PREFIX = process.env.SYSTEMSKETCH_E2E_CAPTURE_PREFIX ?? 'vscode'
const DEFAULT_TIMEOUT_MS = 30_000
const WEBVIEW_DOCUMENT = `(document.getElementById('active-frame')?.contentDocument ?? document)`
// Block and Branch intentionally share one top-level system-design slot. A
// fresh profile starts that family on Block, whose inline icon is the stable
// proof that clicking the family button will select the Block tool.
const SYSTEM_TOOL_SELECTOR = '[data-testid="systemsketch-tool-system"]'
const BLOCK_TOOL_ICON_SELECTOR = `${SYSTEM_TOOL_SELECTOR} .systemsketch-block-icon`

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))
}

async function executable(path) {
  try {
    await access(path, fsConstants.X_OK)
    return true
  } catch {
    return false
  }
}

async function findHost() {
  const candidates = [process.env.CODE_PATH, '/snap/bin/code', '/usr/bin/code', '/usr/bin/cursor']
  for (const candidate of candidates.filter(Boolean)) {
    if (await executable(candidate)) return candidate
  }
  throw new Error('No VS Code / Cursor CLI was found. Set CODE_PATH to its executable.')
}

async function freePort() {
  const server = net.createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address()
  server.close()
  await once(server, 'close')
  return port
}

async function run(command, args, options = {}) {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options })
  let output = ''
  child.stdout.on('data', (chunk) => { output += String(chunk) })
  child.stderr.on('data', (chunk) => { output += String(chunk) })
  const [code] = await once(child, 'exit')
  assert.equal(code, 0, `${command} ${args.join(' ')} failed:\n${output}`)
  return output
}

class CdpConnection {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl
    this.socket = null
    this.sequence = 0
    this.pending = new Map()
    this.listeners = new Map()
    this.targetSessions = new Map()
  }

  async open() {
    const socket = new WebSocket(this.webSocketUrl)
    this.socket = socket
    await new Promise((resolveOpen, reject) => {
      socket.addEventListener('open', resolveOpen, { once: true })
      socket.addEventListener('error', () => reject(new Error('Could not connect to the IDE CDP')), { once: true })
    })
    socket.addEventListener('message', (event) => this.onMessage(event.data))
    return this
  }

  onMessage(raw) {
    const message = JSON.parse(String(raw))
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`))
      else pending.resolve(message.result ?? {})
      return
    }
    for (const listener of this.listeners.get(message.method) ?? []) listener(message.params ?? {})
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? new Set()
    listeners.add(listener)
    this.listeners.set(method, listeners)
    return () => listeners.delete(listener)
  }

  send(method, params = {}, sessionId) {
    assert.equal(this.socket?.readyState, WebSocket.OPEN, 'CDP socket is not open')
    const id = ++this.sequence
    return new Promise((resolveSend, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`${method} timed out after ${DEFAULT_TIMEOUT_MS} ms`))
      }, DEFAULT_TIMEOUT_MS)
      this.pending.set(id, {
        method,
        resolve: (value) => { clearTimeout(timer); resolveSend(value) },
        reject: (error) => { clearTimeout(timer); reject(error) },
      })
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    })
  }

  close() {
    this.socket?.close()
  }
}

async function connectWorkbench(port, processHandle) {
  const deadline = Date.now() + DEFAULT_TIMEOUT_MS
  let lastError
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null) throw new Error(`The IDE exited early (${processHandle.exitCode})`)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1500) })
      const targets = await response.json()
      const workbench = targets.find(
        (target) => target.type === 'page' && String(target.url).includes('workbench.html'),
      )
      if (workbench?.webSocketDebuggerUrl) return new CdpConnection(workbench.webSocketDebuggerUrl).open()
    } catch (error) {
      lastError = error
    }
    await delay(100)
  }
  throw new Error(`Timed out waiting for the IDE DevTools: ${lastError ?? 'no workbench target'}`)
}

async function evaluate(page, expression, contextId, sessionId) {
  const response = await page.send('Runtime.evaluate', {
    expression,
    ...(contextId ? { contextId } : {}),
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  }, sessionId)
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description
      ?? response.exceptionDetails.text
      ?? 'Unknown evaluation error')
  }
  return response.result?.value
}

async function waitFor(check, description, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try {
      const value = await check()
      if (value) return value
    } catch (error) {
      lastError = error
    }
    await delay(120)
  }
  throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ''}`)
}

function flattenFrames(frameTree) {
  return [frameTree.frame, ...(frameTree.childFrames ?? []).flatMap(flattenFrames)]
}

async function webviewContexts(page) {
  const { targetInfos } = await page.send('Target.getTargets')
  const contexts = []
  for (const target of targetInfos.filter(
    (info) => info.type === 'iframe' && String(info.url).startsWith('vscode-webview://'),
  )) {
    let sessionId = page.targetSessions.get(target.targetId)
    if (!sessionId) {
      const attachment = await page.send('Target.attachToTarget', { targetId: target.targetId, flatten: true })
      sessionId = attachment.sessionId
      page.targetSessions.set(target.targetId, sessionId)
      await page.send('Runtime.enable', {}, sessionId)
    }
    contexts.push({ frame: { id: target.targetId, url: target.url }, sessionId })
  }
  if (contexts.length > 0) return contexts

  const { frameTree } = await page.send('Page.getFrameTree')
  const isolated = []
  for (const frame of flattenFrames(frameTree)) {
    if (!String(frame.url).startsWith('vscode-webview://')) continue
    try {
      const world = await page.send('Page.createIsolatedWorld', {
        frameId: frame.id,
        worldName: `systemsketch-e2e-${frame.id}`,
        grantUniveralAccess: true,
      })
      isolated.push({ frame, contextId: world.executionContextId })
    } catch {
      // A retained webview can disappear between the frame tree and the world.
    }
  }
  return isolated
}

/**
 * The webview showing one particular file.
 *
 * `retainContextWhenHidden` keeps every editor this suite has opened alive, so
 * "the SystemSketch webview" is ambiguous the moment a second file is open —
 * the first match is just as likely to be the tab behind the one on screen.
 * The canvas stamps its own path onto its root, so ask for that instead.
 */
function forFile(name) {
  return `[data-embed-path$="/${name}"]`
}

async function canvasContext(page, selector = '[data-testid="systemsketch-embedded-app"]') {
  return waitFor(async () => {
    for (const context of await webviewContexts(page)) {
      try {
        const found = await evaluate(
          page,
          `Boolean(${WEBVIEW_DOCUMENT}.querySelector(${JSON.stringify(selector)}))`,
          context.contextId,
          context.sessionId,
        )
        if (found) return context
      } catch {
        // Disposed webviews leave stale contexts behind for a moment.
      }
    }
    return null
  }, `SystemSketch webview ${selector}`)
}

function inCanvas(page, context, expression) {
  return evaluate(page, expression.replaceAll('$doc', WEBVIEW_DOCUMENT), context.contextId, context.sessionId)
}

async function pressKey(page, key, { code, modifiers = 0, text } = {}) {
  const resolvedCode = code ?? (key.length === 1 ? `Key${key.toUpperCase()}` : key)
  const virtualKeyCode = ({ Enter: 13, Escape: 27 }[key] ?? 0)
  const keyData = {
    key,
    code: resolvedCode,
    modifiers,
    ...(virtualKeyCode ? { windowsVirtualKeyCode: virtualKeyCode, nativeVirtualKeyCode: virtualKeyCode } : {}),
  }
  await page.send('Input.dispatchKeyEvent', {
    type: key === 'Enter' ? 'rawKeyDown' : 'keyDown',
    ...keyData,
    ...(text ? { text } : {}),
  })
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...keyData })
  await delay(90)
}

async function typeText(page, text) {
  await page.send('Input.insertText', { text })
  await delay(90)
}

async function quickOpen(page, name) {
  await pressKey(page, 'p', { code: 'KeyP', modifiers: 2 })
  await delay(260)
  await typeText(page, name)
  await delay(650)
  await pressKey(page, 'Enter', { code: 'Enter' })
  await delay(400)
}

async function runCommand(page, title) {
  await pressKey(page, 'P', { code: 'KeyP', modifiers: 2 | 8 })
  await delay(260)
  await typeText(page, title)
  await delay(650)
  await pressKey(page, 'Enter', { code: 'Enter' })
  await delay(400)
}

/**
 * Where on screen the editor's webview is.
 *
 * The largest visible one, not the last in the DOM: Cursor keeps its own
 * assistant webview mounted beside the editor, and DOM order picks whichever
 * mounted most recently — so pointer gestures aimed by that rule land in the
 * sidebar and silently do nothing.
 */
async function activeIframeRect(page) {
  return waitFor(() => evaluate(page, `(() => {
    const visible = [...document.querySelectorAll('iframe.webview')]
      .map((frame) => ({ frame, rect: frame.getBoundingClientRect(), style: getComputedStyle(frame) }))
      .filter(({ rect, style }) => (
        rect.width > 20 && rect.height > 20
        && style.visibility !== 'hidden' && style.display !== 'none'
      ))
      .sort((left, right) => (right.rect.width * right.rect.height) - (left.rect.width * left.rect.height))
    const best = visible[0]
    if (!best) return null
    const { x, y, width, height } = best.rect
    return { x, y, width, height }
  })()`), 'active webview iframe')
}

/** Every candidate webview frame and where the workbench has put it. */
async function iframeInventory(page) {
  return evaluate(page, `[...document.querySelectorAll('iframe.webview')].map((frame) => {
    const { x, y, width, height } = frame.getBoundingClientRect()
    const style = getComputedStyle(frame)
    const ancestry = []
    for (let node = frame.parentElement; node && ancestry.length < 4; node = node.parentElement) {
      ancestry.push(node.className || node.tagName)
    }
    return {
      x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height),
      visibility: style.visibility, display: style.display, ancestry,
    }
  })`)
}

async function canvasRect(page, context) {
  return waitFor(() => inCanvas(page, context, `(() => {
    const element = $doc.querySelector('.tl-container')
    if (!element) return null
    const { x, y, width, height } = element.getBoundingClientRect()
    return width > 0 && height > 0 ? { x, y, width, height } : null
  })()`), '.tl-container rectangle')
}

async function dispatchClick(page, x, y, sessionId) {
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, sessionId)
  await page.send('Input.dispatchMouseEvent', {
    type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1,
  }, sessionId)
  await page.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1,
  }, sessionId)
  await delay(140)
}

/** A click on the workbench itself, in window coordinates. */
async function click(page, x, y) {
  await dispatchClick(page, x, y)
}

/**
 * A click inside the canvas, in the webview's own coordinates.
 *
 * Sent on the webview's CDP session rather than the workbench page's. A
 * webview is an out-of-process iframe, and Cursor's build does not deliver
 * page-level synthetic input into one — measured: a click computed at the
 * Block tool's exact window position left the tool inactive, while the same
 * click on the frame's own session activates it. VS Code accepts both; only
 * this one works in both.
 */
async function clickInCanvas(page, context, iframe, x, y) {
  if (context.sessionId) return dispatchClick(page, x, y, context.sessionId)
  return dispatchClick(page, iframe.x + x, iframe.y + y)
}

/**
 * Record this run's verdicts where a report can read them.
 *
 * Written by the run that produced them, never derived from this file's
 * source: extracting labels from a journey shows what it *would* check, not
 * that anything executed. `docs/report_measurements.journey_results` refuses
 * the file if it predates either the journey or the app source.
 */
async function recordResults(payload) {
  const path = join(CAPTURE_DIR, `${CAPTURE_PREFIX}-plugin-journey.json`)
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(payload, null, 2))
  return path
}

async function screenshot(page, name) {
  const result = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  const path = join(CAPTURE_DIR, `${CAPTURE_PREFIX}-${name}.png`)
  await writeFile(path, Buffer.from(result.data, 'base64'))
  return path
}

/**
 * Whether the host is showing a first-run sign-in wall over its workbench.
 *
 * Cursor's fresh profile does, full-window, and signing in is the user's own
 * account action — not something a test suite may do. Behind that wall the
 * workbench still runs with no sidebar and a squeezed editor, so the reachable
 * checks are reported and the rest are named as blocked rather than dressed up
 * as passes or reported as plugin failures.
 */
async function signInGate(page) {
  return evaluate(page, `(() => {
    const text = document.body.innerText || ''
    return /require you to be logged in|Sign Up[\\s\\S]{0,80}Log In|Log In[\\s\\S]{0,80}Sign Up/.test(text)
  })()`)
}

async function stopProcessGroup(child) {
  if (child.exitCode !== null) return
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
  await Promise.race([once(child, 'exit'), delay(5_000)])
  if (child.exitCode === null) {
    try { process.kill(-child.pid, 'SIGKILL') } catch { child.kill('SIGKILL') }
  }
}

async function elementRect(page, context, selector) {
  return waitFor(() => inCanvas(page, context, `(() => {
    const element = $doc.querySelector(${JSON.stringify(selector)})
    if (!element) return null
    const { x, y, width, height } = element.getBoundingClientRect()
    return width > 0 && height > 0 ? { x, y, width, height } : null
  })()`), selector)
}

/**
 * Draw one Block: pick the tool from the toolbar, then click the canvas.
 *
 * Deliberately not the `B` accelerator. Cursor's Electron build does not
 * forward bare-letter CDP key events into a webview at all, so a keyboard
 * gesture would prove the plugin works in one host and say nothing about the
 * other — while clicking the tool is what the toolbar is *for* and exercises
 * the same tool state in both.
 */
/**
 * Whether synthetic pointer events reach this host's webview at all.
 *
 * Clicking the Block tool and watching for `aria-pressed` is the smallest
 * gesture with a visible answer, so it doubles as the capability probe. VS
 * Code delivers CDP input into a webview; Cursor's build delivers neither
 * page-level nor frame-session-level input, which is a property of the harness
 * and the host, not of the extension — so it is reported as an uncovered
 * boundary rather than swallowed or mistaken for a plugin failure.
 */
async function pointerReachesCanvas(page, context, iframe) {
  const tool = await elementRect(page, context, BLOCK_TOOL_ICON_SELECTOR)
  await clickInCanvas(page, context, iframe, tool.x + tool.width / 2, tool.y + tool.height / 2)
  try {
    await waitFor(
      () => inCanvas(
        page,
        context,
        `$doc.querySelector(${JSON.stringify(SYSTEM_TOOL_SELECTOR)})?.getAttribute('aria-pressed') === 'true'`,
      ),
      'the Block tool to activate',
      6_000,
    )
    return true
  } catch {
    return false
  }
}

/**
 * A point the board actually owns, found by asking the page what is there.
 *
 * Fractions of the canvas are not good enough: selecting the Block tool opens
 * the inspector, and in a narrow editor pane — Cursor's fresh window is 466px
 * wide — that panel covers most of the canvas, so a click at 42% lands on the
 * dock and draws nothing. `elementFromPoint` is the only honest answer to
 * "would a person's click reach the board here", so the journey asks it.
 */
async function freeCanvasPoint(page, context, bias) {
  return waitFor(() => inCanvas(page, context, `(() => {
    const container = $doc.querySelector('.tl-container')
    if (!container) return null
    const rect = container.getBoundingClientRect()
    for (const fx of ${JSON.stringify(bias.x)}) {
      for (const fy of ${JSON.stringify(bias.y)}) {
        const x = rect.x + rect.width * fx
        const y = rect.y + rect.height * fy
        const hit = $doc.elementFromPoint(x, y)
        if (hit && hit.closest('.tl-canvas') && !hit.closest('[data-systemsketch-chrome]')) {
          return { x, y }
        }
      }
    }
    return null
  })()`), 'a point on the canvas no panel is covering')
}

async function drawBlock(page, context, iframe, bias) {
  const before = await inCanvas(page, context, `$doc.querySelectorAll('.NodeShape').length`)
  const tool = await elementRect(page, context, BLOCK_TOOL_ICON_SELECTOR)
  await clickInCanvas(page, context, iframe, tool.x + tool.width / 2, tool.y + tool.height / 2)
  await waitFor(
    () => inCanvas(
      page,
      context,
      `$doc.querySelector(${JSON.stringify(SYSTEM_TOOL_SELECTOR)})?.getAttribute('aria-pressed') === 'true'`,
    ),
    `the Block tool to activate from a click at`
    + ` (${Math.round(iframe.x + tool.x)}, ${Math.round(iframe.y + tool.y)})`
    + ` — webview frames: ${JSON.stringify(await iframeInventory(page))}`,
  )
  const point = await freeCanvasPoint(page, context, bias)
  await clickInCanvas(page, context, iframe, point.x, point.y)
  await waitFor(
    () => inCanvas(page, context, `$doc.querySelectorAll('.NodeShape').length > ${before}`),
    'a Block drawn on the embedded canvas',
  )
  return before + 1
}

async function saveAndRead(page, path, expectation, description) {
  await waitFor(() => evaluate(page, `Boolean(document.querySelector('.tab.dirty'))`), 'a dirty IDE tab')
  await pressKey(page, 's', { code: 'KeyS', modifiers: 2 })
  return waitFor(async () => {
    const text = await readFile(path, 'utf8')
    if (!text.trim()) return null
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      return null
    }
    return expectation(parsed) ? parsed : null
  }, description)
}

function shapeCount(document, type) {
  return (document.records ?? []).filter(
    (record) => record.typeName === 'shape' && record.type === type,
  ).length
}

async function main() {
  const hostPath = await findHost()
  const hostName = hostPath.toLowerCase().includes('cursor') ? 'Cursor' : 'Visual Studio Code'
  await access(VSIX, fsConstants.R_OK)

  const testRoot = await mkdtemp(join(tmpdir(), 'systemsketch-vscode-e2e-'))
  const userData = join(testRoot, 'user-data')
  const extensions = join(testRoot, 'extensions')
  const workspace = join(testRoot, 'goldens', '01_linear_chain')
  const targetPath = join(workspace, 'target.systemsketch')
  const tldrPath = join(workspace, 'board.tldr')
  const port = await freePort()
  const checks = []
  let hostProcess
  let page
  let recentOutput = ''

  try {
    await mkdir(userData, { recursive: true })
    await mkdir(extensions, { recursive: true })
    await mkdir(workspace, { recursive: true })
    await mkdir(CAPTURE_DIR, { recursive: true })

    // Exactly what the corpus writes for a case nobody has drawn yet.
    await writeFile(targetPath, '', 'utf8')
    await writeFile(join(workspace, 'source.py'), 'def run(raw: bytes) -> bytes:\n    return raw\n', 'utf8')

    await run(hostPath, [
      '--user-data-dir', userData,
      '--extensions-dir', extensions,
      '--install-extension', VSIX,
      '--force',
    ])

    hostProcess = spawn('xvfb-run', [
      '-a', '-s', '-screen 0 1600x1000x24',
      hostPath,
      '--user-data-dir', userData,
      '--extensions-dir', extensions,
      '--disable-workspace-trust',
      '--disable-telemetry',
      '--disable-gpu',
      '--skip-welcome',
      // `--verbose` keeps the CLI attached to the window it launched; without
      // it the launcher hands off and exits 0 before CDP is reachable.
      '--verbose',
      '--new-window',
      `--remote-debugging-port=${port}`,
      join(testRoot, 'goldens'),
    ], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const remember = (chunk) => { recentOutput = `${recentOutput}${String(chunk)}`.slice(-16_000) }
    hostProcess.stdout.on('data', remember)
    hostProcess.stderr.on('data', remember)

    await delay(3_000)
    page = await connectWorkbench(port, hostProcess)
    await page.send('Page.enable')
    await page.send('Runtime.enable')
    await page.send('Target.setDiscoverTargets', { discover: true })
    const exceptions = []
    page.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
      exceptions.push(exceptionDetails.exception?.description ?? exceptionDetails.text ?? 'unknown exception')
    })
    await delay(hostName === 'Cursor' ? 9_000 : 1_500)

    // 1. Clicking the file in the tree opens SystemSketch — no command needed,
    //    because the manifest makes this the default editor for the suffix.
    await quickOpen(page, 'target.systemsketch')
    const canvas = await canvasContext(page, forFile('target.systemsketch'))
    checks.push('a blank target.systemsketch opens as a SystemSketch canvas, not a quarantine screen')

    // 2. It is the real app: the Block tool and the canvas are both there.
    assert.equal(
      await inCanvas(page, canvas, `Boolean($doc.querySelector('.tl-container'))`),
      true,
      'the tldraw canvas did not mount',
    )
    assert.equal(
      await inCanvas(page, canvas, `Boolean($doc.querySelector(${JSON.stringify(BLOCK_TOOL_ICON_SELECTOR)}))`),
      true,
      'the SystemSketch toolbar is missing its Block tool',
    )
    checks.push('the pane hosts the real SystemSketch toolbar, Block tool included')

    // 3. The file surfaces are gone, because the IDE already has them.
    const fileChrome = await inCanvas(page, canvas, `({
      mainMenu: Boolean($doc.querySelector('[data-testid="systemsketch-top-left-shell"]')),
      sharePanel: Boolean($doc.querySelector('[data-testid="systemsketch-top-right-shell"]')),
      surfaceHost: Boolean($doc.querySelector('[data-testid="systemsketch-surface-host"]')),
    })`)
    assert.deepEqual(
      fileChrome,
      { mainMenu: false, sharePanel: false, surfaceHost: true },
      'the embedded canvas kept file chrome, or lost the surfaces that edit a board',
    )
    checks.push('the in-app file menu and share shell are absent; the board surfaces remain')

    // The IDE's theme reaches the board, not just the pane around it. The
    // oracle is the workbench's own editor background, read as a colour and
    // judged on luminance — not a theme class name, which is the extension's
    // own reasoning restated and so cannot check it.
    const workbench = await evaluate(page, `(() => {
      for (const selector of ['.part.editor', '.monaco-workbench', 'body']) {
        const element = document.querySelector(selector)
        if (!element) continue
        const match = getComputedStyle(element).backgroundColor
          .match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?\\)/)
        if (!match || Number(match[4] ?? 1) === 0) continue
        const [r, g, b] = [1, 2, 3].map((index) => Number(match[index]) / 255)
        return { selector, background: match[0], dark: 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5 }
      }
      return null
    })()`)
    assert.notEqual(workbench, null, 'could not read a painted workbench background')
    const workbenchIsDark = workbench.dark
    const canvasTheme = await inCanvas(page, canvas, `({
      declared: $doc.querySelector('[data-embed-color-scheme]')?.dataset.embedColorScheme ?? null,
      theme: $doc.querySelector('[data-ss-theme]')?.dataset.ssTheme ?? null,
      painted: Boolean($doc.querySelector('.tl-theme__dark')),
      canvas: (() => {
        const background = $doc.querySelector('.tl-background')
        return background ? getComputedStyle(background).backgroundColor : null
      })(),
      // The workbench's own editor background, as the webview receives it —
      // the value the canvas is expected to be painted with.
      editorBackground: getComputedStyle($doc.documentElement).getPropertyValue('--vscode-editor-background').trim() || null,
      surface: (() => {
        const root = $doc.querySelector('[data-ss-theme]')
        return root ? getComputedStyle(root).getPropertyValue('--ss-surface').trim() : null
      })(),
    })`)
    // The canvas is painted with the workbench's editor background, not a
    // colour of the extension's own.
    const asRgb = (hex) => {
      const m = /^#([0-9a-f]{6})$/i.exec(hex ?? '')
      if (!m) return null
      const [r, g, b] = [0, 2, 4].map((o) => parseInt(m[1].slice(o, o + 2), 16))
      return `rgb(${r}, ${g}, ${b})`
    }
    if (asRgb(canvasTheme.editorBackground)) {
      assert.equal(
        canvasTheme.canvas,
        asRgb(canvasTheme.editorBackground),
        `the canvas is not painted with the workbench's editor background ${canvasTheme.editorBackground}`,
      )
    }
    // The host's choice reaches the board itself: tldraw paints dark when the
    // workbench is dark, and the chrome around it reads the workbench's own
    // variables through the \`vscode\` theme block. The pane is measured for
    // legibility below, once the inspector is open.
    assert.deepEqual(
      { declared: canvasTheme.declared, theme: canvasTheme.theme, painted: canvasTheme.painted },
      { declared: workbenchIsDark ? 'dark' : 'light', theme: 'vscode', painted: workbenchIsDark },
      'the host theme did not reach the board, or the chrome is not wearing the vscode theme',
    )
    checks.push(
      `the workbench theme reaches the board —`
      + ` ${workbench.selector} paints ${workbench.background}, the canvas records`
      + ` "${canvasTheme.declared}", tldraw paints ${canvasTheme.painted ? 'dark' : 'light'}`
      + ` (${canvasTheme.canvas} = the workbench's editor.background ${canvasTheme.editorBackground}),`
      + ` and the chrome wears the "${canvasTheme.theme}" theme`,
    )

    if (hostName !== 'Cursor') await runCommand(page, 'View: Toggle Secondary Side Bar Visibility')
    const iframe = await activeIframeRect(page)
    await delay(400)
    const openedCapture = await screenshot(page, 'target-open')

    // Everything above reads what the host painted. Everything below needs the
    // harness to be able to *drive* the canvas, which not every host allows.
    const drivable = await pointerReachesCanvas(page, canvas, iframe)
    if (hostName === 'Visual Studio Code') {
      assert.equal(drivable, true, 'VS Code stopped delivering synthetic input to the webview')
    }
    if (!drivable) {
      await recordResults({
        host: hostName,
        editor: 'systemsketch.editor',
        passed: checks.length,
        checks,
        drivable: false,
        uncovered: [
          'draw · dirty tab · Ctrl+S · saved bytes',
          'reopen and redraw the saved Block',
          '.tldr saved without an envelope',
          'external JSON edit reloads the canvas',
        ],
        note: `${hostName} does not deliver synthetic pointer events into a webview at the`
          + ' page level or on the frame\'s own CDP session, so this harness cannot drive its'
          + ' canvas. The extension itself is byte-identical in both hosts; run this suite'
          + ' against VS Code for the editing half.',
        captures: [openedCapture].map((path) => path.replace(`${PROJECT_ROOT}/`, '')),
      })
      return
    }

    // 4. Draw, and the IDE — not the app — owns the dirty tab and the save.
    await drawBlock(page, canvas, iframe, { x: [0.30, 0.20, 0.42], y: [0.40, 0.25, 0.55] })
    assert.equal(await readFile(targetPath, 'utf8'), '', 'a canvas edit wrote to disk before Ctrl+S')
    checks.push('a canvas edit marks the tab dirty and writes nothing until the IDE saves')

    // The pane is legible in the host's theme: the inspector's copy measured
    // against what it is painted on, as a WCAG ratio, not a screenshot review.
    // This is the exact thing that used to fail — a near-black title on a
    // near-black board — so it is asserted on the same element.
    const legibility = await inCanvas(page, canvas, `(() => {
      const parse = (text) => {
        let m = text.match(/^rgba?\\(([^)]+)\\)$/)
        if (m) { const p = m[1].split(/[\\s,\\/]+/).filter(Boolean).map(Number); return { r: p[0] / 255, g: p[1] / 255, b: p[2] / 255, a: p.length > 3 ? p[3] : 1 } }
        m = text.match(/^color\\(srgb ([^)]+)\\)$/)
        if (m) { const p = m[1].split(/[\\s\\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 } }
        return null
      }
      const over = (top, below) => { const a = top.a + below.a * (1 - top.a); if (!a) return { r: 0, g: 0, b: 0, a: 0 }; const mix = (c) => (top[c] * top.a + below[c] * below.a * (1 - top.a)) / a; return { r: mix('r'), g: mix('g'), b: mix('b'), a } }
      const lum = ({ r, g, b }) => { const ch = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b) }
      const measure = (selector) => {
        const element = [...$doc.querySelectorAll(selector)].find((n) => n.getBoundingClientRect().height > 0)
        if (!element) return { selector, found: false }
        const fg = parse(getComputedStyle(element).color)
        let bg = { r: 0, g: 0, b: 0, a: 0 }
        for (let node = element; node && bg.a < 0.999; node = node.parentElement) {
          const c = parse(getComputedStyle(node).backgroundColor)
          if (c && c.a > 0) bg = over(bg, c)
        }
        bg = over(bg, { r: 1, g: 1, b: 1, a: 1 })
        const [hi, lo] = [lum(over(fg, bg)), lum(bg)].sort((x, y) => y - x)
        return { selector, found: true, ratio: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100 }
      }
      return [
        measure('.block-inspector__section-title'),
        measure('.block-inspector__field > span'),
        measure('.block-inspector__tabs > [role="tab"].is-active'),
      ]
    })()`)
    for (const reading of legibility) {
      assert.equal(reading.found, true, `${reading.selector} is not on screen`)
      assert.ok(reading.ratio >= 4.5, `${reading.selector} measures ${reading.ratio}:1 in the host's theme`)
    }
    checks.push(
      `the inspector is legible in the ${workbenchIsDark ? 'dark' : 'light'} workbench —`
      + legibility.map((reading) => ` ${reading.selector.replace(/^\.block-inspector__/, '')} ${reading.ratio}:1`).join(','),
    )

    const savedTarget = await saveAndRead(
      page,
      targetPath,
      (document) => shapeCount(document, 'block') >= 1,
      'the saved target.systemsketch',
    )
    assert.equal(Object.keys(savedTarget)[0], 'systemSketch', 'the envelope is not the first key')
    assert.equal(savedTarget.systemSketch.application, 'SystemSketch')
    assert.equal(savedTarget.systemSketch.shapes.block, shapeCount(savedTarget, 'block'))
    assert.ok(savedTarget.tldrawFileFormatVersion, 'the saved document is not a tldraw file')
    checks.push('Ctrl+S writes a .systemsketch: a tldraw file behind one SystemSketch envelope')
    const editedCapture = await screenshot(page, 'target-block-saved')

    // 5. Reopening reads it straight back — the round trip is closed.
    await runCommand(page, 'View: Close Editor')
    await delay(500)
    await quickOpen(page, 'target.systemsketch')
    const reopened = await canvasContext(page, forFile('target.systemsketch'))
    await waitFor(
      () => inCanvas(page, reopened, `$doc.querySelectorAll('.NodeShape').length >= 1`),
      'the saved Block redrawn after reopening',
    )
    checks.push('reopening the saved file redraws the Block that was saved')

    // 6. The suffix, and only the suffix, decides the encoding.
    if (await signInGate(page)) {
      await recordResults({
        host: hostName,
        editor: 'systemsketch.editor',
        passed: checks.length,
        checks,
        blocked: `${hostName} is showing its first-run sign-in wall over the workbench`,
        uncovered: [
          '.tldr saved without an envelope',
          'external JSON edit reloads the canvas',
        ],
        note: 'Signing in is the user\'s own account action, so the suite stops here. Everything'
          + ' above was driven behind that wall in this host; run the suite against VS Code, or a'
          + ' signed-in Cursor profile, for the remaining two.',
        captures: [openedCapture, editedCapture].map((path) => path.replace(`${PROJECT_ROOT}/`, '')),
      })
      return
    }
    await cp(targetPath, tldrPath)
    await writeFile(tldrPath, JSON.stringify(
      Object.fromEntries(Object.entries(savedTarget).filter(([key]) => key !== 'systemSketch')),
    ), 'utf8')
    await quickOpen(page, 'board.tldr')
    const tldrCanvas = await canvasContext(page, forFile('board.tldr'))
    await waitFor(
      () => inCanvas(page, tldrCanvas, `$doc.querySelectorAll('.NodeShape').length >= 1`),
      'the .tldr board rendered by the same editor',
    )
    const tldrIframe = await activeIframeRect(page)
    await drawBlock(page, tldrCanvas, tldrIframe, { x: [0.22, 0.34, 0.14], y: [0.70, 0.58, 0.80] })
    const savedTldr = await saveAndRead(
      page,
      tldrPath,
      (document) => shapeCount(document, 'block') > shapeCount(savedTarget, 'block'),
      'the saved board.tldr',
    )
    assert.equal(savedTldr.systemSketch, undefined, 'a .tldr was written with a SystemSketch envelope')
    checks.push('the same editor opens a .tldr and saves it back without an envelope')

    // 7. An edit to the JSON underneath the open tab reloads the canvas.
    if (hostName !== 'Cursor') {
      const external = JSON.parse(await readFile(targetPath, 'utf8'))
      const removed = external.records.findIndex(
        (record) => record.typeName === 'shape' && record.type === 'block',
      )
      external.records.splice(removed, 1)
      await quickOpen(page, 'target.systemsketch')
      const watching = await canvasContext(page, forFile('target.systemsketch'))
      await writeFile(targetPath, `${JSON.stringify(external, null, 2)}\n`, 'utf8')
      await waitFor(
        () => inCanvas(page, watching, `$doc.querySelectorAll('.NodeShape').length === 0`),
        'the canvas reloading after the file changed underneath it',
      )
      checks.push('editing the JSON underneath an open tab reloads the canvas')
    }

    // tldraw's unlicensed SDK pings a watermark endpoint that this webview's
    // CSP blocks by design, and the rejection reaches the page as a bare
    // `TypeError: Failed to fetch`. That one is expected and unrelated to the
    // document; every other page exception is a failure.
    const unexpected = exceptions.filter((entry) => !(
      entry.includes('LicenseManager')
      || entry.includes('watermark')
      || entry.includes('Failed to fetch')
    ))
    assert.deepEqual(unexpected, [], `IDE / webview exceptions:\n${unexpected.join('\n')}`)

    await recordResults({
      host: hostName,
      editor: 'systemsketch.editor',
      passed: checks.length,
      checks,
      savedTargetBlocks: shapeCount(savedTarget, 'block'),
      savedTldrBlocks: shapeCount(savedTldr, 'block'),
      captures: [openedCapture, editedCapture].map((path) => path.replace(`${PROJECT_ROOT}/`, '')),
    })
  } catch (error) {
    error.message = `${error.message}\n\nRecent ${hostName} output:\n${recentOutput}`
    throw error
  } finally {
    page?.close()
    if (hostProcess) await stopProcessGroup(hostProcess)
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        await rm(testRoot, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 })
        break
      } catch (error) {
        if (attempt === 7) console.warn(`Could not remove ${testRoot}: ${error.message}`)
        await delay(200)
      }
    }
  }
}

await main()
