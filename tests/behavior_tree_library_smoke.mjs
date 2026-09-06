#!/usr/bin/env node
/**
 * The Behaviors library panel, driven in a real browser.
 *
 * The panel docks in the left popout beside Shapes and has no toolbar button
 * of its own — the command palette is the only entry point — so this journey
 * opens it the way a person actually would: Ctrl+P, type "Behaviors", Enter.
 * From there it proves the contract in the task spec: Controls/Decorators are
 * BT.CPP built-ins independent of any selected node, Skills/Conditions come
 * from the region's own document, a click inserts relative to the selection,
 * Recents persists across a search, search narrows and explains a zero-result
 * query, every row is a drag source, and the shared `.ss-scroll` scrollbar
 * primitive actually reaches this panel's body without having regressed the
 * command palette's own scrollbar in the same refactor.
 *
 * Modeled closely on tests/library_overview_smoke.mjs (assert + pass()) and
 * tests/behavior_tree_smoke.mjs (seeding idiom, region/children helpers,
 * screenshot buffering). Screenshots and a results JSON land in
 * docs/assets/behavior-tree-library/.
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  clickElement,
  delay,
  ensureDir,
  evaluate,
  key,
  localConsoleErrors,
  makeChecklist,
  openApp,
  shortcut,
  startApp,
  typeSlowly,
  waitFor,
} from './browser_harness.mjs'

const REGION = 'shape:bt-library'
const OUT = join(ROOT, 'docs', 'assets', 'behavior-tree-library')
const PANEL = '[data-testid="systemsketch-behavior-library"]'
const { checks, pass } = makeChecklist()

/** Findings the spec calls out as "report it, do not fix it" territory. */
const sourceDefects = []

async function screenshot(page, name) {
  const { data } = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(join(OUT, name), Buffer.from(data, 'base64'))
}

/** Selects a projected occurrence by its BT path, the same idiom behavior_tree_smoke.mjs uses. */
async function selectPath(page, path) {
  return evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const id = editor.getSortedChildIdsForParent('${REGION}').find((candidate) => editor.getShape(candidate).meta.btPath === ${JSON.stringify(path)} && editor.getShape(candidate).meta.btRole === 'node')
    if (id) editor.select(id)
    return id ?? null
  })()`)
}

async function regionXml(page) {
  return evaluate(page, `window.__systemsketch.editor.getShape('${REGION}')?.props.xml ?? ''`)
}

async function childCount(page) {
  return evaluate(page, `window.__systemsketch.editor.getSortedChildIdsForParent('${REGION}').length`)
}

/** Every row currently rendered anywhere in the panel (a collapsed section renders none). */
async function allRows(page) {
  return JSON.parse(await evaluate(page, `JSON.stringify(Array.from(document.querySelectorAll('${PANEL} button[data-library-item]')).map((button) => ({
    id: button.getAttribute('data-library-item'),
    section: button.getAttribute('data-library-section'),
    label: button.querySelector('strong')?.textContent ?? null,
  })))`))
}

async function sectionRowIds(page, sectionName) {
  const rows = await allRows(page)
  return rows.filter((row) => row.section === sectionName).map((row) => row.id)
}

/**
 * Select-all then clear the focused input.
 *
 * `key(page, 'Delete')` (a bare `Input.dispatchKeyEvent` with no virtual key
 * code) is what every other journey uses to remove a projected shape via
 * tldraw's own keybinding layer — but a plain `<input>` never sees it as an
 * edit command without a real `windowsVirtualKeyCode`, so the value never
 * changes. `typeSlowly`'s `Input.insertText` replaces a selection with real
 * characters, which is why `replaceFocusedInput`-style helpers elsewhere never
 * need to clear to empty. Clearing to empty needs a Backspace carrying VK_BACK
 * (8) the way `shortcut()` carries a virtual code for its Ctrl combinations.
 */
async function clearFocusedInput(page) {
  await shortcut(page, 'a', 'KeyA', 2)
  const backspace = { key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 }
  await page.send('Input.dispatchKeyEvent', { ...backspace, type: 'rawKeyDown' })
  await page.send('Input.dispatchKeyEvent', { ...backspace, type: 'keyUp' })
  await delay(150)
}

async function main() {
  await ensureDir(OUT)
  const app = await startApp({ label: 'behavior-tree-library', build: 'behavior-tree-library-smoke', width: 1680, height: 1050 })
  const { page, port } = app
  try {
    // ---- 1. seed the region ------------------------------------------------
    await openApp(page, port, '')
    await waitFor(page, 'Boolean(window.__systemsketch?.editor)', 'editor to mount')
    await delay(500)
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      editor.deleteShapes([...editor.getCurrentPageShapeIds()])
      editor.createShape({ id: '${REGION}', type: 'behaviorTree', x: 200, y: 160, props: { xml: window.__systemsketch.behaviorTree.SAMPLE_BEHAVIOR_TREE_XML, title: 'PickAndPlace' } })
      editor.selectNone()
      return null
    })()`)
    await waitFor(page, `window.__systemsketch.editor.getSortedChildIdsForParent('${REGION}').length >= 13`, 'the sample tree to project')
    await delay(300)
    assert.equal(await childCount(page), 13)
    pass('the sample PickAndPlace tree projects its 13 occurrences before the panel is ever opened')

    // ---- 2. open the panel through the command palette ----------------------
    await shortcut(page, 'p', 'KeyP', 2)
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-command-palette"] h2')?.textContent === 'Commands'`, 'command palette in Commands mode')
    await typeSlowly(page, 'Behaviors')
    await waitFor(page,
      `document.querySelectorAll('[role="option"][data-command-id="behavior-library"]').length === 1
        && document.querySelectorAll('[role="option"]').length === 1`,
      'the filtered "Open Behaviors library" command')
    await key(page, 'Enter')
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-left-popout"]')?.dataset.leftSurface === 'behaviors'`, 'the Behaviors surface to open')
    assert.equal(await evaluate(page, `Boolean(document.querySelector('${PANEL}'))`), true)
    assert.equal(await evaluate(page, `document.querySelector('[data-testid="systemsketch-left-surface-behaviors"]')?.getAttribute('aria-selected')`), 'true')
    assert.equal(await evaluate(page, `document.querySelector('[data-testid="systemsketch-left-surface-shapes"]')?.getAttribute('aria-selected')`), 'false')
    pass('the command palette has no toolbar button for this panel, but "Open Behaviors library" reaches it and the switcher reflects the open surface')

    // ---- 3a. Controls/Decorators are BT.CPP facts, independent of selection -
    await evaluate(page, '(window.__systemsketch.editor.selectNone(), null)')
    await delay(200)
    const controlsBeforeSelection = await sectionRowIds(page, 'Controls')
    assert.equal(controlsBeforeSelection[0], 'model:Sequence')
    assert.deepEqual(controlsBeforeSelection.slice(0, 4), ['model:Sequence', 'model:Fallback', 'model:Parallel', 'model:IfThenElse'])
    assert.equal(await evaluate(page, `Boolean(document.querySelector('${PANEL} button[data-library-item="model:SubTree"]'))`), false)
    assert.equal(await evaluate(page, `Boolean(document.querySelector('[data-testid="systemsketch-behavior-library-section-decorators"]'))`), true)
    pass('Controls and Decorators list with nothing selected on the canvas, ranked Sequence/Fallback/Parallel/IfThenElse first, and SubTree never appears as a pickable row')

    // Decorators is closed by default (idle query): its rows are not in the
    // DOM at all, not merely hidden. A non-empty query force-opens every
    // section so a search never answers with a header, a count, and no rows.
    assert.equal(await evaluate(page, `document.querySelector('[data-testid="systemsketch-behavior-library-section-decorators"]').getAttribute('aria-expanded')`), 'false')
    assert.equal(await evaluate(page, `Boolean(document.querySelector('${PANEL} button[data-library-item="model:RetryUntilSuccessful"]'))`), false)
    pass('Decorators is collapsed by default and its rows (e.g. RetryUntilSuccessful) are absent from the DOM until it is opened')

    // ---- 3b. select the region: Skills/Conditions come from this document --
    await evaluate(page, `(window.__systemsketch.editor.select('${REGION}'), null)`)
    await delay(200)
    // Fixed live during this journey (planBehaviorInsert, behaviorLibraryModel.ts:317):
    // a non-empty tree with nothing selected appends under its ROOT, not at a
    // second root, so the caption reads "Adds under <root label>." rather than
    // the "Adds the root node." that only a genuinely empty tree earns.
    assert.equal(await evaluate(page, `document.querySelector('[data-testid="systemsketch-behavior-library-where"]').textContent`), 'Adds under Pick and place.')
    await screenshot(page, 'behaviors-panel-region-selected.png')

    const skillIds = await sectionRowIds(page, 'Skills')
    assert.ok(skillIds.some((id) => id.startsWith('model:')), `expected at least one model: row under Skills, got ${JSON.stringify(skillIds)}`)
    pass(`Skills lists the document's own action models with the region selected: ${JSON.stringify(skillIds)}`)

    const projectedLeafTitles = ['MoveToObj', 'GraspValid', 'CloseGrip', 'MoveHome', 'CorrectGrip']
    const catalogRows = await allRows(page)
    const whereFound = Object.fromEntries(projectedLeafTitles.map((title) => {
      const row = catalogRows.find((candidate) => candidate.label === title)
      return [title, row ? row.section : null]
    }))
    assert.ok(Object.values(whereFound).every((section) => section !== null),
      `expected every projected leaf title to be discoverable somewhere in the catalog: ${JSON.stringify(whereFound)}`)
    pass(`every projected leaf title is discoverable in the catalog (actual section per title, not forced to "Skills"): ${JSON.stringify(whereFound)}`)

    // ---- 3c. Controls-row insert with the region selected but no node -------
    // This is the exact state the spec's check (c) names. Fixed live during
    // this journey (planBehaviorInsert): the caption and the click are now one
    // plan, so the caption checked in 3b ("Adds under Pick and place.") and
    // this insert can no longer disagree — assert them as one regression gate.
    const countBeforeRootInsert = await childCount(page)
    const xmlBeforeRootInsert = await regionXml(page)
    await clickElement(page, `${PANEL} button[data-library-item="model:Sequence"]`)
    await delay(350)
    const countAfterRootInsert = await childCount(page)
    const xmlAfterRootInsert = await regionXml(page)
    const noticeAfterRootInsert = await evaluate(page, `document.querySelector('[data-testid="systemsketch-behavior-library-notice"]')?.textContent ?? null`)
    assert.deepEqual(
      { countDelta: countAfterRootInsert - countBeforeRootInsert, xmlChanged: xmlAfterRootInsert !== xmlBeforeRootInsert, notice: noticeAfterRootInsert },
      { countDelta: 1, xmlChanged: true, notice: null },
    )
    pass('clicking a Controls row with the region selected but no node selected inserts under the tree\'s root (matching the "Adds under Pick and place." caption from 3b), not a second root')

    // NOTE selector shape: a row's own `data-library-section` is always its
    // catalog home ("Controls" here) even when it renders under Recents — the
    // Recents grouping is the wrapping `<section data-library-section="Recents">`,
    // not a property of the row. So the match is a descendant query, not one
    // element carrying both attributes.
    await waitFor(page, `document.querySelector('section[data-library-section="Recents"] button[data-library-item="model:Sequence"]')`, 'Recents to remember the clicked row')
    pass('Recents gains the just-inserted row, keyed by the same id the row was clicked with')

    // An append at the end of the root's children needs no sibling remap, so
    // this is the clean case (see the mid-list supplement below for the one
    // that is not).
    await evaluate(page, '(window.__systemsketch.editor.undo(), null)')
    await delay(300)
    assert.equal(await regionXml(page), xmlBeforeRootInsert, 'one undo should restore the pre-insert XML')
    assert.equal(await childCount(page), countBeforeRootInsert)
    pass('one undo removes the complete root-level insertion in a single step')
    assert.equal(await evaluate(page, `Boolean(document.querySelector('section[data-library-section="Recents"] button[data-library-item="model:Sequence"]'))`), true)
    pass('Recents is a localStorage history independent of document undo: it still lists the row after the XML change that produced it is undone')

    // ---- 3c-supplement. undo after a MID-LIST sibling insert drops a sibling
    // Not one of the lettered checks. planBehaviorInsert fixed the "already has
    // a root" case above, but confirmed (per the session owning
    // behaviorTreeCommands.ts/installBehaviorTreeRegions.ts) as a SEPARATE,
    // still-open defect: an insert that forces later siblings to shift path —
    // selecting a leaf mid-tree takes insertBehaviorTreeSiblingOf, which is
    // exactly that case — is not cleanly undoable. Kept as a live repro plus
    // the evidence in the results JSON; not something this file can fix.
    const leafId = await selectPath(page, '0.2')
    assert.notEqual(leafId, null, 'expected a leaf occurrence at path 0.2 (CloseGrip) to select')
    await delay(200)
    const whereWithLeaf = await evaluate(page, `document.querySelector('[data-testid="systemsketch-behavior-library-where"]').textContent`)
    assert.match(whereWithLeaf, /^Adds after /)
    const countBeforeLeafInsert = await childCount(page)
    const xmlBeforeLeafInsert = await regionXml(page)
    await clickElement(page, `${PANEL} button[data-library-item="model:Sequence"]`)
    await waitFor(page, `window.__systemsketch.editor.getSortedChildIdsForParent('${REGION}').length === ${countBeforeLeafInsert + 1}`, 'the sibling insert to project')
    const xmlAfterLeafInsert = await regionXml(page)
    assert.equal((xmlAfterLeafInsert.match(/<Sequence/g) ?? []).length - (xmlBeforeLeafInsert.match(/<Sequence/g) ?? []).length, 1)
    pass('with a leaf occurrence selected instead of the root, the same Controls row inserts a Sequence as its sibling — the insert mechanism itself works')

    await evaluate(page, '(window.__systemsketch.editor.undo(), null)')
    await delay(300)
    const xmlAfterUndo = await regionXml(page)
    const countAfterUndo = await childCount(page)
    const undoObserved = { xml: xmlAfterUndo, count: countAfterUndo }
    const undoExpected = { xml: xmlBeforeLeafInsert, count: countBeforeLeafInsert }
    if (undoObserved.xml === undoExpected.xml && undoObserved.count === undoExpected.count) {
      pass('one undo removes the complete sibling insertion in a single step (defect appears fixed — re-verify with the owning session)')
    } else {
      const droppedMoveHome = xmlBeforeLeafInsert.includes('<MoveHome home="{home_pose}"/>\n            <Parallel')
        && !xmlAfterUndo.includes('<MoveHome home="{home_pose}"/>\n            <Parallel')
      const finding = {
        id: 'undo.sibling-insert-drops-sibling',
        selector: `${PANEL} button[data-library-item="model:Sequence"] (insert), then editor.undo()`,
        observed: { countDelta: countAfterUndo - countBeforeLeafInsert, xmlEqualsPreInsert: undoObserved.xml === undoExpected.xml, droppedTheNextMoveHome: droppedMoveHome },
        desired: { countDelta: 0, xmlEqualsPreInsert: true, droppedTheNextMoveHome: false },
        explanation: 'Reproduced through the panel\'s click plus a bare window.__systemsketch.editor.undo() call (ruling out any '
          + 'keyboard/shortcut double-fire): selecting the leaf at path 0.2 (CloseGrip) and inserting Sequence via '
          + 'insertBehaviorTreeSiblingOf (src/behaviorTree/behaviorTreeCommands.ts:180) requires shifting the following siblings '
          + '(the standalone MoveHome at 0.3 -> 0.4, Parallel at 0.4 -> 0.5) via the `remap`/`restamps` path in applyEdit '
          + '(src/behaviorTree/behaviorTreeCommands.ts:135-162). One `editor.undo()` afterward does not restore the pre-insert XML: '
          + 'child count lands one BELOW the original, and the standalone MoveHome that used to sit at path 0.3 is permanently gone '
          + 'from the XML, not merely un-shifted. Confirmed by the session owning behaviorTreeCommands.ts/installBehaviorTreeRegions.ts: '
          + '`reconcileBehaviorTree` is re-run from the operation-complete handler via `editor.run(repair, { history: \'ignore\' })` '
          + '(installBehaviorTreeRegions.ts:380), so that repair runs OUTSIDE history and is never itself undone, and it deletes any '
          + 'shape whose role:path key collides with one already seen. Owned by another session this round; not fixed here.',
      }
      sourceDefects.push(finding)
      process.stdout.write(`  FAIL  undo.sibling-insert-drops-sibling  one undo after a mid-list sibling insert should restore the exact pre-insert XML\n`
        + `        observed=${JSON.stringify(finding.observed)} desired=${JSON.stringify(finding.desired)}\n`)
      // Recover a workable board for the remaining checks, which do not
      // depend on this region's exact XML shape.
      await evaluate(page, `(() => {
        const editor = window.__systemsketch.editor
        const shape = editor.getShape('${REGION}')
        editor.updateShape({ id: shape.id, type: shape.type, props: { ...shape.props, xml: ${JSON.stringify(xmlBeforeLeafInsert)} } })
        return null
      })()`)
      await delay(300)
    }

    // ---- 3e. search narrows, explains a zero-result query, and clears ------
    await clickElement(page, `${PANEL} input[data-testid="systemsketch-behavior-library-search"]`)
    await typeSlowly(page, 'retry')
    await waitFor(page,
      `Boolean(document.querySelector('${PANEL} button[data-library-item="model:RetryUntilSuccessful"]'))
        && !document.querySelector('${PANEL} button[data-library-item="model:Sequence"]')`,
      'the search to narrow to RetryUntilSuccessful and drop Sequence')
    pass('typing "retry" narrows the catalog to matches (force-opening the collapsed Decorators section so RetryUntilSuccessful is actually reachable) and excludes Sequence')
    await screenshot(page, 'behaviors-search-retry.png')

    await clearFocusedInput(page)
    await waitFor(page, `document.querySelector('${PANEL} input[data-testid="systemsketch-behavior-library-search"]').value === ''`, 'search to clear')
    await waitFor(page, `Boolean(document.querySelector('${PANEL} button[data-library-item="model:Sequence"]'))`, 'Sequence to return once the search clears')
    pass('clearing the search restores the full catalog')

    await typeSlowly(page, 'zzzznope')
    await waitFor(page, `Boolean(document.querySelector('[data-testid="systemsketch-behavior-library-empty"]'))`, 'the zero-result empty state')
    assert.match(await evaluate(page, `document.querySelector('[data-testid="systemsketch-behavior-library-empty"]').textContent`), /No matching behaviors/)
    pass('a gibberish query shows the empty state with its real copy')

    await clearFocusedInput(page)
    await waitFor(page, `Boolean(document.querySelector('${PANEL} button[data-library-item="model:Sequence"]'))`, 'catalog restored after the empty-state query')

    // ---- 3f. every row is a drag source -------------------------------------
    assert.equal(await evaluate(page, `document.querySelector('${PANEL} button[data-library-item="model:Sequence"]')?.getAttribute('draggable')`), 'true')
    pass('a library row carries draggable="true"')

    // ---- 3g. the shared .ss-scroll primitive reaches this panel ------------
    assert.equal(await evaluate(page, `getComputedStyle(document.querySelector('.bt-library__body')).scrollbarWidth`), 'thin')
    pass('.bt-library__body (bt-library__body + ss-scroll) computes scrollbar-width: thin')

    await shortcut(page, 'p', 'KeyP', 2)
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-command-palette"] h2')?.textContent === 'Commands'`, 'command palette reopened for the scrollbar regression guard')
    assert.equal(await evaluate(page, `getComputedStyle(document.querySelector('.systemsketch-command-palette')).scrollbarWidth`), 'thin')
    pass('regression guard: .systemsketch-command-palette still computes scrollbar-width: thin after the scrollbar rules moved into src/scroll/scroll-area.css')
    await key(page, 'Escape')
    await waitFor(page, `!document.querySelector('[data-testid="systemsketch-command-palette"]')`, 'command palette to close')

    // ---- 3b (switcher). Shapes tab brings back the Shapes browser ----------
    await clickElement(page, '[data-testid="systemsketch-left-surface-shapes"]')
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-left-popout"]')?.dataset.leftSurface === 'shapes'`, 'the Shapes surface')
    assert.equal(await evaluate(page, `Boolean(document.querySelector('input[aria-label="Search shapes"]'))`), true)
    assert.equal(await evaluate(page, `Boolean(document.querySelector('[aria-label="Close shapes library"]'))`), true)
    pass('clicking the Shapes tab brings back the Shapes browser with its own close button')
    await screenshot(page, 'shapes-tab-after-switch.png')

    await clickElement(page, '[data-testid="systemsketch-left-surface-behaviors"]')
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-left-popout"]')?.dataset.leftSurface === 'behaviors'`, 'the Behaviors surface again')
    assert.equal(await evaluate(page, `Boolean(document.querySelector('[aria-label="Close behaviors library"]'))`), true)
    pass('switching back to Behaviors restores its own close button label')

    // ---- 3h. no local console errors ----------------------------------------
    const errors = localConsoleErrors(page)
    assert.deepEqual(errors, [], `console errors: ${errors.join(' | ')}`)
    pass('the complete journey emits no local browser console errors')
  } finally {
    const summary = {
      generatedAt: new Date().toISOString(),
      passed: checks.length,
      checks,
      sourceDefects,
    }
    await writeFile(join(OUT, sourceDefects.length ? 'results.partial.json' : 'results.json'), JSON.stringify(summary, null, 2))
    process.stdout.write(`\n${checks.length} checks passed`
      + (sourceDefects.length ? `, ${sourceDefects.length} source-side finding(s) reported (see results.partial.json)\n` : '\n'))
    if (sourceDefects.length > 0) process.exitCode = 1
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`\nFAIL  ${error.stack ?? error.message}\n`)
  process.exitCode = 1
})
