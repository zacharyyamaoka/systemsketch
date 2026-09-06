#!/usr/bin/env node
/** Capture the real saved-fixture click journey as the gallery's MP4 and GIF. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  delay,
  evaluate,
  localConsoleErrors,
  openApp,
  startApp,
  waitFor,
} from '../tests/browser_harness.mjs'

const FIXTURE = join(ROOT, 'sketches', 'review', 'branch-edge-selection.systemsketch')
const MP4 = join(ROOT, 'docs', 'assets', 'branch-edge-selection-hero-2026-09-06.mp4')
const GIF = join(ROOT, 'docs', 'assets', 'branch-edge-selection-hero-2026-09-06.gif')

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' })
    child.on('error', reject)
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)))
  })
}

async function cablePoint(page) {
  const value = await evaluate(page, `(() => {
    const path = document.querySelector('[data-shape-id="shape:cable"] path')
    if (!path) return null
    const point = path.getPointAtLength(path.getTotalLength() * 0.5)
    const screen = new DOMPoint(point.x, point.y).matrixTransform(path.getScreenCTM())
    return JSON.stringify({ x: screen.x, y: screen.y })
  })()`)
  if (!value) throw new Error('Missing painted fixture cable')
  return JSON.parse(value)
}

async function main() {
  const frames = await mkdtemp(join(tmpdir(), 'systemsketch-branch-edge-hero-'))
  const app = await startApp({
    label: 'systemsketch-branch-edge-hero',
    build: 'branch-edge-hero',
    width: 1600,
    height: 960,
  })
  let index = 0
  const capture = async () => {
    const image = await app.page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(join(frames, `frame-${String(index++).padStart(3, '0')}.png`), Buffer.from(image.data, 'base64'))
  }
  try {
    const scratchDir = join(app.filesRoot, 'SystemSketch')
    const scratch = join(scratchDir, 'branch-edge-selection-hero.systemsketch')
    await mkdir(scratchDir, { recursive: true })
    await copyFile(FIXTURE, scratch)
    await openApp(app.page, app.port, `?board=${encodeURIComponent(scratch)}`)
    await waitFor(app.page, `window.__systemsketch?.editor?.getShape('shape:cable')`, 'saved review board')
    await delay(500)

    // Two quiet seconds let the prepared instruction and its real semantic wire read.
    for (let i = 0; i < 8; i += 1) {
      await capture()
      await delay(250)
    }

    const point = await cablePoint(app.page)
    await clickAt(app.page, point.x, point.y)
    await waitFor(app.page,
      `window.__systemsketch.editor.getOnlySelectedShapeId() === 'shape:cable'`,
      'interior wire selection')
    await waitFor(app.page, `document.querySelector('[aria-label="Connection inspector"]')`, 'Connection inspector')

    // Five actual seconds show the selected wire, live handles, and inspector.
    for (let i = 0; i < 20; i += 1) {
      await capture()
      await delay(250)
    }
    assert.deepEqual(localConsoleErrors(app.page), [])
  } finally {
    app.close()
  }
  try {
    await ffmpeg(['-framerate', '4', '-i', join(frames, 'frame-%03d.png'),
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', MP4])
    await ffmpeg(['-framerate', '4', '-i', join(frames, 'frame-%03d.png'),
      '-vf', 'fps=4,scale=960:-1:flags=lanczos', '-loop', '0', GIF])
    console.log(`captured ${index / 4}s real-browser journey → ${MP4} and ${GIF}`)
  } finally {
    await rm(frames, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error.stack ?? error)
  process.exitCode = 1
})
