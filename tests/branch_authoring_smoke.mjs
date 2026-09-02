// Drives the Branch authoring prototypes in docs/branch-authoring-babble-2026-09-02.html
// over CDP with real mouse events and typed text: V1 (inspector lists) end to end,
// V4's derivation of control ports from the arm code, and V2's on-canvas + and rename.
// Asserts the visible board layer and panel after each gesture and writes the
// checklist the report inlines. Static page: only headless Chrome is started.

import { spawn } from 'node:child_process'
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ROOT, delay, findChrome, freePort, newPage, evaluate, waitFor, clickAt } from './browser_harness.mjs'

function makeChecklist() {
  const results = []
  return {
    results,
    add(label, ok) {
      results.push({ label, ok: Boolean(ok) })
      process.stdout.write(`  ${ok ? 'PASS' : 'FAIL'}  ${label}\n`)
    },
  }
}

const REPORT = `file://${join(ROOT, 'docs', 'branch-authoring-babble-2026-09-02.html')}`
const OUT = join(ROOT, 'docs', 'assets', 'branch-authoring-acceptance.json')
const SNAPS = process.env.AUTHORING_SNAPS || ''

async function snap(page, variant, name) {
  if (!SNAPS) return
  const rect = await evaluate(page, `(() => { const r = document.querySelector('.auth[data-variant="${variant}"]'); const b = r.getBoundingClientRect(); return JSON.stringify({ x: b.x + window.scrollX, y: b.y + window.scrollY, width: b.width, height: b.height }) })()`)
  const clip = { ...JSON.parse(rect), scale: 1 }
  const shot = await page.send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: true })
  await writeFile(join(SNAPS, `${name}.png`), Buffer.from(shot.data, 'base64'))
}

async function launch() {
  const chrome = await findChrome()
  const port = await freePort()
  const profile = await mkdtemp(join(tmpdir(), 'ss-authoring-'))
  const env = { ...process.env }
  delete env.DISPLAY
  delete env.WAYLAND_DISPLAY
  const child = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--window-size=1500,1000', 'about:blank',
  ], { stdio: 'ignore', env })
  for (let i = 0; i < 100; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(500) })
      if (response.ok) return { child, port, profile }
    } catch {}
    await delay(100)
  }
  child.kill('SIGKILL')
  throw new Error('Chrome did not expose DevTools')
}

async function state(page, variant) {
  return evaluate(page, `(() => { const r = document.querySelector('.auth[data-variant="${variant}"]'); return r.dataset.step + '/' + r.dataset.board + '/' + Array.from(r.querySelectorAll('.panel')).filter((p) => !p.hidden).map((p) => p.dataset.id).join(',') })()`)
}

async function clickVisible(page, variant, selector) {
  const box = await evaluate(page, `(() => {
    const root = document.querySelector('.auth[data-variant="${variant}"]')
    const els = Array.from(root.querySelectorAll(${JSON.stringify(selector)})).filter((el) => el.offsetParent !== null || el.ownerSVGElement)
    const el = els.find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 })
    if (!el) return null
    el.scrollIntoView({ block: 'center', inline: 'nearest' })
    const r = el.getBoundingClientRect()
    return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 })
  })()`)
  if (!box) throw new Error(`missing visible ${selector} in ${variant}`)
  const { x, y } = JSON.parse(box)
  await clickAt(page, x, y)
}

async function typeEnter(page, variant, act, text) {
  await clickVisible(page, variant, `[data-act="${act}"]`)
  await page.send('Input.insertText', { text })
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  await delay(120)
}

async function main() {
  const { child, port, profile } = await launch()
  const checks = makeChecklist()
  try {
    const page = await newPage(port)
    await page.send('Page.enable')
    await page.send('Runtime.enable')
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: "window.__authErrors = 0; window.addEventListener('error', () => { window.__authErrors += 1 })" })
    await page.send('Page.navigate', { url: REPORT })
    await waitFor(page, `document.readyState === 'complete' && document.querySelectorAll('.auth').length === 5`, 'report loaded')
    checks.add('AUTH-1 five prototypes render', (await evaluate(page, `document.querySelectorAll('.auth').length`)) === 5)
    await snap(page, 'v2', 'v2-s0')
    checks.add('AUTH-2 V1 opens on the bare canvas with the empty inspector', (await state(page, 'v1')) === '0/b0/v1-p0')
    await snap(page, 'v1', 'v1-s0')

    await clickVisible(page, 'v1', '[data-act="v1-menu-branch"]')
    checks.add('AUTH-3 V1 Add › Branch region creates the region and a Branch section in the inspector', (await state(page, 'v1')) === '1/b1/v1-p1')
    await clickVisible(page, 'v1', '[data-act="v1-add-port"]')
    checks.add('AUTH-4 V1 Control ports + opens a name field', (await state(page, 'v1')) === '2/b1/v1-p2')
    await snap(page, 'v1', 'v1-s2')
    await typeEnter(page, 'v1', 'v1-port-name', 'fast')
    checks.add('AUTH-5 V1 naming the port puts fast on the band', (await state(page, 'v1')) === '3/b2/v1-p3')
    const bandDot = await evaluate(page, `(() => { const svg = document.querySelector('.auth[data-variant="v1"] .layer:not([hidden]) svg'); return Array.from(svg.querySelectorAll('text')).some((t) => t.textContent === 'fast' && Number(t.getAttribute('x')) === 452) })()`)
    checks.add('AUTH-6 V1 the band carries the fast dot label at the region\'s left edge', bandDot === true)
    await clickVisible(page, 'v1', '[data-act="v1-add-arm"]')
    checks.add('AUTH-7 V1 Arms + adds a second arm', (await state(page, 'v1')) === '4/b3/v1-p4')
    await typeEnter(page, 'v1', 'v1-arm1-name', 'if fast:')
    checks.add('AUTH-8 V1 arm 1 renamed to if fast:', (await state(page, 'v1')) === '5/b3a/v1-p5')
    await snap(page, 'v1', 'v1-s5')
    await typeEnter(page, 'v1', 'v1-arm2-name', 'else:')
    checks.add('AUTH-9 V1 arm 2 renamed to else:', (await state(page, 'v1')) === '6/b4/v1-p6')
    await clickVisible(page, 'v1', '[data-act="v1-wire"]')
    checks.add('AUTH-10 V1 wiring lands on one plain encode.pose port (two cables end at x=1030)', (await evaluate(page, `(() => { const svg = document.querySelector('.auth[data-variant="v1"] .layer:not([hidden]) svg'); return Array.from(svg.querySelectorAll('path')).filter((p) => /H1030$/.test(p.getAttribute('d'))).length })()`)) === 2)
    await clickVisible(page, 'v1', '[data-act="v1-fold-a2"]')
    checks.add('AUTH-11 V1 fold from the arm row folds else on the canvas', (await state(page, 'v1')) === '8/b6/v1-p8')
    await clickVisible(page, 'v1', '[data-act="v1-active-a1"]')
    checks.add('AUTH-12 V1 make-active from the arm row fades the other arm', (await state(page, 'v1')) === '9/b8/v1-p9')
    await snap(page, 'v1', 'v1-s9')

    await clickVisible(page, 'v4', '[data-act="v4-menu-branch"]')
    await typeEnter(page, 'v4', 'v4-line1', 'if fast:')
    checks.add('AUTH-13 V4 typing "if fast:" names the arm and derives the fast control port', (await state(page, 'v4')) === '2/c2/v4-p2')
    const derived = await evaluate(page, `document.querySelectorAll('.auth[data-variant="v4"] .panel:not([hidden]) .mi-row--derived').length`)
    checks.add('AUTH-14 V4 the derived list shows exactly one port after one line', derived === 1)
    await typeEnter(page, 'v4', 'v4-line2', 'elif gain > 1:')
    checks.add('AUTH-15 V4 an elif that reads gain derives a second band dot', (await state(page, 'v4')) === '3/c3b/v4-p3')
    const twoDots = await evaluate(page, `(() => { const svg = document.querySelector('.auth[data-variant="v4"] .layer:not([hidden]) svg'); return Array.from(svg.querySelectorAll('text')).filter((t) => Number(t.getAttribute('x')) === 452 && ['fast','gain'].includes(t.textContent)).length })()`)
    checks.add('AUTH-16 V4 the band now carries fast and gain', twoDots === 2)
    await snap(page, 'v4', 'v4-s3')

    await clickVisible(page, 'v2', '[data-act="v2-menu-branch"]')
    await clickVisible(page, 'v2', '[data-act="v2-plus-port"]')
    await typeEnter(page, 'v2', 'v2-port-name', 'fast')
    checks.add('AUTH-17 V2 the + on the band adds and names a control port without the inspector', (await state(page, 'v2')) === '3/b2/v2-note')
    await clickVisible(page, 'v2', '[data-act="v2-plus-arm"]')
    await typeEnter(page, 'v2', 'v2-arm1-name', 'if fast:')
    checks.add('AUTH-18 V2 + arm and click-to-edit rename work on the canvas', (await state(page, 'v2')) === '5/b3a/v2-note')
    await snap(page, 'v2', 'v2-s5')
    await snap(page, 'v3', 'v3-s0')
    await snap(page, 'v5', 'v5-s0')

    checks.add('AUTH-19 no script errors while driving', (await evaluate(page, `window.__authErrors || 0`)) === 0)
  } finally {
    child.kill('SIGKILL')
    await rm(profile, { recursive: true, force: true })
  }
  await mkdir(join(ROOT, 'docs', 'assets'), { recursive: true })
  await writeFile(OUT, JSON.stringify(checks.results, null, 2))
  const failed = checks.results.filter((c) => !c.ok)
  console.log(`${checks.results.length - failed.length}/${checks.results.length} passed → ${OUT}`)
  process.exit(failed.length ? 1 : 0)
}

main().catch((error) => { console.error(error); process.exit(1) })
