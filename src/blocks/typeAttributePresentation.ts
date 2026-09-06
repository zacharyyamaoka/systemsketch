import { atom } from 'tldraw'

export type TypeChevronPlacement = 'inline' | 'gutter'

export interface TypeAttributePresentation {
  chevronPlacement: TypeChevronPlacement
}

export const TYPE_ATTRIBUTE_PRESENTATION_KEY = 'systemsketch.type-attributes.v1'
export const DEFAULT_TYPE_ATTRIBUTE_PRESENTATION: TypeAttributePresentation = { chevronPlacement: 'inline' }

export function readTypeAttributePresentation(
  storage: Pick<Storage, 'getItem'> | null = typeof window === 'undefined' ? null : window.localStorage,
): TypeAttributePresentation {
  try {
    const placement = JSON.parse(storage?.getItem(TYPE_ATTRIBUTE_PRESENTATION_KEY) ?? '{}')?.chevronPlacement
    return { chevronPlacement: placement === 'gutter' ? 'gutter' : 'inline' }
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
    // A folding placement is browser-local chrome, never a reason to block a board edit.
  }
}

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
