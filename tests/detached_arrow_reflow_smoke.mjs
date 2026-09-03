#!/usr/bin/env node
/**
 * A detached cable is briefly painted from its exact semantic snapshot, then
 * becomes a normal stock arrow as soon as either bound Block moves. Exercise
 * that hand-off with real pointer drags for both curved and elbow routes.
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  delay,
  drag,
  ensureDir,
  evaluate,
  localConsoleErrors,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'
import { box } from './block_journey_helpers.mjs'

const ASSETS = join(ROOT, 'docs', 'assets')
const BASELINE = join(ASSETS, 'detached-arrow-reflow-baseline.png')
const AFTER = join(ASSETS, 'detached-arrow-reflow-after.png')
const ACCEPTANCE = join(ASSETS, 'detached-arrow-reflow-acceptance.json')
const CAPTURE_BASELINE = process.env.CAPTURE_BASELINE === '1'

async function shot(page, path) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(path, Buffer.from(capture.data, 'base64'))
}

async function detach(page, blockId, expectedArrowCount) {
  const block = await box(page, `[data-shape-id="${blockId}"] .systemsketch-block-canvas`)
  await clickAt(page, block.cx, block.cy, 'right')
  const itemSelector = '[data-testid="context-menu.block-detach-to-primitives"]'
  await waitFor(page, `document.querySelector(${JSON.stringify(itemSelector)})`, 'Detach to primitives')
  const item = await box(page, itemSelector)
  await clickAt(page, item.cx, item.cy)
  await waitFor(page,
    `window.__systemsketch.editor.getCurrentPageShapes()
      .filter((shape) => shape.type === 'arrow').length === ${expectedArrowCount}`,
    `${expectedArrowCount} detached arrow${expectedArrowCount === 1 ? '' : 's'}`)
  const groupId = await evaluate(page, `window.__systemsketch.editor.getCurrentPageShapes()
    .find((shape) => shape.type === 'group'
      && shape.meta?.systemSketch?.kind === 'block'
      && shape.meta.systemSketch.props.title === ${JSON.stringify(blockId.endsWith('curve-target') ? 'curve target' : 'elbow target')})?.id`)
  assert.ok(groupId, `detaching ${blockId} creates a remembered Block group`)
  return groupId
}

async function moveGroup(page, groupId, dx, dy) {
  const before = await box(page, `[data-shape-id="${groupId}"]`)
  await clickAt(page, before.cx, before.cy)
  await delay(600)
  await drag(page, { x: before.cx, y: before.cy }, { x: before.cx + dx, y: before.cy + dy })
  const after = await box(page, `[data-shape-id="${groupId}"]`)
  assert.ok(Math.hypot(after.cx - before.cx, after.cy - before.cy) > 80,
    `${groupId} must move far enough to expose route reflow`)
  return { before, after }
}

async function arrowState(page) {
  return JSON.parse(await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const arrows = editor.getCurrentPageShapes().filter((shape) => shape.type === 'arrow')
      .map((shape) => ({
        id: shape.id,
        kind: shape.props.kind,
        exactBody: Boolean(document.querySelector(
          '[data-shape-id="' + shape.id + '"] [data-systemsketch-detached-edge="exact"]')),
        bindings: editor.getBindingsFromShape(shape.id, 'arrow').length,
        rememberedRouting: shape.meta?.systemSketch?.routing ?? null,
      }))
      .sort((a, b) => String(a.rememberedRouting).localeCompare(String(b.rememberedRouting)))
    return JSON.stringify(arrows)
  })()`))
}

async function main() {
  await ensureDir(ASSETS)
  const app = await startApp({
    label: 'detached-arrow-reflow', build: 'detached-arrow-reflow', width: 1440, height: 900,
  })
  const { page, port, filesRoot } = app
  try {
    const boardPath = join(filesRoot, 'SystemSketch', 'Detached Arrow Reflow.systemsketch')
    await openApp(page, port, `?board=${encodeURIComponent(boardPath)}`)
    await waitFor(page, 'window.__systemsketch?.editor', 'the editor')
    await delay(450)

    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const block = (id, title, x, y, side) => ({
        id, type: 'block', x, y,
        props: {
          title, blockType: 'Function', view: 'port', w: side === 'source' ? 250 : 320, h: 160,
          inputs: side === 'source' ? [] : [{ id: 'in_1', name: 'value', type: 'float', visible: true }],
          outputs: side === 'source' ? [{ id: 'out_1', name: 'result', type: 'float', visible: true }] : [],
        },
      })
      const cable = (id, routing) => ({
        id, type: 'connection', x: 0, y: 0,
        props: {
          start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, routing,
          curve: null, pins: [], elbowRoute: null, temporal: 'data', delayValue: '', pillPosition: 0.5,
        },
      })
      editor.createShapes([
        block('shape:curve-source', 'curve source', 80, 170, 'source'),
        block('shape:curve-target', 'curve target', 620, 120, 'target'),
        cable('shape:curve-cable', 'curved'),
        block('shape:elbow-source', 'elbow source', 80, 520, 'source'),
        block('shape:elbow-target', 'elbow target', 620, 470, 'target'),
        cable('shape:elbow-cable', 'elbow'),
      ])
      editor.createBindings([
        { type: 'connection', fromId: 'shape:curve-cable', toId: 'shape:curve-source',
          props: { portId: 'out_1', terminal: 'start', face: 'outer' } },
        { type: 'connection', fromId: 'shape:curve-cable', toId: 'shape:curve-target',
          props: { portId: 'in_1', terminal: 'end', face: 'outer' } },
        { type: 'connection', fromId: 'shape:elbow-cable', toId: 'shape:elbow-source',
          props: { portId: 'out_1', terminal: 'start', face: 'outer' } },
        { type: 'connection', fromId: 'shape:elbow-cable', toId: 'shape:elbow-target',
          props: { portId: 'in_1', terminal: 'end', face: 'outer' } },
      ])
      editor.selectNone()
      editor.zoomToFit({ animation: { duration: 0 } })
      return true
    })()`)
    await waitFor(page, `document.querySelectorAll('[data-shape-type="connection"]').length === 2`, 'two cables')
    await delay(400)

    const curveGroup = await detach(page, 'shape:curve-target', 1)
    const elbowGroup = await detach(page, 'shape:elbow-target', 2)
    const detached = await arrowState(page)
    assert.deepEqual(detached.map((arrow) => arrow.exactBody), [true, true],
      'both arrows initially keep the exact before/after snapshot')

    await moveGroup(page, curveGroup, 190, 90)
    await moveGroup(page, elbowGroup, 190, 90)
    await evaluate(page, 'window.__systemsketch.editor.selectNone(); true')
    await evaluate(page, 'window.__systemsketch.editor.zoomToFit({ animation: { duration: 0 } }); true')
    await delay(350)

    const moved = await arrowState(page)
    const result = {
      detached,
      moved,
      checks: {
        curvedUsesStockReflow: moved.some((arrow) => arrow.rememberedRouting === 'curved'
          && arrow.kind === 'arc' && !arrow.exactBody),
        elbowUsesStockReflow: moved.some((arrow) => arrow.rememberedRouting === 'elbow'
          && arrow.kind === 'elbow' && !arrow.exactBody),
        bindingsRemainLive: moved.length === 2 && moved.every((arrow) => arrow.bindings === 2),
        movementHasNoConsoleErrors: localConsoleErrors(page).length === 0,
      },
    }
    await shot(page, CAPTURE_BASELINE ? BASELINE : AFTER)
    if (!CAPTURE_BASELINE) {
      await writeFile(ACCEPTANCE, JSON.stringify(result, null, 2))
      assert.ok(Object.values(result.checks).every(Boolean), JSON.stringify(result, null, 2))
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
