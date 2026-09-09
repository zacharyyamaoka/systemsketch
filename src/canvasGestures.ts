import type { Editor } from 'tldraw'
import { getAppearancePreferences } from './settings/appearancePreferences'
import { WHEEL_GESTURE_EXCLUDED_SELECTOR } from './canvasCamera'
import {
  getGestureSettings,
  subscribeGestureSettings,
  type GestureSettings,
  type WheelCommand,
} from './settings/gestureSettings'

/** How far one wheel notch pans, in screen px. Matches tldraw's own feel. */
const PAN_STEP = 100
/** One notch at 100%. Matches what tldraw's own wheel zoom does per notch, so
 *  rebinding a gesture to zoom feels like the gesture it replaced. */
const ZOOM_STEP = 1.1

function panStep(settings: GestureSettings): number {
  return PAN_STEP * (settings.panSpeedPercent / 100)
}

function zoomBy(editor: Editor, direction: 1 | -1, settings: GestureSettings): boolean {
  const screenPoint = editor.inputs.getCurrentScreenPoint()
  const camera = editor.getCamera()
  const factor = Math.pow(ZOOM_STEP, direction * (settings.zoomSpeedPercent / 100))
  const nextZoom = camera.z * factor

  // Keep the page point under the cursor fixed, by asking the editor what
  // moved rather than reimplementing its screen<->page convention. Two
  // setCamera calls in one frame produce one visible change.
  const before = editor.screenToPage(screenPoint)
  editor.setCamera({ x: camera.x, y: camera.y, z: nextZoom })
  const after = editor.screenToPage(screenPoint)
  editor.setCamera({
    x: camera.x + (after.x - before.x),
    y: camera.y + (after.y - before.y),
    z: nextZoom,
  })
  return true
}

function panBy(editor: Editor, dx: number, dy: number): boolean {
  const camera = editor.getCamera()
  editor.setCamera({ x: camera.x + dx / camera.z, y: camera.y + dy / camera.z, z: camera.z })
  return true
}

export function runWheelCommand(editor: Editor, command: WheelCommand, settings: GestureSettings): boolean {
  switch (command) {
    case 'none': return true
    // The editor has no `pan()`; moving the camera IS the pan. The screen
    // step is divided by zoom so a notch covers the same visible distance at
    // every zoom level, which is what makes it feel like scrolling rather
    // than like moving a map. Scaled by the same slider tldraw's own wheel
    // pan reads, so a rebound pan and a default pan move by the same amount.
    case 'pan-up': return panBy(editor, 0, panStep(settings))
    case 'pan-down': return panBy(editor, 0, -panStep(settings))
    case 'pan-left': return panBy(editor, panStep(settings), 0)
    case 'pan-right': return panBy(editor, -panStep(settings), 0)
    // Zoom at the POINTER, not the viewport centre, and at the user's own
    // sensitivity — `editor.zoomIn()`/`zoomOut()` are BUTTON actions that
    // step through tldraw's fixed zoom stops around the viewport centre and
    // ignore `cameraOptions.zoomSpeed` entirely, which is the wrong feel for
    // a wheel gesture.
    case 'zoom-in': return zoomBy(editor, 1, settings)
    case 'zoom-out': return zoomBy(editor, -1, settings)
    case 'undo': editor.undo(); return true
    case 'redo': editor.redo(); return true
    default: return false
  }
}

/** A gesture's stock (tldraw-native) command — see `DEFAULT_GESTURE_SETTINGS`
 *  in `gestureSettings.ts`. On this mapping, the wheel listener below does
 *  not intercept at all: no listener work, no risk of drifting from
 *  tldraw's own momentum and trackpad handling. */
function isStockBinding(gesture: keyof GestureSettings['bindings'], command: WheelCommand): boolean {
  switch (gesture) {
    case 'wheelDown': return command === 'pan-down'
    case 'wheelUp': return command === 'pan-up'
    case 'ctrlWheelDown': return command === 'zoom-out'
    case 'ctrlWheelUp': return command === 'zoom-in'
  }
}

/**
 * Wheel-gesture rebinding, pan/zoom speed, and paste-under-cursor, wired to a
 * live editor — the SystemSketch port of tldraw_styling_lab's gesture control
 * feature (Settings → Canvas → Wheel gestures / Sensitivity / Pointer).
 *
 * WHY an imperative `installXxx(editor)` rather than the lab's React hook:
 * every other per-editor behavior in `App.tsx`'s `onMount` (`installBoardTheme`,
 * `installBlockConnections`, …) follows this shape; matching it keeps this
 * feature indistinguishable from the rest of the mount/cleanup list instead
 * of introducing a second wiring convention.
 *
 * WHY this owns `panSpeed` but NOT `zoomSpeed`: `canvasCamera.ts` already
 * owns `zoomSpeed` for both of SystemSketch's camera contracts (stock pan and
 * Direct wheel zoom) and reads this feature's `zoomSpeedPercent` itself — see
 * its own WHY. Splitting zoomSpeed across two writers risks one silently
 * clobbering the other; `panSpeed` has no other owner, so this is it.
 */
export function installSystemSketchGestures(editor: Editor): () => void {
  const container = editor.getContainer()

  const onWheel = (event: WheelEvent) => {
    // Direct wheel zoom is a different input contract entirely (tldraw's
    // `inputMode: 'mouse'`, wheel always zooms) with its own dedicated
    // sensitivity and modifier-inversion handling in `canvasCamera.ts`. This
    // feature governs the stock pan/Ctrl-zoom contract only, so it stands
    // down completely while direct mode is active rather than racing it.
    if (getAppearancePreferences().directWheelZoom) return

    // A wheel over a panel, a menu, or any editable/scrollable chrome is that
    // element's business — only the canvas takes these bindings.
    const target = event.target
    if (
      !(target instanceof Element)
      || !target.closest('.tl-canvas')
      || target.closest(WHEEL_GESTURE_EXCLUDED_SELECTOR)
    ) {
      return
    }

    const settings = getGestureSettings()
    const withCtrl = event.ctrlKey || event.metaKey
    const down = event.deltaY > 0
    const gesture = withCtrl
      ? (down ? 'ctrlWheelDown' : 'ctrlWheelUp')
      : (down ? 'wheelDown' : 'wheelUp')
    const command = settings.bindings[gesture]

    if (isStockBinding(gesture, command)) return

    if (!runWheelCommand(editor, command, settings)) return
    event.preventDefault()
    event.stopPropagation()
  }
  container.addEventListener('wheel', onWheel, { capture: true, passive: false })

  const applyPanSpeed = (settings: GestureSettings) => {
    const stock = editor.getCameraOptions()
    editor.setCameraOptions({ ...stock, panSpeed: settings.panSpeedPercent / 100 })
  }
  const applyPasteUnderCursor = (settings: GestureSettings) => {
    editor.user.updateUserPreferences({ isPasteAtCursorMode: settings.pasteUnderCursor })
  }
  const apply = (settings: GestureSettings) => {
    applyPanSpeed(settings)
    applyPasteUnderCursor(settings)
  }
  apply(getGestureSettings())
  const stopGestureSubscription = subscribeGestureSettings(() => apply(getGestureSettings()))

  return () => {
    stopGestureSubscription()
    container.removeEventListener('wheel', onWheel, { capture: true })
  }
}
