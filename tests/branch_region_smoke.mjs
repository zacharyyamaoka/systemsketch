#!/usr/bin/env node
/**
 * Real-browser proof of the Branch region, driven through the product
 * composition with real mouse events: the system-design submenu under the
 * Block slot, drawing a region, control ports and arms from the band, the
 * "+ arm" row and the inspector, click-to-edit titles, Blocks dropped into
 * arms, cables straight to inner Blocks and to a control port, fold (with the
 * cable re-attaching at the header), make-active (fade), Case view (only the
 * open case's wires), and persistence through the ordinary autosave.
 */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  delay,
  ensureDir,
  evaluate,
  key,
  localConsoleErrors,
  mouse,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'
import {
  addPort,
  blockIds,
  box,
  cableEnds,
  deselect,
  dragFrom,
  drawBlock,
  portDot,
  scope,
  setView,
} from './block_journey_helpers.mjs'

const SHOTS = join(ROOT, 'docs', 'assets')
const OUT = join(SHOTS, 'branch-region-acceptance.json')
const results = []

function check(id, label, observed, desired) {
  const ok = JSON.stringify(observed) === JSON.stringify(desired)
  results.push({ id, label, observed, desired, ok })
  process.stdout.write(
    `  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}\n`
    + (ok ? '' : `        observed=${JSON.stringify(observed)} desired=${JSON.stringify(desired)}\n`),
  )
}

async function shot(page, name) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(join(SHOTS, name), Buffer.from(capture.data, 'base64'))
}

const editorEval = (page, body) => evaluate(page, `(() => {
  const editor = window.__systemsketch.editor
  ${body}
})()`)

async function branchRecord(page) {
  return JSON.parse(await editorEval(page, `
    const branch = editor.getCurrentPageShapes().find((shape) => shape.type === 'branch')
    if (!branch) return 'null'
    return JSON.stringify({
      id: branch.id,
      title: branch.props.title,
      view: branch.props.view,
      activeArmId: branch.props.activeArmId,
      controls: branch.props.controls.map((c) => ({ id: c.id, name: c.name })),
      arms: branch.props.arms.map((a) => ({ id: a.id, title: a.title, open: a.open })),
      h: branch.props.h,
    })`))
}

async function childArms(page, branchId) {
  return JSON.parse(await editorEval(page, `
    const direct = editor.getSortedChildIdsForParent(${JSON.stringify(branchId)})
      .map((id) => editor.getShape(id))
    const framed = direct
      .filter((shape) => shape.type === 'branch-arm')
      .flatMap((frame) => editor.getSortedChildIdsForParent(frame.id)
        .map((id) => editor.getShape(id))
        .filter((shape) => shape.type === 'block')
        .map((shape) => ({ shape, arm: frame.props.armId })))
    const legacy = direct
      .filter((shape) => shape.type === 'block')
      .map((shape) => ({ shape, arm: shape.meta.branchArm ?? null }))
    return JSON.stringify([...framed, ...legacy]
      .map(({ shape, arm }) => ({ title: shape.props.title, arm, hidden: editor.isShapeHidden(shape) })))`))
}

async function paintedCables(page) {
  return evaluate(page, `document.querySelectorAll('[data-shape-type="connection"] path').length`)
}

async function opacityOf(page, selector) {
  return evaluate(page, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)})
    return element ? Number(getComputedStyle(element).opacity) : null
  })()`)
}

async function clickTestId(page, testId) {
  const selector = `[data-testid="${testId}"]`
  await waitFor(page, `document.querySelector(${JSON.stringify(selector)})`, testId, 8000)
  const target = await box(page, selector)
  await clickAt(page, target.cx, target.cy)
  await delay(260)
}

async function typeInline(page, testId, text) {
  await waitFor(page, `document.querySelector('[data-testid="${testId}"]')`, `${testId} editor`, 8000)
  await delay(120)
  await page.send('Input.insertText', { text })
  await key(page, 'Enter', 'Enter')
  await delay(220)
}

async function dragBox(page, from, to) {
  await mouse(page, 'mouseMoved', from.x, from.y)
  await mouse(page, 'mousePressed', from.x, from.y, { buttons: 1 })
  for (let step = 1; step <= 8; step += 1) {
    await mouse(page, 'mouseMoved',
      from.x + ((to.x - from.x) * step) / 8,
      from.y + ((to.y - from.y) * step) / 8,
      { buttons: 1 })
    await delay(25)
  }
  await mouse(page, 'mouseReleased', to.x, to.y)
  await delay(320)
}

async function portBlock(page, from, to, title) {
  const before = new Set(await blockIds(page))
  await drawBlock(page, from, to, title)
  await addPort(page, 'inputs')
  await addPort(page, 'outputs')
  await setView(page, 'port')
  await deselect(page, { x: 90, y: 940 })
  return (await blockIds(page)).find((id) => !before.has(id))
}

/**
 * Select the Branch by its band, clear of every text field: a click on the
 * title of an already-selected Branch is (correctly) the edit gesture.
 */
/** Computed opacity of the cable whose two hosts carry these titles. */
async function cableOpacityBetween(page, titleA, titleB) {
  return evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const wanted = ${JSON.stringify([titleA, titleB].sort())}
    const cable = editor.getCurrentPageShapes().filter((s) => s.type === 'connection').find((s) => {
      const titles = editor.getBindingsFromShape(s.id, 'connection').map((b) => editor.getShape(b.toId).props.title).sort()
      return JSON.stringify(titles) === JSON.stringify(wanted)
    })
    if (!cable) return null
    const svg = document.querySelector('[data-shape-id="' + cable.id + '"] svg')
    return svg ? Number(getComputedStyle(svg).opacity) : null
  })()`)
}

/** A screen point on the painted path of that cable, for a real click. */
async function cableMidpoint(page, titleA, titleB) {
  return JSON.parse(await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const wanted = ${JSON.stringify([titleA, titleB].sort())}
    const cable = editor.getCurrentPageShapes().filter((s) => s.type === 'connection').find((s) => {
      const titles = editor.getBindingsFromShape(s.id, 'connection').map((b) => editor.getShape(b.toId).props.title).sort()
      return JSON.stringify(titles) === JSON.stringify(wanted)
    })
    const path = document.querySelector('[data-shape-id="' + cable.id + '"] path')
    const point = path.getPointAtLength(path.getTotalLength() * 0.5)
    const m = path.getScreenCTM()
    return JSON.stringify({ x: m.a * point.x + m.c * point.y + m.e, y: m.b * point.x + m.d * point.y + m.f })
  })()`))
}

async function badgeText(page, block, portId) {
  return evaluate(page, `(() => {
    const badge = document.querySelector('${scope(block)} [data-testid="port-count-${portId}"]')
    return badge ? badge.textContent.trim() : null
  })()`)
}

async function selectBranch(page) {
  const band = await box(page, '.systemsketch-branch-canvas .Branch-band')
  await clickAt(page, band.x + band.w - 6, band.cy)
  await delay(260)
}

async function main() {
  await ensureDir(SHOTS)
  const app = await startApp({
    label: 'systemsketch-branch-region',
    build: 'branch-region',
    width: 1800,
    height: 1000,
  })
  const { page, port, filesRoot } = app
  const errors = localConsoleErrors(page)
  const board = join(filesRoot, 'SystemSketch', 'branch-region-proof.tldr')

  try {
    await openApp(page, port, `?board=${encodeURIComponent(board)}`)
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-app"] .tl-container')`, 'product canvas')
    await delay(800)

    // 1 · The Branch tool lives in the system-design submenu under the Block slot.
    check('BR-1', 'the whole Block family slot is the submenu trigger, not a split target',
      await evaluate(page, `document.querySelector('[data-testid="systemsketch-tool-system"]')?.getAttribute('aria-haspopup') ?? null`), 'menu')
    check('BR-2', 'Branch is not a top-level toolbar slot',
      await evaluate(page, `Boolean(document.querySelector('[data-testid="systemsketch-tool-branch"]'))`), false)
    await clickTestId(page, 'systemsketch-tool-system')
    await waitFor(page, `Array.from(document.querySelectorAll('.systemsketch-tool-menu__item')).some((n) => n.textContent.includes('Branch'))`, 'system menu')
    const items = JSON.parse(await evaluate(page, `JSON.stringify(Array.from(document.querySelectorAll('.systemsketch-tool-menu__item .tlui-button__label')).map((n) => n.textContent.trim()))`))
    check('BR-3', 'the submenu lists Block, Branch and Pill under one heading', items, ['Block', 'Branch', 'Pill'])
    const branchItem = JSON.parse(await evaluate(page, `(() => {
      const item = Array.from(document.querySelectorAll('.systemsketch-tool-menu__item')).find((n) => n.textContent.includes('Branch'))
      const r = item.getBoundingClientRect(); return JSON.stringify({ cx: r.x + r.width / 2, cy: r.y + r.height / 2 })
    })()`))
    await shot(page, 'branch-region-1-submenu.png')
    await clickAt(page, branchItem.cx, branchItem.cy)
    await delay(300)
    check('BR-4', 'picking Branch activates the branch tool', await editorEval(page, 'return editor.getCurrentToolId()'), 'branch')
    await shot(page, 'branch-region-1b-picked.png')

    // 2 · Draw the region.
    // Tall enough that a port-view Block fits inside one arm's body.
    await dragBox(page, { x: 420, y: 120 }, { x: 1040, y: 680 })
    let branch = await branchRecord(page)
    check('BR-5', 'a drawn Branch has two open arms and no control ports',
      { arms: branch.arms.map((a) => [a.title, a.open]), controls: branch.controls.length, view: branch.view },
      { arms: [['if', true], ['else', true]], controls: 0, view: 'expanded' })
    check('BR-5b', 'the region follows the drag: the height lands on the open arms, evenly',
      { w: await editorEval(page, `return editor.getCurrentPageShapes().find((s) => s.type === 'branch').props.w`), h: branch.h,
        arms: JSON.parse(await editorEval(page, `return JSON.stringify(editor.getCurrentPageShapes().find((s) => s.type === 'branch').props.arms.map((a) => a.h))`)) },
      { w: 620, h: 560, arms: [223, 223] })
    check('BR-6', 'the slot icon now remembers Branch as the last system tool',
      JSON.parse(await evaluate(page, `JSON.stringify({
        icon: document.querySelector('[data-testid="systemsketch-tool-system"] .systemsketch-branch-icon') !== null,
        stored: JSON.parse(localStorage.getItem('systemsketch.toolbar-preferences.v1') || '{}').lastSystemTool ?? null,
      })`)), { icon: true, stored: 'branch' })
    await waitFor(page, `document.querySelector('[data-testid="branch-pill-add-control"]')`, 'Branch pill')
    check('BR-7', 'the selection pill reads Branch · + port · + arm · E · C · ◎ · Inspect',
      JSON.parse(await evaluate(page, `JSON.stringify(Array.from(document.querySelectorAll('.branch-mini-menu > *, .branch-mini-menu button')).map((b) => b.dataset.testid ?? b.className.split(' ')[0]).filter(Boolean))`)),
      ['block-mini-menu__subject', 'block-mini-menu__views', 'branch-pill-add-control', 'branch-pill-add-arm',
        'block-mini-menu__views', 'branch-pill-view-expanded', 'branch-pill-view-case', 'branch-pill-active', 'block-mini-menu__inspect'])

    // 3 · Control ports: the band "+" then the inspector "+", each with a name.
    await clickTestId(page, 'branch-add-control')
    await typeInline(page, 'branch-inline-control-ctrl_1', 'fast')
    branch = await branchRecord(page)
    check('BR-8', 'the band "+" adds a control port and its name is typed in place', branch.controls, [{ id: 'ctrl_1', name: 'fast' }])
    await selectBranch(page)
    await clickTestId(page, 'branch-inspector-add-control')
    branch = await branchRecord(page)
    check('BR-9', 'the inspector "+" adds a second control port on the band', branch.controls.map((c) => c.id), ['ctrl_1', 'ctrl_2'])
    check('BR-10', 'two dots sit on the band, spread evenly',
      JSON.parse(await evaluate(page, `JSON.stringify(Array.from(document.querySelectorAll('[data-testid^="branch-control-dot-"]')).map((n) => Math.round(parseFloat(n.style.top))))`)),
      [13, 27])
    const removeCtrl = await box(page, '[aria-label="Remove ctrl_2"]')
    await clickAt(page, removeCtrl.cx, removeCtrl.cy)
    await delay(260)
    branch = await branchRecord(page)
    check('BR-11', 'the inspector × removes a control port', branch.controls.map((c) => c.name), ['fast'])

    // 4 · Arms: the "+ arm" row, then the inspector; titles by single click.
    await selectBranch(page)
    await clickTestId(page, 'branch-add-arm')
    await typeInline(page, 'branch-inline-arm-arm_3', 'elif')
    branch = await branchRecord(page)
    check('BR-12', 'the "+ arm" row adds an arm and its title is typed in place', branch.arms.map((a) => a.title), ['if', 'else', 'elif'])
    await selectBranch(page)
    await clickTestId(page, 'branch-inspector-add-arm')
    branch = await branchRecord(page)
    check('BR-13', 'the inspector "+" adds an arm too', branch.arms.length, 4)
    const removeArm = await box(page, '[aria-label="Remove arm case"]')
    await clickAt(page, removeArm.cx, removeArm.cy)
    await delay(260)
    branch = await branchRecord(page)
    check('BR-14', 'the inspector × removes an arm', branch.arms.map((a) => a.title), ['if', 'else', 'elif'])
    // A selected Branch: one click on a title edits it.
    const title = await box(page, '[data-testid="branch-arm-title-arm_1"]')
    await clickAt(page, title.x + 12, title.cy)
    await typeInline(page, 'branch-inline-arm-arm_1', 'if fast')
    branch = await branchRecord(page)
    check('BR-15', 'a single click on an arm title of the selected Branch edits it', branch.arms[0].title, 'if fast')
    await shot(page, 'branch-region-2-authored.png')
    await deselect(page, { x: 90, y: 940 })

    // 5 · Blocks inside the arms, one outside, and the cables.
    branch = await branchRecord(page)
    const rows = JSON.parse(await editorEval(page, `
      const branch = editor.getShape(${JSON.stringify(branch.id)})
      const bounds = editor.getShapePageBounds(branch)
      const bandH = 40, headerH = 32
      const tops = []
      let cursor = bounds.minY + bandH
      for (const arm of branch.props.arms) { tops.push(cursor + headerH); cursor += headerH + (arm.open ? arm.h : 0) }
      return JSON.stringify({ x: bounds.minX, w: bounds.width, tops, zoom: editor.getZoomLevel(), cam: editor.getCamera() })`))
    const toScreen = (x, y) => ({ x: (x + rows.cam.x) * rows.zoom, y: (y + rows.cam.y) * rows.zoom })
    const armA = toScreen(rows.x + 140, rows.tops[0] + 20)
    const armB = toScreen(rows.x + 140, rows.tops[1] + 20)
    const estimate = await portBlock(page, armA, { x: armA.x + 250, y: armA.y + 130 }, 'estimate()')
    const fallback = await portBlock(page, armB, { x: armB.x + 250, y: armB.y + 130 }, 'fallback()')
    const decode = await portBlock(page, { x: 20, y: 300 }, { x: 270, y: 430 }, 'decode()')
    const flag = await portBlock(page, { x: 20, y: 560 }, { x: 270, y: 690 }, 'flag()')
    // Two producers into one consumer outside the region: the chosen arm's and an outside competitor's.
    const publish = await portBlock(page, { x: 1110, y: 160 }, { x: 1360, y: 290 }, 'publish()')
    const cached = await portBlock(page, { x: 1110, y: 560 }, { x: 1360, y: 690 }, 'cached()')
    check('BR-16', 'Blocks drawn in the arms are children of their arm frames and retain their semantic arm',
      await childArms(page, branch.id),
      [{ title: 'estimate()', arm: 'arm_1', hidden: false }, { title: 'fallback()', arm: 'arm_2', hidden: false }])

    const dots = {
      decodeOut: await box(page, portDot(decode, 'output', 'out_1')),
      flagOut: await box(page, portDot(flag, 'output', 'out_1')),
      estimateIn: await box(page, portDot(estimate, 'input', 'in_1')),
      fallbackIn: await box(page, portDot(fallback, 'input', 'in_1')),
      control: await box(page, '[data-testid="branch-control-dot-ctrl_1"]'),
      estimateOut: await box(page, portDot(estimate, 'output', 'out_1')),
      cachedOut: await box(page, portDot(cached, 'output', 'out_1')),
      publishIn: await box(page, portDot(publish, 'input', 'in_1')),
    }
    await dragFrom(page, dots.decodeOut, dots.estimateIn)
    await dragFrom(page, dots.decodeOut, dots.fallbackIn)
    await dragFrom(page, dots.flagOut, dots.control)
    // A port-view Block is wider than the box it was drawn from: keep every dot
    // left of the inspector dock, which owns the pointer from x = 1520.
    await dragFrom(page, dots.estimateOut, dots.publishIn)
    await dragFrom(page, dots.cachedOut, dots.publishIn)
    await delay(300)
    const wiring = JSON.parse(await editorEval(page, `
      const cables = editor.getCurrentPageShapes().filter((s) => s.type === 'connection')
      return JSON.stringify(cables.map((cable) => {
        const bindings = editor.getBindingsFromShape(cable.id, 'connection')
        return bindings.map((b) => editor.getShape(b.toId).type + ':' + (editor.getShape(b.toId).props.title ?? '') + '.' + b.props.portId).sort().join(' ↔ ')
      }).sort())`))
    check('BR-17', 'cables run straight to the Blocks inside the arms, to the control port on the band, and out again', wiring, [
      'block:cached().out_1 ↔ block:publish().in_1',
      'block:decode().out_1 ↔ block:estimate().in_1',
      'block:decode().out_1 ↔ block:fallback().in_1',
      'block:estimate().out_1 ↔ block:publish().in_1',
      'block:flag().out_1 ↔ branch:Branch.ctrl_1',
    ])
    check('BR-18', 'five cables paint', await paintedCables(page), 5)
    check('BR-18b', 'a port with two producers wears a count badge; single-producer ports do not',
      { publish: await badgeText(page, publish, 'in_1'), estimate: await badgeText(page, estimate, 'in_1') },
      { publish: '2', estimate: null })
    await shot(page, 'branch-region-3-wired.png')

    // 6 · Fold: the cable into the folded arm attaches at the header row edge.
    await clickTestId(page, 'branch-arm-fold-arm_2')
    branch = await branchRecord(page)
    check('BR-19', 'the chevron folds the arm', branch.arms.map((a) => a.open), [true, false, true])
    check('BR-20', 'the folded arm\'s Block is hidden, not deleted',
      (await childArms(page, branch.id)).map((c) => [c.title, c.hidden]), [['estimate()', false], ['fallback()', true]])
    const geometry = JSON.parse(await editorEval(page, `
      const branch = editor.getShape(${JSON.stringify(branch.id)})
      const bounds = editor.getShapePageBounds(branch)
      const row = 40 + 32 + branch.props.arms[0].h + 16
      const p = editor.pageToScreen({ x: bounds.minX, y: bounds.minY + row })
      const c = editor.getContainer().getBoundingClientRect()
      return JSON.stringify({ x: p.x + c.left, y: p.y + c.top })`))
    // Two cables leave decode: the one to fallback now ends at the folded header's left edge.
    const ends = []
    for (let index = 0; index < 5; index += 1) ends.push(await cableEnds(page, index))
    const atHeader = ends.find((end) => Math.abs(end.to.x - geometry.x) < 3 && Math.abs(end.to.y - geometry.y) < 3)
    check('BR-21', 'the cable into the folded arm re-attaches at the arm header\'s left edge centre', Boolean(atHeader), true)
    check('BR-22', 'the other cables still paint in Expanded view', await paintedCables(page), 5)
    await shot(page, 'branch-region-4-folded.png')
    await clickTestId(page, 'branch-arm-fold-arm_2')
    branch = await branchRecord(page)
    check('BR-23', 'the chevron opens it again and its Block returns',
      { open: branch.arms.map((a) => a.open), hidden: (await childArms(page, branch.id)).map((c) => c.hidden) },
      { open: [true, true, true], hidden: [false, false] })

    // 7 · Make active: the other arms and their cables fade.
    await clickTestId(page, 'branch-arm-active-arm_1')
    branch = await branchRecord(page)
    check('BR-24', 'the target makes the arm active', branch.activeArmId, 'arm_1')
    check('BR-25', 'the Block in the non-active arm fades to the token; the active one does not',
      [await opacityOf(page, `${scope(fallback)} .systemsketch-block-canvas`), await opacityOf(page, `${scope(estimate)} .systemsketch-block-canvas`)],
      [0.18, 1])
    const trio = async () => [
      await cableOpacityBetween(page, 'estimate()', 'publish()'),
      await cableOpacityBetween(page, 'cached()', 'publish()'),
      await cableOpacityBetween(page, 'decode()', 'fallback()'),
    ]
    check('BR-25b', 'active path: the chosen arm\'s cable into publish stays live, the outside competitor into the same port fades (iii), the non-chosen arm\'s cable fades (ii)',
      await trio(), [1, 0.18, 0.18])
    await shot(page, 'branch-region-5-active.png')
    await clickTestId(page, 'branch-arm-active-arm_1')
    branch = await branchRecord(page)
    check('BR-26', 'the same target again clears it: all arms active', branch.activeArmId, null)
    check('BR-26b', 'with no arm chosen every cable is full', await trio(), [1, 1, 1])
    await clickTestId(page, 'branch-arm-active-arm_2')
    check('BR-26c', 'choosing the other arm: the pass-through competitor reads full, the now non-chosen arm\'s cable fades',
      await trio(), [0.18, 1, 1])
    await clickTestId(page, 'branch-arm-active-arm_2')
    // The badge follows the cables: delete the competitor with a real click and Delete.
    const mid = await cableMidpoint(page, 'cached()', 'publish()')
    await clickAt(page, mid.x, mid.y)
    await delay(200)
    await key(page, 'Delete', 'Delete')
    await delay(300)
    check('BR-26d', 'removing one producer drops the port back to one cable and the badge disappears',
      { cables: await paintedCables(page), badge: await badgeText(page, publish, 'in_1') }, { cables: 4, badge: null })
    await deselect(page, { x: 90, y: 940 })

    // 8 · Case view from the pill: one open arm, only its wires.
    await selectBranch(page)
    await clickTestId(page, 'branch-pill-view-case')
    branch = await branchRecord(page)
    check('BR-27', 'Case view keeps only the first open arm open', { view: branch.view, open: branch.arms.map((a) => a.open) }, { view: 'case', open: [true, false, false] })
    check('BR-28', 'in Case view only the open case\'s wires paint (decode→estimate, estimate→publish and the control cable)', await paintedCables(page), 3)
    await shot(page, 'branch-region-6-case.png')
    await clickTestId(page, 'branch-arm-fold-arm_2')
    branch = await branchRecord(page)
    check('BR-29', 'opening another arm in Case view folds the first', branch.arms.map((a) => a.open), [false, true, false])
    check('BR-30', 'and the wires follow the open case', await paintedCables(page), 2)
    await clickTestId(page, 'branch-pill-view-expanded')
    branch = await branchRecord(page)
    check('BR-31', 'back to Expanded the arms stay as they were', { view: branch.view, open: branch.arms.map((a) => a.open) }, { view: 'expanded', open: [false, true, false] })

    // 9 · Persistence through the ordinary autosave.
    await delay(1200)
    await openApp(page, port, `?board=${encodeURIComponent(board)}`)
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-app"] .tl-container')`, 'product canvas again')
    await waitFor(page, `window.__systemsketch?.editor?.getCurrentPageShapes().some((s) => s.type === 'branch')`, 'reloaded Branch', 15000)
    await delay(600)
    const reloaded = await branchRecord(page)
    check('BR-32', 'the Branch, its control port, its arms and their fold state survive a reload',
      { title: reloaded.title, controls: reloaded.controls, arms: reloaded.arms },
      { title: 'Branch', controls: [{ id: 'ctrl_1', name: 'fast' }], arms: [
        { id: 'arm_1', title: 'if fast', open: false }, { id: 'arm_2', title: 'else', open: true }, { id: 'arm_3', title: 'elif', open: false }] })
    check('BR-33', 'the children, their arms and the cables survive too',
      { children: await childArms(page, reloaded.id), cables: await editorEval(page, `return editor.getCurrentPageShapes().filter((s) => s.type === 'connection').length`) },
      { children: [{ title: 'estimate()', arm: 'arm_1', hidden: true }, { title: 'fallback()', arm: 'arm_2', hidden: false }], cables: 4 })
    check('BR-34', 'no console errors while driving', errors.count?.() ?? errors.length ?? 0, 0)
  } finally {
    app.close()
  }

  await writeFile(OUT, JSON.stringify(results, null, 2))
  const failed = results.filter((result) => !result.ok)
  console.log(`${results.length - failed.length}/${results.length} passed → ${OUT}`)
  process.exit(failed.length ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
