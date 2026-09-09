import type { Editor, TLCameraOptions, TldrawOptions } from 'tldraw'
import { getAppearancePreferences, subscribeAppearancePreferences } from './settings/appearancePreferences'
import { DEFAULT_GESTURE_SETTINGS, getGestureSettings, subscribeGestureSettings } from './settings/gestureSettings'

export const SYSTEMSKETCH_CAMERA_OPTIONS = {
  wheelBehavior: 'pan',
} satisfies Partial<TLCameraOptions>

/** SystemSketch has one durable canvas; structural depth replaces pages. */
export const SYSTEMSKETCH_EDITOR_OPTIONS = {
  maxPages: 1,
  camera: SYSTEMSKETCH_CAMERA_OPTIONS,
} satisfies Partial<TldrawOptions>

/**
 * Elements a canvas-wide wheel gesture must never intercept, shared between
 * this file's Direct wheel zoom modifier listener and `canvasGestures.ts`'s
 * rebinding listener — a single list so the two cannot drift apart on what
 * "editable surface" means.
 */
export const WHEEL_GESTURE_EXCLUDED_SELECTOR =
  'input, textarea, [contenteditable="true"], .cm-editor, .systemsketch-primitive-search, [data-systemsketch-chrome]'

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
  // WHY a second, independent sensitivity rather than reusing the one above:
  // that parameter is Direct wheel zoom's own control and only ever applies
  // in that branch. Settings → Canvas → Sensitivity tunes the *stock*
  // (non-direct) wheel/Ctrl+wheel gain instead — see gestureSettings.ts. This
  // function stays the single place that decides zoomSpeed for both modes,
  // so ownership can't split into two competing writers; it stays a pure
  // projection (easy to unit test) by taking the value as a parameter rather
  // than reaching into the gesture-settings store itself — the caller below
  // does that read.
  stockZoomSensitivityPercent: number = DEFAULT_GESTURE_SETTINGS.zoomSpeedPercent,
): void {
  if (!directWheelZoom) {
    editor.setCameraOptions({
      ...SYSTEMSKETCH_CAMERA_OPTIONS,
      // Direct mode may have changed this. A hardcoded reset to 100% here
      // used to be correct because nothing else could tune stock-mode zoom
      // speed; now that Settings → Canvas → Sensitivity can, a fixed value
      // would silently undo that tuning every time an unrelated appearance
      // preference changed (this function reruns on every one of them).
      zoomSpeed: stockZoomSensitivityPercent / 100,
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
      getGestureSettings().zoomSpeedPercent,
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
      || event.target.closest(WHEEL_GESTURE_EXCLUDED_SELECTOR)
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
  // Settings → Canvas → Sensitivity lives in the gesture-settings store, not
  // this one — re-applying here too is what lets dragging that slider move
  // the live camera without an unrelated appearance preference having to
  // change first.
  const stopGestureSubscription = subscribeGestureSettings(applyAppearance)
  return () => {
    stopAppearanceSubscription()
    stopGestureSubscription()
    container.removeEventListener('wheel', onDirectModifierWheel, { capture: true })
  }
}
