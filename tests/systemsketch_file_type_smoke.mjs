#!/usr/bin/env node
/**
 * Real-browser proof of the `.systemsketch` document type.
 *
 * Three claims, each read off the disk the app actually wrote to, never off the
 * app's own report of itself:
 *
 *   1. Everything SystemSketch makes is a `.systemsketch` — the file on disk
 *      carries the envelope, and the envelope names the semantic records the
 *      board holds.
 *   2. A `.tldr` still opens, still edits, and is still saved back as a plain
 *      tldraw file. Backwards compatibility means the old file survives the new
 *      app, not that the new app rewrites it.
 *   3. Both types reload into the same board — Blocks, ports, and the cable
 *      between them come back.
 *
 * The journey works in a throwaway files root created by the harness, so it can
 * never touch a real board.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import {
  ROOT,
  clickAt,
  delay,
  ensureDir,
  evaluate,
  key,
  localConsoleErrors,
  openApp,
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

const BLOCK_A = { from: { x: 300, y: 260 }, to: { x: 640, y: 460 } }
const BLOCK_B = { from: { x: 820, y: 260 }, to: { x: 1160, y: 460 } }

/**
 * Click a stock tldraw menu entry by its visible label.
 *
 * The File submenu is composed into tldraw's own `DefaultMainMenu`, so the
 * journey opens it the way a person does — the hamburger, then the labels.
 * tldraw keeps every submenu's items mounted, so the match has to insist on a
 * node that is actually painted; matching on text alone clicks a hidden one.
 */
async function openMenuItem(page, label) {
  if (label === 'File') {
    const menu = await box(page, '.systemsketch-file-identity button')
    await clickAt(page, menu.cx, menu.cy)
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

/** Wait until the workspace reports a clean save, so the disk is current. */
async function saved(page) {
  await waitFor(page,
    `document.querySelector('.systemsketch-file-title i')?.dataset.state === 'clean'`,
    'the workspace to report a saved document', 15000)
  await delay(200)
}

async function readDocument(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

/** Author two Blocks and wire one output to one input. */
async function authorBoard(page) {
  await drawBlock(page, BLOCK_A.from, BLOCK_A.to, 'decode')
  await addPort(page, 'outputs')
  await drawBlock(page, BLOCK_B.from, BLOCK_B.to, 'sink')
  await addPort(page, 'inputs')
  await clickAt(page, 200, 900)
  await delay(340)
  // Which Block is which comes from the painted ports, not from DOM order:
  // tldraw paints by z-index, which is not the order they were drawn in.
  const ports = await portClasses(page)
  const source = ports.find((port) => port.port === 'out_1')
  const sink = ports.find((port) => port.port === 'in_1')
  const output = await box(page, portDot(source.shape, 'output', 'out_1'))
  const input = await box(page, portDot(sink.shape, 'input', 'in_1'))
  await dragFrom(page, output, input)
  await delay(300)
}

async function main() {
  await ensureDir(SHOTS)
  const app = await startApp({ label: 'systemsketch-file-type', build: 'file-type-smoke' })
  const { page, port, filesRoot } = app

  try {
    // ---------------------------------------------------------------- 1 -----
    // A brand new document. The path is the default the app would pick itself,
    // spelled out here only so the journey knows where to look on disk.
    const sketchPath = join(filesRoot, 'SystemSketch', 'Pipeline.systemsketch')
    await openApp(page, port, `?board=${encodeURIComponent(sketchPath)}`)
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-app"] .tl-container')`,
      'the SystemSketch product canvas')
    await delay(800)

    await authorBoard(page)
    check('AUTHORED', 'two Blocks and one cable are authored through the real tools',
      { blocks: (await blockIds(page)).length, cables: await cables(page) },
      { blocks: 2, cables: 1 })
    await saved(page)
    await shot(page, 'file-type-systemsketch-board.png')

    const written = await readDocument(sketchPath)
    check('ENVELOPE-FIRST', 'the file identifies itself in its first key',
      Object.keys(written)[0], 'systemSketch')
    check('ENVELOPE-INVENTORY', 'the envelope names what the board actually holds',
      {
        application: written.systemSketch?.application,
        formatVersion: written.systemSketch?.formatVersion,
        blocks: written.systemSketch?.shapes?.block ?? 0,
        connections: written.systemSketch?.bindings?.connection ?? 0,
      },
      { application: 'SystemSketch', formatVersion: 2, blocks: 2, connections: 2 })
    check('STILL-A-TLDRAW-FILE', 'the rest of the document is an unchanged tldraw file',
      {
        version: written.tldrawFileFormatVersion,
        schema: typeof written.schema === 'object',
        records: Array.isArray(written.records) && written.records.length > 0,
      },
      { version: 1, schema: true, records: true })

    const titleAfterAuthoring = await evaluate(page,
      `document.querySelector('.systemsketch-file-title span')?.textContent`)
    check('TITLE-DROPS-THE-SUFFIX', 'the file title reads the new extension',
      titleAfterAuthoring, 'Pipeline')

    // ---------------------------------------------------------------- 2 -----
    // The same board reloaded: what came off disk is what goes back on screen.
    await openApp(page, port, `?board=${encodeURIComponent(sketchPath)}`)
    await waitFor(page, `document.querySelectorAll('[data-shape-type="block"]').length === 2`,
      'both Blocks to come back from the .systemsketch file')
    check('SKETCH-RELOADS', 'a .systemsketch reload restores the Blocks and the cable',
      { blocks: (await blockIds(page)).length, cables: await cables(page) },
      { blocks: 2, cables: 1 })
    check('SKETCH-TITLES', 'the semantic Block titles survive the round trip',
      await evaluate(page, `(() => JSON.stringify(
        Array.from(document.querySelectorAll(
          '.BlockNode-headingTitle, .BlockNode-simpleTitleText'))
          .map((node) => node.textContent.trim()).sort()))()`).then(JSON.parse),
      ['decode', 'sink'])

    // ---------------------------------------------------------------- 3 -----
    // A legacy `.tldr`, written before this file type existed: a plain tldraw
    // file with no envelope, placed on disk by hand.
    const legacyPath = join(filesRoot, 'SystemSketch', 'Legacy.tldr')
    const legacyCore = { ...written }
    delete legacyCore.systemSketch
    await mkdir(dirname(legacyPath), { recursive: true })
    await writeFile(legacyPath, `${JSON.stringify(legacyCore, null, 2)}\n`, 'utf8')

    await openApp(page, port, `?board=${encodeURIComponent(legacyPath)}`)
    await waitFor(page, `document.querySelectorAll('[data-shape-type="block"]').length === 2`,
      'both Blocks to come back from the legacy .tldr file')
    check('TLDR-OPENS', 'a plain .tldr opens with its Blocks and cable intact',
      { blocks: (await blockIds(page)).length, cables: await cables(page) },
      { blocks: 2, cables: 1 })
    check('TLDR-TITLE', 'the legacy document keeps its own name',
      await evaluate(page, `document.querySelector('.systemsketch-file-title span')?.textContent`),
      'Legacy')
    await shot(page, 'file-type-legacy-tldr-board.png')

    // Edit it, and the save must go back as a plain tldraw file.
    await drawBlock(page, { x: 360, y: 560 }, { x: 640, y: 720 }, 'appended')
    await clickAt(page, 200, 900)
    await saved(page)
    const legacyAfterEdit = await readDocument(legacyPath)
    check('TLDR-STAYS-TLDR', 'editing a .tldr saves it back without an envelope',
      {
        envelope: Object.hasOwn(legacyAfterEdit, 'systemSketch'),
        firstKey: Object.keys(legacyAfterEdit)[0],
        blockRecords: legacyAfterEdit.records.filter((record) => record.type === 'block').length,
      },
      { envelope: false, firstKey: 'tldrawFileFormatVersion', blockRecords: 3 })

    // ---------------------------------------------------------------- 4 -----
    // The chrome that offers new files offers the new type.
    await openApp(page, port, `?board=${encodeURIComponent(sketchPath)}`)
    await waitFor(page, `document.querySelector('.systemsketch-file-title')`, 'the file identity button')
    await delay(500)
    const identity = await box(page, '.systemsketch-file-title')
    await clickAt(page, identity.cx, identity.cy)
    await waitFor(page, `document.querySelector('.systemsketch-file-title-input')`, 'the inline rename field')
    check('RENAME-KEEPS-THE-TYPE', 'renaming starts inline while the current .systemsketch identity remains visible in the board URL',
      await evaluate(page, `JSON.stringify({
        modal: Boolean(document.querySelector('.systemsketch-workspace-dialog')),
        value: document.querySelector('.systemsketch-file-title-input')?.value,
        path: new URL(location.href).searchParams.get('board'),
      })`).then(JSON.parse),
      { modal: false, value: 'Pipeline', path: sketchPath })
    await shot(page, 'file-type-inline-rename.png')
    await key(page, 'Escape', 'Escape')
    await delay(300)

    // ---------------------------------------------------------------- 5 -----
    // File → Open… lists both document types side by side, each labelled.
    await openMenuItem(page, 'File')
    await openMenuItem(page, 'Open…')
    await waitFor(page, `document.querySelector('.systemsketch-workspace-file-list button')`,
      'the workspace file browser')
    await delay(400)
    check('OPEN-LISTS-BOTH', 'the Open browser offers both document types, each labelled',
      await evaluate(page, `(() => JSON.stringify(
        Array.from(document.querySelectorAll('.systemsketch-workspace-file-list button:not(.folder)'))
          .map((node) => ({
            title: node.querySelector('b')?.textContent,
            kind: node.querySelector('small')?.dataset.kind,
          }))
          .sort((a, b) => a.title.localeCompare(b.title))))()`).then(JSON.parse),
      [
        { title: 'Legacy', kind: 'tldraw' },
        { title: 'Pipeline', kind: 'systemsketch' },
      ])
    await shot(page, 'file-type-open-dialog.png')

    check('CLEAN', 'the journey raised no local console errors', localConsoleErrors(page), [])

    const failed = results.filter((result) => !result.ok)
    process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`)
    await writeFile(join(SHOTS, 'file-type-acceptance.json'), JSON.stringify(results, null, 2))
    if (failed.length > 0) process.exitCode = 1
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
