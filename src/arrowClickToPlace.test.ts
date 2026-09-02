import {
  Vec,
  atom,
  createShapeId,
  type Editor,
  type TLEventInfo,
  type TLShape,
  type TLShapeId,
} from 'tldraw'
import { describe, expect, it, vi } from 'vitest'

import {
  ARROW_PLACEMENT_PATH,
  ARROW_PRESS_PATH,
  installArrowClickToPlace,
  isDrawingArrowWithArrowTool,
} from './arrowClickToPlace'

const pointerUp = (button = 0): TLEventInfo => ({
  type: 'pointer',
  name: 'pointer_up',
  point: { x: 0, y: 0 },
  pointerId: 1,
  button,
  isPen: false,
  target: 'canvas',
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  accelKey: false,
})

const misc = (name: 'cancel' | 'interrupt' | 'complete'): TLEventInfo => ({ type: 'misc', name })

/**
 * A stand-in for the parts of tldraw this module actually touches. History is
 * modelled the only way that matters here: a mark remembers which shapes
 * existed, and bailing to it puts the document back.
 */
function editorHarness() {
  const path = atom('path', 'select.idle')
  const shapes = new Map<TLShapeId, TLShape>()
  const marks = new Map<string, TLShapeId[]>()
  const eventHandlers = new Map<string, (info: TLEventInfo) => void>()
  const setCurrentTool = vi.fn((id: string) => {
    path.set(id.includes('.') ? id : `${id}.idle`)
  })
  const onHandleDrag = vi.fn(() => undefined)
  const createShape = vi.fn((partial: { id: TLShapeId; type: string; x: number; y: number }) => {
    shapes.set(partial.id, { ...partial, props: { kind: 'arc', bend: 0 } } as unknown as TLShape)
  })
  let origin = new Vec(100, 100)
  let current = new Vec(100, 100)
  let dragging = false
  let readonly = false
  let markCount = 0
  let selected: TLShapeId | null = null

  const editor = {
    options: { dragDistanceSquared: 16, coarseDragDistanceSquared: 36 },
    inputs: {
      getOriginPagePoint: () => origin,
      getCurrentPagePoint: () => current,
      getIsDragging: () => dragging,
    },
    on: vi.fn((name: string, handler: (info: TLEventInfo) => void) => {
      eventHandlers.set(name, handler)
    }),
    off: vi.fn((name: string, handler: (info: TLEventInfo) => void) => {
      if (eventHandlers.get(name) === handler) eventHandlers.delete(name)
    }),
    getPath: () => path.get(),
    isIn: (candidate: string) => path.get().startsWith(candidate),
    getIsReadonly: () => readonly,
    getZoomLevel: () => 1,
    getInstanceState: () => ({ isGridMode: false, isCoarsePointer: false }),
    getDocumentSettings: () => ({ gridSize: 10 }),
    getResizeScaleFactor: () => 1,
    markHistoryStoppingPoint: vi.fn((name: string) => {
      const id = `${name}#${(markCount += 1)}`
      marks.set(id, [...shapes.keys()])
      return id
    }),
    bailToMark: vi.fn((markId: string) => {
      const kept = new Set(marks.get(markId) ?? [])
      for (const id of [...shapes.keys()]) if (!kept.has(id)) shapes.delete(id)
      selected = null
    }),
    createShape,
    updateShapes: vi.fn(),
    getShape: (id: TLShapeId) => shapes.get(id),
    getShapeHandles: () => [
      { id: 'start', type: 'vertex', index: 'a1', x: 0, y: 0 },
      { id: 'end', type: 'vertex', index: 'a3', x: 1, y: 1 },
    ],
    getShapeUtil: () => ({ onHandleDrag }),
    select: vi.fn((id: TLShapeId) => { selected = id }),
    setCurrentTool,
  } as unknown as Editor

  return {
    editor,
    createShape,
    onHandleDrag,
    setCurrentTool,
    arrows: () => [...shapes.values()].filter((shape) => shape.type === 'arrow'),
    selected: () => selected,
    setPath(next: string) { path.set(next) },
    setDragging(value: boolean) { dragging = value },
    setReadonly(value: boolean) { readonly = value },
    pointAt(x: number, y: number) { current = new Vec(x, y) },
    pressAt(x: number, y: number) { origin = new Vec(x, y); current = new Vec(x, y) },
    emitBefore(info: TLEventInfo) { eventHandlers.get('before-event')?.(info) },
    emit(info: TLEventInfo) { eventHandlers.get('event')?.(info) },
    handlerCount: () => eventHandlers.size,
  }
}

type Harness = ReturnType<typeof editorHarness>

/** One click with the arrow tool: the press, then the release tldraw discards. */
function clickWithArrowTool(harness: Harness, x: number, y: number) {
  harness.setPath(ARROW_PRESS_PATH)
  harness.pressAt(x, y)
  harness.emitBefore(pointerUp())
  // tldraw's own `arrow.pointing` bails its arrow and returns to idle here.
  harness.setPath('arrow.idle')
  harness.emit(pointerUp())
}

/** The click that lands the arrow, at a point the pointer has travelled to. */
function landAt(harness: Harness, x: number, y: number) {
  harness.pointAt(x, y)
  harness.emitBefore(pointerUp())
  harness.emit(pointerUp())
}

describe('drawing an arrow by clicking its two ends', () => {
  it('puts the end of a new arrow on the pointer and hands it to tldraw', () => {
    const harness = editorHarness()
    installArrowClickToPlace(harness.editor)

    clickWithArrowTool(harness, 120, 240)

    const [arrow] = harness.arrows()
    expect(arrow).toMatchObject({ type: 'arrow', x: 120, y: 240 })
    expect(harness.selected()).toBe(arrow.id)
    // The start handle is dragged onto its own origin so a click that landed on
    // a shape binds to it, exactly as the stock press does.
    expect(harness.onHandleDrag).toHaveBeenCalledWith(
      arrow,
      expect.objectContaining({ handle: expect.objectContaining({ id: 'start', x: 0, y: 0 }) }),
    )
    expect(harness.setCurrentTool).toHaveBeenCalledWith(ARROW_PLACEMENT_PATH, expect.objectContaining({
      isCreating: true,
      onInteractionEnd: 'arrow',
      handle: expect.objectContaining({ id: 'end' }),
    }))
    expect(harness.editor.getPath()).toBe(ARROW_PLACEMENT_PATH)
  })

  it('reports the arrow tool as the author, so the Curve preset still applies', () => {
    const harness = editorHarness()
    installArrowClickToPlace(harness.editor)
    const authoredByTool: boolean[] = []
    harness.createShape.mockImplementation(() => {
      authoredByTool.push(isDrawingArrowWithArrowTool(harness.editor))
    })

    expect(isDrawingArrowWithArrowTool(harness.editor)).toBe(false)
    clickWithArrowTool(harness, 100, 100)

    // Read at the moment of creation, and from `arrow.idle` — the click-placed
    // arrow is created after tldraw has already left its own pressing state.
    expect(authoredByTool).toEqual([true])
    expect(isDrawingArrowWithArrowTool(harness.editor)).toBe(false)
  })

  it('leaves a press that became a drag, another tool, and readonly alone', () => {
    const harness = editorHarness()
    installArrowClickToPlace(harness.editor)

    harness.setPath(ARROW_PRESS_PATH)
    harness.setDragging(true)
    harness.emitBefore(pointerUp())
    harness.emit(pointerUp())

    harness.setDragging(false)
    harness.setPath('geo.pointing')
    harness.emitBefore(pointerUp())
    harness.emit(pointerUp())

    harness.setPath(ARROW_PRESS_PATH)
    harness.setReadonly(true)
    harness.emitBefore(pointerUp())
    harness.emit(pointerUp())

    harness.setReadonly(false)
    harness.emitBefore(pointerUp(2))
    harness.emit(pointerUp(2))

    expect(harness.arrows()).toHaveLength(0)
    expect(harness.setCurrentTool).not.toHaveBeenCalled()
  })

  it('keeps the arrow the second click lands, and only that one', () => {
    const harness = editorHarness()
    installArrowClickToPlace(harness.editor)

    clickWithArrowTool(harness, 120, 240)
    landAt(harness, 400, 240)
    expect(harness.arrows()).toHaveLength(1)

    // The release that ends a placement must not also start the next one.
    clickWithArrowTool(harness, 500, 500)
    expect(harness.arrows()).toHaveLength(2)
  })

  it('discards an arrow whose second click never left the first', () => {
    const harness = editorHarness()
    installArrowClickToPlace(harness.editor)

    clickWithArrowTool(harness, 120, 240)
    landAt(harness, 122, 241)

    expect(harness.arrows()).toHaveLength(0)
    expect(harness.setCurrentTool).toHaveBeenLastCalledWith('arrow')
  })

  it('takes a half-drawn arrow with it when the placement is abandoned', () => {
    const harness = editorHarness()
    const stop = installArrowClickToPlace(harness.editor)

    // Escape: tldraw's own handle drag has already bailed the arrow.
    clickWithArrowTool(harness, 120, 240)
    harness.emitBefore(misc('cancel'))
    harness.editor.bailToMark('creating_arrow:mark#1')
    harness.emit(misc('cancel'))
    expect(harness.arrows()).toHaveLength(0)

    // A tool change, which no stock arrow drag can reach — the pointer is down
    // for the whole of one of those, and free for the whole of a placement.
    clickWithArrowTool(harness, 300, 300)
    expect(harness.arrows()).toHaveLength(1)
    harness.setPath('geo.idle')
    expect(harness.arrows()).toHaveLength(0)

    // Unmounting is the same question asked at the end of the session.
    clickWithArrowTool(harness, 500, 500)
    expect(harness.arrows()).toHaveLength(1)
    stop()
    expect(harness.arrows()).toHaveLength(0)
    expect(harness.handlerCount()).toBe(0)
  })

  it('is registered on the two seams it listens at, and unregisters both', () => {
    const harness = editorHarness()
    const stop = installArrowClickToPlace(harness.editor)
    expect(harness.editor.on).toHaveBeenCalledWith('before-event', expect.any(Function))
    expect(harness.editor.on).toHaveBeenCalledWith('event', expect.any(Function))
    stop()
    expect(harness.editor.off).toHaveBeenCalledTimes(2)
  })

  it('names the two stock states it stands between', () => {
    expect(ARROW_PRESS_PATH).toBe('arrow.pointing')
    expect(ARROW_PLACEMENT_PATH).toBe('select.dragging_handle')
    expect(createShapeId()).toMatch(/^shape:/)
  })
})
