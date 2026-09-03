#!/usr/bin/env node
/**
 * Real-browser proof of the delayed-cable vocabulary, driven through the
 * product composition with real mouse events: mark a cable delayed from the
 * inspector (dotted line, z⁻¹ pill centred on the cable), name its initial
 * value (the pill reads `z⁻¹ = 1.0`), slide the pill along the cable by its
 * handle, centre it again, flip the Dev Hub's "dash after the z⁻¹ pill"
 * switch (dotted before the pill, dashed after it), mark the cable data again
 * (pill and dots gone), reload (everything persists through the ordinary
 * autosave), and finally a delayed cable into a Branch arm still fades when
 * another arm is made active.
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
  deselect,
  dragFrom,
  drawBlock,
  portDot,
  setView,
} from './block_journey_helpers.mjs'

const SHOTS = join(ROOT, 'docs', 'assets')
const OUT = join(SHOTS, 'edge-vocabulary-acceptance.json')
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

async function clickTestId(page, testId) {
  const selector = `[data-testid="${testId}"]`
  await waitFor(page, `document.querySelector(${JSON.stringify(selector)})`, testId, 8000)
  const target = await box(page, selector)
  await clickAt(page, target.cx, target.cy)
  await delay(260)
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

/** The one cable between two Blocks, by their titles. */
async function cableRecord(page, titleA, titleB) {
  return JSON.parse(await editorEval(page, `
    const wanted = ${JSON.stringify([titleA, titleB].sort())}
    const cable = editor.getCurrentPageShapes().filter((s) => s.type === 'connection').find((s) => {
      const titles = editor.getBindingsFromShape(s.id, 'connection').map((b) => editor.getShape(b.toId).props.title).sort()
      return JSON.stringify(titles) === JSON.stringify(wanted)
    })
    if (!cable) return 'null'
    return JSON.stringify({ id: cable.id, temporal: cable.props.temporal, delayValue: cable.props.delayValue, pillPosition: cable.props.pillPosition })`))
}

/** What the DOM paints for that cable: dash pattern, segments, the pill and its text. */
async function painted(page, cableId) {
  return JSON.parse(await evaluate(page, `(() => {
    const root = document.querySelector('[data-shape-id="' + ${JSON.stringify(cableId)} + '"]')
    if (!root) return 'null'
    const paths = Array.from(root.querySelectorAll('path'))
    const pill = root.querySelector('[data-testid="connection-delay-pill"]')
    const path = paths[0]
    const total = path ? path.getTotalLength() : 0
    const m = path ? path.getScreenCTM() : null
    const mid = path ? path.getPointAtLength(total / 2) : null
    const pillRect = pill ? pill.getBoundingClientRect() : null
    return JSON.stringify({
      segments: paths.map((p) => p.getAttribute('data-delay-segment')),
      dash: paths.map((p) => p.getAttribute('stroke-dasharray')),
      pill: pill ? pill.querySelector('text').textContent : null,
      pillCenter: pillRect ? { x: pillRect.x + pillRect.width / 2, y: pillRect.y + pillRect.height / 2 } : null,
      midpoint: mid && m ? { x: m.a * mid.x + m.c * mid.y + m.e, y: m.b * mid.x + m.d * mid.y + m.f } : null,
      opacity: Number(getComputedStyle(root.querySelector('svg')).opacity),
    })
  })()`))
}

async function selectCable(page, cableId) {
  const point = JSON.parse(await evaluate(page, `(() => {
    const path = document.querySelector('[data-shape-id="' + ${JSON.stringify(cableId)} + '"] path')
    const p = path.getPointAtLength(path.getTotalLength() * 0.3)
    const m = path.getScreenCTM()
    return JSON.stringify({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f })
  })()`))
  await clickAt(page, point.x, point.y)
  await waitFor(page, `document.querySelector('[data-testid="connection-inspector"]')`, 'connection inspector', 8000)
  await delay(200)
}

async function typeInto(page, testId, text) {
  const field = await box(page, `[data-testid="${testId}"]`)
  await clickAt(page, field.cx, field.cy)
  await delay(120)
  await evaluate(page, `(() => { const el = document.querySelector('[data-testid="${testId}"]'); el.focus(); el.select && el.select() })()`)
  await page.send('Input.insertText', { text })
  await key(page, 'Enter', 'Enter')
  await delay(260)
}

async function dragHandle(page, from, to) {
  await mouse(page, 'mouseMoved', from.x, from.y)
  await delay(80)
  await mouse(page, 'mousePressed', from.x, from.y, { buttons: 1 })
  for (let step = 1; step <= 10; step += 1) {
    await mouse(page, 'mouseMoved',
      from.x + ((to.x - from.x) * step) / 10,
      from.y + ((to.y - from.y) * step) / 10,
      { buttons: 1 })
    await delay(25)
  }
  await mouse(page, 'mouseReleased', to.x, to.y)
  await delay(320)
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

const near = (a, b, tolerance) => Boolean(a && b) && Math.hypot(a.x - b.x, a.y - b.y) <= tolerance

async function main() {
  await ensureDir(SHOTS)
  const app = await startApp({
    label: 'systemsketch-edge-vocabulary',
    build: 'edge-vocabulary',
    width: 1800,
    height: 1000,
  })
  const { page, port, filesRoot } = app
  const board = join(filesRoot, 'SystemSketch', 'edge-vocabulary-proof.tldr')

  try {
    await openApp(page, port, `?board=${encodeURIComponent(board)}`)
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-app"] .tl-container')`, 'product canvas')
    await delay(800)

    // 1 · Two Blocks and a plain cable.
    const estimate = await portBlock(page, { x: 120, y: 300 }, { x: 370, y: 430 }, 'estimate()')
    const refine = await portBlock(page, { x: 720, y: 300 }, { x: 970, y: 430 }, 'refine()')
    await dragFrom(page, await box(page, portDot(estimate, 'output', 'out_1')), await box(page, portDot(refine, 'input', 'in_1')))
    await deselect(page, { x: 90, y: 940 })
    let cable = await cableRecord(page, 'estimate()', 'refine()')
    check('EV-1', 'a fresh cable is a plain data cable with the pill centred and no value',
      { temporal: cable.temporal, delayValue: cable.delayValue, pillPosition: cable.pillPosition },
      { temporal: 'data', delayValue: '', pillPosition: 0.5 })
    let paint = await painted(page, cable.id)
    check('EV-2', 'a data cable paints one solid path and no pill', { segments: paint.segments, dash: paint.dash, pill: paint.pill }, { segments: [null], dash: [null], pill: null })
    await shot(page, 'edge-vocabulary-1-data.png')

    // 2 · Delayed from the inspector: dotted, pill centred on the cable.
    await selectCable(page, cable.id)
    await clickTestId(page, 'connection-temporal-delayed')
    cable = await cableRecord(page, 'estimate()', 'refine()')
    check('EV-3', 'the inspector marks the cable delayed', cable.temporal, 'delayed')
    paint = await painted(page, cable.id)
    check('EV-4', 'a delayed cable is dotted end to end', { segments: paint.segments, dash: paint.dash }, { segments: ['all'], dash: ['0.1 6'] })
    check('EV-5', 'the z⁻¹ pill sits on the middle of the cable', { pill: paint.pill, onPath: near(paint.pillCenter, paint.midpoint, 8) }, { pill: 'z⁻¹', onPath: true })
    await deselect(page, { x: 90, y: 940 })
    await shot(page, 'edge-vocabulary-2-delayed.png')
    await selectCable(page, cable.id)

    // 3 · The initial value, in the pill's grammar.
    await typeInto(page, 'connection-delay-value', '1.0')
    cable = await cableRecord(page, 'estimate()', 'refine()')
    paint = await painted(page, cable.id)
    check('EV-6', 'the initial value is stored and reads on the pill as z⁻¹ = 1.0', { delayValue: cable.delayValue, pill: paint.pill }, { delayValue: '1.0', pill: 'z⁻¹ = 1.0' })
    await deselect(page, { x: 90, y: 940 })
    await shot(page, 'edge-vocabulary-3-value.png')

    // 4 · Slide the pill along the cable by its handle, then centre it again.
    await selectCable(page, cable.id)
    paint = await painted(page, cable.id)
    const pillBefore = paint.pillCenter
    await dragHandle(page, pillBefore, { x: pillBefore.x + 150, y: pillBefore.y })
    cable = await cableRecord(page, 'estimate()', 'refine()')
    paint = await painted(page, cable.id)
    check('EV-7', 'dragging the pill slides it along the cable and stores the new fraction',
      { moved: cable.pillPosition > 0.6 && cable.pillPosition <= 0.95, pillFollowed: paint.pillCenter.x - pillBefore.x > 60 },
      { moved: true, pillFollowed: true })
    await shot(page, 'edge-vocabulary-4-dragged.png')
    await clickTestId(page, 'connection-pill-centre')
    cable = await cableRecord(page, 'estimate()', 'refine()')
    check('EV-8', '"Centre the pill" puts it back at the middle', cable.pillPosition, 0.5)

    // 5 · The Dev Hub switch: dotted before the pill, dashed after it.
    // Deselect first: a click on the canvas would close the panel, and the
    // judged frame must not carry tldraw's selection line over the dashes.
    await deselect(page, { x: 90, y: 940 })
    const trigger = await box(page, '.systemsketch-dev-trigger')
    await clickAt(page, trigger.cx, trigger.cy)
    await delay(320)
    await clickTestId(page, 'systemsketch-dev-dash-after-pill')
    paint = await painted(page, cable.id)
    const afterDash = (paint.dash[1] ?? '').split(' ').map(Number)
    check('EV-9', 'with the switch on the cable paints two segments: dots up to the pill, dashes after',
      { segments: paint.segments, afterStartsAtPill: afterDash[0] === 0 && afterDash[1] === 500, afterDashes: afterDash[2] > 0 },
      { segments: ['before', 'after'], afterStartsAtPill: true, afterDashes: true })
    check('EV-10', 'the switch is remembered in this browser',
      await evaluate(page, `JSON.parse(localStorage.getItem('systemsketch.cable-presentation.v1') || '{}').dashAfterPill`), true)
    await shot(page, 'edge-vocabulary-5-dash-after.png')
    await clickTestId(page, 'systemsketch-dev-dash-after-pill')
    paint = await painted(page, cable.id)
    check('EV-11', 'switching it off returns to one dotted path', paint.segments, ['all'])
    await clickAt(page, trigger.cx, trigger.cy)
    await delay(200)

    // 6 · Back to data: pill and dots gone.
    await selectCable(page, cable.id)
    await clickTestId(page, 'connection-temporal-data')
    cable = await cableRecord(page, 'estimate()', 'refine()')
    paint = await painted(page, cable.id)
    check('EV-12', 'marking the cable data again removes the pill and the dots', { temporal: cable.temporal, segments: paint.segments, pill: paint.pill }, { temporal: 'data', segments: [null], pill: null })

    // 7 · Persistence: delayed with a value, reload, still there.
    await clickTestId(page, 'connection-temporal-delayed')
    await typeInto(page, 'connection-delay-value', '1.0')
    await deselect(page, { x: 90, y: 940 })
    await delay(1400)
    await openApp(page, port, `?board=${encodeURIComponent(board)}`)
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-app"] .tl-container')`, 'product canvas')
    await waitFor(page, `document.querySelectorAll('[data-shape-type="connection"]').length >= 1`, 'cable restored', 10000)
    await delay(600)
    cable = await cableRecord(page, 'estimate()', 'refine()')
    paint = await painted(page, cable.id)
    check('EV-13', 'the delayed mark, its value and the pill survive a reload',
      { temporal: cable.temporal, delayValue: cable.delayValue, pillPosition: cable.pillPosition, pill: paint.pill, segments: paint.segments },
      { temporal: 'delayed', delayValue: '1.0', pillPosition: 0.5, pill: 'z⁻¹ = 1.0', segments: ['all'] })

    // 8 · A delayed cable into a Branch arm still obeys the active-path rule.
    await clickTestId(page, 'systemsketch-tool-system')
    await waitFor(page, `Array.from(document.querySelectorAll('.systemsketch-tool-menu__item')).some((n) => n.textContent.includes('Branch'))`, 'system menu')
    const branchItem = JSON.parse(await evaluate(page, `(() => {
      const item = Array.from(document.querySelectorAll('.systemsketch-tool-menu__item')).find((n) => n.textContent.includes('Branch'))
      const r = item.getBoundingClientRect(); return JSON.stringify({ cx: r.x + r.width / 2, cy: r.y + r.height / 2 })
    })()`))
    await clickAt(page, branchItem.cx, branchItem.cy)
    await delay(300)
    await dragBox(page, { x: 1000, y: 120 }, { x: 1480, y: 680 })
    await deselect(page, { x: 90, y: 940 })
    const branch = JSON.parse(await editorEval(page, `
      const branch = editor.getCurrentPageShapes().find((shape) => shape.type === 'branch')
      const bounds = editor.getShapePageBounds(branch)
      const bandH = 40, headerH = 32
      const tops = []
      let cursor = bounds.minY + bandH
      for (const arm of branch.props.arms) { tops.push(cursor + headerH); cursor += headerH + (arm.open ? arm.h : 0) }
      return JSON.stringify({ id: branch.id, arms: branch.props.arms.map((a) => a.id), x: bounds.minX, tops, zoom: editor.getZoomLevel(), cam: editor.getCamera() })`))
    const toScreen = (x, y) => ({ x: (x + branch.cam.x) * branch.zoom, y: (y + branch.cam.y) * branch.zoom })
    const armA = toScreen(branch.x + 140, branch.tops[0] + 20)
    const inner = await portBlock(page, armA, { x: armA.x + 250, y: armA.y + 130 }, 'merge()')
    await dragFrom(page, await box(page, portDot(refine, 'output', 'out_1')), await box(page, portDot(inner, 'input', 'in_1')))
    await deselect(page, { x: 90, y: 940 })
    let armCable = await cableRecord(page, 'refine()', 'merge()')
    // The cable's body lies inside the Branch, whose frame wins a click there;
    // select it by id (the thing under test is the fade, not the selection).
    await editorEval(page, `editor.select(${JSON.stringify(armCable.id)}); return true`)
    await waitFor(page, `document.querySelector('[data-testid="connection-inspector"]')`, 'connection inspector', 8000)
    await clickTestId(page, 'connection-temporal-delayed')
    await deselect(page, { x: 90, y: 940 })
    armCable = await cableRecord(page, 'refine()', 'merge()')
    check('EV-14', 'a cable into a Branch arm can be marked delayed', armCable.temporal, 'delayed')
    const band = await box(page, '.systemsketch-branch-canvas .Branch-band')
    await clickAt(page, band.x + band.w - 6, band.cy)
    await delay(260)
    await clickTestId(page, `branch-arm-active-${branch.arms[1]}`)
    await delay(260)
    paint = await painted(page, armCable.id)
    const armState = JSON.parse(await editorEval(page, `
      const b = editor.getCurrentPageShapes().find((s) => s.type === 'branch')
      const inner = editor.getShape(${JSON.stringify(inner)})
      return JSON.stringify({ active: b.props.activeArmId, innerParent: inner.parentId === b.id, innerArm: inner.meta.branchArm ?? null })`))
    check('EV-15', 'with the other arm active, the delayed cable fades with its arm and keeps its pill',
      { ...armState, opacity: Math.round(paint.opacity * 100) / 100, pill: paint.pill },
      { active: branch.arms[1], innerParent: true, innerArm: branch.arms[0], opacity: 0.18, pill: 'z⁻¹' })
    await shot(page, 'edge-vocabulary-6-branch-fade.png')

    check('EV-16', 'no console errors while driving', localConsoleErrors(page), [])
  } finally {
    app.close()
  }

  await writeFile(OUT, JSON.stringify(results, null, 2))
  const failed = results.filter((r) => !r.ok)
  console.log(`${results.length - failed.length}/${results.length} passed → ${OUT}`)
  process.exit(failed.length ? 1 : 0)
}

main().catch((error) => { console.error(error); process.exit(1) })
