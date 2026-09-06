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

/**
 * A stock-only delay label accompanies a detached delayed arrow. It is visual
 * geometry, not an alternate renderer: stock tldraw paints the oval and text
 * while this reference merely lets SystemSketch remove it if the arrow is
 * rebuilt into a semantic cable.
 */
export interface DetachedConnectionDelayPillRecord {
	kind: 'connection-delay-pill'
	version: number
	arrowId: string
}

export type DetachedRecord =
	| DetachedBlockRecord
	| DetachedCardRecord
	| DetachedConnectionRecord

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * The same value with every absent-but-present key removed.
 *
 * WHY: a shape's `props` and a shape's `meta` are validated by *different*
 * rules, so a record that is legal as one is not automatically legal as the
 * other. An optional prop (`T.number.optional()`) accepts a key whose value is
 * `undefined`, and tldraw's own update merge copies `props`/`meta` sub-keys
 * verbatim — `undefined` included — so a patch written to clear a field leaves
 * the key behind holding `undefined`. `meta` is validated by `T.jsonValue`,
 * which rejects `undefined` anywhere in the tree and reports the failure at the
 * top of `meta` rather than at the offending key. Copying props into meta
 * therefore has to re-state what "absent" means, at this seam, once — the
 * tempting alternative, a try/catch around the store write, would turn a
 * whole detach into a silent no-op.
 */
export function toJsonSafe<T>(value: T): T {
	return sanitize(value) as T
}

function sanitize(value: unknown): unknown {
	if (value === null) return null
	if (Array.isArray(value)) {
		// JSON has no hole: an undefined element becomes null so later indices
		// keep the position the author gave them.
		return value.map((entry) => {
			const next = sanitize(entry)
			return next === undefined ? null : next
		})
	}
	if (isObject(value)) {
		const next: Record<string, unknown> = {}
		for (const [key, entry] of Object.entries(value)) {
			const sanitized = sanitize(entry)
			if (sanitized === undefined) continue
			next[key] = sanitized
		}
		return next
	}
	const kind = typeof value
	if (kind === 'undefined' || kind === 'function' || kind === 'symbol' || kind === 'bigint') {
		return undefined
	}
	return value
}

/** Wrap a record for the `meta` field of the shape that will carry it. */
export function detachMeta(record: DetachedRecord): JsonObject {
	// Every field is a string, a number, a boolean, or a Block prop — but an
	// optional Block prop can be *present* and `undefined`, which `meta` refuses.
	return { [SYSTEMSKETCH_META_KEY]: toJsonSafe(record) as unknown as JsonObject }
}

export function detachedDelayPillMeta(arrowId: string): JsonObject {
	return {
		[SYSTEMSKETCH_META_KEY]: {
			kind: 'connection-delay-pill',
			version: DETACH_FORMAT_VERSION,
			arrowId,
		} as unknown as JsonObject,
	}
}

/** The owning arrow for a generated delay pill, if this is one. */
export function detachedDelayPillArrowId(meta: unknown): string | null {
	if (!isObject(meta)) return null
	const record = meta[SYSTEMSKETCH_META_KEY]
	if (!isObject(record) || record.kind !== 'connection-delay-pill') return null
	return typeof record.arrowId === 'string' ? record.arrowId : null
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
