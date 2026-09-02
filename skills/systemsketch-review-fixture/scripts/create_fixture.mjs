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
import { validateRecipe } from './layout_quality.mjs'

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
        if (typeof target.shapeId !== 'string') return { point: { x: target.x, y: target.y } }
        const bounds = editor.getShapePageBounds(shapeId(target.shapeId))
        if (!bounds) throw new Error(\`missing target bounds for \${target.shapeId}\`)
        const anchor = target.anchor
        const point = anchor === 'top' ? { x: bounds.midX, y: bounds.minY }
          : anchor === 'right' ? { x: bounds.maxX, y: bounds.midY }
          : anchor === 'bottom' ? { x: bounds.midX, y: bounds.maxY }
          : anchor === 'left' ? { x: bounds.minX, y: bounds.midY }
          : { x: bounds.midX, y: bounds.midY }
        const adjusted = { x: point.x + (target.dx ?? 0), y: point.y + (target.dy ?? 0) }
        return {
          point: adjusted,
          shapeId: shapeId(target.shapeId),
          bounds,
          normalizedAnchor: {
            x: Math.max(0, Math.min(1, (adjusted.x - bounds.minX) / bounds.w)),
            y: Math.max(0, Math.min(1, (adjusted.y - bounds.minY) / bounds.h)),
          },
        }
      }
      const cueAnchorForTarget = (anchor) => anchor === 'left' ? { x: 1, y: 0.5 }
        : anchor === 'right' ? { x: 0, y: 0.5 }
        : anchor === 'top' ? { x: 0.5, y: 1 }
        : { x: 0.5, y: 0 }
      const cuePointForTarget = (callout, anchor) => anchor === 'left'
        ? { x: callout.x + callout.w, y: callout.y + callout.h / 2 }
        : anchor === 'right'
          ? { x: callout.x, y: callout.y + callout.h / 2 }
          : anchor === 'top'
            ? { x: callout.x + callout.w / 2, y: callout.y + callout.h }
            : { x: callout.x + callout.w / 2, y: callout.y }
      const outsideTargetEdge = (callout, target) => {
        if (!target.bounds) return true
        const center = { x: callout.x + callout.w / 2, y: callout.y + callout.h / 2 }
        const anchor = callout.target.anchor
        return anchor === 'left' ? center.x < target.bounds.minX
          : anchor === 'right' ? center.x > target.bounds.maxX
          : anchor === 'top' ? center.y < target.bounds.minY
          : center.y > target.bounds.maxY
      }
      const arrowIds = []
      for (const callout of recipe.callouts.filter((item) => item.target)) {
        const target = targetPoint(callout.target)
        if (!outsideTargetEdge(callout, target)) {
          throw new Error(\`cue \${callout.id} is not outside its target's \${callout.target.anchor} edge\`)
        }
        const cueAnchor = typeof callout.target.shapeId === 'string'
          ? cueAnchorForTarget(callout.target.anchor)
          : (() => {
              const center = { x: callout.x + callout.w / 2, y: callout.y + callout.h / 2 }
              const dx = target.point.x - center.x
              const dy = target.point.y - center.y
              return Math.abs(dx) >= Math.abs(dy)
                ? { x: dx >= 0 ? 1 : 0, y: 0.5 }
                : { x: 0.5, y: dy >= 0 ? 1 : 0 }
            })()
        const start = typeof callout.target.shapeId === 'string'
          ? cuePointForTarget(callout, callout.target.anchor)
          : { x: callout.x + callout.w * cueAnchor.x, y: callout.y + callout.h * cueAnchor.y }
        const id = shapeId(\`cue-\${callout.id}-arrow\`)
        arrowIds.push(id)
        editor.createShape({
          id,
          type: 'arrow',
          x: start.x,
          y: start.y,
          props: {
            kind: 'elbow',
            start: { x: 0, y: 0 },
            end: { x: target.point.x - start.x, y: target.point.y - start.y },
            color: 'orange',
            dash: 'draw',
            size: 'm',
            fill: 'none',
            arrowheadStart: 'none',
            arrowheadEnd: 'arrow',
            richText: toRichText(''),
          },
        })
        const arrowBindings = [{
          id: bindingId(\`cue-\${callout.id}-arrow-start\`),
          type: 'arrow',
          fromId: id,
          toId: shapeId(\`cue-\${callout.id}\`),
          props: {
            terminal: 'start',
            normalizedAnchor: cueAnchor,
            isExact: false,
            isPrecise: true,
            snap: 'edge-point',
          },
        }]
        if (target.shapeId) {
          arrowBindings.push({
            id: bindingId(\`cue-\${callout.id}-arrow-end\`),
            type: 'arrow',
            fromId: id,
            toId: target.shapeId,
            props: {
              terminal: 'end',
              normalizedAnchor: target.normalizedAnchor,
              isExact: false,
              isPrecise: true,
              snap: 'edge-point',
            },
          })
        }
        editor.createBindings(arrowBindings)
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

    const motionProbe = recipe.callouts.find((callout) => typeof callout.target?.shapeId === 'string')
    if (motionProbe) {
      const followed = await evaluate(page, `(() => {
        const editor = window.__systemsketch.editor
        const targetId = ${JSON.stringify(`shape:${motionProbe.target.shapeId}`)}
        const arrowId = ${JSON.stringify(`shape:cue-${motionProbe.id}-arrow`)}
        const target = editor.getShape(targetId)
        const endpoint = () => {
          const arrow = editor.getShape(arrowId)
          const handle = editor.getShapeHandles(arrow)?.find((item) => item.id === 'end')
          if (!arrow || !handle) throw new Error('missing bound arrow end handle')
          return editor.getShapePageTransform(arrowId).applyToPoint(handle)
        }
        const before = endpoint()
        try {
          editor.updateShape({ id: target.id, type: target.type, x: target.x + 64 })
          const after = endpoint()
          return { dx: after.x - before.x, dy: after.y - before.y }
        } finally {
          editor.updateShape({ id: target.id, type: target.type, x: target.x })
        }
      })()`)
      if (Math.abs(followed.dx - 64) > 1 || Math.abs(followed.dy) > 1) {
        throw new Error(`bound cue did not follow its target: moved ${followed.dx.toFixed(2)}, ${followed.dy.toFixed(2)}`)
      }
      await waitFor(page,
        `document.querySelector('.systemsketch-file-title i')?.dataset.state === 'clean'`,
        'fixture autosave after bound-arrow motion probe')
      await delay(250)
    }

    const documentBytes = await readFile(scratchPath)
    const document = JSON.parse(documentBytes)
    if (Object.keys(document)[0] !== 'systemSketch') throw new Error('saved fixture does not lead with the systemSketch envelope')
    if (document.systemSketch?.application !== 'SystemSketch' || document.systemSketch?.formatVersion !== 1) {
      throw new Error('saved fixture has an invalid SystemSketch manifest')
    }
    const savedShapes = document.records.filter((record) => record.typeName === 'shape').length
    if (savedShapes !== expectedShapes) throw new Error(`saved fixture contains ${savedShapes} shapes; expected ${expectedShapes}`)
    const expectedCueBindings = recipe.callouts.reduce((count, callout) => {
      if (!callout.target) return count
      return count + (typeof callout.target.shapeId === 'string' ? 2 : 1)
    }, 0)
    const savedBindings = document.records.filter((record) => record.typeName === 'binding')
    const expectedBindings = (recipe.bindings?.length ?? 0) + expectedCueBindings
    if (savedBindings.length !== expectedBindings) {
      throw new Error(`saved fixture contains ${savedBindings.length} bindings; expected ${expectedBindings}`)
    }
    for (const callout of recipe.callouts.filter((item) => item.target)) {
      const arrowId = `shape:cue-${callout.id}-arrow`
      const arrow = document.records.find((record) => record.id === arrowId)
      if (arrow?.type !== 'arrow' || arrow.props?.kind !== 'elbow') {
        throw new Error(`cue ${callout.id} did not persist as a stock elbow arrow`)
      }
      const cueBindings = savedBindings.filter((binding) => binding.type === 'arrow' && binding.fromId === arrowId)
      const startBinding = cueBindings.find((binding) => binding.props?.terminal === 'start')
      if (startBinding?.toId !== `shape:cue-${callout.id}`) {
        throw new Error(`cue ${callout.id} arrow start is not bound to its card`)
      }
      if (typeof callout.target.shapeId === 'string') {
        const endBinding = cueBindings.find((binding) => binding.props?.terminal === 'end')
        const targetId = callout.target.shapeId.startsWith('shape:')
          ? callout.target.shapeId
          : `shape:${callout.target.shapeId}`
        if (endBinding?.toId !== targetId) {
          throw new Error(`cue ${callout.id} arrow end is not bound to ${targetId}`)
        }
        const anchor = endBinding.props?.normalizedAnchor
        const onNamedEdge = callout.target.anchor === 'left' ? anchor?.x === 0
          : callout.target.anchor === 'right' ? anchor?.x === 1
          : callout.target.anchor === 'top' ? anchor?.y === 0
          : anchor?.y === 1
        if (!onNamedEdge) throw new Error(`cue ${callout.id} arrow did not persist on the named target edge`)
      }
    }
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
      bindings: savedBindings.length,
      cueBindings: expectedCueBindings,
      boardBytes: boardSize,
      screenshotBytes: screenshotSize,
      verified: motionProbe ? 'cold-reopen+bound-motion' : 'cold-reopen',
    }, null, 2)}\n`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
