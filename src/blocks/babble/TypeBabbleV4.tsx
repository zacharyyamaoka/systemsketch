import { useEffect, useMemo, useState } from 'react'
import { useEditor } from 'tldraw'
import type { TLShapeId } from 'tldraw'

import type { BlockShape } from '../blockModel'
import { isBlockShape } from '../blockModel'
import { AttributeSpans, EscapeToCancel, TypeBabbleCodeEditor, regionStyle, type TypeResolution } from './TypeBabbleParts'
import { findKnownTypeBlock, isKnownTypeName, parseFlatAttributes } from './typeBabbleShared'

/**
 * V4 — Breadcrumb drill-down.
 *
 * The compact tree is primary; clicking a recognised type does not expand
 * in place, it *replaces* the card's content with that type's own fields —
 * like opening a folder — leaving a breadcrumb trail behind. Every drilled
 * level stays exactly as compact as the first. A dedicated `{}` button edits
 * the source of whichever level is currently showing.
 */
export function TypeBabbleV4({ shape, top, bottom, selected }: { shape: BlockShape; top: number; bottom: number; selected: boolean }) {
	const editor = useEditor()
	const [path, setPath] = useState<TLShapeId[]>([shape.id])
	const [editing, setEditing] = useState(false)
	const [draft, setDraft] = useState('')

	const currentId = path[path.length - 1]
	const current = editor.getShape(currentId)
	const currentBlock = isBlockShape(current) ? current : shape
	const source = currentBlock.props.attributeSource ?? ''
	const attributes = useMemo(() => parseFlatAttributes(source), [source])

	useEffect(() => { setDraft(source); setEditing(false) }, [source, currentId])
	// A block elsewhere on the board can be deleted out from under a drilled path.
	useEffect(() => { if (!editor.getShape(currentId)) setPath([shape.id]) }, [currentId, editor, shape.id])

	const resolve = (typeName: string): TypeResolution => (
		isKnownTypeName(editor, typeName, currentBlock.id) ? (typeName.trim().match(/^[a-z]/) ? 'primitive' : 'known') : 'unknown'
	)

	const drillInto = (typeName: string) => {
		const target = findKnownTypeBlock(editor, typeName, currentBlock.id)
		if (target) setPath((prior) => [...prior, target.id])
	}

	const commit = () => {
		const next = draft.replace(/\r\n?/g, '\n')
		setEditing(false)
		if (next === source || editor.getIsReadonly()) return
		editor.markHistoryStoppingPoint('edit Type attributes (V4)')
		editor.updateShape<BlockShape>({ id: currentBlock.id, type: currentBlock.type, props: { attributeSource: next } })
	}

	return (
		<section className="TypeBabble" data-testid="type-babble-v4" data-selected={selected || undefined} style={regionStyle(top, bottom)}
			onPointerDown={(event) => { if (selected) event.stopPropagation() }}>
			<div className="TypeBabble-heading">
				<div className="TypeBabbleV4-crumbs">
					{path.map((id, index) => {
						const block = editor.getShape(id)
						const title = isBlockShape(block) ? block.props.title || 'Type' : 'Type'
						return (
							<span key={id} style={{ display: 'contents' }}>
								{index > 0 ? <span aria-hidden="true">›</span> : null}
								<button
									type="button"
									onPointerDown={(event) => event.stopPropagation()}
									onClick={() => setPath((prior) => prior.slice(0, index + 1))}
								>{title}</button>
							</span>
						)
					})}
				</div>
				<button
					type="button"
					aria-label={editing ? 'Show attributes' : 'Edit source'}
					onPointerDown={(event) => event.stopPropagation()}
					onClick={() => setEditing((current) => !current)}
				>{editing ? '▤' : '{ }'}</button>
			</div>
			{editing ? (
				<TypeBabbleCodeEditor
					value={draft}
					attributes={parseFlatAttributes(draft)}
					resolve={resolve}
					onChange={setDraft}
					onBlur={commit}
					onKeyDownCapture={EscapeToCancel(() => setDraft(source))}
					autoFocus
					testId="type-babble-v4-source"
				/>
			) : (
				<div className="TypeBabbleV4-body">
					{attributes.map((attribute) => {
						const known = attribute.type && resolve(attribute.type) === 'known'
						return (
							<div
								key={attribute.id}
								className="TypeBabbleV4-row"
								role={known ? 'button' : undefined}
								onPointerDown={(event) => { if (known) event.stopPropagation() }}
								onClick={known ? () => drillInto(attribute.type) : undefined}
							>
								<AttributeSpans attribute={attribute} resolve={resolve} />
								{known ? <span aria-hidden="true"> ›</span> : null}
							</div>
						)
					})}
				</div>
			)}
		</section>
	)
}
