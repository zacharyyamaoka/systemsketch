import {
  GeoShapeUtil,
  PathBuilder,
  putExcalidrawContent,
  type Editor,
  type TLGeoShape,
  type TLShape,
} from 'tldraw'

export const EXCALIDRAW_ROUNDED_RECT_GEO = 'excalidraw-rounded-rect'
export const EXCALIDRAW_ROUNDNESS_META_KEY = 'excalidrawRoundness'

const PROPORTIONAL_RADIUS = 0.25
const DEFAULT_ADAPTIVE_RADIUS = 32

export interface ExcalidrawRoundness {
  [key: string]: number | undefined
  type: 1 | 2 | 3
  value?: number
}

interface ExcalidrawElement {
  type?: unknown
  roundness?: unknown
}

interface ExcalidrawClipboardContent {
  elements?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Keep only the roundness values that Excalidraw itself understands. Clipboard
 * payloads are untrusted JSON, so invalid values fall back to stock geometry.
 */
export function parseExcalidrawRoundness(value: unknown): ExcalidrawRoundness | null {
  if (!isRecord(value) || (value.type !== 1 && value.type !== 2 && value.type !== 3)) {
    return null
  }

  if (value.value === undefined) return { type: value.type }
  if (typeof value.value !== 'number' || !Number.isFinite(value.value) || value.value < 0) {
    return null
  }

  return { type: value.type, value: value.value }
}

/** Match Excalidraw's getCornerRadius rules for rectangle-like elements. */
export function getExcalidrawCornerRadius(
  width: number,
  height: number,
  roundness: ExcalidrawRoundness,
): number {
  const shortSide = Math.max(0, Math.min(Math.abs(width), Math.abs(height)))
  const proportionalRadius = shortSide * PROPORTIONAL_RADIUS

  if (roundness.type === 3) {
    return Math.min(proportionalRadius, roundness.value ?? DEFAULT_ADAPTIVE_RADIUS)
  }

  return proportionalRadius
}

/**
 * Reproduce Excalidraw's rounded rectangle outline with quadratic corners.
 * PathBuilder has cubic curves, so each quadratic segment is converted to its
 * mathematically equivalent cubic Bézier segment.
 */
export function getExcalidrawRoundedRectPath(
  width: number,
  height: number,
  radius: number,
  isFilled = false,
): PathBuilder {
  const w = Math.max(0, width)
  const h = Math.max(0, height)
  const r = Math.min(Math.max(0, radius), Math.min(w, h) / 2)
  const twoThirds = (2 * r) / 3

  return new PathBuilder()
    .moveTo(r, 0, { geometry: { isFilled } })
    .lineTo(w - r, 0)
    .cubicBezierTo(w, r, w - r + twoThirds, 0, w, r - twoThirds)
    .lineTo(w, h - r)
    .cubicBezierTo(w - r, h, w, h - r + twoThirds, w - r + twoThirds, h)
    .lineTo(r, h)
    .cubicBezierTo(0, h - r, r - twoThirds, h, 0, h - r + twoThirds)
    .lineTo(0, r)
    .cubicBezierTo(r, 0, 0, r - twoThirds, r - twoThirds, 0)
    .close()
}

function readShapeRoundness(shape: TLGeoShape): ExcalidrawRoundness {
  const meta = shape.meta as Record<string, unknown>
  return parseExcalidrawRoundness(meta[EXCALIDRAW_ROUNDNESS_META_KEY]) ?? { type: 3 }
}

const ExcalidrawGeoShapeUtil = GeoShapeUtil.configure({
  customGeoTypes: {
    [EXCALIDRAW_ROUNDED_RECT_GEO]: {
      icon: 'geo-rectangle',
      snapType: 'polygon',
      getPath: (w, h, shape) =>
        getExcalidrawRoundedRectPath(
          w,
          h,
          getExcalidrawCornerRadius(w, h, readShapeRoundness(shape)),
          shape.props.fill !== 'none',
        ),
    },
  },
})

export const EXCALIDRAW_SHAPE_UTILS = [ExcalidrawGeoShapeUtil]

function getConvertibleGeoElements(content: unknown): ExcalidrawElement[] {
  if (!isRecord(content) || !Array.isArray((content as ExcalidrawClipboardContent).elements)) {
    return []
  }

  return (content as { elements: unknown[] }).elements.filter(
    (element): element is ExcalidrawElement =>
      isRecord(element) &&
      (element.type === 'rectangle' || element.type === 'ellipse' || element.type === 'diamond'),
  )
}

/**
 * The stock converter creates geo shapes in source-element order. Consume only
 * those geo records so intervening arrows, labels, groups, and drawings cannot
 * move the queue. The mixed-paste regression test pins this upstream contract.
 */
export function createExcalidrawGeoShapeTransformer(
  content: unknown,
): (shape: TLShape) => TLShape {
  const sourceGeoElements = getConvertibleGeoElements(content)
  let sourceGeoIndex = 0

  return (shape) => {
    if (shape.type !== 'geo') return shape

    const source = sourceGeoElements[sourceGeoIndex]
    sourceGeoIndex += 1
    if (!source || source.type !== 'rectangle') return shape

    const roundness = parseExcalidrawRoundness(source.roundness)
    if (!roundness) return shape

    return {
      ...shape,
      props: {
        ...shape.props,
        geo: EXCALIDRAW_ROUNDED_RECT_GEO as TLGeoShape['props']['geo'],
      },
      meta: {
        ...shape.meta,
        [EXCALIDRAW_ROUNDNESS_META_KEY]: roundness,
      },
    }
  }
}

export async function putExcalidrawContentWithRoundness(
  editor: Editor,
  content: unknown,
  point?: { x: number; y: number },
): Promise<void> {
  const transformShape = createExcalidrawGeoShapeTransformer(content)
  const unregister = editor.sideEffects.registerBeforeCreateHandler('shape', (shape) =>
    transformShape(shape as TLShape),
  )

  try {
    await putExcalidrawContent(editor, content, point)
  } finally {
    unregister()
  }
}

/** Install the narrow override after tldraw has registered its default handlers. */
export function registerExcalidrawPasteHandler(editor: Editor): () => void {
  editor.registerExternalContentHandler('excalidraw', ({ content, point }) => {
    editor.run(() => {
      void putExcalidrawContentWithRoundness(editor, content, point)
    })
  })

  return () => {
    editor.registerExternalContentHandler('excalidraw', null)
  }
}
