// Drives the Case-view prototype (second pass) in docs/branch-regions-2026-09-02.html
// with real mouse events over CDP: fold chevrons and make-active targets on the
// canvas, the open checkboxes, the active radios, and Case view's one-open rule on
// both the outer and the nested region. Asserts which pre-rendered layer is visible
// after each gesture and writes the checklist the report inlines.
//
// The page is a static file, so no app server is started; only headless Chrome.

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

const REPORT = `file://${join(ROOT, 'docs', 'branch-regions-2026-09-02.html')}`
const OUT = join(ROOT, 'docs', 'assets', 'branch-case-view-acceptance.json')

async function launch() {
  const chrome = await findChrome()
  const port = await freePort()
  const profile = await mkdtemp(join(tmpdir(), 'ss-case-view-'))
  const env = { ...process.env }
  delete env.DISPLAY
  delete env.WAYLAND_DISPLAY
  const child = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--window-size=1400,1000', 'about:blank',
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

async function visibleLayer(page, board) {
  return evaluate(page, `Array.from(document.querySelectorAll('.proto[data-board="${board}"] .layer')).filter((l) => !l.hidden).map((l) => l.id).join(',')`)
}

async function clickSelector(page, selector) {
  const box = await evaluate(page, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) return null
    el.scrollIntoView({ block: 'center', inline: 'nearest' })
    const r = el.getBoundingClientRect()
    return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 })
  })()`)
  if (!box) throw new Error(`missing ${selector}`)
  const { x, y } = JSON.parse(box)
  await clickAt(page, x, y)
}

async function main() {
  const { child, port, profile } = await launch()
  const checks = makeChecklist()
  try {
    const page = await newPage(port)
    await page.send('Page.enable')
    await page.send('Runtime.enable')
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: "window.__caseViewErrors = 0; window.addEventListener('error', () => { window.__caseViewErrors += 1 })" })
    await page.send('Page.navigate', { url: REPORT })
    await waitFor(page, `document.readyState === 'complete' && document.querySelectorAll('.proto').length === 3`, 'report loaded')
    checks.add('CASE-1 three boards, 94 pre-rendered (view, open, active) layers', (await evaluate(page, `document.querySelectorAll('.proto .layer').length`)) === 94)
    checks.add('CASE-2 board a opens Expanded, both arms open, no active arm', (await visibleLayer(page, 'a')) === 'a-exp-oif+else-ix-anone')

    await clickSelector(page, '#a-exp-oif\\+else-ix-anone .hit[data-action="fold"][data-arm="else"]')
    checks.add('CASE-3 clicking the else header folds it to its header row', (await visibleLayer(page, 'a')) === 'a-exp-oif-ix-anone')
    const foldedCables = await evaluate(page, `(() => {
      const svg = document.querySelector('#a-exp-oif-ix-anone svg')
      const paths = Array.from(svg.querySelectorAll('path')).filter((p) => p.getAttribute('stroke') === '#6b7280').map((p) => p.getAttribute('d'))
      const intoFold = paths.filter((d) => /H440$/.test(d)).length
      const outOfFold = paths.filter((d) => /^M900,/.test(d)).length
      return intoFold + ':' + outOfFold
    })()`)
    checks.add('CASE-4 the folded arm\'s cables attach at its header edges (1 in at x=440, 1 out from x=900)', foldedCables === '1:1')
    await clickSelector(page, '#a-exp-oif-ix-anone .hit[data-action="active"][data-arm="if"]')
    checks.add('CASE-5 the target on the if header makes if active', (await visibleLayer(page, 'a')) === 'a-exp-oif-ix-aif')
    const faded = await evaluate(page, `(() => {
      const svg = document.querySelector('#a-exp-oif-ix-aif svg')
      return Array.from(svg.querySelectorAll('path')).filter((p) => p.getAttribute('opacity') === '0.18').length
    })()`)
    checks.add('CASE-6 with if active, the else arm\'s two cables fade to 18%', faded === 2)
    await clickSelector(page, '#a-exp-oif-ix-aif .hit[data-action="active"][data-arm="if"]')
    checks.add('CASE-7 clicking the active target again clears it: all arms active', (await visibleLayer(page, 'a')) === 'a-exp-oif-ix-anone')
    await clickSelector(page, '#a-exp-oif-ix-anone .hit[data-action="fold"][data-arm="else"]')
    checks.add('CASE-8 clicking the folded header opens it again', (await visibleLayer(page, 'a')) === 'a-exp-oif+else-ix-anone')

    await clickSelector(page, 'input[name="a-view"][value="case"]')
    checks.add('CASE-9 Case view keeps only the first open arm', (await visibleLayer(page, 'a')) === 'a-case-oif-ix-anone')
    const caseCables = await evaluate(page, `document.querySelectorAll('#a-case-oif-ix-anone svg path[stroke]').length`)
    checks.add('CASE-9b in Case view only the open case\'s wires are drawn (6 cables, none to the folded else row)', caseCables === 6)
    await clickSelector(page, '#a-case-oif-ix-anone .hit[data-action="fold"][data-arm="else"]')
    checks.add('CASE-10 in Case view opening else folds if', (await visibleLayer(page, 'a')) === 'a-case-oelse-ix-anone')
    await clickSelector(page, '#a-case-oelse-ix-anone .hit[data-action="fold"][data-arm="else"]')
    checks.add('CASE-11 in Case view folding the open arm leaves every arm folded', (await visibleLayer(page, 'a')) === 'a-case-onone-ix-anone')
    const headerDot = await evaluate(page, `(() => {
      const svg = document.querySelector('#a-case-onone-ix-anone svg')
      const control = Array.from(svg.querySelectorAll('path')).filter((p) => p.getAttribute('marker-end') === 'url(#arrow)')
      return control.length + ':' + (control[0] ? /H440$/.test(control[0].getAttribute('d')) : false)
    })()`)
    checks.add('CASE-12 the condition cable lands on the Branch band, not on an arm', headerDot === '1:true')

    checks.add('CASE-13 nested board opens with every arm and inner arm open', (await visibleLayer(page, 'c')) === 'c-exp-ofast+safe+else-iif+unchanged-anone')
    await clickSelector(page, '#c-exp-ofast\\+safe\\+else-iif\\+unchanged-anone .hit[data-action="fold"][data-region="inner"][data-arm="unchanged"]')
    checks.add('CASE-14 folding the inner (unchanged) lane keeps the pass-through as in-and-out of its header', (await visibleLayer(page, 'c')) === 'c-exp-ofast+safe+else-iif-anone')
    await clickSelector(page, '#c-exp-ofast\\+safe\\+else-iif-anone .hit[data-action="fold"][data-region="outer"][data-arm="safe"]')
    checks.add('CASE-15 folding safe folds the nested region with it', (await visibleLayer(page, 'c')) === 'c-exp-ofast+else-ix-anone')
    await clickSelector(page, 'input[name="c-view"][value="case"]')
    checks.add('CASE-16 Case view on the nested board keeps only fast open', (await visibleLayer(page, 'c')) === 'c-case-ofast-ix-anone')
    await clickSelector(page, '#c-case-ofast-ix-anone .hit[data-action="fold"][data-region="outer"][data-arm="safe"]')
    checks.add('CASE-17 opening safe in Case view folds fast and keeps one inner arm open', (await visibleLayer(page, 'c')) === 'c-case-osafe-iif-anone')
    await clickSelector(page, '#c-case-osafe-iif-anone .hit[data-action="active"][data-arm="safe"]')
    checks.add('CASE-18 make-active works in Case view too', (await visibleLayer(page, 'c')) === 'c-case-osafe-iif-asafe')

    await clickSelector(page, 'input[name="b-open"][value="if"]')
    await clickSelector(page, 'input[name="b-open"][value="else"]')
    checks.add('CASE-19 optional returns: both arms folded to headers via the checkboxes', (await visibleLayer(page, 'b')) === 'b-exp-onone-ix-anone')
    const rows = await evaluate(page, `(() => {
      const svg = document.querySelector('#b-exp-onone-ix-anone svg')
      return Array.from(svg.querySelectorAll('path')).filter((d) => /^M1060,/.test(d.getAttribute('d'))).length
    })()`)
    checks.add('CASE-20 each folded header still feeds its boundary output row (2 cables leave x=1060)', rows === 2)
    const slots = await evaluate(page, `document.querySelectorAll('.proto[data-board="a"] .layer circle[r="3.6"]').length`)
    checks.add('CASE-21 one plain port at the consumer: no sub-slot dots anywhere on board a', slots === 0)
    checks.add('CASE-22 no script errors while driving', (await evaluate(page, `window.__caseViewErrors || 0`)) === 0)
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
