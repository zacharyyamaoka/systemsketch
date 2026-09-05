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

/** The source grammar of a call expression's variadic contribution. */
export const BLOCK_VARIADIC_KINDS = ['positional', 'keyword'] as const
export type BlockVariadicKind = (typeof BLOCK_VARIADIC_KINDS)[number]

/**
 * One ordinary cable endpoint belonging to a DEF-owned `*args` / `**kwargs`
 * run. The port remains independently connectable; this only preserves the
 * group the renderer explains with a label, micro-bracket, and collar.
 */
export const BlockVariadicPort = T.object({
	groupId: T.string,
	label: T.string,
	kind: T.literalEnum(...BLOCK_VARIADIC_KINDS),
	bundled: T.boolean,
})
export type BlockVariadicPort = T.TypeOf<typeof BlockVariadicPort>

/**
 * A semantic reading of a port. This is deliberately separate from Python
 * type, routing and temporal delivery: a port can be an Event carrying a
 * `Frame`, or ordinary Data carried on an async cable.
 */
export const SEMANTIC_PORT_ROLES = ['data', 'event', 'configuration', 'state', 'control', 'error'] as const
export type SemanticPortRole = (typeof SEMANTIC_PORT_ROLES)[number]

/** A claim made by a person or an offline analyser about one port. */
export const SemanticPortRoleClaim = T.object({
	role: T.literalEnum(...SEMANTIC_PORT_ROLES),
	/** Human-readable analyser/source provenance; absent for a local authoring gesture. */
	source: T.string.optional(),
	analyzer: T.string.optional(),
})
export type SemanticPortRoleClaim = T.TypeOf<typeof SemanticPortRoleClaim>

/**
 * A visual relationship between neighbouring, independently editable ports.
 *
 * WHY: the relationship intentionally carries neither a label nor a rendering
 * choice. A Block author may type any ordinary port names (including `*args`)
 * and later choose any presentation for this run without turning those ports
 * into a second, special kind of endpoint; see
 * docs/peps/0003-adjacent-port-link-groups.md.
 */
export const BlockPortLink = T.object({
	groupId: T.string,
})
export type BlockPortLink = T.TypeOf<typeof BlockPortLink>

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

/**
 * What a primitive is currently being *said about* — never what it is.
 *
 * `normal` is the whole document in ordinary use. The other five are a lens
 * somebody put on it: a conformance diff painting what the generated board
 * gained and lost against its target, or the board linter painting what it
 * judges wrong. One vocabulary for both, because a diff projector and a linter
 * both want to say "this port is wrong" and there is no reason for a reader to
 * learn two spellings of it.
 *
 * This is a `StyleProp` and not a plain field for the same reason `view` is:
 * a lens paints many primitives at once, `editor.setStyleForSelectedShapes`
 * writes a whole selection in one go, and `getSharedStyles` reports whether a
 * selection agrees — so clearing the lens is one write, not a walk.
 *
 * The one rule: a state is a lens, not a design decision. It is written into a
 * derived, disposable diff document, never into the file a person then edits.
 * `clearDiffStates` is the escape hatch for a board that got one anyway.
 */
export const BLOCK_STATES = ['normal', 'added', 'removed', 'changed', 'error', 'warning'] as const
export type BlockState = (typeof BLOCK_STATES)[number]

export const BlockStateStyle = StyleProp.defineEnum('systemsketch:state', {
	defaultValue: 'normal',
	values: BLOCK_STATES,
})

/**
 * One field's before/after pair, carried in the board diff contract's own
 * shape so a projector can hand `Change.fields` straight through.
 *
 * This is what lets a rename read as `callee → callable` on *any* field rather
 * than only on a port's name: the enum above says a thing changed, this says
 * what it used to be. Absent on every ordinary board.
 */
export const BlockFieldDiff = T.object({
	path: T.string,
	before: T.string,
	after: T.string,
})
export type BlockFieldDiff = T.TypeOf<typeof BlockFieldDiff>

/** Where a Block sat and how big it was on the before board. */
export const BlockPriorPose = T.object({
	x: T.number,
	y: T.number,
	w: T.number,
	h: T.number,
})
export type BlockPriorPose = T.TypeOf<typeof BlockPriorPose>

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
	/**
	 * Inputs only: the call writes this argument in place, so the caller's own
	 * object changes. Read off the signature, not off the wiring, which is why
	 * the hook shows in Port view before any cable exists.
	 */
	mutates: T.boolean.optional(),
	/**
	 * Outputs only: this value leaves by the *top* edge because the call gave it
	 * no name to leave by — `list.append(self, object, /) -> None` has no return
	 * channel, so the mutation is the only way the new value reaches anyone.
	 */
	effect: T.boolean.optional(),
	/**
	 * Effect outputs only: where along the top edge the port sits, `0` at the
	 * left corner and `1` at the right. The port has no slot — it is placed by
	 * the cable, so this follows wherever the cable crosses the boundary.
	 */
	edgeT: T.number.optional(),
	/**
	 * The lens's verdict on this row — see `BlockStateStyle`. Absent is
	 * `normal`, so every port ever written stays exactly what it was.
	 *
	 * A port is not a shape, so this cannot be a `StyleProp`; it is the same
	 * vocabulary carried as a field. That is what makes a missing port
	 * renderable *in the row it is missing from*, which free-floating
	 * annotation cannot do.
	 */
	state: T.literalEnum(...BLOCK_STATES).optional(),
	/**
	 * What this row used to say, when `state` is `changed`. A rename is the
	 * common real case — the target asserts `callee` and the generator produced
	 * `out` — and it reads as one row saying `callee → out`, not as a removal
	 * beside an addition.
	 *
	 * Superseded by `fieldDiffs`, and still read: boards already written carry
	 * one of these, and migrating it away would blank those renames.
	 */
	stateBefore: T.string.optional(),
	/**
	 * Every changed field of this row as a before/after pair — `name` and
	 * `type`. `stateBefore` could only ever speak for the name, which is why a
	 * port whose *type* changed had nothing to show but a strike.
	 */
	fieldDiffs: T.arrayOf(BlockFieldDiff).optional(),
	/** Optional V5 membership; never changes the port's stable identity. */
	variadic: BlockVariadicPort.optional(),
	/** A reusable/source-analysis claim. It remains intact when a person overrides it. */
	semanticRoleDerived: SemanticPortRoleClaim.optional(),
	/** A local, explicit override. Absence deliberately reveals the derived claim. */
	semanticRoleAuthored: SemanticPortRoleClaim.optional(),
	/** Optional generic membership in an adjacent-port visual run. */
	link: BlockPortLink.optional(),
})
export type BlockPort = T.TypeOf<typeof BlockPort>

/**
 * Small, persisted authoring facts for the curated stock Blocks.
 *
 * This is deliberately optional. A Block remains an open canvas primitive and
 * a newer curated preset must not make older hand-authored Blocks unreadable.
 * Runtime availability is deliberately not document state: an adapter owns
 * that live capability separately from a board's authoring declaration.
 */
export const StockBlockConfig = T.object({
	triggerSource: T.literalEnum('clock', 'external', 'manual').optional(),
	rateHz: T.number.optional(),
})
export type StockBlockConfig = T.TypeOf<typeof StockBlockConfig>

/** An effect output's id is derived from the input it writes back to. */
export const EFFECT_PORT_PREFIX = 'effect:'

export function effectPortId(inputId: string): string {
	return `${EFFECT_PORT_PREFIX}${inputId}`
}

/** The input an effect output writes back to, or null if it is not derived. */
export function mutatedInputId(port: BlockPort): string | null {
	return port.id.startsWith(EFFECT_PORT_PREFIX) ? port.id.slice(EFFECT_PORT_PREFIX.length) : null
}

export function isEffectPort(port: BlockPort): boolean {
	return port.effect === true
}

export function portMutates(port: BlockPort): boolean {
	return port.mutates === true
}

/** Where an effect port sits along the top edge. Centred until a cable moves it. */
export const EFFECT_EDGE_T_DEFAULT = 0.5
export const EFFECT_EDGE_T_MIN = 0.06
export const EFFECT_EDGE_T_MAX = 0.94

export function clampEdgeT(t: number): number {
	if (!Number.isFinite(t)) return EFFECT_EDGE_T_DEFAULT
	return Math.min(EFFECT_EDGE_T_MAX, Math.max(EFFECT_EDGE_T_MIN, t))
}

export function portEdgeT(port: BlockPort): number {
	return clampEdgeT(port.edgeT ?? EFFECT_EDGE_T_DEFAULT)
}

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
	/**
	 * The lens's verdict on this Block. `normal` in every ordinary document;
	 * a style prop cannot be optional, so the migration makes it explicit.
	 */
	state: BlockStateStyle,
	/**
	 * Every changed heading field as a before/after pair — `title`,
	 * `description`, `blockType`. Absent on every ordinary board.
	 */
	fieldDiffs: T.arrayOf(BlockFieldDiff).optional(),
	/**
	 * Where this Block sat and how big it was on the before board, when a lens
	 * says it moved or resized. Geometry is not in `fieldDiffs` on purpose: its
	 * mark is an outline, not a word-diff, and stringifying a coordinate into
	 * the text channel would misreport what kind of thing it is.
	 */
	priorPose: BlockPriorPose.optional(),
	/** Manual expanded-section weights keyed by `g:<id>` / `b:<id>`. */
	expandedWeights: T.dict(T.string, T.number).optional(),
	/** Opaque identity shared by every occurrence of one callable definition. */
	definitionId: T.string.optional(),
	/** Collision-free export / namespace key. A committed title rename may move one occurrence to a fresh Definition. */
	definitionKey: T.string.optional(),
	/** Present only while this definition is a same-name, different-body draft. */
	draftOrdinal: T.number.optional(),
	inputs: T.arrayOf(BlockPort),
	outputs: T.arrayOf(BlockPort),
	stockConfig: StockBlockConfig.optional(),
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
			state: BlockState
			fieldDiffs?: BlockFieldDiff[]
			priorPose?: BlockPriorPose
			expandedWeights?: Record<string, number>
			definitionId?: string
			definitionKey?: string
			draftOrdinal?: number
			inputs: BlockPort[]
			outputs: BlockPort[]
			stockConfig?: StockBlockConfig
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
		state: 'normal',
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

/** The one reader for a Block's lens state. */
export function blockDiffState(props: Pick<BlockShapeProps, 'state'>): BlockState {
	return props.state ?? 'normal'
}

/**
 * The one reader for a port's lens state.
 *
 * Named `portDiffState` and not `portState` because `ports/portState.ts`
 * already owns that name for the live hinting/drag atoms, and one of the two
 * would have had to be aliased at every call site.
 */
export function portDiffState(port: BlockPort): BlockState {
	return port.state ?? 'normal'
}

/** A port drawn in place but no longer there: the ghost row. */
export function isGhostPort(port: BlockPort): boolean {
	return portDiffState(port) === 'removed'
}

/** What a `changed` row used to say — empty when it says nothing. */
export function portStateBefore(port: BlockPort): string {
	return port.stateBefore ?? ''
}

export interface BlockStateCounts {
	added: number
	removed: number
	changed: number
	error: number
	warning: number
}

const EMPTY_STATE_COUNTS: BlockStateCounts = {
	added: 0, removed: 0, changed: 0, error: 0, warning: 0,
}

/**
 * What one Block's rows are saying, as the counts its badge shows.
 *
 * The headline counts ports and cables, never storage records — `2 ports
 * missing`, not `27 raw records changed`. This is the per-Block half of that
 * rule; the board headline sums these.
 */
export function blockPortStateCounts(
	props: Pick<BlockShapeProps, 'inputs' | 'outputs'>,
): BlockStateCounts {
	const counts = { ...EMPTY_STATE_COUNTS }
	for (const port of [...props.inputs, ...props.outputs]) {
		const state = portDiffState(port)
		if (state !== 'normal') counts[state] += 1
	}
	return counts
}

export function hasAnyBlockState(props: BlockShapeProps): boolean {
	if (blockDiffState(props) !== 'normal') return true
	// A pose ghost and a before/after pair are as much a lens as a state enum
	// is. Leaving them out here is how `clear diff marks` would leave a board
	// still saying `callee → callable` with nothing coloured to explain it.
	if (props.priorPose !== undefined) return true
	if ((props.fieldDiffs?.length ?? 0) > 0) return true
	return [...props.inputs, ...props.outputs].some((port) =>
		portDiffState(port) !== 'normal' || (port.fieldDiffs?.length ?? 0) > 0)
}

/**
 * Strip the lens off one Block's props: the state, the ports' states, and the
 * ghost rows a projector inserted. Returns the same object when there was no
 * lens on it, so a caller can use identity to know whether a write is needed.
 */
export function clearBlockStateProps(props: BlockShapeProps): BlockShapeProps {
	if (!hasAnyBlockState(props)) return props
	const strip = (ports: readonly BlockPort[]) => ports
		.filter((port) => !isGhostPort(port))
		.map((port) => {
			if (port.state === undefined && port.stateBefore === undefined && port.fieldDiffs === undefined) {
				return port
			}
			const { state: _state, stateBefore: _before, fieldDiffs: _fields, ...rest } = port
			return rest
		})
	// Deleted rather than emptied: an absent key is what an ordinary board has,
	// and `fieldDiffs: []` would be a lens that renders as nothing but still
	// makes every equality check say the document differs from a clean one.
	const { fieldDiffs: _fieldDiffs, priorPose: _priorPose, ...rest } = props
	return {
		...rest,
		state: 'normal',
		inputs: strip(props.inputs),
		outputs: strip(props.outputs),
	}
}

export function portDefaultValue(port: BlockPort): string {
	return port.defaultValue ?? ''
}

/**
 * The one token for "we looked, and we cannot tell".
 *
 * Deliberately not the empty string. Blank already means *nobody annotated
 * this* — it is how roughly half the ports in the pyblocks golden corpus spell
 * a missing type — and a callee the analyzer failed to resolve is a different
 * fact. It is deliberately not `Any` either: `Any` is a real Python type a
 * program can declare (golden 12's own `Client = Any` does), so writing it for
 * an unresolved slot makes the board claim the callee accepts anything.
 *
 * `?` says only what is actually known: that a port is there.
 */
export const UNKNOWN_TOKEN = '?'

/** True when a name or type slot has been explicitly marked unknown. */
export function isUnknownText(text: string | undefined): boolean {
	return (text ?? '').trim() === UNKNOWN_TOKEN
}

/** A port whose name or type the analyzer could not resolve. */
export function isUnknownPort(port: BlockPort): boolean {
	return isUnknownText(port.name) || isUnknownText(port.type)
}

/**
 * The `blockType` that marks a callee nothing in scope defines.
 *
 * The opacity is a fact about the *call*, so it rides the type line once
 * rather than being repeated on every row, and the Block's default
 * presentation is Simple: a signature that cannot be stated has no business
 * showing a signature table. Switching to Port view still shows the rows,
 * every slot reading `?`.
 */
export const UNRESOLVED_BLOCK_TYPE = 'unresolved'

export function isUnresolvedBlock(props: BlockShapeProps): boolean {
	return props.blockType.trim().toLowerCase() === UNRESOLVED_BLOCK_TYPE
}

/**
 * The `blockType` that marks a projection: one composite value in, one member
 * out per row.
 *
 * A dot is function application — `record.shape` is `getattr(record, 'shape')`,
 * which may be a field, a property or a descriptor — so a member read is a
 * call, and gets the same primitive every other call gets. The rows are facts
 * about the incoming *type*, never about the variable that happened to arrive,
 * so one projection reads the same at every call site.
 */
// Compatibility export: old documents named this primitive `projection`.
// Fresh Blocks persist the clearer data-wire vocabulary, `unbundle`.
export const PROJECTION_BLOCK_TYPE = 'unbundle'
export const LEGACY_PROJECTION_BLOCK_TYPES = new Set(['projection', 'unbundle'])

export function isProjectionBlock(props: BlockShapeProps): boolean {
	return LEGACY_PROJECTION_BLOCK_TYPES.has(props.blockType.trim().toLowerCase())
}

/**
 * Fill a projection's empty title and inlet type from the type that arrived.
 *
 * The rows are facts about that type, not about the variable that happened to
 * carry it, which is what lets one projection read the same at every call site.
 *
 * It only ever fills what is EMPTY. The canvas may carry across a fact the
 * cable already states, but it does not get to correct the drawing: a title or
 * a port name someone typed survives a rewire. Nothing here refuses a
 * connection or marks one wrong — that judgement belongs to the Python side.
 */
export function makeProjectionProps(props: BlockShapeProps, incoming: string): BlockShapeProps {
	const type = incoming.trim()
	if (type === '') return props
	const inlet = props.inputs[0]
	const takesType = inlet !== undefined && inlet.type === ''
	const takesTitle = props.title === ''
	const already = isProjectionBlock(props)
	if (!takesType && !takesTitle && already) return props
	return {
		...props,
		title: takesTitle ? type : props.title,
		blockType: PROJECTION_BLOCK_TYPE,
		inputs: takesType
			? props.inputs.map((port, index) => (index === 0 ? { ...port, type } : port))
			: props.inputs,
	}
}

/**
 * Normalize an accessor row's name.
 *
 * A projection's output name is an attribute path, so it leads with a dot.
 * Chains stay one row — `.pose.translation.x` is a single read of a single
 * member of a member — which is what keeps a nested projection from spawning a
 * Block per link. An index (`[0]`) is the tuple form of the same thing and
 * keeps its own spelling; `?` stays `?`.
 */
export function normalizeAccessorName(name: string): string {
	const text = name.trim()
	if (text === '' || text === UNKNOWN_TOKEN) return text
	if (text.startsWith('.') || text.startsWith('[')) return text
	return `.${text}`
}

/** True for a row that reads a member off the incoming value. */
export function isAccessorName(name: string): boolean {
	const text = name.trim()
	return text.length > 1 && (text.startsWith('.') || text.startsWith('['))
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
 * Keep the effect outputs in step with the inputs that are marked as mutated.
 *
 * The port is derived, not authored: you cannot add or delete one, you mark an
 * argument as written-in-place and the port appears. Marking is what changes;
 * everything else — its position along the top edge, the cables hanging off it
 * — is preserved across the reconcile so a re-render never moves a person's
 * work.
 */
export function reconcileEffectPorts(props: BlockShapeProps): BlockShapeProps {
	const wanted = props.inputs.filter(portMutates)
	const existing = new Map(props.outputs.filter(isEffectPort).map((port) => [port.id, port]))
	const kept = props.outputs.filter((port) => {
		if (!isEffectPort(port)) return true
		const source = mutatedInputId(port)
		return source !== null && wanted.some((input) => input.id === source)
	})
	const added: BlockPort[] = []
	wanted.forEach((input, index) => {
		const id = effectPortId(input.id)
		if (existing.has(id)) return
		added.push({
			id,
			name: input.name,
			type: input.type,
			visible: true,
			effect: true,
			// Spread the slots across the top edge in the arguments' own order, so
			// the topmost mutated argument starts leftmost and two of them are
			// never born on the same point. A *default*, not an invariant: the
			// port is still placed by wherever its cable crosses the boundary, and
			// a reconcile never moves one that has already been put somewhere.
			// One mutated argument still lands dead centre, as before.
			edgeT: clampEdgeT((index + 1) / (wanted.length + 1)),
			// WHY: an effect is the write-back of this input, not a new semantic
			// channel. Keep its role claims with that fact so reconciliation cannot
			// erase an analyser result or an explicit authoring override.
			...(input.semanticRoleDerived ? { semanticRoleDerived: { ...input.semanticRoleDerived } } : {}),
			...(input.semanticRoleAuthored ? { semanticRoleAuthored: { ...input.semanticRoleAuthored } } : {}),
		})
	})
	// An effect port's name tracks the argument it writes back to: they are the
	// same value, and a stale name would be the board telling a small lie.
	const renamed = kept.map((port) => {
		const source = mutatedInputId(port)
		if (!isEffectPort(port) || source === null) return port
		const input = wanted.find((candidate) => candidate.id === source)
		if (!input) return port
		const sameRole = JSON.stringify(port.semanticRoleDerived) === JSON.stringify(input.semanticRoleDerived)
			&& JSON.stringify(port.semanticRoleAuthored) === JSON.stringify(input.semanticRoleAuthored)
		if (port.name === input.name && port.type === input.type && sameRole) return port
		return {
			...port,
			name: input.name,
			type: input.type,
			semanticRoleDerived: input.semanticRoleDerived ? { ...input.semanticRoleDerived } : undefined,
			semanticRoleAuthored: input.semanticRoleAuthored ? { ...input.semanticRoleAuthored } : undefined,
		}
	})
	const outputs = [...renamed, ...added]
	if (outputs.length === props.outputs.length
		&& outputs.every((port, index) => port === props.outputs[index])) {
		return props
	}
	return { ...props, outputs }
}

/** Mark an argument as written in place, or stop. The effect port follows. */
export function setBlockPortMutates(
	props: BlockShapeProps,
	portId: string,
	mutates: boolean,
): BlockShapeProps {
	let changed = false
	const inputs = props.inputs.map((port) => {
		if (port.id !== portId || portMutates(port) === mutates) return port
		changed = true
		if (!mutates) {
			const { mutates: _dropped, ...rest } = port
			return rest
		}
		return { ...port, mutates: true }
	})
	if (!changed) return props
	return reconcileEffectPorts({ ...props, inputs })
}

/** Slide an effect port along the top edge — what a dragged cable does to it. */
export function setEffectPortEdgeT(
	props: BlockShapeProps,
	portId: string,
	t: number,
): BlockShapeProps {
	const next = clampEdgeT(t)
	let changed = false
	const outputs = props.outputs.map((port) => {
		if (port.id !== portId || !isEffectPort(port) || portEdgeT(port) === next) return port
		changed = true
		return { ...port, edgeT: next }
	})
	return changed ? { ...props, outputs } : props
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
