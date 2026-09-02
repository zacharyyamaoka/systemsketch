#!/usr/bin/env node
/**
 * Real-browser proof that a collapsed Block is an opaque leaf.
 *
 * The scene is authored through the real Block, inspector and cable gestures.
 * Assertions read both projections that matter: the painted DOM must lose the
 * children and internal wires, while the editor records must remain unchanged
 * so re-expanding restores the exact same composite.
 */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  delay,
  ensureDir,
  evaluate,
  localConsoleErrors,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'
import {
  addPort,
  blockIds,
  box,
  cables,
  deselect,
  dragFrom,
  drawBlock,
  portDot,
  scope,
  setView,
} from './block_journey_helpers.mjs'

const SHOTS = join(ROOT, 'docs', 'assets')
const results = []

function check(id, label, observed, desired) {
  const ok = JSON.stringify(observed) === JSON.stringify(desired)
  results.push({ id, label, observed, desired, ok })
  process.stdout.write(
    `  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}\n`
    + (ok ? '' : `        observed=${JSON.stringify(observed)} desired=${JSON.stringify(desired)}\n`),
  )
}

async function shot(page, name) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(join(SHOTS, name), Buffer.from(capture.data, 'base64'))
}

async function recordCounts(page) {
  return JSON.parse(await evaluate(page, `(() => {
    const editor = window.__systemsketch?.editor
    const shapes = editor?.getCurrentPageShapes() ?? []
    return JSON.stringify({
      blocks: shapes.filter((shape) => shape.type === 'block').length,
      connections: shapes.filter((shape) => shape.type === 'connection').length,
      hidden: shapes.filter((shape) => editor.isShapeHidden(shape)).length,
    })
  })()`))
}

async function paintedCounts(page) {
  return {
    blocks: (await blockIds(page)).length,
    connections: await cables(page),
  }
}

async function selectBlock(page, shapeId) {
  const face = await box(page, `${scope(shapeId)} .systemsketch-block-canvas`)
  await clickAt(page, face.x + 24, face.y + 18)
  await delay(220)
}

async function addPortBlock(page, from, to, title) {
  await drawBlock(page, from, to, title)
  await addPort(page, 'inputs')
  await addPort(page, 'outputs')
  await setView(page, 'port')
  await deselect(page, { x: 90, y: 900 })
}

async function main() {
  await ensureDir(SHOTS)
  const app = await startApp({
    label: 'systemsketch-collapse-visibility',
    build: 'block-collapse-visibility',
    width: 1800,
    height: 1000,
  })
  const { page, port } = app

  try {
    await openApp(page, port, '?preset=block-dev')
    await waitFor(page,
      `document.querySelector('[data-development-profile="block-dev"] .tl-container')`,
      'Block Dev canvas')
    await delay(700)

    // The boundary composite.
    await drawBlock(page, { x: 150, y: 160 }, { x: 490, y: 360 }, 'run()')
    const [run] = await blockIds(page)
    await addPort(page, 'inputs')
    await addPort(page, 'outputs')
    await setView(page, 'expanded')
    // Fixture setup: enlarge only the active Expanded box. The Block began at
    // a normal leaf size, so its independent Simple / Port memories remain the
    // compact projections in the reported desired screenshots.
    await evaluate(page, `(() => {
      window.__systemsketch.editor.updateShape({
        id: ${JSON.stringify(run)}, type: 'block', props: { w: 1350, h: 600 }
      })
      return true
    })()`)
    await delay(300)
    await deselect(page, { x: 90, y: 900 })

    // Three real child Blocks, each adopted by the Expanded frame.
    const childBoxes = [
      [{ x: 240, y: 350 }, { x: 490, y: 520 }, 'decode()'],
      [{ x: 650, y: 350 }, { x: 900, y: 520 }, 'estimate()'],
      [{ x: 1060, y: 350 }, { x: 1310, y: 520 }, 'encode()'],
    ]
    const children = []
    for (const [from, to, title] of childBoxes) {
      const before = new Set(await blockIds(page))
      await addPortBlock(page, from, to, title)
      children.push((await blockIds(page)).find((id) => !before.has(id)))
    }
    const [decode, estimate, encode] = children

    const dots = {
      runIn: await box(page, portDot(run, 'input', 'in_1')),
      runOut: await box(page, portDot(run, 'output', 'out_1')),
      decodeIn: await box(page, portDot(decode, 'input', 'in_1')),
      decodeOut: await box(page, portDot(decode, 'output', 'out_1')),
      estimateIn: await box(page, portDot(estimate, 'input', 'in_1')),
      estimateOut: await box(page, portDot(estimate, 'output', 'out_1')),
      encodeIn: await box(page, portDot(encode, 'input', 'in_1')),
      encodeOut: await box(page, portDot(encode, 'output', 'out_1')),
    }
    for (const [from, to] of [
      [dots.runIn, dots.decodeIn],
      [dots.decodeOut, dots.estimateIn],
      [dots.estimateOut, dots.encodeIn],
      [dots.encodeOut, dots.runOut],
    ]) await dragFrom(page, from, to)
    await deselect(page, { x: 90, y: 900 })

    check('EXPANDED-1', 'Expanded paints the boundary and all three children',
      await paintedCounts(page), { blocks: 4, connections: 4 })
    check('EXPANDED-2', 'all authored records are live while Expanded',
      await recordCounts(page), { blocks: 4, connections: 4, hidden: 0 })
    await shot(page, 'block-collapse-expanded-2026-09-01.png')

    await selectBlock(page, run)
    await setView(page, 'simple')
    await deselect(page, { x: 90, y: 900 })
    check('SIMPLE-1', 'Simple paints only the boundary Block',
      await paintedCounts(page), { blocks: 1, connections: 0 })
    check('SIMPLE-2', 'Simple preserves every child and cable record',
      await recordCounts(page), { blocks: 4, connections: 4, hidden: 7 })
    await shot(page, 'block-collapse-simple-2026-09-01.png')

    await selectBlock(page, run)
    await setView(page, 'port')
    await deselect(page, { x: 90, y: 900 })
    check('PORT-1', 'Port paints only the boundary Block and its own ports',
      await paintedCounts(page), { blocks: 1, connections: 0 })
    check('PORT-2', 'Port preserves every child and cable record',
      await recordCounts(page), { blocks: 4, connections: 4, hidden: 7 })
    await shot(page, 'block-collapse-port-2026-09-01.png')

    await page.send('Page.reload')
    await waitFor(page,
      `document.querySelector('[data-development-profile="block-dev"] .tl-container')`,
      'reloaded Block Dev canvas')
    await delay(1200)
    check('RELOAD-1', 'the opaque Port projection survives reload',
      await paintedCounts(page), { blocks: 1, connections: 0 })
    check('RELOAD-2', 'reload still retains the hidden composite records',
      await recordCounts(page), { blocks: 4, connections: 4, hidden: 7 })

    await selectBlock(page, run)
    await setView(page, 'expanded')
    await deselect(page, { x: 90, y: 900 })
    check('RESTORE-1', 're-expanding restores the exact painted composite',
      await paintedCounts(page), { blocks: 4, connections: 4 })
    check('RESTORE-2', 're-expanding reveals rather than recreates records',
      await recordCounts(page), { blocks: 4, connections: 4, hidden: 0 })
    check('CLEAN', 'the journey raised no local console errors', localConsoleErrors(page), [])

    const failed = results.filter((result) => !result.ok)
    process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`)
    await writeFile(
      join(SHOTS, 'block-collapse-visibility-2026-09-01.json'),
      JSON.stringify(results, null, 2),
    )
    if (failed.length > 0) process.exitCode = 1
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
