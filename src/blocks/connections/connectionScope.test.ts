/**
 * A cable's SCOPE and a cable's PARENT answer different questions, and the two
 * only coincide for an Expanded Block. The live proof that the parent is what
 * makes a cable clickable inside a region is `tests/loop_region_smoke.mjs`.
 */
import type { Editor, TLParentId, TLShape, TLShapeId } from 'tldraw'
import { describe, expect, it } from 'vitest'

import { getDefaultBlockProps, setBlockViewProps, type BlockView } from '../blockModel'
import { getDefaultBranchProps } from '../../branch/branchModel'
import { getDefaultLoopProps } from '../../loop/loopModel'
import { blockScopeId, cableCompositingParent } from './connectionScope'

const PAGE = 'page:page' as TLParentId

function shape(id: string, type: string, parentId: TLParentId, props: object): TLShape {
	return {
		id: `shape:${id}` as TLShapeId,
		typeName: 'shape',
		type,
		x: 0,
		y: 0,
		rotation: 0,
		index: 'a1' as TLShape['index'],
		parentId,
		isLocked: false,
		opacity: 1,
		meta: {},
		props,
	} as TLShape
}

const block = (id: string, parentId: TLParentId = PAGE, view: BlockView = 'simple') =>
	shape(id, 'block', parentId, setBlockViewProps(getDefaultBlockProps(), view))
const loop = (id: string, parentId: TLParentId = PAGE) =>
	shape(id, 'loop', parentId, getDefaultLoopProps())
const branch = (id: string, parentId: TLParentId = PAGE) =>
	shape(id, 'branch', parentId, getDefaultBranchProps())

function reader(shapes: TLShape[]) {
	const byId = new Map(shapes.map((s) => [s.id as string, s]))
	return {
		getShape: (id: TLShapeId) => byId.get(id as string),
		getShapeParent: (arg: TLShapeId | TLShape) => {
			const self = typeof arg === 'string' ? byId.get(arg) : arg
			return self && typeof self.parentId === 'string' && self.parentId.startsWith('shape:')
				? byId.get(self.parentId)
				: undefined
		},
		getAncestorPageId: () => PAGE,
	} as unknown as Pick<Editor, 'getShape' | 'getShapeParent' | 'getAncestorPageId'>
}

describe('a cable takes the container it paints in', () => {
	it('leaves a cable between two page-level Blocks on the page', () => {
		const a = block('a')
		const b = block('b')
		expect(cableCompositingParent(reader([a, b]), a, b, PAGE)).toBe(PAGE)
	})

	it('takes the region when both ends are inside it', () => {
		const region = loop('loop')
		const a = block('a', region.id)
		const b = block('b', region.id)
		expect(cableCompositingParent(reader([region, a, b]), a, b, PAGE)).toBe(region.id)
	})

	it('takes the region for a cable that crosses in from outside', () => {
		const region = loop('loop')
		const outside = block('outside')
		const inside = block('inside', region.id)
		const parent = cableCompositingParent(reader([region, outside, inside]), outside, inside, PAGE)
		expect(parent).toBe(region.id)
	})

	it('takes the region when the region itself is one of the ends', () => {
		const region = loop('loop')
		const inside = block('inside', region.id)
		expect(cableCompositingParent(reader([region, inside]), region, inside, PAGE)).toBe(region.id)
	})

	it('prefers the region both ends share over either end own', () => {
		const outer = branch('outer')
		const inner = loop('inner', outer.id)
		const deep = block('deep', inner.id)
		const shallow = block('shallow', outer.id)
		const shapes = reader([outer, inner, deep, shallow])
		// Only `outer` holds them both; parenting to `inner` would put the cable
		// above a region that half of it is not even in.
		expect(cableCompositingParent(shapes, deep, shallow, PAGE)).toBe(outer.id)
	})

	it('gives a cable inside an arm to the Branch, never to the arm', () => {
		// An arm folds, and tldraw hides a folded frame's children. An arm that
		// owned this cable would swallow it on every fold — which is exactly what
		// `tests/branch_region_smoke.mjs` caught at BR-20.
		const region = branch('branch')
		const arm = shape('arm', 'branch-arm', region.id, {})
		const a = block('a', arm.id)
		const b = block('b', arm.id)
		expect(cableCompositingParent(reader([region, arm, a, b]), a, b, PAGE)).toBe(region.id)
	})

	it('falls back to the shared scope when the ends sit in different regions', () => {
		const left = loop('left')
		const right = loop('right')
		const a = block('a', left.id)
		const b = block('b', right.id)
		expect(cableCompositingParent(reader([left, right, a, b]), a, b, PAGE)).toBe(PAGE)
	})

	it('never escapes the scope it was given', () => {
		const host = block('host', PAGE, 'expanded')
		const region = loop('loop', host.id)
		const a = block('a', region.id)
		const shapes = reader([host, region, a])
		expect(cableCompositingParent(shapes, host, a, host.id)).toBe(region.id)
		// …and the region is transparent to scoping, so the scope is unchanged.
		expect(blockScopeId(shapes, a.id)).toBe(host.id)
	})

	it('reads the same scope through a region as without one', () => {
		const region = loop('loop')
		const inside = block('inside', region.id)
		expect(blockScopeId(reader([region, inside]), inside.id)).toBe(PAGE)
	})
})
