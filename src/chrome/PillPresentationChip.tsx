import {
  updatePillPresentation,
  usePillPresentation,
  type PillLayout,
  type PillSkin,
} from '../settings/pillPresentation'
import './pill-presentation-chip.css'

const LAYOUT_OPTIONS: readonly { value: PillLayout; label: string }[] = [
  { value: 'default', label: 'Original pill (pre-2026-09-08)' },
  { value: 'v1', label: 'V1 · Excalidraw Compact' },
  { value: 'v3', label: 'V3 · Figma Segmented (current default)' },
]

const SKIN_OPTIONS: readonly { value: PillSkin; label: string }[] = [
  { value: 'default', label: 'Current style' },
  { value: '1', label: '1 · Ink Mono' },
  { value: '2', label: '2 · Soft Elevation' },
  { value: '3', label: '3 · High Contrast Outline' },
  { value: '4', label: '4 · Warm Paper' },
  { value: '5', label: '5 · Dark Compact' },
]

/**
 * The Phase 2 ink-pass comparison switcher: fixed in a canvas corner, never
 * anchored to the selection pill's own dynamic placement, so Zach can select
 * a real shape and see both the pill and the switcher at once — a dialog
 * would sit above `InFrontOfTheCanvas` and cover the very thing it is meant
 * to help compare (see `ContextualMenuLab.tsx`'s own measured stacking note).
 * Settings → Pill lab only flips `compare` on; the live layout/skin picks
 * live here so flipping one never requires reopening Settings.
 */
export function PillPresentationChip() {
  const presentation = usePillPresentation()
  if (!presentation.compare) return null

  return (
    <div className="systemsketch-pill-chip" data-testid="systemsketch-pill-presentation-chip">
      <span className="systemsketch-pill-chip__title">Pill lab</span>
      <label className="systemsketch-pill-chip__field">
        <span>Layout</span>
        <select
          data-testid="systemsketch-pill-chip-layout"
          value={presentation.layout}
          onChange={(event) => updatePillPresentation({ layout: event.target.value as PillLayout })}
        >
          {LAYOUT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <label className="systemsketch-pill-chip__field">
        <span>Style</span>
        <select
          data-testid="systemsketch-pill-chip-skin"
          value={presentation.skin}
          onChange={(event) => updatePillPresentation({ skin: event.target.value as PillSkin })}
        >
          {SKIN_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
    </div>
  )
}
