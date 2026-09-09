import { describe, expect, it, vi } from 'vitest'
import type { Editor } from 'tldraw'
import { runWheelCommand } from './canvasGestures'
import { DEFAULT_GESTURE_SETTINGS, type GestureSettings } from './settings/gestureSettings'

/**
 * `runWheelCommand`'s own logic is the part worth a fast, isolated test — the
 * live wheel-interception listener it is called from touches real DOM capture
 * events and Ctrl/Cmd disambiguation, which `tests/wheel_zoom_smoke.mjs`-style
 * CDP journeys prove instead (see `canvasCamera.ts`'s own split for the same
 * reason: its pure `enforceSystemSketchCanvasNavigation` gets a vitest suite,
 * its live listener gets a browser journey).
 */
function fakeEditor(camera = { x: 0, y: 0, z: 1 }) {
  const setCamera = vi.fn()
  const undo = vi.fn()
  const redo = vi.fn()
  let currentCamera = camera
  setCamera.mockImplementation((next) => { currentCamera = { ...currentCamera, ...next } })
  const editor = {
    getCamera: () => currentCamera,
    setCamera,
    undo,
    redo,
    inputs: { getCurrentScreenPoint: () => ({ x: 400, y: 300 }) },
    // A trivial 1:1 screen<->page mapping keeps the zoom-at-pointer math
    // legible: page = screen / zoom.
    screenToPage: ({ x, y }: { x: number; y: number }) => ({ x: x / currentCamera.z, y: y / currentCamera.z }),
  } as unknown as Editor
  return { editor, setCamera, undo, redo }
}

const settings = (patch: Partial<GestureSettings> = {}): GestureSettings => ({ ...DEFAULT_GESTURE_SETTINGS, ...patch })

describe('runWheelCommand', () => {
  it('does nothing for "none" but still reports itself handled', () => {
    const { editor, setCamera } = fakeEditor()
    expect(runWheelCommand(editor, 'none', settings())).toBe(true)
    expect(setCamera).not.toHaveBeenCalled()
  })

  it('pans by one stock step at 100% sensitivity', () => {
    const { editor, setCamera } = fakeEditor()
    runWheelCommand(editor, 'pan-down', settings({ panSpeedPercent: 100 }))
    expect(setCamera).toHaveBeenCalledWith({ x: 0, y: -100, z: 1 })
  })

  it('scales the pan step by the configured sensitivity', () => {
    const { editor, setCamera } = fakeEditor()
    runWheelCommand(editor, 'pan-up', settings({ panSpeedPercent: 50 }))
    expect(setCamera).toHaveBeenCalledWith({ x: 0, y: 50, z: 1 })
  })

  it('pans left and right along x', () => {
    const { editor, setCamera } = fakeEditor()
    runWheelCommand(editor, 'pan-left', settings({ panSpeedPercent: 100 }))
    expect(setCamera).toHaveBeenCalledWith({ x: 100, y: 0, z: 1 })
    runWheelCommand(editor, 'pan-right', settings({ panSpeedPercent: 100 }))
    expect(setCamera).toHaveBeenLastCalledWith({ x: 0, y: 0, z: 1 })
  })

  it('zooms in around the pointer, increasing z', () => {
    const { editor, setCamera } = fakeEditor()
    runWheelCommand(editor, 'zoom-in', settings({ zoomSpeedPercent: 100 }))
    const finalCall = setCamera.mock.calls.at(-1)?.[0]
    expect(finalCall.z).toBeCloseTo(1.1, 5)
  })

  it('zooms out around the pointer, decreasing z', () => {
    const { editor, setCamera } = fakeEditor()
    runWheelCommand(editor, 'zoom-out', settings({ zoomSpeedPercent: 100 }))
    const finalCall = setCamera.mock.calls.at(-1)?.[0]
    expect(finalCall.z).toBeCloseTo(1 / 1.1, 5)
  })

  it('a higher zoom sensitivity produces a bigger step', () => {
    const { editor: slow, setCamera: slowCamera } = fakeEditor()
    runWheelCommand(slow, 'zoom-in', settings({ zoomSpeedPercent: 50 }))
    const { editor: fast, setCamera: fastCamera } = fakeEditor()
    runWheelCommand(fast, 'zoom-in', settings({ zoomSpeedPercent: 200 }))
    const slowZ = slowCamera.mock.calls.at(-1)?.[0].z
    const fastZ = fastCamera.mock.calls.at(-1)?.[0].z
    expect(fastZ).toBeGreaterThan(slowZ)
  })

  it('delegates undo and redo to the editor', () => {
    const { editor, undo, redo } = fakeEditor()
    expect(runWheelCommand(editor, 'undo', settings())).toBe(true)
    expect(undo).toHaveBeenCalledOnce()
    expect(runWheelCommand(editor, 'redo', settings())).toBe(true)
    expect(redo).toHaveBeenCalledOnce()
  })
})
