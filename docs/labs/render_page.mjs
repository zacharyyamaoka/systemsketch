/** Render any local HTML file full-page to a PNG (headless, no window). */
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { delay, evaluate, launchChrome, openCdpPage, waitFor } from '../../tests/cdp_kit.mjs'

const [, , input, output] = process.argv
const session = await launchChrome({ label: 'render-page', width: 1360, height: 1000 })
try {
  const page = await openCdpPage(await session.devToolsPort(), { width: 1360, height: 1000 })
  await page.send('Page.navigate', { url: `file://${resolve(input)}` })
  await waitFor(page, "document.readyState === 'complete'", 'page load')
  await delay(600)
  const metrics = await evaluate(page, 'JSON.stringify({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight })')
  const { w, h } = JSON.parse(metrics)
  const capture = await page.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: w, height: Math.min(h, 24000), scale: 1 },
  })
  await writeFile(resolve(output), Buffer.from(capture.data, 'base64'))
  process.stdout.write(`${output} (${w}x${h})\n`)
} finally {
  session.kill()
}
