#!/usr/bin/env node
/** Exercise the review board where every generic-Block control is composed together. */
import assert from 'node:assert/strict'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import {
  ROOT,
  clickAt,
  delay,
  elementBox,
  evaluate,
  localConsoleErrors,
  makeChecklist,
  mouse,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const FIXTURE = join(ROOT, 'sketches', 'review', 'generic-block-integrated.systemsketch')
const SHOT = join(ROOT, 'docs', 'assets', 'generic-block-integrated-live-2026-09-05.png')
const PARENT = 'shape:generic-block'
const CHILD = 'shape:parse-member'
const TITLE_CHILD = 'shape:render-member'
const PORT = 'shape:velocity'
const { checks, pass } = makeChecklist()

const scope = (id) => `[data-shape-id=${JSON.stringify(id)}]`

async function shapeFacts(page, id) {
  return JSON.parse(await evaluate(page, `(() => {
    const shape = window.__systemsketch?.editor?.getShape(${JSON.stringify(id)})
    return JSON.stringify(shape ? {
      x: shape.x, y: shape.y, parentId: shape.parentId,
      w: shape.props.w, h: shape.props.h, props: shape.props,
    } : null)
  })()`))
}

async function selectShape(page, id) {
  await evaluate(page, `window.__systemsketch.editor.select(${JSON.stringify(id)}); true`)
  await delay(180)
}

async function main() {
  const app = await startApp({
    label: 'generic-block-integrated',
    build: 'generic-block-integrated-smoke',
    width: 1800,
    height: 1080,
  })

  try {
    const board = join(app.filesRoot, 'SystemSketch', 'generic-block-integrated.systemsketch')
    await mkdir(dirname(board), { recursive: true })
    await copyFile(FIXTURE, board)
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page,
      `window.__systemsketch?.editor?.getShape(${JSON.stringify(CHILD)})?.parentId === ${JSON.stringify(PARENT)}`,
      'integrated fixture membership')
    await delay(500)

    const initial = await shapeFacts(app.page, PARENT)
    assert.deepEqual({
      view: initial.props.view,
      headerAlign: initial.props.headerAlign,
      foldable: initial.props.foldable,
      folded: initial.props.folded,
      foldControlSide: initial.props.foldControlSide,
      autoResize: initial.props.autoResize,
      showFooter: initial.props.showFooter,
      showHeaderDivider: initial.props.showHeaderDivider,
      memberLayout: initial.props.memberLayout,
      insetBackground: initial.props.insetBackground,
    }, {
      view: 'expanded', headerAlign: 'center', foldable: true, folded: false,
      foldControlSide: 'right', autoResize: true, showFooter: true,
      showHeaderDivider: true, memberLayout: 'inset', insetBackground: 'soft-gray',
    })
    pass('the combined board cold-opens with every generic-Block policy on one ordinary record')

    await selectShape(app.page, PARENT)
    const controls = JSON.parse(await evaluate(app.page, `JSON.stringify({
      header: Boolean(document.querySelector('[data-testid="block-header-align-center"]')),
      chrome: Boolean(document.querySelector('[data-inspector-section="Chrome"]')),
      fold: Boolean(document.querySelector('[data-testid="block-fold-control-right"]')),
      autoFit: Boolean(document.querySelector('[aria-label="Auto fit Block children"]')),
      members: Boolean(document.querySelector('[data-testid="block-member-layout-control"]')),
      inset: Boolean(document.querySelector('[data-testid="block-inset-background-control"]')),
    })`))
    assert.deepEqual(controls, {
      header: true, chrome: true, fold: true, autoFit: true, members: true, inset: true,
    })
    pass('one inspector composes header, chrome, fold/fit, member-layout, and inset controls')

    const face = await elementBox(app.page, `${scope(PARENT)} .systemsketch-block-canvas`)
    const fold = await elementBox(app.page, `${scope(PARENT)} [data-testid^="block-fold-"]`)
    const title = await elementBox(app.page, `${scope(PARENT)} .BlockNode-headingTitle`)
    const type = await elementBox(app.page, `${scope(PARENT)} .BlockNode-headingType`)
    assert.ok(face.x + face.width - (fold.x + fold.width / 2) < 28)
    assert.ok(type.x - (title.x + title.width) >= 0 && type.x - (title.x + title.width) <= 12)
    pass('right-side disclosure remains corner chrome while Type sits directly beside the title')

    // Reproduce the reported selection hand-off: selected parent, immediate child drag.
    const parentBefore = await shapeFacts(app.page, PARENT)
    const childBefore = await shapeFacts(app.page, CHILD)
    const childFace = await elementBox(app.page, `${scope(CHILD)} .systemsketch-block-canvas`)
    const start = { x: childFace.x + 180, y: childFace.y + 24 }
    const end = { x: start.x + 115, y: start.y + 65 }
    await mouse(app.page, 'mouseMoved', start.x, start.y)
    await mouse(app.page, 'mousePressed', start.x, start.y, { buttons: 1 })
    await mouse(app.page, 'mouseMoved', end.x, end.y, { buttons: 1 })
    await waitFor(app.page,
      `window.__systemsketch.editor.getOnlySelectedShapeId() === ${JSON.stringify(CHILD)}
        && window.__systemsketch.editor.isIn('select.translating')`,
      'child owns integrated drag')
    const parentDuring = await shapeFacts(app.page, PARENT)
    const childDuring = await shapeFacts(app.page, CHILD)
    assert.deepEqual(
      { x: parentDuring.x, y: parentDuring.y, w: parentDuring.w, h: parentDuring.h },
      { x: parentBefore.x, y: parentBefore.y, w: parentBefore.w, h: parentBefore.h },
    )
    assert.notDeepEqual({ x: childDuring.x, y: childDuring.y }, { x: childBefore.x, y: childBefore.y })
    assert.equal(childDuring.parentId, PARENT)
    assert.equal(await evaluate(app.page,
      `document.querySelector(${JSON.stringify(`${scope(PARENT)} .systemsketch-block-canvas`)})?.dataset.autoFitLive`), 'true')
    await mouse(app.page, 'mouseReleased', end.x, end.y)
    await waitFor(app.page,
      `window.__systemsketch.editor.getShape(${JSON.stringify(CHILD)})?.parentId === ${JSON.stringify(PARENT)}
        && window.__systemsketch.editor.getPath() === 'select.idle'`,
      'integrated drag settles')
    pass('a child-first drag moves only the child, previews continuously, and preserves membership')

    // The same board must retain the modular title editor, not a special fixture-only menu.
    const titleBox = await elementBox(app.page, `${scope(TITLE_CHILD)} .BlockNode-headingTitle`)
    for (const clickCount of [1, 2]) {
      await mouse(app.page, 'mousePressed', titleBox.x + titleBox.width / 2, titleBox.y + titleBox.height / 2, { buttons: 1, clickCount })
      await mouse(app.page, 'mouseReleased', titleBox.x + titleBox.width / 2, titleBox.y + titleBox.height / 2, { clickCount })
    }
    await waitFor(app.page,
      `document.querySelector('[data-testid="block-title-formatting-menu"]')?.closest('[data-visible="true"]')`,
      'integrated title formatting menu')
    assert.equal(await evaluate(app.page,
      `document.querySelector('[data-testid="block-title-formatting-menu"]')?.dataset.contextualRecipe`), 'block-title')
    await evaluate(app.page, `window.__systemsketch.editor.setEditingShape(null); true`)
    pass('the title editor opens the shared composed contextual recipe on the integrated board')

    // A floating Port remains independently direct-manipulable beside all Block behavior.
    await selectShape(app.page, PARENT)
    await evaluate(app.page, `window.__systemsketch.editor.setSelectedShapes([]); true`)
    await evaluate(app.page, `document.querySelector('[data-testid="systemsketch-right-popout-close"]')?.click(); true`)
    await delay(180)
    const portBefore = await shapeFacts(app.page, PORT)
    const portLabel = await elementBox(app.page, `${scope(PORT)} .FloatingPort-label`)
    // Keep this gesture in page space. Moving left from this output label lands
    // inside CardGame, where stock frame membership intentionally reparents the
    // Port and the scope rules remove the now-cross-boundary cable.
    const portEnd = { x: portLabel.x + portLabel.width + 90, y: portLabel.y + 70 }
    await mouse(app.page, 'mouseMoved', portLabel.x + portLabel.width / 2, portLabel.y + portLabel.height / 2)
    await mouse(app.page, 'mousePressed', portLabel.x + portLabel.width / 2, portLabel.y + portLabel.height / 2, { buttons: 1 })
    await mouse(app.page, 'mouseMoved', portEnd.x, portEnd.y, { buttons: 1 })
    await waitFor(app.page, `window.__systemsketch.editor.isIn('select.translating')`, 'Port direct drag')
    await mouse(app.page, 'mouseReleased', portEnd.x, portEnd.y)
    const portAfter = await shapeFacts(app.page, PORT)
    assert.notDeepEqual({ x: portAfter.x, y: portAfter.y }, { x: portBefore.x, y: portBefore.y })
    assert.equal(portAfter.parentId, 'page:page')
    const cableFacts = JSON.parse(await evaluate(app.page, `(() => {
      const editor = window.__systemsketch.editor
      const cable = editor.getShape('shape:velocity-cable')
      return JSON.stringify({
        exists: Boolean(cable),
        parentId: cable?.parentId ?? null,
        currentConnections: editor.getCurrentPageShapes().filter((shape) => shape.type === 'connection').length,
        bindings: editor.getBindingsFromShape('shape:velocity-cable', 'connection').length,
      })
    })()`))
    assert.deepEqual(cableFacts, { exists: true, parentId: 'page:page', currentConnections: 1, bindings: 2 })
    pass('the floating Port moves from its label on the first drag and keeps its cable')

    await selectShape(app.page, PARENT)
    // The rapid child drag widens the auto-fit parent far enough that its
    // right-corner chevron sits beneath the open inspector. Close the popout
    // before exercising the canvas control itself.
    await evaluate(app.page, `document.querySelector('[data-testid="systemsketch-right-popout-close"]')?.click(); true`)
    await delay(180)
    const reopenedFold = await elementBox(app.page, `${scope(PARENT)} [data-testid^="block-fold-"]`)
    await clickAt(app.page, reopenedFold.x + reopenedFold.width / 2, reopenedFold.y + reopenedFold.height / 2)
    await waitFor(app.page, `window.__systemsketch.editor.getShape(${JSON.stringify(PARENT)})?.props.folded === true`, 'integrated fold')
    const foldedControl = await elementBox(app.page, `${scope(PARENT)} [data-testid^="block-fold-"]`)
    await clickAt(app.page, foldedControl.x + foldedControl.width / 2, foldedControl.y + foldedControl.height / 2)
    await waitFor(app.page, `window.__systemsketch.editor.getShape(${JSON.stringify(PARENT)})?.props.folded === false`, 'integrated unfold')
    pass('the same right-corner chevron folds and restores the child-rich Block')

    const capture = await app.page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(SHOT, Buffer.from(capture.data, 'base64'))
    assert.deepEqual(localConsoleErrors(app.page), [])
    pass('the integrated journey completes without a browser exception or reactive cycle')
    process.stdout.write(`\n${checks.length}/${checks.length} integrated checks passed\n${SHOT}\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`\nFAIL ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
