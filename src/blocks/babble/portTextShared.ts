/**
 * Shared groundwork for the Port text-authoring babble (dev-only, 4
 * variants): the SAME flat `name: type = value` idea the Type attribute-body
 * babble proved out, applied to a Block's own `inputs`/`outputs`.
 *
 * Reached only through `shape.meta.portTextBabbleVariant`, which no ordinary
 * board ever sets — see `PortTextBabbleRegion.tsx`. Nothing here changes
 * `BLOCK_SHAPE_PROPS`: the canonical stored state stays exactly
 * `props.inputs` / `props.outputs`; text is a transient editing projection,
 * regenerated fresh from the real ports every time Source mode is entered
 * (mirroring `useSourceToggleEditor`, not a second persisted document).
 *
 * The three grammar modules (`portTextGrammarTwoLane`, `portTextGrammarSigil`,
 * `portTextGrammarKeywords`) each decide their OWN way of signalling which
 * lane (input/output) a line belongs to; everything below is the part that
 * does not vary with that choice — the row/branch divider vocabulary, the
 * attribute line grammar, the default-expression shape, and the id-preserving
 * writer.
 */
import {
	blockPortSections,
	HEADER_ROW,
	isEffectPort,
	normalizeBlockPortRows,
	reconcileEffectPorts,
	withBlockPortSection,
	type BlockPort,
	type BlockPortSide,
	type BlockShapeProps,
} from '../blockModel'

export type PortTextSide = BlockPortSide

/** One line the grammar recognised as a port. */
export interface ParsedPortLine {
	side: PortTextSide
	name: string
	type: string
	value: string
	row: number
	branch: number
	raw: string
	line: number
	/** V3's strict posture only: the default expression is not in the
	 * restricted literal/call subset. Stored verbatim regardless — this only
	 * ever affects how the line is DECORATED, never whether it is kept. */
	invalidDefault?: boolean
	/** A named divider tried to open a branch on the input lane, where the
	 * real model has no such concept — the label was kept as a plain,
	 * unpersisted section heading instead. Never blocks anything; purely
	 * informational, surfaced as a diagnostic in variants that show them. */
	inertBranchLabel?: boolean
}

/** A line the grammar could not parse at all — kept verbatim, never ports. */
export interface InvalidPortLine {
	raw: string
	line: number
	reason: string
}

export interface ParsedPortText {
	lines: ParsedPortLine[]
	invalid: InvalidPortLine[]
}

/** `name: type = value` — the same shape the Type attribute-body babble uses,
 * minus any lane sigil (each grammar strips its own signalling first). */
const PORT_ATTR_LINE = /^([A-Za-z_]\w*)\s*:\s*([^=]*?)(?:\s*=\s*(.*))?$/

export function parsePortAttrLine(trimmed: string): { name: string; type: string; value: string } | null {
	const match = PORT_ATTR_LINE.exec(trimmed)
	if (!match) return null
	return { name: match[1], type: match[2].trim(), value: (match[3] ?? '').trim() }
}

/** `---`, `---header`, or `--- Some label` — the one divider vocabulary every
 * variant shares. Group 1 is the trimmed label, empty for a bare divider. */
export const DIVIDER_LINE = /^---\s*(.*)$/

export interface DividerCounter {
	row: number
	branch: number
}

/**
 * Where the parser starts, before it has seen any divider at all.
 *
 * `BlockPort.row` is absent-means-`FIRST_BODY_ROW` on BOTH lanes (see
 * `portRow` in `blockModel.ts`) — the header band is something a port is
 * deliberately LIFTED into, never the default. So plain content at the top
 * of a lane, with no divider above it, is an ordinary first body row exactly
 * like it would be anywhere else in the document; only an explicit
 * `---header` (inputs only) moves the counter up to `HEADER_ROW`.
 */
export function startDividerCounter(_side: PortTextSide): DividerCounter {
	return { row: HEADER_ROW + 1, branch: 0 }
}

/**
 * Apply one divider's label to a lane's running row/branch counter.
 *
 * Exactly three spellings, each mapped onto a real, already-named concept in
 * `blockModel.ts` rather than a fourth grammar element invented for this
 * babble:
 *  - bare `---`            -> advance to the next ROW (branch resets to 0);
 *  - `---header` (inputs)  -> jump back to `HEADER_ROW` — the model's own
 *                             name for the row inputs alone may occupy;
 *  - `--- anything else`   -> open a new BRANCH within the CURRENT row,
 *                             which is output-only in the real model. On the
 *                             input lane this degrades to a no-op on the
 *                             counter (the row does not move) — the label
 *                             reads as a plain section heading with no
 *                             stored effect, answering Zach's own "is there
 *                             also a plain-label case" question without a
 *                             second syntax for it.
 */
export function applyDivider(
	counter: DividerCounter,
	label: string,
	side: PortTextSide,
): { counter: DividerCounter; inertBranchLabel: boolean } {
	const text = label.trim()
	if (text === '') return { counter: { row: counter.row + 1, branch: 0 }, inertBranchLabel: false }
	if (side === 'inputs' && text.toLowerCase() === 'header') {
		return { counter: { row: HEADER_ROW, branch: 0 }, inertBranchLabel: false }
	}
	if (side === 'outputs') {
		return { counter: { row: counter.row, branch: counter.branch + 1 }, inertBranchLabel: false }
	}
	return { counter, inertBranchLabel: true }
}

/** Python's own literal vocabulary — the restricted half of axis #4. */
const LITERAL_EXPR = /^(?:-?\d+(?:\.\d+)?|True|False|None|'[^']*'|"[^"]*")$/
const CALL_ARG_SRC = String.raw`[A-Za-z_]\w*\s*=\s*(?:-?\d+(?:\.\d+)?|True|False|None|'[^']*'|"[^"]*")`
const CALL_EXPR = new RegExp(`^[A-Za-z_]\\w*\\((?:\\s*${CALL_ARG_SRC}\\s*(?:,\\s*${CALL_ARG_SRC}\\s*)*)?\\)$`)

/**
 * Is `value` a plain literal or a single-level keyword call — the shape of
 * every default in Zach's own sketch (`10`, `0.1`, `Component(var=0.1)`)?
 * Only V3 gates on this; the other variants accept any Python-shaped text
 * verbatim, exactly like the Type attribute-body babble already does for
 * values. Never used to reject or silently drop text — see `invalidDefault`.
 */
export function isRestrictedDefaultExpr(value: string): boolean {
	const text = value.trim()
	if (text === '') return true
	return LITERAL_EXPR.test(text) || CALL_EXPR.test(text)
}

export function formatPortLine(port: Pick<BlockPort, 'name' | 'type' | 'defaultValue'>): string {
	const type = port.type ? `: ${port.type}` : ':'
	const value = port.defaultValue ? ` = ${port.defaultValue}` : ''
	return `${port.name}${type}${value}`
}

/** Every output the text grammar is willing to show — effect ports are
 * derived from an input's `mutates` flag (see `reconcileEffectPorts`), never
 * authored directly, so the text mode never lists or accepts them. They are
 * regenerated untouched by `writePortTextResult` below. */
export function authorable(props: Pick<BlockShapeProps, 'inputs' | 'outputs'>) {
	return { inputs: props.inputs, outputs: props.outputs.filter((port) => !isEffectPort(port)) }
}

/**
 * Turn one lane's parsed lines back into `BlockPort[]`, preserving every
 * field the text grammar cannot express (`mutates`, `effect`, `edgeT`,
 * `state`, `semanticRole*`, `link`, `variadic`, `visible`) by matching each
 * line to an existing port. Two passes, so a plain retype survives:
 *
 *  1. exact NAME match — the common "I only changed the type or default"
 *     edit keeps its id even if it moved to a different row or another line
 *     took its old position;
 *  2. same ORDINAL position among ports pass 1 left unclaimed — the common
 *     "I retyped this port's NAME" edit, so a rename does not silently sever
 *     whatever cable was attached to that port's id.
 *
 * A line matching neither gets a fresh id in the existing `in_N`/`out_N`
 * numbering scheme (see `appendBlockPortToProps`). A port matching no line at
 * all — its line was deleted — is dropped, cable and all: that is the one
 * genuinely destructive edit this surface can make, same as it would be for
 * any text-driven rename/delete of a named record, and it is called out
 * plainly in this babble's report rather than hidden.
 */
export function reconcilePortLane(
	existing: readonly BlockPort[],
	parsedLines: readonly ParsedPortLine[],
	side: PortTextSide,
): BlockPort[] {
	const prefix = side === 'inputs' ? 'in' : 'out'
	const idPattern = new RegExp(`^${prefix}_(\\d+)$`)
	let nextOrdinal = 1 + existing.reduce((best, port) => {
		const match = idPattern.exec(port.id)
		return match ? Math.max(best, Number(match[1])) : best
	}, 0)

	const claimed = new Set<number>()
	const byName = new Map<string, number>()
	existing.forEach((port, index) => { if (!byName.has(port.name)) byName.set(port.name, index) })

	// Pass 1: exact name.
	const matchIndex: (number | null)[] = parsedLines.map((line) => {
		const index = byName.get(line.name)
		if (index === undefined || claimed.has(index)) return null
		claimed.add(index)
		return index
	})

	// Pass 2: same ordinal position among whatever pass 1 left unclaimed.
	const unclaimedOrder = existing.map((_, index) => index).filter((index) => !claimed.has(index))
	let cursor = 0
	matchIndex.forEach((index, lineIndex) => {
		if (index !== null) return
		if (cursor >= unclaimedOrder.length) return
		const candidate = unclaimedOrder[cursor]
		cursor += 1
		matchIndex[lineIndex] = candidate
		claimed.add(candidate)
	})

	return parsedLines.map((line, lineIndex) => {
		const index = matchIndex[lineIndex]
		const reused = index === null ? undefined : existing[index]
		const id = reused?.id ?? `${prefix}_${nextOrdinal++}`
		const merged: BlockPort = { ...(reused ?? { id, name: line.name, type: '', visible: true }), id, name: line.name, type: line.type }
		if (line.value) merged.defaultValue = line.value
		else delete merged.defaultValue
		return withBlockPortSection(merged, { row: line.row, branch: line.branch })
	})
}

/** Apply one grammar's parsed lines to real props: reconcile each lane,
 * normalize row/branch numbering through the shipped model function, and
 * regenerate any effect outputs the mutated inputs still call for. */
export function applyParsedPortText(props: BlockShapeProps, parsed: ParsedPortText): BlockShapeProps {
	const { inputs: existingInputs, outputs: existingOutputs } = authorable(props)
	const effectOutputs = props.outputs.filter((port) => isEffectPort(port))
	const inputLines = parsed.lines.filter((line) => line.side === 'inputs')
	const outputLines = parsed.lines.filter((line) => line.side === 'outputs')
	const inputs = reconcilePortLane(existingInputs, inputLines, 'inputs')
	const outputs = [...reconcilePortLane(existingOutputs, outputLines, 'outputs'), ...effectOutputs]
	return reconcileEffectPorts(normalizeBlockPortRows({ ...props, inputs, outputs }))
}

/** The grouped structure every writer serializes from — the real model's own
 * grouping function, run over the ports the text grammar is willing to show. */
export function authorableSections(props: Pick<BlockShapeProps, 'inputs' | 'outputs'>) {
	return blockPortSections(authorable(props))
}

/**
 * Walk a Block's INPUT lane in writer order, calling back with exactly the
 * divider events needed to land the parser on each row — including however
 * many bare dividers it takes to cross an empty row nobody has inputs in,
 * since `blockPortSections` returns every row in the range densely. Shared by
 * the two-lane and keyword-section grammars, whose input stream is
 * independent of their output stream.
 */
export function walkInputRows(
	props: Pick<BlockShapeProps, 'inputs' | 'outputs'>,
	on: { header(): void; row(): void; port(port: BlockPort): void },
): void {
	const sections = authorableSections(props)
	let emitted = HEADER_ROW + 1
	if (sections.header.length > 0) {
		on.header()
		sections.header.forEach((port) => on.port(port))
		emitted = HEADER_ROW
	}
	sections.rows.forEach((rowSection) => {
		if (rowSection.inputs.length === 0) return
		while (emitted < rowSection.row) { on.row(); emitted += 1 }
		rowSection.inputs.forEach((port) => on.port(port))
	})
}

/** Same idea for the OUTPUT lane — no header concept, but the same
 * dense-row skipping, plus a nested dense-branch skip within each row. */
export function walkOutputRows(
	props: Pick<BlockShapeProps, 'inputs' | 'outputs'>,
	on: { row(): void; branch(targetBranch: number): void; port(port: BlockPort): void },
): void {
	const sections = authorableSections(props)
	let emittedRow = HEADER_ROW + 1
	sections.rows.forEach((rowSection) => {
		const nonEmpty = rowSection.branches.filter((arm) => arm.outputs.length > 0)
		if (nonEmpty.length === 0) return
		while (emittedRow < rowSection.row) { on.row(); emittedRow += 1 }
		let emittedBranch = 0
		nonEmpty.forEach((arm) => {
			while (emittedBranch < arm.branch) { on.branch(emittedBranch + 1); emittedBranch += 1 }
			arm.outputs.forEach((port) => on.port(port))
		})
	})
}
