import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  launchChrome, openCdpPage, evaluate, waitFor, delay, readConsoleErrors,
} from '/home/bam/systemsketch/tests/cdp_kit.mjs'

const BASE = 'http://127.0.0.1:5177/'
const OUT = '/home/bam/.claude/jobs/c3a25911/tmp/tw-tldraw-probe/shots'
const MODES = ['none', 'full', 'layers']

const STYLE_TARGETS = {
  container: '.tl-container',
  svg: '.tl-svg-container',
  button: '.tlui-button',
  panel: '.tlui-style-panel',
  textLabel: '.tl-text-label__inner, .tl-text',
  body: 'body',
}

const PROPS = {
  container: ['fontFamily', 'fontSize', 'lineHeight', 'boxSizing'],
  svg: ['display'],
  button: ['backgroundColor', 'border', 'padding', 'font', 'lineHeight', 'cursor'],
  panel: ['backgroundColor', 'boxShadow', 'borderRadius'],
  textLabel: ['fontFamily', 'fontSize', 'whiteSpace'],
  body: ['margin', 'lineHeight', 'fontFamily'],
}

async function computedStylesFor(page) {
  const expr = `JSON.stringify((() => {
    const targets = ${JSON.stringify(STYLE_TARGETS)}
    const props = ${JSON.stringify(PROPS)}
    const out = {}
    for (const key of Object.keys(targets)) {
      const el = document.querySelector(targets[key])
      if (!el) { out[key] = null; continue }
      const cs = getComputedStyle(el)
      const vals = {}
      for (const p of props[key]) vals[p] = cs[p]
      out[key] = vals
    }
    return out
  })())`
  return JSON.parse(await evaluate(page, expr))
}

async function run() {
  const session = await launchChrome({ label: 'tw-probe', width: 1440, height: 960, offline: true })
  const results = {}
  try {
    const port = await session.devToolsPort()
    for (const mode of MODES) {
      const page = await openCdpPage(port, { width: 1440, height: 960 })
      await page.send('Page.navigate', { url: `${BASE}?mode=${mode}` })
      await waitFor(page, 'window.__ready === true', `${mode} ready`, 20000)
      await delay(800) // let webfonts / layout settle

      // board screenshot
      const boardShot = await page.send('Page.captureScreenshot', { format: 'png' })
      await writeFile(join(OUT, `${mode}-board.png`), Buffer.from(boardShot.data, 'base64'))

      const styles = await computedStylesFor(page)

      // select the rectangle to reveal the style panel
      await evaluate(page, 'window.__selectRect()')
      await delay(300)
      const panelShot = await page.send('Page.captureScreenshot', { format: 'png' })
      await writeFile(join(OUT, `${mode}-panel.png`), Buffer.from(panelShot.data, 'base64'))

      const consoleErrors = readConsoleErrors(page)
      const consoleAll = page.events.filter((e) => e.method === 'Log.entryAdded' || e.method === 'Runtime.consoleAPICalled')

      results[mode] = {
        styles,
        consoleErrorCount: consoleErrors.length,
        consoleErrors,
        consoleEventCount: consoleAll.length,
      }
      await writeFile(join(OUT, `${mode}-styles.json`), JSON.stringify(styles, null, 2))
      page.close()
      console.log(`captured ${mode}`)
    }
  } finally {
    session.kill()
  }
  await writeFile(join(OUT, 'capture-results.json'), JSON.stringify(results, null, 2))
  console.log('done')
}

run().catch((err) => { console.error(err); process.exit(1) })
