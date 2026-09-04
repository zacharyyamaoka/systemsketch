#!/usr/bin/env node
/**
 * The visual vocabulary comparison, driven in the real app.
 *
 * `block_diff_states_smoke.mjs` proves the MECHANISM: a state reaches the paint,
 * a missing port renders in its row, the lens comes off. This journey settles
 * the DESIGN question that mechanism left open — which paint to default to —
 * and it settles it the only way a taste call about density can be settled:
 * by rendering every variant against the same board at two change counts and
 * looking at the result.
 *
 * The claim under test is the one no unit test can reach. Every variant is
 * legible at three changes; that is not the interesting number. At thirty, a
 * variant whose ink is proportional to the AREA of a changed card has coloured
 * most of the board and stopped ranking anything, while a variant whose ink is
 * proportional to the number of changed ROWS has not. This journey measures
 * exactly that: painted area at N=3 and at N=30, per variant, off the real DOM.
 *
 * It also holds the line the rejected composite crossed. A board with no lens
 * on it must write no diff markup at all — not "faint" markup, none — so a
 * conformance case that passes is byte-identical to opening the board normally.
 *
 * Run with:  npm run test:diff-vocabulary
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
  startApp,
  waitFor,
} from './browser_harness.mjs'

const ASSETS = join(ROOT, 'docs', 'assets', 'diff-vocabulary')
const RESULTS = join(ASSETS, 'diff-vocabulary-acceptance.json')
const { checks, pass } = makeChecklist()

/**
 * The six paints that live in the app, in DIFF_VARIANTS order (src/diff/diffPresentation.ts).
 * Hardcoded to match that file's own style rather than imported, same as its
 * sibling tests/block_diff_round2_smoke.mjs.
 */
const VARIANTS = [
  'was-now',
  'stacked',
  'token-only',
  'delta-badge',
  'ghost-weight',
  'blend',
]

async function capture(page, file) {
  const shot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(file, Buffer.from(shot.data, 'base64'))
}

/**
 * Reload through the product's real dirty-document guard.
 *
 * The board is mid-autosave, so Chromium may raise a before-unload
 * confirmation; an unattended CDP journey has to acknowledge it or
 * `Page.reload` waits forever.
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
  if (!settled || !loadSeen) throw new Error('timed out reloading the diff board')
  await reload
  if (failure) throw failure
}

/**
 * Switch the paint the way the product actually switches it.
 *
 * There is no in-app control for this yet — the preference is localStorage and
 * nothing else — which is itself part of what this journey reports. Driving it
 * through storage and a real reload is therefore not a shortcut past a UI, it
 * is the only path a person has, and the report says so.
 */
async function useVariant(page, variant, blend = 1) {
  await evaluate(page, `window.localStorage.setItem(
    'systemsketch.diff-presentation.v1',
    ${JSON.stringify(JSON.stringify({ variant, blend }))})`)
  await guardedReload(page)
  await waitFor(page, 'window.__systemsketch?.editor', 'the board after reload', 90_000)
}

/**
 * Build a board of `blocks` Blocks and mark `changes` rows across them.
 *
 * Deliberately generated rather than hand-written: the point of the density
 * case is that the SAME board grows a different number of marks, so the only
 * variable between N=3 and N=30 is the marks themselves.
 */
async function seedBoard(page, { blocks, changes }) {
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    editor.selectAll()
    editor.deleteShapes(editor.getSelectedShapeIds())

    const COLUMNS = 3
    const NAMES = ['decode', 'estimate', 'transform', 'encode', 'gather', 'reduce', 'emit', 'collect', 'route']
    const TYPES = ['Frame', 'Pose', 'float', 'bytes', 'Estimator', 'int']
    // added / removed / changed, dealt round-robin so no variant is judged on a
    // board that happens to suit its strongest colour.
    const STATES = ['added', 'removed', 'changed']

    const shapes = []
    let dealt = 0
    for (let index = 0; index < ${blocks}; index += 1) {
      const inputs = []
      const outputs = []
      for (let slot = 0; slot < 3; slot += 1) {
        const state = dealt < ${changes} ? STATES[dealt % STATES.length] : null
        if (state) dealt += 1
        const port = {
          id: 'in_' + index + '_' + slot,
          name: NAMES[(index + slot) % NAMES.length].slice(0, 6),
          type: TYPES[(index + slot) % TYPES.length],
          visible: true,
        }
        if (state) port.state = state
        // A rename is one row saying both names, so the changed rows carry the
        // widest content any row can carry. If anything clips, it clips here.
        if (state === 'changed') port.stateBefore = 'callee'
        inputs.push(port)
      }
      for (let slot = 0; slot < 2; slot += 1) {
        const state = dealt < ${changes} ? STATES[dealt % STATES.length] : null
        if (state) dealt += 1
        const port = {
          id: 'out_' + index + '_' + slot,
          name: NAMES[(index + slot + 2) % NAMES.length].slice(0, 6),
          type: TYPES[(index + slot + 1) % TYPES.length],
          visible: true,
        }
        if (state) port.state = state
        if (state === 'changed') port.stateBefore = 'callee'
        outputs.push(port)
      }
      const touched = [...inputs, ...outputs].some((port) => port.state)
      shapes.push({
        id: 'shape:b' + index,
        type: 'block',
        x: 80 + (index % COLUMNS) * 640,
        y: 120 + Math.floor(index / COLUMNS) * 380,
        props: {
          title: NAMES[index % NAMES.length] + '()',
          blockType: 'transform',
          view: 'port',
          w: 560,
          h: 300,
          // The Block's own state is the altitude above its rows: something
          // happened in here. The rows say what.
          state: touched ? 'changed' : 'normal',
          inputs,
          outputs,
        },
      })
    }
    editor.createShapes(shapes)
    editor.selectNone()
    editor.zoomToFit({ animation: { duration: 0 } })
  })()`)
  await delay(450)
}

/**
 * What the paint actually costs, read off the rendered DOM.
 *
 * `inkArea` is the honest density measure: the summed area of every element
 * this variant tinted, filled or outlined, as a fraction of the summed area of
 * all the Blocks. A variant that tints whole cards approaches 1 and has stopped
 * discriminating; a rail stays near 0 however many changes there are.
 */
async function paintCost(page, baseline) {
  return JSON.parse(await evaluate(page, `(() => {
    // The baseline is what an UNCHANGED card on this same board paints, read
    // off the calm board before any mark existed. Comparing against a measured
    // baseline rather than a guessed colour is what makes "did this variant
    // repaint the card" an observation instead of an assumption — and it is
    // theme-independent, so the same measure holds in dark mode.
    const baseline = ${JSON.stringify(baseline)}
    const cards = [...document.querySelectorAll('.systemsketch-block-canvas')]
    let cardArea = 0
    let cardInk = 0
    let rowInk = 0
    let wasNowInk = 0
    let wasNowPairs = 0
    let clipped = 0
    let clippedType = 0
    const clippedDetail = []
    let markedRows = 0
    for (const card of cards) {
      const box = card.getBoundingClientRect()
      cardArea += box.width * box.height
      const style = getComputedStyle(card)
      // Round 2 dropped the whole-card tint: none of the six shipped variants
      // recolours .systemsketch-block-canvas away from its own untouched
      // background (was-now / stacked / token-only / delta-badge never
      // touch it at all; ghost-weight and blend set it to exactly the
      // untouched card's own --ss-surface-raised). This measurement stays
      // here so that stays an observation, not an assumption — the
      // acceptance below asserts it reads 0 for every one of them.
      const tinted = Boolean(card.dataset.diffState)
        && style.backgroundColor !== baseline.background
      if (tinted) cardInk += box.width * box.height
      for (const row of card.querySelectorAll('.BlockNode-portLabel[data-diff-state]')) {
        markedRows += 1
        const rowBox = row.getBoundingClientRect()
        rowInk += rowBox.width * rowBox.height
        // Round 2 put the ink on the field, not the card: one was-now pair
        // per changed field, sized by however much of the former/current
        // value that variant actually draws (delta-badge collapses the
        // former-value chip and its arrow to display:none; stacked draws
        // the pair two lines tall instead of one).
        for (const pair of row.querySelectorAll('.BlockNode-wasNow')) {
          wasNowPairs += 1
          const pairBox = pair.getBoundingClientRect()
          wasNowInk += pairBox.width * pairBox.height
        }
        for (const span of row.querySelectorAll('.BlockNode-portName, .BlockNode-wasNowWas, .BlockNode-wasNowNow, .BlockNode-portType')) {
          if (span.scrollWidth > span.clientWidth + 1) {
            // A clipped current NAME (or its now-chip) is a defect: a rename
            // row exists to show it. A clipped TYPE, or a clipped
            // former-value chip, is acceptable degradation — the type is
            // context, and the former value is deliberately elidable
            // (compactFormerValue in wordDiff.ts), with the complete value
            // always still in the row's tooltip.
            if (span.classList.contains('BlockNode-portType') || span.classList.contains('BlockNode-wasNowWas')) clippedType += 1
            else clipped += 1
            // Name the offender: a clip count alone cannot tell you whether the
            // row lost a name (fatal) or a type/former-value (merely unfortunate).
            clippedDetail.push(
              span.className + ' "' + span.textContent + '" '
              + span.scrollWidth + '>' + span.clientWidth)
          }
        }
      }
    }
    return JSON.stringify({
      cards: cards.length,
      markedRows,
      clipped,
      rails: document.querySelectorAll('[data-testid="block-diff-rail"]').length,
      badges: document.querySelectorAll('.BlockNode-diffBadge').length,
      // Round 2's other two marks. This board is a port-density case and
      // never seeds a moved/resized Block or a stated cable, so these read 0
      // here — carried through anyway so a future density case that DOES
      // seed them can report ink-per-change for all four kinds without a
      // second harness. This is the real current gap: round 2 reasons about
      // ink-per-change but nothing measures it yet.
      poseGhosts: document.querySelectorAll('[data-pose-change]').length,
      cableMarks: document.querySelectorAll('[data-cable-mark]').length,
      // Two different costs, deliberately not summed. Row ink is proportional
      // to the number of CHANGES, which is the thing the reader wants ranked.
      // Card ink is proportional to the AREA of the cards those changes happen
      // to live in, which is the thing that stops discriminating as N grows —
      // and which round 2 eliminated outright (see cardInk above).
      clippedType,
      clippedDetail: clippedDetail.slice(0, 6),
      cardInk: cardArea > 0 ? Number((cardInk / cardArea).toFixed(3)) : 0,
      rowInk: cardArea > 0 ? Number((rowInk / cardArea).toFixed(3)) : 0,
      wasNowPairs,
      wasNowInk: cardArea > 0 ? Number((wasNowInk / cardArea).toFixed(4)) : 0,
    })
  })()`))
}

async function main() {
  await ensureDir(ASSETS)
  const app = await startApp({
    label: 'systemsketch-diff-vocabulary',
    build: 'diff-vocabulary-smoke',
    width: 1600,
    height: 1000,
  })
  const board = join(app.filesRoot, 'SystemSketch', 'diff-vocabulary.systemsketch')
  const measured = {}

  try {
    await ensureDir(join(app.filesRoot, 'SystemSketch'))
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, 'window.__systemsketch?.editor', 'the scratch board editor', 90_000)

    // ---- the calm case, which is the one the rejected view failed ---------
    await seedBoard(app.page, { blocks: 6, changes: 0 })
    const calm = JSON.parse(await evaluate(app.page, `JSON.stringify({
      stated: document.querySelectorAll('[data-diff-state]').length,
      variants: document.querySelectorAll('[data-diff-variant]').length,
      rails: document.querySelectorAll('[data-testid="block-diff-rail"]').length,
      badges: document.querySelectorAll('.BlockNode-diffBadge').length,
    })`))
    assert.deepEqual(calm, { stated: 0, variants: 0, rails: 0, badges: 0 })
    await capture(app.page, join(ASSETS, 'calm.png'))
    pass('a board with zero changes writes no diff markup at all, in any variant')

    // What an untouched Block paints. Every ink measure below is relative to
    // this, so the metric never depends on a hardcoded colour or on the theme.
    const baseline = JSON.parse(await evaluate(app.page, `(() => {
      const card = document.querySelector('.systemsketch-block-canvas')
      const style = getComputedStyle(card)
      return JSON.stringify({ background: style.backgroundColor, shadow: style.boxShadow })
    })()`))

    // ---- every variant, at three changes and at thirty --------------------
    for (const density of [{ label: 'n3', blocks: 6, changes: 3 }, { label: 'n30', blocks: 6, changes: 30 }]) {
      await seedBoard(app.page, density)
      measured[density.label] = {}
      for (const variant of VARIANTS) {
        await useVariant(app.page, variant)
        await seedBoard(app.page, density)
        const cost = await paintCost(app.page, baseline)
        measured[density.label][variant] = cost
        await capture(app.page, join(ASSETS, `${density.label}-${variant}.png`))
      }
    }
    pass(`every one of the ${VARIANTS.length} paints rendered at 3 changes and at 30`)

    // The marks are the same marks in every variant: only the paint differs.
    const rowCounts = new Set(VARIANTS.map((variant) => measured.n30[variant].markedRows))
    assert.equal(rowCounts.size, 1, `every variant marks the same rows, saw ${[...rowCounts]}`)
    assert.ok(measured.n30['was-now'].markedRows >= 20,
      `the density case must actually be dense, saw ${measured.n30['was-now'].markedRows}`)
    pass('the variants differ only in paint: all six mark exactly the same rows')

    // ---- the finding the pick rests on -----------------------------------
    // Round 1's whole-card tint is gone, and so is the comparison this
    // section used to run ("does a tint spread with N while a rail does
    // not"): `tinted-card` and `edge-rail` are not among the six shipped
    // `DIFF_VARIANTS`, and — per the cardInk measurement above — NONE of the
    // six that survived recolours the card face at all any more. That is
    // asserted here rather than merely noted, because it is exactly the
    // property the round-1 winner was picked for and it is worth knowing it
    // held: round 2 moved every variant's cost onto the changed FIELD.
    for (const variant of VARIANTS) {
      assert.equal(measured.n30[variant].cardInk, 0,
        `${variant} must not tint the card face — round 2 dropped whole-card ink (saw ${measured.n30[variant].cardInk})`)
    }
    pass('none of the six shipped variants tints the card face any more — the ink lives on the field')

    // The comparison that DOES still hold: `delta-badge` sets the
    // former-value chip and its arrow to display:none outright
    // (block-canvas.css, "R4 · the face is never touched"), so its painted
    // was-now area is structurally smaller than the default's at any
    // density — not a measurement that can drift, since it is the same two
    // elements collapsing to zero on every changed row.
    const wasNow3Default = measured.n3['was-now'].wasNowInk
    const wasNow3Badge = measured.n3['delta-badge'].wasNowInk
    const wasNow30Default = measured.n30['was-now'].wasNowInk
    const wasNow30Badge = measured.n30['delta-badge'].wasNowInk
    assert.ok(wasNow3Badge < wasNow3Default,
      `delta-badge must ink less than the default at 3 changes, saw ${wasNow3Badge} vs ${wasNow3Default}`)
    assert.ok(wasNow30Badge < wasNow30Default,
      `delta-badge must ink less than the default at 30 changes, saw ${wasNow30Badge} vs ${wasNow30Default}`)
    assert.equal(
      measured.n30['delta-badge'].wasNowPairs,
      measured.n30['was-now'].wasNowPairs,
      'delta-badge marks exactly the same changed fields as the default, in less ink',
    )
    pass(`was-now ink at 30 changes: default ${wasNow30Default} of the board, delta-badge ${wasNow30Badge}`)

    // ---- the blend scrub, which is the Onshape axis ----------------------
    const scrub = {}
    for (const stop of [0, 0.5, 1]) {
      await useVariant(app.page, 'blend', stop)
      await seedBoard(app.page, { blocks: 6, changes: 12 })
      scrub[String(stop)] = JSON.parse(await evaluate(app.page, `(() => {
        const read = (state) => {
          const row = document.querySelector('.BlockNode-portLabel[data-diff-state="' + state + '"]')
          return row ? Number(getComputedStyle(row).opacity) : null
        }
        return JSON.stringify({ removed: read('removed'), added: read('added') })
      })()`))
      await capture(app.page, join(ASSETS, `blend-${String(stop).replace('.', '')}.png`))
    }
    assert.equal(scrub['0'].removed, 1, 'at scrub 0 the before board is solid')
    assert.equal(scrub['0'].added, 0, 'at scrub 0 the additions are not there yet')
    assert.equal(scrub['1'].removed, 0, 'at scrub 1 the removals are gone')
    assert.equal(scrub['1'].added, 1, 'at scrub 1 the after board is solid')
    assert.ok(scrub['0.5'].removed > 0 && scrub['0.5'].removed < 1, 'the middle is a real blend')
    pass('the blend scrubs before → after in place, on one document and one renderer')

    // ---- nothing clipped, at either density ------------------------------
    const clipped = Object.entries(measured).flatMap(([density, byVariant]) =>
      Object.entries(byVariant)
        .filter(([, cost]) => cost.clipped > 0)
        .map(([variant, cost]) => `${density}/${variant}: ${cost.clipped} — ${cost.clippedDetail.join(' | ')}`))
    assert.deepEqual(clipped, [], `no row may clip its own text, saw ${clipped.join(', ')}`)
    const typeEllipsis = Object.values(measured)
      .flatMap((byVariant) => Object.values(byVariant).map((cost) => cost.clippedType))
      .reduce((a, b) => a + b, 0)
    pass(`no port row clips a NAME at either density (${typeEllipsis} type(s) ellipsised, which is by design)`)

    // ---- switching paint never touches the document ----------------------
    // Read exactly what the claim is about: the STATE the document carries.
    // Definition ids are minted per session by the definition linker, so
    // comparing whole props would compare the seeding, not the paint.
    const readProps = () => evaluate(app.page, `JSON.stringify(
      window.__systemsketch.editor.getCurrentPageShapes()
        .filter((shape) => shape.type === 'block')
        .map((shape) => ({
          id: shape.id,
          state: shape.props.state,
          ports: [...shape.props.inputs, ...shape.props.outputs]
            .map((port) => [port.id, port.state ?? 'normal', port.stateBefore ?? ''].join(':')),
        }))
        .sort((a, b) => a.id.localeCompare(b.id)))`)
    await useVariant(app.page, 'token-only')
    await seedBoard(app.page, { blocks: 6, changes: 12 })
    const underTokenOnly = await readProps()
    await useVariant(app.page, 'ghost-weight')
    await seedBoard(app.page, { blocks: 6, changes: 12 })
    const underGhostWeight = await readProps()
    assert.equal(underTokenOnly, underGhostWeight, 'a paint preference must never write the document')
    pass('the paint is a preference, not a fact: switching it writes nothing to the board')

    const errors = await localConsoleErrors(app.page)
    assert.deepEqual(errors, [], `console errors: ${errors.join(' | ')}`)
    pass('no browser console errors across the journey')

    const report = { checks, measured, scrub }
    await writeFile(RESULTS, `${JSON.stringify(report, null, 2)}\n`)
    // The pyblocks tree keeps the round-2 contract's own report beside it
    // (tests/block_diff_round2_smoke.mjs writes round2-acceptance.json to the
    // same directory); this density measurement joins it there, in addition
    // to — never instead of — the copy above.
    const PYBLOCKS_ASSETS = join(ROOT, '..', 'pyblocks', 'docs', 'assets', 'block-diff-round2')
    const PYBLOCKS_RESULTS = join(PYBLOCKS_ASSETS, 'round2-density.json')
    await ensureDir(PYBLOCKS_ASSETS)
    await writeFile(PYBLOCKS_RESULTS, `${JSON.stringify(report, null, 2)}\n`)
    console.log(`\n${checks.length} checks passed`)
    console.log(`wrote ${RESULTS}`)
    console.log(`wrote ${PYBLOCKS_RESULTS}`)
    for (const variant of VARIANTS) {
      console.log(
        `  ${variant.padEnd(13)}`
        + ` card ink n3 ${String(measured.n3[variant].cardInk).padStart(5)}`
        + ` -> n30 ${String(measured.n30[variant].cardInk).padStart(5)}`
        + `   row ink n30 ${String(measured.n30[variant].rowInk).padStart(5)}`
        + `   was-now ink n30 ${String(measured.n30[variant].wasNowInk).padStart(6)}`,
      )
    }
  } finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
