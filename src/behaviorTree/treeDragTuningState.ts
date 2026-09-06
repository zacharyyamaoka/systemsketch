/**
 * The Drag Model Tuner's live parameter set.
 *
 * WHY this exists (Zach's 2026-09-06 review of the dual-drag work): the same
 * hysteresis logic produces very different REAL travel costs by orientation,
 * because its displacement term scales with the dragged member's cross-axis
 * extent — a top-down tree's cross axis is card WIDTH (~230px at 1×), a
 * left-right tree's is card HEIGHT (~90px). His two recordings measure it:
 * one swap took ~68 page px on `right` and 150–370 px per gesture on `down`
 * (both at spacing 2, which doubles the gap term too). Rather than guessing a
 * new constant, every parameter that affects feel is a live knob here, the
 * debug overlay draws the resulting boundaries, and a copy button exports the
 * values so tuned numbers can travel back as defaults.
 *
 * The knobs, and what today's shipped behavior is in them:
 *   - claimDistancePx (3): pointer travel before the dnd lane claims the
 *     gesture from tldraw (strictly under tldraw's 4px drag threshold).
 *   - capturePaddingPx (0): extra travel the dragged LEADING edge needs past
 *     a ghost slot's center before capturing it. Negative captures earlier.
 *   - releaseFactor (1) and releasePaddingPx (0): the deadband. A captured
 *     slot releases only when the dragged TRAILING edge passes
 *     center + releaseFactor × (draggedExtent + gap) + releasePaddingPx.
 *     Factor 1 / padding 0 is the shipped extent-scaled deadband;
 *     factor 0 / padding N is a fixed-px deadband — the direct test of
 *     Zach's "it's the rectangle's dimensions" hypothesis.
 *   - climbSlots (1): how many slot-extents past a container's real bound
 *     the pointer must travel before the ancestor climb re-parents upward.
 *   - zoneOverhangSlots (1): how far past a depth strip's outer ends its
 *     outermost containers still claim the pointer.
 *
 * Persisted per browser; defaults reproduce shipped behavior bit-for-bit
 * (the untouched `dragListReorder` unit suite is the proof).
 */
import { atom } from 'tldraw'

export const BT_DRAG_TUNING_KEY = 'systemsketch.tree-drag-tuning.v1'

export interface BtDragTuning {
	claimDistancePx: number
	capturePaddingPx: number
	releaseFactor: number
	releasePaddingPx: number
	climbSlots: number
	zoneOverhangSlots: number
}

export const DEFAULT_BT_DRAG_TUNING: BtDragTuning = {
	claimDistancePx: 3,
	capturePaddingPx: 0,
	releaseFactor: 1,
	releasePaddingPx: 0,
	climbSlots: 1,
	zoneOverhangSlots: 1,
}

function sanitize(candidate: unknown): BtDragTuning {
	const raw = (candidate ?? {}) as Partial<Record<keyof BtDragTuning, unknown>>
	const number = (key: keyof BtDragTuning) =>
		typeof raw[key] === 'number' && Number.isFinite(raw[key]) ? (raw[key] as number) : DEFAULT_BT_DRAG_TUNING[key]
	return {
		claimDistancePx: Math.max(1, number('claimDistancePx')),
		capturePaddingPx: number('capturePaddingPx'),
		releaseFactor: Math.max(0, number('releaseFactor')),
		releasePaddingPx: number('releasePaddingPx'),
		climbSlots: Math.max(0, number('climbSlots')),
		zoneOverhangSlots: Math.max(0, number('zoneOverhangSlots')),
	}
}

export function readBtDragTuning(
	storage: Pick<Storage, 'getItem'> | null = typeof window === 'undefined' ? null : window.localStorage,
): BtDragTuning {
	if (!storage) return { ...DEFAULT_BT_DRAG_TUNING }
	try {
		return sanitize(JSON.parse(storage.getItem(BT_DRAG_TUNING_KEY) ?? '{}'))
	} catch {
		return { ...DEFAULT_BT_DRAG_TUNING }
	}
}

export function writeBtDragTuning(
	next: BtDragTuning,
	storage: Pick<Storage, 'setItem'> | null = typeof window === 'undefined' ? null : window.localStorage,
): void {
	try {
		storage?.setItem(BT_DRAG_TUNING_KEY, JSON.stringify(next))
	} catch {
		// A tuning preference is a convenience; a full store must not block dragging.
	}
}

/** The live value the claim listener, drag sessions and overlay all read. */
export const btDragTuning = atom<BtDragTuning>('behavior tree drag tuning', readBtDragTuning())

export function setBtDragTuning(patch: Partial<BtDragTuning>): BtDragTuning {
	const next = sanitize({ ...btDragTuning.get(), ...patch })
	btDragTuning.set(next)
	writeBtDragTuning(next)
	return next
}

export function resetBtDragTuning(): BtDragTuning {
	const next = { ...DEFAULT_BT_DRAG_TUNING }
	btDragTuning.set(next)
	writeBtDragTuning(next)
	return next
}

/** The paste-able export the tuner's Copy button produces. */
export function formatBtDragTuningExport(tuning: BtDragTuning, readouts: string): string {
	return [
		'SystemSketch drag-model tuning (paste back to make these the defaults)',
		JSON.stringify({ version: 1, tuning }, null, 2),
		readouts ? `Measured with these values:\n${readouts}` : '',
	].filter(Boolean).join('\n')
}
