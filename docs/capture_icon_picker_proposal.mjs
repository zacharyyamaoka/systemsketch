// Capture the live mock in reports/icon-picker-proposal-<date>.html at its
// judgeable states. Serves reports/ over HTTP (the page fetches its data
// relatively), drives headless Chrome through the repo's CDP kit, clips the
// picker + Blocks, and writes reports/media/icon-picker-proposal/mock-*.png.
//
//   node docs/capture_icon_picker_proposal.mjs reports/icon-picker-proposal-2026-09-09.html
import { spawn } from 'node:child_process'
import { resolve, basename, dirname } from 'node:path'
import {
  delay, elementBox, evaluate, freePort, launchChrome, openCdpPage, waitFor, ensureDir,
} from '../tests/cdp_kit.mjs'

const target = resolve(process.argv[2] ?? 'reports/icon-picker-proposal-2026-09-09.html')
const reportsDir = dirname(target)
const outDir = resolve(reportsDir, 'media/icon-picker-proposal')
await ensureDir(outDir)

const port = await freePort()
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', reportsDir], { stdio: 'ignore' })
await delay(600)

const STATES = [
  ['mock-icons', '#tab=icons', []],
  ['mock-icons-search', '#tab=icons&q=data', []],
  ['mock-icons-color', '#tab=icons&open=color', []],
  ['mock-emoji', '#tab=emoji', []],
  ['mock-emoji-search', '#tab=emoji&q=scre', []],
  ['mock-upload', '#tab=upload', []],
  ['mock-upload-preview', '#tab=upload&demo=preview', []],
  ['mock-block-asset', '#tab=upload&demo=preview', ['#pk-save']],
  ['mock-light', '#tab=icons&theme=light&q=robot', []],
]

const session = await launchChrome({ label: 'icon-picker-proposal', width: 1400, height: 1000, offline: false })
const results = []
try {
  const page = await openCdpPage(await session.devToolsPort(), { width: 1400, height: 1000 })
  for (const [name, hash, clicks] of STATES) {
    const url = `http://127.0.0.1:${port}/${basename(target)}?state=${name}${hash}`
    await page.send('Page.navigate', { url })
    await waitFor(page, `window.__mockReady === true`, `${name} mock ready`)
    await delay(hash.includes('demo') ? 900 : 250)
    // WHY a DOM click: the picker sits below the first viewport, and a CDP mouse click at a page-relative box misses it.
    for (const sel of clicks) { await evaluate(page, `document.querySelector(${JSON.stringify(sel)}).click()`); await delay(300) }
    const stage = await elementBox(page, '#lab .stage', { pageRelative: true })
    const shot = await page.send('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true,
      clip: { x: stage.x - 8, y: stage.y - 8, width: stage.width + 16, height: stage.height + 16, scale: 1 },
    })
    const path = resolve(outDir, `${name}.png`)
    await (await import('node:fs/promises')).writeFile(path, Buffer.from(shot.data, 'base64'))
    const facts = JSON.parse(await evaluate(page, `JSON.stringify({
      foot: document.getElementById('pk-foot')?.innerText ?? '',
      stored: document.getElementById('stored')?.innerText ?? '',
      cells: document.querySelectorAll('#pk-body .pk-cell').length,
      load: document.getElementById('lab-load')?.innerText ?? '',
    })`))
    results.push({ name, ...facts })
    console.log(name, JSON.stringify(facts))
  }
  page.close()
} finally {
  session.kill()
  server.kill()
}
console.log(JSON.stringify(results, null, 1))
