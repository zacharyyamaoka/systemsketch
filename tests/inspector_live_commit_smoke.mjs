#!/usr/bin/env node
/**
 * Real-browser proof that inspector text fields are WYSIWYG: whatever you type
 * is in the document before you leave the field, no matter how you leave it —
 * clicking the canvas (which unmounts the whole panel), clicking another panel
 * control, or switching inspector tabs.
 *
 * The bug this locks down: fields committed their draft on `blur`, and Chrome
 * fires no `blur` when the focused element is removed from the DOM. Clicking
 * the canvas deselected the Block, unmounted the inspector, and the typed value
 * was silently dropped.
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
  typeSlowly,
  waitFor,
} from './browser_harness.mjs'

/**
 * Every selector below is scoped to the docked inspector. The Block now also
 * offers on-canvas port editing whose hover-revealed add control carries the
 * same accessible name ("Add output port"), and it sits earlier in the DOM —
 * an unscoped querySelector silently picks the invisible one.
 */
const PANEL = '[data-testid="block-development-inspector"]'

const SHOT = join(ROOT, 'docs', 'inspector-live-commit-live-2026-09-01.png')
/** The three moments of the reported journey, framed like the bug report's table. */
const JOURNEY = [
  join(ROOT, 'docs', 'field-commit-1-typed-2026-09-01.png'),
  join(ROOT, 'docs', 'field-commit-2-clicked-canvas-2026-09-01.png'),
  join(ROOT, 'docs', 'field-commit-3-reselected-2026-09-01.png'),
]
const JOURNEY_CLIP = { x: 445, y: 258, width: 995, height: 620, scale: 1 }
const EMPTY_CANVAS = { x: 260, y: 800 }
const PORT_NAME_FIELD = `${PANEL} [aria-label="outputs out_1 name"]`
const TITLE_FIELD = `${PANEL} [aria-label="Block title"]`
const ADD_OUTPUT_BUTTON = `${PANEL} [aria-label="Add output port"]`
const OTHER_TAB = `${PANEL} [role="tab"][aria-selected="false"]`
const PORT_LAYOUT_BUTTON = `${PANEL} [aria-label="Port layout"] button`

const { checks, pass } = makeChecklist()

/**
 * Focus a field and select its whole value the way a person does: triple-click.
 * Focus is then asserted, because `Input.insertText` silently goes nowhere if
 * the element has not actually taken focus yet.
 */
async function selectFieldText(page, selector) {
  const found = JSON.stringify(selector)
  await waitFor(page, `document.querySelector(${found})`, selector)
  const box = await elementBox(page, selector)
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await mouse(page, 'mouseMoved', x, y)
  for (const clickCount of [1, 2, 3]) {
    await mouse(page, 'mousePressed', x, y, { buttons: 1, clickCount })
    await mouse(page, 'mouseReleased', x, y, { clickCount })
  }
  await waitFor(page, `document.activeElement === document.querySelector(${found})`,
    `focus to land on ${selector}`, 5000)
}

async function typeInto(page, selector, text) {
  await selectFieldText(page, selector)
  await page.send('Input.insertText', { text })
  await waitFor(page, `document.querySelector(${JSON.stringify(selector)})?.value === ${JSON.stringify(text)}`,
    `${selector} to hold ${JSON.stringify(text)}`, 5000)
}

async function captureJourney(page, path) {
  const shot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true, clip: JOURNEY_CLIP })
  await writeFile(path, Buffer.from(shot.data, 'base64'))
}

async function fieldValue(page, selector) {
  return evaluate(page, `document.querySelector(${JSON.stringify(selector)})?.value ?? null`)
}

async function portLabels(page) {
  return evaluate(page,
    `JSON.stringify(Array.from(document.querySelectorAll('.BlockNode-portName')).map((node) => node.textContent))`)
    .then((value) => JSON.parse(value))
}

async function blockTitle(page) {
  return evaluate(page, `document.querySelector('.BlockNode-headingTitle')?.textContent ?? null`)
}

/**
 * Press undo until something actually changes, and report what it changed to.
 * Interactions unrelated to typing leave their own marks in tldraw's history.
 */
async function undoUntilChanged(page, from, attempts = 4) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await shortcut(page, 'z', 'KeyZ', 2)
    await delay(320)
    const now = await blockTitle(page)
    if (now !== from) return now
  }
  return from
}

/** Select the drawn Block again so the inspector re-mounts from shape state. */
async function selectBlock(page) {
  await clickAt(page, 600, 400)
  await waitFor(page, `document.querySelector('[data-testid="block-development-inspector"]')`, 'inspector')
  await delay(160)
}

async function main() {
  await ensureDir(dirname(SHOT))
  const app = await startApp({ label: 'systemsketch-livecommit', build: 'live-commit-smoke' })
  const { page, port } = app

  try {
    await openApp(page, port, '?preset=block-dev')
    await waitFor(page,
      `document.querySelector('[data-development-profile="block-dev"] .tl-container')`,
      'Block Dev canvas')
    await delay(700)

    // Author one Block through the real tool, exactly as in the report.
    await key(page, 'b', 'KeyB')
    await drag(page, { x: 440, y: 300 }, { x: 760, y: 510 })
    await waitFor(page, `document.querySelector('[data-testid="block-inline-title"]')`, 'title editor')
    await page.send('Input.insertText', { text: 'test' })
    await key(page, 'Enter', 'Enter')
    await waitFor(page, `document.querySelector('${PANEL}')`, 'inspector')

    await clickElement(page, ADD_OUTPUT_BUTTON)
    await waitFor(page, `document.querySelector('${PORT_NAME_FIELD}')`, 'output port row')
    await delay(200)

    // 1. The reported bug: type, then click the canvas (which unmounts the panel).
    await typeInto(page, PORT_NAME_FIELD, 'Frame')
    await captureJourney(page, JOURNEY[0])
    await clickAt(page, EMPTY_CANVAS.x, EMPTY_CANVAS.y)
    await delay(220)
    await captureJourney(page, JOURNEY[1])
    assert.equal(
      await evaluate(page, `Boolean(document.querySelector('${PANEL}'))`),
      false,
      'clicking the canvas should deselect the Block and unmount the inspector',
    )
    assert.deepEqual(await portLabels(page), ['Frame'],
      'the port renamed in the inspector must survive clicking away onto the canvas')
    pass('a port renamed in the inspector survives clicking straight onto the canvas')

    // 2. It is really in the document, not just on screen: re-select and re-read.
    await selectBlock(page)
    assert.equal(await fieldValue(page, PORT_NAME_FIELD), 'Frame')
    await captureJourney(page, JOURNEY[2])
    pass('the committed value is read back from shape state on re-selection')

    // 3. Leaving via another panel control still commits (the path that worked).
    await typeInto(page, PORT_NAME_FIELD, 'Depth')
    await clickElement(page, PORT_LAYOUT_BUTTON)
    await delay(200)
    assert.deepEqual(await portLabels(page), ['Depth'])
    pass('clicking another inspector control commits the same way')

    // 4. Unmounting the field by switching tabs commits too.
    await typeInto(page, TITLE_FIELD, 'renamer')
    await clickElement(page, OTHER_TAB)
    await delay(200)
    assert.equal(await blockTitle(page), 'renamer')
    pass('switching inspector tabs mid-edit commits instead of dropping the edit')

    // 5. Escape exits the field the way tldraw's own canvas text editor does:
    //    by leaving, not by discarding. There is no exit route that loses text.
    await clickElement(page, OTHER_TAB)
    await waitFor(page, `document.querySelector('${PORT_NAME_FIELD}')`, 'ports back on the Details tab')
    await typeInto(page, PORT_NAME_FIELD, 'Escaped')
    await key(page, 'Escape', 'Escape')
    await delay(260)
    assert.deepEqual(await portLabels(page), ['Escaped'],
      'Escape must exit the field without dropping what was typed')
    pass('Escape exits the field and keeps the text, matching on-canvas editing')

    // 6. Ctrl+Z with the caret still in a field is the field's own undo. The
    //    canvas must not be reached past the focused text box.
    await selectBlock(page)
    await selectFieldText(page, PORT_NAME_FIELD)
    await typeSlowly(page, 'Focused')
    await shortcut(page, 'z', 'KeyZ', 2)
    await delay(320)
    assert.equal(
      await evaluate(page, `Boolean(document.querySelector('${PANEL}'))`),
      true,
      'undo inside a focused field must not deselect or destroy the Block behind it',
    )
    assert.equal(await evaluate(page, `document.querySelectorAll('.systemsketch-block-canvas').length`), 1,
      'the Block must still exist after undo inside a focused field')
    pass('Ctrl+Z inside a focused field stays in the field and never reaches the canvas')

    // 7. Writing per keystroke must not shred undo into one step per character.
    //    Drawing a shape leaves its own trailing history mark, so the property
    //    under test is "the first undo that changes anything undoes the whole
    //    rename" — not a fixed number of key presses.
    await selectBlock(page)
    const beforeInspectorRename = await blockTitle(page)
    await selectFieldText(page, TITLE_FIELD)
    await typeSlowly(page, 'coalesced')      // nine separate edits
    await clickAt(page, EMPTY_CANVAS.x, EMPTY_CANVAS.y)
    await delay(200)
    assert.equal(await blockTitle(page), 'coalesced')
    assert.equal(await undoUntilChanged(page, 'coalesced'), beforeInspectorRename,
      'one effective undo should retract the whole typing gesture, not a character of it')
    pass('one undo retracts a nine-keystroke inspector rename, not one character')

    // 8. The same guarantee for the on-canvas editor, where an unbounded
    //    gesture used to merge into the Block's creation — so undoing a rename
    //    deleted the Block instead of restoring its previous title.
    const beforeCanvasRename = await blockTitle(page)
    await clickElement(page, '.BlockNode-headingTitle')   // select the Block
    await delay(200)
    await clickElement(page, '.BlockNode-headingTitle')   // then edit its title
    await waitFor(page,
      `document.activeElement === document.querySelector('[data-testid="block-inline-title"]')`,
      'the inline title editor to take focus')
    await typeSlowly(page, 'oncanvas')
    await key(page, 'Enter', 'Enter')
    await clickAt(page, EMPTY_CANVAS.x, EMPTY_CANVAS.y)
    await delay(200)
    const renamedOnCanvas = await blockTitle(page)
    assert.notEqual(renamedOnCanvas, beforeCanvasRename, 'the on-canvas rename should have landed')
    assert.equal(await undoUntilChanged(page, renamedOnCanvas), beforeCanvasRename,
      'undoing an on-canvas rename must restore the previous title, not delete the Block')
    pass('undoing an on-canvas rename restores the previous title instead of deleting the Block')

    const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(SHOT, Buffer.from(capture.data, 'base64'))

    assert.deepEqual(localConsoleErrors(page), [])
    pass('the physical journey produced zero local console errors')

    process.stdout.write(`\n  ${checks.length}/${checks.length} browser checks passed\n  ${SHOT}\n`)
    for (const path of JOURNEY) process.stdout.write(`  ${path}\n`)
  } catch (error) {
    const diagnostics = page.events
      .filter((event) => event.method === 'Runtime.exceptionThrown' || event.method === 'Log.entryAdded')
      .map((event) => event.params.entry?.text ?? event.params.exceptionDetails?.exception?.description ?? event.params.exceptionDetails?.text)
    if (diagnostics.length) process.stderr.write(`\n  Browser diagnostics:\n${diagnostics.join('\n')}\n`)
    process.stderr.write(`  Port labels: ${JSON.stringify(await portLabels(page).catch(() => 'unreadable'))}\n`)
    throw error
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`\n  FAIL  ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
