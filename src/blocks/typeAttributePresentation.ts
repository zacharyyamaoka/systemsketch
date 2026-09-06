/**
 * Where a Type's fold chevrons sit, and the one live presentation switch.
 *
 * Inline keeps a chevron beside the text it folds, hidden until the row is
 * hovered — the default, because it reads as prose. Gutter aligns every
 * chevron to a fixed left column instead, the way a code editor's fold
 * markers never move with the line's own indent.
 */
import { atom } from 'tldraw'

export const TYPE_ATTRIBUTE_PRESENTATION_KEY = 'systemsketch.type-attributes.v1'

export type TypeChevronPlacement = 'inline' | 'gutter'

export interface TypeAttributePresentation {
	chevronPlacement: TypeChevronPlacement
}

export const DEFAULT_TYPE_ATTRIBUTE_PRESENTATION: TypeAttributePresentation = { chevronPlacement: 'inline' }

export function readTypeAttributePresentation(
	storage: Pick<Storage, 'getItem'> | null = typeof window === 'undefined' ? null : window.localStorage,
): TypeAttributePresentation {
	if (!storage) return { ...DEFAULT_TYPE_ATTRIBUTE_PRESENTATION }
	try {
		const parsed = JSON.parse(storage.getItem(TYPE_ATTRIBUTE_PRESENTATION_KEY) ?? '{}')
		return {
			chevronPlacement: parsed?.chevronPlacement === 'gutter' ? 'gutter' : 'inline',
		}
	} catch {
		return { ...DEFAULT_TYPE_ATTRIBUTE_PRESENTATION }
	}
}

export function writeTypeAttributePresentation(
	next: TypeAttributePresentation,
	storage: Pick<Storage, 'setItem'> | null = typeof window === 'undefined' ? null : window.localStorage,
): void {
	try {
		storage?.setItem(TYPE_ATTRIBUTE_PRESENTATION_KEY, JSON.stringify(next))
	} catch {
		// A fold-chevron placement is a convenience; a full store must not block drawing.
	}
}

/** The live value every Type reads; changing it repaints them all. */
export const typeAttributePresentation = atom<TypeAttributePresentation>(
	'type attribute presentation',
	readTypeAttributePresentation(),
)

export function setTypeChevronPlacement(chevronPlacement: TypeChevronPlacement): TypeAttributePresentation {
	const next = { ...typeAttributePresentation.get(), chevronPlacement }
	typeAttributePresentation.set(next)
	writeTypeAttributePresentation(next)
	return next
}
