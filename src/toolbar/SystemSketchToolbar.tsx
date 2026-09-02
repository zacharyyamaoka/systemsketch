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
  TldrawUiInput,
  TldrawUiPopover,
  TldrawUiPopoverContent,
  TldrawUiPopoverTrigger,
  TldrawUiToolbarButton,
  createShapeId,
  useEditor,
  useTools,
  useValue,
  type TLGeoShape,
  type TLUiIconJsx,
  type TLUiToolItem,
} from 'tldraw'
import { useId, useMemo, useState, type ReactNode } from 'react'
import { BLOCK_TOOL_ID, PILL_TOOL_ID } from '../blocks'
import { PillIcon } from '../blocks/PillIcon'
import { BlockIcon } from '../blocks/BlockIcon'
import {
  selectDrawFamilyTool,
  selectShapeFamilyTool,
} from './toolbarIntegration'
import {
  arrowPresetPressCount,
  arrowPresetsInPressOrder,
  shapeToolForArrowPreset,
  useToolbarPreferences,
  type DrawFamilyTool,
  type ShapeFamilyTool,
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

interface LibraryItem {
  id: string
  label: string
  section: 'Basic' | 'Flowchart'
  geo: TLGeoShape['props']['geo']
  icon: string
  width?: number
  height?: number
}

const LIBRARY_ITEMS: readonly LibraryItem[] = [
  { id: 'rectangle', label: 'Rectangle', section: 'Basic', geo: 'rectangle', icon: 'geo-rectangle' },
  { id: 'ellipse', label: 'Ellipse', section: 'Basic', geo: 'ellipse', icon: 'geo-ellipse' },
  { id: 'triangle', label: 'Triangle', section: 'Basic', geo: 'triangle', icon: 'geo-triangle' },
  { id: 'diamond', label: 'Diamond', section: 'Basic', geo: 'diamond', icon: 'geo-diamond' },
  { id: 'hexagon', label: 'Hexagon', section: 'Basic', geo: 'hexagon', icon: 'geo-hexagon' },
  { id: 'star', label: 'Star', section: 'Basic', geo: 'star', icon: 'geo-star' },
  { id: 'cloud', label: 'Cloud', section: 'Basic', geo: 'cloud', icon: 'geo-cloud', width: 170 },
  { id: 'process', label: 'Process', section: 'Flowchart', geo: 'rectangle', icon: 'geo-rectangle', width: 190 },
  { id: 'decision', label: 'Decision', section: 'Flowchart', geo: 'diamond', icon: 'geo-diamond' },
  { id: 'terminator', label: 'Terminator', section: 'Flowchart', geo: 'oval', icon: 'geo-oval', width: 180, height: 80 },
  { id: 'data', label: 'Data', section: 'Flowchart', geo: 'rhombus', icon: 'geo-rhombus' },
  { id: 'manual-input', label: 'Manual input', section: 'Flowchart', geo: 'trapezoid', icon: 'geo-trapezoid', width: 180 },
  { id: 'cloud-service', label: 'Cloud service', section: 'Flowchart', geo: 'cloud', icon: 'geo-cloud', width: 180 },
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
  onActivate,
  children,
}: {
  family: 'shape' | 'draw'
  icon: string | TLUiIconJsx
  label: string
  active: boolean
  onActivate(): void
  children: ReactNode
}) {
  const menuId = `systemsketch-${family}-${useId()}`
  return (
    <TldrawUiDropdownMenuRoot id={menuId}>
      <div
        className="systemsketch-family-tool"
        data-family={family}
        data-value={`systemsketch-${family}`}
        data-isactive={active}
        aria-pressed={active}
        role="group"
        aria-label={`${label} family`}
      >
        <TldrawUiToolbarButton
          type="tool"
          className="systemsketch-family-tool__main"
          title={label}
          aria-pressed={active}
          isActive={active}
          data-testid={`systemsketch-tool-${family}`}
          onClick={onActivate}
        >
          <TldrawUiButtonIcon icon={icon} />
        </TldrawUiToolbarButton>
        <TldrawUiDropdownMenuTrigger>
          <TldrawUiToolbarButton
            type="icon"
            className="systemsketch-family-tool__menu"
            title={`More ${family} tools`}
            data-testid={`systemsketch-tool-${family}-menu`}
          >
            <TldrawUiButtonIcon icon="chevron-down" small />
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
      </div>
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
      onActivate={() => selectShapeFamilyTool(tools, current)}
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
      onActivate={() => selectDrawFamilyTool(tools, current)}
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

function LibraryTile({ item, onInsert }: { item: LibraryItem; onInsert(item: LibraryItem): void }) {
  return (
    <button
      type="button"
      className="systemsketch-library-tile"
      title={`Insert ${item.label}`}
      data-testid={`systemsketch-library-${item.id}`}
      onClick={() => onInsert(item)}
    >
      <TldrawUiButtonIcon icon={item.icon} />
      <span>{item.label}</span>
    </button>
  )
}

function LibrarySlot() {
  const editor = useEditor()
  const popoverId = `systemsketch-library-${useId()}`
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLowerCase()
  const filtered = useMemo(
    () => LIBRARY_ITEMS.filter((item) => item.label.toLowerCase().includes(normalizedQuery)),
    [normalizedQuery],
  )

  const insertItem = (item: LibraryItem) => {
    const id = createShapeId()
    const center = editor.getViewportPageBounds().center
    const width = item.width ?? 150
    const height = item.height ?? 100
    editor.run(() => {
      editor.markHistoryStoppingPoint(`insert_library_shape:${item.id}`)
      editor.createShape<TLGeoShape>({
        id,
        type: 'geo',
        x: center.x - width / 2,
        y: center.y - height / 2,
        props: { geo: item.geo, w: width, h: height },
      })
      editor.setCurrentTool('select')
      editor.select(id)
    })
    editor.menus.clearOpenMenus()
    setIsOpen(false)
    setQuery('')
  }

  const setOpen = (open: boolean) => {
    if (!open) editor.menus.clearOpenMenus()
    setIsOpen(open)
    if (!open) setQuery('')
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
          <TldrawUiInput
            autoFocus
            autoSelect
            className="systemsketch-library-search"
            aria-label="Search shapes"
            placeholder="Search shapes"
            value={query}
            onValueChange={setQuery}
            onCancel={() => setOpen(false)}
          />
          <div className="systemsketch-library-panel__body">
            {(['Basic', 'Flowchart'] as const).map((section) => {
              const items = filtered.filter((item) => item.section === section)
              if (items.length === 0) return null
              return (
                <section key={section}>
                  <h3>{section}</h3>
                  <div className="systemsketch-library-grid">
                    {items.map((item) => <LibraryTile key={item.id} item={item} onInsert={insertItem} />)}
                  </div>
                </section>
              )
            })}
            {filtered.length === 0 ? (
              <div className="systemsketch-library-empty">
                <TldrawUiButtonIcon icon="question-mark-circle" />
                <strong>No matching shapes</strong>
                <span>Try rectangle, decision, or cloud.</span>
              </div>
            ) : null}
          </div>
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
    <DefaultToolbar minItems={4} maxItems={8} minSizePx={255} maxSizePx={430}>
      <SimpleToolSlot tool={tools.select} fallbackIcon="tool-pointer" title="Cursor" active={activeToolId === 'select'} />
      <SimpleToolSlot tool={tools.frame} fallbackIcon="tool-frame" title="Frame" active={activeToolId === 'frame'} />
      <SimpleToolSlot tool={tools[BLOCK_TOOL_ID]} fallbackIcon={<BlockIcon />} title="Block" active={activeToolId === BLOCK_TOOL_ID} />
      <SimpleToolSlot tool={tools[PILL_TOOL_ID]} fallbackIcon={<PillIcon />} title="Pill" active={activeToolId === PILL_TOOL_ID} />
      <ShapeFamilySlot activeToolId={activeToolId} geo={geo} />
      <DrawFamilySlot activeToolId={activeToolId} />
      <SimpleToolSlot tool={tools.text} fallbackIcon="tool-text" title="Text" active={activeToolId === 'text'} />
      <LibrarySlot />
    </DefaultToolbar>
  )
}
