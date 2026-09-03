#!/usr/bin/env node
/**
 * Read-only ground-truth probe for the "turn selection into a container"
 * babble round. It changes nothing in src/; it drives the current product
 * build on a scratch board to answer three questions with observed evidence:
 *
 *   1. Which shape types in the running editor are frame-like containers?
 *   2. Is there already a wrap-the-selection command, and where is it reached?
 *   3. Does that command unwrap again, and by what move?
 *
 * Output: the JSON recorded at docs/assets/turn-into-ground-truth-2026-09-03.json,
 * plus the captures docs/build_turn_selection_into_babble.py crops and inlines.
 *
 *   node docs/turn_into_probe.mjs
 */
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickAt,
  delay,
  evaluate,
  makeChecklist,
  openApp,
  shortcut,
  startApp,
  waitFor,
} from '../tests/browser_harness.mjs'

import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
/** Captures land beside the report that inlines them. */
const OUT_DIR = process.env.PROBE_OUT ?? join(HERE, 'assets')

/** The names docs/build_turn_selection_into_babble.py crops and inlines. */
const capture = (name) => join(OUT_DIR, `turn-into-${name}-2026-09-03.png`)

async function shot(page, path) {
  const { data } = await page.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(path, Buffer.from(data, 'base64'))
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const app = await startApp({ label: 'turn-into-probe', build: 'turn-into-probe' })
  const { page, port, filesRoot } = app
  const list = makeChecklist()
  const findings = {}

  try {
    const boardPath = join(filesRoot, 'SystemSketch', 'TurnIntoProbe.systemsketch')
    await openApp(page, port, `?board=${encodeURIComponent(boardPath)}`)
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-app"] .tl-container')`,
      'the SystemSketch product canvas')
    await delay(900)

    // The reliable read: ask the editor about a real instance of each type.
    findings.frameLike = JSON.parse(await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const { createShapeId } = window.__systemsketch.tldraw ?? {}
      const probes = []
      const made = []
      const mk = (type, props) => {
        const id = 'shape:probe_' + type.replace(/[^a-z]/gi,'') + '_' + made.length
        editor.createShape({ id, type, x: -8000 + made.length * 400, y: -8000, props })
        made.push(id)
        return id
      }
      const specs = [
        ['frame', undefined],
        ['group', undefined],
        ['geo', undefined],
        ['block', undefined],
        ['branch', undefined],
      ]
      for (const [type, props] of specs) {
        let id = null
        try { id = mk(type, props) } catch (e) { probes.push({ type, error: String(e).slice(0,120) }); continue }
        const shape = editor.getShape(id)
        if (!shape) { probes.push({ type, error: 'not created' }); continue }
        probes.push({
          type,
          frameLike: editor.isShapeFrameLike(shape),
          acceptsGeoChild: editor.getShapeUtil(shape).canReceiveNewChildrenOfType(shape, 'geo'),
        })
      }
      editor.deleteShapes(made)
      return JSON.stringify(probes)
    })()`))

    // Expanded Block is the container view; probe it explicitly.
    findings.blockViews = JSON.parse(await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const out = []
      const made = []
      for (const view of ['simple','port','expanded','value']) {
        const id = 'shape:probe_block_' + view
        editor.createShape({ id, type: 'block', x: -9000, y: -9000 })
        editor.updateShape({ id, type: 'block', props: { view } })
        const shape = editor.getShape(id)
        out.push({ view, frameLike: editor.isShapeFrameLike(shape),
          acceptsGeoChild: editor.getShapeUtil(shape).canReceiveNewChildrenOfType(shape, 'geo') })
        made.push(id)
      }
      editor.deleteShapes(made)
      return JSON.stringify(out)
    })()`))

    // ---- 2. Build the shared fixture: four ordinary shapes, selected. ------
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      editor.selectNone()
      const ids = []
      const spec = [
        ['read_frame()',   120, 200],
        ['detect()',       420, 200],
        ['annotate()',     420, 380],
        ['publish()',      720, 290],
      ]
      for (const [text, x, y] of spec) {
        const id = 'shape:fx_' + ids.length
        editor.createShape({ id, type: 'geo', x, y, props: { w: 190, h: 96, geo: 'rectangle' } })
        void text
        ids.push(id)
      }
      editor.setSelectedShapes(ids)
      editor.zoomToFit()
      return ids.length
    })()`)
    await delay(600)

    findings.before = JSON.parse(await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      return JSON.stringify({
        selected: editor.getSelectedShapeIds().length,
        shapesOnPage: editor.getCurrentPageShapes().length,
        types: [...new Set(editor.getCurrentPageShapes().map(s => s.type))].sort(),
      })
    })()`))
    await shot(page, capture('selection'))

    // ---- 2b. Where is the wrap command reached today? ---------------------
    // Right-click the selection and walk the real menu DOM.
    const centre = JSON.parse(await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const b = editor.getSelectionRotatedPageBounds()
      const p = editor.pageToViewport({ x: b.midX, y: b.minY + 20 })
      const r = document.querySelector('.tl-container').getBoundingClientRect()
      return JSON.stringify({ x: Math.round(r.left + p.x), y: Math.round(r.top + p.y) })
    })()`))
    await clickAt(page, centre.x, centre.y, 'right')
    await delay(500)

    findings.contextMenuTop = JSON.parse(await evaluate(page, `(() => {
      const items = [...document.querySelectorAll('[data-testid^="menu-item."], .tlui-button__menu, [role="menuitem"]')]
      const labels = items.map(el => (el.textContent || '').trim()).filter(Boolean)
      return JSON.stringify([...new Set(labels)])
    })()`))
    await shot(page, capture('context-menu'))

    // Open the stock Edit submenu, which is where tldraw parks frame-selection.
    const openedEdit = await evaluate(page, `(() => {
      const items = [...document.querySelectorAll('[role="menuitem"]')]
      const edit = items.find(el => (el.textContent||'').trim().toLowerCase() === 'edit')
      if (!edit) return 'no-edit-submenu'
      edit.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }))
      edit.click()
      return 'clicked'
    })()`)
    findings.openedEdit = openedEdit
    await delay(600)

    findings.editSubmenu = JSON.parse(await evaluate(page, `(() => {
      const labels = [...document.querySelectorAll('[role="menuitem"]')]
        .map(el => (el.textContent||'').trim()).filter(Boolean)
      return JSON.stringify([...new Set(labels)])
    })()`))
    await shot(page, capture('edit-submenu'))
    await shortcut(page, 'Escape', 'Escape')
    await delay(200)
    await shortcut(page, 'Escape', 'Escape')
    await delay(300)

    // ---- 3. Drive the real menu item, then the keystroke. ----------------
    const reselect = `(() => {
      const editor = window.__systemsketch.editor
      const ids = editor.getCurrentPageShapes().filter(s => s.id.startsWith('shape:fx_')).map(s => s.id)
      editor.setSelectedShapes(ids)
      return ids.length
    })()`
    const openEditSubmenu = async () => {
      const c = JSON.parse(await evaluate(page, `(() => {
        const editor = window.__systemsketch.editor
        const b = editor.getSelectionRotatedPageBounds()
        const p = editor.pageToViewport({ x: b.midX, y: b.minY + 20 })
        const r = document.querySelector('.tl-container').getBoundingClientRect()
        return JSON.stringify({ x: Math.round(r.left + p.x), y: Math.round(r.top + p.y) })
      })()`))
      await clickAt(page, c.x, c.y, 'right')
      await delay(450)
      await evaluate(page, `(() => {
        const edit = [...document.querySelectorAll('[role="menuitem"]')]
          .find(el => (el.textContent||'').trim().toLowerCase() === 'edit')
        if (edit) edit.click()
        return !!edit
      })()`)
      await delay(450)
    }
    const clickMenuLabel = async (needle) => evaluate(page, `(() => {
      const hit = [...document.querySelectorAll('[role="menuitem"]')]
        .find(el => (el.textContent||'').trim().toLowerCase().startsWith(${JSON.stringify(needle.toLowerCase())}))
      if (!hit) return 'missing'
      hit.click()
      return 'clicked'
    })()`)

    await evaluate(page, reselect)
    await delay(200)
    await openEditSubmenu()
    findings.clickedFrameSelection = await clickMenuLabel('frame selection')
    await delay(800)
    await evaluate(page, `(() => { document.querySelector('.tl-container').focus(); return 1 })()`)

    findings.afterWrap = JSON.parse(await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const frames = editor.getCurrentPageShapes().filter(s => s.type === 'frame')
      const frame = frames[0]
      const kids = frame ? editor.getSortedChildIdsForParent(frame.id) : []
      return JSON.stringify({
        frameCount: frames.length,
        frameName: frame ? frame.props.name : null,
        children: kids.length,
        childTypes: [...new Set(kids.map(id => editor.getShape(id)?.type))],
        selected: editor.getSelectedShapeIds().length,
        selectedType: editor.getOnlySelectedShape()?.type ?? null,
        frameW: frame ? Math.round(frame.props.w) : null,
        frameH: frame ? Math.round(frame.props.h) : null,
      })
    })()`))
    await shot(page, capture('after-wrap'))

    // The inverse, reached from the same submenu on the frame itself.
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const frame = editor.getCurrentPageShapes().find(s => s.type === 'frame')
      if (frame) editor.setSelectedShapes([frame.id])
      return frame ? 1 : 0
    })()`)
    await delay(250)
    await openEditSubmenu()
    findings.editSubmenuOnFrame = JSON.parse(await evaluate(page, `(() => {
      const labels = [...document.querySelectorAll('[role="menuitem"]')]
        .map(el => (el.textContent||'').trim()).filter(Boolean)
      return JSON.stringify([...new Set(labels)])
    })()`))
    await shot(page, capture('frame-menu'))
    findings.clickedRemoveFrame = await clickMenuLabel('remove frame')
    await delay(800)

    findings.afterUnwrap = JSON.parse(await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      return JSON.stringify({
        frameCount: editor.getCurrentPageShapes().filter(s => s.type === 'frame').length,
        loose: editor.getCurrentPageShapes().filter(s => s.id.startsWith('shape:fx_')).length,
        selected: editor.getSelectedShapeIds().length,
        allOnPage: editor.getCurrentPageShapes().map(s => s.type).sort(),
      })
    })()`))
    await shot(page, capture('after-unwrap'))

    // ---- 3b. The shortcut family, each row an observed document change. ---
    // A real click on empty canvas first: tldraw ignores shortcuts unless its
    // own container holds focus, and a menu that is still open eats them.
    await clickAt(page, 700, 780)
    await delay(250)
    const shapeCount = (type) => `(() => {
      const editor = window.__systemsketch.editor
      return String(editor.getCurrentPageShapes().filter(s => s.type === ${JSON.stringify(type)}).length)
    })()`
    const reselectFixture = `(() => {
      const editor = window.__systemsketch.editor
      const ids = editor.getCurrentPageShapes()
        .filter(s => s.id.startsWith('shape:fx_')).map(s => s.id)
      editor.setSelectedShapes(ids)
      return String(ids.length)
    })()`
    /** Press one chord over the fixture and report what the document did. */
    const press = async (label, modifiers, type, { reselect = true } = {}) => {
      if (reselect) { await evaluate(page, reselectFixture); await delay(200) }
      const before = Number(await evaluate(page, shapeCount(type)))
      await shortcut(page, 'g', 'KeyG', modifiers)
      await delay(700)
      const after = Number(await evaluate(page, shapeCount(type)))
      return { label, observed: `${type}s ${before} -> ${after}`, fires: after !== before }
    }
    const CTRL = 2, ALT = 1, SHIFT = 8, META = 4
    const rows = []
    rows.push(await press('ctrl+g', CTRL, 'group'))
    rows.push(await press('ctrl+shift+g', CTRL | SHIFT, 'group', { reselect: false }))
    rows.push(await press('ctrl+alt+g', CTRL | ALT, 'frame'))
    rows.push(await press('meta+alt+g', META | ALT, 'frame'))
    // The second press of the same chord is tldraw's own inverse.
    const unwrap = await press('meta+alt+g (again)', META | ALT, 'frame', { reselect: false })
    findings.shortcuts = {
      note: 'Driven in the running product with the tl-container focused; each row is the observed document change.',
      ...Object.fromEntries(rows.map((row) => [row.label, row])),
      inverse: unwrap,
    }

    // ---- 4. What does the app's own selection menu offer on multi-select? --
    findings.selectionMenu = JSON.parse(await evaluate(page, `(() => {
      const menu = document.querySelector('[data-testid="systemsketch-selection-menu"]')
      if (!menu) return JSON.stringify({ present: false })
      const buttons = [...menu.querySelectorAll('button')].map(b => ({
        testid: b.dataset.testid || null,
        title: b.getAttribute('title') || b.getAttribute('aria-label') || null,
      }))
      return JSON.stringify({ present: true, buttons })
    })()`))

    list.pass('probe complete')
  } finally {
    process.stdout.write('\n===FINDINGS===\n' + JSON.stringify(findings, null, 2) + '\n')
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(String(error?.stack ?? error) + '\n')
  process.exitCode = 1
})
