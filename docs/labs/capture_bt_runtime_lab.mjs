/**
 * Capture real Behavior Tree chrome for the runtime-visualization lab.
 *
 * Boots the real app (own throwaway ports/dirs, headless), projects the
 * Flowstate 15:04 frame — the same tree as the committed
 * docs/assets/behavior-tree/reference-flowstate-15m04.png capture — as a
 * Behavior Tree region, and for each view (Tree·down, Process·down) exports
 * the region through the editor's own `toImage` path plus a geometry dump:
 * per-node rects keyed by btPath, the painted SVG edge/rail/chip/start
 * geometry, all in region-local units that map 1:1 onto the PNG pixels
 * (scale 1, padding 0, bounds = the region's page bounds).
 *
 * The lab then animates runtime status ON these captures, so its node chrome
 * is the app's real renderer, not an invented mock.
 *
 * Output: docs/assets/behavior-tree-runtime/{tree.png,process.png,geometry.json}
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { delay, evaluate, openApp, startApp, waitFor } from '../../tests/browser_harness.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, '..', 'assets', 'behavior-tree-runtime')
const REGION = 'shape:bt-runtime-lab'

/** Intrinsic Flowstate's 15:04 frame as BT.CPP XML — same tree as the
 * committed behavior_tree_smoke.mjs parity capture. */
export const FLOWSTATE_XML = `<root BTCPP_format="4" main_tree_to_execute="RigidBodyAssembly">
  <BehaviorTree ID="RigidBodyAssembly">
    <Sequence name="Rigid Body Assembly">
      <Sequence name="Initialize Workcell">
        <Parallel success_count="-1" failure_count="1">
          <Sequence>
            <enable_motion robot="robot2"/>
            <planned_move robot="robot2"/>
            <Fallback>
              <command_multi_axis_gripper gripper="multi_axis_gripper"/>
              <Sequence>
                <command_multi_axis_gripper gripper="multi_axis_gripper"/>
                <command_multi_axis_gripper gripper="multi_axis_gripper"/>
                <AlwaysFailure/>
              </Sequence>
            </Fallback>
          </Sequence>
          <Sequence>
            <enable_motion robot="robot1"/>
            <planned_move robot="robot1"/>
          </Sequence>
          <Sequence>
            <command_trommel trommel="trommel"/>
            <command_trommel trommel="trommel"/>
          </Sequence>
        </Parallel>
      </Sequence>
      <Sequence name="Pull Part Kit">
        <Fallback>
          <command_multi_axis_gripper gripper="multi_axis_gripper"/>
          <Sequence>
            <command_multi_axis_gripper gripper="multi_axis_gripper"/>
            <command_multi_axis_gripper gripper="multi_axis_gripper"/>
          </Sequence>
        </Fallback>
      </Sequence>
    </Sequence>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="enable_motion"><input_port name="robot"/></Action>
    <Action ID="planned_move"><input_port name="robot"/></Action>
    <Action ID="command_multi_axis_gripper"><input_port name="gripper"/></Action>
    <Action ID="command_trommel"><input_port name="trommel"/></Action>
  </TreeNodesModel>
</root>`

const childrenDump = (page) => evaluate(page, `JSON.stringify((() => {
  const editor = window.__systemsketch.editor
  return editor.getSortedChildIdsForParent('${REGION}').map((id) => {
    const shape = editor.getShape(id)
    return {
      id, type: shape.type, x: shape.x, y: shape.y,
      role: shape.meta.btRole, path: shape.meta.btPath,
      title: shape.props.title ?? shape.props.label ?? null,
      glyph: shape.props.glyph ?? null,
      w: shape.props.w, h: shape.props.h,
    }
  })
})())`).then(JSON.parse)

/** The painted connective tissue, straight from the live DOM (region-local). */
const layerDump = (page) => evaluate(page, `JSON.stringify((() => {
  const svg = document.querySelector('.systemsketch-behavior-tree .BehaviorTree-layer')
  if (!svg) return null
  const edges = [...svg.querySelectorAll('.BehaviorTree-edge')].map((group) => ({
    kind: group.dataset.kind,
    d: group.querySelector('path')?.getAttribute('d') ?? '',
  }))
  const rails = [...svg.querySelectorAll('.BehaviorTree-rail')].map((group) => {
    const lines = [...group.querySelectorAll('line')].map((line) => (
      ['x1', 'y1', 'x2', 'y2'].map((name) => Number(line.getAttribute(name)))
    ))
    return { kind: group.dataset.kind, lines }
  })
  const chips = [...svg.querySelectorAll('.BehaviorTree-chip')].map((group) => {
    const rect = group.querySelector('rect')
    return {
      kind: group.dataset.kind,
      text: group.querySelector('text')?.textContent ?? '',
      x: Number(rect.getAttribute('x')), y: Number(rect.getAttribute('y')),
      w: Number(rect.getAttribute('width')), h: Number(rect.getAttribute('height')),
    }
  })
  const startRect = document.querySelector('.BehaviorTree-start rect')
  const start = startRect ? {
    x: Number(startRect.getAttribute('x')), y: Number(startRect.getAttribute('y')),
    w: Number(startRect.getAttribute('width')), h: Number(startRect.getAttribute('height')),
  } : null
  const groups = [...svg.querySelectorAll('.BehaviorTree-group')].map((group) => {
    const frame = group.querySelector('.BehaviorTree-groupFrame')
    return {
      title: group.querySelector('.BehaviorTree-groupTitle')?.textContent ?? '',
      x: Number(frame.getAttribute('x')), y: Number(frame.getAttribute('y')),
      w: Number(frame.getAttribute('width')), h: Number(frame.getAttribute('height')),
    }
  })
  return { edges, rails, chips, start, groups }
})())`).then(JSON.parse)

/** Export the region through the editor's own renderer, 1 px per page unit. */
const regionImage = (page) => evaluate(page, `(async () => {
  const editor = window.__systemsketch.editor
  const bounds = editor.getShapePageBounds('${REGION}')
  const { blob } = await editor.toImage(['${REGION}'], {
    format: 'png', bounds, padding: 0, scale: 1, pixelRatio: 1, background: true,
  })
  const buffer = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let index = 0; index < buffer.length; index += 1) binary += String.fromCharCode(buffer[index])
  return btoa(binary)
})()`)

const regionProps = (page) => evaluate(page, `JSON.stringify((() => {
  const shape = window.__systemsketch.editor.getShape('${REGION}')
  return { w: shape.props.w, h: shape.props.h, projection: shape.props.projection, orientation: shape.props.orientation }
})())`).then(JSON.parse)

async function captureView(page, name, patch) {
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const shape = editor.getShape('${REGION}')
    editor.updateShape({ id: shape.id, type: shape.type, props: { ...shape.props, ...${JSON.stringify(patch)} } })
    return null
  })()`)
  await delay(500)
  // Keep the region in view so the live DOM layer (edges, rails) is mounted.
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    editor.zoomToBounds(editor.getShapePageBounds('${REGION}'), { inset: 24, animation: { duration: 0 } })
    return null
  })()`)
  await delay(400)
  const [props, children, layer, png] = [
    await regionProps(page), await childrenDump(page), await layerDump(page), await regionImage(page),
  ]
  await writeFile(join(OUT, `${name}.png`), Buffer.from(png, 'base64'))
  return { name, region: props, children, layer }
}

async function main() {
  await mkdir(OUT, { recursive: true })
  const app = await startApp({ label: 'bt-runtime-lab', build: 'bt-runtime-lab-capture', width: 1680, height: 1050 })
  const { page, port } = app
  try {
    await openApp(page, port, '')
    await waitFor(page, 'Boolean(window.__systemsketch?.editor)', 'editor to mount')
    await delay(600)
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      editor.deleteShapes([...editor.getCurrentPageShapeIds()])
      editor.createShape({ id: '${REGION}', type: 'behaviorTree', x: 200, y: 160, props: { xml: ${JSON.stringify(FLOWSTATE_XML)}, title: 'RigidBodyAssembly' } })
      editor.selectNone()
      return null
    })()`)
    await waitFor(page, `window.__systemsketch.editor.getSortedChildIdsForParent('${REGION}').length >= 17`, 'the tree to project')
    await delay(400)

    const views = []
    views.push(await captureView(page, 'tree', { projection: 'tree', orientation: 'down', controlFace: 'expanded', edgeStyle: 'straight' }))
    views.push(await captureView(page, 'process', { projection: 'process', orientation: 'down' }))

    const geometry = { generatedAt: new Date().toISOString(), xml: FLOWSTATE_XML, views }
    await writeFile(join(OUT, 'geometry.json'), JSON.stringify(geometry, null, 2))
    process.stdout.write(`captured ${views.map((view) => `${view.name} (${view.children.length} children)`).join(', ')} -> ${OUT}\n`)
  } finally {
    app.close()
  }
}

// Importable for FLOWSTATE_XML without re-running the capture.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error?.stack ?? error}\n`)
    process.exitCode = 1
  })
}
