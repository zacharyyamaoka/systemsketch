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

const SOURCE = join(ROOT, 'sketches', 'review', 'block-inset-background.systemsketch')
const SHOT = join(ROOT, 'docs', 'assets', 'block-inset-background-live-2026-09-05.png')
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
    const canvases = Array.from(document.querySelectorAll('.systemsketch-block-canvas'))
    const painted = canvases
      .find((element) => element.querySelector('.BlockNode-headingTitle')?.textContent === '__init__()')
    const parentPainted = canvases
      .find((element) => element.querySelector('.BlockNode-headingTitle')?.textContent === 'Class')
    const header = parentPainted?.querySelector('.NodeShape-heading')
    return JSON.stringify({
      parent: parent && { id: parent.id, mode: parent.props.memberLayout,
        background: parent.props.insetBackground, w: parent.props.w },
      children,
      painted: painted && {
        parentMode: painted.dataset.parentMemberLayout,
        radius: getComputedStyle(painted).borderRadius,
      },
      parentPainted: parentPainted && {
        insetBackground: parentPainted.dataset.insetBackground || null,
        background: getComputedStyle(parentPainted).backgroundColor,
        headerBackground: header ? getComputedStyle(header).backgroundColor : null,
      },
      childBackground: painted ? getComputedStyle(painted).backgroundColor : null,
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
		assert.equal(initial.parent.background, 'white')
    assert.deepEqual(initial.children.map(({ x, y, w }) => ({ x, y, w })), [
      { x: 12, y: 60, w: 576 },
      { x: 12, y: 332, w: 576 },
    ])
    pass('the review fixture opens as two real inset child Blocks')

    await selectParent(app.page)
    assert.equal(await evaluate(app.page,
      `document.querySelector('[data-testid="block-member-layout-inset"]')?.getAttribute('aria-pressed')`), 'true')
    assert.equal(await evaluate(app.page,
      `document.querySelector('[data-testid="block-inset-background-white"]')?.getAttribute('aria-pressed')`), 'true')
    pass('Inset starts white and exposes a compact White / Soft gray background control')

		await clickElement(app.page, '[data-testid="block-inset-background-soft-gray"]')
		await waitFor(app.page,
			`window.__systemsketch.editor.getCurrentPageShapes().find((shape) => shape.type === 'block' && shape.props.title === 'Class')?.props.insetBackground === 'soft-gray'`,
			'soft gray inset background')
		const grayInset = await facts(app.page)
		assert.equal(grayInset.parentPainted.insetBackground, 'soft-gray')
		assert.notEqual(grayInset.parentPainted.background, grayInset.childBackground)
		assert.equal(grayInset.parentPainted.headerBackground, grayInset.childBackground)
		pass('Soft gray paints only the exposed inset well; white member cards and header stay raised')

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
		assert.equal(edge.parent.background, 'soft-gray')
		assert.equal(edge.parentPainted.insetBackground, null)
    pass('Edge-to-edge ignores but remembers the inset-only background choice')

    await clickElement(app.page, '[data-testid="block-member-layout-inset"]')
    await waitFor(app.page,
      `window.__systemsketch.editor.getCurrentPageShapes().find((shape) => shape.type === 'block' && shape.props.title === 'Class')?.props.memberLayout === 'inset'`,
      'Inset policy restored')
    const inset = await facts(app.page)
    assert.deepEqual(inset.children.map(({ x, y, w }) => ({ x, y, w })), [
      { x: 12, y: 60, w: 576 },
      { x: 12, y: 332, w: 576 },
    ])
		assert.equal(inset.parentPainted.insetBackground, 'soft-gray')
    pass('Inset restores both the card gutters and the remembered soft-gray well')
		await capture(app.page)

		await clickElement(app.page, '[data-testid="block-inset-background-white"]')
		await waitFor(app.page,
			`window.__systemsketch.editor.getCurrentPageShapes().find((shape) => shape.type === 'block' && shape.props.title === 'Class')?.props.insetBackground === 'white'`,
			'white inset background')
		const whiteInset = await facts(app.page)
		assert.equal(whiteInset.parentPainted.background, whiteInset.childBackground)
		pass('White restores the quiet default without changing membership or geometry')

    await shortcut(app.page, 'z', 'KeyZ', 2)
    await waitFor(app.page,
			`window.__systemsketch.editor.getCurrentPageShapes().find((shape) => shape.type === 'block' && shape.props.title === 'Class')?.props.insetBackground === 'soft-gray'`,
      'one-step undo')
    const undone = await facts(app.page)
		assert.equal(undone.parentPainted.insetBackground, 'soft-gray')
		assert.deepEqual(undone.children.map(({ x, y, w }) => ({ x, y, w })), [
			{ x: 12, y: 60, w: 576 },
			{ x: 12, y: 332, w: 576 },
		])
    pass('one undo restores the previous background without perturbing inset geometry')

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
