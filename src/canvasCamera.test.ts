import { describe, expect, it, vi } from 'vitest'
import type { Editor } from 'tldraw'
import {
  enforceSystemSketchCanvasNavigation,
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

describe('SystemSketch canvas navigation', () => {
  it('declares stock pan as the initial camera behavior', () => {
    expect(SYSTEMSKETCH_EDITOR_OPTIONS.camera).toEqual({ wheelBehavior: 'pan' })
  })

  it.each(['trackpad', null] as const)(
    'makes direct zoom authoritative over the %s device mode',
    (inputMode) => {
      const { editor, setCameraOptions, updateUserPreferences } = editorWithPreferences(inputMode, false)

      enforceSystemSketchCanvasNavigation(editor, true, true, 100)

      expect(setCameraOptions).toHaveBeenCalledWith({ wheelBehavior: 'zoom', zoomSpeed: 1 })
      expect(updateUserPreferences).toHaveBeenCalledWith({
        inputMode: 'mouse',
        isZoomDirectionInverted: true,
      })
    },
  )

  it('uses scroll down to zoom in when direct zoom is enabled', () => {
    const { editor, updateUserPreferences } = editorWithPreferences('mouse', false)

    enforceSystemSketchCanvasNavigation(editor, true, true, 100)

    expect(updateUserPreferences).toHaveBeenCalledWith({
      inputMode: 'mouse',
      isZoomDirectionInverted: true,
    })
  })

  it('can flip to scroll up to zoom in', () => {
    const { editor, updateUserPreferences } = editorWithPreferences('mouse', true)

    enforceSystemSketchCanvasNavigation(editor, true, false, 100)

    expect(updateUserPreferences).toHaveBeenCalledWith({
      inputMode: 'mouse',
      isZoomDirectionInverted: false,
    })
  })

  it('does not rewrite already-correct direct-wheel preferences', () => {
    const { editor, updateUserPreferences } = editorWithPreferences('mouse', true)

    enforceSystemSketchCanvasNavigation(editor, true, true, 100)

    expect(updateUserPreferences).not.toHaveBeenCalled()
  })

  it('projects the sensitivity percentage onto tldraw zoomSpeed', () => {
    const { editor, setCameraOptions } = editorWithPreferences('mouse', true)

    enforceSystemSketchCanvasNavigation(editor, true, true, 135)

    expect(setCameraOptions).toHaveBeenCalledWith({ wheelBehavior: 'zoom', zoomSpeed: 1.35 })
  })

  it('restores stock pan and the modifier-zoom input mode when direct zoom is off', () => {
    const { editor, setCameraOptions, updateUserPreferences } = editorWithPreferences('mouse', true)

    enforceSystemSketchCanvasNavigation(editor, false, true, 135)

    expect(setCameraOptions).toHaveBeenCalledWith({ wheelBehavior: 'pan', zoomSpeed: 1 })
    expect(updateUserPreferences).toHaveBeenCalledWith({ inputMode: 'trackpad' })
  })

  it('does not rewrite the already-stock input mode', () => {
    const { editor, updateUserPreferences } = editorWithPreferences('trackpad', false)

    enforceSystemSketchCanvasNavigation(editor, false, true, 100)

    expect(updateUserPreferences).not.toHaveBeenCalled()
  })

  it('projects Settings → Canvas → Sensitivity onto stock-mode zoomSpeed, independent of the direct-mode sensitivity', () => {
    const { editor, setCameraOptions } = editorWithPreferences('trackpad', false)

    enforceSystemSketchCanvasNavigation(editor, false, true, 100, 150)

    expect(setCameraOptions).toHaveBeenCalledWith({ wheelBehavior: 'pan', zoomSpeed: 1.5 })
  })

  it('defaults the stock-mode sensitivity to 100% when the caller omits it', () => {
    const { editor, setCameraOptions } = editorWithPreferences('trackpad', false)

    enforceSystemSketchCanvasNavigation(editor, false, true, 100)

    expect(setCameraOptions).toHaveBeenCalledWith({ wheelBehavior: 'pan', zoomSpeed: 1 })
  })
})
