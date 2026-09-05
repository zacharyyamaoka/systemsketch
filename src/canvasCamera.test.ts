import { describe, expect, it, vi } from 'vitest'
import type { Editor } from 'tldraw'
import {
  enforceSystemSketchWheelZoom,
  SYSTEMSKETCH_EDITOR_OPTIONS,
} from './canvasCamera'

function editorWithInputMode(inputMode: 'mouse' | 'trackpad' | null) {
  const setCameraOptions = vi.fn()
  const updateUserPreferences = vi.fn()
  return {
    editor: {
      setCameraOptions,
      user: {
        getUserPreferences: () => ({ inputMode }),
        updateUserPreferences,
      },
    } as unknown as Editor,
    setCameraOptions,
    updateUserPreferences,
  }
}

describe('SystemSketch wheel zoom', () => {
  it('declares zoom as the initial stock camera behavior', () => {
    expect(SYSTEMSKETCH_EDITOR_OPTIONS.camera).toEqual({ wheelBehavior: 'zoom' })
  })

  it.each(['trackpad', null] as const)(
    'replaces the %s device mode that would override wheel zoom',
    (inputMode) => {
      const { editor, setCameraOptions, updateUserPreferences } = editorWithInputMode(inputMode)

      enforceSystemSketchWheelZoom(editor)

      expect(setCameraOptions).toHaveBeenCalledWith({ wheelBehavior: 'zoom' })
      expect(updateUserPreferences).toHaveBeenCalledWith({ inputMode: 'mouse' })
    },
  )

  it('does not rewrite an already-correct mouse preference', () => {
    const { editor, updateUserPreferences } = editorWithInputMode('mouse')

    enforceSystemSketchWheelZoom(editor)

    expect(updateUserPreferences).not.toHaveBeenCalled()
  })
})
