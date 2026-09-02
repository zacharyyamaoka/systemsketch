import { Fragment } from 'react'
import {
  TldrawUiPopover,
  TldrawUiPopoverContent,
  TldrawUiPopoverTrigger,
  useEditor,
  useRelevantStyles,
  type Editor,
  type StyleProp,
} from 'tldraw'

import {
  buildAppearanceControls,
  selectedOption,
  triggerLabel,
  type AppearanceControl,
  type AppearanceOption,
} from './appearanceModel'
import { AppearanceGlyph } from './AppearanceGlyph'
import { CHEVRON_PATH, CHEVRON_VIEWBOX, POPOVER_GAP, SWATCH_SIZE } from './figjamTokens'
import './appearance.css'

/**
 * Where FigJam draws a hairline. Its pill groups what a thing *is* apart from
 * how it is painted, and both apart from its text.
 */
const GROUP_STARTS = new Set(['color', 'font', 'arrowKind'])

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
function applyStyle(editor: Editor, style: StyleProp<string>, value: string) {
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
          data-mixed={current ? undefined : true}
          aria-label={triggerLabel(control)}
          title={triggerLabel(control)}
        >
          <AppearanceGlyph control={control} value={current?.value} editor={editor} />
          {/* FigJam's own chevron, the same filled path on every trigger. */}
          <svg className="systemsketch-appearance__chevron" viewBox={CHEVRON_VIEWBOX} aria-hidden="true">
            <path d={CHEVRON_PATH} />
          </svg>
        </button>
      </TldrawUiPopoverTrigger>
      {/* The trigger now fills the pill's height, so Radix's offset from the
          trigger is the same 8px FigJam leaves above the pill. */}
      <TldrawUiPopoverContent side="top" align="center" sideOffset={POPOVER_GAP}>
        <div
          className="systemsketch-appearance__panel"
          data-layout={control.layout}
          data-testid={`systemsketch-appearance-panel-${control.id}`}
        >
          {control.modeControl ? (
            <div className="systemsketch-appearance__mode" role="group" aria-label={control.modeControl.label}>
              {control.modeControl.options.map((option) => (
                <OptionButton
                  key={option.value}
                  control={control.modeControl!}
                  option={option}
                  editor={editor}
                  withLabel
                />
              ))}
            </div>
          ) : null}
          <div
            className="systemsketch-appearance__options"
            role="group"
            aria-label={control.label}
            // Fixed columns, not fractions: FigJam's swatches sit on a 32px
            // pitch (24px circle + 8px gap) regardless of how wide the mode row
            // above makes the panel.
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
                withLabel={control.layout === 'list' || control.layout === 'library'}
              />
            ))}
          </div>
        </div>
      </TldrawUiPopoverContent>
    </TldrawUiPopover>
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
      <AppearanceGlyph control={control} value={option.value} editor={editor} />
      {withLabel ? <span className="systemsketch-appearance__label">{option.label}</span> : null}
    </button>
  )
}
