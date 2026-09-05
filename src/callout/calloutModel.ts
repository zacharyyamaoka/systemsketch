import {
  Box,
  createShapeId,
  toRichText,
  type Editor,
  type JsonObject,
  type TLArrowBinding,
  type TLArrowShape,
  type TLGeoShape,
  type TLShape,
  type TLShapeId,
  type VecLike,
} from 'tldraw'

/**
 * Engineering-callout rationale and interaction evidence:
 * `docs/callout-primitive-implementation-2026-09-04.html`.
 *
 * WHY: this is a semantic relationship across stock `geo` and `arrow` records,
 * not a custom drawing or a review-comment pin. That makes the note's text,
 * card geometry, leader terminals, elbow knees, styling, copy/paste, and
 * persistence all stay inside tldraw's ordinary editing model. Multiple
 * leaders deliberately remain separate arrows attached to the same card:
 * unlike a bespoke multi-terminal object, each leader can be selected, routed,
 * formatted, or deleted independently.
 */
export const CALLOUT_TOOL_ID = 'callout' as const

/** An internal tool entered by “Add leader” on an existing Callout card. */
export const CALLOUT_ADD_LEADER_TOOL_ID = 'callout-add-leader' as const

/** Namespaced stock-shape metadata; no custom TLDR record type is required. */
export const CALLOUT_META_KEY = 'systemSketchCallout' as const
const CALLOUT_META_VERSION = 1

export const CALLOUT_CARD_WIDTH = 236
export const CALLOUT_CARD_HEIGHT = 82

interface CalloutCardMeta {
  version: typeof CALLOUT_META_VERSION
  role: 'card'
}

interface CalloutLeaderMeta {
  version: typeof CALLOUT_META_VERSION
  role: 'leader'
  cardId: TLShapeId
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function cardMeta(): JsonObject {
  return {
    [CALLOUT_META_KEY]: {
      version: CALLOUT_META_VERSION,
      role: 'card',
    } satisfies CalloutCardMeta,
  }
}

function leaderMeta(cardId: TLShapeId): JsonObject {
  return {
    [CALLOUT_META_KEY]: {
      version: CALLOUT_META_VERSION,
      role: 'leader',
      cardId,
    } satisfies CalloutLeaderMeta,
  }
}

function readMeta(shape: TLShape | null | undefined): CalloutCardMeta | CalloutLeaderMeta | null {
  if (!shape) return null
  const value = shape.meta[CALLOUT_META_KEY]
  if (!isRecord(value) || value.version !== CALLOUT_META_VERSION) return null
  if (value.role === 'card') return { version: CALLOUT_META_VERSION, role: 'card' }
  if (value.role === 'leader' && typeof value.cardId === 'string') {
    return { version: CALLOUT_META_VERSION, role: 'leader', cardId: value.cardId as TLShapeId }
  }
  return null
}

/** A Callout card is intentionally a normal editable stock rectangle. */
export function isCalloutCard(shape: TLShape | null | undefined): shape is TLGeoShape {
  return shape?.type === 'geo' && readMeta(shape)?.role === 'card'
}

/** A Callout leader is intentionally a normal editable stock elbow arrow. */
export function isCalloutLeader(shape: TLShape | null | undefined): shape is TLArrowShape {
  return shape?.type === 'arrow' && readMeta(shape)?.role === 'leader'
}

export function calloutCardIdForLeader(shape: TLShape | null | undefined): TLShapeId | null {
  const meta = readMeta(shape)
  return meta?.role === 'leader' ? meta.cardId : null
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0.5))
}

/** The clicked page point expressed as a durable normalized binding anchor. */
export function normalizedAnchorAtPoint(
  editor: Editor,
  shape: TLShape,
  point: VecLike,
): { x: number; y: number } {
  const bounds = Box.ZeroFix(editor.getShapeGeometry(shape).bounds)
  const local = editor.getPointInShapeSpace(shape, point)
  return {
    x: clampUnit((local.x - bounds.x) / bounds.w),
    y: clampUnit((local.y - bounds.y) / bounds.h),
  }
}

/**
 * The card-end anchor belongs on the nearest card face, not halfway through
 * the box. That keeps a leader legible after any cardinal or diagonal placement
 * while retaining the stock arrow binding when the card moves or resizes.
 */
export function nearestCardFaceAnchor(
  editor: Editor,
  card: TLGeoShape,
  targetPoint: VecLike,
): { x: number; y: number } {
  const bounds = Box.ZeroFix(editor.getShapeGeometry(card).bounds)
  const local = editor.getPointInShapeSpace(card, targetPoint)
  const center = { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 }
  const dx = local.x - center.x
  const dy = local.y - center.y
  if (Math.abs(dx) / bounds.w >= Math.abs(dy) / bounds.h) {
    return { x: dx <= 0 ? 0 : 1, y: clampUnit((local.y - bounds.y) / bounds.h) }
  }
  return { x: clampUnit((local.x - bounds.x) / bounds.w), y: dy <= 0 ? 0 : 1 }
}

function targetAtPoint(editor: Editor, point: VecLike, fromShape: TLArrowShape): TLShape | null {
  return editor.getShapeAtPoint(point, {
    hitInside: true,
    hitFrameInside: true,
    margin: 8,
    filter: (shape) => !shape.isLocked
      && shape.id !== fromShape.id
      && editor.canBindShapes({ fromShape, toShape: shape, binding: 'arrow' }),
  }) ?? null
}

function bindTerminal(
  editor: Editor,
  arrow: TLArrowShape,
  terminal: 'start' | 'end',
  target: TLShape,
  anchor: { x: number; y: number },
): void {
  editor.createBinding<TLArrowBinding>({
    type: 'arrow',
    fromId: arrow.id,
    toId: target.id,
    props: {
      terminal,
      normalizedAnchor: anchor,
      isExact: true,
      isPrecise: true,
      snap: 'edge',
    },
  })
}

/**
 * Start the leader on the callout’s pointed end. It may bind to a shape or stay
 * a literal point, which is useful for details inside a shape as well as whole
 * components. The end stays loose until the card placement click.
 */
export function beginCalloutLeader(editor: Editor, targetPoint: VecLike): TLArrowShape | null {
  const id = createShapeId()
  editor.createShape({
    id,
    type: 'arrow',
    x: targetPoint.x,
    y: targetPoint.y,
    meta: leaderMeta('shape:pending-callout' as TLShapeId),
    props: {
      kind: 'elbow',
      elbowMidPoint: 0.5,
      arrowheadStart: 'triangle',
      arrowheadEnd: 'none',
      color: 'orange',
      dash: 'solid',
      size: 'm',
    },
  })
  const arrow = editor.getShape<TLArrowShape>(id)
  if (!arrow) return null
  const target = targetAtPoint(editor, targetPoint, arrow)
  if (target) bindTerminal(editor, arrow, 'start', target, normalizedAnchorAtPoint(editor, target, targetPoint))
  return editor.getShape<TLArrowShape>(id) ?? null
}

/** Keep the first-click leader visibly following the cursor until the card lands. */
export function updateCalloutLeaderEnd(editor: Editor, arrowId: TLShapeId, point: VecLike): void {
  const arrow = editor.getShape<TLArrowShape>(arrowId)
  if (!arrow) return
  const local = editor.getPointInShapeSpace(arrow, point)
  editor.updateShape({
    id: arrow.id,
    type: 'arrow',
    props: { end: { x: local.x, y: local.y } },
  })
}

/** Make the stock rectangle that carries the note copy. */
export function createCalloutCard(editor: Editor, center: VecLike): TLGeoShape | null {
  const id = createShapeId()
  editor.createShape({
    id,
    type: 'geo',
    x: center.x - CALLOUT_CARD_WIDTH / 2,
    y: center.y - CALLOUT_CARD_HEIGHT / 2,
    meta: cardMeta(),
    props: {
      geo: 'rectangle',
      w: CALLOUT_CARD_WIDTH,
      h: CALLOUT_CARD_HEIGHT,
      color: 'orange',
      fill: 'none',
      dash: 'solid',
      size: 'm',
      font: 'sans',
      align: 'start',
      verticalAlign: 'middle',
      richText: toRichText('Callout — describe this detail'),
    },
  })
  return editor.getShape<TLGeoShape>(id) ?? null
}

/** Finish a two-click Callout by welding the loose leader to its stock card. */
export function finishCallout(
  editor: Editor,
  arrowId: TLShapeId,
  targetPoint: VecLike,
  cardCenter: VecLike,
): TLGeoShape | null {
  const card = createCalloutCard(editor, cardCenter)
  const arrow = editor.getShape<TLArrowShape>(arrowId)
  if (!card || !arrow) return null
  editor.updateShape({
    id: arrow.id,
    type: 'arrow',
    meta: leaderMeta(card.id),
  })
  bindTerminal(editor, arrow, 'end', card, nearestCardFaceAnchor(editor, card, targetPoint))
  return card
}

/**
 * Add another independent stock elbow leader to one card. This is deliberately
 * not a single multi-terminal shape: each leader retains stock handles, text,
 * arrowhead formatting, and deletion semantics.
 */
export function addCalloutLeader(
  editor: Editor,
  card: TLGeoShape,
  targetPoint: VecLike,
): TLArrowShape | null {
  const arrow = beginCalloutLeader(editor, targetPoint)
  if (!arrow) return null
  updateCalloutLeaderEnd(editor, arrow.id, {
    x: card.x + CALLOUT_CARD_WIDTH / 2,
    y: card.y + CALLOUT_CARD_HEIGHT / 2,
  })
  editor.updateShape({ id: arrow.id, type: 'arrow', meta: leaderMeta(card.id) })
  bindTerminal(editor, arrow, 'end', card, nearestCardFaceAnchor(editor, card, targetPoint))
  return editor.getShape<TLArrowShape>(arrow.id) ?? null
}
