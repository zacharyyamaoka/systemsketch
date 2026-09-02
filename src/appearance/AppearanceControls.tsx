import { Fragment } from 'react'
import {
  TldrawUiPopover,
  TldrawUiPopoverContent,
  TldrawUiPopoverTrigger,
  useEditor,
  useRelevantStyles,
  useValue,
  type Editor,
  type StyleProp,
} from 'tldraw'

import {
  buildAppearanceControls,
  selectedOption,
  triggerLabel,
  CUSTOM_LABEL,
  MIXED_LABEL,
  type AppearanceControl,
  type AppearanceOption,
} from './appearanceModel'
import { AppearanceGlyph, FigjamGlyph, TriggerGlyph } from './AppearanceGlyph'
import { CustomColorPicker } from './CustomColorPicker'
import { isCustomColor, registeredHex } from './customColors'
import { FIGJAM_CHECK_ICON } from './figjamIconMap'
import {
  CHEVRON_PATH,
  CHEVRON_VIEWBOX,
  FONT_SIZE_LADDER,
  POPOVER_GAP,
  SWATCH_SIZE,
} from './figjamTokens'
import './appearance.css'

/**
 * Where FigJam draws a hairline. Its pill groups what a thing *is* apart from
 * how it is painted, both apart from its text, and the text apart from its
 * alignment; a connector's ends and line shape are a group of their own.
 */
const GROUP_STARTS = new Set(['color', 'font', 'align', 'arrowheadStart'])

/**
 * The appearance half of the selection menu, modelled on FigJam's.
 *
 * Every control writes a stock tldraw style through the same path tldraw's own
 * style panel uses, so nothing here knows about shape internals: the selection
 * decides which controls exist (via `useRelevantStyles`), and the options are
 * exactly the values the style accepts.
 *
 * SystemSketch disables tldraw's `StylePanel`, so this is the only place a
 * shape's appearance can be edited on canvas.
 */
export function AppearanceControls() {
  const editor = useEditor()
  const styles = useRelevantStyles()
  const controls = buildAppearanceControls(styles)

  if (controls.length === 0) return null

  return (
    <div className="systemsketch-appearance" data-testid="systemsketch-appearance">
      {controls.map((control, index) => (
        <Fragment key={control.id}>
          {index > 0 && GROUP_STARTS.has(control.id)
            ? <span className="systemsketch-appearance__separator" aria-hidden="true" />
            : null}
          <AppearanceTrigger editor={editor} control={control} />
        </Fragment>
      ))}
    </div>
  )
}

/** Apply a style the way tldraw's own panel does: one history step, both scopes. */
export function applyStyle(editor: Editor, style: StyleProp<string>, value: string) {
  editor.markHistoryStoppingPoint('appearance')
  editor.run(() => {
    if (editor.isIn('select')) editor.setStyleForSelectedShapes(style, value)
    editor.setStyleForNextShapes(style, value)
  })
}

function AppearanceTrigger({ editor, control }: { editor: Editor; control: AppearanceControl }) {
  const current = selectedOption(control)

  // Open state is deliberately left to `TldrawUiPopover`: it ORs any `open`
  // prop with its own `useMenuIsOpen`, so a second source of truth can open the
  // popover but can never close it, and clicking the trigger again would do
  // nothing. Radix marks the trigger `data-state="open"` for styling.
  return (
    <TldrawUiPopover id={`systemsketch-appearance-${control.id}`}>
      <TldrawUiPopoverTrigger>
        <button
          type="button"
          className="systemsketch-appearance__trigger"
          data-control={control.id}
          data-trigger={control.trigger}
          data-mixed={current ? undefined : true}
          aria-label={triggerLabel(control)}
          title={triggerLabel(control)}
        >
          {control.trigger === 'text' ? (
            // FigJam's Font size is a combobox: the rung's name, then the chevron.
            <span className="systemsketch-appearance__trigger-text">
              {current ? current.label : MIXED_LABEL}
            </span>
          ) : (
            <TriggerGlyph control={control} value={current?.value} editor={editor} />
          )}
          {/* FigJam's own chevron, the same filled path on every trigger. */}
          <svg className="systemsketch-appearance__chevron" viewBox={CHEVRON_VIEWBOX} aria-hidden="true">
            <path d={CHEVRON_PATH} />
          </svg>
        </button>
      </TldrawUiPopoverTrigger>
      {/* The trigger fills the pill's height, so Radix's offset from the
          trigger is the same 8px FigJam leaves above the pill. */}
      <TldrawUiPopoverContent side="top" align="center" sideOffset={POPOVER_GAP}>
        <AppearancePanel control={control} editor={editor} />
      </TldrawUiPopoverContent>
    </TldrawUiPopover>
  )
}

function AppearancePanel({ control, editor }: { control: AppearanceControl; editor: Editor }) {
  const mode = control.modeControl
  const beside = mode && control.modePlacement === 'beside'
  return (
    <div
      className="systemsketch-appearance__panel"
      data-layout={control.layout}
      data-mode={mode ? control.modePlacement : undefined}
      data-testid={`systemsketch-appearance-panel-${control.id}`}
    >
      {mode ? (
        <div
          className={beside ? 'systemsketch-appearance__group' : 'systemsketch-appearance__mode'}
          role="group"
          aria-label={mode.label}
        >
          {mode.options.map((option) => (
            <OptionButton
              key={option.value}
              control={mode}
              option={option}
              editor={editor}
              withLabel={!beside}
            />
          ))}
        </div>
      ) : null}
      {beside ? <span className="systemsketch-appearance__divider" aria-hidden="true" /> : null}
      <div
        className="systemsketch-appearance__options"
        role="group"
        aria-label={control.label}
        // Fixed columns, not fractions: FigJam's swatches sit on a 32px pitch
        // (24px circle + 8px gap) regardless of how wide the mode row above
        // makes the panel.
        style={control.columns
          ? { gridTemplateColumns: `repeat(${control.columns}, ${SWATCH_SIZE}px)` }
          : undefined}
      >
        {control.options.map((option) => (
          <OptionButton
            key={option.value}
            control={control}
            option={option}
            editor={editor}
            withLabel={control.layout !== 'row' && control.layout !== 'swatches'}
          />
        ))}
        {control.custom ? <CustomColorCell control={control} editor={editor} /> : null}
      </div>
    </div>
  )
}

function OptionButton({
  control, option, editor, withLabel,
}: {
  control: AppearanceControl
  option: AppearanceOption
  editor: Editor
  withLabel?: boolean
}) {
  const isCurrent = control.value.type === 'shared' && control.value.value === option.value
  const list = control.layout === 'list'
  // FigJam draws each Font size row at its own size: 12 / 13 / 14 / 16px.
  const rowSize = list && control.id === 'size' ? FONT_SIZE_LADDER[option.value] : undefined
  return (
    <button
      type="button"
      className="systemsketch-appearance__option"
      data-control={control.id}
      data-value={option.value}
      role="menuitemradio"
      aria-checked={isCurrent}
      aria-label={option.label}
      title={option.label}
      onClick={() => applyStyle(editor, control.style, option.value)}
    >
      {/* A list row keeps FigJam's check slot whether or not it is chosen. */}
      {list ? <FigjamGlyph name={FIGJAM_CHECK_ICON} className="systemsketch-appearance__check" /> : null}
      <AppearanceGlyph control={control} value={option.value} editor={editor} />
      {withLabel ? (
        <span
          className="systemsketch-appearance__label"
          style={rowSize ? { fontSize: `${rowSize}px`, lineHeight: rowSize <= 12 ? '16px' : '24px' } : undefined}
        >
          {option.label}
        </span>
      ) : null}
    </button>
  )
}

/**
 * FigJam's 22nd cell.
 *
 * Idle, a colour wheel; once the selection carries a custom colour, that
 * colour as a disc with the wheel as a ring around it — which is also how the
 * cell reads as *chosen*, since no palette swatch is ringed then. Clicking it
 * opens the picker flush under the palette, centred on the cell.
 */
function CustomColorCell({ control, editor }: { control: AppearanceControl; editor: Editor }) {
  const active = control.value.type === 'shared' && isCustomColor(control.value.value)
    ? control.value.value
    : undefined
  const hex = useValue(
    'systemsketch custom colour cell',
    () => (active ? registeredHex(editor, active) : undefined),
    [editor, active],
  )
  return (
    <TldrawUiPopover id="systemsketch-appearance-custom-color">
      <TldrawUiPopoverTrigger>
        <button
          type="button"
          className="systemsketch-appearance__custom"
          data-control="color"
          data-active={active ? '' : undefined}
          role="menuitemradio"
          aria-checked={Boolean(active)}
          aria-label={CUSTOM_LABEL}
          title={CUSTOM_LABEL}
        >
          <span className="systemsketch-appearance__custom-ring">
            <span
              className="systemsketch-appearance__custom-disc"
              style={hex ? { background: hex } : undefined}
            />
          </span>
        </button>
      </TldrawUiPopoverTrigger>
      <TldrawUiPopoverContent side="bottom" align="center" sideOffset={POPOVER_GAP} autoFocusFirstButton={false}>
        <CustomColorPicker editor={editor} control={control} />
      </TldrawUiPopoverContent>
    </TldrawUiPopover>
  )
}
