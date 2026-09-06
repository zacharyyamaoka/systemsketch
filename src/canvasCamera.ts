import type { Editor, TLCameraOptions, TldrawOptions } from 'tldraw'
import {
  DEFAULT_WHEEL_ZOOM_SENSITIVITY_PERCENT,
  getAppearancePreferences,
  subscribeAppearancePreferences,
} from './settings/appearancePreferences'

export const SYSTEMSKETCH_CAMERA_OPTIONS = {
  wheelBehavior: 'zoom',
  zoomSpeed: DEFAULT_WHEEL_ZOOM_SENSITIVITY_PERCENT / 100,
} satisfies Partial<TLCameraOptions>

/** SystemSketch has one durable canvas; structural depth replaces pages. */
export const SYSTEMSKETCH_EDITOR_OPTIONS = {
  maxPages: 1,
  camera: SYSTEMSKETCH_CAMERA_OPTIONS,
} satisfies Partial<TldrawOptions>

/** Make the product's wheel contract authoritative over tldraw's saved device mode. */
export function enforceSystemSketchWheelZoom(
  editor: Editor,
  scrollDownZoomsIn: boolean,
  wheelZoomSensitivityPercent: number,
): void {
  editor.setCameraOptions({
    ...SYSTEMSKETCH_CAMERA_OPTIONS,
    zoomSpeed: wheelZoomSensitivityPercent / 100,
  })

  // WHY: Zach navigates scale with an ordinary wheel. tldraw's Trackpad or
  // Auto modes can override wheelBehavior and silently turn that gesture into
  // panning. The mouse mode plus its public inversion preference preserve the
  // chosen direction, while the camera's public zoomSpeed tunes only wheel /
  // gesture gain. That leaves stock zoom steps and buttons alone, with no
  // intercepted events or replacement camera primitive.
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

/** Keep the live editor aligned when Appearance changes, and release on unmount. */
export function installSystemSketchWheelZoom(editor: Editor): () => void {
  const applyAppearance = () => {
    const preferences = getAppearancePreferences()
    enforceSystemSketchWheelZoom(
      editor,
      preferences.scrollDownZoomsIn,
      preferences.wheelZoomSensitivityPercent,
    )
  }
  applyAppearance()
  return subscribeAppearancePreferences(applyAppearance)
}
