import {
  Vec,
  createShapeId,
  maybeSnapToGrid,
  react,
  type Editor,
  type TLEventInfo,
  type TLShapeId,
  type VecLike,
} from 'tldraw'

/**
 * tldraw's own arrow gesture while the press is still undecided. It creates the
 * arrow on entry and cancels itself on release, which is why a click alone has
 * always drawn nothing.
 */
export const ARROW_PRESS_PATH = 'arrow.pointing'

/**
 * tldraw's own end-handle drag — the state the arrow tool hands off to the
 * moment a press becomes a drag. Click-to-place enters the identical state, so
 * binding, snapping, shift-constraint, precise targeting, the creation mark and
 * Escape are all the stock ones rather than a second implementation of them.
 */
export const ARROW_PLACEMENT_PATH = 'select.dragging_handle'

/** The arrow a first click has started, waiting for the click that ends it. */
export interface ArrowPlacement {
  shapeId: TLShapeId
  markId: string
  startPagePoint: VecLike
}

/** Events that end tldraw's handle drag: the second click, Escape, interrupts. */
function endsPlacement(info: TLEventInfo): boolean {
  return info.name === 'pointer_up'
    || info.name === 'complete'
    || info.name === 'cancel'
    || info.name === 'interrupt'
}

/** Screen-space drag threshold, asked the way `Editor.dispatch` asks it. */
function dragThresholdSquared(editor: Editor): number {
  return editor.getInstanceState().isCoarsePointer
    ? editor.options.coarseDragDistanceSquared
    : editor.options.dragDistanceSquared
}

let creatingPlacedArrow = false

/**
 * Is the arrow tool drawing the shape currently being created?
 *
 * True inside tldraw's own press state and inside the click-placed creation
 * below — one question with two gestures behind it, so a caller adapting a
 * freshly drawn arrow (the Curve preset's bend) does not have to know which of
 * them the person used.
 */
export function isDrawingArrowWithArrowTool(editor: Editor): boolean {
  return creatingPlacedArrow || editor.isIn(ARROW_PRESS_PATH)
}

/**
 * Create the arrow a click just asked for and hand its end point to tldraw.
 *
 * The creation mirrors `ArrowShapeTool`'s private `Pointing.createArrowShape()`
 * — the SDK exports neither that state nor its children, so this is the one
 * place the behaviour has to be re-expressed rather than reused. It is kept to
 * exactly what the stock tool does: mark, create at the press point (grid
 * snapped), then drag the START handle onto its own origin so a click that
 * landed on a shape binds to it. Everything after this line is stock tldraw.
 */
export function beginArrowPlacement(editor: Editor): ArrowPlacement | null {
  const id = createShapeId()
  const markId = editor.markHistoryStoppingPoint(`creating_arrow:${id}`)
  const startPagePoint = maybeSnapToGrid(editor.inputs.getOriginPagePoint(), editor)
  editor.createShape({
    id,
    type: 'arrow',
    x: startPagePoint.x,
    y: startPagePoint.y,
    props: { scale: editor.getResizeScaleFactor() },
  })
  const shape = editor.getShape(id)
  if (!shape) {
    editor.bailToMark(markId)
    return null
  }

  const startHandle = editor.getShapeHandles(shape)?.find((handle) => handle.id === 'start')
  if (startHandle) {
    const change = editor.getShapeUtil(shape).onHandleDrag?.(shape, {
      handle: { ...startHandle, x: 0, y: 0 },
      isPrecise: true,
      isCreatingShape: true,
      initial: undefined,
    })
    if (change) editor.updateShapes([change])
  }
  editor.select(id)

  editor.setCurrentTool(ARROW_PLACEMENT_PATH, {
    shape: editor.getShape(id),
    handle: { id: 'end', type: 'vertex', index: 'a3', x: 0, y: 0 },
    isCreating: true,
    creatingMarkId: markId,
    onInteractionEnd: 'arrow',
  })
  return { shapeId: id, markId, startPagePoint }
}

/**
 * Draw an arrow by clicking its two ends, not by holding the button down.
 *
 * A press-and-drag still draws exactly the arrow it always did — that path is
 * untouched. What changes is the release tldraw currently throws away: a click
 * that never became a drag now leaves the arrow's end point on the pointer, and
 * the next click lands it.
 *
 * Three things are deliberately given back to the person mid-placement, because
 * a placement (unlike a drag) leaves their hand free to change their mind:
 * Escape cancels it (tldraw's own), a second click on the start point discards
 * it the way an unmoved press always has, and leaving for another tool takes
 * the half-drawn arrow with it rather than stranding it under the cursor.
 */
export function installArrowClickToPlace(editor: Editor): () => void {
  let pendingClick = false
  let placement: ArrowPlacement | null = null
  let ending: ArrowPlacement | null = null

  const onBeforeEvent = (info: TLEventInfo) => {
    ending = null
    if (placement) {
      if (endsPlacement(info)) {
        ending = placement
        placement = null
      }
      return
    }
    pendingClick = false
    if (info.name !== 'pointer_up' || info.button !== 0) return
    // Asked here rather than after the fact: `dispatch` clears `isDragging`
    // before the tool sees the release, and `arrow.pointing` cancels itself the
    // moment it does — by the time the event is handled both answers are gone.
    pendingClick = editor.isIn(ARROW_PRESS_PATH)
      && !editor.inputs.getIsDragging()
      && !editor.getIsReadonly()
  }

  const onEvent = (info: TLEventInfo) => {
    if (ending) {
      const finished = ending
      ending = null
      discardUnmovedArrow(editor, finished)
      return
    }
    if (!pendingClick) return
    pendingClick = false
    if (info.name !== 'pointer_up') return
    // tldraw has just bailed its own arrow, so the board is back to where the
    // press found it. Start the placement from there.
    creatingPlacedArrow = true
    try {
      placement = beginArrowPlacement(editor)
    } finally {
      creatingPlacedArrow = false
    }
  }

  const stopPathWatch = react('systemsketch arrow placement', () => {
    const path = editor.getPath()
    if (!placement || path === ARROW_PLACEMENT_PATH) return
    const abandoned = placement
    placement = null
    editor.bailToMark(abandoned.markId)
  })

  editor.on('before-event', onBeforeEvent)
  editor.on('event', onEvent)

  return () => {
    stopPathWatch()
    editor.off('before-event', onBeforeEvent)
    editor.off('event', onEvent)
    if (placement) {
      const abandoned = placement
      placement = null
      editor.bailToMark(abandoned.markId)
    }
  }
}

/**
 * A second click on the start point means "never mind", not "make me a zero
 * length arrow" — the same answer a press that never moved has always given.
 */
function discardUnmovedArrow(editor: Editor, placement: ArrowPlacement): void {
  if (!editor.getShape(placement.shapeId)) return
  const zoom = editor.getZoomLevel()
  const travelled = Vec.Dist2(placement.startPagePoint, editor.inputs.getCurrentPagePoint())
  if (travelled * zoom * zoom > dragThresholdSquared(editor)) return
  editor.bailToMark(placement.markId)
  editor.setCurrentTool('arrow')
}
