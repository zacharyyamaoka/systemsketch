#!/usr/bin/env node
/**
 * Open every PyBlocks target/generated board in a real VS Code-family host.
 *
 * This is deliberately a host test, not a parser test. It installs the built
 * VSIX into a disposable profile, copies the corpus into a disposable
 * workspace, opens every board through Quick Open, and asks the webview that
 * identifies that exact relative path what it actually rendered.
 */

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { access, cp, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import net from 'node:net'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const EXTENSION_ROOT = dirname(TEST_DIR)
const VSIX = join(EXTENSION_ROOT, 'dist', 'systemsketch-vscode-0.1.0.vsix')
const DEFAULT_CORPUS_ROOT = resolve(EXTENSION_ROOT, '..', '..', 'pyblocks', 'examples', 'systemsketch_goldens')
const CORPUS_ROOT = resolve(process.env.SYSTEMSKETCH_CORPUS_ROOT ?? DEFAULT_CORPUS_ROOT)
const TIMEOUT_MS = Number(process.env.SYSTEMSKETCH_CORPUS_TIMEOUT_MS ?? 20_000)
const WEBVIEW_DOCUMENT = `(document.getElementById('active-frame')?.contentDocument ?? document)`
const APP_SELECTOR = '[data-testid="systemsketch-embedded-app"]'
const ERROR_SELECTOR = '[data-testid="systemsketch-embed-error"]'
const BLOCK_TOOL_SELECTOR = '[data-testid="systemsketch-tool-system"] .systemsketch-block-icon'

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
    if (message.id === undefined) return
    const pending = this.pending.get(message.id)
    if (!pending) return
    this.pending.delete(message.id)
    if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`))
    else pending.resolve(message.result ?? {})
  }

  send(method, params = {}, sessionId) {
    assert.equal(this.socket?.readyState, WebSocket.OPEN, 'CDP socket is not open')
    const id = ++this.sequence
    return new Promise((resolveSend, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`${method} timed out after ${TIMEOUT_MS} ms`))
      }, TIMEOUT_MS)
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
  const deadline = Date.now() + TIMEOUT_MS
  let lastError
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null) throw new Error(`The IDE exited early (${processHandle.exitCode})`)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
        signal: AbortSignal.timeout(1500),
      })
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

async function waitFor(check, description, timeoutMs = TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try {
      const value = await check()
      if (value) return value
    } catch (error) {
      lastError = error
    }
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ''}`)
}

async function webviewContexts(page) {
  const { targetInfos } = await page.send('Target.getTargets')
  const contexts = []
  for (const target of targetInfos.filter(
    (info) => info.type === 'iframe' && String(info.url).startsWith('vscode-webview://'),
  )) {
    let sessionId = page.targetSessions.get(target.targetId)
    if (!sessionId) {
      try {
        const attachment = await page.send('Target.attachToTarget', { targetId: target.targetId, flatten: true })
        sessionId = attachment.sessionId
        page.targetSessions.set(target.targetId, sessionId)
        await page.send('Runtime.enable', {}, sessionId)
      } catch {
        continue
      }
    }
    contexts.push({ sessionId })
  }
  return contexts
}

function normalizedRelativePath(path) {
  return path.split(sep).join('/')
}

async function matchingContext(page, relativePath) {
  const suffix = `/${normalizedRelativePath(relativePath)}`
  for (const context of await webviewContexts(page)) {
    try {
      const path = await evaluate(
        page,
        `(${WEBVIEW_DOCUMENT}.querySelector(${JSON.stringify(APP_SELECTOR)})?.dataset.embedPath ?? null)`,
        undefined,
        context.sessionId,
      )
      if (typeof path === 'string' && path.replaceAll('\\\\', '/').endsWith(suffix)) {
        return { ...context, embedPath: path }
      }
    } catch {
      // A webview can disappear between target enumeration and evaluation.
    }
  }
  return null
}

async function pressKey(page, key, { code, modifiers = 0 } = {}) {
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
  })
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...keyData })
  await delay(60)
}

async function quickOpen(page, relativePath) {
  await pressKey(page, 'p', { code: 'KeyP', modifiers: 2 })
  await delay(180)
  await page.send('Input.insertText', { text: normalizedRelativePath(relativePath) })
  await delay(300)
  await pressKey(page, 'Enter', { code: 'Enter' })
}

async function closeEditor(page, relativePath) {
  await pressKey(page, 'w', { code: 'KeyW', modifiers: 2 })
  await waitFor(async () => !(await matchingContext(page, relativePath)), `the ${relativePath} editor to close`, 5_000)
}

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

async function corpusFiles(root) {
  const found = []
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await walk(path)
      else if (entry.isFile() && /^(target|generated)\.systemsketch$/.test(entry.name)) found.push(path)
    }
  }
  await walk(root)
  return found.sort((left, right) => left.localeCompare(right))
}

async function byteSnapshots(root, relativePaths) {
  return new Map(await Promise.all(relativePaths.map(async (path) => [
    normalizedRelativePath(path),
    await readFile(join(root, path)),
  ])))
}

async function main() {
  const hostPath = await findHost()
  const hostName = basename(hostPath).toLowerCase().includes('cursor') ? 'Cursor' : 'Visual Studio Code'
  await access(VSIX, fsConstants.R_OK)
  await access(CORPUS_ROOT, fsConstants.R_OK)

  const sourceFiles = await corpusFiles(CORPUS_ROOT)
  assert.ok(sourceFiles.length > 0, `No target/generated .systemsketch files found under ${CORPUS_ROOT}`)
  const relativePaths = sourceFiles.map((path) => relative(CORPUS_ROOT, path))
  const testRoot = await mkdtemp(join(tmpdir(), 'systemsketch-corpus-e2e-'))
  const userData = join(testRoot, 'user-data')
  const extensions = join(testRoot, 'extensions')
  const workspace = join(testRoot, 'systemsketch_goldens')
  const before = await byteSnapshots(CORPUS_ROOT, relativePaths)
  const port = await freePort()
  let hostProcess
  let page
  let recentOutput = ''
  const failures = []
  const passed = []
  let capabilityWall = null

  try {
    await mkdir(userData, { recursive: true })
    await mkdir(extensions, { recursive: true })
    await cp(CORPUS_ROOT, workspace, { recursive: true })

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
      '--verbose',
      '--new-window',
      `--remote-debugging-port=${port}`,
      workspace,
    ], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const remember = (chunk) => { recentOutput = `${recentOutput}${String(chunk)}`.slice(-16_000) }
    hostProcess.stdout.on('data', remember)
    hostProcess.stderr.on('data', remember)

    await delay(3_000)
    page = await connectWorkbench(port, hostProcess)
    await page.send('Page.enable')
    await page.send('Runtime.enable')
    await page.send('Target.setDiscoverTargets', { discover: true })
    await delay(hostName === 'Cursor' ? 9_000 : 1_500)

    for (const [index, relativePath] of relativePaths.entries()) {
      let opened = false
      try {
        await quickOpen(page, relativePath)
        const context = await waitFor(
          () => matchingContext(page, relativePath),
          `the webview for ${relativePath}`,
        )
        opened = true
        // onMount can paint the canvas before React commits a parse error.
        await delay(300)
        const rendered = await evaluate(page, `(() => {
          const doc = ${WEBVIEW_DOCUMENT}
          const app = doc.querySelector(${JSON.stringify(APP_SELECTOR)})
          const error = doc.querySelector(${JSON.stringify(ERROR_SELECTOR)})
          return {
            path: app?.dataset.embedPath ?? null,
            canvas: Boolean(doc.querySelector('.tl-container')),
            blockTool: Boolean(doc.querySelector(${JSON.stringify(BLOCK_TOOL_SELECTOR)})),
            error: error?.innerText?.trim() || null,
          }
        })()`, undefined, context.sessionId)
        assert.equal(rendered.path, context.embedPath, 'the inspected webview changed documents while opening')
        assert.equal(rendered.canvas, true, 'the tldraw canvas did not mount')
        assert.equal(rendered.blockTool, true, 'the SystemSketch Block toolbar control is absent')
        assert.equal(rendered.error, null, `the canvas reported: ${rendered.error}`)
        passed.push(normalizedRelativePath(relativePath))
        process.stdout.write(`PASS ${index + 1}/${relativePaths.length} ${normalizedRelativePath(relativePath)}\n`)
      } catch (error) {
        const gated = await signInGate(page).catch(() => false)
        if (index === 0 && !opened && gated) {
          capabilityWall = `${hostName}'s disposable profile is covered by its first-run sign-in wall,`
            + ' and CDP keyboard input could not reach Quick Open. No corpus result is claimed.'
          break
        }
        failures.push({ path: normalizedRelativePath(relativePath), error: error.message })
        process.stderr.write(`FAIL ${index + 1}/${relativePaths.length} ${normalizedRelativePath(relativePath)}: ${error.message}\n`)
      } finally {
        // Close even a mismatched editor so one failure cannot contaminate the
        // path identity check for the next file.
        if (!capabilityWall) {
          try {
            if (opened) await closeEditor(page, relativePath)
            else {
              await pressKey(page, 'Escape', { code: 'Escape' })
              await pressKey(page, 'w', { code: 'KeyW', modifiers: 2 })
            }
          } catch (error) {
            failures.push({
              path: normalizedRelativePath(relativePath),
              error: `editor did not close cleanly: ${error.message}`,
            })
          }
        }
      }
    }

    const after = await byteSnapshots(workspace, relativePaths)
    const changed = relativePaths
      .map(normalizedRelativePath)
      .filter((path) => !before.get(path).equals(after.get(path)))
    if (changed.length > 0) {
      failures.push({ path: '<corpus bytes>', error: `opening changed: ${changed.join(', ')}` })
    }

    const report = {
      host: hostName,
      hostPath,
      corpusRoot: CORPUS_ROOT,
      files: relativePaths.length,
      passed: passed.length,
      failures,
      bytesUnchanged: changed.length === 0,
      capabilityWall,
      status: capabilityWall ? 'blocked' : failures.length === 0 ? 'passed' : 'failed',
    }
    console.log(JSON.stringify(report, null, 2))
    if (!capabilityWall && failures.length > 0) {
      throw new AggregateError(
        failures.map((failure) => new Error(`${failure.path}: ${failure.error}`)),
        `${failures.length} corpus checks failed`,
      )
    }
  } catch (error) {
    if (recentOutput) process.stderr.write(`\nRecent IDE output:\n${recentOutput}\n`)
    throw error
  } finally {
    page?.close()
    if (hostProcess) await stopProcessGroup(hostProcess)
    if (process.env.SYSTEMSKETCH_CORPUS_KEEP_TMP === '1') {
      console.log(`Kept disposable corpus workspace: ${testRoot}`)
    } else {
      await rm(testRoot, { recursive: true, force: true })
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
