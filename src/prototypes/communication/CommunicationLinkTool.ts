import { StateNode, Vec, type Editor, type TLShape, type TLShapeId, type VecLike } from 'tldraw'

import { isBlockShape } from '../../blocks/blockModel'
import { EditorAtom } from '../../blocks/ports/portState'
import {
	materializeCommunicationLink,
	type CommunicationDrawFamily,
} from './communicationAuthoring'
import { applyCommunicationDrawFamily, communicationProjection } from './communicationProjection'

export const COMMUNICATION_LINK_TOOL_ID = 'communication-link' as const

export interface CommunicationLinkDraft {
	initiatorId: TLShapeId | null
	/** Page-space start, so the overlay needs no camera subscription of its own. */
	origin: VecLike | null
	pointer: VecLike | null
	/** The Block currently under the pointer, when it is a legal landing. */
	hoverId: TLShapeId | null
}

const EMPTY_DRAFT: CommunicationLinkDraft = {
	initiatorId: null,
	origin: null,
	pointer: null,
	hoverId: null,
}

/** The in-flight arrow, read by the overlay. Never written to the document. */
export const communicationLinkDraft = new EditorAtom<CommunicationLinkDraft>(
	'communication link draft',
	() => EMPTY_DRAFT,
)

/**
 * The Block a communication arrow may start or end on.
 *
 * Surfaces, not ports — that is the whole point of the view. A value pill is
 * local data rather than a communicating component, and an Expanded Block's
 * hollow interior belongs to whatever is inside it, so neither is a landing.
 */
export function communicationLinkTargetAt(
	editor: { getShapeAtPoint: (point: VecLike, opts: object) => TLShape | undefined },
	point: VecLike,
): TLShapeId | null {
	const hit = editor.getShapeAtPoint(point, {
		hitInside: true,
		margin: 0,
		filter: (shape: TLShape) => isBlockShape(shape) && shape.props.view !== 'value',
	})
	return hit ? hit.id : null
}

/**
 * Distinct state ids on purpose: the recorder maps a state name back to the
 * file that defines it, and a bare `idle` here would shadow tldraw's own
 * SelectTool idle in that map (`tests/test_recording_store.py` asserts it).
 */
class Idle extends StateNode {
	static override id = 'communication_link_idle'

	override onEnter() {
		this.editor.setCursor({ type: 'cross', rotation: 0 })
		communicationLinkDraft.update(this.editor, (draft) => ({
			...draft,
			initiatorId: null,
			origin: null,
			pointer: null,
			hoverId: null,
		}))
	}

	override onPointerMove() {
		const point = this.editor.inputs.getCurrentPagePoint()
		const hoverId = communicationLinkTargetAt(this.editor, point)
		communicationLinkDraft.update(this.editor, (draft) => (
			draft.hoverId === hoverId ? draft : { ...draft, hoverId }
		))
	}

	override onPointerDown() {
		const point = this.editor.inputs.getCurrentPagePoint()
		const initiatorId = communicationLinkTargetAt(this.editor, point)
		if (!initiatorId) return
		communicationLinkDraft.update(this.editor, (draft) => ({
			...draft,
			initiatorId,
			origin: Vec.From(point).toJson(),
			pointer: Vec.From(point).toJson(),
			hoverId: null,
		}))
		this.parent.transition('communication_link_pointing')
	}

	override onCancel() {
		this.editor.setCurrentTool('select')
	}
}

class Pointing extends StateNode {
	static override id = 'communication_link_pointing'

	override onPointerMove() {
		const point = this.editor.inputs.getCurrentPagePoint()
		const draft = communicationLinkDraft.get(this.editor)
		const over = communicationLinkTargetAt(this.editor, point)
		communicationLinkDraft.set(this.editor, {
			...draft,
			pointer: Vec.From(point).toJson(),
			hoverId: over && over !== draft.initiatorId ? over : null,
		})
	}

	override onPointerUp() {
		const draft = communicationLinkDraft.get(this.editor)
		const point = this.editor.inputs.getCurrentPagePoint()
		const responderId = communicationLinkTargetAt(this.editor, point)
		this.parent.transition('communication_link_idle')
		if (!draft.initiatorId || !responderId || responderId === draft.initiatorId) return

		const result = materializeCommunicationLink(this.editor, {
			family: communicationProjection.get(this.editor).drawFamily,
			initiatorId: draft.initiatorId,
			responderId,
		})
		if (!result.ok) return
		// WHY: stay on the tool. Drawing a communication topology is a repeated
		// gesture — you lay in every stream, then every service — and dropping
		// back to Select after each arrow would make the common case the one
		// that costs an extra click. Escape leaves, exactly as it does for the
		// stock drawing tools.
		this.editor.selectNone()
	}

	override onCancel() {
		this.parent.transition('communication_link_idle')
	}

	override onInterrupt() {
		this.parent.transition('communication_link_idle')
	}
}

/**
 * Draw a communication relationship between two Block surfaces.
 *
 * The gesture is the arrow tool's — press a shape, drag, release on another —
 * because that muscle memory already exists and a communication arrow is an
 * arrow. What differs is only what it writes: no arrow shape survives the
 * gesture, because the relationship is stored as the canonical ports and
 * cables that `materializeCommunicationLink` generates.
 */
export class CommunicationLinkTool extends StateNode {
	static override id = COMMUNICATION_LINK_TOOL_ID
	static override initial = 'communication_link_idle'
	static override children() {
		return [Idle, Pointing]
	}

	override onExit() {
		communicationLinkDraft.set(this.editor, {
			...communicationLinkDraft.get(this.editor),
			initiatorId: null,
			origin: null,
			pointer: null,
			hoverId: null,
		})
	}
}

/** Arm the tool with one family and enter it. */
export function startCommunicationLinkDraw(
	editor: Editor,
	family: CommunicationDrawFamily,
): void {
	applyCommunicationDrawFamily(editor, family)
	editor.setCurrentTool(COMMUNICATION_LINK_TOOL_ID)
}

/** Leave the drawing tool without disturbing the active region's lens. */
export function stopCommunicationLinkDraw(editor: Editor): void {
	editor.setCurrentTool('select')
}

export function activeCommunicationDrawFamily(editor: Editor): CommunicationDrawFamily | null {
	return editor.getCurrentToolId() === COMMUNICATION_LINK_TOOL_ID
		? communicationProjection.get(editor).drawFamily
		: null
}
