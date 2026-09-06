#!/usr/bin/env node
/**
 * Real-browser regression for exporting a Behavior Tree region.
 *
 * Stock tldraw's SVG/PNG export skips a lone selected frame-like shape's own
 * `toSvg` — it assumes that paint is decorative frame chrome (see
 * `getSvgJsx.tsx`'s `singleFrameShapeId`). For `BehaviorTreeShapeUtil`, that
 * "chrome" is the wires, the Start marker and the header title: most of the
 * diagram. Selecting only the region and exporting it — the natural path,
 * via the right-click "Export as" menu — used to produce an SVG/PNG missing
 * all of that, while the region's child Blocks still exported fine. The fix
 * lives in `src/toolbar/toolbarIntegration.ts` (`SYSTEMSKETCH_TOOLBAR_OVERRIDES.actions`),
 * which widens the exported id set to the region plus its descendants before
 * the stock action ever computes bounds — no ShapeUtil-level lever exists for
 * this (see the `WHY:` comment there for the full reasoning).
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  delay,
  elementBox,
  ensureDir,
  evaluate,
  localConsoleErrors,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const SHOTS = join(ROOT, 'docs', 'assets')
const OUT = join(SHOTS, 'behavior-tree-export-acceptance.json')
const REGION = 'shape:region'
const results = []

function check(id, label, observed, desired) {
  const ok = JSON.stringify(observed) === JSON.stringify(desired)
  results.push({ id, label, observed, desired, ok })
  process.stdout.write(
    `  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}\n`
    + (ok ? '' : `        observed=${JSON.stringify(observed)} desired=${JSON.stringify(desired)}\n`),
  )
}

async function clickMenuItem(page, testId) {
  const selector = `[data-testid="${testId}"]`
  await waitFor(page, `Boolean(document.querySelector(${JSON.stringify(selector)}))`, testId, 8000)
  const item = await elementBox(page, selector)
  await clickAt(page, item.cx, item.cy)
  await delay(280)
}

/**
 * Export via the real context menu — the same path a person uses — and hand
 * back the exported Blob's bytes. `downloadFile()` (stock tldraw) hands a
 * `File` (a `Blob`) to `URL.createObjectURL` before clicking a detached
 * anchor; capturing it there proves the actual export path without needing a
 * real download sink in headless Chrome.
 */
async function exportRegionViaContextMenu(page, format) {
  await evaluate(page, `(() => {
    if (!window.__realCreateObjectURL) window.__realCreateObjectURL = URL.createObjectURL.bind(URL)
    window.__capturedExport = null
    URL.createObjectURL = (blob) => { window.__capturedExport = blob; return window.__realCreateObjectURL(blob) }
    if (!window.__realAnchorClick) window.__realAnchorClick = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function () { /* no real download sink headlessly */ }
    return null
  })()`)

  const region = await elementBox(page, `[data-shape-id="${REGION}"]`)
  // The header band, not the interior: per BehaviorTreeShapeUtil's own docs,
  // clicking the interior selects whichever projected child sits there,
  // exactly like a stock Frame. The band selects the region itself — the
  // natural "select the region, then export" path this regression is about.
  await clickAt(page, region.cx, region.y + 16, 'right')
  await waitFor(page, `Boolean(document.querySelector('[data-testid="context-menu-sub.export-as-button"]'))`, 'Export as submenu trigger', 8000)
  await clickMenuItem(page, 'context-menu-sub.export-as-button')
  await clickMenuItem(page, `context-menu.export-as-${format}`)
  await waitFor(page, 'window.__capturedExport !== null', 'export blob captured', 8000)

  const encoded = JSON.parse(await evaluate(page, `(async () => {
    const blob = window.__capturedExport
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let binary = ''
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
    return JSON.stringify({ type: blob.type, size: blob.size, base64: btoa(binary) })
  })()`))
  await evaluate(page, `(() => { document.body.click(); return null })()`)
  await delay(150)
  return { ...encoded, bytes: Buffer.from(encoded.base64, 'base64') }
}

async function main() {
  await ensureDir(SHOTS)
  const app = await startApp({ label: 'bt-export', build: 'behavior-tree-export-smoke', width: 1400, height: 900 })
  const { page, port } = app

  try {
    await openApp(page, port, '')
    await waitFor(page, 'Boolean(window.__systemsketch?.editor)', 'editor to mount')
    await delay(600)

    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      editor.deleteShapes([...editor.getCurrentPageShapeIds()])
      editor.createShape({ id: '${REGION}', type: 'behaviorTree', x: 200, y: 160, props: { xml: window.__systemsketch.behaviorTree.SAMPLE_BEHAVIOR_TREE_XML, title: 'PickAndPlace' } })
      editor.selectNone()
      return null
    })()`)
    await waitFor(page, `window.__systemsketch.editor.getSortedChildIdsForParent('${REGION}').length >= 1`, 'the tree to project')
    await delay(300)
    await evaluate(page, `(() => { window.__systemsketch.editor.zoomToFit({ animation: { duration: 0 } }); return null })()`)
    await delay(200)

    const svgExport = await exportRegionViaContextMenu(page, 'svg')
    const svgText = svgExport.bytes.toString('utf8')
    check('BTE-1', 'exporting only the region still produces an SVG mime type', svgExport.type, 'image/svg+xml')
    check('BTE-2', 'the region\'s wires (paths) are in the export, not just its children',
      (svgText.match(/<path[ >]/g) ?? []).length > 0, true)
    check('BTE-3', 'the header divider (line) is in the export', (svgText.match(/<line[ >]/g) ?? []).length > 0, true)
    check('BTE-4', 'the region title text is in the export', svgText.includes('PickAndPlace'), true)
    check('BTE-5', 'the Start marker text is in the export', svgText.includes('>Start<'), true)

    // Cross-check against the unambiguous case: exporting the region plus its
    // descendants explicitly (never hits tldraw's single-frame skip) should
    // draw the same number of wires as the fixed region-only export above.
    const referenceCount = JSON.parse(await evaluate(page, `(async () => {
      const editor = window.__systemsketch.editor
      const ids = [...editor.getShapeAndDescendantIds(['${REGION}'])]
      const result = await editor.getSvgString(ids, { background: false })
      const svg = new DOMParser().parseFromString(result.svg, 'image/svg+xml')
      return svg.querySelectorAll('path').length
    })()`))
    check('BTE-6', 'region-only export draws exactly as many wires as an explicit region+descendants export',
      (svgText.match(/<path[ >]/g) ?? []).length, referenceCount)

    const pngExport = await exportRegionViaContextMenu(page, 'png')
    check('BTE-7', 'exporting only the region still produces a PNG mime type', pngExport.type, 'image/png')
    check('BTE-8', 'the PNG is content-rich, not a near-blank children-only render', pngExport.size > 5000, true)

    check('BTE-9', 'no local console errors', localConsoleErrors(page), [])
  } finally {
    app.close()
  }

  await writeFile(OUT, JSON.stringify(results, null, 2))
  const failed = results.filter((result) => !result.ok)
  process.stdout.write(`${results.length - failed.length}/${results.length} passed → ${OUT}\n`)
  process.exit(failed.length ? 1 : 0)
}

main().catch((error) => { console.error(error); process.exit(1) })
