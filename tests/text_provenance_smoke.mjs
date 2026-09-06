#!/usr/bin/env node
/**
 * Real-browser proof that typeface follows the provenance of the string, not
 * merely the shape that happens to display it. The saved review board is copied
 * into a disposable workspace so this journey never rewrites the human fixture.
 */
import assert from 'node:assert/strict'
import { copyFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  delay,
  evaluate,
  key,
  localConsoleErrors,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const FIXTURE = join(ROOT, 'sketches', 'review', 'text-provenance-origin.systemsketch')

async function pagePoint(page, x, y) {
  return JSON.parse(await evaluate(page,
    `JSON.stringify(window.__systemsketch.editor.pageToScreen({ x: ${x}, y: ${y} }))`))
}

async function main() {
  const app = await startApp({ label: 'text-provenance', build: 'text-provenance-smoke', width: 1680, height: 920 })
  const { page, port, filesRoot } = app
  try {
    const boardDirectory = join(filesRoot, 'SystemSketch')
    const board = join(boardDirectory, 'text-provenance.systemsketch')
    await mkdir(boardDirectory, { recursive: true })
    await copyFile(FIXTURE, board)
    await openApp(page, port, `?board=${encodeURIComponent(board)}`)
    await waitFor(page, `window.__systemsketch?.editor`, 'the real SystemSketch editor')
    await waitFor(page, `window.__systemsketch.editor.getShape('shape:mutator')`, 'the provenance review board')
    await delay(500)

    const painted = JSON.parse(await evaluate(page, `JSON.stringify((() => {
      const style = (selector) => {
        const element = document.querySelector(selector)
        return element ? getComputedStyle(element).fontFamily : null
      }
      const pillFont = (label) => Array.from(document.querySelectorAll('[data-testid="connection-delay-pill"] text'))
        .find((element) => element.textContent === label)?.getAttribute('font-family') ?? null
      return {
        title: style('[data-shape-id="shape:mutator"] .BlockNode-headingTitle'),
        portName: style('[data-shape-id="shape:mutator"] .BlockNode-portName'),
        mut: pillFont('mut'),
        delay: pillFont('z⁻¹'),
        boardTextFont: window.__systemsketch.editor.getShape('shape:board-note')?.props.font,
      }
    })())`))

    assert.match(painted.title ?? '', /mono/i, 'a Block title is a source-shaped technical token')
    assert.match(painted.portName ?? '', /mono/i, 'a port binding is a source-shaped technical token')
    assert.match(painted.mut ?? '', /Inter|sans-serif/i, '`mut` is SystemSketch connection grammar')
    assert.match(painted.delay ?? '', /Inter|sans-serif/i, '`z⁻¹` is SystemSketch connection grammar')
    assert.equal(painted.boardTextFont, 'draw', 'loose authored board text retains the sketch face')

    // Drive the board-authored text once: editing its content must not turn the
    // freeform whiteboard mark into a source projection or a UI caption.
    const note = await pagePoint(page, 780, 136)
    await clickAt(page, note.x, note.y)
    await clickAt(page, note.x, note.y)
    await waitFor(page,
      `window.__systemsketch.editor.getEditingShapeId() === 'shape:board-note'`,
      'the loose scribbled note to enter its stock text editor')
    await key(page, 'Escape', 'Escape')
    await waitFor(page,
      `window.__systemsketch.editor.getEditingShapeId() === null`,
      'Escape to leave the board text editor')
    assert.equal(await evaluate(page,
      `window.__systemsketch.editor.getShape('shape:board-note')?.props.font`), 'draw',
    'editing keeps the authored whiteboard note scribbled')

    assert.deepEqual(localConsoleErrors(page), [], 'the journey emits no browser errors')
    process.stdout.write('PASS typography provenance real-browser journey\n')
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
