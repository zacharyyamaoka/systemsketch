#!/usr/bin/env node
/**
 * Record the keyboard flow: press 2, draw a Service, press 3, draw an Action,
 * press 3 again to put the tool away — then leave for Dataflow and watch the
 * same digits go back to the toolbar.
 *
 * The mouse never touches the DRAW group in this clip. Every frame is a real
 * `Page.screencastFrame` off the running app driven by real key and pointer
 * events; nothing here is animated or reconstructed.
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
  ensureDir,
  evaluate,
  mouse,
  openApp,
  shortcut,
  startApp,
  waitFor,
} from '../tests/browser_harness.mjs'

const BOARD = join(ROOT, 'sketches', 'review', 'communication-draw-hotkeys.systemsketch')
const ASSETS = join(ROOT, 'docs', 'assets', 'communication-draw-hotkeys')
const VIDEO = join(ASSETS, 'digits-hero.mp4')
const GIF = join(ASSETS, 'digits-hero.gif')
const REGION = 'shape:region'

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
  return JSON.parse(await evaluate(
    page,
    `JSON.stringify(window.__systemsketch.editor.pageToViewport(${JSON.stringify(point)}))`,
  ))
}

async function centreOf(page, shapeId) {
  const bounds = JSON.parse(await evaluate(
    page,
    `JSON.stringify(window.__systemsketch.editor.getShapePageBounds(${JSON.stringify(shapeId)}))`,
  ))
  return pagePoint(page, { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 })
}

async function dragSurfaces(page, from, to, steps = 18) {
  await mouse(page, 'mouseMoved', from.x, from.y)
  await delay(160)
  await mouse(page, 'mousePressed', from.x, from.y, { buttons: 1 })
  for (let step = 1; step <= steps; step += 1) {
    await mouse(page, 'mouseMoved',
      from.x + ((to.x - from.x) * step) / steps,
      from.y + ((to.y - from.y) * step) / steps,
      { buttons: 1 })
    await delay(26)
  }
  await mouse(page, 'mouseReleased', to.x, to.y)
  await delay(520)
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
  const directory = await mkdtemp(join(tmpdir(), 'systemsketch-communication-hero-'))
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
      : 1.6
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
    label: 'communication-draw-hotkeys-hero',
    build: 'communication-draw-hotkeys-hero',
    width: 1700,
    height: 1050,
  })
  try {
    const workspace = join(app.filesRoot, 'SystemSketch')
    await ensureDir(workspace)
    const board = join(workspace, 'communication-draw-hotkeys.systemsketch')
    await copyFile(BOARD, board)
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, `window.__systemsketch?.editor?.getShape(${JSON.stringify(REGION)})`, 'fixture region', 30_000)
    // Frame the two components and the bar above them, leaving the cue cards
    // out of shot: the clip has to show the DRAW group, since that is where
    // the only visible answer to a keystroke appears.
    await evaluate(app.page, `(() => {
      const editor = window.__systemsketch.editor
      const bounds = editor.getShapePageBounds(${JSON.stringify(REGION)})
      editor.setCamera({ x: -bounds.x + 340, y: -bounds.y + 230, z: 0.9 })
      editor.select(${JSON.stringify(REGION)})
      return true
    })()`)
    await delay(700)
    await waitFor(app.page, `document.querySelector('[data-testid="communication-lens-communication"]')`, 'region lens')

    const stop = await startCapture(app.page)

    await clickElement(app.page, '[data-testid="communication-lens-communication"]')
    await delay(1100)

    const mission = await centreOf(app.page, 'shape:mission')
    const robot = await centreOf(app.page, 'shape:robot')

    // 2 — Service arms, with the pointer nowhere near the bar.
    await shortcut(app.page, '2', 'Digit2')
    await delay(900)
    await dragSurfaces(app.page, mission, robot)
    await delay(700)

    // 3 — the same two cards, now an Action.
    await shortcut(app.page, '3', 'Digit3')
    await delay(800)
    await dragSurfaces(app.page, mission, robot)
    await delay(700)

    // 3 again puts the tool away, exactly as clicking the lit button would.
    await shortcut(app.page, '3', 'Digit3')
    await delay(900)

    // Dataflow has no DRAW group, so the digits belong to the toolbar again.
    await clickElement(app.page, '[data-testid="communication-lens-dataflow"]')
    await delay(1200)
    await shortcut(app.page, '4', 'Digit4')
    await delay(900)
    await shortcut(app.page, '1', 'Digit1')
    await delay(1200)

    const frames = await stop()
    const kept = await encode(frames)
    const wires = await evaluate(app.page, `window.__systemsketch.editor.getCurrentPageShapes().filter((shape) => shape.type === 'connection').length`)
    assert.equal(Number(wires), 5, `two keyboard-armed relationships are five legs, saw ${wires}`)
    process.stdout.write(`Captured ${frames.length} real screencast frames; encoded ${kept} hero frames; ${wires} cables generated\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
