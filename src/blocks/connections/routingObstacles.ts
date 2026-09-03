/**
 * Page-space obstacle collection for one SystemSketch data connection.
 *
 * This module deliberately knows nothing about A*, nudging, persistence, or
 * commands. Its only job is to translate live Block / Branch semantics into
 * endpoint boxes and forbidden rectangles that a pure router can consume.
 */
import type { Editor, TLShapeId } from 'tldraw'

import {
	branchLayout,
	isBranchShape,
	type BranchRect,
	type BranchShape,
	type BranchShapeProps,
} from '../../branch/branchModel'
import { branchAncestry, outermostFoldedLevel } from '../../branch/branchScope'
import { isBlockShape } from '../blockModel'
import { layoutBlock, type BlockRect } from '../layoutBlock'
import type {
	ElbowEndpoint,
	ElbowRect,
	ElbowRouteInput,
	ElbowRoutingObstacle,
} from '../elbow'
import {
	getConnectionBindings,
	getConnectionDirection,
	type ConnectionBinding,
} from './ConnectionBindingUtil'
import { blockScopeId } from './connectionScope'
import { getConnectionEndpoints, type ConnectionShape } from './ConnectionShapeUtil'

/** The semantic inputs for a single pure pathfinding call. */
export interface ConnectionRoutingScene {
	input: ElbowRouteInput
	/** Structural cards and semantic regions, kept separate for independent tests. */
	structuralObstacles: ElbowRect[]
	/** Painted port-label content with its own tight text clearance. */
	textObstacles: ElbowRoutingObstacle[]
}

/** A small visible gap around glyphs, independent of the 24px Block clearance. */
export const PORT_LABEL_ROUTING_CLEARANCE_PX = 4

/**
 * Branch-local forbidden zones for one cable.
 *
 * An unrelated cable sees the whole Branch as solid. A cable with an endpoint
 * inside a Branch may use only the endpoint's arm body: the band, headers, and
 * sibling arm bodies stay forbidden. A folded endpoint lands on its own header,
 * so that one header becomes a legal terminal surface while every other header
 * remains solid.
 */
export function branchRoutingForbiddenRects(
	props: BranchShapeProps,
	allowedArmIds: ReadonlySet<string>,
	foldedEndpointArmIds: ReadonlySet<string> = new Set(),
): BranchRect[] {
	const layout = branchLayout(props)
	if (allowedArmIds.size === 0) return [{ x: 0, y: 0, w: layout.w, h: layout.h }]

	const forbidden: BranchRect[] = [layout.band]
	for (const row of layout.arms) {
		if (!foldedEndpointArmIds.has(row.arm.id)) forbidden.push(row.header)
		if (!allowedArmIds.has(row.arm.id) && row.bodyH > 0) {
			forbidden.push({ x: 0, y: row.bodyTop, w: layout.w, h: row.bodyH })
		}
	}
	return forbidden
}

/** Axis-aligned page rectangle enclosing a local Branch rectangle. */
function branchRectInPage(editor: Editor, branch: BranchShape, rect: BranchRect): ElbowRect {
	const transform = editor.getShapePageTransform(branch.id)
	const corners = [
		transform.applyToPoint({ x: rect.x, y: rect.y }),
		transform.applyToPoint({ x: rect.x + rect.w, y: rect.y }),
		transform.applyToPoint({ x: rect.x + rect.w, y: rect.y + rect.h }),
		transform.applyToPoint({ x: rect.x, y: rect.y + rect.h }),
	]
	const xs = corners.map((point) => point.x)
	const ys = corners.map((point) => point.y)
	const minX = Math.min(...xs)
	const minY = Math.min(...ys)
	return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY }
}

/** Axis-aligned page rectangle enclosing any local rectangle on a shape. */
function localRectInPage(editor: Editor, shapeId: TLShapeId, rect: BlockRect): ElbowRect {
	const transform = editor.getShapePageTransform(shapeId)
	const corners = [
		transform.applyToPoint({ x: rect.x, y: rect.y }),
		transform.applyToPoint({ x: rect.x + rect.w, y: rect.y }),
		transform.applyToPoint({ x: rect.x + rect.w, y: rect.y + rect.h }),
		transform.applyToPoint({ x: rect.x, y: rect.y + rect.h }),
	]
	const xs = corners.map((point) => point.x)
	const ys = corners.map((point) => point.y)
	const minX = Math.min(...xs)
	const minY = Math.min(...ys)
	return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY }
}

function pageBoundsRect(editor: Editor, shapeId: TLShapeId): ElbowRect | null {
	const bounds = editor.getShapePageBounds(shapeId)
	return bounds
		? { x: bounds.minX, y: bounds.minY, w: bounds.width, h: bounds.height }
		: null
}

/** Outer endpoint cards constrain the first/last leg; inner and folded faces do not. */
function endpointBox(editor: Editor, binding: ConnectionBinding | undefined): ElbowRect | null {
	if (!binding || binding.props.face === 'inner') return null
	if (outermostFoldedLevel(editor, binding.toId)) return null
	return pageBoundsRect(editor, binding.toId)
}

function branchAccessForEndpoints(
	editor: Editor,
	branch: BranchShape,
	endpointShapeIds: ReadonlySet<TLShapeId>,
): { allowed: Set<string>; folded: Set<string> } {
	const allowed = new Set<string>()
	const folded = new Set<string>()
	for (const endpointId of endpointShapeIds) {
		for (const level of branchAncestry(editor, endpointId)) {
			if (level.branch.id !== branch.id || !level.armId) continue
			allowed.add(level.armId)
			if (level.arm && !level.arm.open) folded.add(level.armId)
		}
	}
	return { allowed, folded }
}

/**
 * Collect every solid shape and semantic Branch zone relevant to one cable's
 * own scope. Endpoint hosts are represented separately on the route input.
 */
export function collectConnectionRoutingObstacles(
	editor: Editor,
	connection: ConnectionShape,
): ElbowRect[] {
	const bindings = getConnectionBindings(editor, connection)
	const endpointShapeIds = new Set<TLShapeId>(
		[bindings.start?.toId, bindings.end?.toId].filter((id): id is TLShapeId => id !== undefined),
	)
	const obstacles: ElbowRect[] = []

	for (const shape of editor.getCurrentPageShapes()) {
		if (shape.id === connection.id || blockScopeId(editor, shape.id) !== connection.parentId) continue

		if (isBlockShape(shape)) {
			if (endpointShapeIds.has(shape.id)) continue
			// Folded descendants are not painted in their remembered body positions.
			if (branchAncestry(editor, shape.id).some((level) => level.arm && !level.arm.open)) continue
			const rect = pageBoundsRect(editor, shape.id)
			if (rect) obstacles.push(rect)
			continue
		}

		if (!isBranchShape(shape)) continue
		// A Branch control port is a real endpoint on the band. Its endpoint box
		// already keeps the route outside the Branch, with a legal terminal entry.
		if (endpointShapeIds.has(shape.id)) continue
		const access = branchAccessForEndpoints(editor, shape, endpointShapeIds)
		for (const local of branchRoutingForbiddenRects(shape.props, access.allowed, access.folded)) {
			obstacles.push(branchRectInPage(editor, shape, local))
		}
	}

	return obstacles
}

/**
 * Collect painted port-label content independently of structural obstacles.
 *
 * Layout geometry is the source of truth rather than DOM measurement, so Tidy
 * is deterministic when a Block is offscreen and in non-browser consumers.
 * The connection's Expanded parent is included explicitly: its boundary labels
 * live in the cable's scope even though the frame itself lives one scope out.
 */
export function collectConnectionRoutingTextObstacles(
	editor: Editor,
	connection: ConnectionShape,
): ElbowRoutingObstacle[] {
	const obstacles: ElbowRoutingObstacle[] = []
	for (const shape of editor.getCurrentPageShapes()) {
		if (!isBlockShape(shape)) continue
		const inCableScope = shape.id === connection.parentId
			|| blockScopeId(editor, shape.id) === connection.parentId
		if (!inCableScope) continue
		// Folded descendants have remembered geometry but no painted labels.
		if (branchAncestry(editor, shape.id).some((level) => level.arm && !level.arm.open)) continue
		for (const placed of layoutBlock(shape.props).ports) {
			if (!placed.labelContent || placed.labelContent.w <= 0 || placed.labelContent.h <= 0) continue
			obstacles.push({
				...localRectInPage(editor, shape.id, placed.labelContent),
				clearance: PORT_LABEL_ROUTING_CLEARANCE_PX,
			})
		}
	}
	return obstacles
}

/** Build one pure-router input from the editor without doing any pathfinding. */
export function collectConnectionRoutingScene(
	editor: Editor,
	connection: ConnectionShape,
): ConnectionRoutingScene {
	const transform = editor.getShapePageTransform(connection)
	const local = getConnectionEndpoints(editor, connection)
	const bindings = getConnectionBindings(editor, connection)
	const direction = getConnectionDirection(editor, connection)
	const sourceBinding = bindings[direction.sourceTerminal]
	const sinkBinding = bindings[direction.sinkTerminal]
	const structuralObstacles = collectConnectionRoutingObstacles(editor, connection)
	const textObstacles = collectConnectionRoutingTextObstacles(editor, connection)
	const obstacles = [...structuralObstacles, ...textObstacles]
	const start: ElbowEndpoint = {
		point: transform.applyToPoint(local.source),
		side: 'right',
		box: endpointBox(editor, sourceBinding),
	}
	const end: ElbowEndpoint = {
		point: transform.applyToPoint(local.sink),
		side: 'left',
		box: endpointBox(editor, sinkBinding),
	}
	return {
		input: { start, end, obstacles },
		structuralObstacles,
		textObstacles,
	}
}
