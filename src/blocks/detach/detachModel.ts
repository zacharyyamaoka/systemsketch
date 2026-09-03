/**
 * What a detached group remembers about the thing it used to be.
 *
 * Detach transfers authority: the Block stops being one custom shape that only
 * SystemSketch can render and becomes ordinary tldraw primitives that upstream
 * owns. The one thing that must survive that transfer is the *semantics* — the
 * title, the type, the ports and their ids, the remembered view boxes — because
 * a picture of a Block is not a Block, and a `.tldr` full of pictures is a
 * one-way door.
 *
 * So the group carries the record in `meta`. `meta` is tldraw's own per-shape
 * JSON bag: it survives save, load, copy, paste and duplicate untouched, and
 * stock tldraw neither reads nor validates it. That is exactly the property
 * this needs — a `.tldr` opened on tldraw.com shows a group of rectangles and
 * text, and the same file opened in SystemSketch can put the Block back.
 *
 * Everything here is pure: values in, values out, no editor and no tldraw
 * runtime. What the record means is decided here; who writes it is decided in
 * `detachBlock.ts`.
 */
import type { JsonObject } from 'tldraw'

import type { BlockShapeProps } from '../blockModel'
import type {
	ConnectionRoutingKind,
	ConnectionTemporalKind,
} from '../connections/connectionModel'
import type { ConnectionTerminal, PortFace } from '../connections/connectionModel'

/** The single key SystemSketch claims inside any shape's `meta`. */
export const SYSTEMSKETCH_META_KEY = 'systemSketch'

/**
 * Bumped only when an older record can no longer be read as written. A reader
 * that meets a newer version declines rather than guessing, the same rule the
 * `.systemsketch` envelope follows.
 */
export const DETACH_FORMAT_VERSION = 1

/** One end of a detached cable, as it was before the Block became primitives. */
export interface DetachedConnectionEnd {
	portId: string
	face: PortFace
}

export interface DetachedBlockRecord {
	kind: 'block'
	version: number
	/** The complete Block record. Already JSON — a Block prop is never a class. */
	props: BlockShapeProps
}

/** The rectangle inside the group that stood where the Block stood. */
export interface DetachedCardRecord {
	kind: 'block-card'
	version: number
}

export interface DetachedConnectionRecord {
	kind: 'connection'
	version: number
	routing: ConnectionRoutingKind
	/** The visual/semantic edge vocabulary needed if this arrow is rebuilt. */
	temporal: ConnectionTemporalKind
	delayValue: string
	pillPosition: number
	/** False for an arrow detached on its own; unrelated Block rebuilds leave it primitive. */
	rebuildWithBlocks: boolean
	/** Keyed by the terminal each end held, so a rebuild re-binds the same way round. */
	ends: Partial<Record<ConnectionTerminal, DetachedConnectionEnd>>
}

export type DetachedRecord =
	| DetachedBlockRecord
	| DetachedCardRecord
	| DetachedConnectionRecord

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Wrap a record for the `meta` field of the shape that will carry it. */
export function detachMeta(record: DetachedRecord): JsonObject {
	// The record is JSON by construction — every field is a string, a number,
	// a boolean, or a Block prop, and a Block prop is never a class.
	return { [SYSTEMSKETCH_META_KEY]: record as unknown as JsonObject }
}

/**
 * Read a record back, or `null`.
 *
 * Deliberately strict about the things a rebuild would otherwise guess at, and
 * deliberately silent about everything else: another tool's key inside `meta`
 * is none of SystemSketch's business, and a shape with no record at all is the
 * overwhelmingly common case, not an error.
 */
export function readDetachedRecord(meta: unknown): DetachedRecord | null {
	if (!isObject(meta)) return null
	const record = meta[SYSTEMSKETCH_META_KEY]
	if (!isObject(record)) return null
	if (typeof record.version !== 'number' || record.version > DETACH_FORMAT_VERSION) return null
	if (record.kind === 'block-card') {
		return { kind: 'block-card', version: record.version }
	}
	if (record.kind === 'block') {
		return isObject(record.props)
			? { kind: 'block', version: record.version, props: record.props as unknown as BlockShapeProps }
			: null
	}
	if (record.kind === 'connection') {
		const ends: Partial<Record<ConnectionTerminal, DetachedConnectionEnd>> = {}
		if (isObject(record.ends)) {
			for (const terminal of ['start', 'end'] as const) {
				const end = record.ends[terminal]
				if (isObject(end) && typeof end.portId === 'string'
					&& (end.face === 'outer' || end.face === 'inner')) {
					ends[terminal] = { portId: end.portId, face: end.face }
				}
			}
		}
		return {
			kind: 'connection',
			version: record.version,
			routing: (record.routing as ConnectionRoutingKind) ?? 'elbow',
			temporal: record.temporal === 'async' || record.temporal === 'delayed'
				? record.temporal
				: 'data',
			delayValue: typeof record.delayValue === 'string' ? record.delayValue : '',
			pillPosition: typeof record.pillPosition === 'number' ? record.pillPosition : 0.5,
			rebuildWithBlocks: record.rebuildWithBlocks !== false,
			ends,
		}
	}
	return null
}

/** The Block record a group carries, if it carries one. */
export function readDetachedBlock(meta: unknown): DetachedBlockRecord | null {
	const record = readDetachedRecord(meta)
	return record?.kind === 'block' ? record : null
}

/** The cable record an arrow carries, if it carries one. */
export function readDetachedConnection(meta: unknown): DetachedConnectionRecord | null {
	const record = readDetachedRecord(meta)
	return record?.kind === 'connection' ? record : null
}

export function isDetachedCard(meta: unknown): boolean {
	return readDetachedRecord(meta)?.kind === 'block-card'
}
