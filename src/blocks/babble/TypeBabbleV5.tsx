import { useEffect, useMemo, useRef, useState } from 'react'
import { useEditor } from 'tldraw'

import type { BlockShape } from '../blockModel'
import { AttributeSpans, EscapeToCancel, regionStyle, type TypeResolution } from './TypeBabbleParts'
import { findKnownTypeBlock, isKnownTypeName, knownTypeFields, parseFlatAttributes } from './typeBabbleShared'

/**
 * V5 — Gutter-first editor, hover to peek.
 *
 * The only surface is a real code editor: a fixed-width line-number/fold
 * column sits outside the text column entirely, so every row's text starts
 * at the same x whether or not that row means anything to fold — this is
 * the direct fix for the misaligned chevron. A recognised type previews on
 * hover, at zero click cost, and disappears the instant focus moves on.
 */
export function TypeBabbleV5({ shape, top, bottom, selected }: { shape: BlockShape; top: number; bottom: number; selected: boolean }) {
	const editor = useEditor()
	const source = shape.props.attributeSource ?? ''
	const [draft, setDraft] = useState(source)
	// Which line is currently peeked, or null. The popover is rendered
	// `position: absolute` INSIDE that line's own (position: relative) div —
	// `position: fixed` does not work here, because tldraw's canvas applies a
	// CSS transform to the shape's ancestor, which makes that ancestor the
	// containing block for any `fixed` descendant instead of the real
	// viewport, landing the popover thousands of pixels away at high zoom.
	const [peekLine, setPeekLine] = useState<number | null>(null)
	const highlightRef = useRef<HTMLPreElement>(null)
	const attributes = useMemo(() => parseFlatAttributes(draft), [draft])
	const lines = draft.replace(/\r\n?/g, '\n').split('\n')

	useEffect(() => { setDraft(source) }, [source])

	const resolve = (typeName: string): TypeResolution => (
		isKnownTypeName(editor, typeName, shape.id) ? (typeName.trim().match(/^[a-z]/) ? 'primitive' : 'known') : 'unknown'
	)

	const commit = () => {
		const next = draft.replace(/\r\n?/g, '\n')
		if (next === source || editor.getIsReadonly()) return
		editor.markHistoryStoppingPoint('edit Type attributes (V5)')
		editor.updateShape<BlockShape>({ id: shape.id, type: shape.type, props: { attributeSource: next } })
	}

	const syncScroll = (event: React.UIEvent<HTMLTextAreaElement>) => {
		if (!highlightRef.current) return
		highlightRef.current.scrollTop = event.currentTarget.scrollTop
	}

	const byLine = new Map(attributes.map((attribute) => [attribute.line, attribute]))

	// The textarea sits ON TOP of the highlighted `<pre>` (that is what makes
	// its own text transparent but its caret real), so it is the element that
	// actually receives the pointer — a hover handler on the `<pre>` under it
	// would never fire. Line height (21px) and padding (6px) mirror the CSS.
	const LINE_HEIGHT = 21
	const TOP_PADDING = 6
	const hoverLine = (event: React.MouseEvent<HTMLTextAreaElement>) => {
		const rect = event.currentTarget.getBoundingClientRect()
		const y = event.clientY - rect.top - TOP_PADDING + event.currentTarget.scrollTop
		const line = Math.floor(y / LINE_HEIGHT)
		const attribute = byLine.get(line)
		const known = attribute?.type && resolve(attribute.type) === 'known'
		setPeekLine(known ? line : null)
	}

	return (
		<section className="TypeBabble" data-testid="type-babble-v5" data-selected={selected || undefined} style={regionStyle(top, bottom)}
			onPointerDown={(event) => { if (selected) event.stopPropagation() }}>
			<div className="TypeBabble-heading"><span>source</span><span className="TypeBabble-badge">hover a type</span></div>
			<div className="TypeBabbleV5-editor">
				<div className="TypeBabbleV5-gutter" aria-hidden="true">
					{lines.map((_, index) => <div key={index}>{index + 1}</div>)}
				</div>
				<div className="TypeBabble-codeEditor">
					<pre ref={highlightRef} className="TypeBabble-codeEditor-highlight" aria-hidden="true">
						{lines.map((raw, line) => {
							const attribute = byLine.get(line)
							const referenced = peekLine === line && attribute ? findKnownTypeBlock(editor, attribute.type, shape.id) : null
							return (
								<div key={line} className="TypeBabble-codeEditor-line" style={{ position: 'relative' }}>
									{attribute ? <AttributeSpans attribute={attribute} resolve={resolve} /> : (raw || ' ')}
									{referenced ? (
										<div className="TypeBabbleV5-popover" data-testid="type-babble-v5-popover" style={{ left: 0, top: LINE_HEIGHT }}>
											<div className="TypeBabble-heading" style={{ padding: 0, marginBottom: 4 }}>{referenced.props.title}</div>
											{knownTypeFields(referenced).map((field) => (
												<div key={field.id}><AttributeSpans attribute={field} resolve={resolve} /></div>
											))}
										</div>
									) : null}
								</div>
							)
						})}
					</pre>
					<textarea
						className="TypeBabble-codeEditor-input"
						aria-label="Type attributes source"
						data-testid="type-babble-v5-source"
						value={draft}
						spellCheck={false}
						onPointerDown={(event) => event.stopPropagation()}
						onChange={(event) => setDraft(event.currentTarget.value)}
						onScroll={syncScroll}
						onMouseMove={hoverLine}
						onMouseLeave={() => setPeekLine(null)}
						onBlur={commit}
						onKeyDownCapture={EscapeToCancel(() => setDraft(source))}
					/>
				</div>
			</div>
		</section>
	)
}
