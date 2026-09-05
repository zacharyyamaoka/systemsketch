#!/usr/bin/env node
/** Real-browser proof that a saved tool alias searches and arms the real tool. */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  clickElement,
  evaluate,
  key,
  localConsoleErrors,
  makeChecklist,
  openApp,
  shortcut,
  startApp,
  typeSlowly,
  waitFor,
} from './browser_harness.mjs'

const SHOTS = join(ROOT, 'docs', 'assets')
const RESULTS = join(SHOTS, 'tool-aliases-smoke.json')
const FIXTURE = join(ROOT, 'sketches', 'review', 'tool-aliases.systemsketch')
const { checks, pass } = makeChecklist()

async function screenshot(page, name) {
  const { data } = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(join(SHOTS, name), Buffer.from(data, 'base64'))
}

async function main() {
  await mkdir(SHOTS, { recursive: true })
  const app = await startApp({ label: 'tool-aliases', width: 1440, height: 900, allowSourceRoot: true })
  const { page, port } = app

  try {
    await openApp(page, port, `?board=${encodeURIComponent(FIXTURE)}`)
    await waitFor(page, `window.__systemsketch?.editor && document.querySelector('[data-testid="main-menu.button"]')`, 'product canvas')
    await waitFor(page, `window.__systemsketch.editor.getShape('shape:text-tool')`, 'saved review fixture')

    const cueFollow = JSON.parse(await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const textTool = editor.getShape('shape:text-tool')
      const arrow = editor.getShape('shape:cue-step-1-arrow')
      const end = () => {
        const handle = editor.getShapeHandles(arrow)?.find((item) => item.id === 'end')
        return editor.getShapePageTransform(arrow.id).applyToPoint(handle)
      }
      const before = end()
      editor.updateShape({ id: textTool.id, type: textTool.type, x: textTool.x + 48 })
      const after = end()
      editor.updateShape({ id: textTool.id, type: textTool.type, x: textTool.x })
      return JSON.stringify({ dx: Math.round(after.x - before.x), dy: Math.round(after.y - before.y) })
    })()`))
    assert.deepEqual(cueFollow, { dx: 48, dy: 0 })
    pass('the saved review board cold-opens and its first cue remains bound to the Text target')

    await clickElement(page, '[data-testid="main-menu.button"]')
    await waitFor(page, `document.querySelector('[data-testid="main-menu.settings"]')`, 'Settings menu item')
    await clickElement(page, '[data-testid="main-menu.settings"]')
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-settings-dialog"]')`, 'Settings dialog')
    await clickElement(page, '[data-testid="systemsketch-settings-category-shortcuts"]')
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-tool-aliases-panel"]')`, 'Tool aliases settings panel')

    await clickElement(page, '[data-testid="systemsketch-tool-alias-input-text"]')
    await typeSlowly(page, '@datatype')
    await clickElement(page, '[data-testid="systemsketch-tool-alias-add-text"]')
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-tool-alias-row-text"]')?.textContent.includes('@datatype')`, 'saved Text alias')
    const saved = JSON.parse(await evaluate(page, `(() => {
      const stored = JSON.parse(localStorage.getItem('systemsketch.tool-aliases.v1'))
      const row = document.querySelector('[data-testid="systemsketch-tool-alias-row-text"]')
      return JSON.stringify({ stored, row: row?.textContent })
    })()`))
    assert.deepEqual(saved.stored, { version: 1, aliases: { text: ['@datatype'] } })
    assert.match(saved.row, /Text/)
    assert.match(saved.row, /↪\s*@datatype/)
    await screenshot(page, 'tool-aliases-settings-2026-09-05.png')
    pass('Settings saves the literal @datatype alias under the canonical Text tool')

    await key(page, 'Escape')
    await waitFor(page, `!document.querySelector('[data-testid="systemsketch-settings-dialog"]')`, 'Settings closing')
    await clickAt(page, 720, 420)
    await shortcut(page, 's', 'KeyS')
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-primitive-search"]')`, 'Asset search')
    await typeSlowly(page, '@datatype')
    await waitFor(page, `document.querySelectorAll('[data-testid="systemsketch-primitive-search"] [data-library-item]').length === 1`, 'alias result')
    const result = JSON.parse(await evaluate(page, `(() => {
      const row = document.querySelector('[data-testid="systemsketch-primitive-search-text"]')
      return JSON.stringify({ id: row?.dataset.libraryItem, text: row?.textContent })
    })()`))
    assert.deepEqual(result.id, 'text')
    assert.match(result.text, /Text/)
    assert.match(result.text, /↪\s*@datatype/)
    await screenshot(page, 'tool-aliases-search-2026-09-05.png')
    await key(page, 'Enter')
    await waitFor(page, `window.__systemsketch.editor.getCurrentToolId() === 'text'`, 'Text tool being armed')
    pass('Asset search finds @datatype, marks it as an alias, and arms the stock Text tool')

    const errors = await localConsoleErrors(page)
    assert.deepEqual(errors, [])
    await writeFile(RESULTS, JSON.stringify({ checks, saved, result }, null, 2))
  } finally {
    app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
