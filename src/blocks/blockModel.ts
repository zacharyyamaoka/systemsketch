import { StyleProp, T, createShapeId, type TLShape } from 'tldraw'

export const BLOCK_SHAPE_TYPE = 'block' as const
export const BLOCK_TOOL_ID = 'block' as const
/** P creates the separate `value` literal-pill representation. */
export const PILL_TOOL_ID = 'pill' as const

/**
 * `value` stores a literal argument drawn as a capsule. It shares the Block
 * primitive's cable, persistence, and editing seams, but it is a distinct
 * representation—not an ordinary Block presentation or conversion target;
 * see `valueBlock.ts`.
 */
export const BLOCK_VIEWS = ['simple', 'port', 'expanded', 'value'] as const
export type BlockView = (typeof BLOCK_VIEWS)[number]

/**
 * The structural presentations an ordinary Block may switch between. `value`
 * is deliberately absent: it is the separate literal-pill representation,
 * created by the Pill tool or the connection-drop picker, never a conversion
 * target for an existing Block.
 */
export const BLOCK_PRESENTATION_VIEWS = ['simple', 'port', 'expanded'] as const satisfies readonly BlockView[]
export type BlockPresentationView = (typeof BLOCK_PRESENTATION_VIEWS)[number]

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
	/**
	 * Which row of the burger the port sits in. Row `0` is the heading band,
	 * which only inputs may occupy: the data that shapes the Block's control
	 * flow — a callable, a predicate, an iterable. Rows `1` and up are the body
	 * rows, the parallel lanes the body splits into. Absent means the first
	 * body row, so a port with no row is exactly where it always was.
	 */
	row: T.number.optional(),
	/**
	 * Outputs only: which conditional arm of its row the port belongs to, `0`
	 * being the first. Arms are the mutually exclusive output sets a half-line
	 * divides. Absent means the first arm.
	 */
	branch: T.number.optional(),
})
export type BlockPort = T.TypeOf<typeof BlockPort>

/** The heading band is the row every input may be lifted into. */
export const HEADER_ROW = 0
/** Where a port with no row of its own lives. */
export const FIRST_BODY_ROW = 1

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
		value: BlockViewSize,
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
	/** Opaque identity shared by every occurrence of one callable definition. */
	definitionId: T.string.optional(),
	/** Collision-free export / namespace key. The canvas keeps showing `title`. */
	definitionKey: T.string.optional(),
	/** Present only while this definition is a same-name, different-body draft. */
	draftOrdinal: T.number.optional(),
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
				value: BlockViewSize
			}
			showDescription: boolean
			notes?: string
			portLayout: PortLayout
			expandedWeights?: Record<string, number>
			definitionId?: string
			definitionKey?: string
			draftOrdinal?: number
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
	// A capsule is as wide as its text; this is the empty one, before typing.
	value: { w: 168, h: 56 },
}

export function getDefaultBlockProps(): BlockShapeProps {
	const views = {
		simple: { ...DEFAULT_BLOCK_VIEW_SIZES.simple },
		port: { ...DEFAULT_BLOCK_VIEW_SIZES.port },
		expanded: { ...DEFAULT_BLOCK_VIEW_SIZES.expanded },
		value: { ...DEFAULT_BLOCK_VIEW_SIZES.value },
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
		definitionId: createShapeId().slice('shape:'.length),
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

/** The one reader for a port's row. */
export function portRow(port: BlockPort): number {
	return port.row ?? FIRST_BODY_ROW
}

/** The one reader for a port's arm within its row. */
export function portBranch(port: BlockPort): number {
	return port.branch ?? 0
}

export function portInHeader(port: BlockPort): boolean {
	return portRow(port) === HEADER_ROW
}

/** One place in the burger: a row, and for outputs an arm within it. */
export interface BlockPortSection {
	row: number
	branch: number
}

export function portSection(port: BlockPort): BlockPortSection {
	return { row: portRow(port), branch: portBranch(port) }
}

export function sameBlockPortSection(a: BlockPortSection, b: BlockPortSection): boolean {
	return a.row === b.row && a.branch === b.branch
}

/** A port record carrying `section`, with the default row and arm left implicit. */
export function withBlockPortSection(port: BlockPort, section: BlockPortSection): BlockPort {
	const { row: _row, branch: _branch, ...rest } = port
	const next: BlockPort = { ...rest }
	if (section.row !== FIRST_BODY_ROW) next.row = section.row
	if (section.branch !== 0) next.branch = section.branch
	return next
}

export interface BlockRowSections {
	/** Row 0: the inputs riding the heading band. */
	header: BlockPort[]
	/** Body rows in order, each with its inputs and its ordered output arms. */
	rows: {
		row: number
		inputs: BlockPort[]
		branches: { branch: number; outputs: BlockPort[] }[]
	}[]
}

/**
 * The burger as a table: which ports sit in which row, and in which arm.
 *
 * This is the one grouping every consumer reads — the layout, the inspector's
 * list, the drop rule and the row menu — so a row means the same thing in all
 * of them. Rows are numbered from the ports themselves: a row exists because a
 * port on either side claims it, and the header always exists for inputs.
 *
 * `visibleOnly` considers only visible ports, and drops a body row or arm that
 * no visible port claims — the layout has nothing to draw there. Every other
 * consumer wants the hidden ports in place, keeping their row.
 */
export function blockPortSections(
	props: Pick<BlockShapeProps, 'inputs' | 'outputs'>,
	{ visibleOnly = false }: { visibleOnly?: boolean } = {},
): BlockRowSections {
	const consider = (ports: readonly BlockPort[]) => (
		visibleOnly ? ports.filter((port) => port.visible) : ports
	)
	const inputs = consider(props.inputs)
	const outputs = consider(props.outputs)
	const header = inputs.filter((port) => portInHeader(port))
	const bodyInputs = inputs.filter((port) => !portInHeader(port))

	const rowNumbers = new Set<number>([FIRST_BODY_ROW])
	for (const port of bodyInputs) rowNumbers.add(Math.max(FIRST_BODY_ROW, portRow(port)))
	for (const port of outputs) rowNumbers.add(Math.max(FIRST_BODY_ROW, portRow(port)))
	const highest = Math.max(...rowNumbers)

	const rows: BlockRowSections['rows'] = []
	for (let row = FIRST_BODY_ROW; row <= highest; row += 1) {
		const rowInputs = bodyInputs.filter((port) => Math.max(FIRST_BODY_ROW, portRow(port)) === row)
		const rowOutputs = outputs.filter((port) => Math.max(FIRST_BODY_ROW, portRow(port)) === row)
		if (visibleOnly && row !== FIRST_BODY_ROW && rowInputs.length === 0 && rowOutputs.length === 0) {
			continue
		}
		const branchNumbers = new Set<number>([0])
		for (const port of rowOutputs) branchNumbers.add(portBranch(port))
		const branches: { branch: number; outputs: BlockPort[] }[] = []
		for (let branch = 0; branch <= Math.max(...branchNumbers); branch += 1) {
			const armOutputs = rowOutputs.filter((port) => portBranch(port) === branch)
			if (visibleOnly && branch !== 0 && armOutputs.length === 0) continue
			branches.push({ branch, outputs: armOutputs })
		}
		rows.push({ row, inputs: rowInputs, branches })
	}
	return { header, rows }
}

function samePortList(a: readonly BlockPort[], b: readonly BlockPort[]): boolean {
	return a.length === b.length && a.every((port, index) => port === b[index])
}

/**
 * Put the row grammar into canonical form, so that every reader sees one
 * shape of the truth: rows are dense from 1, arms are dense from 0 within
 * their row, a header port is always an input, and each lane's stored order
 * is its visual order — header first, then row by row, arm by arm.
 *
 * Returns the very same props object when nothing had to change, so a caller
 * can use identity to know whether a write is needed.
 */
export function normalizeBlockPortRows(props: BlockShapeProps): BlockShapeProps {
	const clampInputs = props.inputs.map((port) => {
		const row = Math.max(HEADER_ROW, Math.round(portRow(port)))
		const section = { row, branch: 0 }
		return sameBlockPortSection(portSection(port), section)
			&& port.row !== FIRST_BODY_ROW && port.branch !== 0
			? port
			: withBlockPortSection(port, section)
	})
	const clampOutputs = props.outputs.map((port) => {
		const row = Math.max(FIRST_BODY_ROW, Math.round(portRow(port)))
		const branch = Math.max(0, Math.round(portBranch(port)))
		const section = { row, branch }
		return sameBlockPortSection(portSection(port), section)
			&& port.row !== FIRST_BODY_ROW && port.branch !== 0
			? port
			: withBlockPortSection(port, section)
	})

	// Rows are dense: a row exists because a port claims it, on either side.
	const usedRows = [...new Set([
		...clampInputs.filter((port) => !portInHeader(port)).map(portRow),
		...clampOutputs.map(portRow),
	])].sort((a, b) => a - b)
	const rowOf = new Map(usedRows.map((row, index) => [row, FIRST_BODY_ROW + index]))
	rowOf.set(HEADER_ROW, HEADER_ROW)

	// Arms are dense within their row.
	const branchOf = new Map<string, number>()
	for (const row of usedRows) {
		const used = [...new Set(
			clampOutputs.filter((port) => portRow(port) === row).map(portBranch),
		)].sort((a, b) => a - b)
		used.forEach((branch, index) => branchOf.set(`${row}:${branch}`, index))
	}

	const renumber = (port: BlockPort, side: BlockPortSide): BlockPort => {
		const row = rowOf.get(portRow(port)) ?? FIRST_BODY_ROW
		const branch = side === 'outputs'
			? branchOf.get(`${portRow(port)}:${portBranch(port)}`) ?? 0
			: 0
		const section = { row, branch }
		return sameBlockPortSection(portSection(port), section) ? port : withBlockPortSection(port, section)
	}
	const sortBySection = (ports: BlockPort[]) => ports
		.map((port, index) => ({ port, index }))
		.sort((a, b) => (
			portRow(a.port) - portRow(b.port)
			|| portBranch(a.port) - portBranch(b.port)
			|| a.index - b.index
		))
		.map((entry) => entry.port)

	const sortedInputs = sortBySection(clampInputs.map((port) => renumber(port, 'inputs')))
	const sortedOutputs = sortBySection(clampOutputs.map((port) => renumber(port, 'outputs')))
	// A lane that did not change keeps its array, so identity keeps meaning "untouched".
	const inputs = samePortList(sortedInputs, props.inputs) ? props.inputs : sortedInputs
	const outputs = samePortList(sortedOutputs, props.outputs) ? props.outputs : sortedOutputs
	if (inputs === props.inputs && outputs === props.outputs) return props
	return { ...props, inputs, outputs }
}

export function isBlockShape(shape: TLShape | null | undefined): shape is BlockShape {
	return shape?.type === BLOCK_SHAPE_TYPE
}

export function isExpandedBlockShape(shape: TLShape | null | undefined): shape is BlockShape {
	return isBlockShape(shape) && shape.props.view === 'expanded'
}

/** A literal argument: a Block wearing the capsule. */
export function isValueBlockShape(shape: TLShape | null | undefined): shape is BlockShape {
	return isBlockShape(shape) && shape.props.view === 'value'
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

export type BlockPortSide = 'inputs' | 'outputs'

/**
 * Add a port to the end of a section — by default the end of the first body
 * row. A section is asked for by the heading bead (row 0) and by "add in this
 * row"; the lane is then put back in visual order.
 */
export function appendBlockPortToProps(
	props: BlockShapeProps,
	side: BlockPortSide,
	section: BlockPortSection = { row: FIRST_BODY_ROW, branch: 0 },
): { props: BlockShapeProps; port: BlockPort } {
	const prefix = side === 'inputs' ? 'in' : 'out'
	const highest = props[side].reduce((best, port) => {
		const match = /^(?:in|out)_(\d+)$/.exec(port.id)
		return match ? Math.max(best, Number(match[1])) : best
	}, 0)
	const id = `${prefix}_${highest + 1}`
	const port = withBlockPortSection({ id, name: id, type: '', visible: true }, section)
	const appended = normalizeBlockPortRows({ ...props, [side]: [...props[side], port] })
	return {
		props: appended,
		port: appended[side].find((candidate) => candidate.id === id) ?? port,
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
