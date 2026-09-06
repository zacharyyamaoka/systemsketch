import { useEffect, useMemo, useState } from 'react'
import { useEditor } from 'tldraw'

import type { BlockShape } from '../blockModel'
import { regionStyle } from './TypeBabbleParts'
import { AliasSpans, TypeMappingCodeEditor } from './TypeMappingParts'
import { findKnownTypeSource, parseTypeMappingSource, resolveTypeToken, type TokenResolution } from './typeMappingShared'

type Level = 'collapsed' | 'pretty' | 'source'

/**
 * V4 — Collapsed Ladder. Answers "batch many compactly" head-on: the default
 * state is a single summary line — "5 type aliases" — with no lines drawn at
 * all, generalising the density idea Block's own simple/port/expanded sizes
 * already use, but applied to THIS region instead of the whole card. Opening
 * it steps to a resolved, clickable list; a second `{ }` step reveals the raw
 * source. Three rungs, not a binary switch — a board with forty mapped names
 * can stay forty one-line summaries until a reader actually wants one open.
 */
export function TypeMappingV4({ shape, top, bottom, selected }: { shape: BlockShape; top: number; bottom: number; selected: boolean }) {
	const editor = useEditor()
	const source = shape.props.attributeSource ?? ''
	const aliases = useMemo(() => parseTypeMappingSource(source), [source])
	const [level, setLevel] = useState<Level>('pretty')
	const [draft, setDraft] = useState(source)

	useEffect(() => { if (level !== 'source') setDraft(source) }, [source, level])

	const resolve = (typeName: string): TokenResolution => resolveTypeToken(editor, typeName, shape.id)
	const goto = (typeName: string) => {
		const found = findKnownTypeSource(editor, typeName, shape.id)
		if (!found) return
		editor.select(found.block.id)
		editor.zoomToSelection({ animation: { duration: 260 } })
	}
	const commit = () => {
		const next = draft.replace(/\r\n?/g, '\n')
		if (next === source || editor.getIsReadonly()) return
		editor.markHistoryStoppingPoint('edit type mapping (V4)')
		editor.updateShape<BlockShape>({ id: shape.id, type: shape.type, props: { attributeSource: next } })
	}

	return (
		<section className="TypeMapping" data-testid="type-mapping-v4" data-selected={selected || undefined} style={regionStyle(top, bottom)}
			onPointerDown={(event) => { if (selected) event.stopPropagation() }}>
			<div className="TypeMapping-heading">
				<button
					type="button"
					className="TypeMappingV4-summary"
					data-testid="type-mapping-v4-summary"
					onPointerDown={(event) => event.stopPropagation()}
					onClick={() => setLevel((current) => current === 'collapsed' ? 'pretty' : 'collapsed')}
				>
					<span aria-hidden="true">{level === 'collapsed' ? '›' : '⌄'}</span>
					<span>{aliases.length} type alias{aliases.length === 1 ? '' : 'es'}</span>
				</button>
				{level !== 'collapsed' ? (
					<button
						type="button"
						aria-label={level === 'source' ? 'Show pretty list' : 'Edit as source'}
						onPointerDown={(event) => event.stopPropagation()}
						onClick={() => setLevel((current) => current === 'source' ? 'pretty' : 'source')}
					>{level === 'source' ? '▤' : '{ }'}</button>
				) : null}
			</div>
			{level === 'pretty' ? (
				<div className="TypeMappingV4-list" data-testid="type-mapping-v4-list">
					{aliases.map((alias) => (
						<div key={alias.id} className="TypeMappingV4-row">
							<AliasSpans alias={alias} resolve={resolve} onTokenActivate={goto} />
						</div>
					))}
				</div>
			) : level === 'source' ? (
				<TypeMappingCodeEditor
					value={draft}
					aliases={parseTypeMappingSource(draft)}
					resolve={resolve}
					onChange={setDraft}
					onBlur={commit}
					onKeyDownCapture={(event) => {
						if (event.key !== 'Escape') return
						event.preventDefault()
						event.stopPropagation()
						setDraft(source)
					}}
					autoFocus
					testId="type-mapping-v4-source"
				/>
			) : null}
		</section>
	)
}
