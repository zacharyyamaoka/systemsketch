import type { Editor, TLCameraOptions, TldrawOptions } from 'tldraw'
import {
  DEFAULT_WHEEL_ZOOM_SENSITIVITY_PERCENT,
  getAppearancePreferences,
  subscribeAppearancePreferences,
} from './settings/appearancePreferences'

export const SYSTEMSKETCH_CAMERA_OPTIONS = {
  wheelBehavior: 'pan',
} satisfies Partial<TLCameraOptions>

/** SystemSketch has one durable canvas; structural depth replaces pages. */
export const SYSTEMSKETCH_EDITOR_OPTIONS = {
  maxPages: 1,
  camera: SYSTEMSKETCH_CAMERA_OPTIONS,
} satisfies Partial<TldrawOptions>

/**
 * Keep the canvas on one of two supported tldraw camera contracts.
 *
 * WHY: `inputMode` takes precedence over `wheelBehavior` inside tldraw. The
 * prior direct-zoom preference wrote `mouse`, so merely restoring
 * `wheelBehavior: 'pan'` would leave a later switch back to normal navigation
 * silently zooming. Naming both stock modes through the public preferences
 * makes the mode switch truthful without intercepting wheel events or
 * reimplementing a camera.
 */
export function enforceSystemSketchCanvasNavigation(
  editor: Editor,
  directWheelZoom: boolean,
  scrollDownZoomsIn: boolean,
  wheelZoomSensitivityPercent: number,
): void {
  if (!directWheelZoom) {
    editor.setCameraOptions({
      ...SYSTEMSKETCH_CAMERA_OPTIONS,
      // Direct mode may have changed this; Ctrl/Cmd + wheel in normal mode
      // deserves the same one-to-one stock gain as a first-run whiteboard.
      zoomSpeed: DEFAULT_WHEEL_ZOOM_SENSITIVITY_PERCENT / 100,
    })
    const current = editor.user.getUserPreferences()
    if (current.inputMode !== 'trackpad') {
      editor.user.updateUserPreferences({ inputMode: 'trackpad' })
    }
    return
  }

  editor.setCameraOptions({
    ...SYSTEMSKETCH_CAMERA_OPTIONS,
    wheelBehavior: 'zoom',
    zoomSpeed: wheelZoomSensitivityPercent / 100,
  })

  const current = editor.user.getUserPreferences()
  if (
    current.inputMode !== 'mouse'
    || current.isZoomDirectionInverted !== scrollDownZoomsIn
  ) {
    editor.user.updateUserPreferences({
      inputMode: 'mouse',
      isZoomDirectionInverted: scrollDownZoomsIn,
    })
  }
}

/** Keep the live editor aligned when Canvas settings change, and release on unmount. */
export function installSystemSketchCanvasNavigation(editor: Editor): () => void {
  const applyAppearance = () => {
    const preferences = getAppearancePreferences()
    enforceSystemSketchCanvasNavigation(
      editor,
      preferences.directWheelZoom,
      preferences.scrollDownZoomsIn,
      preferences.wheelZoomSensitivityPercent,
    )
  }
  applyAppearance()
  return subscribeAppearancePreferences(applyAppearance)
}
