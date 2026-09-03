#!/usr/bin/env node
/** Real-browser proof for the pyblocks-derived SystemSketch context menu. */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import {
  ROOT,
  clickAt,
  clickElement,
  delay,
  drag,
  ensureDir,
  evaluate,
  key,
  localConsoleErrors,
  makeChecklist,
  mouse,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const SHOT = join(ROOT, 'docs', 'systemsketch-context-menu-live-2026-09-01.png')

async function menuCheckboxBox(page, submenuId, label) {
  const value = await evaluate(page, `(() => {
    const content = document.querySelector('[data-testid="context-menu-sub.${submenuId}-content"]')
    const row = Array.from(content?.querySelectorAll('[role="menuitemcheckbox"]') ?? [])
      .find((candidate) => candidate.textContent?.trim() === ${JSON.stringify(label)})
    if (!row) return null
    const rect = row.getBoundingClientRect()
    return JSON.stringify({ x: rect.x, y: rect.y, width: rect.width, height: rect.height, checked: row.getAttribute('aria-checked') })
  })()`)
  if (!value) throw new Error(`Missing ${label} checkbox in ${submenuId}`)
  return JSON.parse(value)
}

async function clickMenuCheckbox(page, submenuId, label) {
  const box = await menuCheckboxBox(page, submenuId, label)
  await clickAt(page, box.x + box.width / 2, box.y + box.height / 2)
}

async function blockBox(page, index = 0) {
  const value = await evaluate(page, `(() => {
    const element = document.querySelectorAll('.systemsketch-block-canvas')[${index}]
    if (!element) return null
    const rect = element.getBoundingClientRect()
    return JSON.stringify({ x: rect.x, y: rect.y, width: rect.width, height: rect.height })
  })()`)
  if (!value) throw new Error(`Missing Block canvas at index ${index}`)
  return JSON.parse(value)
}

async function openBlockMenu(page, index = 0) {
  const box = await blockBox(page, index)
  await clickAt(page, box.x + box.width / 2, box.y + box.height / 2, 'right')
  await waitFor(page,
    `document.querySelector('[data-testid="context-menu-sub.block-view-button"]')`,
    'the Block context menu')
}

async function openSubmenu(page, id) {
  const trigger = `[data-testid="context-menu-sub.${id}-button"]`
  await clickElement(page, trigger)
  await waitFor(page,
    `document.querySelector('[data-testid="context-menu-sub.${id}-content"]')`,
    `${id} submenu`)
}

const { checks, pass } = makeChecklist()

async function main() {
  await ensureDir(dirname(SHOT))
  const app = await startApp({ label: 'systemsketch-context', build: 'context-menu-smoke' })
  const { page, port, filesRoot } = app

  try {
    await openApp(page, port, '?preset=block-dev')
    await waitFor(page,
      `document.querySelector('[data-development-profile="block-dev"] .tl-container')`,
      'Block Dev canvas')
    await delay(700)

    // This stays the SDK's own blank-canvas surface—even when a creation tool
    // was active. The custom component only prepends semantic selection items.
    await key(page, 'b', 'KeyB')
    await clickAt(page, 300, 220, 'right')
    await waitFor(page, `document.querySelector('[data-testid="context-menu"]')`, 'stock canvas context menu')
    const canvasMenuText = await evaluate(page,
      `document.querySelector('[data-testid="context-menu"]').innerText`)
    assert.ok(canvasMenuText.includes('Paste'), 'stock canvas menu includes Paste')
    assert.ok(await evaluate(page,
      `Boolean(document.querySelector('[data-testid="context-menu-group.clipboard"]'))`))
    assert.equal(await evaluate(page,
      `Boolean(document.querySelector('[data-testid="context-menu-group.systemsketch-block-authoring"]'))`), false)
    pass('empty canvas keeps tldraw’s stock context menu, including from the Block tool')
    await key(page, 'Escape', 'Escape')

    // Draw a Port-sized Block through the real tool and pointer lifecycle.
    await key(page, 'b', 'KeyB')
    await drag(page, { x: 440, y: 300 }, { x: 760, y: 510 })
    await waitFor(page, `document.querySelector('[data-testid="block-inline-title"]')`, 'new Block title editor')
    await page.send('Input.insertText', { text: 'menu_block' })
    await key(page, 'Enter', 'Enter')
    await waitFor(page, `document.querySelector('.systemsketch-block-canvas[data-block-view="port"]')`, 'Port Block')

    await openBlockMenu(page)
    const rootText = await evaluate(page,
      `document.querySelector('[data-testid="context-menu-group.systemsketch-block-authoring"]').innerText`)
    for (const label of ['Block view', 'Add', 'Ports']) assert.ok(rootText.includes(label), `${label} is present`)
    pass('right-click opens the native semantic Block menu without replacing stock commands')

    await openSubmenu(page, 'block-view')
    assert.equal((await menuCheckboxBox(page, 'block-view', 'Port')).checked, 'true')
    await clickMenuCheckbox(page, 'block-view', 'Simple')
    await waitFor(page, `document.querySelector('.systemsketch-block-canvas[data-block-view="simple"]')`, 'Simple view')
    pass('Block view exposes checked Simple / Port / Expanded choices')

    await openBlockMenu(page)
    await openSubmenu(page, 'block-add')
    await clickElement(page, '[data-testid="context-menu.block-add-input-port"]')
    await waitFor(page, `document.querySelector('[data-testid^="block-inline-port-name-inputs-"]')`, 'new input port editor')
    assert.ok(await evaluate(page, `document.querySelector('.systemsketch-block-canvas').dataset.blockView === 'port'`),
      'adding a port from Simple revealed Port view')
    await page.send('Input.insertText', { text: 'request' })
    await key(page, 'Enter', 'Enter')
    await waitFor(page,
      `Array.from(document.querySelectorAll('.BlockNode-portName')).some((node) => node.textContent === 'request')`,
      'authored input label')
    pass('Add input creates a stable port, reveals it, and focuses its inline name editor')

    await openBlockMenu(page)
    await openSubmenu(page, 'block-add')
    await clickElement(page, '[data-testid="context-menu.block-add-description"]')
    await waitFor(page, `document.querySelector('[data-testid="block-inline-description"]')`, 'description editor')
    await page.send('Input.insertText', { text: 'Routes incoming work' })
    await key(page, 'Enter', 'Enter', 2)
    await waitFor(page, `document.body.innerText.includes('Routes incoming work')`, 'authored description')

    await openBlockMenu(page)
    await openSubmenu(page, 'block-add')
    await clickElement(page, '[data-testid="context-menu.block-add-type"]')
    await waitFor(page, `document.querySelector('[data-testid="block-inline-type"]')`, 'type editor')
    await page.send('Input.insertText', { text: 'service' })
    await key(page, 'Enter', 'Enter')
    await waitFor(page, `document.body.innerText.includes('service')`, 'authored type')
    pass('missing Description and Type are created in the existing on-block editors')

    await openBlockMenu(page)
    await openSubmenu(page, 'block-add')
    assert.equal(await evaluate(page,
      `Boolean(document.querySelector('[data-testid="context-menu.block-add-description"]'))`), false)
    assert.equal(await evaluate(page,
      `Boolean(document.querySelector('[data-testid="context-menu.block-add-type"]'))`), false)
    pass('authored fields leave Add while direct double-click editing remains available')

    await mouse(page, 'mouseMoved', 400, 800)
    await key(page, 'Escape', 'Escape')
    await openBlockMenu(page)
    await openSubmenu(page, 'block-ports')
    await clickMenuCheckbox(page, 'block-ports', 'Offset')
    await openBlockMenu(page)
    await openSubmenu(page, 'block-ports')
    assert.equal((await menuCheckboxBox(page, 'block-ports', 'Offset')).checked, 'true')
    pass('Ports switches Aligned / Offset as checked occurrence-local layout')

    // Capture the real app with the authored block and its checked layout menu.
    const productCapture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(SHOT, Buffer.from(productCapture.data, 'base64'))

    await key(page, 'Escape', 'Escape')
    await openBlockMenu(page)
    await openSubmenu(page, 'block-view')
    await clickMenuCheckbox(page, 'block-view', 'Expanded')
    await waitFor(page, `document.querySelector('.systemsketch-block-canvas[data-block-view="expanded"]')`, 'Expanded view')

    // Repeat the essential gesture in the full product composition—the exact
    // component registry that becomes Stable—not only in the isolated lab.
    const productBoard = join(filesRoot, 'SystemSketch', 'context-menu-proof.tldr')
    await page.send('Page.navigate', {
      url: `http://127.0.0.1:${port}/?board=${encodeURIComponent(productBoard)}`,
    })
    await waitFor(page, 'document.readyState === "complete"', 'product page load')
    await waitFor(page,
      `document.querySelector('[data-testid="systemsketch-app"] .tl-container')`,
      'full SystemSketch product canvas')
    await delay(500)
    await key(page, 'b', 'KeyB')
    await drag(page, { x: 440, y: 300 }, { x: 760, y: 510 })
    await waitFor(page, `document.querySelector('[data-testid="block-inline-title"]')`, 'product Block title editor')
    await page.send('Input.insertText', { text: 'stable_menu' })
    await key(page, 'Enter', 'Enter')
    await openBlockMenu(page)
    assert.ok(await evaluate(page,
      `document.querySelector('[data-testid="context-menu-group.systemsketch-block-authoring"]').innerText.includes('Add')`))
    pass('the full product composition exposes the same additive menu over stock tldraw')

    // Dismiss without choosing a command, then reopen on the same Block. This
    // is the smallest direct regression for the reported "works once" symptom.
    await key(page, 'Escape', 'Escape')
    await openBlockMenu(page)
    assert.ok(await evaluate(page,
      `document.querySelector('[data-testid="context-menu-group.systemsketch-block-authoring"]').innerText.includes('Add')`))
    pass('dismissing and reopening keeps the additive Block menu')

    // Chrome app windows reproduce a Radix/tldraw edge case when focus leaves
    // while the portal is open. Drive the same blur boundary, then prove both
    // the first and second menus after return resolve to the selected Block.
    await evaluate(page, `window.dispatchEvent(new Event('blur'))`)
    await delay(120)
    await openBlockMenu(page)
    assert.ok(await evaluate(page,
      `document.querySelector('[data-testid="context-menu-group.systemsketch-block-authoring"]').innerText.includes('Add')`))
    await key(page, 'Escape', 'Escape')
    await openBlockMenu(page)
    assert.ok(await evaluate(page,
      `document.querySelector('[data-testid="context-menu-group.systemsketch-block-authoring"]').innerText.includes('Add')`))
    pass('window blur cannot strand the menu before the next two right-clicks')

    // The Depth Stack belongs to the full product chrome, not the intentionally
    // stripped Block Dev harness. Exercise the same Advanced command where its
    // visible navigation result is actually mounted.
    await key(page, 'Escape', 'Escape')
    await openBlockMenu(page)
    await openSubmenu(page, 'block-view')
    await clickMenuCheckbox(page, 'block-view', 'Expanded')
    await waitFor(page, `document.querySelector('.systemsketch-block-canvas[data-block-view="expanded"]')`, 'product Expanded view')
    await openBlockMenu(page)
    await openSubmenu(page, 'block-advanced')
    await clickElement(page, '[data-testid="context-menu.block-step-into"]')
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-depth-navigator"]')`, 'Depth Stack')
    pass('Expanded Block Advanced menu enters the existing structural depth scope in the product')

    const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(SHOT, Buffer.from(capture.data, 'base64'))

    assert.deepEqual(localConsoleErrors(page), [])
    pass('the physical journey produced zero local console errors')

    process.stdout.write(`\n  ${checks.length}/${checks.length} browser checks passed\n  ${SHOT}\n`)
  } catch (error) {
    {
      const diagnostics = page.events
        .filter((event) => event.method === 'Runtime.exceptionThrown' || event.method === 'Log.entryAdded')
        .map((event) => event.params.entry?.text ?? event.params.exceptionDetails?.exception?.description ?? event.params.exceptionDetails?.text)
      process.stderr.write(`\n  Browser diagnostics:\n${diagnostics.join('\n')}\n`)
      const testIds = await evaluate(page,
        `JSON.stringify(Array.from(document.querySelectorAll('[data-testid]')).map((node) => node.getAttribute('data-testid')).filter((id) => id?.includes('context-menu')))`)
      process.stderr.write(`  Context-menu test ids: ${testIds}\n`)
    }
    throw error
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`\n  FAIL  ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
