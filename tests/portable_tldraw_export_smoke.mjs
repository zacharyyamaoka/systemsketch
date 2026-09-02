#!/usr/bin/env node
/** Prove that portable export detaches in a clone and stock tldraw accepts it. */
import { createTLSchema, parseTldrawJsonFile } from 'tldraw'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickElement,
  delay,
  evaluate,
  localConsoleErrors,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'
import { blockIds, drawBlock } from './block_journey_helpers.mjs'

const EVIDENCE = join(ROOT, 'docs', 'assets', 'repo-improvements-share.png')

const checks = []
function check(label, condition, detail = '') {
  checks.push({ label, condition, detail })
  process.stdout.write(`  ${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? ` · ${detail}` : ''}\n`)
}

async function waitForDownload(directory) {
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    const entries = await readdir(directory)
    const name = entries.find((entry) => entry.endsWith('.tldr'))
    if (name && !entries.includes(`${name}.crdownload`)) return join(directory, name)
    await delay(100)
  }
  throw new Error('Timed out waiting for the portable .tldr download')
}

async function main() {
  const app = await startApp({ label: 'systemsketch-portable-export', build: 'portable-export-smoke' })
  const { page, port } = app
  try {
    const downloads = join(app.filesRoot, 'downloads')
    await mkdir(downloads, { recursive: true })
    await page.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads })
    await openApp(page, port, '')
    await waitFor(page, `window.__systemsketch?.editor`, 'the development editor seam')
    await delay(500)

    await drawBlock(page, { x: 360, y: 240 }, { x: 700, y: 440 }, 'portable()')
    check('authored board contains one live Block', (await blockIds(page)).length === 1)

    const setup = JSON.parse(await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const firstPage = editor.getCurrentPageId()
      const authored = editor.getCurrentPageShapes().find((shape) => shape.type === 'block')
      editor.updateShape({ id: authored.id, type: 'block', props: {
        view: 'port',
        inputs: [{ id: 'in0', name: 'request', type: 'Task', visible: true }],
        outputs: [{ id: 'out0', name: 'result', type: 'Result', visible: true }],
      } })
      editor.createShape({ id: 'shape:portable-target', type: 'block', x: 820, y: 260,
        props: {
          title: 'target()', view: 'port',
          inputs: [{ id: 'in0', name: 'request', type: 'Task', visible: true }],
          outputs: [{ id: 'out0', name: 'result', type: 'Result', visible: true }],
        } })
      editor.createShape({ id: 'shape:portable-cable', type: 'connection', x: 0, y: 0,
        props: { start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, routing: 'elbow',
          curve: null, pins: [], elbowRoute: null } })
      editor.createBindings([
        { type: 'connection', fromId: 'shape:portable-cable', toId: authored.id,
          props: { portId: 'out0', terminal: 'start', face: 'outer' } },
        { type: 'connection', fromId: 'shape:portable-cable', toId: 'shape:portable-target',
          props: { portId: 'in0', terminal: 'end', face: 'outer' } },
      ])
      editor.createShape({ id: 'shape:portable-pink', type: 'geo', x: 590, y: 520,
        props: { geo: 'ellipse', w: 130, h: 90, color: 'pink' } })
      editor.createPage({ id: 'page:portable-secondary', name: 'Secondary' })
      editor.setCurrentPage('page:portable-secondary')
      editor.createShape({ id: 'shape:portable-secondary-block', type: 'block', x: 120, y: 140,
        props: { title: '' } })
      editor.setCurrentPage(firstPage)
      editor.selectNone()
      editor.zoomToFit({ animation: { duration: 0 } })
      return JSON.stringify({ firstPage, snapshot: JSON.stringify(editor.getSnapshot()) })
    })()`))
    const before = setup.snapshot
    await delay(400)

    await clickElement(page, '[data-testid="systemsketch-share-button"]')
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-share-menu"]')`, 'Share and export menu')
    check('Share exposes real local path and portable export actions', await evaluate(page,
      `document.querySelector('[data-testid="systemsketch-share-menu"]').textContent.includes('Copy board path')
       && document.querySelector('[data-testid="systemsketch-share-menu"]').textContent.includes('Download portable .tldr')
       && !document.querySelector('[data-testid="systemsketch-share-menu"]').textContent.includes('placeholder')`))
    const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(EVIDENCE, Buffer.from(capture.data, 'base64'))

    await clickElement(page, '[data-testid="export-portable-tldr"]')
    const downloadedPath = await waitForDownload(downloads)
    const source = await readFile(downloadedPath, 'utf8')
    const after = await evaluate(page, `JSON.stringify(window.__systemsketch.editor.getSnapshot())`)
    const portable = JSON.parse(source)
    const shapeTypes = portable.records
      .filter((record) => record.typeName === 'shape')
      .map((record) => record.type)
    const bindingTypes = portable.records
      .filter((record) => record.typeName === 'binding')
      .map((record) => record.type)

    check('export leaves the live snapshot byte-identical', before === after)
    check('the live board still paints both connected Blocks', (await blockIds(page)).length === 2)
    check('portable JSON contains no custom Block or connection shape',
      !shapeTypes.includes('block') && !shapeTypes.includes('connection'), shapeTypes.join(', '))
    check('portable JSON contains no semantic connection binding', !bindingTypes.includes('connection'))
    const rememberedBlocks = portable.records.filter((record) =>
      record.typeName === 'shape'
      && record.meta?.systemSketch?.kind === 'block')
    check('all detached Blocks remember enough to rebuild, including a one-card blank',
      rememberedBlocks.length === 3, `remembered ${rememberedBlocks.length} of 3`)

    const detachedCable = portable.records.find((record) =>
      record.typeName === 'shape'
      && record.type === 'arrow'
      && record.meta?.systemSketch?.kind === 'connection')
    check('a bound elbow cable stays a solid stock elbow',
      detachedCable?.props?.kind === 'elbow' && detachedCable?.props?.dash === 'solid',
      detachedCable ? `${detachedCable.props.kind}/${detachedCable.props.dash}` : 'missing arrow')

    const customColors = new Set([
      'dark-gray', 'teal', 'pink', 'gray', 'light-gray', 'light-orange',
      'light-yellow', 'light-teal', 'light-pink',
    ])
    check('custom FigJam colors map to stock values', portable.records
      .filter((record) => record.typeName === 'shape')
      .every((record) => !customColors.has(record.props?.color) && !customColors.has(record.props?.labelColor)))
    check('portable export preserves the board’s active page', portable.records
      .some((record) => record.typeName === 'instance' && record.currentPageId === setup.firstPage))

    const livePaletteIntact = await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      try {
        editor.createShape({ id: 'shape:palette-after-export', type: 'geo', x: 0, y: 0,
          props: { geo: 'rectangle', color: 'pink' } })
        const color = editor.getShape('shape:palette-after-export').props.color
        editor.deleteShape('shape:palette-after-export')
        return color === 'pink'
      } catch { return false }
    })()`)
    check('export does not unregister custom colors from the live editor', livePaletteIntact)

    check('every exported page is free of custom records', portable.records
      .filter((record) => record.typeName === 'shape')
      .every((record) => record.type !== 'block' && record.type !== 'connection'))

    const parsed = parseTldrawJsonFile({ json: source, schema: createTLSchema() })
    check('stock tldraw schema accepts the exported file', parsed.ok,
      parsed.ok ? 'accepted' : parsed.error.type)
    check('browser reports no local console errors', localConsoleErrors(page).length === 0,
      localConsoleErrors(page).join('; '))
  } finally {
    app.close()
  }

  if (checks.some((entry) => !entry.condition)) process.exitCode = 1
  else process.stdout.write(`\n${checks.length} portable-export checks passed.\n`)
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (error) => {
    console.error(error)
    process.exit(1)
  },
)
