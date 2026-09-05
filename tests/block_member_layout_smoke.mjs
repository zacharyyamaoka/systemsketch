#!/usr/bin/env node
/** Real-browser proof for the Expanded Block's Inset / Edge-to-edge member command. */
import assert from 'node:assert/strict'
import { copyFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickElement,
  delay,
  ensureDir,
  evaluate,
  localConsoleErrors,
  makeChecklist,
  openApp,
  shortcut,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const SOURCE = join(ROOT, 'sketches', 'review', 'block-member-layout.systemsketch')
const SHOT = join(ROOT, 'docs', 'assets', 'block-member-layout-live-2026-09-05.png')
const { checks, pass } = makeChecklist()

async function facts(page) {
  return JSON.parse(await evaluate(page, `(() => {
    const editor = window.__systemsketch?.editor
    if (!editor) return '{}'
    const blocks = editor.getCurrentPageShapes().filter((shape) => shape.type === 'block')
    const parent = blocks.find((shape) => shape.props.title === 'Class')
    const children = blocks.filter((shape) => shape.parentId === parent?.id)
      .sort((a, b) => a.y - b.y)
      .map((shape) => ({ id: shape.id, parentId: shape.parentId, x: shape.x, y: shape.y,
        w: shape.props.w, h: shape.props.h }))
    const painted = Array.from(document.querySelectorAll('.systemsketch-block-canvas'))
      .find((element) => element.querySelector('.BlockNode-headingTitle')?.textContent === '__init__()')
    return JSON.stringify({
      parent: parent && { id: parent.id, mode: parent.props.memberLayout, w: parent.props.w },
      children,
      painted: painted && {
        parentMode: painted.dataset.parentMemberLayout,
        radius: getComputedStyle(painted).borderRadius,
      },
    })
  })()`))
}

async function selectParent(page) {
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const parent = editor.getCurrentPageShapes().find((shape) => shape.type === 'block' && shape.props.title === 'Class')
    editor.select(parent.id)
    return parent.id
  })()`)
  await waitFor(page, `document.querySelector('[data-testid="block-member-layout-control"]')`, 'Member layout inspector control')
}

async function capture(page) {
  await ensureDir(join(ROOT, 'docs', 'assets'))
  const shot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(SHOT, Buffer.from(shot.data, 'base64'))
}

async function main() {
  const app = await startApp({
    label: 'block-member-layout',
    build: 'block-member-layout-smoke',
    width: 1680,
    height: 980,
  })

  try {
    const board = join(app.filesRoot, 'SystemSketch', 'Block member layout.systemsketch')
    await ensureDir(join(app.filesRoot, 'SystemSketch'))
    await copyFile(SOURCE, board)
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, `window.__systemsketch?.editor?.getCurrentPageShapes()
      .filter((shape) => shape.type === 'block').length === 3`, 'fixture Blocks')
    await delay(700)

    const initial = await facts(app.page)
    assert.equal(initial.parent.mode, 'inset')
    assert.deepEqual(initial.children.map(({ x, y, w }) => ({ x, y, w })), [
      { x: 12, y: 60, w: 576 },
      { x: 12, y: 332, w: 576 },
    ])
    pass('the review fixture opens as two real inset child Blocks')

    await selectParent(app.page)
    assert.equal(await evaluate(app.page,
      `document.querySelector('[data-testid="block-member-layout-inset"]')?.getAttribute('aria-pressed')`), 'true')
    pass('the selected parent exposes one two-value Member layout control with Inset active')

    await clickElement(app.page, '[data-testid="block-member-layout-edge-to-edge"]')
    await waitFor(app.page,
      `window.__systemsketch.editor.getCurrentPageShapes().find((shape) => shape.type === 'block' && shape.props.title === 'Class')?.props.memberLayout === 'edge-to-edge'`,
      'Edge-to-edge policy')
    await delay(260)
    const edge = await facts(app.page)
    assert.deepEqual(edge.children.map(({ x, y, w }) => ({ x, y, w })), [
      { x: 0, y: 48, w: 600 },
      { x: 0, y: 308, w: 600 },
    ])
    assert.deepEqual(edge.children.map((child) => child.parentId), [edge.parent.id, edge.parent.id])
    assert.deepEqual(edge.painted, { parentMode: 'edge-to-edge', radius: '0px' })
    pass('Edge-to-edge atomically joins geometry and chrome while retaining stock parent membership')
    await capture(app.page)

    await clickElement(app.page, '[data-testid="block-member-layout-inset"]')
    await waitFor(app.page,
      `window.__systemsketch.editor.getCurrentPageShapes().find((shape) => shape.type === 'block' && shape.props.title === 'Class')?.props.memberLayout === 'inset'`,
      'Inset policy restored')
    const inset = await facts(app.page)
    assert.deepEqual(inset.children.map(({ x, y, w }) => ({ x, y, w })), [
      { x: 12, y: 60, w: 576 },
      { x: 12, y: 332, w: 576 },
    ])
    pass('Inset restores the same children to twelve-pixel gutters and a twelve-pixel gap')

    await shortcut(app.page, 'z', 'KeyZ', 2)
    await waitFor(app.page,
      `window.__systemsketch.editor.getCurrentPageShapes().find((shape) => shape.type === 'block' && shape.props.title === 'Class')?.props.memberLayout === 'edge-to-edge'`,
      'one-step undo')
    const undone = await facts(app.page)
    assert.deepEqual(undone.children.map(({ x, y, w }) => ({ x, y, w })), [
      { x: 0, y: 48, w: 600 },
      { x: 0, y: 308, w: 600 },
    ])
    pass('one undo restores the entire previous parent policy and both member placements')

    assert.deepEqual(await localConsoleErrors(app.page), [])
    pass('the real interaction completes without browser console errors')

    process.stdout.write(`\n${checks.length}/${checks.length} member-layout checks passed\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
