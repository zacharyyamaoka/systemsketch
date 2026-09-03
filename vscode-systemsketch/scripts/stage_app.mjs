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
const releaseIndex = process.argv.indexOf('--require-release')
const APP_DIR = outputIndex === -1
  ? join(EXTENSION_ROOT, 'dist', 'app')
  : resolve(process.cwd(), process.argv[outputIndex + 1] ?? '')
const REQUIRED_RELEASE = releaseIndex === -1 ? null : process.argv[releaseIndex + 1]

if (outputIndex !== -1 && !process.argv[outputIndex + 1]) {
  throw new Error('--out-dir requires a destination')
}
if (releaseIndex !== -1 && !REQUIRED_RELEASE) {
  throw new Error('--require-release requires a build id')
}
if (releaseIndex !== -1 && process.argv.includes('--require-stable')) {
  throw new Error('--require-release and --require-stable are mutually exclusive')
}

function releaseHome() {
  if (process.env.SYSTEMSKETCH_RELEASE_HOME) {
    return resolve(process.env.SYSTEMSKETCH_RELEASE_HOME)
  }
  const dataHome = process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share')
  return join(dataHome, 'systemsketch', 'runtime')
}

/** One immutable release and its manifest, or `null` when it is unavailable. */
function releaseByBuild(build) {
  const home = releaseHome()
  if (typeof build !== 'string' || !build) return null
  const manifestPath = join(home, 'releases', build, 'manifest.json')
  if (!existsSync(manifestPath)) return null
  try {
    return { build, manifest: JSON.parse(readFileSync(manifestPath, 'utf8')) }
  } catch {
    return null
  }
}

/** The Stable release and its manifest, or `null` when nothing is published. */
function stableRelease() {
  const channels = join(releaseHome(), 'channels.json')
  if (!existsSync(channels)) return null
  try {
    return releaseByBuild(JSON.parse(readFileSync(channels, 'utf8')).stable)
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
  const selected = REQUIRED_RELEASE ? releaseByBuild(REQUIRED_RELEASE) : stable
  const currentSource = sourceMtime()
  const releaseSource = typeof selected?.manifest?.sourceTime === 'number'
    ? selected.manifest.sourceTime
    : null
  const commit = sourceCommit()
  // `sourceTime` is a timestamp, so it only means anything when both sides are
  // the *same* tree: a worktree checked out this morning is older than Stable
  // by the clock and is nevertheless entirely different source. Requiring the
  // root to match too is what stops a track worktree claiming to be Stable.
  const releaseRoot = typeof selected?.manifest?.sourceRoot === 'string'
    ? resolve(selected.manifest.sourceRoot)
    : null
  const recordedCommit = typeof selected?.manifest?.commit === 'string'
    ? selected.manifest.commit
    : null
  const sameTree = releaseRoot !== null && releaseRoot === PROJECT_ROOT
  const sameCommit = recordedCommit === null || recordedCommit === commit
  const matchesRelease = selected !== null
    && sameTree
    && sameCommit
    && currentSource !== null
    && releaseSource !== null
    && currentSource <= releaseSource
  const releaseLabel = REQUIRED_RELEASE ? `release ${REQUIRED_RELEASE}` : `Stable ${selected?.build}`

  if (REQUIRED_RELEASE && !selected) {
    throw new Error(`required release ${REQUIRED_RELEASE} is not available in ${releaseHome()}`)
  } else if (selected && !sameTree) {
    const message = `this checkout (${PROJECT_ROOT}) is not the tree ${releaseLabel}`
      + ` was built from (${releaseRoot ?? 'unrecorded'})`
    if (requireStable || REQUIRED_RELEASE) {
      throw new Error(`${message}. Package from the recorded release checkout.`)
    }
    console.warn(`stage_app: ${message}; staging it as a development build.`)
  } else if (selected && !sameCommit) {
    const message = `this checkout is at ${commit ?? 'an unknown commit'}, but ${releaseLabel}`
      + ` records ${recordedCommit}`
    if (requireStable || REQUIRED_RELEASE) throw new Error(message)
    console.warn(`stage_app: ${message}; staging it as a development build.`)
  } else if (!selected) {
    const message = 'no Stable SystemSketch release is published — run `npm run release:candidate`'
      + ' then `npm run release:promote` first'
    if (requireStable) throw new Error(message)
    console.warn(`stage_app: ${message}; staging the working tree instead.`)
  } else if (!matchesRelease) {
    const message = `this source tree is newer than ${releaseLabel}`
    if (requireStable || REQUIRED_RELEASE) {
      throw new Error(
        `${message}. Build again, or stage without a release requirement for development.`,
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
      stableBuild: selected?.build ?? null,
      version: selected?.manifest?.version ?? null,
      releasedAt: selected?.manifest?.releasedAt ?? null,
      stableSourceTime: releaseSource,
      stagedSourceTime: currentSource,
      sourceCommit: commit,
      matchesStable: matchesRelease,
      channel: matchesRelease ? 'stable' : 'development',
    }, null, 2)}\n`,
    'utf8',
  )

  console.log(
    `stage_app: staged ${matchesRelease ? releaseLabel : 'a development build'} into`
    + ` ${APP_DIR.replace(`${PROJECT_ROOT}/`, '')}`,
  )
}

main().catch((cause) => {
  console.error(`stage_app: ${cause instanceof Error ? cause.message : cause}`)
  process.exitCode = 1
})
