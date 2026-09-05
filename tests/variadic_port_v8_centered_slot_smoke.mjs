#!/usr/bin/env node
/** Real-renderer proof for the five port-centred V8 slot treatments. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  ROOT,
  delay,
  evaluate,
  makeChecklist,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const FIXTURE = join(ROOT, 'sketches', 'review', 'variadic-port-v8-centered-slot.systemsketch')
const COMPOSE = 'shape:compose'
const { checks, pass } = makeChecklist()
const requestedPrototype = process.env.VARIADIC_PROTOTYPE

// Reopen in a fresh browser for each gallery state. The renderer owns a live
// document session, so this keeps the visual proof about the URL state—not a
// stale React tree left over from a preceding review mode.
if (!requestedPrototype) {
  const script = fileURLToPath(import.meta.url)
  for (const prototype of ['center-1', 'center-2', 'center-3', 'center-4', 'center-5']) {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [script], {
        cwd: ROOT,
        env: { ...process.env, VARIADIC_PROTOTYPE: prototype },
        stdio: 'inherit',
      })
      child.once('error', reject)
      child.once('exit', (code) => code === 0 ? resolve(undefined) : reject(new Error(`${prototype} browser proof failed`)))
    })
  }
  process.exit(0)
}

const prototypes = [requestedPrototype]

async function capture(page, destination) {
  const png = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(destination, Buffer.from(png.data, 'base64'))
}

async function main() {
  const app = await startApp({
    label: 'variadic-port-v8-centered-slot',
    build: 'variadic-port-v8-centered-slot',
    allowSourceRoot: true,
    width: 1800,
    height: 1000,
  })
  try {
    const boardDirectory = join(app.filesRoot, 'SystemSketch')
    const board = join(boardDirectory, 'variadic-port-v8-centered-slot.systemsketch')
    await mkdir(boardDirectory, { recursive: true })
    await copyFile(FIXTURE, board)

    for (const prototype of prototypes) {
      await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}&variadicPrototype=${prototype}`)
      await waitFor(app.page, `document.querySelector('[data-shape-id="${COMPOSE}"]')`, `${prototype} compose Block`)
      await waitFor(app.page, 'document.querySelectorAll(\'.BlockNode-variadicBackdrop\').length === 2', `${prototype} centered group bodies`)
      await delay(250)

      const canvas = JSON.parse(await evaluate(app.page, `JSON.stringify({
        mode: document.querySelector('[data-shape-id="${COMPOSE}"] .systemsketch-block-canvas')?.dataset.variadicPrototype,
        labels: Array.from(document.querySelectorAll('[data-shape-id="${COMPOSE}"] .BlockNode-variadicLabel')).map((node) => node.textContent.trim()),
        rails: document.querySelectorAll('[data-shape-id="${COMPOSE}"] .BlockNode-variadicBracket').length,
        arrows: document.querySelectorAll('[data-shape-id="${COMPOSE}"] .BlockNode-variadicSocket').length,
        memberSlots: document.querySelectorAll('[data-shape-id="${COMPOSE}"] .BlockNode-variadicSlot').length,
        portCenterX: Array.from(document.querySelectorAll('[data-shape-id="${COMPOSE}"] .Port_variadic')).map((node) => {
          const rect = node.getBoundingClientRect()
          return rect.left + rect.width / 2
        }),
        slotCenterX: Array.from(document.querySelectorAll('[data-shape-id="${COMPOSE}"] .BlockNode-variadicBackdrop')).map((node) => {
          const rect = node.getBoundingClientRect()
          return rect.left + rect.width / 2
        }),
      })`))
      assert.equal(canvas.mode, prototype)
      assert.deepEqual(canvas.labels, ['*overlays', '**options'])
      assert.equal(canvas.rails, 0, 'centred slot treatments must not draw a rail')
      assert.equal(canvas.arrows, 0, 'centred slot treatments must not draw arrows')
      assert.equal(canvas.memberSlots, prototype === 'center-4' ? 6 : 0)
      assert.ok(canvas.portCenterX.every((center) => Math.abs(center - canvas.slotCenterX[0]) < 0.5), 'all ordinary ports share the centered slot axis')
      assert.ok(canvas.slotCenterX.every((center) => Math.abs(center - canvas.portCenterX[0]) < 0.5), 'both group bodies are centred on the port axis')
      pass(`${prototype} keeps both neutral slots geometrically centred on the ordinary port dots`)
      await capture(app.page, join(ROOT, 'docs', 'assets', `variadic-port-v8-centered-slot-${prototype}.png`))
    }
    process.stdout.write(`\n  ${checks.length}/${checks.length} browser checks passed\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  console.error(error.stack || error)
  process.exitCode = 1
})
