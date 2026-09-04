#!/usr/bin/env node
/** Real-browser proof for structural breadcrumbs and session-local history. */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { ROOT, clickElement, delay, evaluate, localConsoleErrors, openApp, startApp, waitFor } from './browser_harness.mjs'

const ASSETS = join(ROOT, 'docs', 'assets')
const SHOT = join(ASSETS, 'depth-breadcrumb-navigation-2026-09-04.png')
const REFRESH_SCREENSHOT = process.env.SYSTEMSKETCH_REFRESH_DEPTH_SCREENSHOTS === '1'

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
  const screenshotPath = REFRESH_SCREENSHOT ? SHOT : join(app.filesRoot, 'depth-breadcrumb-navigation.png')
  try {
    await mkdir(join(app.filesRoot, 'SystemSketch'), { recursive: true })
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, 'window.__systemsketch?.editor', 'editor')
    await evaluate(app.page, `(() => {
      const editor = window.__systemsketch.editor
      editor.createShapes([
        { id: 'shape:outer', type: 'block', x: 180, y: 120, props: { title: 'System', view: 'expanded', w: 900, h: 620 } },
        { id: 'shape:middle', type: 'block', parentId: 'shape:outer', x: 140, y: 130, props: { title: 'Scheduler', view: 'expanded', w: 610, h: 420 } },
        { id: 'shape:inner', type: 'block', parentId: 'shape:middle', x: 90, y: 90, props: { title: 'Dispatch', view: 'expanded', w: 360, h: 230 } },
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
    await enterSelected(app.page, 'shape:inner', 3)
    const chrome = JSON.parse(await evaluate(app.page, `JSON.stringify((() => {
      const nav = document.querySelector('.systemsketch-depth-navigator--menu')
      return {
        depth: nav?.dataset.depth,
        root: nav?.querySelector('.systemsketch-depth-crumb')?.textContent?.trim(),
        current: nav?.querySelector('.systemsketch-depth-crumb.is-current')?.textContent?.trim(),
        pathMenu: Boolean(nav?.querySelector('.systemsketch-depth-pill__path-menu')),
        backDisabled: nav?.querySelector('[aria-label="Back"]')?.disabled,
      }
    })())`))
    assert.deepEqual(chrome, { depth: '3', root: 'Board', current: 'Dispatch', pathMenu: true, backDisabled: false })

    await clickElement(app.page, '[aria-label="Back"]')
    await waitFor(app.page, `document.querySelector('.systemsketch-depth-navigator--menu')?.dataset.depth === '2'`, 'Back depth')
    await clickElement(app.page, '[aria-label="Forward"]')
    await waitFor(app.page, `document.querySelector('.systemsketch-depth-navigator--menu')?.dataset.depth === '3'`, 'Forward depth')
    await clickElement(app.page, '.systemsketch-depth-pill__up')
    await waitFor(app.page, `document.querySelector('.systemsketch-depth-navigator--menu')?.dataset.depth === '2'`, 'structural Up depth')
    await clickElement(app.page, '.systemsketch-depth-pill__trigger')
    await waitFor(app.page, `document.querySelector('#systemsketch-depth-stack')`, 'path popover')
    const popover = await evaluate(app.page, `document.querySelector('#systemsketch-depth-stack')?.textContent?.replace(/\\s+/g, ' ').trim()`)
    assert.ok(popover.includes('Board') && popover.includes('System') && popover.includes('Scheduler'))
    const ordinaryPathSemantics = JSON.parse(await evaluate(app.page, `JSON.stringify((() => {
      const trigger = document.querySelector('.systemsketch-depth-pill__trigger')
      const popover = document.querySelector('#systemsketch-depth-stack')
      return {
        hasMenuRole: popover?.getAttribute('role'),
        hasMenuItems: popover?.querySelectorAll('[role="menuitem"]').length,
        listRows: popover?.querySelectorAll('[role="listitem"]').length,
        triggerHasPopup: trigger?.getAttribute('aria-haspopup'),
      }
    })())`))
    assert.deepEqual(ordinaryPathSemantics, { hasMenuRole: null, hasMenuItems: 0, listRows: 1, triggerHasPopup: null })
    await evaluate(app.page, `(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      return true
    })()`)
    await waitFor(app.page, `!document.querySelector('#systemsketch-depth-stack')`, 'Escape closes ordinary path disclosure')
    // Screenshots are proof artifacts only when deliberately refreshed. Normal
    // CI runs keep the working tree clean and write into the disposable lab.
    if (REFRESH_SCREENSHOT) await mkdir(ASSETS, { recursive: true })
    await screenshot(app.page, screenshotPath)
    assert.deepEqual(localConsoleErrors(app.page), [])
    process.stdout.write(`PASS breadcrumbs/history real-browser journey\n${screenshotPath}\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => { console.error(error.stack ?? error); process.exitCode = 1 })
