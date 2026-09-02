/**
 * One table for what a port's declared type looks like.
 *
 * The canvas paints a port with an exact hex; detach has to reproduce that with
 * a stock tldraw palette colour, which has no `#c08520`. Those are two answers
 * to the same question, so the question is asked once here and the two renderers
 * read the same family. Splitting them is how a detached copy drifts from the
 * Block it was standing next to a frame earlier.
 */
import type { TLDefaultColorStyle } from 'tldraw'

export const PORT_COLOR_FAMILIES = [
	'image',
	'text',
	'model',
	'number',
	'latent',
	'any',
] as const
export type PortColorFamily = (typeof PORT_COLOR_FAMILIES)[number]

/** Ports carry free text, so this is a normalisation, not a lookup. */
export function portColorFamily(type: string): PortColorFamily {
	const normalized = type.trim().toLowerCase()
	if (normalized === 'image') return 'image'
	if (normalized === 'text' || normalized === 'str' || normalized === 'string') return 'text'
	if (normalized === 'model') return 'model'
	if (normalized === 'number' || normalized === 'int' || normalized === 'float') return 'number'
	if (normalized === 'latent') return 'latent'
	return 'any'
}

const FAMILY_HEX: Record<PortColorFamily, string> = {
	image: '#c060e0',
	text: '#4caf50',
	model: '#2196f3',
	number: '#9e9e9e',
	latent: '#ff9800',
	any: '#c08520',
}

/**
 * The nearest stock tldraw colour for each family.
 *
 * These are approximations by construction — the stock palette cannot reach
 * `#c08520` — and that inexactness is one of the two things detach declares it
 * gives up, alongside a lucide glyph having no primitive equivalent.
 */
const FAMILY_TLDRAW: Record<PortColorFamily, TLDefaultColorStyle> = {
	image: 'violet',
	text: 'green',
	model: 'blue',
	number: 'grey',
	latent: 'orange',
	any: 'yellow',
}

/** The exact hex the live canvas paints. */
export function portColor(type: string): string {
	return FAMILY_HEX[portColorFamily(type)]
}

/** The nearest stock tldraw colour, for a detached copy. */
export function portTldrawColor(type: string): TLDefaultColorStyle {
	return FAMILY_TLDRAW[portColorFamily(type)]
}
