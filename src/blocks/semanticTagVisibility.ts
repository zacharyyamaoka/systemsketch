import type { Editor } from 'tldraw'

/** Board-owned canvas lens; absence preserves the pre-toggle visible behavior. */
const META_KEY = 'systemsketch:semanticTagsVisible'

export function getSemanticTagsVisible(editor: Editor): boolean {
	return editor.getDocumentSettings().meta[META_KEY] !== false
}

export function setSemanticTagsVisible(editor: Editor, visible: boolean): void {
	const document = editor.getDocumentSettings()
	editor.store.put([{
		...document,
		meta: { ...document.meta, [META_KEY]: visible },
	}])
}
