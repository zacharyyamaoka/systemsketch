/**
 * Behavior Tree run mode, end to end in the real app.
 *
 * What this proves, on an ARBITRARY tree authored through the app's own UI
 * (not the shipped sample):
 *  1. Authoring: a leaf's mock success chance is set to 30% through the
 *     inspector's Mock slider; the value lands on the SKILL's TreeNodesModel
 *     entry (`_mock_success`), and undo removes it in one step.
 *  2. Statistics: with the region's own XML, a 30% node succeeds in roughly
 *     30% of 400 seeded engine runs — never always, never never.
 *  3. Trigger: the ▶ run button on the selection pill starts a mock run; the
 *     transport strip docks on the region, the MOCK RUN tag and mode frame
 *     appear, and ✕ exits.
 *  4. The decided rendering, live: scrubbed to a deep moment, every RUNNING
 *     ancestor is painted lavender with a spinner while the marching dash
 *     covers the chain; group headers tint; pending stays gray.
 *  5. 100% scrub visibility in the app: folding the store's transition log at
 *     random ticks equals the engine's own per-tick snapshots.
 *  6. The Groot2 transitions table: every transition listed, the current scrub
 *     row highlighted, the name filter hides non-matches.
 *  7. Motion vocabulary: the active-path wire visibly marches while an async
 *     cable in the same region is pixel-static (the ambient data-cable march
 *     of 7de23721 is measured too, and must keep moving).
 *  8. Safety: editing the XML mid-run stops the run and marks it stale — the
 *     document is never written by a run.
 *
 * Usage: node tests/behavior_tree_run_mode_smoke.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { delay, evaluate, openApp, startApp, waitFor } from './browser_harness.mjs'
import { changedFraction } from './png_diff.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const SHOTS = join(HERE, '..', 'docs', 'assets', 'bt-run-mode')
const REGION = 'shape:bt-run-mode'

/** An arbitrary tree: two custom skills, a condition, Retry over a flaky
 * gripper three levels deep, a Parallel pairing, an untaken recovery arm. */
const AUTHORED_XML = `<root BTCPP_format="4" main_tree_to_execute="SortCell">
  <BehaviorTree ID="SortCell">
    <Sequence name="Sort Cell">
      <check_hopper hopper="h1"/>
      <Parallel success_count="-1" failure_count="1">
        <Sequence name="Arm A">
          <RetryUntilSuccessful num_attempts="6">
            <pick_widget arm="a" got="{widget}"/>
          </RetryUntilSuccessful>
          <place_widget arm="a" part="{widget}"/>
        </Sequence>
        <spin_drum drum="d"/>
      </Parallel>
      <Fallback name="Handoff">
        <place_widget arm="a" part="{widget}"/>
        <Sequence name="Recovery">
          <pick_widget arm="a" got="{widget}"/>
          <place_widget arm="a" part="{widget}"/>
        </Sequence>
      </Fallback>
    </Sequence>
  </BehaviorTree>
  <TreeNodesModel>
    <Condition ID="check_hopper"><input_port name="hopper"/></Condition>
    <Action ID="pick_widget"><input_port name="arm"/><output_port name="got"/></Action>
    <Action ID="place_widget"><input_port name="arm"/><input_port name="part"/></Action>
    <Action ID="spin_drum"><input_port name="drum"/></Action>
  </TreeNodesModel>
</root>`

let checks = 0
let failures = 0
const ok = (condition, message) => {
  checks += 1
  if (condition) process.stdout.write(`  ✓ ${message}\n`)
  else {
    failures += 1
    process.stdout.write(`  ✗ ${message}\n`)
  }
}

async function main() {
  await mkdir(SHOTS, { recursive: true })
  const app = await startApp({ label: 'bt-run-mode', width: 1760, height: 1100 })
  const { page, port } = app
  try {
    await openApp(page, port, '')
    await waitFor(page, 'Boolean(window.__systemsketch?.editor)', 'editor to mount')
    await delay(500)

    const js = async (expression) => JSON.parse(await evaluate(page, `JSON.stringify(${expression})`))
    const click = async (testId) => {
      const clicked = await evaluate(page, `(() => {
        const el = document.querySelector('[data-testid="${testId}"]')
        if (!el) return false
        el.scrollIntoView({ block: 'nearest' })
        el.click()
        return true
      })()`)
      if (!clicked) throw new Error(`nothing to click for ${testId}`)
      await delay(120)
    }
    const shot = async (name) => {
      await delay(350)
      const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
      await writeFile(join(SHOTS, name), Buffer.from(capture.data, 'base64'))
      process.stdout.write(`  · ${name}\n`)
    }
    const clipShot = async (selector, pad = 6) => {
      const clip = await js(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)})
        if (!el) return null
        const box = el.getBoundingClientRect()
        return { x: Math.max(0, Math.floor(box.x - ${pad})), y: Math.max(0, Math.floor(box.y - ${pad})),
                 width: Math.ceil(box.width + ${pad} * 2), height: Math.ceil(box.height + ${pad} * 2), scale: 1 }
      })()`)
      if (!clip || clip.width < 3 || clip.height < 3) return null
      return (await page.send('Page.captureScreenshot', { format: 'png', clip, fromSurface: true })).data
    }

    // ---- author the tree through the app's own UI --------------------------
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      editor.deleteShapes([...editor.getCurrentPageShapeIds()])
      editor.createShape({ id: '${REGION}', type: 'behaviorTree', x: 220, y: 180, props: { title: 'SortCell' } })
      editor.select('${REGION}')
      return null
    })()`)
    await waitFor(page, `Boolean(document.querySelector('[data-testid="bt-source-xml"]'))`, 'the Source section')
    // Paste + Apply in the real Source editor — the app's own authoring path.
    await evaluate(page, `(() => {
      const area = document.querySelector('[data-testid="bt-source-xml"]')
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
      setter.call(area, ${JSON.stringify(AUTHORED_XML)})
      area.dispatchEvent(new Event('input', { bubbles: true }))
      return null
    })()`)
    await click('bt-source-apply')
    await waitFor(page, `window.__systemsketch.editor.getSortedChildIdsForParent('${REGION}').length >= 12`, 'the authored tree to project')
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      editor.zoomToBounds(editor.getShapePageBounds('${REGION}'), { inset: 60, animation: { duration: 0 } })
      const camera = editor.getCamera()
      editor.setCamera({ x: camera.x, y: camera.y + 150 / camera.z, z: camera.z })
      return null
    })()`)
    ok(true, 'authored an arbitrary tree through the Source editor (12+ projected children)')

    // ---- 1 · author a 30% success chance on the deep flaky skill -----------
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const id = editor.getSortedChildIdsForParent('${REGION}').find((candidate) => {
        const shape = editor.getShape(candidate)
        return shape.meta.btRole === 'node' && shape.props.title === 'pick_widget'
      })
      editor.select(id)
      return null
    })()`)
    await waitFor(page, `Boolean(document.querySelector('[data-testid="bt-mock-success"] input'))`, 'the Mock rows')
    await evaluate(page, `(() => {
      const slider = document.querySelector('[data-testid="bt-mock-success"] input')
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(slider, '30')
      slider.dispatchEvent(new Event('input', { bubbles: true }))
      slider.dispatchEvent(new Event('change', { bubbles: true }))
      slider.dispatchEvent(new Event('blur', { bubbles: true }))
      slider.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
      return null
    })()`)
    await delay(250)
    const authoredXml = await js(`window.__systemsketch.editor.getShape('${REGION}').props.xml`)
    ok(/_mock_success="0.3"/.test(authoredXml) && /Action ID="pick_widget"[^>]*_mock_success/.test(authoredXml.replace(/\n/g, ' ')),
      'the 30% lands as _mock_success on pick_widget\'s TreeNodesModel entry')
    ok((await js(`document.querySelector('[data-testid="bt-mock-success-value"]').textContent`)) === '30%',
      'the Mock slider reads back 30%')
    await evaluate(page, `(window.__systemsketch.editor.undo(), null)`)
    const undone = await js(`window.__systemsketch.editor.getShape('${REGION}').props.xml`)
    ok(!undone.includes('_mock_success'), 'undo removes the authored mock value in one step')
    await evaluate(page, `(window.__systemsketch.editor.redo(), null)`)
    ok((await js(`window.__systemsketch.editor.getShape('${REGION}').props.xml`)).includes('_mock_success="0.3"'),
      'redo restores it')
    await shot('journey-mock-authoring.png')

    // ---- 2 · the statistical bar, against the region's real XML ------------
    const outcomes = await js(`window.__systemsketch.behaviorTree.runtime.engineOutcomes(
      (() => {
        const xml = window.__systemsketch.editor.getShape('${REGION}').props.xml
        // Isolate the 30% skill under the document's own models: a one-node tree.
        const models = xml.slice(xml.indexOf('<TreeNodesModel>'), xml.indexOf('</TreeNodesModel>') + '</TreeNodesModel>'.length)
        return '<root BTCPP_format="4" main_tree_to_execute="Probe"><BehaviorTree ID="Probe"><pick_widget arm="a"/></BehaviorTree>' + models + '</root>'
      })(),
      Array.from({ length: 400 }, (_, index) => index + 1))`)
    const successRate = outcomes.filter((outcome) => outcome === 'success').length / outcomes.length
    ok(successRate > 0.22 && successRate < 0.38,
      `authored 30% is honored statistically — ${(successRate * 100).toFixed(1)}% of 400 seeded runs succeed`)
    ok(outcomes.includes('success') && outcomes.includes('failure'), 'both outcomes occur (randomized, not constant)')

    // ---- 3 · the pill trigger ---------------------------------------------
    await evaluate(page, `(window.__systemsketch.editor.select('${REGION}'), null)`)
    await waitFor(page, `Boolean(document.querySelector('[data-testid="bt-pill-run"]'))`, 'the ▶ run pill button')
    await click('bt-pill-run')
    await waitFor(page, `Boolean(document.querySelector('[data-testid="bt-run-strip"]'))`, 'the transport strip')
    ok(true, '▶ run on the selection pill starts a run and docks the transport strip')
    ok((await js(`document.querySelector('[data-testid="bt-run-tag"]')?.textContent ?? ''`)).includes('MOCK RUN'),
      'the region wears the MOCK RUN mode tag')
    ok((await js(`document.querySelector('[data-testid="bt-region-${REGION}"]')?.dataset.runPhase ?? ''`)) !== '',
      'the region root carries data-run-phase')
    await click('bt-run-exit')
    await delay(200)
    ok(!(await js(`Boolean(document.querySelector('[data-testid="bt-run-strip"]'))`)), '✕ exits run mode cleanly')

    // ---- 4+5 · deterministic run: deep path, fold === snapshots ------------
    const started = await js(`window.__systemsketch.behaviorTree.runtime.start('${REGION}', { seed: 20260905, debugSnapshots: true })`)
    ok(started.phase === 'running' && started.refusedReasons.length === 0, 'a seeded deterministic run starts')
    await waitFor(page, `window.__systemsketch.behaviorTree.runtime.state('${REGION}')?.outcome !== null`, 'the run to finish', 60000)
    const finished = await js(`window.__systemsketch.behaviorTree.runtime.state('${REGION}')`)
    ok(finished.outcome === 'success' || finished.outcome === 'failure', `run finishes (${finished.outcome} at tick ${finished.latestTick})`)

    //   fold(log, t) === engine snapshot at t, for sampled ticks — in-app.
    let foldExact = true
    const sampled = [1, Math.floor(finished.latestTick / 2), finished.latestTick]
    for (let i = 0; i < 5; i += 1) sampled.push(1 + ((i * 7919) % finished.latestTick))
    for (const tick of sampled) {
      const fold = await js(`window.__systemsketch.behaviorTree.runtime.foldAtTick('${REGION}', ${tick})`)
      const snapshot = await js(`window.__systemsketch.behaviorTree.runtime.snapshotAtTick('${REGION}', ${tick})`)
      if (!snapshot) { foldExact = false; break }
      const keys = new Set([...Object.keys(fold), ...Object.keys(snapshot)])
      for (const key of keys) {
        if (fold[key] !== snapshot[key]) {
          foldExact = false
          process.stdout.write(`    fold≠snapshot at tick ${tick} ${key}: ${fold[key]} vs ${snapshot[key]}\n`)
        }
      }
    }
    ok(foldExact, `the store's transition log reconstructs ${sampled.length} sampled ticks exactly (fold === engine snapshot)`)

    //   find the deepest running moment from the log and scrub the UI there.
    const log = await js(`window.__systemsketch.behaviorTree.runtime.log('${REGION}')`)
    ok(log.length > 10, `the canonical log holds ${log.length} transitions`)
    let deepTick = null
    for (const entry of log) {
      if (entry.to === 'running' && entry.path.split('.').length >= 5) { deepTick = entry.tick; break }
    }
    ok(deepTick !== null, `a ≥5-deep RUNNING moment exists (tick ${deepTick})`)
    await evaluate(page, `window.__systemsketch.behaviorTree.runtime.scrubToTick('${REGION}', ${deepTick})`)
    await delay(500)
    const deepDom = await js(`(() => {
      const fold = window.__systemsketch.behaviorTree.runtime.foldAtTick('${REGION}', ${deepTick})
      const running = Object.entries(fold).filter(([, status]) => status === 'running').map(([key]) => key.split(':')[1])
      const nodes = [...document.querySelectorAll('.BtRun-node[data-status="running"]')]
      const marching = [...document.querySelectorAll('.BehaviorTree-statusWire[data-s="running"]')]
      const pending = [...document.querySelectorAll('.BtRun-node[data-status="pending"]')]
      const fill = nodes[0] ? getComputedStyle(nodes[0].querySelector('.BtRun-fill')).backgroundColor : null
      return {
        running, painted: nodes.map((node) => node.dataset.path),
        spinners: nodes.filter((node) => node.querySelector('.BtRun-spinner')).length,
        marching: marching.length, pending: pending.length, fill,
      }
    })()`)
    const runningSet = new Set(deepDom.running)
    const ancestorsCovered = deepDom.running.every((path) => {
      for (let cut = path.lastIndexOf('.'); cut > 0; cut = path.lastIndexOf('.', cut - 1)) {
        if (!runningSet.has(path.slice(0, cut))) return false
      }
      return true
    })
    ok(ancestorsCovered && deepDom.running.length >= 5,
      `every ancestor of the running leaf is RUNNING (${deepDom.running.length} nodes on the active path)`)
    ok(deepDom.painted.length === deepDom.running.length && deepDom.spinners === deepDom.running.length,
      `each of them is painted lavender AND carries a spinner (${deepDom.spinners} spinners)`)
    ok(deepDom.fill === 'rgba(74, 18, 236, 0.16)', `the running fill composites to Flowstate #E2D9FC over the white card (got ${deepDom.fill})`)
    ok(deepDom.marching >= deepDom.running.length - 1, `the marching dash covers the chain (${deepDom.marching} wires)`)
    ok(deepDom.pending > 0, `not-yet-reached nodes hold pending gray (${deepDom.pending})`)
    await shot('journey-deep-path.png')

    // ---- 6 · the transitions table ----------------------------------------
    await evaluate(page, `(window.__systemsketch.editor.select('${REGION}'), null)`)
    await waitFor(page, `Boolean(document.querySelector('[data-testid="bt-run-transitions"]'))`, 'the transitions table')
    const table = await js(`(() => {
      const rows = [...document.querySelectorAll('[data-testid="bt-run-transitions"] tbody tr')]
      const current = document.querySelector('[data-testid="bt-run-transitions"] tr[data-current]')
      const state = window.__systemsketch.behaviorTree.runtime.state('${REGION}')
      return { rows: rows.length, transitions: state.transitions,
               currentIndex: current ? Number(current.dataset.index) : null, cursorIndex: state.cursor.index }
    })()`)
    ok(table.rows === table.transitions, `the table lists every transition (${table.rows})`)
    ok(table.currentIndex === table.cursorIndex, `the current scrub row is highlighted (index ${table.currentIndex})`)
    await click('bt-run-trans-prev')
    const afterPrev = await js(`(() => {
      const current = document.querySelector('[data-testid="bt-run-transitions"] tr[data-current]')
      const state = window.__systemsketch.behaviorTree.runtime.state('${REGION}')
      return { currentIndex: current ? Number(current.dataset.index) : null, cursorIndex: state.cursor.index }
    })()`)
    ok(afterPrev.currentIndex === afterPrev.cursorIndex && afterPrev.currentIndex === table.currentIndex - 1,
      '« steps back exactly one transition and the highlight follows')
    await evaluate(page, `(() => {
      const filter = document.querySelector('[data-testid="bt-run-filter"]')
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(filter, 'pick')
      filter.dispatchEvent(new Event('input', { bubbles: true }))
      return null
    })()`)
    await delay(200)
    const filtered = await js(`(() => {
      const rows = [...document.querySelectorAll('[data-testid="bt-run-transitions"] tbody tr')]
      return { visible: rows.length, allMatch: rows.every((row) => row.textContent.toLowerCase().includes('pick')) }
    })()`)
    ok(filtered.visible > 0 && filtered.allMatch, `the name filter narrows the table (${filtered.visible} pick rows)`)
    await shot('journey-transitions-table.png')

    // ---- 7 · motion vocabulary: marching path vs static async cable --------
    //   an async cable inside the SAME region: flip the dataflow lens on (its
    //   cables are real connection shapes) and mark one async.
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const region = editor.getShape('${REGION}')
      editor.updateShape({ id: '${REGION}', type: 'behaviorTree', props: { ...region.props, dataLens: 'dataflow' } })
      return null
    })()`)
    await waitFor(page, `window.__systemsketch.editor.getCurrentPageShapes().some((shape) => shape.meta?.btRole === 'cable' && shape.meta?.btRegion === '${REGION}')`, 'dataflow cables to project')
    const cables = await js(`(() => {
      const editor = window.__systemsketch.editor
      const all = editor.getCurrentPageShapes().filter((shape) => shape.meta?.btRole === 'cable' && shape.meta?.btRegion === '${REGION}')
      if (all.length > 1) editor.updateShape({ id: all[0].id, type: 'connection', props: { temporal: 'async' } })
      return { count: all.length, asyncId: all[0]?.id ?? null, dataId: all[1]?.id ?? null }
    })()`)
    ok(cables.count >= 2, `the dataflow lens projects real cables (${cables.count}); one flipped to async`)
    await delay(400)
    const moved = {}
    const measure = async (name, selector) => {
      const first = await clipShot(selector)
      await delay(420)
      const second = await clipShot(selector)
      moved[name] = first && second ? changedFraction(first, second) : null
    }
    await measure('active', '.BehaviorTree-statusWire[data-s="running"]')
    // The cable dashes are 5px marks: zoom to the cables so "visibly moving /
    // visibly still" is measured at a zoom where a person could see either.
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const bounds = editor.getShapePageBounds('${cables.asyncId}')
      editor.zoomToBounds(bounds, { inset: 160, animation: { duration: 0 } })
      return null
    })()`)
    await delay(300)
    await measure('async', `[data-shape-id="${cables.asyncId}"] path[data-edge-type="async"]`)
    ok(moved.active !== null && moved.active > 0.01,
      `the active-path wire visibly marches — ${(moved.active * 100).toFixed(1)}% of pixels moved across 420ms`)
    ok(moved.async !== null && moved.async < 0.005,
      `the async cable in the same region is pixel-static — ${(moved.async * 100).toFixed(2)}% moved`)
    // The ambient data-cable march (7de23721) is compositor-driven, which
    // this capture path can miss in headless — so assert it the way its own
    // acceptance does (data_cable_march_smoke DCM-6): the animation is
    // attached and stroke-dashoffset genuinely advances between two reads.
    const dataMarch = JSON.parse(await evaluate(page, `(async () => {
      const path = document.querySelector('[data-shape-id="${cables.dataId}"] .ConnectionShape-marchingData')
      if (!path) return 'null'
      const first = getComputedStyle(path).strokeDashoffset
      await new Promise((resolve) => setTimeout(resolve, 260))
      return JSON.stringify({ animation: getComputedStyle(path).animationName, first, second: getComputedStyle(path).strokeDashoffset })
    })()`))
    ok(dataMarch !== null && dataMarch.animation === 'systemsketch-data-cable-march' && dataMarch.first !== dataMarch.second,
      `the ambient data-cable march keeps running beside it (dashoffset ${dataMarch?.first} → ${dataMarch?.second})`)
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const region = editor.getShape('${REGION}')
      editor.updateShape({ id: '${REGION}', type: 'behaviorTree', props: { ...region.props, dataLens: 'none' } })
      return null
    })()`)

    // ---- 8 · XML drift stops the run and the document stays clean ----------
    await delay(300)
    const beforeStale = await js(`window.__systemsketch.behaviorTree.runtime.state('${REGION}')`)
    ok(beforeStale !== null, 'the run survives view-prop changes (lens flips are not drift)')
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const region = editor.getShape('${REGION}')
      editor.updateShape({ id: '${REGION}', type: 'behaviorTree', props: { ...region.props, xml: region.props.xml.replace('name="Sort Cell"', 'name="Sort Cell 2"') } })
      return null
    })()`)
    await delay(300)
    const stale = await js(`window.__systemsketch.behaviorTree.runtime.state('${REGION}')?.phase`)
    ok(stale === 'stale', `editing the XML mid-run marks the run stale (${stale})`)
    const finalXml = await js(`window.__systemsketch.editor.getShape('${REGION}').props.xml`)
    ok(!/"(running|halted)"/.test(finalXml) && !finalXml.includes('btRunStatus'),
      'no runtime status ever reaches the document')
    await evaluate(page, `window.__systemsketch.behaviorTree.runtime.stop('${REGION}')`)
  } finally {
    app.stop()
  }
  process.stdout.write(`\n${checks - failures}/${checks} checks passed\n`)
  process.exit(failures === 0 ? 0 : 1)
}

await main()
