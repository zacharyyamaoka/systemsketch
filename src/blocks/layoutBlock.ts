import {
	blockIcon,
	blockHeaderAlign,
	blockIsFolded,
	blockFoldControlSide,
	canBlockFold,
	blockPortLayout,
	blockPortSections,
	blockShowsFooter,
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
import { stockBlockVisibleDescription } from './stockBlocks'
import {
	inferCommunicationPlacements,
	isSummaryCarrierPort,
	phasesByInteraction,
	siblingPhasesFor,
} from '../prototypes/communication/portPlacementInference'

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
/** 20px chevron plus its 8px separation from the identity or metadata lane. */
const FOLD_CONTROL_RESERVE_PX = 28

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

/** Clearance between a horizontal rail's socket and its inward label. */
export const RAIL_LABEL_GAP_PX = 12
/** Clear space kept between two neighbouring labels on the same wall. */
export const RAIL_LABEL_GUTTER_PX = 10
/**
 * How much of a bare face's width one side column may use.
 *
 * A third each for the two side columns leaves the middle third for the
 * component's name and type, which is what keeps a long port name from running
 * through the identity.
 */
export const SIDE_LABEL_SHARE = 0.33
/** The bare face's identity type scale, matching `.BlockNode-bareTitle`. */
export const BARE_TITLE_FONT_PX = 17
/** Breathing room either side of the centred identity. */
export const BARE_IDENTITY_PAD_PX = 16
/** The identity never takes more than this much of the card's width. */
export const BARE_IDENTITY_MAX_SHARE = 0.46

/**
 * Which question the layout is answering.
 *
 * `dataflow` is the signature: two vertical lanes, inputs left and outputs
 * right, ordered by row. It NEVER puts a port on a horizontal edge — a
 * signature that wraps around the corner stops reading as a signature.
 * `communication` is the topology: a socket may sit on any of the four edges
 * so it can face the component it talks to.
 */
export type BlockLayoutLens = 'dataflow' | 'communication'

export interface BlockLayoutOptions {
	lens?: BlockLayoutLens
}

/**
 * The horizontal rail this port occupies in the communication lens, or null
 * when it stays on a vertical one.
 *
 * Only ever consulted for `lens: 'communication'`; the dataflow layout does not
 * call it, which is what makes "no top or bottom ports in Dataflow" a property
 * of the code rather than a rule someone has to remember.
 */
export function portRailEdge(port: BlockPort): 'top' | 'bottom' | null {
	return port.commEdge === 'top' || port.commEdge === 'bottom' ? port.commEdge : null
}

/** Which of the four walls a port occupies in the communication lens. */
export function portCommunicationEdge(
	port: BlockPort,
	side?: 'input' | 'output',
): 'left' | 'right' | 'top' | 'bottom' {
	if (port.commEdge) return port.commEdge
	return side === 'output' ? 'right' : 'left'
}

/**
 * Fill in a communication placement for every port that has not been given one.
 *
 * Runs once, above the layout, so the inference is a presentation transform and
 * never a write: a port a person actually dragged carries `commEdge` and is
 * returned untouched. See `portPlacementInference.ts` for why legs of one
 * interaction are kept together.
 */
export function withInferredCommunicationPlacements(props: BlockShapeProps): BlockShapeProps {
	const unplaced = [...props.inputs, ...props.outputs].some((port) => port.commEdge === undefined)
	if (!unplaced) return props
	// `placedEdge` is what keeps an inferred sibling from contradicting a leg the
	// generator already put on the wall facing its peer.
	const inferred = inferCommunicationPlacements([
		...props.inputs.map((port) => ({ port, side: 'input' as const, placedEdge: port.commEdge })),
		...props.outputs.map((port) => ({ port, side: 'output' as const, placedEdge: port.commEdge })),
	])
	const fill = (ports: readonly BlockPort[]) => ports.map((port) => {
		if (port.commEdge !== undefined) return port
		const placement = inferred.get(port.id)
		return placement ? { ...port, commEdge: placement.edge, commEdgeT: placement.edgeT } : port
	})
	return { ...props, inputs: fill(props.inputs), outputs: fill(props.outputs) }
}

/**
 * Where along its edge a port was PUT, or null when nobody has put it anywhere.
 *
 * The difference matters: an authored fraction is a person's decision and is
 * honoured exactly, while an absent one means the edge is free to distribute.
 * Treating "absent" as 0.5 is what made four generated sockets pile up in the
 * middle of a wall and then march rightwards off it as the spacer pushed them
 * apart, instead of spreading evenly across the whole edge.
 */
export function portRailT(port: BlockPort): number | null {
	const value = port.commEdgeT
	return Number.isFinite(value) ? Math.min(1, Math.max(0, value as number)) : null
}

/**
 * The body slot plan must not reserve a row for a port that left the vertical
 * rails, or a Block would grow a blank row for every socket moved to an edge.
 */
function withoutRailPorts(props: BlockShapeProps): BlockShapeProps {
	const inputs = props.inputs.filter((port) => portRailEdge(port) === null)
	const outputs = props.outputs.filter((port) => portRailEdge(port) === null)
	if (inputs.length === props.inputs.length && outputs.length === props.outputs.length) return props
	return { ...props, inputs, outputs }
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
	 * Which edge the dot sits on. Inputs default to `left` and named outputs to
	 * `right`; an effect output is on `top`. A port carrying an authored
	 * `edge` overrides that onto the horizontal rail it names.
	 */
	edge: 'left' | 'right' | 'top' | 'bottom'
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

/** A compact disclosure for ports deliberately omitted from this face. */
export interface BlockHiddenPortSummary {
	side: 'input' | 'output'
	count: number
	box: BlockRect
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
	/** Per-side disclosure of stored ports omitted from this face. */
	hiddenPortSummaries: readonly BlockHiddenPortSummary[]
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

/**
 * A folded headed Block is a genuine compact geometry, not a body painted
 * transparent. Its persisted ports keep their identities and collapse onto
 * the two header edges, exactly like Simple's coincident side anchors, so
 * existing exterior cables remain attached and readable when the body closes.
 */
function foldedBlockLayout(props: BlockShapeProps): BlockLayout {
	const width = finiteDimension(props.w)
	const height = finiteDimension(props.h)
	const bounds = { x: 0, y: 0, w: width, h: height }
	const header: BlockRect = { ...bounds }
	const midpoint = height / 2
	const ports: LaidOutBlockPort[] = []
	for (const port of props.inputs) {
		if (!port.visible) continue
		ports.push({
			port, side: 'input', edge: 'left', x: 0, y: midpoint,
			label: null, labelContent: null, subtle: true, lifted: false,
		})
	}
	for (const port of props.outputs) {
		if (!port.visible) continue
		ports.push({
			port, side: 'output', edge: 'right', x: width, y: midpoint,
			label: null, labelContent: null, subtle: true, lifted: false,
		})
	}
	const foldSide = blockFoldControlSide(props)
	const foldInset = HEADER_PAD_X + (foldSide === 'left' ? FOLD_CONTROL_RESERVE_PX : 0)
	const hasIcon = blockIcon(props) !== ''
	const headerIcon = hasIcon
		? { x: foldInset, y: (height - HEADER_ICON_PX) / 2, w: HEADER_ICON_PX, h: HEADER_ICON_PX }
		: null
	const titleLeft = foldInset + (hasIcon ? HEADER_ICON_PX + HEADER_GAP_PX : 0)
	return {
		view: props.view,
		portLayout: blockPortLayout(props),
		bounds,
		width,
		height,
		header,
		headerHeight: height,
		headerBand: null,
		sections: [],
		body: { x: 0, y: height, w: width, h: 0 },
		bodyTop: height,
		footerTop: height,
		footer: null,
		pitch: NODE_ROW_HEIGHT_PX,
		description: null,
		frameInterior: null,
		ports,
		hiddenPortSummaries: [],
		title: null,
		typeLabel: null,
		icon: null,
		dividers: [],
		headerIcon,
		headerTitle: {
			x: titleLeft,
			y: 0,
			w: Math.max(0, width - titleLeft - HEADER_PAD_X - (foldSide === 'right' ? FOLD_CONTROL_RESERVE_PX : 0)),
			h: height,
		},
		headerType: null,
	}
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
function planBodySlots(
	rawProps: BlockShapeProps,
	lens: BlockLayoutLens = 'dataflow',
): BodySlotPlan {
	// In Dataflow a rail port has no rail to sit on, so it keeps an ordinary
	// body row — that IS the best-effort reposition back onto the two lanes.
	// In the communication lens EVERY socket is edge-placed, so the body plans
	// no rows at all; in Dataflow a rail port has no rail to sit on and keeps its
	// ordinary row, which IS the best-effort reposition back onto the two lanes.
	const props = lens === 'communication'
		? { ...rawProps, inputs: [], outputs: [] }
		: rawProps
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
	const descriptionReserve = portDescriptionHeight(props, layout.width) + (showsDescription(props) ? 4 : 0)
	return Math.ceil(
		layout.headerHeight
		+ NODE_ROW_HEADER_GAP_PX
		+ NODE_ROW_HEIGHT_PX * Math.max(1, slotCount)
		+ NODE_ROW_BOTTOM_PADDING_PX
		+ descriptionReserve
		+ (layout.footer?.h ?? 0),
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

function visibleDescription(props: BlockShapeProps): string {
	return stockBlockVisibleDescription(props).trim()
}

function showsDescription(props: BlockShapeProps): boolean {
	return visibleDescription(props) !== ''
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
	if (port.name !== '') parts.push(measureBlockText(port.name, PORT_TEXT_FONT_PX, 400, 'mono'))
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
 * Keep authored rail positions but never let two sockets collide.
 *
 * WHY nudge rather than redistribute evenly: a port dragged to a specific spot
 * should stay where it was put. Sockets are only pushed apart when they would
 * overlap, and only by as much as it takes, so an untouched rail with one port
 * still centres it and a crowded rail degrades into an even spread on its own.
 */
export function spreadRailFractions(
	fractions: readonly number[],
	minimumGap = 0.14,
): number[] {
	const next = [...fractions]
	for (let index = 1; index < next.length; index += 1) {
		next[index] = Math.max(next[index], next[index - 1] + minimumGap)
	}
	const overflow = next.length > 0 ? next[next.length - 1] - 1 : 0
	if (overflow > 0) {
		// Ran off the end: shift the whole run back, then re-open any gap the
		// shift closed at the start. With more ports than the rail can hold at
		// the preferred gap this settles into an even spread.
		for (let index = 0; index < next.length; index += 1) next[index] -= overflow
		for (let index = 1; index < next.length; index += 1) {
			next[index] = Math.max(next[index], next[index - 1] + minimumGap)
		}
	}
	const span = next.length > 1 ? next[next.length - 1] - next[0] : 0
	if (span > 1) {
		for (let index = 0; index < next.length; index += 1) {
			next[index] = next.length === 1 ? 0.5 : index / (next.length - 1)
		}
		return next
	}
	return next.map((value) => Math.min(1, Math.max(0, value)))
}

/** Centre the measured content inside a rail label instead of packing it to a lane edge. */
function railLabelContentBox(port: BlockPort, side: 'input' | 'output', label: BlockRect): BlockRect {
	const w = Math.max(0, Math.min(label.w, portLabelContentWidth(port, side)))
	return { x: label.x + (label.w - w) / 2, y: label.y, w, h: label.h }
}

/**
 * Place every port authored onto a horizontal rail.
 *
 * WHY this exact geometry — it is Vyuh Node Flow's convention, adopted from
 * the prior-art study in `docs/four-sided-port-labels-prior-art-2026-09-06.html`
 * (<https://flow.vyuh.tech/docs/theming/port-labels>): the text stays
 * HORIZONTAL and is drawn INWARD from the socket, so a top port reads below
 * its dot and a bottom port above it, and the outer face stays a clean cable
 * corridor. Rotating or outdenting the label is what the study rejects, and
 * both rails run left→right, which is also Simulink's ordering rule.
 *
 * It generalises a decision this app already made: the Loop's `item` outlet
 * leaves the header's bottom edge and puts its type label above the dot so the
 * first downward cable cannot strike through the words.
 */
function placeHorizontalRails(
	props: BlockShapeProps,
	width: number,
	height: number,
	band: { top: number; bottom: number },
	bareSideLabelWidth: number | null,
	/**
	 * In the communication lens this is ALWAYS true: "only the summary edge
	 * ports should exist."
	 *
	 * WHY Port view does not need the other legs after all — the ask it was
	 * meant to serve was "show the ports for the detected communication ports
	 * that haven't yet been wired together", and the carrier rule already does
	 * that. `isSummaryCarrierPort` is purely name-based: it shows the carrier
	 * leg of EVERY interaction declared on the card, wired or not. So an
	 * un-wired `move.goal` is already visible to wire from, while `move.feedback`
	 * and `move.result` — which no summary arrow ever touches — are not. The two
	 * faces differ in chrome and labels, never in which sockets exist.
	 */
	carriersOnly: boolean,
	placed: LaidOutBlockPort[],
): void {
	// A top or bottom socket draws its label INWARD, into the same strip a side
	// socket's label would use. Reserve those strips first so the two never
	// overprint — this is what turned a card's left column into
	// "missiomissiomissio…" struck through by the bottom channel's name.
	// Grouped once per card: whether a port carries its summary arrow depends on
	// which OTHER legs of its interaction exist here, not on its name alone.
	const grouped = carriersOnly
		? phasesByInteraction([...props.inputs, ...props.outputs])
		: null
	const shown = (port: BlockPort) => port.visible
		&& (!carriersOnly || isSummaryCarrierPort(port, siblingPhasesFor(port, grouped!)))
	const occupies = (edge: 'top' | 'bottom') => [...props.inputs, ...props.outputs]
		.some((port) => shown(port) && portCommunicationEdge(port) === edge)
	const sideSpan = {
		top: band.top + (occupies('top') ? PORT_LABEL_HEIGHT_PX + RAIL_LABEL_GAP_PX : 0),
		bottom: band.bottom - (occupies('bottom') ? PORT_LABEL_HEIGHT_PX + RAIL_LABEL_GAP_PX : 0),
	}
	const usableSide = sideSpan.bottom - sideSpan.top > PORT_LABEL_HEIGHT_PX
		? sideSpan
		: { top: band.top, bottom: band.bottom }

	for (const edge of ['top', 'bottom', 'left', 'right'] as const) {
		const lane = ([
			['input', props.inputs],
			['output', props.outputs],
		] as const).flatMap(([side, ports]) => ports
			.filter((port) => shown(port) && portCommunicationEdge(port) === edge)
			.map((port) => ({ port, side })))
		if (lane.length === 0) continue
		// Every socket that has not been placed by hand gets an even share of the
		// WHOLE edge; the ones that have keep exactly where they were put. Sorting
		// after that assignment is what makes both rails read left→right, which is
		// Simulink's ordering rule and what the prior-art study assumes.
		const even = (index: number) => (index + 1) / (lane.length + 1)
		const withFraction = lane.map((entry, index) => ({
			...entry,
			t: portRailT(entry.port) ?? even(index),
		}))
		withFraction.sort((a, b) => a.t - b.t)
		// The collision gap can never exceed what an even spread would give, or a
		// crowded edge would be pushed wider than the edge itself and march off
		// the end — the exact failure the even distribution above just fixed.
		const spread = spreadRailFractions(
			withFraction.map((entry) => entry.t),
			Math.min(0.14, 1 / (lane.length + 1)),
		)
		withFraction.forEach(({ port, side }, index) => {
			const t = spread[index]
			const vertical = edge === 'left' || edge === 'right'
			// A side socket rides the strip left between the two horizontal label
			// rows, so the dot and its words both stay clear of them.
			const point = vertical
				? {
					x: edge === 'left' ? 0 : width,
					y: usableSide.top + t * (usableSide.bottom - usableSide.top),
				}
				: edgePortPoint(edge, t, width, height)
			// A horizontal label may be at most the gap between two adjacent
			// sockets, or two names overprint — `mission.4.stmission.5.stre…`.
			// Evenly spread sockets sit `width / (n + 1)` apart, so that, less a
			// gutter, is the widest a label can honestly be.
			// On the bare face the identity sits in the middle of the card, so a
			// side label may only claim its own third — otherwise a long port
			// name runs straight through the component's name.
			const labelWidth = vertical
				? bareSideLabelWidth !== null
					? bareSideLabelWidth
					: Math.max(0, width / 2 - PORT_LABEL_INSET_PX - 8)
				: Math.max(0, Math.min(
					width - PORT_LABEL_INSET_PX * 2,
					width / (lane.length + 1) - RAIL_LABEL_GUTTER_PX,
				))
			// Inward by the study's 12px gap, then clamped into the body band: the
			// header and footer own the strips the raw offset would land in, and
			// the contract's answer to "it does not fit" is to move the text, not
			// to distort it or drop the port.
			const label: BlockRect = vertical
				? {
					// A side socket reads exactly like a signature row: the words
					// run inward from the wall on the socket's own line.
					x: edge === 'left'
						? PORT_LABEL_INSET_PX
						: width - PORT_LABEL_INSET_PX - labelWidth,
					y: Math.max(0, Math.min(
						height - PORT_LABEL_HEIGHT_PX,
						point.y - PORT_LABEL_HEIGHT_PX / 2,
					)),
					w: labelWidth,
					h: PORT_LABEL_HEIGHT_PX,
				}
				: {
					x: Math.max(
						PORT_LABEL_INSET_PX,
						Math.min(width - PORT_LABEL_INSET_PX - labelWidth, point.x - labelWidth / 2),
					),
					y: Math.max(0, Math.min(height - PORT_LABEL_HEIGHT_PX, edge === 'top'
						? Math.max(RAIL_LABEL_GAP_PX, band.top)
						: Math.min(
							height - RAIL_LABEL_GAP_PX - PORT_LABEL_HEIGHT_PX,
							band.bottom - PORT_LABEL_HEIGHT_PX,
						))),
					w: labelWidth,
					h: PORT_LABEL_HEIGHT_PX,
				}
			placed.push({
				port,
				side,
				edge,
				x: point.x,
				y: point.y,
				label,
				labelContent: vertical
					? portLabelContentBox(port, side, label)
					: railLabelContentBox(port, side, label),
				subtle: false,
				lifted: false,
			})
		})
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
	// A rail label is centred on its socket rather than packed against a lane
	// edge, so joining it to the Block's side would claim the whole body width.
	if (placed.edge === 'top' || placed.edge === 'bottom') return content
	const near = placed.side === 'input' ? 0 : width
	const far = placed.side === 'input'
		? content.x + content.w + PORT_LABEL_HIT_PAD_PX
		: content.x - PORT_LABEL_HIT_PAD_PX
	const left = Math.max(0, Math.min(near, far))
	const right = Math.min(width, Math.max(near, far))
	return { x: left, y: content.y, w: Math.max(0, right - left), h: content.h }
}

const HIDDEN_PORT_SUMMARY_HEIGHT_PX = 16

/**
 * Put `+N more` immediately after its lane when room remains, otherwise use
 * the footer band. A short Block whose last visible row hits the body floor
 * must never render its explanation over that row.
 */
function hiddenPortSummaries(
	props: Pick<BlockShapeProps, 'inputs' | 'outputs'>,
	placed: readonly LaidOutBlockPort[],
	width: number,
	bodyTop: number,
	footerTop: number,
	height: number,
	description: BlockRect | null,
): BlockHiddenPortSummary[] {
	const summaries: BlockHiddenPortSummary[] = []
	const bodyBottom = Math.max(bodyTop, (description?.y ?? footerTop) - 4)
	const footerHeight = Math.max(0, height - footerTop)

	for (const side of ['input', 'output'] as const) {
		const source = side === 'input' ? props.inputs : props.outputs
		const count = source.filter((port) => !port.visible).length
		if (count === 0) continue

		const lastLabelBottom = Math.max(
			bodyTop - 4,
			...placed
				.filter((port) => port.side === side && port.label !== null)
				.map((port) => port.label!.y + port.label!.h),
		)
		const preferredTop = lastLabelBottom + 4
		const fitsInBody = preferredTop + HIDDEN_PORT_SUMMARY_HEIGHT_PX <= bodyBottom
		const footerSummaryTop = footerTop + Math.max(
			0,
			(footerHeight - HIDDEN_PORT_SUMMARY_HEIGHT_PX) / 2,
		)
		const y = fitsInBody
			? preferredTop
			: Math.min(Math.max(0, height - HIDDEN_PORT_SUMMARY_HEIGHT_PX), footerSummaryTop)
		const x = side === 'input' ? PORT_LABEL_INSET_PX : width / 2
		const rightInset = side === 'output' ? 38 : PORT_LABEL_INSET_PX
		summaries.push({
			side,
			count,
			box: { x, y, w: Math.max(0, width - x - rightInset), h: HIDDEN_PORT_SUMMARY_HEIGHT_PX },
		})
	}

	return summaries
}

function measureSimpleText(
	text: string,
	px: number,
	weight: number,
	family: keyof typeof TEXT_FAMILIES = 'sans',
): number {
	return measureBlockText(text, px, weight, family)
}

function estimateWrappedLines(
	text: string,
	px: number,
	weight: number,
	maxWidth: number,
	family: keyof typeof TEXT_FAMILIES = 'sans',
): number {
	if (text.trim() === '' || maxWidth <= 0) return 1
	// Newlines separate the derived Clock declaration from its optional
	// annotation. Preserve that authored boundary while still wrapping each row.
	return text.split(/\n/).reduce(
		(total, paragraph) => total + estimateParagraphLines(paragraph, px, weight, maxWidth, family),
		0,
	)
}

function estimateParagraphLines(
	text: string,
	px: number,
	weight: number,
	maxWidth: number,
	family: keyof typeof TEXT_FAMILIES,
): number {
	const words = text.trim().split(/\s+/).filter(Boolean)
	if (words.length === 0 || maxWidth <= 0) return 1
	const spaceWidth = Math.max(1, measureSimpleText(' ', px, weight, family))
	let lines = 1
	let lineWidth = 0
	for (const word of words) {
		const wordWidth = measureSimpleText(word, px, weight, family)
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

function portDescriptionHeight(props: BlockShapeProps, width: number): number {
	if (!showsDescription(props)) return 0
	const lines = Math.min(3, estimateWrappedLines(
		visibleDescription(props), 11, 400, Math.max(0, width - PORT_LABEL_INSET_PX * 2),
	))
	return lines * DESCRIPTION_LINE_HEIGHT_PX
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
/** The same memo for the communication lens: same props, different geometry. */
let communicationLayoutMemo = new WeakMap<BlockShapeProps, BlockLayout>()

if (typeof document !== 'undefined' && 'fonts' in document) {
	const forgetLayouts = () => {
		layoutMemo = new WeakMap()
		communicationLayoutMemo = new WeakMap()
	}
	document.fonts.ready.then(forgetLayouts, () => undefined)
	document.fonts.addEventListener('loadingdone', forgetLayouts)
}

/**
 * The one geometric projection for the Block. Rendering, selection geometry,
 * connection anchors and frame interaction all consume this immutable result.
 */
export function layoutBlock(
	props: BlockShapeProps,
	options: BlockLayoutOptions = {},
): BlockLayout {
	const lens = options.lens ?? 'dataflow'
	const memo = lens === 'communication' ? communicationLayoutMemo : layoutMemo
	const memoized = memo.get(props)
	if (memoized) return memoized
	const layout = computeBlockLayout(props, lens)
	memo.set(props, layout)
	return layout
}

function computeBlockLayout(
	inputProps: BlockShapeProps,
	lens: BlockLayoutLens = 'dataflow',
): BlockLayout {
	// Inference runs once, above everything, and only for the lens that needs
	// it. It fills a placement in; it never overwrites one a person authored.
	const rawProps = lens === 'communication'
		? withInferredCommunicationPlacements(inputProps)
		: inputProps
	if (blockIsFolded(rawProps)) return foldedBlockLayout(rawProps)
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
	/**
	 * The bare communication face: Communication lens + Port card, and nowhere
	 * else in the app.
	 *
	 * WHY it exists (Zach, 2026-09-06): "get rid of the footer and header of the
	 * component, and instead just show its name and type… This is a special view
	 * not used anywhere else in the app." With sockets on all four walls, the
	 * header and footer bands are two horizontal strips the ports cannot use, so
	 * the whole card squeezes its labels into what is left and they overprint.
	 * Dropping the chrome hands both strips back to the ports and leaves the
	 * identity where a diagram wants it — centred, in the middle of the card.
	 */
	const bareCommunicationFace = lens === 'communication' && view === 'port'
	/**
	 * How wide the centred identity actually needs to be, so the side columns
	 * can have everything else. A fixed third each was tidy arithmetic and bad
	 * design: it ellipsised a seven-letter component name AND the port names
	 * beside it on an ordinary 340px card.
	 */
	const bareIdentityWidth = bareCommunicationFace
		? Math.min(
			width * BARE_IDENTITY_MAX_SHARE,
			Math.max(
				measureBlockText(props.title, BARE_TITLE_FONT_PX, 600, 'mono'),
				measureBlockText(props.blockType, SIMPLE_TEXT_FONT_PX, 400),
			) + BARE_IDENTITY_PAD_PX,
		)
		: 0
	const bareSideLabelWidth = bareCommunicationFace
		? Math.max(0, (width - bareIdentityWidth) / 2 - PORT_LABEL_INSET_PX)
		: 0
	const headerHeight = bareCommunicationFace
		? 0
		: view === 'simple'
			? Math.min(NODE_HEADER_HEIGHT_PX, height)
			: Math.min(
				height,
				Math.max(BLOCK_HEADER_HEIGHT_PX, visibleHeaderInputs.length * HEADER_PORT_PITCH_PX + 8),
			)
	const bodyTop = headerHeight + NODE_ROW_HEADER_GAP_PX
	// WHY: hiding a footer gives its room back to the authored face. Leaving a
	// blank action-strip-sized dead zone would make the control cosmetic and
	// would still compress Port rows or an Expanded child canvas for no reason.
	// Simple reserves its pre-existing lower type strip; it has no footer chrome.
	const reservesFooter = !bareCommunicationFace && (view === 'simple' || (
		view !== 'value' && blockShowsFooter(props)
	))
	const footerTop = reservesFooter
		? Math.max(bodyTop, height - NODE_FOOTER_HEIGHT_PX)
		: height
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
			hiddenPortSummaries: [],
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
			estimateWrappedLines(props.title, SIMPLE_TITLE_FONT_PX, 600, titleTextWidth, 'mono'),
		)
		const titleHeight = Math.max(
			titleLines * SIMPLE_TITLE_LINE_PX,
			hasIcon ? SIMPLE_ICON_PX : 0,
		)

		let descriptionHeight = 0
		if (showsDescription(props)) {
			const wanted = estimateWrappedLines(
				visibleDescription(props),
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
					measureSimpleText(props.title, SIMPLE_TITLE_FONT_PX, 600, 'mono'),
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
		// The communication lens is Simple-only now, so this is where its whole
		// port story lives: only the sockets a summary arrow actually attaches
		// to, each on the wall the arrow crossed, spread along it. Everywhere
		// else Simple keeps its coincident midpoint anchors, which exist to
		// retain identity rather than to be read.
		if (lens === 'communication') {
			placeHorizontalRails(
				props,
				width,
				height,
				{ top: 0, bottom: height },
				null,
				true,
				placed,
			)
			for (const entry of placed) entry.subtle = true
		} else {
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
			hiddenPortSummaries: [],
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

	const descriptionHeight = portDescriptionHeight(props, width)
	const descriptionReserve = descriptionHeight + (showsDescription(props) ? 4 : 0)
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
		const plan = planBodySlots(props, lens)
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

		if (lens !== 'communication') {
			placeBody(props.inputs, 'input')
			placeBody(props.outputs, 'output')
		}
		// WHY guarded rather than trusted: "Dataflow never shows a top or bottom
		// port" is enforced at the one place a rail can be created, so a stored
		// `commEdge` cannot leak into the signature view.
		if (lens === 'communication') {
			placeHorizontalRails(
				props,
				width,
				height,
				{ top: bodyTop, bottom: footerTop },
				bareCommunicationFace ? bareSideLabelWidth : null,
				true,
				placed,
			)
		}
		dividers.push(...plan.dividers.map(({ kind, slot }) => ({
			kind,
			x: kind === 'group' ? 0 : width / 2,
			y: centreOf(slot),
			w: kind === 'group' ? width : width / 2,
		})))
	}

	const hasHeaderIcon = blockIcon(props) !== ''
	const foldSide = canBlockFold(props) ? blockFoldControlSide(props) : null
	const headerLeftInset = HEADER_PAD_X + (foldSide === 'left' ? FOLD_CONTROL_RESERVE_PX : 0)
	const headerRightInset = HEADER_PAD_X + (foldSide === 'right' ? FOLD_CONTROL_RESERVE_PX : 0)
	const inlineHeaderType = foldSide === 'right'
	const headerTypeWidth = props.blockType !== ''
		? Math.min(measureSimpleText(props.blockType, TLDRAW_TEXT_S_PX, 400), width * 0.35)
		: 0
	const centeredHeader = blockHeaderAlign(props) === 'center'
	const iconReserve = hasHeaderIcon ? HEADER_ICON_PX + HEADER_GAP_PX : 0
	const draftBadgeReserve = props.draftOrdinal === undefined
		? 0
		: measureSimpleText(`Draft ${props.draftOrdinal}`, 11, 650) + 18 + HEADER_GAP_PX
	const inlineTypeReserve = inlineHeaderType && headerTypeWidth > 0
		? headerTypeWidth + HEADER_GAP_PX
		: 0
	const centeredSideReserve = !inlineHeaderType && headerTypeWidth > 0
		? headerTypeWidth + HEADER_GAP_PX
		: 0
	const centeredIdentityMax = Math.max(
		0,
		width - Math.max(headerLeftInset, headerRightInset) * 2 - centeredSideReserve * 2,
	)
	const centeredTitleWidth = Math.max(0, Math.min(
		Math.max(0, centeredIdentityMax - iconReserve - draftBadgeReserve - inlineTypeReserve),
		measureBlockText(props.title, PORT_TITLE_FONT_PX, 500, 'mono'),
	))
	const centeredIdentityWidth = iconReserve + centeredTitleWidth + draftBadgeReserve + inlineTypeReserve
	const identityLeft = centeredHeader
		? (width - centeredIdentityWidth) / 2
		: headerLeftInset
	const headerIcon: BlockRect | null = hasHeaderIcon
		? {
			x: identityLeft,
			y: (headerHeight - HEADER_ICON_PX) / 2,
			w: HEADER_ICON_PX,
			h: HEADER_ICON_PX,
		}
		: null
	const titleLeft = identityLeft + iconReserve
	const measuredTitleRight = centeredHeader || inlineHeaderType
		? titleLeft + centeredTitleWidth
		: width - headerRightInset - draftBadgeReserve - (headerTypeWidth > 0 ? headerTypeWidth + HEADER_GAP_PX : 0)
	const titleRight = Math.max(titleLeft, measuredTitleRight)
	const headerType: BlockRect | null = headerTypeWidth > 0
		? {
			x: inlineHeaderType
				? titleRight + draftBadgeReserve + HEADER_GAP_PX
				: width - headerRightInset - headerTypeWidth,
			y: 0,
			w: headerTypeWidth,
			h: headerHeight,
		}
		: null
	const headerTitle: BlockRect = {
		x: titleLeft,
		y: 0,
		w: Math.max(0, titleRight - titleLeft),
		h: headerHeight,
	}

	// The bare face's identity: name over type, centred, with no chrome band to
	// belong to. Measured the same way the Simple face measures its own stack.
	const bareIdentity = bareCommunicationFace
		? (() => {
			const innerWidth = Math.max(0, Math.min(width, bareIdentityWidth))
			const titleHeight = SIMPLE_TEXT_LINE_PX
			const typeHeight = props.blockType !== '' ? SIMPLE_TEXT_LINE_PX : 0
			const stack = titleHeight + (typeHeight > 0 ? SIMPLE_STACK_GAP_PX + typeHeight : 0)
			const top = Math.max(0, (height - stack) / 2)
			const bandX = (width - innerWidth) / 2
			return {
				title: { x: bandX, y: top, w: innerWidth, h: titleHeight },
				typeLabel: typeHeight > 0
					? {
						x: bandX,
						y: top + titleHeight + SIMPLE_STACK_GAP_PX,
						w: innerWidth,
						h: typeHeight,
					}
					: null,
			}
		})()
		: null

	let description: BlockRect | null = null
	if (showsDescription(props)) {
		const lastTop = Math.max(bodyTop, footerTop - 4 - descriptionHeight)
		const top = view === 'expanded'
			? lastTop
			: Math.min(bodyTop + pitch * blockPortSlotCount(props) + 2, lastTop)
		description = {
			x: PORT_LABEL_INSET_PX,
			y: top,
			w: Math.max(0, width - PORT_LABEL_INSET_PX * 2),
			h: Math.max(0, Math.min(descriptionHeight, footerTop - 4 - top)),
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

	// WHY: `layout.ports` drops hidden records so they paint no dot and consume
	// no row. Count the stored lanes instead, or the calm face makes a Block
	// with no port indistinguishable from one with twenty hidden ports.
	const hiddenSummaries = hiddenPortSummaries(
		rawProps,
		placed,
		width,
		bodyTop,
		footerTop,
		height,
		description,
	)

	return {
		view,
		portLayout,
		bounds,
		width,
		height,
		header: bareCommunicationFace ? null : header,
		headerHeight,
		headerBand: bareCommunicationFace ? null : { top: 0, bottom: headerHeight },
		sections,
		body,
		bodyTop,
		footerTop,
		footer: !bareCommunicationFace && blockShowsFooter(props)
			? { x: 0, y: footerTop, w: width, h: Math.max(0, height - footerTop) }
			: null,
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
		hiddenPortSummaries: hiddenSummaries,
		title: bareIdentity?.title ?? null,
		typeLabel: bareIdentity?.typeLabel ?? null,
		icon: null,
		dividers,
		headerIcon: bareCommunicationFace ? null : headerIcon,
		headerTitle: bareCommunicationFace ? null : headerTitle,
		headerType: bareCommunicationFace ? null : headerType,
	}
}
