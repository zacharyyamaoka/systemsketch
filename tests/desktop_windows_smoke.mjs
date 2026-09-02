#!/usr/bin/env node
/**
 * Proof that "New window" makes a real second desktop window.
 *
 * The headless journey (`workspace_browser_smoke.mjs`) proves the app opens a
 * second *page*; it cannot prove that page is an OS window, because a headless
 * target has no window at all. SystemSketch on the desktop is Chrome in
 * `--app` mode, so this runs exactly that — on a private Xvfb display, never
 * on the developer's screen — and asks the X server how many windows exist.
 */
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Cdp, ROOT, delay, evaluate, findChrome, freePort, makeChecklist, waitFor } from './browser_harness.mjs'

const APP_CLASS = 'systemsketch-window-probe'
const SHOT = join(ROOT, 'docs', 'assets', 'desktop-two-windows.png')
const RESULTS = join(ROOT, 'docs', 'assets', 'desktop-windows-results.json')
const SCREEN = { width: 1680, height: 1000 }

function have(binary) {
  return spawnSync('which', [binary], { encoding: 'utf8' }).status === 0
}

function freeDisplay() {
  for (let number = 90; number < 130; number += 1) {
    if (!existsSync(`/tmp/.X11-unix/X${number}`)) return `:${number}`
  }
  throw new Error('no free X display number')
}

function emptyDocument(name) {
  return JSON.stringify(
    {
      systemSketch: { formatVersion: 1, application: 'SystemSketch', shapes: {}, bindings: {} },
      tldrawFileFormatVersion: 1,
      schema: { schemaVersion: 2, sequences: {} },
      records: [
        { typeName: 'document', id: 'document:document', gridSize: 10, name },
        { typeName: 'page', id: 'page:page', name: 'Page 1', index: 'a1', meta: {} },
      ],
    },
    null,
    2,
  )
}

function windowIds(display) {
  const found = spawnSync('xdotool', ['search', '--onlyvisible', '--class', `^${APP_CLASS}$`], {
    encoding: 'utf8',
    env: { ...process.env, DISPLAY: display },
  })
  return (found.stdout ?? '').split('\n').map((line) => line.trim()).filter(Boolean)
}

function windowName(display, id) {
  return (spawnSync('xdotool', ['getwindowname', id], {
    encoding: 'utf8',
    env: { ...process.env, DISPLAY: display },
  }).stdout ?? '').trim()
}

/**
 * Bare Xvfb has no window manager, so every window is placed at 0,0 and the
 * newer one hides the older. Offsetting the second is only so the capture
 * shows what the X server already reports: two independent windows.
 */
function placeWindow(display, id, x, y, width, height) {
  const env = { ...process.env, DISPLAY: display }
  spawnSync('xdotool', ['windowsize', id, String(width), String(height)], { env })
  spawnSync('xdotool', ['windowmove', id, String(x), String(y)], { env })
  spawnSync('xdotool', ['windowraise', id], { env })
}

async function waitForWindows(display, count, label, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  let seen = []
  while (Date.now() < deadline) {
    seen = windowIds(display)
    if (seen.length >= count) return seen
    await delay(200)
  }
  throw new Error(`Timed out waiting for ${label} (X server reports ${seen.length} of ${count})`)
}

async function appTargets(cdpPort, port) {
  const response = await fetch(`http://127.0.0.1:${cdpPort}/json/list`, {
    signal: AbortSignal.timeout(8000),
  })
  return (await response.json()).filter(
    (target) => target.type === 'page' && target.url.includes(`127.0.0.1:${port}/`),
  )
}

async function waitForTargets(cdpPort, port, count, label, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  let seen = []
  while (Date.now() < deadline) {
    seen = await appTargets(cdpPort, port)
    if (seen.length >= count) return seen
    await delay(150)
  }
  throw new Error(`Timed out waiting for ${label} (saw ${seen.length} of ${count} pages)`)
}

async function waitForDevToolsPort(profileDir, chrome, timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (chrome.exitCode !== null) throw new Error(`Chrome exited early (${chrome.exitCode})`)
    try {
      const [line] = (await readFile(join(profileDir, 'DevToolsActivePort'), 'utf8')).trim().split(/\r?\n/)
      if (Number.isInteger(Number(line)) && Number(line) > 0) return Number(line)
    } catch { /* Chrome writes this file once it is listening. */ }
    await delay(60)
  }
  throw new Error('Timed out waiting for Chrome DevTools in app mode')
}

async function main() {
  if (!have('Xvfb') || !have('xdotool')) {
    console.log('SKIPPED: this proof needs Xvfb and xdotool (it must never open a window on the real screen).')
    return
  }
  const { checks, pass } = makeChecklist()
  const display = freeDisplay()
  const port = await freePort()
  const apiPort = await freePort()
  const chromePath = await findChrome()
  const filesRoot = await mkdtemp(join(tmpdir(), 'systemsketch-windows-files-'))
  const emptyDist = await mkdtemp(join(tmpdir(), 'systemsketch-windows-dist-'))
  const releaseHome = await mkdtemp(join(tmpdir(), 'systemsketch-windows-release-'))
  const profile = await mkdtemp(join(tmpdir(), 'systemsketch-windows-profile-'))
  const workspace = join(filesRoot, 'SystemSketch')
  await mkdir(workspace, { recursive: true })
  await writeFile(join(workspace, 'Arm.systemsketch'), emptyDocument('Arm'))
  await mkdir(join(ROOT, 'docs', 'assets'), { recursive: true })

  const xvfb = spawn('Xvfb', [display, '-screen', '0', `${SCREEN.width}x${SCREEN.height}x24`, '-nolisten', 'tcp'], {
    stdio: 'ignore',
  })
  const api = spawn('python3', [
    join(ROOT, 'scripts', 'server.py'),
    '--port', String(apiPort), '--dist', emptyDist, '--channel', 'preview',
    '--build', 'window-probe', '--release-home', releaseHome,
    '--source-root', ROOT, '--files-root', filesRoot,
  ], { cwd: ROOT, stdio: 'ignore' })
  const vite = spawn(process.execPath, [
    join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'),
    '--host', '127.0.0.1', '--port', String(port), '--strictPort',
  ], { cwd: ROOT, stdio: 'ignore', env: { ...process.env, SYSTEMSKETCH_API_PORT: String(apiPort) } })

  let chrome = null
  const close = () => {
    chrome?.kill('SIGKILL')
    vite.kill('SIGKILL')
    api.kill('SIGKILL')
    xvfb.kill('SIGKILL')
  }

  try {
    for (let attempt = 0; ; attempt += 1) {
      try {
        if ((await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1000) })).ok) break
      } catch {
        if (attempt === 120) throw new Error('Vite never became ready')
      }
      await delay(100)
    }

    // The desktop launcher's own window recipe, aimed at a private display.
    const boardUrl = `http://127.0.0.1:${port}/?board=${encodeURIComponent(join(workspace, 'Arm.systemsketch'))}`
    chrome = spawn(chromePath, [
      `--app=${boardUrl}`,
      `--class=${APP_CLASS}`,
      `--name=${APP_CLASS}`,
      `--user-data-dir=${profile}`,
      '--no-first-run', '--no-default-browser-check', '--disable-extensions',
      '--disable-gpu', '--disable-dev-shm-usage',
      '--remote-allow-origins=*', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
      `--window-size=${Math.round(SCREEN.width * 0.62)},${Math.round(SCREEN.height * 0.74)}`,
      '--window-position=0,0',
    ], { stdio: 'ignore', env: { ...process.env, DISPLAY: display } })

    const cdpPort = await waitForDevToolsPort(profile, chrome)
    const [first] = await waitForTargets(cdpPort, port, 1, 'the first app window')
    const page = await new Cdp(first.webSocketDebuggerUrl).open()
    await page.send('Runtime.enable')
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-app"]')`, 'the app in window 1')
    assert.equal(await evaluate(page, 'document.title'), 'Arm — SystemSketch')

    const opened = await waitForWindows(display, 1, 'the SystemSketch app window')
    assert.equal(opened.length, 1, 'the probe did not start from exactly one window')
    pass('SystemSketch runs as one real desktop window in Chrome app mode')

    // Ctrl+Shift+N from a trusted key event, exactly as a keypress would arrive.
    for (const type of ['rawKeyDown', 'keyUp']) {
      await page.send('Input.dispatchKeyEvent', {
        type, key: 'n', code: 'KeyN', modifiers: 2 | 8,
        windowsVirtualKeyCode: 78, nativeVirtualKeyCode: 78,
      })
    }

    const targets = await waitForTargets(cdpPort, port, 2, 'the second window to load a board')
    const both = await waitForWindows(display, 2, 'the second desktop window')
    assert.equal(both.length, 2, `expected two app windows, the X server reports ${both.length}`)
    const fresh = targets.find((target) => /Untitled/.test(decodeURIComponent(target.url)))
    assert.ok(fresh, 'the second window is not on a fresh board')
    const secondPage = await new Cdp(fresh.webSocketDebuggerUrl).open()
    await secondPage.send('Runtime.enable')
    await waitFor(secondPage, `document.querySelector('[data-testid="systemsketch-app"]')`, 'the app in window 2')
    const secondTitle = await evaluate(secondPage, 'document.title')
    assert.match(secondTitle, /^Untitled.* — SystemSketch$/)
    assert.equal(await evaluate(page, 'document.title'), 'Arm — SystemSketch')
    pass(`Ctrl+Shift+N adds a second X window on its own board (${secondTitle})`)

    // Both windows, side by side, captured off the private display.
    // Chrome pushes the page title into WM_NAME a beat after the popup paints.
    const secondWindow = await (async () => {
      const deadline = Date.now() + 8000
      while (Date.now() < deadline) {
        const named = both.find((id) => windowName(display, id).startsWith('Untitled'))
        if (named) return named
        await delay(200)
      }
      if (process.env.VERBOSE) {
        for (const id of both) console.log('X window', id, JSON.stringify(windowName(display, id)))
      }
      return null
    })()
    assert.ok(secondWindow, 'the X server has no window named after the new board')
    assert.equal(
      both.filter((id) => windowName(display, id).startsWith('Arm')).length,
      1,
      'the first window stopped showing its own board',
    )
    placeWindow(display, secondWindow, 560, 300, Math.round(SCREEN.width * 0.62), Math.round(SCREEN.height * 0.66))
    pass('each window carries its own board name at the X level, not just in the DOM')
    await delay(900)
    await new Promise((resolve, reject) => {
      const capture = spawn('ffmpeg', [
        '-y', '-loglevel', 'error', '-f', 'x11grab',
        '-video_size', `${SCREEN.width}x${SCREEN.height}`, '-i', display,
        '-frames:v', '1', SHOT,
      ], { stdio: 'ignore', env: { ...process.env, DISPLAY: display } })
      capture.on('error', reject)
      capture.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))))
    })
    assert.ok(existsSync(SHOT), 'the desktop capture was not written')
    pass('captured both windows from the X display')

    secondPage.close()
    page.close()
    await writeFile(RESULTS, JSON.stringify(checks.map((label) => ({ label, ok: true })), null, 1))
    console.log(`\n${checks.length} checks passed.`)
  } finally {
    close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
