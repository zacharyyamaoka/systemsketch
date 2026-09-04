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
const STOCK_EVIDENCE = join(ROOT, 'docs', 'assets', 'stock-tldr-primitives-stock-render.png')

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
          curve: null, pins: [], elbowRoute: null, temporal: 'delayed', delayValue: '7', pillPosition: 0.62 } })
      editor.createBindings([
        { type: 'connection', fromId: 'shape:portable-pill-cable', toId: authored.id,
          props: { portId: 'out0', terminal: 'start', face: 'outer' } },
        { type: 'connection', fromId: 'shape:portable-pill-cable', toId: 'shape:portable-fed-pill',
          props: { portId: 'in_1', terminal: 'end', face: 'outer' } },
      ])
      editor.createShape({ id: 'shape:portable-pink', type: 'geo', x: 590, y: 520,
        props: { geo: 'ellipse', w: 130, h: 90, color: 'pink' } })
      editor.createShapes([
        { id: 'shape:portable-async-source', type: 'block', x: 1120, y: 650,
          props: { title: 'async source', view: 'port', inputs: [], outputs: [{ id: 'out0', name: 'event', type: 'Event', visible: true }] } },
        { id: 'shape:portable-async-target', type: 'block', x: 1500, y: 650,
          props: { title: 'async target', view: 'port', inputs: [{ id: 'in0', name: 'event', type: 'Event', visible: true }], outputs: [] } },
        { id: 'shape:portable-async-edge', type: 'connection', x: 0, y: 0,
          props: { start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, routing: 'straight', temporal: 'async', curve: null, pins: [], elbowRoute: null } },
      ])
      editor.createBindings([
        { type: 'connection', fromId: 'shape:portable-async-edge', toId: 'shape:portable-async-source',
          props: { portId: 'out0', terminal: 'start', face: 'outer' } },
        { type: 'connection', fromId: 'shape:portable-async-edge', toId: 'shape:portable-async-target',
          props: { portId: 'in0', terminal: 'end', face: 'outer' } },
      ])
      editor.createShape({
        id: 'shape:portable-secondary-frame', type: 'frame', x: 1400, y: 80,
        props: { name: 'Secondary', w: 780, h: 600 },
      })
      editor.createShape({ id: 'shape:portable-secondary-block', type: 'block',
        parentId: 'shape:portable-secondary-frame', x: 120, y: 140,
        props: { title: '' } })
      editor.createShape({
        id: 'shape:portable-outer-branch',
        type: 'branch',
        parentId: 'shape:portable-secondary-frame',
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
      return JSON.stringify({ firstPage })
    })()`))
    await delay(400)
    // Branch arm records materialize on the first layout pass; let that and
    // ordinary shape normalization settle before the immutable-export baseline.
    const before = await evaluate(page, `JSON.stringify(window.__systemsketch.editor.getSnapshot())`)

    await clickElement(page, '[data-testid="systemsketch-share-button"]')
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-share-menu"]')`, 'Share and export menu')
    check('Share exposes real local path and portable export actions', await evaluate(page,
      `document.querySelector('[data-testid="systemsketch-share-menu"]').textContent.includes('Copy board path')
       && document.querySelector('[data-testid="systemsketch-share-menu"]').textContent.includes('Download portable .tldr')
       && !document.querySelector('[data-testid="systemsketch-share-menu"]').textContent.includes('placeholder')`))
    const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(EVIDENCE, Buffer.from(capture.data, 'base64'))

    await clickElement(page, '[data-testid="export-portable-tldr"]')
    let downloadedPath
    try {
      downloadedPath = await waitForDownload(downloads)
    } catch (error) {
      const status = await evaluate(page, `document.querySelector('[data-testid="systemsketch-share-menu"] [role="status"]')?.textContent ?? ''`)
      throw new Error(`${error.message}; export status: ${status}`)
    }
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
    check('the live one-canvas board still paints all seven Blocks, including the framed blank, both Pills and async pair',
      (await blockIds(page)).length === 7)
    check('portable JSON contains no custom Block or connection shape',
      !shapeTypes.includes('block') && !shapeTypes.includes('connection'), shapeTypes.join(', '))
    check('portable JSON contains no custom Branch shape', !shapeTypes.includes('branch'))
    check('portable JSON contains no semantic connection binding', !bindingTypes.includes('connection'))
    const rememberedBlocks = portable.records.filter((record) =>
      record.typeName === 'shape'
      && record.meta?.systemSketch?.kind === 'block')
    check('all detached Blocks remember enough to rebuild, including both Pills and a one-card blank',
      rememberedBlocks.length === 7, `remembered ${rememberedBlocks.length} of 7`)

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
    check('a wired Pill preserves its manually authored literal in the portable face',
      childrenOf(fedPill).some((record) => record.type === 'geo' && record.props?.geo === 'oval')
        && richTextWithin(fedPill).includes('chosen = fallback')
        && fedPill?.meta?.systemSketch?.props?.title === 'fallback')
    check('each portable Pill keeps both stock rim dots',
      [literalPill, fedPill].every((pill) => childrenOf(pill)
        .filter((record) => record.type === 'geo' && record.props?.geo === 'ellipse')
        .length === 2))

    const detachedCable = portable.records.find((record) =>
      record.typeName === 'shape'
      && record.type === 'arrow'
      && record.meta?.systemSketch?.kind === 'connection'
      && record.meta.systemSketch.temporal === 'data')
    check('a data edge lowers to an honest solid stock elbow',
      detachedCable?.props?.kind === 'elbow' && detachedCable?.props?.dash === 'solid',
      detachedCable ? `${detachedCable.props.kind}/${detachedCable.props.dash}` : 'missing arrow')
    const detachedAsync = portable.records.find((record) => record.typeName === 'shape'
      && record.type === 'arrow' && record.meta?.systemSketch?.kind === 'connection'
      && record.meta.systemSketch.temporal === 'async')
    const detachedDelayed = portable.records.find((record) => record.typeName === 'shape'
      && record.type === 'arrow' && record.meta?.systemSketch?.kind === 'connection'
      && record.meta.systemSketch.temporal === 'delayed')
    check('an async edge lowers to stock dashed arrow props while retaining only semantic metadata',
      detachedAsync?.props?.dash === 'dashed' && !detachedAsync?.meta?.systemSketchPrimitiveStyle,
      detachedAsync ? detachedAsync.props.dash : 'missing async arrow')
    check('a delayed edge lowers to a stock dotted arrow plus standalone stock oval/text z⁻¹ pill',
      detachedDelayed?.props?.dash === 'dotted'
        && portable.records.some((record) => record.typeName === 'shape' && record.type === 'geo'
          && record.props?.geo === 'oval')
        && portable.records.some((record) => record.typeName === 'shape' && record.type === 'group'
          && record.meta?.systemSketch?.kind === 'connection-delay-pill')
        && portable.records.some((record) => record.typeName === 'shape' && record.type === 'text'
          && JSON.stringify(record.props?.richText).includes('z⁻¹ = 7')),
      detachedDelayed ? detachedDelayed.props.dash : 'missing delayed arrow')

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
    check('portable export preserves the board’s active canvas', portable.records
      .some((record) => record.typeName === 'instance' && record.currentPageId === setup.firstPage))

    const portableShapes = new Map(portable.records
      .filter((record) => record.typeName === 'shape')
      .map((record) => [record.id, record]))
    const branchGroups = [...portableShapes.values()]
      .filter((shape) => shape.type === 'group' && shape.meta?.systemSketch?.kind === 'branch')
    const outerBranch = branchGroups.find((shape) => shape.meta.systemSketch.props?.title === 'Choose transport')
    const innerBranch = branchGroups.find((shape) => shape.meta.systemSketch.props?.title === 'Retry policy')
    const outerCard = [...portableShapes.values()].find((shape) => shape.parentId === outerBranch?.id
      && shape.type === 'geo' && shape.props?.geo === 'rectangle'
      && shape.props?.w === 620 && shape.props?.h === 414)
    check('Branch regions become stock Groups with a materialised stock rectangle and title metadata',
      outerBranch?.type === 'group' && outerCard?.type === 'geo')
    check('portable Branch metadata remembers controls, arms and active state',
      outerBranch?.meta?.systemSketch?.kind === 'branch'
        && outerBranch.meta.systemSketch.props?.controls?.[0]?.name === 'request'
        && outerBranch.meta.systemSketch.props?.arms?.[1]?.title === 'safe path'
        && outerBranch.meta.systemSketch.props?.activeArmId === 'arm_fast')
    check('direct Branch children retain their group parent and survive export',
      portableShapes.get('shape:portable-direct-child')?.parentId === outerBranch?.id
        && portableShapes.get('shape:portable-direct-child')?.type === 'geo')
    check('nested Branches become nested stock Groups without flattening',
      innerBranch?.type === 'group' && innerBranch.parentId === outerBranch?.id)
    check('children inside a nested Branch retain the nested parent',
      portableShapes.get('shape:portable-nested-child')?.parentId === innerBranch?.id
        && portableShapes.get('shape:portable-nested-child')?.type === 'geo')
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

    check('the exported canvas is free of custom records', portable.records
      .filter((record) => record.typeName === 'shape')
      .every((record) => record.type !== 'block' && record.type !== 'branch' && record.type !== 'connection'))

    const parsed = parseTldrawJsonFile({ json: source, schema: createTLSchema() })
    check('stock tldraw schema accepts the exported file', parsed.ok,
      parsed.ok ? 'accepted' : parsed.error.type)
    const stockSvg = await evaluate(page, `window.__systemsketch.renderStockTldraw(${JSON.stringify(source)})`)
    check('default tldraw ShapeUtils render the detached file without SystemSketch paint hooks',
      typeof stockSvg === 'string' && stockSvg.includes('<svg')
        && !stockSvg.includes('systemsketch-detached') && !stockSvg.includes('data-detached-edge-type'),
      typeof stockSvg === 'string' ? `${stockSvg.length} stock SVG bytes` : 'no SVG')
    await evaluate(page, `(() => {
      const host = document.createElement('div')
      host.id = 'stock-portability-render'
      host.dataset.testid = 'stock-portability-render'
      host.style.cssText = 'position:fixed;inset:0;background:white;z-index:99999;padding:24px;overflow:hidden'
      host.innerHTML = ${JSON.stringify(stockSvg)}
      document.body.appendChild(host)
      return true
    })()`)
    await waitFor(page, `document.querySelector('#stock-portability-render svg')`, 'default tldraw SVG mounted in the browser')
    const stockShot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(STOCK_EVIDENCE, Buffer.from(stockShot.data, 'base64'))
    await evaluate(page, `document.querySelector('#stock-portability-render')?.remove(); true`)
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
