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
      editor.createShape({
        id: 'shape:portable-literal-pill',
        type: 'block',
        x: 420,
        y: 610,
        props: {
          view: 'value',
          title: '2.0',
          inputs: [{ id: 'in_1', name: 'gain', type: 'float', visible: true }],
          outputs: [{ id: 'out_1', name: 'gain', type: 'float', visible: true }],
        },
      })
      editor.createShape({
        id: 'shape:portable-fed-pill',
        type: 'block',
        x: 800,
        y: 610,
        props: {
          view: 'value',
          title: 'fallback',
          inputs: [{ id: 'in_1', name: 'chosen', type: 'Result', visible: true }],
          outputs: [{ id: 'out_1', name: 'chosen', type: 'Result', visible: true }],
        },
      })
      editor.createShape({ id: 'shape:portable-pill-cable', type: 'connection', x: 0, y: 0,
        props: { start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, routing: 'elbow',
          curve: null, pins: [], elbowRoute: null } })
      editor.createBindings([
        { type: 'connection', fromId: 'shape:portable-pill-cable', toId: authored.id,
          props: { portId: 'out0', terminal: 'start', face: 'outer' } },
        { type: 'connection', fromId: 'shape:portable-pill-cable', toId: 'shape:portable-fed-pill',
          props: { portId: 'in_1', terminal: 'end', face: 'outer' } },
      ])
      editor.createShape({ id: 'shape:portable-pink', type: 'geo', x: 590, y: 520,
        props: { geo: 'ellipse', w: 130, h: 90, color: 'pink' } })
      editor.createPage({ id: 'page:portable-secondary', name: 'Secondary' })
      editor.setCurrentPage('page:portable-secondary')
      editor.createShape({ id: 'shape:portable-secondary-block', type: 'block', x: 120, y: 140,
        props: { title: '' } })
      editor.createShape({
        id: 'shape:portable-outer-branch',
        type: 'branch',
        x: 80,
        y: 80,
        rotation: 0.12,
        props: {
          w: 620,
          h: 414,
          title: 'Choose transport',
          view: 'expanded',
          activeArmId: 'arm_fast',
          controls: [{ id: 'ctrl_request', name: 'request', type: 'Task' }],
          arms: [
            { id: 'arm_fast', title: 'fast path', open: true, h: 180 },
            { id: 'arm_safe', title: 'safe path', open: true, h: 120 },
          ],
        },
      })
      editor.reparentShapes(['shape:portable-secondary-block'], 'shape:portable-outer-branch')
      editor.createShape({
        id: 'shape:portable-direct-child',
        type: 'geo',
        parentId: 'shape:portable-outer-branch',
        x: 40,
        y: 260,
        rotation: 0.2,
        props: { geo: 'rectangle', w: 110, h: 60, color: 'orange', fill: 'semi' },
      })
      editor.createShape({
        id: 'shape:portable-inner-branch',
        type: 'branch',
        parentId: 'shape:portable-outer-branch',
        x: 300,
        y: 72,
        rotation: -0.08,
        props: {
          w: 260,
          h: 234,
          title: 'Retry policy',
          view: 'case',
          activeArmId: 'arm_retry',
          controls: [],
          arms: [
            { id: 'arm_retry', title: 'retry', open: true, h: 60 },
            { id: 'arm_stop', title: 'stop', open: true, h: 60 },
          ],
        },
      })
      editor.createShape({
        id: 'shape:portable-nested-child',
        type: 'geo',
        parentId: 'shape:portable-inner-branch',
        x: 30,
        y: 90,
        rotation: 0.3,
        props: { geo: 'ellipse', w: 80, h: 50, color: 'green', fill: 'semi' },
      })
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
    check('the live board still paints all four Blocks, including both Pills',
      (await blockIds(page)).length === 4)
    check('portable JSON contains no custom Block or connection shape',
      !shapeTypes.includes('block') && !shapeTypes.includes('connection'), shapeTypes.join(', '))
    check('portable JSON contains no custom Branch shape', !shapeTypes.includes('branch'))
    check('portable JSON contains no semantic connection binding', !bindingTypes.includes('connection'))
    const rememberedBlocks = portable.records.filter((record) =>
      record.typeName === 'shape'
      && record.meta?.systemSketch?.kind === 'block')
    check('all detached Blocks remember enough to rebuild, including both Pills and a one-card blank',
      rememberedBlocks.length === 5, `remembered ${rememberedBlocks.length} of 5`)

    const literalPill = rememberedBlocks.find((record) =>
      record.meta.systemSketch.props?.view === 'value'
      && record.meta.systemSketch.props?.title === '2.0')
    const fedPill = rememberedBlocks.find((record) =>
      record.meta.systemSketch.props?.view === 'value'
      && record.meta.systemSketch.props?.title === 'fallback')
    const childrenOf = (parent) => portable.records.filter((record) =>
      record.typeName === 'shape' && record.parentId === parent?.id)
    const richTextWithin = (parent) => childrenOf(parent)
      .filter((record) => record.type === 'text')
      .map((record) => JSON.stringify(record.props?.richText))
      .join(' ')
    check('a literal Pill becomes a stock oval with its complete variable expression',
      childrenOf(literalPill).some((record) => record.type === 'geo' && record.props?.geo === 'oval')
        && richTextWithin(literalPill).includes('gain = 2.0'))
    check('a fed Pill freezes the visible supplied-value mark but remembers its fallback literal',
      childrenOf(fedPill).some((record) => record.type === 'geo' && record.props?.geo === 'oval')
        && richTextWithin(fedPill).includes('chosen = ⋯')
        && fedPill?.meta?.systemSketch?.props?.title === 'fallback')
    check('each portable Pill keeps both stock rim dots',
      [literalPill, fedPill].every((pill) => childrenOf(pill)
        .filter((record) => record.type === 'geo' && record.props?.geo === 'ellipse')
        .length === 2))

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
    check('custom rounded geometry ids become stock rectangle or oval records', portable.records
      .filter((record) => record.typeName === 'shape' && record.type === 'geo')
      .every((record) => record.props?.geo !== 'excalidraw-rounded-rect'
        && record.props?.geo !== 'systemsketch-rounded-rect'))
    check('portable export preserves the board’s active page', portable.records
      .some((record) => record.typeName === 'instance' && record.currentPageId === setup.firstPage))

    const portableShapes = new Map(portable.records
      .filter((record) => record.typeName === 'shape')
      .map((record) => [record.id, record]))
    const outerBranch = portableShapes.get('shape:portable-outer-branch')
    const innerBranch = portableShapes.get('shape:portable-inner-branch')
    check('Branch regions become same-id stock frames with their visible box and title',
      outerBranch?.type === 'frame'
        && outerBranch.props?.name === 'Choose transport'
        && outerBranch.props?.w === 620
        && outerBranch.props?.h === 414)
    check('portable Branch metadata remembers controls, arms and active state',
      outerBranch?.meta?.systemSketch?.kind === 'branch'
        && outerBranch.meta.systemSketch.props?.controls?.[0]?.name === 'request'
        && outerBranch.meta.systemSketch.props?.arms?.[1]?.title === 'safe path'
        && outerBranch.meta.systemSketch.props?.activeArmId === 'arm_fast')
    check('direct Branch children retain their parent and survive export',
      portableShapes.get('shape:portable-direct-child')?.parentId === outerBranch?.id
        && portableShapes.get('shape:portable-direct-child')?.x === 40
        && portableShapes.get('shape:portable-direct-child')?.y === 260
        && portableShapes.get('shape:portable-direct-child')?.rotation === 0.2)
    check('nested Branches become nested stock frames without flattening',
      innerBranch?.type === 'frame'
        && innerBranch.parentId === outerBranch?.id
        && innerBranch.x === 300
        && innerBranch.y === 72
        && innerBranch.rotation === -0.08)
    check('children inside a nested Branch retain the nested parent',
      portableShapes.get('shape:portable-nested-child')?.parentId === innerBranch?.id
        && portableShapes.get('shape:portable-nested-child')?.x === 30
        && portableShapes.get('shape:portable-nested-child')?.y === 90
        && portableShapes.get('shape:portable-nested-child')?.rotation === 0.3)
    const portableText = portable.records
      .filter((record) => record.typeName === 'shape' && record.type === 'text')
      .map((record) => JSON.stringify(record.props?.richText))
      .join('\n')
    check('stock text and rules preserve Branch arm labels visually',
      portableText.includes('fast path')
        && portableText.includes('safe path')
        && portableText.includes('retry'))

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
      .every((record) => record.type !== 'block' && record.type !== 'branch' && record.type !== 'connection'))

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
