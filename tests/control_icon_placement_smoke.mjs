#!/usr/bin/env node
/**
 * End-to-end proof for the source-backed control-icon contract. The fixture is
 * authored by the real editor, the Python CLI writes its metadata, and a fresh
 * real browser reads only that persisted metadata back into Loop / Branch UI.
 */
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  delay,
  evaluate,
  localConsoleErrors,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const FIXTURE = join(ROOT, 'sketches', 'review', 'control-icon-placement.recipe.json')
const FIXTURE_HELPER = join(ROOT, 'skills', 'systemsketch-review-fixture', 'scripts', 'create_fixture.mjs')
const PLACER = join(ROOT, 'scripts', 'place_control_icons.py')
const FROZEN_RULE_DIR = join(ROOT, 'docs')
const SHOT = join(ROOT, 'docs', 'assets', 'control-icon-placement-acceptance.png')
const OUT = join(ROOT, 'docs', 'assets', 'control-icon-placement-acceptance.json')
const REVIEW_OUTPUT = process.env.SYSTEMSKETCH_CONTROL_ICON_REVIEW_OUTPUT
const REVIEW_SCREENSHOT = REVIEW_OUTPUT?.replace(/\.systemsketch$/i, '.png')

const CASES = [
  {
    id: 'c1',
    sourceCase: 'c1_shared_header_via_except',
    owners: { 'c1.loop': { shapeId: 'shape:c1-loop' } },
  },
  {
    id: 'c2',
    sourceCase: 'c2_single_arm_break',
    owners: {
      'c2.loop': { shapeId: 'shape:c2-loop' },
      'c2.loop.branch0.arm0': { shapeId: 'shape:c2-branch', armId: 'arm_1' },
      'c2.loop.branch0.arm1': { shapeId: 'shape:c2-branch', armId: 'arm_2' },
      'c2.loop.branch0.arm2': { shapeId: 'shape:c2-branch', armId: 'arm_3' },
    },
  },
  {
    id: 'c3',
    sourceCase: 'c3_single_arm_continue',
    owners: {
      'c3.loop': { shapeId: 'shape:c3-loop' },
      'c3.loop.branch0.arm0': { shapeId: 'shape:c3-branch', armId: 'arm_1' },
      'c3.loop.branch0.arm1': { shapeId: 'shape:c3-branch', armId: 'arm_2' },
      'c3.loop.branch0.arm2': { shapeId: 'shape:c3-branch', armId: 'arm_3' },
    },
  },
  {
    id: 'c4',
    sourceCase: 'c4_two_arms_no_bleed',
    owners: {
      'c4.loop': { shapeId: 'shape:c4-loop' },
      'c4.loop.branch0.arm0': { shapeId: 'shape:c4-branch', armId: 'arm_1' },
      'c4.loop.branch0.arm1': { shapeId: 'shape:c4-branch', armId: 'arm_2' },
      'c4.loop.branch0.arm2': { shapeId: 'shape:c4-branch', armId: 'arm_3' },
    },
  },
  {
    id: 'c5',
    sourceCase: 'c5_nested_branch',
    owners: {
      'c5.loop': { shapeId: 'shape:c5-loop' },
      'c5.loop.branch0.arm0': { shapeId: 'shape:c5-outer-branch', armId: 'arm_1' },
      'c5.loop.branch0.arm0.branch1.arm0': { shapeId: 'shape:c5-inner-branch', armId: 'arm_1' },
      'c5.loop.branch0.arm0.branch1.arm1': { shapeId: 'shape:c5-inner-branch', armId: 'arm_2' },
    },
  },
  {
    id: 'c6',
    sourceCase: 'c6_nested_loop_excluded',
    owners: { 'c6.loop': { shapeId: 'shape:c6-loop' } },
  },
]

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code) => code === 0
      ? resolve(stdout)
      : reject(new Error(`${command} ${args.join(' ')}\n${stderr || stdout}`)))
  })
}

function check(results, id, label, observed, desired) {
  const ok = JSON.stringify(observed) === JSON.stringify(desired)
  results.push({ id, label, observed, desired, ok })
  process.stdout.write(`  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}\n`)
}

async function shapeIcons(page, shapeId, testId) {
  return JSON.parse(await evaluate(page, `(() => {
    const root = document.querySelector('[data-shape-id=${JSON.stringify(shapeId)}]')
    const row = root?.querySelector('[data-testid=${JSON.stringify(testId)}]')
    return JSON.stringify(row ? Array.from(row.querySelectorAll('.systemsketch-controlIcon')).map((node) =>
      node.dataset.controlKind + ':' + node.dataset.controlLine) : [])
  })()`))
}

async function foldBox(page) {
  return JSON.parse(await evaluate(page, `(() => {
    const root = document.querySelector('[data-shape-id="shape:c4-branch"]')
    const button = root?.querySelector('[data-testid="branch-arm-fold-arm_1"]')
    if (!button) return 'null'
    const r = button.getBoundingClientRect()
    return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 })
  })()`))
}

async function headerGeometry(page) {
  return JSON.parse(await evaluate(page, `(() => {
    const loop = document.querySelector('[data-shape-id="shape:c1-loop"]')
    const loopHeader = loop?.querySelector('.Loop-header')?.getBoundingClientRect()
    const loopTitle = loop?.querySelector('.Loop-title')?.getBoundingClientRect()
    const loopIcons = loop?.querySelector('[data-testid="loop-control-icons-c1-loop"]')?.getBoundingClientRect()
    const branch = document.querySelector('[data-shape-id="shape:c4-branch"]')
    const arm = branch?.querySelector('[data-testid="branch-arm-arm_1"]')?.getBoundingClientRect()
    const armIcons = branch?.querySelector('[data-testid="branch-arm-control-icons-arm_1"]')?.getBoundingClientRect()
    const target = branch?.querySelector('[data-testid="branch-arm-active-arm_1"]')?.getBoundingClientRect()
    return JSON.stringify({
      loop: Boolean(loopHeader && loopTitle && loopIcons
        && loopIcons.left >= loopTitle.right
        && loopIcons.right <= loopHeader.right - 8
        && loopIcons.top >= loopHeader.top
        && loopIcons.bottom <= loopHeader.bottom),
      branch: Boolean(arm && armIcons && target
        && armIcons.right < target.left
        && armIcons.top >= arm.top
        && armIcons.bottom <= arm.bottom),
    })
  })()`))
}

async function runJourney() {
  const results = []
  await mkdir(join(ROOT, '.track', 'boards'), { recursive: true })
  const scratch = await mkdtemp(join(ROOT, '.track', 'boards', 'control-icon-placement-'))
  const board = REVIEW_OUTPUT || join(scratch, 'control-icon-placement.systemsketch')
  const computed = new Map()
  let app
  try {
    // The helper round-trips the board through the real editor before this
    // test's batch pass mutates it; it never writes Zach's personal boards.
    await run(process.execPath, [
      FIXTURE_HELPER,
      '--recipe', FIXTURE,
      '--output', board,
      ...(REVIEW_OUTPUT ? ['--force'] : []),
    ])
    const sourceCases = JSON.parse(await run('python3', [
      '-c', `import json, sys; sys.path.insert(0, ${JSON.stringify(FROZEN_RULE_DIR)}); from control_icon_placement_rule import CASES; print(json.dumps(CASES))`,
    ]))
    for (const item of CASES) {
      const sourcePath = join(scratch, `${item.id}.py`)
      const mapPath = join(scratch, `${item.id}.map.json`)
      const source = sourceCases[item.sourceCase]
      if (typeof source !== 'string') throw new Error(`missing frozen source case ${item.sourceCase}`)
      await writeFile(sourcePath, source)
      await writeFile(mapPath, JSON.stringify({ owners: item.owners }, null, 2))
      computed.set(item.id, JSON.parse(await run('python3', [
        PLACER, '--board', board, '--source', sourcePath, '--map', mapPath, '--loop-region', `${item.id}.loop`,
      ])).placements)
    }

    // The persisted file is the contract boundary: inspect it before the
    // renderer opens it, then make the fresh app prove what it draws.
    const saved = JSON.parse(await readFile(board, 'utf8'))
    const shapes = Object.fromEntries(saved.records
      .filter((record) => record.typeName === 'shape')
      .map((record) => [record.id, record]))
    const icons = (caseId, owner) => computed.get(caseId)?.[owner] ?? []
    const glyphs = (caseId, owner) => icons(caseId, owner).map((icon) => `${icon.kind}:${icon.line}`)
    check(results, 'CI-1', 'the batch pass puts c1\'s transparent exits on its Loop record',
      shapes['shape:c1-loop'].props.controlIcons, icons('c1', 'c1.loop'))
    check(results, 'CI-2', 'the nested-loop source writes an explicit empty outer Loop list',
      shapes['shape:c6-loop'].props.controlIcons, icons('c6', 'c6.loop'))

    app = await startApp({
      label: 'control-icon-placement',
      build: 'control-icon-placement-smoke',
      width: 2200,
      height: 1600,
      allowSourceRoot: true,
    })
    await openApp(app.page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(app.page, 'window.__systemsketch?.editor', 'real editor')
    await waitFor(app.page, 'document.querySelector(\'[data-shape-id="shape:c4-branch"] [data-testid="branch-arm-fold-arm_1"]\')', 'c4 branch canvas')
    await delay(650)

    check(results, 'CI-3', 'c1 shares Continue and Break on the Loop header',
      await shapeIcons(app.page, 'shape:c1-loop', 'loop-control-icons-c1-loop'), glyphs('c1', 'c1.loop'))
    check(results, 'CI-3b', 'Loop and Branch badges occupy their right-aligned header lanes',
      await headerGeometry(app.page), { loop: true, branch: true })
    check(results, 'CI-4', 'c2 places Break only on the if arm',
      [
        await shapeIcons(app.page, 'shape:c2-branch', 'branch-arm-control-icons-arm_1'),
        await shapeIcons(app.page, 'shape:c2-branch', 'branch-arm-control-icons-arm_2'),
        await shapeIcons(app.page, 'shape:c2-branch', 'branch-arm-control-icons-arm_3'),
      ], [glyphs('c2', 'c2.loop.branch0.arm0'), glyphs('c2', 'c2.loop.branch0.arm1'), glyphs('c2', 'c2.loop.branch0.arm2')])
    check(results, 'CI-5', 'c3 places Continue only on the elif arm',
      [
        await shapeIcons(app.page, 'shape:c3-branch', 'branch-arm-control-icons-arm_1'),
        await shapeIcons(app.page, 'shape:c3-branch', 'branch-arm-control-icons-arm_2'),
        await shapeIcons(app.page, 'shape:c3-branch', 'branch-arm-control-icons-arm_3'),
      ], [glyphs('c3', 'c3.loop.branch0.arm0'), glyphs('c3', 'c3.loop.branch0.arm1'), glyphs('c3', 'c3.loop.branch0.arm2')])
    check(results, 'CI-6', 'c4 keeps Break and Continue in separate sibling headers',
      [
        await shapeIcons(app.page, 'shape:c4-branch', 'branch-arm-control-icons-arm_1'),
        await shapeIcons(app.page, 'shape:c4-branch', 'branch-arm-control-icons-arm_2'),
        await shapeIcons(app.page, 'shape:c4-branch', 'branch-arm-control-icons-arm_3'),
      ], [glyphs('c4', 'c4.loop.branch0.arm0'), glyphs('c4', 'c4.loop.branch0.arm1'), glyphs('c4', 'c4.loop.branch0.arm2')])
    check(results, 'CI-7', 'c5 gives Break only to the innermost Branch arm',
      [
        await shapeIcons(app.page, 'shape:c5-outer-branch', 'branch-arm-control-icons-arm_1'),
        await shapeIcons(app.page, 'shape:c5-inner-branch', 'branch-arm-control-icons-arm_1'),
        await shapeIcons(app.page, 'shape:c5-inner-branch', 'branch-arm-control-icons-arm_2'),
      ], [glyphs('c5', 'c5.loop.branch0.arm0'), glyphs('c5', 'c5.loop.branch0.arm0.branch1.arm0'), glyphs('c5', 'c5.loop.branch0.arm0.branch1.arm1')])
    check(results, 'CI-8', 'c6 paints neither the outer nor the nested Loop',
      [
        await shapeIcons(app.page, 'shape:c6-loop', 'loop-control-icons-c6-loop'),
        await shapeIcons(app.page, 'shape:c6-inner-loop', 'loop-control-icons-c6-inner-loop'),
      ], [glyphs('c6', 'c6.loop'), []])
    check(results, 'CI-9', 'the whole six-case board has exactly the seven computed badges and no extras',
      Number(await evaluate(app.page, 'document.querySelectorAll(".systemsketch-controlIcon").length')),
      [...computed.values()].flatMap((placements) => Object.values(placements).flat()).length)

    const beforeFold = await shapeIcons(app.page, 'shape:c4-branch', 'branch-arm-control-icons-arm_1')
    const point = await foldBox(app.page)
    await clickAt(app.page, point.x, point.y)
    await delay(260)
    check(results, 'CI-10', 'folding c4 keeps the Break badge on its compressed header',
      [await shapeIcons(app.page, 'shape:c4-branch', 'branch-arm-control-icons-arm_1'),
        await evaluate(app.page, 'document.querySelector(\'[data-shape-id="shape:c4-branch"] [data-testid="branch-arm-arm_1"]\')?.dataset.open ?? null')],
      [beforeFold, 'false'])
    await clickAt(app.page, point.x, point.y)
    await delay(260)
    check(results, 'CI-11', 'reopening preserves that source-backed arm badge',
      [await shapeIcons(app.page, 'shape:c4-branch', 'branch-arm-control-icons-arm_1'),
        await evaluate(app.page, 'document.querySelector(\'[data-shape-id="shape:c4-branch"] [data-testid="branch-arm-arm_1"]\')?.dataset.open ?? null')],
      [beforeFold, 'true'])

    await evaluate(app.page, '(() => { window.__systemsketch.editor.zoomToFit({ animation: { duration: 0 } }); return true })()')
    await delay(280)
    await mkdir(join(ROOT, 'docs', 'assets'), { recursive: true })
    const capture = await app.page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    const screenshot = Buffer.from(capture.data, 'base64')
    await writeFile(SHOT, screenshot)
    if (REVIEW_SCREENSHOT) await writeFile(REVIEW_SCREENSHOT, screenshot)
    const errors = localConsoleErrors(app.page)
    check(results, 'CI-12', 'the rendered board has no browser console errors', errors, [])
  } finally {
    app?.close()
    await rm(scratch, { recursive: true, force: true })
  }
  await writeFile(OUT, JSON.stringify(results, null, 2))
  const failed = results.filter((result) => !result.ok)
  process.stdout.write(`${results.length - failed.length}/${results.length} passed → ${OUT}\n`)
  process.exitCode = failed.length ? 1 : 0
}

runJourney().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
