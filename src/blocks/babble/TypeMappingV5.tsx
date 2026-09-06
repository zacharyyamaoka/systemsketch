import { useEffect, useMemo, useRef, useState } from 'react'
import { useEditor } from 'tldraw'

import type { BlockShape } from '../blockModel'
import { EscapeToCancel, regionStyle } from './TypeBabbleParts'
import { AliasSpans } from './TypeMappingParts'
import { findKnownTypeSource, parseTypeMappingSource, resolveTypeToken, type TokenResolution } from './typeMappingShared'

/**
 * V5 — Inline REPL Feed. The opposite extreme from V4's chrome: no table, no
 * chips, no ladder — just a `>>> ` prompt column beside a live-highlighted
 * source, in the style of a Python console echoing back what you typed. The
 * prompt lives in its own fixed gutter (the same fix the sibling babble's V5
 * made for line numbers) so it never breaks the highlight/textarea overlay's
 * character-for-character alignment. A recognised board type underlines;
 * clicking it pans the camera to the real thing, never a popover — this is
 * the most code-native, least-decorated of the five.
 */
export function TypeMappingV5({ shape, top, bottom, selected }: { shape: BlockShape; top: number; bottom: number; selected: boolean }) {
	const editor = useEditor()
	const source = shape.props.attributeSource ?? ''
	const [draft, setDraft] = useState(source)
	const highlightRef = useRef<HTMLPreElement>(null)
	const aliases = useMemo(() => parseTypeMappingSource(draft), [draft])
	const lines = draft.replace(/\r\n?/g, '\n').split('\n')
	const byLine = new Map(aliases.map((alias) => [alias.line, alias]))

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
		editor.markHistoryStoppingPoint('edit type mapping (V5)')
		editor.updateShape<BlockShape>({ id: shape.id, type: shape.type, props: { attributeSource: next } })
	}
	const syncScroll = (event: React.UIEvent<HTMLTextAreaElement>) => {
		if (!highlightRef.current) return
		highlightRef.current.scrollTop = event.currentTarget.scrollTop
	}

	return (
		<section className="TypeMapping TypeMapping--repl" data-testid="type-mapping-v5" data-selected={selected || undefined} style={regionStyle(top, bottom)}
			onPointerDown={(event) => { if (selected) event.stopPropagation() }}>
			<div className="TypeMapping-heading"><span>type aliases</span><span className="TypeMapping-badge">Python</span></div>
			<div className="TypeMappingV5-editor">
				<div className="TypeMappingV5-gutter" aria-hidden="true">
					{lines.map((_, index) => <div key={index}>&gt;&gt;&gt;</div>)}
				</div>
				<div className="TypeMapping-codeEditor">
					<pre ref={highlightRef} className="TypeMapping-codeEditor-highlight" aria-hidden="true">
						{lines.map((raw, line) => {
							const alias = byLine.get(line)
							return (
								<div key={line} className="TypeMapping-codeEditor-line">
									{alias ? <AliasSpans alias={alias} resolve={resolve} onTokenActivate={goto} /> : (raw || ' ')}
								</div>
							)
						})}
					</pre>
					<textarea
						className="TypeMapping-codeEditor-input"
						aria-label="Type mapping source"
						data-testid="type-mapping-v5-source"
						value={draft}
						spellCheck={false}
						onPointerDown={(event) => event.stopPropagation()}
						onChange={(event) => setDraft(event.currentTarget.value)}
						onScroll={syncScroll}
						onBlur={commit}
						onKeyDownCapture={EscapeToCancel(() => setDraft(source))}
					/>
				</div>
			</div>
		</section>
	)
}
