#!/usr/bin/env node
/**
 * Stage the SystemSketch app the extension ships.
 *
 * The extension does not reimplement the canvas and does not bundle the
 * canvas's source: it carries a *build* of the app and loads it as the
 * webview's own document. Which build that is, is the whole point of this
 * script — an installed extension is long-lived, so it must carry the Stable
 * release Zach verified, not whatever happens to be in the working tree.
 *
 * Two things stop that claim from being decoration:
 *
 * 1. The staged app is stamped with `app.json`, recording the Stable build id
 *    it was staged against and whether the source it was built from matched.
 *    `SystemSketch: Show Bundled Build` reads that stamp back out, so what is
 *    installed is always identifiable.
 * 2. `npm run package` passes `--require-stable`, which refuses to build a
 *    VSIX from source newer than the Stable release. Day-to-day `npm run
 *    build` only warns, because refusing there would make the extension
 *    untestable in a worktree — where the source is *always* newer.
 *
 * The build itself uses `--base ./`, which is not cosmetic. A VS Code webview
 * is served from an opaque `vscode-webview://` origin, so vite's default
 * absolute `/assets/…` URLs resolve against nothing; with a relative base,
 * vite emits `new URL('./…', import.meta.url)` references that resolve against
 * the bundle's own location and every font, icon and translation loads.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const EXTENSION_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PROJECT_ROOT = resolve(EXTENSION_ROOT, '..')
const outputIndex = process.argv.indexOf('--out-dir')
const APP_DIR = outputIndex === -1
  ? join(EXTENSION_ROOT, 'dist', 'app')
  : resolve(process.cwd(), process.argv[outputIndex + 1] ?? '')

if (outputIndex !== -1 && !process.argv[outputIndex + 1]) {
  throw new Error('--out-dir requires a destination')
}

function releaseHome() {
  if (process.env.SYSTEMSKETCH_RELEASE_HOME) {
    return resolve(process.env.SYSTEMSKETCH_RELEASE_HOME)
  }
  const dataHome = process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share')
  return join(dataHome, 'systemsketch', 'runtime')
}

/** The Stable release and its manifest, or `null` when nothing is published. */
function stableRelease() {
  const home = releaseHome()
  const channels = join(home, 'channels.json')
  if (!existsSync(channels)) return null
  let build
  try {
    build = JSON.parse(readFileSync(channels, 'utf8')).stable
  } catch {
    return null
  }
  if (typeof build !== 'string' || !build) return null
  const manifestPath = join(home, 'releases', build, 'manifest.json')
  if (!existsSync(manifestPath)) return null
  try {
    return { build, manifest: JSON.parse(readFileSync(manifestPath, 'utf8')) }
  } catch {
    return null
  }
}

/**
 * The newest mtime under the app's source, matching `release_lib.source_mtime`.
 *
 * The release pipeline judges "has the source moved since Stable" exactly this
 * way, so re-deriving it here means the extension answers the same question
 * with the same ruler rather than inventing a second, disagreeing one.
 */
function sourceMtime() {
  const result = spawnSync(
    'python3',
    [
      '-c',
      'import sys; sys.path.insert(0, "scripts"); from release_lib import source_mtime;'
      + ' from pathlib import Path; print(source_mtime(Path(".")))',
    ],
    { cwd: PROJECT_ROOT, encoding: 'utf8' },
  )
  if (result.status !== 0) return null
  const value = Number.parseFloat(result.stdout.trim())
  return Number.isFinite(value) ? value : null
}

function sourceCommit() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
  })
  return result.status === 0 && result.stdout.trim() ? result.stdout.trim() : null
}

async function main() {
  const requireStable = process.argv.includes('--require-stable')
  const stable = stableRelease()
  const currentSource = sourceMtime()
  const stableSource = typeof stable?.manifest?.sourceTime === 'number'
    ? stable.manifest.sourceTime
    : null
  const commit = sourceCommit()
  // `sourceTime` is a timestamp, so it only means anything when both sides are
  // the *same* tree: a worktree checked out this morning is older than Stable
  // by the clock and is nevertheless entirely different source. Requiring the
  // root to match too is what stops a track worktree claiming to be Stable.
  const stableRoot = typeof stable?.manifest?.sourceRoot === 'string'
    ? resolve(stable.manifest.sourceRoot)
    : null
  const sameTree = stableRoot !== null && stableRoot === PROJECT_ROOT
  const matchesStable = stable !== null
    && sameTree
    && currentSource !== null
    && stableSource !== null
    && currentSource <= stableSource

  if (stable && !sameTree) {
    const message = `this checkout (${PROJECT_ROOT}) is not the tree Stable ${stable.build}`
      + ` was built from (${stableRoot ?? 'unrecorded'})`
    if (requireStable) {
      throw new Error(`${message}. Package from the main checkout, or stage without --require-stable.`)
    }
    console.warn(`stage_app: ${message}; staging it as a development build.`)
  } else if (!stable) {
    const message = 'no Stable SystemSketch release is published — run `npm run release:candidate`'
      + ' then `npm run release:promote` first'
    if (requireStable) throw new Error(message)
    console.warn(`stage_app: ${message}; staging the working tree instead.`)
  } else if (!matchesStable) {
    const message = `this source tree is newer than Stable ${stable.build}`
    if (requireStable) {
      throw new Error(
        `${message}. Promote it first, or stage without --require-stable for a development build.`,
      )
    }
    console.warn(`stage_app: ${message}; staging it anyway as a development build.`)
  }

  await rm(APP_DIR, { recursive: true, force: true })
  await mkdir(APP_DIR, { recursive: true })

  const build = spawnSync(
    'npm',
    ['exec', 'vite', '--', 'build', '--base', './', '--outDir', APP_DIR, '--emptyOutDir'],
    { cwd: PROJECT_ROOT, stdio: 'inherit' },
  )
  if (build.status !== 0) throw new Error('vite build failed')

  const indexHtml = join(APP_DIR, 'index.html')
  if (!existsSync(indexHtml)) throw new Error('vite produced no index.html to host')
  if (readFileSync(indexHtml, 'utf8').includes('src="/assets/')) {
    throw new Error('the staged app still has absolute asset URLs; --base ./ did not apply')
  }

  await writeFile(
    join(APP_DIR, 'app.json'),
    `${JSON.stringify({
      stableBuild: stable?.build ?? null,
      version: stable?.manifest?.version ?? null,
      releasedAt: stable?.manifest?.releasedAt ?? null,
      stableSourceTime: stableSource,
      stagedSourceTime: currentSource,
      sourceCommit: commit,
      matchesStable,
      channel: matchesStable ? 'stable' : 'development',
    }, null, 2)}\n`,
    'utf8',
  )

  console.log(
    `stage_app: staged ${matchesStable ? `Stable ${stable.build}` : 'a development build'} into`
    + ` ${APP_DIR.replace(`${PROJECT_ROOT}/`, '')}`,
  )
}

main().catch((cause) => {
  console.error(`stage_app: ${cause instanceof Error ? cause.message : cause}`)
  process.exitCode = 1
})
