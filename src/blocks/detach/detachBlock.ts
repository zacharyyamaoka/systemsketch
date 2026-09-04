/**
 * Detach to primitives, and the way back.
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
 */
import { createShapeId, toRichText } from 'tldraw'
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
	getConnectionBindings,
	type ConnectionBinding,
} from '../connections/ConnectionBindingUtil'
import {
	getConnectionTerminals,
	type ConnectionShape,
} from '../connections/ConnectionShapeUtil'
import { detachBranchToPrimitives } from '../../branch/detachBranch'
import { isBranchShape } from '../../branch/branchModel'
import { primitivesForBlock } from './blockPrimitives'
import {
	DETACH_FORMAT_VERSION,
	detachMeta,
	detachedDelayPillArrowId,
	detachedDelayPillMeta,
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

	// Which dots detach filled: the ports a cable is welded to right now.
	const wiring = getBlockPortConnections(editor, block.id)
	const connectedPortIds = new Set(wiring.map((entry) => entry.ownPortId))
	// A detached Block is a loose stock rectangle and a stock group, not a
	// frame child. Keeping it beneath an Expanded Block / region would let that
	// ancestor clip its card and arrows before its ordinary z-order can help.
	// Walk every ancestor because a group may sit between the Block and a frame.
	const primitiveParentId = unframedPrimitiveParentId(editor, block.parentId)
	const blockPageOrigin = editor.getShapePageTransform(block).applyToPoint({ x: 0, y: 0 })
	const origin = pointInParentSpace(editor, primitiveParentId, blockPageOrigin)
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

	let detachedConnections = 0
	let groupId: TLShapeId | null = null
	const portGroupIds: TLShapeId[] = []
	editor.run(() => {
		// Stock primitives leave every frame-like ancestor. Their coordinates were
		// projected into `primitiveParentId` above, so their page pose is unchanged
		// while they become normal, independently stackable tldraw shapes.
		editor.createShapes(shapes.map((partial) => ({ ...partial, parentId: primitiveParentId })))

		for (const cable of cables) {
			if (!cable.connection || !cable.ownPoint) continue
			detachedConnections += rebuildCableAsArrow(editor, {
				block, cardId, cable, parentId: primitiveParentId,
			})
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

	return { groupId, portGroupIds, cardId, shapeIds, detachedConnections }
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

/** Rebuild one cable end as a stock arrow bound to the card. Returns 1 if it did. */
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
): number {
	const { block, cardId, cable, parentId } = input
	if (!cable.connection || !cable.ownPoint) return 0
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
	const localStart = pointInParentSpace(editor, parentId, start)
	const localEnd = pointInParentSpace(editor, parentId, end)
	const arrowId = createShapeId()
	editor.createShape({
		id: arrowId,
		type: 'arrow',
		parentId,
		x: localStart.x,
		y: localStart.y,
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
	const pillGroupId = createDetachedDelayPill(editor, {
		arrowId,
		parentId,
		connection: cable.connection as ConnectionShape,
		start: localStart,
		end: localEnd,
	})
	groupDetachedEdgeWithPill(editor, arrowId, pillGroupId)
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
	return 1
}

function dashForDetachedTemporal(temporal: ConnectionShape['props']['temporal']): 'solid' | 'dashed' | 'dotted' {
	if (temporal === 'async') return 'dashed'
	if (temporal === 'delayed') return 'dotted'
	return 'solid'
}

/** Convert a page point to the coordinate space used by children of `parentId`. */
function pointInParentSpace(
	editor: Editor,
	parentId: TLShape['parentId'],
	point: { x: number; y: number },
): { x: number; y: number } {
	const parent = editor.getShape(parentId)
	return parent ? editor.getPointInShapeSpace(parent, point) : point
}

/**
 * Return the closest normal parent outside every frame-like ancestor.
 *
 * Detached shapes are explicitly not children of Frames, Expanded Blocks,
 * Branches, Loops, or nested frame/group combinations: frames clip descendants
 * before z-order is considered. A normal group remains a valid parent unless
 * it itself sits beneath one of those frame-like containers.
 */
function unframedPrimitiveParentId(
	editor: Editor,
	parentId: TLShape['parentId'],
): TLShape['parentId'] {
	let result = parentId
	let parent = editor.getShape(parentId)
	while (parent) {
		if (editor.isShapeFrameLike(parent)) result = parent.parentId
		parent = editor.getShape(parent.parentId)
	}
	return result
}

/**
 * Stock tldraw has no inline delay pill. Lower it to the most literal stock
 * composition instead: an independent oval and text label beside a dotted
 * arrow. Both still render in a viewer that ignores every metadata key.
 */
function createDetachedDelayPill(
	editor: Editor,
	input: {
		arrowId: TLShapeId
		parentId: TLShape['parentId']
		connection: ConnectionShape
		start: { x: number; y: number }
		end: { x: number; y: number }
	},
): TLShapeId | null {
	const { arrowId, parentId, connection, start, end } = input
	if (connection.props.temporal !== 'delayed') return null
	const label = `z⁻¹${connection.props.delayValue ? ` = ${connection.props.delayValue}` : ''}`
	const fraction = Math.min(0.9, Math.max(0.1, connection.props.pillPosition))
	const point = {
		x: start.x + (end.x - start.x) * fraction,
		y: start.y + (end.y - start.y) * fraction,
	}
	const width = Math.max(54, Math.min(180, 20 + label.length * 9))
	const height = 26
	const pillId = createShapeId()
	const labelId = createShapeId()
	editor.createShapes([
		{
			id: pillId,
			type: 'geo',
			parentId,
			x: point.x - width / 2,
			y: point.y - height - 10,
			props: { geo: 'oval', w: width, h: height, color: 'grey', fill: 'semi', dash: 'solid', size: 's' },
		},
		{
			id: labelId,
			type: 'text',
			parentId,
			x: point.x - width / 2 + 8,
			y: point.y - height - 4,
			props: {
				richText: toRichText(label), autoSize: false, color: 'black', font: 'mono',
				scale: 0.68, size: 's', textAlign: 'middle', w: Math.max(1, (width - 16) / 0.68),
			},
		},
	])
	// A pill is a separate, ordinary stock group: its oval and label copy and
	// move as one object rather than becoming two loose decorations.
	const groupId = createShapeId()
	editor.groupShapes([pillId, labelId], { groupId, select: false })
	if (editor.getShape(groupId)) {
		editor.updateShape({ id: groupId, type: 'group', meta: detachedDelayPillMeta(arrowId) })
		return groupId
	}
	return null
}

/**
 * A delayed edge remains a stock group in its own right. The nested pill group
 * gives the `z⁻¹` oval and label their own edit/move unit; this outer group
 * makes normal stock selection, copy, and dragging take the arrow *and* that
 * independent pill together.
 */
function groupDetachedEdgeWithPill(
	editor: Editor,
	arrowId: TLShapeId,
	pillGroupId: TLShapeId | null,
): TLShapeId | null {
	if (!pillGroupId) return null
	const groupId = createShapeId()
	editor.groupShapes([arrowId, pillGroupId], { groupId, select: false })
	return editor.getShape(groupId) ? groupId : null
}

/** The direct stock edge group (if this arrow owns a delayed pill). */
function detachedEdgeGroupId(editor: Editor, arrowId: TLShapeId): TLShapeId | null {
	const arrow = editor.getShape(arrowId)
	if (!arrow) return null
	const parent = editor.getShape(arrow.parentId)
	if (!parent || parent.type !== 'group') return null
	const hasPill = editor.getSortedChildIdsForParent(parent.id)
		.some((childId) => detachedDelayPillArrowId(editor.getShape(childId)?.meta) === arrowId)
	return hasPill ? parent.id : null
}

/** Every selected semantic cable, including cables nested in selected groups. */
export function selectedConnectionIds(editor: Editor): TLShapeId[] {
	const found: TLShapeId[] = []
	const visit = (ids: readonly TLShapeId[]) => {
		for (const id of ids) {
			const shape = editor.getShape(id)
			if (!shape) continue
			if (shape.type === CONNECTION_SHAPE_TYPE) found.push(id)
			visit(editor.getSortedChildIdsForParent(id))
		}
	}
	visit(editor.getSelectedShapeIds())
	return [...new Set(found)]
}

/**
 * Detach selected cables without detaching either Block.
 *
 * Each result is an ordinary stock arrow with stock arrow bindings. Its
 * namespaced metadata carries only the finite paint stock arrows cannot name,
 * plus the connection record needed by the existing rebuild path.
 */
export function detachSelectedConnections(editor: Editor): TLShapeId[] {
	const connectionIds = selectedConnectionIds(editor)
	if (connectionIds.length === 0) return []
	// groupShapes is a stock editor command and is only available from the
	// select tool. Direct arrow detach can be invoked while a connection tool is
	// active, unlike Block detachment which already selects its composites.
	if (editor.getCurrentToolId() !== 'select') editor.setCurrentTool('select')
	editor.markHistoryStoppingPoint('detach arrows')
	const arrowIds: TLShapeId[] = []
	const selectionIds: TLShapeId[] = []
	editor.run(() => {
		for (const connectionId of connectionIds) {
			const connection = editor.getShape(connectionId)
			if (!connection || connection.type !== CONNECTION_SHAPE_TYPE) continue
			const arrowId = detachConnectionToArrow(editor, connection as ConnectionShape)
			if (arrowId) {
				arrowIds.push(arrowId)
				selectionIds.push(detachedEdgeGroupId(editor, arrowId) ?? arrowId)
			}
		}
		editor.setSelectedShapes(selectionIds)
	})
	return arrowIds
}

export function detachConnectionToArrow(
	editor: Editor,
	connection: ConnectionShape,
): TLShapeId | null {
	const terminals = getConnectionTerminals(editor, connection)
	const pageTransform = editor.getShapePageTransform(connection)
	const pagePoints = {
		start: pageTransform.applyToPoint(terminals.start),
		end: pageTransform.applyToPoint(terminals.end),
	}
	const bindings = getConnectionBindings(editor, connection)
	const ends: Partial<Record<ConnectionTerminal, DetachedConnectionEnd>> = {}
	for (const terminal of ['start', 'end'] as const) {
		const binding = bindings[terminal]
		if (binding) ends[terminal] = {
			portId: binding.props.portId,
			face: binding.props.face,
		}
	}

	const arrowId = createShapeId()
	const routing = connection.props.routing
	const primitiveParentId = unframedPrimitiveParentId(editor, connection.parentId)
	const localPoints = {
		start: pointInParentSpace(editor, primitiveParentId, pagePoints.start),
		end: pointInParentSpace(editor, primitiveParentId, pagePoints.end),
	}
	editor.createShape({
		id: arrowId,
		type: 'arrow',
		parentId: primitiveParentId,
		x: localPoints.start.x,
		y: localPoints.start.y,
		props: {
			start: { x: 0, y: 0 },
			end: {
				x: localPoints.end.x - localPoints.start.x,
				y: localPoints.end.y - localPoints.start.y,
			},
			kind: routing === 'elbow' ? 'elbow' : 'arc',
			bend: routing === 'curved' ? 32 : 0,
			color: 'grey',
			size: 's',
			dash: dashForDetachedTemporal(connection.props.temporal),
			arrowheadStart: 'none',
			arrowheadEnd: 'none',
		},
		meta: detachMeta({
			kind: 'connection',
			version: DETACH_FORMAT_VERSION,
			routing,
			temporal: connection.props.temporal,
			delayValue: connection.props.delayValue,
			pillPosition: connection.props.pillPosition,
			rebuildWithBlocks: false,
			ends,
		}),
	})
	const pillGroupId = createDetachedDelayPill(editor, {
		arrowId,
		parentId: primitiveParentId,
		connection,
		start: localPoints.start,
		end: localPoints.end,
	})
	groupDetachedEdgeWithPill(editor, arrowId, pillGroupId)

	for (const terminal of ['start', 'end'] as const) {
		const binding = bindings[terminal]
		const target = binding ? editor.getShape(binding.toId) : undefined
		if (!binding || !target) continue
		const bounds = editor.getShapeGeometry(target).bounds
		const local = editor.getShapePageTransform(target).clone().invert()
			.applyToPoint(pagePoints[terminal])
		editor.createBinding<TLArrowBinding>({
			type: 'arrow',
			fromId: arrowId,
			toId: target.id,
			props: {
				terminal,
				normalizedAnchor: {
					x: (local.x - bounds.x) / Math.max(1, bounds.width),
					y: (local.y - bounds.y) / Math.max(1, bounds.height),
				},
				isPrecise: true,
				isExact: true,
			},
		})
	}

	editor.deleteShape(connection.id)
	return arrowId
}

/**
 * Every Block in the current selection, including Blocks inside selected groups
 * and Blocks living inside a selected Expanded frame — selecting a frame and
 * asking for primitives means the whole nest, and tldraw's selection only ever
 * hands over the top level.
 */
export function selectedBlockIds(editor: Editor): TLShapeId[] {
	const found: TLShapeId[] = []
	const visit = (ids: readonly TLShapeId[]) => {
		for (const id of ids) {
			const shape = editor.getShape(id)
			if (!shape) continue
			// Parent before children: the frame detaches first, which reparents
			// its survivors out, and each child then detaches as itself.
			if (shape.type === BLOCK_SHAPE_TYPE) found.push(id)
			visit(editor.getSortedChildIdsForParent(id))
		}
	}
	visit(editor.getSelectedShapeIds())
	// A child can arrive twice — through its frame and through its own
	// selection entry. Once is what the sweep means.
	return [...new Set(found)]
}

/**
 * Every custom visual selected through the current tree. Ordering is imposed
 * by `detachPrimitives`; discovery only needs to include Branches, Blocks, and
 * loose semantic connections nested anywhere below the selection.
 */
export function selectedDetachableIds(editor: Editor): TLShapeId[] {
	const found: TLShapeId[] = []
	const visit = (ids: readonly TLShapeId[]) => {
		for (const id of ids) {
			const shape = editor.getShape(id)
			if (!shape) continue
			if (isBranchShape(shape) || isBlockShape(shape) || shape.type === CONNECTION_SHAPE_TYPE) found.push(id)
			visit(editor.getSortedChildIdsForParent(id))
		}
	}
	visit(editor.getSelectedShapeIds())
	return [...new Set(found)]
}

/**
 * Every Block on the current page, nesting included.
 *
 * What the `.tldr` export sweeps. Parent before child for the same reason the
 * selection sweep does: an Expanded frame detaches first, reparenting its
 * survivors out, and each child then detaches as itself.
 */
export function allBlockIds(editor: Editor): TLShapeId[] {
	const found: TLShapeId[] = []
	const visit = (ids: readonly TLShapeId[]) => {
		for (const id of ids) {
			if (editor.getShape(id)?.type === BLOCK_SHAPE_TYPE) found.push(id)
			visit(editor.getSortedChildIdsForParent(id))
		}
	}
	visit(editor.getSortedChildIdsForParent(editor.getCurrentPageId()))
	return [...new Set(found)]
}

/** All registered custom visuals on the page, nesting included. */
export function allDetachableIds(editor: Editor): TLShapeId[] {
	const found: TLShapeId[] = []
	const visit = (ids: readonly TLShapeId[]) => {
		for (const id of ids) {
			const shape = editor.getShape(id)
			if (!shape) continue
			if (isBranchShape(shape) || isBlockShape(shape) || shape.type === CONNECTION_SHAPE_TYPE) found.push(id)
			visit(editor.getSortedChildIdsForParent(id))
		}
	}
	visit(editor.getSortedChildIdsForParent(editor.getCurrentPageId()))
	return [...new Set(found)]
}

/** Detach every Block on the page in one undoable step. */
export function detachAllBlocks(editor: Editor): DetachResult[] {
	return detachBlocks(editor, allBlockIds(editor))
}

/** Detach every custom visual on the page, including Branch arm projections. */
export function detachAllPrimitives(editor: Editor): DetachResult[] {
	return detachPrimitives(editor, allDetachableIds(editor))
}

/** Detach every selected Block in one undoable step. */
export function detachSelectedBlocks(editor: Editor): DetachResult[] {
	return detachBlocks(editor, selectedBlockIds(editor))
}

/** The selection-scoped command exposed as "Detach to primitives". */
export function detachSelectedPrimitives(editor: Editor): DetachResult[] {
	return detachPrimitives(editor, selectedDetachableIds(editor))
}

function detachBlocks(editor: Editor, ids: readonly TLShapeId[]): DetachResult[] {
	if (ids.length === 0) return []
	// One mark for the whole sweep, and none inside it: a second stopping point
	// in the middle would split the undo into "some of the Blocks came back".
	editor.markHistoryStoppingPoint('detach to primitives')
	const results: DetachResult[] = []
	editor.run(() => {
		for (const id of ids) {
			const result = detachBlockToPrimitives(editor, id, { mark: false })
			if (result !== null) results.push(result)
		}
	})
	return results
}

function detachPrimitives(editor: Editor, ids: readonly TLShapeId[]): DetachResult[] {
	if (ids.length === 0) return []
	if (editor.getCurrentToolId() !== 'select') editor.setCurrentTool('select')
	editor.markHistoryStoppingPoint('detach to primitives')
	const results: DetachResult[] = []
	editor.run(() => {
		// Parent containers release their helpers first, then Blocks convert their
		// bound cables, and finally any surviving loose cable becomes a stock arrow.
		// Keeping connections last prevents an explicitly selected cable from
		// losing the reversible Block-detach metadata path.
		for (const id of ids) {
			const shape = editor.getShape(id)
			if (isBranchShape(shape)) {
				detachBranchToPrimitives(editor, id)
			}
		}
		for (const id of ids) {
			const shape = editor.getShape(id)
			if (!isBlockShape(shape)) continue
			const result = detachBlockToPrimitives(editor, id, { mark: false })
			if (result !== null) results.push(result)
		}
		for (const id of ids) {
			const shape = editor.getShape(id)
			if (shape?.type === CONNECTION_SHAPE_TYPE) detachConnectionToArrow(editor, shape as ConnectionShape)
		}
	})
	return results
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
				// The pill remains independently editable *inside* its stock edge
				// group. Drop the containing group as one unit so no oval/text
				// descendants survive when the semantic cable returns.
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
