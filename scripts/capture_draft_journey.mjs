/**
 * Headless captures of the five draft-journey HTML prototypes.
 * Writes one PNG per variant × beat into docs/assets/draft-journey/.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderFile } from '../tests/cdp_kit.mjs'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const DIR = join(ROOT, 'docs/assets/draft-journey')
const VARIANTS = [
  'v1-minimal-bar',
  'v2-icepanel-header',
  'v3-page-stack',
  'v4-filmstrip',
  'v5-workspace-column',
]
const BEATS = ['main', 'create', 'edit', 'return', 'resume', 'review', 'merged']

async function main() {
  for (const variant of VARIANTS) {
    for (const beat of BEATS) {
      const target = `file://${join(DIR, `${variant}.html`)}?beat=${beat}`
      const outDir = join(DIR, 'captures')
      const result = await renderFile(target, outDir, {
        width: 1360,
        height: 920,
        label: `${variant}-${beat}`,
        settleMs: 500,
        full: false,
        clips: { [`${variant}-${beat}`]: '[data-app]' },
      })
      if (result.missing.length) {
        throw new Error(`${variant} ${beat}: missing ${JSON.stringify(result.missing)}`)
      }
      console.log(`wrote ${variant}-${beat}.png`)
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
