#!/usr/bin/env node
/**
 * Real-browser proof that files are browsed inside SystemSketch, and that a
 * board can be opened into a second window.
 *
 * The chooser used to be a `zenity` subprocess the Python host ran inside the
 * HTTP handler: when that GTK process wedged, File > Open wedged with it and
 * the desktop showed "zenity is not responding". This journey drives the app's
 * own browser instead, and asserts the subprocess endpoint is gone for good.
 */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  Cdp,
  ROOT,
  clickElement,
  delay,
  evaluate,
  key,
  localConsoleErrors,
  makeChecklist,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const ASSETS = join(ROOT, 'docs', 'assets')
const SHOT_MENU = join(ASSETS, 'workspace-file-menu.png')
const SHOT_BROWSER = join(ASSETS, 'workspace-browser-open.png')
const SHOT_FILTER = join(ASSETS, 'workspace-browser-filter.png')
const SHOT_FOLDER = join(ASSETS, 'workspace-browser-folder.png')
const SHOT_SECOND_WINDOW = join(ASSETS, 'workspace-second-window.png')
const RESULTS = join(ASSETS, 'workspace-browser-results.json')

/** An empty but valid portable tldraw document. */
function tldrawCore(name) {
  return {
    tldrawFileFormatVersion: 1,
    schema: { schemaVersion: 2, sequences: {} },
    records: [
      { typeName: 'document', id: 'document:document', gridSize: 10, name },
      { typeName: 'page', id: 'page:page', name: 'Page 1', index: 'a1', meta: {} },
    ],
  }
}

/**
 * The suffix decides the encoding, so a fixture must carry the right one: a
 * `.systemsketch` leads with the envelope, a `.tldr` is the bare tldraw file.
 */
function documentFor(path, name) {
  const core = tldrawCore(name)
  return JSON.stringify(
    path.endsWith('.systemsketch')
      ? { systemSketch: { formatVersion: 1, application: 'SystemSketch', shapes: {}, bindings: {} }, ...core }
      : core,
    null,
    2,
  )
}

async function seed(filesRoot) {
  const workspace = join(filesRoot, 'SystemSketch')
  const nested = join(workspace, 'Robotics')
  await mkdir(nested, { recursive: true })
  // Both document types, because the browser has to show both.
  for (const path of [
    join(workspace, 'Arm.systemsketch'),
    join(workspace, 'Gripper.systemsketch'),
    join(workspace, 'Legacy.tldr'),
    join(nested, 'Elbow.systemsketch'),
  ]) {
    await writeFile(path, documentFor(path, path.split('/').pop().replace(/\.[^.]+$/, '')))
  }
  return { workspace, nested }
}

const rowTitles = (page) => evaluate(page, `JSON.stringify(
  Array.from(document.querySelectorAll('[data-testid="workspace-row"]'))
    .map((row) => \`\${row.dataset.kind}:\${row.querySelector('b').textContent}\`))`)

/** What each row says it is: `folder`, `systemsketch`, or `tldraw`. */
const rowKinds = (page) => evaluate(page, `JSON.stringify(
  Array.from(document.querySelectorAll('[data-testid="workspace-row"] small'))
    .map((cell) => cell.dataset.kind))`)

const selectedRow = (page) => evaluate(page, `(() => {
  const row = document.querySelector('[data-testid="workspace-row"].selected')
  return row ? row.querySelector('b').textContent : null
})()`)

const crumbs = (page) => evaluate(page, `JSON.stringify(
  Array.from(document.querySelectorAll('.systemsketch-workspace-crumbs button')).map((crumb) => crumb.textContent))`)

async function shoot(page, path) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(path, Buffer.from(capture.data, 'base64'))
}

async function appTargets(cdpPort, port) {
  const response = await fetch(`http://127.0.0.1:${cdpPort}/json/list`, {
    signal: AbortSignal.timeout(8000),
  })
  return (await response.json()).filter(
    (target) => target.type === 'page' && target.url.includes(`127.0.0.1:${port}/`),
  )
}

async function waitForTargets(cdpPort, port, count, label) {
  const deadline = Date.now() + 15000
  let seen = []
  while (Date.now() < deadline) {
    seen = await appTargets(cdpPort, port)
    if (seen.length >= count) return seen
    await delay(120)
  }
  throw new Error(`Timed out waiting for ${label} (saw ${seen.length} of ${count})`)
}

async function main() {
  const { checks, pass } = makeChecklist()
  const app = await startApp({ label: 'systemsketch-workspace-browser', width: 1400, height: 940 })
  const { page, port, apiPort, cdpPort, filesRoot } = app
  const { workspace, nested } = await seed(filesRoot)
  await mkdir(ASSETS, { recursive: true })

  try {
    // 1. The subprocess chooser is gone from the host, not merely unused.
    const pick = await fetch(`http://127.0.0.1:${apiPort}/api/workspace/pick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'open', currentPath: null }),
      signal: AbortSignal.timeout(8000),
    })
    assert.equal(pick.status, 404, 'the desktop-chooser endpoint still answers')
    pass('the host no longer exposes a subprocess file chooser (/api/workspace/pick → 404)')

    await openApp(page, port, `?board=${encodeURIComponent(join(workspace, 'Arm.systemsketch'))}`)
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-app"]')`, 'the app')
    assert.equal(await evaluate(page, 'document.title'), 'Arm — SystemSketch')
    pass('the window title names the open board, so many windows stay tellable apart')

    // The filename is the editing surface itself: no modal tax for one short
    // name, and Escape returns focus to the same stable launcher.
    await clickElement(page, '.systemsketch-file-title')
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-inline-rename"]')`, 'the inline rename field')
    assert.equal(await evaluate(page, `Boolean(document.querySelector('[data-testid="workspace-dialog"]'))`), false)
    assert.equal(await evaluate(page, 'document.activeElement?.classList.contains("systemsketch-file-title-input")'), true)
    await key(page, 'Escape', 'Escape')
    await waitFor(page, `!document.querySelector('[data-testid="systemsketch-inline-rename"]')`, 'Escape to close inline rename')
    assert.equal(await evaluate(page,
      `document.activeElement?.classList.contains('systemsketch-file-title')`), true)
    pass('the title focuses its useful inline field, Escape cancels it, and focus returns to its launcher')

    // 2. The File menu offers the window, next to the board it already made.
    await clickElement(page, '[data-testid="main-menu.button"]')
    await clickElement(page, '[data-testid="main-menu-sub.file-button"]')
    await waitFor(page,
      `Array.from(document.querySelectorAll('[role="menuitem"]')).some((item) => item.textContent.includes('New window'))`,
      'the File menu')
    const fileMenu = JSON.parse(await evaluate(page, `JSON.stringify(
      Array.from(document.querySelectorAll('[role="menuitem"]')).map((item) => item.textContent.trim()))`))
    assert.ok(fileMenu.some((label) => label.startsWith('New window')), `File menu was ${fileMenu.join(' / ')}`)
    await shoot(page, SHOT_MENU)
    await key(page, 'Escape', 'Escape')
    await key(page, 'Escape', 'Escape')
    pass(`File offers New window beside New and Open… (${fileMenu.slice(0, 4).join(', ')})`)

    // 3. Ctrl+O opens the app's own browser — no second process involved.
    await key(page, 'o', 'KeyO', 2)
    await waitFor(page, `document.querySelector('[data-testid="workspace-dialog"]')`, 'the file browser')
    assert.equal(await evaluate(page, `document.querySelector('#workspace-dialog-title')?.textContent`), 'Open a document')
    assert.equal(await evaluate(page, 'document.activeElement?.dataset.testid'), 'workspace-filter')
    assert.deepEqual(JSON.parse(await rowTitles(page)), [
      'folder:Robotics', 'document:Arm', 'document:Gripper', 'document:Legacy',
    ])
    assert.deepEqual(JSON.parse(await rowKinds(page)), [
      'folder', 'systemsketch', 'systemsketch', 'tldraw',
    ])
    assert.deepEqual(JSON.parse(await crumbs(page)).slice(-1), ['SystemSketch'])
    await evaluate(page, `(() => {
      const focusable = Array.from(document.querySelectorAll(
        '[data-testid="workspace-dialog"] button:not([disabled]), [data-testid="workspace-dialog"] input:not([disabled])'
      )).filter((element) => element.getClientRects().length)
      focusable.at(-1).focus()
    })()`)
    await key(page, 'Tab', 'Tab')
    assert.equal(await evaluate(page, `document.activeElement?.getAttribute('aria-label')`), 'Close')
    await key(page, 'Tab', 'Tab', 8)
    assert.equal(await evaluate(page, 'document.activeElement?.dataset.testid'), 'workspace-confirm')
    await clickElement(page, '[data-testid="workspace-filter"]')
    await shoot(page, SHOT_BROWSER)
    pass('Ctrl+O focuses Filter, traps Tab inside the modal, and names each document\u2019s type')

    // 4. Typing filters the folder; arrow keys and Enter never touch the mouse.
    await clickElement(page, '[data-testid="workspace-filter"]')
    await page.send('Input.insertText', { text: 'grip' })
    await delay(200)
    assert.deepEqual(JSON.parse(await rowTitles(page)), ['document:Gripper'])
    assert.equal(await selectedRow(page), 'Gripper')
    await shoot(page, SHOT_FILTER)
    pass('the filter narrows the folder and pre-selects the match')

    await key(page, 'Enter', 'Enter')
    await waitFor(page, `location.search.includes('Gripper')`, 'the opened board')
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-app"]')`, 'the reopened app')
    assert.equal(await evaluate(page, 'document.title'), 'Gripper — SystemSketch')
    pass('Enter opens the filtered document, and the title follows it')

    // 5. Folders are walked in-app, with a breadcrumb back out.
    await key(page, 'o', 'KeyO', 2)
    await waitFor(page, `document.querySelector('[data-testid="workspace-row"]')`, 'the file rows')
    await clickElement(page, '[data-testid="workspace-row"][data-kind="folder"]')
    await waitFor(page,
      `Array.from(document.querySelectorAll('[data-testid="workspace-row"] b')).some((row) => row.textContent === 'Elbow')`,
      'the nested folder listing')
    assert.deepEqual(JSON.parse(await crumbs(page)).slice(-2), ['SystemSketch', 'Robotics'])
    await shoot(page, SHOT_FOLDER)
    pass('a folder opens in place, and the breadcrumb shows the way back')

    // 6. "Open in new window" makes a second real browser window.
    const before = (await appTargets(cdpPort, port)).length
    assert.equal(before, 1, 'the journey started with more than one window')
    await clickElement(page, '[data-testid="workspace-row"][data-kind="document"]')
    await clickElement(page, '[data-testid="workspace-open-in-new-window"]')
    const opened = await waitForTargets(cdpPort, port, 2, 'the second window')
    const second = opened.find((target) => target.url.includes('Elbow'))
    assert.ok(second, 'the second window did not open the selected board')

    const secondPage = await new Cdp(second.webSocketDebuggerUrl).open()
    await secondPage.send('Runtime.enable')
    await waitFor(secondPage, `document.querySelector('[data-testid="systemsketch-app"]')`, 'the app in window 2')
    assert.equal(await evaluate(secondPage, 'document.title'), 'Elbow — SystemSketch')
    assert.equal(await evaluate(page, 'document.title'), 'Gripper — SystemSketch')
    await shoot(secondPage, SHOT_SECOND_WINDOW)
    pass('“Open in new window” opens the selected board in a second live window')

    // 7. Ctrl+Shift+N is a third window on a fresh untitled board of its own.
    await key(page, 'n', 'KeyN', 10)
    const all = await waitForTargets(cdpPort, port, 3, 'the third window')
    const third = all.find((target) => /Untitled/.test(decodeURIComponent(target.url)))
    assert.ok(third, 'Ctrl+Shift+N did not open a fresh untitled board')
    assert.ok(
      !decodeURIComponent(third.url).includes(join(nested, 'Elbow.systemsketch')),
      'the new window reused an open board instead of a fresh one',
    )
    const thirdPage = await new Cdp(third.webSocketDebuggerUrl).open()
    await thirdPage.send('Runtime.enable')
    await waitFor(thirdPage, `document.querySelector('[data-testid="systemsketch-app"]')`, 'the app in window 3')
    const untitled = await evaluate(thirdPage, 'document.title')
    assert.match(untitled, /^Untitled.* — SystemSketch$/)
    pass(`Ctrl+Shift+N opens a third window on its own board (${untitled})`)
    thirdPage.close()
    secondPage.close()

    const errors = localConsoleErrors(page)
    assert.deepEqual(errors, [], `browser errors: ${errors.join(' | ')}`)
    pass('no browser warnings or errors during the journey')

    await writeFile(RESULTS, JSON.stringify(checks.map((label) => ({ label, ok: true })), null, 1))
    console.log(`\n${checks.length} checks passed.`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
