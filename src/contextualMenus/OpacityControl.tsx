import type { ChangeEvent, FormEvent, PointerEvent as ReactPointerEvent, ReactElement } from 'react'

import { MIXED_LABEL } from './contextualControlRegistry'

const OPACITY_MIN = 0
const OPACITY_MAX = 100
const OPACITY_STEP = 10

export interface OpacityChangeOptions {
  /** Set while the thumb is still being dragged; the binder marks no undo stop. */
  continuous?: boolean
}

export interface OpacityControlProps {
  /**
   * Percent (0-100) for the pill's own display, mirroring Excalidraw's
   * `Range` — NOT the 0-1 fraction tldraw's `opacity` StyleProp stores.
   * Converting between the two is the wave-2 binder's job (it owns
   * `editor.getSharedOpacity()` / `setOpacityForSelectedShapes`), kept out of
   * this component so it stays reusable if a future caller's own scale ever
   * differs. `'mixed'` means the selection disagrees; `null` means no
   * participant in the target has an opacity to show, so nothing renders.
   */
  value: number | 'mixed' | null
  onChange(opacity: number, options?: OpacityChangeOptions): void
  label: string
}

/**
 * Excalidraw-parity opacity slider: 0-100 step 10, percent in the UI.
 *
 * WHY two DOM handlers instead of one `onChange`: mirrors the
 * `ContextualCustomSize.applyPx` contract (see `ContextualControls.tsx`) —
 * the continuous stream while dragging must mark no undo stop, and only the
 * value the user actually lands on gets its own history entry. A native
 * range input's `input` event fires on every drag tick; its `change` event
 * (and, as a safety net for browsers/synthetic-event setups that don't
 * surface a distinct `change` for range inputs, `pointerup`) fires once the
 * drag commits. Firing the final call twice on some paths is harmless — it
 * reports the same settled value — never a mid-drag one.
 */
export function OpacityControl({ value, onChange, label }: OpacityControlProps): ReactElement | null {
  if (value === null) return null

  const mixed = value === 'mixed'
  // Excalidraw parity: a mixed selection shows a full thumb rather than
  // guessing an average that would misrepresent every participant.
  const sliderValue = mixed ? OPACITY_MAX : value
  const displayValue = mixed ? MIXED_LABEL : `${sliderValue}%`

  const emitContinuous = (event: FormEvent<HTMLInputElement>) => {
    onChange(Number(event.currentTarget.value), { continuous: true })
  }
  const emitFinal = (event: ChangeEvent<HTMLInputElement> | ReactPointerEvent<HTMLInputElement>) => {
    onChange(Number(event.currentTarget.value))
  }

  return (
    <label className="systemsketch-opacity">
      <span className="systemsketch-opacity__label">{label}</span>
      <input
        type="range"
        className="systemsketch-opacity__slider"
        data-testid="systemsketch-opacity-slider"
        data-mixed={mixed ? 'true' : undefined}
        aria-label={label}
        min={OPACITY_MIN}
        max={OPACITY_MAX}
        step={OPACITY_STEP}
        value={sliderValue}
        onInput={emitContinuous}
        onChange={emitFinal}
        onPointerUp={emitFinal}
      />
      <span className="systemsketch-opacity__value" data-testid="systemsketch-opacity-value">
        {displayValue}
      </span>
    </label>
  )
}
