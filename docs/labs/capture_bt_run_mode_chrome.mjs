/**
 * Capture the real chrome surfaces the run-mode trigger proposals composite
 * onto: the app with a Behavior Tree region selected (selection pill up,
 * inspector dock open), in Tree and Process views, plus a screen-rect dump of
 * every surface a proposal wants to annotate — region header, selection pill,
 * inspector View section, the toolbar, the region itself and its Start pill.
 *
 * Output: docs/assets/bt-run-mode/{tree-selected.png,process-selected.png,
 * node-selected.png,geometry.json}
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { delay, evaluate, openApp, startApp, waitFor } from '../../tests/browser_harness.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, '..', 'assets', 'bt-run-mode')
const REGION = 'shape:bt-run-mode-capture'

const XML = `<root BTCPP_format="4" main_tree_to_execute="RigidBodyAssembly">
  <BehaviorTree ID="RigidBodyAssembly">
    <Sequence name="Rigid Body Assembly">
      <Sequence name="Initialize Workcell">
        <Fallback>
          <command_multi_axis_gripper gripper="multi_axis_gripper"/>
          <Sequence>
            <command_multi_axis_gripper gripper="multi_axis_gripper"/>
            <AlwaysFailure/>
          </Sequence>
        </Fallback>
      </Sequence>
      <Sequence name="Pull Part Kit">
        <command_trommel trommel="trommel"/>
        <planned_move robot="robot1"/>
      </Sequence>
    </Sequence>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="command_multi_axis_gripper"><input_port name="gripper"/></Action>
    <Action ID="command_trommel"><input_port name="trommel"/></Action>
    <Action ID="planned_move"><input_port name="robot"/></Action>
  </TreeNodesModel>
</root>`

await mkdir(OUT, { recursive: true })
const app = await startApp({ label: 'bt-run-mode-capture', width: 1760, height: 1100 })
const { page, port } = app
try {
  await openApp(page, port, '')
  await waitFor(page, 'Boolean(window.__systemsketch?.editor)', 'editor to mount')
  await delay(600)

  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    editor.deleteShapes([...editor.getCurrentPageShapeIds()])
    editor.createShape({ id: '${REGION}', type: 'behaviorTree', x: 200, y: 160, props: { xml: ${JSON.stringify(XML)}, title: 'RigidBodyAssembly' } })
    editor.selectNone()
    return null
  })()`)
  await waitFor(page, `window.__systemsketch.editor.getSortedChildIdsForParent('${REGION}').length >= 8`, 'the tree to project')

  const fit = async () => {
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const bounds = editor.getShapePageBounds('${REGION}')
      editor.zoomToBounds(bounds, { inset: 72, animation: { duration: 0 } })
      // Push the region below the app's floating top chrome (board bar,
      // preview banner) so its header band and Start area capture clean.
      const camera = editor.getCamera()
      editor.setCamera({ x: camera.x, y: camera.y + 170 / camera.z, z: camera.z })
      return null
    })()`)
    await delay(250)
  }
  const select = async () => {
    await evaluate(page, `(window.__systemsketch.editor.select('${REGION}'), null)`)
    await waitFor(page, `Boolean(document.querySelector('.bt-mini-menu'))`, 'the selection pill')
    await delay(350)
  }
  const shot = async (name) => {
    await delay(300)
    const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(join(OUT, name), Buffer.from(capture.data, 'base64'))
    process.stdout.write(`  ${name}\n`)
  }
  const rects = () => evaluate(page, `JSON.stringify((() => {
    const editor = window.__systemsketch.editor
    const rect = (selector) => {
      const el = document.querySelector(selector)
      if (!el) return null
      const box = el.getBoundingClientRect()
      return { x: box.x, y: box.y, w: box.width, h: box.height }
    }
    const regionScreen = (() => {
      const bounds = editor.getShapePageBounds('${REGION}')
      const min = editor.pageToViewport({ x: bounds.minX, y: bounds.minY })
      const max = editor.pageToViewport({ x: bounds.maxX, y: bounds.maxY })
      return { x: min.x, y: min.y, w: max.x - min.x, h: max.y - min.y }
    })()
    const zoom = editor.getZoomLevel()
    return {
      zoom,
      region: regionScreen,
      header: rect('.BehaviorTree-header'),
      pill: rect('.bt-mini-menu'),
      pillViews: rect('.bt-mini-menu .block-mini-menu__views'),
      inspector: rect('[data-testid="bt-inspector"]'),
      inspectorView: rect('[data-inspector-section="View"]'),
      inspectorNode: rect('[data-inspector-section="Node"]'),
      toolbar: rect('.tlui-toolbar'),
      start: rect('[data-testid="bt-start"]'),
    }
  })())`).then(JSON.parse)

  await fit()
  await select()
  const treeRects = await rects()
  await shot('tree-selected.png')

  // Process view, still selected.
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const region = editor.getShape('${REGION}')
    editor.updateShape({ id: '${REGION}', type: 'behaviorTree', props: { ...region.props, projection: 'process' } })
    return null
  })()`)
  await delay(400)
  await fit()
  await select()
  const processRects = await rects()
  await shot('process-selected.png')

  // A leaf node selected (Inspector shows the Node section) — for the
  // mock-parameter authoring mock. Back to Tree first.
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const region = editor.getShape('${REGION}')
    editor.updateShape({ id: '${REGION}', type: 'behaviorTree', props: { ...region.props, projection: 'tree' } })
    return null
  })()`)
  await delay(400)
  await fit()
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const id = editor.getSortedChildIdsForParent('${REGION}').find((candidate) => {
      const shape = editor.getShape(candidate)
      return shape.meta.btPath === '0.0.0.0' && shape.meta.btRole === 'node'
    })
    if (id) editor.select(id)
    return null
  })()`)
  await delay(450)
  const nodeRects = await rects()
  await shot('node-selected.png')

  await writeFile(join(OUT, 'geometry.json'), JSON.stringify({ tree: treeRects, process: processRects, node: nodeRects }, null, 2))
  process.stdout.write('  geometry.json\n')
} finally {
  app.stop()
}
