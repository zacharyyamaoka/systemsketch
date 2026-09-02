#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const CREATE_FIXTURE = join(SCRIPT_DIR, 'create_fixture.mjs')

function usage() {
  return 'Usage: node create_layout_sweep.mjs [--count 6] [--seed 20260902] [--output-dir /tmp/systemsketch-review-fixture-sweep]'
}

function parseArguments(argv) {
  const result = {
    count: 6,
    seed: 20260902,
    outputDir: '/tmp/systemsketch-review-fixture-sweep',
  }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--count' || value === '--seed' || value === '--output-dir') {
      const next = argv[index + 1]
      if (!next) throw new Error(`${value} requires a value\n${usage()}`)
      if (value === '--count') result.count = Number(next)
      else if (value === '--seed') result.seed = Number(next)
      else result.outputDir = next
      index += 1
    } else if (value === '--help' || value === '-h') {
      process.stdout.write(`${usage()}\n`)
      process.exit(0)
    } else throw new Error(`unknown argument: ${value}\n${usage()}`)
  }
  if (!Number.isInteger(result.count) || result.count < 1 || result.count > 24) {
    throw new Error('--count must be an integer from 1 to 24')
  }
  if (!Number.isInteger(result.seed)) throw new Error('--seed must be an integer')
  return result
}

function mulberry32(seed) {
  return () => {
    seed |= 0
    seed = seed + 0x6d2b79f5 | 0
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed)
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}

function pick(random, values) {
  return values[Math.floor(random() * values.length)]
}

function integer(random, minimum, maximum) {
  return Math.floor(random() * (maximum - minimum + 1)) + minimum
}

function inside(path, parent) {
  const offset = relative(resolve(parent), resolve(path))
  return offset === '' || (!offset.startsWith('..') && !isAbsolute(offset))
}

const STEP_TEXT = [
  'Click the highlighted edge control; confirm the attached cue stays clear of the label.',
  'Drag this Block toward the open canvas, then release when the alignment guide appears.',
  'Open the contextual control and choose the second visible option in the menu.',
  'Double-click the title, replace the name, and press Enter to commit the edit.',
  'Use the edge target once, then click it again to restore the original visible state.',
  'Select this object and use the blue plus control to add one named connection point.',
]

function makeCallout({ id, index, anchor, x, y, w, h, dy = 0, dx = 0, random }) {
  return {
    id,
    kind: 'step',
    text: `${index} · ${pick(random, STEP_TEXT)}`,
    x,
    y,
    w,
    h,
    target: { shapeId: 'subject', anchor, dx, dy },
  }
}

function makeRecipe(random, boardIndex) {
  const viewport = { width: 1680, height: 1200 }
  const subject = {
    x: integer(random, 560, 640),
    y: integer(random, 300, 360),
    w: integer(random, 320, 400),
    h: integer(random, 180, 230),
  }
  const cardWidth = integer(random, 360, 430)
  const cardHeight = integer(random, 110, 145)
  const sides = boardIndex % 3 === 0
    ? ['left', 'right', 'right', 'bottom']
    : boardIndex % 3 === 1
      ? ['left', 'top', 'right', 'bottom']
      : ['left', 'left', 'right', 'top']
  const counts = { left: 0, right: 0, top: 0, bottom: 0 }
  const totals = sides.reduce((result, side) => ({ ...result, [side]: result[side] + 1 }), {
    left: 0, right: 0, top: 0, bottom: 0,
  })
  const callouts = []

  for (const [zeroIndex, anchor] of sides.entries()) {
    const sideIndex = counts[anchor]++
    const laneOffset = (sideIndex - (totals[anchor] - 1) / 2) * 72 + integer(random, -6, 6)
    const index = zeroIndex + 1
    if (anchor === 'left') {
      callouts.push(makeCallout({
        id: `step-${index}`, index, anchor, random, w: cardWidth, h: cardHeight,
        x: 40,
        y: subject.y - 45 + sideIndex * (cardHeight + 72),
        dy: laneOffset,
      }))
    } else if (anchor === 'right') {
      callouts.push(makeCallout({
        id: `step-${index}`, index, anchor, random, w: cardWidth, h: cardHeight,
        x: subject.x + subject.w + 150,
        y: subject.y - 45 + sideIndex * (cardHeight + 72),
        dy: laneOffset,
      }))
    } else if (anchor === 'top') {
      callouts.push(makeCallout({
        id: `step-${index}`, index, anchor, random, w: cardWidth, h: cardHeight,
        x: subject.x - 45 + sideIndex * (cardWidth + 72),
        y: 35,
        dx: laneOffset,
      }))
    } else {
      callouts.push(makeCallout({
        id: `step-${index}`, index, anchor, random, w: cardWidth, h: cardHeight,
        x: subject.x - 45 + sideIndex * (cardWidth + 72),
        y: subject.y + subject.h + 145,
        dx: laneOffset,
      }))
    }
  }
  callouts.push({
    id: 'pass',
    kind: 'pass',
    text: 'PASS WHEN · Every instruction remains readable, every orange arrow meets its target edge at a right angle, and moving the Block keeps the arrow attached.',
    x: 50,
    y: 1010,
    w: 760,
    h: 125,
  })

  return {
    feature: `Review fixture layout sweep ${boardIndex + 1}`,
    viewport,
    shapes: [{
      id: 'subject',
      type: 'block',
      x: subject.x,
      y: subject.y,
      props: {
        title: pick(random, ['decode()', 'estimate()', 'publish()', 'route()']),
        description: 'Randomized review-layout interaction target',
        blockType: 'Function',
        view: 'port',
        w: subject.w,
        h: subject.h,
        inputs: [{ id: 'in_1', name: 'input', type: 'Frame', visible: true }],
        outputs: [{ id: 'out_1', name: 'result', type: 'Pose', visible: true }],
      },
    }],
    bindings: [],
    callouts,
  }
}

async function main() {
  const args = parseArguments(process.argv.slice(2))
  const outputDir = resolve(args.outputDir)
  if (!inside(outputDir, tmpdir())) {
    throw new Error(`layout sweeps are disposable and must stay inside ${tmpdir()}`)
  }
  const random = mulberry32(args.seed)
  await mkdir(outputDir, { recursive: true })
  const boards = []
  for (let index = 0; index < args.count; index += 1) {
    const basename = `layout-${String(index + 1).padStart(2, '0')}`
    const recipePath = join(outputDir, `${basename}.recipe.json`)
    const boardPath = join(outputDir, `${basename}.systemsketch`)
    const recipe = makeRecipe(random, index)
    await writeFile(recipePath, `${JSON.stringify(recipe, null, 2)}\n`, 'utf8')
    execFileSync(process.execPath, [
      CREATE_FIXTURE,
      '--recipe', recipePath,
      '--output', boardPath,
    ], { stdio: 'inherit' })
    boards.push({ recipe: recipePath, board: boardPath, screenshot: boardPath.replace(/\.systemsketch$/, '.png') })
  }
  const manifestPath = join(outputDir, 'manifest.json')
  await writeFile(manifestPath, `${JSON.stringify({ seed: args.seed, boards }, null, 2)}\n`, 'utf8')
  process.stdout.write(`${manifestPath}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
