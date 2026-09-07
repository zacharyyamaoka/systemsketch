/**
 * The board-wide pool of named variables a property's expression can
 * reference — one registry per board, not one per panel and not tied to any
 * single Block. Modeled as a shape (this repo's only proven custom-record
 * persistence mechanism — Behavior Tree's XML and Code's document both live
 * the same way) rather than a new document-level record type, but it is a
 * utility record, not something a person draws or arranges: `useVariableRegistry`
 * creates the one instance a board needs the first time anything asks for it,
 * parked well outside normal content, and the real surface is the "Variables"
 * panel (`VariableRegistryPanel`), not the canvas.
 */
import { T, type TLBaseShape } from 'tldraw'

export const VARIABLE_REGISTRY_SHAPE_TYPE = 'variableRegistry' as const

/** Parked far outside any board a person would actually draw on. */
export const VARIABLE_REGISTRY_PARK_X = -1_000_000
export const VARIABLE_REGISTRY_PARK_Y = -1_000_000

export const VariableRegistryEntry = T.object({
	id: T.string,
	name: T.string,
	/** A Python expression string — a plain literal (`0.42`) is the trivial case. */
	expression: T.string,
})
export type VariableRegistryEntry = T.TypeOf<typeof VariableRegistryEntry>

export const VARIABLE_REGISTRY_SHAPE_PROPS = {
	w: T.number,
	h: T.number,
	entries: T.arrayOf(VariableRegistryEntry),
} as const

declare module 'tldraw' {
	export interface TLGlobalShapePropsMap {
		[VARIABLE_REGISTRY_SHAPE_TYPE]: {
			w: number
			h: number
			entries: VariableRegistryEntry[]
		}
	}
}

export type VariableRegistryShape = TLBaseShape<
	typeof VARIABLE_REGISTRY_SHAPE_TYPE,
	{ w: number; h: number; entries: VariableRegistryEntry[] }
>

export function getDefaultVariableRegistryProps(): VariableRegistryShape['props'] {
	return { w: 8, h: 8, entries: [] }
}

/** A short, stable id for a new entry — collision-safe enough for a per-board list a person edits by hand. */
export function makeVariableRegistryEntryId(): string {
	return `var_${Math.random().toString(36).slice(2, 10)}`
}
