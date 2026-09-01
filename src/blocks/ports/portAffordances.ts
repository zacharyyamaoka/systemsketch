/**
 * In-window port geometry: where the "add a port here" bead sits, and where a
 * held port would land if it were dropped now.
 *
 * Nothing here authors a coordinate of its own. Both answers are read back out
 * of `layoutBlock` — the add bead by laying out the *hypothetical* Block that
 * already has the new port, the drop target by comparing the pointer against
 * the ports the layout actually placed. That is the only way the affordance and
 * the row it promises cannot drift apart when the body grammar changes.
 */
import {
	appendBlockPortToProps,
	resizeBlockProps,
	type BlockPortSide,
	type BlockShapeProps,
} from '../blockModel'
import {
	NODE_ROW_HEIGHT_PX,
	PORT_LABEL_HEIGHT_PX,
	blockPortSlotCount,
	blockPortViewHeightForSlots,
	layoutBlock,
	type BlockRect,
} from '../layoutBlock'

/**
 * A port dot paints a 40px pseudo-element hit halo. The hover strip starts
 * outside that halo horizontally so revealing the bead can never take a
 * connection gesture away from the port above it.
 */
export const PORT_ADD_ZONE_INSET_PX = 21

/** Clear of the last row's label box, which owns click-to-edit. */
const PORT_ADD_LABEL_CLEARANCE_PX = 2

/**
 * The bead sits just inside its edge rather than centred on it.
 *
 * A selected shape's selection box is painted by tldraw in `.tl-overlays`,
 * above the shape's own HTML and inside a stacking context no `z-index` here
 * can escape. A bead centred on the edge — where the port dot itself will land
 * — has that 2px line drawn straight down its middle, which erases the plus's
 * vertical stroke and leaves the glyph reading as a minus. Measured in the real
 * browser; the same line already crosses the port dots. The gutter is also
 * where a table paints its own add affordance, so this reads correctly.
 */
const PORT_ADD_BEAD_INSET_PX = 12
const PORT_ADD_MIN_ZONE_PX = 10
const PORT_ADD_BEAD_MARGIN_PX = 4

export interface BlockPortAddAffordance {
	side: BlockPortSide
	/** Bead centre in Block-local coordinates, in its lane's gutter. */
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
	if (props.view === 'simple') return null

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

	return {
		side,
		x: side === 'inputs'
			? PORT_ADD_BEAD_INSET_PX
			: layout.width - PORT_ADD_BEAD_INSET_PX,
		y: Math.min(
			bottom - PORT_ADD_BEAD_MARGIN_PX,
			Math.max(top + PORT_ADD_BEAD_MARGIN_PX, preferredY),
		),
		zone: {
			x: side === 'inputs' ? PORT_ADD_ZONE_INSET_PX : layout.width / 2,
			y: top,
			w: Math.max(0, layout.width / 2 - PORT_ADD_ZONE_INSET_PX),
			h: bottom - top,
		},
		grownHeight: grown.h,
	}
}

export interface BlockPortDropTarget {
	/** Insertion index into `props[side]` as it stands *before* the move. */
	insertIndex: number
	/** Where to paint the drop rule, in Block-local coordinates. */
	indicatorY: number
}

/**
 * Read a held pointer's Block-local `y` as a position in one lane's order.
 *
 * Only the ports the layout placed take part, so hidden ports keep their index
 * without ever becoming a drop target, and header inputs sort above body inputs
 * exactly as they are painted.
 */
export function blockPortDropTarget(
	props: BlockShapeProps,
	side: BlockPortSide,
	localY: number,
): BlockPortDropTarget {
	const layout = layoutBlock(props)
	const order = props[side]
	const placedBySide = layout.ports.filter((placed) => placed.side === laneSide(side))
	const lane = order.flatMap((port, index) => {
		const placed = placedBySide.find((candidate) => candidate.port.id === port.id)
		return placed ? [{ index, y: placed.y }] : []
	})

	const gap = (layout.pitch > 0 ? layout.pitch : NODE_ROW_HEIGHT_PX) / 2
	if (lane.length === 0) {
		return { insertIndex: order.length, indicatorY: layout.bodyTop + gap }
	}

	const found = lane.findIndex((entry) => localY < entry.y)
	const slot = found === -1 ? lane.length : found
	const insertIndex = slot === lane.length ? order.length : lane[slot].index
	const rawIndicator = slot === 0
		? lane[0].y - gap
		: slot === lane.length
			? lane[lane.length - 1].y + gap
			: (lane[slot - 1].y + lane[slot].y) / 2

	return {
		insertIndex,
		indicatorY: Math.min(layout.footerTop, Math.max(layout.bodyTop, rawIndicator)),
	}
}
