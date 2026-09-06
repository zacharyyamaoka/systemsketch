import { history, historyKeymap, defaultKeymap } from '@codemirror/commands'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { sql } from '@codemirror/lang-sql'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view'
import { useEffect, useRef } from 'react'
import { useEditor, useValue } from 'tldraw'
import { type CodeLanguage, type CodeShape } from './codeModel'
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

/** CodeMirror's visual system consumes product tokens instead of a second theme. */
const codeMirrorTheme = EditorView.theme({
	'&': {
		height: '100%',
		backgroundColor: 'var(--ss-code-surface)',
		color: 'var(--ss-code-text)',
	},
	'.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' },
	'.cm-content': { caretColor: 'var(--ss-accent)' },
	'.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--ss-accent)' },
	'.cm-activeLine': { backgroundColor: 'var(--ss-surface-hover)' },
	'.cm-activeLineGutter': { backgroundColor: 'var(--ss-surface-hover)' },
	'.cm-gutters': {
		backgroundColor: 'var(--ss-code-surface)',
		color: 'var(--ss-text-muted)',
		borderRight: '1px solid var(--ss-border-inverse)',
	},
	'.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
		backgroundColor: 'var(--ss-accent-soft)',
	},
})

function codeExtensions(shape: CodeShape, onChange: (value: string) => void): Extension[] {
	return [
		EditorView.lineWrapping,
		history(),
		keymap.of([...defaultKeymap, ...historyKeymap]),
		syntaxHighlighting(defaultHighlightStyle),
		highlightActiveLine(),
		highlightActiveLineGutter(),
		...(shape.props.showLineNumbers ? [lineNumbers()] : []),
		languageExtension(shape.props.language),
		codeMirrorTheme,
		EditorView.theme({ '&': { fontSize: `${shape.props.fontSize}px` } }),
		EditorView.updateListener.of((update) => {
			if (update.docChanged) onChange(update.state.doc.toString())
		}),
	]
}

export function CodeBlockCanvas({ shape }: { shape: CodeShape }) {
	const editor = useEditor()
	const hostRef = useRef<HTMLDivElement>(null)
	const viewRef = useRef<EditorView | null>(null)
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
				extensions: codeExtensions(shape, (code) => {
					const current = editor.getShape<CodeShape>(shape.id)
					if (current?.props.code !== code) {
						editor.updateShape<CodeShape>({ id: shape.id, type: shape.type, props: { code } })
					}
				}),
			}),
			parent: host,
		})
		viewRef.current = view
		return () => {
			viewRef.current = null
			view.destroy()
		}
		// Presentation changes reconfigure CodeMirror with one coherent state;
		// document changes travel through the sync effect below and keep typing local.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [editor, shape.id, shape.props.language, shape.props.fontSize, shape.props.showLineNumbers])

	useEffect(() => {
		const view = viewRef.current
		if (!view || view.state.doc.toString() === shape.props.code) return
		view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: shape.props.code } })
	}, [shape.props.code])

	useEffect(() => {
		if (!isEditing) return
		const frame = requestAnimationFrame(() => viewRef.current?.focus())
		return () => cancelAnimationFrame(frame)
	}, [isEditing])

	return (
		<div
			className="code-block-canvas"
			data-editing={isEditing}
			data-testid={`code-block-${shape.id}`}
			onPointerDown={(event) => {
				// Until the explicit double-click-to-edit transaction, tldraw owns
				// the pointer so the shape remains a normal canvas object.
				if (isEditing) event.stopPropagation()
			}}
		>
			<div className="code-block-canvas__header" aria-hidden="true">
				<span>{shape.props.language === 'plaintext' ? 'Plain text' : shape.props.language}</span>
				<span>{shape.props.characterWidth}ch</span>
			</div>
			<div className="code-block-canvas__editor" ref={hostRef} />
		</div>
	)
}
