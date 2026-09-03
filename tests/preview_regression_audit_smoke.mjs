#!/usr/bin/env node
/** Drive the disposable Preview-audit review board through its one handoff gesture. */
import assert from 'node:assert/strict'
import { copyFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  delay,
  drag,
  elementBox,
  ensureDir,
  evaluate,
  localConsoleErrors,
  openApp,
  shortcut,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const FIXTURE = join(ROOT, 'sketches', 'review', 'preview-regression-audit.systemsketch')
const SCREENSHOT = join(ROOT, 'docs', 'assets', 'preview-regression-audit-drag-2026-09-03.png')

async function main() {
  const app = await startApp({ label: 'systemsketch-preview-audit-review', width: 1700, height: 1150 })
  const board = join(app.filesRoot, 'SystemSketch', 'preview-regression-audit.systemsketch')
  try {
    await ensureDir(join(app.filesRoot, 'SystemSketch'))
    await copyFile(FIXTURE, board)
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, `window.__systemsketch?.editor?.getShape('shape:decode')`, 'review fixture', 30_000)
    await waitFor(
      app.page,
      `document.querySelector('.systemsketch-diagnostics-trigger')?.getAttribute('aria-label') === 'Problems — 0 issues'`,
      'clean Problems count',
    )
    await evaluate(app.page, `void window.__systemsketch.editor.zoomToFit({ animation: { duration: 0 } })`)
    await delay(250)

    const before = JSON.parse(await evaluate(app.page, `(() => {
      const shape = window.__systemsketch.editor.getShape('shape:decode')
      return JSON.stringify({ x: shape.x, y: shape.y })
    })()`))
    const heading = await elementBox(app.page, '[data-shape-id="shape:decode"] .BlockNode-headingTitle')
    await drag(app.page, { x: heading.cx, y: heading.cy }, { x: heading.cx, y: heading.cy + 100 })

    const moved = JSON.parse(await evaluate(app.page, `(() => {
      const editor = window.__systemsketch.editor
      const shape = editor.getShape('shape:decode')
      const bindings = editor.getBindingsToShape('shape:decode', 'connection')
      return JSON.stringify({ x: shape.x, y: shape.y, bindings: bindings.length })
    })()`))
    assert.ok(moved.y > before.y + 80, `decode() moved only ${moved.y - before.y}px`)
    assert.equal(moved.bindings, 2)
    assert.equal(await evaluate(app.page, `document.querySelector('.systemsketch-diagnostics-trigger')?.getAttribute('aria-label')`), 'Problems — 0 issues')

    const capture = await app.page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(SCREENSHOT, Buffer.from(capture.data, 'base64'))

    await shortcut(app.page, 'z', 'KeyZ', 2)
    await waitFor(
      app.page,
      `Math.abs(window.__systemsketch.editor.getShape('shape:decode').y - ${before.y}) < 1`,
      'undo restoring decode()',
    )
    assert.deepEqual(localConsoleErrors(app.page), [])
    process.stdout.write(`Preview regression review fixture passed\n${SCREENSHOT}\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
