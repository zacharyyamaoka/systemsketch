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
  const shot = join(ROOT, 'docs', 'assets', 'propagation-focus-slider-legibility-live-2026-09-04.png')
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
    await waitFor(app.page, `document.querySelector('[data-testid="propagation-focus-start"]')`, 'Focus selection action')
    assert.equal(await evaluate(app.page, `document.querySelector('[data-testid="propagation-focus-start"]')?.textContent?.trim()`), 'Focus')
    // Let the normal document-open/user-presence save settle first. The proof
    // compares the board around the lens gesture, not a browser session's
    // one-time user record initialization.
    await delay(800)
    const relationBeforeUnrelatedEdit = JSON.parse(await evaluate(app.page, `JSON.stringify(window.__systemsketch.propagationRelationMetrics())`))
    await evaluate(app.page, `void window.__systemsketch.editor.updateShape({
      id: 'shape:unrelated', type: 'block', props: { description: 'must fade; index regression sentinel' },
    })`)
    await delay(150)
    const relationAfterUnrelatedEdit = JSON.parse(await evaluate(app.page, `JSON.stringify(window.__systemsketch.propagationRelationMetrics())`))
    assert.deepEqual(relationAfterUnrelatedEdit, relationBeforeUnrelatedEdit)
    assert.equal(relationAfterUnrelatedEdit.pageShapeReads, 0)
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
    const focusSurface = JSON.parse(await evaluate(app.page, `JSON.stringify((() => {
      const menu = document.querySelector('[data-testid="systemsketch-selection-menu"]')
      return {
        buttons: [...menu.querySelectorAll('button')].map((button) => button.textContent.trim()),
        blockModes: menu.querySelectorAll('[data-testid^="block-pill-view-"]').length,
        ranges: [...menu.querySelectorAll('input[type="range"]')].map((input) => ({
          min: input.min, max: input.max, value: input.value, dir: input.dir, aria: input.getAttribute('aria-valuetext'),
          width: Math.round(input.getBoundingClientRect().width),
        })),
        order: [...menu.querySelector('.systemsketch-propagation-focus').querySelectorAll('input, output, span, button')].map((element) => element.dataset.testid ?? element.textContent.trim()),
      }
    })())`))
    assert.deepEqual(focusSurface, {
      buttons: ['Clear'],
      blockModes: 0,
      ranges: [
        { min: '1', max: '1', value: '1', dir: 'rtl', aria: '1 of 1 upstream steps', width: 180 },
        { min: '1', max: '1', value: '1', dir: '', aria: '1 of 1 downstream steps', width: 180 },
      ],
      order: [
        'propagation-focus-upstream-maximum',
        'propagation-focus-upstream',
        'propagation-focus-upstream-count',
        'steps',
        'propagation-focus-downstream-count',
        'propagation-focus-downstream',
        'propagation-focus-downstream-maximum',
        'propagation-focus-clear',
      ],
    })
    // Simulate tldraw virtualizing a distant host then mounting a replacement:
    // the narrow child-list observer must mark the new included canvas host.
    await evaluate(app.page, `(() => {
      const oldHost = document.querySelector('.tl-shape[data-shape-id="shape:source"]')
      const remounted = oldHost.cloneNode(true)
      delete remounted.dataset.propagationFocus
      oldHost.replaceWith(remounted)
    })()`)
    await waitFor(app.page, `document.querySelector('.tl-shape[data-shape-id="shape:source"]')?.dataset.propagationFocus === 'included'`, 'remounted included source marker')
    pass('Focus opens a compact focus-only surface with outer caps, inner selected values, and no selection-menu modes while unrelated shapes fade')

    await clickElement(app.page, '[data-testid="propagation-focus-clear"]')
    await evaluate(app.page, `(() => {
      const template = window.__systemsketch.editor.getShape('shape:source-join')
      window.__systemsketch.editor.createShapes([{
        id: 'shape:half-bound', type: 'connection', x: 120, y: 940,
        props: { ...template.props },
      }])
      window.__systemsketch.editor.select('shape:half-bound')
    })()`)
    await waitFor(app.page, `window.__systemsketch.editor.getSelectedShapeIds().includes('shape:half-bound')`, 'selected half-bound cable')
    assert.equal(await evaluate(app.page, `Boolean(document.querySelector('[data-testid="propagation-focus-start"]'))`), false)
    assert.equal(await evaluate(app.page, `document.querySelector('.tl-container')?.hasAttribute('data-propagation-focus-active')`), false)
    pass('a selected half-bound cable has neither Focus controls nor a singleton lens')

    // 2. Stock keybindings retain priority: bare F selects tldraw's Frame
    // tool, and Escape is not captured/prevented by this presentation lens.
    await key(app.page, 'f', 'KeyF')
    await waitFor(app.page, `window.__systemsketch.editor.getCurrentToolId() === 'frame'`, 'stock Frame shortcut')
    const escapeWasNotCancelled = await evaluate(app.page, `document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape', bubbles: true, cancelable: true,
    }))`)
    assert.equal(escapeWasNotCancelled, true)
    pass('bare F reaches stock Frame and Escape is not cancelled; Focus is button-only')

    // 3. Independent bounds are visible, editable controls—not a magic graph depth.
    await evaluate(app.page, `void window.__systemsketch.editor.setCurrentTool('select')`)
    await select(app.page, 'shape:join')
    await waitFor(app.page, `document.querySelector('[data-testid="propagation-focus-start"]')`, 'Focus selection action after stock key check')
    // Add one disposable second downstream layer so normal keyboard range
    // interaction exercises a cap above its default of one.
    await evaluate(app.page, `(() => {
      const editor = window.__systemsketch.editor
      const fanA = editor.getShape('shape:fan-a')
      const cable = editor.getShape('shape:join-a')
      editor.run(() => {
        editor.createShapes([
          { ...fanA, id: 'shape:fan-c', x: 1460, y: 470, props: { ...fanA.props, title: 'publish()' } },
          { ...cable, id: 'shape:fan-a-c' },
        ])
        editor.createBindings([
          { type: 'connection', fromId: 'shape:fan-a-c', toId: 'shape:fan-a', props: { portId: 'out', terminal: 'start', face: 'outer' } },
          { type: 'connection', fromId: 'shape:fan-a-c', toId: 'shape:fan-c', props: { portId: 'in', terminal: 'end', face: 'outer' } },
        ])
      })
    })()`)
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
    await key(app.page, 'ArrowRight', 'ArrowRight')
    await waitFor(app.page, `document.querySelector('[data-testid="propagation-focus-downstream"]')?.value === '2'`, 'downstream range update')
    await waitFor(app.page, `document.querySelector('[data-shape-id="shape:fan-c"]')?.dataset.propagationFocus === 'included'`, 'downstream immediately expands')
    await clickElement(app.page, '[data-testid="propagation-focus-clear"]')
    await select(app.page, 'shape:fan-c')
    await focus(app.page)
    await evaluate(app.page, `document.querySelector('[data-testid="propagation-focus-upstream"]')?.focus()`)
    await key(app.page, 'ArrowLeft', 'ArrowLeft')
    await waitFor(app.page, `document.querySelector('[data-testid="propagation-focus-upstream"]')?.value === '2'`, 'RTL upstream range update')
    const outwardSurface = JSON.parse(await evaluate(app.page, `JSON.stringify((() => {
      const focus = document.querySelector('.systemsketch-propagation-focus')
      return {
        order: [...focus.querySelectorAll('input, output, span, button')].map((element) => element.dataset.testid ?? element.textContent.trim()),
        values: [...focus.querySelectorAll('output')].map((output) => output.textContent.trim()),
        upstreamDirection: document.querySelector('[data-testid="propagation-focus-upstream"]')?.dir,
        downstreamDirection: document.querySelector('[data-testid="propagation-focus-downstream"]')?.dir,
      }
    })())`))
    assert.deepEqual(outwardSurface, {
      order: [
        'propagation-focus-upstream-maximum', 'propagation-focus-upstream', 'propagation-focus-upstream-count', 'steps',
        'propagation-focus-downstream-count', 'propagation-focus-downstream', 'propagation-focus-downstream-maximum', 'propagation-focus-clear',
      ],
      values: ['3', '2', '0', '0'], upstreamDirection: 'rtl', downstreamDirection: '',
    })
    await screenshot(app.page, shot)
    const untouchedHost = JSON.parse(await evaluate(app.page, `JSON.stringify({
      mutationCount: window.__propagationMutations.length,
      opacity: document.querySelector('.tl-shape[data-shape-id="shape:unrelated"]')?.style.opacity ?? '',
      role: window.__systemsketch.editor.getShape('shape:unrelated')?.props.state ?? null,
      marker: document.querySelector('.tl-shape[data-shape-id="shape:unrelated"]')?.dataset.propagationFocus ?? null,
    })`))
    await evaluate(app.page, `window.__propagationObserver.disconnect()`)
    assert.deepEqual(untouchedHost, { ...beforeHost, mutationCount: 0, marker: null })
    pass('RTL ArrowLeft expands upstream outward while normal ArrowRight expands downstream, without touching unrelated canvas hosts')

    // 4. Clear must be a pure display reset; the saved fixture bytes remain exact.
    await delay(250)
    const before = await readFile(board)
    await clickElement(app.page, '[data-testid="propagation-focus-clear"]')
    await waitFor(app.page, `!document.querySelector('.tl-container')?.hasAttribute('data-propagation-focus-active')`, 'cleared propagation lens')
    await delay(450)
    assert.deepEqual(await readFile(board), before, 'focus controls must not serialize board state')
    await select(app.page, 'shape:join')
    await waitFor(app.page, `document.querySelector('[data-testid="block-pill-view-expanded"]')`, 'non-focus Block view controls restored')
    await clickElement(app.page, '[data-testid="block-pill-view-expanded"]')
    await waitFor(app.page, `window.__systemsketch.editor.getShape('shape:join')?.props.view === 'expanded'`, 'expanded view outside Focus')
    await clickElement(app.page, '[data-testid="block-pill-view-port"]')
    await waitFor(app.page, `window.__systemsketch.editor.getShape('shape:join')?.props.view === 'port'`, 'port view restored outside Focus')
    await focus(app.page)
    await waitFor(app.page, `document.querySelectorAll('[data-testid^="block-pill-view-"]').length === 0`, 'focus surface hides Block modes on re-entry')
    await clickElement(app.page, '[data-testid="propagation-focus-clear"]')
    await select(app.page, 'shape:source')
    await focus(app.page)
    const sourceZeroDirection = JSON.parse(await evaluate(app.page, `JSON.stringify((() => {
      const upstream = document.querySelector('[data-testid="propagation-focus-upstream"]')
      return { min: upstream.min, max: upstream.max, value: upstream.value, disabled: upstream.disabled, aria: upstream.getAttribute('aria-valuetext') }
    })())`))
    assert.deepEqual(sourceZeroDirection, {
      min: '0', max: '0', value: '0', disabled: true, aria: 'No upstream steps reachable',
    })
    await clickElement(app.page, '[data-testid="propagation-focus-clear"]')
    // A selected cable already lights both endpoints and itself. Its reverse
    // cable is useful once; re-reading the selected cable must not create a
    // second inert slider position.
    await evaluate(app.page, `(() => {
      const editor = window.__systemsketch.editor
      const cable = editor.getShape('shape:join-a')
      editor.run(() => {
        editor.createShape({ ...cable, id: 'shape:fan-a-join' })
        editor.createBindings([
          { type: 'connection', fromId: 'shape:fan-a-join', toId: 'shape:fan-a', props: { portId: 'out', terminal: 'start', face: 'outer' } },
          { type: 'connection', fromId: 'shape:fan-a-join', toId: 'shape:join', props: { portId: 'in', terminal: 'end', face: 'outer' } },
        ])
      })
      editor.select('shape:join-a')
    })()`)
    await focus(app.page)
    const selectedCycleCaps = JSON.parse(await evaluate(app.page, `JSON.stringify({
      upstream: document.querySelector('[data-testid="propagation-focus-upstream"]')?.max,
      downstream: document.querySelector('[data-testid="propagation-focus-downstream"]')?.max,
    })`))
    assert.deepEqual(selectedCycleCaps, { upstream: '1', downstream: '1' })
    await clickElement(app.page, '[data-testid="propagation-focus-clear"]')
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
