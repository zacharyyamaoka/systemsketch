#!/usr/bin/env node
/**
 * Stable starts in a separate Chrome profile from Preview. This journey plants
 * the same build-keyed record the confirmed promotion writes, then proves a
 * fresh Stable profile restores it exactly once before workspace bootstraps.
 */
import assert from 'node:assert/strict'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  ensureDir,
  evaluate,
  localConsoleErrors,
  makeChecklist,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const SHOT = join(ROOT, 'docs', 'promoted-workspace-restored-live-2026-09-03.png')
const HANDOFF_FIXTURE = join(ROOT, 'sketches', 'review', 'promoted-workspace-handoff.systemsketch')
const RECEIPT = 'systemsketch.promoted-workspace.receipt.v1'
const SCALE = 'systemsketch.interface-scale.v1'
const { checks, pass } = makeChecklist()

async function writeBoard(filesRoot, name) {
  const target = join(filesRoot, 'SystemSketch', name)
  await mkdir(join(filesRoot, 'SystemSketch'), { recursive: true })
  await copyFile(HANDOFF_FIXTURE, target)
  return target
}

async function plantRecord(app, activePath) {
  const release = await (await fetch(`http://127.0.0.1:${app.apiPort}/api/release`)).json()
  const state = {
    version: 1,
    build: release.build,
    capturedAt: Date.now(),
    workspace: {
      version: 1,
      activePath,
      recents: [activePath],
      preferences: {
        [SCALE]: JSON.stringify({ version: 1, percent: 125 }),
      },
    },
  }
  await mkdir(join(app.releaseHome, 'state'), { recursive: true })
  await writeFile(join(app.releaseHome, 'state', 'promoted-workspace.json'), `${JSON.stringify(state)}\n`)
  return release.build
}

async function screenshot(page) {
  const { data } = await page.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(SHOT, Buffer.from(data, 'base64'))
}

async function restoresInFreshStableProfile() {
  const app = await startApp({ label: 'systemsketch-promoted-workspace', channel: 'stable' })
  try {
    const board = await writeBoard(app.filesRoot, 'handoff.systemsketch')
    const build = await plantRecord(app, board)
    await openApp(app.page, app.port, '')
    await waitFor(app.page, `document.title === 'handoff — SystemSketch'`, 'the handed-off board')
    await waitFor(app.page, `document.querySelector('.systemsketch-file-title i')?.dataset.state === 'clean'`, 'the restored board saving')

    const state = JSON.parse(await evaluate(app.page, `JSON.stringify({
      recents: JSON.parse(localStorage.getItem('systemsketch.recentDocuments.v1') ?? '[]'),
      receipt: localStorage.getItem(${JSON.stringify(RECEIPT)}),
      scale: localStorage.getItem(${JSON.stringify(SCALE)}),
    })`))
    assert.deepEqual(state, {
      recents: [board],
      receipt: build,
      scale: JSON.stringify({ version: 1, percent: 125 }),
    })
    pass('a fresh Stable profile opens the promoted board and restores reviewed preferences before the app starts')
    await evaluate(app.page, `(() => {
      window.__systemsketch.editor.zoomToFit({ animation: { duration: 0 } })
      return true
    })()`)
    await screenshot(app.page)

    const errors = localConsoleErrors(app.page)
    assert.deepEqual(errors, [], `console errors: ${errors.join(' | ')}`)
    pass('the fresh Stable handoff has no console errors')
  } finally {
    app.close()
  }
}

async function explicitBoardWins() {
  const app = await startApp({ label: 'systemsketch-promoted-workspace-explicit', channel: 'stable' })
  try {
    const handoff = await writeBoard(app.filesRoot, 'handoff.systemsketch')
    const chosen = await writeBoard(app.filesRoot, 'chosen.systemsketch')
    await plantRecord(app, handoff)
    await openApp(app.page, app.port, `?board=${encodeURIComponent(chosen)}`)
    await waitFor(app.page, `document.title === 'chosen — SystemSketch'`, 'the explicit board')
    const ignored = JSON.parse(await evaluate(app.page, `JSON.stringify({
      receipt: localStorage.getItem(${JSON.stringify(RECEIPT)}),
      scale: localStorage.getItem(${JSON.stringify(SCALE)}),
    })`))
    assert.deepEqual(ignored, { receipt: null, scale: null })
    pass('an explicit board URL is never replaced by the promotion handoff')
  } finally {
    app.close()
  }
}

async function main() {
  await ensureDir(join(ROOT, 'docs'))
  await restoresInFreshStableProfile()
  await explicitBoardWins()
  process.stdout.write(`\n${checks.length} checks passed\n  ${SHOT}\n`)
}

main().catch((error) => {
  process.stderr.write(`\nFAIL  ${error.message}\n`)
  process.exitCode = 1
})
