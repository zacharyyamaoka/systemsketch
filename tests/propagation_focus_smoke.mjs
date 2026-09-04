#!/usr/bin/env node
/** Real-browser acceptance for the non-persisted dataflow propagation lens. */
import assert from 'node:assert/strict'
import { copyFile, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickElement,
  delay,
  ensureDir,
  evaluate,
  key,
  localConsoleErrors,
  makeChecklist,
  openApp,
  shortcut,
  startApp,
  typeSlowly,
  waitFor,
} from './browser_harness.mjs'

const FIXTURE = join(ROOT, 'sketches', 'review', 'propagation-focus.systemsketch')
const { checks, pass } = makeChecklist()

async function screenshot(page, path) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(path, Buffer.from(capture.data, 'base64'))
}

async function select(page, id) {
  await evaluate(page, `void window.__systemsketch.editor.select(${JSON.stringify(id)})`)
}

async function focus(page) {
  await clickElement(page, '[data-testid="propagation-focus-start"]')
  await waitFor(page, `document.querySelector('.tl-container')?.hasAttribute('data-propagation-focus-active')`, 'active propagation lens')
}

async function main() {
  const app = await startApp({
    label: 'propagation-focus',
    build: 'propagation-focus-smoke',
    width: 1600,
    height: 960,
    allowSourceRoot: true,
  })
  const board = join(app.filesRoot, 'SystemSketch', 'propagation-focus-review.systemsketch')
  const shot = join(app.filesRoot, 'propagation-focus-live.png')
  try {
    await ensureDir(join(app.filesRoot, 'SystemSketch'))
    await copyFile(FIXTURE, board)
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, `window.__systemsketch?.editor?.getShape('shape:join')`, 'propagation review fixture', 30_000)
    // A real authored opacity and diff role must remain the shape's own
    // presentation while the lens is active; filter dimming composes with it.
    await evaluate(app.page, `void window.__systemsketch.editor.updateShape({
      id: 'shape:unrelated', type: 'block', opacity: .42, props: { state: 'changed' },
    })`)

    // 1. A real Block seed walks both directions and dims without touching the document.
    await select(app.page, 'shape:join')
    await waitFor(app.page, `document.querySelector('[data-testid="propagation-focus-start"]')`, 'Focus flow selection action')
    // Let the normal document-open/user-presence save settle first. The proof
    // compares the board around the lens gesture, not a browser session's
    // one-time user record initialization.
    await delay(800)
    const before = await readFile(board)
    await focus(app.page)
    const initial = JSON.parse(await evaluate(app.page, `(() => JSON.stringify({
      active: document.querySelector('.tl-container')?.hasAttribute('data-propagation-focus-active'),
      bright: ['source','join','fan-a','fan-b','source-join','join-a','join-b'].every((name) => document.querySelector('[data-shape-id="shape:' + name + '"]')?.dataset.propagationFocus === 'included'),
      unrelated: document.querySelector('[data-shape-id="shape:unrelated"]')?.dataset.propagationFocus ?? null,
      opacity: getComputedStyle(document.querySelector('[data-shape-id="shape:unrelated"]')).opacity,
      filter: getComputedStyle(document.querySelector('[data-shape-id="shape:unrelated"]')).filter,
      hostClass: document.querySelector('[data-shape-id="shape:unrelated"]')?.className,
      parentClass: document.querySelector('[data-shape-id="shape:unrelated"]')?.parentElement?.className,
      containerClass: document.querySelector('.tl-container')?.className,
      containerFocus: document.querySelector('.tl-container')?.getAttribute('data-propagation-focus-active'),
    }))()`))
    assert.equal(initial.active, true)
    assert.equal(initial.bright, true)
    assert.equal(initial.unrelated, null)
    assert.equal(initial.opacity, '0.42')
    assert.ok(initial.filter.includes('opacity'), `unrelated shape was not filtered: ${JSON.stringify(initial)}`)
    await screenshot(app.page, shot)
    pass('a selected Block lights real upstream/fan-out Blocks and cables while unrelated shapes only fade')

    // 2. Stock keybindings retain priority: bare F selects tldraw's Frame
    // tool, and Escape is not captured/prevented by this presentation lens.
    await clickElement(app.page, '[data-testid="propagation-focus-clear"]')
    await key(app.page, 'f', 'KeyF')
    await waitFor(app.page, `window.__systemsketch.editor.getCurrentToolId() === 'frame'`, 'stock Frame shortcut')
    const escapeWasNotCancelled = await evaluate(app.page, `document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape', bubbles: true, cancelable: true,
    }))`)
    assert.equal(escapeWasNotCancelled, true)
    pass('bare F reaches stock Frame and Escape is not cancelled; Focus flow is button-only')

    // 3. Independent bounds are visible, editable controls—not a magic graph depth.
    await evaluate(app.page, `void window.__systemsketch.editor.setCurrentTool('select')`)
    await select(app.page, 'shape:join')
    await waitFor(app.page, `document.querySelector('[data-testid="propagation-focus-start"]')`, 'Focus flow selection action after stock key check')
    await focus(app.page)
    const beforeHost = JSON.parse(await evaluate(app.page, `JSON.stringify({
      opacity: document.querySelector('.tl-shape[data-shape-id="shape:unrelated"]')?.style.opacity ?? '',
      role: window.__systemsketch.editor.getShape('shape:unrelated')?.props.state ?? null,
    })`))
    await evaluate(app.page, `(() => {
      const target = document.querySelector('.tl-shape[data-shape-id="shape:unrelated"]')
      window.__propagationMutations = []
      window.__propagationObserver = new MutationObserver((records) => window.__propagationMutations.push(...records.map((record) => record.attributeName)))
      window.__propagationObserver.observe(target, { attributes: true, subtree: true })
    })()`)
    await clickElement(app.page, '[data-testid="propagation-focus-downstream"]')
    await shortcut(app.page, 'a', 'KeyA', 2)
    await typeSlowly(app.page, '2')
    await key(app.page, 'Enter', 'Enter')
    await waitFor(app.page, `document.querySelector('[data-testid="propagation-focus-downstream"]')?.value === '2'`, 'downstream bound update')
    assert.equal(await evaluate(app.page, `document.querySelector('[data-testid="propagation-focus-upstream"]')?.value`), '1')
    const untouchedHost = JSON.parse(await evaluate(app.page, `JSON.stringify({
      mutationCount: window.__propagationMutations.length,
      opacity: document.querySelector('.tl-shape[data-shape-id="shape:unrelated"]')?.style.opacity ?? '',
      role: window.__systemsketch.editor.getShape('shape:unrelated')?.props.state ?? null,
      marker: document.querySelector('.tl-shape[data-shape-id="shape:unrelated"]')?.dataset.propagationFocus ?? null,
    })`))
    await evaluate(app.page, `window.__propagationObserver.disconnect()`)
    assert.deepEqual(untouchedHost, { ...beforeHost, mutationCount: 0, marker: null })
    pass('bounded controls normalize via the model and update only changed included canvas hosts')

    // 4. Clear must be a pure display reset; the saved fixture bytes remain exact.
    await clickElement(app.page, '[data-testid="propagation-focus-clear"]')
    await waitFor(app.page, `!document.querySelector('.tl-container')?.hasAttribute('data-propagation-focus-active')`, 'cleared propagation lens')
    await delay(450)
    assert.deepEqual(await readFile(board), before, 'focus controls must not serialize board state')
    pass('Clear restores every host without changing saved board bytes')

    // 5. A changed selection cannot silently re-target the lens.
    await select(app.page, 'shape:join')
    await focus(app.page)
    await select(app.page, 'shape:unrelated')
    await waitFor(app.page, `!document.querySelector('.tl-container')?.hasAttribute('data-propagation-focus-active')`, 'selection-change clear')
    pass('selection change clears instead of silently following a new subject')

    // 6. The same guard applies when a selected seed disappears; this temporary
    // fixture mutation happens after the byte-stability assertion above.
    await select(app.page, 'shape:join')
    await focus(app.page)
    await evaluate(app.page, `void window.__systemsketch.editor.deleteShapes(['shape:join'])`)
    await waitFor(app.page, `!document.querySelector('.tl-container')?.hasAttribute('data-propagation-focus-active')`, 'deleted-seed clear')
    pass('deleting the focused seed clears the lens without stale graph ghosts')

    assert.deepEqual(localConsoleErrors(app.page), [])
    pass('the focused browser journey produces zero local console errors')
    process.stdout.write(`\n${checks.length}/${checks.length} propagation-focus browser checks passed\n${shot}\n`)
  } finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
