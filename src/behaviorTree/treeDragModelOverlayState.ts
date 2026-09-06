/**
 * The Tree drag-model debug overlay's switches.
 *
 * Zach's ask (2026-09-06): the auto-layout drag resolves against an invisible
 * Kanban — one sortable container per parent's children list, tiled into
 * column zones, every member padded to a uniform virtual slot, with a
 * hysteresis deadband deciding when a slot is captured and released — and he
 * wants to SEE that model on the canvas while dragging rather than infer it
 * from behavior. One master switch (the Dev panel checkbox; also what the
 * journeys toggle) plus independent per-layer switches (the Drag Model
 * Tuner's checkboxes): containers, virtual slots, capture/release
 * thresholds, and the ancestor-climb ring. All in the `cablePresentation`
 * pattern: module atoms every Tree region reads live, persisted per browser,
 * defaulted OFF so production behavior and every existing journey are
 * untouched.
 *
 * The overlay itself is a read-only rendering pass in
 * `BtDragModelOverlay.tsx` over the REAL geometry — the live drag session's
 * own `DragListContext` mid-drag, and the same `deriveDragListGeometry`
 * derivation at rest — never a second computation that could drift.
 */
import { atom } from 'tldraw'

export const TREE_DRAG_MODEL_OVERLAY_KEY = 'systemsketch.tree-drag-model-overlay.v1'
export const TREE_DRAG_MODEL_LAYERS_KEY = 'systemsketch.tree-drag-model-layers.v1'
export const TREE_DRAG_MODEL_TREE_FADE_KEY = 'systemsketch.tree-drag-model-tree-fade.v1'

/**
 * Which knob the pointer is on, or null.
 *
 * WHY a mode string rather than a per-knob renderer (Zach, 2026-09-06: "for
 * each of those knobs, draw specifically the spaces that I'm adjusting"):
 * Chrome DevTools solves the identical problem — hovering one CSS declaration
 * highlights only the geometry that property controls — with a single
 * `mode: string` threaded into ONE highlight-config builder
 * (`OverlayModel.buildHighlightConfig`, ~13 modes, no branching renderers).
 * Same shape here: the mode picks which marks stay lit, the paint code is
 * unchanged. Hover is the trigger for the same reason it is there — you can
 * learn what a parameter means without first committing to a value.
 */
export type BtDragModelFocus = keyof import('./treeDragTuningState').BtDragTuning | null

export interface BtDragModelLayers {
	/** Column zones + container bounds. */
	containers: boolean
	/** Uniform virtual card slots. */
	slots: boolean
	/** Capture / release threshold lines (the hysteresis boundaries). */
	thresholds: boolean
	/** The ancestor-climb exit ring around the active container, mid-drag. */
	climb: boolean
}

export const DEFAULT_TREE_DRAG_MODEL_LAYERS: BtDragModelLayers = {
	containers: true,
	slots: true,
	thresholds: true,
	climb: true,
}

export function readTreeDragModelOverlay(
	storage: Pick<Storage, 'getItem'> | null = typeof window === 'undefined' ? null : window.localStorage,
): boolean {
	if (!storage) return false
	try {
		return JSON.parse(storage.getItem(TREE_DRAG_MODEL_OVERLAY_KEY) ?? 'false') === true
	} catch {
		return false
	}
}

export function writeTreeDragModelOverlay(
	next: boolean,
	storage: Pick<Storage, 'setItem'> | null = typeof window === 'undefined' ? null : window.localStorage,
): void {
	try {
		storage?.setItem(TREE_DRAG_MODEL_OVERLAY_KEY, JSON.stringify(next))
	} catch {
		// A debug preference is a convenience; a full store must not block drawing.
	}
}

export function readTreeDragModelLayers(
	storage: Pick<Storage, 'getItem'> | null = typeof window === 'undefined' ? null : window.localStorage,
): BtDragModelLayers {
	if (!storage) return { ...DEFAULT_TREE_DRAG_MODEL_LAYERS }
	try {
		const parsed = JSON.parse(storage.getItem(TREE_DRAG_MODEL_LAYERS_KEY) ?? '{}') as Partial<BtDragModelLayers>
		return {
			containers: typeof parsed.containers === 'boolean' ? parsed.containers : DEFAULT_TREE_DRAG_MODEL_LAYERS.containers,
			slots: typeof parsed.slots === 'boolean' ? parsed.slots : DEFAULT_TREE_DRAG_MODEL_LAYERS.slots,
			thresholds: typeof parsed.thresholds === 'boolean' ? parsed.thresholds : DEFAULT_TREE_DRAG_MODEL_LAYERS.thresholds,
			climb: typeof parsed.climb === 'boolean' ? parsed.climb : DEFAULT_TREE_DRAG_MODEL_LAYERS.climb,
		}
	} catch {
		return { ...DEFAULT_TREE_DRAG_MODEL_LAYERS }
	}
}

export function writeTreeDragModelLayers(
	next: BtDragModelLayers,
	storage: Pick<Storage, 'setItem'> | null = typeof window === 'undefined' ? null : window.localStorage,
): void {
	try {
		storage?.setItem(TREE_DRAG_MODEL_LAYERS_KEY, JSON.stringify(next))
	} catch {
		// Same rule as the master switch.
	}
}

export function readTreeDragModelTreeFade(
	storage: Pick<Storage, 'getItem'> | null = typeof window === 'undefined' ? null : window.localStorage,
): number {
	if (!storage) return 0
	try {
		const parsed = Number(JSON.parse(storage.getItem(TREE_DRAG_MODEL_TREE_FADE_KEY) ?? '0'))
		return Number.isFinite(parsed) ? Math.min(0.9, Math.max(0, parsed)) : 0
	} catch {
		return 0
	}
}

export function writeTreeDragModelTreeFade(
	next: number,
	storage: Pick<Storage, 'setItem'> | null = typeof window === 'undefined' ? null : window.localStorage,
): void {
	try {
		storage?.setItem(TREE_DRAG_MODEL_TREE_FADE_KEY, JSON.stringify(next))
	} catch {
		// Same rule as the master switch.
	}
}

/** The master switch every Tree region reads; flipping it repaints them all. */
export const treeDragModelOverlay = atom<boolean>('tree drag model overlay', readTreeDragModelOverlay())

/**
 * How far the REAL tree is faded behind the model, 0–0.9.
 *
 * Separate from the layer switches on purpose: it does not turn any debug
 * information on or off, it turns the subject DOWN so the model can be the
 * foreground. Painted as a paper scrim in `BtDragModelSurface`, which sits
 * above every shape, so this needs no per-shape opacity and never touches the
 * document.
 */
export const treeDragModelTreeFade = atom<number>('tree drag model tree fade', readTreeDragModelTreeFade())

/** The knob the pointer is on; drives the focus view. Session-only. */
export const treeDragModelFocus = atom<BtDragModelFocus>('tree drag model focus', null)

/** The per-layer switches, meaningful only while the master is on. */
export const treeDragModelLayers = atom<BtDragModelLayers>('tree drag model layers', readTreeDragModelLayers())

export function setTreeDragModelOverlay(on: boolean): boolean {
	treeDragModelOverlay.set(on)
	writeTreeDragModelOverlay(on)
	return on
}

export function setTreeDragModelLayers(patch: Partial<BtDragModelLayers>): BtDragModelLayers {
	const next = { ...treeDragModelLayers.get(), ...patch }
	treeDragModelLayers.set(next)
	writeTreeDragModelLayers(next)
	return next
}

export function setTreeDragModelTreeFade(next: number): number {
	const clamped = Math.min(0.9, Math.max(0, next))
	treeDragModelTreeFade.set(clamped)
	writeTreeDragModelTreeFade(clamped)
	return clamped
}

export function setTreeDragModelFocus(next: BtDragModelFocus): BtDragModelFocus {
	treeDragModelFocus.set(next)
	return next
}
