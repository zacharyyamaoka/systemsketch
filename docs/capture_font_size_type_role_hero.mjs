#!/usr/bin/env node
/**
 * The Font size combobox, driven on the real review board.
 *
 * The hero has to show the thing the report claims: three shapes whose menus
 * all say "Extra large" and whose rows now print 44, 32 and 24 — then a
 * cross-type selection that refuses to check any row, and one typed px that
 * actually makes two of them equal. Every frame is a real screencast frame of
 * the running app; stills are cropped from the same journey.
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { copyFile, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  ROOT,
  clickElement,
  delay,
  elementBox,
  ensureDir,
  evaluate,
  key,
  openApp,
  startApp,
  typeSlowly,
  waitFor,
} from '../tests/browser_harness.mjs'

const BOARD = join(ROOT, 'sketches', 'review', 'font-size-type-role.systemsketch')
const ASSETS = join(ROOT, 'docs', 'assets', 'font-size-type-role')
const VIDEO = join(ASSETS, 'font-size-hero.mp4')
const GIF = join(ASSETS, 'font-size-hero.gif')

async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
    let errorText = ''
    child.stderr.on('data', (chunk) => { errorText += chunk })
    child.on('error', reject)
    child.on('close', (code) => code === 0
      ? resolve()
      : reject(new Error(`${command} exited ${code}: ${errorText.trim()}`)))
  })
}

async function startCapture(page) {
  const frames = []
  let cursor = page.events.length
  let draining = false
  const drain = async () => {
    if (draining) return
    draining = true
    try {
      while (cursor < page.events.length) {
        const event = page.events[cursor++]
        if (event.method !== 'Page.screencastFrame') continue
        frames.push({
          data: event.params.data,
          timestamp: Number(event.params.metadata?.timestamp ?? 0),
        })
        await page.send('Page.screencastFrameAck', { sessionId: event.params.sessionId })
      }
    } finally {
      draining = false
    }
  }
  const timer = setInterval(() => { void drain() }, 20)
  await page.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 82,
    everyNthFrame: 1,
    maxWidth: 1600,
    maxHeight: 1000,
  })
  return async () => {
    await page.send('Page.stopScreencast')
    await delay(160)
    clearInterval(timer)
    await drain()
    return frames
  }
}

async function encode(frames) {
  assert.ok(frames.length >= 6, `expected at least six real screencast frames, received ${frames.length}`)
  const directory = await mkdtemp(join(tmpdir(), 'systemsketch-font-size-hero-'))
  const kept = frames.filter((frame, index) => (
    index === 0
    || index === frames.length - 1
    || frame.timestamp - frames[index - 1].timestamp >= 0.08
  ))
  const manifest = []
  for (let index = 0; index < kept.length; index += 1) {
    const path = join(directory, `${String(index).padStart(4, '0')}.jpg`)
    await writeFile(path, Buffer.from(kept[index].data, 'base64'))
    manifest.push(`file '${path}'`)
    const next = kept[index + 1]
    const duration = next
      ? Math.min(1.8, Math.max(0.08, next.timestamp - kept[index].timestamp))
      : 1.2
    manifest.push(`duration ${duration.toFixed(3)}`)
  }
  manifest.push(`file '${join(directory, `${String(kept.length - 1).padStart(4, '0')}.jpg`)}'`)
  const manifestPath = join(directory, 'frames.txt')
  await writeFile(manifestPath, `${manifest.join('\n')}\n`)

  await run('ffmpeg', [
    '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', manifestPath,
    '-vf', 'fps=12,scale=1280:-2:flags=lanczos,format=yuv420p',
    '-an', '-movflags', '+faststart', VIDEO,
  ])
  await run('ffmpeg', [
    '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', manifestPath,
    '-vf', 'fps=8,scale=900:-2:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=96[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3',
    '-loop', '0', GIF,
  ])
  return kept.length
}

/** Select shapes through the editor so the journey never mis-clicks a card. */
async function select(page, ids) {
  await evaluate(page, `(() => {
    window.__systemsketch.editor.setSelectedShapes(${JSON.stringify(ids)})
    return true
  })()`)
  await waitFor(page, `Boolean(document.querySelector('[data-control="size"][data-trigger="text"]'))`, `size trigger for ${ids.join('+')}`)
  await delay(420)
}

/**
 * Open the Font size popover. WHY the retry: the appearance pill remounts when
 * the selection changes, and a click that lands in that window is swallowed —
 * a real user just clicks again, and so does this.
 */
async function openSizePopover(page) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await clickElement(page, '[data-control="size"][data-trigger="text"]')
    await delay(320)
    const open = await evaluate(page, `Boolean(document.querySelector('[data-testid="font-size-custom"]'))`)
    if (open) return
  }
  throw new Error('Font size popover never opened')
}

async function readLadder(page) {
  return JSON.parse(await evaluate(page, `JSON.stringify([...document.querySelectorAll('[data-testid="systemsketch-appearance-panel-size"] .systemsketch-appearance__label-px')].map((node) => Number.parseFloat(node.textContent)))`))
}

/**
 * The pill plus its open popover, padded — recorded so the report can crop to
 * the thing under discussion instead of a hand-guessed rectangle that drifts
 * the moment the menu moves.
 */
async function cropBox(page) {
  return JSON.parse(await evaluate(page, `(() => {
    const nodes = [
      document.querySelector('[data-testid="systemsketch-appearance"]'),
      document.querySelector('[data-testid="systemsketch-appearance-panel-size"]'),
    ].filter(Boolean)
    const rects = nodes.map((node) => node.getBoundingClientRect())
    const pad = 28
    const left = Math.max(0, Math.min(...rects.map((r) => r.left)) - pad)
    const top = Math.max(0, Math.min(...rects.map((r) => r.top)) - pad)
    const right = Math.min(window.innerWidth, Math.max(...rects.map((r) => r.right)) + pad)
    const bottom = Math.min(window.innerHeight, Math.max(...rects.map((r) => r.bottom)) + pad)
    const dpr = window.devicePixelRatio || 1
    return JSON.stringify([left, top, right, bottom].map((value) => Math.round(value * dpr)))
  })()`))
}

async function shot(page, name) {
  const data = await page.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(join(ASSETS, name), Buffer.from(data.data, 'base64'))
}

async function main() {
  await ensureDir(ASSETS)
  const app = await startApp({
    label: 'font-size-type-role-hero',
    build: 'font-size-type-role-hero',
    width: 1600,
    height: 1000,
  })
  const measured = {}
  try {
    const { page, port } = app
    // WHY a copy: the app autosaves the board it has open, and this journey
    // deliberately changes a font size. Driving the committed review fixture
    // would leave it pre-answered for the human who opens it next.
    const scratch = join(app.filesRoot, 'font-size-type-role.systemsketch')
    await copyFile(BOARD, scratch)
    await openApp(page, port, `?board=${encodeURIComponent(scratch)}`)
    await waitFor(page, `window.__systemsketch?.editor?.getShape('shape:heading')`, 'review board', 30_000)
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      editor.zoomToFit()
      editor.selectNone()
      return true
    })()`)
    await delay(700)

    const stopCapture = await startCapture(page)
    await delay(700)

    // 1 — the heading: "Extra large", and the row says 44.
    await select(page, ['shape:heading'])
    await openSizePopover(page)
    measured.heading = await readLadder(page)
    measured.headingTrigger = await evaluate(page, `document.querySelector('[data-testid="font-size-trigger-px"]')?.textContent`)
    measured.box_heading = await cropBox(page)
    await delay(1500)
    await shot(page, 'menu-heading.png')

    // 2 — the sticky: the same two words, and the row says 32.
    await key(page, 'Escape')
    await select(page, ['shape:sticky'])
    await openSizePopover(page)
    measured.sticky = await readLadder(page)
    measured.stickyTrigger = await evaluate(page, `document.querySelector('[data-testid="font-size-trigger-px"]')?.textContent`)
    measured.box_sticky = await cropBox(page)
    await delay(1500)
    await shot(page, 'menu-sticky.png')

    // 3 — the Code block: the same two words again, and the row says 24.
    await key(page, 'Escape')
    await select(page, ['shape:snippet'])
    await openSizePopover(page)
    measured.snippet = await readLadder(page)
    measured.snippetTrigger = await evaluate(page, `document.querySelector('[data-testid="font-size-trigger-px"]')?.textContent`)
    measured.box_snippet = await cropBox(page)
    await delay(1500)
    await shot(page, 'menu-code.png')

    // 4 — heading + sticky together: no row may claim a shared size.
    await key(page, 'Escape')
    await select(page, ['shape:heading', 'shape:sticky'])
    await openSizePopover(page)
    measured.mixedChecked = await evaluate(page, `document.querySelectorAll('[data-testid="systemsketch-appearance-panel-size"] [role="menuitemradio"][aria-checked="true"]').length`)
    measured.mixedTrigger = await evaluate(page, `document.querySelector('[data-control="size"] .systemsketch-appearance__trigger-text')?.textContent`)
    measured.box_mixed = await cropBox(page)
    await delay(1600)
    await shot(page, 'menu-mixed.png')

    // 5 — one typed px, landed on both types.
    await clickElement(page, '[data-testid="font-size-custom"]')
    await evaluate(page, `(() => {
      const input = document.querySelector('[data-testid="font-size-custom"]')
      input.focus(); input.select(); return true
    })()`)
    await typeSlowly(page, '40')
    await key(page, 'Enter')
    await delay(900)
    // Divide by the camera: the board is framed with zoomToFit, so a raw
    // screen measurement would report 40 x zoom and read as a regression.
    measured.equalised = JSON.parse(await evaluate(page, `(() => {
      const zoom = window.__systemsketch.editor.getZoomLevel()
      const px = (id) => {
        const node = document.querySelector('[data-shape-id="' + id + '"] .tl-rich-text')
        if (!node) return null
        const font = Number.parseFloat(getComputedStyle(node).fontSize)
        const rect = node.getBoundingClientRect()
        return Math.round(font * (node.offsetWidth > 0 ? rect.width / node.offsetWidth : 1) / zoom)
      }
      return JSON.stringify([px('shape:heading'), px('shape:sticky')])
    })()`))
    await delay(1400)
    await shot(page, 'menu-equalised.png')

    const box = await elementBox(page, '[data-control="size"][data-trigger="text"]')
    measured.triggerWidth = box.width

    const frames = await stopCapture()
    const kept = await encode(frames)

    assert.deepEqual(measured.heading, [18, 24, 36, 44], 'text ladder')
    assert.deepEqual(measured.sticky, [18, 22, 26, 32], 'sticky ladder')
    assert.deepEqual(measured.snippet, [12, 16, 20, 24], 'code ladder')
    assert.equal(measured.mixedChecked, 0, 'no row checked across two type scales')
    assert.equal(measured.mixedTrigger, 'Mixed', 'combobox reads Mixed')
    assert.deepEqual(measured.equalised, [40, 40], 'one typed px landed on both')

    await writeFile(join(ASSETS, 'measured.json'), `${JSON.stringify(measured, null, 2)}\n`)
    process.stdout.write(`Captured ${frames.length} screencast frames; encoded ${kept}\n`)
    process.stdout.write(`${JSON.stringify(measured)}\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
