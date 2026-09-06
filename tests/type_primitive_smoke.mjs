#!/usr/bin/env node
/**
 * Real-browser proof for Type: draw the real tool, edit one ordinary source
 * field, fold a nested projection, then exercise the product Dev placement
 * switch. This deliberately does not unit-render the tree.
 */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  clickElement,
  delay,
  drag,
  elementBox,
  evaluate,
  hoverElement,
  key,
  localConsoleErrors,
  openApp,
  shortcut,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const SHOT = join(ROOT, 'docs', 'assets', 'type-primitive-smoke-2026-09-05.png')
const REFRESH_SCREENSHOT = process.env.SYSTEMSKETCH_REFRESH_TYPE_PRIMITIVE_SCREENSHOT === '1'
const SOURCE = 'pose: Pose\n  position: Position\n    x: float\nquality: float'
const EDITED_SOURCE = 'pose: Pose\n  position: Position\n    x: float\n    y: float\nquality: float'

async function screenshot(page, path) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(path, Buffer.from(capture.data, 'base64'))
}

async function main() {
  const app = await startApp({ label: 'type-primitive', build: 'type-primitive-smoke', width: 1440, height: 960 })
  const { page } = app
  const consoleErrors = []
  try {
    await openApp(page, app.port, '?preset=block-dev')
    await waitFor(page, 'Boolean(window.__systemsketch?.editor)', 'Block development editor')
    await waitFor(page, 'document.querySelector("[data-testid=\\\"tools.type\\\"]")', 'Type toolbar button')

    // The visible toolbar is the creation contract, not a seeded record.
    await clickElement(page, '[data-testid="tools.type"]')
    await drag(page, { x: 240, y: 210 }, { x: 620, y: 474 })
    await waitFor(page, 'document.querySelector("[data-testid=block-inline-title]")', 'new Type title editor')
    await page.send('Input.insertText', { text: 'EstimatePairOut' })
    await key(page, 'Enter', 'Enter')
    await waitFor(page, 'document.querySelector("[data-testid=type-attribute-region]")', 'compact Type attributes')

    const typeId = await evaluate(page, 'window.__systemsketch.editor.getSelectedShapeIds()[0]')
    assert.ok(typeId, 'the actual Type tool selects the new definition')
    assert.deepEqual(JSON.parse(await evaluate(page, `JSON.stringify((() => {
      const shape = window.__systemsketch.editor.getShape(${JSON.stringify(typeId)})
      return { type: shape.type, blockType: shape.props.blockType, view: shape.props.view, source: shape.props.attributeSource }
    })())`)), {
      type: 'block', blockType: 'type', view: 'port', source: 'field: Type',
    }, 'Type remains the canonical Block primitive and starts compact')

    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const shape = editor.getShape(${JSON.stringify(typeId)})
      editor.updateShape({ id: shape.id, type: shape.type, props: { attributeSource: ${JSON.stringify(SOURCE)} } })
      editor.select(shape.id)
      return true
    })()`)
    await waitFor(page, 'document.querySelector("[data-testid=type-attribute-region]")?.textContent.includes("quality")', 'nested Type projection')

    // Open branches show their handle on hover; a folded branch keeps it visible.
    await hoverElement(page, '.TypeAttributeRegion-tree > .TypeAttributeRegion-row[data-has-children] > .TypeAttributeRegion-line')
    await waitFor(page, 'document.querySelector(".TypeAttributeRegion-row[data-has-children] > .TypeAttributeRegion-chevron")?.dataset.visible === "true"', 'hover chevron')
    await clickElement(page, '[aria-label="Collapse pose"]')
    await waitFor(page, `!document.querySelector('[aria-label="Collapse pose"]') && document.querySelector('[aria-label="Expand pose"]')?.dataset.visible === 'true'`, 'folded Type attribute')
    await clickElement(page, '[aria-label="Expand pose"]')
    await waitFor(page, `document.querySelector('[aria-label="Collapse pose"]')`, 'reopened Type attribute')

    // One click opens a genuine textarea: paste and Enter therefore keep their
    // normal text-field behavior instead of fighting a row-per-field editor.
    const sourceLine = await elementBox(page, '.TypeAttributeRegion-line')
    await clickAt(page, sourceLine.x + 20, sourceLine.y + sourceLine.height / 2)
    await waitFor(page, 'document.querySelector("[data-testid=type-attribute-source]")', 'Type source textarea')
    await shortcut(page, 'a', 'KeyA', 2)
    await page.send('Input.insertText', { text: EDITED_SOURCE })
    await key(page, 'Tab', 'Tab')
    await waitFor(page, `window.__systemsketch.editor.getShape(${JSON.stringify(typeId)})?.props.attributeSource === ${JSON.stringify(EDITED_SOURCE)}`, 'source edit commit')
    assert.equal(await evaluate(page, 'document.querySelector("[data-testid=type-attribute-source]")'), null, 'blur returns to the compact projection')
    consoleErrors.push(...localConsoleErrors(page))

    // The setting belongs to Dev chrome, so exercise it from the real product
    // shell while the same live Type renderer is mounted.
    const board = join(app.filesRoot, 'SystemSketch', 'type-primitive.systemsketch')
    await mkdir(join(app.filesRoot, 'SystemSketch'), { recursive: true })
    await openApp(page, app.port, `?board=${encodeURIComponent(board)}`)
    await waitFor(page, 'Boolean(window.__systemsketch?.editor)', 'product editor')
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const base = editor.getShapeUtil('block').getDefaultProps()
      editor.createShape({
        id: 'shape:type-placement', type: 'block', x: 360, y: 230,
        props: {
          ...base, title: 'EstimatePairOut', blockType: 'type', icon: 'Braces',
          attributeSource: ${JSON.stringify(EDITED_SOURCE)}, view: 'port', w: 380, h: 264,
          views: { ...base.views, port: { w: 380, h: 264 }, expanded: { w: 560, h: 460 } },
          inputs: [], outputs: [],
        },
      })
      editor.select('shape:type-placement')
      editor.setCamera({ x: 0, y: 0, z: 1 }, { animation: { duration: 0 } })
      return true
    })()`)
    await waitFor(page, 'document.querySelector("[data-testid=type-attribute-region]")?.textContent.includes("y")', 'product Type projection')
    await clickElement(page, '.systemsketch-dev-trigger')
    await waitFor(page, 'document.querySelector("[data-testid=systemsketch-dev-type-chevron-gutter]")', 'Dev chevron preference')
    await clickElement(page, '[data-testid="systemsketch-dev-type-chevron-gutter"]')
    await waitFor(page, 'document.querySelector("[data-testid=type-attribute-region]")?.classList.contains("TypeAttributeRegion--gutter")', 'gutter placement')
    const placement = JSON.parse(await evaluate(page, `JSON.stringify((() => {
      const region = document.querySelector('[data-testid=type-attribute-region]')
      const chevron = region?.querySelector('.TypeAttributeRegion-chevron')
      const line = region?.querySelector('.TypeAttributeRegion-line')
      return { gutter: region?.classList.contains('TypeAttributeRegion--gutter'), chevronLeft: Math.round(chevron?.getBoundingClientRect().left ?? 0), lineLeft: Math.round(line?.getBoundingClientRect().left ?? 0) }
    })())`))
    assert.equal(placement.gutter, true)
    assert.ok(placement.chevronLeft < placement.lineLeft, 'gutter chevron sits independently to the left of text')
    if (REFRESH_SCREENSHOT) {
      await mkdir(join(ROOT, 'docs', 'assets'), { recursive: true })
      await screenshot(page, SHOT)
    }
    await clickElement(page, '[data-testid="systemsketch-dev-type-chevron-gutter"]')
    await waitFor(page, 'document.querySelector("[data-testid=type-attribute-region]")?.classList.contains("TypeAttributeRegion--inline")', 'inline placement restored')
    consoleErrors.push(...localConsoleErrors(page))
    assert.deepEqual(consoleErrors, [], 'Type journey stays console-clean')
    process.stdout.write(`PASS Type primitive real-browser journey\n${REFRESH_SCREENSHOT ? SHOT : 'disposable screenshot'}\n`)
  } finally {
    await app.close()
  }
}

main().catch((error) => { console.error(error.stack ?? error); process.exitCode = 1 })
