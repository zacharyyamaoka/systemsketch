import { useEffect, useRef, useState } from 'react'
import { useEditor, useValue } from 'tldraw'

import type { BlockShape } from '../blockModel'
import type { SourceEditorHandle } from './SourceCodeEditor'
import { consumeSourceJump, pendingSourceJump } from './typeSourceJump'

/**
 * The mechanics shared by both babbles' "Code Cell" direction — a pretty
 * read view, a real CodeMirror document in source mode, one committed
 * history step on blur, Escape-to-cancel, and a double-click-a-row gesture
 * that lands the cursor where the click happened instead of always at the
 * start. Neither grammar (flat `name: type` attributes, or `Name = expr`
 * aliases) matters here — both store their source in the same
 * `attributeSource` prop, so this is genuinely one component's worth of
 * state, not two similar copies.
 */
export function useSourceToggleEditor(shape: BlockShape, historyLabel: string) {
	const editor = useEditor()
	const source = shape.props.attributeSource ?? ''
	const [mode, setMode] = useState<'ui' | 'source'>('ui')
	const [draft, setDraft] = useState(source)
	const pendingCaret = useRef<number | null>(null)
	const sourceEditorRef = useRef<SourceEditorHandle | null>(null)

	useEffect(() => { setDraft(source) }, [source, mode])

	// WHY there is no caret-placing effect here: the entry caret rides into
	// `SourceCodeEditor` as its `initialCaret` prop and is applied by that
	// component's own mount effect. A one-shot layout effect in THIS hook used
	// to consume `pendingCaret` and call `setCaret` on the freshly mounted
	// view — but React StrictMode (dev, i.e. the Preview channel Zach judges)
	// destroys and recreates that view once per mount AFTER this hook's effect
	// has already spent the caret, so the surviving view always sat at offset
	// 0. The ref is kept for the whole source session (cleared on exit below)
	// so every view the child creates can re-apply it.

	// Leaving the source box — by committing OR by cancelling — always drops
	// back to the pretty UI view. Selecting something else entirely (another
	// shape, empty canvas) blurs this same editor the same way a plain
	// click elsewhere inside the block does, so "click outside the code box"
	// and "click outside the block" both land here for free.
	const commit = () => {
		const next = draft.replace(/\r\n?/g, '\n')
		pendingCaret.current = null
		setMode('ui')
		if (next === source || editor.getIsReadonly()) return
		editor.markHistoryStoppingPoint(historyLabel)
		editor.updateShape<BlockShape>({ id: shape.id, type: shape.type, props: { attributeSource: next } })
	}
	const cancel = () => { setDraft(source); pendingCaret.current = null; setMode('ui') }

	// tldraw's own canvas pointer handling calls `preventDefault()` on its
	// pointerdown (it manages its own drag/select/pan gesture), which — per
	// plain DOM semantics — means clicking the canvas, another shape, or this
	// block's own header/toggle NEVER fires the editor's native `blur`.
	// A capture-phase listener on `document` sees the pointerdown before
	// tldraw's own handler can act on it regardless, so it's the one place
	// "clicked outside the source box" is reliably observable. `commitRef`
	// (not `commit` directly) is what a listener created once per mode-entry
	// must close over, or the LAST keystroke before the click would be lost —
	// this effect's own deps are `[mode]`, not `[draft]`. The handle's
	// `contains` covers CodeMirror's whole mount, autocomplete tooltip
	// included, so choosing a completion never reads as "clicked outside."
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

	/** Switch into source mode with the caret at `offset` in the full source. */
	const enterSourceAt = (offset: number) => {
		if (editor.getIsReadonly()) return
		pendingCaret.current = offset
		// Already open (e.g. a foreign row elsewhere named this block while its
		// source box is up): there is no remount coming, so place the caret on
		// the live view directly.
		if (mode === 'source') { sourceEditorRef.current?.setCaret(offset); return }
		setMode('source')
	}

	// A row in a DIFFERENT block's expanded preview named this shape as its
	// owner and asked to land here — see `typeSourceJump.ts`. Read reactively
	// (so every mounted Type block's hook notices its own request land) but
	// act and clear in an effect, never during the render that observed it.
	const jumpRequestedForMe = useValue(
		'type source jump for ' + shape.id,
		() => pendingSourceJump.get()?.blockId === shape.id,
		[shape.id],
	)
	useEffect(() => {
		if (!jumpRequestedForMe) return
		const offset = consumeSourceJump(shape.id)
		if (offset !== null) enterSourceAt(offset)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [jumpRequestedForMe])

	return {
		editor, source, mode, setMode, draft, setDraft, commit, cancel, enterSourceAt, sourceEditorRef,
		/** Pass straight through as `SourceCodeEditor`'s `initialCaret`. */
		sourceCaret: pendingCaret.current,
	}
}
