import {
	blockIcon,
	blockPortLayout,
	blockPortSections,
	expandedSectionWeights,
	isEffectPort,
	portDefaultValue,
	portEdgeT,
	portInHeader,
	type BlockPort,
	type BlockShapeProps,
	type BlockView,
	type PortLayout,
} from './blockModel'

/** Donor pyblocks geometry constants. Keep rendering and connection anchors on this grid. */
export const BLOCK_CORNER_RADIUS = 9
export const BLOCK_PORT_RADIUS = 6
export const NODE_HEADER_HEIGHT_PX = 40
export const NODE_ROW_HEADER_GAP_PX = 8
export const NODE_ROW_BOTTOM_PADDING_PX = 8
export const TAG_STRIP_CLEARANCE_PX = 6
export const NODE_FOOTER_HEIGHT_PX = 46
export const NODE_ROW_HEIGHT_PX = 44
export const BLOCK_HEADER_HEIGHT_PX = 48
export const HEADER_PORT_PITCH_PX = 20
export const TLDRAW_TEXT_S_PX = 18
export const TLDRAW_TEXT_L_PX = 36
export const TLDRAW_TEXT_XL_PX = 44

/** Compatibility names used by the first SystemSketch frame renderer. */
export const BLOCK_HEADER_HEIGHT = BLOCK_HEADER_HEIGHT_PX
export const BLOCK_EXPANDED_HEADER_HEIGHT = BLOCK_HEADER_HEIGHT_PX

/** Expanded labels sit above the cable's edge line. */
export const EXPANDED_LABEL_LIFT_PX = 14
export const PORT_LABEL_INSET_PX = 12
export const PORT_LABEL_HEIGHT_PX = 24
export const EXPANDED_MIN_SECTION_PX = 32

export const PORT_TITLE_FONT_PX = TLDRAW_TEXT_L_PX
export const PORT_TEXT_FONT_PX = TLDRAW_TEXT_S_PX
export const HEADER_ICON_PX = 22
const HEADER_PAD_X = 12
const HEADER_GAP_PX = 8

/** Keep these in step with the painted flex row in `block-canvas.css`. */
const PORT_LABEL_GAP_PX = 8
const PORT_DEFAULT_CHIP_FONT_PX = 13
/** 7px horizontal padding and a 1px border on both sides. */
const PORT_DEFAULT_CHIP_CHROME_PX = 16
const PORT_DEFAULT_CHIP_MAX_PX = 88

/** Breathing room beyond the final glyph in an Expanded Block's grab band. */
export const PORT_LABEL_HIT_PAD_PX = 8

export const SIMPLE_TITLE_FONT_PX = TLDRAW_TEXT_XL_PX
export const SIMPLE_TEXT_FONT_PX = TLDRAW_TEXT_S_PX
export const SIMPLE_TITLE_LINE_PX = 50
export const SIMPLE_TEXT_LINE_PX = 24
export const SIMPLE_ICON_PX = 40
export const SIMPLE_ICON_GAP_PX = 12
/** The `value` view: a capsule one line tall, as wide as its text, one outlet on its rim. */
export const VALUE_HEIGHT_PX = 56
export const VALUE_PAD_X = 20
export const VALUE_FONT_PX = 24
export const VALUE_MIN_WIDTH_PX = 96
export const VALUE_MAX_WIDTH_PX = 640
const SIMPLE_STACK_GAP_PX = 10
const SIMPLE_PAD_X = 16
const SIMPLE_TITLE_MAX_LINES = 2
const DESCRIPTION_LINE_HEIGHT_PX = 16

/**
 * Where a port sits when it is placed on an edge by a fraction rather than by a
 * row. Shared on purpose: an effect port is the first caller, but a group
 * boundary port, a region tunnel entry and a collapsed-group crossing badge all
 * need exactly this, and `src/blocks/elbow/boundaryCrossing.ts` is what turns a
 * routed cable into the fraction to pass in.
 */
export function edgePortPoint(
	edge: 'left' | 'right' | 'top' | 'bottom',
	t: number,
	width: number,
	height: number,
): { x: number; y: number } {
	const clamped = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0.5))
	if (edge === 'top') return { x: clamped * width, y: 0 }
	if (edge === 'bottom') return { x: clamped * width, y: height }
	return { x: edge === 'left' ? 0 : width, y: clamped * height }
}

export interface BlockRect {
	x: number
	y: number
	w: number
	h: number
}

export interface LaidOutBlockPort {
	port: BlockPort
	side: 'input' | 'output'
	/**
	 * Which edge the dot sits on. Inputs are always `left` and named outputs
	 * always `right`; an effect output is on `top`, which is the only edge the
	 * grammar had not already spent.
	 */
	edge: 'left' | 'right' | 'top'
	/** Dot centre in Block-local coordinates; always on the outside edge. */
	x: number
	y: number
	/** Name/type box, absent for Simple and header inputs. */
	label: BlockRect | null
	/** The part of `label` occupied by its painted flex-row content. */
	labelContent: BlockRect | null
	/** Simple anchors exist for cables but remain visually quiet until hover. */
	subtle: boolean
	/** Expanded labels lift above the dot line so internal cables do not strike them. */
	lifted: boolean
}

export interface BlockDivider {
	kind: 'group' | 'branch'
	x: number
	y: number
	w: number
	/** Expanded-only metadata for redistributing the adjacent section weights. */
	adjust?: {
		prevKey: string
		nextKey: string
		prevWeight: number
		nextWeight: number
		rangeTop: number
		rangeBottom: number
		prevMin: number
		nextMin: number
	}
}

/** A horizontal band of the Block, in Block-local y. */
export interface BlockLayoutBand {
	top: number
	bottom: number
}

/**
 * Where one body row is painted, and where each of its output arms is. The
 * bands tile the body: a row's band runs from the divider above it to the
 * divider below, so a pointer's y always names exactly one row and one arm.
 */
export interface BlockLayoutSection {
	row: number
	band: BlockLayoutBand
	branches: { branch: number; band: BlockLayoutBand }[]
}

export interface BlockLayout {
	view: BlockView
	portLayout: PortLayout
	/** Canonical tldraw shape box. */
	bounds: BlockRect
	width: number
	height: number
	/** Port/Expanded heading paint and selectable frame handle; null in Simple. */
	header: BlockRect | null
	headerHeight: number
	/** Row 0, the band header inputs ride; null in Simple. */
	headerBand: BlockLayoutBand | null
	/** The body rows the layout painted, in order; empty in Simple. */
	sections: readonly BlockLayoutSection[]
	/** Paint body below the heading. Simple remains the whole face for compatibility. */
	body: BlockRect
	bodyTop: number
	footerTop: number
	/** The visible action strip; absent from the two chromeless views. */
	footer: BlockRect | null
	pitch: number
	description: BlockRect | null
	/** Drawable child area, non-null only for the real Expanded frame. */
	frameInterior: BlockRect | null
	/** Visible drawable ports. Hidden ids are recovered by the connection fallback. */
	ports: readonly LaidOutBlockPort[]
	/** Simple face boxes. */
	title: BlockRect | null
	typeLabel: BlockRect | null
	icon: BlockRect | null
	/** Port/Expanded body grammar. */
	dividers: readonly BlockDivider[]
	/** Port/Expanded heading content boxes. */
	headerIcon: BlockRect | null
	headerTitle: BlockRect | null
	headerType: BlockRect | null
}

function finiteDimension(value: number): number {
	return Number.isFinite(value) ? Math.max(1, value) : 1
}

interface BodySlotPlan {
	slotCount: number
	slotOf: Map<string, number>
	dividers: { kind: 'group' | 'branch'; slot: number }[]
	/**
	 * The rows in paint order with their slot ranges, and for each output arm
	 * the slot its half-line divider took — `null` for a row's first arm, which
	 * starts at the row itself.
	 */
	rows: {
		row: number
		start: number
		end: number
		branches: { branch: number; dividerSlot: number | null }[]
	}[]
}

/**
 * Resolve the Port view's burger grammar onto one 44px grid. Group and branch
 * dividers each consume a full slot, exactly as in the mature pyblocks face.
 */
function planBodySlots(props: BlockShapeProps): BodySlotPlan {
	const sections = blockPortSections(props, { visibleOnly: true })
	const portLayout = blockPortLayout(props)

	const slotOf = new Map<string, number>()
	const dividers: BodySlotPlan['dividers'] = []
	const rows: BodySlotPlan['rows'] = []
	let slot = 0
	sections.rows.forEach((section, rowIndex) => {
		if (rowIndex > 0) {
			dividers.push({ kind: 'group', slot })
			slot += 1
		}

		const inputs = section.inputs
		const outputSequence: (
			| { kind: 'port'; port: BlockPort }
			| { kind: 'divider'; branch: number }
		)[] = []
		section.branches.forEach((arm, armIndex) => {
			if (armIndex > 0) outputSequence.push({ kind: 'divider', branch: arm.branch })
			for (const port of arm.outputs) outputSequence.push({ kind: 'port', port })
		})

		const rowStart = slot
		const inputStart = slot
		const outputStart = portLayout === 'inline' ? slot : slot + inputs.length
		inputs.forEach((port, index) => slotOf.set(port.id, inputStart + index))
		const dividerSlotOfArm = new Map<number, number>()
		outputSequence.forEach((entry, index) => {
			if (entry.kind === 'port') slotOf.set(entry.port.id, outputStart + index)
			else {
				dividers.push({ kind: 'branch', slot: outputStart + index })
				dividerSlotOfArm.set(entry.branch, outputStart + index)
			}
		})

		const used = portLayout === 'inline'
			? Math.max(inputs.length, outputSequence.length)
			: inputs.length + outputSequence.length
		slot += Math.max(used, 1)
		rows.push({
			row: section.row,
			start: rowStart,
			end: slot,
			branches: section.branches.map((arm) => ({
				branch: arm.branch,
				dividerSlot: dividerSlotOfArm.get(arm.branch) ?? null,
			})),
		})
	})

	return { slotCount: Math.max(slot, 1), slotOf, dividers, rows }
}

export function blockPortSlotCount(props: BlockShapeProps): number {
	return planBodySlots(props).slotCount
}

/**
 * The Port-view height at which `slotCount` rows all keep the full 44px pitch.
 *
 * `layoutBlock` compresses `pitch` to whatever room is left, so adding a port
 * to a full box silently squeezes every existing row. This is the exact inverse
 * of that clamp and therefore lives beside it: any change to the body's padding
 * or to the footer has to move both numbers together or neither.
 */
export function blockPortViewHeightForSlots(
	props: BlockShapeProps,
	slotCount: number,
): number {
	const layout = layoutBlock(props)
	const descriptionReserve = showsDescription(props) ? DESCRIPTION_LINE_HEIGHT_PX + 4 : 0
	return Math.ceil(
		layout.headerHeight
		+ NODE_ROW_HEADER_GAP_PX
		+ NODE_ROW_HEIGHT_PX * Math.max(1, slotCount)
		+ NODE_ROW_BOTTOM_PADDING_PX
		+ descriptionReserve
		+ NODE_FOOTER_HEIGHT_PX,
	)
}

function minExpandedSectionHeight(slotCount: number): number {
	return Math.max(EXPANDED_MIN_SECTION_PX, PORT_LABEL_HEIGHT_PX * (slotCount + 1))
}

/**
 * Expanded view stretches the same group/branch grammar over the open frame.
 * Ports spread independently within their own weighted region or section.
 */
function placeExpandedBody(
	props: BlockShapeProps,
	width: number,
	bodyTop: number,
	bodyBottom: number,
	place: (port: BlockPort, side: 'input' | 'output', y: number) => void,
	dividers: BlockDivider[],
	sections: BlockLayoutSection[],
) {
	const regionHeight = Math.max(0, bodyBottom - bodyTop)
	const weights = expandedSectionWeights(props)
	const table = blockPortSections(props, { visibleOnly: true })

	const groups: {
		row: number
		inputs: BlockPort[]
		branches: { branch: number; ports: BlockPort[] }[]
		key: string
		weight: number
		slots: number
	}[] = []

	table.rows.forEach((section, index) => {
		const inputs = section.inputs
		const groupOutputs = section.branches.flatMap((arm) => arm.outputs)
		const branches = groupOutputs.length > 0
			? section.branches.map((arm) => ({ branch: arm.branch, ports: arm.outputs }))
			: []
		const outputSlots = groupOutputs.length + Math.max(0, branches.length - 1)
		const firstPort = groupOutputs[0] ?? inputs[0]
		const key = `g:${firstPort ? firstPort.id : index}`
		const slots = Math.max(inputs.length, outputSlots)
		groups.push({ row: section.row, inputs, branches, key, weight: weights[key] ?? slots + 1, slots })
	})

	const totalWeight = groups.reduce((sum, group) => sum + group.weight, 0) || 1
	let groupTop = bodyTop
	groups.forEach((group, groupIndex) => {
		const groupHeight = (regionHeight * group.weight) / totalWeight
		const groupSection: BlockLayoutSection = {
			row: group.row,
			band: { top: groupTop, bottom: groupTop + groupHeight },
			branches: [],
		}
		sections.push(groupSection)
		if (groupIndex > 0) {
			const previous = groups[groupIndex - 1]
			dividers.push({
				kind: 'group',
				x: 0,
				y: groupTop,
				w: width,
				adjust: {
					prevKey: previous.key,
					nextKey: group.key,
					prevWeight: previous.weight,
					nextWeight: group.weight,
					rangeTop: groupTop - (regionHeight * previous.weight) / totalWeight,
					rangeBottom: groupTop + groupHeight,
					prevMin: minExpandedSectionHeight(previous.slots),
					nextMin: minExpandedSectionHeight(group.slots),
				},
			})
		}

		group.inputs.forEach((port, index) => {
			place(port, 'input', groupTop + (groupHeight * (index + 1)) / (group.inputs.length + 1))
		})

		const arms = group.branches.map((arm) => {
			const key = `b:${arm.ports[0].id}`
			return { ...arm, key, weight: weights[key] ?? arm.ports.length + 1 }
		})
		const armTotal = arms.reduce((sum, arm) => sum + arm.weight, 0) || 1
		let armTop = groupTop
		arms.forEach((arm, armIndex) => {
			const armHeight = (groupHeight * arm.weight) / armTotal
			groupSection.branches.push({
				branch: arm.branch,
				band: { top: armTop, bottom: armTop + armHeight },
			})
			if (armIndex > 0) {
				const previous = arms[armIndex - 1]
				dividers.push({
					kind: 'branch',
					x: width / 2,
					y: armTop,
					w: width / 2,
					adjust: {
						prevKey: previous.key,
						nextKey: arm.key,
						prevWeight: previous.weight,
						nextWeight: arm.weight,
						rangeTop: armTop - (groupHeight * previous.weight) / armTotal,
						rangeBottom: armTop + armHeight,
						prevMin: minExpandedSectionHeight(previous.ports.length),
						nextMin: minExpandedSectionHeight(arm.ports.length),
					},
				})
			}
			arm.ports.forEach((port, index) => {
				place(port, 'output', armTop + (armHeight * (index + 1)) / (arm.ports.length + 1))
			})
			armTop += armHeight
		})
		// A row with no visible outputs still has one arm, spanning the row.
		if (groupSection.branches.length === 0) {
			groupSection.branches.push({ branch: 0, band: { ...groupSection.band } })
		}

		groupTop += groupHeight
	})
}

function showsDescription(props: BlockShapeProps): boolean {
	return props.showDescription && props.description.trim() !== ''
}

let simpleMeasureContext: CanvasRenderingContext2D | null | undefined
const TEXT_FAMILIES = {
	sans: { css: "'Inter', sans-serif", advance: 0.55 },
	mono: { css: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace", advance: 0.6 },
} as const

/**
 * Measure a run of text in one of the Block's two faces. Off the DOM (unit
 * tests, the Python host) the answer is a deterministic per-glyph advance, so
 * a layout computed there is stable rather than exact.
 */
export function measureBlockText(
	text: string,
	px: number,
	weight: number,
	family: keyof typeof TEXT_FAMILIES = 'sans',
): number {
	if (simpleMeasureContext === undefined) {
		simpleMeasureContext = typeof document === 'undefined'
			? null
			: (document.createElement('canvas').getContext('2d') ?? null)
	}
	if (simpleMeasureContext) {
		simpleMeasureContext.font = `${weight} ${px}px ${TEXT_FAMILIES[family].css}`
		const width = simpleMeasureContext.measureText(text).width
		if (width > 0) return width
	}
	return text.length * px * TEXT_FAMILIES[family].advance
}

/** Width of the name, type, default chip, and the gaps painted between them. */
function portLabelContentWidth(port: BlockPort, side: 'input' | 'output'): number {
	const parts: number[] = []
	if (port.name !== '') parts.push(measureBlockText(port.name, PORT_TEXT_FONT_PX, 400))
	if (port.type !== '') parts.push(measureBlockText(port.type, PORT_TEXT_FONT_PX, 400, 'mono'))
	const defaultValue = side === 'input' ? portDefaultValue(port) : ''
	if (defaultValue !== '') {
		parts.push(Math.min(
			PORT_DEFAULT_CHIP_MAX_PX,
			measureBlockText(`= ${defaultValue}`, PORT_DEFAULT_CHIP_FONT_PX, 400, 'mono')
				+ PORT_DEFAULT_CHIP_CHROME_PX,
		))
	}
	if (parts.length === 0) return 0
	return parts.reduce((total, part) => total + part, 0)
		+ PORT_LABEL_GAP_PX * (parts.length - 1)
}

/** Pack the measured content against the same lane edge as the painted row. */
function portLabelContentBox(
	port: BlockPort,
	side: 'input' | 'output',
	label: BlockRect,
): BlockRect {
	const w = Math.max(0, Math.min(label.w, portLabelContentWidth(port, side)))
	return {
		x: side === 'input' ? label.x : label.x + label.w - w,
		y: label.y,
		w,
		h: label.h,
	}
}

/**
 * The pointer target behind one Expanded port label. It joins the words to the
 * Block edge, but deliberately stops after the painted content so the middle
 * of the frame remains drawable child canvas.
 */
export function portLabelHitArea(placed: LaidOutBlockPort, width: number): BlockRect | null {
	if (placed.subtle || !placed.labelContent) return null
	const content = placed.labelContent
	const near = placed.side === 'input' ? 0 : width
	const far = placed.side === 'input'
		? content.x + content.w + PORT_LABEL_HIT_PAD_PX
		: content.x - PORT_LABEL_HIT_PAD_PX
	const left = Math.max(0, Math.min(near, far))
	const right = Math.min(width, Math.max(near, far))
	return { x: left, y: content.y, w: Math.max(0, right - left), h: content.h }
}

function measureSimpleText(text: string, px: number, weight: number): number {
	return measureBlockText(text, px, weight, 'sans')
}

function estimateWrappedLines(
	text: string,
	px: number,
	weight: number,
	maxWidth: number,
): number {
	const words = text.trim().split(/\s+/).filter(Boolean)
	if (words.length === 0 || maxWidth <= 0) return 1
	const spaceWidth = Math.max(1, measureSimpleText(' ', px, weight))
	let lines = 1
	let lineWidth = 0
	for (const word of words) {
		const wordWidth = measureSimpleText(word, px, weight)
		const lead = lineWidth === 0 ? 0 : lineWidth + spaceWidth
		if (lead + wordWidth <= maxWidth) {
			lineWidth = lead + wordWidth
		} else if (wordWidth > maxWidth) {
			const brokenLines = Math.ceil(wordWidth / maxWidth)
			lines += brokenLines - (lineWidth === 0 ? 1 : 0)
			const remainder = wordWidth % maxWidth
			lineWidth = remainder === 0 ? maxWidth : remainder
		} else {
			lines += 1
			lineWidth = wordWidth
		}
	}
	return lines
}

/**
 * One layout per props object.
 *
 * tldraw records are immutable and a move keeps the same `props` object, so
 * the props' identity changes exactly when the layout's inputs might have. The
 * renderer, the geometry, the indicator, the port table, the cable validity
 * checks and the add-port affordance all ask for the same layout of the same
 * props many times per frame — measured at 157 ms of a 2.3 s select-all drag
 * on 48 Blocks before this memo, most of it `planBodySlots` and canvas text
 * measurement. Keyed weakly, so a synthesised props object (the add-port
 * preview) is collected with its caller.
 *
 * Text is measured against whichever fonts are loaded, so every memoised
 * layout is forgotten once the document's fonts finish loading: a width
 * measured on a fallback face must not outlive the face it was measured for.
 */
let layoutMemo = new WeakMap<BlockShapeProps, BlockLayout>()

if (typeof document !== 'undefined' && 'fonts' in document) {
	const forgetLayouts = () => {
		layoutMemo = new WeakMap()
	}
	document.fonts.ready.then(forgetLayouts, () => undefined)
	document.fonts.addEventListener('loadingdone', forgetLayouts)
}

/**
 * The one geometric projection for the Block. Rendering, selection geometry,
 * connection anchors and frame interaction all consume this immutable result.
 */
export function layoutBlock(props: BlockShapeProps): BlockLayout {
	const memoized = layoutMemo.get(props)
	if (memoized) return memoized
	const layout = computeBlockLayout(props)
	layoutMemo.set(props, layout)
	return layout
}

function computeBlockLayout(rawProps: BlockShapeProps): BlockLayout {
	// An effect port is an output that leaves by the *top* edge, because the call
	// gave its value no name to leave by. Keep it out of the right-hand lane
	// entirely — it must not take a body slot or the rows would space around a
	// port that is not there — and place it along the top once the box is known.
	const effectPorts = rawProps.outputs.filter(isEffectPort)
	const props = effectPorts.length > 0
		? { ...rawProps, outputs: rawProps.outputs.filter((port) => !isEffectPort(port)) }
		: rawProps
	const width = finiteDimension(props.w)
	const height = finiteDimension(props.h)
	const bounds = { x: 0, y: 0, w: width, h: height }
	const view = props.view
	const portLayout = blockPortLayout(props)
	const visibleHeaderInputs = view === 'simple'
		? []
		: props.inputs.filter((port) => port.visible && portInHeader(port))
	const headerHeight = view === 'simple'
		? Math.min(NODE_HEADER_HEIGHT_PX, height)
		: Math.min(
			height,
			Math.max(BLOCK_HEADER_HEIGHT_PX, visibleHeaderInputs.length * HEADER_PORT_PITCH_PX + 8),
		)
	const bodyTop = headerHeight + NODE_ROW_HEADER_GAP_PX
	const footerTop = Math.max(bodyTop, height - NODE_FOOTER_HEIGHT_PX)
	const placed: LaidOutBlockPort[] = []

	if (view === 'value') {
		// The capsule: one text box across the whole face, the inlet centred on
		// the left rim and the outlet on the right — a pill is a variable, fed
		// or read or both, so both rims carry a dot.
		const midpoint = height / 2
		for (const port of props.inputs.filter((candidate) => candidate.visible)) {
			placed.push({ port, side: 'input', edge: 'left', x: 0, y: midpoint, label: null, labelContent: null, subtle: false, lifted: false })
		}
		for (const port of props.outputs.filter((candidate) => candidate.visible)) {
			placed.push({ port, side: 'output', edge: 'right', x: width, y: midpoint, label: null, labelContent: null, subtle: false, lifted: false })
		}
		for (const port of effectPorts.filter((candidate) => candidate.visible)) {
			const point = edgePortPoint('top', portEdgeT(port), width, height)
			placed.push({ port, side: 'output', edge: 'top', x: point.x, y: point.y, label: null, labelContent: null, subtle: false, lifted: false })
		}
		return {
			view,
			portLayout,
			bounds,
			width,
			height,
			header: null,
			headerHeight: 0,
			// A capsule has no burger: no heading band, no body rows to divide.
			headerBand: null,
			sections: [],
			body: bounds,
			bodyTop: 0,
			footerTop: height,
			footer: null,
			pitch: NODE_ROW_HEIGHT_PX,
			description: null,
			frameInterior: null,
			ports: placed,
			title: { x: VALUE_PAD_X, y: 0, w: Math.max(0, width - VALUE_PAD_X * 2), h: height },
			typeLabel: null,
			icon: null,
			dividers: [],
			headerIcon: null,
			headerTitle: null,
			headerType: null,
		}
	}

	if (view === 'simple') {
		const innerWidth = Math.max(0, width - SIMPLE_PAD_X * 2)
		const hasIcon = blockIcon(props) !== ''
		const titleTextWidth = Math.max(
			0,
			innerWidth - (hasIcon ? SIMPLE_ICON_PX + SIMPLE_ICON_GAP_PX : 0),
		)
		const titleLines = Math.min(
			SIMPLE_TITLE_MAX_LINES,
			estimateWrappedLines(props.title, SIMPLE_TITLE_FONT_PX, 600, titleTextWidth),
		)
		const titleHeight = Math.max(
			titleLines * SIMPLE_TITLE_LINE_PX,
			hasIcon ? SIMPLE_ICON_PX : 0,
		)

		let descriptionHeight = 0
		if (showsDescription(props)) {
			const wanted = estimateWrappedLines(
				props.description,
				SIMPLE_TEXT_FONT_PX,
				400,
				innerWidth,
			)
			const roomFor = Math.floor(
				(footerTop - titleHeight - SIMPLE_STACK_GAP_PX - 16) / SIMPLE_TEXT_LINE_PX,
			)
			descriptionHeight = Math.max(
				1,
				Math.min(wanted, Math.max(1, roomFor)),
			) * SIMPLE_TEXT_LINE_PX
		}

		const stackHeight = titleHeight + (
			descriptionHeight > 0 ? SIMPLE_STACK_GAP_PX + descriptionHeight : 0
		)
		const top = Math.max(8, (footerTop - stackHeight) / 2)
		const title: BlockRect = { x: SIMPLE_PAD_X, y: top, w: innerWidth, h: titleHeight }
		const description: BlockRect | null = descriptionHeight > 0
			? {
				x: SIMPLE_PAD_X,
				y: top + titleHeight + SIMPLE_STACK_GAP_PX,
				w: innerWidth,
				h: descriptionHeight,
			}
			: null
		const typeLabel: BlockRect | null = props.blockType !== ''
			? {
				x: SIMPLE_PAD_X,
				y: footerTop + (
					NODE_FOOTER_HEIGHT_PX - TAG_STRIP_CLEARANCE_PX - SIMPLE_TEXT_LINE_PX
				) / 2,
				w: innerWidth,
				h: SIMPLE_TEXT_LINE_PX,
			}
			: null

		let icon: BlockRect | null = null
		if (hasIcon) {
			const textWidth = titleLines > 1
				? titleTextWidth
				: Math.min(
					measureSimpleText(props.title, SIMPLE_TITLE_FONT_PX, 600),
					titleTextWidth,
				)
			const groupWidth = SIMPLE_ICON_PX + SIMPLE_ICON_GAP_PX + textWidth
			icon = {
				x: SIMPLE_PAD_X + Math.max(0, (innerWidth - groupWidth) / 2),
				y: title.y + (titleHeight - SIMPLE_ICON_PX) / 2,
				w: SIMPLE_ICON_PX,
				h: SIMPLE_ICON_PX,
			}
		}

		const midpoint = height / 2
		// SystemSketch's outward layout list doubles as the connection-anchor
		// table, so retain every visible identity at the donor's coincident
		// midpoint. BlockCanvas de-duplicates the painted affordance by point.
		for (const port of props.inputs.filter((candidate) => candidate.visible)) {
			placed.push({
				port,
				side: 'input',
				edge: 'left',
				x: 0,
				y: midpoint,
				label: null,
				labelContent: null,
				subtle: true,
				lifted: false,
			})
		}
		for (const port of props.outputs.filter((candidate) => candidate.visible)) {
			placed.push({
				port,
				side: 'output',
				edge: 'right',
				x: width,
				y: midpoint,
				label: null,
				labelContent: null,
				subtle: true,
				lifted: false,
			})
		}
		for (const port of effectPorts.filter((candidate) => candidate.visible)) {
			const point = edgePortPoint('top', portEdgeT(port), width, height)
			placed.push({
				port,
				side: 'output',
				edge: 'top',
				x: point.x,
				y: point.y,
				label: null,
				labelContent: null,
				subtle: true,
				lifted: false,
			})
		}

		return {
			view,
			portLayout,
			bounds,
			width,
			height,
			header: null,
			headerHeight,
			headerBand: null,
			sections: [],
			body: bounds,
			bodyTop,
			footerTop,
			footer: null,
			pitch: NODE_ROW_HEIGHT_PX,
			description,
			frameInterior: null,
			ports: placed,
			title,
			typeLabel,
			icon,
			dividers: [],
			headerIcon: null,
			headerTitle: null,
			headerType: null,
		}
	}

	const header: BlockRect = { x: 0, y: 0, w: width, h: headerHeight }
	const body: BlockRect = {
		x: 0,
		y: headerHeight,
		w: width,
		h: Math.max(0, height - headerHeight),
	}

	visibleHeaderInputs.forEach((port, index) => {
		const y = headerHeight / 2 + (
			index - (visibleHeaderInputs.length - 1) / 2
		) * HEADER_PORT_PITCH_PX
		placed.push({
			port,
			side: 'input',
			edge: 'left',
			x: 0,
			y,
			label: null,
			labelContent: null,
			subtle: false,
			lifted: false,
		})
	})

	const descriptionReserve = showsDescription(props) ? DESCRIPTION_LINE_HEIGHT_PX + 4 : 0
	const dividers: BlockDivider[] = []
	const sections: BlockLayoutSection[] = []
	let pitch = NODE_ROW_HEIGHT_PX

	if (view === 'expanded') {
		const bodyBottom = Math.max(bodyTop, footerTop - descriptionReserve)
		const place = (port: BlockPort, side: 'input' | 'output', y: number) => {
			const x = side === 'input' ? 0 : width
			const labelWidth = Math.max(0, width / 2 - PORT_LABEL_INSET_PX - 8)
			const label: BlockRect = {
				x: side === 'input'
					? PORT_LABEL_INSET_PX
					: width - PORT_LABEL_INSET_PX - labelWidth,
				y: y - EXPANDED_LABEL_LIFT_PX - PORT_LABEL_HEIGHT_PX / 2,
				w: labelWidth,
				h: PORT_LABEL_HEIGHT_PX,
			}
			const labelContent = portLabelContentBox(port, side, label)
			placed.push({ port, side, edge: side === 'input' ? 'left' : 'right', x, y, label, labelContent, subtle: false, lifted: true })
		}
		placeExpandedBody(props, width, bodyTop, bodyBottom, place, dividers, sections)
	} else {
		const plan = planBodySlots(props)
		const available = Math.max(
			0,
			footerTop - NODE_ROW_BOTTOM_PADDING_PX - bodyTop - descriptionReserve,
		)
		pitch = Math.min(NODE_ROW_HEIGHT_PX, available / plan.slotCount)
		const centreOf = (slot: number) => bodyTop + pitch * slot + pitch / 2

		// Bands meet on the divider lines, which sit at a slot's centre; the
		// first row starts at the body and the last runs to the rows' end.
		const rowsBottom = bodyTop + pitch * plan.slotCount
		plan.rows.forEach((row, index) => {
			const top = index === 0 ? bodyTop : centreOf(row.start - 1)
			const bottom = index === plan.rows.length - 1
				? rowsBottom
				: centreOf(plan.rows[index + 1].start - 1)
			const branches = row.branches.map((arm, armIndex) => ({
				branch: arm.branch,
				band: {
					top: armIndex === 0 || arm.dividerSlot === null ? top : centreOf(arm.dividerSlot),
					bottom: armIndex === row.branches.length - 1
						? bottom
						: centreOf(row.branches[armIndex + 1].dividerSlot ?? row.end),
				},
			}))
			sections.push({ row: row.row, band: { top, bottom }, branches })
		})

		const placeBody = (ports: readonly BlockPort[], side: 'input' | 'output') => {
			for (const port of ports) {
				const slot = plan.slotOf.get(port.id)
				if (slot === undefined) continue
				const y = centreOf(slot)
				const x = side === 'input' ? 0 : width
				const labelWidth = portLayout === 'inline'
					? Math.max(0, width / 2 - PORT_LABEL_INSET_PX - 8)
					: Math.max(0, width - PORT_LABEL_INSET_PX * 2)
				const label: BlockRect = {
					x: side === 'input'
						? PORT_LABEL_INSET_PX
						: width - PORT_LABEL_INSET_PX - labelWidth,
					y: y - PORT_LABEL_HEIGHT_PX / 2,
					w: labelWidth,
					h: PORT_LABEL_HEIGHT_PX,
				}
				const labelContent = portLabelContentBox(port, side, label)
				placed.push({ port, side, edge: side === 'input' ? 'left' : 'right', x, y, label, labelContent, subtle: false, lifted: false })
			}
		}

		placeBody(props.inputs, 'input')
		placeBody(props.outputs, 'output')
		dividers.push(...plan.dividers.map(({ kind, slot }) => ({
			kind,
			x: kind === 'group' ? 0 : width / 2,
			y: centreOf(slot),
			w: kind === 'group' ? width : width / 2,
		})))
	}

	const hasHeaderIcon = blockIcon(props) !== ''
	const headerIcon: BlockRect | null = hasHeaderIcon
		? {
			x: HEADER_PAD_X,
			y: (headerHeight - HEADER_ICON_PX) / 2,
			w: HEADER_ICON_PX,
			h: HEADER_ICON_PX,
		}
		: null
	const headerTypeWidth = props.blockType !== ''
		? Math.min(measureSimpleText(props.blockType, TLDRAW_TEXT_S_PX, 400), width * 0.35)
		: 0
	const headerType: BlockRect | null = headerTypeWidth > 0
		? {
			x: width - HEADER_PAD_X - headerTypeWidth,
			y: 0,
			w: headerTypeWidth,
			h: headerHeight,
		}
		: null
	const titleLeft = HEADER_PAD_X + (hasHeaderIcon ? HEADER_ICON_PX + HEADER_GAP_PX : 0)
	const titleRight = headerType ? headerType.x - HEADER_GAP_PX : width - HEADER_PAD_X
	const headerTitle: BlockRect = {
		x: titleLeft,
		y: 0,
		w: Math.max(0, titleRight - titleLeft),
		h: headerHeight,
	}

	let description: BlockRect | null = null
	if (showsDescription(props)) {
		const lastTop = Math.max(bodyTop, footerTop - 4 - DESCRIPTION_LINE_HEIGHT_PX)
		const top = view === 'expanded'
			? lastTop
			: Math.min(bodyTop + pitch * blockPortSlotCount(props) + 2, lastTop)
		description = {
			x: PORT_LABEL_INSET_PX,
			y: top,
			w: Math.max(0, width - PORT_LABEL_INSET_PX * 2),
			h: Math.max(0, Math.min(DESCRIPTION_LINE_HEIGHT_PX, footerTop - 4 - top)),
		}
	}

	// The top edge, last: the box is only now known, and an effect port is placed
	// by its `edgeT` fraction along it — the port has no slot, so a cable dragged
	// somewhere else moves the fraction and the dot follows.
	for (const port of effectPorts) {
		if (!port.visible) continue
		const point = edgePortPoint('top', portEdgeT(port), width, height)
		placed.push({
			port,
			side: 'output',
			edge: 'top',
			x: point.x,
			y: point.y,
			label: null,
			labelContent: null,
			subtle: false,
			lifted: false,
		})
	}

	return {
		view,
		portLayout,
		bounds,
		width,
		height,
		header,
		headerHeight,
		headerBand: { top: 0, bottom: headerHeight },
		sections,
		body,
		bodyTop,
		footerTop,
		footer: { x: 0, y: footerTop, w: width, h: Math.max(0, height - footerTop) },
		pitch,
		description,
		frameInterior: view === 'expanded'
			? {
				x: 1,
				y: headerHeight,
				w: Math.max(0, width - 2),
				h: Math.max(0, height - headerHeight - 1),
			}
			: null,
		ports: placed,
		title: null,
		typeLabel: null,
		icon: null,
		dividers,
		headerIcon,
		headerTitle,
		headerType,
	}
}
