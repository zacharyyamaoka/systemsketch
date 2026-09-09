#!/usr/bin/env node
/**
 * Real-browser proof for Block members: the inspector's Members section, the
 * authored order, the live stack, the spacing presets and numbers, and the
 * Free / Stack toggle — driven on the review fixture with real pointer events.
 */
import assert from 'node:assert/strict'
import { copyFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickElement,
  delay,
  drag,
  elementBox,
  ensureDir,
  evaluate,
  key,
  localConsoleErrors,
  makeChecklist,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const SOURCE = join(ROOT, 'sketches', 'review', 'block-members.systemsketch')
const MEDIA = join(ROOT, 'reports', 'media', 'block-members-proposal')
const { checks, pass } = makeChecklist()

const HEADER = 48

async function facts(page) {
  return JSON.parse(await evaluate(page, `(() => {
    const editor = window.__systemsketch?.editor
    if (!editor) return '{}'
    const blocks = editor.getCurrentPageShapes().filter((shape) => shape.type === 'block')
    const parent = blocks.find((shape) => shape.props.title === 'Class')
    const members = editor.getSortedChildIdsForParent(parent.id).map((id) => editor.getShape(id))
      .filter((shape) => shape.type === 'block')
      .map((shape) => ({ id: shape.id, title: shape.props.title, x: shape.x, y: shape.y,
        w: shape.props.w, h: shape.props.h, index: shape.index, expanded: shape.props.views.expanded }))
    const rows = Array.from(document.querySelectorAll('[data-testid^="inspector-member-row-"]'))
      .map((row) => row.getAttribute('data-testid').slice('inspector-member-row-'.length))
    const pressed = (id) => document.querySelector('[data-testid="' + id + '"]')?.getAttribute('aria-pressed')
    const painted = Array.from(document.querySelectorAll('.systemsketch-block-canvas'))
      .find((element) => element.querySelector('.BlockNode-headingTitle')?.textContent === '__call__()')
    return JSON.stringify({
      parent: { id: parent.id, bodyLayout: parent.props.bodyLayout ?? 'free', memberLayout: parent.props.memberLayout,
        gap: parent.props.memberGap ?? null, gutter: parent.props.memberGutter ?? null,
        width: parent.props.memberWidth ?? 'fill', w: parent.props.w, h: parent.props.h },
      members,
      rows,
      pressed: {
        stack: pressed('block-body-layout-stack'), free: pressed('block-body-layout-free'),
        inset: pressed('block-member-layout-inset'), edge: pressed('block-member-layout-edge-to-edge'),
        fill: pressed('block-member-width-fill'), own: pressed('block-member-width-own'),
      },
      callRadius: painted ? getComputedStyle(painted).borderRadius : null,
    })
  })()`))
}

async function selectParent(page) {
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    editor.selectNone()
    const parent = editor.getCurrentPageShapes().find((shape) => shape.type === 'block' && shape.props.title === 'Class')
    editor.select(parent.id)
  })()`)
  await waitFor(page, `document.querySelector('[data-inspector-section="Members"]')`, 'the Members section')
}

async function screenPoint(page, shapeId, localX, localY) {
  return JSON.parse(await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const shape = editor.getShape(${JSON.stringify(shapeId)})
    const page = editor.getShapePageTransform(shape).applyToPoint({ x: ${localX}, y: ${localY} })
    const screen = editor.pageToScreen(page)
    return JSON.stringify({ x: screen.x, y: screen.y })
  })()`))
}

async function capture(page, name) {
  await ensureDir(MEDIA)
  const shot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(join(MEDIA, `${name}.png`), Buffer.from(shot.data, 'base64'))
}

function ys(members) { return members.map((member) => Math.round(member.y)) }

async function main() {
  const app = await startApp({ label: 'block-members', build: 'block-members-smoke', width: 1680, height: 980 })
  try {
    const board = join(app.filesRoot, 'SystemSketch', 'Block members.systemsketch')
    await ensureDir(join(app.filesRoot, 'SystemSketch'))
    await copyFile(SOURCE, board)
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, `window.__systemsketch?.editor?.getCurrentPageShapes()
      .filter((shape) => shape.type === 'block').length === 3`, 'fixture Blocks')
    await delay(800)

    // 1 · The fixture opens already stacked; the parent hugs the two members.
    const opened = await facts(app.page)
    assert.equal(opened.parent.bodyLayout, 'stack')
    assert.deepEqual(opened.members.map((m) => m.title), ['__init__()', '__call__()'])
    assert.deepEqual(ys(opened.members), [HEADER + 12, HEADER + 12 + 190 + 12])
    assert.deepEqual(opened.members.map((m) => m.w), [576, 576])
    // Everything under the last member: trailing gap + description + footer. Measured
    // once here so the later hug checks compare against the app's own chrome.
    const chromeBelow = opened.parent.h - (opened.members[1].y + opened.members[1].h)
    assert.ok(chromeBelow >= 12 + 46, `hug chrome below the stack, got ${chromeBelow}`)
    pass('a stacked Block opens with its members in authored order and hugs them')

    // 2 · The Members section lists them in that order and lights Stack + Inset.
    await selectParent(app.page)
    const listed = await facts(app.page)
    assert.deepEqual(listed.rows, listed.members.map((m) => m.id))
    assert.equal(listed.pressed.stack, 'true')
    assert.equal(listed.pressed.inset, 'true')
    assert.equal(listed.pressed.fill, 'true')
    pass('the Members section mirrors the stack, with Stack, Inset and Fill lit')

    // 3 · Add member: a blank Port-view Block lands last, filled to the inner width.
    await clickElement(app.page, '[data-testid="inspector-member-add"]')
    await waitFor(app.page, `window.__systemsketch.editor.getCurrentPageShapes().filter((s) => s.type === 'block').length === 4`, 'a new member')
    await delay(300)
    const added = await facts(app.page)
    assert.equal(added.members.length, 3)
    assert.equal(added.members[2].title, '')
    assert.equal(added.members[2].w, 576)
    assert.equal(Math.round(added.members[2].y), HEADER + 12 + 190 + 12 + 190 + 12)
    assert.equal(added.rows.length, 3)
    assert.equal(added.parent.h, added.members[2].y + added.members[2].h + chromeBelow)
    pass('Add member appends a blank Port-view member at the bottom and the parent grows')
    await capture(app.page, 'journey-added')

    // 4 · ↑ on a grip steps the member one slot; the canvas follows.
    const callId = added.members[1].id
    await clickElement(app.page, `[data-testid="inspector-member-grip-${callId}"]`)
    await key(app.page, 'ArrowUp')
    await waitFor(app.page, `window.__systemsketch.editor.getSortedChildIdsForParent(${JSON.stringify(added.parent.id)})[0] === ${JSON.stringify(callId)}`, 'call first')
    await delay(200)
    const stepped = await facts(app.page)
    assert.deepEqual(stepped.members.map((m) => m.title), ['__call__()', '__init__()', ''])
    assert.deepEqual(ys(stepped.members), [HEADER + 12, HEADER + 12 + 190 + 12, HEADER + 12 + 190 + 12 + 190 + 12])
    assert.deepEqual(stepped.rows, stepped.members.map((m) => m.id))
    pass('ArrowUp on a grip reorders the authored order and the stack re-lays out')

    // 5 · Drag a grip in the list (dnd-kit) below the last row.
    const initId = stepped.members[1].id
    const grip = await elementBox(app.page, `[data-testid="inspector-member-grip-${initId}"]`)
    const lastRow = await elementBox(app.page, `[data-testid="inspector-member-row-${stepped.members[2].id}"]`)
    await drag(app.page,
      { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 },
      { x: grip.x + grip.width / 2, y: lastRow.y + lastRow.height - 4 })
    await waitFor(app.page, `window.__systemsketch.editor.getSortedChildIdsForParent(${JSON.stringify(added.parent.id)}).filter((id) => window.__systemsketch.editor.getShape(id).type === 'block').pop() === ${JSON.stringify(initId)}`, 'init last')
    await delay(200)
    const listDragged = await facts(app.page)
    assert.deepEqual(listDragged.members.map((m) => m.title), ['__call__()', '', '__init__()'])
    assert.deepEqual(ys(listDragged.members), [HEADER + 12, HEADER + 12 + 190 + 12, HEADER + 12 + 190 + 12 + 170 + 12])
    pass('dragging a list grip past the last row moves the member to the end of the stack')

    // 6 · Drag the card on the canvas: it re-takes its slot from where it lands.
    const from = await screenPoint(app.page, initId, 300, 120)
    const to = await screenPoint(app.page, callId, 300, 20)
    await drag(app.page, from, to)
    await waitFor(app.page, `window.__systemsketch.editor.getSortedChildIdsForParent(${JSON.stringify(added.parent.id)}).filter((id) => window.__systemsketch.editor.getShape(id).type === 'block')[0] === ${JSON.stringify(initId)}`, 'init first after the canvas drag')
    await delay(300)
    const canvasDragged = await facts(app.page)
    assert.deepEqual(canvasDragged.members.map((m) => m.title), ['__init__()', '__call__()', ''])
    assert.deepEqual(ys(canvasDragged.members), [HEADER + 12, HEADER + 12 + 190 + 12, HEADER + 12 + 190 + 12 + 190 + 12])
    assert.deepEqual(canvasDragged.members.map((m) => m.x), [12, 12, 12])
    pass('a canvas drag reorders by the landing height and snaps back into the column')

    // 7 · A typed gap wins over the preset, and neither preset stays lit.
    await selectParent(app.page)
    // The number field is a controlled React input; the repo's journeys drive
    // those through the native value setter + an input event (see the BT tuner).
    await evaluate(app.page, `(() => {
      const input = document.querySelector('[data-testid="block-member-gap"]')
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      input.focus()
      setter.call(input, '4')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })()`)
    await waitFor(app.page, `window.__systemsketch.editor.getShape(${JSON.stringify(added.parent.id)}).props.memberGap === 4`, 'gap 4')
    await delay(300)
    const gapped = await facts(app.page)
    assert.deepEqual(ys(gapped.members), [HEADER + 4, HEADER + 4 + 190 + 4, HEADER + 4 + 190 + 4 + 190 + 4])
    assert.equal(gapped.pressed.inset, 'false')
    assert.equal(gapped.pressed.edge, 'false')
    assert.equal(gapped.members[0].x, 12)
    pass('typing Gap 4 re-stacks at 4px and unlights both presets')

    // 8 · Edge-to-edge writes 0 / 0 and squares the member corners.
    await clickElement(app.page, '[data-testid="block-member-layout-edge-to-edge"]')
    await waitFor(app.page, `window.__systemsketch.editor.getShape(${JSON.stringify(added.parent.id)}).props.memberLayout === 'edge-to-edge'`, 'edge-to-edge')
    await delay(300)
    const edge = await facts(app.page)
    assert.deepEqual(ys(edge.members), [HEADER, HEADER + 190, HEADER + 380])
    assert.deepEqual(edge.members.map((m) => [m.x, m.w]), [[0, 600], [0, 600], [0, 600]])
    assert.equal(edge.pressed.edge, 'true')
    assert.equal(edge.parent.gap, null)
    assert.equal(edge.callRadius, '0px')
    pass('Edge-to-edge clears the typed number, stacks at 0 / 0 and squares the cards')
    await capture(app.page, 'journey-edge-to-edge')

    // 9 · Rule 4: nothing shared changed through any of this.
    for (const member of edge.members) assert.deepEqual(member.expanded, opened.members[0].expanded)
    pass('no member Expanded box was written by the stack')

    // 10 · Free hands the cards back: a drag now sticks where it lands.
    await clickElement(app.page, '[data-testid="block-body-layout-free"]')
    await waitFor(app.page, `(window.__systemsketch.editor.getShape(${JSON.stringify(added.parent.id)}).props.bodyLayout ?? 'free') === 'free'`, 'free')
    const freeFrom = await screenPoint(app.page, callId, 300, 120)
    await drag(app.page, freeFrom, { x: freeFrom.x + 40, y: freeFrom.y + 60 })
    await delay(400)
    const freed = await facts(app.page)
    const movedCall = freed.members.find((m) => m.id === callId)
    // Zoom and the drag threshold make the exact offset uninteresting; what
    // matters is that nothing snapped it back to its slot (x 0, y 238).
    assert.ok(movedCall.y - (HEADER + 190) > 30, `call stays below its old slot, got ${movedCall.y}`)
    assert.ok(movedCall.x > 20, `call stays right of the gutter, got ${movedCall.x}`)
    pass('Free stops the layout: a dragged member stays where it was dropped')

    assert.deepEqual(await localConsoleErrors(app.page), [])
    pass('the real interaction completes without browser console errors')

    process.stdout.write(`\n${checks.length}/${checks.length} block-members checks passed\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
