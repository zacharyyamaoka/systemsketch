#!/usr/bin/env node
/**
 * Real-pointer proof that an Expanded Block can be moved by its footer and
 * port text while the open middle remains the child canvas.
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  delay,
  drag,
  evaluate,
  localConsoleErrors,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'
import { box, deselect, shot } from './block_journey_helpers.mjs'

const BLOCK_ID = 'shape:footer-drag-review'
const RESULTS = join(ROOT, 'docs', 'assets', 'expanded-footer-drag-results.json')
const scope = `[data-shape-id="${BLOCK_ID}"]`

async function face(page) {
  return box(page, `${scope} .systemsketch-block-canvas`)
}

function delta(before, after) {
  return { x: after.x - before.x, y: after.y - before.y }
}

function near(actual, expected, label) {
  assert.ok(
    Math.abs(actual.x - expected.x) < 4 && Math.abs(actual.y - expected.y) < 4,
    `${label}: expected ${JSON.stringify(expected)}, observed ${JSON.stringify(actual)}`,
  )
}

async function seed(page) {
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    editor.deleteShapes([...editor.getCurrentPageShapeIds()])
    editor.createShape({
      id: ${JSON.stringify(BLOCK_ID)},
      type: 'block',
      x: 260,
      y: 160,
      props: {
        title: 'merge()',
        blockType: 'call',
        description: '',
        showDescription: false,
        view: 'expanded',
        w: 560,
        h: 380,
        views: {
          simple: { w: 320, h: 206 },
          port: { w: 340, h: 198 },
          expanded: { w: 560, h: 380 },
          value: { w: 168, h: 56 },
        },
        portLayout: 'inline',
        inputs: [
          { id: 'in_1', name: 'pose', type: 'Pose', visible: true },
          { id: 'in_2', name: 'other', type: 'Pose', visible: true, row: 2 },
        ],
        outputs: [{ id: 'out_1', name: 'result', type: 'Pose', visible: true }],
      },
    })
    editor.setCamera({ x: 0, y: 0, z: 1 })
    editor.select(${JSON.stringify(BLOCK_ID)})
  })()`)
  await waitFor(page, `document.querySelector(${JSON.stringify(`${scope} .NodeShape-footer`)})`, 'expanded footer')
  await delay(300)
}

async function main() {
  const app = await startApp({ label: 'expanded-footer-drag', width: 1440, height: 960 })
  const results = {}
  try {
    const { page } = app
    await openApp(page, app.port, '?preset=block-dev')
    await waitFor(page,
      `document.querySelector('[data-development-profile="block-dev"] .tl-container')`,
      'Block Dev canvas')
    await waitFor(page, 'Boolean(window.__systemsketch?.editor)', 'development editor seam')
    await seed(page)
    await shot(page, 'expanded-footer-drag-before-2026-09-02.png')

    // The exact reported gesture: the Block is already selected, then its
    // quiet left side of the footer is grabbed and dragged.
    const selectedBefore = await face(page)
    const selectedFooter = await box(page, `${scope} .NodeShape-footer`)
    const selectedFrom = { x: selectedFooter.x + 28, y: selectedFooter.cy }
    const selectedMove = { x: 118, y: 64 }
    await drag(page, selectedFrom, {
      x: selectedFrom.x + selectedMove.x,
      y: selectedFrom.y + selectedMove.y,
    })
    const selectedAfter = await face(page)
    results.selectedFooter = delta(selectedBefore, selectedAfter)
    near(results.selectedFooter, selectedMove, 'selected footer drag')

    // A cold footer drag must work too; selection is not a prerequisite.
    await deselect(page, { x: 1030, y: 820 })
    const coldBefore = await face(page)
    const coldFooter = await box(page, `${scope} .NodeShape-footer`)
    const coldFrom = { x: coldFooter.x + 34, y: coldFooter.cy }
    const coldMove = { x: -72, y: 42 }
    await drag(page, coldFrom, { x: coldFrom.x + coldMove.x, y: coldFrom.y + coldMove.y })
    const coldAfter = await face(page)
    results.coldFooter = delta(coldBefore, coldAfter)
    near(results.coldFooter, coldMove, 'cold footer drag')

    // Port words are the other requested new handle. Drag from a painted name,
    // not from the dot or the empty half of its positioned label rectangle.
    await deselect(page, { x: 1030, y: 820 })
    const textBefore = await face(page)
    const portName = await box(page, `${scope} .BlockNode-portLabel--in .BlockNode-portName`)
    const textMove = { x: 84, y: -48 }
    await drag(page, { x: portName.cx, y: portName.cy }, {
      x: portName.cx + textMove.x,
      y: portName.cy + textMove.y,
    })
    const textAfter = await face(page)
    results.portText = delta(textBefore, textAfter)
    near(results.portText, textMove, 'port-text drag')

    // The frame is still a frame: a drag from its middle starts on the canvas
    // and must not translate the parent Block.
    await deselect(page, { x: 1030, y: 820 })
    const interiorBefore = await face(page)
	const interiorFrom = {
	  x: interiorBefore.x + interiorBefore.w * 0.54,
	  y: interiorBefore.y + interiorBefore.h * 0.68,
	}
    await drag(page,
      interiorFrom,
      { x: interiorFrom.x + 96, y: interiorFrom.y + 54 })
    const interiorAfter = await face(page)
    results.interior = delta(interiorBefore, interiorAfter)
    near(results.interior, { x: 0, y: 0 }, 'interior drag')

    await shot(page, 'expanded-footer-drag-after-2026-09-02.png')
    results.consoleErrors = localConsoleErrors(page)
    assert.deepEqual(results.consoleErrors, [])
    await writeFile(RESULTS, `${JSON.stringify(results, null, 2)}\n`)

    process.stdout.write('  PASS  selected footer drag moves the Expanded Block\n')
    process.stdout.write('  PASS  cold footer drag moves the Expanded Block\n')
    process.stdout.write('  PASS  port text drag moves the Expanded Block\n')
    process.stdout.write('  PASS  interior drag leaves the frame in place\n')
    process.stdout.write(`  ${RESULTS}\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`\n  FAILED  ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
