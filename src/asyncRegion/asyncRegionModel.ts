import {
	isShapeId,
	type Editor,
	type JsonObject,
	type TLFrameShape,
	type TLShape,
	type TLShapeId,
} from 'tldraw'

import {
	CONNECTION_SHAPE_TYPE,
	type ConnectionTemporalKind,
} from '../blocks/connections/connectionModel'
import type { ConnectionShape } from '../blocks/connections/ConnectionShapeUtil'

export const ASYNC_REGION_TOOL_ID = 'async-region' as const
export const ASYNC_REGION_META_KEY = 'systemSketchAsyncRegion'
export const ASYNC_REGION_CONNECTION_DEFAULT_META_KEY = 'systemSketchAsyncRegionDefault'

interface AsyncRegionMeta extends JsonObject {
	version: 1
}

interface AsyncRegionConnectionDefaultMeta extends JsonObject {
	version: 1
	regionId: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

/** A stock Frame whose metadata says that delivery inside it is asynchronous. */
export function isAsyncRegionShape(shape: TLShape | null | undefined): shape is TLFrameShape {
	if (shape?.type !== 'frame') return false
	const value = shape.meta[ASYNC_REGION_META_KEY]
	return isRecord(value) && value.version === 1
}

export function asyncRegionMeta(meta: JsonObject = {}): JsonObject {
	return {
		...meta,
		[ASYNC_REGION_META_KEY]: { version: 1 } satisfies AsyncRegionMeta,
	}
}

/** The nearest tagged Frame containing this shape, including the shape itself. */
export function asyncRegionIdForShape(editor: Editor, shapeId: TLShapeId): TLShapeId | null {
	let current = editor.getShape(shapeId)
	const visited = new Set<TLShapeId>()
	while (current && !visited.has(current.id)) {
		visited.add(current.id)
		if (isAsyncRegionShape(current)) return current.id
		if (!isShapeId(current.parentId)) return null
		current = editor.getShape(current.parentId)
	}
	return null
}

/** The closest Async region shared by both endpoint components. */
export function sharedAsyncRegionId(
	editor: Editor,
	firstShapeId: TLShapeId,
	secondShapeId: TLShapeId,
): TLShapeId | null {
	const secondAncestors = new Set<TLShapeId>()
	let second = editor.getShape(secondShapeId)
	while (second) {
		if (isAsyncRegionShape(second)) secondAncestors.add(second.id)
		if (!isShapeId(second.parentId)) break
		second = editor.getShape(second.parentId)
	}

	let first = editor.getShape(firstShapeId)
	while (first) {
		if (isAsyncRegionShape(first) && secondAncestors.has(first.id)) return first.id
		if (!isShapeId(first.parentId)) break
		first = editor.getShape(first.parentId)
	}
	return null
}

export interface AsyncRegionConnectionDefaultResult {
	changed: boolean
	regionId: TLShapeId | null
	temporal: ConnectionTemporalKind | null
}

/**
 * Apply the region's default once, at the end of a new-wire gesture.
 *
 * WHY: an Async region is an authoring default, not a continuously enforced
 * constraint. Re-evaluating it on every move or load would overwrite an
 * explicit later choice of Data or Delayed and make document state spooky.
 */
export function applyAsyncRegionConnectionDefault(
	editor: Editor,
	connectionId: TLShapeId,
	firstEndpointId: TLShapeId,
	secondEndpointId: TLShapeId,
): AsyncRegionConnectionDefaultResult {
	const connection = editor.getShape<ConnectionShape>(connectionId)
	if (!connection || connection.type !== CONNECTION_SHAPE_TYPE) {
		return { changed: false, regionId: null, temporal: null }
	}
	const regionId = sharedAsyncRegionId(editor, firstEndpointId, secondEndpointId)
	if (!regionId || connection.props.temporal !== 'data') {
		return { changed: false, regionId, temporal: connection.props.temporal }
	}
	editor.updateShape<ConnectionShape>({
		id: connection.id,
		type: CONNECTION_SHAPE_TYPE,
		props: { temporal: 'async' },
		meta: {
			...connection.meta,
			[ASYNC_REGION_CONNECTION_DEFAULT_META_KEY]: {
				version: 1,
				regionId: String(regionId),
			} satisfies AsyncRegionConnectionDefaultMeta,
		},
	})
	return { changed: true, regionId, temporal: 'async' }
}
