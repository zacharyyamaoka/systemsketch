import { createShapeId, type TLPageId, type TLShapeId } from 'tldraw'
import { describe, expect, it } from 'vitest'

import { getDefaultBranchProps, type BranchShape } from '../../branch/branchModel'
import { getDefaultBlockProps, type BlockShape } from '../blockModel'
import { layoutBlock } from '../layoutBlock'
import type { ConnectionBinding } from './ConnectionBindingUtil'
import type { ConnectionShape } from './ConnectionShapeUtil'
import {
	branchRoutingForbiddenRects,
	collectConnectionRoutingObstacles,
	collectConnectionRoutingTextObstacles,
	PORT_LABEL_ROUTING_CLEARANCE_PX,
	TERMINAL_PORT_LABEL_ROUTING_CLEARANCE_PX,
} from './routingObstacles'

const PAGE = 'page:page' as TLPageId

function block(id: string, x: number, y: number, parentId: TLShapeId | TLPageId = PAGE): BlockShape {
	return {
		id: createShapeId(id), typeName: 'shape', type: 'block', x, y, rotation: 0,
		index: 'a1' as BlockShape['index'], parentId, isLocked: false, opacity: 1, meta: {}, props: getDefaultBlockProps(),
	}
}

function branch(id: string, x: number, y: number): BranchShape {
	return {
		id: createShapeId(id), typeName: 'shape', type: 'branch', x, y, rotation: 0,
		index: 'a2' as BranchShape['index'], parentId: PAGE, isLocked: false, opacity: 1, meta: {}, props: getDefaultBranchProps(),
	}
}

function connection(id: string): ConnectionShape {
	return {
		id: createShapeId(id), typeName: 'shape', type: 'connection', x: 0, y: 0, rotation: 0,
		index: 'a3' as ConnectionShape['index'], parentId: PAGE, isLocked: false, opacity: 1, meta: {},
		props: {
			start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, routing: 'elbow', curve: null,
			pins: [], elbowRoute: null, routeMode: 'automatic', temporal: 'data', delayValue: '', pillPosition: 0.5,
			tunnel: false, tunnelLayer: '',
		},
	}
}

function binding(
	edge: ConnectionShape,
	host: BlockShape,
	terminal: 'start' | 'end',
	portId = terminal === 'start' ? 'out_1' : 'in_1',
	face: ConnectionBinding['props']['face'] = 'outer',
): ConnectionBinding {
	return {
		id: `binding:${edge.id}:${terminal}` as ConnectionBinding['id'],
		typeName: 'binding', type: 'connection', fromId: edge.id, toId: host.id, meta: {},
		props: { portId, terminal, face },
	}
}

function obstacleEditor(
	shapes: (BlockShape | BranchShape | ConnectionShape)[],
	bindings: ConnectionBinding[],
) {
	const byId = new Map(shapes.map((shape) => [shape.id, shape]))
	return {
		store: null,
		getCurrentPageShapes: () => shapes,
		getShape: (id: TLShapeId) => byId.get(id),
		getShapeParent: (id: TLShapeId) => {
			const shape = byId.get(id)
			return shape && typeof shape.parentId === 'string' && shape.parentId.startsWith('shape:')
				? byId.get(shape.parentId as TLShapeId)
				: undefined
		},
		getAncestorPageId: () => PAGE,
		getBindingsFromShape: (shape: ConnectionShape | TLShapeId) => {
			const id = typeof shape === 'string' ? shape : shape.id
			return bindings.filter((item) => item.fromId === id)
		},
		getShapePageBounds: (id: TLShapeId) => {
			const shape = byId.get(id)
			if (!shape) return null
			const parent = typeof shape.parentId === 'string' && shape.parentId.startsWith('shape:')
				? byId.get(shape.parentId as TLShapeId)
				: undefined
			const x = shape.x + (parent?.x ?? 0)
			const y = shape.y + (parent?.y ?? 0)
			const w = shape.type === 'branch' ? shape.props.w : shape.type === 'block' ? shape.props.w : 0
			const h = shape.type === 'branch' ? shape.props.h : shape.type === 'block' ? shape.props.h : 0
			return { minX: x, minY: y, maxX: x + w, maxY: y + h, width: w, height: h }
		},
		getShapePageTransform: (id: TLShapeId) => {
			const shape = byId.get(id)
			return { applyToPoint: (point: { x: number; y: number }) => ({
				x: point.x + (shape?.x ?? 0), y: point.y + (shape?.y ?? 0),
			}) }
		},
	} as never
}

describe('Branch obstacle policy — independent of pathfinding', () => {
	it('makes an unrelated Branch one solid obstacle', () => {
		const props = getDefaultBranchProps()
		expect(branchRoutingForbiddenRects(props, new Set())).toEqual([
			{ x: 0, y: 0, w: props.w, h: props.h },
		])
	})

	it('opens only the target arm body while retaining bands, headers, and siblings', () => {
		const props = getDefaultBranchProps()
		const forbidden = branchRoutingForbiddenRects(props, new Set(['arm_2']))
		expect(forbidden).toContainEqual({ x: 0, y: 72, w: props.w, h: 180 })
		expect(forbidden).not.toContainEqual({ x: 0, y: 284, w: props.w, h: 180 })
		expect(forbidden.filter((rect) => rect.h === 32)).toHaveLength(2)
	})

	it('opens a folded endpoint header without opening another arm header', () => {
		const props = getDefaultBranchProps()
		const forbidden = branchRoutingForbiddenRects(
			props,
			new Set(['arm_2']),
			new Set(['arm_2']),
		)
		expect(forbidden).not.toContainEqual({ x: 0, y: 252, w: props.w, h: 32 })
		expect(forbidden).toContainEqual({ x: 0, y: 40, w: props.w, h: 32 })
	})
})

describe('editor obstacle collection — independent of routing and persistence', () => {
	it('collects an intervening Block and an unrelated Branch, excluding endpoints', () => {
		const source = block('source', 0, 120)
		const target = block('target', 900, 120)
		const blocker = block('blocker', 400, 80)
		const region = branch('region', 600, 420)
		const edge = connection('edge')
		const bindings = [binding(edge, source, 'start'), binding(edge, target, 'end')]
		const obstacles = collectConnectionRoutingObstacles(
			obstacleEditor([source, target, blocker, region, edge], bindings),
			edge,
		)
		expect(obstacles).toContainEqual({
			x: blocker.x, y: blocker.y, w: blocker.props.w, h: blocker.props.h,
		})
		expect(obstacles).toContainEqual({
			x: region.x, y: region.y, w: region.props.w, h: region.props.h,
		})
		expect(obstacles).toHaveLength(2)
	})

	it('uses Branch ancestry to open the endpoint arm instead of the whole region', () => {
		const source = block('source', 0, 120)
		const region = branch('region', 300, 60)
		const target = block('target', 80, 310, region.id)
		target.meta = { branchArm: 'arm_2' }
		const edge = connection('edge')
		const bindings = [binding(edge, source, 'start'), binding(edge, target, 'end')]
		const obstacles = collectConnectionRoutingObstacles(
			obstacleEditor([source, region, target, edge], bindings),
			edge,
		)
		expect(obstacles).not.toContainEqual({
			x: region.x, y: region.y, w: region.props.w, h: region.props.h,
		})
		expect(obstacles).toContainEqual({ x: region.x, y: region.y, w: region.props.w, h: 40 })
		expect(obstacles).toContainEqual({ x: region.x, y: region.y + 72, w: region.props.w, h: 180 })
	})

	it('removes only the bound terminal label halo in an Expanded scope', () => {
		const frame = block('frame', 100, 60)
		frame.props = {
			...frame.props,
			view: 'expanded',
			w: 720,
			h: 480,
			title: 'run()',
			inputs: [
				{ id: 'poses', name: 'poses', type: 'list[Pose]', visible: true },
				{ id: 'gain', name: 'gain', type: 'Float', visible: true },
			],
		}
		const target = block('target', 520, 180, frame.id)
		const edge = connection('edge')
		edge.parentId = frame.id
		const editor = obstacleEditor(
			[frame, target, edge],
			[binding(edge, frame, 'start', 'poses', 'inner'), binding(edge, target, 'end')],
		)

		expect(collectConnectionRoutingObstacles(editor, edge)).toEqual([])
		const text = collectConnectionRoutingTextObstacles(editor, edge)
		const placed = layoutBlock(frame.props).ports
		const poses = placed.find((candidate) => candidate.port.id === 'poses')
		const gain = placed.find((candidate) => candidate.port.id === 'gain')
		expect(poses?.labelContent).not.toBeNull()
		expect(gain?.labelContent).not.toBeNull()
		expect(text).toContainEqual({
			x: frame.x + poses!.labelContent!.x,
			y: frame.y + poses!.labelContent!.y,
			w: poses!.labelContent!.w,
			h: poses!.labelContent!.h,
			clearance: TERMINAL_PORT_LABEL_ROUTING_CLEARANCE_PX,
		})
		expect(text).toContainEqual({
			x: frame.x + gain!.labelContent!.x,
			y: frame.y + gain!.labelContent!.y,
			w: gain!.labelContent!.w,
			h: gain!.labelContent!.h,
			clearance: PORT_LABEL_ROUTING_CLEARANCE_PX,
		})
		expect(text).toHaveLength(2)
	})
})
