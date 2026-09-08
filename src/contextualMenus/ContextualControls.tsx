import * as Popover from '@radix-ui/react-popover'
import {
  forwardRef,
  Fragment,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react'
import {
  TldrawUiPopover,
  TldrawUiPopoverContent,
  TldrawUiPopoverTrigger,
  useContainer,
  useEditor,
  useValue,
  type Editor,
} from 'tldraw'

import { useEffect, useState } from 'react'
import { AppearanceGlyph, FigjamGlyph, TriggerGlyph } from '../appearance/AppearanceGlyph'
import { CustomColorPicker } from '../appearance/CustomColorPicker'
import { isCustomColor, registeredHex } from '../appearance/customColors'
import { formatFontPx } from '../appearance/customFontSize'
import { FIGJAM_CHECK_ICON, FIGJAM_TRIGGER_ICON } from '../appearance/figjamIconMap'
import {
  CHEVRON_PATH,
  CHEVRON_VIEWBOX,
  FONT_SIZE_LADDER,
  POPOVER_COLLISION_PADDING,
  POPOVER_GAP,
  SWATCH_SIZE,
} from '../appearance/figjamTokens'
import {
  CUSTOM_LABEL,
  MIXED_LABEL,
  contextualTriggerLabel,
  isAutomaticContextualSelection,
  selectedContextualOption,
  type ContextualControl,
  type ContextualControlComposition,
  type ContextualCustomSize,
} from './contextualControlRegistry'
import '../appearance/appearance.css'

export type ContextualPopoverMode = 'selection' | 'editing'

export interface ContextualControlsProps {
  composition: ContextualControlComposition
  popoverMode: ContextualPopoverMode
  className?: string
  testId?: string
  label?: string
}

/** One renderer for every registered control, regardless of target surface. */
export function ContextualControls({
  composition,
  popoverMode,
  className,
  testId,
  label,
}: ContextualControlsProps) {
  const editor = useEditor()
  return (
    <div
      className={['systemsketch-appearance', className].filter(Boolean).join(' ')}
      data-testid={testId}
      data-contextual-recipe={composition.id}
      aria-label={label}
    >
      {composition.groups.map((group, groupIndex) => (
        <Fragment key={group.id}>
          {groupIndex > 0
            ? <span className="systemsketch-appearance__separator" aria-hidden="true" />
            : null}
          <div className="systemsketch-contextual-controls__group" data-contextual-group={group.id}>
            {group.controls.map((control) => (
              <ContextualControlItem
                key={control.id}
                editor={editor}
                control={control}
                popoverMode={popoverMode}
              />
            ))}
          </div>
        </Fragment>
      ))}
    </div>
  )
}

function ContextualControlItem({
  editor,
  control,
  popoverMode,
}: {
  editor: Editor
  control: ContextualControl
  popoverMode: ContextualPopoverMode
}) {
  if (control.trigger === 'toggle') {
    const pressed = control.value?.type === 'shared' && control.value.value === 'on'
    return (
      <button
        type="button"
        className="systemsketch-appearance__trigger systemsketch-appearance__toggle"
        data-control={control.id}
        data-kind={control.kind}
        aria-label={control.label}
        title={control.label}
        aria-pressed={pressed}
        onClick={() => control.onSelect(pressed ? 'off' : 'on')}
      >
        <strong aria-hidden="true">B</strong>
      </button>
    )
  }

  if (control.trigger === 'action') {
    // An action's face is registry data (`FIGJAM_TRIGGER_ICON`), never a
    // per-kind conditional here: a new action with a traced icon needs only
    // its table entry.
    const face = FIGJAM_TRIGGER_ICON[control.kind]
    return (
      <button
        type="button"
        className="systemsketch-appearance__trigger"
        data-control={control.id}
        data-kind={control.kind}
        aria-label={control.label}
        title={control.label}
        onClick={() => control.onSelect()}
      >
        {face ? <FigjamGlyph name={face} /> : null}
      </button>
    )
  }

  return (
    <ContextualPopover
      id={`systemsketch-contextual-${control.id}`}
      mode={popoverMode}
      trigger={<ControlTrigger control={control} editor={editor} />}
      side="top"
    >
      <ControlPanel control={control} editor={editor} popoverMode={popoverMode} />
    </ContextualPopover>
  )
}

function Chevron() {
  return (
    <svg className="systemsketch-appearance__chevron" viewBox={CHEVRON_VIEWBOX} aria-hidden="true">
      <path d={CHEVRON_PATH} />
    </svg>
  )
}

interface ControlTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  control: ContextualControl
  editor: Editor
}

// WHY: Radix's `asChild` contract injects its event handlers and ref into this component.
// Forwarding both is what lets one pointer-down open or drag from every composed menu surface.
const ControlTrigger = forwardRef<HTMLButtonElement, ControlTriggerProps>(function ControlTrigger(
  { control, editor, className, ...buttonProps },
  ref,
) {
  const current = selectedContextualOption(control)
  // Truthful Font size combobox: with a custom scale applied, the rung name
  // ("Medium") is not what is rendered — show the shared effective px
  // instead, or Mixed when the participants disagree. The reading comes from
  // the control's own `customSize` binding: the SURFACE owns the target, and
  // this renderer never asks the editor who is selected.
  const customSize = control.customSize
  const customPx = useValue(
    'systemsketch trigger font px',
    () => {
      if (!customSize) return null
      if (customSize.onPresetRungs()) return null
      const px = customSize.sharedPx()
      return typeof px === 'number' ? `${formatFontPx(px)} px` : MIXED_LABEL
    },
    [customSize],
  )
  // The rung's own px, printed beside its name. WHY: "Extra large" is a type
  // role in stock tldraw, not a size — the same words render 44px on a Text
  // shape and 32px on a sticky note. Without the number the combobox reads
  // identical for two visibly different sizes, which is exactly the report
  // this answers. Null (mixed types, or a control that never bound one) simply
  // omits it rather than guessing.
  const currentValue = current?.value
  const readRungPx = control.rungPx
  const rungPx = useValue(
    'systemsketch trigger rung px',
    () => (currentValue !== undefined && readRungPx ? readRungPx(currentValue) : null),
    [readRungPx, currentValue],
  )
  return (
    <button
      {...buttonProps}
      ref={ref}
      type="button"
      className={['systemsketch-appearance__trigger', className].filter(Boolean).join(' ')}
      data-control={control.id}
      data-kind={control.kind}
      data-trigger={control.trigger}
      data-mixed={current ? undefined : true}
      aria-label={contextualTriggerLabel(control)}
      title={control.label}
    >
      {control.trigger === 'text' ? (
        <>
          <span className="systemsketch-appearance__trigger-text">
            {customPx ?? (current ? current.label : MIXED_LABEL)}
          </span>
          {customPx === null && rungPx !== null ? (
            <span className="systemsketch-appearance__trigger-px" data-testid="font-size-trigger-px">
              {formatFontPx(rungPx)}
            </span>
          ) : null}
        </>
      ) : isAutomaticContextualSelection(control) ? (
        <span className="systemsketch-appearance__automatic" aria-hidden="true">A</span>
      ) : (
        <TriggerGlyph control={control} value={current?.value} editor={editor} />
      )}
      <Chevron />
    </button>
  )
})

/**
 * The sections stacked above a control's own options, outermost last.
 *
 * WHY a chain rather than one `modeControl`: a shape's Stroke popover now
 * carries three sections — thickness, line style, palette — and they are all
 * the same relationship, each one placed `above` the next. Walking the chain
 * here means a new edge section is one link in the model and no new renderer.
 */
function stackedModes(control: ContextualControl): ContextualControl[] {
  const stack: ContextualControl[] = []
  let mode = control.modePlacement === 'above' ? control.modeControl : undefined
  while (mode) {
    stack.unshift(mode)
    mode = mode.modePlacement === 'above' ? mode.modeControl : undefined
  }
  return stack
}

function ControlPanel({
  control,
  editor,
  popoverMode,
}: {
  control: ContextualControl
  editor: Editor
  popoverMode: ContextualPopoverMode
}) {
  const mode = control.modeControl
  const beside = Boolean(mode) && control.modePlacement === 'beside'
  const options = control.automaticOption
    ? [control.automaticOption, ...control.options]
    : control.options
  // The Font size list gets FigJam's extra row: named presets, then a live
  // "Custom" px entry (same idiom as the Code width popover's exact field) —
  // but only where the surface bound a continuous channel for its own target.
  const customSize = control.customSize
  // When any participant carries a custom scale, the preset check marks are
  // withheld: `Medium` is not what is rendered, and a checked row would lie.
  const onPresetRungs = useValue(
    'systemsketch target on preset rungs',
    () => (customSize ? customSize.onPresetRungs() : true),
    [customSize],
  )
  return (
    <div
      className="systemsketch-appearance__panel"
      role="menu"
      aria-label={control.label}
      data-layout={control.layout}
      data-mode={mode ? control.modePlacement : undefined}
      data-testid={`systemsketch-appearance-panel-${control.id}`}
    >
      {(beside ? [mode!] : stackedModes(control)).map((section) => (
        <div
          key={section.id}
          className={beside ? 'systemsketch-appearance__group' : 'systemsketch-appearance__mode'}
          role="group"
          aria-label={section.label}
          data-mode-control={section.id}
          data-mode-layout={section.layout}
        >
          {section.options.map((option) => (
            <OptionButton
              key={option.value}
              control={section}
              option={option}
              editor={editor}
              // The same rule the main option group uses: a `row` is icons
              // only, anything else carries its name. That is what lets one
              // registered control render as labelled chips on a shape and as
              // a bare icon row beside a connector's line styles.
              withLabel={!beside && section.layout !== 'row'}
            />
          ))}
        </div>
      ))}
      {beside ? <span className="systemsketch-appearance__divider" aria-hidden="true" /> : null}
      <div
        className="systemsketch-appearance__options"
        role="group"
        aria-label={control.label}
        style={control.columns
          ? { gridTemplateColumns: `repeat(${control.columns}, ${SWATCH_SIZE}px)` }
          : undefined}
      >
        {options.map((option) => (
          <OptionButton
            key={option.value}
            control={control}
            option={option}
            editor={editor}
            withLabel={control.layout !== 'row' && control.layout !== 'swatches'}
            forceUnchecked={Boolean(customSize) && !onPresetRungs}
          />
        ))}
        {control.custom ? (
          <CustomColorCell control={control} editor={editor} popoverMode={popoverMode} />
        ) : null}
      </div>
      {customSize ? <CustomFontSizeCell binding={customSize} /> : null}
    </div>
  )
}

function OptionButton({
  control,
  option,
  editor,
  withLabel,
  forceUnchecked,
}: {
  control: ContextualControl
  option: { value: string; label: string }
  editor: Editor
  withLabel?: boolean
  /** A custom font scale is applied, so no preset row is truthfully current. */
  forceUnchecked?: boolean
}) {
  const isCurrent = !forceUnchecked
    && control.value?.type === 'shared' && control.value.value === option.value
  const list = control.layout === 'list'
  const rowSize = list && control.kind === 'size' ? FONT_SIZE_LADDER[option.value] : undefined
  const automatic = control.automaticOption?.value === option.value
  // The px this named row actually renders at for the bound target — see the
  // WHY on `rungPx` in `contextualControlRegistry.ts`. Read through `useValue`
  // because on the appearance pill it is a live reading of the selection.
  const readRungPx = control.rungPx
  const rungPx = useValue(
    'systemsketch option rung px',
    () => (readRungPx ? readRungPx(option.value) : null),
    [readRungPx, option.value],
  )
  return (
    <button
      type="button"
      className="systemsketch-appearance__option"
      data-control={control.id}
      data-kind={control.kind}
      data-value={option.value}
      role="menuitemradio"
      aria-checked={isCurrent}
      aria-label={option.label}
      title={option.label}
      onClick={() => control.onSelect(option.value)}
    >
      {list ? <FigjamGlyph name={FIGJAM_CHECK_ICON} className="systemsketch-appearance__check" /> : null}
      {automatic ? (
        <span className="systemsketch-appearance__automatic" aria-hidden="true">A</span>
      ) : (
        <AppearanceGlyph control={control} value={option.value} editor={editor} />
      )}
      {withLabel ? (
        <span
          className="systemsketch-appearance__label"
          style={rowSize
            ? { fontSize: `${rowSize}px`, lineHeight: rowSize <= 12 ? '16px' : '24px' }
            : undefined}
        >
          {option.label}
        </span>
      ) : null}
      {withLabel && rungPx !== null ? (
        <span className="systemsketch-appearance__label-px" data-testid={`size-row-px-${option.value}`}>
          {formatFontPx(rungPx)}
        </span>
      ) : null}
    </button>
  )
}

function CustomColorCell({
  control,
  editor,
  popoverMode,
}: {
  control: ContextualControl
  editor: Editor
  popoverMode: ContextualPopoverMode
}) {
  const current = control.value?.type === 'shared' ? control.value.value : undefined
  const active = isCustomColor(current) ? current : undefined
  const hex = useValue(
    `systemsketch contextual custom colour ${control.id}`,
    () => active ? registeredHex(editor, active) : undefined,
    [editor, active],
  )
  return (
    <ContextualPopover
      id={`systemsketch-contextual-${control.id}-custom`}
      mode={popoverMode}
      side="bottom"
      trigger={(
        <button
          type="button"
          className="systemsketch-appearance__custom"
          data-control={control.id}
          data-kind={control.kind}
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
      )}
    >
      <CustomColorPicker
        editor={editor}
        colorName={isAutomaticContextualSelection(control) ? undefined : current}
        showOpacity={Boolean(control.customColorOpacity)}
        onColorChange={(name) => control.onSelect(name, { continuous: true })}
      />
    </ContextualPopover>
  )
}

/**
 * FigJam's Custom row under the Font size presets: a live numeric field that
 * applies any exact pixel size to the whole bound target. The write mechanism
 * belongs to the binding (stock tldraw's per-shape `scale` for the appearance
 * pill — see `customFontSize.ts`); this cell only renders and relays, so it
 * works identically for any surface that binds its own target. The field
 * reuses the Code width popover's exact-entry idiom and CSS
 * (`.code-width-custom`), so the ONE size menu keeps one visual language.
 */
function CustomFontSizeCell({ binding }: { binding: ContextualCustomSize }) {
  const shared = useValue('systemsketch shared font px', () => binding.sharedPx(), [binding])
  const sharedText = typeof shared === 'number' ? formatFontPx(shared) : ''
  const [draft, setDraft] = useState(sharedText)
  useEffect(() => setDraft(sharedText), [sharedText])
  const commit = () => {
    const parsed = Number.parseFloat(draft)
    if (!Number.isFinite(parsed)) {
      setDraft(sharedText)
      return
    }
    binding.applyPx(parsed)
  }
  return (
    <label className="code-width-custom">
      <span>Custom</span>
      <input
        data-testid="font-size-custom"
        type="number"
        min={binding.minPx}
        max={binding.maxPx}
        step="1"
        value={draft}
        placeholder={shared === 'mixed' ? 'Mixed' : undefined}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
          }
        }}
      />
      <span className="code-width-custom__unit">px</span>
    </label>
  )
}

/**
 * The one disclosure every control in a contextual menu opens through.
 *
 * WHY exported: the Arrange cluster moved behind a trigger of its own
 * (`ArrangeControls.tsx`'s `ArrangeTrigger`, 2026-09-08) and needs exactly this
 * popover — stock `TldrawUiPopover*` in the pill, Radix while a canvas text
 * editor is live. Building it a second copy beside this one is how two menus
 * end up flipping, offsetting and portalling differently; the alternative of
 * reaching for `TldrawUiPopover*` directly from `ArrangeControls.tsx` would
 * also have put tldraw's React context into a module whose whole point is that
 * it renders with `renderToStaticMarkup` and no editor.
 */
export function ContextualPopover({
  id,
  mode,
  trigger,
  children,
  side,
}: {
  id: string
  mode: ContextualPopoverMode
  trigger: ReactNode
  children: ReactNode
  side: 'top' | 'bottom'
}) {
  return mode === 'editing' ? (
    <EditingPopover trigger={trigger} side={side}>{children}</EditingPopover>
  ) : (
    <TldrawUiPopover id={id}>
      <TldrawUiPopoverTrigger>{trigger}</TldrawUiPopoverTrigger>
      <TldrawUiPopoverContent
        side={side}
        align="center"
        sideOffset={POPOVER_GAP}
        collisionPadding={POPOVER_COLLISION_PADDING}
        autoFocusFirstButton={false}
      >
        {children}
      </TldrawUiPopoverContent>
    </TldrawUiPopover>
  )
}

/** Radix mode keeps a live canvas text editor open while its menu is used. */
function EditingPopover({
  trigger,
  children,
  side,
}: {
  trigger: ReactNode
  children: ReactNode
  side: 'top' | 'bottom'
}) {
  const container = useContainer()
  const editor = useEditor()
  return (
    <Popover.Root>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal container={container}>
        <Popover.Content
          className="tlui-popover__content"
          side={side}
          align="center"
          sideOffset={POPOVER_GAP}
          collisionPadding={POPOVER_COLLISION_PADDING}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onPointerDown={editor.markEventAsHandled}
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
