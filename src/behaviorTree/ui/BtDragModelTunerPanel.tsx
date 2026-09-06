/**
 * The Drag Model Tuner — Zach's live cockpit for the auto-layout drag feel.
 *
 * Opened from Dev → Behavior Tree → "Drag Model Tuner". Three surfaces in
 * one floating panel:
 *   - LAYERS: independent switches for each debug-overlay layer
 *     (containers, virtual slots, capture/release thresholds, climb ring);
 *   - KNOBS: a slider per tunable parameter (`treeDragTuningState.ts`) —
 *     claim distance, capture padding, the deadband's factor and fixed
 *     padding, climb reach, zone overhang. Values apply live: the overlay
 *     repaints immediately, the next drag resolves with them;
 *   - MEASURED: the real travel cost of a swap, computed by driving the
 *     actual resolution pipeline (`measureSwapTravel`) against the first
 *     auto-layout Tree region on the page — in ITS orientation and,
 *     side by side, the flipped one, for a root leaf, a subtree head and a
 *     deep leaf. This is the table that made the orientation complaint a
 *     number (down/right ≈ 1.8–2.7× at defaults) and shows a tuning's
 *     per-scenario effect without six manual test drags.
 *
 * The Copy button exports the values plus the measured table as paste-able
 * text — the loop back to making tuned numbers the shipped defaults.
 */
import { useDeferredValue, useMemo, useState } from 'react'
import { atom, useEditor, useValue, type Editor } from 'tldraw'

import { getSelectedBehaviorTree, setBehaviorTreeView, tidyBehaviorTree } from '../behaviorTreeCommands'
import { isBehaviorTreeShape, type BehaviorTreeShape } from '../behaviorTreeModel'
import { parseBehaviorTreeXml, selectTree } from '../btcppXml'
import { measureSwapTravel } from '../dragSensitivity'
import { BtAutoLayoutControl } from './BtAutoLayoutControl'
import {
	DEFAULT_TREE_DRAG_MODEL_LAYERS,
	setTreeDragModelFocus,
	setTreeDragModelLayers,
	setTreeDragModelOverlay,
	setTreeDragModelTreeFade,
	treeDragModelLayers,
	treeDragModelOverlay,
	treeDragModelTreeFade,
	type BtDragModelLayers,
} from '../treeDragModelOverlayState'
import {
	btDragTuning,
	formatBtDragTuningExport,
	resetBtDragTuning,
	setBtDragTuning,
	type BtDragTuning,
} from '../treeDragTuningState'
import './behavior-tree-inspector.css'

/** Session-local panel visibility; the Dev panel button flips it. */
export const dragModelTunerOpen = atom<boolean>('drag model tuner open', false)

/**
 * The region the tuner is about — ONE judge, shared by the panel's measured
 * table, its Auto layout toggle, and {@link openDragModelTuner}.
 *
 * WHY one function rather than a predicate per caller: the panel used to look
 * for "the first Tree region already in `tidy`", which is a different set from
 * "the region whose Auto layout opening the tuner should switch on". Two rules
 * can disagree — switch one region on and measure another — and on a board with
 * a single region, which is every board this was tested on, the disagreement is
 * invisible. The selected region wins because it is the one Zach is looking at;
 * a selected NODE resolves to its region through `getSelectedBehaviorTree`, so
 * the subject does not vanish mid-drag.
 */
export function tunerSubjectRegion(editor: Editor): BehaviorTreeShape | null {
	const selected = getSelectedBehaviorTree(editor)?.region
	if (selected && selected.props.projection === 'tree') return selected
	for (const id of editor.getCurrentPageShapeIds()) {
		const shape = editor.getShape(id)
		if (isBehaviorTreeShape(shape) && shape.props.projection === 'tree') return shape
	}
	return null
}

/**
 * Open the tuner with the two preconditions it cannot work without.
 *
 * The overlay master, because a cockpit with nothing drawn is not a cockpit;
 * and the subject region's Auto layout, because every knob here tunes the
 * auto-layout drag lane — with `arrangement: 'free'` a drag sets a free
 * position, no slot is ever captured, and the whole panel measures and paints
 * a model that nothing is running. Both are left as set on close: turning a
 * debug view off should not silently re-arrange somebody's tree.
 *
 * WHY it lives here and not on the Dev button that calls it: the pairing is a
 * property of the tuner, not of one opener, and "which region" is only defined
 * next to `tunerSubjectRegion`. A second entry point would otherwise open a
 * half-configured panel.
 */
export function openDragModelTuner(editor: Editor): void {
	setTreeDragModelOverlay(true)
	const region = tunerSubjectRegion(editor)
	if (region && region.props.arrangement !== 'tidy') {
		setBehaviorTreeView(editor, region.id, { arrangement: 'tidy' }, 'auto layout for the drag tuner')
	}
	dragModelTunerOpen.set(true)
}

/**
 * Each layer's row carries a SWATCH drawn with the layer's own ink and dash
 * tokens, so the checkbox list is the overlay's key.
 *
 * WHY: with four layers painting at once Zach could not tell which line meant
 * which thing ("it's very confusing", 2026-09-06). The mapping has to be
 * visible somewhere; putting it on the checkbox that owns the layer costs no
 * canvas ink, which is what the same review asked to reduce. `whenever` marks
 * the two layers that genuinely have nothing to draw until a drag starts —
 * without it, a checked box painting nothing reads as broken.
 */
const LAYER_ROWS: Array<{
	key: keyof BtDragModelLayers
	label: string
	hint: string
	/** Named when the layer genuinely has nothing to paint until a drag runs. */
	whenever?: string
}> = [
	{ key: 'containers', label: 'Containers', hint: 'zebra column zones, seams, bracketed bounds — and each column’s gap / slot / width in px' },
	{ key: 'slots', label: 'Virtual card slots', hint: 'uniform drag rects; a padded slot is bold and labeled +Npx' },
	{ key: 'thresholds', label: 'Capture / release lines', hint: 'capture (teal) at rest and mid-drag; release (rose) labeled in px', whenever: 'release: during a drag' },
	{ key: 'climb', label: 'Climb ring', hint: 'exit distance before re-parenting upward', whenever: 'during a drag' },
]

/**
 * The key, drawn from the same ink and dash tokens the canvas paints with.
 *
 * Each one is a literal miniature of its layer rather than a generic colour
 * chip: the containers swatch shows two abutting zebra zones with the seam
 * between them, because "these are two columns, not one band" is precisely the
 * thing the overlay was failing to say.
 */
function LayerSwatch({ layer }: { layer: keyof BtDragModelLayers }) {
	return (
		<svg className="bt-drag-tuner__swatch" data-layer={layer} viewBox="0 0 36 26" width="36" height="26" aria-hidden="true">
			{layer === 'containers' ? (
				<>
					<rect data-mark="zone" x="3" y="2" width="15" height="22" />
					<rect data-mark="zone-alt" x="18" y="2" width="15" height="22" />
					<line data-mark="overhang" x1="3" y1="2" x2="3" y2="24" />
					<line data-mark="seam" x1="18" y1="2" x2="18" y2="24" />
					<line data-mark="overhang" x1="33" y1="2" x2="33" y2="24" />
					<path data-mark="bound" d="M7,9L7,6L11,6M25,6L29,6L29,9M7,17L7,20L11,20M25,20L29,20L29,17" />
				</>
			) : null}
			{layer === 'slots' ? (
				<>
					<rect data-mark="slot" x="3" y="5" width="13" height="16" rx="3" />
					<rect data-mark="slot-padded" x="20" y="5" width="13" height="16" rx="3" />
				</>
			) : null}
			{layer === 'thresholds' ? (
				<>
					<line data-mark="capture" x1="11" y1="2" x2="11" y2="24" />
					<line data-mark="release" x1="25" y1="2" x2="25" y2="24" />
				</>
			) : null}
			{layer === 'climb' ? <rect data-mark="climb" x="3" y="4" width="30" height="18" rx="5" /> : null}
		</svg>
	)
}

/**
 * `draws` names what the focus view lights up for this knob — the same list
 * `FOCUS_MARKS` in `BtDragModelOverlay.tsx` drives, said in words, so the row
 * tells you where to look before you have moved anything.
 */
const KNOB_ROWS: Array<{
	key: keyof BtDragTuning
	label: string
	hint: string
	draws: string
	min: number
	max: number
	step: number
}> = [
	{ key: 'claimDistancePx', label: 'Claim distance', hint: 'px of travel before dnd-kit takes the press from tldraw', draws: 'draws: the claim radius', min: 1, max: 12, step: 1 },
	{ key: 'capturePaddingPx', label: 'Capture padding', hint: 'extra px to take a slot toward the list START (lead edge past its center)', draws: 'draws: capture lines + slots', min: -60, max: 120, step: 2 },
	{ key: 'releaseFactor', label: 'Deadband factor', hint: '× (dragged extent + gap); 0 = dimension-independent', draws: 'draws: release line, gap, slots — on a preview card', min: 0, max: 2, step: 0.05 },
	{ key: 'releasePaddingPx', label: 'Deadband padding', hint: 'flat px added to the displaced-side threshold — holding a capture AND advancing toward the list END', draws: 'draws: release line + gap — on a preview card', min: -40, max: 240, step: 4 },
	{ key: 'climbSlots', label: 'Climb reach', hint: 'slot-extents past the list bound before the ancestor climb', draws: 'draws: the climb ring — on a preview card', min: 0.25, max: 3, step: 0.25 },
	{ key: 'zoneOverhangSlots', label: 'Zone overhang', hint: 'slot-extents a strip-end column reaches past its bound', draws: 'draws: overhang edges + zones', min: 0.25, max: 3, step: 0.25 },
]

interface ProbeRow {
	scenario: string
	path: string
}

/** Representative members of the region's own tree: root leaf, subtree head, deep leaf. */
function probeRows(region: BehaviorTreeShape): ProbeRow[] {
	const tree = selectTree(parseBehaviorTreeXml(region.props.xml), region.props.treeId)
	if (!tree?.root) return []
	const rows: ProbeRow[] = []
	const rootChildren = tree.root.children
	const leaf = rootChildren.find((child) => child.children.length === 0)
	if (leaf !== undefined) rows.push({ scenario: 'root leaf', path: `0.${rootChildren.indexOf(leaf)}` })
	const head = rootChildren.find((child) => child.children.length > 0)
	if (head !== undefined) rows.push({ scenario: 'subtree head', path: `0.${rootChildren.indexOf(head)}` })
	let deepest = { path: '', depth: -1 }
	for (const node of tree.nodes) {
		if (node.children.length === 0 && node.depth > deepest.depth && node.path.split('.').length > 2) {
			deepest = { path: node.path, depth: node.depth }
		}
	}
	if (deepest.path) rows.push({ scenario: 'deep leaf', path: deepest.path })
	return rows
}

function formatPx(value: number | null): string {
	return value === null ? '—' : `${value}px`
}

export function BtDragModelTunerPanel() {
	const editor = useEditor()
	const open = useValue('drag model tuner open', () => dragModelTunerOpen.get(), [])
	const overlayOn = useValue('drag model overlay master', () => treeDragModelOverlay.get(), [])
	const layers = useValue('drag model layers', () => treeDragModelLayers.get(), [])
	const treeFade = useValue('drag model tree fade', () => treeDragModelTreeFade.get(), [])
	const tuning = useValue('drag model tuning', () => btDragTuning.get(), [])
	const [copied, setCopied] = useState(false)
	// The subject region — see `tunerSubjectRegion`. Reading the whole shape
	// record keeps its xml, arrangement and offsets as dependencies, so an edit
	// re-measures and the Auto layout toggle below cannot show a stale state.
	const region = useValue('drag model tuner region', () => (
		dragModelTunerOpen.get() ? tunerSubjectRegion(editor) : null
	), [editor])
	const autoLayout = region?.props.arrangement === 'tidy'

	/**
	 * The measured table lags the slider on purpose.
	 *
	 * WHY (measured 2026-09-06, before/after in the handoff): one `input` event
	 * cost 340–390 ms, and an A/B with the overlay master off moved it by 8 ms —
	 * so essentially all of it was THIS memo. Each pass runs `measureSwapTravel`
	 * six times (three scenarios × two orientations), and each of those does two
	 * full tree layouts plus a 1-px-at-a-time simulated drag. At ~60 input events
	 * a second that is a ~20× oversubscribed main thread, which is the lag.
	 *
	 * The 1-px scan is not negotiable — the deadband is path-dependent, so
	 * `resolveDragListDrop` mutates `ctx.hysteresis` as it goes and a coarser or
	 * binary-searched sweep would measure a different, wrong thing. What IS
	 * negotiable is WHEN the number appears: nobody reads a swap cost mid-drag,
	 * they read it where the slider came to rest. `useDeferredValue` lets React
	 * drop the intermediate values and compute once the input settles, so the
	 * knob and the overlay stay on the urgent path and this falls off it.
	 */
	const settledTuning = useDeferredValue(tuning)
	const measuring = settledTuning !== tuning
	const measured = useMemo(() => {
		// With Auto layout off there is no swap to cost: a drag sets a free
		// position instead of capturing a slot. Printing the numbers anyway
		// would describe a resolver that is not running.
		if (!open || !region || region.props.arrangement !== 'tidy') return null
		const rows = probeRows(region)
		return rows.map((row) => {
			const measure = (orientation: 'down' | 'right') =>
				measureSwapTravel({
					xml: region.props.xml,
					treeId: region.props.treeId,
					path: row.path,
					options: {
						orientation,
						nodeFace: region.props.nodeFace,
						controlFace: region.props.controlFace,
						spacing: region.props.spacingScale,
						nodeViewOverrides: region.props.nodeViewOverrides,
						tuning: settledTuning,
					},
				})
			return { ...row, down: measure('down'), right: measure('right') }
		})
	}, [open, region, settledTuning])

	if (!open) return null

	const readoutText = (measured ?? [])
		.map((row) =>
			`${row.scenario} (${row.path}): down capture ${formatPx(row.down.capturePx)} / release ${formatPx(row.down.releaseBackPx)} · right capture ${formatPx(row.right.capturePx)} / release ${formatPx(row.right.releaseBackPx)}`)
		.join('\n')

	const copy = async () => {
		const payload = formatBtDragTuningExport(tuning, readoutText)
		try {
			await navigator.clipboard.writeText(payload)
		} catch {
			// Clipboard can be walled off (permissions, webviews); the textarea
			// below always carries the same payload for manual copying.
		}
		setCopied(true)
		window.setTimeout(() => setCopied(false), 1600)
	}

	return (
		<aside
			className="bt-drag-tuner"
			data-testid="bt-drag-tuner"
			aria-label="Drag Model Tuner"
			onPointerDown={(event) => event.stopPropagation()}
			onWheel={(event) => event.stopPropagation()}
		>
			<header className="bt-drag-tuner__header">
				<div>
					<span>Behavior Tree</span>
					<h2>Drag Model Tuner</h2>
				</div>
				<button type="button" aria-label="Close the Drag Model Tuner" onClick={() => dragModelTunerOpen.set(false)}>×</button>
			</header>

			<label className="bt-drag-tuner__master">
				<input
					type="checkbox"
					data-testid="bt-drag-tuner-master"
					checked={overlayOn}
					onChange={(event) => setTreeDragModelOverlay(event.target.checked)}
				/>
				<span><b>Draw the drag model</b><small>master switch — same as the Dev checkbox</small></span>
			</label>

			{/*
			 * The subject region, and its Auto layout switch.
			 *
			 * WHY the toggle is here and not only on the selection pill (Zach,
			 * 2026-09-06): the pill is a floating contextual dock that lands on
			 * top of the very overlay this panel draws, so it is suppressed while
			 * the tuner is open — and a control you cannot reach is not an
			 * override. Every knob below tunes the auto-layout drag lane, so the
			 * switch that arms that lane belongs in the same panel, on the same
			 * side of the screen, visible without a selection. It is the same
			 * `BtAutoLayoutControl` writing the same `setBehaviorTreeView` command
			 * as the pill and the inspector: one behaviour, three homes, so they
			 * cannot disagree. Naming the region is the other half — until now
			 * nothing said WHICH tree the measured table was about.
			 */}
			<div className="bt-drag-tuner__section">Region</div>
			<div className="bt-drag-tuner__region" data-testid="bt-drag-tuner-region" data-auto-layout={autoLayout}>
				{region ? (
					<>
						<span className="bt-drag-tuner__regionName" data-testid="bt-drag-tuner-region-name">
							{/* The authored title, whatever it is; an untitled region
							    says so rather than borrowing the shape type's name. */}
							{region.props.title === '' ? <em>Untitled Behavior Tree</em> : region.props.title}
						</span>
						<BtAutoLayoutControl
							arrangement={region.props.arrangement}
							offsetCount={Object.keys(region.props.offsets).length}
							onSetArrangement={(arrangement) => void setBehaviorTreeView(editor, region.id, { arrangement })}
							onArrangeNow={() => void tidyBehaviorTree(editor, region.id)}
						/>
					</>
				) : (
					<small>No Tree region on this page — add one, or switch a region to the Tree view.</small>
				)}
			</div>

			<div className="bt-drag-tuner__section">Layers &amp; key</div>
			{LAYER_ROWS.map((row) => (
				<label key={row.key} className="bt-drag-tuner__layer" data-testid={`bt-drag-tuner-layer-row-${row.key}`}>
					<input
						type="checkbox"
						data-testid={`bt-drag-tuner-layer-${row.key}`}
						checked={layers[row.key]}
						disabled={!overlayOn}
						onChange={(event) => setTreeDragModelLayers({ [row.key]: event.target.checked })}
					/>
					<LayerSwatch layer={row.key} />
					<span>
						<b>{row.label}</b>
						{row.whenever ? <em className="bt-drag-tuner__when">{row.whenever}</em> : null}
						<small>{row.hint}</small>
					</span>
				</label>
			))}

			{/* Not a layer: this turns the SUBJECT down rather than any debug
			    information off, so the model can be the foreground. */}
			<label className="bt-drag-tuner__knob bt-drag-tuner__fade">
				<span className="bt-drag-tuner__knobLabel">
					<b>Fade the tree</b>
					<code data-testid="bt-drag-tuner-value-treeFade">{Math.round(treeFade * 100)}%</code>
				</span>
				<input
					type="range"
					data-testid="bt-drag-tuner-fade"
					min={0}
					max={0.9}
					step={0.05}
					value={treeFade}
					disabled={!overlayOn}
					onChange={(event) => setTreeDragModelTreeFade(Number(event.target.value))}
				/>
				<small>paper over the real cards, under every debug mark</small>
			</label>

			<div className="bt-drag-tuner__section">Knobs<button
				type="button"
				className="bt-drag-tuner__reset"
				data-testid="bt-drag-tuner-reset"
				onClick={() => {
					resetBtDragTuning()
					setTreeDragModelLayers(DEFAULT_TREE_DRAG_MODEL_LAYERS)
					setTreeDragModelTreeFade(0)
				}}
			>Reset</button></div>
			<p className="bt-drag-tuner__note bt-drag-tuner__focusHint">
				Point at a knob to light up only the geometry it controls.
			</p>
			{KNOB_ROWS.map((row) => (
				/*
				 * FOCUS VIEW. Pointing at a knob publishes its key; the overlay
				 * lights only the marks that knob controls and ghosts the rest.
				 *
				 * WHY hover and not "while dragging" (Chrome DevTools' rule, and
				 * the reason it works): you can learn what a parameter means
				 * without first committing to a value. `onFocus`/`onBlur` carry
				 * the same behaviour to the keyboard.
				 */
				<label
					key={row.key}
					className="bt-drag-tuner__knob"
					data-testid={`bt-drag-tuner-knobrow-${row.key}`}
					onPointerEnter={() => setTreeDragModelFocus(row.key)}
					onPointerLeave={() => setTreeDragModelFocus(null)}
					onFocus={() => setTreeDragModelFocus(row.key)}
					onBlur={() => setTreeDragModelFocus(null)}
				>
					<span className="bt-drag-tuner__knobLabel">
						<b>{row.label}</b>
						<code data-testid={`bt-drag-tuner-value-${row.key}`}>{tuning[row.key]}</code>
					</span>
					<input
						type="range"
						data-testid={`bt-drag-tuner-knob-${row.key}`}
						min={row.min}
						max={row.max}
						step={row.step}
						value={tuning[row.key]}
						onChange={(event) => setBtDragTuning({ [row.key]: Number(event.target.value) })}
					/>
					<small>{row.hint}</small>
					<em className="bt-drag-tuner__draws">{row.draws}</em>
				</label>
			))}

			{/* Say the table is behind rather than showing a stale number as if
			    it were current — the values below are for `settledTuning`. */}
			<div className="bt-drag-tuner__section">
				Measured swap cost
				<span className="bt-drag-tuner__lag" data-testid="bt-drag-tuner-measuring" data-measuring={measuring}>
					{measuring ? 'measuring…' : ''}
				</span>
			</div>
			{region && measured ? (
				<table className="bt-drag-tuner__table" data-testid="bt-drag-tuner-table" data-measuring={measuring}>
					<thead>
						<tr><th /><th>top-down</th><th>left-right</th></tr>
					</thead>
					<tbody>
						{measured.map((row) => (
							<tr key={row.path}>
								<th>{row.scenario}<small>{row.path}</small></th>
								<td data-orientation="down">
									<b>{formatPx(row.down.capturePx)}</b>
									<small>release {formatPx(row.down.releaseBackPx)}</small>
								</td>
								<td data-orientation="right">
									<b>{formatPx(row.right.capturePx)}</b>
									<small>release {formatPx(row.right.releaseBackPx)}</small>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			) : (
				/* Two different reasons for an empty table, said apart: the board
				   has no Tree region at all, or it has one with Auto layout off —
				   in which case the switch that fixes it is a few rows up. */
				<p className="bt-drag-tuner__empty" data-testid="bt-drag-tuner-empty">
					{region
						? 'Auto layout is off for this region — turn it on above to measure a swap.'
						: 'No Tree region on this page — add one to measure.'}
				</p>
			)}
			<p className="bt-drag-tuner__note">
				Capture = travel to the first committed swap toward the next sibling; release = travel back past
				that point before the original order returns. Measured by driving the real resolver against this
				region&rsquo;s own tree, in its orientation and the flipped one.
			</p>

			<button type="button" className="bt-drag-tuner__copy" data-testid="bt-drag-tuner-copy" onClick={() => void copy()}>
				{copied ? 'Copied ✓' : 'Copy values for chat'}
			</button>
			<textarea
				className="bt-drag-tuner__export"
				data-testid="bt-drag-tuner-export"
				readOnly
				value={formatBtDragTuningExport(tuning, readoutText)}
				onFocus={(event) => event.currentTarget.select()}
			/>
		</aside>
	)
}
