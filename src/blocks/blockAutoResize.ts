/**
 * Derived bounds for opt-in Expanded Blocks.
 *
 * tldraw already owns container membership and its `fitFrameToContent` helper;
 * this module only says when that stock operation should run. Keeping the
 * policy here avoids a second drag/reparent implementation and makes turning
 * auto-fit off an immediate return to ordinary stock resize handles.
 */
import {
	Box,
	fitFrameToContent,
	isShapeId,
	type Editor,
	type TLEventInfo,
	type TLShape,
	type TLShapeId,
} from 'tldraw'

import { isBlockShape, isExpandedBlockShape, type BlockShape } from './blockModel'

/**
 * A shared inset gives the header enough air above its first child as well as
 * a constant border around every other side. `fitFrameToContent` intentionally
 * exposes one stock padding value, so this is the smallest safe value for the
 * 48px header rather than a hand-rolled asymmetric frame algorithm.
 */
export const BLOCK_AUTO_RESIZE_PADDING_PX = 56

/**
 * Gesture-time projection of the box that stock `fitFrameToContent` will
 * commit. Coordinates are relative to the Block's current local origin.
 */
export interface BlockAutoResizePresentation {
	x: number
	y: number
	w: number
	h: number
}

type ResizeSource = 'user' | 'remote'

/**
 * tldraw's transform states calculate each pointer sample from the gesture's
 * initial shape snapshot. `fitFrameToContent` is deliberately one-shot: it
 * shifts the frame and every child-local coordinate together. Running that
 * stock helper between pointer samples invalidates the transform snapshot and
 * makes the two otherwise-correct operations amplify one another.
 */
const TRANSIENT_GEOMETRY_PATHS = [
	// tldraw may write the first transformed sample before transitioning from a
	// pointing state into its corresponding active transform state.
	'select.pointing_shape',
	'select.pointing_selection',
	'select.pointing_resize_handle',
	'select.pointing_rotate_handle',
	'select.pointing_handle',
	'select.translating',
	'select.resizing',
	'select.rotating',
	'select.dragging_handle',
] as const

export function isBlockAutoResizeGestureActive(editor: Pick<Editor, 'inputs' | 'isIn'>): boolean {
	// Cover both public views of the interaction lifecycle. The path list is the
	// important guard; the input manager also covers custom transform tools that
	// retain the stock pointer lifecycle without using a stock SelectTool path.
	return editor.inputs.getIsPointing()
		|| TRANSIENT_GEOMETRY_PATHS.some((path) => editor.isIn(path))
}

function isAutoResizeBlock(shape: TLShape | undefined): shape is BlockShape {
	return isExpandedBlockShape(shape) && shape.props.autoResize
}

/**
 * Derive a live frame surface from tldraw's current child geometry without
 * writing any document geometry during the gesture.
 *
 * WHY: moving the persisted frame between pointer samples invalidates stock
 * translation's initial snapshot and recreates the runaway feedback loop. A
 * group-like derived geometry gives the continuous UX immediately; the same
 * stock fit helper remains the sole commit path when the gesture settles.
 */
export function blockAutoResizePresentation(
	editor: Editor,
	shape: BlockShape,
): BlockAutoResizePresentation | null {
	if (!isAutoResizeBlock(shape) || !isBlockAutoResizeGestureActive(editor)) return null
	const childIds = editor.getSortedChildIdsForParent(shape.id)
	if (childIds.length === 0) return null

	const points = childIds.flatMap((id) => {
		const child = editor.getShape(id)
		if (!child) return []
		const transform = editor.getShapeLocalTransform(child)
		return transform?.applyToPoints(editor.getShapeGeometry(child.id).vertices) ?? []
	})
	if (points.length === 0) return null

	const bounds = Box.FromPoints(points)
	const presentation = {
		x: bounds.minX - BLOCK_AUTO_RESIZE_PADDING_PX,
		y: bounds.minY - BLOCK_AUTO_RESIZE_PADDING_PX,
		w: bounds.w + BLOCK_AUTO_RESIZE_PADDING_PX * 2,
		h: bounds.h + BLOCK_AUTO_RESIZE_PADDING_PX * 2,
	}
	if (!Object.values(presentation).every(Number.isFinite)) return null
	if (
		Math.abs(presentation.x) < 0.001
		&& Math.abs(presentation.y) < 0.001
		&& Math.abs(presentation.w - shape.props.w) < 0.001
		&& Math.abs(presentation.h - shape.props.h) < 0.001
	) return null
	return presentation
}

/**
 * The selected shape can be nested in a stock group inside the Block. Lift the
 * request to the direct child that actually owns membership in the container,
 * so "Remove from container" keeps that whole local composite together.
 */
export interface AutoResizeMembership {
	container: BlockShape
	member: TLShape
}

export function selectedAutoResizeMembership(editor: Editor): AutoResizeMembership | null {
	const selected = editor.getSelectedShapes()
	if (selected.length !== 1) return null
	let member = selected[0]
	if (!member || member.type === 'connection' || member.isLocked) return null

	while (isShapeId(member.parentId)) {
		const parent: TLShape | undefined = editor.getShape(member.parentId)
		if (!parent) return null
		if (isAutoResizeBlock(parent)) return { container: parent, member }
		member = parent
	}
	return null
}

/**
 * An explicit escape hatch for an auto-fitting container. Stock reparenting
 * preserves the member's page pose; the block's normal derived pass then
 * contracts around the remaining children.
 */
export function removeSelectedFromAutoResizeContainer(editor: Editor): boolean {
	const membership = selectedAutoResizeMembership(editor)
	if (!membership || membership.container.isLocked) return false
	editor.markHistoryStoppingPoint('remove from container')
	editor.reparentShapes([membership.member.id], membership.container.parentId)
	editor.setSelectedShapes([membership.member.id])
	return true
}

function noteAutoResizeAncestors(
	editor: Editor,
	shape: TLShape | undefined,
	source: ResizeSource,
	pending: Map<TLShapeId, ResizeSource>,
	fitting: ReadonlySet<TLShapeId>,
): void {
	let current = shape
	while (current) {
		// A stock fit writes its own container bounds. Let an outer auto-fitting
		// Block see that child change, but never queue the Block that is currently
		// being fitted again: a no-op stock fit is still a document mutation.
		if (isAutoResizeBlock(current) && !fitting.has(current.id) && pending.get(current.id) !== 'user') {
			pending.set(current.id, source)
		}
		if (!isShapeId(current.parentId)) return
		current = editor.getShape(current.parentId)
	}
}

/**
 * Subscribe at tldraw's supported side-effect seam, settle once after an
 * operation, and delegate every actual box calculation to stock tldraw.
 */
export function installBlockAutoResize(editor: Editor): () => void {
	let pending = new Map<TLShapeId, ResizeSource>()
	let queued = false
	let disposed = false
	const fitting = new Set<TLShapeId>()

	const note = (shape: TLShape | undefined, source: string) => {
		noteAutoResizeAncestors(editor, shape, source === 'remote' ? 'remote' : 'user', pending, fitting)
	}
	const stopCreate = editor.sideEffects.registerAfterCreateHandler('shape', (shape, source) => {
		note(shape, source)
	})
	const stopChange = editor.sideEffects.registerAfterChangeHandler('shape', (before, after, source) => {
		// Position, box, parenting and content edits all change a fit. Looking at
		// both records also catches a child leaving an auto-sized Block.
		note(before, source)
		note(after, source)
	})
	const stopDelete = editor.sideEffects.registerBeforeDeleteHandler('shape', (shape) => {
		// This pre-delete hook does not expose a source in tldraw 5.3.2. The
		// resulting fit is still derived and history-ignored, which is the same
		// safe outcome for a local or remotely applied removal.
		note(shape, 'user')
	})

	const settle = () => {
		queued = false
		if (disposed || pending.size === 0) return
		// WHY: stock translation must be the sole geometry writer while a pointer
		// gesture is active. Keep the dirty set and fit once after tldraw reaches
		// its settled state; live fitting corrupts tldraw's initial drag snapshot.
		if (isBlockAutoResizeGestureActive(editor)) return
		const entries = pending
		pending = new Map()
		for (const [id, source] of entries) {
			const fit = () => {
				const block = editor.getShape(id)
				if (!isAutoResizeBlock(block)) return
				// Stock leaves an empty frame alone. That preserves the useful manual
				// starting box until there is an actual child to fit.
				if (editor.getSortedChildIdsForParent(block.id).length === 0) return
				fitting.add(block.id)
				try {
					fitFrameToContent(editor, block.id, { padding: BLOCK_AUTO_RESIZE_PADDING_PX })
				} finally {
					// Store side effects may flush immediately after `editor.run` returns.
					// Retaining the marker through that microtask filters this fit's own
					// parent-and-child position writes, while still letting an outer
					// auto-fitting Block observe its resized inner child.
					queueMicrotask(() => fitting.delete(block.id))
				}
			}
			if (source === 'remote') editor.store.mergeRemoteChanges(fit)
			else editor.run(fit, { history: 'ignore' })
		}
		// A nested auto-sized Block can resize during the first pass and become a
		// different child bound for its outer auto-sized Block. Drain that derived
		// update on the next microtask, never recursively inside one operation.
		if (pending.size > 0) schedule()
	}
	const schedule = () => {
		if (queued || disposed) return
		queued = true
		queueMicrotask(settle)
	}
	const stopComplete = editor.sideEffects.registerOperationCompleteHandler(schedule)
	const onEvent = (info: TLEventInfo) => {
		// `event` fires after tldraw has handled the transition, so a release from
		// select.translating is already idle here. Cancel/interrupt cover Escape,
		// tool switches, and other stock ways of ending a transform.
		if (info.name === 'pointer_up' || info.name === 'cancel' || info.name === 'interrupt') {
			schedule()
		}
	}
	editor.on('event', onEvent)

	// A document may have loaded before this mount seam. Reconcile opt-in
	// records once, via remote semantics so opening a board does not create undo.
	for (const record of editor.store.allRecords()) {
		if (record.typeName !== 'shape') continue
		const shape = editor.getShape(record.id as TLShapeId)
		if (isAutoResizeBlock(shape)) pending.set(shape.id, 'remote')
	}
	schedule()

	return () => {
		disposed = true
		editor.off('event', onEvent)
		stopComplete()
		stopDelete()
		stopChange()
		stopCreate()
	}
}
