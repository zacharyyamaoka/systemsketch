#!/usr/bin/env node
/**
 * Empirical capability boundary for a plain tldraw renderer. This is not a
 * SystemSketch rendering test: each probe is saved as a `.tldr` and reopened
 * through the bare default-schema/default-ShapeUtil viewer route.
 */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

import {
  ROOT,
  delay,
  ensureDir,
  evaluate,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const execFileAsync = promisify(execFile)
const ASSETS = join(ROOT, 'docs', 'assets')
const VALID_FILE = join(ASSETS, 'stock-tldr-richness-probe.tldr')
const HEX_FILE = join(ASSETS, 'stock-tldr-richness-hex-color.tldr')
const CSS_FILE = join(ASSETS, 'stock-tldr-richness-css-props.tldr')
const VALID_SCREENSHOT = join(ASSETS, 'stock-tldr-richness-probe.png')
const CSS_SCREENSHOT = join(ASSETS, 'stock-tldr-richness-css-props.png')
const CSS_DIFF = join(ASSETS, 'stock-tldr-richness-css-props-diff.png')
const ACCEPTANCE = join(ASSETS, 'stock-tldr-richness-acceptance.json')

async function screenshot(page, path) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(path, Buffer.from(capture.data, 'base64'))
}

async function viewerState(page) {
  return JSON.parse(await evaluate(page, `(() => {
    const viewer = window.__stockTldrawViewer
    const error = document.querySelector('[data-testid="stock-tldraw-viewer-error"]')
    if (!viewer) return JSON.stringify({ mounted: false, error: error?.textContent ?? null })
    const byId = (id) => viewer.getShape(id)
    const text = ['shape:probe-11', 'shape:probe-17', 'shape:probe-29'].map((id) => {
      const shape = byId(id)
      return { id, size: shape?.props.size, scale: shape?.props.scale, font: shape?.props.font }
    })
    const colors = ['shape:probe-red', 'shape:probe-blue', 'shape:probe-violet'].map((id) => {
      const shape = byId(id)
      return { id, color: shape?.props.color, fill: shape?.props.fill }
    })
    const rich = byId('shape:probe-rich')
    return JSON.stringify({
      mounted: Boolean(document.querySelector('[data-testid="stock-tldraw-viewer"] .tl-container')),
      error: null,
      text,
      colors,
      richText: rich?.props.richText ?? null,
      cssProps: rich && Object.fromEntries(['fontFamily', 'fontSize', 'letterSpacing', 'lineHeight']
        .filter((key) => Object.hasOwn(rich.props, key)).map((key) => [key, rich.props[key]])),
    })
  })()`))
}

async function main() {
  await ensureDir(ASSETS)
  const app = await startApp({ label: 'stock-tldr-richness', build: 'stock-tldr-richness', width: 1280, height: 780 })
  const { page, port } = app
  try {
    await openApp(page, port, '?preset=block-dev')
    await waitFor(page, 'window.__systemsketch?.editor', 'SystemSketch authoring editor')

    const validSource = await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const rich = (text, marks = []) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text, ...(marks.length ? { marks } : {}) }] }] })
      editor.createShapes([
        { id: 'shape:probe-red', type: 'geo', x: 90, y: 100, props: { geo: 'rectangle', w: 180, h: 110, color: 'red', fill: 'semi', dash: 'solid', size: 'm' } },
        { id: 'shape:probe-blue', type: 'geo', x: 320, y: 100, props: { geo: 'oval', w: 180, h: 110, color: 'blue', fill: 'solid', dash: 'solid', size: 'm' } },
        { id: 'shape:probe-violet', type: 'geo', x: 550, y: 100, props: { geo: 'diamond', w: 180, h: 110, color: 'violet', fill: 'semi', dash: 'dashed', size: 'm' } },
        { id: 'shape:probe-11', type: 'text', x: 90, y: 260, props: { color: 'black', font: 'sans', size: 's', scale: 11 / 18, w: 300, autoSize: true, textAlign: 'start', richText: rich('11px = s × 11/18') } },
        { id: 'shape:probe-17', type: 'text', x: 90, y: 300, props: { color: 'blue', font: 'serif', size: 's', scale: 17 / 18, w: 300, autoSize: true, textAlign: 'start', richText: rich('17px = s × 17/18') } },
        { id: 'shape:probe-29', type: 'text', x: 90, y: 350, props: { color: 'violet', font: 'mono', size: 'm', scale: 29 / 24, w: 420, autoSize: true, textAlign: 'start', richText: rich('29px = m × 29/24') } },
        { id: 'shape:probe-rich', type: 'text', x: 90, y: 430, props: { color: 'green', font: 'sans', size: 's', scale: 1, w: 520, autoSize: true, textAlign: 'start', richText: rich('Stock rich text: bold', [{ type: 'bold' }]) } },
      ])
      editor.zoomToFit({ animation: { duration: 0 } })
      return window.__systemsketch.serializeTldraw()
    })()`)
    await writeFile(VALID_FILE, validSource)

    const hexCandidate = JSON.parse(validSource)
    hexCandidate.records.find((record) => record.id === 'shape:probe-red').props.color = '#d14e74'
    await writeFile(HEX_FILE, JSON.stringify(hexCandidate))

    const cssCandidate = JSON.parse(validSource)
    Object.assign(cssCandidate.records.find((record) => record.id === 'shape:probe-rich').props, {
      fontFamily: 'Inter', fontSize: 80, letterSpacing: '18px', lineHeight: 3,
    })
    await writeFile(CSS_FILE, JSON.stringify(cssCandidate))

    await openApp(page, port, '?stock-viewer=/docs/assets/stock-tldr-richness-probe.tldr')
    await waitFor(page, 'window.__stockTldrawViewer', 'valid stock-richness viewer')
    await delay(300)
    const valid = await viewerState(page)
    await screenshot(page, VALID_SCREENSHOT)

    await openApp(page, port, '?stock-viewer=/docs/assets/stock-tldr-richness-hex-color.tldr')
    await waitFor(page, 'document.querySelector("[data-testid=stock-tldraw-viewer-error]")', 'rejection of non-stock hex colour')
    const hex = await viewerState(page)

    await openApp(page, port, '?stock-viewer=/docs/assets/stock-tldr-richness-css-props.tldr')
    await waitFor(page, 'window.__stockTldrawViewer || document.querySelector("[data-testid=stock-tldraw-viewer-error]")', 'CSS-property probe result')
    const css = await viewerState(page)
    let cssVisualScore = null
    if (css.mounted) {
      await screenshot(page, CSS_SCREENSHOT)
      const { stdout } = await execFileAsync('python3', [
        join(ROOT, 'tests', 'detach_fidelity_score.py'), VALID_SCREENSHOT, CSS_SCREENSHOT, CSS_DIFF,
      ])
      cssVisualScore = JSON.parse(stdout.trim())
    }

    const checks = {
      namedStockPaletteRenders: valid.mounted
        && JSON.stringify(valid.colors) === JSON.stringify([
          { id: 'shape:probe-red', color: 'red', fill: 'semi' },
          { id: 'shape:probe-blue', color: 'blue', fill: 'solid' },
          { id: 'shape:probe-violet', color: 'violet', fill: 'semi' },
        ]),
      arbitraryScaleBasedTextSizesRender: valid.mounted
        && JSON.stringify(valid.text) === JSON.stringify([
          { id: 'shape:probe-11', size: 's', scale: 11 / 18, font: 'sans' },
          { id: 'shape:probe-17', size: 's', scale: 17 / 18, font: 'serif' },
          { id: 'shape:probe-29', size: 'm', scale: 29 / 24, font: 'mono' },
        ]),
      richTextMarkRenders: JSON.stringify(valid.richText).includes('bold'),
      arbitraryHexColourIsRejected: !hex.mounted && /rejected/i.test(hex.error ?? ''),
      arbitraryCssTextPropertiesAreRejected: !css.mounted && /rejected/i.test(css.error ?? ''),
    }
    const result = { valid, hex, css, cssVisualScore, checks }
    await writeFile(ACCEPTANCE, `${JSON.stringify(result, null, 2)}\n`)
    assert.ok(Object.values(checks).every(Boolean), JSON.stringify(result, null, 2))
    process.stdout.write(`stock tldr richness passed: ${JSON.stringify(result, null, 2)}\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
