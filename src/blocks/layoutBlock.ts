import {
	blockIcon,
	blockPortLayout,
	expandedSectionWeights,
	portInHeader,
	portStartsBranch,
	portStartsGroup,
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

export interface BlockRect {
	x: number
	y: number
	w: number
	h: number
}

export interface LaidOutBlockPort {
	port: BlockPort
	side: 'input' | 'output'
	/** Dot centre in Block-local coordinates; always on the outside edge. */
	x: number
	y: number
	/** Name/type box, absent for Simple and header inputs. */
	label: BlockRect | null
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
	/** Paint body below the heading. Simple remains the whole face for compatibility. */
	body: BlockRect
	bodyTop: number
	footerTop: number
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

/** Split an ordered port list at its markers. A marker on the first port is a no-op. */
function splitPorts(
	ports: readonly BlockPort[],
	startsNew: (port: BlockPort) => boolean,
): BlockPort[][] {
	const groups: BlockPort[][] = []
	for (const port of ports) {
		if (groups.length === 0 || (startsNew(port) && groups[groups.length - 1].length > 0)) {
			groups.push([])
		}
		groups[groups.length - 1].push(port)
	}
	return groups
}

interface BodySlotPlan {
	slotCount: number
	slotOf: Map<string, number>
	dividers: { kind: 'group' | 'branch'; slot: number }[]
}

/**
 * Resolve the Port view's burger grammar onto one 44px grid. Group and branch
 * dividers each consume a full slot, exactly as in the mature pyblocks face.
 */
function planBodySlots(props: BlockShapeProps): BodySlotPlan {
	const bodyInputs = props.inputs.filter((port) => port.visible && !portInHeader(port))
	const outputs = props.outputs.filter((port) => port.visible)
	const inputGroups = splitPorts(bodyInputs, portStartsGroup)
	const outputGroups = splitPorts(outputs, portStartsGroup)
	const groupCount = Math.max(inputGroups.length, outputGroups.length, 1)
	const portLayout = blockPortLayout(props)

	const slotOf = new Map<string, number>()
	const dividers: BodySlotPlan['dividers'] = []
	let slot = 0
	for (let group = 0; group < groupCount; group += 1) {
		if (group > 0) {
			dividers.push({ kind: 'group', slot })
			slot += 1
		}

		const inputs = inputGroups[group] ?? []
		const branches = splitPorts(outputGroups[group] ?? [], portStartsBranch)
		const outputSequence: ({ kind: 'port'; port: BlockPort } | { kind: 'divider' })[] = []
		branches.forEach((branch, index) => {
			if (index > 0) outputSequence.push({ kind: 'divider' })
			for (const port of branch) outputSequence.push({ kind: 'port', port })
		})

		const inputStart = slot
		const outputStart = portLayout === 'inline' ? slot : slot + inputs.length
		inputs.forEach((port, index) => slotOf.set(port.id, inputStart + index))
		outputSequence.forEach((entry, index) => {
			if (entry.kind === 'port') slotOf.set(entry.port.id, outputStart + index)
			else dividers.push({ kind: 'branch', slot: outputStart + index })
		})

		const rows = portLayout === 'inline'
			? Math.max(inputs.length, outputSequence.length)
			: inputs.length + outputSequence.length
		slot += Math.max(rows, 1)
	}

	return { slotCount: Math.max(slot, 1), slotOf, dividers }
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
) {
	const regionHeight = Math.max(0, bodyBottom - bodyTop)
	const weights = expandedSectionWeights(props)
	const bodyInputs = props.inputs.filter((port) => port.visible && !portInHeader(port))
	const outputs = props.outputs.filter((port) => port.visible)
	const inputGroups = splitPorts(bodyInputs, portStartsGroup)
	const outputGroups = splitPorts(outputs, portStartsGroup)
	const groupCount = Math.max(inputGroups.length, outputGroups.length, 1)

	const groups: {
		inputs: BlockPort[]
		branches: BlockPort[][]
		key: string
		weight: number
		slots: number
	}[] = []

	for (let index = 0; index < groupCount; index += 1) {
		const inputs = inputGroups[index] ?? []
		const groupOutputs = outputGroups[index] ?? []
		const branches = groupOutputs.length > 0 ? splitPorts(groupOutputs, portStartsBranch) : []
		const outputSlots = groupOutputs.length + Math.max(0, branches.length - 1)
		const firstPort = groupOutputs[0] ?? inputs[0]
		const key = `g:${firstPort ? firstPort.id : index}`
		const slots = Math.max(inputs.length, outputSlots)
		groups.push({ inputs, branches, key, weight: weights[key] ?? slots + 1, slots })
	}

	const totalWeight = groups.reduce((sum, group) => sum + group.weight, 0) || 1
	let groupTop = bodyTop
	groups.forEach((group, groupIndex) => {
		const groupHeight = (regionHeight * group.weight) / totalWeight
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

		const sections = group.branches.map((branch) => {
			const key = `b:${branch[0].id}`
			return { branch, key, weight: weights[key] ?? branch.length + 1 }
		})
		const sectionTotal = sections.reduce((sum, section) => sum + section.weight, 0) || 1
		let sectionTop = groupTop
		sections.forEach((section, sectionIndex) => {
			const sectionHeight = (groupHeight * section.weight) / sectionTotal
			if (sectionIndex > 0) {
				const previous = sections[sectionIndex - 1]
				dividers.push({
					kind: 'branch',
					x: width / 2,
					y: sectionTop,
					w: width / 2,
					adjust: {
						prevKey: previous.key,
						nextKey: section.key,
						prevWeight: previous.weight,
						nextWeight: section.weight,
						rangeTop: sectionTop - (groupHeight * previous.weight) / sectionTotal,
						rangeBottom: sectionTop + sectionHeight,
						prevMin: minExpandedSectionHeight(previous.branch.length),
						nextMin: minExpandedSectionHeight(section.branch.length),
					},
				})
			}
			section.branch.forEach((port, index) => {
				place(port, 'output', sectionTop + (
					sectionHeight * (index + 1)
				) / (section.branch.length + 1))
			})
			sectionTop += sectionHeight
		})

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
 * The one geometric projection for the Block. Rendering, selection geometry,
 * connection anchors and frame interaction all consume this immutable result.
 */
export function layoutBlock(props: BlockShapeProps): BlockLayout {
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
		// The capsule: one text box across the whole face, the outlet centred on
		// the right rim. An input on a value Block is a record oddity, not a
		// port to draw; it keeps a quiet anchor so a stored cable still resolves.
		const midpoint = height / 2
		for (const port of props.inputs.filter((candidate) => candidate.visible)) {
			placed.push({ port, side: 'input', x: 0, y: midpoint, label: null, subtle: true, lifted: false })
		}
		for (const port of props.outputs.filter((candidate) => candidate.visible)) {
			placed.push({ port, side: 'output', x: width, y: midpoint, label: null, subtle: false, lifted: false })
		}
		return {
			view,
			portLayout,
			bounds,
			width,
			height,
			header: null,
			headerHeight: 0,
			body: bounds,
			bodyTop: 0,
			footerTop: height,
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
				x: 0,
				y: midpoint,
				label: null,
				subtle: true,
				lifted: false,
			})
		}
		for (const port of props.outputs.filter((candidate) => candidate.visible)) {
			placed.push({
				port,
				side: 'output',
				x: width,
				y: midpoint,
				label: null,
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
			body: bounds,
			bodyTop,
			footerTop,
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
			x: 0,
			y,
			label: null,
			subtle: false,
			lifted: false,
		})
	})

	const descriptionReserve = showsDescription(props) ? DESCRIPTION_LINE_HEIGHT_PX + 4 : 0
	const dividers: BlockDivider[] = []
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
			placed.push({ port, side, x, y, label, subtle: false, lifted: true })
		}
		placeExpandedBody(props, width, bodyTop, bodyBottom, place, dividers)
	} else {
		const plan = planBodySlots(props)
		const available = Math.max(
			0,
			footerTop - NODE_ROW_BOTTOM_PADDING_PX - bodyTop - descriptionReserve,
		)
		pitch = Math.min(NODE_ROW_HEIGHT_PX, available / plan.slotCount)
		const centreOf = (slot: number) => bodyTop + pitch * slot + pitch / 2

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
				placed.push({ port, side, x, y, label, subtle: false, lifted: false })
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

	return {
		view,
		portLayout,
		bounds,
		width,
		height,
		header,
		headerHeight,
		body,
		bodyTop,
		footerTop,
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
