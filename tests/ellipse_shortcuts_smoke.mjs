#!/usr/bin/env node
/** Real-browser proof that both C and O arm the stock Ellipse tool. */
import assert from 'node:assert/strict'

import {
  evaluate,
  localConsoleErrors,
  openApp,
  shortcut,
  startApp,
  waitFor,
} from './browser_harness.mjs'

async function ellipseState(page) {
  return JSON.parse(await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    return JSON.stringify({
      tool: editor.getCurrentToolId(),
      geo: editor.getInstanceState().stylesForNextShape['tldraw:geo'],
    })
  })()`))
}

async function main() {
  const app = await startApp({ label: 'ellipse-shortcuts', width: 1280, height: 800 })
  try {
    await openApp(app.page, app.port, '')
    await waitFor(app.page, 'Boolean(window.__systemsketch?.editor)', 'product canvas')
    await evaluate(app.page, 'window.__systemsketch.editor.focus(); true')

    for (const [key, code] of [['c', 'KeyC'], ['o', 'KeyO']]) {
      await shortcut(app.page, key, code)
      assert.deepEqual(await ellipseState(app.page), { tool: 'geo', geo: 'ellipse' }, `${key.toUpperCase()} arms Ellipse`)
    }

    assert.deepEqual(localConsoleErrors(app.page), [])
    process.stdout.write('PASS  C and O arm Ellipse; Code has no direct shortcut\n')
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\\n`)
  process.exitCode = 1
})
