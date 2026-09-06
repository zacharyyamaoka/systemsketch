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
 * makes the base mode switch truthful. The separately enabled modifier
 * inversion below is the one gesture stock camera preferences cannot name.
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

  const container = editor.getContainer()
  const onDirectModifierWheel = (event: WheelEvent) => {
    const preferences = getAppearancePreferences()
    if (
      !preferences.directWheelZoom
      || !preferences.modifierWheelZoomsOppositely
      || (!event.ctrlKey && !event.metaKey)
      || !(event.target instanceof Element)
      || !event.target.closest('.tl-canvas')
      || event.target.closest('input, textarea, [contenteditable="true"], .cm-editor, .systemsketch-primitive-search, [data-systemsketch-chrome]')
    ) {
      return
    }

    // WHY this is a deliberately narrow public-camera seam: tldraw flips a
    // mouse-mode Ctrl/Cmd wheel from zoom into pan, with no independent
    // modifier-direction option. This preference needs the one combination
    // its stock options cannot name. We consume only that modified canvas
    // gesture and use tldraw's public, constrained setCamera API around the
    // real pointer; every ordinary wheel, pinch, key, and pan still belongs to
    // tldraw's own gesture machinery.
    event.preventDefault()
    event.stopImmediatePropagation()
    const { x: cameraX, y: cameraY, z: currentZoom } = editor.getCamera()
    const bounds = editor.getViewportScreenBounds()
    const x = event.clientX - bounds.x
    const y = event.clientY - bounds.y
    const normalizedDeltaY = -event.deltaY
    const clampedStep = Math.abs(normalizedDeltaY) > 10
      ? Math.sign(normalizedDeltaY) / 10
      : normalizedDeltaY / 100
    const direction = preferences.scrollDownZoomsIn ? 1 : -1
    const zoom = currentZoom + clampedStep * direction * preferences.wheelZoomSensitivityPercent / 100 * currentZoom
    editor.setCamera({
      x: cameraX + x / zoom - x / currentZoom,
      y: cameraY + y / zoom - y / currentZoom,
      z: zoom,
    }, { immediate: true })
  }
  // Tldraw mounts `.tl-canvas` after `onMount` in some host compositions. The
  // stable editor container is already present, and the canvas ancestry guard
  // above keeps this listener out of chrome and editable surface events.
  container.addEventListener('wheel', onDirectModifierWheel, { capture: true, passive: false })

  const stopAppearanceSubscription = subscribeAppearancePreferences(applyAppearance)
  return () => {
    stopAppearanceSubscription()
    container.removeEventListener('wheel', onDirectModifierWheel, { capture: true })
  }
}
