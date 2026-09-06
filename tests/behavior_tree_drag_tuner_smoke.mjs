/**
 * The Drag Model Tuner, driven in a real browser.
 *
 * Zach's 2026-09-06 ask after reviewing dual-drag live: SEE the snap/capture
 * boundaries (layered on the drag-model overlay), tune every feel parameter
 * with live sliders, and copy the values as text to paste back into chat.
 * This journey proves each surface against the editor, not the pixels:
 *
 *   1. the Dev panel's "Drag Model Tuner" button opens the panel and turns
 *      the overlay master on;
 *   2. the measured swap-cost table is real (three scenarios, and top-down
 *      capture measurably above left-right at defaults — the orientation
 *      finding from his recordings, recomputed live in the panel);
 *   3. every overlay layer has an independent switch;
 *   4. threshold lines paint at rest, and mid-drag the active container
 *      shows the labeled release boundary plus the climb ring;
 *   5. a slider changes the REAL drag: with capture padding +80 a drag past
 *      the default capture distance commits nothing; after Reset the same
 *      travel commits — the knob is wired into resolution, not just paint;
 *   6. the Copy surface exports tuning JSON + the measured readouts.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  clickElement,
  delay,
  evaluate,
  localConsoleErrors,
  mouse,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'
import { SHOTS } from './block_journey_helpers.mjs'

const OUT = join(SHOTS, 'behavior-tree-drag-tuner')
const REGION = 'shape:bt-tuner'

const results = []
const pending = []
let journeyError = null

function check(id, label, observed, desired) {
  const ok = JSON.stringify(observed) === JSON.stringify(desired)
  results.push({ id, label, observed, desired, ok })
  process.stdout.write(`  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}\n`
    + (ok ? '' : `        observed=${JSON.stringify(observed)} desired=${JSON.stringify(desired)}\n`))
  return ok
}

async function shot(page, name) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  pending.push({ name, data: Buffer.from(capture.data, 'base64') })
}

const regionXml = (page) => evaluate(page, `window.__systemsketch.editor.getShape('${REGION}')?.props.xml ?? ''`)

async function createRegion(page, xml, patch = {}) {
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    editor.deleteShapes([...editor.getCurrentPageShapeIds()])
    editor.createShape({ id: '${REGION}', type: 'behaviorTree', x: 200, y: 160, props: { ...${JSON.stringify(patch)}, xml: ${JSON.stringify(xml)}, title: 'Tuner' } })
    editor.selectNone()
    return null
  })()`)
  await waitFor(page, `window.__systemsketch.editor.getSortedChildIdsForParent('${REGION}').length > 0`, 'the region to project')
  await delay(300)
}

async function fitRegion(page) {
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const bounds = editor.getShapePageBounds('${REGION}')
    editor.zoomToBounds(bounds, { inset: 80, animation: { duration: 0 } })
    return null
  })()`)
  await delay(250)
}

async function nodeInfo(page, path) {
  return JSON.parse(await evaluate(page, `JSON.stringify((() => {
    const editor = window.__systemsketch.editor
    const id = editor.getSortedChildIdsForParent('${REGION}').find((candidate) => {
      const shape = editor.getShape(candidate)
      return shape.meta.btRole === 'node' && shape.meta.btPath === ${JSON.stringify(path)}
    })
    if (!id) return null
    const bounds = editor.getShapePageBounds(id)
    const centre = editor.pageToScreen({ x: bounds.minX + bounds.width / 2, y: bounds.minY + bounds.height / 2 })
    return { id, centre: { x: centre.x, y: centre.y }, zoom: editor.getZoomLevel() }
  })())`))
}

async function scrollTo(page, selector) {
  await evaluate(page, `(document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({ block: 'center' }), null)`)
  await delay(120)
}

async function setSlider(page, key, value) {
  await evaluate(page, `(() => {
    const input = document.querySelector('[data-testid="bt-drag-tuner-knob-${key}"]')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, ${JSON.stringify(String(value))})
    input.dispatchEvent(new Event('input', { bubbles: true }))
    return input.value
  })()`)
  await delay(120)
}

async function slowDrag(page, from, to, steps) {
  await mouse(page, 'mouseMoved', from.x, from.y)
  await mouse(page, 'mousePressed', from.x, from.y, { buttons: 1 })
  await delay(60)
  for (let step = 1; step <= steps; step += 1) {
    await mouse(page, 'mouseMoved', from.x + (to.x - from.x) * step / steps, from.y + (to.y - from.y) * step / steps, { buttons: 1 })
    await delay(35)
  }
  await mouse(page, 'mouseReleased', to.x, to.y)
  await delay(350)
}

async function main() {
  await mkdir(OUT, { recursive: true })
  const app = await startApp({ label: 'bt-drag-tuner', build: 'bt-drag-tuner-smoke', width: 1680, height: 1050 })
  const { page, port } = app
  try {
    await openApp(page, port, '')
    await waitFor(page, 'Boolean(window.__systemsketch?.editor)', 'editor to mount')
    await delay(400)
    const sampleXml = await evaluate(page, 'window.__systemsketch.behaviorTree.SAMPLE_BEHAVIOR_TREE_XML')
    // The complaint configuration: top-down, spacing 2 — and Auto layout OFF,
    // so opening the tuner has something to switch on (check `open.auto-layout`).
    await createRegion(page, sampleXml, { projection: 'tree', orientation: 'down', nodeFace: 'simple', spacingScale: 2, arrangement: 'free' })
    await fitRegion(page)

    const openTuner = async () => {
      await clickElement(page, '.systemsketch-dev-trigger')
      await waitFor(page, `Boolean(document.querySelector('[data-testid="systemsketch-dev-drag-tuner"]'))`, 'the Dev panel tuner button')
      await clickElement(page, '[data-testid="systemsketch-dev-drag-tuner"]')
      await waitFor(page, `Boolean(document.querySelector('[data-testid="bt-drag-tuner"]'))`, 'the tuner panel')
      await delay(250)
    }

    // 1. Open the tuner from the Dev panel.
    await openTuner()
    check('open.panel', 'the Dev button opens the tuner panel', await evaluate(page, `document.querySelectorAll('[data-testid="bt-drag-tuner"]').length`), 1)
    check('open.overlay-forced-on', 'opening the tuner turns the overlay master on',
      await evaluate(page, `Boolean(document.querySelector('[data-testid="bt-drag-model-overlay"]'))`), true)
    // Zach, 2026-09-06: the tuner is meaningless against a free-arrangement
    // region — no slot is ever captured — so opening it arms Auto layout on
    // the subject region exactly as it arms the overlay master.
    check('open.auto-layout-forced-on', 'opening the tuner turns the subject region’s Auto layout on',
      await evaluate(page, `window.__systemsketch.editor.getShape('${REGION}').props.arrangement`), 'tidy')

    // 1a. The contextual Behavior Tree dock is suppressed while the tuner is
    //     open, and comes back the instant it closes. It floats over the
    //     selection — which during tuning is the region the overlay is drawing
    //     on — so it always lands on the marks this panel exists to show.
    const pillState = async () => JSON.parse(await evaluate(page, `JSON.stringify((() => {
      const pill = document.querySelector('[data-testid="systemsketch-selection-menu"]')
      return { present: Boolean(pill), bt: Boolean(document.querySelector('.bt-mini-menu')), visible: pill?.dataset.visible ?? null }
    })())`))
    await evaluate(page, `(window.__systemsketch.editor.select('${REGION}'), null)`)
    await delay(300)
    const pillWhileOpen = await pillState()
    await shot(page, 'dock-hidden-tuner-open.png')
    await clickElement(page, '[aria-label="Close the Drag Model Tuner"]')
    await waitFor(page, `!document.querySelector('[data-testid="bt-drag-tuner"]')`, 'the tuner to close')
    await delay(350)
    const pillWhileClosed = await pillState()
    await shot(page, 'dock-back-tuner-closed.png')
    check('dock.hidden-while-tuner-open', 'the Behavior Tree pill does not render while the tuner is open',
      pillWhileOpen, { present: false, bt: false, visible: null })
    check('dock.returns-when-tuner-closes', 'closing the tuner restores the pill for the same selection',
      pillWhileClosed, { present: true, bt: true, visible: 'true' })
    await openTuner()
    check('dock.hidden-again-on-reopen', 'reopening the tuner suppresses it again — nothing is persisted',
      (await pillState()).present, false)

    // 1b. The Auto layout override, relocated into the tuner: the pill that
    //     used to carry it is now hidden, and a control you cannot reach is
    //     not an override. Same component, same command, third home.
    const REGION_TOGGLE = '[data-testid="bt-drag-tuner-region"] [data-testid="bt-auto-layout-toggle"]'
    check('toggle.lives-in-the-tuner', 'the tuner carries exactly one Auto layout switch, next to the region it names',
      JSON.parse(await evaluate(page, `JSON.stringify({
        toggles: document.querySelectorAll('${REGION_TOGGLE}').length,
        names: document.querySelectorAll('[data-testid="bt-drag-tuner-region-name"]').length,
      })`)), { toggles: 1, names: 1 })
    await clickElement(page, REGION_TOGGLE)
    await delay(400)
    check('toggle.turns-auto-layout-off', 'switching it off writes the region and withdraws the measured table',
      JSON.parse(await evaluate(page, `JSON.stringify({
        arrangement: window.__systemsketch.editor.getShape('${REGION}').props.arrangement,
        pressed: document.querySelector('${REGION_TOGGLE}').getAttribute('aria-pressed'),
        tables: document.querySelectorAll('[data-testid="bt-drag-tuner-table"]').length,
        empty: document.querySelector('[data-testid="bt-drag-tuner-empty"]')?.textContent ?? null,
      })`)),
      {
        arrangement: 'free',
        pressed: 'false',
        tables: 0,
        empty: 'Auto layout is off for this region — turn it on above to measure a swap.',
      })
    await clickElement(page, REGION_TOGGLE)
    await waitFor(page, `document.querySelectorAll('[data-testid="bt-drag-tuner-table"]').length === 1`, 'the measured table to return')
    check('toggle.turns-auto-layout-back-on', 'switching it on restores the arrangement and the table',
      JSON.parse(await evaluate(page, `JSON.stringify({
        arrangement: window.__systemsketch.editor.getShape('${REGION}').props.arrangement,
        pressed: document.querySelector('${REGION_TOGGLE}').getAttribute('aria-pressed'),
      })`)), { arrangement: 'tidy', pressed: 'true' })
    await evaluate(page, `(window.__systemsketch.editor.selectNone(), null)`)
    await delay(250)

    // 2. The measured table is real, and repeats the orientation finding.
    await waitFor(page, `document.querySelectorAll('[data-testid="bt-drag-tuner-table"] tbody tr').length >= 3`, 'the measured table')
    const tableNumbers = JSON.parse(await evaluate(page, `JSON.stringify((() => {
      const rows = [...document.querySelectorAll('[data-testid="bt-drag-tuner-table"] tbody tr')]
      return rows.map((row) => {
        const cells = row.querySelectorAll('td b')
        return {
          scenario: row.querySelector('th').childNodes[0].textContent,
          path: row.querySelector('th small').textContent,
          down: Number.parseInt(cells[0].textContent, 10),
          right: Number.parseInt(cells[1].textContent, 10),
        }
      })
    })())`))
    check('measured.rows', 'three scenarios are measured', tableNumbers.length, 3)
    check('measured.orientation-finding', 'top-down capture cost exceeds left-right in every scenario at defaults',
      tableNumbers.every((row) => Number.isFinite(row.down) && Number.isFinite(row.right) && row.down > row.right * 1.5), true)
    await shot(page, 'tuner-open.png')

    // 3. Independent layer switches.
    await clickElement(page, '[data-testid="bt-drag-tuner-layer-containers"]')
    await delay(150)
    check('layers.containers-off', 'unchecking Containers removes zones while slots stay',
      JSON.parse(await evaluate(page, `JSON.stringify({
        zones: document.querySelectorAll('.BehaviorTree-dragModelZone').length,
        slots: document.querySelectorAll('.BehaviorTree-dragModelSlot').length > 0,
      })`)),
      { zones: 0, slots: true })
    await clickElement(page, '[data-testid="bt-drag-tuner-layer-containers"]')
    await delay(150)
    check('layers.containers-back', 'rechecking restores the zones',
      (await evaluate(page, `document.querySelectorAll('.BehaviorTree-dragModelZone').length`)) > 0, true)

    // 4. Threshold lines at rest; release + climb mid-drag.
    check('thresholds.at-rest', 'capture lines paint at rest',
      (await evaluate(page, `document.querySelectorAll('.BehaviorTree-dragModelThreshold[data-kind="capture"]').length`)) > 0, true)

    // 4a. The overlay answers "what are the spacings" IN NUMBERS at rest.
    //     Zach's 2026-09-06 review: with all four layers on and no drag
    //     running, the drawing was unreadable and no spacing could be read off
    //     it. Every container now carries its derived gap / slot / column
    //     extent, and one real inter-member gap per container is dimensioned.
    // The plate stacks one number per line, so read the lines back joined —
    // the assertion then holds in either orientation rather than pinning the
    // one-line layout a left-to-right tree has no room for.
    const restNumbers = JSON.parse(await evaluate(page, `JSON.stringify((() => {
      const chips = [...document.querySelectorAll('[data-testid="bt-drag-model-chip"]')]
        .map((g) => [...g.querySelectorAll('[data-role="metrics"]')].map((t) => t.textContent).join(' | '))
      return {
        chips: chips.length,
        allCarryNumbers: chips.length > 0 && chips.every((text) => /slot \\d+/.test(text) && /col \\d+/.test(text)),
        anyGapMeasured: chips.some((text) => /gap \\d+/.test(text)),
        dimensions: [...document.querySelectorAll('[data-testid="bt-drag-model-gap"] text')].map((t) => t.textContent),
      }
    })())`))
    check('numbers.chips-carry-real-metrics', 'every container plate prints its slot extent and column width',
      restNumbers.allCarryNumbers && restNumbers.chips > 0, true)
    check('numbers.gap-is-dimensioned', 'at least one real inter-member gap is drawn with its px on it',
      restNumbers.dimensions.length > 0 && restNumbers.dimensions.every((text) => /^\d+px$/.test(text)), true)
    // A single-member list has no inner gap; printing `0` would claim its
    // members are touching, so it must say there is nothing to measure.
    check('numbers.single-member-list-says-nothing-to-measure', 'a one-member container reports an em dash, never a measured 0',
      JSON.parse(await evaluate(page, `JSON.stringify([...document.querySelectorAll('[data-testid="bt-drag-model-chip"] [data-role="metrics"]')]
        .every((t) => t.textContent.trim() !== 'gap 0'))`)), true)

    // 4b. Labels keep a constant SCREEN size. They paint in region space, so
    //     before the counter-scale a whole framed tree rendered them at ~5px.
    const labelHeight = async () => Number(await evaluate(page,
      `document.querySelector('[data-testid="bt-drag-model-chip"] [data-role="metrics"]').getBoundingClientRect().height`))
    const heightAtFit = await labelHeight()
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const camera = editor.getCamera()
      editor.setCamera({ x: camera.x, y: camera.y, z: camera.z / 2 }, { animation: { duration: 0 } })
      return null
    })()`)
    await delay(200)
    const heightZoomedOut = await labelHeight()
    check('labels.readable-at-fit', 'a container plate reads at 10px or more on screen', heightAtFit >= 10, true)
    check('labels.scale-invariant', 'halving the canvas zoom does not shrink the label',
      Math.abs(heightZoomedOut - heightAtFit) < 1.5, true)
    await fitRegion(page)

    // 4c. The overlay is ABOVE every shape, not inside one.
    //     Zach, 2026-09-06: "all this overlay should be at a higher z level
    //     than what you're doing." Painting inside the region's SVG put it
    //     under the region's own projected node cards, which are real shapes;
    //     no z-index within that SVG could win. Asserted structurally — the
    //     marks must have no `.tl-shape` ancestor at all — because an opacity
    //     or ordering check would still pass from the wrong layer.
    check('surface.outside-every-shape', 'the overlay has no shape ancestor and lives in the in-front layer',
      JSON.parse(await evaluate(page, `JSON.stringify((() => {
        const mark = document.querySelector('[data-testid="bt-drag-model-overlay"]')
        return {
          mounted: Boolean(mark),
          insideAShape: Boolean(mark?.closest('.tl-shape')),
          insideSurface: Boolean(mark?.closest('[data-testid="bt-drag-model-surface"]')),
          afterTheCanvas: Boolean(document.querySelector('.tl-canvas')?.compareDocumentPosition(
            document.querySelector('[data-testid="bt-drag-model-surface"]')) & Node.DOCUMENT_POSITION_FOLLOWING),
        }
      })())`)),
      { mounted: true, insideAShape: false, insideSurface: true, afterTheCanvas: true })

    // 4d. Fade the tree: a scrim over the real cards, under every debug mark.
    const setFade = async (value) => {
      await evaluate(page, `(() => {
        const input = document.querySelector('[data-testid="bt-drag-tuner-fade"]')
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setter.call(input, ${JSON.stringify(String(value))})
        input.dispatchEvent(new Event('input', { bubbles: true }))
        return null
      })()`)
      await delay(180)
    }
    await setFade(0.6)
    const fadedOn = JSON.parse(await evaluate(page, `JSON.stringify({
      scrims: document.querySelectorAll('[data-testid="bt-drag-model-scrim"]').length,
      readout: document.querySelector('[data-testid="bt-drag-tuner-value-treeFade"]').textContent,
    })`))
    await setFade(0)
    const fadedOff = await evaluate(page, `document.querySelectorAll('[data-testid="bt-drag-model-scrim"]').length`)
    check('fade.paints-a-scrim', 'the fade knob paints one scrim per region and reports its percentage',
      fadedOn, { scrims: 1, readout: '60%' })
    check('fade.zero-paints-nothing', 'at 0 the scrim is not in the DOM at all', fadedOff, 0)

    // 4e. FOCUS VIEW. Pointing at a knob lights only what that knob controls.
    //     Every knob must light SOMETHING: the first implementation ghosted the
    //     whole overlay for Claim distance and drew nothing, because that knob
    //     is a pointer threshold with no tree geometry — it needed its own mark.
    const focusRows = ['claimDistancePx', 'capturePaddingPx', 'releaseFactor', 'releasePaddingPx', 'climbSlots', 'zoneOverhangSlots']
    const focusReport = {}
    for (const knob of focusRows) {
      const at = JSON.parse(await evaluate(page, `JSON.stringify((() => {
        const row = document.querySelector('[data-testid="bt-drag-tuner-knobrow-${knob}"]')
        row.scrollIntoView({ block: 'center' })
        const box = row.getBoundingClientRect()
        return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + 10) }
      })())`))
      // A REAL pointer move: React synthesizes pointerenter from pointerover,
      // so a hand-dispatched enter event never reaches the handler.
      await mouse(page, 'mouseMoved', at.x, Math.max(0, at.y - 140))
      await mouse(page, 'mouseMoved', at.x, at.y)
      await delay(200)
      focusReport[knob] = JSON.parse(await evaluate(page, `JSON.stringify((() => {
        const root = document.querySelector('[data-testid="bt-drag-model-overlay"]')
        let lit = 0
        let ghosted = 0
        for (const el of document.querySelectorAll('[data-lit]')) {
          if (el.dataset.lit === 'true') lit += 1
          else if (el.dataset.lit === 'false') ghosted += 1
        }
        return { focus: root?.dataset.focus ?? null, preview: root?.dataset.preview === 'true', lit, ghosted }
      })())`))
    }
    await mouse(page, 'mouseMoved', 1200, 980)
    await delay(150)
    check('focus.every-knob-lights-something', 'pointing at any knob lights at least one mark and ghosts the rest',
      focusRows.filter((knob) => !(focusReport[knob].focus === knob && focusReport[knob].lit > 0 && focusReport[knob].ghosted > 0)), [])
    // Deadband and climb have no geometry until a card moves; at rest the
    // overlay stands in a real member so the knob is still learnable.
    check('focus.preview-for-the-drag-only-knobs', 'the three drag-only knobs synthesize a preview card at rest',
      ['releaseFactor', 'releasePaddingPx', 'climbSlots'].filter((knob) => !focusReport[knob].preview), [])
    check('focus.clears-on-leave', 'moving off the knobs clears the focus',
      await evaluate(page, `document.querySelector('[data-testid="bt-drag-model-overlay"]').dataset.focus`), 'none')

    const dragNode = await nodeInfo(page, '0.2')
    let midDrag = null
    await mouse(page, 'mouseMoved', dragNode.centre.x, dragNode.centre.y)
    await mouse(page, 'mousePressed', dragNode.centre.x, dragNode.centre.y, { buttons: 1 })
    for (let step = 1; step <= 8; step += 1) {
      await mouse(page, 'mouseMoved', dragNode.centre.x + step * 12, dragNode.centre.y, { buttons: 1 })
      await delay(40)
    }
    midDrag = JSON.parse(await evaluate(page, `JSON.stringify({
      release: document.querySelectorAll('.BehaviorTree-dragModelThreshold[data-kind="release"]').length > 0,
      releaseLabel: /release \\d+px/.test([...document.querySelectorAll('.BehaviorTree-dragModelThreshold text')].map((t) => t.textContent).join(' ')),
      climb: document.querySelectorAll('[data-testid="bt-drag-model-climb"]').length,
    })`))
    // Every layer must be telling APART from every other one. Read live off
    // the painted elements, mid-drag, when all of them exist at once — the
    // climb ring shipped in an amber 17 degrees of hue from the slot orange,
    // and nothing in the build could see that the two layers were one mark.
    const inks = JSON.parse(await evaluate(page, `JSON.stringify((() => {
      const ink = (selector, property) => {
        const el = document.querySelector(selector)
        return el ? getComputedStyle(el)[property] : null
      }
      return {
        zone: ink('.BehaviorTree-dragModelZone rect', 'fill'),
        seam: ink('.BehaviorTree-dragModelEdge[data-kind="seam"], .BehaviorTree-dragModelEdge', 'stroke'),
        bound: ink('.BehaviorTree-dragModelBound', 'stroke'),
        slot: ink('.BehaviorTree-dragModelSlot rect', 'stroke'),
        capture: ink('.BehaviorTree-dragModelThreshold[data-kind="capture"] line', 'stroke'),
        release: ink('.BehaviorTree-dragModelThreshold[data-kind="release"] line', 'stroke'),
        climb: ink('[data-testid="bt-drag-model-climb"]', 'stroke'),
      }
    })())`))
    // Opaque hue, ignoring the alpha each layer tunes for its own weight.
    const hue = (value) => {
      const parts = String(value).match(/[\d.]+/g)
      if (!parts || parts.length < 3) return value
      const [red, green, blue] = parts.slice(0, 3).map(Number)
      const max = Math.max(red, green, blue)
      const min = Math.min(red, green, blue)
      if (max === min) return 'grey'
      const span = max - min
      const raw = max === red ? (green - blue) / span : max === green ? 2 + (blue - red) / span : 4 + (red - green) / span
      return Math.round(((raw * 60) + 360) % 360)
    }
    const inkHues = Object.fromEntries(Object.entries(inks).map(([layer, value]) => [layer, hue(value)]))
    const families = ['zone', 'slot', 'capture', 'release', 'climb']
    const tooClose = []
    for (const one of families) {
      for (const other of families) {
        if (one >= other) continue
        const apart = Math.min(Math.abs(inkHues[one] - inkHues[other]), 360 - Math.abs(inkHues[one] - inkHues[other]))
        if (!Number.isFinite(apart) || apart < 40) tooClose.push(`${one}/${other} ${apart}°`)
      }
    }
    await shot(page, 'tuner-mid-drag.png')
    await mouse(page, 'mouseReleased', dragNode.centre.x + 96, dragNode.centre.y)
    await delay(350)
    check('thresholds.mid-drag', 'mid-drag the active container shows a labeled release boundary and the climb ring',
      midDrag, { release: true, releaseLabel: true, climb: 1 })
    check('ink.every-layer-is-painted', 'every layer paints with an ink the browser can report',
      Object.entries(inks).filter(([, value]) => !value || value === 'none').map(([layer]) => layer), [])
    check('ink.hues-are-40-degrees-apart', 'no two layers share a hue', tooClose, [])
    // A fresh region for the tuning test — deterministic start, no undo games.
    await createRegion(page, sampleXml, { projection: 'tree', orientation: 'down', nodeFace: 'simple', spacingScale: 2 })
    await fitRegion(page)

    // 5. A knob changes the real drag. The probe is the SUBTREE HEAD row on
    //    purpose: its depth strip holds a single container, so at this travel
    //    the only structural boundary is the capture threshold itself — a
    //    deep leaf's travel would legally cross into the sibling container's
    //    zone, which no capture knob should gate. The tuner panel eats
    //    pointer events on its own surface (left side), so pan the card
    //    clear of it first.
    const tunedRow = tableNumbers.find((row) => row.scenario === 'subtree head')
    check('knob.probe-found', 'the subtree-head scenario is measured', Boolean(tunedRow), true)
    let probe = await nodeInfo(page, tunedRow.path)
    if (probe.centre.x < 420) {
      await evaluate(page, `(() => {
        const editor = window.__systemsketch.editor
        const camera = editor.getCamera()
        editor.setCamera({ x: camera.x + ${JSON.stringify(440)} / camera.z, y: camera.y, z: camera.z })
        return null
      })()`)
      await delay(250)
      probe = await nodeInfo(page, tunedRow.path)
    }
    check('knob.probe-clear', 'the probed card sits clear of the tuner panel', probe.centre.x > 400, true)
    const rootLeafCapturePagePx = tunedRow.down
    const screenTravel = (rootLeafCapturePagePx + 30) * probe.zoom
    const xmlBefore = await regionXml(page)
    // A rightward swap from home adjudicates on the DISPLACED side of the
    // deadband (hello-pangea's asymmetry: toward the list end the trailing
    // edge must pass center + displacement), so the knob that governs this
    // gesture is the deadband padding — the very parameter the
    // orientation-sensitivity complaint maps to.
    await setSlider(page, 'releasePaddingPx', 240)
    check('knob.applied', 'the deadband-padding slider reports its value',
      await evaluate(page, `document.querySelector('[data-testid="bt-drag-tuner-value-releasePaddingPx"]').textContent`), '240')
    await slowDrag(page, probe.centre, { x: probe.centre.x + screenTravel, y: probe.centre.y }, 10)
    check('knob.suppresses-capture', 'with +240px deadband padding, travel past the default swap point commits nothing',
      (await regionXml(page)) === xmlBefore, true)
    await scrollTo(page, '[data-testid="bt-drag-tuner-reset"]')
    await clickElement(page, '[data-testid="bt-drag-tuner-reset"]')
    await delay(200)
    const probeAfterReset = await nodeInfo(page, tunedRow.path)
    await slowDrag(page, probeAfterReset.centre, { x: probeAfterReset.centre.x + screenTravel, y: probeAfterReset.centre.y }, 10)
    check('knob.default-captures', 'after Reset the exact same travel commits a reorder',
      (await regionXml(page)) === xmlBefore, false)

    // 6. The copy surface exports tuning + readouts.
    await scrollTo(page, '[data-testid="bt-drag-tuner-copy"]')
    await clickElement(page, '[data-testid="bt-drag-tuner-copy"]')
    await delay(200)
    const exportText = await evaluate(page, `document.querySelector('[data-testid="bt-drag-tuner-export"]').value`)
    check('copy.export', 'the export carries the tuning JSON and the measured readouts',
      exportText.includes('"tuning"') && exportText.includes('claimDistancePx') && exportText.includes('down capture'), true)
    check('copy.feedback', 'the button acknowledges the copy', await evaluate(page, `document.querySelector('[data-testid="bt-drag-tuner-copy"]').textContent`), 'Copied ✓')

    check('console', 'no local console errors', await localConsoleErrors(page), [])
  } catch (error) {
    journeyError = error
    process.stderr.write(`journey aborted: ${error?.stack ?? error}\n`)
    try {
      const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
      await writeFile('/tmp/bt-drag-tuner-abort.png', Buffer.from(capture.data, 'base64'))
    } catch { /* the page may be gone */ }
  } finally {
    const passed = results.filter((entry) => entry.ok).length
    const summary = { generatedAt: new Date().toISOString(), passed, total: results.length, results, aborted: journeyError ? String(journeyError) : null }
    if (passed === results.length && !journeyError) {
      for (const entry of pending) await writeFile(join(OUT, entry.name), entry.data)
      await writeFile(join(OUT, 'acceptance.json'), JSON.stringify(summary, null, 2))
    } else {
      await writeFile(join(OUT, 'acceptance.failed.json'), JSON.stringify(summary, null, 2))
      for (const entry of pending) await writeFile(join('/tmp', `bt-drag-tuner-failed-${entry.name}`), entry.data)
    }
    process.stdout.write(`\n${passed}/${results.length} checks passed\n`)
    app.close()
    process.exit(passed === results.length && !journeyError ? 0 : 1)
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`)
  process.exit(1)
})
