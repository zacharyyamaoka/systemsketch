/**
 * How the `state` vocabulary is painted, and the switch that chooses.
 *
 * A diff has to be legible at two distances at once. From across the board a
 * reader is asking "is anything wrong here at all" — and on a conformance case
 * that passes, the honest answer has to look like nothing happened. Up close
 * the same marks have to say which port is missing, and say it *in the row it
 * is missing from*, because free-floating annotation stops scaling at about
 * three changes.
 *
 * Those two demands pull opposite ways, so the paint is a variant, not a
 * constant. Five of them are shipped and every one is drawn by this app's own
 * renderer — a class on the Block face and a stroke on the cable, nothing
 * bespoke and no second canvas. The default is the one that won the comparison;
 * the others stay because the judgement is a taste call that may be revisited,
 * and because a colour-blind or printed review wants `ghost-weight`.
 *
 * This is a presentation preference, exactly like `cablePresentation`: it lives
 * in localStorage, never in the document, so switching it can never change what
 * a board means.
 */
import { atom } from 'tldraw'

export const DIFF_VARIANTS = [
	/**
	 * R1 · the old value and the new value sit in one bar, as two chips: the
	 * former washed red, the current washed green, and inside each of them the
	 * runs that actually differ filled solid. That last part is the whole idea
	 * and it is GitHub's: on a replace, both sides are tokenized and only the
	 * changed tokens are highlighted, so `run_inference` → `run_predict` puts
	 * ink on `inference` and `predict` and leaves `run_` alone.
	 *
	 * A moved or resized Block gets a dashed outline at its former pose; a
	 * modified cable gets the same chip pair at its midpoint. Colour carries,
	 * a hairline strike on the red chip reinforces.
	 */
	'was-now',
	/**
	 * R2 · the unified-diff layout. A changed row splits into two half-height
	 * lines — the old value above on a red wash, the new below on a green one —
	 * exactly as a `git diff` hunk stacks `-` over `+`. The most familiar shape
	 * in the set and the most expensive: it doubles the height of every changed
	 * row, which a fixed-pitch port lane has to be told about.
	 */
	'stacked',
	/**
	 * R3 · no chips, no containers, no arrow. The old and new values sit
	 * adjacent in the row and only the *tokens* that differ carry ink. The
	 * least furniture of anything that still shows both values, and the hardest
	 * to read when a name changes completely rather than in one syllable.
	 */
	'token-only',
	/**
	 * R4 · the face is never touched. One compact badge per Block carries the
	 * counts and the pose delta (`↔ +40, −12`), and the before/after pairs are a
	 * selection away. Quietest at board zoom, and the only variant that says
	 * nothing at all about *what* a field became without a click.
	 */
	'delta-badge',
	/**
	 * R5 · no hue anywhere. The former value is set back and struck, the new one
	 * is underlined, the pose ghost is a hairline. Survives a colour-blind
	 * reader and a black-and-white print, which is the one thing every other
	 * variant in this list needs colour for.
	 */
	'ghost-weight',
	/**
	 * R6 · Figma's Compare overlay and Onshape's blend, on one board. A scrub
	 * crossfades the before state into the after state in place — at `0` the
	 * ghosts are solid and the additions absent, at `1` the reverse. The pose
	 * ghost is what makes this one earn its keep: a Block that moved animates
	 * between its two positions as the scrub runs, which is the treatment small
	 * movement is easiest to see under.
	 */
	'blend',
] as const
export type DiffVariant = (typeof DIFF_VARIANTS)[number]

/**
 * How a variant answers each of the three questions the vocabulary has to.
 *
 * Kept as data rather than as branches scattered through the renderers, so a
 * variant is one row to read and the stylesheet, the Block face and the cable
 * cannot drift into disagreeing about what `token-only` means.
 */
export interface DiffVariantTraits {
	/** How a changed text field shows its former value. */
	readonly text: 'chips' | 'stacked' | 'tokens' | 'badge'
	/** How a moved or resized Block shows its former pose. */
	readonly pose: 'ghost' | 'badge' | 'none'
	/** How a MODIFIED cable shows what changed. Added and removed are the line. */
	readonly cable: 'chip' | 'line' | 'endpoints'
	/** Whether colour is allowed to be a channel at all. */
	readonly monochrome: boolean
}

export const DIFF_VARIANT_TRAITS: Readonly<Record<DiffVariant, DiffVariantTraits>> = {
	'was-now': { text: 'chips', pose: 'ghost', cable: 'chip', monochrome: false },
	stacked: { text: 'stacked', pose: 'ghost', cable: 'chip', monochrome: false },
	'token-only': { text: 'tokens', pose: 'none', cable: 'line', monochrome: false },
	'delta-badge': { text: 'badge', pose: 'badge', cable: 'endpoints', monochrome: false },
	'ghost-weight': { text: 'chips', pose: 'ghost', cable: 'line', monochrome: true },
	blend: { text: 'chips', pose: 'ghost', cable: 'chip', monochrome: false },
}

export function diffVariantTraits(variant: DiffVariant): DiffVariantTraits {
	return DIFF_VARIANT_TRAITS[variant] ?? DIFF_VARIANT_TRAITS[DEFAULT_DIFF_VARIANT]
}

/** Where the `blend` scrub sits: `0` is the before board, `1` the after. */
export const DEFAULT_DIFF_BLEND = 1

/**
 * `was-now`, and the reason is the feedback that killed round 1's pick.
 *
 * `diff-gutter` won round 1 on a measurement that, read honestly, only ever
 * separated the two variants that tint a whole card from the six that do not:
 * the painted-area metric scored `0.000` for `diff-gutter`, `ghost-weight`,
 * `badge-only`, `blend`, `edge-rail` and `moved-ghost` alike, at three changes
 * and at thirty. It could not rank them, and the ranking that followed was
 * taste presented as arithmetic.
 *
 * What it could not measure at all is the thing that turned out to matter: a
 * gutter glyph says a row changed and cannot say what it became. Round 1 had
 * exactly one field in the whole product able to show a former value, and it
 * showed it by striking it out. The reviewer asked for the code idiom instead —
 * the old value highlighted red, the new one green, in the same bar — and that
 * is a request for data the schema did not carry, not for a different paint.
 *
 * So the default is the variant built on the pairs: colour fills the changed
 * runs, the strike drops to a reinforcement, and the ink still costs one chip
 * per changed FIELD rather than one tint per changed card, which is the one
 * property of the round-1 winner worth keeping.
 */
export const DEFAULT_DIFF_VARIANT: DiffVariant = 'was-now'

export const DIFF_PRESENTATION_KEY = 'systemsketch.diff-presentation.v1'

export interface DiffPresentation {
	variant: DiffVariant
	/** Only `blend` reads it; kept on the whole preference so a scrub survives a variant switch. */
	blend: number
}

export function isDiffVariant(value: unknown): value is DiffVariant {
	return typeof value === 'string' && (DIFF_VARIANTS as readonly string[]).includes(value)
}

/** A scrub that arrived from storage or a caller is clamped, never trusted. */
export function clampDiffBlend(value: unknown): number {
	const blend = typeof value === 'number' ? value : Number.NaN
	if (!Number.isFinite(blend)) return DEFAULT_DIFF_BLEND
	return Math.min(1, Math.max(0, blend))
}

export function readDiffPresentation(
	storage: Pick<Storage, 'getItem'> | null = typeof window === 'undefined' ? null : window.localStorage,
): DiffPresentation {
	if (!storage) return { variant: DEFAULT_DIFF_VARIANT, blend: DEFAULT_DIFF_BLEND }
	try {
		const parsed = JSON.parse(storage.getItem(DIFF_PRESENTATION_KEY) ?? '{}')
		return {
			variant: isDiffVariant(parsed?.variant) ? parsed.variant : DEFAULT_DIFF_VARIANT,
			blend: clampDiffBlend(parsed?.blend),
		}
	} catch {
		return { variant: DEFAULT_DIFF_VARIANT, blend: DEFAULT_DIFF_BLEND }
	}
}

export function writeDiffPresentation(
	next: DiffPresentation,
	storage: Pick<Storage, 'setItem'> | null = typeof window === 'undefined' ? null : window.localStorage,
): void {
	try {
		storage?.setItem(DIFF_PRESENTATION_KEY, JSON.stringify(next))
	} catch {
		// A presentation preference is a convenience; a full store must not block drawing.
	}
}

/** The live value every stated primitive reads; changing it repaints them all. */
export const diffPresentation = atom<DiffPresentation>('diff presentation', readDiffPresentation())

export function setDiffVariant(variant: DiffVariant): DiffPresentation {
	const next = { ...diffPresentation.get(), variant }
	diffPresentation.set(next)
	writeDiffPresentation(next)
	return next
}

/** Move the before/after scrub. Paint only: the document is never written. */
export function setDiffBlend(blend: number): DiffPresentation {
	const next = { ...diffPresentation.get(), blend: clampDiffBlend(blend) }
	diffPresentation.set(next)
	writeDiffPresentation(next)
	return next
}

/**
 * How present each side is at the current scrub.
 *
 * A state that only exists on the before board fades out as the scrub runs
 * forward; one that only exists on the after board fades in. Everything else
 * is on both sides and never moves — which is the whole point of blending one
 * marked board rather than crossfading two renders of two documents.
 */
export function diffBlendOpacity(state: string, blend: number): number | undefined {
	const t = clampDiffBlend(blend)
	if (state === 'removed') return 1 - t
	if (state === 'added') return t
	return undefined
}

/**
 * The glyph a diff gutter puts beside a row. Deliberately the three a person
 * already reads in `git diff` and in an editor's change bar.
 */
export function diffGutterGlyph(state: string): string {
	if (state === 'added') return '+'
	if (state === 'removed') return '−'
	if (state === 'changed') return '~'
	if (state === 'error') return '×'
	if (state === 'warning') return '!'
	return ''
}

/**
 * The headline, at semantic altitude. Never "27 raw records changed": a person
 * asks how many ports and cables moved, and the answer has to be in those
 * nouns or it is a rendering of the storage layer.
 */
export function describeDiffCounts(counts: {
	added: number
	removed: number
	changed: number
}): string {
	const parts: string[] = []
	if (counts.added) parts.push(`${counts.added} added`)
	if (counts.removed) parts.push(`${counts.removed} missing`)
	if (counts.changed) parts.push(`${counts.changed} changed`)
	return parts.join(' · ')
}

/**
 * The ink a stated cable is drawn in.
 *
 * A cable is an SVG stroke set as an attribute, so unlike the Block's HTML face
 * it cannot be repainted from a stylesheet without fighting the presentation
 * attribute. It reads the same tokens the Block face does, and the monochrome
 * variant answers in greys so a colour-blind or printed review still separates
 * a ghost from a live cable by weight and dash alone.
 */
export function diffCableInk(
	state: string,
	variant: DiffVariant,
	normal: string,
	mark: CableMarkKind = 'none',
): string {
	if (state === 'normal' && mark === 'none') return normal
	if (diffVariantTraits(variant).monochrome) {
		return state === 'removed' ? 'var(--ss-text-faint)' : 'var(--ss-text)'
	}
	if (state === 'added') return 'var(--ss-success)'
	if (state === 'removed' || state === 'error') return 'var(--ss-danger)'
	// A rewired cable is one cable that landed somewhere else, so it is drawn
	// once, in the amber that means "the same thing, differently" — never as a
	// red line beside a green one, which is what an ADDED cable plus a REMOVED
	// cable looks like and is a materially different finding.
	if (mark === 'rewired') return 'var(--ss-warning)'
	// A cable whose LABEL changed has not changed course. Recolouring its whole
	// run would make a renamed delay indistinguishable from a rewire at any
	// distance where the chip is unreadable, so the line keeps its own ink and
	// the chip at the midpoint carries the change — unless the variant has
	// deliberately given up the chip.
	if (mark === 'modified') {
		return diffVariantTraits(variant).cable === 'line' ? 'var(--ss-warning)' : normal
	}
	return 'var(--ss-warning)'
}

/**
 * Which of the four cable findings this is.
 *
 * The contract lists `added · removed · modified · rewired` and the reviewer
 * asked for each to be tellable from the others. Three of them are the state
 * enum; `rewired` is not, because a cable that moved from one port to another
 * is still present, still `changed`, and only its endpoint field says so. That
 * is why the terminal pair rides in `fieldDiffs` — the operation is unreachable
 * without it, and lumping it into `modified` loses the distinction the reviewer
 * specifically asked for.
 */
export type CableMarkKind = 'none' | 'added' | 'removed' | 'modified' | 'rewired'

export const CABLE_TERMINAL_PATHS = ['start', 'end'] as const

/**
 * Which terminal, if any, a field path is about.
 *
 * Deliberately a SEGMENT match rather than a leaf match. A terminal's field is
 * naturally written `props.bindings.end.portId`, whose leaf is `portId` — the
 * one part of the path that says nothing about which end moved. Matching the
 * leaf silently classified every rewire as a plain modification.
 */
export function cableTerminalOfPath(path: string): 'start' | 'end' | undefined {
	const segments = path.split('.').flatMap((segment) => segment.split('['))
	return CABLE_TERMINAL_PATHS.find((terminal) => segments.includes(terminal))
}

export function cableMarkKind(
	state: string,
	fieldDiffs: readonly { path: string }[] | undefined,
): CableMarkKind {
	if (state === 'added') return 'added'
	if (state === 'removed') return 'removed'
	const fields = fieldDiffs ?? []
	// Rewired outranks modified: a terminal that moved is the more specific
	// reading, and a rewire that also renamed its pill is still a rewire.
	if (fields.some((entry) => cableTerminalOfPath(entry.path))) return 'rewired'
	if (fields.length > 0) return 'modified'
	return state === 'changed' || state === 'error' || state === 'warning' ? 'modified' : 'none'
}

/** Which terminals of a rewired cable actually moved. */
export function rewiredTerminals(
	fieldDiffs: readonly { path: string }[] | undefined,
): readonly ('start' | 'end')[] {
	return CABLE_TERMINAL_PATHS.filter((terminal) =>
		(fieldDiffs ?? []).some((entry) => cableTerminalOfPath(entry.path) === terminal))
}

/** A ghost cable is dashed; every other state keeps the cable's own cadence. */
export const DIFF_GHOST_DASHARRAY = '7 6'

export function diffCableDashArray(state: string): string | undefined {
	return state === 'removed' ? DIFF_GHOST_DASHARRAY : undefined
}

/** A ghost is drawn back, not away: still readable, plainly not present. */
export function diffCableOpacity(state: string): number {
	return state === 'removed' ? 0.55 : 1
}
