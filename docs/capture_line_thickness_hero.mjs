#!/usr/bin/env node
/**
 * The hero recording for the line-thickness report: the reported bug and its
 * fix, driven on the real review fixture in a real browser.
 *
 * The journey is the one Zach will repeat by hand — pick Thick on a titled
 * rectangle, then pick Extra large and watch the outline hold — followed by
 * the same three rungs composed beside a connector's line styles.
 *
 * Frame capture and encoding follow `capture_async_region_representative_edge_hero.mjs`.
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { copyFile, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  delay,
  ensureDir,
  evaluate,
  openApp,
  startApp,
  waitFor,
} from '../tests/browser_harness.mjs'

const FIXTURE = join(ROOT, 'sketches', 'review', 'line-thickness.systemsketch')
const ASSETS = join(ROOT, 'docs', 'assets')
const VIDEO = join(ASSETS, 'line-thickness-hero-2026-09-06.mp4')
const GIF = join(ASSETS, 'line-thickness-hero-2026-09-06.gif')

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
    format: 'jpeg', quality: 82, everyNthFrame: 1, maxWidth: 1600, maxHeight: 1000,
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
  const directory = await mkdtemp(join(tmpdir(), 'systemsketch-thickness-hero-'))
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

async function viewportPoint(page, shapeId) {
  return JSON.parse(await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const bounds = editor.getShapePageBounds(${JSON.stringify(shapeId)})
    const point = editor.pageToViewport({ x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 })
    return JSON.stringify({ x: Math.round(point.x), y: Math.round(point.y) })
  })()`))
}

async function clickSelector(page, selector) {
  const point = JSON.parse(await evaluate(page, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) return 'null'
    const r = el.getBoundingClientRect()
    return JSON.stringify([Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)])
  })()`))
  assert.ok(point, `missing ${selector}`)
  await clickAt(page, point[0], point[1])
  await delay(280)
}

async function strokeWidth(page, shapeId) {
  return Number(await evaluate(page, `(() => {
    const el = document.querySelector('[data-shape-id=' + JSON.stringify(${JSON.stringify(shapeId)}) + ']')
    const painted = el && el.querySelector('[stroke]')
    return painted ? painted.getAttribute('stroke-width') : ''
  })()`))
}

async function main() {
  await ensureDir(ASSETS)
  // The fixture lives under the repo, which the host refuses to serve unless
  // the journey opts in — the same flag every fixture-driven capture uses.
  const app = await startApp({
    label: 'line-thickness-hero',
    allowSourceRoot: true,
    width: 1600,
    height: 1000,
  })
  try {
    // WHY a copy: the app autosaves into whatever board it opens, so driving
    // the committed fixture would leave it holding this recording's final
    // state — the reviewer would open a board that has already been used.
    // The copy goes in the run's own files root, which is the only directory
    // outside the source tree this host will serve.
    const board = join(app.filesRoot, 'line-thickness.systemsketch')
    await copyFile(FIXTURE, board)
    await openApp(app.page, app.port, `?board=${board}`)
    await waitFor(app.page, 'document.querySelector(".tl-canvas")', 'the canvas')
    await waitFor(app.page, 'window.__systemsketch?.editor?.getShape("shape:titled")',
      'the fixture rectangle', 30_000)
    await delay(900)

    const stop = await startCapture(app.page)
    // 1. Select the titled rectangle and open its Line style popover.
    const titled = await viewportPoint(app.page, 'shape:titled')
    await clickAt(app.page, titled.x, titled.y)
    await delay(700)
    await clickSelector(app.page, '.systemsketch-appearance__trigger[data-control="strokeColor"]')
    await waitFor(app.page,
      'document.querySelector(\'[data-testid="systemsketch-appearance-panel-strokeColor"]\')',
      'the Stroke popover')
    await delay(900)

    // 2. Walk the three rungs so the ladder is visible, ending on Thick.
    for (const rung of ['thin', 'thick', 'medium', 'thick']) {
      await clickSelector(app.page,
        `[data-testid="systemsketch-appearance-panel-strokeColor"] `
        + `.systemsketch-appearance__option[data-value="${rung}"]`)
      await delay(520)
    }
    const chosen = await strokeWidth(app.page, 'shape:titled')
    assert.equal(chosen, 7, 'the recording must show Thick actually painting 7')
    await clickSelector(app.page, '.systemsketch-appearance__trigger[data-control="strokeColor"]')
    await delay(600)

    // 3. THE BUG: Extra large grows the type and leaves the outline alone.
    await clickSelector(app.page, '.systemsketch-appearance__trigger[data-control="size"]')
    await waitFor(app.page,
      'document.querySelector(\'[data-testid="systemsketch-appearance-panel-size"]\')',
      'the Font size list')
    await delay(700)
    await clickSelector(app.page,
      '[data-testid="systemsketch-appearance-panel-size"] '
      + '.systemsketch-appearance__option[data-value="xl"]')
    await delay(1000)
    assert.equal(await strokeWidth(app.page, 'shape:titled'), chosen,
      'the recording must show the outline holding through the type change')
    await clickSelector(app.page, '.systemsketch-appearance__trigger[data-control="size"]')
    await delay(600)

    // 4. The same control on the connector: beside, labels off.
    //
    // Centre the camera on it first: the pill sits above the shape and its
    // popover above that, so a connector near the top of the viewport opens
    // its panel off-screen and every click on a rung lands on nothing.
    await evaluate(app.page, `(() => {
      const editor = window.__systemsketch.editor
      const bounds = editor.getShapePageBounds('shape:connector')
      editor.centerOnPoint({ x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 })
      return ''
    })()`)
    await delay(700)
    const connector = JSON.parse(await evaluate(app.page, `(() => {
      const editor = window.__systemsketch.editor
      const bounds = editor.getShapePageBounds('shape:connector')
      // Near the arrowhead, clear of the orange cue that crosses the elbow's
      // corner — clicking mid-span selected the cue arrow, not the connector.
      const point = editor.pageToViewport({ x: bounds.maxX - 60, y: bounds.maxY })
      return JSON.stringify({ x: Math.round(point.x), y: Math.round(point.y) })
    })()`))
    await clickAt(app.page, connector.x, connector.y)
    await delay(800)
    await clickSelector(app.page, '.systemsketch-appearance__trigger[data-control="lineStyle"]')
    await waitFor(app.page,
      'document.querySelector(\'[data-testid="systemsketch-appearance-panel-lineStyle"]\')',
      'the connector Line style popover')
    await delay(900)
    await clickSelector(app.page,
      '[data-testid="systemsketch-appearance-panel-lineStyle"] '
      + '.systemsketch-appearance__group .systemsketch-appearance__option[data-value="thick"]')
    await delay(1100)
    assert.equal(await strokeWidth(app.page, 'shape:connector'), 7,
      'the recording must show the connector taking the same rung')
    await delay(900)

    const frames = await stop()
    const kept = await encode(frames)
    console.log(JSON.stringify({ frames: frames.length, kept, video: VIDEO, gif: GIF }, null, 2))
  } finally {
    app.close()
  }
}

await main()
