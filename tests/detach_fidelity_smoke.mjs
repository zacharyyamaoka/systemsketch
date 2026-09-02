#!/usr/bin/env node
/**
 * Real-browser, same-frame visual proof for Detach to primitives.
 *
 * One clip is captured before and after the menu command with the camera and
 * crop held fixed. The companion scorer measures whole-image colour error,
 * foreground-only error, and edge error, then writes a visible heatmap.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  delay,
  ensureDir,
  evaluate,
  localConsoleErrors,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'
import { blockIds, box, drawBlock } from './block_journey_helpers.mjs'

const execFileAsync = promisify(execFile)
const SHOTS = join(ROOT, 'docs', 'assets')
const BEFORE = join(SHOTS, 'detach-fidelity-before.png')
const AFTER = join(SHOTS, 'detach-fidelity-after.png')
const DIFF = join(SHOTS, 'detach-fidelity-diff.png')
const ACCEPTANCE = join(SHOTS, 'detach-fidelity-acceptance.json')

async function capture(page, path, clip) {
  const shot = await page.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: true,
    clip: { ...clip, scale: 1 },
  })
  await writeFile(path, Buffer.from(shot.data, 'base64'))
}

async function menuDetach(page, blockBox) {
  await clickAt(page, blockBox.cx, blockBox.cy, 'right')
  const selector = '[data-testid="context-menu.block-detach-to-primitives"]'
  await waitFor(page, `document.querySelector(${JSON.stringify(selector)})`, 'Detach to primitives menu item')
  const item = await box(page, selector)
  await clickAt(page, item.cx, item.cy)
  await waitFor(page, `document.querySelectorAll('[data-shape-type="block"]').length === 0`, 'the Block to detach')
  await delay(350)
}

async function main() {
  await ensureDir(SHOTS)
  const app = await startApp({ label: 'detach-fidelity', build: 'detach-fidelity', width: 1280, height: 820 })
  const { page, port, filesRoot } = app
  try {
    const boardPath = join(filesRoot, 'SystemSketch', 'Detach Fidelity.systemsketch')
    await openApp(page, port, `?board=${encodeURIComponent(boardPath)}`)
    await waitFor(page, `window.__systemsketch?.editor`, 'the editor')
    await delay(700)

    await drawBlock(page, { x: 330, y: 210 }, { x: 750, y: 486 }, 'normalize')
    const [blockId] = await blockIds(page)
    const props = {
      view: 'port',
      w: 420,
      h: 276,
      title: 'normalize',
      description: 'Keeps each port row aligned with its semantic boundary.',
      blockType: 'Function',
      icon: '',
      showDescription: true,
      portLayout: 'inline',
      inputs: [
        { id: 'in_1', name: 'window', type: 'int', visible: true, defaultValue: '5' },
        { id: 'in_2', name: 'payload', type: 'image', visible: true },
      ],
      outputs: [
        { id: 'out_1', name: 'result', type: 'float', visible: true },
        { id: 'out_2', name: 'status', type: 'bool', visible: true },
      ],
    }
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const shape = editor.getShape(${JSON.stringify(blockId)})
      editor.updateShape({ id: shape.id, type: shape.type, props: {
        ...shape.props,
        ...${JSON.stringify(props)},
        views: { ...shape.props.views, port: { w: 420, h: 276 } },
      } })
      editor.selectNone()
      return true
    })()`)
    await waitFor(page, `document.querySelector('.BlockNode-headingType')?.textContent === 'Function'`, 'the fidelity fixture')
    await evaluate(page, 'document.fonts.ready.then(() => true)')
    await delay(400)

    const live = await box(page, `[data-shape-id="${blockId}"] .systemsketch-block-canvas`)
    const clip = {
      x: Math.floor(live.x - 24),
      y: Math.floor(live.y - 24),
      width: Math.ceil(live.w + 48),
      height: Math.ceil(live.h + 48),
    }
    const liveMetrics = JSON.parse(await evaluate(page, `(() => {
      const selectors = [
        '.BlockNode-headingTitle', '.BlockNode-headingType',
        '.BlockNode-portName', '.BlockNode-portType', '.BlockNode-portDefault', '.Port',
      ]
      return JSON.stringify(Object.fromEntries(selectors.map((selector) => {
        const node = document.querySelector(selector)
        const rect = node.getBoundingClientRect()
        const css = getComputedStyle(node)
        return [selector, {
          x: rect.x, y: rect.y, w: rect.width, h: rect.height,
          fontFamily: css.fontFamily, fontSize: css.fontSize, lineHeight: css.lineHeight,
          borderRadius: css.borderRadius,
        }]
      })))
    })()`))
    await capture(page, BEFORE, clip)

    await menuDetach(page, live)
    await evaluate(page, 'window.__systemsketch.editor.selectNone(); true')
    await delay(300)
    await capture(page, AFTER, clip)

    const detached = JSON.parse(await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const shapes = editor.getCurrentPageShapes()
      const blockGroups = shapes.filter((shape) => shape.type === 'group'
        && shape.meta?.systemSketch?.kind === 'block')
      const rowGroups = blockGroups.flatMap((group) => editor.getSortedChildIdsForParent(group.id)
        .map((id) => editor.getShape(id)).filter((shape) => shape?.type === 'group'))
      const circles = shapes.filter((shape) => shape.type === 'geo'
        && shape.props.geo === 'ellipse' && shape.props.w === 18 && shape.props.h === 18)
      const pills = shapes.filter((shape) => shape.type === 'geo'
        && shape.props.geo === 'systemsketch-rounded-rect'
        && shape.meta?.systemSketchPrimitiveStyle?.cornerRadius === 999)
      const functionText = shapes.find((shape) => shape.type === 'text'
        && JSON.stringify(shape.props.richText).includes('Function'))
      return JSON.stringify({
        blockGroups: blockGroups.length,
        rowGroups: rowGroups.length,
        circles: circles.length,
        circleWidths: circles.map((shape) => shape.props.w),
        pills: pills.length,
        functionText: functionText ? {
          w: functionText.props.w,
          bounds: editor.getShapePageBounds(functionText.id),
          style: functionText.meta?.systemSketchPrimitiveStyle,
        } : null,
        textLayout: Array.from(document.querySelectorAll(
          '.systemsketch-detached-text-visual .tl-rich-text',
        )).map((node) => ({
          text: node.textContent,
          clientWidth: node.clientWidth,
          scrollWidth: node.scrollWidth,
          clientHeight: node.clientHeight,
          scrollHeight: node.scrollHeight,
        })),
      })
    })()`))

    const { stdout } = await execFileAsync('python3', [
      join(ROOT, 'tests', 'detach_fidelity_score.py'), BEFORE, AFTER, DIFF,
    ])
    const score = JSON.parse(stdout.trim())
    const checks = {
      oneOuterSizedCirclePerPort: detached.circles === 4
        && detached.circleWidths.every((width) => width === 18),
      nestedPortRows: detached.rowGroups === 4,
      defaultPillPresent: detached.pills === 1,
      functionStaysSingleLine: detached.functionText?.bounds?.h <= 25
        && detached.functionText?.style?.fontSize === 18,
      everyDetachedLabelStaysSingleLine: detached.textLayout.every(
        (entry) => entry.scrollHeight <= entry.clientHeight
          && entry.scrollWidth <= entry.clientWidth,
      ),
      detachedTextIsComplete: [
        '= 5', 'Function', 'Keeps each port row aligned with its semantic boundary.',
        'bool', 'float', 'image', 'int', 'normalize', 'payload', 'result', 'status', 'window',
      ].every((text) => detached.textLayout.some((entry) => entry.text === text)),
      pixelSimilarityAtLeast94Point5Percent: score.score >= 0.945,
      oneRememberingBlockGroup: detached.blockGroups === 1,
      noConsoleErrors: localConsoleErrors(page).length === 0,
    }
    const result = { clip, liveMetrics, detached, score, checks }
    await writeFile(ACCEPTANCE, JSON.stringify(result, null, 2))
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    if (Object.values(checks).some((ok) => !ok)) process.exitCode = 1
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
