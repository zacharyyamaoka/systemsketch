import {
  DefaultToolbar,
  GeoShapeGeoStyle,
  TldrawUiButton,
  TldrawUiButtonIcon,
  TldrawUiButtonLabel,
  TldrawUiDropdownMenuContent,
  TldrawUiDropdownMenuItem,
  TldrawUiDropdownMenuRoot,
  TldrawUiDropdownMenuTrigger,
  TldrawUiPopover,
  TldrawUiPopoverContent,
  TldrawUiPopoverTrigger,
  TldrawUiToolbarButton,
  useEditor,
  useTools,
  useValue,
  type TLUiIconJsx,
  type TLUiToolItem,
} from 'tldraw'
import { useId, useState, type ReactNode } from 'react'
import { BLOCK_TOOL_ID, PILL_TOOL_ID } from '../blocks'
import { PillIcon } from '../blocks/PillIcon'
import { BlockIcon } from '../blocks/BlockIcon'
import { BRANCH_TOOL_ID, BranchIcon } from '../branch'
import { ShapeLibraryBrowser } from '../library/ShapeLibraryBrowser'
import {
  selectDrawFamilyTool,
  selectShapeFamilyTool,
  selectSystemFamilyTool,
} from './toolbarIntegration'
import {
  arrowPresetPressCount,
  arrowPresetsInPressOrder,
  shapeToolForArrowPreset,
  useToolbarPreferences,
  type DrawFamilyTool,
  type ShapeFamilyTool,
  type SystemFamilyTool,
} from './toolbarModel'
import './systemsketch-toolbar.css'

interface ShapeMenuItem {
  id: ShapeFamilyTool
  label: string
  icon: string | TLUiIconJsx
  shortcut?: string
}

const GEO_MENU_ITEMS: readonly ShapeMenuItem[] = [
  { id: 'rectangle', label: 'Rectangle', icon: 'geo-rectangle', shortcut: 'R' },
  { id: 'ellipse', label: 'Ellipse', icon: 'geo-ellipse', shortcut: 'O' },
  { id: 'triangle', label: 'Triangle', icon: 'geo-triangle' },
  { id: 'diamond', label: 'Diamond', icon: 'geo-diamond' },
  { id: 'line', label: 'Line', icon: 'tool-line', shortcut: 'L' },
]

const ARROW_LABELS = {
  straight: { label: 'Straight arrow', icon: 'tool-arrow' },
  curve: { label: 'Curved arrow', icon: 'arrow-arc' },
  elbow: { label: 'Elbow arrow', icon: 'arrow-elbow' },
} as const

/**
 * The arrows, listed in the order A walks them and labelled with how many
 * presses that is. Both come from the cycle itself, so the rows stay honest
 * when the starting preset moves — it now starts on Elbow, which is also the
 * shape a new data edge takes.
 */
const ARROW_MENU_ITEMS: readonly ShapeMenuItem[] = arrowPresetsInPressOrder().map((preset) => {
  const count = arrowPresetPressCount(preset)
  return {
    id: shapeToolForArrowPreset(preset),
    ...ARROW_LABELS[preset],
    shortcut: count === 1 ? 'A' : `A × ${count}`,
  }
})

const SHAPE_MENU_ITEMS: readonly ShapeMenuItem[] = [...GEO_MENU_ITEMS, ...ARROW_MENU_ITEMS]

const DRAW_MENU_ITEMS: ReadonlyArray<{
  id: DrawFamilyTool
  label: string
  icon: string
  shortcut: string
}> = [
  { id: 'draw', label: 'Pen', icon: 'tool-pencil', shortcut: 'D' },
  { id: 'highlight', label: 'Highlighter', icon: 'tool-highlight', shortcut: '⇧ D' },
]

const SHAPE_BY_ID = Object.fromEntries(SHAPE_MENU_ITEMS.map((item) => [item.id, item])) as Record<
  ShapeFamilyTool,
  ShapeMenuItem
>

/**
 * The system-design family: the semantic things a system sketch is made of.
 * Block keeps B; Branch has no key yet and lives one click deeper on purpose,
 * because it is used far less often than a Block and Zach wants the toolbar,
 * not the right-click menu, to be where that muscle memory forms.
 */
const SYSTEM_MENU_ITEMS: ReadonlyArray<{
  id: SystemFamilyTool
  label: string
  icon: TLUiIconJsx
  shortcut?: string
}> = [
  { id: BLOCK_TOOL_ID, label: 'Block', icon: <BlockIcon />, shortcut: 'B' },
  { id: BRANCH_TOOL_ID, label: 'Branch', icon: <BranchIcon /> },
  // A pill is a variable: a literal argument, a named result, or both. P.
  { id: PILL_TOOL_ID, label: 'Pill', icon: <PillIcon />, shortcut: 'P' },
]

function isSupportedShapeTool(value: string | undefined): value is ShapeFamilyTool {
  return value !== undefined && value in SHAPE_BY_ID
}

function ToolMenuItem({
  icon,
  label,
  shortcut,
  selected,
  onSelect,
}: {
  icon: string | TLUiIconJsx
  label: string
  shortcut?: string
  selected: boolean
  onSelect(): void
}) {
  return (
    <TldrawUiDropdownMenuItem>
      <TldrawUiButton
        type="menu"
        className="systemsketch-tool-menu__item"
        data-isactive={selected}
        onClick={onSelect}
      >
        <TldrawUiButtonIcon icon={icon} small />
        <TldrawUiButtonLabel>{label}</TldrawUiButtonLabel>
        {shortcut ? <kbd>{shortcut}</kbd> : null}
        <span className="systemsketch-tool-menu__check" aria-hidden="true">
          {selected ? '✓' : ''}
        </span>
      </TldrawUiButton>
    </TldrawUiDropdownMenuItem>
  )
}

function SimpleToolSlot({
  tool,
  fallbackIcon,
  title,
  active,
  disabledTitle,
}: {
  tool: TLUiToolItem | undefined
  fallbackIcon: string | TLUiIconJsx
  title: string
  active: boolean
  disabledTitle?: string
}) {
  const disabled = !tool
  return (
    <TldrawUiToolbarButton
      type="tool"
      className="systemsketch-toolbar-tool"
      title={disabled ? disabledTitle ?? `${title} is unavailable` : title}
      data-value={`systemsketch-${title.toLowerCase()}`}
      data-testid={`systemsketch-tool-${title.toLowerCase()}`}
      aria-pressed={active}
      isActive={active}
      disabled={disabled}
      onClick={() => tool?.onSelect('toolbar')}
    >
      <TldrawUiButtonIcon icon={tool?.icon ?? fallbackIcon} />
    </TldrawUiToolbarButton>
  )
}

function FamilyToolSlot({
  family,
  icon,
  label,
  active,
  onSelect,
  children,
}: {
  family: 'shape' | 'draw' | 'system'
  icon: string | TLUiIconJsx
  label: string
  active: boolean
  onSelect(): void
  children: ReactNode
}) {
  const menuId = `systemsketch-${family}-${useId()}`
  return (
    <TldrawUiDropdownMenuRoot id={menuId}>
      <TldrawUiDropdownMenuTrigger>
        <TldrawUiToolbarButton
          type="tool"
          className="systemsketch-family-tool"
          title={`${label} · Open ${family} tools`}
          data-family={family}
          data-value={`systemsketch-${family}`}
          aria-pressed={active}
          isActive={active}
          data-testid={`systemsketch-tool-${family}`}
          onPointerDown={(event) => {
            if (event.button === 0) onSelect()
          }}
          onClick={(event) => {
            // Pointer activation already happened before Radix opened the menu,
            // which lets the menu keep focus and preserve one-press Escape.
            if (event.detail === 0) onSelect()
          }}
        >
          <TldrawUiButtonIcon icon={icon} />
          <span className="systemsketch-family-tool__chevron" aria-hidden="true">
            <TldrawUiButtonIcon icon="chevron-down" small />
          </span>
        </TldrawUiToolbarButton>
      </TldrawUiDropdownMenuTrigger>
      <TldrawUiDropdownMenuContent
        side="top"
        align="center"
        sideOffset={11}
        alignOffset={0}
        collisionPadding={12}
        className="systemsketch-tool-menu"
      >
        {children}
      </TldrawUiDropdownMenuContent>
    </TldrawUiDropdownMenuRoot>
  )
}

function ShapeFamilySlot({ activeToolId, geo }: { activeToolId: string; geo?: string }) {
  const tools = useTools()
  const preferences = useToolbarPreferences()
  let current = preferences.lastShapeTool
  if (activeToolId === 'line') current = 'line'
  if (activeToolId === 'arrow') current = `arrow-${preferences.lastArrowPreset}`
  if (activeToolId === 'geo' && isSupportedShapeTool(geo)) current = geo
  const currentItem = SHAPE_BY_ID[current]
  const isActive = activeToolId === 'geo' || activeToolId === 'line' || activeToolId === 'arrow'

  return (
    <FamilyToolSlot
      family="shape"
      icon={currentItem.icon}
      label={`${currentItem.label} · R O L A`}
      active={isActive}
      onSelect={() => selectShapeFamilyTool(tools, current)}
    >
      <div className="systemsketch-tool-menu__heading">Shapes</div>
      {GEO_MENU_ITEMS.map((item) => (
        <ToolMenuItem
          key={item.id}
          {...item}
          selected={current === item.id}
          onSelect={() => selectShapeFamilyTool(tools, item.id)}
        />
      ))}
      <div className="systemsketch-tool-menu__separator" role="separator" />
      <div className="systemsketch-tool-menu__heading">Arrows · repeat A to cycle</div>
      {ARROW_MENU_ITEMS.map((item) => (
        <ToolMenuItem
          key={item.id}
          {...item}
          selected={current === item.id}
          onSelect={() => selectShapeFamilyTool(tools, item.id)}
        />
      ))}
    </FamilyToolSlot>
  )
}

function SystemFamilySlot({ activeToolId }: { activeToolId: string }) {
  const tools = useTools()
  const preferences = useToolbarPreferences()
  const current: SystemFamilyTool = activeToolId === BRANCH_TOOL_ID
    ? BRANCH_TOOL_ID
    : activeToolId === BLOCK_TOOL_ID
      ? BLOCK_TOOL_ID
      : activeToolId === PILL_TOOL_ID
        ? PILL_TOOL_ID
        : preferences.lastSystemTool
  const currentItem = SYSTEM_MENU_ITEMS.find((item) => item.id === current) ?? SYSTEM_MENU_ITEMS[0]
  const isActive = activeToolId === BLOCK_TOOL_ID
    || activeToolId === BRANCH_TOOL_ID
    || activeToolId === PILL_TOOL_ID

  return (
    <FamilyToolSlot
      family="system"
      icon={currentItem.icon}
      label={currentItem.shortcut ? `${currentItem.label} · ${currentItem.shortcut}` : currentItem.label}
      active={isActive}
      onSelect={() => selectSystemFamilyTool(tools, current)}
    >
      <div className="systemsketch-tool-menu__heading">System design</div>
      {SYSTEM_MENU_ITEMS.map((item) => (
        <ToolMenuItem
          key={item.id}
          icon={item.icon}
          label={item.label}
          shortcut={item.shortcut}
          selected={current === item.id}
          onSelect={() => selectSystemFamilyTool(tools, item.id)}
        />
      ))}
    </FamilyToolSlot>
  )
}

function DrawFamilySlot({ activeToolId }: { activeToolId: string }) {
  const tools = useTools()
  const preferences = useToolbarPreferences()
  const current = activeToolId === 'highlight' ? 'highlight' : preferences.lastDrawTool
  const currentItem = DRAW_MENU_ITEMS.find((item) => item.id === current) ?? DRAW_MENU_ITEMS[0]
  const isActive = activeToolId === 'draw' || activeToolId === 'highlight'

  return (
    <FamilyToolSlot
      family="draw"
      icon={currentItem.icon}
      label={`${currentItem.label} · ${currentItem.shortcut}`}
      active={isActive}
      onSelect={() => selectDrawFamilyTool(tools, current)}
    >
      <div className="systemsketch-tool-menu__heading">Drawing</div>
      {DRAW_MENU_ITEMS.map((item) => (
        <ToolMenuItem
          key={item.id}
          {...item}
          selected={current === item.id}
          onSelect={() => selectDrawFamilyTool(tools, item.id)}
        />
      ))}
    </FamilyToolSlot>
  )
}

function LibrarySlot() {
  const editor = useEditor()
  const popoverId = `systemsketch-library-${useId()}`
  const [isOpen, setIsOpen] = useState(false)

  const setOpen = (open: boolean) => {
    if (!open) editor.menus.clearOpenMenus()
    setIsOpen(open)
  }

  return (
    <TldrawUiPopover id={popoverId} open={isOpen} onOpenChange={setOpen} className="systemsketch-library-popover">
      <TldrawUiPopoverTrigger>
        <TldrawUiToolbarButton
          type="tool"
          className="systemsketch-library-trigger"
          title="Library"
          data-value="systemsketch-library"
          data-testid="systemsketch-tool-library"
          aria-pressed={isOpen}
          isActive={isOpen}
        >
          <TldrawUiButtonIcon icon="plus" />
        </TldrawUiToolbarButton>
      </TldrawUiPopoverTrigger>
      <TldrawUiPopoverContent
        side="top"
        align="end"
        sideOffset={12}
        collisionPadding={12}
        autoFocusFirstButton={false}
      >
        <aside
          className="systemsketch-library-panel"
          aria-label="Shape library"
          data-testid="systemsketch-library-panel"
          onWheel={(event) => event.stopPropagation()}
        >
          <header className="systemsketch-library-panel__header">
            <div><span>Library</span><h2>Shapes</h2></div>
            <TldrawUiButton type="icon" title="Close library" onClick={() => setOpen(false)}>
              <TldrawUiButtonIcon icon="cross-2" small />
            </TldrawUiButton>
          </header>
          <ShapeLibraryBrowser
            autoFocus
            onCancel={() => setOpen(false)}
            onInserted={() => setOpen(false)}
          />
        </aside>
      </TldrawUiPopoverContent>
    </TldrawUiPopover>
  )
}

/**
 * P1: project seven Figma-style families through tldraw's public DefaultToolbar.
 *
 * P2 remains a deliberate shell-only escape hatch: if DefaultToolbar's extra
 * chrome or responsive DOM becomes constraining, replace this composition with
 * an owned TldrawUiToolbar. Keep toolbarModel, tool overrides, Curve side effect,
 * library catalog, and tests unchanged.
 */
export function SystemSketchFigmaToolbar() {
  const editor = useEditor()
  const tools = useTools()
  const activeToolId = useValue(
    'systemsketch active tool',
    () => editor.getCurrentToolId(),
    [editor],
  )
  const geo = useValue(
    'systemsketch active geo',
    () => editor.getSharedStyles().getAsKnownValue(GeoShapeGeoStyle),
    [editor],
  )

  return (
    <DefaultToolbar minItems={4} maxItems={7} minSizePx={255} maxSizePx={380}>
      <SimpleToolSlot tool={tools.select} fallbackIcon="tool-pointer" title="Cursor" active={activeToolId === 'select'} />
      <SimpleToolSlot tool={tools.frame} fallbackIcon="tool-frame" title="Frame" active={activeToolId === 'frame'} />
      {/* Block, Branch and Pill share this slot, the way the stock shapes share theirs. */}
      <SystemFamilySlot activeToolId={activeToolId} />
      <ShapeFamilySlot activeToolId={activeToolId} geo={geo} />
      <DrawFamilySlot activeToolId={activeToolId} />
      <SimpleToolSlot tool={tools.text} fallbackIcon="tool-text" title="Text" active={activeToolId === 'text'} />
      <LibrarySlot />
    </DefaultToolbar>
  )
}
