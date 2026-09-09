/**
 * A lane is one document, one line per port.
 *
 * The Port view has two lanes — inputs on the left, outputs on the right —
 * and each is edited as a multi-line code text box whose lines ARE the
 * lane's body ports, in order. That makes reordering a port the same key as
 * moving a line (Alt+↑/↓), duplicating one the same as copying a line, and
 * adding one the same as pressing Enter — the IDE muscle memory Zach asked
 * for on 2026-09-09 ("reordering ports is just like ordering the lines").
 *
 * Storage does not change. `formatPortLane` spells the lane's ports out;
 * `reconcilePortLane` reads the edited text back into the SAME port records
 * — a line that still says what a port said keeps that port's id, a line
 * that changed in place keeps its id, a line that moved keeps its id, a new
 * line is a new port and a missing line is a removed port. Ids are what the
 * cables are bound to, so keeping them across a move is the whole point.
 *
 * Header ports (row 0) and hidden ports are not lines; they keep their place
 * around the lane untouched. Row and branch of a moved port travel with it.
 */
import {
	FIRST_BODY_ROW,
	isEffectPort,
	normalizeBlockPortRows,
	portInHeader,
	portSection,
	reconcileEffectPorts,
	withBlockPortSection,
	type BlockPort,
	type BlockPortSide,
	type BlockShapeProps,
} from './blockModel'
import { canonicalizeInputPortLinks } from './commands/blockCommands'
import { formatPortSignature, parsePortSignature } from './portSignature'

/**
 * The ports a lane's lines stand for: visible, authored body ports of one
 * side, in lane order. Header ports live in the header band and effect
 * ports are derived from a mutated input (painted on the top edge, no
 * label) — neither is a line, and both are kept around the lane untouched.
 */
export function lanePorts(props: BlockShapeProps, side: BlockPortSide): BlockPort[] {
	return props[side].filter((port) => port.visible && !portInHeader(port) && !isEffectPort(port))
}

/** Whether a port is one of the lane's lines at all (a header or effect port is not). */
export function portInLane(props: BlockShapeProps, side: BlockPortSide, portId: string): boolean {
	return lanePorts(props, side).some((port) => port.id === portId)
}

export function formatPortLane(ports: readonly BlockPort[]): string {
	return ports.map((port) => formatPortSignature(port)).join('\n')
}

/** The line a port sits on in its lane, for placing the caret where the click landed. */
export function laneLineOfPort(props: BlockShapeProps, side: BlockPortSide, portId: string): number {
	const index = lanePorts(props, side).findIndex((port) => port.id === portId)
	return Math.max(0, index)
}

/** Longest common subsequence of two line lists, as index pairs in order. */
function commonLines(before: readonly string[], after: readonly string[]): Array<[number, number]> {
	const table: number[][] = Array.from({ length: before.length + 1 }, () => new Array<number>(after.length + 1).fill(0))
	for (let i = before.length - 1; i >= 0; i -= 1) {
		for (let j = after.length - 1; j >= 0; j -= 1) {
			table[i]![j] = before[i] === after[j]
				? table[i + 1]![j + 1]! + 1
				: Math.max(table[i + 1]![j]!, table[i]![j + 1]!)
		}
	}
	const pairs: Array<[number, number]> = []
	let i = 0
	let j = 0
	while (i < before.length && j < after.length) {
		if (before[i] === after[j]) {
			pairs.push([i, j])
			i += 1
			j += 1
		} else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
			i += 1
		} else {
			j += 1
		}
	}
	return pairs
}

function nextLaneId(taken: ReadonlySet<string>, side: BlockPortSide): string {
	const prefix = side === 'inputs' ? 'in' : 'out'
	let highest = 0
	for (const id of taken) {
		const match = new RegExp(`^${prefix}_(\\d+)$`).exec(id)
		if (match) highest = Math.max(highest, Number(match[1]))
	}
	return `${prefix}_${highest + 1}`
}

/**
 * Read an edited lane back into the Block's ports. Pure: returns the same
 * props object when the text still spells exactly the current lane.
 */
export function reconcilePortLane(props: BlockShapeProps, side: BlockPortSide, text: string): BlockShapeProps {
	const before = lanePorts(props, side)
	const beforeLines = before.map((port) => formatPortSignature(port))
	// An empty document is an empty lane: select-all + Delete removes every
	// port. A trailing newline is still a blank port, because Enter adds one.
	const afterLines = text === '' ? [] : text.split('\n')
	if (beforeLines.length === afterLines.length && beforeLines.every((line, index) => line === afterLines[index])) {
		return props
	}

	// 1. Lines that still say what a port said keep that port (this is what
	//    survives a move, a duplicate's original, and every untouched line).
	const keep = new Map<number, number>() // after index -> before index
	const usedBefore = new Set<number>()
	for (const [i, j] of commonLines(beforeLines, afterLines)) {
		keep.set(j, i)
		usedBefore.add(i)
	}
	// 2. A line that changed keeps the port that used to sit there: unmatched
	//    old lines pair with unmatched new lines in order, so an edit in place
	//    — the common case — never re-creates the port under the caret.
	const spareBefore = beforeLines.map((_, i) => i).filter((i) => !usedBefore.has(i))
	const spareAfter = afterLines.map((_, j) => j).filter((j) => !keep.has(j))
	for (let k = 0; k < Math.min(spareBefore.length, spareAfter.length); k += 1) {
		keep.set(spareAfter[k]!, spareBefore[k]!)
	}

	// 3. Build the lane in the new order; anything still unmatched is new.
	const taken = new Set(props[side].map((port) => port.id))
	const lane: BlockPort[] = []
	for (let j = 0; j < afterLines.length; j += 1) {
		const line = afterLines[j]!
		const parsed = parsePortSignature(line)
		const fromBefore = keep.get(j)
		if (fromBefore !== undefined) {
			const port = before[fromBefore]!
			// A line that still reads exactly as the port was spelled is NOT
			// re-parsed: a legacy name holding a depth-0 `:` or `=` must survive
			// a keystroke on some other line untouched. Only an edited line
			// goes back through the grammar.
			if (line === beforeLines[fromBefore]) {
				lane.push(port)
				continue
			}
			const next = { ...port, name: parsed.name, type: parsed.type }
			if (parsed.defaultValue) next.defaultValue = parsed.defaultValue
			else delete next.defaultValue
			lane.push(next)
			continue
		}
		const id = nextLaneId(taken, side)
		taken.add(id)
		const neighbour = lane[lane.length - 1] ?? before[0]
		const section = neighbour ? portSection(neighbour) : { row: FIRST_BODY_ROW, branch: 0 }
		const fresh: BlockPort = withBlockPortSection({ id, name: parsed.name, type: parsed.type, visible: true }, section)
		if (parsed.defaultValue) fresh.defaultValue = parsed.defaultValue
		lane.push(fresh)
	}

	// 4. Header ports first, then the lane, then whatever is not a line —
	//    hidden ports and derived effect ports — so every port that is not a
	//    line keeps the place it had and `reconcileEffectPorts` finds its own.
	const wasLine = new Set(before.map((port) => port.id))
	const header = props[side].filter((port) => portInHeader(port) && port.visible && !isEffectPort(port))
	const others = props[side].filter((port) => !wasLine.has(port.id) && !header.includes(port))
	const ports = [...header, ...lane, ...others]
	const withLinks = side === 'inputs' ? canonicalizeInputPortLinks(ports) : ports
	return reconcileEffectPorts(normalizeBlockPortRows({ ...props, [side]: withLinks }))
}
