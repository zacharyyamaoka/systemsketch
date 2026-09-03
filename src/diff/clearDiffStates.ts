/**
 * Take the lens off.
 *
 * A `state` is something a projector or a linter said ABOUT a board, not
 * something the board is. The projector writes it into a derived, disposable
 * diff document and never into the working file — but a person can always
 * open that document, like it, and start editing, and at that moment the marks
 * are lying to them. This is the one action that ends that: it deletes the
 * ghosts, which never existed, and returns everything else to `normal`.
 *
 * It is deliberately a whole-document command rather than a selection one. A
 * half-cleared diff is worse than an uncleared one, because the marks that
 * survive look like the current truth.
 */
import type { Editor, TLShapeId } from 'tldraw'

import {
	clearBlockStateProps,
	hasAnyBlockState,
	isBlockShape,
	type BlockShape,
} from '../blocks/blockModel'
import { CONNECTION_SHAPE_TYPE } from '../blocks/connections/connectionModel'
import type { ConnectionShape } from '../blocks/connections/ConnectionShapeUtil'

export interface ClearDiffStatesOutcome {
	/** Ghost Blocks and ghost cables removed: they were marks, not content. */
	removed: number
	/** Blocks and cables returned to `normal`. */
	cleared: number
}

export function describeClearDiffStatesOutcome(outcome: ClearDiffStatesOutcome): string {
	if (outcome.removed === 0 && outcome.cleared === 0) return 'No diff marks on this board'
	const parts: string[] = []
	if (outcome.cleared) parts.push(`${outcome.cleared} object${outcome.cleared === 1 ? '' : 's'} cleared`)
	if (outcome.removed) parts.push(`${outcome.removed} ghost${outcome.removed === 1 ? '' : 's'} removed`)
	return `Diff marks cleared · ${parts.join(' · ')}`
}

/**
 * Every Block and cable in the document, whatever page or frame it sits in.
 *
 * Read straight off the store rather than off the current page: a lens is
 * never partial, and a diff document is exactly the kind of board whose marks
 * end up nested inside an Expanded Block.
 */
function statedShapes(editor: Editor): { blocks: BlockShape[]; cables: ConnectionShape[] } {
	const blocks: BlockShape[] = []
	const cables: ConnectionShape[] = []
	for (const record of editor.store.allRecords()) {
		if (record.typeName !== 'shape') continue
		if (isBlockShape(record)) blocks.push(record)
		else if (record.type === CONNECTION_SHAPE_TYPE) cables.push(record as ConnectionShape)
	}
	return { blocks, cables }
}

export function clearDiffStates(editor: Editor): ClearDiffStatesOutcome {
	const { blocks, cables } = statedShapes(editor)

	const ghosts: TLShapeId[] = [
		...blocks.filter((block) => block.props.state === 'removed').map((block) => block.id),
		...cables.filter((cable) => cable.props.state === 'removed').map((cable) => cable.id),
	]
	const blockUpdates = blocks
		.filter((block) => block.props.state !== 'removed' && hasAnyBlockState(block.props))
		.map((block) => ({
			id: block.id,
			type: block.type,
			props: clearBlockStateProps(block.props),
		}))
	const cableUpdates = cables
		.filter((cable) => cable.props.state !== 'removed' && (cable.props.state ?? 'normal') !== 'normal')
		.map((cable) => ({ id: cable.id, type: cable.type, props: { state: 'normal' as const } }))

	const outcome = {
		removed: ghosts.length,
		cleared: blockUpdates.length + cableUpdates.length,
	}
	if (outcome.removed === 0 && outcome.cleared === 0) return outcome

	editor.markHistoryStoppingPoint('clear diff marks')
	editor.run(() => {
		if (blockUpdates.length) editor.updateShapes(blockUpdates)
		if (cableUpdates.length) editor.updateShapes(cableUpdates)
		// Ghosts go last: a ghost cable's bindings die with it, and deleting a
		// ghost Block first would take its cables' endpoints with it.
		if (ghosts.length) editor.deleteShapes(ghosts)
	})
	return outcome
}

/** Whether anything on the board is currently wearing a lens. */
export function boardHasDiffStates(editor: Editor): boolean {
	const { blocks, cables } = statedShapes(editor)
	return blocks.some((block) => hasAnyBlockState(block.props))
		|| cables.some((cable) => (cable.props.state ?? 'normal') !== 'normal')
}
