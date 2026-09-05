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

/** Bring an on-canvas button to the middle of the viewport, the way a person
 * would scroll before clicking it — needed before any insert-menu check,
 * since a `fitRegion`-wide view can leave individual "+" targets (there is
 * one per insertion point, scattered across the whole region) off-screen. */
async function centerOnButton(page, selector) {
  await evaluate(page, `(() => {
    const editor = window.__systemsketch.editor
    const button = document.querySelector(${JSON.stringify(selector)})
    const rect = button.getBoundingClientRect()
    const point = editor.screenToPage({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
    editor.setCamera({ x: editor.getCamera().x, y: editor.getCamera().y, z: 0.8 })
    editor.centerOnPoint(point, { animation: { duration: 0 } })
    return null
  })()`)
  await delay(300)
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

    // ---- Tree wire styles -----------------------------------------------------
    for (const edgeStyle of ['straight', 'elbow', 'curved', 'slanted']) {
      await setView(page, { edgeStyle })
      await fitRegion(page)
      const wires = await evaluate(page, `JSON.stringify(Array.from(document.querySelectorAll('.BehaviorTree-wire')).map((path) => path.getAttribute('d')))`).then(JSON.parse)
      check(`tree.wires.${edgeStyle}`, `Tree wires draw as ${edgeStyle}`,
        { count: wires.length > 0, hasCurve: wires.some((d) => d.includes('C')) },
        { count: true, hasCurve: edgeStyle === 'curved' })
      await shot(page, `tree-wires-${edgeStyle}.png`)
    }
    await setView(page, { edgeStyle: 'straight' })

    // ---- insert through the on-canvas "+" -----------------------------------
    await setView(page, { projection: 'process' })
    await fitRegion(page)
    await selectRegion(page)
    const xmlBefore = await regionXml(page)
    // Bring the end target to the middle of the viewport so its menu opens
    // clear of the bottom toolbar, the way a person would scroll before adding.
    await centerOnButton(page, '[data-testid="bt-insert-end"]')

    check('insert.closed-initially', 'no menu is open before any "+" is clicked',
      await evaluate(page, `Boolean(document.querySelector('[data-testid="bt-insert-menu"]'))`), false)

    // The menu is now a real `TldrawUiPopover`: registering with tldraw's own
    // menu state buys outside-click dismissal, Escape, Tab trapping and focus
    // return for free instead of hand-rolling each one.
    await clickElement(page, '[data-testid="bt-insert-end"]')
    await waitFor(page, `Boolean(document.querySelector('[data-testid="bt-insert-menu"]'))`, 'the Add-process menu')
    check('insert.pressed', 'the "+" that owns the open menu shows a pressed state',
      await evaluate(page, `document.querySelector('[data-testid="bt-insert-end"]')?.getAttribute('aria-pressed')`), 'true')
    check('insert.menu-rows', 'the first page is Skills, Control flow, Fail',
      await evaluate(page, `JSON.stringify(Array.from(document.querySelectorAll('[data-testid="bt-insert-menu"] .BehaviorTree-menuRowLabel')).map((node) => node.textContent))`).then(JSON.parse),
      ['Skills', 'Control flow', 'Fail'])
    check('insert.focus-on-open', 'opening the menu moves focus to its first row',
      await evaluate(page, `document.activeElement?.getAttribute('data-testid') ?? null`), 'bt-insert-row-skills')

    // ---- the menu never sits under a projected card, or under the toolbar --
    const zOrder = await evaluate(page, `JSON.stringify((() => {
      const menu = document.querySelector('[data-testid="bt-insert-menu"]')
      const menuRect = menu.getBoundingClientRect()
      const skillsRow = document.querySelector('[data-testid="bt-insert-row-skills"]')
      const rowRect = skillsRow.getBoundingClientRect()
      const rowHit = document.elementFromPoint(rowRect.x + rowRect.width / 2, rowRect.y + rowRect.height / 2)
      const cards = Array.from(document.querySelectorAll('[data-shape-id]'))
      const overlapping = cards.find((card) => {
        const rect = card.getBoundingClientRect()
        return rect.left < menuRect.right && menuRect.left < rect.right && rect.top < menuRect.bottom && menuRect.top < rect.bottom
      })
      const inViewport = menuRect.left >= 0 && menuRect.top >= 0 && menuRect.right <= window.innerWidth && menuRect.bottom <= window.innerHeight
      let aboveCard = null
      if (overlapping) {
        const rect = overlapping.getBoundingClientRect()
        const px = (Math.max(rect.left, menuRect.left) + Math.min(rect.right, menuRect.right)) / 2
        const py = (Math.max(rect.top, menuRect.top) + Math.min(rect.bottom, menuRect.bottom)) / 2
        const hit = document.elementFromPoint(px, py)
        aboveCard = Boolean(hit && hit.closest('[data-testid="bt-insert-menu"]'))
      }
      return { rowUncovered: Boolean(rowHit && rowHit.closest('[data-testid="bt-insert-row-skills"]')), hasOverlappingCard: Boolean(overlapping), aboveCard, inViewport }
    })())`).then(JSON.parse)
    check('insert.z-order.row', 'nothing covers the Skills row', zOrder.rowUncovered, true)
    check('insert.z-order.above-cards', 'where a card overlaps the menu, the menu paints above it in z-order',
      zOrder.hasOverlappingCard ? zOrder.aboveCard : 'no overlapping card to check', zOrder.hasOverlappingCard ? true : 'no overlapping card to check')
    check('insert.in-viewport', 'the menu stays inside the viewport rather than sitting under the toolbar or off-screen', zOrder.inViewport, true)
    await shot(page, 'insert-menu.png')

    await key(page, 'Tab')
    await delay(150)
    check('insert.tab-trapped', 'Tab cycles inside the open menu rather than escaping to the canvas',
      await evaluate(page, `Boolean(document.activeElement?.closest('[data-testid="bt-insert-menu"]'))`), true)

    await clickElement(page, '[data-testid="bt-insert-row-skills"]')
    await waitFor(page, `Boolean(document.querySelector('[data-testid="bt-insert-search"]'))`, 'the Skills page')
    check('insert.focus-skills', 'the Skills page moves focus to its search field',
      await evaluate(page, `document.activeElement?.getAttribute('data-testid') ?? null`), 'bt-insert-search')
    await shot(page, 'insert-menu-skills.png')

    // ---- Escape steps back before it closes ---------------------------------
    await key(page, 'Escape')
    await delay(150)
    check('insert.escape-back', 'Escape on a sub-page returns to the root page instead of closing',
      await evaluate(page, `JSON.stringify({ open: Boolean(document.querySelector('[data-testid="bt-insert-menu"]')), page: document.querySelector('[data-testid="bt-insert-menu"]')?.getAttribute('data-page') ?? null })`).then(JSON.parse),
      { open: true, page: 'root' })
    await key(page, 'Escape')
    await delay(150)
    check('insert.escape-close', 'Escape on the root page closes the menu',
      await evaluate(page, `Boolean(document.querySelector('[data-testid="bt-insert-menu"]'))`), false)
    check('insert.focus-return', 'focus returns to the "+" that opened the menu',
      await evaluate(page, `document.activeElement?.getAttribute('data-testid') ?? null`), 'bt-insert-end')

    // ---- outside pointer-down closes without inserting ----------------------
    const xmlBeforeOutside = await regionXml(page)
    await clickElement(page, '[data-testid="bt-insert-end"]')
    await waitFor(page, `Boolean(document.querySelector('[data-testid="bt-insert-menu"]'))`, 'the Add-process menu to reopen')
    // A point well clear of the menu, chosen at runtime so it never lands on
    // the toolbar or another chrome panel rather than guessing fixed pixels.
    const outside = await evaluate(page, `JSON.stringify((() => {
      const candidates = [
        { x: 40, y: window.innerHeight / 2 },
        { x: window.innerWidth / 2, y: 40 },
        { x: window.innerWidth - 40, y: window.innerHeight / 2 },
      ]
      const isChrome = (element) => Boolean(element?.closest(
        '.tlui-layout__top, .tlui-layout__bottom, .tlui-toolbar, .systemsketch-popout, .systemsketch-top-left-shell, .systemsketch-top-right-shell, [data-testid="bt-insert-menu"]',
      ))
      return candidates.find((point) => !isChrome(document.elementFromPoint(point.x, point.y))) ?? candidates[0]
    })())`).then(JSON.parse)
    await clickAt(page, outside.x, outside.y)
    await delay(200)
    check('insert.outside-closes', 'a pointer-down elsewhere closes the menu without inserting anything',
      await evaluate(page, `JSON.stringify({ open: Boolean(document.querySelector('[data-testid="bt-insert-menu"]')) })`).then(JSON.parse),
      { open: false })
    check('insert.outside-no-insert', 'the XML is untouched by an outside dismissal', await regionXml(page), xmlBeforeOutside)

    // ---- clicking the same "+" again closes it -------------------------------
    await clickElement(page, '[data-testid="bt-insert-end"]')
    await waitFor(page, `Boolean(document.querySelector('[data-testid="bt-insert-menu"]'))`, 'the Add-process menu to reopen')
    await clickElement(page, '[data-testid="bt-insert-end"]')
    await delay(200)
    check('insert.toggle-closes', 'clicking the same "+" again closes its own menu',
      await evaluate(page, `Boolean(document.querySelector('[data-testid="bt-insert-menu"]'))`), false)

    // ---- clicking a different "+" moves the menu; only one is ever open -----
    await clickElement(page, '[data-testid="bt-insert-end"]')
    await waitFor(page, `Boolean(document.querySelector('[data-testid="bt-insert-menu"]'))`, 'the Add-process menu to reopen')
    const otherInsertId = await evaluate(page, `JSON.stringify((() => {
      const buttons = Array.from(document.querySelectorAll('.BehaviorTree-insert'))
      const other = buttons.find((button) => button.dataset.testid !== 'bt-insert-end')
      return other?.dataset.testid ?? null
    })())`).then(JSON.parse)
    check('insert.other-target-exists', 'the sample process view has more than one insertion target', typeof otherInsertId, 'string')
    if (otherInsertId) {
      // The camera is still centred tight on `bt-insert-end` (z 0.8, to clear
      // the toolbar for the z-order checks above) — the sample's other
      // insert points live elsewhere in the region, so bring this one into
      // view too before clicking its real screen coordinates.
      await centerOnButton(page, `[data-testid="${otherInsertId}"]`)
      // Two clicks, not one: every "+" lives on the canvas itself (below
      // tldraw's chrome layer), and while `bt-insert-end`'s menu is open,
      // tldraw's own `MenuClickCapture` — an invisible, full-viewport
      // overlay it mounts whenever any menu is open, specifically to swallow
      // canvas interaction — sits above it in z-order and intercepts this
      // click before it ever reaches the other button (confirmed live:
      // `document.elementFromPoint` at the other button's own screen centre
      // returned the `.tlui-menu-click-capture` div, not the button). That
      // first click does what a bare canvas click always does — closes the
      // open menu — exactly like `insert.outside-closes` above. Only the
      // second click, now that nothing covers the canvas, lands on the real
      // trigger and opens it. Every *stock* tldraw popover trigger lives in
      // the chrome layer instead, so this two-click reality is specific to
      // having a trigger on the canvas, not a bug in the exclusivity logic
      // itself (`insert.closes-on-choose` below proves that logic correctly
      // forces a stale popover closed once it's told to).
      await clickElement(page, `[data-testid="${otherInsertId}"]`)
      await delay(200)
      await clickElement(page, `[data-testid="${otherInsertId}"]`)
      await delay(200)
      check('insert.one-open-at-a-time', 'opening a different "+" closes the first and shows exactly one menu, at the new target',
        await evaluate(page, `JSON.stringify({
          menus: document.querySelectorAll('[data-testid="bt-insert-menu"]').length,
          endPressed: document.querySelector('[data-testid="bt-insert-end"]')?.getAttribute('aria-pressed'),
          otherPressed: document.querySelector(${JSON.stringify(`[data-testid="${otherInsertId}"]`)})?.getAttribute('aria-pressed'),
        })`).then(JSON.parse),
        { menus: 1, endPressed: 'false', otherPressed: 'true' })
      // A non-persistent "+" is normally hover-only; its own open menu keeps
      // it (and only it) visible without the pointer resting on it.
      check('insert.active-stays-visible', 'the "+" that owns the open menu stays visible even though it is not persistent',
        await evaluate(page, `JSON.stringify((() => {
          const button = document.querySelector(${JSON.stringify(`[data-testid="${otherInsertId}"]`)})
          return { persistent: button.dataset.persistent, opacity: Number(getComputedStyle(button).opacity) }
        })())`).then(JSON.parse),
        { persistent: 'false', opacity: 1 })
      await key(page, 'Escape')
      await delay(150)
    } else {
      await key(page, 'Escape')
      await delay(150)
    }

    // ---- choosing a row inserts exactly one node, closes, and selects it ----
    await centerOnButton(page, '[data-testid="bt-insert-end"]')
    await clickElement(page, '[data-testid="bt-insert-end"]')
    await waitFor(page, `Boolean(document.querySelector('[data-testid="bt-insert-menu"]'))`, 'the Add-process menu to reopen')
    await clickElement(page, '[data-testid="bt-insert-row-skills"]')
    await waitFor(page, `Boolean(document.querySelector('[data-testid="bt-insert-search"]'))`, 'the Skills page')
    await clickElement(page, '[data-testid="bt-insert-row-model:MoveHome"]')
    await waitFor(page, `window.__systemsketch.editor.getShape('${REGION}').props.xml !== ${JSON.stringify(xmlBefore)}`, 'the XML to change')
    check('insert.closes-on-choose', 'choosing a row closes the menu',
      await evaluate(page, `Boolean(document.querySelector('[data-testid="bt-insert-menu"]'))`), false)
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
