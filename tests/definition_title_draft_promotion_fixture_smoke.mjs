#!/usr/bin/env node
/** Drive the committed review fixture through its two literal gestures. */
import assert from 'node:assert/strict'
import { copyFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickElement,
  delay,
  drag,
  evaluate,
  key,
  localConsoleErrors,
  makeChecklist,
  openApp,
  shortcut,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const FIXTURE = join(ROOT, 'sketches', 'review', 'definition-title-draft-promotion.systemsketch')
const SHOT = join(ROOT, 'docs', 'definition-title-draft-promotion-fixture-live-2026-09-05.png')
const { checks, pass } = makeChecklist()

async function shapeBox(page, shapeId) {
  return JSON.parse(await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const bounds = editor.getShapePageBounds(${JSON.stringify(shapeId)})
    if (!bounds) return 'null'
    const a = editor.pageToViewport({ x: bounds.x, y: bounds.y })
    const b = editor.pageToViewport({ x: bounds.maxX, y: bounds.maxY })
    return JSON.stringify({ x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y })
  })()`))
}

async function rename(page, shapeId, title) {
  await evaluate(page, `(() => { window.__systemsketch.editor.select(${JSON.stringify(shapeId)}); return true })()`)
  await waitFor(page, `document.querySelector('[aria-label="Block title"]')`, `${shapeId} title field`)
  await clickElement(page, '[aria-label="Block title"]')
  await shortcut(page, 'a', 'KeyA', 2)
  await page.send('Input.insertText', { text: title })
  await key(page, 'Enter', 'Enter')
}

async function main() {
  const app = await startApp({
    label: 'systemsketch-definition-title-draft-fixture',
    build: 'definition-title-draft-fixture-smoke',
    width: 1700,
    height: 1000,
  })
  const { page, port, filesRoot } = app
  const scratch = join(filesRoot, 'definition-title-draft-promotion.systemsketch')

  try {
    await copyFile(FIXTURE, scratch)
    await openApp(page, port, `?board=${encodeURIComponent(scratch)}`)
    await waitFor(page, `window.__systemsketch?.editor?.getShape('shape:component-e')`, 'the review fixture')

    const before = await shapeBox(page, 'shape:component-e')
    await drag(page,
      { x: before.x + before.w / 2, y: before.y + before.h / 2 },
      { x: before.x + before.w / 2 + 60, y: before.y + before.h / 2 })
    await waitFor(page,
      `window.__systemsketch.editor.getBindingsToShape('shape:component-e', 'arrow').some((binding) => binding.fromId === 'shape:cue-step-title-arrow')`,
      'the moved title target to keep its cue binding')
    pass('moving the first target keeps the orange instruction arrow attached')

    await rename(page, 'shape:component-e', 'ComponentE')
    await waitFor(page,
      `window.__systemsketch.editor.getShape('shape:component-c')?.props.title === 'ComponentC'
        && window.__systemsketch.editor.getShape('shape:component-e')?.props.title === 'ComponentE'`,
      'the occurrence-local title result')
    const ids = JSON.parse(await evaluate(page, `JSON.stringify([
      window.__systemsketch.editor.getShape('shape:component-c').props.definitionId,
      window.__systemsketch.editor.getShape('shape:component-e').props.definitionId,
    ])`))
    assert.notEqual(ids[0], ids[1])
    pass('Step 1 leaves ComponentC intact and detaches ComponentE')

    await rename(page, 'shape:queue-main', 'retired_queue()')
    await waitFor(page,
      `window.__systemsketch.editor.getShape('shape:queue-draft-1')?.props.draftOrdinal === undefined
        && window.__systemsketch.editor.getShape('shape:queue-draft-2')?.props.draftOrdinal === 2`,
      'the fixture Draft promotion')
    pass('Step 2 promotes Draft 1 and leaves Draft 2 numbered 2')

    await evaluate(page, `(() => { window.__systemsketch.editor.selectNone(); return true })()`)
    await delay(45)
    await clickElement(page, '[aria-label="Close Inspector"], [aria-label="Close Block inspector"]')
    await waitFor(page,
      `!document.querySelector('#systemsketch-right-popout')`,
      'the inspector to close before the evidence capture')
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      editor.zoomToFit({ animation: { duration: 0 } })
      return true
    })()`)
    await delay(250)
    const { data } = await page.send('Page.captureScreenshot', { format: 'png' })
    await writeFile(SHOT, Buffer.from(data, 'base64'))
    assert.deepEqual(await localConsoleErrors(page), [])
    pass('the real fixture journey finishes without console errors')

    console.log(`definition title + draft fixture · ${checks.length} checks passed`)
    console.log(`screenshot · ${SHOT}`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
