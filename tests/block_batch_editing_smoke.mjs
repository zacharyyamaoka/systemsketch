#!/usr/bin/env node
/**
 * Real-browser proof for Block batch editing.
 *
 * The claim under test is not "the component renders a Mixed chip" — that is a
 * unit test. It is that a multi-selection of real Blocks, made with the real
 * marquee and shift-click gestures, is switched by tldraw's own
 * `setStyleForSelectedShapes` in ONE undo step, in the actual app.
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
  shortcut,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const SHOT = join(ROOT, 'docs', 'block-batch-editing-live-2026-09-01.png')
const SHOT_INSPECTOR = join(ROOT, 'docs', 'block-batch-inspector-live-2026-09-01.png')

const BLOCKS = [
  { title: 'decode', from: { x: 300, y: 210 }, to: { x: 600, y: 390 } },
  { title: 'estimate', from: { x: 660, y: 210 }, to: { x: 960, y: 390 } },
  { title: 'encode', from: { x: 300, y: 450 }, to: { x: 600, y: 630 } },
]

/** How many painted Block faces are currently in each view. */
async function viewCounts(page) {
  return JSON.parse(await evaluate(page, `(() => {
    const counts = { simple: 0, port: 0, expanded: 0 }
    for (const node of document.querySelectorAll('.systemsketch-block-canvas')) {
      counts[node.dataset.blockView] = (counts[node.dataset.blockView] ?? 0) + 1
    }
    return JSON.stringify(counts)
  })()`))
}

async function miniMenuState(page) {
  return JSON.parse(await evaluate(page, `(() => {
    const menu = document.querySelector('.block-mini-menu')
    if (!menu) return JSON.stringify(null)
    return JSON.stringify({
      selectionSummary: menu.querySelector('.block-mini-menu__count, .block-mini-menu__scope')?.textContent ?? null,
      view: menu.dataset.view,
      pressed: Array.from(menu.querySelectorAll('[aria-pressed="true"] span')).map((s) => s.textContent),
      views: Array.from(menu.querySelectorAll('.block-mini-menu__views[aria-label="Block view"] button')).map((button) => ({
        glyph: button.childNodes[0]?.textContent?.trim() ?? null,
        label: button.getAttribute('aria-label'),
      })),
    })
  })()`))
}

/**
 * Click a mini-menu view button where it is actually drawn.
 *
 * The hit test before the click is not ceremony. A click by coordinate is only
 * a click on the button if the button is what the browser would hit there, and
 * a mispositioned or occluded menu otherwise sends the gesture into whatever
 * chrome is underneath — which reads downstream as "the batch did not apply"
 * rather than "the menu is in the wrong place".
 */
async function clickMiniMenuView(page, view) {
  const found = JSON.parse(await evaluate(page, `(() => {
    const button = Array.from(document.querySelectorAll('.block-mini-menu__views button'))
      .find((candidate) => candidate.querySelector('span')?.textContent === ${JSON.stringify(view)})
    if (!button) return JSON.stringify(null)
    const rect = button.getBoundingClientRect()
    const x = rect.x + rect.width / 2
    const y = rect.y + rect.height / 2
    const hit = document.elementFromPoint(x, y)
    return JSON.stringify({
      x,
      y,
      hits: Boolean(hit && (button === hit || button.contains(hit))),
      over: hit ? hit.tagName.toLowerCase() + (hit.className ? '.' + String(hit.className).split(' ')[0] : '') : null,
    })
  })()`))
  if (!found) throw new Error(`No ${view} button in the Block mini menu`)
  if (!found.hits) {
    throw new Error(
      `The Block mini menu's ${view} button is at (${Math.round(found.x)}, ${Math.round(found.y)}) but `
      + `${found.over} is on top of it, so this click would land somewhere else. `
      + `That is a selection-menu placement problem, not a batch-editing one.`)
  }
  await clickAt(page, found.x, found.y)
}

/**
 * One right-click, no retry on purpose. The stock root used to strand itself
 * after the first dismissal, so a retry here would quietly hide that returning.
 */
async function openSelectionMenu(page) {
  const box = await elementBox(page, '.systemsketch-block-canvas')
  await clickAt(page, box.x + box.width / 2, box.y + box.height / 2, 'right')
  try {
    await waitFor(page,
      `document.querySelector('[data-testid="context-menu-sub.block-view-button"]')`,
      'the Block context menu', 2500)
  } catch (error) {
    const state = await evaluate(page, `JSON.stringify({
      menus: document.querySelectorAll('[data-testid="context-menu"]').length,
      capture: Boolean(document.querySelector('.tlui-menu-click-capture')),
    })`)
    throw new Error(`${error.message}; ${state}`)
  }
}

async function openSubmenu(page, id) {
  await clickElement(page, `[data-testid="context-menu-sub.${id}-button"]`)
  await waitFor(page,
    `document.querySelector('[data-testid="context-menu-sub.${id}-content"]')`,
    `${id} submenu`)
}

async function menuCheckboxes(page, submenuId) {
  return JSON.parse(await evaluate(page, `(() => {
    const content = document.querySelector('[data-testid="context-menu-sub.${submenuId}-content"]')
    return JSON.stringify(Array.from(content?.querySelectorAll('[role="menuitemcheckbox"]') ?? [])
      .map((row) => ({ label: row.textContent?.trim(), checked: row.getAttribute('aria-checked') })))
  })()`))
}

async function clickMenuCheckbox(page, submenuId, label) {
  const box = JSON.parse(await evaluate(page, `(() => {
    const content = document.querySelector('[data-testid="context-menu-sub.${submenuId}-content"]')
    const row = Array.from(content?.querySelectorAll('[role="menuitemcheckbox"]') ?? [])
      .find((candidate) => candidate.textContent?.trim() === ${JSON.stringify(label)})
    if (!row) return JSON.stringify(null)
    const rect = row.getBoundingClientRect()
    return JSON.stringify({ x: rect.x, y: rect.y, width: rect.width, height: rect.height })
  })()`))
  if (!box) throw new Error(`Missing ${label} in ${submenuId}`)
  await clickAt(page, box.x + box.width / 2, box.y + box.height / 2)
}

async function drawBlock(page, { title, from, to }) {
  await key(page, 'b', 'KeyB')
  await drag(page, from, to)
  await waitFor(page, `document.querySelector('[data-testid="block-inline-title"]')`, `${title} title editor`)
  await page.send('Input.insertText', { text: title })
  await key(page, 'Enter', 'Enter')
  await delay(120)
}

/**
 * Return the canvas to a clean pointer state.
 *
 * While any menu is registered open, stock tldraw covers the canvas with
 * `.tlui-menu-click-capture` and absorbs the next click — that is how a real
 * person's dismissing click is swallowed. The harness has to spend that click
 * too, or the following gesture silently lands on the overlay.
 */
async function dismissMenus(page) {
  // Move the pointer off any menu surface first: the same ritual the existing
  // context-menu smoke test uses, so Radix's hover/dismiss state settles.
  await mouse(page, 'mouseMoved', 400, 830)
  await key(page, 'Escape', 'Escape')
  if (await evaluate(page, `Boolean(document.querySelector('.tlui-menu-click-capture'))`)) {
    await clickAt(page, 180, 790)
  }
  await waitFor(page,
    `!document.querySelector('.tlui-menu-click-capture')`,
    'the tldraw menu click-capture overlay to clear')
}

/** Marquee from empty canvas: the drag entry point Excalidraw offers. */
async function marqueeAll(page) {
  await dismissMenus(page)
  await key(page, 'v', 'KeyV')
  await drag(page, { x: 220, y: 150 }, { x: 1030, y: 700 })
  await delay(200)
}

/**
 * Select All: the entry point that still reaches Expanded Blocks.
 *
 * A marquee deliberately will not: an Expanded Block is frame-like, and stock
 * tldraw only brushes a frame into the selection when the brush encloses it
 * whole. That is tldraw's rule, kept rather than worked around.
 */
async function selectAll(page) {
  await dismissMenus(page)
  await key(page, 'v', 'KeyV')
  await shortcut(page, 'a', 'KeyA', 2)
  await delay(220)
}

const { checks, pass } = makeChecklist()

async function main() {
  await ensureDir(dirname(SHOT))
  const app = await startApp({ label: 'systemsketch-batch', build: 'block-batch-smoke' })
  const { page, port, filesRoot } = app

  try {
    // The product composition first: it is the only lane that carries every
    // batch surface at once — mini menu, docked inspector, and context menu.
    const productBoard = join(filesRoot, 'SystemSketch', 'block-batch-proof.tldr')
    await openApp(page, port, `?board=${encodeURIComponent(productBoard)}`)
    await waitFor(page,
      `document.querySelector('[data-testid="systemsketch-app"] .tl-container')`,
      'full SystemSketch product canvas')
    await delay(800)

    for (const block of BLOCKS) await drawBlock(page, block)
    await waitFor(page,
      `document.querySelectorAll('.systemsketch-block-canvas').length === 3`,
      'three authored Blocks')
    assert.deepEqual(await viewCounts(page), { simple: 0, port: 3, expanded: 0 })
    pass('three real Blocks are authored through the stock Block tool and pointer lifecycle')

    // --- Entry point 1: marquee drag -------------------------------------
    await marqueeAll(page)
    let menu = await miniMenuState(page)
    assert.ok(menu, 'the Block mini menu is present for a multi-selection')
    assert.equal(menu.selectionSummary, null)
    assert.equal(menu.view, 'port')
    assert.deepEqual(menu.pressed, ['port'])
    assert.deepEqual(menu.views, [
      { glyph: 'S', label: 'Show simple view' },
      { glyph: 'P', label: 'Show port view' },
      { glyph: 'E', label: 'Show expanded view' },
      { glyph: 'V', label: 'Show value view' },
    ])
    pass('a marquee over three Blocks keeps the Block mini menu and its shared view without a count summary')

    // --- The headline gesture: Port -> Expanded, all at once --------------
    await clickMiniMenuView(page, 'expanded')
    await waitFor(page,
      `document.querySelectorAll('.systemsketch-block-canvas[data-block-view="expanded"]').length === 3`,
      'three Expanded Blocks')
    assert.deepEqual(await viewCounts(page), { simple: 0, port: 0, expanded: 3 })
    pass('one click turns every selected Block from Port into Expanded')

    // --- One batch change is one undo ------------------------------------
    await shortcut(page, 'z', 'KeyZ', 2)
    await waitFor(page,
      `document.querySelectorAll('.systemsketch-block-canvas[data-block-view="port"]').length === 3`,
      'a single undo restoring all three')
    assert.deepEqual(await viewCounts(page), { simple: 0, port: 3, expanded: 0 })
    pass('the batch is one history step: a single Ctrl+Z restores all three Blocks')
    await shortcut(page, 'z', 'KeyZ', 10)
    await waitFor(page,
      `document.querySelectorAll('.systemsketch-block-canvas[data-block-view="expanded"]').length === 3`,
      'redo of the batch')

    // --- Entry point 2: shift-click, producing a genuinely mixed batch ----
    await clickAt(page, 180, 750)
    await delay(120)
    const boxes = JSON.parse(await evaluate(page, `(() => JSON.stringify(
      Array.from(document.querySelectorAll('.systemsketch-block-canvas')).map((node) => {
        const rect = node.getBoundingClientRect()
        return { x: rect.x + rect.width / 2, y: rect.y + 12 }
      })))()`))
    await clickAt(page, boxes[0].x, boxes[0].y)
    await clickMiniMenuView(page, 'simple')
    await waitFor(page,
      `document.querySelectorAll('.systemsketch-block-canvas[data-block-view="simple"]').length === 1`,
      'one Block back in Simple')

    const refreshed = JSON.parse(await evaluate(page, `(() => JSON.stringify(
      Array.from(document.querySelectorAll('.systemsketch-block-canvas')).map((node) => {
        const rect = node.getBoundingClientRect()
        return { x: rect.x + rect.width / 2, y: rect.y + 12, view: node.dataset.blockView }
      })))()`))
    const simpleOne = refreshed.find((entry) => entry.view === 'simple')
    const expandedOne = refreshed.find((entry) => entry.view === 'expanded')
    await clickAt(page, simpleOne.x, simpleOne.y)
    await mouse(page, 'mouseMoved', expandedOne.x, expandedOne.y)
    await page.send('Input.dispatchMouseEvent', {
      type: 'mousePressed', x: expandedOne.x, y: expandedOne.y, button: 'left', buttons: 1,
      clickCount: 1, pointerType: 'mouse', modifiers: 8,
    })
    await page.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: expandedOne.x, y: expandedOne.y, button: 'left', buttons: 0,
      clickCount: 1, pointerType: 'mouse', modifiers: 8,
    })
    await delay(220)

    menu = await miniMenuState(page)
    assert.equal(menu.selectionSummary, null)
    assert.equal(menu.view, 'mixed')
    assert.deepEqual(menu.pressed, [])
    pass('shift-click builds the same count-free batch, and a disagreeing pair reports as mixed with nothing pressed')

    // --- The inspector stays open and shows only the shared controls ------
    await clickElement(page, '.block-mini-menu__inspect')
    await waitFor(page,
      `document.querySelector('.block-inspector--batch')`,
      'the batch inspector')
    const inspector = JSON.parse(await evaluate(page, `(() => {
      const panel = document.querySelector('.block-inspector--batch')
      return JSON.stringify({
        count: panel.dataset.blockCount,
        heading: panel.querySelector('.block-inspector__batch-title').textContent,
        mixed: panel.querySelectorAll('.block-inspector__mixed-chip').length,
        sections: Array.from(panel.querySelectorAll('[data-inspector-section]'))
          .map((node) => node.getAttribute('data-inspector-section')),
        pressed: Array.from(panel.querySelectorAll('[aria-pressed="true"]')).map((n) => n.textContent),
        text: panel.innerText,
      })
    })()`))
    assert.equal(inspector.count, '2')
    assert.equal(inspector.heading, 'Batch edit')
    assert.ok(!inspector.text.includes('2 Blocks selected'))
    assert.equal(inspector.mixed, 1, 'only View disagrees')
    assert.deepEqual(inspector.sections, ['View', 'Ports', 'Display', 'Per-Block'])
    assert.ok(!inspector.text.includes('Select a Block to inspect it'))
    assert.ok(inspector.text.includes('Select a single Block to edit them.'))
    pass('the inspector stays open on a multi-selection and shows only what the Blocks share')

    const inspectorCapture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(SHOT_INSPECTOR, Buffer.from(inspectorCapture.data, 'base64'))

    // Resolving a mixed value from the inspector writes both Blocks.
    await clickElement(page, '[data-inspector-section="View"] [aria-label="Block view"] button:nth-child(2)')
    await waitFor(page,
      `document.querySelectorAll('.systemsketch-block-canvas[data-block-view="port"]').length === 2`,
      'the mixed pair resolved to Port')
    pass('choosing a value in the batch inspector resolves the mixed selection for every Block')

    // --- Right-click applies to the whole selection ----------------------
    await selectAll(page)
    await openSelectionMenu(page)
    const viewLabel = await evaluate(page,
      `document.querySelector('[data-testid="context-menu-sub.block-view-button"]').textContent.trim()`)
    assert.equal(viewLabel, 'Block view')
    assert.equal(await evaluate(page,
      `Boolean(document.querySelector('[data-testid="context-menu-sub.block-add-button"]'))`), false,
      'structural Add stays behind a single Block')
    assert.equal(await evaluate(page,
      `document.querySelector('[data-testid="context-menu-sub.block-ports-button"]').textContent.trim()`), 'Ports')
    await openSubmenu(page, 'block-view')
    assert.deepEqual(await menuCheckboxes(page, 'block-view'), [
      { label: 'Simple', checked: 'false' },
      { label: 'Port', checked: 'false' },
      { label: 'Expanded', checked: 'false' },
      { label: 'Value', checked: 'false' },
    ])
    await clickMenuCheckbox(page, 'block-view', 'Simple')
    await waitFor(page,
      `document.querySelectorAll('.systemsketch-block-canvas[data-block-view="simple"]').length === 3`,
      'three Simple Blocks from the context menu')
    pass('the right-click menu batches Block view without a selected-count suffix, unchecked while mixed, with structural Add withheld')

    // Reopen: the write has to be durable and reflected back on the next open,
    // and the menu has to survive being dismissed at all.
    await selectAll(page)
    await openSelectionMenu(page)
    await openSubmenu(page, 'block-ports')
    await clickMenuCheckbox(page, 'block-ports', 'Offset')
    await selectAll(page)
    await openSelectionMenu(page)
    await openSubmenu(page, 'block-view')
    assert.deepEqual(await menuCheckboxes(page, 'block-view'), [
      { label: 'Simple', checked: 'true' },
      { label: 'Port', checked: 'false' },
      { label: 'Expanded', checked: 'false' },
      { label: 'Value', checked: 'false' },
    ])
    await openSubmenu(page, 'block-ports')
    assert.deepEqual(await menuCheckboxes(page, 'block-ports'), [
      { label: 'Offset', checked: 'true' },
      { label: 'Aligned', checked: 'false' },
    ])
    pass('Ports batches to Offset for all three, and reopening the menu reads both batched values back as checked')

    await selectAll(page)
    await clickMiniMenuView(page, 'expanded')
    await waitFor(page,
      `document.querySelectorAll('.systemsketch-block-canvas[data-block-view="expanded"]').length === 3`,
      'the captured Expanded batch')
    const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(SHOT, Buffer.from(capture.data, 'base64'))

    // --- The isolated Block Dev lab reaches the same batch surfaces ------
    await page.send('Page.navigate', { url: `http://127.0.0.1:${port}/?preset=block-dev` })
    await waitFor(page, 'document.readyState === "complete"', 'lab page load')
    await waitFor(page,
      `document.querySelector('[data-development-profile="block-dev"] .tl-container')`,
      'Block Dev canvas')
    await delay(700)
    for (const block of BLOCKS.slice(0, 2)) await drawBlock(page, block)
    await marqueeAll(page)
    await waitFor(page,
      `document.querySelector('[data-testid="block-development-inspector"] .block-inspector--batch')`,
      'the lab batch inspector')
    assert.equal(await evaluate(page,
      `document.querySelector('.block-inspector__batch-title').textContent`), 'Batch edit')
    // One right-click here, and the result is read from the *inspector*: two
    // independent surfaces have to agree about the same batch write.
    await openSelectionMenu(page)
    await openSubmenu(page, 'block-ports')
    assert.deepEqual(await menuCheckboxes(page, 'block-ports'), [
      { label: 'Offset', checked: 'false' },
      { label: 'Aligned', checked: 'true' },
    ])
    await clickMenuCheckbox(page, 'block-ports', 'Offset')
    await waitFor(page,
      `document.querySelector('[data-inspector-section="Ports"] button[aria-pressed="true"]')?.textContent === 'offset'`,
      'the batch inspector agreeing that both Blocks are now Offset')
    pass('the isolated Block Dev lab batches Ports through the same right-click command, and its inspector agrees')

    assert.deepEqual(localConsoleErrors(page), [])
    pass('the physical journey produced zero local console errors')

    process.stdout.write(`\n  ${checks.length}/${checks.length} browser checks passed\n  ${SHOT}\n  ${SHOT_INSPECTOR}\n`)
  } catch (error) {
    const diagnostics = page.events
      .filter((event) => event.method === 'Runtime.exceptionThrown' || event.method === 'Log.entryAdded')
      .map((event) => event.params.entry?.text ?? event.params.exceptionDetails?.exception?.description ?? event.params.exceptionDetails?.text)
    process.stderr.write(`\n  Browser diagnostics:\n${diagnostics.join('\n')}\n`)
    try {
      const shot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
      await writeFile(join(ROOT, 'docs', 'block-batch-editing-failure.png'), Buffer.from(shot.data, 'base64'))
      process.stderr.write(`  Failure screenshot: docs/block-batch-editing-failure.png\n`)
    } catch { /* the page may already be gone */ }
    throw error
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`\n  FAIL  ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
