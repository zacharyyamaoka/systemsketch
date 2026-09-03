/**
 * The hit-test contract every container shares. `blockSelectableArea.test.ts`
 * still owns the Expanded Block's own measurements; this one asserts that the
 * Branch and the Loop answer in the same places, which is what stops the next
 * region from shipping without a footer again.
 */
import { createShapeId, Group2d, Rectangle2d, type Editor } from 'tldraw'
import { describe, expect, it } from 'vitest'

import { containerHitGeometry } from './containerGeometry'
import { BranchShapeUtil } from '../branch/BranchShapeUtil'
import { getDefaultBranchProps, branchLayout, type BranchShape } from '../branch/branchModel'
import { LoopShapeUtil } from '../loop/LoopShapeUtil'
import { getDefaultLoopProps, loopLayout, type LoopShape } from '../loop/loopModel'

/** tldraw's frame-like rule, transcribed: an `isLabel` child is solid chrome. */
function hitsChrome(geometry: Group2d, point: { x: number; y: number }): boolean {
	return geometry.children.some((child) => child.isLabel && child.isPointInBounds(point))
}

function shapeOf<T>(type: string, props: object): T {
	return {
		id: createShapeId(type),
		typeName: 'shape',
		type,
		x: 0,
		y: 0,
		rotation: 0,
		index: 'a1',
		parentId: 'page:page',
		isLocked: false,
		opacity: 1,
		meta: {},
		props,
	} as T
}

const loopShape = (over: object = {}) =>
	shapeOf<LoopShape>('loop', { ...getDefaultLoopProps(), w: 640, h: 420, ...over })
const branchShape = (over: object = {}) =>
	shapeOf<BranchShape>('branch', { ...getDefaultBranchProps(), w: 640, h: 474, ...over })

const loopGeometry = (shape = loopShape()) =>
	new LoopShapeUtil(null as unknown as Editor).getGeometry(shape)
const branchGeometry = (shape = branchShape()) =>
	new BranchShapeUtil(null as unknown as Editor).getGeometry(shape)

describe('containerHitGeometry', () => {
	it('keeps the face closed so the container still takes a dropped Block', () => {
		// tldraw resolves a drop target with `isPointInShape(…, hitInside: true)`,
		// which reduces to the body test with labels excluded. An open face would
		// silently stop every region from adopting children.
		for (const geometry of [loopGeometry(), branchGeometry()]) {
			expect(geometry.children[0].isClosed).toBe(true)
			expect(geometry.hitTestPoint({ x: 320, y: 240 }, 0, true)).toBe(true)
		}
	})

	it('leaves the open face out of brush hits', () => {
		for (const geometry of [loopGeometry(), branchGeometry()]) {
			expect(geometry.children[0].isFilled).toBe(false)
			expect(geometry.hitTestPoint({ x: 320, y: 240 }, 0, false)).toBe(false)
		}
	})

	it('keeps chrome and dots out of the shape bounds', () => {
		const loop = loopShape()
		expect(loopGeometry(loop).bounds.w).toBe(loop.props.w)
		expect(loopGeometry(loop).bounds.h).toBe(loop.props.h)
		const branch = branchShape()
		expect(branchGeometry(branch).bounds.w).toBe(branch.props.w)
		expect(branchGeometry(branch).bounds.h).toBe(branch.props.h)
	})

	it('drops empty and absent bands rather than seeding a zero-size hit area', () => {
		const geometry = containerHitGeometry({
			body: new Rectangle2d({ width: 100, height: 100, isFilled: false }),
			chrome: [null, undefined, { w: 0, h: 20 }, { w: 20, h: 0 }, { x: 0, y: 0, w: 100, h: 10 }],
		})
		expect(geometry.children.filter((child) => child.isLabel)).toHaveLength(1)
	})
})

describe('a Loop answers on the same chrome an Expanded Block does', () => {
	it('answers on the header AND the footer', () => {
		const shape = loopShape()
		const layout = loopLayout(shape.props)
		const geometry = loopGeometry(shape)
		expect(layout.footer, 'a 420px Loop has a footer to hit').not.toBeNull()
		expect(hitsChrome(geometry, { x: layout.w / 2, y: layout.header.h / 2 })).toBe(true)
		expect(
			hitsChrome(geometry, { x: layout.w / 2, y: layout.footer!.y + layout.footer!.h / 2 }),
			'the footer is grabbable — it carried no hit geometry at all until 2026-09-03',
		).toBe(true)
	})

	it('answers on both port dots', () => {
		const shape = loopShape()
		const layout = loopLayout(shape.props)
		const geometry = loopGeometry(shape)
		for (const placed of [layout.iterable, layout.item]) {
			expect(hitsChrome(geometry, { x: placed.x, y: placed.y })).toBe(true)
		}
	})

	it('leaves the open body drawable', () => {
		const shape = loopShape()
		const layout = loopLayout(shape.props)
		const geometry = loopGeometry(shape)
		expect(hitsChrome(geometry, { x: layout.w / 2, y: layout.h / 2 })).toBe(false)
	})
})

describe('a Branch answers on the same chrome an Expanded Block does', () => {
	it('answers on the band and on every arm header, not the arm bodies', () => {
		const shape = branchShape()
		const layout = branchLayout(shape.props)
		const geometry = branchGeometry(shape)
		expect(hitsChrome(geometry, { x: layout.w / 2, y: layout.band.h / 2 })).toBe(true)
		for (const row of layout.arms) {
			expect(hitsChrome(geometry, { x: layout.w / 2, y: row.header.y + row.header.h / 2 }))
				.toBe(true)
			expect(hitsChrome(geometry, { x: layout.w / 2, y: row.header.y + row.header.h + 40 }))
				.toBe(false)
		}
	})
})
