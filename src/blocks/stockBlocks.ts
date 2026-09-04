import {
	FIRST_BODY_ROW,
	HEADER_ROW,
	getDefaultBlockProps,
	normalizeBlockPortRows,
	type BlockPort,
	type BlockShapeProps,
} from './blockModel'

/** Stable discriminants for the small set of curated, source-shaped Blocks. */
export const SET_ATTRIBUTES_BLOCK_TYPE = 'set-attributes'
export const SELECT_BLOCK_TYPE = 'select'
export const CLOCK_TRIGGER_BLOCK_TYPE = 'clock-trigger'

export type StockBlockPresetId = 'set-attributes' | 'select' | 'clock-trigger'

export function isSetAttributesBlock(props: Pick<BlockShapeProps, 'blockType'>): boolean {
	return props.blockType.trim().toLowerCase() === SET_ATTRIBUTES_BLOCK_TYPE
}

export function isSelectBlock(props: Pick<BlockShapeProps, 'blockType'>): boolean {
	return props.blockType.trim().toLowerCase() === SELECT_BLOCK_TYPE
}

export function isClockTriggerBlock(props: Pick<BlockShapeProps, 'blockType'>): boolean {
	return props.blockType.trim().toLowerCase() === CLOCK_TRIGGER_BLOCK_TYPE
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
			{ id: 'condition', name: 'condition', type: 'bool', visible: true, row: HEADER_ROW },
			{ id: 'true_value', name: 'true', type: '', visible: true, row: FIRST_BODY_ROW },
			{ id: 'false_value', name: 'false', type: '', visible: true, row: FIRST_BODY_ROW + 1 },
		],
		outputs: [
			{ id: 'result', name: 'result', type: '', visible: true, row: FIRST_BODY_ROW },
		],
	}))
}

/**
 * A visible source declaration, rather than an untruthful embedded scheduler.
 *
 * The author can state intent (rate and source) now. An execution adapter must
 * change `runtimeAdapter` in a future supported contract before this Block can
 * mean that ticks are actually being emitted.
 */
export function createClockTriggerProps(base = getDefaultBlockProps()): BlockShapeProps {
	return withPortView({
		...base,
		title: 'Clock',
		description: '10 Hz authoring source · runtime adapter unavailable.',
		blockType: CLOCK_TRIGGER_BLOCK_TYPE,
		icon: 'Timer',
		inputs: [],
		outputs: [{ id: 'trigger', name: 'trigger', type: 'Trigger', visible: true, row: HEADER_ROW }],
		stockConfig: { triggerSource: 'clock', rateHz: 10, runtimeAdapter: 'unavailable' },
	})
}

export function stockBlockPresetProps(
	preset: StockBlockPresetId,
	base = getDefaultBlockProps(),
): BlockShapeProps {
	switch (preset) {
		case 'set-attributes': return createSetAttributesProps(base)
		case 'select': return createSelectProps(base)
		case 'clock-trigger': return createClockTriggerProps(base)
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
	const row = members.reduce((last, port) => Math.max(last, port.row ?? FIRST_BODY_ROW - 1), FIRST_BODY_ROW - 1) + 1
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

/**
 * The intentionally small source spelling this UI can honestly promise.
 *
 * It is an authoring projection, not a Python parser or code generator. In
 * particular, Clock returns null: no adapter means the canvas cannot claim a
 * timer expression has become runnable Python.
 */
export function stockBlockSourceProjection(props: BlockShapeProps): string | null {
	if (isSelectBlock(props)) return 'true_value if condition else false_value'
	if (isSetAttributesBlock(props)) {
		const members = setAttributesMemberPorts(props)
		const updates = members.map((port) => `${port.name.trim().replace(/^\./, '') || 'field'}=…`).join(', ')
		// WHY: Zach calls this primitive a batched `setattr`, while the still-open
		// value-vs-reference decision must not be silently answered by spelling it
		// as `dataclasses.replace`. Keep the preview faithful to the authored node
		// vocabulary until a source adapter can choose concrete Python semantics.
		return `setattr(record, ${updates || 'field=…'})`
	}
	return null
}
