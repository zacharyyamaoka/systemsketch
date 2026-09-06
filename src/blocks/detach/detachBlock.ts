/**
 * Detach one Block to primitives, and the way back.
 *
 * This is the operation that decides whether a composite shape is a good
 * citizen or a trap. A Block is one custom shape: it renders through our code,
 * it has our style rules, and only SystemSketch knows what its interior means.
 * Detaching transfers authority the other way — the Block becomes ordinary
 * tldraw primitives that upstream owns, with the full style panel, the normal
 * resize handles, and no dependency on us at all.
 *
 * The contract, which is also what the menu item promises:
 *
 *   keeps    the look, the page position, and the cables as arrows
 *   gives up Block behaviour, semantic port identity, and live layout
 *
 * What this adds over the pyblocks donor is the second half of the sentence in
 * `FR - Block, Ports & Edges Primitive`: **the group remembers**. The primitives
 * are grouped, and the group's `meta` carries the whole Block record, so the
 * transfer is a door rather than a cliff — `rebuildDetachedBlocks` reads it
 * back. That is also the mechanism a future `.tldr` export needs: detach
 * everything, save, and a `.tldr` reopened in SystemSketch can become a
 * `.systemsketch` again by reading the same metadata.
 *
 * Ungrouping is still the rest of the way out. `Ctrl+Shift+G` discards the
 * group and its `meta` with it, which is the honest meaning of taking the
 * thing apart by hand.
 *
 * This module owns exactly the Block kind's reduction and its rebuild. The
 * cross-kind sweep — which shapes participate, and in which order — lives in
 * `src/detach/`; the cable-to-arrow machinery lives with the Connection kind
 * in `../connections/detachConnection.ts`.
 */
import { createShapeId } from 'tldraw'
import type {
	Editor,
	TLArrowBinding,
	TLShape,
	TLShapeId,
} from 'tldraw'

import {
	BLOCK_SHAPE_TYPE,
	isBlockShape,
	type BlockShape,
	type BlockShapeProps,
} from '../blockModel'
import { layoutBlock } from '../layoutBlock'
import {
	getBlockConnectionPortPagePoint,
	getBlockConnectionPorts,
	getBlockPortConnections,
} from '../connections/blockPorts'
import {
	CONNECTION_BINDING_TYPE,
	CONNECTION_SHAPE_TYPE,
	type ConnectionRoutingKind,
	type ConnectionTerminal,
} from '../connections/connectionModel'
import {
	type ConnectionBinding,
} from '../connections/ConnectionBindingUtil'
import {
	type ConnectionShape,
} from '../connections/ConnectionShapeUtil'
import {
	createDetachedDelayPill,
	createFrozenElbowLine,
	dashForDetachedTemporal,
	detachedArrowPortIds,
	detachedEdgeGroupId,
	frozenElbowPolyline,
	groupDetachedEdgeWithPill,
} from '../connections/detachConnection'
import { primitivesForBlock } from './blockPrimitives'
import {
	pointInPrimitiveParentSpace,
	unframedPrimitiveParentId,
} from './primitiveSpace'
import {
	DETACH_FORMAT_VERSION,
	detachMeta,
	readDetachedBlock,
	readDetachedConnection,
	isDetachedCard,
	type DetachedConnectionEnd,
} from './detachModel'

export interface DetachResult {
	/** The group that took the Block's place — the thing that remembers. */
	groupId: TLShapeId | null
	/** Stock groups nested inside the Block group, one per non-empty port row. */
	portGroupIds: TLShapeId[]
	/** The rectangle inside it that stood where the Block stood. */
	cardId: TLShapeId
	/** Every primitive created, card first. */
	shapeIds: TLShapeId[]
	/** Cables that became stock arrows. */
	detachedConnections: number
	/**
	 * Outermost record of each cable this Block lowered itself — the edge
	 * group when a pill or frozen line rides along, else the arrow. An owning
	 * composite adopts these alongside the Block's own group.
	 */
	edgeRootIds: TLShapeId[]
}

/* -------------------------------------------------------------------------- */
/*                                   detach                                    */
/* -------------------------------------------------------------------------- */

/**
 * Replace one Block with the grouped primitives that look like it.
 *
 * Runs inside a single history stopping point, so one Ctrl+Z puts the Block
 * back — a detach that undid in eleven steps would not be a usable escape hatch.
 */
export function detachBlockToPrimitives(
	editor: Editor,
	blockId: TLShapeId,
	options: { mark?: boolean } = {},
): DetachResult | null {
	const block = editor.getShape(blockId)
	if (!isBlockShape(block)) return null

	// Which dots detach filled: semantic cables and an Arrow created earlier in
	// this same selection sweep both count. The first Block replaces the cable
	// before the second Block is lowered, so reading only the semantic cache
	// would erase the second endpoint's connected core and leave its port row
	// ungrouped.
	const wiring = getBlockPortConnections(editor, block.id)
	const connectedPortIds = new Set([
		...wiring.map((entry) => entry.ownPortId),
		...detachedArrowPortIds(editor, block.id),
	])
	// A detached Block is a loose stock rectangle and a stock group, not a
	// frame child. Keeping it beneath an Expanded Block / region would let that
	// ancestor clip its card and arrows before its ordinary z-order can help.
	// Walk every ancestor because a group may sit between the Block and a frame.
	const primitiveParentId = unframedPrimitiveParentId(editor, block.parentId)
	const blockPageOrigin = editor.getShapePageTransform(block).applyToPoint({ x: 0, y: 0 })
	const origin = pointInPrimitiveParentSpace(editor, primitiveParentId, blockPageOrigin)
	const { shapes, cardId, portRows } = primitivesWithMeta(block, connectedPortIds, origin)
	const shapeIds = shapes.map((partial) => partial.id as TLShapeId)

	// Everything a cable needs to come back, read while the cable still exists.
	const cables = wiring.map((entry) => ({
		entry,
		connection: editor.getShape(entry.connectionId),
		ownPoint: getBlockConnectionPortPagePoint(editor, block.id, entry.ownPortId),
		otherPoint: getBlockConnectionPortPagePoint(
			editor, entry.connectedShapeId, entry.connectedPortId,
		),
	}))

	// `editor.groupShapes` returns early — silently, with no error — unless the
	// select tool is active. Detaching from the context menu while the Block
	// tool is armed would otherwise leave a heap of loose primitives, and
	// nothing would say so.
	if (editor.getCurrentToolId() !== 'select') editor.setCurrentTool('select')

	if (options.mark !== false) editor.markHistoryStoppingPoint('detach to primitives')

	const edgeRootIds: TLShapeId[] = []
	let groupId: TLShapeId | null = null
	const portGroupIds: TLShapeId[] = []
	editor.run(() => {
		// Stock primitives leave every frame-like ancestor. Their coordinates were
		// projected into `primitiveParentId` above, so their page pose is unchanged
		// while they become normal, independently stackable tldraw shapes.
		editor.createShapes(shapes.map((partial) => ({ ...partial, parentId: primitiveParentId })))

		for (const cable of cables) {
			if (!cable.connection || !cable.ownPoint) continue
			const edgeRootId = rebuildCableAsArrow(editor, {
				block, cardId, cable, parentId: primitiveParentId,
			})
			if (edgeRootId !== null) edgeRootIds.push(edgeRootId)
		}

		// An arrow left by an EARLIER detach in this sweep still points at this
		// Block: the cable it replaced is gone, so the wiring table above no
		// longer mentions it, and deleting the Block would take the binding with
		// it. Transfer it to the card — same anchor, same pixel. Without this a
		// two-Block sweep produces an arrow with one loose end, and the pair can
		// never be rebuilt into a cable because only one end resolves.
		for (const binding of editor.getBindingsToShape<TLArrowBinding>(block.id, 'arrow')) {
			editor.createBinding<TLArrowBinding>({
				type: 'arrow',
				fromId: binding.fromId,
				toId: cardId,
				props: { ...binding.props },
			})
			editor.deleteBinding(binding.id)
		}

		// An Expanded frame's children are real shapes, not part of its look, and
		// deleting the Block deletes every descendant. Hand the survivors to the
		// ordinary primitive parent first; page positions are preserved.
		const childIds = editor.getSortedChildIdsForParent(block.id)
		if (childIds.length > 0) editor.reparentShapes([...childIds], primitiveParentId)

		editor.deleteShape(block.id)

		// A port row is its own stock group inside the larger detached Block:
		// circle, name, type and default value move as one editable unit. tldraw
		// deliberately refuses one-child groups, so a completely anonymous row
		// remains its single circle until there is another visible part to group.
		const nestedIds = new Set<TLShapeId>()
		for (const row of portRows) {
			if (row.shapeIds.length <= 1) continue
			const rowGroupId = createShapeId()
			editor.groupShapes(row.shapeIds, { groupId: rowGroupId, select: false })
			if (!editor.getShape(rowGroupId)) continue
			portGroupIds.push(rowGroupId)
			for (const id of row.shapeIds) nestedIds.add(id)
		}

		// Grouping is what makes the result still feel like "the thing you
		// detached" — one click selects it, one drag moves it — and it is the
		// shape that carries the record. Nested port children are replaced by
		// their row-group ids at this level; grouping both would flatten them.
		const topLevelIds = [
			...shapeIds.filter((id) => !nestedIds.has(id)),
			...portGroupIds,
		]
		editor.setSelectedShapes(topLevelIds)
		if (topLevelIds.length > 1) {
			const blockGroupId = createShapeId()
			editor.groupShapes(topLevelIds, { groupId: blockGroupId })
			if (editor.getShape(blockGroupId)) groupId = blockGroupId
		}
	})

	if (groupId !== null) {
		editor.updateShape({
			id: groupId,
			type: 'group',
			meta: detachMeta({
				kind: 'block',
				version: DETACH_FORMAT_VERSION,
				props: block.props,
			}),
		})
	} else {
		// tldraw deliberately refuses to group one shape. A blank Simple Block
		// can detach to only its card, so let that card carry the full record
		// itself; rebuildDetachedBlocks already accepts any selected shape with
		// block metadata and uses its own bounds when there is no child card.
		editor.updateShape({
			id: cardId,
			type: 'geo',
			meta: detachMeta({
				kind: 'block',
				version: DETACH_FORMAT_VERSION,
				props: block.props,
			}),
		})
	}

	return {
		groupId,
		portGroupIds,
		cardId,
		shapeIds,
		detachedConnections: edgeRootIds.length,
		edgeRootIds,
	}
}

function primitivesWithMeta(
	block: BlockShape,
	connectedPortIds: ReadonlySet<string>,
	origin: { x: number; y: number },
) {
	const built = primitivesForBlock(block.props, origin, connectedPortIds)
	// The card is marked so a rebuild can find the anchor inside the group
	// without storing an id — ids are re-minted by copy, paste and duplicate,
	// and `meta` is not.
	built.shapes[0] = {
		...built.shapes[0],
		meta: {
			...built.shapes[0].meta,
			...detachMeta({ kind: 'block-card', version: DETACH_FORMAT_VERSION }),
		},
	}
	return built
}

/**
 * Rebuild one cable end as a stock arrow bound to the card. Returns the
 * outermost created record — the edge group when a pill or frozen line rides
 * along, else the arrow — or null when the cable could not be lowered.
 */
function rebuildCableAsArrow(
	editor: Editor,
	input: {
		block: BlockShape
		cardId: TLShapeId
		parentId: TLShape['parentId']
		cable: {
			entry: ReturnType<typeof getBlockPortConnections>[number]
			connection: TLShape | undefined
			ownPoint: { x: number; y: number } | null
			otherPoint: { x: number; y: number } | null
		}
	},
): TLShapeId | null {
	const { block, cardId, cable, parentId } = input
	if (!cable.connection || !cable.ownPoint) return null
	const layout = layoutBlock(block.props)
	const ownPort = getBlockConnectionPorts(block.props, { includeHidden: true })
		.find((port) => port.id === cable.entry.ownPortId)
	const ownAnchor = ownPort
		? { x: ownPort.x / Math.max(1, layout.width), y: ownPort.y / Math.max(1, layout.height) }
		: { x: 0.5, y: 0.5 }

	const otherShape = editor.getShape(cable.entry.connectedShapeId)
	const otherPoint = cable.otherPoint ?? { x: cable.ownPoint.x + 100, y: cable.ownPoint.y }

	const ownTerminal = cable.entry.terminal
	const start = ownTerminal === 'start' ? cable.ownPoint : otherPoint
	const end = ownTerminal === 'start' ? otherPoint : cable.ownPoint

	const ends: Partial<Record<ConnectionTerminal, DetachedConnectionEnd>> = {
		[ownTerminal]: { portId: cable.entry.ownPortId, face: cable.entry.ownFace },
	}
	if (otherShape) {
		ends[ownTerminal === 'start' ? 'end' : 'start'] = {
			portId: cable.entry.connectedPortId,
			face: cable.entry.connectedFace,
		}
	}

	const routing = (cable.connection.props as { routing?: ConnectionRoutingKind }).routing ?? 'elbow'
	const localStart = pointInPrimitiveParentSpace(editor, parentId, start)
	const localEnd = pointInPrimitiveParentSpace(editor, parentId, end)
	const arrowId = createShapeId()
	const frozenPath = frozenElbowPolyline(editor, cable.connection as ConnectionShape, parentId)
	editor.createShape({
		id: arrowId,
		type: 'arrow',
		parentId,
		x: localStart.x,
		y: localStart.y,
		opacity: frozenPath ? 0 : 1,
		props: {
			start: { x: 0, y: 0 },
			end: { x: localEnd.x - localStart.x, y: localEnd.y - localStart.y },
			kind: routing === 'elbow' ? 'elbow' : 'arc',
			bend: routing === 'curved' ? 32 : 0,
			color: 'grey',
			size: 's',
			dash: dashForDetachedTemporal((cable.connection as ConnectionShape).props.temporal),
			// A data edge is drawn as a plain run between two dots — no heads.
			// Detach keeps the look, so the arrow that replaces it wears none
			// either; direction lives in the record, not in a glyph the Block
			// never drew.
			arrowheadStart: 'none',
			arrowheadEnd: 'none',
		},
		meta: detachMeta({
			kind: 'connection',
			version: DETACH_FORMAT_VERSION,
			routing,
			temporal: (cable.connection as ConnectionShape).props.temporal,
			delayValue: (cable.connection as ConnectionShape).props.delayValue,
			pillPosition: (cable.connection as ConnectionShape).props.pillPosition,
			rebuildWithBlocks: true,
			ends,
		}),
	})
	const lineId = frozenPath
		? createFrozenElbowLine(editor, {
			parentId,
			points: frozenPath,
			connection: cable.connection as ConnectionShape,
			ownerArrowId: arrowId,
		})
		: null
	const pillGroupId = createDetachedDelayPill(editor, {
		arrowId,
		parentId,
		connection: cable.connection as ConnectionShape,
		start: localStart,
		end: localEnd,
		path: frozenPath ?? undefined,
	})
	const edgeGroupId = groupDetachedEdgeWithPill(editor, arrowId, pillGroupId, lineId ? [lineId] : [])
	editor.createBinding<TLArrowBinding>({
		type: 'arrow',
		fromId: arrowId,
		toId: cardId,
		props: { terminal: ownTerminal, normalizedAnchor: ownAnchor, isPrecise: true, isExact: true },
	})

	// The far end keeps whatever it was attached to: another Block still holding
	// its semantics, or a card from an earlier detach in the same sweep.
	if (otherShape) {
		const otherBounds = editor.getShapeGeometry(otherShape).bounds
		const otherLocal = editor.getShapePageTransform(otherShape).clone().invert()
			.applyToPoint(otherPoint)
		editor.createBinding<TLArrowBinding>({
			type: 'arrow',
			fromId: arrowId,
			toId: otherShape.id,
			props: {
				terminal: ownTerminal === 'start' ? 'end' : 'start',
				normalizedAnchor: {
					x: otherLocal.x / Math.max(1, otherBounds.width),
					y: otherLocal.y / Math.max(1, otherBounds.height),
				},
				isPrecise: true,
				isExact: true,
			},
		})
	}

	editor.deleteShape(cable.connection.id)
	return edgeGroupId ?? arrowId
}

/* -------------------------------------------------------------------------- */
/*                                   rebuild                                   */
/* -------------------------------------------------------------------------- */

export interface RebuildResult {
	blockIds: TLShapeId[]
	/** Arrows that became semantic cables again. */
	rebuiltConnections: number
}

/** Groups in the selection that remember a Block, nested ones included. */
export function selectedDetachedGroupIds(editor: Editor): TLShapeId[] {
	const found: TLShapeId[] = []
	const visit = (ids: readonly TLShapeId[]) => {
		for (const id of ids) {
			const shape = editor.getShape(id)
			if (!shape) continue
			if (readDetachedBlock(shape.meta)) {
				found.push(id)
				// A remembered group's children are its own primitives; a Block
				// nested deeper is not something this group speaks for.
				continue
			}
			visit(editor.getSortedChildIdsForParent(id))
		}
	}
	visit(editor.getSelectedShapeIds())
	return [...new Set(found)]
}

function cardIdWithin(editor: Editor, groupId: TLShapeId): TLShapeId | null {
	for (const id of editor.getSortedChildIdsForParent(groupId)) {
		const shape = editor.getShape(id)
		if (shape && isDetachedCard(shape.meta)) return id
	}
	return null
}

/**
 * Put the Blocks back from what their groups remember.
 *
 * Position and size come from where the group *is now*, not from the record:
 * a detached group that was moved or resized should rebuild where the user left
 * it, exactly as dragging a Block's own resize handle would have done. Only the
 * semantics come from `meta`.
 */
export function rebuildSelectedBlocks(editor: Editor): RebuildResult {
	const groupIds = selectedDetachedGroupIds(editor)
	if (groupIds.length === 0) return { blockIds: [], rebuiltConnections: 0 }

	// Read every arrow that remembers a cable BEFORE anything is deleted: the
	// bindings that say which card each end held die with the card.
	const arrows = editor.getCurrentPageShapes()
		.filter((shape) => {
			const record = shape.type === 'arrow' ? readDetachedConnection(shape.meta) : null
			return record?.rebuildWithBlocks === true
		})
		.map((shape) => ({
			id: shape.id,
			record: readDetachedConnection(shape.meta)!,
			boundTo: Object.fromEntries(
				editor.getBindingsFromShape<TLArrowBinding>(shape.id, 'arrow')
					.map((binding) => [binding.props.terminal, binding.toId]),
			) as Partial<Record<ConnectionTerminal, TLShapeId>>,
		}))

	const blockIds: TLShapeId[] = []
	/** Old card → the Block that replaced its group. */
	const replaced = new Map<TLShapeId, TLShapeId>()
	let rebuiltConnections = 0

	editor.markHistoryStoppingPoint('rebuild from primitives')
	editor.run(() => {
		for (const groupId of groupIds) {
			const group = editor.getShape(groupId)
			const record = group ? readDetachedBlock(group.meta) : null
			if (!group || !record) continue
			const bounds = editor.getShapePageBounds(groupId)
			if (!bounds) continue
			const cardId = cardIdWithin(editor, groupId)

			const blockId = createShapeId()
			const props = withBox(record.props, bounds.width, bounds.height)
			editor.createShape({
				id: blockId,
				type: BLOCK_SHAPE_TYPE,
				parentId: group.parentId,
				x: bounds.x,
				y: bounds.y,
				props,
			})
			blockIds.push(blockId)
			if (cardId) replaced.set(cardId, blockId)
			editor.deleteShape(groupId)
		}

		// An end is home if the group it pointed at just became a Block — or if it
		// never left, because only one side of the cable was ever detached. That
		// second case is the common one: detaching a single Block out of a wired
		// pair leaves the far end bound to a Block that is still a Block.
		const resolveEnd = (id: TLShapeId | undefined): TLShapeId | undefined => {
			if (!id) return undefined
			const rebuilt = replaced.get(id)
			if (rebuilt) return rebuilt
			return isBlockShape(editor.getShape(id)) ? id : undefined
		}

		for (const arrow of arrows) {
			const startBlock = resolveEnd(arrow.boundTo.start)
			const endBlock = resolveEnd(arrow.boundTo.end)
			const startEnd = arrow.record.ends.start
			const endEnd = arrow.record.ends.end
			// Both ends have to come home before this is a cable again. One end
			// still pointing at loose primitives is an arrow, and stays one.
			if (!startBlock || !endBlock || !startEnd || !endEnd) continue

			const connectionId = createShapeId()
			const startPoint = getBlockConnectionPortPagePoint(editor, startBlock, startEnd.portId)
			const endPoint = getBlockConnectionPortPagePoint(editor, endBlock, endEnd.portId)
			if (!startPoint || !endPoint) continue
			editor.createShape({
				id: connectionId,
				type: CONNECTION_SHAPE_TYPE,
				x: startPoint.x,
				y: startPoint.y,
				props: {
					start: { x: 0, y: 0 },
					end: { x: endPoint.x - startPoint.x, y: endPoint.y - startPoint.y },
					routing: arrow.record.routing,
					temporal: arrow.record.temporal,
					delayValue: arrow.record.delayValue,
					pillPosition: arrow.record.pillPosition,
				},
			})
				for (const [terminal, blockId, end] of [
				['start', startBlock, startEnd] as const,
				['end', endBlock, endEnd] as const,
				]) {
				editor.createBinding<ConnectionBinding>({
					type: CONNECTION_BINDING_TYPE,
					fromId: connectionId,
					toId: blockId,
					props: { portId: end.portId, terminal, face: end.face },
				})
				}
				// The pill and an exact frozen Line remain independently editable
				// inside the stock edge group. Drop the containing group as one unit
				// so no visual survivors remain when the semantic cable returns.
				editor.deleteShape(detachedEdgeGroupId(editor, arrow.id) ?? arrow.id)
			rebuiltConnections += 1
		}

		editor.setSelectedShapes(blockIds)
	})

	return { blockIds, rebuiltConnections }
}

/**
 * The record's box, replaced by the box the group actually occupies.
 *
 * The remembered per-view sizes move with it, so switching back to Port after a
 * rebuild does not snap to a size the user never chose.
 */
function withBox(props: BlockShapeProps, w: number, h: number): BlockShapeProps {
	return {
		...props,
		w,
		h,
		views: { ...props.views, [props.view]: { w, h } },
	}
}
