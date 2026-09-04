import { useEffect, useRef, useState } from 'react'
import type { Editor, RecordsDiff, TLRecord } from 'tldraw'

import { getBoardDiagnosticsModel, type BoardDiagnosticsModel } from './diagnosticsModel'

const DIAGNOSTIC_SHAPE_TYPES = new Set(['block', 'branch', 'loop', 'connection'])

function recordType(record: TLRecord): string | undefined {
	return 'type' in record && typeof record.type === 'string' ? record.type : undefined
}

function isDiagnosticShape(record: TLRecord): boolean {
	return record.typeName === 'shape' && DIAGNOSTIC_SHAPE_TYPES.has(recordType(record) ?? '')
}

function isDiagnosticBinding(record: TLRecord): boolean {
	return record.typeName === 'binding' && recordType(record) === 'connection'
}

function addedOrRemovedRecordMatters(record: TLRecord): boolean {
	return record.typeName === 'page' || isDiagnosticShape(record) || isDiagnosticBinding(record)
}

/**
 * Whether a document-store flush can change the derived Problems model.
 *
 * tldraw emits a shape update on every frame of a drag. Those records reuse
 * their immutable `props` object and change only transform fields, none of
 * which the diagnostics analyzer reads. Treating every flush as semantic made
 * the always-visible Problems badge rebuild the whole board graph at 60 Hz.
 */
export function boardDiagnosticsMayHaveChanged(changes: RecordsDiff<TLRecord>): boolean {
	for (const record of Object.values(changes.added)) {
		if (addedOrRemovedRecordMatters(record)) return true
	}
	for (const record of Object.values(changes.removed)) {
		if (addedOrRemovedRecordMatters(record)) return true
	}
	for (const [before, after] of Object.values(changes.updated)) {
		if (before.typeName === 'page' || after.typeName === 'page') return true

		const beforeShape = isDiagnosticShape(before)
		const afterShape = isDiagnosticShape(after)
		if (beforeShape || afterShape) {
			if (!beforeShape || !afterShape || recordType(before) !== recordType(after)) return true
			if (before.typeName !== 'shape' || after.typeName !== 'shape') return true
			const shapeType = recordType(after)
			if (
				before.parentId !== after.parentId
				|| before.index !== after.index
				// A cable's diagnostic meaning lives in its bindings and ancestry.
				// Its start/end geometry changes on every pointer frame and is paint,
				// not a new graph fact.
				|| (shapeType !== 'connection' && before.props !== after.props)
			) return true
		}

		const beforeBinding = isDiagnosticBinding(before)
		const afterBinding = isDiagnosticBinding(after)
		if (beforeBinding || afterBinding) {
			if (!beforeBinding || !afterBinding) return true
			if (before.typeName !== 'binding' || after.typeName !== 'binding') return true
			if (
				before.fromId !== after.fromId
				|| before.toId !== after.toId
				|| before.props !== after.props
			) return true
		}
	}
	return false
}

/**
 * Keep one live Problems projection without enrolling camera and transform
 * updates as dependencies. Semantic document changes still refresh in the same
 * store flush; translation, rotation, opacity, and selection do no analyzer work.
 */
export function useBoardDiagnosticsModel(editor: Editor): BoardDiagnosticsModel {
	const [model, setModel] = useState(() => getBoardDiagnosticsModel(editor))
	const modelEditor = useRef(editor)

	useEffect(() => {
		if (modelEditor.current !== editor) {
			modelEditor.current = editor
			setModel(getBoardDiagnosticsModel(editor))
		}
		return editor.store.listen((entry) => {
			if (!boardDiagnosticsMayHaveChanged(entry.changes)) return
			setModel(getBoardDiagnosticsModel(editor))
		}, { scope: 'document' })
	}, [editor])

	return model
}
