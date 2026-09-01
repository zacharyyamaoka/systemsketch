#!/usr/bin/env node
/**
 * Real-browser proof that editing text inside a Block feels like editing text
 * inside a rectangle: one click activates the Block, the next click on any of
 * its text opens that text.
 *
 * The bug this locks down: tldraw's click-to-edit path in `PointingShape`
 * requires a shape geometry with *exactly one* `isLabel` child. A Block's
 * geometry carries its header plus one circle per visible port, so the count is
 * never one, the branch was skipped, and a slow second click silently did
 * nothing. Only a rapid double-click — a different code path entirely — ever
 * opened a field.
 *
 * Every assertion below is a physical pointer journey at real coordinates, with
 * a deliberate 700 ms pause where the point is that the second click is *slow*.
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import {
  ROOT,
  clickAt,
  clickElement,
  delay,
  drag,
  elementBox,
  ensureDir,
  evaluate,
  key,
  localConsoleErrors,
  makeChecklist,
  mouse,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const SHOT = join(ROOT, 'docs', 'block-click-to-edit-live-2026-09-01.png')

/**
 * Scope every panel selector to the inspector. The Block now paints its own
 * on-canvas port-add bead, which carries the same `aria-label="Add input port"`
 * and comes first in document order — an unscoped querySelector silently
 * retargets from the panel button to the canvas bead.
 */
const PANEL = '[data-testid="block-development-inspector"]'
const EMPTY_CANVAS = { x: 220, y: 820 }

/** tldraw counts two clicks as a double-click for 450 ms. Out-wait it. */
const SLOW_CLICK_PAUSE_MS = 700

const { checks, pass } = makeChecklist()

async function centreOf(page, selector) {
  const box = await elementBox(page, selector)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function editorTestId(page) {
  return evaluate(page,
    `document.querySelector('.BlockNode-inlineEditor')?.getAttribute('data-testid') ?? null`)
}

async function toolState(page) {
  return evaluate(page, `document.querySelector('.tl-container')?.getAttribute('data-state') ?? null`)
}

/**
 * A frame-like Block hides tldraw's selection bounds background, so the honest
 * "is it active" signal in this lab is the Block inspector, which mounts from
 * the real selection.
 */
async function isBlockActive(page) {
  return evaluate(page,
    `Boolean(document.querySelector('[data-testid="block-development-inspector"]'))`)
}

async function blockPageBox(page) {
  return evaluate(page, `(() => {
    const shape = document.querySelector('.tl-shape[data-shape-type="block"]')
    if (!shape) return null
    const rect = shape.getBoundingClientRect()
    return JSON.stringify({ x: rect.x, y: rect.y, width: rect.width, height: rect.height })
  })()`).then((value) => (value ? JSON.parse(value) : null))
}

/** Replace a panel field's value the way a person does: select all, then type. */
async function typeInto(page, selector, value) {
  const point = await centreOf(page, selector)
  await mouse(page, 'mouseMoved', point.x, point.y)
  for (const clickCount of [1, 2, 3]) {
    await mouse(page, 'mousePressed', point.x, point.y, { buttons: 1, clickCount })
    await mouse(page, 'mouseReleased', point.x, point.y, { clickCount })
  }
  await delay(120)
  await page.send('Input.insertText', { text: value })
  await delay(140)
}

/**
 * Assert the pointer would actually land on the Block field we mean, then click.
 *
 * Every gesture below is a raw coordinate click, so anything that drifts over
 * the Block — a mispositioned contextual menu, a stray overlay — would silently
 * swallow the click and fail this file three steps later on an unrelated line.
 * Hit-testing first turns that into an immediate, honest error.
 */
async function clickField(page, point, expected) {
  const landed = await evaluate(page, `(() => {
    const hit = document.elementFromPoint(${point.x}, ${point.y})
    if (!hit) return 'nothing'
    const field = hit.closest('[data-pb-inline-field]')
    return field ? field.dataset.pbInlineField : (hit.className || hit.tagName)
  })()`)
  assert.equal(landed, expected,
    `the pointer must land on ${expected}, not ${landed} — that is something covering the Block, not a click-to-edit problem`)
  await clickAt(page, point.x, point.y)
}

async function doubleClickAt(page, x, y) {
  await mouse(page, 'mouseMoved', x, y)
  for (const clickCount of [1, 2]) {
    await mouse(page, 'mousePressed', x, y, { buttons: 1, clickCount })
    await mouse(page, 'mouseReleased', x, y, { clickCount })
    await delay(30)
  }
  await delay(220)
}

async function main() {
  await ensureDir(dirname(SHOT))
  const app = await startApp({ label: 'systemsketch-clicktoedit', build: 'click-to-edit-smoke' })
  const { page, port } = app

  try {
    await openApp(page, port, '?preset=block-dev')
    await waitFor(page,
      `document.querySelector('[data-development-profile="block-dev"] .tl-container')`,
      'Block Dev canvas')
    await delay(700)

    // Author the Block from the FR's screenshots through the real tool.
    await key(page, 'b', 'KeyB')
    await drag(page, { x: 440, y: 280 }, { x: 800, y: 500 })
    await waitFor(page, `document.querySelector('[data-testid="block-inline-title"]')`, 'title editor')
    await page.send('Input.insertText', { text: 'decode' })
    await key(page, 'Enter', 'Enter')
    await waitFor(page, `document.querySelector('[data-testid="block-development-inspector"]')`, 'inspector')

    await clickElement(page, `${PANEL} [aria-label="Add input port"]`)
    await waitFor(page, `document.querySelector('${PANEL} [aria-label="inputs in_1 name"]')`, 'input port row')
    await typeInto(page, `${PANEL} [aria-label="inputs in_1 name"]`, 'raw')
    await clickElement(page, `${PANEL} [aria-label="Add output port"]`)
    await waitFor(page, `document.querySelector('${PANEL} [aria-label="outputs out_1 name"]')`, 'output port row')
    await typeInto(page, `${PANEL} [aria-label="outputs out_1 name"]`, 'Frame')
    await clickAt(page, EMPTY_CANVAS.x, EMPTY_CANVAS.y)
    await delay(240)

    const title = await centreOf(page, '.BlockNode-headingTitle')
    const inputPort = await centreOf(page, '.BlockNode-portLabel--in .BlockNode-portName')
    const body = await blockPageBox(page).then((box) => ({
      x: box.x + box.width / 2,
      y: box.y + box.height * 0.75,
    }))

    // 1. First click activates the Block and nothing else.
    await clickField(page, title, '{"kind":"title"}')
    await delay(200)
    assert.equal(await isBlockActive(page), true, 'the first click should select the Block')
    assert.equal(await editorTestId(page), null,
      'the first click must not open a text editor')
    pass('one click on the title activates the Block without opening its text')

    // 2. The reported bug: a SLOW second click used to do nothing at all.
    await delay(SLOW_CLICK_PAUSE_MS)
    await clickField(page, title, '{"kind":"title"}')
    await delay(240)
    assert.equal(await editorTestId(page), 'block-inline-title',
      'the second click, however slow, must open the title editor')
    assert.equal(await toolState(page), 'select.editing_shape',
      'the editor is tldraw\'s own editing state, not a bespoke overlay')
    pass('a slow second click on the title opens the title editor')

    // 3. The Block is active, so one click on a port name moves the editor there.
    await clickField(page, inputPort, '{"kind":"portName","side":"inputs","portId":"in_1"}')
    await delay(240)
    assert.equal(await editorTestId(page), 'block-inline-port-name-inputs-in_1',
      'one click on a port name must move the editor onto that port')
    assert.equal(await evaluate(page,
      `document.activeElement?.getAttribute('data-testid') ?? null`),
      'block-inline-port-name-inputs-in_1',
      'the moved editor must also take focus')
    pass('one click on a port name moves the open editor onto that port')

    // 4. Typing into the moved editor still writes through to the document.
    await page.send('Input.insertText', { text: 'packet' })
    await key(page, 'Enter', 'Enter')
    await delay(240)
    assert.equal(await evaluate(page,
      `document.querySelector('.BlockNode-portLabel--in .BlockNode-portName')?.textContent ?? null`),
      'packet',
      'the port renamed through the moved editor must reach the shape')
    pass('what you type in the moved editor is in the document')

    // 5. The rapid double-click that used to be the only way in still works.
    await clickAt(page, EMPTY_CANVAS.x, EMPTY_CANVAS.y)
    await delay(200)
    await doubleClickAt(page, title.x, title.y)
    assert.equal(await editorTestId(page), 'block-inline-title',
      'two rapid clicks must still open the title')
    pass('two rapid clicks still open the title, unchanged')

    // 6. A miss stays a miss: the body of an active Block is not a text box.
    await key(page, 'Escape', 'Escape')
    await delay(200)
    await clickAt(page, body.x, body.y)
    await delay(200)
    assert.equal(await isBlockActive(page), true, 'clicking the body keeps the Block selected')
    await delay(SLOW_CLICK_PAUSE_MS)
    await clickAt(page, body.x, body.y)
    await delay(240)
    assert.equal(await editorTestId(page), null,
      'clicking away from the text must not open an editor')
    pass('clicking the body of an active Block opens nothing')

    // 7. Dragging from the title still moves the Block instead of editing it.
    const before = await blockPageBox(page)
    await drag(page, title, { x: title.x + 120, y: title.y + 60 })
    await delay(240)
    const after = await blockPageBox(page)
    assert.ok(Math.abs(after.x - before.x) > 60,
      `dragging the title should move the Block (${before.x} -> ${after.x})`)
    assert.equal(await editorTestId(page), null,
      'a drag that starts on the title must not open the title editor')
    pass('dragging from the title moves the Block and opens nothing')

    // Leave the capture on the state the FR asks for: port name being edited.
    const movedTitle = await centreOf(page, '.BlockNode-headingTitle')
    await clickAt(page, movedTitle.x, movedTitle.y)
    await delay(SLOW_CLICK_PAUSE_MS)
    await clickAt(page, movedTitle.x, movedTitle.y)
    await delay(200)
    const movedPort = await centreOf(page, '.BlockNode-portLabel--in .BlockNode-portName')
    await clickAt(page, movedPort.x, movedPort.y)
    await delay(300)
    // 8. The product composition mounts this from a second `installBlockClickToEdit`
    //    call site in App.tsx, behind the full chrome, workspace, and selection
    //    menu. Proving it only in the isolated lab would leave that site unproven.
    await openApp(page, port, '')
    await waitFor(page,
      `document.querySelector('[data-testid="systemsketch-app"] .tl-container')`,
      'product canvas')
    await delay(1200)
    await key(page, 'b', 'KeyB')
    await drag(page, { x: 430, y: 300 }, { x: 790, y: 520 })
    await waitFor(page, `document.querySelector('[data-testid="block-inline-title"]')`, 'product title editor')
    await page.send('Input.insertText', { text: 'decode' })
    await key(page, 'Enter', 'Enter')
    await delay(400)
    await clickAt(page, EMPTY_CANVAS.x, EMPTY_CANVAS.y)
    await delay(400)

    const productTitle = await centreOf(page, '.BlockNode-headingTitle')
    await clickField(page, productTitle, '{"kind":"title"}')
    await delay(240)
    assert.equal(await editorTestId(page), null,
      'the first click must not open a text editor in the product composition either')
    await delay(SLOW_CLICK_PAUSE_MS)
    await clickAt(page, productTitle.x, productTitle.y)
    await delay(300)
    assert.equal(await editorTestId(page), 'block-inline-title',
      'the product composition mounts a second install site — it must behave identically')
    assert.equal(await toolState(page), 'select.editing_shape')
    pass('the same two clicks work in the full product composition, not just the lab')

    const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(SHOT, Buffer.from(capture.data, 'base64'))

    assert.deepEqual(localConsoleErrors(page), [])
    pass('the whole journey produced zero local console errors')

    process.stdout.write(`\n  ${checks.length}/${checks.length} browser checks passed\n  ${SHOT}\n`)
  } catch (error) {
    const diagnostics = page.events
      .filter((event) => event.method === 'Runtime.exceptionThrown' || event.method === 'Log.entryAdded')
      .map((event) => event.params.entry?.text
        ?? event.params.exceptionDetails?.exception?.description
        ?? event.params.exceptionDetails?.text)
    if (diagnostics.length) process.stderr.write(`\n  Browser diagnostics:\n${diagnostics.join('\n')}\n`)
    process.stderr.write(`  Editor: ${await editorTestId(page).catch(() => 'unreadable')}\n`)
    process.stderr.write(`  State: ${await toolState(page).catch(() => 'unreadable')}\n`)
    throw error
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`\n  FAIL  ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
