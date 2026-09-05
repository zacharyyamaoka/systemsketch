import type { Editor, TLCameraOptions, TldrawOptions } from 'tldraw'

export const SYSTEMSKETCH_CAMERA_OPTIONS = {
  wheelBehavior: 'zoom',
} satisfies Partial<TLCameraOptions>

/** SystemSketch has one durable canvas; structural depth replaces pages. */
export const SYSTEMSKETCH_EDITOR_OPTIONS = {
  maxPages: 1,
  camera: SYSTEMSKETCH_CAMERA_OPTIONS,
} satisfies Partial<TldrawOptions>

/** Make the product's wheel contract authoritative over tldraw's saved device mode. */
export function enforceSystemSketchWheelZoom(editor: Editor): void {
  editor.setCameraOptions(SYSTEMSKETCH_CAMERA_OPTIONS)

  // WHY: Zach navigates scale with an ordinary wheel. tldraw's Trackpad or
  // Auto modes can override wheelBehavior and silently turn that gesture into
  // panning, so SystemSketch pins both public settings instead of intercepting
  // wheel events or replacing the stock camera primitive.
  if (editor.user.getUserPreferences().inputMode !== 'mouse') {
    editor.user.updateUserPreferences({ inputMode: 'mouse' })
  }
}
