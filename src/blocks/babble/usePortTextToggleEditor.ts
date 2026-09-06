import { useEffect, useRef, useState } from 'react'
import { useEditor } from 'tldraw'

import type { BlockShape, BlockShapeProps } from '../blockModel'
import type { SourceEditorHandle } from './SourceCodeEditor'
import { applyParsedPortText, type ParsedPortText } from './portTextShared'

export interface PortTextGrammar {
	serialize(props: BlockShapeProps): string
	parse(source: string): ParsedPortText
}

/**
 * The port-text analogue of `useSourceToggleEditor`. The one structural
 * difference: there is no persisted source string. `props.inputs` /
 * `props.outputs` stay the one canonical record, exactly as they are for
 * every ordinary Block; `serialize` projects them into text fresh on every
 * entry into Source mode, and `commit` runs the grammar's `parse` back
 * through `applyParsedPortText` to reconcile a real `BlockPort[]` — this is a
 * transient editing surface over the shipped schema, not a second one.
 */
export function usePortTextToggleEditor(shape: BlockShape, historyLabel: string, grammar: PortTextGrammar) {
	const editor = useEditor()
	const source = grammar.serialize(shape.props)
	const [mode, setMode] = useState<'ui' | 'source'>('ui')
	const [draft, setDraft] = useState(source)
	const pendingCaret = useRef<number | null>(null)
	const sourceEditorRef = useRef<SourceEditorHandle | null>(null)

	useEffect(() => { setDraft(source) }, [source, mode])

	// Caret placement deliberately absent here — same StrictMode double-mount
	// rationale as `useSourceToggleEditor`: the entry caret is handed to
	// `SourceCodeEditor` as `initialCaret` and applied by ITS mount effect, so
	// the recreated dev-mode view gets it too. `pendingCaret` lives for the
	// whole source session and is cleared on exit.

	const commit = () => {
		const next = draft.replace(/\r\n?/g, '\n')
		pendingCaret.current = null
		setMode('ui')
		if (next === source || editor.getIsReadonly()) return
		const parsed = grammar.parse(next)
		const nextProps = applyParsedPortText(shape.props, parsed)
		editor.markHistoryStoppingPoint(historyLabel)
		editor.updateShape<BlockShape>({ id: shape.id, type: shape.type, props: nextProps })
	}
	const cancel = () => { setDraft(source); pendingCaret.current = null; setMode('ui') }

	// Same rationale as `useSourceToggleEditor`: tldraw's canvas pointer
	// handling never lets a click on the canvas, another shape, or this
	// block's own chrome reach the editor's native `blur`, so a
	// capture-phase document listener is the one reliable "clicked outside."
	const commitRef = useRef(commit)
	commitRef.current = commit
	useEffect(() => {
		if (mode !== 'source') return
		const handlePointerDown = (event: PointerEvent) => {
			const handle = sourceEditorRef.current
			if (!handle) return
			if (event.target instanceof Node && handle.contains(event.target)) return
			commitRef.current()
		}
		document.addEventListener('pointerdown', handlePointerDown, true)
		return () => document.removeEventListener('pointerdown', handlePointerDown, true)
	}, [mode])

	const enterSourceAt = (offset: number) => {
		if (editor.getIsReadonly()) return
		pendingCaret.current = offset
		if (mode === 'source') { sourceEditorRef.current?.setCaret(offset); return }
		setMode('source')
	}

	return {
		editor, source, mode, setMode, draft, setDraft, commit, cancel, enterSourceAt, sourceEditorRef,
		/** Pass straight through as `SourceCodeEditor`'s `initialCaret`. */
		sourceCaret: pendingCaret.current,
	}
}

/**
 * V4's interaction model has no toggle at all — the source editor is always
 * mounted, always focusable, always the truth — so it needs neither `mode`
 * nor the caret-placement plumbing the toggle variants share. Simpler to
 * give it its own small hook than to force a two-mode state machine to
 * pretend it only has one mode.
 */
export function usePortTextAlwaysLiveEditor(shape: BlockShape, historyLabel: string, grammar: PortTextGrammar) {
	const editor = useEditor()
	const source = grammar.serialize(shape.props)
	const [draft, setDraft] = useState(source)
	const sourceEditorRef = useRef<SourceEditorHandle | null>(null)

	useEffect(() => { setDraft(source) }, [source])

	const commit = () => {
		const next = draft.replace(/\r\n?/g, '\n')
		if (next === source || editor.getIsReadonly()) return
		const parsed = grammar.parse(next)
		const nextProps = applyParsedPortText(shape.props, parsed)
		editor.markHistoryStoppingPoint(historyLabel)
		editor.updateShape<BlockShape>({ id: shape.id, type: shape.type, props: nextProps })
	}
	const cancel = () => setDraft(source)

	const commitRef = useRef(commit)
	commitRef.current = commit
	useEffect(() => {
		const handlePointerDown = (event: PointerEvent) => {
			const handle = sourceEditorRef.current
			if (!handle) return
			if (event.target instanceof Node && handle.contains(event.target)) return
			commitRef.current()
		}
		document.addEventListener('pointerdown', handlePointerDown, true)
		return () => document.removeEventListener('pointerdown', handlePointerDown, true)
	}, [])

	return { editor, source, draft, setDraft, commit, cancel, sourceEditorRef }
}
