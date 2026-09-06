import { acceptCompletion, completionStatus } from '@codemirror/autocomplete'
import {
	defaultKeymap,
	history,
	historyKeymap,
	indentWithTab,
	moveLineDown,
	moveLineUp,
} from '@codemirror/commands'
import { indentUnit } from '@codemirror/language'
import {
	Annotation,
	EditorState,
	Prec,
	RangeSetBuilder,
	StateEffect,
	StateField,
} from '@codemirror/state'
import { Decoration, EditorView, keymap, tooltips, type DecorationSet } from '@codemirror/view'
import { useEffect, useLayoutEffect, useRef } from 'react'

import type { SourceSpan } from './sourceHighlight'
import { typeNameCompletion, type TypeNameCompletionOptions } from './typeNameCompletion'

/**
 * What a caller may do to the live editor — the narrow seam
 * `useSourceToggleEditor` needs (place the caret on entry, focus, and decide
 * whether a pointerdown landed inside the editor), with no CodeMirror types
 * leaking out of this module.
 */
export interface SourceEditorHandle {
	focus(): void
	setCaret(offset: number): void
	contains(node: Node): boolean
}

/** Marks our own value-prop sync so the change listener doesn't echo it back. */
const externalSync = Annotation.define<boolean>()
const refreshHighlight = StateEffect.define<null>()

function buildDecorations(
	state: EditorState,
	highlightLine: (raw: string, lineIndex: number) => SourceSpan[] | null,
): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>()
	for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber++) {
		const line = state.doc.line(lineNumber)
		const spans = highlightLine(line.text, lineNumber - 1) ?? []
		for (const span of spans) {
			const from = line.from + Math.max(0, Math.min(span.from, line.length))
			const to = line.from + Math.max(0, Math.min(span.to, line.length))
			if (to > from) builder.add(from, to, Decoration.mark({ class: span.className }))
		}
	}
	return builder.finish()
}

/**
 * The Source-mode editor shared by the Type and Type Mapping babbles — the
 * same seam the old transparent-textarea-over-`<pre>` version exposed, with a
 * real CodeMirror 6 document inside it now that the Code primitive brought
 * the dependency in for real. Generic over WHAT gets highlighted: each
 * grammar passes its own `highlightLine` span function and (optionally) its
 * own completion slot rule, instead of this component knowing about
 * attributes or aliases.
 *
 * What CodeMirror replaced outright:
 *  - `codeEditorKeymap.ts` (hand-rolled Tab/Shift-Tab indent and
 *    Ctrl/Cmd+Up/Down move-line) -> `indentWithTab` + `moveLineUp/Down`;
 *  - the mirror-div caret-pixel hack in `TypeNameAutocomplete.tsx` -> the
 *    tooltip system's `coordsAtPos` (see `typeNameCompletion.ts`).
 */
export function SourceCodeEditor({
	value,
	highlightLine,
	onChange,
	onBlur,
	onCancel,
	autoFocus,
	initialCaret,
	testId,
	handleRef,
	className = 'TypeBabble',
	completion,
}: {
	value: string
	/** Line-relative class spans for one raw line; null leaves it unstyled. */
	highlightLine(raw: string, lineIndex: number): SourceSpan[] | null
	onChange(value: string): void
	/** Focus left the document — the callers' commit path. */
	onBlur?(): void
	/** Escape pressed with no completion open — the callers' cancel path. */
	onCancel?(): void
	autoFocus?: boolean
	/**
	 * Where the caret lands when this editor mounts (also focuses, so
	 * `autoFocus` is redundant beside it). Applied INSIDE the mount effect, not
	 * by the caller after mounting, and that placement is load-bearing: React
	 * StrictMode — the dev server's normal mode, i.e. the Preview Zach actually
	 * judges — double-invokes mount effects, destroying and recreating the
	 * EditorView once per mount. A caller that placed the caret from its own
	 * one-shot effect hit only the FIRST view; the recreated second view then
	 * sat at offset 0, which was exactly the "cursor always lands at the start
	 * of the source" bug. A mount-owned caret is re-applied to every view this
	 * effect creates, so the surviving view always gets it.
	 */
	initialCaret?: number | null
	testId?: string
	handleRef?: React.RefObject<SourceEditorHandle | null>
	className?: 'TypeBabble' | 'TypeMapping'
	completion?: TypeNameCompletionOptions
}) {
	const hostRef = useRef<HTMLDivElement>(null)
	const viewRef = useRef<EditorView | null>(null)
	const initialCaretRef = useRef(initialCaret)
	initialCaretRef.current = initialCaret

	// Latest-callback refs: the view mounts once, but every prop closure is
	// re-created per render, and a listener created at mount must not commit a
	// stale draft (the same rule `useSourceToggleEditor` documents for its own
	// pointerdown listener).
	const highlightRef = useRef(highlightLine)
	highlightRef.current = highlightLine
	const onChangeRef = useRef(onChange)
	onChangeRef.current = onChange
	const onBlurRef = useRef(onBlur)
	onBlurRef.current = onBlur
	const onCancelRef = useRef(onCancel)
	onCancelRef.current = onCancel

	// Layout effect, not passive: the parent hook's document-level pointerdown
	// listener consults `handleRef` on the SAME commit that mounts this
	// component, and child layout effects run first — the handle has to exist
	// before the parent's effects do.
	useLayoutEffect(() => {
		const host = hostRef.current
		if (!host) return

		const highlightField = StateField.define<DecorationSet>({
			create: (state) => buildDecorations(state, highlightRef.current),
			update(decorations, tr) {
				if (tr.docChanged || tr.effects.some((effect) => effect.is(refreshHighlight))) {
					return buildDecorations(tr.state, highlightRef.current)
				}
				return decorations.map(tr.changes)
			},
			provide: (field) => EditorView.decorations.from(field),
		})

		const view = new EditorView({
			state: EditorState.create({
				doc: value,
				extensions: [
					history(),
					// Accept-with-Tab outranks indent-with-Tab; `acceptCompletion`
					// returns false with no completion open, falling through to the
					// ordinary indent.
					Prec.high(keymap.of([{ key: 'Tab', run: acceptCompletion }])),
					Prec.high(keymap.of([{
						key: 'Escape',
						run: (target) => {
							// An open completion owns Escape (close the list); only a
							// bare Escape cancels the whole Source session.
							if (completionStatus(target.state) !== null) return false
							onCancelRef.current?.()
							return true
						},
					}])),
					keymap.of([
						// The house gesture is Ctrl/Cmd+Up/Down (defaultKeymap's
						// Alt-Arrow variants also still work).
						{ key: 'Mod-ArrowUp', run: moveLineUp },
						{ key: 'Mod-ArrowDown', run: moveLineDown },
						indentWithTab,
						...defaultKeymap,
						...historyKeymap,
					]),
					indentUnit.of('\t'),
					highlightField,
					...(completion ? [typeNameCompletion(completion)] : []),
					// WHY the tooltip parents onto `.tl-container`, not the editor:
					// left inside the shape's own subtree, the autocomplete lived
					// under the canvas's transformed shape layer, where z-index can
					// never beat a sibling shape painted later — a plain arrow on the
					// board drew ON TOP of the open completion list. The container is
					// outside the transformed layer (so `absolute` positioning holds
					// at any zoom — CodeMirror anchors by real client rects), is
					// `position: relative`, and still carries the `--tl-*`/`--ss-*`
					// theme variables the tooltip's CSS reads. Paired with the
					// max z-index in `type-name-autocomplete.css`, the popup now
					// out-stacks every shape and every app panel, per Zach's "it
					// needs to go to maximum z level" call. Fixed positioning stays
					// ruled out: any transformed ancestor would re-root it.
					tooltips({
						position: 'absolute',
						parent: host.closest<HTMLElement>('.tl-container') ?? document.body,
					}),
					EditorView.updateListener.of((update) => {
						if (!update.docChanged) return
						if (update.transactions.every((tr) => tr.annotation(externalSync))) return
						onChangeRef.current(update.state.doc.toString())
					}),
					EditorView.domEventHandlers({
						// CodeMirror's contentDOM briefly loses and regains focus
						// during its own mount/measure work (observed: out -> in ->
						// out -> in inside one commit). A synchronous commit on the
						// first flicker unmounts the editor mid-flight, so "focus
						// left" is only believed once it survives a macrotask.
						blur: () => {
							setTimeout(() => {
								const view = viewRef.current
								if (view && !view.hasFocus) onBlurRef.current?.()
							}, 0)
						},
					}),
				],
			}),
			parent: host,
		})
		viewRef.current = view
		const setCaret = (offset: number) => {
			const anchor = Math.max(0, Math.min(offset, view.state.doc.length))
			view.dispatch({ selection: { anchor } })
			view.focus()
		}
		if (handleRef) {
			handleRef.current = {
				focus: () => view.focus(),
				setCaret,
				// The autocomplete tooltip now mounts on `.tl-container` (see the
				// `tooltips` extension above), OUTSIDE this host — but a pointerdown
				// on a completion row must still read as "inside the editor", or the
				// callers' commit-on-outside-click listener would close Source mode
				// under the click that was choosing a completion.
				contains: (node) => {
					if (host.contains(node)) return true
					const element = node instanceof Element ? node : node.parentElement
					return element?.closest('.cm-tooltip') != null
				},
			}
		}
		// See the `initialCaret` prop doc: this must live in the mount effect so
		// StrictMode's recreated view gets the entry caret too.
		const entryCaret = initialCaretRef.current
		if (entryCaret != null) setCaret(entryCaret)
		else if (autoFocus) view.focus()
		return () => {
			if (handleRef?.current && viewRef.current === view) handleRef.current = null
			viewRef.current = null
			view.destroy()
		}
		// One mount per Source session — value/highlight changes flow through
		// the dispatch effects below.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	useEffect(() => {
		const view = viewRef.current
		if (!view || view.state.doc.toString() === value) return
		view.dispatch({
			changes: { from: 0, to: view.state.doc.length, insert: value },
			annotations: externalSync.of(true),
		})
	}, [value])

	// The span judgement can change without the text changing (a Type block
	// elsewhere on the board was renamed mid-edit); nudge the field.
	useEffect(() => {
		viewRef.current?.dispatch({ effects: refreshHighlight.of(null) })
	}, [highlightLine])

	return (
		<div
			className={`${className}-codeEditor ${className}-codeEditor--cm`}
			data-testid={testId}
			ref={hostRef}
			onPointerDown={(event) => event.stopPropagation()}
		/>
	)
}
