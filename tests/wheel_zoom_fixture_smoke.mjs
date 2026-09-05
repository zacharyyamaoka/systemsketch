#!/usr/bin/env node
/** Drive the committed review fixture through its cue and wheel interactions. */
import assert from 'node:assert/strict'
import { copyFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  delay,
  drag,
  elementBox,
  evaluate,
  localConsoleErrors,
  makeChecklist,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const FIXTURE = join(ROOT, 'sketches', 'review', 'wheel-zoom.systemsketch')
const DRIVEN_SCREENSHOT = '/tmp/systemsketch-wheel-zoom-fixture-driven.png'
const { checks, pass } = makeChecklist()

async function arrowBounds(page) {
  return JSON.parse(await evaluate(
    page,
    `JSON.stringify(window.__systemsketch.editor.getShapePageBounds('shape:cue-step-2-arrow'))`,
  ))
}

async function main() {
  const app = await startApp({ label: 'wheel-zoom-fixture', build: 'wheel-zoom-fixture-smoke', width: 1280, height: 720 })
  try {
    const board = join(app.filesRoot, 'wheel-zoom-driven.systemsketch')
    await copyFile(FIXTURE, board)
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, `document.querySelector('[data-shape-type="block"]')`, 'the fixture target Block')
    await waitFor(app.page, 'window.__systemsketch?.editor', 'the fixture editor')
    await delay(300)

    const target = await elementBox(app.page, '[data-shape-type="block"]')
    const arrowBefore = await arrowBounds(app.page)
    await drag(
      app.page,
      { x: target.x + target.w / 2, y: target.y + target.h / 2 },
      { x: target.x + target.w / 2 + 70, y: target.y + target.h / 2 },
    )
    const arrowAfter = await arrowBounds(app.page)
    assert.notDeepEqual(arrowAfter, arrowBefore)
    pass('moving the real target Block reroutes its bound orange cue arrow')

    const zoomBefore = await evaluate(app.page, 'window.__systemsketch.editor.getZoomLevel()')
    await app.page.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: target.x + target.w / 2,
      y: target.y + target.h / 2,
      deltaX: 0,
      deltaY: 120,
      modifiers: 0,
    })
    await delay(400)
    const zoomAfter = await evaluate(app.page, 'window.__systemsketch.editor.getZoomLevel()')
    assert.ok(zoomAfter > zoomBefore)
    pass(`the fixture's literal no-Ctrl scroll-down gesture zooms in (${zoomBefore.toFixed(2)} → ${zoomAfter.toFixed(2)})`)

    const capture = await app.page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(DRIVEN_SCREENSHOT, Buffer.from(capture.data, 'base64'))
    assert.deepEqual(localConsoleErrors(app.page), [])
    pass('the driven fixture emits no local console errors')
    process.stdout.write(`\n${checks.length} checks passed · ${DRIVEN_SCREENSHOT}\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  console.error(error.stack ?? error)
  process.exitCode = 1
})
