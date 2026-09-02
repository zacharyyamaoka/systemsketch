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
import './appearance.css'

/** Measured from FigJam: docs/figjam-appearance-menu-spec-2026-09-01.html. */
const POPOVER_GAP = 8
/** The trigger's vertical margin inside the pill, from appearance.css. */
const TRIGGER_INSET = 4

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
      {controls.map((control) => (
        <AppearanceTrigger key={control.id} editor={editor} control={control} />
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
          <span className="systemsketch-appearance__chevron" aria-hidden="true" />
        </button>
      </TldrawUiPopoverTrigger>
      {/* FigJam leaves 8px between the popover and the *pill*. Radix measures
          from the trigger, which is inset 4px inside the pill, so the offset
          that produces the measured gap is 8 + 4. */}
      <TldrawUiPopoverContent side="top" align="center" sideOffset={TRIGGER_INSET + POPOVER_GAP}>
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
            style={control.columns ? { gridTemplateColumns: `repeat(${control.columns}, 1fr)` } : undefined}
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
