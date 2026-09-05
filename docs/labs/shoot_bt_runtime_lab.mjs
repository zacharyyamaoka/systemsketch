/**
 * Drive the runtime lab headlessly and capture the states the report embeds.
 *
 * The lab is seeded, so the walk is reproducible: the script first scans
 * seeds for a run that tells the Flowstate story — a gripper attempt FAILS
 * and the Fallback's recovery branch takes over — then replays that seed and
 * captures: a genuinely mid-run frame, the recovery moment, the resolved run
 * (step colors), a scrubbed-back frame, and the same run in the Process view.
 *
 * Usage: node docs/labs/shoot_bt_runtime_lab.mjs [docs/bt-runtime-lab-<date>.html]
 */
import { writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { delay, evaluate, launchChrome, openCdpPage, waitFor } from '../../tests/cdp_kit.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, '..', 'assets', 'behavior-tree-runtime')
const lab = resolve(process.argv[2] ?? join(HERE, '..', 'bt-runtime-lab-2026-09-05.html'))

const session = await launchChrome({ label: 'bt-runtime-lab-shoot', width: 1760, height: 1100 })
try {
  const page = await openCdpPage(await session.devToolsPort(), { width: 1760, height: 1100 })
  await page.send('Page.navigate', { url: `file://${lab}` })
  await waitFor(page, 'Boolean(window.__lab)', 'lab to boot')
  await delay(400)

  const shot = async (name) => {
    await delay(350)
    const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(join(OUT, `${name}.png`), Buffer.from(capture.data, 'base64'))
    process.stdout.write(`  ${name}.png\n`)
  }

  // ---- pick a seed whose run recovers through the Fallback -----------------
  const plan = JSON.parse(await evaluate(page, `(() => {
    const runs = []
    for (let seed = 1; seed <= 40; seed += 1) {
      window.__lab.reset(seed)
      let gripperFailTick = null
      let guard = 0
      while (!window.__lab.state().outcome && guard < 120) {
        window.__lab.step(1)
        guard += 1
      }
      const summary = window.__lab.summary()
      runs.push({ seed, ...summary })
    }
    const story = runs.find((run) => run.outcome === 'success' && run.gripperFailures > 0 && run.ticks >= 8)
      ?? runs.find((run) => run.gripperFailures > 0 && run.ticks >= 8)
      ?? runs.reduce((best, run) => (run.ticks > best.ticks ? run : best))
    return JSON.stringify({ chosen: story, sample: runs.slice(0, 6) })
  })()`))
  process.stdout.write(`seed scan -> ${JSON.stringify(plan.chosen)}\n`)
  const seed = plan.chosen.seed

  // ---- replay the chosen run ----------------------------------------------
  await evaluate(page, `window.__lab.reset(${seed})`)
  await evaluate(page, 'window.__lab.step(2)')
  await shot('lab-running')

  if (plan.chosen.firstGripperFailTick) {
    await evaluate(page, `(() => {
      while (window.__lab.state().cursorTick < ${plan.chosen.firstGripperFailTick + 1}
             && !window.__lab.state().outcome) window.__lab.step(1)
    })()`)
    await shot('lab-recovery')
  }

  await evaluate(page, `(() => {
    let guard = 0
    while (!window.__lab.state().outcome && guard < 200) { window.__lab.step(1); guard += 1 }
  })()`)
  const finished = JSON.parse(await evaluate(page, 'JSON.stringify(window.__lab.state())'))
  await evaluate(page, "window.__lab.mode('step')")
  await shot('lab-resolved')

  await evaluate(page, `window.__lab.scrub(${Math.max(2, Math.floor((finished.frames - 1) / 2))})`)
  await shot('lab-scrubbed')

  await evaluate(page, "window.__lab.view('process')")
  await evaluate(page, `window.__lab.scrub(${finished.frames - 1})`)
  await shot('lab-process')

  await writeFile(join(OUT, 'lab-shoot.json'), JSON.stringify({ seed, chosen: plan.chosen, finished }, null, 2))
  process.stdout.write(`outcome=${finished.outcome} frames=${finished.frames} seed=${seed}\n`)
} finally {
  session.kill()
}
