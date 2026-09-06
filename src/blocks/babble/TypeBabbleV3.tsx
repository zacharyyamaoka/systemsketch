import { useEffect, useMemo, useState } from 'react'
import { useEditor } from 'tldraw'

import type { BlockShape } from '../blockModel'
import { AttributeSpans, EscapeToCancel, regionStyle, type TypeResolution } from './TypeBabbleParts'
import { findKnownTypeBlock, isKnownTypeName, knownTypeFields, parseFlatAttributes } from './typeBabbleShared'

/**
 * V3 — Code-first; the tree is a fold, not a second view.
 *
 * There is only ever one surface: the real source. A recognised type gets a
 * faint inline hint, in the style of an editor's CodeLens — "⟶ x, y" —
 * computed live from the other Type Block it names. Clicking the hint opens
 * a small peek popover; there is no separate "UI mode" to switch away from.
 */
export function TypeBabbleV3({ shape, top, bottom, selected }: { shape: BlockShape; top: number; bottom: number; selected: boolean }) {
	const editor = useEditor()
	const source = shape.props.attributeSource ?? ''
	const [draft, setDraft] = useState(source)
	const [openId, setOpenId] = useState<string | null>(null)
	const attributes = useMemo(() => parseFlatAttributes(draft), [draft])

	useEffect(() => { setDraft(source) }, [source])

	const resolve = (typeName: string): TypeResolution => (
		isKnownTypeName(editor, typeName, shape.id) ? (typeName.trim().match(/^[a-z]/) ? 'primitive' : 'known') : 'unknown'
	)

	const commit = (next: string) => {
		const cleaned = next.replace(/\r\n?/g, '\n')
		if (cleaned === source || editor.getIsReadonly()) return
		editor.markHistoryStoppingPoint('edit Type attributes (V3)')
		editor.updateShape<BlockShape>({ id: shape.id, type: shape.type, props: { attributeSource: cleaned } })
	}

	return (
		<section className="TypeBabble" data-testid="type-babble-v3" data-selected={selected || undefined} style={regionStyle(top, bottom)}
			onPointerDown={(event) => { if (selected) event.stopPropagation() }}>
			<div className="TypeBabble-heading"><span>source</span><span className="TypeBabble-badge">Python</span></div>
			<div style={{ position: 'relative', flex: '1 1 auto', overflow: 'auto' }}>
				<textarea
					className="TypeBabble-codeEditor-input"
					style={{ position: 'static', width: '100%', height: attributes.length * 21 + 14, minHeight: '100%' }}
					aria-label="Type attributes source"
					data-testid="type-babble-v3-source"
					value={draft}
					spellCheck={false}
					onPointerDown={(event) => event.stopPropagation()}
					onChange={(event) => setDraft(event.currentTarget.value)}
					onBlur={(event) => commit(event.currentTarget.value)}
					onKeyDownCapture={EscapeToCancel(() => setDraft(source))}
				/>
				<div className="TypeBabble-codeEditor-highlight" aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', border: 'none', background: 'transparent' }}>
					{attributes.map((attribute) => {
						const known = attribute.type && resolve(attribute.type) === 'known'
						const referenced = known ? findKnownTypeBlock(editor, attribute.type, shape.id) : null
						const fields = referenced ? knownTypeFields(referenced) : []
						return (
							<div key={attribute.id} className="TypeBabble-codeEditor-line" style={{ position: 'relative', pointerEvents: known ? 'auto' : 'none' }}>
								<AttributeSpans attribute={attribute} resolve={resolve} />
								{known && fields.length > 0 ? (
									<span
										className="TypeBabbleV3-hint"
										onPointerDown={(event) => { event.stopPropagation(); event.preventDefault() }}
										onClick={() => setOpenId((current) => (current === attribute.id ? null : attribute.id))}
									>
										⟶ {fields.map((field) => field.name).join(', ')}
									</span>
								) : null}
								{openId === attribute.id && referenced ? (
									<div className="TypeBabbleV3-popover" style={{ top: 22, left: 0 }} data-testid="type-babble-v3-popover">
										<div className="TypeBabble-heading" style={{ padding: 0, marginBottom: 4 }}>{referenced.props.title}</div>
										{fields.map((field) => (
											<div key={field.id}><AttributeSpans attribute={field} resolve={resolve} /></div>
										))}
									</div>
								) : null}
							</div>
						)
					})}
				</div>
			</div>
		</section>
	)
}
