/**
 * The planner's rules, proven against synthetic kinds on a stub board.
 *
 * These tests are what make the phase model independently verifiable: the
 * ordering, claiming, refusal, contribution and adoption rules are exercised
 * with no editor, no tldraw runtime, and no real shape kind — so a future
 * composite that misbehaves fails here, at the level the rule lives, before
 * any browser journey has to notice.
 */
import { describe, expect, it } from 'vitest'
import type { Editor, TLShape, TLShapeId } from 'tldraw'

import type { DetachableKind } from './detachableKind'
import { planDetach } from './detachPlan'

interface StubShape {
	id: string
	type: string
	children?: string[]
	/** Ids of wire shapes semantically attached to this node. */
	wires?: string[]
	/** Endpoint node ids, for wire shapes. */
	endpoints?: string[]
	stamped?: boolean
}

/** A board that satisfies the slice of `Editor` the planner reads. */
function stubBoard(shapes: StubShape[]): Editor {
	const byId = new Map(shapes.map((shape) => [shape.id, shape]))
	return {
		getShape: (id: string) => {
			const shape = byId.get(id)
			return shape ? ({ id: shape.id, type: shape.type, meta: {} } as unknown as TLShape) : undefined
		},
		getSortedChildIdsForParent: (id: string) => byId.get(id)?.children ?? [],
		__stub: byId,
	} as unknown as Editor
}

function stub(editor: Editor): Map<string, StubShape> {
	return (editor as unknown as { __stub: Map<string, StubShape> }).__stub
}

const wireKind: DetachableKind = {
	kind: 'wire',
	role: 'edge',
	matches: (shape) => typeOf(shape) === 'wire',
	edgeEndpointIds: (editor, shape) =>
		(stub(editor).get(shape.id)?.endpoints ?? []) as TLShapeId[],
	lowerEdge: () => null,
}

const boxKind: DetachableKind = {
	kind: 'box',
	role: 'node',
	nodePhase: 'leaf',
	rebuildable: true,
	claimsIncidentEdges: true,
	discoversChildren: true,
	matches: (shape) => typeOf(shape) === 'box',
	lowerNode: () => null,
}

const noteKind: DetachableKind = {
	kind: 'note',
	role: 'node',
	nodePhase: 'leaf',
	discoversChildren: true,
	matches: (shape) => typeOf(shape) === 'note',
	lowerNode: () => null,
}

/** A container that discovers its children and names its incident wires. */
const crateKind: DetachableKind = {
	kind: 'crate',
	role: 'node',
	nodePhase: 'container',
	discoversChildren: true,
	matches: (shape) => typeOf(shape) === 'crate',
	incidentEdgeIds: (editor, shape) => (stub(editor).get(shape.id)?.wires ?? []) as TLShapeId[],
	lowerNode: () => null,
}

/** A projection-owning container: children contributed, never discovered. */
const regionKind: DetachableKind = {
	kind: 'region',
	role: 'node',
	nodePhase: 'container',
	discoversChildren: false,
	matches: (shape) => typeOf(shape) === 'region',
	refuses: (shape) => typeOf(shape).startsWith('stamped-'),
	expand: (editor, shape, contribute) => {
		const record = stub(editor).get(shape.id)
		for (const wireId of record?.wires ?? []) {
			contribute.addEdge({ shapeId: wireId as TLShapeId, forcePlain: true })
		}
		for (const childId of record?.children ?? []) {
			contribute.addNode({ shapeId: childId as TLShapeId })
		}
	},
	lowerNode: () => null,
}

const KINDS = [wireKind, boxKind, noteKind, crateKind, regionKind]
const ids = (values: string[]) => values as unknown as TLShapeId[]
/** Synthetic kinds use type names outside the app's closed shape union. */
const typeOf = (shape: TLShape) => shape.type as string

describe('planDetach discovery', () => {
	it('collects matches, descends through unmatched shapes, and dedups', () => {
		const editor = stubBoard([
			{ id: 'group', type: 'group', children: ['box1', 'box1-again', 'plain'] },
			{ id: 'box1', type: 'box' },
			{ id: 'box1-again', type: 'unknown', children: ['box2'] },
			{ id: 'box2', type: 'box' },
			{ id: 'plain', type: 'geo' },
		])
		const plan = planDetach(editor, ids(['group', 'box2']), KINDS)
		expect(plan.nodes.map((node) => node.id)).toEqual(['box1', 'box2'])
		expect(plan.nodes.every((node) => node.selectable)).toBe(true)
	})

	it('does not descend into a kind that owns its children', () => {
		const editor = stubBoard([
			{ id: 'region1', type: 'region', children: ['inner-box'] },
			{ id: 'inner-box', type: 'box' },
		])
		const plan = planDetach(editor, ids(['region1']), KINDS)
		// The region contributed inner-box itself; it joins as contributed
		// (unselectable, owned), not as discovered authored work.
		const inner = plan.nodes.find((node) => node.id === 'inner-box')
		expect(inner?.origin).toBe('contributed')
		expect(inner?.ownerId).toBe('region1')
		expect(inner?.selectable).toBe(false)
	})

	it('refused shapes are skipped but their subtrees are still searched', () => {
		const editor = stubBoard([
			{ id: 'stamped-holder', type: 'stamped-holder', children: ['box1'] },
			{ id: 'box1', type: 'box' },
		])
		const plan = planDetach(editor, ids(['stamped-holder']), KINDS)
		expect(plan.nodes.map((node) => node.id)).toEqual(['box1'])
	})

	it('a shape refused to discovery still joins when its owner contributes it', () => {
		const editor = stubBoard([
			{ id: 'region1', type: 'region', children: ['stamped-leaf'] },
			{ id: 'stamped-leaf', type: 'stamped-box' },
		])
		const refusedDirect = planDetach(editor, ids(['stamped-leaf']), [
			...KINDS,
			{ ...boxKind, kind: 'stamped-box', matches: (shape) => typeOf(shape) === 'stamped-box' },
		])
		expect(refusedDirect.nodes).toHaveLength(0)
		const viaOwner = planDetach(editor, ids(['region1']), [
			...KINDS,
			{ ...boxKind, kind: 'stamped-box', matches: (shape) => typeOf(shape) === 'stamped-box' },
		])
		expect(viaOwner.nodes.map((node) => node.id)).toContain('stamped-leaf')
	})
})

describe('planDetach edges and claims', () => {
	it('defers a wire touching a claiming participant to that participant', () => {
		const editor = stubBoard([
			{ id: 'box1', type: 'box' },
			{ id: 'wire1', type: 'wire', endpoints: ['box1', 'elsewhere'] },
		])
		const plan = planDetach(editor, ids(['box1', 'wire1']), KINDS)
		expect(plan.edges).toHaveLength(0)
		expect(plan.nodes.map((node) => node.id)).toEqual(['box1'])
	})

	it('lowers a wire plainly when no endpoint claims it', () => {
		const editor = stubBoard([
			{ id: 'note1', type: 'note' },
			{ id: 'wire1', type: 'wire', endpoints: ['note1', 'elsewhere'] },
		])
		const plan = planDetach(editor, ids(['note1', 'wire1']), KINDS)
		expect(plan.edges.map((edge) => edge.id)).toEqual(['wire1'])
		expect(plan.edges[0].selectable).toBe(true)
	})

	it('keeps a force-plain contribution in the edge phase past a claiming endpoint', () => {
		const editor = stubBoard([
			{ id: 'region1', type: 'region', children: ['leaf1'], wires: ['wire1'] },
			{ id: 'leaf1', type: 'box' },
			{ id: 'wire1', type: 'wire', endpoints: ['leaf1', 'leaf1'] },
		])
		const plan = planDetach(editor, ids(['region1']), KINDS)
		expect(plan.edges.map((edge) => edge.id)).toEqual(['wire1'])
		expect(plan.edges[0].forcePlain).toBe(true)
		expect(plan.edges[0].selectable).toBe(false)
		expect(plan.edges[0].ownerId).toBe('region1')
	})

	it('includes a container\'s incident wires that discovery cannot reach', () => {
		const editor = stubBoard([
			{ id: 'crate1', type: 'crate', wires: ['wire1'] },
			{ id: 'wire1', type: 'wire', endpoints: ['crate1', 'elsewhere'] },
		])
		const plan = planDetach(editor, ids(['crate1']), KINDS)
		expect(plan.edges.map((edge) => edge.id)).toEqual(['wire1'])
		// Incident wires lower for the container's sake, not the selection's.
		expect(plan.edges[0].selectable).toBe(false)
	})

	it('a wire both selected and container-incident lowers once, unselectable', () => {
		const editor = stubBoard([
			{ id: 'crate1', type: 'crate', wires: ['wire1'] },
			{ id: 'wire1', type: 'wire', endpoints: ['crate1', 'elsewhere'] },
		])
		const plan = planDetach(editor, ids(['crate1', 'wire1']), KINDS)
		expect(plan.edges.map((edge) => edge.id)).toEqual(['wire1'])
		expect(plan.edges[0].selectable).toBe(false)
	})

	it('a container-incident wire claimed by a participating box is deferred', () => {
		const editor = stubBoard([
			{ id: 'crate1', type: 'crate', wires: ['wire1'] },
			{ id: 'box1', type: 'box' },
			{ id: 'wire1', type: 'wire', endpoints: ['crate1', 'box1'] },
		])
		const plan = planDetach(editor, ids(['crate1', 'box1']), KINDS)
		expect(plan.edges).toHaveLength(0)
	})
})

describe('planDetach ordering', () => {
	it('leaves lower before containers regardless of request order', () => {
		const editor = stubBoard([
			{ id: 'crate1', type: 'crate' },
			{ id: 'box1', type: 'box' },
		])
		const plan = planDetach(editor, ids(['crate1', 'box1']), KINDS)
		expect(plan.nodes.map((node) => node.id)).toEqual(['box1', 'crate1'])
	})

	it('keeps discovered nesting top-down within the container rank', () => {
		const editor = stubBoard([
			{ id: 'outer', type: 'crate', children: ['inner'] },
			{ id: 'inner', type: 'crate' },
		])
		const plan = planDetach(editor, ids(['outer']), KINDS)
		expect(plan.nodes.map((node) => node.id)).toEqual(['outer', 'inner'])
	})

	it('lowers a composite\'s contributions before the composite itself', () => {
		const editor = stubBoard([
			{ id: 'region1', type: 'region', children: ['leaf1', 'nested-crate'] },
			{ id: 'leaf1', type: 'box' },
			{ id: 'nested-crate', type: 'crate' },
		])
		const plan = planDetach(editor, ids(['region1']), KINDS)
		const order = plan.nodes.map((node) => node.id as string)
		expect(order.indexOf('leaf1')).toBeLessThan(order.indexOf('region1'))
		expect(order.indexOf('nested-crate')).toBeLessThan(order.indexOf('region1'))
	})

	it('a contributed composite expands recursively with the outermost owner', () => {
		const editor = stubBoard([
			{ id: 'region1', type: 'region', children: ['inner-crate'] },
			{ id: 'inner-crate', type: 'crate', children: ['deep-box'] },
			{ id: 'deep-box', type: 'box' },
		])
		const plan = planDetach(editor, ids(['region1']), KINDS)
		const deep = plan.nodes.find((node) => node.id === 'deep-box')
		// Everything below a contributed subtree is adopted by the region whose
		// expansion pulled it in — its replacement must land inside that
		// region's frame, not loose on the page.
		expect(deep?.ownerId).toBe('region1')
		const order = plan.nodes.map((node) => node.id as string)
		expect(order.indexOf('deep-box')).toBeLessThan(order.indexOf('inner-crate'))
		expect(order.indexOf('inner-crate')).toBeLessThan(order.indexOf('region1'))
	})

	it('requested ids reached first as descendants still count as requested', () => {
		const editor = stubBoard([
			{ id: 'group', type: 'group', children: ['box1'] },
			{ id: 'box1', type: 'box' },
		])
		const plan = planDetach(editor, ids(['group', 'box1']), KINDS)
		expect(plan.nodes[0].origin).toBe('requested')
	})
})
