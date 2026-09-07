import { parseBehaviorTreeXml, SAMPLE_BEHAVIOR_TREE_XML, selectTree, type BtDocument, type BtTree } from './behaviorTree/btcppXml'
import { reconcileBehaviorTree } from './behaviorTree/installBehaviorTreeRegions'
import { btDndDragState, type BtDndDragSignal } from './behaviorTree/treeDndDragState'
import { createMockEngine, lastIndexAtOrBeforeTick, reconstructAt } from './behaviorTree/runtime/btMockEngine'
import { getBtRun, scrubBtRunToTick, startBtRun, stepBtRunTransition, stopBtRun } from './behaviorTree/runtime/runStore'
import { isBehaviorTreeShape } from './behaviorTree/behaviorTreeModel'
import { serializeTldrawJson, type Editor } from 'tldraw'
import { renderWithStockTldraw } from './export/stockTldrawPrimitives'
import { getPropagationRelationMetrics } from './propagation'

/**
 * A read-only development seam for the browser journeys.
 *
 * Every UI claim in this repo is proven by reading the painted document. That
 * rule has exactly one gap, and it is tldraw's: since v5 the selection
 * foreground, shape handles and other overlays are drawn to a `<canvas>`, so a
 * control point genuinely has no DOM node to query. A test that wants to know
 * whether a handle is being OFFERED has no pixel-level alternative.
 *
 * So this exposes the overlay ids the renderer is about to paint — one step
 * from the paint, not from the model — plus the editor itself for the same
 * class of question. It is installed only under `import.meta.env.DEV`, so it
 * cannot exist in a released Stable build.
 *
 * It is not a licence to assert against the model. A journey that could read
 * the DOM must read the DOM.
 */
export interface SystemSketchDevelopmentSeam {
	/**
	 * The journeys seed a region from the shipped sample without retyping it,
	 * and parse a region's own `props.xml` back — that string is already a
	 * legitimate read of the model (every journey reads it raw for XML
	 * substring checks); this only saves a journey from hand-rolling its own
	 * tag-order regex to ask a structural question like "did the whole
	 * subtree move together".
	 */
	behaviorTree: {
		SAMPLE_BEHAVIOR_TREE_XML: string
		reconcile(regionId: string): unknown
		parse(xml: string): BtDocument
		selectTree(document: BtDocument, treeId: string): BtTree | null
		/**
		 * The dnd drag lane's live signal (`treeDndDragState`), for the
		 * dual-drag journey's ownership claims — which system owns the gesture
		 * under the pointer right now is editor-scoped state with no DOM to
		 * read, the same class of gap as the overlay ids above.
		 */
		dndDrag(): BtDndDragSignal | null
		/**
		 * Mock-run probes for the run-mode journey: drive the store like the UI
		 * does, read the canonical log, and fold it independently — plus a
		 * pure-engine runner so the statistical claim (a 30% node succeeds in
		 * ~30% of runs) can be measured over hundreds of runs without the UI.
		 */
		runtime: {
			start(regionId: string, options?: { seed?: number; debugSnapshots?: boolean }): { phase: string; refusedReasons: string[] }
			stop(regionId: string): void
			state(regionId: string): unknown
			log(regionId: string): unknown[]
			scrubToTick(regionId: string, tick: number): void
			stepTransition(regionId: string, delta: 1 | -1): void
			foldAtTick(regionId: string, tick: number): Record<string, string>
			snapshotAtTick(regionId: string, tick: number): Record<string, string> | null
			engineOutcomes(xml: string, seeds: number[]): Array<'success' | 'failure' | null>
		}
	}
	editor: Editor
	/** Ids of the overlays currently on screen, e.g. `handle:shape:x:bend`. */
	overlayIds(): string[]
	/** Painted stacking order of a shape within its parent, for z-order claims. */
	shapeIndex(shapeId: string): string | null
	/** Render a detached `.tldr` through default tldraw utilities only. */
	renderStockTldraw(json: string): Promise<string>
	/** Serialize the live board for a default-renderer proof. */
	serializeTldraw(): Promise<string>
	/** Connection-lens observer metrics for the no-page-scan browser regression. */
	propagationRelationMetrics(): { connections: number; pageShapeReads: number; publishes: number }
}

declare global {
	interface Window {
		__systemsketch?: SystemSketchDevelopmentSeam
	}
}

export function installDevelopmentSeam(editor: Editor): () => void {
	if (!import.meta.env.DEV) return () => undefined

	const runRegion = (regionId: string) => {
		const shape = editor.getShape(regionId as never)
		return isBehaviorTreeShape(shape) ? shape : null
	}
	window.__systemsketch = {
		editor,
		behaviorTree: {
			SAMPLE_BEHAVIOR_TREE_XML,
			reconcile: (regionId) => reconcileBehaviorTree(editor, regionId as never),
			parse: parseBehaviorTreeXml,
			selectTree,
			dndDrag: () => btDndDragState.get(editor),
			runtime: {
				start: (regionId, options) => {
					const region = runRegion(regionId)
					if (!region) return { phase: 'refused', refusedReasons: ['no region'] }
					const state = startBtRun(region, options)
					return { phase: state.phase, refusedReasons: state.refusedReasons }
				},
				stop: (regionId) => stopBtRun(regionId as never),
				state: (regionId) => {
					const state = getBtRun(regionId as never)
					if (!state) return null
					return {
						phase: state.phase, seed: state.seed, latestTick: state.latestTick,
						outcome: state.outcome, cursor: state.cursor, live: state.live,
						transitions: state.log.length, treeId: state.treeId,
					}
				},
				log: (regionId) => (getBtRun(regionId as never)?.log ?? []).map((entry) => ({ ...entry })),
				scrubToTick: (regionId, tick) => scrubBtRunToTick(regionId as never, tick),
				stepTransition: (regionId, delta) => stepBtRunTransition(regionId as never, delta),
				foldAtTick: (regionId, tick) => {
					const state = getBtRun(regionId as never)
					if (!state) return {}
					const folded = reconstructAt(state.log, lastIndexAtOrBeforeTick(state.log, tick), state.rootKey)
					const out: Record<string, string> = {}
					for (const [key, held] of folded.statuses) out[key] = held.status
					return out
				},
				snapshotAtTick: (regionId, tick) => {
					const state = getBtRun(regionId as never)
					const snapshot = state?.debugSnapshots?.[tick - 1]
					if (!snapshot) return null
					const out: Record<string, string> = {}
					for (const [key, status] of snapshot) out[key] = status
					return out
				},
				engineOutcomes: (xml, seeds) => {
					const document = parseBehaviorTreeXml(xml)
					return seeds.map((seed) => {
						const engine = createMockEngine(document, { seed })
						if (engine.unsupportedReasons.length > 0) return null
						let result = engine.step()
						let guard = 0
						while (!result.outcome && guard < 500) {
							result = engine.step()
							guard += 1
						}
						return result.outcome
					})
				},
			},
		},
		overlayIds: () => editor.overlays.getCurrentOverlays().map((overlay) => overlay.id),
		shapeIndex: (shapeId) => editor.getShape(shapeId as never)?.index ?? null,
		renderStockTldraw: async (json) => {
			const container = editor.getContainer().ownerDocument.createElement('div')
			container.style.cssText = 'position:fixed;left:-10000px;top:-10000px;width:1px;height:1px;overflow:hidden'
			editor.getContainer().ownerDocument.body.appendChild(container)
			try {
				return await renderWithStockTldraw(json, container)
			} finally {
				container.remove()
			}
		},
		serializeTldraw: () => serializeTldrawJson(editor),
		propagationRelationMetrics: () => getPropagationRelationMetrics(editor),
	}

	return () => {
		if (window.__systemsketch?.editor === editor) delete window.__systemsketch
	}
}
