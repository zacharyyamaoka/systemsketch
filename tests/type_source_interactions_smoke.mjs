#!/usr/bin/env node
/**
 * Two Type-block Source-mode interactions, proven in a real browser:
 *
 * 1. Row clicks land the caret WHERE YOU CLICKED (nested/foreign rows too).
 *    The regression this locks down: React StrictMode (dev — the Preview
 *    channel Zach judges) destroys and recreates the CodeMirror view once per
 *    mount, AFTER the old one-shot caret effect had already spent the entry
 *    caret — so the surviving view always sat at offset 0 ("cursor always at
 *    the start"). The fix moved caret application into the editor's own mount
 *    effect (`SourceCodeEditor.initialCaret`).
 *
 * 2. The type-name autocomplete popup out-stacks EVERYTHING. It used to be
 *    mounted inside the shape's transformed subtree, where no z-index can
 *    beat a sibling shape painted later — a plain arrow drew on top of the
 *    open list. It now parents onto `.tl-container` at maximum z-index, and
 *    clicking one of its rows must still read as "inside the editor" (no
 *    commit-on-outside-click).
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  delay,
  evaluate,
  key,
  localConsoleErrors,
  makeChecklist,
  openApp,
  startApp,
  typeSlowly,
  waitFor,
} from './browser_harness.mjs'

const SHOT_CARET = join(ROOT, 'docs', 'type-source-caret-live-2026-09-05.png')
const SHOT_TOOLTIP = join(ROOT, 'docs', 'type-autocomplete-zorder-live-2026-09-05.png')
const { checks, pass } = makeChecklist()

/** tldraw counts two clicks within 450ms as a double-click. Out-wait it. */
const SLOW_CLICK_PAUSE_MS = 700

async function shoot(page, path) {
  const shot = await page.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(path, Buffer.from(shot.data, 'base64'))
}

/** The live source editor's caret, read from the DOM selection CodeMirror
 * mirrors while focused — independent of any internal debug seam. */
async function sourceCaret(page) {
  return evaluate(page, `(() => {
    const content = document.querySelector('[data-testid$="-source"] .cm-content')
    if (!content) return { mounted: false }
    const sel = window.getSelection()
    let offset = null
    if (sel && sel.anchorNode && content.contains(sel.anchorNode)) {
      const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT)
      let walked = 0, node
      while ((node = walker.nextNode())) {
        if (node === sel.anchorNode) { offset = walked + sel.anchorOffset; break }
        walked += node.textContent.length
      }
      if (offset !== null) {
        // Add the implicit newline for each .cm-line before the anchor's.
        let extra = 0
        for (const line of content.querySelectorAll('.cm-line')) {
          if (line.contains(sel.anchorNode)) break
          extra += 1
        }
        offset += extra
      }
    }
    return { mounted: true, offset, testId: content.closest('[data-testid$="-source"]').getAttribute('data-testid') }
  })()`)
}

/** Screen point of character index k in a rendered babble row (chevron skipped). */
async function charPoint(page, regionTestId, rowText, charIndex) {
  return evaluate(page, `(() => {
    const region = document.querySelector('[data-testid=${JSON.stringify(regionTestId)}]')
    if (!region) return null
    const rows = [...region.querySelectorAll('.TypeBabbleV1-rowContent')]
    const row = rows.find(r => r.textContent.replace(/[▾▸]/g, '').trim() === ${JSON.stringify(rowText)})
    if (!row) return null
    const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT)
    let remaining = ${charIndex}
    let node
    while ((node = walker.nextNode())) {
      const text = node.textContent
      if (text === '▸' || text === '▾') continue
      if (remaining < text.length) {
        const range = document.createRange()
        range.setStart(node, remaining)
        range.setEnd(node, Math.min(remaining + 1, text.length))
        const r = range.getBoundingClientRect()
        return { x: r.x + 1, y: r.y + r.height / 2 }
      }
      remaining -= text.length
    }
    return null
  })()`)
}

async function selectBlockByRowClick(page, regionTestId, rowText, blockId) {
  const pt = await charPoint(page, regionTestId, rowText, 2)
  assert.ok(pt, `row "${rowText}" found in ${regionTestId}`)
  await clickAt(page, pt.x, pt.y)
  await waitFor(page, `window.__systemsketch.editor.getSelectedShapeIds()[0] === ${JSON.stringify(blockId)}`, `${blockId} selected`)
  await delay(SLOW_CLICK_PAUSE_MS)
}

const app = await startApp({ label: 'type-source-smoke', width: 1600, height: 1000 })
try {
  const { page, port } = app
  await openApp(page, port, '')
  await waitFor(page, 'Boolean(window.__systemsketch?.editor)', 'dev seam')

  // The same two blocks the merge-verification fixture seeds, built through
  // the real editor so this journey cannot drift with the fixture file.
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    editor.createShapes([
      { id: 'shape:posefix', type: 'block', x: 100, y: 100, props: { title: 'Pose', blockType: 'type', view: 'port', w: 340, h: 320, attributeSource: 'x: Pose\\ny: float = 10\\nz: float' }, meta: { babbleVariant: 1 } },
      { id: 'shape:consumer', type: 'block', x: 560, y: 100, props: { title: 'Consumer', blockType: 'type', view: 'port', w: 380, h: 320, attributeSource: 'pose: Pose = 10\\nquality: float' }, meta: { babbleVariant: 8 } },
    ])
    editor.resetZoom()
    editor.zoomToBounds(editor.getShapePageBounds('shape:consumer').clone().expandBy(260), { inset: 0 })
    return true
  })()`)
  await waitFor(page, `Boolean(document.querySelector('[data-testid="type-babble-v1-prior-art"]'))`, 'consumer babble mounted')
  await delay(400)

  // ---- Part 1: nested/foreign row click + caret placement ----

  // Select the consumer, expand `pose: Pose` to reveal Pose's own x/y/z.
  await selectBlockByRowClick(page, 'type-babble-v1-prior-art', 'pose: Pose = 10', 'shape:consumer')
  const chevron = await evaluate(page, `(() => {
    const glyph = document.querySelector('[data-testid="type-babble-v1-prior-art"] .TypeBabbleV1-chevronGlyph[data-known]')
    if (!glyph) return null
    const r = glyph.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })()`)
  assert.ok(chevron, 'expand chevron present')
  await clickAt(page, chevron.x, chevron.y)
  await waitFor(page, `Boolean(document.querySelector('[data-testid="type-babble-v1-prior-art"] [data-testid="type-babble-v1-preview"]'))`, 'nested preview expanded')
  await delay(SLOW_CLICK_PAUSE_MS)

  // Click the nested LEAF `y: float = 10` at char 4 — a row whose own type
  // resolves to nothing, so only the owner-jump path can serve it.
  const nested = await charPoint(page, 'type-babble-v1-prior-art', 'y: float = 10', 4)
  assert.ok(nested, 'nested y row found')
  await clickAt(page, nested.x, nested.y)
  await waitFor(page, `window.__systemsketch.editor.getSelectedShapeIds()[0] === 'shape:posefix'`, 'owner block selected')
  await waitFor(page, `Boolean(document.querySelector('[data-testid="type-babble-v1-source"] .cm-content'))`, 'owner source editor open')
  await delay(600)

  let caret = await sourceCaret(page)
  checks.push(['NEST-1', 'owner (Pose) source editor is the one that opened', caret.testId, 'type-babble-v1-source'])
  assert.equal(caret.testId, 'type-babble-v1-source')
  // "x: Pose\n" is 8 chars; clicked char 4 of the y line -> offset 12.
  checks.push(['NEST-2', 'caret landed at the clicked character, not offset 0', caret.offset, '12 ±2'])
  assert.ok(typeof caret.offset === 'number' && Math.abs(caret.offset - 12) <= 2, `caret ${caret.offset}`)
  await shoot(page, SHOT_CARET)

  // Leave source mode, reframe the consumer.
  await key(page, 'Escape')
  await delay(300)
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    editor.selectNone()
    editor.zoomToBounds(editor.getShapePageBounds('shape:consumer').clone().expandBy(260), { inset: 0 })
    return true
  })()`)
  await delay(400)

  // OWN row, non-link part: `quality: float` char 4 -> line 1 col 4 = 16+4.
  await selectBlockByRowClick(page, 'type-babble-v1-prior-art', 'quality: float', 'shape:consumer')
  const own = await charPoint(page, 'type-babble-v1-prior-art', 'quality: float', 4)
  await clickAt(page, own.x, own.y)
  await waitFor(page, `Boolean(document.querySelector('[data-testid="type-babble-v1-prior-art-source"] .cm-content'))`, 'own source editor open')
  await delay(600)
  caret = await sourceCaret(page)
  checks.push(['OWN-1', 'own-row click opens the block OWN source', caret.testId, 'type-babble-v1-prior-art-source'])
  assert.equal(caret.testId, 'type-babble-v1-prior-art-source')
  checks.push(['OWN-2', 'caret near the clicked character on line 2', caret.offset, '20 ±2'])
  assert.ok(typeof caret.offset === 'number' && Math.abs(caret.offset - 20) <= 2, `caret ${caret.offset}`)

  await key(page, 'Escape')
  await delay(300)
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    editor.selectNone()
    editor.zoomToBounds(editor.getShapePageBounds('shape:consumer').clone().expandBy(260), { inset: 0 })
    return true
  })()`)
  await delay(400)

  // The blue link keeps its ORIGINAL job: jump+zoom, no source mode.
  await selectBlockByRowClick(page, 'type-babble-v1-prior-art', 'pose: Pose = 10', 'shape:consumer')
  const link = await evaluate(page, `(() => {
    const region = document.querySelector('[data-testid="type-babble-v1-prior-art"]')
    const el = [...region.querySelectorAll('.TypeBabble-type')].find(n => n.textContent === 'Pose')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })()`)
  assert.ok(link, 'type link found')
  await clickAt(page, link.x, link.y)
  await waitFor(page, `window.__systemsketch.editor.getSelectedShapeIds()[0] === 'shape:posefix'`, 'link jumped to Pose')
  await delay(600)
  const sourcesOpen = await evaluate(page, `document.querySelectorAll('[data-testid$="-source"]').length`)
  checks.push(['LINK-1', 'link click jumps without opening source mode', sourcesOpen, 0])
  assert.equal(sourcesOpen, 0)

  // ---- Part 2: autocomplete popup stacking ----

  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    editor.selectNone()
    editor.zoomToBounds(editor.getShapePageBounds('shape:consumer').clone().expandBy(260), { inset: 0 })
    return true
  })()`)
  await delay(400)
  await selectBlockByRowClick(page, 'type-babble-v1-prior-art', 'quality: float', 'shape:consumer')
  // Enter source at the START of the type token `float` (line 1 col 9).
  const slot = await charPoint(page, 'type-babble-v1-prior-art', 'quality: float', 9)
  await clickAt(page, slot.x, slot.y)
  await waitFor(page, `Boolean(document.querySelector('[data-testid="type-babble-v1-prior-art-source"] .cm-content'))`, 'source editor open for completion')
  await delay(500)
  await typeSlowly(page, 'Po')
  await waitFor(page, `Boolean(document.querySelector('.cm-tooltip.TypeNameAutocomplete-cm'))`, 'autocomplete tooltip open')
  await delay(200)

  const tooltip = await evaluate(page, `(() => {
    const tip = document.querySelector('.cm-tooltip.TypeNameAutocomplete-cm')
    const style = getComputedStyle(tip)
    const rect = tip.getBoundingClientRect()
    return {
      // CodeMirror wraps tooltips for a custom parent in its own relative
      // div, so the tooltip is a GRANDchild of the container.
      insideContainer: Boolean(tip.closest('.tl-container')),
      insideShapeLayer: Boolean(tip.closest('.tl-html-layer')),
      zIndex: style.zIndex,
      minWidth: style.minWidth,
      borderRadius: style.borderRadius,
      styled: style.minWidth === '360px' && style.borderRadius === '8px',
      rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
    }
  })()`)
  checks.push(['TIP-1', 'tooltip mounts under .tl-container, outside the shape tree', `${tooltip.insideContainer}/${!tooltip.insideShapeLayer}`, 'true/true'])
  assert.equal(tooltip.insideContainer, true)
  assert.equal(tooltip.insideShapeLayer, false)
  checks.push(['TIP-2', 'tooltip takes the maximum z-index', tooltip.zIndex, '2147483647'])
  assert.equal(tooltip.zIndex, '2147483647')
  checks.push(['TIP-3', 'rescoped stylesheet still reaches it', `${tooltip.minWidth}/${tooltip.borderRadius}`, '360px/8px'])
  assert.equal(tooltip.styled, true, `minWidth=${tooltip.minWidth} borderRadius=${tooltip.borderRadius}`)

  // Draw a REAL arrow straight through the tooltip's rect, then prove the
  // tooltip still wins the pixels: elementFromPoint inside its box must
  // resolve to the tooltip, never the arrow.
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const r = document.querySelector('.cm-tooltip.TypeNameAutocomplete-cm').getBoundingClientRect()
    const a = editor.screenToPage({ x: r.x - 40, y: r.y + r.height / 2 })
    const b = editor.screenToPage({ x: r.x + r.width + 40, y: r.y + r.height / 2 })
    editor.createShape({ id: 'shape:occluder', type: 'arrow', x: a.x, y: a.y, props: { start: { x: 0, y: 0 }, end: { x: b.x - a.x, y: b.y - a.y } } })
    return true
  })()`)
  await delay(300)
  const occlusion = await evaluate(page, `(() => {
    const tip = document.querySelector('.cm-tooltip.TypeNameAutocomplete-cm')
    if (!tip) return { open: false }
    const r = tip.getBoundingClientRect()
    const probes = [0.2, 0.5, 0.8].map(f => document.elementFromPoint(r.x + r.width * f, r.y + r.height / 2))
    return { open: true, allInsideTooltip: probes.every(el => el && tip.contains(el)) }
  })()`)
  checks.push(['TIP-4', 'arrow drawn through it cannot occlude a single probe pixel', `${occlusion.open}/${occlusion.allInsideTooltip}`, 'true/true'])
  assert.equal(occlusion.open, true)
  assert.equal(occlusion.allInsideTooltip, true)
  await shoot(page, SHOT_TOOLTIP)

  // Choosing a completion by CLICK must not read as "clicked outside".
  const option = await evaluate(page, `(() => {
    const row = document.querySelector('.cm-tooltip.TypeNameAutocomplete-cm li[role="option"]')
    if (!row) return null
    const r = row.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, label: row.textContent }
  })()`)
  assert.ok(option, 'completion option present')
  await clickAt(page, option.x, option.y)
  await delay(400)
  const afterPick = await evaluate(page, `(() => ({
    stillInSource: Boolean(document.querySelector('[data-testid="type-babble-v1-prior-art-source"] .cm-content')),
    doc: document.querySelector('[data-testid="type-babble-v1-prior-art-source"] .cm-content')?.textContent ?? null,
  }))()`)
  checks.push(['TIP-5', 'clicking a completion row keeps Source mode open', afterPick.stillInSource, true])
  assert.equal(afterPick.stillInSource, true)
  checks.push(['TIP-6', 'the completion was applied into the document', afterPick.doc?.includes('Pose'), true])
  assert.equal(afterPick.doc?.includes('Pose'), true)

  assert.deepEqual(localConsoleErrors(page), [], 'no console errors')
  pass('type source interactions real-browser journey')
  console.log(SHOT_CARET)
  console.log(SHOT_TOOLTIP)
} finally {
  app.close()
}
