import { StyleProp, T, type TLShape } from 'tldraw'

export const BLOCK_SHAPE_TYPE = 'block' as const
export const BLOCK_TOOL_ID = 'block' as const

export const BLOCK_VIEWS = ['simple', 'port', 'expanded'] as const
export type BlockView = (typeof BLOCK_VIEWS)[number]

/**
 * How the two visible port lanes share body rows.
 *
 * `inline` is the donor UI's "Aligned" choice: input and output row i share
 * a slot. `offset` stacks every output below the inputs.
 */
export const PORT_LAYOUTS = ['offset', 'inline'] as const
export type PortLayout = (typeof PORT_LAYOUTS)[number]

/**
 * tldraw's documented seam for a prop that batches across a multi-selection.
 *
 * Registering a prop as a `StyleProp` is not decoration. It is what makes
 * `editor.getSharedStyles()` report the selection as shared-or-mixed and what
 * makes `editor.setStyleForSelectedShapes` write every selected Block — group
 * descendants included — with exactly the semantics stock tldraw already gives
 * a rectangle's colour. Nothing else in this repo has to walk the selection.
 *
 * Only presentation batches. The identity-bearing fields (title, type, notes,
 * ports, remembered boxes) are deliberately not styles: applying one value to
 * all of them would erase what makes each Block itself.
 */
export const BlockViewStyle = StyleProp.defineEnum('systemsketch:blockView', {
	defaultValue: 'simple',
	values: BLOCK_VIEWS,
})

export const BlockPortLayoutStyle = StyleProp.defineEnum('systemsketch:blockPortLayout', {
	defaultValue: 'inline',
	values: PORT_LAYOUTS,
})

export const BlockShowDescriptionStyle = StyleProp.define('systemsketch:blockShowDescription', {
	defaultValue: true,
	type: T.boolean,
})

export const BlockViewSize = T.object({
	w: T.number,
	h: T.number,
})
export type BlockViewSize = T.TypeOf<typeof BlockViewSize>

/**
 * A port's id is its durable identity. The editable name is deliberately not
 * used by connectors or by layout keys.
 */
export const BlockPort = T.object({
	id: T.string,
	name: T.string,
	type: T.string,
	visible: T.boolean,
	/** Python-style input default, e.g. `window: int = 5`. */
	defaultValue: T.string.optional(),
	/** Begins a new async body row; ignored on a side's first port. */
	groupStart: T.boolean.optional(),
	/** Outputs only: begins a conditional branch within the current row. */
	branchStart: T.boolean.optional(),
	/** Inputs only: place the port's dot in the heading band. */
	header: T.boolean.optional(),
})
export type BlockPort = T.TypeOf<typeof BlockPort>

export const BLOCK_SHAPE_PROPS = {
	w: T.number,
	h: T.number,
	title: T.string,
	description: T.string,
	blockType: T.string,
	/** Curated pyblocks glyph name. Optional so earlier profile records load. */
	icon: T.string.optional(),
	view: BlockViewStyle,
	views: T.object({
		simple: BlockViewSize,
		port: BlockViewSize,
		expanded: BlockViewSize,
	}),
	showDescription: BlockShowDescriptionStyle,
	/** Detailed Markdown from the donor Notes tab. */
	notes: T.string.optional(),
	/**
	 * Required since the `PortLayoutStyle` migration: a tldraw StyleProp cannot
	 * be optional, because the editor must find a concrete value on every Block
	 * to decide whether a selection is shared or mixed.
	 */
	portLayout: BlockPortLayoutStyle,
	/** Manual expanded-section weights keyed by `g:<id>` / `b:<id>`. */
	expandedWeights: T.dict(T.string, T.number).optional(),
	inputs: T.arrayOf(BlockPort),
	outputs: T.arrayOf(BlockPort),
} as const

declare module 'tldraw' {
	export interface TLGlobalShapePropsMap {
		[BLOCK_SHAPE_TYPE]: {
			w: number
			h: number
			title: string
			description: string
			blockType: string
			icon?: string
			view: BlockView
			views: {
				simple: BlockViewSize
				port: BlockViewSize
				expanded: BlockViewSize
			}
			showDescription: boolean
			notes?: string
			portLayout: PortLayout
			expandedWeights?: Record<string, number>
			inputs: BlockPort[]
			outputs: BlockPort[]
		}
	}
}

export type BlockShape = TLShape<typeof BLOCK_SHAPE_TYPE>
export type BlockShapeProps = BlockShape['props']

export const DEFAULT_BLOCK_VIEW_SIZES: Readonly<Record<BlockView, BlockViewSize>> = {
	simple: { w: 320, h: 206 },
	port: { w: 340, h: 198 },
	expanded: { w: 560, h: 380 },
}

export function getDefaultBlockProps(): BlockShapeProps {
	const views = {
		simple: { ...DEFAULT_BLOCK_VIEW_SIZES.simple },
		port: { ...DEFAULT_BLOCK_VIEW_SIZES.port },
		expanded: { ...DEFAULT_BLOCK_VIEW_SIZES.expanded },
	}
	return {
		...views.simple,
		title: '',
		description: '',
		blockType: '',
		icon: '',
		view: 'simple',
		views,
		showDescription: true,
		notes: '',
		portLayout: 'inline',
		inputs: [],
		outputs: [],
	}
}

/** The one reader for the optional donor icon field. */
export function blockIcon(props: BlockShapeProps): string {
	return props.icon ?? ''
}

/** The one reader for the optional donor Notes field. */
export function blockNotes(props: BlockShapeProps): string {
	return props.notes ?? ''
}

/**
 * The one reader for the port layout.
 *
 * The store migration fills the field, so this is normally a pass-through; the
 * fallback still covers an in-memory record assembled by hand before the
 * migration ever sees it. Donor behavior was Aligned.
 */
export function blockPortLayout(props: BlockShapeProps): PortLayout {
	return props.portLayout ?? 'inline'
}

/** The one reader for optional expanded divider weights. */
export function expandedSectionWeights(props: BlockShapeProps): Record<string, number> {
	return props.expandedWeights ?? {}
}

export function portDefaultValue(port: BlockPort): string {
	return port.defaultValue ?? ''
}

export function portStartsGroup(port: BlockPort): boolean {
	return port.groupStart ?? false
}

export function portStartsBranch(port: BlockPort): boolean {
	return port.branchStart ?? false
}

export function portInHeader(port: BlockPort): boolean {
	return port.header ?? false
}

export function isBlockShape(shape: TLShape | null | undefined): shape is BlockShape {
	return shape?.type === BLOCK_SHAPE_TYPE
}

export function isExpandedBlockShape(shape: TLShape | null | undefined): shape is BlockShape {
	return isBlockShape(shape) && shape.props.view === 'expanded'
}

export function canBlockContainChildren(view: BlockView): boolean {
	return view === 'expanded'
}

/**
 * Project a view switch through the remembered per-view boxes. The current
 * box is parked before the target box is restored, so resizing one view never
 * destroys the dimensions of another.
 */
export function setBlockViewProps(props: BlockShapeProps, view: BlockView): BlockShapeProps {
	const views = {
		...props.views,
		[props.view]: { w: props.w, h: props.h },
	}
	const target = views[view]
	return {
		...props,
		view,
		views,
		w: target.w,
		h: target.h,
	}
}

/** Keep tldraw's canonical box and the active remembered box in lockstep. */
export function resizeBlockProps(props: BlockShapeProps, w: number, h: number): BlockShapeProps {
	return {
		...props,
		w,
		h,
		views: {
			...props.views,
			[props.view]: { w, h },
		},
	}
}

/**
 * Adopt the view inferred from a completed placement gesture without throwing
 * away the box the user just drew. The drawn dimensions become that view's
 * remembered size; later inspector switches still restore each other view.
 */
export function setBlockPlacementViewProps(
	props: BlockShapeProps,
	view: BlockView,
): BlockShapeProps {
	const drawn = { w: props.w, h: props.h }
	return resizeBlockProps(setBlockViewProps(props, view), drawn.w, drawn.h)
}

/**
 * Merge the partial box props returned by tldraw's resize helpers back into
 * the complete semantic Block record. `ShapeUtil.onResize` returns a partial
 * update; treating it as full Block props drops the remembered views and ports.
 */
export function mergeBlockResizeProps(
	props: BlockShapeProps,
	resized: Partial<Pick<BlockShapeProps, 'w' | 'h'>>,
): BlockShapeProps {
	const w = Math.max(1, Math.round(resized.w ?? props.w))
	const h = Math.max(1, Math.round(resized.h ?? props.h))
	return resizeBlockProps(props, w, h)
}

/**
 * Every boundary port has an INNER face: a derived twin at the same anchor with
 * the flipped terminal, so the inside of an Expanded Block can be wired.
 *
 * A port's side is its direction, and that equation is true for a leaf Block and
 * false for a boundary: from the page, `raw bytes` is a sink; from inside the
 * frame it is a source. Rather than teach the whole connection layer about
 * scopes, the boundary grows a second identity at the same coordinate. Exactly
 * one of the two faces matches any given drag terminal, so there is nothing to
 * disambiguate — and the dot draws once, carrying the union of both faces.
 *
 * Twins exist in EVERY view so a cable welded to one survives a view switch;
 * they are hidden outside `expanded`, where the inside is not on screen.
 */
export const INNER_PORT_SUFFIX = '__inner'

export function innerPortId(portId: string): string {
	return `${portId}${INNER_PORT_SUFFIX}`
}

export function isInnerPortId(portId: string): boolean {
	return portId.endsWith(INNER_PORT_SUFFIX)
}

/** The boundary port an id names: an inner face maps to its outer port, anything else to itself. */
export function outerPortId(portId: string): string {
	return isInnerPortId(portId) ? portId.slice(0, -INNER_PORT_SUFFIX.length) : portId
}

export type BlockPortSide = 'inputs' | 'outputs'

export function appendBlockPortToProps(
	props: BlockShapeProps,
	side: BlockPortSide,
): { props: BlockShapeProps; port: BlockPort } {
	const prefix = side === 'inputs' ? 'in' : 'out'
	const highest = props[side].reduce((best, port) => {
		const match = /^(?:in|out)_(\d+)$/.exec(port.id)
		return match ? Math.max(best, Number(match[1])) : best
	}, 0)
	const id = `${prefix}_${highest + 1}`
	const port: BlockPort = { id, name: id, type: '', visible: true }
	return {
		props: { ...props, [side]: [...props[side], port] },
		port,
	}
}

/**
 * Resolve the frame that should own a containment callback.
 *
 * Creation must never claim a non-expanded Block as the new shape's parent;
 * tldraw will continue walking the z-order and find the expanded frame behind
 * it. Translation is different: drag/drop first encounters an existing child
 * Block, so that child proxies to its nearest expanded Block ancestor. This is
 * the small distinction that fixes the historical "cannot draw inside an
 * expanded Block" / "drop over an existing child" family of bugs.
 */
export function findBlockContainmentTarget(
	shape: TLShape,
	ancestors: readonly TLShape[],
	allowAncestorProxy: boolean,
): BlockShape | undefined {
	if (isExpandedBlockShape(shape)) return shape
	if (!allowAncestorProxy) return undefined
	// Editor.getShapeAncestors returns outermost → nearest. Walk backwards so a
	// collapsed child inside nested Expanded Blocks stays with its immediate
	// container rather than jumping out to the outermost frame.
	for (let index = ancestors.length - 1; index >= 0; index -= 1) {
		const ancestor = ancestors[index]
		if (isExpandedBlockShape(ancestor)) return ancestor
	}
	return undefined
}

/**
 * A frame-like Block must never receive a drag gesture that contains itself.
 *
 * tldraw's BaseFrameLikeShapeUtil protects against reparenting an ancestor
 * into its descendant, but equality is deliberately not part of
 * `editor.hasAncestor`. Our collapsed-Block ancestor proxy can therefore
 * resolve a drag target to the expanded Block already being dragged. Passing
 * that set through would call `reparentShapes(shapes, container.id)` with the
 * container in `shapes` and throw "Attempted to reparent a shape to itself".
 * Reject the whole multi-shape gesture, matching the base util's cycle guard.
 */
export function canReparentDraggedShapesIntoBlock(
	container: BlockShape,
	draggingShapes: readonly TLShape[],
): boolean {
	return draggingShapes.every((draggingShape) => draggingShape.id !== container.id)
}
