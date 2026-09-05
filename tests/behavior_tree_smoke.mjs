/**
 * The Behavior Tree region, driven in a real browser.
 *
 *   A region projects its BT.CPP XML onto real child Blocks and control
 *   cards; the selection pill flips Tree / Process, direction, node face and
 *   lens; the Blackboard lens places key pills three ways; the Dataflow lens
 *   wires proven writers to readers with real connections; the on-canvas "+"
 *   inserts through the Add-process menu; Delete removes an occurrence; a drag
 *   records a free offset that Tidy forgets; the inspector renames through
 *   the XML; and every edit is one undo step.
 *
 * Every claim is read back from the editor or the painted DOM. Screenshots
 * land in docs/assets/behavior-tree/ and are buffered until the checks pass.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  clickAt,
  clickElement,
  delay,
  drag,
  elementBox,
  evaluate,
  key,
  localConsoleErrors,
  openApp,
  shortcut,
  startApp,
  typeSlowly,
  waitFor,
} from './browser_harness.mjs'
import { SHOTS } from './block_journey_helpers.mjs'

const OUT = join(SHOTS, 'behavior-tree')

/** Intrinsic Flowstate's 15:04 frame, as BT.CPP XML. */
const FLOWSTATE_XML = `<root BTCPP_format="4" main_tree_to_execute="RigidBodyAssembly">
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

/** MoveIt Pro's "Open Cabinet Door" objective at 00:35, as BT.CPP XML. */
const MOVEIT_XML = `<root BTCPP_format="4" main_tree_to_execute="OpenCabinetDoor">
  <BehaviorTree ID="OpenCabinetDoor">
    <Sequence name="Open Cabinet Door">
      <LoadObjectiveParameters config_file_name="open_door.yaml" parameters="{parameters}"/>
      <GetHingeAxisFromSurfaceSelection target_grasp_pose="{target_grasp_pose}" hinge_axis_pose_start="{hinge_axis_pose_start}" hinge_axis_pose_end="{hinge_axis_pose_end}"/>
      <MoveGripperAction gripper_command_action_name="/robotiq_gripper_controller" position="0.7929"/>
      <Sequence>
        <InitializeMTCTask controller_names="/joint_trajectory_controller" task="{mtc_task}"/>
        <SetupMTCCurrentState task="{mtc_task}"/>
        <SetupMTCAffordanceTemplate grasp_pose="{grasp_pose}" parameters="{parameters}" screw_axis_pose="{screw_axis_pose}"/>
        <PlanMTCTask task="{mtc_task}" solution="{mtc_solution}"/>
      </Sequence>
    </Sequence>
  </BehaviorTree>
  <TreeNodesModel>
    <Action ID="LoadObjectiveParameters"><input_port name="config_file_name"/><output_port name="parameters"/></Action>
    <Action ID="GetHingeAxisFromSurfaceSelection"><input_port name="target_grasp_pose"/><input_port name="hinge_axis_pose_start"/><input_port name="hinge_axis_pose_end"/></Action>
    <Action ID="MoveGripperAction"><input_port name="gripper_command_action_name"/><input_port name="position"/></Action>
    <Action ID="InitializeMTCTask"><input_port name="controller_names"/><output_port name="task"/></Action>
    <Action ID="SetupMTCCurrentState"><inout_port name="task"/></Action>
    <Action ID="SetupMTCAffordanceTemplate"><input_port name="grasp_pose"/><input_port name="parameters"/><input_port name="screw_axis_pose"/></Action>
    <Action ID="PlanMTCTask"><input_port name="task"/><output_port name="solution"/></Action>
  </TreeNodesModel>
</root>`
const REGION = 'shape:bt-review'
const results = []
const pending = []
let journeyError = null

function check(id, label, observed, desired) {
  const ok = JSON.stringify(observed) === JSON.stringify(desired)
  results.push({ id, label, observed, desired, ok })
  process.stdout.write(`  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}\n`
    + (ok ? '' : `        observed=${JSON.stringify(observed)} desired=${JSON.stringify(desired)}\n`))
  return ok
}

async function shot(page, name) {
  const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  pending.push({ name, data: Buffer.from(capture.data, 'base64') })
}

const region = (page) => evaluate(page, `JSON.stringify((() => {
  const shape = window.__systemsketch.editor.getShape('${REGION}')
  return shape ? { x: shape.x, y: shape.y, ...shape.props, xml: undefined, xmlLength: shape.props.xml.length } : null
})())`).then(JSON.parse)

const regionXml = (page) => evaluate(page, `window.__systemsketch.editor.getShape('${REGION}')?.props.xml ?? ''`)

const children = (page) => evaluate(page, `JSON.stringify((() => {
  const editor = window.__systemsketch.editor
  return editor.getSortedChildIdsForParent('${REGION}').map((id) => {
    const shape = editor.getShape(id)
    return { id, type: shape.type, x: shape.x, y: shape.y, role: shape.meta.btRole, path: shape.meta.btPath,
      title: shape.props.title ?? shape.props.label ?? null, view: shape.props.view ?? shape.props.face ?? null,
      w: shape.props.w, h: shape.props.h }
  })
})())`).then(JSON.parse)

async function fitRegion(page) {
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const bounds = editor.getShapePageBounds('${REGION}')
    editor.zoomToBounds(bounds, { inset: 48, animation: { duration: 0 } })
    return null
  })()`)
  await delay(250)
}

async function selectRegion(page) {
  await evaluate(page, `(window.__systemsketch.editor.select('${REGION}'), null)`)
  await delay(200)
}

async function selectPath(page, path) {
  return evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const id = editor.getSortedChildIdsForParent('${REGION}').find((candidate) => editor.getShape(candidate).meta.btPath === ${JSON.stringify(path)} && editor.getShape(candidate).meta.btRole === 'node')
    if (id) editor.select(id)
    return id ?? null
  })()`).then((value) => value ?? null)
}

/** A point on a child, in screen pixels, from page-unit offsets inside its card. */
async function childPoint(page, path, dx, dy) {
  return JSON.parse(await evaluate(page, `JSON.stringify((() => {
    const editor = window.__systemsketch.editor
    const id = editor.getSortedChildIdsForParent('${REGION}').find((candidate) => editor.getShape(candidate).meta.btPath === ${JSON.stringify(path)} && editor.getShape(candidate).meta.btRole === 'node')
    const bounds = editor.getShapePageBounds(id)
    const point = editor.pageToScreen({ x: bounds.minX + ${dx}, y: bounds.minY + ${dy} })
    return { x: point.x, y: point.y }
  })())`))
}

async function setView(page, patch) {
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const shape = editor.getShape('${REGION}')
    editor.updateShape({ id: shape.id, type: shape.type, props: { ...shape.props, ...${JSON.stringify(patch)} } })
    return null
  })()`)
  await delay(300)
}

async function main() {
  await mkdir(OUT, { recursive: true })
  const app = await startApp({ label: 'behavior-tree', build: 'behavior-tree-smoke', width: 1680, height: 1050 })
  const { page, port } = app
  try {
    await openApp(page, port, '')
    await waitFor(page, 'Boolean(window.__systemsketch?.editor)', 'editor to mount')
    await delay(600)

    // ---- projection ---------------------------------------------------------
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      editor.deleteShapes([...editor.getCurrentPageShapeIds()])
      editor.createShape({ id: '${REGION}', type: 'behaviorTree', x: 200, y: 160, props: { xml: window.__systemsketch.behaviorTree.SAMPLE_BEHAVIOR_TREE_XML, title: 'PickAndPlace' } })
      editor.selectNone()
      return null
    })()`)
    await waitFor(page, `window.__systemsketch.editor.getSortedChildIdsForParent('${REGION}').length >= 13`, 'the tree to project')
    await delay(300)
    let kids = await children(page)
    check('project.count', 'the sample projects 13 occurrences as children', kids.filter((child) => child.role === 'node').length, 13)
    check('project.leaves', 'leaves are real Blocks, controls are control cards',
      { blocks: kids.filter((child) => child.type === 'block').length, controls: kids.filter((child) => child.type === 'behaviorTreeControl').length },
      { blocks: 9, controls: 4 })
    check('project.titles', 'leaf titles are the XML labels',
      kids.filter((child) => child.type === 'block').map((child) => child.title),
      ['MoveToObj', 'GraspValid', 'CorrectGrip', 'CloseGrip', 'MoveHome', 'CloseGrip', 'CloseGrip', 'MoveHome', 'MoveHome'])
    await fitRegion(page)
    await shot(page, 'tree-down.png')

    // ---- selection pill flips ---------------------------------------------
    await selectRegion(page)
    await waitFor(page, `Boolean(document.querySelector('[data-testid="bt-pill-process"]'))`, 'the selection pill')
    await shot(page, 'tree-down-selected.png')
    await clickElement(page, '[data-testid="bt-pill-right"]')
    await delay(350)
    check('pill.orientation', 'L→R through the pill', (await region(page)).orientation, 'right')
    await fitRegion(page)
    await shot(page, 'tree-right.png')
    await selectRegion(page)
    await clickElement(page, '[data-testid="bt-pill-process"]')
    await delay(350)
    check('pill.projection', 'Process through the pill', (await region(page)).projection, 'process')
    kids = await children(page)
    check('process.leaves-only', 'Process view draws leaves only; controls are rails and groups',
      { blocks: kids.filter((child) => child.type === 'block').length, controls: kids.filter((child) => child.type === 'behaviorTreeControl').length },
      { blocks: 9, controls: 0 })
    await fitRegion(page)
    await shot(page, 'process-right.png')
    await selectRegion(page)
    await clickElement(page, '[data-testid="bt-pill-down"]')
    await delay(350)
    await fitRegion(page)
    await shot(page, 'process-down.png')
    check('process.rails', 'the Parallel paints a fork and a join bar',
      await evaluate(page, `document.querySelectorAll('.BehaviorTree-rail').length`), 2)
    check('process.failure-chip', 'the Fallback paints its Failure chip',
      await evaluate(page, `Array.from(document.querySelectorAll('.BehaviorTree-chip[data-kind="failure"] text')).map((node) => node.textContent)`), ['Failure'])

    // ---- inspector: compact controls and elbow wires ------------------------
    await setView(page, { projection: 'tree', orientation: 'right', controlFace: 'compact', edgeStyle: 'elbow' })
    await fitRegion(page)
    kids = await children(page)
    check('tree.compact', 'compact controls are 56px squares',
      kids.filter((child) => child.type === 'behaviorTreeControl').map((child) => [child.w, child.h]), [[56, 56], [56, 56], [56, 56], [56, 56]])
    await shot(page, 'tree-right-compact-elbow.png')

    // ---- port face ----------------------------------------------------------
    await setView(page, { orientation: 'down', controlFace: 'expanded', edgeStyle: 'straight', nodeFace: 'port' })
    await fitRegion(page)
    kids = await children(page)
    const graspValid = kids.find((child) => child.path === '0.1.0')
    check('ports.face', 'leaves switch to the port face', graspValid.view, 'port')
    check('ports.rows', 'GraspValid shows its two XML ports',
      await evaluate(page, `JSON.stringify(Array.from(document.querySelectorAll('[data-shape-id="${graspValid.id}"] .Port')).map((dot) => dot.getAttribute('data-block-port-id')).sort())`).then(JSON.parse),
      ['in:pose', 'out:quality'])
    await shot(page, 'tree-down-ports.png')

    // ---- Blackboard lens, three placements -----------------------------------
    for (const layout of ['rail', 'table', 'pytrees']) {
      await setView(page, { nodeFace: 'simple', dataLens: 'blackboard', blackboardLayout: layout })
      await fitRegion(page)
      kids = await children(page)
      const pills = kids.filter((child) => child.role === 'key')
      check(`blackboard.${layout}.pills`, `${layout}: one value pill per key`, pills.map((pill) => pill.path).sort(),
        ['key:grip_force', 'key:grip_state', 'key:home_pose', 'key:object_pose', 'key:quality'])
      check(`blackboard.${layout}.view`, `${layout}: pills are value Blocks`, [...new Set(pills.map((pill) => pill.view))], ['value'])
      check(`blackboard.${layout}.edges`, `${layout}: writes are blue, reads are green`,
        await evaluate(page, `JSON.stringify({ write: document.querySelectorAll('.BehaviorTree-edge[data-kind="write"]').length, read: document.querySelectorAll('.BehaviorTree-edge[data-kind="read"]').length })`).then(JSON.parse),
        { write: 6, read: 9 })
      await shot(page, `blackboard-${layout}.png`)
      if (layout === 'pytrees') {
        // The placement py_trees is compared against, in region-local units.
        pending.push({ name: 'pytrees-placement.json', data: Buffer.from(JSON.stringify({ region: await region(page), children: kids }, null, 2)) })
      }
    }
    await setView(page, { projection: 'process', orientation: 'down', blackboardLayout: 'pytrees' })
    await fitRegion(page)
    await shot(page, 'process-blackboard-pytrees.png')

    // ---- Dataflow lens --------------------------------------------------------
    await setView(page, { projection: 'process', dataLens: 'dataflow' })
    await fitRegion(page)
    await delay(400)
    kids = await children(page)
    const cables = await evaluate(page, `JSON.stringify(window.__systemsketch.editor.getCurrentPageShapes().filter((shape) => shape.meta.btRole === 'cable' && shape.meta.btRegion === '${REGION}').map((shape) => shape.meta.btPath))`).then(JSON.parse)
    check('dataflow.forces', 'Dataflow reads left-to-right with ports', { orientation: (await region(page)).orientation, faces: [...new Set(kids.filter((child) => child.role === 'node' && child.type === 'block').map((child) => child.view))] }, { orientation: 'down', faces: ['port'] })
    const repair = await evaluate(page, `JSON.stringify(window.__systemsketch.behaviorTree.reconcile('${REGION}'))`).then(JSON.parse)
    check('dataflow.cables', 'proven writers are wired with real connections', { cables: cables.length > 0, refused: repair.refused }, { cables: true, refused: [] })
    check('dataflow.unbundle', 'the tree\'s own inputs arrive through one unbundle', kids.filter((child) => child.role === 'unbundle').length, 1)
    await shot(page, 'process-dataflow.png')
    await setView(page, { projection: 'tree', dataLens: 'none', nodeFace: 'simple', orientation: 'down' })

    // ---- insert through the on-canvas "+" -----------------------------------
    await setView(page, { projection: 'process' })
    await fitRegion(page)
    await selectRegion(page)
    const xmlBefore = await regionXml(page)
    // Bring the end target to the middle of the viewport so its menu opens
    // clear of the bottom toolbar, the way a person would scroll before adding.
    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const button = document.querySelector('[data-testid="bt-insert-end"]')
      const rect = button.getBoundingClientRect()
      const point = editor.screenToPage({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
      editor.setCamera({ x: editor.getCamera().x, y: editor.getCamera().y, z: 0.8 })
      editor.centerOnPoint(point, { animation: { duration: 0 } })
      return null
    })()`)
    await delay(300)
    await clickElement(page, '[data-testid="bt-insert-end"]')
    await waitFor(page, `Boolean(document.querySelector('[data-testid="bt-insert-menu"]'))`, 'the Add-process menu')
    check('insert.menu-rows', 'the first page is Skills, Control flow, Fail',
      await evaluate(page, `JSON.stringify(Array.from(document.querySelectorAll('[data-testid="bt-insert-menu"] .BehaviorTree-menuRowLabel')).map((node) => node.textContent))`).then(JSON.parse),
      ['Skills', 'Control flow', 'Fail'])
    await shot(page, 'insert-menu.png')
    await clickElement(page, '[data-testid="bt-insert-row-skills"]')
    await waitFor(page, `Boolean(document.querySelector('[data-testid="bt-insert-search"]'))`, 'the Skills page')
    await shot(page, 'insert-menu-skills.png')
    await clickElement(page, '[data-testid="bt-insert-row-model:MoveHome"]')
    await waitFor(page, `window.__systemsketch.editor.getShape('${REGION}').props.xml !== ${JSON.stringify(xmlBefore)}`, 'the XML to change')
    const xmlAfterInsert = await regionXml(page)
    check('insert.xml', 'MoveHome is appended to the root Sequence', (xmlAfterInsert.match(/<MoveHome/g) ?? []).length - (xmlBefore.match(/<MoveHome/g) ?? []).length, 1)
    check('insert.selected', 'the new occurrence is selected',
      await evaluate(page, `window.__systemsketch.editor.getSelectedShapes()[0]?.meta?.btPath ?? null`), '0.5')
    await fitRegion(page)
    await shot(page, 'insert-done.png')

    // ---- Delete key on a projected Block ---------------------------------------
    await selectPath(page, '0.5')
    await key(page, 'Delete')
    await delay(350)
    check('delete.xml', 'Delete removes the occurrence from the XML', await regionXml(page), xmlBefore)
    await shortcut(page, 'z', 'KeyZ', 2)
    await delay(350)
    check('delete.undo', 'one undo restores it', await regionXml(page), xmlAfterInsert)
    await shortcut(page, 'z', 'KeyZ', 2)
    await delay(350)
    check('insert.undo', 'a second undo takes back the insertion', await regionXml(page), xmlBefore)

    // ---- free arrangement and Tidy --------------------------------------------
    await setView(page, { projection: 'tree' })
    await fitRegion(page)
    // Press on the card's corner padding: a press on the title would open
    // click-to-edit instead of a translate, exactly as it does for any Block.
    await evaluate(page, `(window.__systemsketch.editor.selectNone(), null)`)
    const before = await region(page)
    const cardBefore = (await children(page)).find((child) => child.path === '0.3')
    // 22 page units in from the card's top-right corner: padding, never the title.
    const from = await childPoint(page, '0.3', cardBefore.w - 22, 18)
    check('drag.hit', 'the press lands on the projected Block', await evaluate(page, `JSON.stringify((() => {
      const editor = window.__systemsketch.editor
      const hit = editor.getShapeAtPoint(editor.screenToPage({ x: ${from.x}, y: ${from.y} }), { hitInside: true, hitFrameInside: true })
      return hit ? [hit.type, hit.meta.btPath ?? null] : null
    })())`).then(JSON.parse), ['block', '0.3'])
    await drag(page, from, { x: from.x + 90, y: from.y + 140 })
    await shot(page, 'tree-after-drag.png')
    await delay(400)
    const afterDrag = await region(page)
    const cardAfter = (await children(page)).find((child) => child.path === '0.3')
    check('drag.moved', 'the card moved with the pointer', [cardAfter.x - cardBefore.x > 60, cardAfter.y - cardBefore.y > 100], [true, true])
    check('drag.offset', 'a drag records a free offset for that node', Object.keys(afterDrag.offsets), ['0.3'])
    check('drag.region-still', 'the region itself did not move', [afterDrag.x, afterDrag.y], [before.x, before.y])
    check('drag.editing', 'the drag did not open an editor', await evaluate(page, `window.__systemsketch.editor.getEditingShapeId()`), null)
    check('drag.xml-stable', 'a drag never touches the XML', await regionXml(page), xmlBefore)
    await shot(page, 'tree-free-offset.png')
    await selectRegion(page)
    await clickElement(page, '[data-testid="bt-pill-tidy"]')
    await delay(350)
    check('tidy.clears', 'Tidy forgets the offset', Object.keys((await region(page)).offsets), [])

    // ---- inspector rename through the XML ----------------------------------------
    await selectPath(page, '0.1.0')
    await waitFor(page, `Boolean(document.querySelector('[data-testid="bt-inspector"]'))`, 'the Behavior Tree inspector')
    check('inspector.node', 'the inspector shows the selected occurrence',
      await evaluate(page, `document.querySelector('[data-testid="bt-node-identity"] .bt-inspector__id')?.textContent ?? null`), 'GraspValid')
    await shot(page, 'inspector-node.png')
    const nameBox = await elementBox(page, '[data-testid="bt-inspector"] input[aria-label="Node name"]')
    await clickAt(page, nameBox.x + nameBox.width / 2, nameBox.y + nameBox.height / 2)
    await shortcut(page, 'a', 'KeyA', 2)
    await typeSlowly(page, 'Is grasp valid')
    check('inspector.focus', 'the Name field keeps focus while typing', await evaluate(page, `document.activeElement?.getAttribute('aria-label') ?? null`), 'Node name')
    check('inspector.draft', 'the field holds the typed text', await evaluate(page, `document.querySelector('[data-testid="bt-inspector"] input[aria-label="Node name"]')?.value ?? null`), 'Is grasp valid')
    await key(page, 'Enter')
    await delay(400)
    check('inspector.rename', 'the name lands as the XML name attribute', (await regionXml(page)).includes('<GraspValid name="Is grasp valid" pose="{object_pose}"'), true)
    check('inspector.rename-title', 'and the projected Block wears it', (await children(page)).find((child) => child.path === '0.1.0').title, 'Is grasp valid')
    await shot(page, 'inspector-renamed.png')

    // ---- inspector structure: add failure recovery --------------------------------
    await selectPath(page, '0.2')
    await delay(200)
    await clickElement(page, '[data-testid="bt-action-recovery"]')
    await delay(400)
    const recovered = await regionXml(page)
    check('recovery.xml', 'Add failure recovery wraps the node in a Fallback with a recovery Sequence',
      /<Fallback>\s*<CloseGrip[^>]*\/>\s*<Sequence\/>\s*<\/Fallback>/.test(recovered), true)
    await setView(page, { projection: 'process', orientation: 'right' })
    await fitRegion(page)
    await shot(page, 'process-recovery-added.png')

    // ---- reference-parity captures ----------------------------------------------
    // The same tree Flowstate shows at 15:04 (Initialize Workcell / Pull Part Kit),
    // and a MoveIt-style objective, each captured with the region's screen rect
    // so the report can crop and overlay them on the reference frames.
    const parity = {}
    for (const [name, xml, patch] of [
      ['flowstate', FLOWSTATE_XML, { projection: 'process', orientation: 'down', nodeFace: 'simple', dataLens: 'none', title: 'Rigid Body Assembly' }],
      ['moveit', MOVEIT_XML, { projection: 'tree', orientation: 'right', nodeFace: 'port', controlFace: 'expanded', edgeStyle: 'elbow', dataLens: 'none', title: 'Open Cabinet Door' }],
    ]) {
      await evaluate(page, `(() => {
        const editor = window.__systemsketch.editor
        editor.deleteShapes([...editor.getCurrentPageShapeIds()])
        editor.createShape({ id: '${REGION}', type: 'behaviorTree', x: 100, y: 100, props: { ...${JSON.stringify(patch)}, xml: ${JSON.stringify(xml)} } })
        editor.selectNone()
        return null
      })()`)
      await waitFor(page, `window.__systemsketch.editor.getSortedChildIdsForParent('${REGION}').length > 3`, `${name} to project`)
      await delay(400)
      await fitRegion(page)
      // Drop the region below the floating top chrome so the crop is all canvas.
      await evaluate(page, `(() => {
        const editor = window.__systemsketch.editor
        const camera = editor.getCamera()
        editor.setCamera({ x: camera.x, y: camera.y + 96 / camera.z, z: camera.z * 0.9 })
        return null
      })()`)
      await delay(250)
      const rect = await evaluate(page, `JSON.stringify((() => {
        const editor = window.__systemsketch.editor
        const bounds = editor.getShapePageBounds('${REGION}')
        const a = editor.pageToScreen({ x: bounds.minX, y: bounds.minY })
        const b = editor.pageToScreen({ x: bounds.maxX, y: bounds.maxY })
        return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y, zoom: editor.getZoomLevel(), dpr: window.devicePixelRatio }
      })())`).then(JSON.parse)
      parity[name] = rect
      await shot(page, `parity-${name}.png`)
    }
    pending.push({ name: 'parity-rects.json', data: Buffer.from(JSON.stringify(parity, null, 2)) })

    check('console', 'no local console errors', await localConsoleErrors(page), [])
  } catch (error) {
    journeyError = error
    process.stderr.write(`journey aborted: ${error?.stack ?? error}\n`)
    try {
      const capture = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
      await writeFile('/tmp/bt-journey-abort.png', Buffer.from(capture.data, 'base64'))
    } catch { /* the page may be gone */ }
  } finally {
    const passed = results.filter((entry) => entry.ok).length
    const summary = { generatedAt: new Date().toISOString(), passed, total: results.length, results, aborted: journeyError ? String(journeyError) : null }
    if (passed === results.length && !journeyError) {
      for (const entry of pending) await writeFile(join(OUT, entry.name), entry.data)
      await writeFile(join(OUT, 'acceptance.json'), JSON.stringify(summary, null, 2))
    } else {
      await writeFile(join(OUT, 'acceptance.failed.json'), JSON.stringify(summary, null, 2))
      for (const entry of pending) await writeFile(join('/tmp', `bt-failed-${entry.name}`), entry.data)
    }
    process.stdout.write(`\n${passed}/${results.length} checks passed\n`)
    app.close()
    process.exit(passed === results.length && !journeyError ? 0 : 1)
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`)
  process.exit(1)
})
