#!/usr/bin/env node

import { constants as fsConstants } from 'node:fs'
import { access, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'

import {
  delay,
  evaluate,
  localConsoleErrors,
  openApp,
  startApp,
  waitFor,
} from '../../../tests/browser_harness.mjs'

function usage() {
  return 'Usage: node create_fixture.mjs --recipe RECIPE.json --output BOARD.systemsketch [--screenshot BOARD.png] [--force]'
}

function parseArguments(argv) {
  const result = { force: false }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--force') result.force = true
    else if (value === '--recipe' || value === '--output' || value === '--screenshot') {
      const next = argv[index + 1]
      if (!next) throw new Error(`${value} requires a path\n${usage()}`)
      result[value.slice(2)] = next
      index += 1
    } else if (value === '--help' || value === '-h') {
      process.stdout.write(`${usage()}\n`)
      process.exit(0)
    } else throw new Error(`unknown argument: ${value}\n${usage()}`)
  }
  if (!result.recipe || !result.output) throw new Error(usage())
  return result
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be a finite number`)
}

function localId(value, label) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9_-]*$/i.test(value)) {
    throw new Error(`${label} must use letters, digits, underscores, or hyphens`)
  }
}

function validateRecipe(recipe) {
  if (!isRecord(recipe)) throw new Error('recipe must be a JSON object')
  if (typeof recipe.feature !== 'string' || !recipe.feature.trim()) throw new Error('recipe.feature is required')
  if (!Array.isArray(recipe.shapes) || recipe.shapes.length === 0) {
    throw new Error('recipe.shapes must contain at least one real interaction target')
  }
  if (!Array.isArray(recipe.callouts) || recipe.callouts.length === 0) {
    throw new Error('recipe.callouts must contain at least one numbered instruction')
  }
  if (recipe.bindings !== undefined && !Array.isArray(recipe.bindings)) {
    throw new Error('recipe.bindings must be an array when present')
  }
  const ids = new Set()
  for (const [index, shape] of recipe.shapes.entries()) {
    if (!isRecord(shape)) throw new Error(`shapes[${index}] must be an object`)
    localId(shape.id, `shapes[${index}].id`)
    if (ids.has(shape.id)) throw new Error(`duplicate local id: ${shape.id}`)
    ids.add(shape.id)
    if (typeof shape.type !== 'string' || !shape.type) throw new Error(`shapes[${index}].type is required`)
    finite(shape.x ?? 0, `shapes[${index}].x`)
    finite(shape.y ?? 0, `shapes[${index}].y`)
  }
  let targetedStep = false
  let passCard = false
  for (const [index, callout] of recipe.callouts.entries()) {
    if (!isRecord(callout)) throw new Error(`callouts[${index}] must be an object`)
    localId(callout.id, `callouts[${index}].id`)
    if (ids.has(`cue-${callout.id}`)) throw new Error(`duplicate callout id: ${callout.id}`)
    ids.add(`cue-${callout.id}`)
    if (!['step', 'note', 'pass'].includes(callout.kind)) {
      throw new Error(`callouts[${index}].kind must be step, note, or pass`)
    }
    if (typeof callout.text !== 'string' || !callout.text.trim()) {
      throw new Error(`callouts[${index}].text is required`)
    }
    for (const key of ['x', 'y', 'w', 'h']) finite(callout[key], `callouts[${index}].${key}`)
    if (callout.target !== undefined) {
      if (!isRecord(callout.target)) throw new Error(`callouts[${index}].target must be an object`)
      if (typeof callout.target.shapeId === 'string') {
        if (!ids.has(callout.target.shapeId)) throw new Error(`unknown target shape: ${callout.target.shapeId}`)
      } else {
        finite(callout.target.x, `callouts[${index}].target.x`)
        finite(callout.target.y, `callouts[${index}].target.y`)
      }
      if (callout.kind === 'step') targetedStep = true
    }
    if (callout.kind === 'pass') passCard = true
  }
  if (!targetedStep) throw new Error('at least one step callout must point at its interaction target')
  if (!passCard) throw new Error('add a pass callout with the visible success condition')
  if (recipe.viewport !== undefined) {
    if (!isRecord(recipe.viewport)) throw new Error('recipe.viewport must be an object')
    finite(recipe.viewport.width, 'recipe.viewport.width')
    finite(recipe.viewport.height, 'recipe.viewport.height')
  }
}

async function exists(path) {
  try {
    await access(path, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

function inside(path, parent) {
  const offset = relative(resolve(parent), resolve(path))
  return offset === '' || (!offset.startsWith('..') && !isAbsolute(offset))
}

async function atomicWrite(path, bytes) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`)
  await writeFile(temporary, bytes)
  await rename(temporary, path)
}

async function main() {
  const args = parseArguments(process.argv.slice(2))
  const recipePath = resolve(args.recipe)
  const outputPath = resolve(args.output)
  const screenshotPath = resolve(args.screenshot ?? outputPath.replace(/\.systemsketch$/i, '.png'))
  const personalBoards = join(homedir(), 'SystemSketch')

  if (extname(outputPath).toLowerCase() !== '.systemsketch') {
    throw new Error('output must end in .systemsketch')
  }
  if (inside(outputPath, personalBoards)) {
    throw new Error(`refusing to write a generated fixture inside the personal board directory: ${personalBoards}`)
  }
  for (const path of [outputPath, screenshotPath]) {
    if (!args.force && await exists(path)) throw new Error(`${path} already exists; pass --force only to replace this fixture intentionally`)
  }

  const recipe = JSON.parse(await readFile(recipePath, 'utf8'))
  validateRecipe(recipe)
  const width = Math.max(900, Math.round(recipe.viewport?.width ?? 1280))
  const height = Math.max(700, Math.round(recipe.viewport?.height ?? 720))
  const app = await startApp({
    label: 'systemsketch-review-fixture',
    build: 'systemsketch-review-fixture',
    width,
    height,
  })
  const scratchPath = join(app.filesRoot, 'SystemSketch', basename(outputPath))
  const { page, port } = app

  try {
    await openApp(page, port, `?board=${encodeURIComponent(scratchPath)}`)
    await waitFor(page, 'window.__systemsketch?.editor', 'the real SystemSketch editor')

    const created = await evaluate(page, `(() => {
      const recipe = ${JSON.stringify(recipe)}
      const editor = window.__systemsketch.editor
      const shapeId = (id) => id.startsWith('shape:') ? id : \`shape:\${id}\`
      const bindingId = (id) => id.startsWith('binding:') ? id : \`binding:\${id}\`
      const parentId = (id) => id.startsWith('page:') || id.startsWith('shape:') ? id : shapeId(id)
      const toRichText = (text) => ({
        type: 'doc',
        content: String(text).split('\\n').map((line) => line
          ? { type: 'paragraph', content: [{ type: 'text', text: line }] }
          : { type: 'paragraph' }),
      })
      const normalizeShape = (shape) => {
        const { id, parentId: parent, text, props = {}, ...rest } = shape
        const normalizedProps = { ...props }
        if (typeof text === 'string') normalizedProps.richText = toRichText(text)
        return {
          ...rest,
          id: shapeId(id),
          ...(parent ? { parentId: parentId(parent) } : {}),
          props: normalizedProps,
        }
      }
      editor.createShapes(recipe.shapes.map(normalizeShape))
      if (recipe.bindings?.length) {
        editor.createBindings(recipe.bindings.map((binding) => ({
          ...binding,
          id: bindingId(binding.id),
          fromId: shapeId(binding.fromId),
          toId: shapeId(binding.toId),
        })))
      }

      const colors = { step: 'orange', note: 'blue', pass: 'green' }
      const cueShapes = recipe.callouts.map((callout) => ({
        id: shapeId(\`cue-\${callout.id}\`),
        type: 'geo',
        x: callout.x,
        y: callout.y,
        props: {
          geo: 'rectangle',
          w: callout.w,
          h: callout.h,
          color: colors[callout.kind],
          labelColor: 'black',
          fill: 'semi',
          dash: 'draw',
          size: 'm',
          font: 'sans',
          align: 'start',
          verticalAlign: 'middle',
          richText: toRichText(callout.text),
        },
      }))
      editor.createShapes(cueShapes)

      const targetPoint = (target) => {
        if (typeof target.shapeId !== 'string') return { x: target.x, y: target.y }
        const bounds = editor.getShapePageBounds(shapeId(target.shapeId))
        if (!bounds) throw new Error(\`missing target bounds for \${target.shapeId}\`)
        const anchor = target.anchor ?? 'center'
        const point = anchor === 'top' ? { x: bounds.midX, y: bounds.minY }
          : anchor === 'right' ? { x: bounds.maxX, y: bounds.midY }
          : anchor === 'bottom' ? { x: bounds.midX, y: bounds.maxY }
          : anchor === 'left' ? { x: bounds.minX, y: bounds.midY }
          : { x: bounds.midX, y: bounds.midY }
        return { x: point.x + (target.dx ?? 0), y: point.y + (target.dy ?? 0) }
      }
      const arrowIds = []
      for (const callout of recipe.callouts.filter((item) => item.target)) {
        const target = targetPoint(callout.target)
        const center = { x: callout.x + callout.w / 2, y: callout.y + callout.h / 2 }
        const dx = target.x - center.x
        const dy = target.y - center.y
        const start = Math.abs(dx) >= Math.abs(dy)
          ? { x: dx >= 0 ? callout.x + callout.w : callout.x, y: center.y }
          : { x: center.x, y: dy >= 0 ? callout.y + callout.h : callout.y }
        const id = shapeId(\`cue-\${callout.id}-arrow\`)
        arrowIds.push(id)
        editor.createShape({
          id,
          type: 'arrow',
          x: 0,
          y: 0,
          props: {
            start,
            end: target,
            color: 'orange',
            dash: 'draw',
            size: 'm',
            fill: 'none',
            arrowheadStart: 'none',
            arrowheadEnd: 'arrow',
            richText: toRichText(''),
          },
        })
      }
      if (arrowIds.length) editor.sendToBack(arrowIds)
      editor.selectNone()
      editor.zoomToFit({ animation: { duration: 0 } })
      return {
        count: editor.getCurrentPageShapes().length,
        ids: editor.getCurrentPageShapes().map((shape) => shape.id).sort(),
      }
    })()`)

    const expectedShapes = recipe.shapes.length + recipe.callouts.length
      + recipe.callouts.filter((callout) => callout.target).length
    if (created.count !== expectedShapes) {
      throw new Error(`editor created ${created.count} shapes; expected ${expectedShapes}`)
    }
    await waitFor(page,
      `document.querySelector('.systemsketch-file-title i')?.dataset.state === 'clean'`,
      'fixture autosave')
    await waitFor(page, `window.__systemsketch.editor.getCurrentPageShapes().length === ${expectedShapes}`,
      'the complete saved scene')
    await delay(250)

    await openApp(page, port, `?board=${encodeURIComponent(scratchPath)}`)
    await waitFor(page,
      `window.__systemsketch?.editor?.getCurrentPageShapes().length === ${expectedShapes}`,
      'the cold-reopened fixture')
    await delay(350)

    const documentBytes = await readFile(scratchPath)
    const document = JSON.parse(documentBytes)
    if (Object.keys(document)[0] !== 'systemSketch') throw new Error('saved fixture does not lead with the systemSketch envelope')
    if (document.systemSketch?.application !== 'SystemSketch' || document.systemSketch?.formatVersion !== 1) {
      throw new Error('saved fixture has an invalid SystemSketch manifest')
    }
    const savedShapes = document.records.filter((record) => record.typeName === 'shape').length
    if (savedShapes !== expectedShapes) throw new Error(`saved fixture contains ${savedShapes} shapes; expected ${expectedShapes}`)
    const errors = localConsoleErrors(page)
    if (errors.length) throw new Error(`browser console errors: ${errors.join('; ')}`)

    const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await atomicWrite(outputPath, documentBytes)
    await atomicWrite(screenshotPath, Buffer.from(capture.data, 'base64'))
    const boardSize = (await stat(outputPath)).size
    const screenshotSize = (await stat(screenshotPath)).size
    process.stdout.write(`${JSON.stringify({
      feature: recipe.feature,
      output: outputPath,
      screenshot: screenshotPath,
      shapes: savedShapes,
      bindings: document.records.filter((record) => record.typeName === 'binding').length,
      boardBytes: boardSize,
      screenshotBytes: screenshotSize,
      verified: 'cold-reopen',
    }, null, 2)}\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
