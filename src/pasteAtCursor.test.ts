import type { Editor } from 'tldraw'
import { describe, expect, it, vi } from 'vitest'
import { enablePasteAtCursor } from './pasteAtCursor'

describe('paste at cursor preference', () => {
  it('enables tldraw\'s supported cursor-placement mode', () => {
    const updateUserPreferences = vi.fn()
    const editor = {
      user: { updateUserPreferences },
    } as unknown as Pick<Editor, 'user'>

    enablePasteAtCursor(editor)

    expect(updateUserPreferences).toHaveBeenCalledOnce()
    expect(updateUserPreferences).toHaveBeenCalledWith({ isPasteAtCursorMode: true })
  })
})
