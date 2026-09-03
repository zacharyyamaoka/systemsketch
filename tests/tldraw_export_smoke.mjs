#!/usr/bin/env node
/**
 * Real-browser proof of File → Export to tldraw.
 *
 * The FR's own recipe: run detach-to-primitives over everything, so a board
 * reduces to groups of stock shapes whose `meta` carries what it would take to
 * rebuild them. Four claims, and the third is the one that matters most:
 *
 *   1. The exported file is a plain tldraw file — no `block` or `connection`
 *      shape type, no `systemSketch` envelope. tldraw.com can open it.
 *   2. It still remembers: `group:block` records carry the Block props.
 *   3. The OPEN DOCUMENT IS UNTOUCHED. Export transforms an isolated cloned
 *      editor, so the `.systemsketch` on disk must still hold real Blocks.
 *   4. An occupied destination remains byte-exact until Replace is explicit.
 *   5. Opening the exported `.tldr` and rebuilding gives the Blocks back —
 *      `.systemsketch` → `.tldr` → `.systemsketch`, which is the whole arc.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  delay,
  ensureDir,
  evaluate,
  localConsoleErrors,
  openApp,
  shortcut,
  startApp,
  waitFor,
} from './browser_harness.mjs'
import { addPort, blockIds, box, cables, drawBlock, dragFrom, portClasses, portDot, shot }
  from './block_journey_helpers.mjs'

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

/** What shape types a saved document actually holds. */
function shapeTypes(document) {
  return [...new Set(document.records
    .filter((record) => record.typeName === 'shape')
    .map((record) => record.type))].sort()
}

function rememberedTitles(document) {
  return document.records
    .filter((record) => record.meta?.systemSketch?.kind === 'block')
    .map((record) => record.meta.systemSketch.props.title)
    .sort()
}

async function saved(page) {
  await waitFor(page,
    `document.querySelector('.systemsketch-file-title i')?.dataset.state === 'clean'`,
    'the workspace to report a saved document', 15000)
  await delay(250)
}

/** Click a painted entry in the stock main menu by its exact label. */
async function menuItem(page, label, opensMenu = false) {
  if (opensMenu) {
    const trigger = await box(page, '.systemsketch-file-identity button')
    await clickAt(page, trigger.cx, trigger.cy)
    await delay(300)
  }
  const locate = `(() => {
    const node = Array.from(document.querySelectorAll('[role="menu"] [role="menuitem"]'))
      .find((candidate) => {
        const text = (candidate.querySelector('span')?.textContent ?? '').trim()
        const rect = candidate.getBoundingClientRect()
        return text === ${JSON.stringify(label)} && rect.width > 0 && rect.height > 0
      })
    if (!node) return null
    const rect = node.getBoundingClientRect()
    return JSON.stringify({ cx: rect.x + rect.width / 2, cy: rect.y + rect.height / 2 })
  })()`
  await waitFor(page, locate, `a painted ${label} menu entry`)
  const rect = JSON.parse(await evaluate(page, locate))
  await clickAt(page, rect.cx, rect.cy)
  await delay(400)
}

async function authorBoard(page) {
  await drawBlock(page, { x: 300, y: 260 }, { x: 640, y: 460 }, 'decode')
  await addPort(page, 'outputs')
  await drawBlock(page, { x: 820, y: 260 }, { x: 1160, y: 460 }, 'sink')
  await addPort(page, 'inputs')
  await clickAt(page, 200, 900)
  await delay(340)
  const ports = await portClasses(page)
  await dragFrom(page,
    await box(page, portDot(ports.find((p) => p.port === 'out_1').shape, 'output', 'out_1')),
    await box(page, portDot(ports.find((p) => p.port === 'in_1').shape, 'input', 'in_1')))
  await delay(400)
}

async function main() {
  await ensureDir(SHOTS)
  const app = await startApp({ label: 'systemsketch-export', build: 'export-smoke' })
  const { page, port, filesRoot } = app

  try {
    const boardPath = join(filesRoot, 'SystemSketch', 'Pipeline.systemsketch')
    const exportPath = join(filesRoot, 'SystemSketch', 'Pipeline.tldr')
    const occupiedExport = 'occupied export destination — preserve until Replace\n'
    await openApp(page, port, `?board=${encodeURIComponent(boardPath)}`)
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-app"] .tl-container')`,
      'the SystemSketch product canvas')
    await delay(800)

    await authorBoard(page)
    await saved(page)
    await writeFile(exportPath, occupiedExport)
    check('AUTHORED', 'a real board: two Blocks and one semantic cable',
      { blocks: (await blockIds(page)).length, cables: await cables(page) },
      { blocks: 2, cables: 1 })

    // ------------------------------------------------------------- export ---
    await menuItem(page, 'File', true)
    await menuItem(page, 'Export to tldraw…')
    await waitFor(page, `document.querySelector('.systemsketch-workspace-dialog')`, 'the export dialog')
    await delay(400)
    check('OFFERS-TLDR', 'the export dialog names the format it writes',
      await evaluate(page, `(() => JSON.stringify({
        title: document.querySelector('#workspace-dialog-title')?.textContent,
        suffix: document.querySelector('.systemsketch-workspace-name-field span')?.textContent,
      }))()`).then(JSON.parse),
      { title: 'Export to tldraw', suffix: '.tldr' })
    await shot(page, 'export-dialog.png')

    const confirm = await box(page, '.systemsketch-workspace-dialog footer button.primary')
    await clickAt(page, confirm.cx, confirm.cy)
    await waitFor(page, `document.querySelector('[data-testid="workspace-replace"]')`,
      'the explicit export replacement choice', 20000)
    check('EXPORT-NO-IMPLICIT-OVERWRITE',
      'the first export attempt preserves an occupied destination byte-for-byte',
      await readFile(exportPath, 'utf8'), occupiedExport)
    check('EXPORT-OFFERS-REPLACE',
      'the collision names the destructive follow-up instead of silently replacing',
      await evaluate(page, `document.querySelector('[data-testid="workspace-replace"]').textContent.trim()`),
      'Replace')
    const replace = await box(page, '[data-testid="workspace-replace"]')
    await clickAt(page, replace.cx, replace.cy)
    await waitFor(page, `!document.querySelector('.systemsketch-workspace-dialog')`,
      'the export to finish and the dialog to close', 20000)
    await delay(400)

    const exported = JSON.parse(await readFile(exportPath, 'utf8'))
    check('EXPORTS-A-PLAIN-TLDRAW-FILE',
      'the exported file holds only stock shapes, and carries no SystemSketch envelope',
      {
        types: shapeTypes(exported),
        envelope: Object.hasOwn(exported, 'systemSketch'),
        version: exported.tldrawFileFormatVersion,
      },
      { types: ['arrow', 'geo', 'group', 'line', 'text'], envelope: false, version: 1 })
    check('EXPORT-REMEMBERS', 'and every Block is still in there, as a record on its group',
      rememberedTitles(exported), ['decode', 'sink'])

    // ------------------------------------------ the document is untouched ---
    check('DOCUMENT-SURVIVES-ON-SCREEN', 'the board on screen is unchanged — still Blocks, still wired',
      { blocks: (await blockIds(page)).length, cables: await cables(page) },
      { blocks: 2, cables: 1 })
    await saved(page)
    const original = JSON.parse(await readFile(boardPath, 'utf8'))
    check('DOCUMENT-SURVIVES-ON-DISK',
      'and so is the .systemsketch on disk — export transformed only its clone',
      {
        types: shapeTypes(original),
        envelope: Object.hasOwn(original, 'systemSketch'),
        detachedGroups: rememberedTitles(original).length,
      },
      { types: ['block', 'connection'], envelope: true, detachedGroups: 0 })
    await shot(page, 'export-document-intact.png')

    // -------------------------------------------------- and all the way back ---
    await openApp(page, port, `?board=${encodeURIComponent(exportPath)}`)
    // Not an exact count: a detached Block's group can hold nested port-row
    // groups of its own, so what matters is that groups arrived and no Block did.
    await waitFor(page, `document.querySelectorAll('[data-shape-type="group"]').length >= 2`,
      'the exported .tldr to open as primitives')
    check('TLDR-OPENS-AS-PRIMITIVES', 'the exported file opens with no SystemSketch shape in it',
      await evaluate(page, `document.querySelectorAll('[data-shape-type="block"]').length`), 0)

    await shortcut(page, 'a', 'KeyA', 2)
    await delay(300)
    const group = await box(page, '[data-shape-type="group"]')
    await clickAt(page, group.cx, group.cy, 'right')
    const rebuild = `[data-testid="context-menu.block-rebuild-from-primitives"]`
    await waitFor(page, `document.querySelector(${JSON.stringify(rebuild)})`, 'the rebuild menu item')
    const item = await box(page, rebuild)
    await clickAt(page, item.cx, item.cy)
    await waitFor(page, `document.querySelectorAll('[data-shape-type="block"]').length === 2`,
      'the Blocks to come back out of the exported .tldr')
    check('ROUND-TRIPS', '.systemsketch → .tldr → Blocks again, with the cable',
      {
        blocks: (await blockIds(page)).length,
        cables: await cables(page),
        titles: await evaluate(page, `(() => JSON.stringify(
          Array.from(document.querySelectorAll('.BlockNode-headingTitle, .BlockNode-simpleTitleText'))
            .map((node) => node.textContent.trim()).sort()))()`).then(JSON.parse),
      },
      { blocks: 2, cables: 1, titles: ['decode', 'sink'] })
    await shot(page, 'export-round-trip.png')

    const unexpectedConsoleErrors = localConsoleErrors(page).filter(
      (message) => message !== 'Failed to load resource: the server responded with a status of 409 (Conflict)',
    )
    check(
      'CLEAN',
      'the journey raised no unexpected local console errors (the exercised collision reports its expected 409)',
      unexpectedConsoleErrors,
      [],
    )

    const failed = results.filter((result) => !result.ok)
    process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`)
    await writeFile(join(SHOTS, 'export-acceptance.json'), JSON.stringify(results, null, 2))
    if (failed.length > 0) process.exitCode = 1
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
