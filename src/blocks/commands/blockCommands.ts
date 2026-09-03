import type { Editor, TLShapeId } from 'tldraw'

import {
  BLOCK_TOOL_ID,
  FIRST_BODY_ROW,
  HEADER_ROW,
  type BlockPort,
  type BlockPortSection,
  type BlockPortSide,
  type BlockShape,
  type BlockShapeProps,
  type BlockPresentationView,
  blockPortSections,
  getDefaultBlockProps,
  isBlockShape,
  normalizeBlockPortRows,
  portBranch,
  portInHeader,
  portRow,
  portSection,
  sameBlockPortSection,
  setBlockViewProps,
  withBlockPortSection,
} from '../blockModel'
import {
  growBlockPortViewToFit,
  type BlockPortSectionTarget,
} from '../ports/portAffordances'
import {
  getBlockSelectionStyles,
  getSelectedBlocks,
  sameBlockSelectionStyles,
  type BlockSelectionStyles,
} from './blockStyleCommands'

export type BlockCommandFailure = 'missing-block' | 'missing-port' | 'unchanged'

export type BlockCommandResult =
  | { ok: true; shapeId: TLShapeId; props: BlockShapeProps }
  | { ok: false; reason: BlockCommandFailure }

export type BlockPortCreationResult =
  | { ok: true; shapeId: TLShapeId; props: BlockShapeProps; port: BlockPort }
  | { ok: false; reason: BlockCommandFailure }

export type BlockInspectorContext =
  | { kind: 'selected'; shape: BlockShape; props: BlockShapeProps }
  /** More than one Block is in play: only the shared style props are editable. */
  | { kind: 'multi'; styles: BlockSelectionStyles }
  | { kind: 'tool'; props: BlockShapeProps }
  | { kind: 'empty' }

export interface BlockCommandOptions {
  /**
   * Creates one public tldraw history boundary before the mutation. Continuous
   * inputs should pass `historyLabel: false` and own their focus/blur history
   * gesture instead of producing one undo step per character.
   */
  historyLabel?: string | false
}

export type BlockPropsUpdater = (props: BlockShapeProps) => BlockShapeProps

export type BlockDetailsPatch = Partial<
  Pick<
    BlockShapeProps,
    | 'title'
    | 'blockType'
    | 'description'
    | 'showDescription'
    | 'icon'
    | 'notes'
    | 'portLayout'
  >
>

/** Return the only selected Block. Mixed or multi-selection is intentionally empty. */
export function getOnlySelectedBlock(editor: Editor): BlockShape | null {
  const selected = editor.getSelectedShapes()
  if (selected.length !== 1) return null
  return isBlockShape(selected[0]) ? selected[0] : null
}

/**
 * Resolve the inspector's content without introducing a second selection
 * model. One selected Block wins; a selection carrying several Blocks — group
 * descendants and mixed selections included — resolves to the shared-style
 * batch face; otherwise the active Block tool gets a fresh draft that the
 * shell may keep controlled until placement.
 */
export function getBlockInspectorContext(editor: Editor): BlockInspectorContext {
  const selected = getOnlySelectedBlock(editor)
  if (selected) return { kind: 'selected', shape: selected, props: selected.props }
  const styles = getBlockSelectionStyles(editor)
  // A literal Value is a separate representation, not one member of a batch
  // of ordinary Blocks. Do not offer shared Block controls that could convert
  // it (or its neighbours) when it is part of the selection.
  if (getSelectedBlocks(editor).some((block) => block.props.view === 'value')) {
    return { kind: 'empty' }
  }
  if (styles.blockCount > 0) return { kind: 'multi', styles }
  if (editor.getCurrentToolId() === BLOCK_TOOL_ID) {
    return { kind: 'tool', props: getDefaultBlockProps() }
  }
  return { kind: 'empty' }
}

/**
 * Whether a freshly resolved context would show the inspector the same thing.
 *
 * The context is derived from the selection, so it is re-resolved whenever a
 * selected record changes — including every frame the Block is dragged, when
 * its record changes but its props do not. The panel reads the Block's id and
 * props; keeping the previous object when those are unchanged is what keeps
 * an open inspector from re-rendering per frame.
 */
export function sameBlockInspectorContext(
  previous: unknown,
  next: BlockInspectorContext,
): previous is BlockInspectorContext {
  if (typeof previous !== 'object' || previous === null) return false
  const before = previous as BlockInspectorContext
  if (before.kind !== next.kind) return false
  switch (next.kind) {
    case 'selected':
      return before.kind === 'selected'
        && before.shape.id === next.shape.id
        && before.props === next.props
        && before.shape.isLocked === next.shape.isLocked
    case 'multi':
      return before.kind === 'multi' && sameBlockSelectionStyles(before.styles, next.styles)
    case 'tool':
    case 'empty':
      return true
  }
}

/**
 * The one mutation seam used by the inspector and selection mini-menu. It only
 * calls public Editor methods and always writes the Block's existing props
 * model; there is no parallel form state hidden in the command layer.
 */
export function updateBlockProps(
  editor: Editor,
  shapeId: TLShapeId,
  update: BlockPropsUpdater,
  options: BlockCommandOptions = {},
): BlockCommandResult {
  const shape = editor.getShape(shapeId)
  if (!shape || !isBlockShape(shape)) return { ok: false, reason: 'missing-block' }

  const props = update(shape.props)
  if (props === shape.props) return { ok: false, reason: 'unchanged' }

  const historyLabel = options.historyLabel ?? 'edit block'
  if (historyLabel !== false) editor.markHistoryStoppingPoint(historyLabel)
  editor.updateShape<BlockShape>({ id: shape.id, type: shape.type, props })
  return { ok: true, shapeId: shape.id, props }
}

export function updateBlockDetails(
  editor: Editor,
  shapeId: TLShapeId,
  patch: BlockDetailsPatch,
  options: BlockCommandOptions = {},
): BlockCommandResult {
  return updateBlockProps(
    editor,
    shapeId,
    (props) => patchBlockDetailsProps(props, patch),
    options,
  )
}

export function patchBlockDetailsProps(
  props: BlockShapeProps,
  patch: BlockDetailsPatch,
): BlockShapeProps {
  const next = { ...props, ...patch }
  return Object.keys(patch).every((key) => {
    const detail = key as keyof BlockDetailsPatch
    return props[detail] === next[detail]
  })
    ? props
    : next
}

/** Switch view through the core projection so each view's saved size is restored. */
export function setBlockView(
  editor: Editor,
  shapeId: TLShapeId,
  view: BlockPresentationView,
  options: BlockCommandOptions = {},
): BlockCommandResult {
  return updateBlockProps(
    editor,
    shapeId,
    (props) => (props.view === view ? props : setBlockViewProps(props, view)),
    { historyLabel: options.historyLabel ?? `show block as ${view}` },
  )
}

function nextPortId(ports: readonly BlockPort[], side: BlockPortSide): string {
  const prefix = side === 'inputs' ? 'in' : 'out'
  const highest = ports.reduce((best, port) => {
    const match = new RegExp(`^${prefix}_(\\d+)$`).exec(port.id)
    return match ? Math.max(best, Number(match[1])) : best
  }, 0)
  return `${prefix}_${highest + 1}`
}

export type BlockPortSeed = Partial<Pick<BlockPort, 'name' | 'type' | 'visible' | 'row' | 'branch'>>

/**
 * Add a port at the end of a section — the first body row unless the seed
 * names another, such as the heading (row 0) for a control-flow input. The
 * lane is then in visual order again, so the new port sits with its row.
 */
export function appendBlockPortProps(
  props: BlockShapeProps,
  side: BlockPortSide,
  initial: BlockPortSeed = {},
): BlockShapeProps {
  const id = nextPortId(props[side], side)
  const port = withBlockPortSection({
    id,
    name: initial.name ?? id,
    type: initial.type ?? '',
    visible: initial.visible ?? true,
  }, {
    row: initial.row ?? FIRST_BODY_ROW,
    branch: initial.branch ?? 0,
  })
  return normalizeBlockPortRows({ ...props, [side]: [...props[side], port] })
}

/** Add a visible port with an identity independent from its editable name. */
export function appendBlockPort(
  editor: Editor,
  shapeId: TLShapeId,
  side: BlockPortSide,
  initial: BlockPortSeed = {},
  options: BlockCommandOptions = {},
): BlockCommandResult {
  return updateBlockProps(
    editor,
    shapeId,
    (props) => growBlockPortViewToFit(appendBlockPortProps(props, side, initial)),
    { historyLabel: options.historyLabel ?? `add block ${side === 'inputs' ? 'input' : 'output'}` },
  )
}

/**
 * Insert a port at an explicit position in its lane. `index` is an insertion
 * index into `props[side]`; anything at or past the end appends.
 */
export function insertBlockPortProps(
  props: BlockShapeProps,
  side: BlockPortSide,
  index: number,
  like?: string,
): { props: BlockShapeProps; port: BlockPort } {
  const lane = props[side]
  const at = Math.min(Math.max(0, Math.round(index)), lane.length)
  // The new port joins the section of the port it is placed beside: the one
  // named, else the one it lands in front of, else the one it follows.
  const reference = (like ? lane.find((port) => port.id === like) : undefined)
    ?? lane[at]
    ?? lane[at - 1]
  const section: BlockPortSection = reference
    ? portSection(reference)
    : { row: FIRST_BODY_ROW, branch: 0 }
  const id = nextPortId(lane, side)
  const port = withBlockPortSection({ id, name: id, type: '', visible: true }, section)
  const ports = [...lane]
  ports.splice(at, 0, port)
  const next = normalizeBlockPortRows({ ...props, [side]: ports })
  return { props: next, port: next[side].find((candidate) => candidate.id === id) ?? port }
}

/**
 * Add a port from the whiteboard-first context menu and reveal its inline
 * editor in the same semantic mutation. A Simple Block moves to its remembered
 * Port box because otherwise the newly created row would remain invisible.
 */
export function appendBlockPortForInlineEditing(
  editor: Editor,
  shapeId: TLShapeId,
  side: BlockPortSide,
  options: BlockCommandOptions = {},
): BlockPortCreationResult {
  return insertBlockPortForInlineEditing(editor, shapeId, side, Number.MAX_SAFE_INTEGER, options)
}

/**
 * The in-window creation seam: put a port at `index`, make room for its row,
 * and hand back the identity so the caller can open its inline name editor.
 *
 * Revealing Port view first is what makes "add a port" mean the same thing from
 * a Simple Block as from a Port one — otherwise the new row would be invisible.
 * Growing the box is the other half of that promise: `layoutBlock` compresses
 * the row pitch to whatever is left, so a full Block would otherwise answer an
 * add by silently squeezing every row that was already there.
 */
export function insertBlockPortForInlineEditing(
  editor: Editor,
  shapeId: TLShapeId,
  side: BlockPortSide,
  index: number,
  options: BlockCommandOptions & { like?: string; section?: BlockPortSection } = {},
): BlockPortCreationResult {
  let created: BlockPort | null = null
  const result = updateBlockProps(
    editor,
    shapeId,
    (props) => {
      const revealed = props.view === 'simple' ? setBlockViewProps(props, 'port') : props
      if (options.section) {
        // Asked for a section rather than a position: the heading bead, or a
        // row's own "add here". The port goes to that section's end.
        const id = nextPortId(revealed[side], side)
        const appended = appendBlockPortProps(revealed, side, options.section)
        created = appended[side].find((port) => port.id === id) ?? null
        return growBlockPortViewToFit(appended)
      }
      const inserted = insertBlockPortProps(revealed, side, index, options.like)
      created = inserted.port
      return growBlockPortViewToFit(inserted.props)
    },
    { historyLabel: options.historyLabel ?? `add block ${side === 'inputs' ? 'input' : 'output'}` },
  )
  if (!result.ok) return result
  if (!created) return { ok: false, reason: 'unchanged' }
  return { ...result, port: created }
}

/** Port ids are deliberately excluded: renaming or retyping never breaks a cable binding. */
export function updateBlockPort(
  editor: Editor,
  shapeId: TLShapeId,
  side: BlockPortSide,
  portId: string,
  patch: Partial<Omit<BlockPort, 'id'>>,
  options: BlockCommandOptions = {},
): BlockCommandResult {
  const shape = editor.getShape(shapeId)
  if (!shape || !isBlockShape(shape)) return { ok: false, reason: 'missing-block' }
  if (!shape.props[side].some((port) => port.id === portId)) {
    return { ok: false, reason: 'missing-port' }
  }
  const result = updateBlockProps(
    editor,
    shapeId,
    (props) => patchBlockPortProps(props, side, portId, patch),
    options,
  )
  return result
}

export function patchBlockPortProps(
  props: BlockShapeProps,
  side: BlockPortSide,
  portId: string,
  patch: Partial<Omit<BlockPort, 'id'>>,
): BlockShapeProps {
  const ports = props[side].map((port) => {
    if (port.id !== portId) return port
    const next = { ...port, ...patch, id: port.id }
    return Object.keys(patch).every((key) => {
      const detail = key as keyof Omit<BlockPort, 'id'>
      return port[detail] === next[detail]
    })
      ? port
      : next
  })
  return ports.every((port, index) => port === props[side][index])
    ? props
    : { ...props, [side]: ports }
}

/**
 * Explicitly destructive. Use `updateBlockPort(..., { visible: false })` for
 * the everyday hide operation so bindings keep their stable port id.
 */
export function removeBlockPort(
  editor: Editor,
  shapeId: TLShapeId,
  side: BlockPortSide,
  portId: string,
  options: BlockCommandOptions = {},
): BlockCommandResult {
  const shape = editor.getShape(shapeId)
  if (!shape || !isBlockShape(shape)) return { ok: false, reason: 'missing-block' }
  if (!shape.props[side].some((port) => port.id === portId)) {
    return { ok: false, reason: 'missing-port' }
  }
  const result = updateBlockProps(
    editor,
    shapeId,
    (props) => removeBlockPortProps(props, side, portId),
    { historyLabel: options.historyLabel ?? 'delete block port' },
  )
  return result
}

export function removeBlockPortProps(
  props: BlockShapeProps,
  side: BlockPortSide,
  portId: string,
): BlockShapeProps {
  const ports = props[side].filter((port) => port.id !== portId)
  return ports.length === props[side].length ? props : { ...props, [side]: ports }
}

export function moveBlockPort(
  editor: Editor,
  shapeId: TLShapeId,
  side: BlockPortSide,
  portId: string,
  delta: -1 | 1,
  options: BlockCommandOptions = {},
): BlockCommandResult {
  const shape = editor.getShape(shapeId)
  if (!shape || !isBlockShape(shape)) return { ok: false, reason: 'missing-block' }
  if (!shape.props[side].some((port) => port.id === portId)) {
    return { ok: false, reason: 'missing-port' }
  }
  const result = updateBlockProps(
    editor,
    shapeId,
    (props) => moveBlockPortProps(props, side, portId, delta),
    { historyLabel: options.historyLabel ?? 'reorder block port' },
  )
  return result
}

/**
 * One visual step up or down the lane, as the inspector arrows and the menu's
 * Move up / Move down mean it. Within a section the two neighbours swap; at a
 * section's edge the port steps across the line into the next section — an
 * input stepping up out of the first body row lifts into the heading. The
 * last port stepping down goes nowhere: a step never invents a row.
 */
export function moveBlockPortProps(
  props: BlockShapeProps,
  side: BlockPortSide,
  portId: string,
  delta: -1 | 1,
): BlockShapeProps {
  const lane = props[side]
  const index = lane.findIndex((port) => port.id === portId)
  if (index < 0) return props
  const port = lane[index]
  const neighbourIndex = index + delta
  if (neighbourIndex < 0) {
    return side === 'inputs' && !portInHeader(port)
      ? moveBlockPortToSectionProps(props, side, portId, { row: HEADER_ROW, branch: 0, before: null })
      : props
  }
  if (neighbourIndex >= lane.length) return props
  const neighbour = lane[neighbourIndex]
  if (sameBlockPortSection(portSection(port), portSection(neighbour))) {
    const ports = [...lane]
    ;[ports[index], ports[neighbourIndex]] = [ports[neighbourIndex], ports[index]]
    return { ...props, [side]: ports }
  }
  return moveBlockPortToSectionProps(props, side, portId, {
    ...portSection(neighbour),
    before: delta > 0 ? neighbour.id : null,
  })
}

function samePorts(a: readonly BlockPort[], b: readonly BlockPort[]): boolean {
  return a.length === b.length && a.every((port, index) => port === b[index])
}

/**
 * Put one port in a place in the burger: a row, an arm for an output, and the
 * neighbour it lands before (or the section's end). This is the one reducer
 * behind every assignment — the canvas drop, the inspector drop and the row
 * menu — so all three agree on what a place means. Returns the same props
 * object when nothing would move, so no empty undo step is ever opened.
 */
export function moveBlockPortToSectionProps(
  props: BlockShapeProps,
  side: BlockPortSide,
  portId: string,
  target: BlockPortSectionTarget,
): BlockShapeProps {
  const lane = props[side]
  const from = lane.findIndex((port) => port.id === portId)
  if (from < 0) return props
  const section: BlockPortSection = {
    row: Math.max(side === 'inputs' ? HEADER_ROW : FIRST_BODY_ROW, Math.round(target.row)),
    branch: side === 'outputs' ? Math.max(0, Math.round(target.branch)) : 0,
  }
  const current = lane[from]
  const moved = sameBlockPortSection(portSection(current), section)
    ? current
    : withBlockPortSection(current, section)
  const rest = lane.filter((port) => port.id !== portId)
  const beforeIndex = target.before && target.before !== portId
    ? rest.findIndex((port) => port.id === target.before)
    : -1
  rest.splice(beforeIndex >= 0 ? beforeIndex : rest.length, 0, moved)
  const next = normalizeBlockPortRows({ ...props, [side]: rest })
  return samePorts(next.inputs, props.inputs) && samePorts(next.outputs, props.outputs)
    ? props
    : next
}

/** One history step for a whole assignment; port ids are never rewritten. */
export function moveBlockPortToSection(
  editor: Editor,
  shapeId: TLShapeId,
  side: BlockPortSide,
  portId: string,
  target: BlockPortSectionTarget,
  options: BlockCommandOptions = {},
): BlockCommandResult {
  const shape = editor.getShape(shapeId)
  if (!shape || !isBlockShape(shape)) return { ok: false, reason: 'missing-block' }
  if (!shape.props[side].some((port) => port.id === portId)) {
    return { ok: false, reason: 'missing-port' }
  }
  return updateBlockProps(
    editor,
    shapeId,
    (props) => moveBlockPortToSectionProps(props, side, portId, target),
    {
      historyLabel: options.historyLabel
        ?? (target.row === HEADER_ROW ? 'move block port to header' : 'move block port'),
    },
  )
}

/**
 * Open a new section right below the port's own and move the port into it: a
 * new row (on both sides, since rows are shared) or, for an output, a new arm
 * of its row. Later rows and arms shift down to make room.
 */
export function startBlockPortSectionProps(
  props: BlockShapeProps,
  side: BlockPortSide,
  portId: string,
  kind: 'row' | 'branch',
): BlockShapeProps {
  const port = props[side].find((candidate) => candidate.id === portId)
  if (!port) return props
  if (kind === 'branch' && side !== 'outputs') return props
  const row = portRow(port)
  const branch = portBranch(port)
  const shift = (candidate: BlockPort, laneSide: BlockPortSide): BlockPort => {
    if (candidate.id === portId && laneSide === side) {
      return withBlockPortSection(candidate, kind === 'row'
        ? { row: row + 1, branch: 0 }
        : { row, branch: branch + 1 })
    }
    if (kind === 'row') {
      return !portInHeader(candidate) && portRow(candidate) > row
        ? withBlockPortSection(candidate, { row: portRow(candidate) + 1, branch: portBranch(candidate) })
        : candidate
    }
    return laneSide === 'outputs' && portRow(candidate) === row && portBranch(candidate) > branch
      ? withBlockPortSection(candidate, { row, branch: portBranch(candidate) + 1 })
      : candidate
  }
  return normalizeBlockPortRows({
    ...props,
    inputs: props.inputs.map((candidate) => shift(candidate, 'inputs')),
    outputs: props.outputs.map((candidate) => shift(candidate, 'outputs')),
  })
}

export function startBlockPortSection(
  editor: Editor,
  shapeId: TLShapeId,
  side: BlockPortSide,
  portId: string,
  kind: 'row' | 'branch',
  options: BlockCommandOptions = {},
): BlockCommandResult {
  const shape = editor.getShape(shapeId)
  if (!shape || !isBlockShape(shape)) return { ok: false, reason: 'missing-block' }
  if (!shape.props[side].some((port) => port.id === portId)) {
    return { ok: false, reason: 'missing-port' }
  }
  return updateBlockProps(
    editor,
    shapeId,
    (props) => startBlockPortSectionProps(props, side, portId, kind),
    { historyLabel: options.historyLabel ?? (kind === 'row' ? 'start block row' : 'start block branch') },
  )
}

/** How many body rows the Block has, on either side. */
export function blockPortRowCount(props: BlockShapeProps): number {
  return blockPortSections(props).rows.length
}

/**
 * Reorder a lane by dropping one port at an insertion index measured against
 * the list *before* the move — the index an "add above / add below" style
 * caller naturally produces. The port takes the section of the port it now
 * follows (or, at the front, the one it precedes), so an index is always a
 * place in the burger too. Returns the same props object when the drop would
 * not move anything, so the caller never opens an empty undo step.
 */
export function moveBlockPortToIndexProps(
  props: BlockShapeProps,
  side: BlockPortSide,
  portId: string,
  insertIndex: number,
): BlockShapeProps {
  const from = props[side].findIndex((port) => port.id === portId)
  if (from < 0) return props
  const ports = [...props[side]]
  const [moved] = ports.splice(from, 1)
  const clamped = Math.min(Math.max(0, Math.round(insertIndex)), props[side].length)
  const target = Math.min(clamped > from ? clamped - 1 : clamped, ports.length)
  const reference = ports[target - 1] ?? ports[target]
  const section = reference ? portSection(reference) : portSection(moved)
  const placed = sameBlockPortSection(portSection(moved), section)
    ? moved
    : withBlockPortSection(moved, section)
  if (target === from && placed === moved) return props
  ports.splice(target, 0, placed)
  const next = normalizeBlockPortRows({ ...props, [side]: ports })
  return samePorts(next[side], props[side]) ? props : next
}

/** One history step for a whole reorder gesture; port ids are never rewritten. */
export function moveBlockPortToIndex(
  editor: Editor,
  shapeId: TLShapeId,
  side: BlockPortSide,
  portId: string,
  insertIndex: number,
  options: BlockCommandOptions = {},
): BlockCommandResult {
  const shape = editor.getShape(shapeId)
  if (!shape || !isBlockShape(shape)) return { ok: false, reason: 'missing-block' }
  if (!shape.props[side].some((port) => port.id === portId)) {
    return { ok: false, reason: 'missing-port' }
  }
  return updateBlockProps(
    editor,
    shapeId,
    (props) => moveBlockPortToIndexProps(props, side, portId, insertIndex),
    { historyLabel: options.historyLabel ?? 'reorder block port' },
  )
}

/** The insertion index of a named port, or the end of the lane if it is gone. */
export function blockPortIndex(
  props: BlockShapeProps,
  side: BlockPortSide,
  portId: string,
): number {
  const index = props[side].findIndex((port) => port.id === portId)
  return index < 0 ? props[side].length : index
}
