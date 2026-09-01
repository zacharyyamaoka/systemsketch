import { createShapeId, type Editor } from 'tldraw'
import { BLOCK_SHAPE_TYPE, getDefaultBlockProps } from '../blockModel'
import { requestBlockInlineEdit } from '../inlineBlockEditing'
import { blockPresetProps, openBlockPicker } from './blockPicker'
import {
	createOrUpdateConnectionBinding,
	getConnectionBindings,
} from './ConnectionBindingUtil'
import { getLiveBlockPorts } from './blockPorts'
import { CONNECTION_SHAPE_TYPE } from './connectionModel'
import { getNextConnectionIndex } from './keepConnectionsAtBottom'
import type { ConnectionShape } from './ConnectionShapeUtil'

/** Clearance kept between the upstream Block and one spliced in after it. */
export const INSERTED_BLOCK_SPACING_PX = 40

/**
 * Splice a Block into the middle of an existing cable.
 *
 * The original cable is re-aimed at the new Block's input and a second cable
 * carries its old destination, so the two ends the user already wired stay
 * wired — inserting is an edit to the path, not a teardown. Anything that
 * cannot be completed bails to the mark, because a half-spliced cable is worse
 * than no splice.
 */
export function insertBlockWithinConnection(editor: Editor, connection: ConnectionShape): void {
	openBlockPicker(editor, {
		connectionId: connection.id,
		// The offer anchors to the midpoint of the cable it will split.
		terminal: 'end',
		anchor: { x: 0, y: 0 },
		onClose: () => undefined,
		onPick: (preset) => {
			const mark = editor.markHistoryStoppingPoint('insert Block within connection')
			const original = getConnectionBindings(editor, connection)
			if (!original.start || !original.end) return

			const startBounds = editor.getShapePageBounds(original.start.toId)
			const endBounds = editor.getShapePageBounds(original.end.toId)
			if (!startBounds || !endBounds) return

			// Sit in the gap between the two Blocks, clear of both. When the gap is
			// narrower than the new Block, centring it there spreads the unavoidable
			// overlap evenly instead of dumping all of it on the downstream Block —
			// and moving a Block the user placed would be a worse surprise than a
			// tight fit.
			const size = getDefaultBlockProps().views[preset.view]
			const centred = (startBounds.maxX + endBounds.minX - size.w) / 2
			const gapStart = startBounds.maxX + INSERTED_BLOCK_SPACING_PX
			const gapEnd = endBounds.minX - INSERTED_BLOCK_SPACING_PX - size.w
			const x = gapEnd >= gapStart
				? Math.min(Math.max(centred, gapStart), gapEnd)
				: centred
			const y = (startBounds.minY + endBounds.minY) / 2

			const blockId = createShapeId()
			editor.createShape({
				id: blockId,
				type: BLOCK_SHAPE_TYPE,
				x,
				y,
				props: blockPresetProps(preset, getDefaultBlockProps()),
			})

			const ports = getLiveBlockPorts(editor, blockId)
			const inlet = ports.find((port) => port.terminal === 'end' && !port.hidden && !port.inner)
			const outlet = ports.find((port) => port.terminal === 'start' && !port.hidden && !port.inner)
			if (!inlet || !outlet) {
				editor.bailToMark(mark)
				return
			}

			// Re-aim the original cable at the new Block, then carry its old
			// destination on a second one.
			createOrUpdateConnectionBinding(editor, connection.id, blockId, {
				portId: inlet.id,
				terminal: 'end',
			})

			const downstreamId = createShapeId()
			editor.createShape({
				id: downstreamId,
				type: CONNECTION_SHAPE_TYPE,
				index: getNextConnectionIndex(editor),
				props: { routing: connection.props.routing },
			})
			const wiredOut = createOrUpdateConnectionBinding(editor, downstreamId, blockId, {
				portId: outlet.id,
				terminal: 'start',
			})
			const wiredOn = createOrUpdateConnectionBinding(editor, downstreamId, original.end.toId, {
				portId: original.end.props.portId,
				terminal: 'end',
			})
			if (!wiredOut || !wiredOn) {
				editor.bailToMark(mark)
				return
			}

			editor.select(blockId)
			// Same rule as a drawn Block and a picked one: it arrives unnamed, and
			// naming it is the next thing anyone does.
			requestBlockInlineEdit(editor, blockId, { kind: 'title' })
		},
	})
}
