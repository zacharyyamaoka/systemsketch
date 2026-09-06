#!/usr/bin/env node
/** Prove that SystemSketch skins, but does not replace, tldraw's range toolbar. */
import assert from 'node:assert/strict'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import {
  ROOT,
  clickElement,
  delay,
  drag,
  ensureDir,
  evaluate,
  localConsoleErrors,
  makeChecklist,
  mouse,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const SHOT = join(ROOT, 'docs', 'assets', 'rich-text-toolbar-chrome-live-2026-09-04.png')
const RESULTS = join(ROOT, 'docs', 'assets', 'rich-text-toolbar-chrome-results.json')
const FIXTURE = join(ROOT, 'sketches', 'review', 'rich-text-toolbar-chrome.systemsketch')
const TOOLBAR = '.tlui-rich-text__toolbar[data-visible="true"]'
const TOOLBAR_SURFACE = `${TOOLBAR} > .tlui-menu`
const SELECTION_SURFACE = '[data-testid="systemsketch-selection-menu"][data-visible="true"] .systemsketch-selection-menu__bar'

const { checks, pass } = makeChecklist()

async function main() {
  await ensureDir(dirname(SHOT))
  const app = await startApp({
    label: 'rich-text-toolbar-chrome',
    build: 'rich-text-toolbar-chrome-smoke',
    width: 1800,
    height: 1000,
  })
  const { page, port, filesRoot } = app

  try {
    const board = join(filesRoot, 'SystemSketch', 'rich-text-toolbar-chrome.systemsketch')
    await mkdir(dirname(board), { recursive: true })
    await copyFile(FIXTURE, board)
    await openApp(page, port, `?board=${encodeURIComponent(board)}`)
    await waitFor(page, `window.__systemsketch?.editor?.getShape('shape:range-text')`, 'the review fixture')
    await delay(500)

    // First exercise the fixture as authored: the product target and its cue
    // are connected by stock bindings, so both must move on a real drag.
    const cueBefore = JSON.parse(await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const target = editor.getShapePageBounds('shape:range-text')
      const arrow = editor.getShapePageBounds('shape:cue-step-box-arrow')
      return JSON.stringify({ targetX: target.x, arrowMaxX: arrow.maxX })
    })()`))
    const textPoint = JSON.parse(await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const bounds = editor.getShapePageBounds('shape:range-text')
      return JSON.stringify(editor.pageToScreen({ x: bounds.midX, y: bounds.midY }))
    })()`))
    await drag(page, textPoint, { x: textPoint.x + 55, y: textPoint.y })
    const cueAfter = JSON.parse(await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const target = editor.getShapePageBounds('shape:range-text')
      const arrow = editor.getShapePageBounds('shape:cue-step-box-arrow')
      return JSON.stringify({ targetX: target.x, arrowMaxX: arrow.maxX })
    })()`))
    assert.ok(cueAfter.targetX > cueBefore.targetX + 40)
    assert.ok(cueAfter.arrowMaxX > cueBefore.arrowMaxX + 40)
    pass('the cold-reopened review fixture keeps its instructional cue bound after a real target drag')
    await evaluate(page, `window.__systemsketch.editor.undo(); true`)
    await waitFor(page, `window.__systemsketch.editor.getShapePageBounds('shape:range-text').x < ${cueAfter.targetX - 40}`, 'the fixture target to return after the binding check')

    const movedTextPoint = JSON.parse(await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const bounds = editor.getShapePageBounds('shape:range-text')
      return JSON.stringify(editor.pageToScreen({ x: bounds.midX, y: bounds.midY }))
    })()`))
    for (const clickCount of [1, 2]) {
      await mouse(page, 'mousePressed', movedTextPoint.x, movedTextPoint.y, { buttons: 1, clickCount })
      await mouse(page, 'mouseReleased', movedTextPoint.x, movedTextPoint.y, { clickCount })
    }
    await waitFor(page, `document.querySelector('[data-testid="rich-text-area"]')`, 'the stock Tiptap editor')
    await waitFor(page, `window.__systemsketch.editor.getRichTextEditor()`, 'the stock rich-text transaction')
    await evaluate(page, `(() => {
      const textEditor = window.__systemsketch.editor.getRichTextEditor()
      if (!textEditor) throw new Error('missing stock rich-text editor')
      textEditor.chain().focus().setTextSelection({ from: 8, to: 24 }).run()
    })()`)
    await waitFor(page, `document.querySelector(${JSON.stringify(TOOLBAR)})`, 'the stock range toolbar')
    await waitFor(page, `document.querySelector(${JSON.stringify(TOOLBAR)})?.dataset.interactive === 'true'`, 'the range toolbar to become interactive')

    const initial = JSON.parse(await evaluate(page, `(() => {
      const toolbar = document.querySelector(${JSON.stringify(TOOLBAR_SURFACE)})
      const controls = Array.from(toolbar.querySelectorAll('[data-testid^="rich-text."]'))
      const style = getComputedStyle(toolbar)
      return JSON.stringify({
        classes: toolbar.parentElement.className,
        controls: controls.map((control) => control.dataset.testid),
        background: style.backgroundColor,
        color: style.color,
        radius: style.borderRadius,
        height: toolbar.getBoundingClientRect().height,
      })
    })()`))
    assert.match(initial.classes, /tlui-rich-text__toolbar/)
    assert.deepEqual(initial.controls, [
      'rich-text.bold',
      'rich-text.italic',
      'rich-text.code',
      'rich-text.link',
      'rich-text.bulletList',
      'rich-text.highlight',
    ])
    assert.equal(initial.background, 'rgb(30, 30, 30)')
    assert.equal(initial.color, 'rgb(255, 255, 255)')
    assert.equal(initial.radius, '13px')
    assert.equal(initial.height, 40)
    pass('the untouched stock toolbar renders all six tldraw range commands in SystemSketch dark chrome')

    await clickElement(page, '[data-testid="rich-text.bold"]')
    await waitFor(page, `document.querySelector('[data-testid="rich-text.bold"]')?.getAttribute('aria-pressed') === 'true'`, 'Bold to become active')
    const richText = JSON.parse(await evaluate(page,
      `JSON.stringify(window.__systemsketch.editor.getShape('shape:range-text').props.richText)`))
    const inline = richText.content[0].content
    assert.equal(inline.map((node) => node.text).join(''), 'Select range formatting inside this stock text box')
    assert.equal(inline[0].text, 'Select ')
    assert.equal(inline[0].marks, undefined)
    assert.equal(inline[1].text, 'range formatting')
    assert.deepEqual(inline[1].marks, [{ type: 'bold' }])
    assert.equal(inline[2].text, ' inside this stock text box')
    assert.equal(inline[2].marks, undefined)
    pass('stock Bold still changes only the selected character range')

    await clickElement(page, '[data-testid="rich-text.link"]')
    await waitFor(page, `document.querySelector('[data-testid="rich-text.link-input"]')`, 'the stock link editor')
    const linkChrome = JSON.parse(await evaluate(page, `(() => {
      const toolbar = document.querySelector(${JSON.stringify(TOOLBAR_SURFACE)})
      const input = document.querySelector('[data-testid="rich-text.link-input"]')
      return JSON.stringify({
        toolbarBackground: getComputedStyle(toolbar).backgroundColor,
        inputColor: getComputedStyle(input).color,
        inputBackground: getComputedStyle(input.parentElement).backgroundColor,
      })
    })()`))
    assert.equal(linkChrome.toolbarBackground, initial.background)
    assert.equal(linkChrome.inputColor, initial.color)
    assert.notEqual(linkChrome.inputBackground, 'rgba(0, 0, 0, 0)')
    pass('tldraw link editing remains stock and gains a legible dark input treatment')

    // Escape returns to the stock command row. Save the visible range-toolbar
    // state before leaving edit mode, then compare it with the whole-shape bar.
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' })
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' })
    await waitFor(page, `document.querySelector('[data-testid="rich-text.bold"]')`, 'the stock command row to return')
    const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(SHOT, Buffer.from(capture.data, 'base64'))

    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      editor.setEditingShape(null)
      editor.setCurrentTool('select')
      editor.select('shape:range-text')
    })()`)
    await waitFor(page, `document.querySelector(${JSON.stringify(SELECTION_SURFACE)})`, 'the whole-shape contextual menu')
    const selectionBackground = await evaluate(page,
      `getComputedStyle(document.querySelector(${JSON.stringify(SELECTION_SURFACE)})).backgroundColor`)
    assert.equal(selectionBackground, initial.background)
    pass('range and whole-shape menus share one dark contextual surface while retaining separate scopes')

    assert.deepEqual(localConsoleErrors(page), [])
    pass('the real browser journey produced zero local console errors')

    await writeFile(RESULTS, JSON.stringify(
      checks.map((label) => ({ label, ok: true })),
      null,
      2,
    ))
    process.stdout.write(`\n  ${checks.length}/${checks.length} browser checks passed\n  ${SHOT}\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`\n  FAIL  ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
