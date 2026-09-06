import { useRef } from 'react'

import type { TypeAlias, TokenResolution } from './typeMappingShared'
import { tokenizeTypeExpr } from './typeMappingShared'

/**
 * One alias's spans, shared by every variant's read view AND its
 * syntax-highlighted source line — the same judgement of a token paints both
 * surfaces, so a variant can never show two different opinions about whether
 * `Pose` is recognised. Every identifier inside the expression is resolved on
 * its own: `Callable[[Frame, float], Pose]` colors `Callable`, `Frame`,
 * `float`, and `Pose` independently, not the line as one unit.
 */
export function AliasSpans({
	alias,
	resolve,
	onTokenActivate,
	showName = true,
}: {
	alias: Pick<TypeAlias, 'name' | 'expr' | 'raw'>
	resolve: (typeName: string) => TokenResolution
	/** Present only for a variant that offers "go to definition" inline. */
	onTokenActivate?: (typeName: string) => void
	/** Off for a UI (e.g. a table cell) that already draws the name in its own column. */
	showName?: boolean
}) {
	if (!alias.expr) return <span className="TypeMapping-raw">{alias.raw}</span>
	return (
		<>
			{showName ? (
				<>
					<span className="TypeMapping-name">{alias.name}</span>
					<span className="TypeMapping-punct"> = </span>
				</>
			) : null}
			{tokenizeTypeExpr(alias.expr).map((token, index) => {
				if (token.kind !== 'identifier') {
					return <span key={index} className="TypeMapping-punct">{token.text}</span>
				}
				const resolution = resolve(token.text)
				const className = `TypeMapping-token TypeMapping-token--${resolution}`
				if (resolution !== 'known' || !onTokenActivate) {
					return <span key={index} className={className}>{token.text}</span>
				}
				return (
					<span
						key={index}
						role="button"
						tabIndex={0}
						className={className}
						onPointerDown={(event) => event.stopPropagation()}
						onClick={(event) => {
							event.stopPropagation()
							onTokenActivate(token.text)
						}}
						onKeyDown={(event) => {
							if (event.key !== 'Enter' && event.key !== ' ') return
							event.preventDefault()
							event.stopPropagation()
							onTokenActivate(token.text)
						}}
					>
						{token.text}
					</span>
				)
			})}
		</>
	)
}

/**
 * A real `<textarea>` for cursor/paste/undo, with a `<pre>` of coloured spans
 * behind it standing in for a tokenizer — the same transparent-textarea-over-
 * highlighted-copy technique as the sibling attribute babble's
 * `TypeBabbleCodeEditor`, adapted to alias lines instead of attribute lines.
 */
export function TypeMappingCodeEditor({
	value,
	aliases,
	resolve,
	onChange,
	onBlur,
	onKeyDownCapture,
	onTokenActivate,
	autoFocus,
	testId,
}: {
	value: string
	aliases: readonly TypeAlias[]
	resolve: (typeName: string) => TokenResolution
	onChange(value: string): void
	onBlur?(): void
	onKeyDownCapture?(event: React.KeyboardEvent<HTMLTextAreaElement>): void
	onTokenActivate?(typeName: string): void
	autoFocus?: boolean
	testId?: string
}) {
	const highlightRef = useRef<HTMLPreElement>(null)
	const lines = value.replace(/\r\n?/g, '\n').split('\n')
	const byLine = new Map(aliases.map((alias) => [alias.line, alias]))
	const syncScroll = (event: React.UIEvent<HTMLTextAreaElement>) => {
		if (!highlightRef.current) return
		highlightRef.current.scrollTop = event.currentTarget.scrollTop
		highlightRef.current.scrollLeft = event.currentTarget.scrollLeft
	}
	return (
		<div className="TypeMapping-codeEditor">
			<pre ref={highlightRef} className="TypeMapping-codeEditor-highlight" aria-hidden="true">
				{lines.map((raw, line) => {
					const alias = byLine.get(line)
					return (
						<div key={line} className="TypeMapping-codeEditor-line">
							{alias ? <AliasSpans alias={alias} resolve={resolve} onTokenActivate={onTokenActivate} /> : (raw || ' ')}
						</div>
					)
				})}
			</pre>
			<textarea
				autoFocus={autoFocus}
				className="TypeMapping-codeEditor-input"
				aria-label="Type mapping source"
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
