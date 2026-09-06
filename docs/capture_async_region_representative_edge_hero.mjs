#!/usr/bin/env node
/** Capture the real representative-edge selector journey for the Async-region gallery. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  clickElement,
  delay,
  elementBox,
  ensureDir,
  evaluate,
  key,
  mouse,
  openApp,
  startApp,
  waitFor,
} from '../tests/browser_harness.mjs'

const BOARD = join(ROOT, 'sketches', 'review', 'async-region-stress.systemsketch')
const ASSETS = join(ROOT, 'docs', 'assets', 'async-region-stress')
const VIDEO = join(ASSETS, 'representative-edge-hero.mp4')
const GIF = join(ASSETS, 'representative-edge-hero.gif')
const REGION = 'shape:async-region-stress'

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

async function pagePoint(page, point) {
  return JSON.parse(await evaluate(page, `JSON.stringify(window.__systemsketch.editor.pageToViewport(${JSON.stringify(point)}))`))
}

async function chooseNextOption(page, selector, steps = 1) {
  await clickElement(page, selector)
  for (let index = 0; index < steps; index += 1) await key(page, 'ArrowDown')
  await key(page, 'Enter')
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
  const directory = await mkdtemp(join(tmpdir(), 'systemsketch-carrier-hero-'))
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

async function main() {
  await ensureDir(ASSETS)
  const app = await startApp({
    label: 'async-region-carrier-hero',
    build: 'async-region-carrier-hero',
    allowSourceRoot: true,
    width: 1920,
    height: 1100,
  })
  try {
    await openApp(app.page, app.port, `?board=${encodeURIComponent(BOARD)}`)
    await waitFor(app.page, `window.__systemsketch?.editor?.getShape(${JSON.stringify(REGION)})`, 'stress Async region', 30_000)
    const regionBounds = JSON.parse(await evaluate(app.page, `JSON.stringify(window.__systemsketch.editor.getShapePageBounds(${JSON.stringify(REGION)}))`))
    const border = await pagePoint(app.page, { x: regionBounds.x + 2, y: regionBounds.y + regionBounds.h * 0.56 })
    await clickAt(app.page, border.x, border.y)
    await waitFor(app.page, `document.querySelector('[data-testid="communication-prototype-controls"]')`, 'communication controls')

    const stopCapture = await startCapture(app.page)
    await delay(900)
    await clickElement(app.page, '[data-testid="communication-mode-components"]')
    await waitFor(app.page, `document.querySelectorAll('[data-communication-mode="components"]').length === 9`, 'component relationships')
    await delay(1200)

    await chooseNextOption(app.page, '[data-testid="communication-service-track"]')
    await waitFor(app.page, `document.querySelector('[data-communication-id="S2"]')?.getAttribute('data-communication-representative-phase') === 'response'`, 'Service response track')
    await delay(900)
    await chooseNextOption(app.page, '[data-testid="communication-action-track"]', 2)
    await waitFor(app.page, `document.querySelector('[data-communication-id="A2"]')?.getAttribute('data-communication-representative-phase') === 'result'`, 'Action result track')
    await delay(1300)

    await chooseNextOption(app.page, '[data-testid="communication-service-track"]')
    await chooseNextOption(app.page, '[data-testid="communication-action-track"]')
    await waitFor(app.page, `document.querySelector('[data-communication-id="A2"]')?.getAttribute('data-communication-representative-policy') === 'shortest'`, 'shortest Action track')
    await delay(1700)

    const focus = await elementBox(app.page, '[data-communication-mode="components"][data-communication-id="A2"] [data-communication-focus-hit]')
    await mouse(app.page, 'mouseMoved', focus.cx, focus.cy)
    await delay(500)
    await clickAt(app.page, focus.cx, focus.cy)
    await waitFor(app.page, `document.querySelector('[data-testid="communication-prototype-status"]')?.textContent.includes('A2 focused · 4 legs')`, 'A2 focus')
    await delay(1600)

    const frames = await stopCapture()
    const kept = await encode(frames)
    process.stdout.write(`Captured ${frames.length} real screencast frames; encoded ${kept} representative-edge hero frames\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
