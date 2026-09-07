/**
 * The mock-run store: one ephemeral run per Behavior Tree region.
 *
 * WHY a module store and never the tldraw store (the recorder-store pattern):
 * the tldraw store IS the document — anything written there autosaves into the
 * board and replays through undo. A run is derived, high-frequency, ephemeral
 * state; it lives beside the editor, is read through `useSyncExternalStore`,
 * and dies with the page. The one purposeful bridge back is AUTHORED data:
 * mock parameters and presets, which are XML commands like any other edit.
 *
 * The canonical history is the transition log (`btMockEngine.ts`); every
 * scrub position — by tick or by single transition — is a fold of it. The
 * run also remembers the XML string it was started from: if the region's XML
 * changes mid-run the run is stopped and marked stale rather than repainted
 * over a tree it no longer describes.
 *
 * WHY the cursor is an index into that log and not a status map: it makes
 * "step one transition" and "scrub to tick N" the same operation, so the
 * canvas and the inspector's table cannot disagree — see
 * docs/peps/0011-runtime-state-is-a-transition-log.md
 */
import { useSyncExternalStore } from 'react'
import type { Editor, TLShapeId } from 'tldraw'

import { parseBehaviorTreeXml } from '../btcppXml'
import { isBehaviorTreeShape, type BehaviorTreeShape } from '../behaviorTreeModel'
import {
	createMockEngine,
	lastIndexAtOrBeforeTick,
	reconstructAt,
	runtimeKey,
	BT_MOCK_TICK_MS,
	type BtFoldedState,
	type BtLeafOutcome,
	type BtMockEngine,
	type BtRunStatus,
	type BtRunTransition,
} from './btMockEngine'

export type BtRunPhase = 'running' | 'paused' | 'finished' | 'stale' | 'refused'

export interface BtRunState {
	regionId: TLShapeId
	runId: number
	phase: BtRunPhase
	seed: number
	speed: number
	tickMs: number
	treeId: string
	rootKey: string | null
	/** The XML this run was compiled from — drift means the paint would lie. */
	xml: string
	log: BtRunTransition[]
	latestTick: number
	outcome: BtLeafOutcome | null
	cursor: { index: number; tick: number }
	live: boolean
	refusedReasons: string[]
	/** Per-tick end-state ground truth, kept only when a test asks for it. */
	debugSnapshots: Array<Map<string, BtRunStatus>> | null
}

interface RunInternals {
	engine: BtMockEngine
	timer: number | null
}

const runs = new Map<TLShapeId, BtRunState>()
const internals = new Map<TLShapeId, RunInternals>()
const listeners = new Set<() => void>()
let version = 0
let nextRunId = 1

function notify() {
	version += 1
	for (const listener of [...listeners]) listener()
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener)
	return () => listeners.delete(listener)
}

function getVersion(): number {
	return version
}

/** Reactive read: re-renders on any run-store change. */
export function useBtRunVersion(): number {
	return useSyncExternalStore(subscribe, getVersion, getVersion)
}

export function getBtRun(regionId: TLShapeId): BtRunState | null {
	return runs.get(regionId) ?? null
}

export function getActiveBtRuns(): BtRunState[] {
	return [...runs.values()]
}

/* --------------------------------- control --------------------------------- */

export interface StartBtRunOptions {
	seed?: number
	speed?: number
	debugSnapshots?: boolean
}

const MAX_RUN_TICKS = 2000

function clearTimer(regionId: TLShapeId) {
	const held = internals.get(regionId)
	if (held?.timer !== null && held?.timer !== undefined) {
		window.clearInterval(held.timer)
		held.timer = null
	}
}

function stepInto(state: BtRunState, engine: BtMockEngine): void {
	const result = engine.step()
	state.log.push(...result.events)
	state.latestTick = result.tick
	if (state.debugSnapshots && result.snapshot) state.debugSnapshots.push(result.snapshot)
	if (state.live) state.cursor = { index: state.log.length - 1, tick: result.tick }
	if (result.outcome) {
		state.outcome = result.outcome
		state.phase = 'finished'
		clearTimer(state.regionId)
	} else if (result.tick >= MAX_RUN_TICKS) {
		// A tree that never resolves (KeepRunning over a perfect skill…) must
		// not tick forever in the background; stop loudly instead of silently.
		state.phase = 'paused'
		clearTimer(state.regionId)
	}
}

function armTimer(state: BtRunState): void {
	const held = internals.get(state.regionId)
	if (!held) return
	clearTimer(state.regionId)
	const period = Math.max(16, state.tickMs / Math.max(0.1, state.speed))
	held.timer = window.setInterval(() => {
		if (state.phase !== 'running') return
		stepInto(state, held.engine)
		notify()
	}, period)
}

export function startBtRun(region: BehaviorTreeShape, options: StartBtRunOptions = {}): BtRunState {
	stopBtRun(region.id)
	const document = parseBehaviorTreeXml(region.props.xml)
	const seed = options.seed ?? (Math.floor(Math.random() * 90000) + 1)
	const engine = createMockEngine(document, {
		seed,
		treeId: region.props.treeId || document.mainTreeId,
		debugSnapshots: options.debugSnapshots ?? false,
	})
	const mainTree = document.trees.find((tree) => tree.id === engine.treeId) ?? null
	const state: BtRunState = {
		regionId: region.id,
		runId: nextRunId++,
		phase: engine.unsupportedReasons.length > 0 ? 'refused' : 'running',
		seed,
		speed: options.speed ?? 1,
		tickMs: engine.tickMs,
		treeId: engine.treeId,
		rootKey: mainTree?.root ? runtimeKey(engine.treeId, mainTree.root.path) : null,
		xml: region.props.xml,
		log: [],
		latestTick: 0,
		outcome: null,
		cursor: { index: -1, tick: 0 },
		live: true,
		refusedReasons: engine.unsupportedReasons,
		debugSnapshots: options.debugSnapshots ? [] : null,
	}
	runs.set(region.id, state)
	internals.set(region.id, { engine, timer: null })
	if (state.phase === 'running') armTimer(state)
	notify()
	return state
}

export function stopBtRun(regionId: TLShapeId): void {
	if (!runs.has(regionId)) return
	clearTimer(regionId)
	runs.delete(regionId)
	internals.delete(regionId)
	notify()
}

export function pauseBtRun(regionId: TLShapeId): void {
	const state = runs.get(regionId)
	if (!state || state.phase !== 'running') return
	state.phase = 'paused'
	clearTimer(regionId)
	notify()
}

export function resumeBtRun(regionId: TLShapeId): void {
	const state = runs.get(regionId)
	if (!state || state.phase !== 'paused') return
	state.phase = 'running'
	state.live = true
	state.cursor = { index: state.log.length - 1, tick: state.latestTick }
	armTimer(state)
	notify()
}

export function stepBtRunTick(regionId: TLShapeId): void {
	const state = runs.get(regionId)
	const held = internals.get(regionId)
	if (!state || !held || state.phase === 'refused' || state.phase === 'stale' || state.outcome) return
	state.phase = 'paused'
	clearTimer(regionId)
	state.live = true
	stepInto(state, held.engine)
	notify()
}

export function setBtRunSpeed(regionId: TLShapeId, speed: number): void {
	const state = runs.get(regionId)
	if (!state) return
	state.speed = speed
	if (state.phase === 'running') armTimer(state)
	notify()
}

/** The region's XML moved under a live run: stop painting, say why. */
export function markBtRunStaleIfDrifted(region: BehaviorTreeShape): void {
	const state = runs.get(region.id)
	if (!state || state.xml === region.props.xml) return
	if (state.phase === 'stale') return
	state.phase = 'stale'
	clearTimer(region.id)
	notify()
}

/* --------------------------------- scrubbing -------------------------------- */

export function scrubBtRunToTick(regionId: TLShapeId, tick: number): void {
	const state = runs.get(regionId)
	if (!state) return
	if (state.phase === 'running') {
		state.phase = 'paused'
		clearTimer(regionId)
	}
	const bounded = Math.max(0, Math.min(tick, state.latestTick))
	state.cursor = { index: lastIndexAtOrBeforeTick(state.log, bounded), tick: bounded }
	state.live = state.cursor.index === state.log.length - 1 && bounded === state.latestTick
	notify()
}

export function scrubBtRunToTransition(regionId: TLShapeId, index: number): void {
	const state = runs.get(regionId)
	if (!state) return
	if (state.phase === 'running') {
		state.phase = 'paused'
		clearTimer(regionId)
	}
	const bounded = Math.max(-1, Math.min(index, state.log.length - 1))
	state.cursor = { index: bounded, tick: bounded >= 0 ? state.log[bounded].tick : 0 }
	state.live = bounded === state.log.length - 1 && state.cursor.tick === state.latestTick
	notify()
}

export function stepBtRunTransition(regionId: TLShapeId, delta: 1 | -1): void {
	const state = runs.get(regionId)
	if (!state) return
	scrubBtRunToTransition(regionId, state.cursor.index + delta)
}

export function backToLive(regionId: TLShapeId): void {
	const state = runs.get(regionId)
	if (!state) return
	state.cursor = { index: state.log.length - 1, tick: state.latestTick }
	state.live = true
	notify()
}

/* ---------------------------------- reading --------------------------------- */

/** The exact state at the cursor — the ONLY thing rendering reads. */
export function foldedStateAtCursor(state: BtRunState): BtFoldedState {
	return reconstructAt(state.log, state.cursor.index, state.rootKey)
}

export interface BtNodePaint {
	status: BtRunStatus | 'pending'
	sinceTick: number
}

/**
 * Per-path paint map for ONE tree (a region shows one tree; a subtree's inner
 * nodes belong to another region showing that tree). `pending` is a node the
 * run has not reached yet — Flowstate's gray — distinct from idle (no run).
 */
export function paintForTree(state: BtRunState, folded: BtFoldedState, treeId: string): Map<string, BtNodePaint> {
	const paint = new Map<string, BtNodePaint>()
	const prefix = `${treeId}:`
	for (const [key, held] of folded.statuses) {
		if (key.startsWith(prefix)) paint.set(key.slice(prefix.length), { status: held.status, sinceTick: held.sinceTick })
	}
	return paint
}

export function fmtRunTime(ms: number): string {
	const minutes = Math.floor(ms / 60000)
	const seconds = Math.floor((ms % 60000) / 1000)
	const millis = Math.floor(ms % 1000)
	return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}

/* ----------------------------- editor integration ---------------------------- */

/**
 * Installed once from `installBehaviorTreeRegions`: watches for XML drift
 * under live runs and tears a run down when its region is deleted.
 */
export function installBtRunStore(editor: Editor): () => void {
	const stop = editor.store.listen(() => {
		for (const state of [...runs.values()]) {
			const region = editor.getShape(state.regionId)
			if (!region || !isBehaviorTreeShape(region)) {
				stopBtRun(state.regionId)
				continue
			}
			markBtRunStaleIfDrifted(region)
		}
	}, { scope: 'document' })
	return () => {
		stop()
		for (const regionId of [...runs.keys()]) stopBtRun(regionId)
	}
}
