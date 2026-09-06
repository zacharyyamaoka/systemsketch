#!/usr/bin/env node
/** Drive the saved Definition icon review board through the real inspector. */
import assert from 'node:assert/strict'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickElement,
  delay,
  drag,
  evaluate,
  localConsoleErrors,
  makeChecklist,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const FIXTURE = join(ROOT, 'sketches', 'review', 'definition-icon-scope.systemsketch')
const SHOT = join(ROOT, 'docs', 'assets', 'definition-icon-scope-fixture-driven-2026-09-06.png')
const RESULTS = join(ROOT, 'docs', 'assets', 'definition-icon-scope-fixture-driven-2026-09-06.json')
const { checks, pass } = makeChecklist()

async function blockBox(page, shapeId) {
  const box = await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const bounds = editor.getShapePageBounds(${JSON.stringify(shapeId)})
    if (!bounds) return null
    const a = editor.pageToViewport({ x: bounds.x, y: bounds.y })
    const b = editor.pageToViewport({ x: bounds.maxX, y: bounds.maxY })
    return JSON.stringify({ x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y })
  })()`)
  return box ? JSON.parse(box) : null
}

async function fixtureState(page) {
  return JSON.parse(await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const ingest = editor.getShape('shape:ingest')
    const parse = editor.getShape('shape:validate')
    const cueArrowsBoundToIngest = editor.getCurrentPageShapes()
      .filter((shape) => shape.type === 'arrow')
      .filter((arrow) => editor.getBindingsFromShape(arrow.id, 'arrow')
        .some((binding) => binding.toId === 'shape:ingest')).length
    return JSON.stringify({
      ingest: { x: ingest.x, y: ingest.y, icon: ingest.props.icon },
      parse: { icon: parse.props.icon },
      cueArrowsBoundToIngest,
    })
  })()`))
}

async function main() {
  const app = await startApp({ label: 'definition-icon-scope-fixture', build: 'definition-icon-scope-fixture' })
  const results = {}
  try {
    const scratchDir = join(app.filesRoot, 'SystemSketch')
    const scratch = join(scratchDir, 'definition-icon-scope-copy.systemsketch')
    await mkdir(scratchDir, { recursive: true })
    await copyFile(FIXTURE, scratch)
    await openApp(app.page, app.port, `?board=${encodeURIComponent(scratch)}`)
    await waitFor(app.page, `window.__systemsketch?.editor?.getShape('shape:ingest')`, 'the saved review board')
    await delay(400)

    results.before = await fixtureState(app.page)
    assert.equal(results.before.ingest.icon, 'Workflow')
    assert.equal(results.before.parse.icon, 'Braces')
    assert.equal(results.before.cueArrowsBoundToIngest, 1)

    const beforeBox = await blockBox(app.page, 'shape:ingest')
    assert.ok(beforeBox)
    await drag(app.page,
      { x: beforeBox.x + beforeBox.w / 2, y: beforeBox.y + beforeBox.h * 0.67 },
      { x: beforeBox.x + beforeBox.w / 2 + 90, y: beforeBox.y + beforeBox.h * 0.67 + 30 },
    )
    await delay(300)
    results.moved = await fixtureState(app.page)
    assert.ok(results.moved.ingest.x > results.before.ingest.x + 70)
    assert.ok(results.moved.ingest.y > results.before.ingest.y + 15)
    assert.equal(results.moved.cueArrowsBoundToIngest, 1)
    pass('moving the fixture Block keeps its orange step cue bound')

    await waitFor(app.page, `document.querySelector('[aria-label="Icon: Workflow. Change icon"]')`, 'the Details icon control')
    await clickElement(app.page, '[aria-label="Icon: Workflow. Change icon"]')
    await waitFor(app.page, `document.querySelector('[role="option"][title="terminal"]')`, 'the terminal icon choice')
    await clickElement(app.page, '[role="option"][title="terminal"]')
    await waitFor(app.page, `(() => {
      const editor = window.__systemsketch.editor
      return editor.getShape('shape:ingest')?.props.icon === 'Terminal'
        && editor.getShape('shape:validate')?.props.icon === 'Braces'
    })()`, 'the peer icon to remain local')
    results.after = await fixtureState(app.page)
    pass('the inspector changes only the selected shared-Definition occurrence icon')

    await clickElement(app.page, '[aria-label="Close Block inspector"]')
    await waitFor(app.page, `!document.querySelector('[aria-label="Block inspector"]')`, 'the inspector to close')
    await evaluate(app.page, `(() => { window.__systemsketch.editor.selectNone(); return true })()`)
    await delay(200)
    const capture = await app.page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(SHOT, Buffer.from(capture.data, 'base64'))
    results.consoleErrors = localConsoleErrors(app.page)
    assert.deepEqual(results.consoleErrors, [])
    await writeFile(RESULTS, `${JSON.stringify(results, null, 2)}\n`)
    pass('the driven review board has no console errors')
    console.log(`definition icon scope fixture · ${checks.length} checks passed`)
    console.log(`screenshot · ${SHOT}`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  console.error(error.stack ?? error)
  process.exitCode = 1
})
