import { useEffect, useMemo, useState } from 'react'
import { useEditor } from 'tldraw'

import type { BlockShape } from '../blockModel'
import { EscapeToCancel, regionStyle } from './TypeBabbleParts'
import { AliasSpans } from './TypeMappingParts'
import { findKnownTypeSource, parseTypeMappingSource, resolveTypeToken, type TokenResolution } from './typeMappingShared'

/**
 * V2 — Alias Chips. This is Zach's "that is like the code block view of a
 * pill" made literal: each alias is its own rounded chip — a shrunk-down
 * Pill, `Name = Expr` on one capsule — wrapped in a flowing rail rather than
 * a list of lines. Clicking a chip edits just ITS one line inline, because an
 * alias statement is already atomic (unlike a Type's attribute tree, no
 * per-row editor here forks a nested body into two representations). The `{ }`
 * button in the header is the escape hatch for batching: it swaps the whole
 * rail for one plain textarea over the exact source, for pasting many lines
 * of real Python at once.
 */
export function TypeMappingV2({ shape, top, bottom, selected }: { shape: BlockShape; top: number; bottom: number; selected: boolean }) {
	const editor = useEditor()
	const source = shape.props.attributeSource ?? ''
	const aliases = useMemo(() => parseTypeMappingSource(source), [source])
	const [rawMode, setRawMode] = useState(false)
	const [rawDraft, setRawDraft] = useState(source)
	const [editingLine, setEditingLine] = useState<number | null>(null)
	const [lineDraft, setLineDraft] = useState('')

	useEffect(() => { if (!rawMode) setRawDraft(source) }, [rawMode, source])

	const resolve = (typeName: string): TokenResolution => resolveTypeToken(editor, typeName, shape.id)
	const goto = (typeName: string) => {
		const found = findKnownTypeSource(editor, typeName, shape.id)
		if (!found) return
		editor.select(found.block.id)
		editor.zoomToSelection({ animation: { duration: 260 } })
	}

	const writeSource = (next: string) => {
		if (next === source || editor.getIsReadonly()) return
		editor.markHistoryStoppingPoint('edit type mapping (V2)')
		editor.updateShape<BlockShape>({ id: shape.id, type: shape.type, props: { attributeSource: next } })
	}

	const beginEditLine = (line: number, raw: string) => {
		if (!selected || editor.getIsReadonly()) return
		setLineDraft(raw)
		setEditingLine(line)
	}
	const commitLine = () => {
		if (editingLine === null) return
		const lines = source.replace(/\r\n?/g, '\n').split('\n')
		lines[editingLine] = lineDraft
		setEditingLine(null)
		writeSource(lines.join('\n'))
	}
	const cancelLine = () => setEditingLine(null)
	const addChip = () => {
		if (!selected || editor.getIsReadonly()) return
		const lines = source.replace(/\r\n?/g, '\n').split('\n').filter((line) => line.trim() !== '')
		writeSource([...lines, 'Name = Any'].join('\n'))
	}
	const commitRaw = () => {
		const next = rawDraft.replace(/\r\n?/g, '\n')
		setRawMode(false)
		writeSource(next)
	}

	return (
		<section className="TypeMapping" data-testid="type-mapping-v2" data-selected={selected || undefined} style={regionStyle(top, bottom)}
			onPointerDown={(event) => { if (selected) event.stopPropagation() }}>
			<div className="TypeMapping-heading">
				<span>type aliases</span>
				<button
					type="button"
					aria-label={rawMode ? 'Show chips' : 'Edit as source'}
					onPointerDown={(event) => event.stopPropagation()}
					onClick={() => setRawMode((current) => !current)}
				>{rawMode ? '▦' : '{ }'}</button>
			</div>
			{rawMode ? (
				<textarea
					autoFocus
					className="TypeMapping-editor"
					aria-label="Type mapping source"
					data-testid="type-mapping-v2-source"
					value={rawDraft}
					spellCheck={false}
					onPointerDown={(event) => event.stopPropagation()}
					onChange={(event) => setRawDraft(event.currentTarget.value)}
					onBlur={commitRaw}
					onKeyDownCapture={EscapeToCancel(() => setRawDraft(source))}
				/>
			) : (
				<div className="TypeMappingV2-rail" data-testid="type-mapping-v2-rail">
					{aliases.map((alias) => editingLine === alias.line ? (
						<input
							key={alias.id}
							autoFocus
							className="TypeMappingV2-chipInput"
							data-testid="type-mapping-v2-chip-input"
							value={lineDraft}
							onPointerDown={(event) => event.stopPropagation()}
							onChange={(event) => setLineDraft(event.currentTarget.value)}
							onBlur={commitLine}
							onKeyDown={(event) => {
								if (event.key === 'Enter') { event.preventDefault(); commitLine() }
								if (event.key === 'Escape') { event.preventDefault(); cancelLine() }
							}}
						/>
					) : (
						<button
							key={alias.id}
							type="button"
							className="TypeMappingV2-chip"
							data-testid="type-mapping-v2-chip"
							onPointerDown={(event) => event.stopPropagation()}
							onClick={() => beginEditLine(alias.line, alias.raw)}
						>
							<AliasSpans alias={alias} resolve={resolve} onTokenActivate={goto} />
						</button>
					))}
					<button
						type="button"
						className="TypeMappingV2-addChip"
						aria-label="Add a type alias"
						onPointerDown={(event) => event.stopPropagation()}
						onClick={addChip}
					>+ alias</button>
				</div>
			)}
		</section>
	)
}
