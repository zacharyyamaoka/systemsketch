import { useEffect, useMemo, useState } from 'react'
import { useEditor } from 'tldraw'

import type { BlockShape } from '../blockModel'
import { regionStyle } from './TypeBabbleParts'
import { AliasSpans, TypeMappingCodeEditor } from './TypeMappingParts'
import { findKnownTypeSource, parseTypeMappingSource, resolveTypeToken, type TokenResolution } from './typeMappingShared'

/**
 * V3 — Definition Table, always both. There is no toggle: a read-only
 * `Name | Expression` table sits permanently over a live source pane, kept in
 * sync as one keystroke away. This deliberately converges with the sibling
 * attribute babble's V2 mental model — "never make the reader choose a mode,
 * show both at once" — reshaped as a table because our grammar is naturally
 * two columns per line (a name and the thing it maps to), where the sibling's
 * `name: Type` tree had no second column to give.
 */
export function TypeMappingV3({ shape, top, bottom, selected }: { shape: BlockShape; top: number; bottom: number; selected: boolean }) {
	const editor = useEditor()
	const source = shape.props.attributeSource ?? ''
	const aliases = useMemo(() => parseTypeMappingSource(source), [source])
	const [draft, setDraft] = useState(source)

	useEffect(() => { setDraft(source) }, [source])

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
		editor.markHistoryStoppingPoint('edit type mapping (V3)')
		editor.updateShape<BlockShape>({ id: shape.id, type: shape.type, props: { attributeSource: next } })
	}

	return (
		<section className="TypeMapping" data-testid="type-mapping-v3" data-selected={selected || undefined} style={regionStyle(top, bottom)}
			onPointerDown={(event) => { if (selected) event.stopPropagation() }}>
			<div className="TypeMapping-heading"><span>type aliases</span></div>
			<div className="TypeMappingV3-table" data-testid="type-mapping-v3-table" role="table">
				{aliases.map((alias) => (
					<div key={alias.id} className="TypeMappingV3-row" role="row">
						<span className="TypeMappingV3-cell TypeMappingV3-cell--name" role="cell">
							{alias.expr ? alias.name : <span className="TypeMapping-raw">{alias.raw}</span>}
						</span>
						{alias.expr ? (
							<span className="TypeMappingV3-cell TypeMappingV3-cell--expr" role="cell">
								<AliasSpans alias={alias} resolve={resolve} onTokenActivate={goto} showName={false} />
							</span>
						) : null}
					</div>
				))}
			</div>
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
				testId="type-mapping-v3-source"
			/>
		</section>
	)
}
