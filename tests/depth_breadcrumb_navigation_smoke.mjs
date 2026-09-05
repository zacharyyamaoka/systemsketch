#!/usr/bin/env node
/** Real-browser proof for structural breadcrumbs and session-local history. */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { ROOT, clickElement, delay, evaluate, localConsoleErrors, openApp, startApp, waitFor } from './browser_harness.mjs'

const ASSETS = join(ROOT, 'docs', 'assets')
const SHOT = join(ASSETS, 'breadcrumb-full-path-smoke-2026-09-04.png')
const REFRESH_SCREENSHOT = process.env.SYSTEMSKETCH_REFRESH_DEPTH_SCREENSHOTS === '1'
const MIDDLE_NAME = 'Scheduler for accessibility-sensitive jobs across all deployment partitions and rollback scenarios'
const PARENT_NAME = 'Execution workspace'
const CURRENT_NAME = 'Dispatch final request to the selected execution target'

async function screenshot(page, path) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(path, Buffer.from(capture.data, 'base64'))
}

async function enterSelected(page, id, expectedDepth) {
  await evaluate(page, `window.__systemsketch.editor.select('${id}'); true`)
  await waitFor(page, `document.querySelector('.block-mini-menu__step-in')`, `Step In for ${id}`)
  // Selection menus live in a transformed tldraw portal in headless Chrome;
  // dispatching the button's native click still drives its real React command.
  await evaluate(page, `document.querySelector('.block-mini-menu__step-in').click(); true`)
  await delay(180)
  process.stdout.write(`  entered ${id}: ${await evaluate(page, `JSON.stringify({ depth: document.querySelector('.systemsketch-depth-navigator--menu')?.dataset.depth, selected: window.__systemsketch.editor.getSelectedShapeIds() })`)}\n`)
  await waitFor(page,
    `document.querySelector('.systemsketch-depth-navigator--menu')?.dataset.depth === '${expectedDepth}'`,
    `depth ${expectedDepth}`)
}

async function main() {
  const app = await startApp({ label: 'systemsketch-depth-breadcrumbs', build: 'depth-breadcrumbs', width: 1500, height: 980 })
  const board = join(app.filesRoot, 'SystemSketch', 'depth-breadcrumbs.systemsketch')
  const screenshotPath = REFRESH_SCREENSHOT ? SHOT : join(app.filesRoot, 'breadcrumb-full-path.png')
  try {
    await mkdir(join(app.filesRoot, 'SystemSketch'), { recursive: true })
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, 'window.__systemsketch?.editor', 'editor')
    await evaluate(app.page, `(() => {
      const editor = window.__systemsketch.editor
      editor.createShapes([
        { id: 'shape:outer', type: 'block', x: 180, y: 120, props: { title: 'System', view: 'expanded', w: 900, h: 620 } },
        { id: 'shape:middle', type: 'block', parentId: 'shape:outer', x: 140, y: 130, props: { title: '${MIDDLE_NAME}', view: 'expanded', w: 610, h: 420 } },
        { id: 'shape:parent', type: 'block', parentId: 'shape:middle', x: 90, y: 90, props: { title: '${PARENT_NAME}', view: 'expanded', w: 430, h: 290 } },
        { id: 'shape:inner', type: 'block', parentId: 'shape:parent', x: 70, y: 70, props: { title: '${CURRENT_NAME}', view: 'expanded', w: 300, h: 180 } },
        { id: 'shape:landmark', type: 'geo', x: 1190, y: 230, props: { geo: 'rectangle', w: 220, h: 140, color: 'orange' } },
      ])
      editor.setCamera({ x: 37, y: -23, z: 1.13 }, { animation: { duration: 0 } })
      return true
    })()`)
    await enterSelected(app.page, 'shape:outer', 1)
    await delay(120)
    const outerCamera = JSON.parse(await evaluate(app.page, `JSON.stringify(window.__systemsketch.editor.getCamera())`))
    await enterSelected(app.page, 'shape:middle', 2)
    // Back arrives while the preceding visual tween is still live. History
    // must restore the settled outer target, never the tween's sampled camera.
    await clickElement(app.page, '[aria-label="Back"]')
    await waitFor(app.page, `document.querySelector('.systemsketch-depth-navigator--menu')?.dataset.depth === '1'`, 'rapid Back depth')
    await delay(300)
    const restoredOuterCamera = JSON.parse(await evaluate(app.page, `JSON.stringify(window.__systemsketch.editor.getCamera())`))
    assert.deepEqual(
      ['x', 'y', 'z'].map((key) => restoredOuterCamera[key]),
      ['x', 'y', 'z'].map((key) => outerCamera[key]),
      'rapid Back restores the exact settled outer x/y/z target',
    )
    await clickElement(app.page, '[aria-label="Forward"]')
    await waitFor(app.page, `document.querySelector('.systemsketch-depth-navigator--menu')?.dataset.depth === '2'`, 'rapid Forward depth')
    await enterSelected(app.page, 'shape:parent', 3)
    await enterSelected(app.page, 'shape:inner', 4)
    const chrome = JSON.parse(await evaluate(app.page, `JSON.stringify((() => {
      const nav = document.querySelector('.systemsketch-depth-navigator--menu')
      return {
        depth: nav?.dataset.depth,
        crumbs: Array.from(nav?.querySelectorAll('.systemsketch-depth-crumb') ?? []).map((crumb) => crumb.textContent?.trim()),
        shellWidth: Math.round(nav?.parentElement?.getBoundingClientRect().width ?? 0),
        breadcrumbWidth: Math.round(nav?.querySelector('.systemsketch-depth-breadcrumbs')?.getBoundingClientRect().width ?? 0),
        pathMenu: Boolean(nav?.querySelector('.systemsketch-depth-pill__path-menu')),
        backDisabled: nav?.querySelector('[aria-label="Back"]')?.disabled,
        up: Boolean(nav?.querySelector('.systemsketch-depth-pill__up')),
        trailingCommands: nav?.parentElement?.querySelectorAll('.systemsketch-shapes-button, .systemsketch-command-button').length,
      }
    })())`))
    assert.deepEqual({ ...chrome, shellWidth: 0, breadcrumbWidth: 0 }, { depth: '4', crumbs: ['Board', 'System', '…', PARENT_NAME, CURRENT_NAME], shellWidth: 0, breadcrumbWidth: 0, pathMenu: true, backDisabled: false, up: false, trailingCommands: 0 })
    assert.ok(chrome.shellWidth > 620, `breadcrumb shell reclaims the old 620px cap (${chrome.shellWidth}px)`)
    assert.ok(chrome.breadcrumbWidth > 500, `breadcrumb has room for the compact structural path (${chrome.breadcrumbWidth}px)`)
    if (REFRESH_SCREENSHOT) await mkdir(ASSETS, { recursive: true })
    await screenshot(app.page, screenshotPath)
    const unavailableForward = JSON.parse(await evaluate(app.page, `JSON.stringify((() => {
      const event = new KeyboardEvent('keydown', { key: 'GoForward', bubbles: true, cancelable: true })
      document.body.dispatchEvent(event)
      return { prevented: event.defaultPrevented, depth: document.querySelector('.systemsketch-depth-navigator--menu')?.dataset.depth }
    })())`))
    assert.deepEqual(unavailableForward, { prevented: false, depth: '4' })

    const browserBack = JSON.parse(await evaluate(app.page, `JSON.stringify((() => {
      const nav = document.querySelector('.systemsketch-depth-navigator--menu')
      const before = nav?.dataset.depth
      const event = new KeyboardEvent('keydown', { key: 'BrowserBack', bubbles: true, cancelable: true })
      document.body.dispatchEvent(event)
      return { before, backPrevented: event.defaultPrevented }
    })())`))
    assert.deepEqual(browserBack, { before: '4', backPrevented: true })
    await waitFor(app.page, `document.querySelector('.systemsketch-depth-navigator--menu')?.dataset.depth === '3'`, 'BrowserBack depth')
    await delay(20)
    const mouseBackPrevented = await evaluate(app.page, `(() => {
      const event = new PointerEvent('pointerdown', { button: 3, bubbles: true, cancelable: true })
      document.body.dispatchEvent(event)
      return event.defaultPrevented
    })()`)
    assert.equal(mouseBackPrevented, true, 'Back mouse button is captured only when depth history can move')
    await waitFor(app.page, `document.querySelector('.systemsketch-depth-navigator--menu')?.dataset.depth === '2'`, 'mouse Back depth')
    await delay(20)
    const browserForwardPrevented = await evaluate(app.page, `(() => {
      const event = new KeyboardEvent('keydown', { key: 'BrowserForward', bubbles: true, cancelable: true })
      document.body.dispatchEvent(event)
      return event.defaultPrevented
    })()`)
    assert.equal(browserForwardPrevented, true, 'BrowserForward is captured only when depth history can move')
    await waitFor(app.page, `document.querySelector('.systemsketch-depth-navigator--menu')?.dataset.depth === '3'`, 'BrowserForward depth')
    await delay(20)
    const mouseForwardPrevented = await evaluate(app.page, `(() => {
      const event = new PointerEvent('pointerdown', { button: 4, bubbles: true, cancelable: true })
      document.body.dispatchEvent(event)
      return event.defaultPrevented
    })()`)
    assert.equal(mouseForwardPrevented, true, 'Forward mouse button is captured only when depth history can move')
    await waitFor(app.page, `document.querySelector('.systemsketch-depth-navigator--menu')?.dataset.depth === '4'`, 'mouse Forward depth')
    const editableInput = JSON.parse(await evaluate(app.page, `JSON.stringify((() => {
      const input = document.createElement('input')
      document.body.append(input)
      const event = new KeyboardEvent('keydown', { key: 'BrowserBack', bubbles: true, cancelable: true })
      input.dispatchEvent(event)
      input.remove()
      return { prevented: event.defaultPrevented, depth: document.querySelector('.systemsketch-depth-navigator--menu')?.dataset.depth }
    })())`))
    assert.deepEqual(editableInput, { prevented: false, depth: '4' })

    await clickElement(app.page, '[aria-label="Back"]')
    await waitFor(app.page, `document.querySelector('.systemsketch-depth-navigator--menu')?.dataset.depth === '3'`, 'Back depth')
    await clickElement(app.page, '[aria-label="Forward"]')
    await waitFor(app.page, `document.querySelector('.systemsketch-depth-navigator--menu')?.dataset.depth === '4'`, 'Forward depth')
    await clickElement(app.page, '.systemsketch-depth-crumb[title="Execution workspace"]')
    await waitFor(app.page, `document.querySelector('.systemsketch-depth-navigator--menu')?.dataset.depth === '3'`, 'structural parent breadcrumb jump')
    await clickElement(app.page, '.systemsketch-depth-pill__trigger')
    await waitFor(app.page, `document.querySelector('#systemsketch-depth-stack')`, 'path popover')
    const popover = await evaluate(app.page, `document.querySelector('#systemsketch-depth-stack')?.textContent?.replace(/\\s+/g, ' ').trim()`)
    assert.ok(popover.includes('Board') && popover.includes('System') && popover.includes(MIDDLE_NAME) && popover.includes(PARENT_NAME))
    const ordinaryPathSemantics = JSON.parse(await evaluate(app.page, `JSON.stringify((() => {
      const trigger = document.querySelector('.systemsketch-depth-pill__trigger')
      const popover = document.querySelector('#systemsketch-depth-stack')
      return {
        hasMenuRole: popover?.getAttribute('role'),
        hasMenuItems: popover?.querySelectorAll('[role="menuitem"]').length,
        triggerHasPopup: trigger?.getAttribute('aria-haspopup'),
        listTag: popover?.querySelector('.systemsketch-depth-popover__path')?.tagName,
        listName: popover?.querySelector('.systemsketch-depth-popover__path')?.getAttribute('aria-label'),
        rows: Array.from(popover?.querySelectorAll('.systemsketch-depth-popover__path > li') ?? []).map((row) => ({
          tag: row.tagName,
          name: row.getAttribute('aria-label'),
          current: row.querySelector('[aria-current]')?.getAttribute('aria-current') ?? null,
          button: row.querySelector('button')?.getAttribute('aria-label') ?? null,
        })),
      }
    })())`))
    assert.deepEqual(ordinaryPathSemantics, {
      hasMenuRole: null,
      hasMenuItems: 0,
      triggerHasPopup: null,
      listTag: 'OL',
      listName: 'Structural path levels',
      rows: [
        { tag: 'LI', name: 'Board root', current: null, button: 'Return to Board root' },
        { tag: 'LI', name: 'System, ancestor', current: null, button: 'Jump to System' },
        { tag: 'LI', name: `${MIDDLE_NAME}, ancestor`, current: null, button: `Jump to ${MIDDLE_NAME}` },
        { tag: 'LI', name: `${PARENT_NAME}, current scope`, current: 'page', button: null },
      ],
    })
    const rootButtonFocused = await evaluate(app.page, `(() => {
      const button = document.querySelector('.systemsketch-depth-popover__path > li button')
      button?.focus()
      return document.activeElement === button
    })()`)
    assert.equal(rootButtonFocused, true, 'ordinary root button remains focusable')
    await evaluate(app.page, `(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      return true
    })()`)
    await waitFor(app.page, `!document.querySelector('#systemsketch-depth-stack')`, 'Escape closes ordinary path disclosure')
    // Screenshots are proof artifacts only when deliberately refreshed. Normal
    // CI runs keep the working tree clean and write into the disposable lab.
    assert.deepEqual(localConsoleErrors(app.page), [])
    process.stdout.write(`PASS breadcrumbs/history real-browser journey\n${screenshotPath}\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => { console.error(error.stack ?? error); process.exitCode = 1 })
