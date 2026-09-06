import { history, historyKeymap, defaultKeymap, indentWithTab } from '@codemirror/commands'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { sql } from '@codemirror/lang-sql'
import { syntaxHighlighting } from '@codemirror/language'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { classHighlighter } from '@lezer/highlight'
import { useEffect, useRef } from 'react'
import { useEditor, useValue } from 'tldraw'
import { codeFontPixels, type CodeLanguage, type CodeShape } from './codeModel'
import './code-block.css'

function languageExtension(language: CodeLanguage): Extension {
	switch (language) {
		case 'python': return python()
		case 'javascript': return javascript()
		case 'typescript': return javascript({ typescript: true })
		case 'json': return json()
		case 'html': return html()
		case 'css': return css()
		case 'sql': return sql()
		case 'markdown': return markdown()
		default: return []
	}
}

/**
 * Everything visual lives in `code-block.css` against `--ss-*` tokens —
 * `classHighlighter` emits stable `tok-*` classes instead of baked-in colours,
 * so one stylesheet keeps the document legible in every board theme (the
 * house rule: theme tokens on the container, never a second palette).
 */
function presentationExtensions(shape: CodeShape): Extension[] {
	return [
		...(shape.props.showLineNumbers ? [lineNumbers()] : []),
		languageExtension(shape.props.language),
		EditorView.theme({ '&': { fontSize: `${codeFontPixels(shape.props.size, shape.props.fontScale)}px` } }),
	]
}

export function CodeBlockCanvas({ shape }: { shape: CodeShape }) {
	const editor = useEditor()
	const hostRef = useRef<HTMLDivElement>(null)
	const viewRef = useRef<EditorView | null>(null)
	const presentationRef = useRef(new Compartment())
	const editableRef = useRef(new Compartment())
	const isEditing = useValue(
		'editing Code block',
		() => editor.getEditingShapeId() === shape.id,
		[editor, shape.id],
	)

	useEffect(() => {
		const host = hostRef.current
		if (!host) return
		const view = new EditorView({
			state: EditorState.create({
				doc: shape.props.code,
				extensions: [
					history(),
					// Tab indents inside a focused document; acceptCompletion and
					// friends are not wired here — the Code block is raw text plus
					// display preferences, never a language service (hard gate g3).
					keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
					syntaxHighlighting(classHighlighter),
					presentationRef.current.of(presentationExtensions(shape)),
					editableRef.current.of(EditorView.editable.of(false)),
					EditorView.lineWrapping,
					EditorView.updateListener.of((update) => {
						if (!update.docChanged) return
						const code = update.state.doc.toString()
						const current = editor.getShape<CodeShape>(shape.id)
						if (current && current.props.code !== code) {
							editor.updateShape<CodeShape>({ id: shape.id, type: shape.type, props: { code } })
						}
					}),
				],
			}),
			parent: host,
		})
		viewRef.current = view
		return () => {
			viewRef.current = null
			view.destroy()
		}
		// The document mounts once per shape; presentation and text changes are
		// reconciled through the compartment/dispatch effects below so typing
		// never tears down the editor mid-gesture.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [editor, shape.id])

	useEffect(() => {
		viewRef.current?.dispatch({
			effects: presentationRef.current.reconfigure(presentationExtensions(shape)),
		})
	}, [shape.props.language, shape.props.size, shape.props.fontScale, shape.props.showLineNumbers])

	useEffect(() => {
		const view = viewRef.current
		if (!view || view.state.doc.toString() === shape.props.code) return
		view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: shape.props.code } })
	}, [shape.props.code])

	// The document is only a text input while tldraw says the shape is being
	// edited; otherwise CodeMirror is a read-only rendering and the engine owns
	// every pointer gesture (drag, select, resize) exactly as for any shape.
	useEffect(() => {
		const view = viewRef.current
		if (!view) return
		view.dispatch({ effects: editableRef.current.reconfigure(EditorView.editable.of(isEditing)) })
		if (!isEditing) return
		const frame = requestAnimationFrame(() => view.focus())
		return () => cancelAnimationFrame(frame)
	}, [isEditing])

	return (
		<div
			className="code-block-canvas"
			data-editing={isEditing}
			data-testid={`code-block-${shape.id}`}
			onPointerDown={(event) => {
				// Until the explicit click-to-edit transaction, tldraw owns the
				// pointer so the shape remains a normal canvas object.
				if (isEditing) event.stopPropagation()
			}}
		>
			<div className="code-block-canvas__editor" ref={hostRef} />
		</div>
	)
}
