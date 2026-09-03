#!/usr/bin/env node
/**
 * Prove an IDE owns the latest edit before its webview can disappear.
 *
 * The bridge is captured by a CDP binding that survives page navigation. The
 * journey closes once inside the 80 ms serialization debounce, then closes a
 * second time while the first full-document write is deliberately left in
 * flight. Both times the next pane recovers through stock loadSnapshot().
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createTLSchema, parseTldrawJsonFile } from 'tldraw'

import {
  ROOT,
  clickElement,
  delay,
  evaluate,
  localConsoleErrors,
  mouse,
  openApp,
  shortcut,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const SCREENSHOT = join(ROOT, 'docs', 'assets', 'repo-improvements-embed-recovery.png')

function capturedMessages(page, after = 0) {
  return page.events.slice(after)
    .filter((event) => event.method === 'Runtime.bindingCalled'
      && event.params.name === 'captureSystemSketchEmbedMessage')
    .map((event) => JSON.parse(event.params.payload))
}

async function waitForMessage(page, after, predicate, label, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const match = capturedMessages(page, after).find(predicate)
    if (match) return match
    await delay(25)
  }
  throw new Error(`Timed out waiting for ${label}`)
}

function snapshotShapeCount(snapshot) {
  return Object.values(snapshot?.document?.store ?? {})
    .filter((record) => record?.typeName === 'shape').length
}

async function openEmbedded(page, port, { session, recovery }) {
  const messageStart = page.events.length
  await openApp(page, port, '')
  await waitForMessage(page, messageStart, (message) => message.type === 'ready', 'embed ready')
  await evaluate(page, `window.dispatchEvent(new MessageEvent('message', { data: ${JSON.stringify({
    type: 'open',
    path: '/tmp/Lifecycle.tldr',
    text: '',
    version: 1,
    readOnly: false,
    session,
    ...(recovery ? { recovery: { snapshot: recovery } } : {}),
  })} }))`)
  await waitFor(page, `document.querySelector('[data-testid="systemsketch-embedded-app"]')`, 'embedded canvas')
  await waitFor(page, `document.querySelector('[data-testid="systemsketch-tool-shape"]')`, 'embedded toolbar')
}

async function visibleShapeCount(page) {
  return evaluate(page, `new Set(Array.from(document.querySelectorAll('[data-shape-id]'),
    (node) => node.getAttribute('data-shape-id')).filter(Boolean)).size`)
}

async function drawRectangleAndUnload(page, expectedBefore) {
  assert.equal(await visibleShapeCount(page), expectedBefore)
  await clickElement(page, '[data-testid="systemsketch-tool-shape"]')
  await waitFor(
    page,
    `document.querySelector('[data-testid="systemsketch-tool-shape"]')?.getAttribute('aria-pressed') === 'true'`,
    'Rectangle tool activation',
  )
  const preferredX = expectedBefore === 0 ? .38 : .62
  const point = JSON.parse(await evaluate(page, `(() => {
    const rect = document.querySelector('.tl-container').getBoundingClientRect()
    for (const fx of [${preferredX}, .5, .72]) for (const fy of [.42, .58, .7]) {
      const x = rect.x + rect.width * fx
      const y = rect.y + rect.height * fy
      const hit = document.elementFromPoint(x, y)
      if (hit?.closest('.tl-canvas') && !hit.closest('[data-systemsketch-chrome]')) {
        return JSON.stringify({ x, y })
      }
    }
    throw new Error('No uncovered canvas point')
  })()`))
  const eventStart = page.events.length
  await mouse(page, 'mouseMoved', point.x, point.y)
  await mouse(page, 'mousePressed', point.x, point.y, { buttons: 1 })
  await mouse(page, 'mouseMoved', point.x + 120, point.y + 78, { buttons: 1 })
  await mouse(page, 'mouseReleased', point.x + 120, point.y + 78)
  // Navigate in the next CDP command: the 80 ms serialization timer has not
  // earned a quiet period, so pagehide is the only durability boundary.
  await page.send('Page.navigate', { url: 'about:blank' })
  await delay(180)
  const checkpoint = await waitForMessage(
    page,
    eventStart,
    (message) => message.type === 'checkpoint'
      && snapshotShapeCount(message.snapshot) === expectedBefore + 1,
    `the ${expectedBefore + 1}-shape teardown checkpoint`,
  )
  return checkpoint
}

async function main() {
  const app = await startApp({ label: 'systemsketch-embed-lifecycle', build: 'embed-lifecycle' })
  const { page, port } = app
  try {
    await page.send('Runtime.addBinding', { name: 'captureSystemSketchEmbedMessage' })
    await page.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `window.__systemSketchEmbedHost = {
        host: 'vscode',
        post: (message) => window.captureSystemSketchEmbedMessage(JSON.stringify(message)),
      }`,
    })

    await openEmbedded(page, port, { session: 'lifecycle-a' })
    const first = await drawRectangleAndUnload(page, 0)
    assert.equal(first.session, 'lifecycle-a')
    process.stdout.write('  PASS  close inside the serialization debounce exports a stock snapshot checkpoint\n')

    const secondOpenStart = page.events.length
    await openEmbedded(page, port, {
      session: 'lifecycle-b',
      recovery: JSON.parse(JSON.stringify(first.snapshot)),
    })
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-embed-recovery"]')`, 'recovery status')
    await waitFor(page, `new Set(Array.from(document.querySelectorAll('[data-shape-id]'),
      (node) => node.getAttribute('data-shape-id')).filter(Boolean)).size === 1`, 'first recovered shape')
    const firstChange = await waitForMessage(
      page,
      secondOpenStart,
      (message) => message.type === 'change' && message.checkpointRevision > 0,
      'the first recovered full-document write',
    )
    assert.equal(firstChange.session, 'lifecycle-b')
    // Deliberately do not answer with `accepted`: the webview now has one host
    // write in flight when the next edit and close occur.
    const second = await drawRectangleAndUnload(page, 1)
    assert.ok(second.revision > firstChange.checkpointRevision)
    process.stdout.write('  PASS  a newer checkpoint crosses to the host while an earlier write is in flight\n')

    const finalOpenStart = page.events.length
    await openEmbedded(page, port, {
      session: 'lifecycle-c',
      recovery: JSON.parse(JSON.stringify(second.snapshot)),
    })
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-embed-recovery"]')`, 'second recovery status')
    await waitFor(page, `new Set(Array.from(document.querySelectorAll('[data-shape-id]'),
      (node) => node.getAttribute('data-shape-id')).filter(Boolean)).size === 2`, 'both recovered shapes')
    process.stdout.write('  PASS  stock loadSnapshot restores both edits in the next pane\n')

    const finalChange = await waitForMessage(
      page,
      finalOpenStart,
      (message) => message.type === 'change' && message.checkpointRevision > 0,
      'the recovered official tldraw serialization',
    )
    const parsed = parseTldrawJsonFile({ json: finalChange.text, schema: createTLSchema() })
    assert.equal(parsed.ok, true)
    assert.equal(JSON.parse(finalChange.text).records.filter((record) => record.typeName === 'shape').length, 2)
    process.stdout.write('  PASS  the recovered board returns through tldraw’s official stock-readable serializer\n')

    await shortcut(page, 'a', 'KeyA', 2)
    await waitFor(page,
      `document.querySelector('[data-testid="systemsketch-selection-menu"]')?.dataset.visible === 'true'`,
      'both recovered shapes selected')
    assert.equal(await evaluate(page, `document.body.textContent.includes('2 selected')`), false,
      'the selection menu does not narrate the selected count')
    const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(SCREENSHOT, Buffer.from(capture.data, 'base64'))
    assert.deepEqual(localConsoleErrors(page), [])
    process.stdout.write('  PASS  the recovery journey emits no local browser errors\n')
  } finally {
    app.close()
  }

  process.stdout.write('\n5 embed-lifecycle checks passed.\n')
}

main().then(
  () => process.exit(0),
  (error) => {
    process.stderr.write(`\nFAIL  ${error.stack ?? error.message}\n`)
    process.exit(1)
  },
)
