import { autocompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import { RangeSetBuilder, StateEffect, StateField, type Extension } from '@codemirror/state'
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { Editor } from 'tldraw'

import { CodeField } from '../../fields/CodeField'
import type { ExpressionEvalResult, UsedName } from '../../expression/expressionClient'
import { isSafeNamespaceName, PYTHON_SAFE_NAMESPACE } from '../../expression/pythonSafeNamespace'
import { useDebouncedExpressionEval } from '../../expression/useDebouncedExpressionEval'
import { KIND_LABEL, buildBrowseList, buildQueryResults, buildRegistry, type AutocompleteKind } from '../babble/typeNameAutocompleteLogic'
import type { BlockPort } from '../blockModel'
import { formatPortSignature, parsePortLaneLines, parsePortSignature, portSignaturePatch, portSignatureSlotAt } from '../portSignature'
import '../babble/type-name-autocomplete.css'

// ---------------------------------------------------------------- grammar --

const NAME_MARK = Decoration.mark({ class: 'ss-sig-name' })
const TYPE_MARK = Decoration.mark({ class: 'ss-sig-type' })
const DEFAULT_MARK = Decoration.mark({ class: 'ss-sig-default' })
const PUNCT_MARK = Decoration.mark({ class: 'ss-sig-punct' })
const SQUIGGLE_MARK = Decoration.mark({ class: 'ss-expr-squiggle' })

/**
 * The three roles painted onto the one line, recomputed from the grammar on
 * every change: the field colours what the canvas colours, and the split is
 * the same `parsePortSignature` the store write uses, so what you see
 * highlighted is exactly what will be stored.
 */
const slotDecorations = EditorView.decorations.compute(['doc'], (state) => {
	const text = state.doc.toString()
	const builder = new RangeSetBuilder<Decoration>()
	const marks: Array<[number, number, Decoration]> = []
	// One port per line: a single field is a lane of one.
	for (const { spans } of parsePortLaneLines(text)) {
		if (spans.name.end > spans.name.start) marks.push([spans.name.start, spans.name.end, NAME_MARK])
		if (spans.colon !== null) marks.push([spans.colon, spans.colon + 1, PUNCT_MARK])
		if (spans.type && spans.type.end > spans.type.start) marks.push([spans.type.start, spans.type.end, TYPE_MARK])
		if (spans.equals !== null) marks.push([spans.equals, spans.equals + 1, PUNCT_MARK])
		if (spans.default && spans.default.end > spans.default.start) {
			marks.push([spans.default.start, spans.default.end, DEFAULT_MARK])
		}
	}
	marks.sort((a, b) => a[0] - b[0])
	for (const [from, to, mark] of marks) builder.add(from, to, mark)
	return builder.finish()
})

const setDiagnostics = StateEffect.define<readonly UsedName[]>()

/** Wavy underlines on undefined names in the default slot, offsets shifted from the slot's own text. */
const diagnosticsField = StateField.define<DecorationSet>({
	create: () => Decoration.none,
	update(value, tr) {
		for (const effect of tr.effects) {
			if (!effect.is(setDiagnostics)) continue
			const text = tr.state.doc.toString()
			const { spans } = parsePortSignature(text)
			const builder = new RangeSetBuilder<Decoration>()
			if (spans.default) {
				const base = spans.default.start
				const ranges = effect.value
					.filter((used) => !used.defined)
					.map((used) => [base + used.start, base + used.end] as const)
					.filter(([from, to]) => to > from && to <= text.length)
					.sort((a, b) => a[0] - b[0])
				for (const [from, to] of ranges) builder.add(from, to, SQUIGGLE_MARK)
			}
			return builder.finish()
		}
		return value.map(tr.changes)
	},
	provide: (field) => EditorView.decorations.from(field),
})

class ResolvedWidget extends WidgetType {
	constructor(readonly display: string) {
		super()
	}
	override eq(other: ResolvedWidget): boolean {
		return other.display === this.display
	}
	override toDOM(): HTMLElement {
		const span = document.createElement('span')
		span.className = 'ss-sig-resolved'
		span.setAttribute('aria-hidden', 'true')
		span.textContent = `⇢ ${this.display}`
		return span
	}
	override ignoreEvent(): boolean {
		return true
	}
}

const setResolved = StateEffect.define<string | null>()

/**
 * The live-resolved value, riding after the default while the field rests.
 * The formula is never swapped for its value — a port line is source text —
 * but a reader still sees what `chassis_width / 4` currently is.
 */
const resolvedField = StateField.define<DecorationSet>({
	create: () => Decoration.none,
	update(value, tr) {
		let display: string | null | undefined
		for (const effect of tr.effects) if (effect.is(setResolved)) display = effect.value
		if (display === undefined) return tr.docChanged ? Decoration.none : value
		if (display === null) return Decoration.none
		const { spans } = parsePortSignature(tr.state.doc.toString())
		if (!spans.default) return Decoration.none
		return Decoration.set([Decoration.widget({ widget: new ResolvedWidget(display), side: 1 }).range(spans.default.end)])
	},
	provide: (field) => EditorView.decorations.from(field),
})

class EllipsisWidget extends WidgetType {
	override eq(): boolean {
		return true
	}
	override toDOM(): HTMLElement {
		const span = document.createElement('span')
		span.className = 'ss-lane-ellipsis'
		span.textContent = '…'
		return span
	}
	override ignoreEvent(): boolean {
		return false
	}
}

/**
 * Live-preview style folding for a lane: a line the caret is NOT on shows at
 * most `maxChars` characters and then an ellipsis, the caret's own line shows
 * everything. Moving onto a folded line unfolds it, because the decoration
 * is recomputed from the selection. This is the per-line reveal rule Zach
 * described — rendered by default, source under the caret — applied to
 * width rather than markup.
 */
export function laneEllipsis(maxChars: number): Extension {
	return EditorView.decorations.compute(['doc', 'selection'], (state) => {
		const builder = new RangeSetBuilder<Decoration>()
		const active = new Set<number>()
		for (const range of state.selection.ranges) {
			active.add(state.doc.lineAt(range.head).number)
			active.add(state.doc.lineAt(range.anchor).number)
		}
		for (let number = 1; number <= state.doc.lines; number += 1) {
			const line = state.doc.line(number)
			if (active.has(number) || line.length <= maxChars) continue
			builder.add(line.from + maxChars, line.to, Decoration.replace({ widget: new EllipsisWidget() }))
		}
		return builder.finish()
	})
}

/** A completion tooltip's kind pill — the same visual vocabulary the Type block's completion uses. */
function kindPill(kind: AutocompleteKind): HTMLElement {
	const pill = document.createElement('span')
	pill.className = `TypeNameAutocomplete-pill TypeNameAutocomplete-pill--${kind}`
	pill.textContent = KIND_LABEL[kind]
	return pill
}

export interface PortCompletionOptions {
	/** Absent only in a static render, where no board exists to offer types from. */
	editor: Editor | null
	excludeBlockId?: string
	/** The board's variable registry names, offered in the default slot. */
	registryNames: readonly string[]
}

/**
 * One completion source, dispatched by slot. A name gets nothing — typing a
 * label must never be interrupted. A `:` opens the board's types (every Type
 * Block and mapped alias, plus the primitives), narrowed as you type. An `=`
 * opens the board's variables and the safe Python namespace.
 */
export function portCompletionSource(options: PortCompletionOptions) {
	const { editor, excludeBlockId, registryNames } = options
	return (context: CompletionContext): CompletionResult | null => {
		const text = context.state.doc.toString()
		const slot = portSignatureSlotAt(text, context.pos)
		if (slot.slot === 'name') return null
		if (slot.slot === 'type') {
			if (!editor) return null
			const registry = buildRegistry(editor, excludeBlockId)
			const entries = slot.query ? buildQueryResults(registry, slot.query) : buildBrowseList(registry)
			if (entries.length === 0) return null
			const queryLower = slot.query.toLowerCase()
			return {
				from: slot.start,
				to: context.pos,
				options: entries.map((entry): Completion => ({ label: entry.name, detail: entry.detail, type: entry.kind })),
				filter: false,
				getMatch: (completion) => {
					if (!queryLower) return []
					const index = completion.label.toLowerCase().indexOf(queryLower)
					return index === -1 ? [] : [index, index + queryLower.length]
				},
			}
		}
		const word = context.matchBefore(/[A-Za-z_][A-Za-z0-9_]*/)
		if (!word && !context.explicit) return null
		return {
			from: word?.from ?? context.pos,
			options: [
				...registryNames.map((name): Completion => ({ label: name, type: 'variable', detail: 'variable' })),
				...PYTHON_SAFE_NAMESPACE.map((entry): Completion => ({ label: entry.name, type: 'function', detail: entry.signature })),
			],
		}
	}
}

export function portSignatureExtensions(options: PortCompletionOptions): Extension[] {
	return [
		slotDecorations,
		diagnosticsField,
		resolvedField,
		autocompletion({
			override: [portCompletionSource(options)],
			icons: false,
			tooltipClass: () => 'TypeNameAutocomplete-cm',
			addToOptions: [{
				position: 20,
				render: (completion) => {
					const kind = completion.type
					if (kind !== 'board-type' && kind !== 'mapped-type' && kind !== 'primitive') return null
					return kindPill(kind)
				},
			}],
		}),
	]
}

// -------------------------------------------------------------- component --

export interface PortSignatureFieldProps {
	editor: Editor | null
	blockId?: string
	port: Pick<BlockPort, 'id' | 'name' | 'type'> & { defaultValue?: string }
	/** Write the parsed patch into the document. Called per keystroke. */
	onPatch(patch: Partial<Omit<BlockPort, 'id'>>): void
	beginEdit?(): void
	onEditEnd?(value: string, startValue: string): void
	/** name -> expression, referentially stable; enables evaluation of the default slot. */
	registry?: Record<string, string>
	/** Live-evaluate the default against the registry (inputs). Off for outputs. */
	evaluate?: boolean
	onEvalResult?(result: ExpressionEvalResult | null): void
	disabled?: boolean
	placeholder?: string
	ariaLabel?: string
	className?: string
	testId?: string
}

const NO_REGISTRY: Record<string, string> = {}

/**
 * A port as one line of code: `name: Type = default`.
 *
 * The stored triple is formatted into the field and every keystroke is parsed
 * back into it through `portSignaturePatch`, so the canvas paints the name,
 * the type hint and the default chip live while the line is typed. The
 * default slot keeps everything the parametric expression field gave it —
 * evaluation against the board's variables, wavy underlines on undefined
 * names, the "Variables used here" aggregation — now scoped to the slot the
 * grammar says is the value.
 */
export function PortSignatureField({
	editor,
	blockId,
	port,
	onPatch,
	beginEdit,
	onEditEnd,
	registry = NO_REGISTRY,
	evaluate = false,
	onEvalResult,
	disabled,
	placeholder,
	ariaLabel,
	className,
	testId,
}: PortSignatureFieldProps) {
	const value = formatPortSignature(port)
	const [liveText, setLiveText] = useState(value)
	const [editing, setEditing] = useState(false)
	const viewRef = useRef<EditorView | null>(null)
	const helpId = useId()

	// An idle field follows the store, as every other port field does.
	useEffect(() => {
		if (!editing) setLiveText(value)
	}, [value, editing])

	const registryNames = Object.keys(registry)
	const registryKey = registryNames.join(' ')
	const extensions = useMemo(
		() => portSignatureExtensions({ editor, excludeBlockId: blockId, registryNames: registryKey ? registryKey.split(' ') : [] }),
		[editor, blockId, registryKey],
	)

	const defaultText = evaluate ? parsePortSignature(liveText).defaultValue : ''
	const evalState = useDebouncedExpressionEval(defaultText, registry)
	const latestEval = useRef(onEvalResult)
	latestEval.current = onEvalResult
	useEffect(() => {
		if (evaluate) latestEval.current?.(evalState.result)
	}, [evaluate, evalState.result])

	// Diagnostics and the resolved ghost are pushed into the document as
	// effects, never re-rendered through React.
	useEffect(() => {
		const view = viewRef.current
		if (!view) return
		const result = evaluate ? evalState.result : null
		const usedNames = result?.usedNames ?? []
		const resolved = result?.ok && defaultText !== '' && result.repr && result.repr !== defaultText
			? result.repr
			: null
		view.dispatch({ effects: [setDiagnostics.of(usedNames), setResolved.of(resolved)] })
	}, [evaluate, evalState.result, defaultText, liveText])

	const hasError = evaluate && evalState.result != null && !evalState.result.ok
	const errorMessage = !evaluate
		? null
		: evalState.hostUnreachable
			? 'The local SystemSketch controller is not running — start it with npm run desktop:preview to evaluate expressions.'
			: evalState.result?.error ?? null
	const undefinedNames = (evaluate ? evalState.result?.usedNames ?? [] : []).filter((used) => !used.defined)
	const knownUndefined = undefinedNames.filter((used) => !isSafeNamespaceName(used.name))

	return (
		<span
			className={`ss-code-field-frame${className ? ` ${className}` : ''}`}
			data-error={hasError ? 'true' : undefined}
			data-unreachable={evaluate && evalState.hostUnreachable ? 'true' : undefined}
			data-testid={testId}
		>
			<CodeField
				value={value}
				disabled={disabled}
				placeholder={placeholder}
				ariaLabel={ariaLabel}
				ariaDescribedBy={helpId}
				ariaInvalid={hasError}
				extensions={extensions}
				onViewReady={(view) => { viewRef.current = view }}
				beginEdit={() => {
					setEditing(true)
					beginEdit?.()
				}}
				onWrite={(text) => {
					setEditing(true)
					setLiveText(text)
					const patch = portSignaturePatch(port, text)
					if (patch) onPatch(patch)
				}}
				onEditEnd={(text, startValue) => {
					setEditing(false)
					onEditEnd?.(text, startValue)
				}}
			/>
			{knownUndefined.length > 0 && !editing ? (
				<span className="ss-code-field-frame__warning" aria-hidden="true" title={errorMessage ?? undefined}>⚠</span>
			) : null}
			<span id={helpId} className="ss-code-field-frame__help">
				{errorMessage ?? 'name: Type = default — a colon adds a type, an equals sign a default'}
			</span>
		</span>
	)
}
