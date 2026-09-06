import type { BlockShape } from '../blockModel'
import { TypeBabbleV1Engine } from './TypeBabbleV1'

/**
 * Two style-only sub-variants of V1, requested after seeing it live: the
 * chosen shell (segmented toggle, recursive expand, reactive board index)
 * stays identical — only the chevron's side and the nested-guide treatment
 * change, so the comparison is exactly the two axes Zach asked about and
 * nothing else.
 */
export function TypeBabbleV1AltA(props: { shape: BlockShape; top: number; bottom: number; selected: boolean }) {
	return <TypeBabbleV1Engine {...props} chevronPlacement="leading" guideStyle="rail" testId="type-babble-v1-alt-a" />
}

export function TypeBabbleV1AltB(props: { shape: BlockShape; top: number; bottom: number; selected: boolean }) {
	return <TypeBabbleV1Engine {...props} chevronPlacement="trailing" guideStyle="dotted" testId="type-babble-v1-alt-b" />
}

/**
 * Three more chevron/guide variants, this time informed by a short prior-art
 * pass (VS Code, Finder, Explorer, GitHub, Fluent 2, Zach's own
 * [[C - Information Scent]]) rather than picked freely — see
 * `docs/build_chevron_guide_babble.py` for the citations behind each call.
 */

/** The prior-art recommendation: leading chevron (the near-universal
 * placement across every mainstream file/tree browser), always visible
 * (hiding the only expand affordance behind hover measurably hurts
 * discoverability per NN/g), and a faint muted guide rather than an
 * accent-tinted one — VS Code's own indent-guide default is low-contrast
 * specifically so it orients without competing with real content. */
export function TypeBabbleV1PriorArt(props: { shape: BlockShape; top: number; bottom: number; selected: boolean }) {
	return (
		<TypeBabbleV1Engine
			{...props}
			chevronPlacement="leading"
			chevronVisibility="always"
			chevronGlyph="triangle"
			guideStyle="muted-rail"
			testId="type-babble-v1-prior-art"
		/>
	)
}

/** The modern-flat trade-off some current tools make anyway (a cleaner
 * default look, at a discoverability cost the prior-art variant avoids) —
 * included to show the trade-off live, not as the recommendation. */
export function TypeBabbleV1HoverReveal(props: { shape: BlockShape; top: number; bottom: number; selected: boolean }) {
	return (
		<TypeBabbleV1Engine
			{...props}
			chevronPlacement="leading"
			chevronVisibility="hover"
			chevronGlyph="triangle"
			guideStyle="muted-rail"
			testId="type-babble-v1-hover-reveal"
		/>
	)
}

/** A non-triangle disclosure indicator (filled/hollow dot) — tests whether
 * departing from the triangle every mainstream tree browser uses still
 * reads as "this expands" at a glance. */
export function TypeBabbleV1DotToggle(props: { shape: BlockShape; top: number; bottom: number; selected: boolean }) {
	return (
		<TypeBabbleV1Engine
			{...props}
			chevronPlacement="leading"
			chevronVisibility="always"
			chevronGlyph="dot"
			guideStyle="muted-rail"
			testId="type-babble-v1-dot-toggle"
		/>
	)
}
