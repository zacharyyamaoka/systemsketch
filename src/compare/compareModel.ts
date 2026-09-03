/**
 * The three-state board comparison.
 *
 * The one substantive decision in this module is *why there are three states
 * and not two*, so it is worth stating before any code.
 *
 * A token diff inside one string only ever needs two. `run_inference` →
 * `run_predict` has no "modified token": the run `inference` was removed and
 * the run `predict` was added, and the only reason a reader sees "changed" is
 * that the two runs sit at the same position. Tokens carry no identity across
 * the two sides, so an LCS over them cannot express a third state and does not
 * need to. That is `wordDiff`'s job and it is correct there.
 *
 * A diff over *objects* is a different problem, because ports, Blocks and
 * cables do carry identity — a port id survives a rename, a Block id survives
 * a retitle. Identity is exactly what makes the third state both possible and
 * necessary:
 *
 *   - the id is on both sides, a field differs  → MODIFIED
 *   - the id is only on the after side          → ADDED
 *   - the id is only on the before side         → REMOVED
 *
 * And the consequence that this module exists to enforce: **a port that
 * appeared is an insertion of the port, not a modification of the Block that
 * gained it.** The Block's own identity persisted and none of the Block's own
 * fields changed, so the Block gets no `modified` row at all — the new port
 * gets an `added` row of its own, nested under it. Collapsing the two would
 * report one fact ("Block changed") where there are two ("Block persisted",
 * "port inserted"), and would leave the reviewer unable to see which.
 *
 * The second consequence is a rendering rule the table depends on:
 * word-level highlighting is only defined on a `modified` row. An `added` row
 * has no previous value and a `removed` row has no current one, so there is
 * nothing to align against and any ink inside those cells would be inventing a
 * comparison that does not exist. `canWordDiff` is that rule, and it is tested.
 *
 * Matching here is the identity ladder's **first rung only** — `stableId`. That
 * is the right and complete answer for revision history, which is what this
 * panel compares: a board saved twice keeps its record ids, so an id match is
 * exact rather than heuristic. The name / graph / source rungs exist for
 * target-vs-generated conformance, where ids legitimately differ, and are
 * deliberately not implemented here.
 */

import type { BlockPort } from '../blocks/blockModel'

/** The three states. Anything else is a presentation concern, not a state. */
export const CHANGE_KINDS = ['added', 'removed', 'modified'] as const
export type ChangeKind = (typeof CHANGE_KINDS)[number]

export const SUBJECT_KINDS = ['block', 'port', 'cable', 'shape'] as const
export type SubjectKind = (typeof SUBJECT_KINDS)[number]

/** One field that exists on both sides with a different value. */
export interface FieldChange {
	readonly path: string
	readonly before: string
	readonly after: string
}

export interface CompareChange {
	/** Stable within one comparison; the table and the canvas both key on it. */
	readonly id: string
	readonly subject: SubjectKind
	readonly kind: ChangeKind
	/** What a person calls this thing. */
	readonly name: string
	/** The change id of the Block this hangs under, for a nested table. */
	readonly parentId: string | null
	/** Where to draw on the before board. Null when the thing is not there. */
	readonly anchorBefore: string | null
	/** Where to draw on the after board. Null when the thing is not there. */
	readonly anchorAfter: string | null
	/** Set when the anchor is a port row rather than a whole shape. */
	readonly portId: string | null
	/**
	 * Empty on `added` and `removed` — by construction, not by accident. A row
	 * with no fields is a whole-object insertion or deletion.
	 */
	readonly fields: readonly FieldChange[]
	/** The raw record this was computed from, for the Code tab. */
	readonly recordBefore: unknown | null
	readonly recordAfter: unknown | null
}

export interface SubjectTally {
	added: number
	removed: number
	modified: number
}

export interface BoardCompare {
	readonly changes: readonly CompareChange[]
	readonly tally: Readonly<Record<SubjectKind, SubjectTally>>
	readonly total: number
}

/**
 * Whether a row's Previous/Current cells may carry word-level ink.
 *
 * True only for `modified`, because only there do both a before and an after
 * value exist to align. This is the rule that keeps the table from inventing a
 * comparison, and it is the object-level counterpart of `wordDiff.changed`.
 */
export function canWordDiff(change: Pick<CompareChange, 'kind' | 'fields'>): boolean {
	return change.kind === 'modified' && change.fields.length > 0
}

// ---------------------------------------------------------------------------
// Reading the two snapshots
// ---------------------------------------------------------------------------

/** The shape of a record we care about, kept structural so tests need no store. */
export interface RecordLike {
	id: string
	typeName: string
	type?: string
	props?: Record<string, unknown>
	fromId?: string
	toId?: string
}

export type RecordMap = Readonly<Record<string, RecordLike>>

/** A cable end, resolved from its binding record. */
interface CableEnd {
	shapeId: string
	portId: string
}

interface CableEnds {
	start: CableEnd | null
	end: CableEnd | null
}

/** Fields compared on a Block. Pose is deliberately absent — see below. */
export const BLOCK_COMPARE_FIELDS = ['title', 'description', 'blockType'] as const
/** Fields compared on a port row. */
export const PORT_COMPARE_FIELDS = ['name', 'type', 'defaultValue'] as const
/** Fields compared on a cable, beside its two endpoints. */
export const CABLE_COMPARE_FIELDS = ['temporal', 'delayValue', 'routing'] as const

/**
 * Position and z-order are appearance, not content.
 *
 * Every engineering tool in the prior-art sweep that has an opinion demotes or
 * hides pure positional change by default — LabVIEW behind a "Cosmetic"
 * checkbox, Camunda by only highlighting what "affects execution". A board
 * whose Blocks were nudged three pixels must not read as a board that changed.
 */
const IGNORED_PATHS = new Set(['x', 'y', 'rotation', 'index', 'parentId', 'opacity'])

function asText(value: unknown): string {
	if (value === undefined || value === null) return ''
	if (typeof value === 'string') return value
	if (typeof value === 'number' || typeof value === 'boolean') return String(value)
	return JSON.stringify(value)
}

function isShape(record: RecordLike): boolean {
	return record.typeName === 'shape'
}

function shapesOfType(records: RecordMap, type: string): RecordLike[] {
	return Object.values(records).filter((record) => isShape(record) && record.type === type)
}

function portsOf(record: RecordLike): BlockPort[] {
	const inputs = (record.props?.inputs as BlockPort[] | undefined) ?? []
	const outputs = (record.props?.outputs as BlockPort[] | undefined) ?? []
	return [...inputs, ...outputs]
}

/**
 * Resolve a cable's two ends from the binding records that hold it there.
 *
 * The endpoints are the only honest way to say a cable was *rewired*: its
 * `start`/`end` props are handle coordinates, which move whenever either Block
 * moves, so a coordinate diff would call every dragged board a rewiring.
 */
function cableEnds(records: RecordMap, cableId: string): CableEnds {
	const ends: CableEnds = { start: null, end: null }
	for (const record of Object.values(records)) {
		if (record.typeName !== 'binding') continue
		if (record.type !== 'connection') continue
		if (record.fromId !== cableId) continue
		const terminal = record.props?.terminal === 'end' ? 'end' : 'start'
		ends[terminal] = {
			shapeId: record.toId ?? '',
			portId: asText(record.props?.portId),
		}
	}
	return ends
}

/**
 * A cable end's identity: which port on which shape, and nothing else.
 *
 * Deliberately NOT the display label. The label contains the host Block's
 * title, so comparing labels made every cable touching a renamed Block report
 * itself as rewired — three false rows on the review fixture, caught by
 * `compareFixture.test.ts`. Renaming a Block does not move a cable; identity
 * decides the change and the label only describes it.
 */
function endIdentity(end: CableEnd | null): string {
	if (!end) return ''
	return `${end.shapeId}::${end.portId}`
}

function endLabel(end: CableEnd | null, records: RecordMap): string {
	if (!end) return ''
	const host = records[end.shapeId]
	const title = asText(host?.props?.title) || end.shapeId.replace(/^shape:/, '')
	const port = portsOf(host ?? { id: '', typeName: 'shape' }).find((p) => p.id === end.portId)
	return `${title}.${port?.name || end.portId}`
}

function blockLabel(record: RecordLike | undefined, fallbackId: string): string {
	if (!record) return fallbackId.replace(/^shape:/, '')
	const title = asText(record.props?.title)
	if (title) return title
	return `${record.type ?? 'shape'} ${fallbackId.replace(/^shape:/, '').slice(0, 8)}`
}

function compareFields(
	before: RecordLike,
	after: RecordLike,
	paths: readonly string[],
): FieldChange[] {
	const changes: FieldChange[] = []
	for (const path of paths) {
		if (IGNORED_PATHS.has(path)) continue
		const previous = asText(before.props?.[path])
		const current = asText(after.props?.[path])
		if (previous === current) continue
		changes.push({ path, before: previous, after: current })
	}
	return changes
}

function emptyTally(): Record<SubjectKind, SubjectTally> {
	return {
		block: { added: 0, removed: 0, modified: 0 },
		port: { added: 0, removed: 0, modified: 0 },
		cable: { added: 0, removed: 0, modified: 0 },
		shape: { added: 0, removed: 0, modified: 0 },
	}
}

/**
 * Compare two board record maps and return every change, in reading order.
 *
 * Order is Blocks first (each immediately followed by its own port rows, so a
 * nested table needs no second pass), then cables, then other shapes.
 */
export function compareBoards(before: RecordMap, after: RecordMap): BoardCompare {
	const changes: CompareChange[] = []
	const tally = emptyTally()

	const push = (change: CompareChange) => {
		changes.push(change)
		tally[change.subject][change.kind] += 1
	}

	// ---- Blocks, and the ports that hang off them -------------------------
	const blockIds = new Set<string>([
		...shapesOfType(before, 'block').map((r) => r.id),
		...shapesOfType(after, 'block').map((r) => r.id),
	])

	for (const blockId of [...blockIds].sort()) {
		const blockBefore = before[blockId]
		const blockAfter = after[blockId]
		const changeId = `block:${blockId}`
		const name = blockLabel(blockAfter ?? blockBefore, blockId)

		if (!blockBefore && blockAfter) {
			push({
				id: changeId, subject: 'block', kind: 'added', name, parentId: null,
				anchorBefore: null, anchorAfter: blockId, portId: null, fields: [],
				recordBefore: null, recordAfter: blockAfter,
			})
			continue
		}
		if (blockBefore && !blockAfter) {
			push({
				id: changeId, subject: 'block', kind: 'removed', name, parentId: null,
				anchorBefore: blockId, anchorAfter: null, portId: null, fields: [],
				recordBefore: blockBefore, recordAfter: null,
			})
			continue
		}
		if (!blockBefore || !blockAfter) continue

		// The Block persisted. It is `modified` ONLY if one of its OWN fields
		// differs. A port it gained or lost is that port's change, never this
		// one — that is the whole point of the third state.
		const ownFields = compareFields(blockBefore, blockAfter, BLOCK_COMPARE_FIELDS)
		const blockRowEmitted = ownFields.length > 0
		if (blockRowEmitted) {
			push({
				id: changeId, subject: 'block', kind: 'modified', name, parentId: null,
				anchorBefore: blockId, anchorAfter: blockId, portId: null, fields: ownFields,
				recordBefore: blockBefore, recordAfter: blockAfter,
			})
		}

		const portsBefore = new Map(portsOf(blockBefore).map((port) => [port.id, port]))
		const portsAfter = new Map(portsOf(blockAfter).map((port) => [port.id, port]))
		const portIds = new Set([...portsBefore.keys(), ...portsAfter.keys()])

		for (const portId of [...portIds].sort()) {
			const portBefore = portsBefore.get(portId)
			const portAfter = portsAfter.get(portId)
			const portChangeId = `port:${blockId}:${portId}`
			// A port row hangs under its Block whether or not the Block itself
			// produced a row, so the table can always nest it.
			const parentId = changeId
			const portName = portAfter?.name || portBefore?.name || portId

			if (!portBefore && portAfter) {
				push({
					id: portChangeId, subject: 'port', kind: 'added',
					name: `${name}.${portName}`, parentId,
					anchorBefore: null, anchorAfter: blockId, portId, fields: [],
					recordBefore: null, recordAfter: portAfter,
				})
				continue
			}
			if (portBefore && !portAfter) {
				push({
					id: portChangeId, subject: 'port', kind: 'removed',
					name: `${name}.${portBefore.name || portId}`, parentId,
					// A removed port has no row on the after board to point at,
					// so it anchors on the before board only. The display must
					// not invent a position for it.
					anchorBefore: blockId, anchorAfter: null, portId, fields: [],
					recordBefore: portBefore, recordAfter: null,
				})
				continue
			}
			if (!portBefore || !portAfter) continue

			const portFields: FieldChange[] = []
			for (const path of PORT_COMPARE_FIELDS) {
				const previous = asText((portBefore as unknown as Record<string, unknown>)[path])
				const current = asText((portAfter as unknown as Record<string, unknown>)[path])
				if (previous === current) continue
				portFields.push({ path, before: previous, after: current })
			}
			if (portFields.length === 0) continue
			push({
				id: portChangeId, subject: 'port', kind: 'modified',
				name: `${name}.${portName}`, parentId,
				anchorBefore: blockId, anchorAfter: blockId, portId, fields: portFields,
				recordBefore: portBefore, recordAfter: portAfter,
			})
		}
	}

	// ---- Cables -----------------------------------------------------------
	const cableIds = new Set<string>([
		...shapesOfType(before, 'connection').map((r) => r.id),
		...shapesOfType(after, 'connection').map((r) => r.id),
	])

	for (const cableId of [...cableIds].sort()) {
		const cableBefore = before[cableId]
		const cableAfter = after[cableId]
		const changeId = `cable:${cableId}`
		const endsBefore = cableEnds(before, cableId)
		const endsAfter = cableEnds(after, cableId)
		const label = (ends: CableEnds, records: RecordMap) => {
			const from = endLabel(ends.start, records)
			const to = endLabel(ends.end, records)
			return from || to ? `${from} → ${to}` : `cable ${cableId.replace(/^shape:/, '').slice(0, 8)}`
		}

		if (!cableBefore && cableAfter) {
			push({
				id: changeId, subject: 'cable', kind: 'added',
				name: label(endsAfter, after), parentId: null,
				anchorBefore: null, anchorAfter: cableId, portId: null, fields: [],
				recordBefore: null, recordAfter: cableAfter,
			})
			continue
		}
		if (cableBefore && !cableAfter) {
			push({
				id: changeId, subject: 'cable', kind: 'removed',
				name: label(endsBefore, before), parentId: null,
				anchorBefore: cableId, anchorAfter: null, portId: null, fields: [],
				recordBefore: cableBefore, recordAfter: null,
			})
			continue
		}
		if (!cableBefore || !cableAfter) continue

		const fields = compareFields(cableBefore, cableAfter, CABLE_COMPARE_FIELDS)
		// Rewiring is an endpoint fact, read off the bindings, never off the
		// handle coordinates — those move whenever a Block is dragged.
		for (const terminal of ['start', 'end'] as const) {
			// Identity decides whether it moved; the label only says where to.
			if (endIdentity(endsBefore[terminal]) === endIdentity(endsAfter[terminal])) continue
			fields.push({
				path: `endpoint.${terminal}`,
				before: endLabel(endsBefore[terminal], before),
				after: endLabel(endsAfter[terminal], after),
			})
		}
		if (fields.length === 0) continue
		push({
			id: changeId, subject: 'cable', kind: 'modified',
			name: label(endsAfter, after), parentId: null,
			anchorBefore: cableId, anchorAfter: cableId, portId: null, fields,
			recordBefore: cableBefore, recordAfter: cableAfter,
		})
	}

	// ---- Every other shape, as a whole ------------------------------------
	const otherIds = new Set<string>()
	for (const records of [before, after]) {
		for (const record of Object.values(records)) {
			if (!isShape(record)) continue
			if (record.type === 'block' || record.type === 'connection') continue
			otherIds.add(record.id)
		}
	}

	for (const shapeId of [...otherIds].sort()) {
		const shapeBefore = before[shapeId]
		const shapeAfter = after[shapeId]
		const changeId = `shape:${shapeId}`
		const name = blockLabel(shapeAfter ?? shapeBefore, shapeId)
		if (!shapeBefore && shapeAfter) {
			push({
				id: changeId, subject: 'shape', kind: 'added', name, parentId: null,
				anchorBefore: null, anchorAfter: shapeId, portId: null, fields: [],
				recordBefore: null, recordAfter: shapeAfter,
			})
			continue
		}
		if (shapeBefore && !shapeAfter) {
			push({
				id: changeId, subject: 'shape', kind: 'removed', name, parentId: null,
				anchorBefore: shapeId, anchorAfter: null, portId: null, fields: [],
				recordBefore: shapeBefore, recordAfter: null,
			})
			continue
		}
		if (!shapeBefore || !shapeAfter) continue
		const paths = new Set<string>([
			...Object.keys(shapeBefore.props ?? {}),
			...Object.keys(shapeAfter.props ?? {}),
		])
		const fields = compareFields(shapeBefore, shapeAfter, [...paths].sort())
		if (fields.length === 0) continue
		push({
			id: changeId, subject: 'shape', kind: 'modified', name, parentId: null,
			anchorBefore: shapeId, anchorAfter: shapeId, portId: null, fields,
			recordBefore: shapeBefore, recordAfter: shapeAfter,
		})
	}

	return { changes, tally, total: changes.length }
}

/** Pull the record map out of a tldraw store snapshot, in either shape. */
export function recordsOfSnapshot(snapshot: unknown): RecordMap {
	if (!snapshot || typeof snapshot !== 'object') return {}
	const candidate = snapshot as Record<string, unknown>
	const store = (candidate.store ?? candidate) as Record<string, unknown>
	const records: Record<string, RecordLike> = {}
	for (const [key, value] of Object.entries(store)) {
		if (!value || typeof value !== 'object') continue
		const record = value as RecordLike
		if (typeof record.typeName !== 'string') continue
		records[key] = record
	}
	return records
}
