#!/usr/bin/env node
/** Physical regression for an always-available SystemSketch context menu. */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import {
  ROOT,
  clickAt,
  delay,
  drag,
  elementBox,
  ensureDir,
  evaluate,
  key,
  localConsoleErrors,
  makeChecklist,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const SHOT = join(ROOT, 'docs', 'context-menu-reliability-live-2026-09-02.png')
const RESULTS = join(ROOT, 'docs', 'assets', 'context-menu-reliability.json')
const INLINE_TITLE = '[data-testid="block-inline-title"]'
const BLOCK_MENU = '[data-testid="context-menu-group.systemsketch-block-authoring"]'
const CONTEXT_MENU = '[data-testid="context-menu"]'
const RICH_TEXT = '[data-testid="rich-text-area"]'
const SELECTION_MENU = '[data-testid="systemsketch-selection-menu"][data-visible="true"]'
const GEO_SHAPE = '.tl-shape[data-shape-type="geo"]'

async function rightClickElement(page, selector) {
  const box = await elementBox(page, selector)
  await clickAt(page, box.x + box.width / 2, box.y + box.height / 2, 'right')
}

async function closeMenu(page) {
  await key(page, 'Escape', 'Escape')
  await waitFor(page, `!document.querySelector('[data-testid="context-menu"]')`, 'the context menu to close')
}

const { checks, pass } = makeChecklist()

async function main() {
  await ensureDir(dirname(SHOT))
  await ensureDir(dirname(RESULTS))
  const app = await startApp({ label: 'systemsketch-context-reliability', build: 'context-menu-reliability-smoke' })
  const { page, port, filesRoot } = app
  let proofCapture

  try {
    await openApp(page, port, '?preset=block-dev')
    await waitFor(page,
      `document.querySelector('[data-development-profile="block-dev"] .tl-container')`,
      'Block Dev canvas')
    await delay(700)

    await key(page, 'b', 'KeyB')
    await drag(page, { x: 440, y: 300 }, { x: 760, y: 510 })
    await waitFor(page, `document.querySelector('${INLINE_TITLE}')`, 'the active Block title editor')
    await page.send('Input.insertText', { text: 'always_available' })

    // This is the reported state: the cursor is directly over an active input.
    // Keep an identity marker on the canvas so the assertion distinguishes a
    // real first-gesture open from a destructive root-remount recovery.
    await evaluate(page, `document.querySelector('.tl-canvas').dataset.contextMenuProbe = 'same-canvas'`)
    await rightClickElement(page, INLINE_TITLE)
    await waitFor(page, `document.querySelector('${BLOCK_MENU}')`, 'the contextual Block menu over an active input')
    assert.match(await evaluate(page, `document.querySelector('${BLOCK_MENU}').innerText`), /Block view/)
    assert.equal(await evaluate(page,
      `document.querySelector('.tl-canvas')?.dataset.contextMenuProbe ?? null`),
      'same-canvas',
      'the first right-click should not need to rebuild the canvas')
    pass('one right-click over an active inline field opens the contextual Block menu')

    // Reproduce the state split that caused the follow-up failure: dismiss the
    // first menu with a normal canvas click (not Escape), then right-click
    // again without remounting the editor. Stock 5.3.2 used to leave Radix
    // internally open here while tldraw's registry already said closed.
    const canvasBox = await elementBox(page, '.tl-canvas')
    const blankPoint = {
      x: canvasBox.x + canvasBox.width * 0.84,
      y: canvasBox.y + canvasBox.height * 0.76,
    }
    await clickAt(page, blankPoint.x, blankPoint.y)
    await waitFor(page, `!document.querySelector('${CONTEXT_MENU}')`, 'the first menu to dismiss by click')
    await clickAt(page, blankPoint.x, blankPoint.y, 'right')
    await waitFor(page, `document.querySelector('${CONTEXT_MENU}')`, 'the menu after click dismissal')
    assert.equal(await evaluate(page,
      `document.querySelector('.tl-canvas')?.dataset.contextMenuProbe ?? null`),
      'same-canvas',
      'dismiss-and-reopen must preserve the canvas instance')
    pass('a normal outside click cannot strand the next right-click')
    await closeMenu(page)

    // Exercise the generalized guarantee, not just the removed Block handler:
    // a descendant that owns a native menu policy may stop propagation.
    // tldraw's stock pointer-up forwarding must still open SystemSketch's menu
    // on that physical gesture, with the selected Block as its best-effort subject.
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const block = editor.getCurrentPageShapes().find((shape) => shape.type === 'block')
      editor.select(block.id)
      editor.setEditingShape(block.id)
    })()`)
    await waitFor(page, `document.querySelector('${INLINE_TITLE}')`, 'the reopened Block title editor')
    await evaluate(page, `document.querySelector('${INLINE_TITLE}').addEventListener(
      'contextmenu', (event) => event.stopPropagation(), { once: true })`)
    await rightClickElement(page, INLINE_TITLE)
    await waitFor(page, `document.querySelector('${BLOCK_MENU}')`, 'the contextual menu past a swallowed event')
    assert.match(await evaluate(page, `document.querySelector('${BLOCK_MENU}').innerText`), /Block view/)
    pass('a child that swallows contextmenu still gets the selected Block menu on the first gesture')
    await closeMenu(page)

    // Stock tldraw's rich-text editor deliberately stops contextmenu at the
    // Tiptap boundary. Its own pointer-up forwarding must still open the stock
    // root without SystemSketch re-keying (and therefore destroying) Canvas.
    const productBoard = join(filesRoot, 'SystemSketch', 'context-menu-reliability.tldr')
    await openApp(page, port, `?board=${encodeURIComponent(productBoard)}`)
    await waitFor(page,
      `document.querySelector('[data-testid="systemsketch-app"] .tl-container')`,
      'the full SystemSketch product canvas')
    await delay(700)
    await key(page, 'r', 'KeyR')
    await drag(page, { x: 830, y: 290 }, { x: 1130, y: 490 })
    await waitFor(page, `document.querySelector('${RICH_TEXT}')`, 'the stock Tiptap editor')
    await page.send('Input.insertText', { text: 'stock_tiptap_editor' })
    await evaluate(page, `document.querySelector('.tl-canvas').dataset.contextMenuProbe = 'same-tiptap-canvas'`)
    await rightClickElement(page, RICH_TEXT)
    await waitFor(page, `document.querySelector('${CONTEXT_MENU}')`, 'the stock menu over active Tiptap')
    assert.match(await evaluate(page, `document.querySelector('${CONTEXT_MENU}').innerText`), /Edit/)
    assert.equal(await evaluate(page,
      `document.querySelector('.tl-canvas')?.dataset.contextMenuProbe ?? null`),
      'same-tiptap-canvas',
      'right-clicking Tiptap must not rebuild the canvas')
    assert.deepEqual(localConsoleErrors(page), [])
    pass('active stock Tiptap opens its menu without unmounting the editor view')
    proofCapture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await closeMenu(page)

    // This is the screenshot state from the follow-up: a selected stock shape
    // with SystemSketch's floating selection toolbar above it. Repeated opens
    // prove that leaving the stock Radix root mounted does not wedge it.
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const geo = editor.getCurrentPageShapes().find((shape) => shape.type === 'geo')
      editor.setEditingShape(null)
      editor.setCurrentTool('select')
      editor.select(geo.id)
    })()`)
    await waitFor(page, `document.querySelector('${SELECTION_MENU}')`, 'the floating selection toolbar')
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await rightClickElement(page, GEO_SHAPE)
      await waitFor(page, `document.querySelector('${CONTEXT_MENU}')`, `selected-shape menu ${attempt + 1}`)
      assert.match(await evaluate(page, `document.querySelector('${CONTEXT_MENU}').innerText`), /Edit/)
      await closeMenu(page)
      await waitFor(page, `document.querySelector('${SELECTION_MENU}')`, 'the selection toolbar to return')
    }
    pass('with the floating selection toolbar visible, three consecutive right-clicks open normally')

    // The deleted workaround was introduced for a focus-loss theory. Keep that
    // boundary in the focused test: stock Radix must remain reopenable after
    // the app window blurs while its menu is showing.
    await rightClickElement(page, GEO_SHAPE)
    await waitFor(page, `document.querySelector('${CONTEXT_MENU}')`, 'the menu before window blur')
    await evaluate(page, `window.dispatchEvent(new Event('blur'))`)
    await delay(120)
    await rightClickElement(page, GEO_SHAPE)
    await waitFor(page, `document.querySelector('${CONTEXT_MENU}')`, 'the menu immediately after window blur')
    await closeMenu(page)
    await rightClickElement(page, GEO_SHAPE)
    await waitFor(page, `document.querySelector('${CONTEXT_MENU}')`, 'the second menu after window blur')
    await closeMenu(page)
    pass('window blur with a menu open does not strand the stock root')

    // UI chrome has no shape beneath its DOM target, so stock tldraw falls
    // back to canvas-wide commands. The important guarantee is still that the
    // menu appears instead of the browser menu or nothing at all.
    await rightClickElement(page, SELECTION_MENU)
    await waitFor(page, `document.querySelector('${CONTEXT_MENU}')`, 'the menu directly over selection chrome')
    assert.match(await evaluate(page, `document.querySelector('${CONTEXT_MENU}').innerText`), /Select all/)
    pass('right-clicking the floating toolbar still opens stock canvas commands')

    await writeFile(SHOT, Buffer.from(proofCapture.data, 'base64'))

    assert.deepEqual(localConsoleErrors(page), [])
    pass('the real browser journey produced zero local console errors')

    // Written only after the physical journey is fully green, so the report
    // can consume evidence rather than restating its own expected labels.
    await writeFile(RESULTS, JSON.stringify(
      checks.map((label) => ({ label, ok: true })),
      null,
      2,
    ))

    process.stdout.write(`\n  ${checks.length}/${checks.length} browser checks passed\n  ${SHOT}\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`\n  FAIL  ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
