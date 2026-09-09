import { useSyncExternalStore } from 'react'
import { DefaultHelperButtons } from 'tldraw'
import { PercentInput } from './PercentInput'
import {
  clampSpeedPercent,
  getGestureSettings,
  MAX_SPEED_PERCENT,
  MIN_SPEED_PERCENT,
  subscribeGestureSettings,
  updateGestureSettings,
} from './gestureSettings'
import { isGestureTuningOpen, setGestureTuningOpen, subscribeGestureTuning } from './gestureTuningStore'

/**
 * Mounted as `components.HelperButtons`, so it must render tldraw's own
 * first — that slot is not empty. It carries "Back to content", "Exit pen
 * mode" and "Stop following", the controls that rescue someone who has
 * panned the board off-screen. Replacing the slot would silently delete all
 * three.
 */
export function SystemSketchHelperButtons() {
  return (
    <>
      <DefaultHelperButtons />
      <GestureTuningPanel />
    </>
  )
}

/**
 * The live-tuning HUD opened by Settings → Canvas → Sensitivity → "Tune
 * live…": sensitivity only, and it never eats a canvas gesture.
 *
 * WHY `pointer-events: none` on the wrapper with `auto` only on the card: the
 * panel floats OVER the board, and the whole reason it exists is that you can
 * keep scrolling and zooming underneath it while you drag a slider. A
 * wrapper that swallowed pointer events would recreate the modal problem —
 * blocking canvas interaction while tuning a value that can only be judged
 * against the live canvas — in a smaller rectangle. The card itself does take
 * the gestures that start on it, since its own sliders need that; only the
 * rest of the panel's rectangle stays transparent to the canvas underneath.
 *
 * WHY bottom-left: SystemSketch's own zoom/navigation controls
 * (`.systemsketch-utility-strip`) and Compare/Share cluster live at the
 * bottom-right and top-right; the main menu and file identity own the
 * top-left. Bottom-left is the one corner nothing else in this chrome needs.
 */
export function GestureTuningPanel() {
  const open = useSyncExternalStore(subscribeGestureTuning, isGestureTuningOpen, isGestureTuningOpen)
  const settings = useSyncExternalStore(subscribeGestureSettings, getGestureSettings, getGestureSettings)
  if (!open) return null

  return (
    <div
      data-testid="systemsketch-gesture-tuning-panel"
      style={{
        position: 'fixed',
        left: 12,
        bottom: 12,
        zIndex: 300,
        pointerEvents: 'none',
        display: 'flex',
      }}
    >
      <div
        style={{
          pointerEvents: 'auto',
          background: 'var(--tl-color-panel)',
          border: '1px solid var(--tl-color-low-border)',
          borderRadius: 'var(--tl-radius-3)',
          boxShadow: 'var(--tl-shadow-2)',
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          minWidth: 236,
          color: 'var(--tl-color-text-1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--tl-color-text-3)' }}>
            Live tuning
          </span>
          <button
            type="button"
            data-testid="systemsketch-gesture-tuning-close"
            onClick={() => setGestureTuningOpen(false)}
            aria-label="Close live tuning"
            style={{
              appearance: 'none', border: 0, background: 'transparent', cursor: 'pointer',
              color: 'var(--tl-color-text-3)', fontSize: 14, lineHeight: 1, padding: 2,
            }}
          >
            ✕
          </button>
        </div>
        <TuningSlider
          label="Scroll"
          testId="systemsketch-gesture-tuning-pan-speed"
          value={settings.panSpeedPercent}
          onChange={(panSpeedPercent) => updateGestureSettings({ panSpeedPercent })}
        />
        <TuningSlider
          label="Zoom"
          testId="systemsketch-gesture-tuning-zoom-speed"
          value={settings.zoomSpeedPercent}
          onChange={(zoomSpeedPercent) => updateGestureSettings({ zoomSpeedPercent })}
        />
        <span style={{ fontSize: 11, color: 'var(--tl-color-text-3)' }}>
          Scroll and Ctrl/Cmd + scroll the board while you drag.
        </span>
      </div>
    </div>
  )
}

function TuningSlider({ label, value, onChange, testId }: {
  label: string
  value: number
  onChange(percent: number): void
  testId: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 12, width: 44 }}>{label}</span>
      <input
        type="range"
        aria-label={`${label} sensitivity`}
        min={MIN_SPEED_PERCENT}
        max={MAX_SPEED_PERCENT}
        step={5}
        value={value}
        onChange={(event) => onChange(clampSpeedPercent(Number(event.target.value)))}
        style={{ accentColor: 'var(--tl-color-selected)', flex: '1 1 auto', minWidth: 0 }}
      />
      <PercentInput
        testId={testId}
        value={value}
        onCommit={onChange}
        style={{
          width: 52, height: 24, textAlign: 'right', fontSize: 12,
          borderRadius: 'var(--tl-radius-2)', border: '1px solid var(--tl-color-low-border)',
          background: 'var(--tl-color-panel)', color: 'var(--tl-color-text-1)', padding: '0 5px', outline: 'none',
        }}
      />
    </div>
  )
}
