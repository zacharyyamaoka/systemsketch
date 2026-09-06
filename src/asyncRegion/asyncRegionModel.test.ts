import { describe, expect, it, vi } from 'vitest'
import { createShapeId, type Editor, type TLPageId, type TLShape, type TLShapeId } from 'tldraw'

import {
	ASYNC_REGION_CONNECTION_DEFAULT_META_KEY,
	asyncRegionIdForShape,
	asyncRegionMeta,
	applyAsyncRegionConnectionDefault,
	sharedAsyncRegionId,
} from './asyncRegionModel'
import type { ConnectionShape } from '../blocks/connections/ConnectionShapeUtil'

const PAGE = 'page:page' as TLPageId
const regionId = createShapeId('async')
const nestedRegionId = createShapeId('nested-async')
const firstId = createShapeId('first')
const secondId = createShapeId('second')
const outsideId = createShapeId('outside')
const connectionId = createShapeId('wire')

function shape(id: TLShapeId, parentId: TLShape['parentId'], meta = {}) {
	return { id, type: 'geo', parentId, meta } as unknown as TLShape
}

function frame(id: TLShapeId, parentId: TLShape['parentId']) {
	return {
		id,
		type: 'frame',
		parentId,
		meta: asyncRegionMeta(),
		props: { name: 'Async region', color: 'violet', w: 600, h: 400 },
	} as unknown as TLShape
}

function connection(temporal: 'data' | 'async' | 'delayed' = 'data') {
	return {
		id: connectionId,
		type: 'connection',
		parentId: regionId,
		meta: {},
		props: { temporal },
	} as unknown as ConnectionShape
}

function harness(wire = connection()) {
	const shapes = new Map<TLShapeId, TLShape>([
		[regionId, frame(regionId, PAGE)],
		[nestedRegionId, frame(nestedRegionId, regionId)],
		[firstId, shape(firstId, nestedRegionId)],
		[secondId, shape(secondId, regionId)],
		[outsideId, shape(outsideId, PAGE)],
		[connectionId, wire as unknown as TLShape],
	])
	const updateShape = vi.fn()
	return {
		editor: { getShape: (id: TLShapeId) => shapes.get(id), updateShape } as unknown as Editor,
		updateShape,
	}
}

describe('Async region membership', () => {
	it('finds the nearest region and the closest region shared by two endpoints', () => {
		const { editor } = harness()
		expect(asyncRegionIdForShape(editor, firstId)).toBe(nestedRegionId)
		expect(asyncRegionIdForShape(editor, secondId)).toBe(regionId)
		expect(sharedAsyncRegionId(editor, firstId, secondId)).toBe(regionId)
		expect(sharedAsyncRegionId(editor, firstId, outsideId)).toBeNull()
	})
})

describe('Async region wire default', () => {
	it('stamps a newly completed Data wire whose endpoints share a region', () => {
		const { editor, updateShape } = harness()
		const result = applyAsyncRegionConnectionDefault(editor, connectionId, firstId, secondId)
		expect(result).toEqual({ changed: true, regionId, temporal: 'async' })
		expect(updateShape).toHaveBeenCalledWith(expect.objectContaining({
			id: connectionId,
			props: { temporal: 'async' },
			meta: expect.objectContaining({
				[ASYNC_REGION_CONNECTION_DEFAULT_META_KEY]: { version: 1, regionId: String(regionId) },
			}),
		}))
	})

	it('does not affect a boundary-crossing wire or overwrite an explicit temporal choice', () => {
		const outside = harness()
		expect(applyAsyncRegionConnectionDefault(outside.editor, connectionId, firstId, outsideId).changed).toBe(false)
		expect(outside.updateShape).not.toHaveBeenCalled()

		for (const temporal of ['async', 'delayed'] as const) {
			const explicit = harness(connection(temporal))
			expect(applyAsyncRegionConnectionDefault(explicit.editor, connectionId, firstId, secondId).changed).toBe(false)
			expect(explicit.updateShape).not.toHaveBeenCalled()
		}
	})
})
