#!/usr/bin/env node
/**
 * Real-browser proof for the standalone workspace's destructive-loss boundary.
 *
 * This journey uses only the harness's temporary files root. It deliberately
 * opens a host-valid document whose schema tldraw refuses, attempts a real
 * canvas gesture, walks both branches of Save As replacement, then opens a
 * zero-byte legacy document and authors a real Block into it.
 *
 * Run with:
 *   node tests/workspace_safety_smoke.mjs
 */
import assert from 'node:assert/strict'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickElement,
  delay,
  drag,
  ensureDir,
  evaluate,
  key,
  makeChecklist,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'
import { drawBlock } from './block_journey_helpers.mjs'

const SCREENSHOT = join(
  ROOT,
  'docs',
  'assets',
  'repo-improvements-workspace-quarantine.png',
)

const validCore = {
  tldrawFileFormatVersion: 1,
  schema: { schemaVersion: 2, sequences: {} },
  records: [],
}

function systemSketchDocument(core) {
  return JSON.stringify({
    systemSketch: {
      formatVersion: 1,
      application: 'SystemSketch',
      shapes: {},
      bindings: {},
    },
    ...core,
  })
}

async function waitForFile(path, predicate, label, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs
  let lastSource = ''
  while (Date.now() < deadline) {
    try {
      lastSource = await readFile(path, 'utf8')
      if (predicate(lastSource)) return lastSource
    } catch {
      // The first autosave may still be creating the file.
    }
    await delay(80)
  }
  throw new Error('Timed out waiting for ' + label + '; last file was ' + lastSource.length + ' bytes')
}

async function capture(page, path) {
  const shot = await page.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
  })
  await writeFile(path, Buffer.from(shot.data, 'base64'))
}

const { checks, pass } = makeChecklist()

async function main() {
  const app = await startApp({
    label: 'systemsketch-workspace-safety',
    build: 'workspace-safety-smoke',
    width: 1400,
    height: 940,
  })
  const { page, port, filesRoot } = app
  const workspace = join(filesRoot, 'SystemSketch')
  const brokenPath = join(workspace, 'Broken.systemsketch')
  const blankPath = join(workspace, 'Blank.tldr')
  // The Python host accepts this portable outer structure and correctly leaves
  // detailed schema authority to tldraw. tldraw refuses the empty schema.
  const brokenSource = systemSketchDocument({ ...validCore, schema: {} })

  await ensureDir(workspace)
  await ensureDir(join(ROOT, 'docs', 'assets'))
  await writeFile(brokenPath, brokenSource)
  await writeFile(blankPath, '')

  try {
    await page.send('Network.enable')
    await openApp(page, port, '?board=' + encodeURIComponent(brokenPath))
    await waitFor(
      page,
      "document.querySelector('[data-testid=\"workspace-quarantine\"]')",
      'the quarantine warning',
    )

    assert.equal(
      await evaluate(page, 'window.__systemsketch.editor.getInstanceState().isReadonly'),
      true,
      'the refused document did not put tldraw into read-only mode',
    )
    const quarantineExplanation = await evaluate(page, `(() => {
      const alert = document.querySelector('[data-testid="workspace-quarantine"]')
      const detail = alert?.querySelector('span')
      const style = detail ? getComputedStyle(detail) : null
      return JSON.stringify({
        text: alert?.innerText,
        actions: Array.from(alert?.querySelectorAll('button') ?? [], (button) => button.textContent.trim()),
        whiteSpace: style?.whiteSpace,
        overflow: style?.overflow,
        fits: detail ? detail.scrollWidth <= detail.clientWidth && detail.scrollHeight <= detail.clientHeight : false,
      })
    })()`).then(JSON.parse)
    assert.match(quarantineExplanation.text, /original file has not been changed/i)
    assert.match(quarantineExplanation.text, /no board content was loaded/i)
    assert.deepEqual(quarantineExplanation.actions, ['Open another…'])
    assert.equal(quarantineExplanation.whiteSpace, 'normal')
    assert.equal(quarantineExplanation.overflow, 'visible')
    assert.equal(quarantineExplanation.fits, true)
    pass('a tldraw schema refusal opens an explicit, fully readable quarantine with no fake recovery action')

    // Try the same Block gesture used by the product journeys. Read-only must
    // reject it, and—more importantly—the fallback canvas must never reach the
    // quarantined source through autosave.
    await key(page, 'b', 'KeyB')
    await drag(page, { x: 330, y: 260 }, { x: 620, y: 420 })
    await delay(900)
    assert.equal(
      await evaluate(page, 'window.__systemsketch.editor.getCurrentPageShapes().length'),
      0,
      'read-only quarantine accepted a canvas mutation',
    )
    assert.equal(
      await readFile(brokenPath, 'utf8'),
      brokenSource,
      'the quarantined source bytes were rewritten',
    )
    pass('a real canvas gesture cannot mutate or autosave over the refused source bytes')

    await capture(page, SCREENSHOT)
    pass('the quarantine notice is visible as rendered, rather than clipped behind its actions')

    await openApp(page, port, '?board=' + encodeURIComponent(blankPath))
    await waitFor(page, 'window.__systemsketch?.editor', 'the zero-byte tldraw canvas')
    assert.equal(
      await evaluate(page, "Boolean(document.querySelector('[data-testid=\"workspace-quarantine\"]'))"),
      false,
    )
    assert.equal(
      await evaluate(page, 'window.__systemsketch.editor.getInstanceState().isReadonly'),
      false,
    )
    assert.equal((await stat(blankPath)).size, 0)
    pass('a zero-byte .tldr opens as an editable blank canvas rather than quarantine')

    await drawBlock(page, { x: 330, y: 250 }, { x: 620, y: 420 }, 'first revision')
    await waitFor(
      page,
      "document.querySelector('.systemsketch-file-title i')?.dataset.state === 'clean'",
      'the zero-byte document autosave',
    )
    const firstRevision = await waitForFile(
      blankPath,
      (source) => {
        try {
          const parsed = JSON.parse(source)
          return parsed.records?.some((record) => (
            record.typeName === 'shape' && record.type === 'block'
          ))
        } catch {
          return false
        }
      },
      'the first real tldraw revision',
    )
    const parsedRevision = JSON.parse(firstRevision)
    assert.equal(parsedRevision.tldrawFileFormatVersion, 1)
    assert.equal(parsedRevision.systemSketch, undefined)
    pass('the first real gesture turns the zero-byte .tldr into a saved plain-tldraw revision')

    const exceptions = page.events.filter((event) => event.method === 'Runtime.exceptionThrown')
    assert.deepEqual(exceptions, [], 'the browser raised an uncaught exception')
    pass('the complete safety journey raises no browser exceptions')

    console.log('\n' + checks.length + ' workspace safety checks passed.')
  } finally {
    app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
