#!/usr/bin/env node
/**
 * Real-browser proof of Detach to primitives, and the way back.
 *
 * The claim is not "it made some rectangles". It is that detach is a *door*:
 *
 *   1. A Block becomes stock tldraw primitives — geo, text, line, arrow — with
 *      no SystemSketch shape left on the page.
 *   2. They arrive as ONE group, so the result still behaves like the thing you
 *      detached: one click selects it, one drag moves it.
 *   3. That group's `meta` carries the whole Block record, and it survives the
 *      file. This is read back off the disk the app wrote to, not from the app.
 *   4. Reading it back rebuilds the Block — moved, so the rebuild demonstrably
 *      uses where the group *is* rather than where the Block *was* — and the
 *      cable that became an arrow becomes a semantic cable again.
 *   5. One Ctrl+Z undoes the whole detach.
 *
 * Step 3 is the one the `.tldr` export rests on, so it is proven against a
 * real `.tldr` on disk: a file tldraw.com can open, which SystemSketch can
 * still turn back into Blocks.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  delay,
  drag,
  ensureDir,
  evaluate,
  localConsoleErrors,
  openApp,
  shortcut,
  startApp,
  waitFor,
} from './browser_harness.mjs'
import {
  addPort,
  blockIds,
  box,
  cables,
  drawBlock,
  dragFrom,
  portClasses,
  portDot,
  shot,
} from './block_journey_helpers.mjs'

const SHOTS = join(ROOT, 'docs', 'assets')
const results = []

function check(id, label, observed, desired) {
  const ok = JSON.stringify(observed) === JSON.stringify(desired)
  results.push({ id, label, observed, desired, ok })
  process.stdout.write(
    `  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}\n`
    + (ok ? '' : `        observed=${JSON.stringify(observed)}\n        desired= ${JSON.stringify(desired)}\n`),
  )
}

const BLOCK_A = { from: { x: 300, y: 240 }, to: { x: 640, y: 440 } }
const BLOCK_B = { from: { x: 820, y: 240 }, to: { x: 1160, y: 440 } }

/** How many shapes of each stock type the page is painting. */
const painted = (page) => evaluate(page, `(() => {
  const counts = {}
  for (const node of document.querySelectorAll('[data-shape-type]')) {
    const type = node.dataset.shapeType
    counts[type] = (counts[type] ?? 0) + 1
  }
  return JSON.stringify(counts)
})()`).then(JSON.parse)

async function blockCanvasBox(page, index = 0) {
  const value = await evaluate(page, `(() => {
    const element = document.querySelectorAll('.systemsketch-block-canvas')[${index}]
    if (!element) return null
    const rect = element.getBoundingClientRect()
    return JSON.stringify({ x: rect.x, y: rect.y, w: rect.width, h: rect.height })
  })()`)
  if (!value) throw new Error(`Missing Block canvas at index ${index}`)
  const rect = JSON.parse(value)
  return { ...rect, cx: rect.x + rect.w / 2, cy: rect.y + rect.h / 2 }
}

/** Right-click a point and pick one Block menu item by its id. */
async function runMenuItem(page, at, itemId, label) {
  await clickAt(page, at.cx ?? at.x, at.cy ?? at.y, 'right')
  const selector = `[data-testid="context-menu.${itemId}"]`
  await waitFor(page, `document.querySelector(${JSON.stringify(selector)})`, `the ${label} menu item`)
  const item = await box(page, selector)
  await clickAt(page, item.cx, item.cy)
  await delay(500)
}

async function saved(page) {
  await waitFor(page,
    `document.querySelector('.systemsketch-file-title i')?.dataset.state === 'clean'`,
    'the workspace to report a saved document', 15000)
  await delay(250)
}

/** Every record in the saved document that carries a SystemSketch meta record. */
function rememberedRecords(document) {
  return document.records
    .filter((record) => record.typeName === 'shape' && record.meta?.systemSketch)
    .map((record) => ({ type: record.type, kind: record.meta.systemSketch.kind }))
}

async function authorBoard(page) {
  await drawBlock(page, BLOCK_A.from, BLOCK_A.to, 'decode')
  await addPort(page, 'outputs')
  await drawBlock(page, BLOCK_B.from, BLOCK_B.to, 'sink')
  await addPort(page, 'inputs')
  await clickAt(page, 200, 900)
  await delay(340)
  const ports = await portClasses(page)
  const source = ports.find((port) => port.port === 'out_1')
  const sink = ports.find((port) => port.port === 'in_1')
  await dragFrom(page,
    await box(page, portDot(source.shape, 'output', 'out_1')),
    await box(page, portDot(sink.shape, 'input', 'in_1')))
  await delay(400)
}

async function main() {
  await ensureDir(SHOTS)
  const app = await startApp({ label: 'systemsketch-detach', build: 'detach-smoke' })
  const { page, port, filesRoot } = app

  try {
    // `.tldr` on purpose: this is the file the future export writes, and the
    // one tldraw.com can open. The metadata has to survive it.
    const boardPath = join(filesRoot, 'SystemSketch', 'Detach.tldr')
    await openApp(page, port, `?board=${encodeURIComponent(boardPath)}`)
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-app"] .tl-container')`,
      'the SystemSketch product canvas')
    await delay(800)

    await authorBoard(page)
    check('AUTHORED', 'two Blocks and one semantic cable are authored through the real tools',
      { blocks: (await blockIds(page)).length, cables: await cables(page) },
      { blocks: 2, cables: 1 })
    await shot(page, 'detach-before.png')

    // ------------------------------------------------------------- detach ---
    const first = await blockCanvasBox(page, 0)
    await runMenuItem(page, first, 'block-detach-to-primitives', 'Detach to primitives')
    await waitFor(page, `document.querySelectorAll('[data-shape-type="block"]').length === 1`,
      'one Block to become primitives')
    const afterOne = await painted(page)
    check('BECOMES-STOCK', 'the detached Block is gone and stock primitives stand in its place',
      {
        blocks: afterOne.block ?? 0,
        geo: (afterOne.geo ?? 0) > 0,
        text: (afterOne.text ?? 0) > 0,
        group: afterOne.group ?? 0,
      },
      { blocks: 1, geo: true, text: true, group: 1 })
    check('CABLE-BECOMES-ARROW', 'the semantic cable becomes a stock arrow, and no cable is left',
      { cables: await cables(page), arrows: afterOne.arrow ?? 0 },
      { cables: 0, arrows: 1 })
    await shot(page, 'detach-after-one.png')

    // ----------------------------------------------------- one undo, back ---
    await shortcut(page, 'z', 'KeyZ', 2)
    await waitFor(page, `document.querySelectorAll('[data-shape-type="block"]').length === 2`,
      'the Block to come back')
    check('ONE-UNDO', 'a single Ctrl+Z puts the whole detach back — Block, cable and all',
      { blocks: (await blockIds(page)).length, cables: await cables(page) },
      { blocks: 2, cables: 1 })

    // ------------------------------------- one of a wired pair, and back ----
    // The asymmetric case, and the one a symmetric journey never reaches: only
    // ONE end of the cable was ever detached, so the far end is still a live
    // Block. A rebuild that insists both ends were detached leaves the arrow an
    // arrow — found by driving the review fixture, not by this file.
    const lonely = await blockCanvasBox(page, 0)
    await runMenuItem(page, lonely, 'block-detach-to-primitives', 'Detach to primitives')
    await waitFor(page, `document.querySelectorAll('[data-shape-type="group"]').length === 1`,
      'one Block to become a group')
    const lonelyGroup = await box(page, '[data-shape-type="group"]')
    await runMenuItem(page, lonelyGroup, 'block-rebuild-from-primitives', 'Rebuild from primitives')
    await waitFor(page, `document.querySelectorAll('[data-shape-type="block"]').length === 2`,
      'the lone Block to be rebuilt')
    check('REBUILDS-AGAINST-A-LIVE-BLOCK',
      'rebuilding one of a wired pair restores the cable to the Block that never left',
      {
        blocks: (await blockIds(page)).length,
        cables: await cables(page),
        arrows: (await painted(page)).arrow ?? 0,
      },
      { blocks: 2, cables: 1, arrows: 0 })

    // ------------------------------------------------- detach both, save ----
    await shortcut(page, 'a', 'KeyA', 2)
    await delay(300)
    const selected = await blockCanvasBox(page, 0)
    await runMenuItem(page, selected, 'block-detach-to-primitives', 'Detach to primitives')
    await waitFor(page, `document.querySelectorAll('[data-shape-type="block"]').length === 0`,
      'both Blocks to become primitives')
    check('SWEEPS-A-SELECTION', 'one command detaches the whole selection into two groups',
      { blocks: (await painted(page)).block ?? 0, groups: (await painted(page)).group ?? 0 },
      { blocks: 0, groups: 2 })
    await shot(page, 'detach-after-both.png')

    await saved(page)
    const document = JSON.parse(await readFile(boardPath, 'utf8'))
    check('SURVIVES-THE-FILE', 'the saved .tldr carries the record on the group, and marks the card',
      rememberedRecords(document).map((record) => `${record.type}:${record.kind}`).sort(),
      ['arrow:connection', 'geo:block-card', 'geo:block-card', 'group:block', 'group:block'])
    const remembered = document.records
      .filter((record) => record.meta?.systemSketch?.kind === 'block')
      .map((record) => record.meta.systemSketch.props.title)
      .sort()
    check('REMEMBERS-THE-SEMANTICS', 'and the record is the whole Block, not a picture of one',
      remembered, ['decode', 'sink'])
    check('IS-A-REAL-TLDRAW-FILE', 'while the document itself stays a plain tldraw file',
      {
        envelope: Object.hasOwn(document, 'systemSketch'),
        customShapes: document.records
          .filter((record) => record.typeName === 'shape')
          .some((record) => record.type === 'block' || record.type === 'connection'),
      },
      { envelope: false, customShapes: false })

    // -------------------------------------------- move it, then rebuild -----
    await openApp(page, port, `?board=${encodeURIComponent(boardPath)}`)
    await waitFor(page, `document.querySelectorAll('[data-shape-type="group"]').length === 2`,
      'both groups to reopen from the .tldr')
    check('REOPENS-AS-PRIMITIVES', 'reopened, it is still stock shapes — no SystemSketch shape',
      { blocks: (await painted(page)).block ?? 0, groups: (await painted(page)).group ?? 0 },
      { blocks: 0, groups: 2 })

    // A real drag, and a big one: the rebuild has to land where the group was
    // LEFT, and a two-pixel nudge is a signal small enough for a rebuild that
    // ignored the group entirely to pass by coincidence.
    const groupBefore = await box(page, '[data-shape-type="group"]')
    await clickAt(page, groupBefore.cx, groupBefore.cy)
    // Out-wait tldraw's 450ms double-click window before pressing the same spot
    // again: two presses inside it enter the group instead of dragging it, and
    // the group then does not move at all.
    await delay(600)
    await drag(page,
      { x: groupBefore.cx, y: groupBefore.cy },
      { x: groupBefore.cx, y: groupBefore.cy + 220 })
    await delay(300)
    const groupAfter = await box(page, '[data-shape-type="group"]')
    const moved = Math.round(groupAfter.cy - groupBefore.cy)
    if (Math.abs(moved) < 100) throw new Error(`the group barely moved (${moved}px) — the position check would be meaningless`)

    await shortcut(page, 'a', 'KeyA', 2)
    await delay(300)
    const anyGroup = await box(page, '[data-shape-type="group"]')
    await runMenuItem(page, anyGroup, 'block-rebuild-from-primitives', 'Rebuild from primitives')
    await waitFor(page, `document.querySelectorAll('[data-shape-type="block"]').length === 2`,
      'both Blocks to be rebuilt from what the groups remembered')
    check('REBUILDS-THE-BLOCKS', 'the Blocks come back, and the arrow is a semantic cable again',
      {
        blocks: (await blockIds(page)).length,
        cables: await cables(page),
        arrows: (await painted(page)).arrow ?? 0,
        groups: (await painted(page)).group ?? 0,
      },
      { blocks: 2, cables: 1, arrows: 0, groups: 0 })
    check('REBUILDS-THE-SEMANTICS', 'with their titles and ports, not a picture of them',
      {
        titles: await evaluate(page, `(() => JSON.stringify(
          Array.from(document.querySelectorAll('.BlockNode-headingTitle, .BlockNode-simpleTitleText'))
            .map((node) => node.textContent.trim()).sort()))()`).then(JSON.parse),
        ports: (await portClasses(page)).map((entry) => entry.port).sort(),
      },
      { titles: ['decode', 'sink'], ports: ['in_1', 'out_1'] })

    // The Block that replaced the group I moved — found by where it is, so the
    // check cannot be satisfied by whichever Block happens to be first in DOM
    // order.
    const rebuiltCentres = await evaluate(page, `(() => JSON.stringify(
      Array.from(document.querySelectorAll('.systemsketch-block-canvas')).map((node) => {
        const rect = node.getBoundingClientRect()
        return { cx: rect.x + rect.width / 2, cy: rect.y + rect.height / 2 }
      })))()`).then(JSON.parse)
    const landedOnTheGroup = rebuiltCentres.some((centre) =>
      Math.abs(centre.cx - groupAfter.cx) <= 3 && Math.abs(centre.cy - groupAfter.cy) <= 3)
    check('REBUILDS-WHERE-THE-GROUP-IS',
      `at where the group was left (moved ${moved}px), not where the Block once was`,
      landedOnTheGroup, true)
    await shot(page, 'detach-rebuilt.png')

    check('CLEAN', 'the journey raised no local console errors', localConsoleErrors(page), [])

    const failed = results.filter((result) => !result.ok)
    process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`)
    await writeFile(join(SHOTS, 'detach-acceptance.json'), JSON.stringify(results, null, 2))
    if (failed.length > 0) process.exitCode = 1
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
