/**
 * One-off capture for the stress gallery's Findings section: a close-up of
 * the RecoveryNode dashed Retry loop-back wire crossing directly through its
 * own recovery child's card, instead of routing around it. Not a smoke test
 * (no pass/fail) — just evidence for the report, since the gallery's own
 * automated overlap check only compares leaf card against leaf card, not
 * wire against card, so it would never catch this class of issue.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { delay, evaluate, openApp, startApp, waitFor } from './browser_harness.mjs'
import { SHOTS } from './block_journey_helpers.mjs'

const OUT = join(SHOTS, 'behavior-tree-stress-gallery')
const REGION = 'shape:bt-finding'

const XML = `<root BTCPP_format="4" main_tree_to_execute="RecoveryNodeSimple">
  <BehaviorTree ID="RecoveryNodeSimple">
    <RecoveryNode number_of_retries="3" name="Pick with retry">
      <MoveToPick/>
      <ClearCostmap/>
    </RecoveryNode>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="MoveToPick"/>
    <Action ID="ClearCostmap"/>
  </TreeNodesModel>
</root>`

async function main() {
  await mkdir(OUT, { recursive: true })
  const app = await startApp({ label: 'bt-findings-capture', build: 'bt-findings-capture', width: 1600, height: 1000 })
  const { page, port } = app
  try {
    await openApp(page, port, '')
    await waitFor(page, 'Boolean(window.__systemsketch?.editor)', 'editor to mount')
    await delay(400)
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      editor.deleteShapes([...editor.getCurrentPageShapeIds()])
      editor.createShape({ id: '${REGION}', type: 'behaviorTree', x: 200, y: 160, props: { xml: ${JSON.stringify(XML)}, title: 'finding', projection: 'process' } })
      editor.selectNone()
      return null
    })()`)
    await waitFor(page, `window.__systemsketch.editor.getSortedChildIdsForParent('${REGION}').length >= 1`, 'tree to project')
    await delay(300)
    // Zoom tight on the recovery child's card and the retry loop-back wire
    // beside/through it, the same close-up framing used to confirm this live.
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const bounds = editor.getShapePageBounds('${REGION}')
      const target = { x: bounds.x + bounds.w * 0.45, y: bounds.y + bounds.h * 0.42, w: bounds.w * 0.55, h: bounds.h * 0.5 }
      editor.zoomToBounds(target, { inset: 10, animation: { duration: 0 } })
      return null
    })()`)
    await delay(250)
    const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(join(OUT, 'finding-recoverynode-retry-through-card.png'), Buffer.from(capture.data, 'base64'))
    process.stdout.write('wrote finding-recoverynode-retry-through-card.png\n')
  } finally {
    app.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`)
  process.exit(1)
})
