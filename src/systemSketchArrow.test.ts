import { describe, expect, it } from 'vitest'
import type { Editor, JsonObject, TLArrowShape } from 'tldraw'
import {
	SYSTEMSKETCH_ARROW_ROUTE_META_KEY,
	SYSTEMSKETCH_ARROW_SLANTED_META_KEY,
	getArrowInspectorRouting,
	getSlantedArrowDeparture,
	getSlantedArrowPoints,
	isSlantedArrow,
	readSystemSketchArrowRoute,
	setArrowInspectorRouting,
} from './systemSketchArrow'

const validRoute = {
	version: 1,
	route: {
		startAxis: 'x',
		corners: [
			{ tx: 0.25, ox: 12, ty: 0.5, oy: -8 },
			{ tx: 0.75, ox: -4, ty: 0.5, oy: 18 },
		],
	},
}

describe('SystemSketch arrow route metadata', () => {
	it('reads the versioned multi-elbow route without changing stock arrow props', () => {
		const meta = { [SYSTEMSKETCH_ARROW_ROUTE_META_KEY]: validRoute } as unknown as JsonObject
		expect(readSystemSketchArrowRoute(meta)).toEqual(validRoute.route)
	})

	it.each([
		{},
		{ version: 2, route: validRoute.route },
		{ version: 1, route: { startAxis: 'z', corners: [] } },
		{ version: 1, route: { startAxis: 'x', corners: [{ tx: Number.NaN }] } },
	])('falls back to the stock elbow for malformed or future metadata: %j', (stored) => {
		const meta = { [SYSTEMSKETCH_ARROW_ROUTE_META_KEY]: stored } as unknown as JsonObject
		expect(readSystemSketchArrowRoute(meta)).toBeNull()
	})
})

function arrow(meta: JsonObject = {}): TLArrowShape {
	return {
		id: 'shape:arrow',
		typeName: 'shape',
		type: 'arrow',
		parentId: 'page:page',
		index: 'a1',
		x: 0,
		y: 0,
		rotation: 0,
		isLocked: false,
		opacity: 1,
		meta,
		props: {
			kind: 'arc',
			bend: 0,
			arrowheadStart: 'none',
			arrowheadEnd: 'arrow',
		},
	} as unknown as TLArrowShape
}

describe('SystemSketch slanted arrows', () => {
	it.each([
		['right-up', { x: 0, y: 0 }, { x: 300, y: -120 }, 'right', { x: 100, y: 0 }],
		['right-down', { x: 0, y: 0 }, { x: 300, y: 120 }, 'right', { x: 100, y: 0 }],
		['down-right', { x: 0, y: 0 }, { x: 120, y: 300 }, 'bottom', { x: 0, y: 100 }],
		['down-left', { x: 0, y: 0 }, { x: -120, y: 300 }, 'bottom', { x: 0, y: 100 }],
		['left-up', { x: 300, y: 0 }, { x: 0, y: -120 }, 'left', { x: 200, y: 0 }],
		['left-down', { x: 300, y: 0 }, { x: 0, y: 120 }, 'left', { x: 200, y: 0 }],
		['up-right', { x: 0, y: 300 }, { x: 120, y: 0 }, 'top', { x: 0, y: 200 }],
		['up-left', { x: 0, y: 300 }, { x: -120, y: 0 }, 'top', { x: 0, y: 200 }],
	] as const)('takes a short %s source lead before the diagonal', (
		_name,
		start,
		end,
		departure,
		elbow,
	) => {
		expect(getSlantedArrowDeparture(start, end)).toBe(departure)
		expect(getSlantedArrowPoints(start, end)).toEqual([
			expect.objectContaining(start),
			expect.objectContaining(elbow),
			expect.objectContaining(end),
		])
	})

	it('uses a bound source face over the loose-arrow fallback and stays direct when collinear', () => {
		const downward = getSlantedArrowPoints(
			{ x: 0, y: 0 },
			{ x: 300, y: 100 },
			null,
			'bottom',
		)
		expect(downward[1]).toMatchObject({ x: 0, y: 100 / 3 })
		expect(getSlantedArrowPoints({ x: 0, y: 20 }, { x: 200, y: 20 })).toHaveLength(2)
	})

	it('keeps the default lead absent until its virtual elbow is dragged', () => {
		const untouched = getSlantedArrowPoints({ x: 0, y: 100 }, { x: 300, y: 0 })
		const dragged = getSlantedArrowPoints({ x: 0, y: 100 }, { x: 300, y: 0 }, 0.25)
		const vertical = getSlantedArrowPoints({ x: 0, y: 0 }, { x: 120, y: 300 }, 0.25)

		expect(untouched[1]).toMatchObject({ x: 100, y: 100 })
		expect(dragged).toEqual([
			expect.objectContaining({ x: 0, y: 100 }),
			expect.objectContaining({ x: 75, y: 100 }),
			expect.objectContaining({ x: 300, y: 0 }),
		])
		expect(vertical[1]).toMatchObject({ x: 0, y: 75 })
	})

	it('reports and switches the inspector-only routing without creating a tool preset', () => {
		const selected = [arrow()]
		const updates: unknown[] = []
		const editor = {
			getSelectedShapes: () => selected,
			markHistoryStoppingPoint: () => undefined,
			updateShapes: (patches: unknown[]) => updates.push(...patches),
		} as unknown as Editor

		expect(getArrowInspectorRouting(editor)).toBe('straight')
		setArrowInspectorRouting(editor, 'slanted')
		expect(updates).toEqual([expect.objectContaining({
			id: 'shape:arrow',
			props: expect.objectContaining({ kind: 'arc', bend: 0, arrowheadEnd: 'arrow' }),
			meta: expect.objectContaining({
				[SYSTEMSKETCH_ARROW_SLANTED_META_KEY]: { version: 1 },
			}),
		})])
		expect(isSlantedArrow(arrow((updates[0] as { meta: JsonObject }).meta))).toBe(true)
	})

	it('does not present a route choice for a selection that includes another shape family', () => {
		const editor = {
			getSelectedShapes: () => [arrow(), { ...arrow(), id: 'shape:geo', type: 'geo' }],
		} as unknown as Editor
		expect(getArrowInspectorRouting(editor)).toBeNull()
	})
})
