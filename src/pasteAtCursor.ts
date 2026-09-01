import type { Editor } from 'tldraw'

type PastePreferenceEditor = Pick<Editor, 'user'>

/**
 * Makes ordinary paste use tldraw's supported cursor-placement path.
 *
 * tldraw still owns clipboard parsing, shape creation, placement, selection,
 * and history. The alternate paste shortcut and Preferences checkbox remain
 * available for temporarily pasting in place during the current session.
 */
export function enablePasteAtCursor(editor: PastePreferenceEditor): void {
  editor.user.updateUserPreferences({ isPasteAtCursorMode: true })
}
