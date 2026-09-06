import { useEffect, useMemo, useState } from 'react'
import { useEditor } from 'tldraw'

import type { BlockShape } from '../blockModel'
import { AttributeSpans, EscapeToCancel, TypeBabbleCodeEditor, regionStyle, type TypeResolution } from './TypeBabbleParts'
import { findKnownTypeBlock, isKnownTypeName, parseFlatAttributes } from './typeBabbleShared'

/**
 * V2 — Always both, navigate to the real thing.
 *
 * There is no toggle: a read-only tree sits permanently over a live source
 * field, updating together. A recognised type is not previewed in place —
 * it is a real object elsewhere on this board, so "seeing what's inside
 * Pose" means panning the camera to the actual Pose card and selecting it.
 */
export function TypeBabbleV2({ shape, top, bottom, selected }: { shape: BlockShape; top: number; bottom: number; selected: boolean }) {
	const editor = useEditor()
	const source = shape.props.attributeSource ?? ''
	const attributes = useMemo(() => parseFlatAttributes(source), [source])
	const [draft, setDraft] = useState(source)

	useEffect(() => { setDraft(source) }, [source])

	const resolve = (typeName: string): TypeResolution => (
		isKnownTypeName(editor, typeName, shape.id) ? (typeName.trim().match(/^[a-z]/) ? 'primitive' : 'known') : 'unknown'
	)

	const commit = () => {
		const next = draft.replace(/\r\n?/g, '\n')
		if (next === source || editor.getIsReadonly()) return
		editor.markHistoryStoppingPoint('edit Type attributes (V2)')
		editor.updateShape<BlockShape>({ id: shape.id, type: shape.type, props: { attributeSource: next } })
	}
	const cancel = () => setDraft(source)

	const goto = (typeName: string) => {
		const target = findKnownTypeBlock(editor, typeName, shape.id)
		if (!target) return
		editor.select(target.id)
		editor.zoomToSelection({ animation: { duration: 260 } })
	}

	return (
		<section className="TypeBabble" data-testid="type-babble-v2" data-selected={selected || undefined} style={regionStyle(top, bottom)}
			onPointerDown={(event) => { if (selected) event.stopPropagation() }}>
			<div className="TypeBabble-heading"><span>attributes</span></div>
			<div className="TypeBabbleV2-tree">
				{attributes.map((attribute) => {
					const known = attribute.type && resolve(attribute.type) === 'known'
					return (
						<div key={attribute.id} className="TypeBabbleV2-row">
							<AttributeSpans attribute={attribute} resolve={resolve} />
							{known ? (
								<button
									type="button"
									className="TypeBabbleV2-goto"
									aria-label={`Go to ${attribute.type}`}
									onPointerDown={(event) => event.stopPropagation()}
									onClick={() => goto(attribute.type)}
								>↗</button>
							) : null}
						</div>
					)
				})}
			</div>
			<TypeBabbleCodeEditor
				value={draft}
				attributes={parseFlatAttributes(draft)}
				resolve={resolve}
				onChange={setDraft}
				onBlur={commit}
				onKeyDownCapture={EscapeToCancel(cancel)}
				testId="type-babble-v2-source"
			/>
		</section>
	)
}
