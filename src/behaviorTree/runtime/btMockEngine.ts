/**
 * The mock execution engine: a BT.CPP-semantics interpreter over the region's
 * own parsed document, standing in for a real runner.
 *
 * Contract (decided 2026-09-05, from the runtime-viz lab): the CANONICAL
 * output is the transition log — `{seq, tick, at, treeId, path, from, to}` —
 * from which any tick's exact state folds back out. The engine can also emit
 * a per-tick end-state snapshot, used ONLY as the independent ground truth
 * the fold is verified against in tests; nothing in the app renders from it.
 *
 * WHY: the log is canonical rather than a per-node status map because a tick
 * is not atomic (a Reactive halt orders two transitions inside one) and a run
 * has to be readable backwards — collapsing it to current status silently
 * deletes scrub, step-back and the transitions table, and whichever backend
 * transport wins still has to produce exactly this shape — see
 * docs/peps/0011-runtime-state-is-a-transition-log.md
 *
 * Sampling (Zach's "reasonable mock"): each leaf attempt draws its duration
 * uniformly in [0.7·d, 1.3·d] and its outcome Bernoulli(successChance) from a
 * seeded RNG — an 80% node succeeds in roughly 80% of runs, never always.
 *
 * Fidelity notes, deliberate:
 *  - `Sequence`/`Fallback` latch their running child (BT.CPP resets the index
 *    when the whole composite resolves); `Reactive…` re-tick from child 0
 *    every tick and halt a later RUNNING child when an earlier child yields a
 *    different verdict; `…WithMemory` keeps its index across its own FAILURE.
 *  - Scripts and Blackboard values are not evaluated: `Script` /
 *    `ScriptCondition` are leaves and mock like any skill; `Precondition`
 *    ticks its child directly. That is a simulation simplification, stated
 *    here rather than hidden.
 *  - Nodes the mock cannot honestly simulate (`Switch*`, `ManualSelector`,
 *    unknown controls) refuse the run loudly via `unsupportedReasons` instead
 *    of inventing semantics.
 */
import type { BtDocument, BtNode } from '../btcppXml'
import { readMockParamsById, resolveMockParams, type BtMockParams } from './mockParams'

export type BtRunStatus = 'running' | 'success' | 'failure' | 'halted'
export type BtLeafOutcome = 'success' | 'failure'

export interface BtRunTransition {
	seq: number
	tick: number
	/** Simulated wall-clock ms since the run started (tick × tickMs). */
	at: number
	/** Which tree of the document the node lives in (subtrees run for real). */
	treeId: string
	path: string
	from: BtRunStatus | 'fresh'
	to: BtRunStatus
}

export interface BtTickResult {
	tick: number
	events: BtRunTransition[]
	outcome: BtLeafOutcome | null
	/** End-of-tick truth for tests; `null` unless `debugSnapshots` was asked for. */
	snapshot: Map<string, BtRunStatus> | null
}

export interface BtMockEngineOptions {
	seed: number
	/** One engine tick simulates this many milliseconds. */
	tickMs?: number
	treeId?: string
	debugSnapshots?: boolean
}

export const BT_MOCK_TICK_MS = 100
const MAX_SUBTREE_DEPTH = 16

/** Deterministic RNG (mulberry32) — same generator the lab proved out. */
export function mulberry32(seed: number): () => number {
	let a = seed >>> 0
	return function () {
		a |= 0; a = (a + 0x6D2B79F5) | 0
		let t = Math.imul(a ^ (a >>> 15), 1 | a)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

export function runtimeKey(treeId: string, path: string): string {
	return `${treeId}:${path}`
}

/* ----------------------------- the runtime tree ---------------------------- */

interface RuntimeNode {
	key: string
	treeId: string
	path: string
	source: BtNode
	kind: NodeBehavior
	children: RuntimeNode[]
	mock: BtMockParams
	/** Numeric ports read once at build (num_attempts, msec, thresholds…). */
	numbers: Record<string, number>
	/**
	 * WHY: two nodes keep state across their own resolution AND across halts,
	 * by BT.CPP's own contract — RunOnce (`already_ticked_` is the feature) and
	 * SequenceWithMemory (successful children stay skipped after a failure).
	 * Everything else resets on completion and on halt.
	 */
	persistentScratch: boolean
}

type NodeBehavior =
	| 'sequence' | 'sequence-reactive' | 'sequence-memory'
	| 'fallback' | 'fallback-reactive'
	| 'parallel' | 'parallel-all'
	| 'if-then-else' | 'while-do-else'
	| 'inverter' | 'force-success' | 'force-failure'
	| 'repeat' | 'retry' | 'keep-running' | 'delay' | 'run-once' | 'timeout' | 'pass-through'
	| 'always-success' | 'always-failure' | 'test-node' | 'sleep'
	| 'mock-leaf'
	| 'subtree'

function portNumber(node: BtNode, name: string, fallback: number): number {
	const raw = node.ports.find((binding) => binding.name === name)?.value
	const parsed = raw === undefined ? NaN : Number(raw)
	return Number.isFinite(parsed) ? parsed : fallback
}

function behaviorOf(node: BtNode): NodeBehavior | null {
	if (node.kind === 'subtree') return 'subtree'
	if (node.kind === 'control' || (node.kind === 'unknown' && node.children.length > 0)) {
		switch (node.id) {
			case 'Sequence': return 'sequence'
			case 'ReactiveSequence': return 'sequence-reactive'
			case 'SequenceWithMemory': case 'SequenceStar': return 'sequence-memory'
			case 'Fallback': return 'fallback'
			case 'ReactiveFallback': return 'fallback-reactive'
			case 'Parallel': return 'parallel'
			case 'ParallelAll': return 'parallel-all'
			case 'IfThenElse': return 'if-then-else'
			case 'WhileDoElse': return 'while-do-else'
			default: return null
		}
	}
	if (node.kind === 'decorator') {
		switch (node.id) {
			case 'Inverter': return 'inverter'
			case 'ForceSuccess': return 'force-success'
			case 'ForceFailure': return 'force-failure'
			case 'Repeat': return 'repeat'
			case 'RetryUntilSuccessful': return 'retry'
			case 'KeepRunningUntilFailure': return 'keep-running'
			case 'Delay': return 'delay'
			case 'RunOnce': return 'run-once'
			case 'Timeout': return 'timeout'
			case 'Precondition': return 'pass-through'
			default: return null
		}
	}
	// Leaves. Builtins with trivial honest semantics keep them; everything
	// else — the document's own skills and conditions included — mocks.
	switch (node.id) {
		case 'AlwaysSuccess': return 'always-success'
		case 'AlwaysFailure': return 'always-failure'
		case 'TestNode': return 'test-node'
		case 'Sleep': return 'sleep'
		default: return 'mock-leaf'
	}
}

export interface BtMockEngine {
	step(): BtTickResult
	readonly unsupportedReasons: string[]
	readonly tickMs: number
	readonly treeId: string
}

export function createMockEngine(document: BtDocument, options: BtMockEngineOptions): BtMockEngine {
	const tickMs = options.tickMs ?? BT_MOCK_TICK_MS
	const declaredMock = readMockParamsById(document)
	const unsupported: string[] = []

	const build = (node: BtNode, treeId: string, depth: number): RuntimeNode | null => {
		const kind = behaviorOf(node)
		if (kind === null) {
			unsupported.push(`${node.label} (${node.id}) isn't supported by the mock runner yet`)
			return null
		}
		if (kind === 'subtree') {
			if (depth >= MAX_SUBTREE_DEPTH) {
				unsupported.push(`SubTree ${node.subtreeId ?? ''} nests deeper than ${MAX_SUBTREE_DEPTH} levels (a cycle?)`)
				return null
			}
			const target = document.trees.find((tree) => tree.id === node.subtreeId)
			if (!target?.root) {
				unsupported.push(`SubTree ${node.subtreeId ?? '?'} has no tree to tick`)
				return null
			}
			const inner = build(target.root, target.id, depth + 1)
			if (!inner) return null
			return {
				key: runtimeKey(treeId, node.path), treeId, path: node.path, source: node,
				kind, children: [inner], mock: resolveMockParams(declaredMock, node), numbers: {},
				persistentScratch: false,
			}
		}
		const children: RuntimeNode[] = []
		for (const child of node.children) {
			const built = build(child, treeId, depth)
			if (built) children.push(built)
			else return null
		}
		return {
			key: runtimeKey(treeId, node.path), treeId, path: node.path, source: node, kind, children,
			mock: resolveMockParams(declaredMock, node),
			persistentScratch: kind === 'run-once' || kind === 'sequence-memory',
			numbers: {
				successCount: portNumber(node, 'success_count', -1),
				failureCount: portNumber(node, 'failure_count', 1),
				maxFailures: portNumber(node, 'max_failures', 1),
				numCycles: portNumber(node, 'num_cycles', 1),
				numAttempts: portNumber(node, 'num_attempts', 1),
				delayMs: portNumber(node, 'delay_msec', 0),
				timeoutMs: portNumber(node, 'msec', 0),
				sleepMs: portNumber(node, 'msec', 0),
			},
		}
	}

	const mainTreeId = options.treeId || document.mainTreeId
	const mainTree = document.trees.find((tree) => tree.id === mainTreeId) ?? null
	let root: RuntimeNode | null = null
	if (!mainTree?.root) unsupported.push('The tree is empty — nothing to run')
	else root = build(mainTree.root, mainTree.id, 0)

	const rng = mulberry32(options.seed)
	const statuses = new Map<string, BtRunStatus>()
	/** Per-node scratch: composite cursors, leaf plans, decorator counters. */
	const memory = new Map<string, Record<string, unknown>>()
	let tick = 0
	let seq = 0
	let events: BtRunTransition[] = []

	const scratch = (node: RuntimeNode): Record<string, unknown> => {
		let held = memory.get(node.key)
		if (!held) {
			held = {}
			memory.set(node.key, held)
		}
		return held
	}

	const mark = (node: RuntimeNode, to: BtRunStatus) => {
		const from = statuses.get(node.key) ?? 'fresh'
		if (from === to) return
		statuses.set(node.key, to)
		events.push({ seq: seq++, tick, at: tick * tickMs, treeId: node.treeId, path: node.path, from, to })
	}

	const halt = (node: RuntimeNode) => {
		if (statuses.get(node.key) === 'running') mark(node, 'halted')
		if (!node.persistentScratch) memory.delete(node.key)
		node.children.forEach(halt)
	}

	/** One BT.CPP tick of a node; returns its status at the end of this tick. */
	const tickNode = (node: RuntimeNode): BtRunStatus => {
		mark(node, 'running')
		const result = tickInner(node)
		if (result !== 'running') {
			mark(node, result)
			if (!node.persistentScratch) memory.delete(node.key)
		}
		return result
	}

	const tickChildrenSequential = (
		node: RuntimeNode,
		advanceOn: BtLeafOutcome,
		stopOn: BtLeafOutcome,
		reactive: boolean,
		keepCursorOnStop: boolean,
	): BtRunStatus => {
		const state = scratch(node) as { cursor?: number }
		if (reactive) state.cursor = 0
		state.cursor ??= 0
		while (state.cursor < node.children.length) {
			const child = node.children[state.cursor]
			const result = tickNode(child)
			if (result === 'running') {
				// A reactive composite that re-decided at an earlier child halts
				// the later child that was still RUNNING from the previous tick.
				if (reactive) {
					node.children.slice(state.cursor + 1).forEach(halt)
				}
				return 'running'
			}
			if (result === stopOn) {
				node.children.slice(state.cursor + 1).forEach(halt)
				if (!keepCursorOnStop) state.cursor = 0
				return stopOn
			}
			state.cursor += 1
		}
		state.cursor = 0
		return advanceOn
	}

	const tickInner = (node: RuntimeNode): BtRunStatus => {
		switch (node.kind) {
			case 'sequence':
				return tickChildrenSequential(node, 'success', 'failure', false, false)
			case 'sequence-reactive':
				return tickChildrenSequential(node, 'success', 'failure', true, false)
			case 'sequence-memory':
				// WHY: BT.CPP's SequenceWithMemory does NOT restart from child 0
				// after its own FAILURE — the cursor survives so a later tick
				// resumes at the child that failed.
				return tickChildrenSequential(node, 'success', 'failure', false, true)
			case 'fallback':
				return tickChildrenSequential(node, 'failure', 'success', false, false)
			case 'fallback-reactive':
				return tickChildrenSequential(node, 'failure', 'success', true, false)
			case 'parallel': case 'parallel-all': {
				const state = scratch(node) as { done?: Map<string, BtLeafOutcome> }
				state.done ??= new Map()
				let successes = 0
				let failures = 0
				for (const child of node.children) {
					let result: BtRunStatus | undefined = state.done.get(child.key)
					if (!result) {
						result = tickNode(child)
						if (result !== 'running') state.done.set(child.key, result as BtLeafOutcome)
					}
					if (result === 'success') successes += 1
					if (result === 'failure') failures += 1
				}
				const total = node.children.length
				if (node.kind === 'parallel-all') {
					if (successes + failures === total) {
						return failures > node.numbers.maxFailures ? 'failure' : 'success'
					}
					return 'running'
				}
				const need = node.numbers.successCount === -1 ? total : node.numbers.successCount
				if (failures >= node.numbers.failureCount) {
					node.children.filter((child) => !state.done!.has(child.key)).forEach(halt)
					return 'failure'
				}
				if (successes >= need) {
					node.children.filter((child) => !state.done!.has(child.key)).forEach(halt)
					return 'success'
				}
				return 'running'
			}
			case 'if-then-else': case 'while-do-else': {
				// condition, then-branch, optional else-branch. The reactive
				// variant (WhileDoElse) re-checks the condition every tick.
				const [condition, thenBranch, elseBranch] = node.children
				if (!condition || !thenBranch) return 'failure'
				const state = scratch(node) as { picked?: 'then' | 'else' }
				if (node.kind === 'while-do-else' || state.picked === undefined) {
					const verdict = tickNode(condition)
					if (verdict === 'running') return 'running'
					const picked = verdict === 'success' ? 'then' : 'else'
					if (node.kind === 'while-do-else' && state.picked && state.picked !== picked) {
						const dropped = state.picked === 'then' ? thenBranch : elseBranch
						if (dropped) halt(dropped)
					}
					state.picked = picked
				}
				const branch = state.picked === 'then' ? thenBranch : elseBranch
				if (!branch) return state.picked === 'then' ? 'failure' : 'failure'
				return tickNode(branch)
			}
			case 'inverter': {
				const result = tickNode(node.children[0])
				return result === 'success' ? 'failure' : result === 'failure' ? 'success' : result
			}
			case 'force-success': {
				const result = tickNode(node.children[0])
				return result === 'running' ? 'running' : 'success'
			}
			case 'force-failure': {
				const result = tickNode(node.children[0])
				return result === 'running' ? 'running' : 'failure'
			}
			case 'repeat': {
				const state = scratch(node) as { cycles?: number }
				state.cycles ??= 0
				const result = tickNode(node.children[0])
				if (result === 'running') return 'running'
				if (result === 'failure') return 'failure'
				state.cycles += 1
				return state.cycles >= Math.max(1, node.numbers.numCycles) ? 'success' : 'running'
			}
			case 'retry': {
				const state = scratch(node) as { attempts?: number }
				state.attempts ??= 0
				const result = tickNode(node.children[0])
				if (result === 'running') return 'running'
				if (result === 'success') return 'success'
				state.attempts += 1
				return state.attempts >= Math.max(1, node.numbers.numAttempts) ? 'failure' : 'running'
			}
			case 'keep-running': {
				const result = tickNode(node.children[0])
				return result === 'failure' ? 'failure' : 'running'
			}
			case 'delay': {
				const state = scratch(node) as { waited?: number }
				state.waited ??= 0
				if (state.waited * tickMs < node.numbers.delayMs) {
					state.waited += 1
					return 'running'
				}
				return tickNode(node.children[0])
			}
			case 'run-once': {
				// `persistentScratch` keeps this across resolution and halts —
				// remembering IS the node's contract (`then_skip`).
				const state = scratch(node) as { remembered?: BtLeafOutcome }
				if (state.remembered) return state.remembered
				const result = tickNode(node.children[0])
				if (result === 'success' || result === 'failure') state.remembered = result
				return result
			}
			case 'timeout': {
				const state = scratch(node) as { waited?: number }
				state.waited ??= 0
				state.waited += 1
				if (node.numbers.timeoutMs > 0 && state.waited * tickMs > node.numbers.timeoutMs) {
					halt(node.children[0])
					return 'failure'
				}
				return tickNode(node.children[0])
			}
			case 'pass-through': case 'subtree':
				return tickNode(node.children[0])
			case 'always-success': return 'success'
			case 'always-failure': return 'failure'
			case 'test-node': {
				const wanted = node.source.ports.find((binding) => binding.name === 'return_status')?.value ?? 'SUCCESS'
				return wanted === 'FAILURE' ? 'failure' : 'success'
			}
			case 'sleep': {
				const state = scratch(node) as { slept?: number }
				state.slept ??= 0
				state.slept += 1
				return state.slept * tickMs >= node.numbers.sleepMs ? 'success' : 'running'
			}
			case 'mock-leaf': {
				const state = scratch(node) as { elapsed?: number; durationTicks?: number; outcome?: BtLeafOutcome }
				if (state.durationTicks === undefined) {
					// One attempt = one sampled plan: duration jitters ±30% around
					// the authored expectation, the verdict is a weighted coin.
					const jitter = 0.7 + rng() * 0.6
					state.durationTicks = Math.max(1, Math.round((node.mock.durationMs * jitter) / tickMs))
					state.outcome = rng() < node.mock.successChance ? 'success' : 'failure'
					state.elapsed = 0
				}
				state.elapsed = (state.elapsed ?? 0) + 1
				if (state.elapsed < state.durationTicks) return 'running'
				return state.outcome!
			}
		}
	}

	return {
		get unsupportedReasons() { return [...unsupported] },
		tickMs,
		treeId: mainTreeId,
		step(): BtTickResult {
			if (!root || unsupported.length > 0) {
				return { tick, events: [], outcome: null, snapshot: null }
			}
			tick += 1
			events = []
			const result = tickNode(root)
			const outcome = result === 'success' || result === 'failure' ? result : null
			return {
				tick,
				events,
				outcome,
				snapshot: options.debugSnapshots ? new Map(statuses) : null,
			}
		},
	}
}

/* ------------------------- fold: log → any tick's state ------------------------ */

export interface BtFoldedState {
	tick: number
	statuses: Map<string, { status: BtRunStatus; sinceTick: number }>
	outcome: BtLeafOutcome | null
	rootKey: string | null
}

/** Fold transitions[0..index] into the exact state at that moment. */
export function reconstructAt(log: readonly BtRunTransition[], index: number, rootKey: string | null): BtFoldedState {
	const statuses = new Map<string, { status: BtRunStatus; sinceTick: number }>()
	let tick = 0
	let outcome: BtLeafOutcome | null = null
	for (let i = 0; i <= index && i < log.length; i += 1) {
		const entry = log[i]
		tick = entry.tick
		statuses.set(runtimeKey(entry.treeId, entry.path), { status: entry.to, sinceTick: entry.tick })
		if (rootKey && runtimeKey(entry.treeId, entry.path) === rootKey) {
			outcome = entry.to === 'success' || entry.to === 'failure' ? entry.to : null
		}
	}
	return { tick, statuses, outcome, rootKey }
}

export function lastIndexAtOrBeforeTick(log: readonly BtRunTransition[], tick: number): number {
	let found = -1
	for (let i = 0; i < log.length; i += 1) {
		if (log[i].tick <= tick) found = i
		else break
	}
	return found
}
