/**
 * Lower one semantic cable to a stock arrow, and the finite paint that rides
 * with it — a frozen elbow polyline when the authored route exceeds a stock
 * arrow's one bend, and the `z⁻¹` pill beside a delayed edge.
 *
 * This is the Connection kind's canonical reduction. The Block's own cable
 * lowering (`rebuildCableAsArrow`) composes these same helpers but binds each
 * arrow port-precisely to the card that replaces the Block; this module's
 * `detachConnectionToArrow` is the plain form that binds to whatever live
 * shape each end reaches.
 */
import { createShapeId, getIndexAbove, toRichText } from 'tldraw'
import type {
	Editor,
	TLArrowBinding,
	TLShape,
	TLShapeId,
} from 'tldraw'

import {
	DETACH_FORMAT_VERSION,
	detachMeta,
	detachedDelayPillArrowId,
	detachedDelayPillMeta,
	readDetachedConnection,
	type DetachedConnectionEnd,
} from '../detach/detachModel'
import {
	pointInPrimitiveParentSpace,
	unframedPrimitiveParentId,
} from '../detach/primitiveSpace'
import {
	CONNECTION_SHAPE_TYPE,
	type ConnectionRoutingKind,
	type ConnectionTerminal,
} from './connectionModel'
import {
	getConnectionBindings,
} from './ConnectionBindingUtil'
import {
	getConnectionElbowRoute,
	getConnectionTerminals,
	type ConnectionShape,
} from './ConnectionShapeUtil'

export function dashForDetachedTemporal(
	temporal: ConnectionShape['props']['temporal'],
): 'solid' | 'dashed' | 'dotted' {
	if (temporal === 'async') return 'dashed'
	if (temporal === 'delayed') return 'dotted'
	return 'solid'
}

type Point = { x: number; y: number }

/**
 * A stock Arrow stores one elbow scalar, while a stock Line stores every point
 * of a polyline. Preserve the latter whenever the authored connection needs
 * more than that one stock degree of freedom. The returned points are already
 * in the eventual primitive parent's coordinate space.
 */
export function frozenElbowPolyline(
	editor: Editor,
	connection: ConnectionShape,
	parentId: TLShape['parentId'],
): Point[] | null {
	if (connection.props.routing !== 'elbow') return null
	const route = getConnectionElbowRoute(editor, connection)
	// WHY: an automatic router can temporarily draw several orthogonal rails
	// around nearby geometry, but that is still a normal elbow as far as the
	// user is concerned. Preserve the editable stock Arrow in that case. A Line
	// is reserved for route data the user actually authored—explicit corners or
	// pins—which a one-midpoint stock Arrow cannot store faithfully.
	const mustFreeze = connection.props.elbowRoute !== null
		|| connection.props.pins.length > 0
	if (!mustFreeze || route.points.length < 2) return null
	const transform = editor.getShapePageTransform(connection)
	return route.points.map((point) => pointInPrimitiveParentSpace(editor, parentId, transform.applyToPoint(point)))
}

/** Materialise an arbitrary orthogonal route as one native stock Line. */
export function createFrozenElbowLine(
	editor: Editor,
	input: {
		parentId: TLShape['parentId']
		points: readonly Point[]
		connection: ConnectionShape
		ownerArrowId: TLShapeId
	},
): TLShapeId {
	const { parentId, points, connection, ownerArrowId } = input
	const lineId = createShapeId()
	const origin = points[0]
	let pointIndex = 'a1' as never
	const stockPoints: Record<string, { id: string; index: never; x: number; y: number }> = {}
	for (const [ordinal, point] of points.entries()) {
		const id = `p${ordinal + 1}`
		stockPoints[id] = {
			id,
			index: pointIndex,
			x: point.x - origin.x,
			y: point.y - origin.y,
		}
		pointIndex = getIndexAbove(pointIndex) as never
	}
	editor.createShape({
		id: lineId,
		type: 'line',
		parentId,
		x: origin.x,
		y: origin.y,
		props: {
			points: stockPoints,
			spline: 'line',
			color: 'grey',
			size: 's',
			dash: dashForDetachedTemporal(connection.props.temporal),
			scale: 1,
		},
		// This marker is only for SystemSketch cleanup if the invisible bound
		// Arrow is rebuilt. Stock tldraw needs none of it to draw the path.
		meta: {
			systemSketch: {
				kind: 'connection-polyline',
				version: DETACH_FORMAT_VERSION,
				ownerArrowId,
			},
		},
	})
	return lineId
}

export function detachedPolylineOwnerArrowId(meta: unknown): TLShapeId | null {
	if (!meta || typeof meta !== 'object') return null
	const record = (meta as { systemSketch?: unknown }).systemSketch
	if (!record || typeof record !== 'object') return null
	const candidate = record as { kind?: unknown; ownerArrowId?: unknown }
	return candidate.kind === 'connection-polyline' && typeof candidate.ownerArrowId === 'string'
		? candidate.ownerArrowId as TLShapeId
		: null
}

/**
 * Stock tldraw has no inline delay pill. Lower it to the most literal stock
 * composition instead: an independent oval and text label beside a dotted
 * arrow. Both still render in a viewer that ignores every metadata key.
 */
export function createDetachedDelayPill(
	editor: Editor,
	input: {
		arrowId: TLShapeId
		parentId: TLShape['parentId']
		connection: ConnectionShape
		start: { x: number; y: number }
		end: { x: number; y: number }
		/** Exact frozen polyline, when a stock Arrow cannot represent the route. */
		path?: readonly Point[]
	},
): TLShapeId | null {
	const { arrowId, parentId, connection, start, end, path } = input
	if (connection.props.temporal !== 'delayed') return null
	const label = `z⁻¹${connection.props.delayValue ? ` = ${connection.props.delayValue}` : ''}`
	const fraction = Math.min(0.9, Math.max(0.1, connection.props.pillPosition))
	const point = path && path.length >= 2
		? pointAtPolylineFraction(path, fraction)
		: {
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
				richText: toRichText(label), autoSize: false, color: 'black', font: 'sans',
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

function pointAtPolylineFraction(points: readonly Point[], fraction: number): Point {
	const lengths = points.slice(1).map((point, index) => Math.hypot(
		point.x - points[index].x,
		point.y - points[index].y,
	))
	const total = lengths.reduce((sum, length) => sum + length, 0)
	if (total <= 0) return points[0]
	let remaining = total * fraction
	for (let index = 0; index < lengths.length; index += 1) {
		if (remaining <= lengths[index]) {
			const start = points[index]
			const end = points[index + 1]
			const t = remaining / Math.max(lengths[index], 1)
			return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t }
		}
		remaining -= lengths[index]
	}
	return points[points.length - 1]
}

/**
 * A delayed edge remains a stock group in its own right. The nested pill group
 * gives the `z⁻¹` oval and label their own edit/move unit; this outer group
 * makes normal stock selection, copy, and dragging take the arrow *and* that
 * independent pill together.
 */
export function groupDetachedEdgeWithPill(
	editor: Editor,
	arrowId: TLShapeId,
	pillGroupId: TLShapeId | null,
	visualIds: readonly TLShapeId[] = [],
): TLShapeId | null {
	const members = [arrowId, ...visualIds, ...(pillGroupId ? [pillGroupId] : [])]
	if (members.length < 2) return null
	const groupId = createShapeId()
	editor.groupShapes(members, { groupId, select: false })
	return editor.getShape(groupId) ? groupId : null
}

/** The direct stock edge group (if this arrow owns a delayed pill or frozen line). */
export function detachedEdgeGroupId(editor: Editor, arrowId: TLShapeId): TLShapeId | null {
	const arrow = editor.getShape(arrowId)
	if (!arrow) return null
	const parent = editor.getShape(arrow.parentId)
	if (!parent || parent.type !== 'group') return null
	const childIds = editor.getSortedChildIdsForParent(parent.id)
	const hasPill = childIds.some((childId) => detachedDelayPillArrowId(editor.getShape(childId)?.meta) === arrowId)
	const hasFrozenPolyline = childIds.some((childId) => detachedPolylineOwnerArrowId(editor.getShape(childId)?.meta) === arrowId)
	return hasPill || hasFrozenPolyline ? parent.id : null
}

/**
 * A preceding detach in a multi-selection has already turned a semantic cable
 * into a stock Arrow. Its binding and detach record still say exactly which
 * live port it reaches, and that is enough to preserve the visible filled
 * port core while this endpoint is lowered a moment later.
 */
export function detachedArrowPortIds(editor: Editor, shapeId: TLShapeId): string[] {
	const portIds: string[] = []
	for (const binding of editor.getBindingsToShape<TLArrowBinding>(shapeId, 'arrow')) {
		const arrow = editor.getShape(binding.fromId)
		if (!arrow || arrow.type !== 'arrow') continue
		const record = readDetachedConnection(arrow.meta)
		const end = record?.ends[binding.props.terminal]
		if (end?.portId) portIds.push(end.portId)
	}
	return portIds
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
		start: pointInPrimitiveParentSpace(editor, primitiveParentId, pagePoints.start),
		end: pointInPrimitiveParentSpace(editor, primitiveParentId, pagePoints.end),
	}
	const frozenPath = frozenElbowPolyline(editor, connection, primitiveParentId)
	editor.createShape({
		id: arrowId,
		type: 'arrow',
		parentId: primitiveParentId,
		x: localPoints.start.x,
		y: localPoints.start.y,
		opacity: frozenPath ? 0 : 1,
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
	// Call the router exactly once for the visual decision: pins, authored
	// corners, and automatic routes with several bends become a native stock
	// Line. The zero-opacity Arrow above remains solely as stock binding/rebuild
	// data; the stock viewer paints the Line, not a degraded reroute.
	const lineId = frozenPath
		? createFrozenElbowLine(editor, { parentId: primitiveParentId, points: frozenPath, connection, ownerArrowId: arrowId })
		: null
	const pillGroupId = createDetachedDelayPill(editor, {
		arrowId,
		parentId: primitiveParentId,
		connection,
		start: localPoints.start,
		end: localPoints.end,
		path: frozenPath ?? undefined,
	})
	groupDetachedEdgeWithPill(editor, arrowId, pillGroupId, lineId ? [lineId] : [])

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

/** Endpoint shape ids a cable is semantically bound to, for claim resolution. */
export function connectionEndpointIds(editor: Editor, connection: ConnectionShape): TLShapeId[] {
	const bindings = getConnectionBindings(editor, connection)
	const ids: TLShapeId[] = []
	if (bindings.start) ids.push(bindings.start.toId)
	if (bindings.end) ids.push(bindings.end.toId)
	return ids
}
