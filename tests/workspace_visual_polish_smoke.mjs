#!/usr/bin/env node
/**
 * Screenshot-backed geometry proof for the narrow workspace pathbar.
 *
 * The Open dialog has to keep its text field inside the surface at a phone
 * width. A clipped filter is not merely cosmetic: the missing right inset
 * makes the input look fused to the dialog boundary and hides its focus ring.
 */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  evaluate,
  key,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const beforeFix = process.argv.includes('--before-fix')
const evidence = join(
  ROOT,
  'docs',
  'assets',
  `workspace-pathbar-${beforeFix ? 'before' : 'after'}-320px.png`,
)
const measurementsPath = join(
  ROOT,
  'docs',
  'assets',
  `workspace-pathbar-${beforeFix ? 'before' : 'after'}-320px.json`,
)

const emptyBoard = JSON.stringify({
  systemSketch: { formatVersion: 2, application: 'SystemSketch', shapes: {}, bindings: {} },
  tldrawFileFormatVersion: 1,
  schema: { schemaVersion: 2, sequences: {} },
  records: [],
})

function roundedRect(element) {
  const rect = element.getBoundingClientRect()
  return Object.fromEntries(['left', 'right', 'top', 'bottom', 'width', 'height'].map((key) => [key, Math.round(rect[key] * 10) / 10]))
}

async function capture(page, path) {
  const shot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(path, Buffer.from(shot.data, 'base64'))
}

async function main() {
  const app = await startApp({
    label: `workspace-pathbar-${beforeFix ? 'before' : 'after'}`,
    width: 320,
    height: 720,
  })
  const { page, port, filesRoot } = app
  const board = join(filesRoot, 'SystemSketch', 'Visual polish.systemsketch')
  await mkdir(join(filesRoot, 'SystemSketch'), { recursive: true })
  await mkdir(join(ROOT, 'docs', 'assets'), { recursive: true })
  await writeFile(board, emptyBoard)

  try {
    await openApp(page, port, `?board=${encodeURIComponent(board)}`)
    await waitFor(page, 'window.__systemsketch?.editor', 'the isolated board')
    await key(page, 'o', 'KeyO', 2)
    await waitFor(page, `document.querySelector('[data-testid="workspace-dialog"]')`, 'the Open workspace dialog')
    const geometry = JSON.parse(await evaluate(page, `(() => {
      const dialog = document.querySelector('[data-testid="workspace-dialog"]')
      const pathbar = document.querySelector('.systemsketch-workspace-pathbar')
      const filter = document.querySelector('[data-testid="workspace-filter"]')
      const filterWrapper = filter.parentElement
      const folder = document.querySelector('[data-testid="workspace-new-folder"]')
      return JSON.stringify({
        viewport: { width: innerWidth, height: innerHeight },
        dialog: (${roundedRect.toString()})(dialog),
        pathbar: { ...(${roundedRect.toString()})(pathbar), clientWidth: pathbar.clientWidth, scrollWidth: pathbar.scrollWidth },
        filter: { ...(${roundedRect.toString()})(filter), computed: {
          width: getComputedStyle(filter).width,
          minWidth: getComputedStyle(filter).minWidth,
          boxSizing: getComputedStyle(filter).boxSizing,
        } },
        filterWrapper: { ...(${roundedRect.toString()})(filterWrapper), computed: {
          width: getComputedStyle(filterWrapper).width,
          minWidth: getComputedStyle(filterWrapper).minWidth,
          boxSizing: getComputedStyle(filterWrapper).boxSizing,
        } },
        folder: (${roundedRect.toString()})(folder),
      })
    })()`))
    await capture(page, evidence)
    await writeFile(measurementsPath, JSON.stringify({ beforeFix, evidence, geometry }, null, 2) + '\n')

    if (beforeFix) {
      assert.ok(
        geometry.pathbar.scrollWidth > geometry.pathbar.clientWidth || geometry.filter.right > geometry.pathbar.right,
        `expected the pre-fix pathbar to overflow, got ${JSON.stringify(geometry)}`,
      )
      console.log('Captured the narrow pathbar overflow before the fix.')
      return
    }

    assert.ok(
      geometry.pathbar.scrollWidth <= geometry.pathbar.clientWidth,
      `pathbar still scrolls horizontally: ${JSON.stringify(geometry.pathbar)}`,
    )
    assert.ok(
      geometry.filter.right <= geometry.pathbar.right - 7,
      `filter lost its visible right inset: ${JSON.stringify(geometry)}`,
    )
    assert.ok(
      geometry.filter.left >= geometry.folder.right + 6,
      `filter overlaps the folder action: ${JSON.stringify(geometry)}`,
    )
    console.log('Workspace pathbar stays contained at 320px.')
  } finally {
    app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
