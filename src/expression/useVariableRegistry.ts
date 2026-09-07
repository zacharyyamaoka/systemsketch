import { useMemo } from 'react'
import { createShapeId, useValue, type Editor, type TLShapeId } from 'tldraw'
import {
	VARIABLE_REGISTRY_PARK_X,
	VARIABLE_REGISTRY_PARK_Y,
	VARIABLE_REGISTRY_SHAPE_TYPE,
	getDefaultVariableRegistryProps,
	makeVariableRegistryEntryId,
	type VariableRegistryEntry,
	type VariableRegistryShape,
} from './variableRegistryModel'

/** The one registry shape anywhere in the document, regardless of which page it landed on. */
function findRegistryShape(editor: Editor): VariableRegistryShape | null {
	for (const record of editor.store.allRecords()) {
		if (record.typeName === 'shape' && record.type === VARIABLE_REGISTRY_SHAPE_TYPE) {
			return record as VariableRegistryShape
		}
	}
	return null
}

export interface VariableRegistryApi {
	entries: readonly VariableRegistryEntry[]
	/** `{name: expression}` — referentially stable when `entries` hasn't changed, safe to pass straight to `evaluateExpression`. */
	registryMap: Record<string, string>
	/** Create-or-update by name (the "type an undefined name, then give it a value" flow). */
	setEntryValue(name: string, expression: string): void
	renameEntry(id: string, name: string): void
	removeEntry(id: string): void
	readOnly: boolean
}

/**
 * Read/write the board's one Variable Registry, creating it (parked off any
 * real content) the first time anything needs it. Every caller — a property
 * field's autocomplete, a Block's "Variables used here" section, the
 * Variables panel itself — shares this one hook so there is never a second,
 * out-of-sync copy of the registry's contents.
 *
 * Takes `editor` as a parameter rather than reading it via `useEditor()`:
 * `BlockInspectorContent`/`PortSection` are presentational components mounted
 * in unit tests and development profiles with no live `TldrawEditor` context
 * at all (see `BlockInspectorContentProps.historyPanel`'s doc comment for the
 * same constraint) — this hook is only ever called where a real `editor` is
 * already in hand (`EditorBlockInspector`, `VariableRegistryPanel`), and the
 * result is threaded down as a plain prop from there.
 */
export function useVariableRegistry(editor: Editor): VariableRegistryApi {
	const readOnly = useValue('registry readonly', () => editor.getIsReadonly(), [editor])
	const shapeId = useValue(
		'variable registry shape id',
		() => findRegistryShape(editor)?.id ?? null,
		[editor],
	)
	const entries = useValue(
		'variable registry entries',
		() => (shapeId ? (editor.getShape<VariableRegistryShape>(shapeId)?.props.entries ?? []) : []),
		[editor, shapeId],
	)

	const registryMap = useMemo(
		() => Object.fromEntries(entries.map((entry) => [entry.name, entry.expression])),
		[entries],
	)

	function ensureShapeId(): TLShapeId {
		const existing = findRegistryShape(editor)
		if (existing) return existing.id
		const id = createShapeId()
		editor.createShape<VariableRegistryShape>({
			id,
			type: VARIABLE_REGISTRY_SHAPE_TYPE,
			x: VARIABLE_REGISTRY_PARK_X,
			y: VARIABLE_REGISTRY_PARK_Y,
			props: getDefaultVariableRegistryProps(),
		})
		return id
	}

	function withEntries(mutate: (current: VariableRegistryEntry[]) => VariableRegistryEntry[]) {
		if (readOnly) return
		const id = ensureShapeId()
		const current = editor.getShape<VariableRegistryShape>(id)
		if (!current) return
		editor.updateShape<VariableRegistryShape>({
			id,
			type: VARIABLE_REGISTRY_SHAPE_TYPE,
			props: { entries: mutate(current.props.entries) },
		})
	}

	return {
		entries,
		registryMap,
		readOnly,
		setEntryValue: (name, expression) => {
			const trimmed = name.trim()
			if (!trimmed) return
			editor.markHistoryStoppingPoint('set variable value')
			withEntries((current) => {
				const found = current.find((entry) => entry.name === trimmed)
				if (found) {
					return current.map((entry) => (entry.id === found.id ? { ...entry, expression } : entry))
				}
				return [...current, { id: makeVariableRegistryEntryId(), name: trimmed, expression }]
			})
		},
		renameEntry: (id, name) => {
			const trimmed = name.trim()
			if (!trimmed) return
			editor.markHistoryStoppingPoint('rename variable')
			withEntries((current) => current.map((entry) => (entry.id === id ? { ...entry, name: trimmed } : entry)))
		},
		removeEntry: (id) => {
			editor.markHistoryStoppingPoint('remove variable')
			withEntries((current) => current.filter((entry) => entry.id !== id))
		},
	}
}

/** For a presentational context with no live editor at all (unit tests, development profiles). */
export const EMPTY_VARIABLE_REGISTRY: VariableRegistryApi = {
	entries: [],
	registryMap: {},
	readOnly: true,
	setEntryValue: () => {},
	renameEntry: () => {},
	removeEntry: () => {},
}
