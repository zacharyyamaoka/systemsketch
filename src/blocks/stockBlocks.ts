import {
	FIRST_BODY_ROW,
	HEADER_ROW,
	getDefaultBlockProps,
	normalizeBlockPortRows,
	type BlockPort,
	type BlockShapeProps,
} from './blockModel'
import type { TLStoreSnapshot } from 'tldraw'

/** Stable discriminants for the small set of curated, source-shaped Blocks. */
export const SET_ATTRIBUTES_BLOCK_TYPE = 'set-attributes'
export const SELECT_BLOCK_TYPE = 'select'
export const CLOCK_TRIGGER_BLOCK_TYPE = 'clock-trigger'
export const BUNDLE_BLOCK_TYPE = 'bundle'
export const UNBUNDLE_BLOCK_TYPE = 'unbundle'
export const COPY_BLOCK_TYPE = 'copy'

export type StockBlockPresetId =
	| 'set-attributes'
	| 'select'
	| 'clock-trigger'
	| 'bundle'
	| 'unbundle'
	| 'copy'
export type ClockTriggerSource = 'clock' | 'external' | 'manual'

export const DEFAULT_CLOCK_RATE_HZ = 10

export function isSetAttributesBlock(props: Pick<BlockShapeProps, 'blockType'>): boolean {
	return props.blockType.trim().toLowerCase() === SET_ATTRIBUTES_BLOCK_TYPE
}

export function isSelectBlock(props: Pick<BlockShapeProps, 'blockType'>): boolean {
	return props.blockType.trim().toLowerCase() === SELECT_BLOCK_TYPE
}

export function isClockTriggerBlock(props: Pick<BlockShapeProps, 'blockType'>): boolean {
	return props.blockType.trim().toLowerCase() === CLOCK_TRIGGER_BLOCK_TYPE
}

/** Legacy `merge` records remain readable, but Set attributes stays its own partial-update concept. */
export function isBundleBlock(props: Pick<BlockShapeProps, 'blockType'>): boolean {
	return props.blockType.trim().toLowerCase() === BUNDLE_BLOCK_TYPE
}

/** Legacy projection/split records mean the same field-reading operation as Unbundle. */
export function isUnbundleBlock(props: Pick<BlockShapeProps, 'blockType'>): boolean {
	return ['unbundle', 'projection'].includes(props.blockType.trim().toLowerCase())
}

function withPortView(props: BlockShapeProps): BlockShapeProps {
	return { ...props, view: 'port', w: props.views.port.w, h: props.views.port.h }
}

/**
 * Props for a named, batched record update.
 *
 * `member_N` is deliberately an identity, not the member spelling. Renaming
 * `.quota` to `.limit` therefore never detaches a cable that supplies its new
 * value. The one record outlet is ordinary data: this is an updated record,
 * not an effect escape hatch.
 */
export function createSetAttributesProps(base = getDefaultBlockProps()): BlockShapeProps {
	return withPortView(normalizeBlockPortRows({
		...base,
		title: 'Set attributes',
		description: 'Update named members; preserve every member not listed.',
		blockType: SET_ATTRIBUTES_BLOCK_TYPE,
		icon: 'Settings',
		inputs: [
			{ id: 'record', name: 'record', type: 'Record', visible: true, row: HEADER_ROW },
			{ id: 'member_1', name: '.field', type: '', visible: true, row: FIRST_BODY_ROW },
		],
		outputs: [
			{ id: 'record_out', name: 'record', type: 'Record', visible: true, row: HEADER_ROW },
		],
	}))
}

/** A pure value selection, intentionally distinct from an execution Branch. */
export function createSelectProps(base = getDefaultBlockProps()): BlockShapeProps {
	return withPortView(normalizeBlockPortRows({
		...base,
		title: 'Select',
		description: 'Choose one value; this is not a Branch region.',
		blockType: SELECT_BLOCK_TYPE,
		icon: 'GitBranch',
		inputs: [
			// A predicate is a first-class value input, not header chrome. Keeping it
			// in the first body row makes `condition` legible on the canvas and still
			// leaves the result outlet as ordinary value dataflow.
			{ id: 'condition', name: 'condition', type: 'bool', visible: true, row: FIRST_BODY_ROW },
			{ id: 'true_value', name: 'true', type: '', visible: true, row: FIRST_BODY_ROW + 1 },
			{ id: 'false_value', name: 'false', type: '', visible: true, row: FIRST_BODY_ROW + 2 },
		],
		outputs: [
			{ id: 'result', name: 'result', type: '', visible: true, row: FIRST_BODY_ROW + 1 },
		],
	}))
}

/**
 * A visible source declaration, rather than an untruthful embedded scheduler.
 *
 * The author can state source/rate intent now; this prototype does not schedule.
 */
export function createClockTriggerProps(base = getDefaultBlockProps()): BlockShapeProps {
	return withPortView({
		...base,
		title: 'Clock',
		// The semantic declaration below is always painted. `description` is only
		// the optional author annotation, so an empty annotation cannot hide or
		// contradict the Clock's source/rate boundary.
		description: '',
		blockType: CLOCK_TRIGGER_BLOCK_TYPE,
		icon: 'Timer',
		inputs: [],
		outputs: [{ id: 'trigger', name: 'trigger', type: 'Trigger', visible: true, row: HEADER_ROW }],
		stockConfig: { triggerSource: 'clock', rateHz: DEFAULT_CLOCK_RATE_HZ },
	})
}

/** Build one aggregate value from named member inputs without a hidden mutation effect. */
export function createBundleProps(base = getDefaultBlockProps()): BlockShapeProps {
	return withPortView(normalizeBlockPortRows({
		...base,
		title: 'Bundle',
		description: 'Return a retained record with named member updates; does not mutate the input.',
		blockType: BUNDLE_BLOCK_TYPE,
		icon: 'PackagePlus',
		inputs: [
			{ id: 'record', name: 'record', type: 'Record', visible: true, row: HEADER_ROW },
			{ id: 'member_1', name: '.field', type: '', visible: true, row: FIRST_BODY_ROW },
		],
		outputs: [{ id: 'record_out', name: 'record', type: 'Record', visible: true, row: FIRST_BODY_ROW }],
	}))
}

/** Read named values from an aggregate; its intentionally blank title keeps the wire's type primary. */
export function createUnbundleProps(base = getDefaultBlockProps()): BlockShapeProps {
	return withPortView(normalizeBlockPortRows({
		...base,
		title: '',
		description: 'Project named members from one aggregate; this does not execute the value.',
		blockType: UNBUNDLE_BLOCK_TYPE,
		icon: 'Shuffle',
		inputs: [{ id: 'record', name: '', type: '', visible: true, row: HEADER_ROW }],
		outputs: [{ id: 'out_1', name: '.', type: '', visible: true, row: FIRST_BODY_ROW }],
	}))
}

/** Make non-mutating intent explicit while remaining honest about Python's shallow-copy boundary. */
export function createCopyProps(base = getDefaultBlockProps()): BlockShapeProps {
	return withPortView(normalizeBlockPortRows({
		...base,
		title: 'Copy',
		description: 'Shallow copy — Python copy.copy(value); nested mutable members may remain shared.',
		blockType: COPY_BLOCK_TYPE,
		icon: 'Copy',
		inputs: [{ id: 'value', name: 'value', type: '', visible: true, row: FIRST_BODY_ROW }],
		outputs: [{ id: 'value_out', name: 'value', type: '', visible: true, row: FIRST_BODY_ROW }],
	}))
}

/** The one normalization boundary for a persisted Clock/Trigger declaration. */
export function normalizeClockTriggerConfig(config: BlockShapeProps['stockConfig']): NonNullable<BlockShapeProps['stockConfig']> {
	const source: ClockTriggerSource = config?.triggerSource === 'external' || config?.triggerSource === 'manual'
		? config.triggerSource
		: 'clock'
	const rateHz = config?.rateHz
	const validRate = typeof rateHz === 'number' && Number.isFinite(rateHz) && rateHz > 0
	return source === 'clock'
		? { triggerSource: source, rateHz: validRate ? rateHz : DEFAULT_CLOCK_RATE_HZ }
		: { triggerSource: source }
}

/** The visible declaration is derived at read time so stale saved prose cannot lie. */
export function clockTriggerLabel(config: BlockShapeProps['stockConfig']): string {
	const normalized = normalizeClockTriggerConfig(config)
	if (normalized.triggerSource === 'external') return 'External trigger'
	if (normalized.triggerSource === 'manual') return 'Manual trigger'
	return `Clock · ${normalized.rateHz} Hz`
}

/**
 * WHY: a Clock's editable generic description is not its semantic label.
 * Read configuration here instead of rewriting prose on every edit, so a
 * whiteboard annotation remains hackable while reopening never paints stale Hz.
 */
export function stockBlockVisibleDescription(props: BlockShapeProps): string {
	if (!isClockTriggerBlock(props)) return props.showDescription ? props.description : ''
	const declaration = `${clockTriggerLabel(props.stockConfig)} · prototype declares intent; does not schedule.`
	const annotation = props.showDescription ? props.description.trim() : ''
	return annotation ? `${declaration}\n${annotation}` : declaration
}

/** Normalize only the curated contract; ordinary Blocks remain fully literal. */
export function normalizeStockBlockProps(props: BlockShapeProps): BlockShapeProps {
	if (!isClockTriggerBlock(props)) return props
	const stockConfig = normalizeClockTriggerConfig(props.stockConfig)
	return JSON.stringify(stockConfig) === JSON.stringify(props.stockConfig) ? props : { ...props, stockConfig }
}

/**
 * Repair a current-schema import before it enters an Editor store.
 *
 * Shape migrations only run when their version changes, so a malformed V7
 * record (for example `rateHz: 0`) would otherwise paint as 10 Hz while
 * serializing its old fact. This is deliberately a pure snapshot transform:
 * loading does not enqueue store writes or create a persistence feedback loop.
 */
export function normalizeStockBlockSnapshot(snapshot: TLStoreSnapshot): TLStoreSnapshot {
	let changed = false
	const store = Object.fromEntries(Object.entries(snapshot.store).map(([id, record]) => {
		if (!record || typeof record !== 'object') return [id, record]
		const candidate = record as { type?: unknown; props?: unknown }
		if (candidate.type !== 'block' || !candidate.props || typeof candidate.props !== 'object') return [id, record]
		const props = candidate.props as BlockShapeProps
		const normalized = normalizeStockBlockProps(props)
		if (normalized === props) return [id, record]
		changed = true
		return [id, { ...candidate, props: normalized }]
	}))
	return changed ? { ...snapshot, store } as TLStoreSnapshot : snapshot
}

export function stockBlockPresetProps(
	preset: StockBlockPresetId,
	base = getDefaultBlockProps(),
): BlockShapeProps {
	switch (preset) {
		case 'set-attributes': return createSetAttributesProps(base)
		case 'select': return createSelectProps(base)
		case 'clock-trigger': return createClockTriggerProps(base)
		case 'bundle': return createBundleProps(base)
		case 'unbundle': return createUnbundleProps(base)
		case 'copy': return createCopyProps(base)
	}
}

/** The member inputs only; the ordinary record inlet is never a write row. */
export function setAttributesMemberPorts(props: Pick<BlockShapeProps, 'inputs'>): readonly BlockPort[] {
	return props.inputs.filter((port) => /^member_\d+$/.test(port.id))
}

function nextMemberId(inputs: readonly BlockPort[]): string {
	const max = inputs.reduce((highest, port) => {
		const match = /^member_(\d+)$/.exec(port.id)
		return match ? Math.max(highest, Number(match[1])) : highest
	}, 0)
	return `member_${max + 1}`
}

/**
 * Add one named update without making the editable member name into identity.
 * The next row is after the last existing member, which makes batching stable
 * in both the saved record and the ordinary inspector table.
 */
export function appendSetAttributesMemberProps(props: BlockShapeProps): BlockShapeProps {
	if (!isSetAttributesBlock(props)) return props
	const members = setAttributesMemberPorts(props)
	const row = members.reduce((last, port) => Math.max(last, port.row ?? FIRST_BODY_ROW), FIRST_BODY_ROW - 1) + 1
	return normalizeBlockPortRows({
		...props,
		inputs: [...props.inputs, {
			id: nextMemberId(props.inputs),
			name: '.field',
			type: '',
			visible: true,
			row,
		}],
	})
}

/** Bundle uses the same `member_N` identity scheme as Set attributes. */
export function bundleMemberPorts(props: Pick<BlockShapeProps, 'inputs'>): readonly BlockPort[] {
	return setAttributesMemberPorts(props)
}

/** Bundle rows share the stable `member_N` identity strategy, without making their editable spelling identity. */
export function appendBundleMemberProps(props: BlockShapeProps): BlockShapeProps {
	if (!isBundleBlock(props)) return props
	const members = bundleMemberPorts(props)
	const row = members.reduce((last, port) => Math.max(last, port.row ?? FIRST_BODY_ROW), FIRST_BODY_ROW - 1) + 1
	return normalizeBlockPortRows({
		...props,
		inputs: [...props.inputs, {
			id: nextMemberId(props.inputs), name: '.field', type: '', visible: true, row,
		}],
	})
}

/**
 * The intentionally small source spelling this UI can honestly promise.
 *
 * It is an authoring projection, not a Python parser or code generator. In
 * particular, Clock returns null: no adapter means the canvas cannot claim a
 * timer expression has become runnable Python.
 */
export function stockBlockSourceProjection(props: BlockShapeProps): string | null {
	if (isSelectBlock(props)) return 'true_value if condition else false_value'
	return null
}
