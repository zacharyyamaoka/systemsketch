import { useRef, type CSSProperties } from 'react'

import type { FlatAttribute } from './typeBabbleShared'

export type TypeResolution = 'primitive' | 'known' | 'unknown'

/**
 * One attribute's spans, shared by every variant's tree row AND its
 * syntax-highlighted source line — the same judgement of a type name paints
 * both surfaces, so a variant can never show two different opinions about
 * whether `Pose` is recognised.
 */
export function AttributeSpans({
	attribute,
	resolve,
	onTypeActivate,
}: {
	attribute: Pick<FlatAttribute, 'name' | 'type' | 'value' | 'raw'>
	resolve: (typeName: string) => TypeResolution
	/** Present only for a read view where the type name is its own click
	 * target (navigate to its definition) — independent of whatever the
	 * REST of the row does when clicked. Absent for source-highlight
	 * rendering, where the whole line is one plain textarea underneath. */
	onTypeActivate?: (typeName: string) => void
}) {
	if (!attribute.type) return <span className="TypeBabble-raw">{attribute.raw}</span>
	const resolution = resolve(attribute.type)
	const typeSpan = resolution === 'known' && onTypeActivate ? (
		<span
			className={`TypeBabble-type TypeBabble-type--${resolution}`}
			role="button"
			tabIndex={0}
			onPointerDown={(event) => event.stopPropagation()}
			onClick={(event) => { event.stopPropagation(); onTypeActivate(attribute.type) }}
			onKeyDown={(event) => {
				if (event.key !== 'Enter' && event.key !== ' ') return
				event.preventDefault()
				event.stopPropagation()
				onTypeActivate(attribute.type)
			}}
		>{attribute.type}</span>
	) : (
		<span className={`TypeBabble-type TypeBabble-type--${resolution}`}>{attribute.type}</span>
	)
	return (
		<>
			<span className="TypeBabble-name">{attribute.name}</span>
			<span className="TypeBabble-punct">: </span>
			{typeSpan}
			{attribute.value ? (
				<>
					<span className="TypeBabble-punct"> = </span>
					<span className="TypeBabble-value">{attribute.value}</span>
				</>
			) : null}
		</>
	)
}

/**
 * A real `<textarea>` for cursor/paste/undo, with a `<pre>` of coloured spans
 * behind it standing in for CodeMirror's tokenizer. The textarea's own text
 * is transparent — only its caret and selection paint — so the highlighted
 * copy underneath is what the eye actually reads.
 */
export function TypeBabbleCodeEditor({
	value,
	attributes,
	resolve,
	onChange,
	onBlur,
	onKeyDownCapture,
	autoFocus,
	testId,
}: {
	value: string
	attributes: readonly FlatAttribute[]
	resolve: (typeName: string) => TypeResolution
	onChange(value: string): void
	onBlur?(): void
	onKeyDownCapture?(event: React.KeyboardEvent<HTMLTextAreaElement>): void
	autoFocus?: boolean
	testId?: string
}) {
	const highlightRef = useRef<HTMLPreElement>(null)
	const lines = value.replace(/\r\n?/g, '\n').split('\n')
	const byLine = new Map(attributes.map((attribute) => [attribute.line, attribute]))
	const syncScroll = (event: React.UIEvent<HTMLTextAreaElement>) => {
		if (!highlightRef.current) return
		highlightRef.current.scrollTop = event.currentTarget.scrollTop
		highlightRef.current.scrollLeft = event.currentTarget.scrollLeft
	}
	return (
		<div className="TypeBabble-codeEditor">
			<pre ref={highlightRef} className="TypeBabble-codeEditor-highlight" aria-hidden="true">
				{lines.map((raw, line) => {
					const attribute = byLine.get(line)
					return (
						<div key={line} className="TypeBabble-codeEditor-line">
							{attribute ? <AttributeSpans attribute={attribute} resolve={resolve} /> : (raw || ' ')}
						</div>
					)
				})}
			</pre>
			<textarea
				autoFocus={autoFocus}
				className="TypeBabble-codeEditor-input"
				aria-label="Type attributes source"
				data-testid={testId}
				value={value}
				spellCheck={false}
				onPointerDown={(event) => event.stopPropagation()}
				onChange={(event) => onChange(event.currentTarget.value)}
				onScroll={syncScroll}
				onBlur={onBlur}
				onKeyDownCapture={onKeyDownCapture}
			/>
		</div>
	)
}

export function EscapeToCancel(onCancel: () => void) {
	return (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key !== 'Escape') return
		event.preventDefault()
		event.stopPropagation()
		onCancel()
	}
}

export function regionStyle(top: number, bottom: number): CSSProperties {
	return { top, height: Math.max(0, bottom - top) }
}
