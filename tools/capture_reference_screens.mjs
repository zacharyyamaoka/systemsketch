/**
 * Capture reference screenshots from Enso, Nevalang and unit for a docs report.
 *
 * Prior-art claims in `docs/` are supposed to be looked at, not paraphrased, so
 * this drives a throwaway headless Chrome over the public sites and writes PNGs
 * into `docs/assets/`. It reuses `tests/browser_harness.mjs` so the capture path
 * is the same CDP client every journey already uses — the one difference is that
 * the host-resolver block is dropped, because these targets are on the public
 * internet rather than on 127.0.0.1.
 *
 * unit's editor (unit.land) never finishes booting under headless Chrome, so its
 * evidence comes from the project's own documented interaction recordings, laid
 * out on a local contact sheet and rendered by the same browser. Those are the
 * gestures the `Getting Started` doc actually specifies, which is the thing this
 * report makes claims about.
 *
 * Run:  node tools/capture_reference_screens.mjs
 */
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ROOT, delay, findChrome, newPage, evaluate } from '../tests/browser_harness.mjs'

const ASSETS = join(ROOT, 'docs', 'assets')

async function waitForDevTools(profileDir, timeoutMs = 30000) {
  const portFile = join(profileDir, 'DevToolsActivePort')
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const [port] = (await readFile(portFile, 'utf8')).split('\n')
      if (port) return Number(port)
    } catch { /* not written yet */ }
    await delay(120)
  }
  throw new Error('Chrome never published a DevTools port')
}

async function launch({ width = 1440, height = 900, scale = 2 } = {}) {
  const chromePath = await findChrome()
  const profile = await mkdtemp(join(tmpdir(), 'ss-refshot-'))
  const env = { ...process.env }
  delete env.DISPLAY
  delete env.WAYLAND_DISPLAY
  const proc = spawn(chromePath, [
    '--headless=new', '--disable-dev-shm-usage', '--disable-gpu', '--no-sandbox',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--remote-allow-origins=*', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
    '--hide-scrollbars', `--force-device-scale-factor=${scale}`,
    `--user-data-dir=${profile}`, `--window-size=${width},${height}`, 'about:blank',
  ], { stdio: 'ignore', env })
  const cdpPort = await waitForDevTools(profile)
  const page = await newPage(cdpPort)
  await page.send('Page.enable')
  await page.send('Runtime.enable')
  return { proc, page }
}

async function shoot(page, name, clip) {
  // A `clip` is in PAGE coordinates, so it must be paired with
  // captureBeyondViewport — scrolling first and clipping too double-counts the
  // offset and silently returns the neighbouring element.
  const params = { format: 'png', captureBeyondViewport: Boolean(clip) }
  if (clip) params.clip = { ...clip, scale: 2 }
  const { data } = await page.send('Page.captureScreenshot', params)
  const buffer = Buffer.from(data, 'base64')
  await writeFile(join(ASSETS, `${name}.png`), buffer)
  console.log(`  ${name}.png  ${(buffer.length / 1024).toFixed(0)} KB`)
  return { name, bytes: buffer.length }
}

/** Scroll sweeps of a marketing page: the product shot is rarely in the hero. */
async function sweep(page, url, prefix, { settle = 6000, stops = [0, 700, 1400, 2100, 2800] } = {}) {
  await page.send('Page.navigate', { url })
  await delay(settle)
  const written = []
  for (const [index, top] of stops.entries()) {
    await evaluate(page, `window.scrollTo({top:${top},behavior:'instant'})`)
    await delay(1400)
    written.push(await shoot(page, `${prefix}-${index}`))
  }
  return written
}

/** unit's own documented interaction recordings, on one page the browser renders. */
const UNIT_GIFS = [
  ['17', 'Connect — drop a node onto a compatible node'],
  ['31', 'Draw — a stroke out of the centre makes an output plug; inward makes an input'],
  ['33', 'Draw — a circle makes a unit, a rectangle makes a component'],
  ['42', 'Draw — a contour around nodes composes them'],
  ['34', 'Compose — long press on the background wraps the selection into a unit'],
  ['35', 'Explode — the same long press unwraps it again'],
  ['26', 'Enter / leave a graph with a long click'],
  ['25', 'Change mode — click an input to make it constant'],
  ['55', 'Change mode — click a graph input plug to make the input set functional'],
]

async function unitContactSheet(page) {
  const base = 'https://raw.githubusercontent.com/samuelmtimbo/unit/main/public/gif/start'
  const cards = UNIT_GIFS.map(([id, caption]) => `
    <figure><img src="${base}/${id}.gif" alt="unit gif ${id}"/>
    <figcaption><b>${id}.gif</b> — ${caption}</figcaption></figure>`).join('')
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#111;color:#eee;font:13px/1.45 ui-sans-serif,system-ui;padding:16px}
    .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}
    figure{margin:0;background:#1b1b1b;border:1px solid #2d2d2d;border-radius:10px;overflow:hidden}
    img{width:100%;display:block;background:#000}
    figcaption{padding:8px 10px;color:#bdbdbd}
    b{color:#fff}
  </style><div class="grid">${cards}</div>`
  const dataUrl = `data:text/html;base64,${Buffer.from(html, 'utf8').toString('base64')}`
  await page.send('Page.navigate', { url: dataUrl })
  // Some of these recordings are ~2 MB; poll rather than guess a settle time.
  let loaded = 0
  for (let attempt = 0; attempt < 40; attempt += 1) {
    loaded = await evaluate(page, '[...document.images].filter(i=>i.complete&&i.naturalWidth>0).length')
    if (loaded === UNIT_GIFS.length) break
    await delay(1500)
  }
  console.log(`  unit recordings rendered: ${loaded}/${UNIT_GIFS.length}`)
  if (loaded < UNIT_GIFS.length) console.warn('  WARNING: not every recording rendered')
  const boxes = await evaluate(page, `JSON.stringify([...document.querySelectorAll('figure')].map(f=>{const r=f.getBoundingClientRect();return {x:r.x+window.scrollX,y:r.y+window.scrollY,width:r.width,height:r.height}}))`)
  return { loaded, boxes: JSON.parse(boxes) }
}

async function main() {
  await mkdir(ASSETS, { recursive: true })
  const manifest = { capturedFor: 'docs/build_reference_learnings.py', shots: [] }

  {
    // enso.org is a 13,938px scroll story; the graph editor only appears in the
    // second half. These stops were found by sweeping the whole page and reading
    // the heading in view, so each one is a named section rather than a guess.
    console.log('→ enso.org sweep')
    const { proc, page } = await launch({ width: 1440, height: 900 })
    try {
      await page.send('Page.navigate', { url: 'https://enso.org/' })
      await delay(9000)
      const sections = [
        [5400, 'reshape', 'Clean and reshape. Ensure data quality.'],
        [6100, 'blend', 'Blend and process data in-database and in-memory.'],
        [7500, 'live', 'Live, interactive data processing — visualization under the node.'],
        [8200, 'custom', 'Build and share custom components.'],
        [10300, 'dual', 'No-code or full-code — the same workflow as graph and as text.'],
      ]
      for (const [top, slug, note] of sections) {
        await evaluate(page, `window.scrollTo({top:${top},behavior:'instant'})`)
        await delay(1500)
        const shot = await shoot(page, `ref-enso-${slug}`)
        manifest.shots.push({ ...shot, source: 'https://enso.org/', note })
      }
    } finally { proc.kill('SIGKILL') }
  }

  {
    console.log('→ nevalang.org sweep')
    const { proc, page } = await launch({ width: 1440, height: 900 })
    try {
      manifest.shots.push(...await sweep(page, 'https://nevalang.org/', 'ref-neva', {
        settle: 6000, stops: [0, 700, 1400],
      }))
    } finally { proc.kill('SIGKILL') }
  }

  {
    console.log('→ unit documented gestures')
    const { proc, page } = await launch({ width: 1200, height: 2400, scale: 1.5 })
    try {
      const { loaded, boxes } = await unitContactSheet(page)
      manifest.unitRecordingsLoaded = loaded
      // One tight crop per gesture, so the report can show a single claim at size.
      //
      // These are animations, so a single capture lands on an arbitrary frame —
      // often the blank canvas at the start of a loop, which then contradicts
      // the caption written about it. Sample a few frames and keep the busiest:
      // a frame with more drawn on it compresses larger, so PNG size is a good
      // enough proxy for "this frame actually shows the gesture".
      for (const [index, box] of boxes.entries()) {
        const id = UNIT_GIFS[index][0]
        let best = null
        for (let sample = 0; sample < 6; sample += 1) {
          const { data } = await page.send('Page.captureScreenshot', {
            format: 'png', captureBeyondViewport: true, clip: { ...box, scale: 2 },
          })
          const buffer = Buffer.from(data, 'base64')
          if (!best || buffer.length > best.length) best = buffer
          await delay(700)
        }
        await writeFile(join(ASSETS, `ref-unit-${id}.png`), best)
        console.log(`  ref-unit-${id}.png  ${(best.length / 1024).toFixed(0)} KB (best of 6 frames)`)
        manifest.shots.push({ name: `ref-unit-${id}`, bytes: best.length, frameSelection: 'best-of-6' })
      }
    } finally { proc.kill('SIGKILL') }
  }

  await writeFile(join(ASSETS, 'reference-capture-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`\n${manifest.shots.length} captures written to docs/assets/`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
