#!/usr/bin/env node
/** Real-browser proof for Loop-body layout actions and empty-pill suppression. */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickElement,
  delay,
  ensureDir,
  evaluate,
  localConsoleErrors,
  makeChecklist,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const ASSETS = join(ROOT, 'docs', 'assets')
const SCREENSHOT = join(ASSETS, 'loop-contents-layout-live-2026-09-03.png')
const AFTER = join(ASSETS, 'loop-contents-layout-organized-2026-09-03.png')
const RESULTS = join(ASSETS, 'loop-contents-layout-results-2026-09-03.json')
const { checks, pass } = makeChecklist()

const SEED = `(() => {
  const editor = window.__systemsketch.editor
  const port = (id, name) => ({ id, name, type: 'Pose', visible: true })
  const block = (id, parentId, x, y, title) => ({
    id, type: 'block', parentId, x, y,
    props: {
      w: 250, h: 160, title, view: 'port',
      inputs: [port('in0', 'in')],
      outputs: [port('out0', 'out')],
    },
  })
  const cable = (id, parentId) => ({
    id, type: 'connection', parentId, x: 0, y: 0,
    props: {
      start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, routing: 'elbow',
      curve: null, pins: [], elbowRoute: null,
    },
  })
  const weld = (fromId, toId, terminal, portId) => ({
    type: 'connection', fromId, toId, props: { terminal, portId, face: 'outer' },
  })

  const loop = {
    id: 'shape:layout-loop', type: 'loop', parentId: 'page:page', x: 180, y: 100,
    props: {
      w: 1540, h: 820, title: 'For each pose',
      iterable: { id: 'iterable', type: 'Poses' },
      item: { id: 'item', type: 'Pose' }, turn: '',
    },
  }
  const emptyLoop = {
    id: 'shape:empty-loop', type: 'loop', parentId: 'page:page', x: 1850, y: 100,
    props: {
      w: 440, h: 320, title: 'No contents',
      iterable: { id: 'iterable', type: 'Poses' },
      item: { id: 'item', type: 'Pose' }, turn: '',
    },
  }
  const decode = block('shape:loop-decode', loop.id, 810, 470, 'decode()')
  const merge = block('shape:loop-merge', loop.id, 120, 520, 'merge()')
  const encode = block('shape:loop-encode', loop.id, 510, 130, 'encode()')
  const firstCable = cable('shape:loop-cable-one', loop.id)
  const secondCable = cable('shape:loop-cable-two', loop.id)
  const exterior = block('shape:exterior-sentinel', 'page:page', 2360, 610, 'Outside')

  editor.run(() => {
    editor.createShapes([loop, emptyLoop, exterior])
    editor.createShapes([decode, merge, encode])
    editor.createShapes([firstCable, secondCable])
    editor.createBindings([
      weld(firstCable.id, decode.id, 'start', 'out0'),
      weld(firstCable.id, merge.id, 'end', 'in0'),
      weld(secondCable.id, merge.id, 'start', 'out0'),
      weld(secondCable.id, encode.id, 'end', 'in0'),
    ])
  })
  window.__loopContentsLayout = {
    loop: loop.id,
    emptyLoop: emptyLoop.id,
    children: [decode.id, merge.id, encode.id],
    cables: [firstCable.id, secondCable.id],
    exterior: exterior.id,
  }
  editor.select(loop.id)
  editor.zoomToSelection({ animation: { duration: 0 } })
  return true
})()`

async function menuState(page) {
  return JSON.parse(await evaluate(page, `(() => JSON.stringify({
    menu: Boolean(document.querySelector('[data-testid="systemsketch-selection-menu"]')),
    tidy: Boolean(document.querySelector('[data-testid="selection-action-tidy-edges"]')),
    organize: Boolean(document.querySelector('[data-testid="selection-action-organize-nodes"]')),
  }))()`))
}

async function childState(page) {
  return JSON.parse(await evaluate(page, `(() => JSON.stringify(
    window.__loopContentsLayout.children.map((id) => {
      const shape = window.__systemsketch.editor.getShape(id)
      return { id, parentId: shape.parentId, x: shape.x, y: shape.y, w: shape.props.w, h: shape.props.h }
    })
  ))()`))
}

async function main() {
  await ensureDir(ASSETS)
  const app = await startApp({
    label: 'systemsketch-loop-contents-layout',
    build: 'loop-contents-layout-smoke',
    width: 1560,
    height: 960,
  })
  const board = join(app.filesRoot, 'SystemSketch', 'loop-contents-layout.systemsketch')
  try {
    await ensureDir(join(app.filesRoot, 'SystemSketch'))
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, 'window.__systemsketch?.editor', 'scratch board editor', 30_000)
    await evaluate(app.page, SEED)
    await waitFor(app.page, `document.querySelector('[data-testid="selection-action-organize-nodes"]')`, 'Loop organize action')
    assert.deepEqual(await menuState(app.page), { menu: true, tidy: true, organize: true })
    pass('a selected Loop with three direct Blocks exposes Tidy edges and Organize nodes')

    const exteriorBefore = JSON.parse(await evaluate(app.page, `JSON.stringify((() => {
      const shape = window.__systemsketch.editor.getShape(window.__loopContentsLayout.exterior)
      return { x: shape.x, y: shape.y, parentId: shape.parentId }
    })())`))
    const childrenBefore = await childState(app.page)
    await clickElement(app.page, '[data-testid="selection-action-tidy-edges"]')
    await delay(300)
    assert.equal(await evaluate(app.page, `window.__loopContentsLayout.cables.every((id) =>
      window.__systemsketch.editor.getShape(id).parentId === window.__loopContentsLayout.loop)`), true)
    pass('Tidy edges stays inside the selected Loop and preserves its cable ownership')

    const capture = await app.page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(SCREENSHOT, Buffer.from(capture.data, 'base64'))
    await clickElement(app.page, '[data-testid="selection-action-organize-nodes"]')
    await waitFor(app.page, `(() => {
      const before = ${JSON.stringify(childrenBefore)}
      return window.__loopContentsLayout.children.some((id, index) => {
        const shape = window.__systemsketch.editor.getShape(id)
        return Math.abs(shape.x - before[index].x) > .5 || Math.abs(shape.y - before[index].y) > .5
      })
    })()`, 'Loop body organization', 30_000)
    const childrenAfter = await childState(app.page)
    assert.notDeepEqual(childrenAfter, childrenBefore)
    assert.equal(await evaluate(app.page, `(() => {
      const editor = window.__systemsketch.editor
      const loop = editor.getShape(window.__loopContentsLayout.loop)
      return window.__loopContentsLayout.children.every((id) => {
        const child = editor.getShape(id)
        return child.parentId === loop.id
          && child.x >= 0 && child.x + child.props.w <= loop.props.w
          && child.y >= 56 && child.y + child.props.h <= loop.props.h - 30
      })
    })()`), true)
    assert.deepEqual(JSON.parse(await evaluate(app.page, `JSON.stringify((() => {
      const shape = window.__systemsketch.editor.getShape(window.__loopContentsLayout.exterior)
      return { x: shape.x, y: shape.y, parentId: shape.parentId }
    })())`)), exteriorBefore)
    const organizedCapture = await app.page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(AFTER, Buffer.from(organizedCapture.data, 'base64'))
    pass('Organize nodes reflows only direct Loop children, keeps them in the open body, and leaves exterior content unchanged')

    await evaluate(app.page, `(() => {
      window.__systemsketch.editor.select(window.__loopContentsLayout.emptyLoop)
      return true
    })()`)
    await delay(420)
    assert.deepEqual(await menuState(app.page), { menu: false, tidy: false, organize: false })
    pass('a selected Loop with no applicable actions has no contextual menu instead of an empty pill')

    assert.deepEqual(localConsoleErrors(app.page), [])
    pass('the Loop layout journey produces zero local console errors')
    await writeFile(RESULTS, JSON.stringify(checks.map((label) => ({ label, ok: true })), null, 2))
    process.stdout.write(`\n  ${checks.length}/${checks.length} browser checks passed\n  ${SCREENSHOT}\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`\n  FAIL  ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
