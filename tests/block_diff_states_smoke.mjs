#!/usr/bin/env node
/**
 * Real-browser proof for the diff / lint lens: `state` on Block, port and cable.
 *
 * The claims this journey has to settle are visual, so every one of them is
 * read back off the painted DOM and the computed style, never off the model:
 *
 *   1. A board with no lens on it paints EXACTLY what it painted before the
 *      vocabulary existed. The calm case is the one the rejected view failed.
 *   2. A missing port renders in the row it is missing from — a ghost row that
 *      keeps its slot, its dot and its label, struck through.
 *   3. A missing cable lands on that ghost's dot, drawn by the real routing
 *      engine, dashed and set back.
 *   4. A rename reads as one row, `callee → callable`, not as a removal
 *      beside an addition.
 *   5. The paint is a variant, and switching it repaints without touching the
 *      document.
 *   6. The lens comes off. `Clear diff marks` — driven through the real
 *      command palette — deletes the ghosts and returns everything to normal,
 *      because a state must never survive into a board a person then edits.
 *
 * Run with:  npm run test:diff-states
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  delay,
  ensureDir,
  evaluate,
  localConsoleErrors,
  makeChecklist,
  openApp,
  shortcut,
  startApp,
  typeSlowly,
  waitFor,
} from './browser_harness.mjs'

const ASSETS = join(ROOT, 'docs', 'assets')
const CALM_SHOT = join(ASSETS, 'diff-states-calm.png')
const MARKED_SHOT = join(ASSETS, 'diff-states-marked.png')
const VARIANT_SHOT = join(ASSETS, 'diff-states-delta-badge-variant.png')
const CLEARED_SHOT = join(ASSETS, 'diff-states-cleared.png')
const RESULTS = join(ASSETS, 'diff-states-acceptance.json')
const { checks, pass } = makeChecklist()

/**
 * Reload through the product's real dirty-document guard.
 *
 * The board is mid-autosave, so Chromium may raise a before-unload
 * confirmation; an unattended CDP journey has to acknowledge it or
 * `Page.reload` waits forever. Accepts only a dialog raised by this reload.
 */
async function guardedReload(page, timeoutMs = 20000) {
  const firstEvent = page.events.length
  let settled = false
  let failure
  const reload = page.send('Page.reload', { ignoreCache: true })
    .catch((cause) => { failure = cause })
    .finally(() => { settled = true })
  const deadline = Date.now() + timeoutMs
  let handledDialog = false
  let loadSeen = false
  while ((!settled || !loadSeen) && Date.now() < deadline) {
    const events = page.events.slice(firstEvent)
    if (!handledDialog && events.some((event) => event.method === 'Page.javascriptDialogOpening')) {
      handledDialog = true
      await page.send('Page.handleJavaScriptDialog', { accept: true })
    }
    loadSeen = events.some((event) => event.method === 'Page.loadEventFired')
    await delay(40)
  }
  if (!settled || !loadSeen) throw new Error('timed out reloading the marked board')
  await reload
  if (failure) throw failure
}

async function capture(page, path) {
  const shot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(path, Buffer.from(shot.data, 'base64'))
}

/**
 * The board the lens is put on: two Blocks and one real cable, seeded through
 * the public development seam so the journey spends its gestures on the claims
 * rather than on setup.
 */
async function seedBoard(page) {
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    editor.createShapes([
      {
        id: 'shape:producer',
        type: 'block',
        x: 160,
        y: 200,
        props: {
          title: 'estimate()',
          blockType: 'transform',
          view: 'port',
          w: 420,
          h: 250,
          inputs: [{ id: 'in_frame', name: 'frame', type: 'Frame', visible: true }],
          outputs: [{ id: 'out_pose', name: 'pose', type: 'Pose', visible: true }],
        },
      },
      {
        id: 'shape:consumer',
        type: 'block',
        x: 760,
        y: 200,
        props: {
          title: 'transform()',
          blockType: 'transform',
          // Wide enough that 'callee -> callable Estimator' reads without an
          // ellipsis: a truncated rename would prove nothing about the row.
          view: 'port',
          w: 620,
          h: 294,
          inputs: [
            { id: 'in_pose', name: 'pose', type: 'Pose', visible: true },
            { id: 'in_callable', name: 'callable', type: 'Estimator', visible: true },
          ],
          outputs: [{ id: 'out_result', name: 'result', type: 'Pose', visible: true }],
        },
      },
      {
        id: 'shape:live-cable',
        type: 'connection',
        x: 0,
        y: 0,
        props: { routing: 'elbow' },
      },
    ])
    editor.createBindings([
      {
        id: 'binding:live-start',
        type: 'connection',
        fromId: 'shape:live-cable',
        toId: 'shape:producer',
        props: { portId: 'out_pose', terminal: 'start', face: 'outer' },
      },
      {
        id: 'binding:live-end',
        type: 'connection',
        fromId: 'shape:live-cable',
        toId: 'shape:consumer',
        props: { portId: 'in_pose', terminal: 'end', face: 'outer' },
      },
    ])
    editor.selectNone()
    editor.zoomToFit({ animation: { duration: 0 } })
  })()`)
  await delay(500)
}

/** Everything the lens claims, read off the DOM the app actually painted. */
async function paintedState(page) {
  return JSON.parse(await evaluate(page, `(() => {
    const container = document.querySelector('[data-shape-id="shape:consumer"] .systemsketch-block-canvas')
    const rowOf = (portId) => {
      const label = document.querySelector(
        '[data-shape-id="shape:consumer"] [data-testid="port-state-' + portId + '"]',
      )
      if (!label) return null
      const name = label.querySelector('.BlockNode-portName')
      // Round 2 dropped .BlockNode-portWas: a renamed port's former value
      // now lives inside its own name span as [data-testid="was-<path>"],
      // paired with [data-testid="now-<path>"] and an arrow between them.
      const was = label.querySelector('[data-testid="was-name"]')
      const now = label.querySelector('[data-testid="now-name"]')
      const arrow = label.querySelector('.BlockNode-wasNowArrow')
      const style = name ? getComputedStyle(name) : null
      return {
        state: label.dataset.diffState ?? null,
        text: label.textContent,
        was: was ? was.textContent : null,
        wasDisplay: was ? getComputedStyle(was).display : null,
        now: now ? now.textContent : null,
        hasArrow: Boolean(arrow),
        strike: style ? style.textDecorationLine.includes('line-through') : false,
      }
    }
    const dot = (portId) => {
      const element = document.querySelector(
        '[data-shape-id="shape:consumer"] .Port[data-block-port-id="' + portId + '"]',
      )
      return element ? { state: element.dataset.diffState ?? null, present: true } : { present: false }
    }
    const cable = (shapeId) => {
      const svg = document.querySelector('[data-shape-id="' + shapeId + '"] svg') ?? null
      const path = svg ? svg.querySelector('path') : null
      const host = document.querySelector('[data-shape-id="' + shapeId + '"] .tl-svg-container')
        ?? document.querySelector('[data-shape-id="' + shapeId + '"] > *')
      return {
        present: Boolean(path),
        state: host ? host.dataset.diffState ?? null : null,
        dash: path ? path.getAttribute('stroke-dasharray') : null,
        stroke: path ? getComputedStyle(path).stroke : null,
        opacity: host ? getComputedStyle(host).opacity : null,
      }
    }
    return JSON.stringify({
      variant: container ? container.dataset.diffVariant ?? null : null,
      blockState: container ? container.dataset.diffState ?? null : null,
      badge: document.querySelector('[data-testid="block-diff-badge-consumer"]')?.textContent ?? null,
      statedLabels: document.querySelectorAll('.BlockNode-portLabel[data-diff-state]').length,
      renamed: rowOf('in_callable'),
      ghost: rowOf('ghost_callee'),
      ghostDot: dot('ghost_callee'),
      liveCable: cable('shape:live-cable'),
      ghostCable: cable('shape:ghost-cable'),
    })
  })()`))
}

async function main() {
  await ensureDir(ASSETS)
  const app = await startApp({
    label: 'systemsketch-diff-states',
    build: 'diff-states-smoke',
    width: 1500,
    height: 900,
  })
  const board = join(app.filesRoot, 'SystemSketch', 'diff-states.systemsketch')

  try {
    await ensureDir(join(app.filesRoot, 'SystemSketch'))
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, 'window.__systemsketch?.editor', 'the scratch board editor', 30_000)
    await seedBoard(app.page)

    // ---- 1. the calm case ------------------------------------------------
    const calm = await paintedState(app.page)
    assert.equal(calm.blockState, null, 'an ordinary Block writes no diff state')
    assert.equal(calm.variant, null, 'an ordinary Block writes no variant')
    assert.equal(calm.statedLabels, 0, 'an ordinary board has no stated rows')
    assert.equal(calm.badge, null, 'an ordinary Block wears no diff badge')
    assert.equal(calm.liveCable.state, null, 'an ordinary cable writes no diff state')
    assert.equal(calm.liveCable.dash, null, 'an ordinary cable is not dashed')
    await capture(app.page, CALM_SHOT)
    pass('a board with no lens on it paints exactly what it painted before')

    // ---- 2. put the lens on ---------------------------------------------
    // A projector writes these into a derived, disposable document. Written
    // here through ordinary shape updates, which is all a projector does.
    await evaluate(app.page, `(() => {
      const editor = window.__systemsketch.editor
      editor.updateShape({
        id: 'shape:consumer',
        type: 'block',
        props: {
          state: 'changed',
          inputs: [
            { id: 'in_pose', name: 'pose', type: 'Pose', visible: true },
            {
              id: 'in_callable', name: 'callable', type: 'Estimator', visible: true,
              state: 'changed', stateBefore: 'callee',
            },
            {
              id: 'ghost_callee', name: 'callee', type: 'Estimator', visible: true,
              state: 'removed',
            },
          ],
        },
      })
      editor.updateShape({
        id: 'shape:producer',
        type: 'block',
        props: {
          state: 'changed',
          outputs: [
            { id: 'out_pose', name: 'pose', type: 'Pose', visible: true },
            { id: 'ghost_callee', name: 'callee', type: 'Estimator', visible: true, state: 'removed' },
          ],
        },
      })
      editor.createShapes([{
        id: 'shape:ghost-cable',
        type: 'connection',
        x: 0,
        y: 0,
        props: { routing: 'elbow', state: 'removed' },
      }])
      editor.createBindings([
        {
          id: 'binding:ghost-start',
          type: 'connection',
          fromId: 'shape:ghost-cable',
          toId: 'shape:producer',
          props: { portId: 'ghost_callee', terminal: 'start', face: 'outer' },
        },
        {
          id: 'binding:ghost-end',
          type: 'connection',
          fromId: 'shape:ghost-cable',
          toId: 'shape:consumer',
          props: { portId: 'ghost_callee', terminal: 'end', face: 'outer' },
        },
      ])
      editor.selectNone()
      editor.zoomToFit({ animation: { duration: 0 } })
    })()`)
    await waitFor(app.page,
      `document.querySelectorAll('.BlockNode-portLabel[data-diff-state]').length >= 3`,
      'the marked rows')
    await delay(400)

    const marked = await paintedState(app.page)
    assert.equal(marked.blockState, 'changed')
    assert.equal(marked.variant, 'was-now', 'the shipped default variant')
    assert.equal(marked.badge, '−1 ~1', 'the badge counts ports, never records')
    pass('the Block carries the lens and a badge counted in ports')

    // 3. the ghost row is IN the port list, keeping its slot and its dot.
    assert.equal(marked.ghost.state, 'removed')
    assert.ok(marked.ghost.strike, 'a missing port is struck through in its row')
    assert.ok(marked.ghost.text.includes('callee'), 'the missing port still names itself')
    assert.equal(marked.ghostDot.present, true, 'a ghost row keeps its dot')
    assert.equal(marked.ghostDot.state, 'removed')
    pass('a missing port renders in the port row it is missing from')

    // 4. the rename is ONE row.
    assert.equal(marked.renamed.state, 'changed')
    assert.equal(marked.renamed.was, 'callee', 'the row says what it used to be called')
    assert.equal(marked.renamed.now, 'callable', 'and what it is called now')
    assert.ok(marked.renamed.hasArrow, 'the old and new names are joined by the was-now arrow')
    assert.notEqual(marked.renamed.wasDisplay, 'none', 'the former name is actually painted')
    assert.ok(
      marked.renamed.text.indexOf('callee') < marked.renamed.text.indexOf('callable'),
      `old name, then new name, one row (got ${marked.renamed.text})`,
    )
    pass('a renamed port reads as one row: callee → callable')

    // 5. the ghost cable is a real cable the real router drew.
    assert.equal(marked.ghostCable.present, true, 'the missing cable is drawn')
    assert.equal(marked.ghostCable.state, 'removed')
    assert.ok(marked.ghostCable.dash, 'a ghost cable is dashed')
    assert.ok(
      Number(marked.ghostCable.opacity) < 1,
      `a ghost cable is set back (opacity ${marked.ghostCable.opacity})`,
    )
    assert.equal(marked.liveCable.dash, null, 'the live cable beside it is untouched')
    assert.equal(marked.liveCable.state, null)
    assert.notEqual(marked.ghostCable.stroke, marked.liveCable.stroke,
      'a ghost cable is not the ink of a live one')
    await capture(app.page, MARKED_SHOT)
    pass('a missing cable lands on the ghost dot, dashed, by the real router')

    // ---- 6. the paint is a variant --------------------------------------
    // `tinted-card` is gone with round 1, and so is the contrast this step
    // used to prove: the gutter glyph column is now dead CSS. In
    // block-canvas.css, `.BlockNode-portGutter` is only ever un-hidden by
    // `[data-diff-variant='diff-gutter']`, and `diff-gutter` is no longer one
    // of the six shipped `DIFF_VARIANTS` — so the glyph is `display: none`
    // under every surviving paint, including the default, and switching
    // variants can no longer make it appear or disappear. That original claim
    // cannot be reproduced honestly, so this asserts a contrast the current
    // source actually draws instead: `delta-badge` sets the former-value chip
    // AND its arrow to `display: none` outright (block-canvas.css, "R4 · the
    // face is never touched" — "the former value is not on the card at all"),
    // so a renamed port's OLD name disappears from the row under
    // `delta-badge` while the default still paints it.
    await evaluate(app.page, `window.localStorage.setItem(
      'systemsketch.diff-presentation.v1', JSON.stringify({ variant: 'delta-badge' }))`)
    await waitFor(app.page,
      `document.querySelector('.systemsketch-file-title i')?.dataset.state === 'clean'`,
      'the marked board autosaving before the reload')
    await guardedReload(app.page)
    await waitFor(app.page, 'window.__systemsketch?.editor', 'the reloaded board', 30_000)
    await waitFor(app.page,
      `document.querySelectorAll('.BlockNode-portLabel[data-diff-state]').length >= 3`,
      'the marked rows after reload')
    await delay(500)
    const badged = await paintedState(app.page)
    assert.equal(badged.variant, 'delta-badge')
    assert.notEqual(marked.renamed.wasDisplay, 'none', 'the default paints the former name')
    assert.equal(badged.renamed.wasDisplay, 'none', 'delta-badge does not — the R4 face stays untouched')
    // The document did not change; only the paint did.
    assert.equal(badged.ghost.state, 'removed')
    assert.equal(badged.renamed.now, 'callable', 'the current name is still there')
    await capture(app.page, VARIANT_SHOT)
    pass('the variant repaints the same document without changing it')

    // ---- 7. the lens comes off, through the real command palette ---------
    await shortcut(app.page, 'p', 'KeyP', 2)
    await waitFor(app.page,
      `document.querySelector('[data-testid="systemsketch-command-palette"] h2')?.textContent === 'Commands'`,
      'command mode')
    await typeSlowly(app.page, 'clear diff')
    await waitFor(app.page,
      `document.querySelector('.systemsketch-command-palette__results [role="option"] .systemsketch-command-palette__label')
        ?.textContent?.includes('Clear diff marks')`,
      'the Clear diff marks command')
    await shortcut(app.page, 'Enter', 'Enter', 0)
    await waitFor(app.page,
      `!document.querySelector('[data-testid="systemsketch-command-palette"]')`,
      'the palette closing')
    await delay(500)

    const cleared = await paintedState(app.page)
    assert.equal(cleared.statedLabels, 0, 'no row is still wearing a state')
    assert.equal(cleared.blockState, null, 'no Block is still wearing a state')
    assert.equal(cleared.badge, null, 'the badge is gone with the lens')
    assert.equal(cleared.ghost, null, 'the ghost row is gone: it was never content')
    assert.equal(cleared.ghostCable.present, false, 'the ghost cable was never content')
    assert.equal(cleared.liveCable.present, true, 'the real cable survived')
    const survived = JSON.parse(await evaluate(app.page, `(() => {
      const editor = window.__systemsketch.editor
      const consumer = editor.getShape('shape:consumer')
      return JSON.stringify({
        inputs: consumer.props.inputs.map((port) => port.id),
        names: consumer.props.inputs.map((port) => port.name),
        state: consumer.props.state,
        ghostShape: editor.getShape('shape:ghost-cable') ? true : false,
      })
    })()`))
    assert.deepEqual(survived.inputs, ['in_pose', 'in_callable'], 'the ghost row is deleted')
    assert.deepEqual(survived.names, ['pose', 'callable'], 'a renamed row keeps its real name')
    assert.equal(survived.state, 'normal')
    assert.equal(survived.ghostShape, false)
    await capture(app.page, CLEARED_SHOT)
    pass('Clear diff marks takes the lens off and leaves the board a person can edit')

    const errors = localConsoleErrors(app.page)
    assert.deepEqual(errors, [], `browser console errors: ${errors.join('; ')}`)
    pass('no browser console errors across the journey')

    await writeFile(RESULTS, `${JSON.stringify({
      checks,
      captures: [CALM_SHOT, MARKED_SHOT, VARIANT_SHOT, CLEARED_SHOT],
      badge: marked.badge,
      ghostCable: marked.ghostCable,
      renamed: marked.renamed,
    }, null, 2)}\n`)
    process.stdout.write(`\n${checks.length} checks passed\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
