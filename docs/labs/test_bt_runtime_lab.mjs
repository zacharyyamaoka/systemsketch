/**
 * The runtime lab's own acceptance test, in a real headless Chrome.
 *
 * What it proves, per Zach's 2026-09-05 decisions:
 *  1. 100% scrub visibility — the transition log (the canonical history)
 *     reconstructs the EXACT status of every node at arbitrary ticks: for
 *     several seeds × presets, random ticks are sampled and the fold of the
 *     log is compared field-by-field against the driver's own per-tick
 *     snapshots (an oracle the paint path never reads). The lab's exhaustive
 *     in-page verify() must agree.
 *  2. Whole-active-path treatment — at a deep-chain moment every ancestor of
 *     the ticking leaf is RUNNING, painted lavender, carrying a spinner, and
 *     every edge down the chain wears the marching-dash class.
 *  3. Flowstate group aggregation — Process view: a running group's header is
 *     #E2D9FC with a visible spinner; a succeeded group's header is #CAFCD0
 *     and its surface washes pale green; untaken cards stay #DEDEDE.
 *  4. Groot2 transitions table — row count == log length, the current row is
 *     highlighted at the scrub position, the name filter hides non-matches.
 *  5. Motion vs static dash — two clipped captures 400 ms apart: the
 *     active-path vocabulary row's pixels CHANGE (marching) while the async
 *     rail's and delayed-dots rows' pixels are byte-identical (static).
 *
 * Usage: node docs/labs/test_bt_runtime_lab.mjs [docs/bt-runtime-lab-<date>.html]
 */
import { inflateSync } from 'node:zlib'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { delay, evaluate, launchChrome, openCdpPage, waitFor } from '../../tests/cdp_kit.mjs'

/** Minimal PNG → RGBA decoder (8-bit, non-interlaced — what CDP screenshots are). */
function decodePng(buffer) {
  let offset = 8
  const chunks = []
  let width = 0, height = 0, bitDepth = 0, colorType = 0
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4)
      bitDepth = data[8]; colorType = data[9]
      if (bitDepth !== 8 || data[12] !== 0) throw new Error('unsupported PNG layout')
    }
    if (type === 'IDAT') chunks.push(data)
    offset += 12 + length
  }
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType]
  const raw = inflateSync(Buffer.concat(chunks))
  const stride = width * channels
  const pixels = Buffer.alloc(height * stride)
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
  }
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? pixels[y * stride + x - channels] : 0
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0
      const upLeft = y > 0 && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0
      const value = row[x]
      pixels[y * stride + x] = (filter === 0 ? value
        : filter === 1 ? value + left
        : filter === 2 ? value + up
        : filter === 3 ? value + ((left + up) >> 1)
        : value + paeth(left, up, upLeft)) & 0xff
    }
  }
  return { width, height, channels, pixels }
}

/** Fraction of pixels whose max channel delta exceeds `threshold`. */
function changedFraction(pngA, pngB, threshold = 12) {
  const a = decodePng(Buffer.from(pngA, 'base64'))
  const b = decodePng(Buffer.from(pngB, 'base64'))
  if (a.pixels.length !== b.pixels.length) return 1
  let changed = 0
  const pixelCount = a.pixels.length / a.channels
  for (let i = 0; i < pixelCount; i += 1) {
    let maxDelta = 0
    for (let c = 0; c < a.channels; c += 1) {
      maxDelta = Math.max(maxDelta, Math.abs(a.pixels[i * a.channels + c] - b.pixels[i * a.channels + c]))
    }
    if (maxDelta > threshold) changed += 1
  }
  return changed / pixelCount
}

const HERE = dirname(fileURLToPath(import.meta.url))
const lab = resolve(process.argv[2] ?? join(HERE, '..', 'bt-runtime-lab-2026-09-05.html'))

let checks = 0
let failures = 0
const fail = (message) => { failures += 1; process.stdout.write(`  ✗ ${message}\n`) }
const ok = (condition, message) => {
  checks += 1
  if (condition) process.stdout.write(`  ✓ ${message}\n`)
  else fail(message)
}

// Seeded RNG so "random ticks" are reproducible run to run.
function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const session = await launchChrome({ label: 'bt-runtime-lab-test', width: 1760, height: 1100 })
try {
  const page = await openCdpPage(await session.devToolsPort(), { width: 1760, height: 1100 })
  await page.send('Page.navigate', { url: `file://${lab}` })
  await waitFor(page, 'Boolean(window.__lab)', 'lab to boot')
  await delay(300)

  const js = async (expression) => JSON.parse(await evaluate(page, `JSON.stringify(${expression})`))

  /* ---- 1 · reconstruction === ground truth, sampled independently ---- */
  const rng = mulberry32(20260905)
  for (const preset of ['flaky', 'chaos']) {
    for (const seed of [7, 13, 34]) {
      await evaluate(page, `window.__lab.preset('${preset}')`)
      await evaluate(page, `window.__lab.reset(${seed})`)
      await evaluate(page, `(() => { let guard = 0
        while (!window.__lab.state().outcome && guard < 200) { window.__lab.step(1); guard += 1 } })()`)
      const runState = await js('window.__lab.state()')
      const label = `${preset} seed ${seed} (${runState.frames - 1} ticks, ${runState.transitions} transitions, ${runState.outcome})`
      ok(runState.outcome === 'success' || runState.outcome === 'failure', `${label}: run terminates`)

      // The external sample: random ticks, compared field-by-field HERE, not
      // by trusting the page's own verdict.
      const lastTick = runState.frames - 1
      const sampled = new Set([0, 1, lastTick])
      while (sampled.size < Math.min(8, lastTick + 1)) sampled.add(1 + Math.floor(rng() * lastTick))
      let exact = true
      for (const tick of sampled) {
        const truth = await js(`window.__lab.frameStatuses(${tick})`)
        const rebuilt = await js(`window.__lab.reconstructedAtTick(${tick})`)
        const paths = new Set([...Object.keys(truth), ...Object.keys(rebuilt)])
        for (const path of paths) {
          const expected = truth[path]
          const got = rebuilt[path]
          if (!expected || !got || expected.status !== got.status || expected.since !== got.since) {
            exact = false
            fail(`${label}: tick ${tick} path ${path} — truth ${JSON.stringify(expected)} vs log-fold ${JSON.stringify(got)}`)
          }
        }
      }
      ok(exact, `${label}: ${sampled.size} sampled ticks reconstruct exactly (every node, status + since)`)
      const verdict = await js('window.__lab.verify()')
      ok(verdict.ok && verdict.ticksChecked === runState.frames,
        `${label}: in-page exhaustive verify ${verdict.ticksChecked}/${runState.frames} ticks ok`)
    }
  }

  /* ---- find a deep-chain moment for the active-path assertions ---- */
  await evaluate(page, "window.__lab.preset('flaky')")
  let deep = null
  for (let seed = 1; seed <= 40 && !deep; seed += 1) {
    await evaluate(page, `window.__lab.reset(${seed})`)
    for (let guard = 0; guard < 160; guard += 1) {
      await evaluate(page, 'window.__lab.step(1)')
      const now = await js('window.__lab.state()')
      if (now.outcome) break
      const deepLeaf = now.running.find((path) => path.split('.').length >= 7)
      if (deepLeaf) { deep = { seed, tick: now.cursorTick, leaf: deepLeaf, running: now.running }; break }
    }
  }
  ok(Boolean(deep), `found a deep-chain moment (seed ${deep?.seed}, tick ${deep?.tick}, leaf ${deep?.leaf})`)
  // Wait until the .25s fill transitions have actually landed (a fixed sleep
  // flakes when the machine is under load), then read computed styles.
  await waitFor(page,
    `getComputedStyle(document.querySelector('.overlay[data-status="running"] .fill')).backgroundColor === 'rgb(226, 217, 252)'`,
    'running fill transition to settle', 5000)

  /* ---- 2 · every ancestor runs, tints, spins; the chain marches ---- */
  if (deep) {
    const ancestors = []
    for (let path = deep.leaf; path.includes('.'); path = path.slice(0, path.lastIndexOf('.'))) {
      ancestors.push(path.slice(0, path.lastIndexOf('.')))
    }
    ok(ancestors.every((path) => deep.running.includes(path)),
      `all ${ancestors.length} ancestors of ${deep.leaf} are RUNNING (${ancestors.join(' ')})`)
    const dom = await js(`(() => {
      const spinners = [...document.querySelectorAll('.overlay[data-status="running"]')]
        .map((overlay) => ({ path: overlay.dataset.path, spinner: Boolean(overlay.querySelector('.badge svg')) }))
      const marching = [...document.querySelectorAll('path.status-edge[data-to][data-s="running"]')]
        .map((edge) => edge.dataset.to)
      const fill = document.querySelector('.overlay[data-status="running"] .fill')
      return { spinners, marching, runningFill: fill ? getComputedStyle(fill).backgroundColor : null }
    })()`)
    const runningSet = new Set(deep.running)
    ok(dom.spinners.length === deep.running.length && dom.spinners.every((entry) => runningSet.has(entry.path) && entry.spinner),
      `every RUNNING node paints lavender AND carries a spinner (${dom.spinners.length} nodes)`)
    ok(runningSet.size > 0 && [...runningSet].every((path) => dom.marching.includes(path)),
      `the marching dash covers the whole chain — an edge into every running node incl. Start→root (${dom.marching.length} edges)`)
    ok(dom.runningFill === 'rgb(226, 217, 252)', `running fill is Flowstate #E2D9FC (got ${dom.runningFill})`)
  }

  /* ---- 4 · the transitions table, at that same scrubbed moment ---- */
  const table = await js(`(() => {
    const state = window.__lab.state()
    const rows = [...document.querySelectorAll('#trans-rows tr')]
    const current = document.querySelector('#trans-rows tr.current')
    return { logLength: state.transitions, rowCount: rows.length,
             currentIndex: current ? Number(current.dataset.index) : null,
             cursorIndex: state.cursorIndex }
  })()`)
  ok(table.rowCount === table.logLength, `transitions table lists every transition (${table.rowCount})`)
  ok(table.currentIndex === table.cursorIndex, `current row highlighted at the scrub position (index ${table.currentIndex})`)

  await evaluate(page, `(() => {
    const filter = document.getElementById('trans-filter')
    filter.value = 'gripper'
    filter.dispatchEvent(new Event('input'))
  })()`)
  const filtered = await js(`(() => {
    const rows = [...document.querySelectorAll('#trans-rows tr')]
    const visible = rows.filter((row) => row.style.display !== 'none')
    return { visible: visible.length, allMatch: visible.every((row) => row.dataset.name.includes('gripper')),
             hidden: rows.length - visible.length }
  })()`)
  ok(filtered.visible > 0 && filtered.allMatch && filtered.hidden > 0,
    `name filter works (${filtered.visible} gripper rows shown, ${filtered.hidden} hidden)`)
  await evaluate(page, `(() => {
    const filter = document.getElementById('trans-filter')
    filter.value = ''
    filter.dispatchEvent(new Event('input'))
  })()`)

  /* ---- transition-unit stepping («/») changes state inside one tick ---- */
  const before = await js('window.__lab.state()')
  await evaluate(page, 'window.__lab.stepTransition(-1)')
  const after = await js('window.__lab.state()')
  ok(after.cursorIndex === before.cursorIndex - 1, `« steps back exactly one transition (${before.cursorIndex} → ${after.cursorIndex})`)
  await evaluate(page, 'window.__lab.stepTransition(1)')

  /* ---- 5 · marching dash moves; async + delayed vocabulary stays still ---- */
  const clipFor = async (selector) => js(`(() => {
    const box = document.querySelector('${selector}').getBoundingClientRect()
    return { x: Math.floor(box.x - 4), y: Math.floor(box.y - 6), width: Math.ceil(box.width + 8), height: Math.ceil(box.height + 12), scale: 1 }
  })()`)
  const shoot = async (clip) => (await page.send('Page.captureScreenshot', { format: 'png', clip, fromSurface: true })).data
  const activeClip = await clipFor('g.vocab path.status-edge[data-s="running"]')
  const asyncClip = await clipFor('g.vocab path.spec-async')
  const delayClip = await clipFor('g.vocab path.spec-delay-dots')
  const spinnerClip = await clipFor('.overlay[data-status="running"] .badge')
  // "Visibly moving" vs "visibly static" is a threshold, not byte equality:
  // shared-layer raster jitter can flip a stray subpixel while animations run.
  // And a single pair of captures can coincidentally land at nearly the same
  // animation phase under load, so sample several gaps: the animated rows must
  // move on SOME gap; the static rows must hold still on EVERY one.
  const moved = { active: 0, spinner: 0, async: 0, delay: 0 }
  for (const gapMs of [400, 550, 700, 850]) {
    const first = { active: await shoot(activeClip), async: await shoot(asyncClip), delay: await shoot(delayClip), spinner: await shoot(spinnerClip) }
    await delay(gapMs)
    const second = { active: await shoot(activeClip), async: await shoot(asyncClip), delay: await shoot(delayClip), spinner: await shoot(spinnerClip) }
    moved.active = Math.max(moved.active, changedFraction(first.active, second.active))
    moved.spinner = Math.max(moved.spinner, changedFraction(first.spinner, second.spinner))
    moved.async = Math.max(moved.async, changedFraction(first.async, second.async))
    moved.delay = Math.max(moved.delay, changedFraction(first.delay, second.delay))
    if (moved.active > 0.01 && moved.spinner > 0.01) break
  }
  ok(moved.active > 0.01, `active-path dash visibly marches — ${(moved.active * 100).toFixed(1)}% of pixels moved between captures`)
  ok(moved.spinner > 0.01, `the running badge spinner visibly rotates — ${(moved.spinner * 100).toFixed(1)}% of pixels moved`)
  ok(moved.async < 0.005, `async rail (56 4 10 4) is static — worst pair moved ${(moved.async * 100).toFixed(2)}% of pixels`)
  ok(moved.delay < 0.005, `delayed z⁻¹ dots are static — worst pair moved ${(moved.delay * 100).toFixed(2)}% of pixels`)

  /* ---- 3 · Flowstate group aggregation in the Process view ---- */
  await evaluate(page, "window.__lab.view('process')")
  await waitFor(page,
    `getComputedStyle(document.querySelector('g.groupbox[data-status="running"] rect.head')).fill === 'rgb(226, 217, 252)'
     && getComputedStyle(document.querySelector('.overlay[data-status="pending"] .fill')).backgroundColor === 'rgb(222, 222, 222)'`,
    'process-view header/fill transitions to settle', 5000)
  const midRun = await js(`(() => {
    const groups = [...document.querySelectorAll('g.groupbox')].map((group) => ({
      title: group.dataset.title, status: group.dataset.status ?? null,
      head: getComputedStyle(group.querySelector('rect.head')).fill,
      frame: getComputedStyle(group.querySelector('rect.frame')).fill,
      frameOpacity: getComputedStyle(group.querySelector('rect.frame')).fillOpacity,
      spinner: getComputedStyle(group.querySelector('g.gspin')).visibility,
    }))
    const pending = [...document.querySelectorAll('.overlay[data-status="pending"]')].length
    const pendingFill = document.querySelector('.overlay[data-status="pending"] .fill')
    return { groups, pending, pendingFill: pendingFill ? getComputedStyle(pendingFill).backgroundColor : null }
  })()`)
  const runningGroup = midRun.groups.find((group) => group.status === 'running')
  ok(Boolean(runningGroup) && runningGroup.head === 'rgb(226, 217, 252)' && runningGroup.spinner === 'visible',
    `mid-run: "${runningGroup?.title}" header tints #E2D9FC with a visible spinner (running aggregates by header only)`)
  ok(midRun.pending > 0 && midRun.pendingFill === 'rgb(222, 222, 222)',
    `untaken cards hold Flowstate pending #DEDEDE (${midRun.pending} cards)`)

  // Drive this run to a successful end for the wash (nominal makes it certain).
  await evaluate(page, "window.__lab.preset('nominal')")
  await evaluate(page, 'window.__lab.reset(7)')
  await evaluate(page, `(() => { let guard = 0
    while (!window.__lab.state().outcome && guard < 200) { window.__lab.step(1); guard += 1 } })()`)
  await waitFor(page,
    `[...document.querySelectorAll('g.groupbox rect.frame')].every((frame) => getComputedStyle(frame).fill === 'rgb(202, 252, 208)')`,
    'success wash transitions to settle', 5000)
  const done = await js(`(() => {
    const state = window.__lab.state()
    const groups = [...document.querySelectorAll('g.groupbox')].map((group) => ({
      title: group.dataset.title, status: group.dataset.status ?? null,
      head: getComputedStyle(group.querySelector('rect.head')).fill,
      frame: getComputedStyle(group.querySelector('rect.frame')).fill,
      frameOpacity: getComputedStyle(group.querySelector('rect.frame')).fillOpacity,
    }))
    const pending = [...document.querySelectorAll('.overlay[data-status="pending"]')].length
    return { outcome: state.outcome, groups, pending }
  })()`)
  ok(done.outcome === 'success', `nominal run ends SUCCESS`)
  ok(done.groups.every((group) => group.status === 'success'
      && group.head === 'rgb(202, 252, 208)' && group.frame === 'rgb(202, 252, 208)' && Number(group.frameOpacity) < 0.5),
    'on subtree success both group headers turn #CAFCD0 AND the whole surface washes pale green')
  ok(done.pending > 0, `children keep their own fills — the untaken recovery cards stay gray inside the washed groups (${done.pending})`)

  /* ---- scrub round-trips: back to tick 0 is idle; back to live is live ---- */
  await evaluate(page, 'window.__lab.scrub(0)')
  const atZero = await js(`(() => ({
    painted: document.querySelectorAll('.overlay[data-status]:not([data-status=""])').length,
    tick: window.__lab.state().cursorTick }))()`)
  ok(atZero.painted === 0 && atZero.tick === 0, 'scrub to tick 0 restores the untouched chrome (nothing painted)')
  const total = await js('window.__lab.state().frames - 1')
  await evaluate(page, `window.__lab.scrub(${total})`)
  const backLive = await js(`(() => ({
    outcome: window.__lab.state().outcome,
    banner: document.getElementById('banner').textContent }))()`)
  ok(backLive.banner.includes('SUCCESS'), 'scrub to the last tick restores the outcome banner')
} finally {
  session.kill()
}

process.stdout.write(`\n${checks - failures}/${checks} checks passed\n`)
process.exit(failures === 0 ? 0 : 1)
