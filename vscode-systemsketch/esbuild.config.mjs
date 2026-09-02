import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Only the extension host is bundled here.
 *
 * The webview is not built by this file at all — it is the SystemSketch app's
 * own vite build, staged by `scripts/stage_app.mjs`. That split is the point:
 * an extension that rebundled the canvas would be a second build of it, free
 * to drift from the one Zach actually verified.
 */
const extensionRoot = dirname(fileURLToPath(import.meta.url))
const dist = resolve(extensionRoot, 'dist')
await mkdir(dist, { recursive: true })

await build({
  entryPoints: [resolve(extensionRoot, 'src/extension.ts')],
  outfile: resolve(dist, 'extension.js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  external: ['vscode'],
  sourcemap: true,
  logLevel: 'info',
})
