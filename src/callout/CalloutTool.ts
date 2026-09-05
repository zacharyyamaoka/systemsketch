import {
  StateNode,
  createShapeId,
  startEditingShapeWithRichText,
  type Editor,
  type TLPointerEventInfo,
  type TLShapeId,
  type TLStateNodeConstructor,
  type VecLike,
} from 'tldraw'

import {
  CALLOUT_ADD_LEADER_TOOL_ID,
  CALLOUT_TOOL_ID,
  addCalloutLeader,
  beginCalloutLeader,
  finishCallout,
  isCalloutCard,
  updateCalloutLeaderEnd,
} from './calloutModel'

interface PendingCallout {
  arrowId: TLShapeId
  markId: string
  targetPoint: VecLike
}

const pendingLeaderCards = new WeakMap<Editor, TLShapeId>()

/** Enter the one-click target picker used by “Add leader” surfaces. */
export function startAddingCalloutLeader(editor: Editor, cardId: TLShapeId): void {
  const card = editor.getShape(cardId)
  if (!isCalloutCard(card) || card.isLocked || editor.getIsReadonly()) return
  pendingLeaderCards.set(editor, cardId)
  editor.setCurrentTool(CALLOUT_ADD_LEADER_TOOL_ID)
}

class CalloutPickingTarget extends StateNode {
  static override id = 'picking_target'

  override onEnter(): void {
    this.editor.setCursor({ type: 'cross', rotation: 0 })
  }

  override onPointerUp(): void {
    const targetPoint = this.editor.inputs.getCurrentPagePoint()
    const markId = this.editor.markHistoryStoppingPoint(`creating_callout:${createShapeId()}`)
    const arrow = beginCalloutLeader(this.editor, targetPoint)
    if (!arrow) {
      this.parent.transition('picking_target')
      return
    }
    this.parent.transition('placing_card', { arrowId: arrow.id, markId, targetPoint })
  }

  override onCancel(): void {
    this.editor.setCurrentTool('select')
  }
}

class CalloutPlacingCard extends StateNode {
  static override id = 'placing_card'
  private pending: PendingCallout | null = null

  override onEnter(info: PendingCallout): void {
    this.pending = info?.arrowId ? info : null
    if (!this.pending) this.parent.transition('picking_target')
    else this.editor.setCursor({ type: 'cross', rotation: 0 })
  }

  override onExit(): void {
    if (this.pending) this.editor.bailToMark(this.pending.markId)
    this.pending = null
  }

  override onPointerMove(): void {
    if (!this.pending) return
    updateCalloutLeaderEnd(this.editor, this.pending.arrowId, this.editor.inputs.getCurrentPagePoint())
  }

  override onPointerUp(): void {
    const pending = this.pending
    if (!pending) return
    const card = finishCallout(
      this.editor,
      pending.arrowId,
      pending.targetPoint,
      this.editor.inputs.getCurrentPagePoint(),
    )
    this.pending = null
    if (!card) {
      this.editor.bailToMark(pending.markId)
      this.parent.transition('picking_target')
      return
    }
    this.editor.select(card.id)
    this.editor.setCurrentTool('select')
    queueMicrotask(() => {
      const liveCard = this.editor.getShape(card.id)
      if (isCalloutCard(liveCard) && this.editor.canEditShape(liveCard)) {
        startEditingShapeWithRichText(this.editor, liveCard, { selectAll: true })
      }
    })
  }

  override onCancel(): void {
    if (this.pending) this.editor.bailToMark(this.pending.markId)
    this.pending = null
    this.editor.setCurrentTool('select')
  }
}

/**
 * Two clicks: point at the detail, then place the note. The elastic first
 * leader is a genuine stock arrow from the first click onward, so cancel and
 * undo do not have a second drawing implementation to reconcile.
 */
export class CalloutTool extends StateNode {
  static override id = CALLOUT_TOOL_ID
  static override initial = 'picking_target'
  static override children(): TLStateNodeConstructor[] {
    return [CalloutPickingTarget, CalloutPlacingCard]
  }
}

class AddingCalloutLeader extends StateNode {
  // Keep this state semantic rather than calling it `idle`: recorder traces
  // resolve state ids across the whole tool tree, where an `idle` here would
  // obscure tldraw's SelectTool idle state.
  static override id = 'picking_leader_target'

  override onEnter(): void {
    const cardId = pendingLeaderCards.get(this.editor)
    const card = cardId ? this.editor.getShape(cardId) : null
    if (!isCalloutCard(card) || card.isLocked || this.editor.getIsReadonly()) {
      this.editor.setCurrentTool('select')
      return
    }
    this.editor.setCursor({ type: 'cross', rotation: 0 })
  }

  override onPointerUp(_info: TLPointerEventInfo): void {
    const cardId = pendingLeaderCards.get(this.editor)
    const card = cardId ? this.editor.getShape(cardId) : null
    if (!isCalloutCard(card)) {
      this.editor.setCurrentTool('select')
      return
    }
    const arrow = addCalloutLeader(this.editor, card, this.editor.inputs.getCurrentPagePoint())
    if (arrow) this.editor.select(arrow.id)
    this.editor.setCurrentTool('select')
  }

  override onCancel(): void {
    this.editor.setCurrentTool('select')
  }
}

/** A transient target-picker tool; the card itself remains a stock geo shape. */
export class CalloutAddLeaderTool extends StateNode {
  static override id = CALLOUT_ADD_LEADER_TOOL_ID
  static override initial = 'picking_leader_target'
  static override children(): TLStateNodeConstructor[] {
    return [AddingCalloutLeader]
  }

  override onExit(): void {
    pendingLeaderCards.delete(this.editor)
  }
}
