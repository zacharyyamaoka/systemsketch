import { TldrawUiButtonIcon, useEditor, useTools } from 'tldraw'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { useChrome } from '../chrome/ChromeProvider'
import { useInterfaceScale } from '../settings/interfaceScale'
import { LibrarySearchModal, type LibrarySearchItem } from './LibrarySearchModal'
import { activateShapeLibraryTool } from './shapeLibraryTool'
import {
  TOOL_SEARCH_ALIAS_ITEMS,
  filterToolSearchItems,
  toolSearchItemId,
  toolSearchItemLabel,
  type ToolSearchItem,
} from './toolSearchCatalog'
import {
  PRIMITIVE_SEARCH_MAX_RESULTS,
  PRIMITIVE_SEARCH_WIDTH,
  isChromeShortcutTarget,
  isEditableShortcutTarget,
  isPrimitiveSearchKey,
  placePrimitiveSearch,
  primitiveSearchPanelHeight,
  type PrimitiveSearchPoint,
} from './primitiveSearchModel'
import { useToolAliases } from './toolAliases'

interface PrimitiveSearchInvocation {
  screenPoint: PrimitiveSearchPoint
}

function toolbarObstacleTop(editorContainer: HTMLElement, viewportHeight: number): number {
  const toolbarButton = document.querySelector<HTMLElement>('[data-testid="systemsketch-tool-library"]')
  const toolbar = toolbarButton?.closest<HTMLElement>('.tlui-main-toolbar') ?? toolbarButton
  if (!toolbar) return viewportHeight
  const containerBounds = editorContainer.getBoundingClientRect()
  const toolbarBounds = toolbar.getBoundingClientRect()
  const top = toolbarBounds.top - containerBounds.top
  return top > 0 && top < viewportHeight ? top : viewportHeight
}

/**
 * A tool-only sibling to the command palette, anchored to the pointer.
 *
 * WHY: S is about choosing what to draw where the user is already looking.
 * Reusing the centred command modal would destroy that Fusion-style spatial
 * promise; inserting immediately would steal the final placement gesture.
 *
 * The chrome itself now lives in `LibrarySearchModal`, which the Behaviors
 * panel shares; this file keeps what is specific to tools — the `S` shortcut,
 * its guards, the product-toolbar catalog, and arming the chosen tool.
 */
export function PrimitiveSearch() {
  const editor = useEditor()
  const tools = useTools()
  const { toolbarSurface } = useChrome()
  const interfaceScale = useInterfaceScale()
  const aliases = useToolAliases()
  const [invocation, setInvocation] = useState<PrimitiveSearchInvocation | null>(null)
  const [query, setQuery] = useState('')
  const [layoutRevision, setLayoutRevision] = useState(0)

  const matches = useMemo(
    () => filterToolSearchItems(query, aliases, new Set(Object.keys(tools))),
    [aliases, query, tools],
  )
  // Identity is the catalog id, so the row test ids stay
  // `systemsketch-primitive-search-<item.id>` exactly as before.
  const rows = useMemo<LibrarySearchItem[]>(() => matches.map((match) => ({
    id: toolSearchItemId(match),
    label: toolSearchItemLabel(match),
    detail: match.source === 'library' ? match.item.section : 'Tools',
    icon: <TldrawUiButtonIcon icon={match.source === 'library'
      ? match.item.icon
      : tools[match.item.toolId]?.icon ?? 'tool-pointer'} />,
    aliases: aliases[toolSearchItemId(match)] ?? [],
  })), [aliases, matches])

  const close = useCallback(() => {
    setInvocation(null)
    setQuery('')
    editor.focus()
  }, [editor])

  const choose = useCallback((row: LibrarySearchItem) => {
    const match: ToolSearchItem | undefined = matches.find((item) => toolSearchItemId(item) === row.id)
    if (match?.source === 'library') activateShapeLibraryTool(tools, match.item)
    else if (match?.source === 'toolbar') tools[match.item.toolId]?.onSelect('toolbar')
    close()
  }, [close, matches, tools])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (invocation || toolbarSurface || !isPrimitiveSearchKey(event)) return
      if (!editor.getIsFocused() || editor.getIsReadonly()) return
      if (editor.getEditingShapeId() || editor.inputs.getIsDragging()) return
      if (editor.menus.getOpenMenus().length > 0) return
      if (isEditableShortcutTarget(event.target) || isEditableShortcutTarget(document.activeElement)) return
      if (isChromeShortcutTarget(event.target) || isChromeShortcutTarget(document.activeElement)) return

      event.preventDefault()
      event.stopImmediatePropagation()
      const screenPoint = editor.inputs.getCurrentScreenPoint()
      setQuery('')
      setInvocation({
        screenPoint: { x: screenPoint.x, y: screenPoint.y },
      })
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [editor, invocation, toolbarSurface])

  useEffect(() => {
    if (!invocation) return
    const relayout = () => setLayoutRevision((current) => current + 1)
    window.addEventListener('resize', relayout)
    return () => window.removeEventListener('resize', relayout)
  }, [invocation])

  if (!invocation) return null

  const viewport = editor.getViewportScreenBounds()
  const chromeScale = interfaceScale / 100
  const desiredHeight = primitiveSearchPanelHeight(matches.length)
  const placement = placePrimitiveSearch(
    invocation.screenPoint,
    // `screenPoint` and the viewport are canvas pixels while the panel is
    // chrome. Place its scaled painted bounds, then let the modal cancel the
    // host zoom before re-applying it around this fixed point.
    { w: PRIMITIVE_SEARCH_WIDTH * chromeScale, h: desiredHeight * chromeScale },
    { w: viewport.w, h: viewport.h },
    toolbarObstacleTop(editor.getContainer(), viewport.h),
  )
  void layoutRevision

  return (
    <LibrarySearchModal
      items={rows}
      query={query}
      onQueryChange={setQuery}
      maxResults={PRIMITIVE_SEARCH_MAX_RESULTS}
      target={invocation.screenPoint}
      placement={placement}
      viewportScale={chromeScale}
      keyChip="S"
      ariaLabel="Search tools"
      listAriaLabel="Matching tools"
      inputAriaLabel="Search tools"
      placeholder={`Search ${TOOL_SEARCH_ALIAS_ITEMS.length} tools`}
      noun={{ one: 'tool', many: 'tools' }}
      verb="arm"
      idleTitle="Tool search"
      idleHint="Type a toolbar tool, shape, or connection name."
      emptyTitle="No matching tools"
      emptyHint="Try block, type, arrow, rectangle, decision, or cloud."
      itemAriaLabel={(row) => `Use ${row.label} tool`}
      onChoose={choose}
      onClose={close}
    />
  )
}
