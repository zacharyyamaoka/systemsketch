#!/usr/bin/env node
/** Real-browser acceptance for the curated semantic Block presets. */
import assert from 'node:assert/strict'

import { clickAt, delay, evaluate, key, localConsoleErrors, openApp, shortcut, startApp, waitFor } from './browser_harness.mjs'
import { box, dragFrom, portDot } from './block_journey_helpers.mjs'

const results = []
const check = (id, label, actual, expected = true) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  results.push({ id, label, actual, expected, ok })
  process.stdout.write(`  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}\n`)
}

async function canvasPoint(page, shapeId) {
  return JSON.parse(await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const bounds = editor.getShapePageBounds(${JSON.stringify(shapeId)})
    return JSON.stringify(editor.pageToViewport({ x: bounds.x + bounds.w / 2, y: bounds.y + 26 }))
  })()`))
}

async function selectBlock(page, id) {
  const point = await canvasPoint(page, id)
  await clickAt(page, point.x, point.y)
  await delay(220)
}

async function pickPreset(page, sourceId, side, portId, preset, target) {
	const before = JSON.parse(await evaluate(page, `JSON.stringify(window.__systemsketch.editor.getCurrentPageShapes().map((shape) => shape.id))`))
  await dragFrom(page, await box(page, portDot(sourceId, side, portId)), target)
  const selector = `[data-testid="block-picker-${preset}"]`
  await waitFor(page, `document.querySelector(${JSON.stringify(selector)})`, `${preset} in actual picker`)
  const entry = await box(page, selector)
  await clickAt(page, entry.cx, entry.cy)
  await delay(400)
	await key(page, 'Escape', 'Escape')
	await delay(160)
  const id = await evaluate(page, `window.__systemsketch.editor.getCurrentPageShapes()
    .find((shape) => shape.type === 'block' && shape.props.blockType === ${JSON.stringify(preset)} && !${JSON.stringify(before)}.includes(shape.id))?.id ?? null`)
  assert.ok(id, `picker did not create ${preset}`)
  return id
}

async function main() {
  const app = await startApp({ label: 'semantic-stock-blocks', width: 1440, height: 960 })
  try {
    const { page } = app
    await openApp(page, app.port, '?preset=block-dev')
    await waitFor(page, 'Boolean(window.__systemsketch?.editor)', 'Block development canvas')
    // This is only a producer. The three curated subjects are created through
    // the rendered picker by real port drags, never raw seeded props.
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const { definitionId: _definitionId, definitionKey: _definitionKey, ...base } = editor.getShapeUtil('block').getDefaultProps()
      editor.createShapes([{ id: 'shape:producer', type: 'block', x: 80, y: 350, props: {
        ...base, title: 'source()', blockType: 'source', view: 'port', w: 300, h: 198,
        views: { ...base.views, port: { w: 300, h: 198 } },
        outputs: [{ id: 'out_1', name: 'value', type: 'Record', visible: true, row: 0 }],
      } }, { id: 'shape:consumer', type: 'block', x: 80, y: 620, props: {
				...base, title: 'sink()', blockType: 'sink', view: 'port', w: 300, h: 198,
				views: { ...base.views, port: { w: 300, h: 198 } },
				inputs: [{ id: 'in_1', name: 'trigger', type: 'Trigger', visible: true, row: 0 }],
      } }, { id: 'shape:producer-2', type: 'block', x: 80, y: 80, props: {
        ...base, title: 'source_two()', blockType: 'source', view: 'port', w: 300, h: 198,
        views: { ...base.views, port: { w: 300, h: 198 } },
        outputs: [{ id: 'out_1', name: 'choice', type: 'Record', visible: true, row: 0 }],
      } }])
      editor.setCamera({ x: 0, y: 0, z: 1 })
    })()`)
    await waitFor(page, `window.__systemsketch.editor.getShape('shape:producer')`, 'producer Block record')
    await waitFor(page, `document.querySelector(${JSON.stringify(portDot('shape:producer', 'output', 'out_1'))})`, 'producer output port')

    const setId = await pickPreset(page, 'shape:producer', 'output', 'out_1', 'set-attributes', { x: 500, y: 240 })
    const selectId = await pickPreset(page, 'shape:producer-2', 'output', 'out_1', 'select', { x: 530, y: 530 })
    const clockId = await pickPreset(page, 'shape:consumer', 'input', 'in_1', 'clock-trigger', { x: 950, y: 360 })
    check('PICKER-1', 'the actual picker creates each curated preset',
      await evaluate(page, `JSON.stringify([${JSON.stringify(setId)}, ${JSON.stringify(selectId)}, ${JSON.stringify(clockId)}]
        .map((id) => window.__systemsketch.editor.getShape(id)?.props.blockType))`),
      JSON.stringify(['set-attributes', 'select', 'clock-trigger']))

    await selectBlock(page, setId)
    await waitFor(page, `document.querySelector('[data-testid="set-attributes-add-member"]')`, 'Set inspector')
    await clickAt(page, (await box(page, '[data-testid="set-attributes-add-member"]')).cx, (await box(page, '[data-testid="set-attributes-add-member"]')).cy)
    await waitFor(page, `window.__systemsketch.editor.getShape(${JSON.stringify(setId)}).props.inputs.some((p) => p.id === 'member_2')`, 'stable member row')
    const member = await box(page, '[data-testid="inspector-port-inputs-member_2"] input')
    await clickAt(page, member.cx, member.cy); await shortcut(page, 'a', 'KeyA', 2); await page.send('Input.insertText', { text: '.limit' }); await key(page, 'Enter', 'Enter')
    check('SET-1', 'Set keeps stable member identity through rename and does not claim Python update semantics',
      await evaluate(page, `JSON.stringify({ id: window.__systemsketch.editor.getShape(${JSON.stringify(setId)}).props.inputs.at(-1).id,
        name: window.__systemsketch.editor.getShape(${JSON.stringify(setId)}).props.inputs.at(-1).name,
        honest: document.querySelector('[data-testid="set-attributes-source-status"]')?.textContent.includes('unresolved') })`),
      JSON.stringify({ id: 'member_2', name: '.limit', honest: true }))

    await selectBlock(page, selectId)
    check('SELECT-1', 'Select is an ordinary Block with visible valid conditional notation',
      await evaluate(page, `JSON.stringify({ type: document.querySelector('[data-shape-id=${JSON.stringify(selectId)}]')?.dataset.shapeType,
        source: document.querySelector('[data-testid="select-source-notation"]')?.textContent.trim(),
        conditionVisible: Array.from(document.querySelectorAll('[data-shape-id=${JSON.stringify(selectId)}] .BlockNode-portLabel')).some((node) => node.textContent.includes('condition')),
        rows: window.__systemsketch.editor.getShape(${JSON.stringify(selectId)}).props.inputs.map((p) => p.id) })`),
      JSON.stringify({ type: 'block', source: 'true_value if condition else false_value', conditionVisible: true, rows: ['condition', 'true_value', 'false_value'] }))

    await selectBlock(page, clockId)
    await waitFor(page, `document.querySelector('[aria-label="Clock trigger rate in hertz"]')`, 'Clock configuration')
		const source = await box(page, '[aria-label="Clock trigger source"]')
		await clickAt(page, source.cx, source.cy); await key(page, 'ArrowDown', 'ArrowDown'); await key(page, 'Enter', 'Enter')
		await waitFor(page, `window.__systemsketch.editor.getShape(${JSON.stringify(clockId)})?.props.stockConfig?.triggerSource === 'external'`, 'external trigger source edit')
		check('CLOCK-SOURCE', 'editing source paints External trigger and still makes no runtime claim',
			await evaluate(page, `JSON.stringify({ label: document.querySelector('[data-shape-id=${JSON.stringify(clockId)}] .BlockNode-description')?.textContent.trim(),
				status: document.querySelector('[data-testid="clock-trigger-runtime-status"]')?.textContent.trim() })`),
			JSON.stringify({ label: 'External trigger · prototype declares intent; does not schedule.', status: 'External trigger. This prototype declares intent and does not schedule.' }))
		await clickAt(page, source.cx, source.cy); await key(page, 'ArrowUp', 'ArrowUp'); await key(page, 'Enter', 'Enter')
		await waitFor(page, `window.__systemsketch.editor.getShape(${JSON.stringify(clockId)})?.props.stockConfig?.triggerSource === 'clock'`, 'clock source edit')
    const rate = await box(page, '[aria-label="Clock trigger rate in hertz"]')
    await clickAt(page, rate.cx, rate.cy); await shortcut(page, 'a', 'KeyA', 2); await page.send('Input.insertText', { text: '24' }); await key(page, 'Enter', 'Enter')
    await waitFor(page, `window.__systemsketch.editor.getShape(${JSON.stringify(clockId)})?.props.stockConfig?.rateHz === 24`, 'positive rate edit')
    check('CLOCK-1', 'Clock label, config, and no-scheduler statement derive from the edited rate',
      await evaluate(page, `JSON.stringify({ config: window.__systemsketch.editor.getShape(${JSON.stringify(clockId)}).props.stockConfig,
        label: document.querySelector('[data-shape-id=${JSON.stringify(clockId)}] .BlockNode-description')?.textContent.trim(),
        status: document.querySelector('[data-testid="clock-trigger-runtime-status"]')?.textContent.trim() })`),
      JSON.stringify({ config: { triggerSource: 'clock', rateHz: 24 }, label: 'Clock · 24 Hz · prototype declares intent; does not schedule.', status: 'Clock · 24 Hz. This prototype declares intent and does not schedule.' }))

    // A stock duplicate is a linked occurrence. stockConfig must participate in
    // content comparison and sync just like the rest of its canonical body.
    await evaluate(page, `(() => { const e = window.__systemsketch.editor; e.select(${JSON.stringify(clockId)}).duplicateShapes([${JSON.stringify(clockId)}], { x: 0, y: 260 }) })()`)
    await waitFor(page, `window.__systemsketch.editor.getCurrentPageShapes().filter((s) => s.type === 'block' && s.props.definitionId === window.__systemsketch.editor.getShape(${JSON.stringify(clockId)}).props.definitionId).length === 2`, 'linked Clock occurrence')
    const clockIds = JSON.parse(await evaluate(page, `JSON.stringify(window.__systemsketch.editor.getCurrentPageShapes().filter((s) => s.type === 'block' && s.props.definitionId === window.__systemsketch.editor.getShape(${JSON.stringify(clockId)}).props.definitionId).map((s) => s.id))`))
    await evaluate(page, `(() => { const e = window.__systemsketch.editor, s = e.getShape(${JSON.stringify(clockId)}); e.markHistoryStoppingPoint('edit Clock config'); e.updateShape({ id: s.id, type: s.type, props: { stockConfig: { triggerSource: 'manual' } } }) })()`)
    await waitFor(page, `JSON.stringify(${JSON.stringify(clockIds)}.map((id) => window.__systemsketch.editor.getShape(id)?.props.stockConfig)) === JSON.stringify([{triggerSource:'manual'},{triggerSource:'manual'}])`, 'linked config propagation')
    check('LINK-1', 'linked Clock configs converge and distinct configs remain distinct content',
      await evaluate(page, `JSON.stringify({ configs: ${JSON.stringify(clockIds)}.map((id) => window.__systemsketch.editor.getShape(id).props.stockConfig),
        distinct: JSON.stringify({triggerSource:'manual'}) !== JSON.stringify({triggerSource:'clock',rateHz:24}) })`),
      JSON.stringify({ configs: [{ triggerSource: 'manual' }, { triggerSource: 'manual' }], distinct: true }))
    await shortcut(page, 'z', 'KeyZ', 2)
    await waitFor(page, `window.__systemsketch.editor.getShape(${JSON.stringify(clockId)})?.props.stockConfig?.rateHz === 24`, 'undo linked config')
    check('UNDO-1', 'undo restores the linked declaration normally',
      await evaluate(page, `JSON.stringify(${JSON.stringify(clockIds)}.map((id) => window.__systemsketch.editor.getShape(id)?.props.stockConfig))`),
      JSON.stringify([{ triggerSource: 'clock', rateHz: 24 }, { triggerSource: 'clock', rateHz: 24 }]))


    // Exercise the actual context-menu duplicate and title-commit collision
    // path. An equal config must really join its canonical Clock definition.
    await selectBlock(page, clockId)
    const equalSource = await canvasPoint(page, clockId)
    await clickAt(page, equalSource.x, equalSource.y, 'right')
    await waitFor(page, `document.querySelector('[data-testid="context-menu.block-duplicate-unlinked"]')`, 'equal-config duplicate menu item')
    const equalMenu = await box(page, '[data-testid="context-menu.block-duplicate-unlinked"]')
    await clickAt(page, equalMenu.cx, equalMenu.cy)
    await waitFor(page, `window.__systemsketch.editor.getSelectedShapes().some((s) => s.type === 'block' && s.id !== ${JSON.stringify(clockId)})`, 'equal-config duplicate selection')
    const equalClock = await evaluate(page, `window.__systemsketch.editor.getSelectedShapes().find((s) => s.type === 'block' && s.id !== ${JSON.stringify(clockId)})?.id`)
    const equalTitle = await box(page, '[aria-label="Block title"]')
    await clickAt(page, equalTitle.cx, equalTitle.cy); await shortcut(page, 'a', 'KeyA', 2); await page.send('Input.insertText', { text: 'Clock' }); await key(page, 'Enter', 'Enter')
    await waitFor(page, `window.__systemsketch.editor.getShape(${JSON.stringify(equalClock)})?.props.definitionId === window.__systemsketch.editor.getShape(${JSON.stringify(clockId)})?.props.definitionId`, 'equal-config title collision reconciliation')
    check('LINK-2', 'equal-config collision converges through the real duplicate and commit path',
      await evaluate(page, `JSON.stringify({ sameDefinition: window.__systemsketch.editor.getShape(${JSON.stringify(equalClock)}).props.definitionId === window.__systemsketch.editor.getShape(${JSON.stringify(clockId)}).props.definitionId,
        key: window.__systemsketch.editor.getShape(${JSON.stringify(equalClock)}).props.definitionKey,
        draft: window.__systemsketch.editor.getShape(${JSON.stringify(equalClock)}).props.draftOrdinal ?? null })`),
      JSON.stringify({ sameDefinition: true, key: 'Clock', draft: null }))

    // A second real duplicate changes its authoring config before that same
    // title commit. It must remain a distinct Draft rather than silently merge.
    await selectBlock(page, clockId)
    const differentSource = await canvasPoint(page, clockId)
    await clickAt(page, differentSource.x, differentSource.y, 'right')
    await waitFor(page, `document.querySelector('[data-testid="context-menu.block-duplicate-unlinked"]')`, 'different-config duplicate menu item')
    const differentMenu = await box(page, '[data-testid="context-menu.block-duplicate-unlinked"]')
    await clickAt(page, differentMenu.cx, differentMenu.cy)
    await waitFor(page, `window.__systemsketch.editor.getSelectedShapes().some((s) => s.type === 'block' && s.id !== ${JSON.stringify(clockId)})`, 'different-config duplicate selection')
    const differentClock = await evaluate(page, `window.__systemsketch.editor.getSelectedShapes().find((s) => s.type === 'block' && s.id !== ${JSON.stringify(clockId)})?.id`)
    const draftRate = await box(page, '[aria-label="Clock trigger rate in hertz"]')
    await clickAt(page, draftRate.cx, draftRate.cy); await shortcut(page, 'a', 'KeyA', 2); await page.send('Input.insertText', { text: '10' }); await key(page, 'Enter', 'Enter')
    await waitFor(page, `window.__systemsketch.editor.getShape(${JSON.stringify(differentClock)})?.props.stockConfig?.rateHz === 10`, 'different Clock rate')
    const draftTitle = await box(page, '[aria-label="Block title"]')
    await clickAt(page, draftTitle.cx, draftTitle.cy); await shortcut(page, 'a', 'KeyA', 2); await page.send('Input.insertText', { text: 'Clock' }); await key(page, 'Enter', 'Enter')
    await waitFor(page, `window.__systemsketch.editor.getShape(${JSON.stringify(differentClock)})?.props.draftOrdinal === 1`, 'different-config draft title collision')
    check('LINK-3', 'different-config same-name collision remains a visibly distinct Draft',
      await evaluate(page, `JSON.stringify({ sameDefinition: window.__systemsketch.editor.getShape(${JSON.stringify(differentClock)}).props.definitionId === window.__systemsketch.editor.getShape(${JSON.stringify(clockId)}).props.definitionId,
        config: window.__systemsketch.editor.getShape(${JSON.stringify(differentClock)}).props.stockConfig,
        key: window.__systemsketch.editor.getShape(${JSON.stringify(differentClock)}).props.definitionKey,
        badge: document.querySelector('[data-shape-id=${JSON.stringify(differentClock)}] .BlockNode-definitionBadge')?.textContent.trim() })`),
      JSON.stringify({ sameDefinition: false, config: { triggerSource: 'clock', rateHz: 10 }, key: 'Clock_draft_1', badge: 'Draft 1' }))

    await page.send('Page.reload', { ignoreCache: true })
    await waitFor(page, 'Boolean(window.__systemsketch?.editor)', 'reopened persisted development board')
    await waitFor(page, `Array.from(document.querySelectorAll('.BlockNode-description')).some((n) => n.textContent.includes('Clock · 24 Hz'))`, 'reopened current Clock label')
    check('REOPEN-1', 'reopening retains source/rate and never paints stale 10 Hz prose',
      await evaluate(page, `(() => {
        const editor = window.__systemsketch.editor
        const canonical = editor.getShape(${JSON.stringify(clockId)})
        return editor.getCurrentPageShapes()
          .filter((shape) => shape.type === 'block' && shape.props.definitionId === canonical?.props.definitionId)
          .every((shape) => shape.props.stockConfig?.rateHz === 24
            && document.querySelector('[data-shape-id=' + CSS.escape(shape.id) + '] .BlockNode-description')?.textContent.includes('Clock · 24 Hz'))
      })()`), true)

    const reopenedClock = await evaluate(page, `window.__systemsketch.editor.getCurrentPageShapes().find((s) => s.type === 'block' && s.props.blockType === 'clock-trigger')?.id`)
    await evaluate(page, `(() => { window.__systemsketch.editor.updateInstanceState({ isReadonly: true }); return true })()`)
    await selectBlock(page, reopenedClock)
    check('READONLY-1', 'read-only keeps Clock intent visible and disables edits',
      await evaluate(page, `JSON.stringify({ source: document.querySelector('[aria-label="Clock trigger source"]')?.disabled,
        rate: document.querySelector('[aria-label="Clock trigger rate in hertz"]')?.disabled,
        status: document.querySelector('[data-testid="clock-trigger-runtime-status"]')?.textContent.includes('does not schedule') })`),
      JSON.stringify({ source: true, rate: true, status: true }))
    await evaluate(page, `(() => { window.__systemsketch.editor.updateInstanceState({ isReadonly: false }); return true })()`)
    check('CONSOLE', 'the twice-run disposable journey is console-clean', await localConsoleErrors(page), [])
  } finally { await app.close() }
  if (results.some((result) => !result.ok)) process.exitCode = 1
}

await main()
