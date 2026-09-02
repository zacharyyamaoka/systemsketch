/**
 * In-window port geometry: where the "add a port here" bead sits, and where a
 * held port would land if it were dropped now.
 *
 * Nothing here authors a coordinate of its own. Both answers are read back out
 * of `layoutBlock` — the add bead by laying out the *hypothetical* Block that
 * already has the new port, the drop target by comparing the pointer against
 * the ports the layout actually placed. That is the only way the affordance and
 * the row and column it promises cannot drift apart when the body grammar or
 * the edges move.
 */
import {
	HEADER_ROW,
	appendBlockPortToProps,
	portBranch,
	portInHeader,
	portRow,
	resizeBlockProps,
	type BlockPortSection,
	type BlockPortSide,
	type BlockShapeProps,
} from '../blockModel'
import {
	HEADER_PORT_PITCH_PX,
	NODE_ROW_HEIGHT_PX,
	PORT_LABEL_HEIGHT_PX,
	blockPortSlotCount,
	blockPortViewHeightForSlots,
	layoutBlock,
	type BlockLayoutBand,
	type BlockRect,
	type LaidOutBlockPort,
} from '../layoutBlock'

/**
 * Half-width of the hover strip, which straddles the lane's own edge rather
 * than sitting inset beside it: the bead it reveals lands on that edge, so you
 * should be able to ask for the port where the port is going to appear. 20 is
 * the radius of the hit halo a port dot already paints, which makes the strip
 * and the dots one continuous column instead of two targets fighting over one.
 *
 * Sharing that column costs the connection gesture nothing. A dot and its halo
 * paint at `z-index: 4` against this strip's none, so wherever the two overlap
 * the dot is the element under the pointer and a press there still starts a
 * cable. What the strip needs is vertical separation, and `top` below supplies
 * it by starting under the last row's label box.
 */
export const PORT_ADD_ZONE_HALF_WIDTH_PX = 20

/** Clear of the last row — its label box owns click-to-edit, its dot the cable. */
const PORT_ADD_LABEL_CLEARANCE_PX = 2

const PORT_ADD_MIN_ZONE_PX = 10
const PORT_ADD_BEAD_MARGIN_PX = 4

export interface BlockPortAddAffordance {
	side: BlockPortSide
	/** Bead centre in Block-local coordinates, on the lane's edge with the dots. */
	x: number
	y: number
	/** The strip that reveals the bead on hover. */
	zone: BlockRect
	/**
	 * The height the Block needs so the promised row keeps the full row pitch.
	 * Equal to the current height whenever there is already room.
	 */
	grownHeight: number
}

function laneSide(side: BlockPortSide): 'input' | 'output' {
	return side === 'inputs' ? 'input' : 'output'
}

/**
 * Grow a Port-view Block so every row — including one just added — keeps the
 * full 44px pitch. Never shrinks: a box the user made roomy stays roomy.
 *
 * Expanded is deliberately excluded. Its ports spread proportionally inside
 * weighted sections rather than sitting on a fixed grid, so it has no single
 * "one more row" height to grow to.
 */
export function growBlockPortViewToFit(props: BlockShapeProps): BlockShapeProps {
	if (props.view !== 'port') return props
	const wanted = blockPortViewHeightForSlots(props, blockPortSlotCount(props))
	if (props.h >= wanted) return props
	return resizeBlockProps(props, props.w, wanted)
}

/**
 * Where the next port on `side` would appear, and the strip you hover to ask
 * for it. `null` when the lane has no room to offer — Simple view, or a body
 * whose rows already reach the footer.
 */
export function blockPortAddAffordance(
	props: BlockShapeProps,
	side: BlockPortSide,
): BlockPortAddAffordance | null {
	// Answered from the props object's identity: a selected Block asks for both
	// lanes on every render, and each answer lays out two hypothetical Blocks.
	let bySide = affordanceMemo.get(props)
	if (bySide && side in bySide) return bySide[side] ?? null
	const affordance = computeBlockPortAddAffordance(props, side)
	if (!bySide) {
		bySide = {}
		affordanceMemo.set(props, bySide)
	}
	bySide[side] = affordance
	return affordance
}

const affordanceMemo = new WeakMap<
	BlockShapeProps,
	Partial<Record<BlockPortSide, BlockPortAddAffordance | null>>
>()

function computeBlockPortAddAffordance(
	props: BlockShapeProps,
	side: BlockPortSide,
): BlockPortAddAffordance | null {
	// Simple has no lanes to grow, and a capsule has one inlet and one outlet by definition.
	if (props.view === 'simple' || props.view === 'value') return null

	const layout = layoutBlock(props)
	const lane = layout.ports.filter((placed) => placed.side === laneSide(side))
	const lastY = lane.reduce((lowest, placed) => Math.max(lowest, placed.y), Number.NEGATIVE_INFINITY)
	const top = lane.length === 0
		? layout.bodyTop
		: Math.max(
			layout.bodyTop,
			lastY + PORT_LABEL_HEIGHT_PX / 2 + PORT_ADD_LABEL_CLEARANCE_PX,
		)
	const bottom = layout.footerTop - 2
	if (bottom - top < PORT_ADD_MIN_ZONE_PX) return null

	// Lay out the Block that would exist after the click, so the bead is the
	// row itself rather than a second guess at the body grammar.
	const appended = appendBlockPortToProps(props, side)
	const grown = growBlockPortViewToFit(appended.props)
	const previewPort = layoutBlock(grown).ports.find((placed) => (
		placed.port.id === appended.port.id
	))
	const preferredY = previewPort?.y ?? top + (bottom - top) / 2
	// The bead's column is read back out of the preview exactly like its row:
	// whichever edge the layout just put the promised dot on is the edge the
	// bead sits on, so the bead and the dot it becomes cannot land in different
	// columns however the edges move. A lane with no rows yet answers from the
	// same preview — it is laid out whether or not the lane is already occupied.
	const x = previewPort?.x ?? (side === 'inputs' ? 0 : layout.width)
	// Never let the two bands meet in the middle of a very narrow Block: one
	// hover has to mean one lane.
	const halfWidth = Math.min(PORT_ADD_ZONE_HALF_WIDTH_PX, layout.width / 2)

	return {
		side,
		x,
		y: Math.min(
			bottom - PORT_ADD_BEAD_MARGIN_PX,
			Math.max(top + PORT_ADD_BEAD_MARGIN_PX, preferredY),
		),
		zone: {
			x: x - halfWidth,
			y: top,
			w: halfWidth * 2,
			h: bottom - top,
		},
		grownHeight: grown.h,
	}
}

/**
 * The "add a port to the heading" bead: the same table gutter, on the band
 * where control-flow inputs live. The strip straddles the heading's left edge
 * beside the header dots and stops short of the title, whose click-to-edit
 * begins at the heading's own padding.
 *
 * The heading grows into the body to fit its dots, never the box, so the
 * promised height is always the current height.
 */
export function blockHeaderPortAddAffordance(
	props: BlockShapeProps,
): BlockPortAddAffordance | null {
	if (props.view === 'simple') return null
	const layout = layoutBlock(props)
	const headerDots = layout.ports.filter((placed) => (
		placed.side === 'input' && portInHeader(placed.port)
	))
	const lowest = headerDots.reduce((low, placed) => Math.max(low, placed.y), Number.NEGATIVE_INFINITY)
	const preferredY = headerDots.length === 0 ? layout.headerHeight / 2 : lowest + HEADER_PORT_PITCH_PX
	const halfWidth = Math.min(PORT_ADD_ZONE_HALF_WIDTH_PX, layout.width / 2)
	return {
		side: 'inputs',
		x: 0,
		y: Math.min(layout.headerHeight - PORT_ADD_BEAD_MARGIN_PX, preferredY),
		zone: {
			x: -halfWidth,
			y: 0,
			w: halfWidth + HEADER_ADD_ZONE_INSET_PX,
			h: layout.headerHeight,
		},
		grownHeight: layout.height,
	}
}

/** The strip reaches only this far into the heading, clear of the title. */
const HEADER_ADD_ZONE_INSET_PX = 10

/** A place in the burger to put a port, plus where in that place. */
export interface BlockPortSectionTarget extends BlockPortSection {
	/** Insert before this port of the section, or at the section's end. */
	before: string | null
}

export interface BlockPortDropTarget extends BlockPortSectionTarget {
	/** Where to paint the drop rule, in Block-local coordinates. */
	indicatorY: number
	/** The band the held port would join, painted while the drop is offered. */
	band: BlockLayoutBand
}

function positionAmong(
	members: readonly LaidOutBlockPort[],
	localY: number,
	band: BlockLayoutBand,
	gap: number,
): { before: string | null; indicatorY: number } {
	const clamp = (y: number) => Math.min(band.bottom, Math.max(band.top, y))
	if (members.length === 0) return { before: null, indicatorY: clamp((band.top + band.bottom) / 2) }
	const found = members.findIndex((member) => localY < member.y)
	const before = found === -1 ? null : members[found].port.id
	const raw = found === 0
		? members[0].y - gap
		: found === -1
			? members[members.length - 1].y + gap
			: (members[found - 1].y + members[found].y) / 2
	return { before, indicatorY: clamp(raw) }
}

/**
 * Read a held pointer's Block-local `y` as a place in the burger: the row
 * whose band holds it, the arm within that row for an output, and the visible
 * neighbour it would land before. Above the body, an input is offered the
 * heading band — row 0 — which is the whole of "drag it above the line".
 *
 * Only the ports the layout placed take part, so a hidden port is never a
 * neighbour to land beside, yet keeps its own place in the stored order.
 */
export function blockPortDropTarget(
	props: BlockShapeProps,
	side: BlockPortSide,
	localY: number,
): BlockPortDropTarget {
	const layout = layoutBlock(props)
	const lane = [...layout.ports.filter((placed) => placed.side === laneSide(side))]
		.sort((a, b) => a.y - b.y)
	const gap = (layout.pitch > 0 ? layout.pitch : NODE_ROW_HEIGHT_PX) / 2

	if (side === 'inputs' && layout.headerBand && localY < layout.bodyTop) {
		const band = layout.headerBand
		const members = lane.filter((placed) => portInHeader(placed.port))
		return {
			row: HEADER_ROW,
			branch: 0,
			band,
			...positionAmong(members, localY, band, HEADER_PORT_PITCH_PX / 2),
		}
	}

	const sections = layout.sections
	if (sections.length === 0) {
		const band = { top: layout.bodyTop, bottom: layout.footerTop }
		return { row: 1, branch: 0, band, before: null, indicatorY: layout.bodyTop + gap }
	}
	const last = sections[sections.length - 1]
	const section = sections.find((candidate) => localY < candidate.band.bottom) ?? last
	const arms = section.branches
	const arm = side === 'outputs'
		? arms.find((candidate) => localY < candidate.band.bottom) ?? arms[arms.length - 1]
		: arms[0]
	const band = side === 'outputs' && arm ? arm.band : section.band
	const branch = side === 'outputs' && arm ? arm.branch : 0
	const members = lane.filter((placed) => (
		!portInHeader(placed.port)
		&& portRow(placed.port) === section.row
		&& (side === 'inputs' || portBranch(placed.port) === branch)
	))
	return {
		row: section.row,
		branch,
		band,
		...positionAmong(members, localY, band, gap),
	}
}
