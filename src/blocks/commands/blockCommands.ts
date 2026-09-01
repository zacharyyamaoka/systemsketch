import type { Editor, TLShapeId } from 'tldraw'

import {
  BLOCK_TOOL_ID,
  appendBlockPortToProps,
  type BlockPort,
  type BlockPortSide,
  type BlockShape,
  type BlockShapeProps,
  type BlockView,
  getDefaultBlockProps,
  isBlockShape,
  setBlockViewProps,
} from '../blockModel'
import { growBlockPortViewToFit } from '../ports/portAffordances'
import { getBlockSelectionStyles, type BlockSelectionStyles } from './blockStyleCommands'

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
  if (styles.blockCount > 0) return { kind: 'multi', styles }
  if (editor.getCurrentToolId() === BLOCK_TOOL_ID) {
    return { kind: 'tool', props: getDefaultBlockProps() }
  }
  return { kind: 'empty' }
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
  view: BlockView,
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

export function appendBlockPortProps(
  props: BlockShapeProps,
  side: BlockPortSide,
  initial: Partial<Pick<BlockPort, 'name' | 'type' | 'visible'>> = {},
): BlockShapeProps {
  const id = nextPortId(props[side], side)
  const port: BlockPort = {
    id,
    name: initial.name ?? id,
    type: initial.type ?? '',
    visible: initial.visible ?? true,
  }
  return { ...props, [side]: [...props[side], port] }
}

/** Add a visible port with an identity independent from its editable name. */
export function appendBlockPort(
  editor: Editor,
  shapeId: TLShapeId,
  side: BlockPortSide,
  initial: Partial<Pick<BlockPort, 'name' | 'type' | 'visible'>> = {},
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
): { props: BlockShapeProps; port: BlockPort } {
  const appended = appendBlockPortToProps(props, side)
  const ports = [...appended.props[side]]
  const port = ports.pop()
  if (!port) return appended
  const at = Math.min(Math.max(0, Math.round(index)), ports.length)
  ports.splice(at, 0, port)
  return { props: { ...appended.props, [side]: ports }, port }
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
  options: BlockCommandOptions = {},
): BlockPortCreationResult {
  let created: BlockPort | null = null
  const result = updateBlockProps(
    editor,
    shapeId,
    (props) => {
      const revealed = props.view === 'simple' ? setBlockViewProps(props, 'port') : props
      const inserted = insertBlockPortProps(revealed, side, index)
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

export function moveBlockPortProps(
  props: BlockShapeProps,
  side: BlockPortSide,
  portId: string,
  delta: -1 | 1,
): BlockShapeProps {
  const index = props[side].findIndex((port) => port.id === portId)
  const target = index + delta
  if (index < 0 || target < 0 || target >= props[side].length) return props
  const ports = [...props[side]]
  ;[ports[index], ports[target]] = [ports[target], ports[index]]
  return { ...props, [side]: ports }
}

/**
 * Reorder a lane by dropping one port at an insertion index measured against
 * the list *before* the move — the index a drop target or an "add above / add
 * below" menu naturally produces. Returns the same props object when the drop
 * would not move anything, so the caller never opens an empty undo step.
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
  if (target === from) return props
  ports.splice(target, 0, moved)
  return { ...props, [side]: ports }
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
