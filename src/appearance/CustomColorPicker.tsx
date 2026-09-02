import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { DefaultColorStyle, useValue, type Editor, type StyleProp } from 'tldraw'

import type { AppearanceControl } from './appearanceModel'
import { FigjamGlyph } from './AppearanceGlyph'
import {
  customColorHex,
  customColorName,
  isCustomColor,
  normalizeHex,
  registerCustomColors,
  registeredHex,
} from './customColors'
import { FIGJAM_EYEDROPPER_ICON } from './figjamIconMap'
import { FIGJAM_COLOR_HEX } from './figjamPalette'
import { SLIDER_OVERHANG, SURFACE } from './figjamTokens'

/**
 * The picker behind FigJam's Custom cell, on tldraw's colour style.
 *
 * Three bands, read off FigJam's DOM: the eyedropper and hex field; the hue and
 * opacity sliders; the saturation / value square. Every gesture writes through
 * the same path the swatches use — a custom colour is a *named* colour that
 * carries its hex, registered on the editor's theme the moment it is picked
 * (see `customColors.ts`) — so the shape repaints as the pointer moves, and
 * one drag is one undo step because the history stopping point is set once,
 * on pointer down, the way tldraw's own opacity slider does it.
 *
 * Opacity is FigJam's alpha channel mapped onto tldraw's per-shape opacity,
 * which is the one place the two models differ: tldraw's is a shape property,
 * not part of the colour, so it applies to the label as well as the paint.
 */
export function CustomColorPicker({ editor, control }: { editor: Editor; control: AppearanceControl }) {
  const seed = seedHex(editor, control)
  const [hsv, setHsv] = useState(() => hexToHsv(seed))
  const [text, setText] = useState(() => seed.toUpperCase())
  const [focused, setFocused] = useState(false)
  const alpha = useValue(
    'systemsketch picker opacity',
    () => {
      const shared = editor.getSharedOpacity()
      return shared.type === 'shared' ? shared.value : 1
    },
    [editor],
  )
  const input = useRef<HTMLInputElement>(null)

  // FigJam opens with the hex selected, ready to overtype. A frame later,
  // because the popover's focus scope lands on its first button as it mounts.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      input.current?.focus()
      input.current?.select()
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  const hex = hsvToHex(hsv)

  /** One colour, written once: the hex is the truth and the HSV follows it. */
  const commit = (nextHex: string, next: Hsv) => {
    setHsv(next)
    setText(nextHex.toUpperCase())
    applyCustomColor(editor, nextHex)
  }
  const paint = (next: Hsv) => commit(hsvToHex(next), next)

  const commitText = () => {
    const normalized = normalizeHex(text)
    if (!normalized) {
      setText(hex.toUpperCase())
      return
    }
    if (normalized === hex) return
    editor.markHistoryStoppingPoint('custom colour')
    commit(normalized, hexToHsv(normalized))
  }

  const eyedropper = eyeDropper()

  // tldraw switches its shortcuts off while any menu is open, so an undo
  // typed straight after a drag would otherwise do nothing until the picker
  // closed. The picker answers it itself, through the editor's own history;
  // the hex field keeps the browser's text undo.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return
    if (event.target instanceof HTMLInputElement) return
    event.preventDefault()
    event.stopPropagation()
    if (event.shiftKey) editor.redo()
    else editor.undo()
  }

  return (
    <div
      className="systemsketch-appearance__picker"
      data-testid="systemsketch-appearance-picker"
      onKeyDown={onKeyDown}
    >
      <div className="systemsketch-appearance__picker-head">
        <button
          type="button"
          className="systemsketch-appearance__eyedropper"
          aria-label="Eyedropper"
          title="Eyedropper"
          disabled={!eyedropper}
          onClick={() => {
            eyedropper?.open().then((result) => {
              const normalized = normalizeHex(result.sRGBHex)
              if (!normalized) return
              editor.markHistoryStoppingPoint('custom colour')
              commit(normalized, hexToHsv(normalized))
            }).catch(() => { /* dismissed */ })
          }}
        >
          <FigjamGlyph name={FIGJAM_EYEDROPPER_ICON} />
        </button>
        <span className="systemsketch-appearance__hex" data-focused={focused ? '' : undefined}>
          <input
            ref={input}
            className="systemsketch-appearance__hex-input"
            type="text"
            spellCheck={false}
            autoComplete="off"
            aria-label="Hex colour"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => { setFocused(false); commitText() }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                commitText()
                input.current?.select()
              }
            }}
          />
        </span>
      </div>
      <div className="systemsketch-appearance__sliders">
        <Slider
          label="Hue"
          kind="hue"
          value={hsv.h / 360}
          thumb={`hsl(${hsv.h} 100% 50%)`}
          onStart={() => editor.markHistoryStoppingPoint('custom colour')}
          onChange={(t) => paint({ ...hsv, h: t * 360 })}
        />
        <Slider
          label="Opacity"
          kind="alpha"
          value={alpha}
          thumb={hex}
          track={hex}
          onStart={() => editor.markHistoryStoppingPoint('opacity')}
          onChange={(t) => {
            editor.run(() => {
              if (editor.isIn('select')) editor.setOpacityForSelectedShapes(t)
              editor.setOpacityForNextShapes(t)
            })
          }}
        />
      </div>
      <SaturationValue
        hsv={hsv}
        thumb={hex}
        onStart={() => editor.markHistoryStoppingPoint('custom colour')}
        onChange={(s, v) => paint({ ...hsv, s, v })}
      />
    </div>
  )
}

/** Register the colour and write it, the way the swatches write theirs. */
export function applyCustomColor(editor: Editor, hex: string) {
  const name = customColorName(hex)
  if (!name) return
  registerCustomColors([name], editor)
  editor.run(() => {
    if (editor.isIn('select')) {
      editor.setStyleForSelectedShapes(DefaultColorStyle as StyleProp<string>, name)
    }
    editor.setStyleForNextShapes(DefaultColorStyle as StyleProp<string>, name)
  })
}

/** What the picker opens on: the selection's colour, or the surface when it disagrees. */
function seedHex(editor: Editor, control: AppearanceControl): string {
  if (control.value.type !== 'shared') return SURFACE
  const name = control.value.value
  if (isCustomColor(name)) return customColorHex(name) ?? SURFACE
  return FIGJAM_COLOR_HEX[name] ?? registeredHex(editor, name) ?? SURFACE
}

/**
 * One drag gesture on a horizontal track. The pointer is captured so the
 * thumb keeps following past the track's edge, and `t` is clamped to it.
 */
function useDrag(onStart: () => void, onMove: (x: number, y: number, rect: DOMRect) => void) {
  return {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return
      // No text selection while dragging — but preventing the default also
      // keeps focus where it was, in the hex field, and an undo typed next
      // would then edit the field rather than the board. Take focus here.
      event.preventDefault()
      event.currentTarget.focus({ preventScroll: true })
      event.currentTarget.setPointerCapture(event.pointerId)
      onStart()
      onMove(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect())
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
      onMove(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect())
    },
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    },
  }
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

function Slider({
  label, kind, value, thumb, track, onStart, onChange,
}: {
  label: string
  kind: 'hue' | 'alpha'
  value: number
  thumb: string
  track?: string
  onStart: () => void
  onChange: (t: number) => void
}) {
  const drag = useDrag(onStart, (x, _y, rect) => onChange(clamp01((x - rect.left) / rect.width)))
  return (
    <div
      className="systemsketch-appearance__slider"
      data-slider={kind}
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={+value.toFixed(3)}
      tabIndex={-1}
      // The alpha track fades from clear to the colour over its travel, on a checker.
      style={track ? { '--systemsketch-picker-color': track } as React.CSSProperties : undefined}
      {...drag}
    >
      <span
        className="systemsketch-appearance__thumb"
        style={{ left: `calc(${value * 100}% - ${SLIDER_OVERHANG}px)`, background: thumb }}
      />
    </div>
  )
}

function SaturationValue({
  hsv, thumb, onStart, onChange,
}: {
  hsv: Hsv
  thumb: string
  onStart: () => void
  onChange: (s: number, v: number) => void
}) {
  const drag = useDrag(onStart, (x, y, rect) =>
    onChange(clamp01((x - rect.left) / rect.width), 1 - clamp01((y - rect.top) / rect.height)))
  return (
    <div
      className="systemsketch-appearance__sv"
      role="group"
      aria-label="Color picker reticle"
      tabIndex={-1}
      style={{ '--systemsketch-picker-hue': `hsl(${hsv.h} 100% 50%)` } as React.CSSProperties}
      {...drag}
    >
      <span
        className="systemsketch-appearance__thumb"
        data-reticle=""
        style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: thumb }}
      />
    </div>
  )
}

/* ---- Colour maths. Hue in degrees; saturation and value in 0..1. ---- */

export interface Hsv { h: number; s: number; v: number }

export function hexToHsv(hex: string): Hsv {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  const sector = Math.floor(h / 60) % 6
  const [r, g, b] = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
  ][sector]
  const channel = (value: number) => Math.round((value + m) * 255).toString(16).padStart(2, '0')
  return `#${channel(r)}${channel(g)}${channel(b)}`
}

/* ---- The browser's eyedropper, where it has one (Chromium). ---- */

interface EyeDropperApi { open(): Promise<{ sRGBHex: string }> }

function eyeDropper(): EyeDropperApi | undefined {
  const ctor = (globalThis as { EyeDropper?: new () => EyeDropperApi }).EyeDropper
  return ctor ? new ctor() : undefined
}
