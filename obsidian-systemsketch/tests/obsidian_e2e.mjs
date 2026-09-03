#!/usr/bin/env node
/** Real-host proof: isolated vault, isolated profile, real Obsidian under Xvfb. */
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
const PLUGIN_ROOT = dirname(TEST_DIR)
const PROJECT_ROOT = dirname(PLUGIN_ROOT)
const CAPTURE_DIR = process.env.SYSTEMSKETCH_E2E_CAPTURE_DIR ?? join(PROJECT_ROOT, 'docs', 'assets')
const TIMEOUT_MS = 30_000
const BLOCK_TOOL = '[data-testid="systemsketch-tool-system"] .systemsketch-block-icon'
const SYSTEM_TOOL = '[data-testid="systemsketch-tool-system"]'

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))

async function executable(path) {
  try { await access(path, fsConstants.X_OK); return true } catch { return false }
}

async function findObsidian() {
  for (const candidate of [
    process.env.OBSIDIAN_PATH,
    '/home/bam/Applications/Obsidian.AppImage',
    '/home/bam/Downloads/Obsidian-1.12.7.AppImage',
  ].filter(Boolean)) if (await executable(candidate)) return candidate
  throw new Error('Obsidian AppImage not found; set OBSIDIAN_PATH')
}

async function freePort() {
  const server = net.createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert(address && typeof address === 'object')
  server.close()
  await once(server, 'close')
  return address.port
}

class CdpConnection {
  constructor(url) {
    this.url = url
    this.socket = null
    this.sequence = 0
    this.pending = new Map()
    this.listeners = new Map()
  }

  async open() {
    this.socket = new WebSocket(this.url)
    await new Promise((resolveOpen, reject) => {
      this.socket.addEventListener('open', resolveOpen, { once: true })
      this.socket.addEventListener('error', reject, { once: true })
    })
    this.socket.addEventListener('message', (event) => this.onMessage(event.data))
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
  }

  send(method, params = {}) {
    assert.equal(this.socket?.readyState, WebSocket.OPEN)
    const id = ++this.sequence
    return new Promise((resolveSend, reject) => {
      const timer = setTimeout(() => reject(new Error(`${method} timed out`)), TIMEOUT_MS)
      this.pending.set(id, {
        method,
        resolve: (value) => { clearTimeout(timer); resolveSend(value) },
        reject: (error) => { clearTimeout(timer); reject(error) },
      })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  close() { this.socket?.close() }
}

async function connectObsidian(port, processHandle) {
  const deadline = Date.now() + TIMEOUT_MS
  let lastError
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null) throw new Error(`Obsidian exited early (${processHandle.exitCode})`)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1500) })
      const targets = await response.json()
      const page = targets.find((target) => target.type === 'page' && target.url === 'app://obsidian.md/index.html')
      if (page?.webSocketDebuggerUrl) return new CdpConnection(page.webSocketDebuggerUrl).open()
    } catch (error) { lastError = error }
    await delay(100)
  }
  throw new Error(`Timed out waiting for Obsidian CDP: ${lastError ?? 'no page target'}`)
}

async function evaluate(page, expression) {
  const response = await page.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  })
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text)
  }
  return response.result?.value
}

async function waitFor(check, description, timeoutMs = TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try { const value = await check(); if (value) return value } catch (error) { lastError = error }
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ''}`)
}

async function screenshot(page, name) {
  const result = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  const path = join(CAPTURE_DIR, `obsidian-${name}.png`)
  await writeFile(path, Buffer.from(result.data, 'base64'))
  return path
}

async function elementRect(page, selector) {
  return waitFor(() => evaluate(page, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)})
    if (!element) return null
    const { x, y, width, height } = element.getBoundingClientRect()
    return width > 0 && height > 0 ? { x, y, width, height } : null
  })()`), selector)
}

async function click(page, x, y) {
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 })
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 })
  await delay(140)
}

async function pointerReachesCanvas(page) {
  const tool = await elementRect(page, BLOCK_TOOL)
  await click(page, tool.x + tool.width / 2, tool.y + tool.height / 2)
  try {
    await waitFor(
      () => evaluate(page, `document.querySelector(${JSON.stringify(SYSTEM_TOOL)})?.getAttribute('aria-pressed') === 'true'`),
      'the Block tool to activate',
      6_000,
    )
    return true
  } catch { return false }
}

async function freeCanvasPoint(page, bias) {
  return waitFor(() => evaluate(page, `(() => {
    const container = document.querySelector('.workspace-leaf.mod-active .systemsketch-obsidian-editor .tl-container')
    if (!container) return null
    const rect = container.getBoundingClientRect()
    for (const fx of ${JSON.stringify(bias.x)}) for (const fy of ${JSON.stringify(bias.y)}) {
      const x = rect.x + rect.width * fx
      const y = rect.y + rect.height * fy
      const hit = document.elementFromPoint(x, y)
      if (hit?.closest('.tl-canvas') && !hit.closest('[data-systemsketch-chrome]')) return { x, y }
    }
    return null
  })()`), 'an uncovered point on the Obsidian canvas')
}

async function drawBlock(page, bias = { x: [0.3, 0.2, 0.45], y: [0.4, 0.25, 0.6] }) {
  const before = await evaluate(page, 'document.querySelectorAll(".workspace-leaf.mod-active .NodeShape").length')
  const tool = await elementRect(page, BLOCK_TOOL)
  await click(page, tool.x + tool.width / 2, tool.y + tool.height / 2)
  await waitFor(
    () => evaluate(page, `document.querySelector(${JSON.stringify(SYSTEM_TOOL)})?.getAttribute('aria-pressed') === 'true'`),
    'the Block tool to activate',
  )
  const point = await freeCanvasPoint(page, bias)
  await click(page, point.x, point.y)
  await waitFor(
    () => evaluate(page, `document.querySelectorAll('.workspace-leaf.mod-active .NodeShape').length > ${before}`),
    'a Block drawn with real pointer input',
  )
}

function shapeCount(document, type) {
  return (document.records ?? []).filter((record) => record.typeName === 'shape' && record.type === type).length
}

async function readSaved(path, expectation, description) {
  return waitFor(async () => {
    const text = await readFile(path, 'utf8')
    if (!text.trim()) return null
    try { const parsed = JSON.parse(text); return expectation(parsed) ? parsed : null } catch { return null }
  }, description)
}

async function setTheme(page, scheme) {
  await evaluate(page, `(() => {
    document.body.classList.remove('theme-light', 'theme-dark')
    document.body.classList.add(${JSON.stringify(`theme-${scheme}`)})
  })()`)
  await waitFor(() => evaluate(page, `(() => {
    const root = document.querySelector('.workspace-leaf.mod-active [data-ss-theme]')
    return root?.dataset.ssTheme === 'obsidian'
      && root?.dataset.ssColorScheme === ${JSON.stringify(scheme)}
      && Boolean(root.querySelector(${JSON.stringify(scheme === 'dark' ? '.tl-theme__dark' : '.tl-theme__light')}))
  })()`), `${scheme} Obsidian theme to reach the canvas`)
}

async function measureContrast(page) {
  return evaluate(page, `(() => {
    const parse = (text) => {
      let match = text.match(/^rgba?\\(([^)]+)\\)$/)
      if (match) { const p = match[1].split(/[\\s,\\/]+/).filter(Boolean).map(Number); return { r: p[0] / 255, g: p[1] / 255, b: p[2] / 255, a: p.length > 3 ? p[3] : 1 } }
      match = text.match(/^color\\(srgb ([^)]+)\\)$/)
      if (match) { const p = match[1].split(/[\\s\\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 } }
      return null
    }
    const over = (top, below) => { const a = top.a + below.a * (1 - top.a); const mix = (key) => (top[key] * top.a + below[key] * below.a * (1 - top.a)) / a; return { r: mix('r'), g: mix('g'), b: mix('b'), a } }
    const lum = ({ r, g, b }) => { const channel = (v) => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b) }
    const measure = (selector, mutate = false) => {
      const element = [...document.querySelectorAll(selector)].find((candidate) => candidate.getBoundingClientRect().height > 0)
      if (!element) return { selector, found: false }
      const previous = element.style.color
      if (mutate) element.style.color = getComputedStyle(element.parentElement).backgroundColor
      const fg = parse(getComputedStyle(element).color)
      let bg = { r: 0, g: 0, b: 0, a: 0 }
      for (let node = element; node && bg.a < 0.999; node = node.parentElement) {
        const color = parse(getComputedStyle(node).backgroundColor)
        if (color?.a > 0) bg = over(bg, color)
      }
      bg = over(bg, { r: 1, g: 1, b: 1, a: 1 })
      const [high, low] = [lum(over(fg, bg)), lum(bg)].sort((left, right) => right - left)
      if (mutate) element.style.color = previous
      return { selector, found: true, ratio: Math.round(((high + 0.05) / (low + 0.05)) * 100) / 100 }
    }
    return {
      readings: [measure('.block-inspector__section-title'), measure('.block-inspector__field > span'), measure('.block-inspector__tabs > [role=tab].is-active')],
      mutated: measure('.block-inspector__section-title', true),
    }
  })()`)
}

const obsidian = await findObsidian()
const temporaryRoot = await mkdtemp(join(tmpdir(), 'systemsketch-obsidian-e2e-'))
const vault = join(temporaryRoot, 'vault')
const profile = join(temporaryRoot, 'profile')
const install = join(vault, '.obsidian', 'plugins', 'systemsketch-obsidian')
const targetPath = join(vault, 'target.systemsketch')
const tldrPath = join(vault, 'board.tldr')
const port = await freePort()
const checks = []
let processHandle
let page
let recentOutput = ''
const exceptions = []

try {
  await mkdir(install, { recursive: true })
  await mkdir(profile, { recursive: true })
  await mkdir(CAPTURE_DIR, { recursive: true })
  for (const file of ['main.js', 'styles.css', 'manifest.json', 'bundle.json']) {
    await cp(join(PLUGIN_ROOT, 'dist', file), join(install, file))
  }
  await writeFile(targetPath, '', 'utf8')
  await writeFile(tldrPath, '', 'utf8')
  await writeFile(join(vault, 'Demo.md'), '# Embedded SystemSketch\n\n![[target.systemsketch|700x420]]\n', 'utf8')
  await writeFile(join(vault, '.obsidian', 'community-plugins.json'), '["systemsketch-obsidian"]\n', 'utf8')
  await writeFile(join(vault, '.obsidian', 'app.json'), '{"showUnsupportedFiles":true}\n', 'utf8')
  await writeFile(join(profile, 'obsidian.json'), JSON.stringify({
    vaults: { 'systemsketch-e2e': { path: vault, ts: Date.now(), open: true } },
  }), 'utf8')

  processHandle = spawn('xvfb-run', [
    '-a', '-s', '-screen 0 1600x1000x24', obsidian,
    '--no-sandbox', '--disable-gpu', `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`,
  ], { cwd: vault, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const remember = (chunk) => { recentOutput = `${recentOutput}${String(chunk)}`.slice(-16_000) }
  processHandle.stdout.on('data', remember)
  processHandle.stderr.on('data', remember)

  page = await connectObsidian(port, processHandle)
  await page.send('Runtime.enable')
  await page.send('Page.enable')
  page.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
    exceptions.push(exceptionDetails.exception?.description ?? exceptionDetails.text ?? 'unknown exception')
  })
  await waitFor(() => evaluate(page, 'typeof app !== "undefined" && !!app.plugins && !!app.workspace'), 'Obsidian initialization')
  await evaluate(page, `(async () => {
    app.plugins.setEnable(true)
    if (app.plugins.enablePluginAndSave) await app.plugins.enablePluginAndSave('systemsketch-obsidian')
    else await app.plugins.enablePlugin('systemsketch-obsidian')
  })()`)
  await waitFor(() => evaluate(page, '!!app.plugins.plugins["systemsketch-obsidian"]'), 'SystemSketch plugin activation')
  await waitFor(() => evaluate(page, 'app.workspace.layoutReady && !!app.workspace.rootSplit'), 'Obsidian workspace layout')
  assert.equal(await evaluate(page, 'app.viewRegistry.getTypeByExtension("systemsketch")'), 'systemsketch-obsidian.editor')
  assert.equal(await evaluate(page, 'app.viewRegistry.getTypeByExtension("tldr")'), 'systemsketch-obsidian.editor')
  checks.push('Obsidian claims both .systemsketch and .tldr with a TextFileView')

  await evaluate(page, `(async () => app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath('target.systemsketch')))()`)
  await waitFor(() => evaluate(page, '!!document.querySelector(".workspace-leaf.mod-active [data-testid=systemsketch-embedded-app] .tl-container")'), 'blank .systemsketch canvas')
  assert.equal(await evaluate(page, '!!document.querySelector(".workspace-leaf.mod-active [data-testid=systemsketch-top-left-shell]")'), false)
  checks.push('a blank .systemsketch opens the real embedded canvas without duplicate file chrome')

  await setTheme(page, 'light')
  const lightCapture = await screenshot(page, 'systemsketch-light')
  await setTheme(page, 'dark')
  const darkCapture = await screenshot(page, 'systemsketch-dark')
  checks.push('the existing obsidian theme reaches tldraw in real light and dark host states')

  const drivable = await pointerReachesCanvas(page)
  if (!drivable) {
    console.error(JSON.stringify({
      capability: 'synthetic pointer input',
      proved: checks,
      uncovered: ['draw and autosave', '.tldr round trip', 'external reload', 'inline embed'],
    }, null, 2))
  }
  assert.equal(drivable, true, 'Obsidian did not accept synthetic pointer input; uncovered checks were reported')

  await evaluate(page, `(() => {
    window.__systemSketchModifyCount = 0
    window.__systemSketchModifyRef = app.vault.on('modify', (file) => {
      if (file.path === 'target.systemsketch') window.__systemSketchModifyCount += 1
    })
  })()`)
  await drawBlock(page)
  const savedTarget = await readSaved(
    targetPath,
    (document) => shapeCount(document, 'block') >= 1,
    'Obsidian autosave to write the .systemsketch envelope',
  )
  await delay(1_200)
  assert.equal(await evaluate(page, 'window.__systemSketchModifyCount'), 1, 'one settled edit should make one Obsidian save')
  await evaluate(page, 'app.vault.offref(window.__systemSketchModifyRef)')
  assert.equal(Object.keys(savedTarget)[0], 'systemSketch')
  assert.equal(savedTarget.systemSketch.application, 'SystemSketch')
  checks.push('one settled canvas edit produces one Obsidian autosave and a valid SystemSketch envelope')

  const contrastByScheme = {}
  for (const scheme of ['light', 'dark']) {
    await setTheme(page, scheme)
    const result = await measureContrast(page)
    for (const reading of result.readings) {
      assert.equal(reading.found, true, `${reading.selector} is absent in ${scheme}`)
      assert.ok(reading.ratio >= 4.5, `${reading.selector} is ${reading.ratio}:1 in ${scheme}`)
    }
    assert.ok(result.mutated.ratio < 4.5, `contrast mutation stayed green at ${result.mutated.ratio}:1`)
    contrastByScheme[scheme] = result.readings
  }
  checks.push('live Obsidian chrome contrast is ≥4.5:1 in light and dark; a same-color mutation fails the gate')

  await evaluate(page, `(async () => app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath('board.tldr')))()`)
  await waitFor(
    () => evaluate(page, `Boolean(document.querySelector('.workspace-leaf.mod-active [data-embed-path$="board.tldr"]'))`),
    'blank .tldr canvas',
  )
  await drawBlock(page, { x: [0.24, 0.35, 0.5], y: [0.65, 0.5, 0.75] })
  const savedTldr = await readSaved(tldrPath, (document) => shapeCount(document, 'block') >= 1, 'Obsidian autosave to write .tldr')
  assert.equal(savedTldr.systemSketch, undefined)
  checks.push('.tldr opens, edits, and autosaves without the SystemSketch envelope')

  await evaluate(page, `(async () => app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath('target.systemsketch')))()`)
  await waitFor(() => evaluate(page, 'document.querySelectorAll(".workspace-leaf.mod-active .NodeShape").length >= 1'), 'saved target Block to reopen')
  const external = JSON.parse(await readFile(targetPath, 'utf8'))
  const removed = external.records.findIndex((record) => record.typeName === 'shape' && record.type === 'block')
  external.records.splice(removed, 1)
  await writeFile(targetPath, `${JSON.stringify(external, null, 2)}\n`, 'utf8')
  await waitFor(() => evaluate(page, 'document.querySelectorAll(".workspace-leaf.mod-active .NodeShape").length === 0'), 'external file edit to reload the canvas')
  checks.push('setViewData distinguishes an external file change and reloads without remounting the host view')

  assert.equal(await evaluate(page, '!!app.vault.getAbstractFileByPath("Demo.md")'), true)
  const markdownTransition = await evaluate(page, `(async () => {
    const leaf = app.workspace.activeLeaf
    const before = leaf.getViewState()
    await leaf.openFile(app.vault.getAbstractFileByPath('Demo.md'), { active: true })
    if (leaf.view.getViewType() === 'markdown') {
      const state = leaf.getViewState()
      await leaf.setViewState({ ...state, state: { ...state.state, mode: 'preview' }, active: true })
    }
    return { before, after: leaf.getViewState(), viewType: leaf.view.getViewType() }
  })()`)
  assert.equal(markdownTransition.viewType, 'markdown', 'Obsidian did not enter its Markdown view')
  await waitFor(() => evaluate(page, '!!document.querySelector(".workspace-leaf.mod-active [data-testid=systemsketch-obsidian-embed] [data-testid=systemsketch-embedded-app]")'), 'inline SystemSketch embed')
  assert.equal(await evaluate(page, '!!document.querySelector(".workspace-leaf.mod-active [data-testid=systemsketch-obsidian-embed] [data-testid=systemsketch-embed-readonly]")'), true)
  assert.equal(await evaluate(page, 'getComputedStyle(document.querySelector(".workspace-leaf.mod-active [data-testid=systemsketch-obsidian-embed] .systemsketch-embedded-app")).pointerEvents'), 'none')
  const embedCapture = await screenshot(page, 'systemsketch-embed')
  checks.push('![[target.systemsketch]] renders as an inert read-only inline canvas')

  const unexpected = exceptions.filter((entry) => !(
    entry.includes('LicenseManager') || entry.includes('watermark') || entry.includes('Failed to fetch')
  ))
  assert.deepEqual(unexpected, [], `unexpected Obsidian exceptions:\n${unexpected.join('\n')}`)

  const result = {
    checks: checks.length,
    host: 'Obsidian',
    drivable,
    autosaveModifyEvents: 1,
    targetBlocks: shapeCount(savedTarget, 'block'),
    tldrBlocks: shapeCount(savedTldr, 'block'),
    contrastByScheme,
    captures: [lightCapture, darkCapture, embedCapture].map((path) => path.replace(`${PROJECT_ROOT}/`, '')),
    proved: checks,
  }
  await writeFile(join(CAPTURE_DIR, 'obsidian-plugin-journey.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(result, null, 2))
} catch (error) {
  if (page) {
    try {
      const diagnostics = await evaluate(page, `(() => ({
        plugin: !!app.plugins.plugins['systemsketch-obsidian'],
        activeType: app.workspace.getLeaf(false)?.view?.getViewType?.(),
        files: app.vault.getFiles().map((file) => file.path),
        markdownView: Boolean(app.viewRegistry?.viewByType?.markdown),
        leaves: app.workspace.getLeavesOfType('empty').length + ':' + app.workspace.getLeavesOfType('markdown').length,
        editorHost: !!document.querySelector('[data-testid=systemsketch-obsidian-editor]'),
        loading: !!document.querySelector('[data-testid=systemsketch-embed-loading]'),
        error: document.querySelector('[data-testid=systemsketch-embed-error]')?.textContent,
        content: document.querySelector('.workspace-leaf.mod-active .view-content')?.innerText?.slice(0, 1000),
      }))()`)
      console.error(`Obsidian diagnostics: ${JSON.stringify(diagnostics, null, 2)}`)
      console.error(`Obsidian exceptions: ${JSON.stringify(exceptions, null, 2)}`)
    } catch { /* preserve the original failure */ }
  }
  error.message = `${error.message}\n\nRecent Obsidian output:\n${recentOutput}`
  throw error
} finally {
  page?.close()
  if (processHandle?.pid) {
    try { process.kill(-processHandle.pid, 'SIGTERM') } catch { /* already stopped */ }
    await Promise.race([once(processHandle, 'exit'), delay(3_000)])
  }
  await rm(temporaryRoot, { recursive: true, force: true })
}
