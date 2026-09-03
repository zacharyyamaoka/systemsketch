#!/usr/bin/env node
/** Fifty deterministic, painted-path collision-routing scenarios in the real app. */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  delay,
  ensureDir,
  evaluate,
  key,
  localConsoleErrors,
  openApp,
  shortcut,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const ASSETS = join(ROOT, 'docs', 'assets')
const RESULTS = join(ASSETS, 'collision-routing-stress-results.json')
const REPRESENTATIVE = new Set([0, 9, 19, 29, 39, 40, 45, 49])

function blockScenario(index) {
  const source = { x: 40, y: 260, w: 240, h: 170 }
  const targetOffset = [-220, -140, -70, 0, 70, 140, 220][index % 7]
  const target = { x: 1040, y: source.y + targetOffset, w: 240, h: 170 }
  const obstacles = []

  if (index < 30) {
    const count = 1 + (index % 5)
    const rails = [340, 465, 590, 715, 825]
    for (let obstacleIndex = 0; obstacleIndex < count; obstacleIndex += 1) {
      const targetRail = source.y + 84 + targetOffset
      const sourceRail = source.y + 84
      const bias = obstacleIndex === 0 ? 0 : [-150, 130, -90, 170][(index + obstacleIndex) % 4]
      const rail = obstacleIndex < 2 ? sourceRail : targetRail
      obstacles.push({
        x: rails[obstacleIndex] + (index % 3) * 11,
        y: rail - 82 + bias,
        w: 90 + ((index * 17 + obstacleIndex * 23) % 90),
        h: 164 + ((index * 29 + obstacleIndex * 31) % 150),
      })
    }
  } else if (index < 35) {
    // Source-side obstacles invade the default 24px dongle without touching the card.
    obstacles.push({
      x: source.x + source.w + 26 + (index - 30) * 4,
      y: source.y - 30,
      w: 120 + (index - 30) * 18,
      h: 250,
    })
    obstacles.push({ x: 650, y: target.y + 20, w: 130, h: 230 })
  } else {
    // Target-side variants exercise the symmetric shortened entry dongle.
    const gap = 26 + (index - 35) * 4
    const width = 120 + (index - 35) * 18
    obstacles.push({
      x: target.x - gap - width,
      y: target.y - 30,
      w: width,
      h: 250,
    })
    obstacles.push({ x: 470, y: source.y - 130, w: 150, h: 210 })
  }

  return {
    number: index + 1,
    name: index < 30
      ? `Block field ${String(index + 1).padStart(2, '0')}: ${obstacles.length} obstacle${obstacles.length === 1 ? '' : 's'}, offset ${targetOffset}`
      : index < 35
        ? `Source dongle squeeze ${index - 29}`
        : `Target dongle squeeze ${index - 34}`,
    kind: 'blocks', source, target, obstacles,
  }
}

function branchScenario(index) {
  const variant = index - 40
  const targetArm = variant % 2 === 0 ? 'arm_2' : 'arm_1'
  const firstH = 150 + (variant % 3) * 35
  const secondH = 150 + ((variant + 1) % 3) * 35
  const branch = {
    x: 470 + (variant % 2) * 45,
    y: 100 + (variant % 3) * 25,
    w: 560 + (variant % 4) * 45,
    h: 40 + 32 + firstH + 32 + secondH,
    firstH,
    secondH,
  }
  const targetY = targetArm === 'arm_1' ? 72 + 20 + (variant % 3) * 10 : 104 + firstH + 20 + (variant % 3) * 10
  return {
    number: index + 1,
    name: `Branch target ${variant + 1}: ${targetArm}, ${firstH}/${secondH}px arms`,
    kind: 'branch',
    source: { x: 40, y: 180 + (variant % 4) * 55, w: 240, h: 170 },
    branch,
    targetArm,
    target: { x: 220 + (variant % 3) * 35, y: targetY, w: 240, h: 130 },
  }
}

const SCENARIOS = [
  ...Array.from({ length: 40 }, (_, index) => blockScenario(index)),
  ...Array.from({ length: 10 }, (_, offset) => branchScenario(40 + offset)),
]

async function runTidy(page) {
  await shortcut(page, 'p', 'KeyP', 2)
  await waitFor(page, `document.querySelector('[aria-label="Search commands"]')`, 'command palette')
  await page.send('Input.insertText', { text: 'tidy edges' })
  await waitFor(page, `document.querySelector('[data-command-id="tidy-edges"]')`, 'Tidy edges command')
  await key(page, 'Enter', 'Enter')
  await waitFor(page, `!document.querySelector('[data-testid="systemsketch-command-palette"]')`, 'Tidy completion')
  await delay(100)
}

async function capture(page, path) {
  const screenshot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(path, Buffer.from(screenshot.data, 'base64'))
}

async function dismissNotifications(page) {
  await evaluate(page, `(() => {
    for (const button of document.querySelectorAll('button')) {
      if (button.textContent?.trim() === 'Close') button.click()
    }
  })()`)
  await delay(40)
}

async function paintedPathSamples(page, shapeId) {
  return JSON.parse(await evaluate(page, `(() => {
    const path = document.querySelector('[data-shape-id="${shapeId}"] path')
    if (!path) throw new Error('missing painted path ${shapeId}')
    const matrix = path.getScreenCTM()
    const length = path.getTotalLength()
    const samples = []
    for (let index = 0; index <= 800; index += 1) {
      const point = path.getPointAtLength(length * index / 800)
      const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix)
      samples.push({ x: screen.x, y: screen.y })
    }
    return JSON.stringify(samples)
  })()`))
}

async function rectFor(page, selector) {
  return JSON.parse(await evaluate(page, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)})
    if (!element) throw new Error('missing element ' + ${JSON.stringify(selector)})
    const rect = element.getBoundingClientRect()
    return JSON.stringify({ x: rect.x, y: rect.y, w: rect.width, h: rect.height })
  })()`))
}

async function rectsFor(page, selector) {
  return JSON.parse(await evaluate(page, `JSON.stringify(Array.from(
    document.querySelectorAll(${JSON.stringify(selector)}),
    (element) => { const rect = element.getBoundingClientRect(); return { x: rect.x, y: rect.y, w: rect.width, h: rect.height } }
  ))`))
}

function pathHitsRect(points, rect, inset = 1.5) {
  return points.some((point) => point.x > rect.x + inset && point.x < rect.x + rect.w - inset
    && point.y > rect.y + inset && point.y < rect.y + rect.h - inset)
}

async function seed(page, scenario) {
  const ids = await evaluate(page, `((scenario) => {
    const editor = window.__systemsketch.editor
    editor.deleteShapes(editor.getCurrentPageShapes().map((shape) => shape.id))
    const suffix = String(scenario.number).padStart(2, '0')
    const block = (id, rect, title, inputs, outputs, parentId, meta) => ({
      id, type: 'block', x: rect.x, y: rect.y, parentId, meta,
      props: {
        w: rect.w, h: rect.h, title, view: 'port',
        inputs: inputs.map((name, index) => ({ id: 'in' + index, name, type: 'Data', visible: true })),
        outputs: outputs.map((name, index) => ({ id: 'out' + index, name, type: 'Data', visible: true })),
      },
    })
    const sourceId = 'shape:stress-source-' + suffix
    const targetId = 'shape:stress-target-' + suffix
    const edgeId = 'shape:stress-edge-' + suffix
    const source = block(sourceId, scenario.source, 'source_' + suffix + '()', [], ['data'])
    let target
    const shapes = [source]
    const obstacleIds = []
    if (scenario.kind === 'blocks') {
      target = block(targetId, scenario.target, 'target_' + suffix + '()', ['data'], [])
      shapes.push(target)
      scenario.obstacles.forEach((rect, index) => {
        const id = 'shape:stress-obstacle-' + suffix + '-' + index
        obstacleIds.push(id)
        shapes.push(block(id, rect, 'obstacle_' + suffix + '_' + index + '()', [], []))
      })
    } else {
      const branchId = 'shape:stress-branch-' + suffix
      const branch = {
        id: branchId, type: 'branch', x: scenario.branch.x, y: scenario.branch.y,
        props: {
          w: scenario.branch.w, h: scenario.branch.h, title: 'Branch ' + suffix,
          view: 'expanded', activeArmId: null, controls: [],
          arms: [
            { id: 'arm_1', title: 'if', open: true, h: scenario.branch.firstH },
            { id: 'arm_2', title: 'else', open: true, h: scenario.branch.secondH },
          ],
        },
      }
      shapes.push(branch)
      target = block(targetId, scenario.target, 'target_' + suffix + '()', ['data'], [], branchId, { branchArm: scenario.targetArm })
      shapes.push(target)
    }
    const edge = {
      id: edgeId, type: 'connection', x: 0, y: 0,
      props: {
        start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, routing: 'elbow', curve: null,
        pins: [], elbowRoute: null, routeMode: 'automatic',
      },
    }
    editor.run(() => {
      editor.createShapes(shapes)
      editor.createShape(edge)
      editor.createBindings([
        { type: 'connection', fromId: edgeId, toId: sourceId,
          props: { portId: 'out0', terminal: 'start', face: 'outer' } },
        { type: 'connection', fromId: edgeId, toId: targetId,
          props: { portId: 'in0', terminal: 'end', face: 'outer' } },
      ])
    })
    editor.select(edgeId)
    editor.zoomToFit({ animation: { duration: 0 }, inset: 90 })
    return JSON.stringify({ sourceId, targetId, edgeId, obstacleIds,
      branchId: scenario.kind === 'branch' ? 'shape:stress-branch-' + suffix : null })
  })(${JSON.stringify(scenario)})`)
  return JSON.parse(ids)
}

async function forbiddenRects(page, scenario, ids) {
  if (scenario.kind === 'blocks') {
    return Promise.all(ids.obstacleIds.map((id) => rectFor(
      page,
      `[data-shape-id="${id}"] .systemsketch-block-canvas`,
    )))
  }
  const branchSelector = `[data-shape-id="${ids.branchId}"]`
  const branch = await rectFor(page, `${branchSelector} .systemsketch-branch-canvas`)
  const band = await rectFor(page, `${branchSelector} .Branch-band`)
  const headers = await rectsFor(page, `${branchSelector} .Branch-armHeader`)
  assert.equal(headers.length, 2)
  const siblingBody = scenario.targetArm === 'arm_2'
    ? { x: branch.x, y: headers[0].y + headers[0].h, w: branch.w, h: headers[1].y - headers[0].y - headers[0].h }
    : { x: branch.x, y: headers[1].y + headers[1].h, w: branch.w, h: branch.y + branch.h - headers[1].y - headers[1].h }
  return [band, ...headers, siblingBody]
}

async function shapePositions(page, ids) {
  return JSON.parse(await evaluate(page, `JSON.stringify(${JSON.stringify(ids)}.map((id) => {
    const shape = window.__systemsketch.editor.getShape(id)
    return { id, x: shape.x, y: shape.y, parentId: shape.parentId }
  }))`))
}

async function main() {
  assert.equal(SCENARIOS.length, 50)
  await ensureDir(ASSETS)
  const app = await startApp({
    label: 'systemsketch-collision-routing-stress',
    build: 'collision-routing-stress',
    width: 1500,
    height: 980,
  })
  const board = join(app.filesRoot, 'SystemSketch', 'collision-routing-stress.systemsketch')
  const results = []
  try {
    await ensureDir(join(app.filesRoot, 'SystemSketch'))
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, 'window.__systemsketch?.editor', 'stress editor', 30_000)

    for (const scenario of SCENARIOS) {
      await dismissNotifications(app.page)
      const ids = await seed(app.page, scenario)
      await waitFor(app.page,
        `document.querySelector('[data-shape-id="${ids.edgeId}"] path')`,
        `painted scenario ${scenario.number}`,
      )
      await delay(80)
      const forbidden = await forbiddenRects(app.page, scenario, ids)
      const beforeSamples = await paintedPathSamples(app.page, ids.edgeId)
      const beforeHits = forbidden.filter((rect) => pathHitsRect(beforeSamples, rect)).length
      const fixedIds = [ids.sourceId, ids.targetId, ...ids.obstacleIds, ...(ids.branchId ? [ids.branchId] : [])]
      const positionsBefore = await shapePositions(app.page, fixedIds)
      const propsBefore = await evaluate(app.page,
        `JSON.stringify(window.__systemsketch.editor.getShape('${ids.edgeId}').props)`)

      if (REPRESENTATIVE.has(scenario.number - 1)) {
        await capture(app.page, join(ASSETS, `collision-routing-stress-${String(scenario.number).padStart(2, '0')}-before.png`))
      }
      await runTidy(app.page)
      const afterSamples = await paintedPathSamples(app.page, ids.edgeId)
      const afterHits = forbidden.filter((rect) => pathHitsRect(afterSamples, rect)).length
      if (afterHits > 0) {
        await capture(app.page, join(ASSETS, `collision-routing-stress-failure-${String(scenario.number).padStart(2, '0')}.png`))
      }
      assert.equal(afterHits, 0, `${scenario.name} still crosses ${afterHits} forbidden region(s)`)
      assert.deepEqual(await shapePositions(app.page, fixedIds), positionsBefore, `${scenario.name} moved a shape`)

      const propsAfter = await evaluate(app.page,
        `JSON.stringify(window.__systemsketch.editor.getShape('${ids.edgeId}').props)`)
      const parsedAfter = JSON.parse(propsAfter)
      assert.equal(parsedAfter.routeMode, 'automatic', `${scenario.name} changed route ownership`)
      if (beforeHits > 0) assert.notEqual(propsAfter, propsBefore, `${scenario.name} left a colliding route unchanged`)

      await dismissNotifications(app.page)
      await runTidy(app.page)
      const propsAfterSecondTidy = await evaluate(app.page,
        `JSON.stringify(window.__systemsketch.editor.getShape('${ids.edgeId}').props)`)
      assert.equal(propsAfterSecondTidy, propsAfter, `${scenario.name} is not idempotent`)
      const secondTidySamples = await paintedPathSamples(app.page, ids.edgeId)
      assert.equal(forbidden.filter((rect) => pathHitsRect(secondTidySamples, rect)).length, 0)

      if (REPRESENTATIVE.has(scenario.number - 1)) {
        await capture(app.page, join(ASSETS, `collision-routing-stress-${String(scenario.number).padStart(2, '0')}-after.png`))
      }
      await dismissNotifications(app.page)
      results.push({
        number: scenario.number,
        name: scenario.name,
        kind: scenario.kind,
        obstacleCount: forbidden.length,
        collisionCountBefore: beforeHits,
        collisionCountAfter: afterHits,
        changed: propsAfter !== propsBefore,
        idempotent: propsAfterSecondTidy === propsAfter,
        routeMode: parsedAfter.routeMode,
        cornerCount: parsedAfter.elbowRoute?.corners?.length ?? 0,
        status: 'PASS',
      })
      process.stdout.write(`  PASS ${String(scenario.number).padStart(2, '0')}/50  ${scenario.name}\n`)
    }

    assert.deepEqual(localConsoleErrors(app.page), [])
    await writeFile(RESULTS, `${JSON.stringify({ scenarioCount: results.length, results }, null, 2)}\n`)
    process.stdout.write(`\n  50/50 rendered routing scenarios passed\n  ${RESULTS}\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`\n  FAIL  ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
