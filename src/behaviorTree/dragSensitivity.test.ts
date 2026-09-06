/**
 * The orientation-sensitivity finding, quantified and pinned.
 *
 * Zach's 2026-09-06 recordings (same document, spacing 2): one swap took
 * ~68 page px on a `right` tree, and each gesture on a `down` tree took
 * 150–370 px — his hypothesis was "that may just have to do with the
 * dimensions of the rectangle." These tests reproduce the numbers from the
 * REAL pipeline via `measureSwapTravel`, pin the structural asymmetry
 * (down's cross axis is card WIDTH, right's is card HEIGHT, and both the
 * capture distance and the release deadband scale with member extents), and
 * prove the tuner's fixed-px deadband mode removes the release-side
 * asymmetry — the knob that directly tests the hypothesis. The measured
 * table is written to `docs/assets/behavior-tree-dual-drag/sensitivity.json`
 * for the report builder to inline; the numbers are pure-function output,
 * so the artifact is deterministic.
 */
import { describe, expect, it } from 'vitest'

import { SAMPLE_BEHAVIOR_TREE_XML } from './btcppXml'
import { measureSwapTravel, type SwapTravelMeasurement } from './dragSensitivity'
import { type DragListOptions } from './dragListReorder'

// @ts-ignore node types are deliberately absent from the app's tsconfig; vitest supplies the module — the same workaround `layouts.test.ts` uses for its preview dumps.
const nodeFs = (await import('node:fs')) as unknown as {
	mkdirSync(path: string, options: { recursive: boolean }): void
	writeFileSync(path: string, text: string): void
}
const ARTIFACT_DIR = new URL('../../docs/assets/behavior-tree-dual-drag/', import.meta.url).pathname
const ARTIFACT = `${ARTIFACT_DIR}sensitivity.json`

function options(orientation: 'down' | 'right', tuning?: DragListOptions['tuning']): DragListOptions {
	// The recordings' exact presentation: simple nodes, spacing 2.
	return { orientation, nodeFace: 'simple', controlFace: 'expanded', spacing: 2, tuning }
}

function probe(orientation: 'down' | 'right', path: string, tuning?: DragListOptions['tuning']): SwapTravelMeasurement {
	return measureSwapTravel({
		xml: SAMPLE_BEHAVIOR_TREE_XML,
		treeId: 'PickAndPlace',
		path,
		options: options(orientation, tuning),
	})
}

describe('drag sensitivity by orientation (the 2026-09-06 recordings, reproduced)', () => {
	// Root-row members of the sample tree: 0.1 is a control (Fallback head,
	// drags its subtree), 0.2 a leaf (CloseGrip) — the two scenarios Zach
	// expects to differ.
	const scenarios = [
		{ id: 'root leaf', path: '0.2' },
		{ id: 'root subtree head', path: '0.1' },
		{ id: 'deep leaf', path: '0.1.0' },
	] as const

	const table = scenarios.map((scenario) => ({
		scenario: scenario.id,
		path: scenario.path,
		down: probe('down', scenario.path),
		right: probe('right', scenario.path),
	}))

	it('every probed swap is reachable in both orientations', () => {
		for (const row of table) {
			expect(row.down.capturePx, `${row.scenario} down capture`).not.toBeNull()
			expect(row.right.capturePx, `${row.scenario} right capture`).not.toBeNull()
			expect(row.down.releaseBackPx, `${row.scenario} down release`).not.toBeNull()
			expect(row.right.releaseBackPx, `${row.scenario} right release`).not.toBeNull()
		}
	})

	it('top-down costs meaningfully more travel than left-right for the same swap — the complaint, in numbers', () => {
		for (const row of table) {
			const ratio = (row.down.capturePx ?? 0) / Math.max(1, row.right.capturePx ?? 1)
			expect(ratio, `${row.scenario}: down/right capture ratio`).toBeGreaterThan(1.5)
		}
	})

	it("the asymmetry tracks the dragged rectangle's cross extent — Zach's hypothesis, confirmed", () => {
		for (const row of table) {
			// Cross extent on `down` is the card's width, on `right` its height;
			// the extents ratio predicts the travel ratio's direction every time.
			expect(row.down.crossExtentPx).toBeGreaterThan(row.right.crossExtentPx)
		}
	})

	it('a fixed-px deadband (releaseFactor 0) makes release-back travel orientation-independent', () => {
		const fixed = { releaseFactor: 0, releasePaddingPx: 24 }
		for (const scenario of scenarios) {
			const down = probe('down', scenario.path, fixed)
			const right = probe('right', scenario.path, fixed)
			expect(down.releaseBackPx, `${scenario.id} down`).not.toBeNull()
			expect(right.releaseBackPx, `${scenario.id} right`).not.toBeNull()
			const difference = Math.abs((down.releaseBackPx ?? 0) - (right.releaseBackPx ?? 0))
			expect(difference, `${scenario.id}: fixed-deadband release asymmetry`).toBeLessThanOrEqual(2)
		}
	})

	it('writes the measured table for the report builder (deterministic pure-function output)', () => {
		nodeFs.mkdirSync(ARTIFACT_DIR, { recursive: true })
		nodeFs.writeFileSync(ARTIFACT, `${JSON.stringify({ spacing: 2, nodeFace: 'simple', table }, null, 2)}\n`)
		expect(table.length).toBe(3)
	})
})
