/**
 * The SystemSketch app under a real browser.
 *
 * Every UI claim in this repo is proven by driving the actual app in headless
 * Chrome — never by asserting against a component rendered in isolation. What
 * is left in this file is the part that knows about *this app*: the Python host,
 * Vite, a staged release, and the URL shape. The browser plumbing underneath it
 * moved to `cdp_kit.mjs`, which knows nothing about SystemSketch and can be used
 * without booting a server.
 *
 * Everything the kit exports is re-exported here, so no journey has to change
 * its imports.
 */
import { spawn } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  delay,
  evaluate,
  freePort,
  launchChrome,
  openCdpPage,
  waitFor,
} from './cdp_kit.mjs'

export {
  Cdp,
  HEADLESS_CHROME_FLAGS,
  clickAt,
  clickElement,
  delay,
  drag,
  elementBox,
  ensureDir,
  evaluate,
  findChrome,
  freePort,
  hoverElement,
  key,
  launchChrome,
  localConsoleErrors,
  makeChecklist,
  mouse,
  newPage,
  openCdpPage,
  readConsoleErrors,
  renderFile,
  shortcut,
  typeSlowly,
  waitFor,
  waitForDevTools,
} from './cdp_kit.mjs'

export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

function python(script, args) {
  return new Promise((resolve, reject) => {
    const child = spawn('python3', ['-c', script, ...args], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout.on('data', (chunk) => { out += chunk })
    child.stderr.on('data', (chunk) => { err += chunk })
    child.on('error', reject)
    child.on('close', (code) => code === 0 ? resolve(out.trim()) : reject(new Error(err || `python exited ${code}`)))
  })
}

/**
 * Stage one real release and point Stable at it.
 *
 * A Stable channel is not a flag on the server — it is a manifest the server
 * reads back — so proving Stable chrome needs a genuine release on disk.
 */
async function stageStableRelease(releaseHome, dist) {
  await writeFile(join(dist, 'index.html'), '<!doctype html><title>SystemSketch</title>\n')
  return python(`
import sys
from pathlib import Path
sys.path.insert(0, ${JSON.stringify(join(ROOT, 'scripts'))})
from release_lib import promote_candidate, stage_candidate
build, _manifest = stage_candidate(Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]))
promote_candidate(Path(sys.argv[2]))
print(build)
`, [ROOT, releaseHome, dist])
}

/**
 * Boot the API server, Vite, and headless Chrome, then hand back a CDP page
 * plus the temp roots. Callers must call `close()` in a finally block.
 *
 * The release home is always a throwaway directory: a smoke test that reaches
 * a channel control must not be able to move the developer's real Stable.
 */
export async function startApp({
  label,
  build,
  channel = 'preview',
  width = 1440,
  height = 960,
  allowSourceRoot = false,
  cdpToApi = false,
} = {}) {
  const name = label ?? 'systemsketch-smoke'
  const port = await freePort()
  const apiPort = await freePort()
  const filesRoot = await mkdtemp(join(tmpdir(), `${name}-files-`))
  const emptyDist = await mkdtemp(join(tmpdir(), `${name}-dist-`))
  const releaseHome = await mkdtemp(join(tmpdir(), `${name}-release-`))
  const apiBuild = channel === 'stable'
    ? await stageStableRelease(releaseHome, emptyDist)
    : build ?? name

  // A journey drives a headless browser, so its controller must be headless
  // too: with a display inherited, File > Open would spawn a real GTK file
  // chooser onto the developer's screen and block until a person closed it.
  const headlessEnv = { ...process.env }
  delete headlessEnv.DISPLAY
  delete headlessEnv.WAYLAND_DISPLAY

  // Chrome first: it depends on nothing, and a journey that proves the flight
  // recorder's frames needs its DevTools port BEFORE the Python host starts,
  // the way the desktop launcher hands `--cdp-port` to the real host.
  const session = await launchChrome({ label: name, width, height })
  let earlyCdpPort = null
  if (cdpToApi) {
    try {
      earlyCdpPort = await session.devToolsPort()
    } catch (error) {
      session.kill()
      throw error
    }
  }

  const apiArguments = [
    join(ROOT, 'scripts', 'server.py'),
    '--port', String(apiPort),
    '--dist', emptyDist,
    '--channel', channel,
    '--build', apiBuild,
    '--release-home', releaseHome,
    '--source-root', ROOT,
    '--files-root', filesRoot,
    ...(earlyCdpPort ? ['--cdp-port', String(earlyCdpPort)] : []),
  ]
  if (allowSourceRoot) apiArguments.push('--allow-source-root')
  const api = spawn('python3', apiArguments, {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: headlessEnv,
  })
  const vite = spawn(process.execPath, [
    join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'),
    '--host', '127.0.0.1', '--port', String(port), '--strictPort',
  ], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, SYSTEMSKETCH_API_PORT: String(apiPort) },
  })
  if (process.env.VERBOSE) {
    for (const child of [api, vite]) {
      child.stdout.on('data', (chunk) => process.stdout.write(chunk))
      child.stderr.on('data', (chunk) => process.stderr.write(chunk))
    }
  }

  const close = () => {
    session.kill()
    vite.kill('SIGKILL')
    api.kill('SIGKILL')
  }

  try {
    for (let attempt = 0; attempt <= 120; attempt += 1) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1000) })
        if (response.ok) break
      } catch { if (attempt === 120) throw new Error('Vite never became ready') }
      await delay(100)
    }
    const cdpPort = earlyCdpPort ?? await session.devToolsPort()
    const page = await openCdpPage(cdpPort, { width, height })
    const shutdown = () => { page.close(); close() }
    return {
      page,
      port,
      apiPort,
      cdpPort,
      filesRoot,
      releaseHome,
      close: shutdown,
      // `close` is the historical name and every journey uses it; `stop` reads
      // truer for something that kills three processes, so both work.
      stop: shutdown,
    }
  } catch (error) {
    close()
    throw error
  }
}

export async function openApp(page, port, query) {
  await page.send('Page.navigate', { url: `http://127.0.0.1:${port}/${query}` })
  await waitFor(page, 'document.readyState === "complete"', 'page load')
}
