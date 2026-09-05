import { describe, expect, it, vi } from 'vitest'
import type { Editor } from 'tldraw'
import {
  enforceSystemSketchWheelZoom,
  SYSTEMSKETCH_EDITOR_OPTIONS,
} from './canvasCamera'

function editorWithPreferences(
  inputMode: 'mouse' | 'trackpad' | null,
  isZoomDirectionInverted: boolean,
) {
  const setCameraOptions = vi.fn()
  const updateUserPreferences = vi.fn()
  return {
    editor: {
      setCameraOptions,
      user: {
        getUserPreferences: () => ({ inputMode, isZoomDirectionInverted }),
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
      const { editor, setCameraOptions, updateUserPreferences } = editorWithPreferences(inputMode, false)

      enforceSystemSketchWheelZoom(editor, true)

      expect(setCameraOptions).toHaveBeenCalledWith({ wheelBehavior: 'zoom' })
      expect(updateUserPreferences).toHaveBeenCalledWith({
        inputMode: 'mouse',
        isZoomDirectionInverted: true,
      })
    },
  )

  it('uses scroll down to zoom in by default', () => {
    const { editor, updateUserPreferences } = editorWithPreferences('mouse', false)

    enforceSystemSketchWheelZoom(editor, true)

    expect(updateUserPreferences).toHaveBeenCalledWith({
      inputMode: 'mouse',
      isZoomDirectionInverted: true,
    })
  })

  it('can flip to scroll up to zoom in', () => {
    const { editor, updateUserPreferences } = editorWithPreferences('mouse', true)

    enforceSystemSketchWheelZoom(editor, false)

    expect(updateUserPreferences).toHaveBeenCalledWith({
      inputMode: 'mouse',
      isZoomDirectionInverted: false,
    })
  })

  it('does not rewrite already-correct wheel preferences', () => {
    const { editor, updateUserPreferences } = editorWithPreferences('mouse', true)

    enforceSystemSketchWheelZoom(editor, true)

    expect(updateUserPreferences).not.toHaveBeenCalled()
  })
})
