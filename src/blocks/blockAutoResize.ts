/**
 * Derived bounds for opt-in Expanded Blocks.
 *
 * tldraw already owns container membership and its `fitFrameToContent` helper;
 * this module only says when that stock operation should run. Keeping the
 * policy here avoids a second drag/reparent implementation and makes turning
 * auto-fit off an immediate return to ordinary stock resize handles.
 */
import {
	fitFrameToContent,
	isShapeId,
	type Editor,
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

type ResizeSource = 'user' | 'remote'

function isAutoResizeBlock(shape: TLShape | undefined): shape is BlockShape {
	return isExpandedBlockShape(shape) && shape.props.autoResize
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
		stopComplete()
		stopDelete()
		stopChange()
		stopCreate()
	}
}
